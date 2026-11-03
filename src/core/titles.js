/**
 * Cấp độ & danh hiệu người chơi, dùng chung mọi trò (tính từ bảng điểm người xem của phòng, lưu qua các buổi live).
 *
 * Cấp độ (màu + hiệu ứng tên): kinh nghiệm XP = ván đã chơi ×10 + thắng ×30 + lên bục ×20 + MVP ×30 + vô địch ×80
 *   + xu quà đã tặng ×5. Tặng quà nhiều thì lên cấp nhanh, chơi đều đặn cũng lên được.
 * Danh hiệu: theo việc làm nhiều nhất (dùng kỹ năng nào, bị trúng gì...), 3 bậc ★ / ★★ / ★★★.
 * Hiển thị danh hiệu cao nhất (bậc cao hơn trước, cùng bậc thì cái vượt ngưỡng xa hơn).
 */
const LEVELS = [
  { lv: 1, vi: 'Tân binh', en: 'Rookie', xp: 0 },
  { lv: 2, vi: 'Đồng', en: 'Bronze', xp: 150 },
  { lv: 3, vi: 'Bạc', en: 'Silver', xp: 500 },
  { lv: 4, vi: 'Vàng', en: 'Gold', xp: 1500 },
  { lv: 5, vi: 'Bạch kim', en: 'Platinum', xp: 4000 },
  { lv: 6, vi: 'Kim cương', en: 'Diamond', xp: 10000 },
  { lv: 7, vi: 'Huyền thoại', en: 'Legend', xp: 25000 }
];

const STD = [10, 50, 200];
// stat → danh hiệu. Đèn Xanh – Đèn Đỏ: it_<loại quà>, rl_shot · Kéo Co: sk_<kỹ năng>, kc_<bị trúng> · chung: rounds, wins, coins...
const TITLES = [
  { stat: 'coins', emoji: '💎', vi: 'Đại gia', en: 'Big Spender', at: [100, 1000, 10000] },
  { stat: 'cups', emoji: '🏆', vi: 'Nhà vô địch', en: 'Champion', at: [1, 5, 20] },
  { stat: 'wins', emoji: '🏅', vi: 'Chiến thần', en: 'War God', at: [5, 25, 100] },
  { stat: 'mvp', emoji: '🪢', vi: 'Vua kéo co', en: 'Tug King', at: [3, 15, 50] },
  { stat: 'rounds', emoji: '🎖️', vi: 'Lão làng', en: 'Veteran', at: [20, 100, 400] },
  // Đèn Xanh – Đèn Đỏ
  { stat: 'it_turbo', emoji: '👟', vi: 'Vua tốc độ', en: 'Speed King', at: STD },
  { stat: 'it_clones', emoji: '👥', vi: 'Ảo thuật gia', en: 'Magician', at: STD },
  { stat: 'it_shove', emoji: '🤚', vi: 'Thánh đẩy', en: 'Pusher', at: STD },
  { stat: 'it_shield', emoji: '🛡️', vi: 'Lá chắn thép', en: 'Iron Shield', at: STD },
  { stat: 'it_revive', emoji: '🙏', vi: 'Bác sĩ hồi sinh', en: 'Medic', at: STD },
  { stat: 'it_wind', emoji: '📢', vi: 'Loa phường', en: 'Loudspeaker', at: STD },
  { stat: 'it_giant', emoji: '💪', vi: 'Người khổng lồ', en: 'Giant', at: STD },
  { stat: 'it_teamShield', emoji: '🫧', vi: 'Bảo mẫu', en: 'Guardian', at: STD },
  { stat: 'it_stomp', emoji: '🦶', vi: 'Khủng long dẫm', en: 'Stomper', at: STD },
  { stat: 'rl_shot', emoji: '🎯', vi: 'Bia đỡ đạn', en: 'Bullet Magnet', at: [20, 100, 400] },
  // dùng chung hai trò
  { stat: 'fart', emoji: '💨', vi: 'Vua xì hơi', en: 'Fart King', at: STD },
  // Kéo Co
  { stat: 'sk_gong', emoji: '💪', vi: 'Thánh gồng', en: 'Flexer', at: STD },
  { stat: 'sk_energy', emoji: '🧃', vi: 'Ông chủ nước tăng lực', en: 'Energy Boss', at: STD },
  { stat: 'sk_tickle', emoji: '🪶', vi: 'Thánh cù lét', en: 'Tickle Master', at: STD },
  { stat: 'sk_glue', emoji: '🧤', vi: 'Bàn tay keo', en: 'Sticky Hands', at: STD },
  { stat: 'sk_cheer', emoji: '📣', vi: 'Fan cứng', en: 'Superfan', at: STD },
  { stat: 'sk_grease', emoji: '🧈', vi: 'Thánh bôi mỡ', en: 'Grease Master', at: STD },
  { stat: 'sk_strong', emoji: '🏋️', vi: 'Bầu sô lực sĩ', en: 'Strongman Agent', at: STD },
  { stat: 'sk_heave', emoji: '🥁', vi: 'Thủ lĩnh hò dô', en: 'Chant Leader', at: STD },
  { stat: 'sk_banana', emoji: '🍌', vi: 'Vua vỏ chuối', en: 'Banana King', at: STD },
  { stat: 'kc_greased', emoji: '🙌', vi: 'Vua trượt tay', en: 'Butterfingers', at: [10, 50, 200] },
  { stat: 'kc_tickled', emoji: '🤣', vi: 'Người nhột nhất', en: 'Most Ticklish', at: [5, 25, 100] },
  { stat: 'kc_slipped', emoji: '🤸', vi: 'Vua té oạch', en: 'Faceplant King', at: [5, 25, 100] },
  { stat: 'kc_tired', emoji: '😮‍💨', vi: 'Vua hụt hơi', en: 'Out of Breath', at: [10, 50, 200] }
];

