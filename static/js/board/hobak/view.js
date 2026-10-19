/* 아리채 오락실 · 호박고누 화면 */
(function () {
  'use strict';
  const B = window.Boards;
  const R = window.BoardRules.hobak;
  const P = [[5, 6], [5, 2.7], [8.3, 6], [5, 9.3], [1.7, 6]];
  P.push([3.4, 1.1], [5, 0.6], [6.6, 1.1]);        // 위 집 5,6,7
  P.push([3.4, 10.9], [5, 11.4], [6.6, 10.9]);     // 아래 집 8,9,10
  const STONE = (v, x, y) => `<circle cx="${x}" cy="${y + 0.08}" r=".46" fill="rgba(0,0,0,.35)"/><circle cx="${x}" cy="${y}" r=".46" fill="${v === 1 ? '#1A1A22' : '#F4F1EA'}" stroke="${v === 1 ? '#4A4A5C' : '#B9B4A8'}" stroke-width=".06"/><circle cx="${x - 0.15}" cy="${y - 0.16}" r=".12" fill="${v === 1 ? '#5C5C6E' : '#fff'}"/>`;
  function background() {
    let s = '<rect x="0.2" y="0" width="9.6" height="12" rx=".8" fill="#2F6B3A"/>';
    s += '<circle cx="5" cy="6" r="3.3" fill="#F2A13B" stroke="#B9671A" stroke-width=".12"/>';
    s += '<ellipse cx="5" cy="6" rx="1.6" ry="3.25" fill="none" stroke="rgba(185,103,26,.35)" stroke-width=".07"/><ellipse cx="5" cy="6" rx="2.6" ry="3.28" fill="none" stroke="rgba(185,103,26,.25)" stroke-width=".07"/>';
    s += '<path d="M4.6 2.7 Q5 1.9 5.6 2.4" stroke="#3E8E41" stroke-width=".25" fill="none" stroke-linecap="round"/>';
    s += '<rect x="2.9" y="0.15" width="4.2" height="1.6" rx=".5" fill="rgba(255,255,255,.12)" stroke="#E9CB8E" stroke-width=".05" stroke-dasharray=".15 .1"/>';
    s += '<rect x="2.9" y="10.25" width="4.2" height="1.6" rx=".5" fill="rgba(255,255,255,.12)" stroke="#E9CB8E" stroke-width=".05" stroke-dasharray=".15 .1"/>';
    R.EDGES.forEach(([a, b]) => {
      if (a >= 1 && a <= 4 && b >= 1 && b <= 4) return;   // 둘레는 원으로
      s += `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}" stroke="#6B3A0E" stroke-width=".08" stroke-linecap="round"/>`;
    });
    s += '<circle cx="5" cy="6" r="3.3" fill="none" stroke="#6B3A0E" stroke-width=".08"/>';
    P.forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r=".13" fill="#6B3A0E"/>`; });
    s += '<text x="8.2" y="1.2" font-size=".36" fill="#E9CB8E" text-anchor="middle">백 집</text><text x="8.2" y="11.2" font-size=".36" fill="#E9CB8E" text-anchor="middle">흑 집</text>';
    return s;
  }
  const mount = B.pathView({
    viewBox: '0.2 0 9.6 12', boardClass: 'gn-board', wrapClass: 'gn-wrap tall', points: P, hitR: 0.62,
    background, pieceAt: (st, i) => st.p[i], drawPiece: (v, x, y) => STONE(v, x, y),
    pathOf: (m) => m, moves: (st) => R.moves(st), lastPath: (st) => st.last || [],
    why: () => '내 말을 누르고, 줄로 이어진 빈 곳을 눌러요 (집을 나온 말은 집에 못 들어가요)'
  });
  const ICON = (v) => `<svg viewBox="-0.62 -0.62 1.24 1.32" aria-hidden="true">${STONE(v, 0, 0)}</svg>`;
  B.register(Object.assign({
    id: 'hobak',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#2F6B3A"/><circle cx="20" cy="21" r="12" fill="#F2A13B" stroke="#B9671A" stroke-width="1.5"/><path d="M20 9V33M8 21H32M11.5 12.5L28.5 29.5M28.5 12.5L11.5 29.5" stroke="#6B3A0E" stroke-width="1.3"/><path d="M19 9 Q21 4 24 6" stroke="#3E8E41" stroke-width="2" fill="none"/><circle cx="20" cy="33" r="3" fill="#1A1A22"/><circle cx="20" cy="9" r="3" fill="#F4F1EA"/></svg>',
    seats: [{ label: '흑', sub: '먼저 · 아래 집', icon: ICON(1) }, { label: '백', sub: '위 집', icon: ICON(2) }],
    rulesText: '말 3개씩 자기 집에서 출발 · 줄을 따라 한 칸 · 집을 나온 말은 다시 집에 못 들어가요 · 상대를 움직일 수 없게 가두면 승리',
    learn: '호박고누는 동그란 말판이 호박을 닮아서 붙은 이름이에요. 사발고누·돼지고누라고도 불러요. 집에서 너무 늦게 나오면 갇히기 쉬우니 조심!',
    turnHint: '움직일 말을 눌러요',
    viewCtx: () => ({}), mount, aiMinMs: [0, 600, 550, 500, 450, 400]
  }, B.std(R)));
})();
