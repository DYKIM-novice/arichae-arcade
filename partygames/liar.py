"""라이어 게임 (바보 모드) — 3~8명, 사람끼리

한 판:
  look     각자 몰래 제시어 확인 (라이어는 비슷한 다른 단어를 받아서 자기가 라이어인 줄 몰라요)
  talk     정해진 순서로 두 바퀴 설명. 말로(voice): [다 말했어요] / 글로(text): 한 줄(30자)
  discuss  자유 토론 60초 (글로: 아무나 채팅 · 말로: 타이머만). 모두 [투표하러 가기]를 누르면 바로 투표
  vote     라이어라고 생각하는 사람에게 투표 (나는 못 골라요). 동점이면 동점자끼리 한 번 더, 또 같으면 라이어가 빠져나가요
  guess    라이어가 잡히면 → 이제야 자기가 라이어인 걸 알아요. 보기 8개 중 진짜 제시어를 맞히면 역전
  result   점수: 라이어 잡고 못 맞히면 나머지 모두 +1 · 라이어가 안 잡히거나 맞히면 라이어 +3

설명·채팅 글: 제시어(두 단어 모두)를 그대로 쓰면 막아요. 나쁜 말은 ♡ 로.
"""
import random
import time
from typing import Dict, List, Optional

from records import clean_text
from .liar_words import TOPICS, words_of

LOOK_SEC = 25
TALK_VOICE_SEC = 30
TALK_TEXT_SEC = 45
DISCUSS_SEC = 60
VOTE_SEC = 30
GUESS_SEC = 25
RESULT_SEC = 9
LAPS = 2
TEXT_MAX = 30
CHAT_MAX = 40


def norm(s: str) -> str:
    return "".join(str(s).split()).lower()


