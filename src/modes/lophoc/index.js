const fs = require('fs');
const path = require('path');
const { DATA_DIR, TTS_CACHE_DIR } = require('../../config');
const { ensureBuilt } = require('./build');

// ============================================================================
// CHẾ ĐỘ "LỚP HỌC CHỮ" — cô giáo áo dài đố chữ, người xem gõ đáp án vào bình luận
// Lõi game (luật, câu hỏi, lời thoại) chép từ repo lop-hoc-chu, viết bằng TypeScript ở game/ và live/,
// đóng gói thành core.cjs. File này chỉ nối lõi đó với phòng live: sự kiện TikTok, giọng ZeroTTS, lưu sổ lớp.
// Bản gốc chạy game trong trình duyệt (trang stage); ở đây game chạy trên server, màn hình chỉ vẽ lại.
// ============================================================================

ensureBuilt();
const core = require('./core.cjs');
const { Classroom, GAME, plain, speakableName, containsBanned, GiftThanker, OncePerPerson, NameBatcher } = core;

const QUESTION_DIR = path.join(__dirname, 'game', 'cau-hoi');
const { questions: BANK, errors: BANK_ERRORS } = core.loadBank(QUESTION_DIR);
if (BANK_ERRORS.length) console.warn(`[lophoc] ${BANK_ERRORS.length} dòng câu hỏi sai cú pháp, vd: ${BANK_ERRORS[0]}`);

const TICK_MS = 200;
const VIEW_MIN_GAP_MS = 250; // gửi ảnh chụp lớp học tối đa 4 lần/giây
const LOG_FLUSH_MS = 2000; // dồn câu đã hỏi / điểm tuần / báo cáo vào sổ lớp
const SPEECH_MAX_WAIT_MS = 60_000; // câu chờ quá lâu thì bỏ (chuyện đã cũ)
const SPEECH_MAX_QUEUE = 30;

