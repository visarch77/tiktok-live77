/**
 * Câu toán nhẩm theo lớp (bộ câu hỏi lớp 3 / 4 / 5). Thay cho game/math.ts của bản gốc khi phòng chọn bộ theo lớp.
 * Mỗi tiết có 4 câu toán ở cấp 1 → 4 (GAME.roundPlan 'math1'..'math4'), khó dần theo chương trình lớp đó.
 * Đáp án luôn là số tự nhiên để người xem gõ nhanh. `say` là cách cô đọc, ghép được thành "<say> bằng mấy?"
 * và "<say> bằng <đáp án>" (lúc hiện đáp án).
 */

const DIFF = { 1: 'easy', 2: 'medium', 3: 'hard', 4: 'hard' };

function maker(rand) {
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  return { int, pick, coin: () => rand() < 0.5 };
}

// Mỗi hàm trả [show, say, n]
const GRADES = {
  // Lớp 3: cộng trừ có nhớ trong phạm vi 1000, bảng nhân chia 2–9, nhân chia số 2–3 chữ số với số 1 chữ số, biểu thức 2 bước
  3: {
    1: ({ int, coin }) => {
      if (coin()) {
        const a = int(25, 79), b = int(16, 69);
        return [`${a} + ${b}`, `${a} cộng ${b}`, a + b];
      }
      const a = int(52, 99), b = int(17, a - 12);
      return [`${a} − ${b}`, `${a} trừ ${b}`, a - b];
    },
    2: ({ int, coin }) => {
      const a = int(3, 9), b = int(4, 9);
      if (coin()) return [`${a} × ${b}`, `${a} nhân ${b}`, a * b];
      return [`${a * b} : ${a}`, `${a * b} chia ${a}`, b];
    },
    3: ({ int, coin }) => {
      if (coin()) {
        const a = int(12, 34), b = int(2, 4);
        return [`${a} × ${b}`, `${a} nhân ${b}`, a * b];
      }
      const b = int(2, 5), n = int(12, 24);
      return [`${n * b} : ${b}`, `${n * b} chia ${b}`, n];
    },
    4: ({ int, pick }) => {
      const kind = pick([0, 1, 2]);
      if (kind === 0) {
        const a = int(3, 9), b = int(3, 9), c = int(10, 40);
        return [`${a} × ${b} + ${c}`, `${a} nhân ${b} cộng ${c}`, a * b + c];
      }
      if (kind === 1) {
        const b = int(2, 6), q = int(5, 15), c = int(2, 4);
        return [`${b * q} : ${b} × ${c}`, `${b * q} chia ${b} rồi nhân ${c}`, q * c];
      }
      const a = int(120, 480), b = int(110, 390);
      return [`${a} + ${b}`, `${a} cộng ${b}`, a + b];
    }
  },
  // Lớp 4: số tròn chục / trăm, nhân số 2 chữ số, trung bình cộng, phân số của một số
  4: {
    1: ({ int, coin }) => {
      const t = int(2, 9) * (coin() ? 10 : 100), b = int(2, 9);
      if (coin()) return [`${t} × ${b}`, `${t} nhân ${b}`, t * b];
      return [`${t * b} : ${b}`, `${t * b} chia ${b}`, t];
    },
    2: ({ int, coin }) => {
      if (coin()) {
        const a = int(23, 89), b = int(3, 9);
        return [`${a} × ${b}`, `${a} nhân ${b}`, a * b];
      }
      const a = int(234, 789), b = int(125, 499);
      return [`${a} + ${b}`, `${a} cộng ${b}`, a + b];
    },
    3: ({ int, pick }) => {
      if (pick([0, 1]) === 0) {
        // trung bình cộng 3 số, kết quả nguyên
        const m = int(12, 40), d = int(1, 9);
        const xs = [m - d, m, m + d];
        return [`TB cộng ${xs.join(', ')}`, `trung bình cộng của ${xs[0]}, ${xs[1]} và ${xs[2]}`, m];
      }
      const a = pick([11, 12, 15, 25]), b = a === 25 ? 4 * int(1, 6) : int(3, 9);
      return [`${a} × ${b}`, `${a} nhân ${b}`, a * b];
    },
    4: ({ int, pick }) => {
      const [p, q] = pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5]]);
      const n = q * int(3, 12);
      return [`${p}/${q} của ${n}`, `${p} phần ${q} của ${n}`, (n / q) * p];
    }
  },
  // Lớp 5: nhân chia với 10 / 100, số thập phân, tỉ số phần trăm, diện tích, thể tích, vận tốc
  5: {
    1: ({ int, pick }) => {
      const kind = pick([0, 1]);
      if (kind === 0) {
        const a = int(12, 98), z = pick([10, 100]);
        return [`${a} × ${z}`, `${a} nhân ${z}`, a * z];
      }
      const a = int(2, 9), b = int(1, 9);
      // hai số thập phân cộng lại tròn: 2,5 + 3,5
      const c = 10 - b;
      return [`${a},${b} + ${a + 1},${c}`, `${a} phẩy ${b} cộng ${a + 1} phẩy ${c}`, 2 * a + 2];
    },
    2: ({ int, pick }) => {
      const [pc, mul] = pick([[10, 10], [20, 5], [25, 4], [50, 2], [75, 4]]);
      const n = mul * int(2, 12);
      return [`${pc}% của ${n}`, `${pc} phần trăm của ${n}`, (n * pc) / 100];
    },
    3: ({ int, pick }) => {
      const kind = pick([0, 1, 2]);
      if (kind === 0) {
        const d = int(2, 9) * 2, h = int(3, 9);
        return [`Tam giác đáy ${d}, cao ${h}: S?`, `diện tích hình tam giác đáy ${d}, chiều cao ${h}`, (d * h) / 2];
      }
      if (kind === 1) {
        const a = int(2, 6);
        return [`Lập phương cạnh ${a}: V?`, `thể tích hình lập phương cạnh ${a}`, a * a * a];
      }
      const a = int(3, 8), b = int(2, 6), c = int(2, 5);
      return [`Hộp ${a}×${b}×${c}: V?`, `thể tích hình hộp chữ nhật dài ${a}, rộng ${b}, cao ${c}`, a * b * c];
    },
    4: ({ int, pick }) => {
      const kind = pick([0, 1]);
      if (kind === 0) {
        const t = int(2, 5), v = int(6, 12) * 5;
        return [`${v * t} km trong ${t} giờ: v?`, `vận tốc khi đi ${v * t} ki-lô-mét trong ${t} giờ`, v];
      }
      const a = int(12, 30), b = int(3, 9), c = int(2, 6), d = int(5, 20);
      return [`(${a} + ${b}) × ${c} − ${d}`, `${a} cộng ${b}, tất cả nhân ${c}, rồi trừ ${d}`, (a + b) * c - d];
    }
  }
};

/** grade: 3 | 4 | 5; level: 1..4 (vị trí câu toán trong tiết) */
function makeGradeMath(grade, level, rand = Math.random) {
  const g = GRADES[grade];
  const lv = Math.max(1, Math.min(4, Number(level) || 1));
  const [show0, say, n] = g[lv](maker(rand));
  const show = show0.endsWith('?') ? show0 : `${show0} = ?`;
  return {
    id: `toan-l${grade}:${show}`,
    answer: String(n),
    clue: `${say} bằng mấy?`,
    category: 'Toán nhẩm',
    kind: 'Câu toán nhẩm.',
    difficulty: DIFF[lv],
    math: { show, say }
  };
}

module.exports = { makeGradeMath };
