/**
 * Quy đổi quà TikTok thành LỄ VẬT TƯỢNG TRƯNG dâng lên Tam Bảo.
 * Mọi món quà đều quý như nhau: chỉ đổi lời mô tả và hiệu ứng theo LOẠI lễ vật, không theo giá trị.
 *
 * Nhóm lễ vật (cat) — mỗi nhóm có hiệu ứng riêng trên màn hình (public/js/fx.js):
 *   flower   hoa         mưa cánh sen, hoa toả ra
 *   lamp     đèn         đèn hoa đăng bay lên, ánh sáng lấp lánh
 *   incense  hương       khói trầm vàng cuộn lên từ lư hương
 *   tea      trà         làn hơi trà, lá trà vàng
 *   fruit    quả/bánh    lá vàng và cánh hoa, quầng sáng ấm
 *   heart    tâm thành   vòng hào quang lan toả, lấp lánh
 *   release  phóng sinh  chim bồ câu / hạc / bướm bay lên trời
 *   guardian hộ pháp     tia sáng toả từ tượng Phật, mưa hoa vàng
 *   joy      tuỳ hỷ      lấp lánh nhẹ
 */
const OFFERINGS = {
  // ---- Hoa ----
  rose: ['flower', '🌹', 'dâng một đoá hoa tươi'],
  rosa: ['flower', '🌹', 'dâng một bó hoa hồng thơm'],
  'rosie the rose bean': ['flower', '🌹', 'dâng hoa tươi lên Phật'],
  bouquet: ['flower', '💐', 'dâng một bó hoa tươi'],
  'flower overflow': ['flower', '💐', 'dâng ngàn đoá hoa cúng dường'],
  sunflower: ['flower', '🌻', 'dâng hoa hướng dương'],
  tulip: ['flower', '🌷', 'dâng hoa tulip'],
  lotus: ['flower', '🪷', 'dâng một đoá sen thơm'],
  'cherry blossom': ['flower', '🌸', 'dâng hoa anh đào'],
  confetti: ['flower', '🌸', 'rải hoa cúng dường'],
  'money gun': ['flower', '🌸', 'rải hoa khắp đạo tràng'],
  'garden of love': ['flower', '🌺', 'dâng một vườn hoa'],
  coral: ['flower', '🌺', 'dâng hoa biển cả'],
  // ---- Đèn ----
  tiktok: ['lamp', '🕯️', 'thắp một ngọn đèn sáng'],
  star: ['lamp', '⭐', 'thắp một ngôi sao sáng'],
  lantern: ['lamp', '🏮', 'thả một chiếc đèn hoa đăng'],
  fireworks: ['lamp', '🏮', 'thả muôn ngọn đèn hoa đăng'],
  galaxy: ['lamp', '🏮', 'thắp ngàn ngọn đèn như dải ngân hà'],
  'tiktok universe': ['lamp', '🏮', 'thắp đèn sáng khắp mười phương'],
  universe: ['lamp', '🏮', 'thắp đèn sáng khắp mười phương'],
  planet: ['lamp', '✨', 'thắp đèn trí tuệ'],
  interstellar: ['lamp', '✨', 'thắp đèn soi khắp muôn cõi'],
  rocket: ['lamp', '🏮', 'thả một ngọn đèn trời'],
  'private jet': ['lamp', '🏮', 'thả đèn trời chở lời nguyện bay xa'],
  'gold mine': ['lamp', '🕯️', 'dâng đèn vàng sáng rực'],
  'lightning bolt': ['lamp', '✨', 'thắp ánh sáng tỉnh thức'],
  'little crown': ['lamp', '🕯️', 'dâng một ngọn đèn vàng'],
  // ---- Hương ----
  perfume: ['incense', '🌿', 'dâng hương thơm thanh tịnh'],
  'perfume bottle': ['incense', '🌿', 'dâng hương trầm'],
  'sending positivity': ['incense', '🌿', 'dâng tâm hương an lạc'],
  // ---- Trà ----
  coffee: ['tea', '🍵', 'dâng một chén trà thơm'],
  tea: ['tea', '🍵', 'dâng một chén trà thơm'],
  'bubble tea': ['tea', '🍵', 'dâng trà thơm'],
  'ice cream cone': ['tea', '🍵', 'dâng một chén trà'],
  // ---- Quả, bánh ----
  doughnut: ['fruit', '🍑', 'dâng một mâm quả'],
  cake: ['fruit', '🍑', 'dâng bánh trái'],
  'birthday cake': ['fruit', '🍑', 'dâng bánh trái'],
  'wishing cake': ['fruit', '🍑', 'dâng bánh trái cầu an'],
  cupcake: ['fruit', '🍑', 'dâng bánh ngọt'],
  lollipop: ['fruit', '🍊', 'dâng trái ngọt'],
  pumpkin: ['fruit', '🎃', 'dâng một quả bí vàng'],
  'lucky pig': ['fruit', '🍑', 'dâng mâm ngũ quả cát tường'],
  'tiny diny': ['fruit', '🍊', 'dâng trái ngọt'],
  // ---- Tâm thành ----
  'heart me': ['heart', '💛', 'gửi trọn tấm lòng thành'],
  'finger heart': ['heart', '💛', 'gửi tâm thương đến mọi người'],
  'hand hearts': ['heart', '💛', 'chắp tay gửi tâm thương'],
  'hand heart': ['heart', '💛', 'chắp tay gửi tâm thương'],
  'love you': ['heart', '💛', 'gửi lòng từ đến muôn loài'],
  'i love you': ['heart', '💛', 'gửi lòng từ đến muôn loài'],
  heart: ['heart', '💛', 'gửi một tấm lòng thành'],
  hearts: ['heart', '💛', 'gửi muôn tấm lòng thành'],
  'heart rain': ['heart', '💛', 'rải tâm từ khắp đạo tràng'],
  'love bang': ['heart', '💛', 'lan toả tâm từ bi'],
  'friendship necklace': ['heart', '📿', 'dâng một chuỗi tràng hạt'],
  'love letter': ['heart', '📜', 'gửi một lời nguyện'],
  'wishing bottle': ['heart', '📜', 'gửi một lời nguyện'],
  // ---- Phóng sinh ----
  swan: ['release', '🕊️', 'thả đôi chim phóng sinh'],
  'paper crane': ['release', '🕊️', 'thả hạc giấy cầu bình an'],
  butterfly: ['release', '🦋', 'thả bướm bay về trời xanh'],
  falcon: ['release', '🕊️', 'thả chim về trời'],
  phoenix: ['release', '🕊️', 'thả chim lành bay cao'],
  'whale diving': ['release', '🐟', 'thả cá về biển lớn'],
  'sam the whale': ['release', '🐟', 'thả cá về biển lớn'],
  dolphin: ['release', '🐟', 'thả cá về biển lớn'],
  // ---- Hộ pháp ----
  lion: ['guardian', '🦁', 'thỉnh sư tử hộ pháp, nguyện trí tuệ sáng soi'],
  'leon the kitten': ['guardian', '🦁', 'thỉnh sư tử hộ pháp'],
  'unicorn fantasy': ['guardian', '✨', 'dâng lễ cát tường lên Tam Bảo'],
  unicorn: ['guardian', '✨', 'dâng lễ cát tường lên Tam Bảo'],
  dragon: ['guardian', '🐉', 'thỉnh Long Thần hộ pháp'],
  'dragon flame': ['guardian', '🐉', 'thỉnh Long Thần hộ pháp'],
  'castle fantasy': ['guardian', '🛕', 'dâng một ngôi chùa trang nghiêm'],
  train: ['guardian', '🛕', 'đưa đoàn Phật tử về chùa'],
  'sports car': ['guardian', '🛕', 'đưa đoàn Phật tử về chùa'],
  motorcycle: ['guardian', '🛕', 'đưa đoàn Phật tử về chùa'],
  yacht: ['guardian', '🛕', 'chở thuyền Bát Nhã sang bờ giác'],
  elephant: ['guardian', '🐘', 'dâng voi trắng cát tường'],
  // ---- Tuỳ hỷ ----
  gg: ['joy', '🙏', 'chắp tay tuỳ hỷ'],
  'thumbs up': ['joy', '🙏', 'chắp tay tuỳ hỷ'],
  mic: ['joy', '🔔', 'thỉnh một hồi chuông'],
  cap: ['joy', '🙏', 'tuỳ hỷ công đức'],
  sunglasses: ['joy', '🙏', 'tuỳ hỷ công đức'],
  'hat and mustache': ['joy', '🙏', 'tuỳ hỷ công đức'],
  corgi: ['joy', '🙏', 'gửi niềm vui đến đạo tràng'],
  panda: ['joy', '🙏', 'gửi niềm vui đến đạo tràng'],
  jollie: ['joy', '🙏', 'gửi niềm vui đến đạo tràng'],
  'gimme the vote': ['joy', '🙏', 'tuỳ hỷ công đức']
};

