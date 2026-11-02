const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TTS_CACHE_DIR } = require('../../config');
const { LITURGY, SUTRAS, RECITATION_LINE, DEFAULT_INVOCATION, DEFAULT_ROTATION, toLines, lineSyllables } = require('./texts');
const timeline = require('./timeline');
const { isBlockedSpamOrToxic, sanitizeUserName, sanitizeWishText } = require('../../util/sanitize');

// ============================================================================
// CHẾ ĐỘ "PHÒNG TỤNG KINH CHUNG" (xem docs/phong-tung-kinh.md)
// - Mọi tương tác bình đẳng: không bảng xếp hạng, không số xu, không phân biệt quà lớn – nhỏ
// - Tương tác đầu tiên bất kỳ = dâng hương + nhận chỗ ngồi; ai cũng thấy mình trên màn hình
// - Thời khoá lặp lại: tụ hội → khai chuông → niệm hương (xướng, không mõ) → khai chuông mõ → khai kinh
//   → xướng danh hiệu + kinh chính (mõ) → niệm Phật (mõ) → hồi hướng (xướng, cuộn tên) → tĩnh lặng → kết chuông
// ============================================================================

// Số chỗ ngồi lấy từ bố cục dùng chung với màn hình (public/js/seat-layout.js) — gần to xa nhỏ, ~686 chỗ
const SEAT_LAYOUT = require('../../../public/js/seat-layout').buildSeatLayout();
const SEAT_COUNT = SEAT_LAYOUT.length;
const { guessGender, parseSelfGender } = require('./gender');
const { createSimulator, SIM_LEVELS, SIM_PREFIX } = require('./sim');
const { giftOffering, isSmallGift, OFFERINGS } = require('./gifts');
const { createWishBag } = require('./wishes');
const { ANNOUNCE, FAREWELL, GOODBYE, nextSessionLine, splitForSpeech, createAnnouncer } = require('./announcements');
const obs = require('../../core/obsControl');
const musicLib = require('../../core/musicLibrary');
// Nam ngồi bên trái thảm, nữ bên phải
const SIDE_FOR = { m: 'L', f: 'R' };

