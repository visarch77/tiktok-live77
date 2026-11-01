const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache');
const STATE_FILE = path.join(DATA_DIR, 'merit-state.json');

// Khởi tạo ở cuối file; khai báo sớm để các hàm dùng trước đó không dính lỗi TDZ
let zeroTts = null;

fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });

// ============================================================================
// 1. BỘ 18 QUẺ LINH XĂM CHÙA LINH ỨNG (FORTUNE STICKS DECK)
// ============================================================================
const FORTUNE_DECK = [
  {
    number: 1,
    rank: 'Thượng Thượng Cát',
    title: 'Nhật Xuất Đông Phương — Mặt Trời Mọc Phương Đông',
    poem: 'Đông phương nhật xuất chiếu Càn Khôn\nHoa nở đầy cành rạng sắc xuân\nCông danh tài lộc đều viên mãn\nGia đạo bình an phúc lộc tồn.',
    meaning: 'Mọi sự mưu cầu đều đại cát đại lợi. Công việc hanh thông, quý nhân phù trợ, gia đình hòa thuận ấm êm.',
    ttsSummary: 'Quẻ số 1, Thượng Thượng Cát, Nhật Xuất Đông Phương. Mọi sự mưu cầu đều đại cát đại lợi, công danh tài lộc viên mãn, quý nhân phù trợ.'
  },
  {
    number: 8,
    rank: 'Thượng Cát',
    title: 'Kim Liên Khai Nở — Sen Vàng Tỏa Ngát',
    poem: 'Sen vàng nở rộ giữa hồ trong\nHương thơm lan tỏa khắp non sông\nLòng thành thắp nén nhang cầu nguyện\nTrời Phật chứng tri thỏa ước mong.',
    meaning: 'Tâm thiện lành ắt gặp phước báu. Cầu tài đắc tài, cầu bình an đắc bình an, bệnh tật tiêu trừ.',
    ttsSummary: 'Quẻ số 8, Thượng Cát, Kim Liên Khai Nở. Tâm thiện lành ắt gặp phước báu, cầu tài đắc tài, cầu bình an đắc bình an.'
  },
  {
    number: 12,
    rank: 'Đại Cát',
    title: 'Long Vân Tương Hội — Rồng Mây Gặp Gỡ',
    poem: 'Rồng thiêng gặp hội tầng mây xanh\nVượt Vũ Môn Quan rạng rỡ danh\nThí chủ kiên tâm hành thiện đạo\nPhúc dày lộc vượng khắp gia đình.',
    meaning: 'Thời vận đang lên mạnh mẽ. Thi cử đỗ đạt, kinh doanh phát đạt, gặp cơ hội lớn đổi đời.',
    ttsSummary: 'Quẻ số 12, Đại Cát, Long Vân Tương Hội. Thời vận đang lên mạnh mẽ, thi cử đỗ đạt, kinh doanh phát đạt.'
  },
  {
    number: 18,
    rank: 'Thượng Cát',
    title: 'Xuân Phong Đắc Ý — Gió Xuân Thuận Buồm',
    poem: 'Thuận buồm xuôi gió vượt trùng khơi\nBến giác bình yên nắng rạng ngời\nTài lộc dồi dào nhân duyên tốt\nBốn mùa hưng thịnh rộn niềm vui.',
    meaning: 'Đi xa gặp may, buôn bán thuận lợi, tình duyên êm đẹp, người thân mạnh khỏe.',
    ttsSummary: 'Quẻ số 18, Thượng Cát, Xuân Phong Đắc Ý. Thuận buồm xuôi gió, tài lộc dồi dào, nhân duyên tốt đẹp.'
  },
  {
    number: 24,
    rank: 'Trung Cát',
    title: 'Vũ Quá Thiên Thanh — Mưa Tạnh Trời Trong',
    poem: 'Mưa qua trời lại sáng trong ngần\nGian khó lùi xa đón phúc phần\nGiữ vững lòng thành đừng nản chí\nHoa thơm trái ngọt đến mười phân.',
    meaning: 'Khó khăn cũ sắp qua đi, vận may mới đang tới. Hãy kiên nhẫn và giữ tâm bình tĩnh.',
    ttsSummary: 'Quẻ số 24, Trung Cát, Vũ Quá Thiên Thanh. Mưa qua trời lại sáng trong, gian khó lùi xa để đón phúc phần mới.'
  },
  {
    number: 36,
    rank: 'Thượng Thượng Cát',
    title: 'Phúc Tinh Cao Chiếu — Sao Phúc Chiếu Mệnh',
    poem: 'Phúc tinh rực sáng giữa đêm rằm\nTừ bi Phật độ suốt quanh năm\nTài lộc tự nhiên về gõ cửa\nTrăm điều như ý vạn điều lành.',
    meaning: 'Sao Phúc chiếu mạng, tai qua nạn khỏi, tiền tài sung túc, gia đạo hưng long.',
    ttsSummary: 'Quẻ số 36, Thượng Thượng Cát, Phúc Tinh Cao Chiếu. Sao Phúc chiếu mạng, tài lộc tự nhiên gõ cửa, trăm điều như ý.'
  },
  {
    number: 52,
    rank: 'Thượng Cát',
    title: 'Ngọc Xuất Côn Sơn — Ngọc Quý Phát Sáng',
    poem: 'Ngọc quý Côn Sơn tỏa ánh ngời\nBấy lâu rèn giũa nay gặp thời\nTri âm tương ngộ cùng nâng đỡ\nSự nghiệp thăng hoa rạng rỡ đời.',
    meaning: 'Nỗ lực bấy lâu nay sắp được đền đáp xứng đáng. Có người tốt nâng đỡ trong công việc và cuộc sống.',
    ttsSummary: 'Quẻ số 52, Thượng Cát, Ngọc Xuất Côn Sơn. Nỗ lực bấy lâu sắp được đền đáp xứng đáng, sự nghiệp thăng hoa.'
  },
  {
    number: 68,
    rank: 'Đại Cát',
    title: 'Lộc Mã Đồng Hương — Lộc Tài Cùng Tới',
    poem: 'Lộc Mã song hành đến tận nhà\nLàm ăn buôn bán nở như hoa\nTâm thành bố thí thêm công đức\nPhú quý vinh hoa khắp một nhà.',
    meaning: 'Quẻ đại lợi về tài lộc và kinh doanh. Nên làm nhiều việc thiện để phúc đức càng thêm bền vững.',
    ttsSummary: 'Quẻ số 68, Đại Cát, Lộc Mã Đồng Hương. Đại lợi về tài lộc và buôn bán, phú quý vinh hoa khắp một nhà.'
  },
  {
    number: 81,
    rank: 'Thượng Cát',
    title: 'Nguyệt Nhập Trung Thiên — Trăng Rằm Giữa Đỉnh',
    poem: 'Trăng tròn vằng vặc giữa trời thu\nSoi sáng muôn phương sạch mây mù\nTình duyên viên mãn gia đình thuận\nTâm an vạn sự chẳng ưu tư.',
    meaning: 'Tình duyên và gia đạo vô cùng tốt đẹp. Người độc thân dễ gặp ý trung nhân, gia đình thêm tin vui.',
    ttsSummary: 'Quẻ số 81, Thượng Cát, Nguyệt Nhập Trung Thiên. Tình duyên viên mãn, gia đình hòa thuận, tâm an vạn sự lành.'
  },
  {
    number: 99,
    rank: 'Thượng Thượng Cát',
    title: 'Vạn Sự Viên Thành — Cửu Cửu Đại Cát',
    poem: 'Chín tầng mây trắng ánh hào quang\nTừ bi Phật Tổ độ nhân gian\nThí chủ lòng thành dâng lễ bái\nTrọn đời trường thọ hưởng vinh khang.',
    meaning: 'Quẻ tối thượng cát tường. Sức khỏe trường thọ, công danh hiển đạt, vạn sự viên thành.',
    ttsSummary: 'Quẻ số 99, Thượng Thượng Cát, Vạn Sự Viên Thành. Quẻ tối thượng cát tường, sức khỏe trường thọ, vạn sự như ý.'
  }
];

