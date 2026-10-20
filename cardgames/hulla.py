"""훌라 (전투 훌라 · 우리 집 규칙)

- 2~4명, 트럼프 52장(조커 없음), 7장씩. 남은 카드는 더미, 맨 위 1장을 뒤집어 버림 더미로
- 내 차례: ① 더미에서 1장 가져오기 (또는 버림 카드로 등록할 수 있으면 '땡큐'로 가져오기)
           ② 등록·붙이기 (마음대로) ③ 1장 버리기
- 등록: 같은 숫자 3~4장(세트) · 같은 무늬 연속 3장 이상(런, A는 K 다음으로도 이어져요) · 7은 1장만으로도
- 붙이기: 바닥에 등록된 조합에 맞는 카드를 덧붙이기 (내가 한 번이라도 등록한 다음부터, 누구 조합이든)
- 전투 땡큐: 누가 카드를 버리면, 그 카드로 바로 등록할 수 있는 사람은 차례가 아니어도 [땡큐!] — 가장 먼저 누른 사람이 가져가요.
  가져간 사람은 그 카드로 바로 등록하고, 이어서 자기 차례를 해요 (그 다음 사람부터 다시 돌아요)
- 손패를 모두 털면 승리. 한 번도 등록하지 않다가 한 차례에 모두 털면 '훌라!' (점수 2배)
- 스톱: 내 차례 시작(가져오기 전)에 손패 점수가 한도 이하면 스톱. 내가 가장 낮으면 승리, 아니면 스톱박(내 점수 2배를 1등에게)
  한도: 2명 5점 · 3명 10점 · 4명 15점
- 더미가 다 떨어지면 손패 점수가 가장 낮은 사람이 승리
- 점수: 진 사람은 손패 점수(A=1 … 10, J=11, Q=12, K=13)만큼 이긴 사람에게 줘요. 5판 합계로 순위
"""
import random
import time
from itertools import combinations
from typing import Dict, List, Optional, Tuple

RANKS = "A23456789TJQK"
SUITS = "shdc"
ROUNDS = 5
HAND = 7
CLAIM_SEC = 2.4
TURN_SEC = 45
STOP_LIMIT = {2: 5, 3: 10, 4: 15}


def cstr(c: int) -> str:
    return RANKS[c >> 2] + SUITS[c & 3]


def rank(c: int) -> int:      # 1~13
    return (c >> 2) + 1


def suit(c: int) -> int:
    return c & 3


def value(c: int) -> int:
    return rank(c)


def hand_points(cards: List[int]) -> int:
    return sum(value(c) for c in cards)


def is_run(cards: List[int]) -> bool:
    """같은 무늬 연속 (A 는 1 또는 K 다음 14)"""
    if len(cards) < 3 or len({suit(c) for c in cards}) != 1:
        return False
    rs = sorted(rank(c) for c in cards)
    if len(set(rs)) != len(rs):
        return False
    if all(rs[k + 1] - rs[k] == 1 for k in range(len(rs) - 1)):
        return True
    if rs[0] == 1:
        rs2 = sorted(14 if r == 1 else r for r in rs)
        return all(rs2[k + 1] - rs2[k] == 1 for k in range(len(rs2) - 1))
    return False


def is_set(cards: List[int]) -> bool:
    return 3 <= len(cards) <= 4 and len({rank(c) for c in cards}) == 1


def meld_kind(cards: List[int]) -> Optional[str]:
    if len(cards) == 1 and rank(cards[0]) == 7:
        return "seven"
    if is_set(cards):
        return "set"
    if is_run(cards):
        return "run"
    return None


def can_attach(meld: dict, c: int) -> bool:
    cs = meld["cards"] + [c]
    if meld["kind"] == "set":
        return is_set(cs)
    # 런·7 은 런처럼 이어 붙여요 (7♦ 에 6♦ · 8♦)
    return is_run(cs) or (meld["kind"] == "seven" and len(cs) == 2 and suit(cs[0]) == suit(cs[1]) and abs(rank(cs[0]) - rank(cs[1])) == 1)


