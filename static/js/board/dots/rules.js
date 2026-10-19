/* 아리채 오락실 · 점 잇기 상자 규칙
   점 5×5 (상자 4×4). 차례대로 점 사이에 선을 하나씩 그어요.
   상자의 네 번째 선을 그으면 그 상자는 내 것 + 한 번 더! 상자를 많이 가진 사람이 승리
   선 번호: 가로선 0~19 (줄*4+칸), 세로선 20~39 (20+줄*5+칸) */
(function (root) {
  'use strict';

  const BW = 4; const BH = 4;            // 상자 가로·세로 개수
  const NH = (BH + 1) * BW;              // 가로선 20
  const NV = BH * (BW + 1);              // 세로선 20
  const NL = NH + NV;
  const hLine = (r, c) => r * BW + c;
  const vLine = (r, c) => NH + r * (BW + 1) + c;
  const BOX_LINES = [];
  for (let r = 0; r < BH; r++) for (let c = 0; c < BW; c++) BOX_LINES.push([hLine(r, c), hLine(r + 1, c), vLine(r, c), vLine(r, c + 1)]);
  const LINE_BOXES = Array.from({ length: NL }, () => []);
  BOX_LINES.forEach((ls, bi) => ls.forEach((l) => LINE_BOXES[l].push(bi)));

  function init() { return { l: new Array(NL).fill(-1), box: new Array(BW * BH).fill(-1), turn: 0, n: 0, last: -1, got: 0 }; }
  function moves(st) {
    if (st.n >= NL) return [];
    const out = [];
    for (let i = 0; i < NL; i++) if (st.l[i] < 0) out.push(i);
    return out;
  }
  function sides(l, bi) { let k = 0; for (const x of BOX_LINES[bi]) if (l[x] >= 0) k++; return k; }
  function play(st, i) {
    if (st.l[i] >= 0) return st;
    const l = st.l.slice();
    const box = st.box.slice();
    l[i] = st.turn;
    let got = 0;
    for (const bi of LINE_BOXES[i]) if (sides(l, bi) === 4) { box[bi] = st.turn; got++; }
    return { l, box, turn: got ? st.turn : 1 - st.turn, n: st.n + 1, last: i, got };
  }
  function score(st) { const s = [0, 0]; for (const v of st.box) if (v >= 0) s[v]++; return s; }
  function turn(st) { return st.turn; }
  function result(st) {
    if (st.n < NL) return null;
    const [a, b] = score(st);
    return { winner: a > b ? 0 : b > a ? 1 : -1, score: [a, b] };
  }
  root.BoardRules = root.BoardRules || {};
  root.BoardRules.dots = { BW, BH, NH, NV, NL, hLine, vLine, BOX_LINES, LINE_BOXES, init, moves, play, turn, result, score, sides };
})(typeof self !== 'undefined' ? self : this);
