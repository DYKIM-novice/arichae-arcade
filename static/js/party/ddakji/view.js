/* 아리채 오락실 · 딱지치기 화면
   - 바닥(위에서 내려다본 모습)에 상대 딱지
   - 내 차례: ① 내려칠 곳을 눌러요 (딱지 가장자리 바로 바깥쪽이 잘 뒤집혀요) ② 힘 막대가 오르내릴 때 [쾅!]
   - 딱지가 위에서 떨어져 내려치고, 뒤집히면 휙 뒤집혀요 */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COL = [['#2E5BD1', '#E8263B'], ['#16A34A', '#F59E0B']];     // 사람마다 앞·뒤 색

  function ddakji(owner, size, back) {
    const [a, b] = COL[owner % 2];
    const h = size / 2;
    const f1 = back ? b : a; const f2 = back ? a : b;
    return `<g><rect x="${-h}" y="${-h}" width="${size}" height="${size}" rx="1" fill="${f1}" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>
      <path d="M${-h} ${-h} L0 0 L${h} ${-h} Z" fill="${f2}" opacity=".95"/><path d="M${-h} ${h} L0 0 L${h} ${h} Z" fill="${f2}" opacity=".95"/>
      <path d="M${-h} ${-h} L${h} ${h} M${h} ${-h} L${-h} ${h}" stroke="rgba(0,0,0,.25)" stroke-width=".4"/>
      <rect x="${-h + 1.2}" y="${-h + 1.2}" width="${size - 2.4}" height="${size - 2.4}" rx=".6" fill="none" stroke="rgba(255,255,255,.35)" stroke-width=".4"/></g>`;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="dj"><div class="dj-players"></div><div class="dj-wrap"><div class="dj-ground">
      <svg class="dj-svg" viewBox="0 0 100 100"><defs><radialGradient id="dj-gr" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#C9B28A"/><stop offset="1" stop-color="#9E8660"/></radialGradient></defs>
        <rect width="100" height="100" fill="url(#dj-gr)"/><g class="dj-dots"></g><g class="dj-floor"></g><g class="dj-mark"></g><g class="dj-fly"></g></svg></div></div>
      <div class="dj-ctl"></div></div>`;
    const $ = (s) => el.querySelector(s);
    const svg = $('.dj-svg');
    let v = null; let mark = null; let lastId = 0; let busy = false; let meterT = 0; let meterP = 0; let meterOn = false; const timers = [];
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); };
    const nm = (i) => esc(api.seat(i).name);
    const fit = () => { const w = $('.dj-wrap'); const b = $('.dj-ground'); const s = Math.floor(Math.min(w.clientWidth, w.clientHeight)); b.style.width = b.style.height = `${s}px`; };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    requestAnimationFrame(fit);
    // 바닥 자갈 무늬
    let dots = '';
    for (let k = 0; k < 70; k++) dots += `<circle cx="${(k * 37.3) % 100}" cy="${(k * 61.7) % 100}" r="${0.3 + (k % 4) * 0.15}" fill="rgba(0,0,0,.12)"/>`;
    $('.dj-dots').innerHTML = dots;

    const defender = () => 1 - v.hitter;
    function drawFloor(pos, rot, owner, back) {
      $('.dj-floor').innerHTML = `<g transform="translate(${pos[0]} ${pos[1]}) rotate(${rot * 180 / Math.PI})"><g class="dj-d">${ddakji(owner, v.size, back)}</g></g>`;
    }
    function drawPlayers() {
      $('.dj-players').innerHTML = [0, 1].map((i) => `<div class="dj-pl${v.hitter === i && !v.over ? ' turn' : ''}"><span class="av">${api.seat(i).av}</span><b>${nm(i)}</b>
        <span class="dj-won">${'<i></i>'.repeat(v.won[i])}${'<i class="off"></i>'.repeat(Math.max(0, v.goal - v.won[i]))}</span><small>${v.hitter === i ? '치는 차례' : '지키는 차례'}</small></div>`).join('<span class="sh-vs disp">VS</span>');
    }
    const myTurn = () => v && !busy && v.me != null && v.toAct === v.me;
    function drawCtl() {
      const box = $('.dj-ctl');
      let h;
      if (v.over) h = '<div class="lr-hint">끝!</div>';
      else if (busy) h = '<div class="lr-hint">&nbsp;</div>';
      else if (myTurn()) {
        h = mark ? `<div class="dj-meter"><i></i><span class="dj-sweet"></span></div><button type="button" class="btn btn-yellow dj-go" data-dj="hit">쾅! 내려치기</button>`
          : '<div class="lr-hint"><b class="lr-hot">내 차례!</b> 딱지 근처를 눌러 내려칠 곳을 골라요<br><small>가장자리 바로 바깥쪽이 잘 뒤집혀요</small></div>';
      } else h = `<div class="lr-hint"><span class="bd-dots">${nm(v.hitter)}님이 치려고 해요</span></div>`;
      if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
      meterOn = !!(myTurn() && mark);
      if (meterOn && !meterT) runMeter();
    }
    function runMeter() {
      const t0 = performance.now();
      const loop = (now) => {
        if (!meterOn) { meterT = 0; return; }
        const t = ((now - t0) / 1100) % 2;
        meterP = t < 1 ? t : 2 - t;
        const bar = $('.dj-meter i');
        if (bar) bar.style.height = `${Math.round(meterP * 100)}%`;
        meterT = requestAnimationFrame(loop);
      };
      meterT = requestAnimationFrame(loop);
    }
    function drawMark() {
      $('.dj-mark').innerHTML = mark ? `<g transform="translate(${mark[0]} ${mark[1]})"><circle r="4.5" fill="none" stroke="#FFD23F" stroke-width=".7"/><path d="M-6 0 H-2 M2 0 H6 M0 -6 V-2 M0 2 V6" stroke="#FFD23F" stroke-width=".7"/></g>` : '';
    }

    function animateHit(L, done) {
      busy = true; drawCtl();
      const hitterOwner = L.s; const defOwner = 1 - L.s;
      drawFloor(L.pos, L.rot, defOwner, false);
      // 위에서 떨어지는 내 딱지
      $('.dj-fly').innerHTML = `<g class="dj-drop" style="transform-origin:${L.x}px ${L.y}px"><g transform="translate(${L.x} ${L.y}) rotate(${(L.p * 50 - 20)})">${ddakji(hitterOwner, v.size * 0.95, false)}</g></g>`;
      api.sfx('whoosh');
      later(() => {
        api.sfx('crash'); api.vibrate([40]);
        svg.classList.remove('shake'); void svg.getBoundingClientRect(); svg.classList.add('shake');
        if (L.flip) {
          const d = el.querySelector('.dj-d'); if (d) d.classList.add('flip');
          later(() => { drawFloor(L.pos, L.rot, defOwner, true); api.sfx('perfect'); api.say(`${nm(L.s)}: 뒤집었다! 🎉`); }, 350);
        } else later(() => api.say(`${nm(L.s)}: 안 뒤집혔어요 · 뒤집힐 확률 ${Math.round(L.chance * 100)}%였어요`), 300);
      }, 380);
      later(() => { $('.dj-fly').innerHTML = ''; busy = false; done(); }, 2000);
    }

    function render(view) {
      const prev = v;
      v = view;
      drawPlayers();
      if (v.last && v.last.id !== lastId && prev) {
        lastId = v.last.id; mark = null; drawMark();
        animateHit(v.last, () => { drawFloor(v.pos, v.rot, defender(), false); drawCtl(); if (myTurn()) api.vibrate(15); });
        return;
      }
      if (v.last) lastId = v.last.id;
      if (!busy) { drawFloor(v.pos, v.rot, defender(), false); drawCtl(); }
    }

    svg.addEventListener('pointerdown', (e) => {
      if (!myTurn()) return;
      const r = svg.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * 100; const y = (e.clientY - r.top) / r.height * 100;
      if (Math.hypot(x - v.pos[0], y - v.pos[1]) > v.size * 1.4) { api.say('딱지 가까이를 눌러요'); return; }
      mark = [x, y]; drawMark(); drawCtl(); api.tick();
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dj="hit"]');
      if (b && myTurn() && mark) { meterOn = false; api.act({ k: 'hit', x: mark[0], y: mark[1], p: meterP }); b.disabled = true; }
    });
    return {
      render, tick() { if (v && !busy) drawCtl(); }, busy: () => busy,
      _hit: (dx, dy, p) => { if (myTurn()) { mark = [v.pos[0] + dx, v.pos[1] + dy]; meterOn = false; api.act({ k: 'hit', x: mark[0], y: mark[1], p }); return true; } return false; },
      destroy() { meterOn = false; timers.forEach(clearTimeout); if (ro) ro.disconnect(); el.innerHTML = ''; }
    };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#C9B28A"/><g transform="translate(20 22) rotate(12)"><rect x="-11" y="-11" width="22" height="22" fill="#2E5BD1"/><path d="M-11 -11 L0 0 L11 -11 Z M-11 11 L0 0 L11 11 Z" fill="#E8263B"/></g><path d="M28 4 L33 9" stroke="#fff" stroke-width="2"/><path d="M33 4 L28 9" stroke="#fff" stroke-width="2"/></svg>';

  C.register({
    id: 'ddakji',
    kind: 'table',
    icon: ICON,
    rulesText: '바닥 딱지 근처를 골라 힘 막대가 오르내릴 때 [쾅!] · 뒤집으면 그 딱지를 따요 · 못 뒤집으면 바꿔서 쳐요 · 먼저 3장 따면 승리',
    learn: '딱지는 바람으로 뒤집혀요! 가장자리 바로 바깥쪽을 세게 치면 바람이 딱지 밑으로 들어가 훌러덩. 한가운데를 치면 꾹 눌릴 뿐 잘 안 뒤집혀요.',
    optionsUI: [{ key: 'goal', label: '몇 장 따면 승리', names: { 3: '3장', 5: '5장', 1: '1장' } }],
    bar(v) { return `<span class="cd-info">${v.won[0]} : ${v.won[1]} · ${v.goal}장 먼저</span>`; },
    rankLabel(v, i) { return v && v.won ? `${v.won[i]}장 땀` : ''; },
    mount
  });
})();
