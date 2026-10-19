/* 아리채 오락실 · 헥스 AI — '이기려면 몇 칸 더 필요한가(최단 거리)'를 서로 비교해요
   두 칸을 동시에 위협하는 '다리(bridge)' 모양도 반 칸으로 쳐요 */
(function (root) {
  'use strict';
  const R = root.BoardRules.hex;
  const N = R.N;
  const NN = N * N;
  // 다리: 두 칸 떨어진 칸과 그 사이 두 칸
  const BR = Array.from({ length: NN }, (_, i) => {
    const r = (i / N) | 0; const c = i % N;
    return [[-1, 2, -1, 1, 0, 1], [1, 1, 0, 1, 1, 0], [2, -1, 1, -1, 1, 0], [1, -2, 1, -1, 0, -1], [-1, -1, 0, -1, -1, 0], [-2, 1, -1, 1, -1, 0]]
      .map(([dr, dc, ar, ac, br, bc]) => [r + dr, c + dc, r + ar, c + ac, r + br, c + bc])
      .filter((v) => v.every((x) => x >= 0 && x < N))
      .map(([a, b, c2, d, e, f]) => [a * N + b, c2 * N + d, e * N + f]);
  });

  // 0-1 BFS 비슷하게: 내 돌 0, 빈칸 1, 다리로 이어진 내 돌은 0.4 — 한 변에서 각 칸까지 거리
  function distFrom(b, seat, sideStart) {
    const c = seat + 1; const o = 2 - seat;
    const d = new Float64Array(NN).fill(1e9);
    const cost = (i) => (b[i] === c ? 0 : b[i] === o ? 1e9 : 1);
    const pq = [];
    for (let k = 0; k < N; k++) {
      let i;
      if (seat === 0) i = sideStart ? k : (N - 1) * N + k; else i = sideStart ? k * N : k * N + N - 1;
      const w = cost(i);
      if (w < 1e9 && w < d[i]) { d[i] = w; pq.push([w, i]); }
    }
    while (pq.length) {
      let bi = 0;
      for (let k = 1; k < pq.length; k++) if (pq[k][0] < pq[bi][0]) bi = k;
      const [dd, i] = pq[bi]; pq[bi] = pq[pq.length - 1]; pq.pop();
      if (dd > d[i]) continue;
      for (const j of R.NEI[i]) {
        const w = cost(j);
        if (w >= 1e9) continue;
        if (dd + w < d[j]) { d[j] = dd + w; pq.push([d[j], j]); }
      }
      if (b[i] === c) {
        for (const [j, x, y] of BR[i]) {
          if (b[j] === c && !b[x] && !b[y] && dd + 0.4 < d[j]) { d[j] = dd + 0.4; pq.push([d[j], j]); }
        }
      }
    }
    return d;
  }
  function shortest(b, seat) {
    const d = distFrom(b, seat, true);
    let best = 1e9;
    for (let k = 0; k < N; k++) {
      const i = seat === 0 ? (N - 1) * N + k : k * N + N - 1;
      if (d[i] < best) best = d[i];
    }
    return best;
  }
  function evaluate(st, me) {
    const a = shortest(st.b, me); const o = shortest(st.b, 1 - me);
    return (o - a) * 100 + (st.turn === me ? 30 : -30);
  }
  // 두 사람의 최단 길 위에 있는 칸부터 생각해요
  function order(st, moves) {
    const sc = new Float64Array(NN);
    for (const s of [0, 1]) {
      const d1 = distFrom(st.b, s, true); const d2 = distFrom(st.b, s, false);
      const best = shortest(st.b, s);
      for (const i of moves) {
        const v = d1[i] + d2[i] - (st.b[i] ? 0 : 1);
        sc[i] += Math.max(0, 6 - (v - best)) * (s === st.turn ? 1 : 1.1);
      }
    }
    const ctr = (i) => -Math.abs(((i / N) | 0) - 4) - Math.abs((i % N) - 4);
    return moves.slice().sort((a, b) => (sc[b] - sc[a]) || (ctr(b) - ctr(a)));
  }
  const AI = root.BoardAIKit.make({
    rules: R, evaluate, order,
    levels: {
      1: { depth: 1, random: 0.4, noise: 1.5, maxBranch: 20 },
      2: { depth: 1, noise: 0.5, maxBranch: 14 },
      3: { depth: 2, ms: 500, noise: 0.05, maxBranch: 10 },
      4: { depth: 3, ms: 1000, maxBranch: 9 },
      5: { depth: 4, ms: 1800, maxBranch: 8 }
    }
  });
  function choose(history, level, opts) {
    if (!history.length) return 4 * N + 4 + (level <= 2 ? [0, 1, -1, N][Math.floor(Math.random() * 4)] : 0);
    return AI.choose(history, level, opts);
  }
  root.BoardAI = root.BoardAI || {};
  root.BoardAI.hex = { choose, evaluate };
})(typeof self !== 'undefined' ? self : this);
