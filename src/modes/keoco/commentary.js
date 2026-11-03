/**
 * Giọng bình luận viên Kéo Co: câu hài cho từng kỹ năng và tình huống trên sân (đọc bằng giọng TTS của phòng).
 * Chỗ trống: {n} người dùng kỹ năng, {t} đội của họ, {o} đội đối thủ, {v} người bị trúng / người được nhắc tên.
 * Không có emoji (giọng đọc sẽ đọc lên); câu ngắn để đọc kịp nhịp trận.
 */
const SKILL_VI = {
  gong: [
    '{n} gồng ẻ, gân cổ nổi lên như dây điện!',
    '{n} gồng một phát, rách luôn cái áo!',
    '{n} hít một hơi thật sâu rồi gồng, mặt đỏ như trái cà chua!',
    '{n} gồng hết cỡ, kéo một mình bằng hai!'
  ],
  energy: [
    '{n} khui nước tăng lực mời cả hàng, uống xong ai cũng tỉnh như sáo!',
    '{n} phát nước tăng lực, đồng đội uống ực ực rồi kéo tiếp!',
    '{n} ực một lon tăng lực, mắt sáng như đèn pha!'
  ],
  tickle: [
    '{n} lấy lông gà cù lét {v}, {v} cười bể bụng, buông dây luôn!',
    '{v} bị cù lét, cười sặc sụa, quên mất mình đang kéo co!',
    'Nhột quá trời! {v} cười lăn lộn, hai tay buông dây!'
  ],
  glue: [
    '{n} đã đầu tư găng tay keo, {t} kéo cứng ngắc!',
    '{t} đeo găng tay keo của {n}, dính dây như sam, bôi mỡ cũng không trôi!',
    'Găng keo của {n} xịn quá, giờ {t} muốn buông dây cũng không được!'
  ],
  cheer: [
    '{n} cầm loa hò hét cổ vũ, {t} hồi sức nhanh gấp đôi!',
    '{n} nhảy múa cổ vũ, đồng đội vừa kéo vừa cười!',
    'Có fan cứng {n} cổ vũ, {t} như được ăn thêm chén cơm!'
  ],
  grease: [
    '{n} ném mỡ khiến cho {o} tuột tay, trơn như lươn!',
    '{n} bôi mỡ heo lên dây, {o} cầm dây như cầm cá trê!',
    'Ối trời, {n} bôi mỡ, {o} trơn tay, lực còn có một nửa!'
  ],
  strong: [
    '{t} được lực sĩ đi ngang qua tiện tay kéo dùm!',
    '{n} thuê lực sĩ về kéo phụ, một mình bằng bốn người!',
    'Lực sĩ của {n} vào sân, vừa kéo vừa khoe cơ bụng sáu múi!'
  ],
  fart: [
    'Bủm! {n} xì hơi thật to, gió bay sang {o}, năm người choáng váng!',
    '{n} ăn đậu hơi nhiều, xì một phát, {o} xỉu ngang!',
    'Mùi gì vậy trời! {n} thả boom, {v} chóng mặt quay vòng vòng, đồng đội của {n} cũng phải bịt mũi!'
  ],
  heave: [
    '{n} hô hò dô, {t} kéo đều tay như một, không biết mệt!',
    'Hò dô ta nào! {n} bắt nhịp, cả {t} kéo như máy!'
  ],
  banana: [
    '{n} ném vỏ chuối, {v} đạp trúng, trượt chổng vó!',
    'Vỏ chuối bay tới! Ba người {o} té oạch, dây giật về phía {t}!',
    '{n} ăn chuối xong vứt vỏ đúng chỗ, {o} trượt một cú ngoạn mục!'
  ]
};
const SKILL_EN = {
  gong: ['{n} powers up, neck veins popping like cables!', '{n} flexes so hard the shirt rips!', '{n} goes red as a tomato and pulls like two people!'],
  energy: ['{n} hands out energy drinks, the whole row is wide awake!', '{n} chugs an energy drink, eyes shining like headlights!'],
  tickle: ['{n} tickles {v} with a feather, {v} laughs so hard they let go!', '{v} gets tickled and forgets this is a tug of war!'],
  glue: ['{n} bought sticky gloves, {t} is glued to the rope!', 'Thanks to {n}, {t} could not let go even if they wanted to!'],
  cheer: ['{n} grabs a megaphone, {t} recovers twice as fast!', '{n} dances on the side, the team pulls while laughing!'],
  grease: ['{n} throws grease, {o} slips like an eel!', '{n} butters the rope, {o} is holding a slippery fish!'],
  strong: ['A strongman walking by gives {t} a hand!', '{n} hires a strongman, he pulls like four people!'],
  fart: ['{n} lets out a huge fart, {o} is dizzy!', 'What is that smell? {n} dropped a fart bomb, {v} is spinning!'],
  heave: ['{n} leads a heave ho, {t} pulls like a machine!'],
  banana: ['{n} throws a banana peel, {v} slips and falls flat!', 'Banana peel! Three of {o} go down, the rope jerks toward {t}!']
};
const BLOCKED_VI = [
  'Á à, {o} có găng tay keo, chiêu của {n} vô dụng!',
  '{n} chơi xấu nhưng {o} dính dây như keo, không xi nhê gì!'
];
const BLOCKED_EN = ['Ha! {o} has sticky gloves, the trick from {n} does nothing!'];
const BANKED_VI = ['{n} để dành {s} cho {t}, ra sân là xài liền!', '{n} cất {s} vào túi cho {t}, chờ ra sân!'];
const BANKED_EN = ['{n} saves {s} for {t}, ready when they hit the field!'];