def find_melds(hand: List[int]) -> List[List[int]]:
    """손패로 만들 수 있는 등록 조합 모두 (세트·런·7)"""
    out = []
    by_rank: Dict[int, List[int]] = {}
    by_suit: Dict[int, List[int]] = {}
    for c in hand:
        by_rank.setdefault(rank(c), []).append(c)
        by_suit.setdefault(suit(c), []).append(c)
    for r, cs in by_rank.items():
        if r == 7:
            out += [[c] for c in cs]
        if len(cs) >= 3:
            for k in (3, 4):
                out += [list(x) for x in combinations(cs, k)] if len(cs) >= k else []
    for s, cs in by_suit.items():
        rs = {rank(c): c for c in cs}
        seq = list(range(1, 15))
        for start in range(1, 13):
            run = []
            for r in range(start, 15):
                rr = 1 if r == 14 else r
                if rr in rs:
                    run.append(rs[rr])
                    if len(run) >= 3:
                        out.append(run[:])
                else:
                    break
    # 같은 조합 지우기
    seen = set()
    uniq = []
    for m in out:
        k = tuple(sorted(m))
        if k not in seen:
            seen.add(k)
            uniq.append(m)
    return uniq


class Hulla:
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.score = [0] * n_seats
        self.round = 0
        self.over = False
        self.log: List[str] = []
        self.dealer = rng.randrange(n_seats)
        self.wait_until = 0.0
        self.deadline = 0.0
        self.claim_until = 0.0
        self.ai_claim_at: Dict[int, float] = {}
        self._new_round()

    # ---------------- 판 진행 ----------------
    def _new_round(self) -> None:
        if self.round >= ROUNDS:
            self.over = True
            self.phase = "done"
            return
        self.round += 1
        deck = list(range(52))
        self.rng.shuffle(deck)
        self.stock = deck
        self.hands = [[self.stock.pop() for _ in range(HAND)] for _ in range(self.n)]
        self.discard = [self.stock.pop()]
        self.melds: List[dict] = []
        self.registered = [False] * self.n
        self.reg_this_turn = [False] * self.n
        self.turn = (self.dealer + self.round) % self.n
        self.phase = "draw"          # draw → play → (claim) → 다음 사람 draw
        self.drawn = None
        self.last_discarder = -1
        self.end = None
        self.started_unreg = False
        self.log.append(f"— {self.round}번째 판 —")
        self._set_deadline()

    def _set_deadline(self) -> None:
        self.deadline = time.time() + self.turn_seconds if self.turn not in self.ai and self.phase in ("draw", "play") else 0

    def stop_limit(self) -> int:
        return STOP_LIMIT.get(self.n, 15)

    def can_thank(self, i: int) -> bool:
        """버림 더미 맨 위 카드로 바로 등록할 수 있나 (전투 땡큐)"""
        if not self.discard or i == self.last_discarder:
            return False
        top = self.discard[-1]
        return any(top in m for m in find_melds(self.hands[i] + [top]))

    def actor(self) -> int:
        return self.turn if self.phase in ("draw", "play") else -1

    def step(self) -> Optional[float]:
        if self.over:
            return None
        now = time.time()
        if self.phase == "claim":
            # AI 땡큐 (생각하는 척 조금 늦게)
            for i, t in sorted(self.ai_claim_at.items(), key=lambda kv: kv[1]):
                if now >= t and self.can_thank(i):
                    self._thank(i)
                    return 0.05
            if now >= self.claim_until:
                self.phase = "draw"
                self._set_deadline()
                return 0.05
            return self.claim_until - now
        if self.phase == "roundover":
            if now >= self.wait_until:
                self.dealer = (self.dealer + 1) % self.n
                self._new_round()
                return 0.05
            return self.wait_until - now
        return None

    def _after_discard(self, i: int) -> None:
        self.last_discarder = i
        self.turn = (i + 1) % self.n
        self.reg_this_turn = [False] * self.n
        if not self.hands[i]:
            self._win(i, "out")
            return
        if not self.stock:
            self._stock_out()
            return
        # 땡큐 기회 (누군가 등록할 수 있을 때만 잠깐 기다려요)
        able = [j for j in range(self.n) if j != i and self.can_thank(j)]
        if able:
            self.phase = "claim"
            self.claim_until = time.time() + CLAIM_SEC
            self.ai_claim_at = {}
            for j in able:
                if j in self.ai and self._ai_wants_thank(j):
                    self.ai_claim_at[j] = time.time() + self.rng.uniform(0.7, 1.8)
            self.deadline = 0
        else:
            self.phase = "draw"
            self._set_deadline()

    def _thank(self, i: int) -> None:
        top = self.discard.pop()
        self.hands[i].append(top)
        # 그 카드가 들어간 가장 좋은 조합을 바로 등록
        melds = [m for m in find_melds(self.hands[i]) if top in m]
        best = max(melds, key=lambda m: (len(m), hand_points(m)))
        self.started_unreg = not self.registered[i]
        self._register(i, best)
        self.log.append(f"{self.names[i]}: 땡큐! ({cstr(top)})")
        self.turn = i
        self.phase = "play"
        self.drawn = top
        self._set_deadline()
        if not self.hands[i]:
            self._win(i, "out")

    def _register(self, i: int, cards: List[int]) -> None:
        for c in cards:
            self.hands[i].remove(c)
        kind = meld_kind(cards)
        self.melds.append({"cards": sorted(cards, key=lambda c: (rank(c) if kind != "run" else (14 if rank(c) == 1 and any(rank(x) == 13 for x in cards) else rank(c)))), "kind": kind, "owner": i})
        self.registered[i] = True
        self.reg_this_turn[i] = True

    def _stock_out(self) -> None:
        pts = [hand_points(h) for h in self.hands]
        low = min(pts)
        w = min((j for j in range(self.n) if pts[j] == low), key=lambda j: (j - self.turn) % self.n)
        self.log.append("더미가 다 떨어졌어요")
        self._win(w, "stock")

    def _win(self, w: int, how: str, stop_fail: int = -1) -> None:
        mult = 2 if how == "hulla" else 1
        pays = [0] * self.n
        for j in range(self.n):
            if j == w:
                continue
            p = hand_points(self.hands[j]) * mult
            if j == stop_fail:
                p *= 2
            pays[j] = p
            self.score[j] -= p
            self.score[w] += p
        how_txt = {"out": "다 털었어요!", "hulla": "훌라!!", "stock": "더미가 떨어져서 점수가 가장 낮아요",
                   "stop": "스톱 성공!", "stopfail": "스톱박! 더 낮은 사람이 있었어요"}[how]
        self.end = {"winner": w, "how": how, "text": how_txt, "pays": pays,
                    "hands": [[cstr(c) for c in h] for h in self.hands], "points": [hand_points(h) for h in self.hands],
                    "round": self.round, "stopper": stop_fail}
        self.log.append(f"{self.names[w]} 승리 — {how_txt}")
        self.log = self.log[-12:]
        self.phase = "roundover"
        self.deadline = 0
        self.wait_until = time.time() + (6.5 if self.round < ROUNDS else 7.5)
        if self.round >= ROUNDS:
            pass

    # ---------------- 수 두기 ----------------
    def act(self, i: int, a: dict) -> Optional[str]:
        k = a.get("k")
        if k == "thank":
            if self.phase not in ("claim", "draw") or not self.can_thank(i):
                return "지금은 땡큐할 수 없어요"
            if self.phase == "draw" and i != self.turn:
                return "늦었어요! 다음 사람이 이미 차례예요"
            self._thank(i)
            return None
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        h = self.hands[i]
        if self.phase == "draw":
            if k == "draw":
                c = self.stock.pop()
                h.append(c)
                self.drawn = c
                self.started_unreg = not self.registered[i]
                self.phase = "play"
                self._set_deadline()
                return None
            if k == "stop":
                if hand_points(h) > self.stop_limit():
                    return f"손패 점수가 {self.stop_limit()}점 이하일 때만 스톱할 수 있어요"
                pts = [hand_points(x) for x in self.hands]
                others = [j for j in range(self.n) if j != i]
                if all(pts[j] > pts[i] for j in others):
                    self._win(i, "stop")
                else:
                    low = min(pts[j] for j in others)
                    w = min((j for j in others if pts[j] == low), key=lambda j: (j - i) % self.n)
                    self._win(w, "stopfail", stop_fail=i)
                return None
            return "먼저 카드를 가져와요 (더미 또는 땡큐)"
        if self.phase != "play":
            return "잠깐 기다려요"
        try:
            cards = [int(x) for x in (a.get("c") or [])]
        except (TypeError, ValueError):
            return "카드가 이상해요"
        if any(c not in h for c in cards) or len(set(cards)) != len(cards):
            return "내 카드가 아니에요"
        if k == "meld":
            if not meld_kind(cards):
                return "등록할 수 없는 조합이에요 (같은 숫자 3장 · 같은 무늬 연속 3장 · 7 한 장)"
            self._register(i, cards)
            self.log.append(f"{self.names[i]}: 등록 {' '.join(cstr(c) for c in cards)}")
            if not h:
                self._win(i, "hulla" if self.started_unreg else "out")
            return None
        if k == "attach":
            if not self.registered[i]:
                return "내가 먼저 한 번 등록해야 붙일 수 있어요"
            try:
                mi = int(a.get("m", -1))
            except (TypeError, ValueError):
                return "조합이 이상해요"
            if len(cards) != 1 or not (0 <= mi < len(self.melds)):
                return "붙일 카드 1장과 조합을 골라요"
            m = self.melds[mi]
            if not can_attach(m, cards[0]):
                return "그 조합에는 붙일 수 없어요"
            h.remove(cards[0])
            m["cards"].append(cards[0])
            if m["kind"] == "seven":
                m["kind"] = "run"
            m["cards"].sort(key=lambda c: rank(c) if m["kind"] == "set" else (14 if rank(c) == 1 and any(rank(x) == 13 for x in m["cards"]) else rank(c)))
            self.log.append(f"{self.names[i]}: 붙이기 {cstr(cards[0])}")
            if not h:
                self._win(i, "out")
            return None
        if k == "discard":
            if len(cards) != 1:
                return "버릴 카드 1장을 골라요"
            h.remove(cards[0])
            self.discard.append(cards[0])
            self.log.append(f"{self.names[i]}: 버림 {cstr(cards[0])}")
            self.log = self.log[-12:]
            if not h and self.started_unreg and self.reg_this_turn[i]:
                self._win(i, "hulla")
                return None
            self._after_discard(i)
            return None
        return "알 수 없는 수예요"

    def timeout_action(self, i: int) -> dict:
        if self.phase == "draw":
            return {"k": "draw"}
        # 가장 점수 큰 카드 버리기
        c = max(self.hands[i], key=value)
        return {"k": "discard", "c": [c]}

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        return self.rng.uniform(0.7, 1.4)

    def _ai_wants_thank(self, i: int) -> bool:
        lv = self.level
        if lv <= 1:
            return self.rng.random() < 0.4
        return self.rng.random() < {2: 0.75, 3: 0.95, 4: 1.0, 5: 1.0}[lv]

    def _useful(self, hand: List[int], c: int) -> float:
        """이 카드가 앞으로 조합이 될 가능성 (같은 숫자 · 가까운 같은 무늬)"""
        u = 0.0
        for x in hand:
            if x == c:
                continue
            if rank(x) == rank(c):
                u += 1.0
            elif suit(x) == suit(c) and abs(rank(x) - rank(c)) <= 2:
                u += 0.8 if abs(rank(x) - rank(c)) == 1 else 0.45
        if rank(c) == 7:
            u += 2
        return u

    def ai_action(self, i: int) -> dict:
        lv = self.level
        rng = self.rng
        h = self.hands[i]
        if self.phase == "draw":
            if lv >= 3 and hand_points(h) <= self.stop_limit():
                # 다른 사람보다 낮을 것 같으면 스톱 (손패 장수로 짐작)
                guess = min(len(self.hands[j]) * 6 for j in range(self.n) if j != i)
                if hand_points(h) < guess * (0.6 if lv >= 4 else 0.45):
                    return {"k": "stop"}
            if self.can_thank(i) and (lv >= 2 or rng.random() < 0.5):
                return {"k": "thank"}
            return {"k": "draw"}
        # 등록 (점수 큰 조합부터)
        melds = find_melds(h)
        if melds and (lv >= 2 or rng.random() < 0.6):
            # 5단계: 아직 등록 안 했고 거의 다 됐으면 훌라를 노리며 아껴요
            if lv >= 5 and not self.registered[i] and len(h) >= 4:
                left = self._leftover_after_greedy(h)
                if 1 <= left <= 2 and len(self.stock) > 8 and rng.random() < 0.6:
                    melds = []
            if melds:
                m = max(melds, key=lambda m: (hand_points(m) + (3 if len(m) >= 3 else 0), len(m)))
                return {"k": "meld", "c": m}
        # 붙이기
        if self.registered[i]:
            for c in sorted(h, key=value, reverse=True):
                for mi, m in enumerate(self.melds):
                    if can_attach(m, c):
                        return {"k": "attach", "c": [c], "m": mi}
        # 버리기
        if lv <= 1:
            return {"k": "discard", "c": [rng.choice(h)]}
        nxt = (i + 1) % self.n

        def danger(c: int) -> float:
            # 다음 사람이 땡큐할 만한 카드는 피하기 (4·5단계: 바닥 조합에 붙는 카드·7)
            if lv < 4:
                return 0
            d = 0.0
            if rank(c) == 7:
                d += 6
            if any(can_attach(m, c) for m in self.melds):
                d += 2
            return d
        score = {c: value(c) - self._useful(h, c) * {2: 2, 3: 4, 4: 5, 5: 5.5}[lv] - danger(c) + rng.random() * (3 if lv == 2 else 0.5) for c in h}
        c = max(h, key=lambda x: score[x])
        return {"k": "discard", "c": [c]}

    def _leftover_after_greedy(self, hand: List[int]) -> int:
        h = hand[:]
        while True:
            ms = find_melds(h)
            if not ms:
                return len(h)
            m = max(ms, key=len)
            for c in m:
                h.remove(c)

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {
            "round": self.round, "rounds": ROUNDS, "phase": self.phase, "turn": self.turn, "toAct": self.actor(),
            "deadline": int(self.deadline * 1000) if self.deadline else 0,
            "claimUntil": int(self.claim_until * 1000) if self.phase == "claim" else 0,
            "stock": len(self.stock), "discard": [cstr(c) for c in self.discard[-3:]],
            "melds": [{"cards": [cstr(c) for c in m["cards"]], "ids": m["cards"], "kind": m["kind"], "owner": m["owner"]} for m in self.melds],
            "seats": [{"n": len(self.hands[j]), "score": self.score[j], "reg": self.registered[j]} for j in range(self.n)],
            "me": seat, "log": self.log[-6:], "over": self.over, "stopLimit": self.stop_limit(),
            "end": self.end if self.phase in ("roundover", "done") else None,
        }
        if seat is not None:
            h = self.hands[seat]
            v["hand"] = [{"id": c, "c": cstr(c)} for c in h]
            v["points"] = hand_points(h)
            v["registered"] = self.registered[seat]
            v["canThank"] = self.phase in ("claim", "draw") and self.can_thank(seat) and (self.phase == "claim" or seat == self.turn)
            v["drawn"] = self.drawn if seat == self.turn and self.phase == "play" else None
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: -self.score[j])
        return {"winner": order[0], "rank": order, "score": self.score[:], "hands": self.round}
