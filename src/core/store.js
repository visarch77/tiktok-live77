const fs = require('fs');
const path = require('path');
const { ROOMS_DIR, ROOMS_FILE, LEGACY_STATE_FILE, DEFAULT_ROOM_ID, DEFAULT_TIKTOK_USER } = require('../config');

fs.mkdirSync(ROOMS_DIR, { recursive: true });

function readJson(file) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`[Store] Không đọc được ${path.basename(file)}:`, e.message);
  }
  return null;
}

function writeJsonSync(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  fs.renameSync(tmp, file);
}

async function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data), 'utf8');
  await fs.promises.rename(tmp, file);
}

// ----------------------------------------------------------------------------
// Danh sách phòng (data/rooms.json)
// ----------------------------------------------------------------------------
function loadRoomConfigs() {
  const saved = readJson(ROOMS_FILE);
  if (Array.isArray(saved) && saved.length > 0) return saved;
  // Lần đầu chạy: tạo phòng mặc định "main" (chế độ Đi Chùa) như phiên bản 1 phòng trước đây
  return [
    {
      id: DEFAULT_ROOM_ID,
      name: 'Chùa Linh Ứng',
      mode: 'temple',
      tiktokUsername: DEFAULT_TIKTOK_USER,
      autoConnect: true
    }
  ];
}

function saveRoomConfigs(configs) {
  try {
    writeJsonSync(ROOMS_FILE, configs);
  } catch (e) {
    console.error('[Store] Lỗi lưu rooms.json:', e.message);
  }
}

// ----------------------------------------------------------------------------
// Trạng thái từng phòng (data/rooms/<id>.json)
// ----------------------------------------------------------------------------
function roomStateFile(roomId) {
  return path.join(ROOMS_DIR, `${roomId}.json`);
}

function loadRoomState(roomId) {
  const saved = readJson(roomStateFile(roomId));
  if (saved) return saved;
  // Chuyển dữ liệu từ bản 1 phòng (merit-state.json) sang phòng mặc định
  if (roomId === DEFAULT_ROOM_ID) {
    const legacy = readJson(LEGACY_STATE_FILE);
    if (legacy) {
      console.log('[Store] Chuyển dữ liệu merit-state.json cũ sang phòng "main"');
      const { devotees, settings, ...modeState } = legacy;
      return { settings: settings || {}, viewers: devotees || {}, modeState };
    }
  }
  return {};
}

/**
 * Lưu trạng thái theo kiểu throttle (không phải debounce): live liên tục có tim/bình luận
 * thì debounce sẽ bị reset mãi và không bao giờ lưu. Ghi file tạm rồi rename để tránh hỏng file.
 */
class RoomStateWriter {
  constructor(roomId, serialize) {
    this.file = roomStateFile(roomId);
    this.serialize = serialize;
    this.timer = null;
    this.saving = false;
    this.disposed = false;
  }

  schedule() {
    if (this.timer || this.disposed) return;
    this.timer = setTimeout(async () => {
      this.timer = null;
      if (this.saving) {
        this.schedule();
        return;
      }
      this.saving = true;
      try {
        await writeJson(this.file, this.serialize());
      } catch (e) {
        console.error(`[Store] Lỗi lưu ${path.basename(this.file)}:`, e.message);
      } finally {
        this.saving = false;
      }
    }, 1500);
  }

  flushSync() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.disposed) return;
    try {
      writeJsonSync(this.file, this.serialize());
    } catch (e) {
      console.error(`[Store] Lỗi lưu ${path.basename(this.file)}:`, e.message);
    }
  }

  dispose({ archive = false } = {}) {
    clearTimeout(this.timer);
    this.timer = null;
    this.disposed = true;
    // Xoá phòng không xoá hẳn dữ liệu: đổi tên file để có thể khôi phục bảng xếp hạng khi cần
    if (archive && fs.existsSync(this.file)) {
      const archived = this.file.replace(/\.json$/, `.deleted-${Date.now()}.json`);
      fs.promises.rename(this.file, archived).catch(() => {});
    }
  }
}

module.exports = {
  loadRoomConfigs,
  saveRoomConfigs,
  loadRoomState,
  RoomStateWriter
};
