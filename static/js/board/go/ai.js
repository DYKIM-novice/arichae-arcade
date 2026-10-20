/* 아리채 오락실 · 바둑 AI (워커에서 돌아요) — 몬테카를로 나무 탐색(MCTS) + RAVE
   수마다 끝까지 수천 번 대신 둬 보고(빠른 바둑판), 많이 이긴 수를 골라요.
   - 처음 보는 수에는 '경험 점수'를 미리 줘요: 단수 잡기·살리기 ↑, 자충·1선 ↓, 상대 마지막 수 근처 ↑
   - 빈 곳이 모두 누구 땅인지 정해졌으면(또는 상대가 패스했고 내가 이기고 있으면) 패스해요 */
(function (root) {
  'use strict';

  function makeAI(R) {
    const N = R.N;
    const fb = R.FastBoard(N);       // 지금 판
    const work = R.FastBoard(N);     // 시뮬레이션용
    const SZ = fb.SZ; const S = fb.S;
    const amaf = new Int8Array(SZ);
    const own = new Float64Array(SZ);
    const RAVE_K = N === 9 ? 1200 : 2000;

    function load(st) {
      fb.clear();
      for (let i = 0; i < N * N; i++) if (st.b[i]) fb.play(fb.toPad(i), st.b[i]);
      const last = st.last != null && st.last >= 0 ? fb.toPad(st.last) : 0;
      fb.setState({ ko: st.ko >= 0 ? fb.toPad(st.ko) : 0, toPlay: st.turn + 1, passes: 0, moves: 0, lastMove: last });
    }

    function dist1(p) { const r = ((p / S) | 0) - 1; const c = (p % S) - 1; return Math.min(r, c, N - 1 - r, N - 1 - c); }
    // 처음 보는 수의 경험 점수 [가상 판 수, 가상 승 수]
    function prior(B, p, c, stones) {
      let pn = 10; let pw = 5;
      const o = 3 - c;
      for (let k = 0; k < 4; k++) {
        const q = p + B.DIRS[k]; const cq = B.color[q];
        if (cq === o && B.inAtari(B.head[q])) { pn += 12; pw += 12 + Math.min(10, B.size[B.head[q]] * 2); }
        if (cq === c && B.inAtari(B.head[q])) {
          let libs = 0; for (let j = 0; j < 4; j++) if (B.color[p + B.DIRS[j]] === 0) libs++;
          if (libs >= 2) { pn += 10; pw += 9; }
        }
      }
      if (B.selfAtariBig(p, c)) { pn += 15; pw += 0; }
      const d = dist1(p);
      const early = stones < N * N * 0.4;
      if (d === 0) { pn += early ? 12 : 4; pw += early ? 1 : 1; } else if (d === 1 && early && N > 9) { pn += 4; pw += 1; } else if ((d === 2 || d === 3) && early) { pn += 6; pw += 5; }
      const lm = B.lastMove;
      if (lm) {
        const dr = Math.abs(((p / S) | 0) - ((lm / S) | 0)); const dc = Math.abs((p % S) - (lm % S));
        if (dr <= 1 && dc <= 1) { pn += 5; pw += 4; } else if (dr + dc <= 3) { pn += 2; pw += 1.5; }
      }
      return [pn, pw];
    }
    function stoneCount(B) { return N * N - B.ne; }

    function newNode(move, c, pr) { return { move, c, n: 0, w: 0, rn: pr ? pr[0] : 0, rw: pr ? pr[1] : 0, kids: null }; }
    function expand(node, B, color) {
      const kids = [];
      const stones = stoneCount(B);
      for (let k = 0; k < B.ne; k++) {
        const p = B.empties[k];
        if (B.legal(p, color) && !B.eyeish(p, color)) kids.push(newNode(p, color, prior(B, p, color, stones)));
      }
      if (!kids.length) kids.push(newNode(0, color, [10, 5]));
      node.kids = kids;
    }
    function select(node) {
      let best = null; let bv = -1;
      const lnN = Math.log(node.n + 1);
      for (const ch of node.kids) {
        const beta = Math.sqrt(RAVE_K / (3 * ch.n + RAVE_K));
        const q = ch.n ? ch.w / ch.n : 0.5;
        const rv = ch.rn ? ch.rw / ch.rn : 0.5;
        const v = (1 - beta) * q + beta * rv + 0.15 * Math.sqrt(lnN / (ch.n + 1));
        if (v > bv) { bv = v; best = ch; }
      }
      return best;
    }

    function simulate(rootNode, rand) {
      work.copyFrom(fb);
      amaf.fill(0);
      const path = [rootNode];
      let node = rootNode; let color = fb.toPlay;
      while (node.kids) {
        const ch = select(node);
        if (ch.move && !amaf[ch.move]) amaf[ch.move] = color;
        work.play(ch.move, color);
        path.push(ch); node = ch; color = 3 - color;
        if (work.passes >= 2) break;
      }
      if (work.passes < 2 && node.n >= 1 && !node.kids) {
        expand(node, work, color);
        const ch = select(node);
        if (ch.move && !amaf[ch.move]) amaf[ch.move] = color;
        work.play(ch.move, color);
        path.push(ch);
      }
      const sc = work.playout(rand, amaf, work.moves + N * N * 2);
      const blackWin = sc > 0 ? 1 : 0;
      // 땅 주인 모으기
      for (const p of work.pts) {
        const cp = work.color[p];
        if (cp === 1) own[p]++; else if (cp === 2) own[p]--;
        else { let b = 0; let w = 0; for (let k = 0; k < 4; k++) { const q = work.color[p + work.DIRS[k]]; if (q === 1) b++; else if (q === 2) w++; } if (b && !w) own[p]++; else if (w && !b) own[p]--; }
      }
      for (let k = 0; k < path.length; k++) {
        const nd = path[k];
        nd.n++;
        if (k > 0) nd.w += nd.c === 1 ? blackWin : 1 - blackWin;
        if (nd.kids) for (const ch of nd.kids) if (ch.move && amaf[ch.move] === ch.c) { ch.rn++; ch.rw += ch.c === 1 ? blackWin : 1 - blackWin; }
      }
    }

    const LV = N === 9 ? {
      1: { sims: 150, temp: 1.0, top: 8 },
      2: { sims: 700, temp: 0.5, top: 4 },
      3: { sims: 2500 },
      4: { ms: 1500 },
      5: { ms: 3000 }
    } : {
      1: { sims: 150, temp: 1.0, top: 8 },
      2: { sims: 700, temp: 0.5, top: 4 },
      3: { sims: 2500 },
      4: { ms: 2000 },
      5: { ms: 3500 }
    };

    function choose(history, level, opts) {
      const o = opts || {};
      const cfg = Object.assign({}, LV[level] || LV[3]);
      if (o.ms) { cfg.ms = o.ms; delete cfg.sims; }
      const rand = R.rng(o.seed || (Date.now() ^ (history.length * 7919)));
      let st = R.init();
      for (const m of history) st = R.play(st, m);
      if (R.result(st)) return -1;
      load(st);
      const me = st.turn + 1;
      // 둘 곳이 없으면 패스
      let any = false;
      for (let k = 0; k < fb.ne && !any; k++) { const p = fb.empties[k]; if (fb.legal(p, me) && !fb.eyeish(p, me)) any = true; }
      if (!any) return -1;
      // 상대가 패스했고 지금 끝내도 내가 이기면 패스
      if (st.passes === 1 && st.n > N * 2) {
        const sc = R.score(st);
        if ((me === 1 && sc.black > sc.white) || (me === 2 && sc.white > sc.black)) return -1;
      }
      own.fill(0);
      const rootNode = newNode(0, 3 - me, null);
      expand(rootNode, fb, me);
      const t0 = Date.now();
      let sims = 0;
      const maxSims = cfg.sims || 1e9; const deadline = cfg.ms ? t0 + cfg.ms : Infinity;
      while (sims < maxSims) {
        simulate(rootNode, rand);
        sims++;
        if ((sims & 31) === 0 && Date.now() > deadline) break;
      }
      const kids = rootNode.kids.slice().sort((a, b) => b.n - a.n);
      const best = kids[0];
      if (best.move === 0) return -1;
      // 빈 곳이 모두 정해졌으면 패스 (더 둘 곳이 없어요)
      if (sims >= 300 && st.n > N * 3) {
        let open = 0;
        for (const p of fb.pts) if (!fb.color[p] && Math.abs(own[p] / sims) < 0.75) open++;
        const wr = best.n ? best.w / best.n : 0.5;
        if (open === 0 || (st.passes === 1 && open <= 1)) return -1;
        if (wr < 0.03 && st.passes === 1) return -1;   // 상대가 끝냈고 뒤집을 수 없으면 그만
      }
      // 낮은 단계: 위쪽 몇 수 가운데 골고루
      if (cfg.temp) {
        const top = kids.slice(0, cfg.top).filter((k) => k.n > 0);
        const ws = top.map((k) => Math.pow(k.n, 1 / cfg.temp));
        let x = rand() * ws.reduce((a, b) => a + b, 0);
        for (let k = 0; k < top.length; k++) { x -= ws[k]; if (x <= 0) return fb.toIdx(top[k].move); }
      }
      choose.lastSims = sims;
      return fb.toIdx(best.move);
    }
    return { choose };
  }

  root.BoardAI = root.BoardAI || {};
  root.BoardAI.go9 = makeAI(root.BoardRules.go9);
  root.BoardAI.go13 = makeAI(root.BoardRules.go13);
})(typeof self !== 'undefined' ? self : this);
