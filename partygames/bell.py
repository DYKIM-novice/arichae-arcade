"""과일 종 치기 (할리갈리 방식) — 2~6명 (AI 친구 가능)

- 과일 카드 56장: 딸기·바나나·레몬·포도 × (1개 5장, 2개 3장, 3개 3장, 4개 2장, 5개 1장)
- 모두 나눠 갖고(뒤집어서) 차례대로 맨 위 카드를 내 앞에 펼쳐요
- 펼쳐진 맨 위 카드들에서 같은 과일이 '딱 5개'가 되면 종을 먼저 친 사람이 펼쳐진 카드를 모두 가져가요
- 틀리게 치면 다른 사람 모두에게 한 장씩 줘요
- 내 카드가 다 떨어지면 뒤집기는 쉬지만 종은 칠 수 있어요
- 끝: 카드가 남은 사람이 한 명뿐이거나 5분이 지나면 → 카드(덮은 것+펼친 것)가 가장 많은 사람이 1등
"""
import random
import time
from typing import Dict, List, Optional

FRUITS = ["딸기", "바나나", "레몬", "포도"]
COUNTS = [1] * 5 + [2] * 3 + [3] * 3 + [4] * 2 + [5]
FLIP_SEC = 5
COLLECT_SEC = 1.8
GAME_SEC = 300
# AI 단계: (종 치는 데 걸리는 초 범위, 헷갈려서 잘못 칠 확률)
AI_SPEED = {1: (1.6, 2.6, 0.12), 2: (1.1, 1.8, 0.07), 3: (0.8, 1.3, 0.04), 4: (0.6, 0.95, 0.02), 5: (0.45, 0.7, 0.01)}


