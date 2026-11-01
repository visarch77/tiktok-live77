/**
 * Phòng Tụng Kinh Chung — màn hình 9:16
 * - Chỗ ngồi mang tên mọi người tham gia (theo người vừa tương tác, không theo giá trị)
 * - Thả tim = cùng tụng: chỗ ngồi toả sáng, hiện "đang tụng kinh"; bộ đếm chung của cả đạo tràng
 * - Chữ kinh sáng dần theo nhịp mõ (mỗi chữ một tiếng mõ), đồng bộ theo giờ của server
 * - Không giọng đọc, không bảng xếp hạng, không hiển thị giá trị quà
 */
(function () {
  const params = new URLSearchParams(location.search);
  if (params.get('obs') === '1') document.body.classList.add('obs-mode');
  const roomMatch = location.pathname.match(/^\/room\/([^/?#]+)/);
  const ROOM_ID = decodeURIComponent((roomMatch && roomMatch[1]) || params.get('room') || 'main');

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

  // ------------------------------------------------------------------------
  // Khung 1080x1920 co giãn
  // ------------------------------------------------------------------------
  function fitStage() {
    const rect = $('stageWrapper').getBoundingClientRect();
    $('stage').style.transform = `scale(${rect.width / 1080})`;
  }
  addEventListener('resize', fitStage);
  fitStage();

  // ------------------------------------------------------------------------
  // Âm thanh: nhạc nền tổng hợp không lời + mõ + chuông (không TTS)
  // ------------------------------------------------------------------------
  const audio = new window.TempleAudioEngine({ musicUrl: null, ambient: 'pad' });
  audio.ttsEnabled = false;
  const particles = new window.TempleParticleEngine($('smokeCanvas'));
  particles.smokeDensity = 0.8;

  function unlockAudio() {
    audio.ensureContext();
    $('btnAudio').textContent = '✅ Âm thanh đã bật';
  }
  addEventListener('pointerdown', unlockAudio, { once: true });
  if (document.body.classList.contains('obs-mode')) audio.ensureContext();

  // ------------------------------------------------------------------------
  // Đồng bộ giờ với server
  // ------------------------------------------------------------------------
  let serverOffset = 0;
  const serverNow = () => Date.now() + serverOffset;
  function syncClock(ts) {
    if (typeof ts === 'number') serverOffset = ts - Date.now();
  }

  // ------------------------------------------------------------------------
  // Đạo tràng: 38 chỗ ngồi (6 bồ đoàn trước điện + 4 hàng x 4 chỗ mỗi bên thảm)
  // ------------------------------------------------------------------------
  const SEAT_COORDS = [];
  [144, 280, 413, 667, 800, 933].forEach((x) => SEAT_COORDS.push({ x, y: 1196, scale: 0.84 }));
  for (let r = 0; r < 4; r++) {
    const t = r / 3;
    const y = Math.round(1338 + t * 214);
    const scale = +(0.86 + t * 0.14).toFixed(2);
    const leftInner = Math.round(300 - t * 26);
    const rightInner = Math.round(780 + t * 26);
    for (let c = 0; c < 4; c++) {
      const k = c / 3;
      SEAT_COORDS.push({ x: Math.round(56 + k * (leftInner - 56)), y, scale });
    }
    for (let c = 0; c < 4; c++) {
      const k = c / 3;
      SEAT_COORDS.push({ x: Math.round(rightInner + k * (1024 - rightInner)), y, scale });
    }
  }

  const seatEls = SEAT_COORDS.map((pos, slot) => {
    const el = document.createElement('div');
    el.className = 'seat empty';
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.style.zIndex = String(10 + Math.round(pos.y / 10));
    el.style.transform = `translate(-50%, -100%) scale(${pos.scale})`;
    el.innerHTML = `<div class="glow"></div><div class="doing">đang tụng kinh</div><img class="sprite" src="/assets/devotee.png" alt="" /><div class="tag"></div>`;
    el.dataset.slot = String(slot);
    $('hall').appendChild(el);
    return el;
  });
  const seatKeyBySlot = new Array(SEAT_COORDS.length).fill(null);
  const slotByKey = new Map();
  const chantTimers = new Map();

  function setSeat(seat, { arrive = false } = {}) {
    if (!seat || seat.slot == null || seat.slot < 0 || seat.slot >= seatEls.length) return;
    const el = seatEls[seat.slot];
    const prevKey = seatKeyBySlot[seat.slot];
    if (prevKey && prevKey !== seat.key) slotByKey.delete(prevKey);
    seatKeyBySlot[seat.slot] = seat.key;
    slotByKey.set(seat.key, seat.slot);
    el.querySelector('.tag').textContent = seat.name;
    el.classList.remove('empty');
    if (arrive) {
      el.classList.remove('arrive');
      void el.offsetWidth;
      el.classList.add('arrive');
    }
  }

  function renderSeats(seats = []) {
    const used = new Set();
    for (const s of seats) {
      used.add(s.slot);
      if (seatKeyBySlot[s.slot] !== s.key) setSeat(s);
    }
    seatEls.forEach((el, slot) => {
      if (!used.has(slot)) {
        el.classList.add('empty');
        el.querySelector('.tag').textContent = '';
        if (seatKeyBySlot[slot]) slotByKey.delete(seatKeyBySlot[slot]);
        seatKeyBySlot[slot] = null;
      }
    });
    renderIncense(seats.length);
  }

  function markChanting(key) {
    const slot = slotByKey.get(key);
    if (slot == null) return;
    const el = seatEls[slot];
    el.classList.add('chanting');
    clearTimeout(chantTimers.get(key));
    chantTimers.set(key, setTimeout(() => el.classList.remove('chanting'), 6000));
  }

  // ------------------------------------------------------------------------
  // Lư hương: số nén theo số người trong đạo tràng
  // ------------------------------------------------------------------------
  let stickCount = 0;
  function renderIncense(people) {
    const target = Math.max(1, Math.min(27, people || 1));
    if (target === stickCount) return;
    const holder = $('incenseHolder');
    const grew = target > stickCount;
    stickCount = target;
    holder.innerHTML = '';
    const tips = [];
    for (let i = 0; i < target; i++) {
      const spread = target === 1 ? 0 : (i / (target - 1) - 0.5) * 2;
      const left = 65 + spread * 28 + Math.sin(i * 2.1) * 2;
      const angle = spread * 12 + Math.cos(i * 1.5) * 1.5;
      const height = 76 + (i % 3) * 6;
      const stick = document.createElement('div');
      stick.className = `incense-stick${grew && i === target - 1 ? ' new' : ''}`;
      stick.style.left = `${left}px`;
      stick.style.height = `${height}px`;
      stick.style.transform = `rotate(${angle}deg)`;
      stick.innerHTML = '<div class="incense-ember"></div>';
      holder.appendChild(stick);
      const rad = (angle * Math.PI) / 180;
      tips.push({ x: 540 + (left - 65) + Math.sin(rad) * height, y: 910 - Math.cos(rad) * height });
    }
    particles.setIncenseTips(tips);
  }

  // ------------------------------------------------------------------------
  // Bộ đếm chung + dòng "đang cùng tụng" + thông báo nhẹ
  // ------------------------------------------------------------------------
  function renderCounters(c) {
    if (!c) return;
    $('cParticipants').textContent = fmt(c.participants);
    $('cRecitations').textContent = fmt(c.recitations);
    $('cWishes').textContent = fmt(c.wishes);
    $('cLamps').textContent = fmt(c.lamps);
  }

  let chantLineTimer = null;
  function renderChantingLine(names = []) {
    const el = $('chantingLine');
    if (!names.length) {
      el.classList.remove('show');
      return;
    }
    const shown = names.slice(0, 3).map((n) => `<b>${esc(n)}</b>`);
    const rest = names.length - shown.length;
    el.innerHTML = `🙏 ${shown.join(', ')}${rest > 0 ? ` và ${fmt(rest)} bạn` : ''} đang cùng tụng`;
    el.classList.add('show');
    clearTimeout(chantLineTimer);
    chantLineTimer = setTimeout(() => el.classList.remove('show'), 7000);
  }

  const tickerQueue = [];
  let tickerBusy = false;
  function ticker(html) {
    tickerQueue.push(html);
    if (tickerQueue.length > 6) tickerQueue.shift();
    if (!tickerBusy) nextTicker();
  }
  function nextTicker() {
    const el = $('ticker');
    const html = tickerQueue.shift();
    if (!html) {
      tickerBusy = false;
      el.classList.remove('show');
      return;
    }
    tickerBusy = true;
    el.innerHTML = html;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(nextTicker, 650);
    }, 3200);
  }

  // ------------------------------------------------------------------------
  // Đèn hoa đăng (lời nguyện) & đèn sen (quà) bay lên từ chỗ ngồi
  // ------------------------------------------------------------------------
  function floaterOrigin(slot) {
    const pos = SEAT_COORDS[slot] || { x: 540, y: 1520 };
    return { x: Math.min(900, Math.max(180, pos.x)), y: pos.y - 120 };
  }
  function addFloater(html, slot) {
    const layer = $('floatLayer');
    if (layer.children.length > 10) layer.firstElementChild.remove();
    const { x, y } = floaterOrigin(slot);
    const el = document.createElement('div');
    el.className = 'floater';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = html;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 11200);
  }

  // ------------------------------------------------------------------------
  // Khung kinh: thời khoá & chữ sáng theo nhịp mõ
  // ------------------------------------------------------------------------
  let phase = null;
  let nextUpList = [];
  let lineStarts = []; // chỉ số chữ đầu tiên của mỗi dòng
  let lastRenderedLine = -2;
  let lastRenderedWord = -2;
  let scheduledBeat = -1;
  let bellsScheduledFor = null;

  const TEXT_PHASES = new Set(['incense', 'opening', 'sutra', 'recitation', 'dedication']);

  function beatMs() {
    return 60000 / ((phase && phase.text && phase.text.bpm) || 84);
  }

  function setPhase(p) {
    if (!p) return;
    const changed = !phase || phase.id !== p.id || phase.startedAt !== p.startedAt;
    phase = p;
    if (!changed) return;
    lastRenderedLine = -2;
    lastRenderedWord = -2;
    scheduledBeat = -1;
    lineStarts = [];
    if (p.text) {
      let acc = 0;
      for (const line of p.text.lines) {
        lineStarts.push(acc);
        acc += line.length;
      }
    }
    $('spPhase').textContent = p.sutra ? `Tụng kinh · Bài ${p.sutra.num}` : p.title;
    $('spTitle').textContent = p.sutra ? p.sutra.name : p.title;
    $('spSub').textContent = p.subtitle || '';
    renderPhaseBody();
    renderNextUp();
    scheduleBells();
  }

  function renderPhaseBody() {
    const body = $('spBody');
    if (!phase) return;
    if (TEXT_PHASES.has(phase.id)) {
      body.innerHTML = '<div class="sp-line" data-l="0"></div><div class="sp-line current" data-l="1"></div><div class="sp-line" data-l="2"></div>';
      if (phase.id === 'dedication') {
        body.innerHTML = '<div class="sp-line current" data-l="1"></div><div class="sp-names"><div class="sp-names-track" id="namesTrack"></div></div>';
        renderDedicationNames();
      }
      return;
    }
    if (phase.id === 'gather') {
      const next = nextUpList[0];
      body.innerHTML = `<div class="sp-message">Đạo tràng đang tụ hội — ai cũng có thể tham gia<br>${
        next ? `Khoá sắp tới sẽ cùng tụng <b>${esc(next.name)}</b>` : 'Bình luận <b>“kinh 1–9”</b> để đề nghị bài kinh cho cả phòng'
      }</div>`;
      return;
    }
    if (phase.id === 'silence') {
      body.innerHTML = '<div class="breath"></div><div class="sp-message" style="margin-top:10px">Hít vào… thở ra… nhẹ nhàng</div>';
      return;
    }
    const session = phase.sessionSutra && phase.id === 'bell_open' ? `<br>Khoá này cùng tụng <b>${esc(phase.sessionSutra.name)}</b>` : '';
    body.innerHTML = `<div class="sp-message">${esc(phase.subtitle || '')}${session}</div>`;
  }

  function renderDedicationNames() {
    const track = $('namesTrack');
    if (!track || !phase) return;
    const names = phase.names || [];
    const extra = (phase.totalNames || names.length) - names.length;
    track.innerHTML = names.length
      ? names.map((n) => `<span>🙏 ${esc(n)}</span>`).join('') + (extra > 0 ? `<span>và ${fmt(extra)} bạn khác</span>` : '') + '<span>· cùng khắp tất cả chúng sinh ·</span>'
      : '<span>Hồi hướng đến khắp tất cả mọi người và mọi loài</span>';
    const width = track.scrollWidth;
    const dur = Math.max(phase.durationMs - 1500, 5000);
    track.animate([{ transform: 'translateX(1010px)' }, { transform: `translateX(${-width}px)` }], { duration: dur, easing: 'linear', fill: 'forwards' });
  }

  function renderNextUp() {
    const el = $('spNext');
    const next = nextUpList[0];
    if (next) {
      const who = next.chosen ? 'được chọn' : `${fmt(next.votes)} bạn đề nghị`;
      el.innerHTML = `Khoá sau: <b>${esc(next.name)}</b> · ${who}`;
    } else {
      el.innerHTML = 'Khoá sau: theo lịch · bình luận <b>“kinh 1–9”</b> để đề nghị';
    }
  }

  function renderKaraoke() {
    if (!phase || !phase.text) return;
    const elapsed = serverNow() - phase.startedAt;
    const beat = Math.floor(elapsed / beatMs()) - phase.text.leadInBeats;
    const total = phase.text.syllables;
    const wordIdx = Math.min(Math.max(beat, -1), total);
    let lineIdx = 0;
    for (let i = 0; i < lineStarts.length; i++) if (lineStarts[i] <= Math.max(wordIdx, 0)) lineIdx = i;
    if (lineIdx === lastRenderedLine && wordIdx === lastRenderedWord) return;

    const lines = phase.text.lines;
    const renderLine = (i, isCurrent) => {
      if (i < 0 || i >= lines.length) return '';
      return lines[i]
        .map((w, j) => {
          const g = lineStarts[i] + j;
          const cls = !isCurrent ? '' : g < wordIdx ? 'done' : g === wordIdx ? 'now' : '';
          return `<span class="w ${cls}">${esc(w)}</span>`;
        })
        .join(' ');
    };
    const body = $('spBody');
    const slots = body.querySelectorAll('.sp-line');
    if (lineIdx !== lastRenderedLine) {
      slots.forEach((el) => {
        const off = Number(el.dataset.l) - 1;
        el.innerHTML = renderLine(lineIdx + off, off === 0);
      });
    } else {
      const cur = body.querySelector('.sp-line.current');
      if (cur) cur.innerHTML = renderLine(lineIdx, true);
    }
    lastRenderedLine = lineIdx;
    lastRenderedWord = wordIdx;
  }

  function renderProgress() {
    if (!phase) return;
    const pct = Math.min(100, Math.max(0, ((serverNow() - phase.startedAt) / phase.durationMs) * 100));
    $('spProgress').style.width = `${pct}%`;
  }

  // Mõ: mỗi chữ một tiếng, hẹn giờ trước ~350ms trên đồng hồ âm thanh để nhịp đều tuyệt đối
  function scheduleWoodfish() {
    if (!phase || !phase.text || !audio.ctx || audio.ctx.state !== 'running') return;
    const ms = beatMs();
    const lead = phase.text.leadInBeats;
    const total = phase.text.syllables;
    const nowS = serverNow();
    const horizon = nowS + 350;
    let k = Math.max(scheduledBeat + 1, Math.ceil((nowS - phase.startedAt) / ms) - lead);
    for (; k < total; k++) {
      const t = phase.startedAt + (k + lead) * ms;
      if (t > horizon) break;
      const when = audio.ctx.currentTime + Math.max(0, (t - nowS) / 1000);
      const lineStart = lineStarts.includes(k);
      audio.playWoodenFish(lineStart ? 0.94 : 1.0, when);
      scheduledBeat = k;
    }
  }

  function scheduleBells() {
    if (!phase || !phase.bells || bellsScheduledFor === phase.startedAt) return;
    if (!audio.ctx || audio.ctx.state !== 'running') return;
    bellsScheduledFor = phase.startedAt;
    const nowS = serverNow();
    phase.bells.forEach((offset) => {
      const t = phase.startedAt + offset;
      if (t < nowS - 500) return;
      audio.playTempleBell(0.9, audio.ctx.currentTime + Math.max(0, (t - nowS) / 1000));
    });
  }

  setInterval(() => {
    renderKaraoke();
    scheduleWoodfish();
    scheduleBells();
  }, 90);
  setInterval(renderProgress, 1000);

  // ------------------------------------------------------------------------
  // Trạng thái & sự kiện từ server
  // ------------------------------------------------------------------------
  let roomInfoApplied = false;
  function applyState(st) {
    if (!st) return;
    syncClock(st.serverNow);
    if (!roomInfoApplied && st.room) {
      roomInfoApplied = true;
      $('roomName').textContent = String(st.room.name || 'Phòng Tụng Kinh').toUpperCase();
      $('dockTitle').textContent = `🪷 ${st.room.name}`;
      document.title = `${st.room.name} — Tụng Kinh Chung`;
    }
    $('liveDot').classList.toggle('on', Boolean(st.tiktok && st.tiktok.connected));
    renderCounters(st.counters);
    renderSeats(st.seats || []);
    if (st.nextUp) nextUpList = st.nextUp;
    setPhase(st.phase);
    renderNextUp();
    if (st.settings && typeof st.settings.musicVolume === 'number') {
      audio.setMusicVolume(st.settings.musicVolume);
      syncSlider('volMusic', st.settings.musicVolume);
    }
  }

  function onActivity(a) {
    if (a.counters) renderCounters(a.counters);
    switch (a.kind) {
      case 'seat':
        setSeat(a.seat, { arrive: true });
        renderIncense(slotByKey.size);
        ticker(`🙏 <b>${esc(a.seat.name)}</b> đã thắp nhang, vào đạo tràng`);
        break;
      case 'chant':
        (a.keys || []).forEach(markChanting);
        renderChantingLine(a.chantingNow || a.names || []);
        break;
      case 'thanks':
        if (a.names && a.names.length > 1) {
          const shown = a.names.slice(0, 2).map((n) => `<b>${esc(n)}</b>`).join(', ');
          const rest = a.names.length - 2;
          ticker(`🤍 Cảm ơn ${shown}${rest > 0 ? ` và ${fmt(rest)} bạn` : ''} đã thả đèn sen`);
        }
        break;
    }
  }

  function onEvent(ev) {
    if (!ev) return;
    switch (ev.type) {
      case 'wish':
        if (ev.wish) {
          addFloater(`<div class="lantern"><div class="who">🏮 ${esc(ev.user)}</div><div class="what">${esc(ev.wish)}</div></div>`, ev.slot);
        }
        if (ev.vote) ticker(`📜 <b>${esc(ev.user)}</b> đề nghị cả phòng tụng <b>${esc(ev.vote.name)}</b>`);
        if (ev.nextUp) {
          nextUpList = ev.nextUp;
          renderNextUp();
        }
        break;
      case 'lamp':
        addFloater(`<div class="lamp">${esc(ev.symbol || '🪷')}</div><div class="lamp-name">${esc(ev.user)}</div>`, ev.slot);
        ticker(`🪷 <b>${esc(ev.user)}</b> đã thả một đèn sen`);
        if (ev.nextUp) {
          nextUpList = ev.nextUp;
          renderNextUp();
        }
        break;
      case 'invite':
        ticker(`🌱 <b>${esc(ev.user)}</b> đã mời thêm bạn hữu vào đạo tràng`);
        break;
    }
    if (ev.counters) renderCounters(ev.counters);
  }

  // ------------------------------------------------------------------------
  // WebSocket theo phòng
  // ------------------------------------------------------------------------
  let ws = null;
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws?room=${encodeURIComponent(ROOM_ID)}`);
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (_) { return; }
      switch (msg.method) {
        case 'room.state':
          applyState(msg.params);
          break;
        case 'room.event':
          if (msg.params && msg.params.state) applyState(msg.params.state);
          onEvent(msg.params && msg.params.event);
          break;
        case 'chant.phase':
          syncClock(msg.params.serverNow);
          if (msg.params.nextUp) nextUpList = msg.params.nextUp;
          setPhase(msg.params.phase);
          break;
        case 'chant.activity':
          onActivity(msg.params || {});
          break;
        case 'room.viewerCount':
          break;
        case 'room.notFound':
          $('roomName').textContent = `KHÔNG TÌM THẤY PHÒNG "${ROOM_ID}"`;
          break;
      }
    };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onclose = () => setTimeout(connect, 2000);
  }
  connect();

  function rpc(method, p = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params: { roomId: ROOM_ID, ...p } }));
    }
  }

  // ------------------------------------------------------------------------
  // Bảng điều khiển nhanh
  // ------------------------------------------------------------------------
  function syncSlider(id, v) {
    const el = $(id);
    if (!el || document.activeElement === el) return;
    el.value = String(Math.round(v * 100));
    $(`${id}Out`).textContent = `${el.value}%`;
  }
  syncSlider('volMusic', audio.bgBaseVolume);
  syncSlider('volSfx', audio.sfxVolume);
  $('volMusic').addEventListener('input', (e) => {
    $('volMusicOut').textContent = `${e.target.value}%`;
    audio.setMusicVolume(Number(e.target.value) / 100);
  });
  $('volMusic').addEventListener('change', (e) => rpc('room.updateSettings', { musicVolume: Number(e.target.value) / 100 }));
  $('volSfx').addEventListener('input', (e) => {
    $('volSfxOut').textContent = `${e.target.value}%`;
    audio.setSfxVolume(Number(e.target.value) / 100);
  });
  $('btnAudio').addEventListener('click', unlockAudio);
  $('btnMusic').addEventListener('click', (e) => {
    audio.bgMusicEnabled = !audio.bgMusicEnabled;
    if (audio.bgMusicEnabled) {
      audio.ensureContext();
      audio.startZenAmbience();
    } else {
      audio.stopZenAmbience();
    }
    e.currentTarget.textContent = `🎵 Nhạc nền: ${audio.bgMusicEnabled ? 'BẬT' : 'TẮT'}`;
  });
})();
