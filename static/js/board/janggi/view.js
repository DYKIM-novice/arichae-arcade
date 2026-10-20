/* 아리채 오락실 · 장기 화면
   - 시작하면 각자 상차림(마·상 자리)을 골라요
   - 내 말을 누르면 갈 수 있는 곳에 점이 보여요 → 점을 누르면 이동 (말 설명이 위에 잠깐 떠요)
   - 한(위쪽)으로 두면 판을 돌려서 내 말이 늘 아래에 와요 */
(function () {
  'use strict';
  const B = window.Boards;
  const R = window.BoardRules.janggi;
  const W = R.W; const H = R.H;
  const M = 0.62;                       // 판 가장자리
  const VW = (W - 1) + M * 2; const VH = (H - 1) + M * 2;
  const COL = [{ ink: '#0E7A3E', ring: '#1B6B3A' }, { ink: '#C8102E', ring: '#A3162A' }];
  const SIZE = { K: 0.47, R: 0.41, C: 0.41, H: 0.41, E: 0.41, A: 0.33, P: 0.33 };
  const HOW = {
    K: '궁 · 궁성 안에서 선을 따라 한 칸씩 (대각선 선도 OK)',
    A: '사 · 궁을 지켜요. 궁성 안에서 선을 따라 한 칸씩',
    R: '차 · 가로세로로 쭉! 궁성에서는 대각선 선을 따라서도 가요',
    C: '포 · 말 하나를 꼭 뛰어넘어야 움직여요 (포는 못 넘고, 포는 못 잡아요)',
    H: '마 · 곧게 한 칸 + 대각선 한 칸 (곧게 갈 자리가 막히면 못 가요)',
    E: '상 · 곧게 한 칸 + 대각선 두 칸 (지나는 자리가 막히면 못 가요)',
    P: '졸 · 앞이나 옆으로 한 칸 (뒤로는 못 가요). 상대 궁성 안에서는 대각선 앞으로도'
  };
  const FONT = "'Noto Serif KR', 'Nanum Myeongjo', 'Batang', serif";

  function oct(cx, cy, r) {
    let d = '';
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + (Math.PI / 4) * k;
      d += `${k ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(3)} ${(cy + Math.sin(a) * r).toFixed(3)}`;
    }
    return d + 'Z';
  }
  function pieceSvg(p, x, y) {
    const who = R.side(p); const k = R.kind(p); const r = SIZE[k];
    const c = COL[who];
    return `<path d="${oct(x, y + 0.05, r)}" fill="rgba(40,20,0,.45)"/>
      <path d="${oct(x, y, r)}" fill="url(#jgFace)" stroke="${c.ring}" stroke-width="${r * 0.09}"/>
      <path d="${oct(x, y, r * 0.8)}" fill="none" stroke="${c.ring}" stroke-width="${r * 0.035}" opacity=".55"/>
      <text x="${x}" y="${y + r * 0.04}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-weight="700" font-size="${r * 1.12}" fill="${c.ink}">${R.HANJA[k][who]}</text>`;
  }
  const icon = (p) => `<svg viewBox="-0.5 -0.5 1 1" aria-hidden="true">${pieceSvg(p, 0, 0).replace(/url\(#jgFace\)/g, '#FBF1D9')}</svg>`;

  function board() {
    let s = `<defs><linearGradient id="jgWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EFCF8F"/><stop offset="1" stop-color="#DDB46A"/></linearGradient>
      <radialGradient id="jgFace" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#FFFBF0"/><stop offset=".7" stop-color="#F6E6C2"/><stop offset="1" stop-color="#E6CF9C"/></radialGradient>
      <radialGradient id="jgChk"><stop offset="0" stop-color="#FF2D2D" stop-opacity=".9"/><stop offset="1" stop-color="#FF2D2D" stop-opacity="0"/></radialGradient></defs>
      <rect x="0" y="0" width="${VW}" height="${VH}" rx=".3" fill="url(#jgWood)"/>
      <g stroke="#5A3A12" stroke-width=".04" stroke-linecap="round">`;
    for (let r = 0; r < H; r++) s += `<line x1="${M}" y1="${M + r}" x2="${M + W - 1}" y2="${M + r}"/>`;
    for (let c = 0; c < W; c++) s += `<line x1="${M + c}" y1="${M}" x2="${M + c}" y2="${M + H - 1}"/>`;
    // 궁성 대각선
    [0, 7].forEach((t) => {
      s += `<line x1="${M + 3}" y1="${M + t}" x2="${M + 5}" y2="${M + t + 2}"/><line x1="${M + 5}" y1="${M + t}" x2="${M + 3}" y2="${M + t + 2}"/>`;
    });
    s += `<rect x="${M}" y="${M}" width="${W - 1}" height="${H - 1}" fill="none" stroke-width=".08"/></g>`;
    return s;
  }

  function mount(el, api) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'jg-wrap';
    const sv = B.svg(`0 0 ${VW} ${VH}`, 'jg-board');
    sv.innerHTML = `${board()}<g class="jg-mark"></g><g class="jg-pcs"></g><g class="jg-top"></g>`;
    wrap.appendChild(sv);
    const cap = document.createElement('div'); cap.className = 'jg-cap'; wrap.appendChild(cap);
    const pick = document.createElement('div'); pick.className = 'jg-setup'; wrap.appendChild(pick);
    el.appendChild(wrap);
    const gMark = sv.querySelector('.jg-mark'); const gPcs = sv.querySelector('.jg-pcs'); const gTop = sv.querySelector('.jg-top');
    let st = null; let vc = {}; let sel = -1; let flip = false; let legal = []; let lastKey = ''; let setupShown = '';

    const disp = (i) => { const r = (i / W) | 0; const c = i % W; return flip ? [M + (W - 1 - c), M + (H - 1 - r)] : [M + c, M + r]; };
    function nearest(x, y) {
      let c = Math.round(x - M); let r = Math.round(y - M);
      if (flip) { c = W - 1 - c; r = H - 1 - r; }
      if (c < 0 || c >= W || r < 0 || r >= H) return -1;
      return r * W + c;
    }

    function draw() {
      let mk = '';
      if (st.last) st.last.forEach((i, k) => { const [x, y] = disp(i); mk += `<circle cx="${x}" cy="${y}" r="${k ? 0.5 : 0.22}" fill="rgba(255,120,0,${k ? 0.3 : 0.35})"/>`; });
      if (st.phase === 'play' && !R.result(st) && R.inCheck(st)) {
        const [x, y] = disp(st.b.indexOf(st.turn === 0 ? 'K' : 'k'));
        mk += `<circle cx="${x}" cy="${y}" r=".75" fill="url(#jgChk)"/>`;
      }
      if (Array.isArray(vc.hint)) vc.hint.forEach((i) => { const [x, y] = disp(i); mk += `<circle class="om-hint" cx="${x}" cy="${y}" r=".48" fill="rgba(61,123,255,.35)" stroke="#3D7BFF" stroke-width=".07"/>`; });
      (vc.targets || []).forEach((m) => { m.forEach((i, k) => { const [x, y] = disp(i); mk += `<circle class="om-target" cx="${x}" cy="${y}" r="${k ? 0.48 : 0.44}" fill="rgba(255,210,63,${k ? 0.35 : 0.15})" stroke="#FFD23F" stroke-width=".07"/>`; }); });
      if (sel >= 0) { const [x, y] = disp(sel); mk += `<circle cx="${x}" cy="${y}" r=".55" fill="rgba(46,213,115,.45)"/>`; }
      gMark.innerHTML = mk;
      const key = st.last ? st.last.join('-') + '#' + st.n : '';
      const slide = key !== lastKey && st.last;
      lastKey = key;
      let pc = '';
      for (let i = 0; i < W * H; i++) {
        const p = st.b[i];
        if (!p) continue;
        const [x, y] = disp(i);
        let attr = '';
        if (slide && i === st.last[1]) { const [fx, fy] = disp(st.last[0]); attr = ` class="ch-slide" style="--dx:${fx - x}px;--dy:${fy - y}px"`; }
        pc += `<g${attr}>${pieceSvg(p, x, y)}</g>`;
      }
      // 상차림 고르는 중: 비어 있는 마·상 자리
      if (st.phase === 'setup') {
        [0, 1].forEach((who) => {
          if (st.setups[who] >= 0) return;
          const r = who === 0 ? 9 : 0;
          [1, 2, 6, 7].forEach((c) => { const [x, y] = disp(r * W + c); pc += `<path d="${oct(x, y, 0.41)}" fill="rgba(255,255,255,.25)" stroke="${COL[who].ring}" stroke-width=".04" stroke-dasharray=".1 .08"/>`; });
        });
      }
      gPcs.innerHTML = pc;
      let top = '';
      if (sel >= 0) {
        legal.filter((m) => m[0] === sel).forEach(([, t]) => {
          const [x, y] = disp(t);
          top += st.b[t] ? `<circle cx="${x}" cy="${y}" r=".5" fill="none" stroke="rgba(20,120,50,.75)" stroke-width=".08"/>` : `<circle cx="${x}" cy="${y}" r=".15" fill="rgba(20,120,50,.7)"/>`;
        });
      }
      gTop.innerHTML = top;
    }

    function showSetup() {
      const want = st.phase === 'setup' && vc.canPlay ? 'me' + st.turn : '';
      if (want === setupShown) return;
      setupShown = want;
      if (!want) { pick.classList.remove('show'); pick.innerHTML = ''; return; }
      const who = st.turn;
      const pc = (k) => icon(who === 0 ? k : k.toLowerCase());
      pick.innerHTML = `<div class="jg-setup-box"><b>상차림을 골라요</b><small>마(馬)·상(象)을 놓을 자리예요. 내 왼쪽부터 오른쪽 순서</small>
        <div class="jg-setup-list">${R.SETUPS.map((s, k) => `<button type="button" data-setup="${k}">
          <span class="jg-row">${pc('R')}${pc(s.p[0])}${pc(s.p[1])}${pc('A')}<i></i>${pc('A')}${pc(s.p[2])}${pc(s.p[3])}${pc('R')}</span><span>${s.name}</span></button>`).join('')}</div></div>`;
      pick.classList.add('show');
    }
    pick.addEventListener('click', (e) => {
      const b = e.target.closest('[data-setup]');
      if (!b || !vc.canPlay) return;
      api.tick();
      setupShown = '';
      pick.classList.remove('show');
      api.pick({ s: Number(b.dataset.setup) });
    });

    let capT = 0;
    function caption(txt) {
      cap.textContent = txt || '';
      cap.classList.toggle('show', !!txt);
      clearTimeout(capT);
      if (txt) capT = setTimeout(() => cap.classList.remove('show'), 3200);
    }

    function render(state, ctx) {
      st = state; vc = ctx || {};
      flip = vc.mySeat === 1;
      legal = vc.canPlay && st.phase === 'play' ? R.moves(st).filter((m) => m !== 'pass') : [];
      if (sel >= 0 && (!vc.canPlay || !legal.some((m) => m[0] === sel))) sel = -1;
      showSetup();
      draw();
    }

    sv.addEventListener('pointerdown', (ev) => {
      if (!st || !vc.canPlay || st.phase !== 'play') return;
      ev.preventDefault();
      const [x, y] = B.svgPoint(sv, ev);
      const i = nearest(x, y);
      if (i < 0) return;
      const p = st.b[i];
      const mine = p && R.side(p) === st.turn;
      if (sel >= 0) {
        const m = legal.find((mm) => mm[0] === sel && mm[1] === i);
        if (m) { sel = -1; caption(''); api.pick(m); return; }
        if (i === sel) { sel = -1; caption(''); draw(); return; }
      }
      if (mine) {
        caption(HOW[R.kind(p)]);
        if (!legal.some((m) => m[0] === i)) { api.say(R.inCheck(st) ? '장군이에요! 궁을 지키는 수만 둘 수 있어요' : '그 말은 지금 갈 곳이 없어요'); sel = -1; draw(); return; }
        sel = i; api.tick(); draw(); return;
      }
      if (sel >= 0) api.say(R.inCheck(st) ? '장군이에요! 궁을 지켜야 해요' : '거기로는 갈 수 없어요');
      else if (p) { caption(HOW[R.kind(p)]); api.say('내 말을 먼저 눌러요'); } else api.say('움직일 내 말을 먼저 눌러요');
    });
    return { render, commit() {}, clear() { sel = -1; if (st) draw(); }, destroy() { clearTimeout(capT); el.innerHTML = ''; } };
  }

  const noMoves = (st) => st.phase === 'play' && !R.result(st) && R.moves(st)[0] === 'pass';
  B.register(Object.assign({
    id: 'janggi',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#E8C98E"/><path d="M8 4V36M20 4V36M32 4V36M4 10H36M4 22H36M4 34H36" stroke="#8A5A1E" stroke-width="1"/>
      <g transform="translate(13 14) scale(15)">${pieceSvg('R', 0, 0).replace(/url\(#jgFace\)/g, '#FBF1D9')}</g><g transform="translate(27 27) scale(15)">${pieceSvg('c', 0, 0).replace(/url\(#jgFace\)/g, '#FBF1D9')}</g></svg>`,
    seats: [{ label: '초', sub: '먼저 · 아래', icon: icon('K') }, { label: '한', sub: '위 · 덤 1.5', icon: icon('k') }],
    rulesText: '상대 궁을 꼼짝 못 하게(외통) 잡으면 승리 · 처음에 마·상 자리(상차림)를 골라요 · 빅장 없음 · 200수가 넘으면 남은 말 점수로 승부 (차13 포7 마5 상3 사3 졸2, 한 +1.5)',
    learn: '장기는 체스와 같은 조상(인도의 차투랑가)에서 나와 중국의 샹치를 거쳐 우리나라에서 지금 모습이 됐어요. 초나라 항우와 한나라 유방의 싸움(초한전쟁)을 본떠 초·한으로 편을 나눠요. 말을 잡으면 "장군!", 피하면 "멍군!"',
    turnHint: (st) => (st.phase === 'setup' ? '상차림을 골라요' : noMoves(st) ? '둘 수 있는 수가 없어요 · [한 수 쉬기]를 눌러요' : '움직일 말을 눌러요'),
    status(st) {
      if (st.phase === 'setup') return '';
      const [a, h] = R.points(st.b);
      let s = '';
      if (!R.result(st)) {
        if (R.inCheck(st)) s = '<b class="ch-check">장군!</b> ';
        else if (st.escaped) s = '<b class="jg-meong">멍군!</b> ';
      }
      s += `<span class="ch-caps">점수 초 ${a} : 한 ${h}</span>`;
      if (st.n >= R.LIMIT - 50) s += `<span class="ch-caps">${st.n}/${R.LIMIT}수</span>`;
      return s;
    },
    actions(st) { return st && noMoves(st) ? [{ key: 'pass', label: '한 수 쉬기', move: 'pass' }] : []; },
    viewCtx: () => ({}), mount,
    aiMinMs: [0, 650, 600, 550, 450, 300]
  }, B.std(R)));
})();
