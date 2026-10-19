/* 아리채 오락실 · 만칼라 AI — 창고 차이 + 내 쪽 구슬, 한 번 더 두기도 계산해요 */
(function (root) {
  'use strict';
  const R = root.BoardRules.mancala;
  function evaluate(st, me) {
    const ms = R.store(me); const os = R.store(1 - me);
    let side = 0;
    for (const j of R.pitsOf(me)) side += st.p[j];
    for (const j of R.pitsOf(1 - me)) side -= st.p[j];
    return (st.p[ms] - st.p[os]) * 10 + side * 2;
  }
  function order(st, moves) {
    const me = st.turn;
    // 한 번 더 둘 수 있는 수 먼저
    return moves.slice().sort((a, b) => {
      const ea = (a + st.p[a]) % 13 === R.store(me) % 13 ? 1 : 0;
      const eb = (b + st.p[b]) % 13 === R.store(me) % 13 ? 1 : 0;
      return eb - ea;
    });
  }
  const AI = root.BoardAIKit.make({
    rules: R, evaluate, order,
    levels: {
      1: { depth: 1, random: 0.5, noise: 1.5 },
      2: { depth: 2, random: 0.1, noise: 0.6 },
      3: { depth: 4, ms: 400, noise: 0.08 },
      4: { depth: 7, ms: 900 },
      5: { depth: 12, ms: 1700 }
    }
  });
  root.BoardAI = root.BoardAI || {};
  root.BoardAI.mancala = { choose: AI.choose, evaluate };
})(typeof self !== 'undefined' ? self : this);
