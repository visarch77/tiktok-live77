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

**Chờ đủ 2 đội**: hết giờ chờ chỉ bốc thăm khi có ít nhất 2 đội "có người" (≥ `minTeamPlayers` người thật, mặc định 1).
Chưa đủ: nếu bật `aiShow` (mặc định) thì người máy **tự kéo biểu diễn** một trận (không tính điểm, người xem vẫn vào đội được);
đang biểu diễn mà đủ 2 đội thì trận rút còn 5 giây ("ĐỦ 2 ĐỘI!"), về phòng chờ 10 giây rồi vào giải thật. Tắt `aiShow` thì cứ chờ thêm 15 giây.

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

## Thả tim liên tục + combo
Cách chơi đúng là **thả tim liên tục suốt trận**. Thể lực tụt chậm (0,01 / tim) và vẫn hồi 0,004 mỗi nhịp ngay cả lúc đang kéo, nên thả vừa phải không bao giờ mệt, dồn hết cỡ cả trận mới hơi đuối về cuối (kiệt sức chỉ 1,2 giây). **Combo**: thả không ngừng (không hở quá 2 giây) thì lực tăng dần tới ×1,5 sau 10 giây, ngừng là mất; hiện 🔥×1,2…×1,5 dưới thanh thể lực. Màn hình nhắc "❤️ THẢ TIM LIÊN TỤC ĐỂ KÉO!" ngay dưới đồng hồ, giọng đọc nhắc lúc bắt đầu, giữa trận và lúc im ắng.

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
| Sunglasses | 199 | 🍌 Vỏ chuối | Giật dây 0,15 về phía mình + 3 người đầu phe kia trượt ngã 1,5 s | Găng keo chặn phần ngã |

- Cùng loại không cộng dồn: gia hạn, tối đa 2 lần thời lượng. Giật dây tối đa 0,3 / 10 s mỗi đội. Một gói quà tối đa 3 lần dùng.
- **Để dành**: tặng khi đội mình chưa ra sân → cất vào túi đội (tối đa 6), tự dùng lần lượt mỗi 3 s khi đội ra sân.
- **Khán giả tiếp sức**: người đội đã bị loại / phòng chờ tặng quà lúc đang kéo → kỹ năng giúp đội đang thua.
- Không có giải thưởng tiền; quà chỉ là hiệu ứng trong game.

## Màn hình

Bố cục chừa chỗ cho giao diện TikTok LIVE: hai lề 72 px; trên cùng ~180 px (tên chủ phòng, người xem) và từ ~1340 trở xuống
(khung bình luận, nút quà) để trống / chỉ đặt chữ phụ.

| Vùng (y) | Nội dung |
| :--- | :--- |
| 184–330 | Tên giải + đồng hồ, sơ đồ BK1 · BK2 · CK |
| 338–398 | **Thông báo đội ở giữa**: "🔥 BÁN KẾT 1: ĐỘI … vs ĐỘI …" + trận tiếp theo / tin vào đội (băng quà đè lên 2,6 s) |
| 406–476 | **Thanh tiến độ kiểu thanh máu**: khung tối viền neon, hai nửa màu đội đặc (dải bóng mảnh), vệt sáng "vừa mất" bám theo khi dây trôi, tia điện ở chỗ giáp ranh, sóng năng lượng từ đội mạnh hơn, mốc 25/50/75%, nút dây chia đôi màu hai đội, đội sát mép vực nháy đỏ "⚠ NGUY HIỂM"; % (đội mạnh hơn màu vàng) + tên đội trong thanh |
| 484–640 | **Đồng hồ đếm ngược số to** ở giữa (số nảy mỗi giây; 10 giây cuối đỏ, rung, tích tắc; phút chót màu cam); hai bên: tên đội, số người (+🤖), 👑 người kéo khoẻ nhất; thẻ kỹ năng bật lên ở hai bên |
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

## Âm nhạc

- **Chờ giải / bốc thăm / vinh danh**: 2 bản nhạc chờ của phòng Squid (`assets/redlight/lobby_1.m4a`, `lobby_2.m4a`), đổi bài theo số giải,
  vào/ra nhỏ dần.
