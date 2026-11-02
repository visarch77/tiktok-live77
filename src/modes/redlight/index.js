const { sanitizeUserName, isBlockedSpamOrToxic, sanitizeWishText } = require('../../util/sanitize');
const { LEGEND, itemForGift } = require('./items');
const { createSim } = require('./sim');
const { CUTS, MODES, MODE_NAMES, planSong } = require('./song');
const { ViewerBoard } = require('../../core/viewers');
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
const BASE_SPEED = 4.4; // đơn vị/giây tối đa khi chạy bình thường (≈ 23 giây đèn xanh liên tục để về đích)
// Số bước tim được dồn tối đa (≈ 6 giây chạy). Bước dồn KHÔNG mất khi đèn đỏ: hình TikTok tới người xem chậm 2–5 giây,
// tim bấm lúc họ còn thấy xanh/vàng về server khi đã đỏ — giữ lại để chạy tiếp ở đèn xanh sau.
// Mô phỏng với đèn xanh theo câu hát (2,6–9 giây tuỳ tốc độ), người thả tim hết công suất, dừng khi búp bê bắt đầu
// quay đầu, trễ 1–4,5 giây: về đích ~64–67 giây / ván 90 giây; người thả tim liên tục bất chấp đèn vẫn bị loại 100%.
const MAX_PENDING = 22;
const MAX_LIKE_STEP = 10; // bước tối đa cho một gói tim (TikTok gộp tim ~1,2 giây/gói)
const GRACE_MIN = 3000;
const GRACE_MAX = 9000;
const GRACE_MARGIN = 1500;
// Bị búp bê phát hiện: nháy đỏ trên màn hình chừng này rồi mới bị bắn (mỗi lần nháy đỏ là một phát bắn)
const SPOT_MS = 1200;
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
  lobby: ['Bình luận bất kỳ để vào chơi. Ván mới sắp bắt đầu!', 'Ai muốn chơi thì bình luận nhé, sắp bắt đầu rồi!'],
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
  let nextSongMode = null; // người điều phối chọn kiểu cho lần hát sau
  // Quà tặng lúc nhạc dừng (đèn đỏ): kỹ năng chạy / tấn công để dành, búp bê hát câu sau mới có tác dụng.
  // Khiên, khiên đội, bản sao (bảo vệ) vẫn có tác dụng ngay.
  const DEFER_KINDS = new Set(['turbo', 'buffalo', 'wind', 'giant', 'chicken', 'stomp']);
  let heldGifts = []; // [{ id, item, count }]
  let stompers = []; // khổng lồ đang chạy: { giverKey, path, startAt, cap, hit, count }
  const redActs = new Set(); // người vẫn thả tim sau khi nhạc dừng (màn hình vẽ đang chạy tại chỗ)
  let finishCount = 0;
  let results = [];
  let lastWinners = Array.isArray(saved.lastWinners) ? saved.lastWinners.slice(0, 10) : [];
  // Kỉ lục thời gian về đích nhanh nhất (mỗi người 1 dòng, giữ 10 người) — đứng thành hàng dưới tán cây
  const RECORDS_MAX = 10;
  let records = Array.isArray(saved.records) ? saved.records.slice(0, RECORDS_MAX) : [];
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
      sim: Boolean(u.sim)
    };
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
    return p;
  }

  // Lúc chờ ván: người đứng ở vạch xuất phát bình luận thì hiện trên đầu
  function sayFx(p, raw) {
    const text = sayText(raw);
    if (text) ctx.broadcast('rl.fx', { kind: 'say', id: p.id, text, ms: SAY_MS });
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
    q.ok = true;
    q.okAt = Date.now();
    broadcastQueue();
  }
  const SAY_MS = 6000; // bình luận hiện trên đầu người ở hàng chờ / người đứng chờ ván
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
  function graceFor(p) {
    const s = p.lagSamples;
    if (!s || !s.length) return S().redGraceMs;
    const sorted = [...s].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    return Math.max(GRACE_MIN, Math.min(GRACE_MAX, med + GRACE_MARGIN));
  }
  function redArmedFor(p, now = Date.now()) {
    return phase === 'play' && light === 'red' && now >= lightStartedAt + graceFor(p);
  }
  function measureLag(p, now) {
    // đo cả khi tim về lúc đã đỏ: người trễ nhiều hơn độ dài câu hát thì tim đầu tiên luôn về sau khi nhạc dừng
    if (!p.greenAt) return;
    const m = now - p.greenAt;
    p.greenAt = 0;
    if (m > 9000) return;
    p.lagSamples = [...(p.lagSamples || []).slice(-4), m];
  }

  // Người chơi vừa "động" (thả tim / bình luận). Trả về true nếu được tiến lên.
  function move(p, units) {
    p.lastActiveAt = Date.now();
    if (phase !== 'play' || paused || !p.alive || p.finishRank || p.doomAt) return false;
    if (units > 0) measureLag(p, Date.now());
    if (light === 'red' && redArmedFor(p)) {
      logViolation(p, units);
      violate(p);
      return false;
    }
    if (light === 'red') redActs.add(p.id);
    // Khổng lồ: mỗi lượt tim đi gấp đôi (chạy bị giới hạn bởi số tim, không phải tốc độ)
    if (p.giantUntil > Date.now()) units *= 2;
    // Đèn xanh/vàng: chạy ngay. Đỏ trong thời gian ân hạn: dồn lại, chạy khi xanh trở lại
    p.pending = Math.min(p.pending + units, MAX_PENDING);
    for (const c of clonesOf(p)) c.pending = Math.min(c.pending + units, MAX_PENDING);
    return light !== 'red';
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

  function eliminate(p, cause) {
    if (!p.alive || p.finishRank) return;
    p.alive = false;
    p.doomAt = 0;
    p.doomCause = '';
    p.pending = 0;
    p.deadAt = Date.now();
    rosterDirty = true;
    ctx.broadcast('rl.fx', { kind: 'out', id: p.id, cause, name: p.cloneOf ? '' : p.name, num: p.num });
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
      say(`Số ${p.num}, ${p.name}, về đích thứ ${place}!`);
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
    let v = BASE_SPEED;
    if (p.turboUntil > now) v *= 2;
    if (p.giantUntil > now) v *= 1.6;
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
        eliminate(v, 'stomp');
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
          p.pending = Math.min(p.pending + (item.bonus || 3) * n, MAX_PENDING + 8);
        }
        break;
      case 'shield':
        p.shield = Math.min(3, p.shield + n);
        break;
      case 'buffalo': {
        const victims = runners()
          .filter((v) => v.key !== p.key && v.shield <= 0 && v.giantUntil < now)
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.min(6, 2 * n));
        for (const v of victims) eliminate(v, 'buffalo');
        ctx.broadcast('rl.fx', { kind: 'buffalo', from: p.id, ids: victims.map((v) => v.id) });
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
      case 'stomp': {
        const others = runners().filter((v) => v.key !== p.key && !v.doomAt);
        if (!others.length) break;
        const path = stompPath(others);
        stompers.push({ giverKey: p.key, path, startAt: now, cap: S().stompMax * Math.min(n, 2), hit: new Set(), count: 0 });
        ctx.broadcast('rl.fx', { kind: 'stomp', from: p.id, path });
        break;
      }
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
    if (S().ttsEnabled === false || !ctx.tts || !ctx.tts.ready) return;
    ctx.tts
      .synthesize(text, S().ttsVoice)
      .then((res) => {
        if (res && res.ok) ctx.broadcast('rl.say', { text, url: res.url });
      })
      .catch(() => {});
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

  function phaseInfo() {
    return {
      phase,
      light,
      round,
      paused,
      phaseEndsAt,
      lightEndsAt,
      lightStartedAt,
      graceMs: S().redGraceMs,
      purging: Boolean(purge),
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
    purge = null;
    heldGifts = [];
    stompers = [];
    song = null;
    phase = 'lobby';
    phaseStartedAt = Date.now();
    phaseEndsAt = Date.now() + S().lobbySeconds * 1000;
    // Giữ lại người còn tương tác trong ván vừa rồi, bỏ bản sao & người đã rời
    const keepSince = Date.now() - 180000;
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
    rosterDirty = true;
    broadcastPhase();
    say(pick(LINES.lobby));
  }

  function startRound() {
    round++;
    phase = 'play';
    phaseStartedAt = Date.now();
    phaseEndsAt = Date.now() + S().roundSeconds * 1000;
    finishCount = 0;
    results = [];
    setLight('green', true);
    ctx.emitEvent({ type: 'rlRound', round, players: realPlayers().length });
    say(pick(LINES.start));
  }

  function setLight(next, quiet = false) {
    light = next;
    lightStartedAt = Date.now();
    const st = S();
    if (next === 'green') for (const p of players.values()) if (!p.cloneOf) p.greenAt = lightStartedAt;
    if (next === 'green' && st.songEnabled !== false) {
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
    if (!quiet && next === 'warn' && !song) say(pick(LINES.red));
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
    say(pick(LINES.timeUp));
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
      (p.sim ? simBoard : ctx.board).record(
        { user: p.name, uniqueId: p.key, avatar: p.avatar },
        { points: pts, stats: { rounds: 1, wins: p.finishRank ? 1 : 0, podium: p.finishRank && p.finishRank <= 3 ? 1 : 0 } }
      );
    }
    if (finished.length) lastWinners = finished.slice(0, 10).map((p) => ({ name: p.name, num: p.num, avatar: p.avatar }));
    ctx.save();
    rosterDirty = true;
    broadcastPhase();
    ctx.broadcast('rl.results', { round, results, reason });
    ctx.emitEvent({ type: 'rlResult', round, winners: finished.length, players: real.length });
    if (!finished.length) setTimeout(() => say(pick(LINES.noWinner)), 1500);
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
      const dt = TICK_MS / 1000;
      let moved = false;
      for (const p of [...players.values()]) {
        if (p.doomAt && now >= p.doomAt) eliminate(p, p.doomCause || 'red');
        if (!p.alive || p.finishRank || p.doomAt || p.pending <= 0 || light === 'red') continue;
        const step = Math.min(p.pending, speedOf(p, now) * dt);
        p.pending -= step;
        p.y += step;
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
      h: p.hue
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
    if (!ctx.tts) return;
    for (const t of [...LINES.green, ...LINES.red, ...LINES.start, ...LINES.lobby, ...LINES.timeUp]) {
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
          // đang chơi / xem kết quả: vào hàng chờ ván sau (phải thả đủ tim để giữ chỗ)
          if (phase !== 'lobby') {
            queueAdd(u);
            queueSay(u, evt.text);
            return null;
          }
          const np = join(u);
          if (np) sayFx(np, evt.text);
          return np;
        }
        const now = Date.now();
        // Bình luận lúc đèn xanh cũng tiến 1,5 bước (tối đa 1 lần / 1,5 giây)
        if (phase === 'play') {
          // Luật chỉ bắt người còn thả tim: bình luận lúc đèn đỏ không bị bắn (người xem hay chat)
          if (light === 'red') p.lastActiveAt = now;
          else if (now - p.lastChatStepAt > 1500) {
            p.lastChatStepAt = now;
            move(p, 1.5);
          }
        } else {
          p.lastActiveAt = now;
          if (phase === 'lobby') sayFx(p, evt.text);
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
        move(p, Math.min(MAX_LIKE_STEP, (Number(evt.count) || 1) * S().stepPerLike));
        return p;
      }
      case 'gift': {
        const p = join(u, { announce: true }) || players.get(byKey.get(viewerKey(u)));
        if (!p) return null;
        const item = itemForGift(evt.giftName, evt.coins);
        const held = phase === 'play' && light === 'red' && !purge && DEFER_KINDS.has(item.kind);
        if (held) heldGifts.push({ id: p.id, item, count: Number(evt.count) || 1 });
        else applyItem(p, item, Number(evt.count) || 1);
        p.lastActiveAt = Date.now();
        ctx.broadcast('rl.fx', {
          kind: 'gift',
          id: p.id,
          name: p.name,
          gift: evt.giftName,
          count: Number(evt.count) || 1,
          emoji: item.emoji,
          label: item.label,
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
    crowd: () => S().simCrowd
  });
  // Phòng khởi động lại khi giả lập đang bật: room.js không báo onAutoSimChange
  if (S().autoSim) sim.setRunning(true);

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
    testCrowd: (params = {}) => ctx.simulated(() => sim.burst(Number(params.count) || 20)),
    testGift: () => ctx.simulated(() => sim.randomGift()),
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
    },
    onSettingsChanged(changed) {
      if ('lobbySeconds' in changed && phase === 'lobby') phaseEndsAt = phaseStartedAt + S().lobbySeconds * 1000;
      if ('autoLoop' in changed) broadcastPhase();
    },
    getPublicState() {
      const real = realPlayers();
      return {
        rl: {
          ...phaseInfo(),
          roster: rosterView(),
          results,
          lastWinners,
          legend: LEGEND.map((it) => (it.kind === 'stomp' ? { ...it, short: `DẪM ${S().stompMax}`, desc: `hoá khổng lồ chạy dẫm tối đa ${S().stompMax} người` } : it)),
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
      return { round, lastWinners, records };
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
    lobbySeconds: [5, 300],
    roundSeconds: [30, 600],
    resultSeconds: [5, 60],
    greenMin: [1, 20],
    greenMax: [1, 30],
    redMin: [2, 20],
    redMax: [2, 30],
    warnMs: [500, 4000],
    redGraceMs: [0, 6000],
    stepPerLike: [0.05, 5],
    maxPlayers: [5, 200],
    lateJoin: 'boolean',
    autoLoop: 'boolean',
    simCrowd: [5, 200],
    songEnabled: 'boolean',
    queueLikes: [1, 300],
    stompMax: [1, 15],
    songMode: { type: 'enum', values: ['random', ...MODES] }
  },
  defaultSettings: {
    lobbySeconds: 15,
    roundSeconds: 90,
    resultSeconds: 10,
    greenMin: 3,
    greenMax: 7,
    redMin: 6,
    redMax: 9,
    warnMs: 2000,
    // Hình trên TikTok tới người xem chậm 2–4 giây + tim gộp 1,2 giây + sự kiện về server chậm ~1 giây: chỉ bắt lỗi sau khoảng này.
    // Đèn đỏ đủ dài (5–8 giây) để người thả tim bất chấp vẫn bị bắt sau ân hạn.
    redGraceMs: 4000,
    stepPerLike: 0.8,
    maxPlayers: 120,
    lateJoin: true,
    autoLoop: true,
    simCrowd: 60,
    songEnabled: true, // đèn xanh theo câu hát của búp bê; tắt thì dùng greenMin/greenMax
    stompMax: 5, // Kính râm: khổng lồ dẫm tối đa chừng này người (mỗi quà)
    queueLikes: 50, // thả đủ chừng này tim là tham gia (lúc chờ: vào luôn; đang chơi: giữ chỗ hàng chờ ván sau)
    songMode: 'random',
    bgMusicEnabled: true,
    musicVolume: 0.55
  },
  create
};
