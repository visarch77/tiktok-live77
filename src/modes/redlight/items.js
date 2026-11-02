/**
 * Quy đổi quà TikTok thành VẬT PHẨM trong game Đèn Xanh – Đèn Đỏ.
 * Quà chỉ là phụ trợ: người không tặng quà vẫn về đích được bằng thả tim và dừng đúng lúc.
 *
 * Loại vật phẩm (kind):
 *   turbo     chạy nhanh: cộng bước + tăng tốc vài giây
 *   shield    khiên: đỡ một lần bị loại lúc đèn đỏ
 *   buffalo   trâu húc: loại ngẫu nhiên vài người đang chạy (không húc người có khiên)
 *   clones    bản sao: chạy cùng chủ, chết thay chủ
 *   wind      gió lốc: đẩy lùi những người dẫn đầu
 *   giant     khổng lồ: bước dài, không bị trâu húc
 *   chicken   hoá gà: người dẫn đầu chạy chậm một lúc
 *   teamShield khiên cho những người đứng gần
 */
const ITEMS = {
  rose: { kind: 'turbo', emoji: '🌹', label: 'Chạy nhanh' },
  rosa: { kind: 'turbo', emoji: '🌹', label: 'Chạy nhanh' },
  'finger heart': { kind: 'shield', emoji: '🛡️', label: 'Khiên' },
  'heart me': { kind: 'buffalo', emoji: '🐃', label: 'Trâu húc' },
  'hand hearts': { kind: 'buffalo', emoji: '🐃', label: 'Trâu húc' },
  'ice cream cone': { kind: 'clones', emoji: '👥', label: 'Bản sao' },
  'gift box': { kind: 'clones', emoji: '👥', label: 'Bản sao' },
  doughnut: { kind: 'wind', emoji: '🌪️', label: 'Gió lốc' },
  donut: { kind: 'wind', emoji: '🌪️', label: 'Gió lốc' },
  'hat and mustache': { kind: 'giant', emoji: '🗿', label: 'Khổng lồ' },
  perfume: { kind: 'giant', emoji: '🗿', label: 'Khổng lồ' },
  gg: { kind: 'chicken', emoji: '🐔', label: 'Hoá gà' },
  confetti: { kind: 'teamShield', emoji: '🎆', label: 'Khiên đồng đội' },
  fireworks: { kind: 'teamShield', emoji: '🎆', label: 'Khiên đồng đội' },
  'teddy bear': { kind: 'clones', emoji: '🧸', label: 'Bản sao + chạy nhanh', turbo: true }
};

// Bảng hướng dẫn hiển thị dưới màn hình (theo thứ tự)
const LEGEND = [
  { gift: 'Hoa hồng', emoji: '🌹', label: 'Chạy nhanh' },
  { gift: 'Finger Heart', emoji: '🛡️', label: 'Khiên' },
  { gift: 'Heart Me', emoji: '🐃', label: 'Trâu húc' },
  { gift: 'Kem', emoji: '👥', label: '5 bản sao' },
  { gift: 'Donut', emoji: '🌪️', label: 'Gió lốc' },
  { gift: 'Mũ & ria', emoji: '🗿', label: 'Khổng lồ' },
  { gift: 'GG', emoji: '🐔', label: 'Hoá gà' },
  { gift: 'Pháo hoa', emoji: '🎆', label: 'Khiên đội' }
];

function itemForGift(giftName, coins) {
  const key = String(giftName || '').trim().toLowerCase();
  if (ITEMS[key]) return ITEMS[key];
  // Quà khác: chạy nhanh, số bước tăng theo giá xu nhưng có trần để quà to không thắng tuyệt đối
  return { kind: 'turbo', emoji: '⚡', label: 'Chạy nhanh', bonus: Math.min(12, 2 + Math.round(Math.log2(Math.max(1, coins)) * 1.5)) };
}

module.exports = { ITEMS, LEGEND, itemForGift };
