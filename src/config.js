const path = require('path');

const ROOT = path.join(__dirname, '..');
// Có thể trỏ sang thư mục dữ liệu khác (chạy thử, nhiều bản cài trên cùng máy) bằng biến DATA_DIR
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');

module.exports = {
  ROOT,
  PORT: Number(process.env.PORT) || 3000,
  DATA_DIR,
  ROOMS_DIR: path.join(DATA_DIR, 'rooms'),
  ROOMS_FILE: path.join(DATA_DIR, 'rooms.json'),
  LEGACY_STATE_FILE: path.join(DATA_DIR, 'merit-state.json'),
  TTS_CACHE_DIR: path.join(DATA_DIR, 'tts-cache'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  TTS_WORKER: path.join(ROOT, 'tts_worker.py'),
  DEFAULT_ROOM_ID: 'main',
  DEFAULT_TIKTOK_USER: process.env.TIKTOK_USER || 'zenfacts_vn',
  // Khoá API Euler Stream (dịch vụ ký kết nối TikTok Live). Không có khoá: chỉ ~100 lượt ký/ngày,
  // không đủ cho nhiều phòng. Mua tại https://www.eulerstream.com rồi đặt biến môi trường EULER_API_KEY.
  EULER_API_KEY: process.env.EULER_API_KEY || '',
  // Thêm origin khác (ngoài localhost) được gọi RPC qua biến môi trường CORS_ORIGINS (cách nhau dấu phẩy)
  EXTRA_ORIGINS: String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
};
