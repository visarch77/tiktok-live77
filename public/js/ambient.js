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
  constructor(ctx, { volume = 0.45, nature = true, style = 'still' } = {}) {
    this.ctx = ctx;
    this.volume = volume;
    this.natureEnabled = nature;
    this.styleId = AmbientMusic.STYLES[style] ? style : 'still';
    this.style = AmbientMusic.STYLES[this.styleId];
    this.fileUrl = null; // nhạc riêng (public/music/*.mp3)
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
    const PENTA = this.style.scale;
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
    this.volumeGain.gain.value = this.volume * AmbientMusic.BOOST;
    // Đồng hồ đo mức âm (để trang quản lý biết nhạc có đang phát không)
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 1024;
    this.meterBuf = new Float32Array(1024);

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
    limiter.connect(this.meter);
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
    this.droneGain.gain.linearRampToValueAtTime(0.03 * this.style.drone, now + 3.5);
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
    this.droneGain.connect(this.bus);
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
      // hai giọng đầu vào ngay để vừa bật đã nghe thấy nền nhạc
      next: now + (i < 2 ? this.r(0.1, 0.8) : this.r(1, 8) + i * 1.5),
      quick: i < 2
    }));
  }

  playPad(voice, when, env0 = null) {
    const ctx = this.ctx;
    const freq = AmbientMusic.mtof(this.scaleMidi(voice.step) - 12);
    const attack = env0 ? env0.attack : voice.quick ? 2.5 : this.r(6, 10);
    voice.quick = false;
    const hold = env0 ? env0.hold : this.r(14, 26);
    const release = env0 ? env0.release : this.r(10, 15);
    const peak = this.r(0.03, 0.045) * this.style.pad;
    const end = when + attack + hold + release;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peak, when + attack);
    env.gain.setValueAtTime(peak, when + attack + hold);
    env.gain.linearRampToValueAtTime(0.0001, end);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.6;
    const cutoff = this.r(700, 1300) * this.style.padBright;
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
    pan.connect(this.bus);
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
    pan.connect(this.bus);
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
    out.gain.value = this.r(0.025, 0.035) * (this.style.bowlGain || 1);
    const pan = this.panner(this.r(-0.3, 0.3));
    out.connect(pan);
    pan.connect(this.bus);
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
    const kind = this.style.nature;
    if (!this.natureEnabled || this.natureSrc || !kind) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 14;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const brown = kind === 'stream' || kind === 'night';
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.2;
        } else d[i] = w * 0.5; // mưa / gió: nhiễu trắng, lọc sau
      }
      const fade = ctx.sampleRate;
      for (let i = 0; i < fade; i++) d[len - fade + i] = d[len - fade + i] * (1 - i / fade) + d[i] * (i / fade);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 1;
    src.loopEnd = 14;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const level = { stream: 0.016, night: 0.006, rain: 0.03, wind: 0.035 }[kind];
    if (kind === 'rain') {
      f.type = 'bandpass';
      f.frequency.value = 2400;
      f.Q.value = 0.4;
    } else if (kind === 'wind') {
      f.type = 'bandpass';
      f.frequency.value = 500;
      f.Q.value = 1.2;
      // gió: tần số lọc trôi chậm lên xuống
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 0.07;
      lg.gain.value = 260;
      lfo.connect(lg);
      lg.connect(f.frequency);
      lfo.start();
      this.natureExtra = [lfo, lg];
    } else {
      f.type = 'lowpass';
      f.frequency.value = 520;
    }
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(level, ctx.currentTime + 8);
    src.connect(f);
    f.connect(g);
    g.connect(this.duckGain); // không qua vang
    src.start();
    this.natureSrc = src;
    this.natureGain = g;
  }

  /** Âm thanh thiên nhiên lác đác theo bài: giọt mưa, tiếng dế đêm, chuông gió */
  natureTick(now, horizon) {
    if (!this.natureEnabled || this.nextNatureEvent > horizon) return;
    const when = Math.max(this.nextNatureEvent, now + 0.05);
    const kind = this.style.nature;
    if (kind === 'rain') {
      for (let i = 0; i < 3; i++) this.ping(this.r(1800, 3600), when + this.r(0, 0.6), 0.006, 0.05);
      this.nextNatureEvent = when + this.r(0.3, 0.9);
    } else if (kind === 'night') {
      // dế kêu: chuỗi tiếng rích ngắn ~4,6 kHz
      const base = this.r(4300, 4900);
      for (let i = 0; i < 6; i++) this.ping(base, when + i * 0.055, 0.004, 0.03);
      this.nextNatureEvent = when + this.r(1.2, 3.5);
    } else {
      this.nextNatureEvent = when + 5;
    }
    if (this.style.chimes && this.rand() < 0.5) {
      const notes = [9, 10, 11, 12, 13, 14];
      for (let i = 0, n = 2 + Math.floor(this.rand() * 4); i < n; i++) this.playChime(notes[Math.floor(this.rand() * notes.length)], when + i * this.r(0.12, 0.4));
      this.nextNatureEvent = Math.max(this.nextNatureEvent, when + this.r(4, 9));
    }
  }

  ping(freq, when, gain, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(this.duckGain);
    o.start(when);
    o.stop(when + dur + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  // ------------------------------------------------------------------------
  // Nhạc cụ giai điệu theo bài
  // ------------------------------------------------------------------------
  playMelody(step, when) {
    switch (this.style.melody) {
      case 'flute': return this.playFlute(step, when);
      case 'zither': return this.playZither(step, when);
      case 'piano': return this.playSoftPiano(step, when);
      case 'chime': return this.playChime(step + 3, when);
      default: return this.playPluck(step, when);
    }
  }

  /** Sáo trúc: sin + bội âm nhẹ, vào chậm, rung (vibrato) muộn, có hơi thổi */
  playFlute(step, when) {
    const ctx = this.ctx;
    const f = AmbientMusic.mtof(this.scaleMidi(step));
    const dur = this.r(1.8, 3.4);
    const amp = ctx.createGain();
    const pan = this.panner(this.r(-0.3, 0.3));
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.linearRampToValueAtTime(0.04, when + 0.18);
    amp.gain.setValueAtTime(0.04, when + dur - 0.5);
    amp.gain.linearRampToValueAtTime(0.0001, when + dur);
    const vib = ctx.createOscillator();
    const vibG = ctx.createGain();
    vib.frequency.value = 5.2;
    vibG.gain.setValueAtTime(0, when);
    vibG.gain.linearRampToValueAtTime(f * 0.012, when + 0.8);
    vib.connect(vibG);
    const nodes = [vib, vibG, amp, pan];
    [[1, 1], [2, 0.18], [3, 0.06]].forEach(([r, a]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * r;
      vibG.connect(o.frequency);
      g.gain.value = a;
      o.connect(g);
      g.connect(amp);
      o.start(when);
      o.stop(when + dur + 0.05);
      nodes.push(o, g);
    });
    // hơi thổi: nhiễu qua lọc dải quanh tần số nốt
    const nb = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    nb.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    nb.connect(bp);
    bp.connect(ng);
    ng.connect(amp);
    nb.start(when);
    nodes.push(nb, bp, ng);
    amp.connect(pan);
    pan.connect(this.bus);
    vib.start(when);
    vib.stop(when + dur + 0.05);
    vib.onended = () => nodes.forEach((n) => n.disconnect());
  }

  /** Đàn tranh: dây gảy, đôi khi nhấn nhá trượt nốt (luyến) như ngón nhấn của đàn tranh Việt */
  playZither(step, when) {
    const ctx = this.ctx;
    const f = AmbientMusic.mtof(this.scaleMidi(step));
    const o = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const pan = this.panner(this.r(-0.4, 0.4));
    o.type = 'triangle';
    const bend = this.rand() < 0.3;
    o.frequency.setValueAtTime(bend ? f * 0.944 : f, when);
    if (bend) o.frequency.linearRampToValueAtTime(f, when + 0.25);
    if (this.rand() < 0.35) {
      // rung nhấn ở cuối nốt
      o.frequency.setValueAtTime(f, when + 0.6);
      o.frequency.linearRampToValueAtTime(f * 1.03, when + 0.8);
      o.frequency.linearRampToValueAtTime(f, when + 1.0);
    }
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 7, when);
    lp.frequency.exponentialRampToValueAtTime(f * 1.6, when + 1.2);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.06, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);
    o.connect(lp);
    lp.connect(g);
    g.connect(pan);
    pan.connect(this.bus);
    o.start(when);
    o.stop(when + 2.5);
    o.onended = () => [o, lp, g, pan].forEach((n) => n.disconnect());
  }

  /** Dương cầm êm: sin + bội âm, tắt dần dài */
  playSoftPiano(step, when) {
    const ctx = this.ctx;
    const f = AmbientMusic.mtof(this.scaleMidi(step));
    const pan = this.panner(this.r(-0.3, 0.3));
    const out = ctx.createGain();
    out.gain.value = 0.05;
    const nodes = [pan, out];
    [[1, 1, 3.5], [2, 0.3, 2], [3, 0.12, 1.2], [4.01, 0.05, 0.8]].forEach(([r, a, t]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * r;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(a, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + t);
      o.connect(g);
      g.connect(out);
      o.start(when);
      o.stop(when + t + 0.05);
      nodes.push(o, g);
    });
    out.connect(pan);
    pan.connect(this.bus);
    setTimeout(() => nodes.forEach((n) => { try { n.disconnect(); } catch (_) {} }), (when - ctx.currentTime + 4) * 1000);
  }

  /** Chuông gió: kim loại mảnh, bội âm không hoà âm, ngân ngắn */
  playChime(step, when) {
    const ctx = this.ctx;
    const f = AmbientMusic.mtof(this.scaleMidi(step) + 12);
    const pan = this.panner(this.r(-0.6, 0.6));
    const out = ctx.createGain();
    out.gain.value = this.r(0.012, 0.022);
    const nodes = [pan, out];
    [[1, 1, 2.6], [2.76, 0.4, 1.4], [5.4, 0.15, 0.7]].forEach(([r, a, t]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * r;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(a, when + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, when + t);
      o.connect(g);
      g.connect(out);
      o.start(when);
      o.stop(when + t + 0.05);
      nodes.push(o, g);
    });
    out.connect(pan);
    pan.connect(this.bus);
    setTimeout(() => nodes.forEach((n) => { try { n.disconnect(); } catch (_) {} }), (when - ctx.currentTime + 3) * 1000);
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
      const KEYS = this.style.keys;
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

    if (this.style.breath) {
      // Hơi thở chánh niệm: hợp âm phồng lên 4 giây (hít vào) rồi lắng xuống 6 giây (thở ra)
      if (this.nextBreathAt <= horizon) {
        const when = Math.max(this.nextBreathAt, now + 0.05);
        [5, 8, 10].forEach((st, i) => this.playPad({ step: st, pan: (i - 1) * 0.4 }, when, { attack: 4, hold: 0.4, release: 6.2 }));
        this.nextBreathAt = when + 10.5;
      }
    } else {
      for (const v of this.padVoices) {
        if (v.next <= horizon) {
          if (this.rand() < 0.75) this.playPad(v, Math.max(v.next, now + 0.05));
          v.next += v.loop + this.r(-0.5, 0.5);
        }
      }
    }
    this.natureTick(now, horizon);

    if (this.style.melody && !resting && now >= this.blockMelodyUntil && this.nextPhraseAt <= horizon) {
      const when = Math.max(this.nextPhraseAt, now + 0.05);
      if (this.phraseNotesLeft <= 0) {
        if (this.rand() < this.activity) this.phraseNotesLeft = 3 + Math.floor(this.rand() * 5);
        else this.nextPhraseAt = when + this.r(...this.style.phraseGap);
      }
      if (this.phraseNotesLeft > 0) {
        this.playMelody(this.nextMelodyStep(), when);
        this.phraseNotesLeft -= 1;
        this.nextPhraseAt = when + (this.phraseNotesLeft > 0 ? this.r(...this.style.noteGap) : this.r(...this.style.phraseGap));
      }
    }

    if (this.style.bowlEvery && !resting && this.nextBowlAt <= horizon) {
      this.playBowl(Math.max(this.nextBowlAt, now + 0.05));
      this.nextBowlAt = now + this.r(...this.style.bowlEvery);
    }
  }

  // ------------------------------------------------------------------------
  // Điều khiển
  // ------------------------------------------------------------------------
  start() {
    if (this.running) return;
    this.running = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Mỗi lần phát có một bus riêng: đổi bài thì chỉ cần làm mờ & ngắt bus cũ, không còn nốt cũ ngân lẫn
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0.0001, now);
    this.bus.gain.linearRampToValueAtTime(this.style.gain || 1, now + 3); // cân bằng độ to giữa các bài
    this.bus.connect(this.input);
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setValueAtTime(1, now);
    if (this.fileUrl) {
      this.startFile();
      return;
    }
    this.transpose = this.style.keys[0];
    this.activity = this.style.activity;
    this.nextKeyChange = now + this.r(360, 720);
    this.nextActivityStep = now + 60;
    this.nextRest = now + this.r(1200, 2400);
    this.nextPhraseAt = now + this.r(3, 6);
    this.nextBowlAt = now + this.r(8, 20);
    this.nextBreathAt = now + 0.5;
    this.nextNatureEvent = now + 2;
    this.startDrone();
    this.initPadVoices();
    this.startNature();
    this.timer = setInterval(() => this.tick(), 250);
    this.tick();
  }

  /**
   * Nhạc riêng (file / YouTube): phát lặp, đi qua bộ né chuông & thanh âm lượng chung.
   * Tự cân bằng độ to (AGC chậm): nhạc tải về thường đã rất to — đưa về cùng mức với nhạc tự tạo
   * để thanh "Nhạc nền" chỉnh được mượt từ 0 đến 100% và không lấn tiếng mõ, chuông, giọng đọc.
   */
  startFile() {
    const ctx = this.ctx;
    const el = new Audio(this.fileUrl);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(el);
    const meter = ctx.createAnalyser();
    meter.fftSize = 2048;
    const g = ctx.createGain();
    g.gain.value = 0.15; // mức an toàn ban đầu, AGC sẽ chỉnh dần
    src.connect(meter);
    src.connect(g);
    g.connect(this.duckGain); // không qua vang của nhạc tự tạo
    const buf = new Float32Array(2048);
    const TARGET = AmbientMusic.FILE_TARGET_RMS;
    let avg = 0;
    const agc = setInterval(() => {
      if (el.paused) return;
      meter.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      if (rms < 0.003) return; // đoạn lặng: giữ nguyên
      avg = avg ? avg * 0.85 + rms * 0.15 : rms;
      const want = Math.max(0.03, Math.min(1.5, TARGET / avg));
      g.gain.setTargetAtTime(want, ctx.currentTime, 1.5);
    }, 300);
    this.fileEl = el;
    this.fileNodes = [src, meter, g];
    this.fileAgc = agc;
    el.play().catch(() => {});
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    // Giữ tham chiếu của lần phát này để không lỡ tắt nhầm lần phát kế tiếp
    const bus = this.bus;
    const oscs = this.droneOscs || [];
    const lfo = this.droneLfo;
    const nat = this.natureSrc;
    const natNodes = this.natureExtra || [];
    const fileEl = this.fileEl;
    const fileNodes = this.fileNodes || [];
    clearInterval(this.fileAgc);
    this.fileAgc = null;
    this.bus = null;
    this.droneOscs = null;
    this.droneLfo = null;
    this.natureSrc = null;
    this.natureExtra = null;
    this.fileEl = null;
    this.fileNodes = null;
    if (bus) bus.gain.setTargetAtTime(0.0001, t, 0.6);
    if (this.natureGain) this.natureGain.gain.setTargetAtTime(0.0001, t, 0.6);
    if (fileNodes[2]) fileNodes[2].gain.setTargetAtTime(0.0001, t, 0.6);
    setTimeout(() => {
      try {
        oscs.forEach((d) => d.osc.stop());
        if (lfo) lfo.stop();
        if (nat) nat.stop();
        natNodes.forEach((n) => { try { n.stop ? n.stop() : null; n.disconnect(); } catch (_) {} });
        if (fileEl) fileEl.pause();
        fileNodes.forEach((n) => n.disconnect());
        if (bus) bus.disconnect();
      } catch (_) {}
    }, 3500);
  }

  /** Đổi bài: "preset:<id>" (nhạc thiền tự tạo) hoặc "file:<tên file>" trong public/music */
  setTrack(track) {
    const t = String(track || 'preset:still');
    let fileUrl = null;
    let styleId = this.styleId;
    if (t.startsWith('file:')) fileUrl = `/music/${encodeURIComponent(t.slice(5))}`;
    else styleId = AmbientMusic.STYLES[t.replace(/^preset:/, '')] ? t.replace(/^preset:/, '') : 'still';
    if (fileUrl === this.fileUrl && styleId === this.styleId) return;
    this.fileUrl = fileUrl;
    this.styleId = styleId;
    this.style = AmbientMusic.STYLES[styleId];
    if (this.running) {
      this.stop();
      setTimeout(() => this.start(), 1600);
    }
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
    this.volumeGain.gain.setTargetAtTime(this.volume * AmbientMusic.BOOST, this.ctx.currentTime, 0.2);
  }

  /** Mức âm hiện tại (RMS 0..1) */
  level() {
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let sum = 0;
    for (const v of this.meterBuf) sum += v * v;
    return Math.sqrt(sum / this.meterBuf.length);
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

// ----------------------------------------------------------------------------
// Danh sách bài nhạc thiền (tự tạo, không lời, không bản quyền). id dùng trong cài đặt "musicTrack": preset:<id>
//  scale: thang âm (bán cung từ chủ âm) · melody: nhạc cụ giai điệu · drone/pad: mức tiếng trầm / nền
//  bowlEvery: chuông bát mỗi [min,max] giây · nature: tiếng thiên nhiên đi kèm (khi bật "Tiếng thiên nhiên")
// ----------------------------------------------------------------------------
const PENTA_MAJOR = [0, 2, 4, 7, 9];
const PENTA_MINOR = [0, 3, 5, 7, 10];
const YO = [0, 2, 5, 7, 9];
AmbientMusic.STYLES = {
  still: { name: 'Tĩnh lặng — kalimba ngũ cung', scale: PENTA_MAJOR, keys: [0, 5, 7], melody: 'kalimba', activity: 0.5, noteGap: [1.5, 4], phraseGap: [15, 60], drone: 1, pad: 1, padBright: 1, bowlEvery: [60, 140], nature: 'stream' },
  flute: { gain: 2.2, name: 'Sáo trúc chùa núi', scale: PENTA_MINOR, keys: [2, 7, 0], melody: 'flute', activity: 0.55, noteGap: [2.2, 4.5], phraseGap: [14, 40], drone: 0.8, pad: 0.8, padBright: 0.8, bowlEvery: [120, 240], nature: 'wind' },
  zither: { gain: 2.6, name: 'Đàn tranh bên suối', scale: PENTA_MAJOR, keys: [7, 0, 5], melody: 'zither', activity: 0.6, noteGap: [0.9, 2.6], phraseGap: [10, 30], drone: 0.6, pad: 0.9, padBright: 1.15, bowlEvery: [150, 300], nature: 'stream' },
  bowls: { gain: 1.6, name: 'Chuông bát Tây Tạng', scale: PENTA_MINOR, keys: [0, 5], melody: null, activity: 0, noteGap: [2, 4], phraseGap: [20, 40], drone: 1.3, pad: 0.6, padBright: 0.7, bowlEvery: [16, 34], bowlGain: 1.4, nature: null },
  night: { gain: 2.6, name: 'Đêm trăng thiền viện', scale: PENTA_MINOR, keys: [9, 4, 2], melody: 'piano', activity: 0.4, noteGap: [2, 5], phraseGap: [18, 50], drone: 0.7, pad: 0.85, padBright: 0.65, bowlEvery: [180, 320], nature: 'night' },
  rain: { gain: 1.1, name: 'Mưa rừng an tịnh', scale: YO, keys: [0, 5, 7], melody: 'kalimba', activity: 0.35, noteGap: [1.8, 4.5], phraseGap: [20, 60], drone: 0.8, pad: 0.9, padBright: 0.85, bowlEvery: [150, 280], nature: 'rain' },
  breath: { gain: 1.2, name: 'Hơi thở chánh niệm (hít 4s – thở 6s)', scale: PENTA_MAJOR, keys: [0, 7], melody: null, activity: 0, noteGap: [2, 4], phraseGap: [30, 60], drone: 0.9, pad: 1.2, padBright: 0.8, bowlEvery: [90, 180], breath: true, nature: 'stream' },
  chimes: { gain: 1.5, name: 'Chuông gió hiên chùa', scale: YO, keys: [5, 0, 7], melody: 'chime', activity: 0.45, noteGap: [0.8, 2.2], phraseGap: [12, 30], drone: 0.7, pad: 0.9, padBright: 1, bowlEvery: [140, 260], nature: 'wind', chimes: true }
};

// Khuếch đại tổng: thanh "Nhạc nền" 45% ≈ mức nghe rõ nhưng vẫn dưới tiếng mõ, chuông, giọng đọc
AmbientMusic.BOOST = 2.4;
// Độ to (RMS) mà nhạc file / YouTube được cân bằng về, trước thanh âm lượng — ngang nhạc tự tạo
AmbientMusic.FILE_TARGET_RMS = 0.07;

window.AmbientMusic = AmbientMusic;
