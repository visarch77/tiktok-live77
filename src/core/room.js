const { ViewerBoard } = require('./viewers');
const { TikTokSource } = require('./tiktokSource');
const { loadRoomState, RoomStateWriter } = require('./store');

// Cài đặt chung cho mọi phòng; chế độ chơi có thể thêm khoá riêng qua settingsSchema / defaultSettings
const CORE_SETTINGS_SCHEMA = {
  ttsEnabled: 'boolean',
  bgMusicEnabled: 'boolean',
  sfxEnabled: 'boolean',
  autoSim: 'boolean',
  ttsVoice: 'voice',
  autoSimIntervalMs: [2000, 600000],
  musicVolume: [0, 1],
  ttsVolume: [0, 1]
};

const CORE_DEFAULT_SETTINGS = {
  ttsEnabled: true,
  ttsVoice: 'maichi',
  bgMusicEnabled: true,
  sfxEnabled: true,
  autoSim: false,
  autoSimIntervalMs: 9500
};

const MAX_RECENT_EVENTS = 35;

// Nhạc nền: "preset:<id>" (nhạc thiền tự tạo) hoặc "file:<tên file>" trong public/music
function isTrack(v) {
  return /^preset:[a-z]{2,20}$/.test(v) || /^file:[\p{L}\p{N} ._()\-]{1,100}\.(mp3|m4a|ogg|wav|webm|opus)$/iu.test(v);
}

// Chỉ nhận các khoá cài đặt đã biết, đúng kiểu và trong khoảng hợp lệ
function sanitizeSettings(params, schema) {
  const out = {};
  for (const [key, rule] of Object.entries(schema)) {
    if (!params || !(key in params)) continue;
    const val = params[key];
    if (rule === 'boolean') {
      if (typeof val === 'boolean') out[key] = val;
    } else if (rule === 'track') {
      const v = String(val || '').trim();
      if (isTrack(v)) out[key] = v;
    } else if (rule === 'trackList') {
      // Danh sách phát: các bài hợp lệ, tối đa 40 bài
      if (Array.isArray(val)) out[key] = val.map((x) => String(x || '').trim()).filter(isTrack).slice(0, 40);
    } else if (rule === 'voice') {
      const v = String(val || '').trim().toLowerCase();
      if (/^[a-z0-9_-]{1,32}$/.test(v)) out[key] = v;
    } else if (Array.isArray(rule)) {
      const n = Number(val);
      if (Number.isFinite(n)) out[key] = Math.max(rule[0], Math.min(rule[1], n));
    } else if (rule && rule.type === 'enum') {
      if (rule.values.includes(val)) out[key] = val;
    } else if (rule && rule.type === 'intList') {
      // Danh sách số nguyên (ví dụ lịch xoay vòng bài kinh): lọc theo khoảng, tối đa `max` phần tử
      if (Array.isArray(val)) {
        out[key] = val
          .map((x) => Math.round(Number(x)))
          .filter((x) => Number.isFinite(x) && x >= rule.min && x <= rule.maxValue)
          .slice(0, rule.max || 50);
      }
    }
  }
  return out;
}

/**
 * Một phòng Live: 1 tài khoản TikTok + 1 chế độ chơi + trạng thái & bảng xếp hạng riêng.
 */
