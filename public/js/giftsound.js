/**
 * Âm thanh lễ vật (chỉ phát trong chế độ DÂNG LỄ): tổng hợp bằng Web Audio, không cần file âm thanh.
 * Thang ngũ cung (cung – thương – giốc – chuỷ – vũ) cho cảm giác Á Đông, nhẹ nhàng, không ồn ào.
 * Mỗi lễ vật một "chữ ký" âm thanh riêng; quà nhỏ chỉ có một tiếng chuông gió khẽ.
 */
(function () {
  // Ngũ cung trên nốt Rê (D): D E F# A B qua nhiều quãng tám
  const PENTA = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51, 1479.98, 1760.0];

  class GiftSound {
    constructor(engine) {
      this.engine = engine; // TempleAudioEngine (dùng chung AudioContext và âm lượng mõ & chuông)
      this.noiseBuf = null;
    }

    get ctx() {
      return this.engine.ctx;
    }

    ready() {
      return this.engine.ctx && this.engine.ctx.state === 'running' && this.engine.sfxEnabled !== false && this.engine.sfxVolume > 0;
    }

    out(gain = 1) {
      const g = this.ctx.createGain();
      g.gain.value = gain * (this.engine.sfxVolume ?? 0.8) * 0.55;
      g.connect(this.ctx.destination);
      return g;
    }

    noise() {
      if (this.noiseBuf) return this.noiseBuf;
      const ctx = this.ctx;
      const len = ctx.sampleRate * 2;
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = b;
      return b;
    }

    // ---- Âm cơ bản ----
    /** Chuông gió / đàn: sin + bội âm, tắt dần */
    chime(freq, when, { dur = 2.2, gain = 0.35, bright = 0.3, attack = 0.004 } = {}) {
      const ctx = this.ctx;
      const o = this.out(1);
      [[1, 1], [2.01, bright], [3.02, bright * 0.4]].filter(([, a]) => a > 0).forEach(([r, a]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq * r;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(gain * a, when + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur / r);
        osc.connect(g).connect(o);
        osc.start(when);
        osc.stop(when + dur + 0.1);
      });
    }

    /** Dây gảy (đàn tranh): tam giác, tắt nhanh, lọc thấp dần */
    pluck(freq, when, gain = 0.3) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq * 6, when);
      f.frequency.exponentialRampToValueAtTime(freq * 1.5, when + 0.9);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
      osc.connect(f).connect(g).connect(this.out(1));
      osc.start(when);
      osc.stop(when + 1.7);
    }

    /** Tiếng gió / nước: nhiễu qua bộ lọc dải, quét tần số */
    whoosh(when, { from = 400, to = 2400, dur = 1.6, gain = 0.25, q = 1.2, type = 'bandpass' } = {}) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noise();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(from, when);
      f.frequency.exponentialRampToValueAtTime(to, when + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain, when + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(f).connect(g).connect(this.out(1));
      src.start(when, Math.random());
      src.stop(when + dur + 0.05);
    }

    /** Giọt nước: sin trượt tần số lên rất nhanh */
    drop(when, freq = 900, gain = 0.3) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, when);
      osc.frequency.exponentialRampToValueAtTime(freq * 2.4, when + 0.08);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
      osc.connect(g).connect(this.out(1));
      osc.start(when);
      osc.stop(when + 0.2);
    }

    /** Gõ gỗ (hạt tràng, mõ nhỏ) */
    click(when, freq = 1800, gain = 0.25) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 6;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
      osc.connect(f).connect(g).connect(this.out(1));
      osc.start(when);
      osc.stop(when + 0.08);
    }

    /** Trống lớn: sin trầm trượt xuống + tiếng da trống */
    drum(when, freq = 70, gain = 0.8) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 2, when);
      osc.frequency.exponentialRampToValueAtTime(freq, when + 0.12);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 1.3);
      osc.connect(g).connect(this.out(1));
      osc.start(when);
      osc.stop(when + 1.4);
      this.whoosh(when, { from: 300, to: 120, dur: 0.25, gain: 0.3, type: 'lowpass', q: 0.7 });
    }

    /** Cồng / chiêng: các bội âm không hoà âm, ngân dài, nở dần */
    gong(when, base = 110, { dur = 6, gain = 0.5 } = {}) {
      const ctx = this.ctx;
      const o = this.out(1);
      [[1, 1], [1.48, 0.6], [2.03, 0.45], [2.74, 0.3], [3.9, 0.18]].forEach(([r, a], i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * r * 0.985, when);
        osc.frequency.linearRampToValueAtTime(base * r, when + 0.6);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(gain * a, when + 0.05 + i * 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur / (1 + i * 0.35));
        osc.connect(g).connect(o);
        osc.start(when);
        osc.stop(when + dur + 0.1);
      });
    }

    /** Chuông bát (singing bowl): hai âm hơi lệch tạo tiếng ngân "wah-wah" */
    bowl(when, freq = 392, gain = 0.3, dur = 5) {
      [freq, freq * 1.004, freq * 2.71].forEach((f, i) => this.chime(f, when, { dur: dur / (i ? 1.4 : 1), gain: gain * (i === 2 ? 0.35 : 0.6), bright: 0, attack: 0.02 }));
    }

    arp(notes, when, step, fn) {
      notes.forEach((n, i) => fn(PENTA[n], when + i * step, i));
    }

    // ---- Chữ ký âm thanh của từng lễ vật ----
    play(img, { small = false } = {}) {
      if (!this.ready()) return;
      const t = this.ctx.currentTime + 0.04;
      if (small) {
        // Quà nhỏ: một chuỗi chuông gió khẽ
        this.arp([7, 9, 11], t, 0.07, (f, w) => this.chime(f, w, { dur: 1.2, gain: 0.12, bright: 0.2 }));
        return;
      }
      switch (img) {
        case 'rose': // đàn tranh rải ngũ cung đi lên
          this.arp([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], t, 0.09, (f, w) => this.pluck(f, w, 0.22));
          this.chime(PENTA[11], t + 1, { dur: 2.5, gain: 0.15 });
          break;
        case 'lotus': // giọt nước + chuông gió trong trẻo
          this.drop(t, 900);
          this.drop(t + 0.25, 1200, 0.2);
          this.arp([5, 7, 9, 12], t + 0.4, 0.18, (f, w) => this.chime(f, w, { dur: 2.4, gain: 0.18 }));
          break;
        case 'lotusLantern': // chuông ấm + ánh nến
          this.bowl(t, PENTA[3], 0.22, 4);
          this.arp([7, 9, 10], t + 0.3, 0.25, (f, w) => this.chime(f, w, { dur: 2, gain: 0.14 }));
          break;
        case 'skyLantern': // gió vút lên + chuông trên cao
          this.whoosh(t, { from: 300, to: 3000, dur: 2.6, gain: 0.22 });
          this.arp([8, 10, 11, 13, 12, 13], t + 0.6, 0.22, (f, w) => this.chime(f, w, { dur: 2.2, gain: 0.12 }));
          break;
        case 'incense': // chuông bát ngân dài, thanh tịnh
          this.bowl(t, 196, 0.35, 6);
          break;
        case 'tea': // tiếng rót trà + một tiếng chuông nhỏ
          this.whoosh(t, { from: 900, to: 1400, dur: 1.4, gain: 0.18, q: 3 });
          for (let i = 0; i < 6; i++) this.drop(t + 0.2 + i * 0.16, 700 + Math.random() * 500, 0.1);
          this.chime(PENTA[9], t + 1.5, { dur: 2, gain: 0.15 });
          break;
        case 'fruit': // đàn gỗ (marimba) vui tươi
          this.arp([2, 4, 5, 7, 9, 7], t, 0.13, (f, w) => this.chime(f, w, { dur: 0.6, gain: 0.25, bright: 0.6 }));
          break;
        case 'heartLotus': // hợp âm ấm nở dần như nhịp tim
          [0, 2, 4].forEach((n) => this.chime(PENTA[n], t, { dur: 3.5, gain: 0.16, bright: 0.1, attack: 0.5 }));
          this.drum(t + 0.1, 60, 0.25);
          this.drum(t + 0.45, 60, 0.2);
          this.chime(PENTA[9], t + 1, { dur: 2.5, gain: 0.14 });
          break;
        case 'mala': // hạt tràng lách cách lần lượt
          for (let i = 0; i < 12; i++) this.click(t + i * 0.11, 1500 + (i % 3) * 180, 0.16);
          this.bowl(t + 1.4, 293.66, 0.2, 3.5);
          break;
        case 'doves': // tiếng vỗ cánh + sáo cao
          for (let i = 0; i < 7; i++) this.whoosh(t + i * 0.14, { from: 800, to: 300, dur: 0.18, gain: 0.18, q: 0.8 });
          this.arp([9, 11, 12], t + 0.9, 0.16, (f, w) => this.chime(f, w, { dur: 1.2, gain: 0.12, bright: 0 }));
          break;
        case 'butterfly': // lấp lánh đi lên rất nhẹ
          this.arp([7, 8, 9, 10, 11, 12, 13], t, 0.07, (f, w) => this.chime(f, w, { dur: 1.4, gain: 0.1 }));
          break;
        case 'koi': // nước vỗ + giọt nước
          this.whoosh(t, { from: 2000, to: 400, dur: 0.6, gain: 0.25, type: 'lowpass', q: 0.6 });
          for (let i = 0; i < 8; i++) this.drop(t + 0.4 + i * 0.12, 600 + Math.random() * 900, 0.12);
          break;
        case 'lion': // trống lớn + cồng
          this.drum(t, 65, 0.9);
          this.drum(t + 0.35, 65, 0.7);
          this.gong(t + 0.7, 98, { dur: 5, gain: 0.45 });
          break;
        case 'dragon': // gió cuộn + cồng ngân dài
          this.whoosh(t, { from: 200, to: 1600, dur: 2.2, gain: 0.25 });
          this.gong(t + 0.8, 82, { dur: 7, gain: 0.5 });
          break;
        case 'pagoda': // cồng lớn + chuông ngũ cung
          this.gong(t, 110, { dur: 7, gain: 0.45 });
          this.arp([5, 7, 9, 10, 12], t + 1, 0.3, (f, w) => this.chime(f, w, { dur: 2.6, gain: 0.13 }));
          break;
        case 'bell':
          if (this.engine.playTempleBell) this.engine.playTempleBell(0.85, t);
          break;
        default:
          this.arp([5, 7, 9], t, 0.15, (f, w) => this.chime(f, w, { dur: 2, gain: 0.15 }));
      }
    }
  }

  window.GiftSound = GiftSound;
})();
