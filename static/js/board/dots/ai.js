/* 아리채 오락실 · 점 잇기 상자 AI
   1 병아리: 거의 아무 선이나 (가끔 상자를 챙겨요)
   2 토끼:   상자는 챙기지만 세 번째 선을 자주 그어 줘요
   3 여우:   상자 챙기기 + 세 번째 선 대부분 피하기
   4 호랑이: + 어쩔 수 없을 땐 가장 적게 내주는 선, 끝판(남은 선 11개 이하)은 끝까지 계산
   5 용:     + 끝판(남은 선 16개 이하)을 끝까지 계산해서 '일부러 두 칸 남기기' 같은 고수 기술도 써요 */
(function (root) {
  'use strict';
  const R = root.BoardRules.dots;

  function rnd(seed) { return root.BoardAIKit.rnd(seed); }
  // 이 선을 그으면 상자가 생기는지
  const completes = (st, i) => R.LINE_BOXES[i].some((b) => R.sides(st.l, b) === 3);
  // 이 선을 그으면 상대에게 세 번째 선을 만들어 주는지
  const givesThird = (st, i) => R.LINE_BOXES[i].some((b) => R.sides(st.l, b) === 2);
  // 이 선을 그은 뒤 상대가 연달아 가져갈 수 있는 상자 수 (욕심쟁이로 계속 먹는다고 보고)
  function giveaway(st, i) {
    let s = R.play(st, i);
    const opp = s.turn;
    let n = 0;
    while (s.turn === opp && s.n < R.NL) {
      const take = R.moves(s).find((m) => completes(s, m));
      if (take == null) break;
      s = R.play(s, take);
      n += s.got;
    }
    return n;
  }

  // 끝판 완전 계산 (남은 선이 적을 때) — 내 상자 수 - 상대 상자 수 (남은 것 기준)
  function solve(st, me, memo) {
    if (st.n >= R.NL) return 0;
    const key = st.l.map((v) => (v >= 0 ? 1 : 0)).join('') + st.turn;
    if (memo.has(key)) return st.turn === me ? memo.get(key) : -memo.get(key);
    // 차례인 사람 기준 최선
    let best = -Infinity;
    const ms = R.moves(st);
    // 상자를 만드는 수가 있으면 그것들 먼저 (그래도 전부 따져요)
    ms.sort((a, b) => (completes(st, b) ? 1 : 0) - (completes(st, a) ? 1 : 0));
    for (const m of ms) {
      const nx = R.play(st, m);
      const gain = nx.got;
      const rest = solve(nx, nx.turn, memo);   // 다음 차례 사람 기준 값
      const v = gain + (nx.turn === st.turn ? rest : -rest);
      if (v > best) best = v;
    }
    memo.set(key, best);
    return st.turn === me ? best : -best;
  }
  function solveMove(st) {
    const memo = new Map();
    let best = null; let bv = -Infinity;
    for (const m of R.moves(st)) {
      const nx = R.play(st, m);
      const rest = solve(nx, nx.turn, memo);
      const v = nx.got + (nx.turn === st.turn ? rest : -rest);
      if (v > bv) { bv = v; best = m; }
    }
    return best;
  }

  function choose(history, level, opts) {
    let st = R.init();
    for (const m of history) st = R.play(st, m);
    const rand = rnd((opts && opts.seed) || (Date.now() ^ history.length * 131));
    const ms = R.moves(st);
    if (!ms.length) return null;
    const left = ms.length;
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const takes = ms.filter((m) => completes(st, m));
    const safe = ms.filter((m) => !completes(st, m) && !givesThird(st, m));
    if (level === 1) {
      if (takes.length && rand() < 0.6) return pick(takes);
      return pick(ms);
    }
    if (level === 2) {
      if (takes.length) return pick(takes);
      if (safe.length && rand() < 0.3) return pick(safe);
      return pick(ms);
    }
    if (level === 3) {
      // 여우: 상자는 챙기고 세 번째 선도 대부분 피하지만, 내줄 때는 아무렇게나
      if (takes.length) return pick(takes);
      if (safe.length && rand() < 0.88) return pick(safe);
      return pick(ms);
    }
    const exact = level >= 5 ? 16 : level >= 4 ? 11 : 0;
    if (exact && left <= exact) return solveMove(st);
    if (takes.length) return pick(takes);
    if (safe.length) return pick(safe);
    // 어쩔 수 없을 때: 가장 적게 내주는 선
    let best = ms[0]; let bv = Infinity;
    for (const m of ms) { const g = giveaway(st, m) + rand() * 0.1; if (g < bv) { bv = g; best = m; } }
    return best;
  }
  root.BoardAI = root.BoardAI || {};
  root.BoardAI.dots = { choose };
})(typeof self !== 'undefined' ? self : this);
