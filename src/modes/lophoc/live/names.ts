import { containsBanned } from './bannedWords';

/**
 * Tên TikTok -> tên cho giọng đọc (lấy từ Đi Chùa Online, đã chạy thật trên live).
 *   'Bé Na 🌸'        -> 'Bé Na'
 *   '𝑵𝒈𝒖𝒚𝒆̂̃𝒏'         -> 'Nguyễn'       (chữ kiểu lạ về chữ thường)
 *   'an99'             -> 'an chín chín' (số đọc thành chữ)
 *   'duyanh', 'MinhTuan' -> 'duy anh', 'Minh Tuan'
 *   tên có từ cấm      -> 'bạn'
 * Chỉ dùng để ĐỌC. Hiện trên màn hình thì dùng maskBanned.
 */

const DIGITS: Record<string, string> = {
  '0': 'không',
  '1': 'một',
  '2': 'hai',
  '3': 'ba',
  '4': 'bốn',
  '5': 'năm',
  '6': 'sáu',
  '7': 'bảy',
  '8': 'tám',
  '9': 'chín',
};

// Tên Việt hay viết dính: "duyanh" -> "duy anh". Chỉ tách chữ thường không dấu, phần còn lại >= 2 chữ.
const NAME_STARTS = [
  'hoang', 'tuyet', 'thanh', 'trung', 'quang', 'minh', 'ngoc', 'phuc', 'xuan', 'quoc',
  'viet', 'tien', 'tuan', 'hong', 'duy', 'van', 'kim', 'hai', 'nam',
];

const MAX_WORDS = 5; // tên quá dài thì đọc 5 chữ đầu

export function speakableName(nickname: string): string {
  if (!nickname) return 'bạn';

  let clean = nickname
    .normalize('NFKC') // 𝑵𝒈𝒖𝒚𝒆̂̃𝒏 -> Nguyễn
    .replace(/[\u{FE00}-\u{FE0F}‍⃣]/gu, '') // dấu phụ của emoji
    .replace(/[^\p{L}\p{M}\p{N}\s._-]/gu, ' ') // emoji, ký hiệu
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean || containsBanned(clean)) return 'bạn';
  if (/^user\d{4,}$/i.test(clean)) return 'bạn'; // tên mặc định của TikTok (user5639920112): đọc "user" nghe kỳ

  clean = clean
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2') // MinhTuan -> Minh Tuan
    .replace(/(\p{L})(\d)/gu, '$1 $2') // an99 -> an 99
    .replace(/(\d)(\p{L})/gu, '$1 $2')
    .replace(/[._-]+/g, ' ');

  const out: string[] = [];
  for (const w of clean.split(/\s+/).filter(Boolean)) {
    if (/^\d+$/.test(w)) {
      // số dài (số điện thoại, 2008...) đọc từng chữ số; quá 4 số thì bỏ cho đỡ dài
      if (w.length <= 4) out.push(w.split('').map((d) => DIGITS[d]).join(' '));
      continue;
    }
    const start = /^[a-z]+$/.test(w) ? NAME_STARTS.find((p) => w.startsWith(p) && w.length - p.length >= 2) : undefined;
    if (start) out.push(start, w.slice(start.length));
    else out.push(w);
  }

  const spoken = out.slice(0, MAX_WORDS).join(' ').trim();
  return spoken || 'bạn';
}
