import type { StageView } from './useGame';

/**
 * Hiệu ứng âm thanh, chỉ phát ở trang stage. Mặc định trình duyệt tự tạo tiếng (không cần file, không lo bản quyền).
 * Muốn tiếng đẹp hơn: bỏ file mp3 cùng tên vào public/assets/lophoc/sfx/ (vd ting.mp3), game tự dùng file thay cho tiếng tự tạo.
 *   ting    có bạn trả lời đúng
 *   drum    trống vào tiết
 *   go      cô hô bắt đầu, hiện bảng chữ
 *   tick    tích tắc 5 giây cuối
 *   bell    hết giờ, hiện đáp án
 *   pop     quà bay xuống bàn
 *   clap    cả lớp vỗ tay
 *   fanfare phát quà giữa tiết, sinh nhật
 */
export type SfxName = 'ting' | 'drum' | 'go' | 'tick' | 'bell' | 'pop' | 'clap' | 'fanfare';
const NAMES: SfxName[] = ['ting', 'drum', 'go', 'tick', 'bell', 'pop', 'clap', 'fanfare'];

class Sfx {
  volume = 0.35; // nhỏ hơn giọng cô để không lấn tiếng
  private ctx: AudioContext | null = null;
  private files: Partial<Record<SfxName, HTMLAudioElement>> = {};
  private lastAt: Partial<Record<SfxName, number>> = {};

  /** Thử tải file mp3 riêng của chủ kênh; không có file thì dùng tiếng tự tạo */
  loadFiles() {
    for (const n of NAMES) {
      const a = new Audio(`/assets/lophoc/sfx/${n}.mp3`);
      a.preload = 'auto';
      a.addEventListener('canplaythrough', () => (this.files[n] = a), { once: true });
    }
  }

  play(name: SfxName, minGapMs = 80) {
    if (this.volume <= 0) return;
    const now = performance.now();
    if (now - (this.lastAt[name] ?? -Infinity) < minGapMs) return;
    this.lastAt[name] = now;
    const file = this.files[name];
    if (file) {
      const a = file.cloneNode() as HTMLAudioElement;
      a.volume = Math.min(1, this.volume * 2);
      void a.play().catch(() => {});
      return;
    }
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      SYNTH[name](this.ctx, this.volume);
    } catch {
      // trình duyệt không cho phát tiếng: bỏ qua
    }
  }

  // ---------- tự phát theo trạng thái game ----------
  private lastTick = -1;
  private lastGiftAt = -1;

  /** Gọi mỗi nhịp game: tích tắc 5 giây cuối lúc đang chờ trả lời */
  clock(phase: string, boardShown: boolean, endsAt: number, now: number) {
    const left = Math.ceil((endsAt - now) / 1000);
    const asking = (phase === 'question' && boardShown) || phase === 'bonus';
    if (!asking || left > 5 || left < 1) {
      this.lastTick = -1;
      return;
    }
    if (left !== this.lastTick) {
      this.lastTick = left;
      this.play('tick', 0);
    }
  }

  /** So ảnh chụp trước và sau để phát tiếng đúng lúc */
  watch(prev: StageView | null, next: StageView) {
    const giftAt = Math.max(0, ...next.seats.flatMap((s) => s.desk.map((g) => g.at)));
    if (!prev) {
      this.lastGiftAt = giftAt; // mở trang: quà cũ không kêu lại
      return;
    }
    if (next.phase === 'intro' && prev.phase !== 'intro') this.play('drum');
    if (next.phase === 'question' && next.boardShown && !(prev.phase === 'question' && prev.boardShown && prev.qNo === next.qNo)) this.play('go');
    if (next.qNo === prev.qNo && next.correctCount > prev.correctCount) this.play('ting', 150);
    if (next.phase === 'reveal' && prev.phase !== 'reveal') this.play('bell');
    if (giftAt > this.lastGiftAt) this.play('pop');
    this.lastGiftAt = Math.max(this.lastGiftAt, giftAt);
    if (next.clapping && !prev.clapping) this.play('clap');
    if ((next.phase === 'praise' && prev.phase !== 'praise') || (next.birthday && next.birthday.at !== prev.birthday?.at)) this.play('fanfare', 500);
  }
}

// ---------- tiếng tự tạo ----------
type Synth = (ctx: AudioContext, vol: number) => void;

/** 1 nốt: sóng, tần số, lúc bắt đầu (giây), dài bao lâu, to bao nhiêu */
function tone(ctx: AudioContext, vol: number, type: OscillatorType, freq: number, start: number, dur: number, gain = 1, slideTo?: number) {
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol * gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Tiếng xè (vỗ tay, mặt trống) */
function noise(ctx: AudioContext, vol: number, start: number, dur: number, gain = 1, filterFreq = 1500) {
  const t = ctx.currentTime + start;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t);
}

const SYNTH: Record<SfxName, Synth> = {
  // 2 nốt cao trong trẻo
  ting: (c, v) => {
    tone(c, v, 'sine', 1319, 0, 0.25, 0.6);
    tone(c, v, 'sine', 1760, 0.07, 0.35, 0.5);
  },
  // trống trường "tùng tùng tùng"
  drum: (c, v) => {
    for (const s of [0, 0.32, 0.64]) {
      tone(c, v, 'sine', 110, s, 0.45, 1.4, 55);
      noise(c, v, s, 0.12, 0.4, 300);
    }
  },
  // "ting ting" đi lên: bắt đầu
  go: (c, v) => {
    tone(c, v, 'triangle', 784, 0, 0.15, 0.7);
    tone(c, v, 'triangle', 1175, 0.12, 0.3, 0.7);
  },
  tick: (c, v) => tone(c, v, 'square', 1000, 0, 0.05, 0.25),
  // chuông báo hết giờ
  bell: (c, v) => {
    tone(c, v, 'sine', 880, 0, 0.9, 0.6);
    tone(c, v, 'sine', 1320, 0, 0.6, 0.25);
  },
  // "bụp" quà rơi xuống bàn
  pop: (c, v) => tone(c, v, 'sine', 600, 0, 0.16, 0.9, 1400),
  // vỗ tay lộp bộp
  clap: (c, v) => {
    for (let i = 0; i < 14; i++) noise(c, v, i * 0.09 + Math.random() * 0.04, 0.08, 0.5, 1200 + Math.random() * 800);
  },
  // kèn nhỏ "tà ta ta taaa"
  fanfare: (c, v) => {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(c, v, 'triangle', f, i * 0.13, i === 3 ? 0.6 : 0.16, 0.6));
  },
};

export const sfx = new Sfx();
