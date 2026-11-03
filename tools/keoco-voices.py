"""
Tạo tiếng kêu hoạt hình cho nhân vật Kéo Co từ giọng đọc tiếng Việt có sẵn (ZeroTTS của server).
Cần server đang chạy (mặc định http://localhost:3000, đổi bằng biến KC_SERVER) và có ít nhất một phòng (KC_ROOM).
Mỗi câu: đọc bằng một giọng → cắt khoảng lặng → nâng giọng ×1,3 (kiểu hoạt hình) → chuẩn hoá → 22,05 kHz mono
→ public/assets/keoco/voice/<loại>_<số>.wav + voice.json (danh sách theo loại).
Chạy: .venv/bin/python tools/keoco-voices.py
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
SERVER = os.environ.get("KC_SERVER", "http://localhost:3000")
ROOM = os.environ.get("KC_ROOM", "keo-co-test")
CACHE = ROOT / "data" / "tts-cache"
OUT = ROOT / "public" / "assets" / "keoco" / "voice"
PITCH = 1.3
SR_OUT = 22050

M = ["huuduc", "giahuy", "quangminh", "tiendat"]  # giọng nam
F = ["kimoanh", "hamy", "baotrang", "maichi"]  # giọng nữ

# loại → các câu (mỗi câu đọc bằng 1–2 giọng khác nhau cho đỡ trùng)
LINES = {
    "gong": ["Hây da!", "Gồng nè!", "Xem anh đây!", "Hự hự!"],
    "energy": ["Ực ực, đã quá!", "Tỉnh rồi nha!", "Sảng khoái!"],
    "tickle": ["Cù cù cù!", "Nhột chưa nè?"],
    "tickled": ["Hì hì hì, nhột quá!", "Ha ha ha, đừng mà!", "Hi hi, thôi thôi!"],
    "glue": ["Dính chặt rồi!", "Keo xịn đó nha!"],
    "blocked": ["Hụt rồi nhé!", "Không ăn thua đâu!"],
    "cheer": ["Cố lên!", "Cố lên đội ơi!"],
    "grease": ["Hê hê, trơn chưa!", "Mỡ heo đây!"],
    "greased": ["Ối, trơn quá!", "Ai bôi mỡ vậy?", "Tuột tay rồi!"],
    "strong": ["Lực sĩ tới đây!", "Tránh ra để anh!"],
    "fart": ["Ê hê, xin lỗi nha!", "Ui, lỡ tay!"],
    "farted": ["Thối quá trời!", "Ặc ặc!", "Mùi gì vậy trời?"],
    "heave": ["Hò dô!", "Hò dô ta nào!"],
    "banana": ["Ăn chuối không?", "Vỏ chuối nè!"],
    "slip": ["Oạch!", "Ối!", "Á!"],
    "tired": ["Mệt quá à!", "Hết hơi rồi!", "Thở không nổi!"],
    "drag": ["Ối giời ơi!", "Cứu với!", "Giữ lại, giữ lại!"],
    "effort": ["Hự!", "Hây!", "Kéo!"],
    "fall": ["Á á á á á!", "Ối mẹ ơi!", "Áaaaa!"],
    "win": ["Yê! Thắng rồi!", "Hoan hô!", "Mình thắng rồi!"],
}
VOICES_PER_LINE = {"effort": 2, "fall": 2, "slip": 2, "heave": 2, "tired": 2, "drag": 2, "win": 2}


def speak(text, voice):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "room.speak",
                       "params": {"roomId": ROOM, "text": text, "voice": voice, "broadcast": False}}).encode()
    req = urllib.request.Request(f"{SERVER}/rpc", data=body, headers={"Content-Type": "application/json"})
    res = json.load(urllib.request.urlopen(req, timeout=60)).get("result") or {}
    if not res.get("ok"):
        raise RuntimeError(f"TTS lỗi: {text} / {voice}: {res}")
    return CACHE / Path(res["url"]).name


def process(path):
    a, sr = sf.read(path)
    if a.ndim > 1:
        a = a.mean(1)
    # cắt khoảng lặng hai đầu (ngưỡng theo đỉnh)
    thr = np.abs(a).max() * 0.04
    nz = np.where(np.abs(a) > thr)[0]
    a = a[max(0, nz[0] - int(sr * 0.01)): nz[-1] + int(sr * 0.04)]
    # nâng giọng: phát nhanh ×PITCH, rồi đổi tần số mẫu về 22,05 kHz (gộp một lần nội suy)
    step = PITCH * sr / SR_OUT
    idx = np.arange(0, len(a) - 1, step)
    b = np.interp(idx, np.arange(len(a)), a)
    n = min(len(b) // 4, int(SR_OUT * 0.012))
    if n > 1:
        b[:n] *= np.linspace(0, 1, n)
        b[-n:] *= np.linspace(1, 0, n)
    return b / max(1e-6, np.abs(b).max()) * 0.9


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    k = 0
    for cat, lines in LINES.items():
        files = []
        for li, text in enumerate(lines):
            for vi in range(VOICES_PER_LINE.get(cat, 1)):
                pool = (M + F) if vi == 0 else (F + M)
                voice = pool[(k * 3 + vi * 5) % len(pool)]
                k += 1
                src = speak(text, voice)
                for _ in range(20):
                    if src.exists():
                        break
                    time.sleep(0.2)
                name = f"{cat}_{len(files) + 1}.wav"
                sf.write(OUT / name, process(src), SR_OUT, subtype="PCM_16")
                files.append(name)
                print(name, voice, text, flush=True)
        manifest[cat] = files
    (OUT / "voice.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    total = sum((OUT / f).stat().st_size for fs in manifest.values() for f in fs)
    print(f"{sum(len(v) for v in manifest.values())} câu, {total / 1e6:.1f} MB", file=sys.stderr)


if __name__ == "__main__":
    main()
