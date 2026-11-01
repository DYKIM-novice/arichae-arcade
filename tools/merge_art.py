"""머지 게임 「소라섬 등불 이야기」 그림 변환: art_tests/merge/ 의 고른 그림 → static/img/merge/<묶음>/<id>.webp

  python tools/merge_art.py            # 아래 ART 목록 전부 변환
  python tools/merge_art.py item_a1    # 이름에 이 글자가 들어간 것만

- 화면 코드는 static/js/merge/art.js 한 곳에서만 경로를 만들어요 (여기 ART 의 <묶음>/<id> 와 같은 이름)
- 물건·발생기·UI 아이콘: 가장자리와 이어진 밝은 배경을 투명하게 지우고(색 거리 + 가장자리 부드럽게),
  그림 크기에 맞게 잘라서 256×256 안에 가운데로 놓아요 (판 칸에서 크기가 고르게 보이게)
- 인물 얼굴: 배경 그대로 512 (둥근 액자로 보여 줘요) · 배경: 세로 720 폭 · 이벤트 배너: 가로 640 폭
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

# (묶음, id, 원본, 방식)  방식: cut = 배경 지우기 · portrait = 정사각 그대로 · bg = 세로 배경 · banner = 가로 배너 640
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
    # ---- 2묶음 (p2/) · 원본이 아직 없으면 건너뛰어요 (화면은 색 동그라미로 대신) ----
    ("chars", "hayun_joy", "p2/char/char_hayun_joy.jpg", "portrait"),
    ("chars", "hayun_wow", "p2/char/char_hayun_surprised.jpg", "portrait"),
    # 마을 사람 얼굴: 기본 + 기쁨 (건네기 반응·이야기 장면에서 기쁨 얼굴로 바뀌어요)
    *[("chars", f"{who}{'' if face == 'base' else '_' + face}", f"p2/char/char_{who}_{face}.jpg", "portrait")
      for who in ("mongdol", "juni", "mina", "kkotnim", "dochi", "kang", "rua") for face in ("base", "joy")],
    # 지역 배경 1~6 전/후 (1지역 '전'은 위 0묶음)
    ("bg", "r1_after", "p2/bg/bg_r1_after.jpg", "bg"),
    *[("bg", f"r{k}_{ba}", f"p2/bg/bg_r{k}_{ba}.jpg", "bg") for k in range(2, 7) for ba in ("before", "after")],
    # 이야기 그림 (시작·엔딩) · 타이틀·판 배경
    ("bg", "story_start", "p2/story/story_start.jpg", "bg"),
    ("bg", "story_ending", "p2/story/story_ending.jpg", "bg"),
    ("bg", "title", "p2/story/bg_title.jpg", "bg"),
    ("bg", "board", "p2/story/bg_board.jpg", "bg"),
    # 체인 C 찻집 · E 바다 식탁 · F 도자기 · G 바느질·부채 · H 불빛
    ("gens", "gen_c", "p2/chain_c/gen_c_tea_shelf.jpg", "cut"),
    ("items", "c1", "p2/chain_c/item_c1_tea_leaf.jpg", "cut"),
    ("items", "c2", "p2/chain_c/item_c2_teacup.jpg", "cut"),
    ("items", "c3", "p2/chain_c/item_c3_yuja_tea.jpg", "cut"),
    ("items", "c4", "p2/chain_c/item_c4_green_tea.jpg", "cut"),
    ("items", "c5", "p2/chain_c/item_c5_tea_set.jpg", "cut"),
    ("items", "c6", "p2/chain_c/item_c6_tea_tray.jpg", "cut"),
    ("items", "c7", "p2/chain_c/item_c7_dagwasang.jpg", "cut"),
    ("gens", "gen_e", "p2/chain_e/gen_e_fish_trap.jpg", "cut"),
    ("items", "e1", "p2/chain_e/item_e1_shrimp.jpg", "cut"),
    ("items", "e2", "p2/chain_e/item_e2_anchovies.jpg", "cut"),
    ("items", "e3", "p2/chain_e/item_e3_mackerel.jpg", "cut"),
    ("items", "e4", "p2/chain_e/item_e4_croaker.jpg", "cut"),
    ("items", "e5", "p2/chain_e/item_e5_octopus.jpg", "cut"),
    ("items", "e6", "p2/chain_e/item_e6_gulbi.jpg", "cut"),
    ("items", "e7", "p2/chain_e/item_e7_haemul_ttukbaegi.jpg", "cut"),
    ("items", "e8", "p2/chain_e/item_e8_seaside_feast.jpg", "cut"),
    ("gens", "gen_f", "p2/chain_f/gen_f_potter_wheel.jpg", "cut"),
    ("items", "f1", "p2/chain_f/item_f1_clay.jpg", "cut"),
    ("items", "f2", "p2/chain_f/item_f2_jongji.jpg", "cut"),
    ("items", "f3", "p2/chain_f/item_f3_tea_bowl.jpg", "cut"),
    ("items", "f4", "p2/chain_f/item_f4_celadon_vase.jpg", "cut"),
    ("items", "f5", "p2/chain_f/item_f5_moon_jar.jpg", "cut"),
    ("items", "f6", "p2/chain_f/item_f6_jangdok.jpg", "cut"),
    ("items", "f7", "p2/chain_f/item_f7_jangdokdae.jpg", "cut"),
    ("gens", "gen_g", "p2/chain_g/gen_g_sewing_box.jpg", "cut"),
    ("items", "g1", "p2/chain_g/item_g1_thread_spool.jpg", "cut"),
    ("items", "g2", "p2/chain_g/item_g2_thread_bundle.jpg", "cut"),
    ("items", "g3", "p2/chain_g/item_g3_bokjumeoni.jpg", "cut"),
    ("items", "g4", "p2/chain_g/item_g4_round_fan.jpg", "cut"),
    ("items", "g5", "p2/chain_g/item_g5_saekdong_cushion.jpg", "cut"),
    ("items", "g6", "p2/chain_g/item_g6_jogakbo.jpg", "cut"),
    ("items", "g7", "p2/chain_g/item_g7_sail.jpg", "cut"),
    ("gens", "gen_h", "p2/chain_h/gen_h_lantern_box.jpg", "cut"),
    ("items", "h1", "p2/chain_h/item_h1_match.jpg", "cut"),
    ("items", "h2", "p2/chain_h/item_h2_candle.jpg", "cut"),
    ("items", "h3", "p2/chain_h/item_h3_candlestick.jpg", "cut"),
    ("items", "h4", "item_h4_cheongsachorong_v2b.jpg", "cut"),
    ("items", "h5", "p2/chain_h/item_h5_lotus_lantern.jpg", "cut"),
    ("items", "h6", "p2/chain_h/item_h6_lantern_string.jpg", "cut"),
    ("items", "h7", "p2/chain_h/item_h7_lighthouse_lens.jpg", "cut"),
    # 보조 물건 (식혜·엽전·소라별·보자기 · 무지개 소라 · 모래더미)
    ("items", "en1", "p2/aux/aux_sikhye_cup.jpg", "cut"),
    ("items", "en2", "p2/aux/aux_sikhye_bowl.jpg", "cut"),
    ("items", "en3", "p2/aux/aux_sikhye_jar.jpg", "cut"),
    ("items", "cn1", "p2/aux/aux_coin_few.jpg", "cut"),
    ("items", "cn2", "p2/aux/aux_coin_string.jpg", "cut"),
    ("items", "cn3", "p2/aux/aux_coin_chest.jpg", "cut"),
    ("items", "ss1", "p2/aux/aux_sorastar_1.jpg", "cut"),
    ("items", "ss2", "p2/aux/aux_sorastar_pouch.jpg", "cut"),
    ("items", "ss3", "p2/aux/aux_sorastar_box.jpg", "cut"),
    ("items", "bj1", "p2/aux/aux_bojagi_small.jpg", "cut"),
    ("items", "bj2", "p2/aux/aux_bojagi_medium.jpg", "cut"),
    ("items", "bj3", "p2/aux/aux_bojagi_large.jpg", "cut"),
    ("items", "wild", "p2/aux/aux_rainbow_conch.jpg", "cut"),
    ("items", "sand", "p2/aux/aux_sand_pile.jpg", "cut"),
    # 숨은 비밀 (편지 조각은 대사창 '할머니의 편지' 얼굴로도 써요)
    ("ui", "secret_letter", "p2/secret/secret_letter_piece.jpg", "cut"),
    ("ui", "secret_bottle", "p2/secret/secret_bottle_letter.jpg", "cut"),
    ("ui", "secret_seagull", "p2/secret/secret_seagull.jpg", "cut"),
    # UI 아이콘
    ("ui", "bag", "p2/ui/ui_bag.jpg", "cut"),
    ("ui", "logo", "p2/ui/ui_logo_emblem.jpg", "cut"),
    ("ui", "sorastar", "p2/ui/ui_sorastar.jpg", "cut"),
    ("ui", "star", "p2/ui/ui_star.jpg", "cut"),
    # 주간 이벤트 (연날리기 · 단오): 물건 5 · 발생기 · 장식 · 배너(가로)
    *[("events", f"kite{k}", f"p2/event_kite/ev_kite_{k}_{n}.jpg", "cut")
      for k, n in ((1, "paper"), (2, "tail"), (3, "gaori"), (4, "bangpae"), (5, "dragon"))],
    ("events", "kite_gen", "p2/event_kite/ev_kite_gen_basket.jpg", "cut"),
    ("events", "kite_deco", "p2/event_kite/ev_kite_deco_tower.jpg", "cut"),
    ("events", "kite_banner", "p2/event_kite/ev_kite_banner.jpg", "banner"),
    *[("events", f"dano{k}", f"p2/event_dano/ev_dano_{k}_{n}.jpg", "cut")
      for k, n in ((1, "iris_leaf"), (2, "iris_water"), (3, "surichwi_tteok"), (4, "dano_fan"), (5, "flower_swing"))],
    ("events", "dano_gen", "p2/event_dano/ev_dano_gen_basket.jpg", "cut"),
    ("events", "dano_deco", "p2/event_dano/ev_dano_deco_swing.jpg", "cut"),
    ("events", "dano_banner", "p2/event_dano/ev_dano_banner.jpg", "banner"),
]

# 화면이 '그림이 있는지' 알 수 있게 실제로 있는 파일 목록을 js 로 써 둬요 (없는 그림은 요청조차 안 함)
LIST_JS = ROOT / "static" / "js" / "merge" / "art_list.js"

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
        elif mode == "banner":
            out = im.resize((640, round(im.height * 640 / im.width)), Image.LANCZOS)
        else:
            out = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
        dst = OUT / group / f"{gid}.webp"
        dst.parent.mkdir(parents=True, exist_ok=True)
        out.save(dst, "WEBP", quality=82, method=6)
        total += dst.stat().st_size
        print(f"{group}/{gid:10s} {out.width}x{out.height} {dst.stat().st_size // 1024}KB")
    print(f"합계 {total // 1024}KB → {OUT}")
    write_list()


def write_list():
    have = sorted(f"{g}/{gid}" for g, gid, _s, _m in ART if (OUT / g / f"{gid}.webp").is_file())
    body = ",".join(f'"{x}":1' for x in have)
    head = "/* tools/merge_art.py 가 만들어요 (손으로 고치지 않기) · 지금 static/img/merge 에 실제로 있는 그림 */"
    LIST_JS.write_text(head + "\n" + "window.MergeArtList = {" + body + "};\n", "utf-8")
    print(f"그림 목록 {len(have)}개 → {LIST_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
