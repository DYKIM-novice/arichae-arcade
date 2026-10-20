/* 아리채 오락실 · 바둑 규칙 (9줄 'go9' · 13줄 'go13')
   점 번호: i = 줄*N + 칸 (줄 0 = 맨 위)  ·  자리 0 = 흑(먼저), 자리 1 = 백(덤 6.5집)
   수: 점 번호, 패스는 -1
   - 상대 돌을 둘러싸 숨(빈 이웃)이 없으면 따내요
   - 스스로 숨이 막히는 자리(자충수)는 못 둬요 · 패: 방금 따낸 한 점을 바로 되따낼 수 없어요
   - 둘 다 연달아 패스하면 끝 → 집 계산 (중국식: 살아 있는 돌 + 둘러싼 빈 곳, 백 +6.5)
     죽은 돌은 컴퓨터가 끝까지 대신 둬 보고(몬테카를로) 판단해요. 같은 판이면 언제나 같은 결과예요
   이 파일에는 AI 도 같이 쓰는 빠른 바둑판(FastBoard)이 들어 있어요 */
(function (root) {
  'use strict';

  const KOMI = 6.5;

  /* ================= 빠른 바둑판 (가장자리 한 줄씩 넓힌 1차원 배열) ================= */
  function FastBoard(N) {
    const S = N + 2; const SZ = S * S;
    const EMPTY = 0; const BORDER = 3;
    const color = new Int8Array(SZ);
    const head = new Int16Array(SZ); const next = new Int16Array(SZ);
    const size = new Int16Array(SZ); const plib = new Int16Array(SZ);
    const lsum = new Int32Array(SZ); const lsum2 = new Float64Array(SZ);
    const DIRS = [-S, -1, 1, S];
    const DIAG = [-S - 1, -S + 1, S - 1, S + 1];
    const empties = new Int16Array(N * N); const epos = new Int16Array(SZ); let ne = 0;
    let ko = 0; let toPlay = 1; let passes = 0; let moves = 0;
    let lastMove = 0; let caps = [0, 0, 0];
    const pts = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) pts.push((r + 1) * S + c + 1);
    const toPad = (i) => (((i / N) | 0) + 1) * S + (i % N) + 1;
    const toIdx = (p) => ((p / S) | 0) * N - N + (p % S) - 1;

    function clear() {
      color.fill(BORDER);
      ne = 0;
      for (const p of pts) { color[p] = EMPTY; epos[p] = ne; empties[ne++] = p; }
      ko = 0; toPlay = 1; passes = 0; moves = 0; lastMove = 0; caps = [0, 0, 0];
    }
    function removeEmpty(p) { const k = epos[p]; const q = empties[--ne]; empties[k] = q; epos[q] = k; }
    function addEmpty(p) { epos[p] = ne; empties[ne++] = p; }
    function addLib(h, p) { plib[h]++; lsum[h] += p; lsum2[h] += p * p; }
    function subLib(h, p) { plib[h]--; lsum[h] -= p; lsum2[h] -= p * p; }
    const inAtari = (h) => plib[h] > 0 && plib[h] * lsum2[h] === lsum[h] * lsum[h];
    const atariLib = (h) => lsum[h] / plib[h];

    // c 가 p 에 둘 수 있나요? (빈 곳·패·자충수)
    function legal(p, c) {
      if (color[p] !== EMPTY || p === ko) return false;
      const o = 3 - c;
      for (let k = 0; k < 4; k++) {
        const q = p + DIRS[k]; const cq = color[q];
        if (cq === EMPTY) return true;
        if (cq === c) { if (!(plib[head[q]] === 1)) { /* 숨이 하나 넘게 남으면 OK */ if (!inAtari(head[q])) return true; } }
        else if (cq === o && inAtari(head[q])) return true;
      }
      return false;
    }
    // 내 눈(eye) 같은 자리: 네 이웃이 모두 내 돌(또는 바깥)이고 대각선에 상대가 적어요
    function eyeish(p, c) {
      for (let k = 0; k < 4; k++) { const cq = color[p + DIRS[k]]; if (cq !== c && cq !== BORDER) return false; }
      let bad = 0; let edge = 0;
      for (let k = 0; k < 4; k++) { const cq = color[p + DIAG[k]]; if (cq === BORDER) edge = 1; else if (cq === 3 - c) bad++; }
      return bad + edge < 2;
    }
    function removeChain(h) {
      let s = h; let n = 0;
      do {
        color[s] = EMPTY; addEmpty(s); n++;
        s = next[s];
      } while (s !== h);
      // 이웃 사슬에 숨 돌려주기
      s = h;
      do {
        const nx = next[s];
        for (let k = 0; k < 4; k++) { const q = s + DIRS[k]; const cq = color[q]; if (cq === 1 || cq === 2) addLib(head[q], s); }
        s = nx;
      } while (s !== h);
      return n;
    }
    // 둬요 (legal 을 먼저 확인했다고 봐요). 따낸 돌 수를 돌려줘요
    function play(p, c) {
      if (p === 0) { ko = 0; passes++; toPlay = 3 - c; moves++; lastMove = 0; return 0; }
      passes = 0;
      const o = 3 - c;
      color[p] = c; head[p] = p; next[p] = p; size[p] = 1; plib[p] = 0; lsum[p] = 0; lsum2[p] = 0;
      removeEmpty(p);
      for (let k = 0; k < 4; k++) {
        const q = p + DIRS[k]; const cq = color[q];
        if (cq === EMPTY) addLib(p, q);
        else if (cq === 1 || cq === 2) subLib(head[q], p);
      }
      // 같은 편과 잇기
      for (let k = 0; k < 4; k++) {
        const q = p + DIRS[k];
        if (color[q] !== c) continue;
        const a = head[p]; const b = head[q];
        if (a === b) continue;
        const big = size[a] >= size[b] ? a : b; const small = big === a ? b : a;
        let s = small;
        do { head[s] = big; s = next[s]; } while (s !== small);
        const t = next[big]; next[big] = next[small]; next[small] = t;
        size[big] += size[small]; plib[big] += plib[small]; lsum[big] += lsum[small]; lsum2[big] += lsum2[small];
      }
      // 따내기
      let captured = 0; let capAt = 0;
      for (let k = 0; k < 4; k++) {
        const q = p + DIRS[k];
        if (color[q] === o && plib[head[q]] === 0) { capAt = q; captured += removeChain(head[q]); }
      }
      caps[c] += captured;
      const h = head[p];
      ko = (captured === 1 && size[h] === 1 && plib[h] === 1 && inAtari(h)) ? capAt : 0;
      toPlay = o; moves++; lastMove = p;
      return captured;
    }

    /* ---------- 끝까지 대신 두기 (몬테카를로) ---------- */
    function capturesAround(last, c, out) {
      // last 근처에서 단수(숨 1)인 상대 사슬을 잡는 자리
      let n = 0;
      for (let k = 0; k < 4; k++) {
        const q = last + DIRS[k];
        if (color[q] === 3 - c) { const h = head[q]; if (plib[h] && inAtari(h)) out[n++] = atariLib(h); }
      }
      return n;
    }
    const tmp = new Int16Array(8);
    function selfAtariBig(p, c) {
      // 4점 넘는 내 사슬을 단수로 만드는 수는 피해요 (대충)
      let libs = 0; let big = 0;
      for (let k = 0; k < 4; k++) {
        const q = p + DIRS[k]; const cq = color[q];
        if (cq === EMPTY) libs++;
        else if (cq === c) { const h = head[q]; if (plib[h] > 2 || !inAtari(h)) libs += 2; big += size[h]; }
      }
      return libs < 2 && big >= 4;
    }
    function pickMove(c, rand) {
      if (lastMove) {
        // 1) 상대 마지막 수 옆 단수 사슬 잡기
        const n = capturesAround(lastMove, c, tmp);
        for (let k = 0; k < n; k++) if (legal(tmp[k], c)) return tmp[k];
        // 2) 내 사슬이 단수면 늘어서 살리기
        for (let k = 0; k < 4; k++) {
          const q = lastMove + DIRS[k];
          if (color[q] === c) {
            const h = head[q];
            if (inAtari(h)) {
              const l = atariLib(h);
              if (legal(l, c)) {
                let gain = 0;
                for (let j = 0; j < 4; j++) if (color[l + DIRS[j]] === EMPTY) gain++;
                if (gain >= 2) return l;
              }
            }
          }
        }
      }
      // 3) 아무 데나 (내 눈은 메우지 않기)
      let tries = ne;
      let k = (rand() * ne) | 0;
      while (tries-- > 0) {
        const p = empties[k];
        if (legal(p, c) && !eyeish(p, c) && !selfAtariBig(p, c)) return p;
        k++; if (k >= ne) k = 0;
      }
      return 0;
    }
    // 지금부터 끝까지 둬요. amaf: 처음 둔 색 기록(없으면 생략). 돌려주는 값: 흑 점수 - 백 점수 (덤 포함)
    function playout(rand, amaf, limit) {
      const lim = limit || N * N * 3;
      while (passes < 2 && moves < lim) {
        const c = toPlay;
        const p = pickMove(c, rand);
        if (p && amaf && !amaf[p]) amaf[p] = c;
        play(p, c);
      }
      return areaScore();
    }
    function areaScore() {
      let s = 0;
      for (const p of pts) {
        const cp = color[p];
        if (cp === 1) s++; else if (cp === 2) s--;
        else {
          let b = 0; let w = 0;
          for (let k = 0; k < 4; k++) { const cq = color[p + DIRS[k]]; if (cq === 1) b++; else if (cq === 2) w++; }
          if (b && !w) s++; else if (w && !b) s--;
        }
      }
      return s - KOMI;
    }
    function copyFrom(o) {
      color.set(o.color); head.set(o.head); next.set(o.next); size.set(o.size); plib.set(o.plib); lsum.set(o.lsum); lsum2.set(o.lsum2);
      empties.set(o.empties); epos.set(o.epos);
      const st = o.state();
      ne = st.ne; ko = st.ko; toPlay = st.toPlay; passes = st.passes; moves = st.moves; lastMove = st.lastMove; caps = st.caps.slice();
    }
    function state() { return { ne, ko, toPlay, passes, moves, lastMove, caps }; }
    function setState(x) { ko = x.ko; toPlay = x.toPlay; passes = x.passes; moves = x.moves; lastMove = x.lastMove; }

    return {
      N, S, SZ, pts, color, head, next, size, plib, lsum, lsum2, empties, epos, DIRS, DIAG,
      clear, legal, play, eyeish, playout, areaScore, copyFrom, state, setState, toPad, toIdx, inAtari, atariLib, pickMove, selfAtariBig,
      get ne() { return ne; }, get toPlay() { return toPlay; }, get ko() { return ko; }, get passes() { return passes; },
      get moves() { return moves; }, get lastMove() { return lastMove; }
    };
  }

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================= 화면용 규칙 (상태를 바꾸지 않고 새로 만들어요) ================= */
  function make(N, id) {
    const LIMIT = N === 9 ? 200 : 360;     // 이만큼 두면 저절로 끝나고 계가
    const STAR = N === 9 ? [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]] : [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6], [3, 6], [6, 3], [6, 9], [9, 6]];
    const NB = Array.from({ length: N * N }, (_, i) => {
      const r = (i / N) | 0; const c = i % N; const o = [];
      if (r > 0) o.push(i - N); if (r < N - 1) o.push(i + N); if (c > 0) o.push(i - 1); if (c < N - 1) o.push(i + 1);
      return o;
    });
    const fb = FastBoard(N);
    const scoreCache = new Map();

    function init() { return { N, b: new Array(N * N).fill(0), turn: 0, ko: -1, passes: 0, n: 0, caps: [0, 0], last: null, lastCap: [] }; }
    function group(b, i) {
      const c = b[i]; const seen = new Set([i]); const stack = [i]; const libs = new Set();
      while (stack.length) {
        const x = stack.pop();
        for (const y of NB[x]) {
          if (b[y] === 0) libs.add(y);
          else if (b[y] === c && !seen.has(y)) { seen.add(y); stack.push(y); }
        }
      }
      return { stones: [...seen], libs };
    }
    // 두면 어떻게 되는지 (안 되면 null)
    function tryPlay(st, i) {
      if (i < 0) return { b: st.b, caps: [], ko: -1 };
      if (st.b[i] || i === st.ko) return null;
      const me = st.turn + 1; const op = 3 - me;
      const b = st.b.slice(); b[i] = me;
      const caps = [];
      for (const j of NB[i]) {
        if (b[j] === op) { const g = group(b, j); if (!g.libs.size) g.stones.forEach((s) => { if (b[s]) { b[s] = 0; caps.push(s); } }); }
      }
      const mine = group(b, i);
      if (!mine.libs.size) return null;     // 자충수
      const ko = caps.length === 1 && mine.stones.length === 1 && mine.libs.size === 1 ? caps[0] : -1;
      return { b, caps, ko };
    }
    function legal(st, i) { return i < 0 || !!tryPlay(st, i); }
    function moves(st) {
      if (result(st)) return [];
      const out = [];
      for (let i = 0; i < N * N; i++) if (!st.b[i] && tryPlay(st, i)) out.push(i);
      out.push(-1);
      return out;
    }
    function play(st, m) {
      const r = tryPlay(st, m);
      const caps = st.caps.slice();
      if (m >= 0) caps[st.turn] += r.caps.length;
      return { N, b: r.b, turn: 1 - st.turn, ko: r.ko, passes: m < 0 ? st.passes + 1 : 0, n: st.n + 1, caps, last: m, lastCap: m >= 0 ? r.caps : [] };
    }
    function turn(st) { return st.turn; }

    /* ---------- 계가 ---------- */
    // 죽은 돌 판단: 같은 판에서 시작해 끝까지 여러 번 둬 보고, 그 돌 자리가 주로 누구 땅이 되는지 봐요
    function ownership(st, count) {
      const own = new Float64Array(N * N);
      let h = 2166136261;
      for (let i = 0; i < N * N; i++) { h ^= st.b[i] + i * 3; h = Math.imul(h, 16777619); }
      const rand = rng(h ^ (st.turn * 7919));
      const K = count || (N === 9 ? 500 : 360);
      for (let k = 0; k < K; k++) {
        load(st);
        fb.playout(rand, null, fb.moves + N * N * 3);
        for (let i = 0; i < N * N; i++) {
          const p = fb.toPad(i); const c = fb.color[p];
          if (c === 1) own[i]++; else if (c === 2) own[i]--;
          else {
            let bb = 0; let ww = 0;
            for (const d of fb.DIRS) { const cq = fb.color[p + d]; if (cq === 1) bb++; else if (cq === 2) ww++; }
            if (bb && !ww) own[i]++; else if (ww && !bb) own[i]--;
          }
        }
      }
      for (let i = 0; i < N * N; i++) own[i] /= K;
      return own;
    }
    function load(st) {
      fb.clear();
      for (let i = 0; i < N * N; i++) if (st.b[i]) fb.play(fb.toPad(i), st.b[i]);
      fb.setState({ ko: st.ko >= 0 ? fb.toPad(st.ko) : 0, toPlay: st.turn + 1, passes: 0, moves: 0, lastMove: 0 });
    }
    function score(st) {
      const key = st.b.join('') + st.turn;
      if (scoreCache.has(key)) return scoreCache.get(key);
      const own = ownership(st);
      const dead = new Array(N * N).fill(false);
      const seen = new Set();
      for (let i = 0; i < N * N; i++) {
        if (!st.b[i] || seen.has(i)) continue;
        const g = group(st.b, i);
        g.stones.forEach((s) => seen.add(s));
        const avg = g.stones.reduce((a, s) => a + own[s], 0) / g.stones.length;
        const sign = st.b[i] === 1 ? 1 : -1;
        if (avg * sign < -0.2) g.stones.forEach((s) => { dead[s] = true; });
      }
      // 죽은 돌을 들어낸 판에서 빈 곳 나누기
      const b = st.b.map((v, i) => (dead[i] ? 0 : v));
      const owner = new Array(N * N).fill(0);
      const done = new Array(N * N).fill(false);
      for (let i = 0; i < N * N; i++) {
        if (b[i]) { owner[i] = b[i]; continue; }
        if (done[i]) continue;
        const region = []; const stack = [i]; done[i] = true; let tb = false; let tw = false;
        while (stack.length) {
          const x = stack.pop(); region.push(x);
          for (const y of NB[x]) {
            if (b[y] === 1) tb = true; else if (b[y] === 2) tw = true;
            else if (!done[y]) { done[y] = true; stack.push(y); }
          }
        }
        region.forEach((x) => {
          if (tb && !tw) owner[x] = 1;
          else if (tw && !tb) owner[x] = 2;
          else owner[x] = own[x] > 0.6 ? 1 : own[x] < -0.6 ? 2 : 0;   // 아직 덜 막힌 곳은 끝까지 둬 본 결과로
        });
      }
      let black = 0; let white = KOMI;
      owner.forEach((o) => { if (o === 1) black++; else if (o === 2) white++; });
      const res = { black, white, owner, dead };
      scoreCache.set(key, res);
      if (scoreCache.size > 30) scoreCache.delete(scoreCache.keys().next().value);
      return res;
    }
    function result(st) {
      if (st.passes < 2 && st.n < LIMIT) return null;
      if (st._res) return st._res;
      const s = score(st);
      const r = {
        winner: s.black > s.white ? 0 : 1,
        score: [`흑 ${s.black}`, `백 ${s.white}`],
        note: `${st.passes >= 2 ? '둘 다 패스해서 끝났어요' : `${LIMIT}수가 넘어서 끝났어요`} · ${Math.abs(s.black - s.white)}집 차이 (백 덤 6.5 포함)`
      };
      Object.defineProperty(st, '_res', { value: r, enumerable: false });
      return r;
    }
    const R = { id, N, KOMI, LIMIT, STAR, NB, init, group, tryPlay, legal, moves, play, turn, result, score, ownership, FastBoard, rng, load, fb };
    root.BoardRules = root.BoardRules || {};
    root.BoardRules[id] = R;
    return R;
  }
  make(9, 'go9');
  make(13, 'go13');
})(typeof self !== 'undefined' ? self : this);
