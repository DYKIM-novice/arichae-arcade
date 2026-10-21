"""그림 전달 (텔레스트레이션 방식) — 3~8명, 사람끼리

- 각자 제시어를 하나씩 받아요 (공책 한 권 = 제시어 하나)
- 차례(step)마다 모두 동시에, 공책을 한 칸씩 옆으로 넘겨요
    step 0: 내 공책의 제시어를 그림으로
    step 1: 옆 사람 그림을 보고 무엇인지 글로
    step 2: 그 글을 다시 그림으로 … (사람 수만큼)
- 다 돌면 공책을 한 권씩 펼쳐 보며 [다음 ▶] (누구나 눌러요) · 마음에 드는 그림·답에 ♥
- 점수: 받은 ♥ 하나에 1점 + 공책 마지막 답이 처음 제시어와 같으면 그 공책에 참여한 모두 +2

그림: 손가락 선 모음 — 선마다 [색, 굵기, x1, y1, x2, y2, ...] (0~1000 좌표)
"""
import random
import time
from typing import Dict, List, Optional

from records import clean_text

GUESS_SEC = 35
GUESS_MAX = 20
WORDS = [
    "기린", "눈사람", "무지개", "로켓", "피자", "우산", "해바라기", "자전거", "공룡", "성", "해적", "문어", "거미줄",
    "아이스크림", "비행기", "수박", "생일 케이크", "소방차", "등대", "화산", "유령", "로봇", "왕관", "마법사", "인어공주",
    "외계인", "달팽이", "롤러코스터", "텐트", "피라미드", "낙하산", "펭귄", "카멜레온", "고슴도치", "햄버거", "기차",
    "잠수함", "선인장", "허수아비", "해골", "용", "유니콘", "캥거루", "거북이", "치과의사", "축구공", "눈사태", "번개",
    "놀이터", "그네", "미끄럼틀", "시소", "목도리", "장화", "안경", "칫솔", "냉장고", "세탁기", "청소기", "시계탑",
    "에펠탑", "자유의 여신상", "만리장성", "산타클로스", "루돌프", "크리스마스트리", "호박등", "마녀 빗자루", "보물상자",
    "오징어", "꽃게", "상어", "고래", "불가사리", "해파리", "부엉이", "공작새", "앵무새", "닭", "병아리", "달걀프라이",
    "라면", "김밥", "떡볶이", "솜사탕", "팝콘", "핫도그", "도넛", "바나나", "포도", "딸기", "파인애플", "옥수수",
    "춤추는 코끼리", "잠자는 고양이", "하늘을 나는 돼지", "비 오는 날", "눈싸움", "생일 파티", "캠핑", "낚시", "스키",
    "수영장", "우주비행사", "슈퍼히어로", "닌자", "왕자님", "공주님", "요리사", "소방관", "경찰차", "구급차", "헬리콥터",
    "열기구", "풍선", "연날리기", "모래성", "썰매", "눈사람 만들기", "줄다리기", "숨바꼭질", "방귀", "재채기", "코골이",
]


def norm(s: str) -> str:
    return "".join(str(s).split()).lower()