// ============================================================================
// 2. ZEROTTS PYTHON WORKER MANAGER (VOICE: MAI CHI)
// ============================================================================
class ZeroTTSManager {
  constructor() {
    this.proc = null;
    this.ready = false;
    this.status = 'starting';
    this.voice = 'maichi';
    this.voices = ['maichi'];
    this.model = 'zeroweight-ai/ZeroTTS';
    this.pending = new Map();
    this.inflight = new Map();
    this.reqCounter = 0;
    this.buffer = '';
    // Cache kết quả (voice::text -> url) ngay trong Node: câu đã đọc rồi trả về tức thì,
    // không phải xếp hàng sau các câu đang tổng hợp trong worker Python (xử lý tuần tự)
    this.resultCache = new Map();
    this.restartAttempts = 0;
    this.restartTimer = null;
    this.shuttingDown = false;
    this.startWorker();
  }

  cacheResult(key, res) {
    this.resultCache.delete(key);
    this.resultCache.set(key, res);
    if (this.resultCache.size > 800) {
      this.resultCache.delete(this.resultCache.keys().next().value);
    }
  }

  failAllPending(error) {
    for (const [, item] of this.pending) {
      clearTimeout(item.timer);
      item.resolve({ ok: false, error });
    }
    this.pending.clear();
  }

  scheduleRestart() {
    if (this.shuttingDown || this.restartTimer) return;
    // Backoff 2s, 4s, 8s... tối đa 60s để không spam khởi động lại khi thiếu Python/model
    const delay = Math.min(60000, 2000 * 2 ** Math.min(this.restartAttempts, 5));
    this.restartAttempts += 1;
    console.warn(`[ZeroTTS] Thử khởi động lại worker sau ${Math.round(delay / 1000)}s...`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startWorker();
    }, delay);
  }

  stop() {
    this.shuttingDown = true;
    clearTimeout(this.restartTimer);
    if (this.proc) {
      try { this.proc.kill(); } catch (_) {}
    }
  }

  resolvePythonBin() {
    const venvPy = path.join(__dirname, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPy)) return venvPy;
    return 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    const scriptPath = path.join(__dirname, 'tts_worker.py');
    console.log(`[ZeroTTS] Khởi chạy worker với ${pyBin} (Giọng mặc định: Mai Chi)...`);

    this.status = 'loading';
    this.ready = false;
    this.buffer = '';
    const proc = spawn(pyBin, [scriptPath], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.proc = proc;

    // Thiếu python3 / không spawn được: phải bắt sự kiện 'error', nếu không cả server sẽ crash
    proc.on('error', (err) => {
      console.error('[ZeroTTS] Không khởi chạy được worker:', err.message);
      if (this.proc !== proc) return;
      this.proc = null;
      this.ready = false;
      this.status = 'error';
      this.failAllPending('ZeroTTS worker không khởi chạy được');
      broadcastNotification('tts.status', this.getStatus());
      this.scheduleRestart();
    });
    // Ghi vào stdin khi worker vừa chết sẽ ném EPIPE -> bắt lại để không crash
    proc.stdin.on('error', (err) => {
      console.warn('[ZeroTTS] stdin error:', err.message);
    });

    proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      let lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handleWorkerLine(line.trim());
      }
    });

    proc.stderr.on('data', (chunk) => {
      const msg = chunk.toString('utf8').trim();
      if (msg) console.log(`[ZeroTTS stderr] ${msg}`);
    });

    proc.on('exit', (code) => {
      console.warn(`[ZeroTTS] Worker thoát với mã ${code}`);
      if (this.proc !== proc) return;
      this.proc = null;
      this.ready = false;
      this.status = 'stopped';
      this.inflight.clear();
      this.failAllPending('ZeroTTS worker exited');
      broadcastNotification('tts.status', this.getStatus());
      this.scheduleRestart();
    });
  }

  handleWorkerLine(line) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'status') {
        this.status = msg.status;
        this.model = msg.model || this.model;
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'ready') {
        this.ready = true;
        this.status = 'ready';
        this.restartAttempts = 0;
        this.voice = msg.voice || 'maichi';
        this.voices = msg.voices || ['maichi'];
        this.model = msg.model || this.model;
        console.log(`[ZeroTTS] Sẵn sàng sau ${msg.loadSec}s! Giọng: ${this.voice} (${this.voices.join(', ')})`);
        broadcastNotification('tts.status', this.getStatus());
      } else if (msg.type === 'result' && msg.id != null) {
        const entry = this.pending.get(msg.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(msg.id);
          entry.resolve(msg);
        }
      } else if (msg.type === 'error') {
        console.error('[ZeroTTS Error]', msg.error);
        this.status = 'error';
        broadcastNotification('tts.status', this.getStatus());
      }
    } catch (err) {
      console.log('[ZeroTTS stdout]', line);
    }
  }

  getStatus() {
    return {
      ready: this.ready,
      status: this.status,
      engine: 'ZeroTTS (zeroweight-ai/ZeroTTS)',
      voice: state.settings.ttsVoice || this.voice || 'maichi',
      voices: this.voices,
      model: this.model
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    const voice = String(voiceOverride || state.settings.ttsVoice || 'maichi').toLowerCase();
    const dedupKey = `${voice}::${cleanText}`;

    const cached = this.resultCache.get(dedupKey);
    if (cached) {
      return Promise.resolve({ ...cached, cached: true });
    }
    if (this.inflight.has(dedupKey)) {
      return this.inflight.get(dedupKey);
    }

    const promise = new Promise((resolve) => {
      if (!this.proc || !this.ready) {
        return resolve({ ok: false, error: `ZeroTTS đang ở trạng thái: ${this.status}` });
      }
      const id = ++this.reqCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'ZeroTTS synthesis timeout' });
      }, 30000);

      this.pending.set(id, { resolve, timer });
      const payload = JSON.stringify({ id, text: cleanText, voice, deadline: Date.now() + 30000 }) + '\n';
      try {
        this.proc.stdin.write(payload);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ ok: false, error: `ZeroTTS write error: ${err.message}` });
      }
    }).then((res) => {
      if (res && res.ok && res.url) this.cacheResult(dedupKey, res);
      return res;
    }).finally(() => {
      this.inflight.delete(dedupKey);
    });

    this.inflight.set(dedupKey, promise);
    return promise;
  }
}

