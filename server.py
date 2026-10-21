"""
아리채 오락실 - 가족 멀티플레이 미니게임 서버

파이썬 기본 기능만 사용합니다 (추가 설치 없음).
Render(클라우드)에 올려서 쓰고, 노트북에서도 똑같이 실행해 볼 수 있어요.

실행:  python server.py
접속:  Render 주소(https://...onrender.com) 또는 노트북에서 http://localhost:8000

환경변수(선택)
  PORT                포트 번호 (Render가 자동으로 정해줘요)
  ARICHAE_PORT        포트 번호 (PORT가 없을 때, 기본 8000)
  ARICHAE_PUBLIC_URL  외부 접속용 터널 주소 (예: https://xxxx.trycloudflare.com)
  ARICHAE_ONLY        특정 게임만 나오게 (테스트용, 예: race,stop)
  ARICHAE_TIME_SCALE  시간 배율 (테스트용, 기본 1)
"""

import asyncio
import base64
import hashlib
import json
import logging
import mimetypes
import os
import random
import secrets
import socket
import struct
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import unquote, urlsplit

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))   # 같은 폴더의 records.py
from records import RecordStore  # noqa: E402
import boards as BG  # noqa: E402
import cards as CG  # noqa: E402
from cardgames import ENGINES as _CARD_ENGINES  # noqa: E402
from partygames import ENGINES as _PARTY_ENGINES  # noqa: E402
CARD_ENGINES = {**_CARD_ENGINES, **_PARTY_ENGINES}   # 카드게임관 + 놀이마당 (서버가 규칙을 계산하는 게임)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = (BASE_DIR / "static").resolve()

PORT = int(os.environ.get("PORT") or os.environ.get("ARICHAE_PORT") or "8000")
PUBLIC_URL = os.environ.get("ARICHAE_PUBLIC_URL", "").strip().rstrip("/")
TIME_SCALE = float(os.environ.get("ARICHAE_TIME_SCALE", "1") or "1")

MAX_PLAYERS = 8
# 기록실 저장 폴더 (Render 에서는 디스크를 붙인 /var/data)
DATA_DIR = Path(os.environ.get("ARICHAE_DATA_DIR") or (BASE_DIR / "data"))
# 시험용으로 시간을 빠르게(ARICHAE_TIME_SCALE) 돌릴 때는 점수가 달라지니 기록하지 않아요
RECORDS_ON = TIME_SCALE == 1 or os.environ.get("ARICHAE_RECORDS") == "1"
TUG_BONUS = 300          # 줄다리기 이긴 팀 보너스
INTRO_MS = 6000          # 미니게임 설명 + 3초 카운트다운
RESULT_MS = 8000         # 결과 발표 화면
GRACE_MS = 1500          # 플레이 종료 후 최종 점수 수신 대기
HOST_HANDOVER_SEC = 20   # 방장이 끊긴 뒤 방장 넘기기까지 대기
ROOM_IDLE_SEC = 30 * 60  # 아무도 접속 안 한 방 정리
WS_IDLE_SEC = 30         # 이 시간 동안 아무 신호가 없으면 끊긴 것으로 처리 (기기는 2초마다 신호를 보냄)
SEND_TIMEOUT_SEC = 4     # 한 기기에 보내기가 이 시간 안에 안 끝나면 그 기기만 끊어요 (방 전체가 멈추지 않게)
WS_MAX_MESSAGE = 64 * 1024

# 게임 목록과 플레이 시간(초)은 static/games.json 한 곳에만 적어요 (화면도 같은 파일을 읽어요)
MANIFEST_PATH = STATIC_DIR / "games.json"
MANIFEST = json.loads(MANIFEST_PATH.read_text("utf-8"))
GAMES: Dict[str, int] = {g["id"]: int(g["dur"]) for g in MANIFEST["games"]["arcade"]}      # 오락실
EDU_GAMES: Dict[str, int] = {g["id"]: int(g["dur"]) for g in MANIFEST["games"]["edu"]}     # 과학관·음악관
ALL_GAMES: Dict[str, int] = {**GAMES, **EDU_GAMES}
EDU_PICKABLE = [g["id"] for g in MANIFEST["games"]["edu"] if g.get("pick", True)]   # 과학관에서 고를 수 있는 게임
MUSIC_SONGS = tuple(MANIFEST["songs"])   # 음악관: 방장이 곡을 골라 순서대로 오르골 연주회
BOARD_CFG = BG.BoardConfig(MANIFEST["games"].get("board", []))   # 보드게임관
CARD_CFG = CG.CardConfig(MANIFEST["games"].get("card", []), MANIFEST["games"].get("party", []))   # 카드게임관 + 놀이마당
LEVELS = ("e", "m", "h", "x")     # 초·중·고 (+ 음악관 특상)
MAX_PICKS = 10

# 오락실 모드에서 최근에 한 게임을 기억 (서버가 켜져 있는 동안, 모든 방 공통)
LAST_PLAYED: Dict[str, float] = {}

ANIMALS = [
    "cat", "dog", "rabbit", "bear", "panda", "fox", "raccoon", "koala", "hamster", "penguin",
    "chick", "owl", "frog", "pig", "monkey", "lion", "tiger", "sheep", "mouse", "otter",
]

RANK_POINTS = [100, 80, 65, 50, 40, 30, 20, 10]

log = logging.getLogger("arichae")
STORE = RecordStore(DATA_DIR)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/webp", ".webp")


def now_ms() -> int:
    return int(time.time() * 1000)


def scaled(ms: float) -> int:
    return int(ms * TIME_SCALE)


def clean_name(raw) -> str:
    name = str(raw or "").strip().replace("\n", " ")
    name = " ".join(name.split())
    if not name:
        name = "플레이어"
    return name[:8]


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


# =====================================================================
#  웹소켓 (표준 라이브러리로 직접 구현)
# =====================================================================
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class WSClosed(Exception):
    pass


