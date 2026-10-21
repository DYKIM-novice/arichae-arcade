"""땅따먹기 (볼피드 · 큐익스 방식) — 1~6명, 모두 같은 판을 동시에

- 각자 화면에서 혼자 해요 (판·괴물 움직임은 모두 같은 씨앗으로 똑같이 시작)
- 테두리(내 땅)에서 출발해 선을 그어 빈 곳을 닫으면, 괴물이 없는 쪽이 내 땅이 돼요
- 선을 긋는 중에 괴물이 선이나 나를 건드리면 목숨 하나 잃어요 (목숨 3개)
- 75% 를 차지하면 다음 단계 (5단계까지) · 점수가 가장 높은 사람이 1등
서버는 시작 신호·진행 상황·순위만 맡아요 (기록실: 가장 높은 점수)
"""
import random
import time
from typing import List, Optional

GAME_SEC = 360


class Qix:
    TAKES_OPTS = True
    turn_seconds = 0

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = n_seats
        self.names = names
        self.seed = rng.randrange(1, 1 << 30)
        self.diff = (opts or {}).get("diff", "normal")
        self.start = time.time() + 3.5
        self.end_at = self.start + GAME_SEC
        self.prog = [{"lv": 1, "pct": 0, "lives": 3, "score": 0, "done": False} for _ in range(n_seats)]
        self.over = False
        self.deadline = 0

    def actor(self) -> int:
        return -1

    def step(self) -> Optional[float]:
        if not self.over and time.time() >= self.end_at:
            self.over = True
        return None

    def act(self, i: int, a: dict) -> Optional[str]:
        if a.get("k") != "prog" or self.over:
            return None
        p = self.prog[i]
        if p["done"]:
            return None
        try:
            p["lv"] = max(1, min(9, int(a.get("lv", 1))))
            p["pct"] = max(0, min(100, int(a.get("pct", 0))))
            p["lives"] = max(0, min(9, int(a.get("lives", 0))))
            p["score"] = max(p["score"], min(999999, int(a.get("score", 0))))
        except (TypeError, ValueError):
            return None
        if a.get("done"):
            p["done"] = True
            p["at"] = time.time()
        if all(x["done"] for x in self.prog):
            self.over = True
        return None

    def timeout_action(self, i: int) -> dict:
        return {}

    def ai_action(self, i: int) -> dict:
        return {}

    def ai_delay(self, i: int) -> float:
        return 1.0

    def view(self, seat: Optional[int]) -> dict:
        v = {"seed": self.seed, "diff": self.diff, "start": int(self.start * 1000), "endAt": int(self.end_at * 1000),
             "prog": self.prog, "me": seat, "over": self.over}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: -self.prog[j]["score"])
        w = order[0]
        p = self.prog[w]
        return {"winner": w, "rank": order, "hands": 0,
                "recAny": {"seat": w, "score": p["score"], "detail": f"{p['lv']}단계 · {p['pct']}%"}}
