const { FORTUNE_DECK } = require('./fortunes');
const { isBlockedSpamOrToxic, sanitizeUserName, sanitizeWishText, keywordRegex } = require('../../util/sanitize');

// ============================================================================
// CHẾ ĐỘ "ĐI CHÙA" — Chánh Điện Đức Phật A Di Đà (thắp hương, cầu phúc, xin xăm, gõ mõ, thỉnh chuông)
// ============================================================================

const DEFAULT_TOTALS = {
  totalIncense: 108,
  totalMerit: 1080,
  woodenFishHits: 360,
  bellRings: 36,
  lanternCount: 18,
  fortuneCount: 12,
  activeIncenseSticks: 9,
  offerings: { lotus: 3, fruit: 2, lamp: 2, dragon: 1 }
};

const GIFT_LABELS = {
  lotus: 'Đài Hoa Sen Vàng',
  fruit: 'Mâm Ngũ Quả Cát Tường',
  lamp: 'Đèn Lưu Ly Trí Tuệ',
  dragon: 'Đại Lễ Kim Long Chầu Phật'
};

// Người xem quen gõ "xin xăm / gieo quẻ"; kết quả trả về là Thẻ Thơ Thiền (không phải quẻ bói)
const FORTUNE_KEYWORDS_RE = keywordRegex([
  'thẻ thơ', 'the tho', 'rút thẻ', 'rut the',
  'xin xăm', 'xin xam', 'gieo quẻ', 'gieo que', 'rút quẻ', 'rut que', 'xin quẻ', 'xin que', 'quẻ', 'xăm'
]);
const BELL_KEYWORDS_RE = keywordRegex(['chuông', 'chuong']);
const WOODFISH_KEYWORDS_RE = keywordRegex(['gõ mõ', 'go mo', 'tụng kinh', 'tung kinh']);
const INCENSE_KEYWORDS_RE = keywordRegex(['thắp hương', 'thap huong', 'dâng hương', 'dang huong', 'bái phật', 'bai phat', 'lạy phật', 'lay phat']);
const PRAYER_KEYWORDS_RE = keywordRegex([
  'cầu', 'cau', 'nguyện', 'nguyen', 'nam mô', 'nam mo', 'mô phật', 'mo phat',
  'a di đà', 'a di da', 'bình an', 'binh an', 'tài lộc', 'tai loc', 'chúc', 'chuc'
]);

const SIM_DEVOTEES = [
  { user: 'Ngọc Anh Nguyễn', uniqueId: 'ngocanh.98', wish: 'Con thành tâm cầu cho bố mẹ luôn mạnh khỏe, bình an' },
  { user: 'Trần Minh Quân', uniqueId: 'minhquan_bds', wish: 'Cầu tháng mới công việc thuận buồm xuôi gió, tài lộc hanh thông' },
  { user: 'Diệu Thảo Tâm An', uniqueId: 'tam_an_99', wish: 'Nam Mô A Di Đà Phật, nguyện cầu thế giới hòa bình chúng sinh an lạc' },
  { user: 'Lê Hoàng Nam', uniqueId: 'hoangnam.dev', wish: 'Cầu thi cử đỗ đạt điểm cao, sự nghiệp rộng mở' },
  { user: 'Phạm Thanh Hà', uniqueId: 'thanhha.lotus', wish: 'Cầu gia đạo êm ấm, con cái ngoan ngoãn học giỏi' },
  { user: 'Vũ Đức Thịnh', uniqueId: 'ducthinh88', wish: 'Xin rút một thẻ thơ để chiêm nghiệm đầu năm' }
];

const COMMENT_COOLDOWN_MS = 3500;

