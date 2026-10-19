/* 아리채 오락실 · 체커(영국식 드래프트) 규칙
   8×8 판의 어두운 칸만 써요. 흑(자리 0)은 아래에서 위로, 적(자리 1)은 위에서 아래로.
   - 말은 대각선 앞으로 한 칸. 상대 말을 뛰어넘으면 잡아요 (잡을 수 있으면 꼭 잡아야 해요, 연속으로 계속)
   - 끝 줄에 닿으면 왕(king)이 되어 뒤로도 움직여요 (잡다가 왕이 되면 거기서 멈춰요)
   - 움직일 수 없으면 져요. 잡지도 않고 말도 안 움직인 채 40수씩(80수) 지나면 무승부
   칸 번호 = 줄*8+칸, 말: 1 흑, 2 흑 왕, 3 적, 4 적 왕 */
(function (root) {
  'use strict';

  const N = 8;
  function init() {
    const b = new Array(64).fill(0);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 !== 1) continue;
      if (r <= 2) b[r * 8 + c] = 3;
      else if (r >= 5) b[r * 8 + c] = 1;
    }
    return { b, turn: 0, quiet: 0, last: [], caps: [] };
  }
  const own = (v, seat) => (seat === 0 ? v === 1 || v === 2 : v === 3 || v === 4);
  const isKing = (v) => v === 2 || v === 4;
  function dirs(v) {
    if (isKing(v)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    return v === 1 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
  }
  const inb = (r, c) => r >= 0 && c >= 0 && r < 8 && c < 8;

  function captures(b, from, v, seat) {
    const out = [];
    const walk = (pos, path, taken, piece) => {
      const r = (pos / 8) | 0; const c = pos % 8;
      let ext = false;
      for (const [dr, dc] of dirs(piece)) {
        const mr = r + dr; const mc = c + dc; const lr = r + 2 * dr; const lc = c + 2 * dc;
        if (!inb(lr, lc)) continue;
        const mid = mr * 8 + mc; const land = lr * 8 + lc;
        const mv = b[mid];
        if (!mv || own(mv, seat) || taken.includes(mid)) continue;
        if (b[land] && land !== from) continue;
        ext = true;
        const np = path.concat([land]);
        const crowned = !isKing(piece) && ((seat === 0 && lr === 0) || (seat === 1 && lr === 7));
        if (crowned) out.push(np);
        else walk(land, np, taken.concat([mid]), piece);
      }
      if (!ext && path.length > 1) out.push(path);
    };
    walk(from, [from], [], v);
    return out;
  }

  function movesFor(st, seat) {
    const b = st.b;
    const caps = [];
    const simple = [];
    for (let i = 0; i < 64; i++) {
      const v = b[i];
      if (!v || !own(v, seat)) continue;
      caps.push(...captures(b, i, v, seat));
      if (caps.length) continue;
      const r = (i / 8) | 0; const c = i % 8;
      for (const [dr, dc] of dirs(v)) {
        const nr = r + dr; const nc = c + dc;
        if (inb(nr, nc) && !b[nr * 8 + nc]) simple.push([i, nr * 8 + nc]);
      }
    }
    return caps.length ? caps : simple;
  }
  function moves(st) { return result(st) ? [] : movesFor(st, st.turn); }

  function play(st, path) {
    const b = st.b.slice();
    const from = path[0];
    const v = b[from];
    b[from] = 0;
    const caps = [];
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1]; const z = path[k];
      if (Math.abs(((a / 8) | 0) - ((z / 8) | 0)) === 2) {
        const mid = (a + z) / 2;
        caps.push(mid);
        b[mid] = 0;
      }
    }
    const to = path[path.length - 1];
    const tr = (to / 8) | 0;
    let nv = v;
    if (v === 1 && tr === 0) nv = 2;
    if (v === 3 && tr === 7) nv = 4;
    b[to] = nv;
    const quiet = caps.length || !isKing(v) ? 0 : st.quiet + 1;
    return { b, turn: 1 - st.turn, quiet, last: path, caps };
  }
  function turn(st) { return st.turn; }
  function result(st) {
    if (st.quiet >= 80) return { winner: -1 };
    if (!movesFor(st, st.turn).length) return { winner: 1 - st.turn };
    return null;
  }
  function count(b) {
    let a = 0; let z = 0;
    for (const v of b) { if (v === 1 || v === 2) a++; else if (v) z++; }
    return [a, z];
  }
  root.BoardRules = root.BoardRules || {};
  root.BoardRules.checkers = { init, moves, play, turn, result, movesFor, count, isKing };
})(typeof self !== 'undefined' ? self : this);
