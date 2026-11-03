// Mô phỏng kéo co không âm thanh, đồng hồ ảo: cân lực / thể lực.  node tools/keoco-sim.js $PWD
const path = require('path');
const ROOT = process.argv[2];
let now = 1e12;
const realNow = Date.now;
Date.now = () => now;
const timers = [];
global.setInterval = (fn, ms) => { timers.push({ fn, ms, next: now + ms }); return timers.length; };
global.clearInterval = () => {};
const pending = [];
global.setTimeout = (fn, ms) => { pending.push({ fn, at: now + ms }); return 0; };
const mode = require(path.join(ROOT, 'src/modes/keoco'));
function run(scn) {
  timers.length = 0; pending.length = 0;
  const msgs = [];
  const ctx = {
    settings: { ...mode.defaultSettings, ttsEnabled: false, lobbySeconds: 10, autoSim: false },
    board: { record() {}, top() { return []; } },
    broadcast: (m, p) => msgs.push([m, p]),
    emitEvent() {}, save() {}, simulated: (fn) => fn(), isLive: () => false, tts: null
  };
  const inst = mode.create(ctx, {});
  const people = [];
  const maxN = Math.max(...scn.teams.map((t) => t[1]));
  for (let i = 0; i < maxN; i++) for (const [team, n, style, rate] of scn.teams) {
    if (i >= n) continue;
    const u = { user: `T${team}_${i}`, uniqueId: `u${team}_${i}` };
    inst.onEvent({ type: 'chat', user: u, text: String(team) });
    people.push({ u, team, style, rate, acc: 0 });
  }
  const st0 = inst.getPublicState().kc.roster.teams.map((t) => t.count);
  scn._counts = st0;
  const results = [];
  const end = now + 6 * 60 * 1000;
  let likeAt = now;
  while (now < end) {
    now += 100;
    for (const t of timers) if (now >= t.next) { t.next += t.ms; t.fn(); }
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= now) { const p = pending.splice(i, 1)[0]; p.fn(); }
    if (now - likeAt >= 1200) {
      likeAt = now; // TikTok gộp tim theo gói ~1,2 giây
      for (const p of people) {
        let n = 0;
        if (p.style === 'steady') n = p.rate * 1.2 * (Math.random() < 0.85 ? 1 : 0);
        else if (p.style === 'spam') n = p.rate * 1.2;
        else if (p.style === 'lazy') n = Math.random() < 0.3 ? p.rate * 1.2 : 0;
        p.acc += n;
        const c = Math.floor(p.acc); p.acc -= c;
        if (c > 0) inst.onEvent({ type: 'like', user: p.u, count: c });
      }
    }
    if (scn.gift && now % 1000 === 0) {
      const st = inst.getPublicState().kc;
      if (st.phase === 'pull' && !scn._gave && st.matchIdx === 0) {
        scn._gave = true;
        const g = people.find((p) => p.team === scn.gift.team);
        inst.onEvent({ type: 'gift', user: g.u, giftName: scn.gift.name, coins: 100, count: 1 });
      }
    }
    while (msgs.length) {
      const [m, p] = msgs.shift();
      if (m === 'kc.live' && p.a) { scn._f = scn._f || {}; for (const [side, arr] of [['a', p.a], ['b', p.b]]) for (const r of arr) { const k = r[0].split('_')[0]; scn._f[k] = scn._f[k] || [0, 0]; scn._f[k][0] += r[3]; scn._f[k][1]++; } }
      if (m === 'kc.fx' && p.kind === 'matchEnd') results.push({ t: Math.round((now - (scn._pullAt || now)) / 1000), winner: p.winner, loser: p.loser, x: Math.round(p.x * 100) / 100, reason: p.reason });
      if (m === 'kc.phase' && p.phase === 'pull') scn._pullAt = now;
      if (m === 'kc.fx' && p.kind === 'champion') { inst.dispose(); return results; }
    }
  }
  return results;
}
const scenarios = {
  equalSteady: { teams: [[1, 15, 'steady', 4], [2, 15, 'steady', 4], [3, 15, 'steady', 4], [4, 15, 'steady', 4]] },
  steadyVsSpam: { teams: [[1, 15, 'steady', 4], [2, 15, 'spam', 9], [3, 15, 'steady', 4], [4, 15, 'spam', 9]] },
  big20vs10: { teams: [[1, 20, 'steady', 4], [2, 10, 'steady', 4], [3, 20, 'steady', 4], [4, 10, 'steady', 4]] },
  activeVsLazy: { teams: [[1, 12, 'steady', 4], [2, 12, 'lazy', 4], [3, 12, 'steady', 4], [4, 12, 'lazy', 4]] },
  oneManVsBots: { teams: [[1, 1, 'steady', 5], [2, 0], [3, 0], [4, 0]] },
  fewVsMany: { teams: [[1, 5, 'steady', 5], [2, 18, 'lazy', 4], [3, 5, 'steady', 5], [4, 18, 'lazy', 4]] }
};
for (const [name, scn] of Object.entries(scenarios)) {
  scn.teams = scn.teams.filter((t) => t[1]);
  const r = run(scn);
  console.log(name.padEnd(14), JSON.stringify(r), JSON.stringify(scn._counts), JSON.stringify(Object.fromEntries(Object.entries(scn._f || {}).map(([k, v]) => [k, Math.round(v[0] / v[1])]))));
}
