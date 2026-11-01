# Viết chế độ chơi mới (plugin)

Mỗi chế độ là một thư mục `src/modes/<id>/` xuất ra (export) một object:

```js
module.exports = {
  id: 'battle',                 // dùng trong rooms.json và tên lệnh RPC (battle.xxx)
  name: 'Battle Quốc Gia',
  description: 'Người xem chọn phe bằng bình luận, quà cộng điểm cho phe',
  overlay: 'battle.html',       // file trong public/ hiển thị tại /room/<roomId>
  settingsSchema: { roundSeconds: [30, 900] }, // (tuỳ chọn) cài đặt riêng: 'boolean' | 'voice' | [min, max]
  defaultSettings: { roundSeconds: 180 },
  create(ctx, savedState) { return instance; }
};
```

## `ctx` — những gì lõi cung cấp cho chế độ

| Thuộc tính | Ý nghĩa |
| :--- | :--- |
| `ctx.roomId` | Mã phòng |
| `ctx.settings` | Cài đặt hiện tại của phòng (chung + riêng của chế độ) |
| `ctx.board` | Bảng điểm người xem dùng chung: `record(who, { points, stats, note })`, `top(n)`, `reset()` |
| `ctx.emitEvent(evt)` | Ghi + phát một sự kiện hiển thị tới mọi màn hình của phòng (`room.event`). Có `ttsText` thì tự đọc bằng ZeroTTS. Trả về `{ event, state }` |
| `ctx.save()` | Hẹn lưu trạng thái phòng (đã throttle) |
| `ctx.broadcastState()` / `ctx.scheduleStateBroadcast()` | Phát toàn bộ state ngay / gộp lại tối đa 1 lần/giây |
| `ctx.broadcast(method, params)` | Phát thông điệp tuỳ ý tới màn hình của phòng |
| `ctx.tts` | ZeroTTS dùng chung (`synthesize(text, voice)`) |

## `instance` — chế độ phải trả về

| Hàm | Bắt buộc | Ý nghĩa |
| :--- | :---: | :--- |
| `onEvent(evt)` | ✔ | Nhận sự kiện đã chuẩn hoá: `chat`, `like`, `gift`, `follow`, `share`, `join` (xem `src/core/normalize.js`) |
| `getPublicState()` | ✔ | State gửi cho màn hình (gộp chung với `room`, `settings`, `tiktok`, `tts`, `recentEvents`) |
| `serialize()` |  | Dữ liệu cần lưu; lần sau truyền lại vào `create(ctx, savedState)` |
| `rpc` |  | Object các lệnh, gọi bằng `"<id>.<tên>"`, ví dụ `battle.startRound` |
| `simulate()` |  | Một bước giả lập người xem (nút "Tự động giả lập") |
| `onSettingsChanged(changed)` |  | Được gọi khi cài đặt thay đổi |
| `dispose()` |  | Dọn timer khi phòng bị xoá / đổi chế độ |

Cuối cùng đăng ký chế độ trong `src/modes/index.js`. Xem `src/modes/temple/` làm mẫu.
