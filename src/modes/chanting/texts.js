/**
 * Văn bản cho Phòng Tụng Kinh Chung.
 *
 * NGUỒN & BẢN QUYỀN (ghi lại để kiểm tra / cố vấn duyệt):
 *  - 'han-viet-co': phiên âm Hán-Việt truyền thống của kinh, kệ cổ (văn bản phổ biến hàng trăm năm, không thuộc
 *    bản dịch hiện đại có bản quyền).
 *  - 'tu-soan': bản dịch nghĩa / diễn ý do dự án tự soạn từ ý nghĩa bản Pāli, KHÔNG chép bản dịch của
 *    HT. Thích Minh Châu, HT. Thích Trí Tịnh, HT. Thích Thanh Từ hay Làng Mai (các bản này có bản quyền).
 *  - Tất cả cần một vị tu sĩ hoặc cư sĩ am hiểu Phật học duyệt lại trước khi phát chính thức.
 *
 * Khi đồng tụng có mõ: mỗi chữ (âm tiết) một tiếng mõ. Xuống dòng = ngắt câu trên màn hình.
 * style: 'sutra' (mặc định, kinh tiếng Việt) | 'fast' (Tâm Kinh, thần chú) | 'slow' (kệ) | 'recitation' (niệm danh hiệu)
 *        | 'bow' (Tam quy: xướng, chuông + xá sau mỗi câu quy y)
 * lang: 'vi' cho bài tiếng Việt (có thể gõ mõ mỗi dòng theo lối Làng Mai)
 * Muốn thêm kinh (ví dụ Phẩm Phổ Môn, Kinh A Di Đà) khi đã có văn bản được phép: thêm mục vào SUTRAS.
 */

const LITURGY = {
  incense: {
    title: 'Niệm hương',
    source: 'han-viet-co',
    meaning: 'Nén hương tượng trưng cho giới, định, tuệ — dâng chính sự tu tập của mình',
    text: `Nguyện thử diệu hương vân
Biến mãn thập phương giới
Cúng dường nhất thiết Phật
Tôn Pháp chư Bồ Tát
Vô biên Thanh Văn chúng
Cập nhất thiết Thánh Hiền
Duyên khởi quang minh đài
Xứng tánh tác Phật sự
Phổ huân chư chúng sanh
Giai phát Bồ Đề tâm
Viễn ly chư vọng nghiệp
Viên thành vô thượng đạo`
  },
  opening: {
    title: 'Khai kinh',
    source: 'han-viet-co',
    meaning: 'Phát nguyện lắng nghe và hiểu đúng lời Phật dạy',
    text: `Vô thượng thậm thâm vi diệu pháp
Bá thiên vạn kiếp nan tao ngộ
Ngã kim kiến văn đắc thọ trì
Nguyện giải Như Lai chân thật nghĩa`
  },
  dedication: {
    title: 'Hồi hướng',
    source: 'han-viet-co',
    meaning: 'Chia đều điều lành của buổi tụng đến khắp tất cả mọi người, mọi loài',
    text: `Nguyện đem công đức này
Hướng về khắp tất cả
Đệ tử và chúng sanh
Đều trọn thành Phật đạo`
  }
};

