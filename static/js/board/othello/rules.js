/* 아리채 오락실 · 오델로 규칙 (화면과 AI 워커가 같이 써요)
   8×8 판, 흑(자리 0)이 먼저. 상대 돌을 내 돌 사이에 끼우면 뒤집혀요.
   둘 곳이 없으면 자동으로 넘어가고(패스), 둘 다 둘 곳이 없으면 끝. 돌이 많은 쪽이 승리 */
(function (root) {
  'use strict';

  const N = 8;
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function init() {
    const b = new Array(N * N).fill(0);
    b[3 * N + 3] = 2; b[4 * N + 4] = 2; b[3 * N + 4] = 1; b[4 * N + 3] = 1;
    return { b, turn: 0, over: false, pass: -1, last: -1, flipped: [] };
  }
  const color = (seat) => seat + 1;

  // seat 가 i 에 두면 뒤집히는 칸들
  function flips(b, i, seat) {
    if (b[i]) return [];
    const me = color(seat);
    const op = 3 - me;
    const x0 = i % N; const y0 = (i / N) | 0;
    const out = [];
    for (const [dx, dy] of D8) {
      let x = x0 + dx; let y = y0 + dy;
      const line = [];
      while (x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] === op) { line.push(y * N + x); x += dx; y += dy; }
      if (line.length && x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] === me) out.push(...line);
    }
    return out;
  }

  function movesFor(b, seat) {
    const out = [];
    for (let i = 0; i < N * N; i++) if (!b[i] && flips(b, i, seat).length) out.push(i);
    return out;
  }
  function moves(st) { return st.over ? [] : movesFor(st.b, st.turn); }

  function play(st, i) {
    const f = flips(st.b, i, st.turn);
    if (!f.length) return st;
    const b = st.b.slice();
    b[i] = color(st.turn);
    for (const j of f) b[j] = color(st.turn);
    const other = 1 - st.turn;
    let turn = other;
    let pass = -1;
    let over = false;
    if (!movesFor(b, other).length) {
      if (movesFor(b, st.turn).length) { turn = st.turn; pass = other; } else over = true;
    }
    return { b, turn, over, pass, last: i, flipped: f };
  }

  function count(b) {
    let x = 0; let o = 0;
    for (const v of b) { if (v === 1) x++; else if (v === 2) o++; }
    return [x, o];
  }
  function turn(st) { return st.turn; }
  function result(st) {
    if (!st.over) return null;
    const [x, o] = count(st.b);
    return { winner: x > o ? 0 : o > x ? 1 : -1, score: [x, o] };
  }

  root.BoardRules = root.BoardRules || {};
  root.BoardRules.othello = { N, init, moves, play, turn, result, flips, movesFor, count };
})(typeof self !== 'undefined' ? self : this);