function create(ctx, saved = {}) {
  const totals = {
    ...DEFAULT_TOTALS,
    ...pickNumbers(saved, Object.keys(DEFAULT_TOTALS)),
    offerings: { ...DEFAULT_TOTALS.offerings, ...(saved.offerings || {}) }
  };
  const commentCooldown = new Map();

  function who(params) {
    return { user: params.user, uniqueId: params.uniqueId || '', avatar: params.avatar || '' };
  }

  // Ghi điểm tri ân cho người xem + cộng vào tổng điểm của phòng (lưu trong trường totalMerit để tương thích dữ liệu cũ)
  function addMerit(params, merit, { incense = 0, gifts = 0, note = '' } = {}) {
    const dev = ctx.board.record(who(params), { points: merit, stats: { incense, gifts }, note });
    totals.totalMerit += merit;
    return dev;
  }

  function devoteeFields(dev) {
    return { user: dev.name, uniqueId: dev.uniqueId, avatar: dev.avatar };
  }

  function haloIntensity() {
    return Math.min(1.0, 0.35 + (totals.totalMerit % 1000) / 1400);
  }

  // --------------------------------------------------------------------------
  // NGHI THỨC TƯƠNG TÁC (RITUAL HANDLERS)
  // --------------------------------------------------------------------------
  const rituals = {
    burnIncense(params = {}) {
      const count = Math.max(1, Math.min(9, Number(params.count) || 3));
      const wish = sanitizeWishText(params.wish) || 'Thành tâm dâng hương bái Phật, cầu bình an cát tường';
      const merit = count * 5;

      totals.totalIncense += count;
      totals.activeIncenseSticks = Math.min(36, totals.activeIncenseSticks + count);
      const dev = addMerit(params, merit, { incense: count, note: wish });

      const ttsText = params.readTts === false
        ? ''
        : `Nam mô A Di Đà Phật. Cảm tạ thí chủ ${dev.name} đã thành tâm thắp ${count} nén hương thơm. ${wish}.`;

      return ctx.emitEvent({ type: 'burnIncense', ...devoteeFields(dev), count, merit, wish, ttsText });
    },

    strikeWoodenFish(params = {}) {
      const count = Math.max(1, Math.min(50, Number(params.count) || 1));
      totals.woodenFishHits += count;
      const dev = addMerit(params, count);
      return ctx.emitEvent({
        type: 'strikeWoodenFish',
        ...devoteeFields(dev),
        count,
        merit: count,
        ttsText: params.ttsText ? String(params.ttsText).slice(0, 300) : ''
      });
    },

    ringBell(params = {}) {
      const count = Math.max(1, Math.min(9, Number(params.count) || 1));
      const wish = sanitizeWishText(params.wish) || 'Thỉnh chuông Bát Nhã, phiền não tiêu tan, trí tuệ sáng ngời';
      const merit = count * 10;

      totals.bellRings += count;
      const dev = addMerit(params, merit, { note: wish });
      const ttsText = params.readTts ? `Thí chủ ${dev.name} thỉnh Đại Hồng Chung cầu nguyện: ${wish}.` : '';
      return ctx.emitEvent({ type: 'ringBell', ...devoteeFields(dev), count, merit, wish, ttsText });
    },

    sendPrayer(params = {}) {
      const wish = sanitizeWishText(params.wish) || 'Cầu cho quốc thái dân an, gia đình mạnh khỏe hạnh phúc';
      const merit = 10;

      totals.lanternCount += 1;
      const dev = addMerit(params, merit, { incense: 1, note: wish });
      const ttsText = params.readTts === false
        ? ''
        : `Lời cầu nguyện của thí chủ ${dev.name}: ${wish}. Nam mô A Di Đà Phật.`;
      return ctx.emitEvent({ type: 'sendPrayer', ...devoteeFields(dev), wish, merit, ttsText });
    },

    offerGift(params = {}) {
      const coins = Math.max(1, Number(params.coins) || 10);
      const giftType = Object.prototype.hasOwnProperty.call(GIFT_LABELS, params.giftType)
        ? params.giftType
        : coins >= 100 ? 'dragon' : coins >= 20 ? 'fruit' : coins >= 5 ? 'lamp' : 'lotus';
      const giftName = sanitizeWishText(params.giftName) || GIFT_LABELS[giftType];
      const multiplier = coins >= 100 ? 50 : coins >= 10 ? 30 : 20;
      const merit = Math.max(20, coins * multiplier);

      totals.offerings[giftType] = (totals.offerings[giftType] || 0) + 1;
      totals.totalIncense += 3;
      totals.activeIncenseSticks = Math.min(36, totals.activeIncenseSticks + 3);

      const wish = sanitizeWishText(params.wish) || `Gửi tặng ${giftName}`;
      const dev = addMerit(params, merit, { incense: 3, gifts: 1, note: wish });
      // Lời cảm ơn trung tính: quà tặng là tự nguyện, KHÔNG đổi lấy công đức / phù hộ / may mắn
      // (tránh "gift baiting" theo chính sách TikTok và nội dung mê tín theo pháp luật Việt Nam)
      const ttsText = params.readTts === false
        ? ''
        : `Cảm ơn ${dev.name} đã gửi tặng ${giftName}. Chúc bạn một ngày bình an.`;

      return ctx.emitEvent({
        type: giftType === 'dragon' ? 'grandCeremony' : 'offerGift',
        ...devoteeFields(dev),
        giftType,
        giftName,
        coins,
        merit,
        wish,
        ttsText
      });
    },

    drawFortune(params = {}) {
      const topic = sanitizeWishText(params.topic) || 'Chiêm nghiệm';
      const fortune = FORTUNE_DECK[Math.floor(Math.random() * FORTUNE_DECK.length)];
      const merit = 10;

      totals.fortuneCount += 1;
      const dev = addMerit(params, merit, { note: `Thẻ thơ số ${fortune.number} (${fortune.rank})` });
      const ttsText = params.readTts === false ? '' : `${dev.name} vừa rút được ${fortune.ttsSummary}`;
      return ctx.emitEvent({ type: 'drawFortune', ...devoteeFields(dev), topic, fortune, merit, ttsText });
    },

    grandCeremony(params = {}) {
      return rituals.offerGift({
        ...params,
        giftType: 'dragon',
        coins: Math.max(100, Number(params.coins) || 199),
        giftName: params.giftName || 'Đại Lễ Hào Quang Vạn Trượng'
      });
    },

    resetMerit() {
      Object.assign(totals, {
        totalIncense: 9,
        totalMerit: 0,
        woodenFishHits: 0,
        bellRings: 0,
        lanternCount: 0,
        fortuneCount: 0,
        activeIncenseSticks: 3,
        offerings: { lotus: 1, fruit: 1, lamp: 1, dragon: 0 }
      });
      ctx.board.reset();
      ctx.save();
      ctx.broadcastState();
      return { ok: true };
    }
  };

  // --------------------------------------------------------------------------
  // BÌNH LUẬN NGƯỜI XEM -> NGHI THỨC
  // --------------------------------------------------------------------------
  function handleComment({ user, text }) {
    const raw = String(text || '').trim();
    if (!raw || isBlockedSpamOrToxic(raw)) return null;
    const cleanWish = sanitizeWishText(raw);
    if (!cleanWish || cleanWish.length < 3) return null;

    // Chống 1 người spam bình luận liên tục làm nghẽn hàng đợi TTS
    const userKey = user.uniqueId || user.user || '';
    const now = Date.now();
    if (userKey) {
      if (now - (commentCooldown.get(userKey) || 0) < COMMENT_COOLDOWN_MS) return null;
      commentCooldown.delete(userKey);
      commentCooldown.set(userKey, now);
      if (commentCooldown.size > 600) commentCooldown.delete(commentCooldown.keys().next().value);
    }

    const params = { user: sanitizeUserName(user.user), uniqueId: user.uniqueId, avatar: user.avatar };
    const lower = cleanWish.toLowerCase();

    if (FORTUNE_KEYWORDS_RE.test(lower)) return rituals.drawFortune({ ...params, topic: cleanWish });
    if (BELL_KEYWORDS_RE.test(lower)) return rituals.ringBell({ ...params, count: 1, wish: cleanWish, readTts: true });
    if (WOODFISH_KEYWORDS_RE.test(lower)) return rituals.strikeWoodenFish({ ...params, count: 3 });
    if (INCENSE_KEYWORDS_RE.test(lower)) return rituals.burnIncense({ ...params, count: 3, wish: cleanWish });
    if (PRAYER_KEYWORDS_RE.test(lower)) return rituals.sendPrayer({ ...params, wish: cleanWish });
    return rituals.burnIncense({ ...params, count: 1, wish: cleanWish });
  }

  return {
    // Sự kiện chuẩn hoá từ TikTok (xem src/core/normalize.js)
    onEvent(evt) {
      const params = { user: evt.user?.user, uniqueId: evt.user?.uniqueId, avatar: evt.user?.avatar };
      switch (evt.type) {
        case 'chat':
          return handleComment(evt);
        case 'like':
          return rituals.strikeWoodenFish({ ...params, count: evt.count });
        case 'gift': {
          const giftName = evt.count > 1 ? `${evt.count}x ${evt.giftName}` : evt.giftName;
          return rituals.offerGift({
            ...params,
            coins: evt.coins,
            giftName,
            wish: `Gửi tặng ${giftName}`
          });
        }
        case 'follow':
        case 'share':
          return rituals.ringBell({
            ...params,
            count: 1,
            wish: 'Hữu duyên tương ngộ nơi cửa Phật, cầu bình an may mắn',
            readTts: false
          });
        case 'join':
          addMerit(params, 1, { note: 'Đã vào Chánh Điện lễ Phật' });
          ctx.save();
          ctx.scheduleStateBroadcast();
          return null;
        default:
          return null;
      }
    },

    // Lệnh JSON-RPC: temple.burnIncense, temple.drawFortune... (giữ nguyên tên cũ)
    rpc: rituals,

    simulate() {
      const pick = SIM_DEVOTEES[Math.floor(Math.random() * SIM_DEVOTEES.length)];
      const roll = Math.random();
      if (roll < 0.3) rituals.burnIncense({ ...pick, count: 3, wish: pick.wish });
      else if (roll < 0.55) rituals.sendPrayer({ ...pick, wish: pick.wish });
      else if (roll < 0.75) rituals.drawFortune({ ...pick, topic: pick.wish });
      else if (roll < 0.9) rituals.offerGift({ ...pick, giftType: 'lotus', coins: 15, giftName: 'Hoa Sen Vàng Tinh Khiết' });
      else rituals.ringBell({ ...pick, count: 1, wish: pick.wish, readTts: true });
    },

    getPublicState() {
      return {
        ...totals,
        haloIntensity: haloIntensity(),
        leaderboard: ctx.board.top(24).map((d, index) => ({
          rank: index + 1,
          name: d.name,
          uniqueId: d.uniqueId,
          avatar: d.avatar || '',
          merit: d.points,
          incense: d.stats.incense || 0,
          lastWish: d.lastNote || ''
        }))
      };
    },

    serialize() {
      return { ...totals };
    }
  };
}

function pickNumbers(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (typeof obj[k] === 'number' && Number.isFinite(obj[k])) out[k] = obj[k];
  }
  return out;
}

module.exports = {
  id: 'temple',
  name: 'Đi Chùa (bản cũ)',
  description: 'Chánh điện online: thắp hương, thả hoa đăng, rút thẻ thơ thiền, gõ mõ, thỉnh chuông, bảng tri ân',
  overlay: 'index.html',
  create
};
