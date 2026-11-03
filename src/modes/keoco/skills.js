/**
 * Kỹ năng Kéo Co (quà TikTok → kỹ năng). Quà là tuỳ chọn: hiệu ứng ngắn, có cách khắc chế (Găng tay keo chặn đòn tấn công),
 * không có giải thưởng tiền. Số liệu chi tiết: docs/keo-co.md.
 *   attack: true — đòn nhắm vào đội kia, bị Găng tay keo của đội kia chặn
 */
const { BY_GIFT_ID } = require('../redlight/items');

const SKILLS = {
  gong: {
    emoji: '💪', vi: 'Gồng', en: 'Power Up', attack: false,
    desc: 'kéo ×2 trong 3 giây + hồi thể lực', descEn: 'pull ×2 for 3s + stamina',
    say: (n) => `${n} gồng hết sức!`, sayEn: (n) => `${n} powers up!`
  },
  energy: {
    emoji: '🧃', vi: 'Tăng lực', en: 'Energy Drink', attack: false,
    desc: 'hồi đầy thể lực cho mình + 3 người cạnh', descEn: 'refill stamina for you + 3 neighbours',
    say: (n) => `${n} mời cả hàng nước tăng lực!`, sayEn: (n) => `${n} shares energy drinks!`
  },
  tickle: {
    emoji: '🤭', vi: 'Cù lét', en: 'Tickle', attack: true,
    desc: 'người đầu dây phe kia cười lăn, buông tay', descEn: 'the rival front puller laughs and lets go',
    say: (n, t) => `${n} cù lét đối thủ của ${t}!`, sayEn: (n, t) => `${n} tickles the rivals of ${t}!`
  },
  glue: {
    emoji: '🧤', vi: 'Găng keo', en: 'Sticky Gloves', attack: false,
    desc: 'cả đội miễn cù lét, bôi mỡ, xì hơi 6 giây', descEn: 'team immune to tickle, grease, fart 6s',
    say: (n, t) => `${n} phát găng tay keo cho ${t}!`, sayEn: (n, t) => `${n} gives sticky gloves to ${t}!`
  },
  cheer: {
    emoji: '📣', vi: 'Cổ vũ', en: 'Cheer', attack: false,
    desc: 'cả đội hồi thể lực gấp đôi 8 giây', descEn: 'team stamina regen ×2 for 8s',
    say: (n, t) => `${n} hò hét cổ vũ ${t}!`, sayEn: (n, t) => `${n} cheers for ${t}!`
  },
  grease: {
    emoji: '🧈', vi: 'Bôi mỡ', en: 'Grease', attack: true,
    desc: 'phe kia trơn tay, lực ×0,5 trong 4 giây', descEn: 'rivals slip: pull ×0.5 for 4s',
    say: (n) => `${n} bôi mỡ lên dây! Trơn tuột!`, sayEn: (n) => `${n} greases the rope! So slippery!`
  },
  strong: {
    emoji: '🏋️', vi: 'Lực sĩ', en: 'Strongman', attack: false,
    desc: 'lực sĩ vào kéo cùng 8 giây (bằng 4 người)', descEn: 'a strongman pulls 8s (like 4 people)',
    say: (n, t) => `${n} gọi lực sĩ vào giúp ${t}!`, sayEn: (n, t) => `${n} calls a strongman for ${t}!`
  },
  fart: {
    emoji: '💨', vi: 'Thả boom', en: 'Fart Bomb', attack: true,
    desc: 'xì hơi làm 5 người đầu phe kia choáng 2 giây', descEn: '5 rival front pullers dizzy for 2s',
    say: (n) => `${n} thả boom! Đối thủ choáng váng!`, sayEn: (n) => `${n} drops a fart bomb! The rivals are dizzy!`
  },
  heave: {
    emoji: '🥁', vi: 'Hò dô', en: 'Heave Ho', attack: false,
    desc: 'cả đội kéo ×1,5, không mất thể lực 6 giây', descEn: 'team pull ×1.5, no stamina cost 6s',
    say: (n, t) => `${n} hô hò dô cho ${t}!`, sayEn: (n, t) => `${n} leads a heave ho for ${t}!`
  },
  stomp: {
    emoji: '🦶', vi: 'Khổng lồ dẫm', en: 'Giant Stomp', attack: true,
    desc: 'giật dây về phía mình + 3 người phe kia ngã', descEn: 'yank the rope + 3 rivals fall',
    say: (n) => `${n} gọi khổng lồ dẫm dây!`, sayEn: (n) => `${n} calls the giant to stomp the rope!`
  }
};

// Quà → kỹ năng (khoá giống ITEMS của Đèn Đỏ, tên quà tiếng Anh viết thường)
const GIFT_SKILL = {
  rose: 'gong',
  rosa: 'gong',
  'heart me': 'gong',
  'ice cream cone': 'energy',
  gg: 'tickle',
  'finger heart': 'glue',
  'friendship necklace': 'cheer',
  doughnut: 'grease',
  donut: 'grease',
  perfume: 'strong',
  'hat and mustache': 'strong',
  'hand hearts': 'fart',
  confetti: 'heave',
  fireworks: 'heave',
  sunglasses: 'stomp',
  'gift box': 'energy',
  'teddy bear': 'cheer'
};

// Bảng kỹ năng dưới màn hình (theo giá)
const LEGEND = [
  { gift: 'Hoa hồng', tiktok: 'Rose', coins: 1, skill: 'gong' },
  { gift: 'Kem', tiktok: 'Ice Cream Cone', coins: 1, skill: 'energy' },
  { gift: 'GG', tiktok: 'GG', coins: 1, skill: 'tickle' },
  { gift: 'Finger Heart', tiktok: 'Finger Heart', coins: 5, skill: 'glue' },
  { gift: 'Vòng cổ', tiktok: 'Friendship Necklace', coins: 10, skill: 'cheer' },
  { gift: 'Donut', tiktok: 'Doughnut', coins: 30, skill: 'grease' },
  { gift: 'Mũ & ria', tiktok: 'Hat and Mustache', coins: 99, skill: 'strong' },
  { gift: 'Hand Hearts', tiktok: 'Hand Hearts', coins: 100, skill: 'fart' },
  { gift: 'Confetti', tiktok: 'Confetti', coins: 100, skill: 'heave' },
  { gift: 'Kính râm', tiktok: 'Sunglasses', coins: 199, skill: 'stomp' }
];

function skillForGift(giftName, coins, giftId) {
  const byId = BY_GIFT_ID[String(giftId || '')];
  if (byId && GIFT_SKILL[byId]) return GIFT_SKILL[byId];
  const key = String(giftName || '').trim().toLowerCase();
  if (GIFT_SKILL[key]) return GIFT_SKILL[key];
  // quà khác: đắt thì Hò dô (cả đội), rẻ thì Gồng (bản thân)
  return Number(coins) >= 50 ? 'heave' : 'gong';
}

module.exports = { SKILLS, LEGEND, GIFT_SKILL, skillForGift };
