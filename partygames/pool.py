"""미니 당구 (포켓볼) — 2~4명 (AI 친구 가능)

- 당구대(56×100)에 흰 공 1개 + 번호 공 6개(1~6). 구멍 6개 (네 귀퉁이 + 긴 쪽 가운데)
- 차례마다 흰 공을 당겼다 놓아서 쳐요. 번호 공을 구멍에 넣으면 그 번호만큼 점수 + 한 번 더
- 흰 공이 빠지면(스크래치) 2점 빼고 차례 넘김 · 흰 공은 처음 자리로
- 번호 공이 다 들어가면 끝 → 점수가 가장 높은 사람이 1등 (모두 합하면 21점)
"""
import math
import random
import time
from typing import List, Optional

from .phys import Disk, Table, simulate, clone, launch

W, H = 56.0, 100.0
R = 2.2
PR = 3.7
POCKETS = [(0.6, 0.6, PR), (W - 0.6, 0.6, PR), (0.0, H / 2, PR * 0.9), (W, H / 2, PR * 0.9), (0.6, H - 0.6, PR), (W - 0.6, H - 0.6, PR)]
CUE_SPOT = (W / 2, 78.0)
SPEED = 140.0
TURN_SEC = 35
SCRATCH = 2


class Pool:
    TAKES_OPTS = True
    MAX_ACT = 200
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.table = Table(W, H, "cushion", friction=30.0, rest=0.94, wall_rest=0.78, pockets=POCKETS)
        self.cue = Disk(0, -1, CUE_SPOT[0], CUE_SPOT[1], R, "cue")
        self.balls = [self.cue]
        rows = [[4], [2, 6], [1, 5, 3]]
        cy = 26.0
        for k, row in enumerate(rows):
            for j, num in enumerate(row):
                x = W / 2 + (j - (len(row) - 1) / 2) * (2 * R + 0.15)
                y = cy - k * (2 * R * 0.87 + 0.1)
                self.balls.append(Disk(num, -1, x + (rng.random() - 0.5) * 0.1, y, R, "ball"))
        self.score = [0] * n_seats
        self.potted = [[] for _ in range(n_seats)]
        self.turn = rng.randrange(n_seats)
        self.over = False
        self.anim: Optional[dict] = None
        self.shot_no = 0
        self.last: Optional[dict] = None
        self.deadline = 0.0
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over else 0

    def actor(self) -> int:
        return -1 if self.over else self.turn

    def step(self) -> Optional[float]:
        return None

    def left(self) -> List[Disk]:
        return [b for b in self.balls if b.alive and b.kind == "ball"]

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        if a.get("k") != "shot":
            return "흰 공을 쳐요"
        try:
            ang = float(a.get("a"))
            pw = float(a.get("p"))
        except (TypeError, ValueError):
            return "다시 쳐요"
        if not (math.isfinite(ang) and math.isfinite(pw)):
            return "다시 쳐요"
        self._shot(i, ang, pw)
        return None

    def _respot(self) -> None:
        x, y = CUE_SPOT
        for k in range(30):
            if all(math.hypot(b.x - x, b.y - y) > 2 * R + 0.3 for b in self.balls if b.alive and b is not self.cue):
                break
            y += 2.5 if k % 2 == 0 else 0
            x = W / 2 + ((k % 5) - 2) * 3
        self.cue.x, self.cue.y = x, y
        self.cue.vx = self.cue.vy = 0
        self.cue.alive = True

    def _shot(self, i: int, ang: float, pw: float) -> None:
        launch(self.cue, ang, pw, SPEED)
        res = simulate(self.table, self.balls)
        self.shot_no += 1
        pots = [p for p in res["pocketed"] if p != 0]
        scratch = 0 in res["pocketed"]
        gain = sum(pots) - (SCRATCH if scratch else 0)
        self.score[i] += gain
        self.potted[i] += pots
        self.anim = {"no": self.shot_no, "s": i, "ids": res["ids"], "frames": res["frames"], "fps": res["fps"], "pocketed": res["pocketed"]}
        self.last = {"s": i, "pots": pots, "scratch": scratch, "gain": gain, "miss": 0 not in res["first"]}
        if scratch:
            self._respot()
        if not self.left():
            self.over = True
            self.deadline = 0
            return
        if not pots or scratch:
            self.turn = (self.turn + 1) % self.n
        self._set_deadline()

    def timeout_action(self, i: int) -> dict:
        return self._ai(i, 1)

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        t = len(self.anim["frames"]) / self.anim["fps"] if self.anim else 0
        return t + self.rng.uniform(1.0, 1.6)

    def ai_action(self, i: int) -> dict:
        return self._ai(i, self.level)

    def _ai(self, i: int, lv: int) -> dict:
        cue = self.cue
        cands = []
        for b in self.left():
            for (px, py, _) in POCKETS:
                dx, dy = px - b.x, py - b.y
                L = math.hypot(dx, dy)
                gx, gy = b.x - dx / L * 2 * R, b.y - dy / L * 2 * R          # 고스트 공 자리
                ang = math.atan2(gy - cue.y, gx - cue.x)
                d1 = math.hypot(gx - cue.x, gy - cue.y)
                # 너무 꺾이는 각도는 빼요
                cut = math.cos(math.atan2(dy, dx) - ang)
                if cut < 0.25:
                    continue
                need = math.sqrt(2 * 30 * (d1 + L / max(cut, 0.3) + 6)) / SPEED
                cands.append((ang, min(1.0, need * 1.15), b.id, cut))
        if not cands:
            b = self.rng.choice(self.left())
            return {"k": "shot", "a": math.atan2(b.y - cue.y, b.x - cue.x), "p": 0.6}
        if lv <= 2:
            ang, pw, _, _ = max(cands, key=lambda c: c[3] + self.rng.random() * (0.8 if lv <= 1 else 0.3))
        else:
            budget = {3: 10, 4: 24, 5: 48}.get(lv, 12)
            cands.sort(key=lambda c: -c[3])
            pool = cands[:budget]
            # 세기 바꿔 보기
            pool = [(a, p * m, b, c) for (a, p, b, c) in pool for m in ((1.0,) if lv == 3 else (0.85, 1.0, 1.25))][:budget * 2]
            best = None
            bv = -1e9
            for (ang, pw, bid, _) in pool:
                bs = clone(self.balls)
                cc = next(x for x in bs if x.id == 0)
                launch(cc, ang, min(1.0, pw), SPEED)
                res = simulate(self.table, bs, record=False)
                v = sum(p for p in res["pocketed"] if p != 0) * 3 - (12 if 0 in res["pocketed"] else 0)
                if 0 not in res["first"]:
                    v -= 2
                v += self.rng.random() * 0.4
                if v > bv:
                    bv, best = v, (ang, pw)
            ang, pw = best
        err = {1: 0.05, 2: 0.025, 3: 0.012, 4: 0.006, 5: 0.003}.get(lv, 0.01)
        return {"k": "shot", "a": ang + self.rng.gauss(0, err), "p": max(0.15, min(1.0, pw * (1 + self.rng.gauss(0, err * 2))))}

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {"balls": [[b.id, round(b.x, 2), round(b.y, 2)] for b in self.balls if b.alive], "r": R,
             "turn": self.turn, "toAct": self.actor(), "me": seat, "over": self.over, "score": self.score[:],
             "potted": self.potted, "anim": self.anim, "last": self.last,
             "deadline": int(self.deadline * 1000) if self.deadline else 0,
             "geo": {"w": W, "h": H, "pockets": POCKETS, "speed": SPEED}}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: -self.score[j])
        return {"winner": order[0], "rank": order, "score": self.score[:], "hands": self.shot_no}
