const { sanitizeUserName, isBlockedSpamOrToxic, sanitizeWishText } = require('../../util/sanitize');
const { LEGEND, BY_GIFT_ID, itemForGift } = require('./items');
const EN = require('./i18n-en');
const ttsEn = require('./tts-en');
const { createSim } = require('./sim');
const { CUTS, MODES, MODE_NAMES, planSong } = require('./song');
const { ViewerBoard } = require('../../core/viewers');
const { badgeOf, recordWithAwards, awardLine } = require('../../core/titles');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// ============================================================================
// CHẾ ĐỘ "ĐÈN XANH – ĐÈN ĐỎ" — game sinh tồn tương tác (xem docs/phong-den-do-den-xanh.md)
//   lobby  : bình luận để vào game, đứng ở vạch xuất phát
//   play   : đèn xanh → (báo trước) → đèn đỏ → đèn xanh… Thả tim / bình luận để chạy;
//            đèn đỏ mà còn động (sau thời gian ân hạn) là bị loại
//   result : top về đích, rồi ván mới
// Server là nguồn sự thật duy nhất: vị trí, sống/chết, thời điểm đổi đèn.
// ============================================================================

const TRACK = 120; // độ dài sân (đơn vị) — 6 hàng gạch trên nền, mỗi hàng 20 đơn vị
const TICK_MS = 100;
const FART_DAZE_MS = 1800; // thả boom: choáng váng chừng này rồi lính bắn
const FAKE_TURN_MS = 2600; // búp bê giả vờ quay: quay mặt 1 s + nhìn 0,9 s + quay lưng 0,7 s
const DOLL_SLEEP_MS = 6000; // búp bê ngủ gật
const REVIVE_MAX = 5; // hồi sinh tối đa mấy người mỗi lần bấm
const BASE_SPEED = 5.8; // đơn vị/giây khi chạy (≈ 21 giây đèn xanh liên tục để về đích; bù cho đèn đỏ 8–11 s)
// Số bước tim được dồn tối đa (≈ 6 giây chạy). Bước dồn KHÔNG mất khi đèn đỏ: hình TikTok tới người xem chậm 2–5 giây,
// tim bấm lúc họ còn thấy xanh/vàng về server khi đã đỏ — giữ lại để chạy tiếp ở đèn xanh sau.
// Mô phỏng với đèn xanh theo câu hát (2,6–9 giây tuỳ tốc độ), người thả tim hết công suất, dừng khi búp bê bắt đầu
// quay đầu, trễ 1–4,5 giây: về đích ~64–67 giây / ván 90 giây; người thả tim liên tục bất chấp đèn vẫn bị loại 100%.
const MAX_PENDING = 28;
const MAX_LIKE_STEP = 10; // bước tối đa cho một gói tim (TikTok gộp tim ~1,2 giây/gói)
// Hai giới hạn trên tính cho "Bước mỗi lượt tim" 0,8; tăng bước mỗi tim (dễ hơn, đỡ mỏi tay) thì nới giới hạn tương ứng
const BASE_STEP_PER_LIKE = 0.8;
// Live thật (11/2026): tim của người dừng đúng lúc vẫn về server 4–6 s sau khi nhạc dừng (hình trễ + phản xạ + TikTok gộp tim
// + LikeBatcher), trong khi đo từ đầu câu hát có thể chỉ ra 0,3–1,8 s vì người chơi bấm trước nhịp. Nên: ân hạn tối thiểu 5 s,
// bỏ mẫu < 1,5 s, lấy mẫu LỚN NHẤT gần đây; đèn đỏ 8–11 s để người thả tim bất chấp vẫn bị bắt sau ân hạn.
const GRACE_MIN = 5000;
const GRACE_MAX = 9000;
const GRACE_MARGIN = 2500;
const LAG_SAMPLE_MIN = 1500;
// Bị búp bê phát hiện: nháy đỏ trên màn hình chừng này rồi mới bị bắn (mỗi lần nháy đỏ là một phát bắn)
const SPOT_MS = 1200;
// Hết ván: chỉ giữ người chơi có tương tác trong chừng này trước lúc vào màn chờ (ai rời live thì tự bị gỡ)
const KEEP_ACTIVE_MS = 45000;
// Khổng lồ dẫm: cướp biển chân gỗ chạy khập khiễn một đường ngẫu nhiên xuyên sân, vòng qua 3 chỗ đông người.
// Xét va chạm theo thời gian thực (mỗi nhịp game): ai đang đứng sát bàn chân lúc nó đi qua thì bị dẫm — kịp chạy
// ra khỏi đường thì thoát. Đo theo điểm ảnh trên màn hình (sân rộng 740 px, cao 702 px cho 120 đơn vị) để khớp hình.
const STOMP_FIELD_W = 740;
const STOMP_PX_PER_UNIT = 702 / 120;
const STOMP_SPEED = 230; // px/giây: chậm để người chơi thấy và kịp né
const STOMP_RADIUS = 48; // px: bán kính bàn chân + thân người chơi
const STOMP_WAYPOINTS = 3;
// Hết giờ: lính canh tiến vào sân (PURGE_MARCH_MS) rồi bắn lần lượt mọi người chưa về đích
const PURGE_MARCH_MS = 1300;
const PURGE_SHOOT_MS = 3200; // tổng thời gian bắn (chia đều cho số người), mỗi phát cách nhau tối đa 220ms
const PURGE_TAIL_MS = 1000;
const MAX_CLONES_EACH = 10;
const MAX_CLONES_TOTAL = 300;

const LINES = {
  // trò của người điều phối
  fakeTurn: ['Hù! Đùa thôi, chạy tiếp đi!', 'Giật mình chưa? Đùa đấy!', 'Hù! Ai vừa đứng hình thế?'],
  dollSleep: ['Búp bê ngủ gật rồi! Chạy mau lên!', 'Suỵt, búp bê đang ngáy, chạy nhanh lên nào!'],
  // đọc lúc chờ ván (luân phiên): luật chơi — nhấp tim liên tục, buông tay trước khi nhạc dừng
  lobby: [
    'Luật chơi: bình luận để vào chơi. Nhạc lên thì nhấp thả tim liên tục, nhấp càng nhiều chạy càng xa. Dừng tay trước khi nhạc dừng, nhạc dừng mà tim vẫn về là bị bắn!',
    'Ván mới sắp bắt đầu! Nhạc lên nhấp tim liên tục hoặc bình luận để chạy nhanh hơn, nhạc sắp dừng thì buông tay. Về đích trước khi hết giờ là sống sót!'
  ],
  start: ['Bắt đầu! Đèn xanh, chạy nào!', 'Xuất phát! Thả tim để chạy!'],
  green: ['Đèn xanh!', 'Chạy đi!', 'Đèn xanh, chạy nào!'],
  red: ['Đèn đỏ!', 'Đứng im!', 'Búp bê quay lại rồi, đứng im!', 'Đèn đỏ! Lính canh đang nhìn!'],
  timeUp: ['Hết giờ!'],
  noWinner: ['Ván này không ai sống sót về đích. Ván sau cố lên nhé!']
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);

