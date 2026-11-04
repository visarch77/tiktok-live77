// Trang nào đang mở?
//   /?view=stage  -> trang đưa vào TikTok LIVE Studio (1080x1920), DUY NHẤT trang này phát tiếng
//   /             -> trang điều khiển, im lặng, mở bao nhiêu tab cũng được
const params = new URLSearchParams(window.location.search);
export const IS_STAGE = params.get('view') === 'stage';
// mã riêng của trang stage này: server chỉ cho trang stage mở sau cùng phát tiếng
export const STAGE_ID = IS_STAGE ? Math.random().toString(36).slice(2, 10) : '';

// Kích thước thiết kế của stage. Mọi thứ trên stage vẽ theo khung 1080x1920 rồi tự co giãn.
export const STAGE_W = 1080;
export const STAGE_H = 1920;

// Gửi lệnh từ trang điều khiển tới trang stage
export async function sendControl(action: string, text?: string) {
  const r = await fetch('/api/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, text }),
  });
  return r.json();
}

// Giả lập sự kiện để test khi chưa live
export async function emitTest(type: string, data: Record<string, unknown>) {
  await fetch('/api/test/emit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data }),
  });
}
