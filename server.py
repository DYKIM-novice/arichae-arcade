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
from typing import Dict, List, Optional
from urllib.parse import unquote, urlsplit

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = (BASE_DIR / "static").resolve()

PORT = int(os.environ.get("PORT") or os.environ.get("ARICHAE_PORT") or "8000")
PUBLIC_URL = os.environ.get("ARICHAE_PUBLIC_URL", "").strip().rstrip("/")
TIME_SCALE = float(os.environ.get("ARICHAE_TIME_SCALE", "1") or "1")

MAX_PLAYERS = 8
INTRO_MS = 6000          # 미니게임 설명 + 3초 카운트다운
RESULT_MS = 8000         # 결과 발표 화면
GRACE_MS = 1500          # 플레이 종료 후 최종 점수 수신 대기
HOST_HANDOVER_SEC = 20   # 방장이 끊긴 뒤 방장 넘기기까지 대기
ROOM_IDLE_SEC = 30 * 60  # 아무도 접속 안 한 방 정리
WS_IDLE_SEC = 30         # 이 시간 동안 아무 신호가 없으면 끊긴 것으로 처리 (기기는 2초마다 신호를 보냄)
SEND_TIMEOUT_SEC = 4     # 한 기기에 보내기가 이 시간 안에 안 끝나면 그 기기만 끊어요 (방 전체가 멈추지 않게)
WS_MAX_MESSAGE = 64 * 1024

# 미니게임 ID와 플레이 시간(초)
GAMES: Dict[str, int] = {
    "blocks": 50,   # 블록 지우기
    "race": 25,     # 전력 질주
    "stop": 30,     # 딱 멈춰
    "signal": 30,   # 신호등
    "throw": 35,    # 투척왕
    "simon": 35,    # 따라 누르기
    "balloon": 30,  # 풍선 불기
    "mole": 30,     # 두더지 잡기
    "tug": 25,      # 줄다리기
    "weld": 35,     # 용접 이어붙이기
    "crane": 35,    # 크레인 낙하
    "count": 40,    # 숫자 세기
    "rhythm": 40,   # 리듬 박자
    "odd": 30,      # 가짜 찾기
    "chop": 25,     # 나무 도끼질
    "dino": 30,     # 공룡 발걸음
    "plate": 35,    # 접시 깨기
}

# 과학관(교육) 게임 — 방장이 직접 골라서 플레이
EDU_GAMES: Dict[str, int] = {
    "light": 35,     # 빛 섞기
    "paint": 35,     # 물감 섞기
    "history": 40,   # 지구 역사 순서
    "fishing": 35,   # 바다 낚시
    "space": 35,     # 행성 찾기 (우주관)
    "tree": 35,      # 진화 나무 오르기 (생명의 나무)
    "periodic": 35,  # 주기율표 빨리 고르기
}
ALL_GAMES: Dict[str, int] = {**GAMES, **EDU_GAMES}
LEVELS = ("e", "m", "h")          # 초·중·고
MAX_PICKS = 10

# 오락실 모드에서 최근에 한 게임을 기억 (서버가 켜져 있는 동안, 모든 방 공통)
LAST_PLAYED: Dict[str, float] = {}

ANIMALS = [
    "cat", "dog", "rabbit", "bear", "panda", "fox", "raccoon", "koala", "hamster", "penguin",
    "chick", "owl", "frog", "pig", "monkey", "lion", "tiger", "sheep", "mouse", "otter",
]

RANK_POINTS = [100, 80, 65, 50, 40, 30, 20, 10]

log = logging.getLogger("arichae")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


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
        self.mode = "arcade"      # arcade(오락실, 랜덤) / edu(과학관, 선택)
        self.level = "m"          # 과학관 난이도: e(초) m(중) h(고)
        self.picks: List[str] = []
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
            "sequence": self.sequence,
            "index": self.index,
            "current": self.current,
            "players": [p.public(self.host_pid) for p in self.ordered_players()],
            "lastResult": self.last_result,
            "standings": self.standings,
            "maxPlayers": MAX_PLAYERS,
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
        if self.mode == "edu":
            self.sequence = [g for g in self.picks if g in EDU_GAMES]
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
                    "level": self.level if self.mode == "edu" else "",
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
                deadline = end_at + scaled(GRACE_MS)
                while now_ms() < deadline:
                    await asyncio.sleep(0.2)
                    if self.live_dirty:
                        self.live_dirty = False
                        await self.broadcast_live()
                    if now_ms() >= end_at and self.all_finished():
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

    def compute_result(self) -> None:
        active = self.active_players()
        prev_rank = {s["pid"]: s["rank"] for s in self.standings}

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
            rows.append({"pid": p.pid, "score": p.game_score, "rank": rank, "points": pts, "played": p.played})

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

    async def back_to_lobby(self) -> None:
        if self.task and not self.task.done():
            self.task.cancel()
        self.task = None
        self.phase = "lobby"
        self.index = -1
        self.current = {}
        self.sequence = []
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
                if msg.get("mode") in ("arcade", "edu"):
                    room.mode = msg["mode"]
                    changed = True
                if msg.get("level") in LEVELS:
                    room.level = msg["level"]
                    changed = True
                if isinstance(msg.get("picks"), list):
                    picks = [str(g) for g in msg["picks"] if str(g) in EDU_GAMES]
                    room.picks = picks[:MAX_PICKS]
                    changed = True
                if changed:
                    await room.broadcast_state()

            elif t == "start" and is_host and room.phase == "lobby":
                if not room.connected_players():
                    continue
                if room.mode == "edu" and not room.picks:
                    await reply({"t": "error", "code": "no_picks", "msg": "과학관 게임을 하나 이상 골라주세요"})
                    continue
                log.info("[%s] 게임 시작 (%s)", room.code,
                         "과학관 " + ",".join(room.picks) if room.mode == "edu" else f"{room.length}게임")
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

            elif t == "again" and is_host and room.phase in ("final", "result", "intro", "play"):
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


async def serve_file(writer, path: Path, head_only: bool, no_cache: bool) -> None:
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
    if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml"):
        ctype += "; charset=utf-8"
    body = target.read_bytes()
    cache = "no-cache" if no_cache else "public, max-age=300"
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
            await serve_file(writer, STATIC_DIR / "index.html", head_only, True)
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
            await serve_file(writer, STATIC_DIR / path[len("/static/"):], head_only, False)
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
