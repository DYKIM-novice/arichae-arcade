/* 아리채 오락실 · 우물고누 규칙 (지역마다 조금씩 달라요 — 우리 집 규칙)
   말판: 네모 꼭짓점 4개 + 가운데 1개. 아래쪽 두 꼭짓점 사이는 '우물'이라 지나갈 수 없어요.
   말 2개씩: 자리0(먼저) 왼쪽 두 꼭짓점, 자리1 오른쪽 두 꼭짓점. 줄을 따라 빈 곳으로 한 칸씩.
   차례에 움직일 말이 없으면 져요.  첫 수로 바로 상대를 가두는 것은 안 돼요.  60수가 넘으면 무승부
   점 번호: 0 왼쪽 위, 1 오른쪽 위, 2 가운데, 3 왼쪽 아래, 4 오른쪽 아래 */
(function (root) {
  'use strict';

  const EDGES = [[0, 1], [0, 3], [1, 4], [0, 2], [1, 2], [3, 2], [4, 2]];
  const ADJ = [[], [], [], [], []];
  EDGES.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a); });
  const LIMIT = 60;

  function init() { return { p: [1, 2, 0, 1, 2], turn: 0, n: 0, last: [] }; }
  function rawMoves(p, seat) {
    const out = [];
    for (let i = 0; i < 5; i++) if (p[i] === seat + 1) for (const j of ADJ[i]) if (!p[j]) out.push([i, j]);
    return out;
  }
  function moves(st) {
    if (result(st)) return [];
    let ms = rawMoves(st.p, st.turn);
    if (st.n === 0) {
      // 첫 수로 상대를 바로 가두면 안 돼요
      const ok = ms.filter((m) => { const p = st.p.slice(); p[m[1]] = p[m[0]]; p[m[0]] = 0; return rawMoves(p, 1 - st.turn).length > 0; });
      if (ok.length) ms = ok;
    }
    return ms;
  }
  function play(st, m) {
    const p = st.p.slice();
    p[m[1]] = p[m[0]]; p[m[0]] = 0;
    return { p, turn: 1 - st.turn, n: st.n + 1, last: m };
  }
  function turn(st) { return st.turn; }
  function result(st) {
    if (!rawMoves(st.p, st.turn).length) return { winner: 1 - st.turn };
    if (st.n >= LIMIT) return { winner: -1 };
    return null;
  }
  root.BoardRules = root.BoardRules || {};
  root.BoardRules.umul = { EDGES, ADJ, init, moves, play, turn, result };
})(typeof self !== 'undefined' ? self : this);