- **Lúc kéo**: hành khúc "ùm-pa" tự tạo bằng WebAudio (không dùng file, không dính bản quyền) — Đô trưởng 8 ô nhịp lặp: tuba "ùm" phách 1–3,
  hợp âm "pa" phách 2–4, kick + snare + hi-hat, giai điệu kiểu kèn kazoo (sawtooth có rung qua lọc dải), còi trượt hoạt hình cuối mỗi 4 ô.
  10 giây cuối: 128 → 156 BPM và lên 2 cung; dây sát mép vực: thêm nốt trầm rung dồn dập. Âm lượng theo "Âm lượng nhạc nền", tắt theo "Nhạc chờ".

- **Tiếng sân lúc kéo** (giọng hoạt hình = sóng răng cưa qua 2 bộ lọc nguyên âm): dây cót két (dày hơn khi căng), thở "hộc hộc" theo số
  người đang gồng / kiệt sức, giày rít + chà sàn khi một đội bị lôi, đám đông hô "HÒ… DÔ!" (dày hơn khi có Hò dô), "hự!" mỗi khi
  bong bóng hét bật lên. **Hết trận**: đội thua la thất thanh "Aaaaa…" rơi xuống vực rồi "bộp", còi trượt xuống; đội thắng hò "Yeee!".

**Nhạc lúc kéo** — mặc định nhẹ, nhịp vừa, đỡ mệt khi lặp cả buổi live. Cài đặt "Nhạc lúc kéo": Nhạc thật (mặc định) dùng MP3 trong `public/assets/keoco/music/` — `pull_main`, `pull_main_2`, `pull_main_3` (mỗi trận một bài), `pull_tense` (tuỳ chọn, dây sát mép vực), `pull_final` (10 giây cuối), `win` (~6 giây đầu khi hết trận); chuyển bài bằng mờ dần. Thiếu `pull_main` thì dùng bản **Vừa phải** tự tạo: 3 bản (La thứ 104 BPM pluck, Mi thứ 108 marimba, Rê 100 pizzicato) đổi theo trận, giai điệu biến tấu mỗi vòng, có ô nhịp nghỉ, 10 giây cuối chỉ thêm chút trống. Bản Kịch tính / Hài vẫn chọn được. Tạo nhạc bằng Suno/Udio: `design/keoco-music/HUONG-DAN.md`.
Tiếng sân thưa và nhỏ: dây kêu thưa, thở/giày rít thưa hơn, đám đông chỉ hô khi có Hò dô hoặc dây căng thật, tiếng "hự" ≥ 3 giây một lần. Bình luận: kỹ năng cách ≥ 3 s, tình huống ≥ 12 s, im ắng 15 s mới chen, không lặp câu vừa đọc, một kỹ năng của cùng đội dùng liên tục chỉ bình luận lần đầu trong 15 s.

## Tiếng nhân vật (thu sẵn) — `public/assets/keoco/voice/`
72 câu kêu ngắn (2 MB) tạo bằng 8 giọng đọc tiếng Việt của ZeroTTS rồi nâng giọng ×1,3 kiểu hoạt hình (`tools/keoco-voices.py`, chạy lại khi muốn đổi câu). Theo loại: dùng từng kỹ năng, trúng cù lét / mỡ / xì hơi / vỏ chuối, bị chặn, mệt, bị lôi, gồng sức ("Hự!"), rơi vực ("Á á á", giọng tụt dần), thắng, "Hò dô". Phát lệch tốc độ nhẹ mỗi lần, cách nhau ≥ 0,7 s, tối đa 2 câu cùng lúc, mỗi loại có khoảng nghỉ riêng. Thiếu file thì quay về giọng tổng hợp cũ.

