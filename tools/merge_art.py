"""머지 게임 「소라섬 등불 이야기」 그림 변환: art_tests/merge/ 의 고른 그림 → static/img/merge/<묶음>/<id>.webp

  python tools/merge_art.py            # 아래 ART 목록 전부 변환
  python tools/merge_art.py item_a1    # 이름에 이 글자가 들어간 것만

- 화면 코드는 static/js/merge/art.js 한 곳에서만 경로를 만들어요 (여기 ART 의 <묶음>/<id> 와 같은 이름)
- 물건·발생기·UI 아이콘: 가장자리와 이어진 밝은 배경을 투명하게 지우고(색 거리 + 가장자리 부드럽게),
  그림 크기에 맞게 잘라서 256×256 안에 가운데로 놓아요 (판 칸에서 크기가 고르게 보이게)
- 인물 얼굴: 배경 그대로 512 (둥근 액자로 보여 줘요) · 배경: 세로 720 폭 · 이벤트 배너: 가로 640 폭
- 그림을 새로 고르면 ART 의 원본 파일 이름만 바꾸고 다시 실행하면 돼요
- 마을 짓기(merge_town.md): art_tests/merge/town/ → static/img/merge/town/ (투명 webp · 긴 변 건물 512 · 장식 384 · 인물 300)
    python tools/merge_art.py town      # 마을 그림만 (map_r3 처럼 이름 일부만 줘도 돼요)
  · 건물·장식·공용(b_ c_ d_): 밑에 남은 모래 받침을 지워요 (변형 3장이 같게) · 옅은 길 자국도
  · 하윤 옷장(outfits/ 22벌 + 초상 + 몽돌 소품):  python tools/merge_art.py outfits
  · 걷는 인물(w_ h_): 발밑 그림자 지우기 · 미나 다리 다시 그리기 · 하윤 옷마다 얼굴 칸 그림(h_*_face)도
    python tools/merge_art.py map       # 이어진 섬 지도(town2/town_map_v3.jpg)만 → map_lo · map_<열>_<행> 조각 · map_land
  · (옛) 바탕(map_r*): 바다 색을 6장 모두 같게 + 가장자리를 같은 바다색으로 → 2×3 으로 붙여도 이음매가 안 보여요
                  r2~r6 의 엉뚱한 건물·평상·표시는 둘레 색으로 메워요 (확산 메우기 · 무료)
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
    ("bg", "r1_before", "p2/bg/bg_r1_before.jpg", "bg"),  # 4차: '후'를 부서뜨린 그림 (이전 = bg_r1_before_v2b.jpg)
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



# ---------------- 마을 그림 (투명 PNG → 손질 → webp) ----------------
TOWN_SRC = SRC / "town"
TOWN_OUT = OUT / "town"
SEA = np.array([88, 172, 160], np.float32)        # 6장 공통 바다색 (지도 밖 바다도 이 색 · data.js TOWN.sea 와 같게)
# 모래 받침 지우기: 안 하는 것 (다리는 개울 둑이 그림의 일부 · 무대 가는 받침이 없어요) / 위쪽 몇 %부터 지울지
SAND_SKIP = {"b_r4_bridge_a", "b_r4_bridge_b", "b_r4_bridge_c", "b_r5_stage_a"}
SAND_TOP = {"b_r1_gate_a": 0.8, "b_r1_gate_b": 0.8, "b_r1_gate_c": 0.8, "b_r6_hut_c": 0.5, "c_scaffold": 0.86}
# 옅은 길·자국(민트 곡선·회색 길 흔적·등대 밑 테두리)까지 지울 것
PALE = {"b_r1_paper_b", "c_pine", "d_r4_path", "d_r6_bell", "b_r6_wall_a", "b_r6_wall_b", "b_r6_wall_c"}
# 바탕 그림에서 지울 것: (x0, y0, x1, y1) 타원 · 지역 그림 1536×1024 기준
PAINT = {
    "map_r2": [(975, 410, 1105, 505), (750, 625, 860, 715)],                          # 나무 평상 2개
    "map_r3": [(728, 448, 812, 522)],                                                 # 가운데 붉은 표시
    "map_r4": [(650, 370, 830, 545)],                                                 # 가운데 나무 오두막
    "map_r5": [(915, 240, 1085, 392), (1005, 320, 1120, 410), (735, 440, 830, 525)],  # 오두막 · 물통 · 평상
    "map_r6": [(795, 255, 880, 318)],                                                 # 풀밭의 검은 금
}


# 다리 물줄기 방향 바로잡기 (2026-11-04 · 주인 신고 '다리 3개 중 2개가 방향이 틀려요')
#  나무 다리(b)·붉은 난간 다리(c)는 상판(널빤지·난간)이 '/' 방향인데 그림 속 물줄기도 '/'(왼쪽 아래)로 흘러
#  물이 다리를 따라 흘러요 → 다리는 그대로 두고 모래섬+물줄기 바탕만 좌우로 뒤집어 물이 다리 밑(c 는 아치)을 지나
#  오른쪽 아래로 흐르게 해요. 무지개 돌다리(a)는 원래 맞아요.
#  다각형 = 다리 구조물 둘레 (출력 webp px ×2 · 폭 ref 기준)
STREAM_SWAP = {
    "b_r4_bridge_b": (440, [(195, 270), (205, 160), (230, 148), (258, 160), (445, 58), (448, 20), (475, 10), (500, 20), (503, 62), (652, 158), (680, 146), (708, 163),
                            (714, 280), (714, 322), (692, 342), (655, 338), (462, 440), (464, 466), (440, 478), (408, 472), (403, 442), (245, 347), (208, 342), (196, 302)]),
    "b_r4_bridge_c": (463, [(146, 288), (193, 172), (258, 176), (453, 58), (468, 8), (520, 10), (524, 104), (562, 124), (686, 192), (698, 162), (748, 158), (754, 234),
                            (799, 274), (799, 380), (402, 580), (383, 560), (383, 420), (205, 402), (146, 402)]),
}


def _ground_cls(a):
    r, g, b, al = [a[..., i].astype(int) for i in range(4)]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    lum = (r + g + b) / 3
    water = (b > r + 12) & (g > r + 5) & (al > 10)
    white = (lum > 215) & (mx - mn < 40) & (al > 10)
    grass = (g > r + 8) & (g > b + 15) & (al > 10)
    return water, white, grass


def town_stream_swap(im, name):
    """다리 구조물은 그대로 · 바탕(모래섬+물줄기)은 좌우로 뒤집은 그림 · 다리 사이로 보이던 풀빛엔 뒤집은 바탕(물)이 보여요"""
    from PIL import ImageDraw
    ref, pts = STREAM_SWAP[name]
    a = np.array(im.convert("RGBA")); H, W = a.shape[:2]; k = W / ref
    pm = Image.new("L", (W, H), 0); ImageDraw.Draw(pm).polygon([(x / 2 * k, y / 2 * k) for x, y in pts], fill=255)
    poly = np.array(pm) > 127
    polyD = ndimage.binary_dilation(poly, iterations=5)
    water, white, grass = _ground_cls(a)
    # 원래 물줄기 (가장 큰 물 덩어리 + 테두리 2px)
    wm = water | white
    lab, n = ndimage.label(ndimage.binary_closing(wm, iterations=2))
    sm = lab == (int(np.argmax(ndimage.sum(wm, lab, range(1, n + 1)))) + 1)
    sm = ndimage.binary_dilation(ndimage.binary_fill_holes(sm), iterations=2) & (a[..., 3] > 0)
    out = a[:, ::-1].copy()                                    # 바탕 = 뒤집은 그림
    q = polyD[:, ::-1] & ~poly                                 # 뒤집은 다리 자리 중 원래 다리 밖 → 원래 그림의 땅
    qs = q & ~sm
    out[qs] = a[qs]
    qw = q & sm                                                # 그중 원래 물줄기 자리 → 가까운 땅
    if qw.any():
        _, (iy, ix) = ndimage.distance_transform_edt(qw | polyD[:, ::-1], return_indices=True)
        out[qw] = out[iy[qw], ix[qw]]
    keep = poly & ~grass
    keep = ndimage.binary_opening(keep, iterations=1) | (poly & ~grass & (a[..., 3] > 200) & ~ndimage.binary_erosion(poly, iterations=2))
    out[keep] = a[keep]
    w2, wh2, _ = _ground_cls(out)
    fix = poly & grass & poly[:, ::-1] & ~(w2 | wh2)           # 다리 사이 풀빛인데 바탕이 뒤집힌 다리 조각이면 원래 풀
    out[fix] = a[fix]
    # 다리 둘레 위쪽에 남는 옅은 테두리 지우기 (물이 없는 윗부분만)
    zone = ndimage.binary_dilation(poly | poly[:, ::-1], iterations=6)
    zone[int(H * 0.6):] = False
    lum = out[..., :3].astype(int).mean(axis=2)
    solid = ndimage.binary_dilation(out[..., 3] >= 235, iterations=2)
    out[zone & (out[..., 3] < 235) & ((lum > 185) | ~solid), 3] = 0
    return Image.fromarray(out)


def finish_alpha(im, fg, al, keep):
    lab, n = ndimage.label(fg, structure=np.ones((3, 3)))
    if n > 1:
        sz = ndimage.sum(fg, lab, range(1, n + 1))
        big = sz.max()
        for i, sv in enumerate(sz, 1):
            if sv < big * keep:
                fg[lab == i] = False
    newa = np.where(fg, al, 0).astype(np.uint8)
    edge = ndimage.binary_dilation(~fg, iterations=1) & fg
    soft = np.asarray(Image.fromarray(newa).filter(ImageFilter.GaussianBlur(0.8)))
    newa = np.where(edge, np.minimum(newa, soft), newa)
    out = np.asarray(im.convert("RGBA")).copy()
    out[..., 3] = newa
    return Image.fromarray(out)


def town_desand(im, name):
    """건물·장식 밑에 남은 모래 받침(밝은 모래·그늘 모래·크림 테두리)을 바깥에서부터 지워요"""
    a = np.asarray(im.convert("RGBA")).astype(np.int16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    ys, _xs = np.nonzero(al > 24)
    y0, y1 = ys.min(), ys.max()
    top = SAND_TOP.get(name, 0.22)
    low = np.zeros(al.shape, bool)
    low[int(y0 + (y1 - y0) * top):, :] = True
    sand = (r >= 200) & (r - b >= 45) & (r - b <= 140) & (g - b >= 22) & (r - g >= 12) & (r - g <= 60) & (g >= 150)
    if name == "b_r6_hut_c":   # 크림색 벽이 모래와 비슷해요 → 오른쪽 받침·맨 아래만
        xx = np.arange(al.shape[1])[None, :]
        yy = np.arange(al.shape[0])[:, None]
        low &= (xx > al.shape[1] * 0.7) | (yy > y0 + (y1 - y0) * 0.94)
    rim = (r > 232) & (g > 225) & (b > 185) & (al < 250)
    path = sand | rim
    if name in PALE:
        mx, mn = a[..., :3].max(axis=2), a[..., :3].min(axis=2)
        path |= ((g >= r - 6) & (g > 165) & (b > 140) & (r > 120)) | ((r > 185) & (g > 185) & (b > 165) & (mx - mn < 42))
    path &= low
    trans = al < 100
    lab, _ = ndimage.label(path | trans, structure=np.ones((3, 3)))
    ids = np.unique(lab[trans])
    ids = ids[ids > 0]
    rm = np.isin(lab, ids) & path
    for _ in range(3):   # 받침 가장자리의 진한 모래색 테두리 몇 px
        ring = ndimage.binary_dilation(rm | trans) & ~rm & ~trans
        add = ring & (r > 160) & (r - b > 25) & (g > 120) & low & (r - g < 75)
        if not add.any():
            break
        rm |= add
    fg = (al > 24) & ~rm
    near = ndimage.binary_dilation(rm, iterations=8) & low
    fg &= ~(fg & ~ndimage.binary_opening(fg, iterations=3) & near)   # 받침 지운 자리에 남은 가는 선
    return finish_alpha(im, fg, al, 0.06)


def town_unshadow(im):
    """발밑 회색·분홍 그림자 타원(과 신발 사이 틈) 지우기 · 아래쪽에서 바깥과 이어진 옅은 색만"""
    a = np.asarray(im.convert("RGBA")).astype(np.int16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    ys, _ = np.nonzero(al > 24)
    y0, y1 = ys.min(), ys.max()
    low = np.zeros(al.shape, bool)
    low[int(y1 - (y1 - y0) * 0.14):, :] = True
    mx, mn = a[..., :3].max(axis=2), a[..., :3].min(axis=2)
    pale = ((mx - mn < 40) & (mn > 150)) | ((r > 200) & (g > 165) & (b > 150) & (r - b < 70) & (r - g < 45))
    path = pale & low
    trans = al < 100
    lab, _ = ndimage.label(path | trans, structure=np.ones((3, 3)))
    ids = np.unique(lab[trans])
    ids = ids[ids > 0]
    rm = np.isin(lab, ids) & path
    fg = (al > 24) & ~rm
    return finish_alpha(im, fg, al, 0.02)


def town_mina_legs(im):
    """미나: 자르기에서 다리가 배경과 함께 지워지고 다리 사이 흰 틈만 남았어요 → 치마 아래를 비우고 다리·신을 다시 그려요"""
    from PIL import ImageDraw
    im = im.convert("RGBA")
    a = np.asarray(im).copy()
    al = a[..., 3]
    w = (al > 128).sum(axis=1)
    rows = np.nonzero(w > im.width * 0.35)[0]
    hem = int(rows.max()) + 2          # 치마 끝 (폭이 넓은 마지막 줄)
    cols = np.nonzero(al[hem - 8] > 128)[0]
    cx = int((cols.min() + cols.max()) / 2) if len(cols) else im.width // 2
    a[hem:, :, 3] = 0
    out = Image.fromarray(a)
    d = ImageDraw.Draw(out)
    ink, skin, sock, shoe = (74, 36, 40, 255), (255, 223, 200, 255), (255, 250, 246, 255), (122, 70, 74, 255)
    L = 56   # 다리 길이
    for dx in (-30, 10):
        x0 = cx + dx
        d.rounded_rectangle((x0 - 3, hem - 10, x0 + 23, hem + L), radius=9, fill=ink)
        d.rounded_rectangle((x0, hem - 10, x0 + 20, hem + L - 3), radius=7, fill=skin)
        d.rectangle((x0, hem + L - 26, x0 + 20, hem + L - 3), fill=sock)
        d.ellipse((x0 - 8, hem + L - 10, x0 + 28, hem + L + 14), fill=ink)
        d.ellipse((x0 - 5, hem + L - 7, x0 + 25, hem + L + 11), fill=shoe)
    # 치마 끝 선이 다리 위를 덮게 (치마 아래 4px 를 다시 원래대로)
    src = np.asarray(im)
    o = np.asarray(out).copy()
    o[hem - 4:hem, :, :] = np.where(src[hem - 4:hem, :, 3:4] > 128, src[hem - 4:hem], o[hem - 4:hem])
    return Image.fromarray(o)


def town_patch_wall(im):
    """6지역 오두막 c: 흰 벽이 배경과 함께 잘려 앞쪽 왼벽·굴뚝에 구멍 → 크림색 벽으로 메우고 왼쪽 테두리를 그어요 (원본 398×423 기준)"""
    a = np.asarray(im.convert("RGBA")).copy()
    hole = a[..., 3] < 200
    wall = np.zeros(hole.shape, bool)
    wall[196:352, 22:170] = True      # 앞쪽 왼벽
    wall[72:110, 86:114] = True       # 굴뚝 기둥
    fill = hole & wall
    a[fill] = (247, 236, 218, 255)
    a[196:300, 18:23] = (92, 70, 72, 255)   # 왼쪽 벽 테두리
    return Image.fromarray(a)


def trim(im, pad=4):
    bb = im.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def fit_long(im, side):
    k = side / max(im.width, im.height)
    if k >= 1:
        return im
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def diffuse_fill(arr, mask):
    """mask 자리를 둘레 색으로 메워요 (안쪽으로 한 겹씩 번지게) + 고르게 + 아주 옅은 결"""
    out = arr.astype(np.float32).copy()
    known = ~mask
    k = np.ones((3, 3), np.float32)
    for _ in range(400):
        if known.all():
            break
        num = np.stack([ndimage.convolve(out[..., c] * known, k, mode="nearest") for c in range(3)], -1)
        den = ndimage.convolve(known.astype(np.float32), k, mode="nearest")
        upd = ~known & (den > 0)
        out[upd] = num[upd] / den[upd][:, None]
        known = known | upd
    for _ in range(25):
        sm = np.stack([ndimage.uniform_filter(out[..., c], 7) for c in range(3)], -1)
        out[mask] = sm[mask]
    rng = np.random.default_rng(7)
    noise = ndimage.gaussian_filter(rng.normal(0, 1, mask.shape), 1.2) * 4.0
    out[mask] += noise[mask][:, None]
    return np.clip(out, 0, 255)


def town_map(name, im):
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    # 1) 엉뚱한 것 메우기 (빈 터만 남게)
    if name in PAINT:
        mask = np.zeros((h, w), bool)
        for x0, y0, x1, y1 in PAINT[name]:
            cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
            mask |= ((xx - cx) / (rx + 12)) ** 2 + ((yy - cy) / (ry + 12)) ** 2 <= 1
        sub = (slice(max(0, yy[mask].min() - 40), yy[mask].max() + 40), slice(max(0, xx[mask].min() - 40), xx[mask].max() + 40))
        filled = diffuse_fill(a[sub], mask[sub])
        soft = ndimage.gaussian_filter(mask.astype(np.float32), 2.5)[sub][..., None]
        a[sub] = a[sub] * (1 - soft) + filled * soft
    # 2) 바다 색 맞추기: 가장자리와 이어진 바다(청록 계열)를 공통 바다색으로 · 큰 색 번짐(밝은 바다·비네트)은 없애고 물결 무늬만 남겨요
    r_, g_, b_ = a[..., 0], a[..., 1], a[..., 2]
    seaish = ((g_ - r_ > 14) & (b_ - r_ > 4) & (b_ > g_ - 48)) | ((g_ - r_ >= 7) & (b_ - r_ >= 3) & (r_ > 175) & (b_ > g_ - 30))
    lab, _ = ndimage.label(seaish)
    ids = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    sea = np.isin(lab, ids[ids > 0])
    sea = ndimage.binary_closing(sea, iterations=2) & seaish | sea
    sm = sea.astype(np.float32)
    den = ndimage.gaussian_filter(sm, 30) + 1e-4
    mean = np.stack([ndimage.gaussian_filter(a[..., c] * sm, 30) for c in range(3)], -1) / den[..., None]
    recol = SEA + (a - mean) * 0.8
    wgt = ndimage.gaussian_filter(sm, 2.5)[..., None]
    a = a * (1 - wgt) + recol * wgt
    # 3) 가장자리 80px 는 공통 바다색으로 살살 (붙였을 때 이음매 없음)
    e = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(np.float32)
    k = np.clip(1 - e / 80, 0, 1)[..., None] ** 1.5
    a = a * (1 - k) + SEA * k
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


TOWN_MAP_SRC = SRC / "town2" / "town_map_v3.jpg"     # 하나로 이어진 섬 지도 3072² (town_map.json 좌표 = 이 그림 px)
TOWN_MAP_SEA = np.array([95, 160, 149], np.float32)  # 지도 밖 바다색 (data.js TOWN.sea '#5fa095' 와 같게)
TOWN_TILE = 512


def town_map_tiles():
    """이어진 섬 지도 → 폰용 조각 그림
    · town/map_lo.webp : 전체 1024² (멀리 볼 때 · 조각이 오기 전 바로 보이는 바탕)
    · town/map_<열>_<행>.webp : 3072² 를 512² 조각 6×6 (가까이 볼 때 화면에 보이는 조각만 받아요 → 폰 메모리·데이터 절약)
    · town/map_land.webp : 땅 지도 192² (알파 = 땅 · 안개를 섬 위에만 덮는 데 써요)
    가장자리 280px 는 바다색 하나로 살살 → 지도 밖을 같은 색으로 칠해도 이음매가 안 보여요"""
    im = Image.open(TOWN_MAP_SRC).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    e = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(np.float32)
    k = np.clip(1 - e / 280, 0, 1)[..., None]
    k = k * k * (3 - 2 * k)                                   # 가장자리 280px 를 부드럽게 바다색 하나로 (멀리서 봐도 지도 테두리 단이 안 보이게)
    r_, g_, b_ = a[..., 0], a[..., 1], a[..., 2]               # 바다(청록)만 · 섬 바닷가 거품·모래는 그대로
    seaish = ((g_ - r_ > 14) & (b_ - r_ > 4) & (b_ > g_ - 48) & (r_ < 150)).astype(np.float32)
    k = k * ndimage.gaussian_filter(seaish, 6)[..., None]
    a = a * (1 - k) + TOWN_MAP_SEA * k
    full = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    TOWN_OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    lo = full.resize((1024, 1024), Image.LANCZOS)
    lo.save(TOWN_OUT / "map_lo.webp", "WEBP", quality=80, method=6)
    total += (TOWN_OUT / "map_lo.webp").stat().st_size
    n = w // TOWN_TILE
    for r in range(n):
        for c in range(n):
            t = full.crop((c * TOWN_TILE, r * TOWN_TILE, (c + 1) * TOWN_TILE, (r + 1) * TOWN_TILE))
            dst = TOWN_OUT / f"map_{c}_{r}.webp"
            t.save(dst, "WEBP", quality=80, method=6)
            total += dst.stat().st_size
    # 땅: 바다(청록)가 아닌 곳 · 작은 구멍 메우고 살짝 넓혀 부드럽게
    small = np.asarray(im.resize((384, 384), Image.BILINEAR)).astype(np.float32)
    r_, g_, b_ = small[..., 0], small[..., 1], small[..., 2]
    sea = (g_ - r_ > 14) & (b_ - r_ > 4) & (b_ > g_ - 48)
    land = ndimage.binary_opening(~sea, iterations=2)
    lab, cnt = ndimage.label(land)
    if cnt:
        sizes = ndimage.sum(land, lab, range(1, cnt + 1))
        land = ndimage.binary_fill_holes(lab == (int(np.argmax(sizes)) + 1))
    land = ndimage.binary_dilation(land, iterations=3)
    al = ndimage.gaussian_filter(land.astype(np.float32), 2.0)
    al = Image.fromarray(np.clip(al * 255, 0, 255).astype(np.uint8)).resize((192, 192), Image.LANCZOS)
    m = Image.new("RGBA", al.size, (255, 255, 255, 0))
    m.putalpha(al)
    m.save(TOWN_OUT / "map_land.webp", "WEBP", lossless=True)
    total += (TOWN_OUT / "map_land.webp").stat().st_size
    print(f"town/map_lo + 조각 {n}×{n} + map_land · {total // 1024}KB")


def town_face(im):
    """옷 입은 하윤 전신 → 대사창·말하는 칸 얼굴 (위쪽 머리 부분 정사각 256)"""
    im = trim(im, 0)
    side = round(im.height * 0.4)            # 머리 + 어깨
    x0 = (im.width - side) // 2
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im.crop((max(0, x0), 0, min(im.width, x0 + side), side)), (max(0, -x0), 0))
    return sq.resize((256, 256), Image.LANCZOS)


OUTFIT_SRC = SRC / "outfits"     # 하윤 옷장 22벌 (640×1000 고정 캔버스 · 신발 바닥 y=984 · 몸 가운데 x=320) + *_bust 512² 초상 + 몽돌 소품 m_*
OUTFIT_H = 520                     # 걷는 하윤 그림 높이 (모든 옷이 같은 자르기 → 갈아입어도 몸 크기·발밑이 그대로)


def outfits(only=""):
    """art_tests/merge/outfits → town/h_outfit_<옷>.webp (전신, 22벌 같은 상자로 잘라요) · town/h_<옷>_bust.webp (대사창·말하는 칸 얼굴 256²)
    · town/m_<소품>.webp (몽돌 소품, 긴 변 256)"""
    if not OUTFIT_SRC.is_dir():
        return 0
    TOWN_OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    bodies = [f for f in sorted(OUTFIT_SRC.glob("h_outfit_*.png")) if not f.stem.endswith("_bust")]
    # 모든 옷의 보이는 곳을 합친 상자 (모자 챙·튜브까지) → 한 상자로 잘라야 옷마다 몸 크기·발밑이 같아요
    box = None
    for f in bodies:
        bb = Image.open(f).getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
        if bb:
            box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
    if box:
        cx = 320   # 몸 가운데를 그림 가운데로 (좌우 같은 폭)
        half = max(cx - box[0], box[2] - cx) + 4
        box = (cx - half, max(0, box[1] - 4), cx + half, min(1000, box[3] + 4))
    for f in bodies:
        name = f.stem
        if only and only not in ("outfits", "h_") and only not in name:
            continue
        im = Image.open(f).convert("RGBA").crop(box)
        k = OUTFIT_H / im.height
        out = im.resize((round(im.width * k), OUTFIT_H), Image.LANCZOS)
        dst = TOWN_OUT / f"{name}.webp"
        out.save(dst, "WEBP", quality=84, method=6)
        total += dst.stat().st_size
        bust = OUTFIT_SRC / f"{name}_bust.png"
        if bust.is_file():
            b = Image.open(bust).convert("RGBA").resize((256, 256), Image.LANCZOS)
            bd = TOWN_OUT / (name.replace("h_outfit_", "h_") + "_bust.webp")
            b.save(bd, "WEBP", quality=86, method=6)
            total += bd.stat().st_size
        print(f"town/{name:24s} {out.width}x{out.height} + bust")
    for f in sorted(OUTFIT_SRC.glob("m_*.png")):
        if only and only not in ("outfits", "m_") and only not in f.stem:
            continue
        out = fit_long(trim(Image.open(f).convert("RGBA")), 256)
        dst = TOWN_OUT / f"{f.stem}.webp"
        out.save(dst, "WEBP", quality=84, method=6)
        total += dst.stat().st_size
        print(f"town/{f.stem:24s} {out.width}x{out.height}")
    return total


def town(only=""):
    TOWN_OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    in_wardrobe = {f.stem for f in OUTFIT_SRC.glob("*.png")} if OUTFIT_SRC.is_dir() else set()
    for src in sorted(TOWN_SRC.glob("*")):
        name = src.stem
        if name.endswith("_src") or name.startswith("map_r") or (only and only != "town" and only not in name):
            continue   # map_r1~6(지역별 섬 6장)은 옛 지도 · 지금은 이어진 지도 town_map_tiles()
        if name in in_wardrobe or name == "h_hayun_base":
            continue   # 옷장(outfits/)에 같은 그림이 있으면 그쪽 규격으로 (outfits())
        im = Image.open(src)
        q = 82
        if name.startswith("map_"):
            out = town_map(name, im)
            q = 80
        else:
            im = im.convert("RGBA")
            if name == "b_r6_hut_c":
                im = town_patch_wall(im)
            if name == "w_mina":
                im = town_mina_legs(im)
            elif name in ("w_kkotnim", "w_rua"):
                im = town_unshadow(im)
            elif name[:2] in ("b_", "c_", "d_") and name not in SAND_SKIP:
                im = town_desand(im, name)
            out = fit_long(trim(im), {"b": 512, "c": 384, "d": 384, "m": 256, "w": 300, "h": 520}[name[0]])
            if name in STREAM_SWAP:
                out = town_stream_swap(out, name)
            if name.startswith("h_"):
                f = town_face(out)
                fd = TOWN_OUT / (name.replace("h_outfit_", "h_").replace("_base", "") + "_face.webp")
                f.save(fd, "WEBP", quality=84, method=6)
                total += fd.stat().st_size
        dst = TOWN_OUT / f"{name}.webp"
        out.save(dst, "WEBP", quality=q, method=6)
        total += dst.stat().st_size
        print(f"town/{name:22s} {out.width}x{out.height} {dst.stat().st_size // 1024}KB")
    total += outfits(only)
    if not only or only in ("town", "map", "map_"):
        town_map_tiles()
    print(f"마을 합계 {total // 1024}KB → {TOWN_OUT}")


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    if only == "map":           # 이어진 섬 지도 조각만
        town_map_tiles()
        write_list()
        return
    if only == "outfits":       # 하윤 옷장 + 몽돌 소품만
        outfits(only)
        write_list()
        return
    if only == "town" or only.startswith(("b_", "c_", "d_", "w_", "h_", "m_", "map_")):
        town(only)
        write_list()
        return
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
    if not only:
        town()
    write_list()


def write_list():
    have = sorted(f"{g}/{gid}" for g, gid, _s, _m in ART if (OUT / g / f"{gid}.webp").is_file())
    have += sorted(f"town/{f.stem}" for f in TOWN_OUT.glob("*.webp")) if TOWN_OUT.is_dir() else []
    body = ",".join(f'"{x}":1' for x in have)
    head = "/* tools/merge_art.py 가 만들어요 (손으로 고치지 않기) · 지금 static/img/merge 에 실제로 있는 그림 */"
    LIST_JS.write_text(head + "\n" + "window.MergeArtList = {" + body + "};\n", "utf-8")
    print(f"그림 목록 {len(have)}개 → {LIST_JS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
