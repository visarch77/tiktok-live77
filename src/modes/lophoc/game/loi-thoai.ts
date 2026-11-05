// =====================================================
//  LỜI THOẠI CÔ GIÁO. Mỗi tình huống có nhiều câu, game bốc lần lượt kiểu xáo bài
//  (đọc hết cả xấp mới lặp lại) nên live lâu vẫn ít nghe trùng.
//  Muốn thêm câu: chép 1 dòng trong đúng nhóm. Tên người xem luôn là tên đã làm sạch,
//  KHÔNG BAO GIỜ chèn nguyên văn comment vào đây.
//  Kiểm tra: npx tsx src/game/quiz.check.ts (đếm số câu mỗi nhóm, tìm câu trùng)
// =====================================================

type L0 = string[];
type L1 = ((a: string) => string)[];
type L2 = ((a: string, b: string) => string)[];
type L3 = ((a: string, b: string, c: string) => string)[];

// Quà cô thưởng: cô nói tên quà, món quà bay xuống đặt lên bàn bạn nhỏ (hình icon)
export const REWARDS = [
  { name: 'một cây kẹo mút', icon: '🍭' },
  { name: 'một viên kẹo ngọt', icon: '🍬' },
  { name: 'một cái nơ xinh', icon: '🎀' },
  { name: 'một cái bánh quy', icon: '🍪' },
  { name: 'một cái bánh kem nhỏ', icon: '🧁' },
  { name: 'một hộp sữa', icon: '🥛' },
  { name: 'một quả táo đỏ', icon: '🍎' },
  { name: 'một phiếu bé ngoan', icon: '🎫' },
  { name: 'một ngôi sao sáng', icon: '🌟' },
  { name: 'một bông hoa điểm tốt', icon: '🌸' },
  { name: 'một điểm mười đỏ chót', icon: '💯' },
  { name: 'một hộp bút chì màu', icon: '🖍️' },
  { name: 'một chú gấu bông', icon: '🧸' },
  { name: 'một quả bóng bay', icon: '🎈' },
];
// Số lần chép phạt: từ 10 tới 1 triệu, số nhỏ hay gặp hơn số to, làm tròn cho dễ đọc (vd 40, 3.500, 120.000)
const penalty = () => {
  const n = 10 ** (1 + Math.random() * 5);
  const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.min(1_000_000, Math.round(n / step) * step).toLocaleString('vi-VN');
};

