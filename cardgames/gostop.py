"""맞고(2명) · 고스톱(3명) · 광 팔기(4명) — 우리 집 규칙

화투 48장 + 보너스 쌍피 2장(48·49): 달마다 4장. 카드 번호 = (달-1)*4 + k
  종류: gwang(광) · yeol(열끗) · tti(띠) · pi(피) · ssang(쌍피)
  띠 무리: hong(홍단 1·2·3월) · cheong(청단 6·9·10월) · cho(초단 4·5·7월) · 12월 띠는 무리 없음
  고도리: 2·4·8월 새 (열끗)  ·  9월 열끗(국진)은 피로 쓰면 쌍피 (점수가 더 좋은 쪽으로 저절로)

나눠 주기: 맞고 손 10장·바닥 8장 / 고스톱 손 7장·바닥 6장 / 4명이면 판마다 한 명이 쉬며 '광 팔기' (쉬는 사람 7장은 광만 세고 다시 섞어요)
차례: 손에서 1장 내기 → 더미에서 1장 뒤집기. 같은 달이면 가져와요
  바닥에 같은 달이 2장이면 하나 고르기(내 카드), 뒤집은 카드는 더 좋은 쪽으로 저절로
  쪽(내가 낸 카드를 바로 뒤집은 카드로 먹기) · 따닥(같은 달 4장 한꺼번에) · 뻑 먹기(바닥 3장 한꺼번에) · 싹쓸이 → 상대마다 피 1장 뺏기
  뻑: 내가 1장 먹으려는데 뒤집은 카드도 같은 달이면 3장이 그대로 바닥에 남아요
  흔들기: 같은 달 3장을 들고 있으면 보여 주고 점수 2배 · 폭탄: 같은 달 3장 + 바닥 1장 → 4장 먹고 2배, 피 뺏기, 다음 두 차례는 뒤집기만
점수: 광(3광 3점, 비광 섞이면 2점, 4광 4점, 5광 15점) · 열끗 5장 1점(+1씩) · 고도리 5점 · 띠 5장 1점(+1씩)
      홍단·청단·초단 각 3점 · 피 10장 1점(+1씩, 쌍피는 2장)
고·스톱: 맞고 7점 / 고스톱 3점 이상이 되면(지난번 고보다 높으면) 고 또는 스톱
  고 보너스: 1고 +1점, 2고 +2점, 3고부터 2배씩
  피박(진 사람 피 7장 이하, 이긴 사람이 피로 점수) ×2 · 광박(이긴 사람이 광 점수, 진 사람 광 0장) ×2
  고박(3명 이상): 고를 불렀는데 남이 이기면 진 사람들 몫을 혼자 다 내요
  아무도 못 나면 나가리 → 다음 판 2배
보너스 쌍피: 손에서 내면 바로 내 것(피 2장)이 되고 더미에서 1장을 받아 이어서 내요. 뒤집어서 나오면 가져가고 한 장 더 뒤집어요.
  처음 바닥에 깔리면 먼저 하는 사람이 가져가고 더미에서 다시 깔아요
선: 지난 판에 이긴 사람이 먼저 해요 (나가리면 그대로, 첫 판은 제비뽑기). 4명이면 선 바로 앞사람이 광을 팔고 쉬어요
판수: 5판 합계 점수로 순위
"""
import random
import time
from typing import Dict, List, Optional

ROUNDS = 5
TURN_SEC = 40
CHOICE_SEC = 20

