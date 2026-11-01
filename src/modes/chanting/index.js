const crypto = require('crypto');
const { LITURGY, SUTRAS, RECITATION_LINE, DEFAULT_ROTATION, toLines, lineSyllables } = require('./texts');
const { isBlockedSpamOrToxic, sanitizeUserName, sanitizeWishText } = require('../../util/sanitize');

// ============================================================================
// CHẾ ĐỘ "PHÒNG TỤNG KINH CHUNG" (xem docs/phong-tung-kinh.md)
// - Mọi tương tác bình đẳng: không bảng xếp hạng, không số xu, không phân biệt quà lớn – nhỏ
// - Tương tác đầu tiên bất kỳ = thắp nhang + nhận chỗ ngồi; ai cũng thấy mình trên màn hình
// - Thời khoá lặp lại: tụ hội → khai chuông → niệm hương → khai kinh → kinh chính → niệm Phật
//   → hồi hướng (cuộn tên mọi người đã tham gia) → kết chuông → tĩnh lặng
// ============================================================================

const SEAT_COUNT = 38; // 6 bồ đoàn trước điện + 32 chỗ hai bên thảm
const CHANTING_WINDOW_MS = 6000; // thả tim trong 6 giây gần nhất = "đang tụng kinh"
const COMMENT_COOLDOWN_MS = 4000;
const CHANT_FLUSH_MS = 1500;
const THANKS_FLUSH_MS = 8000;
const LEAD_IN_BEATS = 2;
const MAX_DEDICATION_NAMES = 300;
const VOTE_RE = /(?:^|[^\p{L}])kinh\s*(?:số\s*)?([1-9])(?![0-9])/iu;

// Mỗi loại quà là một biểu tượng tượng trưng — cùng kích thước, cùng ánh sáng, không theo giá trị
const LAMP_SYMBOLS = ['🪷', '🏮', '🕯️', '🌸', '🌼', '💮', '🍃', '🌺'];