// Hình lễ vật (public/assets/offerings/*.webp — vẽ bằng Scenario, phong cách thiên đình)
const IMAGE_BY_GIFT = {
  lotus: 'lotus',
  tiktok: 'lotusLantern',
  star: 'lotusLantern',
  lantern: 'lotusLantern',
  'gold mine': 'lotusLantern',
  'little crown': 'lotusLantern',
  'lightning bolt': 'lotusLantern',
  'friendship necklace': 'mala',
  butterfly: 'butterfly',
  'whale diving': 'koi',
  'sam the whale': 'koi',
  dolphin: 'koi',
  dragon: 'dragon',
  'dragon flame': 'dragon',
  'unicorn fantasy': 'dragon',
  unicorn: 'dragon',
  'castle fantasy': 'pagoda',
  train: 'pagoda',
  'sports car': 'pagoda',
  motorcycle: 'pagoda',
  yacht: 'pagoda',
  mic: 'bell'
};
const IMAGE_BY_CAT = {
  flower: 'rose',
  lamp: 'skyLantern',
  incense: 'incense',
  tea: 'tea',
  fruit: 'fruit',
  heart: 'heartLotus',
  release: 'doves',
  guardian: 'lion',
  joy: 'lotus'
};
const imageFor = (name, cat) => IMAGE_BY_GIFT[name] || IMAGE_BY_CAT[cat] || 'lotus';