export const LINES = {
  // ---------- Vào tiết ----------
  intro: [
    'Cả lớp ổn định nào! Tiết mới bắt đầu rồi. Cô xáo chữ, ai gõ đáp án nhanh nhất thì nhiều điểm nhất.',
    'Trống vào lớp rồi nha. Hai mươi câu, câu cuối là câu hỏi vàng nhân đôi điểm. Chuẩn bị bàn phím đi.',
    'Ngồi ngay ngắn lại, cất điện thoại đi... à quên, lớp mình học bằng điện thoại. Vào bài thôi!',
    'Tiết này cô đố hai mươi câu, có bốn câu toán nhẩm. Gõ đáp án vào bình luận, phải gõ có dấu nha các bạn nhỏ.',
    'Hai mươi câu, xen bốn câu toán khó dần. Ai giỏi cả văn lẫn toán thì ngồi bàn đầu.',
    'Tiết này có cả câu đố mẹo nha các bạn nhỏ. Cẩn thận kẻo bị cô lừa đó.',
    'Hôm nay có cả tiếng Anh, toán, lịch sử với câu đố mẹo. Chuẩn bị nha các bạn nhỏ!',
    'Ai ngủ gật thì dậy, ai ăn vặt thì cất. Tiết mới, điểm làm lại từ đầu, ai cũng có cơ hội ngồi bàn đầu.',
    'Chào cả lớp! Hôm nay cô hỏi khó hơn hôm qua một chút. Bạn nhỏ nào giỏi thì chứng minh đi.',
    'Vào học! Ai trả lời đúng nhanh nhất được mười điểm, chậm hơn thì ít điểm hơn. Chép bài bạn thì được đúng một điểm thôi nha.',
    'Lớp trưởng đâu, hô cả lớp đứng dậy coi. Thôi khỏi, ngồi luôn đi, vào câu một.',
    'Tiết mới tới rồi. Bàn đầu đang trống, ai giỏi thì lên ngồi.',
    'Cả lớp chú ý lên bảng. Chữ cô xáo lung tung, việc của các bạn nhỏ là xếp lại cho đúng.',
  ] as L0,

  goldenIntro: [
    'Câu cuối rồi! Câu hỏi vàng, điểm nhân đôi. Bạn nhỏ nào đang thua thì lật kèo ở câu này.',
    'Câu hỏi vàng tới đây! Đúng câu này điểm gấp đôi, bảng xếp hạng đổi hết đó.',
    'Tập trung nha, câu cuối nhân đôi điểm. Ai ngồi bàn đầu mà sai câu này là mất ghế như chơi.',
    'Câu hỏi vàng! Cô chờ xem ai là người cướp ngôi lớp trưởng.',
    'Câu cuối, nhân đôi điểm. Gõ nhanh mà nhớ gõ đúng dấu nha.',
  ] as L0,

  // đọc đề xong cô hô bắt đầu tính giờ
  go: [
    'Bắt đầu!',
    'Tính giờ! Bắt đầu!',
    'Đồng hồ chạy rồi, bắt đầu!',
    'Ba, hai, một, bắt đầu!',
    'Gõ đáp án đi các bạn nhỏ, bắt đầu!',
    'Bấm giờ nè, bắt đầu!',
    'Cô đếm giờ đây, bắt đầu!',
  ] as L0,

  // còn 5 giây
  timeWarn: [
    'Chuẩn bị hết giờ nhé các bạn nhỏ ơi!',
    'Sắp hết giờ rồi các bạn nhỏ ơi, nhanh tay lên!',
    'Còn năm giây thôi các bạn nhỏ ơi!',
    'Chuẩn bị hết giờ nha, ai chưa gõ thì gõ lẹ lên!',
  ] as L0,

  // trêu bạn sai + phạt lên bục đứng thật (nhân vật lên đứng cạnh bảng, đeo bảng "học sinh cá biệt")
  roastStand: [
    (n) => `Bạn ${n} gõ sai rồi, lên bục đứng cạnh cô một chút nha. Học sinh cá biệt đây rồi!`,
    (n) => `Ối ${n} sai nữa rồi! Lên bục đứng cho cả lớp nhìn nè, hihi.`,
    (n) => `Cô phạt ${n} lên bục đứng một lát nha. Đứng xong nhớ trả lời đúng đó.`,
    (n) => `${n} ơi, lên đứng góc lớp cạnh bảng nha. Cô đùa thôi, đứng một xíu rồi về chỗ.`,
  ] as L1,
  // gọi bạn ngủ gật (ngồi im lâu) dậy
  wakeUp: [
    (n) => `Ơ kìa bạn nhỏ ${n} ngủ gật rồi! Dậy trả lời câu này với cô coi.`,
    (n) => `${n} ơi, dậy đi nào, cô thấy bạn nhỏ gật gù nãy giờ đó.`,
    (n) => `Cả lớp gọi ${n} dậy giùm cô với. Bạn nhỏ ngủ ngon quá trời.`,
  ] as L1,

  // ---------- Thỉnh thoảng rủ tương tác (lúc đang chờ trả lời) ----------
  loveCall: [
    'Ai yêu cô thì gõ số một nào, các bé iu ơi!',
    'Bạn nhỏ nào thương cô thì gõ số một cho cô xem nha!',
    'Các bé iu ơi, ai đang học với cô thì gõ số một nào!',
    'Ai thấy cô hôm nay xinh thì gõ số một nha, hihi.',
    'Cô đếm xem lớp mình có bao nhiêu bạn nhỏ ngoan nè, gõ số một đi nào!',
  ] as L0,
  // c = số bạn gõ, n = vài tên
  loveThanks: [
    (c, n) => `Ôi ${c} bạn nhỏ yêu cô luôn, cô cảm động quá! Cô thương ${n} nhiều lắm.`,
    (c, n) => `${c} bạn gõ số một rồi nè! Cảm ơn ${n}, cô cũng yêu các bé lắm.`,
    (c, n) => `Cô thấy rồi nha, ${n} và các bạn, tổng cộng ${c} bạn nhỏ. Cô vui quá trời.`,
  ] as L2,

  // kết quả bình chọn vui: l = lựa chọn đông nhất, c = số bạn
  pollResult: [
    (l, c) => `Kết quả nè: ${l} đông nhất, ${c} bạn nhỏ luôn!`,
    (l, c) => `Cô đếm rồi nha, ${l} thắng với ${c} bạn nhỏ.`,
    (l, c) => `Ồ, ${l} nhiều nhất lớp mình, ${c} bạn. Vui quá trời.`,
  ] as L2,
  pollTie: [
    (c) => `${c} bạn nhỏ trả lời, mà hoà nhau luôn! Lớp mình chia đều ghê.`,
    (c) => `Hoà rồi nha, ${c} bạn chia đều hai bên. Cô thích cả hai.`,
  ] as L1,

  // chuyện vui, chuyện lịch sử, mẹo tiếng Anh (1-2 câu) lúc đang chờ trả lời. Chỉ ghi điều chắc chắn đúng.
  // "| E: ... | F:" = đọc phần tiếng Anh bằng giọng tiếng Anh
  funFact: [
    'Các bạn nhỏ có biết không, con bạch tuộc có tới ba trái tim đó.',
    'Con ngựa có thể ngủ trong lúc đứng đó các bạn nhỏ.',
    'Chim cánh cụt không bay được, nhưng bơi dưới nước giỏi lắm nha.',
    'Hươu cao cổ có cái lưỡi rất dài, màu tím sẫm luôn đó.',
    'Mặt trời thật ra là một ngôi sao, ở gần mình nhất nên mới to vậy đó.',
    'Biển và đại dương chiếm khoảng bảy phần mười bề mặt Trái Đất. Nhiều nước ghê chưa.',
    'Trái tim của mỗi bạn nhỏ đập khoảng một trăm nghìn lần mỗi ngày đó.',
    'Cá heo ngủ mà vẫn mở một mắt để canh chừng. Giỏi ghê chưa.',
    'Mật ong cất kỹ để rất lâu cũng không bị hỏng đó các bạn nhỏ.',
    'Con ong phải bay qua rất nhiều bông hoa mới làm ra được một chút mật đó.',
    'Cầu vồng có bảy màu: đỏ, cam, vàng, lục, lam, chàm, tím. Bạn nhỏ nào nhớ hết không?',
    'Văn Miếu ở Hà Nội xây từ năm một nghìn không trăm bảy mươi, gần một nghìn năm rồi đó.',
    'Thành Cổ Loa có những vòng thành xoắn như con ốc, do An Dương Vương cho xây.',
    'Chữ mình đang học gọi là chữ quốc ngữ, viết bằng chữ cái La-tinh đó các bạn nhỏ.',
    'Hồ Gươm còn có tên là hồ Hoàn Kiếm, gắn với truyền thuyết vua Lê Lợi trả gươm thần.',
    'Mẹo tiếng Anh nè: chào buổi sáng là | E: good morning | F: Các bạn nhỏ nói theo cô nha.',
    'Mẹo tiếng Anh nè: cảm ơn là | E: thank you | F: còn không có gì là | E: you are welcome',
    'Mẹo tiếng Anh nè: con yêu mẹ là | E: I love you, mom | F: Tối nay nói với mẹ thử nha.',
    'Mẹo tiếng Anh nè: chúc ngủ ngon là | E: good night | F: Nhớ đi ngủ sớm nha các bạn nhỏ.',
    'Mẹo tiếng Anh nè: bạn tên gì là | E: what is your name? | F: Trả lời là | E: my name is',
    'Mẹo tiếng Anh nè: số không là | E: zero | F: còn một trăm là | E: one hundred',
    'Mẹo tiếng Anh nè: ngày mai gặp lại là | E: see you tomorrow',
  ] as L0,

  // ---------- Lớp vắng: ôn bài bằng câu cũ ----------
  reviewIntro: [
    'Lớp mình đang vắng, cô cho ôn bài cũ nha. Bạn nhỏ nào vào lớp thì gõ chào cô một tiếng, cô ra bài mới liền.',
    'Giờ ôn bài nè. Cô hỏi lại mấy câu cũ, ai đang xem thì trả lời thử coi còn nhớ không nha.',
    'Tiết này mình ôn bài. Bạn nhỏ nào vào thì gõ vào lớp, cô chuyển sang bài mới cho nè.',
  ] as L0,
  reviewEnd: [
    'A, có bạn nhỏ vào lớp rồi! Hết ôn bài, cô ra câu mới nha.',
    'Lớp đông lên rồi nè. Thôi ôn bài vậy đủ, giờ học bài mới.',
    'Có bạn rồi! Cô chuyển sang câu mới cho các bạn nhỏ nè.',
  ] as L0,

  // ---------- Chào theo giờ trong ngày (đọc đầu tiết) ----------
  timeMorning: [
    'Chào buổi sáng các bạn nhỏ! Ăn sáng chưa đó? Vừa ăn vừa học với cô nha.',
    'Buổi sáng tốt lành cả lớp! Sáng sớm đầu óc tỉnh táo, trả lời nhanh lắm đó.',
    'Sáng rồi các bạn nhỏ ơi! Ai dậy sớm học bài với cô thì giỏi nhất lớp.',
  ] as L0,
  timeNoon: [
    'Trưa rồi các bạn nhỏ ơi, ăn cơm trưa chưa? Ăn xong nhớ ngủ trưa một chút nha.',
    'Giờ ăn trưa nè. Bạn nhỏ nào vừa ăn cơm vừa học với cô thì nhớ ăn hết cơm nha.',
    'Trưa nắng quá, các bạn nhỏ ở trong nhà học với cô cho mát nè.',
  ] as L0,
  timeAfternoon: [
    'Chào buổi chiều cả lớp! Đi học về chưa đó các bạn nhỏ?',
    'Buổi chiều rồi, bạn nhỏ nào vừa tan học thì vào lớp cô ôn bài tiếp nha.',
    'Chiều mát rồi nè. Học với cô một tiết rồi đi chơi nha các bạn nhỏ.',
  ] as L0,
  timeEvening: [
    'Chào buổi tối các bạn nhỏ! Ăn cơm tối xong vào học với cô nha.',
    'Tối rồi, cả nhà quây quần, các bạn nhỏ rủ ba mẹ chơi đoán chữ cùng luôn đi.',
    'Buổi tối lớp mình đông vui quá. Tiết này ai làm lớp trưởng đây?',
  ] as L0,
  timeNight: [
    'Khuya rồi các bạn nhỏ ơi. Bạn nhỏ nào còn thức thì học thêm một chút rồi đi ngủ nha.',
    'Đã khuya rồi đó. Các bạn nhỏ nhớ đi ngủ sớm để mai dậy học bài nha, cô vẫn ở đây.',
    'Giờ này các bạn nhỏ phải đi ngủ rồi nè. Ai còn thức thì chơi nhỏ nhỏ với cô thôi nha.',
  ] as L0,

  // ---------- Chúc mừng sinh nhật (bạn nhỏ gõ "hôm nay sinh nhật con") ----------
  birthday: [
    (n) => `Ôi hôm nay sinh nhật bạn nhỏ ${n}! Cả lớp cùng chúc mừng sinh nhật bạn nhỏ nào! Cô tặng bạn nhỏ một cái bánh kem nè.`,
    (n) => `Chúc mừng sinh nhật ${n}! Chúc bạn nhỏ hay ăn chóng lớn, học giỏi, ngoan ngoãn nha. Cả lớp vỗ tay nào!`,
    (n) => `Hôm nay là ngày đặc biệt của ${n} nè! Cô chúc bạn nhỏ tuổi mới thật vui, thật nhiều quà. Bánh kem của bạn nhỏ đây!`,
    (n) => `Cả lớp ơi, ${n} sinh nhật kìa! Mình cùng hát mừng sinh nhật bạn nhỏ nha. Cô đặt bánh kem lên bàn rồi đó.`,
    (n) => `Sinh nhật vui vẻ nha ${n}! Tuổi mới bạn nhỏ trả lời câu nào cũng đúng hết nha.`,
  ] as L1,

  // ---------- Chuyên cần: bạn nhỏ đi học nhiều ngày liền (d = số ngày) ----------
  attendBack: [
    (n, d) => `A, bạn nhỏ ${n} lại vào lớp nè! Đi học ${d} ngày liền rồi đó.`,
    (n, d) => `Cô nhớ ${n} nha, hôm qua cũng có mặt. ${d} ngày liền rồi, chăm ghê.`,
    (n, d) => `${n} quay lại rồi! Bạn nhỏ đi học đều ${d} ngày liền, cô thương quá.`,
    (n, d) => `Chào ${n}, ngày thứ ${d} liền vào lớp rồi đó. Ngoan lắm.`,
  ] as L2,
  // n tên, d số ngày, g quà
  attendMilestone: [
    (n, d, g) => `Cả lớp ơi, ${n} đi học ${d} ngày liền không nghỉ buổi nào! Cô tặng bạn nhỏ ${g} vì chuyên cần.`,
    (n, d, g) => `Bạn nhỏ chuyên cần nhất lớp đây rồi: ${n}, ${d} ngày liền! Phần thưởng là ${g}.`,
    (n, d, g) => `${d} ngày liền có mặt, ${n} giỏi quá! Cô thưởng ${g}, các bạn nhỏ khác học tập bạn nha.`,
  ] as L3,

  // ---------- Chủ kênh bấm "Bỏ câu này" ----------
  banned: [
    'Ối, câu này cô ra chưa hay, mình bỏ qua câu này nha các bạn nhỏ.',
    'Câu này cô đổi nha, sang câu khác liền.',
    'Thôi câu này bỏ, cô ra câu khác dễ thương hơn nè.',
  ] as L0,

  // ---------- Cả lớp chọn chủ đề tiết sau (a, b = 2 chủ đề) ----------
  voteIntro: [
    (a, b) => `Tiết sau học gì đây các bạn nhỏ? Gõ số một nếu chọn ${a}, gõ số hai nếu chọn ${b}.`,
    (a, b) => `Cả lớp quyết định nha! Một là ${a}, hai là ${b}. Gõ số vào bình luận đi nào.`,
    (a, b) => `Cô cho các bạn nhỏ chọn chủ đề tiết sau: một, ${a}. Hai, ${b}. Bên nào nhiều phiếu hơn thì học bên đó.`,
  ] as L2,
  voteResult: [
    (t) => `Cả lớp đã chọn rồi! Tiết này mình học chủ đề ${t} nha.`,
    (t) => `Chủ đề ${t} thắng rồi! Cô ra nhiều câu về ${t} cho các bạn nhỏ nè.`,
    (t) => `Theo ý cả lớp, tiết này có nhiều câu về ${t}. Chuẩn bị nha!`,
  ] as L1,
  voteNobody: [
    'Chưa ai chọn hết, vậy cô tự chọn câu hỏi nha.',
    'Không ai bình chọn hả? Thôi cô trộn đủ chủ đề luôn.',
  ] as L0,

  // ---------- Câu đố mẹo (câu 7, 13) ----------
  riddleReveal: [
    (answer, rest) => `Đáp án là ${answer}! Hihi, có bạn nhỏ nào bị cô lừa không? ${rest}`,
    (answer, rest) => `${answer} nha các bạn nhỏ! Câu đố mẹo đó, nghĩ thẳng là trật liền. ${rest}`,
    (answer, rest) => `Là ${answer} đó! Bạn nhỏ nào đoán ra thì lanh lợi quá trời. ${rest}`,
    (answer, rest) => `Cô công bố, ${answer}! Mẹo chút xíu thôi mà. ${rest}`,
  ] as L2,
  riddleNobody: [
    (a) => `Hihi, cả lớp bị cô lừa hết rồi! Đáp án là ${a} đó.`,
    (a) => `Là ${a} nè các bạn nhỏ. Câu đố mẹo mà, phải nghĩ ngược lại mới ra.`,
    (a) => `${a}! Cô thắng cả lớp một ván rồi nha, hihi.`,
    (a) => `Không ai ra hả? ${a} đó. Câu sau cô lừa tiếp nha.`,
  ] as L1,
  riddleWrong: [
    (n) => `Bạn nhỏ ${n} bị cô lừa rồi, hihi. Không sao, câu đố mẹo khó lắm.`,
    (n) => `${n} trả lời nghe có lý ghê mà vẫn trúng bẫy của cô.`,
    (n) => `Ối ${n} sập bẫy rồi! Câu đố mẹo phải nghĩ khác đi một chút nha.`,
  ] as L1,

  // ---------- Câu tiếng Anh (câu 3, 12) ----------
  // "| E: từ | F:" = đọc từ tiếng Anh bằng giọng tiếng Anh rồi cô nói tiếp giọng mình
  englishReveal: [
    (answer, rest) => `Đáp án là | E: ${answer} | F: Các bạn nhỏ đọc theo cô nha. ${rest}`,
    (answer, rest) => `Tiếng Anh là | E: ${answer}. ${answer}! | F: Giỏi quá. ${rest}`,
    (answer, rest) => `Cô công bố, đáp án là | E: ${answer} | F: Nhớ chưa các bạn nhỏ? ${rest}`,
    (answer, rest) => `Từ này đọc là | E: ${answer} | F: Bạn nhỏ nào nói tiếng Anh giỏi ghê. ${rest}`,
  ] as L2,
  englishNobody: [
    (a) => `Câu này hơi khó ha. Đáp án là | E: ${a} | F: Các bạn nhỏ đọc theo cô nha.`,
    (a) => `Không ai ra hả? Tiếng Anh là | E: ${a}. ${a}! | F: Lần sau nhớ nha các bạn nhỏ.`,
    (a) => `Đáp án là | E: ${a} | F: Về nhà học thêm tiếng Anh với cô nha.`,
  ] as L1,

  // ---------- Câu lịch sử (câu 9, 17) ----------
  historyReveal: [
    (answer, rest) => `Đáp án là ${answer}! Các bạn nhỏ nhớ bài lịch sử giỏi ghê. ${rest}`,
    (answer, rest) => `Là ${answer} nha các bạn nhỏ. Lịch sử nước mình hay lắm đó. ${rest}`,
    (answer, rest) => `${answer}! Bạn nhỏ nào trả lời đúng là học sử chăm lắm nè. ${rest}`,
    (answer, rest) => `Cô công bố, đáp án là ${answer}. Nhớ ghi vào vở nha các bạn nhỏ. ${rest}`,
  ] as L2,

  // ---------- Câu toán nhẩm ----------
  mathIntro: [
    'Tới câu toán rồi! Ai giỏi tính nhẩm đâu?',
    'Đổi món nha, giờ là câu toán. Gõ số vào bình luận.',
    'Câu toán nhẩm nè. Cấm bấm máy tính đó.',
    'Nghỉ chữ một chút, làm bài toán. Gõ số là được.',
    'Câu toán tới đây. Ai mà tính sai là về học lại bảng cửu chương nha.',
  ] as L0,
  mathBonus: [
    'Chưa ai tính ra hả? Cô cho thêm mười giây nữa nè.',
    'Bài toán khó quá ha. Thêm mười giây, nhẩm lẹ lên.',
    'Cả lớp đếm ngón tay chưa đủ hả? Cô cho thêm mười giây.',
    'Thêm mười giây nữa. Cô không cho dùng máy tính đâu nha.',
  ] as L0,
  // answer = cả phép tính, vd "36 cộng 47 bằng 83"
  mathReveal: [
    (answer, rest) => `${answer}. ${rest}`,
    (answer, rest) => `Cô công bố, ${answer}. ${rest}`,
    (answer, rest) => `Đáp án nè: ${answer}. ${rest}`,
    (answer, rest) => `${answer}, tính nhẩm giỏi ghê. ${rest}`,
  ] as L2,
  mathNobody: [
    (a) => `Không ai tính ra luôn hả? ${a} đó cả lớp.`,
    (a) => `${a}. Lớp mình học toán chắc ngủ gật hết rồi.`,
    (a) => `${a}! Cô giáo toán mà nghe là buồn lắm đó.`,
    (a) => `${a} nha. Tối nay cả lớp ôn lại bảng cửu chương cho cô.`,
  ] as L1,
  mathWrong: [
    (n) => `${n} tính sai rồi kìa. Về nhà làm lại ${penalty()} bài toán nha.`,
    (n) => `${n} ơi, bạn nhỏ nhẩm hay đoán vậy?`,
    (n) => `Bạn ${n} cộng trừ kiểu gì mà ra số đó? Cô nể luôn.`,
    (n) => `${n} sai rồi, mai mang bảng cửu chương lên cho cô kiểm tra.`,
  ] as L1,

  // ---------- Trong lúc hỏi ----------
  firstCorrect: [
    (n) => `Ôi nhanh ghê! Bạn ${n} đúng đầu tiên rồi.`,
    (n) => `${n} trả lời đúng! Mười điểm về tay.`,
    (n) => `Giỏi quá ${n} ơi! Cả lớp còn đang dò chữ mà bạn nhỏ đã xong.`,
    (n) => `Bạn ${n} nhanh như chớp. Mấy bạn còn lại tranh hạng nhì đi.`,
    (n) => `Có người đúng rồi nha! Là ${n}. Còn ai nữa không?`,
    (n) => `${n} đúng rồi! Bạn nhỏ học lớp mấy mà giỏi vậy?`,
    (n) => `Chuẩn luôn ${n}! Cô cho bạn nhỏ ngồi bàn đầu.`,
    (n) => `${n} lụm mười điểm. Cả lớp nhanh tay lên kẻo hết điểm.`,
    (n) => `Ai cho phép ${n} giỏi vậy? Đúng rồi đó!`,
    (n) => `Trời ơi ${n}! Chưa kịp uống ngụm nước đã có người đúng.`,
    (n) => `Bạn ${n} ghi điểm đầu tiên. Ai về nhì nào?`,
    (n) => `Đúng rồi ${n}! Cô thấy bạn nhỏ có tố chất làm lớp trưởng.`,
    // khen như khen bé nhỏ tuổi
    (n) => `Bạn nhỏ ${n} giỏi quá, cô thưởng một ngôi sao nha.`,
    (n) => `Ôi bạn nhỏ ${n} ngoan ghê, đúng rồi! Cô thơm một cái nè.`,
    (n) => `${n} thông minh quá đi mất. Về khoe ba mẹ liền nha bạn nhỏ.`,
    (n) => `Ai dạy bạn nhỏ mà giỏi vậy ${n}? Cả lớp vỗ tay cho bạn nào.`,
    (n) => `Đúng rồi ${n} ơi! Cô dán cho bạn nhỏ một bông hoa điểm tốt.`,
    (n) => `${n} nhỏ xíu mà nhanh nhẹn ghê. Cô thương bạn nhỏ quá.`,
    (n) => `Giỏi lắm bạn nhỏ ơi! ${n} đúng là học trò ngoan của cô.`,
    (n) => `Hoan hô ${n}! Bạn nhỏ làm cô bất ngờ đó nha.`,
    (n) => `${n} đúng rồi nè. Bạn nhỏ vừa dễ thương vừa học giỏi.`,
    (n) => `Cô khen ${n} nè, bạn nhỏ chăm học ghê. Cả lớp học tập bạn nha.`,
  ] as L1,

  // đúng trong 4 giây đầu: khen thần đồng kiểu khen bé
  superFast: [
    (n) => `Thần đồng đây rồi! Bạn nhỏ ${n} vừa nghe đề đã ra luôn.`,
    (n) => `Trời ơi ${n} giỏi quá trời! Lớp mình có thần đồng rồi cả lớp ơi.`,
    (n) => `${n} nhanh như tia chớp luôn. Cô thơm bạn nhỏ một cái nè.`,
    (n) => `Ôi bạn nhỏ ${n} thông minh quá đi mất, cô chưa kịp chớp mắt đã đúng rồi.`,
    (n) => `Cả lớp vỗ tay cho thần đồng nhí ${n} nào! Giỏi ghê luôn.`,
    (n) => `${n} ơi, bạn nhỏ ăn gì mà thông minh vậy? Về khoe ba mẹ liền nha.`,
    (n) => `Siêu nhân nhí ${n} xuất hiện! Mới mấy giây đã có đáp án.`,
    (n) => `Cô phục ${n} luôn đó. Nhỏ xíu mà giỏi như thần đồng vậy nè.`,
  ] as L1,

  quietHalfway: [
    'Sao im re vậy cả lớp? Khó lắm hả?',
    'Lớp mình đang suy nghĩ hay đang ngủ vậy?',
    'Chưa ai đúng hết. Cô hơi buồn nha.',
    'Nhìn kỹ mấy chữ trên bảng đi, đáp án nằm ngay đó.',
    'Gõ đại một chữ đi, sai cô cũng không trừ điểm đâu.',
    'Lớp mình học giỏi lắm mà, sao câu này ai cũng im?',
    'Mấy bạn nhỏ bàn cuối đâu rồi, nói chuyện riêng giỏi lắm mà, trả lời đi!',
    'Còn nửa thời gian. Cô ngồi chờ mà nóng ruột quá.',
  ] as L0,

  bonus: [
    'Khó quá hả cả lớp? Cô mở thêm một chữ, cho thêm mười giây nữa nè.',
    'Thôi được rồi, cô thương, cô mở một chữ. Mười giây nữa thôi đó.',
    'Cả lớp bí rồi. Cô cho gợi ý thêm một chữ, nhanh lên!',
    'Hết giờ mà chưa ai đúng. Cô nhá hàng thêm một chữ, mười giây nữa.',
    'Cô mở thêm một chữ nè. Vậy mà còn không ra thì cô đi về.',
    'Bí thật hả? Cô cho thêm một chữ với mười giây. Ráng lên.',
    'Lớp mình làm cô lo quá. Thêm một chữ, thêm mười giây.',
    'Gợi ý thêm một chữ. Câu này mà sai nữa là về chép phạt hết.',
  ] as L0,

  // ---------- Hiện đáp án ----------
  reveal: [
    (answer, rest) => `Đáp án là ${answer}. ${rest}`,
    (answer, rest) => `Chữ đúng là ${answer} nha cả lớp. ${rest}`,
    (answer, rest) => `${answer}! Đúng vậy đó. ${rest}`,
    (answer, rest) => `Cô công bố, đáp án là ${answer}. ${rest}`,
    (answer, rest) => `Câu này là ${answer}. ${rest}`,
    (answer, rest) => `Xếp lại thì thành ${answer}. ${rest}`,
  ] as L2,
  // phần "rest" của câu trên: tên người nhất câu
  revealTop: [
    (n) => `Nhất câu này là ${n}.`,
    (n) => `Người nhanh nhất là ${n}.`,
    (n) => `Mười điểm thuộc về ${n}.`,
    (n) => `${n} về nhất câu này.`,
  ] as L1,
  revealCount: [
    (c) => `Cả lớp có ${c} bạn đúng.`,
    (c) => `Tổng cộng ${c} bạn trả lời đúng.`,
    (c) => `Có ${c} bạn đúng, giỏi quá trời.`,
  ] as L1,

  revealNobody: [
    (a) => `Không ai đoán ra luôn hả? Đáp án là ${a} đó cả lớp.`,
    (a) => `Là ${a}! Dễ vậy mà cả lớp bó tay. Cô giận rồi đó.`,
    (a) => `Đáp án là ${a}. Lớp mình hôm nay ăn sáng chưa vậy?`,
    (a) => `${a} nha các bạn nhỏ. Về nhà học bài lại hết cho cô.`,
    (a) => `Cả lớp không ai ra. Đáp án là ${a}. Cô xin phép thở dài một cái.`,
    (a) => `Là ${a}. Câu này mà sai thì về nhà mẹ đánh đòn nha.`,
    (a) => `Đáp án ${a}. Cô đố câu này cho bạn nhỏ lớp hai cũng ra.`,
    (a) => `${a}! Cả lớp nợ cô một câu. Câu sau trả nha.`,
    (a) => `Là ${a} đó. Lớp mình đang tiết kiệm chữ hay sao mà không ai gõ?`,
    (a) => `Đáp án ${a}. Thôi không sao, câu sau làm lại.`,
  ] as L1,

  roastWrong: [
    (n) => `Bạn ${n} gõ sai rồi kìa. Về nhà chép phạt ${penalty()} lần nha.`,
    (n) => `${n} sai rồi. Phạt chép lại đáp án ${penalty()} lần, mai nộp cho cô.`,
    (n) => `Cô phạt ${n} chép ${penalty()} lần. Chép xong mới được ra chơi.`,
    (n) => `${n} ơi, bạn nhỏ đoán bừa phải không? Cô biết hết đó.`,
    (n) => `${n} trả lời tự tin ghê mà sai. Cô thích sự tự tin đó.`,
    (n) => `Cô thấy ${n} gõ sai nha. Lần sau cẩn thận hơn nha.`,
    (n) => `${n} ơi, chữ đó không có trong từ điển đâu bạn nhỏ ơi.`,
    (n) => `Bạn ${n} sai rồi, nhưng cô thưởng điểm dũng cảm.`,
    (n) => `${n} gõ gì vậy bạn nhỏ? Cô đọc mà muốn lên huyết áp.`,
    (n) => `Câu này ${n} làm cô cười quá. Sai rồi nha.`,
    (n) => `${n} sai mà không sao, ít ra bạn nhỏ còn dám gõ.`,
    (n) => `Ê ${n}, nhìn lại mấy chữ trên bảng coi, đâu có chữ đó.`,
    (n) => `${n} trả lời nhanh mà sai. Nhanh nhảu đoảng đó bạn nhỏ.`,
    (n) => `Cô ghi tên ${n} vào sổ đầu bài nha. Đùa đó, lần sau cố lên.`,
    (n) => `Bạn ${n} ơi, ba mẹ có biết bạn nhỏ trả lời vậy không?`,
    (n) => `${n} chắc đang vừa xem live vừa ăn mì nên gõ nhầm.`,
    (n) => `${n} sai rồi. Ngồi xuống, câu sau làm lại.`,
  ] as L1,

  streak: [
    (n) => `${n} đúng ba câu liền! Cô thưởng thêm năm điểm.`,
    (n) => `${n} đang lên phong độ, ba câu không trượt câu nào. Cộng năm điểm.`,
    (n) => `Chuỗi ba câu đúng của ${n}! Năm điểm thưởng nha.`,
    (n) => `${n} học bài kỹ ghê, ba câu liền. Cô cộng thêm năm điểm.`,
    (n) => `Ai cản ${n} được không? Ba câu liền, cộng năm điểm.`,
  ] as L1,

  goldenWinner: [
    (n) => `${n} ăn trọn câu hỏi vàng, hai mươi điểm!`,
    (n) => `Câu hỏi vàng về tay ${n}! Nhân đôi điểm nha.`,
    (n) => `${n} lật kèo ở câu cuối. Hai mươi điểm luôn.`,
    (n) => `Người giữ câu hỏi vàng là ${n}. Xuất sắc!`,
  ] as L1,

  // ---------- Cô thưởng quà (quà đặt lên bàn bạn nhỏ). g = tên quà, vd "một cây kẹo mút" ----------
  firstCorrectGift: [
    (n, g) => `${n} đúng rồi! Cô thưởng bạn nhỏ ${g} nha.`,
    (n, g) => `Giỏi quá ${n}! Cô đặt ${g} lên bàn bạn nhỏ nè.`,
    (n, g) => `${n} nhanh nhất! Phần thưởng là ${g}.`,
    (n, g) => `Cô thưởng ${n} ${g}, ai muốn có thì trả lời nhanh lên.`,
    (n, g) => `${n} đúng đầu tiên, cô tặng ${g}. Bạn nhỏ giỏi quá.`,
    (n, g) => `Ôi ${n} ngoan ghê, cô thưởng ${g} nè.`,
  ] as L2,
  streakGift: [
    (n, g) => `Ba câu liền rồi ${n}! Thêm năm điểm, cô thưởng thêm ${g}.`,
    (n, g) => `${n} ba câu liền! Năm điểm với ${g}, cô thưởng nóng.`,
    (n, g) => `Chuỗi ba câu của ${n}! Năm điểm, kèm ${g} đặt lên bàn luôn.`,
  ] as L2,
  goldenGift: [
    (n, g) => `Câu hỏi vàng là của ${n}! Cô thưởng gấp đôi điểm, thêm ${g} nữa.`,
    (n, g) => `${n} giành câu hỏi vàng! Hai mươi điểm và ${g}.`,
  ] as L2,

  // ---------- Dừng giữa tiết: cô điểm danh bạn nhỏ giỏi, tặng quà, rồi mới ra câu tiếp ----------
  praiseIntro: [
    'Dừng lại một chút nha. Cô điểm danh các bạn nhỏ giỏi nhất từ đầu tiết nè.',
    'Nghỉ tay một xíu, cô xem bảng điểm các bạn nhỏ nha.',
    'Khoan ra câu tiếp, cô phát quà cho các bạn nhỏ giỏi đã.',
    'Tạm dừng nè các bạn nhỏ. Ai đang dẫn đầu lớp mình?',
  ] as L0,
  // n tên, s điểm, g quà
  praiseFirst: [
    (n, s, g) => `Đứng nhất là bạn nhỏ ${n}, ${s} điểm. Cô tặng ${g}.`,
    (n, s, g) => `Dẫn đầu đang là ${n} với ${s} điểm. Quà của bạn nhỏ là ${g}.`,
    (n, s, g) => `Nhất lớp lúc này là ${n}, ${s} điểm. Cô đặt ${g} lên bàn nè.`,
  ] as L3,
  praiseSecond: [
    (n, s, g) => `Hạng nhì là ${n}, ${s} điểm, được ${g}.`,
    (n, s, g) => `Theo sát là ${n} với ${s} điểm, cô tặng ${g}.`,
  ] as L3,
  praiseThird: [
    (n, s, g) => `Hạng ba là ${n}, ${s} điểm, nhận ${g}.`,
    (n, s, g) => `Thứ ba là ${n}, ${s} điểm. ${g} cho bạn nhỏ nha.`,
  ] as L3,
  // mời tương tác, sau câu này cô chờ vài giây rồi mới ra câu tiếp
  praiseOutro: [
    'Các bạn nhỏ còn lại cố lên nha. Ai muốn được quà thì chào cô một tiếng đi nào.',
    'Bạn nhỏ nào chưa có quà thì thả tim cho cô xem nào, câu sau cố lên.',
    'Cả lớp vỗ tay cho các bạn giỏi nào. Ai muốn kẹo thì gõ "con muốn kẹo" đi.',
    'Còn nhiều quà lắm, các bạn nhỏ trả lời nhanh là có phần. Chuẩn bị câu tiếp nha.',
  ] as L0,

  // ---------- Hết tiết ----------
  results: [
    (n, s) => `Hết tiết! Nhất lớp tiết này là ${n}, được ${s} điểm. Cả lớp vỗ tay nào!`,
    (n, s) => `Tổng kết tiết học: ${n} đứng đầu với ${s} điểm. Giỏi quá!`,
    (n, s) => `Trống tan tiết rồi. Hạng nhất thuộc về ${n}, ${s} điểm.`,
    (n, s) => `${n} nhất tiết này, ${s} điểm. Cô treo ảnh bạn nhỏ lên bảng vàng.`,
    (n, s) => `Chúc mừng ${n}, ${s} điểm, giấy khen tiết này là của bạn nhỏ.`,
    (n, s) => `Ai cũng cố gắng, nhưng ${n} cố gắng nhất. ${s} điểm, nhất lớp!`,
    (n, s) => `Hết giờ! ${n} được ${s} điểm, về nhà khoe ba mẹ đi.`,
    (n, s) => `Nhất tiết này là ${n} với ${s} điểm. Mấy bạn khác tiết sau lấy lại nha.`,
  ] as L2,
  resultsNobody: [
    'Tiết này chưa ai ghi điểm. Tiết sau cả lớp cố lên nha.',
    'Không ai có điểm luôn. Cô đi xin thêm phấn rồi dạy lại từ đầu.',
    'Hết tiết mà bảng điểm trống trơn. Lớp mình ngủ đông rồi hả?',
    'Tiết này buồn quá, chưa ai đúng câu nào. Ra chơi xong làm lại nha.',
    'Không sao, tiết sau lớp mình phục thù.',
  ] as L0,

  newMonitor: [
    (n) => `Lớp mình có lớp trưởng mới rồi, là ${n}!`,
    (n) => `${n} vượt lên dẫn đầu tiết này, lên làm lớp trưởng luôn.`,
    (n) => `Đổi lớp trưởng! ${n} giờ đứng nhất tiết này.`,
    (n) => `Chức lớp trưởng về tay ${n}. Lớp trưởng cũ ráng giành lại đi.`,
    (n) => `${n} lên lớp trưởng. Từ giờ bạn nhỏ hô cả lớp đứng dậy nha.`,
    (n) => `Bảng xếp hạng đổi rồi, ${n} làm lớp trưởng.`,
  ] as L1,

  // cuối giờ ra chơi: lớp trưởng tiết vừa rồi (mỗi tiết tranh lại từ đầu)
  championBoard: [
    (n) => `Lớp trưởng tiết vừa rồi là ${n}. Tiết sau ai giành ghế lớp trưởng đây?`,
    (n) => `${n} vừa làm lớp trưởng. Tiết mới điểm làm lại từ đầu, ai cũng có cơ hội nha.`,
    (n) => `Chúc mừng lớp trưởng ${n}! Các bạn nhỏ khác tiết sau giành lại đi nào.`,
  ] as L1,
  // n tên, k số lần làm lớp trưởng
  championAgain: [
    (n, k) => `${n} làm lớp trưởng ${k} lần rồi đó! Có bạn nhỏ nào hạ được ${n} không?`,
    (n, k) => `Lại là ${n}, lớp trưởng ${k} lần! Tiết sau cả lớp cùng thử thách bạn nhỏ nha.`,
    (n, k) => `${k} lần lớp trưởng, ${n} giỏi quá trời. Ai muốn soán ngôi thì vào tiết sau.`,
  ] as L2,
  weekBoard: [
    (n) => `Bảng vàng tuần này, hạng nhất là ${n}.`,
    (n) => `Đứng đầu cả tuần là ${n}. Mai vào lớp tiếp để giữ hạng nha.`,
    (n) => `Tuần này ${n} đang nhất. Ai muốn vượt thì chăm vào lớp.`,
  ] as L1,

  // ---------- Quà, follow, chào ----------
  thankGift: [
    (n, g) => `Cô cảm ơn ${n} tặng ${g} nha.`,
    (n, g) => `Ôi ${g} của ${n}, cô thương bạn nhỏ nhất lớp.`,
    (n, g) => `${n} tặng cô ${g}. Học trò ngoan như vầy cô cưng lắm.`,
    (n, g) => `Cảm ơn ${n}! ${g} đẹp quá, cô cắm lên bàn liền.`,
    (n, g) => `${n} ơi, ${g} này cô giữ làm kỷ niệm.`,
    (n, g) => `Cô nhận ${g} của ${n} rồi nha. Cảm ơn bạn nhỏ.`,
    (n, g) => `${n} tặng ${g} cho cô. Cả lớp học theo bạn đi.`,
    (n, g) => `Hoa của ${n} đây. Cô cảm ơn, hôm nay cô vui lắm.`,
    (n, g) => `Ai như ${n}, vừa học giỏi vừa biết thương cô. Cảm ơn bạn nhỏ.`,
    (n, g) => `${n} tặng ${g}. Cô không cộng điểm đâu nha, nhưng cô nhớ mặt bạn nhỏ rồi.`,
    (n, g) => `Cảm ơn ${n}, ${g} làm lớp mình sáng hẳn lên.`,
    (n, g) => `${n} ơi cảm ơn bạn nhỏ. Mai cô cho lau bảng.`,
  ] as L2,
  bigGift: [
    (n) => `Trời ơi ${n} tặng quà to quá! Cả lớp vỗ tay cho bạn đi.`,
    (n) => `${n} chơi lớn quá. Cô cảm động muốn khóc luôn.`,
    (n) => `Quà to của ${n}! Cô cho bạn nhỏ làm lớp phó văn nghệ danh dự.`,
    (n) => `${n} ơi, quà này cô không dám nhận đâu... thôi nhận luôn. Cảm ơn bạn nhỏ!`,
    (n) => `Cả lớp nhìn ${n} mà học tập nha. Cảm ơn bạn nhỏ nhiều lắm.`,
    (n) => `${n} tặng quà xịn. Cô đặt bạn nhỏ lên bàn đầu trong tim cô.`,
  ] as L1,
  giftHint: [
    (n) => `${n} xin cô mở thêm một chữ, cả lớp nhờ bạn đó nha.`,
    (n) => `Nhờ quà của ${n}, cô mở thêm một chữ cho cả lớp.`,
    (n) => `${n} giải cứu cả lớp, mở thêm một chữ nè.`,
    (n) => `${n} tặng quà, cô thưởng cả lớp một chữ gợi ý.`,
    (n) => `Cảm ơn ${n}! Thêm một chữ trên bảng rồi, ai đoán ra nào?`,
    (n) => `${n} bao cả lớp một chữ. Cảm ơn bạn đi các bạn nhỏ.`,
  ] as L1,
  thankFollow: [
    (n) => `Cô cảm ơn ${n} đã theo dõi kênh nha.`,
    (n) => `${n} vừa theo dõi lớp mình. Chào học sinh mới!`,
    (n) => `Cảm ơn ${n} đã bấm theo dõi, mai nhớ vào lớp đúng giờ.`,
    (n) => `${n} vào sổ điểm danh của lớp rồi. Cảm ơn bạn nhỏ.`,
    (n) => `Học sinh mới ${n} đã theo dõi. Cả lớp chào bạn đi.`,
    (n) => `${n} theo dõi kênh rồi, cô nhớ mặt bạn nhỏ rồi đó.`,
  ] as L1,
  greeting: [
    (names) => `Chào ${names} vào lớp. Gõ đáp án vào bình luận là chơi được liền.`,
    (names) => `${names} vào lớp trễ nha, cô bỏ qua lần này. Ngồi xuống chơi luôn đi.`,
    (names) => `Lớp mình có thêm ${names}. Chào mừng các bạn nhỏ.`,
    (names) => `${names} vừa vào. Kiếm chỗ ngồi đi, câu tiếp theo cô hỏi liền.`,
    (names) => `Ồ ${names} tới rồi. Cả lớp đông vui quá.`,
    (names) => `Chào ${names}. Muốn ngồi bàn đầu thì trả lời đúng nhiều vào.`,
    (names) => `${names} điểm danh có mặt. Vào học thôi.`,
    (names) => `Hoan nghênh ${names}! Ai chưa biết luật thì cứ nhìn bảng mà đoán chữ.`,
  ] as L1,
  share: [
    'Thấy vui thì bấm chia sẻ live rủ bạn bè vào thi với lớp mình nha.',
    'Lớp đông mới vui, các bạn nhỏ chia sẻ live cho bạn bè vào học chung đi.',
    'Ai rủ được bạn vào lớp, cô ghi nhận công lao. Bấm chia sẻ nha.',
    'Chia sẻ live cho người bạn hay khoe học giỏi vào đây thử sức coi.',
    'Bấm theo dõi kênh để mai còn vào lớp đúng giờ nha các bạn nhỏ.',
    'Thả tim cho đầy bảng đi cả lớp, đủ tim là cả lớp vỗ tay.',
    'Rủ thêm bạn vào đi, lớp còn nhiều ghế trống lắm.',
    'Ai đứng ngoài cửa lớp thì trả lời đúng nhiều để được vào ghế ngồi nha.',
  ] as L0,
  idle: [
    'Lớp im re vậy, ngủ hết rồi hả?',
    'Có ai còn ở đây không? Cô thấy lớp vắng tanh.',
    'Cả lớp đi ăn vặt hết rồi hay sao vậy?',
    'Im lặng quá, cô nghe được tiếng muỗi bay luôn.',
    'Gõ gì đó đi các bạn nhỏ, cô đứng một mình buồn lắm.',
    'Ai còn thức thì gõ "có mặt" cho cô biết với.',
    'Lớp mình đang nghĩ đáp án hay đang lướt TikTok khác vậy?',
    'Cô đếm tới ba, không ai gõ là cô cho bài tập về nhà. Một... hai...',
    'Ủa, mạng rớt hay cả lớp rớt vậy?',
    'Các bạn nhỏ im quá, cô tưởng mình đang dạy lớp ma.',
  ] as L0,
  clap: [
    'Đủ tim rồi, cả lớp vỗ tay nào!',
    'Tim đầy bảng rồi! Vỗ tay cho lớp mình!',
    'Cảm ơn cả lớp thả tim, cô vui quá. Vỗ tay!',
    'Tim nhiều quá, cô cho cả lớp vỗ tay ăn mừng.',
  ] as L0,

  // ---------- Giờ ra chơi ----------
  recessIntro: [
    'Ra chơi! Mười phút... à không, một phút thôi. Chơi với cô một trò nha.',
    'Tùng tùng tùng, giờ ra chơi! Cô có trò này hay lắm.',
    'Giải lao chút nha cả lớp. Cô chơi với các bạn nhỏ một trò.',
    'Ra chơi rồi! Cất sách vở, chơi với cô.',
    'Học mệt rồi, ra chơi một chút. Trò này dễ lắm, ai cũng chơi được.',
  ] as L0,

  rpsIntro: [
    'Oẳn tù tì với cô! Gõ búa, kéo hoặc bao. Thắng cô được cộng hai điểm.',
    'Chơi oẳn tù tì nha. Gõ búa, kéo hay bao vào bình luận. Cô ra sau cùng.',
    'Trò oẳn tù tì! Mỗi người gõ một lần thôi: búa, kéo hoặc bao.',
    'Ai dám đấu oẳn tù tì với cô? Gõ búa, kéo hoặc bao. Thắng được hai điểm.',
  ] as L0,
  rpsReveal: [
    (pick, rest) => `Cô ra ${pick}! ${rest}`,
    (pick, rest) => `Một, hai, ba, cô ra ${pick}. ${rest}`,
    (pick, rest) => `Oẳn tù tì ra cái gì ra cái này: ${pick}! ${rest}`,
    (pick, rest) => `Cô chọn ${pick} nha. ${rest}`,
  ] as L2,
  rpsWin: [
    (c) => `Có ${c} bạn thắng cô, mỗi bạn hai điểm.`,
    (c) => `${c} bạn thắng rồi, cô thua tâm phục khẩu phục.`,
    (c) => `Cô thua ${c} bạn. Hai điểm cho mỗi người.`,
  ] as L1,
  rpsLose: [
    (c) => `${c} bạn thua cô. Về tập oẳn tù tì thêm đi.`,
    (c) => `Cô hạ được ${c} bạn. Cô vẫn còn phong độ lắm.`,
    (c) => `${c} bạn thua cô kìa. Lêu lêu.`,
  ] as L1,
  rpsNobody: [
    'Không ai chơi với cô hết. Cô tự oẳn tù tì với cái bảng vậy.',
    'Lớp mình sợ thua cô nên không ai chơi hả?',
    'Không ai ra cái gì. Cô thắng mặc định nha.',
  ] as L0,

  callUp: [
    (n) => `Kiểm tra miệng! Cô mời ${n} lên bảng. Bạn nhỏ có mười lăm giây.`,
    (n) => `${n} đâu rồi? Lên bảng trả bài cho cô. Mười lăm giây nha.`,
    (n) => `Hôm nay cô gọi ${n}. Chỉ mình bạn nhỏ được trả lời câu này.`,
    (n) => `${n} ơi, tới lượt bạn nhỏ kiểm tra miệng. Cả lớp im lặng nghe bạn trả lời.`,
    (n) => `Cô dò tên trong sổ... ${n}! Lên bảng.`,
    (n) => `${n} ngồi im quá, cô gọi bạn nhỏ lên. Mười lăm giây, đúng được năm điểm.`,
    (n) => `Mời ${n} lên bảng! Các bạn khác không được nhắc bài nha.`,
    (n) => `Kiểm tra miệng nha, cô chọn ${n}. Run chưa bạn nhỏ?`,
  ] as L1,
  callUpRight: [
    (n) => `${n} trả lời đúng! Năm điểm, về chỗ.`,
    (n) => `Giỏi quá ${n}! Cô cho bạn nhỏ năm điểm miệng.`,
    (n) => `${n} học bài kỹ ghê. Đúng rồi, năm điểm nha.`,
    (n) => `Chuẩn rồi ${n}! Cả lớp vỗ tay cho bạn.`,
    (n) => `${n} qua bài kiểm tra miệng. Cô yên tâm rồi.`,
    (n) => `Đúng luôn ${n}. Cô định làm khó mà bạn nhỏ không sợ.`,
  ] as L1,
  callUpWrong: [
    (n) => `${n} sai rồi bạn nhỏ ơi. Về chỗ, mai trả bài lại.`,
    (n) => `Ôi ${n}, cô gọi đúng lúc bạn nhỏ chưa học bài.`,
    (n) => `${n} trả lời sai. Cô không ghi sổ đâu, lần sau cố lên.`,
    (n) => `Sai rồi ${n}. Bạn nhỏ có xem bảng không vậy?`,
    (n) => `${n} ơi, đáp án đâu phải vậy. Về chỗ ngồi suy nghĩ nha.`,
    (n) => `Câu dễ vậy mà ${n} sai. Cô mời phụ huynh nha... đùa thôi.`,
    (n) => `${n} gõ tự tin ghê mà sai. Cô cho bạn nhỏ điểm tự tin.`,
    (n) => `Chưa đúng ${n}. Cả lớp đừng cười bạn nha, ai cũng có lúc vậy.`,
  ] as L1,
  callUpSilent: [
    (n) => `${n} im lặng luôn. Chắc bạn nhỏ ngủ gật rồi.`,
    (n) => `Hết giờ mà ${n} không nói gì. Cô ghi tên vô sổ đầu bài nha.`,
    (n) => `${n} đâu rồi? Cô gọi mà không thấy trả lời.`,
    (n) => `${n} đứng hình luôn. Về chỗ đi bạn nhỏ.`,
    (n) => `${n} chắc đang đi lấy nước. Thôi để lần sau.`,
    (n) => `Mười lăm giây trôi qua, ${n} vẫn im. Cô hiểu rồi, chưa học bài.`,
    (n) => `${n} trốn kiểm tra miệng hả? Cô nhớ tên bạn nhỏ rồi nha.`,
    (n) => `${n} không trả lời. Cả lớp nhắc bạn học bài đi.`,
  ] as L1,

  pickIntro: [
    (a, b) => `Chọn phe nha! ${a} hay ${b}? Gõ số một nếu chọn ${a}, số hai nếu chọn ${b}.`,
    (a, b) => `Cả lớp chia phe: một là ${a}, hai là ${b}. Gõ số đi.`,
    (a, b) => `Câu hỏi khó nhất hôm nay: ${a} hay ${b}? Gõ một hoặc hai.`,
    (a, b) => `Bỏ phiếu nha. Số một là ${a}, số hai là ${b}.`,
  ] as L2,
  pickResult: [
    (win, pct) => `Phe ${win} thắng với ${pct} phần trăm.`,
    (win, pct) => `${pct} phần trăm cả lớp chọn ${win}. Phe kia ra góc lớp đứng.`,
    (win, pct) => `Kết quả: ${win} thắng, ${pct} phần trăm.`,
    (win, pct) => `Lớp mình chọn ${win}, ${pct} phần trăm luôn.`,
  ] as L2,
  pickRoast: [
    (lose) => `Phe ${lose} ít người quá, ăn nói cẩn thận nha.`,
    (lose) => `Ai chọn ${lose} thì giơ tay lên cho cô coi mặt.`,
    (lose) => `Phe ${lose} thua rồi, về nhà suy nghĩ lại cuộc đời đi.`,
    (lose) => `Cô không bênh ai, nhưng chọn ${lose} là hơi lạ đó.`,
    (lose) => `${lose} cũng ngon mà, sao ít người chọn vậy ta?`,
    (lose) => `Phe ${lose} ơi, đừng buồn, cô cũng từng chọn sai.`,
  ] as L1,
  pickTie: [
    'Hòa luôn! Lớp mình chia đôi rõ ràng quá.',
    'Hai phe bằng nhau. Thôi khỏi cãi, chọn cả hai.',
  ] as L0,
  pickNobody: [
    'Không ai chọn phe nào. Lớp mình trung lập ghê.',
    'Chưa ai bỏ phiếu hết. Thôi cô chọn giùm luôn.',
  ] as L0,

  rollIntro: [
    'Điểm danh siêu tốc! Gõ "có mặt" thật nhanh. Mười bạn đầu tiên được ba điểm.',
    'Ai có mặt thì gõ "có mặt"! Mười bạn nhanh nhất có điểm.',
    'Cô điểm danh nè, gõ "có mặt" đi. Nhanh tay thì có ba điểm.',
    'Điểm danh! Gõ "có mặt". Mười bạn đầu tiên cô cộng ba điểm.',
  ] as L0,
  rollResult: [
    (names) => `Nhanh nhất là ${names}. Mỗi bạn ba điểm.`,
    (names) => `Có mặt sớm nhất: ${names}. Ba điểm nha.`,
    (names) => `${names} điểm danh nhanh nhất. Cộng ba điểm.`,
    (names) => `Cô ghi nhận ${names} có mặt đầu tiên.`,
  ] as L1,
  rollNobody: [
    'Không ai có mặt hả? Vậy cô dạy cho ai nghe?',
    'Điểm danh mà không ai trả lời. Cả lớp trốn học hết rồi.',
  ] as L0,

  heartIntro: [
    (t) => `Thử thách thả tim! Ba mươi giây, cả lớp thả đủ ${t} tim thì ai cũng được một điểm.`,
    (t) => `Cả lớp thả tim đi! Đủ ${t} tim trong ba mươi giây là có quà.`,
    (t) => `Tim nào tim nào! Cần ${t} tim trong ba mươi giây.`,
    (t) => `Thả tim lẹ lên các bạn nhỏ, đủ ${t} tim cô cộng điểm cả lớp.`,
  ] as L1,
  heartWin: [
    'Đủ tim rồi! Cả lớp mỗi người một điểm.',
    'Lớp mình đoàn kết quá. Một điểm cho tất cả!',
    'Thành công! Cô cộng mỗi bạn một điểm.',
    'Tim đầy rồi, cả lớp được điểm. Cô vui quá.',
  ] as L0,
  heartFail: [
    (c) => `Mới được ${c} tim thôi, chưa đủ. Lần sau thả mạnh tay hơn nha.`,
    (c) => `${c} tim, thiếu chút xíu. Tiếc quá cả lớp ơi.`,
    (c) => `Chỉ có ${c} tim. Ngón tay lớp mình yếu quá.`,
    (c) => `${c} tim thôi hả? Cô buồn nhẹ.`,
  ] as L1,
};

