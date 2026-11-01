/**
 * TempleAudioEngine
 * - Nhạc nền: Phát trực tiếp file "Nam Mô A Di Đà Phật.m4a" (/assets/bg_chant.m4a) lặp vô tận êm dịu,
 *   tự động hạ nhỏ âm lượng (ducking) khi có giọng đọc lời khấn để không bị đè tiếng hay rè/xước.
 * - Pháp khí: Tổng hợp tiếng Mõ gỗ, Đại Hồng Chung, Ống xăm nhẹ nhàng, không vượt ngưỡng 0dBFS.
 * - Giọng đọc: Hàng đợi ZeroTTS phát tuần tự mượt mà.
 */
class TempleAudioEngine {
  /**
   * @param {{ musicUrl?: string | null, ambient?: 'chime' | 'pad' }} [options]
   *   musicUrl: file nhạc nền; null = dùng nhạc tổng hợp (không lời, không vướng bản quyền)
   *   ambient: kiểu nhạc tổng hợp — 'chime' (bản cũ) hoặc 'pad' (nền êm, chậm cho phòng tụng kinh)
   */
  constructor(options = {}) {
    const musicUrl = options.musicUrl === undefined ? '/assets/bg_chant.m4a' : options.musicUrl;
    this.ambientStyle = options.ambient || 'chime';
    this.sfxVolume = 1;
    this.ctx = null;
    this.unlocked = false;
    this.sfxEnabled = true;
    this.bgMusicEnabled = true;
    this.ttsEnabled = true;
    this.ttsVoice = 'maichi';

    // Nhạc nền "Nam Mô A Di Đà Phật.m4a" — mặc định 65%, cho phép chỉnh trực tiếp 0% - 100%
    let savedMusicVol = NaN;
    let savedTtsVol = NaN;
    try {
      savedMusicVol = parseFloat(localStorage.getItem('temple_music_vol'));
      savedTtsVol = parseFloat(localStorage.getItem('temple_tts_vol'));
    } catch (_) {}
    this.bgBaseVolume = Number.isFinite(savedMusicVol) ? Math.max(0, Math.min(1, savedMusicVol)) : 0.65;
    this.ttsVolume = Number.isFinite(savedTtsVol) ? Math.max(0, Math.min(1, savedTtsVol)) : 0.95;
    try {
      const savedSfx = parseFloat(localStorage.getItem('temple_sfx_vol'));
      if (Number.isFinite(savedSfx)) this.sfxVolume = Math.max(0, Math.min(1, savedSfx));
    } catch (_) {}

    this.useSynthMusicFallback = !musicUrl;
    this.synthBgTimer = null;
    this.bgAudio = musicUrl ? new Audio(musicUrl) : null;
    if (this.bgAudio) {
      this.bgAudio.loop = true;
      this.bgAudio.preload = 'auto';
      this.bgAudio.volume = this.bgBaseVolume;
      this.bgAudio.onerror = () => {
        this.useSynthMusicFallback = true;
        if (this.bgMusicEnabled && this.ctx) this.startDefaultZenSynthLoop();
      };
    }
    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.currentAudio = null;
    this.onTtsStateChange = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.unlocked = true;
    if (this.bgMusicEnabled) {
      this.startZenAmbience();
    }
    return this.ctx;
  }

  // --------------------------------------------------------------------------
  // 1. NHẠC NỀN "NAM MÔ A DI ĐÀ PHẬT.M4A" (CÓ AUTO-DUCKING KHI ĐỌC LỜI KHẤN)
  // --------------------------------------------------------------------------
  getDuckedVolume() {
    return Math.max(0.08, +(this.bgBaseVolume * 0.35).toFixed(2));
  }

  setMusicVolume(vol) {
    const n = Number(vol);
    if (!Number.isFinite(n)) return;
    const v = Math.max(0, Math.min(1, n));
    this.bgBaseVolume = v;
    try {
      localStorage.setItem('temple_music_vol', String(v));
    } catch (_) {}
    if (this.bgAudio && !this.useSynthMusicFallback) {
      this.bgAudio.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
    }
  }

  setTtsVolume(vol) {
    const n = Number(vol);
    if (!Number.isFinite(n)) return;
    const v = Math.max(0, Math.min(1, n));
    this.ttsVolume = v;
    try {
      localStorage.setItem('temple_tts_vol', String(v));
    } catch (_) {}
    if (this.currentAudio) {
      this.currentAudio.volume = this.ttsVolume;
    }
  }

