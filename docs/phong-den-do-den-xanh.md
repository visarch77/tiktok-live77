# Phòng "Đèn Xanh – Đèn Đỏ" (game sinh tồn tương tác)

Bản nghiên cứu và thiết kế một chế độ phòng live mới cho app, dựa trên video mẫu
`ScreenRecording_11-02-2026 12-08-55_1.MP4`. Video dài 98 giây, ghi một phòng live của kênh "Miles", khoảng 150–220 người xem.

## 1. Phân tích video mẫu

### Màn hình (dọc 9:16)

- **Trên cùng:** đồng hồ đếm ngược lớn, "TIEMPO RESTANTE 01:24". Một ván dài khoảng 90 giây.
- **Vạch đích:**
  - một con búp bê khổng lồ đứng giữa, quay lưng hoặc quay mặt;
  - hai bên là 6 lính canh áo hồng;
  - một người chơi đã về đích đứng ở góc trái trên (số 8, "Znap street").
- **Sân:**
  - nền xám;
  - khi "đèn đỏ", búp bê chiếu một quạt sáng màu hồng hoặc tím từ trên xuống, bao trùm sân.
- **Người chơi:**
  - nhân vật nhỏ mặc đồ xanh, có số trên ngực và tên TikTok trên đầu;
  - xuất phát từ cuối sân và tiến dần lên, tới cuối ván có khoảng 50–90 người trên sân.
- **Thanh quà cố định** phía dưới khung game, mỗi quà là một hiệu ứng:

| Quà (hình trong video) | Hiệu ứng trong game |
| --- | --- |
| Hoa hồng 🌹 | **ENTER / TURBO** — vào game, hoặc chạy nhanh |
| Tim | **10 KILLS** — loại 10 người |
| Finger heart | **5 GUARDS** — thêm 5 lính canh |
| Hộp quà xanh | **10 CLONES** — 10 bản sao của mình |
| Donut (30) | **30 KILLS** |
| Mặt người | **GIANT** — biến thành người khổng lồ |
| Hộp quà hồng | **GIANT KILL** |
| GG | **CHICKEN** — biến người khác thành gà |
| Pháo hoa | **SHIELD** — khiên chống bị bắn |
| Gấu bông | **TURBO CLONES** |

- **Hết giờ:** màn "TOP SOBREVIVIENTES" (top người sống sót), hiện avatar và tên. Sau đó ván mới bắt đầu.

### Hành vi người xem trong video

- Bình luận "me", "1", "meee" để xin vào game.
- Bình luận đúng số của mình ("67", "32") để điều khiển hoặc nhận nhân vật.
- Thả tim liên tục.
- Gửi chủ yếu Hoa hồng, combo ×1 đến ×9. Đây là quà rẻ nhất, dùng để vào game và chạy nhanh.
- Khi có quà, banner người tặng bay qua ngay trên thanh quà.
- Thông báo "đã tham gia", "đã follow", "đã trở thành người hâm mộ thứ 241 trong Fan Club" hiện liên tục. Kênh nhỏ (60k follow) giữ được 200 người xem bằng vòng lặp ván 90 giây.

### Vì sao mô hình này giữ người xem

1. **Ván ngắn khoảng 90 giây**, có đồng hồ đếm ngược, nên người xem luôn "chờ xem ai thắng".
2. **Người xem trở thành nhân vật:** tên mình hiện trên sân là lý do mạnh nhất để ở lại.
3. **Có kỹ năng:** phải dừng đúng lúc đèn đỏ. Nhờ đó người không tặng quà vẫn chơi được.
4. **Quà nào cũng có tác dụng rõ ràng và tức thì** (giết, khiên, khổng lồ, gà), kèm yếu tố trêu nhau.
5. **Không cần người dẫn nói nhiều:** game tự chạy 24/7, phù hợp với kiến trúc nhiều phòng tự động của app.

## 2. Rủi ro cần xử lý trước khi làm

### 2.1 Chính sách TikTok về game ăn theo quà

Trong ứng dụng có mục *Creator Tools → LIVE Center → Rules and Guidance → Inauthentic Gift Requests*. Theo một bản tóm tắt bên thứ ba từ năm 2023, các hạn chế gồm:

