/**
 * Màn hình phòng "Kéo Co 4 Đội" — canvas 1080x1920 (dọc 9:16).
 * Server quyết định mọi thứ (đội, cặp đấu, vị trí dây, lực, thể lực, kỹ năng); màn hình nội suy cho mượt + hiệu ứng.
 * Bố cục: trên = sơ đồ giải + đồng hồ + thanh lực; giữa = hai tháp neon, hai đội kéo dây qua vực;
 * dưới = lượt đấu, 4 thẻ đội (trạng thái / khi nào tới lượt), cách vào đội, bảng kỹ năng.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const PREVIEW = params.get('preview') === '1';
  const STUDIO_LINK = /\/live\.html$/.test(location.pathname);
  const OBS = params.get('obs') === '1' || STUDIO_LINK;
  if (OBS || PREVIEW) document.body.classList.add('obs');
  const roomMatch = location.pathname.match(/^\/room\/([^/?#]+)/);
  const ROOM_ID = decodeURIComponent((roomMatch && roomMatch[1]) || params.get('room') || 'main');
  const MY_V = (() => {
    try {
      return new URL(document.currentScript.src).searchParams.get('v');
    } catch (_) {
      return null;
    }
  })();

  const W = 1080;
  const H = 1920;
  const canvas = document.getElementById('stage');
  const g = canvas.getContext('2d');
  const FONT = "'Be Vietnam Pro', system-ui, sans-serif";
  const ASSET = '/assets/keoco/';
  const AV = 3;

  // Sân (đo trên bg.webp): mặt tháp y 745–880, mép trong tháp trái x≈442, tháp phải x≈634 (ở độ cao dây)
  const ROPE_Y = 792;
  const EDGE_L = 442;
  const EDGE_R = 634;
  const GAP_C = (EDGE_L + EDGE_R) / 2;
  const SHIFT = 150; // |x| = 1 → hàng người dịch 150 px (người đầu dây bên thua qua mép vực)
  const FRONT_GAP = 26; // tay người đầu dây cách mép vực
  const SPRITE_SCALE = 0.75; // ảnh atlas = 1/4 ảnh gốc
  const LINE_LEN = 410; // chiều dài hàng mỗi bên (px)
  // Bố cục chừa chỗ cho giao diện TikTok LIVE: trên cùng ~170 px (tên chủ phòng, số người xem), từ ~1340 trở xuống
  // (khung bình luận, nút quà) dễ bị che → thông tin quan trọng nằm trong 180…1335; hai lề cách 48 px
  const MX = 48;
  const CW = W - MX * 2;
  const Y_HUD = 184;
  const Y_STATUS = 338;
  const Y_BAR = 406;
  const BAR_H = 70;
  const Y_CLOSE = 484;
  const CLOSE_H = 156;
  const Y_GIFTS = 896;
  const Y_TEAMS = 1002;
  const Y_JOIN = 1346;
  // ảnh quà TikTok (dùng chung ảnh của phòng Đèn Đỏ) cho từng kỹ năng
  const GIFT_IMG = { gong: 'turbo', energy: 'clones', tickle: 'shove', glue: 'shield', cheer: 'revive', grease: 'wind', strong: 'giant', fart: 'fart', heave: 'teamShield', stomp: 'stomp' };

  let settings = {};
  const L = (vi, en) => (settings.lang === 'en' ? en : vi);

  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = `${W * s}px`;
    canvas.style.height = `${H * s}px`;
  }
  window.addEventListener('resize', fit);
  fit();

  // --------------------------------------------------------------------------
  // Ảnh
  // --------------------------------------------------------------------------
  const IMG = {};
  const loadImg = (k, src) => {
    const im = new Image();
    im.src = src;
    IMG[k] = im;
    return im;
  };
  const ready = (im) => im && im.complete && im.naturalWidth > 0;
  loadImg('bg', `${ASSET}bg.webp?v=${AV}`);
  for (const t of [1, 2, 3, 4]) loadImg(`t${t}`, `${ASSET}atlas_t${t}.webp?v=${AV}`);
  loadImg('giant', `/assets/redlight/giant_run1.webp`);
  for (const [sk, kind] of Object.entries({ gong: 'turbo', energy: 'clones', tickle: 'shove', glue: 'shield', cheer: 'revive', grease: 'wind', strong: 'giant', fart: 'fart', heave: 'teamShield', stomp: 'stomp' })) {
    loadImg(`gift_${sk}`, `/assets/redlight/gift_${kind}.webp?v=26`);
  }
  let ATLAS = null;
  fetch(`${ASSET}atlas.json?v=${AV}`)
    .then((r) => r.json())
    .then((j) => {
      ATLAS = j;
    })
    .catch(() => {});
  // Tư thế hài (vẽ thêm) → tư thế cơ bản khi nhân vật chưa có ảnh
  const POSE_FALLBACK = { drag: 'slip', bite: 'strain', dig: 'slip', plank: 'pullB' };
  // Vẽ một tư thế: (gx, gy) = điểm nắm dây (hoặc giữa chân nếu tư thế không cầm dây); face = 1 nhìn phải, -1 nhìn trái
  function drawPose(team, variant, pose, gx, gy, face, { scale = SPRITE_SCALE, alpha = 1, rot = 0, footY = null } = {}) {
    if (!ATLAS) return null;
    const fb = POSE_FALLBACK[pose];
    const fr = ATLAS.frames[`v${variant}_${pose}`] || (fb && ATLAS.frames[`v${variant}_${fb}`]) || ATLAS.frames[`v0_${pose}`] || (fb && ATLAS.frames[`v0_${fb}`]);
    if (!fr) return null;
    const [fx, fy, fw, fh, hx, hy] = fr;
    const img = IMG[`t${team}`];
    if (!ready(img)) return null;
    // điểm neo trong khung
    let ax;
    let ay;
    if (hx !== undefined && footY === null) {
      ax = hx;
      ay = hy;
    } else {
      ax = fw / 2;
      ay = fh;
    }
    const dw = fw * scale;
    const dh = fh * scale;
    g.save();
    g.globalAlpha = alpha;
    g.translate(gx, footY !== null ? footY : gy);
    if (rot) g.rotate(rot);
    if (face === -1) g.scale(-1, 1); // đội bên phải: lật ngang lúc vẽ (không giữ bản sao ảnh lật)
    g.drawImage(img, fx, fy, fw, fh, -ax * scale, -ay * scale, dw, dh);
    g.restore();
    return { top: (footY !== null ? footY : gy) - ay * scale, h: dh, footY: (footY !== null ? footY : gy) + (fh - ay) * scale };
  }

  // --------------------------------------------------------------------------
  // Trạng thái từ server
  // --------------------------------------------------------------------------
  let clockOffset = 0;
  const now = () => Date.now() + clockOffset;
  let ph = { phase: 'lobby', phaseEndsAt: 0, bracket: null, matchIdx: -1, champion: null, cup: 0 };
  let roster = { teams: [], lineA: [], lineB: [], queue: [], queueCount: 0, players: 0 };
  let live = { x: 0, a: [], b: [] };
  let liveAt = 0;
  let ropeX = 0; // nội suy
  let ropeTarget = 0;
  let legend = [];
  const pstate = new Map(); // khoá → { st, stam, force }
  const bubbles = new Map(); // khoá → { text, until }
  const marks = new Map(); // khoá → { kind, until } (vừa dùng kỹ năng / bị đòn)
  const feed = []; // dòng tin vào đội
  let giftBanner = null;
  const giftQueue = [];
  let banner = null; // chữ lớn giữa sân { text, sub, color, until }
  let shake = 0;
  const particles = [];
  let endAnim = null; // { at, loserSide }
  let lastPhase = '';

  const teamColor = (t) => (roster.teams.find((x) => x.id === t) || {}).color || ['#888', '#ff3b5c', '#2f8cff', '#ffc928', '#b45cff'][t] || '#888';
  const teamLabel = (t) => {
    const x = roster.teams.find((y) => y.id === t);
    return x ? L(`ĐỘI ${t} · ${x.name.toUpperCase()}`, `TEAM ${t} · ${x.name.toUpperCase()}`) : L(`ĐỘI ${t}`, `TEAM ${t}`);
  };
  const curMatch = () => (ph.bracket && ph.matchIdx >= 0 ? ph.bracket[ph.matchIdx] : null);

  function applyState(st) {
    if (!st) return;
    settings = st.settings || settings;
    document.title = L('Kéo Co 4 Đội', 'Tug of War Cup');
    const un = document.getElementById('unlock');
    if (un) un.textContent = L('🔊 Chạm để bật âm thanh', '🔊 Tap to turn on sound');
    applyAudioSettings();
    const kc = st.kc;
    if (!kc) return;
    applyPhase(kc);
    if (kc.roster) roster = kc.roster;
    if (kc.live) applyLive(kc.live);
    legend = kc.legend || legend;
  }
  function applyPhase(p) {
    if (p.serverNow) clockOffset = p.serverNow - Date.now();
    const prev = ph.phase;
    ph = { ...ph, ...p };
    if (MY_V && p.clientV && String(p.clientV) !== MY_V && p.phase !== 'pull' && p.phase !== 'intro') {
      setTimeout(() => location.reload(), 800);
    }
    if (prev !== ph.phase) onPhaseChange(prev, ph.phase);
  }
  function applyLive(p) {
    live = p;
    liveAt = performance.now();
    ropeTarget = p.x || 0;
    for (const [k, st, stam, force] of [...(p.a || []), ...(p.b || [])]) pstate.set(k, { st, stam, force });
  }

  function onPhaseChange(prev, next) {
    const m = curMatch();
    if (next === 'intro' && m) {
      endAnim = null;
      ropeX = ropeTarget = 0;
      banner = { text: m.label.toUpperCase(), sub: `${teamLabel(m.a)}  VS  ${teamLabel(m.b)}`, color: '#fff', until: ph.phaseEndsAt - clockOffset - 3000 };
    } else if (next === 'pull') {
      banner = { text: L('KÉO!', 'PULL!'), color: '#ffe066', until: Date.now() + 1100, big: true };
      if (unlocked) audio.countdownGo();
    } else if (next === 'matchEnd') {
      // fx 'matchEnd' tới cùng lúc: vẽ trong onFx
    } else if (next === 'draw') {
      banner = { text: L('BỐC THĂM', 'THE DRAW'), sub: L('Ghép cặp bán kết ngẫu nhiên', 'Random semi-final pairs'), color: '#ffe066', until: Date.now() + 4200 };
    } else if (next === 'lobby') {
      endAnim = null;
      ropeX = ropeTarget = 0;
    } else if (next === 'champion' && unlocked) audio.finish(1);
    lastPhase = next;
  }

  function onFx(p) {
    const t = performance.now();
    switch (p.kind) {
      case 'say':
        bubbles.set(p.key, { text: p.text, at: t, until: t + (ph.phase === 'pull' ? 3500 : 4500) });
        break;
      case 'join':
        pushFeed(p.moved ? L(`${p.name}: Đội ${p.moved} đầy → vào Đội ${p.team}`, `${p.name}: Team ${p.moved} full → Team ${p.team}`) : L(`${p.name} vào Đội ${p.team}`, `${p.name} joined Team ${p.team}`), p.team);
        if (unlocked) audio.join();
        break;
      case 'switch':
        pushFeed(p.auto ? L(`${p.name} được chuyển sang Đội ${p.team} cho cân`, `${p.name} moved to Team ${p.team} to balance`) : L(`${p.name} đổi sang Đội ${p.team}`, `${p.name} switched to Team ${p.team}`), p.team);
        break;
      case 'full':
        pushFeed(L(`${p.name}: Đội ${p.want} đầy, ở lại Đội ${p.team}`, `${p.name}: Team ${p.want} is full, staying in Team ${p.team}`), p.team);
        break;
      case 'stay':
        pushFeed(L(`${p.name} đang ở Đội ${p.team} (đổi đội lúc chờ giải)`, `${p.name} is in Team ${p.team} (switch between cups)`), p.team);
        break;
      case 'queue':
        pushFeed(L(`${p.name} vào phòng chờ (#${p.pos}) — chơi giải sau`, `${p.name} is in the waiting room (#${p.pos}) — next cup`), 0);
        break;
      case 'gift':
        giftQueue.push(p);
        if (giftQueue.length > 6) giftQueue.shift();
        if (unlocked) audio.gift(p.skill === 'fart' ? 'fart' : 'turbo');
        break;
      case 'skill':
        onSkill(p, t);
        break;
      case 'exhaust':
        marks.set(p.key, { kind: 'tired', until: t + 2000 });
        break;
      case 'overtime':
        banner = { text: L('PHÚT CHÓT +10s', 'OVERTIME +10s'), color: '#ff922b', until: Date.now() + 1800 };
        break;
      case 'ropeBreak':
        banner = { text: L('DÂY ĐỨT!', 'ROPE SNAPPED!'), color: '#ff6b6b', until: Date.now() + 1800 };
        shake = 14;
        break;
      case 'refSleep':
        banner = { text: L('TRỌNG TÀI NGỦ GẬT 😴', 'REFEREE ASLEEP 😴'), sub: L('Kéo cũng không tính!', 'Pulls do not count!'), color: '#a5d8ff', until: Date.now() + 3500 };
        break;
      case 'hoDo':
        banner = { text: L('HÒ DÔ! HÒ DÔ!', 'HEAVE HO!'), sub: L('Mọi tim ×1,3', 'Every tap ×1.3'), color: '#ffe066', until: Date.now() + 2800 };
        break;
      case 'matchEnd': {
        const m = curMatch();
        const loserSide = m && p.loser === m.a ? 'a' : 'b';
        endAnim = { at: t, loserSide, startX: ropeX };
        banner = {
          text: L(`${teamLabel(p.winner)} THẮNG!`, `${teamLabel(p.winner)} WINS!`),
          sub: p.mvp ? `💪 ${L('Kéo khoẻ nhất', 'Strongest')}: ${p.mvp.name}` : '',
          color: teamColor(p.winner),
          until: Date.now() + 5500
        };
        if (unlocked) audio.resultJingle(true);
        break;
      }
      case 'champion':
        for (let i = 0; i < 120; i++) particles.push(confetti());
        break;
      default:
        break;
    }
  }
  function pushFeed(text, team) {
    feed.push({ text, team, at: performance.now() });
    if (feed.length > 5) feed.shift();
  }
  const SKILL_EMOJI = { gong: '💪', energy: '🧃', tickle: '🤭', glue: '🧤', cheer: '📣', grease: '🧈', strong: '🏋️', fart: '💨', heave: '🥁', stomp: '🦶' };
  function onSkill(p, t) {
    if (p.giverKey) marks.set(p.giverKey, { kind: p.skill, until: t + 2500 });
    for (const k of p.targets || []) marks.set(k, { kind: `hit_${p.skill}`, until: t + 2200 });
    if (p.blocked) {
      banner = { text: L('🧤 GĂNG KEO CHẶN ĐÒN!', '🧤 BLOCKED BY STICKY GLOVES!'), color: '#69db7c', until: Date.now() + 1500 };
      return;
    }
    const m = curMatch();
    if (!m) return;
    const side = p.team === m.a ? 'a' : 'b';
    const dir = side === 'a' ? 1 : -1; // hướng về phía đối thủ
    if (p.skill === 'fart') {
      const gx = lineX(side, 2);
      for (let i = 0; i < 40; i++) particles.push({ kind: 'gas', x: gx, y: ROPE_Y - 20, vx: dir * (120 + Math.random() * 220), vy: -20 - Math.random() * 60, life: 1.6 + Math.random() * 0.6, t: 0, r: 12 + Math.random() * 18 });
      if (unlocked) audio.fart();
    } else if (p.skill === 'stomp') {
      stomp = { at: t, side: side === 'a' ? 'b' : 'a' };
      shake = 18;
    } else if (p.skill === 'grease') {
      for (let i = 0; i < 24; i++) particles.push({ kind: 'drip', x: lineX(side === 'a' ? 'b' : 'a', Math.floor(Math.random() * 10)), y: ROPE_Y, vx: 0, vy: 40 + Math.random() * 60, life: 1.2, t: 0, r: 5 });
    } else if (p.skill === 'heave' || p.skill === 'cheer') {
      for (let i = 0; i < 30; i++) particles.push({ ...confetti(), x: side === 'a' ? 60 + Math.random() * 380 : 640 + Math.random() * 380, y: 600 + Math.random() * 60 });
    }
  }
  let stomp = null;
  function confetti() {
    return { kind: 'conf', x: Math.random() * W, y: -20 - Math.random() * 400, vx: (Math.random() - 0.5) * 80, vy: 120 + Math.random() * 160, life: 6, t: 0, r: 6 + Math.random() * 6, c: ['#ff3b5c', '#2f8cff', '#ffc928', '#b45cff', '#69db7c', '#fff'][Math.floor(Math.random() * 6)], rot: Math.random() * 6 };
  }

  // --------------------------------------------------------------------------
  // Âm thanh: dùng lại bộ âm Đèn Đỏ (WebAudio) + giọng đọc + nhạc chờ
  // --------------------------------------------------------------------------
  const audio = new window.RLAudio({ assetVer: 1 });
  let previewMuted = PREVIEW;
  let unlocked = false;
  audio.setMuted(previewMuted);
  const lobbyEl = new Audio('/assets/redlight/lobby_2.m4a');
  lobbyEl.loop = true;
  lobbyEl.preload = 'auto';
  let lobbyWired = false;
  let lobbyVol = 0;
  function unlock() {
    if (previewMuted) return;
    unlocked = true;
    audio.ensure();
    const el = document.getElementById('unlock');
    if (el) el.remove();
  }
  window.addEventListener('pointerdown', unlock);
  if (OBS) setTimeout(unlock, 300);
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'preview-audio') return;
    previewMuted = !e.data.on;
    audio.setMuted(previewMuted);
    if (e.data.on) unlock();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && unlocked) audio.ensure();
  });
  function applyAudioSettings() {
    audio.configure({ musicOn: settings.bgMusicEnabled !== false, sfxOn: true, musicVolume: settings.musicVolume ?? 0.5 });
  }
  // nhạc chờ (lúc chờ giải / vô địch) + trống "hò dô" lúc kéo (nhanh dần 10 giây cuối)
  let beatAt = 0;
  function musicTick(dt) {
    const tn = performance.now();
    const want = unlocked && !previewMuted && settings.bgMusicEnabled !== false && (ph.phase === 'lobby' || ph.phase === 'draw' || ph.phase === 'champion');
    lobbyVol += ((want ? 0.8 : 0) - lobbyVol) * Math.min(1, dt * 2.5);
    if (lobbyVol > 0.01) {
      if (!lobbyWired) lobbyWired = audio.connectMusic(lobbyEl);
      lobbyEl.volume = Math.max(0, Math.min(1, lobbyVol));
      if (lobbyEl.paused) lobbyEl.play().catch(() => {});
    } else if (!lobbyEl.paused) lobbyEl.pause();
    if (unlocked && ph.phase === 'pull' && !previewMuted) {
      const left = (ph.phaseEndsAt - now()) / 1000;
      const gap = left < 10 ? 330 : 520;
      if (tn - beatAt > gap) {
        beatAt = tn;
        const c = audio.ensure();
        if (c) {
          audio.kick(c.currentTime, 0.32);
          audio.hat(c.currentTime + gap / 2000, 0.05);
        }
      }
    }
  }
  // giọng đọc
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
    const url = ttsQueue.shift();
    const done = () => {
      ttsPlaying = false;
      playNextTts();
    };
    const c = audio.ensure();
    if (!c) return done();
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .then((buf) => {
        const src = c.createBufferSource();
        const gn = c.createGain();
        gn.gain.value = settings.ttsVolume ?? 1;
        src.buffer = buf;
        src.connect(gn).connect(c.destination);
        src.onended = done;
        src.start();
      })
      .catch(done);
  }

  // --------------------------------------------------------------------------
  // Vẽ chữ / khối
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
  function text(s, x, y, { size = 24, weight = 700, color = '#fff', align = 'center', stroke = 0, strokeColor = 'rgba(0,0,0,.85)', base = 'middle', maxW = 0 } = {}) {
    g.font = `${weight} ${size}px ${FONT}`;
    g.textAlign = align;
    g.textBaseline = base;
    let str = String(s);
    if (maxW > 0) {
      while (str.length > 1 && g.measureText(str).width > maxW) str = str.slice(0, -1);
      if (str !== String(s)) str = `${str.slice(0, -1)}…`;
    }
    if (stroke) {
      g.lineWidth = stroke;
      g.strokeStyle = strokeColor;
      g.lineJoin = 'round';
      g.strokeText(str, x, y);
    }
    g.fillStyle = color;
    g.fillText(str, x, y);
    return g.measureText(str).width;
  }
  function panel(x, y, w, h, { r = 18, fill = 'rgba(10,12,30,.78)', border = 'rgba(255,255,255,.14)', glow = null } = {}) {
    g.save();
    if (glow) {
      g.shadowColor = glow;
      g.shadowBlur = 18;
    }
    roundRect(x, y, w, h, r);
    g.fillStyle = fill;
    g.fill();
    g.restore();
    roundRect(x, y, w, h, r);
    g.lineWidth = 2;
    g.strokeStyle = glow || border;
    g.stroke();
  }
  const fmtTime = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // --------------------------------------------------------------------------
  // Hàng người kéo
  // --------------------------------------------------------------------------
  function spacing(n) {
    return Math.min(44, LINE_LEN / Math.max(1, n));
  }
  // x điểm nắm dây của người thứ i (0 = đầu dây) bên side, chưa tính dịch dây
  function lineX0(side, i, n) {
    const sp = spacing(n || 10);
    return side === 'a' ? EDGE_L - FRONT_GAP - i * sp : EDGE_R + FRONT_GAP + i * sp;
  }
  function lineX(side, i) {
    const n = side === 'a' ? roster.lineA.length : roster.lineB.length;
    return lineX0(side, i, n) - ropeX * SHIFT;
  }
  // Hết trận: hàng bên thua bị kéo tuột về phía vực (px), dùng chung cho người và dây
  function endSlide(side, t) {
    if (ph.phase !== 'matchEnd' || !endAnim || endAnim.loserSide !== side) return 0;
    const e = (t - endAnim.at) / 1000;
    const slide = Math.min(1, e / 2.4) ** 2 * 520;
    return side === 'a' ? slide : -slide;
  }
  // Dây: một đường liền qua tay mọi người. Võng nhẹ trong vực, rung theo độ căng (cả hai đội cùng kéo mạnh)
  let ropeVel = 0; // tốc độ dịch dây (đơn vị x / giây), dương = về phía đội phải
  let lastRopeX = 0;
  let tension = 0;
  function ropeYAt(x, t) {
    const xa = lineX('a', 0);
    const xb = lineX('b', 0);
    let y = ROPE_Y;
    if (x > xa && x < xb) {
      const u = (x - xa) / Math.max(1, xb - xa);
      y += 4 * u * (1 - u) * (14 - tension * 9); // căng thì bớt võng
    }
    return y + Math.sin(x / 16 + t / 45) * tension * 1.8;
  }
  // Tư thế mỗi người: chọn theo trạng thái server + diễn biến dây + "tính cách" riêng; giữ tối thiểu ~0,5 s cho đỡ giật
  const poseMem = new Map(); // khoá → { pose, until }
  const hashK = (k) => {
    let h = 7;
    for (const ch of String(k)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  };
  function choosePose(p, side, i, t) {
    const s = pstate.get(p.k);
    const st = s ? s.st : 'idle';
    if (ph.phase === 'intro') return { pose: 'pullA', st: 'idle' };
    const mem = poseMem.get(p.k);
    const forced = st === 'slip' || st === 'tired' || st === 'tickle';
    if (mem && t < mem.until && !forced && mem.st === st) return mem;
    const h = hashK(p.k);
    const losing = side === 'a' ? ropeVel > 0.015 : ropeVel < -0.015; // dây đang trôi về phía đối thủ
    const winning = side === 'a' ? ropeVel < -0.015 : ropeVel > 0.015;
    const danger = side === 'a' ? ropeX > 0.55 : ropeX < -0.55; // sát mép vực bên mình
    const r = Math.random();
    let pose = 'pullA';
    switch (st) {
      case 'slip':
        pose = 'slip';
        break;
      case 'tired':
        pose = 'dig'; // kiệt sức: ngồi phịch, gót bấm xuống sàn
        break;
      case 'tickle':
        pose = 'cheer'; // cười lăn, buông tay
        break;
      case 'dazed':
        pose = r < 0.5 ? 'strain' : 'drag';
        break;
      case 'strain':
        pose = h % 3 === 0 ? 'bite' : r < 0.25 ? 'bite' : 'strain';
        break;
      case 'pull':
        // vẫn kéo bình thường là chính, nhưng thỉnh thoảng "lên đồng": cắn dây, ngả tấm ván, ngồi bấm gót
        if (losing && i < 6 && r < 0.5) pose = 'drag'; // đầu dây bị lôi đi
        else if (danger) pose = r < 0.6 ? 'dig' : 'strain';
        else if (winning && r < 0.35) pose = 'plank';
        else if (r < 0.12) pose = 'bite';
        else if (r < 0.2) pose = 'plank';
        else if (r < 0.26) pose = 'dig';
        else pose = r < 0.63 ? 'pullA' : 'pullB';
        break;
      default:
        // không thả tim: ngồi thở, hoặc bị lôi nếu dây đang trôi về phía đối thủ
        pose = losing && i < 4 ? 'drag' : danger ? 'dig' : r < 0.3 ? 'dig' : 'pullA';
    }
    const res = { pose, st, until: t + 450 + Math.random() * 700 };
    poseMem.set(p.k, res);
    return res;
  }
  // Tiếng hét ngẫu nhiên kiểu truyện tranh của người đang gồng / bị lôi
  const shouts = [];
  const SHOUT_VI = ['Ư Ư Ư!', 'CỐ LÊNNN!', 'KÉOOO!', 'HỰ!', 'MẸ ƠI!', 'Á Á Á!', 'TUỘT TAY!', 'GIỮ CHẶT!', 'ĐAU LƯNG!', 'HÒ DÔ!'];
  const SHOUT_EN = ['NGHHH!', 'PULLLL!', 'HEAVE!', 'MOMMY!', 'AAAH!', 'HOLD ON!', 'MY BACK!', 'NOOO!', 'HUP!', 'GRRR!'];
  function drawLine(side, team, list, t, layer) {
    const n = list.length;
    const face = side === 'a' ? 1 : -1;
    const ending = ph.phase === 'matchEnd' && endAnim;
    const loser = ending && endAnim.loserSide === side;
    const winner = ending && !loser;
    const out = [];
    for (let i = 0; i < n; i++) {
      const row = i % 2 === 0 ? 'back' : 'front';
      if ((layer === 'back') !== (row === 'back')) continue;
      const p = list[i];
      const h = hashK(p.k);
      let gx = lineX(side, i) + (loser ? endSlide(side, t) : 0);
      let gy = ropeYAt(gx, t); // tay luôn nằm trên dây
      const scale = SPRITE_SCALE * (row === 'back' ? 0.9 : 1); // hàng sau xa hơn, nhỏ hơn
      let pose;
      let st = 'idle';
      let rot = 0;
      let alpha = 1;
      const ph0 = (h % 628) / 100;
      if (winner) {
        const e = (t - endAnim.at) / 1000;
        pose = e > 0.8 ? (h % 3 === 0 ? 'plank' : 'cheer') : 'pullB';
        if (pose === 'cheer') gy -= Math.abs(Math.sin(e * 6 + i)) * 14;
      } else if (loser) {
        // bị kéo tuột về phía vực, ai qua mép thì rơi xuống
        pose = i % 3 === 0 ? 'drag' : 'slip';
        const past = side === 'a' ? gx - EDGE_L : EDGE_R - gx;
        if (past > 0) {
          const fallT = past / 220;
          gy += 300 * fallT * fallT;
          rot = face * fallT * 1.6;
          alpha = Math.max(0, 1 - fallT * 0.5);
        }
      } else if (ph.phase === 'champion' || ph.phase === 'lobby' || ph.phase === 'draw') {
        pose = 'cheer';
        gy -= Math.abs(Math.sin(t / 260 + i)) * 8;
      } else {
        const r = choosePose(p, side, i, t);
        pose = r.pose;
        st = r.st;
        // lắc lư quanh điểm nắm dây (tay giữ nguyên trên dây): ngả ra sau rồi nhích lên theo nhịp riêng mỗi người
        const effort = st === 'strain' ? 1 : st === 'pull' ? 0.75 : 0.25;
        rot = -face * (Math.sin(t / (230 + (h % 90)) + ph0) * 0.07 * effort);
        if (st === 'strain' || pose === 'bite') rot += Math.sin(t / 22 + i) * 0.025; // run bần bật
        if (pose === 'drag') rot += -face * Math.sin(t / 90 + ph0) * 0.08; // giãy giụa
        if (st === 'dazed') rot += Math.sin(t / 140 + ph0) * 0.12;
      }
      if (alpha <= 0) continue;
      const useFoot = pose === 'cheer';
      const box = drawPose(team, p.v, pose, gx, gy, face, { rot, alpha, scale, footY: useFoot ? gy + 40 : null });
      out.push({ p, i, gx, gy, st, box, row, pose });
    }
    return out;
  }
  // Bụi dưới chân khi bị lôi / bấm gót, mồ hôi văng, tiếng hét
  function chaosFx(drawn, side, t, dt) {
    const face = side === 'a' ? 1 : -1;
    for (const d of drawn) {
      if (!d.box) continue;
      if ((d.pose === 'drag' || d.pose === 'dig') && Math.random() < dt * 6) {
        particles.push({ kind: 'dust', x: d.gx - face * (10 + Math.random() * 30), y: d.box.footY - 4, vx: face * (20 + Math.random() * 40), vy: -10 - Math.random() * 20, life: 0.7, t: 0, r: 5 + Math.random() * 6 });
      }
      if ((d.pose === 'strain' || d.pose === 'bite' || d.pose === 'plank') && Math.random() < dt * 1.5) {
        particles.push({ kind: 'sweat', x: d.gx - face * 18, y: d.box.top + 12, vx: -face * (40 + Math.random() * 60), vy: -60 - Math.random() * 40, life: 0.8, t: 0, r: 3 });
      }
      const loud = d.pose === 'strain' || d.pose === 'bite' || d.pose === 'drag' || d.pose === 'dig';
      if (loud && ph.phase === 'pull' && shouts.length < 4 && Math.random() < dt * 0.25) {
        const list = settings.lang === 'en' ? SHOUT_EN : SHOUT_VI;
        shouts.push({ text: list[Math.floor(Math.random() * list.length)], x: d.gx - face * 12, y: d.box.top - 10, at: t, rot: (Math.random() - 0.5) * 0.4, side });
      }
    }
  }
  function drawShouts(t) {
    for (let i = shouts.length - 1; i >= 0; i--) {
      const s = shouts[i];
      const e = (t - s.at) / 1000;
      if (e > 1.2) {
        shouts.splice(i, 1);
        continue;
      }
      const sc = e < 0.15 ? 0.6 + (e / 0.15) * 0.5 : 1.1 - Math.min(0.1, (e - 0.15) * 0.2);
      g.save();
      g.globalAlpha = e > 0.9 ? (1.2 - e) / 0.3 : 1;
      g.translate(s.x, s.y - e * 26);
      g.rotate(s.rot);
      g.scale(sc, sc);
      text(s.text, 0, 0, { size: 22, weight: 900, color: '#fff', stroke: 6, strokeColor: '#e8590c' });
      g.restore();
    }
  }
  // Hiệu ứng trên đầu từng người (sau khi vẽ người)
  let labelBoxes = [];
  // Đặt nhãn không đè nhãn khác: thử dịch lên 2 lần, vẫn đè thì bỏ
  function placeLabel(x, y, w, h) {
    for (let k = 0; k < 3; k++) {
      const yy = y - k * (h + 2);
      const hit = labelBoxes.some((b) => x - w / 2 < b.x + b.w / 2 && x + w / 2 > b.x - b.w / 2 && yy - h / 2 < b.y + b.h / 2 && yy + h / 2 > b.y - b.h / 2);
      if (!hit) {
        labelBoxes.push({ x, y: yy, w, h });
        return yy;
      }
    }
    return null;
  }
  function drawOverheads(drawn, side, t) {
    const list = side === 'a' ? roster.lineA : roster.lineB;
    // tên: 3 người kéo khoẻ nhất bên này (theo lực nhịp gần nhất), người có bong bóng chat / vừa dùng kỹ năng
    const top = list
      .filter((p) => !p.npc)
      .map((p) => ({ k: p.k, f: (pstate.get(p.k) || {}).force || 0 }))
      .sort((a, b) => b.f - a.f)
      .slice(0, 3)
      .map((x) => x.k);
    for (const d of drawn) {
      if (!d.box) continue;
      const headY = d.box.top - 4;
      const x = d.gx + (side === 'a' ? -14 : 14);
      const mk = marks.get(d.p.k);
      const bub = bubbles.get(d.p.k);
      // trạng thái
      if (d.st === 'tired' || (mk && mk.kind === 'tired' && mk.until > t)) text('😮‍💨', x, headY - 6, { size: 22 });
      else if (d.st === 'dazed') text('💫', x, headY - 6 + Math.sin(t / 120) * 3, { size: 22 });
      else if (d.st === 'tickle') text(L('HAHA', 'HAHA'), x, headY - 8, { size: 16, weight: 900, color: '#ffe066', stroke: 4 });
      else if (d.st === 'strain' && Math.floor(t / 300 + d.i) % 3 === 0) text('💦', x + 14 * (side === 'a' ? 1 : -1), headY + 10, { size: 16 });
      if (mk && mk.until > t && SKILL_EMOJI[mk.kind]) text(SKILL_EMOJI[mk.kind], x, headY - 30 - (1 - (mk.until - t) / 2500) * 20, { size: 30 });
      // tên ngay trên đầu người chơi thật: chữ nhỏ, so le 3 tầng theo vị trí (người cạnh nhau ở tầng khác nhau),
      // vẫn đè thì bỏ tên đó; bình luận (câu dài) xếp vào dải phía trên sân có đường chỉ xuống (drawLabels)
      if (!d.p.npc && ph.phase !== 'matchEnd') {
        const tier = d.i % 3;
        const sp = spacing(list.length);
        const crown = top[0] === d.p.k && ph.phase === 'pull' ? '👑' : '';
        const chatting = bub && bub.until > t;
        const nm = `${crown}${d.p.n}`;
        const maxW = Math.max(40, Math.min(96, sp * 3 - 6));
        g.font = `800 13px ${FONT}`;
        const lw = Math.min(maxW, g.measureText(nm).width) + 6;
        const ly = placeLabel(x, headY - 8 - tier * 16, lw, 15);
        if (ly !== null) {
          text(nm, x, ly, { size: 13, weight: 800, color: chatting ? '#ffe066' : '#fff', stroke: 3.5, strokeColor: teamColor(side === 'a' ? curMatch().a : curMatch().b), maxW });
        }
        if (chatting) labelReqs.push({ side, k: d.p.k, name: d.p.n, kind: 'chat', text: bub.text, crown: false, prio: 3 + bub.at / 1e9, hx: x, hy: (ly ?? headY) - 8, baseX: lineX(side, d.i) + (side === 'a' ? -10 : 10) });
      } else if (d.p.npc && ph.phase === 'pull' && d.i % 4 === 0) {
        text('🤖', x, headY - 6, { size: 14 });
      }
      // thanh thể lực người thật (dưới chân)
      if (!d.p.npc && ph.phase === 'pull' && d.box) {
        const s = pstate.get(d.p.k);
        if (s) {
          const v = Math.max(0, Math.min(1, s.stam / 100));
          const bw = 26;
          const by = d.box.footY + 2;
          g.fillStyle = 'rgba(0,0,0,.6)';
          g.fillRect(d.gx - bw / 2 - (side === 'a' ? 12 : -12), by, bw, 5);
          g.fillStyle = v > 0.5 ? '#51cf66' : v > 0.2 ? '#fcc419' : '#ff6b6b';
          g.fillRect(d.gx - bw / 2 - (side === 'a' ? 12 : -12), by, bw * v, 5);
        }
      }
    }
  }
  // Dải nhãn: 6 hàng ngay trên sân, mỗi bên xếp nhãn từ hàng thấp lên, không chồng nhau, có đường chỉ xuống đúng người.
  // Giữ hàng cũ của mỗi người (đỡ nhảy chỗ); bình luận ưu tiên hơn tên; tối đa 7 nhãn mỗi bên.
  let labelReqs = [];
  const LANE_Y0 = 708;
  const LANE_H = 30;
  const LANES = 3;
  const laneMem = new Map(); // khoá → hàng đã xếp lần trước
  function drawLabels(m, t) {
    const placed = [];
    for (const side of ['a', 'b']) {
      const team = side === 'a' ? m.a : m.b;
      const col = teamColor(team);
      const minX = side === 'a' ? MX : GAP_C + 6;
      const maxX = side === 'a' ? GAP_C - 6 : W - MX;
      const reqs = labelReqs
        .filter((r) => r.side === side)
        .sort((x, y) => y.prio - x.prio)
        .slice(0, 7);
      for (const r of reqs) {
        const nameTxt = `${r.crown ? '👑 ' : ''}${r.name}`;
        g.font = `800 16px ${FONT}`;
        const nw = Math.min(130, g.measureText(nameTxt).width);
        let tw = 0;
        let body = '';
        if (r.kind === 'chat') {
          g.font = `600 16px ${FONT}`;
          body = r.text;
          tw = Math.min(260 - nw, g.measureText(body).width);
        }
        const w = nw + (tw ? tw + 10 : 0) + 18;
        const cx = Math.max(minX + w / 2, Math.min(maxX - w / 2, r.baseX));
        const fits = (lane) => {
          const y = LANE_Y0 - lane * LANE_H;
          if (placed.some((q) => q.y === y && cx - w / 2 < q.x + q.w / 2 + 6 && cx + w / 2 > q.x - q.w / 2 - 6)) return false;
          // không đè tên trên đầu người chơi
          return !labelBoxes.some((bx) => cx - w / 2 < bx.x + bx.w / 2 && cx + w / 2 > bx.x - bx.w / 2 && y - 12 < bx.y + bx.h / 2 && y + 13 > bx.y - bx.h / 2);
        };
        let lane = laneMem.get(r.k);
        if (lane === undefined || !fits(lane)) {
          lane = -1;
          for (let k = 0; k < LANES; k++) {
            if (fits(k)) {
              lane = k;
              break;
            }
          }
        }
        if (lane < 0) continue;
        laneMem.set(r.k, lane);
        const y = LANE_Y0 - lane * LANE_H;
        placed.push({ x: cx, y, w });
        // đường chỉ xuống đầu người
        g.strokeStyle = col;
        g.globalAlpha = 0.75;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx, y + 12);
        g.lineTo(r.hx, Math.max(y + 14, r.hy - 2));
        g.stroke();
        g.globalAlpha = 1;
        // nhãn
        roundRect(cx - w / 2, y - 12, w, 25, 12);
        g.fillStyle = r.kind === 'chat' ? 'rgba(255,255,255,.95)' : 'rgba(10,10,28,.82)';
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = col;
        g.stroke();
        const x0 = cx - w / 2 + 9;
        text(nameTxt, x0, y + 1, { size: 16, weight: 800, color: r.kind === 'chat' ? col : '#fff', align: 'left', maxW: 130, stroke: r.kind === 'chat' && team === 3 ? 3 : 0, strokeColor: '#333' });
        if (body) text(body, x0 + nw + 10, y + 1, { size: 16, weight: 600, color: '#111', align: 'left', maxW: tw });
      }
    }
    // ai không còn nhãn thì quên hàng cũ
    if (laneMem.size > 80) laneMem.clear();
  }
  function drawRope(t) {
    const m = curMatch();
    if (!m) return;
    const broke = live.broke > 0 && performance.now() - liveAt < live.broke;
    const nA = roster.lineA.length;
    const nB = roster.lineB.length;
    const sa = endSlide('a', t);
    const sb = endSlide('b', t);
    const xa0 = lineX('a', Math.max(0, nA - 1)) - 34 + sa;
    const xb0 = lineX('b', Math.max(0, nB - 1)) + 34 + sb;
    const xa = lineX('a', 0) + sa;
    const xb = lineX('b', 0) + sb;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const path = (x1, x2, endDrop = 0) => {
      g.beginPath();
      const steps = Math.max(2, Math.ceil(Math.abs(x2 - x1) / 10));
      for (let k = 0; k <= steps; k++) {
        const x = x1 + ((x2 - x1) * k) / steps;
        let y = ropeYAt(x, t);
        if (endDrop) y += endDrop * Math.max(0, (k / steps - 0.6) / 0.4) ** 2; // đầu dây đứt rủ xuống
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.lineWidth = 10;
      g.strokeStyle = '#5c3d22';
      g.stroke();
      g.lineWidth = 6;
      g.strokeStyle = '#c4935f';
      g.setLineDash([8, 6]);
      g.lineDashOffset = -ropeX * SHIFT;
      g.stroke();
      g.setLineDash([]);
    };
    if (broke) {
      path(xa0, xa + 40, 40);
      path(xb0, xb - 40, 40);
    } else {
      path(xa0, xb0);
      // dải băng đỏ giữa dây
      const mx = (xa + xb) / 2;
      const my = ropeYAt(mx, t);
      g.fillStyle = '#ff2d55';
      g.beginPath();
      g.moveTo(mx - 9, my + 3);
      g.lineTo(mx + 9, my + 3);
      g.lineTo(mx + 4 + Math.sin(t / 200) * 3, my + 50);
      g.lineTo(mx - 4 + Math.sin(t / 200) * 3, my + 42);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  // --------------------------------------------------------------------------
  // Khung trên: sơ đồ giải, đồng hồ, thanh lực
  // --------------------------------------------------------------------------
  function drawTop(t) {
    panel(MX, Y_HUD, CW, 146, { glow: '#ff4fa3', fill: 'rgba(12,10,28,.82)' });
    text(L(`KÉO CO 4 ĐỘI · GIẢI #${Math.max(1, ph.cup || 0)}`, `TUG OF WAR CUP #${Math.max(1, ph.cup || 0)}`), MX + 22, Y_HUD + 28, { size: 24, weight: 900, color: '#ff8fc7', align: 'left' });
    const left = ph.phaseEndsAt ? ph.phaseEndsAt - now() : 0;
    const label = {
      lobby: L('BẮT ĐẦU SAU', 'STARTS IN'),
      draw: L('BỐC THĂM', 'DRAWING'),
      intro: L('CHUẨN BỊ', 'GET READY'),
      pull: ph.overtime ? L('PHÚT CHÓT', 'OVERTIME') : L('CÒN', 'TIME'),
      matchEnd: L('TRẬN SAU', 'NEXT'),
      champion: L('GIẢI MỚI SAU', 'NEW CUP IN')
    }[ph.phase] || '';
    text(`${label}  ${ph.paused ? '⏸' : fmtTime(left)}`, W - MX - 22, Y_HUD + 28, { size: 26, weight: 900, color: ph.phase === 'pull' && left < 10000 ? '#ff6b6b' : '#fff', align: 'right' });
    // sơ đồ giải: BK1 · BK2 · CK
    const b = ph.bracket;
    const bw = (CW - 44 - 20) / 3;
    const boxes = [
      { label: L('BÁN KẾT 1', 'SEMI 1'), m: b && b[0] },
      { label: L('BÁN KẾT 2', 'SEMI 2'), m: b && b[1] },
      { label: L('CHUNG KẾT', 'FINAL'), m: b && b[2] }
    ];
    boxes.forEach((bx, i) => {
      const x = MX + 22 + i * (bw + 10);
      const y = Y_HUD + 54;
      const active = ph.matchIdx === i && (ph.phase === 'intro' || ph.phase === 'pull' || ph.phase === 'matchEnd');
      panel(x, y, bw, 76, { r: 14, fill: active ? 'rgba(255,79,163,.22)' : 'rgba(255,255,255,.05)', glow: active ? '#ff4fa3' : null });
      text(bx.label, x + bw / 2, y + 16, { size: 14, weight: 800, color: active ? '#ffd1e8' : '#9aa' });
      const m = bx.m;
      const chip = (team, cx) => {
        if (!team) {
          text('?', cx, y + 50, { size: 22, weight: 900, color: '#666' });
          return;
        }
        const lost = m.winner && m.winner !== team;
        g.globalAlpha = lost ? 0.35 : 1;
        roundRect(cx - 54, y + 35, 108, 30, 10);
        g.fillStyle = teamColor(team);
        g.fill();
        text(`${team} ${(roster.teams.find((x2) => x2.id === team) || {}).name || ''}`, cx, y + 50, { size: 16, weight: 900, color: team === 3 ? '#222' : '#fff', maxW: 100 });
        g.globalAlpha = 1;
        if (m.winner === team) text('✔', cx + 48, y + 36, { size: 18, color: '#69db7c', stroke: 3 });
      };
      if (m) {
        chip(m.a, x + bw / 2 - 66);
        text('vs', x + bw / 2, y + 50, { size: 14, weight: 700, color: '#aaa' });
        chip(m.b, x + bw / 2 + 66);
      } else text(i < 2 ? L('chờ bốc thăm', 'awaiting draw') : L('2 đội thắng', 'two winners'), x + bw / 2, y + 50, { size: 16, color: '#888' });
    });
  }

  // Thanh đỏ–xanh (vị trí dây) gộp % lực hai đội, lửa cháy dữ dội ở nút dây, nảy theo độ căng
  let shareA = 0.5;
  let barKick = 0;
  let lastPct = 50;
  function drawPowerBar(t, dt) {
    const m = curMatch();
    const x = MX;
    const w = CW;
    const field = m && (ph.phase === 'intro' || ph.phase === 'pull' || ph.phase === 'matchEnd');
    if (!field) {
      panel(x, Y_BAR, w, BAR_H, { r: 35, fill: 'rgba(0,0,0,.55)', border: '#ffe066' });
      text(L('💬 Bình luận 1 · 2 · 3 · 4 để vào đội', '💬 Comment 1 · 2 · 3 · 4 to join a team'), W / 2, Y_BAR + BAR_H / 2, { size: 26, weight: 900, color: '#ffe066' });
      return;
    }
    const fa = ph.phase === 'pull' ? live.fa || 0 : 0;
    const fb = ph.phase === 'pull' ? live.fb || 0 : 0;
    const target = fa + fb > 0.01 ? fa / (fa + fb) : 0.5;
    shareA += (target - shareA) * Math.min(1, dt * 3);
    const pctA = Math.round(shareA * 100);
    if (Math.abs(pctA - lastPct) >= 3) {
      barKick = Math.min(1, barKick + 0.5); // đổi lực mạnh → giật nảy
      lastPct = pctA;
    }
    barKick = Math.max(0, barKick - dt * 2.5);
    const heat = Math.min(1.6, 0.35 + tension * 0.7 + Math.abs(ropeVel) * 10 + barKick * 0.6); // độ "cháy"
    const bounce = Math.sin(t / 55) * 2.5 * heat + Math.sin(t / 23) * barKick * 5;
    const y = Y_BAR + bounce;
    const pos = 0.5 + ropeX / 2; // 0 = sát đội a
    const mk = x + w * (1 - pos);
    // nền + hai nửa màu đội
    g.save();
    g.shadowColor = '#ff6a00';
    g.shadowBlur = 18 + heat * 22;
    roundRect(x, y, w, BAR_H, BAR_H / 2);
    g.fillStyle = '#120a14';
    g.fill();
    g.restore();
    g.save();
    roundRect(x, y, w, BAR_H, BAR_H / 2);
    g.clip();
    const half = (x0, x1, col) => {
      const gr = g.createLinearGradient(0, y, 0, y + BAR_H);
      gr.addColorStop(0, '#ffffff55');
      gr.addColorStop(0.35, col);
      gr.addColorStop(1, '#00000066');
      g.fillStyle = gr;
      g.fillRect(x0, y, x1 - x0, BAR_H);
      // sọc năng lượng chạy về phía nút dây
      g.globalAlpha = 0.18;
      g.fillStyle = '#fff';
      const dir = x0 < mk ? 1 : -1;
      const off = ((t / 6) % 40) * dir;
      for (let sx = x0 - 40; sx < x1 + 40; sx += 40) {
        g.beginPath();
        g.moveTo(sx + off, y);
        g.lineTo(sx + off + 16, y);
        g.lineTo(sx + off - 8, y + BAR_H);
        g.lineTo(sx + off - 24, y + BAR_H);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
    };
    half(x, mk, teamColor(m.a));
    half(mk, x + w, teamColor(m.b));
    g.restore();
    roundRect(x, y, w, BAR_H, BAR_H / 2);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.stroke();
    // lửa ở nút dây: 3 lớp (đỏ ngoài, cam giữa, vàng lõi), lưỡi lửa liếm lên, cao theo độ "cháy"
    const tongue = (fx, base, fh, fw, col, sway) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(fx - fw, base);
      g.bezierCurveTo(fx - fw, base - fh * 0.45, fx - fw * 0.2 + sway * 0.5, base - fh * 0.7, fx + sway, base - fh);
      g.bezierCurveTo(fx + fw * 0.3 + sway * 0.5, base - fh * 0.65, fx + fw, base - fh * 0.4, fx + fw, base);
      g.closePath();
      g.fill();
    };
    const base = y + BAR_H * 0.62;
    // quầng sáng nóng quanh nút dây
    const glow = g.createRadialGradient(mk, y + BAR_H / 2, 4, mk, y + BAR_H / 2, 70 + heat * 40);
    glow.addColorStop(0, 'rgba(255,170,40,0.55)');
    glow.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = glow;
    g.fillRect(mk - 120, y - 60, 240, BAR_H + 90);
    const layers = [
      { n: 7, h: 1.0, w: 15, col: 'rgba(255,40,10,0.55)' },
      { n: 6, h: 0.78, w: 11, col: 'rgba(255,120,0,0.75)' },
      { n: 5, h: 0.52, w: 7, col: 'rgba(255,215,60,0.9)' }
    ];
    for (const ly of layers) {
      for (let i = 0; i < ly.n; i++) {
        const ph0 = i * 2.1 + ly.h * 3;
        const fx = mk + (i - (ly.n - 1) / 2) * (11 + heat * 4) + Math.sin(t / 110 + ph0) * 5;
        const fh = (48 + 52 * heat) * ly.h * (0.68 + 0.32 * Math.sin(t / 41 + ph0 * 1.7));
        tongue(fx, base, fh, ly.w * (0.8 + heat * 0.25), ly.col, Math.sin(t / 65 + ph0) * 8 * heat);
      }
    }
    // tàn lửa bay lên
    if (Math.random() < dt * (6 + heat * 18)) particles.push({ kind: 'ember', x: mk + (Math.random() - 0.5) * 30, y: y + 10, vx: (Math.random() - 0.5) * 80, vy: -90 - Math.random() * 120 * heat, life: 0.6 + Math.random() * 0.6, t: 0, r: 2 + Math.random() * 2.5 });
    // nút dây
    g.save();
    g.translate(mk, y + BAR_H / 2);
    g.rotate(Math.sin(t / 80) * 0.15 * heat);
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, 0, 22 + barKick * 6, 0, Math.PI * 2);
    g.fill();
    text('🪢', 0, 1, { size: 26 });
    g.restore();
    // % + tên đội nằm trong thanh
    const sc = 1 + barKick * 0.25;
    g.font = `900 38px ${FONT}`;
    const pwA = g.measureText(`${pctA}%`).width;
    const pwB = g.measureText(`${100 - pctA}%`).width;
    g.save();
    g.translate(x + 26, y + BAR_H / 2);
    g.scale(sc, sc);
    text(`${pctA}%`, 0, 0, { size: 38, weight: 900, color: '#fff', align: 'left', stroke: 6 });
    g.restore();
    g.save();
    g.translate(x + w - 26, y + BAR_H / 2);
    g.scale(sc, sc);
    text(`${100 - pctA}%`, 0, 0, { size: 38, weight: 900, color: '#fff', align: 'right', stroke: 6 });
    g.restore();
    // tên đội ngay sau số %, chỉ vẽ khi còn chỗ trước nút dây
    const nax = x + 26 + pwA + 16;
    const nbx = x + w - 26 - pwB - 16;
    if (mk - 40 - nax > 70) text(teamLabel(m.a), nax, y + BAR_H / 2, { size: 17, weight: 900, color: '#fff', align: 'left', stroke: 4, maxW: mk - 40 - nax });
    if (nbx - (mk + 40) > 70) text(teamLabel(m.b), nbx, y + BAR_H / 2, { size: 17, weight: 900, color: '#fff', align: 'right', stroke: 4, maxW: nbx - mk - 40 });
    // hiệu ứng kỹ năng đang có của mỗi đội (ngay dưới thanh)
    const effs = (te, ex, align) => {
      if (!te) return;
      const list = [['glue', '🧤'], ['cheer', '📣'], ['grease', '🧈'], ['heave', '🥁'], ['strong', '🏋️']].filter(([k]) => te[k] > 0).map(([k, e]) => `${e}${Math.ceil(te[k] / 1000)}s`);
      if (list.length) text(list.join(' '), ex, Y_BAR + BAR_H + 4, { size: 17, weight: 800, align, stroke: 4 });
    };
    effs(live.ta, x + 30, 'left');
    effs(live.tb, x + w - 30, 'right');
  }

  // --------------------------------------------------------------------------
  // Khung dưới: lượt đấu, thẻ đội, cách chơi, kỹ năng
  // --------------------------------------------------------------------------
  function nextMatchText() {
    const b = ph.bracket;
    if (!b) return '';
    if (ph.phase === 'champion') return L(`Giải mới sau ${fmtTime(ph.phaseEndsAt - now())} · bình luận số đội để vào giải sau`, `Next cup in ${fmtTime(ph.phaseEndsAt - now())} · comment a team number to join`);
    const idx = ph.phase === 'matchEnd' || ph.phase === 'pull' || ph.phase === 'intro' ? ph.matchIdx + 1 : Math.max(0, ph.matchIdx);
    const m = b[idx];
    if (!m) return '';
    const a = m.a || (b[0].winner ? b[0].winner : 0);
    const bb = m.b || (b[1].winner ? b[1].winner : 0);
    const nm = (t) => (t ? teamLabel(t) : L('đội thắng BK', 'semi winner'));
    return `${L('Tiếp theo', 'Next')}: ${m.label} — ${nm(a)} vs ${nm(bb)}`;
  }
  function drawStatus(t) {
    const m = curMatch();
    let main = '';
    let color = '#fff';
    if (ph.phase === 'lobby') {
      main = L(`⏳ PHÒNG CHỜ · ${roster.players} người đã vào đội`, `⏳ LOBBY · ${roster.players} players in teams`);
      color = '#ffe066';
    } else if (ph.phase === 'draw') main = L('🎲 ĐANG BỐC THĂM CẶP ĐẤU', '🎲 DRAWING THE MATCHES');
    else if (m && (ph.phase === 'intro' || ph.phase === 'pull')) {
      main = `🔥 ${m.label.toUpperCase()}: ${teamLabel(m.a)}  vs  ${teamLabel(m.b)}`;
      color = '#ff8fc7';
    } else if (ph.phase === 'matchEnd' && m) main = `🏁 ${m.label}: ${teamLabel(m.winner)} ${L('THẮNG', 'WINS')}`;
    else if (ph.phase === 'champion' && ph.champion) {
      main = `🏆 ${teamLabel(ph.champion.team)} ${L('VÔ ĐỊCH!', 'CHAMPIONS!')}`;
      color = teamColor(ph.champion.team);
    }
    const nx = nextMatchText() || (ph.bracket && ph.matchIdx === 2 && ph.phase !== 'champion' ? L('Chung kết — đội thắng là VÔ ĐỊCH!', 'The final — the winner takes the cup!') : '');
    const fl = feed.filter((f) => t - f.at < 6000).slice(-1)[0];
    const sub = fl ? `➕ ${fl.text}` : ph.phase === 'lobby' ? L('Đổi đội được trong lúc chờ · đội đầy tự sang đội vắng nhất', 'Switch while waiting · full teams overflow to the emptiest') : nx;
    g.font = `900 26px ${FONT}`;
    const w = Math.min(CW, Math.max(520, g.measureText(main).width + 60));
    panel((W - w) / 2, Y_STATUS, w, 60, { r: 30, fill: 'rgba(10,8,26,.85)', glow: color });
    text(main, W / 2, Y_STATUS + 22, { size: 24, weight: 900, color, maxW: w - 40 });
    if (sub) text(sub, W / 2, Y_STATUS + 46, { size: 15, weight: 700, color: fl && fl.team ? teamColor(fl.team) : '#cfd', maxW: w - 40 });
  }
  const STATUS = {
    wait: () => ['⏳', L('CHỜ LƯỢT', 'WAITING'), '#ffe066'],
    field: () => ['🔥', L('ĐANG KÉO', 'PULLING'), '#ff8fc7'],
    final: () => ['⭐', L('VÀO CHUNG KẾT', 'IN THE FINAL'), '#69db7c'],
    out: () => ['❌', L('BỊ LOẠI', 'OUT'), '#888'],
    champ: () => ['🏆', L('VÔ ĐỊCH', 'CHAMPIONS'), '#ffd43b']
  };
  function drawTeams(t) {
    const gap = 12;
    const cw = (CW - gap) / 2;
    const ch = 159;
    (roster.teams.length ? roster.teams : [1, 2, 3, 4].map((id) => ({ id, name: '', count: 0, max: 20, status: 'wait', top: [] }))).forEach((tm, i) => {
      const x = MX + (i % 2) * (cw + gap);
      const y = Y_TEAMS + Math.floor(i / 2) * (ch + gap);
      const st = (STATUS[tm.status] || STATUS.wait)();
      const onField = tm.status === 'field';
      panel(x, y, cw, ch, { r: 16, fill: tm.status === 'out' ? 'rgba(20,20,26,.82)' : 'rgba(12,12,30,.84)', glow: onField || tm.status === 'champ' ? tm.color : null, border: tm.color });
      g.globalAlpha = tm.status === 'out' ? 0.5 : 1;
      roundRect(x + 8, y + 8, cw - 16, 36, 10);
      g.fillStyle = tm.color;
      g.fill();
      const ink = tm.id === 3 ? '#222' : '#fff';
      text(`${tm.id} · ${L('ĐỘI', 'TEAM')} ${(tm.name || '').toUpperCase()}`, x + 20, y + 26, { size: 19, weight: 900, color: ink, align: 'left' });
      text(`${tm.count}/${tm.max}${tm.wins ? `  🏆${tm.wins}` : ''}`, x + cw - 18, y + 26, { size: 17, weight: 800, color: ink, align: 'right' });
      let when = '';
      if (tm.status === 'wait' || tm.status === 'final') {
        if (!ph.bracket) when = L('bốc thăm khi hết giờ chờ', 'drawn when the lobby ends');
        else if (tm.nextIn === 1) when = L('TRẬN TIẾP THEO!', 'NEXT MATCH!');
        else if (tm.nextIn > 1) when = L(`còn ${tm.nextIn - 1} trận`, `${tm.nextIn - 1} to go`);
      } else if (tm.status === 'field') when = L('thả tim đều tay!', 'tap steadily!');
      else if (tm.status === 'out') when = L('tặng quà tiếp sức đội thua', 'gift to help the losers');
      text(`${st[0]} ${st[1]}`, x + 16, y + 60, { size: 17, weight: 900, color: st[2], align: 'left' });
      if (when) text(when, x + cw - 16, y + 60, { size: 15, weight: 800, color: tm.nextIn === 1 ? '#ffe066' : '#bbb', align: 'right', maxW: cw / 2 });
      const list = tm.top || [];
      if (!list.length) text(L('Chưa có ai · bình luận ', 'Empty · comment ') + tm.id, x + cw / 2, y + 112, { size: 16, color: '#888' });
      list.slice(0, 3).forEach((p, j) => {
        const ly = y + 86 + j * 23;
        text(j === 0 && p.force > 0 ? '👑' : `${j + 1}.`, x + 26, ly, { size: 15, weight: 800, color: '#ddd' });
        text(p.name, x + 46, ly, { size: 16, weight: 700, color: '#fff', align: 'left', maxW: cw - 120 });
        if (p.force > 0) text(`${p.force}`, x + cw - 16, ly, { size: 15, weight: 800, color: tm.color, align: 'right' });
      });
      if (tm.bank) text(L(`🎒${tm.bank} để dành`, `🎒${tm.bank} saved`), x + cw - 16, y + 146, { size: 14, weight: 800, color: '#ffd43b', align: 'right' });
      g.globalAlpha = 1;
    });
  }
  function drawJoinBar() {
    text(L('💬 Bình luận 1 · 2 · 3 · 4 để vào đội · ❤️ thả tim đều tay để kéo', '💬 Comment 1 · 2 · 3 · 4 to join · ❤️ tap steadily to pull'), W / 2, Y_JOIN, { size: 18, weight: 800, color: '#ffe066', stroke: 4, maxW: CW });
    text(roster.queueCount ? L(`🪑 Phòng chờ giải sau: ${roster.queueCount} người`, `🪑 Waiting for next cup: ${roster.queueCount}`) : L('Đội đầy tự sang đội vắng nhất · tối đa 20 người/đội', 'Full teams overflow to the emptiest · max 20 per team'), W / 2, Y_JOIN + 26, { size: 15, weight: 600, color: '#ddd', stroke: 3, maxW: CW });
  }
  // Hàng ảnh quà TikTok ngay dưới sân: ảnh quà ở trên, tên kỹ năng ở dưới
  function drawGiftRow() {
    const items = legend.length ? legend : [];
    if (!items.length) return;
    panel(MX, Y_GIFTS, CW, 94, { r: 18, fill: 'rgba(0,0,0,.62)' });
    const cw = CW / items.length;
    items.forEach((it, i) => {
      const cx = MX + i * cw + cw / 2;
      if (i > 0) {
        g.fillStyle = 'rgba(255,255,255,.10)';
        g.fillRect(MX + i * cw, Y_GIFTS + 12, 1, 70);
      }
      const im = IMG[`gift_${it.skill}`];
      if (ready(im)) {
        const sc = 52 / Math.max(im.naturalWidth, im.naturalHeight);
        g.drawImage(im, cx - (im.naturalWidth * sc) / 2, Y_GIFTS + 36 - (im.naturalHeight * sc) / 2, im.naturalWidth * sc, im.naturalHeight * sc);
      } else text(it.emoji, cx, Y_GIFTS + 36, { size: 36 });
      g.font = `900 15px ${FONT}`;
      const fsz = Math.max(10, Math.min(15, Math.floor((15 * (cw - 6)) / g.measureText(it.label).width)));
      text(it.label.toUpperCase(), cx, Y_GIFTS + 78, { size: fsz, weight: 900, color: '#ffe066', stroke: 3 });
    });
  }

  // --------------------------------------------------------------------------
  // Băng quà, chữ lớn, hạt hiệu ứng
  // --------------------------------------------------------------------------
  function drawGiftBanner(t) {
    if (!giftBanner || t > giftBanner.until) {
      giftBanner = null;
      const p = giftQueue.shift();
      if (p) giftBanner = { ...p, until: t + 2600 };
    }
    if (!giftBanner) return;
    const b = giftBanner;
    const y = Y_STATUS;
    const w = CW;
    const x = (W - w) / 2;
    panel(x, y, w, 60, { r: 30, fill: 'rgba(255,255,255,.96)', glow: teamColor(b.team) });
    const mode = b.mode === 'bank' ? L(' (để dành cho đội)', ' (saved for the team)') : b.mode === 'support' ? L(' (tiếp sức đội đang thua)', ' (helping the losing team)') : '';
    const lb = (legend.find((l) => l.skill === b.skill) || {}).label || b.skill;
    text(`${SKILL_EMOJI[b.skill] || '🎁'} ${b.name} ${L('tặng', 'sent')} ${b.gift}${b.count > 1 ? ` ×${b.count}` : ''} → ${lb}${mode}`, W / 2, y + 30, { size: 22, weight: 900, color: '#222', maxW: w - 40 });
  }
  function drawBanner() {
    if (!banner) return;
    const left = banner.until - Date.now();
    if (left <= 0) {
      banner = null;
      return;
    }
    const a = Math.min(1, left / 300);
    g.globalAlpha = a;
    const y = Y_CLOSE + 62;
    text(banner.text, W / 2, y, { size: banner.big ? 110 : 60, weight: 900, color: banner.color, stroke: 10 });
    if (banner.sub) text(banner.sub, W / 2, y + (banner.big ? 72 : 50), { size: 30, weight: 800, color: '#fff', stroke: 6, maxW: W - 60 });
    g.globalAlpha = 1;
  }
  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t > p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.t / p.life;
      if (p.kind === 'gas') {
        p.vx *= 0.97;
        p.r += dt * 26;
        g.globalAlpha = 0.45 * k;
        g.fillStyle = i % 2 ? '#d8f36a' : '#b5d33d';
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === 'ember') {
        p.vx *= 0.96;
        g.globalAlpha = k;
        g.fillStyle = k > 0.5 ? '#ffd43b' : '#ff6a00';
        g.beginPath();
        g.arc(p.x, p.y, p.r * k + 0.5, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === 'dust') {
        p.r += dt * 14;
        g.globalAlpha = 0.5 * k;
        g.fillStyle = '#d9d2e9';
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === 'sweat') {
        p.vy += dt * 260;
        g.globalAlpha = k;
        g.fillStyle = '#74c0fc';
        g.beginPath();
        g.ellipse(p.x, p.y, 3, 4.5, 0, 0, Math.PI * 2);
        g.fill();
      } else if (p.kind === 'drip') {
        g.globalAlpha = k;
        g.fillStyle = '#ffe9a3';
        g.beginPath();
        g.ellipse(p.x, p.y, 4, 7, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        p.rot += dt * 5;
        g.globalAlpha = Math.min(1, k * 2);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.c;
        g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        g.restore();
      }
      g.globalAlpha = 1;
    }
  }
  function drawStomp(t) {
    if (!stomp) return;
    const e = (t - stomp.at) / 1000;
    if (e > 1.4) {
      stomp = null;
      return;
    }
    const im = IMG.giant;
    if (!ready(im)) return;
    const x = lineX(stomp.side, 1);
    const drop = e < 0.35 ? -300 + (e / 0.35) * 300 : 0;
    const sc = 0.9;
    g.globalAlpha = e > 1.1 ? (1.4 - e) / 0.3 : 1;
    g.drawImage(im, x - (im.naturalWidth * sc) / 2, ROPE_Y + 40 - im.naturalHeight * sc + drop, im.naturalWidth * sc, im.naturalHeight * sc);
    g.globalAlpha = 1;
  }
  // Lực sĩ đứng cuối hàng khi có kỹ năng Lực sĩ
  function drawStrongman(side, team, t) {
    const te = side === 'a' ? live.ta : live.tb;
    if (!te || !(te.strong > 0)) return;
    // đứng sau hàng người, ngay sau 3 người đầu dây (luôn thấy trên màn hình)
    const gx = lineX(side, 3) + (side === 'a' ? -10 : 10);
    drawPose(team, 99, Math.floor(t / 600) % 2 ? 'plank' : 'strain', gx, ropeYAt(gx, t), side === 'a' ? 1 : -1, { scale: SPRITE_SCALE * 1.45 });
    text(L('LỰC SĨ', 'STRONGMAN'), gx, ROPE_Y - 118, { size: 16, weight: 900, color: '#ffe066', stroke: 4 });
  }

  // Cận cảnh đầu dây (giữa) + số người, người kéo khoẻ nhất mỗi đội (hai góc)
  function drawArena(t, dt) {
    const m = curMatch();
    if (!m || (ph.phase !== 'pull' && ph.phase !== 'intro')) return;
    drawCloseup(m, t, Y_CLOSE);
    const info = (list, team, x, align) => {
      const humans = list.filter((p) => !p.npc).length;
      const bots = list.length - humans;
      text(L(`${humans} người${bots ? ` + ${bots}🤖` : ''}`, `${humans} players${bots ? ` + ${bots}🤖` : ''}`), x, Y_CLOSE + 24, { size: 16, weight: 800, color: teamColor(team), align, stroke: 4 });
      const best = list
        .filter((p) => !p.npc)
        .map((p) => ({ n: p.n, f: (pstate.get(p.k) || {}).force || 0 }))
        .sort((a, b) => b.f - a.f)[0];
      if (best && best.f > 0) text(`👑 ${best.n}`, x, Y_CLOSE + 48, { size: 17, weight: 800, color: '#ffe066', align, stroke: 4, maxW: 250 });
    };
    info(roster.lineA, m.a, MX + 18, 'left');
    info(roster.lineB, m.b, W - MX - 18, 'right');
  }
  // Cận cảnh: hai người đầu dây phóng to, đối mặt nhau giữa màn hình — thấy rõ mặt gồng, cắn dây, bị lôi…
  function drawCloseup(m, t, y) {
    const pa = roster.lineA[0];
    const pb = roster.lineB[0];
    if (!pa || !pb) return;
    const x0 = MX;
    const x1 = W - MX;
    const CH = CLOSE_H;
    panel(x0, y, x1 - x0, CH, { r: 16, fill: 'rgba(8,8,24,.55)', border: 'rgba(255,255,255,.18)' });
    text(L('🎥 CẬN CẢNH ĐẦU DÂY', '🎥 FRONT LINE CLOSE-UP'), (x0 + x1) / 2, y + 14, { size: 13, weight: 800, color: '#ccd' });
    g.save();
    roundRect(x0, y, x1 - x0, CH, 16);
    g.clip();
    const cy = y + 96;
    const shift = Math.max(-40, Math.min(40, -ropeX * 60)); // dây trôi về bên nào thì cả hai nghiêng theo
    const ga = (x0 + x1) / 2 - 40 + shift;
    const gb = (x0 + x1) / 2 + 40 + shift;
    // dây
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0 - 10, cy + Math.sin(t / 40) * tension * 2);
    g.lineTo(x1 + 10, cy - Math.sin(t / 40) * tension * 2);
    g.lineWidth = 14;
    g.strokeStyle = '#5c3d22';
    g.stroke();
    g.lineWidth = 8;
    g.strokeStyle = '#c4935f';
    g.setLineDash([12, 9]);
    g.lineDashOffset = -ropeX * SHIFT * 2;
    g.stroke();
    g.setLineDash([]);
    const one = (p, side, team, gx) => {
      const face = side === 'a' ? 1 : -1;
      const mem = poseMem.get(p.k);
      const pose = ph.phase === 'intro' ? 'pullA' : (mem && mem.pose) || 'pullA';
      const st = (pstate.get(p.k) || {}).st || 'idle';
      let rot = -face * Math.sin(t / 240 + side.length) * 0.06;
      if (st === 'strain' || pose === 'bite') rot += Math.sin(t / 22) * 0.03;
      if (pose === 'drag') rot += -face * Math.sin(t / 90) * 0.08;
      drawPose(team, p.v, pose, gx, cy, face, { scale: SPRITE_SCALE * 1.45, rot, footY: pose === 'cheer' ? cy + 52 : null });
    };
    one(pa, 'a', m.a, ga);
    one(pb, 'b', m.b, gb);
    g.restore();
    text(pa.n, (x0 + x1) / 2 - 60, y + CH - 12, { size: 15, weight: 800, color: '#fff', align: 'right', stroke: 4, strokeColor: teamColor(m.a), maxW: 220 });
    text(pb.n, (x0 + x1) / 2 + 60, y + CH - 12, { size: 15, weight: 800, color: '#fff', align: 'left', stroke: 4, strokeColor: teamColor(m.b), maxW: 220 });
  }

  // Lúc chờ / bốc thăm / vô địch: các đội đứng cổ vũ trên hai tháp
  function drawCrowd(t) {
    const teams = roster.teams.length ? roster.teams : [];
    const champ = ph.phase === 'champion' && ph.champion ? ph.champion.team : 0;
    const groups = champ
      ? [{ side: 'a', team: champ, list: (teams.find((x) => x.id === champ) || {}).top || [] }, { side: 'b', team: champ, list: ((teams.find((x) => x.id === champ) || {}).top || []).slice().reverse() }]
      : [
          { side: 'a', team: 1, list: (teams.find((x) => x.id === 1) || {}).top || [] },
          { side: 'a', team: 3, list: (teams.find((x) => x.id === 3) || {}).top || [], back: true },
          { side: 'b', team: 2, list: (teams.find((x) => x.id === 2) || {}).top || [] },
          { side: 'b', team: 4, list: (teams.find((x) => x.id === 4) || {}).top || [], back: true }
        ];
    for (const gr of groups) {
      const face = gr.side === 'a' ? 1 : -1;
      const list = gr.list.length ? gr.list : [0, 1, 2].map((i) => ({ variant: [3, 9, 14, 20, 27, 29][(gr.team * 3 + i) % 6], name: '' }));
      list.slice(0, 5).forEach((p, i) => {
        const gx = gr.side === 'a' ? EDGE_L - 40 - i * 80 - (gr.back ? 40 : 0) : EDGE_R + 40 + i * 80 + (gr.back ? 40 : 0);
        const fy = 836 + (gr.back ? -22 : 14) - Math.abs(Math.sin(t / 280 + i + gr.team)) * 10;
        const box = drawPose(gr.team, p.variant ?? 0, 'cheer', gx, fy, face, { footY: fy, alpha: gr.list.length ? 1 : 0.45 });
        if (box && p.name) {
          g.font = `800 15px ${FONT}`;
          const ly = placeLabel(gx, box.top - 8, Math.min(110, g.measureText(p.name).width) + 6, 18);
          if (ly !== null) text(p.name, gx, ly, { size: 15, weight: 800, stroke: 4, strokeColor: teamColor(gr.team), maxW: 110 });
        }
      });
    }
  }

  // --------------------------------------------------------------------------
  // Khung hình
  // --------------------------------------------------------------------------
  let lastT = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    ropeX += (ropeTarget - ropeX) * Math.min(1, dt * 6);
    if (dt > 0) ropeVel += ((ropeX - lastRopeX) / dt - ropeVel) * Math.min(1, dt * 3);
    lastRopeX = ropeX;
    const fsum = (live.fa || 0) + (live.fb || 0);
    tension += ((ph.phase === 'pull' ? Math.min(1, fsum / 2.6) : 0) - tension) * Math.min(1, dt * 2);
    musicTick(dt);
    g.save();
    if (shake > 0) {
      g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      shake = Math.max(0, shake - dt * 40);
    }
    if (ready(IMG.bg)) g.drawImage(IMG.bg, 0, 0, W, H);
    else {
      g.fillStyle = '#0b1020';
      g.fillRect(0, 0, W, H);
    }
    // vạch giữa vực
    g.strokeStyle = 'rgba(255,79,163,.45)';
    g.setLineDash([10, 10]);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(GAP_C, 700);
    g.lineTo(GAP_C, 880);
    g.stroke();
    g.setLineDash([]);
    const m = curMatch();
    const fieldPhase = m && (ph.phase === 'intro' || ph.phase === 'pull' || ph.phase === 'matchEnd');
    labelBoxes = [];
    labelReqs = [];
    if (fieldPhase) {
      const la = roster.lineA;
      const lb = roster.lineB;
      drawStrongman('a', m.a, t);
      drawStrongman('b', m.b, t);
      const backA = drawLine('a', m.a, la, t, 'back');
      const backB = drawLine('b', m.b, lb, t, 'back');
      drawRope(t);
      const frontA = drawLine('a', m.a, la, t, 'front');
      const frontB = drawLine('b', m.b, lb, t, 'front');
      drawStomp(t);
      chaosFx(backA.concat(frontA), 'a', t, dt);
      chaosFx(backB.concat(frontB), 'b', t, dt);
      drawOverheads(backA.concat(frontA), 'a', t);
      drawOverheads(backB.concat(frontB), 'b', t);
      drawShouts(t);
      drawLabels(m, t);
      if (live.sleep > 0) text('😴 Zzz', GAP_C, 640, { size: 40, weight: 900, color: '#a5d8ff', stroke: 6 });
    } else drawCrowd(t);
    drawParticles(dt);
    g.restore();
    drawArena(t, dt);
    drawTop(t);
    drawStatus(t);
    drawGiftBanner(t);
    drawPowerBar(t, dt);
    drawGiftRow();
    drawTeams(t);
    drawJoinBar();
    drawBanner();
    if (ph.phase === 'intro') {
      const left = Math.ceil((ph.phaseEndsAt - now()) / 1000);
      if (left > 0 && left <= 3) text(String(left), W / 2, Y_CLOSE + 70, { size: 130, weight: 900, color: '#ffe066', stroke: 12 });
    }
    if (ph.phase === 'champion' && ph.champion) {
      const c = ph.champion;
      text('🏆', W / 2, 540, { size: 100 });
      text(L(`${teamLabel(c.team)} VÔ ĐỊCH!`, `${teamLabel(c.team)} ARE CHAMPIONS!`), W / 2, 618, { size: 48, weight: 900, color: teamColor(c.team), stroke: 10, maxW: CW });
      if (c.mvp && c.mvp[0]) text(`💪 ${L('Lực sĩ của giải', 'Cup MVP')}: ${c.mvp.map((x) => x.name).join(' · ')}`, W / 2, 666, { size: 24, weight: 800, stroke: 6, maxW: CW });
    }
    if (ph.phase === 'lobby' && !banner) {
      text(L('KÉO CO 4 ĐỘI', 'TUG OF WAR'), W / 2, 540, { size: 78, weight: 900, color: '#ff8fc7', stroke: 10 });
      text(L('Bình luận số đội 1 · 2 · 3 · 4 để tham gia', 'Comment 1 · 2 · 3 · 4 to join a team'), W / 2, 608, { size: 30, weight: 800, stroke: 7, maxW: CW });
      text(L(`Bắt đầu sau ${fmtTime(ph.phaseEndsAt - now())}`, `Starts in ${fmtTime(ph.phaseEndsAt - now())}`), W / 2, 652, { size: 26, weight: 800, color: '#ffe066', stroke: 6 });
    }
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
        case 'kc.phase':
          applyPhase(p);
          break;
        case 'kc.roster':
          roster = p;
          break;
        case 'kc.live':
          applyLive(p);
          break;
        case 'kc.fx':
          onFx(p);
          break;
        case 'kc.say':
          if (p.url) enqueueTts(p.url);
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
