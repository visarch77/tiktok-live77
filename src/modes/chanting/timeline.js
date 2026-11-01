/**
 * Dòng thời gian chuông – mõ cho từng đoạn của khoá tụng.
 *
 * Theo ghi chú "research_notes/Nhịp mõ chuông và nhạc nền/mo_chuong.md" (nghi thức chùa, GĐPT Huế, Hoằng Pháp, Làng Mai):
 *  - KHÔNG phải lúc nào cũng gõ mõ: niệm hương, xướng danh hiệu, hồi hướng được xướng (intone) chậm,
 *    chỉ điểm chuông; mõ chỉ vào khi đại chúng đồng tụng (sau "khai chuông mõ").
 *  - Khai mõ: bỏ chữ 1, gõ chữ 2, bỏ chữ 3, gõ chữ 4, rồi gõ đều mỗi chữ; tiếng mõ đến trước chữ ~0,1 giây.
 *  - "Trước chậm sau nhanh": nhịp tăng dần trong bài dài; Tâm Kinh / thần chú nhanh hơn kinh tiếng Việt.
 *  - Dứt mõ: "… X XX X" (cặp gõ nhanh trước chữ cuối) rồi một tiếng chuông.
 *  - Chuông: đầu dòng cuối / lần lặp cuối, sau mỗi lần xướng danh hiệu, cuối đoạn; nhẹ "thức chuông" trước tiếng lớn.
 * Lưu ý: không nguồn nào ghi số nhịp/phút — các tốc độ dưới đây là ước tính, chỉnh qua cài đặt "bpm".
 *
 * Kết quả: { syllableTimes: number[] (ms, mỗi chữ), cues: {t, k}[] , durationMs }
 *   k: 'mo' | 'moSoft' | 'moLoud' | 'bell' | 'bellSoft' | 'wake'
 *   g (chỉ với chuông): cử chỉ mời người xem — 'xa' (chắp tay xá), 'chap' (chắp tay), 'breath' (trở về hơi thở, không cần thả tim)
 */

const MO_LEAD_MS = 100; // tiếng mõ đến trước chữ
const QUICK_MS = 190; // khoảng cách cặp gõ nhanh "XX"
const BELL_RING_MS = 4500; // để chuông ngân trước khi sang việc khác

function flat(lines) {
  const out = [];
  lines.forEach((line, li) => line.forEach((w, wi) => out.push({ li, wi })));
  return out;
}

function lineStartIndexes(lines) {
  const starts = [];
  let acc = 0;
  for (const l of lines) {
    starts.push(acc);
    acc += l.length;
  }
  return starts;
}

/**
 * Xướng (không mõ): đọc chậm, nghỉ giữa các dòng; chuông sau các dòng chỉ định.
 * @param {string[][]} lines
 * @param {{ spm: number, linePauseMs?: number, bellAfterLines?: number[], startAt?: number, bellWaitMs?: number }} opts
 */
function intoned(lines, { spm, linePauseMs = 1200, bellAfterLines = [], startAt = 0, bellWaitMs = 2600, gesture = null }) {
  const step = 60000 / spm;
  const syllableTimes = [];
  const cues = [];
  let t = startAt;
  lines.forEach((line, li) => {
    for (let i = 0; i < line.length; i++) {
      syllableTimes.push(Math.round(t));
      t += step;
    }
    if (bellAfterLines.includes(li)) {
      cues.push({ t: Math.round(t + 150), k: 'bell', ...(gesture ? { g: gesture } : {}) });
      t += Math.max(linePauseMs, bellWaitMs); // chờ chuông ngân bớt rồi mới xướng tiếp
    } else {
      t += linePauseMs;
    }
  });
  return { syllableTimes, cues, endAt: Math.round(t) };
}

/**
 * Đồng tụng có mõ: mỗi chữ một tiếng mõ, khai mõ "bỏ 1 – gõ 2 – bỏ 3 – gõ 4", nhịp nhanh dần, dứt "X XX X" + chuông.
 * @param {string[][]} lines
 * @param {{ spm: number, accelerate?: number, startAt?: number, bellAtLastLine?: boolean, moPerLine?: boolean }} opts
 */
