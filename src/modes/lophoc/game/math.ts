import type { Question } from './questions';

// Câu toán nhẩm: game tự sinh lúc vào tiết nên không bao giờ hết câu, không ghi vào sổ lớp.
// Cấp 1 cộng trừ 1 chữ số · 2 cộng trừ 2 chữ số · 3 nhân chia bảng cửu chương · 4 phép tính hai bước.
// Đáp án luôn là số tự nhiên, người xem gõ số (vd "83").

export type MathLevel = 1 | 2 | 3 | 4;

const DIFF = { 1: 'easy', 2: 'medium', 3: 'hard', 4: 'hard' } as const;

export function makeMath(level: MathLevel, rand = Math.random): Question {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const coin = () => rand() < 0.5;
  let show: string;
  let say: string;
  let n: number;
  if (level === 1) {
    if (coin()) {
      const a = int(3, 9), b = int(2, 9);
      [show, say, n] = [`${a} + ${b}`, `${a} cộng ${b}`, a + b];
    } else {
      const b = int(2, 9), a = b + int(2, 9);
      [show, say, n] = [`${a} − ${b}`, `${a} trừ ${b}`, a - b];
    }
  } else if (level === 2) {
    if (coin()) {
      const a = int(14, 68), b = int(12, 39);
      [show, say, n] = [`${a} + ${b}`, `${a} cộng ${b}`, a + b];
    } else {
      const a = int(41, 99), b = int(12, a - 8);
      [show, say, n] = [`${a} − ${b}`, `${a} trừ ${b}`, a - b];
    }
  } else if (level === 3) {
    const a = int(6, 12), b = int(3, 9);
    if (coin()) [show, say, n] = [`${a} × ${b}`, `${a} nhân ${b}`, a * b];
    else [show, say, n] = [`${a * b} : ${b}`, `${a * b} chia ${b}`, a];
  } else {
    const kind = int(0, 2);
    if (kind === 0) {
      const a = int(10, 60), b = int(3, 9), c = int(3, 9);
      [show, say, n] = [`${a} + ${b} × ${c}`, `${a} cộng ${b} nhân ${c}`, a + b * c];
    } else if (kind === 1) {
      const a = int(4, 9), b = int(4, 9), c = int(2, 15);
      [show, say, n] = [`${a} × ${b} − ${c}`, `${a} nhân ${b} trừ ${c}`, a * b - c];
    } else {
      const a = int(2, 9), b = int(2, 9), c = int(3, 8);
      [show, say, n] = [`(${a} + ${b}) × ${c}`, `${a} cộng ${b}, tất cả nhân ${c}`, (a + b) * c];
    }
  }
  return {
    id: `toan:${show}`,
    answer: String(n),
    clue: `${say} bằng mấy?`,
    category: 'Toán nhẩm',
    kind: 'Câu toán nhẩm.',
    difficulty: DIFF[level],
    math: { show: `${show} = ?`, say },
  };
}
