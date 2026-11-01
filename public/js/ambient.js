/**
 * AmbientMusic — nhạc nền không lời, êm, tự tạo trong trình duyệt (không dùng bản ghi có bản quyền).
 *
 * Dựa trên ghi chú nghiên cứu "research_notes/Nhịp mõ chuông và nhạc nền/chill_music.md":
 *  - Không lời, không bộ gõ, không nhịp rõ; âm sắc mềm, mức nhỏ (yếu tố thư giãn có bằng chứng tốt nhất)
 *  - Pad kiểu Brian Eno: mỗi giọng một nốt cố định, vòng lặp dài khác nhau (19.7 / 23.3 / 27.1 / 31.9 / 37.3 / 41.1 s)
 *    nên không bao giờ lặp lại y hệt — tránh cảm giác "máy móc" của hợp âm đánh lại đều mỗi 9 giây
 *  - Drone trầm, đổi giọng (C → F → G) mỗi 6–12 phút; giai điệu kalimba (FM) đi bộ ngẫu nhiên trên ngũ cung
 *  - Chuông xoay (singing bowl) với các bội âm không điều hoà; tiếng suối (brown noise) rất nhỏ
 *  - Vang chung (Convolver), khoét −4 dB quanh 750 Hz để tiếng mõ luôn rõ, nén + giới hạn đỉnh
 * Các thông số là mặc định kỹ thuật, nên chỉnh theo tai nghe thực tế.
 */
class AmbientMusic {
  constructor(ctx, { volume = 0.45, nature = true } = {}) {
    this.ctx = ctx;
    this.volume = volume;
    this.natureEnabled = nature;
    this.running = false;
    this.timer = null;
    this.rand = AmbientMusic.mulberry32(Date.now() & 0xffffffff);
    this.transpose = 0; // 0 = C, 5 = F, 7 = G
    this.activity = 0.5;
    this.restUntil = 0;
    this.nextKeyChange = 0;
    this.nextActivityStep = 0;
    this.nextRest = 0;
    this.nextPhraseAt = 0;
    this.phraseNotesLeft = 0;
    this.melodyStep = 5;
    this.nextBowlAt = 0;
    this.blockMelodyUntil = 0;
    this.buildGraph();
  }

  static mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  r(min, max) {
    return min + (max - min) * this.rand();
  }

  // Ngũ cung trưởng (C D E G A) theo bậc, quanh MIDI 60 = C4
  scaleMidi(step) {
    const PENTA = [0, 2, 4, 7, 9];
    const oct = Math.floor(step / 5);
    const deg = ((step % 5) + 5) % 5;
    return 48 + this.transpose + oct * 12 + PENTA[deg];
  }