## Cấp độ & danh hiệu (dùng chung mọi trò) — `src/core/titles.js`, `public/js/name-style.js`
Tính từ bảng điểm người xem của phòng (lưu qua các buổi live, giữ khi chuyển trò). Người ảo (thử) ghi vào bảng riêng không lưu.
- **Cấp** theo XP = ván ×10 + thắng ×30 + lên bục ×20 + MVP ×30 + vô địch ×80 + xu quà ×5: 1 Tân binh (trắng) · 2 Đồng 150 (đồng ánh cam) · 3 Bạc 500 (bạc sáng) · 4 Vàng 1500 (vàng + vệt sáng chạy) · 5 Bạch kim 4000 (xanh băng + vệt sáng + toả sáng) · 6 Kim cương 10000 (lam–tím–hồng đổi màu + toả sáng + lấp lánh) · 7 Huyền thoại 25000 (cầu vồng chạy + toả lửa + lấp lánh + 👑).
- **Danh hiệu** theo việc làm nhiều nhất, 3 bậc (★★, ★★★): chung — 💎 Đại gia (xu 100/1000/10000), 🏆 Nhà vô địch (đội vô địch Kéo Co 3/10/30 giải), 🏅 Chiến thần (thắng 10/50/200), 🎖️ Lão làng (ván 20/100/400) — ba cái này chỉ đeo khi chưa có danh hiệu vui cùng bậc, 💨 Vua xì hơi; Đèn Đỏ — 👟 Vua tốc độ (quà chạy nhanh 5/25/100), 🙌 Vua trượt tay (lỡ tay thả tim lúc đèn đỏ bị bắn 5/25/100), 🙏 Vua hồi sinh (tặng hồi sinh 3/15/60), 🐱 Mạng mèo (được hồi sinh), 😱 Vua sợ die (khiên / bản sao / khiên đội 5/25/100), 🏁 Vua về đích, 🥇 Vua về nhất, 🤚 Vua đẩy người, 📢 Vua loa phường, 💪 Vua khổng lồ, 🦶 Vua dẫm đạp; Kéo Co — 💪 Thánh gồng, 🧃 Ông chủ nước tăng lực, 🪶 Thánh cù lét, 🧤 Bàn tay keo, 📣 Fan cứng, 🧈 Thánh bôi mỡ, 🏋️ Bầu sô lực sĩ, 🥁 Thủ lĩnh hò dô, 🍌 Vua vỏ chuối, 🪢 Vua kéo co (MVP), 🧈 Vua tuột tay (bị bôi mỡ), 🤣 Người nhột nhất, 🤸 Vua té oạch, 😮‍💨 Vua hụt hơi. Mốc thường 10 / 50 / 200 lần.
- Đeo danh hiệu cao nhất (dòng chữ nhỏ trên tên, màu theo cấp). Đạt cấp / danh hiệu mới: dòng chúc mừng giữa màn hình + tiếng "ting" + đọc "Chúc mừng … đạt danh hiệu …" (≥ 4 giây một lần).

## Đèn Xanh – Đèn Đỏ: tình huống ngẫu nhiên
Lúc đèn xanh, cứ trung bình `mishapEverySec` giây (mặc định 20, lệch ±30%) chọn một người thật đang chạy (đã chạy được một đoạn, mỗi người tối đa 1 lần / ván) dính một tình huống, bốc theo tỉ lệ `mishapW_<loại>` (0–10, 0 = tắt): 🥵 say nắng (lùi 6 đơn vị + choáng 1,4 s, sao xoay trên đầu), 🐦 chim ị (hên: lao thêm 5), 🐝 ong đốt (tự chạy nhanh ×2 trong 2,2 s), 💵 nhặt tiền (đứng 1,5 s), 🤧 hắt xì (lùi 3). Không làm ai bị bắn (lùi / đứng yên không tính là cử động). Có chữ to + biểu tượng trên đầu, tiếng hiệu ứng + câu kêu hoạt hình, giọng bình luận, danh hiệu Vua say nắng / Vua hên / Vua bị ong đốt / Vua nhặt tiền / Vua hắt xì. Trang quản lý: 5 nút gọi ngay một tình huống + công tắc + thanh tỉ lệ.

## Chuyển trò trong phòng
Trang quản lý: ô 🎮 dưới tên phòng chọn trò (Đèn Xanh – Đèn Đỏ / Kéo Co …). Phòng khởi động lại với trò mới (giữ tên, TikTok, bảng xếp hạng; nối lại TikTok nếu đang live); màn hình OBS / điện thoại đang mở tự tải lại sang trò mới.

## Hiệu ứng kỹ năng

