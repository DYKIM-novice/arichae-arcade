"""아리채 오락실 · 노을언덕 포격대 (실시간 팀 포격전, 가칭) — 서버 권위 모듈

server.py 는 이 모듈에 세 가지만 넘겨요.
  - 웹소켓 메시지 중 t 가 'tk' 로 시작하는 것 → handle(ws, msg)
  - 연결이 끊기면 → on_close(ws)
  - 방 코드 중복 검사 → ROOMS (server.new_code 가 같이 봐요)

포격전 방은 rooms.pkl 에 저장하지 않아요(메모리만). 전역 MAX_PLAYERS(8)는 건드리지 않고
이 모드만 TANK_MAX = 16.
"""
import asyncio
import json
import logging
import math
import random
import secrets
import time
from typing import Callable, Dict, List, Optional

log = logging.getLogger("tank")

# ---------------------------------------------------------------- 수치 (설계서 2절 초안)
TANK_MAX = 16
TEAM_MAX = 8
MIN_PER_TEAM = 1          # 설계는 팀당 2명. 첫 동작 QA(두 브라우저 1대1)를 위해 임시로 1명 — IMPLEMENT_STATUS 참고
TICK_HZ = 15
DT = 1.0 / TICK_HZ
TICK_MS = 1000.0 / TICK_HZ
SHELL_SUB = 8             # 포탄은 틱 안에서 8번 나눠 계산
W, H = 2400, 1200
CELL = 4
GW, GH = W // CELL, H // CELL
GRAV = 600.0
COOLDOWN_MS = 5000
ROUND_MS = 300_000
COUNTDOWN_MS = 3000
INV_MS = 1500
RESULT_MS = 8000
SHELL_LIFE = 8.0
WIND_MAX = 24
WIND_EVERY_MS = 60_000
FUEL_MAX = 100.0
FUEL_USE = 25.0
FUEL_REGEN = 8.0
FUEL_IDLE_S = 1.5
SLIDE_DEG = 62.0
FALL_Y = H + 40
SEAT_KEEP_MS = 60_000
ROOM_EMPTY_MS = 60_000
HOST_HANDOVER_MS = 20_000
EMO_GAP_MS = 1000
EMO_COUNT = 8
FACE_MS = 1200

KINDS = {
    #            체력 이동  폭발 최대데미지 등판 포신범위   바퀴반폭 판정(폭,높이) 포신축 높이·길이
    "mongdol": dict(hp=130, speed=55, r=44, dmg=38, climb=50, amin=0, amax=50, half=22, bw=56, bh=30, ph=32, pl=26, pfx=2),
    "mangru": dict(hp=100, speed=80, r=32, dmg=32, climb=58, amin=15, amax=65, half=18, bw=48, bh=40, ph=42, pl=36, pfx=-6),
}
KIND_NAME = {"mongdol": "몽돌", "mangru": "망루"}

# ---------------------------------------------------------------- 맵 (map_2d_v2 구조)
PIT_L, PIT_R = 1060, 1340
PLATFORMS = [(1100, 1190, 600, 630), (1225, 1320, 640, 670)]   # x0, x1, 윗면 y, 아랫면 y
SLOTS_L = [96, 152, 208, 264, 320, 376, 432, 488]
SLOTS_R = [W - x for x in reversed(SLOTS_L)]


def surface_y(x: float) -> Optional[float]:
    """처음 지형의 윗면 y (구덩이면 None). 양쪽 고지 → 풀 내리막(굴곡) → 구덩이 가장자리 평지. 좌우 대칭."""
    if PIT_L <= x < PIT_R:
        return None
    m = x if x < PIT_L else W - x
    if m < 520:
        return 380.0
    if m < 960:
        t = (m - 520) / 440.0
        return 380 + 340 * t + 12 * math.sin(t * math.pi * 3)   # 약 38° 내리막 + 풀 언덕 굴곡
    return 720.0