- không làm game tính điểm dựa trên quà;
- tránh **auto-game không có creator điều phối**;
- không dùng âm thanh hoặc video lặp lại cho quà;
- không liên tục xin quà mà không có nội dung tương tác.

Cần mở mục đó trong app TikTok để đọc bản hiện hành.

Thiết kế giảm rủi ro:

- **Người chơi miễn phí phải thắng được:** bình luận để vào game, thả tim để chạy, dừng đúng lúc đèn đỏ. Quà chỉ là phụ trợ, và top là **top sống sót**, không phải top tặng quà.
- **Có người điều phối:**
  - admin bấm bắt đầu hoặc tạm dừng;
  - thỉnh thoảng có câu hỏi hoặc thử thách do admin đặt;
  - nên có người thật trên khung camera nhỏ.
- **Đa dạng âm thanh:** tiếng hô, nhạc và hiệu ứng quà xoay vòng nhiều biến thể.
- **Không có câu kêu gọi tặng quà.** Trên màn hình chỉ có bảng hướng dẫn "quà làm gì".

### 2.2 Bản quyền Squid Game

Búp bê Young-hee, lính canh áo hồng đeo mặt nạ hình học, đồ thể thao xanh có số và tên "Squid Game" đều là tài sản của Netflix. Dùng y nguyên trên kênh kiếm tiền có thể bị báo cáo vi phạm bản quyền và mất quyền LIVE.

**Đề xuất làm phiên bản Việt hoá, tự vẽ:** "Đèn xanh – Đèn đỏ" là trò chơi dân gian, không ai sở hữu. Gợi ý bối cảnh:

- **Cánh đồng làng:**
  - búp bê khổng lồ váy cam (quay mặt, mắt đỏ = đèn đỏ) đứng trước cây khô — bản đồ hoạ Scenario ở `public/assets/redlight/`;
  - 6 lính canh áo hồng đeo mặt nạ hình học, người chơi đồ thể thao xanh có số sau lưng;
  - người chơi đội nón lá, áo bà ba có số.
- Hoặc **sân trường tiểu học**: cô giáo cầm còi, học sinh áo trắng khăn quàng.

Bối cảnh Việt khác biệt với hàng trăm phòng Squid Game nước ngoài, và dễ lên đề xuất ở Việt Nam.

### 2.3 Tài khoản

Phòng chính `@qunh.vy945` là phòng tụng kinh. Phòng game phải dùng **tài khoản TikTok riêng**, vì nội dung tôn giáo và game giết nhau trên cùng một kênh sẽ làm hỏng cả hai tệp người xem. App đã hỗ trợ nhiều phòng, nên chỉ cần tạo phòng mới với chế độ mới.

## 3. Luật chơi đề xuất

### Vòng đời một ván (khoảng 90 giây, cấu hình được)

```
lobby (15s)  →  play (90s: xen kẽ XANH 2–6s / ĐỎ 2–4s ngẫu nhiên)  →  result (10s)  →  lobby…
```

- **lobby:** bình luận bất kỳ (hoặc "1", "vào", "me") để vào. Mỗi người nhận một **số** và một chỗ ở vạch xuất phát. Ván đang chạy vẫn cho vào, nhưng ở vạch cuối.
- **XANH:** mỗi lượt thả tim của bạn đẩy nhân vật lên một bước. Bình luận số của mình cũng đẩy lên một bước, có giới hạn tốc độ.
- **Báo trước:** trước khi chuyển sang ĐỎ có 0,6 giây cảnh báo (đèn nhấp nháy và tiếng hô "Đèn… đỏ!").
- **ĐỎ:** sau 0,3 giây ân hạn, ai còn thả tim hoặc bình luận thì bị bắn ngã và loại khỏi ván. Đây chính là phần kỹ năng: phải biết dừng tay.
- **Về đích:** chạm vạch thì an toàn, đứng lên bục, được xướng tên.
- **result:** màn "Top sống sót" xếp theo thứ tự về đích, sau đó là những người còn trên sân, tính theo quãng đường.
- **Bảng tuần:** cộng dồn số ván về đích vào `ctx.board`, dùng lại bảng người xem chung của app.

### Quà là "vật phẩm"

Ánh xạ theo **loại quà**, cấu hình trong admin. Bảng dưới là mặc định gợi ý, tên hiệu ứng đã Việt hoá:

