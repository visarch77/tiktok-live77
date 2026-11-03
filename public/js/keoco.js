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
  const MX = 72; // lề hai bên (tránh nút / viền giao diện TikTok che)
  const CW = W - MX * 2;
  const Y_HUD = 184;
  const Y_STATUS = 338;
  const Y_BAR = 406;
  const BAR_H = 70;
  const Y_CLOSE = 484;
  const CLOSE_H = 156; // vùng giữa: đồng hồ to + thông tin hai đội
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
      case 'ready':
        banner = { text: L('ĐỦ 2 ĐỘI!', 'TWO TEAMS READY!'), sub: L('Vào giải thật ngay sau trận này', 'The real cup starts right after this'), color: '#69db7c', until: Date.now() + 2600 };
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
        fallSfx();
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
  // Thẻ kỹ năng: ảnh quà to + tên kỹ năng + một câu nói rõ chuyện gì vừa xảy ra, hiện bên phía đội dùng kỹ năng
  const skillCards = []; // { skill, side, title, line, color, at, blocked }
  const SKILL_TITLE = {
    gong: ['💪 GỒNG!', '💪 POWER UP!'],
    energy: ['🧃 TĂNG LỰC!', '🧃 ENERGY!'],
    tickle: ['🤭 CÙ LÉT!', '🤭 TICKLE!'],
    glue: ['🧤 GĂNG KEO!', '🧤 STICKY GLOVES!'],
    cheer: ['📣 CỔ VŨ!', '📣 CHEER!'],
    grease: ['🧈 BÔI MỠ!', '🧈 GREASE!'],
    strong: ['🏋️ LỰC SĨ!', '🏋️ STRONGMAN!'],
    fart: ['💨 THẢ BOOM!', '💨 FART BOMB!'],
    heave: ['🥁 HÒ DÔ!', '🥁 HEAVE HO!'],
    stomp: ['🦶 KHỔNG LỒ DẪM!', '🦶 GIANT STOMP!']
  };
  function skillLine(p, team, opp) {
    const n = p.giver || L('Khán giả', 'A viewer');
    const T = teamLabel(team);
    const O = teamLabel(opp);
    switch (p.skill) {
      case 'gong': return L(`${n} kéo ×2 trong 3 giây`, `${n} pulls ×2 for 3s`);
      case 'energy': return L(`${n} hồi đầy thể lực cho 4 người`, `${n} refills 4 pullers' stamina`);
      case 'tickle': return L(`Người đầu dây ${O} cười lăn, buông tay!`, `${O}'s front puller laughs and lets go!`);
      case 'glue': return L(`${T} miễn mọi đòn chơi xấu 6 giây`, `${T} is immune to tricks for 6s`);
      case 'cheer': return L(`${T} hồi sức gấp đôi 8 giây`, `${T} recovers twice as fast for 8s`);
      case 'grease': return L(`${O} trơn tay — lực còn một nửa 4 giây`, `${O} slips — half pull for 4s`);
      case 'strong': return L(`Lực sĩ vào kéo cùng ${T} 8 giây`, `A strongman pulls for ${T} for 8s`);
      case 'fart': return L(`5 người đầu dây ${O} choáng váng 2 giây`, `${O}'s front 5 are dizzy for 2s`);
      case 'heave': return L(`${T} kéo ×1,5, không mệt 6 giây`, `${T} pulls ×1.5 with no fatigue for 6s`);
      case 'stomp': return L(`Giật dây về ${T} + 3 người ${O} ngã`, `Yanks the rope to ${T} + 3 of ${O} fall`);
      default: return '';
    }
  }
  // Tiếng hiệu ứng riêng mỗi kỹ năng (tự tạo bằng WebAudio, không dùng file)
  function skillSfx(skill, blocked) {
    if (!unlocked || previewMuted) return;
    const c = audio.ensure();
    if (!c) return;
    const T = c.currentTime + 0.02;
    const o = (f, at, dur, opt) => audio.osc(f, T + at, dur, opt);
    const nz = (at, dur, opt) => audio.noise(T + at, dur, opt);
    if (blocked) {
      // "keng!" khiên chặn
      o(1320, 0, 0.5, { type: 'triangle', vol: 0.12, attack: 0.002 });
      o(1980, 0, 0.35, { type: 'sine', vol: 0.06, attack: 0.002 });
      o(2640, 0.02, 0.25, { type: 'sine', vol: 0.04, attack: 0.002 });
      return;
    }
    switch (skill) {
      case 'gong': // ting-ting-ting đi lên + "boing"
        [523, 659, 784, 1047].forEach((f, i) => o(f, i * 0.06, 0.18, { type: 'square', vol: 0.05, attack: 0.003 }));
        o(220, 0.26, 0.35, { type: 'sine', vol: 0.14, slide: 440, attack: 0.005 });
        break;
      case 'energy': // ực ực ực + lấp lánh
        for (let i = 0; i < 3; i++) o(520 - i * 40, i * 0.13, 0.09, { type: 'sine', vol: 0.12, slide: -260, attack: 0.004 });
        [1568, 2093, 2637].forEach((f, i) => o(f, 0.42 + i * 0.05, 0.25, { type: 'sine', vol: 0.04, attack: 0.002 }));
        break;
      case 'tickle': // cười khúc khích: chuỗi nốt cao nảy
        for (let i = 0; i < 7; i++) o(900 + (i % 2) * 220 + i * 25, i * 0.07, 0.06, { type: 'triangle', vol: 0.07, attack: 0.003 });
        break;
      case 'glue': // nhóp nhép + "bụp"
        nz(0, 0.3, { vol: 0.12, type: 'lowpass', freq: 900, q: 6, sweepTo: 200 });
        o(300, 0.22, 0.12, { type: 'sine', vol: 0.12, slide: -200, attack: 0.003 });
        break;
      case 'cheer': // kèn cổ vũ ta-ta-ta-taaa + đám đông hò
        [523, 523, 523, 659].forEach((f, i) => o(f, i * 0.12, i === 3 ? 0.45 : 0.1, { type: 'sawtooth', vol: 0.05, attack: 0.01 }));
        nz(0, 1.1, { vol: 0.07, type: 'bandpass', freq: 1200, q: 0.6 });
        break;
      case 'grease': // còi trượt xuống "víuuu" + "bẹp"
        o(1600, 0, 0.5, { type: 'sine', vol: 0.09, slide: -1300, attack: 0.02 });
        nz(0.48, 0.12, { vol: 0.16, type: 'lowpass', freq: 600 });
        break;
      case 'strong': // BÙM + ta-da kèn đồng
        audio.kick(T, 0.5);
        nz(0, 0.25, { vol: 0.12, type: 'lowpass', freq: 400 });
        [[392, 494, 587], [523, 659, 784]].forEach((ch, k) => ch.forEach((f) => o(f, 0.25 + k * 0.18, k ? 0.6 : 0.15, { type: 'sawtooth', vol: 0.035, attack: 0.01 })));
        break;
      case 'fart':
        audio.fart();
        break;
      case 'heave': // trống lớn "HÒ" – "DÔ"
        for (let k = 0; k < 2; k++) {
          o(110 - k * 20, k * 0.32, 0.35, { type: 'sine', vol: 0.3, slide: -50, attack: 0.002 });
          nz(k * 0.32, 0.15, { vol: 0.1, type: 'lowpass', freq: 800 });
        }
        break;
      case 'stomp': // ẦMMM khổng lồ dẫm + rung
        o(70, 0.3, 0.7, { type: 'sine', vol: 0.4, slide: -35, attack: 0.002 });
        nz(0.3, 0.6, { vol: 0.16, type: 'lowpass', freq: 300, sweepTo: 80 });
        break;
      default:
        break;
    }
  }
  // Câu nhân vật la lên khi dùng / trúng kỹ năng (bong bóng thoại trên đầu)
  const SAY_GIVER = {
    gong: [['GỒNGGG!! 💪', 'Xem anh đây!', 'Sức mạnh cơ bắp!'], ['POWER UP!! 💪', 'Watch this!', 'Muscle time!']],
    energy: [['Uống đi anh em! 🧃', 'Nước thần đây!'], ['Drink up, team! 🧃', 'Magic juice!']],
    tickle: [['Cù cù cù~ 🪶', 'Nhột chưa? 😝'], ['Tickle tickle~ 🪶', 'Ticklish? 😝']],
    glue: [['Găng keo thần thánh! 🧤', 'Dính chặt rồi nha!'], ['Sticky gloves! 🧤', 'Glued tight!']],
    cheer: [['Cố lên đội ơi! 📣', 'Hò dô ta nào!'], ['Go team go! 📣', 'You got this!']],
    grease: [['Hehe trơn chưa! 🧈', 'Mỡ heo đây!'], ['Hehe, slippery! 🧈', 'Butter time!']],
    strong: [['LỰC SĨ ĐÂY! 🏋️', 'Tránh ra để anh kéo!'], ['STRONGMAN HERE! 🏋️', 'Step aside!']],
    fart: [['Xin lỗi... 😳💨', 'BỦMMM! 💨', 'Ăn hơi nhiều đậu...'], ['Oops... 😳💨', 'PFFFRT! 💨', 'Too many beans...']],
    heave: [['HÒ DÔ!! 🥁', 'Cả đội kéo nào!'], ['HEAVE HO!! 🥁', 'All together now!']],
    stomp: [['Khổng lồ ơi dẫm đi! 🦶', 'RẦM cho tui!'], ['Giant, STOMP! 🦶', 'Crush them!']]
  };
  const SAY_HIT = {
    tickle: [['Ha ha ha nhột quá! 🤣', 'Đừng cù mà!'], ['Ha ha ha stop! 🤣', 'Not the tickles!']],
    grease: [['Ai bôi mỡ vậy trời?!', 'Trơn tuột tay! 😱'], ['Who greased this?!', 'So slippery! 😱']],
    fart: [['Thối quá!! 🤢', 'Ặc ặc… choáng!', 'Mùi gì kinh vậy?!'], ['It stinks!! 🤢', 'I\'m dizzy…', 'What is that smell?!']],
    stomp: [['Á Á Á!! 😵', 'Cứu với!'], ['AAAH!! 😵', 'Help!']],
    energy: [['Sảng khoái! ⚡', 'Hồi sức rồi!'], ['Refreshed! ⚡', 'Full power!']]
  };
  const SAY_BLOCK = [['Hụt rồi nhé! 😎', 'Găng keo đó cưng!'], ['Missed me! 😎', 'Sticky gloves, baby!']];
  const skillSays = new Map(); // khoá người chơi → { text, until }
  const pickLine = (pair) => {
    const arr = pair[settings.lang === 'en' ? 1 : 0];
    return arr[Math.floor(Math.random() * arr.length)];
  };
  function skillSpeech(p, t) {
    const until = t + 2200;
    if (p.blocked) {
      // đội được găng keo bảo vệ đáp lại
      const m = curMatch();
      const oppSide = m && (p.team === m.a ? 'b' : 'a');
      const list = oppSide === 'a' ? roster.lineA : roster.lineB;
      if (list && list[0]) skillSays.set(list[0].k, { text: pickLine(SAY_BLOCK), until });
      return;
    }
    if (p.giverKey && SAY_GIVER[p.skill]) skillSays.set(p.giverKey, { text: pickLine(SAY_GIVER[p.skill]), until });
    if (SAY_HIT[p.skill]) (p.targets || []).slice(0, 2).forEach((k, i) => skillSays.set(k, { text: pickLine(SAY_HIT[p.skill]), until: until + i * 150 }));
  }
  function onSkill(p, t) {
    skillSfx(p.skill, p.blocked);
    skillSpeech(p, t);
    if (p.giverKey) marks.set(p.giverKey, { kind: p.skill, until: t + 2500 });
    for (const k of p.targets || []) marks.set(k, { kind: `hit_${p.skill}`, until: t + 2200 });
    const m = curMatch();
    if (!m) return;
    const side = p.team === m.a ? 'a' : 'b';
    const opp = p.team === m.a ? m.b : m.a;
    const dir = side === 'a' ? 1 : -1; // hướng về phía đối thủ
    const oside = side === 'a' ? 'b' : 'a';
    skillCards.push({
      skill: p.skill,
      side,
      title: p.blocked ? L('🧤 BỊ CHẶN!', '🧤 BLOCKED!') : SKILL_TITLE[p.skill][settings.lang === 'en' ? 1 : 0],
      line: p.blocked ? L(`${teamLabel(opp)} có găng keo — đòn của ${p.giver || ''} vô hiệu`, `${teamLabel(opp)} has sticky gloves — ${p.giver || ''}'s trick failed`) : skillLine(p, p.team, opp),
      color: teamColor(p.team),
      at: t,
      blocked: p.blocked
    });
    while (skillCards.filter((c) => c.side === side).length > 2) skillCards.splice(skillCards.findIndex((c) => c.side === side), 1);
    if (p.blocked) {
      // bong bóng khiên xanh quanh hàng đội bị nhắm
      teamFx.push({ kind: 'shield', side: oside, at: t, ms: 1200 });
      return;
    }
    if (p.skill === 'fart') {
      const gx = lineX(side, 2);
      for (let i = 0; i < 46; i++) particles.push({ kind: 'gas', x: gx, y: ROPE_Y - 20, vx: dir * (120 + Math.random() * 240), vy: -20 - Math.random() * 60, life: 1.6 + Math.random() * 0.6, t: 0, r: 12 + Math.random() * 18 });
      popText(L('BỦMMM 💨', 'PFFFRRT 💨'), gx, ROPE_Y - 90, '#c3e66b', t);
    } else if (p.skill === 'stomp') {
      stomp = { at: t, side: oside };
      shake = 18;
      popText(L('RẦM!', 'BOOM!'), lineX(oside, 1), ROPE_Y - 120, '#ff922b', t + 300);
    } else if (p.skill === 'grease') {
      for (let i = 0; i < 30; i++) particles.push({ kind: 'drip', x: lineX(oside, Math.floor(Math.random() * 10)), y: ROPE_Y, vx: 0, vy: 40 + Math.random() * 60, life: 1.2, t: 0, r: 5 });
      popText(L('TRƠN TUỘT!', 'SLIPPERY!'), lineX(oside, 2), ROPE_Y - 90, '#ffe9a3', t);
    } else if (p.skill === 'heave' || p.skill === 'cheer') {
      for (let i = 0; i < 34; i++) particles.push({ ...confetti(), x: side === 'a' ? MX + Math.random() * 400 : W - MX - Math.random() * 400, y: 600 + Math.random() * 60 });
      if (p.skill === 'cheer') for (let i = 0; i < 12; i++) particles.push({ kind: 'note', x: lineX(side, Math.floor(Math.random() * 8)), y: ROPE_Y - 60, vx: (Math.random() - 0.5) * 40, vy: -50 - Math.random() * 40, life: 1.8, t: 0, r: 22, c: Math.random() < 0.5 ? '♪' : '♫' });
    } else if (p.skill === 'glue') {
      teamFx.push({ kind: 'glue', side, at: t, ms: 1600 });
      for (let i = 0; i < 26; i++) particles.push({ kind: 'goo', x: lineX(side, Math.floor(Math.random() * 10)), y: ROPE_Y + 2, vx: 0, vy: 20 + Math.random() * 40, life: 1.4, t: 0, r: 5 });
    } else if (p.skill === 'energy') {
      for (const k of p.targets || []) marks.set(k, { kind: 'hit_energy', until: t + 2000 });
    } else if (p.skill === 'strong') {
      const gx = lineX(side, 3);
      for (let i = 0; i < 20; i++) particles.push({ kind: 'dust', x: gx + (Math.random() - 0.5) * 60, y: ROPE_Y + 20, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 60, life: 0.9, t: 0, r: 10 + Math.random() * 10 });
      popText(L('LỰC SĨ ĐẾN!', 'STRONGMAN!'), gx, ROPE_Y - 140, '#ffe066', t);
    } else if (p.skill === 'gong') {
      if (p.giverKey) teamFx.push({ kind: 'aura', key: p.giverKey, at: t, ms: 3000 });
    }
  }
  // chữ to bật lên rồi bay lên (BỦMMM, RẦM…)
  const pops = [];
  function popText(textStr, x, y, color, at) {
    pops.push({ text: textStr, x: Math.max(MX + 60, Math.min(W - MX - 60, x)), y, color, at });
    if (pops.length > 6) pops.shift();
  }
  const teamFx = []; // { kind: glue|shield|aura, side|key, at, ms }
  function drawSkillCards(t) {
    for (let i = skillCards.length - 1; i >= 0; i--) {
      const c = skillCards[i];
      const e = (t - c.at) / 1000;
      if (e > 3.2) {
        skillCards.splice(i, 1);
        continue;
      }
      const idx = skillCards.filter((x, j) => x.side === c.side && j < i).length; // thẻ thứ mấy bên này
      const w = Math.min(336, W / 2 - 150 - MX - 8); // không đè đồng hồ giữa
      const h = 74;
      const x = c.side === 'a' ? MX : W - MX - w;
      const y = Y_CLOSE + 6 + idx * (h + 6);
      const pop = e < 0.18 ? 0.7 + (e / 0.18) * 0.35 : e < 0.3 ? 1.05 - ((e - 0.18) / 0.12) * 0.05 : 1;
      const alpha = e > 2.8 ? (3.2 - e) / 0.4 : 1;
      g.save();
      g.globalAlpha = Math.max(0, alpha);
      g.translate(x + w / 2, y + h / 2);
      g.scale(pop, pop);
      g.translate(-w / 2, -h / 2);
      roundRect(0, 0, w, h, 18);
      g.fillStyle = c.blocked ? 'rgba(20,60,30,.95)' : 'rgba(12,10,28,.95)';
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = c.blocked ? '#69db7c' : c.color;
      g.stroke();
      const im = IMG[`gift_${c.skill}`];
      if (ready(im)) {
        const sc = 58 / Math.max(im.naturalWidth, im.naturalHeight);
        g.drawImage(im, 40 - (im.naturalWidth * sc) / 2, h / 2 - (im.naturalHeight * sc) / 2, im.naturalWidth * sc, im.naturalHeight * sc);
      }
      text(c.title, 78, 22, { size: 22, weight: 900, color: c.blocked ? '#69db7c' : '#ffe066', align: 'left', stroke: 4, maxW: w - 88 });
      // câu giải thích 2 dòng nếu dài
      g.font = `700 15px ${FONT}`;
      const words = String(c.line).split(' ');
      let l1 = '';
      let l2 = '';
      for (const wd of words) {
        if (!l2 && g.measureText(`${l1} ${wd}`.trim()).width <= w - 88) l1 = `${l1} ${wd}`.trim();
        else l2 = `${l2} ${wd}`.trim();
      }
      text(l1, 78, l2 ? 44 : 50, { size: 15, weight: 700, color: '#fff', align: 'left', maxW: w - 88 });
      if (l2) text(l2, 78, 62, { size: 15, weight: 700, color: '#fff', align: 'left', maxW: w - 88 });
      g.restore();
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      const e = (t - p.at) / 1000;
      if (e < 0) continue;
      if (e > 1.3) {
        pops.splice(i, 1);
        continue;
      }
      const sc = e < 0.15 ? 0.5 + (e / 0.15) * 0.8 : 1.3 - Math.min(0.3, (e - 0.15) * 0.6);
      g.save();
      g.globalAlpha = e > 1 ? (1.3 - e) / 0.3 : 1;
      g.translate(p.x, p.y - e * 30);
      g.rotate(Math.sin(p.at) * 0.12);
      g.scale(sc, sc);
      text(p.text, 0, 0, { size: 44, weight: 900, color: p.color, stroke: 8, strokeColor: '#1a1030' });
      g.restore();
    }
  }
  // Hiệu ứng theo cả đội trên sân: khiên chặn đòn, găng keo, hò dô (chữ HÒ/DÔ luân phiên), bôi mỡ (dây bóng vàng)
  function drawTeamFx(m, t) {
    for (let i = teamFx.length - 1; i >= 0; i--) {
      const f = teamFx[i];
      const e = (t - f.at) / f.ms;
      if (e > 1) {
        teamFx.splice(i, 1);
        continue;
      }
      if (f.kind === 'shield' || f.kind === 'glue') {
        const n = f.side === 'a' ? roster.lineA.length : roster.lineB.length;
        const x0 = lineX(f.side, 0);
        const x1 = lineX(f.side, Math.max(0, n - 1));
        const cx = (x0 + x1) / 2;
        const rw = Math.abs(x1 - x0) / 2 + 50;
        g.save();
        g.globalAlpha = 0.5 * (1 - e);
        g.strokeStyle = f.kind === 'shield' ? '#69db7c' : '#a9e34b';
        g.fillStyle = f.kind === 'shield' ? 'rgba(105,219,124,.18)' : 'rgba(169,227,75,.12)';
        g.lineWidth = 5;
        g.beginPath();
        g.ellipse(cx, ROPE_Y - 10, rw, 70, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.restore();
      }
    }
    // hò dô: chữ HÒ! / DÔ! luân phiên trên đội đang có kỹ năng
    for (const [side, te] of [['a', live.ta], ['b', live.tb]]) {
      if (!te) continue;
      const cx = (lineX(side, 0) + lineX(side, 6)) / 2;
      if (te.heave > 0) {
        const beat = Math.floor(t / 420) % 2;
        text(beat ? L('DÔ!', 'HO!') : L('HÒ!', 'HEAVE!'), cx, ROPE_Y - 150 - (t % 420) / 420 * 10, { size: 40, weight: 900, color: '#ffe066', stroke: 7, strokeColor: '#7a2e00' });
      }
      if (te.grease > 0) {
        // dây phía đội bị bôi mỡ bóng vàng nhấp nháy
        const n = side === 'a' ? roster.lineA.length : roster.lineB.length;
        const x0 = lineX(side, 0);
        const x1 = lineX(side, Math.max(0, n - 1));
        g.save();
        g.globalAlpha = 0.35 + 0.25 * Math.sin(t / 80);
        g.strokeStyle = '#ffe9a3';
        g.lineWidth = 12;
        g.beginPath();
        g.moveTo(x0, ROPE_Y);
        g.lineTo(x1, ROPE_Y);
        g.stroke();
        g.restore();
      }
      if (te.glue > 0) text('🧤', cx, ROPE_Y - 118, { size: 30 });
      if (te.cheer > 0) text('📣', cx + 40, ROPE_Y - 118, { size: 30 });
    }
    // gồng: vòng sáng vàng dưới chân người vừa gồng + "×2"
    for (const f of teamFx) {
      if (f.kind !== 'aura') continue;
      for (const side of ['a', 'b']) {
        const list = side === 'a' ? roster.lineA : roster.lineB;
        const i = list.findIndex((p) => p.k === f.key);
        if (i < 0) continue;
        const gx = lineX(side, i);
        g.save();
        g.globalAlpha = 0.6 + 0.3 * Math.sin(t / 60);
        g.strokeStyle = '#ffd43b';
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(gx + (side === 'a' ? -14 : 14), ROPE_Y + 44, 30, 9, 0, 0, Math.PI * 2);
        g.stroke();
        g.restore();
        text('×2', gx + (side === 'a' ? -14 : 14), ROPE_Y - 96 - ((t - f.at) / 3000) * 20, { size: 26, weight: 900, color: '#ffd43b', stroke: 5 });
      }
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
  // Nhạc chờ: 2 bản nhạc chờ của phòng Squid (lobby_1 / lobby_2), đổi bài theo số giải; bản 1 to hơn ~3 dB nên hạ bớt
  const lobbyTracks = [
    { el: new Audio('/assets/redlight/lobby_1.m4a?v=26'), gain: 0.72, wired: false, vol: 0 },
    { el: new Audio('/assets/redlight/lobby_2.m4a?v=26'), gain: 1, wired: false, vol: 0 }
  ];
  for (const tr of lobbyTracks) {
    tr.el.loop = true;
    tr.el.preload = 'auto';
  }
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
  // Nhạc: chờ giải / vinh danh = nhạc chờ Squid; lúc kéo = hành khúc "ùm-pa" tự sáng tác (kèn tuba, kazoo, trống, còi trượt)
  function musicTick(dt) {
    const resting = ph.phase === 'lobby' || ph.phase === 'draw' || ph.phase === 'champion';
    const want = unlocked && !previewMuted && settings.bgMusicEnabled !== false && resting;
    const cur = (ph.cup || 0) % lobbyTracks.length;
    lobbyTracks.forEach((tr, i) => {
      const target = want && i === cur ? tr.gain : 0;
      tr.vol += (target - tr.vol) * Math.min(1, dt * (target > tr.vol ? 2.5 : 4.5));
      if (target === 0 && tr.vol < 0.01) {
        tr.vol = 0;
        if (!tr.el.paused) {
          tr.el.pause();
          tr.el.currentTime = 0;
        }
        return;
      }
      if (!tr.wired) tr.wired = audio.connectMusic(tr.el);
      tr.el.volume = Math.max(0, Math.min(1, tr.vol));
      if (tr.el.paused) tr.el.play().catch(() => {});
    });
    pullMusic();
    ambientSfx(dt);
  }

  // ---- Tiếng người & tiếng sân (tự tạo): giọng hoạt hình = sóng răng cưa qua 2 bộ lọc nguyên âm (formant) ----
  const VOWEL = { a: [800, 1200], o: [450, 800], u: [330, 700], e: [420, 2000], i: [300, 2300] };
  function voice(at, dur, f0, f1, vowel = 'a', vol = 0.08, vib = 6) {
    const c = audio.ctx;
    if (!c) return;
    at = Math.max(at, c.currentTime + 0.01);
    const src = c.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0, at);
    src.frequency.exponentialRampToValueAtTime(Math.max(40, f1), at + dur);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = vib;
    lg.gain.value = f0 * 0.03;
    lfo.connect(lg).connect(src.frequency);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, at);
    out.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.05, dur / 4));
    out.gain.setValueAtTime(vol, at + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const [F1, F2] = VOWEL[vowel] || VOWEL.a;
    for (const [f, q, g2] of [[F1, 6, 1], [F2, 8, 0.6]]) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = c.createGain();
      gg.gain.value = g2;
      src.connect(bp).connect(gg).connect(out);
    }
    out.connect(audio.sfxBus);
    src.start(at);
    lfo.start(at);
    src.stop(at + dur + 0.05);
    lfo.stop(at + dur + 0.05);
  }
  const ambient = { creakAt: 0, breathAt: 0, skidAt: 0, chantAt: 0 };
  // Gọi mỗi khung hình lúc đang kéo: dây cót két, thở hộc hộc, giày rít khi bị lôi, đám đông hô HÒ – DÔ
  function ambientSfx(dt) {
    const c = audio.ctx;
    if (!c || !unlocked || previewMuted || ph.phase !== 'pull' || settings.sfxEnabled === false) return;
    const T = c.currentTime + 0.03; // luôn lên lịch sau thời điểm hiện tại
    const tn = performance.now();
    // dây cót két: căng càng mạnh càng dày
    if (tn > ambient.creakAt) {
      ambient.creakAt = tn + 1000 / (0.6 + 2.6 * tension) * (0.6 + Math.random() * 0.8);
      const f = 260 + Math.random() * 160;
      audio.noise(T, 0.22 + Math.random() * 0.12, { vol: 0.05 + tension * 0.05, type: 'bandpass', freq: f, q: 14, sweepTo: f * 0.6 });
    }
    // thở hộc hộc: theo số người đang gồng / kiệt sức trên sân
    let tired = 0;
    for (const v of pstate.values()) if (v.st === 'strain' || v.st === 'tired') tired++;
    if (tired && tn > ambient.breathAt) {
      ambient.breathAt = tn + Math.max(180, 900 - tired * 60) * (0.7 + Math.random() * 0.6);
      const f = 900 + Math.random() * 700;
      audio.noise(T, 0.16, { vol: Math.min(0.08, 0.025 + tired * 0.004), type: 'bandpass', freq: f, q: 2.2, sweepTo: f * 0.75 });
      if (Math.random() < 0.35) voice(T + 0.02, 0.14, 240 + Math.random() * 80, 200, 'a', 0.03, 0); // "hộc"
    }
    // bị lôi đi: giày rít + chà sàn
    const sp = Math.abs(ropeVel);
    if (sp > 0.025 && tn > ambient.skidAt) {
      ambient.skidAt = tn + 110 + Math.random() * 90;
      audio.noise(T, 0.12, { vol: Math.min(0.07, sp * 1.2), type: 'highpass', freq: 2600 });
      if (Math.random() < 0.3) audio.osc(1700 + Math.random() * 500, T, 0.09, { type: 'sine', vol: 0.03, slide: 400, attack: 0.004 });
    }
    // đám đông hô "HÒ… DÔ!" (dày hơn khi có Hò dô / căng)
    const heave = (live.ta && live.ta.heave > 0) || (live.tb && live.tb.heave > 0);
    if (tn > ambient.chantAt) {
      ambient.chantAt = tn + (heave ? 900 : 2600 - tension * 900) * (0.85 + Math.random() * 0.3);
      for (let k = 0; k < 3; k++) {
        const d = Math.random() * 0.04; // lệch nhẹ cho giống nhiều người hô
        voice(T + d, 0.28, 150 + k * 18, 135 + k * 15, 'o', 0.035, 5);
        voice(T + 0.36 + d, 0.32, 190 + k * 20, 175 + k * 18, 'o', 0.04, 5);
      }
    }
  }
  // "Hự!" khi có tiếng hét truyện tranh bật lên
  function gruntSfx() {
    const c = audio.ctx;
    if (!c || !unlocked || previewMuted) return;
    const f = 180 + Math.random() * 120;
    voice(c.currentTime + 0.02, 0.18, f * 1.2, f * 0.8, Math.random() < 0.5 ? 'u' : 'a', 0.05, 0);
  }
  // Hết trận: đội thua la thất thanh "Aaaaa…" rơi xuống vực rồi "bộp"; đội thắng hò "Yeee!"
  function fallSfx() {
    const c = audio.ctx;
    if (!c || !unlocked || previewMuted) return;
    const T = c.currentTime + 0.03;
    for (let k = 0; k < 6; k++) {
      const at = T + 0.5 + k * 0.22 + Math.random() * 0.1;
      const f0 = 520 + Math.random() * 260;
      voice(at, 1.7, f0, f0 * 0.28, 'a', 0.055, 7 + Math.random() * 3);
      audio.osc(55, at + 1.75, 0.25, { type: 'sine', vol: 0.18, slide: -20, attack: 0.002 }); // bộp dưới đáy vực
      audio.noise(at + 1.75, 0.18, { vol: 0.06, type: 'lowpass', freq: 500 });
    }
    // còi trượt xuống kiểu hoạt hình
    audio.osc(1500, T + 0.45, 1.4, { type: 'sine', vol: 0.06, slide: -1250, attack: 0.03 });
    for (let k = 0; k < 4; k++) voice(T + 0.2 + k * 0.05, 0.6, 330 + k * 30, 420 + k * 30, 'e', 0.04, 6);
  }

  // ---- Hành khúc kéo co: Đô trưởng, 8 ô nhịp lặp lại, mỗi ô 8 móc đơn ----
  // Giai điệu kiểu kèn kazoo (null = nghỉ), hợp âm cho tuba "ùm" (nốt gốc) + "pa" (hợp âm ngắn) xen kẽ
  const MEL = [
    [64, 67, 64, 67, 72, null, 67, null],
    [71, null, 67, null, 62, null, null, null],
    [64, 67, 64, 67, 72, null, 76, null],
    [77, null, 76, null, 74, 72, 71, null],
    [72, 72, 67, 67, 64, 64, 60, null],
    [62, 64, 65, 67, 69, 71, 72, null],
    [76, null, 72, null, 69, null, 65, null],
    [67, null, 71, null, 74, null, 79, null]
  ];
  const CHORDS = [[48, 52, 55], [43, 47, 50], [48, 52, 55], [41, 45, 48], [48, 52, 55], [43, 47, 50], [45, 48, 52], [43, 47, 53]];
  const mfreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const music = { on: false, next: 0, step: 0 };
  function kazoo(m, at, dur, vol) {
    const c = audio.ensure();
    if (!c) return;
    const f = mfreq(m);
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const bp = c.createBiquadFilter();
    const gn = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.97, at); // trượt nhẹ vào nốt cho "kazoo"
    o.frequency.exponentialRampToValueAtTime(f, at + 0.04);
    lfo.frequency.value = 7;
    lg.gain.value = f * 0.018;
    lfo.connect(lg).connect(o.frequency);
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(3000, f * 3);
    bp.Q.value = 1.4;
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    gn.gain.setValueAtTime(vol, at + Math.max(0.03, dur - 0.05));
    gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(bp).connect(gn).connect(audio.musicBus);
    o.start(at);
    lfo.start(at);
    o.stop(at + dur + 0.05);
    lfo.stop(at + dur + 0.05);
  }
  function tuba(m, at, dur, vol) {
    const c = audio.ensure();
    if (!c) return;
    const o = c.createOscillator();
    const lp = c.createBiquadFilter();
    const gn = c.createGain();
    o.type = 'square';
    o.frequency.value = mfreq(m);
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.exponentialRampToValueAtTime(vol, at + 0.015);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(lp).connect(gn).connect(audio.musicBus);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
  function snare(at, vol) {
    audio.noise(at, 0.12, { vol, type: 'bandpass', freq: 1800, q: 0.8, bus: 'music' });
    audio.osc(190, at, 0.07, { type: 'triangle', vol: vol * 0.6, slide: -60, attack: 0.002, bus: 'music' });
  }
  function slideWhistle(at, up) {
    audio.osc(up ? 700 : 1900, at, 0.55, { type: 'sine', vol: 0.09, slide: up ? 1200 : -1200, attack: 0.03, bus: 'music' });
  }
  function pullMusic() {
    const c = audio.ctx;
    const play = unlocked && !previewMuted && settings.bgMusicEnabled !== false && ph.phase === 'pull' && c;
    if (!play) {
      music.on = false;
      return;
    }
    if (!music.on) {
      music.on = true;
      music.step = 0;
      music.next = c.currentTime + 0.08;
    }
    const left = (ph.phaseEndsAt - now()) / 1000;
    const hurry = left < 10; // 10 giây cuối: nhanh hơn + lên giọng
    const bpm = hurry ? 156 : 128;
    const eighth = 60 / bpm / 2;
    const tr = hurry ? 2 : 0;
    const danger = Math.abs(ropeX) > 0.6; // sát mép vực: thêm lớp căng thẳng
    while (music.next < c.currentTime + 0.25) {
      const at = music.next;
      const bar = Math.floor(music.step / 8) % 8;
      const e = music.step % 8;
      const ch = CHORDS[bar];
      // tuba "ùm" ở phách 1, 3 · "pa" (hợp âm ngắn) ở phách 2, 4
      if (e === 0 || e === 4) tuba(ch[0] - 12 + tr, at, eighth * 1.6, 0.16);
      if (e === 2 || e === 6) for (const n of ch) audio.osc(mfreq(n + 12 + tr), at, eighth * 0.7, { type: 'triangle', vol: 0.045, attack: 0.004, bus: 'music' });
      // trống: kick phách 1, 3 · snare phách 2, 4 · hi-hat mỗi móc đơn
      if (e === 0 || e === 4) audio.kick(at, 0.28);
      if (e === 2 || e === 6) snare(at, 0.12);
      audio.hat(at, e % 2 ? 0.025 : 0.04);
      // giai điệu kazoo
      const note = MEL[bar][e];
      if (note) {
        let len = 1;
        while (e + len < 8 && MEL[bar][e + len] === null && len < 2) len++;
        kazoo(note + tr, at, eighth * len * 0.92, 0.075);
      }
      // còi trượt hoạt hình: cuối mỗi 4 ô nhịp
      if (e === 7 && bar % 4 === 3) slideWhistle(at, bar === 3);
      // lớp căng thẳng: nốt trầm rung dồn dập
      if (danger) audio.osc(mfreq(36 + tr), at, eighth * 0.45, { type: 'sawtooth', vol: 0.05, attack: 0.003, bus: 'music' });
      music.step++;
      music.next += eighth;
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
        gruntSfx();
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
      const say = skillSays.get(d.p.k);
      if (say && say.until > t) {
        g.font = `800 16px ${FONT}`;
        const tw = Math.min(230, g.measureText(say.text).width) + 20;
        const by = placeLabel(x, headY - 44, tw, 30) ?? headY - 44;
        const bx = Math.max(MX, Math.min(W - MX - tw, x - tw / 2));
        const appear = Math.min(1, (t - (say.until - 2200)) / 120);
        g.save();
        g.globalAlpha = Math.min(1, (say.until - t) / 250) * appear;
        roundRect(bx, by - 15, tw, 30, 14);
        g.fillStyle = '#fff';
        g.fill();
        g.lineWidth = 2.5;
        g.strokeStyle = '#1a1030';
        g.stroke();
        // đuôi bong bóng chỉ xuống miệng nhân vật
        g.beginPath();
        g.moveTo(x - 6, by + 14);
        g.lineTo(x + 6, by + 14);
        g.lineTo(x, Math.min(headY - 4, by + 26));
        g.closePath();
        g.fillStyle = '#fff';
        g.fill();
        text(say.text, bx + tw / 2, by + 1, { size: 16, weight: 800, color: '#1a1030', maxW: tw - 14 });
        g.restore();
      } else if (say) skillSays.delete(d.p.k);
      const HIT = { hit_energy: '⚡', hit_tickle: '🪶', hit_fart: '💫', hit_stomp: '💥', hit_grease: '🧈' };
      if (mk && mk.until > t && HIT[mk.kind]) text(HIT[mk.kind], x + Math.sin(t / 70) * 6, headY - 22, { size: 26 });
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
    // trận biểu diễn AI: một ô rộng thay cho sơ đồ giải
    if (ph.exhibition && ph.bracket && ph.bracket[0]) {
      const m0 = ph.bracket[0];
      const y = Y_HUD + 54;
      panel(MX + 22, y, CW - 44, 76, { r: 14, fill: 'rgba(105,219,124,.12)', glow: '#69db7c' });
      text(L('🤖 TRẬN BIỂU DIỄN AI · không tính điểm', '🤖 AI SHOW MATCH · no points'), W / 2, y + 18, { size: 16, weight: 900, color: '#b2f2bb' });
      const chip = (team, cx) => {
        roundRect(cx - 70, y + 34, 140, 32, 10);
        g.fillStyle = teamColor(team);
        g.fill();
        text(teamLabel(team), cx, y + 50, { size: 15, weight: 900, color: team === 3 ? '#222' : '#fff', maxW: 132 });
      };
      chip(m0.a, W / 2 - 100);
      text('vs', W / 2, y + 50, { size: 15, weight: 700, color: '#aaa' });
      chip(m0.b, W / 2 + 100);
      return;
    }
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

  // Thanh tiến độ kiểu thanh máu game đối kháng: hai nửa màu đội đặc (dải bóng mảnh phía trên cho có khối),
  // vệt "vừa mất" sáng nhạt bám theo khi dây trôi, tia điện ở chỗ giáp ranh, sóng năng lượng từ đội đang mạnh hơn,
  // vạch mốc 25/50/75%, đội sát mép vực thì đầu thanh nháy đỏ "NGUY HIỂM"; % + tên đội nằm trong thanh
  let shareA = 0.5;
  let barKick = 0;
  let lastPct = 50;
  let ghostPos = 0.5; // vị trí giáp ranh trễ (vệt "vừa mất")
  let waveAt = 0;
  const sparks = [];
  function drawPowerBar(t, dt) {
    const m = curMatch();
    const x = MX;
    const w = CW;
    const y = Y_BAR;
    const H = BAR_H;
    const field = m && (ph.phase === 'intro' || ph.phase === 'pull' || ph.phase === 'matchEnd');
    if (!field) {
      panel(x, y, w, H, { r: 18, fill: 'rgba(0,0,0,.6)', border: '#ffe066' });
      text(L('💬 Bình luận 1 · 2 · 3 · 4 để vào đội', '💬 Comment 1 · 2 · 3 · 4 to join a team'), W / 2, y + H / 2, { size: 26, weight: 900, color: '#ffe066' });
      return;
    }
    const fa = ph.phase === 'pull' ? live.fa || 0 : 0;
    const fb = ph.phase === 'pull' ? live.fb || 0 : 0;
    const target = fa + fb > 0.01 ? fa / (fa + fb) : 0.5;
    shareA += (target - shareA) * Math.min(1, dt * 3);
    const pctA = Math.round(shareA * 100);
    if (Math.abs(pctA - lastPct) >= 3) {
      barKick = 1;
      lastPct = pctA;
    }
    barKick = Math.max(0, barKick - dt * 3);
    const pos = 0.5 + ropeX / 2; // 0 = dây sát đội a
    const split = 1 - pos; // tỉ lệ thanh của đội a
    // vệt trễ: bám theo chậm (nửa giây) để thấy đà
    ghostPos += (split - ghostPos) * Math.min(1, dt * 1.6);
    const ix = x + 6;
    const iw = w - 12;
    const iy = y + 6;
    const ih = H - 12;
    const mk = ix + iw * split;
    const gk = ix + iw * ghostPos;
    const colA = teamColor(m.a);
    const colB = teamColor(m.b);
    // khung ngoài: nền tối + viền neon hồng mảnh
    g.save();
    g.shadowColor = '#ff4fa3';
    g.shadowBlur = 12;
    roundRect(x, y, w, H, 16);
    g.fillStyle = '#0b0a18';
    g.fill();
    g.restore();
    roundRect(x, y, w, H, 16);
    g.lineWidth = 3;
    g.strokeStyle = '#ff4fa3';
    g.stroke();
    // lòng thanh
    g.save();
    roundRect(ix, iy, iw, ih, 11);
    g.clip();
    g.fillStyle = '#1a1830';
    g.fillRect(ix, iy, iw, ih);
    g.fillStyle = colA;
    g.fillRect(ix, iy, mk - ix, ih);
    g.fillStyle = colB;
    g.fillRect(mk, iy, ix + iw - mk, ih);
    // vệt "vừa mất": phần giáp ranh vừa trôi qua, màu trắng nhạt
    if (Math.abs(gk - mk) > 1) {
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.fillRect(Math.min(gk, mk), iy, Math.abs(gk - mk), ih);
    }
    // dải bóng mảnh phía trên + bóng tối mảnh phía dưới (không phủ chữ / màu chính)
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.fillRect(ix, iy + 3, iw, ih * 0.16);
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(ix, iy + ih * 0.82, iw, ih * 0.18);
    // sóng năng lượng: từ đầu thanh của đội đang mạnh hơn quét vào chỗ giáp ranh (mỗi ~1,1 giây)
    const lead = fa > fb * 1.08 ? 'a' : fb > fa * 1.08 ? 'b' : null;
    if (lead && t - waveAt > 1100) waveAt = t;
    const we = (t - waveAt) / 650;
    if (lead && we <= 1) {
      const from = lead === 'a' ? ix : ix + iw;
      const wx = from + (mk - from) * we;
      const gr = g.createLinearGradient(wx - 40, 0, wx + 40, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, `rgba(255,255,255,${0.35 * (1 - we * 0.6)})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(wx - 40, iy, 80, ih);
    }
    // vạch mốc 25 / 50 / 75 %
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (const q of [0.25, 0.75]) g.fillRect(ix + iw * q - 1, iy + ih * 0.7, 2, ih * 0.3);
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.fillRect(ix + iw * 0.5 - 1.5, iy, 3, ih * 0.22);
    g.fillRect(ix + iw * 0.5 - 1.5, iy + ih * 0.78, 3, ih * 0.22);
    // đội sát mép vực: đầu thanh nháy đỏ
    const dangerA = ropeX > 0.6 && ph.phase === 'pull';
    const dangerB = ropeX < -0.6 && ph.phase === 'pull';
    const blink = 0.35 + 0.35 * Math.sin(t / 90);
    if (dangerA) {
      g.fillStyle = `rgba(255,0,40,${blink})`;
      g.fillRect(ix, iy, 120, ih);
    }
    if (dangerB) {
      g.fillStyle = `rgba(255,0,40,${blink})`;
      g.fillRect(ix + iw - 120, iy, 120, ih);
    }
    g.restore();
    // tia điện ở chỗ giáp ranh: vạch trắng sáng + tia nhỏ bắn ra (nhiều hơn khi căng)
    g.fillStyle = '#fff';
    g.fillRect(mk - 2, iy - 2, 4, ih + 4);
    const rate = 10 + tension * 40 + Math.abs(ropeVel) * 300;
    if (ph.phase === 'pull' && Math.random() < dt * rate) {
      const ang = (Math.random() - 0.5) * Math.PI * 0.9 + (Math.random() < 0.5 ? -Math.PI / 2 : Math.PI / 2);
      sparks.push({ x: mk, y: y + H / 2 + (Math.random() - 0.5) * ih, vx: Math.cos(ang) * (80 + Math.random() * 120), vy: Math.sin(ang) * (80 + Math.random() * 120), life: 0.25 + Math.random() * 0.2, t: 0 });
    }
    g.lineCap = 'round';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.t += dt;
      if (sp.t > sp.life) {
        sparks.splice(i, 1);
        continue;
      }
      const k = 1 - sp.t / sp.life;
      const nx = sp.x + sp.vx * dt;
      const ny = sp.y + sp.vy * dt;
      g.strokeStyle = `rgba(255,${200 + Math.floor(55 * k)},${120 + Math.floor(135 * k)},${k})`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(sp.x, sp.y);
      g.lineTo(nx - sp.vx * 0.03, ny - sp.vy * 0.03);
      g.stroke();
      sp.x = nx;
      sp.y = ny;
    }
    // nút dây: vòng tròn chia đôi màu hai đội, lắc nhẹ theo độ căng
    g.save();
    g.translate(mk, y + H / 2);
    g.rotate(Math.sin(t / 70) * 0.12 * tension);
    g.beginPath();
    g.arc(0, 0, 27, Math.PI / 2, (Math.PI * 3) / 2);
    g.fillStyle = colA;
    g.fill();
    g.beginPath();
    g.arc(0, 0, 27, -Math.PI / 2, Math.PI / 2);
    g.fillStyle = colB;
    g.fill();
    g.beginPath();
    g.arc(0, 0, 20, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#111';
    g.beginPath();
    g.arc(0, 0, 27, 0, Math.PI * 2);
    g.stroke();
    text('🪢', 0, 1, { size: 24 });
    g.restore();
    // % + tên đội trong thanh: chữ trắng viền tối; % nhún khi đổi mạnh
    const sc = 1 + barKick * 0.18;
    g.font = `900 40px ${FONT}`;
    const pwA = g.measureText(`${pctA}%`).width;
    const pwB = g.measureText(`${100 - pctA}%`).width;
    const pct = (val, px, align, hot) => {
      g.save();
      g.translate(px, y + H / 2 + 1);
      g.scale(sc, sc);
      text(`${val}%`, 0, 0, { size: 40, weight: 900, color: hot ? '#ffe066' : '#fff', align, stroke: 7, strokeColor: 'rgba(0,0,0,.85)' });
      g.restore();
    };
    pct(pctA, ix + 18, 'left', lead === 'a');
    pct(100 - pctA, ix + iw - 18, 'right', lead === 'b');
    const nax = ix + 18 + pwA * 1.18 + 16; // chừa chỗ cho số % lúc nhún to
    const nbx = ix + iw - 18 - pwB * 1.18 - 16;
    const lbl = (txt, px, align, room, danger) => {
      if (room < 70) return;
      text(danger ? L('⚠ NGUY HIỂM', '⚠ DANGER') : txt, px, y + H / 2 + 1, { size: 18, weight: 900, color: danger ? '#fff' : '#fff', align, stroke: 5, strokeColor: danger ? '#c00020' : 'rgba(0,0,0,.85)', maxW: room });
    };
    lbl(teamLabel(m.a), nax, 'left', mk - 40 - nax, dangerA);
    lbl(teamLabel(m.b), nbx, 'right', nbx - mk - 40, dangerB);
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
    const ready = ph.ready || [];
    const readyTxt = L(`Cần 2 đội có người (≥ ${ph.minTeamPlayers || 1}) · đã có: ${ready.length ? ready.map((x) => 'Đội ' + x).join(', ') : 'chưa có'}`, `Need 2 teams with players (≥ ${ph.minTeamPlayers || 1}) · ready: ${ready.length ? ready.map((x) => 'Team ' + x).join(', ') : 'none'}`);
    if (ph.exhibition && m && (ph.phase === 'intro' || ph.phase === 'pull' || ph.phase === 'matchEnd')) {
      main = `🤖 ${L('AI BIỂU DIỄN', 'AI SHOW')}: ${teamLabel(m.a)}  vs  ${teamLabel(m.b)}`;
      color = '#b2f2bb';
    } else if (ph.phase === 'lobby') {
      main = ready.length >= 2 ? L(`✅ ĐỦ ${ready.length} ĐỘI · sắp bốc thăm`, `✅ ${ready.length} TEAMS READY · draw soon`) : L(`⏳ PHÒNG CHỜ · ${roster.players} người đã vào đội`, `⏳ LOBBY · ${roster.players} players in teams`);
      color = ready.length >= 2 ? '#69db7c' : '#ffe066';
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
    const sub = fl ? `➕ ${fl.text}` : ph.phase === 'lobby' || ph.exhibition ? readyTxt : nx;
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
      text(`${tm.bank ? `🎒${tm.bank}  ` : ''}${tm.count}/${tm.max}${tm.wins ? `  🏆${tm.wins}` : ''}`, x + cw - 18, y + 26, { size: 17, weight: 800, color: ink, align: 'right' });
      let when = '';
      if (tm.status === 'wait' || tm.status === 'final') {
        if (!ph.bracket || ph.exhibition) when = (ph.ready || []).includes(tm.id) ? L('✅ đủ người', '✅ ready') : L(`cần ${ph.minTeamPlayers || 1} người`, `needs ${ph.minTeamPlayers || 1}`);
        else if (tm.nextIn === 1) when = L('TRẬN TIẾP THEO!', 'NEXT MATCH!');
        else if (tm.nextIn > 1) when = L(`còn ${tm.nextIn - 1} trận`, `${tm.nextIn - 1} to go`);
      } else if (tm.status === 'field') when = L('thả tim đều tay!', 'tap steadily!');
      else if (tm.status === 'out') when = L('tặng quà tiếp sức đội thua', 'gift to help the losers');
      text(`${st[0]} ${st[1]}`, x + 16, y + 60, { size: 17, weight: 900, color: st[2], align: 'left' });
      if (when) text(when, x + cw - 16, y + 60, { size: 15, weight: 800, color: tm.nextIn === 1 ? '#ffe066' : '#bbb', align: 'right', maxW: cw / 2 });
      // danh sách 2 cột × 4 hàng (tối đa 8 người, theo lực cả giải; điểm nhỏ bên phải mỗi tên)
      const list = tm.top || [];
      if (!list.length) text(L('Chưa có ai · bình luận ', 'Empty · comment ') + tm.id, x + cw / 2, y + 112, { size: 16, color: '#888' });
      const colW = (cw - 24) / 2;
      list.slice(0, 8).forEach((p, j) => {
        const col = Math.floor(j / 4);
        const ly = y + 82 + (j % 4) * 19;
        const cx = x + 12 + col * colW;
        text(j === 0 && p.force > 0 ? '👑' : `${j + 1}`, cx + 10, ly, { size: 13, weight: 800, color: j === 0 ? '#ffd43b' : '#aab' });
        text(p.name, cx + 22, ly, { size: 14, weight: 700, color: '#fff', align: 'left', maxW: colW - (p.force > 0 ? 64 : 28) });
        if (p.force > 0) text(`${p.force}`, cx + colW - 6, ly, { size: 13, weight: 800, color: tm.color, align: 'right' });
      });


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
      } else if (p.kind === 'note') {
        g.globalAlpha = k;
        text(p.c, p.x + Math.sin(p.t * 6) * 8, p.y, { size: p.r, weight: 900, color: '#fff', stroke: 4, strokeColor: '#b45cff' });
      } else if (p.kind === 'goo') {
        g.globalAlpha = k;
        g.fillStyle = '#a9e34b';
        g.beginPath();
        g.ellipse(p.x, p.y, 5, 8, 0, 0, Math.PI * 2);
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
    if (!te || !(te.strong > 0) || ph.phase === 'matchEnd') return;
    // đứng sau hàng người, ngay sau 3 người đầu dây (luôn thấy trên màn hình)
    const gx = lineX(side, 3) + (side === 'a' ? -10 : 10);
    drawPose(team, 99, Math.floor(t / 600) % 2 ? 'plank' : 'strain', gx, ropeYAt(gx, t), side === 'a' ? 1 : -1, { scale: SPRITE_SCALE * 1.45 });
    text(L('LỰC SĨ', 'STRONGMAN'), gx, ROPE_Y - 118, { size: 16, weight: 900, color: '#ffe066', stroke: 4 });
  }

  // Cận cảnh đầu dây (giữa) + số người, người kéo khoẻ nhất mỗi đội (hai góc)
  function drawArena(t, dt) {
    const m = curMatch();
    if (!m || (ph.phase !== 'pull' && ph.phase !== 'intro')) return;
    if (ph.phase === 'pull') drawBigTimer(t);
    const info = (list, team, x, align) => {
      const humans = list.filter((p) => !p.npc).length;
      const bots = list.length - humans;
      text(teamLabel(team), x, Y_CLOSE + 22, { size: 20, weight: 900, color: teamColor(team), align, stroke: 5, maxW: 300 });
      text(L(`${humans} người${bots ? ` + ${bots}🤖` : ''}`, `${humans} players${bots ? ` + ${bots}🤖` : ''}`), x, Y_CLOSE + 50, { size: 17, weight: 800, color: '#dde', align, stroke: 4 });
      const best = list
        .filter((p) => !p.npc)
        .map((p) => ({ n: p.n, f: (pstate.get(p.k) || {}).force || 0 }))
        .sort((a, b) => b.f - a.f)[0];
      if (best && best.f > 0) text(`👑 ${best.n}`, x, Y_CLOSE + 78, { size: 18, weight: 800, color: '#ffe066', align, stroke: 4, maxW: 300 });
    };
    info(roster.lineA, m.a, MX + 18, 'left');
    info(roster.lineB, m.b, W - MX - 18, 'right');
  }
  // Đồng hồ đếm ngược số to giữa màn hình: mỗi giây số nảy lên; 10 giây cuối đỏ, rung + tích tắc; phút chót màu cam
  let lastTickSec = -1;
  function drawBigTimer(t) {
    const ms = Math.max(0, ph.phaseEndsAt - now());
    const sec = Math.ceil(ms / 1000);
    const frac = sec - ms / 1000; // 0 → 1 trong mỗi giây
    const last = sec <= 10;
    if (last && sec !== lastTickSec && sec > 0) {
      lastTickSec = sec;
      if (unlocked && !previewMuted) audio.finalTick(Math.min(10, sec));
    }
    const pop = 1 + Math.max(0, 0.22 - frac) / 0.22 * (last ? 0.3 : 0.14);
    const cx = W / 2 + (last ? Math.sin(t / 25) * 2.5 : 0);
    const cy = Y_CLOSE + 70;
    const color = ph.overtime ? '#ff922b' : last ? '#ff4d4f' : '#fff';
    g.save();
    roundRect(W / 2 - 150, Y_CLOSE + 4, 300, 132, 22);
    g.fillStyle = 'rgba(8,8,24,.78)';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = last ? `rgba(255,77,79,${0.5 + 0.5 * Math.sin(t / 90)})` : 'rgba(255,79,163,.7)';
    g.stroke();
    g.restore();
    text(ph.overtime ? L('PHÚT CHÓT', 'OVERTIME') : L('THỜI GIAN CÒN', 'TIME LEFT'), W / 2, Y_CLOSE + 24, { size: 17, weight: 900, color: ph.overtime ? '#ff922b' : '#ccd' });
    g.save();
    g.translate(cx, cy + 8);
    g.scale(pop, pop);
    text(fmtTime(ms), 0, 0, { size: 76, weight: 900, color, stroke: 8, strokeColor: 'rgba(0,0,0,.85)' });
    g.restore();
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
      drawTeamFx(m, t);
      drawLabels(m, t);
      if (live.sleep > 0) text('😴 Zzz', GAP_C, 640, { size: 40, weight: 900, color: '#a5d8ff', stroke: 6 });
    } else drawCrowd(t);
    drawParticles(dt);
    g.restore();
    drawArena(t, dt);
    drawSkillCards(t);
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