// Quà mới / quà theo mùa chưa có trong bảng: đoán theo từ khoá trong tên
const KEYWORDS = [
  [/rose|flower|bouquet|blossom|tulip|daisy|lily|lotus|garden|petal|confetti/i, 'flower'],
  [/heart|love|hug|kiss|friend|necklace|letter|wish/i, 'heart'],
  [/swan|bird|crane|butterfly|dove|falcon|eagle|phoenix|fish|whale|dolphin|turtle/i, 'release'],
  [/lion|dragon|tiger|unicorn|elephant|castle|temple|train|car|motor|yacht|ship/i, 'guardian'],
  [/star|galaxy|universe|planet|light|lamp|lantern|firework|rocket|jet|candle|crown|gold/i, 'lamp'],
  [/perfume|incense|scent|aroma/i, 'incense'],
  [/tea|coffee|milk|drink|ice cream/i, 'tea'],
  [/cake|donut|doughnut|fruit|apple|peach|pumpkin|candy|cookie|pie|lolli/i, 'fruit']
];
const FALLBACK = {
  flower: ['🌸', 'dâng hoa tươi lên Phật'],
  lamp: ['🕯️', 'thắp một ngọn đèn sáng'],
  incense: ['🌿', 'dâng một nén tâm hương'],
  tea: ['🍵', 'dâng một chén trà thơm'],
  fruit: ['🍑', 'dâng một mâm quả'],
  heart: ['💛', 'gửi một tấm lòng thành'],
  release: ['🕊️', 'thả chim phóng sinh'],
  guardian: ['✨', 'dâng lễ cúng dường Tam Bảo'],
  joy: ['🙏', 'chắp tay tuỳ hỷ']
};
const ROTATE = ['flower', 'lamp', 'tea', 'fruit', 'incense', 'heart'];

function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/** @returns {{ cat: string, icon: string, text: string, img: string }} */
function giftOffering(evt = {}) {
  const name = String(evt.giftName || '').trim().toLowerCase();
  const hit = OFFERINGS[name];
  if (hit) return { cat: hit[0], icon: hit[1], text: hit[2], img: imageFor(name, hit[0]) };
  const kw = KEYWORDS.find(([re]) => re.test(name));
  const cat = kw ? kw[1] : ROTATE[hash(name || evt.giftId || 'gift') % ROTATE.length];
  let img = IMAGE_BY_CAT[cat];
  if (cat === 'release') img = /butterfly/i.test(name) ? 'butterfly' : /fish|whale|dolphin|turtle/i.test(name) ? 'koi' : 'doves';
  if (cat === 'guardian') img = /dragon|unicorn/i.test(name) ? 'dragon' : /castle|temple|train|car|motor|yacht|ship/i.test(name) ? 'pagoda' : 'lion';
  return { cat, icon: FALLBACK[cat][0], text: FALLBACK[cat][1], img };
}

// Quà nhỏ (≤ 10 kim cương mỗi món): chỉ bay lên cùng tên từ chỗ ngồi, không dừng cả màn hình để cận cảnh
const SMALL_MAX_DIAMONDS = 10;
const SMALL_NAMES = new Set(['rose', 'tiktok', 'gg', 'heart me', 'finger heart', 'ice cream cone', 'thumbs up', 'rosa', 'mic', 'heart', 'love you']);
function isSmallGift(evt = {}) {
  const coins = Number(evt.coins);
  const count = Math.max(1, Number(evt.count) || 1);
  if (Number.isFinite(coins) && coins > 0) return coins / count <= SMALL_MAX_DIAMONDS;
  return SMALL_NAMES.has(String(evt.giftName || '').trim().toLowerCase());
}

module.exports = { giftOffering, isSmallGift, OFFERINGS };
