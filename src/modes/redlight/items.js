/**
 * Quy đổi quà TikTok thành VẬT PHẨM trong game Đèn Xanh – Đèn Đỏ (bối cảnh trò chơi sinh tồn: búp bê khổng lồ, lính canh áo hồng).
 * Quà chỉ là phụ trợ: người không tặng quà vẫn về đích được bằng thả tim và dừng đúng lúc.
 *
 * Loại vật phẩm (kind):
 *   turbo     chạy nhanh: cộng bước + tăng tốc vài giây
 *   shield    khiên: đỡ một lần bị loại lúc đèn đỏ
 *   buffalo   lính bắn: lính canh bắn 2 người đang chạy ngẫu nhiên (không bắn người có khiên / khổng lồ); chỉ quà đắt
 *   clones    bản sao: chạy cùng chủ, chết thay chủ (số bản sao theo giá quà)
 *   wind      búp bê hét: sóng âm đẩy lùi 5 người dẫn đầu (mỗi người được miễn 10 giây sau khi bị đẩy)
 *   giant     khổng lồ: mỗi lượt tim đi gấp đôi, chạy nhanh hơn, không bị lính bắn
 *   chicken   hoá gà: người dẫn đầu chạy chậm 5 giây (sau đó miễn hoá gà 15 giây)
 *   teamShield khiên cho 10 người đứng gần và người tặng
 */
// Cân theo giá xu (đo bằng mô phỏng trên mã game thật, xem docs): quà rẻ chỉ giúp mình, quà hại người khác phải đắt
// và có giới hạn. Không quà nào thắng chắc: vẫn phải thả tim và dừng đúng lúc.
const ITEMS = {
  rose: { kind: 'turbo', emoji: '👟', label: 'Chạy nhanh', bonus: 6 },
  rosa: { kind: 'turbo', emoji: '👟', label: 'Chạy nhanh', bonus: 6 },
  'heart me': { kind: 'turbo', emoji: '👟', label: 'Chạy nhanh', bonus: 4 },
  'finger heart': { kind: 'shield', emoji: '🛡️', label: 'Khiên' },
  'ice cream cone': { kind: 'clones', emoji: '👥', label: 'Bản sao', clones: 1 },
  'gift box': { kind: 'clones', emoji: '👥', label: '2 bản sao', clones: 2 },
  'teddy bear': { kind: 'clones', emoji: '🧸', label: '3 bản sao + chạy nhanh', clones: 3, turbo: true },
  doughnut: { kind: 'wind', emoji: '📢', label: 'Búp bê hét' },
  donut: { kind: 'wind', emoji: '📢', label: 'Búp bê hét' },
  perfume: { kind: 'giant', emoji: '💪', label: 'Khổng lồ', ms: 8000 },
  'hat and mustache': { kind: 'giant', emoji: '💪', label: 'Khổng lồ', ms: 15000 },
  gg: { kind: 'chicken', emoji: '🐔', label: 'Hoá gà' },
  confetti: { kind: 'teamShield', emoji: '🫧', label: 'Khiên đồng đội' },
  fireworks: { kind: 'teamShield', emoji: '🫧', label: 'Khiên đồng đội' },
  'hand hearts': { kind: 'buffalo', emoji: '🎯', label: 'Lính bắn' }
};

// Bảng hướng dẫn hiển thị dưới màn hình (theo thứ tự); kind chọn biểu tượng kỹ năng và ảnh quà TikTok (gift_<kind>.webp)
const LEGEND = [
  { gift: 'Hoa hồng', tiktok: 'Rose', coins: 1, kind: 'turbo', emoji: '👟', label: 'Chạy nhanh', desc: 'lao lên vài bước' },
  { gift: 'Finger Heart', tiktok: 'Finger Heart', coins: 5, kind: 'shield', emoji: '🛡️', label: 'Khiên', desc: 'đỡ 1 lần bị bắn' },
  { gift: 'Hand Hearts', tiktok: 'Hand Hearts', coins: 100, kind: 'buffalo', emoji: '🎯', label: 'Lính bắn', desc: 'lính bắn 2 người đang chạy' },
  { gift: 'Kem', tiktok: 'Ice Cream Cone', coins: 1, kind: 'clones', emoji: '👥', label: 'Bản sao', desc: 'bản sao chết thay mình' },
  { gift: 'Donut', tiktok: 'Doughnut', coins: 30, kind: 'wind', emoji: '📢', label: 'Búp bê hét', desc: 'đẩy lùi 5 người dẫn đầu' },
  { gift: 'Mũ & ria', tiktok: 'Hat and Mustache', coins: 99, kind: 'giant', emoji: '💪', label: 'Khổng lồ', desc: '15 giây mỗi tim đi gấp đôi' },
  { gift: 'GG', tiktok: 'GG', coins: 1, kind: 'chicken', emoji: '🐔', label: 'Hoá gà', desc: 'người dẫn đầu chạy chậm 5 giây' },
  { gift: 'Confetti', tiktok: 'Confetti', coins: 100, kind: 'teamShield', emoji: '🫧', label: 'Khiên đội', desc: 'khiên cho 10 người quanh mình' }
];

function itemForGift(giftName, coins) {
  const key = String(giftName || '').trim().toLowerCase();
  if (ITEMS[key]) return ITEMS[key];
  // Quà khác: chạy nhanh, số bước tăng theo giá xu nhưng có trần để quà to không thắng tuyệt đối
  return { kind: 'turbo', emoji: '⚡', label: 'Chạy nhanh', bonus: Math.min(12, 2 + Math.round(Math.log2(Math.max(1, coins)) * 1.5)) };
}

module.exports = { ITEMS, LEGEND, itemForGift };
