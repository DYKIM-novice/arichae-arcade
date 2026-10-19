/* 아리채 오락실 · 네밭고누 AI — 말 수 차이 + 잡힐 위험 + 움직일 길 */
(function (root) {
  'use strict';
  const R = root.BoardRules.nebat;
  function threats(p, seat) {
    // seat 이 지금 잡을 수 있는 상대 말 수 (서로 다른 말)
    const c = seat + 1; const o = 2 - seat; const s = new Set();
    for (let i = 0; i < 16; i++) if (p[i] === c) for (const [m, t] of R.JUMP[i]) if (p[m] === c && p[t] === o) s.add(t);
    return s.size;
  }
  function mob(p, seat) { let k = 0; for (let i = 0; i < 16; i++) if (p[i] === seat + 1) for (const t of R.STEP[i]) if (!p[t]) k++; return k; }
  function evaluate(st, me) {
    const op = 1 - me;
    const a = R.count(st.p, me); const b = R.count(st.p, op);
    let s = (a - b) * 100;
    // 차례인 쪽은 위협이 바로 잡기가 되고, 아닌 쪽은 막을 시간이 있어요
    const ta = threats(st.p, me); const tb = threats(st.p, op);
    if (st.turn === me) s += ta * 30 - tb * 12; else s += ta * 12 - tb * 30;
    s += (mob(st.p, me) - mob(st.p, op)) * 3;
    return s;
  }
  function order(st, moves) { return moves.slice().sort((x, y) => (st.p[y[1]] ? 1 : 0) - (st.p[x[1]] ? 1 : 0)); }
  const AI = root.BoardAIKit.make({
    rules: R, evaluate, order,
    levels: {
      1: { depth: 1, random: 0.6, noise: 2 },
      2: { depth: 2, random: 0.2, noise: 0.8 },
      3: { depth: 3, ms: 400, noise: 0.15 },
      4: { depth: 6, ms: 900 },
      5: { depth: 10, ms: 1600 }
    }
  });
  root.BoardAI = root.BoardAI || {};
  root.BoardAI.nebat = { choose: AI.choose, evaluate };
})(typeof self !== 'undefined' ? self : this);
