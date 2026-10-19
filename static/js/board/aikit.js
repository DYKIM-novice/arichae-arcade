/* 아리채 오락실 · 보드게임 AI 공통 (워커에서 돌아요)
   규칙(rules)이 init / moves / play / turn / result 를 주면, 알파베타(몇 수 앞 읽기)로 수를 골라요.
   차례가 번갈아 오지 않는 게임(만칼라·점 잇기처럼 한 번 더 두기)도 되게 '내 차례면 최대, 아니면 최소' 방식이에요.

   단계 설정 예: { depth: 4, ms: 800, noise: 0.1, random: 0.05 }
     depth  몇 수 앞까지 읽을지 (시간이 남으면 더 깊게)
     ms     생각 시간 한도
     noise  점수에 섞는 흔들림 (클수록 실수)
     random 아무 수나 둘 확률 */
(function (root) {
  'use strict';

  const WIN = 1e9;

  function rnd(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function make(spec) {
    const R = spec.rules;
    const evaluate = spec.evaluate;        // (st, me) → 점수 (me 에게 좋을수록 큼)
    const order = spec.order || null;      // (st, moves) → 정렬된 moves (좋아 보이는 수 먼저)
    const LV = spec.levels;

    function search(st, depth, alpha, beta, me, ctx, ply) {
      ctx.nodes++;
      if (ctx.deadline && (ctx.nodes & 127) === 0 && Date.now() > ctx.deadline) { ctx.timeout = true; return 0; }
      const res = R.result(st);
      if (res) {
        if (res.winner === me) return WIN - ply;
        if (res.winner < 0) return 0;
        return -WIN + ply;
      }
      if (depth <= 0) return evaluate(st, me);
      let moves = R.moves(st);
      if (!moves.length) return evaluate(st, me);
      if (order) moves = order(st, moves, ply);
      if (ctx.maxBranch && moves.length > ctx.maxBranch) moves = moves.slice(0, ctx.maxBranch);
      const maxing = R.turn(st) === me;
      let best = maxing ? -Infinity : Infinity;
      for (const m of moves) {
        const nx = R.play(st, m);
        const sc = search(nx, depth - 1, alpha, beta, me, ctx, ply + 1);
        if (ctx.timeout) return 0;
        if (maxing) {
          if (sc > best) best = sc;
          if (best > alpha) alpha = best;
        } else {
          if (sc < best) best = sc;
          if (best < beta) beta = best;
        }
        if (alpha >= beta) break;
      }
      return best;
    }

    // 루트: 수마다 점수를 매겨요 (반복 깊이)
    function scoreMoves(st, cfg, me) {
      let moves = R.moves(st);
      if (order) moves = order(st, moves, 0);
      const deadline = cfg.ms ? Date.now() + cfg.ms : 0;
      let scored = moves.map((m) => ({ m, s: 0 }));
      for (let d = 1; d <= (cfg.depth || 1); d++) {
        const ctx = { deadline, timeout: false, nodes: 0, maxBranch: cfg.maxBranch || 0 };
        const out = [];
        let alpha = -Infinity;
        for (const { m } of scored) {
          const nx = R.play(st, m);
          // 동점 수들도 점수를 제대로 매기도록 알파를 살짝 낮춰서 찾아요
          const sc = search(nx, d - 1, alpha === -Infinity ? -Infinity : alpha - 1, Infinity, me, ctx, 1);
          if (ctx.timeout) break;
          out.push({ m, s: sc });
          if (sc > alpha) alpha = sc;
        }
        if (ctx.timeout && out.length < scored.length) break;
        out.sort((a, b) => b.s - a.s);
        scored = out;
        if (scored[0].s >= WIN - 1000) break;   // 이기는 길을 찾았어요
        if (deadline && Date.now() > deadline - cfg.ms * 0.4) break;
      }
      return scored;
    }

    function choose(history, level, opts) {
      const o = opts || {};
      const rand = rnd(o.seed || (Date.now() ^ (history.length * 7919)));
      const cfg = Object.assign({}, LV[level] || LV[3], o.cfg || {});
      if (o.ms) cfg.ms = o.ms;
      let st = R.init(o.init || {});
      for (const m of history) st = R.play(st, m);
      const me = R.turn(st);
      const moves = R.moves(st);
      if (!moves.length) return null;
      if (moves.length === 1) return moves[0];
      if (cfg.random && rand() < cfg.random) return moves[Math.floor(rand() * moves.length)];
      const scored = scoreMoves(st, cfg, me);
      if (!scored.length) return moves[0];
      // 이기는 수는 꼭 / 지는 수는 피하기 (흔들림은 그 다음)
      if (scored[0].s >= WIN - 1000) return scored[0].m;
      const spread = Math.max(1, Math.abs(scored[0].s) * 0.15, cfg.noiseAbs || 0);
      let best = scored[0]; let bv = -Infinity;
      for (const x of scored) {
        if (x.s <= -WIN + 1000 && scored[0].s > -WIN + 1000) continue;
        const v = x.s + (cfg.noise ? (rand() * 2 - 1) * cfg.noise * spread * 4 : 0);
        if (v > bv) { bv = v; best = x; }
      }
      return best.m;
    }

    return { choose, scoreMoves, search };
  }

  root.BoardAIKit = { make, rnd, WIN };
})(typeof self !== 'undefined' ? self : this);
