"""컬링 — 2~4명 (두 팀: 1·3번 자리 빨강, 2·4번 자리 파랑 · AI 친구 가능)

- 얼음판(폭 30 × 길이 100) 아래쪽에서 위쪽 표적(하우스)으로 스톤을 밀어요
- 한 엔드에 팀마다 4개씩 번갈아 (팀 안에서는 사람끼리 돌아가며)
- 휘기: 스톤을 돌려 던지면 끝에서 살짝 휘어요 (왼쪽 · 곧게 · 오른쪽)
- 판 밖이나 뒤로 나가면 빠지고, 너무 약해서 '호그 라인'(아래쪽 선)을 못 넘으면 빠져요
- 엔드가 끝나면: 표적 중심(버튼)에 가장 가까운 팀이, 상대 가장 가까운 스톤보다 가까운 스톤 수만큼 점수 (표적 안에 있는 것만)
- 엔드 3/2/4번 합계로 승부 · 점수를 못 낸 팀이 다음 엔드에서 마지막 스톤(유리)을 던져요
"""
import math
import random
import time
from typing import List, Optional

from .phys import Disk, Table, simulate, clone, launch

W, H = 30.0, 100.0
R = 1.45
BUTTON = (15.0, 18.0)
HOUSE = 9.0
HOG = 66.0
START = (15.0, 94.0)
SPEED = 46.0
FRICTION = 9.5
CURL = 2.6
PER_TEAM = 4
TURN_SEC = 35