| Quà gợi ý | Hiệu ứng | Ghi chú cân bằng |
| --- | --- | --- |
| Hoa hồng | Vào game + chạy nhanh 3 bước | Có cooldown cho mỗi người |
| Finger heart | Khiên 1 lần (đỡ một phát bắn đèn đỏ) | Tối đa 1 khiên đang hoạt động |
| Tim / Heart Me | Lính bắn: lính canh bắn loại ngẫu nhiên 3 người đang chạy | Không bắn người có khiên |
| Hộp quà nhỏ | 5 bản sao chạy cùng (cùng tên, mờ hơn) | Bản sao chết thay chủ |
| Donut | Búp bê hét: sóng âm đẩy lùi 10 người dẫn đầu | |
| Mũ / Mặt người | Khổng lồ 10 giây: bước dài gấp 3, miễn bị lính bắn | |
| GG | Biến người dẫn đầu thành gà 8 giây (chạy chậm) | Yếu tố trêu nhau |
| Pháo hoa | Khiên cho cả đội: 10 người gần nhất | Quà "tử tế" để cân bằng |
| Gấu bông | Bản sao + chạy nhanh | |

Quà không có trong bảng dùng mặc định "chạy nhanh N bước", với N tăng theo số xu nhưng có trần, để quà to không thắng tuyệt đối.

## 4. Kiến trúc trong app hiện tại

App đã có sẵn kiến trúc plugin `src/modes/<id>/` (xem `src/modes/README.md`). Phòng mới là một mode mới, **không phải sửa lõi**.

### Server: `src/modes/redlight/`

| File | Việc |
| --- | --- |
| `index.js` | `create(ctx, saved)`: máy trạng thái `lobby → play(green/red) → result`, có `onEvent`, `getPublicState`, `rpc`, `simulate`, `dispose`. Server là nguồn sự thật duy nhất: vị trí, sống/chết và thời điểm đổi đèn đều tính ở server. |
| `items.js` | Ánh xạ quà sang vật phẩm, viết theo kiểu `chanting/gifts.js`. |
| `sim.js` | Giả lập người xem (vào game, thả tim, phạm luật đèn đỏ, tặng quà) để test không cần live. |
| `texts.js` | Câu xướng: "Số 67 — Lan Anh về đích!", "Đèn đỏ!", ... Đọc bằng `ctx.tts`. Nhiều biến thể để tránh lặp. |

Ghi chú kỹ thuật:

- **Tick 10 Hz ở server:** gộp tim theo người (normalize đã gộp mỗi ~1,2 giây), cập nhật vị trí, rồi phát diff `redlight.tick` (vị trí đã lượng tử hoá). Không phát toàn bộ state mỗi tick.
- **Giới hạn số nhân vật:**
  - tối đa khoảng 120 người chơi thật và 300 bản sao để màn hình không nghẽn;
  - người thứ 121 trở đi vào hàng chờ ván sau.
- **Độ trễ:** sự kiện TikTok tới server chậm 1–3 giây. Vì vậy:
  - phán quyết đèn đỏ dựa trên **thời điểm server nhận sự kiện**, kèm 0,3 giây ân hạn sau khi đổi đèn;
  - pha ĐỎ phải dài ít nhất khoảng 2 giây thì mới công bằng.
- **Cài đặt** (`settingsSchema`):
  - `roundSeconds`, `lobbySeconds`, `greenMin/Max`, `redMin/Max`, `stepPerLike`, `maxPlayers`;
  - bảng quà sang vật phẩm;
  - âm lượng;
  - `autoLoop` (bật/tắt tự chạy liên tục, để còn có creator điều phối).

### Màn hình: `public/redlight.html` + `public/js/redlight.js`

- **Canvas 2D** (không cần thư viện), kích thước 1080×1920, phối cảnh giả 3D. Sân là hình thang: càng xa vạch đích càng to. Chuyển đổi tọa độ dùng lại cách tính trong `seat-layout.js`.
- **Sprite nhân vật** dạng sprite sheet (chạy 4 khung, đứng, ngã), có số trên ngực và tên trên đầu. Font tên dùng lại "Be Vietnam Pro" như phòng tụng kinh.
- **Búp bê khổng lồ** có hai trạng thái quay lưng và quay mặt (xoay người lúc sắp đỏ). Pha ĐỎ có quạt sáng hồng quét sân.
- **Nội suy** vị trí giữa các tick để chuyển động mượt ở 60 fps.
- Các phần còn lại:
  - thanh quà cố định;
  - banner người tặng;
  - đồng hồ;
  - màn Top sống sót;
  - ticker "X đã vào game".