// Thứ tự xếp chỗ RẢI ĐỀU cho mỗi bên: chỗ kế tiếp luôn là chỗ xa nhất so với các chỗ đã chọn (farthest-point).
// Ít người thì ngồi rải khắp chánh điện; càng đông càng lấp dần khoảng trống cho tới khi kín chỗ.
// Khoảng cách tính trên màn hình nên hàng gần (người to) được giãn rộng hơn hàng xa — đúng phối cảnh.
const SPREAD_ORDER = (() => {
  const out = {};
  for (const side of ['L', 'R']) {
    const idx = SEAT_LAYOUT.map((p, i) => (p.side === side ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) {
      out[side] = [];
      continue;
    }
    const order = [idx[0]]; // bắt đầu từ chỗ hàng đầu, sát thảm đỏ
    const minD = new Map(idx.map((i) => [i, Infinity]));
    let last = idx[0];
    minD.delete(last);
    while (minD.size) {
      const a = SEAT_LAYOUT[last];
      let best = -1;
      let bestD = -1;
      for (const [i, d] of minD) {
        const b = SEAT_LAYOUT[i];
        const nd = Math.min(d, (a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        minD.set(i, nd);
        // ưu tiên nhẹ hàng gần hơn khi hai chỗ cách đều nhau
        const score = nd * (0.85 + 0.3 * b.scale);
        if (score > bestD) {
          bestD = score;
          best = i;
        }
      }
      order.push(best);
      minD.delete(best);
      last = best;
    }
    out[side] = order;
  }
  return out;
})();
const INCENSE_COOLDOWN_MS = 3 * 60 * 1000; // mỗi người lên dâng hương tối đa 1 lần / 3 phút
const PRESENCE_GAP_MS = 2 * 60 * 1000; // hai lần tương tác cách nhau ≤ 2 phút = vẫn đang ở trong đạo tràng
const BELL_RESPONSE_MS = 6000; // thả tim trong 6 giây sau tiếng chuông = "chắp tay theo chuông"
const MINUTE_MILESTONES = [10, 30, 60, 120];
const HEART_MILESTONES = [108, 1080];
const MAX_TRACKED = 5000;
const CHANTING_WINDOW_MS = 6000; // thả tim trong 6 giây gần nhất = "đang tụng kinh"
const COMMENT_COOLDOWN_MS = 4000;
const CHANT_FLUSH_MS = 1500;
const THANKS_FLUSH_MS = 2500; // gom quà trong 2,5 giây rồi đọc tên + lời chúc
const MAX_DEDICATION_NAMES = 300;
const VOTE_RE = /(?:^|[^\p{L}])kinh\s*(?:số\s*)?([1-9])(?![0-9])/iu;
// Cú pháp lên dâng hương trước Phật (vẫn nhận "thắp nhang" / "thắp hương")
const INCENSE_RE = /(?:^|[^\p{L}])(?:thắp|thap|dâng|dang)\s+(?:nhang|hương|huong)(?![\p{L}])/iu;

// Mỗi loại quà là một biểu tượng tượng trưng — cùng kích thước, cùng ánh sáng, không theo giá trị
const LAMP_SYMBOLS = ['🪷', '🏮', '🕯️', '🌸', '🌼', '💮', '🍃', '🌺'];

const GIFT_FOCUS_MS = 20000; // mỗi người được camera đưa cận cảnh tối đa 1 lần / 20 giây

// Lời chúc "thật tâm" để đọc thành tiếng (đã qua lọc khiếm nhã / spam): có ý chúc, nguyện, cảm ơn
const SINCERE_RE = /(nguy[eệ]n|c[aầ]u|ch[uú]c|mong|b[iì]nh an|an l[aà]nh|an l[aạ]c|an vui|s[uứ]c kh[oỏ]e|kh[oỏ]e m[aạ]nh|h[aạ]nh ph[uú]c|may m[aắ]n|c[aả]m [oơ]n|tu[yỳ] h[yỷ]|di [dđ][aà]|nam m[oô]|si[eê]u|h[oồ]i h[uướ][oớ]ng|b[iì]nh y[eê]n|t[aâ]m an|th[aà]nh t[aâ]m|t[uừ] bi)/iu;
const SPEECH_QUEUE_MAX = 6;
const WELCOME_SPEAK_MS = 25000; // lời chào người mới (dâng hương) gom lại, tối đa 1 lần / 25 giây

// Công đức tụng kinh trong ngày: chủ yếu theo thời gian cùng tụng và số tim; quà đóng góp rất ít
const MERIT_PER_MINUTE = 2;
const MERIT_PER_HEART = 0.25;
const MERIT_PER_GIFT = 1;
const MERIT_BROADCAST_MS = 8000;
// Hào quang: tụng lâu / thả tim nhiều thì hào quang đổi màu
const AURA_MINUTES = [10, 30, 60];
const AURA_HEARTS = [150, 500, 1500];

const PHASE_TITLES = {
  gather: 'Dâng hương',
  bell_open: 'Khai chuông',
  incense: LITURGY.incense.title,
  khai_chuong_mo: 'Khai chuông mõ',
  opening: LITURGY.opening.title,
  sutra: 'Tụng kinh',
  recitation: 'Niệm Phật',
  dedication: LITURGY.dedication.title,
  bell_close: 'Kết chuông',
  silence: 'Tĩnh lặng',
  dharma: 'Nghe pháp'
};
const PHASE_ORDER = ['gather', 'bell_open', 'incense', 'khai_chuong_mo', 'opening', 'sutra', 'recitation', 'dedication', 'silence', 'bell_close'];

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
  const lineClips = new Map(); // câu -> { url, durMs } (đọc tự nhiên cả câu)
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
  // Chọn chỗ phía của mình (nam: trái, nữ: phải) theo thứ tự rải đều. Hết chỗ thì nhường chỗ của người
  // ít tương tác nhất cùng phía: trước hết người chưa từng thả tim, rồi người lâu nhất không thả tim / tương tác.
  // Người vừa tương tác trong 2 phút gần đây không bị thay.
  const REPLACE_PROTECT_MS = 2 * 60 * 1000;
  const rankLess = (a, b) => {
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
    return false;
  };
  function assignSlot(person) {
    const side = SIDE_FOR[person.gender] || 'R';
    let slot = SPREAD_ORDER[side].find((i) => slots[i] === null);
    if (slot === undefined) {
      const now = Date.now();
      let victim = null;
      let victimRank = null;
      for (const i of SPREAD_ORDER[side]) {
        const p = people.get(slots[i]);
        if (!p || p === person) continue;
        const lastTouch = Math.max(p.lastActive || 0, p.lastLike || 0);
        const protectedNow = now - lastTouch < REPLACE_PROTECT_MS;
        // Hạng nhường chỗ: [đang được bảo vệ?, đã từng thả tim?, lần thả tim gần nhất, lần tương tác gần nhất]
        const rank = p.ambient ? [-1, 0, 0, 0] : [protectedNow ? 1 : 0, p.lastLike ? 1 : 0, p.lastLike || 0, p.lastActive || 0];
        if (!victimRank || rankLess(rank, victimRank)) {
          victim = p;
          victimRank = rank;
        }
      }
      if (victim) {
        slot = victim.slot;
        victim.slot = -1;
      } else {
        const free = slots.indexOf(null);
        slot = free >= 0 ? free : undefined;
      }
    }
    if (slot === undefined || slot < 0) return;
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
    const v = { slot: person.slot, key: person.key, name: person.name, avatar: person.avatar, gender: person.gender, tier: auraTier(person) };
    if (person.ambient) v.ambient = true;
    return v;
  }

  // ------------------------------------------------------------------------
  // Công đức & hào quang
  // ------------------------------------------------------------------------
  function meritOf(st) {
    if (!st) return 0;
    return Math.round((st.activeMs / 60000) * MERIT_PER_MINUTE + st.hearts * MERIT_PER_HEART + (st.gifts || 0) * MERIT_PER_GIFT);
  }

  function auraTier(person) {
    const st = person && person.stat;
    if (!st) return 0;
    const minutes = st.activeMs / 60000;
    let tier = 0;
    for (let i = 0; i < 3; i++) if (minutes >= AURA_MINUTES[i] || st.hearts >= AURA_HEARTS[i]) tier = i + 1;
    return tier;
  }

  function topMerit(limit = 5) {
    return [...dayStats.values()]
      .map((st) => ({ name: st.name, merit: meritOf(st), minutes: Math.round(st.activeMs / 60000), hearts: st.hearts }))
      .filter((r) => r.merit > 0)
      .sort((a, b) => b.merit - a.merit)
      .slice(0, limit);
  }

  let meritSig = '';
  let meritTimer = null;
  function scheduleMerit() {
    if (meritTimer) return;
    meritTimer = setTimeout(() => {
      meritTimer = null;
      const top = topMerit();
      const sig = top.map((r) => `${r.name}:${r.merit}`).join('|');
      if (sig === meritSig) return;
      meritSig = sig;
      ctx.broadcast('chant.activity', { kind: 'merit', top });
    }, MERIT_BROADCAST_MS);
  }

  function checkAura(person) {
    const tier = auraTier(person);
    if (tier > (person.tier || 0)) {
      person.tier = tier;
      if (person.slot >= 0) ctx.broadcast('chant.activity', { kind: 'aura', slot: person.slot, key: person.key, name: person.name, tier });
    }
  }

  // ------------------------------------------------------------------------
  // Hai chế độ: DÂNG HƯƠNG (lúc tụ hội) — nhạc nền + đọc lời chúc thật tâm, cảm ơn người ủng hộ;
  // TỤNG KINH (mọi bước còn lại) — chỉ tiếng pháp, lời chúc/cảm ơn hiện trên bảng bên trái
  // ------------------------------------------------------------------------
  function offeringTime() {
    return !phase || phase.id === 'gather' || phase.id === 'paused';
  }

  const speechQueue = [];
  const announceQueue = []; // lời dẫn: ưu tiên, đọc cả khi đang tụng kinh
  let speaking = false;
  let lastWelcomeSpeak = 0;
  let welcomeBuffer = [];

  const speakName = (name) => String(name || '').replace(/[._\-\d]+/g, ' ').replace(/\s+/g, ' ').trim();

  function isSincere(text) {
    const t = String(text || '').trim();
    if (t.length < 6 || t.split(/\s+/).length < 2) return false;
    if (/https?:|www\.|@/i.test(t)) return false;
    return SINCERE_RE.test(t);
  }

  function enqueueSpeech(text) {
    if (!offeringTime() || ctx.settings.speakWishes === false || !ctx.tts) return;
    if (speechQueue.length >= SPEECH_QUEUE_MAX) speechQueue.shift();
    speechQueue.push(String(text).slice(0, 150));
    if (!speaking) pumpSpeech();
  }

  /** Lời dẫn: chia theo câu, xếp trước mọi lời chúc đang chờ */
  function announce(text) {
    if (!text || !ctx.tts) return;
    splitForSpeech(text).forEach((t) => announceQueue.push(t));
    if (!speaking) pumpSpeech();
  }

  async function pumpSpeech() {
    if (speaking) return;
    speaking = true;
    try {
      while ((announceQueue.length || speechQueue.length) && !disposed) {
        const isAnnounce = announceQueue.length > 0;
        if (!isAnnounce && !offeringTime()) {
          speechQueue.length = 0;
          break;
        }
        const text = isAnnounce ? announceQueue.shift() : speechQueue.shift();
        if (!ctx.tts.ready) continue;
        const res = await ctx.tts.synthesize(text, readerVoice()).catch(() => null);
        if (!res || !res.ok || !res.url || (!isAnnounce && !offeringTime())) continue;
        const durMs = res.durationSec ? Math.round(res.durationSec * 1000) : wavDurationMs(res.url) || 3000;
        ctx.broadcast('chant.activity', { kind: 'speak', url: res.url, text, durMs, announce: isAnnounce });
        await new Promise((r) => setTimeout(r, durMs + (isAnnounce ? 350 : 900)));
      }
    } finally {
      speaking = false;
    }
  }

  // Lời chúc kèm lời chào người mới (phòng còn ít người xem: chào từng người cho đạo tràng ấm áp, không im lặng)
  // Lời chúc đọc ngay sau câu chào (chỉ chúc, không kêu gọi làm gì; mỗi câu dưới 150 ký tự)
  const WELCOME_WISHES = [
    'Chúc {b} một ngày bình an.',
    'Chúc {b} và gia đình mạnh khoẻ, an vui.',
    'Chúc {b} thân tâm an lạc, mọi việc hanh thông.',
    'Chúc {b} luôn bình yên, lòng nhẹ nhàng thanh thản.',
    'Chúc {b} gặp nhiều may mắn, gia đạo êm ấm.',
    'Chúc {b} sức khoẻ dồi dào, công việc thuận lợi.',
    'Chúc {b} một ngày nhiều niềm vui và an lành.',
    'Chúc {b} và những người thương luôn được bình an.',
    'Chúc {b} tâm an, trí sáng, mọi điều tốt đẹp.',
    'Chúc {b} vạn sự như ý, an vui mỗi ngày.'
  ];
  let welcomeWishIdx = 0;
  let welcomeFlushTimer = null;
  const WELCOME_EACH_GAP_MS = 7000;

  // Tên đọc được: bỏ số, ký hiệu, emoji; tên tài khoản mặc định (user123…) thì không đọc tên
  function welcomeName(name) {
    const n = speakName(String(name || '').replace(/[^\p{L}\p{M}\s]/gu, ' ')).trim();
    return !n || /^user$/i.test(n) ? '' : n;
  }

  function flushWelcome() {
    welcomeFlushTimer = null;
    const names = [...new Set(welcomeBuffer.map(welcomeName))];
    const unnamed = names.includes('');
    const named = names.filter(Boolean).slice(0, 3);
    welcomeBuffer = [];
    if (!named.length && !unnamed) return;
    lastWelcomeSpeak = Date.now();
    const many = named.length + (unnamed ? 1 : 0) > 1;
    const who = named.length ? named.join(', ') + (unnamed ? ' và các bạn mới' : '') : 'bạn mới';
    const wish = WELCOME_WISHES[welcomeWishIdx++ % WELCOME_WISHES.length].replace(/\{b\}/g, many ? 'các bạn' : 'bạn').replace(/\{B\}/g, many ? 'Các bạn' : 'Bạn');
    enqueueSpeech(`Chào mừng ${who} đã vào đạo tràng.`);
    enqueueSpeech(wish);
  }

  function noteWelcome(person) {
    welcomeBuffer.push(person.name);
    if (welcomeBuffer.length > 4) welcomeBuffer.shift();
    const now = Date.now();
    const limit = Number(ctx.settings.welcomeEachBelow ?? 50);
    const viewers = ctx.viewerCount ? ctx.viewerCount() : 0;
    if (limit > 0 && viewers < limit) {
      // Ít người xem: chào từng người (vào dồn dập thì gom 2–3 tên trong một câu)
      if (!welcomeFlushTimer) welcomeFlushTimer = setTimeout(flushWelcome, Math.max(2500, lastWelcomeSpeak + WELCOME_EACH_GAP_MS - now));
      return;
    }
    if (now - lastWelcomeSpeak < WELCOME_SPEAK_MS) return;
    lastWelcomeSpeak = now;
    const names = welcomeBuffer.map(speakName).filter(Boolean);
    welcomeBuffer = [];
    if (names.length) enqueueSpeech(`Chào mừng ${names.join(', ')} đã vào đạo tràng. A Di Đà Phật.`);
  }


  function announceSeat(person) {
    ctx.broadcast('chant.activity', { kind: 'seat', seat: seatView(person), counters });
  }

  // Phòng ít người xem: người mới vào tự bước lên chánh điện dâng hương, không cần bình luận
  // (không tính vào lượt dâng hương — chỉ lượt bình luận / quà mới tính)
  const autoIncenseTimers = new Set();
  function maybeAutoIncense(person) {
    const limit = Number(ctx.settings.autoIncenseBelow ?? 30);
    const viewers = ctx.viewerCount ? ctx.viewerCount() : 0;
    if (!(limit > 0) || viewers >= limit || endStage === 'ended') return;
    const t = setTimeout(() => {
      autoIncenseTimers.delete(t);
      if (disposed || person.slot < 0) return;
      const now = Date.now();
      if (now - (incenseCooldown.get(person.key) || 0) < INCENSE_COOLDOWN_MS) return; // vừa tự bình luận dâng hương
      incenseCooldown.set(person.key, now);
      ctx.emitEvent({ type: 'incenseOffer', auto: true, key: person.key, user: person.name, avatar: person.avatar, slot: person.slot, gender: person.gender });
    }, 2500 + Math.random() * 2000); // để cảnh vào chỗ ngồi hiện trước
    autoIncenseTimers.add(t);
  }

  function seatAndAnnounce(user) {
    const { person, isNewSeat } = touch(user);
    if (isNewSeat) {
      announceSeat(person);
      noteWelcome(person);
      maybeAutoIncense(person);
    }
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
      ...(tl.voiceTimes && tl.voiceTimes.length ? { voicePlan: { times: tl.voiceTimes, clips: tl.voiceClips } } : {}),
      cues: [...tl.cues].sort((x, y) => x.t - y.t),
      durationMs: Math.round(tl.endAt + extraMs)
    };
  }

  // Đọc tự nhiên cả câu (mặc định) hay đọc từng chữ theo nhịp mõ
  function naturalReader() {
    return ctx.settings.readerEnabled !== false && ctx.settings.readerStyle !== 'syllable';
  }
  function lineGap() {
    return Number(ctx.settings.lineGapMs) || 700;
  }
  // Gộp các dòng kinh thành CÂU trọn ý để đọc liền mạch, truyền cảm:
  //  - kệ (dòng nào cũng viết hoa đầu, ngắn, không dấu phẩy): đọc theo cặp hai dòng
  //  - kinh tiếng Việt: dòng sau viết thường là nối tiếp câu trước
  //  - danh hiệu lặp lại (single): mỗi dòng một câu
  //  - "breaks": luôn ngắt câu sau các dòng này (chỗ có tiếng chuông)
  // Tối đa 3 dòng / 22 chữ mỗi câu (đủ một hơi đọc, trong giới hạn của bộ đọc).
  function groupLines(lines, { breaks = [], single = false } = {}) {
    const isCap = (w) => /^\p{Lu}/u.test(w);
    const verse = lines.length > 1 && lines.every((l) => isCap(l[0]) && l.length <= 8 && !l.join(' ').includes(','));
    const groups = [];
    let start = 0;
    for (let i = 0; i < lines.length; i++) {
      const next = lines[i + 1];
      const size = i + 1 - start;
      const syl = lines.slice(start, i + 1).reduce((n, l) => n + l.length, 0);
      let end = single || !next || breaks.includes(i) || size >= 3 || syl + next.length > 22;
      if (!end) end = verse ? size >= 2 : isCap(next[0]);
      if (end) {
        groups.push({ start, end: i + 1 });
        start = i + 1;
      }
    }
    return groups;
  }

  function groupText(lines, g) {
    return lines
      .slice(g.start, g.end)
      .map((l) => l.join(' '))
      .join(', ')
      .replace(/,\s*,/g, ',');
  }

  // Các câu đọc của một đoạn, kèm độ dài thật; chưa đủ giọng thì null (dùng nhịp tụng theo bpm)
  function spokenPlan(lines, opts) {
    if (!naturalReader()) return null;
    if (!lines.length) return [];
    const voice = readerVoice();
    const groups = groupLines(lines, opts);
    for (const g of groups) {
      const c = lineClips.get(`${voice}::${groupText(lines, g)}`);
      if (!c || !c.durMs) return null;
      g.durMs = c.durMs;
      g.url = c.url;
    }
    return groups;
  }

  function buildPhase(id) {
    const base = {
      id,
      title: PHASE_TITLES[id],
      startedAt: Date.now(),
      // Bài kinh của khoá đang diễn ra (để màn hình báo trước "khoá này cùng tụng…")
      sessionSutra: id !== 'gather' && id !== 'dharma' && currentSutra ? { num: currentSutra.num, name: currentSutra.name } : null
    };
    switch (id) {
      case 'dharma': {
        // NGHE PHÁP: phát bài pháp (nhập từ YouTube) thay cho người đọc kinh; màn hình phát đồng bộ theo startedAt
        const talk = currentTalk();
        if (!talk) return { ...base, subtitle: 'Chưa chọn bài — vào trang quản lý → Âm thanh → Bài pháp / bài kinh', cues: [], durationMs: 60000 };
        return { ...base, title: talk.kind === 'kinh' ? 'Nghe tụng kinh' : 'Nghe pháp', subtitle: talk.title, talk, cues: [], durationMs: talk.durationMs };
      }
      case 'gather':
        // Chế độ DÂNG LỄ: nhạc nền, đọc lời chúc, cảm ơn người dâng lễ; camera cận cảnh người dâng
        return { ...base, subtitle: 'Mời mọi người vào đạo tràng — dâng hương, gửi lời chúc, thả tim', cues: [], durationMs: offeringMs() };
      case 'bell_open': {
        const tl = timeline.openingBells();
        return { ...base, subtitle: 'Mời đại chúng cùng an tọa', cues: tl.cues, durationMs: tl.endAt };
      }
      case 'incense': {
        // Niệm hương: xướng (không mõ); một tiếng chuông khi xướng xong
        const lines = toLines(LITURGY.incense);
        const d = spokenPlan(lines, { breaks: [lines.length - 1] });
        const tl = d
          ? timeline.spoken(lines, d, { startAt: 1500, gapMs: lineGap(), bellAfterLines: [lines.length - 1], gesture: 'chap' })
          : timeline.intoned(lines, { spm: Number(ctx.settings.intonedSpm) || 54, linePauseMs: 1100, bellAfterLines: [lines.length - 1], startAt: 1500, gesture: 'chap' });
        return { ...base, subtitle: LITURGY.incense.meaning, voice: 'intoned', ...withTimeline(lines, tl, 3000) };
      }
      case 'khai_chuong_mo': {
        const tl = timeline.khaiChuongMo(500);
        return { ...base, subtitle: 'Chuông mõ mở đầu — mời đại chúng cùng tụng', cues: tl.cues, durationMs: tl.endAt };
      }
      case 'opening': {
        // Khai kinh kệ: có mõ (đọc tự nhiên: mõ mỗi dòng; đọc từng chữ: mõ chậm mỗi chữ)
        const lines = toLines(LITURGY.opening);
        const d = spokenPlan(lines);
        const tl = d
          ? timeline.spoken(lines, d, { startAt: 300, gapMs: lineGap(), mo: true, endBell: true })
          : timeline.chantedWithMo(lines, { ...tempoFor('slow'), startAt: 300 });
        return { ...base, subtitle: LITURGY.opening.meaning, voice: 'mo', ...withTimeline(lines, tl) };
      }
      case 'sutra': {
        // Xướng danh hiệu 3 lần (mỗi lần một chuông, không mõ) rồi đồng tụng kinh có mõ
        const invocationText = currentSutra.invocation === null ? null : currentSutra.invocation || DEFAULT_INVOCATION;
        const invLines = invocationText ? toLines({ repeat: { line: invocationText, times: 3 } }) : [];
        const lines = toLines(currentSutra);
        const bowBreaks = lines.map((_, i) => i).filter((i) => i % 2 === 1);
        const dInv = spokenPlan(invLines, { single: true });
        const dBody = spokenPlan(lines, currentSutra.style === 'bow' ? { breaks: bowBreaks } : {});
        const natural = Boolean(dInv && dBody);
        const inv = natural
          ? timeline.spoken(invLines, dInv, { startAt: 800, gapMs: lineGap(), bellAfterLines: [0, 1, 2], gesture: 'xa', bellWaitMs: 2200 })
          : timeline.intoned(invLines, { gesture: 'xa', spm: (Number(ctx.settings.intonedSpm) || 54) * 1.4, linePauseMs: 800, bellAfterLines: [0, 1, 2], startAt: 800, bellWaitMs: 2200 });
        let body;
        if (currentSutra.style === 'bow') {
          // Tam quy: xướng, sau mỗi câu quy y một tiếng chuông để chắp tay xá
          const bellAfter = lines.map((_, i) => i).filter((i) => i % 2 === 1);
          body = natural
            ? timeline.spoken(lines, dBody, { startAt: inv.endAt + 600, gapMs: lineGap(), bellAfterLines: bellAfter, gesture: 'xa', bellWaitMs: 3500 })
            : timeline.intoned(lines, {
                spm: Number(ctx.settings.intonedSpm) || 54,
                linePauseMs: 900,
                bellAfterLines: bellAfter,
                startAt: inv.endAt + 600,
                bellWaitMs: 3500,
                gesture: 'xa'
              });
          body.endAt += 3000;
        } else {
          body = natural
            ? timeline.spoken(lines, dBody, { startAt: inv.endAt + 1200, gapMs: lineGap(), mo: true, endBell: true })
            : timeline.chantedWithMo(lines, {
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
        const d = spokenPlan(lines, { single: true });
        const tl = d
          ? timeline.spoken(lines, d, { startAt: 600, gapMs: Math.round(lineGap() * 0.6), mo: true, endBell: true })
          : timeline.chantedWithMo(lines, { ...tempoFor('recitation'), startAt: 600 });
        return { ...base, subtitle: 'Nhất tâm niệm Phật, để tâm lắng lại', voice: 'mo', ...withTimeline(lines, tl) };
      }
      case 'dedication': {
        // Hồi hướng: xướng, không mõ; chuông giữa bài và ngay sau chữ cuối (lối Làng Mai)
        const names = [...sessionNames.values()].slice(0, MAX_DEDICATION_NAMES);
        const lines = toLines(LITURGY.dedication);
        const d = spokenPlan(lines, { breaks: [1, lines.length - 1] });
        const tl = d
          ? timeline.spoken(lines, d, { startAt: 1000, gapMs: lineGap(), bellAfterLines: [1, lines.length - 1], gesture: 'xa' })
          : timeline.intoned(lines, { spm: (Number(ctx.settings.intonedSpm) || 54) * 0.95, linePauseMs: 1000, bellAfterLines: [1, lines.length - 1], startAt: 1000, gesture: 'xa' });
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

  // ------------------------------------------------------------------------
  // Lịch tự động: DÂNG HƯƠNG (offeringMinutes) ⇄ TỤNG KINH (chantMinutes).
  // Tụng kinh = một khoá đầy đủ; sau mỗi bài kinh, nếu còn đủ thời gian thì tụng tiếp bài kế trong lịch
  // (trước phần niệm Phật – hồi hướng – kết chuông), để cả khoá dài gần đúng số phút đã đặt.
  // ------------------------------------------------------------------------
  const TAIL_ESTIMATE_MS = 4 * 60 * 1000; // niệm Phật + hồi hướng + tĩnh lặng + kết chuông (ước lượng)
  let chantBlockStart = 0;
  let repeatSutra = false;
  let sutrasThisBlock = 0;

  function offeringMs() {
    const m = Number(ctx.settings.offeringMinutes);
    if (m > 0) return Math.round(m * 60000);
    return (Number(ctx.settings.gatherSeconds) || 90) * 1000;
  }
  // Chế độ phòng: 'auto' luân phiên Dâng hương ⇄ Tụng kinh | 'offering' chỉ Dâng hương | 'chant' tụng kinh liên tục
  // | 'dharma' nghe pháp (phát bài pháp YouTube liên tục theo danh sách)
  function roomMode() {
    const m = ctx.settings.roomMode;
    if (m === 'offering' || m === 'chant' || m === 'auto' || m === 'dharma') return m;
    return ctx.settings.autoRun === false ? 'offering' : 'auto';
  }
  function chantBudgetMs() {
    return Math.round((Number(ctx.settings.chantMinutes) || 20) * 60000);
  }

  function nextPhaseId(id) {
    if (id === 'sutra' && chantBlockStart) {
      const elapsed = Date.now() - chantBlockStart;
      const lastSutraMs = (phase && phase.durationMs) || 4 * 60000;
      const endCut = endActive() && Date.now() + lastSutraMs + TAIL_ESTIMATE_MS >= endAt() - farewellMs();
      if (!endCut && sutrasThisBlock < 12 && elapsed + lastSutraMs + TAIL_ESTIMATE_MS <= chantBudgetMs()) {
        repeatSutra = true;
        return 'sutra';
      }
    }
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
    const prevId = phase && phase.id;
    paused = false;
    if (endStage === 'ended') endStage = null; // người trực cho chạy lại sau khi đã kết thúc
    clearAnnounceTimers();
    if (id !== 'bell_open' && id !== 'gather' && id !== 'dharma' && !currentSutra) currentSutra = pickNextSutra();
    if (id === 'sutra' && repeatSutra) {
      repeatSutra = false;
      currentSutra = pickNextSutra(); // bài kế tiếp trong cùng khoá tụng
    }
    if (id === 'sutra') sutrasThisBlock += 1;
    if (id === 'gather') chantBlockStart = 0;
    if (id === 'bell_open') {
      chantBlockStart = Date.now();
      sutrasThisBlock = 0;
      currentSutra = pickNextSutra();
      sessionNames = new Map();
      sessionLamps = new Set();
      sessionInvites = new Set();
      // Ai đang ngồi trong đạo tràng đều có tên trong lời hồi hướng của khoá này
      for (const key of slots) {
        const p = key && people.get(key);
        if (p && !p.ambient) sessionNames.set(p.key, p.name);
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
    if (id === 'gather') scheduleTransitionSpeech(prevId);
    // Chế độ "điều phối tay": tụ hội đến khi người trực bấm "Bắt đầu khoá tụng"
    if (id === 'gather' && roomMode() === 'offering') return;
    phaseTimer = setTimeout(() => advanceFrom(id), phase.durationMs);
  }

  // Danh sách bài pháp (file nhạc đã nhập từ YouTube); hết bài thì sang bài kế, hết danh sách thì quay lại
  let dharmaIdx = 0;
  const DEFAULT_TALK_MS = 90 * 60000; // file không rõ độ dài
  const TALK_KINH_RE = /(^|[^\p{L}])(kinh|tụng|sutra|chú|niệm phật|sám hối|phẩm)(?![\p{L}])/iu;
  const TALK_PHAP_RE = /(pháp thoại|bài giảng|giảng|thuyết pháp|vấn đáp|giảng kinh)/iu;
  function talkList() {
    return (Array.isArray(ctx.settings.dharmaList) ? ctx.settings.dharmaList : []).filter((t) => String(t).startsWith('file:'));
  }
  function currentTalk() {
    const list = talkList();
    if (!list.length) return null;
    const track = list[((dharmaIdx % list.length) + list.length) % list.length];
    const file = track.slice(5);
    const info = musicLib.list().find((f) => f.file === file);
    if (!info) return null;
    // Bài tụng kinh hay pháp thoại: người trực chọn, hoặc tự đoán theo tên bài
    const label = ctx.settings.dharmaLabel || 'auto';
    const kind = label === 'kinh' || label === 'phap' ? label : TALK_KINH_RE.test(info.title) && !TALK_PHAP_RE.test(info.title) ? 'kinh' : 'phap';
    return {
      track,
      kind,
      title: info.title,
      url: `/music/${encodeURIComponent(file)}`,
      durationMs: info.duration ? Math.round(info.duration * 1000) + 2000 : DEFAULT_TALK_MS
    };
  }

  function advanceFrom(id) {
    // Chế độ nghe pháp: hết bài thì sang bài kế; đang ở bước khác thì vào nghe pháp
    if (roomMode() === 'dharma' && endStage !== 'farewell') {
      if (id === 'dharma') dharmaIdx += 1;
      return enterPhase('dharma');
    }
    // Chế độ chỉ tụng kinh: kết khoá xong vào khoá mới luôn (trừ khi sắp tắt live)
    if (roomMode() === 'chant' && (id === 'bell_close' || id === 'gather') && !chantWouldBeCut(Date.now())) {
      currentSutra = null;
      return enterPhase('bell_open');
    }
    // Sắp tới giờ tắt live, không đủ thời gian cho trọn một khoá tụng: ở lại Dâng hương tới lúc chào
    if (id === 'gather' && chantWouldBeCut(Date.now())) {
      phaseTimer = setTimeout(() => advanceFrom('gather'), 30000);
      return;
    }
    enterPhase(nextPhaseId(id));
  }

  // ------------------------------------------------------------------------
  // Hẹn giờ tắt live: trước giờ hẹn vài phút đọc lời báo & cảm ơn; tới giờ đọc lời chào cuối,
  // màn hình chuyển sang "Viên mãn", (tuỳ chọn) tự dừng phát trong OBS.
  // Đang tụng kinh dở thì không tụng thêm bài, đợi kết khoá rồi mới chào.
  // ------------------------------------------------------------------------
  let endStage = null; // null | 'scheduled' | 'farewell' | 'ended'
  let farewellStartedAt = 0;
  let obsStopTimer = null;
  let obsResult = null;
  // Giờ hẹn đã qua lúc khởi động (máy tắt / chạy lại) thì bỏ qua
  let endedFor = Number(ctx.settings.liveEndAt) > 0 && Number(ctx.settings.liveEndAt) <= Date.now() ? Number(ctx.settings.liveEndAt) : 0;
  const pickFarewell = (() => { let i = 0; return () => FAREWELL[i++ % FAREWELL.length]; })();
  const pickGoodbye = (() => { let i = 0; return () => GOODBYE[i++ % GOODBYE.length]; })();

  function endAt() {
    return Number(ctx.settings.liveEndAt) || 0;
  }
  function endActive() {
    const at = endAt();
    return at > 0 && at !== endedFor;
  }
  function farewellMs() {
    return Math.round((Number(ctx.settings.farewellMinutes) || 3) * 60000);
  }
  // Nếu bắt đầu khoá tụng lúc t thì có kịp tụng trọn & còn thời gian chào không?
  function chantWouldBeCut(t) {
    return endActive() && endAt() - t < chantBudgetMs() + farewellMs() + 60000;
  }

  function checkEnd() {
    if (disposed) return;
    if (!endActive()) {
      if (endStage === 'scheduled' || endStage === 'farewell') {
        endStage = null;
        ctx.scheduleStateBroadcast();
      }
      return;
    }
    const at = endAt();
    const now = Date.now();
    if (endStage !== 'farewell') {
      if (endStage !== 'scheduled') {
        endStage = 'scheduled';
        ctx.scheduleStateBroadcast();
      }
      // Đang nghe pháp mà tới giờ báo kết thúc: dừng bài pháp, sang Dâng hương để chào mọi người
      if (now >= at - farewellMs() && phase && phase.id === 'dharma') enterPhase('gather');
      if (now < at - farewellMs() || !offeringTime()) return;
      endStage = 'farewell';
      farewellStartedAt = now;
      clearAnnounceTimers(); // không báo "sắp tụng kinh" nữa
      announce(pickFarewell()(Math.max(1, Math.round((at - now) / 60000))));
      ctx.emitEvent({ type: 'liveEnding', at });
      ctx.scheduleStateBroadcast();
      return;
    }
    const due = now >= Math.max(at, farewellStartedAt + 60000);
    if (due) speechQueue.length = 0; // tới giờ: không nhận đọc lời chúc mới, đọc xong câu đang dở là chào
    if (due && ((!speaking && !announceQueue.length) || now >= at + 90000)) finishLive(at);
  }

  function finishLive(at) {
    endedFor = at;
    endStage = 'ended';
    clearTimeout(phaseTimer);
    clearAnnounceTimers();
    speechQueue.length = 0;
    phase = { id: 'ended', title: 'Viên mãn', subtitle: 'Buổi tụng kinh hôm nay đã viên mãn — hẹn gặp lại', startedAt: Date.now(), cues: [], durationMs: 0, sessionSutra: null };
    ctx.broadcast('chant.phase', { phase, serverNow: Date.now(), nextUp: nextUp() });
    announce(pickGoodbye());
    ctx.emitEvent({ type: 'liveEnded', at });
    ctx.save();
    ctx.scheduleStateBroadcast();
    obsResult = null;
    if (ctx.settings.obsAutoStop) {
      // Đợi lời chào đọc xong & khán giả kịp xem màn hình viên mãn rồi mới dừng phát
      clearTimeout(obsStopTimer);
      obsStopTimer = setTimeout(() => {
        obs.stopStream()
          .then((r) => { obsResult = { ok: true, note: r.note || 'Đã dừng phát trong OBS' }; })
          .catch((err) => { obsResult = { ok: false, note: err.message }; console.warn(`[chanting ${ctx.roomId}] Không dừng được OBS:`, err.message); })
          .finally(() => ctx.scheduleStateBroadcast());
      }, 45000);
    }
  }

  const endTimer = setInterval(checkEnd, 3000);

  // ------------------------------------------------------------------------
  // Lời dẫn chuyển chế độ: sau kết chuông (sang dâng hương), báo trước 1 phút, và ngay trước khi vào khoá tụng
  // ------------------------------------------------------------------------
  const pickAnnouncement = createAnnouncer();
  let announceTimers = [];
  function clearAnnounceTimers() {
    announceTimers.forEach(clearTimeout);
    announceTimers = [];
  }
  function scheduleTransitionSpeech(prevId) {
    if (ctx.settings.speakTransitions === false) return;
    const dur = phase.durationMs;
    const fromChant = prevId && PHASE_ORDER.includes(prevId) && prevId !== 'gather';
    if (fromChant) {
      announceTimers.push(setTimeout(() => {
        announce(pickAnnouncement('toOffering'));
        if (roomMode() === 'auto' && !chantWouldBeCut(phase.startedAt + dur)) announce(nextSessionLine(dur / 60000));
      }, 1500));
    }
    if (roomMode() !== 'auto') return; // điều phối tay: không biết lúc nào vào khoá tụng
    if (chantWouldBeCut(phase.startedAt + dur) || endStage === 'farewell') return; // sắp tắt live: không vào khoá tụng nữa
    if (dur >= 150000) announceTimers.push(setTimeout(() => announce(pickAnnouncement('soon')), dur - 75000));
    if (dur >= 50000) announceTimers.push(setTimeout(() => announce(pickAnnouncement('toChant')), dur - 38000));
  }

  function pauseRoom() {
    clearTimeout(phaseTimer);
    resumeTo = phase && phase.id !== 'paused' && phase.id !== 'ended' ? phase.id : resumeTo;
    paused = true;
    phase = { id: 'paused', title: 'Tạm dừng', subtitle: 'Người trực đã tạm dừng thời khoá', startedAt: Date.now(), cues: [], durationMs: 0, sessionSutra: null };
    ctx.broadcast('chant.phase', { phase, serverNow: Date.now(), nextUp: nextUp() });
    ctx.scheduleStateBroadcast();
  }

  // ------------------------------------------------------------------------
  // Giọng đọc (ZeroTTS). Mặc định: ĐỌC TỰ NHIÊN cả câu với nhịp bình thường — mốc thời gian lấy theo độ dài
  // thật của từng câu. Tuỳ chọn "đọc từng chữ": mỗi chữ đặt lên một nhịp mõ (ZeroTTS không chỉnh được tốc độ).
  // Chuẩn bị trước toàn bộ câu / chữ của các bài, lưu cache đĩa.
  // ------------------------------------------------------------------------
  function readerVoice() {
    return ctx.settings.readerVoice || ctx.settings.ttsVoice || 'maichi';
  }

  function syllableKey(w) {
    return String(w).toLowerCase().replace(/[.,;:!?“”"()…]/g, '').trim();
  }

  function allTextLines() {
    return readerBlocks().flatMap((b) => b.lines);
  }

  // Mọi đoạn có thể được đọc, cùng cách ngắt câu như khi dựng phase
  function readerBlocks() {
    const rep = (line) => toLines({ repeat: { line, times: 1 } });
    const out = [];
    const inc = toLines(LITURGY.incense);
    out.push({ lines: inc, opts: { breaks: [inc.length - 1] } });
    out.push({ lines: toLines(LITURGY.opening), opts: {} });
    const ded = toLines(LITURGY.dedication);
    out.push({ lines: ded, opts: { breaks: [1, ded.length - 1] } });
    for (const sut of SUTRAS) {
      if (sut.invocation !== null) out.push({ lines: rep(sut.invocation || DEFAULT_INVOCATION), opts: { single: true } });
      const ls = toLines(sut);
      out.push({ lines: ls, opts: sut.style === 'bow' ? { breaks: ls.map((_, i) => i).filter((i) => i % 2 === 1) } : {} });
    }
    out.push({ lines: rep(RECITATION_LINE), opts: { single: true } });
    out.push({ lines: rep(DEFAULT_INVOCATION), opts: { single: true } });
    return out;
  }

  function allSentences() {
    const set = new Set();
    for (const b of readerBlocks()) for (const g of groupLines(b.lines, b.opts)) set.add(groupText(b.lines, g));
    return [...set];
  }

  // Độ dài file WAV (đọc header) — kết quả lấy từ cache không kèm durationSec
  function wavDurationMs(url) {
    try {
      const file = path.join(TTS_CACHE_DIR, path.basename(String(url)));
      const buf = fs.readFileSync(file);
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

  async function waitForTts() {
    while (!ctx.tts.ready && !disposed) await new Promise((r) => setTimeout(r, 5000));
  }

  async function prepareReader() {
    if (readerPreparing || !ctx.tts) return;
    readerPreparing = true;
    try {
      const voice = readerVoice();
      if (naturalReader()) {
        for (const text of allSentences()) {
          if (disposed) break;
          const key = `${voice}::${text}`;
          if (lineClips.has(key)) continue;
          await waitForTts();
          const res = await ctx.tts.synthesize(text, voice);
          if (res && res.ok && res.url) {
            const durMs = res.durationSec ? Math.round(res.durationSec * 1000) : wavDurationMs(res.url);
            if (durMs) lineClips.set(key, { url: res.url, durMs });
          }
        }
      } else {
        const words = [...new Set(allTextLines().flat().map(syllableKey).filter(Boolean))];
        for (const w of words) {
          if (disposed) break;
          const key = `${voice}::${w}`;
          if (readerClips.has(key)) continue;
          await waitForTts();
          const res = await ctx.tts.synthesize(w, voice);
          if (res && res.ok && res.url) readerClips.set(key, res.url);
        }
      }
    } catch (err) {
      console.warn('[Chanting] Chuẩn bị giọng đọc lỗi:', err.message);
    } finally {
      readerPreparing = false;
    }
  }

  function attachReader(p) {
    if (!p.text || ctx.settings.readerEnabled === false) return;
    const voice = readerVoice();
    if (naturalReader()) {
      // Chỉ phát giọng khi phase đã được dựng theo độ dài câu thật
      if (p.voicePlan) p.reader = { mode: 'line', clips: p.voicePlan.clips, times: p.voicePlan.times };
      else prepareReader();
      delete p.voicePlan;
      return;
    }
    p.reader = {
      mode: 'syllable',
      clips: p.text.lines.flat().map((w) => readerClips.get(`${voice}::${syllableKey(w)}`) || null)
    };
    if (p.reader.clips.some((c) => !c)) prepareReader();
  }

  function readerStatus() {
    const voice = readerVoice();
    if (naturalReader()) {
      const keys = allSentences();
      const ready = keys.filter((k) => lineClips.has(`${voice}::${k}`)).length;
      return { voice, mode: 'natural', ready, total: keys.length, unit: 'câu', preparing: readerPreparing };
    }
    const words = [...new Set(allTextLines().flat().map(syllableKey).filter(Boolean))];
    const ready = words.filter((w) => readerClips.has(`${voice}::${w}`)).length;
    return { voice, mode: 'syllable', ready, total: words.length, unit: 'chữ', preparing: readerPreparing };
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

  // Lời chúc khi dâng hương: rút ngẫu nhiên từ bộ 100 câu chúc chung (sức khoẻ, bình an, công việc, may mắn…)
  const nextWish = createWishBag();

  function flushThanks() {
    thanksTimer = null;
    if (thanksBuffer.size === 0) return;
    const items = [...thanksBuffer.values()];
    thanksBuffer = new Map();
    const names = items.map((i) => i.name);
    ctx.broadcast('chant.activity', { kind: 'thanks', names, items: items.slice(0, 8), counters });
    // Đọc tên + lời chúc riêng cho 2 người đầu; nhiều hơn thì cảm ơn chung kèm một lời chúc
    const spoken = items.map((i) => ({ ...i, say: speakName(i.name) })).filter((i) => i.say);
    spoken.slice(0, 2).forEach((i) => enqueueSpeech(`Cảm ơn ${i.say} đã ${i.offering}. ${nextWish()}`));
    const rest = spoken.slice(2);
    if (rest.length) {
      const shown = rest.slice(0, 3).map((i) => i.say).join(', ');
      const more = rest.length - 3;
      enqueueSpeech(`Cảm ơn ${shown}${more > 0 ? ` và ${more} bạn` : ''} đã dâng lễ cùng đạo tràng. ${nextWish()}`);
    }
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
      checkAura(person);
      scheduleMerit();
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

    // "thắp nhang" / "thắp hương" / "dâng hương": phật tử bước lên thảm đỏ, dâng hương trước Phật rồi về chỗ
    if (INCENSE_RE.test(raw) || /🔥/u.test(raw)) {
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
    const sincere = Boolean(wish) && isSincere(wish);
    if (sincere) enqueueSpeech(`${speakName(person.name)}: ${wish}`);
    return ctx.emitEvent({
      type: 'wish',
      sincere,
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

  const giftFocusAt = new Map();
  function handleGift(user, evt = {}) {
    const person = seatAndAnnounce(user);
    const offering = giftOffering(evt);
    thanksBuffer.set(person.key, { name: person.name, offering: offering.text });
    if (!thanksTimer) thanksTimer = setTimeout(flushThanks, THANKS_FLUSH_MS);
    if (person.stat) {
      person.stat.gifts = (person.stat.gifts || 0) + 1;
      scheduleMerit();
    }
    const firstLamp = !sessionLamps.has(person.key); // đèn sen: mỗi người 1 đèn mỗi khoá
    if (firstLamp) {
      sessionLamps.add(person.key);
      counters.lamps += 1;
      if (person.stat) person.stat.lamps += 1;
      // Quà cũng là 1 phiếu chọn kinh (như một bình luận), chỉ khi người đó chưa đề nghị bài nào
      const giftKey = String(evt.giftId || evt.giftName || 'gift');
      addVote(person.key, 1 + hashIndex(giftKey, SUTRAS.length), { replace: false });
    }
    // Quà nhỏ: lễ vật bay lên cùng tên (mỗi người tối đa 1 lần / 4 giây). Quà lớn: camera cận cảnh +
    // màn dâng hương riêng của món đó (mỗi người tối đa 1 lần / 20 giây để không bị lặp khi tặng liên tục)
    const small = isSmallGift(evt);
    const now = Date.now();
    const gap = small ? 4000 : GIFT_FOCUS_MS;
    if (!firstLamp && now - (giftFocusAt.get(person.key) || 0) < gap) return null;
    giftFocusAt.set(person.key, now);
    if (giftFocusAt.size > 2000) giftFocusAt.delete(giftFocusAt.keys().next().value);
    return ctx.emitEvent({
      type: 'lamp',
      key: person.key,
      user: person.name,
      avatar: person.avatar,
      slot: person.slot,
      symbol: offering.icon,
      offering: offering.text,
      cat: offering.cat,
      img: offering.img,
      small,
      tier: auraTier(person),
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

  // ------------------------------------------------------------------------
  // Giả lập người xem (sim.js) — chỉ dùng khi chưa live
  // ------------------------------------------------------------------------
  let simSnapshot = null;
  const simulator = createSimulator({
    seat: (u) => {
      seatAndAnnounce(u);
      ctx.scheduleStateBroadcast();
    },
    like: (u, n) => handleLike(u, n),
    comment: (u, text) => handleComment(u, text),
    gift: (u, evt) => handleGift(u, evt),
    invite: (u) => handleInvite(u),
    phase: () => phase,
    seatedSimKeys: () => slots.filter((k) => k && k.startsWith(SIM_PREFIX)),
    simulated: (fn) => (ctx.simulated ? ctx.simulated(fn) : fn())
  });

  function clearSimPeople() {
    let removed = 0;
    for (const [key, p] of [...people]) {
      if (!key.startsWith(SIM_PREFIX)) continue;
      if (p.slot >= 0 && slots[p.slot] === key) slots[p.slot] = null;
      people.delete(key);
      dayStats.delete(key);
      sessionNames.delete(key);
      votes.delete(key);
      sessionLamps.delete(key);
      sessionInvites.delete(key);
      commentCooldown.delete(key);
      incenseCooldown.delete(key);
      chantBuffer.delete(key);
      participantHashes.delete(hashKey(key));
      removed++;
    }
    if (simSnapshot) counters = { ...simSnapshot };
    simSnapshot = null;
    if (removed) {
      ctx.save();
      ctx.broadcastState();
    }
    return removed;
  }

  // ------------------------------------------------------------------------
  // Phật tử nền: khi phòng còn vắng (mới mở live), vài phật tử không tên ngồi sẵn trong chánh điện
  // và thỉnh thoảng lên dâng hương cho cảnh không trống. Không phải người xem: không tên, không bình luận,
  // không thả tim, không tính vào số người / lượt dâng hương / bảng tinh tấn. Người xem thật vào tới đâu
  // thì phật tử nền lui ra tới đó.
  // ------------------------------------------------------------------------
  const AMBIENT_PREFIX = 'amb_';
  const isAmbient = (key) => typeof key === 'string' && key.startsWith(AMBIENT_PREFIX);
  let ambientWalkTimer = null;

  function ambientTarget() {
    const want = Math.max(0, Math.min(12, Number(ctx.settings.ambientCount ?? 6) || 0));
    const real = slots.filter((k) => k && !isAmbient(k)).length;
    return Math.max(0, want - real);
  }

  function syncAmbient() {
    if (disposed) return;
    for (const [k, p] of people) if (isAmbient(k) && p.slot < 0) people.delete(k); // bị người xem thật nhường chỗ
    const seated = slots.filter(isAmbient);
    const target = endStage === 'ended' ? 0 : ambientTarget();
    let changed = false;
    // Thêm dần từng người (không hiện cả nhóm cùng lúc)
    if (seated.length < target) {
      let i = 0;
      while (people.has(`${AMBIENT_PREFIX}${i}`)) i++;
      const person = { key: `${AMBIENT_PREFIX}${i}`, name: '', avatar: '', ambient: true, lastActive: Date.now(), lastLike: 0, slot: -1, gender: i % 2 ? 'm' : 'f' };
      people.set(person.key, person);
      assignSlot(person);
      changed = true;
    } else if (seated.length > target) {
      const key = seated[seated.length - 1];
      const p = people.get(key);
      if (p && p.slot >= 0 && slots[p.slot] === key) slots[p.slot] = null;
      people.delete(key);
      changed = true;
    }
    if (changed) ctx.scheduleStateBroadcast();
  }

  function ambientWalk() {
    clearTimeout(ambientWalkTimer);
    if (disposed) return;
    const keys = slots.filter(isAmbient);
    if (keys.length && endStage !== 'ended') {
      const p = people.get(keys[Math.floor(Math.random() * keys.length)]);
      if (p) ctx.broadcast('chant.activity', { kind: 'ambientIncense', slot: p.slot, key: p.key, gender: p.gender });
    }
    // Phòng càng vắng càng hay có người lên (40–100 giây một lượt)
    ambientWalkTimer = setTimeout(ambientWalk, 40000 + Math.random() * 60000);
  }

  const ambientTimer = setInterval(syncAmbient, 6000);
  ambientWalkTimer = setTimeout(ambientWalk, 15000);

  function testUser(params = {}) {
    const name = params.user || 'Người thử';
    return { user: name, uniqueId: params.uniqueId || `test_${name}`, avatar: params.avatar || '' };
  }

  // ------------------------------------------------------------------------
  // Khởi động
  // ------------------------------------------------------------------------
  // Tổng hợp sẵn mọi lời dẫn (lưu cache đĩa) để tới giờ chuyển chế độ là đọc được ngay
  async function warmAnnouncements() {
    const texts = [...Object.values(ANNOUNCE).flat(), nextSessionLine(offeringMs() / 60000)];
    for (const t of texts) {
      for (const chunk of splitForSpeech(t)) {
        if (disposed) return;
        await waitForTts();
        await ctx.tts.synthesize(chunk, readerVoice()).catch(() => null);
      }
    }
  }

  setImmediate(() => {
    enterPhase('gather');
    if (ctx.settings.readerEnabled !== false) prepareReader();
    if (ctx.tts && ctx.settings.speakTransitions !== false) setTimeout(() => warmAnnouncements().catch(() => {}), 20000);
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
      dharmaNext() {
        if (!talkList().length) throw new Error('Chưa có bài pháp nào trong danh sách');
        dharmaIdx += 1;
        enterPhase('dharma');
        return { ok: true, talk: phase.talk ? phase.talk.title : null };
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
        const st = readerStatus();
        if (st.ready < st.total) prepareReader();
        return st;
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
      // Thử cảnh lên thảm đỏ dâng hương (bỏ qua giới hạn 3 phút/người của bình luận thật)
      // Đọc thử lời dẫn (soon | toChant | toOffering)
      announceTest(params = {}) {
        const kind = ['soon', 'toChant', 'toOffering'].includes(params.kind) ? params.kind : 'toChant';
        announce(pickAnnouncement(kind));
        if (kind === 'toOffering') announce(nextSessionLine(offeringMs() / 60000));
        return { ok: true };
      },
      // Chào & tắt ngay: đọc lời báo, sau đúng số phút "báo trước" thì kết thúc
      endSoon() {
        const at = Date.now() + farewellMs();
        ctx.updateSettings({ liveEndAt: at });
        return { ok: true, at };
      },
      obsTest() {
        return obs.test();
      },
      // Hiện đường chạy ngang ngay một lượt (người trực bấm trong lúc live)
      showMarquee() {
        ctx.broadcast('chant.activity', { kind: 'marquee' });
        return { ok: true };
      },
      testIncense(params) {
        const u = testUser(params);
        const person = seatAndAnnounce(u);
        incenseCooldown.delete(person.key);
        return handleComment(u, 'dâng hương') || { ok: true };
      },
      testLike(params) {
        handleLike(testUser(params), 5);
        return { ok: true };
      },
      testGift(params) {
        // Không chỉ định quà: chọn ngẫu nhiên một món để xem đủ các loại lễ vật & hiệu ứng
        const names = Object.keys(OFFERINGS);
        const giftName = params.giftName || names[Math.floor(Math.random() * names.length)];
        return handleGift(testUser(params), { giftName }) || { ok: true, note: 'Người này vừa dâng lễ — camera cận cảnh mỗi người tối đa 1 lần / 20 giây' };
      }
    },

    simulate() {
      simulator.tick({
        intervalMs: Number(ctx.settings.autoSimIntervalMs) || 9500,
        level: ctx.settings.simLevel,
        crowd: Math.max(10, Math.min(SEAT_COUNT, Number(ctx.settings.simCrowd) || 200))
      });
    },

    // Bật giả lập: chụp lại bộ đếm thật. Tắt: dọn hết người giả lập và trả bộ đếm như cũ.
    onAutoSimChange(enabled) {
      if (enabled) {
        if (!simSnapshot) simSnapshot = { ...counters };
        return;
      }
      simulator.stop();
      clearSimPeople();
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
        merit: topMerit(),
        ending: endStage ? { stage: endStage, at: endAt() || endedFor, farewellMinutes: farewellMs() / 60000, obs: obsResult } : null,
        schedule: {
          mode: !phase || phase.id === 'gather' || phase.id === 'paused' ? 'offering' : 'chanting',
          offeringMinutes: offeringMs() / 60000,
          chantMinutes: chantBudgetMs() / 60000,
          chantBlockStart
        },
        catalog: SUTRAS.map(sutraSummary),
        // Cho trang admin: danh sách người đang ngồi trong đạo tràng (không xếp hạng)
        leaderboard: seats
          .filter((s) => !s.ambient)
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
      clearInterval(ambientTimer);
      clearTimeout(welcomeFlushTimer);
      autoIncenseTimers.forEach(clearTimeout);
      clearTimeout(ambientWalkTimer);
      clearAnnounceTimers();
      clearInterval(endTimer);
      clearTimeout(obsStopTimer);
      clearTimeout(meritTimer);
      simulator.stop();
      clearTimeout(phaseTimer);
      clearTimeout(chantFlushTimer);
      clearTimeout(thanksTimer);
      clearTimeout(bellWindowTimer);
    },

    onSettingsChanged(changed) {
      if ('readerVoice' in changed || 'readerEnabled' in changed || 'readerStyle' in changed) prepareReader();
      // Bật lại chạy tự động khi đang tụ hội: bắt đầu đếm giờ tụ hội
      if (changed.autoRun === true && phase && phase.id === 'gather') enterPhase('gather');
      // Đổi chế độ phòng: chuyển ngay
      if ('roomMode' in changed && phase && phase.id !== 'ended') {
        const chanting = PHASE_ORDER.includes(phase.id) && phase.id !== 'gather';
        if (changed.roomMode === 'dharma') { if (phase.id !== 'dharma') enterPhase('dharma'); }
        else if (phase.id === 'dharma' && changed.roomMode !== 'chant') enterPhase('gather');
        else if (changed.roomMode === 'offering' && phase.id !== 'gather') enterPhase('gather');
        else if (changed.roomMode === 'chant' && !chanting) { currentSutra = null; enterPhase('bell_open'); }
        else if (phase.id === 'gather') enterPhase('gather'); // tính lại giờ Dâng hương
      }
      // Đổi / huỷ giờ hẹn tắt live: tính lại ngay
      // Sửa danh sách bài pháp: bài đang phát không còn trong danh sách thì phát bài khác
      // Đổi cách ghi tiêu đề: dựng lại bước đang phát, giữ nguyên vị trí bài
      if ('dharmaLabel' in changed && phase && phase.id === 'dharma' && phase.talk) {
        const t = currentTalk();
        if (t) {
          phase = { ...phase, talk: t, title: t.kind === 'kinh' ? 'Nghe tụng kinh' : 'Nghe pháp' };
          ctx.broadcast('chant.phase', { phase, serverNow: Date.now(), nextUp: nextUp() });
          ctx.scheduleStateBroadcast();
        }
      }
      if ('dharmaList' in changed && phase && phase.id === 'dharma' && (!phase.talk || !talkList().includes(phase.talk.track))) enterPhase('dharma');
      if ('liveEndAt' in changed) {
        if (endStage === 'farewell' || endStage === 'scheduled') endStage = null;
        if (!changed.liveEndAt) clearTimeout(obsStopTimer);
        // Đang ở lại Dâng hương chờ tắt mà huỷ hẹn: chạy lịch như thường
        if (phase && phase.id === 'gather' && !chantWouldBeCut(Date.now())) {
          clearTimeout(phaseTimer);
          const left = Math.max(5000, phase.startedAt + phase.durationMs - Date.now());
          phaseTimer = setTimeout(() => advanceFrom('gather'), left);
        }
        checkEnd();
      }
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
    offeringMinutes: [1, 120],
    chantMinutes: [5, 180],
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
    presetMusicOn: 'boolean', // nhạc thiền tự tạo
    fileMusicOn: 'boolean', // nhạc YouTube / file
    fileMusicVolume: [0, 1],
    showRhythmGuide: 'boolean',
    commentDisplay: { type: 'enum', values: ['head', 'lantern', 'both'] },
    readerStyle: { type: 'enum', values: ['natural', 'syllable'] },
    simLevel: { type: 'enum', values: Object.keys(SIM_LEVELS) },
    simCrowd: [10, SEAT_COUNT],
    cameraFollow: 'boolean',
    speakWishes: 'boolean',
    speakTransitions: 'boolean',
    showMeritBoard: 'boolean',
    showFeedPanel: 'boolean',
    showStats: 'boolean',
    showTicker: 'boolean',
    marqueeMode: { type: 'enum', values: ['interval', 'always', 'off'] },
    marqueeEveryMin: [1, 30],
    uiOpacity: [20, 100],
    fxLevel: { type: 'enum', values: ['off', 'light', 'normal', 'rich'] },
    musicTrack: 'track', // nhạc nền lúc DÂNG HƯƠNG
    musicTrackChant: 'track', // nhạc nền lúc TỤNG KINH ("preset:none" = chỉ tiếng pháp)
    roomMode: { type: 'enum', values: ['auto', 'offering', 'chant', 'dharma'] },
    dharmaList: 'trackList', // bài pháp cho chế độ Nghe pháp
    dharmaVolume: [0, 1],
    dharmaLabel: { type: 'enum', values: ['auto', 'kinh', 'phap'] }, // tiêu đề: tự đoán | Nghe tụng kinh | Nghe pháp
    autoIncenseBelow: [0, 100000], // dưới số người xem này: người mới vào tự lên dâng hương (0 = tắt)
    welcomeEachBelow: [0, 100000], // dưới số người xem này: chào từng người vào (0 = tắt)
    ambientCount: [0, 12], // phật tử nền khi phòng vắng (0 = tắt)
    musicPlayMode: { type: 'enum', values: ['single', 'list', 'shuffle'] }, // lặp 1 bài | lần lượt theo danh sách | ngẫu nhiên
    musicList: 'trackList', // danh sách phát lúc DÂNG HƯƠNG
    musicListChant: 'trackList', // danh sách phát lúc TỤNG KINH
    musicPresetMinutes: [3, 60], // nhạc thiền tự tạo trong danh sách: phát bao nhiêu phút rồi sang bài
    liveEndAt: [0, 4102444800000], // giờ hẹn tắt live (mốc thời gian ms, 0 = không hẹn)
    farewellMinutes: [1, 15], // báo trước bao nhiêu phút
    obsAutoStop: 'boolean', // tới giờ: tự dừng phát trong OBS (obs-websocket)
    cameraZoom: [120, 400],
    lineGapMs: [200, 3000],
    vietMoStyle: { type: 'enum', values: ['syllable', 'line'] },
    rotation: { type: 'intList', min: 1, maxValue: 9, max: 30 }
  },
  defaultSettings: {
    ttsEnabled: false,
    bpm: 90,
    gatherSeconds: 90,
    offeringMinutes: 5,
    chantMinutes: 20,
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
    presetMusicOn: true,
    fileMusicOn: true,
    fileMusicVolume: 0.45,
    showRhythmGuide: true,
    commentDisplay: 'head',
    readerStyle: 'natural',
    simLevel: 'busy',
    simCrowd: 200,
    cameraFollow: true,
    speakWishes: true,
    speakTransitions: true,
    showMeritBoard: true,
    showFeedPanel: true,
    showStats: true,
    showTicker: true,
    marqueeMode: 'interval',
    marqueeEveryMin: 5,
    uiOpacity: 55,
    fxLevel: 'normal',
    musicTrack: 'preset:still',
    musicTrackChant: 'preset:breath',
    musicPlayMode: 'single',
    ambientCount: 6,
    welcomeEachBelow: 50,
    autoIncenseBelow: 30,
    musicList: [],
    musicListChant: [],
    dharmaList: [],
    dharmaVolume: 0.9,
    dharmaLabel: 'auto',
    musicPresetMinutes: 10,
    liveEndAt: 0,
    farewellMinutes: 3,
    obsAutoStop: false,
    cameraZoom: 300,
    lineGapMs: 700,
    rotation: [1, 2, 3, 5, 6, 4, 8, 1, 2, 9, 3, 7]
  },
  create
};