class Curling:
    TAKES_OPTS = True
    MAX_ACT = 200
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.ends = int((opts or {}).get("ends", 3))
        self.table = Table(W, H, "fall", friction=FRICTION, rest=0.85, curl=CURL)
        self.end = 0
        self.score = [0, 0]
        self.end_scores: List[List[int]] = []
        self.hammer = 1                  # 마지막 스톤을 던지는 팀
        self.over = False
        self.anim: Optional[dict] = None
        self.shot_no = 0
        self.deadline = 0.0
        self.last_end: Optional[dict] = None
        self.pause_until = 0.0
        self.phase = "throw"
        self._new_end()

    def team_of(self, seat: int) -> int:
        return seat % 2

    def members(self, team: int) -> List[int]:
        return [s for s in range(self.n) if s % 2 == team]

    def _new_end(self) -> None:
        self.end += 1
        self.disks: List[Disk] = []
        self.thrown = [0, 0]
        self.next_id = 1
        self.cur_team = 1 - self.hammer
        self.phase = "throw"
        self._pick_thrower()

    def _pick_thrower(self) -> None:
        mem = self.members(self.cur_team)
        self.turn = mem[self.thrown[self.cur_team] % len(mem)]
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over and self.phase == "throw" else 0

    def actor(self) -> int:
        return self.turn if self.phase == "throw" and not self.over else -1

    def step(self) -> Optional[float]:
        if self.phase == "endpause" and time.time() >= self.pause_until:
            if self.end >= self.ends:
                self.over = True
                self.phase = "done"
                return None
            self._new_end()
        return None

    @staticmethod
    def dist_btn(d: Disk) -> float:
        return math.hypot(d.x - BUTTON[0], d.y - BUTTON[1])

    def end_result(self, disks=None):
        disks = self.disks if disks is None else disks
        ins = sorted([d for d in disks if d.alive and self.dist_btn(d) <= HOUSE + R], key=self.dist_btn)
        if not ins:
            return -1, 0
        t = ins[0].owner
        n = 0
        for d in ins:
            if d.owner != t:
                break
            n += 1
        return t, n

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        if a.get("k") != "throw":
            return "스톤을 밀어요"
        try:
            ang = float(a.get("a"))
            pw = float(a.get("p"))
            spin = int(a.get("s", 0))
        except (TypeError, ValueError):
            return "다시 밀어요"
        if not (math.isfinite(ang) and math.isfinite(pw)):
            return "다시 밀어요"
        spin = max(-1, min(1, spin))
        self._throw(i, ang, pw, spin)
        return None

    def _throw(self, i: int, ang: float, pw: float, spin: int) -> None:
        team = self.team_of(i)
        d = Disk(self.next_id, team, START[0], START[1], R)
        self.next_id += 1
        self.disks.append(d)
        launch(d, ang, pw, SPEED)
        res = simulate(self.table, self.disks, spin={d.id: spin} if spin else None)
        hogged = d.alive and d.y > HOG
        if hogged:
            d.alive = False
        self.shot_no += 1
        self.anim = {"no": self.shot_no, "s": i, "id": d.id, "ids": res["ids"], "frames": res["frames"], "fps": res["fps"],
                     "fell": res["fell"] + ([d.id] if hogged else []), "hog": hogged}
        self.thrown[team] += 1
        if sum(self.thrown) >= 2 * PER_TEAM:
            t, n = self.end_result()
            if t >= 0:
                self.score[t] += n
                self.hammer = 1 - t
            row = [0, 0]
            if t >= 0:
                row[t] = n
            self.end_scores.append(row)
            self.last_end = {"end": self.end, "team": t, "n": n}
            self.phase = "endpause"
            self.pause_until = time.time() + 4.5 + res["t"] * 0.6
            self.deadline = 0
            self.turn = -1
            return
        self.cur_team = 1 - self.cur_team
        if self.thrown[self.cur_team] >= PER_TEAM:
            self.cur_team = 1 - self.cur_team
        self._pick_thrower()

    def timeout_action(self, i: int) -> dict:
        return self._ai(i, 1)

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        t = len(self.anim["frames"]) / self.anim["fps"] if self.anim else 0
        return t + self.rng.uniform(0.9, 1.5)

    def ai_action(self, i: int) -> dict:
        return self._ai(i, self.level)

    def _power_for(self, dist: float) -> float:
        v0 = math.sqrt(2 * FRICTION * max(1.0, dist))
        return v0 / SPEED

    def _ai(self, i: int, lv: int) -> dict:
        team = self.team_of(i)
        targets = [(BUTTON[0], BUTTON[1], 0.0)]
        for d in self.disks:
            if d.alive and d.owner != team and self.dist_btn(d) <= HOUSE + 3:
                targets.append((d.x, d.y, 1.0))          # 쳐내기
        cands = []
        for (tx, ty, take) in targets:
            ang = math.atan2(ty - START[1], tx - START[0])
            dist = math.hypot(tx - START[0], ty - START[1])
            base = self._power_for(dist)
            pws = [base] if not take else [base * 1.25, base * 1.45]
            for pw in pws:
                for off in ((0.0,) if lv <= 2 else (0.0, -0.012, 0.012)):
                    cands.append((ang + off, min(1.0, pw), 0))
            if lv >= 3:
                for s in (-1, 1):
                    cands.append((ang - s * 0.028, min(1.0, base * (1.25 if take else 1.0)), s))
        if lv <= 2:
            ang, pw, s = cands[0] if len(cands) == 1 or self.rng.random() < 0.6 else self.rng.choice(cands)
        else:
            best = None
            bv = -1e9
            budget = {3: 8, 4: 20, 5: 40}.get(lv, 10)
            self.rng.shuffle(cands)
            for (ang, pw, s) in cands[:budget]:
                ds = clone(self.disks)
                d = Disk(999, team, START[0], START[1], R)
                ds.append(d)
                launch(d, ang, pw, SPEED)
                simulate(self.table, ds, record=False, spin={999: s} if s else None)
                if d.alive and d.y > HOG:
                    d.alive = False
                v = 0.0
                for x in ds:
                    if not x.alive:
                        continue
                    dd = self.dist_btn(x)
                    if dd <= HOUSE + R:
                        v += (10 - dd) * (1 if x.owner == team else -1.2)
                t, n = self.end_result(ds)
                v += (n * 6 if t == team else -n * 6 if t >= 0 else 0)
                if v > bv:
                    bv, best = v, (ang, pw, s)
            ang, pw, s = best
        err = {1: 0.03, 2: 0.016, 3: 0.009, 4: 0.005, 5: 0.0025}.get(lv, 0.01)
        ang += self.rng.gauss(0, err)
        pw = max(0.15, min(1.0, pw * (1 + self.rng.gauss(0, err * 2.2))))
        return {"k": "throw", "a": ang, "p": pw, "s": s}

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {"stones": [[d.id, d.owner, round(d.x, 2), round(d.y, 2)] for d in self.disks if d.alive], "r": R,
             "turn": self.turn, "toAct": self.actor(), "me": seat, "over": self.over, "phase": self.phase,
             "end": self.end, "ends": self.ends, "score": self.score[:], "endScores": self.end_scores,
             "thrown": self.thrown[:], "per": PER_TEAM, "team": self.cur_team, "hammer": self.hammer,
             "deadline": int(self.deadline * 1000) if self.deadline else 0, "anim": self.anim, "lastEnd": self.last_end,
             "geo": {"w": W, "h": H, "button": BUTTON, "house": HOUSE, "hog": HOG, "start": START, "speed": SPEED, "fr": FRICTION}}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        wt = 0 if self.score[0] > self.score[1] else 1 if self.score[1] > self.score[0] else (self.end_scores[-1][1] > 0 if self.end_scores else 0) * 1
        order = self.members(wt) + self.members(1 - wt)
        return {"winner": order[0], "rank": order, "score": self.score[:], "hands": 0}