- **Âm thanh:** tự tạo bằng WebAudio, giống `audio.js` (còi, tiếng hô, súng nhựa vui nhộn, tiếng gà). Tránh âm thanh bạo lực thật.
- **LIVE Studio:** dùng nguồn Link `http://localhost:3000/room/<id>/live.html`. Route này đã có sẵn.

### Admin

- Thêm khối điều khiển cho mode `redlight`: Bắt đầu, Tạm dừng, Ván mới, Ép đèn đỏ, Bật/tắt tự lặp, bảng quà.
- `admin.html` hiện chia khối theo mode. Thêm phần này tương tự khối chanting.

## 5. Kế hoạch làm (đề xuất)

1. **Bản chạy được, khoảng 1 buổi:**
   - mode server và máy trạng thái;
   - canvas vẽ hình khối đơn giản (người là hình tròn có số);
   - giả lập.
   - Test trên server cổng 3100 với phòng `thu-nghiem`.
2. **Vật phẩm từ quà** và màn Top sống sót, kèm âm thanh.
3. **Đồ hoạ:** bối cảnh đồng làng và sprite tự vẽ. Có thể tạo bằng AI (Scenario) rồi cắt sprite sheet.
4. **Admin, cài đặt và tinh chỉnh cân bằng** với giả lập 150 người.
5. **Live thử** trên tài khoản phụ, đo số người ở lại và tỷ lệ bình luận.

## Nguồn

