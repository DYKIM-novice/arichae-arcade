/* 아리채 오락실 · 호박고누 규칙 (지역마다 조금씩 달라요 — 우리 집 규칙)
   말판: 동그란 호박(둘레 4점 + 가운데 1점, 십자로 연결)과 위·아래 '집'(3점씩).
   말 3개씩 자기 집에서 시작 (자리0 아래 집, 자리1 위 집). 줄을 따라 빈 곳으로 한 칸씩.
   집을 나온 말은 다시 어느 집에도 들어갈 수 없어요. 차례에 움직일 말이 없으면 져요. 80수가 넘으면 무승부
   점 번호: 0 가운데, 1 위 2 오른쪽 3 아래 4 왼쪽(둘레), 5~7 위 집, 8~10 아래 집 */
(function (root) {
  'use strict';

  const EDGES = [];
  for (let k = 1; k <= 4; k++) { EDGES.push([0, k]); EDGES.push([k, k === 4 ? 1 : k + 1]); }
  // 위 집: 5(왼) 6(가운데) 7(오른) — 둘레 맨 위(1)와 연결
  EDGES.push([5, 6], [6, 7], [5, 1], [6, 1], [7, 1]);
  // 아래 집: 8(왼) 9(가운데) 10(오른) — 둘레 맨 아래(3)와 연결
  EDGES.push([8, 9], [9, 10], [8, 3], [9, 3], [10, 3]);
  const NP = 11;
  const ADJ = Array.from({ length: NP }, () => []);
  EDGES.forEach(([a, b]) => { ADJ[a].push(b); ADJ[b].push(a); });
  const CAMP = [[8, 9, 10], [5, 6, 7]];
  const inCamp = (i) => i >= 5;
  const LIMIT = 80;

  function init() {
    const p = new Array(NP).fill(0);
    CAMP[0].forEach((i) => { p[i] = 1; });
    CAMP[1].forEach((i) => { p[i] = 2; });
    return { p, turn: 0, n: 0, last: [] };
  }
  function rawMoves(p, seat) {
    const out = [];
    for (let i = 0; i < NP; i++) {
      if (p[i] !== seat + 1) continue;
      for (const j of ADJ[i]) {
        if (p[j]) continue;
        // 집 밖에 있는 말은 집으로 못 들어가요 (집 안에서 옆 칸으로는 OK)
        if (inCamp(j) && !inCamp(i)) continue;
        if (inCamp(j) && inCamp(i) && !CAMP[seat].includes(j)) continue;
        out.push([i, j]);
      }
    }
    return out;
  }
  function moves(st) { return result(st) ? [] : rawMoves(st.p, st.turn); }
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
  root.BoardRules.hobak = { NP, EDGES, ADJ, CAMP, init, moves, play, turn, result, rawMoves };
})(typeof self !== 'undefined' ? self : this);
