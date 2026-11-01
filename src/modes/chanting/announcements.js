/**
 * Lời dẫn chuyển chế độ (đọc bằng giọng dẫn tụng). Viết cho người lớn tuổi dễ nghe, dễ làm theo:
 * câu ngắn, nói rõ "bây giờ làm gì", xưng hô chung "quý cô chú, anh chị và các bạn" (không đoán giới tính).
 * Mỗi loại có vài phiên bản, đọc luân phiên để không nhàm.
 * Bộ đọc giọng nói giới hạn ~150 ký tự mỗi lần, nên server tự chia lời dẫn theo câu.
 */
const ANNOUNCE = {
  // Còn khoảng 1 phút nữa là vào khoá tụng (đang dâng lễ)
  soon: [
    'A Di Đà Phật. Thưa quý cô chú, anh chị và các bạn, còn khoảng một phút nữa đạo tràng mình sẽ bắt đầu tụng kinh. Ai muốn gửi lời chúc hay dâng lễ, xin mời trong ít phút này ạ.',
    'Kính thưa đại chúng, chỉ còn chừng một phút nữa là tới giờ tụng kinh. Quý vị có lời nguyện nào, xin gửi ngay bây giờ để đạo tràng kịp đọc tên chúc phúc nhé.'
  ],
  // Ngay trước khi thỉnh chuông vào khoá tụng
  toChant: [
    'A Di Đà Phật. Kính thưa quý cô chú, anh chị và các bạn. Thời gian dâng lễ đã hết. Đạo tràng mình chuẩn bị tụng kinh. Xin mọi người ngồi thẳng lưng, thở nhẹ nhàng. Trong lúc tụng, xin tạm ngưng bình luận. Khi nghe tiếng mõ, mình thả tim theo nhịp mõ, như vậy là đang cùng tụng kinh với đạo tràng rồi ạ.',
    'Kính thưa đại chúng. Chuông sắp được thỉnh lên để bắt đầu khoá tụng. Xin quý vị gác lại việc riêng một chút, lắng lòng nghe tiếng chuông. Trong giờ tụng kinh, mình không bình luận, chỉ nhẹ nhàng thả tim theo tiếng mõ. Khi chuông vang, mình cùng chắp tay, thả tim một lần ạ.',
    'A Di Đà Phật. Sau phần dâng lễ ấm áp, mời quý cô chú, anh chị cùng chuẩn bị tụng kinh. Để giữ không khí trang nghiêm, xin mọi người tạm ngưng bình luận. Mình chỉ cần thả tim theo nhịp mõ, mỗi tiếng mõ là một lần thả tim. Tụng đều theo tiếng mõ, tâm mình sẽ lắng lại, an tịnh ạ.'
  ],
  // Ngay sau khi kết chuông, chuyển sang dâng lễ
  toOffering: [
    'A Di Đà Phật. Khoá tụng đã viên mãn. Xin tuỳ hỷ công đức của tất cả quý cô chú, anh chị và các bạn đã cùng tụng. Bây giờ là thời gian dâng lễ. Mọi người có thể bình luận gửi lời chúc, hoặc bình luận chữ thắp nhang để lên chánh điện dâng hương. Đạo tràng sẽ đọc tên và chúc phúc cho từng người ạ.',
    'Kính thưa đại chúng, khoá tụng vừa kết thúc trong an lành. Nguyện công đức này hồi hướng đến tất cả mọi người. Mời quý vị sang phần dâng lễ. Quý vị cứ tự nhiên bình luận gửi lời nguyện bình an, hoặc thắp một nén tâm hương bằng cách bình luận chữ thắp nhang ạ.',
    'A Di Đà Phật. Cảm ơn quý cô chú, anh chị đã cùng nhau tụng kinh. Giờ đây xin mời mọi người tự nhiên bình luận, gửi lời chúc bình an cho mình và cho mọi người. Ai muốn lên chánh điện dâng hương, chỉ cần bình luận chữ thắp nhang, hoặc gửi biểu tượng ngọn lửa là được ạ.'
  ]
};

/** Câu báo giờ khoá tụng kế tiếp (đọc sau lời dẫn sang dâng lễ) */
function nextSessionLine(minutes) {
  const m = Math.max(1, Math.round(minutes));
  return `Khoảng ${m} phút nữa, đạo tràng sẽ bắt đầu khoá tụng tiếp theo. Mời quý vị ở lại cùng tụng ạ.`;
}

/** Chia lời dẫn thành các đoạn ngắn (theo câu) để bộ đọc giọng nói đọc trọn vẹn */
function splitForSpeech(text, max = 140) {
  const sentences = String(text).match(/[^.!?]+[.!?]*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if ((cur + ' ' + s).trim().length <= max) cur = (cur + ' ' + s).trim();
    else {
      if (cur) chunks.push(cur);
      if (s.length <= max) cur = s;
      else {
        // câu quá dài: ngắt ở dấu phẩy
        let part = '';
        for (const piece of s.split(/,\s*/)) {
          if ((part ? `${part}, ${piece}` : piece).length <= max) part = part ? `${part}, ${piece}` : piece;
          else {
            if (part) chunks.push(`${part},`);
            part = piece;
          }
        }
        cur = part;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function createAnnouncer() {
  const idx = { soon: 0, toChant: 0, toOffering: 0 };
  return (kind) => {
    const list = ANNOUNCE[kind] || [];
    if (!list.length) return '';
    const text = list[idx[kind] % list.length];
    idx[kind] += 1;
    return text;
  };
}

module.exports = { ANNOUNCE, nextSessionLine, splitForSpeech, createAnnouncer };
