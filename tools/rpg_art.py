"""회귀 RPG 그림 변환: art_tests/<장>/picks.json 에서 고른 그림 → static/img/rpg/<화풍>/<id>.webp

  python tools/rpg_art.py                 # 기본: ch1 · gameart 화풍
  python tools/rpg_art.py ch1 oil         # 나중에 유화 세트(art_tests/ch1_oil/ 등)를 같은 이름으로 넣을 때

- 파일 이름은 화풍과 상관없이 같아요 (코드는 RpgArt.src(id) 한 곳에서만 경로를 만들어요)
- 배경·장면(가로 그림)은 가로 1280 이하, 인물·적(정사각)은 640 이하로 줄여요 (폰에서 가볍게)
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CH = sys.argv[1] if len(sys.argv) > 1 else "ch1"
THEME = sys.argv[2] if len(sys.argv) > 2 else "gameart"
SRC = ROOT / "art_tests" / (CH if THEME == "gameart" else f"{CH}_{THEME}")
OUT = ROOT / "static" / "img" / "rpg" / THEME


def main():
    picks = json.loads((SRC / "picks.json").read_text(encoding="utf-8"))["chosen"]
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for gid, letter in sorted(picks.items()):
        src = SRC / f"{gid}_{letter}.jpg"
        if not src.exists():
            print("없음:", src)
            continue
        im = Image.open(src).convert("RGB")
        wide = im.width > im.height * 1.2
        cap = 1280 if wide else 640
        if gid.startswith("fx_"):
            cap = 1024
        if im.width > cap:
            im = im.resize((cap, round(im.height * cap / im.width)), Image.LANCZOS)
        dst = OUT / f"{gid}.webp"
        im.save(dst, "WEBP", quality=80, method=6)
        total += dst.stat().st_size
        print(f"{gid:20s} {im.width}x{im.height} {dst.stat().st_size // 1024}KB")
    print(f"합계 {total // 1024}KB → {OUT}")


if __name__ == "__main__":
    main()