- Video mẫu do người dùng cung cấp (phân tích khung hình).
- [Live Success #26: tóm tắt mục "Inauthentic gift requests" của TikTok](https://live-success.beehiiv.com/p/gifts-are-not-a-way-for-viewers-to-send-you-money). Đây là nguồn bên thứ ba và cần đối chiếu trong app.
- [Tokki Live](https://www.moddb.com/games/tokki-live), [tiktok-interactive-games.itch.io](https://tiktok-interactive-games.itch.io), [Devign LIVE Games](https://devignlb.com/work/live-games.html): các game LIVE tương tác cùng thể loại.
- [Know Your Meme: Red Light, Green Light / Squid Game Doll](https://amp.knowyourmeme.com/memes/red-light-green-light-squid-game-doll): nguồn gốc hình ảnh búp bê thuộc Netflix.


## Cân bằng theo độ trễ TikTok (11/2026)

Hình LIVE tới người xem chậm 2–4 giây, tim được gộp mỗi 1,2 giây, sự kiện về server chậm thêm ~1 giây.
Mô phỏng một người thả tim hết công suất, dừng khi THẤY đèn vàng:

| Luật | Trễ 1 s | Trễ 3 s | Trễ 4,5 s | Thả tim bất chấp |
|---|---|---|---|---|
| Cũ (ân hạn 2,5 s, mất bước dồn khi đỏ) | về đích 99% @76 s | 0% về, 42% bị loại | 100% bị loại | 100% bị loại |
| Mới (ân hạn 4 s, vàng 2 s, đỏ 5–8 s, giữ bước dồn) | 100% @60 s | 100% @61 s | 100% @65 s | 100% bị loại |

- Tim tới lúc đỏ nhưng còn trong ân hạn: không phạm luật, được dồn (tối đa 16 bước ≈ 5 giây chạy), chạy tiếp khi xanh.
- Bước dồn không bị xoá khi chuyển đỏ (chỉ ngừng chạy).
- Người ảo (autoSim) thấy đèn trễ 1–4 giây ngẫu nhiên như người xem thật.


## Bố cục theo giao diện TikTok LIVE (đo trên video mẫu, máy 19,5:9)

- 0–12% chiều cao: tên kênh, Follow, số người xem, hàng huy hiệu xếp hạng → chỉ để nền.
- 12–62%: vùng sạch. Canvas 1080×1920: bảng đèn/đồng hồ y 250–378, búp bê + 6 lính trên lối đi, vạch đích y 480,
  sân 480–1050, vạch xuất phát 1050, thanh quà 1076–1180.
- Từ ~62%: quà bay (trái), bình luận, ô nhập, tim bay (phải) → nền tối dần sang đen để chữ bình luận dễ đọc.
- Máy dài: TikTok phóng hình 9:16 lấp đầy chiều cao rồi cắt ~9% mỗi bên → chữ, bảng, người chơi giữ trong x 100–980.
- Thông báo tặng quà thay chỗ thanh quà 3 giây (không che vạch xuất phát).

## Hết giờ

Đèn đỏ đứng im, 6 lính dàn hàng ngang tiến vào sân (1,3 s) rồi bắn lần lượt mọi người chưa về đích
(tổng ~3,2 s, mỗi phát tối đa 220 ms, khiên không đỡ được), xong mới hiện TOP SỐNG SÓT (chỉ người về đích).

## Nhân vật

16 kiểu (6 thường + 10 ngộ nghĩnh: bé mập kính tròn, anh tóc xù, bà cụ búi tóc, anh cơ bắp mohawk, bé nơ hồng,
ông râu bạc, cô tóc tết, cô lô cuốn tóc, cậu tóc xanh tai nghe, bé mũ len). Mỗi kiểu có 2 tư thế đứng im khác nhau
(người chơi số chẵn/lẻ dùng tư thế khác nhau), số được vẽ lên miếng vải sau lưng; vừa vào chơi hiện huy hiệu số to 2,4 giây.


## Búp bê hát = đèn xanh (11/2026)

- Câu hát "Mu-gung-hwa kkot-chi pi-eot-seum-ni-da" (public/assets/redlight/song.m4a, 5,15 giây, cắt từ câu đầu của file người dùng gửi)
  chia 10 chữ theo phổ âm (src/modes/redlight/song.js). Mỗi lần đèn xanh, server chọn tốc độ cho từng chữ (0,55×–2×) theo kiểu:
  đều đều / chậm → nhanh / nhanh → chậm / thất thường / ngẫu nhiên. Câu hát dài 2,6–9 giây tuỳ kiểu.
- 2 giây cuối câu là đèn vàng (búp bê bắt đầu quay đầu); hát xong là đèn đỏ.
- Màn hình phát lại theo mốc + tốc độ server gửi, khớp đồng hồ server (vào giữa chừng tự nhảy đúng chỗ), giữ cao độ giọng.
- Trang quản lý: bật/tắt "Búp bê hát làm đèn xanh", kiểu hát mặc định, và 4 nút "Lần hát sau: …" (đổi một lần).
- Búp bê chỉ quay đầu: thân nhìn từ sau giữ nguyên, đầu ghép từ 5 góc xoay.
- Nhạc dừng mà vẫn thả tim: trong ân hạn riêng của người đó (3–9 giây theo độ trễ đo được) chỉ hiện chạy tại chỗ,
  bước dồn lại cho đèn xanh sau; quá ân hạn thì búp bê khoá tia vào, người đó nháy đỏ 1,2 giây rồi lính bắn.
  Mỗi lần nháy đỏ chắc chắn là một phát bắn (server gửi `rl.fx spotted`, hết 1,2 giây mới loại).
- Bình luận lúc đèn đỏ không bị tính là cử động. Mỗi lần bắt lỗi đèn đỏ (người thật) ghi vào `DATA_DIR/redlight-fairness.log`.
- Cân lại theo câu hát: tốc độ 3,8 bước/giây, tối đa 10 bước/gói tim, dồn tối đa 22 bước → người thả tim hết công suất,
  dừng khi búp bê quay đầu, trễ 1–4,5 giây về đích ~64–67 giây / ván 90 giây; thả tim bất chấp vẫn bị loại 100%.


## Độ trễ thả tim — kiểm tra bằng mã game thật (11/2026)

Mô phỏng chạy thẳng `src/modes/redlight` với đồng hồ ảo, 60 người xem ảo: thấy hình trễ 1–6 s, phản xạ 0,3 s,
tim gộp gói 1,2 s như LikeBatcher, mạng 0,5 s. Không còn chữ báo đèn: người cẩn thận dừng ngay khi THẤY câu hát dứt.

| Luật | trễ 1–2 s | 2–3 s | 3–4 s | 4–5 s | 5–6 s | thả tim bất chấp |
|---|---|---|---|---|---|---|
| Ân hạn cố định 4 s | an toàn | 45% bị loại oan | 100% bị loại oan | 100% | 100% | bị bắt 100% |
| **Ân hạn theo từng người** | an toàn | an toàn | an toàn | an toàn | 5% | bị bắt 100% |

Ân hạn theo từng người: mỗi lần đèn xanh, server đo từ lúc xanh tới khi gói tim đầu tiên của người đó về
(= trễ hình + gộp tim + mạng). Ân hạn = trung vị 5 lần gần nhất + 1,5 s, trong khoảng 3–9 s (chưa đo được thì
dùng `redGraceMs`). Người thả tim liên tục thì đo ra rất nhỏ nên vẫn bị bắt. Đèn đỏ 6–9 s, tốc độ 4,4 bước/s:
người thả tim hết sức, dừng đúng lúc về đích ~65–68 s / ván 90 s ở mọi mức trễ.

## Hiệu quả quà (đo trên mã thật, người tặng trễ 3 s, 40 ván mỗi quà)

Thời gian về đích gần như không đổi với mọi quà (về đích theo từng đợt đèn xanh); khác biệt nằm ở THỨ HẠNG.

| Quà (xu) | Kỹ năng | Hạng tăng (cẩn thận / ẩu) | Ảnh hưởng người khác |
|---|---|---|---|
| Hoa hồng / Heart Me (1) | +6 / +4 bước | ≈0 / ≈1 | — |
| Finger Heart (5) | khiên 1 lần | chỉ có ích khi lỡ tay | — |
| Kem (1) / Gift Box (1) / Teddy (10) | 1 / 2 / 3 bản sao | chỉ có ích khi lỡ tay | — |
| GG (1) | 1 người dẫn đầu chậm 5 s, sau đó miễn 20 s | ≈0 | nhẹ |
| Perfume (20) | khổng lồ 8 s (tim ×2) | +1,3 / +4,5 | — |
| Donut (30) | đẩy 5 người dẫn đầu lùi 10 bước, mỗi người miễn 10 s | +1,1 / +4,4 | 5 người lùi ~2 s |
| Mũ & ria (99) | khổng lồ 15 s | +1,8 / +6,8 | — |
| Confetti (100) | khiên cho 10 người gần + người tặng | — | có lợi |
| Hand Hearts (100) | lính bắn 2 người đang chạy | — | 2 người bị loại |

Trước khi cân lại: Heart Me (1 xu) giết 3 người — đã đổi thành chạy nhanh; "lính bắn" chỉ còn ở Hand Hearts (100 xu).

## Bảng kỉ lục

Màn chờ hiện BẢNG KỈ LỤC (top 5 tổng qua các ván, lưu theo phòng): về đích +3 điểm, hạng 1/2/3 thêm 3/2/1,
kèm số lần về đích và số lần top 3. Kết quả ván hiện TOP SỐNG SÓT trên cùng khung cúp (Scenario).


## Tham gia, hàng chờ, kỉ lục (11/2026)

- Tham gia: bình luận hoặc thả đủ `queueLikes` tim (mặc định 50). Lúc chờ ván: đủ tim là vào sân ngay.
  Đang chơi / xem kết quả: bình luận hay thả tim đều tính vào hàng chờ; đủ tim thì đứng ở HÀNG CHỜ VÁN SAU
  (dưới thanh kỹ năng, đứng dãn đều để đọc tên), ván mới vào sân theo thứ tự đủ tim. Tặng quà vẫn vào ngay.
- Kỉ lục: 10 thời gian về đích nhanh nhất (mỗi người một dòng, lưu theo phòng) đứng thành hàng sát chân tường dưới
  tán cây, trái → phải, trên đầu có tên và số giây; phá kỉ lục thì chen vào đúng chỗ (hiệu ứng "KỈ LỤC MỚI").
- Sau trận chỉ hiện bảng kết quả ván vừa rồi (top 5 + số người sống sót); lúc chờ không hiện bảng.
- Dòng chữ chạy trên thanh kỹ năng: cách tham gia, luật cơ bản, và một câu cho mỗi quà → kỹ năng (kèm ảnh quà).