// Câu hỏi "chọn phe" cho giờ ra chơi
// Bình chọn vui lúc chờ trả lời: gõ 1 chữ cái (đáp án câu chữ luôn từ 2 chữ nên không lẫn). key viết thường, không dấu.
export interface Poll {
  ask: string;
  opts: { key: string; label: string }[];
}
export const POLLS: Poll[] = [
  {
    ask: 'Các bạn nhỏ ở đâu nè? Miền Bắc gõ chữ B, miền Trung gõ chữ T, miền Nam gõ chữ N nha!',
    opts: [{ key: 'b', label: 'miền Bắc' }, { key: 't', label: 'miền Trung' }, { key: 'n', label: 'miền Nam' }],
  },
  {
    ask: 'Bạn nhỏ đang làm gì đó? Đang ăn cơm gõ chữ C, đang học bài gõ chữ H, đang chơi gõ chữ X nha!',
    opts: [{ key: 'c', label: 'phe đang ăn cơm' }, { key: 'h', label: 'phe đang học bài' }, { key: 'x', label: 'phe đang chơi' }],
  },
  {
    ask: 'Thích chó thì gõ chữ C, thích mèo thì gõ chữ M nha các bạn nhỏ!',
    opts: [{ key: 'c', label: 'phe thích chó' }, { key: 'm', label: 'phe thích mèo' }],
  },
  {
    ask: 'Thích đi biển gõ chữ B, thích đi núi gõ chữ N nào!',
    opts: [{ key: 'b', label: 'phe đi biển' }, { key: 'n', label: 'phe đi núi' }],
  },
  {
    ask: 'Thích môn toán gõ chữ T, tiếng Việt gõ chữ V, tiếng Anh gõ chữ A nha!',
    opts: [{ key: 't', label: 'phe môn toán' }, { key: 'v', label: 'phe tiếng Việt' }, { key: 'a', label: 'phe tiếng Anh' }],
  },
  {
    ask: 'Ăn phở gõ chữ P, ăn bún gõ chữ B, ăn cơm tấm gõ chữ C. Bạn nhỏ thích món nào?',
    opts: [{ key: 'p', label: 'phe phở' }, { key: 'b', label: 'phe bún' }, { key: 'c', label: 'phe cơm tấm' }],
  },
  {
    ask: 'Thích ăn kẹo gõ chữ K, thích ăn kem gõ chữ E nha các bạn nhỏ!',
    opts: [{ key: 'k', label: 'phe ăn kẹo' }, { key: 'e', label: 'phe ăn kem' }],
  },
  {
    ask: 'Thích mùa hè gõ chữ H, thích mùa đông gõ chữ D nào!',
    opts: [{ key: 'h', label: 'phe mùa hè' }, { key: 'd', label: 'phe mùa đông' }],
  },
  {
    ask: 'Bạn nhỏ học lớp mấy rồi? Mẫu giáo gõ chữ M, tiểu học gõ chữ T, cấp hai gõ chữ H nha!',
    opts: [{ key: 'm', label: 'các bạn mẫu giáo' }, { key: 't', label: 'các bạn tiểu học' }, { key: 'h', label: 'các bạn cấp hai' }],
  },
  {
    ask: 'Thích màu hồng gõ chữ H, thích màu xanh gõ chữ X nào các bạn nhỏ!',
    opts: [{ key: 'h', label: 'phe màu hồng' }, { key: 'x', label: 'phe màu xanh' }],
  },
];

