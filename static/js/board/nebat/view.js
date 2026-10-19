/* 아리채 오락실 · 네밭고누 화면 — 내 말을 누르고 갈 곳(노란 점)을 눌러요. 잡을 수 있는 곳은 빨간 점 */
(function () {
  'use strict';
  const B = window.Boards;
  const R = window.BoardRules.nebat;
  const N = R.N;
  const GAP = 1.5; const M = 0.95;
  const P = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) P.push([M + c * GAP, M + r * GAP]);
  const SIZE = M * 2 + (N - 1) * GAP;
  const STONE = (v, x, y) => `<circle cx="${x}" cy="${y + 0.08}" r=".5" fill="rgba(0,0,0,.35)"/><circle cx="${x}" cy="${y}" r=".5" fill="${v === 1 ? '#1A1A22' : '#F4F1EA'}" stroke="${v === 1 ? '#4A4A5C' : '#B9B4A8'}" stroke-width=".06"/><circle cx="${x - 0.16}" cy="${y - 0.17}" r=".13" fill="${v === 1 ? '#5C5C6E' : '#fff'}"/>`;
  function background() {
    let s = `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx=".5" fill="#E9CB8E"/>`;
    for (let k = 0; k < N; k++) {
      const a = M + k * GAP; const e = M + (N - 1) * GAP;
      s += `<line x1="${M}" y1="${a}" x2="${e}" y2="${a}" stroke="#6B4318" stroke-width=".09" stroke-linecap="round"/>`;
      s += `<line x1="${a}" y1="${M}" x2="${a}" y2="${e}" stroke="#6B4318" stroke-width=".09" stroke-linecap="round"/>`;
    }
    P.forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r=".14" fill="#6B4318"/>`; });
    return s;
  }
  const mount = B.pathView({
    viewBox: `0 0 ${SIZE} ${SIZE}`, boardClass: 'gn-board', wrapClass: 'gn-wrap', points: P, hitR: 0.7,
    flipSeat: 1, center: [SIZE / 2, SIZE / 2],
    background, pieceAt: (st, i) => st.p[i], // 판을 돌려도 돌의 빛·그림자는 늘 위에서 비추게
    drawPiece: (v, x, y, i, st, flipped) => (flipped ? `<g transform="rotate(180 ${x} ${y})">${STONE(v, x, y)}</g>` : STONE(v, x, y)),
    pathOf: (m) => m, moves: (st) => R.moves(st), lastPath: (st) => st.last || [],
    top(st, vc) {
      let s = '';
      // 갈 수 있는 곳 가운데 '잡기'는 빨간 테두리로 한 번 더 알려 줘요
      if (vc.canPlay) {
        const seen = new Set();
        R.moves(st).forEach((m) => {
          if (!st.p[m[1]] || seen.has(m[1])) return;
          seen.add(m[1]);
          const [x, y] = P[m[1]];
          s += `<circle class="pv-can" cx="${x}" cy="${y}" r=".62" fill="none" stroke="#FF4757" stroke-width=".07" stroke-dasharray=".18 .1"/>`;
        });
      }
      if (st.cap >= 0) {
        const [x, y] = P[st.cap];
        s += `<circle class="nb-pop" cx="${x}" cy="${y}" r=".7" fill="none" stroke="#FF4757" stroke-width=".09" style="transform-origin:${x}px ${y}px"/>`;
      }
      return s;
    },
    why: (st) => (st.n === 0
      ? '처음엔 판이 꽉 차서 잡기만 할 수 있어요. 내 말을 누르고, 바로 옆 내 말 너머의 상대 말(빨간 테두리)을 눌러요'
      : '내 말을 누르고 빈 곳으로 한 칸, 또는 옆의 내 말을 넘어 상대 말을 잡아요')
  });
  const ICON = (v) => `<svg viewBox="-0.62 -0.62 1.24 1.32" aria-hidden="true">${STONE(v, 0, 0)}</svg>`;
  B.register(Object.assign({
    id: 'nebat',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#E9CB8E"/><path d="M8 8H32M8 16H32M8 24H32M8 32H32M8 8V32M16 8V32M24 8V32M32 8V32" stroke="#6B4318" stroke-width="1.6"/><circle cx="8" cy="8" r="3.4" fill="#F4F1EA"/><circle cx="24" cy="8" r="3.4" fill="#F4F1EA"/><circle cx="16" cy="16" r="3.4" fill="#F4F1EA"/><circle cx="16" cy="32" r="3.4" fill="#1A1A22"/><circle cx="32" cy="24" r="3.4" fill="#1A1A22"/><circle cx="8" cy="24" r="3.4" fill="#1A1A22"/></svg>',
    seats: [{ label: '흑', sub: '먼저 · 아래', icon: ICON(1) }, { label: '백', sub: '위', icon: ICON(2) }],
    rulesText: '말 8개씩 판을 꽉 채우고 시작 · 빈 곳으로 한 칸, 또는 바로 옆 내 말을 넘어 그 너머 상대 말 잡기 · 첫 수는 꼭 잡기 · 상대를 1개로 줄이거나 가두면 승리',
    learn: '네밭고누는 가로세로 네 줄을 그은 "네 밭" 말판에서 하는 고누예요. 다른 고누와 달리 상대 말을 넘는 게 아니라, 내 말을 디딤돌 삼아 넘어가서 상대 말을 잡는 게 특징이에요. 1895년 미국 학자 스튜어트 컬린의 책 「한국의 놀이」에도 실려 있어요.',
    turnHint: '움직일 말을 눌러요',
    status(st) {
      const a = R.count(st.p, 0); const b = R.count(st.p, 1);
      const left = R.QUIET_LIMIT - st.quiet;
      return `남은 말 흑 <b>${a}</b> · 백 <b>${b}</b>${left <= 10 && left > 0 ? ` · 잡기 없이 ${left}수 더 가면 무승부` : ''}`;
    },
    viewCtx: () => ({}), mount, aiMinMs: [0, 600, 550, 500, 450, 400]
  }, B.std(R)));
})();
