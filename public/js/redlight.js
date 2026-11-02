/**
 * Màn hình phòng "Đèn Xanh – Đèn Đỏ" — vẽ bằng canvas 1080x1920 (dọc 9:16).
 * Server quyết định mọi thứ (đèn, vị trí, sống/chết); màn hình chỉ nội suy cho mượt và tạo hiệu ứng.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const PREVIEW = params.get('preview') === '1';
  const STUDIO_LINK = /\/live\.html$/.test(location.pathname);
  const OBS = params.get('obs') === '1' || STUDIO_LINK;
  if (OBS || PREVIEW) document.body.classList.add('obs');
  const roomMatch = location.pathname.match(/^\/room\/([^/?#]+)/);
  const ROOM_ID = decodeURIComponent((roomMatch && roomMatch[1]) || params.get('room') || 'main');

  const W = 1080;
  const H = 1920;
  const canvas = document.getElementById('stage');
  const g = canvas.getContext('2d');
  const FONT = "'Be Vietnam Pro', system-ui, sans-serif";

  // Bố cục: phía trên (0–260) bị thanh tên kênh / người xem của TikTok che, phía dưới (từ ~1320) bị bình luận che
  const TOP_Y = 270; // hàng đồng hồ / đèn (hai bên bù nhìn)
  const FY = 640; // vạch đích
  const SY = 1150; // vạch xuất phát
  const LEGEND_Y = 1186;
  const SC = 0.82; // cỡ bù nhìn
  const K = 0.85; // độ phối cảnh

  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * s}px`;
    canvas.style.height = `${H * s}px`;
  }
  window.addEventListener('resize', fit);
  fit();

  // --------------------------------------------------------------------------
  // Trạng thái
  // --------------------------------------------------------------------------
  let clockOffset = 0;
  const now = () => Date.now() + clockOffset;
  const ph = { phase: 'lobby', light: 'green', round: 0, paused: false, phaseEndsAt: 0, lightEndsAt: 0, lightStartedAt: 0, graceMs: 2500 };
  const sprites = new Map(); // id -> sprite
  let results = [];
  let lastWinners = [];
  let legend = [];
  let settings = {};
  const fx = []; // hiệu ứng đang chạy
  const ticker = []; // dòng chữ chạy
  let banner = null; // { text, color, until }
  let giftBanner = null;

  function applyPhase(p) {
    if (!p) return;
    if (p.serverNow) clockOffset = p.serverNow - Date.now();
    const prevLight = ph.light;
    const prevPhase = ph.phase;
    const prevPaused = ph.paused;
    Object.assign(ph, p);
    if (ph.phase === 'play' && (ph.light !== prevLight || prevPhase !== 'play')) onLightChange(ph.light, prevPhase !== 'play');
    if (ph.phase !== prevPhase) onPhaseChange(ph.phase);
    else if (p.paused !== undefined && p.paused !== prevPaused) syncMusic();
  }

  function applyRoster(list) {
    const seen = new Set();
    for (const r of list || []) {
      seen.add(r.id);
      let s = sprites.get(r.id);
      if (!s) {
        s = { id: r.id, dy: r.y, ty: r.y, walk: Math.random() * 6, lastMoveAt: 0, deadSeenAt: 0 };
        sprites.set(r.id, s);
      }
      Object.assign(s, { n: r.n, num: r.num, av: r.av, c: r.c, x: r.x, a: r.a, f: r.f, s: r.s, gi: r.g, k: r.k, h: r.h });
      if (Math.abs(r.y - s.ty) > 0.01) s.ty = r.y;
      if (!r.a && !s.deadSeenAt) s.deadSeenAt = performance.now();
      if (r.a) s.deadSeenAt = 0;
    }
    for (const id of [...sprites.keys()]) if (!seen.has(id)) sprites.delete(id);
  }

  function applyState(st) {
    if (!st) return;
    settings = st.settings || settings;
    applyAudioSettings();
    const rl = st.rl;
    if (!rl) return;
    applyPhase(rl);
    applyRoster(rl.roster);
    results = rl.results || results;
    lastWinners = rl.lastWinners || lastWinners;
    legend = rl.legend || legend;
  }

  function applyPositions(flat) {
    for (let i = 0; i < flat.length; i += 2) {
      const s = sprites.get(flat[i]);
      if (!s) continue;
      const y = flat[i + 1] / 10;
      if (y > s.ty + 0.01) s.lastMoveAt = performance.now();
      s.ty = y;
    }
  }

  // --------------------------------------------------------------------------
  // Âm thanh: bộ âm tự tạo (public/js/redlight-audio.js) + giọng đọc ZeroTTS
  // --------------------------------------------------------------------------
  const audio = new window.RLAudio();
  // Xem trước trong trang quản lý: im lặng cho tới khi bấm "🔇 Nghe thử"
  let previewMuted = PREVIEW;
  let unlocked = false;
  audio.setMuted(previewMuted);

  function unlock() {
    if (previewMuted) return;
    const first = !unlocked;
    unlocked = true;
    audio.ensure();
    const el = document.getElementById('unlock');
    if (el) el.remove();
    if (first) syncMusic();
  }
  window.addEventListener('pointerdown', unlock);
  if (OBS) setTimeout(unlock, 300);
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'preview-audio') return;
    previewMuted = !e.data.on;
    audio.setMuted(previewMuted);
    if (e.data.on) {
      unlocked = false;
      unlock();
    }
  });

  function applyAudioSettings() {
    audio.configure({
      musicOn: settings.bgMusicEnabled !== false,
      sfxOn: settings.sfxEnabled !== false,
      musicVolume: typeof settings.musicVolume === 'number' ? settings.musicVolume : 0.55
    });
  }

  // Nhạc theo pha hiện tại (gọi khi mở màn hình / bật tiếng giữa chừng)
  function syncMusic() {
    if (!unlocked) return;
    if (ph.paused) {
      audio.stopSong();
      audio.stopLoops();
    } else if (ph.phase === 'lobby') audio.lobbyLoop();
    else if (ph.phase === 'play') {
      if (ph.light === 'green') audio.greenSong((ph.lightEndsAt + (ph.warnMs || 1500) - now()) / 1000);
      else if (ph.light === 'red') audio.redLight();
    } else {
      audio.stopSong();
      audio.stopLoops();
    }
  }

  // Giọng đọc: phát lần lượt, bỏ bớt khi hàng chờ quá dài
  const ttsQueue = [];
  let ttsPlaying = false;
  function enqueueTts(url) {
    if (settings.ttsEnabled === false || previewMuted || !unlocked) return;
    if (ttsQueue.length >= 3) ttsQueue.shift();
    ttsQueue.push(url);
    playNextTts();
  }
  function playNextTts() {
    if (ttsPlaying || !ttsQueue.length) return;
    ttsPlaying = true;
    const a = new Audio(ttsQueue.shift());
    a.volume = settings.ttsVolume ?? 1;
    const done = () => {
      ttsPlaying = false;
      playNextTts();
    };
    a.onended = done;
    a.onerror = done;
    a.play().catch(done);
  }

  // --------------------------------------------------------------------------
  // Sự kiện game
  // --------------------------------------------------------------------------
  function onLightChange(light, roundStart) {
    if (light === 'green') {
      if (roundStart && unlocked) audio.countdownGo();
      banner = { text: roundStart ? 'XUẤT PHÁT! THẢ TIM ĐỂ CHẠY' : 'ĐÈN XANH — CHẠY!', color: '#3ee07a', until: performance.now() + 1600 };
    } else if (light === 'warn') {
      if (unlocked) audio.warn();
      banner = { text: 'SẮP ĐÈN ĐỎ!', color: '#ffd43b', until: performance.now() + 1800 };
    } else {
      banner = { text: 'ĐÈN ĐỎ — ĐỨNG IM!', color: '#ff4040', until: Infinity };
    }
    if (light !== 'warn') syncMusic();
  }

  function onPhaseChange(phase) {
    if (phase !== 'play') banner = null;
    if (phase === 'result') {
      if (unlocked) {
        let winners = 0;
        for (const s of sprites.values()) if (s.f && !s.c) winners++;
        audio.resultJingle(winners > 0);
      }
    } else syncMusic();
  }

  // 10 giây cuối ván: tích tắc mỗi giây
  let lastTickSec = -1;
  function finalCountdown() {
    if (ph.phase !== 'play' || ph.paused || !unlocked) return;
    const sec = Math.ceil((ph.phaseEndsAt - now()) / 1000);
    if (sec !== lastTickSec && sec >= 1 && sec <= 10) audio.finalTick(sec);
    lastTickSec = sec;
  }

  function pushTicker(text) {
    ticker.unshift({ text, at: performance.now() });
    if (ticker.length > 4) ticker.length = 4;
  }

  function spritePos(s) {
    return project(s.x, s.dy, s);
  }

  function onFx(e) {
    const s = e.id && sprites.get(e.id);
    const t0 = performance.now();
    switch (e.kind) {
      case 'join':
        if (unlocked) audio.join();
        pushTicker(`👋 ${e.name} vào chơi — số ${e.num}`);
        break;
      case 'out':
        if (unlocked) audio.out();
        if (s) {
          const p = spritePos(s);
          for (let i = 0; i < 14; i++) fx.push({ type: 'straw', x: p.x, y: p.y - 30 * p.scale, vx: (Math.random() - 0.5) * 7, vy: -Math.random() * 7, t0, life: 900 });
          fx.push({ type: 'text', x: p.x, y: p.y - 90 * p.scale, text: 'Loại!', color: '#ff6b6b', size: 30, t0, life: 1100 });
        }
        if (e.name) pushTicker(`❌ Số ${e.num} ${e.name} bị loại`);
        break;
      case 'finish':
        if (unlocked) audio.finish(e.rank);
        if (s) {
          const p = project(s.x, 100, s);
          for (let i = 0; i < 24; i++) fx.push({ type: 'confetti', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 8, hue: Math.random() * 360, t0, life: 1600 });
        }
        pushTicker(`🏁 Số ${e.num} ${e.name} về đích hạng ${e.rank}`);
        break;
      case 'gift':
        if (unlocked) audio.gift(e.itemKind);
        giftBanner = { name: e.name, gift: e.gift, count: e.count, emoji: e.emoji, label: e.label, until: t0 + 3000 };
        break;
      case 'buffalo':
        for (const id of e.ids || []) {
          const v = sprites.get(id);
          if (!v) continue;
          const p = spritePos(v);
          const fromLeft = Math.random() < 0.5;
          fx.push({ type: 'run', emoji: '🐃', x0: fromLeft ? -80 : W + 80, x1: p.x, y: p.y - 20 * p.scale, t0, life: 700, flip: !fromLeft, size: 70 * p.scale + 20 });
        }
        break;
      case 'wind':
        fx.push({ type: 'run', emoji: '🌪️', x0: -120, x1: W + 120, y: FY + 140, t0, life: 1400, size: 140 });
        break;
      case 'chicken':
        for (const id of e.ids || []) {
          const v = sprites.get(id);
          if (v) {
            const p = spritePos(v);
            fx.push({ type: 'text', x: p.x, y: p.y - 110 * p.scale, text: 'Cục tác!', color: '#ffe066', size: 28, t0, life: 1400 });
          }
        }
        break;
      case 'teamShield':
      case 'shieldSave':
        for (const id of e.ids || [e.id]) {
          const v = sprites.get(id);
          if (v) {
            const p = spritePos(v);
            fx.push({ type: 'ring', x: p.x, y: p.y - 30 * p.scale, r: 60 * p.scale, t0, life: 900 });
            if (e.kind === 'shieldSave' && unlocked) audio.shieldSave();
            if (e.kind === 'shieldSave') fx.push({ type: 'text', x: p.x, y: p.y - 100 * p.scale, text: 'Khiên đỡ!', color: '#74c0fc', size: 28, t0, life: 1200 });
          }
        }
        break;
      default:
        break;
    }
  }

  // --------------------------------------------------------------------------
  // Phối cảnh sân: y (0 = xuất phát, 100 = đích), x (0..1 trái → phải)
  // --------------------------------------------------------------------------
  function depth(y) {
    const d = Math.max(0, Math.min(1, y / 100));
    return (d * (1 + K)) / (1 + K * d);
  }
  function project(x, y, s) {
    const f = depth(y);
    const half = 470 - 190 * f;
    let px = W / 2 + (x - 0.5) * 2 * half;
    let py = SY - (SY - FY) * f;
    let scale = 1 - 0.48 * f;
    // Người đã về đích đứng thành hàng sau vạch đích
    if (s && s.f) {
      const i = s.f - 1;
      const side = i % 2 === 0 ? -1 : 1;
      const col = Math.floor(i / 2);
      px = W / 2 + side * (150 + (col % 8) * 46);
      py = FY - 26 - Math.floor(col / 8) * 34;
      scale = 0.5;
    }
    return { x: px, y: py, scale };
  }

  // --------------------------------------------------------------------------
  // Vẽ
  // --------------------------------------------------------------------------
  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function text(str, x, y, { size = 32, weight = 700, color = '#fff', align = 'center', stroke = 0, base = 'middle' } = {}) {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = base;
    if (stroke) {
      g.lineWidth = stroke;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.lineJoin = 'round';
      g.strokeText(str, x, y);
    }
    g.fillStyle = color;
    g.fillText(str, x, y);
  }

  function drawBackground(t) {
    // Trời chiều + luỹ tre phía xa
    const sky = g.createLinearGradient(0, 0, 0, FY);
    sky.addColorStop(0, '#0e1b2b');
    sky.addColorStop(0.55, '#2c4a5e');
    sky.addColorStop(1, '#e8b26a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, FY + 4);
    g.fillStyle = '#1d3b22';
    for (let i = 0; i < 26; i++) {
      const bx = i * 44 - 10;
      const bh = 60 + ((i * 37) % 50);
      g.beginPath();
      g.ellipse(bx, FY - 10, 40, bh, 0, Math.PI, 0);
      g.fill();
    }

    // Ruộng lúa hình thang
    const topHalf = 470 - 190;
    g.beginPath();
    g.moveTo(W / 2 - topHalf - 40, FY);
    g.lineTo(W / 2 + topHalf + 40, FY);
    g.lineTo(W + 60, SY + 60);
    g.lineTo(-60, SY + 60);
    g.closePath();
    const field = g.createLinearGradient(0, FY, 0, SY);
    field.addColorStop(0, '#5f8f3a');
    field.addColorStop(1, '#3f7a2c');
    g.fillStyle = field;
    g.fill();
    g.fillStyle = '#2b5a20';
    g.fillRect(0, SY + 60, W, LEGEND_Y - SY - 60);
    // Luống lúa theo chiều sâu
    g.strokeStyle = 'rgba(30,60,20,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i <= 14; i++) {
      const x = i / 14;
      const a = project(x, 0);
      const b = project(x, 100);
      g.beginPath();
      g.moveTo(a.x, a.y + 60);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    for (let y = 0; y < 100; y += 10) {
      const p = project(0, y);
      g.fillStyle = y % 20 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.04)';
      const q = project(0, y + 10);
      g.fillRect(0, q.y, W, p.y - q.y);
    }

    // Vạch xuất phát
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(project(0, 0).x - 30, SY);
    g.lineTo(project(1, 0).x + 30, SY);
    g.stroke();
    text('XUẤT PHÁT', W / 2, SY + 30, { size: 24, color: 'rgba(255,255,255,0.7)', weight: 900 });

    // Vạch đích: dây cờ đỏ trắng
    const l = project(0, 100).x - 40;
    const r = project(1, 100).x + 40;
    for (let x = l, i = 0; x < r; x += 22, i++) {
      g.fillStyle = i % 2 ? '#fff' : '#e03131';
      g.fillRect(x, FY - 5, 22, 10);
    }
    // đèn lồng hai bên vạch đích
    for (const x of [l - 10, r + 10]) {
      g.fillStyle = '#5a3b1e';
      g.fillRect(x - 4, FY - 120, 8, 120);
      const glow = 0.6 + 0.4 * Math.sin(t / 300);
      g.fillStyle = `rgba(255,${ph.light === 'red' ? 60 : 200},60,${glow})`;
      g.beginPath();
      g.ellipse(x, FY - 130, 18, 24, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Bù nhìn khổng lồ: quay lưng lúc đèn xanh, quay mặt (mắt đỏ) lúc đèn đỏ
  function drawScarecrow(t) {
    const cx = W / 2;
    const base = FY - 8;
    const facing = ph.phase === 'play' && ph.light === 'red';
    const turning = ph.phase === 'play' && ph.light === 'warn';
    g.save();
    g.translate(cx, base);
    g.scale(SC, SC);
    g.translate(-cx, -base);
    g.fillStyle = '#6b4423';
    g.fillRect(cx - 7, base - 300, 14, 300);
    // tay ngang
    g.fillRect(cx - 150, base - 235, 300, 12);
    g.fillStyle = '#e2c275';
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(cx + sx * 150, base - 229);
        g.lineTo(cx + sx * (172 + i * 3), base - 245 + i * 8);
        g.lineWidth = 4;
        g.strokeStyle = '#e2c275';
        g.stroke();
      }
    }
    // áo
    g.fillStyle = facing ? '#8f2d2d' : '#6d3a2a';
    roundRect(cx - 75, base - 250, 150, 140, 20);
    g.fill();
    g.fillStyle = '#c99a3c';
    g.fillRect(cx - 40, base - 200, 34, 28);
    g.fillRect(cx + 15, base - 165, 26, 24);
    // đầu bao bố
    g.fillStyle = '#d8b878';
    g.beginPath();
    g.arc(cx, base - 290, 50, 0, Math.PI * 2);
    g.fill();
    if (facing || turning) {
      const blink = facing ? 1 : 0.5 + 0.5 * Math.sin(t / 60);
      g.fillStyle = `rgba(255,40,40,${blink})`;
      g.shadowColor = '#ff2020';
      g.shadowBlur = 30;
      const off = turning ? 18 : 0;
      g.beginPath();
      g.arc(cx - 18 + off, base - 295, 9, 0, Math.PI * 2);
      g.arc(cx + 18 + off, base - 295, 9, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = '#5a3b1e';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx - 20 + off, base - 268);
      for (let i = 0; i <= 4; i++) g.lineTo(cx - 20 + off + i * 10, base - 268 + (i % 2 ? 5 : 0));
      g.stroke();
    } else {
      // gáy: vài sợi rơm
      g.strokeStyle = '#b8934e';
      g.lineWidth = 3;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(cx + i * 10, base - 260);
        g.lineTo(cx + i * 12, base - 244);
        g.stroke();
      }
    }
    // nón lá
    g.fillStyle = '#efdcae';
    g.beginPath();
    g.moveTo(cx - 92, base - 312);
    g.lineTo(cx, base - 380);
    g.lineTo(cx + 92, base - 312);
    g.closePath();
    g.fill();
    g.strokeStyle = '#b89a5c';
    g.lineWidth = 2;
    g.stroke();
    g.restore();

    // Quạt sáng đỏ quét sân khi quay mặt
    if (facing) {
      const sweep = Math.sin(t / 700) * 0.35;
      const ox = cx;
      const oy = base - 295 * SC;
      const len = SY - oy + 100;
      const a1 = Math.PI / 2 + sweep - 0.55;
      const a2 = Math.PI / 2 + sweep + 0.55;
      const grad = g.createLinearGradient(0, oy, 0, SY);
      grad.addColorStop(0, 'rgba(255,40,60,0.45)');
      grad.addColorStop(1, 'rgba(255,40,60,0.06)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a1) * len * 1.4, oy + Math.sin(a1) * len);
      g.lineTo(ox + Math.cos(a2) * len * 1.4, oy + Math.sin(a2) * len);
      g.closePath();
      g.fill();
    }
  }

  function drawPerson(s, t) {
    const p = spritePos(s);
    let size = 58 * p.scale;
    if (s.gi) size *= 2.1;
    const x = p.x;
    const y = p.y;
    const dead = !s.a;
    const moving = !dead && !s.f && performance.now() - s.lastMoveAt < 350;
    if (moving) s.walk += 0.35;
    g.save();
    let alpha = s.c ? 0.55 : 1;
    if (dead && s.deadSeenAt) alpha *= Math.max(0.3, 1 - (performance.now() - s.deadSeenAt) / 4000);
    g.globalAlpha = alpha;

    // bóng
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(x, y, size * 0.32, size * 0.09, 0, 0, Math.PI * 2);
    g.fill();

    if (s.k && !dead) {
      g.font = `${size * 0.95}px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText('🐔', x, y + size * 0.05);
    } else {
      g.translate(x, y);
      if (dead) g.rotate(Math.PI / 2.2);
      const legSwing = moving ? Math.sin(s.walk) * size * 0.12 : 0;
      // chân
      g.strokeStyle = '#2d2d2d';
      g.lineWidth = Math.max(2, size * 0.08);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-size * 0.09, -size * 0.32);
      g.lineTo(-size * 0.09 + legSwing, 0);
      g.moveTo(size * 0.09, -size * 0.32);
      g.lineTo(size * 0.09 - legSwing, 0);
      g.stroke();
      // áo bà ba
      g.fillStyle = dead ? '#777' : `hsl(${s.h || 120}, 55%, 50%)`;
      roundRect(-size * 0.27, -size * 0.78, size * 0.54, size * 0.5, size * 0.12);
      g.fill();
      // số trên ngực
      if (size > 22) {
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.beginPath();
        g.arc(0, -size * 0.55, size * 0.15, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#111';
        g.font = `900 ${Math.max(9, size * 0.17)}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(s.num), 0, -size * 0.545);
      }
      // đầu
      g.fillStyle = dead ? '#aaa' : '#f1c27d';
      g.beginPath();
      g.arc(0, -size * 0.9, size * 0.15, 0, Math.PI * 2);
      g.fill();
      // nón lá
      g.fillStyle = '#efdcae';
      g.beginPath();
      g.moveTo(-size * 0.3, -size * 0.95);
      g.lineTo(0, -size * 1.2);
      g.lineTo(size * 0.3, -size * 0.95);
      g.closePath();
      g.fill();
      g.setTransform(1, 0, 0, 1, 0, 0);
    }

    // khiên
    if (s.s > 0 && !dead) {
      g.strokeStyle = 'rgba(116,192,252,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(x, y - size * 0.6, size * 0.48, size * 0.7, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // tên
    if (s.n && !s.f) {
      const fs = Math.max(15, Math.round(26 * p.scale * (s.gi ? 1.4 : 1)));
      text(s.n, x, y - size * 1.3, { size: fs, weight: 700, color: dead ? '#bbb' : '#fff', stroke: 4 });
    }
    g.restore();
  }

  function drawHeader(t) {
    // hai bảng hai bên bù nhìn
    g.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(24, TOP_Y - 10, 330, 196, 26);
    g.fill();
    roundRect(W - 354, TOP_Y - 10, 330, 196, 26);
    g.fill();

    // Đèn giao thông
    const lamps = [
      ['red', '#ff3b3b'],
      ['warn', '#ffd43b'],
      ['green', '#3ee07a']
    ];
    g.fillStyle = '#151515';
    roundRect(54, TOP_Y + 6, 270, 96, 48);
    g.fill();
    lamps.forEach(([id, color], i) => {
      const on = ph.phase === 'play' ? ph.light === id : id === 'warn' && Math.sin(t / 400) > 0;
      g.fillStyle = on ? color : '#333';
      if (on) {
        g.shadowColor = color;
        g.shadowBlur = 30;
      }
      g.beginPath();
      g.arc(104 + i * 85, TOP_Y + 54, 32, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    });

    // Đồng hồ / trạng thái
    const remain = Math.max(0, Math.ceil((ph.phaseEndsAt - now()) / 1000));
    const TX = W - 189;
    if (ph.phase === 'play') {
      const mm = String(Math.floor(remain / 60)).padStart(2, '0');
      const ss = String(remain % 60).padStart(2, '0');
      text('THỜI GIAN CÒN', TX, TOP_Y + 24, { size: 22, color: '#ddd', weight: 700 });
      text(`${mm}:${ss}`, TX, TOP_Y + 92, { size: 90, weight: 900, color: remain <= 10 ? '#ff6b6b' : '#fff', stroke: 6 });
    } else if (ph.phase === 'lobby') {
      text('VÁN MỚI SAU', TX, TOP_Y + 24, { size: 22, color: '#ddd' });
      text(`${remain}s`, TX, TOP_Y + 92, { size: 90, weight: 900, color: '#ffd43b', stroke: 6 });
    } else {
      text('KẾT QUẢ', TX, TOP_Y + 80, { size: 64, weight: 900, color: '#ffd43b', stroke: 6 });
    }
    if (ph.paused) text('TẠM DỪNG', TX, TOP_Y + 160, { size: 26, color: '#ffa94d', weight: 900 });

    // Số liệu
    let alive = 0;
    let fin = 0;
    let out = 0;
    for (const s of sprites.values()) {
      if (s.c) continue;
      if (s.f) fin++;
      else if (s.a) alive++;
      else out++;
    }
    text(`VÁN ${ph.round || 0}`, 189, TOP_Y + 128, { size: 26, weight: 900, color: '#ffd43b' });
    text(`🏃${alive}  🏁${fin}  ❌${out}`, 189, TOP_Y + 164, { size: 26, weight: 700 });
  }

  function drawBanner(t) {
    if (ph.phase === 'lobby') {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(120, FY + 110, W - 240, 250, 30);
      g.fill();
      text('💬 BÌNH LUẬN ĐỂ VÀO CHƠI', W / 2, FY + 175, { size: 50, weight: 900, color: '#fff', stroke: 6 });
      text('Thả tim ❤️ để chạy · Đèn đỏ 🔴 phải đứng im', W / 2, FY + 245, { size: 32, color: '#ffe8a3' });
      let n = 0;
      for (const s of sprites.values()) if (!s.c) n++;
      text(`Đã có ${n} người chơi`, W / 2, FY + 305, { size: 30, color: '#9ff0b9', weight: 700 });
      return;
    }
    if (ph.phase === 'result') return drawResults();
    if (!banner || performance.now() > banner.until) return;
    const pulse = 1 + 0.04 * Math.sin(t / 90);
    g.save();
    g.translate(W / 2, FY + 110);
    g.scale(pulse, pulse);
    text(banner.text, 0, 0, { size: 66, weight: 900, color: banner.color, stroke: 10 });
    g.restore();
    if (ph.light === 'red') {
      const armIn = ph.lightStartedAt + ph.graceMs - now();
      if (armIn > 0) text('Dừng tay ngay!', W / 2, FY + 175, { size: 30, color: '#ffd0d0', stroke: 5 });
    }
  }

  const avatarCache = new Map();
  function avatar(url) {
    if (!url) return null;
    let img = avatarCache.get(url);
    if (!img) {
      img = new Image();
      img.src = url;
      avatarCache.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  function drawResults() {
    g.fillStyle = 'rgba(8,14,10,0.85)';
    roundRect(90, FY - 260, W - 180, 760, 34);
    g.fill();
    text('🏆 TOP VỀ ĐÍCH', W / 2, FY - 200, { size: 54, weight: 900, color: '#ffd43b', stroke: 6 });
    if (!results.length) {
      text('Chưa ai về đích ván này', W / 2, FY + 40, { size: 38, color: '#ddd' });
      return;
    }
    results.slice(0, 8).forEach((r, i) => {
      const y = FY - 120 + i * 74;
      const medal = r.rank ? ['🥇', '🥈', '🥉'][r.rank - 1] || `#${r.rank}` : '·';
      text(medal, 170, y, { size: 38, weight: 900 });
      const img = avatar(r.avatar);
      if (img) {
        g.save();
        g.beginPath();
        g.arc(250, y, 28, 0, Math.PI * 2);
        g.clip();
        g.drawImage(img, 222, y - 28, 56, 56);
        g.restore();
      } else {
        g.fillStyle = '#3a5a40';
        g.beginPath();
        g.arc(250, y, 28, 0, Math.PI * 2);
        g.fill();
        text(String(r.num), 250, y, { size: 22, weight: 900 });
      }
      text(r.name, 300, y, { size: 34, weight: 700, align: 'left' });
      const info = r.rank ? `${(r.ms / 1000).toFixed(1)}s` : `${r.dist}% đường`;
      text(info, W - 140, y, { size: 30, align: 'right', color: r.rank ? '#9ff0b9' : '#bbb' });
    });
  }

  function drawLegend(t) {
    const items = legend.length ? legend : [];
    const y = LEGEND_Y;
    g.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(20, y, W - 40, 128, 22);
    g.fill();
    const w = (W - 60) / Math.max(1, items.length);
    items.forEach((it, i) => {
      const x = 30 + i * w + w / 2;
      g.font = `46px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(it.emoji, x, y + 38);
      text(it.label, x, y + 84, { size: 20, weight: 900, color: '#fff' });
      text(it.gift, x, y + 108, { size: 17, weight: 500, color: '#ffd8a8' });
    });

    // Banner người tặng quà
    if (giftBanner && performance.now() < giftBanner.until) {
      const by = y - 74;
      g.fillStyle = 'rgba(255,255,255,0.92)';
      roundRect(40, by, W - 80, 62, 31);
      g.fill();
      const count = giftBanner.count > 1 ? ` ×${giftBanner.count}` : '';
      text(`${giftBanner.emoji} ${giftBanner.name} tặng ${giftBanner.gift}${count} → ${giftBanner.label}`, W / 2, by + 32, { size: 28, weight: 700, color: '#222' });
    }

    // Dòng hoạt động
    ticker.slice(0, 3).forEach((tk, i) => {
      const age = performance.now() - tk.at;
      if (age > 6000) return;
      g.globalAlpha = Math.max(0, 1 - age / 6000);
      text(tk.text, W / 2, y + 160 + i * 38, { size: 26, color: '#fff', stroke: 5 });
      g.globalAlpha = 1;
    });
  }

  function drawFx(t) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      const age = t - e.t0;
      if (age > e.life) {
        fx.splice(i, 1);
        continue;
      }
      const k = age / e.life;
      g.globalAlpha = 1 - k;
      if (e.type === 'straw' || e.type === 'confetti') {
        const x = e.x + e.vx * age * 0.06;
        const y = e.y + e.vy * age * 0.06 + 0.0004 * age * age;
        g.fillStyle = e.type === 'straw' ? '#e2c275' : `hsl(${e.hue},90%,60%)`;
        g.fillRect(x, y, e.type === 'straw' ? 10 : 9, e.type === 'straw' ? 3 : 9);
      } else if (e.type === 'text') {
        text(e.text, e.x, e.y - k * 40, { size: e.size, weight: 900, color: e.color, stroke: 5 });
      } else if (e.type === 'ring') {
        g.strokeStyle = '#74c0fc';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(e.x, e.y, e.r * (0.6 + k), 0, Math.PI * 2);
        g.stroke();
      } else if (e.type === 'run') {
        g.globalAlpha = 1;
        const x = e.x0 + (e.x1 - e.x0) * Math.min(1, k * 1.2);
        g.save();
        g.translate(x, e.y);
        if (e.flip) g.scale(-1, 1);
        g.font = `${e.size}px serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(e.emoji, 0, 0);
        g.restore();
      }
      g.globalAlpha = 1;
    }
  }

  let lastFrame = performance.now();
  function frame(t) {
    const dt = Math.min(0.1, (t - lastFrame) / 1000);
    lastFrame = t;
    for (const s of sprites.values()) s.dy += (s.ty - s.dy) * Math.min(1, dt * 10);
    finalCountdown();

    g.clearRect(0, 0, W, H);
    drawBackground(t);
    drawScarecrow(t);
    // Vẽ xa trước, gần sau
    const list = [...sprites.values()].sort((a, b) => spritePos(a).y - spritePos(b).y);
    for (const s of list) drawPerson(s, t);
    drawFx(t);
    drawHeader(t);
    drawBanner(t);
    drawLegend(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --------------------------------------------------------------------------
  // WebSocket theo phòng
  // --------------------------------------------------------------------------
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws?room=${encodeURIComponent(ROOM_ID)}`);
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch (_) {
        return;
      }
      const p = msg.params || {};
      switch (msg.method) {
        case 'room.state':
          applyState(p);
          break;
        case 'room.event':
          if (p.state) applyState(p.state);
          break;
        case 'rl.phase':
          applyPhase(p);
          break;
        case 'rl.roster':
          if (p.serverNow) clockOffset = p.serverNow - Date.now();
          applyRoster(p.roster);
          break;
        case 'rl.pos':
          applyPositions(p.p || []);
          break;
        case 'rl.fx':
          onFx(p);
          break;
        case 'rl.results':
          results = p.results || [];
          break;
        case 'rl.say':
          if (p.url) enqueueTts(p.url);
          break;
        case 'room.notFound':
          banner = { text: `KHÔNG CÓ PHÒNG "${ROOM_ID}"`, color: '#ff6b6b', until: Infinity };
          break;
        default:
          break;
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch (_) {}
    };
    ws.onclose = () => setTimeout(connect, 2000);
  }
  connect();
})();