class Tele:
    TAKES_OPTS = True
    MAX_ACT = 60000
    turn_seconds = 0

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        o = opts or {}
        self.n = n_seats
        self.names = names
        self.rng = rng
        self.draw_sec = int(o.get("drawSec", 60))
        self.over = False
        words = self.rng.sample(WORDS, n_seats)
        # 공책 b: 주인 b, pages[0] = 제시어, pages[k] = k번째 사람이 한 것 (그림 또는 글)
        self.books: List[dict] = [{"owner": b, "word": words[b], "pages": []} for b in range(n_seats)]
        self.steps = n_seats
        self.step_i = 0
        self.done = [False] * n_seats
        self.hearts: Dict[str, set] = {}        # "b:k" → 누른 사람들
        self.rev_b = 0
        self.rev_k = 0
        self.last_next = 0.0
        self.phase = "draw"
        self.deadline = time.time() + self.draw_sec + 3

    # step s 에서 사람 p 가 맡은 공책
    def book_of(self, p: int, s: Optional[int] = None) -> int:
        s = self.step_i if s is None else s
        return (p - s) % self.n

    def kind(self, s: Optional[int] = None) -> str:
        s = self.step_i if s is None else s
        return "draw" if s % 2 == 0 else "guess"

    def actor(self) -> int:
        return -1

    def _prompt(self, b: int) -> dict:
        """지금 이 공책에서 보고 해야 할 것 (그릴 말 또는 맞힐 그림)"""
        bk = self.books[b]
        if not bk["pages"]:
            return {"t": "word", "v": bk["word"]}
        last = bk["pages"][-1]
        return {"t": last["t"], "v": last["v"]}

    def _submit(self, p: int, kind: str, val) -> None:
        b = self.book_of(p)
        bk = self.books[b]
        if len(bk["pages"]) != self.step_i:
            return
        bk["pages"].append({"t": kind, "v": val, "by": p})
        self.done[p] = True
        if all(self.done):
            self._next_step()

    def _next_step(self) -> None:
        # 못 낸 사람은 빈 칸으로
        for p in range(self.n):
            if not self.done[p]:
                b = self.book_of(p)
                if len(self.books[b]["pages"]) == self.step_i:
                    self.books[b]["pages"].append({"t": "draw" if self.kind() == "draw" else "guess", "v": [] if self.kind() == "draw" else "", "by": p, "miss": True})
        self.step_i += 1
        self.done = [False] * self.n
        if self.step_i >= self.steps:
            self.phase = "reveal"
            self.deadline = 0
            self.rev_b = 0
            self.rev_k = 0
            return
        self.phase = self.kind()
        self.deadline = time.time() + (self.draw_sec if self.phase == "draw" else GUESS_SEC) + 2

    def step(self) -> Optional[float]:
        if self.over:
            return None
        if self.phase in ("draw", "guess") and self.deadline and time.time() >= self.deadline:
            self._next_step()
        return 0.1

    @staticmethod
    def _clean_drawing(raw) -> Optional[list]:
        if not isinstance(raw, list) or len(raw) > 400:
            return None
        out = []
        total = 0
        for st in raw:
            if not isinstance(st, list) or len(st) < 4 or len(st) % 2:
                continue
            try:
                c = int(st[0]) % 10
                w = max(1, min(4, int(st[1])))
                pts = [max(0, min(1000, int(x))) for x in st[2:]]
            except (TypeError, ValueError):
                continue
            total += len(pts)
            if total > 12000:
                break
            out.append([c, w] + pts)
        return out

    def act(self, i: int, a: dict) -> Optional[str]:
        k = a.get("k")
        if k == "draw" and self.phase == "draw" and not self.done[i]:
            d = self._clean_drawing(a.get("d"))
            if d is None:
                return "그림을 보낼 수 없어요"
            self._submit(i, "draw", d)
            return None
        if k == "guess" and self.phase == "guess" and not self.done[i]:
            g = clean_text(a.get("g"), GUESS_MAX)
            if not g:
                return "무엇인지 한 마디 써 주세요"
            self._submit(i, "guess", g)
            return None
        if k == "next" and self.phase == "reveal":
            now = time.time()
            if now - self.last_next < 0.6:
                return None
            self.last_next = now
            bk = self.books[self.rev_b]
            if self.rev_k < len(bk["pages"]):
                self.rev_k += 1
            elif self.rev_b + 1 < self.n:
                self.rev_b += 1
                self.rev_k = 0
            else:
                self.over = True
                self.phase = "done"
            return None
        if k == "heart" and self.phase == "reveal":
            try:
                b, pg = int(a.get("b")), int(a.get("p"))
            except (TypeError, ValueError):
                return None
            if not (0 <= b < self.n) or not (0 <= pg < len(self.books[b]["pages"])) or (b, pg) > (self.rev_b, self.rev_k - 1):
                return None
            if self.books[b]["pages"][pg]["by"] == i:
                return "내 것에는 ♥를 못 눌러요"
            s = self.hearts.setdefault(f"{b}:{pg}", set())
            s.symmetric_difference_update({i})
            return None
        return None

    def timeout_action(self, i: int) -> dict:
        return {}

    def ai_action(self, i: int) -> dict:
        return {}

    def ai_delay(self, i: int) -> float:
        return 1.0

    def _match(self, b: int) -> bool:
        bk = self.books[b]
        last = next((p for p in reversed(bk["pages"]) if p["t"] == "guess" and not p.get("miss")), None)
        return bool(last) and norm(last["v"]) == norm(bk["word"])

    def scores(self) -> List[int]:
        sc = [0] * self.n
        for key, who in self.hearts.items():
            b, pg = map(int, key.split(":"))
            sc[self.books[b]["pages"][pg]["by"]] += len(who)
        for b in range(self.n):
            if self._match(b):
                for p in self.books[b]["pages"]:
                    sc[p["by"]] += 2
        return sc

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {"phase": self.phase, "step": self.step_i, "steps": self.steps, "deadline": int(self.deadline * 1000) if self.deadline else 0,
             "done": self.done[:], "me": seat, "over": self.over, "drawSec": self.draw_sec, "n": self.n}
        if self.phase in ("draw", "guess") and seat is not None:
            b = self.book_of(seat)
            v["book"] = b
            v["owner"] = self.books[b]["owner"]
            v["prompt"] = self._prompt(b)
            v["mineDone"] = self.done[seat]
        if self.phase in ("reveal", "done"):
            b = min(self.rev_b, self.n - 1)
            bk = self.books[b]
            k = self.rev_k if self.phase == "reveal" else len(bk["pages"])
            v["rev"] = {"b": b, "k": k, "owner": bk["owner"], "word": bk["word"],
                        "pages": [{"t": p["t"], "v": p["v"], "by": p["by"], "miss": p.get("miss", False),
                                   "hearts": len(self.hearts.get(f"{b}:{j}", ())),
                                   "mine": seat is not None and seat in self.hearts.get(f"{b}:{j}", ())} for j, p in enumerate(bk["pages"][:k])],
                        "total": len(bk["pages"]), "match": self._match(b) if k >= len(bk["pages"]) else None}
            v["score"] = self.scores()
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        sc = self.scores()
        order = sorted(range(self.n), key=lambda j: -sc[j])
        return {"winner": order[0], "rank": order, "score": sc, "hands": 1}