class Room {
  /**
   * @param {{id: string, name: string, mode: string, tiktokUsername?: string, autoConnect?: boolean}} config
   * @param {{modeDef: object, tts: import('./tts').ZeroTTSManager, broadcast: (roomId: string, method: string, params: any) => void}} deps
   */
  constructor(config, { modeDef, tts, broadcast }) {
    this.id = config.id;
    this.name = config.name || config.id;
    this.modeId = modeDef.id;
    this.modeDef = modeDef;
    this.tiktokUsername = config.tiktokUsername || '';
    this.autoConnect = config.autoConnect !== false;
    this.tts = tts;
    this.broadcastFn = broadcast;
    this.disposed = false;

    const saved = loadRoomState(this.id);
    this.settingsSchema = { ...CORE_SETTINGS_SCHEMA, ...(modeDef.settingsSchema || {}) };
    this.settings = {
      ...CORE_DEFAULT_SETTINGS,
      ...(modeDef.defaultSettings || {}),
      ...sanitizeSettings(saved.settings || {}, this.settingsSchema)
    };
    this.board = new ViewerBoard(saved.viewers);
    this.recentEvents = [];
    this.writer = new RoomStateWriter(this.id, () => this.serialize());
    this.stateBroadcastTimer = null;
    this.autoSimTimer = null;

    this.source = new TikTokSource(this.id);
    this.source.on('event', (evt) => this.handleEvent(evt));
    this.source.on('status', (status) => {
      // Giả lập người xem tạo tương tác giả: tự tắt ngay khi phòng kết nối live thật
      if (status.connected && this.settings.autoSim) {
        console.warn(`[Room ${this.id}] Tắt giả lập người xem vì phòng đang kết nối TikTok Live thật`);
        this.configureAutoSim(false);
        this.save();
      }
      // Báo chế độ chơi lúc vừa lên live thật (vd. dọn người ảo còn đứng trên sân)
      if (status.connected && !this.wasLive && typeof this.mode.onLiveConnected === 'function') {
        try {
          this.mode.onLiveConnected();
        } catch (err) {
          console.error(`[Room ${this.id}] Lỗi onLiveConnected:`, err);
        }
      }
      this.wasLive = Boolean(status.connected);
      this.scheduleStateBroadcast(150);
    });
    this.source.on('viewerCount', (viewerCount) => this.broadcast('room.viewerCount', { viewerCount }));

    // Đổi chế độ chơi: giữ bảng xếp hạng người xem nhưng bỏ trạng thái riêng của chế độ cũ
    const modeState = !saved.mode || saved.mode === modeDef.id ? saved.modeState || {} : {};
    this.mode = modeDef.create(this.createContext(), modeState);
  }

  // Những gì một chế độ chơi được phép dùng (xem src/modes/README.md)
  createContext() {
    const room = this;
    return {
      roomId: room.id,
      get settings() {
        return room.settings;
      },
      board: room.board,
      tts: room.tts,
      emitEvent: (evt) => room.emitEvent(evt),
      save: () => room.save(),
      broadcastState: () => room.broadcastState(),
      scheduleStateBroadcast: () => room.scheduleStateBroadcast(),
      broadcast: (method, params) => room.broadcast(method, params),
      updateSettings: (params) => room.updateSettings(params),
      viewerCount: () => (room.source && room.source.status ? Number(room.source.status.viewerCount) || 0 : 0),
      isLive: () => room.isLiveConnected(),
      // Chạy fn như một tương tác giả lập (sự kiện được gắn simulated: true) — cho các hoạt động hẹn giờ
      simulated: (fn) => {
        const prev = room.simulating;
        room.simulating = true;
        try {
          return fn();
        } finally {
          room.simulating = prev;
        }
      }
    };
  }

  // --------------------------------------------------------------------------
  // Phát / lưu trạng thái
  // --------------------------------------------------------------------------
  broadcast(method, params) {
    if (this.disposed) return;
    this.broadcastFn(this.id, method, params);
  }

  broadcastState() {
    clearTimeout(this.stateBroadcastTimer);
    this.stateBroadcastTimer = null;
    this.broadcast('room.state', this.getPublicState());
  }

  // Gộp các lần phát toàn bộ state (người vào phòng, đổi trạng thái kết nối...) lại
  scheduleStateBroadcast(delayMs = 1000) {
    if (this.stateBroadcastTimer || this.disposed) return;
    this.stateBroadcastTimer = setTimeout(() => this.broadcastState(), delayMs);
  }

  save() {
    this.writer.schedule();
  }

