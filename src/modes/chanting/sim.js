/**
 * Giả lập người xem cho Phòng Tụng Kinh (chỉ để thử khi chưa live — room.js tự tắt khi kết nối TikTok thật).
 * Tạo một đám đông có tên Việt đa dạng (nam/nữ, biệt danh, kiểu tài khoản TikTok) với đủ hoạt động:
 * vào đạo tràng, thả tim (dồn lại sau tiếng chuông), lời nguyện, đề nghị bài kinh, dâng hương, quà, mời bạn,
 * tự sửa hình nam/nữ khi bị đoán sai theo tên.
 */
const { guessGender } = require('./gender');

const SIM_PREFIX = 'sim_';

// Mức nhộn nhịp: số hoạt động mỗi phút, và tốc độ người mới vào (tỉ lệ đám đông mỗi nhịp)
const SIM_LEVELS = {
  calm: { perMin: 12, ramp: 0.03 },
  normal: { perMin: 35, ramp: 0.06 },
  busy: { perMin: 90, ramp: 0.12 },
  festival: { perMin: 200, ramp: 0.25 }
};

const FAMILY = 'Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương Lý Đinh Trương Mai Cao'.split(' ');
const MALE_MID = 'Văn Đức Minh Quang Hữu Thanh Gia Công Tiến Bảo'.split(' ');
const MALE_GIVEN = 'Hùng Dũng Tuấn Cường Long Phong Quân Huy Khang Khoa Nam Sơn Thành Trung Tùng Việt Vinh Đạt Hiếu Lộc Phát Trí Hưng Nhật Phúc Tài Kiên Thịnh'.split(' ');
const FEMALE_MID = 'Thị Ngọc Thu Thanh Mai Bảo Kim Hồng Phương Khánh'.split(' ');
const FEMALE_GIVEN = 'Lan Hoa Hương Mai Linh Trang Thảo Hà Ngân Yến Nhung Vy Nhi Hạnh Tâm An Uyên Chi Quỳnh Diệp Trâm Giang Hằng Thư'.split(' ');
const FEMALE_NICK = ['Mây Lang Thang', 'Bé Su', 'Sen Hồng 🌸', 'Hoa Sữa', 'Mẹ Bỉm Sữa', 'Cô Giáo Thảo', 'Bà Ngoại Tư', 'Chị Hai Cần Thơ', 'Nắng Mai', 'Hạt Mưa Nhỏ'];
const MALE_NICK = ['Anh Ba Sài Gòn', 'Chú Tư Bến Tre', 'Gió Đồng', 'Bin Bon', 'Tí Đẹp Trai', 'Hai Lúa', 'Ông Bảy Hiền', 'Thầy Giáo Làng', 'Đá Cuội', 'Sóc Nâu'];
const ASCII = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

const WISHES = [
  'Nam mô A Di Đà Phật 🙏',
  'A Di Đà Phật',
  '🙏🙏🙏',
  'Con xin tùy hỷ công đức',
  'Nguyện cho mọi người được bình an',
  'Mong cả nhà luôn mạnh khỏe, sống hiền lành',
  'Con nguyện sống tử tế hơn mỗi ngày',
  'Cầu cho bà nội mau khỏe',
  'Hôm nay con tụng cùng mọi người',
  'Tâm thấy an lạc quá',
  'Chúc đạo tràng an vui',
  'Con chào cả nhà, chúc an lành',
  'Nguyện thế giới hòa bình',
  'Cảm ơn đạo tràng, tâm con thấy nhẹ nhàng',
  'Nguyện hồi hướng cho ông bà đã khuất',
  'Mong con thi đậu, sống có ích',
  'Xin cho mẹ con bớt bệnh',
  'Nghe tiếng mõ thấy lòng lắng lại'
];
const GIFTS = ['Rose', 'Rose', 'Heart Me', 'Finger Heart', 'TikTok', 'GG', 'Perfume', 'Doughnut', 'Ice Cream Cone', 'Swan', 'Paper Crane', 'Butterfly', 'Galaxy', 'Lion', 'Whale diving', 'Bouquet', 'Hand Hearts', 'Castle Fantasy'];

