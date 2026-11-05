// Màn hình phòng Lớp Học Chữ (/room/<id>): vẽ lại ảnh chụp lớp học do server gửi ('lophoc.view')
// bằng GameStage.tsx của bản gốc, phát giọng cô ('lophoc.speak') và hiệu ứng âm thanh.
// Bản gốc chạy game trong trang này; ở đây game chạy trên server (src/modes/lophoc/index.js).
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameStage } from '../game/GameStage';
import { StageFrame } from '../live/StageFrame';
import { STAGE_H, STAGE_W } from '../live/page';
import { sfx } from '../game/sfx';
import type { StageView } from '../game/useGame';
// stage/index.css (Tailwind) đóng gói riêng bằng Tailwind CLI, xem build.js

const params = new URLSearchParams(location.search);
const PREVIEW = params.get('preview') === '1'; // khung xem trước trong trang quản lý: mặc định im lặng
const OBS = params.get('obs') === '1' || /\/live\.html$/.test(location.pathname);
const roomMatch = location.pathname.match(/^\/room\/([^/?#]+)/);
const ROOM_ID = decodeURIComponent((roomMatch && roomMatch[1]) || params.get('room') || 'main');

const DEFAULT_SIDE_MARGIN = 80; // giống defaultSettings.sideMargin ở index.js

type View = StageView & {
  serverNow: number;
  channelName: string;
  lastGift: { nickname: string; giftName: string; coins: number; repeatCount: number; at: number } | null;
};

// ---------- âm thanh ----------
const audio = {
  unlocked: OBS && !PREVIEW, // OBS / LIVE Studio tự phát tiếng
  muted: PREVIEW,
  ttsOn: true,
  ttsVolume: 1,
  sfxOn: true,
  current: null as HTMLAudioElement | null,
};
function applySfxVolume() {
  sfx.volume = audio.unlocked && !audio.muted && audio.sfxOn ? 0.35 : 0;
}
applySfxVolume();
sfx.loadFiles();

function playVoice(url: string | null) {
  if (!url || !audio.unlocked || audio.muted || !audio.ttsOn) return;
  try {
    audio.current?.pause();
  } catch {
    // bỏ qua
  }
  const el = new Audio(url);
  el.volume = audio.ttsVolume;
  audio.current = el;
  void el.play().catch(() => {});
}

/** Đồng hồ máy này lệch với server: dời mọi mốc thời gian trong ảnh chụp cho khớp Date.now() ở đây */
function shiftTimes<T>(v: T, skew: number): T {
  if (!skew) return v;
  const isTime = (k: string) => /(?:At|Ends?At|Until|^at|^endsAt|lastActive|joinedAt)$/.test(k);
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (!x || typeof x !== 'object') return x;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(x)) out[k] = typeof val === 'number' && isTime(k) && val > 1e12 ? val - skew : walk(val);
    return out;
  };
  return walk(v) as T;
}

function App() {
  const [view, setView] = useState<View | null>(null);
  const [unlocked, setUnlocked] = useState(audio.unlocked);
  const [sideMargin, setSideMargin] = useState(DEFAULT_SIDE_MARGIN);
  const prev = useRef<View | null>(null);
  const viewRef = useRef<View | null>(null);

  useEffect(() => {
    const unlock = () => {
      if (audio.muted) return;
      audio.unlocked = true;
      applySfxVolume();
      setUnlocked(true);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'preview-audio') return;
      audio.muted = !e.data.on;
      applySfxVolume();
      if (e.data.on) unlock();
      else audio.current?.pause();
    };
    addEventListener('pointerdown', unlock);
    addEventListener('message', onMsg);

    const apply = (raw: View | undefined) => {
      if (!raw) return;
      const skew = (raw.serverNow || Date.now()) - Date.now();
      const v = Math.abs(skew) > 400 ? shiftTimes(raw, skew) : raw;
      sfx.watch(prev.current, v);
      prev.current = v;
      viewRef.current = v;
      setView(v);
    };
    const applySettings = (s: { ttsEnabled?: boolean; sfxEnabled?: boolean; ttsVolume?: number; sideMargin?: number } | undefined) => {
      if (!s) return;
      if (typeof s.sideMargin === 'number') setSideMargin(Math.max(0, Math.min(200, s.sideMargin)));
      audio.ttsOn = s.ttsEnabled !== false;
      audio.sfxOn = s.sfxEnabled !== false;
      if (typeof s.ttsVolume === 'number') audio.ttsVolume = Math.max(0, Math.min(1, s.ttsVolume));
      applySfxVolume();
    };

    let ws: WebSocket | null = null;
    let closed = false;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws?room=${encodeURIComponent(ROOM_ID)}`);
      ws.onmessage = (e) => {
        let msg: { method?: string; params?: any };
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        const p = msg.params || {};
        switch (msg.method) {
          case 'room.state':
            if (p.room && p.room.mode && p.room.mode !== 'lophoc') return location.reload(); // phòng đổi sang trò khác
            applySettings(p.settings);
            apply(p.lophoc);
            break;
          case 'room.event':
            if (p.state) {
              applySettings(p.state.settings);
              apply(p.state.lophoc);
            }
            break;
          case 'lophoc.view':
            apply(p);
            break;
          case 'lophoc.speak':
            playVoice(p.url);
            break;
        }
      };
      ws.onerror = () => ws?.close();
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 2000);
      };
    };
    connect();

    // tích tắc 5 giây cuối, chuông hết giờ...
    const clock = setInterval(() => {
      const v = viewRef.current;
      if (v) sfx.clock(v.phase, v.boardShown, v.endsAt, Date.now());
    }, 200);

    return () => {
      closed = true;
      ws?.close();
      clearInterval(clock);
      removeEventListener('pointerdown', unlock);
      removeEventListener('message', onMsg);
    };
  }, []);

  const game = {
    view,
    channelName: view?.channelName || 'Lớp Học Chữ',
    lastGift: view?.lastGift || null,
    status: null,
    stageCount: 1,
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-black">
      <StageFrame>
        {/* Lề hai bên (cài đặt sideMargin): điện thoại màn dài hơn 9:16 nên TikTok cắt hai mép khung 1080x1920.
            Thu nhỏ cả lớp học vào giữa; phần lề là nền lớp làm mờ + tối để thành viền, không lộ chỗ nối hai lớp ảnh. */}
        {sideMargin > 0 && (
          <div
            className="stage-bg absolute left-0 top-0"
            style={{ width: STAGE_W, height: STAGE_H, filter: 'blur(18px) brightness(0.55)', transform: 'scale(1.06)' }}
          />
        )}
        <div
          className="stage-bg absolute left-0 top-0"
          style={{
            width: STAGE_W,
            height: STAGE_H,
            transform: `scale(${(STAGE_W - 2 * sideMargin) / STAGE_W})`,
            transformOrigin: 'center center',
            boxShadow: sideMargin > 0 ? '0 0 40px 6px rgba(0,0,0,0.55)' : undefined,
            borderRadius: sideMargin > 0 ? 18 : undefined,
            overflow: 'hidden',
          }}
        >
          {/* GameStage chỉ đọc view / channelName / lastGift */}
          <GameStage game={game as never} />
        </div>
      </StageFrame>
      {!unlocked && !PREVIEW && (
        <div className="fixed bottom-[18px] left-1/2 -translate-x-1/2 cursor-pointer rounded-full bg-black/70 px-[14px] py-[8px] text-[13px] text-white">
          🔊 Chạm để bật âm thanh
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
