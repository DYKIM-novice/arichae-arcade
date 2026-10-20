/* 아리채 오락실 · 체스 화면
   내 말을 누르면 갈 수 있는 칸에 점이 보여요 → 점을 누르면 이동. 끝줄에 닿은 폰은 바꿀 말을 골라요.
   흑으로 두면 판을 돌려서 내 말이 늘 아래쪽에 와요 */
(function () {
  'use strict';
  const B = window.Boards;
  const R = window.BoardRules.chess;
  const ART = window.ChessArt;
  const LIGHT = '#F0D9B5'; const DARK = '#B58863';

  const pieceSvg = (p, x, y, s) => `<g transform="translate(${x} ${y}) scale(${(s || 1) / 45})">${ART[p]}</g>`;
  const icon = (p) => `<svg viewBox="0 0 45 45" aria-hidden="true">${ART[p]}</svg>`;

  function mount(el, api) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ch-wrap';
    const sv = B.svg('0 0 8 8', 'ch-board');
    sv.innerHTML = '<g class="ch-sq"></g><g class="ch-mark"></g><g class="ch-pcs"></g><g class="ch-top"></g>';
    wrap.appendChild(sv);
    const promo = document.createElement('div');
    promo.className = 'ch-promo';
    wrap.appendChild(promo);
    el.appendChild(wrap);
    const gSq = sv.querySelector('.ch-sq'); const gMark = sv.querySelector('.ch-mark');
    const gPcs = sv.querySelector('.ch-pcs'); const gTop = sv.querySelector('.ch-top');

    let st = null; let vc = {}; let sel = -1; let flip = false; let legal = []; let lastKey = '';
    let drawnFlip = null;

    const disp = (i) => { const r = (i / 8) | 0; const c = i % 8; return flip ? [7 - c, 7 - r] : [c, r]; };
    const fromDisp = (x, y) => (flip ? (7 - y) * 8 + (7 - x) : y * 8 + x);

    function drawSquares() {
      let s = '';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += `<rect x="${x}" y="${y}" width="1" height="1" fill="${(x + y) % 2 ? DARK : LIGHT}"/>`;
      // 좌표 (아래 줄 글자, 왼쪽 줄 숫자)
      for (let k = 0; k < 8; k++) {
        const file = 'abcdefgh'[flip ? 7 - k : k]; const rank = flip ? k + 1 : 8 - k;
        s += `<text x="${k + 0.93}" y="7.95" text-anchor="end" font-size=".2" font-weight="700" fill="${k % 2 ? DARK : LIGHT}" font-family="sans-serif">${file}</text>`;
        s += `<text x=".05" y="${k + 0.22}" font-size=".2" font-weight="700" fill="${k % 2 ? LIGHT : DARK}" font-family="sans-serif">${rank}</text>`;
      }
      gSq.innerHTML = s;
      drawnFlip = flip;
    }

    function draw() {
      const me = st.turn;
      let mk = '';
      // 마지막 수
      if (st.last) st.last.forEach((i) => { const [x, y] = disp(i); mk += `<rect x="${x}" y="${y}" width="1" height="1" fill="rgba(255,214,10,.42)"/>`; });
      // 체크
      if (R.inCheck(st)) {
        const [x, y] = disp(st.b.indexOf(me === 0 ? 'K' : 'k'));
        mk += `<circle cx="${x + 0.5}" cy="${y + 0.5}" r=".5" fill="url(#chChk)"/>`;
      }
      if (sel >= 0) { const [x, y] = disp(sel); mk += `<rect x="${x}" y="${y}" width="1" height="1" fill="rgba(46,213,115,.5)"/>`; }
      // 힌트 (출발 → 도착)
      if (Array.isArray(vc.hint)) {
        vc.hint.slice(0, 2).forEach((i) => { const [x, y] = disp(i); mk += `<rect class="om-hint" x="${x + 0.04}" y="${y + 0.04}" width=".92" height=".92" rx=".1" fill="rgba(61,123,255,.35)" stroke="#3D7BFF" stroke-width=".07"/>`; });
      }
      gMark.innerHTML = `<defs><radialGradient id="chChk"><stop offset="0" stop-color="#FF2D2D" stop-opacity=".95"/><stop offset=".5" stop-color="#E80000" stop-opacity=".6"/><stop offset="1" stop-color="#A60000" stop-opacity="0"/></radialGradient></defs>${mk}`;
      // 말 (막 움직인 말은 미끄러지듯)
      const key = st.last ? st.last.join('-') + '#' + st.n : '';
      const slide = key !== lastKey && st.last;
      lastKey = key;
      let pc = '';
      for (let i = 0; i < 64; i++) {
        const p = st.b[i];
        if (!p) continue;
        const [x, y] = disp(i);
        let style = '';
        if (slide && i === st.last[1]) {
          const [fx, fy] = disp(st.last[0]);
          style = ` class="ch-slide" style="--dx:${fx - x}px;--dy:${fy - y}px"`;
        }
        pc += `<g${style}>${pieceSvg(p, x, y)}</g>`;
      }
      gPcs.innerHTML = pc;
      // 갈 수 있는 칸
      let top = '';
      if (sel >= 0) {
        const seen = new Set();
        legal.filter((m) => m[0] === sel).forEach((m) => {
          if (seen.has(m[1])) return; seen.add(m[1]);
          const [x, y] = disp(m[1]);
          const capture = st.b[m[1]] || (st.b[sel].toLowerCase() === 'p' && m[1] === st.ep);
          top += capture ? `<circle cx="${x + 0.5}" cy="${y + 0.5}" r=".44" fill="none" stroke="rgba(20,85,30,.55)" stroke-width=".09"/>`
            : `<circle cx="${x + 0.5}" cy="${y + 0.5}" r=".16" fill="rgba(20,85,30,.5)"/>`;
        });
      }
      (vc.targets || []).forEach((m) => { const [x, y] = disp(m[1]); top += `<rect class="om-target" x="${x + 0.06}" y="${y + 0.06}" width=".88" height=".88" rx=".12" fill="rgba(255,210,63,.3)" stroke="#FFD23F" stroke-width=".08"/>`; });
      gTop.innerHTML = top;
    }

    function render(state, ctx) {
      st = state; vc = ctx || {};
      flip = vc.mySeat === 1;
      if (drawnFlip !== flip) drawSquares();
      legal = vc.canPlay ? R.moves(st) : [];
      if (sel >= 0 && (!vc.canPlay || !legal.some((m) => m[0] === sel))) sel = -1;
      if (!vc.canPlay) hidePromo();
      draw();
    }

    function hidePromo() { promo.classList.remove('show'); promo.innerHTML = ''; }
    function askPromo(f, t) {
      const white = st.turn === 0;
      promo.innerHTML = `<div class="ch-promo-box"><b>폰을 무엇으로 바꿀까요?</b><div class="ch-promo-row">${['q', 'r', 'b', 'n'].map((x) =>
        `<button type="button" data-promo="${x}">${icon(white ? x.toUpperCase() : x)}<span>${R.NAMES[x]}</span></button>`).join('')}</div>
        <button type="button" class="ch-promo-x" data-promo="x">취소</button></div>`;
      promo.classList.add('show');
      promo.onclick = (e) => {
        const b = e.target.closest('[data-promo]');
        if (!b) return;
        const x = b.dataset.promo;
        hidePromo();
        if (x === 'x') { sel = -1; draw(); return; }
        sel = -1;
        api.pick([f, t, x]);
      };
    }

    sv.addEventListener('pointerdown', (ev) => {
      if (!st || !vc.canPlay) return;
      ev.preventDefault();
      const [fx, fy] = B.svgPoint(sv, ev);
      const x = Math.floor(fx); const y = Math.floor(fy);
      if (x < 0 || y < 0 || x > 7 || y > 7) return;
      const i = fromDisp(x, y);
      const p = st.b[i];
      const mine = p && R.colorOf(p) === st.turn;
      if (sel >= 0) {
        const ms = legal.filter((m) => m[0] === sel && m[1] === i);
        if (ms.length) {
          if (ms.length > 1) { askPromo(sel, i); return; }
          const m = ms[0];
          sel = -1;
          api.pick(m);
          return;
        }
        if (i === sel) { sel = -1; draw(); return; }
      }
      if (mine) {
        if (!legal.some((m) => m[0] === i)) { api.say(R.inCheck(st) ? '체크예요! 킹을 지키는 수만 둘 수 있어요' : '그 말은 지금 움직일 수 없어요'); sel = -1; draw(); return; }
        sel = i; api.tick(); draw(); return;
      }
      if (sel >= 0) api.say(R.inCheck(st) ? '체크예요! 킹을 지켜야 해요' : '거기로는 갈 수 없어요');
      else api.say('움직일 내 말을 먼저 눌러요');
    });
    return { render, commit() {}, clear() { sel = -1; if (st) draw(); }, destroy() { el.innerHTML = ''; } };
  }

  // 잡힌 말 (처음 말에서 빠진 것) — 상태 줄에 작은 그림으로
  const FULL = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  function captured(st) {
    const cnt = {};
    st.b.forEach((p) => { if (p) cnt[p] = (cnt[p] || 0) + 1; });
    const lost = (white) => {
      let s = ''; let v = 0;
      ['q', 'r', 'b', 'n', 'p'].forEach((t) => {
        const ch = white ? t.toUpperCase() : t;
        const gone = Math.max(0, FULL[t] - (cnt[ch] || 0));
        for (let k = 0; k < gone; k++) s += `<span class="ch-cap">${icon(ch)}</span>`;
        v += gone * VALUE[t];
      });
      return { s, v };
    };
    return { byWhite: lost(false), byBlack: lost(true) };
  }

  B.register(Object.assign({
    id: 'chess',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="5" fill="${LIGHT}"/><path d="M2 2h9v9H2zM20 2h9v9h-9zM11 11h9v9h-9zM29 11h9v9h-9zM2 20h9v9H2zM20 20h9v9h-9zM11 29h9v9h-9zM29 29h9v9h-9z" fill="${DARK}"/><g transform="translate(4 3) scale(.72)">${ART.N}</g><g transform="translate(15 6) scale(.6)">${ART.k}</g></svg>`,
    seats: [{ label: '백', sub: '먼저', icon: icon('K') }, { label: '흑', sub: '나중', icon: icon('k') }],
    rulesText: '킹을 잡을 수밖에 없게 몰면(체크메이트) 승리 · 캐슬링·앙파상 있음 · 끝줄에 닿은 폰은 원하는 말로 승진 · 둘 곳이 없으면(스테일메이트) 비김',
    learn: '체스는 1500년 전 인도의 "차투랑가"에서 시작됐어요. 장기와 형제 놀이랍니다! 1997년 컴퓨터 "딥 블루"가 세계 챔피언 카스파로프를 이겨서 크게 화제가 됐어요. (말 그림: Colin M.L. Burnett)',
    turnHint: '움직일 말을 눌러요',
    status(st) {
      const c = captured(st);
      const diff = c.byWhite.v - c.byBlack.v;
      const chk = !R.result(st) && R.inCheck(st) ? '<b class="ch-check">체크!</b> ' : '';
      const line = (who, x, d) => (x.s ? `<span class="ch-caps">${who} ${x.s}${d > 0 ? ` <small>+${d}</small>` : ''}</span>` : '');
      const caps = line('백', c.byWhite, diff) + line('흑', c.byBlack, -diff);
      return chk + (caps || (chk ? '' : '<span class="ch-caps">잡은 말 없음</span>'));
    },
    viewCtx: () => ({}), mount,
    aiMinMs: [0, 650, 600, 550, 450, 300]
  }, B.std(R)));
})();
