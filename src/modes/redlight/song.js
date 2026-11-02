/**
 * Câu hát của búp bê ("Mu-gung-hwa kkot-chi pi-eot-seum-ni-da", public/assets/redlight/song.m4a, 5,15 giây).
 * Đèn xanh kéo dài đúng bằng câu hát; hát xong là đèn đỏ. Mỗi chữ hát với tốc độ riêng để người chơi khó đoán.
 *
 * CUTS: mốc đầu mỗi chữ trong file (giây), đo theo phổ âm. Màn hình phát lại theo cùng mốc và tốc độ server gửi.
 *
 * Chế độ (mode):
 *   steady    đều đều, cả câu một tốc độ (ngẫu nhiên chậm vừa → nhanh vừa)
 *   slowFast  chậm đầu, nhanh dần về cuối
 *   fastSlow  nhanh đầu, chậm dần về cuối
 *   jerky     thất thường: mỗi chữ một tốc độ ngẫu nhiên
 *   random    mỗi lần hát chọn ngẫu nhiên một trong bốn kiểu trên
 */
const CUTS = [0, 0.52, 0.9, 1.5, 2.5, 3.05, 3.5, 3.8, 4.25, 4.7, 5.15];
const MODES = ['steady', 'slowFast', 'fastSlow', 'jerky'];
const MODE_NAMES = { steady: 'Đều đều', slowFast: 'Chậm → nhanh', fastSlow: 'Nhanh → chậm', jerky: 'Thất thường', random: 'Ngẫu nhiên' };
const MIN_RATE = 0.55;
const MAX_RATE = 2.0;

const rand = (a, b) => a + Math.random() * (b - a);
const round2 = (x) => Math.round(x * 100) / 100;

function planSong(mode = 'random') {
  const kind = MODES.includes(mode) ? mode : MODES[Math.floor(Math.random() * MODES.length)];
  const n = CUTS.length - 1;
  let rates;
  if (kind === 'steady') {
    const base = rand(0.8, 1.3);
    rates = Array.from({ length: n }, () => base);
  } else if (kind === 'slowFast' || kind === 'fastSlow') {
    const slow = rand(MIN_RATE, 0.7);
    const fast = rand(1.6, MAX_RATE);
    rates = Array.from({ length: n }, (_, i) => slow + (fast - slow) * (i / (n - 1)) ** 1.3);
    if (kind === 'fastSlow') rates.reverse();
  } else {
    // thất thường: luôn có ít nhất một chữ rất chậm và một chữ rất nhanh
    rates = Array.from({ length: n }, () => rand(MIN_RATE, MAX_RATE));
    const i = Math.floor(Math.random() * n);
    const j = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
    rates[i] = rand(MIN_RATE, 0.65);
    rates[j] = rand(1.8, MAX_RATE);
  }
  rates = rates.map(round2);
  const durationMs = Math.round(rates.reduce((s, r, i) => s + (CUTS[i + 1] - CUTS[i]) / r, 0) * 1000);
  return { mode: kind, rates, durationMs };
}

module.exports = { CUTS, MODES, MODE_NAMES, planSong };
