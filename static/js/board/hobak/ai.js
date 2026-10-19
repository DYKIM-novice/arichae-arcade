/* 아리채 오락실 · 호박고누 AI — 내가 움직일 길은 넓게, 상대 길은 좁게 */
(function (root) {
  'use strict';
  const R = root.BoardRules.hobak;
  function evaluate(st, me) {
    const a = R.rawMoves(st.p, me).length;
    const b = R.rawMoves(st.p, 1 - me).length;
    let s = (a - b) * 10;
    if (st.p[0] === me + 1) s += 6; else if (st.p[0]) s -= 6;
    if (b <= 1) s += 25;
    if (a <= 1) s -= 25;
    return s;
  }
  const AI = root.BoardAIKit.make({
    rules: R, evaluate,
    levels: {
      1: { depth: 1, random: 0.9, noise: 2 },
      2: { depth: 2, random: 0.45, noise: 0.8 },
      3: { depth: 4, ms: 400, noise: 0.15 },
      4: { depth: 7, ms: 900 },
      5: { depth: 12, ms: 1600 }
    }
  });
  root.BoardAI = root.BoardAI || {};
  root.BoardAI.hobak = { choose: AI.choose, evaluate };
})(typeof self !== 'undefined' ? self : this);
