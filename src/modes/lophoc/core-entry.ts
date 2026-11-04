// Đầu vào đóng gói lõi Lớp Học Chữ (TypeScript, chép từ repo lop-hoc-chu) thành core.cjs cho server Node.
// Thư mục game/ và live/ giữ gần như nguyên bản gốc để dễ kéo bản cập nhật; mọi chỗ nối với app này nằm ở index.js.
import fs from 'node:fs';
import path from 'node:path';
import { parseBank } from './game/questions';

export { Classroom, plain } from './game/quiz';
export { GAME } from './game/config';
export { speakableName } from './live/names';
export { containsBanned, maskBanned } from './live/bannedWords';
export { GiftThanker, OncePerPerson } from './live/chatter';
export { NameBatcher } from './live/scoreboard';

/** Đọc bộ câu hỏi lúc chạy (bản gốc dùng import.meta.glob của Vite): sửa file .txt chỉ cần khởi động lại server */
export function loadBank(dir: string) {
  const files = Object.fromEntries(
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]),
  );
  const errors: string[] = [];
  const questions = parseBank(files, errors);
  return { questions, errors };
}
