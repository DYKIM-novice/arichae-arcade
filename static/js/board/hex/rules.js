/* 아리채 오락실 · 헥스 규칙
   9×9 육각형 칸. 빨강(자리 0, 먼저)은 위↔아래, 파랑(자리 1)은 왼쪽↔오른쪽을 이으면 승리.
   빈 칸에 번갈아 하나씩 놓아요. 헥스는 절대 비기지 않아요! */
(function (root) {
  'use strict';

  const N = 9;
  const NB = [[0, 1], [0, -1], [1, 0], [-1, 0], [-1, 1], [1, -1]];
  const NEI = Array.from({ length: N * N }, (_, i) => {
    const r = (i / N) | 0; const c = i % N;
    return NB.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N).map(([a, b]) => a * N + b);
  });

  function init() { return { b: new Array(N * N).fill(0), turn: 0, n: 0, win: -1, path: null, last: -1 }; }
  function moves(st) {
    if (st.win >= 0) return [];
    const out = [];
    for (let i = 0; i < N * N; i++) if (!st.b[i]) out.push(i);
    return out;
  }
  // seat 가 양쪽 변을 이었는지 (이었으면 길 칸들)
  function connected(b, seat) {
    const c = seat + 1;
    const start = [];
    for (let k = 0; k < N; k++) {
      const i = seat === 0 ? k : k * N;
      if (b[i] === c) start.push(i);
    }
    const prev = new Map();
    const q = [];
    start.forEach((i) => { prev.set(i, -1); q.push(i); });
    while (q.length) {
      const i = q.shift();
      const r = (i / N) | 0; const col = i % N;
      if ((seat === 0 && r === N - 1) || (seat === 1 && col === N - 1)) {
        const path = [];
        for (let k = i; k >= 0; k = prev.get(k)) path.push(k);
        return path;
      }
      for (const j of NEI[i]) if (b[j] === c && !prev.has(j)) { prev.set(j, i); q.push(j); }
    }
    return null;
  }
  function play(st, i) {
    if (st.win >= 0 || st.b[i]) return st;
    const b = st.b.slice();
    b[i] = st.turn + 1;
    const path = connected(b, st.turn);
    return { b, turn: 1 - st.turn, n: st.n + 1, win: path ? st.turn : -1, path, last: i };
  }
  function turn(st) { return st.turn; }
  function result(st) { return st.win >= 0 ? { winner: st.win } : null; }

  root.BoardRules = root.BoardRules || {};
  root.BoardRules.hex = { N, NEI, init, moves, play, turn, result, connected };
})(typeof self !== 'undefined' ? self : this);
