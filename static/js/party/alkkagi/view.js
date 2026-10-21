/* 아리채 오락실 · 알까기 화면
   - 바둑판 위 흑돌·백돌. 내 돌이 늘 아래쪽에 오게 돌려 보여 줘요
   - 내 돌을 누르고 뒤로 당겼다 놓으면 튕겨요 (당긴 만큼 세게) · 점선이 날아갈 방향
   - 서버가 계산한 움직임을 그대로 재생해요 */
(function () {
  'use strict';
  const C = window.Cards;
  const F = window.Flick;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function boardBG() {
    let g = '';
    for (let k = 0; k < 19; k++) { const p = 5 + k * 5; g += `<line x1="5" y1="${p}" x2="95" y2="${p}"/><line x1="${p}" y1="5" x2="${p}" y2="95"/>`; }
    const stars = [20, 50, 80].map((a) => [20, 50, 80].map((b) => `<circle cx="${a}" cy="${b}" r=".7" fill="#5A3B12"/>`).join('')).join('');
    return `<rect x="0" y="0" width="100" height="100" rx="2" fill="url(#ak-wood)"/><g stroke="#5A3B12" stroke-width=".25" opacity=".75">${g}</g>${stars}`;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="ak"><div class="ak-players"></div><div class="ak-wrap"><div class="ak-board">
      <svg class="ak-svg" viewBox="-6 -6 112 112"><defs>
        <linearGradient id="ak-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E9BE73"/><stop offset="1" stop-color="#D9A456"/></linearGradient>
        <radialGradient id="ak-b" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#666"/><stop offset="1" stop-color="#0A0A0A"/></radialGradient>
        <radialGradient id="ak-w" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C9CED6"/></radialGradient>
      </defs><g class="ak-bg">${boardBG()}</g><g class="ak-stones"></g><g class="ak-aim"></g></svg></div></div><div class="ak-act"></div></div>`;
    const $ = (s) => el.querySelector(s);
    const svg = $('.ak-svg');
    const fit = () => { const w = $('.ak-wrap'); const b = $('.ak-board'); const s = Math.floor(Math.min(w.clientWidth, w.clientHeight)); b.style.width = b.style.height = `${s}px`; };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    requestAnimationFrame(fit);
    let v = null; let lastAnim = 0; let player = null; let busy = false; let flip = false; let pending = null;
    const nm = (i) => esc(api.seat(i).name);
    const tr = (x, y) => (flip ? [100 - x, 100 - y] : [x, y]);

    function stoneSVG(id, owner, x, y, r, op, hl) {
      const [X, Y] = tr(x, y);
      return `<g opacity="${op == null ? 1 : op}"><circle cx="${X.toFixed(2)}" cy="${(Y + 0.5).toFixed(2)}" r="${r}" fill="rgba(0,0,0,.3)"/>
        <circle cx="${X.toFixed(2)}" cy="${Y.toFixed(2)}" r="${r}" fill="url(#ak-${owner === 0 ? 'b' : 'w'})" ${hl ? 'stroke="#FFD23F" stroke-width=".7"' : ''}/></g>`;
    }
    function drawStill() {
      const mine = v.me != null && v.toAct === v.me && !busy;
      $('.ak-stones').innerHTML = v.stones.map(([id, o, x, y]) => stoneSVG(id, o, x, y, v.r, 1, mine && o === v.me)).join('');
    }
    function drawPlayers() {
      $('.ak-players').innerHTML = [0, 1].map((i) => `<div class="ak-pl${v.turn === i && !v.over ? ' turn' : ''}"><span class="ak-dot ${i ? 'w' : 'b'}"></span><span class="av">${api.seat(i).av}</span><b>${nm(i)}</b><span>${v.count[i]}알</span></div>`).join('<span class="sh-vs disp">VS</span>');
    }
    function drawAct() {
      const mine = v.me != null && v.toAct === v.me;
      const left = mine && v.deadline ? Math.max(0, Math.ceil((v.deadline - api.now()) / 1000)) : 0;
      const h = v.over ? '<div class="lr-hint">끝!</div>' : busy ? '<div class="lr-hint">&nbsp;</div>'
        : mine ? `<div class="lr-hint"><b class="lr-hot">${v.again ? '한 번 더!' : '내 차례!'}</b> 내 돌을 누르고 뒤로 당겼다 놓아요${left && left <= 10 ? ` · ${left}초` : ''}</div>`
          : `<div class="lr-hint"><span class="bd-dots">${nm(v.turn)} 차례</span></div>`;
      const box = $('.ak-act'); if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
    }
    function toWorld(cx, cy) {
      const r = svg.getBoundingClientRect();
      const x = (cx - r.left) / r.width * 112 - 6; const y = (cy - r.top) / r.height * 112 - 6;
      return tr(x, y);
    }
    F.aim(svg, {
      toWorld,
      full: 30,
      enabled: () => v && !busy && v.me != null && v.toAct === v.me,
      pick(x, y) {
        let best = null; let bd = 9;
        v.stones.forEach(([id, o, sx, sy]) => { if (o !== v.me) return; const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = { id, x: sx, y: sy }; } });
        return best;
      },
      draw(s, ang, pw) {
        const g = $('.ak-aim');
        if (!s) { g.innerHTML = ''; return; }
        const [X, Y] = tr(s.x, s.y);
        const a = flip ? ang + Math.PI : ang;
        const L = 8 + pw * 40;
        const ex = X + Math.cos(a) * L; const ey = Y + Math.sin(a) * L;
        const col = pw > 0.8 ? '#FF4757' : pw > 0.5 ? '#FFB400' : '#2ED573';
        g.innerHTML = `<circle cx="${X}" cy="${Y}" r="${v.r + 1}" fill="none" stroke="#FFD23F" stroke-width=".6"/>
          <line x1="${X}" y1="${Y}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width="1.1" stroke-dasharray="2 1.2" stroke-linecap="round"/>
          <circle cx="${ex}" cy="${ey}" r="1.3" fill="${col}"/><text x="${X}" y="${Y - v.r - 2.5}" font-size="3.6" text-anchor="middle" fill="#fff" stroke="#000" stroke-width=".25">${Math.round(pw * 100)}%</text>`;
      },
      shoot(id, ang, pw) { api.act({ k: 'shot', id, a: ang, p: pw }); api.sfx('pop'); busy = true; drawStill(); drawAct(); setTimeout(() => { if (busy && !player) { busy = false; drawAct(); } }, 3000); }
    });

    function render(view) {
      const first = !v;
      v = view;
      if (first) flip = v.me === 1;
      const an = v.anim;
      if (an && an.no !== lastAnim) {
        lastAnim = an.no;
        if (first) { drawStill(); drawPlayers(); drawAct(); return; }
        if (player) player.stop();
        busy = true; drawAct();
        const owners = {}; v.stones.forEach(([id, o]) => { owners[id] = o; });
        // 떨어진 돌 주인: 지난 화면에서
        (pending || []).forEach(([id, o]) => { if (owners[id] == null) owners[id] = o; });
        api.sfx('crack');
        player = F.play(an, (a, b, f) => {
          $('.ak-stones').innerHTML = an.ids.map((id, j) => { const p = F.lerpPos(a, b, f, j); return p ? stoneSVG(id, owners[id], p[0], p[1], v.r, p[2]) : ''; }).join('');
        }, () => {
          player = null; busy = false;
          if (an.fell && an.fell.length) { api.sfx('crash'); api.vibrate(30); }
          drawStill(); drawPlayers(); drawAct();
          if (v.toAct === v.me && v.me != null) api.vibrate(15);
        });
        pending = v.stones.map((s) => [s[0], s[1]]);
        drawPlayers();
        return;
      }
      pending = v.stones.map((s) => [s[0], s[1]]);
      if (!busy) { drawStill(); drawPlayers(); drawAct(); }
    }
    // 시험용: 내 돌 하나와 가장 가까운 상대 돌의 화면 좌표
    function aimTarget() {
      const mine = v.stones.filter((x) => x[1] === v.me); const foes = v.stones.filter((x) => x[1] !== v.me);
      if (!mine.length || !foes.length) return null;
      const m = mine[Math.floor(Math.random() * mine.length)];
      const f = foes.reduce((a, b) => (Math.hypot(b[2] - m[2], b[3] - m[3]) < Math.hypot(a[2] - m[2], a[3] - m[3]) ? b : a));
      const r = svg.getBoundingClientRect();
      const sc = (x, y) => { const [X, Y] = tr(x, y); return [r.left + (X + 6) / 112 * r.width, r.top + (Y + 6) / 112 * r.height]; };
      return sc(m[2], m[3]).concat(sc(f[2], f[3]));
    }
    return { render, _aimTarget: aimTarget, tick() { if (v && !busy) drawAct(); }, busy: () => busy, destroy() { if (player) player.stop(); if (ro) ro.disconnect(); el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#E2B266"/><path d="M8 2v36M16 2v36M24 2v36M32 2v36M2 8h36M2 16h36M2 24h36M2 32h36" stroke="#8A5A1E" stroke-width=".8"/><circle cx="14" cy="28" r="5" fill="#1A1A22"/><circle cx="27" cy="12" r="5" fill="#F4F1EA"/><path d="M17 25 L24 15" stroke="#FFD23F" stroke-width="2" stroke-dasharray="2 1.5"/></svg>';

  C.register({
    id: 'alkkagi',
    kind: 'table',
    icon: ICON,
    rulesText: '내 돌을 누르고 뒤로 당겼다 놓으면 튕겨요 · 판 밖으로 나간 돌은 빠져요 (내 돌도!) · 상대 돌을 떨어뜨리고 내 돌이 남으면 한 번 더 · 상대 돌을 다 떨어뜨리면 승리',
    learn: '알까기는 바둑돌로 하는 우리나라 놀이예요. 정면으로 세게 맞히면 맞은 돌이 멀리 날아가고, 내 돌은 그 자리에 딱 서요(같은 무게라서). 이걸 "정면 충돌"이라고 해요!',
    optionsUI: [{ key: 'stones', label: '돌 수', names: { 8: '8알', 5: '5알', 3: '3알 (빨리)' } }],
    bar(v) { return `<span class="cd-info">흑 <b>${v.count[0]}</b> · 백 <b>${v.count[1]}</b></span>`; },
    rankLabel(v, i) { return v && v.count ? `${v.count[i]}알 남음` : ''; },
    mount
  });
})();
