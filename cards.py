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
    def __init__(self, games: List[dict]):
        self.games: Dict[str, dict] = {g["id"]: g for g in games}

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
