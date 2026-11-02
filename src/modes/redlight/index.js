const { sanitizeUserName, isBlockedSpamOrToxic } = require('../../util/sanitize');
const { LEGEND, itemForGift } = require('./items');
const { createSim } = require('./sim');

// ============================================================================
// CHẾ ĐỘ "ĐÈN XANH – ĐÈN ĐỎ" — game sinh tồn tương tác (xem docs/phong-den-do-den-xanh.md)
//   lobby  : bình luận để vào game, đứng ở vạch xuất phát
//   play   : đèn xanh → (báo trước) → đèn đỏ → đèn xanh… Thả tim / bình luận để chạy;
//            đèn đỏ mà còn động (sau thời gian ân hạn) là bị loại
//   result : top về đích, rồi ván mới
// Server là nguồn sự thật duy nhất: vị trí, sống/chết, thời điểm đổi đèn.
// ============================================================================

const TRACK = 100; // độ dài sân (đơn vị)
const TICK_MS = 100;
const BASE_SPEED = 3.2; // đơn vị/giây tối đa khi chạy bình thường (≈ 31 giây đèn xanh liên tục để về đích)
const MAX_CLONES_EACH = 10;
const MAX_CLONES_TOTAL = 300;

const LINES = {
  lobby: ['Bình luận bất kỳ để vào chơi. Ván mới sắp bắt đầu!', 'Ai muốn chơi thì bình luận nhé, sắp bắt đầu rồi!'],
  start: ['Bắt đầu! Đèn xanh, chạy nào!', 'Xuất phát! Thả tim để chạy!'],
  green: ['Đèn xanh!', 'Chạy đi!', 'Đèn xanh, chạy nào!'],
  red: ['Đèn đỏ!', 'Đứng im!', 'Đèn đỏ! Không được động!'],
  timeUp: ['Hết giờ!'],
  noWinner: ['Ván này chưa ai về đích. Ván sau cố lên nhé!']
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
  let finishCount = 0;
  let results = [];
  let lastWinners = Array.isArray(saved.lastWinners) ? saved.lastWinners.slice(0, 10) : [];

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
    if (announce) ctx.broadcast('rl.fx', { kind: 'join', id: p.id, name: p.name, num: p.num });
    return p;
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
  function redArmed(now = Date.now()) {
    return phase === 'play' && light === 'red' && now >= lightStartedAt + S().redGraceMs;
  }

  // Người chơi vừa "động" (thả tim / bình luận). Trả về true nếu được tiến lên.
  function move(p, units) {
    p.lastActiveAt = Date.now();
    if (phase !== 'play' || paused || !p.alive || p.finishRank) return false;
    if (light === 'red') {
      if (redArmed()) violate(p);
      return false;
    }
    p.pending = Math.min(p.pending + units, 12);
    for (const c of clonesOf(p)) c.pending = Math.min(c.pending + units, 12);
    return true;
  }

  function violate(p) {
    if (!p.alive || p.finishRank) return;
    if (p.shield > 0) {
      p.shield--;
      ctx.broadcast('rl.fx', { kind: 'shieldSave', id: p.id });
      return;
    }
    const clones = clonesOf(p);
    if (clones.length) {
      eliminate(clones[0], 'red');
      return;
    }
    eliminate(p, 'red');
  }

  function eliminate(p, cause) {
    if (!p.alive || p.finishRank) return;
    p.alive = false;
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
    if (p.finishRank <= 3) {
      const place = ['nhất', 'nhì', 'ba'][p.finishRank - 1];
      say(`Số ${p.num}, ${p.name}, về đích thứ ${place}!`);
      ctx.emitEvent({ type: 'rlFinish', user: p.name, num: p.num, rank: p.finishRank });
    }
  }

  function speedOf(p, now) {
    let v = BASE_SPEED;
    if (p.turboUntil > now) v *= 2;
    if (p.giantUntil > now) v *= 2.5;
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
      .filter((p) => !p.cloneOf && p !== except)
      .sort((a, b) => b.y - a.y)
      .slice(0, n);
  }

  function applyItem(p, item, count) {
    const now = Date.now();
    const n = Math.max(1, Math.min(count, 10));
    switch (item.kind) {
      case 'turbo':
        p.turboUntil = Math.max(p.turboUntil, now) + 2500;
        if (phase === 'play' && p.alive && !p.finishRank && light !== 'red') {
          p.pending = Math.min(p.pending + (item.bonus || 3) * n, 24);
        }
        break;
      case 'shield':
        p.shield = Math.min(3, p.shield + n);
        break;
      case 'buffalo': {
        const victims = runners()
          .filter((v) => v.key !== p.key && v.shield <= 0 && v.giantUntil < now)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3 * n);
        for (const v of victims) eliminate(v, 'buffalo');
        ctx.broadcast('rl.fx', { kind: 'buffalo', from: p.id, ids: victims.map((v) => v.id) });
        break;
      }
      case 'clones':
        addClones(p, 5 * n);
        if (item.turbo) p.turboUntil = Math.max(p.turboUntil, now) + 2500;
        break;
      case 'wind': {
        const hit = leaders(10 * n, p);
        for (const v of hit) v.y = Math.max(0, v.y - 15);
        ctx.broadcast('rl.fx', { kind: 'wind', from: p.id, ids: hit.map((v) => v.id) });
        break;
      }
      case 'giant':
        p.giantUntil = Math.max(p.giantUntil, now) + 10000 * n;
        rosterDirty = true;
        break;
      case 'chicken': {
        const [lead] = leaders(1, p);
        if (lead) {
          lead.chickenUntil = now + 8000;
          rosterDirty = true;
          ctx.broadcast('rl.fx', { kind: 'chicken', from: p.id, ids: [lead.id] });
        }
        break;
      }
      case 'teamShield': {
        const near = runners()
          .filter((v) => !v.cloneOf)
          .sort((a, b) => Math.hypot(a.x - p.x, (a.y - p.y) / 100) - Math.hypot(b.x - p.x, (b.y - p.y) / 100))
          .slice(0, 10);
        for (const v of near) v.shield = Math.min(3, v.shield + 1);
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
      warnMs: S().warnMs,
      serverNow: Date.now()
    };
  }

  function broadcastPhase() {
    ctx.broadcast('rl.phase', phaseInfo());
  }

  function enterLobby() {
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
        finishRank: 0,
        shield: 0,
        giantUntil: 0,
        chickenUntil: 0,
        turboUntil: 0,
        x: rand(0.06, 0.94)
      });
    }
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
    if (next === 'green') lightEndsAt = lightStartedAt + rand(st.greenMin, st.greenMax) * 1000;
    else if (next === 'warn') lightEndsAt = lightStartedAt + st.warnMs;
    else lightEndsAt = lightStartedAt + rand(st.redMin, st.redMax) * 1000;
    if (next === 'red') for (const p of players.values()) p.pending = 0;
    broadcastPhase();
    if (!quiet && next === 'warn') say(pick(LINES.red));
  }

  function endRound(reason) {
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
    // Bảng tuần: xếp theo số ván về đích / sống sót — không theo quà
    for (const p of real) {
      if (p.sim) continue;
      ctx.board.record(
        { user: p.name, uniqueId: p.key, avatar: p.avatar },
        { points: p.finishRank ? 3 : p.alive ? 1 : 0, stats: { rounds: 1, wins: p.finishRank ? 1 : 0 } }
      );
    }
    if (finished.length) lastWinners = finished.slice(0, 10).map((p) => ({ name: p.name, num: p.num, avatar: p.avatar }));
    ctx.save();
    rosterDirty = true;
    broadcastPhase();
    ctx.broadcast('rl.results', { round, results, reason });
    ctx.emitEvent({ type: 'rlResult', round, winners: finished.length, players: real.length });
    if (reason === 'time') say(pick(LINES.timeUp));
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
    } else if (phase === 'play') {
      if (now >= lightEndsAt) setLight(light === 'green' ? 'warn' : light === 'warn' ? 'red' : 'green');
      const dt = TICK_MS / 1000;
      let moved = false;
      for (const p of [...players.values()]) {
        if (!p.alive || p.finishRank || p.pending <= 0 || light === 'red') continue;
        const step = Math.min(p.pending, speedOf(p, now) * dt);
        p.pending -= step;
        p.y += step;
        moved = true;
        if (p.y >= TRACK) finish(p);
      }
      if (moved || rosterDirty) broadcastPositions();
      const live = runners().filter((p) => !p.cloneOf).length;
      if (now >= phaseEndsAt) endRound('time');
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
        if (!p) return join(u);
        const now = Date.now();
        // Bình luận cũng là "động": tiến 1,5 bước (tối đa 1 lần / 1,5 giây), đèn đỏ thì bị loại
        if (phase === 'play') {
          if (light === 'red') move(p, 0);
          else if (now - p.lastChatStepAt > 1500) {
            p.lastChatStepAt = now;
            move(p, 1.5);
          }
        } else p.lastActiveAt = now;
        return p;
      }
      case 'like': {
        const id = byKey.get(viewerKey(u));
        const p = id && players.get(id);
        if (!p) return null;
        move(p, Math.min(6, (Number(evt.count) || 1) * S().stepPerLike));
        return p;
      }
      case 'gift': {
        const p = join(u, { announce: true }) || players.get(byKey.get(viewerKey(u)));
        if (!p) return null;
        const item = itemForGift(evt.giftName, evt.coins);
        applyItem(p, item, Number(evt.count) || 1);
        p.lastActiveAt = Date.now();
        ctx.broadcast('rl.fx', {
          kind: 'gift',
          id: p.id,
          name: p.name,
          gift: evt.giftName,
          count: Number(evt.count) || 1,
          emoji: item.emoji,
          label: item.label,
          itemKind: item.kind
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
      if (!paused && phase === 'play') {
        // Tiếp tục: lùi mốc kết thúc để không mất thời gian lúc dừng
        phaseEndsAt = Math.max(phaseEndsAt, Date.now() + 10000);
        setLight('green', true);
      } else broadcastPhase();
      return phaseInfo();
    },
    forceRed: () => {
      if (phase === 'play') setLight('warn');
      return phaseInfo();
    },
    forceGreen: () => {
      if (phase === 'play') setLight('green');
      return phaseInfo();
    },
    testCrowd: (params = {}) => ctx.simulated(() => sim.burst(Number(params.count) || 20)),
    testGift: () => ctx.simulated(() => sim.randomGift()),
    clearPlayers: () => {
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
          legend: LEGEND,
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
      return { round, lastWinners };
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
    lobbySeconds: [5, 120],
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
    simCrowd: [5, 200]
  },
  defaultSettings: {
    lobbySeconds: 15,
    roundSeconds: 90,
    resultSeconds: 10,
    greenMin: 3,
    greenMax: 7,
    redMin: 4,
    redMax: 6,
    warnMs: 1500,
    // Hình trên TikTok tới người xem chậm vài giây + sự kiện về server chậm 1–3 giây: chỉ bắt lỗi sau khoảng này
    redGraceMs: 2500,
    stepPerLike: 0.8,
    maxPlayers: 120,
    lateJoin: true,
    autoLoop: true,
    simCrowd: 60,
    bgMusicEnabled: true,
    musicVolume: 0.55
  },
  create
};
