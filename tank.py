"""아리채 오락실 · 노을언덕 포격대 (실시간 팀 포격전, 가칭) — 서버 권위 모듈

server.py 는 이 모듈에 세 가지만 넘겨요.
  - 웹소켓 메시지 중 t 가 'tk' 로 시작하는 것 → handle(ws, msg)
  - 연결이 끊기면 → on_close(ws)
  - 방 코드 중복 검사 → ROOMS (server.new_code 가 같이 봐요)

포격전 방은 rooms.pkl 에 저장하지 않아요(메모리만). 전역 MAX_PLAYERS(8)는 건드리지 않고
이 모드만 TANK_MAX = 16.
"""
import asyncio
from collections import deque
import json
import logging
import math
import random
import secrets
import time
from typing import Callable, Dict, List, Optional

log = logging.getLogger("tank")

# ---------------------------------------------------------------- 수치 (설계서 2절 초안)
TANK_MAX = 16
TEAM_MAX = 8
MIN_PER_TEAM = 1          # 팀당 최소 1명 (1대1~8대8 정식 지원)
TICK_HZ = 15
DT = 1.0 / TICK_HZ
TICK_MS = 1000.0 / TICK_HZ
SHELL_SUB = 8             # 포탄은 틱 안에서 8번 나눠 계산
W, H = 2400, 1200
CELL = 4
GW, GH = W // CELL, H // CELL
GRAV = 600.0
COOLDOWN_MS = 5000
ROUND_MS = 300_000
COUNTDOWN_MS = 3000
INV_MS = 1500
RESULT_MS = 8000
SHELL_LIFE = 8.0
WIND_MAX = 24
WIND_GAP_MS = (15_000, 20_000)   # 바람은 15~20초 무작위 간격으로 바뀜 (Chris 16:42)
FUEL_MAX = 100.0
FUEL_USE = 25.0
FUEL_REGEN = 8.0
FUEL_IDLE_S = 1.5
SLIDE_DEG = 62.0
FALL_Y = H + 40
SEAT_KEEP_MS = 60_000
ROOM_EMPTY_MS = 60_000
HOST_HANDOVER_MS = 20_000
EMO_GAP_MS = 1000
EMO_COUNT = 8
FACE_MS = 1200

KINDS = {
    #            체력 이동  폭발 최대데미지 등판 포신범위   바퀴반폭 판정(폭,높이) 포신축 높이·길이
    "mongdol": dict(hp=130, speed=55, r=44, dmg=38, climb=50, amin=0, amax=50, half=22, bw=56, bh=30, ph=32, pl=26, pfx=2),
    "mangru": dict(hp=100, speed=80, r=32, dmg=32, climb=58, amin=15, amax=65, half=18, bw=48, bh=40, ph=42, pl=36, pfx=-6),
}
KIND_NAME = {"mongdol": "몽돌", "mangru": "망루"}

# ---------------------------------------------------------------- 맵 (map_2d_v3 · Chris 16:39)
# 좌우 큰 떠 있는 대지(풀 언덕이 가운데로 내려감) + 떠 있는 섬 6개 + 진지 안쪽→낮은 섬 흙다리 2개.
# 진지·섬·다리 아래와 좌우 사이 가운데는 모두 하늘(추락). 수치는 설계서 2.6 초안.
MAP_ID = "v3"
MAIN_W = 600                       # 진지 x 0~600 (오른쪽은 좌우 대칭)
CLIFF_X = 520                      # 안쪽 절벽 시작
# 섬: (번호, 윗면 x0, x1, 윗면 y, 두께, 폭포 시작 x 또는 None)
ISLANDS = [
    (1, 520, 780, 260, 80, 752),
    (2, 980, 1090, 180, 40, None),
    (3, 700, 900, 560, 60, 872),
    (4, 1300, 1390, 230, 36, None),
    (5, 1500, 1700, 560, 60, 1528),
    (6, 1620, 1880, 280, 80, 1648),
]
BRIDGES = [(600, 500, 700, 560), (1800, 500, 1700, 560)]   # (진지 쪽 x, y, 섬 쪽 x, y) · 두께 16
BRIDGE_T = 16
SLOTS_L = [96, 176, 256, 336, 416, 496, 640, 790]
SLOTS_R = [W - x for x in reversed(SLOTS_L)]
BED_DEPTH = 64                     # 스폰 구간: 처음 윗면에서 64px 아래부터 밑면까지 기반암
BED_ZONES = [(64, 520), (W - 520, W - 64)]
SOFT_ZONES = [(0, 64), (CLIFF_X, MAIN_W), (W - MAIN_W, W - CLIFF_X), (W - 64, W)]   # 파임 반경 ×1.25
SOFT_MUL = 1.25


def _hash01(i: int) -> float:
    """작은 결정적 잡음 (서버·클라 모두 같은 마스크를 서버에서만 만들고 보내므로 파이썬 쪽만 있으면 됨)."""
    v = (i * 2654435761) & 0xFFFFFFFF
    v ^= v >> 13
    v = (v * 1274126177) & 0xFFFFFFFF
    return ((v ^ (v >> 16)) & 0xFFFF) / 65535.0


def main_top(m: float) -> float:
    """진지 윗면 y (m = 맵 끝에서 안쪽으로 거리). 0→520 에서 410→470 (약 7°) + 잔물결, 절벽 520→600 에서 500."""
    if m < CLIFF_X:
        return 410 + 60 * (m / CLIFF_X) + 3 * math.sin(m / 37.0) + 2 * math.sin(m / 13.0 + 1.3)
    t = (m - CLIFF_X) / (MAIN_W - CLIFF_X)
    base = 410 + 60 + 3 * math.sin(CLIFF_X / 37.0) + 2 * math.sin(CLIFF_X / 13.0 + 1.3)
    return base + (500 - base) * (t * t * (3 - 2 * t))