const PHASE_TITLES = {
  gather: 'Tụ hội',
  bell_open: 'Khai chuông',
  incense: LITURGY.incense.title,
  opening: LITURGY.opening.title,
  sutra: 'Tụng kinh',
  recitation: 'Niệm Phật',
  dedication: LITURGY.dedication.title,
  bell_close: 'Kết chuông',
  silence: 'Tĩnh lặng'
};
const PHASE_ORDER = ['gather', 'bell_open', 'incense', 'opening', 'sutra', 'recitation', 'dedication', 'bell_close', 'silence'];

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

  const people = new Map(); // key -> { key, name, avatar, lastActive, lastLike, slot }
  const slots = new Array(SEAT_COUNT).fill(null); // slot -> key
  let sessionNames = new Map(); // key -> name (để hồi hướng cuối khoá)
  let sessionLamps = new Set(); // mỗi người 1 đèn sen mỗi khoá
  let sessionInvites = new Set();
  let votes = new Map(); // key -> { num, at }  (phiếu cho khoá kế tiếp)
  let nextOverride = null; // người trực chọn bài cho khoá sau
  const commentCooldown = new Map();

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
  const beatMs = () => 60000 / (Number(ctx.settings.bpm) || 84);

  function rollDay() {
    const k = todayKey();
    if (k !== dayKey) {
      dayKey = k;
      counters = emptyCounters();
      participantHashes = new Set();
    }
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
      people.set(key, person);
    }
    person.name = name;
    if (user.avatar) person.avatar = user.avatar;
    person.lastActive = now;

    if (person.slot < 0) {
      let slot = slots.indexOf(null);
      if (slot < 0) {
        // Đạo tràng đã đầy chỗ hiện tên: nhường chỗ của người lâu nhất chưa tương tác
        let oldest = null;
        for (const k of slots) {
          const p = people.get(k);
          if (p && (!oldest || p.lastActive < oldest.lastActive)) oldest = p;
        }
        slot = oldest.slot;
        oldest.slot = -1;
      }
      slots[slot] = key;
      person.slot = slot;
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
    return { person, isNewSeat };
  }

  function seatView(person) {
    return { slot: person.slot, key: person.key, name: person.name, avatar: person.avatar };
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
      num = DEFAULT_ROTATION[rotationIndex % DEFAULT_ROTATION.length];
      rotationIndex += 1;
    }
    nextOverride = null;
    votes = new Map();
    return sutraByNum(num) || SUTRAS[0];
  }

  // ------------------------------------------------------------------------
  // Thời khoá (máy trạng thái)
  // ------------------------------------------------------------------------
  function textPhase(lines) {
    const syllables = lineSyllables(lines);
    const ms = beatMs();
    return {
      text: { lines, bpm: Number(ctx.settings.bpm) || 84, leadInBeats: LEAD_IN_BEATS, syllables },
      durationMs: Math.round((LEAD_IN_BEATS + syllables) * ms + 2500)
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
        return { ...base, subtitle: 'Mời mọi người vào đạo tràng — thả tim để cùng tụng', durationMs: (Number(ctx.settings.gatherSeconds) || 90) * 1000 };
      case 'bell_open':
        return { ...base, subtitle: 'Mời đại chúng cùng an tọa', durationMs: 12000, bells: [0, 4000, 8000] };
      case 'incense':
        return { ...base, subtitle: LITURGY.incense.meaning, ...textPhase(toLines(LITURGY.incense)) };
      case 'opening':
        return { ...base, subtitle: LITURGY.opening.meaning, ...textPhase(toLines(LITURGY.opening)) };
      case 'sutra':
        return {
          ...base,
          title: currentSutra.name,
          subtitle: currentSutra.meaning,
          sutra: sutraSummary(currentSutra),
          ...textPhase(toLines(currentSutra))
        };
      case 'recitation': {
        const times = Math.max(3, Math.min(108, Number(ctx.settings.niemPhatCount) || 10));
        const lines = toLines({ repeat: { line: RECITATION_LINE, times } });
        return { ...base, subtitle: 'Nhất tâm niệm Phật, để tâm lắng lại', ...textPhase(lines) };
      }
      case 'dedication': {
        const names = [...sessionNames.values()].slice(0, MAX_DEDICATION_NAMES);
        const tp = textPhase(toLines(LITURGY.dedication));
        return {
          ...base,
          subtitle: LITURGY.dedication.meaning,
          names,
          totalNames: sessionNames.size,
          ...tp,
          durationMs: Math.max(tp.durationMs, 6000 + Math.min(names.length, 120) * 250)
        };
      }
      case 'bell_close':
        return { ...base, subtitle: 'Buổi tụng đã viên mãn', durationMs: 9000, bells: [0, 3000] };
      case 'silence':
        return { ...base, subtitle: 'Mời đại chúng ngồi yên, thở nhẹ', durationMs: (Number(ctx.settings.silenceSeconds) || 60) * 1000 };
      default:
        return { ...base, durationMs: 10000 };
    }
  }

  function enterPhase(id) {
    if (disposed) return;
    clearTimeout(phaseTimer);
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
    // Bỏ qua tĩnh lặng nếu đặt 0 giây
    if (id === 'silence' && !(Number(ctx.settings.silenceSeconds) > 0)) return enterPhase('gather');

    phase = buildPhase(id);
    ctx.broadcast('chant.phase', { phase, serverNow: Date.now(), nextUp: nextUp() });
    ctx.scheduleStateBroadcast();
    phaseTimer = setTimeout(() => {
      const idx = PHASE_ORDER.indexOf(id);
      enterPhase(PHASE_ORDER[(idx + 1) % PHASE_ORDER.length]);
    }, phase.durationMs);
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
    person.lastLike = Date.now();
    counters.recitations += Math.max(1, Number(count) || 1);
    chantBuffer.set(person.key, person.name);
    if (!chantFlushTimer) chantFlushTimer = setTimeout(flushChant, CHANT_FLUSH_MS);
    return null;
  }

  function handleComment(user, text) {
    const raw = String(text || '').trim();
    const person = seatAndAnnounce(user);
    if (!raw || isBlockedSpamOrToxic(raw)) return null;

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
  setImmediate(() => enterPhase('gather'));

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
        const idx = phase ? PHASE_ORDER.indexOf(phase.id) : -1;
        enterPhase(PHASE_ORDER[(idx + 1) % PHASE_ORDER.length]);
        return { ok: true, phase: phase.id };
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
      return { dayKey, counters, participantHashes: [...participantHashes].slice(-20000), rotationIndex };
    },

    dispose() {
      disposed = true;
      clearTimeout(phaseTimer);
      clearTimeout(chantFlushTimer);
      clearTimeout(thanksTimer);
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
    gatherSeconds: [15, 600],
    silenceSeconds: [0, 600],
    niemPhatCount: [3, 108]
  },
  defaultSettings: {
    ttsEnabled: false,
    bpm: 84,
    gatherSeconds: 90,
    silenceSeconds: 60,
    niemPhatCount: 10,
    musicVolume: 0.45
  },
  create
};
