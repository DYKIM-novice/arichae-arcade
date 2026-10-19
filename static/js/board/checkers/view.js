/* 아리채 오락실 · 체커 화면 — 내 말을 누르고, 갈 칸(노란 점)을 차례로 눌러요 */
(function () {
  'use strict';

  const B = window.Boards;
  const R = window.BoardRules.checkers;
  const POINTS = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) POINTS.push([c + 0.5, r + 0.5]);

  function background() {
    let s = `<defs><radialGradient id="ckA" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#4A4A58"/><stop offset="1" stop-color="#121218"/></radialGradient>
      <radialGradient id="ckB" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#FF8B95"/><stop offset="1" stop-color="#C21F33"/></radialGradient></defs>
      <rect x="-0.25" y="-0.25" width="8.5" height="8.5" rx=".25" fill="#5E3714"/>`;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      s += `<rect x="${c}" y="${r}" width="1" height="1" fill="${(r + c) % 2 ? '#8A5A2E' : '#F1D9A8'}"/>`;
    }
    return s;
  }
  const CROWN = (x, y) => `<path d="M${x - 0.2} ${y + 0.09} L${x - 0.23} ${y - 0.12} L${x - 0.1} ${y - 0.02} L${x} ${y - 0.16} L${x + 0.1} ${y - 0.02} L${x + 0.23} ${y - 0.12} L${x + 0.2} ${y + 0.09} Z" fill="#FFD23F" stroke="#B88A00" stroke-width=".03"/>`;
  function drawPiece(v, x, y) {
    const seat = v <= 2 ? 0 : 1;
    const king = R.isKing(v);
    return `<circle cx="${x}" cy="${y + 0.06}" r=".4" fill="rgba(0,0,0,.4)"/>
      <circle cx="${x}" cy="${y}" r=".4" fill="url(#${seat === 0 ? 'ckA' : 'ckB'})"/>
      <circle cx="${x}" cy="${y}" r=".28" fill="none" stroke="rgba(255,255,255,.22)" stroke-width=".04"/>${king ? CROWN(x, y) : ''}`;
  }

  const mount = B.pathView({
    viewBox: '-0.25 -0.25 8.5 8.5', boardClass: 'ck-board', wrapClass: 'ck-wrap',
    points: POINTS, hitR: 0.5,
    background,
    pieceAt: (st, i) => st.b[i],
    drawPiece,
    pathOf: (m) => m,
    moves: (st) => R.moves(st),
    lastPath: (st) => st.last || [],
    why: (st, i) => {
      const caps = R.moves(st).some((m) => Math.abs(((m[0] / 8) | 0) - ((m[1] / 8) | 0)) === 2);
      return caps ? '잡을 수 있는 말이 있으면 꼭 잡아야 해요! (노란 동그라미)' : '움직일 수 있는 내 말을 눌러요';
    }
  });

  const ICON = (a, b) => `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="${a}" stroke="${b}" stroke-width="1"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1"/></svg>`;
  B.register(Object.assign({
    id: 'checkers',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="5" fill="#F1D9A8"/><path d="M2 2h9v9H2zM20 2h9v9h-9zM11 11h9v9h-9zM29 11h9v9h-9zM2 20h9v9H2zM20 20h9v9h-9zM11 29h9v9h-9zM29 29h9v9h-9z" fill="#8A5A2E"/><circle cx="15.5" cy="15.5" r="3.6" fill="#C21F33"/><circle cx="24.5" cy="24.5" r="3.6" fill="#16161C"/><circle cx="6.5" cy="24.5" r="3.6" fill="#16161C"/></svg>',
    seats: [{ label: '검정', sub: '먼저 · 아래', icon: ICON('#1A1A22', '#55556A') }, { label: '빨강', sub: '위', icon: ICON('#D62839', '#8E1222') }],
    rulesText: '대각선 앞으로 한 칸 · 상대 말을 뛰어넘으면 잡기(잡을 수 있으면 꼭, 연속으로) · 끝 줄에 닿으면 왕👑 (뒤로도 이동) · 움직일 수 없으면 패배',
    learn: '체커는 서양 장기라고도 불러요. 2007년 캐나다의 연구팀이 18년 동안 컴퓨터로 계산해서, 두 사람 모두 실수하지 않으면 반드시 무승부가 된다는 것을 증명했어요!',
    turnHint: '움직일 말을 눌러요',
    viewCtx: () => ({}),
    status(st) { const [a, b] = R.count(st.b); return `남은 말 검정 ${a} · 빨강 ${b}`; },
    mount,
    aiMinMs: [0, 650, 600, 550, 450, 300]
  }, B.std(R)));
})();
