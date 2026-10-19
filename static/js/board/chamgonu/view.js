/* 아리채 오락실 · 참고누 화면 — 놓기: 빈 점을 눌러요 / 옮기기: 내 말 → 갈 곳 / 꼰이면 잡을 상대 말을 눌러요 */
(function () {
  'use strict';
  const B = window.Boards;
  const R = window.BoardRules.chamgonu;
  const S = 1.4;
  const P = R.POINTS.map(([x, y]) => [0.7 + x * S, 0.7 + y * S]);
  const STONE = (v, x, y) => `<circle cx="${x}" cy="${y + 0.07}" r=".42" fill="rgba(0,0,0,.35)"/><circle cx="${x}" cy="${y}" r=".42" fill="${v === 1 ? '#1A1A22' : '#F4F1EA'}" stroke="${v === 1 ? '#4A4A5C' : '#B9B4A8'}" stroke-width=".05"/><circle cx="${x - 0.13}" cy="${y - 0.14}" r=".11" fill="${v === 1 ? '#5C5C6E' : '#fff'}"/>`;
  const W = 0.7 * 2 + 6 * S;
  function background() {
    let s = `<rect x="0" y="0" width="${W}" height="${W}" rx=".5" fill="#E9CB8E"/>`;
    R.LINES.forEach(([a, , c]) => { s += `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[c][0]}" y2="${P[c][1]}" stroke="#6B4318" stroke-width=".07" stroke-linecap="round"/>`; });
    P.forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r=".12" fill="#6B4318"/>`; });
    return s;
  }
  function top(st) {
    let s = '';
    st.peg.forEach((i) => {
      const [x, y] = P[i];
      s += `<g><rect x="${x - 0.12}" y="${y - 0.38}" width=".24" height=".7" rx=".05" fill="#8A5A2E" stroke="#4A2A0E" stroke-width=".04"/><ellipse cx="${x}" cy="${y - 0.38}" rx=".16" ry=".07" fill="#B07A44"/></g>`;
    });
    // 꼰(3개 일렬)이 된 줄 표시
    const m = st.last;
    if (m && m.x != null) {
      const c = st.p[m.t];
      R.LINES.filter((l) => l.includes(m.t) && l.every((j) => st.p[j] === c)).forEach(([a, , cc]) => {
        s += `<line class="om-win" x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[cc][0]}" y2="${P[cc][1]}" stroke="#FFD23F" stroke-width=".16" stroke-linecap="round"/>`;
      });
      const [x, y] = P[m.x];
      s += `<g class="cg-cap"><path d="M${x - 0.25} ${y - 0.25} L${x + 0.25} ${y + 0.25} M${x + 0.25} ${y - 0.25} L${x - 0.25} ${y + 0.25}" stroke="#FF4757" stroke-width=".1" stroke-linecap="round"/></g>`;
    }
    return s;
  }
  function pathOf(m) {
    const p = m.f != null ? [m.f, m.t] : [m.t];
    if (m.x != null) p.push(m.x);
    return p;
  }
  const mount = B.pathView({
    viewBox: `0 0 ${W} ${W}`, boardClass: 'gn-board', wrapClass: 'gn-wrap', points: P, hitR: 0.6,
    background, pieceAt: (st, i) => st.p[i], drawPiece: (v, x, y) => STONE(v, x, y),
    pathOf, moves: (st) => R.moves(st), top,
    lastPath: (st) => (st.last ? [st.last.f, st.last.t].filter((v) => v != null) : []),
    why: (st) => (st.phase === 'place' ? '빈 점(말뚝 없는 곳)을 눌러 말을 놓아요' : '내 말을 누르고, 줄로 이어진 빈 곳을 눌러요')
  });
  const ICON = (v) => `<svg viewBox="-0.62 -0.62 1.24 1.32" aria-hidden="true">${STONE(v, 0, 0)}</svg>`;
  B.register(Object.assign({
    id: 'chamgonu',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#E9CB8E"/><g fill="none" stroke="#6B4318" stroke-width="1.4"><rect x="6" y="6" width="28" height="28"/><rect x="11" y="11" width="18" height="18"/><rect x="16" y="16" width="8" height="8"/><path d="M20 6V16M20 24V34M6 20H16M24 20H34M6 6L16 16M34 6L24 16M6 34L16 24M34 34L24 24"/></g><circle cx="6" cy="6" r="3" fill="#1A1A22"/><circle cx="20" cy="6" r="3" fill="#1A1A22"/><circle cx="34" cy="6" r="3" fill="#1A1A22"/><circle cx="29" cy="29" r="3" fill="#F4F1EA"/><circle cx="16" cy="24" r="3" fill="#F4F1EA"/></svg>',
    seats: [{ label: '흑', sub: '먼저', icon: ICON(1) }, { label: '백', sub: '나중', icon: ICON(2) }],
    rulesText: '말 12개씩 번갈아 놓기 → 다 놓으면 한 칸씩 옮기기 · 가로·세로·대각선 3개 = 꼰! 상대 말 1개 잡기 (놓을 때 잡은 자리엔 말뚝) · 상대 말이 2개 남거나 못 움직이면 승리',
    learn: '참고누는 곤질고누·열두밭고누라고도 해요. 말판의 점 24개를 둘이 12개씩 나눠 쓴다고 "열두밭"이에요. 서양의 "나인 멘스 모리스"와 닮은 놀이가 세계 곳곳에 있어요.',
    turnHint: (st) => (st.phase === 'place' ? '말을 놓을 점을 눌러요' : '움직일 말을 눌러요'),
    viewCtx: () => ({}),
    status(st) {
      const a = R.count(st.p, 0); const b = R.count(st.p, 1);
      return st.phase === 'place'
        ? `놓기 단계 · 남은 말 흑 ${12 - st.placed[0]} · 백 ${12 - st.placed[1]}`
        : `옮기기 단계 · 판 위의 말 흑 ${a} · 백 ${b}`;
    },
    mount, aiMinMs: [0, 600, 550, 500, 450, 400]
  }, B.std(R)));
})();
