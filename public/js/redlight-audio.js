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
    constructor({ assetVer = '' } = {}) {
      this.assetVer = assetVer;
      this.samples = {}; // tiếng thu sẵn (AudioBuffer): turn / back = búp bê quay đầu ra / quay lưng lại
      this.ctx = null;
      this.master = null;
      this.musicBus = null;
      this.sfxBus = null;
      this.muted = false;
      this.musicOn = true;
      this.sfxOn = true;
      this.musicVolume = 0.55;
      this.dollTurnVolume = 0.1; // tiếng servo búp bê xoay đầu (cài đặt dollTurnVolume)
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
        // iPhone (Safari 17+): xếp tiếng trang vào loại "phát nhạc" để gạt công tắc im lặng vẫn có tiếng
        try {
          if (navigator.audioSession) navigator.audioSession.type = 'playback';
        } catch (_) {}
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
        this.comp = comp;
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(comp);
        this.sfxBus.connect(comp);
        this.applyVolumes();
        this.loadSamples();
      }
      // 'interrupted': iPhone ngắt tiếng khi chuyển sang app khác (TikTok) rồi quay lại
      if ((this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') && !this.muted) this.ctx.resume().catch(() => {});
      return this.ctx;
    }

    // Tiếng hát búp bê (thẻ <audio>) đi qua cùng bộ nén / giới hạn; tắt "hiệu ứng" là tắt luôn tiếng hát
    connectVoice(el) {
      if (!this.ensure()) return false;
      try {
        const src = this.ctx.createMediaElementSource(el);
        src.connect(this.sfxBus);
        return true;
      } catch (_) {
        return false;
      }
    }

    // Nhạc nền chờ ván (thẻ <audio>) đi qua kênh nhạc: theo nút bật nhạc nền + âm lượng nhạc nền
    connectMusic(el) {
      if (!this.ensure()) return false;
      try {
        const src = this.ctx.createMediaElementSource(el);
        src.connect(this.musicBus);
        return true;
      } catch (_) {
        return false;
      }
    }

    setMuted(m) {
      this.muted = m;
      if (!this.ctx) return;
      if (m) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    }

    configure({ musicOn, sfxOn, musicVolume, dollTurnVolume }) {
      if (typeof dollTurnVolume === 'number') this.dollTurnVolume = dollTurnVolume;
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
      // nốt trầm (tiếng máy quay đầu đã phát lúc búp bê bắt đầu quay: dollTurn)
      this.osc(midi(38), t, 1.4, { type: 'sawtooth', vol: 0.09, slide: -20, attack: 0.02 });
      this.osc(midi(26), t, 1.6, { type: 'sine', vol: 0.25, attack: 0.02 });
      this.loopKind = 'red';
      const beat = () => {
        const n = this.t;
        this.osc(55, n, 0.18, { type: 'sine', vol: 0.32, slide: -15, attack: 0.004, bus: 'music' });
        this.osc(50, n + 0.22, 0.2, { type: 'sine', vol: 0.24, slide: -12, attack: 0.004, bus: 'music' });
        // quét: dải nhiễu trượt qua lại
        this.noise(n + 0.1, 0.7, { vol: 0.018, type: 'bandpass', freq: 600, sweepTo: 2400, q: 6, bus: 'music' });
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

    // Thả boom: tiếng "tẹtttt" dài — giọng trầm rung (răng cưa + điều tần nhanh) qua lọc thấp, kèm tiếng xì
    fart() {
      const c = this.ensure();
      if (!c) return;
      const t = this.t + 0.02;
      const dur = 1.6;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(95, t);
      o.frequency.linearRampToValueAtTime(70, t + dur * 0.7);
      o.frequency.linearRampToValueAtTime(110, t + dur);
      const lfo = c.createOscillator();
      lfo.frequency.setValueAtTime(26, t);
      lfo.frequency.linearRampToValueAtTime(18, t + dur);
      const lfoGain = c.createGain();
      lfoGain.gain.value = 35;
      lfo.connect(lfoGain).connect(o.frequency);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 520;
      f.Q.value = 6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.04);
      g.gain.setValueAtTime(0.3, t + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(this.sfxBus);
      o.start(t);
      lfo.start(t);
      o.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);
      this.noise(t, dur, { vol: 0.06, type: 'bandpass', freq: 700, q: 1.5 });
    }

    chicken() {
      const t = this.t;
      for (let i = 0; i < 3; i++) this.osc(800, t + 0.05 + i * 0.13, 0.09, { type: 'square', vol: 0.1, slide: 600, attack: 0.003 });
      this.osc(1000, t + 0.5, 0.3, { type: 'square', vol: 0.1, slide: -500, attack: 0.01 });
    }

    // Tiếng servo búp bê quay đầu: file tạo sẵn (ù mô-tơ + rít bánh răng, cuối trượt xuống), khớp TURN_MS 1000 / BACK_MS 700
    loadSamples() {
      const list = [
        ['turn', 'doll_turn.m4a'],
        ['back', 'doll_back.m4a']
      ];
      for (const [name, file] of list) {
        fetch(`/assets/redlight/${file}?v=${this.assetVer}`)
          .then((r) => r.arrayBuffer())
          .then((b) => this.ctx.decodeAudioData(b))
          .then((buf) => (this.samples[name] = buf))
          .catch(() => {});
      }
    }

    playSample(name, vol) {
      const buf = this.samples[name];
      if (!buf || !this.ensure()) return false;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.sfxBus);
      src.start();
      return true;
    }

    // Búp bê quay đầu: phát file servo; chưa tải xong thì tạo tiếng mô-tơ tạm bằng WebAudio
    dollTurn(dur = 0.5, back = false) {
      const v = this.dollTurnVolume * (back ? 0.7 : 1);
      if (v <= 0.001) return;
      if (this.playSample(back ? 'back' : 'turn', v)) return;
      const c = this.ensure();
      if (!c) return;
      const t = this.t;
      const d = dur + 0.12;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(back ? 112 : 92, t);
      o.frequency.linearRampToValueAtTime(back ? 92 : 116, t + d);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 950;
      lp.Q.value = 2;
      // bánh răng: biên độ rung theo nhịp vuông ~30 Hz
      const gear = c.createGain();
      gear.gain.value = 0.65;
      const lfo = c.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 29 + Math.random() * 6;
      const depth = c.createGain();
      depth.gain.value = 0.35;
      lfo.connect(depth).connect(gear.gain);
      const env = c.createGain();
      const vol = Math.max(0.0002, (back ? 0.12 : 0.18) * Math.min(1, v / 0.4));
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(vol, t + 0.04);
      env.gain.setValueAtTime(vol, t + d - 0.06);
      env.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(lp).connect(gear).connect(env).connect(this.sfxBus);
      o.start(t);
      lfo.start(t);
      o.stop(t + d + 0.05);
      lfo.stop(t + d + 0.05);
      const k = Math.min(1, v / 0.4);
      this.osc(1906, t + 0.03, d, { vol: Math.max(0.0002, (back ? 0.018 : 0.028) * k), slide: back ? -60 : 90, attack: 0.06 });
      this.osc(2859, t + 0.03, d, { vol: Math.max(0.0002, (back ? 0.012 : 0.018) * k), slide: back ? -90 : 130, attack: 0.06 });
      this.noise(t, d, { vol: Math.max(0.0002, 0.05 * k), type: 'bandpass', freq: 1700, q: 1.3 });
    }

    // Lòng mắt người máy lia sang chỗ khác: "zzt" servo ~4 kHz ngắn; lock = khoá vào người vừa bị phát hiện
    eyeServo(lock = false) {
      if (!this.ensure()) return;
      const t = this.t;
      if (t - (this.lastEye || 0) < 0.1) return;
      this.lastEye = t;
      const f0 = 3750 + Math.random() * 450;
      const dir = Math.random() < 0.5 ? -1 : 1;
      this.noise(t, 0.015, { vol: 0.022, type: 'highpass', freq: 5000 });
      this.osc(f0, t, 0.16, { type: 'triangle', vol: 0.02, slide: lock ? 600 : dir * 260, attack: 0.012 });
      this.osc(f0 / 2, t, 0.16, { vol: 0.008, slide: dir * 120, attack: 0.012 });
      this.noise(t, 0.16, { vol: 0.013, type: 'bandpass', freq: f0, q: 9 });
      if (lock) this.osc(2637, t + 0.16, 0.12, { type: 'square', vol: 0.018, attack: 0.003 });
    }

    // Bước chân khổng lồ: "thịch" trầm + bụi
    stompStep() {
      if (!this.ensure()) return;
      const t = this.t;
      this.osc(58, t, 0.28, { vol: 0.45, slide: -22, attack: 0.004 });
      this.noise(t, 0.18, { vol: 0.18, type: 'lowpass', freq: 380 });
    }

    shieldSave() {
      const t = this.t;
      this.osc(midi(96), t, 0.4, { vol: 0.08 });
      this.osc(midi(103), t + 0.04, 0.5, { vol: 0.05 });
    }
  }

  window.RLAudio = RLAudio;
})();
