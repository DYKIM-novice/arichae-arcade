"""올림픽관 — 서버 쪽: 선수 캐릭터 목록 · AI 선수의 기록 만들기

종목 화면(static/js/games/olympic/*.js)은 각자 폰에서 돌아가고, 서버는 점수만 받아요.
AI 선수는 서버가 종목이 시작할 때 '이번 기록'을 미리 정해서(current["bots"]) 모두에게 똑같이 보내요.
폰은 그 값대로 AI 선수를 움직여 보여줘요 (모든 폰에서 같은 모습).

점수(높을수록 좋음)와 기록의 관계 — 화면의 fmt() 와 같아야 해요
  달리기·허들·수영: 완주하면 100000 - 기록(ms), 못 하면 간 거리(cm, 50000 미만)
  멀리뛰기·창던지기: 가장 멀리 간 거리(cm)
  역도: 성공한 가장 무거운 무게(kg)
  양궁: 합계 × 100 + 10점 맞힌 수
"""
import math
import random
from typing import Dict, List

# 올림픽 전용 선수 캐릭터 (화면 static/js/games/olympic/core.js 의 ATH 와 같은 순서)
ATHLETES = [
    ("dino", "뿌뿌"), ("bee", "붕붕"), ("hedgehog", "도치"), ("alpaca", "파카"), ("redpanda", "레시"),
    ("squirrel", "토리"), ("turtle", "엉금"), ("unicorn", "콘이"), ("octopus", "문이"), ("whale", "퐁당"),
]
ATHLETE_IDS = [a[0] for a in ATHLETES]
ATHLETE_NAME = dict(ATHLETES)
MAX_LANES = 8
AI_LEVELS = (1, 2, 3, 4, 5)

HURDLES = 10
LIFT_STEPS = [40, 60, 80, 100, 120, 140, 160, 180, 200, 220]


def _g(rng: random.Random, mu: float, sd: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, rng.gauss(mu, sd)))


def jump_dist(v: float, ang: float) -> float:
    """멀리뛰기 거리(m) — 화면과 같은 식: 빠를수록, 45도에 가까울수록 멀리"""
    return max(0.0, v * v * math.sin(math.radians(2 * ang)) / 9.8 * 0.72)


def jav_dist(v: float, ang: float) -> float:
    """창던지기 거리(m) — 도움닫기 속도로 던지는 힘이 정해져요"""
    sp = 9 + v * 2.3
    return max(0.0, sp * sp * math.sin(math.radians(2 * ang)) / 9.8 * 0.92)


RACES = ("o100", "ohurdle", "oswim", "wspeed", "wshort", "wbob", "wslalom", "wbiath")
RACE_BASE = {   # AI 단계별 기록(초) — 1 쉬움 … 5 국가대표
    "o100": [18.5, 15.8, 13.7, 12.1, 10.8], "ohurdle": [25.0, 21.5, 18.8, 16.6, 15.0],
    "oswim": [43.0, 37.0, 32.0, 28.5, 25.5],
    "wspeed": [55.0, 48.0, 42.0, 38.0, 35.0], "wshort": [46.0, 40.0, 35.5, 32.0, 29.0],
    "wbob": [44.0, 39.0, 35.5, 32.5, 30.0], "wslalom": [50.0, 44.0, 39.5, 36.0, 33.0],
    "wbiath": [56.0, 49.0, 44.0, 40.0, 36.5],
}


def new_event(gid: str, rng: random.Random) -> dict:
    """종목마다 모두에게 같은 값 (출발 총 시각 등)"""
    if gid in RACES:
        return {"gun": rng.randint(1800, 3000)}
    if gid == "oarch":
        return {"wind": [round(rng.uniform(-1, 1), 2) for _ in range(6)]}
    return {}


