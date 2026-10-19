/* 아리채 오락실 · 오목 규칙 (화면과 AI 워커가 같이 써요)
   우리 집 규칙
   - 15줄 판, 흑이 먼저
   - 정확히 다섯 개를 이으면 승리 (6개 이상 = 장목은 둘 수 있지만 이긴 걸로 치지 않아요)
   - 3·3 금지: 흑·백 모두. 띈 3(●●_●) 도 3으로 세요. 3·3·3 도 당연히 금지
   - 4·4, 4·3 은 허용
   - 다섯을 만드는 수는 3·3 이어도 둘 수 있어요 */
(function (root) {
  'use strict';

  const N = 15;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;

  function inb(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }

  // 한 방향으로 같은 색이 몇 개 이어지는지 (시작 칸 제외)
  function runLen(cells, x, y, dx, dy, c) {
    let k = 0;
    x += dx; y += dy;
    while (inb(x, y) && cells[y * N + x] === c) { k++; x += dx; y += dy; }
    return k;
  }

  // (x,y) 에 c 가 놓여 있다고 보고 정확히 다섯인지
  function isFiveAt(cells, x, y, c) {
    for (const [dx, dy] of DIRS) {
      const n = 1 + runLen(cells, x, y, dx, dy, c) + runLen(cells, x, y, -dx, -dy, c);
      if (n === 5) return true;
    }
    return false;
  }
  function isOverlineAt(cells, x, y, c) {
    for (const [dx, dy] of DIRS) {
      if (1 + runLen(cells, x, y, dx, dy, c) + runLen(cells, x, y, -dx, -dy, c) >= 6) return true;
    }
    return false;
  }

  // (x,y)를 지나는 한 방향에서, 빈칸 하나를 더 두면 '열린 4'(양쪽이 비어 있고 어느 쪽으로도 정확히 5가 되는 4)가 되는지
  // = 그 방향에 '열린 3' 이 있는지 (띈 3 포함)
  function openThreeInDir(cells, x, y, dx, dy, c) {
    for (let k = -4; k <= 4; k++) {
      if (k === 0) continue;
      const ex = x + k * dx;
      const ey = y + k * dy;
      if (!inb(ex, ey) || cells[ey * N + ex] !== EMPTY) continue;
      cells[ey * N + ex] = c;
      const ok = openFourThrough(cells, ex, ey, dx, dy, c, x, y);
      cells[ey * N + ex] = EMPTY;
      if (ok) return true;
    }
    return false;
  }
  // (ex,ey) 를 지나는 이어진 줄이 정확히 4개이고, (px,py) 를 포함하며, 양 끝이 비어 있고 양 끝에 두면 정확히 5가 되는지
  function openFourThrough(cells, ex, ey, dx, dy, c, px, py) {
    const a = runLen(cells, ex, ey, -dx, -dy, c);
    const b = runLen(cells, ex, ey, dx, dy, c);
    if (a + b + 1 !== 4) return false;
    // (px,py) 가 이 줄 안에 있어야 해요
    const t = dx !== 0 ? (px - ex) / dx : (py - ey) / dy;
    if (!(t >= -a && t <= b) || px - ex !== t * dx || py - ey !== t * dy) return false;
    const sx = ex - (a + 1) * dx; const sy = ey - (a + 1) * dy;     // 앞쪽 끝 빈칸
    const fx = ex + (b + 1) * dx; const fy = ey + (b + 1) * dy;     // 뒤쪽 끝 빈칸
    if (!inb(sx, sy) || !inb(fx, fy)) return false;
    if (cells[sy * N + sx] !== EMPTY || cells[fy * N + fx] !== EMPTY) return false;
    // 끝에 두었을 때 6목이 되면 열린 4가 아니에요
    const s2x = sx - dx; const s2y = sy - dy;
    const f2x = fx + dx; const f2y = fy + dy;
    if (inb(s2x, s2y) && cells[s2y * N + s2x] === c) return false;
    if (inb(f2x, f2y) && cells[f2y * N + f2x] === c) return false;
    return true;
  }

  // 그 자리에 c 를 두면 3·3 인지 ('33' 또는 '')
  function forbiddenReason(cells, idx, c) {
    if (cells[idx] !== EMPTY) return '';
    const x = idx % N;
    const y = (idx / N) | 0;
    cells[idx] = c;
    let reason = '';
    if (!isFiveAt(cells, x, y, c)) {
      let threes = 0;
      for (const [dx, dy] of DIRS) {
        if (openThreeInDir(cells, x, y, dx, dy, c)) {
          threes++;
          if (threes >= 2) { reason = '33'; break; }
        }
      }
    }
    cells[idx] = EMPTY;
    return reason;
  }

  function init(opts) {
    return { n: N, cells: new Int8Array(N * N), turn: BLACK, moves: [], over: false, winner: 0, line: null, opts: opts || {} };
  }

  // 화면용: 판 상태를 수 목록으로 다시 만들어요
  function replay(moves, opts) {
    const st = init(opts);
    for (const m of moves) {
      const r = play(st, m);
      if (!r.ok) break;
    }
    return st;
  }

  function legal(st, idx) {
    if (st.over || idx < 0 || idx >= N * N || st.cells[idx] !== EMPTY) return false;
    return !forbiddenReason(st.cells, idx, st.turn);
  }

  function winLine(cells, x, y, c) {
    for (const [dx, dy] of DIRS) {
      const a = runLen(cells, x, y, -dx, -dy, c);
      const b = runLen(cells, x, y, dx, dy, c);
      if (a + b + 1 === 5) {
        const out = [];
        for (let k = -a; k <= b; k++) out.push((y + k * dy) * N + (x + k * dx));
        return out;
      }
    }
    return null;
  }

  // 수 두기 (st 를 직접 바꿔요). {ok, reason}
  function play(st, idx) {
    if (st.over) return { ok: false, reason: 'over' };
    if (idx < 0 || idx >= N * N || st.cells[idx] !== EMPTY) return { ok: false, reason: 'taken' };
    const c = st.turn;
    const why = forbiddenReason(st.cells, idx, c);
    if (why) return { ok: false, reason: why };
    st.cells[idx] = c;
    st.moves.push(idx);
    const x = idx % N;
    const y = (idx / N) | 0;
    const line = winLine(st.cells, x, y, c);
    if (line) {
      st.over = true; st.winner = c; st.line = line;
    } else if (st.moves.length >= N * N) {
      st.over = true; st.winner = 0;
    }
    st.turn = c === BLACK ? WHITE : BLACK;
    return { ok: true, overline: !line && isOverlineAt(st.cells, x, y, c) };
  }

  // 지금 차례인 사람이 둘 수 없는 자리 (✕ 표시용) — 돌 근처만 살펴요
  function forbiddenList(st) {
    const out = [];
    if (st.over) return out;
    const cells = st.cells;
    const near = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) {
      if (cells[i] !== st.turn) continue;
      const x = i % N; const y = (i / N) | 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (inb(x + dx, y + dy)) near[(y + dy) * N + x + dx] = 1;
      }
    }
    for (let i = 0; i < N * N; i++) {
      if (near[i] && cells[i] === EMPTY && forbiddenReason(cells, i, st.turn)) out.push(i);
    }
    return out;
  }

  const api = { N, DIRS, EMPTY, BLACK, WHITE, inb, runLen, isFiveAt, isOverlineAt, openThreeInDir, openFourThrough,
    forbiddenReason, init, replay, legal, play, forbiddenList, winLine };
  root.BoardRules = root.BoardRules || {};
  root.BoardRules.omok = api;
})(typeof self !== 'undefined' ? self : this);
