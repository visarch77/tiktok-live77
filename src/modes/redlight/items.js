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
 *   chicken   hoá gà: người dẫn đầu (trừ người tặng) chạy chậm 5 giây (không còn quà nào dùng)
 *   shove     đẩy ngã: người tặng "trượt tay" đẩy người đứng gần nhất ngã → lính bắn (khiên đỡ được, khổng lồ không ngã)
 *   teamShield khiên cho 10 người đứng gần và người tặng
 *   crowd     đám bản sao: 10 bản sao chạy quanh mình, chết thay mình (không hại ai)
 *   stomp     khổng lồ dẫm: nhân vật của người tặng hoá khổng lồ đi ngang một làn sân ngay trước mặt mình,
 *             dẫm tối đa 5 người trong làn (khiên đỡ được, khổng lồ không bị dẫm); quà đắt
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
  gg: { kind: 'shove', emoji: '🤚', label: 'Đẩy ngã' },
  confetti: { kind: 'teamShield', emoji: '🫧', label: 'Khiên đồng đội' },
  fireworks: { kind: 'teamShield', emoji: '🫧', label: 'Khiên đồng đội' },
  'hand hearts': { kind: 'buffalo', emoji: '🎯', label: 'Lính bắn' },
  'friendship necklace': { kind: 'crowd', emoji: '👥', label: '10 bản sao', clones: 10 },
  sunglasses: { kind: 'stomp', emoji: '🦶', label: 'Khổng lồ dẫm' }
};

// Bảng hướng dẫn hiển thị dưới màn hình (theo thứ tự giá); kind chọn biểu tượng kỹ năng và ảnh quà TikTok (gift_<kind>.webp)
// short: nhãn ngắn có số, chữ to trên thanh kỹ năng (đọc nhanh trên điện thoại)
const LEGEND = [
  { gift: 'Hoa hồng', tiktok: 'Rose', coins: 1, kind: 'turbo', emoji: '👟', label: 'Chạy nhanh', short: 'VÀO + CHẠY', desc: 'vào chơi ngay + lao lên vài bước' },
  { gift: 'Kem', tiktok: 'Ice Cream Cone', coins: 1, kind: 'clones', emoji: '👥', label: 'Bản sao', short: '1 BẢN SAO', desc: 'bản sao chết thay mình' },
  { gift: 'GG', tiktok: 'GG', coins: 1, kind: 'shove', emoji: '🤚', label: 'Đẩy ngã', short: 'ĐẨY NGÃ', desc: 'đẩy người gần nhất ngã, bị lính bắn' },
  { gift: 'Finger Heart', tiktok: 'Finger Heart', coins: 5, kind: 'shield', emoji: '🛡️', label: 'Khiên', short: 'KHIÊN', desc: 'đỡ 1 lần bị bắn' },
  { gift: 'Vòng cổ', tiktok: 'Friendship Necklace', coins: 10, kind: 'crowd', emoji: '👥', label: '10 bản sao', short: '10 BẢN SAO', desc: 'cả đám bản sao chạy quanh mình' },
  { gift: 'Donut', tiktok: 'Doughnut', coins: 30, kind: 'wind', emoji: '📢', label: 'Búp bê hét', short: 'ĐẨY LÙI 5', desc: 'đẩy lùi 5 người dẫn đầu' },
  { gift: 'Mũ & ria', tiktok: 'Hat and Mustache', coins: 99, kind: 'giant', emoji: '💪', label: 'Khổng lồ', short: 'KHỔNG LỒ', desc: '15 giây mỗi tim đi gấp đôi' },
  { gift: 'Hand Hearts', tiktok: 'Hand Hearts', coins: 100, kind: 'buffalo', emoji: '🎯', label: 'Lính bắn', short: 'BẮN 2', desc: 'lính bắn 2 người đang chạy' },
  { gift: 'Confetti', tiktok: 'Confetti', coins: 100, kind: 'teamShield', emoji: '🫧', label: 'Khiên đội', short: 'KHIÊN ĐỘI', desc: 'khiên cho 10 người quanh mình' },
  { gift: 'Kính râm', tiktok: 'Sunglasses', coins: 199, kind: 'stomp', emoji: '🦶', label: 'Khổng lồ dẫm', short: 'DẪM 5', desc: 'hoá khổng lồ chạy dẫm tối đa 5 người' }
];

// Nhận quà theo mã quà TikTok trước (tên quà TikTok trả về theo ngôn ngữ vùng kết nối: "Rose" / "Hoa hồng" / "バラ"…),
// không khớp mã mới so theo tên tiếng Anh. Mã lấy từ danh sách quà công khai (github.com/kkkaoru/tiktok-gift-list-per-regison).
const BY_GIFT_ID = {
  5655: 'rose',
  8913: 'rosa',
  7934: 'heart me',
  5487: 'finger heart',
  5827: 'ice cream cone',
  5879: 'doughnut',
  5658: 'perfume',
  6427: 'hat and mustache',
  6064: 'gg',
  5585: 'confetti',
  6090: 'fireworks',
  5660: 'hand hearts',
  8343: 'hand hearts',
  9947: 'friendship necklace',
  5509: 'sunglasses'
};

function itemForGift(giftName, coins, giftId) {
  const byId = BY_GIFT_ID[String(giftId || '')];
  if (byId) return ITEMS[byId];
  const key = String(giftName || '').trim().toLowerCase();
  if (ITEMS[key]) return ITEMS[key];
  // Quà khác: chạy nhanh, số bước tăng theo giá xu nhưng có trần để quà to không thắng tuyệt đối
  return { kind: 'turbo', emoji: '⚡', label: 'Chạy nhanh', bonus: Math.min(12, 2 + Math.round(Math.log2(Math.max(1, coins)) * 1.5)) };
}

module.exports = { ITEMS, LEGEND, BY_GIFT_ID, itemForGift };