// ============================================================================
// 3. TRẠNG THÁI CHÙA ONLINE & BẢNG VÀNG CÔNG ĐỨC
// ============================================================================
const DEFAULT_STATE = {
  totalIncense: 108,
  totalMerit: 1080,
  woodenFishHits: 360,
  bellRings: 36,
  lanternCount: 18,
  fortuneCount: 12,
  activeIncenseSticks: 9,
  haloIntensity: 0.45,
  offerings: {
    lotus: 3,
    fruit: 2,
    lamp: 2,
    dragon: 1
  },
  devotees: {},
  recentEvents: [],
  settings: {
    ttsEnabled: true,
    ttsVoice: 'maichi',
    bgMusicEnabled: true,
    sfxEnabled: true,
    smokeDensity: 1.0,
    autoSim: false,
    autoSimIntervalMs: 9500
  },
  tiktok: {
    connected: false,
    connecting: false,
    username: 'zenfacts_vn',
    roomId: null,
    viewerCount: 0,
    lastError: null
  }
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        ...DEFAULT_STATE,
        ...saved,
        devotees: saved.devotees || {},
        offerings: { ...DEFAULT_STATE.offerings, ...(saved.offerings || {}) },
        settings: { ...DEFAULT_STATE.settings, ...(saved.settings || {}) },
        tiktok: { ...DEFAULT_STATE.tiktok }
      };
    }
  } catch (e) {
    console.warn('[State] Không đọc được merit-state.json, dùng mặc định:', e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

// Giới hạn số thí chủ lưu trữ: mỗi người vào phòng đều được ghi nhận, live đông người
// sẽ làm file trạng thái phình to và việc sắp xếp bảng vàng chậm dần theo thời gian
const MAX_DEVOTEES = 3000;
const PRUNE_TO_DEVOTEES = 2000;

function pruneDevotees() {
  const keys = Object.keys(state.devotees);
  if (keys.length <= MAX_DEVOTEES) return;
  const keep = keys
    .map((k) => [k, state.devotees[k]])
    .sort((a, b) => b[1].merit - a[1].merit)
    .slice(0, PRUNE_TO_DEVOTEES);
  state.devotees = Object.fromEntries(keep);
  leaderboardDirty = true;
}

function serializeState() {
  return JSON.stringify({
    totalIncense: state.totalIncense,
    totalMerit: state.totalMerit,
    woodenFishHits: state.woodenFishHits,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    fortuneCount: state.fortuneCount,
    activeIncenseSticks: state.activeIncenseSticks,
    offerings: state.offerings,
    devotees: state.devotees,
    settings: state.settings
  });
}

// Throttle (không phải debounce): khi live liên tục có tim/bình luận dưới 1,2s,
// debounce cũ bị reset mãi và KHÔNG BAO GIỜ lưu. Ghi ra file tạm rồi rename để tránh hỏng file.
let saveTimer = null;
let saving = false;
function saveState() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (saving) {
      saveState();
      return;
    }
    saving = true;
    try {
      pruneDevotees();
      const tmp = `${STATE_FILE}.tmp`;
      await fs.promises.writeFile(tmp, serializeState(), 'utf8');
      await fs.promises.rename(tmp, STATE_FILE);
    } catch (e) {
      console.error('[State] Lỗi lưu file:', e.message);
    } finally {
      saving = false;
    }
  }, 1500);
}

function saveStateSync() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    pruneDevotees();
    fs.writeFileSync(STATE_FILE, serializeState(), 'utf8');
  } catch (e) {
    console.error('[State] Lỗi lưu file khi tắt server:', e.message);
  }
}

let leaderboardDirty = true;
let leaderboardCache = [];
function getLeaderboard(limit = 6) {
  if (leaderboardDirty) {
    leaderboardCache = Object.values(state.devotees)
      .sort((a, b) => b.merit - a.merit)
      .slice(0, 24);
    leaderboardDirty = false;
  }
  return leaderboardCache
    .slice(0, limit)
    .map((d, index) => ({
      rank: index + 1,
      name: d.name,
      uniqueId: d.uniqueId,
      avatar: d.avatar || '',
      merit: d.merit,
      incense: d.incense || 0,
      lastWish: d.lastWish || ''
    }));
}
// Bộ lọc chặn ký tự lạ (Cuneiform 𒐫, Zalgo, Braille, ký tự spam) & từ ngữ phản cảm
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g;
const VI_LETTER_RE = /[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/g;
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|i cư|lừa đảo|lừa à|te-le gram|telegram|bố là trùm)/i;

function isBlockedSpamOrToxic(raw) {
  if (!raw) return true;
  const s = String(raw);
  if (WEIRD_SPAM_RE.test(s)) return true;
  if (BAD_WORDS_RE.test(s)) return true;
  return false;
}

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_NAME_RE, ' ')
    .replace(/(.)\1{3,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26);

  if (!normalized || BAD_WORDS_RE.test(normalized)) {
    return 'Thí Chủ Hữu Duyên';
  }
  const letters = normalized.match(VI_LETTER_RE) || [];
  if (letters.length < 2) {
    return 'Thí Chủ Hữu Duyên';
  }
  return normalized;
}

function sanitizeWishText(rawWish) {
  if (!rawWish) return '';
  const cleaned = String(rawWish)
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_TEXT_RE, ' ')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(/(.)\1{2,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?\s-]+|[.,!?\s-]+$/g, '')
    .slice(0, 120);

  if (!cleaned || BAD_WORDS_RE.test(cleaned)) return '';
  const letters = cleaned.match(VI_LETTER_RE) || [];
  if (letters.length < 2) return '';
  return cleaned;
}

