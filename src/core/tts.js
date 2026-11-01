const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ROOT, TTS_WORKER } = require('../config');

// ============================================================================
// ZEROTTS PYTHON WORKER MANAGER (VOICE: MAI CHI) — dùng chung cho mọi phòng
// ============================================================================
class ZeroTTSManager {
  constructor({ onStatus } = {}) {
    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
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

  emitStatus() {
    try {
      this.onStatus(this.getStatus());
    } catch (_) {}
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
    const venvPy = path.join(ROOT, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPy)) return venvPy;
    return 'python3';
  }

  startWorker() {
    const pyBin = this.resolvePythonBin();
    console.log(`[ZeroTTS] Khởi chạy worker với ${pyBin} (Giọng mặc định: Mai Chi)...`);

    this.status = 'loading';
    this.ready = false;
    this.buffer = '';
    const proc = spawn(pyBin, [TTS_WORKER], {
      cwd: ROOT,
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
      this.emitStatus();
      this.scheduleRestart();
    });
    // Ghi vào stdin khi worker vừa chết sẽ ném EPIPE -> bắt lại để không crash
    proc.stdin.on('error', (err) => {
      console.warn('[ZeroTTS] stdin error:', err.message);
    });

    proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      const lines = this.buffer.split('\n');
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
      this.emitStatus();
      this.scheduleRestart();
    });
  }

  handleWorkerLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (_) {
      console.log('[ZeroTTS stdout]', line);
      return;
    }
    if (msg.type === 'status') {
      this.status = msg.status;
      this.model = msg.model || this.model;
      this.emitStatus();
    } else if (msg.type === 'ready') {
      this.ready = true;
      this.status = 'ready';
      this.restartAttempts = 0;
      this.voice = msg.voice || 'maichi';
      this.voices = msg.voices || ['maichi'];
      this.model = msg.model || this.model;
      console.log(`[ZeroTTS] Sẵn sàng sau ${msg.loadSec}s! Giọng: ${this.voice} (${this.voices.join(', ')})`);
      this.emitStatus();
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
      this.emitStatus();
    }
  }

  getStatus(voiceOverride) {
    return {
      ready: this.ready,
      status: this.status,
      engine: 'ZeroTTS (zeroweight-ai/ZeroTTS)',
      voice: voiceOverride || this.voice || 'maichi',
      voices: this.voices,
      model: this.model
    };
  }

  synthesize(text, voiceOverride) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return Promise.resolve({ ok: false, error: 'Empty text' });
    const voice = String(voiceOverride || this.voice || 'maichi').toLowerCase();
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

module.exports = { ZeroTTSManager };
