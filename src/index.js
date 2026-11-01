const fs = require('fs');
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const music = require('./core/musicLibrary');
const { ZeroTTSManager } = require('./core/tts');
const { RoomManager } = require('./core/roomManager');
const { Hub } = require('./core/hub');
const { MODES } = require('./modes');

fs.mkdirSync(config.TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// BẢO MẬT: chỉ localhost (và CORS_ORIGINS) được gọi RPC / mở WebSocket
// ============================================================================
function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true; // curl, Streamer.bot, TikFinity, file://
  if (config.EXTRA_ORIGINS.includes('*') || config.EXTRA_ORIGINS.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch (_) {
    return false;
  }
}

function isAllowedWsOrigin(origin, host) {
  if (isAllowedOrigin(origin)) return true;
  try {
    return new URL(origin).host === host; // mở qua IP LAN của chính máy chủ
  } catch (_) {
    return false;
  }
}

// ============================================================================
// KHỞI TẠO DỊCH VỤ
// ============================================================================
let hub = null;
const tts = new ZeroTTSManager({
  onStatus: () => {
    if (!hub) return;
    for (const room of rooms.rooms.values()) {
      hub.broadcastRoom(room.id, 'tts.status', tts.getStatus(room.settings.ttsVoice));
    }
  }
});

const rooms = new RoomManager({
  tts,
  broadcast: (roomId, method, params) => {
    if (hub) hub.broadcastRoom(roomId, method, params);
  }
});
rooms.load();

// ============================================================================
// JSON-RPC 2.0 DISPATCHER
// ============================================================================
/**
 * Lệnh toàn cục: rooms.list / rooms.create / rooms.update / rooms.delete / modes.list
 * Lệnh theo phòng: mọi lệnh khác, chọn phòng bằng params.roomId (mặc định "main").
 */
async function handleRpc(method, params = {}, defaultRoomId = config.DEFAULT_ROOM_ID) {
  switch (method) {
    case 'rooms.list':
      return rooms.list();
    case 'rooms.create':
      return rooms.create(params);
    case 'rooms.update':
      return rooms.update(params.id, params);
    case 'rooms.delete':
      return rooms.remove(params.id);
    case 'modes.list':
      return rooms.modes();
    // Nhạc nền riêng: nhập từ link YouTube (chạy nền), xem tiến trình, xoá
    case 'music.importYoutube':
      return music.importYoutube(params.url);
    case 'music.jobs':
      return { jobs: music.jobList(), files: music.list() };
    case 'music.delete':
      return music.remove(params.file);
    default: {
      const room = rooms.require(params.roomId || defaultRoomId);
      return room.rpc(method, params);
    }
  }
}

// ============================================================================
// EXPRESS + WEBSOCKET SERVER
// ============================================================================
const app = express();
app.use(cors({ origin: (origin, cb) => cb(null, isAllowedOrigin(origin)) }));
app.use(express.json({ limit: '64kb' }));
app.use('/tts-cache', express.static(config.TTS_CACHE_DIR, { maxAge: '7d' }));

function sendOverlay(res, room) {
  const overlay = room.modeDef.overlay || 'index.html';
  res.sendFile(path.join(config.PUBLIC_DIR, overlay));
}

// Màn hình phòng mặc định giữ nguyên địa chỉ cũ: http://localhost:3000 (và ?obs=1)
app.get('/', (req, res, next) => {
  const room = rooms.get(req.query.room || config.DEFAULT_ROOM_ID) || rooms.rooms.values().next().value;
  if (!room) return next();
  sendOverlay(res, room);
});

app.get('/room/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).send(`Không tìm thấy phòng "${req.params.id}". Tạo phòng tại /admin`);
  sendOverlay(res, room);
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(config.PUBLIC_DIR, 'admin.html'));
});

// Ảnh nhân vật, lễ vật, nền: ít khi đổi — cho trình duyệt / OBS lưu đệm để không tải lại mỗi lần đổi khung hình
app.use('/assets', express.static(path.join(config.PUBLIC_DIR, 'assets'), { maxAge: '1d' }));
app.use(express.static(config.PUBLIC_DIR, { index: false }));

app.post('/rpc', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};
  if (!method) {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC Request: thiếu method' }
    });
  }
  try {
    const result = await handleRpc(method, params || {});
    res.json({ jsonrpc: jsonrpc || '2.0', id: id ?? null, result });
  } catch (err) {
    res.status(200).json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code: -32000, message: err.message || 'Server error' }
    });
  }
});

// ZeroTTS HTTP Endpoint (giọng theo phòng nếu có roomId)
app.all('/api/tts', async (req, res) => {
  const text = String(req.body?.text || req.query?.text || '').trim().slice(0, 500);
  const room = rooms.get(req.body?.roomId || req.query?.roomId);
  const voice = String(req.body?.voice || req.query?.voice || room?.settings.ttsVoice || 'maichi').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  res.json(await tts.synthesize(text, voice));
});

app.get('/api/state', (req, res) => {
  const room = rooms.get(req.query.room || config.DEFAULT_ROOM_ID);
  if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
  res.json(room.getPublicState());
});

// Danh sách nhạc nền riêng (public/music) để chọn trong trang quản lý
app.get('/api/music', (_req, res) => {
  res.json({ files: music.list() });
});

app.get('/api/rooms', (_req, res) => {
  res.json({ rooms: rooms.list(), modes: rooms.modes() });
});

const server = http.createServer(app);
hub = new Hub(server, {
  verifyOrigin: isAllowedWsOrigin,
  resolveRoom: (requested) => {
    if (requested) return rooms.get(requested) ? requested : null;
    return rooms.get(config.DEFAULT_ROOM_ID) ? config.DEFAULT_ROOM_ID : null;
  },
  getInitialState: (roomId) => rooms.require(roomId).getPublicState(),
  handleRpc: (method, params, roomId) => handleRpc(method, params, roomId || config.DEFAULT_ROOM_ID)
});

server.listen(config.PORT, () => {
  const base = `http://localhost:${config.PORT}`;
  console.log('============================================================');
  console.log('🪷 TIKTOK LIVE ROOMS ĐÃ KHỞI ĐỘNG');
  console.log(`🎛️ Quản lý phòng & RPC Admin : ${base}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint     : ${base}/rpc (ws://localhost:${config.PORT}/ws?room=<id>)`);
  console.log(`🧩 Chế độ có sẵn             : ${Object.values(MODES).map((m) => `${m.id} (${m.name})`).join(', ')}`);
  for (const r of rooms.list()) {
    console.log(`📺 Phòng "${r.id}" [${r.modeName}] @${r.tiktokUsername || '—'} : ${base}${r.overlayUrl}  (OBS: ?obs=1)`);
  }
  console.log('============================================================');
  rooms.startAll();
});

server.on('error', (err) => {
  console.error(`[Server] Không mở được cổng ${config.PORT}:`, err.message);
  shutdown(1);
});

// Tắt server an toàn: lưu trạng thái mọi phòng ngay lập tức và dừng worker Python
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[Server] Đang lưu trạng thái các phòng và tắt...');
  try {
    rooms.disposeAll();
  } catch (err) {
    console.error('[Server] Lỗi khi đóng phòng:', err.message);
  }
  tts.stop();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('unhandledRejection', (err) => {
  console.warn('[Server] Unhandled rejection:', err?.message || err);
});
