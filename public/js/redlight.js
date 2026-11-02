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
  // Số phiên bản của chính file này (?v= server gắn vào link): TikTok LIVE Studio / OBS giữ trang cũ khi server khởi động lại
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

  // Bố cục: phía trên (0–260) bị thanh tên kênh / người xem của TikTok che, phía dưới (từ ~1320) bị bình luận che.
  // Góc nhìn cao gần như từ trên xuống: không có gần to xa nhỏ, sân phủ gần hết bề ngang.
  // Đo trên video mẫu (máy 19,5:9): thanh TikTok che 0–12% chiều cao; từ ~61% là quà bay, bình luận, ô nhập, tim bên phải.
  // Máy dài TikTok phóng lấp đầy rồi cắt ~9% mỗi bên: chữ và người chơi giữ trong x 100–980.
  const SAFE_L = 100;
  const SAFE_R = 980;
  const TOP_Y = 212; // hai bảng ván / đồng hồ (hai bên búp bê); bên dưới là hàng người giữ kỉ lục
  const FY = 450; // vạch đích (khớp ảnh nền bg.webp)
  const SY = 1152; // vạch xuất phát (khớp ảnh nền bg.webp: 6 hàng gạch)
  const TRACK = 120; // độ dài sân theo server (đơn vị)
  const LEGEND_Y = 1186; // thanh kỹ năng: 1186–1286 (dòng chữ chạy hướng dẫn ở ngay trên: 1158–1182)
  const HEAD_H = 68; // chiều cao hai bảng trên cùng
  const REC_FEET = 364; // chân hàng người giữ kỉ lục (sát chân tường, dưới tán cây)
  const FX0 = 170; // mép trái / phải chỗ người chơi đứng (trong nền sân sáng)
  const FX1 = 910;
  const DOLL_H = 228; // chiều cao búp bê
  const GUARD_H = 90; // lính canh cao hơn người chơi một chút
  const PH = 78; // chiều cao người chơi đứng
  const VARIANTS = 29; // 6 kiểu thường + 10 kiểu ngộ nghĩnh + 13 kiểu bựa (ông cụ chống gậy, anh bó bột, chú béo ụ, tóc HKT, lưng dài chân ngắn, chân dài, quần ống thấp ống cao, quần tụt, [24 đã bỏ], đầu trọc 1 sợi, anh nằm sấp bò lết, anh tập tạ trồng chuối, anh tóc chôm chỉa lắc hông thả tim)
  const DROPPED = new Set([24]); // tóc tổ chim: tóc to chiếm chỗ, che người khác
  const VLIST = [...Array(VARIANTS).keys()].filter((v) => !DROPPED.has(v));
  const variantOf = (h) => VLIST[(h || 0) % VLIST.length];
  const P_FRAMES = ['stand', 'run1', 'run2', 'run3', 'run4', 'freeze', 'freeze2', 'dead'];
  const RUN = ['run1', 'run2', 'run3', 'run4'];

  // Ảnh vẽ bằng Scenario (public/assets/redlight). manifest.json: tên → [rộng, cao, phụ]
  //   người chơi: phụ = [tâm x, tâm y, rộng] miếng vải số sau lưng; búp bê: phụ = [[x, y], ...] vị trí mắt (tỉ lệ)
  const ASSET = '/assets/redlight/';
  const AV = 22; // đổi số này mỗi khi thay ảnh: /assets được cache 1 ngày
  const IMG = {};
  // prettier-ignore
  const NAMES = ['bg', 'doll_0', 'doll_1', 'doll_2', 'doll_3', 'doll_4', 'guard_0', 'guard_1', 'guard_2',
    'c_stand', 'c_run1', 'c_run2',
    'ic_turbo', 'ic_shield', 'ic_shot', 'ic_clones', 'ic_push', 'ic_giant', 'ic_chicken', 'ic_team',
    'fx_shield', 'fx_flash', 'fx_spark', 'fx_trail', 'fx_aura', 'fx_wave', 'fx_smoke', 'fx_feather',
    'ui_panel', 'ui_rank1', 'ui_rank2', 'ui_rank3', 'ui_rank4', 'ui_rank5',
    'gift_turbo', 'gift_shield', 'gift_buffalo', 'gift_clones', 'gift_wind', 'gift_giant', 'gift_chicken', 'gift_teamShield', 'gift_shove',
    'gift_crowd', 'gift_stomp',
    'giant_run1', 'giant_run2', 'giant_run3', 'giant_run4', 'giant_run5', 'giant_run6'];
  for (const v of VLIST) for (const f of P_FRAMES) NAMES.push(`v${v}_${f}`);
  for (const n of NAMES) {
    const im = new Image();
    im.src = `${ASSET}${n}.webp?v=${AV}`;
    IMG[n] = im;
  }
  let MAN = {};
  fetch(`${ASSET}manifest.json?v=${AV}`)
    .then((r) => r.json())
    .then((m) => (MAN = m))
    .catch(() => {});
  const ready = (im) => im && im.complete && im.naturalWidth > 0;
  const ICON_OF = { turbo: 'ic_turbo', shield: 'ic_shield', buffalo: 'ic_shot', clones: 'ic_clones', wind: 'ic_push', giant: 'ic_giant', chicken: 'ic_chicken', teamShield: 'ic_team', crowd: 'ic_clones', stomp: 'ic_giant' };
  // 6 lính canh trên lối đi sau vạch đích, hai bên búp bê (điểm chân)
  const GUARDS = [-1, 1].flatMap((side) => [0, 1, 2].map((i) => ({ x: W / 2 + side * (150 + i * 74), y: FY - 10, img: `guard_${i}`, side, fireAt: -1e9 })));
  // Hết giờ: 6 lính dàn hàng ngang tiến vào sân
  GUARDS.forEach((gd) => {
    const order = gd.side < 0 ? 2 - Number(gd.img.slice(-1)) : 3 + Number(gd.img.slice(-1));
    gd.tx = FX0 + ((order + 0.5) / 6) * (FX1 - FX0);
    gd.ty = FY + 95;
  });
  let purgeAt = 0; // lúc lính bắt đầu tiến (0 = ở chỗ cũ)
  let purgeMarch = 1300;

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
  let queueList = []; // hàng chờ ván sau: [{ n, h, s?, sa? }]
  const queueSays = new Map(); // tên → { text, until } bình luận đang hiện trên đầu người ở hàng chờ
  let queueNeed = 15;
  let settings = {};
  const fx = []; // hiệu ứng đang chạy
  const ticker = []; // dòng chữ chạy
  let banner = null; // { text, color, until }
  let giftBanner = null;

  function applyPhase(p) {
    if (!p) return;
    // có bản mã màn hình mới: tự tải lại, đợi lúc không đang chạy ván cho khỏi giật
    if (MY_V && p.clientV && String(p.clientV) !== MY_V && p.phase !== 'play') {
      location.reload();
      return;
    }
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
        s = { id: r.id, dy: r.y, ty: r.y, anim: Math.random() * 4, lastMoveAt: 0, deadSeenAt: 0, turboUntil: 0 };
        sprites.set(r.id, s);
        // bản sao mới xuất hiện giữa ván: làn khói phân thân
        if (r.c && ph.phase === 'play') {
          const p = project(r.x, r.y);
          addSprite('fx_smoke', p.x, p.y - PH * 0.45, 30, 120, 650, performance.now());
        }
      }
      Object.assign(s, { n: r.n, num: r.num, av: r.av, c: r.c, x: r.x, a: r.a, f: r.f, s: r.s, gi: r.g, k: r.k, h: r.h, b: r.b });
      if (Math.abs(r.y - s.ty) > 0.01) s.ty = r.y;
      if (!r.a && !s.deadSeenAt) s.deadSeenAt = performance.now();
      if (r.a) s.deadSeenAt = 0;
    }
    for (const id of [...sprites.keys()]) if (!seen.has(id)) sprites.delete(id);
  }

  function setQueue(list) {
    queueList = list;
    const tn = performance.now();
    for (const q of list) if (q.s) queueSays.set(q.n, { text: q.s, until: tn + 6000 - (q.sa || 0) });
    for (const [n, v] of queueSays) if (v.until < tn) queueSays.delete(n);
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
    if (rl.queue) setQueue(rl.queue);
    if (rl.queueNeed) queueNeed = rl.queueNeed;
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
  const audio = new window.RLAudio({ assetVer: AV });
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
      musicVolume: typeof settings.musicVolume === 'number' ? settings.musicVolume : 0.55,
      dollTurnVolume: typeof settings.dollTurnVolume === 'number' ? settings.dollTurnVolume : 0.1
    });
  }

  // Trò của người điều phối (giờ server): búp bê giả vờ quay / ngủ gật
  const faking = (t = now()) => Boolean(ph.fake) && t >= ph.fake.at && t < ph.fake.at + ph.fake.ms;
  const sleeping = (t = now()) => ph.light === 'green' && (ph.sleepUntil || 0) > t;

  // Nhạc theo pha hiện tại (gọi khi mở màn hình / bật tiếng giữa chừng)
  function syncMusic() {
    if (!unlocked) return;
    if (ph.paused) {
      audio.stopSong();
      audio.stopLoops();
    } else if (ph.phase === 'lobby') {
      // nhạc chờ là file mp3 (lobbyMusicTick); chỉ dùng nhạc tự tạo khi không tải được file
      if (lobbyTracks.every((tr) => tr.el.error)) audio.lobbyLoop();
      else audio.stopLoops();
    } else if (ph.phase === 'play') {
      if (sleeping()) {
        audio.stopSong();
        audio.stopLoops();
      } else if (ph.light === 'green' && ph.song) {
        audio.stopSong();
        audio.stopLoops();
      } else if (ph.light === 'green') audio.greenSong((ph.lightEndsAt + (ph.warnMs || 1500) - now()) / 1000);
      else if (ph.light === 'red') audio.redLight();
    } else {
      audio.stopSong();
      audio.stopLoops();
    }
  }

  // --------------------------------------------------------------------------
  // Câu hát búp bê: server gửi mốc chữ + tốc độ từng chữ; màn hình phát đúng vị trí theo đồng hồ server
  // (vào giữa chừng / lệch nhịp thì nhảy tới chỗ đúng). preservesPitch: hát nhanh chậm mà giọng không méo.
  // --------------------------------------------------------------------------
  const songEl = new Audio(`${ASSET}song.m4a?v=${AV}`);
  songEl.preload = 'auto';
  songEl.preservesPitch = true;
  let songWired = false;
  function songPos(sg, t) {
    let left = (t - sg.startAt) / 1000;
    if (left < 0) return null;
    const c = sg.cuts;
    for (let i = 0; i < sg.rates.length; i++) {
      const d = (c[i + 1] - c[i]) / sg.rates[i];
      if (left < d) return { pos: c[i] + left * sg.rates[i], rate: sg.rates[i] };
      left -= d;
    }
    return null;
  }
  function songTick() {
    const sg = ph.song;
    const st = sg && unlocked && !previewMuted && !ph.paused && ph.phase === 'play' && ph.light !== 'red' && !faking() ? songPos(sg, now()) : null;
    if (!st) {
      if (!songEl.paused) songEl.pause();
      return;
    }
    if (!songWired) songWired = audio.connectVoice(songEl);
    if (Math.abs(songEl.playbackRate - st.rate) > 0.005) songEl.playbackRate = st.rate;
    if (Math.abs(songEl.currentTime - st.pos) > 0.15) songEl.currentTime = st.pos;
    if (songEl.paused) songEl.play().catch(() => {});
  }

  // Nhạc nền lúc nghỉ chờ ván mới (sau nhạc kết quả 2,5 giây → hết lúc chờ): hai bản thay phiên theo số ván,
  // lặp lại nếu thời gian chờ dài hơn bản nhạc; vào ván thì nhỏ dần rồi dừng.
  // gain: cân độ to hai bản (đo RMS: bản 1 to hơn bản 2 khoảng 3 dB)
  const lobbyTracks = [
    { file: 'lobby_1.m4a', gain: 0.72 },
    { file: 'lobby_2.m4a', gain: 1 }
  ].map((tr) => {
    const el = new Audio(`${ASSET}${tr.file}?v=${AV}`);
    el.preload = 'auto';
    el.loop = true;
    el.volume = 0;
    return { ...tr, el, wired: false, vol: 0 };
  });
  let resultAt = 0;
  let lobbyMusicAt = performance.now();
  function lobbyMusicTick() {
    const tn = performance.now();
    const dt = Math.min(0.1, (tn - lobbyMusicAt) / 1000);
    lobbyMusicAt = tn;
    const resting = ph.phase === 'lobby' || (ph.phase === 'result' && tn - resultAt > 2500);
    const want = unlocked && !previewMuted && !ph.paused && settings.bgMusicEnabled !== false && resting;
    const cur = (ph.round || 0) % lobbyTracks.length;
    lobbyTracks.forEach((tr, i) => {
      const target = want && i === cur ? tr.gain : 0;
      // lên nhanh vừa (≈1 s), xuống nhanh hơn (≈0,6 s) khi vào ván
      tr.vol += (target - tr.vol) * Math.min(1, dt * (target > tr.vol ? 2.5 : 4.5));
      if (target === 0 && tr.vol < 0.01) {
        tr.vol = 0;
        if (!tr.el.paused) {
          tr.el.pause();
          tr.el.currentTime = 0; // lần nghỉ sau phát lại từ đầu bài
        }
        return;
      }
      if (!tr.wired) tr.wired = audio.connectMusic(tr.el);
      tr.el.volume = Math.max(0, Math.min(1, tr.vol));
      if (tr.el.paused) tr.el.play().catch(() => {});
    });
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
  // Không hiện chữ báo đèn: người chơi tự nhìn búp bê quay đầu / nghe câu hát dứt
  function onLightChange(light, roundStart) {
    if (light === 'green' && roundStart && unlocked) audio.countdownGo();
    if (light === 'warn' && unlocked && !ph.song) audio.warn();
    if (light !== 'warn') syncMusic();
  }

  function onPhaseChange(phase) {
    if (phase === 'result') resultAt = performance.now();
    if (phase !== 'play') banner = null;
    if (phase === 'lobby' || phase === 'play') purgeAt = 0;
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
          // Đèn đỏ: tia mắt búp bê khoá vào người bị loại
          // đèn đỏ: đã nháy đỏ từ sự kiện "spotted" → giờ lính bắn
          if (e.cause === 'purge' || e.cause === 'red' || e.cause === 'shove') shootAt(s, t0);
          const hitAt = t0 + (e.cause === 'red' || e.cause === 'purge' ? 120 : 0);
          burst(p.x, p.y - PH * 0.45, '#ff3b6b', 16, hitAt);
          addSprite('fx_spark', p.x, p.y - PH * 0.45, 40, 130, 380, hitAt);
          if (e.cause === 'stomp') {
            // bị khổng lồ dẫm: bụi tung, chữ "Bẹp!"
            addSprite('fx_smoke', p.x, p.y - 12, 40, 150, 700, t0);
            fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.1, text: 'Bẹp!', color: '#ffd43b', size: 30, t0, life: 1000 });
          } else if (e.cause !== 'purge') fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.3, text: 'Loại!', color: '#ff6b6b', size: 30, t0: hitAt, life: 1100 });
        }
        if (e.name) pushTicker(`❌ Số ${e.num} ${e.name} bị loại`);
        break;
      case 'fakeTurn': {
        // búp bê quay mặt (1 s) rồi "Đùa thôi!" — không ai bị bắn
        const dy = FY - DOLL_H - 40;
        fx.push({ type: 'text', x: W / 2, y: dy, text: 'HÙ!', color: '#ff4d6d', size: 56, t0: t0 + 900, life: 900 });
        fx.push({ type: 'text', x: W / 2, y: dy, text: 'ĐÙA THÔI 😜', color: '#ffd43b', size: 46, t0: t0 + 1800, life: 1400 });
        break;
      }
      case 'dollSleep':
        banner = { text: '😴 NGỦ GẬT!', color: '#4dabf7', until: t0 + (e.ms || 6000) };
        fx.push({ type: 'text', x: W / 2, y: FY - DOLL_H - 40, text: 'CHẠY MAU!', color: '#bfe3ff', size: 46, t0, life: 1800 });
        syncMusic();
        break;
      case 'revive':
        for (const id of e.ids || []) {
          const r = sprites.get(id);
          if (!r) continue;
          const p = spritePos(r);
          burst(p.x, p.y - PH * 0.45, '#69db7c', 18, t0);
          fx.push({ type: 'ring', x: p.x, y: p.y, r: 40, color: '#69db7c', flat: true, t0, life: 700 });
          fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.3, text: 'Hồi sinh!', color: '#69db7c', size: 30, t0, life: 1500 });
        }
        break;
      case 'stomp': {
        // Khổng lồ dẫm: chạy theo đường server tính (qua các chỗ đông người); server xét ai bị dẫm theo thời gian thực
        const path = (e.path || []).map((n) => ({ ...project(n.x, n.y), t: n.t }));
        if (path.length > 1) stompers.push({ t0, path, frame: -1 });
        break;
      }
      case 'say':
        // bình luận của người chơi (vạch xuất phát / đang chạy / xem kết quả)
        if (s) s.say = { text: e.text, until: t0 + (e.ms || 6000) };
        break;
      case 'spotted':
        // Búp bê thấy người còn động sau ân hạn: tia mắt khoá vào, nháy đỏ, hết e.ms thì server loại (sự kiện "out")
        if (s) {
          const p = spritePos(s);
          s.spotUntil = t0 + (e.ms || 1200) + 300;
          if (unlocked) audio.eyeServo(true);
          laserLocks.push({ id: s.id, x: p.x, y: p.y - PH * 0.45, t0, until: t0 + (e.ms || 1200) });
        }
        break;
      case 'finish':
        if (unlocked) audio.finish(e.rank);
        if (s) {
          const p = project(s.x, TRACK);
          addSprite('fx_aura', p.x, p.y - 30, 60, 220, 900, t0);
          for (let i = 0; i < 30; i++) fx.push({ type: 'confetti', x: p.x, y: p.y, vx: (Math.random() - 0.5) * 10, vy: -4 - Math.random() * 8, hue: Math.random() * 360, t0, life: 1600 });
        }
        pushTicker(`🏁 Số ${e.num} ${e.name} về đích hạng ${e.rank}`);
        break;
      case 'gift':
        if (unlocked) audio.gift(e.itemKind);
        giftBanner = { name: e.name, gift: e.gift, count: e.count, emoji: e.emoji, label: e.label, kind: e.itemKind, held: e.held, until: t0 + 3000 };
        if (s && !e.held) giftFx(s, e.itemKind, e.count || 1, t0);
        break;
      case 'giftApply':
        // quà tặng lúc nhạc dừng: búp bê bắt đầu hát câu sau thì kỹ năng mới có tác dụng
        if (s) giftFx(s, e.itemKind, e.count || 1, t0);
        break;
      case 'buffalo':
        // Lính canh gần nhất giương súng bắn từng người bị chọn, cách nhau một nhịp
        (e.ids || []).forEach((id, i) => {
          const v = sprites.get(id);
          if (v) shootAt(v, t0 + i * 220);
        });
        break;
      case 'record':
        recordFlash = { name: e.name, until: t0 + 4000 };
        if (s) {
          const p = spritePos(s);
          fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.6, text: e.rank === 1 ? 'KỈ LỤC MỚI #1!' : `KỈ LỤC #${e.rank}!`, color: '#ffd43b', size: 28, t0, life: 1800 });
        }
        break;
      case 'purge':
        // Hết giờ: lính dàn hàng tiến vào sân, các phát bắn đến theo từng sự kiện "out"
        purgeAt = t0;
        purgeMarch = e.marchMs || 1300;
        banner = { text: '⏱ HẾT GIỜ', color: '#ff4040', until: t0 + 3500 };
        if (unlocked) audio.warn();
        break;
      case 'wind':
        // Búp bê hét: sóng âm tím lan xuống sân, người dẫn đầu bị hất lùi
        for (let i = 0; i < 4; i++) fx.push({ type: 'wave', x: W / 2, y: FY - DOLL_H * 0.82, t0: t0 + i * 180, life: 1300 });
        dollShout = t0 + 1200;
        for (const id of e.ids || []) {
          const v = sprites.get(id);
          if (!v) continue;
          const p = spritePos(v);
          addSprite('fx_smoke', p.x, p.y - 10, 30, 90, 700, t0 + 350);
          fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.3, text: 'Lùi!', color: '#d0a2ff', size: 24, t0: t0 + 350, life: 900 });
        }
        break;
      case 'chicken':
        for (const id of e.ids || []) {
          const v = sprites.get(id);
          if (!v) continue;
          const p = spritePos(v);
          addSprite('fx_smoke', p.x, p.y - PH * 0.4, 40, 150, 650, t0);
          for (let i = 0; i < 3; i++) addSprite('fx_feather', p.x + (Math.random() - 0.5) * 40, p.y - PH * 0.5, 50, 140, 1100, t0 + i * 90, (Math.random() - 0.5) * 2);
          fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.4, text: 'Cục tác!', color: '#ffe066', size: 28, t0, life: 1400 });
        }
        break;
      case 'shove': {
        // bị đẩy ngã: chữ "Bị đẩy!", bụi, nháy đỏ tới lúc lính bắn (sự kiện "out" cause shove)
        if (s) {
          const p = spritePos(s);
          s.spotUntil = t0 + (e.ms || 1200) + 300;
          addSprite('fx_smoke', p.x, p.y - 10, 30, 120, 600, t0);
          fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.4, text: 'Bị đẩy!', color: '#ffa94d', size: 28, t0, life: 1300 });
        }
        const g = e.from && sprites.get(e.from);
        if (g) {
          const gp = spritePos(g);
          fx.push({ type: 'text', x: gp.x, y: gp.y - PH * 1.4, text: 'Trượt tay!', color: '#ffe066', size: 22, t0, life: 1100 });
        }
        break;
      }
      case 'chickenBlocked':
        // người dẫn đầu vừa bị hoá gà, đang được miễn
        for (const id of e.ids || []) {
          const v = sprites.get(id);
          if (!v) continue;
          const p = spritePos(v);
          addSprite('fx_shield', p.x, p.y - PH * 0.5, 20, PH * 1.3, 600, t0);
          fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.4, text: 'Miễn gà!', color: '#ffe066', size: 24, t0, life: 1200 });
        }
        break;
      case 'teamShield': {
        const pts = (e.ids || []).map((id) => sprites.get(id)).filter(Boolean).map(spritePos);
        if (pts.length) {
          const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
          const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
          addSprite('fx_shield', cx, cy - 40, 80, 420, 900, t0, 0, 0.9);
          pts.forEach((p, i) => addSprite('fx_shield', p.x, p.y - PH * 0.5, 20, PH * 1.5, 500, t0 + 200 + i * 40));
        }
        break;
      }
      case 'shieldSave':
        if (s) {
          const p = spritePos(s);
          if (unlocked) audio.shieldSave();
          addSprite('fx_shield', p.x, p.y - PH * 0.5, PH * 1.4, PH * 2.6, 500, t0);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            fx.push({ type: 'shard', x: p.x, y: p.y - PH * 0.5, vx: Math.cos(a) * (4 + Math.random() * 4), vy: Math.sin(a) * (4 + Math.random() * 4) - 2, rot: a, t0, life: 700 });
          }
          fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.45, text: 'Khiên đỡ!', color: '#74c0fc', size: 28, t0, life: 1200 });
        }
        break;
      default:
        break;
    }
  }

  // Hiệu ứng ngay trên người tặng quà
  function giftFx(s, kind, count, t0) {
    const p = spritePos(s);
    const cy = p.y - PH * 0.5;
    switch (kind) {
      case 'turbo':
        s.turboUntil = Math.max(s.turboUntil || 0, t0) + 2500 * Math.min(count, 5);
        addSprite('fx_aura', p.x, p.y - 20, 30, 150, 500, t0);
        fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.4, text: 'TĂNG TỐC!', color: '#ffb703', size: 28, t0, life: 1100 });
        break;
      case 'shield':
        addSprite('fx_shield', p.x, cy, 10, PH * 1.9, 450, t0);
        fx.push({ type: 'ring', x: p.x, y: cy, r: PH * 0.9, color: '#74c0fc', t0, life: 600 });
        break;
      case 'giant':
        addSprite('fx_aura', p.x, p.y - 60, 60, 320, 900, t0);
        fx.push({ type: 'ring', x: p.x, y: p.y, r: 140, color: '#ffd43b', flat: true, t0, life: 700 });
        fx.push({ type: 'text', x: p.x, y: p.y - PH * 2.6, text: 'KHỔNG LỒ!', color: '#ffd43b', size: 34, t0, life: 1300 });
        break;
      case 'clones':
        fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.4, text: 'Phân thân!', color: '#9ff0b9', size: 26, t0, life: 1100 });
        break;
      case 'crowd':
        for (let i = 0; i < 5; i++) addSprite('fx_smoke', p.x + (Math.random() - 0.5) * 160, p.y - 20, 30, 120, 700, t0 + i * 60);
        fx.push({ type: 'text', x: p.x, y: p.y - PH * 1.5, text: '×5 BẢN SAO!', color: '#9ff0b9', size: 30, t0, life: 1400 });
        break;
      default:
        break;
    }
  }

  // Lính gần nhất (tại thời điểm bắn) giương súng: chớp lửa nòng, đạn vạch sáng, tia lửa chỗ trúng
  function shootAt(v, at) {
    const p = spritePos(v);
    const ty = p.y - PH * 0.45;
    let best = null;
    let bd = Infinity;
    for (const gd of GUARDS) {
      const gp = guardPos(gd, at);
      const d = Math.hypot(gp.x - p.x, (gp.y - p.y) * 0.6);
      if (d < bd) {
        bd = d;
        best = { gd, gp };
      }
    }
    const { gd, gp } = best;
    gd.fireAt = at;
    const mx = gp.x + GUARD_H * 0.22;
    const my = gp.y - GUARD_H * 0.55;
    fx.push({ type: 'shot', x0: mx, y0: my, x1: p.x, y1: ty, t0: at, life: 520 });
    addSprite('fx_flash', mx, my, 30, 80, 160, at);
    addSprite('fx_spark', p.x, ty, 30, 120, 360, at + 110);
    burst(p.x, ty, '#ffd166', 10, at + 110);
  }

  function guardPos(gd, tn) {
    if (!purgeAt) return { x: gd.x, y: gd.y, bob: 0 };
    const k = Math.max(0, Math.min(1, (tn - purgeAt) / purgeMarch));
    const e = k * k * (3 - 2 * k);
    return { x: gd.x + (gd.tx - gd.x) * e, y: gd.y + (gd.ty - gd.y) * e, bob: k > 0 && k < 1 ? Math.abs(Math.sin(tn / 80)) * 5 : 0 };
  }

  function addSprite(img, x, y, s0, s1, life, t0, spin = 0, a0 = img === 'fx_smoke' ? 0.5 : 1) {
    fx.push({ type: 'sprite', img, x, y, s0, s1, life, t0, spin, a0 });
  }
  function burst(x, y, color, n, t0) {
    for (let i = 0; i < n; i++) fx.push({ type: 'spark', x, y, vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 7, color, t0, life: 700 + Math.random() * 300 });
  }

  // --------------------------------------------------------------------------
  // Sân nhìn từ trên cao: y (0 = xuất phát, 100 = đích), x (0..1 trái → phải). Không co theo chiều sâu.
  // --------------------------------------------------------------------------
  function project(x, y, s) {
    const f = Math.max(0, Math.min(1, y / TRACK));
    let px = FX0 + x * (FX1 - FX0);
    let py = SY - (SY - FY) * f;
    let scale = 1;
    // Người đã về đích đứng thành hàng trên lối đi sau vạch đích
    if (s && s.f) {
      const i = s.f - 1;
      const side = i % 2 === 0 ? -1 : 1;
      const col = Math.floor(i / 2);
      px = W / 2 + side * (95 + (col % 10) * 42);
      py = FY - 4 - Math.floor(col / 10) * 22;
      scale = 0.72;
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
    // Ảnh nền đã kéo sẵn cho vạch đích ở FY, vạch xuất phát ở SY
    if (ready(IMG.bg)) g.drawImage(IMG.bg, 0, 0, W, H);
    else {
      g.fillStyle = '#1b2140';
      g.fillRect(0, 0, W, H);
    }
    // Đèn đỏ: sân ửng hồng
    if (ph.phase === 'play' && ph.light === 'red') {
      g.fillStyle = `rgba(255,30,80,${0.06 + 0.03 * Math.sin(t / 250)})`;
      g.fillRect(0, FY, W, SY - FY + 30);
    }
  }

  // --------------------------------------------------------------------------
  // Búp bê: 5 khung xoay (0 = quay lưng … 4 = quay mặt). Quay mặt trong lúc báo trước, quay lưng khi xanh.
  // --------------------------------------------------------------------------
  let dollPos = 0;
  let dollShout = 0;
  let dollEyes = []; // toạ độ mắt trên màn hình (khung có mặt)
  const laserLocks = []; // tia mắt khoá vào người bị loại
  // Quay đầu chậm kiểu máy (khớp tiếng servo doll_turn / doll_back): bắt đầu 1 giây trước khi câu hát dứt, xong đúng lúc dứt
  const TURN_MS = 1000;
  const BACK_MS = 700; // quay lưng lại khi bắt đầu hát
  const ease = (k) => k * k * (3 - 2 * k);
  // Bắt đầu quay mặt ra / quay lưng lại: tiếng máy (gọi qua updateDoll)
  let dollPrev = 0;
  function dollSound() {
    if (unlocked && dollPrev <= 0.02 && dollPos > 0.02) audio.dollTurn(TURN_MS / 1000);
    else if (unlocked && dollPrev >= 3.98 && dollPos < 3.98) audio.dollTurn(BACK_MS / 1000, true);
    dollPrev = dollPos;
  }
  function updateDoll(dt) {
    turnDoll(dt);
    dollSound();
  }
  function turnDoll(dt) {
    const back = () => (dollPos = Math.max(0, dollPos - (dt * 4) / (BACK_MS / 1000)));
    if (ph.phase !== 'play') return back();
    if (ph.light === 'red') {
      dollPos = Math.min(4, dollPos + (dt * 4) / (TURN_MS / 1000));
      return;
    }
    // giả vờ quay: quay mặt ra, nhìn một lúc rồi quay lưng lại hát tiếp (không bắn)
    if (faking()) {
      if (now() < ph.fake.at + ph.fake.ms - BACK_MS) dollPos = Math.min(4, dollPos + (dt * 4) / (TURN_MS / 1000));
      else back();
      return;
    }
    if (ph.song) {
      const k = (now() - (ph.song.startAt + ph.song.durationMs - TURN_MS)) / TURN_MS;
      if (k > 0) dollPos = Math.max(dollPos, 4 * ease(Math.min(1, k)));
      else back();
      return;
    }
    // không có câu hát: quay trong lúc báo trước
    if (ph.light === 'warn') dollPos = Math.min(4, dollPos + (dt * 4) / (((ph.warnMs || 2000) * 0.75) / 1000));
    else back();
  }

  function drawDollFrame(i, cx, base, alpha, shake) {
    const im = IMG[`doll_${i}`];
    if (!ready(im) || alpha <= 0) return null;
    const h = DOLL_H;
    const w = (im.naturalWidth / im.naturalHeight) * h;
    g.globalAlpha = alpha;
    g.drawImage(im, cx - w / 2 + shake, base - h, w, h);
    g.globalAlpha = 1;
    const eyes = MAN[`doll_${i}`] && MAN[`doll_${i}`][2];
    return eyes ? eyes.map(([ex, ey]) => ({ x: cx - w / 2 + shake + ex * w, y: base - h + ey * h, a: alpha })) : null;
  }

  function drawGuard(gd, tn) {
    const im = IMG[gd.img];
    if (!ready(im)) return;
    const gp = guardPos(gd, tn);
    const h = GUARD_H;
    const w = (im.naturalWidth / im.naturalHeight) * h;
    const since = tn - gd.fireAt;
    const recoil = since >= 0 && since < 160 ? (1 - since / 160) * 4 : 0;
    g.fillStyle = 'rgba(0,0,0,0.32)';
    g.beginPath();
    g.ellipse(gp.x, gp.y, w * 0.42, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(im, gp.x - w / 2, gp.y - h + recoil - gp.bob, w, h);
  }
  function drawGuards() {
    // Lúc xử người chơi, lính đứng giữa sân nên được vẽ chung thứ tự xa–gần với người chơi
    if (purgeAt) return;
    const tn = performance.now();
    for (const gd of GUARDS) drawGuard(gd, tn);
  }

  function drawDoll(t) {
    const cx = W / 2;
    const base = FY - 22;
    drawGuards(t);
    const tn = performance.now();
    const shake = tn < dollShout ? Math.sin(tn / 25) * 3 : 0;
    // bóng
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(cx, base, 70, 14, 0, 0, Math.PI * 2);
    g.fill();
    // Khung hiện tại + hoà mềm sang khung kế ở giữa đoạn chuyển
    const i0 = Math.min(4, Math.floor(dollPos));
    const frac = dollPos - i0;
    const mix = ease(Math.max(0, Math.min(1, (frac - 0.35) / 0.3)));
    const e0 = drawDollFrame(i0, cx, base, 1, shake);
    const e1 = i0 < 4 && mix > 0 ? drawDollFrame(i0 + 1, cx, base, mix, shake) : null;
    dollEyes = (mix > 0.5 ? e1 : e0) || [];
    // ngủ gật: chữ Z bay lên từ đầu búp bê
    if (ph.phase === 'play' && sleeping()) {
      for (let k = 0; k < 3; k++) {
        const ph2 = ((tn / 1400 + k / 3) % 1);
        g.globalAlpha = Math.sin(ph2 * Math.PI);
        text('Z', cx + 40 + ph2 * 50, base - DOLL_H - 10 - ph2 * 70, { size: 26 + ph2 * 22, weight: 900, color: '#bfe3ff', stroke: 4 });
      }
      g.globalAlpha = 1;
    }
    // Mắt đỏ phát sáng khi đã thấy mặt
    if (dollEyes.length) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const e of dollEyes) {
        const r = 13 * (1 + 0.2 * Math.sin(t / 90));
        const glow = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
        glow.addColorStop(0, 'rgba(255,220,220,0.95)');
        glow.addColorStop(0.35, 'rgba(255,40,40,0.8)');
        glow.addColorStop(1, 'rgba(255,0,0,0)');
        g.fillStyle = glow;
        g.beginPath();
        g.arc(e.x, e.y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  }

  // Tia laser từ hai mắt: quét sân lúc đèn đỏ, khoá vào người phạm luật
  function drawBeam(x0, y0, x1, y1, power, t) {
    const fl = 0.85 + 0.15 * Math.sin(t / 23 + x0);
    for (const [w, c] of [
      [22 * power, 'rgba(255,0,40,0.16)'],
      [9 * power, 'rgba(255,30,60,0.5)'],
      [3 * power, 'rgba(255,235,235,0.95)']
    ]) {
      g.strokeStyle = c;
      g.lineWidth = w * fl;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
  }
  function drawSpot(x, y, power, t) {
    const r = 46 * power;
    const spot = g.createRadialGradient(x, y, 0, x, y, r);
    spot.addColorStop(0, 'rgba(255,240,240,0.9)');
    spot.addColorStop(0.25, 'rgba(255,40,70,0.6)');
    spot.addColorStop(1, 'rgba(255,0,40,0)');
    g.fillStyle = spot;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    // vòng ngắm xoay
    g.strokeStyle = 'rgba(255,80,110,0.85)';
    g.lineWidth = 2;
    const a = t / 300;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(x, y, r * 0.7, r * 0.32, 0, a + (i * Math.PI) / 2, a + (i * Math.PI) / 2 + 0.9);
      g.stroke();
    }
  }
  const eyeScan = { from: { x: W / 2, y: (FY + SY) / 2 }, to: { x: W / 2, y: (FY + SY) / 2 }, cur: { x: W / 2, y: (FY + SY) / 2 }, at: 0, next: 0 };
  function drawLasers(t) {
    const tn = performance.now();
    for (let i = laserLocks.length - 1; i >= 0; i--) if (laserLocks[i].until < tn) laserLocks.splice(i, 1);
    const scanning = ph.phase === 'play' && ph.light === 'red' && !ph.purging && dollPos > 3.9;
    if ((!scanning && !laserLocks.length) || !dollEyes.length) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    // điểm quét: mắt người máy giật từng nhịp tới chỗ mới (kèm tiếng servo), giữa các nhịp rung nhẹ
    if (scanning && tn >= eyeScan.next) {
      eyeScan.from = eyeScan.cur;
      eyeScan.to = { x: FX0 + 40 + Math.random() * (FX1 - FX0 - 80), y: FY + 110 + Math.random() * (SY - FY - 170) };
      eyeScan.at = tn;
      eyeScan.next = tn + 800 + Math.random() * 700;
      if (unlocked) audio.eyeServo();
    }
    if (!scanning) eyeScan.next = 0;
    const k = ease(Math.min(1, (tn - eyeScan.at) / 170));
    eyeScan.cur = { x: eyeScan.from.x + (eyeScan.to.x - eyeScan.from.x) * k, y: eyeScan.from.y + (eyeScan.to.y - eyeScan.from.y) * k };
    const sx = eyeScan.cur.x + Math.sin(t / 37) * 2;
    const sy = eyeScan.cur.y + Math.cos(t / 43) * 2;
    dollEyes.forEach((e, i) => {
      const lock = laserLocks.length ? laserLocks[i % laserLocks.length] : null;
      let tx = sx + (i ? 10 : -10);
      let ty = sy;
      let power = 1;
      if (lock) {
        const v = sprites.get(lock.id);
        const p = v ? spritePos(v) : null;
        tx = p ? p.x : lock.x;
        ty = p ? p.y - PH * 0.45 : lock.y;
        const k = (tn - lock.t0) / 120;
        power = 1.6;
        if (k < 1) {
          // tia lao nhanh từ điểm quét tới mục tiêu
          tx = sx + (tx - sx) * k;
          ty = sy + (ty - sy) * k;
        }
      }
      drawBeam(e.x, e.y, tx, ty, power, t);
      drawSpot(tx, ty, power, t);
    });
    g.restore();
  }

  // --------------------------------------------------------------------------
  // Người chơi
  // --------------------------------------------------------------------------
  // Đang chạy: vừa tiến lên, hoặc nhạc đã dừng mà vẫn thả tim (chạy tại chỗ tới khi ngừng tim hoặc bị bắn)
  const isMoving = (s, tn) => s.a && !s.f && (tn - s.lastMoveAt < 350 || tn < (s.actUntil || 0));

  function drawPerson(s, t) {
    const p = spritePos(s);
    const tn = performance.now();
    // bị phát hiện: còn đứng nháy đỏ một lúc rồi mới ngã
    const flashing = !s.a && tn < (s.flashUntil || 0);
    // búp bê đã thấy (server báo "spotted"): nháy đỏ cho tới khi bị bắn
    const spotted = s.a && !s.f && tn < (s.spotUntil || 0);
    const dead = !s.a && !flashing;
    const deadAt = Math.max(s.deadSeenAt || 0, s.flashUntil || 0);
    const moving = isMoving(s, tn);
    const v = variantOf(s.h);
    // mỗi kiểu nhân vật một chiều cao (bé gái nơ hồng thấp, anh tóc xù cao…)
    const hf = (MAN.heights && MAN.heights[v]) || 1;
    const size = PH * p.scale * (s.gi ? 2 : 1) * (s.k ? 1 : hf);
    const cyc = (s.anim * Math.PI) / 2;
    const x = p.x + (moving ? Math.sin(cyc) * 1.5 : 0);
    const y = p.y;
    const bob = moving ? -Math.abs(Math.sin(cyc)) * size * 0.035 : 0;
    const turbo = !dead && (s.turboUntil || 0) > tn;
    g.save();
    let alpha = s.c ? 0.6 : 1;
    if (dead && deadAt) alpha *= Math.max(0.35, 1 - (tn - deadAt) / 5000);
    g.globalAlpha = alpha;

    // Hào quang khổng lồ / vệt lửa tăng tốc (cộng sáng, dưới chân)
    if (!dead && s.gi && ready(IMG.fx_aura)) {
      g.globalCompositeOperation = 'lighter';
      const a = size * 1.1;
      g.globalAlpha = alpha * (0.45 + 0.15 * Math.sin(t / 160));
      g.drawImage(IMG.fx_aura, x - a / 2, y - a * 0.75, a, a);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha;
    }
    if (turbo && moving && ready(IMG.fx_trail)) {
      const im = IMG.fx_trail;
      const len = size * (0.9 + 0.2 * Math.sin(t / 40 + s.id));
      const tw = (im.naturalWidth / im.naturalHeight) * len;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = alpha * 0.9;
      g.drawImage(im, x - tw / 2, y - size * 0.25, tw, len);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha;
    }

    // bóng
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(x, y, size * 0.24, size * 0.07, 0, 0, Math.PI * 2);
    g.fill();

    // Chọn khung
    let key;
    let refKey;
    let fit = 1;
    if (s.k && !dead) {
      key = moving ? (Math.floor(s.anim) % 2 ? 'c_run1' : 'c_run2') : 'c_stand';
      refKey = 'c_stand';
      fit = 0.85;
    } else {
      let f = 'stand';
      if (flashing || spotted) f = RUN[Math.floor(tn / 90) % 4];
      else if (dead) f = tn - deadAt < 220 ? 'freeze' : 'dead';
      else if (moving) f = RUN[Math.floor(s.anim) % 4];
      else if (ph.phase === 'play' && ph.light === 'red' && !s.f) f = s.id % 2 && ready(IMG[`v${v}_freeze2`]) ? 'freeze2' : 'freeze';
      key = `v${v}_${f}`;
      refKey = `v${v}_stand`;
    }
    const im = IMG[key];
    let w = size * 0.5;
    let h = size;
    let top = y - size;
    if (ready(im)) {
      const ref = (MAN[refKey] && MAN[refKey][1]) || im.naturalHeight;
      const k = (size * fit) / ref;
      w = im.naturalWidth * k;
      h = im.naturalHeight * k;
      // thở nhẹ khi đứng yên
      const breathe = !moving && !dead ? 1 + 0.012 * Math.sin(t / 420 + s.id) : 1;
      h *= breathe;
      top = y - h + bob;
      if (flashing || spotted) {
        // vòng đỏ dưới chân + nhấp nháy đỏ
        const on = Math.floor(tn / 110) % 2 === 0;
        g.fillStyle = `rgba(255,30,60,${on ? 0.55 : 0.25})`;
        g.beginPath();
        g.ellipse(x, y, size * 0.45, size * 0.14, 0, 0, Math.PI * 2);
        g.fill();
        if (on) g.filter = 'sepia(1) saturate(9) hue-rotate(-45deg) brightness(0.95)';
      } else if (dead) g.filter = tn - deadAt < 220 ? 'brightness(2.4) saturate(0.4)' : 'grayscale(0.8) brightness(0.8)';
      g.drawImage(im, x - w / 2, top, w, h);
      g.filter = 'none';
      // số trên miếng vải sau lưng
      const patch = (MAN[key] && MAN[key][2]) || (key[0] === 'v' ? [0.5, 0.42, 0.34] : null);
      if (patch && !Array.isArray(patch[0]) && w * patch[2] > 9) {
        const fs = Math.max(9, Math.min(w * patch[2] * 0.6, h * 0.15));
        g.fillStyle = '#111';
        g.font = `900 ${fs}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(s.num), x - w / 2 + patch[0] * w, top + patch[1] * h + fs * 0.04);
      }
    }

    // khiên: bong bóng lục giác cộng sáng
    if (s.s > 0 && !dead && ready(IMG.fx_shield)) {
      const d = Math.max(w, h) * (1.3 + 0.04 * Math.sin(t / 200 + s.id));
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = alpha * (0.55 + 0.15 * Math.sin(t / 260 + s.id));
      g.drawImage(IMG.fx_shield, x - d / 2, top + h / 2 - d / 2, d, d);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha;
    }
    // tên (người bị loại chỉ hiện tên thêm một lúc cho đỡ rối)
    if (s.n && !s.f && (!dead || tn - deadAt < 2500)) {
      const fs = Math.round(18 * (s.gi ? 1.4 : 1));
      s.headX = x;
      s.headY = top - fs * 1.1;
      s.headAt = tn; // đầu đang được vẽ ở khung này (bình luận chỉ hiện trên người đang hiện tên)
      // người máy lấp chỗ: tên biệt danh, chữ hơi xám xanh để khác người xem thật một chút
      text(s.n, x, top - fs * 0.55, { size: fs, weight: 400, color: flashing || spotted ? '#ff6b6b' : dead ? '#bbb' : s.b ? '#d6e2ec' : '#fff', stroke: 3 });
    }
    g.restore();
  }

  function drawHeader(t) {
    // hai bảng nhỏ hai bên búp bê, nằm trong vùng an toàn (không bị TikTok che / cắt mép); không có đèn — nhìn búp bê
    g.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(SAFE_L, TOP_Y, 240, HEAD_H, 18);
    g.fill();
    roundRect(SAFE_R - 240, TOP_Y, 240, HEAD_H, 18);
    g.fill();

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
    const LX = SAFE_L + 120;
    text(`VÁN ${ph.round || 0}`, LX, TOP_Y + 22, { size: 28, weight: 900, color: '#ffd43b', stroke: 4 });
    text(`🏃${alive}  🏁${fin}  ❌${out}`, LX, TOP_Y + 51, { size: 20, weight: 700 });

    // Đồng hồ / trạng thái
    const remain = Math.max(0, Math.ceil((ph.phaseEndsAt - now()) / 1000));
    const TX = SAFE_R - 120;
    if (ph.phase === 'play') {
      const mm = String(Math.floor(remain / 60)).padStart(2, '0');
      const ss = String(remain % 60).padStart(2, '0');
      text(ph.purging ? 'HẾT GIỜ' : 'THỜI GIAN CÒN', TX, TOP_Y + 13, { size: 14, color: ph.purging ? '#ff6b6b' : '#ddd', weight: 700 });
      text(`${mm}:${ss}`, TX, TOP_Y + 44, { size: 44, weight: 900, color: remain <= 10 ? '#ff6b6b' : '#fff', stroke: 5 });
    } else if (ph.phase === 'lobby') {
      text('VÁN MỚI SAU', TX, TOP_Y + 13, { size: 14, color: '#ddd' });
      text(`${remain}s`, TX, TOP_Y + 44, { size: 44, weight: 900, color: '#ffd43b', stroke: 5 });
    } else {
      text('KẾT QUẢ', TX, TOP_Y + 36, { size: 38, weight: 900, color: '#ffd43b', stroke: 5 });
    }
    if (ph.paused) text('TẠM DỪNG', TX, TOP_Y + HEAD_H - 6, { size: 15, color: '#ffa94d', weight: 900 });
  }

  // Chỉ còn nhãn "hết giờ": nhỏ, nằm thay dòng chữ chạy dưới vạch xuất phát để không che người chơi
  const bannerOn = () => ph.phase === 'play' && banner && performance.now() < banner.until;
  // Lúc chờ ván: bảng luật chơi giữa sân (người chơi đứng ở vạch xuất phát nên giữa sân trống)
  function drawRules(t) {
    const cx = W / 2;
    const top = FY + 70;
    const w = 760;
    const h = 500;
    const cmt = typeof settings.commentLikes === 'number' ? settings.commentLikes : 2;
    g.save();
    g.fillStyle = 'rgba(14,16,32,0.82)';
    roundRect(cx - w / 2, top, w, h, 28);
    g.fill();
    g.strokeStyle = 'rgba(255,79,154,0.75)';
    g.lineWidth = 3;
    roundRect(cx - w / 2, top, w, h, 28);
    g.stroke();
    text('LUẬT CHƠI', cx, top + 50, { size: 44, weight: 900, color: '#ffd43b', stroke: 6 });
    const beat = 1 + 0.08 * Math.max(0, Math.sin(t / 120)); // tim đập nhanh: nhắc nhấp thật nhanh
    const rows = [
      { icon: '🎵', a: 'Nhạc lên:', b: 'NHẤP THẢ TIM THẬT NHANH để chạy', color: '#8ce99a', pulse: true },
      ...(cmt > 0 ? [{ icon: '💬', a: 'Bình luận khi nhạc lên:', b: `chạy nhanh hơn (1 bình luận = ${cmt} tim)`, color: '#ff8fbf' }] : []),
      { icon: '✋', a: 'DỪNG thả tim', b: 'TRƯỚC KHI nhạc dừng', color: '#ffd43b' },
      { icon: '🎯', a: 'Nhạc dừng mà tim vẫn về:', b: 'búp bê thấy, lính BẮN', color: '#ff6b6b' },
      { icon: '🏁', a: 'Về đích trước khi hết giờ', b: 'để sống sót', color: '#74c0fc' }
    ];
    rows.forEach((r, i) => {
      const y = top + 118 + i * 72;
      g.save();
      g.translate(cx - w / 2 + 70, y);
      if (r.pulse) g.scale(beat, beat);
      text(r.icon, 0, 0, { size: 40 });
      g.restore();
      text(r.a, cx - w / 2 + 120, y - 15, { size: 26, weight: 700, color: '#fff', align: 'left', stroke: 3 });
      text(r.b, cx - w / 2 + 120, y + 17, { size: 28, weight: 900, color: r.color, align: 'left', stroke: 4 });
    });
    text(`Thả ${queueNeed} tim hoặc bình luận để vào chơi`, cx, top + h - 28, { size: 24, weight: 700, color: '#ff8fbf', stroke: 3 });
    g.restore();
  }

  function drawBanner(t) {
    if (ph.phase === 'lobby') return drawRules(t);
    if (ph.phase === 'result') return drawResults();
    if (!bannerOn()) return;
    const on = Math.floor(t / 300) % 2 === 0;
    g.fillStyle = on ? 'rgba(220,20,50,0.92)' : 'rgba(120,10,30,0.92)';
    roundRect(W / 2 - 100, TICK_Y - 15, 200, 30, 15);
    g.fill();
    text(banner.text, W / 2, TICK_Y + 1, { size: 20, weight: 900, color: '#fff' });
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

  const clip = (str, n) => (str.length > n ? `${str.slice(0, n - 1)}…` : str);
  // Bảng vinh danh (khung cúp vàng vẽ bằng Scenario): tiêu đề trên ruy băng, 5 hàng có huy chương 1–5
  const PANEL_TOP = 384;
  const PANEL_H = 660;
  const PLATE = [
    ['rgba(255,214,74,0.38)', 'rgba(201,138,0,0.18)'],
    ['rgba(220,228,240,0.32)', 'rgba(140,150,170,0.14)'],
    ['rgba(232,150,92,0.34)', 'rgba(150,80,40,0.14)']
  ];
  function drawRankPanel(title, rows, { empty, footer, shine } = {}) {
    const im = IMG.ui_panel;
    const meta = (MAN.ui_panel && MAN.ui_panel[2]) || { ribbon: [0.258, 0.312], inner: [0.335, 0.915] };
    const h = PANEL_H;
    const w = ready(im) ? (h * im.naturalWidth) / im.naturalHeight : h * 0.7;
    const x0 = W / 2 - w / 2;
    const top = PANEL_TOP;
    if (ready(im)) g.drawImage(im, x0, top, w, h);
    else {
      g.fillStyle = 'rgba(10,20,50,0.95)';
      roundRect(x0, top, w, h, 30);
      g.fill();
    }
    // ánh lấp lánh quanh cúp
    if (shine) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const a = shine / 600 + i;
        const sx = W / 2 + Math.cos(a * 1.7) * w * 0.28;
        const sy = top + h * 0.12 + Math.sin(a * 2.3) * h * 0.06;
        const r = 4 + 3 * Math.sin(shine / 150 + i);
        g.fillStyle = 'rgba(255,240,180,0.85)';
        g.beginPath();
        g.arc(sx, sy, Math.max(1, r), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    text(title, W / 2, top + (h * (meta.ribbon[0] + meta.ribbon[1])) / 2, { size: 30, weight: 900, color: '#fff', stroke: 5 });
    const y0 = top + h * meta.inner[0] + 6;
    const y1 = top + h * meta.inner[1] - (footer ? 46 : 8);
    const rowH = (y1 - y0) / 5;
    if (!rows.length && empty) text(empty, W / 2, (y0 + y1) / 2, { size: 24, weight: 700, color: '#cfd8ff' });
    rows.slice(0, 5).forEach((r, i) => {
      const cy = y0 + rowH * (i + 0.5);
      const px = x0 + w * 0.09;
      const pw = w * 0.82;
      const grad = g.createLinearGradient(px, 0, px + pw, 0);
      const [c0, c1] = PLATE[i] || ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.03)'];
      grad.addColorStop(0, c0);
      grad.addColorStop(1, c1);
      g.fillStyle = grad;
      roundRect(px, cy - rowH * 0.42, pw, rowH * 0.84, rowH * 0.3);
      g.fill();
      const b = IMG[`ui_rank${i + 1}`];
      const bh = rowH * (i === 0 ? 1.0 : 0.86);
      const bx = px + w * 0.09;
      if (ready(b)) {
        const bw = (bh * b.naturalWidth) / b.naturalHeight;
        g.drawImage(b, bx - bw / 2, cy - bh / 2, bw, bh);
        const ny = cy - bh / 2 + bh * ((MAN[`ui_rank${i + 1}`] && MAN[`ui_rank${i + 1}`][2]) || 0.45);
        text(String(i + 1), bx, ny, { size: bh * 0.3, weight: 900, color: i < 3 ? '#5a3a00' : '#fff', stroke: i < 3 ? 0 : 3 });
      } else text(String(i + 1), bx, cy, { size: 28, weight: 900 });
      const nx = px + w * 0.2;
      text(clip(r.name, 15), nx, cy - (r.sub ? 10 : 0), { size: i === 0 ? 28 : 25, weight: 700, color: i === 0 ? '#ffe38a' : '#fff', align: 'left', stroke: 3 });
      if (r.sub) text(r.sub, nx, cy + 17, { size: 16, weight: 500, color: '#ffd8a8', align: 'left' });
      if (r.value) text(r.value, px + pw - 14, cy, { size: 22, weight: 900, color: '#ffe38a', align: 'right', stroke: 3 });
    });
    if (footer) text(footer, W / 2, top + h * meta.inner[1] - 26, { size: 22, weight: 700, color: '#9ff0b9' });
  }

  // Kết quả ván: 5 người về đích nhanh nhất ván này
  function drawResults() {
    const fin = results.filter((r) => r.rank);
    let total = 0; // kết quả chỉ gửi top 10 — đếm người về đích trên sân
    for (const s of sprites.values()) if (s.f && !s.c) total++;
    drawRankPanel(
      `KẾT QUẢ VÁN ${ph.round || ''}`.trim(),
      fin.map((r) => ({ name: r.name, sub: `Số ${r.num}`, value: `${(r.ms / 1000).toFixed(1)}s` })),
      { empty: 'Không ai sống sót', footer: total ? `${total} người sống sót` : '', shine: performance.now() }
    );
  }

  // Thanh quà ngay trên vùng bình luận; khi có người tặng quà, thanh đổi thành dòng cảm ơn 3 giây
  function drawLegend(t) {
    const y = LEGEND_Y;
    const x0 = SAFE_L;
    const w = SAFE_R - SAFE_L;
    if (giftBanner && performance.now() < giftBanner.until) {
      const k = Math.min(1, (performance.now() - (giftBanner.until - 3000)) / 200);
      g.globalAlpha = k;
      g.fillStyle = 'rgba(255,255,255,0.94)';
      roundRect(x0, y + 10, w, 76, 38);
      g.fill();
      const count = giftBanner.count > 1 ? ` ×${giftBanner.count}` : '';
      const ic = IMG[ICON_OF[giftBanner.kind]];
      if (ready(ic)) {
        const sc = 60 / Math.max(ic.naturalWidth, ic.naturalHeight);
        g.drawImage(ic, x0 + 48 - (ic.naturalWidth * sc) / 2, y + 52 - (ic.naturalHeight * sc) / 2, ic.naturalWidth * sc, ic.naturalHeight * sc);
      }
      text(`${giftBanner.name} tặng ${giftBanner.gift}${count}`, x0 + 92, y + 34, { size: 26, weight: 900, color: '#222', align: 'left' });
      text(`→ ${giftBanner.label}${giftBanner.held ? ' (dùng khi búp bê hát lại)' : ''}`, x0 + 92, y + 66, { size: 24, weight: 700, color: '#c2255c', align: 'left' });
      g.globalAlpha = 1;
      return;
    }
    const items = legend.length ? legend : [];
    g.fillStyle = 'rgba(0,0,0,0.62)';
    roundRect(x0, y, w, 100, 22);
    g.fill();
    const cw = w / Math.max(1, items.length);
    const fitImg = (im, cx, cy, size) => {
      const sc = size / Math.max(im.naturalWidth, im.naturalHeight);
      g.drawImage(im, cx - (im.naturalWidth * sc) / 2, cy - (im.naturalHeight * sc) / 2, im.naturalWidth * sc, im.naturalHeight * sc);
    };
    items.forEach((it, i) => {
      const x = x0 + i * cw + cw / 2;
      // kỹ năng
      const ic = IMG[ICON_OF[it.kind]];
      if (ready(ic)) fitImg(ic, x, y + 20, 34);
      else text(it.emoji, x, y + 20, { size: 28 });
      const lab = it.short || it.label;
      g.font = `900 16px ${FONT}`;
      const fsz = Math.max(10, Math.min(16, Math.floor((16 * (cw - 6)) / g.measureText(lab).width)));
      text(lab, x, y + 46, { size: fsz, weight: 900, color: '#ffe066', stroke: 3 });
      // quà TikTok để tặng (ảnh thật của TikTok) đặt ngay dưới
      const gi = IMG[`gift_${it.kind}`];
      g.fillStyle = 'rgba(255,255,255,0.08)';
      roundRect(x - cw / 2 + 6, y + 57, cw - 12, 38, 12);
      g.fill();
      if (ready(gi)) fitImg(gi, x - cw / 2 + 21, y + 76, 26);
      const gw = cw - 44; // chỗ cho tên quà bên phải ảnh quà
      g.font = `700 11px ${FONT}`;
      const gsz = Math.max(8, Math.min(11, Math.floor((11 * gw) / g.measureText(it.gift).width)));
      text(it.gift, ready(gi) ? x - cw / 2 + 36 : x, y + 76, { size: gsz, weight: 700, color: '#ffd8a8', align: ready(gi) ? 'left' : 'center' });
    });
  }

  // --------------------------------------------------------------------------
  // Người giữ kỉ lục (về đích nhanh nhất): 10 người đứng sát chân tường dưới tán cây, trái → phải theo hạng,
  // trên đầu có tên và số giây. Ai phá kỉ lục thì chen vào đúng chỗ.
  // --------------------------------------------------------------------------
  const REC_X = [128, 206, 284, 362, 440, 640, 718, 796, 874, 952];
  let recordFlash = null; // { name, until }
  function drawRecords(t) {
    const list = ph.records || [];
    const tn = performance.now();
    list.slice(0, REC_X.length).forEach((r, i) => {
      const x = REC_X[i];
      const v = variantOf(r.h);
      const im = IMG[`v${v}_stand`];
      const hf = (MAN.heights && MAN.heights[v]) || 1;
      const hgt = 48 * hf;
      const fresh = recordFlash && recordFlash.name === r.n && tn < recordFlash.until;
      if (fresh || i === 0) {
        // hào quang: người nhất luôn có, kỉ lục mới thì sáng rực vài giây
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = fresh ? 0.6 + 0.3 * Math.sin(t / 90) : 0.35;
        if (ready(IMG.fx_aura)) g.drawImage(IMG.fx_aura, x - 34, REC_FEET - 62, 68, 68);
        g.restore();
      }
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(x, REC_FEET, 13, 4, 0, 0, Math.PI * 2);
      g.fill();
      let top = REC_FEET - hgt;
      if (ready(im)) {
        const k = hgt / im.naturalHeight;
        const hh = im.naturalHeight * k * (1 + 0.015 * Math.sin(t / 420 + i));
        top = REC_FEET - hh;
        g.drawImage(im, x - (im.naturalWidth * k) / 2, top, im.naturalWidth * k, hh);
      }
      text(`${(r.ms / 1000).toFixed(1)}s`, x, top - 8, { size: 15, weight: 900, color: i < 3 ? '#ffd43b' : '#9ff0b9', stroke: 3 });
      text(clip(r.n, 9), x, top - 24, { size: 13, weight: 500, color: '#fff', stroke: 3 });
    });
  }

  // Dòng chữ chạy ngay trên thanh kỹ năng: cách chơi cơ bản + giới thiệu ngắn từng kỹ năng
  const TICK_Y = 1170;
  const TICK_SPEED = 85; // px/giây
  function marqueeParts() {
    const parts = [
      { text: `❤️ Thả ${queueNeed} tim hoặc bình luận để tham gia` },
      { text: '🎵 Nhạc lên: nhấp thả tim thật nhanh để chạy' },
      ...(settings.commentLikes === 0 ? [] : [{ text: `💬 Bình luận khi nhạc lên để chạy nhanh hơn (1 bình luận = ${settings.commentLikes ?? 2} tim)` }]),
      { text: '✋ Dừng thả tim TRƯỚC khi nhạc dừng, tim về lúc nhạc tắt là bị bắn' },
      { text: '⏱ Hết giờ chưa về đích cũng bị bắn' },
      { text: '🎁 Quà tặng lúc nhạc dừng: búp bê hát lại mới có tác dụng (khiên, bản sao có ngay)' }
    ];
    for (const it of legend) parts.push({ icon: `gift_${it.kind}`, text: `${it.gift} → ${it.label}${it.desc ? `: ${it.desc}` : ''}` });
    return parts;
  }
  function drawMarquee(t) {
    if (bannerOn()) return;
    const x0 = SAFE_L;
    const w = SAFE_R - SAFE_L;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(x0, TICK_Y - 12, w, 24, 12);
    g.fill();
    g.beginPath();
    g.rect(x0 + 8, TICK_Y - 12, w - 16, 24);
    g.clip();
    g.font = `500 16px ${FONT}`;
    const parts = marqueeParts();
    const gapW = 44;
    const widths = parts.map((p) => g.measureText(p.text).width + (p.icon ? 24 : 0));
    const total = widths.reduce((a, b) => a + b + gapW, 0);
    let x = x0 + w - ((t / 1000) * TICK_SPEED) % (total + w);
    for (let rep = 0; rep < 2; rep++) {
      parts.forEach((p, i) => {
        if (x < x0 + w && x + widths[i] > x0) {
          let tx = x;
          const im = p.icon && IMG[p.icon];
          if (im && ready(im)) {
            g.drawImage(im, x, TICK_Y - 10, 20, 20);
            tx += 24;
          }
          text(p.text, tx, TICK_Y + 1, { size: 16, weight: 500, color: '#fff', align: 'left' });
          g.font = `500 16px ${FONT}`;
        }
        x += widths[i];
        if (x < x0 + w) text('•', x + gapW / 2, TICK_Y + 1, { size: 16, weight: 900, color: '#ff4f9a' });
        x += gapW;
      });
    }
    g.restore();
  }

  // Hàng chờ ván sau: đứng dãn đều một hàng dưới thanh kỹ năng để đọc được tên
  const QY = 1300; // dòng chữ tiêu đề
  const QFEET = 1410; // chừa chỗ cho bong bóng bình luận trên đầu // chân người đứng chờ
  const QMAX = 10;
  function drawQueue(t) {
    if (ph.phase === 'lobby' || !queueList.length) return;
    text('⏳ HÀNG CHỜ VÁN SAU', SAFE_L + 6, QY, { size: 17, weight: 900, color: '#ffd43b', align: 'left', stroke: 3 });
    text(`bình luận / thả ${queueNeed} ❤️ để giữ chỗ`, SAFE_R - 6, QY, { size: 15, weight: 500, color: '#fff', align: 'right', stroke: 3 });
    const more = queueList.length > QMAX ? queueList.length - (QMAX - 1) : 0;
    const shown = more ? queueList.slice(0, QMAX - 1) : queueList;
    const slots = shown.length + (more ? 1 : 0);
    const gap = Math.min(150, (SAFE_R - SAFE_L) / Math.max(slots, 4)); // dãn đủ để đọc tên, không chạm tiêu đề
    const x0 = W / 2 - (gap * slots) / 2 + gap / 2;
    shown.forEach((q, i) => {
      const x = x0 + i * gap;
      const v = variantOf(q.h);
      const im = IMG[`v${v}_stand`];
      const hf = (MAN.heights && MAN.heights[v]) || 1;
      const hgt = 50 * hf;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(x, QFEET, 14, 4, 0, 0, Math.PI * 2);
      g.fill();
      let top = QFEET - hgt;
      if (ready(im)) {
        const k = hgt / im.naturalHeight;
        const breathe = 1 + 0.015 * Math.sin(t / 420 + i);
        const hh = im.naturalHeight * k * breathe;
        top = QFEET - hh;
        g.drawImage(im, x - (im.naturalWidth * k) / 2, top, im.naturalWidth * k, hh);
      }
      text(clip(q.n, 10), x, top - 9, { size: 15, weight: 400, color: '#fff', stroke: 3 });
    });
    // bong bóng vẽ sau cùng để nằm trên người bên cạnh
    shown.forEach((q, i) => {
      const say = queueSays.get(q.n);
      if (!say || say.until < performance.now()) return;
      const v = variantOf(q.h);
      const hgt = 50 * ((MAN.heights && MAN.heights[v]) || 1);
      // hẹp hơn khoảng cách hai người để bong bóng cạnh nhau không đè lên nhau
      drawBubble(x0 + i * gap, QFEET - hgt - 22, say.text, say.until, Math.max(90, gap - 26));
    });
    if (more) {
      const x = x0 + shown.length * gap;
      g.fillStyle = 'rgba(255,45,120,0.85)';
      roundRect(x - 30, QFEET - 44, 60, 32, 16);
      g.fill();
      text(`+${more}`, x, QFEET - 28, { size: 18, weight: 900, color: '#fff' });
    }
  }

  // Khổng lồ dẫm (Scenario: cướp biển chân gỗ gầy ốm, 6 khung chạy khập khiễn nhìn ngang, mặt quay sang phải):
  // chạy chậm theo đường server gửi, quay mặt theo hướng chạy; khung 1 (giày chạm đất) và 3 (chân gỗ nện xuống) → bụi + "thịch"
  const stompers = [];
  const GIANT_FRAME_MS = 150;
  const GIANT_H = PH * 3.3; // cướp biển gầy cao lêu nghêu
  function drawStompers(t) {
    const tn = performance.now();
    for (let i = stompers.length - 1; i >= 0; i--) {
      const st = stompers[i];
      const age = tn - st.t0;
      const end = st.path[st.path.length - 1].t;
      if (age > end + 200) {
        stompers.splice(i, 1);
        continue;
      }
      // vị trí theo thời gian trên đường gấp khúc (khớp thời điểm server loại người)
      let j = 1;
      while (j < st.path.length - 1 && st.path[j].t < age) j++;
      const a = st.path[j - 1];
      const b = st.path[j];
      const k = Math.max(0, Math.min(1, (age - a.t) / Math.max(1, b.t - a.t)));
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k;
      const face = b.x >= a.x ? 1 : -1;
      const frame = Math.floor(age / GIANT_FRAME_MS) % 6;
      if (frame !== st.frame) {
        st.frame = frame;
        if (frame === 0 || frame === 2) {
          addSprite('fx_smoke', x + face * 30, y - 4, 40, 150, 550, tn);
          if (unlocked) audio.stompStep();
        }
      }
      const im = IMG[`giant_run${frame + 1}`];
      if (!ready(im)) continue;
      const h = GIANT_H;
      const w = (im.naturalWidth / im.naturalHeight) * h;
      g.save();
      g.globalAlpha = Math.min(1, (age + 150) / 150, (end + 200 - age) / 200);
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.beginPath();
      g.ellipse(x, y, w * 0.42, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.translate(x, y);
      g.scale(face, 1);
      g.drawImage(im, -w / 2, -h, w, h);
      g.restore();
    }
  }

  // Bong bóng lời nói: đáy (mũi nhọn) ở (x, y), tự xuống dòng tối đa 2 dòng, mờ dần lúc sắp hết
  function drawBubble(x, y, str, until, maxW = 230) {
    const tn = performance.now();
    const fs = 15;
    g.save();
    g.globalAlpha = Math.max(0, Math.min(1, (until - tn) / 250));
    g.font = `500 ${fs}px ${FONT}`;
    const lines = [];
    let cur = '';
    for (const w of str.split(' ')) {
      const t = cur ? `${cur} ${w}` : w;
      if (g.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    lines.push(cur);
    for (let i = 0; i < lines.length; i++) while (lines[i].length > 1 && g.measureText(lines[i]).width > maxW) lines[i] = `${lines[i].slice(0, -2)}…`;
    if (lines.length > 2) lines.splice(2, lines.length, `${lines[1].slice(0, -1)}…`);
    const bw = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width))) + 20;
    const bh = lines.length * (fs + 4) + 10;
    const bx = Math.max(SAFE_L, Math.min(SAFE_R - bw, x - bw / 2));
    const by = y - 7 - bh;
    g.fillStyle = 'rgba(255,255,255,0.55)'; // nền trong suốt: không che sân / người phía sau
    roundRect(bx, by, bw, bh, 12);
    g.fill();
    g.beginPath();
    g.moveTo(x - 6, by + bh - 1);
    g.lineTo(x, y);
    g.lineTo(x + 6, by + bh - 1);
    g.fill();
    lines.forEach((l, i) => text(l, bx + bw / 2, by + 5 + (fs + 4) * i + (fs + 4) / 2, { size: fs, weight: 500, color: '#222' }));
    g.restore();
  }

  // Nhạc vừa cất lên: chữ "TAP TAP" trong suốt giật giật ở góc phải khu hàng chờ — chỗ ngón tay người xem hay chạm để thả tim
  const TAP_MS = 2800;
  function drawTapHint(t) {
    if (ph.phase !== 'play' || ph.purging || !ph.song || ph.light === 'red') return;
    const age = now() - ph.song.startAt;
    if (age < 0 || age > TAP_MS) return;
    const beat = (age % 360) / 360; // mỗi nhịp một cú "chạm"
    const pop = 1 + 0.18 * Math.max(0, 1 - beat * 3);
    const fade = Math.min(1, age / 150, (TAP_MS - age) / 400);
    const jx = (Math.random() - 0.5) * 8;
    const jy = (Math.random() - 0.5) * 8;
    g.save();
    g.globalAlpha = 0.55 * fade;
    g.translate(SAFE_R - 115 + jx, QFEET - 52 + jy);
    g.rotate((Math.random() - 0.5) * 0.12);
    g.scale(pop, pop);
    text('TAP TAP', 0, -22, { size: 46, weight: 900, color: '#ffffff', stroke: 6 });
    text('❤️ 👆', 0, 26, { size: 38, weight: 900 });
    g.restore();
  }

  // Bình luận của người chơi hiện trên đầu: màn chờ hiện hết; lúc chạy chỉ hiện SAYS_MAX lời mới nhất cho sân đỡ rối
  const SAYS_MAX = 8;
  function drawSays() {
    const tn = performance.now();
    let says = [...sprites.values()].filter((s) => s.say && s.say.until > tn && s.headY && tn - (s.headAt || 0) < 300);
    if (ph.phase !== 'lobby') says = says.sort((a, b) => b.say.until - a.say.until).slice(0, SAYS_MAX);
    // người phía trên sân vẽ trước để bong bóng người phía dưới (gần màn hình hơn) đè lên
    says.sort((a, b) => a.headY - b.headY);
    for (const s of says) drawBubble(s.headX, s.headY, s.say.text, s.say.until, ph.phase === 'lobby' ? 230 : 190);
  }

  function drawFx(t) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      const age = t - e.t0;
      if (age < 0) continue;
      if (age > e.life) {
        fx.splice(i, 1);
        continue;
      }
      const k = age / e.life;
      g.globalAlpha = 1 - k;
      if (e.type === 'spark' || e.type === 'confetti') {
        const x = e.x + e.vx * age * 0.06;
        const y = e.y + e.vy * age * 0.06 + 0.0004 * age * age;
        g.fillStyle = e.type === 'spark' ? e.color || '#ff3b6b' : `hsl(${e.hue},90%,60%)`;
        g.fillRect(x - 3, y - 3, e.type === 'spark' ? 6 : 9, e.type === 'spark' ? 6 : 9);
      } else if (e.type === 'shard') {
        const x = e.x + e.vx * age * 0.06;
        const y = e.y + e.vy * age * 0.06 + 0.0003 * age * age;
        g.save();
        g.translate(x, y);
        g.rotate(e.rot + age / 90);
        g.fillStyle = 'rgba(160,220,255,0.9)';
        g.beginPath();
        g.moveTo(0, -7);
        g.lineTo(5, 4);
        g.lineTo(-5, 4);
        g.closePath();
        g.fill();
        g.restore();
      } else if (e.type === 'text') {
        text(e.text, e.x, e.y - k * 40, { size: e.size, weight: 900, color: e.color, stroke: 5 });
      } else if (e.type === 'ring') {
        g.strokeStyle = e.color || '#74c0fc';
        g.lineWidth = 4 * (1 - k) + 1;
        g.beginPath();
        if (e.flat) g.ellipse(e.x, e.y, e.r * (0.3 + k), e.r * 0.4 * (0.3 + k), 0, 0, Math.PI * 2);
        else g.arc(e.x, e.y, e.r * (0.6 + k), 0, Math.PI * 2);
        g.stroke();
      } else if (e.type === 'sprite') {
        const im = IMG[e.img];
        if (ready(im)) {
          const sz = e.s0 + (e.s1 - e.s0) * (1 - Math.pow(1 - k, 3));
          const r = im.naturalWidth / im.naturalHeight;
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = e.a0 * (1 - k * k);
          g.translate(e.x, e.y - (e.img === 'fx_feather' ? k * 40 : 0));
          g.rotate(e.spin * k);
          g.drawImage(im, (-sz * r) / 2, -sz / 2, sz * r, sz);
          g.restore();
        }
      } else if (e.type === 'shot') {
        // đạn vạch sáng bay từ nòng súng tới mục tiêu
        const fly = 110;
        if (age < fly + 60) {
          const a = Math.min(1, age / fly);
          const b = Math.max(0, a - 0.35);
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 1;
          g.strokeStyle = 'rgba(255,220,120,0.95)';
          g.lineWidth = 4;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(e.x0 + (e.x1 - e.x0) * b, e.y0 + (e.y1 - e.y0) * b);
          g.lineTo(e.x0 + (e.x1 - e.x0) * a, e.y0 + (e.y1 - e.y0) * a);
          g.stroke();
          g.restore();
        }
      } else if (e.type === 'wave') {
        const im = IMG.fx_wave;
        const ww = 160 + k * 1000;
        const y = e.y + k * 560;
        if (ready(im)) {
          const hh = ww * (im.naturalHeight / im.naturalWidth) * 0.55;
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.drawImage(im, e.x - ww / 2, y - hh / 2, ww, hh);
          g.restore();
        } else {
          g.strokeStyle = '#c77dff';
          g.lineWidth = 8 * (1 - k) + 2;
          g.beginPath();
          g.ellipse(e.x, y, ww / 2, ww / 6, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
  }

  let lastFrame = performance.now();
  function frame(t) {
    const dt = Math.min(0.1, (t - lastFrame) / 1000);
    lastFrame = t;
    const tn = performance.now();
    for (const s of sprites.values()) {
      s.dy += (s.ty - s.dy) * Math.min(1, dt * 10);
      // nhịp chân theo tốc độ: tăng tốc chạy nhanh hơn, khổng lồ sải dài hơn
      if (isMoving(s, tn)) s.anim += dt * ((s.turboUntil || 0) > tn ? 13 : 8.5) * (s.gi ? 0.7 : 1);
    }
    updateDoll(dt);
    songTick();
    lobbyMusicTick();
    finalCountdown();

    g.clearRect(0, 0, W, H);
    drawBackground(t);
    drawRecords(t);
    drawDoll(t);
    // Vẽ xa trước, gần sau
    const list = [...sprites.values()].map((s) => ({ y: spritePos(s).y, s }));
    if (purgeAt) for (const gd of GUARDS) list.push({ y: guardPos(gd, tn).y, gd });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.gd) drawGuard(it.gd, tn);
      else drawPerson(it.s, t);
    }
    drawStompers(t);
    drawLasers(t);
    drawFx(t);
    drawSays();
    drawHeader(t);
    drawBanner(t);
    drawMarquee(t);
    drawLegend(t);
    drawQueue(t);
    drawTapHint(t);
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
        case 'rl.queue':
          setQueue(p.queue || []);
          queueNeed = p.need || queueNeed;
          break;
        case 'rl.act':
          for (const id of p.ids || []) {
            const s = sprites.get(id);
            if (s) s.actUntil = performance.now() + 1300; // tim TikTok về theo gói ~1,2 giây
          }
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