def bot_perf(gid: str, lv: int, rng: random.Random, ev: dict) -> dict:
    """AI 선수 한 명의 이번 종목 기록 (score 와 끝나는 시각 done(ms, 시작부터))"""
    lv = max(1, min(5, int(lv)))
    k = lv - 1
    if gid in RACES:
        base = RACE_BASE[gid][k]
        t = _g(rng, base, base * 0.025, base * 0.9, base * 1.12)
        out = {"T": round(t * 1000), "react": rng.randint(140, 320)}
        if gid == "ohurdle":
            p = [0.35, 0.25, 0.16, 0.1, 0.05][k]
            out["knock"] = [i for i in range(HURDLES) if rng.random() < p]
        if gid == "wbiath":
            # 사격 5발 중 맞힌 것 (못 맞히면 벌칙 시간이 기록에 이미 들어 있어요)
            hit = [0.55, 0.65, 0.75, 0.85, 0.93][k]
            out["shots"] = [1 if rng.random() < hit else 0 for _ in range(5)]
            out["T"] += (5 - sum(out["shots"])) * 3000
        if gid == "wshort":
            out["fall"] = 1 if rng.random() < [0.2, 0.14, 0.1, 0.06, 0.03][k] else 0
            if out["fall"]:
                out["T"] += 2500
        ms = ev["gun"] + out["react"] + out["T"]
        out["score"] = 100000 - (out["T"] + out["react"])
        out["done"] = ms + 600
        return out
    if gid in ("olong", "ojav"):
        vs = [6.6, 7.6, 8.6, 9.6, 10.4][k]
        foul = [0.25, 0.2, 0.15, 0.1, 0.06][k]
        tries = []
        best = 0
        for i in range(3):
            v = _g(rng, vs, 0.35, vs - 1, vs + 0.8)
            ang = _g(rng, 40 if gid == "olong" else 38, 6 - k, 20, 60)
            f = rng.random() < foul
            d = 0 if f else round((jump_dist(v, ang) if gid == "olong" else jav_dist(v, ang)) * 100)
            tries.append({"v": round(v, 2), "a": round(ang, 1), "d": d, "f": f})
            best = max(best, d)
        return {"tries": tries, "score": best, "done": 1500 + 3 * 11000}
    if gid == "wjump":
        base = [72, 86, 100, 112, 123][k]
        tries = []
        best = 0
        for i in range(2):
            d = _g(rng, base, 5, base - 18, base + 12)
            fall = rng.random() < [0.18, 0.12, 0.08, 0.05, 0.03][k]
            cm = round(d * 100 * (0.8 if fall else 1))
            tries.append({"d": cm, "fall": fall, "bal": round(rng.uniform(-0.3, 0.3), 2)})
            best = max(best, cm)
        return {"tries": tries, "score": best, "done": 1500 + 2 * 14000}
    if gid == "olift":
        cap = _g(rng, [75, 100, 125, 150, 175][k], 8, 40, 220)
        lifts = []
        for w in LIFT_STEPS:
            ok = w <= cap
            lifts.append({"kg": w, "ok": ok})
            if not ok:
                break
        best = max([x["kg"] for x in lifts if x["ok"]] or [0])
        return {"lifts": lifts, "score": best, "done": 1500 + len(lifts) * 4200 + 800}
    if gid == "oarch":
        mean = [5.5, 7.0, 8.0, 8.8, 9.4][k]
        arrows = []
        tot = 0
        tens = 0
        for i in range(6):
            pts = int(round(_g(rng, mean, 1.4 - k * 0.15, 0, 10)))
            r = (10.5 - pts) / 10 if pts > 0 else 1.15
            a = rng.uniform(0, 2 * math.pi)
            arrows.append({"p": pts, "x": round(math.cos(a) * r, 3), "y": round(math.sin(a) * r, 3)})
            tot += pts
            tens += pts == 10
        return {"arrows": arrows, "score": tot * 100 + tens, "done": 2500 + 6 * 5500}
    return {"score": 0, "done": 0}