// Số ngẫu nhiên cố định theo chỉ số: cùng một người giả lập luôn có cùng tên
function seeded(i) {
  let a = (i + 1) * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = (r, arr) => arr[Math.floor(r() * arr.length)];

function makeSimUser(i) {
  const r = seeded(i);
  const gender = r() < 0.55 ? 'f' : 'm';
  const fam = pickR(r, FAMILY);
  const mid = pickR(r, gender === 'm' ? MALE_MID : FEMALE_MID);
  const given = pickR(r, gender === 'm' ? MALE_GIVEN : FEMALE_GIVEN);
  const roll = r();
  let name;
  if (roll < 0.4) name = `${fam} ${mid} ${given}`;
  else if (roll < 0.75) name = `${mid === 'Thị' || mid === 'Văn' ? pickR(r, gender === 'm' ? MALE_GIVEN : FEMALE_GIVEN) : mid} ${given}`;
  else if (roll < 0.9) name = pickR(r, gender === 'm' ? MALE_NICK : FEMALE_NICK);
  else name = `${ASCII(given)}.${ASCII(fam)}${Math.floor(r() * 90 + 10)}`;
  return { user: name, uniqueId: `${SIM_PREFIX}${i}`, gender };
}

/**
 * @param {object} api các hàm của chế độ tụng kinh: seat, like, comment, gift, invite, phase(), seatedSimKeys(), simulated(fn)
 */
function createSimulator(api) {
  const pool = [];
  const corrected = new Set();
  const timers = new Set();

  function poolUser(i) {
    while (pool.length <= i) pool.push(makeSimUser(pool.length));
    return pool[i];
  }

  function later(ms, fn) {
    const t = setTimeout(() => {
      timers.delete(t);
      api.simulated(fn);
    }, Math.max(0, Math.round(ms)));
    timers.add(t);
  }

  function randomSeated() {
    const keys = api.seatedSimKeys();
    if (!keys.length) return null;
    const key = keys[Math.floor(Math.random() * keys.length)];
    return poolUser(Number(key.slice(SIM_PREFIX.length)));
  }

  // Người bị đoán sai hình theo tên tự bình luận "nam" / "nữ" (như người xem thật)
  function maybeCorrect(u) {
    if (corrected.has(u.uniqueId) || guessGender(u.user) === u.gender) return false;
    corrected.add(u.uniqueId);
    if (Math.random() < 0.35) return false; // có người không buồn sửa
    api.comment(u, u.gender === 'm' ? 'nam' : 'nữ');
    return true;
  }

  function randomAction() {
    const u = randomSeated();
    if (!u) return;
    if (maybeCorrect(u)) return;
    const r = Math.random();
    if (r < 0.52) api.like(u, 1 + Math.floor(Math.random() * 12));
    else if (r < 0.66) api.comment(u, WISHES[Math.floor(Math.random() * WISHES.length)]);
    else if (r < 0.71) api.comment(u, `kinh ${1 + Math.floor(Math.random() * 9)}`);
    else if (r < 0.78) api.comment(u, Math.random() < 0.8 ? 'dâng hương' : '🔥');
    else if (r < 0.86) api.gift(u, { giftName: GIFTS[Math.floor(Math.random() * GIFTS.length)] });
    else if (r < 0.91) api.invite(u);
    else api.like(u, 1 + Math.floor(Math.random() * 4));
  }

  /** Một nhịp giả lập: rải các hoạt động đều trong khoảng intervalMs tới */
  function tick({ intervalMs, level, crowd }) {
    const L = SIM_LEVELS[level] || SIM_LEVELS.busy;
    const seated = api.seatedSimKeys().length;

    // Người mới vào đạo tràng cho tới khi đủ đám đông mong muốn
    const joins = Math.max(0, Math.min(crowd - seated, Math.ceil(crowd * L.ramp)));
    let next = seated;
    const used = new Set(api.seatedSimKeys());
    for (let j = 0; j < joins; j++) {
      while (used.has(`${SIM_PREFIX}${next}`)) next++;
      const u = poolUser(next);
      used.add(u.uniqueId);
      next++;
      later(Math.random() * intervalMs, () => api.seat(u));
    }

    // Hoạt động thường
    const n = Math.round(((L.perMin * intervalMs) / 60000) * (0.7 + Math.random() * 0.6));
    for (let i = 0; i < n; i++) later(Math.random() * intervalMs, randomAction);

    // Chuông vang: nhiều người cùng chắp tay thả tim trong vài giây sau tiếng chuông
    const ph = api.phase();
    if (ph && ph.cues && ph.startedAt) {
      const elapsed = Date.now() - ph.startedAt;
      const crowdTaps = Math.max(3, Math.min(60, Math.round(L.perMin / 4)));
      for (const c of ph.cues) {
        if ((c.k !== 'bell' && c.k !== 'bellSoft') || c.t < elapsed || c.t >= elapsed + intervalMs) continue;
        const at = c.t - elapsed;
        for (let i = 0; i < crowdTaps; i++) {
          later(at + 300 + Math.random() * 3800, () => {
            const u = randomSeated();
            if (u) api.like(u, 1 + Math.floor(Math.random() * 3));
          });
        }
      }
    }
  }

  function stop() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    corrected.clear();
  }

  return { tick, stop };
}

module.exports = { createSimulator, SIM_LEVELS, SIM_PREFIX };
