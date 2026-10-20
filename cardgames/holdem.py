"""텍사스 홀덤 (토너먼트, 칩만 써요 — 진짜 돈 없음)

- 2~8명, 처음 칩 1000개씩. 블라인드는 10/20 에서 시작해 5판마다 올라요
- 각자 카드 2장 + 가운데 5장(플랍 3 · 턴 1 · 리버 1) 가운데 가장 좋은 5장으로 승부
- 칩을 모두 잃으면 탈락, 마지막 1명이 우승. 사람이 모두 탈락해도 끝나요
- 차례마다 30초 (지나면 체크, 체크가 안 되면 폴드)
카드: 숫자 '23456789TJQKA' + 무늬 'shdc' (화면과 같은 이름)
"""
import random
import time
from itertools import combinations
from typing import Dict, List, Optional, Tuple

RANKS = "23456789TJQKA"
SUITS = "shdc"
START_CHIPS = 1000
BLINDS = [(10, 20), (15, 30), (25, 50), (40, 80), (60, 120), (100, 200), (150, 300), (250, 500), (400, 800), (600, 1200), (1000, 2000)]
HANDS_PER_LEVEL = 5
TURN_SEC = 30
CAT_NAMES = ["하이 카드", "원 페어", "투 페어", "트리플", "스트레이트", "플러시", "풀하우스", "포카드", "스트레이트 플러시"]


def cstr(c: int) -> str:
    return RANKS[c >> 2] + SUITS[c & 3]


# ---------------- 족보 계산 ----------------
def eval5(cards: List[int]) -> Tuple:
    rs = sorted((c >> 2 for c in cards), reverse=True)
    flush = len({c & 3 for c in cards}) == 1
    uniq = sorted(set(rs), reverse=True)
    straight_hi = -1
    if len(uniq) == 5:
        if uniq[0] - uniq[4] == 4:
            straight_hi = uniq[0]
        elif uniq == [12, 3, 2, 1, 0]:   # A-2-3-4-5
            straight_hi = 3
    cnt: Dict[int, int] = {}
    for r in rs:
        cnt[r] = cnt.get(r, 0) + 1
    groups = sorted(cnt.items(), key=lambda kv: (-kv[1], -kv[0]))
    shape = [g[1] for g in groups]
    order = [g[0] for g in groups]
    if straight_hi >= 0 and flush:
        return (8, straight_hi)
    if shape[0] == 4:
        return (7, *order)
    if shape[:2] == [3, 2]:
        return (6, *order)
    if flush:
        return (5, *rs)
    if straight_hi >= 0:
        return (4, straight_hi)
    if shape[0] == 3:
        return (3, *order)
    if shape[:2] == [2, 2]:
        return (2, *order)
    if shape[0] == 2:
        return (1, *order)
    return (0, *rs)


def best7(cards: List[int]) -> Tuple[Tuple, List[int]]:
    """7장(또는 5~6장) 가운데 가장 좋은 5장"""
    best = None
    best_cards: List[int] = []
    for five in combinations(cards, 5):
        v = eval5(list(five))
        if best is None or v > best:
            best = v
            best_cards = list(five)
    return best, best_cards