// ---------- ngày / tuần theo giờ máy (Việt Nam) ----------
const dayKey = (d = new Date()) => d.toLocaleDateString('sv'); // "2026-11-04"
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
// tên TikTok có thể là "__proto__": không cho làm khoá
const safeKey = (k) => typeof k === 'string' && k && k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function addScore(book, key, nickname, points) {
  const cur = Object.prototype.hasOwnProperty.call(book, key) ? book[key] : { nickname: '', points: 0 };
  cur.nickname = String(nickname || cur.nickname).slice(0, 60);
  cur.points += points;
  book[key] = cur;
}
const topOf = (book, n = 10) =>
  Object.entries(book)
    .map(([username, v]) => ({ username, nickname: v.nickname, points: v.points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, n);

// ---------- độ dài file wav trong tts-cache (ZeroTTS trả bản đã có sẵn thì không kèm durationSec) ----------
function wavDurationMs(url) {
  try {
    const buf = fs.readFileSync(path.join(TTS_CACHE_DIR, path.basename(String(url))));
    let pos = 12;
    let byteRate = 0;
    while (pos + 8 <= buf.length) {
      const id = buf.toString('ascii', pos, pos + 4);
      const size = buf.readUInt32LE(pos + 4);
      if (id === 'fmt ') byteRate = buf.readUInt32LE(pos + 16);
      if (id === 'data' && byteRate) return Math.round((Math.min(size, buf.length - pos - 8) / byteRate) * 1000);
      pos += 8 + size + (size % 2);
    }
  } catch (_) {}
  return 0;
}
// không có giọng (tắt TTS / worker chưa sẵn sàng): ước lượng thời gian đọc để nhịp game vẫn giống thật
const estimateMs = (text) => Math.max(900, String(text).split(/\s+/).filter(Boolean).length * 230 + 400);

/**
 * Lời thoại của lõi game có dạng "F: Câu 3. | E: cat | F: ..." — "|" tách đoạn, "M:/F:/E:" là giọng
 * (nam / nữ / tiếng Anh), "^" là hô to. ZeroTTS hiện chỉ có giọng Mai Chi nên mọi đoạn đọc bằng giọng phòng.
 * TODO giai đoạn 4: đoạn "E:" đọc bằng giọng tiếng Anh.
 */
function speechParts(text) {
  let who = 'M';
  const out = [];
  for (let raw of String(text).split('|')) {
    raw = raw.trim();
    const sp = /^(M|F|E):\s*/.exec(raw);
    if (sp) {
      who = sp[1];
      raw = raw.slice(sp[0].length);
    }
    const t = raw.replace(/^\^+/, '').trim();
    if (t) out.push({ who, text: t });
  }
  return out;
}

/**
 * Hàng đợi giọng của cô (giống src/live/voice.ts bản gốc nhưng chạy trên server):
 * tổng hợp bằng ZeroTTS, phát lệnh 'lophoc.speak' cho màn hình rồi chờ đúng độ dài câu.
 */
class Speaker {
  constructor(ctx, isDisposed) {
    this.ctx = ctx;
    this.isDisposed = isDisposed;
    this.normal = [];
    this.priority = [];
    this.playing = false;
    this.current = null; // { text, who, until }
    this.gen = 0; // tăng khi stop(): vòng đọc cũ tự dừng
    this.wake = null;
  }

  get busy() {
    return this.playing || this.normal.length + this.priority.length > 0;
  }

  ttsOn() {
    const { ctx } = this;
    return ctx.settings.ttsEnabled !== false && ctx.tts && ctx.tts.ready;
  }

  /** Tổng hợp trước (ZeroTTS mất vài giây mỗi câu): tới lượt đọc là phát liền */
  prefetch(text) {
    if (!this.ttsOn()) return;
    for (const p of speechParts(text)) this.ctx.tts.synthesize(p.text, this.ctx.settings.ttsVoice).catch(() => {});
  }

  /**
   * done: gọi khi câu đọc xong hoặc bị bỏ; start: lúc bắt đầu đọc;
   * valid: tới lượt (hoặc tổng hợp xong) mà trả về false thì bỏ câu — chuyện đã cũ, vd nhắc hết giờ khi đã hiện đáp án
   */
  say(text, priority = false, done, start, valid) {
    if (!String(text || '').trim()) {
      if (start) setImmediate(start);
      if (done) setImmediate(done);
      return;
    }
    const q = priority ? this.priority : this.normal;
    q.push({ text: String(text).trim(), at: Date.now(), done, start, valid });
    if (priority) this.prefetch(text);
    if (q.length > SPEECH_MAX_QUEUE) q.shift().done?.();
    this.next();
  }

  stop() {
    this.gen++;
    for (const l of [...this.normal, ...this.priority]) l.done?.();
    this.normal = [];
    this.priority = [];
    if (this.wake) this.wake();
  }

  sleep(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(done, ms);
      const self = this;
      function done() {
        clearTimeout(t);
        if (self.wake === done) self.wake = null;
        resolve();
      }
      this.wake = done;
    });
  }

  async next() {
    if (this.playing || this.isDisposed()) return;
    const now = Date.now();
    let line;
    while ((line = this.priority.shift() || this.normal.shift())) {
      if (now - line.at < SPEECH_MAX_WAIT_MS && (!line.valid || line.valid())) break;
      line.done?.();
    }
    if (!line) return;
    this.playing = true;
    const gen = this.gen;
    try {
      line.start?.();
      for (const part of speechParts(line.text)) {
        if (gen !== this.gen || this.isDisposed()) break;
        let url = null;
        let durMs = 0;
        if (this.ttsOn()) {
          const res = await this.ctx.tts.synthesize(part.text, this.ctx.settings.ttsVoice).catch(() => null);
          if (gen !== this.gen || this.isDisposed()) break;
          if (res && res.ok && res.url) {
            url = res.url;
            durMs = res.durationSec ? Math.round(res.durationSec * 1000) : wavDurationMs(res.url);
          }
        }
        if (line.valid && !line.valid()) break;
        if (!durMs) durMs = estimateMs(part.text);
        this.current = { text: part.text, who: part.who === 'E' ? 'F' : part.who, until: Date.now() + durMs };
        this.ctx.broadcast('lophoc.speak', { url, text: part.text, who: this.current.who, durMs });
        await this.sleep(durMs + 150);
      }
    } finally {
      this.current = null;
      this.playing = false;
      line.done?.();
      if (!this.isDisposed()) setImmediate(() => this.next());
    }
  }
}

