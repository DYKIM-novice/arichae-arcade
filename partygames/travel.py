"""세계여행 — 2~4명 (AI 친구 가능) · 주사위로 세계 도시를 사고 건물을 지어요

판 32칸 (한 변 8칸):
  출발(지날 때 월급) · 무인도(주사위 같은 수가 나오거나 두 번 쉬면 나가요) · 축제(모인 기금 받기) · 우주여행(다음 차례에 원하는 칸으로)
  도시 21곳(색깔 무리) · 관광지 3곳 · 황금 열쇠 4칸 · 기금 내기 1칸
도시: 사고 → 다시 오면 별장 → 빌딩 → 호텔 (통행료 ×1 ×4 ×10 ×16). 같은 색을 다 가지면 땅 통행료 2배
관광지: 사기만 (가진 관광지 수만큼 통행료가 커져요)
돈이 모자라면 건물·땅을 반값에 팔고, 그래도 모자라면 파산
끝: 한 명만 남거나 정한 바퀴가 지나면 재산(돈 + 땅·건물 값)이 가장 많은 사람이 1등
"""
import random
import time
from typing import Dict, List, Optional

TURN_SEC = 30
START_CASH = 200
SALARY = 20
MULT = [1, 4, 10, 16]
NAMES_L = ["땅", "별장", "빌딩", "호텔"]

# (종류, 이름, 무리, 값)  kind: start/city/tour/key/island/fest/space/tax
BOARD = [
    ("start", "출발", -1, 0),
    ("city", "방콕", 0, 5), ("key", "황금 열쇠", -1, 0), ("city", "베이징", 0, 6), ("city", "하노이", 1, 8),
    ("tour", "제주도", -1, 15), ("city", "싱가포르", 1, 9), ("city", "카이로", 1, 10),
    ("island", "무인도", -1, 0),
    ("city", "이스탄불", 2, 12), ("key", "황금 열쇠", -1, 0), ("city", "아테네", 2, 12), ("city", "로마", 2, 14),
    ("tour", "알프스", -1, 18), ("city", "코펜하겐", 3, 16), ("city", "스톡홀름", 3, 16),
    ("fest", "축제", -1, 0),
    ("city", "베를린", 4, 18), ("key", "황금 열쇠", -1, 0), ("city", "오타와", 4, 20), ("city", "부에노스아이레스", 4, 20),
    ("tour", "하와이", -1, 22), ("city", "시드니", 5, 24), ("city", "상파울루", 5, 24),
    ("space", "우주여행", -1, 0),
    ("city", "리스본", 6, 26), ("city", "마드리드", 6, 28), ("key", "황금 열쇠", -1, 0), ("city", "도쿄", 6, 30),
    ("tax", "기금 내기", -1, 15), ("city", "뉴욕", 7, 35), ("city", "서울", 7, 40),
]
N = len(BOARD)
ISLAND = 8
SPACE = 24
GROUPS: Dict[int, List[int]] = {}
for _i, (_k, _n, _g, _p) in enumerate(BOARD):
    if _k == "city":
        GROUPS.setdefault(_g, []).append(_i)
KEYS = [
    ("cash", 20, "복권 당첨! 20만 원을 받아요"),
    ("birthday", 5, "생일 축하! 모두에게 5만 원씩 받아요"),
    ("fine", 10, "과속 벌금 10만 원 (기금으로)"),
    ("goto", 0, "출발로 가서 월급을 받아요"),
    ("goto", ISLAND, "무인도로 떠내려갔어요"),
    ("goto", SPACE, "우주여행 정거장으로!"),
    ("back", 3, "뒤로 3칸"),
    ("repair", 3, "건물 수리비: 건물 한 채마다 3만 원"),
    ("escape", 0, "무인도 탈출권 (한 번 쓸 수 있어요)"),
    ("cash", 15, "장학금 15만 원을 받아요"),
    ("fine", 15, "여행 경비 15만 원 (기금으로)"),
    ("goto", 31, "서울 구경 가요! (출발을 지나면 월급)"),
    ("fwd", 2, "앞으로 2칸"),
    ("fine", 10, "기부해요: 기금에 10만 원"),
]


def base_rent(price: int) -> int:
    return max(1, round(price * 0.3))


