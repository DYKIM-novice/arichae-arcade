"""아리채 오락실 · 보드게임관 (서버 쪽)

서버는 규칙을 몰라요. 누가 둘 차례인지와 둔 수 목록만 지키고, 모두에게 나눠 줘요.
규칙 계산·AI 는 기기(브라우저)가 해요. AI 차례에는 방장 기기가 AI 수를 계산해서 보내요.

방장 설정 (room.board):
  game   보드게임 id (static/games.json 의 "board")
  vs     "ai" (AI와 대결) / "pvp" (사람끼리)
  ai     AI 단계 1~5
  seats  자리마다 사람 pid 또는 "ai"  (오목: 0=흑(먼저), 1=백)
"""
import time
from typing import Dict, List, Optional

AI_LEVELS = (1, 2, 3, 4, 5)
# 기록 점수: AI 단계가 높을수록, 적은 수로 이길수록 높아요
LEVEL_BASE = {1: 100, 2: 300, 3: 700, 4: 1500, 5: 3000}


class BoardConfig:
    def __init__(self, games: List[dict]):
        self.games: Dict[str, dict] = {g["id"]: g for g in games}

    def players(self, gid: str) -> int:
        g = self.games.get(gid) or {}
        p = g.get("players") or [2, 2]
        return int(p[1] if isinstance(p, list) else p)

    def min_players(self, gid: str) -> int:
        g = self.games.get(gid) or {}
        p = g.get("players") or [2, 2]
        return int(p[0] if isinstance(p, list) else p)

    def has_ai(self, gid: str) -> bool:
        return bool((self.games.get(gid) or {}).get("ai"))


def now_ms() -> int:
    return int(time.time() * 1000)


def default_board(cfg: BoardConfig) -> dict:
    first = next(iter(cfg.games), "")
    return {"game": first, "vs": "ai", "ai": 2, "seats": []}


def resolve_seats(room, cfg: BoardConfig) -> Optional[List[str]]:
    """방장 설정과 지금 접속한 사람으로 실제 자리를 정해요. 안 되면 None"""
    b = room.board
    gid = b.get("game")
    n = cfg.players(gid)
    humans = [p.pid for p in room.ordered_players() if p.connected]
    want = [s for s in (b.get("seats") or [])][:n]
    seats: List[str] = []
    if b.get("vs") == "ai" and cfg.has_ai(gid):
        # 사람 1명 + 나머지 AI. 사람 자리는 방장이 고른 자리, 없으면 방장이 흑(먼저)
        human_seat = next((i for i, s in enumerate(want) if s in humans), 0)
        human = want[human_seat] if human_seat < len(want) and want[human_seat] in humans else room.host_pid
        if human not in humans:
            human = humans[0] if humans else ""
        if not human:
            return None
        seats = ["ai"] * n
        seats[min(human_seat, n - 1)] = human
        return seats
    # 사람끼리: 방장이 고른 자리를 쓰고, 빈 자리는 들어온 순서대로
    used = set()
    for s in want:
        if s in humans and s not in used:
            seats.append(s)
            used.add(s)
        else:
            seats.append("")
    seats += [""] * (n - len(seats))
    rest = [h for h in humans if h not in used]
    for i in range(n):
        if not seats[i] and rest:
            seats[i] = rest.pop(0)
    seats = [s for s in seats if s]
    if len(seats) < cfg.min_players(gid):
        return None
    return seats


def new_session(room, cfg: BoardConfig, seats: List[str]) -> dict:
    b = room.board
    return {
        "game": b.get("game"),
        "vs": b.get("vs"),
        "ai": int(b.get("ai") or 2),
        "seats": seats,
        "moves": [],
        "turn": 0,
        "status": "play",
        "result": None,
        "undos": 0,
        "hints": 0,
        "startAt": now_ms(),
        "round": (room.bsess or {}).get("round", 0) + 1 if room.bsess else 1,
    }


def is_driver(room, player) -> bool:
    """AI 수를 계산해서 보내는 기기: 방장"""
    return player.pid == room.host_pid


def board_record(bs: dict, winner: int) -> Optional[dict]:
    """AI 를 이긴 사람의 기록 점수"""
    if bs.get("vs") != "ai" or winner < 0:
        return None
    seat = bs["seats"][winner]
    if seat == "ai" or bs.get("undos") or bs.get("hints"):
        return None
    lv = int(bs.get("ai") or 1)
    my_moves = sum(1 for m in bs["moves"] if m.get("s") == winner)
    bonus = max(0, 300 - my_moves * 6) * lv // 2
    return {"pid": seat, "score": LEVEL_BASE.get(lv, 100) + bonus, "detail": f"AI {lv}단계 · {my_moves}수"}
