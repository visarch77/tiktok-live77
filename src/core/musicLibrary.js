/**
 * Thư viện nhạc nền riêng (public/music): liệt kê, nhập từ link YouTube (chỉ phần âm thanh), xoá.
 *
 * Nhập từ YouTube dùng yt-dlp (cài trong .venv). Chỉ nhận link YouTube; mã video được tách ra và dựng lại
 * thành link chuẩn trước khi tải (không đưa chuỗi người dùng nhập thẳng vào dòng lệnh). Tải dòng âm thanh
 * gốc (m4a, hoặc webm/opus) — trình duyệt & OBS phát được, không cần ffmpeg.
 * Người dùng tự chịu trách nhiệm chỉ nhập nhạc được phép phát trên livestream (không bản quyền / có giấy phép).
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const config = require('../config');

const ROOT = path.join(__dirname, '..', '..');
const MUSIC_DIR = path.join(config.PUBLIC_DIR, 'music');
const LIBRARY_FILE = path.join(MUSIC_DIR, 'library.json');
const AUDIO_RE = /\.(mp3|m4a|ogg|wav|webm|opus)$/i;
const MAX_SECONDS = 3 * 60 * 60;
const jobs = new Map(); // videoId -> { id, status, title, file, error, startedAt }

function readLibrary() {
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeLibrary(lib) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(lib, null, 2));
}

/** Danh sách file nhạc kèm tên hiển thị */
function list() {
  let files = [];
  try {
    files = fs.readdirSync(MUSIC_DIR).filter((f) => AUDIO_RE.test(f)).sort();
  } catch (_) {}
  const lib = readLibrary();
  return files.map((file) => ({ file, title: (lib[file] && lib[file].title) || file.replace(AUDIO_RE, ''), source: lib[file] ? lib[file].source : 'file', url: lib[file] ? lib[file].url : null }));
}

/** Tách mã video (11 ký tự) từ link YouTube */
function youtubeId(input) {
  const s = String(input || '').trim();
  let u;
  try {
    u = new URL(s);
  } catch (_) {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/);
      if (m) id = m[1];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

function pythonBin() {
  const venvPy = path.join(ROOT, '.venv', 'bin', 'python');
  return fs.existsSync(venvPy) ? venvPy : 'python3';
}

/** Bắt đầu nhập (chạy nền). Trả về trạng thái công việc. */
function importYoutube(url) {
  const id = youtubeId(url);
  if (!id) throw new Error('Link không hợp lệ — hãy dán link YouTube (youtube.com/watch?v=… hoặc youtu.be/…)');
  const existing = list().find((t) => t.file.startsWith(`yt-${id}.`));
  if (existing) return { id, status: 'done', title: existing.title, file: existing.file };
  const running = jobs.get(id);
  if (running && running.status === 'running') return running;

  fs.mkdirSync(MUSIC_DIR, { recursive: true });
  const job = { id, status: 'running', title: null, file: null, error: null, startedAt: Date.now() };
  jobs.set(id, job);
  const cleanUrl = `https://www.youtube.com/watch?v=${id}`;
  const args = [
    '-m', 'yt_dlp',
    '--no-playlist',
    '--no-progress',
    '--js-runtimes', 'node', // giải thử thách JS của YouTube bằng Node (cùng gói yt-dlp-ejs trong .venv)
    '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    '--max-filesize', '300M',
    '--match-filter', `duration <= ${MAX_SECONDS}`,
    '--print-json',
    '-o', path.join(MUSIC_DIR, `yt-${id}.%(ext)s`),
    cleanUrl
  ];
  execFile(pythonBin(), args, { cwd: ROOT, timeout: 15 * 60 * 1000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
    let info = null;
    try {
      info = JSON.parse(String(stdout).trim().split('\n').pop());
    } catch (_) {}
    const file = fs.readdirSync(MUSIC_DIR).find((f) => f.startsWith(`yt-${id}.`) && AUDIO_RE.test(f));
    if (err || !file) {
      job.status = 'error';
      const msg = String(stderr || (err && err.message) || '').split('\n').filter(Boolean).pop() || 'Không tải được';
      job.error = /does not pass filter|duration/i.test(msg) ? 'Video dài quá 3 giờ' : msg.replace(/^ERROR:\s*/, '').slice(0, 200);
      return;
    }
    const lib = readLibrary();
    lib[file] = { title: (info && info.title) || `YouTube ${id}`, source: 'youtube', url: cleanUrl, duration: info && info.duration, addedAt: new Date().toISOString() };
    writeLibrary(lib);
    job.status = 'done';
    job.file = file;
    job.title = lib[file].title;
  });
  return job;
}

function jobList() {
  return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 10);
}

function remove(file) {
  const name = path.basename(String(file || ''));
  if (!AUDIO_RE.test(name)) throw new Error('Tên file không hợp lệ');
  const full = path.join(MUSIC_DIR, name);
  if (!fs.existsSync(full)) throw new Error('Không tìm thấy file');
  fs.unlinkSync(full);
  const lib = readLibrary();
  delete lib[name];
  writeLibrary(lib);
  return { ok: true };
}

module.exports = { list, importYoutube, jobList, remove, youtubeId };
