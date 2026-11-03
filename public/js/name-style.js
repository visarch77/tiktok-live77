/**
 * Vẽ tên người chơi theo cấp độ (dùng chung các trò; cấp & danh hiệu tính ở src/core/titles.js).
 *   1 Tân binh: trắng · 2 Đồng: đồng ánh cam · 3 Bạc: bạc sáng · 4 Vàng: vàng + vệt sáng chạy qua
 *   5 Bạch kim: xanh băng + vệt sáng + toả sáng · 6 Kim cương: đổi màu lam–tím–hồng + toả sáng + lấp lánh
 *   7 Huyền thoại: cầu vồng chạy + toả lửa cam + lấp lánh + vương miện
 * Danh hiệu (vd "👟 Vua tốc độ ★★") là dòng chữ nhỏ ngay trên tên, màu theo cấp.
 */
(function () {
  const TITLE_COLOR = ['#ffe9a8', '#ffe9a8', '#ffd2a8', '#eef4ff', '#ffe066', '#a8fbff', '#d9c6ff', '#ffc27a'];
  const GLOW = { 5: ['rgba(110,240,255,.85)', 8], 6: ['rgba(160,120,255,.95)', 11], 7: ['rgba(255,140,40,.95)', 14] };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  // vệt sáng chạy ngang qua chữ: gradient ngang với dải trắng di chuyển theo thời gian
  function shine(g, x0, w, base, t, speed = 1500) {
    const gr = g.createLinearGradient(x0, 0, x0 + w, 0);
    const p = ((t / speed) % 1.8) - 0.4;
    gr.addColorStop(0, base);
    gr.addColorStop(clamp01(p - 0.14), base);
    gr.addColorStop(clamp01(p), '#ffffff');
    gr.addColorStop(clamp01(p + 0.14) || 0.0001, base);
    gr.addColorStop(1, base);
    return gr;
  }
  function fillFor(g, lv, x0, w, y, size, t) {
    if (lv <= 1) return '#ffffff';
    if (lv === 2) {
      const gr = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      gr.addColorStop(0, '#ffd9b3');
      gr.addColorStop(1, '#d07a34');
      return gr;
    }
    if (lv === 3) {
      const gr = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(1, '#9fb4ca');
      return gr;
    }
    if (lv === 4) return shine(g, x0, w, '#ffc928', t, 1600);
    if (lv === 5) return shine(g, x0, w, '#86e9ff', t, 1300);
    const gr = g.createLinearGradient(x0, 0, x0 + w, 0);
    if (lv === 6) {
      // lam → tím → hồng trôi chậm
      const h = (t / 30) % 360;
      for (let i = 0; i <= 4; i++) gr.addColorStop(i / 4, `hsl(${200 + ((h + i * 40) % 120)}, 95%, 72%)`);
      return gr;
    }
    // 7: cầu vồng chạy
    const h = (t / 8) % 360;
    for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${(h + i * 55) % 360}, 100%, 66%)`);
    return gr;
  }
  function sparkles(g, x0, w, y, size, t, n, color) {
    g.save();
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${Math.round(size * 0.55)}px sans-serif`;
    for (let i = 0; i < n; i++) {
      const ph = (t / 900 + i / n) % 1;
      const a = Math.sin(ph * Math.PI);
      g.globalAlpha = a * 0.95;
      const sx = x0 + ((i * 0.37 + ph * 0.3) % 1) * w;
      const sy = y - size * 0.7 + (i % 2) * size * 1.2 - ph * size * 0.3;
      g.fillText('✦', sx, sy);
    }
    g.restore();
  }

  /** Vẽ tên. Trả về { w } để trò tự xếp chỗ. */
  function draw(g, str, x, y, { size = 16, weight = 800, lv = 1, t = performance.now(), align = 'center', stroke = 3, strokeColor = 'rgba(0,0,0,0.85)', font = "'Be Vietnam Pro', system-ui, sans-serif", maxW = 0 } = {}) {
    g.save();
    g.font = `${weight} ${size}px ${font}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    let w = g.measureText(str).width;
    if (maxW && w > maxW) {
      while (str.length > 2 && g.measureText(`${str}…`).width > maxW) str = str.slice(0, -1);
      str = `${str}…`;
      w = g.measureText(str).width;
    }
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    if (stroke) {
      g.lineWidth = stroke + (lv >= 4 ? 1 : 0);
      g.strokeStyle = strokeColor;
      g.lineJoin = 'round';
      g.strokeText(str, x, y);
    }
    const glow = GLOW[lv];
    if (glow) {
      g.shadowColor = glow[0];
      g.shadowBlur = glow[1] * (0.8 + 0.2 * Math.sin(t / 300));
    }
    g.fillStyle = fillFor(g, lv, x0, w, y, size, t);
    g.fillText(str, x, y);
    g.shadowBlur = 0;
    if (lv >= 6) sparkles(g, x0, w, y, size, t, lv === 7 ? 4 : 3, lv === 7 ? '#fff3b0' : '#e9e2ff');
    if (lv === 7) {
      g.font = `${Math.round(size * 0.8)}px sans-serif`;
      g.fillText('👑', x0 - size * 0.55, y - size * 0.15);
    }
    g.restore();
    return { w };
  }

  /** Dòng danh hiệu nhỏ (gọi khi tt khác rỗng) */
  function title(g, tt, x, y, { size = 11, lv = 1, align = 'center', font = "'Be Vietnam Pro', system-ui, sans-serif", t = performance.now() } = {}) {
    if (!tt) return;
    g.save();
    g.font = `800 ${size}px ${font}`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineJoin = 'round';
    g.strokeText(tt, x, y);
    g.fillStyle = TITLE_COLOR[Math.max(1, Math.min(7, lv))];
    if (lv >= 5) {
      g.shadowColor = (GLOW[lv] || GLOW[5])[0];
      g.shadowBlur = 5 + 2 * Math.sin(t / 300);
    }
    g.fillText(tt, x, y);
    g.restore();
  }

  window.NameStyle = { draw, title, TITLE_COLOR };
})();
