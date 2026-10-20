"""아리채 오락실 · 서버에서 돌아가는 카드게임 규칙 (table 방식)

게임 하나 = 클래스 하나. 공통으로 갖출 것:
  __init__(n_seats, names, ai_level, rng)
  view(seat)        → 그 자리 사람에게 보낼 화면 정보 (남의 패는 '??')   seat=None 이면 구경꾼
  act(seat, a)      → 수 두기. 안 되면 오류 문장(str), 되면 None
  actor()           → 지금 둘 차례인 자리 (없으면 -1)
  ai_action(seat)   → AI 가 둘 수
  ai_delay(seat)    → AI 가 생각하는 척하는 시간(초)
  timeout_action(seat) → 시간 안에 안 두면 대신 둘 수 (없으면 None)
  turn_seconds      → 한 차례 시간 (0 이면 없음)
  over              → 게임 전체가 끝났나
  result()          → {"winner": 자리, "rank": [...], ...}
  step()            → 저절로 진행할 일이 있으면 하고 (다음 판 나눠 주기 등) 기다릴 시간(초)을 돌려줘요. 없으면 None
"""
from .holdem import Holdem
from .hulla import Hulla
from .gostop import GoStop

ENGINES = {"holdem": Holdem, "hulla": Hulla, "gostop": GoStop}
