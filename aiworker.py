"""AI 친구의 '생각'을 서버와 따로(다른 프로세스에서) 해요.

알까기·당구·컬링처럼 칠 곳을 여러 번 시험해 보는 AI 는 한 번 생각하는 데 0.1~0.4초가 걸려요.
서버 안에서 하면 그동안 모든 방이 멈칫하니까, 판을 복사해서 여기서 생각하고 답(둘 수)만 돌려줘요.
"""
import pickle
import signal


def init() -> None:
    # Ctrl+C 는 서버(부모)가 처리해요 — 일꾼은 조용히
    try:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
    except (ValueError, OSError):
        pass


def ping() -> bool:
    return True


def think(blob: bytes, method: str, seat: int):
    """복사한 판(blob)에서 eng.<method>(seat) 를 계산해서 돌려줘요"""
    eng = pickle.loads(blob)
    return getattr(eng, method)(seat)