# (달, 종류, 무리)
CARDS = []
_SPEC = {
    1: [("gwang", ""), ("tti", "hong"), ("pi", ""), ("pi", "")],
    2: [("yeol", "bird"), ("tti", "hong"), ("pi", ""), ("pi", "")],
    3: [("gwang", ""), ("tti", "hong"), ("pi", ""), ("pi", "")],
    4: [("yeol", "bird"), ("tti", "cho"), ("pi", ""), ("pi", "")],
    5: [("yeol", ""), ("tti", "cho"), ("pi", ""), ("pi", "")],
    6: [("yeol", ""), ("tti", "cheong"), ("pi", ""), ("pi", "")],
    7: [("yeol", ""), ("tti", "cho"), ("pi", ""), ("pi", "")],
    8: [("gwang", ""), ("yeol", "bird"), ("pi", ""), ("pi", "")],
    9: [("yeol", "cup"), ("tti", "cheong"), ("pi", ""), ("pi", "")],
    10: [("yeol", ""), ("tti", "cheong"), ("pi", ""), ("pi", "")],
    11: [("gwang", ""), ("ssang", ""), ("pi", ""), ("pi", "")],
    12: [("gwang", "rain"), ("yeol", ""), ("tti", ""), ("ssang", "")],
}
for m in range(1, 13):
    for k, (kind, grp) in enumerate(_SPEC[m]):
        CARDS.append({"id": (m - 1) * 4 + k, "m": m, "kind": kind, "grp": grp})
BONUS = (48, 49)
for _b in BONUS:
    CARDS.append({"id": _b, "m": 13, "kind": "bonus", "grp": ""})
N_CARDS = len(CARDS)


def month(c: int) -> int:
    return c // 4 + 1


def kind(c: int) -> str:
    return CARDS[c]["kind"]


def grp(c: int) -> str:
    return CARDS[c]["grp"]


def pi_value(c: int) -> int:
    return 2 if kind(c) in ("ssang", "bonus") else 1 if kind(c) == "pi" else 0


def score_detail(cards: List[int]) -> dict:
    """가져간 카드 점수 (9월 열끗은 쌍피로 쓰는 게 나으면 쌍피로)"""
    best = None
    variants = [False, True] if 32 in cards else [False]
    for cup_as_pi in variants:
        gw = [c for c in cards if kind(c) == "gwang"]
        ye = [c for c in cards if kind(c) == "yeol" and not (cup_as_pi and c == 32)]
        tt = [c for c in cards if kind(c) == "tti"]
        piv = sum(pi_value(c) for c in cards) + (2 if cup_as_pi else 0)
        d = {"gwang": 0, "yeol": 0, "godori": 0, "tti": 0, "dan": 0, "pi": 0}
        n = len(gw)
        if n == 5:
            d["gwang"] = 15
        elif n == 4:
            d["gwang"] = 4
        elif n == 3:
            d["gwang"] = 2 if 44 in gw else 3
        if len(ye) >= 5:
            d["yeol"] = len(ye) - 4
        if all(b in ye for b in (4, 12, 29)):
            d["godori"] = 5
        if len(tt) >= 5:
            d["tti"] = len(tt) - 4
        for g in ("hong", "cheong", "cho"):
            if sum(1 for c in tt if grp(c) == g) == 3:
                d["dan"] += 3
        if piv >= 10:
            d["pi"] = piv - 9
        d["total"] = sum(d.values())
        d["piCount"] = piv
        d["gwangCount"] = n
        d["cupAsPi"] = cup_as_pi
        if best is None or d["total"] > best["total"]:
            best = d
    return best


