/**
 * Giọng Edge TTS cho Lớp Học Chữ (giống bản gốc lop-hoc-chu): tạo 1 câu chỉ mất ~1 giây (ZeroTTS mất 10 giây trở lên)
 * và có giọng tiếng Anh thật cho đoạn "E:". Cần mạng (dịch vụ đọc của Microsoft Edge, không cần khoá API).
 * File mp3 lưu chung thư mục tts-cache (server phục vụ ở /tts-cache): cùng câu + cùng giọng + cùng tốc độ thì dùng lại.
 * Gọi lần lượt từng câu (không mở nhiều kết nối cùng lúc), lỗi thì thử lại tối đa 3 lần.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TTS_CACHE_DIR } = require('../../config');

// Giọng theo vai trong lời thoại: M = nam, F = cô giáo (nữ), E = tiếng Anh (giọng bé gái Mỹ, như bản gốc)
const VOICES = { M: 'vi-VN-NamMinhNeural', F: 'vi-VN-HoaiMyNeural', E: 'en-US-AnaNeural' };
const PITCH = '+6%'; // cao hơn một chút cho tươi (bản gốc)
const KBPS = 96; // AUDIO_24KHZ_96KBITRATE_MONO_MP3: tốc độ bit cố định nên tính được độ dài từ số byte
const TIMEOUT_MS = 20000;
const TRIES = 3;

let lib = null;
function loadLib() {
  if (!lib) lib = require('msedge-tts');
  return lib;
}

const escapeXml = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const durOf = (bytes) => Math.round((bytes * 8) / KBPS);

async function once(text, voice, rate, hype) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = loadLib();
  const tts = new MsEdgeTTS();
  let timer;
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeXml(text), {
      rate: `${rate >= 1 ? '+' : ''}${Math.round((rate - 1) * 100)}%`,
      pitch: PITCH,
      volume: hype ? '+40%' : '+0%'
    });
    const chunks = [];
    const read = new Promise((resolve, reject) => {
      audioStream.on('data', (c) => chunks.push(c));
      audioStream.on('end', resolve);
      audioStream.on('close', resolve);
      audioStream.on('error', reject);
    });
    const timeout = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error('Edge TTS quá 20 giây')), TIMEOUT_MS)));
    await Promise.race([read, timeout]);
    const buf = Buffer.concat(chunks);
    if (!buf.length) throw new Error('Edge TTS không trả âm thanh');
    return buf;
  } finally {
    clearTimeout(timer);
    try {
      tts.close();
    } catch (_) {}
  }
}

let chain = Promise.resolve();
const inflight = new Map();

/**
 * who: 'M' | 'F' | 'E'; rate: 0.8–1.5 (1 = bình thường); hype: hô to.
 * Trả { ok, url, durMs } hoặc { ok: false, error }.
 */
function synthesize(text, { who = 'F', rate = 1, hype = false } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!clean) return Promise.resolve({ ok: false, error: 'Thiếu nội dung' });
  const voice = VOICES[who] || VOICES.F;
  const r = Math.max(0.5, Math.min(1.5, Number(rate) || 1));
  const name = `lhc_${crypto.createHash('sha1').update(`${voice}|${r}|${hype ? 1 : 0}|${clean}`).digest('hex').slice(0, 20)}.mp3`;
  const file = path.join(TTS_CACHE_DIR, name);
  const url = `/tts-cache/${name}`;
  try {
    const st = fs.statSync(file);
    if (st.size > 0) return Promise.resolve({ ok: true, url, durMs: durOf(st.size), cached: true });
  } catch (_) {}
  if (inflight.has(name)) return inflight.get(name);
  const job = chain.then(async () => {
    let lastErr;
    for (let i = 0; i < TRIES; i++) {
      try {
        const buf = await once(clean, voice, r, hype);
        fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, file);
        return { ok: true, url, durMs: durOf(buf.length) };
      } catch (err) {
        lastErr = err;
        if (i < TRIES - 1) await new Promise((res) => setTimeout(res, 300 * (i + 1)));
      }
    }
    return { ok: false, error: (lastErr && lastErr.message) || 'Edge TTS lỗi' };
  });
  chain = job.catch(() => {});
  inflight.set(name, job);
  job.finally(() => inflight.delete(name)).catch(() => {});
  return job;
}

module.exports = { synthesize, VOICES };
