const { EventEmitter } = require('events');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const { extractUser, GiftComboTracker, LikeBatcher } = require('./normalize');
const { EULER_API_KEY } = require('../config');

if (!EULER_API_KEY) {
  console.warn('[TikTok] Chưa đặt EULER_API_KEY: dùng Euler Stream ẩn danh (~100 lượt ký/ngày), dễ bị giới hạn khi chạy nhiều phòng.');
}

function isTikTokHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'tiktok.com' || h.endsWith('.tiktok.com');
}

async function resolveTikTokUsername(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Vui lòng nhập @username hoặc link TikTok Live cần kết nối');
  }
  if (input.startsWith('http://') || input.startsWith('https://') || input.includes('tiktok.com/')) {
    const urlToFetch = input.startsWith('http') ? input : `https://${input}`;
    const directMatch = urlToFetch.match(/tiktok\.com\/@([^/?#]+)/i);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }
    // Chỉ theo link rút gọn của chính TikTok (vt.tiktok.com, vm.tiktok.com...), có timeout
    let parsed = null;
    try {
      parsed = new URL(urlToFetch);
    } catch (_) {}
    if (parsed && isTikTokHost(parsed.hostname)) {
      try {
        const resp = await fetch(parsed.href, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
        const resolvedMatch = (resp.url || '').match(/tiktok\.com\/@([^/?#]+)/i);
        if (resolvedMatch && resolvedMatch[1]) {
          return resolvedMatch[1];
        }
      } catch (e) {
        console.warn('[TikTok URL Resolve Warning]', e.message);
      }
    }
    throw new Error('Không đọc được @username từ link TikTok này');
  }
  return input.replace(/^@/, '').split(/[/?#\s]/)[0].trim();
}

/**
 * Một kết nối TikTok Live cho một phòng. Phát ra:
 *   'event'  (sự kiện đã chuẩn hoá, xem normalize.js)
 *   'status' (trạng thái kết nối: connected / connecting / username / roomId / viewerCount / lastError)
 *   'viewerCount' (số mắt xem hiện tại)
 * Tự kết nối lại khi rớt mạng / streamer chưa lên sóng, trừ khi người dùng bấm Ngắt.
 */
class TikTokSource extends EventEmitter {
  constructor(label = '') {
    super();
    this.label = label;
    this.conn = null;
    this.manualDisconnect = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.gifts = new GiftComboTracker();
    this.likes = new LikeBatcher((evt) => this.emit('event', evt));
    this.status = {
      connected: false,
      connecting: false,
      username: '',
      roomId: null,
      viewerCount: 0,
      lastError: null
    };
  }

  log(...args) {
    console.log(`[TikTok ${this.label}]`, ...args);
  }

  setStatus(patch) {
    Object.assign(this.status, patch);
    this.emit('status', this.status);
  }

  scheduleReconnect(username) {
    if (this.manualDisconnect || this.reconnectTimer || !username) return;
    const delay = Math.min(120000, 10000 * 2 ** Math.min(this.reconnectAttempts, 4));
    this.reconnectAttempts += 1;
    this.log(`Thử kết nối lại @${username} sau ${Math.round(delay / 1000)}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.manualDisconnect || this.status.connected || this.status.connecting) return;
      this.connect(username, { auto: true }).catch(() => {});
    }, delay);
  }

  async connect(usernameOrUrl, { auto = false } = {}) {
    const cleanUser = await resolveTikTokUsername(usernameOrUrl);
    if (!cleanUser) {
      throw new Error('Không tìm thấy @username hợp lệ từ dữ liệu nhập vào');
    }

    if (!auto) {
      this.manualDisconnect = false;
      this.reconnectAttempts = 0;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    if (this.conn) {
      const old = this.conn;
      this.conn = null;
      try {
        await old.disconnect();
      } catch (_) {}
    }

    this.status = {
      connected: false,
      connecting: true,
      username: cleanUser,
      roomId: null,
      viewerCount: 0,
      lastError: null
    };
    this.emit('status', this.status);

    // processInitialData: false -> kết nối lại không phát lại bình luận/quà cũ (tránh cộng trùng)
    const conn = new TikTokLiveConnection(cleanUser, {
      processInitialData: false,
      fetchRoomInfoOnConnect: false,
      enableExtendedGiftInfo: false,
      ...(EULER_API_KEY ? { signApiKey: EULER_API_KEY } : {})
    });
    this.conn = conn;

    // Bỏ qua sự kiện từ kết nối cũ đã bị thay thế
    const on = (evt, handler) => {
      conn.on(evt, (...args) => {
        if (this.conn !== conn) return;
        try {
          handler(...args);
        } catch (err) {
          console.warn(`[TikTok ${this.label}] Lỗi xử lý sự kiện ${evt}:`, err.message);
        }
      });
    };
    const emitEvent = (evt) => this.emit('event', evt);

    on(ControlEvent.CONNECTED, (roomState) => {
      this.reconnectAttempts = 0;
      this.log(`Đã kết nối phòng @${cleanUser} (roomId: ${roomState?.roomId || conn.roomId || '?'})`);
      this.setStatus({
        connected: true,
        connecting: false,
        roomId: roomState?.roomId || conn.roomId || null,
        lastError: null
      });
    });

    on(ControlEvent.DISCONNECTED, () => {
      this.log(`Đã ngắt kết nối @${cleanUser}`);
      this.likes.flush();
      this.setStatus({ connected: false, connecting: false, viewerCount: 0 });
      this.scheduleReconnect(cleanUser);
    });

    on(ControlEvent.ERROR, (err) => {
      const msg = err?.info || err?.message || String(err);
      console.warn(`[TikTok ${this.label} Warning]`, msg);
      this.setStatus({ lastError: msg });
    });

    on(WebcastEvent.ROOM_USER, (data) => {
      const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
      if (viewerCount > 0 && viewerCount !== this.status.viewerCount) {
        this.status.viewerCount = viewerCount;
        this.emit('viewerCount', viewerCount);
      }
    });

    on(WebcastEvent.MEMBER, (data) => emitEvent({ type: 'join', user: extractUser(data) }));

    on(WebcastEvent.CHAT, (data) => {
      emitEvent({ type: 'chat', user: extractUser(data), text: String(data?.content || data?.comment || '') });
    });

    on(WebcastEvent.LIKE, (data) => {
      const count = Math.min(15, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1) || 1));
      this.likes.add(extractUser(data), count);
    });

    on(WebcastEvent.FOLLOW, (data) => emitEvent({ type: 'follow', user: extractUser(data) }));
    on(WebcastEvent.SHARE, (data) => emitEvent({ type: 'share', user: extractUser(data) }));
    // Thư viện chỉ phát SOCIAL khi không nhận ra follow/share qua displayText.key
    on(WebcastEvent.SOCIAL, (data) => {
      const action = String(data?.action || '');
      const key = String(data?.common?.displayText?.key || data?.displayType || '').toLowerCase();
      if (action === '1' || key.includes('follow')) emitEvent({ type: 'follow', user: extractUser(data) });
      else if (action === '3' || key.includes('share')) emitEvent({ type: 'share', user: extractUser(data) });
    });

    on(WebcastEvent.GIFT, (data) => {
      const evt = this.gifts.normalize(data);
      if (evt) emitEvent(evt);
    });

    try {
      const roomState = await conn.connect();
      if (this.conn !== conn) return this.status;
      this.reconnectAttempts = 0;
      this.setStatus({
        connected: true,
        connecting: false,
        roomId: roomState?.roomId || conn.roomId || null
      });
      return this.status;
    } catch (err) {
      const message = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
      if (this.conn === conn) {
        this.conn = null;
        this.setStatus({ connected: false, connecting: false, lastError: message });
        this.scheduleReconnect(cleanUser);
      }
      throw new Error(message);
    }
  }

  disconnect() {
    this.manualDisconnect = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.likes.flush();
    if (this.conn) {
      const old = this.conn;
      this.conn = null;
      Promise.resolve()
        .then(() => old.disconnect())
        .catch(() => {});
    }
    this.setStatus({ connected: false, connecting: false, viewerCount: 0 });
    return this.status;
  }

  dispose() {
    this.disconnect();
    this.likes.dispose();
    this.removeAllListeners();
  }
}

module.exports = { TikTokSource, resolveTikTokUsername };
