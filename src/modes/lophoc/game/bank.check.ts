// Kiểm tra bộ câu hỏi: npx tsx src/game/bank.check.ts
import fs from 'node:fs';
import path from 'node:path';
import { parseBank } from './questions';
import { compactVi, normVi } from './quiz';

const dir = path.join(import.meta.dirname, 'cau-hoi');
const files = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]));
const errors: string[] = [];
const bank = parseBank(files, errors);
const MAX_LETTERS = 14; // nhiều hơn thì miếng chữ trên bảng quá nhỏ

const seen = new Map<string, string>();
for (const q of bank) {
  const n = compactVi(q.answer).length;
  if (n < 2 || n > MAX_LETTERS) errors.push(`${q.id}: đáp án ${n} chữ (cho phép 2-${MAX_LETTERS})`);
  if (seen.has(q.id)) errors.push(`${q.id}: trùng trong cùng chủ đề`);
  seen.set(q.id, q.clue);
  // gợi ý lộ nguyên đáp án (so cả từ, có dấu)
  const words = ` ${normVi(q.clue).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  if (words.includes(` ${normVi(q.answer)} `)) errors.push(`${q.id}: gợi ý lộ đáp án: ${q.clue}`);
  // cách viết khác chỉ khác dấu cũ/mới hoặc khoảng trắng thì game đã tự hiểu, khỏi ghi
  for (const a of q.acceptedAnswers ?? []) if (compactVi(a) === compactVi(q.answer)) errors.push(`${q.id}: cách viết khác thừa (${a})`);
  if (!q.kind) errors.push(`${q.id}: chủ đề thiếu câu "Đây là..." (dòng bắt đầu bằng >)`);
}
const byAnswer = new Map<string, string[]>();
for (const q of bank) byAnswer.set(compactVi(q.answer), [...(byAnswer.get(compactVi(q.answer)) ?? []), q.id]);
const dup = [...byAnswer.values()].filter((v) => v.length > 1);

const count = (d: string) => bank.filter((q) => q.difficulty === d).length;
const cats = new Set(bank.map((q) => q.category));
console.log(`${bank.length} câu, ${cats.size} chủ đề · dễ ${count('easy')} · vừa ${count('medium')} · khó ${count('hard')}`);
if (dup.length) console.log(`Cùng đáp án ở 2 chủ đề (gợi ý khác nhau, vẫn cho phép): ${dup.length} cặp, vd ${dup.slice(0, 5).map((d) => d.join(' / ')).join('; ')}`);
if (errors.length) {
  console.log(`LỖI ${errors.length}:\n` + errors.join('\n'));
  process.exit(1);
}
console.log('bank.check: ổn');