def fast7(cards: List[int]) -> Tuple:
    """AI 용 빠른 족보 (5장 고르기 없이 바로)"""
    cnt = [0] * 13
    suit_cards: List[List[int]] = [[], [], [], []]
    for c in cards:
        r = c >> 2
        cnt[r] += 1
        suit_cards[c & 3].append(r)

    def straight(mask_ranks) -> int:
        have = set(mask_ranks)
        for hi in range(12, 2, -1):
            if all((hi - k) in have for k in range(5)):
                return hi
        if {12, 0, 1, 2, 3} <= have:
            return 3
        return -1

    for sc in suit_cards:
        if len(sc) >= 5:
            sf = straight(sc)
            if sf >= 0:
                return (8, sf)
            fl = sorted(sc, reverse=True)[:5]
            flush = (5, *fl)
            break
    else:
        flush = None
    quads = [r for r in range(12, -1, -1) if cnt[r] == 4]
    trips = [r for r in range(12, -1, -1) if cnt[r] == 3]
    pairs = [r for r in range(12, -1, -1) if cnt[r] == 2]
    singles = [r for r in range(12, -1, -1) if cnt[r] == 1]
    if quads:
        k = max([r for r in range(13) if cnt[r] and r != quads[0]], default=0)
        return (7, quads[0], k)
    if trips and (len(trips) > 1 or pairs):
        p = max(trips[1:] + pairs)
        return (6, trips[0], p)
    if flush:
        return flush
    st = straight([r for r in range(13) if cnt[r]])
    if st >= 0:
        return (4, st)
    if trips:
        return (3, trips[0], *sorted(pairs + singles, reverse=True)[:2])
    if len(pairs) >= 2:
        k = max(pairs[2:] + singles, default=0)
        return (2, pairs[0], pairs[1], k)
    if pairs:
        return (1, pairs[0], *singles[:3])
    return (0, *singles[:5])


def pf_score(a: int, b: int) -> float:
    """시작 패 점수 (첸 공식 비슷하게): 높을수록 좋은 2장"""
    ra, rb = a >> 2, b >> 2
    hi, lo = max(ra, rb), min(ra, rb)
    val = {12: 10, 11: 8, 10: 7, 9: 6}.get(hi, (hi + 2) / 2)
    if ra == rb:
        return max(5, val * 2)
    sc = val
    if (a & 3) == (b & 3):
        sc += 2
    gap = hi - lo - 1
    sc -= [0, 1, 2, 4][gap] if gap < 4 else 5
    if gap <= 1 and hi < 10:
        sc += 1
    return sc


def hand_name(v: Tuple) -> str:
    if v[0] == 8 and v[1] == 12:
        return "로열 플러시"
    return CAT_NAMES[v[0]]


