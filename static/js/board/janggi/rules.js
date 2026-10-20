/* 아리채 오락실 · 장기 규칙 (대한장기협회 규칙을 따르되 빅장은 없어요)
   점 번호: i = 줄*9 + 칸 (줄 0 = 맨 위, 한 쪽 / 줄 9 = 맨 아래, 초 쪽)
   말: 초(자리 0, 먼저, 아래) 대문자 / 한(자리 1, 위) 소문자
       K 궁  A 사  R 차  C 포  H 마  E 상  P 졸(병)
   1) 상차림: 초가 먼저, 다음에 한이 마·상 자리를 골라요  — 수: {s: 0~3}
   2) 대국: 수 [출발, 도착] · 둘 수가 하나도 없고 장군이 아니면 'pass'(한 수 쉼)
   끝: 외통(장군인데 피할 수 없음) → 승리
       200수가 넘거나, 100수 동안 잡기가 없거나, 둘 다 쉬면 → 남은 말 점수로 승부 (한 +1.5 덤)
       점수: 차 13 · 포 7 · 마 5 · 상 3 · 사 3 · 졸 2 */
(function (root) {
  'use strict';

  const W = 9; const H = 10;
  const LIMIT = 200; const QUIET = 100;
  const VALUE = { R: 13, C: 7, H: 5, E: 3, A: 3, P: 2, K: 0 };
  const DEOM = 1.5;
  // 상차림 (내 왼쪽 → 오른쪽, 칸 1·2·6·7 자리)
  const SETUPS = [
    { name: '마상마상', p: ['H', 'E', 'H', 'E'] },
    { name: '상마상마', p: ['E', 'H', 'E', 'H'] },
    { name: '마상상마', p: ['H', 'E', 'E', 'H'] },
    { name: '상마마상', p: ['E', 'H', 'H', 'E'] }
  ];
  const NAMES = { K: '궁', A: '사', R: '차', C: '포', H: '마', E: '상', P: '졸' };
  const HANJA = { K: ['楚', '漢'], A: ['士', '士'], R: ['車', '車'], C: ['包', '包'], H: ['馬', '馬'], E: ['象', '象'], P: ['卒', '兵'] };

  const idx = (r, c) => r * W + c;
  const rc = (i) => [(i / W) | 0, i % W];
  const on = (r, c) => r >= 0 && r < H && c >= 0 && c < W;
  const side = (p) => (!p ? -1 : p === p.toUpperCase() ? 0 : 1);
  const kind = (p) => p.toUpperCase();

  // 궁성: 0 = 초(아래, 줄 7~9) / 1 = 한(위, 줄 0~2)
  function inPalace(i, who) {
    const [r, c] = rc(i);
    if (c < 3 || c > 5) return false;
    return who === 0 ? r >= 7 : who === 1 ? r <= 2 : (r >= 7 || r <= 2);
  }
  // 궁성 대각선: 가운데 ↔ 네 귀퉁이
  const DIAG_NB = Array.from({ length: W * H }, () => []);
  const DIAG_LINES = [];   // [귀퉁이, 가운데, 맞은편 귀퉁이]
  [0, 7].forEach((t) => {
    const ctr = idx(t + 1, 4);
    const cs = [idx(t, 3), idx(t, 5), idx(t + 2, 5), idx(t + 2, 3)];
    cs.forEach((k) => { DIAG_NB[k].push(ctr); DIAG_NB[ctr].push(k); });
    DIAG_LINES.push([cs[0], ctr, cs[2]], [cs[2], ctr, cs[0]], [cs[1], ctr, cs[3]], [cs[3], ctr, cs[1]]);
  });
  const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const HORSE = [[[-1, 0], [[-2, -1], [-2, 1]]], [[1, 0], [[2, -1], [2, 1]]], [[0, -1], [[-1, -2], [1, -2]]], [[0, 1], [[-1, 2], [1, 2]]]];

  function init() {
    const b = new Array(W * H).fill('');
    const put = (r, c, p) => { b[idx(r, c)] = p; };
    // 초 (아래)
    put(9, 0, 'R'); put(9, 8, 'R'); put(9, 3, 'A'); put(9, 5, 'A'); put(8, 4, 'K');
    put(7, 1, 'C'); put(7, 7, 'C'); [0, 2, 4, 6, 8].forEach((c) => put(6, c, 'P'));
    // 한 (위)
    put(0, 0, 'r'); put(0, 8, 'r'); put(0, 3, 'a'); put(0, 5, 'a'); put(1, 4, 'k');
    put(2, 1, 'c'); put(2, 7, 'c'); [0, 2, 4, 6, 8].forEach((c) => put(3, c, 'p'));
    return { b, turn: 0, phase: 'setup', setups: [-1, -1], n: 0, quiet: 0, last: null, cap: '', passes: 0, escaped: false };
  }
  function applySetup(b, who, s) {
    const pat = SETUPS[s].p;
    const cols = who === 0 ? [1, 2, 6, 7] : [7, 6, 2, 1];
    const r = who === 0 ? 9 : 0;
    cols.forEach((c, k) => { b[idx(r, c)] = who === 0 ? pat[k] : pat[k].toLowerCase(); });
  }

  // 한 말이 갈 수 있는 곳 (자기 궁이 장군인지는 따지지 않아요)
  function targets(b, i) {
    const p = b[i]; const me = side(p); const k = kind(p);
    const [r, c] = rc(i);
    const out = [];
    const can = (j) => !b[j] || side(b[j]) !== me;
    if (k === 'K' || k === 'A') {
      for (const [dr, dc] of ORTH) { if (!on(r + dr, c + dc)) continue; const j = idx(r + dr, c + dc); if (inPalace(j, me) && can(j)) out.push(j); }
      for (const j of DIAG_NB[i]) if (inPalace(j, me) && can(j)) out.push(j);
    } else if (k === 'R') {
      for (const [dr, dc] of ORTH) {
        let rr = r + dr; let cc = c + dc;
        while (on(rr, cc)) { const j = idx(rr, cc); if (b[j]) { if (side(b[j]) !== me) out.push(j); break; } out.push(j); rr += dr; cc += dc; }
      }
      for (const L of DIAG_LINES) {
        if (L[0] !== i && L[1] !== i) continue;
        for (let s = L.indexOf(i) + 1; s < 3; s++) { const j = L[s]; if (b[j]) { if (side(b[j]) !== me) out.push(j); break; } out.push(j); }
      }
    } else if (k === 'C') {
      for (const [dr, dc] of ORTH) {
        let rr = r + dr; let cc = c + dc; let jumped = false;
        while (on(rr, cc)) {
          const j = idx(rr, cc);
          if (!jumped) {
            if (b[j]) { if (kind(b[j]) === 'C') break; jumped = true; }
          } else if (!b[j]) out.push(j);
          else { if (side(b[j]) !== me && kind(b[j]) !== 'C') out.push(j); break; }
          rr += dr; cc += dc;
        }
      }
      for (const L of DIAG_LINES) {
        if (L[0] !== i) continue;
        const mid = b[L[1]]; const j = L[2];
        if (mid && kind(mid) !== 'C' && (!b[j] || (side(b[j]) !== me && kind(b[j]) !== 'C'))) out.push(j);
      }
    } else if (k === 'H') {
      for (const [[lr, lc], dests] of HORSE) {
        if (!on(r + lr, c + lc) || b[idx(r + lr, c + lc)]) continue;
        for (const [dr, dc] of dests) if (on(r + dr, c + dc) && can(idx(r + dr, c + dc))) out.push(idx(r + dr, c + dc));
      }
    } else if (k === 'E') {
      for (const [[lr, lc], dests] of HORSE) {
        if (!on(r + lr, c + lc) || b[idx(r + lr, c + lc)]) continue;
        for (const [dr, dc] of dests) {
          // 상: 한 칸 곧게 → 대각선 두 칸 (중간 두 점이 비어야)
          const mr = r + dr; const mc = c + dc;
          const er = r + dr + (dr - lr); const ec = c + dc + (dc - lc);
          if (!on(mr, mc) || b[idx(mr, mc)] || !on(er, ec)) continue;
          if (can(idx(er, ec))) out.push(idx(er, ec));
        }
      }
    } else if (k === 'P') {
      const fwd = me === 0 ? -1 : 1;
      for (const [dr, dc] of [[fwd, 0], [0, -1], [0, 1]]) if (on(r + dr, c + dc) && can(idx(r + dr, c + dc))) out.push(idx(r + dr, c + dc));
      // 상대 궁성 안에서는 대각선 앞으로
      for (const j of DIAG_NB[i]) if (inPalace(j, 1 - me) && inPalace(i, 1 - me) && Math.sign(rc(j)[0] - r) === fwd && can(j)) out.push(j);
    }
    return out;
  }

  function attacked(b, sq, by) {
    for (let i = 0; i < W * H; i++) if (b[i] && side(b[i]) === by && targets(b, i).includes(sq)) return true;
    return false;
  }
  function kingSq(b, who) { return b.indexOf(who === 0 ? 'K' : 'k'); }
  function inCheck(st, who) { const w = who == null ? st.turn : who; const k = kingSq(st.b, w); return k >= 0 && attacked(st.b, k, 1 - w); }

  function legalMoves(st) {
    const out = [];
    const me = st.turn;
    for (let i = 0; i < W * H; i++) {
      if (!st.b[i] || side(st.b[i]) !== me) continue;
      for (const j of targets(st.b, i)) {
        const nb = st.b.slice(); nb[j] = nb[i]; nb[i] = '';
        if (!attacked(nb, kingSq(nb, me), 1 - me)) out.push([i, j]);
      }
    }
    return out;
  }
  function moves(st) {
    if (result(st)) return [];
    if (st.phase === 'setup') return [0, 1, 2, 3].map((s) => ({ s }));
    const ms = legalMoves(st);
    return ms.length ? ms : ['pass'];
  }

  function play(st, m) {
    if (st.phase === 'setup') {
      const b = st.b.slice();
      applySetup(b, st.turn, m.s);
      const setups = st.setups.slice(); setups[st.turn] = m.s;
      const done = setups[0] >= 0 && setups[1] >= 0;
      return { b, turn: done ? 0 : 1 - st.turn, phase: done ? 'play' : 'setup', setups, n: 0, quiet: 0, last: null, cap: '', passes: 0, escaped: false };
    }
    const wasCheck = inCheck(st);
    if (m === 'pass') return Object.assign({}, st, { turn: 1 - st.turn, n: st.n + 1, quiet: st.quiet + 1, last: null, cap: '', passes: st.passes + 1, escaped: false });
    const b = st.b.slice();
    const cap = b[m[1]];
    b[m[1]] = b[m[0]]; b[m[0]] = '';
    return { b, turn: 1 - st.turn, phase: 'play', setups: st.setups, n: st.n + 1, quiet: cap ? 0 : st.quiet + 1, last: [m[0], m[1]], cap, passes: 0, escaped: wasCheck };
  }
  function turn(st) { return st.turn; }

  function points(b) {
    const s = [0, DEOM];
    b.forEach((p) => { if (p) s[side(p)] += VALUE[kind(p)]; });
    return s;
  }
  function byPoints(st, why) {
    const [a, h] = points(st.b);
    return { winner: a > h ? 0 : 1, score: [`초 ${a}`, `한 ${h}`], note: `${why} — 남은 말 점수로 승부 (한 덤 1.5)` };
  }
  function result(st) {
    if (st.phase === 'setup') return null;
    if (st._res !== undefined) return st._res;
    let r = null;
    if (!legalMoves(st).length && inCheck(st)) r = { winner: 1 - st.turn, note: '외통! 궁이 피할 곳이 없어요' };
    else if (st.passes >= 2) r = byPoints(st, '둘 다 둘 수가 없어서');
    else if (st.n >= LIMIT) r = byPoints(st, `${LIMIT}수가 넘어서`);
    else if (st.quiet >= QUIET) r = byPoints(st, `${QUIET}수 동안 잡지 않아서`);
    Object.defineProperty(st, '_res', { value: r, enumerable: false, writable: true });
    return r;
  }

  root.BoardRules = root.BoardRules || {};
  root.BoardRules.janggi = {
    W, H, LIMIT, QUIET, VALUE, SETUPS, NAMES, HANJA, DIAG_LINES, DIAG_NB,
    idx, rc, side, kind, inPalace, init, applySetup, targets, attacked, inCheck, legalMoves, moves, play, turn, points, result
  };
})(typeof self !== 'undefined' ? self : this);