function create(ctx, saved = {}) {
  const S = () => ctx.settings;
  // Ngôn ngữ phòng: 'vi' (mặc định, giữ nguyên mọi câu chữ cũ) hoặc 'en' (bản tiếng Anh trong i18n-en.js)
  const isEn = () => S().lang === 'en';
  const L = (vi, en) => (isEn() ? en : vi);
  const lines = () => (isEn() ? EN.LINES : LINES);
  const numName = (p) => speakName(p.name) || L(`Số ${p.num}`, `Number ${p.num}`);
  let round = Number(saved.round) || 0;
  let phase = 'lobby';
  let phaseStartedAt = Date.now();
  let phaseEndsAt = Date.now() + S().lobbySeconds * 1000;
  let light = 'green'; // green | warn | red (chỉ có nghĩa trong play)
  let lightStartedAt = Date.now();
  let lightEndsAt = 0;
  let paused = false;
  let purge = null; // { queue: [{ id, at }], endAt } khi đang xử người chưa về đích
  const simBoard = new ViewerBoard(); // bảng kỉ lục của người ảo (không lưu)
  // Hàng chờ ván sau: bình luận lúc đang chơi thì vào hàng chờ; thả đủ tim (queueLikes) mới được đứng giữ chỗ,
  // ván mới bắt đầu thì những người giữ chỗ vào sân theo thứ tự.
  const queue = new Map(); // khoá người xem -> { user, name, likes, ok, okAt, hue }
  let song = null; // câu hát đang phát (đèn xanh): { mode, rates, startAt, durationMs }
  // Trò của người điều phối: búp bê giả vờ quay (câu hát ngừng, quay mặt rồi quay lại, không bắn) / ngủ gật (không hát, không bắn)
  let fake = null; // { at, ms }
  let sleepUntil = 0;
  let nextSongMode = null; // người điều phối chọn kiểu cho lần hát sau
  // Quà tặng lúc nhạc dừng (đèn đỏ): kỹ năng chạy / tấn công để dành, búp bê hát câu sau mới có tác dụng.
  // Khiên, khiên đội, bản sao (bảo vệ) vẫn có tác dụng ngay.
  const DEFER_KINDS = new Set(['turbo', 'fart', 'wind', 'giant', 'chicken', 'stomp']); // đẩy ngã: có tác dụng ngay, kể cả lúc búp bê nhìn
  let heldGifts = []; // [{ id, item, count }]
  let stompers = []; // khổng lồ đang chạy: { giverKey, path, startAt, cap, hit, count }
  const redActs = new Set(); // người vẫn thả tim sau khi nhạc dừng (màn hình vẽ đang chạy tại chỗ)
  let finishCount = 0;
  let results = [];
  let lastWinners = Array.isArray(saved.lastWinners) ? saved.lastWinners.slice(0, 10) : [];
  // Kỉ lục thời gian về đích nhanh nhất (mỗi người 1 dòng, giữ 10 người) — đứng thành hàng dưới tán cây
  const RECORDS_MAX = 10;
  let records = Array.isArray(saved.records) ? saved.records.slice(0, RECORDS_MAX) : [];
  // Đo độ trễ: tài khoản đang đo (không bị bắn lúc đèn đỏ, chỉ ghi số liệu) + nhật ký mỗi lần nhạc dừng
  let measureNames = Array.isArray(saved.measureNames) ? saved.measureNames.slice(0, 10) : [];
  const latency = []; // [{ at, round, name, measured, tailMs, packs, shot, graceMs, lag }] (gần nhất cuối)
  const simRecords = []; // người ảo: không lưu, chỉ để xem thử khi giả lập
  let testActiveUntil = 0; // admin đang chơi thử: cho hiện kỉ lục / bảng của người thử

  const players = new Map(); // id -> người chơi (cả bản sao)
  const byKey = new Map(); // khoá người xem -> id người chơi chính
  let nextId = 1;
  let rosterDirty = true;

  // --------------------------------------------------------------------------
  // Người chơi
  // --------------------------------------------------------------------------
  function viewerKey(u) {
    return String(u.uniqueId || u.user || '').slice(0, 40);
  }

  function freeNumber() {
    const used = new Set();
    for (const p of players.values()) if (!p.cloneOf) used.add(p.num);
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  function realPlayers() {
    return [...players.values()].filter((p) => !p.cloneOf);
  }

  function makePlayer(u) {
    const p = {
      id: nextId++,
      key: viewerKey(u),
      name: sanitizeUserName(u.user || u.uniqueId),
      avatar: u.avatar || '',
      num: freeNumber(),
      cloneOf: 0,
      x: rand(0.06, 0.94),
      y: 0,
      pending: 0,
      alive: true,
      doomAt: 0,
      finishRank: 0,
      shield: 0,
      giantUntil: 0,
      chickenUntil: 0,
      turboUntil: 0,
      lastActiveAt: Date.now(),
      lastChatStepAt: 0,
      hue: Math.floor(Math.random() * 360),
      sim: Boolean(u.sim),
      npc: Boolean(u.npc)
    };
    p.badge = p.npc ? { lv: 1, tt: '' } : badgeOf(((p.sim ? simBoard : ctx.board).peek({ user: p.name, uniqueId: p.key }) || {}).stats || {}, isEn());
    players.set(p.id, p);
    byKey.set(p.key, p.id);
    rosterDirty = true;
    return p;
  }

  function join(u, { announce = true } = {}) {
    const key = viewerKey(u);
    if (!key) return null;
    const existing = byKey.get(key);
    if (existing && players.has(existing)) return players.get(existing);
    if (realPlayers().length >= S().maxPlayers) return null;
    if (phase === 'play' && !S().lateJoin) return null;
    const p = makePlayer(u);
    // vào giữa câu hát (tặng quà): đo trễ từ đầu câu → ân hạn rộng hơn thực tế, không bắn oan lần đầu
    if (phase === 'play' && light !== 'red') p.greenAt = lightStartedAt;
    if (announce) ctx.broadcast('rl.fx', { kind: 'join', id: p.id, name: p.name, num: p.num });
    if (phase === 'lobby' && !p.npc) fillNpcs(); // có người thật vào thì bớt người máy
    return p;
  }

  // --------------------------------------------------------------------------
  // Người máy lấp chỗ: sân ít người thật hơn npcMin thì thêm người máy (biệt danh vui, chữ tên hơi xám) cho đủ,
  // để vừa vào live đã có ván chạy. Người máy chỉ thả tim trong game — không bình luận, không tặng quà,
  // không vào kỉ lục / bảng xếp hạng thật. Có người thật vào lúc chờ ván thì người máy rút bớt tương ứng.
  // --------------------------------------------------------------------------
  // biệt danh kiểu nhân vật game
  const NPC_NAMES = ['Bé Su', 'Tí Đẹp Trai', 'Hai Lúa', 'Mây Lang Thang', 'Sóc Nâu', 'Gió Đồng', 'Bin Bon', 'Nắng Mai', 'Đá Cuội', 'Cún Con',
    'Mèo Mập', 'Gấu Trúc', 'Tèo Em', 'Bông Gòn', 'Ốc Sên', 'Cá Mập Con', 'Bánh Bao', 'Kẹo Dẻo', 'Su Hào', 'Bắp Rang',
    'Chuột Lắt', 'Heo Hồng', 'Vịt Bầu', 'Cà Rốt', 'Mít Ướt', 'Trà Sữa', 'Xoài Non', 'Bí Đỏ', 'Ếch Xanh', 'Thỏ Ngọc'];
  let npcSeq = 0;
  let npcNextAt = 0;
  const lightLog = []; // lịch sử đổi đèn để người máy "thấy" đèn trễ như người xem thật
  function lightAt(t) {
    for (let i = lightLog.length - 1; i >= 0; i--) if (lightLog[i].t <= t) return lightLog[i].light;
    return 'red';
  }
  function npcList() {
    return [...players.values()].filter((p) => p.npc && !p.cloneOf);
  }
  function fillNpcs() {
    const humans = [...players.values()].filter((p) => !p.cloneOf && !p.npc).length;
    const want = S().autoSim ? 0 : Math.max(0, S().npcMin - humans);
    const list = npcList();
    for (const p of list.slice(want)) {
      for (const c of clonesOf(p)) removePlayer(c);
      removePlayer(p);
    }
    for (let i = list.length; i < want; i++) {
      npcSeq = (npcSeq % 999) + 1;
      const used = new Set(npcList().map((x) => x.name));
      const free = (isEn() ? EN.NPC_NAMES : NPC_NAMES).filter((n) => !used.has(n));
      const name = free.length ? free[Math.floor(Math.random() * free.length)] : L(`Máy ${npcSeq}`, `Bot ${npcSeq}`);
      const p = makePlayer({ user: name, uniqueId: `npc_${npcSeq}_${Date.now() % 100000}`, avatar: '', sim: true, npc: true });
      p.npcLag = rand(1000, 3200); // trễ hình như người xem thật
      p.npcEager = rand(0.45, 0.85);
      p.npcReckless = rand(0.002, 0.02); // thỉnh thoảng lỡ tay lúc nhạc dừng → bị bắn cho vui
    }
  }
  function driveNpcs(now) {
    if (now < npcNextAt) return;
    npcNextAt = now + 400;
    for (const p of npcList()) {
      if (!p.alive || p.finishRank || p.doomAt) continue;
      const seen = lightAt(now - p.npcLag);
      if (seen === 'green' || seen === 'warn') {
        if (Math.random() < p.npcEager) move(p, Math.min(maxLikeStep(), (2 + Math.floor(Math.random() * 4)) * S().stepPerLike));
      } else if (Math.random() < p.npcReckless) move(p, S().stepPerLike);
    }
  }

  // Lúc chờ ván: người đứng ở vạch xuất phát bình luận thì hiện trên đầu
  function sayFx(p, raw) {
    const text = sayText(raw);
    if (text) ctx.broadcast('rl.fx', { kind: 'say', id: p.id, text, ms: phase === 'play' ? SAY_PLAY_MS : SAY_MS });
  }
  function queueAdd(u) {
    const key = viewerKey(u);
    if (!key || queue.has(key)) return;
    queue.set(key, { user: u, name: sanitizeUserName(u.user || u.uniqueId), likes: 0, ok: false, okAt: 0, hue: Math.floor(Math.random() * 360) });
  }
  function queueLike(u, count) {
    queueAdd(u);
    const key = viewerKey(u);
    const q = queue.get(key);
    if (!q) return;
    q.likes += count;
    if (q.ok || q.likes < S().queueLikes) return;
    if (phase === 'lobby') {
      // đang chờ ván: đủ tim là vào sân luôn
      queue.delete(key);
      join(u);
      return;
    }
    queueReserve(q);
  }
  // giữ chỗ hàng chờ ván sau (bình luận hoặc thả đủ tim lúc đang chơi / xem kết quả)
  function queueReserve(q) {
    if (q.ok) return;
    q.ok = true;
    q.okAt = Date.now();
    broadcastQueue();
  }
  const SAY_MS = 6000; // bình luận hiện trên đầu người ở hàng chờ / người đứng chờ ván
  const SAY_PLAY_MS = 1000; // lúc đang chạy / xem kết quả: hiện nhanh rồi tắt cho sân đỡ rối
  function sayText(raw) {
    const t = sanitizeWishText(raw);
    return t.length > 42 ? `${t.slice(0, 41)}…` : t;
  }
  function queueView() {
    const now = Date.now();
    return [...queue.values()]
      .filter((q) => q.ok)
      .sort((a, b) => a.okAt - b.okAt)
      .map((q) => (q.say && now - q.sayAt < SAY_MS ? { n: q.name, h: q.hue, s: q.say, sa: now - q.sayAt } : { n: q.name, h: q.hue }));
  }
  function queueSay(u, raw) {
    const q = queue.get(viewerKey(u));
    const text = q && sayText(raw);
    if (!text) return;
    q.say = text;
    q.sayAt = Date.now();
    if (q.ok) broadcastQueue();
  }
  function broadcastQueue() {
    ctx.broadcast('rl.queue', { queue: queueView(), need: S().queueLikes });
  }
  // Ván mới: người giữ chỗ vào sân trước (theo thứ tự đủ tim), người chưa đủ tim thì bỏ (bình luận lại lúc chờ là vào)
  function promoteQueue() {
    const ready = [...queue.values()].filter((q) => q.ok).sort((a, b) => a.okAt - b.okAt);
    queue.clear();
    for (const q of ready) {
      const p = join(q.user, { announce: true });
      if (p) p.hue = q.hue; // giữ nguyên dáng nhân vật lúc đứng chờ
    }
    broadcastQueue();
  }

  function clonesOf(p) {
    return [...players.values()].filter((c) => c.cloneOf === p.id && c.alive && !c.finishRank);
  }

  function addClones(owner, n) {
    let total = [...players.values()].filter((c) => c.cloneOf).length;
    const have = clonesOf(owner).length;
    const add = Math.max(0, Math.min(n, MAX_CLONES_EACH - have, MAX_CLONES_TOTAL - total));
    for (let i = 0; i < add; i++) {
      const c = {
        ...owner,
        id: nextId++,
        cloneOf: owner.id,
        x: Math.max(0.03, Math.min(0.97, owner.x + rand(-0.12, 0.12))),
        y: Math.max(0, owner.y - rand(0, 4)),
        pending: 0,
        shield: 0,
        finishRank: 0
      };
      players.set(c.id, c);
    }
    if (add) rosterDirty = true;
    return add;
  }

  function removePlayer(p) {
    players.delete(p.id);
    if (!p.cloneOf && byKey.get(p.key) === p.id) byKey.delete(p.key);
    rosterDirty = true;
  }

  // --------------------------------------------------------------------------
  // Di chuyển & luật đèn đỏ
  // --------------------------------------------------------------------------
  // Ân hạn riêng từng người theo độ trễ đo được: mỗi lần đèn xanh, đo từ lúc xanh tới lúc gói tim đầu tiên của họ về
  // (= trễ hình + gộp tim + mạng). Tim cuối họ bấm khi còn thấy xanh sẽ về muộn đúng chừng đó sau lúc đỏ.
  // Ân hạn = trung vị 5 lần gần nhất + 1,5 s (3–9 s). Người thả tim liên tục thì đo ra rất nhỏ → vẫn bị bắt.
  const capScale = () => Math.max(1, (S().stepPerLike || BASE_STEP_PER_LIKE) / BASE_STEP_PER_LIKE);
  const maxLikeStep = () => MAX_LIKE_STEP * capScale();
  const maxPending = () => MAX_PENDING * capScale();

  function graceFor(p) {
    // Mặc định: một mức ân hạn chung cho mọi người (graceMinMs). Live thật 11/2026: độ trễ đo lúc bắt đầu câu hát
    // không liên quan tới độ trễ lúc dừng (người bắt đầu thả tim muộn bị đo 7–9 s rồi được nới ân hạn tối đa, bấm lố vẫn sống).
    if (!S().perPlayerGrace) return S().graceMinMs ?? GRACE_MIN;
    const s = p.lagSamples;
    if (!s || !s.length) return Math.max(S().redGraceMs, S().graceMinMs ?? GRACE_MIN);
    // chỉnh được trong cài đặt: graceMinMs (ân hạn tối thiểu), graceMarginMs (cộng thêm vào độ trễ đo được)
    const min = S().graceMinMs ?? GRACE_MIN;
    return Math.max(min, Math.min(Math.max(min, GRACE_MAX), Math.max(...s) + (S().graceMarginMs ?? GRACE_MARGIN)));
  }
  function redArmedFor(p, now = Date.now()) {
    return phase === 'play' && light === 'red' && now >= lightStartedAt + graceFor(p);
  }
  function measureLag(p, now) {
    // đo cả khi tim về lúc đã đỏ: người trễ nhiều hơn độ dài câu hát thì tim đầu tiên luôn về sau khi nhạc dừng
    if (!p.greenAt) return;
    const m = now - p.greenAt;
    p.greenAt = 0;
    if (m > 9000 || m < LAG_SAMPLE_MIN) return; // < 1,5 s: bấm trước nhịp, không phải độ trễ thật
    p.lagSamples = [...(p.lagSamples || []).slice(-4), m];
  }

  // Người chơi vừa "động" (thả tim / bình luận). Trả về true nếu được tiến lên.
  function move(p, units) {
    p.lastActiveAt = Date.now();
    if (phase !== 'play' || paused || !p.alive || p.finishRank || p.doomAt) return false;
    if (units > 0) measureLag(p, Date.now());
    if (light === 'red' && !purge && !p.npc && !p.sim && units > 0) {
      // tim về sau lúc nhạc dừng: ghi lại muộn nhất bao lâu (đo độ trễ thật trên live)
      p.redTail = Math.max(p.redTail || 0, Date.now() - lightStartedAt);
      p.redPacks = (p.redPacks || 0) + 1;
    }
    if (light === 'red' && redArmedFor(p)) {
      if (isMeasured(p)) {
        p.redOverGrace = true; // đang đo: không bắn, chỉ đánh dấu "lẽ ra bị bắn"
      } else if (p.shieldRedAt === lightStartedAt) {
        // khiên đã đỡ 1 phát trong lần búp bê quay lại này: nhấp tiếp thoải mái tới hết đèn đỏ, tim vẫn được cộng
      } else if (p.shield > 0) {
        // Khiên: chịu 1 phát bắn, đổi lại được nhấp tim suốt lần búp bê quay lại này (tim cộng vào bước dồn)
        p.shield--;
        p.shieldRedAt = lightStartedAt;
        logViolation(p, units);
        ctx.broadcast('rl.fx', { kind: 'shieldSave', id: p.id });
        rosterDirty = true;
      } else {
        p.redShot = true;
        logViolation(p, units);
        violate(p);
        return false;
      }
    }
    if (light === 'red') redActs.add(p.id);
    if (units > 0) keepMomentum(p); // có tim về (lúc hát hoặc còn trong ân hạn): giữ đà chạy
    // Khổng lồ: mỗi lượt tim đi gấp đôi (chạy bị giới hạn bởi số tim, không phải tốc độ)
    if (p.giantUntil > Date.now()) units *= 2;
    // Đèn xanh/vàng: chạy ngay. Đỏ trong thời gian ân hạn: dồn lại, chạy khi xanh trở lại
    p.pending = Math.min(p.pending + units, maxPending());
    for (const c of clonesOf(p)) c.pending = Math.min(c.pending + units, maxPending());
    return light !== 'red';
  }

  // --------------------------------------------------------------------------
  // Đo độ trễ tim: mỗi lần đèn đỏ kết thúc, ghi với từng người thật có tim về sau lúc nhạc dừng:
  // tim cuối về muộn bao lâu (tailMs), số gói, có bị bắn không, ân hạn lúc đó. Người trong danh sách đo không bị bắn.
  // --------------------------------------------------------------------------
  const latencyLog = path.join(config.DATA_DIR, 'redlight-latency.log');
  const normName = (x) => String(x || '').trim().replace(/^@/, '').toLowerCase();
  function isMeasured(p) {
    if (!measureNames.length || p.cloneOf) return false;
    const owner = p;
    return measureNames.includes(normName(owner.name)) || measureNames.includes(normName(owner.key));
  }
  function closeRedLatency() {
    const at = Date.now();
    for (const p of players.values()) {
      if (p.cloneOf || p.npc || p.sim || !p.redPacks) continue;
      const row = {
        at: new Date(at).toISOString(),
        round,
        name: p.name,
        measured: isMeasured(p),
        tailMs: p.redTail,
        packs: p.redPacks,
        shot: Boolean(p.redShot),
        overGrace: Boolean(p.redOverGrace),
        graceMs: graceFor(p),
        lag: p.lagSamples || []
      };
      latency.push(row);
      if (latency.length > 300) latency.shift();
      fs.appendFile(latencyLog, JSON.stringify({ room: ctx.roomId, ...row }) + '\n', () => {});
    }
    for (const p of players.values()) {
      p.redTail = 0;
      p.redPacks = 0;
      p.redShot = false;
      p.redOverGrace = false;
    }
  }
  function latencyReport() {
    const byName = new Map();
    for (const r of latency) {
      const e = byName.get(r.name) || { name: r.name, measured: r.measured, reds: 0, tails: [], shots: 0, over: 0, graceMs: 0, lag: [] };
      e.reds++;
      e.tails.push(r.tailMs);
      if (r.shot) e.shots++;
      if (r.overGrace) e.over++;
      e.graceMs = r.graceMs;
      e.lag = r.lag;
      e.measured = e.measured || r.measured;
      byName.set(r.name, e);
    }
    const people = [...byName.values()].map((e) => {
      const sorted = [...e.tails].sort((a, b) => a - b);
      return { ...e, maxTail: sorted[sorted.length - 1] || 0, p90Tail: sorted[Math.floor(sorted.length * 0.9)] || 0, tails: e.tails.slice(-12) };
    });
    // gợi ý: người đang đo (dừng đúng lúc) phải sống → ân hạn tối thiểu = tim muộn nhất của họ + 0,8 s, làm tròn 250 ms
    const ref = people.filter((e) => e.measured);
    const base = (ref.length ? ref : people).reduce((m, e) => Math.max(m, e.maxTail), 0);
    const suggest = base ? Math.min(9000, Math.ceil((base + 800) / 250) * 250) : null;
    return {
      measureNames,
      graceMinMs: S().graceMinMs,
      redMin: S().redMin,
      suggestGraceMinMs: suggest,
      people,
      recent: latency.slice(-30).reverse()
    };
  }

  // Nhật ký mỗi lần bắt lỗi đèn đỏ (người thật) để soát sau buổi live: tim về sau lúc nhạc dừng bao lâu, ân hạn bao nhiêu
  const fairLog = path.join(config.DATA_DIR, 'redlight-fairness.log');
  function logViolation(p, units) {
    if (p.sim) return;
    const now = Date.now();
    const line = {
      at: new Date(now).toISOString(),
      room: ctx.roomId,
      round,
      name: p.name,
      num: p.num,
      afterStopMs: now - lightStartedAt,
      graceMs: graceFor(p),
      lagSamples: p.lagSamples || [],
      units,
      result: p.shield > 0 ? 'shield' : clonesOf(p).length ? 'clone' : 'out'
    };
    fs.appendFile(fairLog, JSON.stringify(line) + '\n', () => {});
  }

  // Đà chạy: TikTok gửi tim rất thưa ở phòng đông (mỗi người 1 đợt / 20–60 s) nên chạy theo từng đợt tim thì nhân vật
  // đứng im phần lớn thời gian. Ai có tim / bình luận về trong momentumSec giây gần nhất thì tự chạy hết tốc lực suốt lúc
  // búp bê hát, nhạc dừng thì tự đứng. Luật bắn giữ nguyên (tim về sau ân hạn lúc đèn đỏ vẫn bị bắn).
  function keepMomentum(p) {
    const sec = S().momentumSec ?? 20;
    if (sec <= 0) return;
    const until = Date.now() + sec * 1000;
    p.momentumUntil = until;
    for (const c of clonesOf(p)) c.momentumUntil = until;
  }

  // Bản sao chết thay chủ (đèn đỏ, bị dẫm, đẩy ngã, lính bắn — trừ hết giờ): trả về bản sao còn sống, không thì chính chủ
  function standIn(v) {
    if (v.cloneOf) return v;
    return clonesOf(v).find((c) => c.alive && !c.doomAt) || v;
  }

  function violate(p) {
    if (!p.alive || p.finishRank) return;
    if (p.shield > 0) {
      p.shield--;
      ctx.broadcast('rl.fx', { kind: 'shieldSave', id: p.id });
      return;
    }
    // có bản sao thì bản sao chết thay; người (hoặc bản sao) bị phát hiện đứng nháy đỏ SPOT_MS rồi bị bắn
    const clone = clonesOf(p).find((c) => c.alive && !c.doomAt);
    spot(clone || p);
  }

  function spot(p) {
    p.doomAt = Date.now() + SPOT_MS;
    p.doomCause = 'red';
    p.pending = 0;
    ctx.broadcast('rl.fx', { kind: 'spotted', id: p.id, ms: SPOT_MS });
  }

  // Cấp độ & danh hiệu (src/core/titles.js): ghi thống kê, đạt cấp / danh hiệu mới thì hiệu ứng + đọc tên
  let lastAwardSayAt = 0;
  function award(p, delta) {
    if (!p || p.npc || p.cloneOf) return;
    const r = recordWithAwards(p.sim ? simBoard : ctx.board, { user: p.name, uniqueId: p.key, avatar: p.avatar }, delta, isEn());
    p.badge = r.badge;
    rosterDirty = true;
    for (const a of r.awards) {
      ctx.broadcast('rl.fx', { kind: 'award', id: p.id, name: p.name, type: a.type, text: a.text, lv: r.badge.lv, tier: a.tier || 0 });
      const now = Date.now();
      if (now - lastAwardSayAt > 4000) {
        lastAwardSayAt = now;
        say(awardLine(speakName(p.name), a, isEn()));
      }
    }
  }

  function eliminate(p, cause) {
    if (!p.alive || p.finishRank) return;
    p.alive = false;
    p.doomAt = 0;
    p.doomCause = '';
    p.pending = 0;
    p.deadAt = Date.now();
    rosterDirty = true;
    ctx.broadcast('rl.fx', { kind: 'out', id: p.id, cause, name: p.cloneOf ? '' : p.name, num: p.num });
    if (!p.cloneOf && cause === 'red') award(p, { stats: { rl_shot: 1 } }); // lỡ tay thả tim lúc đèn đỏ
    if (!p.cloneOf) {
      // Chủ bị loại thì bản sao cũng ngã theo
      for (const c of clonesOf(p)) {
        c.alive = false;
        c.deadAt = Date.now();
      }
    }
  }

  function finish(p) {
    p.y = TRACK;
    p.pending = 0;
    if (p.cloneOf) {
      // Bản sao về đích thì tan biến, không tính hạng
      removePlayer(p);
      return;
    }
    finishCount++;
    p.finishRank = finishCount;
    p.finishMs = Date.now() - phaseStartedAt;
    rosterDirty = true;
    ctx.broadcast('rl.fx', { kind: 'finish', id: p.id, name: p.name, num: p.num, rank: p.finishRank });
    noteRecord(p);
    if (p.finishRank <= 3) {
      const place = ['nhất', 'nhì', 'ba'][p.finishRank - 1];
      const placeEn = ['first', 'second', 'third'][p.finishRank - 1];
      say(L(`Số ${p.num}, ${p.name}, về đích thứ ${place}!`, `Number ${p.num}, ${p.name}, finishes ${placeEn}!`));
      ctx.emitEvent({ type: 'rlFinish', user: p.name, num: p.num, rank: p.finishRank });
    }
  }

  // Ghi kỉ lục: người mới nhanh hơn người thứ 10 thì chen vào, người cũ tự phá kỉ lục của mình thì cập nhật
  function noteRecord(p) {
    const list = p.sim ? simRecords : records;
    const ms = p.finishMs;
    const old = list.find((r) => r.key === p.key);
    if (old && old.ms <= ms) return;
    if (!old && list.length >= RECORDS_MAX && ms >= list[list.length - 1].ms) return;
    if (old) Object.assign(old, { ms, name: p.name, hue: p.hue, at: Date.now() });
    else list.push({ key: p.key, name: p.name, ms, hue: p.hue, at: Date.now() });
    list.sort((a, b) => a.ms - b.ms);
    list.splice(RECORDS_MAX);
    const rank = list.findIndex((r) => r.key === p.key) + 1;
    if (!p.sim) ctx.save();
    ctx.broadcast('rl.fx', { kind: 'record', id: p.id, name: p.name, ms, rank });
    broadcastPhase();
  }
  function recordsView() {
    const testing = S().autoSim || testActiveUntil > Date.now();
    const list = records.length || !testing ? records : simRecords;
    return list.map((r) => ({ n: r.name, ms: r.ms, h: r.hue }));
  }

  // Dọn người ảo + người chơi thử (kèm bản sao của họ) khỏi sân và hàng chờ
  function clearSimPlayers() {
    let changed = false;
    for (const p of [...players.values()]) {
      const owner = p.cloneOf ? players.get(p.cloneOf) : p;
      if ((p.sim && !p.npc) || (owner && owner.sim && !owner.npc) || (p.cloneOf && !owner)) {
        removePlayer(p);
        changed = true;
      }
    }
    for (const [k, q] of [...queue.entries()]) if (q.user && q.user.sim) queue.delete(k);
    if (changed) {
      broadcastRoster();
      broadcastQueue();
    }
  }

  function testUser(name) {
    const n = String(name || 'Admin thử').trim().slice(0, 30) || 'Admin thử';
    return { user: n, uniqueId: `admintest_${n}`.slice(0, 40), avatar: '', sim: true };
  }
  // Trạng thái người chơi thử cho trang quản lý
  function testStatus(u) {
    const key = viewerKey(u);
    const p = players.get(byKey.get(key));
    const q = queue.get(key);
    const base = { phase, light, round, need: S().queueLikes };
    if (!p) return { ...base, joined: false, queued: Boolean(q), queueOk: Boolean(q && q.ok), queueLikes: q ? q.likes : 0 };
    return {
      ...base,
      joined: true,
      num: p.num,
      dist: Math.round((p.y / TRACK) * 100),
      alive: p.alive,
      finishRank: p.finishRank,
      finishMs: p.finishMs || 0,
      shield: p.shield,
      clones: clonesOf(p).length,
      giant: p.giantUntil > Date.now(),
      chicken: p.chickenUntil > Date.now(),
      pending: Math.round(p.pending * 10) / 10,
      graceMs: graceFor(p),
      lagMs: p.lagSamples && p.lagSamples.length ? p.lagSamples[p.lagSamples.length - 1] : null
    };
  }

  function speedOf(p, now) {
    let v = S().runSpeed ?? BASE_SPEED;
    if (p.turboUntil > now) v *= 2;
    if (p.giantUntil > now) v *= 2;
    if (p.chickenUntil > now) v *= 0.4;
    return v;
  }

  // --------------------------------------------------------------------------
  // Vật phẩm từ quà
  // --------------------------------------------------------------------------
  function runners() {
    return [...players.values()].filter((p) => p.alive && !p.finishRank);
  }

  function leaders(n, except) {
    return runners()
      .filter((p) => !p.cloneOf && !p.doomAt && p !== except)
      .sort((a, b) => b.y - a.y)
      .slice(0, n);
  }

  // Đường chạy của khổng lồ: vào từ một mép (ngẫu nhiên trái/phải), lần lượt qua 3 chỗ đông người, ra mép kia.
  // Trả về [{ x (0..1), y (đơn vị sân), t (ms từ lúc bắt đầu) }]
  // Hồi sinh tối đa max người vừa bị loại gần nhất (ưu tiên người xem thật, không tính bản sao), đứng dậy chạy tiếp ở chỗ cũ
  function reviveRecent(max) {
    if (phase !== 'play' || purge) return [];
    const dead = [...players.values()]
      .filter((p) => !p.alive && !p.finishRank && !p.cloneOf)
      .sort((a, b) => (a.npc ? 1 : 0) - (b.npc ? 1 : 0) || b.deadAt - a.deadAt)
      .slice(0, max);
    const now = Date.now();
    for (const p of dead) {
      p.alive = true;
      p.doomAt = 0;
      p.doomCause = '';
      p.deadAt = 0;
      p.pending = 0;
      p.dash = 0;
      p.lastActiveAt = now;
    }
    if (dead.length) {
      rosterDirty = true;
      broadcastPositions();
      ctx.broadcast('rl.fx', { kind: 'revive', ids: dead.map((p) => p.id) });
    }
    return dead;
  }
  // Thả cướp biển khổng lồ: người tặng Kính râm (không dẫm người tặng), hoặc người điều phối thả (giver = null)
  function releaseStomper(giver, cap) {
    const others = runners().filter((v) => (!giver || v.key !== giver.key) && !v.doomAt);
    if (!others.length) return false;
    const path = stompPath(others);
    stompers.push({ giverKey: giver ? giver.key : null, path, startAt: Date.now(), cap, hit: new Set(), count: 0 });
    ctx.broadcast('rl.fx', { kind: 'stomp', from: giver ? giver.id : null, path });
    return true;
  }
  function stompPath(others) {
    const px = (v) => ({ X: v.x * STOMP_FIELD_W, Y: v.y * STOMP_PX_PER_UNIT });
    const pts = others.map(px);
    // chỗ đông: mỗi người được chấm điểm theo số người đứng quanh (chọn ngẫu nhiên theo trọng số, không trùng chỗ)
    const weight = pts.map((a) => (pts.filter((b) => Math.hypot(a.X - b.X, a.Y - b.Y) < 90).length + 1) ** 2);
    const picked = [];
    for (let k = 0; k < STOMP_WAYPOINTS && picked.length < others.length; k++) {
      const total = weight.reduce((s, w, i) => s + (picked.some((j) => Math.hypot(pts[j].X - pts[i].X, pts[j].Y - pts[i].Y) < 120) ? 0 : w), 0);
      if (!total) break;
      let r = Math.random() * total;
      for (let i = 0; i < pts.length; i++) {
        const w = picked.some((j) => Math.hypot(pts[j].X - pts[i].X, pts[j].Y - pts[i].Y) < 120) ? 0 : weight[i];
        if ((r -= w) <= 0 && w > 0) {
          picked.push(i);
          break;
        }
      }
    }
    const dir = Math.random() < 0.5 ? 1 : -1;
    const way = picked.map((i) => ({ x: others[i].x, y: others[i].y })).sort((a, b) => dir * (a.x - b.x));
    const edgeIn = dir > 0 ? -0.08 : 1.08;
    const first = way[0] || { y: TRACK / 2 };
    const last = way[way.length - 1] || first;
    const nodes = [{ x: edgeIn, y: first.y }, ...way, { x: 1 - edgeIn, y: last.y }];
    let t = 0;
    return nodes.map((nd, i) => {
      if (i) {
        const a = nodes[i - 1];
        t += (Math.hypot((nd.x - a.x) * STOMP_FIELD_W, (nd.y - a.y) * STOMP_PX_PER_UNIT) / STOMP_SPEED) * 1000;
      }
      return { x: Math.round(nd.x * 1000) / 1000, y: Math.round(nd.y * 10) / 10, t: Math.round(t) };
    });
  }

  // Mỗi nhịp game: khổng lồ ở đâu trên đường chạy, ai đang đứng sát bàn chân thì bị dẫm (mỗi người chỉ xét một lần)
  function stepStompers(now) {
    for (let i = stompers.length - 1; i >= 0; i--) {
      const st = stompers[i];
      const path = st.path;
      const age = now - st.startAt;
      if (age > path[path.length - 1].t) {
        stompers.splice(i, 1);
        continue;
      }
      let j = 1;
      while (j < path.length - 1 && path[j].t < age) j++;
      const a = path[j - 1];
      const b = path[j];
      const k = Math.max(0, Math.min(1, (age - a.t) / Math.max(1, b.t - a.t)));
      const gx = (a.x + (b.x - a.x) * k) * STOMP_FIELD_W;
      const gy = (a.y + (b.y - a.y) * k) * STOMP_PX_PER_UNIT;
      for (const v of runners()) {
        if (v.key === st.giverKey || v.doomAt || st.hit.has(v.id)) continue;
        if (Math.hypot(v.x * STOMP_FIELD_W - gx, v.y * STOMP_PX_PER_UNIT - gy) > STOMP_RADIUS) continue;
        st.hit.add(v.id);
        if (st.count >= st.cap || v.giantUntil > now) continue; // khổng lồ không bị dẫm
        if (v.shield > 0) {
          v.shield--;
          ctx.broadcast('rl.fx', { kind: 'shieldSave', id: v.id });
          continue;
        }
        st.count++;
        eliminate(standIn(v), 'stomp'); // có bản sao thì bản sao chết thay
      }
    }
  }

  function applyItem(p, item, count) {
    const now = Date.now();
    const n = Math.max(1, Math.min(count, 10));
    switch (item.kind) {
      case 'turbo':
        p.turboUntil = Math.max(p.turboUntil, now) + 2500;
        if (phase === 'play' && p.alive && !p.finishRank && light !== 'red') {
          // lao lên: cộng bước riêng chạy chồng lên tốc độ thường (cả khi đang có đà — bước dồn từ tim thì đà đã thay)
          p.dash = Math.min((p.dash || 0) + (item.bonus || 3) * n, 60);
        }
        break;
      case 'shield':
        p.shield = Math.min(3, p.shield + n);
        break;
      case 'fart': {
        // Hand Hearts: thả boom (xì hơi) — 5 người đứng gần người tặng nhất (combo tối đa 15) choáng váng rồi bị lính bắn.
        // Khiên đỡ được, khổng lồ không choáng; có bản sao thì bản sao choáng thay.
        const px = (v) => ({ X: v.x * STOMP_FIELD_W, Y: v.y * STOMP_PX_PER_UNIT });
        const me = px(p);
        const near = runners()
          .filter((v) => v.key !== p.key && !v.cloneOf && !v.doomAt && v.giantUntil < now)
          .map((v) => ({ v, d: Math.hypot(px(v).X - me.X, px(v).Y - me.Y) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, Math.min(15, 5 * n));
        const dazed = [];
        for (const { v } of near) {
          if (v.shield > 0) {
            v.shield--;
            ctx.broadcast('rl.fx', { kind: 'shieldSave', id: v.id });
            continue;
          }
          const fall = standIn(v);
          fall.doomAt = now + FART_DAZE_MS;
          fall.doomCause = 'fart';
          fall.pending = 0;
          dazed.push(fall);
        }
        ctx.broadcast('rl.fx', { kind: 'fart', from: p.id, ids: dazed.map((v) => v.id), ms: FART_DAZE_MS });
        const giver = numName(p);
        announce(
          dazed.length
            ? L(`${giver} thả boom làm ${dazed.length} người xung quanh choáng váng!`, `${giver} dropped a fart bomb and knocked out ${dazed.length} players nearby!`)
            : L(`${giver} thả boom nhưng không ai bị choáng!`, `${giver} dropped a fart bomb but nobody got knocked out!`)
        );
        break;
      }
      case 'revive': {
        // Vòng cổ: hồi sinh 2 người vừa bị bắn gần nhất mỗi quà (combo tối đa 6)
        const back = reviveRecent(Math.min(6, 2 * n));
        const giver = numName(p);
        const names = back.filter((v) => !v.npc).map(numName);
        for (const v of back) if (!v.npc && !v.cloneOf && v !== p) award(v, { stats: { rl_revived: 1 } });
        if (back.length) {
          announce(
            L(
              `${giver} hồi sinh ${names.length ? names.slice(0, 3).join(' và ') : `${back.length} người`}!`,
              `${giver} revived ${names.length ? names.slice(0, 3).join(' and ') : `${back.length} players`}!`
            )
          );
        }
        break;
      }
      case 'crowd':
      case 'clones':
        addClones(p, (item.clones || 1) * n);
        if (item.turbo) p.turboUntil = Math.max(p.turboUntil, now) + 2500;
        break;
      case 'wind': {
        const hit = leaders(20, p)
          .filter((v) => (v.pushImmuneUntil || 0) < now)
          .slice(0, Math.min(10, 5 * n));
        for (const v of hit) {
          v.y = Math.max(0, v.y - 10);
          v.pushImmuneUntil = now + 10000;
        }
        ctx.broadcast('rl.fx', { kind: 'wind', from: p.id, ids: hit.map((v) => v.id) });
        break;
      }
      case 'giant':
        p.giantUntil = Math.max(p.giantUntil, now) + (item.ms || 10000) * n;
        rosterDirty = true;
        break;
      case 'shove': {
        // "Trượt tay" đẩy người đứng gần mình nhất (mỗi quà 1 người, combo tối đa 3) → ngã, nháy đỏ rồi lính bắn
        const px = (v) => ({ X: v.x * STOMP_FIELD_W, Y: v.y * STOMP_PX_PER_UNIT });
        const me = px(p);
        const near = runners()
          .filter((v) => v.key !== p.key && !v.cloneOf && !v.doomAt)
          .map((v) => ({ v, d: Math.hypot(px(v).X - me.X, px(v).Y - me.Y) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, Math.min(n, 3));
        for (const { v } of near) {
          const giver = numName(p);
          const victim = numName(v);
          if (v.giantUntil > now) {
            announce(L(`${giver} đẩy ${victim} nhưng khổng lồ không ngã!`, `${giver} shoved ${victim}, but giants don't fall!`));
            continue;
          }
          if (v.shield > 0) {
            v.shield--;
            ctx.broadcast('rl.fx', { kind: 'shieldSave', id: v.id });
            announce(L(`${giver} đẩy ${victim} nhưng khiên đỡ được!`, `${giver} shoved ${victim}, but the shield blocked it!`));
            continue;
          }
          const fall = standIn(v); // có bản sao thì bản sao ngã thay
          fall.doomAt = now + SPOT_MS;
          fall.doomCause = 'shove';
          fall.pending = 0;
          ctx.broadcast('rl.fx', { kind: 'shove', from: p.id, id: fall.id, ms: SPOT_MS });
          announce(
            fall === v
              ? L(`${victim} bị ${giver} trượt tay đẩy ngã!`, `${giver} "accidentally" shoved ${victim} down!`)
              : L(`${victim} bị ${giver} trượt tay đẩy, bản sao ngã thay!`, `${giver} shoved ${victim}, but a clone fell instead!`)
          );
        }
        break;
      }
      case 'chicken': {
        // Luôn nhắm đúng người dẫn đầu (trừ người tặng). Người dẫn đầu vừa bị hoá gà (còn miễn 20 giây kể từ lúc hoá)
        // thì quà không có tác dụng — không chuyển sang người hạng sau, để ai xem cũng thấy gà chỉ rơi vào người đứng đầu.
        const lead = leaders(1, p)[0];
        if (!lead) break;
        if ((lead.chickenImmuneUntil || 0) >= now) {
          ctx.broadcast('rl.fx', { kind: 'chickenBlocked', from: p.id, ids: [lead.id] });
          break;
        }
        lead.chickenUntil = now + 5000;
        lead.chickenImmuneUntil = now + 20000;
        rosterDirty = true;
        ctx.broadcast('rl.fx', { kind: 'chicken', from: p.id, ids: [lead.id] });
        break;
      }
      case 'stomp':
        releaseStomper(p, S().stompMax * Math.min(n, 2));
        break;
      case 'teamShield': {
        const near = runners()
          .filter((v) => !v.cloneOf)
          .sort((a, b) => Math.hypot(a.x - p.x, (a.y - p.y) / 100) - Math.hypot(b.x - p.x, (b.y - p.y) / 100))
          .slice(0, 10);
        for (const v of near) v.shield = Math.min(3, v.shield + 1);
        p.shield = Math.min(3, p.shield + 1);
        ctx.broadcast('rl.fx', { kind: 'teamShield', from: p.id, ids: near.map((v) => v.id) });
        break;
      }
      default:
        break;
    }
    rosterDirty = true;
  }

  // --------------------------------------------------------------------------
  // Giọng đọc (ZeroTTS → màn hình phát)
  // --------------------------------------------------------------------------
  function say(text) {
    if (S().ttsEnabled === false) return;
    // English: giọng macOS (tts-en.js); tiếng Việt: ZeroTTS như cũ
    if (isEn()) {
      ttsEn
        .synthesize(text, S().enVoice)
        .then((res) => {
          if (res && res.ok) ctx.broadcast('rl.say', { text, url: res.url });
        })
        .catch(() => {});
      return;
    }
    if (!ctx.tts || !ctx.tts.ready) return;
    ctx.tts
      .synthesize(text, S().ttsVoice)
      .then((res) => {
        if (res && res.ok) ctx.broadcast('rl.say', { text, url: res.url });
      })
      .catch(() => {});
  }

  // --------------------------------------------------------------------------
  // Giọng đọc khi người chơi dùng vật phẩm: "<tên> <vật phẩm>". Lúc búp bê đang hát thì giữ lại, đọc khi nhạc dừng
  // (người chơi cần nghe câu hát để biết lúc dừng). Chống dồn: cùng người + cùng vật phẩm 8 s đọc 1 lần, chờ tối đa 3 câu.
  // --------------------------------------------------------------------------
  const ITEM_SAY = {
    turbo: (n) => `${n} tăng tốc!`,
    shield: (n) => `${n} có khiên!`,
    clones: (n) => `${n} phân thân!`,
    crowd: (n) => `${n} gọi năm bản sao!`,
    wind: (n) => `${n} cho búp bê hét, đẩy lùi người dẫn đầu!`,
    giant: (n) => `${n} hoá khổng lồ!`,
    chicken: (n) => `${n} biến người dẫn đầu thành gà!`,
    teamShield: (n) => `${n} tặng khiên cho người xung quanh!`,
    stomp: (n) => `${n} gọi cướp biển chân gỗ dẫm người!`
  };
  const speakName = (n) => String(n || '').replace(/[^\p{L}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
  const itemSaid = new Map(); // "khoá người|vật phẩm" → lúc đọc
  let itemSayQueue = [];
  // Câu đọc theo sự kiện (vd. đẩy ngã): lúc búp bê đang hát thì giữ lại, đọc khi nhạc dừng
  function announce(text) {
    if (phase === 'play' && light !== 'red') {
      itemSayQueue.push(text);
      if (itemSayQueue.length > 3) itemSayQueue.shift();
    } else say(text);
  }
  function sayItem(p, kind) {
    const line = (isEn() ? EN.ITEM_SAY : ITEM_SAY)[kind];
    if (!line || p.npc) return;
    const now = Date.now();
    const k = `${p.key}|${kind}`;
    if (now - (itemSaid.get(k) || 0) < 8000) return; // combo cùng quà: chỉ đọc 1 lần
    itemSaid.set(k, now);
    if (itemSaid.size > 500) itemSaid.clear();
    const text = line(numName(p));
    if (phase === 'play' && light !== 'red') {
      itemSayQueue.push(text);
      if (itemSayQueue.length > 3) itemSayQueue.shift();
    } else say(text);
  }
  function flushItemSay() {
    const list = itemSayQueue;
    itemSayQueue = [];
    for (const t of list) say(t);
  }

  // --------------------------------------------------------------------------
  // Vòng đời ván
  // --------------------------------------------------------------------------
  // Top 5 kỉ lục tổng qua các ván (người thật; chưa có ai thì khi giả lập hiện bảng người ảo)
  function hallOfFame() {
    let top = ctx.board.top(5);
    if (!top.length && S().autoSim) top = simBoard.top(5);
    return top
      .filter((v) => v.points > 0)
      .map((v) => ({ name: v.name, avatar: v.avatar, points: v.points, wins: v.stats.wins || 0, podium: v.stats.podium || 0, rounds: v.stats.rounds || 0 }));
  }

  // Phiên bản mã màn hình (cùng số ?v= server gắn vào link JS): màn hình đang chạy bản cũ thì tự tải lại
  function clientVersion() {
    try {
      return Math.round(fs.statSync(path.join(config.PUBLIC_DIR, 'js/redlight.js')).mtimeMs);
    } catch (_) {
      return 0;
    }
  }
  function phaseInfo() {
    return {
      clientV: clientVersion(),
      phase,
      light,
      round,
      paused,
      phaseEndsAt,
      lightEndsAt,
      lightStartedAt,
      graceMs: S().redGraceMs,
      purging: Boolean(purge),
      fake,
      sleepUntil,
      song: song && { mode: song.mode, rates: song.rates, startAt: song.startAt, durationMs: song.durationMs, cuts: CUTS },
      nextSong: nextSongMode || S().songMode || 'random',
      hall: hallOfFame(),
      records: recordsView(),
      warnMs: S().warnMs,
      serverNow: Date.now()
    };
  }

  function broadcastPhase() {
    ctx.broadcast('rl.phase', phaseInfo());
  }

  function enterLobby() {
    flushItemSay();
    purge = null;
    heldGifts = [];
    stompers = [];
    song = null;
    phase = 'lobby';
    phaseStartedAt = Date.now();
    phaseEndsAt = Date.now() + S().lobbySeconds * 1000;
    // Giữ lại người còn tương tác gần cuối ván (thả tim / bình luận / tặng quà trong KEEP_ACTIVE_MS), bỏ bản sao
    // & người đã rời. Trước đây giữ 3 phút nên người thả tim đầu ván rồi rời live vẫn đứng kẹt ở ván sau tới lúc bị bắn.
    const keepSince = Date.now() - KEEP_ACTIVE_MS;
    for (const p of [...players.values()]) {
      if (p.cloneOf || p.lastActiveAt < keepSince) {
        removePlayer(p);
        continue;
      }
      Object.assign(p, {
        y: 0,
        pending: 0,
        alive: true,
        doomAt: 0,
        finishRank: 0,
        shield: 0,
        giantUntil: 0,
        chickenUntil: 0,
        turboUntil: 0,
        x: rand(0.06, 0.94)
      });
    }
    promoteQueue();
    fillNpcs();
    rosterDirty = true;
    broadcastPhase();
    say(lines().lobby[round % lines().lobby.length]); // chỉ đọc luật chơi, không kêu gọi tặng quà
  }

  // --------------------------------------------------------------------------
  // Tình huống ngẫu nhiên hài hước (chỉ lúc đèn xanh, người thật đang chạy; mỗi người tối đa 1 lần / ván;
  // ảnh hưởng nhẹ, ngắn — không làm ai bị bắn). Tỉ lệ từng loại chỉnh trong admin (mishapW_<loại>, 0 = tắt);
  // nút trong mục điều khiển gọi ngay một tình huống (redlight.mishap)
  //   back: lùi (đơn vị sân) · stun: đứng yên (ms) · dash: lao thêm · bee: tự chạy nhanh
  // --------------------------------------------------------------------------
  const MISHAPS = {
    sun: { emoji: '🥵', back: 6, stun: 1400, lucky: false, stat: 'ev_sun',
      vi: ['{n} bị say nắng, chạy ngược về nhà!', 'Trời nắng quá, {n} say nắng quay vòng vòng!'], en: ['{n} got sunstroke and runs the wrong way!'] },
    poop: { emoji: '🐦', dash: 5, lucky: true, stat: 'ev_poop',
      vi: ['Chim ị trúng đầu {n}, hên quá chạy thêm mấy bước!', 'Bộp! Chim ị trúng {n}, xui mà hên!'], en: ['A bird pooped on {n}, lucky! Extra steps!'] },
    bee: { emoji: '🐝', bee: 2200, lucky: true, stat: 'ev_bee',
      vi: ['{n} bị ong đốt mông, chạy như bay!', 'Á á! Ong đốt {n}, chạy không kịp thở!'], en: ['A bee stung {n}, running like crazy!'] },
    money: { emoji: '💵', stun: 1500, lucky: false, stat: 'ev_money',
      vi: ['{n} thấy tiền rơi là quên cả chạy!', '{n} cúi nhặt tiền, tham quá!'], en: ['{n} found money and forgot to run!'] },
    sneeze: { emoji: '🤧', back: 3, lucky: false, stat: 'ev_sneeze',
      vi: ['Hắt xììì! {n} văng ra sau!', '{n} hắt xì một cái bay luôn mấy bước!'], en: ['Achoo! {n} sneezed backwards!'] }
  };
  let nextMishapAt = 0;
  const fillName = (str, n) => str.replace(/\{n\}/g, n);
  function scheduleMishap(now) {
    const every = (S().mishapEverySec ?? 20) * 1000;
    nextMishapAt = now + every * (0.7 + Math.random() * 0.6);
  }
  function mishapTick(now) {
    if (S().mishaps === false || light !== 'green' || purge || !nextMishapAt || now < nextMishapAt) return;
    if (lightEndsAt - now < 2500) return; // sắp đèn đỏ: để lần sau
    scheduleMishap(now);
    // bốc loại theo tỉ lệ cài đặt
    const weights = Object.keys(MISHAPS).map((k) => [k, Math.max(0, Number(S()[`mishapW_${k}`] ?? 5))]);
    const total = weights.reduce((a, [, w]) => a + w, 0);
    if (total <= 0) return;
    let r = Math.random() * total;
    const type = (weights.find(([, w]) => (r -= w) < 0) || weights[0])[0];
    if (!triggerMishap(type, now)) nextMishapAt = now + 2000; // chưa ai hợp lệ: thử lại sau 2 giây
  }
  // gây một tình huống cho một người ngẫu nhiên đang chạy; trả về người bị / null
  function triggerMishap(type, now = Date.now(), { force = false } = {}) {
    const m = MISHAPS[type];
    if (!m) return null;
    // tự động: chỉ người đã chạy được một đoạn (khỏi lùi ngay vạch xuất phát); bấm tay: ai đang trên sân cũng được
    const ok = (p) => !p.cloneOf && !p.doomAt && !(p.giantUntil > now) && (force || p.y > 4) && p.y < TRACK - 8;
    let pool = runners().filter((p) => ok(p) && !p.npc && p.mishapRound !== round);
    if (force && !pool.length) pool = runners().filter((p) => ok(p) && !p.npc);
    if (force && !pool.length) pool = runners().filter(ok); // bấm tay lúc chỉ có người máy: vẫn cho xem hiệu ứng
    if (!pool.length) return null;
    const p = pick(pool);
    p.mishapRound = round;
    if (m.back) p.backLeft = (p.backLeft || 0) + m.back;
    if (m.stun) p.stunUntil = now + m.stun;
    if (m.dash) p.dash = (p.dash || 0) + m.dash;
    if (m.bee) {
      p.turboUntil = Math.max(p.turboUntil, now + m.bee);
      p.momentumUntil = Math.max(p.momentumUntil || 0, now + m.bee);
    }
    ctx.broadcast('rl.fx', { kind: 'mishap', type, emoji: m.emoji, lucky: m.lucky, id: p.id, name: p.name, ms: m.stun || m.bee || 1400 });
    say(fillName(pick(isEn() ? m.en : m.vi), speakName(p.name) || L(`số ${p.num}`, `number ${p.num}`)));
    award(p, { stats: { [m.stat]: 1 } });
    rosterDirty = true;
    return p;
  }

  function startRound() {
    round++;
    phase = 'play';
    phaseStartedAt = Date.now();
    phaseEndsAt = Date.now() + S().roundSeconds * 1000;
    finishCount = 0;
    results = [];
    setLight('green', true);
    scheduleMishap(Date.now() + 4000); // không đổ tình huống ngay đầu ván
    ctx.emitEvent({ type: 'rlRound', round, players: realPlayers().length });
    say(pick(lines().start));
  }

  function setLight(next, quiet = false, greenMs = 0) {
    light = next;
    lightStartedAt = Date.now();
    if (next === 'green' && lightLog.length && lightLog[lightLog.length - 1].light === 'red') closeRedLatency();
    if (next === 'red') flushItemSay(); // nhạc dừng: đọc tên người dùng vật phẩm lúc nãy
    lightLog.push({ t: lightStartedAt, light: next });
    if (lightLog.length > 12) lightLog.shift();
    const st = S();
    if (next === 'green') for (const p of players.values()) if (!p.cloneOf) p.greenAt = lightStartedAt;
    fake = null;
    if (next !== 'green') sleepUntil = 0;
    if (next === 'green' && greenMs) {
      // búp bê ngủ gật: xanh không có câu hát, hết giờ thì tỉnh dậy quay mặt như thường
      song = null;
      lightEndsAt = lightStartedAt + greenMs;
    } else if (next === 'green' && st.songEnabled !== false) {
      // Đèn xanh = búp bê hát; đoạn cuối câu hát (warnMs) búp bê bắt đầu quay đầu, hát xong là đỏ
      const plan = planSong(nextSongMode || st.songMode);
      nextSongMode = null;
      song = { ...plan, startAt: lightStartedAt };
      const warn = Math.max(0, Math.min(st.warnMs, plan.durationMs - 800));
      lightEndsAt = lightStartedAt + plan.durationMs - warn;
    } else if (next === 'green') {
      song = null;
      lightEndsAt = lightStartedAt + rand(st.greenMin, st.greenMax) * 1000;
    } else if (next === 'warn') {
      lightEndsAt = song ? Math.max(lightStartedAt + 300, song.startAt + song.durationMs) : lightStartedAt + st.warnMs;
    } else {
      song = null;
      lightEndsAt = lightStartedAt + rand(st.redMin, st.redMax) * 1000;
    }
    broadcastPhase();
    if (next === 'green') releaseHeldGifts();
    // có câu hát thì búp bê là tín hiệu, không đọc thêm cho khỏi đè tiếng hát
    if (!quiet && next === 'warn' && !song) say(pick(lines().red));
  }

  function releaseHeldGifts() {
    const list = heldGifts;
    heldGifts = [];
    for (const h of list) {
      const p = players.get(h.id);
      if (!p || !p.alive || p.finishRank || p.doomAt) continue;
      applyItem(p, h.item, h.count);
      ctx.broadcast('rl.fx', { kind: 'giftApply', id: p.id, itemKind: h.item.kind, count: h.count });
    }
  }

  // Hết giờ: đèn đỏ đứng im, lính canh tiến lên bắn hết người chưa về đích, xong mới ra kết quả
  function startPurge() {
    say(pick(lines().timeUp));
    const victims = runners().sort((a, b) => b.y - a.y);
    if (!victims.length) return endRound('time');
    const now = Date.now();
    song = null;
    light = 'red';
    lightStartedAt = now;
    lightEndsAt = now + 60 * 60 * 1000;
    for (const p of players.values()) p.pending = 0;
    const gap = Math.min(220, PURGE_SHOOT_MS / victims.length);
    purge = {
      queue: victims.map((p, i) => ({ id: p.id, at: now + PURGE_MARCH_MS + i * gap })),
      endAt: now + PURGE_MARCH_MS + victims.length * gap + PURGE_TAIL_MS
    };
    broadcastPhase();
    ctx.broadcast('rl.fx', { kind: 'purge', ids: victims.map((p) => p.id), marchMs: PURGE_MARCH_MS });
  }

  function endRound(reason) {
    if (light === 'red') closeRedLatency(); // lần đèn đỏ cuối ván cũng ghi độ trễ
    purge = null;
    song = null;
    phase = 'result';
    phaseStartedAt = Date.now();
    phaseEndsAt = Date.now() + S().resultSeconds * 1000;
    const real = realPlayers();
    const finished = real.filter((p) => p.finishRank).sort((a, b) => a.finishRank - b.finishRank);
    const alive = real.filter((p) => !p.finishRank && p.alive).sort((a, b) => b.y - a.y);
    results = [...finished, ...alive].slice(0, 10).map((p) => ({
      id: p.id,
      name: p.name,
      num: p.num,
      avatar: p.avatar,
      rank: p.finishRank,
      ms: p.finishMs || 0,
      dist: Math.round((p.y / TRACK) * 100)
    }));
    // Bảng kỉ lục qua các ván: chỉ tính về đích (3 điểm, thêm 3/2/1 cho hạng 1/2/3) — không theo quà.
    // Người ảo ghi vào bảng riêng không lưu, chỉ để xem thử khi giả lập.
    for (const p of real) {
      const pts = p.finishRank ? 3 + Math.max(0, 4 - p.finishRank) : 0;
      award(p, { points: pts, stats: { rounds: 1, wins: p.finishRank ? 1 : 0, podium: p.finishRank && p.finishRank <= 3 ? 1 : 0, rl_finish: p.finishRank ? 1 : 0, rl_first: p.finishRank === 1 ? 1 : 0 } });
    }
    if (finished.length) lastWinners = finished.slice(0, 10).map((p) => ({ name: p.name, num: p.num, avatar: p.avatar }));
    ctx.save();
    rosterDirty = true;
    broadcastPhase();
    ctx.broadcast('rl.results', { round, results, reason });
    ctx.emitEvent({ type: 'rlResult', round, winners: finished.length, players: real.length });
    if (!finished.length) setTimeout(() => say(pick(lines().noWinner)), 1500);
  }

  function tick() {
    const now = Date.now();
    if (paused) return;
    if (phase === 'lobby') {
      if (now >= phaseEndsAt) {
        if (realPlayers().length > 0 && S().autoLoop) startRound();
        else if (S().autoLoop) phaseEndsAt = now + 5000; // chưa ai vào: chờ thêm
      }
    } else if (phase === 'play' && purge) {
      while (purge.queue.length && purge.queue[0].at <= now) {
        const p = players.get(purge.queue.shift().id);
        if (p) eliminate(p, 'purge');
      }
      if (rosterDirty) broadcastPositions();
      if (now >= purge.endAt) endRound('time');
    } else if (phase === 'play') {
      if (now >= lightEndsAt) setLight(light === 'green' ? 'warn' : light === 'warn' ? 'red' : 'green');
      if (stompers.length) stepStompers(now);
      driveNpcs(now);
      mishapTick(now);
      const dt = TICK_MS / 1000;
      let moved = false;
      for (const p of [...players.values()]) {
        if (p.doomAt && now >= p.doomAt) eliminate(p, p.doomCause || 'red');
        // khổng lồ chỉ tính giờ lúc búp bê hát: đèn đỏ thì đồng hồ khổng lồ đứng yên (vẫn miễn bắn / dẫm / đẩy)
        if (light === 'red' && p.giantUntil > now) p.giantUntil += TICK_MS;
        if (!p.alive || p.finishRank || p.doomAt || light === 'red') continue;
        // tình huống: bị lùi (say nắng, mẹ gọi, gió lốc...) thì lùi trước, đang đứng hình (tuột quần, nhặt tiền) thì đứng yên
        if (p.backLeft > 0) {
          const b = Math.min(p.backLeft, 9 * dt);
          p.backLeft -= b;
          p.y = Math.max(0, p.y - b);
          moved = true;
          continue;
        }
        if ((p.stunUntil || 0) > now) continue;
        const momentum = (p.momentumUntil || 0) > now;
        if (!momentum && p.pending <= 0 && !(p.dash > 0)) continue;
        // có đà: chạy hết tốc lực (vẫn tiêu bước dồn); không đà: chạy bằng bước dồn từ tim như cũ
        const step = momentum ? speedOf(p, now) * dt : Math.min(p.pending, speedOf(p, now) * dt);
        p.pending = Math.max(0, p.pending - step);
        const dash = p.dash > 0 ? Math.min(p.dash, speedOf(p, now) * dt) : 0; // hoa hồng: lao thêm cùng tốc độ
        if (dash) p.dash -= dash;
        p.y += step + dash;
        moved = true;
        if (p.y >= TRACK) finish(p);
      }
      if (moved || rosterDirty) broadcastPositions();
      if (redActs.size) {
        ctx.broadcast('rl.act', { ids: [...redActs] });
        redActs.clear();
      }
      const live = runners().filter((p) => !p.cloneOf).length;
      if (now >= phaseEndsAt) startPurge();
      else if (realPlayers().length && live === 0) endRound('done');
    } else if (phase === 'result') {
      if (now >= phaseEndsAt && S().autoLoop) enterLobby();
    }
    if (rosterDirty) broadcastRoster();
  }

  function rosterView() {
    const now = Date.now();
    return [...players.values()].map((p) => ({
      id: p.id,
      n: p.cloneOf ? '' : p.name,
      num: p.num,
      av: p.cloneOf ? '' : p.avatar,
      c: p.cloneOf,
      x: Math.round(p.x * 1000) / 1000,
      y: Math.round(p.y * 10) / 10,
      a: p.alive ? 1 : 0,
      f: p.finishRank,
      s: p.shield,
      g: p.giantUntil > now ? 1 : 0,
      k: p.chickenUntil > now ? 1 : 0,
      h: p.hue,
      b: p.npc ? 1 : 0,
      lv: p.cloneOf || !p.badge ? 1 : p.badge.lv,
      tt: p.cloneOf || !p.badge ? '' : p.badge.tt
    }));
  }

  function broadcastRoster() {
    rosterDirty = false;
    ctx.broadcast('rl.roster', { roster: rosterView(), serverNow: Date.now() });
  }

  // Vị trí gọn: [id, y*10, id, y*10, ...]
  function broadcastPositions() {
    const flat = [];
    for (const p of players.values()) if (p.alive && !p.finishRank) flat.push(p.id, Math.round(p.y * 10));
    ctx.broadcast('rl.pos', { p: flat });
  }

  // Hết hạn khổng lồ / hoá gà → cập nhật hình
  function expireEffects() {
    const now = Date.now();
    for (const p of players.values()) {
      if ((p.giantUntil && p.giantUntil <= now) || (p.chickenUntil && p.chickenUntil <= now)) {
        if (p.giantUntil <= now) p.giantUntil = 0;
        if (p.chickenUntil <= now) p.chickenUntil = 0;
        rosterDirty = true;
      }
    }
  }

  const tickTimer = setInterval(() => {
    try {
      tick();
    } catch (err) {
      console.error(`[redlight ${ctx.roomId}] tick lỗi:`, err);
    }
  }, TICK_MS);
  const fxTimer = setInterval(expireEffects, 500);

  // Đọc trước các câu cố định để lúc cần không phải chờ tổng hợp giọng
  setTimeout(() => {
    const all = [...lines().green, ...lines().red, ...lines().start, ...lines().lobby, ...lines().timeUp];
    if (isEn()) {
      for (const t of all) ttsEn.synthesize(t, S().enVoice).catch(() => {});
      return;
    }
    if (!ctx.tts) return;
    for (const t of all) {
      ctx.tts.synthesize(t, S().ttsVoice).catch(() => {});
    }
  }, 20000);

  // --------------------------------------------------------------------------
  // Sự kiện TikTok
  // --------------------------------------------------------------------------
  function onEvent(evt) {
    const u = evt.user || {};
    switch (evt.type) {
      case 'chat': {
        if (isBlockedSpamOrToxic(evt.text)) return null;
        const id = byKey.get(viewerKey(u));
        const p = id && players.get(id);
        if (!p) {
          // đang chơi / xem kết quả: bình luận là giữ chỗ hàng chờ ván sau ngay (như thả đủ tim), lời bình luận hiện trên đầu
          if (phase !== 'lobby') {
            queueAdd(u);
            const q = queue.get(viewerKey(u));
            if (q) queueReserve(q);
            queueSay(u, evt.text);
            return null;
          }
          const np = join(u);
          if (np) sayFx(np, evt.text);
          return np;
        }
        const now = Date.now();
        sayFx(p, evt.text); // lời bình luận hiện trên đầu người chơi (cả lúc đang chạy / xem kết quả)
        // Bình luận lúc búp bê hát = commentLikes tim (mặc định 2), tối đa 1 lần / 1,5 giây
        if (phase === 'play') {
          // Luật chỉ bắt người còn thả tim: bình luận lúc đèn đỏ không bị bắn (người xem hay chat)
          if (light === 'red') p.lastActiveAt = now;
          else if (now - p.lastChatStepAt > 1500) {
            p.lastChatStepAt = now;
            keepMomentum(p); // bình luận lúc búp bê hát cũng giữ đà chạy
            const likes = S().commentLikes ?? 2;
            if (likes > 0) move(p, Math.min(maxLikeStep(), likes * S().stepPerLike));
            else p.lastActiveAt = now;
          }
        } else {
          p.lastActiveAt = now;
        }
        return p;
      }
      case 'like': {
        const id = byKey.get(viewerKey(u));
        const p = id && players.get(id);
        if (!p) {
          queueLike(u, Number(evt.count) || 1);
          return null;
        }
        move(p, Math.min(maxLikeStep(), (Number(evt.count) || 1) * S().stepPerLike));
        return p;
      }
      case 'gift': {
        const p = join(u, { announce: true }) || players.get(byKey.get(viewerKey(u)));
        if (!p) return null;
        const item = itemForGift(evt.giftName, evt.coins, evt.giftId);
        const held = phase === 'play' && light === 'red' && !purge && DEFER_KINDS.has(item.kind);
        if (held) heldGifts.push({ id: p.id, item, count: Number(evt.count) || 1 });
        else applyItem(p, item, Number(evt.count) || 1);
        sayItem(p, item.kind);
        const giftN = Math.max(1, Math.min(10, Number(evt.count) || 1));
        const giftStats = { coins: (Number(evt.coins) || 1) * giftN, [item.kind === 'fart' ? 'fart' : `it_${item.kind}`]: giftN };
        if (item.kind === 'shield' || item.kind === 'clones' || item.kind === 'teamShield') giftStats.rl_safe = giftN; // "Vua sợ die"
        award(p, { stats: giftStats });
        p.lastActiveAt = Date.now();
        ctx.broadcast('rl.fx', {
          kind: 'gift',
          id: p.id,
          name: p.name,
          gift: isEn() ? (BY_GIFT_ID[String(evt.giftId || '')] ? EN.titleCase(BY_GIFT_ID[String(evt.giftId)]) : evt.giftName) : evt.giftName,
          count: Number(evt.count) || 1,
          emoji: item.emoji,
          label: isEn() ? (EN.LEGEND[item.kind] || {}).label || item.label : item.label,
          itemKind: item.kind,
          held
        });
        ctx.emitEvent({ type: 'rlGift', user: p.name, gift: evt.giftName, label: item.label, emoji: item.emoji });
        return p;
      }
      case 'join':
        ctx.broadcast('rl.fx', { kind: 'viewer', name: sanitizeUserName(u.user || u.uniqueId) });
        return null;
      default:
        return null;
    }
  }

  // --------------------------------------------------------------------------
  // Giả lập & RPC
  // --------------------------------------------------------------------------
  const sim = createSim({
    onEvent: (evt) => ctx.simulated(() => onEvent(evt)),
    getPhase: () => ({ phase, light, lightStartedAt, graceMs: S().redGraceMs }),
    crowd: () => S().simCrowd,
    lang: () => S().lang
  });
  // Phòng khởi động lại khi giả lập đang bật: room.js không báo onAutoSimChange
  if (S().autoSim) sim.setRunning(true);
  fillNpcs();

  const rpc = {
    startRound: () => {
      paused = false;
      if (phase !== 'play') startRound();
      return phaseInfo();
    },
    endRound: () => {
      if (phase === 'play') endRound('admin');
      return phaseInfo();
    },
    newLobby: () => {
      paused = false;
      enterLobby();
      return phaseInfo();
    },
    pause: (params = {}) => {
      paused = params.paused === undefined ? !paused : Boolean(params.paused);
      if (!paused && phase === 'play' && !purge) {
        // Tiếp tục: lùi mốc kết thúc để không mất thời gian lúc dừng
        phaseEndsAt = Math.max(phaseEndsAt, Date.now() + 10000);
        setLight('green', true);
      } else broadcastPhase();
      return phaseInfo();
    },
    // Búp bê giả vờ quay: câu hát ngừng, búp bê quay mặt ra rồi quay lại hát tiếp — không bắn ai (ai hoảng dừng tay là tụt lại)
    fakeTurn: () => {
      const now = Date.now();
      if (phase !== 'play' || purge || paused) throw new Error('Chỉ dùng được khi đang chơi ván');
      if (light !== 'green' || sleepUntil > now || (fake && now < fake.at + fake.ms)) throw new Error('Chỉ dùng được lúc búp bê đang hát');
      if (lightEndsAt - now < 1500) throw new Error('Câu hát sắp hết, đợi lần hát sau');
      fake = { at: now, ms: FAKE_TURN_MS };
      // câu hát và đèn xanh lùi lại đúng bằng lúc giả vờ (màn hình dừng nhạc trong lúc đó rồi hát tiếp chỗ cũ)
      if (song) song.startAt += FAKE_TURN_MS;
      lightEndsAt += FAKE_TURN_MS;
      broadcastPhase();
      ctx.broadcast('rl.fx', { kind: 'fakeTurn', ms: FAKE_TURN_MS });
      setTimeout(() => say(pick(lines().fakeTurn)), 1200); // nói lúc búp bê đã quay mặt (nhạc đang ngừng)
      return phaseInfo();
    },
    // Búp bê ngủ gật: DOLL_SLEEP_MS không hát, không bắn — ai nhanh tay thì lao lên; tỉnh dậy là quay mặt luôn
    mishap: (params = {}) => {
      if (phase !== 'play' || purge) throw new Error('Chỉ dùng khi đang chơi');
      const type = String(params.type || '');
      if (!MISHAPS[type]) throw new Error(`Không có tình huống: ${type}`);
      const p = triggerMishap(type, Date.now(), { force: true });
      if (!p) throw new Error('Chưa có ai đang chạy trên sân');
      return { type, name: p.name };
    },
    dollSleep: () => {
      if (phase !== 'play' || purge || paused) throw new Error('Chỉ dùng được khi đang chơi ván');
      if (sleepUntil > Date.now()) throw new Error('Búp bê đang ngủ rồi');
      setLight('green', true, DOLL_SLEEP_MS);
      sleepUntil = lightEndsAt;
      broadcastPhase();
      ctx.broadcast('rl.fx', { kind: 'dollSleep', ms: DOLL_SLEEP_MS });
      say(pick(lines().dollSleep));
      return phaseInfo();
    },
    // Hồi sinh: tối đa REVIVE_MAX người vừa bị loại gần nhất (ưu tiên người xem thật) đứng dậy chạy tiếp ở chỗ cũ
    revive: () => {
      if (phase !== 'play' || purge) throw new Error('Chỉ dùng được khi đang chơi ván');
      const dead = reviveRecent(REVIVE_MAX);
      if (!dead.length) throw new Error('Chưa có ai bị loại để hồi sinh');
      const names = dead.filter((p) => !p.npc).map((p) => p.name);
      announce(
        names.length
          ? L(`Hồi sinh! ${names.slice(0, 3).join(', ')}${names.length > 3 ? ' và mấy người nữa' : ''} sống lại rồi!`, `Revive! ${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and a few others' : ''} are back in the game!`)
          : L('Hồi sinh! Có người vừa sống lại!', 'Revive! Someone is back in the game!')
      );
      return { revived: dead.map((p) => p.name) };
    },
    // Người điều phối thả cướp biển khổng lồ (lâu lâu một lần cho hấp dẫn) — chỉ khi đang chạy ván
    releaseGiant: () => {
      if (phase !== 'play' || purge) throw new Error('Chỉ thả được khi đang chơi ván');
      if (!releaseStomper(null, S().stompMax)) throw new Error('Không có ai đang chạy trên sân');
      announce(L('Cướp biển khổng lồ xuất hiện! Chạy khỏi đường nó đi!', 'The pirate giant is here! Get out of its way!'));
      return phaseInfo();
    },
    forceRed: () => {
      if (phase === 'play' && !purge) setLight('warn');
      return phaseInfo();
    },
    forceGreen: () => {
      if (phase === 'play' && !purge) setLight('green');
      return phaseInfo();
    },
    // Chọn kiểu hát cho lần đèn xanh kế tiếp (chỉ một lần)
    setNextSong: (params = {}) => {
      const mode = String(params.mode || 'random');
      if (mode !== 'random' && !MODES.includes(mode)) throw new Error(`Kiểu hát không hợp lệ: ${mode}`);
      nextSongMode = mode;
      broadcastPhase();
      return { next: mode, name: MODE_NAMES[mode] };
    },
    // Admin chơi thử như một người xem: vào chơi, thả tim, tặng quà. Đánh dấu người ảo nên không vào kỉ lục thật.
    testPlay: (params = {}) => {
      // TikTok coi người chơi / quà giả trên phòng đang live là tương tác giả
      if (ctx.isLive && ctx.isLive()) throw new Error('Phòng đang live thật: ngắt kết nối TikTok trước khi chơi thử');
      const u = testUser(params.name);
      testActiveUntil = Date.now() + 10 * 60 * 1000;
      const clampN = (v, max) => Math.max(1, Math.min(max, Math.round(Number(v) || 1)));
      ctx.simulated(() => {
        if (params.action === 'join') onEvent({ type: 'chat', user: u, text: 'vào' });
        else if (params.action === 'chat') onEvent({ type: 'chat', user: u, text: String(params.text || '').slice(0, 150) });
        else if (params.action === 'like') onEvent({ type: 'like', user: u, count: clampN(params.count, 50) });
        else if (params.action === 'gift') {
          const it = LEGEND.find((x) => x.kind === params.kind);
          if (!it) throw new Error(`Không có quà cho kỹ năng: ${params.kind}`);
          onEvent({ type: 'gift', user: u, giftName: it.tiktok, coins: it.coins, count: clampN(params.count, 10) });
        } else throw new Error(`Hành động thử không hợp lệ: ${params.action}`);
      });
      return testStatus(u);
    },
    testStatus: (params = {}) => testStatus(testUser(params.name)),
    // Đo độ trễ tim trên live thật (chỉ đọc số liệu + miễn bắn cho tài khoản đang đo)
    latencyReport: () => latencyReport(),
    setMeasureNames: (params = {}) => {
      const list = Array.isArray(params.names) ? params.names : String(params.names || '').split(/[,\n]/);
      measureNames = list.map(normName).filter(Boolean).slice(0, 10);
      ctx.save();
      return latencyReport();
    },
    clearLatency: () => {
      latency.length = 0;
      return latencyReport();
    },
    testCrowd: (params = {}) => {
      if (ctx.isLive && ctx.isLive()) throw new Error('Phòng đang live thật: không thêm người ảo');
      return ctx.simulated(() => sim.burst(Number(params.count) || 20));
    },
    testGift: () => {
      if (ctx.isLive && ctx.isLive()) throw new Error('Phòng đang live thật: không tặng quà thử');
      return ctx.simulated(() => sim.randomGift());
    },
    clearPlayers: () => {
      queue.clear();
      broadcastQueue();
      for (const p of [...players.values()]) removePlayer(p);
      return { ok: true };
    }
  };

  return {
    onEvent,
    rpc,
    simulate() {
      sim.burst(4);
    },
    onAutoSimChange(enabled) {
      sim.setRunning(enabled);
      if (!enabled) clearSimPlayers();
      if (phase === 'lobby') fillNpcs();
    },
    // Vừa kết nối live thật: không để người ảo / người chơi thử nào còn trên sân hay hàng chờ
    onLiveConnected() {
      sim.setRunning(false);
      testActiveUntil = 0; // thôi hiện kỉ lục của người ảo / người thử
      clearSimPlayers();
      if (phase === 'lobby') {
        fillNpcs(); // sân trống thì người máy vào lấp chỗ ngay
        broadcastRoster();
      }
      broadcastPhase();
    },
    onSettingsChanged(changed) {
      if ('lobbySeconds' in changed && phase === 'lobby') phaseEndsAt = phaseStartedAt + S().lobbySeconds * 1000;
      if (('npcMin' in changed || 'autoSim' in changed) && phase === 'lobby') {
        fillNpcs();
        broadcastRoster();
      }
      if ('autoLoop' in changed) broadcastPhase();
      // đổi ngôn ngữ: người máy đổi sang biệt danh theo ngôn ngữ mới
      if ('lang' in changed) {
        const names = (isEn() ? EN.NPC_NAMES : NPC_NAMES).slice().sort(() => Math.random() - 0.5);
        npcList().forEach((p, i) => {
          p.name = names[i % names.length];
        });
        broadcastRoster();
      }
    },
    getPublicState() {
      const real = realPlayers();
      return {
        rl: {
          ...phaseInfo(),
          roster: rosterView(),
          results,
          lastWinners,
          legend: LEGEND.map((it) => {
        if (isEn()) {
          const e = EN.LEGEND[it.kind] || {};
          const n = S().stompMax;
          return { ...it, gift: it.tiktok, label: e.label || it.label, short: typeof e.short === 'function' ? e.short(n) : e.short || it.short, desc: typeof e.desc === 'function' ? e.desc(n) : e.desc || it.desc };
        }
        return it.kind === 'stomp' ? { ...it, short: `DẪM ${S().stompMax}`, desc: `hoá khổng lồ chạy dẫm tối đa ${S().stompMax} người` } : it;
      }),
          queue: queueView(),
          queueNeed: S().queueLikes,
          counts: {
            players: real.length,
            alive: real.filter((p) => p.alive && !p.finishRank).length,
            finished: real.filter((p) => p.finishRank).length,
            clones: players.size - real.length
          }
        },
        topViewers: ctx.board.top(10)
      };
    },
    serialize() {
      return { round, lastWinners, records, measureNames };
    },
    dispose() {
      clearInterval(tickTimer);
      clearInterval(fxTimer);
      sim.setRunning(false);
    }
  };
}

module.exports = {
  id: 'redlight',
  name: 'Đèn Xanh – Đèn Đỏ',
  description: 'Game sinh tồn: bình luận để vào, thả tim để chạy, đèn đỏ phải đứng im. Quà là vật phẩm.',
  overlay: 'redlight.html',
  settingsSchema: {
    mishaps: 'boolean',
    mishapEverySec: [8, 90],
    mishapW_sun: [0, 10],
    mishapW_poop: [0, 10],
    mishapW_bee: [0, 10],
    mishapW_money: [0, 10],
    mishapW_sneeze: [0, 10],
    lobbySeconds: [5, 300],
    roundSeconds: [30, 600],
    resultSeconds: [5, 60],
    greenMin: [1, 20],
    greenMax: [1, 30],
    redMin: [2, 20],
    redMax: [2, 30],
    warnMs: [500, 4000],
    redGraceMs: [0, 9000],
    stepPerLike: [0.05, 5],
    maxPlayers: [5, 200],
    lateJoin: 'boolean',
    autoLoop: 'boolean',
    simCrowd: [5, 200],
    songEnabled: 'boolean',
    queueLikes: [1, 300],
    npcMin: [0, 30],
    commentLikes: [0, 20],
    momentumSec: [0, 60],
    stompMax: [1, 15],
    graceMinMs: [2000, 9000],
    perPlayerGrace: 'boolean',
    giftCam: 'boolean',
    graceMarginMs: [0, 5000],
    runSpeed: [2, 12],
    dollTurnVolume: [0, 1],
    songMode: { type: 'enum', values: ['random', ...MODES] },
    lang: { type: 'enum', values: ['vi', 'en'] },
    enVoice: { type: 'enum', values: ttsEn.VOICES }
  },
  defaultSettings: {
    mishaps: true, // tình huống ngẫu nhiên hài hước (say nắng, tuột quần, chim ị...)
    mishapEverySec: 20, // trung bình bao nhiêu giây một tình huống
    // tỉ lệ từng loại (0 = tắt): số càng lớn càng hay xảy ra
    mishapW_sun: 5,
    mishapW_poop: 5,
    mishapW_bee: 5,
    mishapW_money: 4,
    mishapW_sneeze: 5,
    lobbySeconds: 15,
    roundSeconds: 90,
    resultSeconds: 10,
    greenMin: 3,
    greenMax: 7,
    redMin: 8,
    redMax: 11,
    warnMs: 2000,
    // Hình trên TikTok tới người xem chậm 2–4 giây + tim gộp 1,2 giây + sự kiện về server chậm ~1 giây: chỉ bắt lỗi sau khoảng này.
    // Đèn đỏ đủ dài (5–8 giây) để người thả tim bất chấp vẫn bị bắt sau ân hạn.
    redGraceMs: 5500,
    stepPerLike: 0.8,
    maxPlayers: 120,
    lateJoin: true,
    autoLoop: true,
    simCrowd: 60,
    songEnabled: true, // đèn xanh theo câu hát của búp bê; tắt thì dùng greenMin/greenMax
    dollTurnVolume: 0.1, // âm lượng tiếng servo búp bê xoay đầu (0 = tắt, 1 = to nhất)
    giftCam: false, // camera lướt tới, zoom vào người tặng quà vài giây rồi quay về toàn sân
    lang: 'vi', // ngôn ngữ màn hình + giọng đọc: 'vi' (mặc định) hoặc 'en' (bản tiếng Anh)
    enVoice: ttsEn.DEFAULT_VOICE, // giọng đọc tiếng Anh (giọng macOS) khi lang = 'en'
    graceMinMs: GRACE_MIN, // ân hạn đèn đỏ chung cho mọi người (tối thiểu khi bật perPlayerGrace)
    perPlayerGrace: false, // bật: ân hạn từng người = độ trễ đo được lớn nhất + graceMarginMs (không nhỏ hơn graceMinMs)
    graceMarginMs: GRACE_MARGIN, // ân hạn = độ trễ lớn nhất đo được + chừng này
    runSpeed: BASE_SPEED, // bước/giây khi chạy (sân dài 120 bước)
    momentumSec: 20, // đà chạy: có tim / bình luận trong chừng này giây thì tự chạy suốt lúc búp bê hát (0 = tắt)
    commentLikes: 2, // 1 bình luận lúc búp bê hát = chừng này tim (0 = bình luận không giúp chạy)
    npcMin: 6, // sân ít người thật hơn số này thì thêm người máy cho đủ (0 = tắt)
    stompMax: 10, // Kính râm: khổng lồ dẫm tối đa chừng này người (mỗi quà)
    queueLikes: 50, // thả đủ chừng này tim là tham gia (lúc chờ: vào luôn; đang chơi: giữ chỗ hàng chờ ván sau)
    songMode: 'random',
    bgMusicEnabled: true,
    musicVolume: 0.55
  },
  create
};
