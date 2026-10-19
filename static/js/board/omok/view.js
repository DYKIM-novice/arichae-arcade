/* 아리채 오락실 · 오목 화면
   - 손가락으로 한 번 누르면 '놓을 자리'가 보이고, 같은 자리를 한 번 더 누르거나 [여기에 두기] 로 확정
   - 지금 차례인 사람이 둘 수 없는 3·3 자리는 ✕ 로 보여요 */
(function () {
  'use strict';

  const R = window.BoardRules.omok;
  const N = R.N;
  const STAR = [3 * N + 3, 3 * N + 11, 11 * N + 3, 11 * N + 11, 7 * N + 7];
  const SVGNS = 'http://www.w3.org/2000/svg';

  const STONE_ICON = {
    // 아이콘은 그라데이션 없이 (숨겨진 화면에 있으면 그라데이션이 안 보여요)
    black: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#1A1A22" stroke="#55556A" stroke-width="1"/><circle cx="7.4" cy="7" r="2.4" fill="#5C5C6E" opacity=".7"/></svg>',
    white: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#F4F1EA" stroke="#B9B4A8" stroke-width="1"/><circle cx="7.4" cy="7" r="2.4" fill="#fff"/></svg>'
  };

  function mount(el, api) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'om-wrap';
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '-0.15 -0.15 15.3 15.3');
    svg.setAttribute('class', 'om-board');
    let html = `<defs>
      <radialGradient id="omB" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#6A6A78"/><stop offset=".45" stop-color="#22222B"/><stop offset="1" stop-color="#08080E"/></radialGradient>
      <radialGradient id="omW" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#EEEBE3"/><stop offset="1" stop-color="#C6C0B2"/></radialGradient>
      <linearGradient id="omWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EBC27A"/><stop offset=".5" stop-color="#E2B266"/><stop offset="1" stop-color="#D9A456"/></linearGradient>
      <filter id="omSh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx=".06" dy=".09" stdDeviation=".06" flood-color="#3A2405" flood-opacity=".55"/></filter>
    </defs>
    <rect x="-0.15" y="-0.15" width="15.3" height="15.3" rx=".35" fill="url(#omWood)"/>
    <g class="om-grain" opacity=".18">${[1.3, 3.7, 6.2, 8.9, 11.4, 13.6].map((y) => `<path d="M-0.1 ${y} Q4 ${y - 0.35} 8 ${y + 0.15} T15.1 ${y - 0.1}" stroke="#A9762E" stroke-width=".07" fill="none"/>`).join('')}</g>`;
    html += '<g class="om-grid" stroke="#5A3A12" stroke-width=".045">';
    for (let i = 0; i < N; i++) {
      html += `<line x1=".5" y1="${i + 0.5}" x2="${N - 0.5}" y2="${i + 0.5}"/><line x1="${i + 0.5}" y1=".5" x2="${i + 0.5}" y2="${N - 0.5}"/>`;
    }
    html += `<rect x=".5" y=".5" width="${N - 1}" height="${N - 1}" fill="none" stroke-width=".08"/></g>`;
    html += STAR.map((i) => `<circle cx="${(i % N) + 0.5}" cy="${((i / N) | 0) + 0.5}" r=".12" fill="#5A3A12"/>`).join('');
    html += '<g class="om-marks"></g><g class="om-stones"></g><g class="om-top"></g>';
    svg.innerHTML = html;
    wrap.appendChild(svg);
    el.appendChild(wrap);
    const gMarks = svg.querySelector('.om-marks');
    const gStones = svg.querySelector('.om-stones');
    const gTop = svg.querySelector('.om-top');

    let st = null;
    let vc = {};
    let sel = -1;
    let shown = new Int8Array(N * N);   // 이미 그린 돌 (새 돌만 애니메이션)

    function xy(i) { return [(i % N) + 0.5, ((i / N) | 0) + 0.5]; }

    function drawStones() {
      // 처음부터 다시 그리기 (무르기·새 판 대비), 새로 생긴 돌만 톡 떨어지게
      const cells = st.cells;
      const last = st.moves[st.moves.length - 1];
      let out = '';
      const numbers = vc.numbers ? new Map(st.moves.map((m, k) => [m, k + 1])) : null;
      for (let i = 0; i < N * N; i++) {
        const c = cells[i];
        if (!c) continue;
        const [x, y] = xy(i);
        const isNew = !shown[i] || shown[i] !== c;
        out += `<g class="om-st${isNew ? ' new' : ''}" style="transform-origin:${x}px ${y}px"><circle cx="${x}" cy="${y}" r=".46" fill="url(#${c === 1 ? 'omB' : 'omW'})" filter="url(#omSh)"/>`;
        if (numbers && numbers.has(i)) out += `<text x="${x}" y="${y + 0.16}" text-anchor="middle" font-size=".42" fill="${c === 1 ? '#fff' : '#222'}" font-family="sans-serif">${numbers.get(i)}</text>`;
        else if (i === last) out += `<circle cx="${x}" cy="${y}" r=".13" fill="#FF4757"/>`;
        out += '</g>';
      }
      gStones.innerHTML = out;
      shown = new Int8Array(cells);
    }

    function drawMarks() {
      let out = '';
      if (vc.forbidden) {
        vc.forbidden.forEach((i) => {
          const [x, y] = xy(i);
          out += `<g class="om-x"><path d="M${x - 0.22} ${y - 0.22} L${x + 0.22} ${y + 0.22} M${x + 0.22} ${y - 0.22} L${x - 0.22} ${y + 0.22}" stroke="#E8263B" stroke-width=".11" stroke-linecap="round"/></g>`;
        });
      }
      (vc.targets || []).forEach((i) => {
        const [x, y] = xy(i);
        out += `<circle class="om-target" cx="${x}" cy="${y}" r=".42" fill="rgba(255,210,63,.35)" stroke="#FFD23F" stroke-width=".08"/>`;
      });
      (vc.circles || []).forEach(([i, color]) => {
        const [x, y] = xy(i);
        out += `<circle cx="${x}" cy="${y}" r=".5" fill="none" stroke="${color || '#3D7BFF'}" stroke-width=".09" stroke-dasharray=".18 .1"/>`;
      });
      if (vc.hint != null && vc.hint >= 0) {
        const [x, y] = xy(vc.hint);
        out += `<circle class="om-hint" cx="${x}" cy="${y}" r=".45" fill="rgba(61,123,255,.35)" stroke="#3D7BFF" stroke-width=".1"/>`;
      }
      gMarks.innerHTML = out;
      let top = '';
      if (st.line) {
        const a = xy(st.line[0]); const b = xy(st.line[st.line.length - 1]);
        top += `<line class="om-win" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#FFD23F" stroke-width=".22" stroke-linecap="round"/>`;
      }
      if (sel >= 0) {
        const [x, y] = xy(sel);
        const c = st.turn === 1 ? 'omB' : 'omW';
        top += `<g class="om-sel"><line x1=".5" y1="${y}" x2="${N - 0.5}" y2="${y}" stroke="#FF4757" stroke-width=".05" opacity=".7"/><line x1="${x}" y1=".5" x2="${x}" y2="${N - 0.5}" stroke="#FF4757" stroke-width=".05" opacity=".7"/>
          <circle cx="${x}" cy="${y}" r=".46" fill="url(#${c})" opacity=".72"/><circle cx="${x}" cy="${y}" r=".55" fill="none" stroke="#FF4757" stroke-width=".07"/></g>`;
      }
      gTop.innerHTML = top;
    }

    function render(state, ctx) {
      st = state;
      vc = ctx || {};
      if (sel >= 0 && (!vc.canPlay || st.cells[sel])) setSel(-1, true);
      drawStones();
      drawMarks();
    }

    function setSel(i, silent) {
      sel = i;
      api.selecting(i >= 0, i >= 0 ? `${String.fromCharCode(65 + (i % N))}${N - ((i / N) | 0)}` : '');
      if (!silent) drawMarks();
    }

    function commit() {
      if (sel < 0) return;
      const i = sel;
      setSel(-1);
      api.pick(i);
    }

    function pointToCell(ev) {
      const r = svg.getBoundingClientRect();
      const fx = ((ev.clientX - r.left) / r.width) * 15.3 - 0.15;
      const fy = ((ev.clientY - r.top) / r.height) * 15.3 - 0.15;
      const x = Math.floor(fx);
      const y = Math.floor(fy);
      if (x < 0 || y < 0 || x >= N || y >= N) return -1;
      return y * N + x;
    }

    svg.addEventListener('pointerdown', (ev) => {
      if (!st || !vc.canPlay) return;
      ev.preventDefault();
      const i = pointToCell(ev);
      if (i < 0) return;
      if (st.cells[i]) { api.say('이미 돌이 있어요'); return; }
      if ((vc.forbidden || []).includes(i)) { api.say('3·3 은 둘 수 없어요 (✕ 자리)'); api.buzz(); return; }
      if (i === sel) { commit(); return; }
      setSel(i);
      api.tick();
    });

    return { render, commit, clear: () => setSel(-1), destroy() { el.innerHTML = ''; } };
  }

  // 판 상태를 다시 만들기 (moves = 칸 번호 목록)
  function replay(moves) { return R.replay(moves || []); }
  function turnSeat(st) { return st.turn === R.BLACK ? 0 : 1; }
  function result(st) {
    if (!st.over) return null;
    return { winner: st.winner === R.BLACK ? 0 : st.winner === R.WHITE ? 1 : -1 };
  }
  function legal(st, m) { return R.legal(st, m); }
  function viewCtx(st) { return { forbidden: R.forbiddenList(st) }; }

  window.Boards.register({
    id: 'omok',
    icon: '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#E2B266"/><path d="M8 2v36M16 2v36M24 2v36M32 2v36M2 8h36M2 16h36M2 24h36M2 32h36" stroke="#8A5A1E" stroke-width="1.2"/><circle cx="8" cy="32" r="4.2" fill="#1A1A22"/><circle cx="16" cy="24" r="4.2" fill="#1A1A22"/><circle cx="24" cy="16" r="4.2" fill="#1A1A22"/><circle cx="32" cy="8" r="4.2" fill="#1A1A22"/><circle cx="16" cy="32" r="4.2" fill="#F4F1EA"/><circle cx="24" cy="24" r="4.2" fill="#F4F1EA"/></svg>',
    seats: [{ label: '흑', sub: '먼저', icon: STONE_ICON.black }, { label: '백', sub: '나중', icon: STONE_ICON.white }],
    rulesText: '다섯 개를 먼저 이으면 승리 · 3·3 금지(흑·백 모두, ✕ 표시) · 4·4 허용 · 6목은 승리 아님',
    learn: '오목은 바둑판에서 하는 놀이로, 한국·중국·일본에서 오래전부터 즐겨 왔어요. 먼저 두는 흑이 유리해서 정식 대회(렌주)에서는 흑에게만 3·3·4·4·6목을 금지해요. 우리 집 규칙은 흑·백 모두 3·3 금지!',
    replay, turnSeat, result, legal, viewCtx, mount,
    aiMinMs: [0, 700, 650, 600, 450, 300]
  });
})();
