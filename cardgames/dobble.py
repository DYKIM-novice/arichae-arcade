"""도블 (같은 그림 찾기 · 탑 쌓기 방식)

- 동그란 카드 57장. 카드마다 그림 8개, 어떤 두 카드를 골라도 똑같은 그림이 꼭 하나만 있어요
  (7차 사영평면: 점 57개·직선 57개 — 직선 = 카드, 점 = 그림)
- 처음에 한 장씩 앞면으로 받고(내 카드), 나머지는 가운데 더미. 맨 위 한 장이 가운데에 펼쳐져요
- 모두 동시에: 내 카드와 가운데 카드에 같이 있는 그림을 먼저 누르면 가운데 카드를 가져와요
  → 가져온 카드가 내 새 카드(맨 위)가 되니까, 사람마다 찾는 그림이 달라요
- 틀린 그림을 누르면 1.5초 동안 못 눌러요
- 25초 동안 아무도 못 찾으면 정답을 보여 주고 그 카드는 치워요
- 더미가 다 떨어지면 카드를 가장 많이 모은 사람이 1등 (같으면 덜 틀린 사람)

서버가 정답을 판정해요(누가 먼저 눌렀나). 화면에는 내 카드와 가운데 카드의 그림만 보내요.
"""
import random
import time
from typing import Dict, List, Optional

ORDER = 7
COUNTDOWN = 3.0
SHOW_SEC = 1.5          # 누가 가져갔는지 보여 주는 시간
FREEZE_SEC = 1.5        # 틀리면 쉬는 시간
GIVEUP_SEC = 25.0       # 아무도 못 찾으면 넘어가기


def make_deck(n: int = ORDER) -> List[List[int]]:
    """n 이 소수일 때 카드 n²+n+1 장, 카드마다 그림 n+1 개"""
    cards = []
    inf = n * n                       # 기울기 a 의 무한원점 = inf + a, 수직선의 무한원점 = inf + n
    for a in range(n):
        for b in range(n):
            cards.append([x * n + (a * x + b) % n for x in range(n)] + [inf + a])
    for c in range(n):
        cards.append([c * n + y for y in range(n)] + [inf + n])
    cards.append([inf + a for a in range(n + 1)])
    return cards


DECK = make_deck()
N_SYM = ORDER * ORDER + ORDER + 1

# AI 단계: (가장 빠른 초, 가장 느린 초, 틀릴 확률)
AI_SPEED = {1: (6.0, 10.0, 0.25), 2: (4.5, 7.0, 0.15), 3: (3.2, 5.0, 0.08), 4: (2.3, 3.6, 0.04), 5: (1.5, 2.5, 0.0)}


def common(a: int, b: int) -> int:
    s = set(DECK[a]) & set(DECK[b])
    return next(iter(s))


