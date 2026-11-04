import { useEffect, useState, type ReactNode } from 'react';
import { STAGE_H, STAGE_W } from './page';

/** Khung 1080x1920 tự co giãn vừa cửa sổ. Bên trong cứ vẽ theo pixel 1080x1920. */
export function StageFrame({ children, maxHeight }: { children: ReactNode; maxHeight?: number }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const h = Math.min(window.innerHeight, maxHeight ?? Infinity);
      setScale(Math.min(window.innerWidth / STAGE_W, h / STAGE_H));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [maxHeight]);

  return (
    <div style={{ width: STAGE_W * scale, height: STAGE_H * scale }} className="relative overflow-hidden">
      <div
        className="stage-bg absolute left-0 top-0"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  );
}
