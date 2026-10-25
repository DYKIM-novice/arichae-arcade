"""쌩쌩카트 — 서버 쪽 (트랙 · AI 카트 · 아이템 · 순위 · 결과 상)

사람 카트는 각자 폰에서 계산하고(바로 반응), 20번/초 쯤 위치를 보내요 ("kin").
서버는 그 위치를 모아서 모두에게 다시 보내고(20번/초 "kst"), 아래 일을 맡아요.
  - AI 카트: 코스 가운데 줄을 따라 달려요 (단계 1~5, 2단계가 가족 평균보다 조금 약하게)
  - 아이템: 응원 풍선을 터뜨리면 1등과의 거리에 따라 아이템을 정해 줘요
  - 맞았나 판정: 꿀 웅덩이 · 가시공 (넉넉하게 판정) / 공룡 지진은 2초 전에 1등에게 알려줘요
  - 순위 · 결승 · 웃긴 상
트랙 모양은 static/js/kart/track.json 하나를 화면(core.js)과 같이 읽어서 같은 방법으로 펴요.
"""
import asyncio
import json
import math
import os
import random
import time
from pathlib import Path
from typing import Dict, List, Optional

BASE = Path(__file__).resolve().parent
TRACK_PATH = BASE / "static" / "js" / "kart" / "track.json"

MSG_TYPES = ("kin", "kpop", "kuse", "kres", "kfan", "kfin", "kready", "krematch")
AI_LEVELS = (1, 2, 3, 4, 5)
MAX_KARTS = 8
TICK = 0.05                 # 서버 한 칸 (초) — 20번/초
LOAD_WAIT_MS = 7000         # 모두 준비될 때까지 기다리는 최대 시간
COUNT_MS = 3600             # 출발 신호까지 (3·2·1)
AFTER_LEADER_MS = 35000     # 1등이 들어오고 이만큼 지나면 끝 (남은 사람은 예상 기록)
MAX_RACE_MS = 200000
# 시험용: 사람에게 줄 아이템 순서 고정 (예: ARICHAE_KART_ITEM=dino,spike)
FORCE_ITEMS = [x for x in os.environ.get("ARICHAE_KART_ITEM", "").split(",") if x in ("spike", "honey", "dino", "nut")]

# 카트 물리 값 (core.js 의 K.P 와 같아요)
VMAX = 24.0
TURN = 2.05
DRIFT_YAW = 2.65
BOOST1 = (0.65, 0.32)
BOOST2 = (1.15, 0.48)
DRAFT_BOOST = (0.8, 0.22)
DRAFT_FILL = 1.8
DRAFT_REST = 4.0
FAN_BOOST = (0.7, 0.25)
SPIN = 1.1
QUAKE_SPIN = 1.35
HONEY_T = 1.7
KART_R = 1.05

# 상태 표시 숫자 (core.js 의 K.F 와 같아요)
F_DL, F_DR, F_ST1, F_ST2, F_BOOST, F_SPIN, F_HONEY, F_HELPER, F_FIN, F_DRAFT, F_SC = 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024

ITEMS = ("spike", "honey", "dino", "nut")
ATH_IDS = ["dino", "bee", "hedgehog", "alpaca", "redpanda", "squirrel", "turtle", "unicorn", "octopus", "whale"]
ATH_NAME = dict(zip(ATH_IDS, ["뿌뿌", "붕붕", "도치", "파카", "레시", "토리", "엉금", "콘이", "문이", "퐁당"]))

# AI 단계: 속도 배율 · 드리프트 · 2단 불꽃 · 실수(한 바퀴에 벽) · 지름길 · 아이템 쓰는 시간 · 지진 피하기
AI_TABLE = {
    1: dict(vf=0.895, drift=0.15, st2=0.0, bumps=2.6, sc=0.0, use=3.5, dodge=0.10, line=0.45),
    2: dict(vf=0.925, drift=0.35, st2=0.15, bumps=1.8, sc=0.12, use=2.6, dodge=0.2, line=0.65),
    3: dict(vf=0.95, drift=0.55, st2=0.35, bumps=1.1, sc=0.3, use=1.8, dodge=0.32, line=0.8),
    4: dict(vf=0.97, drift=0.75, st2=0.55, bumps=0.6, sc=0.45, use=1.2, dodge=0.45, line=0.9),
    5: dict(vf=0.99, drift=0.9, st2=0.75, bumps=0.25, sc=0.6, use=0.8, dodge=0.6, line=1.0),
}


def now_ms() -> int:
    return int(time.time() * 1000)


def wrap_a(a: float) -> float:
    while a > math.pi:
        a -= 2 * math.pi
    while a < -math.pi:
        a += 2 * math.pi
    return a


def clamp(v, a, b):
    return a if v < a else b if v > b else v


# =====================================================================
#  트랙 펴기 — core.js 의 catmull / resample 과 같은 방법
# =====================================================================
def _catmull(pts, closed, sub):
    n = len(pts)
    out = []
    last = n if closed else n - 1
    for i in range(last):
        p0 = pts[(i - 1) % n] if closed else pts[max(i - 1, 0)]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if closed else pts[min(i + 2, n - 1)]
        for k in range(sub):
            t = k / sub
            t2 = t * t
            t3 = t2 * t
            out.append([0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                               + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)])
    if not closed:
        out.append([pts[-1][0], pts[-1][1]])
    return out


