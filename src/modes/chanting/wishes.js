/**
 * 100 lời chúc đọc khi có người dâng lễ (chế độ DÂNG LỄ).
 * Chỉ chúc chung chung: sức khoẻ, bình an, công việc, may mắn, tâm an, trí tuệ — KHÔNG nhắc tới
 * gia đình, vợ chồng, con cái, tuổi tác, giới tính hay bất cứ điều gì chưa biết về người xem.
 */
const WISHES = [
  'Chúc bạn luôn mạnh khoẻ, bình an.',
  'Nguyện bạn thân tâm an lạc, mọi điều hanh thông.',
  'Chúc bạn công việc thuận lợi, gặp nhiều may mắn.',
  'Mong bạn mỗi ngày đều nhẹ nhàng và vui vẻ.',
  'Chúc bạn sức khoẻ dồi dào, tinh thần sáng suốt.',
  'Nguyện bạn gặp nhiều duyên lành trên mọi nẻo đường.',
  'Chúc bạn vạn sự như ý, an vui mỗi ngày.',
  'Mong bạn luôn giữ được tâm bình an giữa cuộc sống bận rộn.',
  'Chúc bạn làm việc gì cũng suôn sẻ, thành tựu.',
  'Nguyện bạn phước lành tăng trưởng, phiền muộn tiêu tan.',
  'Chúc bạn ngủ ngon, ăn ngon, khoẻ mạnh mỗi ngày.',
  'Mong bạn luôn được bình yên và che chở.',
  'Chúc bạn một ngày thật nhiều niềm vui và năng lượng tích cực.',
  'Nguyện bạn trí tuệ sáng soi, việc gì cũng sáng suốt.',
  'Chúc bạn công việc phát triển, cuộc sống đủ đầy an ổn.',
  'Mong mọi điều tốt đẹp nhất sẽ đến với bạn.',
  'Chúc bạn luôn mỉm cười và lan toả niềm vui.',
  'Nguyện bạn tâm luôn thanh tịnh, nhẹ nhàng như hoa sen.',
  'Chúc bạn vượt qua mọi khó khăn một cách nhẹ nhàng.',
  'Mong bạn luôn gặp người tốt, việc tốt.',
  'Chúc bạn an khang, thân tâm thường an lạc.',
  'Nguyện bạn thân không bệnh khổ, tâm không ưu phiền.',
  'Chúc bạn mọi dự định đều thành công tốt đẹp.',
  'Mong bạn luôn đủ đầy và biết đủ để an vui.',
  'Chúc bạn bình an trên mọi chặng đường đi.',
  'Nguyện bạn được an lành trong từng hơi thở.',
  'Chúc bạn công việc vững vàng, tâm luôn vững chãi.',
  'Mong bạn mỗi sáng thức dậy đều thấy lòng nhẹ nhõm.',
  'Chúc bạn sức khoẻ như ý, may mắn tràn đầy.',
  'Nguyện thiện duyên đưa bạn đến những điều tốt đẹp.',
  'Chúc bạn luôn tự tin và vững bước.',
  'Mong bạn có thật nhiều sức khoẻ để làm những điều mình yêu thích.',
  'Chúc bạn hanh thông mọi việc, thuận buồm xuôi gió.',
  'Nguyện bạn an trú trong hiện tại, hạnh phúc trong từng phút giây.',
  'Chúc bạn tinh thần minh mẫn, sức khoẻ dẻo dai.',
  'Mong bạn luôn được mọi người yêu quý và giúp đỡ.',
  'Chúc bạn gặp nhiều cơ hội tốt trong công việc.',
  'Nguyện bạn phiền não nhẹ vơi, an vui tăng trưởng.',
  'Chúc bạn một năm bình an, khoẻ mạnh, nhiều may mắn.',
  'Mong bạn luôn giữ được trái tim ấm áp và hiền hoà.',
  'Chúc bạn mọi điều cầu mong đều được viên mãn.',
  'Nguyện bạn gieo nhân lành, gặt quả ngọt.',
  'Chúc bạn sống mỗi ngày thật ý nghĩa và an nhiên.',
  'Mong bạn luôn mạnh mẽ trước mọi thử thách.',
  'Chúc bạn phước lành đủ đầy, an vui tràn ngập.',
  'Nguyện bạn được chư Phật gia hộ, bình an vô sự.',
  'Chúc bạn luôn sáng suốt trong mọi quyết định.',
  'Mong bạn tìm được sự bình yên trong tâm hồn.',
  'Chúc bạn thành tựu những điều thiện lành mình mong muốn.',
  'Nguyện bạn từ bi tăng trưởng, trí tuệ khai mở.',
  'Chúc bạn khoẻ mạnh, an vui, thật nhiều niềm hạnh phúc.',
  'Mong bạn luôn gặp nhiều duyên lành và may mắn.',
  'Chúc bạn giữ được sự kiên nhẫn và bình tĩnh mỗi ngày.',
  'Nguyện bạn an lạc, tự tại, không vướng bận lo âu.',
  'Chúc bạn những ngày sắp tới thật nhiều niềm vui.',
  'Mong bạn luôn được sức khoẻ và bình an đồng hành.',
  'Chúc bạn công việc thuận lợi, tiến bộ mỗi ngày.',
  'Nguyện bạn mỗi bước chân đều là bước chân bình an.',
  'Chúc bạn luôn có năng lượng để theo đuổi điều mình mong muốn.',
  'Mong bạn mãi giữ được nụ cười hiền hậu.',
  'Chúc bạn thuận lợi trên mọi hành trình.',
  'Nguyện ánh sáng từ bi soi đường cho bạn.',
  'Chúc bạn tâm an, thân khoẻ, trí sáng.',
  'Mong mọi lo toan của bạn sớm được hoá giải.',
  'Chúc bạn có thật nhiều phúc đức và may mắn.',
  'Nguyện bạn bình an như dòng suối, vững vàng như núi cao.',
  'Chúc bạn luôn tràn đầy hy vọng và niềm tin.',
  'Mong bạn mỗi ngày đều học được điều hay, gặp được điều tốt.',
  'Chúc bạn được an vui, được bình yên, được hạnh phúc.',
  'Nguyện bạn mọi điều lành đều đến, mọi điều dữ đều qua.',
  'Chúc bạn sức khoẻ vẹn toàn, tâm hồn thư thái.',
  'Mong bạn luôn biết yêu thương và được yêu thương.',
  'Chúc bạn công việc suôn sẻ, cuộc sống an nhiên.',
  'Nguyện bạn hạnh phúc tròn đầy như trăng rằm.',
  'Chúc bạn vững tâm, sáng trí trên mọi chặng đường.',
  'Mong bạn luôn được che chở trước mọi điều không may.',
  'Chúc bạn một tâm hồn nhẹ nhàng và thanh thản.',
  'Nguyện bạn được tuỳ duyên mà an, tuỳ nơi mà vui.',
  'Chúc bạn khởi đầu mới thật thuận lợi.',
  'Mong bạn luôn có đủ sức khoẻ, đủ niềm vui, đủ bình an.',
  'Chúc bạn may mắn mỉm cười trong mọi việc.',
  'Nguyện thân tâm bạn luôn nhẹ nhàng, thanh tịnh.',
  'Chúc bạn tinh tấn mỗi ngày, an vui mỗi lúc.',
  'Mong những điều bạn đang cố gắng sẽ sớm đơm hoa kết trái.',
  'Chúc bạn sống khoẻ, sống vui, sống an lạc.',
  'Nguyện bạn được bình an từ trong tâm đến ngoài thân.',
  'Chúc bạn mọi điều tốt lành trong hôm nay và mãi về sau.',
  'Mong bạn luôn tìm thấy niềm vui trong những điều giản dị.',
  'Chúc bạn phát tâm lành, gặp duyên lành, hưởng phước lành.',
  'Nguyện bạn an nhiên tự tại giữa đời thường.',
  'Chúc bạn đường đời rộng mở, công việc hanh thông.',
  'Mong bạn luôn giữ được sự bình thản trước sóng gió.',
  'Chúc bạn khoẻ mạnh như cây tùng, tươi vui như hoa nở.',
  'Nguyện công đức hôm nay mang lại cho bạn nhiều an lạc.',
  'Chúc bạn luôn được bình an, vui vẻ và may mắn.',
  'Mong tâm bạn sáng như đèn, lòng bạn ấm như nắng.',
  'Chúc bạn có một ngày thật an lành.',
  'Nguyện bạn phước thọ tăng long, mọi sự cát tường.',
  'Chúc bạn thành công trong mọi việc thiện lành.',
  'Mong bạn luôn hạnh phúc và bình an. A Di Đà Phật.'
];

// Rút ngẫu nhiên không lặp lại cho tới khi dùng hết bộ (xáo bài)
function createWishBag() {
  let bag = [];
  return () => {
    if (!bag.length) {
      bag = WISHES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}

module.exports = { WISHES, createWishBag };
