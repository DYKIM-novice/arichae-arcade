"""아리채 오락실 · 카드게임관 (서버 쪽)

카드게임은 두 가지 방식이에요.
  race   모두가 같은 판을 동시에 혼자 풀고 빨리 푼 순서로 순위 (프리첼)
         → 판 번호만 정해 주고, 각자 기기가 규칙을 계산해서 진행 상황(cprog)을 보내요
  table  한 테이블에 둘러앉아 하는 게임 (홀덤·훌라·맞고)
         → 서버가 카드를 섞고 규칙을 계산해요. 각자에게는 자기 패만 보내요(cview). AI 도 서버가 둬요

방장 설정 (room.card):
  game   카드게임 id (static/games.json 의 "card")
  ai     AI 단계 1~5 (table)
  seats  자리마다 사람 pid 또는 "ai" (table)
"""
import random
import time
from typing import Dict, List, Optional

AI_LEVELS = (1, 2, 3, 4, 5)
RACE_LIMIT_MS = 20 * 60 * 1000          # 프리첼: 20분이 지나면 그때까지의 결과로 끝
FREECELL_BAD_DEALS = {11982}            # 풀 수 없는 판 (마이크로소프트 3만 2천 판 가운데 하나)


def now_ms() -> int:
    return int(time.time() * 1000)


class CardConfig:
    """카드게임관(card)과 놀이마당(party) 게임 목록. 둘 다 같은 방식(race/table)으로 돌아가요"""
    def __init__(self, games: List[dict], party: Optional[List[dict]] = None):
        self.games: Dict[str, dict] = {g["id"]: dict(g, hall="card") for g in games}
        for g in party or []:
            self.games[g["id"]] = dict(g, hall="party")

    def hall(self, gid: str) -> str:
        return (self.games.get(gid) or {}).get("hall", "")

    def first(self, hall: str) -> str:
        return next((g for g, m in self.games.items() if m["hall"] == hall), "")

    def default_opts(self, gid: str) -> dict:
        """games.json "options": {키: [고를 수 있는 값들...]} → 첫 값이 기본"""
        return {k: v[0] for k, v in ((self.games.get(gid) or {}).get("options") or {}).items() if v}

    def clean_opts(self, gid: str, raw: dict) -> dict:
        spec = (self.games.get(gid) or {}).get("options") or {}
        return {k: raw[k] for k in raw if k in spec and raw[k] in spec[k]}

    def kind(self, gid: str) -> str:
        return (self.games.get(gid) or {}).get("kind", "table")

    def players(self, gid: str):
        p = (self.games.get(gid) or {}).get("players") or [2, 2]
        return int(p[0]), int(p[1])


def default_card(cfg: CardConfig) -> dict:
    first = next(iter(cfg.games), "")
    return {"game": first, "ai": 2, "seats": []}


def resolve_seats(room, cfg: CardConfig) -> Optional[List[str]]:
    """table 게임: 방장이 고른 자리 (사람 pid / 'ai'). 빈 설정이면 접속한 사람 + AI 로 최소 인원 채우기"""
    c = room.card
    gid = c.get("game")
    lo, hi = cfg.players(gid)
    humans = [p.pid for p in room.ordered_players() if p.connected]
    want = [s for s in (c.get("seats") or []) if s == "ai" or s in humans][:hi]
    if not want:
        want = humans[:hi]
        while len(want) < max(lo, 2):
            want.append("ai")
    if not any(s != "ai" for s in want):
        return None
    if len(want) < lo:
        return None
    return want


def new_race(room, cfg: CardConfig) -> dict:
    gid = room.card.get("game")
    deal = random.randint(1, 32000)
    while deal in FREECELL_BAD_DEALS:
        deal = random.randint(1, 32000)
    seats = [p.pid for p in room.ordered_players() if p.connected]
    start = now_ms() + 3500
    return {
        "game": gid, "kind": "race", "seats": seats, "deal": deal,
        "startAt": start, "limitAt": start + RACE_LIMIT_MS,
        "status": "play", "result": None,
        "prog": {pid: {"f": 0, "m": 0, "done": False, "gave": False, "ms": 0} for pid in seats},
        "round": (room.csess or {}).get("round", 0) + 1 if room.csess else 1,
    }


def race_progress(cs: dict, pid: str, msg: dict) -> Optional[dict]:
    """진행 상황 받기. 다 풀었으면 걸린 시간을 서버 시계로 정해요"""
    pr = cs["prog"].get(pid)
    if not pr or pr["done"] or pr["gave"] or cs["status"] != "play":
        return None
    try:
        f = max(0, min(52, int(msg.get("f", 0))))
        m = max(0, min(5000, int(msg.get("m", 0))))
    except (TypeError, ValueError):
        return None
    pr["f"] = f
    pr["m"] = m
    if msg.get("done") and f == 52:
        pr["done"] = True
        pr["ms"] = max(1000, now_ms() - cs["startAt"])
        pr["at"] = now_ms()
        return pr
    if msg.get("gave"):
        pr["gave"] = True
    return None


def race_all_done(cs: dict, connected: List[str]) -> bool:
    return all(cs["prog"][p]["done"] or cs["prog"][p]["gave"] or p not in connected for p in cs["seats"])


def race_ranking(cs: dict) -> List[dict]:
    rows = []
    for pid in cs["seats"]:
        pr = cs["prog"][pid]
        rows.append({"pid": pid, "done": pr["done"], "ms": pr["ms"], "f": pr["f"], "m": pr["m"]})
    rows.sort(key=lambda r: (0 if r["done"] else 1, r["ms"] if r["done"] else -r["f"], r["m"]))
    return rows