class Dobble:
    turn_seconds = 0

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.seed = rng.randrange(1 << 30)
        # 그림 번호 섞기 (판마다 같은 카드라도 그림 조합이 달라 보이게)
        self.symmap = list(range(N_SYM))
        rng.shuffle(self.symmap)
        order = list(range(len(DECK)))
        rng.shuffle(order)
        self.piles: List[List[int]] = [[order.pop()] for _ in range(n_seats)]
        self.stock = order                      # 끝이 맨 위
        self.total = len(order)
        self.wrong = [0] * n_seats
        self.got_ms: List[List[int]] = [[] for _ in range(n_seats)]   # 찾는 데 걸린 시간
        self.frozen = [0.0] * n_seats
        self.over = False
        self.deadline = 0
        self.no = 0                              # 가운데에 펼친 카드 차례 번호
        self.center: Optional[int] = None
        self.phase = "count"
        self.reveal_at = time.time() + COUNTDOWN
        self.last: Optional[dict] = None
        self.ai_plan: Dict[int, dict] = {}

    # ---------------- 진행 ----------------
    def _reveal(self, at: float) -> None:
        if not self.stock:
            self.phase = "done"
            self.over = True
            return
        self.center = self.stock.pop()
        self.no += 1
        self.phase = "play"
        self.reveal_at = at
        self.ai_plan = {}
        for i in self.ai:
            lo, hi, miss = AI_SPEED.get(self.level, AI_SPEED[3])
            t = at + self.rng.uniform(lo, hi) * (1.5 if self.rng.random() < 0.08 else 1.0)
            plan = {"t": t}
            if self.rng.random() < miss:
                plan["miss"] = at + self.rng.uniform(lo * 0.4, lo * 0.9)
            self.ai_plan[i] = plan

    def actor(self) -> int:
        return -1

    def step(self) -> Optional[float]:
        if self.over:
            return None
        now = time.time()
        if self.phase == "count":
            if now >= self.reveal_at:
                self._reveal(self.reveal_at)
            return 0.05
        if self.phase == "show":
            if now >= self.show_until:
                self._reveal(now)
            return 0.05
        if self.phase == "play":
            # AI
            for i, p in sorted(self.ai_plan.items(), key=lambda kv: min(kv[1]["t"], kv[1].get("miss", 9e18))):
                if now < self.frozen[i]:
                    continue
                if "miss" in p and now >= p["miss"]:
                    del p["miss"]
                    self._wrong(i, now)
                    if p["t"] < self.frozen[i]:
                        p["t"] = self.frozen[i] + self.rng.uniform(0.3, 1.0)
                    return 0.05
                if now >= p["t"]:
                    self._win(i, now)
                    return 0.05
            if now >= self.reveal_at + GIVEUP_SEC:
                self.last = {"who": -1, "card": self.center, "no": self.no}
                self._end_turn(now, None)
        return 0.05

    def top(self, i: int) -> int:
        return self.piles[i][-1]

    def _wrong(self, i: int, now: float) -> None:
        self.wrong[i] += 1
        self.frozen[i] = now + FREEZE_SEC

    def _win(self, i: int, now: float) -> None:
        sym = common(self.top(i), self.center)
        self.got_ms[i].append(int((now - self.reveal_at) * 1000))
        self.last = {"who": i, "sym": self.symmap[sym], "card": self.center, "no": self.no,
                     "ms": int((now - self.reveal_at) * 1000), "under": self.top(i)}
        self._end_turn(now, i)

    def _end_turn(self, now: float, winner: Optional[int]) -> None:
        if winner is not None:
            self.piles[winner].append(self.center)
        self.phase = "show"
        self.show_until = now + SHOW_SEC
        self.ai_plan = {}

    def act(self, i: int, a: dict) -> Optional[str]:
        if a.get("k") != "tap" or self.phase != "play":
            return None
        try:
            no = int(a.get("no", -1))
            sym = int(a.get("s", -1))
        except (TypeError, ValueError):
            return None
        if no != self.no:
            return None                       # 이미 지나간 카드
        now = time.time()
        if now < self.frozen[i] or now < self.reveal_at:
            return None
        want = self.symmap[common(self.top(i), self.center)]
        if sym == want:
            self._win(i, now)
        else:
            self._wrong(i, now)
        return None

    def timeout_action(self, i: int) -> dict:
        return {}

    def ai_action(self, i: int) -> dict:
        return {}

    def ai_delay(self, i: int) -> float:
        return 1.0

    # ---------------- 화면 ----------------
    def syms(self, card: Optional[int]) -> Optional[List[int]]:
        return None if card is None else [self.symmap[s] for s in DECK[card]]

    def view(self, seat: Optional[int]) -> dict:
        now = time.time()
        v = {
            "phase": self.phase, "no": self.no, "seed": self.seed,
            "at": int(self.reveal_at * 1000),
            "left": len(self.stock), "total": self.total,
            "center": self.center if self.phase in ("play", "show") else None,
            "centerSyms": self.syms(self.center) if self.phase in ("play", "show") else None,
            "seats": [{"n": len(self.piles[j]) - 1, "wrong": self.wrong[j],
                       "frozen": int(self.frozen[j] * 1000) if self.frozen[j] > now else 0} for j in range(self.n)],
            "me": seat, "over": self.over,
        }
        if self.phase == "show" and self.last:
            v["last"] = dict(self.last)
        if seat is not None:
            # 'show' 동안에는 가져오기 전 카드(아래 카드)를 보여 줘요 — 화면에서 가져오는 모습을 그린 다음 바꿔요
            mine = self.top(seat)
            v["mine"] = mine
            v["mineSyms"] = self.syms(mine)
            if self.phase == "show" and self.last:
                if self.last.get("who") == seat:
                    v["prev"] = self.last.get("under")
                    v["prevSyms"] = self.syms(self.last.get("under"))
                else:
                    v["ans"] = self.symmap[common(mine, self.last["card"])]     # 내가 찾았어야 할 그림
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: (-(len(self.piles[j]) - 1), self.wrong[j]))
        res = {"winner": order[0], "rank": order, "cards": [len(p) - 1 for p in self.piles], "hands": 0,
               "wrong": self.wrong[:]}
        w = order[0]
        ms = self.got_ms[w]
        avg = sum(ms) / len(ms) if ms else 0
        got = len(self.piles[w]) - 1
        # 기록 점수: 모은 카드가 많을수록, 빨리 찾을수록 (AI 단계·인원은 cards.table_record 가 곱해요)
        res["rec"] = {"pts": got * 40 + max(0, int(8000 - avg) // 20), "detail": f"{got}장 · 평균 {avg / 1000:.1f}초"}
        return res
