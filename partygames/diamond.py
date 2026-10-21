"""다이아몬드 게임 (중국식 체커) — 2~3명 (AI 친구 가능)

- 별 모양 판 121칸 (정육각 좌표 x+y+z=0). 내 진영(꼭짓점 삼각형 10칸)에 말 10개
- 내 차례: 말 하나를 옆 빈칸으로 한 칸, 또는 바로 옆 말(누구 것이든)을 뛰어넘어 빈칸으로 — 뛰어넘기는 계속 이어서 할 수 있어요
- 맞은편 진영을 내 말 10개로 먼저 다 채우면 승리
- 2명: 마주 보는 두 진영 · 3명: 하나 건너 세 진영
- 너무 길어지면(한 사람당 120수) 많이 간 사람이 이겨요
"""
import random
import time
from typing import Dict, List, Optional, Tuple

Cell = Tuple[int, int, int]
DIRS: List[Cell] = [(1, -1, 0), (1, 0, -1), (0, 1, -1), (-1, 1, 0), (-1, 0, 1), (0, -1, 1)]
TURN_SEC = 40
MAX_MOVES = 120


def _board() -> List[Cell]:
    out = []
    for x in range(-8, 9):
        for y in range(-8, 9):
            z = -x - y
            if -8 <= z <= 8 and ((x >= -4 and y >= -4 and z >= -4) or (x <= 4 and y <= 4 and z <= 4)):
                out.append((x, y, z))
    return out


BOARD = _board()
BSET = set(BOARD)
# 진영: (축, 부호) — 축 0=x, 1=y, 2=z.  (a, +1) 은 그 좌표가 4보다 큰 꼭짓점
CORNERS = {(a, s): [c for c in BOARD if (c[a] > 4 if s > 0 else c[a] < -4)] for a in range(3) for s in (1, -1)}


def add(a: Cell, b: Cell, k: int = 1) -> Cell:
    return (a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k)


def reach(occ: Dict[Cell, int], frm: Cell) -> Dict[Cell, List[Cell]]:
    """frm 에서 갈 수 있는 칸 → 가는 길 (한 칸 걷기 또는 뛰어넘기 이어서)"""
    out: Dict[Cell, List[Cell]] = {}
    for d in DIRS:
        n = add(frm, d)
        if n in BSET and n not in occ:
            out[n] = [n]
    # 뛰어넘기 (여러 번)
    stack = [(frm, [])]
    seen = {frm}
    while stack:
        cur, path = stack.pop()
        for d in DIRS:
            mid = add(cur, d)
            land = add(cur, d, 2)
            if mid in occ and land in BSET and land not in occ and land not in seen and mid != frm:
                seen.add(land)
                p2 = path + [land]
                if land not in out or len(out[land]) > len(p2):
                    out[land] = p2
                stack.append((land, p2))
    out.pop(frm, None)
    return out


