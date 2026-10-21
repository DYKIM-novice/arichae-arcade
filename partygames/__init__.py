"""아리채 오락실 · 놀이마당 (여럿이 함께 하는 게임) — 서버가 규칙을 계산해요

카드게임관 table 방식과 같은 틀이에요 (cardgames/__init__.py 설명 참고).
더한 것:
  TAKES_OPTS = True  → __init__(..., opts={...}) 로 방장이 고른 설정을 받아요 (games.json "options")
  MAX_ACT            → 한 번에 받는 수(cact)의 최대 크기 (그림처럼 큰 것)
"""
from .liar import Liar
from .tele import Tele
from .yut import Yut
from .bell import Bell

ENGINES = {"liar": Liar, "tele": Tele, "yut": Yut, "bell": Bell}
