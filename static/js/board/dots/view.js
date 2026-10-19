/* 아리채 오락실 · 점 잇기 상자 화면 — 두 점 사이를 누르면 선이 그어져요 */
(function () {
  'use strict';

  const B = window.Boards;
  const R = window.BoardRules.dots;
  const COL = ['#FF4757', '#3D7BFF'];
  const FILL = ['rgba(255,71,87,.35)', 'rgba(61,123,255,.35)'];

  function lineGeom(i) {
    if (i < R.NH) { const r = Math.floor(i / R.BW); const c = i % R.BW; return [c, r, c + 1, r]; }
    const k = i - R.NH; const r = Math.floor(k / (R.BW + 1)); const c = k % (R.BW + 1);
    return [c, r, c, r + 1];
  }

  function mount(el, api) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'dt-wrap';
    const sv = B.svg(`-0.4 -0.4 ${R.BW + 0.8} ${R.BH + 0.8}`, 'dt-board');
    wrap.appendChild(sv);
    el.appendChild(wrap);
    let st = null; let vc = {}; let prevN = -1;

    function render(state, ctx) {
      st = state; vc = ctx || {};
      let out = `<rect x="-0.4" y="-0.4" width="${R.BW + 0.8}" height="${R.BH + 0.8}" rx=".3" fill="#FFF8E7"/>`;
      // 상자
      R.BOX_LINES.forEach((ls, bi) => {
        const r = Math.floor(bi / R.BW); const c = bi % R.BW;
        const o = st.box[bi];
        if (o >= 0) {
          const isNew = prevN >= 0 && st.n > prevN && R.LINE_BOXES[st.last].includes(bi);
          out += `<g class="dt-box${isNew ? ' new' : ''}" style="transform-origin:${c + 0.5}px ${r + 0.5}px"><rect x="${c + 0.06}" y="${r + 0.06}" width=".88" height=".88" rx=".08" fill="${FILL[o]}"/>
            <text x="${c + 0.5}" y="${r + 0.66}" text-anchor="middle" font-size=".42" fill="${COL[o]}" font-family="Black Han Sans, sans-serif">${vc.labels ? vc.labels[o] : o + 1}</text></g>`;
        }
      });
      // 선 (안 그은 선은 흐린 점선 = 누를 수 있는 곳)
      for (let i = 0; i < R.NL; i++) {
        const [x1, y1, x2, y2] = lineGeom(i);
        const o = st.l[i];
        if (o >= 0) out += `<line class="${i === st.last ? 'dt-last' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COL[o]}" stroke-width=".1" stroke-linecap="round"/>`;
        else if (vc.canPlay) out += `<line x1="${x1 + 0.15 * (x2 - x1)}" y1="${y1 + 0.15 * (y2 - y1)}" x2="${x2 - 0.15 * (x2 - x1)}" y2="${y2 - 0.15 * (y2 - y1)}" stroke="#D8CBB0" stroke-width=".05" stroke-dasharray=".08 .08"/>`;
      }
      if (vc.hint != null && vc.hint >= 0) {
        const [x1, y1, x2, y2] = lineGeom(vc.hint);
        out += `<line class="om-hint" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3D7BFF" stroke-width=".18" stroke-linecap="round" opacity=".6"/>`;
      }
      for (let r = 0; r <= R.BH; r++) for (let c = 0; c <= R.BW; c++) out += `<circle cx="${c}" cy="${r}" r=".1" fill="#3A3270"/>`;
      sv.innerHTML = out;
      prevN = st.n;
    }
    sv.addEventListener('pointerdown', (ev) => {
      if (!st || !vc.canPlay) return;
      ev.preventDefault();
      const [x, y] = B.svgPoint(sv, ev);
      let best = -1; let bd = Infinity;
      for (let i = 0; i < R.NL; i++) {
        const [x1, y1, x2, y2] = lineGeom(i);
        const d = (x - (x1 + x2) / 2) ** 2 + (y - (y1 + y2) / 2) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0 || bd > 0.2) return;
      if (st.l[best] >= 0) { api.say('이미 그은 선이에요'); return; }
      api.pick(best);
    });
    return { render, commit() {}, clear() {}, destroy() { el.innerHTML = ''; } };
  }

  const ICON = (c) => `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2" fill="${c}" opacity=".35"/><path d="M3 3 H17 V17 H3 Z" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
  B.register(Object.assign({
    id: 'dots',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#FFF8E7"/><rect x="8" y="8" width="12" height="12" fill="rgba(255,71,87,.4)"/><path d="M8 8 H20 V20 H8 Z" fill="none" stroke="#FF4757" stroke-width="2.4"/><path d="M20 20 H32 V32" fill="none" stroke="#3D7BFF" stroke-width="2.4"/><g fill="#3A3270"><circle cx="8" cy="8" r="2"/><circle cx="20" cy="8" r="2"/><circle cx="32" cy="8" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="20" cy="20" r="2"/><circle cx="32" cy="20" r="2"/><circle cx="8" cy="32" r="2"/><circle cx="20" cy="32" r="2"/><circle cx="32" cy="32" r="2"/></g></svg>',
    seats: [{ label: '빨강', sub: '먼저', icon: ICON(COL[0]) }, { label: '파랑', sub: '나중', icon: ICON(COL[1]) }],
    rulesText: '점 사이에 선을 하나씩 · 상자의 네 번째 선을 그으면 내 상자 + 한 번 더! · 세 번째 선은 상대에게 상자를 주니 조심',
    learn: '점 잇기 상자는 1889년 프랑스 수학자 에두아르 뤼카가 소개한 놀이예요. 고수들은 끝판에 일부러 상자 두 개를 상대에게 주고 더 긴 줄을 가져가는 "더블 크로스" 기술을 써요.',
    turnHint: '선을 그을 곳을 눌러요',
    viewCtx: () => ({}),
    status(st) { const [a, b] = R.score(st); return `상자 <b style="color:${COL[0]}">${a}</b> : <b style="color:${COL[1]}">${b}</b>${st.got && st.n < R.NL ? ' · <b>한 번 더!</b>' : ''}`; },
    mount,
    aiMinMs: [0, 600, 550, 500, 400, 350]
  }, B.std(R)));
})();