class Path2:
    """1m 간격으로 편 길 (점 · 방향 · 굽은 정도)"""

    def __init__(self, dense, closed, step=1.0):
        m = len(dense)
        segs = m if closed else m - 1
        cum = [0.0]
        for i in range(segs):
            a = dense[i]
            b = dense[(i + 1) % m]
            cum.append(cum[i] + math.hypot(b[0] - a[0], b[1] - a[1]))
        L = cum[segs]
        n = round(L / step) if closed else round(L / step) + 1
        ds = L / n if closed else L / (n - 1)
        px = [0.0] * n
        py = [0.0] * n
        j = 0
        for i in range(n):
            target = min(L, i * ds)
            while j < segs - 1 and cum[j + 1] < target:
                j += 1
            a = dense[j]
            b = dense[(j + 1) % m]
            sl = cum[j + 1] - cum[j]
            t = (target - cum[j]) / sl if sl > 0 else 0
            px[i] = a[0] + (b[0] - a[0]) * t
            py[i] = a[1] + (b[1] - a[1]) * t
        ang = [0.0] * n
        for i in range(n):
            ia = (i - 1) % n if closed else max(0, i - 1)
            ib = (i + 1) % n if closed else min(n - 1, i + 1)
            ang[i] = math.atan2(py[ib] - py[ia], px[ib] - px[ia])
        kap = [0.0] * n
        for i in range(n):
            ia = (i - 2) % n if closed else max(0, i - 2)
            ib = (i + 2) % n if closed else min(n - 1, i + 2)
            span = 4 * ds if closed else max(1, ib - ia) * ds
            kap[i] = wrap_a(ang[ib] - ang[ia]) / span
        ks = [0.0] * n
        for i in range(n):
            s = 0.0
            c = 0
            for k in range(-4, 5):
                q = (i + k) % n if closed else i + k
                if q < 0 or q >= n:
                    continue
                s += kap[q]
                c += 1
            ks[i] = s / c
        self.n, self.ds, self.L, self.px, self.py, self.ang, self.kap, self.closed = n, ds, L, px, py, ang, ks, closed

    def point(self, s: float, d: float = 0.0):
        if self.closed:
            s = s % self.L
            f = s / self.ds
        else:
            f = clamp(s, 0, self.L) / self.ds
        i = int(math.floor(f))
        t = f - i
        j = i + 1
        if self.closed:
            i %= self.n
            j %= self.n
        else:
            i = min(i, self.n - 1)
            j = min(j, self.n - 1)
        x = self.px[i] + (self.px[j] - self.px[i]) * t
        y = self.py[i] + (self.py[j] - self.py[i]) * t
        h = self.ang[i] + wrap_a(self.ang[j] - self.ang[i]) * t
        k = self.kap[i] + (self.kap[j] - self.kap[i]) * t
        return x - math.sin(h) * d, y + math.cos(h) * d, h, k

    def nearest_idx(self, x, y):
        best, bd = 0, 1e18
        for i in range(self.n):
            dx = self.px[i] - x
            dy = self.py[i] - y
            d = dx * dx + dy * dy
            if d < bd:
                bd, best = d, i
        return best


