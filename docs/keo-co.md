# Kéo Co 4 Đội — thiết kế luật chơi

Chế độ `keoco` (`src/modes/keoco/`, màn hình `public/keoco.html` + `public/js/keoco.js`), chạy độc lập với Đèn Xanh – Đèn Đỏ:
tạo phòng mới trong trang quản lý và chọn chế độ "Kéo Co 4 Đội".
Mỗi giải: 4 đội → 2 trận bán kết (bốc thăm ngẫu nhiên) → chung kết → vô địch. 10–20 người mỗi đội kéo cùng lúc.
Không tặng quà vẫn thắng được bằng thả tim **đều tay**; quà (kỹ năng) cho lợi thế rõ nhưng ngắn và có cách khắc chế.
Thua là bị kéo tuột xuống vực (hoạt hình, không máu me).

## Vòng chơi

| Pha | Thời gian (mặc định) | Diễn ra |
| :--- | :--- | :--- |
| `lobby` | 35 s (đủ 24 người thì rút còn 10 s) | Bình luận số đội để vào; đổi đội được |
| `draw` | 4,5 s | Bốc thăm: BK1 = 2 đội ngẫu nhiên, BK2 = 2 đội còn lại |
| `intro` | 4,5 s | Giới thiệu trận, đếm 3‑2‑1 |
| `pull` | 45 s | Hai đội thả tim để kéo. Dây qua vạch (\|x\| ≥ 1) là thắng ngay; hết giờ thì bên được lợi thắng; hoà sát vạch (\|x\| < 0,05) thêm 10 s phút chót |
| `matchEnd` | 6 s | Đội thua tuột xuống vực, đội thắng nhảy mừng, đọc tên người kéo khoẻ nhất |
| `champion` | 12 s | Cúp, tên đội vô địch, 3 lực sĩ của giải |

Thứ tự: BK1 → BK2 → Chung kết (2 đội thắng bán kết) → vinh danh → phòng chờ giải mới.

## Vào đội & chia đội công bằng

- Bình luận `1` `2` `3` `4`, "đội 2", "team 3", "đỏ" / "xanh" / "vàng" / "tím" (màu phải có dấu; "tim" không dấu là thả tim).
  Bình luận khác / thả tim / tặng quà khi chưa có đội → vào đội vắng nhất.
- Mỗi đội tối đa `teamMax` (20) người thật. Được vào đội muốn nếu đội đó **không đông hơn đội vắng nhất quá 2 người**;
  không thì tự sang đội vắng nhất (bằng nhau: đội có lực trung bình thấp hơn, để chia đều người kéo khoẻ) — màn hình báo
  "Đội 1 đầy → vào Đội 3".
- Đổi đội chỉ lúc chờ giải. Đang giải: người mới vào được các đội **chưa bị loại** (kể cả đội đang kéo — "viện binh" vào cuối hàng);
  hết chỗ thì vào **phòng chờ giải sau** (hiện số người chờ). Hết giải, phòng chờ vào đội; ai im lặng quá 6 phút thì rời đội.
- Hai đội lệch quá 4 người thật lúc vào phòng chờ: người vào sau cùng của đội đông được chuyển sang đội vắng (có báo).
- **Người máy 🤖** lấp mỗi bên trên sân tới `max(số người thật bên đông hơn, npcMin)`; kéo bằng 55% người chơi thật, có 🤖 trên đầu.
  Nên đông hơn không thắng chắc — kéo đều tay mới quyết định.

## Công thức kéo

Nhịp server 100 ms (`dt = 0,1 s`).

**1. Tim → lực từng người.** Tim (TikTok gửi theo gói `count`) cộng vào `buffer` (tối đa 6, không tích trữ được).
Mỗi nhịp dùng `use = min(buffer, 0,6)` (trần ≈ 6 tim/giây). Bình luận lúc đội mình kéo = 2 tim (tối đa 1 lần / 1,5 s).

```
lực_i = use × thể_lực_i × (Gồng ? 2 : 1) × (Hò dô ? 1,5 : 1) × (Bôi mỡ ? 0,5 : 1) × (HÒ DÔ trọng tài ? 1,3 : 1) × (người máy ? 0,55 : 1)
thể_lực_i = 0,3 + 0,7 × stamina   (stamina ≤ 0,15: hụt hơi, 0,3)
```

