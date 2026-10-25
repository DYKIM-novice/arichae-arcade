"""
아리채 오락실 · 회귀 RPG 「되감기 용사단」 같이 모드 진행자 (서버)

- 서버가 맡는 것: 적 체력, 적 공격 시간표(예고 시각·닿는 시각), 방 진행, 전멸·클리어, 다 같이 회귀
- 폰이 맡는 것: 내 용사(입력·콤보·막기·패링 판정·체력·레벨·카드·회귀 기록)
  · 폰은 '때렸어요(rghit)' '패링했어요(rgparry)' '내 모습/체력(rgpose)' '카드 골랐어요(rgpick)' '출발 준비(rgready)' 를 보내요
  · 막기·패링 판정은 각 폰이 서버 시각(시계 맞추기)으로 정해진 '닿는 시각'과 비교해요 → 지연이 있어도 공정해요
- 숫자는 static/js/rpg/data.js 의 JSON 부분을 그대로 읽어요 (화면 혼자 모드와 같은 규칙)
- 가족 게임이라 속임수 막기는 하지 않아요
"""

import json
import random
from pathlib import Path
from typing import Dict, List, Optional

DATA_PATH = Path(__file__).resolve().parent / "static" / "js" / "rpg" / "data.js"


def load_data() -> dict:
    text = DATA_PATH.read_text("utf-8")
    a = text.index("/*JSON*/") + len("/*JSON*/")
    b = text.index("/*END*/")
    return json.loads(text[a:b])


D = load_data()
FLOW = D["flow"]
SCALE = D["scale"]
ENEMIES = D["enemies"]
ROOMS = D["rooms"]
LAST_ROOM = len(ROOMS) - 1
MAX_HEROES = 4
TICK = 0.05
SEND_GAP_MS = 80
EV_KEEP = 24