Mỗi lần dùng kỹ năng: **thẻ to** bên phía đội dùng (ảnh quà + tên kỹ năng + một câu nói rõ chuyện gì xảy ra, vd. "💨 THẢ BOOM! 5 người
đầu dây ĐỘI 3 · VÀNG choáng váng 2 giây"), kèm hiệu ứng riêng: Gồng (vòng sáng dưới chân + "×2"), Tăng lực (⚡ trên đầu 4 người),
Cù lét (🪶 + người đầu dây cười buông tay), Găng keo (keo xanh nhỏ giọt, vòng xanh quanh đội, 🧤), Cổ vũ (nốt nhạc, pháo giấy, 📣),
Bôi mỡ (mỡ nhỏ giọt, đoạn dây bóng vàng nhấp nháy, "TRƠN TUỘT!"), Lực sĩ (khói + "LỰC SĨ ĐẾN!" + lực sĩ to đứng kéo),
Thả boom (khói vàng bay sang + "BỦMMM", 💫), Hò dô ("HÒ!"/"DÔ!" luân phiên trên đội), Vỏ chuối (3 vỏ chuối bay vòng cung sang chân 3 người đầu phe kia, "vút – víuuu – oạch!", người trúng trượt ngã).
Đòn bị chặn: thẻ xanh "🧤 BỊ CHẶN!" + vòng khiên xanh quanh đội được bảo vệ.

Mỗi kỹ năng còn có **tiếng hiệu ứng riêng** (WebAudio tự tạo): gồng "ting-ting-boing", tăng lực "ực ực + lấp lánh", cù lét tiếng cười,
găng keo "nhóp nhép", cổ vũ kèn + đám đông, bôi mỡ "víuuu – bẹp", lực sĩ "BÙM + ta-da", thả boom xì hơi, hò dô hai tiếng trống lớn,
khổng lồ "ẦMMM", bị chặn "keng". Và **bong bóng thoại trên đầu nhân vật**: người dùng kỹ năng la lên ("GỒNGGG!! 💪", "Xin lỗi... 😳💨"),
người trúng đòn kêu ("Thối quá!! 🤢", "Ha ha ha nhột quá!", "Ai bôi mỡ vậy trời?!"), đội được găng keo bảo vệ đáp "Hụt rồi nhé! 😎".

## Bình luận viên — `src/modes/keoco/commentary.js`
Giọng đọc của phòng bình luận hài theo diễn biến (vi/en, nhiều câu chọn ngẫu nhiên, có tên người chơi):
- **Mỗi kỹ năng**: ai dùng, trúng ai. Ví dụ "Bủm! A xì hơi thật to, gió bay sang Đội 2, năm người choáng váng!", "B ném mỡ khiến cho Đội 1 tuột tay, trơn như lươn!", "C bị cù lét, cười sặc sụa…", "Đội 3 được lực sĩ đi ngang qua tiện tay kéo dùm!", "A đã đầu tư găng tay keo, Đội 1 kéo cứng ngắc!", "A gồng ẻ, gân cổ nổi lên như dây điện!". Bị găng keo chặn, quà để dành cũng có câu riêng.
- **Tình huống**: người chơi thật hết hơi, đội bị lôi sát mép vực (|x| > 0,65), lội ngược dòng (về lại |x| < 0,15), 10 giây cuối, lúc im ắng > 7 s thì khen người kéo khoẻ nhất / chọc đội kéo yếu / "giằng co", hết trận "Đội X rơi tõm xuống vực!".
- **Không dồn giọng**: câu kỹ năng cách nhau ≥ 3 s, câu tình huống ≥ 12 s; dư thì bỏ (nhiều quà cùng lúc chỉ đọc câu đầu).

## Chơi thử (trang quản lý → 🎮 Chơi thử, chỉ khi chưa live)

Chọn đội 1–4 → thêm 1 / 5 người vào đúng đội, cả đội thả tim mạnh 10 giây, bấm từng quà để thử kỹ năng (đội chưa ra sân thì để dành),
bắt đầu giải ngay / trận AI biểu diễn / kết thúc trận / về phòng chờ; ô trạng thái cho biết pha, số đội đủ người, tình trạng đội đang chọn.
Cài đặt chỉnh được: thời gian chờ, thời gian mỗi trận, số người tối đa mỗi đội (1–20), số người tối thiểu để đội "có người",
AI tự đấu khi vắng, người máy lấp chỗ, tự chạy giải liên tục.

## Trò của người điều phối (trang quản lý)

Dây đứt (cả hai đội ngã, 2 s nối lại) · Trọng tài ngủ gật (4 s kéo không tính) · HÒ DÔ! (3 s mọi tim ×1,3) · Kết thúc trận ·
Tạm dừng · Về phòng chờ · Thêm người thử / Tặng quà thử (chỉ khi chưa live).
