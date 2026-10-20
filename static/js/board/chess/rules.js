/* 아리채 오락실 · 체스 규칙 (국제 표준 규칙)
   칸 번호: i = 줄*8 + 칸 (줄 0 = 8번째 줄, 흑 쪽 / 줄 7 = 1번째 줄, 백 쪽)
   말: 백 'KQRBNP' (대문자), 흑 'kqrbnp' (소문자), 빈칸 ''
   자리 0 = 백(먼저), 자리 1 = 흑
   수: [출발, 도착] · 끝줄 승진은 [출발, 도착, 'q'|'r'|'b'|'n']
   비김: 스테일메이트, 50수 규칙(100수 동안 잡기·폰 이동 없음), 같은 모양 3번, 말이 모자라 체크메이트를 못 할 때 */
(function (root) {
  'use strict';

  const START = 'rnbqkbnrpppppppp' + ''.padEnd(32, '.') + 'PPPPPPPPRNBQKBNR';
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const NAMES = { k: '킹', q: '퀸', r: '룩', b: '비숍', n: '나이트', p: '폰' };

  const colorOf = (p) => (!p ? -1 : p === p.toUpperCase() ? 0 : 1);
  const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const sqName = (i) => 'abcdefgh'[i % 8] + (8 - ((i / 8) | 0));

  function init() {
    const b = START.split('').map((ch) => (ch === '.' ? '' : ch));
    const st = { b, turn: 0, castle: 'KQkq', ep: -1, half: 0, n: 0, last: null, cap: '', reps: {} };
    st.reps[key(st)] = 1;
    return st;
  }
  function key(st) { return st.b.map((p) => p || '.').join('') + st.turn + st.castle + st.ep; }

  // sq 칸을 by 쪽이 공격하고 있나요?
  function attacked(b, sq, by) {
    const r = (sq / 8) | 0; const c = sq % 8;
    const P = by === 0 ? 'P' : 'p'; const N = by === 0 ? 'N' : 'n'; const K = by === 0 ? 'K' : 'k';
    const B = by === 0 ? 'B' : 'b'; const R = by === 0 ? 'R' : 'r'; const Q = by === 0 ? 'Q' : 'q';
    const pr = by === 0 ? r + 1 : r - 1;   // 공격하는 폰은 아래(백)·위(흑)에 있어요
    if (on(pr, c - 1) && b[pr * 8 + c - 1] === P) return true;
    if (on(pr, c + 1) && b[pr * 8 + c + 1] === P) return true;
    for (const [dr, dc] of KN) if (on(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === N) return true;
    for (const [dr, dc] of KG) if (on(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === K) return true;
    for (const [dr, dc] of DIAG) {
      let rr = r + dr; let cc = c + dc;
      while (on(rr, cc)) { const p = b[rr * 8 + cc]; if (p) { if (p === B || p === Q) return true; break; } rr += dr; cc += dc; }
    }
    for (const [dr, dc] of ORTH) {
      let rr = r + dr; let cc = c + dc;
      while (on(rr, cc)) { const p = b[rr * 8 + cc]; if (p) { if (p === R || p === Q) return true; break; } rr += dr; cc += dc; }
    }
    return false;
  }
  function kingSq(b, side) { return b.indexOf(side === 0 ? 'K' : 'k'); }
  function inCheck(st, side) { const s = side == null ? st.turn : side; return attacked(st.b, kingSq(st.b, s), 1 - s); }

  function pseudo(st) {
    const out = [];
    const b = st.b; const me = st.turn;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || colorOf(p) !== me) continue;
      const r = (i / 8) | 0; const c = i % 8;
      const t = p.toLowerCase();
      const add = (j) => { const q = b[j]; if (!q || colorOf(q) !== me) out.push([i, j]); };
      if (t === 'p') {
        const dir = me === 0 ? -1 : 1; const startRow = me === 0 ? 6 : 1; const lastRow = me === 0 ? 0 : 7;
        const push = (j) => { if (((j / 8) | 0) === lastRow) ['q', 'r', 'b', 'n'].forEach((x) => out.push([i, j, x])); else out.push([i, j]); };
        const f = (r + dir) * 8 + c;
        if (on(r + dir, c) && !b[f]) {
          push(f);
          const f2 = (r + 2 * dir) * 8 + c;
          if (r === startRow && !b[f2]) out.push([i, f2]);
        }
        for (const dc of [-1, 1]) {
          if (!on(r + dir, c + dc)) continue;
          const j = (r + dir) * 8 + c + dc;
          if ((b[j] && colorOf(b[j]) !== me) || j === st.ep) push(j);
        }
      } else if (t === 'n') {
        for (const [dr, dc] of KN) if (on(r + dr, c + dc)) add((r + dr) * 8 + c + dc);
      } else if (t === 'k') {
        for (const [dr, dc] of KG) if (on(r + dr, c + dc)) add((r + dr) * 8 + c + dc);
        // 캐슬링: 킹·룩이 처음 자리, 사이가 비고, 킹이 지나는 칸이 공격받지 않아야
        const home = me === 0 ? 60 : 4;
        if (i === home && !attacked(b, home, 1 - me)) {
          const ks = me === 0 ? 'K' : 'k'; const qs = me === 0 ? 'Q' : 'q';
          if (st.castle.includes(ks) && !b[home + 1] && !b[home + 2] && b[home + 3] === (me === 0 ? 'R' : 'r') &&
            !attacked(b, home + 1, 1 - me) && !attacked(b, home + 2, 1 - me)) out.push([home, home + 2]);
          if (st.castle.includes(qs) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === (me === 0 ? 'R' : 'r') &&
            !attacked(b, home - 1, 1 - me) && !attacked(b, home - 2, 1 - me)) out.push([home, home - 2]);
        }
      } else {
        const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH);
        for (const [dr, dc] of dirs) {
          let rr = r + dr; let cc = c + dc;
          while (on(rr, cc)) {
            const j = rr * 8 + cc;
            if (b[j]) { if (colorOf(b[j]) !== me) out.push([i, j]); break; }
            out.push([i, j]);
            rr += dr; cc += dc;
          }
        }
      }
    }
    return out;
  }

  // 말판만 바꿔요 (검사용 · play 공용)
  function applyBoard(b, m, ep) {
    const nb = b.slice();
    const [f, t, promo] = m;
    const p = nb[f];
    const me = colorOf(p);
    let cap = nb[t];
    if (p.toLowerCase() === 'p' && t === ep && !cap) {
      const capSq = t + (me === 0 ? 8 : -8);
      cap = nb[capSq]; nb[capSq] = '';
    }
    nb[t] = promo ? (me === 0 ? promo.toUpperCase() : promo) : p;
    nb[f] = '';
    if (p.toLowerCase() === 'k' && Math.abs(t - f) === 2) {
      if (t > f) { nb[f + 1] = nb[f + 3]; nb[f + 3] = ''; } else { nb[f - 1] = nb[f - 4]; nb[f - 4] = ''; }
    }
    return { nb, cap };
  }

  function legalMoves(st) {
    const me = st.turn;
    return pseudo(st).filter((m) => {
      const { nb } = applyBoard(st.b, m, st.ep);
      return !attacked(nb, kingSq(nb, me), 1 - me);
    });
  }
  function moves(st) { return result(st) ? [] : legalMoves(st); }

  function play(st, m) {
    const [f, t] = m;
    const p = st.b[f];
    const me = st.turn;
    const { nb, cap } = applyBoard(st.b, m, st.ep);
    let castle = st.castle;
    const drop = (ch) => { castle = castle.replace(ch, ''); };
    if (p === 'K') { drop('K'); drop('Q'); }
    if (p === 'k') { drop('k'); drop('q'); }
    if (f === 63 || t === 63) drop('K');
    if (f === 56 || t === 56) drop('Q');
    if (f === 7 || t === 7) drop('k');
    if (f === 0 || t === 0) drop('q');
    const pawn = p.toLowerCase() === 'p';
    const ep = pawn && Math.abs(t - f) === 16 ? (f + t) / 2 : -1;
    const ns = { b: nb, turn: 1 - me, castle, ep, half: pawn || cap ? 0 : st.half + 1, n: st.n + 1, last: [f, t], cap: cap || '', reps: Object.assign({}, st.reps) };
    const k = key(ns);
    ns.reps[k] = (ns.reps[k] || 0) + 1;
    ns.repeat = ns.reps[k];
    return ns;
  }
  function turn(st) { return st.turn; }

  // 체크메이트를 할 수 없을 만큼 말이 적으면 비김
  function insufficient(b) {
    const rest = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || p.toLowerCase() === 'k') continue;
      const t = p.toLowerCase();
      if (t === 'p' || t === 'r' || t === 'q') return false;
      rest.push([t, i]);
    }
    if (rest.length <= 1) return true;
    // 비숍만 남았고 모두 같은 색 칸이면 비김
    if (rest.every(([t]) => t === 'b')) {
      const col = (i) => (((i / 8) | 0) + (i % 8)) % 2;
      return rest.every(([, i]) => col(i) === col(rest[0][1]));
    }
    return false;
  }

  function result(st) {
    if (st._res !== undefined) return st._res;
    let r = null;
    const any = legalMoves(st).length > 0;
    if (!any) {
      r = inCheck(st) ? { winner: 1 - st.turn, note: '체크메이트!' } : { winner: -1, note: '스테일메이트 — 움직일 수 없어서 비겼어요' };
    } else if (st.repeat >= 3) r = { winner: -1, note: '같은 모양이 세 번 나와서 비겼어요' };
    else if (st.half >= 100) r = { winner: -1, note: '50수 동안 잡지도, 폰을 움직이지도 않아서 비겼어요' };
    else if (insufficient(st.b)) r = { winner: -1, note: '체크메이트를 할 말이 모자라서 비겼어요' };
    Object.defineProperty(st, '_res', { value: r, enumerable: false });
    return r;
  }

  root.BoardRules = root.BoardRules || {};
  root.BoardRules.chess = { init, key, colorOf, attacked, inCheck, pseudo, legalMoves, moves, play, turn, result, sqName, NAMES, applyBoard };
})(typeof self !== 'undefined' ? self : this);