class Holdem:
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.chips = [START_CHIPS] * n_seats
        self.out_order: List[int] = []      # 탈락한 순서
        self.dealer = rng.randrange(n_seats)
        self.hand_no = 0
        self.over = False
        self.log: List[str] = []
        self.deadline = 0
        self.wait_until = 0.0
        self.show = None
        self.street = "wait"
        self.board: List[int] = []
        self.to_act = -1
        self._start_hand()

    # ---------------- 진행 ----------------
    def _next(self, i: int, cond) -> int:
        for k in range(1, self.n + 1):
            j = (i + k) % self.n
            if cond(j):
                return j
        return -1

    def blinds(self) -> Tuple[int, int]:
        return BLINDS[min(len(BLINDS) - 1, (self.hand_no - 1) // HANDS_PER_LEVEL)]

    def _start_hand(self) -> None:
        live = [i for i in range(self.n) if self.chips[i] > 0]
        humans_live = [i for i in live if i not in self.ai]
        if len(live) <= 1 or not humans_live:
            self.over = True
            self.street = "done"
            self.to_act = -1
            return
        self.hand_no += 1
        self.dealer = self._next(self.dealer, lambda j: self.chips[j] > 0)
        deck = list(range(52))
        self.rng.shuffle(deck)
        self.deck = deck
        self.cards: List[List[int]] = [[] for _ in range(self.n)]
        self.bet = [0] * self.n
        self.total = [0] * self.n
        self.folded = [self.chips[i] <= 0 for i in range(self.n)]
        self.allin = [False] * self.n
        self.acted = [False] * self.n
        self.last_act = [""] * self.n
        self.vpip = [False] * self.n      # 프리플랍에 스스로 칩을 넣었나 (AI 가 상대 패를 짐작하는 데 써요)
        self.pfr = [False] * self.n       # 프리플랍에 레이즈했나
        self.aggr = [False] * self.n      # 이번 단계에 걸었나·올렸나
        self.board = []
        self.show = None
        for _ in range(2):
            for i in live:
                self.cards[i].append(self.deck.pop())
        sb, bb = self.blinds()
        if len(live) == 2:
            sbs = self.dealer
            bbs = self._next(sbs, lambda j: self.chips[j] > 0)
        else:
            sbs = self._next(self.dealer, lambda j: self.chips[j] > 0)
            bbs = self._next(sbs, lambda j: self.chips[j] > 0)
        self.sb_seat, self.bb_seat = sbs, bbs
        self._put(sbs, min(sb, self.chips[sbs]))
        self._put(bbs, min(bb, self.chips[bbs]))
        self.last_act[sbs] = f"스몰 {sb}"
        self.last_act[bbs] = f"빅 {bb}"
        self.cur_bet = bb
        self.min_raise = bb
        self.street = "preflop"
        self.to_act = self._next(bbs, self._can_act)
        self.log.append(f"— {self.hand_no}번째 판 (블라인드 {sb}/{bb}) —")
        self._after_change()

    def _put(self, i: int, amt: int) -> None:
        amt = max(0, min(amt, self.chips[i]))
        self.chips[i] -= amt
        self.bet[i] += amt
        self.total[i] += amt
        if self.chips[i] == 0:
            self.allin[i] = True

    def _can_act(self, j: int) -> bool:
        return not self.folded[j] and not self.allin[j] and self.chips[j] > 0

    def _in_hand(self) -> List[int]:
        return [i for i in range(self.n) if not self.folded[i] and self.total[i] + self.chips[i] > 0 and self.cards[i]]

    def _round_done(self) -> bool:
        acts = [i for i in range(self.n) if self._can_act(i)]
        if not acts:
            return True
        if len(acts) == 1 and self.bet[acts[0]] >= self.cur_bet:
            # 혼자 남았으면 더 걸 사람이 없어요 (다른 사람은 올인)
            return True
        return all(self.acted[i] and self.bet[i] == self.cur_bet for i in acts)

    def _after_change(self) -> None:
        inh = self._in_hand()
        if len(inh) == 1:
            self._award_single(inh[0])
            return
        if self._round_done():
            self._next_street()
            return
        self.deadline = time.time() + self.turn_seconds if self.to_act not in self.ai else 0

    def _next_street(self) -> None:
        for i in range(self.n):
            self.bet[i] = 0
            self.acted[i] = False
            self.aggr[i] = False
        self.cur_bet = 0
        self.min_raise = self.blinds()[1]
        if self.street == "preflop":
            self.board += [self.deck.pop() for _ in range(3)]
            self.street = "flop"
        elif self.street == "flop":
            self.board.append(self.deck.pop())
            self.street = "turn"
        elif self.street == "turn":
            self.board.append(self.deck.pop())
            self.street = "river"
        else:
            self._showdown()
            return
        acts = [i for i in range(self.n) if self._can_act(i)]
        if len(acts) <= 1:
            # 모두 올인: 남은 카드를 천천히 한 장씩 펼쳐요
            self.to_act = -1
            self.street_run = True
            self.wait_until = time.time() + 1.3
            return
        self.to_act = self._next(self.dealer, self._can_act)
        self.deadline = time.time() + self.turn_seconds if self.to_act not in self.ai else 0

    def _award_single(self, w: int) -> None:
        pot = sum(self.total)
        self.chips[w] += pot
        self.show = {"winners": [w], "pots": [{"amt": pot, "winners": [w]}], "hands": {}, "fold": True}
        self.log.append(f"{self.names[w]} 님이 {pot}칩을 가져가요 (모두 폴드)")
        self._end_hand(2.6)

    def _showdown(self) -> None:
        self.street = "showdown"
        inh = self._in_hand()
        vals = {}
        hands = {}
        for i in inh:
            v, five = best7(self.cards[i] + self.board)
            vals[i] = v
            hands[i] = {"name": hand_name(v), "best": [cstr(c) for c in five]}
        # 사이드 팟
        levels = sorted({self.total[i] for i in range(self.n) if self.total[i] > 0})
        pots = []
        prev = 0
        for lv in levels:
            amt = sum(min(self.total[i], lv) - min(self.total[i], prev) for i in range(self.n))
            elig = [i for i in inh if self.total[i] >= lv]
            prev = lv
            if amt <= 0:
                continue
            if not elig:
                # 그 몫을 낸 사람이 다 폴드: 남은 사람 가운데 가장 많이 낸 사람에게
                elig = inh
            best = max(vals[i] for i in elig)
            ws = [i for i in elig if vals[i] == best]
            share, rest = divmod(amt, len(ws))
            order = sorted(ws, key=lambda i: (i - self.dealer - 1) % self.n)
            for k, i in enumerate(order):
                self.chips[i] += share + (1 if k < rest else 0)
            if pots and pots[-1]["winners"] == ws:
                pots[-1]["amt"] += amt
            else:
                pots.append({"amt": amt, "winners": ws})
        winners = sorted({w for p in pots for w in p["winners"]})
        self.show = {"winners": winners, "pots": pots, "hands": hands, "fold": False}
        for p in pots:
            self.log.append(f"{', '.join(self.names[w] for w in p['winners'])} 님이 {p['amt']}칩 ({hands[p['winners'][0]]['name']})")
        self._end_hand(5.5)

    def _end_hand(self, wait: float) -> None:
        self.street = "handover"
        self.to_act = -1
        self.deadline = 0
        for i in range(self.n):
            if self.chips[i] <= 0 and i not in self.out_order and self.cards[i]:
                self.out_order.append(i)
                self.log.append(f"{self.names[i]} 님 탈락")
        self.wait_until = time.time() + wait
        self.log = self.log[-12:]

    def step(self) -> Optional[float]:
        """저절로 진행: 다음 판 나눠 주기 · 올인 뒤 카드 펼치기"""
        if self.over:
            return None
        now = time.time()
        if self.street == "handover" or getattr(self, "street_run", False):
            if now < self.wait_until:
                return self.wait_until - now
            if self.street == "handover":
                self._start_hand()
                return 0.05 if not self.over else None
            self.street_run = False
            self._next_street()
            return 0.05
        return None

    # ---------------- 수 두기 ----------------
    def actor(self) -> int:
        return self.to_act if self.street in ("preflop", "flop", "turn", "river") else -1

    def legal(self, i: int) -> dict:
        if i != self.actor():
            return {}
        to_call = self.cur_bet - self.bet[i]
        stack = self.chips[i]
        out = {"fold": to_call > 0, "check": to_call <= 0, "call": min(to_call, stack) if to_call > 0 else 0}
        min_to = self.cur_bet + self.min_raise
        max_to = self.bet[i] + stack
        # 다른 사람이 모두 올인이면 더 올려도 소용없어요 (콜만)
        if max_to > self.cur_bet and any(self._can_act(j) for j in range(self.n) if j != i):
            out["raise"] = {"min": min(min_to, max_to), "max": max_to}
        return out

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        k = a.get("k")
        lg = self.legal(i)
        to_call = self.cur_bet - self.bet[i]
        if k == "fold":
            self.folded[i] = True
            self.last_act[i] = "폴드"
        elif k == "check":
            if to_call > 0:
                return "체크할 수 없어요"
            self.last_act[i] = "체크"
        elif k == "call":
            if to_call <= 0:
                self.last_act[i] = "체크"
            else:
                self._put(i, to_call)
                self.last_act[i] = "올인" if self.allin[i] else f"콜 {self.bet[i]}"
        elif k in ("raise", "allin"):
            r = lg.get("raise")
            if not r:
                return "레이즈할 수 없어요"
            try:
                to = int(a.get("v", 0)) if k == "raise" else r["max"]
            except (TypeError, ValueError):
                return "금액이 이상해요"
            to = max(r["min"], min(r["max"], to))
            inc = to - self.cur_bet
            self._put(i, to - self.bet[i])
            if inc >= self.min_raise:
                self.min_raise = inc
            if to > self.cur_bet:
                self.cur_bet = to
                for j in range(self.n):
                    if j != i:
                        self.acted[j] = False
            self.last_act[i] = "올인" if self.allin[i] else f"레이즈 {to}"
        else:
            return "알 수 없는 수예요"
        self.acted[i] = True
        if k in ("call", "raise", "allin") and self.street == "preflop" and to_call > 0:
            self.vpip[i] = True
        if k in ("raise", "allin"):
            self.aggr[i] = True
            if self.street == "preflop":
                self.pfr[i] = True
                self.vpip[i] = True
        self.log.append(f"{self.names[i]}: {self.last_act[i]}")
        self.log = self.log[-12:]
        self.to_act = self._next(i, self._can_act)
        self._after_change()
        return None

    def timeout_action(self, i: int) -> dict:
        return {"k": "check"} if self.cur_bet - self.bet[i] <= 0 else {"k": "fold"}

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        return self.rng.uniform(0.9, 1.9)

    def equity(self, i: int, sims: int, ranged: int = 0) -> float:
        """이길 확률 (끝까지 여러 번 대신 펼쳐 보기).
        ranged 1: 상대가 프리플랍에 들어왔으면 좋은 패 쪽으로 짐작 · 2: 이번 단계에 건 상대는 페어 이상으로 짐작"""
        opp = [j for j in self._in_hand() if j != i]
        if not opp:
            return 1.0
        known = set(self.cards[i] + self.board)
        rest = [c for c in range(52) if c not in known]
        need = 5 - len(self.board)
        win = 0.0
        rng = self.rng
        need_score = {j: (8.0 if self.pfr[j] else 5.5 if self.vpip[j] else -99) if ranged else -99 for j in opp}
        need_pair = {j: ranged >= 2 and self.aggr[j] and len(self.board) >= 3 for j in opp}
        for _ in range(sims):
            pool = rest[:]
            rng.shuffle(pool)
            hands = []
            for j in opp:
                pick = None
                for t in range(24):
                    a, b = pool[2 * t % len(pool)], pool[(2 * t + 1) % len(pool)]
                    if a == b or a in (pick or []):
                        continue
                    ok = pf_score(a, b) >= need_score[j]
                    if ok and need_pair[j] and rng.random() < 0.75:
                        ok = fast7([a, b] + self.board)[0] >= 1
                    pick = [a, b]
                    if ok:
                        break
                hands.append(pick)
                pool.remove(pick[0])
                pool.remove(pick[1])
            board = self.board + pool[:need]
            mine = fast7(self.cards[i] + board)
            best_opp = max(fast7(hh + board) for hh in hands)
            if mine > best_opp:
                win += 1
            elif mine == best_opp:
                win += 0.5
        return win / sims

    def ai_action(self, i: int) -> dict:
        lg = self.legal(i)
        lv = self.level
        rng = self.rng
        to_call = lg.get("call", 0)
        pot = sum(self.total)
        r = lg.get("raise")
        if lv <= 1:
            x = rng.random()
            if to_call > 0 and x < 0.18:
                return {"k": "fold"}
            if r and x > 0.82:
                return {"k": "raise", "v": r["min"]}
            return {"k": "call"} if to_call > 0 else {"k": "check"}
        sims = {2: 120, 3: 160, 4: 450, 5: 800}[lv]
        eq = self.equity(i, sims, ranged={2: 0, 3: 0, 4: 1, 5: 2}[lv])
        n_opp = max(1, len(self._in_hand()) - 1)
        base = 1.0 / (n_opp + 1)               # 보통 패의 승률
        odds = to_call / (pot + to_call) if to_call > 0 else 0
        # 상대가 크게 걸면 상대 패도 좋을 테니 내 승률을 깎아서 봐요 (단계가 높을수록 잘 봐요)
        disc = {2: 0.0, 3: 0.15, 4: 0.35, 5: 0.4}[lv]
        eq_f = eq * (1 - disc * min(1.0, to_call / max(1, pot)))
        margin = {2: -0.15, 3: -0.05, 4: 0.02, 5: 0.03}[lv]
        bluff = {2: 0.0, 3: 0.03, 4: 0.06, 5: 0.08}[lv]
        value = base + (1 - base) * {2: 0.5, 3: 0.42, 4: 0.3, 5: 0.28}[lv]   # 이 정도면 값어치 베팅
        strong = base + (1 - base) * {2: 0.7, 3: 0.55, 4: 0.5, 5: 0.48}[lv]

        def raise_to(frac: float) -> dict:
            want = self.cur_bet + max(self.min_raise, int((pot + to_call) * frac))
            want = max(r["min"], min(r["max"], want))
            if want >= r["max"] * 0.8:
                return {"k": "allin"}
            unit = max(1, self.blinds()[0])
            want = max(r["min"], min(r["max"], (want // unit) * unit))
            return {"k": "raise", "v": want}

        late = self.street != "preflop"
        if to_call == 0:
            if r and eq > value and rng.random() < (0.55 if lv == 2 else 0.8):
                return raise_to(rng.choice([0.5, 0.66, 0.75]) if lv >= 4 else 0.5)
            if r and late and n_opp <= 2 and rng.random() < bluff:
                return raise_to(0.5)
            return {"k": "check"}
        if r and eq_f > strong and rng.random() < (0.4 if lv == 2 else 0.75):
            return raise_to(rng.choice([0.75, 1.0]) if lv >= 4 else 0.75)
        if eq_f >= odds + margin:
            return {"k": "call"}
        if r and late and n_opp == 1 and rng.random() < bluff * 0.6:
            return raise_to(0.75)
        return {"k": "fold"}

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        showdown = self.show and not self.show.get("fold")
        seats = []
        for i in range(self.n):
            if not self.cards[i]:
                cards: List[str] = []
            elif i == seat or (showdown and not self.folded[i]):
                cards = [cstr(c) for c in self.cards[i]]
            else:
                cards = ["??", "??"] if not self.folded[i] else []
            seats.append({
                "chips": self.chips[i], "bet": self.bet[i] if hasattr(self, "bet") else 0,
                "folded": bool(self.folded[i]) if hasattr(self, "folded") else False,
                "allin": bool(self.allin[i]) if hasattr(self, "allin") else False,
                "out": self.chips[i] <= 0 and i in self.out_order,
                "cards": cards, "last": self.last_act[i] if hasattr(self, "last_act") else "",
            })
        sb, bb = self.blinds() if self.hand_no else BLINDS[0]
        v = {
            "hand": self.hand_no, "blinds": [sb, bb], "nextLevel": HANDS_PER_LEVEL - (self.hand_no - 1) % HANDS_PER_LEVEL,
            "dealer": self.dealer, "street": self.street, "toAct": self.actor(),
            "deadline": int(self.deadline * 1000) if self.deadline else 0,
            "board": [cstr(c) for c in self.board], "pot": sum(self.total) if hasattr(self, "total") else 0,
            "seats": seats, "me": seat, "log": self.log[-6:], "show": self.show, "over": self.over,
        }
        if seat is not None and seat == self.actor():
            v["legal"] = self.legal(seat)
        if seat is not None and hasattr(self, "cards") and self.cards[seat] and not self.folded[seat]:
            allc = self.cards[seat] + self.board
            if len(allc) >= 5:
                v["myHand"] = hand_name(best7(allc)[0])
            elif self.cards[seat][0] >> 2 == self.cards[seat][1] >> 2:
                v["myHand"] = "원 페어"
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        alive = sorted([i for i in range(self.n) if self.chips[i] > 0], key=lambda i: -self.chips[i])
        order = alive + list(reversed(self.out_order))
        return {"winner": order[0] if order else -1, "rank": order, "chips": self.chips[:], "hands": self.hand_no}
