const { sanitizeUserName, isBlockedSpamOrToxic } = require('../../util/sanitize');
const { BY_GIFT_ID } = require('../redlight/items');
const ttsEn = require('../redlight/tts-en');
const { SKILLS, LEGEND, skillForGift } = require('./skills');
const { skillComment, eventComment } = require('./commentary');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

// ============================================================================
// CHẾ ĐỘ "KÉO CO 4 ĐỘI" — giải đấu loại trực tiếp (xem docs/keo-co.md)
//   lobby    : bình luận số đội 1–4 để vào đội (đầy thì tự sang đội vắng nhất)
//   draw     : bốc thăm cặp bán kết
//   intro    : giới thiệu trận, đếm 3‑2‑1
//   pull     : hai đội thả tim để kéo
//   matchEnd : đội thua rơi xuống vực, đội thắng ăn mừng
//   champion : vinh danh đội vô địch + người kéo khoẻ nhất
// Server là nguồn sự thật: vị trí dây, lực từng người, thể lực, hiệu ứng kỹ năng.
// ============================================================================

const TICK_MS = 100;
const DT = TICK_MS / 1000;
const TEAM_IDS = [1, 2, 3, 4];
const TEAM_META = {
  1: { vi: 'Đỏ', en: 'Red', color: '#ff3b5c' },
  2: { vi: 'Xanh', en: 'Blue', color: '#2f8cff' },
  3: { vi: 'Vàng', en: 'Yellow', color: '#ffc928' },
  4: { vi: 'Tím', en: 'Purple', color: '#b45cff' }
};
// Lực kéo
const BUF_MAX = 6; // tim dồn tối đa (không tích trữ được)
const USE_PER_TICK = 0.6; // ≈ 6 tim/giây là trần có ích
const STAMINA_COST = 0.028; // mỗi tim dùng
const STAMINA_REGEN = 0.05; // mỗi nhịp không kéo (≈ 2 giây là đầy)
const WINDED_AT = 0.15;
const EXHAUST_MS = 2000;
const TEAM_EXP = 0.6; // F = Σ lực / N^0,6
const UNITY_BONUS = 0.25;
const K_ROPE = 0.17; // vận tốc dây (đơn vị/giây) trên mỗi đơn vị chênh lực
const ROPE_DAMP = 0.82;
const COMEBACK_FROM = 0.6;
const COMEBACK_MAX = 0.6;
const NPC_POWER = 0.55;
const COMMENT_LIKES = 2; // bình luận lúc kéo = 2 tim, tối đa 1 lần / 1,5 giây
const KEEP_ACTIVE_MS = 360000; // hết giải: ai im lặng quá 6 phút (hơn một giải) thì rời đội
const QUEUE_MAX = 200;

const LINES = {
  lobby: [
    'Kéo co bốn đội! Bình luận số đội một, hai, ba hoặc bốn để vào đội. Lúc đội mình ra sân, thả tim đều tay để kéo. Thả liên tục quá sẽ hụt hơi đó!',
    'Giải kéo co sắp bắt đầu! Bình luận số đội để tham gia. Hai trận bán kết, đội thắng vào chung kết. Tặng quà để dùng kỹ năng!'
  ],
  draw: ['Bốc thăm cặp đấu!'],
  pullGo: ['Kéo!', 'Bắt đầu kéo!', 'Kéo mạnh lên!'],
  noOne: ['Chưa có ai vào đội, các bạn máy kéo trước nhé! Bình luận số đội để vào chơi.']
};
const LINES_EN = {
  lobby: [
    'Four team tug of war! Comment team number one, two, three or four to join. When your team is on the field, tap hearts steadily to pull. Tapping nonstop wears you out!',
    'The tug of war cup is about to start! Comment a team number to join. Two semi finals, winners meet in the final. Send gifts to use skills!'
  ],
  draw: ['Drawing the matches!'],
  pullGo: ['Pull!', 'Start pulling!', 'Pull harder!'],
  noOne: ['No one has joined yet, the bots will pull first! Comment a team number to play.']
};
const NPC_NAMES = ['Bé Su', 'Tí Đẹp Trai', 'Hai Lúa', 'Mây Lang Thang', 'Sóc Nâu', 'Gió Đồng', 'Bin Bon', 'Nắng Mai', 'Đá Cuội', 'Cún Con',
  'Mèo Mập', 'Gấu Trúc', 'Tèo Em', 'Bông Gòn', 'Ốc Sên', 'Cá Mập Con', 'Bánh Bao', 'Kẹo Dẻo', 'Su Hào', 'Bắp Rang',
  'Chuột Lắt', 'Heo Hồng', 'Vịt Bầu', 'Cà Rốt', 'Mít Ướt', 'Trà Sữa', 'Xoài Non', 'Bí Đỏ', 'Ếch Xanh', 'Thỏ Ngọc',
  'Lạc Rang', 'Bánh Tét', 'Kem Que', 'Chè Bưởi', 'Bún Chả', 'Cơm Cháy', 'Bánh Đa', 'Xôi Gấc', 'Nem Chua', 'Mực Khô'];
const NPC_NAMES_EN = ['Lil Bean', 'Captain Nap', 'Sir Wobbles', 'Nugget', 'Pickle', 'Biscuit', 'Tater Tot', 'Mr. Waffles', 'Noodle', 'Cupcake',
  'Sneaky Pete', 'Muffin', 'Gummy Bear', 'Sprinkles', 'Snail Mail', 'Taco', 'Dumpling', 'Jellybean', 'Popcorn', 'Meatball',
  'Couch Potato', 'Pancake', 'Peanut', 'Bubbles', 'Cheeseball', 'Banana Bob', 'Hot Sauce', 'Marshmallow', 'Ninja Nana', 'Turbo Turtle',
  'Waffle Cone', 'Pretzel', 'Butterbean', 'Corndog', 'Fudge', 'Nacho', 'Tofu', 'Gravy', 'Pudding', 'Mochi'];
