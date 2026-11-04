import { GAME } from './config';
import { LINES, PICK_TOPICS, POLLS, REWARDS, type Poll } from './loi-thoai';
import { SLOTS, type Question, type Slot } from './questions';
import { makeMath, type MathLevel } from './math';

/**
 * Lõi game Lớp Học Chữ: không đụng React, không đụng giọng đọc, chạy theo đồng hồ truyền vào.
 * Trang stage gọi chat/gift/like/tick rồi đọc các câu trả về; test ở quiz.check.ts.
 *
 * Một vòng: intro → 20 câu, có 4 câu toán (question → [bonus] → reveal) → results → recess (giờ ra chơi) → intro ...
 */

export type Phase = 'intro' | 'question' | 'bonus' | 'reveal' | 'praise' | 'results' | 'recess' | 'vote';

/** 1 dòng báo cáo sau buổi live: câu nào khó quá / dễ quá */
export interface ReportRow {
  id: string;
  answer: string;
  category: string;
  attempts: number; // số bạn trả lời (đúng + sai)
  correct: number;
  at: number;
}
export type RecessGame = 'rps' | 'callup' | 'pick' | 'roll' | 'heart';
type RecessStage = 'play' | 'result' | 'board';

export interface Student {
  username: string;
  nickname: string; // đã lọc từ cấm
  spoken: string; // tên để đọc
  avatar: string;
  girl: boolean;
  score: number; // điểm tiết này (xếp chỗ ngồi, xoá khi sang tiết mới)
  session: number; // điểm cả buổi live (lớp trưởng, lớp phó)
  reachedAt: number; // lúc đạt điểm hiện tại (hòa điểm: ai đạt trước xếp trên)
  streak: number;
  lastActive: number;
  joinedAt: number;
  desk: DeskGift[]; // quà cô thưởng đặt trên bàn (xoá khi sang tiết mới)
  days: number; // chuyên cần: số ngày đi học liền (server báo về, 0 = chưa biết)
  bubble?: { text: string; at: number }; // bình luận gần nhất hiện thành bong bóng trên đầu
  standUntil: number; // bị cô phạt lên bục đứng (học sinh cá biệt) tới lúc này
}

export interface DeskGift {
  icon: string;
  at: number; // lúc cô tặng (để vẽ quà bay xuống bàn)
}

export interface Answerer {
  username: string;
  nickname: string;
  avatar: string;
  createTime: number; // giờ TikTok gắn lúc người xem gửi comment
  seq: number; // thứ tự bot nhận (phụ khi trùng giờ)
  points: number;
}

export interface Say {
  text: string;
  priority?: boolean;
  /** câu chính (đọc đề, đáp án, tổng kết, ra chơi): chen lên đọc trước, câu nói thêm còn chờ thì bỏ */
  main?: boolean;
  /** câu nói thêm: quá chừng này ms chưa tới lúc nói thì bỏ (mặc định GAME.chatterMaxWaitMs) */
  ttl?: number;
  /** nhắc sắp hết giờ: nói liền nhưng KHÔNG dừng đồng hồ */
  warn?: boolean;
  /** câu cô hô bắt đầu: lúc bắt đầu đọc câu này thì hiện bảng chữ (gọi showBoard) */
  go?: boolean;
}

export interface ChatIn {
  username: string;
  nickname: string;
  spoken: string;
  avatar: string;
  comment: string;
  createTime: number;
  /** false: bình luận có từ cấm, không hiện bong bóng */
  safe?: boolean;
}

type Person = Pick<ChatIn, 'username' | 'nickname' | 'spoken' | 'avatar'>;

// Dấu thanh kiểu cũ/mới ("hóa"/"hoá", "thủy"/"thuỷ") coi là một: đưa về kiểu mới (dấu trên chữ sau) ở cuối từ
const OLD_OA = /o([̣̀́̃̉])([ae])(?!\p{L})/gu;
const OLD_UY = /u([̣̀́̃̉])y(?!\p{L})/gu;
export const normVi = (s: string) =>
  s.normalize('NFD').toLowerCase().replace(OLD_OA, 'o$2$1').replace(OLD_UY, 'uy$1').normalize('NFC');
// Thường hoá: chuẩn Unicode, chữ thường, bỏ khoảng trắng và dấu câu, GIỮ dấu tiếng Việt
export const compactVi = (s: string) => normVi(s).replace(/[^\p{L}\p{N}]/gu, '');
// Bỏ cả dấu: "Vào Lớp" -> "vaolop"
export const plain = (s: string) =>
  compactVi(s).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');

/** Buổi trong ngày theo giờ máy: sáng 5-10h, trưa 10-13h, chiều 13-17h, tối 17-22h, khuya 22-5h */
export type DayPeriod = 'sang' | 'trua' | 'chieu' | 'toi' | 'khuya';
export function dayPeriod(now: number): DayPeriod {
  const h = new Date(now).getHours();
  return h >= 5 && h < 10 ? 'sang' : h >= 10 && h < 13 ? 'trua' : h >= 13 && h < 17 ? 'chieu' : h >= 17 && h < 22 ? 'toi' : 'khuya';
}
const PERIOD_LINES = { sang: 'timeMorning', trua: 'timeNoon', chieu: 'timeAfternoon', toi: 'timeEvening', khuya: 'timeNight' } as const;

/** Tên chủ đề gọn để hiện và đọc: bỏ phần trong ngoặc, vd "Ca dao, thành ngữ (điền từ còn thiếu)" -> "Ca dao, thành ngữ" */
export const topicName = (category: string) => category.replace(/\s*\(.*\)\s*$/, '');

/** Bình luận báo sinh nhật của chính mình ("hôm nay sinh nhật con"), không tính câu chúc người khác ("chúc mừng sinh nhật") */
export function isBirthday(comment: string) {
  const p = plain(comment);
  return p.includes('sinhnhat') && !p.includes('chuc') && !p.includes('mung');
}

/** Điểm theo thứ hạng trả lời đúng (0 = nhanh nhất) */
export function pointsForRank(rank: number) {
  return GAME.rankPoints[rank] ?? GAME.latePoints;
}

/** Xáo chữ cái của đáp án (bỏ khoảng trắng), chắc chắn khác thứ tự gốc nếu được */
export function scramble(answer: string, rand = Math.random): string[] {
  const letters = [...answer.normalize('NFC').toUpperCase().replace(/\s+/g, '')];
  if (new Set(letters).size < 2) return letters;
  let out = letters;
  for (let tries = 0; tries < 10 && out.join('') === letters.join(''); tries++) {
    out = [...letters];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
  }
  return out;
}

const hash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
};

/** Bốc câu thoại kiểu xáo bài: đọc hết cả nhóm mới lặp, và không lặp ngay câu vừa đọc */
export class LineBag {
  private left = new Map<string, number[]>();
  private last = new Map<string, number>();
  constructor(private rand = Math.random) {}
  pick<T>(key: string, list: T[]): T {
    let pool = this.left.get(key);
    if (!pool || pool.length === 0) {
      pool = list.map((_, i) => i);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      if (pool.length > 1 && pool[pool.length - 1] === this.last.get(key)) pool.unshift(pool.pop()!);
      this.left.set(key, pool);
    }
    const i = pool.pop()!;
    this.last.set(key, i);
    return list[i];
  }
}

const RPS = { bua: 'búa', keo: 'kéo', bao: 'bao' } as const;
type Rps = keyof typeof RPS;
const BEATS: Record<Rps, Rps> = { bua: 'keo', keo: 'bao', bao: 'bua' };
const RECESS_GAMES: RecessGame[] = ['rps', 'callup', 'pick', 'roll', 'heart'];