function chantedWithMo(lines, { spm, accelerate = 0, startAt = 0, bellAtLastLine = false, moPerLine = false }) {
  const words = flat(lines);
  const n = words.length;
  const base = 60000 / spm;
  const syllableTimes = [];
  const cues = [];
  let t = startAt;
  for (let i = 0; i < n; i++) {
    syllableTimes.push(Math.round(t));
    const speed = n > 1 ? 1 + accelerate * (i / (n - 1)) : 1;
    t += base / speed;
  }
  const lastInterval = n > 1 ? syllableTimes[n - 1] - syllableTimes[n - 2] : base;

  const starts = lineStartIndexes(lines);
  if (moPerLine) {
    // Lối Làng Mai cho kinh tiếng Việt: một tiếng mõ đầu mỗi dòng
    starts.forEach((si, li) => cues.push({ t: Math.max(startAt, syllableTimes[si] - MO_LEAD_MS), k: li === 0 ? 'moSoft' : 'mo' }));
  } else {
    for (let i = 0; i < n; i++) {
      if (i === 0 || i === 2) continue; // khai mõ: bỏ chữ 1 và chữ 3
      const at = Math.max(startAt, syllableTimes[i] - MO_LEAD_MS);
      const k = i === 1 || i === 3 ? 'moSoft' : i === n - 1 ? 'moLoud' : 'mo';
      cues.push({ t: at, k });
      if (n >= 4 && i === n - 2) cues.push({ t: at + QUICK_MS, k: 'mo' }); // "XX" trước chữ cuối
    }
  }

  if (bellAtLastLine && lines.length > 1) {
    cues.push({ t: syllableTimes[starts[lines.length - 1]], k: 'bell' }); // chuông đầu dòng cuối (Làng Mai)
  } else if (n > 8) {
    cues.push({ t: syllableTimes[n - 5] - MO_LEAD_MS, k: 'bell' }); // báo sắp dứt: chuông ~5 tiếng mõ trước khi hết
  }
  // Dứt: chuông cùng tiếng mõ cuối — mời chắp tay xá
  const endBell = syllableTimes[n - 1] - MO_LEAD_MS + 20;
  cues.push({ t: endBell, k: 'bell', g: 'xa' });
  return { syllableTimes, cues, endAt: syllableTimes[n - 1] + Math.round(lastInterval) + BELL_RING_MS };
}

/**
 * Khai chuông mõ (mẫu báo Giác Ngộ): 3 tiếng chuông rời; mõ 7 tiếng (4 rời, 2 liền, 1 rời);
 * chuông – mõ xen kẽ 3 lần; lại mõ 7 tiếng; dập chuông.
 */
function khaiChuongMo(startAt = 0) {
  const cues = [{ t: startAt, k: 'wake' }];
  let t = startAt + 1200;
  for (let i = 0; i < 3; i++) {
    cues.push({ t, k: 'bell' });
    t += 2200;
  }
  const seven = () => {
    // X X X X  XX  X  — 4 rời, 2 liền, 1 rời
    for (let i = 0; i < 4; i++) {
      cues.push({ t, k: i === 0 ? 'moSoft' : 'mo' });
      t += 900;
    }
    cues.push({ t, k: 'mo' });
    cues.push({ t: t + QUICK_MS, k: 'mo' });
    t += 1100;
    cues.push({ t, k: 'moLoud' });
    t += 1300;
  };
  seven();
  for (let i = 0; i < 3; i++) {
    cues.push({ t, k: 'bell' });
    t += 1100;
    cues.push({ t, k: 'mo' });
    t += 1100;
  }
  seven();
  cues.push({ t, k: 'wake' }); // dập chuông
  return { syllableTimes: [], cues, endAt: t + 1200 };
}

/** Chuông mở khoá: thức chuông rồi 3 tiếng, cách nhau khoảng ba hơi thở (lối Làng Mai, khoảng cách tăng dần). */
function openingBells() {
  return {
    syllableTimes: [],
    cues: [
      { t: 0, k: 'wake' },
      { t: 3000, k: 'bell', g: 'chap' },
      { t: 12000, k: 'bell' },
      { t: 22000, k: 'bell' }
    ],
    endAt: 28000
  };
}

