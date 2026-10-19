"""아리채 오락실 · 기록실 (게임별 이번 주 Top 10 + 명예의 전당)

- 매주 일요일 밤 12시(한국 시간, 월요일 00:00)에 Top 10 을 비워요.
- 비우기 전에 게임마다 그 주 1위를 명예의 전당(hall)에 영구 보관해요.
- 기록은 JSON 파일 하나(records.json)에 저장해요. 폴더는 ARICHAE_DATA_DIR (Render 디스크) .
"""
import json
import os
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

KST = timezone(timedelta(hours=9))
TOP_N = 10
NAME_MAX = 10
COMMENT_MAX = 40
EDIT_WINDOW_SEC = 30 * 60   # 기록을 세운 뒤 이 시간 안에만 이름·한마디를 고칠 수 있어요

# ---------------- 욕설 거르기 ----------------
# 놀리는 말은 괜찮고, 욕설·비속어만 ♡ 로 바꿔요. (띄어쓰기·숫자·기호를 섞어 써도 잡아요)
_BAD = [
    "시발", "씨발", "씨팔", "시팔", "씨빨", "시바", "씨바", "쓰발", "ㅅㅂ", "ㅆㅂ", "ㅅ1ㅂ", "십새", "씹",
    "병신", "븅신", "빙신", "ㅂㅅ", "ㅄ", "개새끼", "개새기", "개색기", "개색끼", "개세끼", "개섀끼",
    "좆", "존나", "졸라", "ㅈㄴ", "지랄", "ㅈㄹ", "염병", "엠창", "니미", "느금", "느그애미", "애미", "애비",
    "미친놈", "미친년", "미친새", "또라이", "똘아이", "등신", "찐따", "썅", "쌍놈", "쌍년",
    "fuck", "fuk", "shit", "bitch", "asshole", "dick", "pussy", "bastard", "cunt", "motherfucker", "wtf",
]
_SEP = r"[\s\d_.\-~!@#$%^&*()=+|\\/,;:'\"`<>?ㆍ·…]*"


def _bad_regex() -> "re.Pattern[str]":
    parts = []
    for w in sorted(set(_BAD), key=len, reverse=True):
        parts.append(_SEP.join(re.escape(ch) for ch in w))
    return re.compile("|".join(parts), re.IGNORECASE)


_BAD_RE = _bad_regex()


def clean_text(raw, limit: int) -> str:
    s = " ".join(str(raw or "").replace("\n", " ").split())
    s = _BAD_RE.sub(lambda m: "♡" * max(2, min(4, len(m.group(0)) // 2 or 2)), s)
    return s[:limit]


# ---------------- 주(週) 계산 ----------------
def week_start(ts: Optional[float] = None) -> datetime:
    """그 시각이 속한 주의 월요일 00:00 (한국 시간)"""
    now = datetime.fromtimestamp(ts if ts is not None else time.time(), KST)
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday


def week_key(ts: Optional[float] = None) -> str:
    return week_start(ts).strftime("%Y-%m-%d")


def week_label(key: str) -> str:
    d = datetime.strptime(key, "%Y-%m-%d")
    e = d + timedelta(days=6)
    return f"{d.year}년 {d.month}/{d.day}~{e.month}/{e.day}"


class RecordStore:
    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir)
        self.path = self.dir / "records.json"
        self.lock = threading.Lock()
        self.data = {"week": week_key(), "boards": {}, "hall": []}
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            if self.path.is_file():
                loaded = json.loads(self.path.read_text("utf-8"))
                if isinstance(loaded, dict):
                    self.data.update(loaded)
        except (OSError, ValueError):
            pass
        self.rollover()

    # ---------- 저장 ----------
    def save(self) -> None:
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.data, ensure_ascii=False), "utf-8")
            os.replace(tmp, self.path)
        except OSError:
            pass

    def rollover(self, ts: Optional[float] = None) -> bool:
        """주가 바뀌었으면 게임마다 1위를 명예의 전당으로 옮기고 Top 10 을 비워요."""
        cur = week_key(ts)
        if self.data.get("week") == cur:
            return False
        old = self.data.get("week") or cur
        for board, rows in sorted(self.data.get("boards", {}).items()):
            if rows:
                champ = dict(rows[0])
                champ["board"] = board
                champ["week"] = old
                champ["weekLabel"] = week_label(old)
                champ.pop("owner", None)
                self.data["hall"].append(champ)
        self.data["boards"] = {}
        self.data["week"] = cur
        self.save()
        return True

    # ---------- 기록 ----------
    @staticmethod
    def _sort(rows: List[dict]) -> None:
        rows.sort(key=lambda r: (-r["score"], r["at"]))

    def qualifies(self, board: str, score: int) -> bool:
        rows = self.data["boards"].get(board, [])
        return score > 0 and (len(rows) < TOP_N or score > rows[-1]["score"])

    def submit(self, board: str, score: int, name: str, animal: str, owner: str,
               detail: str = "", comment: str = "") -> Optional[Tuple[int, dict]]:
        """Top 10 에 들면 (등수, 기록) 을, 아니면 None"""
        with self.lock:
            self.rollover()
            score = int(score)
            if not self.qualifies(board, score):
                return None
            entry = {
                "id": secrets.token_hex(5),
                "name": clean_text(name, NAME_MAX) or "익명",
                "comment": clean_text(comment, COMMENT_MAX),
                "animal": str(animal or "")[:16],
                "score": score,
                "detail": str(detail or "")[:40],
                "at": int(time.time() * 1000),
                "owner": owner,
            }
            rows = self.data["boards"].setdefault(board, [])
            rows.append(entry)
            self._sort(rows)
            del rows[TOP_N:]
            self.save()
            return rows.index(entry) + 1, self.public(entry)

    def edit(self, entry_id: str, owner: str, name, comment) -> Optional[dict]:
        with self.lock:
            for rows in self.data["boards"].values():
                for e in rows:
                    if e["id"] == entry_id:
                        if e.get("owner") != owner or time.time() * 1000 - e["at"] > EDIT_WINDOW_SEC * 1000:
                            return None
                        n = clean_text(name, NAME_MAX)
                        if n:
                            e["name"] = n
                        e["comment"] = clean_text(comment, COMMENT_MAX)
                        self.save()
                        return self.public(e)
        return None

    @staticmethod
    def public(e: dict) -> dict:
        return {k: v for k, v in e.items() if k != "owner"}

    def snapshot(self) -> dict:
        with self.lock:
            self.rollover()
            ws = week_start()
            reset_at = int((ws + timedelta(days=7)).timestamp() * 1000)
            return {
                "week": self.data["week"],
                "weekLabel": week_label(self.data["week"]),
                "resetAt": reset_at,
                "now": int(time.time() * 1000),
                "boards": {b: [self.public(e) for e in rows] for b, rows in self.data["boards"].items() if rows},
                "hall": [self.public(e) for e in self.data["hall"][-600:]],
            }
