/* 아리채 오락실 · 오델로 AI — 귀퉁이·둘 수 있는 곳의 수·자리 점수로 판단, 끝판은 끝까지 읽어요 */
(function (root) {
  'use strict';

  const R = root.BoardRules.othello;
  const N = R.N;
  // 자리 점수: 귀퉁이는 아주 좋고, 귀퉁이 옆(X·C 자리)은 위험해요
  const W = [
    120, -25, 20, 5, 5, 20, -25, 120,
    -25, -45, -5, -5, -5, -5, -45, -25,
    20, -5, 15, 3, 3, 15, -5, 20,
    5, -5, 3, 3, 3, 3, -5, 5,
    5, -5, 3, 3, 3, 3, -5, 5,
    20, -5, 15, 3, 3, 15, -5, 20,
    -25, -45, -5, -5, -5, -5, -45, -25,
    120, -25, 20, 5, 5, 20, -25, 120
  ];
  const CORNERS = [[0, 1, 8, 9], [7, 6, 15, 14], [56, 57, 48, 49], [63, 62, 55, 54]];

  function evaluate(st, me) {
    const b = st.b;
    const mc = me + 1; const oc = 2 - me;
    let empties = 0; let pos = 0; let mine = 0; let theirs = 0;
    for (let i = 0; i < 64; i++) {
      const v = b[i];
      if (!v) { empties++; continue; }
      if (v === mc) { mine++; pos += W[i]; } else { theirs++; pos -= W[i]; }
    }
    // 귀퉁이를 이미 가졌으면 그 옆자리는 더 이상 위험하지 않아요
    for (const [c, a, d, x] of CORNERS) {
      if (b[c]) {
        for (const j of [a, d, x]) {
          if (b[j] === mc) pos -= W[j]; else if (b[j] === oc) pos += W[j];
        }
      }
    }
    if (empties <= 12) return (mine - theirs) * 10 + pos * 0.3;
    const mm = R.movesFor(b, me).length;
    const om = R.movesFor(b, 1 - me).length;
    const mob = mm + om ? (100 * (mm - om)) / (mm + om + 2) : 0;
    return pos + mob * 1.2;
  }
  function order(st, moves) {
    return moves.slice().sort((a, b) => W[b] - W[a]);
  }

  const AI = root.BoardAIKit.make({
    rules: R, evaluate, order,
    levels: {
      1: { depth: 1, random: 0.45, noise: 1.2 },
      2: { depth: 1, noise: 0.4 },
      3: { depth: 3, ms: 500, noise: 0.08 },
      4: { depth: 5, ms: 900, noise: 0.02 },
      5: { depth: 9, ms: 1700 }
    }
  });
  function choose(history, level, opts) {
    // 끝판(빈칸 12개 이하)은 5단계가 끝까지 읽어요
    let st = R.init();
    for (const m of history) st = R.play(st, m);
    const empties = st.b.filter((v) => !v).length;
    const o = Object.assign({}, opts || {});
    if (level >= 5 && empties <= 12) o.cfg = { depth: empties + 2, ms: 2500 };
    return AI.choose(history, level, o);
  }

  root.BoardAI = root.BoardAI || {};
  root.BoardAI.othello = { choose, evaluate };
})(typeof self !== 'undefined' ? self : this);
