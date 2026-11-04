// Kiểm tra lõi game: npx tsx src/game/quiz.check.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Classroom, LineBag, compactVi, dayPeriod, plain, scramble, topicName } from './quiz';
import { parseBank, type Question } from './questions';
import { GAME } from './config';
import { makeMath } from './math';
import { LINES, PICK_TOPICS, POLLS } from './loi-thoai';

const dir = path.join(import.meta.dirname, 'cau-hoi');
const BANK = parseBank(Object.fromEntries(fs.readdirSync(dir).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')])));
const mk = (answer: string, d: Question['difficulty'] = 'easy', id = answer): Question => ({ id, answer, clue: 'gợi ý', kind: 'Đây là thử.', category: 'x', difficulty: d });
const who = (i: number) => ({ username: `u${i}`, nickname: `Bạn ${i}`, spoken: `Bạn ${i}`, avatar: '' });
const chat = (c: Classroom, i: number, comment: string, createTime: number, now: number) => c.chat({ ...who(i), comment, createTime }, now);
let t = 1_000_000;

// ---------- chữ ----------
assert.equal(compactVi('  Bảng   Đen! '), 'bảngđen');
assert.equal(plain('Vào Lớp'), 'vaolop');
assert.equal(compactVi('Bảng đen'.normalize('NFD')), 'bảngđen'); // gõ kiểu tổ hợp dấu vẫn khớp
assert.equal(compactVi('hóa học'), compactVi('hoá học')); // dấu kiểu cũ/mới
assert.equal(compactVi('thủy tinh'), compactVi('thuỷ tinh'));
assert.notEqual(compactVi('hoàng'), compactVi('hoang'));
const s = scramble('BẢNG ĐEN', () => 0.3);
assert.deepEqual([...s].sort(), [...'BẢNGĐEN'].sort());
assert.notEqual(s.join(''), 'BẢNGĐEN');

// ---------- lời thoại: đủ nhiều, không trùng, bốc hết xấp mới lặp ----------
for (const [key, list] of Object.entries(LINES)) {
  assert.ok(list.length >= 2, `${key}: ít nhất 2 câu`);
  const texts = (list as unknown[]).map((l) => (typeof l === 'function' ? (l as (...a: string[]) => string)('A', 'B') : l));
  assert.equal(new Set(texts).size, texts.length, `${key}: có câu trùng`);
  for (const x of texts as string[]) assert.ok(!/[—–]/.test(x), `${key}: có gạch ngang: ${x}`);
}
assert.ok(PICK_TOPICS.length >= 20);
const bag = new LineBag(() => 0.42);
const seen = new Set<number>();
for (let i = 0; i < 10; i++) seen.add(bag.pick('k', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
assert.equal(seen.size, 10, 'đọc hết 10 câu mới được lặp');
let prev = -1;
for (let i = 0; i < 200; i++) {
  const x = bag.pick('k2', [0, 1, 2, 3]);
  assert.notEqual(x, prev, 'không lặp ngay câu vừa đọc');
  prev = x;
}

// ---------- 1 câu, 1000 người, tới lệch thứ tự ----------
{
  const c = new Classroom([mk('BẢNG ĐEN')], t);
  c.newRound(t);
  const asked = c.tick((t += GAME.introSec * 1000));
  assert.equal(c.phase, 'question');
  assert.ok(asked.some((l) => l.main && l.text.includes('Câu 1.')), 'câu hỏi là câu chính, được đọc trước');
  assert.deepEqual(c.slots(), [null, null, null, null, ' ', null, null, null]);
  chat(c, 9999, 'khó quá', t, t); // nói chuyện thường không bị tính sai
  chat(c, 9999, 'bảng đen', t + 9000, t);
  assert.equal(c.correct.length, 1);
  chat(c, 5000, 'bảng đên', t, t); // sai trước thì không được trả lời lại
  chat(c, 5000, 'bảng đen', t, t);
  assert.ok(!c.correct.some((a) => a.username === 'u5000'));
  chat(c, 5001, 'bang den', t, t); // không dấu không tính
  assert.ok(!c.correct.some((a) => a.username === 'u5001'));
  for (let i = 0; i < 1000; i++) chat(c, i, i < 300 ? 'Bảng Đen' : 'xin chào cô', t + 5000 - i, t + 10);
  assert.equal(c.correct.length, 301);
  assert.equal(c.correct[0].username, 'u299', 'createTime sớm nhất đứng đầu');
  assert.deepEqual(c.correct.slice(0, 4).map((a) => a.points), [10, 7, 5, 3]);
  assert.equal(c.correct[10].points, 1);
  c.tick((t += GAME.questionSec * 1000 + 50));
  assert.equal(c.phase, 'reveal');
  assert.equal(c.students.get('u299')!.score, 10);
  assert.equal(c.students.get('u299')!.session, 10);
  assert.equal(c.seats()[0].username, 'u299');
  assert.equal(c.weekDelta.get('u299')!.points, 10);
  assert.equal(c.slots(true).join(''), 'BẢNG ĐEN');
  // hết câu (bộ chỉ 1 câu chữ + 4 câu toán tự sinh) -> tổng kết -> ra chơi -> tiết mới xoá điểm tiết, giữ điểm buổi
  for (let k = 0; k < 40 && c.phase !== 'results'; k++) c.tick((t = c.phaseEndsAt));
  assert.equal(c.phase, 'results');
  c.tick((t += GAME.resultsSec * 1000));
  assert.equal(c.phase, 'recess');
  for (let k = 0; k < 3 && c.phase === 'recess'; k++) c.tick((t += 40_000));
  assert.equal(c.phase, 'intro');
  assert.equal(c.students.get('u299')!.score, 0);
  assert.ok(c.students.get('u299')!.session >= 10);
}

// ---------- nhịp giọng: dừng giờ lúc cô đọc, chỉ nói thêm lúc chờ trả lời ----------
{
  const c = new Classroom([mk('MÈO'), mk('CHÓ', 'easy', 'cho')], t);
  c.newRound(t);
  assert.ok(!c.chatterWindow(t), 'đang giới thiệu tiết: không chào');
  c.tick((t += GAME.introSec * 1000));
  const end = c.phaseEndsAt;
  c.hold(4000); // cô đọc đề 4 giây
  assert.equal(c.phaseEndsAt, end + 4000, 'đọc đề xong mới đếm giờ');
  assert.ok(c.chatterWindow(t + 4000), 'đang chờ trả lời: được chào');
  assert.ok(!c.chatterWindow(c.phaseEndsAt - GAME.chatterMinLeftMs + 1), 'sắp hết giờ: không chào');
  c.hold(GAME.maxHoldMs * 3);
  assert.equal(c.phaseEndsAt, end + GAME.maxHoldMs, 'dừng giờ có trần');
  chat(c, 1, c.q!.answer, t + 4000, t + 4000);
  const reveal = c.tick((t = c.phaseEndsAt));
  assert.equal(c.phase, 'reveal');
  assert.ok(reveal.every((l) => l.main), 'lúc hiện đáp án: toàn câu chính, đọc theo chương trình');
  assert.ok(!c.chatterWindow(t), 'đang hiện đáp án: không chào');
}

// ---------- đáp án có chữ "sinh nhật": chấm bài, không bật chúc mừng sinh nhật ----------
{
  const c = new Classroom([mk('SINH NHẬT'), mk('BÁNH SINH NHẬT', 'easy', 'banh')], t);
  c.newRound(t);
  c.tick((t += GAME.introSec * 1000));
  chat(c, 7, c.q!.answer, t, t);
  assert.equal(c.correct[0]?.username, 'u7', `gõ "${c.q!.answer}" phải được tính đúng`);
}
// mỗi câu trong bộ đều gõ đúng đáp án là được tính đúng
for (const q of BANK) {
  const c = new Classroom([q], t);
  c.newRound(t);
  c.tick((t += GAME.introSec * 1000));
  if (c.phase !== 'question' || c.q?.id !== q.id) continue; // câu chỉ hỏi ở vị trí riêng (toán, mẹo...) thì bỏ qua
  chat(c, 1, q.answer, t, t);
  assert.equal(c.correct.length, 1, `${q.id}: gõ đúng đáp án mà không được tính`);
}

// ---------- không ai đúng: mở 1 chữ + thêm giờ ----------
{
  const c = new Classroom([mk('BẢNG ĐEN')], t);
  c.newRound(t);
  c.tick((t += GAME.introSec * 1000));
  c.tick((t += GAME.questionSec * 1000));
  assert.equal(c.phase, 'bonus');
  assert.equal(c.revealed.size, 1);
  c.tick((t += GAME.bonusSec * 1000));
  assert.equal(c.phase, 'reveal');
  // quà to mở chữ, không mở quá (số chữ - 2)
  const g = new Classroom([mk('BẢNG ĐEN')], t);
  g.newRound(t);
  g.tick((t += GAME.introSec * 1000));
  for (let i = 0; i < 20; i++) g.gift(who(1), GAME.hintGiftCoins, t);
  assert.equal(g.revealed.size, 7 - GAME.keepHiddenLetters);
  assert.equal(g.flowers, 20);
}

// ---------- tiết thật: 20 câu, 5 dễ 6 vừa 5 khó + 4 câu toán (câu 5, 10, 15, 19); câu 20 nhân đôi; chuỗi 3 câu ----------
{
  const c = new Classroom(BANK, t);
  c.newRound(t);
  c.tick((t += GAME.introSec * 1000));
  const plan: string[] = [];
  const cats: string[] = [];
  for (let k = 0; k < GAME.questionsPerRound; k++) {
    assert.equal(c.phase, 'question');
    const q = c.q!;
    plan.push(q.math ? GAME.roundPlan[k] : (q.slot ?? q.difficulty));
    if (!q.math) cats.push(q.category);
    else {
      assert.match(q.answer, /^\d+$/, 'câu toán: đáp án là số');
      assert.equal(c.tiles.length, 0, 'câu toán không xáo chữ');
      assert.ok(c.view(t).math.endsWith('= ?'));
    }
    if (k === GAME.questionsPerRound - 1) assert.ok(c.golden, 'câu 20 là câu hỏi vàng');
    else assert.ok(!c.golden);
    chat(c, 1, q.answer, t, t);
    if (k === GAME.questionsPerRound - 1) assert.equal(c.correct[0].points, 20);
    c.tick((t += GAME.questionSec * 1000 + 1));
    c.tick((t += GAME.revealSec * 1000));
    // câu 5, 10, 15: cô dừng lại điểm danh, tặng quà rồi mới ra câu tiếp
    if ((k + 1) % GAME.praiseEvery === 0 && k + 1 < GAME.questionsPerRound) {
      assert.equal(c.phase, 'praise', `dừng điểm danh sau câu ${k + 1}`);
      assert.equal(c.view(t).praiseTop[0].username, 'u1');
      c.tick((t += GAME.praiseSec * 1000));
    }
  }
  assert.ok(c.students.get('u1')!.desk.length >= 3, 'quà điểm danh đặt lên bàn');
  assert.ok(c.students.get('u1')!.desk.length <= GAME.deskGifts);
  assert.deepEqual(plan, [...GAME.roundPlan]);
  for (let i = 1; i < cats.length; i++) assert.notEqual(cats[i], cats[i - 1], 'không 2 câu chữ liền cùng chủ đề');
  // 19 câu x 10 + câu vàng 20 + 6 lần chuỗi (câu 3, 6, ..., 18) x 5
  assert.equal(c.students.get('u1')!.score, 19 * 10 + 20 + 6 * GAME.streakBonus);
  assert.equal(c.phase, 'results');
  assert.equal(c.usedLog.length, 16, 'câu toán không ghi vào sổ lớp');
}

// ---------- câu toán: đáp án đúng phép tính, luôn là số dương ----------
for (const lv of [1, 2, 3, 4] as const) {
  for (let i = 0; i < 500; i++) {
    const q = makeMath(lv);
    const expr = q.math!.show.replace(' = ?', '').replace(/×/g, '*').replace(/−/g, '-').replace(/:/g, '/');
    const n = Function(`return ${expr}`)() as number;
    assert.equal(String(n), q.answer, q.math!.show);
    assert.ok(Number.isInteger(n) && n > 0, q.math!.show);
  }
}

// ---------- đọc đề xong cô hô bắt đầu; còn 5 giây cô nhắc, đồng hồ không dừng ----------
{
  const c = new Classroom(BANK, t);
  c.newRound(t);
  const start = c.tick((t += GAME.introSec * 1000));
  assert.equal(c.phase, 'question');
  assert.ok(LINES.go.includes(start[start.length - 1].text.slice(3)), 'câu cuối lúc ra đề là hô bắt đầu');
  assert.ok(start[start.length - 1].go);
  assert.ok(start.every((l) => l.main));
  // cô đang đọc đề (đồng hồ dừng): chưa hiện bảng chữ; hô bắt đầu mới hiện
  c.hold(3000);
  c.tick(t);
  assert.equal(c.view(t).boardShown, false, 'đang đọc đề: chưa hiện chữ');
  c.showBoard();
  assert.equal(c.view(t).boardShown, true);
  assert.ok(!c.tick((t = c.phaseEndsAt - GAME.warnLeftSec * 1000 - 500)).some((l) => l.warn));
  const warn = c.tick((t += 600));
  assert.equal(warn.filter((l) => l.warn).length, 1);
  assert.ok(!warn.some((l) => l.warn && l.main), 'nhắc giờ không dừng đồng hồ');
  assert.ok(!c.tick((t += 200)).some((l) => l.warn), 'chỉ nhắc 1 lần');
}

// ---------- không hỏi lại câu đã hỏi gần đây ----------
{
  const history: Record<string, number> = {};
  const c = new Classroom(BANK, t, Math.random, history);
  const asked = new Set<string>();
  // chưa tới lúc hết câu dễ / câu đố mẹo (loại nào ít hơn thì hết trước)
  const perRound = (d: string) => GAME.roundPlan.filter((x) => x === d).length;
  const easy = BANK.filter((q) => q.difficulty === 'easy' && !q.slot).length;
  const ofSlot = (s: string) => BANK.filter((q) => q.slot === s).length;
  const rounds = Math.min(Math.floor(easy / perRound('easy')), ...['meo', 'su', 'anh'].map((s) => Math.floor(ofSlot(s) / perRound(s)))) - 2;
  for (let r = 0; r < rounds; r++) {
    c.newRound((t += 1000));
    for (const id of c.usedLog.splice(0)) {
      assert.ok(!asked.has(id), `câu ${id} bị hỏi lại ở tiết ${r + 1}`);
      asked.add(id);
    }
  }
  // buổi live sau (đọc sổ cũ) cũng không hỏi lại
  const next = new Classroom(BANK, t, Math.random, { ...history });
  next.newRound(t);
  const fresh = next.usedLog.filter((id) => !asked.has(id)).length;
  assert.equal(fresh, next.usedLog.length, 'buổi sau vẫn ưu tiên câu chưa hỏi');
  console.log(`  ${rounds} tiết liền (${asked.size} câu) không lặp câu nào`);
}

// ---------- giờ ra chơi ----------
const recessOf = (game: 'rps' | 'callup' | 'pick' | 'roll' | 'heart', seed = 0.1) => {
  const c = new Classroom([mk('MÈO'), mk('CHÓ', 'easy', 'cho')], t, () => seed);
  c.newRound(t);
  for (let i = 0; i < 5; i++) chat(c, i, 'chào cô', t, t); // vào lớp, vừa hoạt động
  c.forceRecess(game, t);
  return c;
};
{
  // oẳn tù tì: cô ra theo rand; thắng cô +2 điểm buổi, không đụng điểm tiết
  const c = recessOf('rps', 0.1); // rand 0.1 -> cô ra "búa"
  chat(c, 1, 'bao', t, t);
  chat(c, 2, 'Kéo', t, t);
  chat(c, 1, 'kéo', t, t); // đổi ý không tính
  c.tick((t += GAME.recessPlaySec.rps * 1000));
  assert.equal(c.view(t).recess!.teacher, 'búa');
  assert.equal(c.students.get('u1')!.session, GAME.rpsPoints);
  assert.equal(c.students.get('u1')!.score, 0);
  assert.equal(c.students.get('u2')!.session, 0);
  c.tick((t += GAME.recessResultSec * 1000));
  assert.equal(c.recess!.stage, 'board');
  c.tick((t += GAME.recessBoardSec * 1000));
  assert.equal(c.phase, 'intro');
}
{
  // kiểm tra miệng: chỉ bạn được gọi mới được trả lời, đúng +5, chốt ngay
  const c = recessOf('callup');
  assert.equal(c.recess!.game, 'callup');
  const target = c.recess!.callTarget!;
  const answer = c.recess!.callQ!.answer;
  const other = [...c.students.values()].find((u) => u.username !== target.username)!;
  c.chat({ ...other, comment: answer, createTime: t }, t);
  assert.equal(c.recess!.callResult, '');
  c.chat({ ...target, comment: answer, createTime: t }, t);
  assert.equal(c.recess!.callResult, 'right');
  c.tick(t);
  assert.equal(c.students.get(target.username)!.session, GAME.callUpPoints);
}
{
  // chọn phe: đếm 1/2, mỗi người 1 phiếu
  const c = recessOf('pick');
  chat(c, 1, '1', t, t);
  chat(c, 2, '2', t, t);
  chat(c, 3, '1', t, t);
  chat(c, 1, '2', t, t);
  assert.deepEqual(c.view(t).recess!.votes, [2, 1]);
  const out = c.tick((t += GAME.recessPlaySec.pick * 1000));
  assert.ok(out.some((l) => l.text.includes('67')), 'đọc phần trăm phe thắng');
}
{
  // điểm danh: 10 bạn gõ "có mặt" sớm nhất (theo giờ TikTok) +3
  const c = recessOf('roll');
  for (let i = 0; i < 15; i++) chat(c, 100 + i, 'Có mặt!', t + 100 - i, t);
  c.tick((t += GAME.recessPlaySec.roll * 1000));
  assert.equal(c.students.get('u114')!.session, GAME.rollPoints);
  assert.equal(c.students.get('u100')!.session, 0);
}
{
  // thả tim: mỗi tim thật tính x heartBoost, đủ mốc thì ai vừa hoạt động +1
  const c = recessOf('heart');
  c.like(GAME.heartTarget / GAME.heartBoost - 1, t, false);
  c.like(1, t, false);
  assert.equal(c.recess!.hearts, GAME.heartTarget, '60 tim thật x5 = 300');
  c.tick((t += GAME.recessPlaySec.heart * 1000));
  assert.equal(c.students.get('u1')!.session, 1);
}

// ---------- lớp trưởng: đổi người thì cô thông báo ----------
{
  const c = new Classroom([mk('MÈO'), mk('CHÓ', 'easy', 'cho'), mk('GÀ', 'easy', 'ga')], t);
  c.newRound(t);
  c.tick((t += GAME.introSec * 1000));
  const said: string[] = [];
  const step = () => {
    said.push(...c.tick((t += GAME.questionSec * 1000 + 1)).map((l) => l.text));
    c.tick((t += GAME.revealSec * 1000));
  };
  chat(c, 1, c.q!.answer, t, t);
  step();
  chat(c, 2, c.q!.answer, t, t);
  chat(c, 1, c.q!.answer, t + 1, t);
  step();
  chat(c, 2, c.q!.answer, t, t);
  said.push(...c.tick((t += GAME.questionSec * 1000 + 1)).map((l) => l.text));
  assert.equal(c.view(t).seats.find((x) => x.username === 'u2')!.title, 'lop-truong');
  assert.ok(said.some((l) => l.includes('Bạn 2') && /lớp trưởng/i.test(l)), 'cô báo lớp trưởng mới');
}

// ---------- lớp trưởng chỉ tính điểm tiết này; tiết mới tranh lại từ đầu ----------
{
  const c = new Classroom([mk('MÈO'), mk('CHÓ', 'easy', 'cho')], t);
  const playRound = (winner: number) => {
    c.newRound(t);
    for (let k = 0; k < 200 && c.phase !== 'results'; k++) {
      if (c.phase === 'question' && c.correct.length === 0) chat(c, winner, c.q!.answer, t, t);
      c.tick((t = c.phaseEndsAt));
    }
  };
  playRound(1);
  assert.equal(c.view(t).seats.find((s) => s.username === 'u1')!.title, 'lop-truong');
  playRound(2);
  assert.equal(c.view(t).seats.find((s) => s.username === 'u2')!.title, 'lop-truong', 'tiết 2: bạn thắng tiết 2 làm lớp trưởng');
  assert.equal(c.view(t).seats.find((s) => s.username === 'u1')!.title, '', 'điểm tiết trước không còn tính');
  c.newRound(t);
  assert.ok(c.view(t).seats.every((s) => s.title === ''), 'đầu tiết: chưa ai là lớp trưởng');
  assert.deepEqual(
    c.view(t).champions.map((x) => [x.round, x.username]),
    [
      [2, 'u2'],
      [1, 'u1'],
    ],
  );
}

// ---------- lớp vắng: ôn bài bằng câu cũ, có bạn vào thì đổi sang câu mới ----------
{
  const history: Record<string, number> = {};
  const c = new Classroom(BANK, t, Math.random, history);
  c.newRound(t); // tiết 1: còn người (vừa mở), câu mới
  assert.ok(!c.review);
  const asked = new Set(c.usedLog.splice(0));
  t += GAME.emptyRoomMs + 1000; // 5 phút không ai làm gì
  const said = c.newRound(t);
  assert.ok(c.review, 'lớp vắng: tiết ôn bài');
  assert.ok(said.some((l) => LINES.reviewIntro.includes(l.text.slice(3))));
  assert.equal(c.usedLog.length, 0, 'ôn bài không tốn câu mới');
  const qs = (c as unknown as { roundQs: Question[] }).roundQs;
  assert.ok(qs.filter((q) => !q.math).every((q) => asked.has(q.id)), 'ôn bài chỉ hỏi câu đã hỏi');
  c.tick((t += GAME.introSec * 1000)); // câu 1 (ôn)
  chat(c, 1, 'cô ơi', t, t); // có bạn vào
  for (let k = 0; k < 5 && c.qNo < 2; k++) c.tick((t = c.phaseEndsAt));
  assert.equal(c.qNo, 2);
  assert.ok(!c.review, 'có bạn vào: hết ôn bài');
  assert.ok(c.usedLog.length > 0, 'phần còn lại là câu mới');
  assert.ok(c.view(t).review === false);
}

// ---------- đọc đề: nói số chữ cái + loại từ trước, hô bắt đầu xong mới hiện chữ ----------
{
  const c = new Classroom(BANK, t);
  const q = (answer: string, kind: string, slot?: 'anh' | 'su') => ({ ...mk(answer), kind, slot });
  assert.equal(c.intro(q('BẢNG ĐEN', 'Đây là thứ ở trường lớp.')), 'Đây là một từ gồm 7 chữ cái, là thứ ở trường lớp.');
  assert.equal(c.intro(q('NGÔ QUYỀN', 'Câu lịch sử nè.', 'su')), 'Câu lịch sử nè. Đây là một từ gồm 8 chữ cái.');
  assert.equal(c.intro(q('CAT', 'Câu tiếng Anh nè.', 'anh')), 'Câu tiếng Anh nè. Đây là một từ tiếng Anh gồm 3 chữ cái.');
}

// ---------- "ai yêu cô thì gõ số 1": rủ lúc chờ trả lời câu chữ, đếm, cảm ơn ----------
{
  const c = new Classroom([mk('BẢNG ĐEN'), mk('CÁI BÀN', 'easy', 'ban')], t);
  t += GAME.engageEveryMs; // đã lâu chưa rủ
  for (let i = 0; i < 5; i++) chat(c, i, 'hi', t, t); // giữ lớp không vắng
  c.newRound(t);
  c.tick((t += GAME.introSec * 1000));
  c.showBoard();
  const call = c.tick(t);
  assert.ok(call.some((l) => LINES.loveCall.includes(l.text.slice(3))), 'cô rủ gõ số 1');
  assert.ok(call.every((l) => !l.main), 'câu nói thêm, không dừng đồng hồ');
  chat(c, 1, '1', t + 1000, t + 1000);
  chat(c, 1, '1', t + 1000, t + 1000); // gõ 2 lần chỉ tính 1
  chat(c, 2, '1', t + 2000, t + 2000);
  assert.equal(c.view(t).loveFans, 2);
  assert.equal(c.correct.length + c.view(t).stats.attempts, 0, 'gõ số 1 không bị tính là trả lời');
  const thanks = c.tick((t += GAME.loveWindowMs));
  assert.ok(thanks.some((l) => l.text.includes('2 bạn') || l.text.includes('2 bạn nhỏ')), 'cô cảm ơn kèm số bạn');
  assert.equal(c.love, null);

  // lượt sau: kể chuyện vui; lượt sau nữa: bình chọn, đếm phiếu, đọc kết quả
  const nextTurn = () => {
    t += GAME.engageEveryMs;
    for (let i = 0; i < 5; i++) chat(c, i, 'hi', t, t);
    c.newRound(t);
    c.tick((t += GAME.introSec * 1000));
    c.showBoard();
    return c.tick(t);
  };
  assert.ok(nextTurn().some((l) => LINES.funFact.includes(l.text.slice(3))), 'cô kể chuyện vui');
  const ask = nextTurn();
  assert.ok(c.poll, 'cô hỏi bình chọn');
  assert.ok(ask.some((l) => POLLS.some((p) => p.ask === l.text.slice(3))));
  const [a, b] = c.poll!.opts;
  chat(c, 1, a.key.toUpperCase(), t, t);
  chat(c, 2, a.key, t, t);
  chat(c, 3, b.key, t, t);
  chat(c, 3, a.key, t, t); // đổi ý không tính
  assert.equal(c.view(t).poll!.find((o) => o.key === a.key)!.n, 2);
  assert.equal(c.view(t).stats.attempts, 0, 'gõ 1 chữ không bị tính là trả lời');
  const result = c.tick((t += GAME.loveWindowMs));
  assert.ok(result.some((l) => l.text.includes(a.label) && l.text.includes('2')), 'cô đọc kết quả bình chọn');
}

// ---------- học sinh tương tác: bong bóng chat, tặng hoa đi lên bục, phạt lên bục, ngủ gật ----------
{
  const c = new Classroom([mk('BẢNG ĐEN'), mk('CÁI BÀN', 'easy', 'ban')], t, () => 0); // rand 0: luôn trêu, luôn phạt
  c.newRound(t);
  c.tick((t += GAME.introSec * 1000));
  const seat = (u: string) => c.view(t).seats.find((s) => s.username === u)!;
  chat(c, 1, 'cô ơi con đói', t, t);
  assert.equal(seat('u1').bubble, 'cô ơi con đói', 'bình luận thường hiện bong bóng');
  chat(c, 2, 'X'.repeat(c.answerLetters.length), t, t); // trả lời sai: không hiện (dài bằng đáp án)
  assert.equal(seat('u2').bubble, '', 'câu trả lời không hiện bong bóng (lộ đáp án)');
  c.chat({ ...who(3), comment: 'tục tĩu', createTime: t, safe: false }, t);
  assert.equal(seat('u3').bubble, '', 'bình luận có từ cấm không hiện');
  assert.equal(c.view(t + GAME.bubbleMs).seats.find((s) => s.username === 'u1')!.bubble, '', 'bong bóng tự tắt');
  // tặng hoa: đi lên bục, đang đi thì bạn khác tặng không chen
  c.gift(who(1), 1, t);
  c.gift(who(3), 1, t + 500);
  assert.equal(c.view(t).walk!.username, 'u1');
  assert.equal(c.view(t + GAME.walkMs).walk, null);
  // trả lời sai bị trêu + phạt lên bục đứng
  const said = c.tick((t = c.phaseEndsAt));
  for (let k = 0; k < 3 && c.phase !== 'reveal'; k++) said.push(...c.tick((t = c.phaseEndsAt)));
  assert.ok(said.some((l) => LINES.roastStand.some((f) => f('Bạn 2') === l.text.slice(3))), 'cô phạt lên bục');
  assert.deepEqual(c.view(t).punished.map((p) => p.username), ['u2']);
  assert.ok(seat('u2').standing);
  assert.equal(c.view(t + GAME.standSec * 1000).punished.length, 0, 'hết giờ phạt thì về chỗ');
  // ngồi im lâu: ngủ gật
  assert.ok(c.view(t + GAME.sleepAfterMs + 1).seats.every((s) => s.sleeping));
}

// ---------- xếp ghế: cùng điểm thì bạn đang tương tác ngồi trước bạn đã im lâu ----------
{
  const c = new Classroom(BANK, t);
  chat(c, 1, 'hi', t, t); // vào trước nhưng sau đó im
  chat(c, 2, 'hi', t + 1000, t + 1000);
  assert.equal(c.seats()[0].username, 'u1', 'cùng điểm, cùng còn ở: ai vào trước ngồi trước');
  t += GAME.seatActiveMs + 5000;
  chat(c, 2, 'cô ơi', t, t);
  c.tick(t);
  assert.equal(c.seats()[0].username, 'u2', 'bạn im lâu nhường ghế cho bạn đang tương tác');
}

// ---------- chào theo giờ ----------
{
  const at = (h: number) => new Date(2026, 10, 4, h, 30).getTime();
  assert.deepEqual([6, 11, 15, 19, 23, 2].map((h) => dayPeriod(at(h))), ['sang', 'trua', 'chieu', 'toi', 'khuya', 'khuya']);
  const c = new Classroom(BANK, at(7));
  const first = c.newRound(at(7)).map((l) => l.text.slice(3));
  assert.ok(first.some((x) => LINES.timeMorning.includes(x)), 'tiết đầu: chào buổi sáng');
  const night = c.newRound(at(23)).map((l) => l.text.slice(3));
  assert.ok(night.some((x) => LINES.timeNight.includes(x)), 'đổi buổi: chào khuya');
}

// ---------- nút "Bỏ câu này": sang câu tiếp, không ai được điểm, không bao giờ hỏi lại ----------
{
  const c = new Classroom(BANK, t);
  c.newRound(t);
  c.tick((t += GAME.introSec * 1000));
  const bad = c.q!;
  chat(c, 1, bad.answer, t, t);
  const said = c.banCurrent(t);
  assert.ok(said.some((l) => LINES.banned.includes(l.text.slice(3))), 'cô nói bỏ câu');
  assert.equal(c.qNo, 2, 'sang câu tiếp liền');
  assert.equal(c.students.get('u1')!.score, 0, 'câu bị bỏ không tính điểm');
  assert.deepEqual(c.banLog.map((b) => b.id), [bad.id]);
  // buổi sau đọc sổ: câu bị bỏ không bao giờ ra nữa
  const next = new Classroom(BANK.filter((q) => q.difficulty === bad.difficulty && !q.slot).slice(0, 30).concat(bad), t, Math.random, {}, [bad.id]);
  for (let r = 0; r < 5; r++) {
    next.newRound((t += 1000));
    assert.ok(!next.usedLog.splice(0).includes(bad.id), 'câu bị bỏ bị hỏi lại');
  }
  // câu toán tự sinh thì không bỏ được (không có trong file)
  const m = new Classroom([], t);
  m.newRound(t);
  m.tick((t += GAME.introSec * 1000));
  assert.ok(m.q?.math);
  assert.deepEqual(m.banCurrent(t), []);
}

// ---------- phòng vắng: có người đúng thì 8 giây sau chốt; phòng đông thì đủ giờ ----------
{
  const small = new Classroom([mk('MÈO'), mk('CHÓ', 'easy', 'cho')], t);
  small.newRound(t);
  small.tick((t += GAME.introSec * 1000));
  chat(small, 1, small.q!.answer, t, t);
  assert.equal(small.phaseEndsAt, t + GAME.smallRoomEndAfterSec * 1000);
  const big = new Classroom([mk('MÈO'), mk('CHÓ', 'easy', 'cho')], t);
  big.newRound(t);
  big.tick((t += GAME.introSec * 1000));
  const end = big.phaseEndsAt;
  for (let i = 10; i < 10 + GAME.smallRoomPlayers; i++) chat(big, i, 'xin chào', t, t);
  chat(big, 1, big.q!.answer, t, t);
  assert.equal(big.phaseEndsAt, end, 'phòng đông: chạy đủ giờ');
}

// ---------- sinh nhật: bánh kem lên bàn, vỗ tay, mỗi bạn 1 lần, cách nhau 1 phút ----------
{
  const c = new Classroom(BANK, t);
  c.newRound(t);
  assert.equal(chat(c, 1, 'chúc mừng sinh nhật bạn ấy', t, t).length, 0, 'chúc người khác thì không tính');
  const said = chat(c, 1, 'Hôm nay sinh nhật con cô ơi', t, t);
  assert.equal(said.length, 1);
  assert.ok(said[0].priority && !said[0].main, 'nói chen lúc chờ trả lời, không cắt ngang đề');
  assert.equal(c.students.get('u1')!.desk.at(-1)!.icon, '🎂');
  assert.ok(c.view(t).clapping);
  assert.equal(c.view(t).birthday!.nickname, 'Bạn 1');
  assert.equal(chat(c, 2, 'sinh nhật mình nè', t + 1000, t + 1000).length, 0, 'chưa đủ 1 phút');
  assert.equal(chat(c, 1, 'sinh nhật con mà', t + 120_000, t + 120_000).length, 0, 'mỗi bạn 1 lần');
  assert.equal(chat(c, 2, 'sinh nhật mình nè', t + 120_000, t + 120_000).length, 1);
}

// ---------- chuyên cần: ngày thứ 2 cô nhận ra, mốc đẹp thì có quà ----------
{
  const c = new Classroom(BANK, t);
  assert.equal(c.attendance(who(1), 1, t).length, 0, 'ngày đầu: chưa nói gì');
  assert.equal(c.attendance(who(2), 2, t).length, 1);
  const before = c.students.get('u3')?.desk.length ?? 0;
  const ms = c.attendance(who(3), GAME.attendMilestones[0], t);
  assert.ok(ms[0].priority);
  assert.equal(c.students.get('u3')!.desk.length, before + 1, 'mốc chuyên cần có quà');
  assert.equal(c.view(t).seats.find((s) => s.username === 'u3')!.days, GAME.attendMilestones[0]);
}

// ---------- cả lớp chọn chủ đề tiết sau ----------
{
  const c = new Classroom(BANK, t);
  c.newRound(t);
  for (let k = 0; k < 200 && c.phase !== 'vote'; k++) c.tick((t = c.phaseEndsAt));
  assert.equal(c.phase, 'vote');
  const [a, b] = c.view(t).vote!.topics;
  assert.notEqual(a, b);
  chat(c, 1, '2', t, t);
  chat(c, 2, '2', t, t);
  chat(c, 2, '1', t, t); // đổi ý không tính
  chat(c, 3, '1', t, t);
  assert.deepEqual(c.view(t).vote!.counts, [1, 2]);
  c.tick((t = c.phaseEndsAt));
  assert.equal(c.phase, 'intro');
  assert.equal(topicName(c.topic), b);
  assert.equal(topicName('Ca dao, thành ngữ (điền từ còn thiếu)'), 'Ca dao, thành ngữ');
  const qs = (c as unknown as { roundQs: Question[] }).roundQs;
  assert.equal(qs.filter((q) => q.category === c.topic && !q.slot).length, GAME.voteTopicQuestions, 'chủ đề thắng có 5 câu');
}

// ---------- báo cáo: mỗi câu đã hỏi ghi số bạn thử / đúng ----------
{
  const c = new Classroom([mk('MÈO'), mk('CHÓ', 'easy', 'cho')], t);
  c.newRound(t);
  c.tick((t += GAME.introSec * 1000));
  for (let i = 0; i < 6; i++) chat(c, i, i < 4 ? c.q!.answer : 'XYZ', t, t);
  for (let k = 0; k < 5 && c.phase !== 'reveal'; k++) c.tick((t = c.phaseEndsAt));
  assert.deepEqual(
    c.reportLog.map((r) => [r.attempts, r.correct]),
    [[6, 4]],
  );
}

console.log('quiz.check: tất cả đều đúng');
