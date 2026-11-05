/**
 * Tóc nhìn từ sau lưng, vẽ bằng SVG để mỗi học sinh một kiểu (theo tên tài khoản, cố định).
 * Khung 100x100 = vùng đầu đã xoá khỏi ảnh thân (public/assets/nv/<nam|nu>/head.json); đuôi tóc được tràn ra ngoài.
 */
const COLORS = ['#1d1714', '#1d1714', '#1d1714', '#1d1714', '#2f221b', '#2f221b', '#2f221b', '#4a3021', '#4a3021', '#7a4b2a', '#b8862f', '#c76b8e'];
const BOY = ['ngan', 'ngan', 'dinh', 'xoan', 'mu'] as const;
const GIRL = ['duoi', 'bui', 'bim', 'xoa', 'bob', 'hai-chum'] as const;
const CAPS = ['#dc2626', '#2563eb', '#16a34a', '#111827'];
const SKIN = '#f3c9a2';
const LINE = '#2a1a10';

export const hashName = (s: string) => {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
};

export function Hair({ username, girl }: { username: string; girl: boolean }) {
  const h = hashName(username);
  const color = COLORS[h % COLORS.length];
  const style = girl ? GIRL[(h >> 4) % GIRL.length] : BOY[(h >> 4) % BOY.length];
  const accent = CAPS[(h >> 8) % CAPS.length];
  const shine = 'rgba(255,255,255,0.18)';
  const ears = (
    <>
      <ellipse cx="7" cy="60" rx="7" ry="11" fill={SKIN} stroke={LINE} strokeWidth="2" />
      <ellipse cx="93" cy="60" rx="7" ry="11" fill={SKIN} stroke={LINE} strokeWidth="2" />
    </>
  );
  const skull = <ellipse cx="50" cy="52" rx="43" ry="47" fill={color} stroke={LINE} strokeWidth="2.5" />;
  const strands = (
    <path d="M50 8 C40 30 34 55 36 88 M50 8 C60 30 66 55 64 88 M30 18 C22 40 20 60 24 82 M70 18 C78 40 80 60 76 82" stroke={shine} strokeWidth="2.5" fill="none" />
  );

  let body;
  switch (style) {
    case 'ngan':
      body = (
        <>
          {ears}
          {skull}
          {strands}
          <path d="M18 86 Q50 100 82 86" stroke={LINE} strokeWidth="2" fill="none" />
        </>
      );
      break;
    case 'dinh': // đầu đinh: tóc mỏng thấy da đầu
      body = (
        <>
          {ears}
          <ellipse cx="50" cy="52" rx="43" ry="47" fill={SKIN} stroke={LINE} strokeWidth="2.5" />
          <ellipse cx="50" cy="50" rx="41" ry="44" fill={color} opacity="0.72" />
        </>
      );
      break;
    case 'xoan': // tóc xoăn: viền lượn sóng
      body = (
        <>
          {ears}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={50 + Math.cos(a) * 38} cy={50 + Math.sin(a) * 42} r="14" fill={color} stroke={LINE} strokeWidth="2" />;
          })}
          <ellipse cx="50" cy="50" rx="38" ry="42" fill={color} />
        </>
      );
      break;
    case 'mu': // mũ lưỡi trai đội ngược
      body = (
        <>
          {ears}
          {skull}
          <path d="M8 46 A42 40 0 0 1 92 46 Z" fill={accent} stroke={LINE} strokeWidth="2.5" />
          <rect x="30" y="38" width="40" height="10" rx="4" fill="#fff" opacity="0.85" />
          <path d="M14 46 Q50 34 86 46 L92 62 Q50 50 8 62 Z" fill={accent} stroke={LINE} strokeWidth="2.5" />
        </>
      );
      break;
    case 'duoi': // đuôi ngựa
      body = (
        <>
          <path d="M50 40 C66 60 64 110 50 150 C38 110 36 60 50 40 Z" fill={color} stroke={LINE} strokeWidth="2.5" />
          {skull}
          {strands}
          <circle cx="50" cy="40" r="7" fill={accent} stroke={LINE} strokeWidth="2" />
        </>
      );
      break;
    case 'bui': // búi tó
      body = (
        <>
          {skull}
          {strands}
          <circle cx="50" cy="16" r="18" fill={color} stroke={LINE} strokeWidth="2.5" />
          <path d="M36 28 Q50 36 64 28" stroke={accent} strokeWidth="5" fill="none" />
        </>
      );
      break;
    case 'bim': // 2 bím có nơ
      body = (
        <>
          {[24, 76].map((x) => (
            <g key={x}>
              <path d={`M${x} 70 C${x - 8} 95 ${x + 8} 115 ${x} 145`} stroke={color} strokeWidth="16" strokeLinecap="round" fill="none" />
              <path d={`M${x - 8} 120 l16 0 M${x - 8} 132 l16 0`} stroke={LINE} strokeWidth="1.5" />
              <path d={`M${x} 104 l-12 -7 l0 14 Z M${x} 104 l12 -7 l0 14 Z`} fill={accent} stroke={LINE} strokeWidth="1.5" />
            </g>
          ))}
          {skull}
          {strands}
          <line x1="50" y1="6" x2="50" y2="96" stroke={LINE} strokeWidth="1.5" opacity="0.6" />
        </>
      );
      break;
    case 'xoa': // tóc dài xoã
      body = (
        <>
          <path d="M8 50 Q4 120 14 150 L86 150 Q96 120 92 50 Z" fill={color} stroke={LINE} strokeWidth="2.5" />
          {skull}
          {strands}
          <path d="M30 100 L28 148 M50 100 L50 150 M70 100 L72 148" stroke={shine} strokeWidth="2.5" />
        </>
      );
      break;
    case 'bob': // tóc ngắn ngang vai
      body = (
        <>
          <path d="M4 52 A46 48 0 0 1 96 52 L98 104 Q50 114 2 104 Z" fill={color} stroke={LINE} strokeWidth="2.5" />
          {strands}
        </>
      );
      break;
    case 'hai-chum': // 2 chùm buộc 2 bên
      body = (
        <>
          {[2, 98].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="88" rx="13" ry="26" fill={color} stroke={LINE} strokeWidth="2.5" />
              <circle cx={x < 50 ? x + 8 : x - 8} cy="64" r="6" fill={accent} stroke={LINE} strokeWidth="1.5" />
            </g>
          ))}
          {skull}
          {strands}
        </>
      );
      break;
  }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute overflow-visible" style={{ inset: 0, width: '100%', height: '100%' }}>
      {body}
    </svg>
  );
}
