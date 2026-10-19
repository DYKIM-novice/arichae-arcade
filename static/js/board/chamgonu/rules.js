/* 아리채 오락실 · 참고누(곤질고누·열두밭고누) 규칙 (지역마다 조금씩 달라요 — 우리 집 규칙)
   말판: 크기가 다른 네모 3개 + 가운데·대각선 연결 → 점 24개, 줄(3점 일렬) 20개
   말 12개씩.
   1) 놓기: 번갈아 빈 점에 하나씩 놓아요. 가로·세로·대각선으로 3개를 이으면 '꼰!' → 상대 말 1개를 잡고
      그 자리에는 말뚝을 박아 놓기가 끝날 때까지 아무도 못 놓아요.
   2) 옮기기: 다 놓으면 말뚝을 빼고, 줄을 따라 빈 점으로 한 칸씩. 새로 3개를 이으면 상대 말 1개 잡기.
   상대 말이 2개만 남거나, 상대가 움직일 수 없으면 승리. 잡지 못하고 100수가 지나면 무승부
   수: {t: 놓을/갈 점, f: 옮기는 말의 점(옮기기 때), x: 잡을 상대 말의 점(꼰 했을 때)} */
(function (root) {
  'use strict';

  const SQ = [[0, 0], [3, 0], [6, 0], [6, 3], [6, 6], [3, 6], [0, 6], [0, 3]];
  const POINTS = [];
  [0, 1, 2].forEach((s) => SQ.forEach(([x, y]) => {
    POINTS.push([s + (x / 6) * (6 - 2 * s), s + (y / 6) * (6 - 2 * s)]);
  }));
  const LINES = [];
  for (let s = 0; s < 3; s++) {
    const o = s * 8;
    LINES.push([o, o + 1, o + 2], [o + 2, o + 3, o + 4], [o + 4, o + 5, o + 6], [o + 6, o + 7, o]);
  }
  LINES.push([1, 9, 17], [3, 11, 19], [5, 13, 21], [7, 15, 23]);   // 가운데 잇는 줄
  LINES.push([0, 8, 16], [2, 10, 18], [4, 12, 20], [6, 14, 22]);   // 대각선
  const ADJ = Array.from({ length: 24 }, () => []);
  LINES.forEach(([a, b, c]) => {
    [[a, b], [b, c]].forEach(([u, v]) => { if (!ADJ[u].includes(v)) { ADJ[u].push(v); ADJ[v].push(u); } });
  });
  const LINES_AT = Array.from({ length: 24 }, (_, i) => LINES.filter((l) => l.includes(i)));
  const STONES = 12;
  const QUIET_LIMIT = 100;

  function init() {
    return { p: new Array(24).fill(0), peg: [], turn: 0, placed: [0, 0], phase: 'place', quiet: 0, last: null, caps: [0, 0] };
  }
  function makesMill(p, i, c) {
    return LINES_AT[i].some((l) => l.every((j) => p[j] === c));
  }
  function count(p, seat) { let n = 0; for (const v of p) if (v === seat + 1) n++; return n; }
  function withCaptures(p, base, seat, t, out) {
    const c = seat + 1;
    if (makesMill(p, t, c)) {
      const opp = [];
      for (let j = 0; j < 24; j++) if (p[j] === 2 - seat) opp.push(j);
      if (opp.length) { opp.forEach((x) => out.push(Object.assign({}, base, { x }))); return; }
    }
    out.push(base);
  }
  function moves(st) {
    if (result(st)) return [];
    const seat = st.turn;
    const out = [];
    if (st.phase === 'place') {
      for (let t = 0; t < 24; t++) {
        if (st.p[t] || st.peg.includes(t)) continue;
        const p = st.p.slice(); p[t] = seat + 1;
        withCaptures(p, { t }, seat, t, out);
      }
    } else {
      for (let f = 0; f < 24; f++) {
        if (st.p[f] !== seat + 1) continue;
        for (const t of ADJ[f]) {
          if (st.p[t]) continue;
          const p = st.p.slice(); p[t] = p[f]; p[f] = 0;
          withCaptures(p, { f, t }, seat, t, out);
        }
      }
    }
    return out;
  }
  function play(st, m) {
    const p = st.p.slice();
    const seat = st.turn;
    let peg = st.peg.slice();
    const placed = st.placed.slice();
    const caps = st.caps.slice();
    if (m.f != null) { p[m.t] = p[m.f]; p[m.f] = 0; } else { p[m.t] = seat + 1; placed[seat]++; }
    if (m.x != null) {
      p[m.x] = 0;
      caps[seat]++;
      if (st.phase === 'place') peg.push(m.x);
    }
    let phase = st.phase;
    let turn = 1 - seat;
    if (phase === 'place') {
      const free = p.some((v, j) => !v && !peg.includes(j));
      if ((placed[0] >= STONES && placed[1] >= STONES) || !free) { phase = 'move'; peg = []; turn = 0; }
      else if (placed[turn] >= STONES) turn = seat;   // 상대가 다 놓았으면 계속 내가
    }
    const quiet = phase === 'move' && st.phase === 'move' ? (m.x != null ? 0 : st.quiet + 1) : 0;
    return { p, peg, turn, placed, phase, quiet, last: m, caps };
  }
  function turn(st) { return st.turn; }
  function hasMove(st, seat) {
    for (let f = 0; f < 24; f++) if (st.p[f] === seat + 1) for (const t of ADJ[f]) if (!st.p[t]) return true;
    return false;
  }
  function result(st) {
    if (st.phase === 'move') {
      for (const s of [0, 1]) if (count(st.p, s) <= 2) return { winner: 1 - s };
      if (!hasMove(st, st.turn)) {
        if (!hasMove(st, 1 - st.turn)) return { winner: -1 };
        return { winner: 1 - st.turn };
      }
      if (st.quiet >= QUIET_LIMIT) return { winner: -1 };
    }
    return null;
  }
  root.BoardRules = root.BoardRules || {};
  root.BoardRules.chamgonu = { POINTS, LINES, ADJ, init, moves, play, turn, result, count, makesMill };
})(typeof self !== 'undefined' ? self : this);
