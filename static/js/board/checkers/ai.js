/* 아리채 오락실 · 체커 AI — 말 수(왕은 더 비싸게) + 앞으로 나아간 정도 + 뒷줄 지키기 */
(function (root) {
  'use strict';
  const R = root.BoardRules.checkers;
  function evaluate(st, me) {
    let s = 0;
    const b = st.b;
    let mine = 0; let theirs = 0;
    for (let i = 0; i < 64; i++) {
      const v = b[i];
      if (!v) continue;
      const r = (i / 8) | 0; const c = i % 8;
      const seat = v <= 2 ? 0 : 1;
      let val = R.isKing(v) ? 170 : 100;
      if (!R.isKing(v)) val += (seat === 0 ? 7 - r : r) * 4;          // 앞으로 나아갈수록
      if (!R.isKing(v) && ((seat === 0 && r === 7) || (seat === 1 && r === 0))) val += 12; // 뒷줄 지키기
      if (c >= 2 && c <= 5 && r >= 2 && r <= 5) val += 6;               // 가운데
      if (seat === me) { s += val; mine++; } else { s -= val; theirs++; }
    }
    // 이기고 있으면 말을 바꾸는 게 좋아요 (남은 말이 적을수록 차이가 커 보이게)
    if (mine !== theirs) s += (mine - theirs) * (24 - mine - theirs) * 2;
    return s;
  }
  function order(st, moves) { return moves.slice().sort((a, b) => b.length - a.length); }
  const AI = root.BoardAIKit.make({
    rules: R, evaluate, order,
    levels: {
      1: { depth: 1, random: 0.5, noise: 1.5 },
      2: { depth: 2, random: 0.1, noise: 0.5 },
      3: { depth: 4, ms: 450, noise: 0.08 },
      4: { depth: 7, ms: 900 },
      5: { depth: 12, ms: 1700 }
    }
  });
  root.BoardAI = root.BoardAI || {};
  root.BoardAI.checkers = { choose: AI.choose, evaluate };
})(typeof self !== 'undefined' ? self : this);
