"""자석돌 (클러스터 방식) — 2~4명 (AI 친구 가능)

- 줄로 만든 동그란 울타리(반지름 28) 안에 자석돌을 하나씩 내려놓아요
- 다른 돌과 너무 가까우면 '딱!' 붙어 버려요 — 붙은 돌은 모두 내가 가져가야 해요 (줄줄이 붙기도 해요)
- 자석마다 힘이 조금씩 달라서 붙는 거리도 조금씩 달라요 · 손도 살짝 떨려요
- 내 돌을 먼저 다 놓으면 승리 (돌: 모두 합쳐 24개를 나눠 가져요)
"""
import math
import random
import time
from typing import List, Optional

CX, CY, RING = 50.0, 50.0, 28.0
R = 2.4
GAP = 4.2          # 이 정도(돌 사이 빈틈)보다 가까우면 붙어요 (자석 힘에 따라 ±)
TOTAL = 24
TURN_SEC = 30


class Magnet:
    TAKES_OPTS = True
    MAX_ACT = 200
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.hint = (opts or {}).get("hint", "off") == "on"
        per = TOTAL // n_seats
        self.hand = [per] * n_seats
        self.stones: List[dict] = []         # {id, x, y, s(힘)}
        self.next_id = 1
        self.turn = rng.randrange(n_seats)
        self.over = False
        self.winner = -1
        self.last: Optional[dict] = None
        self.ev = 0
        self.deadline = 0.0
        self.placed = [0] * n_seats
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over else 0

    def actor(self) -> int:
        return -1 if self.over else self.turn

    def step(self) -> Optional[float]:
        return None

    @staticmethod
    def snap_dist(a: dict, b: dict) -> float:
        return 2 * R + GAP * (a["s"] + b["s"]) / 2

    def cluster(self, stones: List[dict], new: dict) -> List[dict]:
        """new 와 이어서 붙는 돌들 (줄줄이)"""
        out = [new]
        seen = {new["id"]}
        k = 0
        while k < len(out):
            cur = out[k]
            for s in stones:
                if s["id"] in seen:
                    continue
                if math.hypot(s["x"] - cur["x"], s["y"] - cur["y"]) < self.snap_dist(s, cur):
                    seen.add(s["id"])
                    out.append(s)
            k += 1
        return out

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        if a.get("k") != "place":
            return "돌을 놓아요"
        try:
            x, y = float(a.get("x")), float(a.get("y"))
        except (TypeError, ValueError):
            return "다시 놓아요"
        if not (math.isfinite(x) and math.isfinite(y)):
            return "다시 놓아요"
        # 손 떨림 · 울타리 안으로
        x += self.rng.gauss(0, 0.45)
        y += self.rng.gauss(0, 0.45)
        dx, dy = x - CX, y - CY
        dist = math.hypot(dx, dy)
        lim = RING - R - 0.3
        if dist > lim:
            x, y = CX + dx / dist * lim, CY + dy / dist * lim
        new = {"id": self.next_id, "x": x, "y": y, "s": self.rng.uniform(0.8, 1.2)}
        self.next_id += 1
        self.hand[i] -= 1
        self.placed[i] += 1
        cl = self.cluster(self.stones, new)
        self.ev += 1
        if len(cl) > 1:
            ids = {s["id"] for s in cl}
            self.stones = [s for s in self.stones if s["id"] not in ids]
            self.hand[i] += len(cl)
            cx = sum(s["x"] for s in cl) / len(cl)
            cy = sum(s["y"] for s in cl) / len(cl)
            self.last = {"id": self.ev, "s": i, "x": x, "y": y, "snap": [[s["x"], s["y"]] for s in cl], "to": [cx, cy], "n": len(cl)}
        else:
            self.stones.append(new)
            self.last = {"id": self.ev, "s": i, "x": x, "y": y, "snap": None, "n": 0}
        if self.hand[i] <= 0:
            self.over = True
            self.winner = i
            self.deadline = 0
            return None
        self.turn = (self.turn + 1) % self.n
        self._set_deadline()
        return None

    def timeout_action(self, i: int) -> dict:
        return self._ai(i, 1)

    def ai_delay(self, i: int) -> float:
        return self.rng.uniform(1.4, 2.2) + (1.0 if self.last and self.last.get("snap") else 0.3)

    def ai_action(self, i: int) -> dict:
        return self._ai(i, self.level)

    def _ai(self, i: int, lv: int) -> dict:
        # 다른 돌에서 가장 먼 자리 찾기 (단계가 낮을수록 대충 · 조금 봐요)
        tries = {1: 12, 2: 30, 3: 80, 4: 200, 5: 400}.get(lv, 60)
        best = None
        bv = -1e9
        for _ in range(tries):
            ang = self.rng.uniform(0, 2 * math.pi)
            rr = (RING - R - 1) * math.sqrt(self.rng.random())
            x, y = CX + math.cos(ang) * rr, CY + math.sin(ang) * rr
            v = min((math.hypot(s["x"] - x, s["y"] - y) - (2 * R + GAP * (1 + s["s"]) / 2) for s in self.stones), default=50)
            if v > bv:
                bv, best = v, (x, y)
        return {"k": "place", "x": best[0], "y": best[1]}

    def view(self, seat: Optional[int]) -> dict:
        v = {"stones": [[s["id"], round(s["x"], 2), round(s["y"], 2)] for s in self.stones], "r": R, "ring": [CX, CY, RING],
             "hand": self.hand[:], "turn": self.turn, "toAct": self.actor(), "me": seat, "over": self.over, "last": self.last,
             "hint": self.hint, "gap": GAP, "deadline": int(self.deadline * 1000) if self.deadline else 0}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: (j != self.winner, self.hand[j]))
        return {"winner": order[0], "rank": order, "hands": self.placed[order[0]]}
