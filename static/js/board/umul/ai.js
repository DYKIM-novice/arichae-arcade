/* 아리채 오락실 · 우물고누 AI — 판이 작아서 높은 단계는 끝까지 읽어요 */
(function (root) {
  'use strict';
  const R = root.BoardRules.umul;
  function mob(p, seat) { let n = 0; for (let i = 0; i < 5; i++) if (p[i] === seat + 1) for (const j of R.ADJ[i]) if (!p[j]) n++; return n; }
  function evaluate(st, me) { return (mob(st.p, me) - mob(st.p, 1 - me)) * 10 + (st.p[2] === me + 1 ? 4 : 0); }
  const AI = root.BoardAIKit.make({
    rules: R, evaluate,
    levels: {
      1: { depth: 1, random: 0.95, noise: 2 },
      2: { depth: 2, random: 0.5, noise: 1 },
      3: { depth: 4, noise: 0.2 },
      4: { depth: 8, ms: 700 },
      5: { depth: 16, ms: 1200 }
    }
  });
  root.BoardAI = root.BoardAI || {};
  root.BoardAI.umul = { choose: AI.choose, evaluate };
})(typeof self !== 'undefined' ? self : this);
