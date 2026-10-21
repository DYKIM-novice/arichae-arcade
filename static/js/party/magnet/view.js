/* 아리채 오락실 · 자석돌 화면 (클러스터 방식)
   - 줄 울타리 안에 자석돌. 빈 곳을 누르면 놓을 자리(흐린 돌)가 보이고 [여기 놓기]
   - 너무 가까우면 '딱!' 붙은 돌이 한데 모였다가 놓은 사람에게 가요
   - '도움 보기'를 켜면 돌마다 붙는 거리가 흐린 동그라미로 보여요 */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function stoneSVG(x, y, r, extra) {
    return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)})" ${extra || ''}><circle cy=".45" r="${r}" fill="rgba(0,0,0,.35)"/><circle r="${r}" fill="url(#mg-st)"/><circle cx="${-r * 0.35}" cy="${-r * 0.35}" r="${r * 0.3}" fill="#fff" opacity=".35"/></g>`;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="mg"><div class="mg-players"></div><div class="mg-wrap"><div class="mg-board"><svg class="mg-svg" viewBox="18 18 64 64">
      <defs><radialGradient id="mg-st" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#8A93A3"/><stop offset="1" stop-color="#1F242C"/></radialGradient>
        <radialGradient id="mg-cl" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#3F7D4E"/><stop offset="1" stop-color="#2A5A37"/></radialGradient></defs>
      <rect x="18" y="18" width="64" height="64" rx="4" fill="url(#mg-cl)"/><g class="mg-ring"></g><g class="mg-hints"></g><g class="mg-stones"></g><g class="mg-ghost"></g><g class="mg-fx"></g></svg></div></div>
      <div class="mg-ctl"></div></div>`;
    const $ = (s) => el.querySelector(s);
    const svg = $('.mg-svg');
    let v = null; let ghost = null; let lastId = 0; let busy = false; const timers = [];
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); };
    const nm = (i) => esc(api.seat(i).name);
    const fit = () => { const w = $('.mg-wrap'); const b = $('.mg-board'); const s = Math.floor(Math.min(w.clientWidth, w.clientHeight)); b.style.width = b.style.height = `${s}px`; };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    requestAnimationFrame(fit);
    const myTurn = () => v && !busy && v.me != null && v.toAct === v.me;

    function drawStill() {
      $('.mg-stones').innerHTML = v.stones.map(([id, x, y]) => stoneSVG(x, y, v.r)).join('');
      $('.mg-hints').innerHTML = v.hint ? v.stones.map(([id, x, y]) => `<circle cx="${x}" cy="${y}" r="${2 * v.r + v.gap}" fill="rgba(255,90,90,.12)" stroke="rgba(255,120,120,.35)" stroke-width=".2"/>`).join('') : '';
      $('.mg-ghost').innerHTML = ghost && myTurn() ? stoneSVG(ghost[0], ghost[1], v.r, 'opacity=".5"') + `<circle cx="${ghost[0]}" cy="${ghost[1]}" r="${v.r + 0.8}" fill="none" stroke="#FFD23F" stroke-width=".35" stroke-dasharray=".8 .5"/>` : '';
    }
    function drawPlayers() {
      $('.mg-players').innerHTML = v.hand.map((h, i) => `<div class="mg-pl${v.turn === i && !v.over ? ' turn' : ''}"><span class="av">${api.seat(i).av}</span><b>${nm(i)}</b><span class="mg-h">●×${h}</span></div>`).join('');
    }
    function drawCtl() {
      const box = $('.mg-ctl');
      let h;
      if (v.over) h = '<div class="lr-hint">끝!</div>';
      else if (busy) h = '<div class="lr-hint">&nbsp;</div>';
      else if (myTurn()) h = ghost ? '<button type="button" class="btn btn-yellow mg-go" data-mg="place">여기 놓기 ●</button>' : `<div class="lr-hint"><b class="lr-hot">내 차례!</b> 돌을 놓을 곳을 눌러요 (남은 돌 ${v.hand[v.me]}개)</div>`;
      else h = `<div class="lr-hint"><span class="bd-dots">${nm(v.turn)} 차례</span></div>`;
      if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
    }
    function drawRing() {
      const [cx, cy, R] = v.ring;
      $('.mg-ring').innerHTML = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="rgba(255,255,255,.05)" stroke="#C9A06A" stroke-width="1.1"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#8B5A2B" stroke-width="1.1" stroke-dasharray="1.2 1"/>`;
    }

    function animate(L, done) {
      busy = true; drawCtl();
      // 놓는 돌이 내려와요
      $('.mg-fx').innerHTML = stoneSVG(L.x, L.y, v.r, 'class="mg-drop"');
      api.sfx('soft');
      if (!L.snap) { later(() => { $('.mg-fx').innerHTML = ''; busy = false; done(); }, 450); return; }
      later(() => {
        // 붙는 돌들이 한데 모여요
        $('.mg-stones').innerHTML = prevStones.filter(([id, x, y]) => !L.snap.some(([sx, sy]) => Math.abs(sx - x) < 0.01 && Math.abs(sy - y) < 0.01)).map(([id, x, y]) => stoneSVG(x, y, v.r)).join('');
        $('.mg-fx').innerHTML = L.snap.map(([x, y], k) => `<g class="mg-pull" style="--dx:${(L.to[0] - x).toFixed(2)}px;--dy:${(L.to[1] - y).toFixed(2)}px">${stoneSVG(x, y, v.r)}</g>`).join('');
        api.sfx('crack'); api.vibrate([30, 20, 30]);
      }, 380);
      later(() => { api.say(`딱! ${nm(L.s)}: 붙은 돌 ${L.n}개를 가져가요`); api.sfx('crash'); }, 700);
      later(() => { $('.mg-fx').innerHTML = ''; busy = false; done(); }, 1500);
    }
    let prevStones = [];

    function render(view) {
      const first = !v;
      v = view;
      if (first) drawRing();
      drawPlayers();
      if (v.last && v.last.id !== lastId && !first) {
        lastId = v.last.id; ghost = null;
        animate(v.last, () => { drawStill(); drawCtl(); if (myTurn()) api.vibrate(15); });
      } else {
        if (v.last) lastId = v.last.id;
        if (!busy) { drawStill(); drawCtl(); }
      }
      prevStones = v.stones.map((s) => s.slice());
    }
    svg.addEventListener('pointerdown', (e) => {
      if (!myTurn()) return;
      const r = svg.getBoundingClientRect();
      const x = 18 + (e.clientX - r.left) / r.width * 64; const y = 18 + (e.clientY - r.top) / r.height * 64;
      const [cx, cy, R] = v.ring;
      if (Math.hypot(x - cx, y - cy) > R - v.r) { api.say('울타리 안에 놓아요'); return; }
      ghost = [x, y]; drawStill(); drawCtl(); api.tick();
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mg="place"]');
      if (b && myTurn() && ghost) { api.act({ k: 'place', x: ghost[0], y: ghost[1] }); b.disabled = true; }
    });
    return {
      render, tick() { if (v && !busy) drawCtl(); }, busy: () => busy,
      _place: (x, y) => { if (!myTurn()) return false; api.act({ k: 'place', x, y }); return true; },
      destroy() { timers.forEach(clearTimeout); if (ro) ro.disconnect(); el.innerHTML = ''; }
    };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#3F7D4E"/><circle cx="20" cy="20" r="14" fill="none" stroke="#C9A06A" stroke-width="2" stroke-dasharray="2.4 1.6"/><circle cx="15" cy="17" r="3.4" fill="#2A2F38"/><circle cx="21.5" cy="17.5" r="3.4" fill="#2A2F38"/><circle cx="23" cy="26" r="3.4" fill="#2A2F38"/><path d="M18.3 13 L19 11 M18 21 L17 23" stroke="#FFD23F" stroke-width="1.2"/></svg>';

  C.register({
    id: 'magnet',
    kind: 'table',
    icon: ICON,
    rulesText: '울타리 안에 자석돌을 하나씩 놓아요 · 다른 돌과 너무 가까우면 딱! 붙은 돌을 모두 가져가야 해요 · 내 돌을 먼저 다 놓으면 승리',
    learn: '자석은 가까울수록 힘이 아주 세져요(거리의 제곱에 반비례). 그래서 조금만 가까워도 갑자기 "딱!" 붙어요. 자석마다 힘이 조금씩 달라서 늘 조마조마해요!',
    optionsUI: [{ key: 'hint', label: '붙는 거리 보기', names: { off: '안 보기', on: '보기 (연습)' } }],
    bar(v) { return v.me != null ? `<span class="cd-info">내 돌 <b>${v.hand[v.me]}</b>개 남음</span>` : ''; },
    rankLabel(v, i) { return v && v.hand ? `남은 돌 ${v.hand[i]}개` : ''; },
    mount
  });
})();
