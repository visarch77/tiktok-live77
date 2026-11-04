# Chế độ Lớp Học Chữ (`lophoc`)

Cô giáo áo dài đố chữ trên bảng đen; người xem gõ đáp án vào bình luận. Lõi game chép từ repo
[lop-hoc-chu](https://github.com/visarch77/lop-hoc-chu) (commit `caa8a41`, giấy phép MIT: `LICENSE-lop-hoc-chu`).

## Cấu trúc

| Đường dẫn | Là gì |
| :--- | :--- |
| `game/`, `live/` | Mã TypeScript của bản gốc, giữ gần như nguyên để dễ kéo bản cập nhật (luật, lời thoại, chấm điểm) |
| `game/cau-hoi/*.txt` | 2076 câu hỏi. Đọc lúc khởi động server, sửa xong chỉ cần bật lại server |
| `core-entry.ts` | Những gì server dùng từ lõi + đọc câu hỏi bằng `fs` (bản gốc dùng Vite) |
| `build.js` | esbuild đóng gói lõi thành `core.cjs` (tự sinh, không đưa lên git; `index.js` tự đóng gói khi thiếu / cũ) |
| `index.js` | Nối lõi với phòng live: sự kiện TikTok, giọng đọc (đồng hồ dừng khi cô đọc câu chính), sổ lớp, lệnh RPC |
| `edgeTts.js` | Giọng Edge TTS như bản gốc (`msedge-tts`): Hoài My / Nam Minh / Ana (tiếng Anh), mp3 lưu trong `tts-cache` |
| `game/GameStage.tsx`, `Hair.tsx`, `stage.css`, `sfx.ts`, `live/StageFrame.tsx` | Màn hình lớp học 2D của bản gốc (React + motion + Tailwind). Đường dẫn ảnh đã đổi `/assets/` → `/assets/lophoc/` |
| `stage/main.tsx`, `stage/index.css` | Màn hình phòng: nhận `lophoc.view` / `lophoc.speak` qua WebSocket, vẽ bằng GameStage, phát giọng + hiệu ứng |
| `public/assets/lophoc/` | Ảnh nền + nhân vật (thuộc tác giả lop-hoc-chu). Bỏ `sfx/<ting|drum|go|tick|bell|pop|clap|fanfare>.mp3` vào đây để thay tiếng tự tạo |

Khác bản gốc: game chạy trên **server** (bản gốc chạy trong trang stage), màn hình chỉ vẽ lại ảnh chụp `lophoc.view`.
Màn hình đóng gói sẵn vào `public/js/lophoc-stage.js`, `public/css/lophoc-stage.css`, `public/css/lophoc-tw.css` (có trong git):
sửa file `.tsx` / `.css` của màn hình thì chạy `npm run build:lophoc` (cần `npm install` để có React / Tailwind).

## Lệnh

```bash
npm run test:lophoc    # đóng gói + chạy quiz.check.ts và bank.check.ts của bản gốc
npm run build:lophoc   # đóng gói lõi + màn hình (thêm --core: chỉ lõi)
```

RPC (`lophoc.<tên>`): `newRound`, `skip`, `ban`, `unban {id}`, `birthday {name}`, `recess {game: rps|callup|pick|roll|heart}`,
`sayText {text}`, `setName {name}`, `getView`, `report {day?}`; thử khi chưa live: `testChat`, `testCrowd {count}`, `testGift`, `testLike {count}`.

Trang quản lý (`public/admin.html`, `MODE_UI.lophoc`): thẻ **🍎 Điều khiển lớp** (trạng thái câu đang hỏi, qua phần tiếp, tiết mới,
bỏ câu, ra chơi, chúc sinh nhật, cô nói ngay, tên lớp), thẻ **🧪 Thử tương tác** (bạn ảo, quà, tim).
Trang báo cáo: `/lophoc-bao-cao.html?room=<id>&ngay=YYYY-MM-DD` (câu không ai đúng, câu quá dễ, điểm cao, chuyên cần, câu đã bỏ + nút Hỏi lại).

Màn hình phát: `lophoc.view` (ảnh chụp lớp, tối đa 4 lần/giây) và `lophoc.speak` `{ url, text, who, durMs }`.

## Dữ liệu

- Sổ lớp (câu đã hỏi, câu bị bỏ, điểm tuần, điểm hôm nay, chuyên cần, tên lớp): trong trạng thái phòng `data/rooms/<id>.json`.
- Báo cáo từng câu: `data/lophoc/<id>/bao-cao/<ngày>.json`.

## Giọng đọc

Cài đặt phòng (thẻ ⚙️ trong trang quản lý): `voiceEngine` và `voiceRate`.

| `voiceEngine` | Tiếng Việt | Đoạn `E:` (tiếng Anh) | Tạo 1 câu |
| :--- | :--- | :--- | :--- |
| `edge` (mặc định) | Hoài My (`F:`), Nam Minh (`M:`); tốc độ `voiceRate` (mặc định 1,25 như bản gốc) | Ana (Mỹ) | ~1 giây, cần mạng |
| `zero` | Giọng ZeroTTS của phòng (Mai Chi) | Giọng Samantha của macOS (`redlight/tts-en.js`) | 5–15 giây |

Edge lỗi (mất mạng...) thì 60 giây tới tự đọc bằng ZeroTTS. Lúc hiện đáp án, server tạo trước giọng đọc đề câu kế tiếp
nên sang câu mới cô đọc liền (có ích nhất với ZeroTTS).

## Kéo bản cập nhật từ repo gốc

Chép đè `src/game/{quiz,config,loi-thoai,math,questions,*.check}.ts`, `src/game/{GameStage,Hair}.tsx`, `stage.css`, `sfx.ts`,
`src/game/cau-hoi/`, `src/live/{bannedWords,names,chatter,scoreboard,page}.ts`, `StageFrame.tsx` vào `game/` và `live/`;
đổi lại `/assets/` → `/assets/lophoc/` trong GameStage.tsx và sfx.ts (`sed -i '' 's#/assets/#/assets/lophoc/#g'`); chép ảnh mới
vào `public/assets/lophoc/`; rồi chạy `npm run test:lophoc`.
Nếu bản gốc thêm hàm mới mà `useGame.ts` gọi, nối thêm vào `index.js`.
