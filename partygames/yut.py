"""윷놀이 — 2~4명 (AI 친구 가능)

판: 바깥 20칸 + 지름길 9칸
   참먹이(E, 오른쪽 아래) 에서 출발 → 오른쪽 위로 올라가 모(o5) → 왼쪽 위 뒷모(o10) → 왼쪽 아래(o15) → 참먹이(E) → 나기
   지름길: 모(o5)나 뒷모(o10)에 '멈추면' 다음에는 가운데(방 C)로 가는 대각선
           방(C)에 멈추면 다음에는 참먹이 쪽 대각선 (가장 짧은 길)
           o5 대각선을 따라 방을 '지나가면' 왼쪽 아래(o15) 로
   참먹이에 정확히 멈추면 아직 판 위 → 다음에 아무 숫자나 나오면 나가요
윷가락 4개 (한 개는 빽도 표시): 평평한 면이 나올 확률 0.6
   도 1 · 개 2 · 걸 3 · 윷 4(한 번 더) · 모 5(한 번 더) · 빽도 -1 (표시한 가락만 평평)
업기: 내 말이 있는 칸에 멈추면 함께 움직여요
잡기: 상대 말이 있는 칸에 멈추면 집으로 돌려보내고 한 번 더 던져요
던진 결과는 모아 두었다가 원하는 순서로 원하는 말에 써요
"""
import random
import time
from typing import Dict, List, Optional, Tuple

TURN_SEC = 30
P_FLAT = 0.6
NAMES = {1: "도", 2: "개", 3: "걸", 4: "윷", 5: "모", -1: "빽도"}

OUTER = [f"o{i}" for i in range(1, 20)]          # o1..o19
NODES = ["E"] + OUTER + ["a1", "a2", "C", "a3", "a4", "b1", "b2", "b3", "b4"]
HOME, OUT = "H", "X"


def succ(x: str, first: bool, came: Optional[str]) -> str:
    """한 칸 앞으로. first: 이번 이동의 첫 걸음(멈춰 있던 칸에서 출발) · came: 바로 전 칸"""
    if x == HOME:
        return "o1"
    if x == "E":
        return OUT
    if first and x == "o5":
        return "a1"
    if first and x == "o10":
        return "b1"
    if x == "C":
        if first:
            return "b3"
        return "a3" if came == "a2" else "b3"
    nxt = {"a1": "a2", "a2": "C", "a3": "a4", "a4": "o15", "b1": "b2", "b2": "C", "b3": "b4", "b4": "E", "o19": "E"}
    if x in nxt:
        return nxt[x]
    i = int(x[1:])
    return f"o{i + 1}"


def walk(x: str, n: int) -> List[str]:
    """x 에서 n 칸 앞으로 갈 때 지나는 칸들 (마지막이 도착). 나가면 마지막이 OUT"""
    path = []
    cur = x
    came = None
    for k in range(n):
        nx = succ(cur, k == 0, came)
        path.append(nx)
        came, cur = cur, nx
        if nx == OUT:
            break
    return path


def _dist_table() -> Dict[str, int]:
    """나가기까지 가장 적은 걸음 (지름길로 멈출 수 있다고 보고) — AI 가 '얼마나 왔나' 를 잴 때 써요"""
    nxt: Dict[str, set] = {}
    for x in NODES + [HOME]:
        nxt[x] = {succ(x, True, None), succ(x, False, None)}
    nxt["C"] = {"a3", "b3"}
    dist = {OUT: 0}
    changed = True
    while changed:
        changed = False
        for x, ns in nxt.items():
            ds = [dist[y] + 1 for y in ns if y in dist]
            if ds and (x not in dist or min(ds) < dist[x]):
                dist[x] = min(ds)
                changed = True
    return dist


DIST = _dist_table()


def throw(rng: random.Random) -> int:
    sticks = [rng.random() < P_FLAT for _ in range(4)]   # 0번이 빽도 표시 가락
    n = sum(sticks)
    if n == 0:
        return 5
    if n == 1 and sticks[0]:
        return -1
    return n


