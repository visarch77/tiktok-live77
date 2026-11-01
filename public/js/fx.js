/**
 * Hiệu ứng không gian cho Phòng Tụng Kinh (khung 1080 × 1920, vẽ trên một canvas riêng, không bị camera phóng to):
 *  - cánh hoa sen hồng / trắng rơi, lật nghiêng như thật (xoay + co giãn một chiều)
 *  - lá bồ đề vàng xoay chậm trong gió
 *  - sao lấp lánh và bụi vàng bay lên
 *  - mưa hoa / tia sáng khi có người dâng lễ (burst), mưa hoa nhẹ khi viên mãn (shower)
 * Hình được vẽ sẵn vào canvas nhỏ (sprite) để mỗi khung chỉ còn drawImage — nhẹ cho máy phát live.
 */
(function () {
  const W = 1080;
  const H = 1920;
  const MAX = 260;
  // Số hạt sinh ra mỗi giây theo mức hiệu ứng
  const LEVELS = {
    off: { petal: 0, leaf: 0, sparkle: 0, mote: 0 },
    light: { petal: 0.35, leaf: 0.15, sparkle: 0.9, mote: 0.5 },
    normal: { petal: 0.8, leaf: 0.35, sparkle: 1.8, mote: 1.0 },
    rich: { petal: 1.6, leaf: 0.7, sparkle: 3.2, mote: 1.8 }
  };

  function sprite(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    return c;
  }

  // Cánh sen: thuôn nhọn ở đầu, tròn ở gốc, chuyển màu từ gốc nhạt tới đầu đậm
  function petalSprite(base, tip) {
    return sprite(48, 72, (g, w, h) => {
      const grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, base);
      grad.addColorStop(1, tip);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(w / 2, 2);
      g.bezierCurveTo(w * 0.98, h * 0.3, w * 0.9, h * 0.86, w / 2, h - 2);
      g.bezierCurveTo(w * 0.1, h * 0.86, w * 0.02, h * 0.3, w / 2, 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(w / 2, h * 0.12);
      g.quadraticCurveTo(w * 0.53, h * 0.55, w / 2, h * 0.92);
      g.stroke();
    });
  }

  // Lá bồ đề: hình tim, đuôi nhọn dài, vàng kim có gân
  function leafSprite() {
    return sprite(60, 84, (g, w, h) => {
      const grad = g.createRadialGradient(w * 0.45, h * 0.55, 4, w / 2, h / 2, w * 0.7);
      grad.addColorStop(0, '#fff1a8');
      grad.addColorStop(0.55, '#f2c14e');
      grad.addColorStop(1, '#b8791c');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(w / 2, h - 2); // đuôi lá
      g.bezierCurveTo(w * 0.42, h * 0.8, w * 0.02, h * 0.62, w * 0.06, h * 0.36);
      g.bezierCurveTo(w * 0.1, h * 0.1, w * 0.4, h * 0.06, w / 2, h * 0.2);
      g.bezierCurveTo(w * 0.6, h * 0.06, w * 0.9, h * 0.1, w * 0.94, h * 0.36);
      g.bezierCurveTo(w * 0.98, h * 0.62, w * 0.58, h * 0.8, w / 2, h - 2);
      g.fill();
      g.strokeStyle = 'rgba(140, 85, 20, 0.55)';
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(w / 2, h * 0.2);
      g.lineTo(w / 2, h - 6);
      for (let i = 0; i < 3; i++) {
        const y = h * (0.34 + i * 0.13);
        g.moveTo(w / 2, y);
        g.quadraticCurveTo(w * 0.32, y - 4, w * 0.18, y - 10);
        g.moveTo(w / 2, y);
        g.quadraticCurveTo(w * 0.68, y - 4, w * 0.82, y - 10);
      }
      g.stroke();
    });
  }

  // Sao 4 cánh có quầng sáng
  function sparkleSprite(color) {
    return sprite(64, 64, (g, w, h) => {
      const cx = w / 2;
      const cy = h / 2;
      const halo = g.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
      halo.addColorStop(0, color.replace('A', '0.9'));
      halo.addColorStop(0.25, color.replace('A', '0.35'));
      halo.addColorStop(1, color.replace('A', '0'));
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.moveTo(cx, 4);
      g.quadraticCurveTo(cx + 3, cy - 3, w - 4, cy);
      g.quadraticCurveTo(cx + 3, cy + 3, cx, h - 4);
      g.quadraticCurveTo(cx - 3, cy + 3, 4, cy);
      g.quadraticCurveTo(cx - 3, cy - 3, cx, 4);
      g.fill();
    });
  }

  function moteSprite() {
    return sprite(32, 32, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(255, 236, 170, 0.9)');
      r.addColorStop(0.4, 'rgba(255, 210, 120, 0.35)');
      r.addColorStop(1, 'rgba(255, 210, 120, 0)');
      g.fillStyle = r;
      g.fillRect(0, 0, w, w);
    });
  }

  // Đèn hoa đăng giấy đỏ cam, có quầng sáng
  function lanternSprite() {
    return sprite(80, 110, (g, w, h) => {
      const halo = g.createRadialGradient(w / 2, h * 0.5, 4, w / 2, h * 0.5, w * 0.62);
      halo.addColorStop(0, 'rgba(255, 210, 120, 0.55)');
      halo.addColorStop(1, 'rgba(255, 170, 80, 0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      const body = g.createLinearGradient(0, h * 0.2, 0, h * 0.85);
      body.addColorStop(0, '#ffcf6b');
      body.addColorStop(0.5, '#ff8a3d');
      body.addColorStop(1, '#d9481f');
      g.fillStyle = body;
      g.beginPath();
      g.moveTo(w * 0.3, h * 0.22);
      g.quadraticCurveTo(w * 0.08, h * 0.52, w * 0.3, h * 0.82);
      g.lineTo(w * 0.7, h * 0.82);
      g.quadraticCurveTo(w * 0.92, h * 0.52, w * 0.7, h * 0.22);
      g.closePath();
      g.fill();
      g.fillStyle = '#7a2a10';
      g.fillRect(w * 0.32, h * 0.18, w * 0.36, h * 0.05);
      g.fillRect(w * 0.32, h * 0.81, w * 0.36, h * 0.05);
      const core = g.createRadialGradient(w / 2, h * 0.55, 1, w / 2, h * 0.55, w * 0.22);
      core.addColorStop(0, 'rgba(255, 255, 220, 0.95)');
      core.addColorStop(1, 'rgba(255, 220, 140, 0)');
      g.fillStyle = core;
      g.fillRect(0, 0, w, h);
    });
  }

  // Chim bồ câu trắng (hai khung cánh) và bướm
  function birdSprite(up) {
    return sprite(72, 48, (g, w, h) => {
      g.fillStyle = 'rgba(255, 253, 246, 0.97)';
      g.strokeStyle = 'rgba(200, 190, 170, 0.6)';
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(w / 2, h * 0.58, w * 0.16, h * 0.14, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(w * 0.66, h * 0.5, h * 0.1, 0, Math.PI * 2);
      g.fill();
      const wy = up ? h * 0.05 : h * 0.95;
      g.beginPath();
      g.moveTo(w * 0.42, h * 0.55);
      g.quadraticCurveTo(w * 0.2, wy, w * 0.02, up ? h * 0.18 : h * 0.8);
      g.quadraticCurveTo(w * 0.25, h * 0.5, w * 0.5, h * 0.6);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(w * 0.58, h * 0.55);
      g.quadraticCurveTo(w * 0.8, wy, w * 0.98, up ? h * 0.18 : h * 0.8);
      g.quadraticCurveTo(w * 0.75, h * 0.5, w * 0.5, h * 0.6);
      g.fill();
      g.stroke();
    });
  }
  function butterflySprite() {
    return sprite(64, 56, (g, w, h) => {
      const wing = (x, y, rx, ry, c1, c2) => {
        const gr = g.createRadialGradient(x, y, 1, x, y, Math.max(rx, ry));
        gr.addColorStop(0, c1);
        gr.addColorStop(1, c2);
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
      };
      wing(w * 0.3, h * 0.36, w * 0.22, h * 0.26, '#fff6c8', '#f2a541');
      wing(w * 0.7, h * 0.36, w * 0.22, h * 0.26, '#fff6c8', '#f2a541');
      wing(w * 0.34, h * 0.72, w * 0.15, h * 0.18, '#ffe0f0', '#e46aa0');
      wing(w * 0.66, h * 0.72, w * 0.15, h * 0.18, '#ffe0f0', '#e46aa0');
      g.fillStyle = '#4a2a10';
      g.fillRect(w * 0.48, h * 0.2, w * 0.04, h * 0.66);
    });
  }

  function bubbleSprite() {
    return sprite(32, 32, (g, w) => {
      const r = g.createRadialGradient(w * 0.4, w * 0.4, 1, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(255,255,255,0.9)');
      r.addColorStop(0.5, 'rgba(160, 220, 255, 0.35)');
      r.addColorStop(1, 'rgba(120, 200, 255, 0)');
      g.fillStyle = r;
      g.fillRect(0, 0, w, w);
    });
  }

  class BlessingFx {
    constructor(canvas) {
      this.canvas = canvas;
      canvas.width = W;
      canvas.height = H;
      this.g = canvas.getContext('2d');
      this.items = [];
      this.level = LEVELS.normal;
      this.acc = { petal: 0, leaf: 0, sparkle: 0, mote: 0 };
      this.sprites = {
        petalPink: petalSprite('rgba(255, 228, 236, 0.95)', 'rgba(236, 120, 160, 0.95)'),
        petalWhite: petalSprite('rgba(255, 252, 245, 0.95)', 'rgba(250, 214, 226, 0.95)'),
        petalRed: petalSprite('rgba(255, 170, 180, 0.95)', 'rgba(200, 20, 50, 0.95)'),
        petalPeach: petalSprite('rgba(255, 245, 240, 0.95)', 'rgba(255, 170, 190, 0.9)'),
        leaf: leafSprite(),
        sparkGold: sparkleSprite('rgba(255, 220, 130, A)'),
        sparkWhite: sparkleSprite('rgba(255, 250, 235, A)'),
        mote: moteSprite(),
        lantern: lanternSprite(),
        birdUp: birdSprite(true),
        birdDown: birdSprite(false),
        butterfly: butterflySprite(),
        bubble: bubbleSprite()
      };
      this.rings = []; // vòng hào quang lan toả
      this.orbits = []; // chuỗi hạt sáng xoay quanh lễ vật
      this.rays = []; // tia sáng hộ pháp
      this.last = performance.now();
      this.time = 0;
      requestAnimationFrame((t) => this.frame(t));
    }

    setLevel(name) {
      this.level = LEVELS[name] || LEVELS.normal;
    }

    make(type, x, y, opts = {}) {
      if (this.items.length >= MAX) return;
      const r = Math.random;
      const base = { type, x, y, age: 0, rot: r() * Math.PI * 2, phase: r() * Math.PI * 2 };
      if (type === 'petal') {
        Object.assign(base, {
          img: opts.img || (r() < 0.7 ? this.sprites.petalPink : this.sprites.petalWhite),
          size: 18 + r() * 16,
          vx: opts.vx ?? (r() - 0.5) * 20,
          vy: opts.vy ?? 55 + r() * 45,
          spin: (r() - 0.5) * 1.6,
          flip: 1.5 + r() * 2,
          sway: 18 + r() * 26,
          life: opts.life ?? 30
        });
      } else if (type === 'leaf') {
        Object.assign(base, {
          img: this.sprites.leaf,
          size: 22 + r() * 14,
          vx: opts.vx ?? (r() - 0.5) * 16,
          vy: opts.vy ?? 40 + r() * 30,
          spin: (r() - 0.5) * 1.1,
          flip: 0.9 + r() * 1.3,
          sway: 26 + r() * 30,
          life: opts.life ?? 34
        });
      } else if (type === 'sparkle') {
        Object.assign(base, {
          img: r() < 0.65 ? this.sprites.sparkGold : this.sprites.sparkWhite,
          size: opts.size ?? 14 + r() * 22,
          vx: opts.vx ?? (r() - 0.5) * 8,
          vy: opts.vy ?? -6 - r() * 10,
          life: opts.life ?? 2.2 + r() * 2.8,
          twinkle: 3 + r() * 4
        });
      } else if (type === 'lantern') {
        Object.assign(base, {
          img: this.sprites.lantern,
          size: opts.size ?? 74 + r() * 34,
          vx: opts.vx ?? (r() - 0.5) * 14,
          vy: opts.vy ?? -34 - r() * 22,
          life: opts.life ?? 12,
          sway: 10 + r() * 12
        });
      } else if (type === 'bird' || type === 'butterfly') {
        const dir = r() < 0.5 ? -1 : 1;
        Object.assign(base, {
          size: type === 'bird' ? 46 + r() * 20 : 32 + r() * 14,
          vx: opts.vx ?? dir * (60 + r() * 90),
          vy: opts.vy ?? -120 - r() * 80,
          life: opts.life ?? 6,
          flap: type === 'bird' ? 7 + r() * 3 : 12 + r() * 6
        });
      } else if (type === 'bubble' || type === 'steam') {
        Object.assign(base, {
          img: type === 'bubble' ? this.sprites.bubble : this.sprites.mote,
          size: type === 'bubble' ? 10 + r() * 18 : 40 + r() * 40,
          vx: (r() - 0.5) * 18,
          vy: type === 'bubble' ? -60 - r() * 60 : -30 - r() * 20,
          life: opts.life ?? (type === 'bubble' ? 3.5 : 3),
          sway: 8 + r() * 10
        });
      } else {
        Object.assign(base, {
          img: this.sprites.mote,
          size: 10 + r() * 22,
          vx: (r() - 0.5) * 6,
          vy: -8 - r() * 14,
          life: 7 + r() * 6
        });
      }
      this.items.push(base);
    }

    /** Mưa hoa + lá + tia sáng toả ra từ một điểm (toạ độ màn hình 1080×1920) */
    burst(x, y, { petals = 14, leaves = 6, sparkles = 16 } = {}) {
      for (let i = 0; i < petals; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 60 + Math.random() * 140;
        this.make('petal', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 9 });
      }
      for (let i = 0; i < leaves; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 40 + Math.random() * 110;
        this.make('leaf', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, life: 10 });
      }
      for (let i = 0; i < sparkles; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 90;
        this.make('sparkle', x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, { vy: -14 - Math.random() * 24, life: 1.4 + Math.random() * 1.6 });
      }
    }

    /** Hiệu ứng theo loại lễ vật (xem src/modes/chanting/gifts.js) tại toạ độ màn hình (x, y) */
    offering(cat, x, y, icon = '') {
      const R = Math.random;
      const around = (n, fn, spread = 120) => {
        for (let i = 0; i < n; i++) fn(x + (R() - 0.5) * spread, y + (R() - 0.5) * spread * 0.5, i);
      };
      switch (cat) {
        case 'flower':
          this.burst(x, y, { petals: 26, leaves: 4, sparkles: 14 });
          this.shower(2.5, 0.8);
          break;
        case 'lamp':
          around(7, (px, py, i) => setTimeout(() => this.make('lantern', px, py), i * 220), 200);
          this.burst(x, y, { petals: 0, leaves: 0, sparkles: 24 });
          break;
        case 'incense':
          around(14, (px, py, i) => setTimeout(() => this.make('steam', px, py, { life: 3.5 }), i * 90), 60);
          this.burst(x, y, { petals: 4, leaves: 2, sparkles: 22 });
          break;
        case 'tea':
          around(10, (px, py, i) => setTimeout(() => this.make('steam', px, py - 20), i * 120), 50);
          this.burst(x, y, { petals: 2, leaves: 12, sparkles: 10 });
          break;
        case 'fruit':
          this.burst(x, y, { petals: 10, leaves: 14, sparkles: 12 });
          this.ring(x, y, 'rgba(255, 190, 110, A)');
          break;
        case 'heart':
          this.ring(x, y, 'rgba(255, 220, 140, A)');
          setTimeout(() => this.ring(x, y, 'rgba(255, 236, 190, A)'), 380);
          this.burst(x, y, { petals: 6, leaves: 0, sparkles: 28 });
          break;
        case 'release':
          if (icon === '🦋') around(7, (px, py, i) => setTimeout(() => this.make('butterfly', px, py), i * 160));
          else if (icon === '🐟') around(26, (px, py, i) => setTimeout(() => this.make('bubble', px, py), i * 60), 160);
          else around(5, (px, py, i) => setTimeout(() => this.make('bird', px, py), i * 220));
          this.burst(x, y, { petals: 6, leaves: 0, sparkles: 14 });
          break;
        case 'guardian':
          this.rays.push({ x, y, age: 0, life: 4.2, rot: R() * Math.PI });
          this.ring(x, y, 'rgba(255, 215, 120, A)');
          this.burst(x, y, { petals: 18, leaves: 10, sparkles: 34 });
          this.shower(3.5, 1.2);
          break;
        default:
          this.burst(x, y, { petals: 4, leaves: 2, sparkles: 22 });
      }
    }

    ring(x, y, color, { life = 1.8, grow = 260, flat = 0.62 } = {}) {
      this.rings.push({ x, y, age: 0, life, color, grow, flat });
    }

    // ---- Hiệu ứng riêng cho từng lễ vật ----
    /** Cánh hoa xoáy tròn quanh lễ vật rồi rơi xuống (palette: rose | lotus | peach) */
    petalSpiral(x, y, n = 36, palette = 'lotus') {
      const imgs = {
        rose: [this.sprites.petalRed, this.sprites.petalPink],
        lotus: [this.sprites.petalPink, this.sprites.petalWhite],
        peach: [this.sprites.petalPeach, this.sprites.petalWhite]
      }[palette];
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const a = (i / n) * Math.PI * 6;
          const rad = 40 + (i / n) * 160;
          const px = x + Math.cos(a) * rad;
          const py = y + Math.sin(a) * rad * 0.6;
          this.make('petal', px, py, { img: imgs[i % imgs.length], vx: -Math.sin(a) * 160, vy: Math.cos(a) * 90 - 40, life: 9 });
        }, i * 45);
      }
    }

    /** Đèn trời bay lên khắp màn hình */
    skyLanterns(n = 24) {
      for (let i = 0; i < n; i++) {
        setTimeout(() => this.make('lantern', 60 + Math.random() * 960, H * 0.55 + Math.random() * 500, { vy: -70 - Math.random() * 50, life: 14, size: 50 + Math.random() * 60 }), i * 140);
      }
    }

    /** Đèn hoa đăng nhỏ toả quanh lễ vật rồi bay lên */
    lanternsAround(x, y, n = 8) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        setTimeout(() => this.make('lantern', x + Math.cos(a) * 200, y + Math.sin(a) * 110, { vx: Math.cos(a) * 20, vy: -40 - Math.random() * 25, life: 11, size: 54 + Math.random() * 24 }), i * 160);
      }
    }

    /** Khói trầm vàng cuộn lên cao */
    smokeRibbons(x, y, n = 34) {
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          this.make('steam', x + (Math.random() - 0.5) * 50, y, { life: 4.5 });
          if (i % 3 === 0) this.make('sparkle', x + (Math.random() - 0.5) * 80, y - Math.random() * 200, { vy: -30, life: 2 });
        }, i * 80);
      }
    }

    steamUp(x, y, n = 18) {
      for (let i = 0; i < n; i++) setTimeout(() => this.make('steam', x + (Math.random() - 0.5) * 40, y, { life: 3.6 }), i * 110);
    }

    leafSwirl(x, y, n = 14) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        this.make('leaf', x + Math.cos(a) * 60, y + Math.sin(a) * 40, { vx: Math.cos(a) * 120, vy: -40 - Math.random() * 60, life: 10 });
      }
    }

    /** 27 hạt sáng xoay thành vòng quanh lễ vật (chuỗi tràng hạt) */
    orbit(x, y, r = 190, n = 27, life = 3.8) {
      this.orbits.push({ x, y, r, n, life, age: 0 });
    }

    /** Lấp lánh xếp thành hình trái tim, toả dần ra */
    heartSparkles(x, y, n = 40) {
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        setTimeout(() => this.make('sparkle', x + hx * 11, y + hy * 11, { vx: hx * 2, vy: hy * 2, life: 2.2, size: 22 }), i * 25);
      }
      this.ring(x, y, 'rgba(255, 210, 140, A)');
      setTimeout(() => this.ring(x, y, 'rgba(255, 236, 190, A)'), 450);
    }

    /** Đàn chim / bướm bay toả ra khắp màn hình */
    flock(x, y, n = 10, type = 'bird') {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
        const v = 140 + Math.random() * 140;
        setTimeout(() => this.make(type, x + (Math.random() - 0.5) * 80, y + (Math.random() - 0.5) * 60, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 7 }), i * 120);
      }
    }

    ripples(x, y, color = 'rgba(160, 225, 255, A)', n = 3) {
      for (let i = 0; i < n; i++) setTimeout(() => this.ring(x, y, color, { life: 2.2, grow: 320, flat: 0.32 }), i * 420);
    }

    bubbles(x, y, n = 30) {
      for (let i = 0; i < n; i++) setTimeout(() => this.make('bubble', x + (Math.random() - 0.5) * 220, y + Math.random() * 60), i * 50);
    }

    /** Tia sáng hộ pháp toả tròn */
    raysAt(x, y, life = 4.2) {
      this.rays.push({ x, y, age: 0, life, rot: Math.random() * Math.PI });
    }

    /** Sóng âm chuông lan toả */
    bellWaves(x, y, n = 4) {
      for (let i = 0; i < n; i++) setTimeout(() => this.ring(x, y, 'rgba(255, 214, 130, A)', { life: 2, grow: 420, flat: 0.9 }), i * 520);
    }

    /** Mưa hoa nhẹ khắp màn hình trong vài giây */
    shower(seconds = 4, density = 1) {
      const n = Math.round(30 * density);
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          this.make(Math.random() < 0.72 ? 'petal' : 'leaf', Math.random() * W, -40 - Math.random() * 80);
          if (Math.random() < 0.6) this.make('sparkle', Math.random() * W, Math.random() * H * 0.55);
        }, (i / n) * seconds * 1000);
      }
    }

    spawnAmbient(dt) {
      const L = this.level;
      for (const k of ['petal', 'leaf', 'sparkle', 'mote']) {
        this.acc[k] += L[k] * dt;
        while (this.acc[k] >= 1) {
          this.acc[k] -= 1;
          if (k === 'petal' || k === 'leaf') this.make(k, Math.random() * W, -50);
          // Lấp lánh quanh vùng tượng Phật và đèn; bụi vàng bay lên từ nửa dưới
          else if (k === 'sparkle') this.make(k, 160 + Math.random() * 760, 60 + Math.random() * 900);
          else this.make(k, Math.random() * W, 700 + Math.random() * 1000);
        }
      }
    }

    frame(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      this.spawnAmbient(dt);
      const g = this.g;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      for (let i = this.items.length - 1; i >= 0; i--) {
        const p = this.items[i];
        p.age += dt;
        if (p.age >= p.life || p.y > H + 80 || p.x < -120 || p.x > W + 120) {
          this.items.splice(i, 1);
          continue;
        }
        if (p.type === 'lantern') {
          p.x += (p.vx + Math.sin(this.time * 0.8 + p.phase) * p.sway) * dt;
          p.y += p.vy * dt;
          const fade = Math.min(1, p.age / 0.8, (p.life - p.age) / 2.5);
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = Math.max(0, fade) * (0.85 + 0.15 * Math.sin(this.time * 9 + p.phase));
          g.setTransform(1, 0, 0, 1, p.x, p.y);
          g.drawImage(p.img, -p.size * 0.36, -p.size / 2, p.size * 0.73, p.size);
          continue;
        }
        if (p.type === 'bird' || p.type === 'butterfly') {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 10 * dt;
          const fade = Math.min(1, p.age / 0.4, (p.life - p.age) / 1.2);
          const wing = Math.sin(this.time * p.flap + p.phase);
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = Math.max(0, fade);
          const face = p.vx < 0 ? -1 : 1;
          if (p.type === 'bird') {
            g.setTransform(face, 0, 0, 1, p.x, p.y);
            g.drawImage(wing > 0 ? this.sprites.birdUp : this.sprites.birdDown, -p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          } else {
            g.setTransform(0.25 + 0.75 * Math.abs(wing), 0, 0, 1, p.x, p.y);
            g.drawImage(this.sprites.butterfly, -p.size / 2, -p.size * 0.44, p.size, p.size * 0.88);
          }
          continue;
        }
        if (p.type === 'bubble' || p.type === 'steam') {
          p.x += (p.vx + Math.sin(this.time * 2 + p.phase) * p.sway) * dt;
          p.y += p.vy * dt;
          const t = p.age / p.life;
          g.globalCompositeOperation = p.type === 'bubble' ? 'lighter' : 'screen';
          g.globalAlpha = Math.max(0, Math.sin(t * Math.PI)) * (p.type === 'steam' ? 0.45 : 0.8);
          const sz = p.type === 'steam' ? p.size * (0.7 + t * 0.9) : p.size;
          g.setTransform(1, 0, 0, 1, p.x, p.y);
          g.drawImage(p.img, -sz / 2, -sz / 2, sz, sz);
          continue;
        }
        if (p.type === 'petal' || p.type === 'leaf') {
          // Rơi có lực cản: vận tốc ngang tắt dần, rơi về tốc độ ổn định; đung đưa theo gió
          p.vx *= 1 - Math.min(1, dt * 0.9);
          const terminal = p.type === 'leaf' ? 48 : 62;
          p.vy += (terminal - p.vy) * Math.min(1, dt * 1.2);
          p.x += (p.vx + Math.sin(this.time * 0.9 + p.phase) * p.sway) * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * dt;
          const flip = Math.cos(this.time * p.flip + p.phase); // lật nghiêng: co một chiều theo thời gian
          const fade = Math.min(1, p.age / 0.6, (p.life - p.age) / 1.2);
          const c = Math.cos(p.rot);
          const s = Math.sin(p.rot);
          const sy = 0.25 + 0.75 * Math.abs(flip);
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = Math.max(0, fade) * (0.7 + 0.3 * Math.abs(flip));
          g.setTransform(c, s, -s * sy, c * sy, p.x, p.y);
          const w = p.size * 0.66;
          g.drawImage(p.img, -w / 2, -p.size / 2, w, p.size);
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const t = p.age / p.life;
          let a = Math.sin(t * Math.PI);
          if (p.type === 'sparkle') a *= 0.55 + 0.45 * Math.sin(this.time * p.twinkle + p.phase);
          else a *= 0.55;
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = Math.max(0, a);
          g.setTransform(1, 0, 0, 1, p.x, p.y);
          const sz = p.type === 'sparkle' ? p.size * (0.8 + 0.3 * Math.sin(this.time * p.twinkle)) : p.size;
          g.drawImage(p.img, -sz / 2, -sz / 2, sz, sz);
        }
      }
      // Vòng hào quang lan toả
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'lighter';
      for (let i = this.rings.length - 1; i >= 0; i--) {
        const r = this.rings[i];
        r.age += dt;
        if (r.age >= r.life) {
          this.rings.splice(i, 1);
          continue;
        }
        const t = r.age / r.life;
        const rad = 30 + t * (r.grow || 260);
        g.globalAlpha = 1;
        g.strokeStyle = r.color.replace('A', (0.75 * (1 - t)).toFixed(3));
        g.lineWidth = 10 * (1 - t) + 2;
        g.beginPath();
        g.ellipse(r.x, r.y, rad, rad * (r.flat || 0.62), 0, 0, Math.PI * 2);
        g.stroke();
      }
      // Chuỗi hạt sáng xoay quanh lễ vật
      for (let i = this.orbits.length - 1; i >= 0; i--) {
        const o = this.orbits[i];
        o.age += dt;
        if (o.age >= o.life) {
          this.orbits.splice(i, 1);
          continue;
        }
        const t = o.age / o.life;
        const appear = Math.min(1, o.age / 0.8);
        const alpha = Math.min(1, (o.life - o.age) / 0.8);
        for (let k = 0; k < o.n; k++) {
          if (k / o.n > appear) break;
          const a = (k / o.n) * Math.PI * 2 + this.time * 1.4;
          const px = o.x + Math.cos(a) * o.r * (0.9 + 0.1 * t);
          const py = o.y + Math.sin(a) * o.r * 0.55;
          const sz = k === 0 ? 34 : 22;
          g.globalAlpha = alpha;
          g.drawImage(this.sprites.sparkGold, px - sz / 2, py - sz / 2, sz, sz);
        }
      }
      // Tia sáng hộ pháp: các dải sáng toả tròn, xoay chậm, mờ dần
      for (let i = this.rays.length - 1; i >= 0; i--) {
        const r = this.rays[i];
        r.age += dt;
        if (r.age >= r.life) {
          this.rays.splice(i, 1);
          continue;
        }
        const t = r.age / r.life;
        const a = Math.sin(t * Math.PI) * 0.5;
        const len = 900;
        for (let k = 0; k < 14; k++) {
          const ang = r.rot + this.time * 0.15 + (k / 14) * Math.PI * 2;
          const grd = g.createLinearGradient(r.x, r.y, r.x + Math.cos(ang) * len, r.y + Math.sin(ang) * len);
          grd.addColorStop(0, `rgba(255, 230, 160, ${a.toFixed(3)})`);
          grd.addColorStop(1, 'rgba(255, 210, 120, 0)');
          g.fillStyle = grd;
          g.beginPath();
          g.moveTo(r.x, r.y);
          g.lineTo(r.x + Math.cos(ang - 0.05) * len, r.y + Math.sin(ang - 0.05) * len);
          g.lineTo(r.x + Math.cos(ang + 0.05) * len, r.y + Math.sin(ang + 0.05) * len);
          g.closePath();
          g.fill();
        }
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  window.BlessingFx = BlessingFx;
})();
