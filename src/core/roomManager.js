const { Room } = require('./room');
const { loadRoomConfigs, saveRoomConfigs } = require('./store');
const { sanitizeRoomId } = require('../util/sanitize');
const { MODES, listModes } = require('../modes');

const MAX_ROOMS = 20;

/**
 * Quản lý toàn bộ phòng Live: tạo / sửa / xoá, lưu danh sách vào data/rooms.json.
 */
class RoomManager {
  constructor({ tts, broadcast }) {
    this.tts = tts;
    this.broadcast = broadcast;
    this.rooms = new Map();
  }

  load() {
    for (const cfg of loadRoomConfigs()) {
      try {
        this.addRoom(this.validate(cfg, { isNew: true }), { persist: false });
      } catch (err) {
        console.error(`[Rooms] Bỏ qua phòng "${cfg?.id}":`, err.message);
      }
    }
    this.persist();
  }

  startAll() {
    for (const room of this.rooms.values()) room.start();
  }

  validate(input = {}, { isNew = false, current = null } = {}) {
    const id = current ? current.id : sanitizeRoomId(input.id || input.name);
    if (!id) throw new Error('Mã phòng không hợp lệ (chỉ dùng chữ thường, số, dấu - và _)');
    if (isNew && this.rooms.has(id)) throw new Error(`Đã có phòng mã "${id}"`);

    const mode = input.mode ?? current?.modeId ?? Object.keys(MODES)[0];
    if (!MODES[mode]) throw new Error(`Không có chế độ "${mode}"`);

    const name = String(input.name ?? current?.name ?? id).trim().slice(0, 60) || id;
    const tiktokUsername = String(input.tiktokUsername ?? current?.tiktokUsername ?? '')
      .trim()
      .replace(/^@/, '')
      .slice(0, 200);
    const autoConnect = typeof input.autoConnect === 'boolean' ? input.autoConnect : current ? current.autoConnect : true;
    return { id, name, mode, tiktokUsername, autoConnect };
  }

  addRoom(cfg, { persist = true } = {}) {
    const room = new Room(cfg, {
      modeDef: MODES[cfg.mode],
      tts: this.tts,
      broadcast: this.broadcast
    });
    this.rooms.set(room.id, room);
    if (persist) this.persist();
    return room;
  }

  persist() {
    saveRoomConfigs(
      [...this.rooms.values()].map((r) => ({
        id: r.id,
        name: r.name,
        mode: r.modeId,
        tiktokUsername: r.tiktokUsername,
        autoConnect: r.autoConnect
      }))
    );
  }

  get(id) {
    return this.rooms.get(String(id || ''));
  }

  require(id) {
    const room = this.get(id);
    if (!room) throw new Error(`Không tìm thấy phòng "${id}"`);
    return room;
  }

  list() {
    return [...this.rooms.values()].map((r) => r.getSummary());
  }

  create(input) {
    if (this.rooms.size >= MAX_ROOMS) throw new Error(`Tối đa ${MAX_ROOMS} phòng`);
    const cfg = this.validate(input, { isNew: true });
    const room = this.addRoom(cfg);
    room.start();
    return room.getSummary();
  }

  /**
   * Sửa tên / tài khoản TikTok / tự kết nối. Đổi chế độ chơi sẽ tạo lại phòng
   * (bảng xếp hạng người xem được giữ, trạng thái riêng của chế độ cũ thì không).
   */
  update(id, input = {}) {
    const room = this.require(id);
    const cfg = this.validate(input, { current: room });
    const usernameChanged = cfg.tiktokUsername !== room.tiktokUsername;

    if (cfg.mode !== room.modeId) {
      const wasConnected = room.source.status.connected || room.source.status.connecting;
      room.flushSync();
      room.dispose();
      this.rooms.delete(id);
      const next = this.addRoom(cfg);
      if (wasConnected || cfg.autoConnect) next.start();
      // báo màn hình đang mở (OBS / điện thoại): phòng đã sang trò khác → màn hình tự tải lại đúng trò mới
      next.broadcastState();
      return next.getSummary();
    }

    room.name = cfg.name;
    room.tiktokUsername = cfg.tiktokUsername;
    room.autoConnect = cfg.autoConnect;
    this.persist();
    if (usernameChanged && cfg.tiktokUsername && (room.source.status.connected || room.source.status.connecting || cfg.autoConnect)) {
      room.connect().catch(() => {});
    }
    room.broadcastState();
    return room.getSummary();
  }

  remove(id) {
    const room = this.require(id);
    room.dispose({ archive: true });
    this.rooms.delete(id);
    this.persist();
    return { ok: true, id };
  }

  modes() {
    return listModes();
  }

  flushAll() {
    for (const room of this.rooms.values()) room.flushSync();
  }

  disposeAll() {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}

module.exports = { RoomManager };