class Yut:
    TAKES_OPTS = True
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        o = opts or {}
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.npieces = int(o.get("pieces", 4))
        # 말 무리: {id, owner, node, k(몇 개), trail(지나온 칸)}  · 집에 있는 말 수 · 난 말 수
        self.groups: List[dict] = []
        self.home = [self.npieces] * n_seats
        self.done = [0] * n_seats
        self.gid = 0
        self.turn = rng.randrange(n_seats)
        self.throws = 1
        self.results: List[int] = []
        self.over = False
        self.finish_order: List[int] = []
        self.events: List[dict] = []
        self.ev = 0
        self.wait_until = 0.0
        self.deadline = 0.0
        self.phase = "throw"
        self.last_throw: Optional[int] = None
        self._set_deadline()

    # ---------------- 도우미 ----------------
    def _event(self, k: str, **kw) -> None:
        self.ev += 1
        e = {"k": k, "id": self.ev, "s": self.turn}
        e.update(kw)
        self.events.append(e)
        self.events = self.events[-10:]

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over else 0

    def group_at(self, node: str) -> Optional[dict]:
        return next((g for g in self.groups if g["node"] == node), None)

    def actor(self) -> int:
        return -1 if self.over else self.turn

    def step(self) -> Optional[float]:
        return None

    # 결과 r 을 무리 src(gid 또는 'home') 에 쓰면?
    def dest(self, owner: int, src, r: int) -> Optional[Tuple[str, List[str]]]:
        if src == "home":
            if self.home[owner] <= 0 or r < 1:
                return None
            path = walk(HOME, r)
            return path[-1], path
        g = next((x for x in self.groups if x["id"] == src and x["owner"] == owner), None)
        if not g:
            return None
        if r == -1:
            tr = g["trail"]
            back = tr[-2] if len(tr) >= 2 else "E"
            if back == HOME:
                back = "E"
            return back, [back]
        path = walk(g["node"], r)
        return path[-1], path

    def moves(self, owner: int) -> List[dict]:
        """지금 할 수 있는 수: {r: 결과 번호(인덱스), src, to}"""
        out = []
        seen = set()
        for ri, r in enumerate(self.results):
            if (r, "home") not in seen and self.home[owner] > 0 and r >= 1:
                seen.add((r, "home"))
                d = self.dest(owner, "home", r)
                out.append({"r": ri, "src": "home", "to": d[0]})
            for g in self.groups:
                if g["owner"] != owner or (r, g["id"]) in seen:
                    continue
                seen.add((r, g["id"]))
                d = self.dest(owner, g["id"], r)
                if d:
                    out.append({"r": ri, "src": g["id"], "to": d[0]})
        return out

    # ---------------- 수 ----------------
    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        k = a.get("k")
        if k == "throw":
            if self.phase != "throw" or self.throws <= 0:
                return "지금은 말을 움직여요"
            r = throw(self.rng)
            self.throws -= 1
            self.last_throw = r
            if r in (4, 5):
                self.throws += 1
            self.results.append(r)
            self._event("throw", r=r)
            if self.throws <= 0:
                self._after_throws()
            else:
                self._set_deadline()
            return None
        if k == "move":
            if self.phase != "move":
                return "먼저 윷을 던져요"
            try:
                ri = int(a.get("r"))
            except (TypeError, ValueError):
                return "결과를 골라요"
            if not (0 <= ri < len(self.results)):
                return "결과를 골라요"
            src = a.get("src")
            if src != "home":
                try:
                    src = int(src)
                except (TypeError, ValueError):
                    return "말을 골라요"
            r = self.results[ri]
            d = self.dest(i, src, r)
            if not d:
                return "그 말은 움직일 수 없어요"
            self._do_move(i, ri, src, d)
            return None
        return "알 수 없는 수예요"

    def _after_throws(self) -> None:
        # 빽도만 있고 판에 말이 없으면 버려요
        if not any(g["owner"] == self.turn for g in self.groups):
            if all(r == -1 for r in self.results):
                self._event("waste")
                self.results = []
                self._next_turn()
                return
        self.phase = "move"
        self._set_deadline()
        self._auto_drop()

    def _auto_drop(self) -> None:
        """쓸 수 없는 결과(판에 말 없는 빽도)는 버려요"""
        while self.results and not self.moves(self.turn):
            self.results.pop(0)
        if not self.results:
            self._next_turn()

    def _do_move(self, i: int, ri: int, src, d: Tuple[str, List[str]]) -> None:
        to, path = d
        r = self.results.pop(ri)
        if src == "home":
            self.home[i] -= 1
            g = {"id": self._new_id(), "owner": i, "node": HOME, "k": 1, "trail": [HOME]}
            self.groups.append(g)
        else:
            g = next(x for x in self.groups if x["id"] == src)
        frm = g["node"]
        captured = None
        stacked = False
        if to == OUT:
            self.groups.remove(g)
            self.done[i] += g["k"]
            self._event("move", frm=frm, path=path, n=g["k"], out=True, r=r, owner=i)
        else:
            other = self.group_at(to)
            if other and other is not g:
                if other["owner"] == i:
                    g["k"] += other["k"]
                    self.groups.remove(other)
                    stacked = True
                else:
                    self.groups.remove(other)
                    self.home[other["owner"]] += other["k"]
                    captured = {"owner": other["owner"], "n": other["k"]}
            g["node"] = to
            if r == -1:
                tr = g["trail"][:-1]
                if not tr or tr[-1] != to:
                    tr = tr + [to]
                g["trail"] = tr[-12:]
            else:
                g["trail"] = (g["trail"] + path)[-12:]
            self._event("move", frm=frm, path=path, n=g["k"], to=to, cap=captured, stack=stacked, r=r, owner=i)
        if self.done[i] >= self.npieces:
            self.finish_order.append(i)
            self._event("finish", who=i)
            self.over = True
            self.phase = "done"
            self.deadline = 0
            return
        if captured:
            self.throws += 1
            self.phase = "throw"
            self._event("bonus", why="잡기")
            self._set_deadline()
            return
        if self.results:
            self._auto_drop()
            if not self.over and self.results:
                self._set_deadline()
            return
        self._next_turn()

    def _new_id(self) -> int:
        self.gid += 1
        return self.gid

    def _next_turn(self) -> None:
        self.results = []
        self.turn = (self.turn + 1) % self.n
        self.throws = 1
        self.phase = "throw"
        self._set_deadline()

    def timeout_action(self, i: int) -> dict:
        if self.phase == "throw":
            return {"k": "throw"}
        return self._ai_move(i, 2)

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        return self.rng.uniform(1.0, 1.5) if self.phase == "throw" else self.rng.uniform(1.6, 2.2)

    def ai_action(self, i: int) -> dict:
        if self.phase == "throw":
            return {"k": "throw"}
        return self._ai_move(i, self.level)

    def _threat(self, owner: int, node: str) -> float:
        """상대가 다음에 이 칸을 잡을 확률 (대충): 뒤 1~5칸 안의 상대 말"""
        if node in (OUT, HOME):
            return 0.0
        pr = {1: 0.1536 - 0.0384, 2: 0.3456, 3: 0.3456, 4: 0.1296, 5: 0.0256, -1: 0.0384}
        risk = 0.0
        for g in self.groups:
            if g["owner"] == owner:
                continue
            for r, p in pr.items():
                if r == -1:
                    tr = g["trail"]
                    if len(tr) >= 2 and tr[-2] == node:
                        risk += p
                    continue
                if walk(g["node"], r)[-1] == node:
                    risk += p
        for o in range(self.n):
            if o != owner and self.home[o] > 0:
                for r in (1, 2, 3, 4, 5):
                    if walk(HOME, r)[-1] == node:
                        risk += pr[r] * 0.8
        return min(1.0, risk)

    def _score_move(self, i: int, m: dict, lv: int) -> float:
        r = self.results[m["r"]]
        src = m["src"]
        to = m["to"]
        if src == "home":
            k, frm = 1, HOME
        else:
            g = next(x for x in self.groups if x["id"] == src)
            k, frm = g["k"], g["node"]
        gain = (DIST[frm] - (0 if to == OUT else DIST[to])) * k
        v = gain * 1.0
        if to == OUT:
            v += 6 * k
        other = self.group_at(to) if to != OUT else None
        if other and other["owner"] != i:
            v += 12 + 5 * other["k"] + (14 - DIST[other["node"]]) * 0.6
        if other and other["owner"] == i and lv >= 3:
            v += 3
        if to in ("o5", "o10", "C"):
            v += 4 if lv >= 2 else 0
        if lv >= 3:
            v -= self._threat(i, to) * (8 + 4 * k) * (1.3 if lv >= 4 else 1.0)
            if src != "home":
                v += self._threat(i, frm) * (6 + 3 * k) * 0.8      # 위험한 칸에서 도망
        if lv >= 4 and r == -1 and other and other["owner"] != i:
            v += 4
        return v

    def _ai_move(self, i: int, lv: int) -> dict:
        ms = self.moves(i)
        if not ms:
            return {"k": "move", "r": 0, "src": "home"}
        if lv <= 1:
            m = self.rng.choice(ms)
        else:
            noise = {2: 2.5, 3: 1.0, 4: 0.3, 5: 0.0}.get(lv, 0.5)
            m = max(ms, key=lambda x: self._score_move(i, x, lv) + self.rng.random() * noise)
        return {"k": "move", "r": m["r"], "src": m["src"]}

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {
            "turn": self.turn, "toAct": self.actor(), "phase": self.phase, "throws": self.throws, "results": self.results[:],
            "groups": [{"id": g["id"], "owner": g["owner"], "node": g["node"], "k": g["k"]} for g in self.groups],
            "home": self.home[:], "done": self.done[:], "pieces": self.npieces, "events": self.events[-6:],
            "deadline": int(self.deadline * 1000) if self.deadline else 0, "me": seat, "over": self.over,
            "last": self.last_throw,
        }
        if seat is not None and seat == self.turn and self.phase == "move":
            v["moves"] = self.moves(seat)
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: (-self.done[j], -sum(DIST["H"] - DIST[g["node"]] for g in self.groups if g["owner"] == j)))
        if self.finish_order:
            w = self.finish_order[0]
            order = [w] + [j for j in order if j != w]
        return {"winner": order[0], "rank": order, "done": self.done[:], "hands": 0}
