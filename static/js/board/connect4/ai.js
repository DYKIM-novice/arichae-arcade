/* 아리채 오락실 · 사목 AI — 4칸 창 점수 + 가운데 선호, 높은 단계는 깊게 읽어요 */
(function (root) {
  'use strict';

  const R = root.BoardRules.connect4;
  const W = R.W; const H = R.H;
  const WINS = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const ex = x + 3 * dx; const ey = y + 3 * dy;
      if (ex < 0 || ey < 0 || ex >= W || ey >= H) continue;
      WINS.push([0, 1, 2, 3].map((k) => (y + k * dy) * W + x + k * dx));
    }
  }
  const VAL = [0, 1, 8, 60];
  function evaluate(st, me) {
    const mc = me + 1;
    let s = 0;
    for (const w of WINS) {
      let a = 0; let o = 0;
      for (const i of w) { const v = st.b[i]; if (v === mc) a++; else if (v) o++; }
      if (a && !o) s += VAL[a]; else if (o && !a) s -= VAL[o] * 1.1;
    }
    for (let y = 0; y < H; y++) { const v = st.b[y * W + 3]; if (v === mc) s += 3; else if (v) s -= 3; }
    return s;
  }
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  function order(st, moves) { return ORDER.filter((x) => moves.includes(x)); }

  const AI = root.BoardAIKit.make({
    rules: R, evaluate, order,
    levels: {
      1: { depth: 1, random: 0.5, noise: 1.5 },
      2: { depth: 2, random: 0.12, noise: 0.7 },
      3: { depth: 5, ms: 450, noise: 0.05 },
      4: { depth: 8, ms: 900 },
      5: { depth: 12, ms: 1700 }
    }
  });
  root.BoardAI = root.BoardAI || {};
  root.BoardAI.connect4 = { choose: AI.choose, evaluate };
})(typeof self !== 'undefined' ? self : this);
