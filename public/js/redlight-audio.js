/**
 * Bộ âm thanh phòng "Đèn Xanh – Đèn Đỏ" — tự tạo hoàn toàn bằng WebAudio (không dùng file, không dính bản quyền).
 * Cấu trúc mượn từ thể loại game này: đèn xanh có một câu hát kéo giãn vừa khít thời gian đèn xanh
 * (hết câu = đèn đỏ), đèn đỏ tắt nhạc → tiếng tim đập + quét, người phạm luật bị "bụp" dồn dập.
 * Giai điệu là câu ngũ cung tự sáng tác theo kiểu đồng dao Việt.
 */
(function () {
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const MASTER_GAIN = 3.2;

  // Câu "Đèn xanh, đèn xanh — chạy mau, chạy mau — ai mà còn động — đèn… đỏ!"
  // [nốt MIDI, độ dài tương đối]; nốt cuối dài, rơi đúng lúc bật đèn đỏ
  const SONG = [
    [69, 1], [72, 1], [69, 2],
    [67, 1], [69, 1], [67, 2],
    [65, 1], [67, 1], [69, 1], [72, 1],
    [74, 1.5], [72, 0.5], [69, 2],
    [62, 3]
  ];
  // Nhạc chờ vào (lobby): vòng arpeggio ngũ cung vui
  const LOBBY = [65, 69, 72, 74, 72, 69, 67, 69, 65, 67, 69, 72, 69, 67, 65, 62];

  class RLAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicBus = null;
      this.sfxBus = null;
      this.muted = false;
      this.musicOn = true;
      this.sfxOn = true;
      this.musicVolume = 0.55;
      this.sfxVolume = 0.9;
      this.songNodes = [];
      this.loopTimer = null;
      this.loopKind = '';
      this.heartTimer = null;
      this.tickTimer = null;
      this.outQueue = 0;
      this.outTimer = null;
    }

    ensure() {
      if (!this.ctx) {
        try {
          this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (_) {
          return null;
        }
        // buses → nén → khuếch đại tổng → giới hạn (to, đều trên loa điện thoại mà không vỡ tiếng)
        this.master = this.ctx.createGain();
        this.master.gain.value = MASTER_GAIN;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -3;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.1;
        this.master.connect(limiter).connect(this.ctx.destination);
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 4;
        comp.connect(this.master);
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(comp);
        this.sfxBus.connect(comp);
        this.applyVolumes();
      }
      if (this.ctx.state === 'suspended' && !this.muted) this.ctx.resume().catch(() => {});
      return this.ctx;
    }

    setMuted(m) {
      this.muted = m;
      if (!this.ctx) return;
      if (m) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    }

    configure({ musicOn, sfxOn, musicVolume }) {
      if (typeof musicOn === 'boolean') this.musicOn = musicOn;
      if (typeof sfxOn === 'boolean') this.sfxOn = sfxOn;
      if (typeof musicVolume === 'number') this.musicVolume = musicVolume;
      this.applyVolumes();
    }

    applyVolumes() {
      if (!this.ctx) return;
      this.musicBus.gain.value = this.musicOn ? this.musicVolume : 0;
      this.sfxBus.gain.value = this.sfxOn ? this.sfxVolume : 0;
    }

    get t() {
      return this.ctx ? this.ctx.currentTime : 0;
    }

    // ------------------------------------------------------------------
    // Khối âm cơ bản
    // ------------------------------------------------------------------
    osc(freq, at, dur, { type = 'sine', vol = 0.2, slide = 0, attack = 0.01, bus = 'sfx', detune = 0, track } = {}) {
      const c = this.ensure();
      if (!c) return null;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.detune.value = detune;
      o.frequency.setValueAtTime(freq, at);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(bus === 'music' ? this.musicBus : this.sfxBus);
      o.start(at);
      o.stop(at + dur + 0.05);
      if (track) track.push(o);
      return o;
    }

    noise(at, dur, { vol = 0.2, type = 'highpass', freq = 1000, q = 0.7, sweepTo = 0, bus = 'sfx', track } = {}) {
      const c = this.ensure();
      if (!c) return;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, at);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.01, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f).connect(g).connect(bus === 'music' ? this.musicBus : this.sfxBus);
      src.start(at);
      if (track) track.push(src);
    }

    // Tiếng "đàn" gảy (đàn tranh / marimba): sine + bồi âm tắt nhanh
    pluck(m, at, dur, vol = 0.18, track) {
      const f = midi(m);
      this.osc(f, at, Math.min(1.2, dur + 0.25), { type: 'triangle', vol, attack: 0.005, bus: 'music', track });
      this.osc(f * 2, at, Math.min(0.5, dur), { type: 'sine', vol: vol * 0.35, attack: 0.004, bus: 'music', track });
      this.osc(f * 3.01, at, 0.15, { type: 'sine', vol: vol * 0.12, attack: 0.002, bus: 'music', track });
    }

    // Tiếng "sáo": sine có rung + hơi thở
    flute(m, at, dur, vol = 0.12, track) {
      const c = this.ensure();
      if (!c) return;
      const f = midi(m);
      const o = c.createOscillator();
      const lfo = c.createOscillator();
      const lg = c.createGain();
      const g = c.createGain();
      o.frequency.value = f;
      lfo.frequency.value = 5.5;
      lg.gain.value = f * 0.012;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.04);
      g.gain.setValueAtTime(vol, at + Math.max(0.05, dur - 0.06));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(this.musicBus);
      o.start(at);
      lfo.start(at);
      o.stop(at + dur + 0.05);
      lfo.stop(at + dur + 0.05);
      if (track) track.push(o, lfo);
      this.noise(at, Math.min(0.08, dur), { vol: vol * 0.25, type: 'bandpass', freq: f * 2, q: 2, bus: 'music', track });
    }

    kick(at, vol = 0.35, track) {
      this.osc(120, at, 0.22, { type: 'sine', vol, slide: -80, attack: 0.002, bus: 'music', track });
    }
    hat(at, vol = 0.05, track) {
      this.noise(at, 0.04, { vol, type: 'highpass', freq: 7000, bus: 'music', track });
    }

    // ------------------------------------------------------------------
    // Nhạc theo pha
    // ------------------------------------------------------------------
    stopSong() {
      for (const n of this.songNodes) {
        try {
          n.stop();
        } catch (_) {}
      }
      this.songNodes = [];
    }

    stopLoops() {
      clearInterval(this.loopTimer);
      clearInterval(this.heartTimer);
      clearInterval(this.tickTimer);
      this.loopTimer = this.heartTimer = this.tickTimer = null;
      this.loopKind = '';
    }

    // Đèn xanh: hát câu đồng dao kéo giãn vừa khít `seconds` (tới lúc đèn đỏ), kèm nhịp trống nhẹ
    greenSong(seconds) {
      if (!this.ensure()) return;
      this.stopSong();
      this.stopLoops();
      const total = SONG.reduce((s, [, d]) => s + d, 0);
      const dur = Math.max(2.2, seconds);
      const unit = dur / total;
      let at = this.t + 0.05;
      const track = this.songNodes;
      SONG.forEach(([m, d], i) => {
        const len = d * unit;
        const last = i === SONG.length - 1;
        this.flute(m, at, len * 0.95, last ? 0.16 : 0.12, track);
        this.pluck(m - 12, at, len, 0.08, track);
        at += len;
      });
      // trống: phách mạnh mỗi 2 đơn vị, nhanh dần không cần — nhịp theo câu hát
      for (let b = 0; b < total - 3; b += 2) {
        this.kick(this.t + 0.05 + b * unit, 0.22, track);
        this.hat(this.t + 0.05 + (b + 1) * unit, 0.05, track);
      }
    }

    // Đèn đỏ: tắt nhạc, tiếng "quay đầu" + tim đập + tiếng quét
    redLight() {
      if (!this.ensure()) return;
      this.stopSong();
      this.stopLoops();
      const t = this.t;
      // tiếng gỗ "cạch" quay đầu + nốt trầm
      this.noise(t, 0.08, { vol: 0.35, type: 'bandpass', freq: 900, q: 3 });
      this.osc(midi(38), t, 1.4, { type: 'sawtooth', vol: 0.09, slide: -20, attack: 0.02 });
      this.osc(midi(26), t, 1.6, { type: 'sine', vol: 0.25, attack: 0.02 });
      this.loopKind = 'red';
      const beat = () => {
        const n = this.t;
        this.osc(55, n, 0.18, { type: 'sine', vol: 0.32, slide: -15, attack: 0.004, bus: 'music' });
        this.osc(50, n + 0.22, 0.2, { type: 'sine', vol: 0.24, slide: -12, attack: 0.004, bus: 'music' });
        // quét: dải nhiễu trượt qua lại
        this.noise(n + 0.1, 0.7, { vol: 0.04, type: 'bandpass', freq: 600, sweepTo: 2400, q: 6, bus: 'music' });
      };
      beat();
      this.heartTimer = setInterval(beat, 900);
    }

    // Báo trước (đèn vàng): tiếng tích tắc dồn — câu hát đang tới đoạn cuối
    warn() {
      if (!this.ensure()) return;
      const t = this.t;
      for (let i = 0; i < 4; i++) this.osc(1760, t + i * 0.25, 0.08, { type: 'square', vol: 0.1, attack: 0.002 });
    }

    lobbyLoop() {
      if (!this.ensure() || this.loopKind === 'lobby') return;
      this.stopSong();
      this.stopLoops();
      this.loopKind = 'lobby';
      const step = 0.22;
      let i = 0;
      const bar = () => {
        const t = this.t + 0.05;
        for (let k = 0; k < 8; k++) {
          const m = LOBBY[(i + k) % LOBBY.length];
          this.pluck(m, t + k * step, step * 1.5, 0.1);
          if (k % 4 === 0) this.kick(t + k * step, 0.18);
          if (k % 2 === 1) this.hat(t + k * step, 0.035);
        }
        this.pluck(LOBBY[i % LOBBY.length] - 24, t, step * 8, 0.09);
        i += 8;
      };
      bar();
      this.loopTimer = setInterval(bar, step * 8 * 1000);
    }

    resultJingle(hasWinner) {
      if (!this.ensure()) return;
      this.stopSong();
      this.stopLoops();
      const t = this.t + 0.05;
      const notes = hasWinner ? [65, 69, 72, 77, 74, 77] : [69, 67, 65, 62];
      notes.forEach((m, i) => {
        this.pluck(m, t + i * 0.16, 0.5, 0.16);
        this.flute(m + 12, t + i * 0.16, 0.18, 0.06);
      });
      if (hasWinner) {
        this.kick(t, 0.3);
        this.noise(t + notes.length * 0.16, 1.2, { vol: 0.08, type: 'bandpass', freq: 3000, q: 0.8 }); // tiếng hò reo
        [77, 81, 84].forEach((m) => this.pluck(m, t + notes.length * 0.16, 1.4, 0.1));
      }
    }

    // Đếm ngược 3-2-1 + còi xuất phát
    countdownGo() {
      if (!this.ensure()) return;
      const t = this.t;
      this.osc(2100, t, 0.18, { vol: 0.12 });
      this.osc(2350, t + 0.2, 0.35, { vol: 0.12 });
    }

    // 10 giây cuối ván: tích mỗi giây, cao dần
    finalTick(sec) {
      if (!this.ensure()) return;
      this.osc(1000 + (10 - sec) * 60, this.t, 0.07, { type: 'square', vol: 0.045, attack: 0.002 });
    }

    // ------------------------------------------------------------------
    // Hiệu ứng
    // ------------------------------------------------------------------
    // Người bị loại: "bụp" (súng nhựa / pháo giấy) — nhiều người thì dồn thành tràng như video mẫu
    out() {
      this.outQueue = Math.min(this.outQueue + 1, 14);
      if (this.outTimer) return;
      const fire = () => {
        if (this.outQueue <= 0) {
          clearInterval(this.outTimer);
          this.outTimer = null;
          // vỏ đạn rơi lanh canh
          const t = this.t + 0.1;
          for (let i = 0; i < 3; i++) this.osc(4200 + Math.random() * 1500, t + i * 0.09 + Math.random() * 0.04, 0.12, { vol: 0.03, attack: 0.002 });
          return;
        }
        this.outQueue--;
        const t = this.t;
        this.noise(t, 0.09, { vol: 0.8, type: 'bandpass', freq: 2800 + Math.random() * 800, q: 0.9 });
        this.osc(140, t, 0.16, { type: 'sine', vol: 0.6, slide: -90, attack: 0.002 });
        this.noise(t + 0.02, 0.25, { vol: 0.15, type: 'lowpass', freq: 700 });
      };
      fire();
      this.outTimer = setInterval(fire, 110);
    }

    join() {
      this.osc(midi(84 + Math.floor(Math.random() * 3) * 2), this.t, 0.09, { vol: 0.05, attack: 0.003 });
    }

    finish(rank) {
      const t = this.t;
      const base = rank <= 3 ? 77 : 72;
      [0, 4, 7, 12].forEach((d, i) => this.pluck(base + d, t + i * 0.06, 0.4, rank <= 3 ? 0.16 : 0.09));
      if (rank <= 3) this.noise(t + 0.2, 0.9, { vol: 0.06, type: 'bandpass', freq: 2500, q: 0.6 });
    }

    gift(kind) {
      const t = this.t;
      [88, 91, 96].forEach((m, i) => this.osc(midi(m), t + i * 0.05, 0.22, { vol: 0.05 }));
      switch (kind) {
        case 'turbo': // vút lên
          this.osc(300, t + 0.05, 0.45, { type: 'sawtooth', vol: 0.12, slide: 1500, attack: 0.02 });
          this.noise(t + 0.05, 0.4, { vol: 0.14, type: 'bandpass', freq: 800, sweepTo: 5000, q: 2 });
          break;
        case 'shield': // keng lấp lánh
        case 'teamShield':
          [93, 100, 105].forEach((m, i) => this.osc(midi(m), t + 0.08 + i * 0.07, 0.6, { vol: 0.06 }));
          break;
        case 'buffalo': // "ò…" trâu rống + vó
          this.osc(110, t + 0.05, 0.9, { type: 'sawtooth', vol: 0.12, slide: 50, attack: 0.08 });
          this.osc(165, t + 0.05, 0.9, { type: 'sawtooth', vol: 0.05, slide: 60, attack: 0.08 });
          for (let i = 0; i < 6; i++) this.noise(t + 0.4 + i * 0.12, 0.06, { vol: 0.15, type: 'lowpass', freq: 400 });
          break;
        case 'clones': // bụp bụp bụp
          for (let i = 0; i < 5; i++) this.osc(500 + i * 120, t + 0.05 + i * 0.07, 0.08, { type: 'sine', vol: 0.09, slide: 300, attack: 0.003 });
          break;
        case 'wind': // gió lốc
          this.noise(t + 0.05, 1.3, { vol: 0.35, type: 'bandpass', freq: 300, sweepTo: 2200, q: 3 });
          break;
        case 'giant': // bước chân khổng lồ
          for (let i = 0; i < 3; i++) this.osc(70, t + 0.05 + i * 0.35, 0.3, { type: 'sine', vol: 0.4, slide: -35, attack: 0.003 });
          break;
        case 'chicken':
          this.chicken();
          break;
        default:
          break;
      }
    }

    chicken() {
      const t = this.t;
      for (let i = 0; i < 3; i++) this.osc(800, t + 0.05 + i * 0.13, 0.09, { type: 'square', vol: 0.1, slide: 600, attack: 0.003 });
      this.osc(1000, t + 0.5, 0.3, { type: 'square', vol: 0.1, slide: -500, attack: 0.01 });
    }

    shieldSave() {
      const t = this.t;
      this.osc(midi(96), t, 0.4, { vol: 0.08 });
      this.osc(midi(103), t + 0.04, 0.5, { vol: 0.05 });
    }
  }

  window.RLAudio = RLAudio;
})();
