"""공기놀이 — 1~6명 (AI 친구 가능)

- 공깃돌 5개. 단계마다 한 개를 던져 올리고, 떨어지기 전에 바닥 돌을 줍고 다시 받아요
    1단: 하나씩 (4번) · 2단: 두 개씩 (2번) · 3단: 하나 + 셋 · 4단: 넷 한꺼번에
    5단 꺾기: 다섯 개를 던져 손등으로 받고, 다시 던져 잡으면 받은 개수만큼 '년'(점수)
- 실수하면 다음 사람 차례 (다음엔 그 단계부터 다시)
- 꺾기를 하면 1단부터 다시. 목표 년수를 먼저 채우면 승리
손놀림은 각자 화면에서 하고(눌러서 줍기·받기), 서버는 차례·단계·점수를 정해요
"""
import random
import time
from typing import List, Optional

TURN_SEC = 60
# AI 단계별 한 단계 성공 확률 (1~4단) · 꺾기 때 받는 개수 평균
AI_OK = {1: 0.55, 2: 0.68, 3: 0.78, 4: 0.86, 5: 0.92}
AI_CATCH = {1: 1.6, 2: 2.3, 3: 3.0, 4: 3.6, 5: 4.2}
STAGE_DIFF = {1: 1.0, 2: 0.93, 3: 0.86, 4: 0.8, 5: 0.9}


class Gonggi:
    TAKES_OPTS = True
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        o = opts or {}
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.goal = int(o.get("goal", 10))
        self.speed = o.get("speed", "normal")
        self.stage = [1] * n_seats
        self.score = [0] * n_seats
        self.turn = 0
        self.over = False
        self.events: List[dict] = []
        self.ev = 0
        self.tries = 0
        self.deadline = 0.0
        self.live: Optional[dict] = None     # 사람 차례: 지금 손놀림 (다른 폰에서 구경하게)
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over else 0

    def actor(self) -> int:
        return -1 if self.over else self.turn

    def step(self) -> Optional[float]:
        return None

    def _event(self, **kw) -> None:
        self.ev += 1
        e = {"id": self.ev, "s": self.turn}
        e.update(kw)
        self.events.append(e)
        self.events = self.events[-6:]

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        if a.get("k") == "live":
            self.live = self._clean_live(a)
            return None
        if a.get("k") != "result":
            return None
        try:
            st = int(a.get("st"))
        except (TypeError, ValueError):
            return None
        if st != self.stage[i]:
            return None                          # 지난 단계 결과
        ok = bool(a.get("ok"))
        self.tries += 1
        self.live = None
        if st < 5:
            if ok:
                self.stage[i] += 1
                self._event(k="ok", st=st)
                self._set_deadline()
            else:
                self._event(k="miss", st=st)
                self._pass()
            return None
        # 꺾기
        try:
            caught = max(0, min(5, int(a.get("n", 0))))
        except (TypeError, ValueError):
            caught = 0
        if ok and caught > 0:
            self.score[i] += caught
            self.stage[i] = 1
            self._event(k="kkeok", n=caught, total=self.score[i])
            if self.score[i] >= self.goal:
                self.over = True
                self.deadline = 0
                return None
            self._set_deadline()
        else:
            self._event(k="miss", st=5)
            self.stage[i] = 1 if not ok else self.stage[i]
            self._pass()
        return None

    @staticmethod
    def _clean_live(a: dict) -> Optional[dict]:
        """구경용 손놀림 정보만 골라서 (모양이 이상하면 버려요)"""
        try:
            ph = str(a.get("ph", ""))
            if ph not in ("ready", "air", "up5", "back", "up5b"):
                return None
            fl = []
            for f in (a.get("fl") or [])[:5]:
                fl.append([round(max(0.0, min(100.0, float(f[0]))), 1), round(max(0.0, min(110.0, float(f[1]))), 1), 1 if f[2] else 0])
            return {"st": int(a.get("st", 1)), "ph": ph, "fl": fl, "need": int(a.get("need", 0)), "picks": int(a.get("picks", 0)),
                    "n": int(a.get("n", 0)), "hand": int(a.get("hand", 1)), "sq": int(a.get("sq", 0))}
        except (TypeError, ValueError, IndexError):
            return None

    def _pass(self) -> None:
        self.turn = (self.turn + 1) % self.n
        self._set_deadline()

    def timeout_action(self, i: int) -> dict:
        return {"k": "result", "st": self.stage[i], "ok": False}

    def ai_delay(self, i: int) -> float:
        st = self.stage[i]
        throws = {1: 4, 2: 2, 3: 2, 4: 1, 5: 2}[st]
        return 0.8 + throws * 1.6 + self.rng.uniform(0, 0.6)

    def ai_action(self, i: int) -> dict:
        st = self.stage[i]
        p = AI_OK.get(self.level, 0.75) * STAGE_DIFF[st]
        if st < 5:
            return {"k": "result", "st": st, "ok": self.rng.random() < p}
        n = max(0, min(5, round(self.rng.gauss(AI_CATCH.get(self.level, 3), 1.0))))
        return {"k": "result", "st": 5, "ok": self.rng.random() < p, "n": n}

    def view(self, seat: Optional[int]) -> dict:
        v = {"turn": self.turn, "toAct": self.actor(), "stage": self.stage[:], "score": self.score[:], "goal": self.goal, "live": self.live,
             "speed": self.speed, "events": self.events[-4:], "me": seat, "over": self.over, "ai": sorted(self.ai),
             "deadline": int(self.deadline * 1000) if self.deadline else 0}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: (-self.score[j], -self.stage[j]))
        return {"winner": order[0], "rank": order, "score": self.score[:], "hands": self.tries}