class GoStop:
    turn_seconds = TURN_SEC

    def __init__(self, n_seats: int, names: List[str], ai_seats: List[int], ai_level: int, rng: random.Random):
        self.n = n_seats
        self.names = names
        self.ai = set(ai_seats)
        self.level = ai_level
        self.rng = rng
        self.total = [0] * n_seats
        self.round = 0
        self.over = False
        self.log: List[str] = []
        self.dealer = rng.randrange(n_seats)
        self.first = rng.randrange(n_seats)     # 선: 지난 판에 이긴 사람 (첫 판은 제비뽑기)
        self.nagari = 1
        self.deadline = 0.0
        self.wait_until = 0.0
        self.events: List[dict] = []
        self.ev_seq = 0
        self._new_round()

    # ---------------- 판 ----------------
    def _new_round(self) -> None:
        if self.round >= ROUNDS:
            self.over = True
            self.phase = "done"
            return
        self.round += 1
        deck = list(range(N_CARDS))
        self.rng.shuffle(deck)
        self.seller = -1
        players = list(range(self.n))
        if self.n == 4:
            self.seller = (self.first - 1) % 4      # 선 바로 앞사람이 광을 팔고 쉬어요
            players = [p for p in players if p != self.seller]
        self.players = players
        np_ = len(players)
        hand_n = 10 if np_ == 2 else 7
        floor_n = 8 if np_ == 2 else 6
        self.hands: List[List[int]] = [[] for _ in range(self.n)]
        for p in players:
            self.hands[p] = sorted(deck.pop() for _ in range(hand_n))
        self.sell_cards: List[int] = []
        if self.seller >= 0:
            # 쉬는 사람도 7장을 받아 광을 세요. 그 카드는 다시 더미에 넣고 섞어서 세 사람 판은 보통 고스톱과 같아요
            self.sell_cards = sorted(deck[-7:])
            self.rng.shuffle(deck)
        self.floor: List[int] = [deck.pop() for _ in range(floor_n)]
        # 바닥에 같은 달 4장이면 다시 섞어요 (드물어요)
        if any(sum(1 for c in self.floor if month(c) == m) == 4 for m in range(1, 13)):
            self.round -= 1
            self._new_round()
            return
        self.deck = deck
        self.captured: List[List[int]] = [[] for _ in range(self.n)]
        # 선: 이긴 사람 (쉬는 사람이면 그다음 사람)
        first = self.first
        while first not in players:
            first = (first + 1) % self.n
        # 바닥에 깔린 보너스 쌍피는 선이 가져가고 더미에서 다시 깔아요
        while any(kind(c) == "bonus" for c in self.floor):
            b = next(c for c in self.floor if kind(c) == "bonus")
            self.floor.remove(b)
            self.captured[first].append(b)
            self.floor.append(self.deck.pop())
        self.go = [0] * self.n
        self.go_score = [0] * self.n
        self.shake = [0] * self.n
        self.bomb = [0] * self.n
        self.bomb_turns = [0] * self.n
        self.shaken_months: List[set] = [set() for _ in range(self.n)]
        self.ppeok_owner: Dict[int, int] = {}   # 뻑 낸 달 → 누가
        self.turn = first
        self.phase = "play"            # play → (choose) → (gostop) → 다음 사람
        self.pending = None
        self.end = None
        self.last_play: Optional[dict] = None
        self.log.append(f"— {self.round}번째 판{' (나가리 ' + str(self.nagari) + '배)' if self.nagari > 1 else ''} · 선 {self.names[first]} —")
        self._event("deal", -1, first=first)
        self._set_deadline()

    def _event(self, k: str, seat: int, **kw) -> None:
        self.ev_seq += 1
        e = {"k": k, "s": seat, "id": self.ev_seq}
        e.update(kw)
        self.events.append(e)
        self.events = self.events[-8:]

    def _set_deadline(self) -> None:
        sec = CHOICE_SEC if self.phase in ("choose", "gostop") else self.turn_seconds
        self.deadline = time.time() + sec if self.turn not in self.ai and self.phase in ("play", "choose", "gostop") else 0

    def threshold(self) -> int:
        return 7 if len(self.players) == 2 else 3

    def actor(self) -> int:
        return self.turn if self.phase in ("play", "choose", "gostop") else -1

    def step(self) -> Optional[float]:
        if self.over:
            return None
        if self.phase == "roundover":
            now = time.time()
            if now >= self.wait_until:
                self.dealer = (self.dealer + 1) % self.n
                self._new_round()
                return 0.05
            return self.wait_until - now
        return None

    # ---------------- 수 두기 ----------------
    def options(self, i: int) -> dict:
        """지금 할 수 있는 것 (화면 버튼용)"""
        if i != self.actor():
            return {}
        if self.phase == "gostop":
            return {"gostop": True}
        if self.phase == "choose":
            return {"choose": self.pending["opts"]}
        h = self.hands[i]
        o: dict = {"play": h[:] if not self.bomb_turns[i] else [], "flipOnly": self.bomb_turns[i] > 0}
        shakes = []
        bombs = []
        for m in range(1, 13):
            mine = [c for c in h if month(c) == m]
            on_floor = [c for c in self.floor if month(c) == m]
            if len(mine) >= 3 and len(on_floor) == 1:
                bombs.append(m)
            elif len(mine) >= 3 and not on_floor and m not in self.shaken_months[i]:
                shakes.append(m)
        o["shake"] = shakes
        o["bomb"] = bombs
        return o

    def act(self, i: int, a: dict) -> Optional[str]:
        if i != self.actor():
            return "지금은 내 차례가 아니에요"
        k = a.get("k")
        if self.phase == "gostop":
            if k == "go":
                self.go[i] += 1
                self.go_score[i] = score_detail(self.captured[i])["total"]
                self.log.append(f"{self.names[i]}: {self.go[i]}고!")
                self._event("go", i, n=self.go[i])
                self._next_turn()
                return None
            if k == "stop":
                self._event("stop", i)
                self._win(i)
                return None
            return "고 또는 스톱을 골라요"
        if self.phase == "choose":
            try:
                pick = int(a.get("c"))
            except (TypeError, ValueError):
                return "카드를 골라요"
            if k != "choose" or pick not in self.pending["opts"]:
                return "빛나는 바닥 카드 가운데 하나를 골라요"
            p = self.pending
            self.pending = None
            self.phase = "play"
            self._resolve_play(i, p["card"], pick)
            return None
        o = self.options(i)
        if k == "shake":
            try:
                m = int(a.get("m"))
            except (TypeError, ValueError):
                return "달이 이상해요"
            if m not in o.get("shake", []):
                return "흔들 수 없어요"
            self.shake[i] += 1
            self.shaken_months[i].add(m)
            self._event("shake", i, m=m, cards=[c for c in self.hands[i] if month(c) == m])
            self.log.append(f"{self.names[i]}: {m}월 흔들기! (2배)")
            return None
        if k == "bomb":
            try:
                m = int(a.get("m"))
            except (TypeError, ValueError):
                return "달이 이상해요"
            if m not in o.get("bomb", []):
                return "폭탄을 할 수 없어요"
            mine = [c for c in self.hands[i] if month(c) == m][:3]
            for c in mine:
                self.hands[i].remove(c)
            fl = [c for c in self.floor if month(c) == m]
            for c in fl:
                self.floor.remove(c)
            self.bomb[i] += 1
            self.bomb_turns[i] = 2
            got = mine + fl
            self._event("bomb", i, m=m, cards=got)
            self.log.append(f"{self.names[i]}: {m}월 폭탄!")
            self._flip_phase(i, None, got, mine[0], steal=1)
            return None
        if k == "flip" and o.get("flipOnly"):
            self.bomb_turns[i] -= 1
            self._flip_phase(i, None, [], None)
            return None
        if k == "play":
            try:
                c = int(a.get("c"))
            except (TypeError, ValueError):
                return "카드를 골라요"
            if c not in self.hands[i] or o.get("flipOnly"):
                return "낼 수 없는 카드예요"
            if kind(c) == "bonus":
                self._play_bonus(i, c)
                return None
            m = month(c)
            fl = [x for x in self.floor if month(x) == m]
            if len(fl) == 2 and kind(fl[0]) != kind(fl[1]) or len(fl) == 2 and pi_value(fl[0]) != pi_value(fl[1]):
                # 두 장 가운데 고르기
                self.hands[i].remove(c)
                self.pending = {"card": c, "opts": fl}
                self.phase = "choose"
                self._event("play", i, c=c)
                self._set_deadline()
                return None
            self.hands[i].remove(c)
            self._event("play", i, c=c)
            self._resolve_play(i, c, fl[0] if len(fl) == 2 else None)
            return None
        return "알 수 없는 수예요"

    def _play_bonus(self, i: int, c: int) -> None:
        """보너스 쌍피: 바로 내 것 → 더미에서 1장 받아서 이어서 내요"""
        self.hands[i].remove(c)
        self._event("play", i, c=c)
        self._event("bonus", i)
        self.captured[i].append(c)
        self._event("take", i, cards=[c])
        self.log.append(f"{self.names[i]}: 보너스 쌍피!")
        if self.deck:
            self.hands[i].append(self.deck.pop())
            self.hands[i].sort()
        if not self.hands[i]:
            self._finish_turn(i, [], 0, None)
            return
        self.phase = "play"
        self._set_deadline()

    def _resolve_play(self, i: int, c: int, pick: Optional[int]) -> None:
        """손에서 낸 카드를 바닥과 맞추고 → 뒤집기"""
        m = month(c)
        fl = [x for x in self.floor if month(x) == m]
        taken: List[int] = []
        state = {"card": c, "m": m, "n": len(fl)}
        if len(fl) == 0:
            self.floor.append(c)
            state["placed"] = True
        elif len(fl) == 1:
            state["pair"] = fl[0]
        elif len(fl) == 2:
            state["pair"] = pick if pick in fl else fl[0]
        else:   # 3장: 뻑 먹기
            for x in fl:
                self.floor.remove(x)
            taken = fl + [c]
            state["ppeok_eat"] = True
        self._flip_phase(i, state, taken, c)

    def _flip_phase(self, i: int, st: Optional[dict], taken: List[int], played: Optional[int], steal: int = 0) -> None:
        # 뒤집은 카드가 보너스 쌍피면 가져가고 한 장 더 뒤집어요
        while self.deck and kind(self.deck[-1]) == "bonus":
            b = self.deck.pop()
            self._event("flip", i, c=b)
            self._event("bonus", i)
            self.log.append(f"{self.names[i]}: 보너스 쌍피!")
            taken.append(b)
        if not self.deck:
            # 더미가 없으면 뒤집지 않고 끝
            if st and st.get("pair") is not None:
                self.floor.remove(st["pair"])
                taken += [st["card"], st["pair"]]
            elif st and not st.get("placed") and not st.get("ppeok_eat"):
                pass
            self._finish_turn(i, taken, steal, played)
            return
        f = self.deck.pop()
        fm = month(f)
        self._event("flip", i, c=f)
        if st and fm == st["m"] and not st.get("ppeok_eat"):
            if st.get("placed"):
                # 쪽
                self.floor.remove(st["card"])
                taken += [st["card"], f]
                steal += 1
                self._event("jjok", i)
                self.log.append(f"{self.names[i]}: 쪽!")
            elif st["n"] == 1:
                # 뻑: 세 장이 바닥에
                self.floor.append(st["card"])
                self.floor.append(f)
                self.ppeok_owner[fm] = i
                self._event("ppeok", i, m=fm)
                self.log.append(f"{self.names[i]}: 뻑!")
            elif st["n"] == 2:
                # 따닥: 4장 다
                fl = [x for x in self.floor if month(x) == fm]
                for x in fl:
                    self.floor.remove(x)
                taken += fl + [st["card"], f]
                steal += 1
                self._event("ttadak", i)
                self.log.append(f"{self.names[i]}: 따닥!")
            st = None
        else:
            if st and st.get("pair") is not None:
                self.floor.remove(st["pair"])
                taken += [st["card"], st["pair"]]
            elif st and st.get("ppeok_eat"):
                steal += 1
                owner = self.ppeok_owner.pop(st["m"], -1)
                self._event("ppeok_eat", i, m=st["m"])
                self.log.append(f"{self.names[i]}: 뻑 먹기!")
            ffl = [x for x in self.floor if month(x) == fm]
            if not ffl:
                self.floor.append(f)
            elif len(ffl) == 1:
                self.floor.remove(ffl[0])
                taken += [f, ffl[0]]
            elif len(ffl) == 2:
                best = max(ffl, key=self._value)
                self.floor.remove(best)
                taken += [f, best]
            else:
                for x in ffl:
                    self.floor.remove(x)
                taken += ffl + [f]
                steal += 1
                self.ppeok_owner.pop(fm, None)
                self._event("ppeok_eat", i, m=fm)
        if not self.floor and taken:
            steal += 1
            self._event("sweep", i)
            self.log.append(f"{self.names[i]}: 싹쓸이!")
        self._finish_turn(i, taken, steal, played)

    def _value(self, c: int) -> float:
        k = kind(c)
        return {"gwang": 6, "yeol": 4 if grp(c) == "bird" else 3, "tti": 3, "ssang": 2.5, "bonus": 2.5, "pi": 1}[k]

    def _finish_turn(self, i: int, taken: List[int], steal: int, played: Optional[int]) -> None:
        self.captured[i] += taken
        if taken:
            self._event("take", i, cards=taken)
        for _ in range(steal):
            for j in self.players:
                if j == i:
                    continue
                pis = sorted([c for c in self.captured[j] if kind(c) in ("pi", "ssang", "bonus")], key=pi_value)
                if pis:
                    c = pis[0]
                    self.captured[j].remove(c)
                    self.captured[i].append(c)
                    self._event("steal", i, frm=j, c=c)
        sc = score_detail(self.captured[i])["total"]
        everyone_empty = all(not self.hands[p] for p in self.players)
        if sc >= self.threshold() and sc > self.go_score[i]:
            if everyone_empty or (not self.deck and not self.hands[i]):
                self._win(i)          # 마지막 차례면 바로 스톱
                return
            self.phase = "gostop"
            self._set_deadline()
            return
        self._next_turn()

    def _next_turn(self) -> None:
        if all(not self.hands[p] for p in self.players) and all(self.bomb_turns[p] == 0 for p in self.players):
            self._nagari()
            return
        np_ = len(self.players)
        k = self.players.index(self.turn)
        for step in range(1, np_ + 1):
            nxt = self.players[(k + step) % np_]
            if self.hands[nxt] or self.bomb_turns[nxt]:
                self.turn = nxt
                break
        else:
            self._nagari()
            return
        self.phase = "play"
        self._set_deadline()

    def _nagari(self) -> None:
        self.end = {"winner": -1, "text": "나가리! 다음 판은 2배", "round": self.round, "pays": [0] * self.n,
                    "detail": None, "mult": [], "seller": self.seller, "sell": []}
        self.nagari *= 2
        self._event("nagari", -1)
        self.log.append("나가리 — 다음 판 2배")
        self.phase = "roundover"
        self.deadline = 0
        self.wait_until = time.time() + 5

    def _win(self, w: int) -> None:
        d = score_detail(self.captured[w])
        base = d["total"]
        g = self.go[w]
        if g == 1:
            base += 1
        elif g == 2:
            base += 2
        elif g >= 3:
            base = (base + 2) * (2 ** (g - 2))
        mult_common = (2 ** self.shake[w]) * (2 ** self.bomb[w]) * self.nagari
        pays = [0] * self.n
        lines = []
        goback = [j for j in self.players if j != w and self.go[j] > 0] if len(self.players) >= 3 else []
        for j in self.players:
            if j == w:
                continue
            dj = score_detail(self.captured[j])
            m = mult_common
            tags = []
            if d["pi"] > 0 and dj["piCount"] <= 7:
                m *= 2
                tags.append("피박")
            if d["gwang"] > 0 and dj["gwangCount"] == 0:
                m *= 2
                tags.append("광박")
            pays[j] = base * m
            lines.append({"seat": j, "tags": tags, "pay": pays[j]})
        if goback:
            # 고박: 고를 불렀던 사람이 진 사람들 몫을 다 내요
            gb = goback[0]
            tot = sum(pays)
            pays = [0] * self.n
            pays[gb] = tot
            for ln in lines:
                ln["pay"] = pays[ln["seat"]]
                if ln["seat"] == gb:
                    ln["tags"].append("고박")
        for j in range(self.n):
            self.total[j] -= pays[j]
            self.total[w] += pays[j]
        # 광 팔기
        sell = []
        if self.seller >= 0:
            ng = sum(1 for c in self.sell_cards if kind(c) == "gwang")
            if ng:
                for j in self.players:
                    self.total[j] -= ng
                    self.total[self.seller] += ng
                sell = [self.seller, ng]
        mtags = []
        if g:
            mtags.append(f"{g}고")
        if self.shake[w]:
            mtags.append(f"흔들기 ×{2 ** self.shake[w]}")
        if self.bomb[w]:
            mtags.append(f"폭탄 ×{2 ** self.bomb[w]}")
        if self.nagari > 1:
            mtags.append(f"나가리 ×{self.nagari}")
        self.end = {"winner": w, "text": f"{d['total']}점{' · ' + str(g) + '고' if g else ''} 승리!", "round": self.round,
                    "detail": d, "base": base, "mult": mtags, "lines": lines, "pays": pays, "seller": self.seller,
                    "sell": sell, "sellCards": self.sell_cards}
        self.nagari = 1
        self.first = w                     # 이긴 사람이 다음 판 선
        self.log.append(f"{self.names[w]} 승리 — {sum(pays)}점")
        self._event("win", w)
        self.phase = "roundover"
        self.deadline = 0
        self.wait_until = time.time() + 8

    def timeout_action(self, i: int) -> dict:
        if self.phase == "gostop":
            return {"k": "stop"}
        if self.phase == "choose":
            return {"k": "choose", "c": max(self.pending["opts"], key=self._value)}
        if self.bomb_turns[i]:
            return {"k": "flip"}
        return {"k": "play", "c": self._ai_pick_card(i, 2)}

    # ---------------- AI ----------------
    def ai_delay(self, i: int) -> float:
        # 화면이 한 차례를 천천히(2초쯤) 보여 주니까 그동안 기다려요
        return self.rng.uniform(2.2, 2.9) if self.phase == "play" else self.rng.uniform(1.2, 1.9)

    def _need_bonus(self, i: int, c: int) -> float:
        """이 카드를 가져가면 무리(광·고도리·단·피)가 얼마나 가까워지나"""
        mine = self.captured[i]
        k = kind(c)
        b = 0.0
        if k == "gwang":
            n = sum(1 for x in mine if kind(x) == "gwang")
            b += 2 + n * 1.5
        if k == "yeol" and grp(c) == "bird":
            n = sum(1 for x in (4, 12, 29) if x in mine)
            b += 1 + n * 2
        if k == "tti" and grp(c):
            n = sum(1 for x in mine if kind(x) == "tti" and grp(x) == grp(c))
            b += 0.5 + n * 1.5
        if k in ("pi", "ssang"):
            pv = sum(pi_value(x) for x in mine)
            b += 0.3 if pv < 7 else 0.8
        return b

    def _ai_pick_card(self, i: int, lv: int) -> int:
        h = self.hands[i]
        rng = self.rng
        bonus = [c for c in h if kind(c) == "bonus"]
        if bonus:
            return bonus[0]           # 보너스 쌍피는 바로 내는 게 이득
        if lv <= 1 and rng.random() < 0.6:
            return rng.choice(h)
        seen = set(self.floor) | set(c for p in self.players for c in self.captured[p]) | set(h)
        best = None
        bv = -1e9
        for c in h:
            m = month(c)
            fl = [x for x in self.floor if month(x) == m]
            v = 0.0
            if len(fl) == 3:
                v += sum(self._value(x) for x in fl) + self._value(c) + 3
            elif fl:
                tgt = max(fl, key=self._value)
                v += self._value(tgt) + self._value(c)
                if lv >= 3:
                    v += self._need_bonus(i, tgt) + self._need_bonus(i, c)
            else:
                # 버리기: 상대가 먹기 쉬운 카드는 피하고, 내 손에 같은 달이 있으면 나중을 위해 아껴요
                v -= self._value(c) * (0.6 if lv >= 3 else 0.3)
                if lv >= 4:
                    unseen = 4 - sum(1 for x in range(48) if month(x) == m and x in seen)
                    v -= unseen * 0.6
                if sum(1 for x in h if month(x) == m) >= 2:
                    v -= 1.5
            if lv >= 4 and len(fl) == 2:
                v += 0.5
            v += rng.random() * {1: 3, 2: 1.2, 3: 0.6, 4: 0.3, 5: 0.15}[lv]
            if v > bv:
                bv = v
                best = c
        return best

    def ai_action(self, i: int) -> dict:
        lv = self.level
        rng = self.rng
        if self.phase == "gostop":
            if lv <= 1:
                return {"k": "go" if rng.random() < 0.5 else "stop"}
            if lv == 2:
                return {"k": "stop"}
            my = score_detail(self.captured[i])["total"]
            opp_best = max(score_detail(self.captured[j])["total"] for j in self.players if j != i)
            cards_left = len(self.deck)
            risk = opp_best / max(1, self.threshold())
            if self.go[i] >= (2 if lv == 3 else 3):
                return {"k": "stop"}
            # 남은 카드가 넉넉하고 상대가 아직 멀면 고! (단계가 높을수록 상대 형편을 잘 봐요)
            hands_left = len(self.hands[i])
            if hands_left >= 2 and cards_left >= (6 if lv >= 4 else 8) and risk < (0.67 if lv >= 4 else 0.5) and my < 15:
                return {"k": "go"}
            return {"k": "stop"}
        if self.phase == "choose":
            opts = self.pending["opts"]
            return {"k": "choose", "c": max(opts, key=lambda x: self._value(x) + (self._need_bonus(i, x) if lv >= 3 else 0))}
        o = self.options(i)
        if o.get("flipOnly"):
            return {"k": "flip"}
        if o.get("bomb") and lv >= 2:
            return {"k": "bomb", "m": o["bomb"][0]}
        if o.get("shake") and lv >= 3:
            return {"k": "shake", "m": o["shake"][0]}
        return {"k": "play", "c": self._ai_pick_card(i, lv)}

    # ---------------- 화면 ----------------
    def view(self, seat: Optional[int]) -> dict:
        v = {
            "round": self.round, "rounds": ROUNDS, "phase": self.phase, "turn": self.turn, "toAct": self.actor(),
            "deadline": int(self.deadline * 1000) if self.deadline else 0, "threshold": self.threshold(),
            "deck": len(self.deck), "floor": self.floor[:], "players": self.players, "seller": self.seller,
            "seats": [{
                "n": len(self.hands[j]), "cap": self.captured[j][:], "score": score_detail(self.captured[j])["total"] if j in self.players else 0,
                "go": self.go[j], "shake": self.shake[j], "bomb": self.bomb[j], "total": self.total[j], "flipOnly": self.bomb_turns[j],
            } for j in range(self.n)],
            "me": seat, "log": self.log[-6:], "events": self.events[-6:], "over": self.over,
            "nagari": self.nagari, "pending": self.pending["card"] if self.pending else None,
            "end": self.end if self.phase in ("roundover", "done") else None,
        }
        if seat is not None:
            v["hand"] = self.hands[seat][:]
            v["opts"] = self.options(seat)
            if self.phase == "choose" and seat == self.turn:
                v["choose"] = self.pending["opts"]
            v["myDetail"] = score_detail(self.captured[seat])
        if self.over:
            v["result"] = self.result()
        return v

    def result(self) -> dict:
        order = sorted(range(self.n), key=lambda j: -self.total[j])
        return {"winner": order[0], "rank": order, "score": self.total[:], "hands": self.round}