interface Recess {
  game: RecessGame;
  stage: RecessStage;
  rps: Map<string, Rps>;
  teacher: Rps | null;
  callTarget: Student | null;
  callQ: Question | null;
  callTiles: string[];
  callResult: '' | 'right' | 'wrong' | 'silent';
  pick: [string, string];
  votes: Map<string, 1 | 2>;
  roll: Answerer[];
  hearts: number;
}

export class Classroom {
  phase: Phase = 'intro';
  round = 0; // gọi newRound() để vào tiết 1
  qNo = 0; // câu thứ mấy trong tiết (1..questionsPerRound)
  phaseStartedAt: number;
  phaseEndsAt: number;
  students = new Map<string, Student>();

  private roundQs: Question[] = [];
  q: Question | null = null;
  tiles: string[] = [];
  revealed = new Set<number>(); // vị trí chữ đã mở (tính trên đáp án bỏ khoảng trắng)
  private bonusUsed = false;
  private quietSaid = false;
  correct: Answerer[] = [];
  private tried = new Set<string>(); // ai đã trả lời câu này (đúng hay sai)
  private wrong = new Set<string>();
  private seq = 0;
  stats = { received: 0, attempts: 0 };
  flowers = 0;
  lastFlowerAt = 0;
  clapUntil = 0;
  private lastChatAt: number;
  /** lần cuối có người xem làm gì (bình luận, tặng quà, thả tim): lâu quá thì coi là lớp vắng */
  private lastSeenAt: number;
  /** tiết ôn bài: lớp vắng nên hỏi lại câu cũ, để dành câu mới */
  review = false;
  private lastPeriod = '';
  private lastIdleAt = 0;
  private monitor = ''; // lớp trưởng hiện tại: điểm tiết này cao nhất (mỗi tiết tranh lại từ đầu)
  /** lớp trưởng các tiết đã xong (mới nhất trước), hiện ở bảng giờ ra chơi */
  champions: { round: number; username: string; nickname: string; score: number }[] = [];
  recess: Recess | null = null;
  private lastRecess: RecessGame | null = null;

  /** id câu vừa dùng, trang stage gửi lên server để buổi sau không hỏi lại sớm */
  usedLog: string[] = [];
  /** điểm cộng thêm cho bảng vàng tuần, trang stage gửi lên server rồi xoá */
  weekDelta = new Map<string, { nickname: string; points: number }>();
  /** tên người nhất bảng vàng tuần (server báo về), cô đọc thỉnh thoảng */
  weekLeader = '';
  /** câu chủ kênh bấm "Bỏ câu này": không bao giờ hỏi lại; banLog gửi lên server rồi xoá */
  private banned: Set<string>;
  banLog: { id: string; answer: string; clue: string }[] = [];
  /** báo cáo từng câu đã hỏi, gửi lên server rồi xoá */
  reportLog: ReportRow[] = [];
  /** bình chọn chủ đề tiết sau (pha 'vote') và chủ đề cả lớp đã chọn cho tiết này */
  vote: { topics: [string, string]; votes: Map<string, 1 | 2> } | null = null;
  topic = '';
  private lastTopics: string[] = [];
  /** chúc mừng sinh nhật: ai đã được chúc (mỗi người 1 lần mỗi buổi) và biểu ngữ đang hiện */
  private birthdayDone = new Set<string>();
  private lastBirthdayAt = -Infinity;
  birthday: { nickname: string; at: number } | null = null;
  /** "Ai yêu cô thì gõ số 1": đang đếm ai gõ (trong GAME.loveWindowMs) */
  love: { at: number; fans: string[] } | null = null;
  /** bình chọn vui ("miền Bắc gõ B, miền Nam gõ N"): đang đếm phiếu */
  poll: { at: number; opts: Poll['opts']; votes: Map<string, string> } | null = null;
  private lastLoveAt: number;
  private engageNo = 0;
  /** bạn nhỏ đang đi lên bục tặng hoa cô (mỗi lúc 1 bạn) */
  walk: { username: string; at: number } | null = null;

  readonly lines: LineBag;

  constructor(
    private bank: Question[],
    now: number,
    private rand = Math.random,
    private history: Record<string, number> = {}, // id câu -> lần hỏi gần nhất (ms)
    banned: Iterable<string> = [],
  ) {
    this.banned = new Set(banned);
    this.lines = new LineBag(rand);
    this.phaseStartedAt = now;
    this.phaseEndsAt = now + GAME.introSec * 1000;
    this.lastChatAt = now;
    this.lastSeenAt = now;
    this.lastLoveAt = now;
  }

  /** Lớp vắng: quá GAME.emptyRoomMs không ai bình luận, tặng quà hay thả tim */
  isEmpty(now: number) {
    return now - this.lastSeenAt > GAME.emptyRoomMs;
  }

  /** 1 câu cô nói (giọng nữ) */
  private t(text: string, priority = false): Say {
    return { text: `F: ${text}`, priority };
  }
  /** đánh dấu câu chính */
  private mainOf(lines: Say[]): Say[] {
    return lines.map((l) => ({ ...l, main: true }));
  }
  private line0(key: keyof typeof LINES) {
    return this.t(this.lines.pick(key, LINES[key] as string[]));
  }
  private line(key: keyof typeof LINES, ...args: string[]) {
    const fn = this.lines.pick(key, LINES[key] as ((...a: string[]) => string)[]);
    return fn(...args);
  }

  // ---------- người chơi ----------
  private touch(e: Person, now: number) {
    this.lastSeenAt = now;
    this.clock = Math.max(this.clock, now);
    let s = this.students.get(e.username);
    if (!s) {
      s = { ...e, girl: hash(e.username) % 2 === 0, score: 0, session: 0, reachedAt: 0, streak: 0, lastActive: now, joinedAt: now, desk: [], days: 0, standUntil: 0 };
      this.students.set(e.username, s);
    } else {
      s.nickname = e.nickname;
      s.spoken = e.spoken;
      if (e.avatar) s.avatar = e.avatar;
      s.lastActive = now;
    }
    return s;
  }

  /** Cộng điểm: `inClass` = điểm tiết học (xếp ghế); mọi điểm đều vào cả buổi + bảng tuần */
  private award(s: Student, points: number, now: number, inClass: boolean) {
    if (inClass) {
      s.score += points;
      s.reachedAt = now;
    }
    s.session += points;
    const w = this.weekDelta.get(s.username) ?? { nickname: s.nickname, points: 0 };
    w.nickname = s.nickname;
    w.points += points;
    this.weekDelta.set(s.username, w);
  }

  /** Cô tặng 1 món quà: đặt lên bàn bạn nhỏ, trả về tên quà để cô đọc */
  private giveGift(s: Student, now: number): string {
    const g = REWARDS[Math.floor(this.rand() * REWARDS.length)];
    s.desk = [...s.desk, { icon: g.icon, at: now }].slice(-GAME.deskGifts);
    return g.name;
  }

  /** Lớp trưởng đổi người thì cô thông báo */
  private checkMonitor(): Say[] {
    const top = this.seats(1)[0];
    if (!top || top.score <= 0 || top.username === this.monitor) return [];
    const first = this.monitor === '';
    this.monitor = top.username;
    // người đầu tiên có điểm trong tiết thì khỏi báo (cô vừa khen rồi), từ lần đổi người mới báo
    return first ? [] : [this.t(this.line('newMonitor', top.spoken))];
  }

  /** Lớp trưởng, lớp phó: 3 bạn điểm tiết cao nhất (chỉ tính 20 câu của tiết này) */
  private titleHolders() {
    return this.seats(3).filter((s) => s.score > 0);
  }