/** Mời ngồi yên: thức chuông + 1 tiếng. */
function sittingStartBells() {
  return { syllableTimes: [], cues: [{ t: 0, k: 'wake' }, { t: 2500, k: 'bell', g: 'breath' }], endAt: 2500 };
}

/** Kết khoá: thức chuông rồi 2 tiếng gần nhau (1,5 giây). */
function closingBells() {
  return {
    syllableTimes: [],
    cues: [
      { t: 0, k: 'wake' },
      { t: 2200, k: 'bell', g: 'xa' },
      { t: 3700, k: 'bell' }
    ],
    endAt: 10000
  };
}

/**
 * Đọc tự nhiên (người đọc đọc cả câu với nhịp bình thường): mốc thời gian lấy theo độ dài thật của từng câu.
 * Chữ sáng rải đều trong lúc câu được đọc; nếu có mõ thì gõ một tiếng ở đầu mỗi dòng (lối Làng Mai) vì đọc tự nhiên
 * quá nhanh để gõ mõ từng chữ. Chuông giữ đúng vị trí theo nghi thức.
 * @param {string[][]} lines
 * @param {number[]} durs  độ dài (ms) của từng câu đã đọc
 * @param {{ startAt?: number, gapMs?: number, mo?: boolean, bellAfterLines?: number[], gesture?: string|null,
 *           endBell?: boolean, bellWaitMs?: number }} opts
 */
function spoken(lines, groups, { startAt = 0, gapMs = 700, mo = false, bellAfterLines = [], gesture = null, endBell = false, bellWaitMs = 2600 } = {}) {
  // groups: [{ start, end (không gồm), durMs, url }] — mỗi nhóm là MỘT CÂU đọc liền mạch (có thể gồm nhiều dòng).
  // Giọng đọc làm chuẩn thời gian; mõ (nếu có) chỉ điểm nhẹ ở đầu câu; chữ sáng dần theo tỉ lệ số chữ trong câu.
  const syllableTimes = [];
  const lineTimes = [];
  const voiceTimes = [];
  const voiceClips = [];
  const cues = [];
  let t = startAt;
  groups.forEach((g, gi) => {
    const dur = Math.max(400, g.durMs || 0);
    voiceTimes.push(Math.round(t));
    voiceClips.push(g.url || null);
    if (mo) cues.push({ t: Math.max(startAt, Math.round(t) - MO_LEAD_MS), k: gi === 0 ? 'moSoft' : gi === groups.length - 1 ? 'moLoud' : 'mo' });
    const gl = lines.slice(g.start, g.end);
    const PAUSE = 1.6; // chỗ ngắt giữa hai dòng trong câu ≈ 1,6 chữ
    const units = gl.reduce((n, l) => n + l.length, 0) + PAUSE * (gl.length - 1);
    const speech = dur * 0.94;
    let u = 0;
    gl.forEach((line, k) => {
      if (k > 0) u += PAUSE;
      lineTimes.push(Math.round(t + (speech * u) / units));
      for (let i = 0; i < line.length; i++) syllableTimes.push(Math.round(t + (speech * (u + i)) / units));
      u += line.length;
    });
    t += dur;
    if (bellAfterLines.includes(g.end - 1)) {
      cues.push({ t: Math.round(t + 150), k: 'bell', ...(gesture ? { g: gesture } : {}) });
      t += Math.max(gapMs, bellWaitMs);
    } else t += gapMs;
  });
  let endAt = Math.round(t);
  if (endBell) {
    cues.push({ t: endAt, k: 'bell', g: 'xa' });
    endAt += BELL_RING_MS;
  }
  return { syllableTimes, lineTimes, voiceTimes, voiceClips, cues, endAt };
}

function merge(...parts) {
  return {
    syllableTimes: parts.flatMap((p) => p.syllableTimes),
    cues: parts.flatMap((p) => p.cues).sort((a, b) => a.t - b.t),
    lineTimes: parts.flatMap((p) => p.lineTimes || []),
    voiceTimes: parts.flatMap((p) => p.voiceTimes || []),
    voiceClips: parts.flatMap((p) => p.voiceClips || [])
  };
}

module.exports = { intoned, chantedWithMo, spoken, khaiChuongMo, openingBells, sittingStartBells, closingBells, merge, BELL_RING_MS };