class RpgSession:
    """방 하나의 같이 모험 (회차가 바뀌어도 같은 객체 · run 번호만 올라가요)"""

    def __init__(self, humans: List[dict], bots: List[dict], driver: str, now: int, seed: Optional[int] = None):
        self.seed = seed or random.randint(1, 2_000_000_000)
        self.rng = random.Random(self.seed)
        self.run = 0
        self.heroes: Dict[str, dict] = {}
        for h in humans:
            self.heroes[h["id"]] = self._hero(h, False, "")
        for b in bots:
            self.heroes[b["id"]] = self._hero(b, True, driver)
        self.driver = driver
        self.stars = 0
        self.ev: List[dict] = []
        self.ev_n = 0
        self.ack: Dict[str, int] = {}
        self.dirty = True
        self.last_send = 0
        self.loops = 0           # 이 방에서 다 같이 회귀한 횟수
        self.new_loop(now)

    @staticmethod
    def _hero(h: dict, bot: bool, driver: str) -> dict:
        return {"n": h.get("name", "용사"), "at": h.get("ath", "dino"), "b": bot, "dr": driver,
                "hp": 100, "mh": 100, "dn": False, "a": "walk", "s": 0, "aa": 0, "lv": 1, "g": 0,
                "pk": True, "rd": False, "on": True}

    # ---------- 회차 시작 ----------
    def new_loop(self, now: int) -> None:
        self.run += 1
        self.plan = [opts[self.rng.randrange(len(opts))][:] for opts in ROOMS]
        self.phase = "walk"
        self.room = 0
        self.enc = 0
        self.spawn_at = now + FLOW["firstWalk"] + 1200    # 처음엔 화면 준비 시간을 조금 더
        self.cards_at = 0
        self.end_at = 0
        self.result = ""
        self.enemy: Optional[dict] = None
        self.atks: List[dict] = []
        self.eid_n = getattr(self, "eid_n", 0)
        self.aid_n = getattr(self, "aid_n", 0)
        self.ack = {}
        for h in self.heroes.values():
            h.update({"dn": False, "a": "walk", "pk": True, "rd": False, "hp": h.get("mh", 100)})
        self.dirty = True

    def set_meta_stars(self, stars: int) -> None:
        self.stars = max(0, int(stars))

    # ---------- 적 ----------
    def _scale(self, kind: str) -> dict:
        d = ENEMIES[kind]
        r = 0 if d.get("boss") else self.room
        n = max(1, len(self.heroes))
        return {"hp": (1 + SCALE["hp"] * r) * (1 + SCALE["party"] * (n - 1)) * (1 + SCALE["star"] * self.stars),
                "dmg": 1 + SCALE["dmg"] * r, "xp": 1 + SCALE["xp"] * self.room}

    def _spawn(self, now: int) -> None:
        kind = self.plan[self.room][self.enc]
        d = ENEMIES[kind]
        sc = self._scale(kind)
        mx = round(d["hp"] * sc["hp"])
        self.eid_n += 1
        self.enemy = {"id": self.eid_n, "k": kind, "hp": mx, "mx": mx, "dm": sc["dmg"], "xp": round(d["xp"] * sc["xp"]),
                      "sp": now, "nx": now + d["first"], "st": 0, "vu": 0, "dd": 0, "rg": False, "boss": bool(d.get("boss"))}
        self.phase = "fight"
        self.dirty = True

    def _alive(self) -> List[str]:
        return [hid for hid, h in self.heroes.items() if not h["dn"] and h["on"]]

    def _start_attack(self, now: int) -> None:
        E = self.enemy
        d = ENEMIES[E["k"]]
        pats = d["pats"]
        tot = sum(p.get("w", 1) for p in pats)
        r = self.rng.random() * tot
        p = pats[-1]
        for x in pats:
            r -= x.get("w", 1)
            if r <= 0:
                p = x
                break
        k = d.get("rageWind", 1) if E["rg"] else 1
        alive = self._alive() or list(self.heroes.keys())
        # 서버 → 폰 전달 시간을 생각해서 예고를 조금 앞당겨 보내요 (닿는 시각은 그대로 바람 시간 뒤)
        t0 = now + 120
        tg = alive if p.get("all") else [alive[self.rng.randrange(len(alive))]]
        self.aid_n += 1
        self.atks.append({"id": self.aid_n, "e": E["id"], "p": p["id"], "ic": p["icon"], "t0": t0,
                          "h": [round(t0 + p["wind"] * k + o * k) for o in p["hits"]], "d": round(p["dmg"] * E["dm"]),
                          "tg": tg, "al": bool(p.get("all")), "bk": round(p.get("brk", 0) * E["mx"]), "bd": 0,
                          "bs": p.get("brkStun", 0), "vu": p.get("vuln", 0), "rc": p.get("rec", 300), "ov": False, "br": False, "dn": 0})
        self.dirty = True

    def _stun(self, now: int, ms: int) -> None:
        E = self.enemy
        E["st"] = max(E["st"], now + ms)
        E["nx"] = max(E["nx"], E["st"] + 300)
        # 기절 중에 시작하기로 한 공격은 취소
        for a in self.atks:
            if not a["ov"] and a["t0"] > now:
                a["ov"] = True
                a["br"] = True
        self.dirty = True

    def _kill(self, now: int) -> None:
        E = self.enemy
        E["hp"] = 0
        E["dd"] = now
        for a in self.atks:
            a["ov"] = True
        self.enc += 1
        if self.enc < len(self.plan[self.room]):
            self.phase = "walk"
            self.spawn_at = now + FLOW["dieAnim"] + FLOW["nextWalk"]
        elif self.room >= LAST_ROOM:
            self.phase = "clear"
            self.result = "clear"
            self.end_at = now
            for h in self.heroes.values():
                h["rd"] = h["b"]
        else:
            self.phase = "cards"
            self.cards_at = now
            for h in self.heroes.values():
                h["pk"] = False
        self.dirty = True

    def _next_room(self, now: int) -> None:
        self.room += 1
        self.enc = 0
        self.phase = "walk"
        self.spawn_at = now + FLOW["roomWalk"]
        self.enemy = None
        self.atks = []
        for h in self.heroes.values():
            h["dn"] = False   # 쓰러진 용사는 다음 방에서 다시 일어나요 (폰도 같은 규칙으로 체력 40%)
            h["pk"] = True
        self.dirty = True

    # ---------- 매 틱 ----------
    def tick(self, now: int, connected: set) -> None:
        for hid, h in self.heroes.items():
            on = h["b"] or hid in connected
            if on != h["on"]:
                h["on"] = on
                self.dirty = True
        if self.phase == "walk" and now >= self.spawn_at:
            self._spawn(now)
        if self.phase == "fight" and self.enemy:
            E = self.enemy
            d = ENEMIES[E["k"]]
            # 닿는 시각이 지난 공격 → 다음 공격 시각 · 약점 시간
            for a in self.atks:
                if a["ov"]:
                    continue
                if now >= a["h"][-1]:
                    a["ov"] = True
                    k = d.get("rageGap", 1) if E["rg"] else 1
                    gap = (d["gap"][0] + (d["gap"][1] - d["gap"][0]) * self.rng.random()) * k
                    E["nx"] = max(E["nx"], a["h"][-1] + a["rc"] + gap)
                    if a["vu"]:
                        E["vu"] = max(E["vu"], a["h"][-1] + a["vu"])
                    self.dirty = True
            if not E["dd"] and not any(not a["ov"] for a in self.atks) and now >= E["nx"] and now >= E["st"]:
                self._start_attack(now)
            self.atks = [a for a in self.atks if not (a["ov"] and now > a["h"][-1] + 1200)]
        if self.phase == "cards":
            if all(h["pk"] or not h["on"] for h in self.heroes.values()) or now >= self.cards_at + FLOW["cardMax"]:
                self._next_room(now)
        if self.phase in ("walk", "fight", "cards"):
            live = [h for h in self.heroes.values() if h["on"]]
            if live and all(h["dn"] for h in live):
                self.phase = "wipe"
                self.result = "wipe"
                self.end_at = now
                for a in self.atks:
                    a["ov"] = True
                for h in self.heroes.values():
                    h["rd"] = h["b"]
                self.dirty = True
        if self.phase in ("wipe", "clear"):
            people = [h for h in self.heroes.values() if h["on"] and not h["b"]]
            if (people and all(h["rd"] for h in people)) or now >= self.end_at + FLOW["readyMax"] or not people:
                self.loops += 1
                if self.phase == "clear":
                    self.stars += 1
                self.new_loop(now)

    # ---------- 폰에서 온 소식 ----------
    def _who(self, pid: str, msg: dict) -> Optional[str]:
        a = str(msg.get("as") or "")
        if a:
            h = self.heroes.get(a)
            return a if h and h["b"] and h["dr"] == pid else None
        return pid if pid in self.heroes else None

    def on_msg(self, pid: str, msg: dict, now: int) -> None:
        t = msg.get("t")
        if t == "rgready":
            h = self.heroes.get(pid)
            if h and self.phase in ("wipe", "clear"):
                h["rd"] = True
                self.dirty = True
            return
        try:
            run = int(msg.get("run") or 0)
        except (TypeError, ValueError):
            return
        if run != self.run:
            return
        hid = self._who(pid, msg)
        if not hid:
            return
        h = self.heroes[hid]
        if t == "rgpose":
            try:
                h["a"] = str(msg.get("a") or "idle")[:8]
                s = int(msg.get("s") or 0)
                if s != h["s"]:
                    h["s"] = s
                    h["aa"] = now - max(0, min(2000, int(msg.get("ago") or 0)))
                h["hp"] = max(0, int(msg.get("hp") or 0))
                h["mh"] = max(1, int(msg.get("mh") or 100))
                h["lv"] = max(1, min(99, int(msg.get("lv") or 1)))
                h["g"] = max(0, min(100, int(msg.get("g") or 0)))
                dn = bool(msg.get("dn"))
            except (TypeError, ValueError):
                return
            if dn != h["dn"] and self.phase in ("walk", "fight", "cards"):
                h["dn"] = dn
            self.dirty = True
        elif t == "rghit":
            E = self.enemy
            try:
                eid = int(msg.get("e") or 0)
                dmg = max(0, min(5000, int(msg.get("d") or 0)))
                seq = int(msg.get("n") or 0)
            except (TypeError, ValueError):
                return
            if seq:
                self.ack[pid] = max(self.ack.get(pid, 0), seq)
            if not E or E["id"] != eid or E["dd"] or self.phase != "fight":
                self.dirty = True
                return
            crit = now < E["vu"] + 150       # 약점 시간 (폰 쪽 판정과 조금 어긋나도 너그럽게)
            got = dmg * 2 if crit else dmg
            E["hp"] -= got
            self._event({"k": "hit", "h": hid, "d": got, "c": crit, "kd": str(msg.get("k") or "")[:9]})
            # 빨강 예고(끊기): 예고 중 피해가 쌓이면 취소 + 기절
            for a in self.atks:
                if a["bk"] and not a["ov"] and now < a["h"][0]:
                    a["bd"] += got
                    if a["bd"] >= a["bk"]:
                        a["br"] = True
                        a["ov"] = True
                        E["st"] = now + a["bs"]
                        E["vu"] = now + a["bs"]
                        E["nx"] = max(E["nx"], E["st"] + 400)
                        self._event({"k": "break", "a": a["id"]})
            d = ENEMIES[E["k"]]
            if d.get("rage") and not E["rg"] and 0 < E["hp"] <= E["mx"] * d["rage"]:
                E["rg"] = True
            if E["hp"] <= 0:
                self._kill(now)
            self.dirty = True
        elif t == "rgparry":
            E = self.enemy
            self._event({"k": "parry", "h": hid})
            if E and not E["dd"] and msg.get("f"):
                self._stun(now, ENEMIES[E["k"]]["stun"])
            self.dirty = True
        elif t == "rgpick":
            h["pk"] = True
            self.dirty = True

    def _event(self, e: dict) -> None:
        self.ev_n += 1
        e["id"] = self.ev_n
        self.ev.append(e)
        if len(self.ev) > EV_KEEP:
            self.ev = self.ev[-EV_KEEP:]

    # ---------- 보내는 모습 ----------
    def snapshot(self, now: int) -> dict:
        return {"run": self.run, "ph": self.phase, "room": self.room, "enc": self.enc,
                "plan": [len(r) for r in self.plan], "sp": self.spawn_at, "ca": self.cards_at, "ea": self.end_at,
                "res": self.result, "e": self.enemy, "a": self.atks, "hs": self.heroes, "ev": self.ev[-12:],
                "ak": self.ack, "stars": self.stars, "loops": self.loops, "seed": self.seed, "now": now}

    def public(self) -> dict:
        """방 상태(state)에 넣는 짧은 요약"""
        return {"run": self.run, "ph": self.phase, "room": self.room, "heroes": list(self.heroes.keys()), "loops": self.loops}


