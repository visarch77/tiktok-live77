# Tạo nhạc trận Kéo Co bằng AI làm nhạc (Suno / Udio)

Hướng nhạc: **vui, nhẹ, nhịp vừa phải, nghe lâu không mệt** — làm nền cho tiếng bình luận và tiếng sân, không lấn át. Mỗi trận chỉ ~45 giây và lặp liên tục cả buổi live, nên cần **nhiều bài nền thay phiên** để đỡ nhàm.

| Tên file | Phát khi nào | Bắt buộc? |
|---|---|---|
| `pull_main.mp3` | Nền trận kéo (bài 1) | Có |
| `pull_main_2.mp3` | Nền trận kéo (bài 2) — mỗi trận game đổi bài | Nên có |
| `pull_main_3.mp3` | Nền trận kéo (bài 3) | Nên có |
| `pull_final.mp3` | 10 giây cuối — nhỉnh hơn một chút, không dồn dập | Tuỳ chọn |
| `win.mp3` | Hết trận (game chỉ dùng ~6 giây đầu) | Tuỳ chọn |

Ba bài nền nên **khác nhau rõ** (khác nhạc cụ chính) nhưng cùng tâm trạng. Thiếu file nào game dùng nhạc tự tạo thay vào, nên có thể làm dần.

## Cách làm trên Suno
1. suno.com → **Create** → bật **Custom** và **Instrumental** (không lời).
2. Ô **Style of Music**: dán nguyên văn đoạn tiếng Anh bên dưới. Ô **Title**: tên file tương ứng.
3. Suno ra 2 bản mỗi lần: chọn bản **vào nhạc ngay**, nhịp đều, **không có đoạn bùng nổ hay đổi nhịp đột ngột** (vì nhạc lặp liên tục).
4. ⋯ → **Download → MP3**, đổi tên đúng bảng trên, gửi cho mình.

> Bản quyền: dùng gói Suno **trả phí** thì được dùng nhạc khi live có nhận quà. Gói miễn phí không cho dùng thương mại.

---

### `pull_main.mp3` — bài 1: nhẹ nhàng nghịch ngợm
```
light playful game show background music, 105 BPM, instrumental, no vocals, starts immediately, plucky pizzicato strings, soft marimba, gentle bouncy bass, light shaker and soft claps, cheerful but slightly suspenseful, relaxed, not intense, steady groove, background music for commentary, loop friendly
```

### `pull_main_2.mp3` — bài 2: vui tươi kiểu hoạt hình
```
cheerful cartoon sports background music, 108 BPM, instrumental, no vocals, starts immediately, ukulele and glockenspiel, whistle accents, soft kick drum, warm upright bass, friendly competition, lighthearted, not dramatic, easy to listen to for a long time, loop friendly
```

### `pull_main_3.mp3` — bài 3: lo-fi thư giãn có chút hồi hộp
```
chill lo-fi game background music, 100 BPM, instrumental, no vocals, starts immediately, mellow electric piano, soft vinyl drums, round synth bass, light ticking percussion, calm curiosity, gentle tension, unobtrusive, loop friendly
```

### `pull_final.mp3` — 10 giây cuối (tuỳ chọn)
```
light upbeat game show countdown music, 110 BPM, instrumental, no vocals, starts immediately, pizzicato strings and marimba, ticking clock, a little more energy, playful anticipation, not aggressive, no heavy drums
```

### `win.mp3` — thắng trận (tuỳ chọn)
```
short cheerful victory jingle, xylophone and brass, light cymbal, happy, instrumental, no vocals, starts immediately, cartoon game show win sound
```

## Trên Udio
Dán cùng đoạn mô tả, bật **Instrumental**, độ dài 2 phút trở lên, tải MP3.