export const PICK_TOPICS: [string, string][] = [
  ['phở', 'bún bò'],
  ['trà sữa', 'cà phê'],
  ['chó', 'mèo'],
  ['đi biển', 'đi núi'],
  ['Tết ở quê', 'Tết ở phố'],
  ['mì tôm trứng', 'mì tôm xúc xích'],
  ['ngủ nướng', 'dậy sớm'],
  ['ăn cay', 'không ăn cay'],
  ['mùa hè', 'mùa đông'],
  ['xem phim', 'chơi game'],
  ['bánh mì', 'xôi'],
  ['nhắn tin', 'gọi điện'],
  ['Liên Quân', 'Free Fire'],
  ['cơm nhà', 'cơm quán'],
  ['tóc dài', 'tóc ngắn'],
  ['đi xe máy', 'đi ô tô'],
  ['học sáng', 'học tối'],
  ['bàn đầu', 'bàn cuối'],
  ['kem', 'chè'],
  ['nhạc ballad', 'nhạc remix'],
  ['gà rán', 'pizza'],
  ['ở nhà', 'đi chơi'],
  ['toán', 'văn'],
  ['bánh chưng', 'bánh tét'],
  ['người yêu', 'tiền'],
  ['sầu riêng', 'mít'],
  ['trà đá', 'trà chanh'],
  ['Hà Nội', 'Sài Gòn'],
  ['iPhone', 'Android'],
  ['xem TikTok', 'xem YouTube'],
];
