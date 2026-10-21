"""뱀과 사다리 — 2~6명 (AI 친구 가능)

- 1~100칸. 주사위를 굴려 나온 만큼 가요 (처음엔 판 밖 0칸에서 출발)
- 사다리 아래에 멈추면 위로 올라가고, 뱀 머리에 멈추면 꼬리로 미끄러져요
- 100칸에 '딱 맞게' 도착해야 이겨요. 넘치면 넘친 만큼 되돌아가요
- 6이 나오면 한 번 더
"""
import random
import time
from typing import List, Optional

LADDERS = {1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100}
SNAKES = {16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78}
TURN_SEC = 15


class Snake:
    TAKES_OPTS = True
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.rng = rng
        self.extra6 = (opts or {}).get("six", "again") == "again"
        self.pos = [0] * n_seats
        self.turn = rng.randrange(n_seats)
        self.over = False
        self.winner = -1
        self.events: List[dict] = []
        self.ev = 0
        self.rolls = 0
        self.climbs = [0] * n_seats
        self.slides = [0] * n_seats
        self.deadline = 0.0
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over else 0

    def actor(self) -> int:
        return -1 if self.over else self.turn

    def step(self) -> Optional[float]:
        return None

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        if a.get("k") != "roll":
            return "주사위를 굴려요"
        d = self.rng.randint(1, 6)
        self.rolls += 1
        start = self.pos[i]
        # 한 칸씩 (100을 넘치면 넘친 만큼 되돌아가요)
        p = start
        path = []
        back = False
        for k in range(d):
            if p == 100:
                back = True
            p = p - 1 if back else p + 1
            path.append(p)
        jump = None
        if p in LADDERS:
            jump = {"kind": "ladder", "to": LADDERS[p]}
            self.climbs[i] += 1
            p = LADDERS[p]
        elif p in SNAKES:
            jump = {"kind": "snake", "to": SNAKES[p]}
            self.slides[i] += 1
            p = SNAKES[p]
        self.pos[i] = p
        self.ev += 1
        self.events.append({"k": "roll", "id": self.ev, "s": i, "d": d, "from": start, "path": path, "jump": jump})
        self.events = self.events[-6:]
        if p == 100:
            self.over = True
            self.winner = i
            self.deadline = 0
            return None
        if not (d == 6 and self.extra6):
            self.turn = (self.turn + 1) % self.n
        self._set_deadline()
        return None

    def timeout_action(self, i: int) -> dict:
        return {"k": "roll"}

    def ai_action(self, i: int) -> dict:
        return {"k": "roll"}

    def ai_delay(self, i: int) -> float:
        # 화면이 말을 한 칸씩 움직이는 동안 기다려요
        last = self.events[-1] if self.events else None
        walk = (len(last["path"]) * 0.22 + (0.8 if last.get("jump") else 0)) if last else 0
        return 1.0 + walk + self.rng.uniform(0.2, 0.6)

    def view(self, seat: Optional[int]) -> dict:
        v = {"pos": self.pos[:], "turn": self.turn, "toAct": self.actor(), "events": self.events[-4:], "me": seat,
             "over": self.over, "deadline": int(self.deadline * 1000) if self.deadline else 0,
             "ladders": LADDERS, "snakes": SNAKES, "six": self.extra6}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: (j != self.winner, -self.pos[j]))
        return {"winner": order[0], "rank": order, "pos": self.pos[:], "hands": self.rolls}