class Liar:
    TAKES_OPTS = True
    MAX_ACT = 600
    turn_seconds = 0

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random, opts: Optional[dict] = None):
        o = opts or {}
        self.n = n_seats
        self.names = names
        self.rng = rng
        self.talk_mode = o.get("talk", "voice")
        self.topic_opt = o.get("topic", "any")
        self.rounds = int(o.get("rounds", 3))
        self.score = [0] * n_seats
        self.round = 0
        self.over = False
        self.deadline = 0
        self.used = set()
        self.history: List[dict] = []
        self._new_round()

    # ---------------- 판 ----------------
    def _new_round(self) -> None:
        if self.round >= self.rounds:
            self.over = True
            self.phase = "done"
            return
        self.round += 1
        topics = list(TOPICS) if self.topic_opt == "any" else [self.topic_opt]
        for _ in range(50):
            self.topic = self.rng.choice(topics)
            pair = self.rng.choice(TOPICS[self.topic][1])
            if pair not in self.used:
                break
        self.used.add(pair)
        a, b = pair if self.rng.random() < 0.5 else (pair[1], pair[0])
        self.word, self.fake = a, b                      # 모두의 제시어 · 라이어의 제시어
        self.liar = self.rng.randrange(self.n)
        start = self.rng.randrange(self.n)
        self.order = [(start + k) % self.n for k in range(self.n)]
        self.turn_i = 0                                  # order 안 몇 번째 (바퀴 포함: turn_i // n = 바퀴)
        self.feed: List[dict] = []                       # 설명·채팅 {s, k: 'talk'|'chat'|'skip', t, at}
        self.ready = [False] * self.n
        self.votes: List[Optional[int]] = [None] * self.n
        self.vote_pool = list(range(self.n))             # 투표 받을 수 있는 사람 (재투표면 동점자만)
        self.revote = False
        self.caught: Optional[int] = None
        self.tally: List[int] = []
        self.options: List[str] = []
        self.guess: Optional[str] = None
        self.outcome: Optional[dict] = None
        self.last_chat = [0.0] * self.n
        self._phase("look", LOOK_SEC)

    def _phase(self, ph: str, sec: float) -> None:
        self.phase = ph
        self.ready = [False] * self.n
        self.deadline = time.time() + sec if sec else 0

    def speaker(self) -> int:
        return self.order[self.turn_i % self.n] if self.phase == "talk" else -1

    def actor(self) -> int:
        return -1          # 모두 동시에 (차례는 화면에서 보여 줘요)

    def _next_speaker(self) -> None:
        self.turn_i += 1
        if self.turn_i >= self.n * LAPS:
            self._phase("discuss", DISCUSS_SEC)
        else:
            self.deadline = time.time() + (TALK_TEXT_SEC if self.talk_mode == "text" else TALK_VOICE_SEC)

    def _start_vote(self, pool: List[int]) -> None:
        self.vote_pool = pool
        self.votes = [None] * self.n
        self._phase("vote", VOTE_SEC)

    def _tally(self) -> None:
        cnt = [0] * self.n
        for v in self.votes:
            if v is not None:
                cnt[v] += 1
        self.tally = cnt
        best = max(cnt[i] for i in self.vote_pool)
        top = [i for i in self.vote_pool if cnt[i] == best]
        if best == 0 or len(top) > 1:
            if not self.revote and best > 0:
                self.revote = True
                self.feed.append({"s": -1, "k": "sys", "t": "동점이에요! 동점인 사람 가운데에서 한 번 더 투표해요", "at": time.time()})
                self._start_vote(top)
                return
            self._finish(caught=None)          # 못 정했어요 → 라이어가 빠져나가요
            return
        self.caught = top[0]
        if self.caught == self.liar:
            pool = [w for w in words_of(self.topic) if w not in (self.word, self.fake)]
            self.rng.shuffle(pool)
            self.options = pool[:7] + [self.word]
            self.rng.shuffle(self.options)
            self._phase("guess", GUESS_SEC)
        else:
            self._finish(caught=self.caught)

    def _finish(self, caught: Optional[int], guessed: bool = False) -> None:
        liar_win = caught != self.liar or guessed
        gain = [0] * self.n
        if liar_win:
            gain[self.liar] = 3
        else:
            for i in range(self.n):
                if i != self.liar:
                    gain[i] = 1
        for i in range(self.n):
            self.score[i] += gain[i]
        why = ("라이어를 못 찾았어요" if caught is None else "엉뚱한 사람을 지목했어요") if caught != self.liar else \
            ("라이어가 제시어를 맞혔어요!" if guessed else "라이어를 잡았어요!")
        self.outcome = {"liar": self.liar, "caught": caught, "guessed": guessed, "guess": self.guess,
                        "liarWin": liar_win, "why": why, "gain": gain, "word": self.word, "fake": self.fake,
                        "tally": self.tally}
        self.history.append({"round": self.round, "word": self.word, "fake": self.fake, "liar": self.liar, "liarWin": liar_win})
        self._phase("result", RESULT_SEC)

    def step(self) -> Optional[float]:
        if self.over:
            return None
        now = time.time()
        if self.deadline and now >= self.deadline:
            ph = self.phase
            if ph == "look":
                self._phase("talk", 0)
                self.turn_i = -1
                self._next_speaker()
            elif ph == "talk":
                self.feed.append({"s": self.speaker(), "k": "skip", "t": "", "at": now})
                self._next_speaker()
            elif ph == "discuss":
                self._start_vote(list(range(self.n)))
            elif ph == "vote":
                self._tally()
            elif ph == "guess":
                self._finish(caught=self.liar, guessed=False)
            elif ph == "result":
                self._new_round()
        return 0.1

    # ---------------- 수 ----------------
    def _bad_word(self, text: str) -> bool:
        t = norm(text)
        return norm(self.word) in t or norm(self.fake) in t

    def act(self, i: int, a: dict) -> Optional[str]:
        k = a.get("k")
        ph = self.phase
        now = time.time()
        if k == "ready" and ph in ("look", "discuss"):
            self.ready[i] = True
            if all(self.ready):
                if ph == "look":
                    self._phase("talk", 0)
                    self.turn_i = -1
                    self._next_speaker()
                else:
                    self._start_vote(list(range(self.n)))
            return None
        if k == "talk" and ph == "talk":
            if i != self.speaker():
                return "내 차례가 아니에요"
            if self.talk_mode == "text":
                raw = str(a.get("t") or "").strip()
                if not raw:
                    return "설명을 한 줄 써 주세요"
                if self._bad_word(raw):
                    return "제시어를 그대로 쓰면 안 돼요!"
                self.feed.append({"s": i, "k": "talk", "t": clean_text(raw, TEXT_MAX), "at": now})
            else:
                self.feed.append({"s": i, "k": "talk", "t": "", "at": now})
            self._next_speaker()
            return None
        if k == "chat" and ph in ("talk", "discuss") and self.talk_mode == "text":
            if ph == "talk":
                return "토론 시간에 이야기해요"
            if now - self.last_chat[i] < 1.5:
                return "조금 천천히 써요"
            raw = str(a.get("t") or "").strip()
            if not raw:
                return None
            if self._bad_word(raw):
                return "제시어를 그대로 쓰면 안 돼요!"
            self.last_chat[i] = now
            self.feed.append({"s": i, "k": "chat", "t": clean_text(raw, CHAT_MAX), "at": now})
            self.feed = self.feed[-80:]
            return None
        if k == "vote" and ph == "vote":
            try:
                v = int(a.get("v"))
            except (TypeError, ValueError):
                return "누구에게 투표할지 골라요"
            if v == i:
                return "나에게는 투표할 수 없어요"
            if v not in self.vote_pool:
                return "그 사람은 이번 투표에 없어요"
            self.votes[i] = v
            if all(x is not None for x in self.votes):
                self._tally()
            return None
        if k == "guess" and ph == "guess":
            if i != self.liar:
                return "라이어만 고를 수 있어요"
            g = str(a.get("w") or "")
            if g not in self.options:
                return "보기 가운데에서 골라요"
            self.guess = g
            self._finish(caught=self.liar, guessed=(g == self.word))
            return None
        if k == "skip" and ph == "result":
            return None
        return None

    def timeout_action(self, i: int) -> dict:
        return {}

    def ai_action(self, i: int) -> dict:
        return {}

    def ai_delay(self, i: int) -> float:
        return 1.0

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        reveal = self.phase in ("result", "done") or self.over
        v = {
            "phase": self.phase, "round": self.round, "rounds": self.rounds, "talk": self.talk_mode,
            "topic": TOPICS[self.topic][0] if self.round else "", "deadline": int(self.deadline * 1000) if self.deadline else 0,
            "order": self.order, "turn": self.turn_i, "laps": LAPS, "speaker": self.speaker(),
            "feed": self.feed[-60:], "ready": self.ready[:], "voted": [x is not None for x in self.votes],
            "pool": self.vote_pool, "revote": self.revote, "score": self.score[:], "me": seat, "over": self.over,
        }
        if self.phase in ("guess", "result", "done") and self.caught is not None:
            v["caught"] = self.caught
            v["tally"] = self.tally
        if self.phase == "guess":
            v["liar"] = self.liar            # 잡힌 사람이 라이어라는 건 이제 모두 알아요
            v["options"] = self.options
        if reveal and self.outcome:
            v["outcome"] = self.outcome
        if seat is not None and self.round:
            v["word"] = self.fake if seat == self.liar else self.word
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: -self.score[j])
        return {"winner": order[0], "rank": order, "score": self.score[:], "hands": self.round}
