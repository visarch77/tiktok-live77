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
  - bù nhìn rơm khổng lồ (quay đầu = đèn đỏ);
  - lính canh là trâu hoặc con cò;
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
| Tim / Heart Me | Gọi 3 "trâu" húc ngã ngẫu nhiên 3 người đang chạy | Không húc người có khiên |
| Hộp quà nhỏ | 5 bản sao chạy cùng (cùng tên, mờ hơn) | Bản sao chết thay chủ |
| Donut | Gió lốc: đẩy lùi 10 người dẫn đầu | |
| Mũ / Mặt người | Khổng lồ 10 giây: bước dài gấp 3, miễn bị húc | |
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
- **Bù nhìn khổng lồ** có hai trạng thái quay lưng và quay mặt. Pha ĐỎ có quạt sáng đỏ quét sân.
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
