"""배틀십 (바다 대결) — 2명 (사람끼리 또는 AI)

- 8×8 바다에 배 5척: 항공모함 4칸 · 전함 3칸 · 순양함 3칸 · 구축함 2칸 · 잠수함 2칸 (서로 붙지 않게)
- 배치: [다시 섞기]로 마음에 들 때까지 섞고 [준비 완료]
- 번갈아 상대 바다의 한 칸을 쏴요. 맞히면(설정) 한 번 더. 배의 모든 칸을 맞히면 '격침'
- 상대 배를 먼저 모두 가라앉히면 승리
AI: 1단계 아무 데나 · 2단계 맞히면 주변 · 3단계 + 바둑판 무늬로 찾기 · 4·5단계 남은 배가 있을 확률을 계산해서
"""
import random
import time
from typing import List, Optional, Set, Tuple

N = 8
SHIPS = [("항공모함", 4), ("전함", 3), ("순양함", 3), ("구축함", 2), ("잠수함", 2)]
PLACE_SEC = 60
TURN_SEC = 25


def random_fleet(rng: random.Random) -> List[List[Tuple[int, int]]]:
    for _ in range(2000):
        taken: Set[Tuple[int, int]] = set()
        fleet = []
        ok = True
        for _, ln in SHIPS:
            for _ in range(200):
                horiz = rng.random() < 0.5
                r = rng.randrange(N if horiz else N - ln + 1)
                c = rng.randrange(N - ln + 1 if horiz else N)
                cells = [(r, c + k) if horiz else (r + k, c) for k in range(ln)]
                # 서로 붙지 않게 (대각선 포함)
                if any((rr + dr, cc + dc) in taken for rr, cc in cells for dr in (-1, 0, 1) for dc in (-1, 0, 1)):
                    continue
                fleet.append(cells)
                taken.update(cells)
                break
            else:
                ok = False
                break
        if ok:
            return fleet
    raise RuntimeError("배를 놓을 수 없어요")


