/* 아리채 오락실 · 사목(커넥트 포) 규칙
   가로 7칸 × 세로 6칸. 칸(열)을 고르면 돌이 맨 아래로 떨어져요. 가로·세로·대각선으로 4개를 먼저 이으면 승리 */
(function (root) {
  'use strict';

  const W = 7;
  const H = 6;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function init() { return { b: new Array(W * H).fill(0), h: new Array(W).fill(0), turn: 0, n: 0, win: -1, line: null, last: -1 }; }
  // b[y*W+x], y=0 이 맨 아래
  function moves(st) {
    if (st.win >= 0 || st.n >= W * H) return [];
    const out = [];
    for (let x = 0; x < W; x++) if (st.h[x] < H) out.push(x);
    return out;
  }
  function lineAt(b, x, y, c) {
    for (const [dx, dy] of DIRS) {
      const cells = [[x, y]];
      for (const s of [1, -1]) {
        let k = 1;
        while (true) {
          const xx = x + dx * k * s; const yy = y + dy * k * s;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || b[yy * W + xx] !== c) break;
          cells.push([xx, yy]); k++;
        }
      }
      if (cells.length >= 4) return cells.map(([a, b2]) => b2 * W + a);
    }
    return null;
  }
  function play(st, x) {
    if (st.win >= 0 || x < 0 || x >= W || st.h[x] >= H) return st;
    const b = st.b.slice();
    const h = st.h.slice();
    const y = h[x]++;
    const c = st.turn + 1;
    b[y * W + x] = c;
    const line = lineAt(b, x, y, c);
    return { b, h, turn: 1 - st.turn, n: st.n + 1, win: line ? st.turn : -1, line, last: y * W + x };
  }
  function turn(st) { return st.turn; }
  function result(st) {
    if (st.win >= 0) return { winner: st.win };
    if (st.n >= W * H) return { winner: -1 };
    return null;
  }

  root.BoardRules = root.BoardRules || {};
  root.BoardRules.connect4 = { W, H, init, moves, play, turn, result, lineAt };
})(typeof self !== 'undefined' ? self : this);
