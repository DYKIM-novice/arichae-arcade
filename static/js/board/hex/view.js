/* 아리채 오락실 · 헥스 화면 (폰에 맞게 세로로 세운 마름모 판)
   빨강은 빨간 두 변을, 파랑은 파란 두 변을 이어요 */
(function () {
  'use strict';
  const B = window.Boards;
  const R = window.BoardRules.hex;
  const N = R.N;
  const S3 = Math.sqrt(3) / 2;
  // 줄 r 은 가로(x), 칸 c 는 세로(y)로 — 세로로 긴 판
  const P = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) P.push([0.9 + r * S3 * 1.0, 0.9 + c + r * 0.5]);
  const COL = ['#FF4757', '#3D7BFF'];
  const hexPath = (x, y, s) => {
    let d = '';
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      d += `${k ? 'L' : 'M'}${(x + Math.cos(a) * s).toFixed(3)} ${(y + Math.sin(a) * s).toFixed(3)}`;
    }
    return d + 'Z';
  };
  const W = 0.9 * 2 + (N - 1) * S3;  // 판 크기 (띠 포함)
  const H = 0.9 * 2 + (N - 1) + (N - 1) * 0.5;
  function background() {
    let s = `<rect x="0" y="0" width="${W}" height="${H}" rx=".4" fill="#1D1840"/>`;
    // 변 색: 판 바깥쪽에 띠로 (줄 0·줄 N-1 = 빨강 / 칸 0·칸 N-1 = 파랑)
    const band = (ids, col, nx, ny) => {
      const pts = ids.map((i) => [P[i][0] + nx * 0.72, P[i][1] + ny * 0.72]);
      s += `<polyline points="${pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ')}" fill="none" stroke="${col}" stroke-width=".32" stroke-linecap="round"/>`;
    };
    band(Array.from({ length: N }, (_, c) => c), COL[0], -1, 0);
    band(Array.from({ length: N }, (_, c) => (N - 1) * N + c), COL[0], 1, 0);
    band(Array.from({ length: N }, (_, r) => r * N), COL[1], 0.5, -S3);
    band(Array.from({ length: N }, (_, r) => r * N + N - 1), COL[1], -0.5, S3);
    P.forEach(([x, y]) => { s += `<path d="${hexPath(x, y, 0.56)}" fill="#E9CB8E" stroke="#8A5A2E" stroke-width=".05"/>`; });
    return s;
  }
  function drawPiece(v, x, y, i, st) {
    const onPath = st.path && st.path.includes(i);
    return `<path d="${hexPath(x, y, 0.56)}" fill="${COL[v - 1]}" stroke="${onPath ? '#FFD23F' : 'rgba(0,0,0,.35)'}" stroke-width="${onPath ? 0.12 : 0.05}"/>
      <circle cx="${x - 0.12}" cy="${y - 0.14}" r=".12" fill="rgba(255,255,255,.35)"/>`;
  }
  const mount = B.pathView({
    viewBox: `0 0 ${W} ${H}`, boardClass: 'hx-board', wrapClass: 'hx-wrap', points: P, hitR: 0.5, firstHint: false,
    background, pieceAt: (st, i) => st.b[i], drawPiece,
    pathOf: (m) => [m], moves: (st) => R.moves(st),
    lastPath: (st) => (st.last >= 0 ? [st.last] : []),
    why: () => '빈 칸을 눌러요'
  });
  const ICON = (c) => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${hexPath(10, 10, 8.5)}" fill="${c}"/></svg>`;
  B.register(Object.assign({
    id: 'hex',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#1D1840"/><path d="${hexPath(13, 13, 6)}" fill="#FF4757"/><path d="${hexPath(23, 13, 6)}" fill="#E9CB8E"/><path d="${hexPath(18, 22, 6)}" fill="#FF4757"/><path d="${hexPath(28, 22, 6)}" fill="#3D7BFF"/><path d="${hexPath(13, 31, 6)}" fill="#E9CB8E"/><path d="${hexPath(23, 31, 6)}" fill="#FF4757"/></svg>`,
    seats: [{ label: '빨강', sub: '먼저 · 빨간 변 잇기', icon: ICON(COL[0]) }, { label: '파랑', sub: '파란 변 잇기', icon: ICON(COL[1]) }],
    rulesText: '빈 칸에 번갈아 하나씩 · 빨강은 빨간 두 변을, 파랑은 파란 두 변을 먼저 이으면 승리 · 헥스는 절대 비기지 않아요',
    learn: '헥스는 1942년 덴마크의 시인이자 수학자 피트 하인, 1948년 미국의 수학자 존 내시(영화 「뷰티풀 마인드」의 주인공)가 따로따로 발명했어요. 내시는 "비기는 판이 절대 없다"는 것을 수학으로 증명했어요.',
    turnHint: '빈 칸을 눌러요',
    viewCtx: () => ({}), mount, aiMinMs: [0, 600, 550, 500, 400, 300]
  }, B.std(R)));
})();