def main_bot(m: float) -> float:
    """진지 밑면 y: 가운데가 두껍고(≈740) 바깥 끝(≈700)·안쪽 끝(≈590)으로 얇아짐 + 울퉁불퉁."""
    if m <= 430:
        b = 700 + 42 * math.sin(math.pi * (m + 30) / 920)
    else:
        t = (m - 430) / (MAIN_W - 430)
        b0 = 700 + 42 * math.sin(math.pi * 460 / 920)
        b = b0 + (585 - b0) * t ** 1.4
    return b + 6 * math.sin(m / 23.0) + 4 * (_hash01(int(m // 8)) - 0.5)


def island_bot(x: float, x0: float, x1: float, y0: float, th: float) -> float:
    """섬 아래쪽: 가운데가 가장 두껍고 양끝으로 둥글게 좁아짐."""
    mid = (x0 + x1) / 2
    hw = (x1 - x0) / 2
    u = min(1.0, abs(x - mid) / hw)
    d = th * (1 - u ** 2.2) ** 0.75
    d += 3 * math.sin(x / 9.0) * (1 - u)
    return y0 + max(10.0, d)


def column_spans(cx: float) -> List[tuple]:
    """x 열의 단단한 구간 목록 (y0, y1)."""
    out = []
    for side in (0, 1):
        m = cx if side == 0 else W - cx
        if 0 <= m < MAIN_W:
            out.append((main_top(m), main_bot(m)))
    for (_, x0, x1, y0, th, _f) in ISLANDS:
        if x0 <= cx < x1:
            out.append((float(y0), island_bot(cx, x0, x1, y0, th)))
    for (ax, ay, bx, by) in BRIDGES:
        lo, hi = min(ax, bx), max(ax, bx)
        if lo - 4 <= cx < hi + 4:
            t = clamp((cx - ax) / (bx - ax), 0.0, 1.0)
            top = ay + (by - ay) * t
            out.append((top, top + BRIDGE_T))
    return out


def build_mask() -> bytearray:
    m = bytearray(GW * GH)
    for gx in range(GW):
        cx = gx * CELL + CELL / 2
        for (y0, y1) in column_spans(cx):
            a = max(0, int(math.ceil((y0 - CELL / 2) / CELL)))
            b = min(GH, int(math.ceil((y1 - CELL / 2) / CELL)))
            for gy in range(a, b):
                m[gy * GW + gx] = 1
    return m


def build_bedrock() -> tuple:
    """기반암: 스폰 구간 16px 띠마다 [x0, x1, y0, y1] 사각형 (서버·클라 같은 표). 마스크는 칸마다 1."""
    rects = []
    for (zx0, zx1) in BED_ZONES:
        for x in range(zx0, zx1, 16):
            xs = [x + i for i in range(0, 17, 4)]
            ms = [xx if xx < W / 2 else W - xx for xx in xs]
            top = max(main_top(mm) for mm in ms) + BED_DEPTH
            bot = min(main_bot(mm) for mm in ms) - 8
            y0 = int(math.ceil(top / CELL)) * CELL
            y1 = int(bot // CELL) * CELL
            if y1 > y0:
                rects.append([x, x + 16, y0, y1])
    bm = bytearray(GW * GH)
    for (x0, x1, y0, y1) in rects:
        for gy in range(y0 // CELL, y1 // CELL):
            for gx in range(x0 // CELL, x1 // CELL):
                bm[gy * GW + gx] = 1
    return rects, bm


def clamp(v, a, b):
    return a if v < a else b if v > b else v


BASE_MASK = build_mask()
BED_RECTS, BEDROCK = build_bedrock()


def mask_rle(m: bytearray) -> List[int]:
    """행 우선 실행 길이 (0부터 시작해 번갈아)."""
    out: List[int] = []
    cur = 0
    run = 0
    for v in m:
        if v == cur:
            run += 1
        else:
            out.append(run)
            cur = v
            run = 1
    out.append(run)
    return out


BASE_RLE = mask_rle(BASE_MASK)
GEO = {
    "islands": [[i, x0, x1, y0, th] for (i, x0, x1, y0, th, _f) in ISLANDS],
    "falls": [[i, fx, y0 + 6] for (i, x0, x1, y0, th, fx) in ISLANDS if fx],
    "bridges": [list(b) for b in BRIDGES], "bt": BRIDGE_T,
    "bed": BED_RECTS, "soft": [list(z) for z in SOFT_ZONES], "softMul": SOFT_MUL,
    "main": MAIN_W, "cliff": CLIFF_X,
}


def solid(m: bytearray, x: float, y: float) -> bool:
    gx = int(x // CELL)
    gy = int(y // CELL)
    if gx < 0 or gx >= GW or gy < 0 or gy >= GH:
        return False
    return m[gy * GW + gx] == 1


WALL = -1.0


def surface(m: bytearray, x: float, y: float, up: float = 8, down: float = 12) -> Optional[float]:
    """x 에서 y 근처 지면 윗면. 위로 up px 안, 아래로 down px 안에서 찾음. 너무 높으면 WALL, 없으면 None."""
    gx = int(x // CELL)
    if gx < 0 or gx >= GW:
        return None
    c = int(round(y / CELL))

    def sc(cy):
        return 0 <= cy < GH and m[cy * GW + gx] == 1

    if sc(c):
        c0 = c
        n = 0
        while sc(c - 1):
            c -= 1
            n += 1
            if n * CELL > up:
                # 머리 위 지형(섬 밑면·돌출부) 밑단에 닿았을 뿐 바로 아래 바닥이 있으면 바닥을 우선
                if not sc(c0 + 1):
                    for k in range(2, int(down // CELL) + 1):
                        if sc(c0 + k) and not sc(c0 + k - 1):
                            return float((c0 + k) * CELL)
                return WALL
        return float(c * CELL)
    n = 0
    while not sc(c):
        c += 1
        n += 1
        if n * CELL > down or c >= GH:
            return None
    return float(c * CELL)


def _step_col(m: bytearray, x: float, y: float, up: float = 8, down: float = 12) -> Optional[float]:
    """한 열(x)에서 y 근처 지면 윗면. 아래로 가까운 면을 우선하고, 얇은 오르막만 위로 탐색(머리 위 지형 제외)."""
    g = surface(m, x, y, up, down)
    if g is not None:
        return g
    gx = int(x // CELL)
    if gx < 0 or gx >= GW:
        return None
    c = int(round(y / CELL))
    max_up = int(up // CELL)
    for k in range(1, max_up + 1):
        cy = c - k
        if cy < 0:
            break
        if m[cy * GW + gx] == 1:
            top = cy
            while top > 0 and m[(top - 1) * GW + gx] == 1:
                top -= 1
                if (c - top) * CELL > up:
                    return None
            return float(top * CELL)
    return None


def _trace_surface(m: bytearray, x0: float, y0: float, tx: float, step_up: float = 8, step_down: float = 12) -> Optional[float]:
    """x0에서 tx까지 CELL 간격으로 이어진 지면 윗면을 따라가며 최종 y를 반환."""
    dx = tx - x0
    if abs(dx) < 1e-6:
        return _step_col(m, tx, y0, step_up, step_down)
    steps = max(1, int(math.ceil(abs(dx) / CELL)))
    py = y0
    for i in range(1, steps + 1):
        xx = x0 + dx * (i / steps)
        g = _step_col(m, xx, py, step_up, step_down)
        if g is None or g == WALL:
            return g
        py = g
    return py


def _wheel_surface(m: bytearray, x0: float, y0: float, wx: float, max_up: float = 24, max_down: float = 26) -> Optional[float]:
    """바퀴 한 점(wx)의 지면 y: 아래 가까운 면을 우선하고, 머리 위 지형(섬 밑면 등)은 지면으로 오인하지 않음."""
    g = _trace_surface(m, x0, y0, wx, 12, 14)
    if g not in (None, WALL) and -max_up <= g - y0 <= max_down:
        return g
    gx = int(wx // CELL)
    if gx < 0 or gx >= GW:
        return None
    c0 = int(round(y0 / CELL))
    down_c = int(max_down // CELL)
    up_c = int(max_up // CELL)
    for c in range(max(0, c0), min(GH, c0 + down_c + 1)):
        if m[c * GW + gx] == 1 and (c == 0 or m[(c - 1) * GW + gx] == 0):
            return float(c * CELL)
    if 0 <= c0 < GH and m[c0 * GW + gx] == 1:
        top = c0
        while top > 0 and m[(top - 1) * GW + gx] == 1:
            top -= 1
            if (c0 - top) * CELL > max_up:
                return None
        return float(top * CELL)
    for k in range(1, up_c + 1):
        cy = c0 - k
        if cy < 0:
            break
        if m[cy * GW + gx] == 1:
            top = cy
            while top > 0 and m[(top - 1) * GW + gx] == 1:
                top -= 1
                if (c0 - top) * CELL > max_up:
                    return None
            return float(top * CELL)
    return None


def _span_support(x: float, half: float, col_fn: Callable[[int], Optional[float]]) -> Optional[float]:
    """중심 열 또는 차체 좌우 양쪽 열이 모두 지지할 때 지면 y 반환(절벽 끝 한쪽만 걸친 경우는 None)."""
    gx_c = int(x // CELL)
    if 0 <= gx_c < GW:
        vc = col_fn(gx_c)
        if vc is not None:
            return vc
    gx_l = max(0, int((x - half) // CELL))
    gx_r = min(GW - 1, int((x + half) // CELL))
    yl = next((v for gx in range(min(GW - 1, gx_c - 1), gx_l - 1, -1) if (v := col_fn(gx)) is not None), None)
    yr = next((v for gx in range(max(0, gx_c + 1), gx_r + 1) if (v := col_fn(gx)) is not None), None)
    if yl is not None and yr is not None:
        return (yl + yr) * 0.5
    return None


def _step_ground(m: bytearray, x: float, y: float, half: float, up: float = 12, down: float = 12) -> Optional[float]:
    """보행 중 발밑 지면 y (벽이면 WALL, 중앙과 양 바퀴 모두 지지가 없을 때만 None)."""
    g = _step_col(m, x, y, up, down)
    if g is not None:
        return g

    def col_walk(gx: int) -> Optional[float]:
        v = _step_col(m, gx * CELL + CELL / 2, y, up, down)
        return None if v == WALL else v

    gx_c = int(x // CELL)
    gx_l = max(0, int((x - half) // CELL))
    gx_r = min(GW - 1, int((x + half) // CELL))
    yl = next((v for gx in range(min(GW - 1, gx_c - 1), gx_l - 1, -1) if (v := col_walk(gx)) is not None), None)
    yr = next((v for gx in range(max(0, gx_c + 1), gx_r + 1) if (v := col_walk(gx)) is not None), None)
    if yl is not None and yr is not None:
        return (yl + yr) * 0.5
    if yl is not None:
        return yl
    if yr is not None:
        return yr
    return None


def _land_y(m: bytearray, x: float, y0: float, ny: float, half: float) -> Optional[float]:
    """낙하 중 한 틱 이동 구간 [y0, ny] 전체를 차체 폭 [x-half, x+half] 기준으로 검사해 착지 y 반환."""
    c0 = max(0, int(y0 // CELL))
    c1 = min(GH - 1, int(ny // CELL))
    if c1 < c0:
        return None

    def col_land(gx: int) -> Optional[float]:
        if gx < 0 or gx >= GW:
            return None
        if m[c0 * GW + gx] == 1:
            tc = c0
            while tc > 0 and m[(tc - 1) * GW + gx] == 1:
                tc -= 1
            # 얇은 다리 윗칸에 이미 살짝 걸친 상태로 낙하 시작 시 관통 방지(아래에 있을 때는 절대 위로 순간이동 금지)
            if y0 - tc * CELL <= 2 * CELL:
                return float(tc * CELL)
        for c in range(c0, c1 + 1):
            if m[c * GW + gx] == 1 and c * CELL >= y0 - 0.01:
                return float(c * CELL)
        return None

    return _span_support(x, half, col_land)


def carve_radius(x: float, r: int) -> int:
    """안쪽 절벽·바깥 가장자리는 더 잘 팜 (데미지 반경은 그대로)."""
    for (a, b) in SOFT_ZONES:
        if a <= x < b:
            return int(round(r * SOFT_MUL))
    return r


def carve(m: bytearray, x: int, y: int, r: int) -> None:
    """클라이언트와 똑같은 규칙: 칸 가운데가 원 안이면 지움 · 기반암 칸은 남김."""
    r2 = r * r
    gx0 = max(0, (x - r) // CELL)
    gx1 = min(GW - 1, (x + r) // CELL)
    gy0 = max(0, (y - r) // CELL)
    gy1 = min(GH - 1, (y + r) // CELL)
    bm = BEDROCK
    for gy in range(gy0, gy1 + 1):
        cy = gy * CELL + 2 - y
        row = gy * GW
        for gx in range(gx0, gx1 + 1):
            cx = gx * CELL + 2 - x
            if cx * cx + cy * cy <= r2 and not bm[row + gx]:
                m[row + gx] = 0


def edge_dist(m: bytearray, x: float, y: float, d: int, limit: int = 140) -> int:
    """x 에서 d 방향으로 걸어가며 발밑이 끊기는 곳까지 거리(px, 최대 limit)."""
    py = y
    for i in range(1, limit // 4 + 1):
        g = _step_col(m, x + d * i * 4, py, 24, 16)
        if g is None:
            return i * 4
        if g != WALL:
            py = g
    return limit


def check_slots() -> bool:
    """안전 슬롯 조건: 간격 80px 이상, 경사 15° 이하, 진지(가장자리 96·안쪽 100·기반암) 또는 섬(양끝 여유 60·두께 40)."""
    ok = True
    for side, xs in (("L", SLOTS_L), ("R", SLOTS_R)):
        good = 0
        for x in xs:
            s = surface(BASE_MASK, x, 100, 100, 700)
            if s is None or s == WALL:
                continue
            tilts = []
            for k in KINDS.values():
                a = surface(BASE_MASK, x - k["half"], s, 20, 20)
                b = surface(BASE_MASK, x + k["half"], s, 20, 20)
                if a in (None, WALL) or b in (None, WALL):
                    tilts.append(90)
                else:
                    tilts.append(abs(math.degrees(math.atan2(a - b, 2 * k["half"]))))
            m = x if x < W / 2 else W - x
            if m < MAIN_W:
                far_edge = 96 <= m and (MAIN_W - m) >= 100
                gx = int(x // CELL)
                safe = far_edge and BEDROCK[(int(s + BED_DEPTH + 8) // CELL) * GW + gx] == 1
            else:
                safe = (edge_dist(BASE_MASK, x, s, -1, 80) >= 60
                        and edge_dist(BASE_MASK, x, s, 1, 80) >= 60
                        and solid(BASE_MASK, x, s + 40))
            if max(tilts) <= 15 and safe:
                good += 1
        sxs = sorted(xs)
        min_gap = min((b - a for a, b in zip(sxs, sxs[1:])), default=0)
        gaps = min_gap >= 80
        log.info("[포격전] 맵 %s 안전 슬롯 %s 진지 %d/8 통과 · 최소간격 %dpx(%s) · 기반암 %d칸", MAP_ID, side, good,
                 min_gap, "OK" if gaps else "부족", len(BED_RECTS))
        ok = ok and good >= 8 and gaps
    return ok


SLOTS_OK = check_slots()


def now() -> float:
    return time.monotonic() * 1000.0



# ---------------------------------------------------------------- 연결
_clean_name: Callable[[object], str] = lambda raw: (str(raw or "").strip() or "플레이어")[:8]
_codes_taken: Callable[[], object] = lambda: ()
ROOMS: Dict[str, "TRoom"] = {}
CONN: Dict[object, tuple] = {}       # ws → (code, pid)
_loop_task: Optional[asyncio.Task] = None


def bind(clean_name=None, codes_taken=None) -> None:
    """server.py 가 clean_name()과 기존 방 코드 목록을 넘겨줘요 (순환 import 방지)."""
    global _clean_name, _codes_taken
    if clean_name:
        _clean_name = clean_name
    if codes_taken:
        _codes_taken = codes_taken


def new_code() -> str:
    taken = _codes_taken()
    for _ in range(2000):
        c = f"{random.randint(1000, 9999)}"
        if c not in ROOMS and c not in taken:
            return c
    raise RuntimeError("방 코드를 만들 수 없어요")


class _SendState:
    def __init__(self):
        self.events: deque = deque()
        self.latest_snap: Optional[str] = None
        self.task: Optional[asyncio.Task] = None


_SEND_STATES: Dict[object, _SendState] = {}


async def _pump_send(ws, state: _SendState) -> None:
    try:
        while (state.events or state.latest_snap is not None) and not getattr(ws, "closed", False):
            if state.events:
                text = state.events.popleft()
            else:
                text = state.latest_snap
                state.latest_snap = None
            try:
                await ws.send_text(text)
            except Exception:
                break
    finally:
        state.task = None
        if getattr(ws, "closed", False):
            _SEND_STATES.pop(ws, None)


def send(ws, payload, is_snap: bool = False) -> None:
    if ws is None or getattr(ws, "closed", False):
        return
    if not is_snap and isinstance(payload, dict) and payload.get("t") == "tksnap":
        is_snap = True
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    state = _SEND_STATES.get(ws)
    if state is None:
        state = _SendState()
        _SEND_STATES[ws] = state
    if is_snap:
        state.latest_snap = text
    else:
        state.events.append(text)
    if state.task is None or state.task.done():
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        state.task = loop.create_task(_pump_send(ws, state))


class TokenBucket:
    def __init__(self, rate: float, cap: Optional[float] = None, now_s: Optional[float] = None):
        self.rate = float(rate)
        self.cap = float(rate if cap is None else cap)
        self.tokens = self.cap
        self.last = time.monotonic() if now_s is None else now_s

    def refill(self, now_s: float) -> None:
        elapsed = max(0.0, now_s - self.last)
        self.last = now_s
        if elapsed > 0.0:
            self.tokens = min(self.cap, self.tokens + elapsed * self.rate)

    def can_take(self, now_s: float) -> bool:
        self.refill(now_s)
        return self.tokens >= 1.0

    def take(self, now_s: float) -> bool:
        self.refill(now_s)
        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


class _RateState:
    def __init__(self, now_s: float):
        self.total = TokenBucket(40.0, 40.0, now_s)
        self.buckets = {
            "tkin": TokenBucket(20.0, 20.0, now_s),
            "tkaim": TokenBucket(20.0, 20.0, now_s),
            "tkfire": TokenBucket(4.0, 4.0, now_s),
            "other": TokenBucket(10.0, 10.0, now_s),
        }
        self.last_drop_log = -1e9
        self.drop_streak_start = 0.0
        self.last_drop_at = 0.0
        self.warned_at = -1e9


_RATE_STATES: Dict[object, _RateState] = {}


def allow_rate(ws, msg_type: str, now_s: Optional[float] = None, room_code: str = "-", who: str = "-") -> bool:
    t_s = time.monotonic() if now_s is None else now_s
    st = _RATE_STATES.get(ws)
    if st is None:
        st = _RateState(t_s)
        _RATE_STATES[ws] = st
    # tkemo 는 기존 1초(EMO_GAP_MS) 검사를 유지하고 전체 합(40/초) 버킷만 적용
    tb = None if msg_type == "tkemo" else st.buckets.get(msg_type, st.buckets["other"])
    ok_type = True if tb is None else tb.can_take(t_s)
    ok_total = st.total.can_take(t_s)
    if ok_type and ok_total:
        if tb is not None:
            tb.tokens -= 1.0
        st.total.tokens -= 1.0
        return True
    if t_s - st.last_drop_log >= 1.0:
        st.last_drop_log = t_s
        log.info("[포격전 %s] rate_drop %s %s", room_code, who, msg_type)
    if st.drop_streak_start == 0.0 or (t_s - st.last_drop_at) > 1.5:
        st.drop_streak_start = t_s
    st.last_drop_at = t_s
    if (t_s - st.drop_streak_start) >= 10.0 and (t_s - st.warned_at) >= 10.0:
        st.warned_at = t_s
        log.warning("[포격전 %s] rate_flood %s %s (%.1fs)", room_code, who, msg_type, t_s - st.drop_streak_start)
    return False


# ---------------------------------------------------------------- 상태
class Seat:
    def __init__(self, pid: str, name: str, order: int, ai: bool = False, lv: str = "easy"):
        self.pid = pid
        self.token = "" if ai else secrets.token_hex(12)
        self.name = name
        self.kind = "mongdol"
        self.team = "A"
        self.ai = ai
        self.lv = lv
        self.ws = None
        self.on = ai
        self.order = order
        self.st = "lobby"          # lobby / play / spec / wait
        self.last_emo = 0.0
        self.disc_at = 0.0
        self.spec = None           # 관전 대상 pid
        self.spec_switch_at = 0.0
        self.out = False           # AI: 판 진행 중 「빼기」 → 이번 판은 끝까지, _finish_round 때 빠짐

    def row(self) -> dict:
        d = {"id": self.pid, "n": self.name, "k": self.kind, "tm": self.team, "on": 1 if self.on else 0, "st": self.st}
        if self.ai:
            d["ai"] = 1
            d["lv"] = self.lv
            if self.out:
                d["out"] = 1
        return d


class Tank:
    def __init__(self, seat: Seat, x: float, y: float, face: int):
        self.pid = seat.pid
        self.kind = seat.kind
        self.team = seat.team
        self.name = seat.name
        self.ai = seat.ai
        self.lv = seat.lv
        self.K = KINDS[self.kind]
        self.x = x
        self.y = y
        self.vy = 0.0
        self.face = face
        self.bt = 0.0
        self.a = float(round((self.K["amin"] + self.K["amax"]) / 2))
        self.p = 60.0
        self.hp = self.K["hp"]
        self.fuel = FUEL_MAX
        self.idle = 0.0
        self.cd_until = 0.0
        self.inv_until = 0.0
        self.f = 0
        self.f_until = 0.0
        self.alive = True
        self.falling = False
        self.d = 0
        self.moving = False
        self.dead_at = 0.0
        self.cause = ""
        self.aim_at = now()
        self.shots = 0
        self.hits = 0
        self.dealt = 0
        self.kills = 0
        self.ffk = 0
        self.killer = ""           # 이 탱크를 격추(추락 포함)로 인정받은 쏜 사람 pid
        # 추락 격추 인정용: 이 탱크를 맞히거나 발밑을 파낸 마지막 적/아군 포탄 (시각 ms, 쏜 사람 pid)
        self.last_enemy = (0.0, "")
        self.last_ally = (0.0, "")
        self.brain: Optional[dict] = None

    def center(self):
        return self.x, self.y - self.K["bh"] / 2

    def snap(self, t: float) -> list:
        st = 2 if not self.alive else (1 if self.falling else 0)
        return [self.pid, round(self.x, 1), round(self.y, 1), self.face, int(round(self.bt * 10)), int(round(self.a)),
                int(round(self.p)), max(0, int(math.ceil(self.hp))), int(self.fuel), max(0, int(self.cd_until - t)),
                max(0, int(self.inv_until - t)), self.f, st, 1 if self.moving else 0,
                self.kills, self.hits, self.dealt, self.ffk]


class Round:
    def __init__(self, room: "TRoom", seats: List[Seat]):
        self.room = room
        self.mask = bytearray(BASE_MASK)
        self.seed = random.getrandbits(32)
        rng = random.Random(self.seed)
        self.side = {"A": "L", "B": "R"} if rng.random() < 0.5 else {"A": "R", "B": "L"}
        self.tanks: Dict[str, Tank] = {}
        spawn = []
        for team in ("A", "B"):
            members = [s for s in seats if s.team == team]
            xs = list(SLOTS_L if self.side[team] == "L" else SLOTS_R)
            idx = list(range(len(xs)))
            rng.shuffle(idx)
            rng.shuffle(members)
            for s, i in zip(members, idx):
                x = float(xs[i])
                y = surface(self.mask, x, 100, 100, 700) or 380.0
                face = 1 if self.side[team] == "L" else -1
                tk = Tank(s, x, y, face)
                self.tanks[s.pid] = tk
                spawn.append({"id": s.pid, "slot": i, "x": x, "y": y, "fa": face})
        self.spawn = spawn
        log.info("[포격전 %s] 판 시작 seed=%d 진지=%s 슬롯=%s", room.code, self.seed, self.side,
                 [(d["id"], d["slot"]) for d in spawn])
        t = now()
        self.t0 = t
        self.play_at = t + COUNTDOWN_MS
        self.end_at = self.play_at + ROUND_MS
        for tk in self.tanks.values():
            tk.inv_until = self.play_at + INV_MS
            if tk.ai:
                tk.brain = new_brain(tk, rng)
        # 바람: 그 판 시드에서 이어지는 난수. at 은 라운드 시계 ms (카운트다운 끝 = 0)
        self.wrng = random.Random(rng.getrandbits(32))
        self.wind = self.wrng.randint(-WIND_MAX, WIND_MAX)
        self.wn = {"at": self.wrng.randint(*WIND_GAP_MS), "w": self.wrng.randint(-WIND_MAX, WIND_MAX)}
        self.shells: List[dict] = []
        self.sid = 0
        self.k = 0
        self.over = False
        self.result: Optional[dict] = None
        self.result_until = 0.0
        self.recent_carves: List[tuple] = []   # (t, x, r) — AI 추락 원인 기록용
        self.last_ff_avoid_at = 0.0

    def tl(self, t: float) -> int:
        return max(0, int(self.end_at - t))

    def rc(self, t: float) -> int:
        """라운드 시계 ms (카운트다운 중은 음수)."""
        return int(t - self.play_at)

    def step_wind(self, t: float) -> None:
        """예고한 시각이 되면 바꾸고, 그 틱에 다음 변경(15~20초 뒤)을 정해 모두에게 미리 알림."""
        rc = self.rc(t)
        if rc < self.wn["at"]:
            return
        prev, at = self.wind, self.wn["at"]
        self.wind = self.wn["w"]
        gap = self.wrng.randint(*WIND_GAP_MS)
        self.wn = {"at": at + gap, "w": self.wrng.randint(-WIND_MAX, WIND_MAX)}
        log.info("[포격전 %s] wind_change rc=%d %d→%d 다음 %dms 뒤 %d", self.room.code, at, prev, self.wind, gap,
                 self.wn["w"])
        self.room.cast({"t": "tkwind", "k": self.k, "at": self.wn["at"], "w": self.wn["w"], "cur": self.wind,
                        "next": self.wn, "rc": rc})

    def alive_count(self) -> Dict[str, int]:
        c = {"A": 0, "B": 0}
        for tk in self.tanks.values():
            if tk.alive:
                c[tk.team] += 1
        return c

    def start_msg(self, for_pid: str = "") -> dict:
        t = now()
        sp = 1 if for_pid and (for_pid not in self.tanks or not self.tanks[for_pid].alive) else 0
        return {
            "t": "tkround", "map": MAP_ID, "geo": GEO, "rle": mask_rle(self.mask) if self.k > 0 else BASE_RLE, "gw": GW, "gh": GH,
            "seed": self.seed, "side": self.side, "spawn": self.spawn, "inv": INV_MS,
            "wind": self.wind, "cur": self.wind, "wn": self.wn, "next": self.wn, "rc": self.rc(t),
            "cdn": max(0, int(self.play_at - t)), "endsIn": self.tl(t), "k": self.k, "spec": sp,
            "tanks": [{"id": tk.pid, "n": tk.name, "k": tk.kind, "tm": tk.team, "ai": 1 if tk.ai else 0,
                       "lv": tk.lv if tk.ai else ""} for tk in self.tanks.values()],
            "me": for_pid,
        }


class TRoom:
    def __init__(self, code: str):
        self.code = code
        self.seats: Dict[str, Seat] = {}
        self.host = ""
        self.counter = 0
        self.ai_counter = 0
        self.round: Optional[Round] = None
        self.empty_since = now()
        self.host_lost_at = 0.0
        self.notice = ""
        self._exc_log: Dict[tuple, float] = {}

    # ---- 명단
    def humans(self) -> List[Seat]:
        return sorted([s for s in self.seats.values() if not s.ai], key=lambda s: s.order)

    def team_count(self, team: str) -> int:
        return sum(1 for s in self.seats.values() if s.team == team)

    def ready_count(self, team: str) -> int:
        """판에 실제로 들어갈 자리 수 (AI + 연결된 사람). 끊긴 사람만 있는 팀으로 시작하면 바로 '전멸' 승리가 됨."""
        return sum(1 for s in self.seats.values() if s.team == team and (s.ai or (s.on and s.ws is not None)))

    def start_check(self):
        a = self.ready_count("A")
        b = self.ready_count("B")
        if self.round is not None:
            return False, "판이 끝나면 다음 판이 시작돼요"
        if not SLOTS_OK:
            return False, "맵 자리 검사에 실패했어요"
        if a < MIN_PER_TEAM or b < MIN_PER_TEAM:
            return False, f"팀마다 {MIN_PER_TEAM}명 이상 있어야 시작할 수 있어요 (지금 A {a}명 · B {b}명)"
        if a > TEAM_MAX or b > TEAM_MAX:
            return False, "한 팀은 8명까지예요"
        return True, ""

    def lobby_msg(self) -> dict:
        ok, why = self.start_check()
        a = self.team_count("A")
        b = self.team_count("B")
        d = {"t": "tklobby", "code": self.code, "host": self.host,
             "players": [s.row() for s in sorted(self.seats.values(), key=lambda s: s.order)],
             "canStart": ok, "why": why, "max": TANK_MAX, "teamMax": TEAM_MAX, "minTeam": MIN_PER_TEAM,
             "diff": abs(a - b), "notice": self.notice}
        if self.round is not None:
            t = now()
            d["round"] = {"tl": self.round.tl(t), "alive": self.round.alive_count(), "over": 1 if self.round.over else 0}
        return d

    def push_lobby(self) -> None:
        msg = json.dumps(self.lobby_msg(), ensure_ascii=False, separators=(",", ":"))
        for s in self.seats.values():
            if s.ws is not None:
                send(s.ws, msg)
        self.notice = ""

    def viewers(self):
        for s in self.seats.values():
            if s.ws is not None and s.st in ("play", "spec"):
                yield s

    def cast(self, payload) -> None:
        is_snap = isinstance(payload, dict) and payload.get("t") == "tksnap"
        msg = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        for s in self.viewers():
            send(s.ws, msg, is_snap=is_snap)

    def auto_team(self) -> str:
        return "A" if self.team_count("A") <= self.team_count("B") else "B"

    def drop_ai_for(self, team: Optional[str]) -> Optional[Seat]:
        """사람 자리 우선: 그 팀(없으면 인원 많은 팀)에서 가장 나중에 넣은 AI 1대를 뺌."""
        if team is None:
            team = "A" if self.team_count("A") >= self.team_count("B") else "B"
        ais = [s for s in self.seats.values() if s.ai and s.team == team]
        if not ais:
            ais = [s for s in self.seats.values() if s.ai]
        if not ais:
            return None
        victim = max(ais, key=lambda s: s.order)
        self.seats.pop(victim.pid, None)
        return victim


# ---------------------------------------------------------------- 메시지 처리
def err(ws, code: str, msg: str = "", **kw) -> None:
    d = {"t": "tkerr", "code": code, "msg": msg}
    d.update(kw)
    send(ws, d)


def _ensure_loop() -> None:
    global _loop_task
    if _loop_task is None or _loop_task.done():
        _loop_task = asyncio.ensure_future(main_loop())


def _attach(ws, room: TRoom, seat: Seat) -> None:
    old = seat.ws
    if old is not None and old is not ws:
        CONN.pop(old, None)
    seat.ws = ws
    seat.on = True
    seat.disc_at = 0.0
    CONN[ws] = (room.code, seat.pid)
    if room.host == seat.pid:
        room.host_lost_at = 0.0


def _parse_int(val, default: Optional[int] = 0) -> Optional[int]:
    if val is None or val == "":
        return default
    if isinstance(val, bool):
        return None
    try:
        fv = float(val)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(fv):
        return None
    return int(fv)


async def handle(ws, msg: dict) -> None:
    _ensure_loop()
    t = msg.get("t")
    cur = CONN.get(ws)
    room = ROOMS.get(cur[0]) if cur else None
    seat = room.seats.get(cur[1]) if (room and cur) else None
    if not allow_rate(ws, str(t or ""), room_code=room.code if room else "-", who=seat.name if seat else "-"):
        return

    if t == "tkjoin":
        if seat is not None:
            _leave(room, seat)
        code = str(msg.get("room") or "").strip()
        name = _clean_name(msg.get("name"))
        if code:
            room = ROOMS.get(code)
            if room is None:
                return err(ws, "no_room", "방을 찾을 수 없어요")
        else:
            room = TRoom(new_code())
            ROOMS[room.code] = room
            log.info("[포격전 %s] 새 방", room.code)
        team = room.auto_team()
        notice = ""
        if len(room.seats) >= TANK_MAX or room.team_count(team) >= TEAM_MAX:
            gone = room.drop_ai_for(team if room.team_count(team) >= TEAM_MAX else None) if room.round is None else None
            if gone is None:
                return err(ws, "full", f"방이 꽉 찼어요 (최대 {TANK_MAX}명)")
            notice = f"AI 1대를 빼고 {name}님이 들어왔어요"
            team = room.auto_team()
        room.counter += 1
        seat = Seat(secrets.token_hex(5), name, room.counter)
        seat.team = team
        if room.round is not None:
            seat.st = "wait"
        room.seats[seat.pid] = seat
        if not room.host or room.host not in room.seats or room.seats[room.host].ai:
            room.host = seat.pid
        _attach(ws, room, seat)
        send(ws, {"t": "tkjoined", "pid": seat.pid, "token": seat.token, "code": room.code, "name": seat.name})
        room.notice = notice
        room.push_lobby()
        return

    if t == "tkrejoin":
        code = msg.get("room")
        pid = msg.get("pid")
        tok = msg.get("token")
        room = ROOMS.get(code) if isinstance(code, str) else None
        seat = room.seats.get(pid) if (room and isinstance(pid, str)) else None
        tok_ok = (
            seat is not None
            and not seat.ai
            and isinstance(tok, str)
            and len(tok) == len(seat.token)
            and tok.isascii()
            and secrets.compare_digest(seat.token, tok)
        )
        if not tok_ok:
            return err(ws, "no_room", "판이 끝났거나 방이 없어졌어요. 대기실로 다시 들어와 주세요")
        _attach(ws, room, seat)
        send(ws, {"t": "tkjoined", "pid": seat.pid, "token": seat.token, "code": room.code, "name": seat.name, "re": 1})
        rd = room.round
        if rd is not None and not rd.over and seat.pid in rd.tanks and seat.st in ("play", "spec"):
            tk = rd.tanks[seat.pid]
            seat.st = "play" if tk.alive else "spec"
            send(ws, rd.start_msg(seat.pid))
            if not tk.alive:
                _spec_pick(room, seat, 0)
        elif seat.st in ("play", "spec"):
            seat.st = "lobby"
        room.push_lobby()
        return

    if room is None or seat is None:
        return err(ws, "no_room", "먼저 방에 들어와 주세요")
    is_host = room.host == seat.pid
    rd = room.round
    tk = rd.tanks.get(seat.pid) if rd else None

    if t == "tkpick":
        k = msg.get("kind")
        if isinstance(k, str) and k in KINDS:   # 리스트·딕셔너리 값이면 dict 조회가 TypeError → 접속이 끊김
            seat.kind = k
            room.push_lobby()
    elif t == "tkteam":
        tm = msg.get("team")
        if tm in ("A", "B") and tm != seat.team:
            if room.team_count(tm) >= TEAM_MAX:
                return err(ws, "team_full", "이 팀은 8명이 꽉 찼어요")
            seat.team = tm
            room.push_lobby()
    elif t == "tkemo":
        e = _parse_int(msg.get("e"), None)
        if e is None or not 0 <= e < EMO_COUNT:
            return err(ws, "bad_input")
        tnow = now()
        if tnow - seat.last_emo < EMO_GAP_MS:
            log.info("[포격전 %s] emo_rate %s", room.code, seat.name)
            return err(ws, "emo_rate", "", ms=int(EMO_GAP_MS - (tnow - seat.last_emo)))
        seat.last_emo = tnow
        out = json.dumps({"t": "tkemo", "id": seat.pid, "e": e}, separators=(",", ":"))
        for s in room.seats.values():
            if s.ws is not None and s.st in ("lobby", "wait"):
                send(s.ws, out)
    elif t == "tkstart":
        if not is_host:
            return err(ws, "not_host", "방장만 시작할 수 있어요")
        ok, why = room.start_check()
        if not ok:
            return err(ws, "need_players", why)
        _start_round(room)
    elif t == "tkin":
        if tk is None or not tk.alive or seat.st != "play":
            return
        d = _parse_int(msg.get("d"), 0)
        if d is None:
            return err(ws, "bad_input")
        _set_input(tk, clamp(d, -1, 1))
    elif t == "tkaim":
        if tk is None or not tk.alive or seat.st != "play":
            return
        if not _set_aim(tk, msg.get("a"), msg.get("p")):
            return err(ws, "bad_input")
    elif t == "tkfire":
        if tk is None or not tk.alive or seat.st != "play" or rd is None:
            return err(ws, "bad_input")
        res = _fire(rd, tk, msg.get("a"), msg.get("p"))
        if res:
            err(ws, res[0], "", ms=res[1])
    elif t == "tkspec":
        if rd is None or rd.over:
            # 판 끝 직후(마지막 탱크 죽음과 판 끝이 거의 동시)나 판이 없을 때 늦게 온 관전 요청은 조용히 무시
            return None
        if tk is not None and tk.alive and seat.st == "play":
            return err(ws, "bad_input")
        d = _parse_int(msg.get("d"), 0)
        if d is None:
            return err(ws, "bad_input")
        if seat.st in ("lobby", "wait"):
            seat.st = "spec"
            send(ws, rd.start_msg(seat.pid))
            room.push_lobby()
        _spec_pick(room, seat, clamp(d, -1, 1))
    elif t == "tkback":
        if tk is not None and tk.alive and seat.st == "play" and not (rd is not None and rd.over):
            return err(ws, "not_dead", "살아 있을 때는 대기실로 갈 수 없어요")
        seat.st = "wait" if (rd is not None and not rd.over) else "lobby"
        seat.spec = None
        room.push_lobby()
    elif t in ("tkaiadd", "tkaidel", "tkaikeep", "tkailv", "tkpractice"):
        # 방장은 판 없음·판 중·판 끝 결과 대기(꽉 찬 16/16 포함) 어느 때나 AI 를 다룰 수 있음.
        # 판 중에 넣은 AI 는 대기(wait) → 다음 판부터, 판 중 살아 있는 AI 빼기는 '다음 판에 빠짐' 예약.
        if not is_host:
            return err(ws, "not_host", "방장만 AI를 바꿀 수 있어요")
        if t == "tkaiadd":
            team = msg.get("team") if msg.get("team") in ("A", "B") else room.auto_team()
            lv = "normal" if msg.get("lv") == "normal" else "easy"
            if _add_ai(room, team, lv, msg.get("kind")) is None:
                return err(ws, "ai_full", f"팀 {team}에 빈자리가 없어요" if room.team_count(team) >= TEAM_MAX else f"방이 꽉 찼어요 (최대 {TANK_MAX}명)")
        elif t == "tkpractice":
            per = TEAM_MAX if msg.get("to") == "8v8" else 2
            for team in ("A", "B"):
                while room.team_count(team) < per and len(room.seats) < TANK_MAX:
                    if _add_ai(room, team, "easy", None) is None:
                        break
        else:
            s = room.seats.get(str(msg.get("id") or ""))
            if s is None or not s.ai:
                return err(ws, "no_ai", "그 AI는 이미 빠졌어요")
            if t == "tkailv":
                s.lv = "normal" if msg.get("lv") == "normal" else "easy"   # 판 중이면 다음 판부터 (탱크는 시작 때 값을 복사)
            elif t == "tkaikeep":
                s.out = False
            elif _ai_in_play(room, s):
                s.out = True
            else:
                room.seats.pop(s.pid, None)
        room.push_lobby()
    elif t == "tkleave":
        _leave(room, seat)
        CONN.pop(ws, None)
        send(ws, {"t": "tkleft"})
    else:
        err(ws, "bad_input")


def _ai_name(room: TRoom, team: str) -> str:
    used = {s.name for s in room.seats.values()}
    i = 1
    while f"로봇{team}{i}" in used:
        i += 1
    return _clean_name(f"로봇{team}{i}")


def _ai_in_play(room: TRoom, s: Seat) -> bool:
    """진행 중인 판(rd.over 아님)에서 살아 움직이는 AI 탱크인가. 죽었거나 대기 중인 AI 는 바로 빼도 판에 영향 없음
    (판은 rd.tanks 로 돌고 _kill 은 seats.get 으로 없는 자리를 건너뜀)."""
    rd = room.round
    if rd is None or rd.over:
        return False
    tk = rd.tanks.get(s.pid)
    return tk is not None and tk.alive


def _add_ai(room: TRoom, team: str, lv: str, kind) -> Optional[Seat]:
    if len(room.seats) >= TANK_MAX or room.team_count(team) >= TEAM_MAX:
        return None
    room.ai_counter += 1
    room.counter += 1
    pid = f"ai{room.ai_counter}"
    s = Seat(pid, "", room.counter, ai=True, lv=lv)
    s.name = _ai_name(room, team)
    s.team = team
    s.kind = kind if (isinstance(kind, str) and kind in KINDS) else random.choice(list(KINDS))
    if room.round is not None:
        s.st = "wait"   # 이번 판 탱크가 아님 → 다음 판부터
    room.seats[pid] = s
    return s


def _leave(room: TRoom, seat: Seat) -> None:
    room.seats.pop(seat.pid, None)
    if seat.ws is not None:
        CONN.pop(seat.ws, None)
    seat.ws = None
    if room.round is not None and seat.pid in room.round.tanks:
        room.round.tanks[seat.pid].d = 0
    if room.host == seat.pid:
        hs = [s for s in room.humans() if s.on]
        room.host = hs[0].pid if hs else ""
    if not room.humans():
        ROOMS.pop(room.code, None)
        log.info("[포격전 %s] 방 정리 (모두 나감)", room.code)
        return
    room.push_lobby()


def on_close(ws) -> None:
    _RATE_STATES.pop(ws, None)
    st = _SEND_STATES.pop(ws, None)
    if st is not None:
        st.events.clear()
        st.latest_snap = None
        if st.task is not None and not st.task.done():
            st.task.cancel()
    cur = CONN.pop(ws, None)
    if not cur:
        return
    room = ROOMS.get(cur[0])
    seat = room.seats.get(cur[1]) if room else None
    if seat is None or seat.ws is not ws:
        return
    seat.ws = None
    seat.on = False
    seat.disc_at = now()
    if room.round is not None and seat.pid in room.round.tanks:
        room.round.tanks[seat.pid].d = 0
    if room.host == seat.pid:
        room.host_lost_at = now()
    log.info("[포격전 %s] 연결 끊김: %s", room.code, seat.name)
    room.push_lobby()


# ---------------------------------------------------------------- 판 진행
def _start_round(room: TRoom) -> None:
    seats = [s for s in room.seats.values() if s.ai or (s.on and s.ws is not None)]
    rd = Round(room, seats)
    room.round = rd
    for s in room.seats.values():
        s.spec = None
        if s.pid in rd.tanks:
            s.st = "play"
            send(s.ws, rd.start_msg(s.pid))
        elif not s.ai:
            s.st = "wait"
    room.push_lobby()


def _set_input(tk: Tank, d: int) -> None:
    tk.d = d


def _apply_human_aim(tk: Tank, a: float, t: float) -> int:
    a_clamped = clamp(round(a), tk.K["amin"], tk.K["amax"])
    if not tk.ai:
        dt_s = max(0.0, (t - tk.aim_at) / 1000.0)
        max_step = dt_s * 30.0 + 6.0
        diff = a_clamped - tk.a
        if abs(diff) > max_step:
            a_clamped = clamp(round(tk.a + (max_step if diff > 0 else -max_step)), tk.K["amin"], tk.K["amax"])
        tk.aim_at = t
    return a_clamped


def _set_aim(tk: Tank, a, p) -> bool:
    if isinstance(a, bool) or isinstance(p, bool):
        return False
    try:
        a = float(a)
        p = float(p)
    except (TypeError, ValueError, OverflowError):
        return False
    if not (math.isfinite(a) and math.isfinite(p)):
        return False
    tk.a = _apply_human_aim(tk, a, now())
    tk.p = clamp(round(p), 0, 100)
    return True


def muzzle(tk: Tank, a: float):
    """포구 위치와 실제 발사각(도)."""
    K = tk.K
    bt = math.radians(tk.bt)
    f = tk.face
    fx, fy = f * math.cos(bt), -math.sin(bt)
    ux, uy = -f * math.sin(bt), -math.cos(bt)
    px = tk.x + fx * K["pfx"] + ux * K["ph"]
    py = tk.y + fy * K["pfx"] + uy * K["ph"]
    ea = clamp(tk.bt + a, -30.0, 85.0)
    er = math.radians(ea)
    dx, dy = f * math.cos(er), -math.sin(er)
    return px + dx * K["pl"], py + dy * K["pl"], ea


def _fire(rd: Round, tk: Tank, a, p):
    t = now()
    if t < rd.play_at or rd.over:
        return ("bad_input", 0)
    if t < tk.cd_until:
        return ("cooldown", int(tk.cd_until - t))
    if isinstance(a, bool) or isinstance(p, bool):
        return ("bad_input", 0)
    try:
        a = float(a)
        p = float(p)
    except (TypeError, ValueError, OverflowError):
        return ("bad_input", 0)
    if not (math.isfinite(a) and math.isfinite(p)):
        return ("bad_input", 0)
    ar = round(a)
    if ar < tk.K["amin"] or ar > tk.K["amax"]:
        return ("angle_range", 0)
    a = _apply_human_aim(tk, ar, t)
    p = clamp(round(p), 0, 100)
    tk.a, tk.p = a, p
    x, y, ea = muzzle(tk, a)
    v0 = 300 + 9 * p
    er = math.radians(ea)
    vx = tk.face * v0 * math.cos(er)
    vy = -v0 * math.sin(er)
    rd.sid += 1
    sh = {"sid": rd.sid, "own": tk.pid, "team": tk.team, "x": x, "y": y, "vx": vx, "vy": vy, "age": 0.0,
          "r": tk.K["r"], "dmg": tk.K["dmg"]}
    rd.shells.append(sh)
    tk.cd_until = t + COOLDOWN_MS
    tk.shots += 1
    rd.room.cast({"t": "tkshot", "k": rd.k, "id": tk.pid, "sid": rd.sid, "x": round(x, 1), "y": round(y, 1),
                  "ea": round(ea, 1), "vx": round(vx, 1), "vy": round(vy, 1), "w": rd.wind, "wn": rd.wn})
    return None


def _hit_tank(rd: Round, x: float, y: float, own: str, age: float) -> Optional[Tank]:
    for tk in rd.tanks.values():
        if not tk.alive:
            continue
        if tk.pid == own and age < 0.35:
            continue
        K = tk.K
        if abs(x - tk.x) <= K["bw"] / 2 and tk.y - K["bh"] - 4 <= y <= tk.y + 2:
            return tk
    return None


def _set_face(tk: Tank, f: int, t: float) -> None:
    if f == 1 and tk.f == 2 and t < tk.f_until:
        return   # 아픈 중이면 웃음 무시
    tk.f = f
    tk.f_until = t + FACE_MS


def _explode(rd: Round, sh: dict, x: float, y: float) -> None:
    t = now()
    ix, iy, r = int(round(x)), int(round(y)), int(sh["r"])
    cr = carve_radius(ix, r)
    carve(rd.mask, ix, iy, cr)
    rd.recent_carves.append((t, ix, cr))
    hits = []
    faces = {}
    shooter = rd.tanks.get(sh["own"])
    hit_enemy = False
    hit_ally = False
    _note_fall_blame(rd, sh, ix, iy, max(r, cr), t)
    for tk in rd.tanks.values():
        if not tk.alive:
            continue
        K = tk.K
        # 판정 상자까지 가장 가까운 거리
        bx0, bx1 = tk.x - K["bw"] / 2, tk.x + K["bw"] / 2
        by0, by1 = tk.y - K["bh"], tk.y
        dx = max(bx0 - ix, 0, ix - bx1)
        dy = max(by0 - iy, 0, iy - by1)
        dist = math.hypot(dx, dy)
        if dist > r:
            continue
        if t < tk.inv_until:
            continue   # 스폰 무적
        # 아군·자기 자신도 적과 똑같은 피해 (배율 1)
        dmg = max(1, int(round(sh["dmg"] * (1 - 0.7 * dist / r))))
        tk.hp -= dmg
        is_ff = (tk.team == sh["team"])
        is_kill = (tk.hp <= 0)
        hits.append({"id": tk.pid, "dmg": dmg, "hp": max(0, tk.hp), "kill": is_kill, "team": tk.team, "ff": is_ff})
        _set_face(tk, 2, t)
        faces[tk.pid] = 2
        if is_ff:
            hit_ally = True
            if shooter is not None and shooter.ai:
                log.info("[포격전 %s] ai_ff %s -> %s %d", rd.room.code, shooter.name, tk.name, dmg)
        else:
            hit_enemy = True
            if shooter:
                shooter.dealt += dmg
        if tk.brain is not None:
            tk.brain["hit_at"] = t
    if hit_enemy and shooter is not None:
        shooter.hits += 1
    if shooter is not None and shooter.alive:
        if hit_ally:
            # 아군을 맞힌 쏜 사람은 웃지 않음 (자기 피격이면 이미 2, 웃는 중이면 기본으로)
            if shooter.f == 1:
                shooter.f = 0
                faces[shooter.pid] = 0
        elif hit_enemy:
            _set_face(shooter, 1, t)
            faces[shooter.pid] = shooter.f
    rd.room.cast({"t": "tkboom", "k": rd.k, "sid": sh["sid"], "own": sh["own"], "ownTeam": sh["team"],
                  "x": ix, "y": iy, "r": r, "cr": cr, "hits": hits,
                  "face": [{"id": k, "f": v, "ms": FACE_MS} for k, v in faces.items()]})
    for h in hits:
        tk = rd.tanks[h["id"]]
        if tk.hp <= 0 and tk.alive:
            if shooter is not None:
                if h["ff"]:
                    shooter.ffk += 1
                else:
                    shooter.kills += 1
            _kill(rd, tk, "hit", by=sh["own"])


FALL_CREDIT_MS = 8000        # 추락 직전 이 시간 안에 맞혔거나 발밑을 파낸 포탄 주인에게 격추 인정
FALL_BLAME_DEPTH = 56        # 탱크 바닥에서 이 깊이까지의 흙을 판 것도 '발밑을 파냄'으로 봄


def _note_fall_blame(rd: Round, sh: dict, ix: int, iy: int, rr: int, t: float) -> None:
    """폭발이 탱크를 맞혔거나(폭발 반경) 탱크 발밑 흙을 팠으면 그 탱크의 '마지막 포탄 주인'으로 기록. 자기 탄은 제외."""
    own = sh["own"]
    for tk in rd.tanks.values():
        if not tk.alive or tk.pid == own:
            continue
        K = tk.K
        bx0, bx1 = tk.x - K["bw"] / 2, tk.x + K["bw"] / 2
        by0, by1 = tk.y - K["bh"], tk.y + FALL_BLAME_DEPTH
        dx = max(bx0 - ix, 0, ix - bx1)
        dy = max(by0 - iy, 0, iy - by1)
        if math.hypot(dx, dy) > rr:
            continue
        if sh["team"] == tk.team:
            tk.last_ally = (t, own)
        else:
            tk.last_enemy = (t, own)


def _fall_credit(rd: Round, tk: Tank, t: float) -> str:
    """추락사 격추 인정 대상 pid. 최근 8초 안의 적 포탄 주인 우선, 없으면 아군(아군 격추로 처리). 없으면 '' (자멸)."""
    for at, pid in (tk.last_enemy, tk.last_ally):
        if pid and pid in rd.tanks and t - at <= FALL_CREDIT_MS:
            return pid
    return ""


def _kill(rd: Round, tk: Tank, cause: str, by: str = "") -> None:
    t_now = now()
    since_go_ms = rd.rc(t_now)
    ff_flag = 1 if (by and by in rd.tanks and rd.tanks[by].team == tk.team) else 0
    tk.alive = False
    tk.hp = 0
    tk.d = 0
    tk.f = 2
    tk.dead_at = t_now
    tk.cause = cause
    tk.killer = by if (by and by != tk.pid) else ""
    log.info("[포격전 %s] death %s cause=%s since_go_ms=%d ai=%s by=%s ff=%d",
             rd.room.code, tk.pid, cause, since_go_ms, "1" if tk.ai else "0", by or "-", ff_flag)
    rd.room.cast({"t": "tkdeath", "k": rd.k, "id": tk.pid, "cause": cause, "by": by, "ff": ff_flag})
    if tk.ai and cause == "fall":
        terr = any(t_now - ct < 2000 and abs(cx - tk.x) <= tk.K["bw"] / 2 + cr for ct, cx, cr in rd.recent_carves)
        log.info("[포격전 %s] ai_fall %s %s", rd.room.code, tk.name, "terrain" if terr else "self")
    seat = rd.room.seats.get(tk.pid)
    if seat is not None and seat.st == "play":
        seat.st = "spec"
    # 이 탱크를 보던 관전자는 1.4초 뒤 다음 대상으로
    for s in rd.room.seats.values():
        if s.spec == tk.pid:
            s.spec_switch_at = t_now + 1400
    rd.room.push_lobby()


def _crater_crawl(m: bytearray, tk: Tank, h: float, max_rim: float) -> bool:
    """구덩이 벽 등판 한도를 넘어도 깊이 <= max_rim 이면 4px 스텝으로 천천히 기어오름."""
    d = tk.d
    for dx in (4, 8, 12, 16):
        if surface(m, tk.x + d * dx, tk.y, max_rim, 16) == WALL:
            return False
    cur = surface(m, tk.x, tk.y, max_rim, 12)
    if cur not in (None, WALL) and cur < tk.y - 12:
        tk.y = max(cur, tk.y - CELL)
        return True
    nx = tk.x + d * 2.0
    g = _step_ground(m, nx, tk.y, h, 12, 12)
    if g not in (None, WALL):
        tk.x, tk.y = nx, g
        return True
    if g == WALL:
        top = surface(m, nx, tk.y, max_rim, 12)
        if top not in (None, WALL) and top < tk.y:
            tk.x = nx
            tk.y = max(top, tk.y - CELL)
            return True
    return False


def _log_fall_start(rd, tk, why: str) -> None:
    """QA 진단용 한 줄 로그: 낙하 시작 위치와 최근 2.5초 안 근처 포격 여부 (사람 탱크만)."""
    if tk.ai:
        return
    near = [round(cx) for ct, cx, cr in rd.recent_carves if abs(cx - tk.x) <= tk.K["bw"] / 2 + cr + 8]
    cols = {}
    for dx in (-tk.K["half"], 0, tk.K["half"]):
        gx = int((tk.x + dx) // CELL)
        if 0 <= gx < GW:
            cols[int(dx)] = [c * CELL for c in range(max(0, int(tk.y // CELL) - 6), min(GH, int(tk.y // CELL) + 16)) if rd.mask[c * GW + gx] == 1][:6]
    log.info("[포격전 %s] fall_start %s x=%.1f y=%.1f d=%d why=%s carves_near=%s solid=%s", rd.room.code, tk.pid, tk.x, tk.y, tk.d, why, near, cols)


def step_tank(rd: Round, tk: Tank, t: float, playing: bool) -> None:
    m = rd.mask
    K = tk.K
    h = K["half"]
    tk.moving = False
    if tk.falling:
        tk.vy = min(tk.vy + GRAV * DT, 900)
        ny = tk.y + tk.vy * DT
        land = _land_y(m, tk.x, tk.y, ny, h) if -h <= tk.x < W + h else None
        if land is not None:
            tk.y = land
            tk.vy = 0
            tk.falling = False
        else:
            tk.y = ny
    else:
        g = _step_ground(m, tk.x, tk.y, h, 12, 12)
        if g is None:
            tk.falling = True
            tk.vy = 0
            _log_fall_start(rd, tk, "idle")
        elif g != WALL:
            tk.y = g
        # 이동
        if not tk.falling and playing and tk.d != 0:
            if tk.face != tk.d:
                tk.face = tk.d          # 반대쪽을 누르면 첫 틱은 방향만 바꿈
            elif tk.fuel > 0:
                dist = K["speed"] * DT
                n = max(1, int(math.ceil(dist / 2)))
                stepd = dist / n
                moved = False
                for _ in range(n):
                    nx = tk.x + tk.d * stepd
                    ahead = _trace_surface(m, tk.x, tk.y, tk.x + tk.d * 16, 12, 16)
                    if ahead == WALL:
                        break
                    if ahead is not None and tk.y - ahead > 0 and math.degrees(math.atan2(tk.y - ahead, 16)) > K["climb"]:
                        break
                    g = _step_ground(m, nx, tk.y, h, 12, 12)
                    if g == WALL:
                        break
                    tk.x = nx
                    moved = True
                    if g is None:
                        tk.falling = True
                        tk.vy = 0
                        _log_fall_start(rd, tk, "move")
                        break
                    tk.y = g
                if not moved and not tk.falling:
                    moved = _crater_crawl(m, tk, h, max(K["bh"] + 16, 48))
                if moved:
                    tk.moving = True
                    tk.fuel = max(0.0, tk.fuel - FUEL_USE * DT)
                    tk.idle = 0
        elif tk.d != 0 and tk.face != tk.d and not tk.falling:
            tk.face = tk.d   # 카운트다운 중·게이지 0 : 방향만
    if not tk.moving:
        tk.idle += DT
        if tk.idle >= FUEL_IDLE_S:
            tk.fuel = min(FUEL_MAX, tk.fuel + FUEL_REGEN * DT)
    # 차체 기울기 (바퀴 두 점 — 얇은 다리·31~45° 경사 따라 추적, 머리 위 지형 오인 방지)
    if not tk.falling:
        gf = _wheel_surface(m, tk.x, tk.y, tk.x + tk.face * h)
        gb = _wheel_surface(m, tk.x, tk.y, tk.x - tk.face * h)
        gf_ok = gf not in (None, WALL)
        gb_ok = gb not in (None, WALL)
        if not gf_ok:
            gf = tk.y
        if not gb_ok:
            gb = tk.y
        target = math.degrees(math.atan2(gb - gf, 2 * h))
        tk.bt += clamp(target - tk.bt, -6, 6)
        # 정지 상태(d == 0) 또는 바퀴 지지가 불완전할 때는 미끄럼으로 이음목/구덩이에서 이탈하지 않음
        if tk.d != 0 and not tk.moving and gf_ok and gb_ok and abs(target) > SLIDE_DEG:
            down = -tk.face if target > 0 else tk.face
            if down == tk.d:
                nx = tk.x + down * 40 * DT
                g = _step_ground(m, nx, tk.y, h, 12, 16)
                if g not in (None, WALL):
                    tk.x, tk.y = nx, g
    # 표정 복귀
    if tk.f != 0 and t >= tk.f_until and tk.alive:
        tk.f = 0
    # 추락사
    if tk.alive and (tk.y > FALL_Y or tk.x < -20 or tk.x > W + 20):
        # 흙다리를 파여 떨어졌으면 마지막으로 맞히거나 발밑을 판 포탄 주인의 격추(아군이면 아군 격추·점수 제외)
        by = _fall_credit(rd, tk, now())
        shooter = rd.tanks.get(by) if by else None
        if shooter is not None:
            if shooter.team == tk.team:
                shooter.ffk += 1
            else:
                shooter.kills += 1
        _kill(rd, tk, "fall", by=by)


def step_shells(rd: Round) -> None:
    sub = DT / SHELL_SUB
    keep = []
    for sh in rd.shells:
        boom = None
        gone = False
        for _ in range(SHELL_SUB):
            sh["vx"] += rd.wind * sub
            sh["vy"] += GRAV * sub
            sh["x"] += sh["vx"] * sub
            sh["y"] += sh["vy"] * sub
            sh["age"] += sub
            x, y = sh["x"], sh["y"]
            if x < -300 or x > W + 300 or y > H + 100 or sh["age"] > SHELL_LIFE:
                gone = True
                break
            if solid(rd.mask, x, y) or _hit_tank(rd, x, y, sh["own"], sh["age"]):
                boom = (x, y)
                break
        if boom:
            _explode(rd, sh, boom[0], boom[1])
        elif gone:
            rd.room.cast({"t": "tkgone", "k": rd.k, "sid": sh["sid"], "own": sh["own"],
                          "x": round(sh["x"], 1), "y": round(sh["y"], 1)})
        else:
            keep.append(sh)
    rd.shells = keep


def _spec_targets(rd: Round) -> List[Tank]:
    return sorted([tk for tk in rd.tanks.values() if tk.alive], key=lambda tk: tk.x)


def _spec_pick(room: TRoom, seat: Seat, d: int) -> None:
    rd = room.round
    if rd is None:
        return
    alive = _spec_targets(rd)
    seat.spec_switch_at = 0
    if not alive:
        send(seat.ws, {"t": "tkspecto", "id": None})
        return
    cur = rd.tanks.get(seat.spec) if seat.spec else None
    if d == 0 or cur is None:
        me = rd.tanks.get(seat.pid)
        if cur is not None and cur.alive and d == 0:
            pick = cur
        else:
            ox = me.x if me else (cur.x if cur else W / 2)
            mates = [tk for tk in alive if me and tk.team == me.team]
            pool = mates or alive
            pick = min(pool, key=lambda tk: abs(tk.x - ox))
    else:
        xs = [tk.x for tk in alive]
        if cur.alive:
            i = alive.index(cur)
            pick = alive[(i + d) % len(alive)]
        else:
            if d > 0:
                nxt = [tk for tk in alive if tk.x > cur.x]
                pick = nxt[0] if nxt else alive[0]
            else:
                prv = [tk for tk in alive if tk.x < cur.x]
                pick = prv[-1] if prv else alive[-1]
        del xs
    seat.spec = pick.pid
    send(seat.ws, {"t": "tkspecto", "id": pick.pid, "n": pick.name, "tm": pick.team, "k": pick.kind,
                   "ai": 1 if pick.ai else 0, "lv": pick.lv if pick.ai else "", "cnt": len(alive)})


def _end_round(rd: Round, win: str, by: str) -> None:
    rd.over = True
    rd.result_until = now() + RESULT_MS + 2000
    alive = rd.alive_count()
    stats = [{"id": tk.pid, "n": tk.name, "tm": tk.team, "k": tk.kind, "shots": tk.shots, "hits": tk.hits,
              "dealt": tk.dealt, "kills": tk.kills, "ffk": tk.ffk, "alive": 1 if tk.alive else 0, "cause": tk.cause,
              "by": tk.killer}
             for tk in rd.tanks.values()]
    rd.result = {"t": "tkend", "k": rd.k, "win": win, "by": by, "alive": alive, "stats": stats, "back": RESULT_MS}
    rd.room.cast(rd.result)
    log.info("[포격전 %s] 판 끝: %s (%s) %s", rd.room.code, win, by, alive)
    rd.room.push_lobby()


def _finish_round(room: TRoom) -> None:
    room.round = None
    # 판 중 '다음 판에 빠짐' 예약한 AI 를 먼저 뺌 (아래 '기다리던 사람 자리 우선' 은 그 뒤에도 넘칠 때만)
    for s in [s for s in room.seats.values() if s.ai and s.out]:
        room.seats.pop(s.pid, None)
    for s in room.seats.values():
        s.spec = None
        s.st = "lobby"
    # 판 도중 들어와 기다리던 사람 자리 우선: 꽉 찼으면 AI 1대 빼기
    while len(room.seats) > TANK_MAX:
        if room.drop_ai_for(None) is None:
            break
    for team in ("A", "B"):
        while room.team_count(team) > TEAM_MAX:
            if room.drop_ai_for(team) is None:
                break
    room.push_lobby()


def _log_tick_exc(room: TRoom, stage: str, exc: Exception, t: float) -> None:
    key = (stage, type(exc).__name__)
    last = room._exc_log.get(key, -1e9)
    if t - last >= 5000.0:
        room._exc_log[key] = t
        log.exception("[포격전 %s] 틱 오류 (%s)", room.code, stage)


def tick_round(room: TRoom, t: float) -> None:
    rd = room.round
    if rd is None:
        return
    if rd.over:
        if t >= rd.result_until:
            try:
                _finish_round(room)
            except Exception as exc:
                _log_tick_exc(room, "finish", exc, t)
        return
    rd.k += 1
    playing = t >= rd.play_at
    humans_on = any(s.on for s in room.humans())
    # 1. AI 판단 (탱크 단위 격리)
    planned = 0
    for tk in list(rd.tanks.values()):
        try:
            if tk.alive and tk.ai and humans_on:
                planned += ai_step(rd, tk, t, playing, planned < 2)
            elif tk.ai:
                tk.d = 0
        except Exception as exc:
            _log_tick_exc(room, "ai", exc, t)
    # 2. 탱크 단계 (탱크 단위 격리)
    for tk in list(rd.tanks.values()):
        try:
            if tk.alive or tk.falling:
                if tk.alive:
                    step_tank(rd, tk, t, playing)
                else:
                    # 죽어서 떨어지는 탱크는 계속 떨어지기만
                    if tk.cause == "fall" and tk.y < H + 400:
                        tk.vy = min(tk.vy + GRAV * DT, 900)
                        tk.y += tk.vy * DT
        except Exception as exc:
            _log_tick_exc(room, "tank", exc, t)
    # 3. 바람 (바람을 먼저 바꾸고 → 포탄은 이 틱의 현재 바람으로)
    if playing:
        try:
            rd.step_wind(t)
        except Exception as exc:
            _log_tick_exc(room, "wind", exc, t)
    # 4. 포탄 단계
    if playing:
        try:
            step_shells(rd)
        except Exception as exc:
            _log_tick_exc(room, "shells", exc, t)
    # 정리 · 관전 대상 자동 전환
    try:
        rd.recent_carves = [c for c in rd.recent_carves if t - c[0] < 2500]
        for s in list(room.seats.values()):
            sw = getattr(s, "spec_switch_at", 0)
            if sw and t >= sw and s.st == "spec":
                _spec_pick(room, s, 1)
    except Exception as exc:
        _log_tick_exc(room, "spec", exc, t)
    # 5. 스냅 송신
    try:
        snap = {"t": "tksnap", "k": rd.k, "tl": rd.tl(t), "cdn": max(0, int(rd.play_at - t)), "rc": rd.rc(t), "w": rd.wind, "wn": rd.wn,
                "tanks": [tk.snap(t) for tk in rd.tanks.values()],
                "sh": [[sh["sid"], round(sh["x"], 1), round(sh["y"], 1)] for sh in rd.shells]}
        room.cast(snap)
    except Exception as exc:
        _log_tick_exc(room, "snap", exc, t)
    # 6. 승패 판정
    if playing:
        try:
            alive = rd.alive_count()
            if alive["A"] == 0 or alive["B"] == 0:
                win = "draw" if alive["A"] == alive["B"] else ("A" if alive["A"] else "B")
                _end_round(rd, win, "wipe")
            elif t >= rd.end_at:
                if alive["A"] != alive["B"]:
                    win = "A" if alive["A"] > alive["B"] else "B"
                else:
                    # 살아 있는 수가 같으면 체력 '비율' 합 (기종마다 최대 체력이 달라서 원값 합은 불공평)
                    hp = {"A": 0.0, "B": 0.0}
                    for tk in rd.tanks.values():
                        if tk.alive:
                            hp[tk.team] += max(0.0, tk.hp) / tk.K["hp"]
                    gap = hp["A"] - hp["B"]
                    win = "draw" if abs(gap) < 1e-6 else ("A" if gap > 0 else "B")
                _end_round(rd, win, "time")
        except Exception as exc:
            _log_tick_exc(room, "judge", exc, t)


def housekeeping(t: float) -> None:
    for code in list(ROOMS):
        room = ROOMS[code]
        # 방장 넘김
        if room.host_lost_at and t - room.host_lost_at >= HOST_HANDOVER_MS:
            hs = [s for s in room.humans() if s.on]
            if hs:
                room.host = hs[0].pid
                room.host_lost_at = 0
                room.push_lobby()
        # 끊긴 자리 정리 (대기실에서만)
        changed = False
        for s in list(room.seats.values()):
            if not s.ai and not s.on and s.disc_at and t - s.disc_at > SEAT_KEEP_MS:
                in_round = room.round is not None and s.pid in room.round.tanks and not room.round.over
                if not in_round:
                    room.seats.pop(s.pid, None)
                    changed = True
        if changed:
            if room.host not in room.seats:
                hs = [s for s in room.humans() if s.on]
                room.host = hs[0].pid if hs else ""
            room.push_lobby()
        if any(s.on for s in room.humans()):
            room.empty_since = t
        elif t - room.empty_since > ROOM_EMPTY_MS or not room.humans():
            ROOMS.pop(code, None)
            log.info("[포격전 %s] 방 정리 (접속 0명)", code)


async def main_loop() -> None:
    nxt = now()
    hk = 0
    while True:
        if not ROOMS:
            hk = 0
            await asyncio.sleep(1.0)
            nxt = now()
            continue
        nxt += TICK_MS
        t = now()
        for room in list(ROOMS.values()):
            try:
                tick_round(room, t)
            except Exception:
                log.exception("[포격전 %s] 틱 오류", room.code)
        hk += 1
        if hk >= TICK_HZ:
            hk = 0
            try:
                housekeeping(t)
            except Exception:
                log.exception("[포격전] 정리 오류")
        delay = (nxt - now()) / 1000.0
        if delay < -0.5:
            nxt = now()
            delay = 0
        await asyncio.sleep(max(0.0, delay))


# ---------------------------------------------------------------- AI (서버에서 실행 · 사람과 같은 입력 함수)
AI_LV = {
    # 오차는 '파워 숫자'가 아니라 초속(v0) 기준 비율로 넣음. 45° 근처는 각도 오차가 사거리에 거의 안 미쳐서
    # 쏠 때마다 선호 각을 pref 범위에서 무작위로 고름 (2026-11-13 헤드리스 측정으로 조정 · IMPLEMENT_STATUS 참고)
    "easy": dict(e=(8, 12), ep=(0.15, 0.20), delay=(400, 700), wind=0.5, shrink=0.85, floor=0.85, pref=(28, 66)),
    "normal": dict(e=(4, 6), ep=(0.08, 0.12), delay=(150, 300), wind=1.0, shrink=0.8, floor=0.7, pref=(32, 60), pred=True),
}


def new_brain(tk: Tank, rng: random.Random) -> dict:
    L = AI_LV["normal" if tk.lv == "normal" else "easy"]
    return {"E": rng.uniform(*L["e"]), "EP": rng.uniform(*L["ep"]), "mul": 1.0, "plan": None, "target": None,
            "tx": None, "ready_at": 0.0, "move_until": 0.0, "move_dir": 0, "next_wander": now() + random.uniform(8000, 15000),
            "hit_at": 0.0, "hit_seen": 0.0, "rng": random.Random(rng.getrandbits(32))}


def _safe_ahead(rd: Round, tk: Tank, d: int, look: float) -> bool:
    """AI 앞쪽 검사: 이어진 다리는 허용하고 끊김(하늘·구덩이·끊긴 다리·맵 끝) 여유(진지 100px · 섬/다리 60px), 맵 끝 96px, 경사 한도-8°."""
    m = rd.mask
    x, y = tk.x, tk.y
    nx = tk.x + d * look
    if nx < 96 or nx > W - 96:
        return False
    mc = x if x < W / 2 else W - x
    margin = 100 if mc < MAIN_W else 60
    py = y
    hist = [y]
    for i in range(1, int(margin // 4) + 1):
        xx = x + d * i * 4
        g = _step_col(m, xx, py, 12, 12)
        if g is None or g == WALL:
            return False
        if i >= 4 and i * 4 <= look + 16:
            prev_y = hist[i - 4]
            if prev_y - g > 0 and math.degrees(math.atan2(prev_y - g, 16)) > tk.K["climb"] - 8:
                return False
        hist.append(g)
        py = g
    return True


def _sim_land(x0, y0, ea, p, face, wind, tx, ty, sw=None):
    """바람 넣은 짧은 계산(1/30초 × 240걸음). 목표 높이를 내려오며 지날 때 x. 못 닿으면 None.
    sw = (초, 새 바람): 비행 중 그 시각이 지나면 새 바람 (서버 예고 일정 반영)."""
    v0 = 300 + 9 * p
    er = math.radians(ea)
    vx, vy = face * v0 * math.cos(er), -v0 * math.sin(er)
    x, y = x0, y0
    dt = DT / 2
    tt = 0.0
    for _ in range(240):
        tt += dt
        if sw is not None and tt >= sw[0]:
            wind = sw[1]
        vx += wind * dt
        vy += GRAV * dt
        nx, ny = x + vx * dt, y + vy * dt
        if vy > 0 and y <= ty <= ny:
            f = (ty - y) / (ny - y) if ny != y else 0
            return x + (nx - x) * f
        x, y = nx, ny
        if y > H + 200:
            return None
    return None


def _sim_impact(m: bytearray, x0, y0, ea, p, face, wind, sw=None, allies=None, own_pid: str = "", pad: float = 0.0):
    """지형(또는 아군 탱크)에 처음 닿는 자리. 맵 밖으로 빠지면 None. pad: 아군 판정 상자를 넓혀 '스치는' 궤적도 막힘으로."""
    v0 = 300 + 9 * p
    er = math.radians(ea)
    vx, vy = face * v0 * math.cos(er), -v0 * math.sin(er)
    x, y = x0, y0
    dt = DT / 4
    tt = 0.0
    while tt < SHELL_LIFE:
        tt += dt
        if sw is not None and tt >= sw[0]:
            wind = sw[1]
        vx += wind * dt
        vy += GRAV * dt
        x += vx * dt
        y += vy * dt
        if x < -300 or x > W + 300 or y > H + 100:
            return None
        if tt > 0.05 and solid(m, x, y):
            return (x, y)
        if allies:
            for ally in allies:
                if ally.pid == own_pid and tt < 0.35:
                    continue
                AK = ally.K
                if abs(x - ally.x) <= AK["bw"] / 2 + pad and ally.y - AK["bh"] - 4 - pad <= y <= ally.y + 2 + pad:
                    return (x, y)
    return None


AI_FF_PAD = 8          # 궤적이 아군 탱크를 스치는지 볼 때 판정 상자 여유
AI_FF_MARGIN = 20      # 착탄점-아군(자기 포함) 거리 여유: max(폭발 반경, 파임 반경) + 이 값


def _ff_danger(rd: Round, tk: Tank, imp, allies) -> bool:
    """착탄점이 아군(자기 포함) 판정 상자에서 폭발·파임 반경+여유 안이면 True."""
    ix, iy = imp
    rr = max(tk.K["r"], carve_radius(int(round(ix)), tk.K["r"])) + AI_FF_MARGIN
    for ally in allies:
        AK = ally.K
        adx = max(ally.x - AK["bw"] / 2 - ix, 0.0, ix - (ally.x + AK["bw"] / 2))
        ady = max(ally.y - AK["bh"] - iy, 0.0, iy - ally.y)
        if math.hypot(adx, ady) <= rr:
            return True
    return False


def _ai_shot_unsafe(rd: Round, tk: Tank, a: float, p: float, face: int, lead_ms: float = 0.0) -> bool:
    """실제로 쏠 각도·파워(오차 적용 뒤)로 진짜 바람·예정된 바람 변경을 넣어 착탄점을 계산해
    아군을 맞히거나(스침 포함) 아군 근처에 떨어지면 True. 맵 밖으로 빠지면 안전."""
    allies = [al for al in rd.tanks.values() if al.alive and al.team == tk.team]
    wind = rd.wind
    sw = None
    lead = (rd.wn["at"] - rd.rc(now()) - lead_ms) / 1000.0
    if lead <= 0:
        wind = rd.wn["w"]
    elif lead < SHELL_LIFE:
        sw = (lead, rd.wn["w"])
    save = tk.face
    tk.face = face
    try:
        mx, my, ea = muzzle(tk, a)
    finally:
        tk.face = save
    imp = _sim_impact(rd.mask, mx, my, ea, p, face, wind, sw, allies=allies, own_pid=tk.pid, pad=AI_FF_PAD)
    if imp is None:
        return False
    return _ff_danger(rd, tk, imp, allies)


def _plan(rd: Round, tk: Tank, target: Tank, L: dict) -> Optional[tuple]:
    face = 1 if target.x > tk.x else -1
    tx, ty = target.x, target.y - target.K["bh"] / 2
    wind = rd.wind * L["wind"]
    sw = None
    if L.get("pred"):
        # 예정된 바람 변경: 발사까지 걸릴 시간(조준 이동·반응)을 대충 더해 비행 중 몇 초 뒤 바뀌는지
        lead = (rd.wn["at"] - rd.rc(now()) - 1200) / 1000.0
        if lead < SHELL_LIFE:
            if lead <= 0:
                wind = rd.wn["w"] * L["wind"]
            else:
                sw = (lead, rd.wn["w"] * L["wind"])
    lo = max(-30.0, tk.bt + tk.K["amin"])
    hi = min(85.0, tk.bt + tk.K["amax"])
    pref = random.uniform(*L["pref"])
    # 선호 각에 가까운 순 — 아군 때문에 막히면 더 먼 각도까지 찾아봄(최대 16개)
    cands = sorted(range(int(math.ceil(lo)), int(hi) + 1, 3), key=lambda e: abs(e - pref))[:16]
    if not cands:
        return None
    allies = [ally for ally in rd.tanks.values() if ally.alive and ally.team == tk.team]
    avoided_ff = False
    tried = 0
    save = tk.face
    tk.face = face
    try:
        for ea in cands:
            a = ea - tk.bt
            if a < tk.K["amin"] or a > tk.K["amax"]:
                continue
            # 아군 문제 없이 사거리 밖인 각도만 8개 넘게 보지는 않음 (계산량 유지)
            if tried >= 8 and not avoided_ff:
                break
            tried += 1
            mx, my, _ = muzzle(tk, a)

            def over(p):
                xl = _sim_land(mx, my, ea, p, face, wind, tx, ty, sw)
                if xl is None:
                    return None
                return (xl - tx) * face

            top = over(100)
            if top is None or top < 0:
                continue
            lo_p, hi_p = 0.0, 100.0
            for _ in range(12):
                mid = (lo_p + hi_p) / 2
                o = over(mid)
                if o is None or o < 0:
                    lo_p = mid
                else:
                    hi_p = mid
            p = hi_p
            xl = _sim_land(mx, my, ea, p, face, wind, tx, ty, sw)
            if xl is not None and abs(xl - tk.x) < tk.K["r"] + 20:
                avoided_ff = True
                continue
            # 떠 있는 섬·진지·아군에 먼저 막히거나 아군/자기 폭발 반경+12px 안이면 버림
            imp = _sim_impact(rd.mask, mx, my, ea, p, face, wind, sw, allies=allies, own_pid=tk.pid, pad=AI_FF_PAD)
            if imp is None:
                continue
            if _ff_danger(rd, tk, imp, allies):
                avoided_ff = True
                continue
            if math.hypot(imp[0] - tx, imp[1] - ty) > target.K["bw"] / 2 + 18:
                continue
            return (a, p, face)
    finally:
        tk.face = save
        if avoided_ff:
            t_now = now()
            if t_now - rd.last_ff_avoid_at >= 1000:
                rd.last_ff_avoid_at = t_now
                log.info("[포격전 %s] ai_ff_avoid %s", rd.room.code, tk.name)
    return None


def _ai_hold_and_move(rd: Round, tk: Tank, b: dict, t: float, rng: random.Random, why: str) -> None:
    """아군 오사 위험으로 이번엔 쏘지 않음: 가장 가까운 아군에서 멀어지는 쪽(안전하면)으로 잠깐 이동."""
    b["plan"] = None
    b["ready_at"] = t + 1500
    mates = [al for al in rd.tanks.values() if al.alive and al.team == tk.team and al.pid != tk.pid]
    if mates:
        near = min(mates, key=lambda al: abs(al.x - tk.x))
        md = 1 if tk.x >= near.x else -1
    else:
        md = rng.choice((-1, 1))
    look = tk.K["speed"] * DT * 2 + 24
    if not _safe_ahead(rd, tk, md, look):
        md = -md if _safe_ahead(rd, tk, -md, look) else 0
    b["move_dir"] = md
    b["move_until"] = t + rng.uniform(900, 1500) if md else 0
    t_now = now()
    if t_now - rd.last_ff_avoid_at >= 1000:
        rd.last_ff_avoid_at = t_now
        log.info("[포격전 %s] ai_ff_hold %s (%s)", rd.room.code, tk.name, why)


def ai_step(rd: Round, tk: Tank, t: float, playing: bool, may_plan: bool) -> int:
    b = tk.brain
    if b is None:
        return 0
    L = AI_LV["normal" if tk.lv == "normal" else "easy"]
    rng = b["rng"]
    planned = 0
    d = 0
    enemies = [e for e in rd.tanks.values() if e.alive and e.team != tk.team]
    # 이동 결정
    if playing:
        if b["hit_at"] > b["hit_seen"]:
            b["hit_seen"] = b["hit_at"]
            if rng.random() < 0.5:
                b["move_until"] = t + rng.uniform(1000, 2000)
                b["move_dir"] = rng.choice((-1, 1))
        if t >= b["next_wander"]:
            b["next_wander"] = t + rng.uniform(8000, 15000)
            b["move_until"] = t + rng.uniform(600, 1400)
            b["move_dir"] = rng.choice((-1, 1))
        if t < b["move_until"] and b["move_dir"]:
            md = b["move_dir"]
            if not _safe_ahead(rd, tk, md, tk.K["speed"] * DT * 2 + 24):
                md = -md
                b["move_dir"] = md
                if not _safe_ahead(rd, tk, md, tk.K["speed"] * DT * 2 + 24):
                    md = 0
                    b["move_until"] = 0
            d = md
        elif not tk.falling and tk.fuel > 0:
            # 발밑 가장자리(폭격으로 파인 구덩이·절벽) 가까우면 안전한 반대쪽으로 회피
            el = edge_dist(rd.mask, tk.x, tk.y, -1, 56)
            er = edge_dist(rd.mask, tk.x, tk.y, 1, 56)
            if el < 44 and er >= 56 and _safe_ahead(rd, tk, 1, tk.K["speed"] * DT * 2 + 24):
                d = 1
            elif er < 44 and el >= 56 and _safe_ahead(rd, tk, -1, tk.K["speed"] * DT * 2 + 24):
                d = -1
    # 바람이 바뀌었으면 계획 다시 세우기 (발사 전 최신 바람 반영)
    wind_sig = (rd.wind, rd.wn["at"], rd.wn["w"])
    if b["plan"] is not None and b.get("plan_wind") != wind_sig and may_plan:
        b["plan"] = None
    # 조준 계획
    if b["plan"] is None and enemies and t >= tk.cd_until and t >= b["ready_at"] and may_plan and not tk.falling:
        enemies.sort(key=lambda e: (t < e.inv_until and len(enemies) > 1, abs(e.x - tk.x)))
        target = enemies[1] if len(enemies) > 1 and rng.random() < 0.2 else enemies[0]
        if b["target"] != target.pid or (b["tx"] is not None and abs(target.x - b["tx"]) > 60):
            b["mul"] = 1.0
        else:
            b["mul"] = max(L["floor"], b["mul"] * L["shrink"])
        b["target"] = target.pid
        b["tx"] = target.x
        pl = _plan(rd, tk, target, L)
        planned = 1
        if pl is None:
            # 사거리 밖 → 상대 쪽으로 조금 이동
            md = 1 if target.x > tk.x else -1
            if _safe_ahead(rd, tk, md, tk.K["speed"] * DT * 2 + 24):
                b["move_until"] = t + 1200
                b["move_dir"] = md
            b["ready_at"] = t + 1500
        else:
            a0, p0, face = pl
            E = b["E"] * b["mul"]
            EP = b["EP"] * b["mul"]
            # 난이도 오차는 그대로 넣되, 오차 적용 뒤 착탄점이 아군 근처면 오차를 다시 뽑음
            # (조준 이동 시간만큼 뒤에 쏜다고 보고 바람 예고 반영). 끝내 안전한 게 없으면 이번엔 쏘지 않고 비켜 이동.
            chosen = None
            for _ in range(6):
                a = clamp(round(a0 + rng.uniform(-E, E)), tk.K["amin"], tk.K["amax"])
                v0 = (300 + 9 * p0) * (1 + rng.uniform(-EP, EP))
                p = clamp(round((v0 - 300) / 9), 0, 100)
                lead_ms = max(abs(a - tk.a) / 30.0, abs(p - tk.p) / 60.0) * 1000 + L["delay"][1]
                if not _ai_shot_unsafe(rd, tk, a, p, face, lead_ms):
                    chosen = (a, p)
                    break
            if chosen is None:
                _ai_hold_and_move(rd, tk, b, t, rng, "plan")
            else:
                b["plan"] = (chosen[0], chosen[1], face)
                b["plan_wind"] = wind_sig
                b["ready_at"] = t + rng.uniform(*L["delay"])
    # 조준 움직이기 → 발사
    if b["plan"] is not None and t >= b["ready_at"]:
        a, p, face = b["plan"]
        if tk.face != face:
            d = face   # 방향 전환 한 틱 (첫 틱은 움직이지 않음)
        na = tk.a + clamp(a - tk.a, -30 * DT, 30 * DT)
        np_ = tk.p + clamp(p - tk.p, -60 * DT, 60 * DT)
        tk.a, tk.p = clamp(na, tk.K["amin"], tk.K["amax"]), clamp(np_, 0, 100)   # 사람 버튼 속도(30°/초·60/초)로만
        if abs(tk.a - a) < 0.5 and abs(tk.p - p) < 0.5 and tk.face == face and playing and t >= tk.cd_until:
            # 조준하는 동안 아군이 끼어들었거나 바람이 바뀌었으면 쏘지 않고 비킴
            if _ai_shot_unsafe(rd, tk, round(tk.a), round(tk.p), face):
                _ai_hold_and_move(rd, tk, b, t, rng, "fire")
                _set_input(tk, b["move_dir"] if _safe_ahead(rd, tk, b["move_dir"], tk.K["speed"] * DT * 2 + 24) else 0)
                return planned
            res = _fire(rd, tk, round(tk.a), round(tk.p))
            if res:
                log.info("[포격전 %s] ai_reject %s %s", rd.room.code, tk.name, res[0])
            b["plan"] = None
            b["ready_at"] = t + 300
    # 앞이 위험하면 입력 0 (스스로 걸어 들어가는 추락 금지)
    if d != 0 and tk.face == d and not _safe_ahead(rd, tk, d, tk.K["speed"] * DT * 2 + 24):
        d = 0
    _set_input(tk, d)
    return planned