class Track:
    def __init__(self, d: dict):
        self.d = d
        self.hw = d["hw"]
        self.laps = d.get("laps", 2)
        self.main = Path2(_catmull(d["main"], True, 32), True)
        self.L = self.main.L
        sd = d["shortcut"]
        self.sc = Path2(_catmull(sd["pts"], False, 32), False)
        self.sc_hw = sd["hw"]
        self.sc_slow = sd.get("slow", 1)
        a = self.main.nearest_idx(self.sc.px[0], self.sc.py[0])
        b = self.main.nearest_idx(self.sc.px[-1], self.sc.py[-1])
        self.sa = a * self.main.ds
        self.sb = b * self.main.ds
        self.span = (self.sb - self.sa) % self.L
        self.pots = []
        for o in d.get("pots", []):
            if o.get("sc") is not None:
                x, y, _, _ = self.sc.point(o["sc"] * self.sc.L, o["d"])
                self.pots.append({"x": x, "y": y, "sc": True, "u": o["sc"] * self.sc.L, "d": o["d"]})
            else:
                x, y, _, _ = self.main.point(o["s"], o["d"])
                self.pots.append({"x": x, "y": y, "sc": False, "u": o["s"], "d": o["d"]})
        self.balloons = []
        for row in d.get("balloons", []):
            for dd in row["d"]:
                if row.get("sc") is not None:
                    x, y, _, _ = self.sc.point(row["sc"] * self.sc.L, dd)
                    self.balloons.append({"x": x, "y": y, "s": self.sa + row["sc"] * self.span})
                else:
                    x, y, _, _ = self.main.point(row["s"], dd)
                    self.balloons.append({"x": x, "y": y, "s": row["s"]})
        g = d.get("grid", {"back": 7, "gap": 6.2, "side": 2.7})
        self.grid = []
        for i in range(MAX_KARTS):
            s = -(g["back"] + (i // 2) * g["gap"] + (i % 2) * 2.2)
            dd = (1 if i % 2 else -1) * g["side"]
            self.grid.append((s, dd))
        self.corners = self._corners()

    def _corners(self):
        P = self.main
        th = 1 / 45
        start = 0
        for i in range(P.n):
            if abs(P.kap[i]) < th * 0.5:
                start = i
                break
        out = []
        i0 = -1
        for k in range(P.n + 1):
            i = (start + k) % P.n
            on = abs(P.kap[i]) >= th
            if on and i0 < 0:
                i0 = k
            if (not on or k == P.n) and i0 >= 0:
                a = (start + i0) % P.n
                ln = k - i0
                sm = sum(P.kap[(start + q) % P.n] for q in range(i0, k))
                if ln >= 8:
                    out.append({"s0": a * P.ds, "len": ln * P.ds, "dir": 1 if sm > 0 else -1, "kap": sm / ln})
                i0 = -1
        return sorted(out, key=lambda c: c["s0"])

    def corner_at(self, s: float):
        """s 가 코너 안이면 그 코너"""
        for c in self.corners:
            a = (s - c["s0"]) % self.L
            if a < c["len"]:
                return c, a
        return None, 0


TRACK = Track(json.loads(TRACK_PATH.read_text("utf-8")))


# =====================================================================
#  카트 · 아이템
# =====================================================================
class Kart:
    def __init__(self, idx: int, pid: str, name: str, ath: str, bot: bool, lv: int = 2):
        self.idx, self.pid, self.name, self.ath, self.bot, self.lv = idx, pid, name, ath, bot, lv
        s, d = TRACK.grid[idx]
        self.s = s % TRACK.L
        self.prog = s
        self.d = d
        x, y, h, _ = TRACK.main.point(s, d)
        self.x, self.y, self.h, self.v = x, y, h, 0.0
        self.px, self.py = x, y          # 지난번 위치 (지나가며 맞았나 볼 때)
        self.ts = 0                      # 이 위치의 시각 (서버 시각 ms)
        self.flags = F_HELPER if False else 0
        self.finished = False
        self.fin_t = 0.0                 # 결승 기록 (초)
        self.est = False                 # 예상 기록
        self.item: Optional[str] = None
        self.item_at = 0                 # 아이템 받은 시각 (룰렛 끝)
        self.connected = True
        self.ready = bot
        self.last_in = 0
        self.helper = False
        # AI 전용
        self.on_sc = False
        self.u = 0.0
        self.spin = 0.0
        self.slow = 0.0
        self.boost_t = 0.0
        self.boost_a = 0.0
        self.draft = 0.0
        self.draft_rest = 0.0
        self.wobble = 0.0
        self.plan = None                 # 지금 코너 드리프트 계획
        self.dch = 0.0
        self.use_at = 0
        self.off = 0.0                   # 자기만의 줄 (옆 거리)
        self.vis_drift = 0
        # 기록 (상 주기)
        self.st = {"honey": 0, "spikeHit": 0, "spikeLand": 0, "quakeDodge": 0, "quakeHit": 0, "nutHit": 0,
                   "cheer": 0, "fan": 0, "d1": 0, "d2": 0, "walls": 0, "drafts": 0, "ctr": 0, "worst": idx + 1,
                   "items": 0, "starts": 0, "pots": 0}

    def row(self, t0: int):
        return [self.idx, round(self.x, 2), round(self.y, 2), round(self.h, 3), round(self.v, 1), self.flags,
                round(self.prog, 1), self.ts - t0]


class KartRace:
    """한 판"""

    def __init__(self, room, seed: int, ai_n: int, ai_lv: int, now: int):
        self.id = seed
        self.rng = random.Random(seed)
        self.status = "load"
        self.created = now
        self.start_at = 0
        self.t0 = now                    # 보낼 시각의 기준 (작은 숫자로)
        self.laps = TRACK.laps
        self.ai_lv = ai_lv
        self.karts: List[Kart] = []
        self.by_pid: Dict[str, Kart] = {}
        humans = [p for p in sorted(room.players.values(), key=lambda p: p.order) if p.connected][:MAX_KARTS]
        used = set()
        order = list(range(MAX_KARTS))
        # 사람은 뒤쪽 출발 (AI 가 앞) — 처음부터 추월하는 재미
        n_ai = max(0, min(ai_n, MAX_KARTS - len(humans)))
        slots_h = order[n_ai:n_ai + len(humans)]
        self.rng.shuffle(slots_h)
        all_k = []
        for p, slot in zip(humans, slots_h):
            ath = p.athlete if p.athlete in ATH_IDS and p.athlete not in used else next(a for a in ATH_IDS if a not in used)
            used.add(ath)
            all_k.append(Kart(slot, p.pid, p.name, ath, False))
        free = [a for a in ATH_IDS if a not in used]
        self.rng.shuffle(free)
        for i in range(n_ai):
            ath = free[i % len(free)]
            k = Kart(i, f"ai{i + 1}", f"AI {ATH_NAME[ath]}", ath, True, ai_lv)
            k.off = self.rng.uniform(-1.6, 1.6)
            all_k.append(k)
        all_k.sort(key=lambda k: k.idx)
        # 번호를 0..n-1 로 다시 (자리 순서 그대로)
        self.karts = all_k
        for k in self.karts:
            self.by_pid[k.pid] = k
        self.items: List[dict] = []
        self.item_id = 0
        self.balloon_back = [0] * len(TRACK.balloons)   # 다시 생기는 시각 (0 = 있음)
        self.balloon_pop = [0] * len(TRACK.balloons)
        self.events: List[dict] = []
        self.quake: Optional[dict] = None
        self.quake_last = 0
        self.leader_fin_at = 0
        self.result: Optional[dict] = None
        self.fans: Dict[str, dict] = {}                 # 응원단 버튼 쉬는 시간
        self.last_tick = now
        self.no_items = False            # 시험용: 아이템 없이
        self.wait_all = False            # 시험용: 모두 들어올 때까지

    # ---------- 화면에 보낼 것 ----------
    def public(self) -> dict:
        return {
            "id": self.id, "status": self.status, "startAt": self.start_at, "laps": self.laps, "t0": self.t0,
            "lv": self.ai_lv, "track": TRACK.d.get("id"),
            "roster": [{"i": k.idx, "pid": k.pid, "name": k.name, "ath": k.ath, "bot": k.bot} for k in self.karts],
            "result": self.result,
        }

    def snapshot(self, now: int) -> dict:
        its = []
        for it in self.items:
            its.append([it["id"], it["k"], round(it["x"], 2), round(it["y"], 2), it.get("by", -1)])
        popped = [i for i, b in enumerate(self.balloon_back) if b > now]
        out = {"t": "kst", "T": now - self.t0, "k": [k.row(self.t0) for k in self.karts], "it": its, "bp": popped,
               "rk": [k.idx for k in self.ranking()]}
        if self.events:
            out["e"] = self.events
            self.events = []
        return out

    def ev(self, **kw):
        self.events.append(kw)

    # ---------- 순위 ----------
    def ranking(self) -> List[Kart]:
        return sorted(self.karts, key=lambda k: (0, k.fin_t) if k.finished else (1, -k.prog))

    def race_t(self, now: int) -> float:
        return (now - self.start_at) / 1000.0

    # ---------- 진행 ----------
    def tick(self, now: int) -> bool:
        """한 칸. 상태가 바뀌면 True (방 전체 상태를 다시 보내요)"""
        changed = False
        dt = min(0.12, max(0.0, (now - self.last_tick) / 1000.0))
        self.last_tick = now
        if self.status == "load":
            humans = [k for k in self.karts if not k.bot and k.connected]
            if all(k.ready for k in humans) or now - self.created > LOAD_WAIT_MS:
                self.status = "grid"
                self.start_at = now + COUNT_MS
                changed = True
            return changed
        if self.status == "grid":
            for k in self.karts:
                if k.bot:
                    k.ts = now
            if now >= self.start_at:
                self.status = "race"
                changed = True
            return changed
        if self.status != "race":
            return False
        t = self.race_t(now)
        for k in self.karts:
            if k.bot:
                self.step_ai(k, dt, t, now)
        self.step_items(dt, now)
        self.check_quake(now)
        # 순위 기록 (대역전상)
        if t > 8:
            for r, k in enumerate(self.ranking()):
                if not k.finished:
                    k.st["worst"] = max(k.st["worst"], r + 1)
        # 끝났나
        humans = [k for k in self.karts if not k.bot]
        live = [k for k in humans if k.connected or now - k.last_in < 10000]
        first_fin = [k for k in self.karts if k.finished]
        if first_fin and not self.leader_fin_at:
            self.leader_fin_at = now
        done_h = all(k.finished for k in live) if live else True
        if self.wait_all:
            if all(k.finished for k in self.karts) or t * 1000 > MAX_RACE_MS:
                self.finish_all(now)
                return True
            return changed
        if (done_h and (all(k.finished for k in self.karts) or now - self.leader_fin_at > 4000 and self.leader_fin_at)) \
                or (self.leader_fin_at and now - self.leader_fin_at > AFTER_LEADER_MS) or t * 1000 > MAX_RACE_MS:
            self.finish_all(now)
            changed = True
        return changed

    def finish_all(self, now: int) -> None:
        t = self.race_t(now)
        total = self.laps * TRACK.L
        for k in self.karts:
            if not k.finished:
                left = max(0.0, total - k.prog)
                k.fin_t = t + left / (VMAX * 0.9)
                k.finished = True
                k.est = True
        self.status = "done"
        self.result = self.make_result()

    # ---------- AI ----------
    def step_ai(self, k: Kart, dt: float, t: float, now: int) -> None:
        if k.finished:
            k.v += (VMAX * 0.5 - k.v) * 2 * dt
            self._advance(k, k.v * dt, dt)
            k.ts = now
            return
        A = AI_TABLE.get(k.lv, AI_TABLE[2])
        rng = self.rng
        for name in ("spin", "slow", "boost_t", "wobble"):
            v = getattr(k, name)
            if v > 0:
                setattr(k, name, max(0.0, v - dt))
        if k.boost_t <= 0:
            k.boost_a = 0
        s_here = k.s
        # 코너: 드리프트 계획
        c, into = TRACK.corner_at(s_here) if not k.on_sc else (None, 0)
        drifting = False
        if c is not None:
            if k.plan is None or k.plan["c"] is not c:
                go = c["len"] > 22 and abs(c["kap"]) > 1 / 40 and rng.random() < A["drift"]
                k.plan = {"c": c, "go": go, "st2": rng.random() < A["st2"]}
                k.dch = 0.0
            if k.plan["go"] and k.spin <= 0 and k.slow <= 0:
                drifting = True
                k.dch += dt
        elif k.plan is not None:
            # 코너 끝: 드리프트 부스터
            if k.plan["go"] and k.dch >= 0.5:
                if k.dch >= 1.1 and k.plan["st2"]:
                    self._boost(k, *BOOST2)
                    k.st["d2"] += 1
                else:
                    self._boost(k, *BOOST1)
                    k.st["d1"] += 1
            k.plan = None
            k.dch = 0.0
        k.vis_drift = (c["dir"] if drifting and c else 0)
        # 목표 속도
        target = VMAX * A["vf"]
        if k.boost_t > 0:
            target *= 1 + k.boost_a
        if drifting:
            target *= 0.975
        if k.slow > 0:
            target *= 0.5
        if k.wobble > 0:
            target *= 0.85
        if k.on_sc:
            target *= TRACK.sc_slow
        if k.spin > 0:
            target = VMAX * 0.28
        # 급한 곳은 조금 늦춰요
        if not k.on_sc:
            _, _, _, kk = TRACK.main.point(s_here + 6, 0)
            if abs(kk) > 1e-4:
                cap = (DRIFT_YAW if drifting else TURN) / abs(kk) * 0.98
                target = min(target, cap * (1 + k.boost_a))
        if k.v < target:
            k.v = min(target, k.v + max(2.0, 30 * (1 - k.v / target)) * dt)
        else:
            k.v += (target - k.v) * (4 if k.spin > 0 else 2.2) * dt
        # 실수 (벽에 살짝)
        lap_t = TRACK.L / (VMAX * A["vf"])
        if k.spin <= 0 and rng.random() < A["bumps"] / lap_t * dt:
            k.v = max(7.0, k.v * 0.7)
            k.st["walls"] += 1
        # 옆 거리 (안쪽 줄 · 화분 피하기 · 풍선)
        if k.on_sc:
            want = 0.0
            for p in TRACK.pots:
                if p["sc"] and -2 < p["u"] - k.u < 14 and abs(p["d"] - want) < 2.5:
                    want = p["d"] - math.copysign(2.6, p["d"])
            want = clamp(want, -TRACK.sc_hw + 1.2, TRACK.sc_hw - 1.2)
        else:
            _, _, _, ka = TRACK.main.point(s_here + 8, 0)
            want = clamp(ka * 135, -4.3, 4.3) * A["line"] + k.off
            for p in TRACK.pots:
                if not p["sc"]:
                    ah = (p["u"] - s_here) % TRACK.L
                    if ah < 16 and abs(p["d"] - want) < 2.5:
                        want = p["d"] - math.copysign(2.6, p["d"]) if abs(p["d"]) > 2 else p["d"] + (2.6 if want >= p["d"] else -2.6)
            want = clamp(want, -TRACK.hw + 1.3, TRACK.hw - 1.3)
        k.d += clamp(want - k.d, -3.2 * dt, 3.2 * dt)
        # 지름길?
        if not k.on_sc:
            ahead = (TRACK.sa - s_here) % TRACK.L
            if ahead < k.v * dt + 0.01 and rng.random() < A["sc"]:
                k.on_sc = True
                k.u = 0.0
                k.d = clamp(k.d, -2, 2)
        # 앞으로
        self._advance(k, k.v * dt, dt)
        # 바람타기
        self._draft(k, dt)
        # 풍선
        self._ai_balloons(k, now)
        # 아이템 쓰기
        if k.item and now >= k.item_at and now >= k.use_at:
            self.use_item(k, now)
        k.flags = (F_DL if k.vis_drift < 0 else F_DR if k.vis_drift > 0 else 0) \
            | (F_ST1 if drifting and k.dch >= 0.5 else 0) | (F_ST2 if drifting and k.dch >= 1.1 and k.plan and k.plan["st2"] else 0) \
            | (F_BOOST if k.boost_t > 0 else 0) | (F_SPIN if k.spin > 0 else 0) | (F_HONEY if k.slow > 0 else 0) \
            | (F_FIN if k.finished else 0) | (F_DRAFT if k.draft > 0.05 else 0) | (F_SC if k.on_sc else 0)
        k.ts = now
        # 결승
        if k.prog >= self.laps * TRACK.L and not k.finished:
            k.finished = True
            k.fin_t = t
            self.ev(k="fin", v=k.idx, t=round(t, 2))

    def _advance(self, k: Kart, dist: float, dt: float) -> None:
        if k.on_sc:
            k.u += dist
            ds = dist * TRACK.span / TRACK.sc.L
            if k.u >= TRACK.sc.L:
                k.on_sc = False
                k.s = TRACK.sb
                over = k.u - TRACK.sc.L
                k.s = (TRACK.sb + over) % TRACK.L
            x, y, h, _ = TRACK.sc.point(min(k.u, TRACK.sc.L), k.d) if k.on_sc else TRACK.main.point(k.s, k.d)
            if k.on_sc:
                k.s = (TRACK.sa + k.u / TRACK.sc.L * TRACK.span) % TRACK.L
        else:
            _, _, _, kk = TRACK.main.point(k.s, 0)
            ds = dist / max(0.6, 1 - kk * k.d)
            k.s = (k.s + ds) % TRACK.L
            x, y, h, _ = TRACK.main.point(k.s, k.d)
        if not k.finished:
            k.prog += ds
        if dist > 1e-6:
            k.h = math.atan2(y - k.y, x - k.x) if math.hypot(x - k.x, y - k.y) > 0.05 else h
        else:
            k.h = h
        k.px, k.py = k.x, k.y
        k.x, k.y = x, y

    def _boost(self, k: Kart, t: float, a: float) -> None:
        k.boost_a = max(k.boost_a, a) if k.boost_t > 0 else a
        k.boost_t = max(k.boost_t, t)
        k.v += a * VMAX * 0.3

    def _draft(self, k: Kart, dt: float) -> None:
        on = False
        if k.draft_rest > 0:
            k.draft_rest -= dt
        elif k.spin <= 0 and k.v > 12:
            ch, sh = math.cos(k.h), math.sin(k.h)
            for o in self.karts:
                if o is k:
                    continue
                dx, dy = o.x - k.x, o.y - k.y
                along = dx * ch + dy * sh
                lat = -dx * sh + dy * ch
                if 1.5 < along < 11 and abs(lat) < 2.6:
                    on = True
                    break
        if on:
            k.draft += dt / DRAFT_FILL
            if k.draft >= 1:
                k.draft = 0
                k.draft_rest = DRAFT_REST
                self._boost(k, *DRAFT_BOOST)
                k.st["drafts"] += 1
        else:
            k.draft = max(0.0, k.draft - dt * 0.55)

    def _ai_balloons(self, k: Kart, now: int) -> None:
        if k.item or k.finished or self.no_items:
            return
        for i, b in enumerate(TRACK.balloons):
            if self.balloon_back[i] > now:
                continue
            if (b["x"] - k.x) ** 2 + (b["y"] - k.y) ** 2 < 2.3 ** 2:
                self.pop_balloon(k, i, now)
                return

    # ---------- 풍선 · 아이템 ----------
    def pop_balloon(self, k: Kart, i: int, now: int) -> Optional[str]:
        if k.item or k.finished:
            return None
        if self.balloon_back[i] > now and now - self.balloon_pop[i] > 350:
            return None
        if self.balloon_back[i] <= now:
            self.balloon_pop[i] = now
            self.balloon_back[i] = now + 2200
        it = self.pick_item(k, now)
        k.item = it
        k.item_at = now + 700
        k.st["items"] += 1
        if k.bot:
            A = AI_TABLE.get(k.lv, AI_TABLE[2])
            k.use_at = k.item_at + int(1000 * A["use"] * self.rng.uniform(0.4, 1.3))
        self.ev(k="pop", v=k.idx, b=i)
        return it

    def pick_item(self, k: Kart, now: int) -> str:
        if FORCE_ITEMS and not k.bot:
            k.forced = getattr(k, "forced", -1) + 1
            return FORCE_ITEMS[k.forced % len(FORCE_ITEMS)]
        rk = self.ranking()
        racing = [x for x in rk if not x.finished]
        rank = rk.index(k) + 1
        lead = racing[0] if racing else k
        gap = max(0.0, lead.prog - k.prog)
        if rank == 1 or lead is k:
            odds = {"honey": 55, "spike": 30, "nut": 15}
        elif gap < 25:
            odds = {"honey": 35, "spike": 45, "nut": 20}
        elif gap < 80:
            odds = {"spike": 45, "nut": 25, "honey": 15, "dino": 15}
        elif gap < 160:
            odds = {"spike": 35, "nut": 25, "dino": 30, "honey": 10}
        else:
            odds = {"dino": 40, "nut": 30, "spike": 30}
        # 지진은 한 번에 하나 · 12초에 한 번 · 처음 8초는 없어요
        if "dino" in odds and (self.quake or now - self.quake_last < 12000 or self.race_t(now) < 8 or lead is k):
            odds.pop("dino")
        tot = sum(odds.values())
        r = self.rng.uniform(0, tot)
        for name, w in odds.items():
            r -= w
            if r <= 0:
                return name
        return list(odds)[-1]

    def use_item(self, k: Kart, now: int) -> bool:
        it = k.item
        if not it or now < k.item_at:
            return False
        k.item = None
        rk = [x for x in self.ranking() if not x.finished]
        if it == "honey":
            ch, sh = math.cos(k.h), math.sin(k.h)
            self.item_id += 1
            self.items.append({"id": self.item_id, "k": "honey", "x": k.x - ch * 3.6, "y": k.y - sh * 3.6, "by": k.idx,
                               "until": now + 22000, "safe": now + 1500, "hits": 2})
        elif it == "spike":
            back = bool(rk) and rk[0] is k
            self.item_id += 1
            if k.on_sc and not k.bot:
                # 사람이 지름길에 있으면 본길로 이어 굴러가요
                pass
            self.items.append({"id": self.item_id, "k": "spike", "x": k.x, "y": k.y, "by": k.idx, "s": k.s,
                               "d": clamp(k.d, -TRACK.hw + 1, TRACK.hw - 1), "dir": -1 if back else 1,
                               "v": 20.0 if back else 34.0, "until": now + 7000, "safe": now + 600, "prog": k.prog})
        elif it == "dino":
            if rk and rk[0] is not k and not self.quake:
                tgt = rk[0]
                self.quake = {"v": tgt.idx, "at": now + 2000, "by": k.idx}
                self.quake_last = now
                self.ev(k="quake", v=tgt.idx, by=k.idx, at=now + 2000 - self.t0)
            else:
                # 1등이 없어졌으면 꿀로
                k.item = None
        elif it == "nut":
            allk = self.ranking()
            r = allk.index(k)
            tgt = None
            # 바로 앞 사람 (내가 1등이면 바로 뒤)
            for x in (allk[r - 1:r] if r > 0 else []) + allk[r + 1:r + 2]:
                if not x.finished:
                    tgt = x
                    break
            if tgt:
                self.hit(tgt, "nut", k, now)
        self.ev(k="use", v=k.idx, it=it)
        return True

    def hit(self, v: Kart, kind: str, by: Optional[Kart], now: int) -> None:
        if v.finished:
            return
        if kind == "spike":
            v.st["spikeHit"] += 1
            if by:
                by.st["spikeLand"] += 1
        elif kind == "honey":
            v.st["honey"] += 1
        elif kind == "nut":
            v.st["nutHit"] += 1
        elif kind == "quake":
            v.st["quakeHit"] += 1
        if v.bot:
            if kind == "spike":
                v.spin = SPIN
                v.boost_t = 0
            elif kind == "quake":
                v.spin = QUAKE_SPIN
                v.boost_t = 0
            elif kind == "honey":
                v.slow = HONEY_T
            elif kind == "nut":
                v.wobble = 2.5
            v.plan = None
        self.ev(k="hit", v=v.idx, w=kind, by=by.idx if by else -1)

    def step_items(self, dt: float, now: int) -> None:
        keep = []
        for it in self.items:
            if now > it["until"]:
                continue
            if it["k"] == "spike":
                # 앞(뒤) 카트를 향해 굴러가요 — 가까우면 옆으로 따라가요
                it["s"] = (it["s"] + it["dir"] * it["v"] * dt) % TRACK.L
                it["prog"] += it["dir"] * it["v"] * dt
                best = None
                bd = 45.0
                for k in self.karts:
                    if k.idx == it["by"] or k.finished:
                        continue
                    gap = (k.prog - it["prog"]) * it["dir"]
                    if -3 < gap < bd:
                        bd, best = gap, k
                if best is not None and not best.on_sc:
                    it["d"] += clamp(best.d - it["d"], -9 * dt, 9 * dt)
                it["x"], it["y"], _, _ = TRACK.main.point(it["s"], it["d"])
                hitk = None
                for k in self.karts:
                    if k.finished or (k.idx == it["by"] and now < it["safe"]):
                        continue
                    if (k.x - it["x"]) ** 2 + (k.y - it["y"]) ** 2 < 3.0 ** 2:
                        hitk = k
                        break
                if hitk:
                    self.hit(hitk, "spike", self.karts[it["by"]], now)
                    self.ev(k="boom", x=round(it["x"], 1), y=round(it["y"], 1), w="spike")
                    continue
            elif it["k"] == "honey":
                for k in self.karts:
                    if not k.bot or k.finished or (k.idx == it["by"] and now < it["safe"]):
                        continue
                    if (k.x - it["x"]) ** 2 + (k.y - it["y"]) ** 2 < 3.4 ** 2 and k.slow <= 0:
                        self.hit(k, "honey", self.karts[it["by"]] if it["by"] >= 0 else None, now)
                        it["hits"] -= 1
                if it["hits"] <= 0:
                    continue
            keep.append(it)
        self.items = keep

    def check_human_hits(self, k: Kart, now: int) -> None:
        """사람 카트: 지난 위치 → 새 위치 사이를 지나며 맞았나 (넉넉하게)"""
        keep = []
        for it in self.items:
            if (k.idx == it["by"] and now < it["safe"]) or k.finished:
                keep.append(it)
                continue
            r = 3.0 if it["k"] == "spike" else 3.4
            if _seg_dist2(k.px, k.py, k.x, k.y, it["x"], it["y"]) < r * r:
                if it["k"] == "spike":
                    self.hit(k, "spike", self.karts[it["by"]], now)
                    self.ev(k="boom", x=round(it["x"], 1), y=round(it["y"], 1), w="spike")
                    continue
                if it["k"] == "honey" and now > getattr(k, "honey_until", 0):
                    k.honey_until = now + 2200
                    self.hit(k, "honey", self.karts[it["by"]] if it["by"] >= 0 else None, now)
                    it["hits"] -= 1
                    if it["hits"] <= 0:
                        continue
            keep.append(it)
        self.items = keep

    def check_quake(self, now: int) -> None:
        q = self.quake
        if not q or now < q["at"]:
            return
        self.quake = None
        v = self.karts[q["v"]]
        if v.finished:
            return
        if v.bot:
            A = AI_TABLE.get(v.lv, AI_TABLE[2])
            if self.rng.random() < A["dodge"] or v.boost_t > 0:
                v.st["quakeDodge"] += 1
                self.ev(k="dodge", v=v.idx)
            else:
                self.hit(v, "quake", self.karts[q["by"]], now)
        # 사람은 자기 폰이 정확히 그 순간에 판정해서 "kres" 로 알려줘요 (부스터 중이면 피함)
        self.ev(k="stomp", v=v.idx)

    # ---------- 결과 · 웃긴 상 ----------
    def make_result(self) -> dict:
        rk = self.ranking()
        rows = []
        lead_t = rk[0].fin_t if rk else 0
        for r, k in enumerate(rk):
            rows.append({"i": k.idx, "pid": k.pid, "rank": r + 1, "t": round(k.fin_t, 2), "gap": round(k.fin_t - lead_t, 2),
                         "est": k.est, "bot": k.bot, "ath": k.ath, "name": k.name, "helper": k.helper})
        humans = [k for k in rk if not k.bot]
        awards: Dict[str, list] = {k.pid: [] for k in humans}

        def give(key, title, icon, desc, min_v=1, low=False):
            cands = [k for k in humans if k.st.get(key, 0) >= min_v]
            if not cands:
                return
            best = (min if low else max)(k.st.get(key, 0) for k in cands)
            for k in cands:
                if k.st.get(key, 0) == best and len(awards[k.pid]) < 2:
                    awards[k.pid].append({"t": title, "ic": icon, "d": desc.format(n=k.st.get(key, 0))})

        give("honey", "오늘의 꿀범벅상", "🍯", "꿀 웅덩이에 {n}번 퐁당!")
        give("quakeDodge", "쿵쿵 피하기 달인상", "🦖", "공룡 지진을 부스터로 쓩 피했어요")
        give("spikeLand", "가시공 명사수상", "🦔", "가시공으로 {n}번 맞혔어요")
        give("d2", "드리프트 장인상", "🔥", "삼색 불꽃 부스터 {n}번!", 2)
        give("quakeHit", "쿵쿵 1등 체험상", "💥", "1등이라서 지진을 맞았어요 (그래도 멋져요)")
        give("drafts", "바람타기 선수상", "🌪️", "앞 카트 뒤에 붙어서 슝 {n}번", 2)
        for k in humans:
            rank_now = rk.index(k) + 1
            k.st["comeback"] = max(0, k.st.get("worst", rank_now) - rank_now)
        give("comeback", "대역전상", "🚀", "꼴찌 쪽에서 {n}계단 올라왔어요", 3)
        give("nutHit", "뒤죽박죽 혼란상", "🐿️", "버튼이 {n}번 뒤죽박죽", 1)
        give("cheer", "응원단장상", "📣", "먼저 들어와서 응원 {n}번!", 3)
        give("walls", "울타리랑 친해요상", "🌳", "울타리에 {n}번 콩", 8)
        give("ctr", "착붙 부스터상", "✨", "드리프트 뒤 반대쪽 톡! {n}번", 2)
        give("starts", "번개 출발상", "🏁", "출발 부스터 성공!", 1)
        for k in humans:
            if not awards[k.pid]:
                awards[k.pid].append({"t": "끝까지 완주상", "ic": "🎈", "d": "두 바퀴를 끝까지 달렸어요"})
        return {"rows": rows, "awards": awards, "at": now_ms()}


def _seg_dist2(ax, ay, bx, by, px, py) -> float:
    ex, ey = bx - ax, by - ay
    l2 = ex * ex + ey * ey
    if l2 < 1e-9:
        return (px - ax) ** 2 + (py - ay) ** 2
    u = clamp(((px - ax) * ex + (py - ay) * ey) / l2, 0, 1)
    qx, qy = ax + ex * u, ay + ey * u
    return (px - qx) ** 2 + (py - qy) ** 2


# =====================================================================
#  방 (server.py 와 이어지는 곳)
# =====================================================================
TASKS: Dict[str, asyncio.Task] = {}      # 방 코드 → 진행 작업 (저장할 때 빠지게 여기에 따로)


def default_settings() -> dict:
    return {"ai": 7, "lv": 2, "wins": {}}


def apply_settings(room, msg: dict) -> bool:
    """대기실 설정 (방장) — 바뀌었으면 True"""
    ch = False
    if "kai" in msg:
        try:
            room.kart["ai"] = max(0, min(MAX_KARTS - 1, int(msg["kai"])))
            ch = True
        except (TypeError, ValueError):
            pass
    if msg.get("klv") in AI_LEVELS:
        room.kart["lv"] = msg["klv"]
        ch = True
    return ch


def public(room) -> Optional[dict]:
    s = getattr(room, "ksess", None)
    return s.public() if s else None


def start(room) -> None:
    """방장이 시작 (또는 한 판 더)"""
    now = now_ms()
    k = room.kart
    sess = KartRace(room, random.randint(1, 2_000_000_000), int(k.get("ai", 7)), int(k.get("lv", 2)), now)
    room.ksess = sess
    room.phase = "kart"
    for p in room.players.values():
        p.ready = False
    old = TASKS.pop(room.code, None)
    if old and not old.done():
        old.cancel()
    TASKS[room.code] = asyncio.ensure_future(_run(room, sess))


async def _run(room, sess: KartRace) -> None:
    try:
        last_state = 0
        while room.phase == "kart" and room.ksess is sess:
            now = now_ms()
            changed = sess.tick(now)
            if changed:
                if sess.status == "done":
                    win = sess.result["rows"][0] if sess.result and sess.result["rows"] else None
                    if win and not win["bot"]:
                        w = room.kart.setdefault("wins", {})
                        w[win["pid"]] = w.get(win["pid"], 0) + 1
                await room.broadcast_state()
                last_state = now
            if sess.status in ("grid", "race"):
                await room.broadcast(sess.snapshot(now))
            elif sess.events:
                await room.broadcast(sess.snapshot(now))
            if sess.status == "done" and now - last_state > 15000:
                last_state = now
            await asyncio.sleep(TICK if sess.status in ("grid", "race") else 0.25)
    except asyncio.CancelledError:
        pass
    except Exception:
        import logging
        logging.getLogger("arichae").exception("카트 진행 오류")


async def handle(room, player, msg: dict, reply, is_host: bool) -> None:
    sess: Optional[KartRace] = getattr(room, "ksess", None)
    t = msg.get("t")
    if t == "krematch":
        if is_host and sess and sess.status == "done":
            start(room)
            await room.broadcast_state()
        return
    if not sess:
        return
    now = now_ms()
    k = sess.by_pid.get(player.pid)
    if t == "kready":
        if k:
            k.ready = True
            k.helper = bool(msg.get("helper"))
        return
    if t == "kfan":
        await _fan(sess, player, msg, now, reply)
        return
    if not k or sess.status not in ("grid", "race"):
        return
    if t == "kin":
        try:
            x, y, h, v = float(msg["x"]), float(msg["y"]), float(msg["h"]), float(msg["v"])
            prog = float(msg.get("p", k.prog))
            flags = int(msg.get("f", 0))
            ts = int(msg.get("T", now - sess.t0)) + sess.t0
        except (KeyError, TypeError, ValueError):
            return
        if not all(math.isfinite(q) for q in (x, y, h, v, prog)):
            return
        k.px, k.py = k.x, k.y
        k.x, k.y, k.h, k.v, k.prog, k.flags = x, y, h, v, prog, flags
        k.ts = min(now, ts)
        k.last_in = now
        k.connected = True
        k.helper = bool(flags & F_HELPER)
        if sess.status == "race":
            sess.check_human_hits(k, now)
        if sess.events:
            await room.broadcast(sess.snapshot(now))
    elif t == "kfin" and sess.status == "race" and not k.finished:
        try:
            ft = float(msg.get("ft"))
        except (TypeError, ValueError):
            ft = sess.race_t(now)
        k.finished = True
        k.fin_t = clamp(ft, 1.0, sess.race_t(now) + 1.0)
        k.prog = max(k.prog, sess.laps * TRACK.L)
        st = msg.get("st") if isinstance(msg.get("st"), dict) else {}
        for key in ("walls", "d1", "d2", "drafts", "ctr", "starts", "pots"):
            try:
                k.st[key] = max(0, min(999, int(st.get(key, 0))))
            except (TypeError, ValueError):
                pass
        sess.ev(k="fin", v=k.idx, t=round(k.fin_t, 2))
        await room.broadcast(sess.snapshot(now))
    elif t == "kpop" and sess.status == "race":
        try:
            i = int(msg.get("b"))
        except (TypeError, ValueError):
            return
        if not (0 <= i < len(TRACK.balloons)):
            return
        b = TRACK.balloons[i]
        if (b["x"] - k.x) ** 2 + (b["y"] - k.y) ** 2 > 14 ** 2:
            await reply({"t": "kgive", "it": None, "b": i})
            return
        it = sess.pop_balloon(k, i, now)
        await reply({"t": "kgive", "it": it, "b": i, "at": k.item_at - sess.t0 if it else 0})
    elif t == "kuse" and sess.status == "race":
        if sess.use_item(k, now):
            await room.broadcast(sess.snapshot(now))
    elif t == "kres":
        # 지진 결과 (맞은 사람 폰이 판정): dodged = 부스터로 피함
        if msg.get("dodged"):
            k.st["quakeDodge"] += 1
            sess.ev(k="dodge", v=k.idx)
        else:
            by = sess.karts[int(msg.get("by", -1))] if str(msg.get("by", "")).lstrip("-").isdigit() and 0 <= int(msg.get("by")) < len(sess.karts) else None
            k.st["quakeHit"] += 1
            sess.ev(k="hit", v=k.idx, w="quake", by=by.idx if by else -1, own=1)
        await room.broadcast(sess.snapshot(now))


async def _fan(sess: KartRace, player, msg: dict, now: int, reply) -> None:
    """응원단 (먼저 들어온 사람 · 구경하는 사람)"""
    me = sess.by_pid.get(player.pid)
    if me and not me.finished:
        return
    if sess.status != "race":
        return
    a = msg.get("a")
    try:
        to = int(msg.get("to", -1))
    except (TypeError, ValueError):
        return
    if not (0 <= to < len(sess.karts)):
        return
    tgt = sess.karts[to]
    if tgt.finished:
        return
    cd = sess.fans.setdefault(player.pid, {})
    wait = {"boost": 5000, "honey": 6000, "cheer": 900}.get(a)
    if wait is None or now < cd.get(a, 0):
        await reply({"t": "kfanwait", "a": a, "at": cd.get(a, 0) - sess.t0})
        return
    cd[a] = now + wait
    if me:
        me.st["cheer"] += 1
    who = player.name
    if a == "boost":
        if tgt.bot:
            sess._boost(tgt, *FAN_BOOST)
        sess.ev(k="fan", v=to, by=player.pid, n=who)
    elif a == "honey":
        # 고른 선수 앞 40~55m 에 꿀 웅덩이
        s = (tgt.s + sess.rng.uniform(40, 55)) % TRACK.L
        d = sess.rng.uniform(-4, 4)
        x, y, _, _ = TRACK.main.point(s, d)
        sess.item_id += 1
        sess.items.append({"id": sess.item_id, "k": "honey", "x": x, "y": y, "by": -1, "until": now + 18000, "safe": 0, "hits": 1, "fan": 1})
        sess.ev(k="fanhoney", v=to, by=player.pid, n=who, x=round(x, 1), y=round(y, 1))
    elif a == "cheer":
        try:
            e = int(msg.get("e", 0)) % 6
        except (TypeError, ValueError):
            e = 0
        sess.ev(k="cheer", v=to, by=player.pid, n=who, e=e)
    await reply({"t": "kfanok", "a": a, "at": cd[a] - sess.t0})


# =====================================================================
#  시험: AI 만으로 달려 보기 (python3 kart.py)
# =====================================================================
if __name__ == "__main__":
    import sys

    class _P:
        def __init__(self):
            self.players = {}

    print("트랙 길이 %.1f · 지름길 %.1f (본길 %.0f 건너뜀) · 풍선 %d · 화분 %d" % (TRACK.L, TRACK.sc.L, TRACK.span, len(TRACK.balloons), len(TRACK.pots)))
    for lv in (1, 2, 3, 4, 5):
        times = []
        for seed in range(6):
            r = KartRace(_P(), seed + 1, 8, lv, 0)
            r.no_items = "items" not in sys.argv
            r.wait_all = True
            r.status = "race"
            r.start_at = 0
            t = 0
            now = 0
            r.last_tick = 0
            while r.status == "race" and now < 200000:
                now += 50
                r.tick(now)
            times += [k.fin_t for k in r.karts]
        times.sort()
        print("AI %d단계: 평균 %.1f초 (빠름 %.1f · 느림 %.1f)" % (lv, sum(times) / len(times), times[0], times[-1]))
