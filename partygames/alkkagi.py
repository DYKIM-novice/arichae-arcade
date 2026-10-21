"""알까기 — 2명 (사람끼리 또는 AI)

- 바둑판(100×100) 위에 흑돌·백돌을 놓고, 번갈아 내 돌 하나를 손가락으로 튕겨요
- 판 밖으로 나간 돌은 빠져요 (내 돌도!)
- 상대 돌을 떨어뜨리고 내 튕긴 돌이 판에 남으면 한 번 더
- 상대 돌을 모두 떨어뜨리면 승리
AI: 서버가 여러 방법으로 튕겨 보고(계산) 가장 좋은 걸 골라요. 단계가 낮을수록 손이 떨려요(방향·세기 오차)
"""
import math
import random
import time
from typing import List, Optional

from .phys import Disk, Table, simulate, clone, launch

R = 3.3
SPEED = 105.0
TURN_SEC = 30


class Alkkagi:
    TAKES_OPTS = True
    MAX_ACT = 200
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = 2
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        k = int((opts or {}).get("stones", 8))
        self.table = Table(100, 100, "fall", friction=42.0, rest=0.88)
        self.disks: List[Disk] = []
        did = 0
        for owner, y in ((0, 80), (1, 20)):
            xs = [12 + 76 * j / (k - 1) for j in range(k)] if k > 1 else [50]
            for x in xs:
                did += 1
                self.disks.append(Disk(did, owner, x, y + (rng.random() - 0.5) * 2, R))
        self.turn = 0
        self.over = False
        self.winner = -1
        self.anim: Optional[dict] = None
        self.shot_no = 0
        self.again = False
        self.deadline = 0.0
        self.shots = [0, 0]
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over else 0

    def actor(self) -> int:
        return -1 if self.over else self.turn

    def step(self) -> Optional[float]:
        return None

    def count(self, owner: int) -> int:
        return sum(1 for d in self.disks if d.alive and d.owner == owner)

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        if a.get("k") != "shot":
            return "돌을 튕겨요"
        try:
            did = int(a.get("id"))
            ang = float(a.get("a"))
            pw = float(a.get("p"))
        except (TypeError, ValueError):
            return "다시 튕겨요"
        d = next((x for x in self.disks if x.id == did and x.alive and x.owner == i), None)
        if not d or not math.isfinite(ang) or not math.isfinite(pw):
            return "내 돌을 골라요"
        self._shoot(i, d, ang, pw)
        return None

    def _shoot(self, i: int, d: Disk, ang: float, pw: float) -> None:
        launch(d, ang, pw, SPEED)
        res = simulate(self.table, self.disks)
        self.shot_no += 1
        self.shots[i] += 1
        foe = 1 - i
        fell_foe = [x for x in res["fell"] if next(dd for dd in self.disks if dd.id == x).owner == foe]
        self.anim = {"no": self.shot_no, "s": i, "id": d.id, "ids": res["ids"], "frames": res["frames"], "fps": res["fps"], "fell": res["fell"]}
        if self.count(foe) == 0 or self.count(i) == 0:
            self.over = True
            self.winner = i if self.count(foe) == 0 and self.count(i) > 0 else foe if self.count(i) == 0 and self.count(foe) > 0 else foe
            self.deadline = 0
            return
        self.again = bool(fell_foe) and d.alive
        if not self.again:
            self.turn = foe
        self._set_deadline()

    def timeout_action(self, i: int) -> dict:
        return self._ai(i, 1)

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        t = len(self.anim["frames"]) / self.anim["fps"] if self.anim else 0
        return t + self.rng.uniform(0.8, 1.4)

    def ai_action(self, i: int) -> dict:
        return self._ai(i, self.level)

    def _ai(self, i: int, lv: int) -> dict:
        mine = [d for d in self.disks if d.alive and d.owner == i]
        foes = [d for d in self.disks if d.alive and d.owner != i]
        # 후보: 내 돌 → 상대 돌 정면, 조금 비켜서
        cands = []
        for m in mine:
            for f in foes:
                base = math.atan2(f.y - m.y, f.x - m.x)
                dist = math.hypot(f.x - m.x, f.y - m.y)
                for off in ((0.0,) if lv <= 2 else (0.0, -0.06, 0.06, -0.13, 0.13)):
                    for pw in ((0.75,) if lv <= 2 else (0.55, 0.75, 0.95)):
                        cands.append((m, base + off, pw, dist))
        if not cands:
            m = mine[0]
            return {"k": "shot", "id": m.id, "a": -math.pi / 2, "p": 0.5}
        if lv <= 2:
            m, ang, pw, _ = min(cands, key=lambda c: c[3] + self.rng.random() * 25)
        else:
            self.rng.shuffle(cands)
            budget = {3: 18, 4: 45, 5: 90}.get(lv, 30)
            cands.sort(key=lambda c: c[3])
            cands = cands[:budget]
            best = None
            bv = -1e9
            for (m, ang, pw, _) in cands:
                ds = clone(self.disks)
                mm = next(x for x in ds if x.id == m.id)
                launch(mm, ang, pw, SPEED)
                res = simulate(self.table, ds, record=False)
                v = 0.0
                for x in ds:
                    if not x.alive:
                        v += 10 if x.owner != i else -12
                    else:
                        # 가장자리에 가까운 내 돌은 위험, 상대 돌은 좋아요
                        edge = min(x.x, x.y, 100 - x.x, 100 - x.y)
                        v += (-(max(0, 15 - edge)) * 0.15) if x.owner == i else (max(0, 15 - edge) * 0.1)
                if mm.alive:
                    v += 3
                v += self.rng.random() * 0.5
                if v > bv:
                    bv, best = v, (m, ang, pw)
            m, ang, pw = best
        # 손 떨림
        err = {1: 0.16, 2: 0.08, 3: 0.05, 4: 0.025, 5: 0.012}.get(lv, 0.05)
        ang += self.rng.gauss(0, err)
        pw = max(0.2, min(1.0, pw + self.rng.gauss(0, err)))
        return {"k": "shot", "id": m.id, "a": ang, "p": pw}

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {"stones": [[d.id, d.owner, round(d.x, 2), round(d.y, 2)] for d in self.disks if d.alive], "r": R,
             "turn": self.turn, "toAct": self.actor(), "me": seat, "over": self.over, "again": self.again,
             "count": [self.count(0), self.count(1)], "deadline": int(self.deadline * 1000) if self.deadline else 0,
             "anim": self.anim, "w": 100, "h": 100}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        w = self.winner if self.winner >= 0 else 0
        return {"winner": w, "rank": [w, 1 - w], "hands": self.shots[w]}
