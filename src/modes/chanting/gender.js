/**
 * Đoán hình nam / nữ cho phật tử từ TÊN HIỂN THỊ (TikTok không cho biết giới tính).
 * Quy tắc: chỉ xếp NAM khi tên có dấu hiệu nam khá rõ; còn lại mặc định NỮ.
 * Đoán sai thì người xem tự bình luận "nam" hoặc "nữ" để đổi — lựa chọn của họ luôn được ưu tiên.
 */
const { sanitizeUserName } = require('../../util/sanitize');

// Tên (chữ cuối) thường dùng cho nam ở Việt Nam. Bỏ các tên dùng cho cả hai giới (An, Minh, Khánh, Linh, Ngọc, Bảo, Anh, Tâm, Tú, Bình…)
const MALE_GIVEN = new Set(
  (
    'hùng dũng tuấn cường thắng long phong quân huy hoàng khang khoa kiên lâm nam nghĩa quang sơn tài thành thiện toàn trung tùng ' +
    'việt vinh vũ đức đạt định hiếu hậu lộc lợi mạnh nhân phát quý sang thịnh tiến trí trọng duy hưng huân kha kiệt luân nguyên ' +
    'nhật phú quyết tân thái thông thuận tín triết vương đông hải hiển hiệp hoà hòa khải khôi lực nhựt phước sỹ sĩ tấn thạch ' +
    'thanh-tùng tuyên tường vĩnh vỹ đăng đông đại điền độ'
  ).split(/\s+/)
);
// Chữ lót / từ xưng hô / từ gợi ý nam (so khớp theo nguyên từ)
const MALE_WORDS = ['văn', 'anh trai', 'chú', 'ông', 'bác trai', 'bố', 'cha', 'chồng', 'thầy', 'boy', 'mr', 'bro', 'king', 'ông xã'];
const MALE_EN = new Set(
  'john david michael tom kevin peter james daniel jack henry ryan eric jason alex andrew tony leo sam paul mark steven brian ken'.split(' ')
);
const MALE_EMOJI = /[\u{1F468}\u{1F9D4}\u{1F466}\u{1F474}\u{2642}\u{1F935}\u{1F57A}]/u;
// Dấu hiệu nữ rõ ràng (ưu tiên hơn dấu hiệu nam)
const FEMALE_WORDS = ['thị', 'chị', 'bà', 'cô', 'mẹ', 'má', 'vợ', 'girl', 'ms', 'mrs', 'bà xã'];

function words(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

function hasPhrase(ws, phrase) {
  const p = phrase.split(' ');
  for (let i = 0; i + p.length <= ws.length; i++) {
    if (p.every((w, j) => ws[i + j] === w)) return true;
  }
  return false;
}

/** @returns {'m'|'f'} */
function guessGender(rawName) {
  const raw = String(rawName || '');
  const ws = words(sanitizeUserName(raw) === 'Thí Chủ Hữu Duyên' ? raw : sanitizeUserName(raw));
  if (FEMALE_WORDS.some((w) => hasPhrase(ws, w))) return 'f';
  if (MALE_EMOJI.test(raw)) return 'm';
  if (MALE_WORDS.some((w) => hasPhrase(ws, w))) return 'm';
  const last = ws[ws.length - 1];
  if (last && (MALE_GIVEN.has(last) || MALE_EN.has(last))) return 'm';
  if (ws[0] && MALE_EN.has(ws[0])) return 'm';
  return 'f';
}

// Bình luận tự chọn hình: "nam", "nữ", "#nam", "tôi là nữ", "con là nam"...
const SELF_RE = /^(?:#|tôi là|toi la|con là|con la|mình là|minh la|em là|em la)?\s*(nam|nữ|nu)\s*[.!🙏]*$/iu;

/** @returns {'m'|'f'|null} */
function parseSelfGender(comment) {
  const m = String(comment || '').trim().match(SELF_RE);
  if (!m) return null;
  return m[1].toLowerCase() === 'nam' ? 'm' : 'f';
}

module.exports = { guessGender, parseSelfGender };
