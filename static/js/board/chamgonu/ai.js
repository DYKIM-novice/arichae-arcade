/* 아리채 오락실 · 참고누 AI — 말 수 차이 + 꼰이 될 뻔한 줄(2개+빈칸) + 움직일 길 */
(function (root) {
  'use strict';
  const R = root.BoardRules.chamgonu;
  function evaluate(st, me) {
    const mc = me + 1; const oc = 2 - me;
    let s = (R.count(st.p, me) - R.count(st.p, 1 - me)) * 100;
    for (const l of R.LINES) {
      let a = 0; let b = 0; let e = 0;
      for (const j of l) { const v = st.p[j]; if (v === mc) a++; else if (v === oc) b++; else if (!st.peg.includes(j)) e++; }
      if (a === 2 && e === 1) s += 14; if (b === 2 && e === 1) s -= 16;
    }
    if (st.phase === 'move') {
      let ma = 0; let mb = 0;
      for (let f = 0; f < 24; f++) {
        const v = st.p[f];
        if (!v) continue;
        for (const t of R.ADJ[f]) if (!st.p[t]) { if (v === mc) ma++; else mb++; }
      }
      s += (ma - mb) * 3;
    }
    return s;
  }
  function order(st, moves) { return moves.slice().sort((a, b) => (b.x != null) - (a.x != null)); }
  const AI = root.BoardAIKit.make({
    rules: R, evaluate, order,
    levels: {
      1: { depth: 1, random: 0.5, noise: 1.5 },
      2: { depth: 2, random: 0.15, noise: 0.6 },
      3: { depth: 3, ms: 500, noise: 0.1, maxBranch: 24 },
      4: { depth: 4, ms: 1000, maxBranch: 22 },
      5: { depth: 6, ms: 1700, maxBranch: 20 }
    }
  });
  root.BoardAI = root.BoardAI || {};
  root.BoardAI.chamgonu = { choose: AI.choose, evaluate };
})(typeof self !== 'undefined' ? self : this);