  startZenAmbience() {
    if (!this.bgMusicEnabled) return;
    if (this.useSynthMusicFallback || !this.bgAudio) {
      this.startDefaultZenSynthLoop();
      return;
    }
    try {
      this.bgAudio.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
      if (this.bgAudio.paused) {
        const p = this.bgAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            if (this.bgAudio.error) {
              this.useSynthMusicFallback = true;
              this.startDefaultZenSynthLoop();
            }
          });
        }
      }
    } catch (_) {
      this.useSynthMusicFallback = true;
      this.startDefaultZenSynthLoop();
    }
  }

  startDefaultZenSynthLoop() {
    if (!this.bgMusicEnabled || this.synthBgTimer) return;
    if (this.ambientStyle === 'pad') {
      this.startPadAmbience();
      return;
    }
    const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    let step = 0;
    const playZenNote = () => {
      if (!this.bgMusicEnabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const freq = PENTATONIC[step % PENTATONIC.length];
        step++;
        const vol = (this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume) * 0.18;
        if (vol <= 0.002) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + 4.25);
      } catch (_) {}
    };
    playZenNote();
    this.synthBgTimer = setInterval(playZenNote, 3600);
  }

  /**
   * Nền nhạc không lời êm, chậm: hợp âm ngũ cung ngân dài (fade 6–8 giây) + thỉnh thoảng một nốt chuông xa.
   * Tự tổng hợp nên không vướng bản quyền khi phát trên TikTok LIVE.
   */
  startPadAmbience() {
    const CHORDS = [
      [146.83, 220.0, 293.66], // D
      [130.81, 196.0, 261.63], // C
      [164.81, 246.94, 329.63], // E (ngũ cung)
      [146.83, 196.0, 293.66]
    ];
    const BELL_NOTES = [587.33, 659.25, 783.99, 880.0];
    let step = 0;
    const playChord = () => {
      if (!this.bgMusicEnabled || !this.ctx) return;
      try {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const level = (this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume) * 0.07;
        if (level <= 0.001) return;
        const chord = CHORDS[step % CHORDS.length];
        chord.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = i === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(freq, now);
          osc.detune.setValueAtTime((i - 1) * 4, now);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.linearRampToValueAtTime(level / (i + 1), now + 3.5);
          gain.gain.linearRampToValueAtTime(level / (i + 1), now + 8);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 13);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.onended = () => { osc.disconnect(); gain.disconnect(); };
          osc.start(now);
          osc.stop(now + 13.2);
        });
        if (step % 2 === 1) {
          const t = now + 2 + Math.random() * 4;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)], t);
          gain.gain.setValueAtTime(0.0001, t);
          gain.gain.linearRampToValueAtTime(level * 0.55, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.onended = () => { osc.disconnect(); gain.disconnect(); };
          osc.start(t);
          osc.stop(t + 5.1);
        }
        step++;
      } catch (_) {}
    };
    playChord();
    this.synthBgTimer = setInterval(playChord, 9000);
  }

  setSfxVolume(vol) {
    const n = Number(vol);
    if (!Number.isFinite(n)) return;
    this.sfxVolume = Math.max(0, Math.min(1, n));
    try {
      localStorage.setItem('temple_sfx_vol', String(this.sfxVolume));
    } catch (_) {}
  }

  stopZenAmbience() {
    try {
      if (this.bgAudio) this.bgAudio.pause();
    } catch (_) {}
    if (this.synthBgTimer) {
      clearInterval(this.synthBgTimer);
      this.synthBgTimer = null;
    }
  }

  setBgDucking(ducked) {
    if (!this.bgMusicEnabled) return;
    try {
      if (!this.useSynthMusicFallback && this.bgAudio) {
        this.bgAudio.volume = ducked ? this.getDuckedVolume() : this.bgBaseVolume;
      }
    } catch (_) {}
  }

  // Đặt thời gian tối đa cho một câu đọc: file lỗi/treo không làm kẹt cả hàng đợi
  withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
  }

  // --------------------------------------------------------------------------
  // 2. TIẾNG MÕ GỖ TỤNG KINH (WOODEN FISH PERCUSSION SYNTH)
  // --------------------------------------------------------------------------
  playWoodenFish(pitchMultiplier = 1.0, when = 0) {
    if (!this.sfxEnabled || this.sfxVolume <= 0) return;
    try {
      const ctx = this.ensureContext();
      const now = Math.max(ctx.currentTime, when || 0);

      const osc1 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      const baseFreq = 620 * pitchMultiplier * (0.98 + Math.random() * 0.04);
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(baseFreq * 1.4, now);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.018);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.82, now + 0.14);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseFreq * 1.15, now);
      filter.Q.setValueAtTime(4.0, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28 * this.sfxVolume, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc1.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.onended = () => {
        osc1.disconnect();
        filter.disconnect();
        gain.disconnect();
      };

      osc1.start(now);
      osc1.stop(now + 0.16);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 3. TIẾNG ĐẠI HỒNG CHUNG (TEMPLE BRONZE BELL)
  // --------------------------------------------------------------------------
  playTempleBell(intensity = 1.0, when = 0) {
    if (!this.sfxEnabled || this.sfxVolume <= 0) return;
    try {
      const ctx = this.ensureContext();
      const now = Math.max(ctx.currentTime, when || 0);

      const base = 174;
      const partials = [
        { ratio: 0.5, amp: 0.22, decay: 4.2 },
        { ratio: 1.0, amp: 0.35, decay: 3.6 },
        { ratio: 1.506, amp: 0.16, decay: 2.4 },
        { ratio: 2.0, amp: 0.18, decay: 1.9 }
      ];

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.28 * Math.min(1.0, intensity) * this.sfxVolume, now);
      master.connect(ctx.destination);

      partials.forEach((p, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * p.ratio, now);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(p.amp, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

        osc.connect(g);
        g.connect(master);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
          if (idx === 0) master.disconnect();
        };
        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 4. TIẾNG LẮC ỐNG XĂM TRE (FORTUNE STICK SHAKER)
  // --------------------------------------------------------------------------
  playFortuneShake() {
    if (!this.sfxEnabled) return;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.playWoodenFish(1.32 + (i % 2) * 0.16);
      }, i * 120);
    }
  }

  // --------------------------------------------------------------------------
  // 5. TIẾNG CHUÔNG NGỌC DÂNG LỄ / THẮP HƯƠNG (SINGING CHIME)
  // --------------------------------------------------------------------------
  playIncenseChime() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const notes = [528, 660];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.1);
        gain.gain.linearRampToValueAtTime(0.10, now + idx * 0.1 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 1.1);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 1.15);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 6. ZEROTTS VOICE QUEUE & PREFETCHER
  // --------------------------------------------------------------------------
  enqueueTts(text, options = {}) {
    const onStart = typeof options.onStart === 'function' ? options.onStart : null;
    const onEnd = typeof options.onEnd === 'function' ? options.onEnd : null;

    if (!this.ttsEnabled) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 5500);
      return;
    }
    const clean = String(text || '').trim();
    if (!clean) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 5500);
      return;
    }

    if (this.ttsQueue.length >= 6) {
      const dropped = this.ttsQueue.shift();
      if (dropped?.onStart) dropped.onStart();
      if (dropped?.onEnd) dropped.onEnd();
    }

    const item = {
      id: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      voice: (options.voice || this.ttsVoice || 'maichi').toLowerCase(),
      url: options.url || null,
      onStart,
      onEnd,
      fetchPromise: null
    };

    if (!item.url) {
      item.fetchPromise = this.fetchZeroTtsAudio(item.text, item.voice);
    }

    this.ttsQueue.push(item);
    this.processTtsQueue();
  }

  async fetchZeroTtsAudio(text, voice = 'maichi') {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, roomId: this.roomId || undefined })
      });
      const data = await res.json();
      if (data && data.ok && data.url) {
        return data;
      }
      return { ok: false, error: data?.error || 'ZeroTTS unavailable' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async processTtsQueue() {
    if (this.ttsPlaying || this.ttsQueue.length === 0) return;
    this.ttsPlaying = true;
    const item = this.ttsQueue.shift();

    try {
      let audioUrl = item.url;
      if (!audioUrl && item.fetchPromise) {
        const res = await this.withTimeout(item.fetchPromise, 35000);
        if (res && res.ok && res.url) {
          audioUrl = res.url;
        }
      }

      if (audioUrl) {
        this.setBgDucking(true);
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: true, synthesizing: false, text: item.text });
        }
        if (item.onStart) item.onStart();
        await this.withTimeout(this.playWavUrl(audioUrl), 45000);
        if (this.currentAudio) {
          try { this.currentAudio.pause(); } catch (_) {}
          this.currentAudio = null;
        }
        if (item.onEnd) item.onEnd();
      } else {
        if (item.onStart) item.onStart();
        if (item.onEnd) setTimeout(item.onEnd, 5500);
      }
    } catch (err) {
      console.warn('[ZeroTTS Playback Warning]', err);
      if (item.onStart) item.onStart();
      if (item.onEnd) item.onEnd();
    } finally {
      this.ttsPlaying = false;
      if (this.ttsQueue.length === 0) {
        this.setBgDucking(false);
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: false, synthesizing: false, text: '' });
        }
      } else {
        setTimeout(() => this.processTtsQueue(), 250);
      }
    }
  }

  playWavUrl(url) {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(url);
        this.currentAudio = audio;
        audio.volume = this.ttsVolume;
        const done = () => {
          if (this.currentAudio === audio) this.currentAudio = null;
          audio.onended = null;
          audio.onerror = null;
          resolve();
        };
        audio.onended = done;
        audio.onerror = done;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(done);
        }
      } catch (_) {
        resolve();
      }
    });
  }
}

window.TempleAudioEngine = TempleAudioEngine;