def freecell_record(ms: int, moves: int, deal: int) -> dict:
    sec = ms // 1000
    return {"score": max(1, 100000 - ms // 100), "detail": f"{sec // 60}분 {sec % 60}초 · {moves}수 · {deal}번 판"}


# =====================================================================
# table 방식 (서버가 규칙을 계산)
# =====================================================================
LEVEL_NAMES = {1: "병아리", 2: "토끼", 3: "여우", 4: "호랑이", 5: "용"}
LEVEL_BASE = {1: 100, 2: 300, 3: 700, 4: 1500, 5: 3000}


def default_fill(cfg: CardConfig, gid: str) -> int:
    return int((cfg.games.get(gid) or {}).get("fill", 2))


def table_seats(room, cfg: CardConfig) -> Optional[List[str]]:
    """자리: 방장이 정한 목록, 없으면 접속한 사람 모두 + AI 로 기본 인원 채우기"""
    c = room.card
    gid = c.get("game")
    lo, hi = cfg.players(gid)
    humans = [p.pid for p in room.ordered_players() if p.connected]
    want = [s for s in (c.get("seats") or []) if s == "ai" or s in humans]
    if not want:
        want = humans[:hi]
        can_ai = (cfg.games.get(gid) or {}).get("ai", True)
        while can_ai and len(want) < max(lo, default_fill(cfg, gid)) and len(want) < hi:
            want.append("ai")
    if not (cfg.games.get(gid) or {}).get("ai", True):
        want = [s for s in want if s != "ai"]     # 사람끼리만 하는 게임
    want = want[:hi]
    if len(want) < lo or not any(s != "ai" for s in want):
        return None
    return want


# AI 친구 캐릭터 (static/js/animals.js 와 같은 이름) — 여러 명이면 서로 다른 동물로
AI_ANIMALS = [("bear", "곰"), ("panda", "판다"), ("fox", "여우"), ("raccoon", "너구리"), ("koala", "코알라"),
              ("hamster", "햄스터"), ("penguin", "펭귄"), ("owl", "부엉이"), ("frog", "개구리"), ("pig", "돼지"),
              ("monkey", "원숭이"), ("lion", "사자"), ("sheep", "양"), ("otter", "수달"), ("cat", "고양이"),
              ("dog", "강아지"), ("chick", "병아리"), ("mouse", "쥐"), ("tiger", "호랑이"), ("rabbit", "토끼")]


def new_table(room, cfg: CardConfig, seats: List[str], engines: dict):
    gid = room.card.get("game")
    lv = int(room.card.get("ai") or 2)
    names = []
    taken = {room.players[s].animal for s in seats if s != "ai" and s in room.players}
    pool = [a for a in AI_ANIMALS if a[0] not in taken] or list(AI_ANIMALS)
    random.shuffle(pool)
    ai_animals = {}
    for i, s in enumerate(seats):
        if s == "ai":
            key, ko = pool[len(ai_animals) % len(pool)]
            ai_animals[i] = key
            names.append(f"AI {ko}")
        else:
            p = room.players.get(s)
            names.append(p.name if p else "?")
    rng = random.Random()
    cls = engines[gid]
    kw = {}
    if getattr(cls, "TAKES_OPTS", False):
        opts = cfg.default_opts(gid)
        opts.update(cfg.clean_opts(gid, room.card.get("opts") or {}))
        kw["opts"] = opts
    eng = cls(len(seats), names, [i for i, s in enumerate(seats) if s == "ai"], lv, rng, **kw)
    cs = {
        "game": gid, "kind": "table", "seats": seats, "names": names, "ai": lv, "aiAnimals": ai_animals,
        "status": "play", "result": None, "startAt": now_ms(),
        "round": (room.csess or {}).get("round", 0) + 1 if room.csess else 1,
    }
    return cs, eng


def table_record(cs: dict, res: dict) -> Optional[dict]:
    """AI 와 함께 한 판에서 사람이 1등이면 기록 (혼자 점수를 겨루는 게임은 recAny 로 가장 잘한 사람)"""
    w = res.get("winner", -1)
    seats = cs["seats"]
    ra = res.get("recAny")
    if ra and 0 <= ra.get("seat", -1) < len(seats) and seats[ra["seat"]] != "ai" and ra.get("score", 0) > 0:
        return {"pid": seats[ra["seat"]], "score": int(ra["score"]), "detail": str(ra.get("detail", ""))[:60]}
    if w is None or w < 0 or w >= len(seats) or seats[w] == "ai":
        return None
    n_ai = seats.count("ai")
    if not n_ai:
        return None
    lv = int(cs.get("ai") or 1)
    if res.get("rec"):
        # 게임이 정한 점수 (도블: 모은 카드·빠르기)
        r = res["rec"]
        return {"pid": seats[w], "score": LEVEL_BASE.get(lv, 100) * n_ai + int(r.get("pts", 0)) * lv,
                "detail": f"AI {lv}단계 {n_ai}명 · {r.get('detail', '')}"}
    hands = int(res.get("hands") or 0)
    bonus = max(0, 400 - hands * 8) * lv // 2
    return {"pid": seats[w], "score": LEVEL_BASE.get(lv, 100) * n_ai + bonus,
            "detail": f"AI {lv}단계 {n_ai}명 · {hands}판"}
