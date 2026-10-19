/* 아리채 오락실 · 만칼라 화면 (세로 판: 왼쪽 줄이 내 구멍, 위가 내 창고)
   구멍을 누르면 구슬이 하나씩 퍼져 나가요 */
(function () {
  'use strict';

  const B = window.Boards;
  const R = window.BoardRules.mancala;
  const GEM = ['#FF6B81', '#FFD23F', '#7DF0AE', '#A9C4FF', '#C7A0FF', '#FF9F5A', '#7FE3F0'];

  function rnd(seed) { let a = seed; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; }
  // 구멍 안 구슬 모양 (개수가 같으면 늘 같은 배치)
  function gems(cx, cy, n, rad) {
    const r = rnd(n * 31 + Math.round(cx * 10) + Math.round(cy * 7));
    let out = '';
    const show = Math.min(n, 18);
    for (let k = 0; k < show; k++) {
      const a = r() * Math.PI * 2; const d = Math.sqrt(r()) * rad;
      const x = cx + Math.cos(a) * d; const y = cy + Math.sin(a) * d;
      const c = GEM[(k + n) % GEM.length];
      out += `<circle cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r=".17" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width=".03"/><circle cx="${(x - 0.05).toFixed(3)}" cy="${(y - 0.06).toFixed(3)}" r=".05" fill="rgba(255,255,255,.7)"/>`;
    }
    return out;
  }

  function mount(el, api) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'mc-wrap';
    const sv = B.svg('0 0 6 11', 'mc-board');
    wrap.appendChild(sv);
    el.appendChild(wrap);
    let st = null; let vc = {}; let prev = null;

    // 화면 위치: mySeat 가 왼쪽 줄 + 위 창고가 되도록
    function layout(me) {
      const pos = {};
      const L = R.pitsOf(me); const Rr = R.pitsOf(1 - me);
      L.forEach((j, k) => { pos[j] = [1.6, 8.6 - k * 1.25]; });       // 왼쪽 줄: 아래→위
      Rr.forEach((j, k) => { pos[j] = [4.4, 2.35 + k * 1.25]; });     // 오른쪽 줄: 위→아래
      pos[R.store(me)] = [3, 0.95];   // 위: 내 창고
      pos[R.store(1 - me)] = [3, 10.05];
      return pos;
    }

    function render(state, ctx) {
      st = state; vc = ctx || {};
      const me = vc.mySeat == null ? 0 : vc.mySeat;
      const pos = layout(me);
      const legal = vc.canPlay ? R.moves(st) : [];
      const changed = new Set();
      if (prev) for (let j = 0; j < 14; j++) if (prev[j] !== st.p[j]) changed.add(j);
      let out = `<defs><linearGradient id="mcWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B9773D"/><stop offset="1" stop-color="#8E5524"/></linearGradient>
        <radialGradient id="mcHole" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#4A2A10"/><stop offset="1" stop-color="#6E4019"/></radialGradient></defs>
        <rect x=".15" y=".1" width="5.7" height="10.8" rx=".9" fill="url(#mcWood)" stroke="#5E3714" stroke-width=".08"/>`;
      const label = (j) => (j === R.store(0) || j === R.store(1));
      for (let j = 0; j < 14; j++) {
        const [x, y] = pos[j];
        const isStore = label(j);
        const n = st.p[j];
        const pathIdx = (st.path || []).indexOf(j);
        const anim = changed.has(j) && pathIdx >= 0 ? ` style="animation-delay:${(pathIdx * 0.09).toFixed(2)}s"` : '';
        const can = legal.includes(j);
        if (isStore) {
          out += `<g class="mc-pit store${changed.has(j) ? ' hit' : ''}"${anim}><rect x="${x - 2.3}" y="${y - 0.62}" width="4.6" height="1.24" rx=".62" fill="url(#mcHole)"/>${gems(x, y, n, 0.42)}
            <text x="${x + 1.95}" y="${y + 0.18}" text-anchor="end" font-size=".55" fill="#FFE7B0" font-family="Black Han Sans, sans-serif">${n}</text>
            <text x="${x - 2.0}" y="${y + 0.14}" font-size=".32" fill="#E8C690">${j === R.store(me) ? '내 창고' : '상대 창고'}</text></g>`;
        } else {
          out += `<g class="mc-pit${can ? ' can' : ''}${changed.has(j) ? ' hit' : ''}${st.cap === j ? ' cap' : ''}" data-pit="${j}"${anim}>
            <circle cx="${x}" cy="${y}" r=".56" fill="url(#mcHole)" ${can ? 'stroke="#FFD23F" stroke-width=".07"' : ''}/>${gems(x, y, n, 0.32)}
            <text x="${x + (x < 3 ? -0.95 : 0.95)}" y="${y + 0.16}" text-anchor="middle" font-size=".42" fill="#FFE7B0" font-family="Black Han Sans, sans-serif">${n}</text>
            ${st.last === j ? `<circle cx="${x}" cy="${y}" r=".62" fill="none" stroke="#FF4757" stroke-width=".05" stroke-dasharray=".12 .08"/>` : ''}</g>`;
        }
      }
      if (vc.hint != null && vc.hint >= 0) {
        const [x, y] = pos[vc.hint];
        out += `<circle class="om-hint" cx="${x}" cy="${y}" r=".6" fill="rgba(61,123,255,.3)" stroke="#3D7BFF" stroke-width=".07"/>`;
      }
      sv.innerHTML = out;
      prev = st.p.slice();
    }
    sv.addEventListener('pointerdown', (ev) => {
      if (!st || !vc.canPlay) return;
      const g = ev.target.closest('[data-pit]');
      if (!g) return;
      ev.preventDefault();
      const j = Number(g.dataset.pit);
      if (!R.moves(st).includes(j)) { api.say(st.p[j] ? '내 쪽(왼쪽 줄) 구멍만 고를 수 있어요' : '빈 구멍은 고를 수 없어요'); return; }
      api.pick(j);
    });
    return { render, commit() {}, clear() {}, destroy() { el.innerHTML = ''; } };
  }

  const ICON = (c) => `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#6E4019"/><circle cx="7" cy="9" r="2.6" fill="${c}"/><circle cx="12" cy="8" r="2.6" fill="${c}"/><circle cx="10" cy="12.5" r="2.6" fill="${c}"/></svg>`;
  B.register(Object.assign({
    id: 'mancala',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="8" width="34" height="24" rx="10" fill="#A9682F"/><ellipse cx="9" cy="20" rx="4" ry="8" fill="#5A3313"/><ellipse cx="31" cy="20" rx="4" ry="8" fill="#5A3313"/><circle cx="16" cy="15" r="3" fill="#5A3313"/><circle cx="24" cy="15" r="3" fill="#5A3313"/><circle cx="16" cy="25" r="3" fill="#5A3313"/><circle cx="24" cy="25" r="3" fill="#5A3313"/><circle cx="16" cy="15" r="1.3" fill="#FFD23F"/><circle cx="24" cy="25" r="1.3" fill="#7DF0AE"/><circle cx="9" cy="18" r="1.3" fill="#FF6B81"/></svg>',
    seats: [{ label: '먼저', sub: '', icon: ICON('#FF6B81') }, { label: '나중', sub: '', icon: ICON('#7DF0AE') }],
    rulesText: '내 구멍을 고르면 구슬을 하나씩 나눠 넣어요 · 마지막 구슬이 내 창고면 한 번 더 · 내 빈 구멍에 끝나면 맞은편 구슬까지 잡기 · 창고에 많이 모으면 승리',
    learn: '만칼라는 수천 년 전 아프리카와 중동에서 시작된 "씨앗 뿌리기" 놀이예요. 세계에서 가장 오래된 보드게임 가운데 하나로, 덧셈과 앞을 내다보는 계산을 함께 익힐 수 있어요.',
    turnHint: '구멍을 골라요',
    viewCtx: () => ({}),
    status(st) {
      return `창고 ${st.p[6]} : ${st.p[13]}${st.again && !st.over ? ' · <b>한 번 더!</b>' : ''}`;
    },
    mount,
    aiMinMs: [0, 700, 650, 600, 500, 400]
  }, B.std(R)));
})();
