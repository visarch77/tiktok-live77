/**
 * Bố cục chỗ ngồi của chánh điện (nền chanh_dien_rong.jpg) — dùng chung cho màn hình (trình duyệt) và server (Node),
 * để số chỗ ngồi luôn khớp nhau.
 *
 * Phối cảnh: thảm đỏ rộng 130 px ở y=635 và 570 px ở y=1920 ⇒ đường chân trời ≈ y=255.
 * Kích thước người tỉ lệ thuận với (y − chân trời): gần to, xa nhỏ. Khoảng cách hàng và khoảng cách người
 * cũng co giãn theo cùng tỉ lệ, nên đạo tràng trông như một mặt sàn thật.
 * Thứ tự chỗ: hàng gần trước (to, dễ thấy), trong mỗi hàng ưu tiên chỗ sát thảm, xen kẽ trái – phải.
 */
(function (root) {
  const HORIZON_Y = 255;
  const FRONT_Y = 1590; // hàng gần nhất (ngay trên khung kinh)
  const BACK_Y = 727; // hàng xa nhất (bỏ 2 hàng sát bậc bàn thờ: quá nhỏ và dính cầu thang)
  const ROW_GAP = 66; // khoảng cách hàng ở tỉ lệ 1 (người to hơn 30% nên hàng thưa hơn)
  const SEAT_GAP = 70; // khoảng cách người ở tỉ lệ 1 (người ngồi rộng ~85–110 px nên ngồi sát, hơi chồng)
  const CARPET_PAD = 36; // chừa lối đi trên thảm cho người lên dâng hương
  const EDGE_PAD = 14;

  const scaleAt = (y) => (y - HORIZON_Y) / (FRONT_Y - HORIZON_Y);
  const carpetLeft = (y) => 475 - ((y - 635) * 220) / 1285;
  const carpetRight = (y) => 605 + ((y - 635) * 220) / 1285;

  function buildSeatLayout() {
    const rows = [];
    let y = BACK_Y;
    while (y <= FRONT_Y + 2) {
      rows.push(Math.round(y));
      y += ROW_GAP * scaleAt(y);
    }
    const seats = [];
    rows.forEach((ry, rowIndex) => {
      const s = +scaleAt(ry).toFixed(3);
      const gap = SEAT_GAP * s;
      const innerL = carpetLeft(ry) - CARPET_PAD * s;
      const innerR = carpetRight(ry) + CARPET_PAD * s;
      const outer = EDGE_PAD + 30 * s;
      const n = Math.max(1, Math.floor((innerL - outer) / gap) + 1);
      for (let i = 0; i < n; i++) {
        // i = 0 là chỗ sát thảm
        seats.push({ x: Math.round(innerL - i * gap), y: ry, scale: s, spacing: gap, row: rowIndex, rank: i, side: 'L' });
        seats.push({ x: Math.round(innerR + i * gap), y: ry, scale: s, spacing: gap, row: rowIndex, rank: i, side: 'R' });
      }
    });
    // Hàng gần trước; trong hàng: sát thảm trước, trái rồi phải
    seats.sort((a, b) => b.y - a.y || a.rank - b.rank || (a.side < b.side ? -1 : 1));
    return seats;
  }

  const api = { buildSeatLayout, scaleAt, carpetLeft, carpetRight, HORIZON_Y };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeatLayout = api;
})(typeof window !== 'undefined' ? window : globalThis);
