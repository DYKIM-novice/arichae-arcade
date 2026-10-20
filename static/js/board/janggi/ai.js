/* 아리채 오락실 · 장기 AI (워커에서 돌아요)
   빠른 계산용 엔진: 가장자리를 3칸씩 넓힌 판(15×16), 수 두기/되돌리기, 알파베타(PVS) + 잡기만 더 읽기,
   같은 판 기억(조브리스트), 킬러·히스토리 정렬, 널 무브, 늦은 수 줄여 읽기, 장군이면 한 수 더 읽기.
   점수: 말 값(차 13 · 포 7 · 마 5 · 상 3 · 사 3 · 졸 2) + 자리 점수 */
(function (root) {
  'use strict';

  const R = root.BoardRules.janggi;
  const PW = 15; const OFF = 100;
  const KI = 1; const AD = 2; const EL = 3; const HO = 4; const CA = 5; const CH = 6; const PA = 7;
  const VAL = [0, 0, 300, 300, 500, 700, 1300, 200];
  const CODE = { K: KI, A: AD, E: EL, H: HO, C: CA, R: CH, P: PA };
  const LET = ['', 'K', 'A', 'E', 'H', 'C', 'R', 'P'];
  const MATE = 30000; const INF = 32000; const MAXPLY = 64;
  const pad = (i) => (((i / 9) | 0) + 3) * PW + (i % 9) + 3;
  const unpad = (s) => (((s / PW) | 0) - 3) * 9 + (s % PW) - 3;
  const ROW = (s) => ((s / PW) | 0) - 3; const COL = (s) => (s % PW) - 3;

  /* ---------- 미리 만드는 표 ---------- */
  const PAL = new Int8Array(240);      // 1 = 초 궁성, 2 = 한 궁성
  const PNB = Array.from({ length: 240 }, () => []);   // 궁성 안 이웃 (곧게 + 대각선)
  const DL = R.DIAG_LINES.map((L) => L.map(pad));
  const PDIAG = [Array.from({ length: 240 }, () => []), Array.from({ length: 240 }, () => [])];   // 졸 대각선 [초, 한]
  const PDIAG_REV = [Array.from({ length: 240 }, () => []), Array.from({ length: 240 }, () => [])];
  for (let i = 0; i < 90; i++) {
    const s = pad(i);
    if (R.inPalace(i, 0)) PAL[s] = 1; else if (R.inPalace(i, 1)) PAL[s] = 2;
  }
  for (let i = 0; i < 90; i++) {
    const s = pad(i);
    if (!PAL[s]) continue;
    for (const d of [-PW, PW, -1, 1]) if (PAL[s + d] === PAL[s]) PNB[s].push(s + d);
    for (const j of R.DIAG_NB[i]) PNB[s].push(pad(j));
    // 졸: 상대 궁성 안에서 대각선 앞으로
    for (const j of R.DIAG_NB[i]) {
      const sj = pad(j);
      if (PAL[s] === 2 && ROW(sj) < ROW(s)) { PDIAG[0][s].push(sj); PDIAG_REV[0][sj].push(s); }
      if (PAL[s] === 1 && ROW(sj) > ROW(s)) { PDIAG[1][s].push(sj); PDIAG_REV[1][sj].push(s); }
    }
  }
  const ORTH = [-PW, PW, -1, 1];
  // 마·상: [다리, [도착(마)…]] → 상은 도착 + (도착-다리)
  const HL = [[-PW, [-2 * PW - 1, -2 * PW + 1]], [PW, [2 * PW - 1, 2 * PW + 1]], [-1, [-PW - 2, PW - 2]], [1, [-PW + 2, PW + 2]]];

  // 자리 점수 (초 기준, 줄 0 = 한 쪽 끝)
  function posBonus(t, r, c) {
    const dc = Math.abs(c - 4);
    if (t === PA) return (r <= 2 && c >= 3 && c <= 5 ? 40 : 0) + Math.max(0, 6 - r) * 12 - dc * 2;
    if (t === HO) return -dc * 8 - (r === 9 ? 10 : 0) - (c === 0 || c === 8 ? 15 : 0) + (r <= 5 ? 10 : 0);
    if (t === EL) return -dc * 3;
    if (t === CA) return (r >= 7 ? 10 : 0) - (c === 0 || c === 8 ? 8 : 0);
    if (t === CH) return (r <= 3 ? 15 : 0) - (c === 4 && r >= 7 ? 5 : 0);
    if (t === KI) return r === 8 && c === 4 ? 10 : 0;
    return 0;
  }
  const PST = Array.from({ length: 8 }, () => new Int16Array(240));
  for (let t = 1; t <= 7; t++) for (let i = 0; i < 90; i++) PST[t][pad(i)] = posBonus(t, (i / 9) | 0, i % 9);
  const mirror = (s) => pad((9 - ROW(s)) * 9 + COL(s));

  /* ---------- 조브리스트 ---------- */
  let seed = 0x2545F491;
  function rnd32() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
  const Z1 = new Int32Array(15 * 240); const Z2 = new Int32Array(15 * 240);
  for (let k = 0; k < Z1.length; k++) { Z1[k] = rnd32(); Z2[k] = rnd32(); }
  const ZS1 = rnd32(); const ZS2 = rnd32();
  const zp = (p, s) => (p + 7) * 240 + s;

  /* ---------- 판 ---------- */
  const bd = new Int8Array(240);
  let side = 1; let half = 0; let h1 = 0; let h2 = 0;
  const king = [0, 0];
  const U_cap = new Int8Array(1024); const U_half = new Int16Array(1024); const U_h1 = new Int32Array(1024); const U_h2 = new Int32Array(1024); const U_mv = new Int32Array(1024);
  const HIST1 = new Int32Array(1024);
  let sp = 0;

  function load(st) {
    bd.fill(OFF);
    for (let i = 0; i < 90; i++) {
      const p = st.b[i]; const s = pad(i);
      bd[s] = p ? (p === p.toUpperCase() ? CODE[p] : -CODE[p.toUpperCase()]) : 0;
      if (p === 'K') king[0] = s; if (p === 'k') king[1] = s;
    }
    side = st.turn === 0 ? 1 : -1; half = st.quiet; sp = 0;
    h1 = 0; h2 = 0;
    for (let s = 0; s < 240; s++) { const p = bd[s]; if (p && p !== OFF) { h1 ^= Z1[zp(p, s)]; h2 ^= Z2[zp(p, s)]; } }
    if (side < 0) { h1 ^= ZS1; h2 ^= ZS2; }
  }

  function attacked(sq, by) {
    const myPal = by > 0 ? 1 : 2;
    // 차·포 (곧게)
    for (let k = 0; k < 4; k++) {
      const d = ORTH[k];
      let t = sq + d;
      while (bd[t] === 0) t += d;
      if (bd[t] === OFF) continue;
      if (bd[t] === by * CH) return true;
      if (bd[t] === CA || bd[t] === -CA) continue;   // 포는 포를 다리로 못 써요
      t += d;
      while (bd[t] === 0) t += d;
      if (bd[t] === by * CA) return true;
    }
    // 궁성 대각선 (차·포)
    if (PAL[sq]) {
      for (const L of DL) {
        if (L[0] === sq) {
          if (bd[L[1]] === by * CH) return true;
          if (bd[L[1]] === 0 && bd[L[2]] === by * CH) return true;
        } else if (L[1] === sq && bd[L[2]] === by * CH) return true;
        if (L[2] === sq && bd[L[0]] === by * CA && bd[L[1]] !== 0 && bd[L[1]] !== CA && bd[L[1]] !== -CA) return true;
      }
    }
    // 마·상
    for (let k = 0; k < 4; k++) {
      const leg = HL[k][0];
      for (const dest of HL[k][1]) {
        let X = sq - dest;
        if (X >= 0 && X < 240 && bd[X] === by * HO && bd[X + leg] === 0) return true;
        const fin = dest + (dest - leg);
        X = sq - fin;
        if (X >= 0 && X < 240 && bd[X] === by * EL && bd[X + leg] === 0 && bd[X + dest] === 0) return true;
      }
    }
    // 졸
    const back = by > 0 ? PW : -PW;
    if (bd[sq + back] === by * PA || bd[sq - 1] === by * PA || bd[sq + 1] === by * PA) return true;
    for (const X of PDIAG_REV[by > 0 ? 0 : 1][sq]) if (bd[X] === by * PA) return true;
    // 궁·사
    if (PAL[sq] === myPal) for (const X of PNB[sq]) if (bd[X] === by * KI || bd[X] === by * AD) return true;
    return false;
  }

  const MV = new Int32Array(MAXPLY * 160);
  const SC = new Int32Array(MAXPLY * 160);
  function gen(base, capsOnly) {
    let n = base;
    const me = side; const myPal = me > 0 ? 1 : 2;
    const enemy = (q) => q !== 0 && q !== OFF && (q > 0) !== (me > 0);
    const add = (s, t) => { const q = bd[t]; if (q === OFF) return; if (q === 0) { if (!capsOnly) MV[n++] = s | (t << 8); } else if ((q > 0) !== (me > 0)) MV[n++] = s | (t << 8); };
    for (let s = 48; s < 192; s++) {
      const p = bd[s];
      if (p === 0 || p === OFF || (p > 0) !== (me > 0)) continue;
      const t = p * me;
      if (t === KI || t === AD) {
        for (const x of PNB[s]) if (PAL[x] === myPal) add(s, x);
      } else if (t === CH) {
        for (let k = 0; k < 4; k++) {
          const d = ORTH[k]; let x = s + d;
          while (bd[x] === 0) { if (!capsOnly) MV[n++] = s | (x << 8); x += d; }
          if (enemy(bd[x])) MV[n++] = s | (x << 8);
        }
        if (PAL[s]) for (const L of DL) {
          if (L[0] === s) {
            if (bd[L[1]] === 0) { if (!capsOnly) MV[n++] = s | (L[1] << 8); add(s, L[2]); } else if (enemy(bd[L[1]])) MV[n++] = s | (L[1] << 8);
          } else if (L[1] === s) add(s, L[2]);
        }
      } else if (t === CA) {
        for (let k = 0; k < 4; k++) {
          const d = ORTH[k]; let x = s + d;
          while (bd[x] === 0) x += d;
          if (bd[x] === OFF || bd[x] === CA || bd[x] === -CA) continue;
          x += d;
          while (bd[x] === 0) { if (!capsOnly) MV[n++] = s | (x << 8); x += d; }
          if (enemy(bd[x]) && bd[x] !== CA && bd[x] !== -CA) MV[n++] = s | (x << 8);
        }
        if (PAL[s]) for (const L of DL) {
          if (L[0] !== s) continue;
          const mid = bd[L[1]]; const q = bd[L[2]];
          if (mid !== 0 && mid !== CA && mid !== -CA && q !== CA && q !== -CA) add(s, L[2]);
        }
      } else if (t === HO) {
        for (let k = 0; k < 4; k++) { if (bd[s + HL[k][0]] !== 0) continue; for (const d of HL[k][1]) add(s, s + d); }
      } else if (t === EL) {
        for (let k = 0; k < 4; k++) {
          const leg = HL[k][0];
          if (bd[s + leg] !== 0) continue;
          for (const d of HL[k][1]) { if (bd[s + d] !== 0) continue; const f = s + d + (d - leg); if (f >= 0 && f < 240) add(s, f); }
        }
      } else if (t === PA) {
        add(s, s + (me > 0 ? -PW : PW)); add(s, s - 1); add(s, s + 1);
        for (const x of PDIAG[me > 0 ? 0 : 1][s]) add(s, x);
      }
    }
    return n - base;
  }

  function make(m) {
    const f = m & 255; const t = m >> 8;
    U_cap[sp] = bd[t]; U_half[sp] = half; U_h1[sp] = h1; U_h2[sp] = h2; U_mv[sp] = m; HIST1[sp] = h1; sp++;
    const p = bd[f]; const cap = bd[t];
    if (cap) { h1 ^= Z1[zp(cap, t)]; h2 ^= Z2[zp(cap, t)]; }
    h1 ^= Z1[zp(p, f)] ^ Z1[zp(p, t)]; h2 ^= Z2[zp(p, f)] ^ Z2[zp(p, t)];
    bd[t] = p; bd[f] = 0;
    if (p === KI) king[0] = t; else if (p === -KI) king[1] = t;
    half = cap ? 0 : half + 1;
    side = -side; h1 ^= ZS1; h2 ^= ZS2;
  }
  function unmake() {
    sp--;
    const m = U_mv[sp]; const f = m & 255; const t = m >> 8;
    side = -side;
    const p = bd[t];
    bd[f] = p; bd[t] = U_cap[sp];
    if (p === KI) king[0] = f; else if (p === -KI) king[1] = f;
    half = U_half[sp]; h1 = U_h1[sp]; h2 = U_h2[sp];
  }
  function makeNull() { U_cap[sp] = 0; U_half[sp] = half; U_h1[sp] = h1; U_h2[sp] = h2; U_mv[sp] = 0; HIST1[sp] = h1; sp++; side = -side; h1 ^= ZS1; h2 ^= ZS2; half++; }
  function unmakeNull() { sp--; side = -side; half = U_half[sp]; h1 = U_h1[sp]; h2 = U_h2[sp]; }
  const inCheck = (who) => attacked(king[who > 0 ? 0 : 1], -who);

  function evaluate() {
    let sc = 0;
    let adv = [0, 0];
    for (let s = 48; s < 192; s++) {
      const p = bd[s];
      if (p === 0 || p === OFF) continue;
      if (p > 0) { sc += VAL[p] + PST[p][s]; if (p === AD) adv[0]++; } else { sc -= VAL[-p] + PST[-p][mirror(s)]; if (p === -AD) adv[1]++; }
    }
    sc -= 150;   // 한은 덤 1.5점
    return sc * side;
  }

  /* ---------- 탐색 ---------- */
  const TT_SIZE = 1 << 18; const TT_MASK = TT_SIZE - 1;
  const T_key = new Int32Array(TT_SIZE); const T_move = new Int32Array(TT_SIZE);
  const T_score = new Int16Array(TT_SIZE); const T_depth = new Int8Array(TT_SIZE); const T_flag = new Int8Array(TT_SIZE);
  const killers = new Int32Array(MAXPLY * 2);
  const HISTORY = new Int32Array(15 * 240);
  let nodes = 0; let deadline = 0; let stop = false; let startT = 0;

  function repeated() { for (let k = sp - 2; k >= 0 && k >= sp - half; k -= 2) if (HIST1[k] === h1) return true; return false; }

  function scoreMoves(base, n, ply, ttMove) {
    for (let k = base; k < base + n; k++) {
      const m = MV[k];
      if (m === ttMove) { SC[k] = 2000000; continue; }
      const f = m & 255; const t = m >> 8; const cap = bd[t];
      if (cap) SC[k] = 1000000 + VAL[Math.abs(cap)] * 10 - VAL[Math.abs(bd[f])] / 10;
      else if (m === killers[ply * 2]) SC[k] = 800000;
      else if (m === killers[ply * 2 + 1]) SC[k] = 700000;
      else SC[k] = HISTORY[zp(bd[f], t)];
    }
  }
  function pick(k, end) {
    let bi = k; let bv = SC[k];
    for (let j = k + 1; j < end; j++) if (SC[j] > bv) { bv = SC[j]; bi = j; }
    if (bi !== k) { const tm = MV[k]; MV[k] = MV[bi]; MV[bi] = tm; const ts = SC[k]; SC[k] = SC[bi]; SC[bi] = ts; }
    return MV[k];
  }

  function qsearch(alpha, beta, ply) {
    nodes++;
    if ((nodes & 2047) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    const sp0 = evaluate();
    if (ply >= MAXPLY - 1 || sp0 >= beta) return sp0;
    if (sp0 > alpha) alpha = sp0;
    const base = ply * 160;
    const n = gen(base, true);
    scoreMoves(base, n, ply, 0);
    const me = side;
    for (let k = base; k < base + n; k++) {
      const m = pick(k, base + n);
      make(m);
      if (inCheck(me)) { unmake(); continue; }
      const sc = -qsearch(-beta, -alpha, ply + 1);
      unmake();
      if (stop) return 0;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function search(depth, alpha, beta, ply, nullOk) {
    if (ply > 0 && repeated()) return 0;
    const me = side;
    const chk = inCheck(me);
    if (chk && ply < MAXPLY - 8) depth++;
    if (depth <= 0) return qsearch(alpha, beta, ply);
    nodes++;
    if ((nodes & 2047) === 0 && Date.now() > deadline) stop = true;
    if (stop) return 0;
    if (ply >= MAXPLY - 2) return evaluate();
    const ti = h1 & TT_MASK;
    let ttMove = 0;
    if (T_key[ti] === h2) {
      ttMove = T_move[ti];
      if (ply > 0 && T_depth[ti] >= depth) {
        let s = T_score[ti];
        if (s > MATE - 500) s -= ply; else if (s < -MATE + 500) s += ply;
        const fl = T_flag[ti];
        if (fl === 1 || (fl === 2 && s >= beta) || (fl === 3 && s <= alpha)) return s;
      }
    }
    if (nullOk && !chk && depth >= 3 && ply > 0 && beta < MATE - 500 && evaluate() >= beta) {
      makeNull();
      const s = -search(depth - 3, -beta, -beta + 1, ply + 1, false);
      unmakeNull();
      if (stop) return 0;
      if (s >= beta) return beta;
    }
    const base = ply * 160;
    const n = gen(base, false);
    scoreMoves(base, n, ply, ttMove);
    let legal = 0; let best = -INF; let bestMove = 0; const a0 = alpha;
    for (let k = base; k < base + n; k++) {
      const m = pick(k, base + n);
      const f = m & 255; const t = m >> 8;
      const quiet = !bd[t];
      const mover = bd[f];
      make(m);
      if (inCheck(me)) { unmake(); continue; }
      legal++;
      let sc;
      if (legal === 1) sc = -search(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let red = 0;
        if (legal > 3 && depth >= 3 && quiet && !chk && m !== killers[ply * 2] && m !== killers[ply * 2 + 1] && !inCheck(side)) red = legal > 10 ? 2 : 1;
        sc = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (!stop && sc > alpha && red) sc = -search(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (!stop && sc > alpha && sc < beta) sc = -search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      unmake();
      if (stop) return 0;
      if (sc > best) { best = sc; bestMove = m; }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (quiet) {
          if (killers[ply * 2] !== m) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; }
          HISTORY[zp(mover, t)] += depth * depth;
        }
        break;
      }
    }
    if (!legal) {
      if (chk) return -MATE + ply;
      // 둘 수가 없으면 한 수 쉬어요
      makeNull();
      const s = -search(depth - 1, -beta, -alpha, ply + 1, false);
      unmakeNull();
      return s;
    }
    let ss = best;
    if (ss > MATE - 500) ss += ply; else if (ss < -MATE + 500) ss -= ply;
    T_key[ti] = h2; T_move[ti] = bestMove; T_score[ti] = ss; T_depth[ti] = depth;
    T_flag[ti] = best <= a0 ? 3 : best >= beta ? 2 : 1;
    return best;
  }

  function rootMoves() {
    const n = gen(0, false);
    const out = []; const me = side;
    for (let k = 0; k < n; k++) { const m = MV[k]; make(m); if (!inCheck(me)) out.push(m); unmake(); }
    return out;
  }
  function scoreAll(list, depth) {
    const out = [];
    for (const m of list) {
      make(m);
      const sc = -search(depth - 1, -INF, INF, 1, true);
      unmake();
      if (stop) break;
      out.push({ m, s: sc });
    }
    return out;
  }
  function deepen(list, maxDepth) {
    let best = list[0]; let bestScore = 0;
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -INF; let cur = 0; let curScore = -INF;
      const order = [best].concat(list.filter((m) => m !== best));
      for (const m of order) {
        make(m);
        let sc;
        if (cur === 0) sc = -search(d - 1, -INF, -alpha, 1, true);
        else {
          sc = -search(d - 1, -alpha - 1, -alpha, 1, true);
          if (!stop && sc > alpha) sc = -search(d - 1, -INF, -alpha, 1, true);
        }
        unmake();
        if (stop) break;
        if (sc > curScore) { curScore = sc; cur = m; }
        if (sc > alpha) alpha = sc;
      }
      if (cur && (!stop || curScore > bestScore)) { best = cur; bestScore = curScore; }
      if (stop || Math.abs(bestScore) > MATE - 500) break;
      if (Date.now() > deadline - (deadline - startT) * 0.45) break;
    }
    return best;
  }

  const toRules = (m) => [unpad(m & 255), unpad(m >> 8)];
  const LV = {
    1: { depth: 1, noise: 350, random: 0.3 },
    2: { depth: 2, noise: 140, random: 0.05 },
    3: { depth: 3, noise: 50, ms: 700 },
    4: { maxDepth: 8, ms: 1000 },
    5: { maxDepth: 20, ms: 3000 }
  };
  function rng(sd) {
    let a = sd >>> 0 || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function choose(history, level, opts) {
    const o = opts || {};
    const cfg = Object.assign({}, LV[level] || LV[3]);
    if (o.ms) cfg.ms = o.ms;
    const rand = rng(o.seed || (Date.now() ^ (history.length * 7919)));
    let st = R.init();
    let loaded = false;
    for (const mv of history) {
      if (st.phase === 'play' && !loaded) { load(st); loaded = true; }
      if (loaded) {
        if (mv === 'pass') makeNull();
        else {
          const m = pad(mv[0]) | (pad(mv[1]) << 8);
          make(m);
        }
      }
      st = R.play(st, mv);
    }
    if (st.phase === 'setup') return { s: Math.floor(rand() * 4) };
    if (!loaded) load(st);
    const legal = rootMoves();
    if (!legal.length) return 'pass';
    if (legal.length === 1) return toRules(legal[0]);
    if (cfg.random && rand() < cfg.random) return toRules(legal[Math.floor(rand() * legal.length)]);
    nodes = 0; stop = false; startT = Date.now();
    deadline = startT + (cfg.ms || 4000);
    killers.fill(0); HISTORY.fill(0);
    if (cfg.noise) {
      const sc = scoreAll(legal, cfg.depth);
      if (!sc.length) return toRules(legal[0]);
      sc.sort((a, b) => b.s - a.s);
      if (sc[0].s > MATE - 500) return toRules(sc[0].m);
      let best = sc[0]; let bv = -Infinity;
      for (const x of sc) {
        if (x.s < -MATE + 500 && sc[0].s > -MATE + 500) continue;
        const v = x.s + (rand() * 2 - 1) * cfg.noise;
        if (v > bv) { bv = v; best = x; }
      }
      return toRules(best.m);
    }
    return toRules(deepen(legal, cfg.maxDepth || 6));
  }

  // 시험용
  function perft(d) {
    if (d === 0) return 1;
    const base = (MAXPLY - 1 - d) * 160;
    const n = gen(base, false);
    let c = 0; const me = side;
    for (let k = base; k < base + n; k++) { const m = MV[k]; make(m); if (!inCheck(me)) c += perft(d - 1); unmake(); }
    return c;
  }

  root.BoardAI = root.BoardAI || {};
  root.BoardAI.janggi = { choose, _t: { load, perft, rootMoves, toRules, evaluate, LET } };
})(typeof self !== 'undefined' ? self : this);
