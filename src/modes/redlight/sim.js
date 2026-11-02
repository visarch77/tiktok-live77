/**
 * Giả lập người xem cho Đèn Xanh – Đèn Đỏ (chỉ để thử khi chưa live — room.js tự tắt khi kết nối TikTok thật).
 * Mỗi người ảo có tính cách: chăm thả tim hay lười, cẩn thận hay liều (dễ thả tim lúc đèn đỏ).
 */
const FAMILY = 'Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương'.split(' ');
const GIVEN = 'Lan Hùng Mai Tuấn Linh Khang Trang Phong Thảo Nam Vy Huy Nhi Long Hà Quân Yến Đạt Chi Sơn'.split(' ');
const NICKS = ['Bé Su', 'Tí Đẹp Trai', 'Hai Lúa', 'Mây Lang Thang', 'Sóc Nâu', 'Gió Đồng', 'Bin Bon', 'Nắng Mai', 'Đá Cuội', 'Cún Con'];
const CHATS = ['vào', 'me', '1', 'cho mình chơi', 'chạy nè', 'hihi', 'ai về nhất', 'đèn đỏ kìa', '❤️', 'chơi với'];
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

function makeCrowd(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const name = Math.random() < 0.3 ? pick(NICKS) : `${pick(FAMILY)} ${pick(GIVEN)}`;
    out.push({
      user: { user: name, uniqueId: `sim_${i}`, avatar: '', sim: true },
      joined: false,
      eager: 0.25 + Math.random() * 0.6, // xác suất thả tim mỗi nhịp lúc đèn xanh
      reckless: Math.random() < 0.25 ? 0.05 + Math.random() * 0.12 : 0.004 // xác suất lỡ tay lúc đèn đỏ
    });
  }
  return out;
}

function createSim({ onEvent, getPhase, crowd }) {
  let people = makeCrowd(crowd());
  let timer = null;

  function ensureCrowd() {
    const n = crowd();
    if (people.length < n) people = people.concat(makeCrowd(n).slice(people.length).map((p, i) => ({ ...p, user: { ...p.user, uniqueId: `sim_${people.length + i}` } })));
  }

  function step() {
    ensureCrowd();
    const { phase, light, lightStartedAt, graceMs } = getPhase();
    const armed = light === 'red' && Date.now() >= lightStartedAt + graceMs;
    for (const p of people.slice(0, crowd())) {
      if (!p.joined) {
        // Vào dần: lúc chờ vào nhanh hơn
        if (Math.random() < (phase === 'lobby' ? 0.08 : 0.01)) {
          p.joined = true;
          onEvent({ type: 'chat', user: p.user, text: pick(CHATS) });
        }
        continue;
      }
      if (phase !== 'play') {
        if (Math.random() < 0.004) onEvent({ type: 'chat', user: p.user, text: pick(CHATS) });
        continue;
      }
      if (light === 'green' && Math.random() < p.eager) {
        onEvent({ type: 'like', user: p.user, count: 1 + Math.floor(Math.random() * 4) });
      } else if (light === 'warn' && Math.random() < p.eager * 0.3) {
        onEvent({ type: 'like', user: p.user, count: 1 + Math.floor(Math.random() * 2) });
      } else if (armed && Math.random() < p.reckless) {
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
        people = people.concat(makeCrowd(Math.min(n - idle, 200 - start)).map((p, i) => ({ ...p, user: { ...p.user, uniqueId: `sim_${start + i}` } })));
      }
      let added = 0;
      for (const p of people) {
        if (added >= n) break;
        if (p.joined) continue;
        p.joined = true;
        added++;
        onEvent({ type: 'chat', user: p.user, text: pick(CHATS) });
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