const SUTRAS = [
  {
    num: 1,
    id: 'tam-kinh',
    name: 'Bát Nhã Tâm Kinh',
    source: 'han-viet-co',
    style: 'fast', // Tâm Kinh / thần chú: tụng nhanh, dồn hơn, giọng trầm đều
    invocation: 'Nam mô Bát Nhã Hội Thượng Phật Bồ Tát',
    meaning: 'Thấy rõ mọi sự đều đổi thay, để buông bớt bám chấp',
    text: `Quán Tự Tại Bồ Tát hành thâm Bát Nhã Ba La Mật Đa thời
chiếu kiến ngũ uẩn giai không, độ nhất thiết khổ ách
Xá Lợi Tử, sắc bất dị không, không bất dị sắc
sắc tức thị không, không tức thị sắc
thọ tưởng hành thức diệc phục như thị
Xá Lợi Tử, thị chư pháp không tướng
bất sanh bất diệt, bất cấu bất tịnh, bất tăng bất giảm
thị cố không trung vô sắc, vô thọ tưởng hành thức
vô nhãn nhĩ tỷ thiệt thân ý, vô sắc thanh hương vị xúc pháp
vô nhãn giới nãi chí vô ý thức giới
vô vô minh diệc vô vô minh tận
nãi chí vô lão tử diệc vô lão tử tận
vô khổ tập diệt đạo, vô trí diệc vô đắc
dĩ vô sở đắc cố, Bồ Đề Tát Đỏa y Bát Nhã Ba La Mật Đa cố
tâm vô quái ngại, vô quái ngại cố, vô hữu khủng bố
viễn ly điên đảo mộng tưởng, cứu cánh Niết Bàn
tam thế chư Phật y Bát Nhã Ba La Mật Đa cố
đắc A Nậu Đa La Tam Miệu Tam Bồ Đề
cố tri Bát Nhã Ba La Mật Đa thị đại thần chú
thị đại minh chú, thị vô thượng chú, thị vô đẳng đẳng chú
năng trừ nhất thiết khổ, chân thật bất hư
cố thuyết Bát Nhã Ba La Mật Đa chú, tức thuyết chú viết
Yết đế yết đế, ba la yết đế, ba la tăng yết đế, Bồ đề tát bà ha
Yết đế yết đế, ba la yết đế, ba la tăng yết đế, Bồ đề tát bà ha
Yết đế yết đế, ba la yết đế, ba la tăng yết đế, Bồ đề tát bà ha`
  },
  {
    num: 2,
    id: 'tu-bi',
    lang: 'vi',
    name: 'Kinh Từ Bi',
    source: 'tu-soan',
    meaning: 'Gửi tình thương không giới hạn đến mọi loài',
    text: `Người hiền mong đến chốn an tịnh
nên sống thẳng ngay và chân thật
hiền hòa, mềm mỏng, không kiêu căng
biết đủ, giản dị, ít bận rộn
các giác quan lắng dịu, sáng suốt
không tham đắm, không làm điều nhỏ nhen
mà người hiểu biết phải chê trách
Nguyện cho muôn loài được an vui
được bình yên và được hạnh phúc
dù yếu hay mạnh, dù lớn hay nhỏ
dù thấy được hay không thấy được
dù ở gần hay đang ở xa
đã sinh ra hay sắp sinh ra
nguyện cho tất cả đều an vui
Đừng ai lừa dối, đừng ai khinh rẻ
một người nào, ở bất cứ nơi đâu
đừng vì giận hờn hay vì thù ghét
mà mong cho người khác khổ đau
Như người mẹ thương đứa con một
sẵn lòng che chở bằng cả cuộc đời
hãy nuôi lớn lòng thương không bờ bến
hướng về tất cả mọi loài
Trải tâm từ khắp cả thế gian
trên cao, dưới thấp và bốn phương
không còn ngăn ngại, không oán hận
không còn đối địch với một ai
Khi đứng, khi đi, khi ngồi, khi nằm
bao lâu còn tỉnh, hãy giữ tâm này
đây là cách sống cao đẹp nhất
mà bậc hiền trí vẫn ngợi khen`
  },
  {
    num: 3,
    id: 'hanh-phuc',
    lang: 'vi',
    name: 'Kinh Hạnh Phúc',
    source: 'tu-soan',
    meaning: 'Những phúc lành đến từ cách mình sống mỗi ngày',
    text: `Tránh xa người xấu ác, gần gũi bậc hiền lương
kính trọng người đáng kính, là phúc lành cao nhất
Sống ở nơi thích hợp, từng gieo những việc lành
giữ mình theo hướng đúng, là phúc lành cao nhất
Học rộng và giỏi nghề, biết giữ gìn kỷ luật
nói lời hay ý đẹp, là phúc lành cao nhất
Hiếu thảo với mẹ cha, thương yêu người trong nhà
làm việc không rối ren, là phúc lành cao nhất
Rộng lòng giúp đỡ người, sống ngay thẳng hiền hòa
làm việc không lỗi lầm, là phúc lành cao nhất
Tránh xa điều ác xấu, không say sưa nghiện ngập
siêng làm điều thiện lành, là phúc lành cao nhất
Biết kính trọng khiêm nhường, biết đủ và biết ơn
đúng lúc nghe lời hay, là phúc lành cao nhất
Nhẫn nại và dễ nghe, được gần bậc tu hành
đúng lúc bàn đạo lý, là phúc lành cao nhất
Tự chế và tu tập, thấy rõ bốn chân lý
hướng về nơi an tịnh, là phúc lành cao nhất
Gặp thăng trầm cuộc đời, lòng vẫn không dao động
không sầu, sạch, an ổn, là phúc lành cao nhất
Ai sống được như vậy, đi đâu cũng vững vàng
đến đâu cũng an lành, đó là phúc lành cao nhất`
  },
  {
    num: 4,
    id: 'bat-dai-nhan-giac',
    lang: 'vi',
    name: 'Tám Điều Giác Ngộ',
    source: 'tu-soan',
    meaning: 'Tám điều tỉnh thức: vô thường, biết đủ, tinh tấn, trí tuệ, sẻ chia…',
    text: `Điều thứ nhất: đời là vô thường, thân này mong manh
quán chiếu như vậy để bớt chấp giữ
Điều thứ hai: ham muốn nhiều thì khổ nhiều
ít ham muốn thì thân tâm tự tại
Điều thứ ba: lòng không biết đủ thì chạy mãi
biết đủ thì an vui trong giản dị
Điều thứ tư: lười biếng làm ta sa sút
siêng năng tinh tấn để vượt phiền não
Điều thứ năm: không hiểu biết là gốc của khổ
hãy học hỏi lắng nghe cho trí sáng dần
Điều thứ sáu: thiếu thốn dễ sinh oán giận
hãy rộng lòng chia sẻ, đối xử bình đẳng
Điều thứ bảy: dục lạc dễ làm ta sa ngã
hãy sống thanh cao, giữ lòng trong sạch
Điều thứ tám: khổ đau của đời rất lớn
hãy phát tâm thương giúp, cùng nhau vượt qua
Tám điều này chư Phật và Bồ Tát đã giác ngộ
nguyện chúng ta cùng ghi nhớ và thực hành mỗi ngày`
  },
  {
    num: 5,
    id: 'phap-cu',
    lang: 'vi',
    name: 'Pháp Cú (trích)',
    source: 'tu-soan',
    meaning: 'Tâm đi trước mọi việc — giữ tâm trong sáng thì an vui theo ta',
    text: `Mọi sự đều do tâm đi trước
tâm là chủ, mọi việc từ tâm mà thành
nói hay làm với tâm vẩn đục
khổ đau theo ta như bánh xe theo chân
Mọi sự đều do tâm đi trước
tâm là chủ, mọi việc từ tâm mà thành
nói hay làm với tâm trong sáng
an vui theo ta như bóng chẳng rời hình
Lấy oán báo oán, oán chẳng bao giờ dứt
chỉ có lòng thương làm oán hận tan
đó là lẽ thật xưa nay
Chư ác mạc tác, chúng thiện phụng hành
tự tịnh kỳ ý, thị chư Phật giáo
tránh mọi điều ác, làm các việc lành
giữ lòng trong sạch, ấy lời Phật dạy
Lấy hiền hòa thắng giận dữ
lấy điều thiện thắng điều ác
lấy rộng lòng thắng keo kiệt
lấy chân thật thắng dối gian`
  },
  {
    num: 6,
    id: 'song-tron-hom-nay',
    lang: 'vi',
    name: 'Sống Trọn Hôm Nay',
    source: 'tu-soan',
    meaning: 'Diễn ý Kinh Bhaddekaratta: sống trọn vẹn với giây phút hiện tại',
    text: `Chớ mải miết nhìn lại những ngày đã qua
cũng chớ mong cầu những ngày chưa đến
điều đã qua thì đã buông xuống
điều chưa đến thì chưa thể nắm
Chỉ ngay trong khoảnh khắc đang có mặt
nhìn sâu và thấy rõ từng điều đang sinh khởi
vững chãi, không lay động, không bị cuốn đi
hãy tinh tấn sống trọn vẹn với hôm nay
Ai biết được ngày mai sẽ ra sao
vô thường đến chẳng hẹn trước cùng ai
người ngày đêm sống tỉnh thức như vậy
bậc an tịnh gọi là người biết sống trọn một ngày an lành`
  },
  {
    num: 7,
    id: 'niem-phat',
    name: 'Niệm Phật A Di Đà',
    source: 'han-viet-co',
    style: 'recitation',
    invocation: 'Nam mô Liên Trì Hải Hội Phật Bồ Tát',
    meaning: 'Nhớ nghĩ về đức Phật để tâm lắng lại, nhất tâm',
    repeat: { line: 'Nam mô A Di Đà Phật', times: 54 }
  },
  {
    num: 8,
    id: 'tam-quy',
    name: 'Tam Tự Quy Y',
    source: 'han-viet-co',
    style: 'bow', // xướng, không mõ; mỗi câu quy y một tiếng chuông + chắp tay xá
    invocation: null,
    meaning: 'Nương tựa Phật, Pháp, Tăng — hướng về hiểu biết và từ bi',
    text: `Tự quy y Phật, đương nguyện chúng sanh
thể giải đại đạo, phát vô thượng tâm
Tự quy y Pháp, đương nguyện chúng sanh
thâm nhập kinh tạng, trí tuệ như hải
Tự quy y Tăng, đương nguyện chúng sanh
thống lý đại chúng, nhất thiết vô ngại`
  },
  {
    num: 9,
    id: 'niem-quan-am',
    name: 'Niệm Quán Thế Âm',
    source: 'han-viet-co',
    style: 'recitation',
    invocation: 'Nam mô Đại Bi Hội Thượng Phật Bồ Tát',
    meaning: 'Học hạnh lắng nghe và thương yêu của Bồ Tát Quán Thế Âm',
    repeat: { line: 'Nam mô Đại Bi Quán Thế Âm Bồ Tát', times: 27 }
  }
];