function xpOf(s = {}) {
  return (s.rounds || 0) * 10 + (s.wins || 0) * 30 + (s.podium || 0) * 20 + (s.mvp || 0) * 30 + (s.cups || 0) * 80 + (s.coins || 0) * 5;
}
function levelOf(s) {
  const xp = xpOf(s);
  let L = LEVELS[0];
  for (const x of LEVELS) if (xp >= x.xp) L = x;
  return L;
}
function tierOf(def, s = {}) {
  const n = s[def.stat] || 0;
  let tier = 0;
  for (const a of def.at) if (n >= a) tier++;
  return tier;
}
function titleText(def, tier, en) {
  return `${def.emoji} ${en ? def.en : def.vi}${tier > 1 ? ` ${'★'.repeat(tier)}` : ''}`;
}
function bestTitle(s = {}) {
  let best = null;
  for (const def of TITLES) {
    const tier = tierOf(def, s);
    if (!tier) continue;
    const score = tier * 1000 + Math.min(999, ((s[def.stat] || 0) / def.at[tier - 1]) * 100);
    if (!best || score > best.score) best = { def, tier, score };
  }
  return best;
}

/** Huy hiệu gọn để gửi xuống màn hình: { lv, tt } (tt = danh hiệu đang đeo, '' nếu chưa có) */
function badgeOf(stats, en = false) {
  const b = bestTitle(stats);
  return { lv: levelOf(stats).lv, tt: b ? titleText(b.def, b.tier, en) : '' };
}

/** So trước / sau một lần ghi điểm: lên cấp? đạt danh hiệu (hoặc bậc) mới? */
function awardsBetween(before = {}, after = {}, en = false) {
  const out = [];
  const l0 = levelOf(before);
  const l1 = levelOf(after);
  if (l1.lv > l0.lv) out.push({ type: 'level', lv: l1.lv, text: en ? l1.en : l1.vi });
  for (const def of TITLES) {
    const t0 = tierOf(def, before);
    const t1 = tierOf(def, after);
    if (t1 > t0) out.push({ type: 'title', tier: t1, text: titleText(def, t1, en), name: en ? def.en : def.vi, emoji: def.emoji });
  }
  return out;
}

/** Ghi điểm vào bảng và trả về các phần thưởng vừa đạt (để trò đọc tên / hiện hiệu ứng) */
function recordWithAwards(board, who, delta, en = false) {
  const prev = board.peek(who);
  const before = prev ? { ...prev.stats } : {};
  const v = board.record(who, delta);
  return { viewer: v, awards: awardsBetween(before, v.stats, en), badge: badgeOf(v.stats, en) };
}

/** Câu đọc khi đạt phần thưởng */
function awardLine(name, a, en = false) {
  if (a.type === 'level') return en ? `${name} reached ${a.text} level!` : `${name} lên cấp ${a.text}!`;
  const stars = a.tier > 1 ? (en ? ` ${a.tier} stars` : ` ${a.tier} sao`) : '';
  return en ? `Congratulations ${name}, new title: ${a.name}${stars}!` : `Chúc mừng ${name} đạt danh hiệu ${a.name}${stars}!`;
}

module.exports = { LEVELS, TITLES, xpOf, levelOf, badgeOf, awardsBetween, recordWithAwards, awardLine };