**2. Thể lực — kỹ năng không cần quà.** `stamina ∈ [0, 1]`.
- Mỗi tim dùng: `−0,028` (Hò dô: không tốn). Nhịp không kéo: `+0,05` (Cổ vũ: ×2).
- Về 0 → **kiệt sức** 2 s (ngồi phịch, lực 0), rồi còn 0,3.
- Mô phỏng (`tools/keoco-sim.js`): người thả đều ~4 tim/s góp ≈ 30 đơn vị lực/nhịp-trung-bình, người spam 9 tim/s chỉ ≈ 23
  → đội đều tay thắng đội spam phần lớn trận; đội chăm (4 tim/s) thắng đội lười kể cả khi ít người hơn.

**3. Lực đội.**

```
F_đội = Σ lực_i / N^0,6 × (1 + 0,25 × tỉ lệ người đang kéo)  (+ Lực sĩ: 4 × 0,3 / N^0,6)
```

N^0,6: gấp đôi người chỉ mạnh hơn ~32% nếu ai cũng kéo như nhau; cả đội cùng kéo một lúc thưởng tới 25%.

**4. Dây.** `x ∈ [−1, 1]` (âm = về phía đội bên trái).

```
v = 0,82·v + (F_trái − F_phải) × 0,17 × 0,18     (ổn định ở v = chênh lực × 0,17 đơn vị/giây)
x = x − v·dt
```

- **Gồng chân lúc nguy**: bên đang bị kéo khi `|x| > 0,6` được lực × `1 + 0,6·(|x| − 0,6)/0,4` → cuối trận vẫn lật kèo được.
- Đội mạnh hơn 30% thắng từ giữa sân sau ≈ 20 giây; hai đội ngang nhau thường kéo hết giờ.

**5. Điểm.** Điểm cá nhân = lực đã kéo (đội thắng +20%), đội vô địch +10. MVP trận / giải = người góp nhiều lực nhất.

## Kỹ năng (quà) — `src/modes/keoco/skills.js`

| Quà | Xu | Kỹ năng | Hiệu ứng | Khắc chế |
| :--- | ---: | :--- | :--- | :--- |
| Rose | 1 | 💪 Gồng | Bản thân kéo ×2 trong 3 s + hồi 30% thể lực | — |
| Ice Cream | 1 | 🧃 Tăng lực | Hồi đầy thể lực mình + 3 người cạnh | — |
| GG | 1 | 🤭 Cù lét | Người đầu dây phe kia cười, buông tay 1,5 s | Găng keo |
| Finger Heart | 5 | 🧤 Găng keo | Cả đội miễn đòn tấn công 6 s | — |
| Friendship Necklace | 10 | 📣 Cổ vũ | Cả đội hồi thể lực ×2 trong 8 s | — |
| Doughnut | 30 | 🧈 Bôi mỡ | Phe kia lực ×0,5 trong 4 s | Găng keo |
| Hat & Mustache | 99 | 🏋️ Lực sĩ | Lực sĩ vào kéo 8 s (≈ 4 người) | — |
| Hand Hearts | 100 | 💨 Thả boom | 5 người đầu phe kia choáng 2 s | Găng keo |
| Confetti | 100 | 🥁 Hò dô | Cả đội ×1,5, không tốn thể lực 6 s | — |
| Sunglasses | 199 | 🦶 Khổng lồ dẫm | Giật dây 0,15 về phía mình + 3 người phe kia ngã 1,5 s | Găng keo chặn phần ngã |

- Cùng loại không cộng dồn: gia hạn, tối đa 2 lần thời lượng. Giật dây tối đa 0,3 / 10 s mỗi đội. Một gói quà tối đa 3 lần dùng.
- **Để dành**: tặng khi đội mình chưa ra sân → cất vào túi đội (tối đa 6), tự dùng lần lượt mỗi 3 s khi đội ra sân.
- **Khán giả tiếp sức**: người đội đã bị loại / phòng chờ tặng quà lúc đang kéo → kỹ năng giúp đội đang thua.
- Không có giải thưởng tiền; quà chỉ là hiệu ứng trong game.

## Màn hình

Bố cục chừa chỗ cho giao diện TikTok LIVE: hai lề 48 px; trên cùng ~180 px (tên chủ phòng, người xem) và từ ~1340 trở xuống
(khung bình luận, nút quà) để trống / chỉ đặt chữ phụ.

