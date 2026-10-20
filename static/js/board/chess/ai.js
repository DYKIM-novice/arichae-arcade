/* 아리채 오락실 · 체스 AI (워커에서 돌아요)
   빠르게 계산하려고 규칙 파일과 따로 만든 엔진이에요: 10×12 판, 수 두기/되돌리기, 알파베타(PVS) + 잡기만 더 읽기(정지 탐색),
   같은 판 기억(조브리스트 해시), 킬러·히스토리 정렬, 널 무브, 늦은 수 줄여 읽기.
   점수: 말 값 + 칸 점수표(Tomasz Michniewski 의 간단 평가표) + 끝판에 상대 킹 몰기 */
(function (root) {
  'use strict';

  const R = root.BoardRules.chess;
  const OFF = 7;
  const P = 1; const N = 2; const B = 3; const RK = 4; const Q = 5; const K = 6;
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  const MATE = 30000; const INF = 32000;
  const MAXPLY = 64;
  const s120 = (i) => 21 + ((i / 8) | 0) * 10 + (i % 8);
  const s64 = (s) => (((s - 21) / 10) | 0) * 8 + ((s - 21) % 10);
  const CH = { p: P, n: N, b: B, r: RK, q: Q, k: K };
  const LETTER = ['', 'p', 'n', 'b', 'r', 'q', 'k'];

  // 칸 점수표 (백 기준, 0 = a8)
  const PST = [null,
    [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20]
  ];
  const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
  const CENTER_DIST = new Int8Array(64);
  for (let i = 0; i < 64; i++) { const r = (i / 8) | 0; const c = i % 8; CENTER_DIST[i] = Math.max(3 - r, r - 4) + Math.max(3 - c, c - 4); }

  const KN_D = [-21, -19, -12, -8, 8, 12, 19, 21];
  const KG_D = [-11, -10, -9, -1, 1, 9, 10, 11];
  const BI_D = [-11, -9, 9, 11];
  const RO_D = [-10, -1, 1, 10];

  /* ---------- 조브리스트 ---------- */
  let seed = 0x9E3779B9;
  function rnd32() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
  const ZP1 = new Int32Array(13 * 120); const ZP2 = new Int32Array(13 * 120);
  for (let k = 0; k < ZP1.length; k++) { ZP1[k] = rnd32(); ZP2[k] = rnd32(); }
  const ZC1 = new Int32Array(16); const ZC2 = new Int32Array(16);
  for (let k = 0; k < 16; k++) { ZC1[k] = rnd32(); ZC2[k] = rnd32(); }
  const ZE1 = new Int32Array(120); const ZE2 = new Int32Array(120);
  for (let k = 0; k < 120; k++) { ZE1[k] = rnd32(); ZE2[k] = rnd32(); }
  const ZS1 = rnd32(); const ZS2 = rnd32();

  /* ---------- 판 상태 ---------- */
  const bd = new Int8Array(120);
  let side = 1; let castle = 0; let ep = 0; let half = 0; let h1 = 0; let h2 = 0;
  const king = [0, 0];   // [백, 흑]
  // 되돌리기 기록
  const U_cap = new Int8Array(1024); const U_castle = new Int8Array(1024); const U_ep = new Int16Array(1024);
  const U_half = new Int16Array(1024); const U_h1 = new Int32Array(1024); const U_h2 = new Int32Array(1024); const U_move = new Int32Array(1024);
  let sp = 0;                       // 기록 깊이 (실제 둔 수 포함)
  const HIST1 = new Int32Array(1024); // 같은 판 반복 찾기용

  const CASTLE_MASK = new Int8Array(120).fill(15);
  CASTLE_MASK[s120(60)] = 15 & ~3; CASTLE_MASK[s120(4)] = 15 & ~12;
  CASTLE_MASK[s120(63)] = 15 & ~1; CASTLE_MASK[s120(56)] = 15 & ~2;
  CASTLE_MASK[s120(7)] = 15 & ~4; CASTLE_MASK[s120(0)] = 15 & ~8;

  function zp(p, s) { return (p + 6) * 120 + s; }
  function rehash() {
    h1 = 0; h2 = 0;
    for (let s = 21; s < 99; s++) { const p = bd[s]; if (p && p !== OFF) { h1 ^= ZP1[zp(p, s)]; h2 ^= ZP2[zp(p, s)]; } }
    h1 ^= ZC1[castle]; h2 ^= ZC2[castle];
    if (ep) { h1 ^= ZE1[ep]; h2 ^= ZE2[ep]; }
    if (side < 0) { h1 ^= ZS1; h2 ^= ZS2; }
  }
  function load(st) {
    bd.fill(OFF);
    for (let i = 0; i < 64; i++) {
      const ch = st.b[i];
      const s = s120(i);
      bd[s] = ch ? (ch === ch.toUpperCase() ? CH[ch.toLowerCase()] : -CH[ch]) : 0;
      if (ch === 'K') king[0] = s; if (ch === 'k') king[1] = s;
    }
    side = st.turn === 0 ? 1 : -1;
    castle = (st.castle.includes('K') ? 1 : 0) | (st.castle.includes('Q') ? 2 : 0) | (st.castle.includes('k') ? 4 : 0) | (st.castle.includes('q') ? 8 : 0);
    ep = st.ep >= 0 ? s120(st.ep) : 0;
    half = st.half;
    sp = 0;
    rehash();
  }

  function attacked(s, by) {   // by: 1 백 / -1 흑
    // 폰
    if (by > 0) { if (bd[s + 9] === P || bd[s + 11] === P) return true; } else if (bd[s - 9] === -P || bd[s - 11] === -P) return true;
    for (let k = 0; k < 8; k++) { if (bd[s + KN_D[k]] === by * N) return true; if (bd[s + KG_D[k]] === by * K) return true; }
    for (let k = 0; k < 4; k++) {
      let d = BI_D[k]; let t = s + d;
      while (bd[t] === 0) t += d;
      if (bd[t] === by * B || bd[t] === by * Q) return true;
      d = RO_D[k]; t = s + d;
      while (bd[t] === 0) t += d;
      if (bd[t] === by * RK || bd[t] === by * Q) return true;
    }
    return false;
  }

  /* ---------- 수 만들기 ---------- */
  const MV = new Int32Array(MAXPLY * 256);
  const SC = new Int32Array(MAXPLY * 256);
  const mk = (f, t, pr, fl) => f | (t << 7) | (pr << 14) | (fl << 17);
  // 수 목록을 base 부터 채우고 개수를 돌려줘요 (capsOnly: 잡기·승진만)
  function gen(base, capsOnly) {
    let n = base;
    const me = side;
    for (let s = 21; s < 99; s++) {
      const p = bd[s];
      if (p === 0 || p === OFF || (p > 0) !== (me > 0)) continue;
      const t = p * me;
      if (t === P) {
        const fwd = me > 0 ? -10 : 10;
        const lastRank = me > 0 ? (x) => x < 29 : (x) => x > 90;
        const f1 = s + fwd;
        if (bd[f1] === 0) {
          if (lastRank(f1)) { for (let pr = Q; pr >= N; pr--) MV[n++] = mk(s, f1, pr, 0); } else if (!capsOnly) {
            MV[n++] = mk(s, f1, 0, 0);
            const startRow = me > 0 ? (s >= 81 && s <= 88) : (s >= 31 && s <= 38);
            if (startRow && bd[f1 + fwd] === 0) MV[n++] = mk(s, f1 + fwd, 0, 4);
          }
        }
        for (const dc of [-1, 1]) {
          const tt = f1 + dc;
          const q = bd[tt];
          if (q !== OFF && q !== 0 && (q > 0) !== (me > 0)) {
            if (lastRank(tt)) { for (let pr = Q; pr >= N; pr--) MV[n++] = mk(s, tt, pr, 0); } else MV[n++] = mk(s, tt, 0, 0);
          } else if (tt === ep && ep) MV[n++] = mk(s, tt, 0, 1);
        }
      } else if (t === N || t === K) {
        const D = t === N ? KN_D : KG_D;
        for (let k = 0; k < 8; k++) {
          const tt = s + D[k]; const q = bd[tt];
          if (q === OFF) continue;
          if (q === 0) { if (!capsOnly) MV[n++] = mk(s, tt, 0, 0); } else if ((q > 0) !== (me > 0)) MV[n++] = mk(s, tt, 0, 0);
        }
        if (t === K && !capsOnly) {
          if (me > 0 && s === 95) {
            if ((castle & 1) && bd[96] === 0 && bd[97] === 0 && bd[98] === RK && !attacked(95, -1) && !attacked(96, -1) && !attacked(97, -1)) MV[n++] = mk(95, 97, 0, 2);
            if ((castle & 2) && bd[94] === 0 && bd[93] === 0 && bd[92] === 0 && bd[91] === RK && !attacked(95, -1) && !attacked(94, -1) && !attacked(93, -1)) MV[n++] = mk(95, 93, 0, 2);
          } else if (me < 0 && s === 25) {
            if ((castle & 4) && bd[26] === 0 && bd[27] === 0 && bd[28] === -RK && !attacked(25, 1) && !attacked(26, 1) && !attacked(27, 1)) MV[n++] = mk(25, 27, 0, 2);
            if ((castle & 8) && bd[24] === 0 && bd[23] === 0 && bd[22] === 0 && bd[21] === -RK && !attacked(25, 1) && !attacked(24, 1) && !attacked(23, 1)) MV[n++] = mk(25, 23, 0, 2);
          }
        }
      } else {
        const lo = t === RK ? 4 : 0; const hi = t === B ? 4 : 8;
        for (let k = lo; k < hi; k++) {
          const d = k < 4 ? BI_D[k] : RO_D[k - 4];
          let tt = s + d;
          while (bd[tt] === 0) { if (!capsOnly) MV[n++] = mk(s, tt, 0, 0); tt += d; }
          const q = bd[tt];
          if (q !== OFF && (q > 0) !== (me > 0)) MV[n++] = mk(s, tt, 0, 0);
        }
      }
    }
    return n - base;
  }

  function make(m) {
    const f = m & 127; const t = (m >> 7) & 127; const pr = (m >> 14) & 7; const fl = m >> 17;
    U_cap[sp] = bd[t]; U_castle[sp] = castle; U_ep[sp] = ep; U_half[sp] = half; U_h1[sp] = h1; U_h2[sp] = h2; U_move[sp] = m;
    HIST1[sp] = h1;
    sp++;
    const p = bd[f];
    let cap = bd[t];
    if (cap) { h1 ^= ZP1[zp(cap, t)]; h2 ^= ZP2[zp(cap, t)]; }
    h1 ^= ZP1[zp(p, f)]; h2 ^= ZP2[zp(p, f)];
    const np = pr ? pr * side : p;
    bd[t] = np; bd[f] = 0;
    h1 ^= ZP1[zp(np, t)]; h2 ^= ZP2[zp(np, t)];
    if (fl & 1) {   // 앙파상
      const cs = t + (side > 0 ? 10 : -10);
      cap = bd[cs]; bd[cs] = 0;
      h1 ^= ZP1[zp(cap, cs)]; h2 ^= ZP2[zp(cap, cs)];
    }
    if (fl & 2) {   // 캐슬링: 룩도 옮겨요
      const rf = t > f ? f + 3 : f - 4; const rt = t > f ? f + 1 : f - 1;
      const rp = bd[rf];
      bd[rt] = rp; bd[rf] = 0;
      h1 ^= ZP1[zp(rp, rf)] ^ ZP1[zp(rp, rt)]; h2 ^= ZP2[zp(rp, rf)] ^ ZP2[zp(rp, rt)];
    }
    if (p === K) king[0] = t; else if (p === -K) king[1] = t;
    h1 ^= ZC1[castle]; h2 ^= ZC2[castle];
    castle &= CASTLE_MASK[f] & CASTLE_MASK[t];
    h1 ^= ZC1[castle]; h2 ^= ZC2[castle];
    if (ep) { h1 ^= ZE1[ep]; h2 ^= ZE2[ep]; }
    ep = (fl & 4) ? (f + t) >> 1 : 0;
    if (ep) { h1 ^= ZE1[ep]; h2 ^= ZE2[ep]; }
    half = (p === P || p === -P || cap) ? 0 : half + 1;
    side = -side;
    h1 ^= ZS1; h2 ^= ZS2;
  }
  function unmake() {
    sp--;
    const m = U_move[sp];
    const f = m & 127; const t = (m >> 7) & 127; const pr = (m >> 14) & 7; const fl = m >> 17;
    side = -side;
    const np = bd[t];
    const p = pr ? P * side : np;
    bd[f] = p; bd[t] = U_cap[sp];
    if (fl & 1) bd[t + (side > 0 ? 10 : -10)] = -P * side;
    if (fl & 2) {
      const rf = t > f ? f + 3 : f - 4; const rt = t > f ? f + 1 : f - 1;
      bd[rf] = bd[rt]; bd[rt] = 0;
    }
    if (p === K) king[0] = f; else if (p === -K) king[1] = f;
    castle = U_castle[sp]; ep = U_ep[sp]; half = U_half[sp]; h1 = U_h1[sp]; h2 = U_h2[sp];
  }
  function makeNull() {
    U_cap[sp] = 0; U_castle[sp] = castle; U_ep[sp] = ep; U_half[sp] = half; U_h1[sp] = h1; U_h2[sp] = h2; U_move[sp] = 0;
    HIST1[sp] = h1;
    sp++;
    if (ep) { h1 ^= ZE1[ep]; h2 ^= ZE2[ep]; }
    ep = 0; side = -side; h1 ^= ZS1; h2 ^= ZS2; half++;
  }
  function unmakeNull() {
    sp--; side = -side; castle = U_castle[sp]; ep = U_ep[sp]; half = U_half[sp]; h1 = U_h1[sp]; h2 = U_h2[sp];
  }
  const inCheck = (who) => attacked(king[who > 0 ? 0 : 1], -who);

  /* ---------- 평가 (지금 둘 차례 쪽 기준) ---------- */
  function evaluate() {
    let mat = 0; let pst = 0; let phase = 0;
    let wb = 0; let bb = 0; let wNP = 0; let bNP = 0;
    let wk = 0; let bk = 0;
    for (let s = 21; s < 99; s++) {
      const p = bd[s];
      if (p === 0 || p === OFF) continue;
      const i = s64(s);
      if (p > 0) {
        mat += VAL[p];
        if (p === K) wk = i; else pst += PST[p][i];
        if (p === B) wb++;
        if (p > P && p < K) { wNP += VAL[p]; phase += p === Q ? 4 : p === RK ? 2 : 1; }
      } else {
        const t = -p; const mi = (7 - ((i / 8) | 0)) * 8 + (i % 8);
        mat -= VAL[t];
        if (t === K) bk = i; else pst -= PST[t][mi];
        if (t === B) bb++;
        if (t > P && t < K) { bNP += VAL[t]; phase += t === Q ? 4 : t === RK ? 2 : 1; }
      }
    }
    // 킹: 중반(숨기) ↔ 끝판(가운데로) 섞기
    const ph = Math.min(phase, 24);
    const bkm = (7 - ((bk / 8) | 0)) * 8 + (bk % 8);
    pst += ((PST[K][wk] - PST[K][bkm]) * ph + (KING_END[wk] - KING_END[bkm]) * (24 - ph)) / 24;
    if (wb >= 2) pst += 30; if (bb >= 2) pst -= 30;
    let sc = mat + pst;
    // 끝판에 이기고 있으면 상대 킹을 가장자리로 몰고, 내 킹은 다가가요
    if (ph < 8 && Math.abs(mat) >= 300) {
      const kd = Math.abs(((wk / 8) | 0) - ((bk / 8) | 0)) + Math.abs((wk % 8) - (bk % 8));
      if (mat > 0 && bNP <= 330) sc += CENTER_DIST[bk] * 12 + (14 - kd) * 5;
      if (mat < 0 && wNP <= 330) sc -= CENTER_DIST[wk] * 12 + (14 - kd) * 5;
    }
    return sc * side;
  }

  /* ---------- 같은 판 기억표 ---------- */
  const TT_BITS = 18; const TT_SIZE = 1 << TT_BITS; const TT_MASK = TT_SIZE - 1;
  const T_key = new Int32Array(TT_SIZE); const T_move = new Int32Array(TT_SIZE);
  const T_score = new Int16Array(TT_SIZE); const T_depth = new Int8Array(TT_SIZE); const T_flag = new Int8Array(TT_SIZE);
  const EXACT = 1; const LOWER = 2; const UPPER = 3;
  const killers = new Int32Array(MAXPLY * 2);
  const HISTORY = new Int32Array(13 * 120);

  let nodes = 0; let deadline = 0; let stop = false; let rootSp = 0;

  function repeated() {
    // 지난 수들 가운데 같은 판(차례도 같음)이 있으면 비김으로 봐요
    for (let k = sp - 2; k >= 0 && k >= sp - half; k -= 2) if (HIST1[k] === h1) return true;
    return false;
  }
  function hasPieces() {
    for (let s = 21; s < 99; s++) { const p = bd[s] * side; if (p > P && p < K && bd[s] !== OFF) return true; }
    return false;
  }

  function scoreMoves(base, n, ply, ttMove) {
    for (let k = base; k < base + n; k++) {
      const m = MV[k];
      if (m === ttMove) { SC[k] = 2000000; continue; }
      const f = m & 127; const t = (m >> 7) & 127; const pr = (m >> 14) & 7;
      const cap = bd[t];
      if (cap || ((m >> 17) & 1)) SC[k] = 1000000 + (cap ? VAL[Math.abs(cap)] : 100) * 10 - VAL[Math.abs(bd[f])] / 10;
      else if (pr) SC[k] = 900000 + VAL[pr];
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
    if (ply >= MAXPLY - 1) return sp0;
    if (sp0 >= beta) return sp0;
    if (sp0 > alpha) alpha = sp0;
    const base = ply * 256;
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
    if (ply > 0 && (half >= 100 || repeated())) return 0;
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
        if (fl === EXACT || (fl === LOWER && s >= beta) || (fl === UPPER && s <= alpha)) return s;
      }
    }
    // 널 무브: 한 수 쉬어도 상대가 못 따라오면 여기는 볼 필요 없어요
    if (nullOk && !chk && depth >= 3 && ply > 0 && beta < MATE - 500 && hasPieces() && evaluate() >= beta) {
      makeNull();
      const s = -search(depth - 3, -beta, -beta + 1, ply + 1, false);
      unmakeNull();
      if (stop) return 0;
      if (s >= beta) return beta;
    }
    const base = ply * 256;
    const n = gen(base, false);
    scoreMoves(base, n, ply, ttMove);
    let legal = 0; let best = -INF; let bestMove = 0; const a0 = alpha;
    for (let k = base; k < base + n; k++) {
      const m = pick(k, base + n);
      const f = m & 127; const t = (m >> 7) & 127;
      const quiet = !bd[t] && !((m >> 14) & 7) && !((m >> 17) & 1);
      const mover = bd[f];
      make(m);
      if (inCheck(me)) { unmake(); continue; }
      legal++;
      let sc;
      if (legal === 1) sc = -search(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let red = 0;
        if (legal > 3 && depth >= 3 && quiet && !chk && m !== killers[ply * 2] && m !== killers[ply * 2 + 1] && !inCheck(side)) red = legal > 8 ? 2 : 1;
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
    if (!legal) return chk ? -MATE + ply : 0;
    let ss = best;
    if (ss > MATE - 500) ss += ply; else if (ss < -MATE + 500) ss -= ply;
    T_key[ti] = h2; T_move[ti] = bestMove; T_score[ti] = ss; T_depth[ti] = depth;
    T_flag[ti] = best <= a0 ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  }

  /* ---------- 루트 ---------- */
  function rootMoves() {
    const n = gen(0, false);
    const out = [];
    const me = side;
    for (let k = 0; k < n; k++) { const m = MV[k]; make(m); if (!inCheck(me)) out.push(m); unmake(); }
    return out;
  }
  // 수마다 정확한 점수 (낮은 단계에서 실수를 섞으려고)
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
      // 지난번 가장 좋았던 수부터
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
      if (stop) break;
      if (Math.abs(bestScore) > MATE - 500) break;
      if (Date.now() > deadline - (deadline - startT) * 0.45) break;
    }
    return { m: best, s: bestScore };
  }
  let startT = 0;

  /* ---------- 처음 몇 수는 판마다 다르게 (짧은 정석) ---------- */
  const BOOK = {
    '': ['e2e4', 'd2d4', 'c2c4', 'g1f3'],
    e2e4: ['e7e5', 'c7c5', 'e7e6', 'c7c6'],
    d2d4: ['d7d5', 'g8f6'],
    c2c4: ['e7e5', 'g8f6', 'c7c5'],
    g1f3: ['d7d5', 'g8f6'],
    'e2e4 e7e5': ['g1f3', 'b1c3', 'f1c4'],
    'e2e4 c7c5': ['g1f3', 'b1c3'],
    'e2e4 e7e6': ['d2d4'],
    'e2e4 c7c6': ['d2d4'],
    'd2d4 d7d5': ['c2c4', 'g1f3'],
    'd2d4 g8f6': ['c2c4', 'g1f3'],
    'e2e4 e7e5 g1f3': ['b8c6', 'g8f6'],
    'e2e4 e7e5 f1c4': ['g8f6', 'b8c6'],
    'd2d4 d7d5 c2c4': ['e7e6', 'c7c6'],
    'e2e4 c7c5 g1f3': ['d7d6', 'b8c6', 'e7e6']
  };
  const uci = (m) => R.sqName(m[0]) + R.sqName(m[1]) + (m[2] || '');

  function toRules(m) {
    const f = s64(m & 127); const t = s64((m >> 7) & 127); const pr = (m >> 14) & 7;
    return pr ? [f, t, LETTER[pr]] : [f, t];
  }
  function fromRules(mv) {
    const list = rootMoves();
    return list.find((m) => { const r = toRules(m); return r[0] === mv[0] && r[1] === mv[1] && (r[2] || '') === (mv[2] || ''); }) || 0;
  }

  const LV = {
    1: { depth: 1, noise: 180, random: 0.3 },
    2: { depth: 2, noise: 70, random: 0.05 },
    3: { depth: 3, noise: 25, ms: 600 },
    4: { maxDepth: 7, ms: 1000, book: true },
    5: { maxDepth: 20, ms: 2000, book: true }
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
    // 처음부터 다시 두면서 같은 판 반복 기록도 만들어요
    let st = R.init();
    load(st);
    for (const mv of history) {
      const m = fromRules(mv);
      st = R.play(st, mv);
      if (m) make(m); else load(st);
    }
    const legal = rootMoves();
    if (!legal.length) return null;
    if (legal.length === 1) return toRules(legal[0]);
    if (cfg.book && history.length < 6) {
      const k = history.map(uci).join(' ');
      const opts2 = (BOOK[k] || []).map((u) => legal.find((m) => uci(toRules(m)) === u)).filter(Boolean);
      if (opts2.length) return toRules(opts2[Math.floor(rand() * opts2.length)]);
    }
    if (cfg.random && rand() < cfg.random) return toRules(legal[Math.floor(rand() * legal.length)]);
    nodes = 0; stop = false; startT = Date.now(); rootSp = sp;
    deadline = startT + (cfg.ms || 4000);
    killers.fill(0); HISTORY.fill(0);
    if (cfg.noise) {
      const sc = scoreAll(legal, cfg.depth);
      if (!sc.length) return toRules(legal[0]);
      sc.sort((a, b) => b.s - a.s);
      if (sc[0].s > MATE - 500) return toRules(sc[0].m);   // 체크메이트는 꼭
      let best = sc[0]; let bv = -Infinity;
      for (const x of sc) {
        if (x.s < -MATE + 500 && sc[0].s > -MATE + 500) continue;   // 바로 지는 수는 피해요
        const v = x.s + (rand() * 2 - 1) * cfg.noise;
        if (v > bv) { bv = v; best = x; }
      }
      return toRules(best.m);
    }
    const r = deepen(legal, cfg.maxDepth || 6);
    return toRules(r.m);
  }

  // 시험용: 수 세기
  function perft(d) {
    if (d === 0) return 1;
    const base = (MAXPLY - 1 - d) * 256;
    const n = gen(base, false);
    let c = 0; const me = side;
    for (let k = base; k < base + n; k++) { const m = MV[k]; make(m); if (!inCheck(me)) c += perft(d - 1); unmake(); }
    return c;
  }

  root.BoardAI = root.BoardAI || {};
  root.BoardAI.chess = { choose, _t: { load, perft, evaluate, rootMoves, toRules } };
})(typeof self !== 'undefined' ? self : this);
