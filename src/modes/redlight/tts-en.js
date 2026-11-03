/**
 * Giọng đọc tiếng Anh cho phòng chọn English: ZeroTTS chỉ có giọng tiếng Việt, nên dùng giọng có sẵn của macOS
 * (lệnh `say`, xuất thẳng m4a) rồi lưu chung thư mục tts-cache (server phục vụ ở /tts-cache). Cùng câu + cùng giọng
 * thì dùng lại file cũ. Đọc lần lượt từng câu để không chạy nhiều tiến trình `say` cùng lúc.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const config = require('../../config');

const VOICES = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Tessa', 'Fred'];
const DEFAULT_VOICE = 'Samantha';
let chain = Promise.resolve();

function synthesize(text, voice = DEFAULT_VOICE) {
  const v = VOICES.includes(voice) ? voice : DEFAULT_VOICE;
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!clean) return Promise.resolve({ ok: false });
  const name = `en_${crypto.createHash('sha1').update(`${v}|${clean}`).digest('hex').slice(0, 20)}.m4a`;
  const file = path.join(config.TTS_CACHE_DIR, name);
  const url = `/tts-cache/${name}`;
  if (fs.existsSync(file)) return Promise.resolve({ ok: true, url });
  const job = chain.then(
    () =>
      new Promise((resolve) => {
        if (fs.existsSync(file)) return resolve({ ok: true, url });
        const tmp = `${file}.${process.pid}.tmp.m4a`;
        execFile('say', ['-v', v, '--file-format=m4af', '--data-format=aac', '-o', tmp, clean], { timeout: 20000 }, (err) => {
          if (err) {
            fs.rm(tmp, { force: true }, () => {});
            return resolve({ ok: false, error: err.message });
          }
          fs.rename(tmp, file, (e) => resolve(e ? { ok: false, error: e.message } : { ok: true, url }));
        });
      })
  );
  chain = job.catch(() => {});
  return job;
}

module.exports = { synthesize, VOICES, DEFAULT_VOICE };