  serialize() {
    return {
      mode: this.modeId,
      settings: this.settings,
      viewers: this.board.toJSON(),
      modeState: typeof this.mode.serialize === 'function' ? this.mode.serialize() : {}
    };
  }

  /**
   * Ghi nhận một sự kiện hiển thị (nghi lễ, ghi điểm...) và gửi tới mọi màn hình của phòng.
   * Nếu sự kiện có ttsText thì tổng hợp giọng đọc ngay để lúc client hỏi /api/tts đã có sẵn.
   */
  emitEvent(evt) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...evt
    };
    if (event.ttsText && !event.ttsVoice) event.ttsVoice = this.settings.ttsVoice;
    if (this.simulating) event.simulated = true;
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) this.recentEvents.length = MAX_RECENT_EVENTS;

    this.save();
    if (event.ttsText && this.settings.ttsEnabled !== false && this.tts && this.tts.ready) {
      this.tts.synthesize(event.ttsText, event.ttsVoice).catch(() => {});
    }
    const state = this.getPublicState();
    clearTimeout(this.stateBroadcastTimer);
    this.stateBroadcastTimer = null;
    this.broadcast('room.event', { event, state });
    return { event, state };
  }

  getPublicState() {
    return {
      room: {
        id: this.id,
        name: this.name,
        mode: this.modeId,
        modeName: this.modeDef.name
      },
      ...this.mode.getPublicState(),
      recentEvents: this.recentEvents.slice(0, 15),
      settings: this.settings,
      tiktok: this.source.status,
      tts: this.tts ? this.tts.getStatus(this.settings.ttsVoice) : { ready: false, status: 'init', voice: 'maichi' }
    };
  }

  getSummary() {
    return {
      id: this.id,
      name: this.name,
      mode: this.modeId,
      modeName: this.modeDef.name,
      tiktokUsername: this.tiktokUsername,
      autoConnect: this.autoConnect,
      viewers: this.board.size,
      autoSim: Boolean(this.settings.autoSim),
      tiktok: this.source.status,
      overlayUrl: `/room/${encodeURIComponent(this.id)}`
    };
  }

  // --------------------------------------------------------------------------
  // Sự kiện TikTok -> chế độ chơi
  // --------------------------------------------------------------------------
  handleEvent(evt) {
    if (this.disposed || !evt) return null;
    try {
      return this.mode.onEvent(evt) || null;
    } catch (err) {
      console.error(`[Room ${this.id}] Lỗi chế độ ${this.modeId} khi xử lý ${evt.type}:`, err);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Kết nối TikTok & giả lập
  // --------------------------------------------------------------------------
  async connect(usernameOrUrl) {
    const target = usernameOrUrl || this.tiktokUsername;
    const status = await this.source.connect(target);
    return status;
  }

  disconnect() {
    return this.source.disconnect();
  }

  isLiveConnected() {
    return Boolean(this.source.status.connected);
  }

  configureAutoSim(enabled, was = Boolean(this.settings.autoSim)) {
    this.settings.autoSim =
      Boolean(enabled) && typeof this.mode.simulate === 'function' && !this.isLiveConnected();
    if (was !== this.settings.autoSim && typeof this.mode.onAutoSimChange === 'function') {
      this.mode.onAutoSimChange(this.settings.autoSim);
    }
    clearInterval(this.autoSimTimer);
    this.autoSimTimer = null;
    if (this.settings.autoSim) {
      const step = () => {
        try {
          this.simulating = true;
          this.mode.simulate();
        } catch (err) {
          console.error(`[Room ${this.id}] Lỗi giả lập:`, err);
        } finally {
          this.simulating = false;
        }
      };
      step();
      this.autoSimTimer = setInterval(step, this.settings.autoSimIntervalMs || 9500);
    }
  }

  updateSettings(params = {}) {
    const prevInterval = this.settings.autoSimIntervalMs;
    const prevAutoSim = Boolean(this.settings.autoSim);
    const clean = sanitizeSettings(params, this.settingsSchema);
    // TikTok coi lượt dâng quà / bảng xếp hạng ảo trên phòng đang live là tương tác giả (fake engagement)
    if (clean.autoSim === true && this.isLiveConnected()) {
      throw new Error('Không bật được giả lập người xem khi phòng đang live thật (TikTok coi là tương tác giả). Ngắt kết nối TikTok trước khi chạy thử.');
    }
    this.settings = { ...this.settings, ...clean };
    if (typeof clean.autoSim === 'boolean') {
      this.configureAutoSim(clean.autoSim, prevAutoSim);
    } else if (this.settings.autoSim && this.settings.autoSimIntervalMs !== prevInterval) {
      this.configureAutoSim(true);
    }
    if (typeof this.mode.onSettingsChanged === 'function') {
      this.mode.onSettingsChanged(clean);
    }
    this.save();
    this.broadcastState();
    return this.getPublicState();
  }

  start() {
    if (this.settings.autoSim) this.configureAutoSim(true);
    if (this.autoConnect && this.tiktokUsername) {
      this.connect().catch((err) => {
        console.warn(`[Room ${this.id}] Chưa kết nối được @${this.tiktokUsername}:`, err.message);
      });
    }
  }

  // --------------------------------------------------------------------------
  // JSON-RPC theo phòng
  // --------------------------------------------------------------------------
  /**
   * Tên lệnh: "room.<x>", "live.<x>", hoặc "<modeId>.<x>" (ví dụ temple.burnIncense).
   * Các lệnh chung (getState, updateSettings, comment, speak, ttsStatus) gọi được bằng cả
   * "room." lẫn "<modeId>." để tương thích các tích hợp cũ (temple.getState, temple.comment...).
   */
  async rpc(method, params = {}) {
    const dot = method.indexOf('.');
    const ns = dot > 0 ? method.slice(0, dot) : '';
    const name = dot > 0 ? method.slice(dot + 1) : method;

    if (ns === 'live') {
      if (name === 'connect') return this.connect(params.username);
      if (name === 'disconnect') return this.disconnect();
      if (name === 'setAutoSim') return this.updateSettings({ autoSim: Boolean(params.enabled) });
    }

    if (ns === 'room' || ns === this.modeId) {
      switch (name) {
        case 'getState':
          return this.getPublicState();
        case 'updateSettings':
          return this.updateSettings(params);
        case 'comment':
          return this.handleEvent({
            type: 'chat',
            user: { user: params.user, uniqueId: params.uniqueId || '', avatar: params.avatar || '' },
            text: String(params.comment || '')
          });
        case 'speak': {
          const text = String(params.text || '').slice(0, 300);
          const res = await this.tts.synthesize(text, params.voice || this.settings.ttsVoice);
          if (res.ok && params.broadcast !== false) {
            this.broadcast('tts.play', { text, voice: res.voice, url: res.url });
          }
          return res;
        }
        case 'ttsStatus':
          return this.tts.getStatus(this.settings.ttsVoice);
        default:
          break;
      }
    }

    if (ns === this.modeId || ns === 'mode') {
      const handler = this.mode.rpc && Object.prototype.hasOwnProperty.call(this.mode.rpc, name) && this.mode.rpc[name];
      if (typeof handler === 'function') {
        return handler(params);
      }
    }

    throw new Error(`Phòng "${this.id}" (chế độ ${this.modeId}) không hỗ trợ lệnh: ${method}`);
  }

  flushSync() {
    this.writer.flushSync();
  }

  dispose({ archive = false } = {}) {
    this.flushSync();
    this.disposed = true;
    clearInterval(this.autoSimTimer);
    clearTimeout(this.stateBroadcastTimer);
    this.source.dispose();
    if (typeof this.mode.dispose === 'function') {
      try { this.mode.dispose(); } catch (_) {}
    }
    this.writer.dispose({ archive });
  }
}

module.exports = { Room, sanitizeSettings, CORE_SETTINGS_SCHEMA };