| Vùng (y) | Nội dung |
| :--- | :--- |
| 184–330 | Tên giải + đồng hồ, sơ đồ BK1 · BK2 · CK |
| 338–398 | **Thông báo đội ở giữa**: "🔥 BÁN KẾT 1: ĐỘI … vs ĐỘI …" + trận tiếp theo / tin vào đội (băng quà đè lên 2,6 s) |
| 406–476 | **Thanh đỏ–xanh gộp %**: % + tên đội trong thanh, nút dây 🪢 có lửa 3 lớp + quầng nóng + tàn lửa, thanh nảy theo độ căng, giật khi % đổi mạnh |
| 484–640 | Cận cảnh hai người đầu dây; hai góc: số người (+🤖), 👑 người kéo khoẻ nhất |
| 640–720 | Dải bình luận (3 hàng) có đường chỉ xuống tên trên đầu |
| 745–880 | Sân kéo |
| 896–990 | **Hàng ảnh quà TikTok** ngay dưới sân (ảnh quà trên, tên kỹ năng dưới) |
| 1002–1332 | 4 thẻ đội |
| 1346+ | Cách vào đội, phòng chờ (chữ phụ, có thể bị khung bình luận che) |

- **Giữa**: tường = chữ lớn (KÉO!, đếm ngược, đội thắng) + bảng trực tiếp mỗi đội (% lực, số người + 🤖, 👑 người kéo khoẻ nhất,
  mũi tên dây đang về phía nào); hai tháp = hai đội 2 hàng so le nắm một sợi dây thẳng, dải băng đỏ giữa dây, vạch giữa vực.
- **Người chơi**: tay mọi người luôn nằm trên một sợi dây liền (dây võng trong vực, rung khi hai đội cùng kéo căng);
  mỗi người lắc lư liên tục quanh điểm nắm dây (nhịp riêng), run bần bật khi gồng. Tư thế chọn theo trạng thái + diễn biến dây
  + "tính cách" riêng, giữ 0,5–1,2 s cho đỡ giật: kéo A/B, gồng, **cắn dây**, **ngả tấm ván** (đang thắng), **bị lôi ngã ngửa**
  (đầu dây khi dây trôi về phía đối thủ), **ngồi bấm gót** (sát mép vực / kiệt sức / nghỉ tay), ngã, cười (cù lét), choáng.
  Kèm bụi dưới chân, mồ hôi văng, tiếng hét kiểu truyện tranh ("CỐ LÊNNN!", "MẸ ƠI!"…), thanh thể lực dưới chân người thật,
  tên 3 người kéo khoẻ nhất mỗi bên, bong bóng bình luận, emoji kỹ năng vừa dùng.
- **Cận cảnh đầu dây**: giữa hai bảng lực, hai người đầu dây phóng to đối mặt nhau (cùng tư thế với trên sân) — thấy rõ mặt.
  choáng (💫); thanh thể lực dưới chân người thật; tên 3 người kéo khoẻ nhất mỗi bên, bong bóng bình luận, emoji kỹ năng vừa dùng.
- **Dưới**: lượt đấu ("ĐANG KÉO …", "Tiếp theo …", tin vào đội gần nhất) → 4 thẻ đội (số người/20, trạng thái CHỜ LƯỢT / ĐANG KÉO /
  VÀO CHUNG KẾT / BỊ LOẠI / VÔ ĐỊCH, "TRẬN TIẾP THEO — sẵn sàng!" hoặc "còn N trận nữa", top 5 người kéo, kỹ năng để dành, số cúp)
  → cách vào đội + phòng chờ → bảng 10 kỹ năng.
- Ảnh: nền `assets/keoco/bg.webp`; 31 nhân vật + lực sĩ × 5 tư thế + 4 tư thế hài (bị lôi, cắn dây, bấm gót, tấm ván — 28 nhân vật; 3 nhân vật nhảy + lực sĩ
  dùng tư thế gần nhất) vẽ bằng GPT Image qua Scenario, gộp thành 4 atlas
  `atlas_t1..4.webp` (băng đô đổi màu theo đội) + `atlas.json` (khung + điểm nắm dây).

## Trò của người điều phối (trang quản lý)

Dây đứt (cả hai đội ngã, 2 s nối lại) · Trọng tài ngủ gật (4 s kéo không tính) · HÒ DÔ! (3 s mọi tim ×1,3) · Kết thúc trận ·
Tạm dừng · Về phòng chờ · Thêm người thử / Tặng quà thử (chỉ khi chưa live).
