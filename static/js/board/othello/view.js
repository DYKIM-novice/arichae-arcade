/* 아리채 오락실 · 오델로 화면 — 둘 수 있는 자리에 점이 보이고, 누르면 바로 놓여요 */
(function () {
  'use strict';

  const B = window.Boards;
  const R = window.BoardRules.othello;
  const N = R.N;

  const ICON = {
    black: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#15151C" stroke="#55556A"/><circle cx="7.4" cy="7" r="2.4" fill="#5C5C6E" opacity=".7"/></svg>',
    white: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#F7F5EF" stroke="#B9B4A8"/><circle cx="7.4" cy="7" r="2.4" fill="#fff"/></svg>'
  };

  function mount(el, api) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ot-wrap';
    const sv = B.svg('-0.3 -0.3 8.6 8.6', 'ot-board');
    let html = `<defs>
      <radialGradient id="otB" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#5E5E6C"/><stop offset=".5" stop-color="#1D1D25"/><stop offset="1" stop-color="#08080D"/></radialGradient>
      <radialGradient id="otW" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#EFECE4"/><stop offset="1" stop-color="#C8C2B4"/></radialGradient>
      <linearGradient id="otFelt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1F9A57"/><stop offset="1" stop-color="#147A43"/></linearGradient>
    </defs>
    <rect x="-0.3" y="-0.3" width="8.6" height="8.6" rx=".3" fill="#0E5A31"/>
    <rect x="0" y="0" width="8" height="8" fill="url(#otFelt)"/>
    <g stroke="#0B4A28" stroke-width=".04">`;
    for (let i = 0; i <= N; i++) html += `<line x1="0" y1="${i}" x2="8" y2="${i}"/><line x1="${i}" y1="0" x2="${i}" y2="8"/>`;
    html += '</g>';
    [[2, 2], [6, 2], [2, 6], [6, 6]].forEach(([x, y]) => { html += `<circle cx="${x}" cy="${y}" r=".08" fill="#0B4A28"/>`; });
    html += '<g class="ot-hints"></g><g class="ot-discs"></g>';
    sv.innerHTML = html;
    wrap.appendChild(sv);
    el.appendChild(wrap);
    const gHints = sv.querySelector('.ot-hints');
    const gDiscs = sv.querySelector('.ot-discs');
    let st = null;
    let vc = {};
    let prevB = null;

    function render(state, ctx) {
      st = state; vc = ctx || {};
      let out = '';
      const flipped = new Set(st.flipped || []);
      for (let i = 0; i < N * N; i++) {
        const v = st.b[i];
        if (!v) continue;
        const x = (i % N) + 0.5; const y = ((i / N) | 0) + 0.5;
        const changed = prevB && prevB[i] !== v;
        const cls = changed ? (prevB[i] ? ' flip' : ' new') : '';
        out += `<g class="ot-d${cls}" style="transform-origin:${x}px ${y}px${flipped.has(i) && changed ? `;animation-delay:${0.05 + (Math.abs((i % N) - (st.last % N)) + Math.abs(((i / N) | 0) - ((st.last / N) | 0))) * 0.05}s` : ''}">
          <circle cx="${x}" cy="${y + 0.05}" r=".41" fill="rgba(0,0,0,.35)"/><circle cx="${x}" cy="${y}" r=".41" fill="url(#${v === 1 ? 'otB' : 'otW'})"/>
          ${i === st.last ? `<circle cx="${x}" cy="${y}" r=".09" fill="#FF4757"/>` : ''}</g>`;
      }
      gDiscs.innerHTML = out;
      prevB = st.b.slice();
      let h = '';
      if (vc.canPlay) {
        R.moves(st).forEach((i) => {
          const x = (i % N) + 0.5; const y = ((i / N) | 0) + 0.5;
          h += `<circle class="ot-dot" cx="${x}" cy="${y}" r=".14" fill="rgba(255,255,255,.5)"/>`;
        });
      }
      if (vc.hint != null && vc.hint >= 0) {
        const x = (vc.hint % N) + 0.5; const y = ((vc.hint / N) | 0) + 0.5;
        h += `<circle class="om-hint" cx="${x}" cy="${y}" r=".42" fill="rgba(61,123,255,.4)" stroke="#3D7BFF" stroke-width=".07"/>`;
      }
      gHints.innerHTML = h;
    }

    sv.addEventListener('pointerdown', (ev) => {
      if (!st || !vc.canPlay) return;
      ev.preventDefault();
      const [fx, fy] = B.svgPoint(sv, ev);
      const x = Math.floor(fx); const y = Math.floor(fy);
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      const i = y * N + x;
      if (!R.flips(st.b, i, st.turn).length) { api.say(st.b[i] ? '이미 돌이 있어요' : '상대 돌을 뒤집을 수 있는 자리(점)에만 둘 수 있어요'); return; }
      api.pick(i);
    });
    return { render, commit() {}, clear() {}, destroy() { el.innerHTML = ''; } };
  }

  const std = B.std(R);
  B.register(Object.assign({
    id: 'othello',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#1A8F4A"/><path d="M11 2v36M20 2v36M29 2v36M2 11h36M2 20h36M2 29h36" stroke="#0E5A31" stroke-width="1.2"/><circle cx="15.5" cy="15.5" r="4" fill="#F4F1EA"/><circle cx="24.5" cy="24.5" r="4" fill="#F4F1EA"/><circle cx="24.5" cy="15.5" r="4" fill="#15151C"/><circle cx="15.5" cy="24.5" r="4" fill="#15151C"/></svg>',
    seats: [{ label: '흑', sub: '먼저', icon: ICON.black }, { label: '백', sub: '나중', icon: ICON.white }],
    rulesText: '상대 돌을 내 돌 사이에 끼우면 뒤집혀요 · 점 찍힌 자리에만 둘 수 있어요 · 둘 곳이 없으면 자동으로 넘어가요 · 끝났을 때 돌이 많으면 승리',
    learn: '오델로는 1970년대 일본에서 지금 모습으로 만들어졌고, 비슷한 놀이 "리버시"는 1880년대 영국에서 시작됐어요. 네 귀퉁이는 절대 뒤집히지 않아서 가장 중요한 자리예요!',
    turnHint: '점 찍힌 자리를 눌러요',
    viewCtx: () => ({}),
    status(st) {
      const [x, o] = R.count(st.b);
      return `흑 <b>${x}</b> : <b>${o}</b> 백${st.pass >= 0 && !st.over ? ` · ${st.pass === 0 ? '흑' : '백'}은 둘 곳이 없어 넘어갔어요` : ''}`;
    },
    mount,
    aiMinMs: [0, 650, 600, 550, 450, 300]
  }, std));
})();
