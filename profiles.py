"""아리채 오락실 · 올림픽관 레벨 (가입 없이 기기마다)

- 폰·태블릿마다 처음 열 때 만든 '기기 번호(dev)'로 사람을 알아봐요 (localStorage). 들어올 때 서버로 보내요.
- 경험치(XP)는 서버가 계산해요: 올림픽 방 경기(참가 · 순위 · 메달 · 개인 기록) + 혼자 연습(하루 한도 있음)
- 저장은 DATA_DIR/profiles.json 하나 (기록실 records.json 처럼 통째로 바꿔 써요)

레벨 곡선: Lv L → L+1 에 필요한 XP = 60 + 20 × (L - 1)   (Lv10 = 1260, Lv20 = 4560, Lv30 = 9860 누적)
등급(방 입장 제한에 써요): 이지 Lv1~9 · 노멀 Lv10~19 · 하드 Lv20~29 · 헬 Lv30~
"""
import json
import os
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Optional, Tuple

KST = timezone(timedelta(hours=9))
MAX_LV = 99

TIERS = ("all", "easy", "normal", "hard", "hell")
TIER_NAME = {"all": "전체", "easy": "이지", "normal": "노멀", "hard": "하드", "hell": "헬"}
TIER_BAND = {"easy": (1, 9), "normal": (10, 19), "hard": (20, 29), "hell": (30, MAX_LV)}
TIER_AI = {"easy": 1, "normal": 3, "hard": 4, "hell": 5}      # 등급 방의 기본 AI 단계

# 방 경기 XP
XP_PLAY = 20                       # 한 종목 참가
XP_RANK_TOP = 30                   # 1등 순위 보너스 (꼴찌 0, 사이는 고르게)
XP_MEDAL = {1: 40, 2: 25, 3: 15}   # 금·은·동
XP_PB = 30                         # 개인 기록 (이 기기의 이 종목 최고 기록을 넘으면)
XP_FIRST = 10                      # 이 종목 첫 기록
# 혼자 연습 XP (가볍게 · 하루 한도)
PXP_BASE = 4
PXP_WIN = 3                        # AI 를 모두 이기면
PXP_DIFF = {"easy": 0, "normal": 1, "hard": 2, "hell": 4}
PXP_PB = 8                         # 그 난이도 개인 기록
PXP_DAY_CAP = 120
PXP_MIN_GAP_SEC = 8                # 연습 한 판은 적어도 이만큼 걸려요 (너무 자주 오면 무시)

_DEV_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}$")


def clean_dev(raw) -> str:
    s = str(raw or "").strip()
    return s if _DEV_RE.match(s) else ""


def need_for(lv: int) -> int:
    """Lv lv → lv+1 에 필요한 XP"""
    return 60 + 20 * (max(1, lv) - 1)


def level_of(xp: int) -> Tuple[int, int, int]:
    """누적 XP → (레벨, 이번 레벨에서 모은 XP, 다음 레벨까지 필요한 XP)"""
    lv = 1
    left = max(0, int(xp))
    while lv < MAX_LV and left >= need_for(lv):
        left -= need_for(lv)
        lv += 1
    return lv, left, need_for(lv)


def tier_of_level(lv: int) -> str:
    for t, (a, b) in TIER_BAND.items():
        if a <= lv <= b:
            return t
    return "easy"


def tier_allows(tier: str, lv: int) -> bool:
    if tier not in TIER_BAND:
        return True
    a, b = TIER_BAND[tier]
    return a <= lv <= b


def tier_label(tier: str) -> str:
    if tier not in TIER_BAND:
        return TIER_NAME["all"]
    a, b = TIER_BAND[tier]
    return f"{TIER_NAME[tier]}(Lv{a}~{b})" if b < MAX_LV else f"{TIER_NAME[tier]}(Lv{a}~)"


def today() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


