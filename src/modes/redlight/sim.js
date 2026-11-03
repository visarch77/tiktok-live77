/**
 * Giả lập người xem cho Đèn Xanh – Đèn Đỏ (chỉ để thử khi chưa live — room.js tự tắt khi kết nối TikTok thật).
 * Mỗi người ảo có tính cách: chăm thả tim hay lười, cẩn thận hay liều (dễ thả tim lúc đèn đỏ).
 */
const FAMILY = 'Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương'.split(' ');
const GIVEN = 'Lan Hùng Mai Tuấn Linh Khang Trang Phong Thảo Nam Vy Huy Nhi Long Hà Quân Yến Đạt Chi Sơn'.split(' ');
const NICKS = ['Bé Su', 'Tí Đẹp Trai', 'Hai Lúa', 'Mây Lang Thang', 'Sóc Nâu', 'Gió Đồng', 'Bin Bon', 'Nắng Mai', 'Đá Cuội', 'Cún Con'];
const CHATS = ['vào', 'me', '1', 'cho mình chơi', 'chạy nè', 'hihi', 'ai về nhất', 'đèn đỏ kìa', '❤️', 'chơi với'];
const EN = require('./i18n-en').SIM;
const GIFTS = [
  { giftName: 'Rose', coins: 1 },
  { giftName: 'Rose', coins: 1 },
  { giftName: 'Rose', coins: 1 },
  { giftName: 'Finger Heart', coins: 5 },
  { giftName: 'Heart Me', coins: 1 },
  { giftName: 'Ice Cream Cone', coins: 1 },
  { giftName: 'Doughnut', coins: 30 },
  { giftName: 'GG', coins: 1 },
  { giftName: 'Confetti', coins: 100 },
  { giftName: 'Hat and Mustache', coins: 99 },
  { giftName: 'Teddy Bear', coins: 10 }
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function makeCrowd(n, en = false) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const name = en
      ? Math.random() < 0.3 ? pick(EN.NICKS) : `${pick(EN.FIRST)} ${pick(EN.LAST)}`
      : Math.random() < 0.3 ? pick(NICKS) : `${pick(FAMILY)} ${pick(GIVEN)}`;
    out.push({
      user: { user: name, uniqueId: `sim_${i}`, avatar: '', sim: true },
      joined: false,
      eager: 0.4 + Math.random() * 0.55, // xác suất thả tim mỗi nhịp lúc đèn xanh
      lagMs: 1000 + Math.random() * 3000, // thấy hình chậm như người xem TikTok thật
      reckless: Math.random() < 0.25 ? 0.05 + Math.random() * 0.12 : 0.004 // xác suất lỡ tay lúc đèn đỏ
    });
  }
  return out;
}

function createSim({ onEvent, getPhase, crowd, lang = () => 'vi' }) {
  let people = makeCrowd(crowd(), lang() === 'en');
  let peopleLang = lang();
  let timer = null;

  function ensureCrowd() {
    const n = crowd();
    // đổi ngôn ngữ phòng: tạo lại người ảo với tên theo ngôn ngữ mới (người đã vào sân giữ tên cũ tới hết ván)
    if (lang() !== peopleLang) {
      peopleLang = lang();
      people = makeCrowd(n, peopleLang === 'en');
    }
    if (people.length < n) people = people.concat(makeCrowd(n, lang() === 'en').slice(people.length).map((p, i) => ({ ...p, user: { ...p.user, uniqueId: `sim_${people.length + i}` } })));
  }

  // Lịch sử đèn để mỗi người ảo "thấy" đèn trễ lagMs
  const seenLog = [];
  function seenLight(lagMs) {
    const t = Date.now() - lagMs;
    for (let i = seenLog.length - 1; i >= 0; i--) if (seenLog[i].t <= t) return seenLog[i].light;
    return seenLog.length ? seenLog[0].light : 'green';
  }

  function step() {
    ensureCrowd();
    const { phase, light } = getPhase();
    const cur = phase === 'play' ? light : 'lobby';
    if (!seenLog.length || seenLog[seenLog.length - 1].light !== cur) seenLog.push({ t: Date.now(), light: cur });
    while (seenLog.length > 2 && seenLog[1].t < Date.now() - 8000) seenLog.shift();
    for (const p of people.slice(0, crowd())) {
      if (!p.joined) {
        // Vào dần: lúc chờ vào nhanh hơn
        if (Math.random() < (phase === 'lobby' ? 0.08 : 0.01)) {
          p.joined = true;
          onEvent({ type: 'chat', user: p.user, text: pick(lang() === 'en' ? EN.CHATS : CHATS) });
        }
        continue;
      }
      if (phase !== 'play') {
        if (Math.random() < 0.004) onEvent({ type: 'chat', user: p.user, text: pick(lang() === 'en' ? EN.CHATS : CHATS) });
        continue;
      }
      const seen = seenLight(p.lagMs);
      if (seen === 'green' && Math.random() < p.eager) {
        onEvent({ type: 'like', user: p.user, count: 2 + Math.floor(Math.random() * 5) });
      } else if (seen === 'warn' && Math.random() < p.eager * 0.3) {
        onEvent({ type: 'like', user: p.user, count: 1 + Math.floor(Math.random() * 2) });
      } else if (seen === 'red' && Math.random() < p.reckless) {
        onEvent({ type: 'like', user: p.user, count: 1 });
      }
      if (Math.random() < 0.0004) onEvent({ type: 'gift', user: p.user, count: 1, ...pick(GIFTS) });
    }
  }

  return {
    setRunning(on) {
      clearInterval(timer);
      timer = null;
      if (on) timer = setInterval(step, 400);
      else for (const p of people) p.joined = false;
    },
    burst(n) {
      ensureCrowd();
      // Thiếu người ảo chưa vào thì tạo thêm (tối đa 200)
      const idle = people.filter((p) => !p.joined).length;
      if (idle < n && people.length < 200) {
        const start = people.length;
        people = people.concat(makeCrowd(Math.min(n - idle, 200 - start), lang() === 'en').map((p, i) => ({ ...p, user: { ...p.user, uniqueId: `sim_${start + i}` } })));
      }
      let added = 0;
      for (const p of people) {
        if (added >= n) break;
        if (p.joined) continue;
        p.joined = true;
        added++;
        onEvent({ type: 'chat', user: p.user, text: pick(lang() === 'en' ? EN.CHATS : CHATS) });
      }
      return { added };
    },
    randomGift() {
      const joined = people.filter((p) => p.joined);
      const p = joined.length ? pick(joined) : pick(people);
      p.joined = true;
      const g = pick(GIFTS);
      onEvent({ type: 'gift', user: p.user, count: 1, ...g });
      return { user: p.user.user, gift: g.giftName };
    }
  };
}

module.exports = { createSim };
