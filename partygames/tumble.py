"""계단 주사위 (텀블린 다이스 방식) — 2~4명 (AI 친구 가능)

- 4층 계단판(폭 40 × 길이 100). 아래 출발선에서 내 주사위를 튕겨 위쪽으로 보내요
- 계단을 한 칸 내려갈(넘어갈) 때마다 주사위가 굴러서 눈이 바뀌어요
- 멈춘 층의 배수 × 주사위 눈 = 점수 · 멀수록 배수가 커요 (×1 ×2 ×3 ×4) · 끝에서 떨어지면 0
- 다른 주사위를 쳐서 떨어뜨려도 돼요!
- 한 판에 사람마다 주사위 4개를 번갈아 튕기고, 판이 끝나면 점수를 더해요 · 3판(설정)
"""
import math
import random
import time
from typing import List, Optional

from .phys import Disk, Table, simulate, clone, launch

W, H = 40.0, 100.0
R = 2.3
STEPS = [76.0, 52.0, 28.0]          # 계단 경계 (y). 위로 갈수록 멀어요
MULT = [(28.0, 4), (52.0, 3), (76.0, 2), (90.0, 1)]   # y < 경계 → 배수
FOUL = 90.0
START_Y = 96.0
SPEED = 95.0
PER = 4
TURN_SEC = 30


def mult_at(y: float) -> int:
    for lim, m in MULT:
        if y < lim:
            return m
    return 0


