// Bộ "Thẻ Thơ Thiền": thơ ngắn để chiêm nghiệm & lời nhắn động viên.
// KHÔNG phải quẻ bói: không xếp hạng cát/hung, không hứa hẹn tài lộc, sức khoẻ hay vận may
// (tránh nội dung mê tín dị đoan theo pháp luật Việt Nam và chính sách "gift baiting" của TikTok).
// Giữ nguyên cấu trúc dữ liệu cũ (number / rank / title / poem / meaning / ttsSummary) để màn hình live dùng tiếp;
// "rank" nay là chủ đề của thẻ.
const FORTUNE_DECK = [
  {
    number: 1,
    rank: 'An Lạc',
    title: 'Mặt Trời Buổi Sớm',
    poem: 'Nắng sớm lên rồi, hít thở sâu\nMột ngày mới đến chẳng vội đâu\nLàm việc trước mắt bằng tâm sáng\nBình yên ở lại rất lâu sau.',
    meaning: 'Hãy bắt đầu ngày mới bằng vài hơi thở chậm. Làm tốt một việc nhỏ trước mắt là đủ.',
    ttsSummary: 'Thẻ thơ số 1, chủ đề An Lạc: Mặt Trời Buổi Sớm. Lời nhắn: hãy bắt đầu ngày mới bằng vài hơi thở chậm, làm tốt một việc nhỏ trước mắt là đủ.'
  },
  {
    number: 2,
    rank: 'Từ Bi',
    title: 'Hoa Sen Trong Hồ',
    poem: 'Sen mọc từ bùn vẫn ngát hương\nLòng người hiền hậu tựa yêu thương\nMột lời tử tế trao ai đó\nẤm cả hai bên suốt dặm đường.',
    meaning: 'Hôm nay thử nói một lời tử tế với người bên cạnh. Lòng tốt lan toả nhiều hơn ta nghĩ.',
    ttsSummary: 'Thẻ thơ số 2, chủ đề Từ Bi: Hoa Sen Trong Hồ. Lời nhắn: hôm nay thử nói một lời tử tế với người bên cạnh.'
  },
  {
    number: 3,
    rank: 'Tinh Tấn',
    title: 'Giọt Nước Bền Bỉ',
    poem: 'Giọt nước rơi đều đá cũng mòn\nĐường xa từng bước vẫn vuông tròn\nĐừng so mình với ai hôm trước\nHơn chính hôm qua đã đủ ngon.',
    meaning: 'Tiến bộ đến từ những việc nhỏ làm đều đặn mỗi ngày. Hãy so với chính mình hôm qua.',
    ttsSummary: 'Thẻ thơ số 3, chủ đề Tinh Tấn: Giọt Nước Bền Bỉ. Lời nhắn: tiến bộ đến từ những việc nhỏ làm đều đặn mỗi ngày.'
  },
  {
    number: 4,
    rank: 'Kiên Nhẫn',
    title: 'Mưa Tạnh Trời Trong',
    poem: 'Mưa qua rồi lại nắng trong ngần\nViệc khó hôm nay cũng có lần\nGiữ tâm bình thản như mặt nước\nTừng chút rồi qua, chớ ngại ngần.',
    meaning: 'Điều khó khăn nào cũng có lúc qua. Giữ bình tĩnh và làm từng bước nhỏ.',
    ttsSummary: 'Thẻ thơ số 4, chủ đề Kiên Nhẫn: Mưa Tạnh Trời Trong. Lời nhắn: điều khó khăn nào cũng có lúc qua, hãy giữ bình tĩnh.'
  },
  {
    number: 5,
    rank: 'Biết Ơn',
    title: 'Bát Cơm Nóng',
    poem: 'Bát cơm thơm nóng giữa nhà\nCó công cha mẹ, có ta, có người\nBiết ơn những điều quanh đời\nLòng thêm ấm áp, miệng cười nhẹ tênh.',
    meaning: 'Dành một phút nghĩ về ba điều bạn biết ơn hôm nay, và gọi cho người thân nếu có thể.',
    ttsSummary: 'Thẻ thơ số 5, chủ đề Biết Ơn: Bát Cơm Nóng. Lời nhắn: hãy nghĩ về ba điều bạn biết ơn hôm nay.'
  },
  {
    number: 6,
    rank: 'Buông Bỏ',
    title: 'Chiếc Lá Theo Dòng',
    poem: 'Lá rơi theo nước nhẹ nhàng trôi\nGiận hờn ôm mãi nặng lòng thôi\nBuông tay một chút cho thanh thản\nTrời rộng mây bay đẹp tuyệt vời.',
    meaning: 'Có những điều không cần mang theo nữa. Thử viết ra một nỗi bực dọc rồi để nó trôi đi.',
    ttsSummary: 'Thẻ thơ số 6, chủ đề Buông Bỏ: Chiếc Lá Theo Dòng. Lời nhắn: có những điều không cần mang theo nữa.'
  },
  {
    number: 7,
    rank: 'Chánh Niệm',
    title: 'Tiếng Chuông Chiều',
    poem: 'Chuông chiều ngân nhẹ giữa không gian\nDừng chân một chút, thở nhẹ nhàng\nNghe tiếng gió, nghe lòng mình nói\nPhút giây hiện tại thật bình an.',
    meaning: 'Mỗi khi nghe một âm thanh quen, hãy dừng lại thở ba hơi và chú ý vào hiện tại.',
    ttsSummary: 'Thẻ thơ số 7, chủ đề Chánh Niệm: Tiếng Chuông Chiều. Lời nhắn: hãy dừng lại thở ba hơi và chú ý vào hiện tại.'
  },
  {
    number: 8,
    rank: 'Hiếu Hạnh',
    title: 'Mái Nhà Xưa',
    poem: 'Mái nhà xưa có mẹ cha\nTóc thêm sợi bạc, lưng đà cong cong\nMột cuộc gọi, một tấm lòng\nLà món quà quý ấm trong tuổi già.',
    meaning: 'Hôm nay hãy dành thời gian hỏi thăm cha mẹ, ông bà hoặc người đã chăm sóc bạn.',
    ttsSummary: 'Thẻ thơ số 8, chủ đề Hiếu Hạnh: Mái Nhà Xưa. Lời nhắn: hãy dành thời gian hỏi thăm cha mẹ, ông bà.'
  },
  {
    number: 9,
    rank: 'Hỷ Xả',
    title: 'Trăng Rằm',
    poem: 'Trăng tròn soi sáng khắp muôn nơi\nChẳng chọn riêng ai để sáng ngời\nVui cùng niềm vui của người khác\nLòng mình rộng mở tựa trùng khơi.',
    meaning: 'Thử chân thành chúc mừng thành công của một người khác. Niềm vui chia sẻ sẽ lớn hơn.',
    ttsSummary: 'Thẻ thơ số 9, chủ đề Hỷ Xả: Trăng Rằm. Lời nhắn: thử chân thành chúc mừng thành công của một người khác.'
  },
  {
    number: 10,
    rank: 'Trí Tuệ',
    title: 'Ngọn Đèn Nhỏ',
    poem: 'Một ngọn đèn nhỏ giữa đêm thâu\nSoi đường từng bước chẳng cần mau\nHọc thêm điều mới mỗi ngày nhé\nTrí sáng lòng an chẳng ưu sầu.',
    meaning: 'Dành mười phút đọc hoặc học một điều mới hôm nay. Hiểu biết là ngọn đèn đi theo ta lâu nhất.',
    ttsSummary: 'Thẻ thơ số 10, chủ đề Trí Tuệ: Ngọn Đèn Nhỏ. Lời nhắn: dành mười phút đọc hoặc học một điều mới hôm nay.'
  }
];

module.exports = { FORTUNE_DECK };