  static mtof(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  // ------------------------------------------------------------------------
  // Đồ thị âm thanh
  // ------------------------------------------------------------------------
  buildGraph() {
    const ctx = this.ctx;
    // Bus nhạc (dùng để chỉnh âm lượng & né tiếng chuông)
    this.duckGain = ctx.createGain();
    this.volumeGain = ctx.createGain();
    this.volumeGain.gain.value = this.volume;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 40;
    const notch = ctx.createBiquadFilter();
    notch.type = 'peaking';
    notch.frequency.value = 750;
    notch.Q.value = 1;
    notch.gain.value = -4;
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 6000;
    shelf.gain.value = -3;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.ratio.value = 3;
    comp.knee.value = 12;
    comp.attack.value = 0.03;
    comp.release.value = 0.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    // dry + reverb -> EQ -> nén -> né chuông -> âm lượng -> giới hạn -> loa
    this.input = ctx.createGain(); // mọi giọng nối vào đây (dry)
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.42;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(5.5);
    const preDelay = ctx.createDelay(0.1);
    preDelay.delayTime.value = 0.03;
    const dry = ctx.createGain();
    dry.gain.value = 0.62;

    this.input.connect(dry);
    this.input.connect(this.reverbSend);
    this.reverbSend.connect(preDelay);
    preDelay.connect(this.reverb);
    dry.connect(hp);
    this.reverb.connect(hp);
    hp.connect(notch);
    notch.connect(shelf);
    shelf.connect(comp);
    comp.connect(this.duckGain);
    this.duckGain.connect(this.volumeGain);
    this.volumeGain.connect(limiter);
    limiter.connect(ctx.destination);
    this.output = limiter;
  }

  // Phản hồi xung tổng hợp: nhiễu riêng mỗi kênh, tắt dần (1 − t/len)^3, lọc bớt chói
  makeImpulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        lp += 0.35 * (white - lp); // lọc thông thấp ~5 kHz
        data[i] = lp * Math.pow(1 - i / len, 3);
      }
    }
    return buf;
  }

  panner(value) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = value;
    return p;
  }

  // ------------------------------------------------------------------------
  // Lớp 1: Drone trầm (giọng dài, chỉ đổi tần số khi đổi giọng)
  // ------------------------------------------------------------------------
  startDrone() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.0001, now);
    this.droneGain.gain.linearRampToValueAtTime(0.03, now + 12);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.02;
    lfoGain.gain.value = 0.006;
    lfo.connect(lfoGain);
    lfoGain.connect(this.droneGain.gain);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    this.droneOscs = [
      { osc: ctx.createOscillator(), ratio: 1, type: 'sine', level: 1 },
      { osc: ctx.createOscillator(), ratio: 1.5, type: 'sine', level: 0.6 },
      { osc: ctx.createOscillator(), ratio: 1, type: 'sawtooth', level: 0.18 }
    ];
    const root = AmbientMusic.mtof(36 + this.transpose);
    for (const d of this.droneOscs) {
      const g = ctx.createGain();
      g.gain.value = d.level;
      d.osc.type = d.type;
      d.osc.frequency.value = root * d.ratio;
      d.osc.connect(g);
      g.connect(d.type === 'sawtooth' ? lp : this.droneGain);
      d.osc.start(now);
    }
    lp.connect(this.droneGain);
    this.droneGain.connect(this.input);
    lfo.start(now);
    this.droneLfo = lfo;
  }

  retuneDrone() {
    if (!this.droneOscs) return;
    const t = this.ctx.currentTime;
    const root = AmbientMusic.mtof(36 + this.transpose);
    for (const d of this.droneOscs) {
      d.osc.frequency.cancelScheduledValues(t);
      d.osc.frequency.setTargetAtTime(root * d.ratio, t, 12); // trượt chậm ~40 giây
    }
  }

  // ------------------------------------------------------------------------
  // Lớp 2: Pad kiểu Eno — mỗi giọng một nốt, vòng lặp dài lệch nhau
  // ------------------------------------------------------------------------
  initPadVoices() {
    const LOOPS = [19.7, 23.3, 27.1, 31.9, 37.3, 41.1];
    const STEPS = [5, 7, 8, 9, 10, 12]; // C4 E4 G4 A4 C5 E5 (theo giọng hiện tại)
    const now = this.ctx.currentTime;
    this.padVoices = LOOPS.map((loop, i) => ({
      loop,
      step: STEPS[i],
      pan: this.r(-0.5, 0.5),
      next: now + this.r(0.5, 10) + i * 2.5
    }));
  }

  playPad(voice, when) {
    const ctx = this.ctx;
    const freq = AmbientMusic.mtof(this.scaleMidi(voice.step) - 12);
    const attack = this.r(6, 10);
    const hold = this.r(14, 26);
    const release = this.r(10, 15);
    const peak = this.r(0.03, 0.045);
    const end = when + attack + hold + release;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peak, when + attack);
    env.gain.setValueAtTime(peak, when + attack + hold);
    env.gain.linearRampToValueAtTime(0.0001, end);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    const cutoff = this.r(700, 1300);
    lp.frequency.setValueAtTime(cutoff * 0.7, when);
    lp.frequency.linearRampToValueAtTime(cutoff, when + attack + hold * 0.5);
    lp.frequency.linearRampToValueAtTime(cutoff * 0.6, end);

    const pan = this.panner(voice.pan);
    const oscs = [
      { type: 'sawtooth', f: freq, detune: -7, g: 0.5 },
      { type: 'sawtooth', f: freq, detune: 7, g: 0.5 },
      { type: 'triangle', f: freq / 2, detune: 0, g: 0.25 }
    ].map((o) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = o.type;
      osc.frequency.value = o.f;
      osc.detune.value = o.detune;
      g.gain.value = o.g;
      osc.connect(g);
      g.connect(lp);
      osc.start(when);
      osc.stop(end + 0.1);
      return osc;
    });
    lp.connect(env);
    env.connect(pan);
    pan.connect(this.input);
    oscs[0].onended = () => {
      oscs.forEach((o) => o.disconnect());
      lp.disconnect();
      env.disconnect();
      pan.disconnect();
    };
  }

  // ------------------------------------------------------------------------
  // Lớp 3: Giai điệu kalimba (FM), đi bộ ngẫu nhiên trên ngũ cung, thưa thớt
  // ------------------------------------------------------------------------
  playPluck(step, when) {
    const ctx = this.ctx;
    const f = AmbientMusic.mtof(this.scaleMidi(step));
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const amp = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const pan = this.panner(this.r(-0.4, 0.4));
    carrier.type = 'sine';
    mod.type = 'sine';
    carrier.frequency.value = f;
    mod.frequency.value = f * 3.5;
    modGain.gain.setValueAtTime(f * 2, when);
    modGain.gain.exponentialRampToValueAtTime(1, when + 0.3);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(this.r(0.035, 0.05), when + 0.008);
    amp.gain.setTargetAtTime(0.0001, when + 0.01, this.r(0.9, 1.4));
    lp.type = 'lowpass';
    lp.frequency.value = 2500;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(amp);
    amp.connect(lp);
    lp.connect(pan);
    pan.connect(this.input);
    const end = when + 6;
    carrier.start(when);
    mod.start(when);
    carrier.stop(end);
    mod.stop(end);
    carrier.onended = () => {
      [carrier, mod, modGain, amp, lp, pan].forEach((n) => n.disconnect());
    };
  }

  nextMelodyStep() {
    const roll = this.rand();
    let delta = roll < 0.15 ? 0 : roll < 0.7 ? 1 : roll < 0.92 ? 2 : 3;
    if (this.rand() < 0.5) delta = -delta;
    // Kéo về chủ âm khi đi quá xa; dội lại ở biên quãng (C4–A5)
    if (Math.abs(this.melodyStep - 5) > 4 && this.rand() < 0.1) delta = this.melodyStep > 5 ? -1 : 1;
    let s = this.melodyStep + delta;
    if (s < 5) s = 5 + (5 - s);
    if (s > 14) s = 14 - (s - 14);
    this.melodyStep = s;
    return s;
  }

  // ------------------------------------------------------------------------
  // Lớp 4: Chuông xoay — bội âm không điều hoà, mỗi bội âm có "cặp song sinh" lệch vài Hz tạo tiếng ngân
  // ------------------------------------------------------------------------
  playBowl(when) {
    const ctx = this.ctx;
    const f0 = [262, 294, 330][Math.floor(this.rand() * 3)]; // khác quãng với chuông lễ (174 Hz)
    const PARTIALS = [
      { r: 1, g: 1, t: 22 },
      { r: 2.71, g: 0.5, t: 14 },
      { r: 5.15, g: 0.25, t: 9 },
      { r: 8.0, g: 0.12, t: 5 }
    ];
    const out = ctx.createGain();
    out.gain.value = this.r(0.025, 0.035);
    const pan = this.panner(this.r(-0.3, 0.3));
    out.connect(pan);
    pan.connect(this.input);
    const rubbed = this.rand() < 0.5;
    let longest = null;
    for (const p of PARTIALS) {
      for (const twin of [0, this.r(0.5, 3)]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = f0 * p.r + twin;
        const peak = p.g * (twin ? 0.6 : 1);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(peak, when + (rubbed ? 1.5 : 0.003));
        g.gain.setTargetAtTime(0.0001, when + (rubbed ? 1.6 : 0.01), p.t / 6.9);
        osc.connect(g);
        g.connect(out);
        osc.start(when);
        osc.stop(when + p.t + 2);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
        };
        if (p.r === 1 && !twin) longest = osc;
      }
    }
    if (longest) {
      const prev = longest.onended;
      longest.onended = () => {
        prev && prev();
        out.disconnect();
        pan.disconnect();
      };
    }
  }

  // ------------------------------------------------------------------------
  // Lớp 5: Tiếng suối rất nhỏ (brown noise lọc thấp), một bộ đệm lặp
  // ------------------------------------------------------------------------
  startNature() {
    if (!this.natureEnabled || this.natureSrc) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 14;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.2;
      }
      // nối mượt điểm đầu/cuối vòng lặp
      const fade = ctx.sampleRate;
      for (let i = 0; i < fade; i++) d[len - fade + i] = d[len - fade + i] * (1 - i / fade) + d[i] * (i / fade);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 1;
    src.loopEnd = 14;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.016, ctx.currentTime + 8);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.duckGain); // không qua vang
    src.start();
    this.natureSrc = src;
    this.natureGain = g;
  }

  // ------------------------------------------------------------------------
  // Bộ hẹn giờ: mỗi 250 ms lên lịch mọi thứ đến hạn trong 1,5 giây tới
  // ------------------------------------------------------------------------
  tick() {
    if (!this.running) return;
    const ctx = this.ctx;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const horizon = now + 1.5;

    if (now >= this.nextKeyChange) {
      const KEYS = [0, 5, 7];
      const idx = (KEYS.indexOf(this.transpose) + 1 + (this.rand() < 0.5 ? 0 : 1)) % KEYS.length;
      this.transpose = KEYS[idx];
      this.retuneDrone();
      this.nextKeyChange = now + this.r(360, 720);
    }
    if (now >= this.nextActivityStep) {
      this.activity = Math.min(0.8, Math.max(0.2, this.activity + this.r(-0.1, 0.1)));
      this.nextActivityStep = now + 60;
    }
    if (now >= this.nextRest) {
      this.restUntil = now + this.r(120, 240); // chỉ còn drone + pad
      this.nextRest = now + this.r(1200, 2400);
    }
    const resting = now < this.restUntil;

    for (const v of this.padVoices) {
      if (v.next <= horizon) {
        if (this.rand() < 0.75) this.playPad(v, Math.max(v.next, now + 0.05));
        v.next += v.loop + this.r(-0.5, 0.5);
      }
    }

    if (!resting && now >= this.blockMelodyUntil && this.nextPhraseAt <= horizon) {
      const when = Math.max(this.nextPhraseAt, now + 0.05);
      if (this.phraseNotesLeft <= 0) {
        if (this.rand() < this.activity) this.phraseNotesLeft = 3 + Math.floor(this.rand() * 5);
        else this.nextPhraseAt = when + this.r(15, 40);
      }
      if (this.phraseNotesLeft > 0) {
        this.playPluck(this.nextMelodyStep(), when);
        this.phraseNotesLeft -= 1;
        this.nextPhraseAt = when + (this.phraseNotesLeft > 0 ? this.r(1.5, 4) : this.r(15, 60));
      }
    }

    if (!resting && this.nextBowlAt <= horizon) {
      this.playBowl(Math.max(this.nextBowlAt, now + 0.05));
      this.nextBowlAt = now + this.r(60, 140);
    }
  }

  // ------------------------------------------------------------------------
  // Điều khiển
  // ------------------------------------------------------------------------
  start() {
    if (this.running) return;
    this.running = true;
    const now = this.ctx.currentTime;
    this.nextKeyChange = now + this.r(360, 720);
    this.nextActivityStep = now + 60;
    this.nextRest = now + this.r(1200, 2400);
    this.nextPhraseAt = now + this.r(8, 20);
    this.nextBowlAt = now + this.r(20, 45);
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setValueAtTime(1, now);
    this.startDrone();
    this.initPadVoices();
    this.startNature();
    this.timer = setInterval(() => this.tick(), 250);
    this.tick();
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(0.0001, t, 0.8);
    setTimeout(() => {
      try {
        (this.droneOscs || []).forEach((d) => d.osc.stop());
        if (this.droneLfo) this.droneLfo.stop();
        if (this.natureSrc) this.natureSrc.stop();
      } catch (_) {}
      this.droneOscs = null;
      this.droneLfo = null;
      this.natureSrc = null;
    }, 4000);
  }

  setNature(on) {
    this.natureEnabled = Boolean(on);
    if (!this.running) return;
    if (this.natureEnabled) this.startNature();
    else if (this.natureSrc) {
      const src = this.natureSrc;
      this.natureGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 1);
      setTimeout(() => { try { src.stop(); } catch (_) {} }, 5000);
      this.natureSrc = null;
    }
  }

  setVolume(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    this.volume = Math.max(0, Math.min(1, n));
    this.volumeGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.2);
  }

  /** Né tiếng chuông: hạ nhạc ~−6 dB trong lúc chuông ngân, rồi trả lại từ từ. */
  duck(holdSeconds = 6, when = 0) {
    const t = Math.max(this.ctx.currentTime, when || 0);
    const g = this.duckGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.5, t, 0.15);
    g.setTargetAtTime(1, t + holdSeconds, 1.5);
    this.blockMelodyUntil = Math.max(this.blockMelodyUntil, t + holdSeconds + 8);
  }
}

window.AmbientMusic = AmbientMusic;