// Tình huống trên sân
const EVENT_VI = {
  exhaust: ['{v} kéo hăng quá, giờ thở hộc hộc như cún chạy bộ!', '{v} hết hơi, ngồi phịch xuống đất!', '{v} mệt lả, lưỡi thè ra như con cún!'],
  danger: ['{o} sắp rơi xuống vực rồi! Bám chặt vào!', 'Mép vực tới nơi, {o} kéo mau lên kẻo rơi!', '{o} đang bị lôi đi như kéo bao gạo!'],
  comeback: ['Lội ngược dòng! {t} kéo dây về lại rồi!', 'Không thể tin nổi, {t} gỡ lại được rồi!'],
  last10: ['Còn mười giây! Dồn hết sức nào!', 'Mười giây cuối! Thả tim lẹ lên!'],
  star: ['{v} đang kéo như trâu cày ruộng!', '{v} kéo khoẻ nhất sân, ăn gì mà khoẻ vậy!'],
  lazy: ['{t} kéo nhẹ như kéo dây phơi đồ, mạnh lên chứ!', '{t} ơi, ngủ gật hả, thả tim đi!'],
  even: ['Hai đội giằng co, dây căng như dây đàn!', 'Ngang tài ngang sức, chưa ai chịu ai!'],
  fall: ['{o} rơi tõm xuống vực!', '{o} bay xuống vực, la thất thanh!', '{o} rơi xuống vực, ướt như chuột lột!']
};
const EVENT_EN = {
  exhaust: ['{v} pulled too hard and is panting like a puppy!', '{v} is out of breath and sits down!'],
  danger: ['{o} is about to fall off the edge! Hold on!', '{o} is being dragged like a sack of rice!'],
  comeback: ['What a comeback! {t} pulls the rope back!'],
  last10: ['Ten seconds left! Give it everything!'],
  star: ['{v} is pulling like a tractor!', '{v} is the strongest on the field!'],
  lazy: ['{t} is pulling like it is a laundry line, come on!'],
  even: ['Dead even, the rope is tight as a guitar string!'],
  fall: ['{o} falls into the abyss!', '{o} flies off the edge screaming!']
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fill = (s, vars) => s.replace(/\{(\w)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== '' ? vars[k] : k === 'v' ? vars.o || '' : ''));

function skillComment(skill, vars, en, { blocked = false, banked = false } = {}) {
  if (banked) return fill(pick(en ? BANKED_EN : BANKED_VI), vars);
  if (blocked) return fill(pick(en ? BLOCKED_EN : BLOCKED_VI), vars);
  const bank = (en ? SKILL_EN : SKILL_VI)[skill];
  return bank ? fill(pick(bank), vars) : '';
}
function eventComment(kind, vars, en) {
  const bank = (en ? EVENT_EN : EVENT_VI)[kind];
  return bank ? fill(pick(bank), vars) : '';
}

module.exports = { skillComment, eventComment };