class Travel:
    TAKES_OPTS = True
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.max_rounds = int((opts or {}).get("rounds", 20))
        self.cash = [START_CASH] * n_seats
        self.pos = [0] * n_seats
        self.island = [0] * n_seats
        self.escape = [0] * n_seats
        self.space = [False] * n_seats
        self.out = [False] * n_seats
        self.owner = [-1] * N
        self.lv = [0] * N
        self.fund = 0
        self.turn = rng.randrange(n_seats)
        self.first = self.turn
        self.turns = 0
        self.doubles = 0
        self.extra = False
        self.phase = "roll"
        self.pending: Optional[dict] = None
        self.over = False
        self.events: List[dict] = []
        self.ev = 0
        self.deadline = 0.0
        self.bust_order: List[int] = []
        self._set_deadline()

    # ---------------- 도우미 ----------------
    def _event(self, k: str, **kw) -> None:
        self.ev += 1
        e = {"k": k, "id": self.ev, "s": self.turn}
        e.update(kw)
        self.events.append(e)
        self.events = self.events[-12:]

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over else 0

    def actor(self) -> int:
        return -1 if self.over else self.turn

    def step(self) -> Optional[float]:
        return None

    def rent(self, c: int) -> int:
        k, _, g, price = BOARD[c]
        o = self.owner[c]
        if o < 0:
            return 0
        if k == "tour":
            n_t = sum(1 for j, b in enumerate(BOARD) if b[0] == "tour" and self.owner[j] == o)
            return round(price * 0.3) * n_t
        r = base_rent(price) * MULT[self.lv[c]]
        if self.lv[c] == 0 and all(self.owner[j] == o for j in GROUPS[g]):
            r *= 2
        return r

    def build_cost(self, c: int) -> int:
        return max(2, round(BOARD[c][3] * 0.4))

    def worth(self, c: int) -> int:
        """땅 + 건물 값 (팔 때는 반값)"""
        if self.owner[c] < 0:
            return 0
        return BOARD[c][3] + self.build_cost(c) * self.lv[c]

    def assets(self, i: int) -> int:
        return self.cash[i] + sum(self.worth(c) for c in range(N) if self.owner[c] == i)

    def alive(self) -> List[int]:
        return [i for i in range(self.n) if not self.out[i]]

    # ---------------- 돈 ----------------
    def _pay(self, i: int, amount: int, to: int = -1, why: str = "") -> bool:
        """i 가 amount 를 to(-1: 기금, -2: 은행)에게. 모자라면 팔고, 그래도 모자라면 파산"""
        if amount <= 0:
            return True
        if self.cash[i] < amount:
            self._raise(i, amount)
        if self.cash[i] < amount:
            paid = self.cash[i]
            self.cash[i] = 0
            if to >= 0:
                self.cash[to] += paid
            elif to == -1:
                self.fund += paid
            self._bankrupt(i)
            return False
        self.cash[i] -= amount
        if to >= 0:
            self.cash[to] += amount
        elif to == -1:
            self.fund += amount
        return True

    def _raise(self, i: int, need: int) -> None:
        """싼 것부터 반값에 팔아요 (건물 먼저)"""
        while self.cash[i] < need:
            mine = [c for c in range(N) if self.owner[c] == i]
            if not mine:
                return
            blds = [c for c in mine if self.lv[c] > 0]
            if blds:
                c = min(blds, key=lambda x: self.build_cost(x))
                self.lv[c] -= 1
                got = self.build_cost(c) // 2
                self._event("sell", who=i, cell=c, what=NAMES_L[self.lv[c] + 1], got=got)
            else:
                c = min(mine, key=lambda x: BOARD[x][3])
                self.owner[c] = -1
                got = BOARD[c][3] // 2
                self._event("sell", who=i, cell=c, what="땅", got=got)
            self.cash[i] += got

    def _bankrupt(self, i: int) -> None:
        self.out[i] = True
        self.bust_order.append(i)
        for c in range(N):
            if self.owner[c] == i:
                self.owner[c] = -1
                self.lv[c] = 0
        self._event("bankrupt", who=i)
        if len(self.alive()) <= 1:
            self.over = True
            self.phase = "done"
            self.deadline = 0

    # ---------------- 차례 ----------------
    def _next_turn(self) -> None:
        if self.over:
            return
        self.pending = None
        if self.extra and not self.out[self.turn]:
            self.extra = False
            self.phase = "roll"
            self._set_deadline()
            return
        self.extra = False
        self.doubles = 0
        for k in range(1, self.n + 1):
            j = (self.turn + k) % self.n
            if not self.out[j]:
                self.turn = j
                break
        self.turns += 1
        if self.turns >= self.max_rounds * len(self.alive()):
            self.over = True
            self.phase = "done"
            self.deadline = 0
            self._event("end")
            return
        self.phase = "fly" if self.space[self.turn] else "roll"
        self._set_deadline()

    def _move_to(self, i: int, dest: int, walk: bool = True) -> None:
        start = self.pos[i]
        path = []
        if walk:
            p = start
            while p != dest:
                p = (p + 1) % N
                path.append(p)
                if p == 0:
                    self.cash[i] += SALARY
            if 0 in path:
                self._event("salary", who=i, got=SALARY)
        else:
            path = [dest]
        self.pos[i] = dest
        self._event("move", who=i, frm=start, path=path)

    def _land(self, i: int) -> None:
        c = self.pos[i]
        kind, name, g, price = BOARD[c]
        if kind in ("city", "tour"):
            o = self.owner[c]
            if o < 0:
                if self.cash[i] >= price:
                    self.phase = "buy"
                    self.pending = {"cell": c, "price": price, "build": self.build_cost(c) if kind == "city" else 0}
                    self._set_deadline()
                    return
            elif o == i:
                if kind == "city" and self.lv[c] < 3 and self.cash[i] >= self.build_cost(c):
                    self.phase = "build"
                    self.pending = {"cell": c, "cost": self.build_cost(c), "to": NAMES_L[self.lv[c] + 1]}
                    self._set_deadline()
                    return
            else:
                r = self.rent(c)
                self._event("rent", who=i, to=o, cell=c, amount=r)
                self._pay(i, r, o)
        elif kind == "key":
            card = self.rng.choice(KEYS)
            self._event("key", who=i, text=card[2])
            self._apply_key(i, card)
            return
        elif kind == "island":
            self.island[i] = 2
            self.extra = False
            self._event("island", who=i)
        elif kind == "fest":
            got = self.fund
            self.fund = 0
            self.cash[i] += got
            self._event("fest", who=i, got=got)
        elif kind == "space":
            self.space[i] = True
            self._event("space", who=i)
        elif kind == "tax":
            self._event("tax", who=i, amount=price)
            self._pay(i, price, -1)
        self._next_turn()

    def _apply_key(self, i: int, card) -> None:
        typ, val, _ = card
        if typ == "cash":
            self.cash[i] += val
        elif typ == "birthday":
            for j in self.alive():
                if j != i:
                    self._pay(j, val, i)
        elif typ == "fine":
            self._pay(i, val, -1)
        elif typ == "repair":
            n_b = sum(self.lv[c] for c in range(N) if self.owner[c] == i)
            self._pay(i, val * n_b, -1)
        elif typ == "escape":
            self.escape[i] += 1
        elif typ == "goto":
            if val == ISLAND:
                self._move_to(i, ISLAND, walk=False)
                self.island[i] = 2
                self.extra = False
                self._next_turn()
                return
            self._move_to(i, val, walk=True)
            if not self.out[i]:
                self._land(i)
            return
        elif typ in ("back", "fwd"):
            dest = (self.pos[i] - val) % N if typ == "back" else (self.pos[i] + val) % N
            self._move_to(i, dest, walk=(typ == "fwd"))
            if not self.out[i]:
                self._land(i)
            return
        self._next_turn()

    # ---------------- 수 ----------------
    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        k = a.get("k")
        if self.phase == "roll" and k == "roll":
            d1, d2 = self.rng.randint(1, 6), self.rng.randint(1, 6)
            dbl = d1 == d2
            self._event("dice", who=i, d=[d1, d2])
            if self.island[i] > 0:
                if dbl or self.escape[i]:
                    if not dbl:
                        self.escape[i] -= 1
                        self._event("escape", who=i)
                    self.island[i] = 0
                else:
                    self.island[i] -= 1
                    self._event("stuck", who=i, left=self.island[i])
                    self._next_turn()
                    return None
            elif dbl:
                self.doubles += 1
                if self.doubles >= 3:
                    self._event("triple", who=i)
                    self._move_to(i, ISLAND, walk=False)
                    self.island[i] = 2
                    self.extra = False
                    self._next_turn()
                    return None
                self.extra = True
            self._move_to(i, (self.pos[i] + d1 + d2) % N)
            self._land(i)
            return None
        if self.phase == "fly" and k == "fly":
            try:
                dest = int(a.get("c"))
            except (TypeError, ValueError):
                return "갈 곳을 골라요"
            if not (0 <= dest < N) or dest == SPACE:
                return "다른 곳을 골라요"
            self.space[i] = False
            self._event("fly", who=i, to=dest)
            self._move_to(i, dest, walk=True)
            self._land(i)
            return None
        if self.phase == "buy" and k in ("buy", "buy2", "pass"):
            c = self.pending["cell"]
            if k in ("buy", "buy2") and self.cash[i] >= BOARD[c][3]:
                self.cash[i] -= BOARD[c][3]
                self.owner[c] = i
                self._event("buy", who=i, cell=c)
                # 별장까지 한 번에
                if k == "buy2" and BOARD[c][0] == "city" and self.cash[i] >= self.build_cost(c):
                    self.cash[i] -= self.build_cost(c)
                    self.lv[c] = 1
                    self._event("build", who=i, cell=c, what=NAMES_L[1])
            self._next_turn()
            return None
        if self.phase == "build" and k in ("build", "pass"):
            c = self.pending["cell"]
            if k == "build" and self.cash[i] >= self.build_cost(c) and self.lv[c] < 3:
                self.cash[i] -= self.build_cost(c)
                self.lv[c] += 1
                self._event("build", who=i, cell=c, what=NAMES_L[self.lv[c]])
            self._next_turn()
            return None
        return "지금 할 수 없는 거예요"

    def timeout_action(self, i: int) -> dict:
        if self.phase == "roll":
            return {"k": "roll"}
        if self.phase == "fly":
            return {"k": "fly", "c": 0}
        return {"k": "pass"}

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        last = self.events[-1] if self.events else None
        walk = len(last.get("path", [])) * 0.18 if last and last["k"] == "move" else 0
        return 1.0 + walk + self.rng.uniform(0.3, 0.8)

    def ai_action(self, i: int) -> dict:
        lv = self.level
        if self.phase == "roll":
            return {"k": "roll"}
        reserve = {1: 0, 2: 20, 3: 30, 4: 28, 5: 28}.get(lv, 25)
        if self.phase == "buy":
            c = self.pending["cell"]
            if lv <= 1:
                return {"k": "buy" if self.rng.random() < 0.6 else "pass"}
            want = reserve
            if lv >= 4 and BOARD[c][0] == "city":
                g = BOARD[c][2]
                mine = sum(1 for j in GROUPS[g] if self.owner[j] == i)
                if mine >= 1:
                    want = 10          # 같은 색 모으기
            if self.cash[i] - BOARD[c][3] < want:
                return {"k": "pass"}
            if BOARD[c][0] == "city" and lv >= 2 and self.cash[i] - BOARD[c][3] - self.build_cost(c) >= reserve * 1.2:
                return {"k": "buy2"}
            return {"k": "buy"}
        if self.phase == "build":
            c = self.pending["cell"]
            if lv <= 1:
                return {"k": "build" if self.rng.random() < 0.5 else "pass"}
            return {"k": "build" if self.cash[i] - self.build_cost(c) >= reserve * 1.3 else "pass"}
        if self.phase == "fly":
            if lv <= 1:
                return {"k": "fly", "c": self.rng.choice([c for c in range(N) if c != SPACE])}
            # 내 도시(건물 올리기) 또는 살 수 있는 비싼 빈 도시
            best, bv = 0, -1
            for c in range(N):
                if c == SPACE:
                    continue
                k, _, g, price = BOARD[c]
                v = 0
                if k in ("city", "tour") and self.owner[c] < 0 and self.cash[i] - price >= reserve:
                    v = price + 5
                elif k == "city" and self.owner[c] == i and self.lv[c] < 3 and self.cash[i] - self.build_cost(c) >= reserve:
                    v = price * 0.8
                elif k == "fest":
                    v = self.fund * 1.2
                if c < self.pos[i]:
                    v += SALARY * 0.5        # 출발을 지나면 월급
                if self.owner[c] >= 0 and self.owner[c] != i:
                    v = -1
                if v > bv:
                    bv, best = v, c
            return {"k": "fly", "c": best}
        return {"k": "pass"}

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {"board": [[b[0], b[1], b[2], b[3]] for b in BOARD], "owner": self.owner[:], "lv": self.lv[:],
             "rent": [self.rent(c) for c in range(N)], "cash": self.cash[:], "pos": self.pos[:], "island": self.island[:],
             "escape": self.escape[:], "space": self.space[:], "out": self.out[:], "fund": self.fund, "turn": self.turn,
             "toAct": self.actor(), "phase": self.phase, "pending": self.pending, "events": self.events[-8:], "me": seat,
             "over": self.over, "round": self.turns // max(1, len(self.alive())) + 1, "rounds": self.max_rounds,
             "assets": [self.assets(i) for i in range(self.n)], "deadline": int(self.deadline * 1000) if self.deadline else 0}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        alive = sorted(self.alive(), key=lambda j: -self.assets(j))
        order = alive + list(reversed(self.bust_order))
        return {"winner": order[0], "rank": order, "assets": [self.assets(i) for i in range(self.n)], "hands": 0}
