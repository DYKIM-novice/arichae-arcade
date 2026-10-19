/* 아리채 오락실 · 네밭고누 규칙 (지역마다 조금씩 달라요 — 우리 집 규칙)
   말판: 가로세로 4줄 → 점 16개. 말 8개씩, 판을 가득 채우고 시작해요 (흑 아래 두 줄, 백 위 두 줄).
   차례마다 둘 중 하나:
   1) 옮기기: 내 말 하나를 가로·세로로 이웃한 빈 점으로 한 칸
   2) 잡기: 내 말이 바로 옆 '내 말'을 넘어, 그 너머의 '상대 말'을 잡고 그 자리로 가요 (한 번에 하나)
   처음엔 판이 꽉 차 있어서 첫 수는 꼭 잡기예요. 잡기는 해도 되고 안 해도 돼요.
   상대 말을 1개로 줄이거나, 상대가 움직일 수 없게 만들면 승리. 잡지 못하고 40수가 지나면 무승부
   점 번호: i = 줄*4 + 칸 (줄 0 이 맨 위)  ·  수: [출발, 도착] */
(function (root) {
  'use strict';

  const N = 4;
  const QUIET_LIMIT = 40;
  const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const STEP = Array.from({ length: 16 }, () => []);   // [이웃]
  const JUMP = Array.from({ length: 16 }, () => []);   // [넘을 점, 도착]
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const i = r * N + c;
    for (const [dr, dc] of DIRS) {
      const r1 = r + dr; const c1 = c + dc; const r2 = r + 2 * dr; const c2 = c + 2 * dc;
      if (r1 >= 0 && r1 < N && c1 >= 0 && c1 < N) STEP[i].push(r1 * N + c1);
      if (r2 >= 0 && r2 < N && c2 >= 0 && c2 < N) JUMP[i].push([r1 * N + c1, r2 * N + c2]);
    }
  }

  function init() {
    const p = [];
    for (let i = 0; i < 16; i++) p.push(i < 8 ? 2 : 1);
    return { p, turn: 0, n: 0, quiet: 0, last: [], cap: -1 };
  }
  function count(p, seat) { let k = 0; for (const v of p) if (v === seat + 1) k++; return k; }
  function rawMoves(p, seat) {
    const c = seat + 1; const o = 2 - seat;
    const caps = []; const steps = [];
    for (let i = 0; i < 16; i++) {
      if (p[i] !== c) continue;
      for (const [m, t] of JUMP[i]) if (p[m] === c && p[t] === o) caps.push([i, t]);
      for (const t of STEP[i]) if (!p[t]) steps.push([i, t]);
    }
    return caps.concat(steps);
  }
  function isCapture(p, m) { return p[m[1]] !== 0; }
  function moves(st) { return result(st) ? [] : rawMoves(st.p, st.turn); }
  function play(st, m) {
    const p = st.p.slice();
    const cap = p[m[1]] ? m[1] : -1;
    p[m[1]] = p[m[0]]; p[m[0]] = 0;
    return { p, turn: 1 - st.turn, n: st.n + 1, quiet: cap >= 0 ? 0 : st.quiet + 1, last: m, cap };
  }
  function turn(st) { return st.turn; }
  function result(st) {
    if (count(st.p, st.turn) <= 1) return { winner: 1 - st.turn, why: 'one' };
    if (!rawMoves(st.p, st.turn).length) return { winner: 1 - st.turn, why: 'stuck' };
    if (st.quiet >= QUIET_LIMIT) return { winner: -1, why: 'quiet' };
    return null;
  }
  root.BoardRules = root.BoardRules || {};
  root.BoardRules.nebat = { N, QUIET_LIMIT, STEP, JUMP, init, count, rawMoves, isCapture, moves, play, turn, result };
})(typeof self !== 'undefined' ? self : this);