class WebSocketConn:
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader = reader
        self.writer = writer
        self.lock = asyncio.Lock()
        self.closed = False

    async def _send_frame(self, opcode: int, payload: bytes) -> None:
        if self.closed:
            raise WSClosed()
        n = len(payload)
        if n < 126:
            header = struct.pack("!BB", 0x80 | opcode, n)
        elif n < 65536:
            header = struct.pack("!BBH", 0x80 | opcode, 126, n)
        else:
            header = struct.pack("!BBQ", 0x80 | opcode, 127, n)
        async with self.lock:
            if self.closed:
                raise WSClosed()
            try:
                self.writer.write(header + payload)
                await asyncio.wait_for(self.writer.drain(), timeout=SEND_TIMEOUT_SEC)
            except asyncio.TimeoutError:
                # 응답 없는 기기: 기다리지 않고 바로 끊어요 (그 기기는 다시 접속하면 돼요)
                self.abort()
                raise WSClosed()
            except (ConnectionError, OSError, RuntimeError):
                self.closed = True
                raise WSClosed()

    def abort(self) -> None:
        """기다리지 않고 즉시 연결을 끊어요."""
        self.closed = True
        try:
            self.writer.transport.abort()
        except Exception:
            pass

    async def send_text(self, text: str) -> None:
        await self._send_frame(0x1, text.encode("utf-8"))

    async def recv(self) -> str:
        """텍스트 메시지 하나를 돌려줍니다. 연결이 끝나면 WSClosed."""
        parts: List[bytes] = []
        total = 0
        while True:
            try:
                head = await self.reader.readexactly(2)
            except (asyncio.IncompleteReadError, ConnectionError, OSError):
                self.closed = True
                raise WSClosed()
            b1, b2 = head
            fin = b1 & 0x80
            opcode = b1 & 0x0F
            masked = b2 & 0x80
            length = b2 & 0x7F
            try:
                if length == 126:
                    length = struct.unpack("!H", await self.reader.readexactly(2))[0]
                elif length == 127:
                    length = struct.unpack("!Q", await self.reader.readexactly(8))[0]
                if length > WS_MAX_MESSAGE:
                    await self.close()
                    raise WSClosed()
                mask = await self.reader.readexactly(4) if masked else b""
                data = await self.reader.readexactly(length) if length else b""
            except (asyncio.IncompleteReadError, ConnectionError, OSError):
                self.closed = True
                raise WSClosed()
            if masked and data:
                key = (mask * (len(data) // 4 + 1))[: len(data)]
                data = (int.from_bytes(data, "big") ^ int.from_bytes(key, "big")).to_bytes(len(data), "big")

            if opcode == 0x8:  # close
                try:
                    await self._send_frame(0x8, data[:2])
                except WSClosed:
                    pass
                await self.close()
                raise WSClosed()
            if opcode == 0x9:  # ping
                try:
                    await self._send_frame(0xA, data)
                except WSClosed:
                    raise
                continue
            if opcode == 0xA:  # pong
                continue
            if opcode in (0x0, 0x1, 0x2):
                parts.append(data)
                total += len(data)
                if total > WS_MAX_MESSAGE:
                    await self.close()
                    raise WSClosed()
                if fin:
                    return b"".join(parts).decode("utf-8", errors="replace")
                continue
            # 모르는 opcode → 종료
            await self.close()
            raise WSClosed()

    async def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        try:
            self.writer.write(struct.pack("!BB", 0x88, 0))
            await asyncio.wait_for(self.writer.drain(), timeout=1.5)
        except Exception:
            self.abort()
            return
        try:
            self.writer.close()
        except Exception:
            pass


# =====================================================================
#  게임 상태
# =====================================================================
class Player:
    def __init__(self, pid: str, name: str, animal: str, device: str, order: int):
        self.pid = pid
        self.token = secrets.token_urlsafe(16)
        self.name = name
        self.animal = animal
        self.device = device
        self.order = order
        self.ready = False
        self.ws: Optional[WebSocketConn] = None
        self.connected = False
        self.disconnected_at = 0
        self.rtt = 0
        self.total = 0
        self.active_from = 0
        # 현재 미니게임 진행값
        self.game_score = 0
        self.live_value = 0.0
        self.played = False
        self.finished = False

    def public(self, host_pid: str) -> dict:
        return {
            "pid": self.pid,
            "name": self.name,
            "animal": self.animal,
            "device": self.device,
            "ready": self.ready,
            "connected": self.connected,
            "rtt": self.rtt,
            "total": self.total,
            "activeFrom": self.active_from,
            "isHost": self.pid == host_pid,
            "offSince": self.disconnected_at if not self.connected else 0,
        }

    async def send(self, payload: dict) -> None:
        ws = self.ws
        if ws is None:
            return
        try:
            await ws.send_text(json.dumps(payload, ensure_ascii=False))
        except WSClosed:
            pass
        except Exception:
            pass


class Room:
    def __init__(self, code: str):
        self.code = code
        self.players: Dict[str, Player] = {}
        self.host_pid = ""
        self.phase = "lobby"
        self.length = 5
        self.mode = "arcade"      # arcade(오락실, 랜덤) / edu(과학관, 선택) / music(음악관, 곡 선택)
        self.level = "m"          # 과학관 난이도: e(초) m(중) h(고)
        self.picks: List[str] = []
        self.songs: List[str] = []      # 음악관에서 고른 곡
        self.song_seq: List[str] = []
        self.deck: List[str] = []
        self.sequence: List[str] = []
        self.index = -1
        self.current: dict = {}
        self.last_result: Optional[dict] = None
        self.standings: List[dict] = []
        self.task: Optional[asyncio.Task] = None
        self.live_dirty = False
        self.join_counter = 0
        self.empty_since = now_ms()
        self.board = BG.default_board(BOARD_CFG)   # 보드게임관 설정 (게임·대결 방식·AI 단계·자리)
        self.bsess: Optional[dict] = None          # 진행 중인 보드게임 판
        self.card = CG.default_card(CARD_CFG)      # 카드게임관 설정
        self.csess: Optional[dict] = None          # 진행 중인 카드게임 판 (모두에게 보이는 부분)
        self.ctask: Optional[asyncio.Task] = None  # 카드게임 시간 재기·AI
        self.cengine = None                        # table 카드게임 규칙 (서버만 알아요: 모든 패)

    # ---------- 공통 ----------
    def connected_players(self) -> List[Player]:
        return [p for p in self.players.values() if p.connected]

    def ordered_players(self) -> List[Player]:
        return sorted(self.players.values(), key=lambda p: p.order)

    def taken_animals(self, except_pid: str = "") -> List[str]:
        return [p.animal for p in self.players.values() if p.pid != except_pid]

    def state(self) -> dict:
        host = self.players.get(self.host_pid)
        return {
            "code": self.code,
            "phase": self.phase,
            "hostPid": self.host_pid,
            "hostName": host.name if host else "",
            "length": self.length,
            "mode": self.mode,
            "level": self.level,
            "picks": self.picks,
            "songs": self.songs,
            "sequence": self.sequence,
            "index": self.index,
            "current": self.current,
            "players": [p.public(self.host_pid) for p in self.ordered_players()],
            "lastResult": self.last_result,
            "standings": self.standings,
            "maxPlayers": MAX_PLAYERS,
            "board": self.board,
            "bsess": self.bsess,
            "card": self.card,
            "csess": self.csess,
        }

    async def broadcast(self, payload: dict) -> None:
        targets = [p for p in list(self.players.values()) if p.ws is not None]
        if targets:
            await asyncio.gather(*(p.send(payload) for p in targets))

    async def broadcast_state(self) -> None:
        await self.broadcast({"t": "state", "room": self.state(), "now": now_ms()})

    # ---------- 게임 진행 ----------
    def build_sequence(self, n: int) -> List[str]:
        """오락실 모드: 카드 덱 방식. 덱을 다 쓰기 전에는 같은 게임이 다시 나오지 않아요."""
        only = [g.strip() for g in os.environ.get("ARICHAE_ONLY", "").split(",") if g.strip() in ALL_GAMES]
        if only:
            ids = only
            seq: List[str] = []
            while len(seq) < n:
                pool = ids[:]
                random.shuffle(pool)
                if seq and len(pool) > 1 and pool[0] == seq[-1]:
                    pool[0], pool[-1] = pool[-1], pool[0]
                seq.extend(pool)
            return seq[:n]

        seq = []
        while len(seq) < n:
            if not self.deck:
                self.deck = self.new_deck(avoid=seq[-1] if seq else None)
            g = self.deck.pop(0)
            seq.append(g)
        return seq

    def new_deck(self, avoid: Optional[str] = None) -> List[str]:
        ids = list(GAMES.keys())
        random.shuffle(ids)
        # 최근에 안 한 게임이 앞으로 (한 번도 안 한 게임이 가장 먼저)
        ids.sort(key=lambda g: LAST_PLAYED.get(g, 0))
        if avoid and len(ids) > 1 and ids[0] == avoid:
            ids.append(ids.pop(0))
        return ids

    def start_match(self) -> None:
        self.song_seq = []
        if self.mode == "edu":
            self.sequence = [g for g in self.picks if g in EDU_PICKABLE]
        elif self.mode == "music":
            self.song_seq = [s for s in self.songs if s in MUSIC_SONGS]
            self.sequence = ["music"] * len(self.song_seq)
        else:
            self.sequence = self.build_sequence(self.length)
        self.index = -1
        self.last_result = None
        self.standings = []
        for p in self.players.values():
            p.total = 0
            p.active_from = 0
            p.ready = False
        self.task = asyncio.ensure_future(self.run_match())

    async def run_match(self) -> None:
        try:
            for i, gid in enumerate(self.sequence):
                self.index = i
                for p in self.players.values():
                    p.game_score = 0
                    p.live_value = 0.0
                    p.played = False
                    p.finished = False
                LAST_PLAYED[gid] = time.time()
                t0 = now_ms()
                start_at = t0 + scaled(INTRO_MS)
                end_at = start_at + scaled(ALL_GAMES[gid] * 1000)
                self.current = {
                    "game": gid,
                    "index": i,
                    "level": self.level if self.mode in ("edu", "music") else "",
                    "song": self.song_seq[i] if self.mode == "music" and i < len(self.song_seq) else "",
                    "seed": random.randint(1, 2_000_000_000),
                    "introAt": t0,
                    "startAt": start_at,
                    "endAt": end_at,
                    "resultEnd": 0,
                }
                self.phase = "intro"
                await self.broadcast_state()
                await self.sleep_until(start_at)

                self.phase = "play"
                await self.broadcast_state()
                while True:
                    # 음악관: 곡이 끝나면(끝난 뒤 3초) 남은 시간을 기다리지 않고 끝내요 (cutAt)
                    cut_at = self.current.get("cutAt") or end_at
                    if now_ms() >= cut_at + scaled(GRACE_MS):
                        break
                    await asyncio.sleep(0.2)
                    if self.live_dirty:
                        self.live_dirty = False
                        await self.broadcast_live()
                    if now_ms() >= cut_at and self.all_finished():
                        break
                await self.broadcast_live()

                self.compute_result()
                self.phase = "result"
                self.current["resultEnd"] = now_ms() + scaled(RESULT_MS)
                await self.broadcast_state()
                await self.sleep_until(self.current["resultEnd"])

            self.phase = "final"
            self.current = {}
            await self.broadcast_state()
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("게임 진행 중 오류")
            self.phase = "lobby"
            await self.broadcast_state()

    async def sleep_until(self, t_ms: int) -> None:
        while True:
            left = t_ms - now_ms()
            if left <= 0:
                return
            await asyncio.sleep(min(left / 1000, 0.25))

    def active_players(self) -> List[Player]:
        return [p for p in self.players.values() if p.active_from <= self.index]

    def all_finished(self) -> bool:
        return all(p.finished or not p.connected for p in self.active_players())

    async def broadcast_live(self) -> None:
        vals = {p.pid: [p.game_score, p.live_value] for p in self.active_players()}
        await self.broadcast({"t": "live", "g": self.index, "vals": vals, "now": now_ms()})

    def apply_tug_bonus(self, active: List[Player]) -> None:
        """줄다리기: 팀은 순서대로 번갈아 나누고, 팀 힘은 '실제로 하고 있는 사람'의 평균 당김 수.
        이긴 팀 모두 +300 (모든 기기에서 같은 결과가 나오게 서버가 판정)."""
        order = sorted(active, key=lambda p: p.order)
        team_a = order[0::2]
        team_b = order[1::2]

        def power(team: List[Player]) -> float:
            members = [p for p in team if p.connected or p.live_value > 0]
            if not members:
                return 0.0
            return sum(p.live_value for p in members) / len(members)

        a = power(team_a)
        if team_b:
            b = power(team_b)
        else:
            b = 6.3 * ALL_GAMES["tug"] * TIME_SCALE  # 혼자일 때는 로봇과 겨뤄요
        if abs(a - b) < 0.5:
            return
        for p in team_a if a > b else team_b:
            p.game_score += TUG_BONUS
            p.played = True

    def compute_result(self) -> None:
        active = self.active_players()
        prev_rank = {s["pid"]: s["rank"] for s in self.standings}
        if self.sequence[self.index] == "tug":
            self.apply_tug_bonus(active)

        ordered = sorted(active, key=lambda p: (-p.game_score, p.order))
        rows = []
        rank = 0
        last_score = None
        for pos, p in enumerate(ordered):
            if p.game_score != last_score:
                rank = pos + 1
                last_score = p.game_score
            if not p.played and p.game_score == 0:
                pts = 0
            else:
                pts = RANK_POINTS[min(rank, len(RANK_POINTS)) - 1]
            p.total += pts
            row = {"pid": p.pid, "score": p.game_score, "rank": rank, "points": pts, "played": p.played}
            # 기록실: 이번 주 Top 10 에 들면 바로 등록 (이름·한마디는 결과 화면에서 고칠 수 있어요)
            if RECORDS_ON and p.played and p.game_score > 0:
                board, detail = self.record_board()
                got = STORE.submit(board, p.game_score, p.name, p.animal, p.pid, detail) if board else None
                if got:
                    row["rec"] = {"board": board, "rank": got[0], "id": got[1]["id"]}
            rows.append(row)

        everyone = sorted(self.players.values(), key=lambda p: (-p.total, p.order))
        standings = []
        rank = 0
        last_total = None
        for pos, p in enumerate(everyone):
            if p.total != last_total:
                rank = pos + 1
                last_total = p.total
            before = prev_rank.get(p.pid)
            move = 0 if before is None else before - rank
            standings.append({"pid": p.pid, "total": p.total, "rank": rank, "move": move})
        self.standings = standings
        self.last_result = {"index": self.index, "game": self.sequence[self.index], "rows": rows}

    def record_board(self) -> Tuple[str, str]:
        """이번 판 기록이 들어갈 기록판 이름: 오락실=게임, 과학관=게임:난이도, 음악관=music:곡"""
        gid = self.sequence[self.index]
        lv = self.current.get("level") or ""
        if self.mode == "music" and gid == "music":
            return f"music:{self.current.get('song') or ''}", lv
        if gid in EDU_GAMES:
            return f"{gid}:{lv or 'm'}", ""
        return gid, ""

    async def back_to_lobby(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
        self.task = None
        self.phase = "lobby"
        self.index = -1
        self.current = {}
        self.sequence = []
        self.bsess = None
        self.csess = None
        self.cengine = None
        if self.ctask and not self.ctask.done():
            self.ctask.cancel()
        self.ctask = None
        for p in self.players.values():
            p.ready = False
            p.active_from = 0
        await self.broadcast_state()


rooms: Dict[str, Room] = {}


def new_code() -> str:
    for _ in range(1000):
        code = f"{random.randint(1000, 9999)}"
        if code not in rooms:
            return code
    raise RuntimeError("방 코드를 만들 수 없어요")


async def handle_board(room: "Room", player: "Player", msg: dict, reply, is_host: bool) -> None:
    """보드게임관 메시지 — 서버는 차례와 수 목록만 지켜요"""
    t = msg.get("t")
    bs = room.bsess
    seats = bs["seats"]
    try:
        n = int(msg.get("n", -1))
    except (TypeError, ValueError):
        n = -1
    my_seats = [i for i, s in enumerate(seats) if s == player.pid]
    if t == "bmove" and bs["status"] == "play":
        turn = bs["turn"]
        owner = seats[turn] if turn < len(seats) else ""
        if n != len(bs["moves"]) or not (owner == player.pid or (owner == "ai" and BG.is_driver(room, player))):
            await reply({"t": "bsync"})
            return
        m = msg.get("m")
        if len(json.dumps(m)) > 400:
            return
        bs["moves"].append({"m": m, "s": turn})
        nxt = msg.get("next")
        bs["turn"] = nxt if isinstance(nxt, int) and 0 <= nxt < len(seats) else (turn + 1) % len(seats)
        await room.broadcast_state()
    elif t == "bend" and bs["status"] == "play":
        if n != len(bs["moves"]) or not (my_seats or is_host):
            return
        try:
            winner = int(msg.get("winner", -1))
        except (TypeError, ValueError):
            winner = -1
        await finish_board(room, winner if -1 <= winner < len(seats) else -1, str(msg.get("reason") or "")[:20])
    elif t == "bresign" and bs["status"] == "play" and my_seats:
        loser = my_seats[0]
        others = [i for i in range(len(seats)) if i != loser]
        await finish_board(room, others[0] if len(others) == 1 else -1, "resign")
    elif t == "bundo" and bs["status"] == "play" and bs.get("vs") == "ai" and my_seats:
        try:
            k = int(msg.get("to", -1))
            seat = int(msg.get("turn", my_seats[0]))
        except (TypeError, ValueError):
            return
        if 0 <= k < len(bs["moves"]) and seat in my_seats:
            del bs["moves"][k:]
            bs["turn"] = seat
            bs["undos"] = bs.get("undos", 0) + 1
            await room.broadcast_state()
    elif t == "bhint" and bs["status"] == "play" and my_seats:
        bs["hints"] = bs.get("hints", 0) + 1
        await room.broadcast_state()
    elif t == "brematch" and is_host and bs["status"] == "over":
        # 한 판 더: 자리(흑·백)를 바꿔서
        room.board["seats"] = list(reversed(bs["seats"])) if len(bs["seats"]) == 2 else bs["seats"][1:] + bs["seats"][:1]
        seats2 = BG.resolve_seats(room, BOARD_CFG)
        if not seats2:
            await reply({"t": "error", "code": "no_players", "msg": "같이 할 사람이 더 필요해요"})
            return
        room.bsess = BG.new_session(room, BOARD_CFG, seats2)
        await room.broadcast_state()


async def push_card(room: "Room", only: Optional["Player"] = None) -> None:
    """table 카드게임: 각자에게 자기 패가 보이는 화면 정보를 보내요"""
    eng = room.cengine
    cs = room.csess
    if not eng or not cs or cs.get("kind") != "table":
        return
    targets = [only] if only else [p for p in list(room.players.values()) if p.ws is not None]
    sends = []
    for p in targets:
        seat = cs["seats"].index(p.pid) if p.pid in cs["seats"] else None
        try:
            v = eng.view(seat)
        except Exception:
            log.exception("카드 화면 만들기 오류")
            continue
        sends.append(p.send({"t": "cview", "v": v, "round": cs["round"]}))
    if sends:
        await asyncio.gather(*sends)


def start_table_loop(room: "Room") -> None:
    """table 카드게임: AI 차례 두기 · 시간 초과 · 저절로 다음 판"""
    if room.ctask and not room.ctask.done():
        room.ctask.cancel()
    eng = room.cengine

    def sig():
        # 모두에게 보이는 화면이 바뀌었나 (바뀌었으면 다시 보내요)
        try:
            v = eng.view(None)
            v.pop("deadline", None)
            return json.dumps(v, sort_keys=True, default=str)
        except Exception:
            return str(time.time())

    async def run() -> None:
        try:
            while room.cengine is eng and room.csess and room.csess["status"] == "play":
                before = sig()
                try:
                    eng.step()
                except Exception:
                    log.exception("카드게임 진행 오류")
                if eng.over:
                    await finish_table(room)
                    return
                if sig() != before:
                    await push_card(room)
                a = eng.actor()
                seats = room.csess["seats"]
                if a >= 0 and seats[a] == "ai":
                    await asyncio.sleep(eng.ai_delay(a))
                    if room.cengine is not eng or eng.actor() != a:
                        continue
                    try:
                        err = eng.act(a, eng.ai_action(a))
                    except Exception:
                        log.exception("카드게임 AI 오류")
                        err = "ai"
                    if err:
                        eng.act(a, eng.timeout_action(a))
                    await push_card(room)
                    continue
                if a >= 0 and getattr(eng, "deadline", 0) and time.time() > eng.deadline:
                    eng.act(a, eng.timeout_action(a))
                    await push_card(room)
                    continue
                await asyncio.sleep(0.15)
        except asyncio.CancelledError:
            pass
    room.ctask = asyncio.ensure_future(run())


async def finish_table(room: "Room") -> None:
    cs = room.csess
    eng = room.cengine
    if not cs or cs["status"] != "play":
        return
    res = eng.result()
    cs["status"] = "over"
    out = {"winner": res.get("winner", -1), "rank": res.get("rank", []), "at": now_ms()}
    rec = CG.table_record(cs, res) if RECORDS_ON else None
    if rec:
        p = room.players.get(rec["pid"])
        if p:
            got = STORE.submit(cs["game"], rec["score"], p.name, p.animal, p.pid, rec["detail"])
            if got:
                out["rec"] = {"board": cs["game"], "rank": got[0], "id": got[1]["id"], "pid": p.pid, "score": rec["score"]}
        out["score"] = rec["score"]
    cs["result"] = out
    log.info("[%s] 카드게임 끝 %s 승자=%s", room.code, cs["game"], out["winner"])
    await room.broadcast_state()
    await push_card(room)


async def handle_card(room: "Room", player: "Player", msg: dict, reply, is_host: bool) -> None:
    """카드게임관 메시지"""
    t = msg.get("t")
    cs = room.csess
    if cs["kind"] == "table":
        eng = room.cengine
        if t == "cact" and cs["status"] == "play" and eng:
            if player.pid not in cs["seats"]:
                return
            seat = cs["seats"].index(player.pid)
            a = msg.get("a")
            if not isinstance(a, dict) or len(json.dumps(a)) > getattr(eng, "MAX_ACT", 300):
                return
            try:
                err = eng.act(seat, a)
            except Exception:
                log.exception("카드게임 수 오류")
                err = "잠깐 문제가 생겼어요"
            if err:
                await reply({"t": "error", "code": "card", "msg": err})
                await push_card(room, player)
                return
            await push_card(room)
            if eng.over:
                await finish_table(room)
        elif t == "crematch" and is_host and cs["status"] == "over":
            seats = cs["seats"][1:] + cs["seats"][:1]
            seats = [s for s in seats if s == "ai" or (room.players.get(s) and room.players[s].connected)]
            if len([s for s in seats if s != "ai"]) < 1 or len(seats) < CARD_CFG.players(cs["game"])[0]:
                await reply({"t": "error", "code": "no_players", "msg": "같이 할 사람이 더 필요해요"})
                return
            room.card["seats"] = seats
            room.csess, room.cengine = CG.new_table(room, CARD_CFG, seats, CARD_ENGINES)
            start_table_loop(room)
            await room.broadcast_state()
            await push_card(room)
        elif t == "cend" and is_host and cs["status"] == "play":
            room.cengine.over = True
            await finish_table(room)
        return
    if cs["kind"] == "race":
        if t == "cprog":
            pr = CG.race_progress(cs, player.pid, msg)
            if pr and RECORDS_ON and cs["game"] == "freecell":
                rec = CG.freecell_record(pr["ms"], pr["m"], cs["deal"])
                got = STORE.submit("freecell", rec["score"], player.name, player.animal, player.pid, rec["detail"])
                if got:
                    pr["rec"] = {"board": "freecell", "rank": got[0], "id": got[1]["id"], "score": rec["score"]}
            if cs["status"] == "play" and CG.race_all_done(cs, [p.pid for p in room.connected_players()]):
                await finish_race(room)
            else:
                await room.broadcast_state()
        elif t == "cend" and is_host and cs["status"] == "play":
            await finish_race(room)
        elif t == "crematch" and is_host and cs["status"] == "over":
            room.csess = CG.new_race(room, CARD_CFG)
            start_card_timer(room)
            await room.broadcast_state()


async def finish_race(room: "Room") -> None:
    cs = room.csess
    if not cs or cs["status"] != "play":
        return
    cs["status"] = "over"
    cs["result"] = {"rank": CG.race_ranking(cs), "at": now_ms()}
    log.info("[%s] 카드게임 끝 %s (%s번 판)", room.code, cs["game"], cs.get("deal"))
    await room.broadcast_state()


def start_card_timer(room: "Room") -> None:
    """프리첼: 제한 시간이 지나면 끝내요"""
    if room.ctask and not room.ctask.done():
        room.ctask.cancel()

    async def run() -> None:
        try:
            while room.csess and room.csess["status"] == "play":
                if now_ms() >= room.csess.get("limitAt", 1 << 60):
                    await finish_race(room)
                    return
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
    room.ctask = asyncio.ensure_future(run())


async def finish_board(room: "Room", winner: int, reason: str) -> None:
    bs = room.bsess
    bs["status"] = "over"
    res = {"winner": winner, "reason": reason, "at": now_ms()}
    rec = BG.board_record(bs, winner) if RECORDS_ON else None
    if rec:
        p = room.players.get(rec["pid"])
        if p:
            got = STORE.submit(bs["game"], rec["score"], p.name, p.animal, p.pid, rec["detail"])
            if got:
                res["rec"] = {"board": bs["game"], "rank": got[0], "id": got[1]["id"], "pid": p.pid, "score": rec["score"]}
    res["score"] = rec["score"] if rec else 0
    bs["result"] = res
    log.info("[%s] 보드게임 끝 %s 승자=%s (%s)", room.code, bs["game"], winner, reason)
    await room.broadcast_state()


async def handover_host_later(room: Room, pid: str) -> None:
    await asyncio.sleep(HOST_HANDOVER_SEC)
    if room.host_pid != pid:
        return
    p = room.players.get(pid)
    if p and p.connected:
        return
    candidates = sorted(room.connected_players(), key=lambda x: x.order)
    if candidates:
        room.host_pid = candidates[0].pid
        log.info("[%s] 방장 변경 → %s", room.code, candidates[0].name)
        await room.broadcast_state()


async def cleanup_rooms() -> None:
    while True:
        await asyncio.sleep(60)
        t = now_ms()
        for code, room in list(rooms.items()):
            if room.connected_players():
                room.empty_since = t
                continue
            if t - room.empty_since > ROOM_IDLE_SEC * 1000:
                if room.task and not room.task.done():
                    room.task.cancel()
                rooms.pop(code, None)
                log.info("[%s] 빈 방 정리", code)


def attach(room: Room, player: Player, ws: WebSocketConn) -> None:
    player.ws = ws
    player.connected = True
    player.disconnected_at = 0
    room.empty_since = now_ms()


# =====================================================================
#  웹소켓 메시지 처리
# =====================================================================
async def ws_session(ws: WebSocketConn) -> None:
    room: Optional[Room] = None
    player: Optional[Player] = None

    async def reply(payload: dict) -> None:
        try:
            await ws.send_text(json.dumps(payload, ensure_ascii=False))
        except WSClosed:
            pass

    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=WS_IDLE_SEC)
            except asyncio.TimeoutError:
                break
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(msg, dict):
                continue
            t = msg.get("t")

            if t == "ping":
                await reply({"t": "pong", "c": msg.get("c"), "s": now_ms()})
                if player is not None and room is not None:
                    try:
                        rtt = max(0, min(9999, int(msg.get("rtt") or 0)))
                    except (TypeError, ValueError):
                        rtt = 0
                    if abs(rtt - player.rtt) >= 15 and room.phase == "lobby":
                        player.rtt = rtt
                        await room.broadcast_state()
                    else:
                        player.rtt = rtt
                continue

            # ---------- 입장 전 ----------
            if player is None:
                if t == "join":
                    code = str(msg.get("room") or "").strip()
                    animal = str(msg.get("animal") or "")
                    name = clean_name(msg.get("name"))
                    device = str(msg.get("device") or "")[:10]
                    if animal not in ANIMALS:
                        await reply({"t": "error", "code": "bad_animal", "msg": "캐릭터를 골라주세요"})
                        continue
                    if code:
                        target = rooms.get(code)
                        if target is None:
                            await reply({"t": "error", "code": "no_room", "msg": "방을 찾을 수 없어요"})
                            continue
                    else:
                        target = Room(new_code())
                        rooms[target.code] = target
                        log.info("[%s] 새 방", target.code)
                    if len(target.players) >= MAX_PLAYERS:
                        await reply({"t": "error", "code": "full", "msg": f"방이 꽉 찼어요 (최대 {MAX_PLAYERS}명)"})
                        continue
                    if animal in target.taken_animals():
                        await reply({"t": "error", "code": "animal_taken", "msg": "다른 가족이 먼저 고른 캐릭터예요",
                                     "taken": target.taken_animals()})
                        continue
                    room = target
                    room.join_counter += 1
                    player = Player(secrets.token_hex(6), name, animal, device, room.join_counter)
                    if room.phase in ("intro", "play", "result"):
                        player.active_from = room.index + 1
                    room.players[player.pid] = player
                    if not room.host_pid:
                        room.host_pid = player.pid
                    attach(room, player, ws)
                    log.info("[%s] 입장: %s (%s)", room.code, player.name, player.animal)
                    await reply({"t": "joined", "pid": player.pid, "token": player.token, "code": room.code})
                    await room.broadcast_state()
                    await room.broadcast({"t": "event", "kind": "join", "pid": player.pid})
                    if room.phase == "card":
                        await push_card(room, player)
                elif t == "rejoin":
                    code = str(msg.get("room") or "")
                    r = rooms.get(code)
                    p = r.players.get(str(msg.get("pid") or "")) if r else None
                    if not r or not p or not secrets.compare_digest(p.token, str(msg.get("token") or "")):
                        await reply({"t": "error", "code": "rejoin_failed", "msg": "다시 입장해 주세요"})
                        continue
                    room, player = r, p
                    old = player.ws
                    attach(room, player, ws)
                    if old is not None and old is not ws:
                        await old.close()
                    log.info("[%s] 재접속: %s", room.code, player.name)
                    await reply({"t": "joined", "pid": player.pid, "token": player.token, "code": room.code})
                    await room.broadcast_state()
                    if room.phase == "card":
                        await push_card(room, player)
                    if room.phase == "play":
                        await room.broadcast_live()
                continue

            # ---------- 입장 후 ----------
            if room is None:
                continue
            is_host = player.pid == room.host_pid

            if t == "ready" and room.phase == "lobby":
                player.ready = bool(msg.get("v"))
                await room.broadcast_state()

            elif t == "profile" and room.phase == "lobby":
                animal = str(msg.get("animal") or player.animal)
                if animal not in ANIMALS or animal in room.taken_animals(player.pid):
                    await reply({"t": "error", "code": "animal_taken", "msg": "다른 가족이 먼저 고른 캐릭터예요",
                                 "taken": room.taken_animals(player.pid)})
                    continue
                player.animal = animal
                player.name = clean_name(msg.get("name") or player.name)
                await room.broadcast_state()

            elif t == "settings" and is_host and room.phase == "lobby":
                changed = False
                if "length" in msg:
                    try:
                        length = int(msg.get("length"))
                    except (TypeError, ValueError):
                        length = 0
                    if length in (3, 5, 10):
                        room.length = length
                        changed = True
                if msg.get("mode") in ("arcade", "edu", "music", "board", "card", "party"):
                    room.mode = msg["mode"]
                    changed = True
                if msg.get("level") in LEVELS:
                    room.level = msg["level"]
                    changed = True
                if isinstance(msg.get("picks"), list):
                    picks = [str(g) for g in msg["picks"] if str(g) in EDU_PICKABLE]
                    room.picks = picks[:MAX_PICKS]
                    changed = True
                if isinstance(msg.get("songs"), list):
                    songs = [str(g) for g in msg["songs"] if str(g) in MUSIC_SONGS]
                    room.songs = songs[:MAX_PICKS]
                    changed = True
                if msg.get("board") in BOARD_CFG.games:
                    room.board["game"] = msg["board"]
                    room.board["seats"] = []
                    changed = True
                if msg.get("bvs") in ("ai", "pvp"):
                    room.board["vs"] = msg["bvs"]
                    changed = True
                if msg.get("bai") in BG.AI_LEVELS:
                    room.board["ai"] = msg["bai"]
                    changed = True
                if isinstance(msg.get("bseats"), list):
                    ok = {p.pid for p in room.players.values()} | {"ai", ""}
                    room.board["seats"] = [str(s) for s in msg["bseats"][:8] if str(s) in ok]
                    changed = True
                if msg.get("card") in CARD_CFG.games:
                    room.card["game"] = msg["card"]
                    room.card["seats"] = []
                    changed = True
                if msg.get("cai") in CG.AI_LEVELS:
                    room.card["ai"] = msg["cai"]
                    changed = True
                if isinstance(msg.get("cseats"), list):
                    ok = {p.pid for p in room.players.values()} | {"ai"}
                    room.card["seats"] = [str(s) for s in msg["cseats"][:8] if str(s) in ok]
                    changed = True
                if isinstance(msg.get("copts"), dict):
                    # 게임별 설정 (games.json 의 "options" 에 적힌 값만)
                    got = CARD_CFG.clean_opts(room.card.get("game"), msg["copts"])
                    if got:
                        room.card.setdefault("opts", {}).update(got)
                        changed = True
                # 카드게임관 ↔ 놀이마당: 고른 게임이 그 관 게임이 되게
                if room.mode in ("card", "party") and CARD_CFG.hall(room.card.get("game")) != room.mode:
                    room.card["game"] = CARD_CFG.first(room.mode)
                    room.card["seats"] = []
                    changed = True
                # 특상(x)은 음악관에만 있어요 → 다른 모드에서는 고등으로
                if room.mode != "music" and room.level == "x":
                    room.level = "h"
                if changed:
                    await room.broadcast_state()

            elif t == "start" and is_host and room.phase == "lobby":
                if not room.connected_players():
                    continue
                if room.mode == "edu" and not room.picks:
                    await reply({"t": "error", "code": "no_picks", "msg": "과학관 게임을 하나 이상 골라주세요"})
                    continue
                if room.mode == "music" and not room.songs:
                    await reply({"t": "error", "code": "no_picks", "msg": "연주할 곡을 하나 이상 골라주세요"})
                    continue
                if room.mode == "board":
                    seats = BG.resolve_seats(room, BOARD_CFG)
                    if not seats:
                        await reply({"t": "error", "code": "no_players", "msg": "같이 할 사람이 더 필요해요 (AI와 대결도 할 수 있어요)"})
                        continue
                    room.bsess = BG.new_session(room, BOARD_CFG, seats)
                    room.phase = "board"
                    for p in room.players.values():
                        p.ready = False
                    log.info("[%s] 보드게임 시작 %s %s", room.code, room.bsess["game"], seats)
                    await room.broadcast_state()
                    continue
                if room.mode in ("card", "party"):
                    gid = room.card.get("game")
                    if CARD_CFG.kind(gid) == "race":
                        room.csess = CG.new_race(room, CARD_CFG)
                        room.cengine = None
                        start_card_timer(room)
                    else:
                        seats = CG.table_seats(room, CARD_CFG)
                        if not seats or gid not in CARD_ENGINES:
                            await reply({"t": "error", "code": "no_players", "msg": "같이 할 사람이 더 필요해요 (AI 를 넣을 수 있어요)"})
                            continue
                        room.csess, room.cengine = CG.new_table(room, CARD_CFG, seats, CARD_ENGINES)
                        start_table_loop(room)
                    room.phase = "card"
                    for p in room.players.values():
                        p.ready = False
                    log.info("[%s] 카드게임 시작 %s", room.code, gid)
                    await room.broadcast_state()
                    await push_card(room)
                    continue
                log.info("[%s] 게임 시작 (%s)", room.code,
                         "과학관 " + ",".join(room.picks) if room.mode == "edu"
                         else "음악관 " + ",".join(room.songs) if room.mode == "music" else f"{room.length}게임")
                room.start_match()

            elif t in ("prog", "final") and room.phase in ("play", "intro"):
                if msg.get("g") != room.index or player.active_from > room.index:
                    continue
                try:
                    score = max(0, min(10_000_000, int(msg.get("score") or 0)))
                    value = float(msg.get("v") or 0)
                except (TypeError, ValueError):
                    continue
                player.game_score = score
                player.live_value = value
                player.played = True
                if t == "final":
                    player.finished = True
                room.live_dirty = True

            elif t == "cut" and room.phase == "play" and room.mode == "music":
                # 곡이 끝나는 시각(모든 기기가 같은 악보라 값이 같아요). 처음 받은 값만 써요.
                cur = room.current
                try:
                    at = int(msg.get("at") or 0)
                except (TypeError, ValueError):
                    continue
                if (msg.get("g") == room.index and cur and "cutAt" not in cur
                        and cur["startAt"] + scaled(20_000) <= at < cur["endAt"]):
                    cur["cutAt"] = at
                    await room.broadcast_state()

            elif t == "record_edit":
                saved = STORE.edit(str(msg.get("id") or ""), player.pid, msg.get("name"), msg.get("comment"))
                await reply({"t": "record_saved", "ok": bool(saved), "entry": saved})

            elif t in ("bmove", "bend", "bundo", "bhint", "bresign", "brematch") and room.phase == "board" and room.bsess:
                await handle_board(room, player, msg, reply, is_host)

            elif t in ("cprog", "cact", "cend", "crematch") and room.phase == "card" and room.csess:
                await handle_card(room, player, msg, reply, is_host)

            elif t == "again" and is_host and room.phase in ("final", "result", "intro", "play", "board", "card"):
                await room.back_to_lobby()

            elif t == "kick" and is_host:
                target = room.players.get(str(msg.get("pid") or ""))
                if target and target.pid != player.pid and room.phase == "lobby":
                    room.players.pop(target.pid, None)
                    await target.send({"t": "kicked"})
                    if target.ws is not None:
                        await target.ws.close()
                        target.ws = None
                    await room.broadcast_state()

            elif t == "leave":
                room.players.pop(player.pid, None)
                if room.host_pid == player.pid:
                    rest = room.ordered_players()
                    room.host_pid = rest[0].pid if rest else ""
                if not room.players:
                    if room.task and not room.task.done():
                        room.task.cancel()
                    rooms.pop(room.code, None)
                else:
                    await room.broadcast_state()
                player.ws = None
                player = None
                room = None

    except WSClosed:
        pass
    except Exception:
        log.exception("웹소켓 오류")
    finally:
        await ws.close()
        if player is not None and room is not None and player.ws is ws:
            player.ws = None
            player.connected = False
            player.disconnected_at = now_ms()
            log.info("[%s] 연결 끊김: %s", room.code, player.name)
            try:
                await room.broadcast_state()
            except Exception:
                pass
            if player.pid == room.host_pid:
                asyncio.ensure_future(handover_host_later(room, player.pid))


# =====================================================================
#  HTTP 처리
# =====================================================================
REASONS = {200: "OK", 101: "Switching Protocols", 304: "Not Modified", 400: "Bad Request",
           404: "Not Found", 405: "Method Not Allowed", 500: "Internal Server Error"}


async def send_response(writer: asyncio.StreamWriter, status: int, body: bytes,
                        ctype: str = "text/plain; charset=utf-8", head_only: bool = False,
                        extra: Optional[Dict[str, str]] = None) -> None:
    headers = {
        "Content-Type": ctype,
        "Content-Length": str(len(body)),
        "Connection": "close",
        "X-Content-Type-Options": "nosniff",
    }
    if extra:
        headers.update(extra)
    lines = [f"HTTP/1.1 {status} {REASONS.get(status, 'OK')}"] + [f"{k}: {v}" for k, v in headers.items()]
    writer.write(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1") + (b"" if head_only else body))
    await writer.drain()


async def send_json(writer, data: dict, head_only=False) -> None:
    await send_response(writer, 200, json.dumps(data, ensure_ascii=False).encode("utf-8"),
                        "application/json; charset=utf-8", head_only, {"Cache-Control": "no-store"})


def game_script_paths() -> List[str]:
    """index.html 에 넣을 스크립트 순서: 공통 → 게임들(games.json 순서) → app.js"""
    sc = MANIFEST.get("scripts", {})
    games: List[str] = []
    for group, items in MANIFEST["games"].items():
        for g in items:
            if group == "card":
                d = g.get("dir", g["id"])
                games += [f"js/cards/{d}/{f}.js" for f in g.get("files", ["view"])]
            elif group == "party":
                d = g.get("dir", g["id"])
                games += [f"js/party/{d}/{f}.js" for f in g.get("files", ["view"])]
            elif group == "board":
                # 보드게임: 규칙·화면·따라하기 파일 (AI 는 워커가 따로 불러요)
                # "dir" 이 있으면 그 폴더를 같이 써요 (바둑 9줄·13줄처럼 판 크기만 다른 게임)
                d = g.get("dir", g["id"])
                games += [f"js/board/{d}/{f}.js" for f in g.get("files", ["rules", "view"])]
            else:
                games.append(f"js/games/{group}/{g['id']}.js")
    out = list(sc.get("before", [])) + games + list(sc.get("after", []))
    return list(dict.fromkeys(out))   # 같은 파일은 한 번만


def worker_script_paths() -> List[str]:
    """AI 워커가 불러오는 파일 (버전을 붙여서 알려줘요)"""
    out = ["js/board/worker.js", "js/board/aikit.js"]
    for g in MANIFEST["games"].get("board", []):
        if g.get("ai"):
            d = g.get("dir", g["id"])
            out += [f"js/board/{d}/rules.js", f"js/board/{d}/ai.js"]
    return list(dict.fromkeys(out))


_index_cache: Dict[str, object] = {"key": None, "body": b""}


def file_version(rel: str) -> str:
    """파일 내용으로 만든 짧은 버전 (내용이 바뀌면 주소가 바뀌어서 폰이 새 파일을 받아요)"""
    try:
        return hashlib.md5((STATIC_DIR / rel).read_bytes()).hexdigest()[:8]
    except OSError:
        log.warning("파일이 없어요: static/%s", rel)
        return "0"


def render_index() -> bytes:
    """index.html 의 <!--@scripts--> 와 ?v=@css 를 채워요. 파일이 바뀌었을 때만 다시 만들어요."""
    paths = game_script_paths()
    wpaths = worker_script_paths()
    watch = ["index.html", "games.json", "css/style.css"] + paths + wpaths
    key = []
    for rel in watch:
        try:
            key.append((STATIC_DIR / rel).stat().st_mtime_ns)
        except OSError:
            key.append(0)
    key = tuple(key)
    if _index_cache["key"] == key:
        return _index_cache["body"]  # type: ignore[return-value]
    html = (STATIC_DIR / "index.html").read_text("utf-8")
    manifest_js = json.dumps({"games": MANIFEST["games"], "songs": MANIFEST["songs"]}, ensure_ascii=False)
    versions_js = json.dumps({p: file_version(p) for p in wpaths})
    tags = [f"<script>window.ARICHAE_MANIFEST = {manifest_js}; window.ARICHAE_VERSIONS = {versions_js};</script>"]
    tags += [f'<script src="static/{p}?v={file_version(p)}"></script>' for p in paths]
    html = html.replace("<!--@scripts-->", "\n".join(tags)).replace("?v=@css", "?v=" + file_version("css/style.css"))
    body = html.encode("utf-8")
    _index_cache["key"] = key
    _index_cache["body"] = body
    return body


async def serve_file(writer, path: Path, head_only: bool, no_cache: bool, ctype_override: str = "", immutable: bool = False) -> None:
    try:
        target = path.resolve()
        target.relative_to(STATIC_DIR)
    except (ValueError, OSError):
        await send_response(writer, 404, b"not found", head_only=head_only)
        return
    if not target.is_file():
        await send_response(writer, 404, b"not found", head_only=head_only)
        return
    ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    if ctype in ("text/javascript",):
        ctype = "application/javascript"
    if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml"):
        ctype += "; charset=utf-8"
    if ctype_override:
        ctype = ctype_override
    body = target.read_bytes()
    cache = "no-cache" if no_cache else ("public, max-age=31536000, immutable" if immutable else "public, max-age=300")
    await send_response(writer, 200, body, ctype, head_only, {"Cache-Control": cache})


async def handle_http(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    upgraded = False
    try:
        try:
            raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=15)
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, asyncio.TimeoutError, ConnectionError, OSError):
            return
        text = raw.decode("latin-1")
        lines = text.split("\r\n")
        try:
            method, target, _ver = lines[0].split(" ", 2)
        except ValueError:
            await send_response(writer, 400, b"bad request")
            return
        headers: Dict[str, str] = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        path = unquote(urlsplit(target).path)

        # --- 웹소켓 ---
        if path == "/ws":
            key = headers.get("sec-websocket-key")
            if method != "GET" or "websocket" not in headers.get("upgrade", "").lower() or not key:
                await send_response(writer, 400, b"websocket only")
                return
            accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
            writer.write((
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n").encode())
            await writer.drain()
            upgraded = True
            sock = writer.get_extra_info("socket")
            if sock is not None:
                try:
                    sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                except OSError:
                    pass
            await ws_session(WebSocketConn(reader, writer))
            return

        if method not in ("GET", "HEAD"):
            await send_response(writer, 405, b"method not allowed")
            return
        head_only = method == "HEAD"

        if path in ("/", "/index.html"):
            await send_response(writer, 200, render_index(), "text/html; charset=utf-8", head_only, {"Cache-Control": "no-cache"})
        elif path == "/api/records":
            await send_json(writer, STORE.snapshot(), head_only)
        elif path == "/api/info":
            await send_json(writer, {"lanUrl": f"http://{lan_ip()}:{PORT}", "publicUrl": PUBLIC_URL}, head_only)
        elif path.startswith("/api/room/"):
            code = path.rsplit("/", 1)[-1]
            room = rooms.get(code)
            if not room:
                await send_json(writer, {"exists": False}, head_only)
            else:
                host = room.players.get(room.host_pid)
                await send_json(writer, {
                    "exists": True,
                    "hostName": host.name if host else "",
                    "taken": room.taken_animals(),
                    "count": len(room.players),
                    "max": MAX_PLAYERS,
                    "phase": room.phase,
                }, head_only)
        elif path.startswith("/static/"):
            # 주소에 ?v=버전 이 붙은 파일은 내용이 바뀌면 주소도 바뀌니 오래 저장해도 돼요
            versioned = "v=" in (urlsplit(target).query or "")
            await serve_file(writer, STATIC_DIR / path[len("/static/"):], head_only, False, immutable=versioned)
        elif path == "/manifest.webmanifest":
            await serve_file(writer, STATIC_DIR / "manifest.webmanifest", head_only, True, "application/manifest+json; charset=utf-8")
        elif path == "/sw.js":
            # 서비스 워커는 사이트 전체(/)를 맡아야 해서 맨 위 주소로 내보내요
            await serve_file(writer, STATIC_DIR / "sw.js", head_only, True)
        elif path == "/favicon.ico":
            await send_response(writer, 404, b"", head_only=head_only)
        else:
            await send_response(writer, 404, "페이지가 없어요".encode("utf-8"), head_only=head_only)
    except (ConnectionError, OSError):
        pass
    except Exception:
        log.exception("HTTP 처리 오류")
    finally:
        if not upgraded:
            try:
                writer.close()
            except Exception:
                pass


# =====================================================================
#  시작
# =====================================================================
def print_banner() -> None:
    ip = lan_ip()
    line = "=" * 52
    print(line)
    print("  아리채 오락실 서버가 켜졌어요!")
    print(line)
    print(f"  이 기기에서:        http://localhost:{PORT}")
    print(f"  같은 와이파이 기기: http://{ip}:{PORT}")
    if PUBLIC_URL:
        print(f"  외부 접속 주소:     {PUBLIC_URL}")
    print(line)
    print("  1) 이 기기 브라우저로 위 주소에 들어가 방 만들기")
    print("  2) 대기실 '초대 링크 보내기'로 카톡 공유")
    print("  끄려면 Ctrl + C")
    print(line)
    sys.stdout.flush()


async def main() -> None:
    server = await asyncio.start_server(handle_http, host="0.0.0.0", port=PORT, limit=64 * 1024)
    asyncio.ensure_future(cleanup_rooms())
    print_banner()
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n서버를 껐어요. 다음에 또 만나요!")
    except OSError as e:
        print(f"\n서버를 켤 수 없어요: {e}")
        print(f"이미 서버가 켜져 있거나 {PORT}번 포트를 다른 프로그램이 쓰고 있어요.")
