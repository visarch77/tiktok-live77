// Bộ lọc chặn ký tự lạ (Cuneiform 𒐫, Zalgo, Braille, ký tự spam) & từ ngữ phản cảm — dùng chung cho mọi chế độ
const WEIRD_SPAM_RE = /[\u{12000}-\u{1254F}\uFDFD\u2800-\u28FF\u2580-\u259F]|[\u0300-\u036F]{3,}/u;
const BRACKET_EMOTE_RE = /\[[^\]]{1,24}\]/g;
const ALLOWED_VI_TEXT_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?]/g;
const ALLOWED_VI_NAME_RE = /[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s._-]/g;
const VI_LETTER_RE = /[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ]/g;
const BAD_WORDS_RE = /(đá dái|địt|lồn|cặc|đm|vcl|vl|yamate|i cư|lừa đảo|lừa à|te-le gram|telegram|bố là trùm)/i;

const ANON_NAME = 'Thí Chủ Hữu Duyên';

function isBlockedSpamOrToxic(raw) {
  if (!raw) return true;
  const s = String(raw);
  if (WEIRD_SPAM_RE.test(s)) return true;
  if (BAD_WORDS_RE.test(s)) return true;
  return false;
}

function sanitizeUserName(rawName) {
  const normalized = String(rawName || '')
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_NAME_RE, ' ')
    .replace(/(.)\1{3,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 26);

  if (!normalized || BAD_WORDS_RE.test(normalized)) {
    return ANON_NAME;
  }
  const letters = normalized.match(VI_LETTER_RE) || [];
  if (letters.length < 2) {
    return ANON_NAME;
  }
  return normalized;
}

function sanitizeWishText(rawWish) {
  if (!rawWish) return '';
  const cleaned = String(rawWish)
    .normalize('NFKC')
    .normalize('NFC')
    .replace(BRACKET_EMOTE_RE, ' ')
    .replace(ALLOWED_VI_TEXT_RE, ' ')
    .replace(/([.,!?])\1+/g, '$1')
    .replace(/(.)\1{2,}/gi, '$1$1')
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?\s-]+|[.,!?\s-]+$/g, '')
    .slice(0, 120);

  if (!cleaned || BAD_WORDS_RE.test(cleaned)) return '';
  const letters = cleaned.match(VI_LETTER_RE) || [];
  if (letters.length < 2) return '';
  return cleaned;
}

// ----------------------------------------------------------------------------
// Bộ lọc CHẶT cho chữ được HIỆN TO trên màn hình (lời nguyện khi lên lạy, lời trên đầu, giọng đọc):
// chặn tục tĩu (có dấu, không dấu, viết lách luật), chửi bới, nội dung người lớn, chính trị,
// quảng cáo / lừa đảo / link / số điện thoại. Thà bỏ sót một lời chúc còn hơn hiện một câu bậy.
// ----------------------------------------------------------------------------
// Từ có dấu dễ trùng nghĩa khi bỏ dấu (đụ ≠ du, cặc ≠ các, lồn ≠ lớn...): so trên chữ gốc, theo nguyên từ
const BAD_VI_WORDS = [
  'địt', 'đụ', 'đéo', 'đếch', 'đĩ', 'cặc', 'lồn', 'buồi', 'nứng', 'dái', 'chịch', 'đm', 'đmm', 'đcm', 'đkm', 'đù',
  'vãi lồn', 'vãi', 'mẹ mày', 'bố mày', 'mẹ kiếp', 'chó chết', 'óc chó', 'con chó', 'thằng chó', 'đồ chó', 'súc vật',
  'khốn nạn', 'mất dạy', 'ngu', 'ngu học', 'đần', 'thần kinh', 'điên à', 'cút', 'chết đi', 'chết mẹ', 'mả mẹ',
  'phản động', 'cộng sản', 'việt tân', 'đảng', 'biểu tình', 'chính quyền',
  'lừa đảo', 'cờ bạc', 'lô đề', 'nhà cái', 'kiếm tiền', 'đầu tư', 'nạp tiền', 'rút tiền', 'vay tiền', 'bán hàng',
  'kết bạn', 'nhắn tin', 'inbox', 'liên hệ', 'tuyển dụng', 'việc nhẹ'
];
// Bỏ dấu rồi so (bắt kiểu "dit me", "d.m", "v.c.l", "f*ck", "l0n"...)
const BAD_ASCII_WORDS = [
  'dit', 'djt', 'ditme', 'dit me', 'dmm', 'dm', 'dcm', 'dkm', 'dcmm', 'vcl', 'vkl', 'vl', 'vler', 'clm', 'cmm', 'cl', 'cc',
  'dek', 'loz', 'cak',
  'fuck', 'fck', 'fuk', 'shit', 'bitch', 'dick', 'pussy', 'sex', 'sexy', 'porn', 'xxx', 'nude', 'jav', 'onlyfans',
  'me may', 'bo may', 'oc cho', 'con cho', 'thang cho', 'suc vat', 'mat day', 'khon nan',
  'zalo', 'tele', 'telegram', 'facebook', 'fb', 'shopee', 'lazada', 'link', 'web', 'casino', 'bet', 'slot', 'kiem tien'
];
// Từ trùng với chữ thường khi bỏ dấu (lớn, các, buổi, đeo...): chỉ chặn khi bị viết lách luật ("l0n", "c@c", "b.u.o.i")
const LEET_ONLY_WORDS = new Set(['lon', 'cac', 'buoi', 'deo', 'du', 'di', 'dai', 'nung', 'chich']);
const DIGIT_LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };
const BAD_VI_RE = keywordRegex(BAD_VI_WORDS);
const BAD_ASCII_RE = keywordRegex(BAD_ASCII_WORDS);