class Tumble:
    TAKES_OPTS = True
    MAX_ACT = 200
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.rounds = int((opts or {}).get("rounds", 3))
        self.table = Table(W, H, "fall", friction=34.0, rest=0.8)
        self.round = 0
        self.total = [0] * n_seats
        self.round_scores: List[List[int]] = []
        self.anim: Optional[dict] = None
        self.shot_no = 0
        self.over = False
        self.phase = "flick"
        self.pause_until = 0.0
        self.deadline = 0.0
        self.last_round: Optional[dict] = None
        self.first = rng.randrange(n_seats)
        self._new_round()

    def _new_round(self) -> None:
        self.round += 1
        self.disks: List[Disk] = []
        self.faces = {}
        self.left = [PER] * self.n
        self.next_id = 1
        self.turn = (self.first + self.round - 1) % self.n
        self.phase = "flick"
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + TURN_SEC if self.turn not in self.ai and not self.over and self.phase == "flick" else 0

    def actor(self) -> int:
        return self.turn if self.phase == "flick" and not self.over else -1

    def step(self) -> Optional[float]:
        if self.phase == "pause" and time.time() >= self.pause_until:
            if self.round >= self.rounds:
                self.over = True
                self.phase = "done"
                return None
            self._new_round()
        return None

    def scores(self, disks=None, faces=None) -> List[int]:
        disks = self.disks if disks is None else disks
        faces = self.faces if faces is None else faces
        sc = [0] * self.n
        for d in disks:
            if d.alive:
                sc[d.owner] += mult_at(d.y) * faces.get(d.id, 1)
        return sc

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        if a.get("k") != "flick":
            return "주사위를 튕겨요"
        try:
            ang, pw, x = float(a.get("a")), float(a.get("p")), float(a.get("x", W / 2))
        except (TypeError, ValueError):
            return "다시 튕겨요"
        if not all(map(math.isfinite, (ang, pw, x))):
            return "다시 튕겨요"
        x = max(R + 1, min(W - R - 1, x))
        self._flick(i, x, ang, pw)
        return None

    def _flick(self, i: int, x: float, ang: float, pw: float) -> None:
        d = Disk(self.next_id, i, x, START_Y, R)
        self.next_id += 1
        self.disks.append(d)
        self.faces[d.id] = self.rng.randint(1, 6)
        before = {dd.id: dd.y for dd in self.disks if dd.alive}
        launch(d, ang, pw, SPEED)
        res = simulate(self.table, self.disks)
        start_faces = {str(k): v for k, v in self.faces.items()}
        # 계단을 넘을 때마다 굴러서 눈이 바뀌어요 (프레임마다 확인)
        idx = {did: j for j, did in enumerate(res["ids"])}
        rolls = []                    # [프레임, id, 새 눈]
        for did, j in idx.items():
            prev_y = before.get(did, START_Y)
            for fi, fr in enumerate(res["frames"]):
                y = fr[2 * j + 1]
                if y == -9999:
                    break
                y /= 10
                for s in STEPS:
                    if (prev_y >= s > y) or (prev_y < s <= y):
                        nf = self.rng.randint(1, 6)
                        self.faces[did] = nf
                        rolls.append([fi, did, nf])
                prev_y = y
        # 출발선을 못 넘은 주사위는 빼요
        for dd in self.disks:
            if dd.alive and dd.y >= FOUL:
                dd.alive = False
        self.shot_no += 1
        self.anim = {"no": self.shot_no, "s": i, "id": d.id, "ids": res["ids"], "frames": res["frames"], "fps": res["fps"],
                     "rolls": rolls, "start": start_faces}
        self.left[i] -= 1
        if sum(self.left) == 0:
            sc = self.scores()
            for k in range(self.n):
                self.total[k] += sc[k]
            self.round_scores.append(sc)
            self.last_round = {"round": self.round, "score": sc}
            self.phase = "pause"
            self.pause_until = time.time() + 4.5 + res["t"] * 0.6
            self.deadline = 0
            return
        for k in range(1, self.n + 1):
            j = (self.turn + k) % self.n
            if self.left[j] > 0:
                self.turn = j
                break
        self._set_deadline()

    def timeout_action(self, i: int) -> dict:
        return self._ai(i, 1)

    def ai_delay(self, i: int) -> float:
        t = len(self.anim["frames"]) / self.anim["fps"] if self.anim else 0
        return t + self.rng.uniform(0.8, 1.4)

    def ai_action(self, i: int) -> dict:
        return self._ai(i, self.level)

    def _power_for(self, dist: float) -> float:
        return math.sqrt(2 * 34.0 * max(1.0, dist)) / SPEED

    def _ai(self, i: int, lv: int) -> dict:
        cands = []
        for ty in (12, 18, 24, 40, 64):
            for tx in (W * 0.3, W * 0.5, W * 0.7):
                x = W / 2
                ang = math.atan2(ty - START_Y, tx - x)
                cands.append((x, ang, self._power_for(math.hypot(tx - x, ty - START_Y))))
        for d in self.disks:
            if d.alive and d.owner != i and mult_at(d.y) >= 3:
                x = W / 2
                ang = math.atan2(d.y - START_Y, d.x - x)
                cands.append((x, ang, min(1.0, self._power_for(math.hypot(d.x - x, d.y - START_Y)) * 1.35)))
        if lv <= 2:
            x, ang, pw = self.rng.choice(cands[:6] if lv == 1 else cands[:9])
        else:
            best = None
            bv = -1e9
            budget = {3: 8, 4: 16, 5: 30}.get(lv, 10)
            self.rng.shuffle(cands)
            for (x, ang, pw) in cands[:budget]:
                v = 0.0
                for rep in range(2 if lv >= 4 else 1):
                    ds = clone(self.disks)
                    nd = Disk(999, i, x, START_Y, R)
                    ds.append(nd)
                    launch(nd, ang + self.rng.gauss(0, 0.01) * rep, pw * (1 + self.rng.gauss(0, 0.03) * rep), SPEED)
                    simulate(self.table, ds, record=False)
                    for dd in ds:
                        if dd.alive and dd.y >= FOUL:
                            dd.alive = False
                    faces = dict(self.faces)
                    faces[999] = 3.5
                    sc = self.scores(ds, faces)
                    v += sc[i] - max(sc[k] for k in range(self.n) if k != i) * 0.6
                if v > bv:
                    bv, best = v, (x, ang, pw)
            x, ang, pw = best
        err = {1: 0.06, 2: 0.035, 3: 0.02, 4: 0.012, 5: 0.007}.get(lv, 0.02)
        return {"k": "flick", "x": x, "a": ang + self.rng.gauss(0, err), "p": max(0.2, min(1.0, pw * (1 + self.rng.gauss(0, err * 1.8))))}

    def view(self, seat: Optional[int]) -> dict:
        v = {"dice": [[d.id, d.owner, round(d.x, 2), round(d.y, 2), self.faces.get(d.id, 1)] for d in self.disks if d.alive], "r": R,
             "turn": self.turn, "toAct": self.actor(), "me": seat, "over": self.over, "phase": self.phase, "left": self.left[:],
             "round": self.round, "rounds": self.rounds, "total": self.total[:], "now": self.scores(), "anim": self.anim,
             "lastRound": self.last_round, "deadline": int(self.deadline * 1000) if self.deadline else 0,
             "geo": {"w": W, "h": H, "steps": STEPS, "mult": MULT, "foul": FOUL, "startY": START_Y, "speed": SPEED, "fr": 34.0}}
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: -self.total[j])
        return {"winner": order[0], "rank": order, "score": self.total[:], "hands": 0}
