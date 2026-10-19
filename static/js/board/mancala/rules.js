/* 아리채 오락실 · 만칼라(칼라) 규칙
   구멍 6개씩, 구멍마다 구슬 4개. 내 구멍 하나를 골라 구슬을 한 개씩 다음 구멍들에 나눠 넣어요(상대 창고는 건너뜀).
   - 마지막 구슬이 내 창고에 들어가면 한 번 더!
   - 마지막 구슬이 내 쪽 빈 구멍에 들어가고 맞은편에 구슬이 있으면 둘 다 내 창고로 (잡기)
   - 한쪽 구멍이 모두 비면 끝, 남은 구슬은 각자 창고로. 창고에 구슬이 많은 쪽이 승리
   칸 번호: 0~5 = 자리0 구멍, 6 = 자리0 창고, 7~12 = 자리1 구멍, 13 = 자리1 창고 */
(function (root) {
  'use strict';

  const SEEDS = 4;
  function init() {
    const p = new Array(14).fill(SEEDS);
    p[6] = 0; p[13] = 0;
    return { p, turn: 0, over: false, last: -1, path: [], cap: -1, again: false };
  }
  const store = (seat) => (seat === 0 ? 6 : 13);
  const pitsOf = (seat) => (seat === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
  function moves(st) {
    if (st.over) return [];
    return pitsOf(st.turn).filter((i) => st.p[i] > 0);
  }
  function play(st, i) {
    const me = st.turn;
    if (st.over || !pitsOf(me).includes(i) || !st.p[i]) return st;
    const p = st.p.slice();
    let n = p[i];
    p[i] = 0;
    let k = i;
    const path = [];
    const skip = store(1 - me);
    while (n > 0) {
      k = (k + 1) % 14;
      if (k === skip) continue;
      p[k]++; n--; path.push(k);
    }
    let cap = -1;
    if (pitsOf(me).includes(k) && p[k] === 1 && p[12 - k] > 0) {
      cap = 12 - k;
      p[store(me)] += p[12 - k] + 1;
      p[12 - k] = 0; p[k] = 0;
    }
    let turn = k === store(me) ? me : 1 - me;
    const again = k === store(me);
    let over = false;
    const empty0 = pitsOf(0).every((j) => !p[j]);
    const empty1 = pitsOf(1).every((j) => !p[j]);
    if (empty0 || empty1) {
      for (const j of pitsOf(0)) { p[6] += p[j]; p[j] = 0; }
      for (const j of pitsOf(1)) { p[13] += p[j]; p[j] = 0; }
      over = true;
    }
    return { p, turn, over, last: i, path, cap, again };
  }
  function turn(st) { return st.turn; }
  function result(st) {
    if (!st.over) return null;
    const a = st.p[6]; const b = st.p[13];
    return { winner: a > b ? 0 : b > a ? 1 : -1, score: [a, b] };
  }
  root.BoardRules = root.BoardRules || {};
  root.BoardRules.mancala = { init, moves, play, turn, result, store, pitsOf };
})(typeof self !== 'undefined' ? self : this);