class Bell:
    TAKES_OPTS = True
    turn_seconds = FLIP_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        deck = [(f, c) for f in range(4) for c in COUNTS]
        rng.shuffle(deck)
        self.decks: List[List[tuple]] = [[] for _ in range(n_seats)]
        for k, card in enumerate(deck):
            self.decks[k % n_seats].append(card)
        self.piles: List[List[tuple]] = [[] for _ in range(n_seats)]
        self.turn = rng.randrange(n_seats)
        self.phase = "play"
        self.over = False
        self.start = time.time() + 3.5
        self.end_at = self.start + int((opts or {}).get("time", 180))
        self.deadline = 0.0
        self.until = 0.0
        self.events: List[dict] = []
        self.ev = 0
        self.flips = 0
        self.rings = [0] * n_seats
        self.wrong = [0] * n_seats
        self.ai_plan: Dict[int, float] = {}
        self._set_deadline()

    # ---------------- 도우미 ----------------
    def _event(self, k: str, **kw) -> None:
        self.ev += 1
        e = {"k": k, "id": self.ev}
        e.update(kw)
        self.events.append(e)
        self.events = self.events[-8:]

    def totals(self) -> List[int]:
        t = [0, 0, 0, 0]
        for p in self.piles:
            if p:
                f, c = p[-1]
                t[f] += c
        return t

    def is_five(self) -> bool:
        return 5 in self.totals()

    def cards_of(self, i: int) -> int:
        return len(self.decks[i]) + len(self.piles[i])

    def _set_deadline(self) -> None:
        self.deadline = max(time.time(), self.start) + FLIP_SEC if self.turn not in self.ai and self.phase == "play" else 0

    def _plan_ai(self) -> None:
        """카드가 바뀔 때마다 AI 가 종을 칠지·언제 칠지 정해요"""
        self.ai_plan = {}
        now = time.time()
        five = self.is_five()
        near = any(t in (4, 6) for t in self.totals())
        lo, hi, miss = AI_SPEED.get(self.level, AI_SPEED[3])
        for i in self.ai:
            if five:
                self.ai_plan[i] = now + self.rng.uniform(lo, hi)
            elif near and self.rng.random() < miss:
                self.ai_plan[i] = now + self.rng.uniform(lo, hi) * 0.9

    def actor(self) -> int:
        # 시간에 따라 바뀌면 안 돼요 (화면에 바뀐 걸 알리지 못해요) → 시작 전 기다림은 화면·AI 가 start 로 맞춰요
        if self.over or self.phase != "play":
            return -1
        return self.turn

    def _next_turn(self) -> None:
        for k in range(1, self.n + 1):
            j = (self.turn + k) % self.n
            if self.decks[j]:
                self.turn = j
                break
        self._set_deadline()

    def _check_end(self) -> bool:
        alive = [i for i in range(self.n) if self.decks[i]]
        if len(alive) <= 1 and not self.is_five() or time.time() >= self.end_at:
            self.over = True
            self.phase = "done"
            self.deadline = 0
            self._event("end")
            return True
        return False

    def step(self) -> Optional[float]:
        if self.over:
            return None
        now = time.time()
        if self.phase == "collect":
            if now >= self.until:
                self.phase = "play"
                if not self._check_end():
                    self._set_deadline()
            return 0.05
        if now >= self.end_at:
            self._check_end()
            return None
        for i, t in sorted(self.ai_plan.items(), key=lambda kv: kv[1]):
            if now >= t:
                del self.ai_plan[i]
                self._ring(i)
                return 0.05
        return 0.05

    # ---------------- 수 ----------------
    def _flip(self, i: int) -> None:
        card = self.decks[i].pop(0)
        self.piles[i].append(card)
        self.flips += 1
        self._event("flip", s=i, card=list(card))
        self._next_turn()
        self._plan_ai()
        if not any(self.decks):
            self._check_end()

    def _ring(self, i: int) -> None:
        if self.is_five():
            got = sum(len(p) for p in self.piles)
            pile_cards = [c for p in self.piles for c in p]
            self.rng.shuffle(pile_cards)
            self.decks[i].extend(pile_cards)
            self.piles = [[] for _ in range(self.n)]
            self.rings[i] += 1
            self._event("ring", s=i, ok=True, got=got)
            self.phase = "collect"
            self.until = time.time() + COLLECT_SEC
            self.deadline = 0
            self.ai_plan = {}
            # 카드를 가져간 사람이 다음에 뒤집어요
            self.turn = i
        else:
            self.wrong[i] += 1
            gave = 0
            for j in range(self.n):
                if j != i and self.decks[i]:
                    self.decks[j].append(self.decks[i].pop(0))
                    gave += 1
            self._event("ring", s=i, ok=False, gave=gave)
            if self.turn == i and not self.decks[i]:
                self._next_turn()

    def act(self, i: int, a: dict) -> Optional[str]:
        k = a.get("k")
        if self.over:
            return None
        if k == "ring":
            if self.phase != "play" or time.time() < self.start:
                return None
            self._ring(i)
            return None
        if k == "flip":
            if i != self.actor() or time.time() < self.start:
                return None
            if not self.decks[i]:
                self._next_turn()
                return None
            self._flip(i)
            return None
        return None

    def timeout_action(self, i: int) -> dict:
        return {"k": "flip"}

    def ai_action(self, i: int) -> dict:
        return {"k": "flip"}

    def ai_delay(self, i: int) -> float:
        return max(0.0, self.start - time.time()) + self.rng.uniform(0.9, 1.5)

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {
            "phase": self.phase, "turn": self.turn, "toAct": self.actor(), "me": seat, "over": self.over,
            "deck": [len(d) for d in self.decks], "pile": [len(p) for p in self.piles],
            "top": [list(p[-1]) if p else None for p in self.piles], "events": self.events[-5:],
            "deadline": int(self.deadline * 1000) if self.deadline else 0, "start": int(self.start * 1000),
            "endAt": int(self.end_at * 1000), "cards": [self.cards_of(i) for i in range(self.n)], "wrong": self.wrong[:],
        }
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: (-self.cards_of(j), self.wrong[j]))
        return {"winner": order[0], "rank": order, "cards": [self.cards_of(j) for j in range(self.n)], "hands": 0}
