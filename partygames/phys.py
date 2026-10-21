"""튕기기 게임 공통 물리 (알까기 · 컬링 · 미니 당구)

- 둥근 돌(원판)들이 판 위에서 미끄러져요: 마찰로 일정하게 느려지고, 서로 부딪치면 튕겨요 (같은 무게)
- 판 모양:
    fall     가장자리 밖으로 중심이 나가면 떨어져요 (알까기)
    cushion  가장자리에서 튕겨요 (당구) · pockets 안에 들어가면 쏙
    lane     옆·뒤로 나가면 떨어져요 (컬링 · 판 크기 그대로)
- 서버가 계산하고, 화면에는 움직임(프레임)을 보내서 똑같이 보여 줘요
"""
import math
from typing import Dict, List, Optional, Tuple

DT = 1 / 120.0
REC_EVERY = 6            # 120/6 = 20 프레임/초로 기록 (화면이 사이를 부드럽게 채워요)
MAX_T = 9.0


class Disk:
    __slots__ = ("id", "owner", "x", "y", "vx", "vy", "r", "alive", "kind")

    def __init__(self, id_: int, owner: int, x: float, y: float, r: float, kind: str = ""):
        self.id = id_
        self.owner = owner
        self.x = x
        self.y = y
        self.vx = 0.0
        self.vy = 0.0
        self.r = r
        self.alive = True
        self.kind = kind


class Table:
    def __init__(self, w: float, h: float, mode: str = "fall", friction: float = 45.0, rest: float = 0.9,
                 wall_rest: float = 0.75, pockets: Optional[List[Tuple[float, float, float]]] = None, curl: float = 0.0):
        self.w = w
        self.h = h
        self.mode = mode
        self.friction = friction          # 1초에 줄어드는 속도
        self.rest = rest                  # 돌끼리 튕김
        self.wall_rest = wall_rest
        self.pockets = pockets or []      # (x, y, 반지름)
        self.curl = curl                  # 컬링: 진행 방향 옆으로 살짝 휘기 (도는 방향 부호 곱)


def simulate(table: Table, disks: List[Disk], record: bool = True, spin: Dict[int, float] = None) -> dict:
    """모두 멈출 때까지. 돌려줌: {frames: [[x,y,...]], ids: [...], fell: [id], pocketed: [id], hits: [(a,b)], t}"""
    spin = spin or {}
    alive = [d for d in disks if d.alive]
    ids = [d.id for d in alive]
    frames = []
    fell: List[int] = []
    pocketed: List[int] = []
    hits: List[Tuple[int, int]] = []
    first_hit: Dict[int, int] = {}
    t = 0.0
    step = 0

    def snap():
        frames.append([v for d in alive for v in ((round(d.x * 10), round(d.y * 10)) if d.alive else (-9999, -9999))])

    if record:
        snap()
    dec = table.friction * DT
    while t < MAX_T:
        moving = False
        for d in alive:
            if not d.alive:
                continue
            sp = math.hypot(d.vx, d.vy)
            if sp > 0:
                if sp <= dec:
                    d.vx = d.vy = 0.0
                else:
                    k = (sp - dec) / sp
                    d.vx *= k
                    d.vy *= k
                    if table.curl and d.id in spin:
                        # 진행 방향에 수직으로 아주 살짝 (느릴수록 더 휘어요)
                        c = table.curl * spin[d.id] * DT / max(0.35, sp / 60)
                        nx, ny = -d.vy / sp, d.vx / sp
                        d.vx += nx * c
                        d.vy += ny * c
                    moving = True
                d.x += d.vx * DT
                d.y += d.vy * DT
        # 부딪침
        n = len(alive)
        for i in range(n):
            a = alive[i]
            if not a.alive:
                continue
            for j in range(i + 1, n):
                b = alive[j]
                if not b.alive:
                    continue
                dx = b.x - a.x
                dy = b.y - a.y
                rr = a.r + b.r
                d2 = dx * dx + dy * dy
                if d2 >= rr * rr or d2 == 0:
                    continue
                dist = math.sqrt(d2)
                nx, ny = dx / dist, dy / dist
                rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
                # 겹친 만큼 밀어내기
                over = (rr - dist) / 2
                a.x -= nx * over
                a.y -= ny * over
                b.x += nx * over
                b.y += ny * over
                if rel > 0:
                    jimp = rel * (1 + table.rest) / 2
                    a.vx -= jimp * nx
                    a.vy -= jimp * ny
                    b.vx += jimp * nx
                    b.vy += jimp * ny
                    hits.append((a.id, b.id))
                    first_hit.setdefault(a.id, b.id)
                    first_hit.setdefault(b.id, a.id)
                    moving = True
        # 가장자리
        for d in alive:
            if not d.alive:
                continue
            if table.mode == "cushion":
                for (px, py, pr) in table.pockets:
                    if (d.x - px) ** 2 + (d.y - py) ** 2 < pr * pr:
                        d.alive = False
                        d.vx = d.vy = 0
                        pocketed.append(d.id)
                        break
                if not d.alive:
                    continue
                if d.x < d.r:
                    d.x = d.r
                    d.vx = abs(d.vx) * table.wall_rest
                elif d.x > table.w - d.r:
                    d.x = table.w - d.r
                    d.vx = -abs(d.vx) * table.wall_rest
                if d.y < d.r:
                    d.y = d.r
                    d.vy = abs(d.vy) * table.wall_rest
                elif d.y > table.h - d.r:
                    d.y = table.h - d.r
                    d.vy = -abs(d.vy) * table.wall_rest
            else:
                if d.x < 0 or d.x > table.w or d.y < 0 or d.y > table.h:
                    d.alive = False
                    fell.append(d.id)
                    d.vx = d.vy = 0
        t += DT
        step += 1
        if record and step % REC_EVERY == 0:
            snap()
        if not moving:
            break
    if record:
        snap()
    return {"frames": frames, "ids": ids, "fell": fell, "pocketed": pocketed, "hits": hits, "first": first_hit,
            "t": round(t, 2), "fps": 120 // REC_EVERY}


def clone(disks: List[Disk]) -> List[Disk]:
    out = []
    for d in disks:
        c = Disk(d.id, d.owner, d.x, d.y, d.r, d.kind)
        c.alive = d.alive
        out.append(c)
    return out


MAX_SPEED = 150.0   # 기본 (게임마다 launch(max_speed=) 로 바꿔요)


def launch(d: Disk, angle: float, power: float, max_speed: float = MAX_SPEED) -> None:
    p = max(0.05, min(1.0, power))
    sp = max_speed * p
    d.vx = math.cos(angle) * sp
    d.vy = math.sin(angle) * sp