function recordDevotee(user, uniqueId, avatar, meritDelta, incenseDelta = 0, giftDelta = 0, wish = '') {
  const displayName = sanitizeUserName(user || uniqueId);
  const cleanWish = sanitizeWishText(wish);
  const key = (uniqueId || displayName).slice(0, 40);
  if (!state.devotees[key]) {
    state.devotees[key] = {
      name: displayName,
      uniqueId: uniqueId || displayName.toLowerCase().replace(/\s+/g, ''),
      avatar: avatar || '',
      merit: 0,
      incense: 0,
      gifts: 0,
      lastWish: ''
    };
  }
  const dev = state.devotees[key];
  dev.name = displayName;
  if (avatar) dev.avatar = avatar;
  dev.merit += meritDelta;
  dev.incense += incenseDelta;
  dev.gifts += giftDelta;
  if (cleanWish) dev.lastWish = cleanWish;

  // Công đức chỉ tăng, nên chỉ cần sắp xếp lại khi người này đang/đủ điểm lọt Top 24
  if (
    !leaderboardDirty &&
    (leaderboardCache.length < 24 ||
      leaderboardCache.includes(dev) ||
      dev.merit >= leaderboardCache[leaderboardCache.length - 1].merit)
  ) {
    leaderboardDirty = true;
  }

  state.totalMerit += meritDelta;
  state.haloIntensity = Math.min(1.0, 0.35 + (state.totalMerit % 1000) / 1400);
  return dev;
}

// Chỉ nhận các khóa cài đặt đã biết, đúng kiểu và trong khoảng hợp lệ
// (ví dụ autoSimIntervalMs = 0 trước đây sẽ khiến setInterval chạy liên tục)
const SETTINGS_SCHEMA = {
  ttsEnabled: 'boolean',
  bgMusicEnabled: 'boolean',
  sfxEnabled: 'boolean',
  autoSim: 'boolean',
  ttsVoice: 'voice',
  smokeDensity: [0, 3],
  autoSimIntervalMs: [2000, 600000],
  musicVolume: [0, 1],
  ttsVolume: [0, 1]
};

function sanitizeSettings(params) {
  const out = {};
  for (const [key, rule] of Object.entries(SETTINGS_SCHEMA)) {
    if (!(key in params)) continue;
    const val = params[key];
    if (rule === 'boolean') {
      if (typeof val === 'boolean') out[key] = val;
    } else if (rule === 'voice') {
      const v = String(val || '').trim().toLowerCase();
      if (/^[a-z0-9_-]{1,32}$/.test(v)) out[key] = v;
    } else {
      const n = Number(val);
      if (Number.isFinite(n)) out[key] = Math.max(rule[0], Math.min(rule[1], n));
    }
  }
  return out;
}

function pushEventLog(evt) {
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...evt
  };
  state.recentEvents.unshift(entry);
  if (state.recentEvents.length > 35) {
    state.recentEvents.length = 35;
  }
  return entry;
}

function getPublicState() {
  return {
    totalIncense: state.totalIncense,
    totalMerit: state.totalMerit,
    woodenFishHits: state.woodenFishHits,
    bellRings: state.bellRings,
    lanternCount: state.lanternCount,
    fortuneCount: state.fortuneCount,
    activeIncenseSticks: state.activeIncenseSticks,
    haloIntensity: state.haloIntensity,
    offerings: state.offerings,
    leaderboard: getLeaderboard(24),
    recentEvents: state.recentEvents.slice(0, 15),
    settings: state.settings,
    tiktok: state.tiktok,
    tts: zeroTts ? zeroTts.getStatus() : { ready: false, status: 'init', voice: 'maichi' }
  };
}

// Gộp các lần phát toàn bộ state (người vào phòng, ...) thành tối đa 1 lần / giây
let stateBroadcastTimer = null;
function scheduleStateBroadcast() {
  if (stateBroadcastTimer) return;
  stateBroadcastTimer = setTimeout(() => {
    stateBroadcastTimer = null;
    broadcastNotification('temple.state', getPublicState());
  }, 1000);
}

function emitRitualEvent(event) {
  saveState();
  // Tổng hợp giọng đọc ngay trên server khi sự kiện vừa xảy ra -> lúc client gọi /api/tts
  // thì audio đã sẵn (hoặc đang tổng hợp, được gộp chung nhờ inflight dedupe)
  if (event.ttsText && state.settings.ttsEnabled !== false && zeroTts && zeroTts.ready) {
    zeroTts.synthesize(event.ttsText, event.ttsVoice).catch(() => {});
  }
  const publicState = getPublicState();
  clearTimeout(stateBroadcastTimer);
  stateBroadcastTimer = null;
  broadcastNotification('temple.event', { event, state: publicState });
  return { event, state: publicState };
}

