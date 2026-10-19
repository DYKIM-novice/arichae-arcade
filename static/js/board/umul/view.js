/* 아리채 오락실 · 우물고누 화면 — 내 말을 누르고 갈 곳을 눌러요 */
(function () {
  'use strict';
  const B = window.Boards;
  const R = window.BoardRules.umul;
  const P = [[1, 1], [5, 1], [3, 3], [1, 5], [5, 5]];
  const STONE = (v, x, y) => `<circle cx="${x}" cy="${y + 0.08}" r=".5" fill="rgba(0,0,0,.35)"/><circle cx="${x}" cy="${y}" r=".5" fill="${v === 1 ? '#1A1A22' : '#F4F1EA'}" stroke="${v === 1 ? '#4A4A5C' : '#B9B4A8'}" stroke-width=".06"/><circle cx="${x - 0.16}" cy="${y - 0.17}" r=".13" fill="${v === 1 ? '#5C5C6E' : '#fff'}"/>`;
  function background() {
    let s = '<rect x="0" y="0" width="6" height="6.6" rx=".5" fill="#E9CB8E"/>';
    R.EDGES.forEach(([a, b]) => { s += `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}" stroke="#6B4318" stroke-width=".09" stroke-linecap="round"/>`; });
    // 우물
    s += '<ellipse cx="3" cy="5.55" rx=".75" ry=".5" fill="#3D7BFF" stroke="#1F49B8" stroke-width=".07"/><path d="M2.55 5.5 Q3 5.3 3.45 5.5" stroke="#A9C4FF" stroke-width=".07" fill="none"/>';
    s += '<text x="3" y="6.4" text-anchor="middle" font-size=".34" fill="#6B4318">우물 (못 건너요)</text>';
    P.forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r=".16" fill="#6B4318"/>`; });
    return s;
  }
  const mount = B.pathView({
    viewBox: '0 0 6 6.6', boardClass: 'gn-board', wrapClass: 'gn-wrap', points: P, hitR: 0.7,
    background, pieceAt: (st, i) => st.p[i], drawPiece: (v, x, y) => STONE(v, x, y),
    pathOf: (m) => m, moves: (st) => R.moves(st), lastPath: (st) => st.last || [],
    why: (st) => (st.n === 0 ? '내 말을 누르고, 갈 곳(노란 점)을 눌러요. 첫 수로 바로 가두는 건 안 돼요' : '내 말을 누르고, 줄로 이어진 빈 곳을 눌러요')
  });
  const ICON = (v) => `<svg viewBox="-0.62 -0.62 1.24 1.32" aria-hidden="true">${STONE(v, 0, 0)}</svg>`;
  B.register(Object.assign({
    id: 'umul',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#E9CB8E"/><path d="M8 8H32M8 8V32M32 8V32M8 8L32 32M32 8L8 32" stroke="#6B4318" stroke-width="2"/><ellipse cx="20" cy="33" rx="6" ry="3.5" fill="#3D7BFF"/><circle cx="8" cy="8" r="4" fill="#1A1A22"/><circle cx="8" cy="32" r="4" fill="#1A1A22"/><circle cx="32" cy="8" r="4" fill="#F4F1EA"/><circle cx="32" cy="32" r="4" fill="#F4F1EA"/></svg>',
    seats: [{ label: '흑', sub: '먼저 · 왼쪽', icon: ICON(1) }, { label: '백', sub: '오른쪽', icon: ICON(2) }],
    rulesText: '말 2개씩 · 줄을 따라 빈 곳으로 한 칸 · 아래 우물은 못 건너요 · 상대가 움직일 수 없게 가두면 승리 · 첫 수로 바로 가두기는 금지',
    learn: '고누는 땅바닥이나 종이에 말판을 그리고 돌멩이로 하던 우리 전통 놀이예요. 우물고누는 가장 작은 고누로, 김홍도의 풍속화 「고누놀이」에도 나무꾼들이 고누를 두는 모습이 그려져 있어요.',
    turnHint: '움직일 말을 눌러요',
    viewCtx: () => ({}), mount, aiMinMs: [0, 600, 550, 500, 450, 400]
  }, B.std(R)));
})();
