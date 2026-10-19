/* 아리채 오락실 · 오목 AI (워커에서 돌아요 — 화면이 멈추지 않게)
   1 병아리: 아무 데나 두다가 가끔 막아요
   2 토끼:   이기는 수·막는 수는 알지만 실수가 많아요
   3 여우:   공격·수비 점수로 가장 좋은 자리를 골라요 + 짧은 연속 4 공격
   4 호랑이: 몇 수 앞을 읽고(알파베타), 상대의 연속 4 공격도 막아요
   5 용:     더 깊이 읽고(제한 시간 안에서 점점 깊게), 긴 연속 4 공격(VCF)을 찾아요 */
(function (root) {
  'use strict';

  const R = root.BoardRules.omok;
  const N = R.N;
  const NN = N * N;
  const BLACK = 1;
  const WHITE = 2;
  const WIN = 10000000;

  // ---------- 5칸 창(window) 목록 ----------
  const WINS = [];
  const CELL_WINS = Array.from({ length: NN }, () => []);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    for (const [dx, dy] of R.DIRS) {
      const ex = x + 4 * dx; const ey = y + 4 * dy;
      if (!R.inb(ex, ey)) continue;
      const w = [];
      for (let k = 0; k < 5; k++) w.push((y + k * dy) * N + (x + k * dx));
      const id = WINS.length;
      WINS.push(w);
      w.forEach((i) => CELL_WINS[i].push(id));
    }
  }
  const NW = WINS.length;
  const VAL = [0, 2, 24, 300, 5000, 200000];
  function V(own, opp) { return opp > 0 ? 0 : VAL[own]; }

  // 거리 2 이내 이웃
  const NEAR = Array.from({ length: NN }, (_, i) => {
    const x = i % N; const y = (i / N) | 0; const out = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if ((dx || dy) && R.inb(x + dx, y + dy)) out.push((y + dy) * N + x + dx);
    }
    return out;
  });

  function Engine(moves) {
    this.cells = new Int8Array(NN);
    this.cnt = [null, new Int8Array(NW), new Int8Array(NW)];
    this.tot = [0, 0, 0];
    this.nb = new Int16Array(NN);
    this.stones = 0;
    this.nodes = 0;
    let c = BLACK;
    for (const m of moves) { this.place(m, c); c = 3 - c; }
    this.turn = c;
  }
  Engine.prototype.place = function (i, c) {
    const o = 3 - c;
    const cc = this.cnt[c]; const co = this.cnt[o];
    for (const w of CELL_WINS[i]) {
      this.tot[c] -= V(cc[w], co[w]);
      this.tot[o] -= V(co[w], cc[w]);
      cc[w]++;
      this.tot[c] += V(cc[w], co[w]);
      this.tot[o] += V(co[w], cc[w]);
    }
    this.cells[i] = c;
    for (const j of NEAR[i]) this.nb[j]++;
    this.stones++;
  };
  Engine.prototype.unplace = function (i, c) {
    const o = 3 - c;
    const cc = this.cnt[c]; const co = this.cnt[o];
    for (const w of CELL_WINS[i]) {
      this.tot[c] -= V(cc[w], co[w]);
      this.tot[o] -= V(co[w], cc[w]);
      cc[w]--;
      this.tot[c] += V(cc[w], co[w]);
      this.tot[o] += V(co[w], cc[w]);
    }
    this.cells[i] = 0;
    for (const j of NEAR[i]) this.nb[j]--;
    this.stones--;
  };
  Engine.prototype.isFive = function (i, c) {
    // i 에 c 가 놓여 있다고 보고
    const x = i % N; const y = (i / N) | 0;
    return R.isFiveAt(this.cells, x, y, c);
  };
  // c 가 두면 정확히 5가 되는 빈칸들
  Engine.prototype.fivePoints = function (c) {
    const out = [];
    const cc = this.cnt[c]; const co = this.cnt[3 - c];
    for (let w = 0; w < NW; w++) {
      if (cc[w] !== 4 || co[w] !== 0) continue;
      for (const i of WINS[w]) {
        if (this.cells[i] === 0 && out.indexOf(i) < 0) {
          this.cells[i] = c;
          const ok = this.isFive(i, c);
          this.cells[i] = 0;
          if (ok) out.push(i);
        }
      }
    }
    return out;
  };
  Engine.prototype.forbidden = function (i, c) {
    return !!R.forbiddenReason(this.cells, i, c);
  };
  // 빠른 자리 점수: 공격(내가 두면 늘어나는 점수) + 수비(상대 줄을 끊는 점수)
  Engine.prototype.quick = function (i, c, defW) {
    const o = 3 - c;
    const cc = this.cnt[c]; const co = this.cnt[o];
    let att = 0; let def = 0;
    for (const w of CELL_WINS[i]) {
      att += V(cc[w] + 1, co[w]) - V(cc[w], co[w]);
      def += V(co[w], cc[w]);
    }
    return att + def * (defW == null ? 1 : defW);
  };
  Engine.prototype.candidates = function (c, defW) {
    const out = [];
    for (let i = 0; i < NN; i++) {
      if (this.cells[i] === 0 && this.nb[i] > 0) out.push([i, this.quick(i, c, defW)]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return out;
  };
  // 금수가 아닌 상위 k 개
  Engine.prototype.topMoves = function (c, k, defW) {
    const all = this.candidates(c, defW);
    const out = [];
    for (const [i, s] of all) {
      if (this.forbidden(i, c)) continue;
      out.push([i, s]);
      if (out.length >= k) break;
    }
    return out;
  };
  Engine.prototype.evaluate = function (c) {
    return this.tot[c] * 1.15 - this.tot[3 - c];
  };

  // c 가 두면 '막을 수 없는 4'(열린 4 또는 4·4)가 되는 자리 — 즉 상대 입장에서 지금 꼭 막아야 할 열린 3
  Engine.prototype.winThreatPoints = function (c) {
    const out = [];
    const seen = new Set();
    const cc = this.cnt[c]; const co = this.cnt[3 - c];
    for (let w = 0; w < NW; w++) {
      if (cc[w] !== 3 || co[w] !== 0) continue;
      for (const m of WINS[w]) {
        if (this.cells[m] !== 0 || seen.has(m)) continue;
        seen.add(m);
        if (this.forbidden(m, c)) continue;
        this.place(m, c);
        const n = this.fivePoints(c).length;
        this.unplace(m, c);
        if (n >= 2) out.push(m);
      }
    }
    return out;
  };
  // 상대의 열린 3(막을 수 없는 4가 되는 자리)을 가장 잘 막는 수
  Engine.prototype.blockThreat = function (c, threats) {
    const o = 3 - c;
    const cand = new Set(threats);
    // 열린 3의 양 끝도 막는 자리가 될 수 있어요
    for (const t of threats) for (const j of NEAR[t]) if (this.cells[j] === 0) cand.add(j);
    let best = -1; let bestKey = null;
    for (const m of cand) {
      if (this.forbidden(m, c)) continue;
      this.place(m, c);
      const left = this.winThreatPoints(o).length;
      const q = this.quick(m, c, 1);
      this.unplace(m, c);
      const key = [left, -q];
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) { bestKey = key; best = m; }
    }
    return best;
  };

  // ---------- 연속 4 공격 (VCF) ----------
  // c 차례에서 4를 계속 만들어 이길 수 있으면 첫 수를, 아니면 -1
  Engine.prototype.vcf = function (c, depth, deadline) {
    const fives = this.fivePoints(c);
    for (const f of fives) if (!this.forbidden(f, c) || true) return f;   // 다섯은 금수여도 둘 수 있어요
    if (depth <= 0 || (deadline && Date.now() > deadline)) return -1;
    const o = 3 - c;
    if (this.fivePoints(o).length) return -1;   // 상대가 먼저 다섯을 노리면 VCF 아님 (단순화)
    // 4를 만드는 수 찾기: 내 돌 3개 + 빈칸 2개인 창의 빈칸
    const tried = new Set();
    const cc = this.cnt[c]; const co = this.cnt[o];
    for (let w = 0; w < NW; w++) {
      if (cc[w] !== 3 || co[w] !== 0) continue;
      for (const m of WINS[w]) {
        if (this.cells[m] !== 0 || tried.has(m)) continue;
        tried.add(m);
        if (this.forbidden(m, c)) continue;
        this.nodes++;
        this.place(m, c);
        const th = this.fivePoints(c);
        let win = false;
        if (th.length >= 2) {
          win = true;
        } else if (th.length === 1) {
          const t = th[0];
          if (this.forbidden(t, o)) win = true;   // 상대가 막을 자리가 금수(3·3)
          else {
            this.place(t, o);
            if (!this.isFive(t, o)) win = this.vcf(c, depth - 1, deadline) >= 0;
            this.unplace(t, o);
          }
        }
        this.unplace(m, c);
        if (win) return m;
      }
    }
    return -1;
  };

  // ---------- 알파베타 ----------
  Engine.prototype.search = function (c, depth, alpha, beta, ply, ctx) {
    this.nodes++;
    if (ctx.deadline && (this.nodes & 255) === 0 && Date.now() > ctx.deadline) { ctx.timeout = true; return 0; }
    const o = 3 - c;
    const myFive = this.fivePoints(c);
    if (myFive.length) return WIN - ply;
    const oppFive = this.fivePoints(o);
    let moves;
    if (oppFive.length) {
      // 꼭 막아야 해요
      const b = oppFive[0];
      if (oppFive.length > 1 || this.forbidden(b, c)) return -(WIN - ply - 1);
      moves = [[b, 0]];
    } else {
      if (depth <= 0) return this.evaluate(c);
      moves = this.topMoves(c, ply === 0 ? ctx.rootK : ctx.k, 1.1);
      if (!moves.length) return 0;
    }
    let best = -Infinity;
    for (const [m] of moves) {
      this.place(m, c);
      let sc;
      if (this.isFive(m, c)) sc = WIN - ply;
      else sc = -this.search(o, oppFive.length ? depth : depth - 1, -beta, -alpha, ply + 1, ctx);
      this.unplace(m, c);
      if (ctx.timeout) return 0;
      if (sc > best) {
        best = sc;
        if (ply === 0) ctx.best = m;
      }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  };

  // 루트에서 모든 후보 점수 매기기 (반복 깊이)
  Engine.prototype.think = function (c, maxDepth, ms, rootK, k) {
    const deadline = ms ? Date.now() + ms : 0;
    let bestMove = -1;
    let bestScore = -Infinity;
    for (let d = 2; d <= maxDepth; d += 1) {
      const ctx = { deadline, timeout: false, best: -1, rootK, k };
      const sc = this.search(c, d, -Infinity, Infinity, 0, ctx);
      if (ctx.timeout) break;
      if (ctx.best >= 0) { bestMove = ctx.best; bestScore = sc; }
      if (sc >= WIN - 50 || sc <= -(WIN - 50)) break;
      if (deadline && Date.now() > deadline - ms * 0.45) break;   // 다음 깊이는 시간이 모자라요
    }
    return { move: bestMove, score: bestScore };
  };

  // 상대가 다음 차례에 VCF 로 이길 수 있으면, 그걸 막는 수 찾기
  Engine.prototype.defendVcf = function (c, depth, deadline) {
    const o = 3 - c;
    if (this.vcf(o, depth, deadline) < 0) return -1;
    const cands = this.topMoves(c, 16, 1.4);
    let best = -1; let bestS = -Infinity;
    for (const [m, s] of cands) {
      this.place(m, c);
      const ok = this.isFive(m, c) || this.vcf(o, depth, deadline) < 0;
      this.unplace(m, c);
      if (ok && s > bestS) { best = m; bestS = s; }
    }
    return best;
  };

  function rnd(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 수 고르기. moves: 지금까지의 수, level 1~5
  function choose(moves, level, opts) {
    const o2 = opts || {};
    const rand = rnd(o2.seed || (Date.now() ^ (moves.length * 7919)));
    const E = new Engine(moves);
    const c = E.turn;
    const o = 3 - c;
    const CTR = 7 * N + 7;
    if (!moves.length) {
      if (level <= 2) return CTR + Math.floor(rand() * 3 - 1) + N * Math.floor(rand() * 3 - 1);
      return CTR;
    }
    if (moves.length === 1) {
      const m = moves[0];
      const x = m % N; const y = (m / N) | 0;
      const opts1 = [[1, 1], [1, 0], [0, 1], [-1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1]]
        .filter(([dx, dy]) => R.inb(x + dx, y + dy));
      const pick = level >= 4 ? opts1[Math.floor(rand() * 2)] : opts1[Math.floor(rand() * opts1.length)];
      return (y + pick[1]) * N + (x + pick[0]);
    }
    const myFive = E.fivePoints(c);
    const oppFive = E.fivePoints(o).filter((i) => true);
    // 1) 이기는 수
    if (myFive.length && (level >= 2 || rand() < 0.85)) return myFive[0];
    // 2) 다섯 막기
    if (oppFive.length) {
      const blocks = oppFive.filter((i) => !E.forbidden(i, c));
      const p = [0, 0.6, 0.95, 1, 1, 1][level];
      if (blocks.length && rand() < p) return blocks[0];
    }

    if (level === 1) {
      const top = E.topMoves(c, 12, 0.6);
      if (rand() < 0.3) return top[Math.floor(rand() * top.length)][0];
      let best = top[0][0]; let bs = -Infinity;
      for (const [m, s] of top) { const v = s * (0.25 + rand() * 1.5); if (v > bs) { bs = v; best = m; } }
      return best;
    }
    // 3) 열린 4 만들기 / 상대 열린 3 막기 (단계마다 알아채는 확률이 달라요)
    if (level <= 3) {
      const pMake = [0, 0, 0.7, 1][level];
      const pBlock = [0, 0, 0.45, 1][level];
      const mine = E.winThreatPoints(c);
      if (mine.length && rand() < pMake) return mine[0];
      const theirs = E.winThreatPoints(o);
      if (theirs.length && rand() < pBlock) {
        const b = E.blockThreat(c, theirs);
        if (b >= 0) return b;
      }
    }
    if (level === 2) {
      const top = E.topMoves(c, 8, rand() < 0.6 ? 1 : 0.45);
      let best = top[0][0]; let bs = -Infinity;
      for (const [m, s] of top) { const v = s * (0.7 + rand() * 0.6); if (v > bs) { bs = v; best = m; } }
      return best;
    }
    if (level === 3) {
      const v = E.vcf(c, 3, Date.now() + 250);
      if (v >= 0) return v;
      const top = E.topMoves(c, 6, 1.1);
      let best = top[0][0]; let bs = -Infinity;
      for (const [m, s] of top) { const val = s * (0.93 + rand() * 0.14); if (val > bs) { bs = val; best = m; } }
      return best;
    }
    // 4, 5
    const cfg = Object.assign(level >= 5
      ? { ms: 1600, vcf: 14, dvcf: 8, depth: 10, rootK: 10, k: 7 }
      : { ms: 600, vcf: 8, dvcf: 5, depth: 4, rootK: 9, k: 7 }, o2.cfg || {});
    const t0 = Date.now();
    const deadline = t0 + cfg.ms;
    const v = E.vcf(c, cfg.vcf, t0 + cfg.ms * 0.25);
    if (v >= 0) return v;
    const d = E.defendVcf(c, cfg.dvcf, t0 + cfg.ms * 0.45);
    if (d >= 0) return d;
    const res = E.think(c, cfg.depth, Math.max(150, deadline - Date.now()), cfg.rootK, cfg.k);
    if (res.move >= 0) {
      // 같은 판이 매번 똑같지 않게: 첫 몇 수는 점수 차이가 거의 없는 수 중에서 살짝 골라요
      if (res.score < WIN - 50 && res.score > -(WIN - 50) && moves.length < 8 && rand() < 0.35) {
        const top = E.topMoves(c, 3, 1.1);
        if (top.length > 1 && top[1][1] > top[0][1] * 0.9) return top[1][0];
      }
      return res.move;
    }
    const top = E.topMoves(c, 1, 1.1);
    return top.length ? top[0][0] : -1;
  }

  root.BoardAI = root.BoardAI || {};
  root.BoardAI.omok = { choose, Engine };
})(typeof self !== 'undefined' ? self : this);
