/**
 * Điều khiển OBS qua obs-websocket v5 (có sẵn trong OBS 28+: Tools → WebSocket Server Settings).
 * Dùng để tự dừng phát (StopStream) khi tới giờ hẹn tắt live.
 *
 * Cấu hình (địa chỉ + mật khẩu) lưu riêng ở data/obs.json — không nằm trong cài đặt phòng
 * nên không bao giờ gửi xuống màn hình live hay trang quản lý.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');
const config = require('../config');

const CONFIG_FILE = path.join(config.DATA_DIR, 'obs.json');
const DEFAULT_URL = 'ws://127.0.0.1:4455';

function readConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { url: c.url || DEFAULT_URL, password: c.password || '' };
  } catch (_) {
    return { url: DEFAULT_URL, password: '' };
  }
}

/** Thông tin hiển thị cho admin (không trả mật khẩu) */
function getConfig() {
  const c = readConfig();
  return { url: c.url, hasPassword: Boolean(c.password) };
}

function setConfig({ url, password } = {}) {
  const cur = readConfig();
  const next = { ...cur };
  if (url !== undefined) {
    const u = String(url).trim() || DEFAULT_URL;
    if (!/^wss?:\/\/[\w.\-]+(:\d{2,5})?\/?$/.test(u)) throw new Error('Địa chỉ không hợp lệ — ví dụ ws://127.0.0.1:4455');
    next.url = u;
  }
  if (password !== undefined && password !== null) next.password = String(password);
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  return getConfig();
}

const sha256b64 = (s) => crypto.createHash('sha256').update(s).digest('base64');

/** Mở kết nối, xác thực, gửi một yêu cầu rồi đóng. Trả về responseData. */
function request(requestType, requestData = {}, { timeoutMs = 8000 } = {}) {
  const { url, password } = readConfig();
  return new Promise((resolve, reject) => {
    let done = false;
    const ws = new WebSocket(url);
    const finish = (err, data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch (_) {}
      if (err) reject(err);
      else resolve(data);
    };
    const timer = setTimeout(() => finish(new Error('OBS không phản hồi — kiểm tra OBS đang mở và đã bật WebSocket Server')), timeoutMs);
    ws.on('error', () => finish(new Error(`Không kết nối được OBS tại ${url} — mở OBS → Tools → WebSocket Server Settings → Enable`)));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (_) { return; }
      if (msg.op === 0) {
        // Hello → Identify (kèm xác thực nếu OBS đặt mật khẩu)
        const identify = { rpcVersion: 1 };
        const auth = msg.d && msg.d.authentication;
        if (auth) {
          if (!password) return finish(new Error('OBS yêu cầu mật khẩu WebSocket — nhập mật khẩu trong phần cài đặt'));
          identify.authentication = sha256b64(sha256b64(password + auth.salt) + auth.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d: identify }));
      } else if (msg.op === 2) {
        ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: 'r1', requestData } }));
      } else if (msg.op === 7 && msg.d && msg.d.requestId === 'r1') {
        const st = msg.d.requestStatus || {};
        if (st.result) finish(null, msg.d.responseData || {});
        else finish(new Error(st.comment || `OBS từ chối lệnh ${requestType} (mã ${st.code})`));
      }
    });
    ws.on('close', (code) => {
      if (code === 4009) finish(new Error('Sai mật khẩu WebSocket của OBS'));
      else finish(new Error('OBS đã đóng kết nối'));
    });
  });
}

/** Kiểm tra kết nối: trả về trạng thái phát hiện tại */
async function test() {
  const st = await request('GetStreamStatus');
  return { ok: true, streaming: Boolean(st.outputActive), durationMs: st.outputDuration || 0 };
}

async function stopStream() {
  const st = await request('GetStreamStatus');
  if (!st.outputActive) return { ok: true, note: 'OBS không đang phát' };
  await request('StopStream');
  return { ok: true };
}

module.exports = { getConfig, setConfig, test, stopStream };
