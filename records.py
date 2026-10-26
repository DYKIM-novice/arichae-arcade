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



# =====================================================================
#  별나침반(회귀 RPG) 콤보 명예의 전당 — 장(章)마다 따로
#  - 한 회차를 한 번도 안 쓰러지고 '클리어'한 판만 올라가요 · 값 = 그 판의 최대 콤보(안 맞고 이어 간 패링 수)
#  - 장마다 판이 따로예요 (뒤 장일수록 콤보가 더 길게 나오게 만들 거라서) · 장 id = "s1c1" (시나리오 1 · 1장)
#  - 기록은 rpg_combo.json · 캡처 그림은 rpg_combo/<id>.jpg (기록실과 같은 ARICHAE_DATA_DIR · Render 디스크)
#  - 한 기기(cid)에는 장마다 가장 좋은 기록 하나만 남겨요 · 주간 초기화 없이 영구 보관
# =====================================================================
import base64 as _b64  # noqa: E402

COMBO_CHAPTERS = [{"id": "s1c1", "name": "1장 · 꽃비 항구와 울음곶"}]   # 새 장을 만들면 여기에 더해요
COMBO_MIN = 10              # 이만큼은 이어야 올릴 수 있어요 (화면 combo.js MIN 과 같아요)
COMBO_MAX = 9999
COMBO_KEEP = 100            # 장마다 저장해 두는 기록 수 (보여 주는 건 위에서 COMBO_SHOW 개)
COMBO_SHOW = 20
COMBO_IMG_MAX = 150 * 1024  # 큰 그림(JPEG) 최대 크기
COMBO_THUMB_MAX = 24 * 1024  # 목록용 작은 그림 최대 크기
COMBO_CID_GAP_SEC = 20      # 같은 기기는 20초에 한 번
COMBO_IP_WINDOW_SEC = 600   # 같은 주소(IP)는 10분에
COMBO_IP_MAX = 8            #   8번까지
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ID_RE = re.compile(r"^[0-9a-f]{10}$")
_CID_RE = re.compile(r"^[0-9a-zA-Z_-]{8,40}$")
_CH_IDS = {c["id"] for c in COMBO_CHAPTERS}


def _jpeg(data_url, limit: int) -> Optional[bytes]:
    """'data:image/jpeg;base64,...' → JPEG 바이트 (형식·크기가 틀리면 None)"""
    s = str(data_url or "")
    head = "data:image/jpeg;base64,"
    if not s.startswith(head) or len(s) > limit * 4 // 3 + 64:
        return None
    try:
        raw = _b64.b64decode(s[len(head):], validate=True)
    except (ValueError, TypeError):
        return None
    if len(raw) > limit or len(raw) < 100 or raw[:3] != b"\xff\xd8\xff":
        return None
    return raw