  /**
   * 20 ghế: điểm tiết cao ngồi đầu; cùng điểm thì bạn còn tương tác (bình luận trong 10 phút) ngồi trước bạn đã im lâu
   * (thường đã rời live), rồi ai đạt trước, rồi điểm cả buổi, rồi ai vào trước (chỗ không nhảy lung tung)
   */
  seats(n = GAME.seats): Student[] {
    const away = (s: Student) => (this.clock - s.lastActive > GAME.seatActiveMs ? 1 : 0);
    return [...this.students.values()]
      .sort((a, b) => b.score - a.score || away(a) - away(b) || a.reachedAt - b.reachedAt || b.session - a.session || a.joinedAt - b.joinedAt)
      .slice(0, n);
  }
  /** giờ của nhịp gần nhất (để xếp ghế biết ai đã im lâu) */
  private clock = 0;

  sessionTop(n: number): Student[] {
    return [...this.students.values()].filter((s) => s.session > 0).sort((a, b) => b.session - a.session || a.joinedAt - b.joinedAt).slice(0, n);
  }

  // ---------- chọn câu ----------
  /** Chọn câu lâu chưa hỏi nhất theo độ khó, tránh 2 câu liền cùng chủ đề và quá 2 câu/chủ đề mỗi tiết */
  /** `difficulty` = 'meo' / 'su': bốc câu đố mẹo / lịch sử; còn lại bốc câu chữ thường (không bao giờ lấy câu có chỗ riêng) */
  private pickOne(difficulty: Question['difficulty'] | Slot, taken: Question[], now: number, topic = ''): Question | null {
    const used = new Set(taken.map((q) => q.id));
    const perCat = (c: string) => taken.filter((q) => q.category === c).length;
    const prev = taken[taken.length - 1]?.category;
    const slot = (SLOTS as readonly string[]).includes(difficulty) ? difficulty : undefined;
    const kind = (q: Question) => q.slot === slot && !this.banned.has(q.id) && !used.has(q.id);
    let pool = this.bank.filter((q) => kind(q) && (slot || q.difficulty === difficulty));
    // chủ đề cả lớp bình chọn: lấy trong chủ đề đó trước (cùng độ khó, hết thì khác độ khó)
    const fav = topic ? pool.filter((q) => q.category === topic) : [];
    const favAny = topic && !fav.length ? this.bank.filter((q) => kind(q) && q.category === topic) : [];
    if (fav.length || favAny.length) pool = fav.length ? fav : favAny;
    else {
      const nice = pool.filter((q) => q.category !== prev && perCat(q.category) < 2);
      if (nice.length) pool = nice;
    }
    if (!pool.length) pool = this.bank.filter((q) => kind(q));
    if (!pool.length) return null;
    // xáo trước rồi xếp theo lần hỏi gần nhất: câu chưa hỏi bao giờ lên đầu, thứ tự trong file không ảnh hưởng
    const at = (q: Question) => this.history[q.id] ?? 0;
    pool = [...pool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.sort((a, b) => at(a) - at(b));
    const q = pool[0];
    this.history[q.id] = now;
    this.usedLog.push(q.id);
    return q;
  }

  /** Lớp vắng: hỏi lại câu đã từng hỏi (bốc ngẫu nhiên), không ghi sổ, để dành câu mới cho lúc đông người */
  private pickReview(difficulty: Question['difficulty'] | Slot, taken: Question[]): Question | null {
    const used = new Set(taken.map((q) => q.id));
    const slot = (SLOTS as readonly string[]).includes(difficulty) ? difficulty : undefined;
    const pool = this.bank.filter(
      (q) => q.slot === slot && (slot || q.difficulty === difficulty) && (this.history[q.id] ?? 0) > 0 && !this.banned.has(q.id) && !used.has(q.id),
    );
    return pool.length ? pool[Math.floor(this.rand() * pool.length)] : null;
  }

  /** Bốc câu cho tiết. `from`: giữ nguyên các câu trước vị trí này (đang ôn bài thì có bạn vào, đổi phần còn lại sang câu mới) */
  private pickRound(now: number, from = 0) {
    const out: Question[] = this.roundQs.slice(0, from);
    let plain = 0; // thứ tự câu chữ thường trong tiết
    let fav = 0; // số câu đã lấy theo chủ đề cả lớp chọn
    for (const [i, d] of GAME.roundPlan.entries()) {
      if (i < from) {
        if (!d.startsWith('math') && !(SLOTS as readonly string[]).includes(d)) plain++;
        continue;
      }
      let q: Question | null;
      // lớp vắng: ôn bài bằng câu cũ (câu toán vẫn tự sinh); chưa có câu cũ thì lấy câu mới như thường
      const old = this.review && !d.startsWith('math') ? this.pickReview(d as Question['difficulty'] | Slot, out) : null;
      if (old) {
        out.push(old);
        if (!(SLOTS as readonly string[]).includes(d)) plain++;
        continue;
      }
      // câu toán tự sinh, không tính vào chủ đề nên câu chữ trước và sau nó vẫn khác chủ đề nhau
      if (d.startsWith('math')) q = makeMath(Number(d.slice(4)) as MathLevel, this.rand);
      else if ((SLOTS as readonly string[]).includes(d)) q = this.pickOne(d as Slot, out.filter((x) => !x.math), now);
      else {
        // chủ đề cả lớp chọn: cách 1 câu chữ thường lấy 1 câu chủ đề đó, tối đa GAME.voteTopicQuestions câu
        const useTopic = this.topic && plain % 2 === 0 && fav < GAME.voteTopicQuestions ? this.topic : '';
        q = this.pickOne(d as Question['difficulty'], out.filter((x) => !x.math), now, useTopic);
        if (useTopic && q?.category === useTopic) fav++;
        plain++;
      }
      if (q) out.push(q);
    }
    this.roundQs = out;
  }

  get golden() {
    return this.qNo > 0 && this.qNo === this.roundQs.length && this.roundQs.length >= GAME.questionsPerRound;
  }

  private lettersOf(q: Question | null) {
    return q ? [...q.answer.normalize('NFC').toUpperCase().replace(/\s+/g, '')] : [];
  }
  get answerLetters() {
    return this.lettersOf(this.q);
  }

  /** Ô đáp án theo từng chữ: null = chưa mở, ' ' = khoảng cách giữa 2 từ */
  slotsOf(q: Question | null, revealed: Set<number>, showAll: boolean): (string | null)[] {
    if (!q) return [];
    const out: (string | null)[] = [];
    let i = 0;
    for (const ch of q.answer.normalize('NFC').toUpperCase().trim()) {
      if (/\s/.test(ch)) {
        if (out[out.length - 1] !== ' ') out.push(' ');
        continue;
      }
      out.push(showAll || revealed.has(i) ? ch : null);
      i++;
    }
    return out;
  }
  slots(showAll = false) {
    return this.slotsOf(this.q, this.revealed, showAll);
  }

  /** Mở thêm 1 chữ (không mở quá số chữ - 2). Trả về false nếu hết chữ được mở */
  revealOne(): boolean {
    const n = this.answerLetters.length;
    if (this.revealed.size >= Math.max(0, n - GAME.keepHiddenLetters)) return false;
    const hidden = [...Array(n).keys()].filter((i) => !this.revealed.has(i));
    this.revealed.add(hidden[Math.floor(this.rand() * hidden.length)]);
    return true;
  }

  private setPhase(p: Phase, now: number, sec: number) {
    this.phase = p;
    this.phaseStartedAt = now;
    this.phaseEndsAt = now + sec * 1000;
    this.heldMs = 0;
    this.warned = false;
  }

  private warned = false; // đã nhắc "chuẩn bị hết giờ" ở phần này chưa

  private heldMs = 0;
  /** Cô đang đọc câu chính: dừng đồng hồ phần hiện tại (đọc đề xong mới đếm giờ trả lời). Có trần để không kẹt. */
  hold(ms: number) {
    const add = Math.max(0, Math.min(ms, GAME.maxHoldMs - this.heldMs));
    this.heldMs += add;
    this.phaseStartedAt += add;
    this.phaseEndsAt += add;
  }

  /** Đã hiện bảng chữ (chữ xáo / phép tính) chưa: cô đọc đề xong, hô bắt đầu mới hiện */
  boardShown = false;
  showBoard() {
    this.boardShown = true;
  }

  /** Lúc được nói thêm (chào, cảm ơn, cà khịa): đang chờ học sinh trả lời (hoặc lúc cô dừng giữa tiết) và còn đủ giờ */
  chatterWindow(now: number) {
    const left = this.phaseEndsAt - now;
    const answering =
      this.phase === 'question' ||
      this.phase === 'bonus' ||
      this.phase === 'praise' ||
      this.phase === 'vote' ||
      (this.phase === 'recess' && this.recess?.stage === 'play');
    return answering && left > GAME.chatterMinLeftMs;
  }

  /** Câu cô đọc trước gợi ý: "Đây là một từ gồm 5 chữ cái, là một món ăn." (hô bắt đầu xong mới hiện chữ trên bảng) */
  intro(q: Question) {
    if (q.math) return q.kind;
    const n = this.lettersOf(q).length;
    const word = q.slot === 'anh' ? `một từ tiếng Anh gồm ${n} chữ cái` : `một từ gồm ${n} chữ cái`;
    const kind = /^Đây là\s+/i.exec(q.kind);
    // "Đây là một món ăn." -> "Đây là một từ gồm 5 chữ cái, là một món ăn."
    if (kind) return `Đây là ${word}, là ${q.kind.slice(kind[0].length)}`;
    // "Câu lịch sử nè." -> "Câu lịch sử nè. Đây là một từ gồm 8 chữ cái."
    return `${q.kind} Đây là ${word}.`;
  }

  private startQuestion(now: number): Say[] {
    this.qNo++;
    // đang ôn bài mà có bạn vào lớp: phần còn lại của tiết đổi sang câu mới
    const back: Say[] = [];
    if (this.review && !this.isEmpty(now) && this.roundQs.length === GAME.roundPlan.length) {
      this.review = false;
      this.pickRound(now, this.qNo - 1);
      back.push(this.line0('reviewEnd'));
    }
    this.q = this.roundQs[this.qNo - 1] ?? null;
    if (!this.q) return this.startResults(now, true);
    this.tiles = this.q.math ? [] : scramble(this.q.answer, this.rand);
    this.boardShown = false;
    this.revealed = new Set();
    this.bonusUsed = false;
    this.quietSaid = false;
    this.correct = [];
    this.tried = new Set();
    this.wrong = new Set();
    this.stats = { received: 0, attempts: 0 };
    this.setPhase('question', now, GAME.questionSec);
    const out: Say[] = [...back];
    if (this.golden) out.push(this.line0('goldenIntro'));
    else if (this.q.math) out.push(this.line0('mathIntro'));
    out.push(this.t(`Câu ${this.qNo}. ${this.intro(this.q)} ${this.q.clue}`));
    // đọc đề xong cô hô bắt đầu (lúc đó mới hiện bảng chữ); đồng hồ dừng trong lúc cô nói nên hô xong mới đếm giờ
    out.push({ ...this.line0('go'), go: true });
    return this.mainOf(out);
  }

  private matches(q: Question | null, comment: string) {
    if (!q) return false;
    const key = GAME.requireDiacritics ? compactVi : plain;
    const typed = key(comment);
    return [q.answer, ...(q.acceptedAnswers ?? [])].some((a) => key(a) === typed);
  }

  /** Comment có phải là câu trả lời không: dài đúng bằng đáp án (không tính khoảng trắng). Nói chuyện thường không bị tính sai */
  private isAttempt(q: Question | null, comment: string) {
    const n = compactVi(comment).length;
    return !!q && [q.answer, ...(q.acceptedAnswers ?? [])].some((a) => compactVi(a).length === n);
  }

  // ---------- sự kiện ----------
  chat(e: ChatIn, now: number): Say[] {
    const s = this.touch(e, now);
    this.lastChatAt = now;
    // bong bóng chat: không hiện câu trả lời (lộ đáp án cho bạn khác) và câu có từ cấm
    const asking = this.phase === 'question' || this.phase === 'bonus';
    const answering = (asking && this.isAttempt(this.q, e.comment)) || (this.recess?.game === 'callup' && this.isAttempt(this.recess.callQ, e.comment));
    if (e.safe !== false && !answering && e.comment.trim()) s.bubble = { text: e.comment.trim().slice(0, 28), at: now };
    // đang trả lời câu có đáp án "sinh nhật" thì chấm bài, không coi là báo sinh nhật
    if (!answering && isBirthday(e.comment)) return this.celebrate(s, now);
    // đang rủ "ai yêu cô gõ số 1": ghi tên (không ảnh hưởng trả lời câu chữ vì đáp án không dài 1 chữ)
    if (this.love && now - this.love.at < GAME.loveWindowMs && plain(e.comment) === '1' && !this.love.fans.includes(s.username)) {
      this.love.fans.push(s.username);
    }
    // đang hỏi bình chọn vui: gõ đúng 1 chữ của lựa chọn (đáp án câu chữ luôn dài từ 2 chữ nên không lẫn)
    const key = plain(e.comment);
    if (this.poll && now - this.poll.at < GAME.loveWindowMs && this.poll.opts.some((o) => o.key === key) && !this.poll.votes.has(s.username)) {
      this.poll.votes.set(s.username, key);
    }
    if (this.phase === 'vote') return this.voteChat(s, e);
    if (this.phase === 'recess') return this.recessChat(s, e, now);
    if (this.phase !== 'question' && this.phase !== 'bonus') return [];
    this.stats.received++;
    if (!this.isAttempt(this.q, e.comment) || this.tried.has(e.username)) return [];
    this.tried.add(e.username);
    this.stats.attempts++;
    if (!this.matches(this.q, e.comment)) {
      this.wrong.add(e.username);
      return [];
    }
    this.correct.push({ username: e.username, nickname: e.nickname, avatar: e.avatar, createTime: e.createTime, seq: ++this.seq, points: 0 });
    // xếp theo giờ TikTok gắn, không theo lúc bot nhận (comment có thể tới lệch thứ tự)
    this.correct.sort((a, b) => a.createTime - b.createTime || a.seq - b.seq);
    const mult = this.golden ? 2 : 1;
    this.correct.forEach((a, i) => (a.points = pointsForRank(i) * mult));
    if (this.correct.length === 1) {
      // phòng vắng (ít bạn đang chơi): có người đúng thì chốt sớm, khỏi chờ đủ 20 giây
      const endAfter = this.activePlayers(now) < GAME.smallRoomPlayers ? GAME.smallRoomEndAfterSec : GAME.endAfterFirstSec;
      if (endAfter > 0) this.phaseEndsAt = Math.min(this.phaseEndsAt, now + endAfter * 1000);
      const fast = now - this.phaseStartedAt < GAME.superFastSec * 1000;
      if (!fast && this.rand() < GAME.giftChance) {
        return [{ ...this.t(this.line('firstCorrectGift', e.spoken, this.giveGift(s, now))), ttl: 6000 }];
      }
      return [{ ...this.t(this.line(fast ? 'superFast' : 'firstCorrect', e.spoken)), ttl: 6000 }];
    }
    return [];
  }

  /** Số bạn đang chơi: có bình luận trong 2 phút gần đây */
  activePlayers(now: number) {
    let n = 0;
    for (const s of this.students.values()) if (now - s.lastActive < GAME.activeWindowMs) n++;
    return n;
  }

  /** Chúc mừng sinh nhật: bánh kem lên bàn, cả lớp vỗ tay, biểu ngữ. Mỗi bạn 1 lần mỗi buổi, cách nhau ít nhất 1 phút */
  celebrate(s: Person, now: number): Say[] {
    const st = this.touch(s, now);
    if (this.birthdayDone.has(st.username) || now - this.lastBirthdayAt < GAME.birthdayCooldownMs) return [];
    this.birthdayDone.add(st.username);
    this.lastBirthdayAt = now;
    this.birthday = { nickname: st.nickname, at: now };
    st.desk = [...st.desk, { icon: '🎂', at: now }].slice(-GAME.deskGifts);
    this.clapUntil = now + GAME.clapSec * 1000;
    // nói chen lúc đang chờ trả lời (câu nói thêm), ưu tiên như cảm ơn quà, không cắt ngang đề
    return [this.t(this.line('birthday', st.spoken), true)];
  }

  /** Chuyên cần: server báo bạn này đi học mấy ngày liền. Ngày thứ 2 trở đi cô nhận ra, mốc đẹp thì tặng quà */
  attendance(e: Person, days: number, now: number): Say[] {
    const s = this.touch(e, now);
    s.days = days;
    if (days < 2 || s.spoken === 'bạn') return [];
    if (GAME.attendMilestones.includes(days) || (days > 30 && days % 10 === 0)) {
      return [{ ...this.t(this.line('attendMilestone', s.spoken, String(days), this.giveGift(s, now)), true), ttl: 60_000 }];
    }
    return [{ ...this.t(this.line('attendBack', s.spoken, String(days))), ttl: 30_000 }];
  }

  /** Nút "Bỏ câu này": câu lỗi thì bỏ luôn, ghi sổ không hỏi lại, sang câu tiếp không ai được điểm */
  banCurrent(now: number): Say[] {
    const asking = this.phase === 'question' || this.phase === 'bonus' || this.phase === 'reveal';
    if (!asking || !this.q || this.q.math) return [];
    this.banned.add(this.q.id);
    this.banLog.push({ id: this.q.id, answer: this.q.answer, clue: this.q.clue });
    this.correct = [];
    this.wrong = new Set();
    return [...this.mainOf([this.line0('banned')]), ...this.afterQuestion(now)];
  }

  /** Quà: luôn là hoa tặng cô; quà to lúc chưa ai đúng thì cô mở thêm 1 chữ cho cả lớp */
  gift(e: Person, coins: number, now: number): Say[] {
    this.touch(e, now);
    this.flowers++;
    this.lastFlowerAt = now;
    // bạn nhỏ đi lên bục đưa hoa cho cô (đang có bạn đi thì thôi, tránh combo quà chen nhau)
    if (!this.walk || now - this.walk.at > GAME.walkMs) this.walk = { username: e.username, at: now };
    const asking = this.phase === 'question' || this.phase === 'bonus';
    if (asking && coins >= GAME.hintGiftCoins && this.correct.length === 0 && this.revealOne()) {
      return this.mainOf([this.t(this.line('giftHint', e.spoken), true)]);
    }
    return [];
  }

  /** Câu cảm ơn quà (useGame quyết định có cảm ơn hay không để tránh lặp combo) */
  thank(e: Person, giftName: string, coins: number): Say {
    return this.t(coins >= GAME.bigGiftCoins ? this.line('bigGift', e.spoken) : this.line('thankGift', e.spoken, giftName), true);
  }
  follow(e: Person): Say {
    return this.t(this.line('thankFollow', e.spoken));
  }
  greet(names: string): Say {
    return this.t(this.line('greeting', names));
  }
  share(): Say {
    return this.line0('share');
  }

  /** Tim: giờ ra chơi "thả tim" thì đếm; ngoài ra đủ mốc thì cả lớp vỗ tay */
  like(count: number, now: number, reachedClap: boolean): Say[] {
    this.lastSeenAt = now;
    if (this.recess?.game === 'heart' && this.recess.stage === 'play') {
      this.recess.hearts += count * GAME.heartBoost;
      return [];
    }
    if (!reachedClap) return [];
    this.clapUntil = now + GAME.clapSec * 1000;
    return [this.line0('clap')];
  }

  private reveal(now: number): Say[] {
    this.setPhase('reveal', now, GAME.revealSec);
    const q = this.q!;
    this.reportLog.push({ id: q.id, answer: q.answer, category: q.category, attempts: this.stats.attempts, correct: this.correct.length, at: now });
    const out: Say[] = [];
    const winners = new Set(this.correct.map((a) => a.username));
    for (const a of this.correct) {
      const s = this.students.get(a.username);
      if (!s) continue;
      this.award(s, a.points, now + a.seq / 1e6, true);
      s.streak++;
      if (s.streak % GAME.streakEvery === 0) {
        this.award(s, GAME.streakBonus, now, true);
        out.push(this.t(this.rand() < GAME.giftChance ? this.line('streakGift', s.spoken, this.giveGift(s, now)) : this.line('streak', s.spoken)));
      }
    }
    // cùng lúc chốt điểm: ai trả lời trước xếp trên
    this.correct.forEach((a, i) => {
      const s = this.students.get(a.username);
      if (s) s.reachedAt = now + i / 1000;
    });
    for (const s of this.students.values()) if (!winners.has(s.username)) s.streak = 0;
    const math = this.q!.math;
    const riddle = this.q!.slot === 'meo';
    const eng = this.q!.slot === 'anh'; // câu tiếng Anh: lời hiện đáp án đọc từ tiếng Anh bằng giọng tiếng Anh
    // câu toán đọc cả phép tính: "36 cộng 47 bằng 83"
    const answer = math ? `${math.say} bằng ${this.q!.answer}` : this.q!.answer.toLowerCase();
    const top = this.correct[0] && this.students.get(this.correct[0].username);
    let main: string;
    if (top) {
      const rest = this.line('revealTop', top.spoken) + (this.correct.length > 1 ? ' ' + this.line('revealCount', String(this.correct.length)) : '');
      main = this.line(math ? 'mathReveal' : riddle ? 'riddleReveal' : eng ? 'englishReveal' : this.q!.slot === 'su' ? 'historyReveal' : 'reveal', answer, rest);
      if (this.golden) out.unshift(this.t(this.rand() < 0.5 ? this.line('goldenGift', top.spoken, this.giveGift(top, now)) : this.line('goldenWinner', top.spoken)));
    } else main = this.line(math ? 'mathNobody' : riddle ? 'riddleNobody' : eng ? 'englishNobody' : 'revealNobody', answer);
    out.unshift({ ...this.t(main), main: true });
    // cà khịa 1 bạn trả lời sai (60% số câu, tên đọc được)
    const wrongs = [...this.wrong].map((u) => this.students.get(u)).filter((s): s is Student => !!s && s.spoken !== 'bạn');
    if (wrongs.length && this.rand() < GAME.roastChance) {
      const w = wrongs[Math.floor(this.rand() * wrongs.length)];
      // thỉnh thoảng phạt lên bục đứng thật (học sinh cá biệt), tối đa 2 bạn cùng lúc
      const standing = [...this.students.values()].filter((s) => s.standUntil > now).length;
      if (standing < 2 && w.standUntil <= now && this.rand() < GAME.standChance) {
        w.standUntil = now + GAME.standSec * 1000;
        out.push(this.t(this.line('roastStand', w.spoken)));
      } else out.push(this.t(this.line(math ? 'mathWrong' : riddle ? 'riddleWrong' : 'roastWrong', w.spoken)));
    }
    return this.mainOf([...out, ...this.checkMonitor()]);
  }

  /** Dừng giữa tiết: cô điểm danh 3 bạn nhỏ điểm cao nhất, tặng quà, mời cả lớp tương tác rồi mới ra câu tiếp */
  private startPraise(now: number): Say[] {
    const top = this.seats(3).filter((s) => s.score > 0);
    this.setPhase('praise', now, GAME.praiseSec);
    const keys = ['praiseFirst', 'praiseSecond', 'praiseThird'] as const;
    return this.mainOf([
      this.line0('praiseIntro'),
      ...top.map((s, i) => this.t(this.line(keys[i], s.spoken, String(s.score), this.giveGift(s, now)))),
      this.line0('praiseOutro'),
    ]);
  }

  private startResults(now: number, outOfQuestions = false): Say[] {
    this.setPhase('results', now, GAME.resultsSec);
    const best = this.seats(1)[0];
    const lines: Say[] = [];
    // ghi lớp trưởng tiết này vào bảng các tiết trước
    if (best && best.score > 0) {
      this.champions = [{ round: this.round, username: best.username, nickname: best.nickname, score: best.score }, ...this.champions].slice(0, GAME.championsKept);
    }
    if (outOfQuestions) lines.push(this.t('Hết câu hỏi rồi, cô tổng kết luôn nha.'));
    lines.push(best && best.score > 0 ? this.t(this.line('results', best.spoken, String(best.score))) : this.line0('resultsNobody'));
    if (this.weekLeader && this.round % 3 === 0) lines.push(this.t(this.line('weekBoard', this.weekLeader)));
    return this.mainOf(lines);
  }

  // ---------- giờ ra chơi ----------
  private startRecess(now: number, forced?: RecessGame): Say[] {
    const choices = RECESS_GAMES.filter((g) => g !== this.lastRecess);
    let game = forced ?? choices[Math.floor(this.rand() * choices.length)];
    let callTarget: Student | null = null;
    let callQ: Question | null = null;
    if (game === 'callup') {
      // gọi 1 bạn đang ngồi lớp, vừa hoạt động trong 3 phút
      const active = this.seats().filter((s) => now - s.lastActive < 180_000 && s.spoken !== 'bạn');
      callTarget = active[Math.floor(this.rand() * active.length)] ?? null;
      // câu dễ chưa có trong tiết; bộ câu quá ít thì lấy đại 1 câu
      callQ = callTarget ? (this.pickOne('easy', this.roundQs, now) ?? this.bank[Math.floor(this.rand() * this.bank.length)] ?? null) : null;
      if (!callTarget || !callQ) game = 'roll';
    }
    this.lastRecess = game;
    this.recess = {
      game,
      stage: 'play',
      rps: new Map(),
      teacher: null,
      callTarget,
      callQ,
      callTiles: callQ ? scramble(callQ.answer, this.rand) : [],
      callResult: '',
      pick: PICK_TOPICS[Math.floor(this.rand() * PICK_TOPICS.length)],
      votes: new Map(),
      roll: [],
      hearts: 0,
    };
    this.setPhase('recess', now, GAME.recessPlaySec[game]);
    const out: Say[] = [this.line0('recessIntro')];
    const r = this.recess;
    if (game === 'rps') out.push(this.line0('rpsIntro'));
    if (game === 'callup') out.push(this.t(this.line('callUp', callTarget!.spoken)), this.t(`${callQ!.kind} ${callQ!.clue}`));
    if (game === 'pick') out.push(this.t(this.line('pickIntro', r.pick[0], r.pick[1])));
    if (game === 'roll') out.push(this.line0('rollIntro'));
    if (game === 'heart') out.push(this.t(this.line('heartIntro', String(GAME.heartTarget))));
    return this.mainOf(out);
  }

  private recessChat(s: Student, e: ChatIn, now: number): Say[] {
    const r = this.recess;
    if (!r || r.stage !== 'play') return [];
    const word = plain(e.comment);
    if (r.game === 'rps' && word in RPS && !r.rps.has(s.username)) r.rps.set(s.username, word as Rps);
    if (r.game === 'pick' && (word === '1' || word === '2') && !r.votes.has(s.username)) r.votes.set(s.username, word === '1' ? 1 : 2);
    if (r.game === 'roll' && word === 'comat' && !r.roll.some((a) => a.username === s.username)) {
      r.roll.push({ username: s.username, nickname: s.nickname, avatar: s.avatar, createTime: e.createTime, seq: ++this.seq, points: GAME.rollPoints });
      r.roll.sort((a, b) => a.createTime - b.createTime || a.seq - b.seq);
    }
    if (r.game === 'callup' && r.callTarget?.username === s.username && this.isAttempt(r.callQ, e.comment)) {
      r.callResult = this.matches(r.callQ, e.comment) ? 'right' : 'wrong';
      this.phaseEndsAt = now; // trả lời rồi thì chốt luôn
    }
    return [];
  }

  private recessResult(now: number): Say[] {
    const r = this.recess!;
    r.stage = 'result';
    this.setPhase('recess', now, GAME.recessResultSec);
    const out: Say[] = [];
    if (r.game === 'rps') {
      if (r.rps.size === 0) return this.mainOf([this.line0('rpsNobody')]);
      r.teacher = (Object.keys(RPS) as Rps[])[Math.floor(this.rand() * 3)];
      let win = 0;
      let lose = 0;
      for (const [u, p] of r.rps) {
        if (BEATS[p] === r.teacher) {
          win++;
          const s = this.students.get(u);
          if (s) this.award(s, GAME.rpsPoints, now, false);
        } else if (BEATS[r.teacher] === p) lose++;
      }
      const rest = win ? this.line('rpsWin', String(win)) : lose ? this.line('rpsLose', String(lose)) : 'Hòa cả lớp luôn.';
      out.push(this.t(this.line('rpsReveal', RPS[r.teacher], rest)));
    }
    if (r.game === 'callup') {
      const s = r.callTarget!;
      if (r.callResult === 'right') this.award(s, GAME.callUpPoints, now, false);
      if (r.callResult === '') r.callResult = 'silent';
      const key = r.callResult === 'right' ? 'callUpRight' : r.callResult === 'wrong' ? 'callUpWrong' : 'callUpSilent';
      out.push(this.t(this.line(key, s.spoken)));
      if (r.callResult !== 'right') out.push(this.t(`Đáp án là ${r.callQ!.answer.toLowerCase()}.`));
    }
    if (r.game === 'pick') {
      const one = [...r.votes.values()].filter((v) => v === 1).length;
      const two = r.votes.size - one;
      if (r.votes.size === 0) out.push(this.line0('pickNobody'));
      else if (one === two) out.push(this.line0('pickTie'));
      else {
        const [win, lose, n] = one > two ? [r.pick[0], r.pick[1], one] : [r.pick[1], r.pick[0], two];
        out.push(this.t(this.line('pickResult', win, String(Math.round((n / r.votes.size) * 100)))), this.t(this.line('pickRoast', lose)));
      }
    }
    if (r.game === 'roll') {
      const first = r.roll.slice(0, GAME.rollWinners);
      for (const a of first) {
        const s = this.students.get(a.username);
        if (s) this.award(s, GAME.rollPoints, now, false);
      }
      const names = first.slice(0, 3).map((a) => this.students.get(a.username)?.spoken ?? 'bạn');
      out.push(first.length ? this.t(this.line('rollResult', names.join(', '))) : this.line0('rollNobody'));
    }
    if (r.game === 'heart') {
      if (r.hearts >= GAME.heartTarget) {
        for (const s of this.students.values()) if (now - s.lastActive < 600_000) this.award(s, 1, now, false);
        out.push(this.line0('heartWin'));
        this.clapUntil = now + GAME.clapSec * 1000;
      } else out.push(this.t(this.line('heartFail', String(r.hearts))));
    }
    return this.mainOf([...out, ...this.checkMonitor()]);
  }

  /** Cuối giờ ra chơi: bảng lớp trưởng các tiết trước, cô nhắc bạn làm lớp trưởng nhiều lần nhất */
  private recessBoard(now: number): Say[] {
    this.recess!.stage = 'board';
    this.setPhase('recess', now, GAME.recessBoardSec);
    const last = this.champions[0];
    const s = last && this.students.get(last.username);
    if (!s) return [];
    const times = this.champions.filter((c) => c.username === last.username).length;
    return this.mainOf([this.t(times > 1 ? this.line('championAgain', s.spoken, String(times)) : this.line('championBoard', s.spoken))]);
  }

  newRound(now: number): Say[] {
    const voted = this.phase === 'vote' ? this.closeVote() : [];
    if (this.phase !== 'vote') this.topic = '';
    this.round++;
    this.monitor = ''; // tiết mới: cả lớp tranh lớp trưởng lại từ đầu
    this.qNo = 0;
    this.q = null;
    this.correct = [];
    this.recess = null;
    for (const s of this.students.values()) {
      s.score = 0;
      s.streak = 0;
      s.reachedAt = 0;
      s.desk = [];
    }
    // lớp vắng lâu: tiết này ôn bài bằng câu cũ (có bạn vào thì đổi sang câu mới ngay câu kế)
    this.review = this.isEmpty(now);
    this.pickRound(now);
    this.setPhase('intro', now, GAME.introSec);
    // lời chào theo giờ: đổi buổi thì chào, còn lại thỉnh thoảng nhắc
    const period = dayPeriod(now);
    const greet = period !== this.lastPeriod || this.round % GAME.timeGreetEvery === 0 ? [this.line0(PERIOD_LINES[period])] : [];
    this.lastPeriod = period;
    return this.mainOf([...voted, ...greet, this.review ? this.line0('reviewIntro') : this.line0('intro')]);
  }

  /** Bỏ qua phần đang chạy (nút "Qua phần tiếp" ở trang điều khiển) */
  skip(now: number): Say[] {
    this.phaseEndsAt = now;
    return this.tick(now);
  }

  /** Nút "Ra chơi ngay" ở trang điều khiển: chơi luôn 1 trò */
  forceRecess(game: RecessGame, now: number): Say[] {
    return this.startRecess(now, game);
  }

  tick(now: number): Say[] {
    this.clock = Math.max(this.clock, now);
    const extra: Say[] = [];
    // lớp im quá lâu: cô nhắc 1 câu
    if (now - this.lastChatAt > GAME.idleAfterSec * 1000 && now - this.lastIdleAt > GAME.idleAfterSec * 1000) {
      this.lastIdleAt = now;
      extra.push({ ...this.line0('idle'), ttl: 15000 });
    }
    if (this.phase === 'question' && !this.quietSaid && this.correct.length === 0 && now - this.phaseStartedAt > GAME.questionSec * 500) {
      this.quietSaid = true;
      if (this.rand() < 0.5) extra.push({ ...this.line0('quietHalfway'), ttl: 5000 });
    }
    extra.push(...this.engageTick(now));
    // còn 5 giây: cô nhắc sắp hết giờ (đồng hồ vẫn chạy)
    const asking = this.phase === 'question' || this.phase === 'bonus';
    if (asking && !this.warned && now < this.phaseEndsAt && this.phaseEndsAt - now <= GAME.warnLeftSec * 1000) {
      this.warned = true;
      extra.push({ ...this.line0('timeWarn'), warn: true });
    }
    // phòng giọng hỏng / tắt tiếng: đồng hồ đã chạy hơn 1 giây (cô đọc xong) thì vẫn hiện bảng chữ
    if (asking && !this.boardShown && now - this.phaseStartedAt > 1000) this.boardShown = true;
    if (now < this.phaseEndsAt) return extra;
    return [...extra, ...this.advance(now)];
  }

  private advance(now: number): Say[] {
    switch (this.phase) {
      case 'intro':
        return this.startQuestion(now);
      case 'question':
        if (this.correct.length === 0 && !this.bonusUsed) {
          this.bonusUsed = true;
          // câu toán không mở số, chỉ cho thêm giờ
          if (!this.q?.math) this.revealOne();
          this.setPhase('bonus', now, GAME.bonusSec);
          return this.mainOf([this.line0(this.q?.math ? 'mathBonus' : 'bonus')]);
        }
        return this.reveal(now);
      case 'bonus':
        return this.reveal(now);
      case 'reveal':
        return this.afterQuestion(now);
      case 'praise':
        return this.startQuestion(now);
      case 'results':
        return this.startRecess(now);
      case 'recess':
        if (this.recess?.stage === 'play') return this.recessResult(now);
        if (this.recess?.stage === 'result') return this.recessBoard(now);
        return this.startVote(now);
      case 'vote':
        return this.newRound(now);
    }
  }

  /**
   * Lấp khoảng im lặng lúc đang chờ trả lời câu chữ (câu toán thì không: gõ số sẽ bị tính là trả lời).
   * Xoay vòng: "ai yêu cô gõ số 1" / kể chuyện vui, mẹo tiếng Anh / bình chọn vui; hết 15 giây thì cảm ơn, đọc kết quả.
   */
  private engageTick(now: number): Say[] {
    if (this.love && now - this.love.at >= GAME.loveWindowMs) {
      const fans = this.love.fans.map((u) => this.students.get(u)?.spoken).filter((n): n is string => !!n && n !== 'bạn');
      const n = this.love.fans.length;
      this.love = null;
      if (n === 0) return [];
      const names = fans.slice(0, 3).join(', ') || 'các bạn nhỏ';
      return [{ ...this.t(this.line('loveThanks', String(n), names)), ttl: 12_000 }];
    }
    if (this.poll && now - this.poll.at >= GAME.loveWindowMs) {
      const p = this.poll;
      this.poll = null;
      if (p.votes.size === 0) return [];
      const counts = p.opts.map((o) => ({ ...o, n: [...p.votes.values()].filter((k) => k === o.key).length })).sort((a, b) => b.n - a.n);
      const tie = counts.length > 1 && counts[0].n === counts[1].n;
      return [{ ...this.t(tie ? this.line('pollTie', String(p.votes.size)) : this.line('pollResult', counts[0].label, String(counts[0].n))), ttl: 12_000 }];
    }
    const quiet = this.phase === 'question' && this.boardShown && !this.q?.math && this.phaseEndsAt - now > 12_000;
    if (this.love || this.poll || !quiet || now - this.lastLoveAt < GAME.engageEveryMs) return [];
    this.lastLoveAt = now;
    const kind = GAME.engageOrder[this.engageNo++ % GAME.engageOrder.length];
    if (kind === 'love') {
      this.love = { at: now, fans: [] };
      return [{ ...this.line0('loveCall'), ttl: 6000 }];
    }
    if (kind === 'sleep') {
      // gọi 1 bạn đang ngồi mà ngủ gật dậy; không ai ngủ thì kể chuyện
      const sleepy = this.seats().filter((s) => now - s.lastActive > GAME.sleepAfterMs && s.spoken !== 'bạn');
      if (sleepy.length) return [{ ...this.t(this.line('wakeUp', sleepy[Math.floor(this.rand() * sleepy.length)].spoken)), ttl: 8000 }];
    }
    if (kind === 'poll') {
      const p = this.lines.pick('poll', POLLS);
      this.poll = { at: now, opts: p.opts, votes: new Map() };
      return [{ ...this.t(p.ask), ttl: 6000 }];
    }
    return [{ ...this.line0('funFact'), ttl: 8000 }];
  }

  /** Xong 1 câu: tổng kết tiết / dừng điểm danh / câu tiếp */
  private afterQuestion(now: number): Say[] {
    if (this.qNo >= this.roundQs.length) return this.startResults(now);
    // cứ 5 câu dừng lại điểm danh bạn nhỏ giỏi (chưa ai có điểm thì thôi)
    if (this.qNo % GAME.praiseEvery === 0 && this.seats(1)[0]?.score > 0) return this.startPraise(now);
    return this.startQuestion(now);
  }

  // ---------- bình chọn chủ đề tiết sau ----------
  private startVote(now: number): Say[] {
    this.recess = null;
    // 2 chủ đề câu chữ thường, khác các chủ đề vừa chọn gần đây
    const cats = [...new Set(this.bank.filter((q) => !q.slot).map((q) => q.category))];
    const fresh = cats.filter((c) => !this.lastTopics.includes(c));
    const pool = fresh.length >= 2 ? fresh : cats;
    if (pool.length < 2) return this.newRound(now);
    const a = pool[Math.floor(this.rand() * pool.length)];
    const rest = pool.filter((c) => c !== a);
    const b = rest[Math.floor(this.rand() * rest.length)];
    this.vote = { topics: [a, b], votes: new Map() };
    this.setPhase('vote', now, GAME.voteSec);
    return this.mainOf([this.t(this.line('voteIntro', topicName(a), topicName(b)))]);
  }

  private voteChat(s: Student, e: ChatIn): Say[] {
    const w = plain(e.comment);
    if (this.vote && (w === '1' || w === '2') && !this.vote.votes.has(s.username)) this.vote.votes.set(s.username, w === '1' ? 1 : 2);
    return [];
  }

  /** Đếm phiếu: chủ đề thắng thành chủ đề tiết sau (hoà thì bốc thăm, không ai chọn thì học bình thường) */
  private closeVote(): Say[] {
    const v = this.vote;
    this.vote = null;
    this.topic = '';
    if (!v || v.votes.size === 0) return [this.line0('voteNobody')];
    const one = [...v.votes.values()].filter((x) => x === 1).length;
    const two = v.votes.size - one;
    this.topic = one > two ? v.topics[0] : two > one ? v.topics[1] : v.topics[Math.floor(this.rand() * 2)];
    this.lastTopics = [...this.lastTopics, this.topic].slice(-4);
    return [this.t(this.line('voteResult', topicName(this.topic)))];
  }

  /** Ảnh chụp trạng thái để vẽ (gọn, gửi được qua mạng cho trang điều khiển xem trước) */
  view(now: number) {
    const showAnswer = this.phase === 'reveal';
    const asking = this.phase === 'question' || this.phase === 'bonus' || this.phase === 'reveal';
    const seated = this.seats(GAME.seats + GAME.standing);
    const titles = new Map(this.titleHolders().map((s, i) => [s.username, i === 0 ? 'lop-truong' : 'lop-pho']));
    const pub = ({ username, nickname, avatar, girl, score, session, lastActive, joinedAt, desk, days, bubble, standUntil }: Student) => ({
      desk,
      days,
      bubble: bubble && now - bubble.at < GAME.bubbleMs ? bubble.text : '',
      standing: standUntil > now, // bị phạt lên bục đứng: ghế trống, đứng cạnh bảng
      sleeping: now - lastActive > GAME.sleepAfterMs,
      username,
      nickname,
      avatar,
      girl,
      score,
      session,
      lastActive,
      joinedAt,
      title: titles.get(username) ?? '',
      // câu đang hỏi: trả lời đúng / sai / chưa (ngoài giờ hỏi thì không hiện)
      answered: !asking ? '' : this.correct.some((a) => a.username === username) ? 'right' : this.wrong.has(username) ? 'wrong' : '',
    });
    const r = this.recess;
    return {
      phase: this.phase,
      round: this.round,
      qNo: this.qNo,
      total: this.roundQs.length,
      golden: this.golden,
      endsAt: this.phaseEndsAt,
      clue: this.q?.clue ?? '',
      kind: this.q?.kind ?? '',
      slot: this.q?.slot ?? '', // 'meo' câu đố mẹo, 'su' câu lịch sử: bảng hiện nhãn riêng
      math: this.q?.math?.show ?? '', // câu toán: phép tính hiện thay cho chữ xáo
      category: this.q?.category ?? '',
      answer: this.phase === 'recess' ? (r?.callQ?.answer ?? '') : (this.q?.answer ?? ''),
      tiles: this.tiles,
      slots: this.slots(showAnswer),
      vote: this.vote && {
        topics: this.vote.topics.map(topicName) as [string, string],
        counts: [1, 2].map((k) => [...this.vote!.votes.values()].filter((x) => x === k).length),
      },
      topic: topicName(this.topic), // chủ đề cả lớp chọn cho tiết này
      review: this.review, // tiết ôn bài (lớp vắng)
      // bạn nhỏ đang đi lên bục tặng hoa
      walk: (() => {
        const s = this.walk && now - this.walk.at < GAME.walkMs ? this.students.get(this.walk.username) : undefined;
        return s ? { username: s.username, nickname: s.nickname, girl: s.girl, at: this.walk!.at } : null;
      })(),
      // học sinh cá biệt đang đứng trên bục (kể cả bạn không có ghế)
      punished: [...this.students.values()].filter((s) => s.standUntil > now).map(({ username, nickname, girl }) => ({ username, nickname, girl })),
      loveFans: this.love?.fans.length ?? 0, // đang rủ "ai yêu cô gõ số 1": số bạn đã gõ (tim bay lên)
      // đang bình chọn vui: các lựa chọn và số phiếu
      poll: this.poll && this.poll.opts.map((o) => ({ ...o, n: [...this.poll!.votes.values()].filter((k) => k === o.key).length })),
      birthday: this.birthday && now - this.birthday.at < GAME.birthdayBannerSec * 1000 ? this.birthday : null,
      players: this.activePlayers(now),
      // cô đang đọc đề: chưa hiện chữ xáo / phép tính / ô đáp án, hô bắt đầu mới hiện
      boardShown: this.phase !== 'question' || this.boardShown,
      // dừng giữa tiết: 3 bạn nhỏ điểm cao nhất kèm quà trên bàn
      praiseTop: this.phase === 'praise' ? this.seats(3).filter((s) => s.score > 0).map(({ username, nickname, score, desk }) => ({ username, nickname, score, desk })) : [],
      correctTop: this.correct.slice(0, 3).map(({ username, nickname, avatar, points }) => ({ username, nickname, avatar, points })),
      correctCount: this.correct.length,
      seats: seated.slice(0, GAME.seats).map(pub),
      standing: seated.slice(GAME.seats).map(pub), // không có ghế: đứng ngoài cửa hóng, vẫn tính điểm
      sessionTop: this.sessionTop(5).map(({ username, nickname, session }) => ({ username, nickname, session })),
      champions: this.champions.slice(0, 5).map((c) => ({ ...c, times: this.champions.filter((x) => x.username === c.username).length })),
      classSize: this.students.size,
      stats: this.stats,
      flowers: this.flowers,
      lastFlowerAt: this.lastFlowerAt,
      clapping: now < this.clapUntil,
      recess: r && {
        game: r.game,
        stage: r.stage,
        rpsCounts: (Object.keys(RPS) as Rps[]).map((k) => [...r.rps.values()].filter((v) => v === k).length),
        teacher: r.teacher ? RPS[r.teacher] : '',
        callName: r.callTarget?.nickname ?? '',
        callUser: r.callTarget?.username ?? '',
        callClue: r.callQ ? `${r.callQ.kind} ${r.callQ.clue}` : '',
        callTiles: r.callTiles,
        callSlots: this.slotsOf(r.callQ, new Set(), r.stage !== 'play'),
        callResult: r.callResult,
        pick: r.pick,
        votes: [[...r.votes.values()].filter((v) => v === 1).length, [...r.votes.values()].filter((v) => v === 2).length],
        roll: r.roll.slice(0, GAME.rollWinners).map((a) => a.nickname),
        hearts: r.hearts,
        heartTarget: GAME.heartTarget,
      },
    };
  }
}

export type ClassView = ReturnType<Classroom['view']>;