// ---------- người ảo để thử khi chưa live ----------
const SIM_NAMES = [
  'Bé Na', 'Tí Đẹp Trai', 'Su Kem', 'Minh Khang', 'Gấu Mập', 'Bông Gòn', 'Cún Con', 'Hà Vy', 'Sóc Nâu', 'Bin Bon',
  'Nắng Mai', 'Quang Huy', 'Mây Hồng', 'Đức Anh', 'Bảo Ngọc', 'Tôm Tít', 'Linh Chi', 'Kẹo Dẻo', 'Gia Bảo', 'Thỏ Ngọc'
];
const SIM_CHATS = ['vào lớp', 'chào cô ạ', 'khó quá', 'hihi', 'câu này dễ', 'cô ơi', '❤️', 'em biết rồi', 'sinh nhật mình hôm nay'];
const SIM_GIFTS = [
  { giftName: 'Rose', coins: 1 },
  { giftName: 'Finger Heart', coins: 5 },
  { giftName: 'Doughnut', coins: 30 },
  { giftName: 'Confetti', coins: 100 }
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const simUser = (i = Math.floor(Math.random() * SIM_NAMES.length)) => ({
  user: SIM_NAMES[i % SIM_NAMES.length],
  uniqueId: `thu_${i % SIM_NAMES.length}`,
  avatar: ''
});

function create(ctx, saved = {}) {
  let disposed = false;
  const timers = [];

  // ---------- sổ lớp (bản gốc: data/so-lop.json) — lưu trong trạng thái phòng ----------
  const book = {
    channelName: String(saved.channelName || GAME.defaultChannelName).slice(0, 40),
    used: obj(saved.used), // id câu -> lần hỏi gần nhất (ms)
    banned: obj(saved.banned), // id câu -> { answer, clue, at }
    week: typeof saved.week === 'string' ? saved.week : weekKey(),
    weekScores: obj(saved.weekScores),
    today: { date: dayKey(), scores: {}, ...obj(saved.today) },
    attend: obj(saved.attend) // username -> { nickname, last, streak, total }
  };
  const weekBook = () => {
    if (book.week !== weekKey()) {
      book.week = weekKey();
      book.weekScores = {};
    }
    return book.weekScores;
  };
  const todayBook = () => {
    if (book.today.date !== dayKey()) book.today = { date: dayKey(), scores: {} };
    return book.today.scores;
  };

  const room = new Classroom(BANK, Date.now(), Math.random, book.used, Object.keys(book.banned));
  const refreshWeekLeader = () => {
    const top = topOf(weekBook(), 1)[0];
    room.weekLeader = top ? speakableName(top.nickname) : '';
  };
  refreshWeekLeader();

  // ---------- giọng: câu chính dừng đồng hồ, câu nói thêm chỉ chen vào lúc chờ trả lời ----------
  const speaker = new Speaker(ctx, () => disposed);
  // câu chính đang chờ / đang đọc (mỗi câu 1 thẻ; Tiết mới xoá hết, câu cũ đọc xong muộn cũng không làm sai số đếm)
  const mainSpeaking = new Set();
  let chatter = []; // { text, priority, until }
  let dirty = true;

  function say(lines) {
    const now = Date.now();
    for (const l of lines || []) {
      if (l.main) {
        const token = {};
        mainSpeaking.add(token);
        // câu hô bắt đầu: cô vừa mở miệng hô thì hiện bảng chữ
        const onStart = l.go
          ? () => {
              room.showBoard();
              dirty = true;
            }
          : undefined;
        speaker.say(l.text, true, () => mainSpeaking.delete(token), onStart);
      } else if (l.warn) {
        // nhắc sắp hết giờ: chen lên đọc liền, đồng hồ vẫn chạy; đã sang đáp án thì thôi
        speaker.say(l.text, true, undefined, undefined, () => room.phase === 'question' || room.phase === 'bonus');
      } else {
        const ttl = l.ttl ?? (l.priority ? GAME.giftLineMaxWaitMs : GAME.chatterMaxWaitMs);
        // KHÔNG tạo giọng trước cho câu nói thêm: worker ZeroTTS làm tuần tự, tạo trước cả chục câu chào / cảm ơn
        // sẽ bắt câu chính (đọc đáp án, đề) xếp hàng sau chúng hàng chục giây
        chatter.push({ text: l.text, priority: !!l.priority, until: now + ttl });
      }
    }
    dirty = true;
  }

  function flushChatter(now) {
    chatter = chatter.filter((c) => c.until > now);
    if (speaker.busy || mainSpeaking.size > 0 || !room.chatterWindow(now)) return;
    const i = Math.max(0, chatter.findIndex((c) => c.priority)); // cảm ơn quà trước
    const next = chatter.splice(i, 1)[0];
    // giọng chưa tạo xong mà đã hết lúc được nói chen (gần hết giờ, sang đáp án) thì bỏ
    if (next) speaker.say(next.text, false, undefined, undefined, () => room.chatterWindow(Date.now()));
  }

  const joinNames = (names) => {
    const spoken = names.map((n) => `bạn ${n}`);
    return spoken.length > 1 ? `${spoken.slice(0, -1).join(', ')} và ${spoken[spoken.length - 1]}` : spoken[0] || '';
  };
  const talk = {
    greeter: new NameBatcher(
      GAME.greetEveryMs,
      GAME.namesPerGreeting,
      (names) => !disposed && say([room.greet(joinNames(names))]),
      () => chatter.length >= 2
    ),
    gifts: new GiftThanker(GAME.giftThanksCooldownMs, GAME.bigGiftCoins),
    follows: new OncePerPerson()
  };

  // ---------- người xem ----------
  function person(u = {}) {
    const username = String(u.uniqueId || u.user || 'khach').slice(0, 100);
    const raw = String(u.user || username).slice(0, 60);
    const nickname = containsBanned(raw) ? username : raw;
    return { username, nickname, spoken: speakableName(nickname), avatar: u.avatar || '' };
  }

  /** Chuyên cần: lần đầu bình luận trong buổi -> số ngày đi học liền */
  function markAttendance(p) {
    if (!safeKey(p.username)) return 0;
    const today = dayKey();
    const yesterday = dayKey(new Date(Date.now() - 86_400_000));
    const cur = Object.prototype.hasOwnProperty.call(book.attend, p.username)
      ? book.attend[p.username]
      : { nickname: '', last: '', streak: 0, total: 0 };
    if (cur.last !== today) {
      cur.streak = cur.last === yesterday ? cur.streak + 1 : 1;
      cur.total++;
      cur.last = today;
    }
    cur.nickname = p.nickname.slice(0, 60);
    book.attend[p.username] = cur;
    ctx.save();
    return cur.streak;
  }

  let likeAcc = 0;
  let lastGift = null;

  function onChat(evt) {
    const p = person(evt.user);
    const text = String(evt.text || '').slice(0, 200);
    let createTime = Number(evt.createTime) || Date.now();
    if (createTime < 1e12) createTime *= 1000; // phòng khi thư viện trả giây
    const isNew = !room.students.has(p.username);
    const now = Date.now();
    say(room.chat({ ...p, comment: text, createTime, safe: !containsBanned(text) }, now));
    if (isNew && p.spoken !== 'bạn' && GAME.joinKeywords.includes(plain(text))) talk.greeter.add(p.username, p.spoken);
    if (isNew) {
      const days = markAttendance(p);
      if (days) say(room.attendance(p, days, Date.now()));
    }
  }

  function onGift(evt) {
    const p = person(evt.user);
    const coins = Math.max(1, Number(evt.coins) || 1);
    const giftName = String(evt.giftName || 'quà').slice(0, 40);
    lastGift = { nickname: p.nickname, giftName, coins, repeatCount: Math.max(1, Number(evt.count) || 1), at: Date.now() };
    const hint = room.gift(p, coins, Date.now());
    say(hint);
    // combo / tặng liên tục chỉ cảm ơn 1 lần mỗi 30 giây; quà to luôn cảm ơn
    const waiting = chatter.filter((c) => c.priority).length;
    if (!hint.length && talk.gifts.shouldThank(p.username, coins, waiting)) say([room.thank(p, giftName, coins)]);
    ctx.emitEvent({ type: 'gift', user: p.nickname, uniqueId: p.username, avatar: p.avatar, giftName, coins });
  }

  function onLike(evt) {
    const count = Math.max(1, Number(evt.count) || 1);
    likeAcc += count;
    // tim thật x GAME.heartBoost: đủ 300 tim (60 tim thật) là cả lớp vỗ tay
    const reached = likeAcc * GAME.heartBoost >= GAME.likesPerClap;
    if (reached) likeAcc = 0;
    say(room.like(count, Date.now(), reached));
  }

  // ---------- dồn nhật ký của lõi game vào sổ lớp ----------
  function reportFile(day) {
    return path.join(DATA_DIR, 'lophoc', ctx.roomId, 'bao-cao', `${day}.json`);
  }
  function appendReport(rows) {
    if (!rows.length) return;
    const file = reportFile(dayKey());
    let old = [];
    try {
      old = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {}
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify([...(Array.isArray(old) ? old : []), ...rows]));
    } catch (err) {
      console.error('[lophoc] Không lưu được báo cáo:', err.message);
    }
  }

  function flushLogs() {
    let changed = false;
    const now = Date.now();
    for (const id of room.usedLog.splice(0)) {
      if (safeKey(id)) book.used[id] = now;
      changed = true;
    }
    if (room.weekDelta.size) {
      for (const [username, w] of room.weekDelta) {
        if (!safeKey(username)) continue;
        const pts = Math.max(0, Math.min(1000, Math.round(w.points)));
        if (!pts) continue;
        addScore(weekBook(), username, w.nickname, pts);
        addScore(todayBook(), username, w.nickname, pts);
        ctx.board.record({ user: w.nickname, uniqueId: username }, { points: pts });
      }
      room.weekDelta.clear();
      refreshWeekLeader();
      changed = true;
      dirty = true;
    }
    for (const b of room.banLog.splice(0)) {
      if (!safeKey(b.id)) continue;
      book.banned[b.id] = { answer: String(b.answer || '').slice(0, 60), clue: String(b.clue || '').slice(0, 300), at: now };
      changed = true;
    }
    appendReport(room.reportLog.splice(0));
    if (changed) ctx.save();
  }

  // ---------- ảnh chụp lớp học gửi màn hình ----------
  function buildView(now = Date.now()) {
    return {
      ...room.view(now),
      serverNow: now,
      channelName: book.channelName,
      weekTop: topOf(weekBook()),
      todayTop: topOf(todayBook(), 5),
      lastGift,
      speaking: speaker.current ? { text: speaker.current.text, who: speaker.current.who } : null
    };
  }

  let lastSent = 0;
  function sendView(now) {
    lastSent = now;
    dirty = false;
    ctx.broadcast('lophoc.view', buildView(now));
  }

  // ---------- nhịp game ----------
  let lastTick = Date.now();
  say(room.newRound(Date.now()));
  timers.push(
    setInterval(() => {
      if (disposed) return;
      const now = Date.now();
      try {
        // cô đang đọc câu chính: dừng đồng hồ (vd đọc đề xong mới đếm 20 giây)
        if (mainSpeaking.size > 0) {
          room.hold(now - lastTick);
          dirty = true;
        }
        lastTick = now;
        say(room.tick(now));
        flushChatter(now);
      } catch (err) {
        console.error(`[lophoc ${ctx.roomId}] Lỗi nhịp game:`, err);
      }
      if ((dirty && now - lastSent >= VIEW_MIN_GAP_MS) || now - lastSent >= 1000) sendView(now);
    }, TICK_MS),
    setInterval(() => !disposed && say([room.share()]), GAME.shareReminderEveryMs),
    setInterval(() => !disposed && flushLogs(), LOG_FLUSH_MS)
  );

  // ---------- thử khi chưa live ----------
  function requireOffline() {
    if (ctx.isLive()) throw new Error('Chỉ dùng được khi chưa kết nối TikTok Live thật');
  }
  /** câu trả lời đúng của câu đang hỏi (để người ảo trả lời) */
  const currentAnswer = () =>
    room.phase === 'question' || room.phase === 'bonus' ? (room.q && room.q.answer) || '' : '';

  function simChat(user, text, delayMs = 0) {
    const fire = () => !disposed && onChat({ type: 'chat', user, text, createTime: Date.now() });
    if (delayMs > 0) timers.push(setTimeout(() => ctx.simulated(fire), delayMs));
    else ctx.simulated(fire);
  }

  /** Báo cáo buổi live một ngày (giống trang /bao-cao của bản gốc) + danh sách ngày có báo cáo */
  function buildReport(day) {
    flushLogs();
    const dir = path.dirname(reportFile(dayKey()));
    let days = [];
    try {
      days = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse();
    } catch (_) {}
    let rows = [];
    try {
      rows = JSON.parse(fs.readFileSync(reportFile(day), 'utf8'));
    } catch (_) {}
    if (!Array.isArray(rows)) rows = [];
    const words = rows.filter((r) => r.category !== 'Toán nhẩm');
    // ít nhất 3 bạn thử mà không ai đúng (câu bị bấm qua, không ai gõ thì không tính)
    const hard = words.filter((r) => r.correct === 0 && r.attempts >= 3).sort((a, b) => b.attempts - a.attempts);
    const easy = words.filter((r) => r.attempts >= 5 && r.correct / r.attempts >= 0.9);
    const attended = Object.values(book.attend).filter((a) => a && a.last === day);
    const top = day === todayKeyOfBook() ? topOf(todayBook(), 15) : [];
    return {
      day,
      today: dayKey(),
      days,
      channelName: book.channelName,
      asked: rows.length,
      attended: attended.length,
      hard,
      easy,
      top,
      loyal: attended.sort((a, b) => b.streak - a.streak).slice(0, 15),
      banned: Object.entries(book.banned)
        .map(([id, b]) => ({ id, ...b }))
        .sort((a, b) => b.at - a.at)
    };
  }
  const todayKeyOfBook = () => (todayBook(), book.today.date);

  const rpc = {
    getView: () => buildView(),
    report: (params = {}) => {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(params.day || '')) ? params.day : dayKey();
      return buildReport(day);
    },
    /** bỏ chặn một câu (sửa nhầm): câu được hỏi lại ở các tiết sau */
    unban: (params = {}) => {
      const id = String(params.id || '');
      if (!safeKey(id) || !Object.prototype.hasOwnProperty.call(book.banned, id)) throw new Error('Không thấy câu này trong danh sách bỏ');
      delete book.banned[id];
      if (room.banned instanceof Set) room.banned.delete(id); // trường private của lõi TS (JS vẫn đọc được)
      ctx.save();
      return { ok: true };
    },
    newRound: () => {
      speaker.stop();
      chatter = [];
      mainSpeaking.clear();
      say(room.newRound(Date.now()));
      return { ok: true };
    },
    skip: () => {
      say(room.skip(Date.now()));
      return { ok: true };
    },
    ban: () => {
      say(room.banCurrent(Date.now()));
      flushLogs();
      return { ok: true };
    },
    birthday: (params = {}) => {
      const name = String(params.name || '').trim().slice(0, 40);
      if (!name) throw new Error('Chưa nhập tên');
      const s = [...room.students.values()].find((x) => x.nickname.toLowerCase() === name.toLowerCase());
      say(room.celebrate(s || person({ user: name, uniqueId: `kenh:${name}` }), Date.now()));
      return { ok: true };
    },
    recess: (params = {}) => {
      const game = String(params.game || '');
      if (!['rps', 'callup', 'pick', 'roll', 'heart'].includes(game)) throw new Error('Trò ra chơi không hợp lệ');
      say(room.forceRecess(game, Date.now()));
      return { ok: true };
    },
    /** chủ kênh gõ câu cho cô đọc ngay ("F: " ở đầu = giọng nữ, giống bản gốc) */
    sayText: (params = {}) => {
      const text = String(params.text || '').trim().slice(0, 300);
      if (text) speaker.say(text, true);
      return { ok: true };
    },
    setName: (params = {}) => {
      book.channelName = String(params.name || '').trim().slice(0, 40) || GAME.defaultChannelName;
      dirty = true;
      ctx.save();
      return { channelName: book.channelName };
    },
    testChat: (params = {}) => {
      requireOffline();
      simChat(simUser(Number(params.i) || undefined), String(params.text || pick(SIM_CHATS)));
      return { ok: true };
    },
    /** N bạn ảo cùng trả lời câu đang hỏi: phần lớn đúng, rải trong vài giây */
    testCrowd: (params = {}) => {
      requireOffline();
      const n = Math.max(1, Math.min(200, Number(params.count) || 10));
      const answer = currentAnswer();
      for (let i = 0; i < n; i++) {
        const user = { user: `${pick(SIM_NAMES)} ${i + 1}`, uniqueId: `thu_dong_${i}`, avatar: '' };
        const text = answer && Math.random() < 0.7 ? answer : pick(SIM_CHATS);
        simChat(user, text, 200 + Math.random() * 6000);
      }
      return { ok: true, count: n, answer };
    },
    testGift: () => {
      requireOffline();
      const g = pick(SIM_GIFTS);
      ctx.simulated(() => onGift({ type: 'gift', user: simUser(), ...g }));
      return { ok: true, ...g };
    },
    testLike: (params = {}) => {
      requireOffline();
      ctx.simulated(() => onLike({ type: 'like', user: simUser(), count: Math.max(1, Math.min(100, Number(params.count) || 15)) }));
      return { ok: true };
    }
  };

  return {
    rpc,

    onEvent(evt) {
      if (disposed || !evt) return null;
      switch (evt.type) {
        case 'chat':
          return onChat(evt);
        case 'gift':
          return onGift(evt);
        case 'like':
          return onLike(evt);
        case 'follow': {
          const p = person(evt.user);
          if (talk.follows.first(p.username)) say([room.follow(p)]);
          return null;
        }
        default:
          return null;
      }
    },

    /** Một bước giả lập (nút "Tự động giả lập"): bạn ảo trả lời / nói chuyện / thỉnh thoảng tặng quà */
    simulate() {
      const answer = currentAnswer();
      const r = Math.random();
      if (r < 0.06) return onGift({ type: 'gift', user: simUser(), ...pick(SIM_GIFTS) });
      if (r < 0.15) return onLike({ type: 'like', user: simUser(), count: 15 });
      const text = answer && Math.random() < 0.6 ? answer : pick(SIM_CHATS);
      return onChat({ type: 'chat', user: simUser(), text, createTime: Date.now() });
    },

    onLiveConnected() {
      // lên live thật: xoá bạn ảo còn trong lớp
      for (const key of [...room.students.keys()]) if (key.startsWith('thu_')) room.students.delete(key);
      dirty = true;
    },

    getPublicState() {
      return { lophoc: buildView(), bankSize: BANK.length };
    },

    serialize() {
      if (!disposed) flushLogs(); // lưu cả phần nhật ký chưa kịp dồn (tắt server, đổi chế độ)
      return {
        channelName: book.channelName,
        used: book.used,
        banned: book.banned,
        week: book.week,
        weekScores: book.weekScores,
        today: book.today,
        attend: book.attend
      };
    },

    dispose() {
      if (disposed) return;
      flushLogs();
      disposed = true;
      timers.forEach((t) => {
        clearInterval(t);
        clearTimeout(t);
      });
      speaker.stop();
      talk.greeter.reset();
    }
  };
}

module.exports = {
  id: 'lophoc',
  name: 'Lớp Học Chữ',
  description: 'Cô giáo áo dài đố chữ trên bảng đen: người xem gõ đáp án, ai đúng nhanh nhất được điểm cao, ngồi bàn đầu',
  overlay: 'lophoc.html',
  create
};