class Diamond:
    TAKES_OPTS = True
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        homes = [(2, 1), (2, -1)] if n_seats == 2 else [(2, 1), (0, 1), (1, 1)]
        self.home = homes[:n_seats]
        self.target = [(a, -s) for a, s in self.home]
        self.occ: Dict[Cell, int] = {}
        for i, h in enumerate(self.home):
            for c in CORNERS[h]:
                self.occ[c] = i
        self.turn = rng.randrange(n_seats)
        self.moves_made = [0] * n_seats
        self.over = False
        self.winner = -1
        self.events: List[dict] = []
        self.ev = 0
        self.deadline = 0.0
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over else 0

    def actor(self) -> int:
        return -1 if self.over else self.turn

    def step(self) -> Optional[float]:
        return None

    # 목표까지 남은 거리 (작을수록 좋아요): 목표 진영 꼭짓점 끝 칸까지의 육각 거리
    def tip(self, i: int) -> Cell:
        a, s = self.target[i]          # (a, s): s>0 이면 그 좌표가 +8 인 꼭짓점
        t = [-4 * s, -4 * s, -4 * s]
        t[a] = 8 * s
        return tuple(t)

    def prog(self, i: int, c: Cell) -> int:
        t = self.tip(i)
        return max(abs(c[0] - t[0]), abs(c[1] - t[1]), abs(c[2] - t[2]))

    def score(self, i: int, occ=None) -> int:
        occ = self.occ if occ is None else occ
        return sum(self.prog(i, c) for c, o in occ.items() if o == i)

    def won(self, i: int) -> bool:
        tgt = CORNERS[self.target[i]]
        return all(self.occ.get(c) == i for c in tgt)

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        if a.get("k") != "move":
            return "말을 옮겨요"
        try:
            frm = tuple(int(x) for x in a.get("f"))
            to = tuple(int(x) for x in a.get("t"))
        except (TypeError, ValueError):
            return "칸이 이상해요"
        if self.occ.get(frm) != i:
            return "내 말을 골라요"
        r = reach(self.occ, frm)
        if to not in r:
            return "거기로는 갈 수 없어요"
        self._move(i, frm, to, r[to])
        return None

    def _move(self, i: int, frm: Cell, to: Cell, path: List[Cell]) -> None:
        del self.occ[frm]
        self.occ[to] = i
        self.moves_made[i] += 1
        self.ev += 1
        self.events.append({"k": "move", "id": self.ev, "s": i, "f": frm, "path": path})
        self.events = self.events[-6:]
        if self.won(i):
            self.over = True
            self.winner = i
            self.deadline = 0
            return
        if min(self.moves_made) >= MAX_MOVES:
            self.over = True
            self.winner = min(range(self.n), key=lambda j: self.score(j))
            self.deadline = 0
            return
        self.turn = (self.turn + 1) % self.n
        self._set_deadline()

    def timeout_action(self, i: int) -> dict:
        return self._ai(i, 2)

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        last = self.events[-1] if self.events else None
        anim = len(last["path"]) * 0.25 if last else 0
        return anim + self.rng.uniform(0.7, 1.3)

    def ai_action(self, i: int) -> dict:
        return self._ai(i, self.level)

    def all_moves(self, i: int, occ=None):
        occ = self.occ if occ is None else occ
        out = []
        for c, o in list(occ.items()):
            if o != i:
                continue
            for to, path in reach(occ, c).items():
                out.append((c, to, path))
        return out

    def _eval(self, i: int, occ) -> float:
        mine = [c for c, o in occ.items() if o == i]
        ps = [self.prog(i, c) for c in mine]
        tgt = set(CORNERS[self.target[i]])
        inside = sum(1 for c in mine if c in tgt)
        lag = max(ps) - min(ps)
        # 끝판: 비어 있는 목표 칸까지 가까울수록 (마지막 말이 헤매지 않게)
        empty_t = [t for t in tgt if occ.get(t) != i]
        out = [c for c in mine if c not in tgt]
        fin = 0.0
        if empty_t and out and len(out) <= 3:
            for c in out:
                fin += min(max(abs(c[0] - t[0]), abs(c[1] - t[1]), abs(c[2] - t[2])) for t in empty_t)
        return -sum(ps) * 1.0 - max(0, lag - 6) * 0.3 + inside * 0.5 - fin * 1.5

    def _ai(self, i: int, lv: int) -> dict:
        ms = self.all_moves(i)
        if not ms:
            return {"k": "move", "f": [0, 0, 0], "t": [0, 0, 0]}
        def gain(m):
            return self.prog(i, m[0]) - self.prog(i, m[1])
        if lv <= 1:
            fw = [m for m in ms if gain(m) > 0] or ms
            m = self.rng.choice(fw)
        else:
            # 뒤로 가는 수는 빼요 (왔다 갔다 하며 시간만 끌지 않게) — 앞으로 갈 수 없을 때만
            fw = [m for m in ms if gain(m) > 0] or [m for m in ms if gain(m) == 0] or ms
            ms = fw
            best = None
            bv = -1e9
            for m in ms:
                occ = dict(self.occ)
                del occ[m[0]]
                occ[m[1]] = i
                if lv == 2:
                    v = gain(m) + self.rng.random() * 1.5
                else:
                    v = self._eval(i, occ)
                    if lv >= 4:
                        # 내 다음 수까지 (상대는 그대로라고 보고) 가장 좋은 것
                        nxt = -1e9
                        for m2 in self.all_moves(i, occ):
                            if self.prog(i, m2[0]) - self.prog(i, m2[1]) < 0:
                                continue
                            occ2 = dict(occ)
                            del occ2[m2[0]]
                            occ2[m2[1]] = i
                            nxt = max(nxt, self._eval(i, occ2))
                        v = v * 0.4 + nxt * 0.6
                    v += self.rng.random() * {3: 0.8, 4: 0.3}.get(lv, 0.05)
                if v > bv:
                    bv, best = v, m
            m = best
        return {"k": "move", "f": list(m[0]), "t": list(m[1])}

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {"pegs": [[c[0], c[1], c[2], o] for c, o in self.occ.items()], "turn": self.turn, "toAct": self.actor(),
             "home": [list(h) for h in self.home], "target": [list(t) for t in self.target], "events": self.events[-4:],
             "me": seat, "over": self.over, "deadline": int(self.deadline * 1000) if self.deadline else 0,
             "moves": self.moves_made[:], "inside": [sum(1 for c in CORNERS[self.target[j]] if self.occ.get(c) == j) for j in range(self.n)]}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: (j != self.winner, self.score(j)))
        return {"winner": order[0], "rank": order, "hands": self.moves_made[order[0]]}