// Số nhân vật có tư thế kéo co (ảnh public/assets/keoco/v<N>_<tư thế>.webp); trùng danh sách nhân vật Đèn Đỏ trừ v24
const VARIANTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hashStr(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Đọc lựa chọn đội trong bình luận: "1", "đội 2", "doi3", "team 4", "đỏ", "xanh", "vàng", "tím", "red"…
function parseTeam(text) {
  const t = String(text || '').trim().toLowerCase().normalize('NFC');
  const m = t.match(/^(?:đội|doi|team|d|t)?\s*#?\s*([1-4])(?!\d)/) || t.match(/(?:đội|doi|team)\s*([1-4])(?!\d)/);
  if (m) return Number(m[1]);
  // màu phải có dấu ("tim" không dấu là thả tim, "do" là chữ thường gặp)
  if (/^(đội\s*)?(đỏ|red)(?![\p{L}])/u.test(t)) return 1;
  if (/^(đội\s*)?(xanh|blue)(?![\p{L}])/u.test(t)) return 2;
  if (/^(đội\s*)?(vàng|yellow)(?![\p{L}])/u.test(t)) return 3;
  if (/^(đội\s*)?(tím|purple)(?![\p{L}])/u.test(t)) return 4;
  return 0;
}

function create(ctx, saved = {}) {
  const S = () => ctx.settings;
  const isEn = () => S().lang === 'en';
  const L = (vi, en) => (isEn() ? en : vi);
  const lines = () => (isEn() ? LINES_EN : LINES);
  const teamName = (id) => L(`Đội ${id} ${TEAM_META[id].vi}`, `Team ${id} ${TEAM_META[id].en}`);
  const speakName = (n) => String(n || '').replace(/[^\p{L}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);

  let cup = Number(saved.cup) || 0; // số giải đã chơi
  let phase = 'lobby';
  let phaseStartedAt = Date.now();
  let phaseEndsAt = Date.now() + S().lobbySeconds * 1000;
  let paused = false;
  let pausedLeft = 0;
  // Giải đấu: 2 bán kết + chung kết. match = { id, a, b, winner, x, mvp }
  let bracket = null;
  let matchIdx = -1;
  let champion = null; // { team, mvp: [{name, force}], at }
  // Trận biểu diễn AI: chưa đủ 2 đội có người thì người máy tự kéo với nhau cho màn hình sinh động (không tính điểm)
  let exhibition = false;
  let history = Array.isArray(saved.history) ? saved.history.slice(0, 10) : []; // các giải gần nhất
  const teamWins = saved.teamWins && typeof saved.teamWins === 'object' ? { ...saved.teamWins } : { 1: 0, 2: 0, 3: 0, 4: 0 };

  // Dây: x ∈ [-1, 1], âm = về phía đội bên trái (a)
  const rope = { x: 0, v: 0, overtime: false, breakUntil: 0 };
  // Hiệu ứng theo đội (chỉ có nghĩa với hai đội đang ở trên sân)
  const fx = {};
  const resetFx = () => {
    for (const id of TEAM_IDS) fx[id] = { glue: 0, cheer: 0, grease: 0, heave: 0, strong: 0, jerkLog: [] };
  };
  resetFx();
  let refSleepUntil = 0; // trọng tài ngủ gật: không tính lực
  let hoDoUntil = 0; // trọng tài hô "HÒ DÔ": cả hai đội ×1,3
  const bank = { 1: [], 2: [], 3: [], 4: [] }; // kỹ năng để dành của đội chưa ra sân: [{ skill, giverKey, name }]
  let bankNextAt = 0;

  // Người chơi: khoá → { key, name, avatar, team, variant, … } (cả người máy, khoá "npc_…")
  const players = new Map();
  const queue = []; // phòng chờ: [{ key, name, avatar, want, at }]
  let rosterDirty = true;

  function viewerKey(u) {
    return String(u.uniqueId || u.user || '').slice(0, 40);
  }
  function variantFor(key) {
    return VARIANTS[hashStr(key) % VARIANTS.length];
  }
  function makePlayer(u, team, { npc = false } = {}) {
    const key = npc ? u.uniqueId : viewerKey(u);
    const p = {
      key,
      name: sanitizeUserName(u.user || u.uniqueId),
      avatar: u.avatar || '',
      team,
      variant: variantFor(key),
      npc,
      sim: Boolean(u.sim),
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
      lastChatPullAt: 0,
      // trong trận
      buffer: 0,
      stamina: 1,
      exhaustedUntil: 0,
      boostUntil: 0,
      dazedUntil: 0,
      tickledUntil: 0,
      slipUntil: 0,
      force: 0, // lực nhịp vừa rồi
      pulling: false,
      matchForce: 0,
      cupForce: 0,
      // người máy
      npcRate: npc ? rand(2.2, 4.2) : 0,
      npcRestUntil: 0,
      npcPullUntil: 0
    };
    players.set(key, p);
    rosterDirty = true;
    return p;
  }
  const humans = (team) => [...players.values()].filter((p) => !p.npc && (team == null || p.team === team));
  const members = (team) => [...players.values()].filter((p) => p.team === team);

  // ---- đội nào còn nhận người ----
  function eliminated(team) {
    if (!bracket || exhibition) return false;
    return bracket.some((m) => m.winner && (m.a === team || m.b === team) && m.winner !== team);
  }
  // Đội đủ người để thi đấu (người thật, kể cả người thử khi chưa live)
  function readyTeams() {
    return TEAM_IDS.filter((t) => humans(t).length >= S().minTeamPlayers);
  }
  function eligibleTeams() {
    if (phase === 'champion') return [];
    return TEAM_IDS.filter((t) => !eliminated(t) && humans(t).length < S().teamMax);
  }
  // Có được vào đội muốn không: chưa đầy và không đông hơn đội vắng nhất (trong các đội còn nhận) quá 2 người
  function placeTeam(want) {
    const el = eligibleTeams();
    if (!el.length) return { team: 0 };
    const count = (t) => humans(t).length;
    const minC = Math.min(...el.map(count));
    if (want && el.includes(want) && count(want) <= minC + 2) return { team: want };
    // đội vắng nhất; bằng nhau thì đội có tổng lực giải này thấp hơn (chia đều người kéo khoẻ), rồi ngẫu nhiên
    const best = shuffle(el).sort((x, y) => count(x) - count(y) || teamPower(x) - teamPower(y))[0];
    return { team: best, moved: Boolean(want) && want !== best };
  }
  function teamPower(t) {
    return humans(t).reduce((s, p) => s + p.cupForce, 0) / Math.max(1, humans(t).length);
  }

  // Giọng đọc: tổng hợp lần lượt từng câu (đúng thứ tự, không dồn). prio 2 = câu dẫn trận (luôn đọc),
  // 1 = bình luận kỹ năng, 0 = bình luận tình huống; câu bình luận chờ quá lâu thì bỏ (đã lỡ lúc)
  let lastSayAt = 0;
  const sayQ = [];
  let sayBusy = false;
  function say(text, { prio = 2, ttl = 15000 } = {}) {
    if (S().ttsEnabled === false || !text) return;
    lastSayAt = Date.now();
    if (prio < 2 && sayQ.length) return; // đang có câu chờ: bỏ câu bình luận này
    if (prio >= 2) for (let i = sayQ.length - 1; i >= 0; i--) if (sayQ[i].prio < 2) sayQ.splice(i, 1);
    sayQ.push({ text, prio, deadline: Date.now() + ttl });
    pumpSay();
  }
  function pumpSay() {
    if (sayBusy) return;
    const it = sayQ.shift();
    if (!it) return;
    if (Date.now() > it.deadline) return pumpSay();
    const engine = isEn() ? ttsEn : ctx.tts;
    if (!engine || (!isEn() && !engine.ready)) return pumpSay();
    sayBusy = true;
    const voice = isEn() ? S().enVoice : S().ttsVoice;
    Promise.resolve(engine.synthesize(it.text, voice))
      .then((res) => {
        if (res && res.ok && Date.now() < it.deadline + 2000) ctx.broadcast('kc.say', { text: it.text, url: res.url, prio: it.prio, at: Date.now() });
      })
      .catch(() => {})
      .finally(() => {
        sayBusy = false;
        pumpSay();
      });
  }
  const fxMsg = (kind, data = {}) => ctx.broadcast('kc.fx', { kind, ...data });
  // Bình luận viên: câu kỹ năng cách nhau ≥ 3 s, câu bình luận tình huống ≥ 12 s (thưa cho người xem đỡ mệt)
  function comment(text, prio = 1) {
    if (!text || Date.now() - lastSayAt < (prio >= 1 ? 3000 : 12000)) return false;
    say(text, { prio: Math.min(1, prio), ttl: prio >= 1 ? 4000 : 3000 });
    return true;
  }
  let cm = { danger: { a: false, b: false }, last10: false, exhaustAt: 0 };
  const lastSkillSay = {};

  // ---- vào đội ----
  function joinTeam(u, want, { quiet = false } = {}) {
    const key = viewerKey(u);
    if (!key) return null;
    const existing = players.get(key);
    if (existing) {
      existing.lastActiveAt = Date.now();
      // đổi đội: chỉ lúc chờ giải
      if (want && want !== existing.team && phase === 'lobby') {
        const r = placeTeam(want);
        if (r.team && r.team !== existing.team && !r.moved) {
          existing.team = r.team;
          rosterDirty = true;
          fxMsg('switch', { key, name: existing.name, team: r.team });
        } else if (r.moved || !r.team) fxMsg('full', { key, name: existing.name, want, team: existing.team });
      } else if (want && want !== existing.team && !quiet) fxMsg('stay', { key, name: existing.name, team: existing.team });
      return existing;
    }
    const r = placeTeam(want);
    if (!r.team) {
      // hết chỗ / đang chung kết mà đội muốn đã bị loại → phòng chờ giải sau
      if (!queue.some((q) => q.key === key) && queue.length < QUEUE_MAX) {
        queue.push({ key, name: sanitizeUserName(u.user || u.uniqueId), avatar: u.avatar || '', want, at: Date.now() });
        fxMsg('queue', { key, name: sanitizeUserName(u.user || u.uniqueId), pos: queue.length });
        rosterDirty = true;
      }
      return null;
    }
    const p = makePlayer(u, r.team);
    p.sim = Boolean(u.sim);
    fxMsg('join', { key, name: p.name, team: r.team, moved: r.moved ? want : 0 });
    // đang trận và đội đang kéo: "viện binh" vào cuối hàng
    if (onField(r.team)) refreshLineup();
    return p;
  }

  // ---- giải đấu ----
  const curMatch = () => (bracket && matchIdx >= 0 ? bracket[matchIdx] : null);
  function onField(team) {
    const m = curMatch();
    return Boolean(m && (phase === 'intro' || phase === 'pull' || phase === 'matchEnd') && (m.a === team || m.b === team));
  }
  // Hàng người trên sân mỗi bên: người thật xếp theo lực cả giải (khoẻ ở đầu dây), người máy lấp phía sau
  let lineup = { a: [], b: [] };
  let npcSeq = 0;
  function npcsFor(team, want) {
    const list = members(team).filter((p) => p.npc);
    const names = isEn() ? NPC_NAMES_EN : NPC_NAMES;
    while (list.length < want) {
      const used = new Set([...players.values()].filter((p) => p.npc).map((p) => p.name));
      const free = names.filter((n) => !used.has(n));
      const name = free.length ? pick(free) : `${L('Máy', 'Bot')} ${list.length + 1}`;
      npcSeq += 1;
      list.push(makePlayer({ user: name, uniqueId: `npc_${team}_${npcSeq}`, sim: true }, team, { npc: true }));
    }
    for (const p of list.slice(want)) players.delete(p.key);
    return list.slice(0, want);
  }
  function refreshLineup() {
    const m = curMatch();
    if (!m) return;
    const ha = humans(m.a);
    const hb = humans(m.b);
    // mỗi bên lấp người máy tới max(số người thật bên đông hơn, npcMin), không quá teamMax
    const size = clamp(Math.max(ha.length, hb.length, S().npcMin), 1, S().teamMax);
    const side = (team, hs) => {
      const sorted = hs.slice().sort((x, y) => y.cupForce - x.cupForce || x.joinedAt - y.joinedAt);
      const keep = sorted.slice(0, size);
      return keep.concat(npcsFor(team, Math.max(0, size - keep.length)));
    };
    // giữ thứ tự người đã đứng (không nhảy chỗ giữa trận), người mới vào cuối hàng
    const merge = (old, fresh) => {
      const set = new Set(fresh.map((p) => p.key));
      const kept = old.filter((k) => set.has(k));
      for (const p of fresh) if (!kept.includes(p.key)) kept.push(p.key);
      return kept;
    };
    lineup = { a: merge(lineup.a, side(m.a, ha)), b: merge(lineup.b, side(m.b, hb)) };
    rosterDirty = true;
  }
  const lineOf = (side) => lineup[side].map((k) => players.get(k)).filter(Boolean);

  function setPhase(next, ms) {
    phase = next;
    phaseStartedAt = Date.now();
    phaseEndsAt = ms ? phaseStartedAt + ms : 0;
    rosterDirty = true;
    broadcastPhase();
  }

  function enterLobby() {
    exhibition = false;
    champion = phase === 'champion' ? champion : null;
    bracket = null;
    matchIdx = -1;
    lineup = { a: [], b: [] };
    rope.x = 0;
    rope.v = 0;
    resetFx();
    for (const t of TEAM_IDS) bank[t] = [];
    // dọn: người máy, người im lặng lâu; người trong phòng chờ vào đội
    const now = Date.now();
    for (const p of [...players.values()]) {
      if (p.npc || now - p.lastActiveAt > KEEP_ACTIVE_MS) players.delete(p.key);
      else {
        p.cupForce = 0;
        p.matchForce = 0;
      }
    }
    setPhase('lobby', S().lobbySeconds * 1000);
    const waiting = queue.splice(0, queue.length);
    for (const q of waiting) joinTeam({ user: q.name, uniqueId: q.key, avatar: q.avatar }, q.want, { quiet: true });
    rebalance();
    setTimeout(() => {
      if (phase === 'lobby') say(pick(lines().lobby));
    }, 1500);
  }
  // Hai đội lệch quá 4 người thật: chuyển người mới vào gần nhất sang đội vắng (có báo)
  function rebalance() {
    for (let guard = 0; guard < 40; guard++) {
      const counts = TEAM_IDS.map((t) => ({ t, n: humans(t).length }));
      counts.sort((x, y) => y.n - x.n);
      const big = counts[0];
      const small = counts[counts.length - 1];
      if (big.n - small.n <= 4) break;
      const mover = humans(big.t).sort((x, y) => y.joinedAt - x.joinedAt)[0];
      mover.team = small.t;
      fxMsg('switch', { key: mover.key, name: mover.name, team: small.t, auto: true });
    }
    rosterDirty = true;
  }

  function startCup() {
    exhibition = false;
    cup += 1;
    const order = shuffle(TEAM_IDS);
    bracket = [
      { id: 's1', label: L('Bán kết 1', 'Semi-final 1'), a: order[0], b: order[1], winner: 0 },
      { id: 's2', label: L('Bán kết 2', 'Semi-final 2'), a: order[2], b: order[3], winner: 0 },
      { id: 'f', label: L('Chung kết', 'Final'), a: 0, b: 0, winner: 0 }
    ];
    matchIdx = -1;
    champion = null;
    for (const p of players.values()) p.cupForce = 0;
    setPhase('draw', 4500);
    say(`${pick(lines().draw)} ${L('Bán kết một', 'Semi final one')}: ${teamName(order[0])} ${L('gặp', 'versus')} ${teamName(order[1])}. ${L('Bán kết hai', 'Semi final two')}: ${teamName(order[2])} ${L('gặp', 'versus')} ${teamName(order[3])}.`);
    if (!humans().length) setTimeout(() => say(pick(lines().noOne)), 6000);
  }

  function startExhibition() {
    exhibition = true;
    // hai đội ngẫu nhiên, ưu tiên đội đã có người (cho họ kéo thử luôn)
    const withPeople = shuffle(TEAM_IDS.filter((t) => humans(t).length));
    const rest = shuffle(TEAM_IDS.filter((t) => !withPeople.includes(t)));
    const pair = withPeople.concat(rest).slice(0, 2);
    bracket = [{ id: 'x', label: L('Trận biểu diễn AI', 'AI show match'), a: pair[0], b: pair[1], winner: 0 }];
    champion = null;
    say(L('Chưa đủ hai đội, các bạn máy kéo biểu diễn trước nhé! Bình luận số đội để vào chơi thật.', 'Not enough teams yet, so the bots will put on a show! Comment a team number to play for real.'));
    startMatch(0);
  }

  function startMatch(idx) {
    matchIdx = idx;
    const m = bracket[idx];
    if (m.id === 'f') {
      m.a = bracket[0].winner;
      m.b = bracket[1].winner;
    }
    rope.x = 0;
    rope.v = 0;
    rope.overtime = false;
    rope.breakUntil = 0;
    rope.F = null;
    resetFx();
    refSleepUntil = 0;
    hoDoUntil = 0;
    lineup = { a: [], b: [] };
    for (const p of players.values()) {
      p.buffer = 0;
      p.stamina = 1;
      p.exhaustedUntil = p.boostUntil = p.dazedUntil = p.tickledUntil = p.slipUntil = 0;
      p.matchForce = 0;
      p.force = 0;
    }
    refreshLineup();
    setPhase('intro', 4500);
    say(`${m.label}: ${teamName(m.a)} ${L('gặp', 'versus')} ${teamName(m.b)}. ${L('Chuẩn bị thả tim!', 'Get ready to tap!')}`);
  }

  function beginPull() {
    setPhase('pull', S().matchSeconds * 1000);
    bankNextAt = Date.now() + 1500;
    cm = { danger: { a: false, b: false }, last10: false, exhaustAt: 0 };
    say(pick(lines().pullGo));
  }

  function endMatch(reason) {
    const m = curMatch();
    if (!m || m.winner) return;
    let winner;
    if (rope.x <= -1 || (reason !== 'ko' && rope.x < 0)) winner = m.a;
    else if (rope.x >= 1 || (reason !== 'ko' && rope.x > 0)) winner = m.b;
    else {
      // hoà tuyệt đối: đội góp nhiều lực hơn thắng
      const sum = (side) => lineOf(side).reduce((s, p) => s + p.matchForce, 0);
      winner = sum('a') >= sum('b') ? m.a : m.b;
    }
    m.winner = winner;
    m.x = rope.x;
    const winSide = winner === m.a ? 'a' : 'b';
    const mvp = lineOf(winSide)
      .filter((p) => !p.npc)
      .sort((x, y) => y.matchForce - x.matchForce)[0];
    m.mvp = mvp ? { name: mvp.name, force: Math.round(mvp.matchForce) } : null;
    // điểm cá nhân: lực đã kéo; đội thắng +20% (trận biểu diễn không tính)
    for (const side of exhibition ? [] : ['a', 'b']) {
      for (const p of lineOf(side)) {
        if (p.npc || p.sim) continue;
        const pts = Math.round(p.matchForce * (side === winSide ? 1.2 : 1));
        if (pts > 0) ctx.board.record({ user: p.name, uniqueId: p.key, avatar: p.avatar }, { points: pts, stats: { rounds: 1, wins: side === winSide ? 1 : 0 } });
      }
    }
    setPhase('matchEnd', 6000);
    fxMsg('matchEnd', { winner, loser: winner === m.a ? m.b : m.a, x: rope.x, mvp: m.mvp, reason });
    say(
      `${eventComment('fall', { o: teamName(winner === m.a ? m.b : m.a) }, isEn())} ` +
      `${teamName(winner)} ${L('thắng', 'wins')}${m.id === 'x' ? '' : m.id === 'f' ? L(' và vô địch', ' the cup') : L(', vào chung kết', ' and goes to the final')}! ` +
        (m.mvp ? `${L('Kéo khoẻ nhất', 'Strongest puller')}: ${speakName(m.mvp.name)}.` : '')
    );
  }

  function finishCup() {
    const fin = bracket[2];
    const team = fin.winner;
    teamWins[team] = (teamWins[team] || 0) + 1;
    const mvp = humans()
      .filter((p) => p.team === team)
      .sort((x, y) => y.cupForce - x.cupForce)
      .slice(0, 3)
      .map((p) => ({ name: p.name, force: Math.round(p.cupForce), variant: p.variant }));
    champion = { team, mvp, at: Date.now(), cup };
    history = [{ cup, team, mvp: mvp[0] ? mvp[0].name : '', at: Date.now() }, ...history].slice(0, 10);
    for (const p of humans().filter((x) => x.team === team && !x.sim)) ctx.board.record({ user: p.name, uniqueId: p.key, avatar: p.avatar }, { points: 10, stats: { podium: 1 } });
    ctx.save();
    setPhase('champion', S().championSeconds * 1000);
    fxMsg('champion', { team, mvp });
    say(`${L('Chúc mừng', 'Congratulations')} ${teamName(team)} ${L('vô địch giải kéo co!', 'champions of the tug of war cup!')}${mvp[0] ? ` ${L('Lực sĩ của giải', 'Cup MVP')}: ${speakName(mvp[0].name)}!` : ''}`);
  }

  // ---- kỹ năng ----
  function sideOf(team) {
    const m = curMatch();
    if (!m) return null;
    return m.a === team ? 'a' : m.b === team ? 'b' : null;
  }
  const otherTeam = (team) => {
    const m = curMatch();
    return m.a === team ? m.b : m.a;
  };
  const front = (team, n) => lineOf(sideOf(team)).slice(0, n);
  function extend(cur, ms, now, cap = 2) {
    const base = Math.max(cur, now);
    return Math.min(base + ms, now + ms * cap);
  }
  // Áp dụng kỹ năng cho đội đang trên sân. giver: người tặng (có thể null nếu là khán giả tiếp sức)
  function applySkill(team, skill, giver, name = '') {
    const now = Date.now();
    const s = SKILLS[skill];
    const opp = otherTeam(team);
    const blocked = s.attack && fx[opp].glue > now;
    const info = { skill, team, giver: giver ? giver.name : '', giverKey: giver ? giver.key : '', blocked };
    switch (skill) {
      case 'gong':
        if (giver && giver.team === team) {
          giver.boostUntil = extend(giver.boostUntil, 3000, now);
          giver.stamina = Math.min(1, giver.stamina + 0.3);
          giver.exhaustedUntil = 0;
        } else fx[team].heave = extend(fx[team].heave, 1500, now);
        break;
      case 'energy': {
        const line = lineOf(sideOf(team));
        const i = giver ? line.findIndex((p) => p.key === giver.key) : 0;
        const from = Math.max(0, i - 1);
        const targets = line.slice(from, from + 4);
        for (const p of targets) {
          p.stamina = 1;
          p.exhaustedUntil = 0;
        }
        info.targets = targets.map((p) => p.key);
        break;
      }
      case 'tickle':
        if (!blocked) {
          const t = front(opp, 1);
          for (const p of t) p.tickledUntil = now + 1500;
          info.targets = t.map((p) => p.key);
        }
        break;
      case 'glue':
        fx[team].glue = extend(fx[team].glue, 6000, now);
        break;
      case 'cheer':
        fx[team].cheer = extend(fx[team].cheer, 8000, now);
        break;
      case 'grease':
        if (!blocked) fx[opp].grease = extend(fx[opp].grease, 4000, now);
        break;
      case 'strong':
        fx[team].strong = extend(fx[team].strong, 8000, now);
        break;
      case 'fart':
        if (!blocked) {
          const t = front(opp, 5);
          for (const p of t) p.dazedUntil = now + 2000;
          info.targets = t.map((p) => p.key);
        }
        break;
      case 'heave':
        fx[team].heave = extend(fx[team].heave, 6000, now);
        break;
      case 'banana': {
        // giật dây về phía mình: tối đa 0,3 mỗi 10 giây cho mỗi đội
        const log = fx[team].jerkLog.filter((j) => now - j.at < 10000);
        const used = log.reduce((s, j) => s + j.amt, 0);
        const amt = Math.max(0, Math.min(0.15, 0.3 - used));
        if (amt > 0) {
          rope.x += sideOf(team) === 'a' ? -amt : amt;
          rope.v = 0;
          log.push({ at: now, amt });
        }
        fx[team].jerkLog = log;
        info.jerk = amt;
        if (!blocked) {
          const t = front(opp, 3);
          for (const p of t) p.slipUntil = now + 1500;
          info.targets = t.map((p) => p.key);
        }
        break;
      }
      default:
        break;
    }
    fxMsg('skill', info);
    // cùng một kỹ năng của cùng đội dùng liên tục: chỉ bình luận lần đầu trong 15 giây
    const sk = `${team}:${skill}`;
    if (now - (lastSkillSay[sk] || 0) < 15000) return;
    lastSkillSay[sk] = now;
    const victim = (info.targets || []).map((k) => players.get(k)).find((p) => p && !p.npc) || (info.targets || []).map((k) => players.get(k)).find(Boolean);
    comment(skillComment(skill, { n: speakName(name || (giver && giver.name)) || L('Khán giả', 'A viewer'), t: teamName(team), o: teamName(opp), v: victim ? speakName(victim.name) : '' }, isEn(), { blocked }));
  }
  function sayBanked(name, skill, team) {
    const s = SKILLS[skill];
    comment(skillComment(skill, { n: speakName(name), t: teamName(team), s: isEn() ? s.en : s.vi }, isEn(), { banked: true }));
  }

  // ---- nhịp game ----
  function pullTick(now) {
    const m = curMatch();
    const sleeping = now < refSleepUntil || now < rope.breakUntil;
    const hoDo = now < hoDoUntil ? 1.3 : 1;
    const F = {};
    for (const side of ['a', 'b']) {
      const team = m[side];
      const f = fx[team];
      const line = lineOf(side);
      let sum = 0;
      let active = 0;
      for (const p of line) {
        // người máy: kéo theo nhịp 3–6 giây, nghỉ 1–2 giây (đều tay như người chơi giỏi vừa phải)
        if (p.npc) {
          if (now > p.npcPullUntil && now > p.npcRestUntil) p.npcPullUntil = now + rand(3000, 6000);
          if (now < p.npcPullUntil) {
            p.buffer = Math.min(BUF_MAX, p.buffer + p.npcRate * DT);
            if (now + TICK_MS >= p.npcPullUntil) p.npcRestUntil = now + rand(900, 2000);
          }
        }
        const out = now < p.exhaustedUntil || now < p.dazedUntil || now < p.tickledUntil || now < p.slipUntil;
        let use = out ? 0 : Math.min(p.buffer, USE_PER_TICK);
        p.buffer = Math.max(0, p.buffer - use);
        const heave = now < f.heave;
        if (use > 0) {
          if (!heave) p.stamina -= use * STAMINA_COST;
          if (p.stamina <= 0) {
            p.stamina = 0.3;
            p.exhaustedUntil = now + EXHAUST_MS;
            fxMsg('exhaust', { key: p.key });
            if (!p.npc && now - cm.exhaustAt > 12000 && comment(eventComment('exhaust', { v: speakName(p.name) }, isEn()), 0)) cm.exhaustAt = now;
          }
        } else if (!out || now < p.exhaustedUntil) {
          p.stamina = Math.min(1, p.stamina + STAMINA_REGEN * (now < f.cheer ? 2 : 1));
        }
        const stam = p.stamina > WINDED_AT ? 0.3 + 0.7 * p.stamina : 0.3;
        let mult = (now < p.boostUntil ? 2 : 1) * (heave ? 1.5 : 1) * (now < f.grease ? 0.5 : 1) * hoDo * (p.npc ? NPC_POWER : 1);
        if (sleeping) mult = 0;
        const force = use * stam * mult;
        p.force = force;
        p.pulling = use > 0;
        if (use > 0) active++;
        p.matchForce += force;
        p.cupForce += force;
        sum += force;
      }
      const n = Math.max(1, line.length);
      let force = (sum / Math.pow(n, TEAM_EXP)) * (1 + UNITY_BONUS * (active / n));
      // lực sĩ: bằng 4 người kéo khoẻ chia như một người trong đội
      if (now < f.strong && !sleeping) force += (4 * 0.5 * USE_PER_TICK) / Math.pow(n, TEAM_EXP);
      F[side] = force;
    }
    // gồng chân lúc nguy: bên đang bị kéo về phía mình
    const ax = Math.abs(rope.x);
    if (ax > COMEBACK_FROM) {
      const bonus = 1 + (COMEBACK_MAX * (ax - COMEBACK_FROM)) / (1 - COMEBACK_FROM);
      if (rope.x < 0) F.b *= bonus; // dây đang về phía a → b là bên bị kéo
      else F.a *= bonus;
    }
    const net = F.a - F.b; // a kéo về âm
    rope.v = rope.v * ROPE_DAMP + net * K_ROPE * (1 - ROPE_DAMP); // ổn định ở v = net × K_ROPE
    rope.x = clamp(rope.x - rope.v * DT, -1.05, 1.05);
    rope.F = F;
    if (Math.abs(rope.x) >= 1) endMatch('ko');
  }

  // Bình luận tình huống: sát mép vực, lội ngược dòng, 10 giây cuối, lúc trận im ắng thì khen / chọc người kéo
  function commentTick(now) {
    const m = curMatch();
    const en = isEn();
    for (const side of ['a', 'b']) {
      // dây về phía b (x > 0) → a bị lôi ra mép vực
      const pulledOff = side === 'a' ? rope.x > 0.65 : rope.x < -0.65;
      if (pulledOff && !cm.danger[side]) {
        cm.danger[side] = true;
        comment(eventComment('danger', { o: teamName(m[side]) }, en), 1);
      } else if (cm.danger[side] && Math.abs(rope.x) < 0.15) {
        cm.danger[side] = false;
        comment(eventComment('comeback', { t: teamName(m[side]) }, en), 1);
      }
    }
    if (!cm.last10 && phaseEndsAt - now < 10500 && phaseEndsAt - now > 8000) {
      cm.last10 = true;
      comment(eventComment('last10', {}, en), 1);
      return;
    }
    if (now - lastSayAt < 15000) return;
    const all = [...lineOf('a'), ...lineOf('b')].filter((p) => !p.npc && p.matchForce > 0);
    const star = all.sort((x, y) => y.matchForce - x.matchForce)[0];
    const r = Math.random();
    if (Math.abs(rope.x) < 0.15 && r < 0.4) comment(eventComment('even', {}, en), 0);
    else if (star && r < 0.75) comment(eventComment('star', { v: speakName(star.name) }, en), 0);
    else if (Math.abs(rope.x) > 0.25) comment(eventComment('lazy', { t: teamName(rope.x > 0 ? m.a : m.b) }, en), 0);
    else lastSayAt = now - 3000; // không có gì để nói: thử lại sau ít giây
  }

  function releaseBank(now) {
    if (now < bankNextAt) return;
    bankNextAt = now + 3000;
    const m = curMatch();
    for (const team of [m.a, m.b]) {
      const b = bank[team];
      if (!b.length) continue;
      const it = b.shift();
      applySkill(team, it.skill, players.get(it.giverKey) || null, it.name);
    }
  }

  function tick() {
    const now = Date.now();
    if (paused) return;
    if (phase === 'lobby') {
      // đủ người thì rút ngắn chờ
      const enough = humans().length >= S().fastStartPlayers;
      if (enough && phaseEndsAt - now > 10000) phaseEndsAt = now + 10000;
      if (now >= phaseEndsAt && S().autoLoop !== false) {
        if (readyTeams().length >= 2) startCup();
        else if (S().aiShow !== false) startExhibition();
        else {
          // chưa đủ 2 đội: chờ thêm
          phaseEndsAt = now + 15000;
          broadcastPhase();
        }
      }
    } else if (phase === 'draw') {
      if (now >= phaseEndsAt) startMatch(0);
    } else if (phase === 'intro') {
      if (now >= phaseEndsAt) beginPull();
    } else if (phase === 'pull') {
      // đang biểu diễn mà đã đủ 2 đội người thật: kết thúc sớm để vào giải thật
      if (exhibition && readyTeams().length >= 2 && phaseEndsAt - now > 5000) {
        phaseEndsAt = now + 5000;
        broadcastPhase();
        fxMsg('ready', {});
        say(L('Đủ hai đội rồi! Chuẩn bị vào giải thật!', 'Two teams are ready! Get set for the real cup!'));
      }
      pullTick(now);
      if (phase === 'pull') releaseBank(now);
      if (phase === 'pull') commentTick(now);
      if (phase === 'pull' && now >= phaseEndsAt) {
        if (Math.abs(rope.x) < 0.05 && !rope.overtime) {
          rope.overtime = true;
          phaseEndsAt = now + 10000;
          broadcastPhase();
          fxMsg('overtime', {});
          say(L('Hoà sát nút! Thêm mười giây phút chót!', 'Too close! Ten more seconds!'));
        } else endMatch('time');
      }
    } else if (phase === 'matchEnd') {
      if (now >= phaseEndsAt) {
        if (exhibition) {
          exhibition = false;
          enterLobby();
          // đã đủ người thì chờ ngắn thôi
          if (readyTeams().length >= 2) phaseEndsAt = Date.now() + 10000;
        } else if (matchIdx < 2) startMatch(matchIdx + 1);
        else finishCup();
      }
    } else if (phase === 'champion') {
      if (now >= phaseEndsAt) enterLobby();
    }
    if (rosterDirty) {
      rosterDirty = false;
      broadcastRoster();
    }
  }
  let lastLive = 0;
  function liveTick() {
    if (phase !== 'pull' && phase !== 'intro' && phase !== 'matchEnd') return;
    const now = Date.now();
    if (now - lastLive < 180) return;
    lastLive = now;
    ctx.broadcast('kc.live', liveView());
  }
  const tickTimer = setInterval(() => {
    tick();
    liveTick();
  }, TICK_MS);

  // ---- dữ liệu gửi màn hình ----
  function teamView(t) {
    const hs = humans(t);
    const m = curMatch();
    let status = 'wait';
    if (bracket) {
      if (eliminated(t)) status = 'out';
      else if (champion && champion.team === t) status = 'champ';
      else if (onField(t)) status = 'field';
      else if (!exhibition && bracket.some((x) => x.winner === t)) status = 'final';
      else status = 'wait';
      // trận kế tiếp của đội (để người chơi biết khi nào tới lượt)
    }
    let nextIn = null;
    if (bracket && !exhibition && status !== 'out' && status !== 'champ' && status !== 'field') {
      const idx = bracket.findIndex((x, i) => i > matchIdx && !x.winner && (x.a === t || x.b === t || (x.id === 'f' && status === 'final')));
      if (idx >= 0) nextIn = idx - Math.max(matchIdx, -1);
    }
    return {
      id: t,
      name: TEAM_META[t][isEn() ? 'en' : 'vi'],
      color: TEAM_META[t].color,
      count: hs.length,
      max: S().teamMax,
      status,
      nextIn,
      wins: teamWins[t] || 0,
      bank: bank[t].length,
      top: hs
        .slice()
        .sort((x, y) => y.cupForce - x.cupForce || x.joinedAt - y.joinedAt)
        .slice(0, 10)
        .map((p) => ({ key: p.key, name: p.name, force: Math.round(p.cupForce), variant: p.variant })),
      onLine: m && onField(t) ? lineup[sideOf(t)].length : 0
    };
  }
  function lineView(side) {
    return lineOf(side).map((p) => ({ k: p.key, n: p.name, v: p.variant, npc: p.npc ? 1 : 0 }));
  }
  function liveView() {
    const now = Date.now();
    const m = curMatch();
    const st = (p) => {
      if (now < p.slipUntil) return 'slip';
      if (now < p.exhaustedUntil) return 'tired';
      if (now < p.dazedUntil) return 'dazed';
      if (now < p.tickledUntil) return 'tickle';
      if (!p.pulling) return 'idle';
      if (now < p.boostUntil || p.stamina <= WINDED_AT) return 'strain';
      return 'pull';
    };
    const side = (s) => lineOf(s).map((p) => [p.key, st(p), Math.round(p.stamina * 100), Math.round(p.force * 100)]);
    const team = (t) => {
      const f = fx[t];
      return { glue: f.glue > now ? f.glue - now : 0, cheer: f.cheer > now ? f.cheer - now : 0, grease: f.grease > now ? f.grease - now : 0, heave: f.heave > now ? f.heave - now : 0, strong: f.strong > now ? f.strong - now : 0 };
    };
    return {
      x: Math.round(rope.x * 1000) / 1000,
      fa: rope.F ? Math.round(rope.F.a * 100) / 100 : 0,
      fb: rope.F ? Math.round(rope.F.b * 100) / 100 : 0,
      a: side('a'),
      b: side('b'),
      ta: m ? team(m.a) : null,
      tb: m ? team(m.b) : null,
      sleep: refSleepUntil > now ? refSleepUntil - now : 0,
      hoDo: hoDoUntil > now ? hoDoUntil - now : 0,
      broke: rope.breakUntil > now ? rope.breakUntil - now : 0
    };
  }
  // Phiên bản mã màn hình: màn hình đang chạy bản cũ thì tự tải lại lúc không có trận
  function clientVersion() {
    try {
      return Math.round(fs.statSync(path.join(config.PUBLIC_DIR, 'js/keoco.js')).mtimeMs);
    } catch (_) {
      return 0;
    }
  }
  function phaseInfo() {
    return {
      phase,
      cup,
      paused,
      phaseStartedAt,
      phaseEndsAt,
      serverNow: Date.now(),
      overtime: rope.overtime,
      bracket,
      matchIdx,
      champion,
      exhibition,
      ready: readyTeams(),
      minTeamPlayers: S().minTeamPlayers,
      clientV: clientVersion()
    };
  }
  function broadcastPhase() {
    ctx.broadcast('kc.phase', phaseInfo());
  }
  function rosterView() {
    return {
      teams: TEAM_IDS.map(teamView),
      lineA: lineView('a'),
      lineB: lineView('b'),
      queue: queue.slice(0, 30).map((q, i) => ({ name: q.name, pos: i + 1 })),
      queueCount: queue.length,
      players: humans().length
    };
  }
  function broadcastRoster() {
    ctx.broadcast('kc.roster', rosterView());
  }

  // ---- sự kiện TikTok ----
  function onEvent(evt) {
    const u = evt.user || {};
    const key = viewerKey(u);
    switch (evt.type) {
      case 'chat': {
        if (isBlockedSpamOrToxic(evt.text)) return null;
        const want = parseTeam(evt.text);
        let p = players.get(key);
        if (!p || want) p = joinTeam(u, want) || p;
        if (!p) return null;
        p.lastActiveAt = Date.now();
        const text = String(evt.text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (text) fxMsg('say', { key: p.key, text });
        // bình luận lúc đội mình đang kéo = 2 tim (tối đa 1 lần / 1,5 giây)
        const now = Date.now();
        if (phase === 'pull' && onField(p.team) && now - p.lastChatPullAt > 1500) {
          p.lastChatPullAt = now;
          p.buffer = Math.min(BUF_MAX, p.buffer + COMMENT_LIKES);
        }
        return p;
      }
      case 'like': {
        let p = players.get(key);
        if (!p) p = joinTeam(u, 0, { quiet: true });
        if (!p) return null;
        p.lastActiveAt = Date.now();
        if (phase === 'pull' && onField(p.team)) p.buffer = Math.min(BUF_MAX, p.buffer + (Number(evt.count) || 1));
        return p;
      }
      case 'gift': {
        let p = players.get(key) || joinTeam(u, 0, { quiet: true });
        const skill = skillForGift(evt.giftName, evt.coins, evt.giftId);
        const count = Math.min(3, Math.max(1, Number(evt.count) || 1));
        const name = p ? p.name : sanitizeUserName(u.user || u.uniqueId);
        const m = curMatch();
        let team = p ? p.team : 0;
        let mode = 'now';
        if (p) p.lastActiveAt = Date.now();
        // khán giả (phòng chờ / đội đã bị loại): tiếp sức cho đội đang thua trên sân
        if ((!p || eliminated(p.team)) && m && phase === 'pull') {
          team = rope.x < 0 ? m.b : m.a;
          mode = 'support';
        }
        if (!team) return p;
        if (phase === 'pull' && onField(team)) {
          for (let i = 0; i < count; i++) applySkill(team, skill, p && p.team === team ? p : null, name);
        } else if (!eliminated(team) && phase !== 'champion') {
          // đội chưa ra sân: để dành, tự dùng khi đội ra sân (mỗi 3 giây một kỹ năng)
          for (let i = 0; i < count && bank[team].length < 6; i++) bank[team].push({ skill, giverKey: p ? p.key : '', name });
          mode = 'bank';
          rosterDirty = true;
        } else return p;
        const giftLabel = isEn() ? (BY_GIFT_ID[String(evt.giftId || '')] ? String(BY_GIFT_ID[String(evt.giftId)]).replace(/\b\w/g, (c) => c.toUpperCase()) : evt.giftName) : evt.giftName;
        fxMsg('gift', { key: p ? p.key : '', name, team, gift: giftLabel, count, skill, mode });
        if (mode === 'bank') sayBanked(name, skill, team);
        ctx.emitEvent({ type: 'kcGift', user: name, gift: evt.giftName, label: SKILLS[skill].vi, emoji: SKILLS[skill].emoji });
        return p;
      }
      default:
        return null;
    }
  }

  // ---- giả lập (chỉ khi chưa live) ----
  const SIM_FAMILY = 'Nguyễn Trần Lê Phạm Hoàng Huỳnh Phan Vũ Võ Đặng Bùi Đỗ Hồ Ngô Dương'.split(' ');
  const SIM_GIVEN = 'Lan Hùng Mai Tuấn Linh Khang Trang Phong Thảo Nam Vy Huy Nhi Long Hà Quân Yến Đạt Chi Sơn'.split(' ');
  let simSeq = 0;
  const simPeople = [];
  let simTimer = null;
  function simUser() {
    simSeq += 1;
    return { user: `${pick(SIM_FAMILY)} ${pick(SIM_GIVEN)}`, uniqueId: `sim_${simSeq}`, avatar: '', sim: true };
  }
  function simBurst(n) {
    let added = 0;
    for (let i = 0; i < n; i++) {
      const u = simUser();
      const want = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 4) : 0;
      ctx.simulated(() => onEvent({ type: 'chat', user: u, text: want ? String(want) : 'vào' }));
      simPeople.push({ u, rate: rand(1.5, 6), style: Math.random() < 0.3 ? 'spam' : 'steady' });
      added++;
    }
    if (!simTimer) simTimer = setInterval(simStep, 400);
    return { added };
  }
  function simStep() {
    if (ctx.isLive && ctx.isLive()) return;
    for (const s of simPeople) {
      const p = players.get(s.u.uniqueId);
      if (!p || phase !== 'pull' || !onField(p.team)) continue;
      // "spam": thả liên tục rồi kiệt; "steady": đều tay có nghỉ
      const boost = s.boostUntil && Date.now() < s.boostUntil;
      const n = boost ? 3 : s.style === 'spam' ? Math.round(s.rate * 0.4 + 1) : Math.random() < 0.8 ? Math.round(s.rate * 0.4) : 0;
      if (n > 0) ctx.simulated(() => onEvent({ type: 'like', user: s.u, count: n }));
    }
  }
  function simClear() {
    clearInterval(simTimer);
    simTimer = null;
    simPeople.length = 0;
    for (const p of [...players.values()]) if (p.sim && !p.npc) players.delete(p.key);
    for (let i = queue.length - 1; i >= 0; i--) if (String(queue[i].key).startsWith('sim_')) queue.splice(i, 1);
    rosterDirty = true;
  }

  const notLive = (what) => {
    if (ctx.isLive && ctx.isLive()) throw new Error(`Phòng đang live thật: không ${what}`);
  };
  const rpc = {
    startCup: () => {
      paused = false;
      if (phase === 'lobby' || phase === 'champion') startCup();
      return phaseInfo();
    },
    // Kết thúc trận đang kéo ngay (bên đang được lợi thắng)
    endMatch: () => {
      if (phase === 'pull') endMatch('admin');
      else if (phase === 'intro') beginPull();
      return phaseInfo();
    },
    newLobby: () => {
      paused = false;
      enterLobby();
      return phaseInfo();
    },
    pause: (params = {}) => {
      const want = params.paused === undefined ? !paused : Boolean(params.paused);
      if (want && !paused) {
        pausedLeft = phaseEndsAt ? Math.max(0, phaseEndsAt - Date.now()) : 0;
        paused = true;
      } else if (!want && paused) {
        paused = false;
        if (phaseEndsAt) phaseEndsAt = Date.now() + Math.max(pausedLeft, 5000);
      }
      broadcastPhase();
      return phaseInfo();
    },
    // Trò của người điều phối
    ropeBreak: () => {
      if (phase !== 'pull') throw new Error('Chỉ dùng khi đang kéo');
      rope.breakUntil = Date.now() + 2200;
      rope.v = 0;
      for (const side of ['a', 'b']) for (const p of lineOf(side)) p.slipUntil = Date.now() + 1800;
      fxMsg('ropeBreak', { ms: 2200 });
      say(L('Ối! Dây đứt! Ngã hết rồi!', 'Whoa! The rope snapped! Everyone fell!'));
      return phaseInfo();
    },
    refSleep: () => {
      if (phase !== 'pull') throw new Error('Chỉ dùng khi đang kéo');
      refSleepUntil = Date.now() + 4000;
      fxMsg('refSleep', { ms: 4000 });
      say(L('Trọng tài ngủ gật! Kéo cũng như không!', 'The referee fell asleep! Pulling does nothing now!'));
      return phaseInfo();
    },
    hoDo: () => {
      if (phase !== 'pull') throw new Error('Chỉ dùng khi đang kéo');
      hoDoUntil = Date.now() + 3000;
      fxMsg('hoDo', { ms: 3000 });
      say(L('Hò dô! Hò dô! Kéo mạnh lên!', 'Heave ho! Heave ho! Pull hard!'));
      return phaseInfo();
    },
    testCrowd: (params = {}) => {
      notLive('thêm người ảo');
      return simBurst(Math.min(80, Number(params.count) || 30));
    },
    testGift: () => {
      notLive('tặng quà thử');
      const pool = simPeople.length ? simPeople : null;
      if (!pool) throw new Error('Chưa có người ảo — bấm "Thêm người thử" trước');
      const s = pick(pool);
      const it = pick(LEGEND);
      ctx.simulated(() => onEvent({ type: 'gift', user: s.u, giftName: it.tiktok, coins: it.coins, count: 1 }));
      return { user: s.u.user, gift: it.tiktok };
    },
    // Chơi thử theo đội (chỉ khi chưa live): thêm người vào đúng đội, cho cả đội thả tim, dùng kỹ năng của đội
    testJoin: (params = {}) => {
      notLive('thêm người thử');
      const team = clamp(Number(params.team) || 1, 1, 4);
      const n = clamp(Number(params.count) || 1, 1, 20);
      let added = 0;
      for (let i = 0; i < n; i++) {
        const u = simUser();
        ctx.simulated(() => onEvent({ type: 'chat', user: u, text: String(team) }));
        const p = players.get(u.uniqueId);
        if (p && p.team !== team && phase === 'lobby') p.team = team; // thử: vào đúng đội đã chọn
        simPeople.push({ u, rate: rand(3, 5), style: 'steady', team });
        if (p) added++;
      }
      if (!simTimer) simTimer = setInterval(simStep, 400);
      refreshLineup();
      rosterDirty = true;
      return { added, team };
    },
    testLikes: (params = {}) => {
      notLive('thả tim thử');
      const team = clamp(Number(params.team) || 1, 1, 4);
      const until = Date.now() + clamp(Number(params.seconds) || 10, 1, 60) * 1000;
      let n = 0;
      for (const sp of simPeople) {
        const p = players.get(sp.u.uniqueId);
        if (p && p.team === team) {
          sp.boostUntil = until;
          n++;
        }
      }
      if (!n) throw new Error(`Đội ${team} chưa có người thử — bấm "Thêm người" trước`);
      return { team, players: n };
    },
    testSkill: (params = {}) => {
      notLive('dùng kỹ năng thử');
      const team = clamp(Number(params.team) || 1, 1, 4);
      const it = LEGEND.find((x) => x.skill === params.skill);
      if (!it) throw new Error(`Không có kỹ năng: ${params.skill}`);
      // người tặng thử của đội (tạo nếu chưa có)
      const u = { user: L(`Thử Đội ${team}`, `Tester ${team}`), uniqueId: `test_t${team}`, avatar: '', sim: true };
      // người thử luôn ở đúng đội đang chọn (kể cả khi đội đã đầy)
      let p = players.get(u.uniqueId);
      if (!p) {
        const qi = queue.findIndex((q) => q.key === u.uniqueId);
        if (qi >= 0) queue.splice(qi, 1);
        p = makePlayer(u, team);
        p.sim = true;
      }
      if (p.team !== team) p.team = team;
      if (onField(team)) refreshLineup();
      ctx.simulated(() => onEvent({ type: 'gift', user: u, giftName: it.tiktok, coins: it.coins, count: clamp(Number(params.count) || 1, 1, 3) }));
      rosterDirty = true;
      return { team, skill: it.skill, onField: onField(team), phase };
    },
    startShow: () => {
      if (phase !== 'lobby' && phase !== 'champion') throw new Error('Chỉ bắt đầu trận biểu diễn lúc đang chờ');
      startExhibition();
      return phaseInfo();
    },
    clearPlayers: () => {
      simClear();
      for (const p of [...players.values()]) players.delete(p.key);
      queue.length = 0;
      if (phase !== 'lobby') enterLobby();
      rosterDirty = true;
      return { ok: true };
    }
  };

  if (S().autoSim) simBurst(24);
  setTimeout(() => {
    if (phase === 'lobby') say(pick(lines().lobby));
  }, 4000);

  return {
    onEvent,
    rpc,
    simulate() {
      simBurst(4);
    },
    onAutoSimChange(enabled) {
      if (enabled) simBurst(24);
      else simClear();
    },
    onLiveConnected() {
      simClear();
      broadcastPhase();
    },
    onSettingsChanged(changed) {
      if ('lobbySeconds' in changed && phase === 'lobby') phaseEndsAt = phaseStartedAt + S().lobbySeconds * 1000;
      if ('lang' in changed) {
        const names = shuffle(isEn() ? NPC_NAMES_EN : NPC_NAMES);
        [...players.values()].filter((p) => p.npc).forEach((p, i) => {
          p.name = names[i % names.length];
        });
      }
      rosterDirty = true;
      broadcastPhase();
    },
    getPublicState() {
      return {
        kc: {
          ...phaseInfo(),
          roster: rosterView(),
          live: liveView(),
          legend: LEGEND.map((it) => ({ ...it, label: isEn() ? SKILLS[it.skill].en : SKILLS[it.skill].vi, desc: isEn() ? SKILLS[it.skill].descEn : SKILLS[it.skill].desc, emoji: SKILLS[it.skill].emoji, gift: isEn() ? it.tiktok : it.gift })),
          history
        },
        topViewers: ctx.board.top(10)
      };
    },
    serialize() {
      return { cup, history, teamWins };
    },
    dispose() {
      clearInterval(tickTimer);
      clearInterval(simTimer);
    }
  };
}

module.exports = {
  id: 'keoco',
  name: 'Kéo Co 4 Đội',
  description: 'Giải kéo co loại trực tiếp: bình luận số đội 1–4, thả tim đều tay để kéo, quà là kỹ năng.',
  overlay: 'keoco.html',
  settingsSchema: {
    lobbySeconds: [10, 300],
    matchSeconds: [20, 180],
    championSeconds: [5, 60],
    teamMax: [1, 20],
    npcMin: [0, 20],
    fastStartPlayers: [2, 80],
    minTeamPlayers: [1, 20],
    aiShow: 'boolean',
    pullMusic: { type: 'enum', values: ['auto', 'tracks', 'calm', 'epic', 'funny'] },
    autoLoop: 'boolean',
    lang: { type: 'enum', values: ['vi', 'en'] },
    enVoice: { type: 'enum', values: ttsEn.VOICES }
  },
  defaultSettings: {
    lobbySeconds: 35,
    matchSeconds: 45,
    championSeconds: 12,
    teamMax: 20,
    npcMin: 8,
    fastStartPlayers: 24,
    minTeamPlayers: 1, // đội có từ chừng này người thật trở lên mới tính là "có người"; cần ít nhất 2 đội như vậy để vào giải
    aiShow: true, // chưa đủ 2 đội: người máy tự kéo biểu diễn (không tính điểm)
    pullMusic: 'auto', // nhạc lúc kéo: 'auto' file nhạc thật nếu có (assets/keoco/music), không thì 2 bài nhạc chờ (10 giây cuối nhanh dần) · 'tracks' luôn dùng 2 bài nhạc chờ · 'calm' vừa phải tự tạo · 'epic' kịch tính · 'funny' hài
    autoLoop: true,
    lang: 'vi',
    enVoice: ttsEn.DEFAULT_VOICE,
    bgMusicEnabled: true,
    musicVolume: 0.5
  },
  create
};
