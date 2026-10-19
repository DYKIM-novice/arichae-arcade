/* 아리채 오락실 · 사목 화면 — 칸(열)을 누르면 돌이 떨어져요 */
(function () {
  'use strict';

  const B = window.Boards;
  const R = window.BoardRules.connect4;
  const W = R.W; const H = R.H;
  const COL = ['#FF4757', '#FFD23F'];
  const ICON = (c) => `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="${c}" stroke="rgba(0,0,0,.25)"/><circle cx="10" cy="10" r="5" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.4"/></svg>`;

  function mount(el, api) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'c4-wrap';
    const sv = B.svg(`-0.25 -1.1 ${W + 0.5} ${H + 1.4}`, 'c4-board');
    // 판 앞면(구멍 뚫린 파란 판)은 마스크로 만들어요
    let holes = '';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) holes += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r=".38" fill="#000"/>`;
    sv.innerHTML = `<defs><mask id="c4m"><rect x="-0.25" y="-0.25" width="${W + 0.5}" height="${H + 0.5}" fill="#fff"/>${holes}</mask>
      <radialGradient id="c4r" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#FF8B95"/><stop offset="1" stop-color="#D62839"/></radialGradient>
      <radialGradient id="c4y" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#FFF1A8"/><stop offset="1" stop-color="#E8B400"/></radialGradient></defs>
      <rect x="-0.25" y="-0.25" width="${W + 0.5}" height="${H + 0.5}" fill="#0E1640" rx=".25"/>
      <g class="c4-ghost"></g><g class="c4-discs"></g>
      <rect x="-0.25" y="-0.25" width="${W + 0.5}" height="${H + 0.5}" rx=".25" fill="#2F5BE0" mask="url(#c4m)"/>
      <rect x="-0.25" y="-0.25" width="${W + 0.5}" height="${H + 0.5}" rx=".25" fill="none" stroke="#1F3FA8" stroke-width=".08"/>
      <g class="c4-top"></g>`;
    wrap.appendChild(sv);
    el.appendChild(wrap);
    const gDiscs = sv.querySelector('.c4-discs');
    const gTop = sv.querySelector('.c4-top');
    let st = null; let vc = {}; let prev = null;

    const cy = (y) => H - 1 - y + 0.5;   // y=0 이 맨 아래
    function render(state, ctx) {
      st = state; vc = ctx || {};
      let out = '';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = st.b[y * W + x];
        if (!v) continue;
        const i = y * W + x;
        const isNew = prev && !prev[i];
        const fall = isNew ? `style="--from:${-(cy(y) + 1.2)}px"` : '';
        out += `<g class="c4-d${isNew ? ' new' : ''}" ${fall}><circle cx="${x + 0.5}" cy="${cy(y)}" r=".4" fill="url(#${v === 1 ? 'c4r' : 'c4y'})"/>
          <circle cx="${x + 0.5}" cy="${cy(y)}" r=".24" fill="none" stroke="rgba(255,255,255,.3)" stroke-width=".06"/></g>`;
      }
      gDiscs.innerHTML = out;
      prev = st.b.slice();
      let top = '';
      if (st.line) {
        st.line.forEach((i) => { top += `<circle class="om-win" cx="${(i % W) + 0.5}" cy="${cy((i / W) | 0)}" r=".42" fill="none" stroke="#fff" stroke-width=".1"/>`; });
      }
      if (st.last >= 0 && !st.line) top += `<circle cx="${(st.last % W) + 0.5}" cy="${cy((st.last / W) | 0)}" r=".08" fill="#fff"/>`;
      if (vc.canPlay) {
        R.moves(st).forEach((x) => { top += `<path class="ot-dot" d="M${x + 0.3} -0.75 L${x + 0.7} -0.75 L${x + 0.5} -0.42 Z" fill="${COL[st.turn]}"/>`; });
      }
      if (vc.hint != null && vc.hint >= 0) top += `<rect class="om-hint" x="${vc.hint + 0.06}" y="-0.2" width=".88" height="${H + 0.4}" rx=".4" fill="rgba(61,123,255,.25)" stroke="#3D7BFF" stroke-width=".06"/>`;
      gTop.innerHTML = top;
    }
    sv.addEventListener('pointerdown', (ev) => {
      if (!st || !vc.canPlay) return;
      ev.preventDefault();
      const [fx] = B.svgPoint(sv, ev);
      const x = Math.floor(fx);
      if (x < 0 || x >= W) return;
      if (st.h[x] >= H) { api.say('그 칸은 가득 찼어요'); return; }
      api.pick(x);
    });
    return { render, commit() {}, clear() {}, destroy() { el.innerHTML = ''; } };
  }

  B.register(Object.assign({
    id: 'connect4',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="6" width="36" height="30" rx="5" fill="#2F5BE0"/><circle cx="9" cy="13" r="3.5" fill="#0E1640"/><circle cx="20" cy="13" r="3.5" fill="#0E1640"/><circle cx="31" cy="13" r="3.5" fill="#FFD23F"/><circle cx="9" cy="22" r="3.5" fill="#0E1640"/><circle cx="20" cy="22" r="3.5" fill="#FF4757"/><circle cx="31" cy="22" r="3.5" fill="#FFD23F"/><circle cx="9" cy="31" r="3.5" fill="#FF4757"/><circle cx="20" cy="31" r="3.5" fill="#FF4757"/><circle cx="31" cy="31" r="3.5" fill="#FFD23F"/></svg>',
    seats: [{ label: '빨강', sub: '먼저', icon: ICON(COL[0]) }, { label: '노랑', sub: '나중', icon: ICON(COL[1]) }],
    rulesText: '칸을 누르면 돌이 맨 아래로 떨어져요 · 가로·세로·대각선으로 4개를 먼저 이으면 승리',
    learn: '사목(커넥트 포)은 1974년에 나온 놀이예요. 1988년에 컴퓨터로 끝까지 계산해 보니, 먼저 두는 사람이 가운데 칸에 두고 실수 없이 두면 반드시 이긴다는 게 밝혀졌어요!',
    turnHint: '돌을 넣을 칸을 눌러요',
    viewCtx: () => ({}),
    mount,
    aiMinMs: [0, 600, 550, 500, 400, 300]
  }, B.std(R)));
})();