// ============================================================================
// 4. NGHI THỨC TƯƠNG TÁC (RITUAL HANDLERS)
// ============================================================================
const Rituals = {
  burnIncense(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 3));
    const wish = sanitizeWishText(params.wish) || 'Thành tâm dâng hương bái Phật, cầu bình an cát tường';
    const merit = count * 5;

    state.totalIncense += count;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + count);
    const devotee = recordDevotee(user, uniqueId, avatar, merit, count, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Nam mô A Di Đà Phật. Cảm tạ thí chủ ${devotee.name} đã thành tâm thắp ${count} nén hương thơm. ${wish}.`;

    const event = pushEventLog({
      type: 'burnIncense',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    return emitRitualEvent(event);
  },

  strikeWoodenFish(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(50, Number(params.count) || 1));
    const merit = count;

    state.woodenFishHits += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0);

    const event = pushEventLog({
      type: 'strikeWoodenFish',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit,
      ttsText: params.ttsText || ''
    });

    return emitRitualEvent(event);
  },

  ringBell(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const count = Math.max(1, Math.min(9, Number(params.count) || 1));
    const wish = sanitizeWishText(params.wish) || 'Thỉnh chuông Bát Nhã, phiền não tiêu tan, trí tuệ sáng ngời';
    const merit = count * 10;

    state.bellRings += count;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, wish);

    const ttsText = params.readTts
      ? `Thí chủ ${devotee.name} thỉnh Đại Hồng Chung cầu nguyện: ${wish}.`
      : '';

    const event = pushEventLog({
      type: 'ringBell',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      count,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    return emitRitualEvent(event);
  },

  sendPrayer(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const wish = sanitizeWishText(params.wish) || 'Cầu cho quốc thái dân an, gia đình mạnh khỏe hạnh phúc';
    const merit = 10;

    state.lanternCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 1, 0, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Lời cầu nguyện của thí chủ ${devotee.name}: ${wish}. Nam mô A Di Đà Phật.`;

    const event = pushEventLog({
      type: 'sendPrayer',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      wish,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    return emitRitualEvent(event);
  },

  offerGift(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const coins = Math.max(1, Number(params.coins) || 10);
    const giftType = ['lotus', 'fruit', 'lamp', 'dragon'].includes(params.giftType)
      ? params.giftType
      : (coins >= 100 ? 'dragon' : coins >= 20 ? 'fruit' : coins >= 5 ? 'lamp' : 'lotus');

    const giftLabels = {
      lotus: 'Đài Hoa Sen Vàng',
      fruit: 'Mâm Ngũ Quả Cát Tường',
      lamp: 'Đèn Lưu Ly Trí Tuệ',
      dragon: 'Đại Lễ Kim Long Chầu Phật'
    };
    const giftName = sanitizeWishText(params.giftName) || giftLabels[giftType];
    const multiplier = coins >= 100 ? 50 : coins >= 10 ? 30 : 20;
    const merit = Math.max(20, coins * multiplier);

    state.offerings[giftType] = (state.offerings[giftType] || 0) + 1;
    state.totalIncense += 3;
    state.activeIncenseSticks = Math.min(36, state.activeIncenseSticks + 3);

    const wish = sanitizeWishText(params.wish) || `Dâng cúng ${giftName} lên Tam Bảo`;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 3, 1, wish);

    const ttsText = params.readTts === false
      ? ''
      : `Công đức vô lượng! Cảm tạ thí chủ ${devotee.name} đã phát tâm dâng cúng ${giftName}, tích thêm ${merit} điểm công đức. Nguyện cầu chư Phật gia hộ cho thí chủ vạn sự cát tường như ý.`;

    const event = pushEventLog({
      type: giftType === 'dragon' ? 'grandCeremony' : 'offerGift',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      giftType,
      giftName,
      coins,
      merit,
      wish,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    return emitRitualEvent(event);
  },

  drawFortune(params = {}) {
    const user = sanitizeUserName(params.user);
    const uniqueId = params.uniqueId || '';
    const avatar = params.avatar || '';
    const topic = sanitizeWishText(params.topic) || 'Gia đạo, Tài lộc và Bình an';
    const fortune = FORTUNE_DECK[Math.floor(Math.random() * FORTUNE_DECK.length)];
    const merit = 10;

    state.fortuneCount += 1;
    const devotee = recordDevotee(user, uniqueId, avatar, merit, 0, 0, `Xin xăm: Quẻ số ${fortune.number} (${fortune.rank})`);

    const ttsText = params.readTts === false
      ? ''
      : `Thí chủ ${devotee.name} vừa gieo được ${fortune.ttsSummary}`;

    const event = pushEventLog({
      type: 'drawFortune',
      user: devotee.name,
      uniqueId: devotee.uniqueId,
      avatar: devotee.avatar,
      topic,
      fortune,
      merit,
      ttsText,
      ttsVoice: state.settings.ttsVoice || 'maichi'
    });

    return emitRitualEvent(event);
  },

  grandCeremony(params = {}) {
    return this.offerGift({
      ...params,
      giftType: 'dragon',
      coins: Math.max(100, Number(params.coins) || 199),
      giftName: params.giftName || 'Đại Lễ Hào Quang Vạn Trượng'
    });
  },

  updateSettings(params = {}) {
    const prevInterval = state.settings.autoSimIntervalMs;
    state.settings = {
      ...state.settings,
      ...sanitizeSettings(params)
    };
    if (typeof params.autoSim === 'boolean') {
      configureAutoSim(params.autoSim);
    } else if (state.settings.autoSim && state.settings.autoSimIntervalMs !== prevInterval) {
      configureAutoSim(true);
    }
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  },

  resetMerit() {
    state.totalIncense = 9;
    state.totalMerit = 0;
    state.woodenFishHits = 0;
    state.bellRings = 0;
    state.lanternCount = 0;
    state.fortuneCount = 0;
    state.activeIncenseSticks = 3;
    state.offerings = { lotus: 1, fruit: 1, lamp: 1, dragon: 0 };
    state.devotees = {};
    state.recentEvents = [];
    leaderboardDirty = true;
    saveState();
    broadcastNotification('temple.state', getPublicState());
    return getPublicState();
  }
};

// ============================================================================
// 5. TIKTOK LIVE CONNECTOR & COMMENT PARSER
// ============================================================================
let tiktokConn = null;

const commentCooldownMap = new Map();

// So khớp theo NGUYÊN TỪ (không phải chuỗi con): trước đây 'que' khớp cả "quen", "queo"...
// khiến bình luận thường như "chào người quen" bị hiểu nhầm là xin xăm
function keywordRegex(words) {
  const alt = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${alt})(?=$|[^\\p{L}\\p{N}])`, 'u');
}
const FORTUNE_KEYWORDS_RE = keywordRegex(['xin xăm', 'xin xam', 'gieo quẻ', 'gieo que', 'rút quẻ', 'rut que', 'xin quẻ', 'xin que', 'quẻ', 'xăm']);
const BELL_KEYWORDS_RE = keywordRegex(['chuông', 'chuong']);
const WOODFISH_KEYWORDS_RE = keywordRegex(['gõ mõ', 'go mo', 'tụng kinh', 'tung kinh']);
const INCENSE_KEYWORDS_RE = keywordRegex(['thắp hương', 'thap huong', 'dâng hương', 'dang huong', 'bái phật', 'bai phat', 'lạy phật', 'lay phat']);
const PRAYER_KEYWORDS_RE = keywordRegex([
  'cầu', 'cau', 'nguyện', 'nguyen', 'nam mô', 'nam mo', 'mô phật', 'mo phat',
  'a di đà', 'a di da', 'bình an', 'binh an', 'tài lộc', 'tai loc', 'chúc', 'chuc'
]);

function parseViewerComment(commentText, user, uniqueId, avatar) {
  const raw = String(commentText || '').trim();
  if (!raw || isBlockedSpamOrToxic(raw)) {
    return null;
  }

  const cleanWish = sanitizeWishText(raw);
  if (!cleanWish || cleanWish.length < 3) {
    return null;
  }

  // Chống 1 người spam bình luận liên tục làm nghẽn hàng đợi TTS (cooldown 3.5 giây/người)
  const userKey = uniqueId || user || '';
  const now = Date.now();
  if (userKey) {
    const lastTs = commentCooldownMap.get(userKey) || 0;
    if (now - lastTs < 3500) {
      return null;
    }
    // delete rồi set lại để key mới nhất nằm cuối Map -> xóa key đầu đúng là key cũ nhất
    commentCooldownMap.delete(userKey);
    commentCooldownMap.set(userKey, now);
    if (commentCooldownMap.size > 600) {
      const oldestKey = commentCooldownMap.keys().next().value;
      commentCooldownMap.delete(oldestKey);
    }
  }

  const cleanUser = sanitizeUserName(user);
  const lower = cleanWish.toLowerCase();

  // 1. Xin xăm / Gieo quẻ
  if (FORTUNE_KEYWORDS_RE.test(lower)) {
    return Rituals.drawFortune({ user: cleanUser, uniqueId, avatar, topic: cleanWish });
  }

  // 2. Thỉnh chuông
  if (BELL_KEYWORDS_RE.test(lower)) {
    return Rituals.ringBell({ user: cleanUser, uniqueId, avatar, count: 1, wish: cleanWish, readTts: true });
  }

  // 3. Gõ mõ
  if (WOODFISH_KEYWORDS_RE.test(lower)) {
    return Rituals.strikeWoodenFish({ user: cleanUser, uniqueId, avatar, count: 3 });
  }

  // 4. Thắp hương / Bái Phật
  if (INCENSE_KEYWORDS_RE.test(lower)) {
    return Rituals.burnIncense({ user: cleanUser, uniqueId, avatar, count: 3, wish: cleanWish });
  }

  // 5. Cầu nguyện / Thả đèn hoa đăng
  if (PRAYER_KEYWORDS_RE.test(lower)) {
    return Rituals.sendPrayer({ user: cleanUser, uniqueId, avatar, wish: cleanWish });
  }

  return Rituals.burnIncense({ user: cleanUser, uniqueId, avatar, count: 1, wish: cleanWish });
}

const giftComboTracker = new Map();

// Gộp lượt thả tim theo từng người trong 1,2s: TikTok bắn sự kiện LIKE rất dày,
// trước đây mỗi gói tim = 1 lần lưu state + phát toàn bộ state tới mọi client
const LIKE_FLUSH_MS = 1200;
const pendingLikes = new Map();
let likeFlushTimer = null;

function queueLike(user, uniqueId, avatar, count) {
  const key = uniqueId || user || 'anon';
  const entry = pendingLikes.get(key) || { user, uniqueId, avatar, count: 0 };
  entry.count += count;
  if (avatar) entry.avatar = avatar;
  pendingLikes.set(key, entry);
  if (!likeFlushTimer) {
    likeFlushTimer = setTimeout(flushLikes, LIKE_FLUSH_MS);
  }
}

function flushLikes() {
  likeFlushTimer = null;
  const batch = [...pendingLikes.values()];
  pendingLikes.clear();
  for (const { user, uniqueId, avatar, count } of batch) {
    Rituals.strikeWoodenFish({ user, uniqueId, avatar, count: Math.min(50, count) });
  }
}

function isTikTokHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'tiktok.com' || h.endsWith('.tiktok.com');
}

async function resolveTikTokUsername(rawInput) {
  let input = String(rawInput || '').trim();
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
        const finalUrl = resp.url || '';
        const resolvedMatch = finalUrl.match(/tiktok\.com\/@([^/?#]+)/i);
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

function extractUserFromEvent(data) {
  const u = data?.user || data || {};
  const uniqueId = u.uniqueId || u.displayId || data?.uniqueId || '';
  const user = u.nickname || uniqueId || data?.nickname || 'Thí Chủ';
  const avatar =
    u.profilePictureUrl ||
    u.avatarThumb?.urlList?.[0] ||
    u.avatarMedium?.urlList?.[0] ||
    u.avatarLarge?.urlList?.[0] ||
    data?.profilePictureUrl ||
    '';
  return { user, uniqueId, avatar };
}

// Tự động kết nối lại khi phòng Live rớt mạng / streamer chưa lên sóng (treo máy 24/7)
let tiktokManualDisconnect = false;
let tiktokReconnectTimer = null;
let tiktokReconnectAttempts = 0;

function scheduleTikTokReconnect(username) {
  if (tiktokManualDisconnect || tiktokReconnectTimer || !username) return;
  const delay = Math.min(120000, 10000 * 2 ** Math.min(tiktokReconnectAttempts, 4));
  tiktokReconnectAttempts += 1;
  console.log(`[TikTok Live] Thử kết nối lại @${username} sau ${Math.round(delay / 1000)}s...`);
  tiktokReconnectTimer = setTimeout(() => {
    tiktokReconnectTimer = null;
    if (tiktokManualDisconnect || state.tiktok.connected || state.tiktok.connecting) return;
    connectTikTokLive(username, { auto: true }).catch(() => {});
  }, delay);
}

async function connectTikTokLive(usernameOrUrl, { auto = false } = {}) {
  const cleanUser = await resolveTikTokUsername(usernameOrUrl);
  if (!cleanUser) {
    throw new Error('Không tìm thấy @username hợp lệ từ dữ liệu nhập vào');
  }

  if (!auto) {
    tiktokManualDisconnect = false;
    tiktokReconnectAttempts = 0;
  }
  clearTimeout(tiktokReconnectTimer);
  tiktokReconnectTimer = null;

  if (tiktokConn) {
    const old = tiktokConn;
    tiktokConn = null;
    try {
      await old.disconnect();
    } catch (_) {}
  }

  state.tiktok = {
    connected: false,
    connecting: true,
    username: cleanUser,
    roomId: null,
    viewerCount: 0,
    lastError: null
  };
  broadcastNotification('temple.state', getPublicState());

  const conn = new TikTokLiveConnection(cleanUser, {
    processInitialData: false,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });
  tiktokConn = conn;

  // Bỏ qua sự kiện từ kết nối cũ (đã bị thay thế): trước đây DISCONNECTED của kết nối cũ
  // bắn về sau khi kết nối mới đã lên -> ghi đè state.tiktok.connected = false
  const on = (evt, handler) => {
    conn.on(evt, (...args) => {
      if (tiktokConn !== conn) return;
      try {
        handler(...args);
      } catch (err) {
        console.warn(`[TikTok Live] Lỗi xử lý sự kiện ${evt}:`, err.message);
      }
    });
  };

  on(ControlEvent.CONNECTED, (roomState) => {
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || conn.roomId || null;
    state.tiktok.lastError = null;
    tiktokReconnectAttempts = 0;
    console.log(`[TikTok Live] Đã kết nối phòng @${cleanUser} (roomId: ${state.tiktok.roomId})`);
    broadcastNotification('temple.state', getPublicState());
  });

  on(ControlEvent.DISCONNECTED, () => {
    state.tiktok.connected = false;
    state.tiktok.connecting = false;
    state.tiktok.viewerCount = 0;
    console.log(`[TikTok Live] Đã ngắt kết nối @${cleanUser}`);
    broadcastNotification('temple.state', getPublicState());
    scheduleTikTokReconnect(cleanUser);
  });

  on(ControlEvent.ERROR, (err) => {
    state.tiktok.lastError = err?.info || err?.message || String(err);
    console.warn('[TikTok Live Warning]', state.tiktok.lastError);
    scheduleStateBroadcast();
  });

  on(WebcastEvent.ROOM_USER, (data) => {
    const viewerCount = Number(data?.total ?? data?.viewerCount ?? 0);
    if (viewerCount > 0 && viewerCount !== state.tiktok.viewerCount) {
      state.tiktok.viewerCount = viewerCount;
      broadcastNotification('temple.viewerCount', { viewerCount });
    }
  });

  on(WebcastEvent.MEMBER, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    recordDevotee(user, uniqueId, avatar, 1, 0, 0, 'Đã vào Chánh Điện lễ Phật');
    saveState();
    scheduleStateBroadcast();
  });

  on(WebcastEvent.CHAT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const commentText = data?.content || data?.comment || '';
    console.log(`[TikTok Chat] ${user}: ${commentText}`);
    parseViewerComment(commentText, user, uniqueId, avatar);
  });

  on(WebcastEvent.LIKE, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const likeCount = Math.min(15, Math.max(1, Number(data?.count ?? data?.likeCount ?? 1) || 1));
    queueLike(user, uniqueId, avatar, likeCount);
  });

  const handleSocialEvent = (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    Rituals.ringBell({
      user,
      uniqueId,
      avatar,
      count: 1,
      wish: 'Hữu duyên tương ngộ nơi cửa Phật, cầu bình an may mắn',
      readTts: false
    });
  };
  on(WebcastEvent.FOLLOW, handleSocialEvent);
  on(WebcastEvent.SHARE, handleSocialEvent);
  // Thư viện chỉ phát SOCIAL khi không nhận ra follow/share qua displayText.key
  on(WebcastEvent.SOCIAL, (data) => {
    const action = String(data?.action || '');
    const key = String(data?.common?.displayText?.key || data?.displayType || '').toLowerCase();
    if (action === '1' || action === '3' || key.includes('follow') || key.includes('share')) {
      handleSocialEvent(data);
    }
  });

  on(WebcastEvent.GIFT, (data) => {
    const { user, uniqueId, avatar } = extractUserFromEvent(data);
    const giftObj = data?.gift || data?.giftDetails || data?.extendedGiftInfo || {};
    const giftId = String(data?.giftId || giftObj?.id || 'rose');
    const groupId = `${uniqueId}_${giftId}_${data?.groupId || ''}`;
    const repeatCount = Math.max(1, Number(data?.repeatCount || data?.comboCount || 1));
    const isEnd = Boolean(data?.repeatEnd);

    // Quà combo (streak) gửi nhiều gói với repeatCount tăng dần rồi 1 gói kết thúc (repeatEnd):
    // chỉ cộng phần chênh lệch so với gói trước để không tính trùng
    const prevCount = giftComboTracker.get(groupId) || 0;
    if (isEnd) {
      giftComboTracker.delete(groupId);
      if (repeatCount <= prevCount) return;
    } else {
      giftComboTracker.delete(groupId);
      giftComboTracker.set(groupId, repeatCount);
      if (giftComboTracker.size > 500) {
        giftComboTracker.delete(giftComboTracker.keys().next().value);
      }
    }
    const deltaCount = Math.max(1, repeatCount - prevCount);

    const diamondCount = Math.max(1, Number(giftObj?.diamondCount || data?.diamondCount || 1));
    const totalCoins = diamondCount * deltaCount;
    const rawGiftName = giftObj?.name || data?.giftName || giftObj?.describe || 'Hoa Hồng Tâm Thành';
    const displayGiftName = deltaCount > 1 ? `${deltaCount}x ${rawGiftName}` : rawGiftName;

    console.log(`[TikTok Gift] ${user} gửi ${displayGiftName} (${totalCoins} xu)`);

    Rituals.offerGift({
      user,
      uniqueId,
      avatar,
      coins: totalCoins,
      giftName: displayGiftName,
      wish: `Thành tâm dâng ${displayGiftName} kính lễ Đức Phật A Di Đà`
    });
  });

  try {
    const roomState = await conn.connect();
    if (tiktokConn !== conn) return state.tiktok;
    state.tiktok.connected = true;
    state.tiktok.connecting = false;
    state.tiktok.roomId = roomState?.roomId || conn.roomId || null;
    tiktokReconnectAttempts = 0;
    broadcastNotification('temple.state', getPublicState());
    return state.tiktok;
  } catch (err) {
    if (tiktokConn === conn) {
      tiktokConn = null;
      state.tiktok.connected = false;
      state.tiktok.connecting = false;
      state.tiktok.lastError = err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)';
      broadcastNotification('temple.state', getPublicState());
      scheduleTikTokReconnect(cleanUser);
    }
    throw new Error(err?.message || 'Không thể kết nối phòng Live (kiểm tra tài khoản đang phát Live chưa)');
  }
}

function disconnectTikTokLive() {
  tiktokManualDisconnect = true;
  clearTimeout(tiktokReconnectTimer);
  tiktokReconnectTimer = null;
  if (tiktokConn) {
    const old = tiktokConn;
    tiktokConn = null;
    Promise.resolve()
      .then(() => old.disconnect())
      .catch(() => {});
  }
  state.tiktok.connected = false;
  state.tiktok.connecting = false;
  state.tiktok.viewerCount = 0;
  broadcastNotification('temple.state', getPublicState());
  return state.tiktok;
}

// ============================================================================
// 6. AUTO-SIMULATION ENGINE (CHẾ ĐỘ TỰ ĐỘNG GIẢ LẬP ĐÔNG NGƯỜI XEM)
// ============================================================================
let autoSimTimer = null;
const SIM_DEVOTEES = [
  { user: 'Ngọc Anh Nguyễn', uniqueId: 'ngocanh.98', wish: 'Con thành tâm cầu cho bố mẹ luôn mạnh khỏe, bình an' },
  { user: 'Trần Minh Quân', uniqueId: 'minhquan_bds', wish: 'Cầu tháng mới công việc thuận buồm xuôi gió, tài lộc hanh thông' },
  { user: 'Diệu Thảo Tâm An', uniqueId: 'tam_an_99', wish: 'Nam Mô A Di Đà Phật, nguyện cầu thế giới hòa bình chúng sinh an lạc' },
  { user: 'Lê Hoàng Nam', uniqueId: 'hoangnam.dev', wish: 'Cầu thi cử đỗ đạt điểm cao, sự nghiệp rộng mở' },
  { user: 'Phạm Thanh Hà', uniqueId: 'thanhha.lotus', wish: 'Cầu gia đạo êm ấm, con cái ngoan ngoãn học giỏi' },
  { user: 'Vũ Đức Thịnh', uniqueId: 'ducthinh88', wish: 'Con xin gieo một quẻ cầu tài lộc đầu năm' }
];

function runSingleSimulationStep() {
  const pick = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
  const roll = Math.random();
  if (roll < 0.30) {
    Rituals.burnIncense({ user: pick.user, uniqueId: pick.uniqueId, count: 3, wish: pick.wish });
  } else if (roll < 0.55) {
    Rituals.sendPrayer({ user: pick.user, uniqueId: pick.uniqueId, wish: pick.wish });
  } else if (roll < 0.75) {
    Rituals.drawFortune({ user: pick.user, uniqueId: pick.uniqueId, topic: pick.wish });
  } else if (roll < 0.90) {
    Rituals.offerGift({ user: pick.user, uniqueId: pick.uniqueId, giftType: 'lotus', coins: 15, giftName: 'Hoa Sen Vàng Tinh Khiết' });
  } else {
    Rituals.ringBell({ user: pick.user, uniqueId: pick.uniqueId, count: 1, wish: pick.wish, readTts: true });
  }
}

function configureAutoSim(enabled) {
  state.settings.autoSim = Boolean(enabled);
  if (autoSimTimer) {
    clearInterval(autoSimTimer);
    autoSimTimer = null;
  }
  if (state.settings.autoSim) {
    runSingleSimulationStep();
    autoSimTimer = setInterval(runSingleSimulationStep, state.settings.autoSimIntervalMs || 9500);
  }
}

// ============================================================================
// 7. JSON-RPC 2.0 DISPATCHER
// ============================================================================
async function handleRpcCall(method, params = {}) {
  switch (method) {
    case 'temple.getState':
      return getPublicState();
    case 'temple.burnIncense':
      return Rituals.burnIncense(params);
    case 'temple.strikeWoodenFish':
      return Rituals.strikeWoodenFish(params);
    case 'temple.ringBell':
      return Rituals.ringBell(params);
    case 'temple.sendPrayer':
      return Rituals.sendPrayer(params);
    case 'temple.offerGift':
      return Rituals.offerGift(params);
    case 'temple.drawFortune':
      return Rituals.drawFortune(params);
    case 'temple.grandCeremony':
      return Rituals.grandCeremony(params);
    case 'temple.updateSettings':
      return Rituals.updateSettings(params);
    case 'temple.resetMerit':
      return Rituals.resetMerit();
    case 'temple.comment':
      return parseViewerComment(params.comment, params.user, params.uniqueId, params.avatar);
    case 'temple.speak': {
      const res = await zeroTts.synthesize(params.text, params.voice || 'maichi');
      if (res.ok && params.broadcast !== false) {
        broadcastNotification('tts.play', {
          text: String(params.text || '').slice(0, 300),
          voice: res.voice,
          url: res.url
        });
      }
      return res;
    }
    case 'temple.ttsStatus':
      return zeroTts.getStatus();
    case 'live.connect':
      return await connectTikTokLive(params.username);
    case 'live.disconnect':
      return disconnectTikTokLive();
    case 'live.setAutoSim':
      configureAutoSim(Boolean(params.enabled));
      saveState();
      broadcastNotification('temple.state', getPublicState());
      return getPublicState();
    default:
      throw new Error(`Không tìm thấy phương thức JSON-RPC: ${method}`);
  }
}

// ============================================================================
// 8. EXPRESS + WEBSOCKET SERVER
// ============================================================================
const app = express();

// CORS mở toàn bộ (cors()) cho phép BẤT KỲ trang web nào streamer đang mở gọi vào
// http://localhost:3000/rpc để reset Bảng Công Đức hay bắt giọng đọc nói bậy trên sóng.
// Mặc định chỉ cho phép localhost; thêm origin khác qua biến môi trường CORS_ORIGINS (cách nhau dấu phẩy).
const EXTRA_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true; // curl, Streamer.bot, TikFinity, file://
  if (EXTRA_ORIGINS.includes('*') || EXTRA_ORIGINS.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch (_) {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin))
  })
);
app.use(express.json({ limit: '64kb' }));
app.use('/tts-cache', express.static(TTS_CACHE_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// HTTP JSON-RPC 2.0 Endpoint
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
    const result = await handleRpcCall(method, params || {});
    res.json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      result
    });
  } catch (err) {
    res.status(200).json({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code: -32000, message: err.message || 'Server error' }
    });
  }
});

// ZeroTTS HTTP Endpoint (Mai Chi default)
app.all('/api/tts', async (req, res) => {
  const text = String(req.body?.text || req.query?.text || '').trim().slice(0, 500);
  const voice = String(req.body?.voice || req.query?.voice || state.settings.ttsVoice || 'maichi').trim();
  if (!text) {
    return res.status(400).json({ ok: false, error: 'Thiếu nội dung text cần đọc' });
  }
  const result = await zeroTts.synthesize(text, voice);
  res.json(result);
});

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: '/ws',
  // Trình duyệt luôn gửi Origin khi mở WebSocket -> chặn trang web lạ điều khiển chùa qua ws://localhost
  verifyClient: ({ origin, req }) => {
    if (isAllowedOrigin(origin)) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch (_) {
      return false;
    }
  }
});

function broadcastNotification(method, params) {
  const payload = JSON.stringify({
    jsonrpc: '2.0',
    method,
    params
  });
  for (const client of wss.clients) {
    // Bỏ qua client quá chậm (OBS bị treo...) để bộ đệm gửi không phình to vô hạn
    if (client.readyState === 1 && client.bufferedAmount < 4 * 1024 * 1024) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('error', (err) => console.warn('[WS] Lỗi client:', err.message));
  ws.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'temple.state',
      params: getPublicState()
    })
  );

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch (_) {
      return;
    }
    if (!msg || !msg.method) return;
    if (ws.readyState !== 1) return;
    try {
      const result = await handleRpcCall(msg.method, msg.params || {});
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            result
          })
        );
      }
    } catch (err) {
      if (msg.id !== undefined) {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32000, message: err.message || 'RPC Error' }
          })
        );
      }
    }
  });
});

zeroTts = new ZeroTTSManager();

server.listen(PORT, () => {
  console.log(`============================================================`);
  console.log(`🪷 CHÙA ONLINE TIKTOK LIVE RPC ĐÃ KHỞI ĐỘNG`);
  console.log(`📺 Màn hình Live (9:16 OBS): http://localhost:${PORT}`);
  console.log(`🎛️ Bảng điều khiển RPC Admin: http://localhost:${PORT}/admin`);
  console.log(`🔌 JSON-RPC 2.0 Endpoint   : http://localhost:${PORT}/rpc (ws://localhost:${PORT}/ws)`);
  console.log(`============================================================`);

  // Khôi phục chế độ giả lập nếu lần trước đang bật (trước đây state lưu autoSim = true nhưng không chạy)
  if (state.settings.autoSim) {
    configureAutoSim(true);
  }

  // Tự động kết nối tới @zenfacts_vn ngay khi khởi động server (tự thử lại nếu chưa lên Live)
  const defaultChannel = process.env.TIKTOK_USER || state.tiktok?.username || 'zenfacts_vn';
  if (defaultChannel) {
    connectTikTokLive(defaultChannel).catch((err) => {
      console.warn(`[Auto-Connect @${defaultChannel}] Chưa kết nối được ngay:`, err.message);
    });
  }
});

server.on('error', (err) => {
  console.error(`[Server] Không mở được cổng ${PORT}:`, err.message);
  shutdown(1);
});

// Tắt server an toàn: lưu Bảng Công Đức ngay lập tức và dừng worker Python
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[Server] Đang lưu trạng thái và tắt...');
  saveStateSync();
  if (zeroTts) zeroTts.stop();
  if (tiktokConn) {
    try { tiktokConn.disconnect(); } catch (_) {}
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('unhandledRejection', (err) => {
  console.warn('[Server] Unhandled rejection:', err?.message || err);
});