class Ship:
    TAKES_OPTS = True
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = 2
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.again = (opts or {}).get("hit", "again") == "again"
        self.fleets = [random_fleet(rng) for _ in range(2)]
        self.shots: List[dict] = [{}, {}]          # shots[i][(r,c)] = 'hit'|'miss'  (i 가 상대 바다에 쏜 것)
        self.ready = [i in self.ai for i in range(2)]
        self.phase = "place"
        self.turn = rng.randrange(2)
        self.over = False
        self.winner = -1
        self.events: List[dict] = []
        self.ev = 0
        self.deadline = time.time() + PLACE_SEC
        self.ai_targets: List[List[Tuple[int, int]]] = [[], []]

    # ---------------- 도우미 ----------------
    def ship_at(self, owner: int, cell) -> Optional[int]:
        for k, s in enumerate(self.fleets[owner]):
            if tuple(cell) in s:
                return k
        return None

    def sunk(self, owner: int, k: int) -> bool:
        """owner 의 k 번째 배가 가라앉았나 (상대가 다 맞혔나)"""
        shots = self.shots[1 - owner]
        return all(shots.get(c) == "hit" for c in self.fleets[owner][k])

    def all_sunk(self, owner: int) -> bool:
        return all(self.sunk(owner, k) for k in range(len(SHIPS)))

    def actor(self) -> int:
        if self.over or self.phase != "fire":
            return -1
        return self.turn

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over else 0

    def _start_fire(self) -> None:
        self.phase = "fire"
        self._set_deadline()

    def step(self) -> Optional[float]:
        if self.phase == "place" and time.time() >= self.deadline:
            self.ready = [True, True]
            self._start_fire()
        return None

    # ---------------- 수 ----------------
    def act(self, i: int, a: dict) -> Optional[str]:
        k = a.get("k")
        if self.phase == "place":
            if self.ready[i]:
                return None
            if k == "shuffle":
                self.fleets[i] = random_fleet(self.rng)
                return None
            if k == "ready":
                self.ready[i] = True
                if all(self.ready):
                    self._start_fire()
                return None
            return None
        if k != "fire" or i != self.actor():
            return "지금은 쏠 수 없어요"
        try:
            r, c = int(a.get("r")), int(a.get("c"))
        except (TypeError, ValueError):
            return "칸을 골라요"
        if not (0 <= r < N and 0 <= c < N):
            return "칸을 골라요"
        if (r, c) in self.shots[i]:
            return "이미 쏜 칸이에요"
        foe = 1 - i
        k2 = self.ship_at(foe, (r, c))
        hit = k2 is not None
        self.shots[i][(r, c)] = "hit" if hit else "miss"
        sunk = hit and self.sunk(foe, k2)
        self.ev += 1
        self.events.append({"k": "fire", "id": self.ev, "s": i, "r": r, "c": c, "hit": hit, "sunk": SHIPS[k2][0] if sunk else None})
        self.events = self.events[-6:]
        if hit and self.all_sunk(foe):
            self.over = True
            self.winner = i
            self.deadline = 0
            return None
        if not (hit and self.again):
            self.turn = foe
        self._set_deadline()
        return None

    def timeout_action(self, i: int) -> dict:
        if self.phase == "place":
            return {"k": "ready"}
        return self._ai_fire(i, 1)

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        return self.rng.uniform(0.9, 1.6)

    def ai_action(self, i: int) -> dict:
        return self._ai_fire(i, self.level)

    def _ai_fire(self, i: int, lv: int) -> dict:
        shots = self.shots[i]
        foe = 1 - i
        free = [(r, c) for r in range(N) for c in range(N) if (r, c) not in shots]
        if lv <= 1:
            r, c = self.rng.choice(free)
            return {"k": "fire", "r": r, "c": c}
        # 맞혔지만 아직 안 가라앉은 칸들
        open_hits = [cell for cell, v in shots.items() if v == "hit" and not self.sunk(foe, self.ship_at(foe, cell))]
        if lv >= 4:
            return self._density(i, open_hits, free, lv)
        if open_hits:
            cand = []
            hs = set(open_hits)
            for (r, c) in open_hits:
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    cell = (r + dr, c + dc)
                    if 0 <= cell[0] < N and 0 <= cell[1] < N and cell not in shots:
                        # 같은 줄로 이어 맞힌 게 있으면 그 방향이 먼저
                        line = (r - dr, c - dc) in hs
                        cand.append((2 if line else 1, cell))
            if cand:
                best = max(x[0] for x in cand)
                r, c = self.rng.choice([x[1] for x in cand if x[0] == best])
                return {"k": "fire", "r": r, "c": c}
        pool = [x for x in free if (x[0] + x[1]) % 2 == 0] if lv >= 3 else free
        r, c = self.rng.choice(pool or free)
        return {"k": "fire", "r": r, "c": c}

    def _density(self, i: int, open_hits, free, lv: int) -> dict:
        """남은 배가 놓일 수 있는 모든 자리를 세어서 가장 그럴듯한 칸"""
        shots = self.shots[i]
        foe = 1 - i
        left = [ln for k, (_, ln) in enumerate(SHIPS) if not self.sunk(foe, k)]
        miss = {c for c, v in shots.items() if v == "miss"}
        sunk_cells = {c for k in range(len(SHIPS)) if self.sunk(foe, k) for c in self.fleets[foe][k]}
        hits = set(open_hits)
        score = {}
        for ln in left:
            for horiz in (True, False):
                for r in range(N if horiz else N - ln + 1):
                    for c in range(N - ln + 1 if horiz else N):
                        cells = [(r, c + k) if horiz else (r + k, c) for k in range(ln)]
                        if any(x in miss or x in sunk_cells for x in cells):
                            continue
                        nh = sum(1 for x in cells if x in hits)
                        if hits and nh == 0 and lv >= 5:
                            w = 0.2
                        else:
                            w = 1 + nh * 12
                        for x in cells:
                            if x not in shots:
                                score[x] = score.get(x, 0) + w
        if not score:
            r, c = self.rng.choice(free)
            return {"k": "fire", "r": r, "c": c}
        best = max(score.values())
        noise = 0.0 if lv >= 5 else 0.35
        pick = [x for x, s in score.items() if s >= best * (1 - noise)]
        r, c = self.rng.choice(pick)
        return {"k": "fire", "r": r, "c": c}

    # ---------------- 화면 ----------------
    def _sea(self, owner: int, show_ships: bool) -> dict:
        """owner 의 바다 (상대가 쏜 자국 + 가라앉은 배는 모두 보여요)"""
        shots = self.shots[1 - owner]
        out = {"shots": [[r, c, v == "hit"] for (r, c), v in shots.items()], "ships": []}
        for k, s in enumerate(self.fleets[owner]):
            if show_ships or self.sunk(owner, k):
                out["ships"].append({"cells": s, "sunk": self.sunk(owner, k), "name": SHIPS[k][0]})
        out["left"] = sum(1 for k in range(len(SHIPS)) if not self.sunk(owner, k))
        return out

    def view(self, seat: Optional[int]) -> dict:
        reveal = self.over
        v = {"phase": self.phase, "turn": self.turn, "toAct": self.actor(), "ready": self.ready[:], "me": seat, "over": self.over,
             "deadline": int(self.deadline * 1000) if self.deadline else 0, "events": self.events[-4:], "n": N,
             "seas": [self._sea(o, reveal or seat == o) for o in range(2)], "again": self.again}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        w = self.winner if self.winner >= 0 else 0
        return {"winner": w, "rank": [w, 1 - w], "hands": len(self.shots[w])}