class ProfileStore:
    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir)
        self.path = self.dir / "profiles.json"
        self.lock = threading.Lock()
        self.data: Dict[str, dict] = {}
        self.dirty = False
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            if self.path.is_file():
                loaded = json.loads(self.path.read_text("utf-8"))
                if isinstance(loaded, dict) and isinstance(loaded.get("devs"), dict):
                    self.data = loaded["devs"]
        except (OSError, ValueError):
            pass

    def save(self) -> None:
        with self.lock:
            blob = json.dumps({"v": 1, "devs": self.data}, ensure_ascii=False)
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(blob, "utf-8")
            os.replace(tmp, self.path)
        except OSError:
            pass

    def _get(self, dev: str) -> dict:
        p = self.data.get(dev)
        if not isinstance(p, dict):
            p = {"xp": 0, "name": "", "events": 0, "wins": 0, "medals": [0, 0, 0], "pbs": {}, "ppb": {}, "pday": "", "pxp": 0, "plast": 0, "at": 0}
            self.data[dev] = p
        for k, v in (("xp", 0), ("events", 0), ("wins", 0), ("medals", [0, 0, 0]), ("pbs", {}), ("ppb", {}), ("pday", ""), ("pxp", 0), ("plast", 0)):
            p.setdefault(k, v)
        return p

    def level(self, dev: str) -> int:
        """기기 번호가 없거나 처음이면 Lv1"""
        if not dev:
            return 1
        with self.lock:
            p = self.data.get(dev)
            return level_of(p.get("xp", 0))[0] if isinstance(p, dict) else 1

    def info(self, dev: str) -> dict:
        with self.lock:
            p = self.data.get(dev) if dev else None
            xp = int(p.get("xp", 0)) if isinstance(p, dict) else 0
        lv, cur, need = level_of(xp)
        return {"lv": lv, "xp": xp, "xpIn": cur, "xpNeed": need, "tier": tier_of_level(lv)}

    def touch(self, dev: str, name: str) -> None:
        if not dev:
            return
        with self.lock:
            p = self._get(dev)
            p["name"] = str(name or "")[:10]
            p["at"] = int(time.time())
        self.dirty = True

    def award_event(self, dev: str, gid: str, score: int, rank: int, n: int, medal: int) -> dict:
        """방 경기 한 종목 → XP 계산 · 기록 (돌려주는 값: gained, parts, lv, prev, lvUp …)"""
        with self.lock:
            p = self._get(dev)
            prev_lv = level_of(p["xp"])[0]
            parts = [["참가", XP_PLAY]]
            if n >= 2:
                rb = round(XP_RANK_TOP * (n - rank) / (n - 1))
                if rb > 0:
                    parts.append([f"{rank}위", rb])
            if medal in XP_MEDAL:
                parts.append([("금메달", "은메달", "동메달")[medal - 1], XP_MEDAL[medal]])
                p["medals"][medal - 1] += 1
            old = int(p["pbs"].get(gid, 0) or 0)
            if score > 0 and score > old:
                parts.append(["개인 기록" if old else "첫 기록", XP_PB if old else XP_FIRST])
                p["pbs"][gid] = int(score)
            gained = sum(v for _, v in parts)
            p["xp"] = int(p["xp"]) + gained
            p["events"] += 1
            if rank == 1 and n >= 2:
                p["wins"] += 1
            lv, cur, need = level_of(p["xp"])
        self.dirty = True
        return {"gained": gained, "parts": parts, "lv": lv, "prev": prev_lv, "lvUp": lv > prev_lv, "xpIn": cur, "xpNeed": need}

    def award_practice(self, dev: str, gid: str, diff: str, score: int, beat_all: bool) -> dict:
        """혼자 연습 한 판 → 작은 XP (하루 한도 · 너무 자주 오면 0)"""
        now = time.time()
        with self.lock:
            p = self._get(dev)
            prev_lv = level_of(p["xp"])[0]
            day = today()
            if p.get("pday") != day:
                p["pday"] = day
                p["pxp"] = 0
            parts = []
            if now - float(p.get("plast") or 0) >= PXP_MIN_GAP_SEC:
                p["plast"] = now
                parts.append(["연습", PXP_BASE])
                if PXP_DIFF.get(diff):
                    parts.append(["난이도", PXP_DIFF[diff]])
                if beat_all:
                    parts.append(["AI 모두 이김", PXP_WIN])
                key = f"{gid}@{diff}"
                old = int(p["ppb"].get(key, 0) or 0)
                if score > 0 and score > old:
                    p["ppb"][key] = int(score)
                    if old:
                        parts.append(["개인 기록", PXP_PB])
            want = sum(v for _, v in parts)
            room_left = max(0, PXP_DAY_CAP - int(p["pxp"]))
            gained = min(want, room_left)
            p["pxp"] = int(p["pxp"]) + gained
            p["xp"] = int(p["xp"]) + gained
            lv, cur, need = level_of(p["xp"])
        if gained:
            self.dirty = True
        return {"gained": gained, "parts": parts, "capped": gained < want, "left": max(0, PXP_DAY_CAP - p["pxp"]),
                "lv": lv, "prev": prev_lv, "lvUp": lv > prev_lv, "xpIn": cur, "xpNeed": need}