def build_mask() -> bytearray:
    m = bytearray(GW * GH)
    for gx in range(GW):
        cx = gx * CELL + CELL / 2
        s = surface_y(cx)
        if s is not None:
            start = max(0, int(math.ceil((s - CELL / 2) / CELL)))
            for gy in range(start, GH):
                m[gy * GW + gx] = 1
        for (x0, x1, y0, y1) in PLATFORMS:
            if x0 <= cx < x1:
                # 발판 아래쪽은 둥글게 깎은 모양
                edge = min(cx - x0, x1 - cx)
                bot = y1 - max(0, 10 - edge) * 0.8
                for gy in range(int(y0 // CELL), int(math.ceil(bot / CELL))):
                    m[gy * GW + gx] = 1
    return m


BASE_MASK = build_mask()


def mask_rle(m: bytearray) -> List[int]:
    """행 우선 실행 길이 (0부터 시작해 번갈아)."""
    out: List[int] = []
    cur = 0
    run = 0
    for v in m:
        if v == cur:
            run += 1
        else:
            out.append(run)
            cur = v
            run = 1
    out.append(run)
    return out


BASE_RLE = mask_rle(BASE_MASK)


def solid(m: bytearray, x: float, y: float) -> bool:
    gx = int(x // CELL)
    gy = int(y // CELL)
    if gx < 0 or gx >= GW or gy < 0 or gy >= GH:
        return False
    return m[gy * GW + gx] == 1


WALL = -1.0


def surface(m: bytearray, x: float, y: float, up: float = 8, down: float = 12) -> Optional[float]:
    """x 에서 y 근처 지면 윗면. 위로 up px 안, 아래로 down px 안에서 찾음. 너무 높으면 WALL, 없으면 None."""
    gx = int(x // CELL)
    if gx < 0 or gx >= GW:
        return None
    c = int(round(y / CELL))

    def sc(cy):
        return 0 <= cy < GH and m[cy * GW + gx] == 1

    if sc(c):
        n = 0
        while sc(c - 1):
            c -= 1
            n += 1
            if n * CELL > up:
                return WALL
        return float(c * CELL)
    n = 0
    while not sc(c):
        c += 1
        n += 1
        if n * CELL > down or c >= GH:
            return None
    return float(c * CELL)


def carve(m: bytearray, x: int, y: int, r: int) -> None:
    """클라이언트와 똑같은 규칙: 칸 가운데가 원 안이면 지움."""
    r2 = r * r
    gx0 = max(0, (x - r) // CELL)
    gx1 = min(GW - 1, (x + r) // CELL)
    gy0 = max(0, (y - r) // CELL)
    gy1 = min(GH - 1, (y + r) // CELL)
    for gy in range(gy0, gy1 + 1):
        cy = gy * CELL + 2 - y
        row = gy * GW
        for gx in range(gx0, gx1 + 1):
            cx = gx * CELL + 2 - x
            if cx * cx + cy * cy <= r2:
                m[row + gx] = 0


def check_slots() -> bool:
    ok = True
    for side, xs in (("L", SLOTS_L), ("R", SLOTS_R)):
        good = 0
        for x in xs:
            s = surface(BASE_MASK, x, 380, 40, 400)
            if s is None or s == WALL:
                continue
            tilts = []
            for k in KINDS.values():
                a = surface(BASE_MASK, x - k["half"], s, 20, 20)
                b = surface(BASE_MASK, x + k["half"], s, 20, 20)
                if a in (None, WALL) or b in (None, WALL):
                    tilts.append(90)
                else:
                    tilts.append(abs(math.degrees(math.atan2(a - b, 2 * k["half"]))))
            far_pit = min(abs(x - PIT_L), abs(x - PIT_R)) >= 500
            far_edge = 96 <= x <= W - 96
            if max(tilts) <= 15 and far_pit and far_edge:
                good += 1
        gaps = all(b - a >= 56 for a, b in zip(xs, xs[1:]))
        log.info("[포격전] 안전 슬롯 %s 진지 %d/8 통과 · 간격 %s", side, good, "OK" if gaps else "부족")
        ok = ok and good >= 8 and gaps
    return ok


SLOTS_OK = check_slots()


def now() -> float:
    return time.monotonic() * 1000.0


def clamp(v, a, b):
    return a if v < a else b if v > b else v


# ---------------------------------------------------------------- 연결
_clean_name: Callable[[object], str] = lambda raw: (str(raw or "").strip() or "플레이어")[:8]
_codes_taken: Callable[[], object] = lambda: ()
ROOMS: Dict[str, "TRoom"] = {}
CONN: Dict[object, tuple] = {}       # ws → (code, pid)
_loop_task: Optional[asyncio.Task] = None


def bind(clean_name=None, codes_taken=None) -> None:
    """server.py 가 clean_name()과 기존 방 코드 목록을 넘겨줘요 (순환 import 방지)."""
    global _clean_name, _codes_taken
    if clean_name:
        _clean_name = clean_name
    if codes_taken:
        _codes_taken = codes_taken


def new_code() -> str:
    taken = _codes_taken()
    for _ in range(2000):
        c = f"{random.randint(1000, 9999)}"
        if c not in ROOMS and c not in taken:
            return c
    raise RuntimeError("방 코드를 만들 수 없어요")


async def _send(ws, text: str) -> None:
    try:
        await ws.send_text(text)
    except Exception:
        pass


def send(ws, payload) -> None:
    if ws is None or getattr(ws, "closed", False):
        return
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    asyncio.ensure_future(_send(ws, text))


# ---------------------------------------------------------------- 상태
class Seat:
    def __init__(self, pid: str, name: str, order: int, ai: bool = False, lv: str = "easy"):
        self.pid = pid
        self.token = "" if ai else secrets.token_hex(12)
        self.name = name
        self.kind = "mongdol"
        self.team = "A"
        self.ai = ai
        self.lv = lv
        self.ws = None
        self.on = ai
        self.order = order
        self.st = "lobby"          # lobby / play / spec / wait
        self.last_emo = 0.0
        self.disc_at = 0.0
        self.spec = None           # 관전 대상 pid
        self.spec_switch_at = 0.0

    def row(self) -> dict:
        d = {"id": self.pid, "n": self.name, "k": self.kind, "tm": self.team, "on": 1 if self.on else 0, "st": self.st}
        if self.ai:
            d["ai"] = 1
            d["lv"] = self.lv
        return d


class Tank:
    def __init__(self, seat: Seat, x: float, y: float, face: int):
        self.pid = seat.pid
        self.kind = seat.kind
        self.team = seat.team
        self.name = seat.name
        self.ai = seat.ai
        self.lv = seat.lv
        self.K = KINDS[self.kind]
        self.x = x
        self.y = y
        self.vy = 0.0
        self.face = face
        self.bt = 0.0
        self.a = float(round((self.K["amin"] + self.K["amax"]) / 2))
        self.p = 60.0
        self.hp = self.K["hp"]
        self.fuel = FUEL_MAX
        self.idle = 0.0
        self.cd_until = 0.0
        self.inv_until = 0.0
        self.f = 0
        self.f_until = 0.0
        self.alive = True
        self.falling = False
        self.d = 0
        self.moving = False
        self.dead_at = 0.0
        self.cause = ""
        self.shots = 0
        self.hits = 0
        self.dealt = 0
        self.brain: Optional[dict] = None

    def center(self):
        return self.x, self.y - self.K["bh"] / 2

    def snap(self, t: float) -> list:
        st = 2 if not self.alive else (1 if self.falling else 0)
        return [self.pid, round(self.x, 1), round(self.y, 1), self.face, int(round(self.bt * 10)), int(round(self.a)),
                int(round(self.p)), max(0, int(math.ceil(self.hp))), int(self.fuel), max(0, int(self.cd_until - t)),
                max(0, int(self.inv_until - t)), self.f, st, 1 if self.moving else 0]


class Round:
    def __init__(self, room: "TRoom", seats: List[Seat]):
        self.room = room
        self.mask = bytearray(BASE_MASK)
        self.seed = random.getrandbits(32)
        rng = random.Random(self.seed)
        self.side = {"A": "L", "B": "R"} if rng.random() < 0.5 else {"A": "R", "B": "L"}
        self.tanks: Dict[str, Tank] = {}
        spawn = []
        for team in ("A", "B"):
            members = [s for s in seats if s.team == team]
            xs = list(SLOTS_L if self.side[team] == "L" else SLOTS_R)
            idx = list(range(len(xs)))
            rng.shuffle(idx)
            rng.shuffle(members)
            for s, i in zip(members, idx):
                x = float(xs[i])
                y = surface(self.mask, x, 380, 40, 400) or 380.0
                face = 1 if self.side[team] == "L" else -1
                tk = Tank(s, x, y, face)
                self.tanks[s.pid] = tk
                spawn.append({"id": s.pid, "slot": i, "x": x, "y": y, "fa": face})
        self.spawn = spawn
        log.info("[포격전 %s] 판 시작 seed=%d 진지=%s 슬롯=%s", room.code, self.seed, self.side,
                 [(d["id"], d["slot"]) for d in spawn])
        t = now()
        self.t0 = t
        self.play_at = t + COUNTDOWN_MS
        self.end_at = self.play_at + ROUND_MS
        for tk in self.tanks.values():
            tk.inv_until = self.play_at + INV_MS
            if tk.ai:
                tk.brain = new_brain(tk, rng)
        self.wind = rng.randint(-WIND_MAX, WIND_MAX)
        self.wind_at = self.play_at + WIND_EVERY_MS
        self.shells: List[dict] = []
        self.sid = 0
        self.k = 0
        self.over = False
        self.result: Optional[dict] = None
        self.result_until = 0.0
        self.recent_carves: List[tuple] = []   # (t, x, r) — AI 추락 원인 기록용

    def tl(self, t: float) -> int:
        return max(0, int(self.end_at - t))

    def alive_count(self) -> Dict[str, int]:
        c = {"A": 0, "B": 0}
        for tk in self.tanks.values():
            if tk.alive:
                c[tk.team] += 1
        return c

    def start_msg(self, for_pid: str = "") -> dict:
        t = now()
        return {
            "t": "tkround", "map": "v2", "rle": mask_rle(self.mask) if self.k > 0 else BASE_RLE, "gw": GW, "gh": GH,
            "seed": self.seed, "side": self.side, "spawn": self.spawn, "inv": INV_MS, "wind": self.wind,
            "cdn": max(0, int(self.play_at - t)), "endsIn": self.tl(t), "k": self.k,
            "tanks": [{"id": tk.pid, "n": tk.name, "k": tk.kind, "tm": tk.team, "ai": 1 if tk.ai else 0,
                       "lv": tk.lv if tk.ai else ""} for tk in self.tanks.values()],
            "me": for_pid,
        }


class TRoom:
    def __init__(self, code: str):
        self.code = code
        self.seats: Dict[str, Seat] = {}
        self.host = ""
        self.counter = 0
        self.ai_counter = 0
        self.round: Optional[Round] = None
        self.empty_since = now()
        self.host_lost_at = 0.0
        self.notice = ""

    # ---- 명단
    def humans(self) -> List[Seat]:
        return sorted([s for s in self.seats.values() if not s.ai], key=lambda s: s.order)

    def team_count(self, team: str) -> int:
        return sum(1 for s in self.seats.values() if s.team == team)

    def start_check(self):
        a = self.team_count("A")
        b = self.team_count("B")
        if self.round is not None:
            return False, "판이 끝나면 다음 판이 시작돼요"
        if not SLOTS_OK:
            return False, "맵 자리 검사에 실패했어요"
        if a < MIN_PER_TEAM or b < MIN_PER_TEAM:
            return False, f"팀마다 {MIN_PER_TEAM}명 이상 있어야 시작할 수 있어요 (지금 A {a}명 · B {b}명)"
        if a > TEAM_MAX or b > TEAM_MAX:
            return False, "한 팀은 8명까지예요"
        return True, ""

    def lobby_msg(self) -> dict:
        ok, why = self.start_check()
        a = self.team_count("A")
        b = self.team_count("B")
        d = {"t": "tklobby", "code": self.code, "host": self.host,
             "players": [s.row() for s in sorted(self.seats.values(), key=lambda s: s.order)],
             "canStart": ok, "why": why, "max": TANK_MAX, "teamMax": TEAM_MAX, "minTeam": MIN_PER_TEAM,
             "diff": abs(a - b), "notice": self.notice}
        if self.round is not None:
            t = now()
            d["round"] = {"tl": self.round.tl(t), "alive": self.round.alive_count(), "over": 1 if self.round.over else 0}
        return d

    def push_lobby(self) -> None:
        msg = json.dumps(self.lobby_msg(), ensure_ascii=False, separators=(",", ":"))
        for s in self.seats.values():
            if s.ws is not None:
                send(s.ws, msg)
        self.notice = ""

    def viewers(self):
        for s in self.seats.values():
            if s.ws is not None and s.st in ("play", "spec"):
                yield s

    def cast(self, payload) -> None:
        msg = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        for s in self.viewers():
            send(s.ws, msg)

    def auto_team(self) -> str:
        return "A" if self.team_count("A") <= self.team_count("B") else "B"

    def drop_ai_for(self, team: Optional[str]) -> Optional[Seat]:
        """사람 자리 우선: 그 팀(없으면 인원 많은 팀)에서 가장 나중에 넣은 AI 1대를 뺌."""
        if team is None:
            team = "A" if self.team_count("A") >= self.team_count("B") else "B"
        ais = [s for s in self.seats.values() if s.ai and s.team == team]
        if not ais:
            ais = [s for s in self.seats.values() if s.ai]
        if not ais:
            return None
        victim = max(ais, key=lambda s: s.order)
        self.seats.pop(victim.pid, None)
        return victim


# ---------------------------------------------------------------- 메시지 처리
def err(ws, code: str, msg: str = "", **kw) -> None:
    d = {"t": "tkerr", "code": code, "msg": msg}
    d.update(kw)
    send(ws, d)


def _ensure_loop() -> None:
    global _loop_task
    if _loop_task is None or _loop_task.done():
        _loop_task = asyncio.ensure_future(main_loop())


def _attach(ws, room: TRoom, seat: Seat) -> None:
    old = seat.ws
    if old is not None and old is not ws:
        CONN.pop(old, None)
    seat.ws = ws
    seat.on = True
    seat.disc_at = 0.0
    CONN[ws] = (room.code, seat.pid)
    if room.host == seat.pid:
        room.host_lost_at = 0.0


async def handle(ws, msg: dict) -> None:
    _ensure_loop()
    t = msg.get("t")
    cur = CONN.get(ws)
    room = ROOMS.get(cur[0]) if cur else None
    seat = room.seats.get(cur[1]) if (room and cur) else None

    if t == "tkjoin":
        if seat is not None:
            _leave(room, seat)
        code = str(msg.get("room") or "").strip()
        name = _clean_name(msg.get("name"))
        if code:
            room = ROOMS.get(code)
            if room is None:
                return err(ws, "no_room", "방을 찾을 수 없어요")
        else:
            room = TRoom(new_code())
            ROOMS[room.code] = room
            log.info("[포격전 %s] 새 방", room.code)
        team = room.auto_team()
        notice = ""
        if len(room.seats) >= TANK_MAX or room.team_count(team) >= TEAM_MAX:
            gone = room.drop_ai_for(team if room.team_count(team) >= TEAM_MAX else None) if room.round is None else None
            if gone is None:
                return err(ws, "full", f"방이 꽉 찼어요 (최대 {TANK_MAX}명)")
            notice = f"AI 1대를 빼고 {name}님이 들어왔어요"
            team = room.auto_team()
        room.counter += 1
        seat = Seat(secrets.token_hex(5), name, room.counter)
        seat.team = team
        if room.round is not None:
            seat.st = "wait"
        room.seats[seat.pid] = seat
        if not room.host or room.host not in room.seats or room.seats[room.host].ai:
            room.host = seat.pid
        _attach(ws, room, seat)
        send(ws, {"t": "tkjoined", "pid": seat.pid, "token": seat.token, "code": room.code})
        room.notice = notice
        room.push_lobby()
        return

    if t == "tkrejoin":
        code = str(msg.get("room") or "")
        room = ROOMS.get(code)
        seat = room.seats.get(str(msg.get("pid") or "")) if room else None
        if seat is None or seat.ai or not secrets.compare_digest(seat.token, str(msg.get("token") or "")):
            return err(ws, "no_room", "판이 끝났거나 방이 없어졌어요. 대기실로 다시 들어와 주세요")
        _attach(ws, room, seat)
        send(ws, {"t": "tkjoined", "pid": seat.pid, "token": seat.token, "code": room.code, "re": 1})
        rd = room.round
        if rd is not None and not rd.over and seat.pid in rd.tanks and seat.st in ("play", "spec"):
            tk = rd.tanks[seat.pid]
            seat.st = "play" if tk.alive else "spec"
            send(ws, rd.start_msg(seat.pid))
            if not tk.alive:
                _spec_pick(room, seat, 0)
        elif seat.st in ("play", "spec"):
            seat.st = "lobby"
        room.push_lobby()
        return

    if room is None or seat is None:
        return err(ws, "no_room", "먼저 방에 들어와 주세요")
    is_host = room.host == seat.pid
    rd = room.round
    tk = rd.tanks.get(seat.pid) if rd else None

    if t == "tkpick":
        k = msg.get("kind")
        if k in KINDS:
            seat.kind = k
            room.push_lobby()
    elif t == "tkteam":
        tm = msg.get("team")
        if tm in ("A", "B") and tm != seat.team:
            if room.team_count(tm) >= TEAM_MAX:
                return err(ws, "team_full", "이 팀은 8명이 꽉 찼어요")
            seat.team = tm
            room.push_lobby()
    elif t == "tkemo":
        try:
            e = int(msg.get("e"))
        except (TypeError, ValueError):
            return err(ws, "bad_input")
        if not 0 <= e < EMO_COUNT:
            return err(ws, "bad_input")
        tnow = now()
        if tnow - seat.last_emo < EMO_GAP_MS:
            log.info("[포격전 %s] emo_rate %s", room.code, seat.name)
            return err(ws, "emo_rate", "", ms=int(EMO_GAP_MS - (tnow - seat.last_emo)))
        seat.last_emo = tnow
        out = json.dumps({"t": "tkemo", "id": seat.pid, "e": e}, separators=(",", ":"))
        for s in room.seats.values():
            if s.ws is not None and s.st in ("lobby", "wait"):
                send(s.ws, out)
    elif t == "tkstart":
        if not is_host:
            return err(ws, "not_host", "방장만 시작할 수 있어요")
        ok, why = room.start_check()
        if not ok:
            return err(ws, "need_players", why)
        _start_round(room)
    elif t == "tkin":
        if tk is None or not tk.alive or seat.st != "play":
            return
        try:
            d = int(msg.get("d") or 0)
        except (TypeError, ValueError):
            d = 0
        _set_input(tk, clamp(d, -1, 1))
    elif t == "tkaim":
        if tk is None or not tk.alive or seat.st != "play":
            return
        _set_aim(tk, msg.get("a"), msg.get("p"))
    elif t == "tkfire":
        if tk is None or not tk.alive or seat.st != "play" or rd is None:
            return err(ws, "bad_input")
        res = _fire(rd, tk, msg.get("a"), msg.get("p"))
        if res:
            err(ws, res[0], "", ms=res[1])
    elif t == "tkspec":
        if rd is None or rd.over:
            return err(ws, "not_round", "지금은 진행 중인 판이 없어요")
        if tk is not None and tk.alive and seat.st == "play":
            return err(ws, "bad_input")
        try:
            d = int(msg.get("d") or 0)
        except (TypeError, ValueError):
            d = 0
        if seat.st in ("lobby", "wait"):
            seat.st = "spec"
            send(ws, rd.start_msg(seat.pid))
            room.push_lobby()
        _spec_pick(room, seat, clamp(d, -1, 1))
    elif t == "tkback":
        if tk is not None and tk.alive and seat.st == "play" and not (rd is not None and rd.over):
            return err(ws, "not_dead", "살아 있을 때는 대기실로 갈 수 없어요")
        seat.st = "wait" if (rd is not None and not rd.over) else "lobby"
        seat.spec = None
        room.push_lobby()
    elif t == "tkaiadd":
        if not is_host:
            return err(ws, "not_host", "방장만 AI를 넣을 수 있어요")
        if room.round is not None:
            return err(ws, "not_lobby", "판이 끝난 뒤에 넣을 수 있어요")
        team = msg.get("team") if msg.get("team") in ("A", "B") else room.auto_team()
        lv = "normal" if msg.get("lv") == "normal" else "easy"
        if not _add_ai(room, team, lv, msg.get("kind")):
            return err(ws, "ai_full", "빈자리가 없어요")
        room.push_lobby()
    elif t == "tkaidel":
        s = room.seats.get(str(msg.get("id") or ""))
        if not is_host:
            return err(ws, "not_host")
        if s is None or not s.ai or room.round is not None:
            return err(ws, "no_ai")
        room.seats.pop(s.pid, None)
        room.push_lobby()
    elif t == "tkailv":
        s = room.seats.get(str(msg.get("id") or ""))
        if not is_host:
            return err(ws, "not_host")
        if s is None or not s.ai:
            return err(ws, "no_ai")
        s.lv = "normal" if msg.get("lv") == "normal" else "easy"
        s.name = _ai_name(room, s.lv, s.pid)
        room.push_lobby()
    elif t == "tkpractice":
        if not is_host:
            return err(ws, "not_host")
        if room.round is not None:
            return err(ws, "not_lobby")
        if msg.get("to") == "8v8":
            for team in ("A", "B"):
                while room.team_count(team) < TEAM_MAX and len(room.seats) < TANK_MAX:
                    _add_ai(room, team, "easy", None)
        else:
            for team in ("A", "B"):
                while room.team_count(team) < 2 and len(room.seats) < TANK_MAX:
                    _add_ai(room, team, "easy", None)
        room.push_lobby()
    elif t == "tkleave":
        _leave(room, seat)
        CONN.pop(ws, None)
        send(ws, {"t": "tkleft"})
    else:
        err(ws, "bad_input")


def _ai_name(room: TRoom, lv: str, pid: str) -> str:
    n = pid[2:] if pid.startswith("ai") else "1"
    return _clean_name(("AI쉬움" if lv == "easy" else "AI보통") + n)


def _add_ai(room: TRoom, team: str, lv: str, kind) -> bool:
    if len(room.seats) >= TANK_MAX or room.team_count(team) >= TEAM_MAX:
        return False
    room.ai_counter += 1
    room.counter += 1
    pid = f"ai{room.ai_counter}"
    s = Seat(pid, "", room.counter, ai=True, lv=lv)
    s.name = _ai_name(room, lv, pid)
    s.team = team
    s.kind = kind if kind in KINDS else random.choice(list(KINDS))
    room.seats[pid] = s
    return True


def _leave(room: TRoom, seat: Seat) -> None:
    room.seats.pop(seat.pid, None)
    if seat.ws is not None:
        CONN.pop(seat.ws, None)
    seat.ws = None
    if room.round is not None and seat.pid in room.round.tanks:
        room.round.tanks[seat.pid].d = 0
    if room.host == seat.pid:
        hs = [s for s in room.humans() if s.on]
        room.host = hs[0].pid if hs else ""
    if not room.humans():
        ROOMS.pop(room.code, None)
        log.info("[포격전 %s] 방 정리 (모두 나감)", room.code)
        return
    room.push_lobby()


def on_close(ws) -> None:
    cur = CONN.pop(ws, None)
    if not cur:
        return
    room = ROOMS.get(cur[0])
    seat = room.seats.get(cur[1]) if room else None
    if seat is None or seat.ws is not ws:
        return
    seat.ws = None
    seat.on = False
    seat.disc_at = now()
    if room.round is not None and seat.pid in room.round.tanks:
        room.round.tanks[seat.pid].d = 0
    if room.host == seat.pid:
        room.host_lost_at = now()
    log.info("[포격전 %s] 연결 끊김: %s", room.code, seat.name)
    room.push_lobby()


# ---------------------------------------------------------------- 판 진행
def _start_round(room: TRoom) -> None:
    seats = [s for s in room.seats.values() if s.ai or (s.on and s.ws is not None)]
    rd = Round(room, seats)
    room.round = rd
    for s in room.seats.values():
        s.spec = None
        if s.pid in rd.tanks:
            s.st = "play"
            send(s.ws, rd.start_msg(s.pid))
        elif not s.ai:
            s.st = "wait"
    room.push_lobby()


def _set_input(tk: Tank, d: int) -> None:
    tk.d = d


def _set_aim(tk: Tank, a, p) -> None:
    try:
        a = float(a)
        p = float(p)
    except (TypeError, ValueError):
        return
    if math.isnan(a) or math.isnan(p):
        return
    tk.a = clamp(round(a), tk.K["amin"], tk.K["amax"])
    tk.p = clamp(round(p), 0, 100)


def muzzle(tk: Tank, a: float):
    """포구 위치와 실제 발사각(도)."""
    K = tk.K
    bt = math.radians(tk.bt)
    f = tk.face
    fx, fy = f * math.cos(bt), -math.sin(bt)
    ux, uy = -f * math.sin(bt), -math.cos(bt)
    px = tk.x + fx * K["pfx"] + ux * K["ph"]
    py = tk.y + fy * K["pfx"] + uy * K["ph"]
    ea = clamp(tk.bt + a, -30.0, 85.0)
    er = math.radians(ea)
    dx, dy = f * math.cos(er), -math.sin(er)
    return px + dx * K["pl"], py + dy * K["pl"], ea


def _fire(rd: Round, tk: Tank, a, p):
    t = now()
    if t < rd.play_at or rd.over:
        return ("bad_input", 0)
    if t < tk.cd_until:
        return ("cooldown", int(tk.cd_until - t))
    try:
        a = float(a)
        p = float(p)
    except (TypeError, ValueError):
        return ("bad_input", 0)
    if math.isnan(a) or math.isnan(p):
        return ("bad_input", 0)
    a = round(a)
    if a < tk.K["amin"] or a > tk.K["amax"]:
        return ("angle_range", 0)
    p = clamp(round(p), 0, 100)
    tk.a, tk.p = a, p
    x, y, ea = muzzle(tk, a)
    v0 = 300 + 9 * p
    er = math.radians(ea)
    vx = tk.face * v0 * math.cos(er)
    vy = -v0 * math.sin(er)
    rd.sid += 1
    sh = {"sid": rd.sid, "own": tk.pid, "team": tk.team, "x": x, "y": y, "vx": vx, "vy": vy, "age": 0.0,
          "r": tk.K["r"], "dmg": tk.K["dmg"]}
    rd.shells.append(sh)
    tk.cd_until = t + COOLDOWN_MS
    tk.shots += 1
    rd.room.cast({"t": "tkshot", "k": rd.k, "id": tk.pid, "sid": rd.sid, "x": round(x, 1), "y": round(y, 1),
                  "ea": round(ea, 1), "vx": round(vx, 1), "vy": round(vy, 1), "w": rd.wind})
    return None


def _hit_tank(rd: Round, x: float, y: float, own: str, age: float) -> Optional[Tank]:
    for tk in rd.tanks.values():
        if not tk.alive:
            continue
        if tk.pid == own and age < 0.35:
            continue
        K = tk.K
        if abs(x - tk.x) <= K["bw"] / 2 and tk.y - K["bh"] - 4 <= y <= tk.y + 2:
            return tk
    return None


def _set_face(tk: Tank, f: int, t: float) -> None:
    if f == 1 and tk.f == 2 and t < tk.f_until:
        return   # 아픈 중이면 웃음 무시
    tk.f = f
    tk.f_until = t + FACE_MS


def _explode(rd: Round, sh: dict, x: float, y: float) -> None:
    t = now()
    ix, iy, r = int(round(x)), int(round(y)), int(sh["r"])
    carve(rd.mask, ix, iy, r)
    rd.recent_carves.append((t, ix, r))
    hits = []
    faces = {}
    shooter = rd.tanks.get(sh["own"])
    hit_enemy = False
    for tk in rd.tanks.values():
        if not tk.alive:
            continue
        K = tk.K
        # 판정 상자까지 가장 가까운 거리
        bx0, bx1 = tk.x - K["bw"] / 2, tk.x + K["bw"] / 2
        by0, by1 = tk.y - K["bh"], tk.y
        dx = max(bx0 - ix, 0, ix - bx1)
        dy = max(by0 - iy, 0, iy - by1)
        dist = math.hypot(dx, dy)
        if dist > r:
            continue
        dmg = sh["dmg"] * (1 - 0.7 * dist / r)
        if tk.pid == sh["own"]:
            dmg *= 0.5
        elif tk.team == sh["team"]:
            continue   # 아군 데미지 0
        if t < tk.inv_until:
            continue   # 스폰 무적
        dmg = max(1, int(round(dmg)))
        tk.hp -= dmg
        hits.append({"id": tk.pid, "dmg": dmg, "hp": max(0, tk.hp)})
        _set_face(tk, 2, t)
        faces[tk.pid] = 2
        if tk.pid != sh["own"]:
            hit_enemy = True
            if shooter:
                shooter.dealt += dmg
        if tk.brain is not None:
            tk.brain["hit_at"] = t
    if hit_enemy and shooter is not None and shooter.alive:
        shooter.hits += 1
        _set_face(shooter, 1, t)
        faces[shooter.pid] = shooter.f
    rd.room.cast({"t": "tkboom", "k": rd.k, "sid": sh["sid"], "x": ix, "y": iy, "r": r, "hits": hits,
                  "face": [{"id": k, "f": v, "ms": FACE_MS} for k, v in faces.items()]})
    for h in hits:
        tk = rd.tanks[h["id"]]
        if tk.hp <= 0 and tk.alive:
            _kill(rd, tk, "hit", by=sh["own"])


def _kill(rd: Round, tk: Tank, cause: str, by: str = "") -> None:
    tk.alive = False
    tk.hp = 0
    tk.d = 0
    tk.f = 2
    tk.dead_at = now()
    tk.cause = cause
    rd.room.cast({"t": "tkdeath", "k": rd.k, "id": tk.pid, "cause": cause, "by": by})
    if tk.ai and cause == "fall":
        t = now()
        terr = any(t - ct < 2000 and abs(cx - tk.x) <= tk.K["bw"] / 2 + cr for ct, cx, cr in rd.recent_carves)
        log.info("[포격전 %s] ai_fall %s %s", rd.room.code, tk.name, "terrain" if terr else "self")
    seat = rd.room.seats.get(tk.pid)
    if seat is not None and seat.st == "play":
        seat.st = "spec"
    # 이 탱크를 보던 관전자는 1.4초 뒤 다음 대상으로
    for s in rd.room.seats.values():
        if s.spec == tk.pid:
            s.spec_switch_at = now() + 1400
    rd.room.push_lobby()


def step_tank(rd: Round, tk: Tank, t: float, playing: bool) -> None:
    m = rd.mask
    K = tk.K
    tk.moving = False
    if tk.falling:
        tk.vy = min(tk.vy + GRAV * DT, 900)
        ny = tk.y + tk.vy * DT
        land = None
        if 0 <= tk.x < W:
            c0 = int(tk.y // CELL)
            c1 = int(ny // CELL)
            gx = int(tk.x // CELL)
            for c in range(max(0, c0), min(GH, c1 + 1)):
                if m[c * GW + gx] == 1 and c * CELL >= tk.y - 0.01:
                    land = float(c * CELL)
                    break
        if land is not None:
            tk.y = land
            tk.vy = 0
            tk.falling = False
        else:
            tk.y = ny
    else:
        g = surface(m, tk.x, tk.y, 8, 12)
        if g is None:
            tk.falling = True
            tk.vy = 0
        elif g != WALL:
            tk.y = g
        # 이동
        if not tk.falling and playing and tk.d != 0:
            if tk.face != tk.d:
                tk.face = tk.d          # 반대쪽을 누르면 첫 틱은 방향만 바꿈
            elif tk.fuel > 0:
                dist = K["speed"] * DT
                n = max(1, int(math.ceil(dist / 2)))
                stepd = dist / n
                moved = False
                for _ in range(n):
                    nx = tk.x + tk.d * stepd
                    ahead = surface(m, tk.x + tk.d * 16, tk.y, 28, 40)
                    if ahead == WALL:
                        break
                    if ahead is not None and tk.y - ahead > 0 and math.degrees(math.atan2(tk.y - ahead, 16)) > K["climb"]:
                        break
                    g = surface(m, nx, tk.y, 8, 12)
                    if g == WALL:
                        break
                    tk.x = nx
                    moved = True
                    if g is None:
                        tk.falling = True
                        tk.vy = 0
                        break
                    tk.y = g
                if moved:
                    tk.moving = True
                    tk.fuel = max(0.0, tk.fuel - FUEL_USE * DT)
                    tk.idle = 0
        elif tk.d != 0 and tk.face != tk.d and not tk.falling:
            tk.face = tk.d   # 카운트다운 중·게이지 0 : 방향만
    if not tk.moving:
        tk.idle += DT
        if tk.idle >= FUEL_IDLE_S:
            tk.fuel = min(FUEL_MAX, tk.fuel + FUEL_REGEN * DT)
    # 차체 기울기 (바퀴 두 점)
    if not tk.falling:
        h = K["half"]
        gf = surface(m, tk.x + tk.face * h, tk.y, 20, 12)
        gb = surface(m, tk.x - tk.face * h, tk.y, 20, 12)
        if gf in (None, WALL):
            gf = tk.y
        if gb in (None, WALL):
            gb = tk.y
        target = math.degrees(math.atan2(gb - gf, 2 * h))
        tk.bt += clamp(target - tk.bt, -6, 6)
        # 미끄럼
        if abs(target) > SLIDE_DEG:
            down = -tk.face if target > 0 else tk.face
            nx = tk.x + down * 40 * DT
            g = surface(m, nx, tk.y, 4, 16)
            if g is None:
                tk.x = nx
                tk.falling = True
            elif g != WALL:
                tk.x, tk.y = nx, g
    # 표정 복귀
    if tk.f != 0 and t >= tk.f_until and tk.alive:
        tk.f = 0
    # 추락사
    if tk.alive and (tk.y > FALL_Y or tk.x < -20 or tk.x > W + 20):
        _kill(rd, tk, "fall")


def step_shells(rd: Round) -> None:
    sub = DT / SHELL_SUB
    keep = []
    for sh in rd.shells:
        boom = None
        gone = False
        for _ in range(SHELL_SUB):
            sh["vx"] += rd.wind * sub
            sh["vy"] += GRAV * sub
            sh["x"] += sh["vx"] * sub
            sh["y"] += sh["vy"] * sub
            sh["age"] += sub
            x, y = sh["x"], sh["y"]
            if x < -300 or x > W + 300 or y > H + 100 or sh["age"] > SHELL_LIFE:
                gone = True
                break
            if solid(rd.mask, x, y) or _hit_tank(rd, x, y, sh["own"], sh["age"]):
                boom = (x, y)
                break
        if boom:
            _explode(rd, sh, boom[0], boom[1])
        elif gone:
            rd.room.cast({"t": "tkgone", "k": rd.k, "sid": sh["sid"]})
        else:
            keep.append(sh)
    rd.shells = keep


def _spec_targets(rd: Round) -> List[Tank]:
    return sorted([tk for tk in rd.tanks.values() if tk.alive], key=lambda tk: tk.x)


def _spec_pick(room: TRoom, seat: Seat, d: int) -> None:
    rd = room.round
    if rd is None:
        return
    alive = _spec_targets(rd)
    seat.spec_switch_at = 0
    if not alive:
        send(seat.ws, {"t": "tkspecto", "id": None})
        return
    cur = rd.tanks.get(seat.spec) if seat.spec else None
    if d == 0 or cur is None:
        me = rd.tanks.get(seat.pid)
        if cur is not None and cur.alive and d == 0:
            pick = cur
        else:
            ox = me.x if me else (cur.x if cur else W / 2)
            mates = [tk for tk in alive if me and tk.team == me.team]
            pool = mates or alive
            pick = min(pool, key=lambda tk: abs(tk.x - ox))
    else:
        xs = [tk.x for tk in alive]
        if cur.alive:
            i = alive.index(cur)
            pick = alive[(i + d) % len(alive)]
        else:
            if d > 0:
                nxt = [tk for tk in alive if tk.x > cur.x]
                pick = nxt[0] if nxt else alive[0]
            else:
                prv = [tk for tk in alive if tk.x < cur.x]
                pick = prv[-1] if prv else alive[-1]
        del xs
    seat.spec = pick.pid
    send(seat.ws, {"t": "tkspecto", "id": pick.pid, "n": pick.name, "tm": pick.team, "k": pick.kind,
                   "ai": 1 if pick.ai else 0, "lv": pick.lv if pick.ai else "", "cnt": len(alive)})


def _end_round(rd: Round, win: str, by: str) -> None:
    rd.over = True
    rd.result_until = now() + RESULT_MS
    alive = rd.alive_count()
    stats = [{"id": tk.pid, "n": tk.name, "tm": tk.team, "k": tk.kind, "shots": tk.shots, "hits": tk.hits,
              "dealt": tk.dealt, "alive": 1 if tk.alive else 0} for tk in rd.tanks.values()]
    rd.result = {"t": "tkend", "k": rd.k, "win": win, "by": by, "alive": alive, "stats": stats, "back": RESULT_MS}
    rd.room.cast(rd.result)
    log.info("[포격전 %s] 판 끝: %s (%s) %s", rd.room.code, win, by, alive)
    rd.room.push_lobby()


def _finish_round(room: TRoom) -> None:
    room.round = None
    for s in room.seats.values():
        s.spec = None
        if not s.ai:
            s.st = "lobby"
    # 판 도중 들어와 기다리던 사람 자리 우선: 꽉 찼으면 AI 1대 빼기
    while len(room.seats) > TANK_MAX:
        if room.drop_ai_for(None) is None:
            break
    for team in ("A", "B"):
        while room.team_count(team) > TEAM_MAX:
            if room.drop_ai_for(team) is None:
                break
    room.push_lobby()


def tick_round(room: TRoom, t: float) -> None:
    rd = room.round
    if rd is None:
        return
    if rd.over:
        if t >= rd.result_until:
            _finish_round(room)
        return
    rd.k += 1
    playing = t >= rd.play_at
    humans_on = any(s.on for s in room.humans())
    planned = 0
    for tk in rd.tanks.values():
        if tk.alive and tk.ai and humans_on:
            planned += ai_step(rd, tk, t, playing, planned < 2)
        elif tk.ai:
            tk.d = 0
    for tk in rd.tanks.values():
        if tk.alive or tk.falling:
            if tk.alive:
                step_tank(rd, tk, t, playing)
            else:
                # 죽어서 떨어지는 탱크는 계속 떨어지기만
                if tk.cause == "fall" and tk.y < H + 400:
                    tk.vy = min(tk.vy + GRAV * DT, 900)
                    tk.y += tk.vy * DT
    if playing:
        step_shells(rd)
        if t >= rd.wind_at:
            rd.wind = random.randint(-WIND_MAX, WIND_MAX)
            rd.wind_at = t + WIND_EVERY_MS
            room.cast({"t": "tkwind", "k": rd.k, "w": rd.wind})
    rd.recent_carves = [c for c in rd.recent_carves if t - c[0] < 2500]
    # 관전 대상 자동 전환
    for s in room.seats.values():
        sw = getattr(s, "spec_switch_at", 0)
        if sw and t >= sw and s.st == "spec":
            _spec_pick(room, s, 1)
    snap = {"t": "tksnap", "k": rd.k, "tl": rd.tl(t), "cdn": max(0, int(rd.play_at - t)), "w": rd.wind,
            "tanks": [tk.snap(t) for tk in rd.tanks.values()],
            "sh": [[sh["sid"], round(sh["x"], 1), round(sh["y"], 1)] for sh in rd.shells]}
    room.cast(snap)
    # 승패
    if playing:
        alive = rd.alive_count()
        if alive["A"] == 0 or alive["B"] == 0:
            win = "draw" if alive["A"] == alive["B"] else ("A" if alive["A"] else "B")
            _end_round(rd, win, "wipe")
        elif t >= rd.end_at:
            if alive["A"] != alive["B"]:
                win = "A" if alive["A"] > alive["B"] else "B"
            else:
                hp = {"A": 0, "B": 0}
                for tk in rd.tanks.values():
                    if tk.alive:
                        hp[tk.team] += tk.hp
                win = "draw" if hp["A"] == hp["B"] else ("A" if hp["A"] > hp["B"] else "B")
            _end_round(rd, win, "time")


def housekeeping(t: float) -> None:
    for code in list(ROOMS):
        room = ROOMS[code]
        # 방장 넘김
        if room.host_lost_at and t - room.host_lost_at >= HOST_HANDOVER_MS:
            hs = [s for s in room.humans() if s.on]
            if hs:
                room.host = hs[0].pid
                room.host_lost_at = 0
                room.push_lobby()
        # 끊긴 자리 정리 (대기실에서만)
        changed = False
        for s in list(room.seats.values()):
            if not s.ai and not s.on and s.disc_at and t - s.disc_at > SEAT_KEEP_MS:
                in_round = room.round is not None and s.pid in room.round.tanks and not room.round.over
                if not in_round:
                    room.seats.pop(s.pid, None)
                    changed = True
        if changed:
            if room.host not in room.seats:
                hs = [s for s in room.humans() if s.on]
                room.host = hs[0].pid if hs else ""
            room.push_lobby()
        if any(s.on for s in room.humans()):
            room.empty_since = t
        elif t - room.empty_since > ROOM_EMPTY_MS or not room.humans():
            ROOMS.pop(code, None)
            log.info("[포격전 %s] 방 정리 (접속 0명)", code)


async def main_loop() -> None:
    nxt = now()
    hk = 0
    while True:
        nxt += TICK_MS
        t = now()
        for room in list(ROOMS.values()):
            try:
                tick_round(room, t)
            except Exception:
                log.exception("[포격전 %s] 틱 오류", room.code)
        hk += 1
        if hk >= TICK_HZ:
            hk = 0
            try:
                housekeeping(t)
            except Exception:
                log.exception("[포격전] 정리 오류")
        delay = (nxt - now()) / 1000.0
        if delay < -0.5:
            nxt = now()
            delay = 0
        await asyncio.sleep(max(0.0, delay))


# ---------------------------------------------------------------- AI (서버에서 실행 · 사람과 같은 입력 함수)
AI_LV = {
    # 오차는 '파워 숫자'가 아니라 초속(v0) 기준 비율로 넣음. 45° 근처는 각도 오차가 사거리에 거의 안 미쳐서
    # 쏠 때마다 선호 각을 pref 범위에서 무작위로 고름 (2026-11-13 헤드리스 측정으로 조정 · IMPLEMENT_STATUS 참고)
    "easy": dict(e=(8, 12), ep=(0.15, 0.20), delay=(400, 700), wind=0.5, shrink=0.85, floor=0.85, pref=(28, 66)),
    "normal": dict(e=(4, 6), ep=(0.08, 0.12), delay=(150, 300), wind=1.0, shrink=0.8, floor=0.7, pref=(32, 60)),
}


def new_brain(tk: Tank, rng: random.Random) -> dict:
    L = AI_LV["normal" if tk.lv == "normal" else "easy"]
    return {"E": rng.uniform(*L["e"]), "EP": rng.uniform(*L["ep"]), "mul": 1.0, "plan": None, "target": None,
            "tx": None, "ready_at": 0.0, "move_until": 0.0, "move_dir": 0, "next_wander": now() + random.uniform(8000, 15000),
            "hit_at": 0.0, "hit_seen": 0.0, "rng": random.Random(rng.getrandbits(32))}


def _safe_ahead(rd: Round, tk: Tank, d: int, look: float) -> bool:
    """AI 앞쪽 검사: 끊김(구덩이·맵 끝)에서 100px, 맵 끝 96px, 경사 한도-8°, 발판 진입 금지."""
    m = rd.mask
    x, y = tk.x, tk.y
    nx = tk.x + d * look
    if nx < 96 or nx > W - 96:
        return False
    if PIT_L - 100 <= nx <= PIT_R + 100:
        return False
    py = y
    for i in range(1, int(100 // 4) + 1):
        xx = x + d * i * 4
        g = surface(m, xx, py, 24, 12)
        if g is None or g == WALL:
            return False
        if i * 4 <= look + 16 and py - g > 0 and math.degrees(math.atan2(py - g, 4)) > tk.K["climb"] - 8 + 20:
            return False
        py = g
    a = surface(m, x + d * 16, y, 28, 40)
    if a not in (None, WALL) and y - a > 0 and math.degrees(math.atan2(y - a, 16)) > tk.K["climb"] - 8:
        return False
    return True


def _sim_land(x0, y0, ea, p, face, wind, tx, ty):
    """바람 넣은 짧은 계산(1/15초 × 120걸음). 목표 높이를 내려오며 지날 때 x. 못 닿으면 None."""
    v0 = 300 + 9 * p
    er = math.radians(ea)
    vx, vy = face * v0 * math.cos(er), -v0 * math.sin(er)
    x, y = x0, y0
    dt = DT / 2
    for _ in range(240):
        vx += wind * dt
        vy += GRAV * dt
        nx, ny = x + vx * dt, y + vy * dt
        if vy > 0 and y <= ty <= ny:
            f = (ty - y) / (ny - y) if ny != y else 0
            return x + (nx - x) * f
        x, y = nx, ny
        if y > H + 200:
            return None
    return None


def _plan(rd: Round, tk: Tank, target: Tank, L: dict) -> Optional[tuple]:
    face = 1 if target.x > tk.x else -1
    tx, ty = target.x, target.y - target.K["bh"] / 2
    wind = rd.wind * L["wind"]
    lo = max(-30.0, tk.bt + tk.K["amin"])
    hi = min(85.0, tk.bt + tk.K["amax"])
    pref = random.uniform(*L["pref"])
    cands = sorted(range(int(math.ceil(lo)), int(hi) + 1, 3), key=lambda e: abs(e - pref))[:8]
    if not cands:
        return None
    save = tk.face
    tk.face = face
    try:
        for ea in cands:
            a = ea - tk.bt
            if a < tk.K["amin"] or a > tk.K["amax"]:
                continue
            mx, my, _ = muzzle(tk, a)

            def over(p):
                xl = _sim_land(mx, my, ea, p, face, wind, tx, ty)
                if xl is None:
                    return None
                return (xl - tx) * face

            top = over(100)
            if top is None or top < 0:
                continue
            lo_p, hi_p = 0.0, 100.0
            for _ in range(12):
                mid = (lo_p + hi_p) / 2
                o = over(mid)
                if o is None or o < 0:
                    lo_p = mid
                else:
                    hi_p = mid
            p = hi_p
            xl = _sim_land(mx, my, ea, p, face, wind, tx, ty)
            if xl is not None and abs(xl - tk.x) < tk.K["r"] + 20:
                continue
            return (a, p, face)
    finally:
        tk.face = save
    return None


def ai_step(rd: Round, tk: Tank, t: float, playing: bool, may_plan: bool) -> int:
    b = tk.brain
    if b is None:
        return 0
    L = AI_LV["normal" if tk.lv == "normal" else "easy"]
    rng = b["rng"]
    planned = 0
    d = 0
    enemies = [e for e in rd.tanks.values() if e.alive and e.team != tk.team]
    # 이동 결정
    if playing:
        if b["hit_at"] > b["hit_seen"]:
            b["hit_seen"] = b["hit_at"]
            if rng.random() < 0.5:
                b["move_until"] = t + rng.uniform(1000, 2000)
                b["move_dir"] = rng.choice((-1, 1))
        if t >= b["next_wander"]:
            b["next_wander"] = t + rng.uniform(8000, 15000)
            b["move_until"] = t + rng.uniform(600, 1400)
            b["move_dir"] = rng.choice((-1, 1))
        if t < b["move_until"] and b["move_dir"]:
            md = b["move_dir"]
            if not _safe_ahead(rd, tk, md, tk.K["speed"] * DT * 2 + 24):
                md = -md
                b["move_dir"] = md
                if not _safe_ahead(rd, tk, md, tk.K["speed"] * DT * 2 + 24):
                    md = 0
                    b["move_until"] = 0
            d = md
    # 조준 계획
    if b["plan"] is None and enemies and t >= tk.cd_until and t >= b["ready_at"] and may_plan and not tk.falling:
        enemies.sort(key=lambda e: (t < e.inv_until and len(enemies) > 1, abs(e.x - tk.x)))
        target = enemies[1] if len(enemies) > 1 and rng.random() < 0.2 else enemies[0]
        if b["target"] != target.pid or (b["tx"] is not None and abs(target.x - b["tx"]) > 60):
            b["mul"] = 1.0
        else:
            b["mul"] = max(L["floor"], b["mul"] * L["shrink"])
        b["target"] = target.pid
        b["tx"] = target.x
        pl = _plan(rd, tk, target, L)
        planned = 1
        if pl is None:
            # 사거리 밖 → 상대 쪽으로 조금 이동
            md = 1 if target.x > tk.x else -1
            if _safe_ahead(rd, tk, md, tk.K["speed"] * DT * 2 + 24):
                b["move_until"] = t + 1200
                b["move_dir"] = md
            b["ready_at"] = t + 1500
        else:
            a, p, face = pl
            E = b["E"] * b["mul"]
            EP = b["EP"] * b["mul"]
            a = clamp(round(a + rng.uniform(-E, E)), tk.K["amin"], tk.K["amax"])
            v0 = (300 + 9 * p) * (1 + rng.uniform(-EP, EP))
            p = clamp(round((v0 - 300) / 9), 0, 100)
            b["plan"] = (a, p, face)
            b["ready_at"] = t + rng.uniform(*L["delay"])
    # 조준 움직이기 → 발사
    if b["plan"] is not None and t >= b["ready_at"]:
        a, p, face = b["plan"]
        if tk.face != face:
            d = face   # 방향 전환 한 틱 (첫 틱은 움직이지 않음)
        na = tk.a + clamp(a - tk.a, -30 * DT, 30 * DT)
        np_ = tk.p + clamp(p - tk.p, -60 * DT, 60 * DT)
        tk.a, tk.p = clamp(na, tk.K["amin"], tk.K["amax"]), clamp(np_, 0, 100)   # 사람 버튼 속도(30°/초·60/초)로만
        if abs(tk.a - a) < 0.5 and abs(tk.p - p) < 0.5 and tk.face == face and playing and t >= tk.cd_until:
            res = _fire(rd, tk, round(tk.a), round(tk.p))
            if res:
                log.info("[포격전 %s] ai_reject %s %s", rd.room.code, tk.name, res[0])
            b["plan"] = None
            b["ready_at"] = t + 300
    # 앞이 위험하면 입력 0 (스스로 걸어 들어가는 추락 금지)
    if d != 0 and tk.face == d and not _safe_ahead(rd, tk, d, tk.K["speed"] * DT * 2 + 24):
        d = 0
    _set_input(tk, d)
    return planned
