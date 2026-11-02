/**
 * Phòng Tụng Kinh Chung — màn hình 9:16
 * - Chỗ ngồi mang tên mọi người tham gia (theo người vừa tương tác, không theo giá trị)
 * - Thả tim = cùng tụng: chỗ ngồi toả sáng, hiện "đang tụng kinh"; bộ đếm chung của cả đạo tràng
 * - Chữ kinh sáng dần theo nhịp mõ (mỗi chữ một tiếng mõ), đồng bộ theo giờ của server
 * - Không giọng đọc, không bảng xếp hạng, không hiển thị giá trị quà
 */
(function () {
  const params = new URLSearchParams(location.search);
  // ?preview=1: nhúng trong trang quản lý — giống OBS nhưng im lặng cho tới khi người trực bật nghe
  const PREVIEW = params.get('preview') === '1';
  if (params.get('safe') === '1') document.body.classList.add('show-safe');
  // /live.html: địa chỉ cho TikTok LIVE Studio (ô "Liên kết" không nhận được ?obs=1 trên localhost) — giống ?obs=1
  const STUDIO_LINK = /\/live\.html$/.test(location.pathname);
  if (params.get('obs') === '1' || PREVIEW || STUDIO_LINK) document.body.classList.add('obs-mode');
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
  particles.smokeMinY = 80; // khói bay lên trước tượng rồi tan
  particles.lotusPetals = []; // hoa rơi nay do fx.js vẽ (đẹp hơn, có lá vàng & lấp lánh)
  const fx = new window.BlessingFx($('fxCanvas'));
  const giftSound = new window.GiftSound(audio);

  let ambient = null;
  let musicOn = true;
  let ending = null; // hẹn giờ tắt live (từ server)
  let natureOn = true;
  let musicTrack = 'preset:still'; // đang phát
  let trackOffering = 'preset:still';
  let trackChant = 'preset:breath';
  // Danh sách phát: "single" lặp 1 bài · "list" lần lượt · "shuffle" ngẫu nhiên. Mỗi chế độ một danh sách,
  // nhớ vị trí riêng; nhạc file hết bài thì sang bài, nhạc thiền tự tạo (không có hồi kết) phát đủ N phút rồi sang.
  let playMode = 'single';
  const lists = { offering: [], chant: [] };
  const listPos = { offering: -1, chant: -1 };
  let presetMinutes = 10;
  let listSig = '';
  let presetTimer = null;
  function musicKey() {
    return isOfferingPhase(phase) ? 'offering' : 'chant';
  }
  function useList(key) {
    return playMode !== 'single' && lists[key].length > 0;
  }
  // Bật / tắt riêng từng loại nhạc: tắt loại nào thì bài loại đó im (danh sách thì bỏ qua bài đó)
  let presetMusicOn = true;
  let fileMusicOn = true;
  let fileMusicVolume = 0.45;
  const isFileTrack = (t) => String(t || '').startsWith('file:');
  function sourceOn(t) {
    if (!t || t === 'preset:none') return true;
    return isFileTrack(t) ? fileMusicOn : presetMusicOn;
  }
  function nextFromList(key) {
    const all = lists[key];
    const list = all.filter(sourceOn);
    if (!list.length) {
      listPos[key] = -1;
      return 'preset:none';
    }
    // listPos là vị trí trong cả danh sách; bỏ qua bài thuộc loại nhạc đang tắt
    let i = listPos[key];
    if (playMode === 'shuffle' && list.length > 1) {
      do i = Math.floor(Math.random() * all.length); while (i === listPos[key] || !sourceOn(all[i]));
    } else {
      do i = (i + 1) % all.length; while (!sourceOn(all[i]));
    }
    listPos[key] = i;
    return all[i];
  }
  function armListTimer(track) {
    clearTimeout(presetTimer);
    presetTimer = null;
    if (!ambient) return;
    const key = musicKey();
    const multi = useList(key) && lists[key].length > 1;
    ambient.loopFile = !multi;
    ambient.onFileEnded = multi ? () => advanceList() : null;
    if (multi && track.startsWith('preset:')) presetTimer = setTimeout(advanceList, presetMinutes * 60000);
  }
  function advanceList() {
    const key = musicKey();
    if (!ambient || !useList(key)) return;
    const next = nextFromList(key);
    const same = next === musicTrack;
    musicTrack = next;
    armListTimer(next);
    if (next === 'preset:none') return ambient.running && ambient.stop();
    if (!ambient.running) {
      if (musicOn) { ambient.setTrack(next); ambient.start(); }
    } else if (same) ambient.restart();
    else ambient.setTrack(next);
  }
  // Nhạc theo chế độ: Dâng hương một bài/danh sách, Tụng kinh một bài/danh sách ("preset:none" = tắt nhạc, chỉ tiếng pháp)
  function applyModeMusic() {
    if (phase && phase.id === 'ended') {
      // Buổi live đã viên mãn: nhạc nhỏ dần rồi tắt
      clearTimeout(presetTimer);
      if (ambient && ambient.running) ambient.stop();
      musicTrack = 'preset:none';
      listSig = '';
      return;
    }
    const key = musicKey();
    if (useList(key)) {
      const sig = `${key}|${playMode}|${lists[key].join(',')}|${presetMinutes}|${presetMusicOn}|${fileMusicOn}`;
      if (sig === listSig && ambient && (musicTrack === 'preset:none') !== ambient.running) return;
      const listChanged = !listSig.startsWith(`${key}|`) || sig !== listSig;
      listSig = sig;
      if (!ambient) return;
      // Sửa danh sách khi bài đang phát vẫn còn trong đó: phát tiếp bài này, không nhảy bài
      const keep = sourceOn(musicTrack) ? lists[key].indexOf(musicTrack) : -1;
      if (listChanged && keep >= 0 && (musicTrack === 'preset:none') !== ambient.running) {
        listPos[key] = keep;
        armListTimer(musicTrack);
        return;
      }
      if (listChanged || keep < 0) {
        if (listPos[key] >= lists[key].length) listPos[key] = -1;
        musicTrack = '';
        return advanceList();
      }
      return;
    }
    listSig = '';
    clearTimeout(presetTimer);
    if (ambient) {
      ambient.loopFile = true;
      ambient.onFileEnded = null;
    }
    const picked = key === 'offering' ? trackOffering : trackChant;
    const want = sourceOn(picked) ? picked : 'preset:none';
    if (want === musicTrack && ambient && (want === 'preset:none') !== ambient.running) return;
    musicTrack = want;
    if (!ambient) return;
    if (want === 'preset:none') {
      if (ambient.running) ambient.stop();
      return;
    }
    if (!ambient.running && musicOn) {
      ambient.setTrack(want);
      ambient.start();
    } else ambient.setTrack(want);
  }
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
    if (!ambient) ambient = new window.AmbientMusic(ctx, { volume: musicVolume, fileVolume: fileMusicVolume, nature: natureOn });
    if (useList(musicKey()) || (phase && phase.id === 'ended')) {
      listSig = '';
      musicTrack = '';
      return applyModeMusic();
    }
    musicTrack = isOfferingPhase(phase) ? trackOffering : trackChant;
    if (!sourceOn(musicTrack)) musicTrack = 'preset:none';
    if (musicTrack === 'preset:none') return;
    ambient.setTrack(musicTrack);
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
  if (!PREVIEW) addEventListener('pointerdown', unlockAudio, { once: true });
  // OBS tự phát nhạc — đợi trang khởi tạo xong (cần biết đang Dâng hương hay Tụng kinh để chọn bài)
  if (document.body.classList.contains('obs-mode') && !PREVIEW) setTimeout(startMusic, 0);

  // Trạng thái âm thanh để trang quản lý hiển thị / chẩn đoán
  window.chantAudioState = () => ({
    ctx: audio.ctx ? audio.ctx.state : 'none',
    sfx: audio.sfxEnabled !== false ? audio.sfxVolume : 0,
    phase: phase && phase.id,
    nextCue: phase && phase.cues ? phase.cues[cueIdx] || null : null,
    elapsed: phase ? serverNow() - phase.startedAt : 0,
    played: { ...cueCount },
    music: ambient ? { running: ambient.running, track: musicTrack, level: Number(ambient.level().toFixed(4)) } : null
  });

  // Xem trước trong trang quản lý: tắt tiếng mặc định, bật / tắt qua postMessage
  if (PREVIEW) {
    let previewMuted = true;
    const ensure = audio.ensureContext.bind(audio);
    audio.ensureContext = () => {
      if (!previewMuted) return ensure();
      if (!audio.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audio.ctx = new AudioCtx();
        audio.ctx.suspend().catch(() => {});
      }
      return audio.ctx;
    };
    addEventListener('message', (e) => {
      if (e.origin === location.origin && e.data && e.data.type === 'preview-safe') document.body.classList.toggle('show-safe', Boolean(e.data.on));
    });
    addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'preview-audio') return;
      previewMuted = !e.data.on;
      if (e.data.on) unlockAudio();
      else if (audio.ctx) audio.ctx.suspend().catch(() => {});
    });
  }

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
  // Bố cục chỗ ngồi dùng chung với server (public/js/seat-layout.js): gần to xa nhỏ, ~686 chỗ
  const SEAT_COORDS = window.SeatLayout.buildSeatLayout();
  // Bộ nhân vật (assets/chars/f: nữ áo tràng lam, assets/chars/m: nam áo lam nâu) — vẽ bằng Scenario, cùng tỉ lệ,
  // cùng mặt sàn: 4 khung bước đi, đứng chắp tay, quỳ, lạy, lạy sát đất. seat/seat_bow: tư thế ngồi trong đạo tràng.
  const charSrc = (gender, frame) => `/assets/chars/${gender === 'm' ? 'm' : 'f'}/${frame}.png`;
  const NAMED_SCALE = 0.6; // khi đạo tràng còn thưa: các hàng gần (tỉ lệ ≥ 0.6) luôn hiện tên
  const NAMED_MAX_PEOPLE = 150; // đông hơn mức này: chỉ hiện tên người vừa tương tác (tránh chữ chồng nhau)
  const ACTIVE_MS = 15000; // tên chỉ hiện 15 giây sau khi vào đạo tràng / sau mỗi lần tương tác, rồi tự ẩn

  const seatEls = SEAT_COORDS.map((pos, slot) => {
    const el = document.createElement('div');
    el.className = 'seat empty';
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.style.zIndex = String(10 + Math.round(pos.y / 10));
    el.style.transform = `translate(-50%, -100%) scale(${pos.scale})`;
    el.innerHTML = `<div class="halo"></div><div class="glow"></div><div class="doing">đang tụng kinh</div><img class="sprite" src="${charSrc('f', 'seat')}" alt="" /><div class="tag"></div>`;
    // Tên luôn đọc được ở hàng xa (bù lại tỉ lệ thu nhỏ), và không tràn sang chỗ bên cạnh
    const tag = el.querySelector('.tag');
    tag.style.fontSize = `${Math.round(13 / pos.scale)}px`;
    tag.style.maxWidth = `${Math.round(Math.max(64, pos.spacing * 1.6) / pos.scale)}px`;
    el.dataset.slot = String(slot);
    $('hall').appendChild(el);
    return el;
  });
  const seatKeyBySlot = new Array(SEAT_COORDS.length).fill(null);
  const seatGenderBySlot = new Array(SEAT_COORDS.length).fill('f');
  const seatNameBySlot = new Array(SEAT_COORDS.length).fill('');
  const seatTierBySlot = new Array(SEAT_COORDS.length).fill(0);
  // Hào quang theo công phu trong ngày: 1 = xanh bạc, 2 = vàng, 3 = ngũ sắc
  function setTier(slot, tier) {
    if (seatTierBySlot[slot] === tier) return;
    seatTierBySlot[slot] = tier;
    const el = seatEls[slot];
    el.classList.remove('tier-1', 'tier-2', 'tier-3');
    if (tier > 0) el.classList.add(`tier-${tier}`);
    scheduleNames();
  }
  const slotByKey = new Map();
  const chantTimers = new Map();
  const activeTimers = new Map();

  // Người vừa tương tác: hiện tên tạm thời (đạo tràng đông nên hàng xa ẩn tên khi không hoạt động)
  function markActive(key) {
    const slot = slotByKey.get(key);
    if (slot == null) return;
    activeUntil.set(slot, Date.now() + ACTIVE_MS);
    scheduleNames();
    const el = seatEls[slot];
    const pos = SEAT_COORDS[slot];
    const tag = el.querySelector('.tag');
    el.classList.add('active');
    el.style.zIndex = '400'; // nổi lên trên các hàng khác để tên không bị che
    tag.style.maxWidth = `${Math.round(170 / pos.scale)}px`;
    clearTimeout(activeTimers.get(key));
    activeTimers.set(key, setTimeout(() => {
      el.classList.remove('active');
      el.style.zIndex = String(10 + Math.round(pos.y / 10));
      tag.style.maxWidth = `${Math.round(Math.max(64, pos.spacing * 1.6) / pos.scale)}px`;
    }, ACTIVE_MS));
  }

  function setSeat(seat, { arrive = false } = {}) {
    if (!seat || seat.slot == null || seat.slot < 0 || seat.slot >= seatEls.length) return;
    const el = seatEls[seat.slot];
    const prevKey = seatKeyBySlot[seat.slot];
    if (prevKey && prevKey !== seat.key) slotByKey.delete(prevKey);
    seatKeyBySlot[seat.slot] = seat.key;
    slotByKey.set(seat.key, seat.slot);
    const g = seat.gender === 'm' ? 'm' : 'f';
    if (seatGenderBySlot[seat.slot] !== g) {
      seatGenderBySlot[seat.slot] = g;
      el.querySelector('.sprite').src = charSrc(g, 'seat');
    }
    el.querySelector('.tag').textContent = seat.name;
    el.classList.toggle('ambient', Boolean(seat.ambient));
    seatNameBySlot[seat.slot] = seat.name;
    setTier(seat.slot, seat.tier || 0);
    el.classList.remove('empty');
    if (arrive) {
      el.classList.remove('arrive');
      void el.offsetWidth;
      el.classList.add('arrive');
      markActive(seat.key);
    }
  }

  function renderSeats(seats = []) {
    const used = new Set();
    for (const s of seats) {
      used.add(s.slot);
      if (seatKeyBySlot[s.slot] !== s.key || seatGenderBySlot[s.slot] !== (s.gender === 'm' ? 'm' : 'f')) setSeat(s);
      else setTier(s.slot, s.tier || 0);
    }
    const sparse = seats.length <= NAMED_MAX_PEOPLE;
    seatEls.forEach((el, slot) => {
      el.classList.toggle('named', sparse && SEAT_COORDS[slot].scale >= NAMED_SCALE);
      if (!used.has(slot)) {
        if (seatTierBySlot[slot]) setTier(slot, 0);
        seatNameBySlot[slot] = '';
        el.classList.add('empty');
        el.classList.remove('ambient');
        el.querySelector('.tag').textContent = '';
        if (seatKeyBySlot[slot]) slotByKey.delete(seatKeyBySlot[slot]);
        seatKeyBySlot[slot] = null;
      }
    });
    renderIncense(seats.length);
    scheduleNames();
  }

  // ------------------------------------------------------------------------
  // Tên người tham gia: chỉ hiện khi đặt được mà không đè lên tên khác; đặt trên lưng chính người đó
  // (không che người ngồi phía trước). Ưu tiên: người vừa tương tác, đang thả tim, hào quang cao, hàng gần.
  // ------------------------------------------------------------------------
  const nameEls = new Map(); // slot -> element
  const activeUntil = new Map(); // slot -> thời điểm hết "vừa tương tác"
  let namesTimer = null;
  const MAX_NAMES = 70;

  function scheduleNames() {
    if (namesTimer) return;
    namesTimer = setTimeout(() => {
      namesTimer = null;
      layoutNames();
    }, 250);
  }
  setInterval(scheduleNames, 1500);

  function layoutNames() {
    const now = Date.now();
    const cands = [];
    seatEls.forEach((el, slot) => {
      const name = seatNameBySlot[slot];
      if (!name || el.classList.contains('empty') || el.classList.contains('away')) return;
      const pos = SEAT_COORDS[slot];
      const active = (activeUntil.get(slot) || 0) > now;
      const chanting = el.classList.contains('chanting');
      const tier = seatTierBySlot[slot];
      // Chỉ hiện tên người vừa vào / vừa tương tác (thả tim, bình luận, tặng quà…) trong 15 giây
      if (!active) return;
      let pr = 100 + ((activeUntil.get(slot) - now) / ACTIVE_MS) * 20;
      if (chanting) pr += 40;
      pr += tier * 15;
      cands.push({ slot, pos, name, pr: pr + pos.scale, tier, chanting });
    });
    cands.sort((a, b) => b.pr - a.pr);
    const placed = [];
    const show = new Set();
    for (const c of cands) {
      if (show.size >= MAX_NAMES) break;
      const font = Math.round((9 + 5 * c.pos.scale) * 1.2); // người ngồi: tên nhỏ, nhẹ (người đi lên mới nổi bật)
      const label = c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name;
      const w = Math.min(label.length * font * 0.48 + 14, 150);
      const h = font + 6;
      const cx = Math.min(1080 - w / 2 - 4, Math.max(w / 2 + 4, c.pos.x));
      const cy = c.pos.y - 50 * c.pos.scale; // giữa lưng người quỳ
      const r = [cx - w / 2 - 3, cy - h / 2 - 2, cx + w / 2 + 3, cy + h / 2 + 2];
      if (placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
      placed.push(r);
      show.add(c.slot);
      let el = nameEls.get(c.slot);
      if (!el) {
        el = document.createElement('div');
        el.className = 'nm-tag';
        $('nameLayer').appendChild(el);
        nameEls.set(c.slot, el);
      }
      if (el.textContent !== label) el.textContent = label;
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.fontSize = `${font}px`;
      el.style.maxWidth = `${Math.round(w)}px`;
      el.style.zIndex = String(Math.round(c.pos.y / 10));
      el.className = `nm-tag show${c.tier ? ` t${c.tier}` : ''}${c.chanting ? ' chanting' : ''}`;
    }
    for (const [slot, el] of nameEls) {
      if (show.has(slot)) continue;
      el.classList.remove('show');
      if (!el._t) {
        el._t = setTimeout(() => {
          el._t = null;
          if (!el.classList.contains('show')) {
            el.remove();
            nameEls.delete(slot);
          }
        }, 600);
      }
    }
  }

  // Thả tim: người ngồi cúi xá nhẹ một cái (tối đa 1 lần / 2,5 giây mỗi chỗ)
  const lastBowAt = new Map();
  function seatBow(slot) {
    const now = Date.now();
    if (now - (lastBowAt.get(slot) || 0) < 2500 || seatEls[slot].classList.contains('away')) return;
    lastBowAt.set(slot, now);
    const img = seatEls[slot].querySelector('.sprite');
    const g = seatGenderBySlot[slot];
    img.src = charSrc(g, 'seat_bow');
    setTimeout(() => { if (seatGenderBySlot[slot] === g) img.src = charSrc(g, 'seat'); }, 750);
  }

  function markChanting(key) {
    const slot = slotByKey.get(key);
    if (slot == null) return;
    seatBow(slot);
    const el = seatEls[slot];
    el.classList.add('chanting');
    markActive(key);
    clearTimeout(chantTimers.get(key));
    chantTimers.set(key, setTimeout(() => el.classList.remove('chanting'), 6000));
  }

  // ------------------------------------------------------------------------
  // Lư hương: số nén theo số người trong đạo tràng
  // ------------------------------------------------------------------------
  let stickCount = 0;
  const BURNER_BASE_Y = 515;
  const BURNER_SCALE = 0.55;
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
      // Miệng lư hương ở (540, 515), cụm nhang thu nhỏ 0.55 theo phối cảnh
      tips.push({ x: 540 + ((left - 65) + Math.sin(rad) * height) * BURNER_SCALE, y: BURNER_BASE_Y - Math.cos(rad) * height * BURNER_SCALE });
    }
    particles.setIncenseTips(tips);
  }

  // ------------------------------------------------------------------------
  // Bộ đếm chung + dòng "đang cùng tụng" + thông báo nhẹ
  // ------------------------------------------------------------------------
  function renderCounters(c) {
    if (!c) return;
    $('cParticipants').textContent = fmt(c.participants);
    $('cIncense').textContent = fmt(c.incenseOffers);
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
    const pos = SEAT_COORDS[slot] || { x: 540, y: 1480, scale: 1 };
    return { x: Math.min(900, Math.max(180, pos.x)), y: pos.y - 120 * (pos.scale || 1) };
  }
  // Bình luận hiện thành bong bóng ngay trên đầu phật tử (theo chỗ ngồi), tối đa 7 bong bóng cùng lúc
  function showBubble(slot, name, text) {
    const pos = SEAT_COORDS[slot];
    if (!pos) return;
    const layer = $('bubbleLayer');
    if (layer.children.length >= 7) layer.firstElementChild.remove();
    const headY = pos.y - 112 * pos.scale - 10;
    // Né bong bóng khác ở gần (đẩy lên trên)
    let y = headY;
    for (const b of layer.children) {
      const bx = Number(b.dataset.x);
      const by = Number(b.dataset.y);
      if (Math.abs(bx - pos.x) < 230 && Math.abs(by - y) < 70) y = by - 72;
    }
    const x = Math.min(1080 - 160, Math.max(160, pos.x));
    const el = document.createElement('div');
    el.className = 'bubble';
    el.dataset.x = String(x);
    el.dataset.y = String(y);
    el.style.left = `${x}px`;
    el.style.top = `${Math.max(140, y)}px`;
    el.innerHTML = `<span class="b-name">${esc(name)}</span><span class="b-text">${esc(text)}</span>`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 7600);
  }

  function addFloater(html, slot, kind = '') {
    const layer = $('floatLayer');
    if (layer.children.length > 14) layer.firstElementChild.remove();
    const { x, y } = floaterOrigin(slot);
    const el = document.createElement('div');
    el.className = `floater${kind ? ` ${kind}` : ''}`;
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
  let commentDisplay = 'head';
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
    const times = voiceTimes(p) || [];
    while (voiceIdx < times.length && times[voiceIdx] < elapsed - 150) voiceIdx++;
    if (p.reader && audio.ctx) p.reader.clips.slice(voiceIdx, voiceIdx + (p.reader.mode === 'line' ? 6 : 40)).forEach(loadClip);
    renderRhythmGuide();
    renderModeTitle();
    const wasOffering = $('stage').classList.contains('offering');
    $('stage').classList.toggle('offering', isOfferingPhase(p) || p.id === 'ended');
    applyModeMusic();
    renderEnding();
    if (lastCatalog) renderMarquee(lastCatalog);
    // Đổi chế độ (dâng hương ⇄ tụng kinh): nhắc hướng dẫn một lượt
    if (wasOffering !== isOfferingPhase(p) && mqMode === 'interval') marqueeShowOnce();
    if (p.id === 'bell_close') fx.shower(6, 1.6); // khoá tụng viên mãn: mưa hoa

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
      body.innerHTML = `<div class="sp-message">Đạo tràng đang tụ hội — nam ngồi bên trái, nữ bên phải<br>${
        next ? `Khoá sắp tới sẽ cùng tụng <b>${esc(next.name)}</b>` : 'Bình luận <b>“kinh 1–9”</b> để đề nghị bài kinh cho cả phòng'
      }<br><span style="font-size:17px;opacity:.75">Hình chưa đúng? Bình luận <b>“nam”</b> hoặc <b>“nữ”</b></span></div>`;
      return;
    }
    if (phase.id === 'ended') {
      body.innerHTML = '<div class="sp-message">Buổi tụng kinh hôm nay đã viên mãn — hẹn gặp lại quý vị 🙏</div>';
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
  const cueCount = {};
  function playCue(cue, when) {
    cueCount[cue.k] = (cueCount[cue.k] || 0) + 1;
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

  // Mốc phát giọng: đọc tự nhiên → đầu mỗi câu; đọc từng chữ → mỗi chữ
  function voiceTimes(p) {
    if (!p || !p.reader || !p.text) return null;
    return p.reader.mode === 'line' ? p.reader.times : p.text.times;
  }

  function scheduleVoice(elapsed) {
    const times = voiceTimes(phase);
    if (!times) return;
    const clips = phase.reader.clips;
    const line = phase.reader.mode === 'line';
    while (voiceIdx < times.length && times[voiceIdx] <= elapsed + 350) {
      const i = voiceIdx++;
      if (times[i] < elapsed - 150) continue;
      const buf = loadClip(clips[i]);
      if (!buf) continue;
      const when = audio.ctx.currentTime + Math.max(0, (times[i] - elapsed) / 1000);
      if (line) playClip(buf, when, buf.duration); // cả câu, nhịp đọc tự nhiên
      else {
        const gap = i + 1 < times.length ? (times[i + 1] - times[i]) / 1000 : 0.8;
        playClip(buf, when, Math.min(gap * 0.97, 1.2));
      }
    }
    // Tải trước các câu / chữ sắp đọc
    clips.slice(voiceIdx, voiceIdx + (line ? 4 : 30)).forEach(loadClip);
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
    if (st && st.merit) renderMerit(st.merit);
    if (st && st.catalog) renderMarquee(st.catalog);
    if (st && 'ending' in st) {
      ending = st.ending;
      renderEnding();
    }
    if (st && st.schedule) {
      schedule = st.schedule;
      renderModeTitle();
    }
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
      roomMode = st.settings.roomMode || (st.settings.autoRun === false ? 'offering' : 'auto');
      if (typeof st.settings.natureSound === 'boolean' && ambient) ambient.setNature(st.settings.natureSound);
      if (typeof st.settings.natureSound === 'boolean') natureOn = st.settings.natureSound;
      if (st.settings.musicTrack) trackOffering = st.settings.musicTrack;
      if (st.settings.musicTrackChant) trackChant = st.settings.musicTrackChant;
      if (st.settings.musicPlayMode) playMode = st.settings.musicPlayMode;
      presetMusicOn = st.settings.presetMusicOn !== false;
      fileMusicOn = st.settings.fileMusicOn !== false;
      if (typeof st.settings.fileMusicVolume === 'number') {
        fileMusicVolume = st.settings.fileMusicVolume;
        if (ambient) ambient.setFileVolume(fileMusicVolume);
      }
      if (Array.isArray(st.settings.musicList)) lists.offering = st.settings.musicList;
      if (Array.isArray(st.settings.musicListChant)) lists.chant = st.settings.musicListChant;
      if (Number(st.settings.musicPresetMinutes) > 0) presetMinutes = Number(st.settings.musicPresetMinutes);
      applyModeMusic();
      showRhythm = st.settings.showRhythmGuide !== false;
      camOn = st.settings.cameraFollow !== false;
      fx.setLevel(st.settings.fxLevel || 'normal');
      const s = st.settings;
      $('stage').style.setProperty('--ui-a', String(Math.max(0.2, Math.min(1, (Number(s.uiOpacity) || 55) / 100))));
      $('feedPanel').classList.toggle('off', s.showFeedPanel === false);
      $('meritPanel').classList.toggle('no-board', s.showMeritBoard === false);
      $('meritPanel').classList.toggle('no-stats', s.showStats === false);
      $('meritPanel').classList.toggle('off', s.showMeritBoard === false && s.showStats === false);
      $('ticker').classList.toggle('off', s.showTicker === false);
      configureMarquee(s.marqueeMode || 'interval', Number(s.marqueeEveryMin) || 5);
      if (typeof st.settings.cameraZoom === 'number') camMax = st.settings.cameraZoom / 100;
      if (st.settings.commentDisplay) commentDisplay = st.settings.commentDisplay;
      renderRhythmGuide();
    }
    if (st.settings && typeof st.settings.musicVolume === 'number') {
      musicVolume = st.settings.musicVolume;
      if (ambient) ambient.setVolume(musicVolume);
      syncSlider('volMusic', musicVolume);
    }
  }

  // ------------------------------------------------------------------------
  // Bảng trái: lời chào người mới, lời chúc thật tâm, lời cảm ơn. Bảng phải: tinh tấn tụng kinh hôm nay
  // ------------------------------------------------------------------------
  const FEED_MAX = 7;
  function feed(html) {
    const list = $('feedList');
    const li = document.createElement('li');
    li.innerHTML = html;
    list.prepend(li);
    while (list.children.length > FEED_MAX) list.lastElementChild.remove();
  }

  // Người mới vào dồn dập: gom thành một dòng "Chào mừng A, B và N bạn"
  let welcomeNames = [];
  let welcomeTimer = null;
  function welcomeFeed(name) {
    welcomeNames.push(name);
    if (welcomeTimer) return;
    welcomeTimer = setTimeout(() => {
      welcomeTimer = null;
      const names = welcomeNames;
      welcomeNames = [];
      const shown = names.slice(0, 2).map((n) => `<b>${esc(n)}</b>`).join(', ');
      const rest = names.length - 2;
      feed(`🙏 Chào mừng ${shown}${rest > 0 ? ` và ${fmt(rest)} bạn` : ''} vào đạo tràng`);
    }, 4000);
  }

  function renderMerit(top = []) {
    const medals = ['🥇', '🥈', '🥉', '4', '5'];
    $('meritList').innerHTML = top.length
      ? top
          .map((r, i) => `<li><span class="rk">${medals[i] || i + 1}</span><span class="nm">${esc(r.name)}</span><span class="pt">⏱${fmt(r.minutes)}′ · 📿${fmt(r.hearts)}</span></li>`)
          .join('')
      : '<span class="empty">Thả tim để cùng tụng kinh 🤍</span>';
  }

  function isOfferingPhase(p) {
    return !p || p.id === 'gather' || p.id === 'paused';
  }
  // ------------------------------------------------------------------------
  // Đường chạy ngang: hướng dẫn tham gia + danh sách bài kinh để đề nghị
  // ------------------------------------------------------------------------
  let marqueeSig = '';
  let lastCatalog = null;
  function renderMarquee(catalog = []) {
    lastCatalog = catalog;
    const chanting = !isOfferingPhase(phase);
    const sutras = catalog.map((c) => `<b>${c.num}</b>. ${esc(c.name)}`).join(' · ');
    const items = [
      ...(chanting ? ['🙏 <b>Đang tụng kinh</b> — xin tạm ngưng bình luận, cùng <b>thả tim theo nhịp mõ</b> để tâm lắng lại'] : ['🌸 <b>Đang dâng hương</b> — gửi lời chúc, thả tim; mỗi tấm lòng đều được đạo tràng ghi nhận và chúc phúc']),
      '🤍 <b>Thả tim theo nhịp mõ</b> khi tụng kinh — mỗi tiếng mõ một lần thả tim, là đang cùng tụng với đạo tràng',
      '🔥 Bình luận <b>“dâng hương”</b> hoặc <b>🔥</b> để lên chánh điện dâng hương',
      `📜 Bình luận <b>“kinh + số”</b> để đề nghị bài kinh cho khoá sau: ${sutras}`,
      '👤 Hình chưa đúng giới tính? Bình luận <b>“nam”</b> hoặc <b>“nữ”</b> để đổi',
      '🔔 Khi chuông vang, cùng <b>thả tim chắp tay</b> theo tiếng chuông',
      '🏮 Gửi <b>lời chúc thật tâm</b> — lúc dâng hương sẽ được đọc lên',
      '🎁 Mỗi món quà là một <b>lễ vật tượng trưng</b> dâng lên Tam Bảo, quý như nhau',
      '🪷 Tụng kinh đều đặn, <b>tinh tấn</b> mỗi ngày — tâm an là phước lành lớn nhất'
    ];
    const sig = `${chanting ? 'c' : 'o'}|${sutras}`;
    if (sig === marqueeSig && $('mqTrack').children.length) return;
    marqueeSig = sig;
    const html = items.map((t) => `<span class="mq-item">${t}<span class="mq-sep">✦</span></span>`).join('');
    const track = $('mqTrack');
    track.innerHTML = html + html; // lặp 2 lần để chạy vòng liền mạch
    requestAnimationFrame(() => {
      const half = track.scrollWidth / 2;
      mqLoopSec = Math.round(half / 95); // ~95 px/giây
      track.style.setProperty('--mq-dur', `${mqLoopSec}s`);
    });
  }

  // Hiện đường chạy: "interval" = thỉnh thoảng (mỗi N phút + khi đổi chế độ, chạy hết một lượt rồi ẩn),
  // "always" = luôn hiện, "off" = chỉ hiện khi người trực bấm "Hiện ngay"
  let mqLoopSec = 60;
  let mqMode = null;
  let mqEvery = null;
  let mqTimer = null;
  let mqHideTimer = null;
  function marqueeShowOnce() {
    const m = $('marquee');
    if (mqMode === 'always') return;
    const track = $('mqTrack');
    track.style.animation = 'none';
    void track.offsetWidth;
    track.style.animation = '';
    m.classList.add('show');
    clearTimeout(mqHideTimer);
    mqHideTimer = setTimeout(() => m.classList.remove('show'), Math.max(20, mqLoopSec) * 1000);
  }
  function configureMarquee(mode, every) {
    if (mode === mqMode && every === mqEvery) return;
    const first = mqMode === null;
    mqMode = mode;
    mqEvery = every;
    clearInterval(mqTimer);
    clearTimeout(mqHideTimer);
    $('marquee').classList.toggle('show', mode === 'always');
    if (mode === 'interval') {
      mqTimer = setInterval(marqueeShowOnce, every * 60000);
      if (first) setTimeout(marqueeShowOnce, 4000);
    }
  }

  // Hẹn giờ tắt live: thẻ "sắp kết thúc" trong mấy phút cuối, màn hình viên mãn khi đã kết thúc
  const hhmm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  function renderEnding() {
    const card = $('endCard');
    const final = (phase && phase.id === 'ended') || (ending && ending.stage === 'ended');
    const soon = !final && ending && ending.stage === 'farewell';
    card.classList.toggle('final', Boolean(final));
    card.classList.toggle('show', Boolean(final || soon));
    if (final) {
      $('ecTitle').textContent = 'Buổi tụng kinh đã viên mãn';
      $('ecSub').innerHTML = 'Nguyện công đức này hồi hướng đến tất cả<br>Kính chúc quý vị thân tâm an lạc · Hẹn gặp lại 🙏';
    } else if (soon) {
      $('ecTitle').textContent = `🌙 Buổi live sẽ kết thúc lúc ${hhmm(ending.at)}`;
      $('ecSub').textContent = 'Cảm ơn quý vị đã cùng tụng kinh · Gửi lời chúc cuối nhé 🙏';
    }
  }

  let schedule = null;
  let roomMode = 'auto';
  function renderModeTitle() {
    let left = '';
    if (phase && phase.id === 'gather' && phase.durationMs && roomMode === 'auto') left = Math.max(0, phase.startedAt + phase.durationMs - serverNow());
    else if (schedule && schedule.chantBlockStart && !isOfferingPhase(phase)) left = Math.max(0, schedule.chantBlockStart + schedule.chantMinutes * 60000 - serverNow());
    const mins = left !== '' ? ` · còn ${Math.max(1, Math.ceil(left / 60000))}′` : '';
    if (phase && phase.id === 'ended') return void ($('feedTitle').textContent = '🪷 Viên mãn');
    if (ending && ending.stage === 'farewell') {
      const l = Math.max(0, ending.at - serverNow());
      return void ($('feedTitle').textContent = `🌙 Sắp kết thúc · còn ${Math.max(1, Math.ceil(l / 60000))}′`);
    }
    // Đang ở lại Dâng hương chờ tới giờ tắt live (không vào khoá tụng nữa)
    if (ending && ending.stage === 'scheduled' && phase && phase.id === 'gather' && left === 0) return void ($('feedTitle').textContent = `🌸 Dâng hương · đến ${hhmm(ending.at)}`);
    $('feedTitle').textContent = isOfferingPhase(phase) ? `🌸 Dâng hương${mins}` : `📿 Đang tụng kinh${mins}`;
  }
  setInterval(renderModeTitle, 15000);

  // Giọng đọc lời chúc / lời cảm ơn (chỉ lúc dâng hương — server không gửi trong lúc tụng kinh)
  let announceHide = null;
  function showAnnounce(text, durMs) {
    $('announceText').textContent = text;
    $('announce').classList.add('show');
    clearTimeout(announceHide);
    announceHide = setTimeout(() => $('announce').classList.remove('show'), durMs + 1200);
  }

  async function playSpeech(a) {
    // Lời dẫn: hiện chữ cả khi chưa bật tiếng (cô chú vẫn đọc được); phát cả lúc tụng kinh
    if (a.announce) showAnnounce(a.text, a.durMs || 4000);
    if (!audio.ctx || audio.ctx.state !== 'running' || (!a.announce && !isOfferingPhase(phase))) return;
    try {
      const buf = await fetch(a.url).then((r) => r.arrayBuffer()).then((b) => audio.ctx.decodeAudioData(b));
      if (!a.announce && !isOfferingPhase(phase)) return;
      const when = audio.ctx.currentTime + 0.05;
      if (ambient) ambient.duck(Math.ceil(buf.duration) + 1, when);
      playClip(buf, when, buf.duration);
    } catch (_) {}
  }

  function onActivity(a) {
    if (a.counters) renderCounters(a.counters);
    switch (a.kind) {
      case 'ambientIncense':
        // Phật tử nền lên dâng hương: chỉ có cảnh đi lên, không tên, không báo trên bảng
        queueWalker({ ambient: true, key: a.key, slot: a.slot, gender: a.gender, user: '' });
        break;
      case 'seat':
        setSeat(a.seat, { arrive: true });
        if (slotByKey.size > NAMED_MAX_PEOPLE) seatEls.forEach((el) => el.classList.remove('named'));
        renderIncense(slotByKey.size);
        ticker(`🙏 <b>${esc(a.seat.name)}</b> đã vào đạo tràng`);
        welcomeFeed(a.seat.name);
        break;
      case 'aura': {
        setTier(a.slot, a.tier);
        const label = ['', 'ánh sen bạc', 'ánh sen vàng', 'ánh sen ngũ sắc'][a.tier] || 'ánh sen';
        feed(`🪷 <b>${esc(a.name)}</b> tinh tấn tụng kinh — ${label}`);
        break;
      }
      case 'merit':
        renderMerit(a.top);
        break;
      case 'speak':
        playSpeech(a);
        break;
      case 'marquee':
        marqueeShowOnce();
        break;
      case 'chant':
        (a.keys || []).forEach(markChanting);
        renderChantingLine(a.chantingNow || a.names || []);
        break;
      case 'gender':
        ticker(`👤 <b>${esc(a.name)}</b> đã chọn hình ${a.gender === 'm' ? 'nam — ngồi bên trái' : 'nữ — ngồi bên phải'}`);
        break;
      case 'milestone':
        ticker(`🌼 <b>${esc(a.name)}</b> ${esc(a.text)} — tuỳ hỷ`);
        break;
      case 'bellResponse':
        burstHearts(a.people);
        ticker(`🙏 ${fmt(a.people)} bạn cùng chắp tay theo tiếng chuông`);
        break;
      case 'thanks':
        (a.items || []).slice(0, 3).forEach((i) => feed(`🌸 Cảm ơn <b>${esc(i.name)}</b> đã ${esc(i.offering)}`));
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
        if (ev.wish && ev.sincere) feed(`🏮 <b>${esc(ev.user)}</b>: ${esc(ev.wish)}`);
        if (ev.wish) {
          if (commentDisplay !== 'lantern') showBubble(ev.slot, ev.user, ev.wish);
          if (commentDisplay !== 'head') addFloater(`<div class="lantern"><div class="who">🏮 ${esc(ev.user)}</div><div class="what">${esc(ev.wish)}</div></div>`, ev.slot);
        }
        if (ev.key) markActive(ev.key);
        if (ev.vote) ticker(`📜 <b>${esc(ev.user)}</b> đề nghị cả phòng tụng <b>${esc(ev.vote.name)}</b>`);
        if (ev.nextUp) {
          nextUpList = ev.nextUp;
          renderNextUp();
        }
        break;
      case 'lamp':
        if (ev.key) markActive(ev.key);
        ticker(`${esc(ev.symbol || '🪷')} <b>${esc(ev.user)}</b> ${esc(ev.offering || 'đã thả một đèn sen')}`);
        if (ev.small || ev.slot == null || ev.slot < 0) smallGift(ev);
        else if (isOfferingPhase(phase) && camOn) queueWalker({ ...ev, gift: true }); // dâng lễ: đi lên chánh điện dâng
        else queueFocus(ev); // tụng kinh: hiện lễ vật tại chỗ, không cận cảnh
        if (ev.nextUp) {
          nextUpList = ev.nextUp;
          renderNextUp();
        }
        break;
      case 'invite':
        ticker(`🌱 <b>${esc(ev.user)}</b> đã mời thêm bạn hữu vào đạo tràng`);
        break;
      case 'incenseOffer':
        queueWalker(ev);
        feed(`🔥 <b>${esc(ev.user)}</b> lên dâng hương lễ Phật`);
        break;
    }
    if (ev.counters) renderCounters(ev.counters);
  }

  // ------------------------------------------------------------------------
  // Phật tử lên dâng hương (bình luận "dâng hương"): rời hàng ghế của mình, bước dọc thảm đỏ tới trước Phật,
  // đứng chắp tay dâng hương, quỳ xá, rồi lui về chỗ. Tối đa 3 người cùng lên (3 lối trên thảm).
  // Chuyển động theo phối cảnh: đi đều theo chiều sâu thật (xa thì chậm và nhỏ dần), nhịp bước khớp tốc độ.
  // ------------------------------------------------------------------------
  const CHAR_FRAMES = ['walk1', 'walk2', 'walk3', 'walk4', 'stand', 'kneel', 'bow', 'bowDeep'];
  ['f', 'm'].forEach((g) => [...CHAR_FRAMES, 'seat', 'seat_bow'].forEach((f) => { const i = new Image(); i.src = charSrc(g, f); }));
  // Khung hình 240×360, sàn ở y=336; người đứng cao 320px trên khung. Ở tỉ lệ 1, người đứng cao 152px —
  // khớp với người quỳ trong đạo tràng (cao 112px).
  const CHAR_W = 114;
  const CHAR_H = 171;
  const CHAR_FLOOR = 336 / 360;
  const HZ = SeatLayout.HORIZON_Y;
  const ALTAR_Y = 672; // chỗ quỳ trước bậc bàn thờ
  const CARPET_BOTTOM_Y = 1575;
  const LANES = [0, -0.42, 0.42]; // giữa, trái, phải (tỉ lệ nửa bề rộng thảm)
  const DEPTH_SPEED = 0.00026; // tốc độ đi theo chiều sâu (đơn vị 1/(y − chân trời) mỗi giây)
  const STEP_MS = 270; // mỗi khung bước (4 khung ≈ một chu kỳ hai bước)
  const MAX_QUEUE = 9;
  const START_GAP_MS = 1500; // người sau bước ra cách người trước ít nhất 1,5 giây
  const laneBusy = LANES.map(() => false);
  const walkerQueue = [];
  let lastWalkStart = 0;

  const depthOf = (y) => 1 / (y - HZ);
  const yOfDepth = (d) => HZ + 1 / d;
  const carpetCenter = (y) => (SeatLayout.carpetLeft(y) + SeatLayout.carpetRight(y)) / 2;
  const carpetHalf = (y) => (SeatLayout.carpetRight(y) - SeatLayout.carpetLeft(y)) / 2;
  const laneX = (lane, y) => carpetCenter(y) + LANES[lane] * carpetHalf(y);
  const smooth = (t) => t * t * (3 - 2 * t);

  // ------------------------------------------------------------------------
  // Camera: bám theo người lên dâng hương gần bàn thờ nhất (cùng những người đi sát bên), phóng to dần theo
  // chiều sâu để nhân vật luôn đủ lớn; giữ cận cảnh lúc lạy, rồi lùi ra toàn cảnh khi không còn ai.
  // ------------------------------------------------------------------------
  const world = $('world');
  const camVignette = $('camVignette');
  const camSpot = $('camSpot');
  const CAM_VIEW_Y = 1080; // người được đặt ở khoảng này trên màn hình: thấy cả tượng Phật phía trên, ngay trên khung kinh
  const CAM_FIGURE_SCALE = 0.95; // tỉ lệ nhân vật mong muốn sau khi phóng to (≈ người ngồi hàng đầu)
  const cam = { z: 1, x: 0, y: 0 };
  let camOn = true;
  let camMax = 3;
  let camLast = performance.now();
  let camResting = true;
  const activeWalkers = new Set();

  // Người dâng lễ (tặng quà): camera lần lượt đưa cận cảnh chỗ ngồi của từng người, kèm thẻ mô tả lễ vật
  const FOCUS_MS = 6100;
  const offeringSrc = (img) => `/assets/offerings/${img || 'lotus'}.webp`;
  ['rose', 'lotus', 'lotusLantern', 'skyLantern', 'incense', 'tea', 'fruit', 'heartLotus', 'mala', 'doves', 'butterfly', 'koi', 'lion', 'dragon', 'pagoda', 'bell']
    .forEach((n) => { const i = new Image(); i.src = offeringSrc(n); });
  ['cloud1', 'cloud2', 'mandala', 'starburst'].forEach((n) => { const i = new Image(); i.src = `/assets/heaven/${n}.webp`; });

  // ------------------------------------------------------------------------
  // Màn dâng lễ tiên cảnh (quà lớn): mỗi lễ vật một kịch bản riêng — phần nền (cột sáng, hào quang,
  // mây lành, chớp sáng), cách lễ vật xuất hiện, và hiệu ứng đặc trưng. Tên người dâng nằm ngay dưới lễ vật.
  // ------------------------------------------------------------------------
  const HEAVEN = {
    rose: { parts: ['beam', 'clouds'], anim: 'rise', play: (x, y) => { fx.petalSpiral(x, y, 44, 'rose'); fx.shower(3, 0.9); } },
    lotus: { parts: ['mandala', 'beam'], anim: 'bloom', play: (x, y) => { fx.ripples(x, y + 150); fx.petalSpiral(x, y, 30, 'lotus'); } },
    lotusLantern: { parts: ['beam'], anim: 'rise', play: (x, y) => { fx.lanternsAround(x, y, 9); fx.burst(x, y, { petals: 6, leaves: 0, sparkles: 20 }); } },
    skyLantern: { parts: [], anim: 'skyrise', play: () => fx.skyLanterns(26) },
    incense: { parts: ['beam'], anim: 'rise', play: (x, y) => { fx.smokeRibbons(x, y - 120); particles.spawnIncenseBurst(540, BURNER_BASE_Y - 20); } },
    tea: { parts: ['clouds'], anim: 'rise', play: (x, y) => { fx.steamUp(x, y - 90, 20); fx.leafSwirl(x, y, 14); } },
    fruit: { parts: ['mandala', 'beam'], anim: 'rise', play: (x, y) => { fx.petalSpiral(x, y, 26, 'peach'); fx.leafSwirl(x, y, 10); fx.ring(x, y, 'rgba(255, 190, 110, A)'); } },
    heartLotus: { parts: ['mandala'], anim: 'pulse', play: (x, y) => { fx.heartSparkles(x, y); setTimeout(() => fx.heartSparkles(x, y), 1300); } },
    mala: { parts: ['beam'], anim: 'rise', play: (x, y) => { fx.orbit(x, y, 200, 27, 3.6); fx.burst(x, y, { petals: 0, leaves: 0, sparkles: 18 }); } },
    doves: { parts: ['beam', 'clouds'], anim: 'rise', play: (x, y) => fx.flock(x, y, 12, 'bird') },
    butterfly: { parts: [], anim: 'flutter', play: (x, y) => fx.flock(x, y, 16, 'butterfly') },
    koi: { parts: [], anim: 'leap', play: (x, y) => { fx.ripples(x, y + 170, 'rgba(160, 225, 255, A)', 4); fx.bubbles(x, y + 120, 34); } },
    lion: { parts: ['mandala', 'beam', 'star', 'clouds'], anim: 'stomp', play: (x, y) => { fx.raysAt(x, y); fx.ring(x, y + 150, 'rgba(255, 215, 120, A)', { grow: 520, flat: 0.3 }); shake(); fx.shower(3, 1); } },
    dragon: { parts: ['clouds', 'star'], anim: 'serpent', play: (x, y) => { fx.raysAt(x, y, 4.6); fx.shower(4, 1.4); } },
    pagoda: { parts: ['mandala', 'beam', 'clouds'], anim: 'descend', play: (x, y) => { fx.raysAt(x, y); fx.shower(4, 1.2); fx.burst(x, y, { petals: 12, leaves: 8, sparkles: 30 }); } },
    bell: { parts: ['beam'], anim: 'swing', play: (x, y) => fx.bellWaves(x, y) }
  };

  // Rung nhẹ cả khung hình (sư tử hộ pháp dậm chân)
  function shake() {
    const st = $('stage');
    st.classList.remove('shake');
    void st.offsetWidth;
    st.classList.add('shake');
    setTimeout(() => st.classList.remove('shake'), 700);
  }

  let heavenTimers = [];
  function playHeaven(ev) {
    const hv = $('heaven');
    const prof = HEAVEN[ev.img] || HEAVEN.lotus;
    heavenTimers.forEach(clearTimeout);
    heavenTimers = [];
    hv.className = 'heaven';
    void hv.offsetWidth;
    const ay = CAM_VIEW_Y - 360; // phía trên đầu người dâng (sau khi camera đã đưa người đó vào khung)
    hv.style.setProperty('--ay', `${ay}px`);
    $('hvItem').src = offeringSrc(ev.img);
    const nm = $('hvName');
    nm.classList.remove('on', 'off');
    nm.style.top = `${ay + 165}px`;
    $('hvWho').textContent = ev.user || '';
    $('hvWhat').textContent = ev.offering ? `${ev.offering} 🙏` : 'dâng lễ cùng đạo tràng 🙏';
    const at = (ms, fn) => heavenTimers.push(setTimeout(fn, ms));
    at(1500, () => nm.classList.add('on'));
    at(500, () => {
      $('stage').classList.add('heaven-on');
      hv.className = `heaven show a-${prof.anim} ${prof.parts.map((p) => `p-${p}`).join(' ')}`;
      fx.burst(540, ay, { petals: 0, leaves: 0, sparkles: 18 });
    });
    at(1500, () => {
      prof.play(540, ay);
      if (isOfferingPhase(phase)) giftSound.play(ev.img);
    });
    at(4300, () => {
      hv.classList.add('ascend');
      nm.classList.add('off');
      for (let i = 0; i < 6; i++) setTimeout(() => fx.burst(540, ay - i * 90, { petals: 0, leaves: 0, sparkles: 6 }), i * 200);
    });
    at(5900, () => {
      $('stage').classList.remove('heaven-on');
      hv.className = 'heaven';
      nm.classList.remove('on', 'off');
    });
  }

  // Quà nhỏ: lễ vật kèm tên bay lên từ chỗ ngồi, lấp lánh nhẹ
  function smallGift(ev) {
    addFloater(`<img class="gift-img" src="${offeringSrc(ev.img)}" alt="" /><div class="gift-name">${esc(ev.user)}</div>`, ev.slot, 'gift');
    const pos = SEAT_COORDS[ev.slot];
    if (pos) fx.burst(pos.x * cam.z + cam.x, (pos.y - 90 * pos.scale) * cam.z + cam.y, { petals: 2, leaves: 0, sparkles: 10 });
    if (isOfferingPhase(phase)) giftSound.play(ev.img, { small: true });
  }

  const OFFERING_KIND = {
    flower: 'Hoa cúng dường',
    lamp: 'Đèn cúng dường',
    incense: 'Hương cúng dường',
    tea: 'Trà cúng dường',
    fruit: 'Quả cúng dường',
    heart: 'Tâm thành',
    release: 'Phóng sinh',
    guardian: 'Hộ pháp',
    joy: 'Tuỳ hỷ'
  };
  const focusQueue = [];
  let focus = null; // { slot, x, y }

  function queueFocus(ev) {
    if (ev.slot == null || ev.slot < 0 || !SEAT_COORDS[ev.slot]) return;
    if (focusQueue.length >= 6) focusQueue.shift();
    focusQueue.push(ev);
    if (!focus) nextFocus();
  }

  function nextFocus() {
    if (focus) {
      seatEls[focus.slot].classList.remove('focus');
      $('focusCard').classList.remove('show');
    }
    const ev = focusQueue.shift();
    if (!ev) {
      focus = null;
      return;
    }
    if (!camOn) {
      focus = null;
      smallGift(ev);
      return nextFocus();
    }
    const pos = SEAT_COORDS[ev.slot];
    focus = { slot: ev.slot, x: pos.x, y: pos.y };
    seatEls[ev.slot].classList.add('focus');
    $('fcImg').src = offeringSrc(ev.img);
    $('fcKind').textContent = OFFERING_KIND[ev.cat] || 'Dâng lễ';
    $('focusCard').className = `focus-card cat-${ev.cat || 'flower'}`;
    $('fcName').textContent = ev.user || '';
    $('fcText').textContent = ev.offering ? `${ev.offering} 🙏` : 'dâng lễ cùng đạo tràng 🙏';
    playHeaven(ev);
    setTimeout(nextFocus, FOCUS_MS);
  }

  function camTarget() {
    // Lúc TỤNG KINH: không cận cảnh ai cả (giữ toàn cảnh đạo tràng, tập trung vào kinh)
    if (!camOn || !isOfferingPhase(phase)) return null;
    if (focus) {
      const s = SeatLayout.scaleAt(focus.y);
      return { z: Math.min(camMax, Math.max(1.3, (CAM_FIGURE_SCALE * 0.9) / s)), fx: focus.x, fy: focus.y - 56 * s };
    }
    if (!activeWalkers.size) return null;
    const ws = [...activeWalkers];
    const lead = ws.reduce((a, b) => (a.y < b.y ? a : b));
    const group = ws.filter((w) => Math.abs(depthOf(w.y) - depthOf(lead.y)) < 0.0005);
    const gx = group.reduce((n, w) => n + w.x, 0) / group.length;
    const fy = group.reduce((n, w) => n + w.y, 0) / group.length;
    const s = SeatLayout.scaleAt(fy);
    // Giữ bố cục cân: tâm khung nằm trên trục thảm đỏ, chỉ lệch nhẹ theo người đi
    const fx0 = carpetCenter(fy) + (gx - carpetCenter(fy)) * 0.3;
    const z = Math.min(camMax, Math.max(1, CAM_FIGURE_SCALE / s));
    return { z, fx: fx0, fy: fy - 60 * s };
  }

  // Lò xo giảm chấn tới hạn: tăng tốc êm rồi dừng êm, không giật khi đổi mục tiêu
  const vel = { z: 0, x: 0, y: 0 };
  function smoothDamp(cur, target, key, smoothTime, dt) {
    const omega = 2 / smoothTime;
    const xx = omega * dt;
    const k = 1 / (1 + xx + 0.48 * xx * xx + 0.235 * xx * xx * xx);
    const change = cur - target;
    const temp = (vel[key] + omega * change) * dt;
    vel[key] = (vel[key] - omega * temp) * k;
    return target + (change + temp) * k;
  }

  function camTick(now) {
    const dt = Math.min(0.1, (now - camLast) / 1000);
    camLast = now;
    const t = camTarget();
    if (!t && camResting) return requestAnimationFrame(camTick);
    const st = t ? 1.1 : 1.6;
    cam.z = smoothDamp(cam.z, t ? t.z : 1, 'z', st, dt);
    const clampX = (v) => Math.min(0, Math.max(1080 - 1080 * cam.z, v));
    const clampY = (v) => Math.min(0, Math.max(1920 - 1920 * cam.z, v));
    const tx = t ? clampX(540 - t.fx * cam.z) : 0;
    const ty = t ? clampY(CAM_VIEW_Y - t.fy * cam.z) : 0;
    cam.x = clampX(smoothDamp(cam.x, tx, 'x', st, dt));
    cam.y = clampY(smoothDamp(cam.y, ty, 'y', st, dt));
    const zoomed = (cam.z - 1) / Math.max(0.01, camMax - 1);
    camVignette.style.opacity = Math.min(1, zoomed * 1.1).toFixed(3);
    if (t) {
      const ss = SeatLayout.scaleAt(t.fy);
      camSpot.style.transform = `translate(${t.fx.toFixed(1)}px, ${(t.fy + 30 * ss).toFixed(1)}px) scale(${(ss * 1.4).toFixed(3)})`;
      camSpot.classList.add('on');
    } else camSpot.classList.remove('on');
    if (!t && Math.abs(cam.z - 1) < 0.002) {
      cam.z = 1;
      cam.x = cam.y = 0;
      vel.z = vel.x = vel.y = 0;
      camResting = true;
      world.style.transform = '';
      camVignette.style.opacity = '0';
    } else {
      camResting = false;
      world.style.transform = `translate(${cam.x.toFixed(1)}px, ${cam.y.toFixed(1)}px) scale(${cam.z.toFixed(4)})`;
    }
    requestAnimationFrame(camTick);
  }
  requestAnimationFrame(camTick);

  function queueWalker(ev) {
    if (walkerQueue.length >= MAX_QUEUE) {
      // Quá đông: vẫn dâng hương / hiện lễ vật và báo tên, không xếp hàng quá dài
      if (ev.gift) queueFocus(ev);
      else offerIncense(ev);
      return;
    }
    walkerQueue.push(ev);
    pumpWalkers();
  }

  let giftWalking = false;
  function pumpWalkers() {
    while (walkerQueue.length) {
      const lane = laneBusy.findIndex((b) => !b);
      if (lane < 0) return;
      // Mỗi lúc chỉ một người dâng quà đi lên (màn lễ vật không chồng lên nhau); người dâng hương vẫn đi song song
      const qi = walkerQueue.findIndex((e) => !e.gift || !giftWalking);
      if (qi < 0) return;
      laneBusy[lane] = true;
      const ev = walkerQueue.splice(qi, 1)[0];
      if (ev.gift) giftWalking = true;
      const now = Date.now();
      const delay = Math.max(0, lastWalkStart + START_GAP_MS - now);
      lastWalkStart = now + delay;
      setTimeout(() => runWalker(ev, lane), delay);
    }
  }

  function offerIncense(ev) {
    const glow = document.createElement('div');
    glow.className = 'incense-glow';
    $('world').appendChild(glow);
    setTimeout(() => glow.remove(), 2600);
    particles.spawnIncenseBurst(540, BURNER_BASE_Y - 20);
    // Tia sáng bay lên từ lư hương (đổi sang toạ độ màn hình theo camera hiện tại)
    fx.burst(540 * cam.z + cam.x, (BURNER_BASE_Y - 30) * cam.z + cam.y, { petals: 4, leaves: 2, sparkles: 18 });
    if (!ev.ambient) ticker(`🔥 <b>${esc(ev.user)}</b> đã dâng hương lễ Phật`);
  }

  function makeWalker(ev) {
    const g = ev.gender === 'm' ? 'm' : 'f';
    const el = document.createElement('div');
    el.className = `walker ${ev.gift ? 'gift' : 'incense'}`;
    el.style.width = `${CHAR_W}px`;
    el.style.height = `${CHAR_H}px`;
    el.style.transformOrigin = `50% ${CHAR_FLOOR * 100}%`;
    el.innerHTML = `<div class="w-glow"></div><img class="w-a" alt="" /><img class="w-b" alt="" />${ev.ambient ? '' : `<div class="w-name">${ev.gift ? '🎁' : '🔥'} ${esc(ev.user)}</div>`}`;
    $('hall').appendChild(el);
    const imgs = [el.querySelector('.w-a'), el.querySelector('.w-b')];
    const name = el.querySelector('.w-name');
    let front = 0;
    let current = null;
    return {
      el,
      // Đổi khung bằng cách hoà mờ hai lớp hình (mượt hơn đổi phắt)
      frame(f, fadeMs = 110) {
        if (f === current) return;
        current = f;
        const next = imgs[1 - front];
        const prev = imgs[front];
        next.style.transition = prev.style.transition = `opacity ${fadeMs}ms linear`;
        next.src = charSrc(g, f);
        next.style.opacity = '1';
        prev.style.opacity = '0';
        front = 1 - front;
      },
      x: 0,
      y: 0,
      place(x, y, extraY = 0) {
        this.x = x;
        this.y = y;
        const s = SeatLayout.scaleAt(y);
        el.style.transform = `translate(${(x - CHAR_W / 2).toFixed(1)}px, ${(y - CHAR_H * CHAR_FLOOR + extraY).toFixed(1)}px) scale(${s.toFixed(4)})`;
        el.style.zIndex = String(10 + Math.round(y / 10));
        // Người đi lên: tên to (~28px trên màn hình dù đứng xa hay gần), màu riêng theo việc đang làm
        if (name) name.style.fontSize = `${Math.round(28 / Math.max(0.25, s * cam.z))}px`;
      },
      hideName() {
        if (name) name.style.opacity = '0';
      }
    };
  }

  function runWalker(ev, lane) {
    const slot = slotByKey.has(ev.key) ? slotByKey.get(ev.key) : ev.slot;
    const seatEl = slot != null && slot >= 0 ? seatEls[slot] : null;
    const seatPos = seatEl ? SEAT_COORDS[slot] : null;
    if (!ev.gift && !ev.ambient) ticker(`🔥 <b>${esc(ev.user)}</b> đang lên dâng hương`);

    // Bước ra từ đầu hàng ghế của mình (sát thảm đỏ); không có chỗ ngồi thì từ cuối thảm
    const y0 = seatPos ? Math.min(CARPET_BOTTOM_Y, seatPos.y) : CARPET_BOTTOM_Y;
    const x0 = seatPos
      ? seatPos.side === 'L'
        ? SeatLayout.carpetLeft(y0) + 6 * SeatLayout.scaleAt(y0)
        : SeatLayout.carpetRight(y0) - 6 * SeatLayout.scaleAt(y0)
      : laneX(lane, y0);
    const w = makeWalker(ev);
    w.frame('stand', 0);
    w.place(x0, y0);
    activeWalkers.add(w);
    w.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, fill: 'forwards' });
    if (seatEl) seatEl.classList.add('away');

    const d0 = depthOf(y0);
    const d1 = depthOf(ALTAR_Y);
    // Mỗi người một dáng đi: tốc độ và nhịp chân hơi khác nhau
    const hurry = (walkerQueue.length > 0 ? 1.3 : 1) * (0.92 + Math.random() * 0.16);
    const stepPhase = Math.random() * 4 * STEP_MS;
    const walkMs = Math.max(1200, ((d1 - d0) / (DEPTH_SPEED * hurry)) * 1000);
    const stepMs = STEP_MS / Math.sqrt(hurry);
    // Toạ độ ngang tính theo "thế giới" (chia cho tỉ lệ) để rẽ vào lối đi trông đúng phối cảnh
    const wx0 = (x0 - carpetCenter(y0)) / SeatLayout.scaleAt(y0);
    const wx1 = (laneX(lane, ALTAR_Y) - carpetCenter(ALTAR_Y)) / SeatLayout.scaleAt(ALTAR_Y);
    const t0 = performance.now() + 450;

    function walkStep(now) {
      const t = Math.min(1, Math.max(0, (now - t0) / walkMs));
      const y = yOfDepth(d0 + (d1 - d0) * t);
      const s = SeatLayout.scaleAt(y);
      const merge = smooth(Math.min(1, t / 0.35)); // rẽ dần vào lối của mình trong 35% quãng đường đầu
      const x = carpetCenter(y) + (wx0 + (wx1 - wx0) * merge) * s;
      const k = Math.floor((Math.max(0, now - t0) + stepPhase) / stepMs) % 4;
      const bob = k % 2 === 1 ? -2.2 * s : 0; // khung chân chụm: người nhô lên một chút
      w.frame(CHAR_FRAMES[k], 90);
      w.place(x, y, bob);
      if (t < 1) requestAnimationFrame(walkStep);
      else atAltar(x);
    }
    setTimeout(() => requestAnimationFrame(walkStep), 450);

    function atAltar(x) {
      w.place(x, ALTAR_Y);
      w.frame('stand', 220);
      w.hideName();
      if (ev.gift) {
        // Dâng lễ vật: đứng chắp tay, lễ vật hiện lên giữa tiên cảnh (camera đang ở cận cảnh), quỳ lạy rồi lui về
        const gseq = [
          [300, () => playHeaven(ev)],
          [1500, () => w.frame('kneel', 320)],
          [2300, () => w.frame('bow', 260)],
          [2750, () => w.frame('bowDeep', 300)],
          [3600, () => w.frame('bow', 300)],
          [4000, () => w.frame('kneel', 280)],
          [5500, () => w.frame('stand', 320)],
          [6100, () => {
            giftWalking = false;
            leave();
          }]
        ];
        gseq.forEach(([at, fn]) => setTimeout(fn, at));
        return;
      }
      const busy = walkerQueue.length > 2;
      const bows = busy ? 1 : 3;
      const seq = [];
      let t = 500;
      seq.push([t, () => offerIncense(ev)]); // đứng chắp tay, dâng hương
      t += 900;
      seq.push([t, () => w.frame('kneel', 320)]);
      t += 600;
      for (let i = 0; i < bows; i++) {
        seq.push([t, () => w.frame('bow', 260)]);
        seq.push([t + 420, () => w.frame('bowDeep', 300)]);
        seq.push([t + 1100, () => w.frame('bow', 300)]);
        seq.push([t + 1500, () => w.frame('kneel', 280)]);
        t += 1850;
      }
      seq.push([t, () => w.frame('stand', 320)]);
      t += 500;
      seq.push([t, () => leave()]);
      seq.forEach(([at, fn]) => setTimeout(fn, at));
    }

    function leave() {
      laneBusy[lane] = false;
      activeWalkers.delete(w);
      const out = w.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, fill: 'forwards' });
      out.onfinish = () => {
        w.el.remove();
        if (seatEl && seatKeyBySlot[slot] === ev.key) {
          seatEl.classList.remove('away', 'arrive');
          void seatEl.offsetWidth;
          seatEl.classList.add('arrive');
          markActive(ev.key); // về chỗ: hiện tên thêm 15 giây
        } else if (seatEl) seatEl.classList.remove('away');
      };
      setTimeout(pumpWalkers, 300);
    }
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
