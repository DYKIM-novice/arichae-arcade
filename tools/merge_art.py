"""머지 게임 「소라섬 등불 이야기」 그림 변환: art_tests/merge/ 의 고른 그림 → static/img/merge/<묶음>/<id>.webp

  python tools/merge_art.py            # 아래 ART 목록 전부 변환
  python tools/merge_art.py item_a1    # 이름에 이 글자가 들어간 것만

- 화면 코드는 static/js/merge/art.js 한 곳에서만 경로를 만들어요 (여기 ART 의 <묶음>/<id> 와 같은 이름)
- 물건·발생기·UI 아이콘: 가장자리와 이어진 밝은 배경을 투명하게 지우고(색 거리 + 가장자리 부드럽게),
  그림 크기에 맞게 잘라서 256×256 안에 가운데로 놓아요 (판 칸에서 크기가 고르게 보이게)
- 인물 얼굴: 배경 그대로 512 (둥근 액자로 보여 줘요) · 배경: 세로 720 폭
- 그림을 새로 고르면 ART 의 원본 파일 이름만 바꾸고 다시 실행하면 돼요
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art_tests" / "merge"
OUT = ROOT / "static" / "img" / "merge"

# (묶음, id, 원본, 방식)  방식: cut = 배경 지우기 · portrait = 정사각 그대로 · bg = 세로 배경
ART = [
    # 체인 A 바다 보물 (발생기: 모래 바구니)
    ("items", "a1", "p1/item_a1_sand.jpg", "cut"),
    ("items", "a2", "item_a2_small_clam.jpg", "cut"),
    ("items", "a3", "p1/item_a3_conch.jpg", "cut"),
    ("items", "a4", "p1/item_a4_abalone.jpg", "cut"),
    ("items", "a5", "p1/item_a5_pearl_oyster.jpg", "cut"),
    ("items", "a6", "p1/item_a6_pearl.jpg", "cut"),
    ("items", "a7", "p1/item_a7_pearl_binyeo.jpg", "cut"),
    ("items", "a8", "p1/item_a8_najeon_box.jpg", "cut"),
    # 체인 B 떡·과자 (발생기: 떡방아 절구)
    ("items", "b1", "p1/item_b1_rice.jpg", "cut"),
    ("items", "b2", "p1/item_b2_rice_sack.jpg", "cut"),
    ("items", "b3", "p1/item_b3_dough.jpg", "cut"),
    ("items", "b4", "p1/item_b4_songpyeon.jpg", "cut"),
    ("items", "b5", "p1/item_b5_kkultteok_skewer.jpg", "cut"),
    ("items", "b6", "p1/item_b6_saekdong_gyeongdan.jpg", "cut"),
    ("items", "b7", "p1/item_b7_yakgwa_plate.jpg", "cut"),
    ("items", "b8", "item_b8_flower_baekseolgi.jpg", "cut"),
    ("items", "b9", "p1/item_b9_tteok_tower.jpg", "cut"),
    # 체인 D 꽃 (발생기: 씨앗 항아리)
    ("items", "d1", "p1/item_d1_seed_pouch.jpg", "cut"),
    ("items", "d2", "p1/item_d2_sprout_pot.jpg", "cut"),
    ("items", "d3", "p1/item_d3_camellia.jpg", "cut"),
    ("items", "d4", "p1/item_d4_chrysanthemum_pot.jpg", "cut"),
    ("items", "d5", "p1/item_d5_lotus.jpg", "cut"),
    ("items", "d6", "p1/item_d6_plum_bonsai.jpg", "cut"),
    ("items", "d7", "p1/item_d7_flower_basket.jpg", "cut"),
    ("items", "d8", "p1/item_d8_cherry_tree_pot.jpg", "cut"),
    # 발생기
    ("gens", "gen_a", "p1/gen_a_sand_basket.jpg", "cut"),
    ("gens", "gen_b", "gen_b_mortar.jpg", "cut"),
    ("gens", "gen_d", "p1/gen_d_seed_jar.jpg", "cut"),
    # UI
    ("ui", "coin", "p1/ui_coin.jpg", "cut"),
    ("ui", "energy", "p1/ui_energy.jpg", "cut"),
    # 인물 · 배경 (picks.json: 하윤 = 글자 지운 원본, 1지역 '전' = v2b)
    ("chars", "hayun", "char_hayun_base_clean.jpg", "portrait"),
    ("bg", "r1_before", "bg_r1_before_v2b.jpg", "bg"),
]

ICON = 256      # 물건 아이콘 한 변
PAD = 0.06      # 아이콘 안쪽 여백 비율
TOL = 34.0      # 배경색과 이만큼 가까우면 배경 후보 (RGB 거리)


def cut_background(im: Image.Image) -> Image.Image:
    """가장자리와 이어진 밝은 배경을 투명하게. 그림 안쪽의 흰색(진주·쌀)은 외곽선에 막혀 남아요."""
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bgc = np.median(border, axis=0)
    dist = np.sqrt(((a - bgc) ** 2).sum(axis=2))
    bright = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    # 배경 후보: 배경색에 가깝거나, 아주 밝고 색이 옅은 곳(살짝 번진 비네트·그림자 끝)
    cand = (dist < TOL) | ((bright > 236) & (sat < 26))
    lab, _ = ndimage.label(cand)
    edge_ids = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    edge_ids = edge_ids[edge_ids > 0]
    bg = np.isin(lab, edge_ids)
    # 작은 구멍(배경 안 점) 메우기 · 물건 쪽으로 1px 먹어 들어가서 흰 테두리 줄이기
    fg = ~bg
    fg = ndimage.binary_opening(fg, iterations=1)
    fg = ndimage.binary_fill_holes(fg)
    keep_lab, n = ndimage.label(fg)
    if n > 1:
        # 너무 작은 조각(먼지)은 버리고, 반짝이처럼 어느 정도 큰 조각은 남겨요
        sizes = ndimage.sum(fg, keep_lab, range(1, n + 1))
        big = sizes.max()
        for i, s in enumerate(sizes, start=1):
            if s < max(60, big * 0.002):
                fg[keep_lab == i] = False
    fg = ndimage.binary_erosion(fg, iterations=1)
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def fit_icon(im: Image.Image) -> Image.Image:
    bbox = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = round(ICON * (1 - 2 * PAD))
    scale = side / max(im.width, im.height)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (ICON, ICON), (0, 0, 0, 0))
    canvas.paste(im, ((ICON - im.width) // 2, (ICON - im.height) // 2), im)
    return canvas


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    total = 0
    for group, gid, src_name, mode in ART:
        if only and only not in gid and only not in src_name:
            continue
        src = SRC / src_name
        if not src.exists():
            print("없음:", src)
            continue
        im = Image.open(src).convert("RGB")
        if mode == "cut":
            out = fit_icon(cut_background(im))
        elif mode == "portrait":
            out = im.resize((512, 512), Image.LANCZOS)
        else:
            out = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
        dst = OUT / group / f"{gid}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        out.save(dst, "WEBP", quality=82, method=6)
        total += dst.stat().st_size
        print(f"{group}/{gid:10s} {out.width}x{out.height} {dst.stat().st_size // 1024}KB")
    print(f"합계 {total // 1024}KB → {OUT}")


if __name__ == "__main__":
    main()