function toAscii(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function isCleanForDisplay(raw) {
  const text = String(raw || '').normalize('NFC').trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  if (isBlockedSpamOrToxic(text) || BAD_VI_RE.test(lower)) return false;
  // link, email, @tài khoản, số điện thoại / dãy số dài
  if (/https?:|www\.|\.(com|net|vn|me|io|xyz|link)\b|@\w/i.test(text)) return false;
  if ((text.match(/\d/g) || []).length >= 6) return false;
  const ascii = toAscii(text);
  if (BAD_ASCII_RE.test(ascii)) return false;
  // viết lách luật: "d.m", "v c l", "f*ck", "l0n" → bỏ ký tự chen giữa, đổi số thành chữ rồi so lại
  const squeezed = ascii
    .replace(/[0134578@$]/g, (c) => DIGIT_LEET[c] || c)
    .replace(/(\p{L})[^\p{L}\s]+(?=\p{L})/gu, '$1');
  if (BAD_ASCII_RE.test(squeezed)) return false;
  for (const tok of ascii.split(/\s+/)) {
    if (!/[0-9@$*._-]/.test(tok)) continue;
    const word = tok.replace(/[0134578@$]/g, (c) => DIGIT_LEET[c] || c).replace(/[^a-z]/g, '');
    if (LEET_ONLY_WORDS.has(word)) return false;
  }
  const collapsed = ascii.replace(/\b(\p{L})\s+(?=\p{L}\b)/gu, '$1');
  if (BAD_ASCII_RE.test(collapsed)) return false;
  // toàn chữ in hoa dài (la hét) hoặc lặp ký tự kiểu spam
  const letters = text.match(VI_LETTER_RE) || [];
  if (letters.length >= 12 && text === text.toUpperCase()) return false;
  return true;
}

// So khớp theo NGUYÊN TỪ (không phải chuỗi con): 'que' không khớp "quen", "queo"...
function keywordRegex(words) {
  const alt = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${alt})(?=$|[^\\p{L}\\p{N}])`, 'u');
}

// Mã phòng dùng trong URL /room/:id và tên file lưu trạng thái
function sanitizeRoomId(raw) {
  const id = String(raw || '')
    .trim()
    .toLowerCase()
    // Bỏ dấu tiếng Việt: "Chùa Hương 2" -> "chua-huong-2"
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return id;
}

module.exports = {
  ANON_NAME,
  isCleanForDisplay,
  isBlockedSpamOrToxic,
  sanitizeUserName,
  sanitizeWishText,
  sanitizeRoomId,
  keywordRegex
};