# =====================================================================
#  서버(server.py)와 이어지는 곳
# =====================================================================
def make_session(room, now: int, ath_of) -> RpgSession:
    """대기실 → 같이 모험 시작. 먼저 들어온 사람 4명까지 + AI 동료"""
    people = [p for p in room.ordered_players() if p.connected][:MAX_HEROES]
    humans = [{"id": p.pid, "name": p.name, "ath": p.athlete or "dino"} for p in people]
    used = {h["ath"] for h in humans}
    free = [a for a in ath_of if a not in used]
    n_ai = max(0, min(int(room.rgcfg.get("ai", 0)), MAX_HEROES - len(humans)))
    bots = []
    for i in range(n_ai):
        a = free[i % len(free)] if free else ath_of[i % len(ath_of)]
        bots.append({"id": f"rgai{i + 1}", "name": "AI 동료", "ath": a})
    s = RpgSession(humans, bots, room.host_pid, now)
    stars = [int((room.rgmeta.get(h["id"]) or {}).get("stars") or 0) for h in humans]
    s.set_meta_stars(min(stars) if stars else 0)
    return s


async def run_loop(room, now_ms, broadcast) -> None:
    """방 하나의 진행 틱 (50ms) — 바뀐 게 있으면 80ms 마다 모두에게"""
    import asyncio
    try:
        while room.rsess is not None and room.phase == "rpg":
            s = room.rsess
            t = now_ms()
            if not room.players or (not room.connected_players() and t - room.empty_since > 30 * 60 * 1000):
                break
            # 방장이 끊기면 AI 동료는 다른 사람 폰이 맡아요
            on = {p.pid for p in room.players.values() if p.connected}
            if s.driver not in on and on:
                s.driver = room.host_pid if room.host_pid in on else sorted(on)[0]
                for h in s.heroes.values():
                    if h["b"]:
                        h["dr"] = s.driver
                s.dirty = True
            before = s.run
            s.tick(t, on)
            if s.run != before:
                stars = [int((room.rgmeta.get(pid) or {}).get("stars") or 0) for pid, h in s.heroes.items() if not h["b"]]
                if stars:
                    s.stars = min(stars)
            if s.dirty and t - s.last_send >= SEND_GAP_MS or t - s.last_send >= 1000:
                s.dirty = False
                s.last_send = t
                await broadcast({"t": "rg", "s": s.snapshot(t)})
            await asyncio.sleep(TICK)
    except asyncio.CancelledError:
        pass
