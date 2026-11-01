const crypto = require('crypto');
const { LITURGY, SUTRAS, RECITATION_LINE, DEFAULT_INVOCATION, DEFAULT_ROTATION, toLines, lineSyllables } = require('./texts');
const timeline = require('./timeline');
const { isBlockedSpamOrToxic, sanitizeUserName, sanitizeWishText } = require('../../util/sanitize');

// ============================================================================
// CHẾ ĐỘ "PHÒNG TỤNG KINH CHUNG" (xem docs/phong-tung-kinh.md)
// - Mọi tương tác bình đẳng: không bảng xếp hạng, không số xu, không phân biệt quà lớn – nhỏ
// - Tương tác đầu tiên bất kỳ = thắp nhang + nhận chỗ ngồi; ai cũng thấy mình trên màn hình
// - Thời khoá lặp lại: tụ hội → khai chuông → niệm hương (xướng, không mõ) → khai chuông mõ → khai kinh
//   → xướng danh hiệu + kinh chính (mõ) → niệm Phật (mõ) → hồi hướng (xướng, cuộn tên) → tĩnh lặng → kết chuông
// ============================================================================

// Số chỗ ngồi lấy từ bố cục dùng chung với màn hình (public/js/seat-layout.js) — gần to xa nhỏ, ~686 chỗ
const SEAT_LAYOUT = require('../../../public/js/seat-layout').buildSeatLayout();
const SEAT_COUNT = SEAT_LAYOUT.length;
const { guessGender, parseSelfGender } = require('./gender');
// Nam ngồi bên trái thảm, nữ bên phải
const SIDE_FOR = { m: 'L', f: 'R' };
const INCENSE_COOLDOWN_MS = 3 * 60 * 1000; // mỗi người lên thắp nhang tối đa 1 lần / 3 phút
const PRESENCE_GAP_MS = 2 * 60 * 1000; // hai lần tương tác cách nhau ≤ 2 phút = vẫn đang ở trong đạo tràng
const BELL_RESPONSE_MS = 6000; // thả tim trong 6 giây sau tiếng chuông = "chắp tay theo chuông"
const MINUTE_MILESTONES = [10, 30, 60, 120];
const HEART_MILESTONES = [108, 1080];
const MAX_TRACKED = 5000;
const CHANTING_WINDOW_MS = 6000; // thả tim trong 6 giây gần nhất = "đang tụng kinh"
const COMMENT_COOLDOWN_MS = 4000;
const CHANT_FLUSH_MS = 1500;
const THANKS_FLUSH_MS = 8000;
const MAX_DEDICATION_NAMES = 300;
const VOTE_RE = /(?:^|[^\p{L}])kinh\s*(?:số\s*)?([1-9])(?![0-9])/iu;
// Cú pháp lên thắp nhang trước Phật
const INCENSE_RE = /(?:^|[^\p{L}])(?:thắp|thap|dâng|dang)\s+(?:nhang|hương|huong)(?![\p{L}])/iu;

// Mỗi loại quà là một biểu tượng tượng trưng — cùng kích thước, cùng ánh sáng, không theo giá trị
const LAMP_SYMBOLS = ['🪷', '🏮', '🕯️', '🌸', '🌼', '💮', '🍃', '🌺'];

const PHASE_TITLES = {
  gather: 'Tụ hội',
  bell_open: 'Khai chuông',
  incense: LITURGY.incense.title,
  khai_chuong_mo: 'Khai chuông mõ',
  opening: LITURGY.opening.title,
  sutra: 'Tụng kinh',
  recitation: 'Niệm Phật',
  dedication: LITURGY.dedication.title,
  bell_close: 'Kết chuông',
  silence: 'Tĩnh lặng'
};
const PHASE_ORDER = ['gather', 'bell_open', 'incense', 'khai_chuong_mo', 'opening', 'sutra', 'recitation', 'dedication', 'silence', 'bell_close'];

const SIM_USERS = [
  { user: 'Ngọc Anh', uniqueId: 'sim_ngocanh' },
  { user: 'Minh Quân', uniqueId: 'sim_minhquan' },
  { user: 'Tâm An', uniqueId: 'sim_taman' },
  { user: 'Hoàng Nam', uniqueId: 'sim_hoangnam' },
  { user: 'Thanh Hà', uniqueId: 'sim_thanhha' },
  { user: 'Đức Thịnh', uniqueId: 'sim_ducthinh' },
  { user: 'Bảo Ngọc', uniqueId: 'sim_baongoc' },
  { user: 'Gia Huy', uniqueId: 'sim_giahuy' }
];
const SIM_WISHES = [
  'Nguyện cho mọi người được bình an',
  'Mong cả nhà luôn mạnh khỏe, sống hiền lành',
  'Con nguyện sống tử tế hơn mỗi ngày',
  'Nam mô A Di Đà Phật',
  'Cảm ơn đạo tràng, tâm con thấy nhẹ nhàng',
  'kinh 2',
  'kinh 3'
];

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function hashKey(key) {
  return crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 12);
}

function hashIndex(str, mod) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % mod;
}

function sutraByNum(num) {
  return SUTRAS.find((s) => s.num === Number(num)) || null;
}

function sutraSummary(s) {
  const lines = toLines(s);
  return { num: s.num, id: s.id, name: s.name, meaning: s.meaning, syllables: lineSyllables(lines) };
}

