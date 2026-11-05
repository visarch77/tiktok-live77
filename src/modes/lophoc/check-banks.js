// Kiểm tra bộ câu hỏi theo lớp (game/cau-hoi-lop3, -lop4, -lop5), cùng luật với game/bank.check.ts của bản gốc, thêm:
//   - không trùng đáp án trong cùng bộ, với bộ chung (game/cau-hoi) và với bộ lớp khác
//   - đủ câu cho mỗi chỗ trong tiết (câu chữ dễ / vừa / khó, tiếng Anh, đố mẹo, lịch sử)
// Chạy: node src/modes/lophoc/check-banks.js            (cả 3 lớp)
//       node src/modes/lophoc/check-banks.js lop4       (1 lớp)
const fs = require('fs');
const path = require('path');
const { ensureBuilt } = require('./build');
ensureBuilt();
const { loadBank, compactVi, normVi } = require('./core.cjs');

const GAME_DIR = path.join(__dirname, 'game');
const GRADES = ['lop3', 'lop4', 'lop5'];
const MAX_LETTERS = 14;
// tối thiểu để ~15 tiết không lặp câu (mỗi tiết: 10 câu chữ, 2 tiếng Anh, 2 đố mẹo, 2 lịch sử)
const MIN = { easy: 50, medium: 70, hard: 45, anh: 40, meo: 30, su: 30 };

const keyOf = (a) => compactVi(a);
function answersOf(qs) {
  const m = new Map();
  for (const q of qs) for (const a of [q.answer, ...(q.acceptedAnswers || [])]) m.set(keyOf(a), q.id);
  return m;
}

const general = loadBank(path.join(GAME_DIR, 'cau-hoi')).questions;
const generalKeys = new Map(general.map((q) => [keyOf(q.answer), q.id]));
const banks = {};
for (const g of GRADES) {
  const dir = path.join(GAME_DIR, `cau-hoi-${g}`);
  banks[g] = fs.existsSync(dir) ? loadBank(dir) : { questions: [], errors: [] };
}

const only = process.argv[2];
let failed = false;
for (const g of GRADES) {
  if (only && only !== g) continue;
  const { questions: bank, errors: parseErrors } = banks[g];
  const errors = [...parseErrors];
  const seen = new Map();
  for (const q of bank) {
    const n = compactVi(q.answer).length;
    if (n < 2 || n > MAX_LETTERS) errors.push(`${q.id}: đáp án ${n} chữ (cho phép 2-${MAX_LETTERS})`);
    if (!/^l[345]-/.test(q.id)) errors.push(`${q.id}: tên file phải bắt đầu bằng "l3-" / "l4-" / "l5-" (để id câu không trùng bộ khác)`);
    const k = keyOf(q.answer);
    if (seen.has(k)) errors.push(`${q.id}: trùng đáp án với ${seen.get(k)} trong cùng bộ`);
    seen.set(k, q.id);
    if (generalKeys.has(k)) errors.push(`${q.id}: trùng đáp án với bộ chung (${generalKeys.get(k)})`);
    for (const o of GRADES) {
      if (o === g) continue;
      const other = banks[o].questions.find((x) => keyOf(x.answer) === k);
      if (other) errors.push(`${q.id}: trùng đáp án với bộ ${o} (${other.id})`);
    }
    const words = ` ${normVi(q.clue).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
    if (words.includes(` ${normVi(q.answer)} `)) errors.push(`${q.id}: gợi ý lộ đáp án: ${q.clue}`);
    for (const a of q.acceptedAnswers || []) if (compactVi(a) === compactVi(q.answer)) errors.push(`${q.id}: cách viết khác thừa (${a})`);
    if (!q.kind) errors.push(`${q.id}: thiếu dòng "> Đây là..." trước câu này`);
    if (q.slot === 'anh' && !/^[A-Z][A-Z ']*$/.test(q.answer)) errors.push(`${q.id}: đáp án tiếng Anh chỉ gồm chữ in hoa A-Z`);
    if (q.slot === 'meo' && q.difficulty !== 'medium') errors.push(`${q.id}: câu đố mẹo để độ khó 2`);
  }
  const plain = bank.filter((q) => !q.slot);
  const count = {
    easy: plain.filter((q) => q.difficulty === 'easy').length,
    medium: plain.filter((q) => q.difficulty === 'medium').length,
    hard: plain.filter((q) => q.difficulty === 'hard').length,
    anh: bank.filter((q) => q.slot === 'anh').length,
    meo: bank.filter((q) => q.slot === 'meo').length,
    su: bank.filter((q) => q.slot === 'su').length
  };
  for (const [k, min] of Object.entries(MIN)) if (count[k] < min) errors.push(`thiếu câu ${k}: có ${count[k]}, cần ít nhất ${min}`);
  const cats = new Set(plain.map((q) => q.category));
  console.log(`\n[${g}] ${bank.length} câu · ${cats.size} chủ đề câu chữ · dễ ${count.easy} · vừa ${count.medium} · khó ${count.hard} · tiếng Anh ${count.anh} · đố mẹo ${count.meo} · lịch sử ${count.su}`);
  if (errors.length) {
    failed = true;
    console.log(`LỖI ${errors.length}:\n  ` + errors.join('\n  '));
  } else console.log('ổn');
}
process.exit(failed ? 1 : 0);
