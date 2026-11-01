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
  // audio.js chỉ lo mõ & chuông; nhạc nền do AmbientMusic (ambient.js) tạo
  const audio = new window.TempleAudioEngine({ musicUrl: null });
  audio.ttsEnabled = false;
  audio.bgMusicEnabled = false;
  const particles = new window.TempleParticleEngine($('smokeCanvas'));
  particles.smokeDensity = 0.8;

  let ambient = null;
  let musicOn = true;
  let natureOn = true;
  let musicVolume = (() => {
    try {
      const v = parseFloat(localStorage.getItem('chant_music_vol'));
      return Number.isFinite(v) ? v : 0.45;
    } catch (_) {
      return 0.45;
    }
  })();

  function startMusic() {
    const ctx = audio.ensureContext();
    if (!ambient) ambient = new window.AmbientMusic(ctx, { volume: musicVolume, nature: natureOn });
    if (musicOn) ambient.start();
  }

  // ------------------------------------------------------------------------
  // Giọng đọc từng chữ (ZeroTTS) — nhỏ, có vang nhẹ, không lấn tiếng mõ
  // ------------------------------------------------------------------------
  let readerVolume = 0.35;
  let readerBus = null;
  const clipCache = new Map(); // url -> Promise<AudioBuffer|null>

  function ensureReaderBus() {
    if (readerBus) return readerBus;
    const ctx = audio.ensureContext();
    const gain = ctx.createGain();
    gain.gain.value = readerVolume;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    gain.connect(hp);
    hp.connect(lp);
    lp.connect(ctx.destination);
    lp.connect(verb);
    verb.connect(wet);
    wet.connect(ctx.destination);
    readerBus = gain;
    return gain;
  }

  function loadClip(url) {
    if (!url) return null;
    if (!clipCache.has(url)) {
      const ctx = audio.ensureContext();
      clipCache.set(
        url,
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((buf) => ctx.decodeAudioData(buf))
          .then((ab) => {
            clipCache.set(url, ab);
            return ab;
          })
          .catch(() => null)
      );
      if (clipCache.size > 1500) clipCache.delete(clipCache.keys().next().value);
    }
    const v = clipCache.get(url);
    return v instanceof AudioBuffer ? v : null;
  }

  function playClip(buffer, when, maxDur) {
    const ctx = audio.ctx;
    const src = ctx.createBufferSource();
    const env = ctx.createGain();
    src.buffer = buffer;
    const dur = Math.min(buffer.duration, Math.max(0.15, maxDur));
    env.gain.setValueAtTime(1, when);
    env.gain.setValueAtTime(1, when + Math.max(0.05, dur - 0.06));
    env.gain.linearRampToValueAtTime(0.0001, when + dur);
    src.connect(env);
    env.connect(ensureReaderBus());
    src.onended = () => {
      src.disconnect();
      env.disconnect();
    };
    src.start(when, 0, dur + 0.01);
  }

  function unlockAudio() {
    startMusic();
    $('btnAudio').textContent = '✅ Âm thanh đã bật';
  }
  addEventListener('pointerdown', unlockAudio, { once: true });
  if (document.body.classList.contains('obs-mode')) startMusic();

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
  let cueIdx = 0; // tiếng chuông / mõ kế tiếp cần hẹn giờ
  let voiceIdx = 0; // chữ kế tiếp cần đọc
  let showRhythm = true;
  let lastBellPromptAt = 0;

  const TEXT_PHASES = new Set(['incense', 'opening', 'sutra', 'recitation', 'dedication']);

  function setPhase(p) {
    if (!p) return;
    const changed = !phase || phase.id !== p.id || phase.startedAt !== p.startedAt;
    phase = p;
    if (!changed) return;
    lastRenderedLine = -2;
    lastRenderedWord = -2;
    lineStarts = [];
    if (p.text) {
      let acc = 0;
      for (const line of p.text.lines) {
        lineStarts.push(acc);
        acc += line.length;
      }
    }
    // Vào giữa chừng: bỏ qua các tiếng đã qua
    const elapsed = serverNow() - p.startedAt;
    cueIdx = 0;
    const cues = p.cues || [];
    while (cueIdx < cues.length && cues[cueIdx].t < elapsed - 150) cueIdx++;
    voiceIdx = 0;
    const times = (p.text && p.text.times) || [];
    while (voiceIdx < times.length && times[voiceIdx] < elapsed - 150) voiceIdx++;
    if (p.reader && audio.ctx) p.reader.clips.slice(voiceIdx, voiceIdx + 40).forEach(loadClip);
    renderRhythmGuide();

    const style = p.voice === 'intoned' ? ' · xướng' : p.voice === 'mo' ? ' · đồng tụng' : '';
    $('spPhase').textContent = p.sutra ? `Tụng kinh · Bài ${p.sutra.num}${style}` : `${p.title}${style}`;
    $('spTitle').textContent = p.sutra ? p.sutra.name : p.title;
    $('spSub').textContent = p.subtitle || '';
    renderPhaseBody();
    renderNextUp();
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
    if (phase.id === 'paused') {
      body.innerHTML = '<div class="sp-message">Thời khoá đang tạm dừng — mời đại chúng ngồi yên trong giây lát</div>';
      return;
    }
    if (phase.id === 'silence') {
      body.innerHTML = '<div class="breath"></div><div class="sp-message" style="margin-top:10px">Hít vào… thở ra… nhẹ nhàng</div>';
      return;
    }
    const session = phase.sessionSutra && (phase.id === 'bell_open' || phase.id === 'khai_chuong_mo')
      ? `<br>Khoá này cùng tụng <b>${esc(phase.sessionSutra.name)}</b>`
      : '';
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

  // Chữ đang tụng = chữ cuối cùng có mốc thời gian ≤ hiện tại (mốc do server tính theo nhịp từng đoạn)
  function currentWordIndex(elapsed) {
    const times = phase.text.times || [];
    if (!times.length || elapsed < times[0]) return -1;
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (times[mid] <= elapsed) lo = mid;
      else hi = mid - 1;
    }
    if (lo === times.length - 1 && elapsed > times[lo] + 1500) return times.length; // đã tụng xong
    return lo;
  }

  function renderKaraoke() {
    if (!phase || !phase.text) return;
    const wordIdx = currentWordIndex(serverNow() - phase.startedAt);
    let lineIdx = 0;
    for (let i = 0; i < lineStarts.length; i++) if (lineStarts[i] <= Math.max(wordIdx, 0)) lineIdx = i;
    if (lineIdx === lastRenderedLine && wordIdx === lastRenderedWord) return;
    if (phase.sutra && phase.introLines && lineIdx !== lastRenderedLine) {
      const intro = lineIdx < phase.introLines;
      $('spPhase').textContent = `Tụng kinh · Bài ${phase.sutra.num} · ${intro ? 'xướng danh hiệu' : 'đồng tụng'}`;
    }

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

  // Chuông & mõ: hẹn giờ trước ~350 ms trên đồng hồ âm thanh theo dòng thời gian của server
  function playCue(cue, when) {
    switch (cue.k) {
      case 'mo': audio.playWoodenFish(1.0, when, 1.0); pulseMo(when); break;
      case 'moSoft': audio.playWoodenFish(1.0, when, 0.55); pulseMo(when); break;
      case 'moLoud': audio.playWoodenFish(0.96, when, 1.3); pulseMo(when); break;
      case 'bell':
        audio.playTempleBell(0.9, when);
        if (ambient) ambient.duck(6, when);
        if (cue.g === 'xa' || cue.g === 'chap') atAudioTime(when, () => showBellPrompt(cue.g));
        break;
      case 'bellSoft':
        audio.playTempleBell(0.4, when);
        if (ambient) ambient.duck(3, when);
        break;
      case 'wake': audio.playBellWake(when); break;
    }
  }

  // Gọi hàm đúng lúc âm thanh vang (đổi từ giờ AudioContext sang setTimeout)
  function atAudioTime(when, fn) {
    const delay = Math.max(0, (when - audio.ctx.currentTime) * 1000);
    setTimeout(fn, delay);
  }

  function pulseMo(when) {
    if (!showRhythm) return;
    atAudioTime(when, () => {
      const dot = $('moDot');
      dot.classList.add('hit');
      setTimeout(() => dot.classList.remove('hit'), 140);
    });
  }

  function renderRhythmGuide() {
    const el = $('rhythm');
    if (!phase || !showRhythm) {
      el.classList.remove('show');
      return;
    }
    if (phase.voice === 'mo') $('rhythmText').textContent = 'Thả tim theo nhịp mõ';
    else if (phase.voice === 'intoned') $('rhythmText').textContent = 'Lắng nghe · chắp tay khi chuông vang';
    else if (phase.id === 'silence') $('rhythmText').textContent = 'Ngồi yên · không cần thả tim';
    else $('rhythmText').textContent = 'Chắp tay khi chuông vang';
    el.classList.add('show');
  }

  // Tiếng chuông lớn: mời mọi người cùng chắp tay (thả tim) — như cúi xá theo chuông trong chánh điện
  function showBellPrompt(gesture) {
    const now = Date.now();
    if (now - lastBellPromptAt < 4000) return;
    lastBellPromptAt = now;
    const el = $('bellPrompt');
    el.querySelector('.bp-text').textContent = gesture === 'xa' ? 'Chắp tay xá — thả tim' : 'Chắp tay — thả tim';
    $('bellPromptSub').textContent = phase && phase.id === 'bell_close' ? 'khoá tụng viên mãn' : 'theo tiếng chuông';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3800);
  }

  function burstHearts(n) {
    const layer = $('heartBurst');
    const count = Math.min(14, Math.max(3, n));
    for (let i = 0; i < count; i++) {
      const h = document.createElement('span');
      h.textContent = ['🤍', '🙏', '🪷'][i % 3];
      h.style.left = `${380 + Math.random() * 320}px`;
      h.style.top = `${1080 + Math.random() * 80}px`;
      h.style.animationDelay = `${(i * 0.12).toFixed(2)}s`;
      layer.appendChild(h);
      setTimeout(() => h.remove(), 3200 + i * 120);
    }
  }

  function scheduleVoice(elapsed) {
    if (!phase.reader || !phase.text || !phase.text.times) return;
    const times = phase.text.times;
    const clips = phase.reader.clips;
    while (voiceIdx < times.length && times[voiceIdx] <= elapsed + 350) {
      const i = voiceIdx++;
      if (times[i] < elapsed - 150) continue;
      const buf = loadClip(clips[i]);
      if (!buf) continue;
      const gap = i + 1 < times.length ? (times[i + 1] - times[i]) / 1000 : 0.8;
      playClip(buf, audio.ctx.currentTime + Math.max(0, (times[i] - elapsed) / 1000), Math.min(gap * 0.97, 1.2));
    }
    // Tải trước các chữ sắp đọc
    clips.slice(voiceIdx, voiceIdx + 30).forEach(loadClip);
  }

  function scheduleCues() {
    if (!phase || !phase.cues || !audio.ctx || audio.ctx.state !== 'running') return;
    const nowS = serverNow();
    const elapsed = nowS - phase.startedAt;
    scheduleVoice(elapsed);
    const cues = phase.cues;
    while (cueIdx < cues.length && cues[cueIdx].t <= elapsed + 350) {
      const cue = cues[cueIdx];
      if (cue.t >= elapsed - 150) {
        const when = audio.ctx.currentTime + Math.max(0, (cue.t - elapsed) / 1000);
        playCue(cue, when);
      }
      cueIdx++;
    }
  }

  setInterval(() => {
    renderKaraoke();
    scheduleCues();
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
    if (st.settings) {
      if (typeof st.settings.sfxVolume === 'number') {
        audio.setSfxVolume(st.settings.sfxVolume);
        syncSlider('volSfx', st.settings.sfxVolume);
      }
      if (typeof st.settings.readerVolume === 'number') {
        readerVolume = st.settings.readerVolume;
        if (readerBus) readerBus.gain.setTargetAtTime(readerVolume, audio.ctx.currentTime, 0.2);
      }
      if (typeof st.settings.natureSound === 'boolean' && ambient) ambient.setNature(st.settings.natureSound);
      if (typeof st.settings.natureSound === 'boolean') natureOn = st.settings.natureSound;
      showRhythm = st.settings.showRhythmGuide !== false;
      renderRhythmGuide();
    }
    if (st.settings && typeof st.settings.musicVolume === 'number') {
      musicVolume = st.settings.musicVolume;
      if (ambient) ambient.setVolume(musicVolume);
      syncSlider('volMusic', musicVolume);
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
      case 'milestone':
        ticker(`🌼 <b>${esc(a.name)}</b> ${esc(a.text)} — tuỳ hỷ`);
        break;
      case 'bellResponse':
        burstHearts(a.people);
        ticker(`🙏 ${fmt(a.people)} bạn cùng chắp tay theo tiếng chuông`);
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
  syncSlider('volMusic', musicVolume);
  syncSlider('volSfx', audio.sfxVolume);
  $('volMusic').addEventListener('input', (e) => {
    $('volMusicOut').textContent = `${e.target.value}%`;
    musicVolume = Number(e.target.value) / 100;
    try { localStorage.setItem('chant_music_vol', String(musicVolume)); } catch (_) {}
    if (ambient) ambient.setVolume(musicVolume);
  });
  $('volMusic').addEventListener('change', (e) => rpc('room.updateSettings', { musicVolume: Number(e.target.value) / 100 }));
  $('volSfx').addEventListener('input', (e) => {
    $('volSfxOut').textContent = `${e.target.value}%`;
    audio.setSfxVolume(Number(e.target.value) / 100);
  });
  $('btnAudio').addEventListener('click', unlockAudio);
  $('btnMusic').addEventListener('click', (e) => {
    musicOn = !musicOn;
    if (musicOn) startMusic();
    else if (ambient) ambient.stop();
    e.currentTarget.textContent = `🎵 Nhạc nền: ${musicOn ? 'BẬT' : 'TẮT'}`;
  });
})();