function emptyCounters() {
  return { participants: 0, recitations: 0, wishes: 0, lamps: 0, invites: 0, sessions: 0 };
}

function create(ctx, saved = {}) {
  // ------------------------------------------------------------------------
  // Trạng thái
  // ------------------------------------------------------------------------
  let dayKey = saved.dayKey || todayKey();
  let counters = { ...emptyCounters(), ...(saved.dayKey === todayKey() ? saved.counters || {} : {}) };
  // Chỉ lưu mã băm của người tham gia trong ngày để đếm "người cùng tụng" — không lưu tên (bảo vệ dữ liệu cá nhân)
  let participantHashes = new Set(saved.dayKey === todayKey() && Array.isArray(saved.participantHashes) ? saved.participantHashes : []);
  let rotationIndex = Number(saved.rotationIndex) || 0;
  // Thống kê từng người trong NGÀY (thời gian cùng tụng, số tim…) — chỉ giữ trong ngày, tự xoá khi sang ngày mới
  let dayStats = new Map(saved.dayKey === todayKey() && Array.isArray(saved.dayStats) ? saved.dayStats : []);
  let paused = false;
  let resumeTo = 'gather';
  let bellWindow = null; // { at, count, keys:Set } phản hồi theo tiếng chuông gần nhất
  let bellWindowTimer = null;
  const readerClips = new Map(); // chữ -> url (giọng đọc từng chữ)
  let readerPreparing = false;

  const people = new Map(); // key -> { key, name, avatar, lastActive, lastLike, slot }
  const slots = new Array(SEAT_COUNT).fill(null); // slot -> key
  let sessionNames = new Map(); // key -> name (để hồi hướng cuối khoá)
  let sessionLamps = new Set(); // mỗi người 1 đèn sen mỗi khoá
  let sessionInvites = new Set();
  let votes = new Map(); // key -> { num, at }  (phiếu cho khoá kế tiếp)
  let nextOverride = null; // người trực chọn bài cho khoá sau
  const commentCooldown = new Map();
  const incenseCooldown = new Map();
  // Người xem tự chọn hình nam/nữ (bình luận "nam"/"nữ") — lưu theo mã băm, chỉ trong ngày
  let genderChoices = new Map(saved.dayKey === todayKey() && Array.isArray(saved.genderChoices) ? saved.genderChoices : []);

  let currentSutra = null;
  let phase = null;
  let phaseTimer = null;
  let disposed = false;

  let chantBuffer = new Map(); // key -> name (thả tim trong cửa sổ hiện tại)
  let chantFlushTimer = null;
  let thanksBuffer = new Map();
  let thanksTimer = null;

  // ------------------------------------------------------------------------
  // Tiện ích
  // ------------------------------------------------------------------------

  function rollDay() {
    const k = todayKey();
    if (k !== dayKey) {
      dayKey = k;
      counters = emptyCounters();
      participantHashes = new Set();
      dayStats = new Map();
      genderChoices = new Map();
    }
  }

  // ------------------------------------------------------------------------
  // Thống kê từng người: thời gian cùng tụng (theo các lần tương tác liên tiếp), số tim
  // TikTok không báo khi người xem rời phòng, nên thời gian = tổng các quãng giữa hai lần tương tác cách nhau ≤ 2 phút
  // ------------------------------------------------------------------------
  function statFor(key, name) {
    let st = dayStats.get(key);
    const now = Date.now();
    if (!st) {
      if (dayStats.size >= MAX_TRACKED) return null;
      st = { name, firstAt: now, lastAt: now, activeMs: 0, hearts: 0, heartsWithMo: 0, heartsAtBell: 0, wishes: 0, lamps: 0, m: [] };
      dayStats.set(key, st);
      return st;
    }
    st.name = name;
    const gap = now - st.lastAt;
    if (gap > 0 && gap <= PRESENCE_GAP_MS) st.activeMs += gap;
    st.lastAt = now;
    return st;
  }

  function checkMilestones(person, st) {
    if (!st) return;
    const mins = Math.floor(st.activeMs / 60000);
    for (const m of MINUTE_MILESTONES) {
      const tag = `t${m}`;
      if (mins >= m && !st.m.includes(tag)) {
        st.m.push(tag);
        ctx.broadcast('chant.activity', { kind: 'milestone', name: person.name, slot: person.slot, text: `đã cùng tụng ${m} phút` });
      }
    }
    for (const h of HEART_MILESTONES) {
      const tag = `h${h}`;
      if (st.hearts >= h && !st.m.includes(tag)) {
        st.m.push(tag);
        ctx.broadcast('chant.activity', { kind: 'milestone', name: person.name, slot: person.slot, text: `đã niệm ${h} lượt` });
      }
    }
  }

  // Tiếng chuông gần nhất (theo dòng thời gian của phase hiện tại) đã vang trong vòng BELL_RESPONSE_MS chưa
  function activeBellAt(now) {
    if (!phase || !phase.cues) return null;
    const elapsed = now - phase.startedAt;
    let last = null;
    for (const c of phase.cues) {
      if (c.k !== 'bell' || !c.g || c.g === 'breath') continue;
      if (c.t <= elapsed) last = c;
      else break;
    }
    if (!last || elapsed - last.t > BELL_RESPONSE_MS) return null;
    return phase.startedAt + last.t;
  }

  function noteBellResponse(person, count) {
    const at = activeBellAt(Date.now());
    if (!at) return false;
    if (!bellWindow || bellWindow.at !== at) {
      flushBellWindow();
      bellWindow = { at, count: 0, keys: new Set(), names: [] };
      bellWindowTimer = setTimeout(flushBellWindow, Math.max(500, at + BELL_RESPONSE_MS - Date.now()));
    }
    bellWindow.count += count;
    if (!bellWindow.keys.has(person.key)) {
      bellWindow.keys.add(person.key);
      if (bellWindow.names.length < 5) bellWindow.names.push(person.name);
    }
    return true;
  }

  function flushBellWindow() {
    clearTimeout(bellWindowTimer);
    bellWindowTimer = null;
    if (bellWindow && bellWindow.keys.size > 0) {
      counters.bellResponses = (counters.bellResponses || 0) + bellWindow.keys.size;
      ctx.broadcast('chant.activity', {
        kind: 'bellResponse',
        people: bellWindow.keys.size,
        names: bellWindow.names,
        hearts: bellWindow.count,
        counters
      });
    }
    bellWindow = null;
  }

  function personKey(user = {}) {
    return String(user.uniqueId || user.user || 'an-danh').slice(0, 60);
  }

  /** Tương tác bất kỳ: nhận chỗ ngồi (nếu chưa có) và ghi nhận tham gia. Trả về { person, isNewSeat }. */
  function touch(user = {}) {
    rollDay();
    const key = personKey(user);
    const name = sanitizeUserName(user.user || user.uniqueId);
    const now = Date.now();
    let person = people.get(key);
    let isNewSeat = false;
    if (!person) {
      person = { key, name, avatar: user.avatar || '', lastActive: now, lastLike: 0, slot: -1 };
      person.gender = genderChoices.get(hashKey(key)) || guessGender(user.user || user.uniqueId);
      people.set(key, person);
    }
    person.name = name;
    if (user.avatar) person.avatar = user.avatar;
    person.lastActive = now;

    if (person.slot < 0) {
      assignSlot(person);
      isNewSeat = true;
    }
    if (people.size > 2000) {
      for (const [k, p] of people) {
        if (p.slot < 0 && now - p.lastActive > 3600000) people.delete(k);
      }
    }

    const h = hashKey(key);
    if (!participantHashes.has(h)) {
      participantHashes.add(h);
      counters.participants += 1;
    }
    if (!sessionNames.has(key) && sessionNames.size < MAX_DEDICATION_NAMES * 4) sessionNames.set(key, name);
    person.stat = statFor(key, name);
    return { person, isNewSeat };
  }

  // Chọn chỗ trống phía của mình (nam: trái, nữ: phải), hàng gần trước; hết chỗ thì nhường chỗ của người
  // lâu nhất chưa tương tác cùng phía
  function assignSlot(person) {
    const side = SIDE_FOR[person.gender] || 'R';
    let slot = -1;
    for (let i = 0; i < SEAT_COUNT; i++) {
      if (slots[i] === null && SEAT_LAYOUT[i].side === side) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      let oldest = null;
      for (let i = 0; i < SEAT_COUNT; i++) {
        if (SEAT_LAYOUT[i].side !== side) continue;
        const p = people.get(slots[i]);
        if (p && p !== person && (!oldest || p.lastActive < oldest.lastActive)) oldest = p;
      }
      if (oldest) {
        slot = oldest.slot;
        oldest.slot = -1;
      } else {
        slot = slots.indexOf(null);
      }
    }
    if (slot < 0) return;
    slots[slot] = person.key;
    person.slot = slot;
  }

  // Người xem tự chọn hình: đổi hình và chuyển sang đúng phía (nam trái, nữ phải)
  function setGender(person, gender) {
    genderChoices.set(hashKey(person.key), gender);
    if (genderChoices.size > 20000) genderChoices.delete(genderChoices.keys().next().value);
    if (person.gender === gender) return false;
    person.gender = gender;
    if (person.slot >= 0) {
      slots[person.slot] = null;
      person.slot = -1;
      assignSlot(person);
    }
    return true;
  }

  function seatView(person) {
    return { slot: person.slot, key: person.key, name: person.name, avatar: person.avatar, gender: person.gender };
  }

  function announceSeat(person) {
    ctx.broadcast('chant.activity', { kind: 'seat', seat: seatView(person), counters });
  }

  function seatAndAnnounce(user) {
    const { person, isNewSeat } = touch(user);
    if (isNewSeat) announceSeat(person);
    return person;
  }

  function chantingNow() {
    const now = Date.now();
    const list = [];
    for (const key of slots) {
      const p = key && people.get(key);
      if (p && now - p.lastLike < CHANTING_WINDOW_MS) list.push(p.name);
    }
    return list;
  }

  function nextUp() {
    const tally = new Map();
    for (const { num, at } of votes.values()) {
      const t = tally.get(num) || { num, count: 0, firstAt: at };
      t.count += 1;
      t.firstAt = Math.min(t.firstAt, at);
      tally.set(num, t);
    }
    const list = [...tally.values()].sort((a, b) => b.count - a.count || a.firstAt - b.firstAt);
    const out = list.slice(0, 3).map((t) => ({ num: t.num, name: sutraByNum(t.num).name, votes: t.count }));
    if (nextOverride) {
      return [{ num: nextOverride, name: sutraByNum(nextOverride).name, votes: 0, chosen: true }, ...out.filter((o) => o.num !== nextOverride)].slice(0, 3);
    }
    return out;
  }

  function pickNextSutra() {
    let num = nextOverride;
    if (!num) {
      const top = nextUp()[0];
      if (top) num = top.num;
    }
    if (!num) {
      const rotation = Array.isArray(ctx.settings.rotation) && ctx.settings.rotation.length ? ctx.settings.rotation : DEFAULT_ROTATION;
      num = rotation[rotationIndex % rotation.length];
      rotationIndex += 1;
    }
    nextOverride = null;
    votes = new Map();
    return sutraByNum(num) || SUTRAS[0];
  }

  // ------------------------------------------------------------------------
  // Thời khoá (máy trạng thái)
  // ------------------------------------------------------------------------
  // Tốc độ (chữ/phút) theo lối tụng — ước tính, gốc là cài đặt "bpm" (nhịp kinh tiếng Việt)
  function tempoFor(style) {
    const base = Number(ctx.settings.bpm) || 90;
    switch (style) {
      case 'fast': return { spm: base * 1.3, accelerate: 0.1 };
      case 'slow': return { spm: base * 0.7, accelerate: 0 };
      case 'recitation': return { spm: base * 0.8, accelerate: 0.05 }; // niệm Phật: chậm, đều
      default: return { spm: base, accelerate: 0.15 };
    }
  }

  // Gói dòng thời gian (chữ + chuông mõ) vào dữ liệu phase cho màn hình
  function withTimeline(lines, tl, extraMs = 0) {
    return {
      text: lines ? { lines, syllables: lineSyllables(lines), times: tl.syllableTimes } : null,
      cues: [...tl.cues].sort((x, y) => x.t - y.t),
      durationMs: Math.round(tl.endAt + extraMs)
    };
  }

  function buildPhase(id) {
    const base = {
      id,
      title: PHASE_TITLES[id],
      startedAt: Date.now(),
      // Bài kinh của khoá đang diễn ra (để màn hình báo trước "khoá này cùng tụng…")
      sessionSutra: id !== 'gather' && currentSutra ? { num: currentSutra.num, name: currentSutra.name } : null
    };
    switch (id) {
      case 'gather':
        return { ...base, subtitle: 'Mời mọi người vào đạo tràng — thả tim để cùng tụng', cues: [], durationMs: (Number(ctx.settings.gatherSeconds) || 90) * 1000 };
      case 'bell_open': {
        const tl = timeline.openingBells();
        return { ...base, subtitle: 'Mời đại chúng cùng an tọa', cues: tl.cues, durationMs: tl.endAt };
      }
      case 'incense': {
        // Niệm hương: xướng chậm, KHÔNG mõ; một tiếng chuông khi xướng xong
        const lines = toLines(LITURGY.incense);
        const tl = timeline.intoned(lines, { spm: Number(ctx.settings.intonedSpm) || 54, linePauseMs: 1100, bellAfterLines: [lines.length - 1], startAt: 1500, gesture: 'chap' });
        return { ...base, subtitle: LITURGY.incense.meaning, voice: 'intoned', ...withTimeline(lines, tl, 3000) };
      }
      case 'khai_chuong_mo': {
        const tl = timeline.khaiChuongMo(500);
        return { ...base, subtitle: 'Chuông mõ mở đầu — mời đại chúng cùng tụng', cues: tl.cues, durationMs: tl.endAt };
      }
      case 'opening': {
        // Khai kinh kệ: có mõ nhưng chậm
        const lines = toLines(LITURGY.opening);
        const tl = timeline.chantedWithMo(lines, { ...tempoFor('slow'), startAt: 300 });
        return { ...base, subtitle: LITURGY.opening.meaning, voice: 'mo', ...withTimeline(lines, tl) };
      }
      case 'sutra': {
        // Xướng danh hiệu 3 lần (mỗi lần một chuông, không mõ) rồi đồng tụng kinh có mõ
        const invocationText = currentSutra.invocation === null ? null : currentSutra.invocation || DEFAULT_INVOCATION;
        const invLines = invocationText ? toLines({ repeat: { line: invocationText, times: 3 } }) : [];
        const inv = timeline.intoned(invLines, { gesture: 'xa', spm: (Number(ctx.settings.intonedSpm) || 54) * 1.4, linePauseMs: 800, bellAfterLines: [0, 1, 2], startAt: 800, bellWaitMs: 2200 });
        const lines = toLines(currentSutra);
        let body;
        if (currentSutra.style === 'bow') {
          // Tam quy: xướng, sau mỗi câu quy y một tiếng chuông để chắp tay xá
          const bellAfter = lines.map((_, i) => i).filter((i) => i % 2 === 1);
          body = timeline.intoned(lines, {
            spm: Number(ctx.settings.intonedSpm) || 54,
            linePauseMs: 900,
            bellAfterLines: bellAfter,
            startAt: inv.endAt + 600,
            bellWaitMs: 3500,
            gesture: 'xa'
          });
          body.endAt += 3000;
        } else {
          body = timeline.chantedWithMo(lines, {
            ...tempoFor(currentSutra.style),
            startAt: inv.endAt + 1200,
            moPerLine: currentSutra.lang === 'vi' && ctx.settings.vietMoStyle === 'line'
          });
        }
        const tl = { ...timeline.merge(inv, body), endAt: body.endAt };
        return {
          ...base,
          title: currentSutra.name,
          subtitle: currentSutra.meaning,
          sutra: sutraSummary(currentSutra),
          voice: currentSutra.style === 'bow' ? 'intoned' : 'mo',
          introLines: invLines.length,
          ...withTimeline([...invLines, ...lines], tl)
        };
      }
      case 'recitation': {
        const times = Math.max(3, Math.min(108, Number(ctx.settings.niemPhatCount) || 10));
        const lines = toLines({ repeat: { line: RECITATION_LINE, times } });
        const tl = timeline.chantedWithMo(lines, { ...tempoFor('recitation'), startAt: 600 });
        return { ...base, subtitle: 'Nhất tâm niệm Phật, để tâm lắng lại', voice: 'mo', ...withTimeline(lines, tl) };
      }
      case 'dedication': {
        // Hồi hướng: xướng chậm, không mõ; chuông giữa bài và ngay sau chữ cuối (lối Làng Mai)
        const names = [...sessionNames.values()].slice(0, MAX_DEDICATION_NAMES);
        const lines = toLines(LITURGY.dedication);
        const tl = timeline.intoned(lines, { spm: (Number(ctx.settings.intonedSpm) || 54) * 0.95, linePauseMs: 1000, bellAfterLines: [1, lines.length - 1], startAt: 1000, gesture: 'xa' });
        const minMs = 6000 + Math.min(names.length, 120) * 250;
        const timed = withTimeline(lines, tl, 3000);
        return {
          ...base,
          subtitle: LITURGY.dedication.meaning,
          voice: 'intoned',
          names,
          totalNames: sessionNames.size,
          ...timed,
          durationMs: Math.max(timed.durationMs, minMs)
        };
      }
      case 'silence': {
        const tl = timeline.sittingStartBells();
        return { ...base, subtitle: 'Mời đại chúng ngồi yên, thở nhẹ', cues: tl.cues, durationMs: (Number(ctx.settings.silenceSeconds) || 60) * 1000 };
      }
      case 'bell_close': {
        const tl = timeline.closingBells();
        return { ...base, subtitle: 'Khoá tụng đã viên mãn', cues: tl.cues, durationMs: tl.endAt };
      }
      default:
        return { ...base, cues: [], durationMs: 10000 };
    }
  }

  // Bước có thể tắt trong trang quản lý (không tắt được khai chuông, kinh chính, kết chuông)
  const SKIPPABLE = {
    incense: 'useIncense',
    khai_chuong_mo: 'useKhaiChuongMo',
    opening: 'useOpening',
    recitation: 'useRecitation',
    dedication: 'useDedication'
  };

  function nextPhaseId(id) {
    let idx = PHASE_ORDER.indexOf(id);
    for (let i = 0; i < PHASE_ORDER.length; i++) {
      idx = (idx + 1) % PHASE_ORDER.length;
      const cand = PHASE_ORDER[idx];
      const flag = SKIPPABLE[cand];
      if (flag && ctx.settings[flag] === false) continue;
      if (cand === 'silence' && !(Number(ctx.settings.silenceSeconds) > 0)) continue;
      return cand;
    }
    return 'gather';
  }

  function enterPhase(id) {
    if (disposed) return;
    clearTimeout(phaseTimer);
    paused = false;
    if (id !== 'bell_open' && id !== 'gather' && !currentSutra) currentSutra = pickNextSutra();
    if (id === 'bell_open') {
      currentSutra = pickNextSutra();
      sessionNames = new Map();
      sessionLamps = new Set();
      sessionInvites = new Set();
      // Ai đang ngồi trong đạo tràng đều có tên trong lời hồi hướng của khoá này
      for (const key of slots) {
        const p = key && people.get(key);
        if (p) sessionNames.set(p.key, p.name);
      }
    }
    if (id === 'sutra') {
      ctx.emitEvent({ type: 'sutraStart', sutra: sutraSummary(currentSutra) });
    }
    if (id === 'bell_close') {
      counters.sessions += 1;
      ctx.save();
    }
    phase = buildPhase(id);
    attachReader(phase);
    ctx.broadcast('chant.phase', { phase, serverNow: Date.now(), nextUp: nextUp() });
    ctx.scheduleStateBroadcast();
    // Chế độ "điều phối tay": tụ hội đến khi người trực bấm "Bắt đầu khoá tụng"
    if (id === 'gather' && ctx.settings.autoRun === false) return;
    phaseTimer = setTimeout(() => enterPhase(nextPhaseId(id)), phase.durationMs);
  }

  function pauseRoom() {
    clearTimeout(phaseTimer);
    resumeTo = phase && phase.id !== 'paused' ? phase.id : resumeTo;
    paused = true;
    phase = { id: 'paused', title: 'Tạm dừng', subtitle: 'Người trực đã tạm dừng thời khoá', startedAt: Date.now(), cues: [], durationMs: 0, sessionSutra: null };
    ctx.broadcast('chant.phase', { phase, serverNow: Date.now(), nextUp: nextUp() });
    ctx.scheduleStateBroadcast();
  }

  // ------------------------------------------------------------------------
  // Giọng đọc: tổng hợp TỪNG CHỮ bằng ZeroTTS (đặt đúng lên mỗi nhịp mõ — ZeroTTS không chỉnh được tốc độ,
  // đọc nguyên câu sẽ nhanh gấp ~3 lần nhịp tụng). Chuẩn bị trước toàn bộ chữ của các bài, lưu cache đĩa.
  // ------------------------------------------------------------------------
  function syllableKey(w) {
    return String(w).toLowerCase().replace(/[.,;:!?“”"()…]/g, '').trim();
  }

  function allTextLines() {
    const out = [];
    for (const k of Object.keys(LITURGY)) out.push(...toLines(LITURGY[k]));
    for (const sut of SUTRAS) {
      out.push(...toLines({ repeat: { line: sut.invocation || DEFAULT_INVOCATION, times: 1 } }));
      out.push(...toLines(sut));
    }
    out.push(...toLines({ repeat: { line: RECITATION_LINE, times: 1 } }));
    return out;
  }

  async function prepareReader() {
    if (readerPreparing || !ctx.tts) return;
    readerPreparing = true;
    try {
      const voice = ctx.settings.readerVoice || ctx.settings.ttsVoice || 'maichi';
      const words = [...new Set(allTextLines().flat().map(syllableKey).filter(Boolean))];
      for (const w of words) {
        if (disposed) break;
        const key = `${voice}::${w}`;
        if (readerClips.has(key)) continue;
        if (!ctx.tts.ready) {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        const res = await ctx.tts.synthesize(w, voice);
        if (res && res.ok && res.url) readerClips.set(key, res.url);
      }
    } catch (err) {
      console.warn('[Chanting] Chuẩn bị giọng đọc lỗi:', err.message);
    } finally {
      readerPreparing = false;
    }
  }

  function attachReader(p) {
    if (!p.text || ctx.settings.readerEnabled === false) return;
    const voice = ctx.settings.readerVoice || ctx.settings.ttsVoice || 'maichi';
    p.reader = {
      clips: p.text.lines.flat().map((w) => readerClips.get(`${voice}::${syllableKey(w)}`) || null)
    };
    if (p.reader.clips.some((c) => !c)) prepareReader();
  }

  // ------------------------------------------------------------------------
  // Tương tác
  // ------------------------------------------------------------------------
  function flushChant() {
    chantFlushTimer = null;
    if (chantBuffer.size === 0) return;
    const names = [...chantBuffer.values()];
    const keys = [...chantBuffer.keys()];
    chantBuffer = new Map();
    ctx.broadcast('chant.activity', { kind: 'chant', names, keys, chantingNow: chantingNow(), counters });
    ctx.save();
  }

  function flushThanks() {
    thanksTimer = null;
    if (thanksBuffer.size === 0) return;
    const names = [...thanksBuffer.values()];
    thanksBuffer = new Map();
    ctx.broadcast('chant.activity', { kind: 'thanks', names, counters });
  }

  function addVote(key, num, { replace = true } = {}) {
    if (!sutraByNum(num)) return false;
    if (!replace && votes.has(key)) return false;
    votes.set(key, { num: Number(num), at: Date.now() });
    return true;
  }

  function handleLike(user, count = 1) {
    const person = seatAndAnnounce(user);
    const n = Math.max(1, Number(count) || 1);
    person.lastLike = Date.now();
    counters.recitations += n;
    const st = person.stat;
    if (st) {
      st.hearts += n;
      // Tim trong lúc đồng tụng có mõ = "niệm theo nhịp mõ"
      if (phase && phase.voice === 'mo') {
        st.heartsWithMo += n;
        counters.heartsWithMo = (counters.heartsWithMo || 0) + n;
      }
      if (noteBellResponse(person, n)) st.heartsAtBell += n;
      checkMilestones(person, st);
    }
    chantBuffer.set(person.key, person.name);
    if (!chantFlushTimer) chantFlushTimer = setTimeout(flushChant, CHANT_FLUSH_MS);
    return null;
  }

  function handleComment(user, text) {
    const raw = String(text || '').trim();
    const person = seatAndAnnounce(user);
    if (!raw || isBlockedSpamOrToxic(raw)) return null;

    // "nam" / "nữ": người xem tự chọn hình của mình (sửa khi đoán theo tên bị sai)
    const self = parseSelfGender(raw);
    if (self) {
      const changed = setGender(person, self);
      ctx.save();
      ctx.broadcast('chant.activity', { kind: 'gender', name: person.name, gender: self, changed });
      if (changed) ctx.broadcastState();
      return null;
    }

    // "thắp nhang" / "thắp hương" / "dâng hương": phật tử bước lên thảm đỏ, thắp nhang trước Phật rồi về chỗ
    if (INCENSE_RE.test(raw)) {
      const now = Date.now();
      if (now - (incenseCooldown.get(person.key) || 0) < INCENSE_COOLDOWN_MS) return null;
      incenseCooldown.set(person.key, now);
      if (incenseCooldown.size > 2000) incenseCooldown.delete(incenseCooldown.keys().next().value);
      counters.incenseOffers = (counters.incenseOffers || 0) + 1;
      if (person.stat) person.stat.incense = (person.stat.incense || 0) + 1;
      return ctx.emitEvent({ type: 'incenseOffer', key: person.key, user: person.name, avatar: person.avatar, slot: person.slot, gender: person.gender, counters });
    }

    const voteMatch = raw.match(VOTE_RE);
    let voted = null;
    if (voteMatch && addVote(person.key, voteMatch[1])) {
      voted = sutraSummary(sutraByNum(voteMatch[1]));
    }

    const now = Date.now();
    if (now - (commentCooldown.get(person.key) || 0) < COMMENT_COOLDOWN_MS) return null;
    commentCooldown.delete(person.key);
    commentCooldown.set(person.key, now);
    if (commentCooldown.size > 1000) commentCooldown.delete(commentCooldown.keys().next().value);

    // Phiếu chọn kinh hiện riêng; lời nguyện chỉ giữ phần còn lại của bình luận
    const wish = sanitizeWishText(voted ? raw.replace(VOTE_RE, ' ') : raw);
    if (!wish && !voted) return null;
    counters.wishes += 1;
    if (person.stat) person.stat.wishes += 1;
    return ctx.emitEvent({
      type: 'wish',
      key: person.key,
      user: person.name,
      avatar: person.avatar,
      slot: person.slot,
      wish,
      vote: voted ? { num: voted.num, name: voted.name } : null,
      counters,
      nextUp: nextUp()
    });
  }

  function handleGift(user, evt = {}) {
    const person = seatAndAnnounce(user);
    thanksBuffer.set(person.key, person.name);
    if (!thanksTimer) thanksTimer = setTimeout(flushThanks, THANKS_FLUSH_MS);
    if (sessionLamps.has(person.key)) return null; // mỗi người 1 đèn sen mỗi khoá — quà thêm chỉ được cảm ơn chung
    sessionLamps.add(person.key);
    counters.lamps += 1;
    if (person.stat) person.stat.lamps += 1;
    const giftKey = String(evt.giftId || evt.giftName || 'gift');
    // Quà cũng là 1 phiếu chọn kinh (như một bình luận), chỉ khi người đó chưa đề nghị bài nào
    const symbolicNum = 1 + hashIndex(giftKey, SUTRAS.length);
    addVote(person.key, symbolicNum, { replace: false });
    return ctx.emitEvent({
      type: 'lamp',
      key: person.key,
      user: person.name,
      avatar: person.avatar,
      slot: person.slot,
      symbol: LAMP_SYMBOLS[hashIndex(giftKey, LAMP_SYMBOLS.length)],
      counters,
      nextUp: nextUp()
    });
  }

  function handleInvite(user) {
    const person = seatAndAnnounce(user);
    if (sessionInvites.has(person.key)) return null;
    sessionInvites.add(person.key);
    counters.invites += 1;
    return ctx.emitEvent({ type: 'invite', key: person.key, user: person.name, avatar: person.avatar, slot: person.slot, counters });
  }

  function testUser(params = {}) {
    const name = params.user || 'Người thử';
    return { user: name, uniqueId: params.uniqueId || `test_${name}`, avatar: params.avatar || '' };
  }

  // ------------------------------------------------------------------------
  // Khởi động
  // ------------------------------------------------------------------------
  setImmediate(() => {
    enterPhase('gather');
    if (ctx.settings.readerEnabled !== false) prepareReader();
  });

  return {
    onEvent(evt) {
      const user = evt.user || {};
      switch (evt.type) {
        case 'join': {
          seatAndAnnounce(user);
          ctx.save();
          return null;
        }
        case 'like':
          return handleLike(user, evt.count);
        case 'chat':
          return handleComment(user, evt.text);
        case 'gift':
          return handleGift(user, evt);
        case 'follow':
        case 'share':
          return handleInvite(user);
        default:
          return null;
      }
    },

    rpc: {
      nextPhase() {
        enterPhase(nextPhaseId(phase && phase.id !== 'paused' ? phase.id : resumeTo));
        return { ok: true, phase: phase.id };
      },
      startSession() {
        enterPhase('bell_open');
        return { ok: true, phase: phase.id };
      },
      jumpTo(params = {}) {
        const id = String(params.phase || '');
        if (!PHASE_ORDER.includes(id)) throw new Error('Không có bước này');
        if (id === 'bell_open' || params.newSession) currentSutra = null;
        enterPhase(id);
        return { ok: true, phase: phase.id };
      },
      pause() {
        pauseRoom();
        return { ok: true };
      },
      resume() {
        enterPhase(paused ? resumeTo : nextPhaseId(phase.id));
        return { ok: true, phase: phase.id };
      },
      stats(params = {}) {
        const limit = Math.max(1, Math.min(500, Number(params.limit) || 200));
        return [...dayStats.entries()]
          .map(([key, st]) => ({
            key,
            name: st.name,
            minutes: Math.round(st.activeMs / 60000),
            hearts: st.hearts,
            heartsWithMo: st.heartsWithMo,
            heartsAtBell: st.heartsAtBell,
            wishes: st.wishes,
            lamps: st.lamps,
            incense: st.incense || 0,
            firstAt: st.firstAt,
            lastAt: st.lastAt
          }))
          .sort((a, b) => b.lastAt - a.lastAt)
          .slice(0, limit);
      },
      readerStatus() {
        const voice = ctx.settings.readerVoice || ctx.settings.ttsVoice || 'maichi';
        const words = [...new Set(allTextLines().flat().map(syllableKey).filter(Boolean))];
        const ready = words.filter((w) => readerClips.has(`${voice}::${w}`)).length;
        if (ready < words.length) prepareReader();
        return { voice, ready, total: words.length, preparing: readerPreparing };
      },
      setNextSutra(params = {}) {
        const s = sutraByNum(params.num);
        if (!s) throw new Error('Không có bài kinh số này');
        nextOverride = s.num;
        ctx.broadcastState();
        return { ok: true, next: s.name };
      },
      resetToday() {
        counters = emptyCounters();
        participantHashes = new Set();
        dayStats = new Map();
        ctx.save();
        ctx.broadcastState();
        return { ok: true };
      },
      testJoin(params) {
        seatAndAnnounce(testUser(params));
        ctx.scheduleStateBroadcast();
        return { ok: true };
      },
      testLike(params) {
        handleLike(testUser(params), 5);
        return { ok: true };
      },
      testGift(params) {
        return handleGift(testUser(params), { giftName: params.giftName || 'Rose' }) || { ok: true, note: 'Đã thả đèn sen trong khoá này (mỗi người 1 đèn mỗi khoá)' };
      }
    },

    simulate() {
      const pick = SIM_USERS[Math.floor(Math.random() * SIM_USERS.length)];
      const roll = Math.random();
      if (roll < 0.6) handleLike(pick, 1 + Math.floor(Math.random() * 5));
      else if (roll < 0.85) handleComment(pick, SIM_WISHES[Math.floor(Math.random() * SIM_WISHES.length)]);
      else if (roll < 0.95) handleGift(pick, { giftName: ['Rose', 'TikTok', 'Heart Me', 'Lotus'][Math.floor(Math.random() * 4)] });
      else handleInvite(pick);
    },

    getPublicState() {
      rollDay();
      const seats = slots.map((key) => (key && people.get(key) ? seatView(people.get(key)) : null)).filter(Boolean);
      return {
        serverNow: Date.now(),
        counters,
        phase,
        paused,
        phaseOrder: PHASE_ORDER,
        phaseTitles: PHASE_TITLES,
        seats,
        chantingNow: chantingNow(),
        nextUp: nextUp(),
        catalog: SUTRAS.map(sutraSummary),
        // Cho trang admin: danh sách người đang ngồi trong đạo tràng (không xếp hạng)
        leaderboard: seats
          .map((s) => people.get(s.key))
          .sort((a, b) => b.lastActive - a.lastActive)
          .slice(0, 12)
          .map((p) => ({ name: p.name, avatar: p.avatar, label: Date.now() - p.lastLike < CHANTING_WINDOW_MS ? 'đang tụng' : '' }))
      };
    },

    serialize() {
      return {
        dayKey,
        counters,
        participantHashes: [...participantHashes].slice(-20000),
        rotationIndex,
        dayStats: [...dayStats.entries()].slice(-MAX_TRACKED),
        genderChoices: [...genderChoices.entries()].slice(-20000)
      };
    },

    dispose() {
      disposed = true;
      clearTimeout(phaseTimer);
      clearTimeout(chantFlushTimer);
      clearTimeout(thanksTimer);
      clearTimeout(bellWindowTimer);
    },

    onSettingsChanged(changed) {
      if ('readerVoice' in changed || 'readerEnabled' in changed) prepareReader();
      // Bật lại chạy tự động khi đang tụ hội: bắt đầu đếm giờ tụ hội
      if (changed.autoRun === true && phase && phase.id === 'gather') enterPhase('gather');
    }
  };
}

module.exports = {
  id: 'chanting',
  name: 'Tụng Kinh Chung',
  description: 'Cùng nhau tụng kinh trong tĩnh lặng: thả tim để cùng tụng, mọi tương tác bình đẳng, không bảng xếp hạng',
  overlay: 'chanting.html',
  settingsSchema: {
    bpm: [50, 140],
    intonedSpm: [30, 100],
    gatherSeconds: [15, 600],
    silenceSeconds: [0, 600],
    niemPhatCount: [3, 108],
    autoRun: 'boolean',
    useIncense: 'boolean',
    useKhaiChuongMo: 'boolean',
    useOpening: 'boolean',
    useRecitation: 'boolean',
    useDedication: 'boolean',
    readerEnabled: 'boolean',
    readerVoice: 'voice',
    readerVolume: [0, 1],
    sfxVolume: [0, 1],
    natureSound: 'boolean',
    showRhythmGuide: 'boolean',
    commentDisplay: { type: 'enum', values: ['head', 'lantern', 'both'] },
    vietMoStyle: { type: 'enum', values: ['syllable', 'line'] },
    rotation: { type: 'intList', min: 1, maxValue: 9, max: 30 }
  },
  defaultSettings: {
    ttsEnabled: false,
    bpm: 90,
    gatherSeconds: 90,
    silenceSeconds: 60,
    niemPhatCount: 21,
    intonedSpm: 54,
    vietMoStyle: 'syllable',
    musicVolume: 0.45,
    autoRun: true,
    useIncense: true,
    useKhaiChuongMo: true,
    useOpening: true,
    useRecitation: true,
    useDedication: true,
    readerEnabled: true,
    readerVoice: 'maichi',
    readerVolume: 0.35,
    sfxVolume: 0.8,
    natureSound: true,
    showRhythmGuide: true,
    commentDisplay: 'head',
    rotation: [1, 2, 3, 5, 6, 4, 8, 1, 2, 9, 3, 7]
  },
  create
};
