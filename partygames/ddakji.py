"""딱지치기 — 2명 (사람끼리 또는 AI)

- 한 사람이 바닥에 딱지를 놓고, 다른 사람이 자기 딱지로 내려쳐서 뒤집으면 이겨요 (그 딱지를 따요)
- 못 뒤집으면 바꿔서 쳐요
- 치는 사람: ① 바닥 딱지 근처에서 내려칠 곳을 고르고 ② 힘 막대가 움직일 때 눌러서 세기를 정해요
- 잘 뒤집히는 법: 딱지 '가장자리 바로 바깥쪽'을 세게! (바람이 딱지 밑으로 들어가요) · 한가운데는 잘 안 뒤집혀요
- 먼저 3장 따는 사람이 승리 (설정)
"""
import math
import random
import time
from typing import List, Optional

SIZE = 24.0          # 바닥 딱지 한 변 (판 100×100)
TURN_SEC = 25


def flip_chance(dx: float, dy: float, rot: float, power: float) -> float:
    """내려친 곳(바닥 딱지 중심 기준)과 세기로 뒤집힐 확률"""
    # 딱지 좌표로 돌려서, 가장자리까지 거리
    c, s = math.cos(-rot), math.sin(-rot)
    x, y = dx * c - dy * s, dx * s + dy * c
    half = SIZE / 2
    edge = max(abs(x), abs(y)) - half          # 음수: 딱지 안쪽, 양수: 바깥
    # 가장 좋은 자리: 가장자리 바깥 2~6
    if edge < -half * 0.6:
        place = 0.05                            # 한가운데
    elif edge < 0:
        place = 0.25 + 0.5 * (1 + edge / (half * 0.6))   # 안쪽 가장자리로 갈수록
    elif edge <= 7:
        place = 1.0 - abs(edge - 3.5) * 0.06
    elif edge <= 14:
        place = 0.75 - (edge - 7) * 0.1
    else:
        place = 0.0                             # 너무 멀어요
    # 세기: 0.7~0.95 가 좋아요, 너무 세면 튕겨 나가요
    if power < 0.4:
        pw = power * 0.5
    elif power < 0.7:
        pw = 0.2 + (power - 0.4) * 2.0
    elif power <= 0.95:
        pw = 0.85 + (0.95 - abs(power - 0.85)) * 0.15
    else:
        pw = 0.7
    # 모서리 쪽(대각선)이 조금 더 잘 뒤집혀요
    corner = 1.0 + 0.15 * (min(abs(x), abs(y)) / half)
    return max(0.0, min(0.85, place * pw * corner * 0.62))


class Ddakji:
    TAKES_OPTS = True
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = 2
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.goal = int((opts or {}).get("goal", 3))
        self.won = [0, 0]
        self.hitter = rng.randrange(2)          # 치는 사람
        self.over = False
        self.round = 0
        self.last: Optional[dict] = None
        self.ev = 0
        self.deadline = 0.0
        self._new_lay()

    def _new_lay(self) -> None:
        self.round += 1
        self.pos = (50 + self.rng.uniform(-6, 6), 46 + self.rng.uniform(-6, 6))
        self.rot = self.rng.uniform(-0.6, 0.6)
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.hitter not in self.ai and not self.over else 0

    def actor(self) -> int:
        return -1 if self.over else self.hitter

    def step(self) -> Optional[float]:
        return None

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        if a.get("k") != "hit":
            return "딱지를 쳐요"
        try:
            x, y, p = float(a.get("x")), float(a.get("y")), float(a.get("p"))
        except (TypeError, ValueError):
            return "다시 쳐요"
        if not all(map(math.isfinite, (x, y, p))):
            return "다시 쳐요"
        x = max(0.0, min(100.0, x))
        y = max(0.0, min(100.0, y))
        p = max(0.0, min(1.0, p))
        ch = flip_chance(x - self.pos[0], y - self.pos[1], self.rot, p)
        flipped = self.rng.random() < ch
        self.ev += 1
        self.last = {"id": self.ev, "s": i, "x": x, "y": y, "p": p, "flip": flipped, "chance": round(ch, 2),
                     "pos": list(self.pos), "rot": self.rot}
        foe = 1 - i
        if flipped:
            self.won[i] += 1
            if self.won[i] >= self.goal:
                self.over = True
                self.deadline = 0
                return None
            # 진 사람이 다시 딱지를 놓고, 이긴 사람이 계속 쳐요
            self._new_lay()
        else:
            self.hitter = foe
            # 친 딱지가 이제 바닥 딱지가 돼요 (내려친 자리 근처)
            self.pos = (max(20, min(80, x + self.rng.uniform(-3, 3))), max(22, min(72, y + self.rng.uniform(-3, 3))))
            self.rot = self.rng.uniform(-0.8, 0.8)
            self._set_deadline()
        return None

    def timeout_action(self, i: int) -> dict:
        return self._ai(i, 1)

    def ai_delay(self, i: int) -> float:
        return self.rng.uniform(1.8, 2.6) + (1.6 if self.last else 0)

    def ai_action(self, i: int) -> dict:
        return self._ai(i, self.level)

    def _ai(self, i: int, lv: int) -> dict:
        # 가장자리 바깥 3.5 쪽 · 대각선 모서리 노리기
        corner = self.rng.choice([(1, 1), (1, -1), (-1, 1), (-1, -1)]) if lv >= 3 else (self.rng.choice([1, -1]), 0)
        d = SIZE / 2 + 3.5
        lx, ly = corner[0] * d * (0.92 if corner[1] else 1), corner[1] * d * 0.92
        c, s = math.cos(self.rot), math.sin(self.rot)
        x = self.pos[0] + lx * c - ly * s
        y = self.pos[1] + lx * s + ly * c
        err = {1: 7.0, 2: 4.5, 3: 3.0, 4: 2.0, 5: 1.2}.get(lv, 3)
        perr = {1: 0.25, 2: 0.15, 3: 0.09, 4: 0.06, 5: 0.04}.get(lv, 0.1)
        return {"k": "hit", "x": x + self.rng.gauss(0, err), "y": y + self.rng.gauss(0, err), "p": max(0.2, min(1.0, 0.85 + self.rng.gauss(0, perr)))}

    def view(self, seat: Optional[int]) -> dict:
        v = {"hitter": self.hitter, "toAct": self.actor(), "won": self.won[:], "goal": self.goal, "pos": list(self.pos),
             "rot": self.rot, "size": SIZE, "last": self.last, "me": seat, "over": self.over, "round": self.round,
             "deadline": int(self.deadline * 1000) if self.deadline else 0}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        w = 0 if self.won[0] >= self.won[1] else 1
        return {"winner": w, "rank": [w, 1 - w], "hands": self.round}