// Xướng danh hiệu trước kinh (3 lần, mỗi lần một tiếng chuông) khi bài không ghi riêng
const DEFAULT_INVOCATION = 'Nam mô Bổn Sư Thích Ca Mâu Ni Phật';

// Niệm Phật ngắn trong mỗi khoá (sau kinh chính)
const RECITATION_LINE = 'Nam mô A Di Đà Phật';

// Lịch mặc định khi không ai đề nghị (tránh bài dài lặp lại quá thường xuyên)
const DEFAULT_ROTATION = [1, 2, 3, 5, 6, 4, 8, 1, 2, 9, 3, 7];

/** Tách văn bản thành các dòng, mỗi dòng là mảng chữ (mỗi chữ = 1 tiếng mõ). */
function toLines(entry) {
  const raw = entry.repeat
    ? Array.from({ length: entry.repeat.times }, () => entry.repeat.line).join('\n')
    : entry.text;
  return raw
    .split('\n')
    .map((l) => l.trim().split(/\s+/).filter(Boolean))
    .filter((l) => l.length > 0);
}

function lineSyllables(lines) {
  return lines.reduce((n, l) => n + l.length, 0);
}

module.exports = { LITURGY, SUTRAS, RECITATION_LINE, DEFAULT_INVOCATION, DEFAULT_ROTATION, toLines, lineSyllables };