class ComboHall:
    def __init__(self, data_dir: Path):
        self.dir = Path(data_dir)
        self.path = self.dir / "rpg_combo.json"
        self.img_dir = self.dir / "rpg_combo"
        self.lock = threading.Lock()
        self.boards: Dict[str, List[dict]] = {c: [] for c in _CH_IDS}
        self.last_cid: Dict[str, float] = {}
        self.ip_hits: Dict[str, List[float]] = {}
        try:
            if self.path.is_file():
                v = json.loads(self.path.read_text("utf-8"))
                boards = v.get("boards") if isinstance(v, dict) else None
                for ch, rows in (boards or {}).items():
                    if ch in _CH_IDS and isinstance(rows, list):
                        self.boards[ch] = [r for r in rows if isinstance(r, dict) and _ID_RE.match(str(r.get("id", "")))]
        except (OSError, ValueError, AttributeError):
            pass
        for rows in self.boards.values():
            self._sort(rows)

    @staticmethod
    def _sort(rows: List[dict]) -> None:
        rows.sort(key=lambda r: (-int(r.get("combo", 0)), int(r.get("at", 0))))

    def save(self) -> None:
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"boards": self.boards}, ensure_ascii=False), "utf-8")
            os.replace(tmp, self.path)
        except OSError:
            pass

    def img_path(self, entry_id: str) -> Optional[Path]:
        if not _ID_RE.match(str(entry_id or "")):
            return None
        return self.img_dir / (entry_id + ".jpg")

    def _drop_img(self, entry_id: str) -> None:
        p = self.img_path(entry_id)
        try:
            if p and p.is_file():
                p.unlink()
        except OSError:
            pass

    @staticmethod
    def public(r: dict) -> dict:
        out = {k: v for k, v in r.items() if k != "cid"}
        out["img"] = "/api/rpg/combo/img/" + r["id"] + ".jpg"
        return out

    def top(self, ch: str = "", n: int = COMBO_SHOW) -> dict:
        ch = ch if ch in _CH_IDS else COMBO_CHAPTERS[0]["id"]
        with self.lock:
            rows = self.boards.get(ch, [])
            return {"min": COMBO_MIN, "ch": ch, "chapters": COMBO_CHAPTERS,
                    "rows": [dict(self.public(r), rank=i + 1) for i, r in enumerate(rows[:n])]}

    def _rate_ok(self, ip: str, cid: str, now: float) -> bool:
        if cid and now - self.last_cid.get(cid, 0) < COMBO_CID_GAP_SEC:
            return False
        hits = [t for t in self.ip_hits.get(ip, []) if now - t < COMBO_IP_WINDOW_SEC]
        if len(hits) >= COMBO_IP_MAX:
            self.ip_hits[ip] = hits
            return False
        hits.append(now)
        self.ip_hits[ip] = hits
        if cid:
            self.last_cid[cid] = now
        if len(self.ip_hits) > 5000:       # 오래된 주소는 잊어요
            self.ip_hits = {k: v for k, v in self.ip_hits.items() if v and now - v[-1] < COMBO_IP_WINDOW_SEC}
        if len(self.last_cid) > 5000:
            self.last_cid = {k: v for k, v in self.last_cid.items() if now - v < COMBO_CID_GAP_SEC}
        return True

    def submit(self, body: dict, ip: str, now: Optional[float] = None) -> Tuple[int, dict]:
        """(HTTP 상태, 답) · 성공하면 {'ok': True, 'rank', 'entry'}"""
        now = time.time() if now is None else now
        if not isinstance(body, dict):
            return 400, {"ok": False, "err": "bad"}
        ch = str(body.get("ch") or "")
        if ch not in _CH_IDS:
            return 400, {"ok": False, "err": "chapter"}
        if body.get("clear") is not True:
            return 400, {"ok": False, "err": "noclear"}   # 안 쓰러지고 클리어한 판만
        try:
            combo = int(body.get("combo"))
            loop = int(body.get("loop") or 1)
        except (TypeError, ValueError):
            return 400, {"ok": False, "err": "bad"}
        if combo < COMBO_MIN or combo > COMBO_MAX or loop < 1 or loop > 9999:
            return 400, {"ok": False, "err": "range"}
        cid = str(body.get("cid") or "")
        if not _CID_RE.match(cid):
            return 400, {"ok": False, "err": "cid"}
        img = _jpeg(body.get("image"), COMBO_IMG_MAX)
        thumb = _jpeg(body.get("thumb"), COMBO_THUMB_MAX)
        if img is None or thumb is None:
            return 400, {"ok": False, "err": "image"}
        name = clean_text(body.get("name"), NAME_MAX) or "익명 선장"
        g = "f" if body.get("g") == "f" else "m"
        date = str(body.get("date") or "")
        if not _DATE_RE.match(date):
            date = datetime.fromtimestamp(now, KST).strftime("%Y-%m-%d")
        with self.lock:
            rows = self.boards[ch]
            mine = next((r for r in rows if r.get("cid") == cid), None)
            if mine and int(mine["combo"]) >= combo:
                return 200, {"ok": False, "err": "lower", "best": int(mine["combo"]), "rank": rows.index(mine) + 1}
            if len(rows) >= COMBO_KEEP and combo <= int(rows[-1]["combo"]) and not mine:
                return 200, {"ok": False, "err": "low"}
            if not self._rate_ok(ip or "?", cid, now):
                return 429, {"ok": False, "err": "rate"}
            entry = {
                "id": secrets.token_hex(5), "ch": ch, "name": name, "combo": combo, "loop": loop, "g": g,
                "date": date, "at": int(now * 1000), "cid": cid,
                "thumb": "data:image/jpeg;base64," + _b64.b64encode(thumb).decode("ascii"),
            }
            try:
                self.img_dir.mkdir(parents=True, exist_ok=True)
                self.img_path(entry["id"]).write_bytes(img)
            except OSError:
                return 500, {"ok": False, "err": "disk"}
            if mine:
                rows.remove(mine)
                self._drop_img(mine["id"])
            rows.append(entry)
            self._sort(rows)
            for old in rows[COMBO_KEEP:]:
                self._drop_img(old["id"])
            del rows[COMBO_KEEP:]
            self.save()
            rank = rows.index(entry) + 1
            return 200, {"ok": True, "rank": rank, "entry": dict(self.public(entry), rank=rank)}
