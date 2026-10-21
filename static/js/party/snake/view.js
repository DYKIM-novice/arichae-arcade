/* 아리채 오락실 · 뱀과 사다리 화면
   - 10×10 판 (1은 왼쪽 아래, 지그재그로 100까지) · 사다리(나무)와 뱀(알록달록)
   - 말은 캐릭터 얼굴 동그라미 · 주사위를 굴리면 한 칸씩 걸어가고, 사다리는 올라가고 뱀은 미끄러져요 */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#E8263B', '#2E5BD1', '#16A34A', '#F59E0B', '#9B59B6', '#0EA5B7'];
  const SN_COL = [['#2ED573', '#0B8A43'], ['#FF8A3D', '#C2410C'], ['#A78BFA', '#6D28D9'], ['#F472B6', '#BE185D'], ['#60A5FA', '#1D4ED8']];
  function xy(n) {
    if (n <= 0) return [-4, 104];
    const r = Math.floor((n - 1) / 10); const c0 = (n - 1) % 10;
    const c = r % 2 === 0 ? c0 : 9 - c0;
    return [c * 10 + 5, (9 - r) * 10 + 5];
  }
  const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };
  const dieSVG = (d) => `<svg viewBox="0 0 100 100"><rect x="4" y="4" width="92" height="92" rx="20" fill="#fff" stroke="#1C1733" stroke-width="4"/>${PIPS[d].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${d === 1 ? '#E8263B' : '#1C1733'}"/>`).join('')}</svg>`;

  function boardSVG(ladders, snakes) {
    let cells = '';
    for (let n = 1; n <= 100; n++) {
      const [x, y] = xy(n);
      const r = Math.floor((n - 1) / 10); const c = (n - 1) % 10;
      const fill = (r + c) % 2 ? '#FFF3D6' : '#FFE0B2';
      cells += `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" fill="${n === 100 ? '#FFD23F' : fill}"/><text x="${x - 4.2}" y="${y - 2.2}" font-size="2.6" fill="#9A7B55">${n}</text>`;
    }
    let lad = '';
    Object.entries(ladders).forEach(([a, b]) => {
      const [x1, y1] = xy(+a); const [x2, y2] = xy(+b);
      const dx = x2 - x1; const dy = y2 - y1; const L = Math.hypot(dx, dy); const nx = -dy / L * 1.8; const ny = dx / L * 1.8;
      let rungs = '';
      const k = Math.max(2, Math.round(L / 4));
      for (let j = 1; j < k; j++) { const t = j / k; rungs += `<line x1="${x1 + dx * t + nx}" y1="${y1 + dy * t + ny}" x2="${x1 + dx * t - nx}" y2="${y1 + dy * t - ny}" stroke="#8B5A2B" stroke-width=".9"/>`; }
      lad += `<g opacity=".92"><line x1="${x1 + nx}" y1="${y1 + ny}" x2="${x2 + nx}" y2="${y2 + ny}" stroke="#8B5A2B" stroke-width="1.1" stroke-linecap="round"/><line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x2 - nx}" y2="${y2 - ny}" stroke="#8B5A2B" stroke-width="1.1" stroke-linecap="round"/>${rungs}</g>`;
    });
    let sn = '';
    Object.entries(snakes).forEach(([a, b], k) => {
      const [x1, y1] = xy(+a); const [x2, y2] = xy(+b);
      const [c1, c2] = SN_COL[k % SN_COL.length];
      const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2; const off = (k % 2 ? 1 : -1) * 9;
      const d = `M${x1} ${y1} C${mx + off} ${y1 + (y2 - y1) * 0.2}, ${mx - off} ${y2 - (y2 - y1) * 0.2}, ${x2} ${y2}`;
      sn += `<path d="${d}" stroke="${c2}" stroke-width="3.2" fill="none" stroke-linecap="round" opacity=".9"/><path d="${d}" stroke="${c1}" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="2 1.5" opacity=".95"/>
        <circle cx="${x1}" cy="${y1}" r="2.6" fill="${c2}"/><circle cx="${x1 - 1}" cy="${y1 - .8}" r=".7" fill="#fff"/><circle cx="${x1 + 1}" cy="${y1 - .8}" r=".7" fill="#fff"/><circle cx="${x1 - 1}" cy="${y1 - .8}" r=".35" fill="#111"/><circle cx="${x1 + 1}" cy="${y1 - .8}" r=".35" fill="#111"/>`;
    });
    return `<svg viewBox="0 0 100 100" class="sn-svg" aria-hidden="true">${cells}${lad}${sn}<rect x="0" y="0" width="100" height="100" fill="none" stroke="#8B5A2B" stroke-width="1"/></svg>`;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="sn"><div class="sn-players"></div><div class="sn-wrap"><div class="sn-board"><div class="sn-svgbox"></div><div class="sn-layer"></div></div></div>
      <div class="sn-bottom"><div class="sn-die"></div><div class="sn-act"></div></div></div>`;
    const $ = (s) => el.querySelector(s);
    let v = null; let shown = null; let lastEv = 0; let busy = false; const queue = []; const timers = []; let drawn = false;
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); };
    const nm = (i) => esc(api.seat(i).name);
    function fit() {
      const w = $('.sn-wrap'); const b = $('.sn-board');
      const s = Math.floor(Math.min(w.clientWidth, w.clientHeight));
      b.style.width = b.style.height = `${s}px`;
    }
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(el); }
    requestAnimationFrame(fit);

    function drawPlayers(view) {
      $('.sn-players').innerHTML = view.pos.map((p, i) => `<div class="sn-pl${view.turn === i && !view.over ? ' turn' : ''}${api.seat(i).me ? ' me' : ''}" style="--c:${COLORS[i % 6]}"><span class="av">${api.seat(i).av}</span><b>${nm(i)}</b><span>${p || '출발'}</span></div>`).join('');
    }
    function drawTokens(pos) {
      const at = {};
      $('.sn-layer').innerHTML = pos.map((p, i) => {
        const k = (at[p] = (at[p] || 0) + 1) - 1;
        const [x, y] = xy(p);
        const ox = (k % 2 ? 1 : -1) * (k ? 1.6 : 0); const oy = k > 1 ? 1.6 : 0;
        return `<div class="sn-tok" style="left:${x + ox}%;top:${y + oy}%;--c:${COLORS[i % 6]}"><span class="av">${api.seat(i).av}</span></div>`;
      }).join('');
    }
    function drawAct() {
      const box = $('.sn-act');
      const mine = v.me != null && v.toAct === v.me;
      let h;
      if (v.over) h = '<div class="lr-hint">게임 끝!</div>';
      else if (busy) h = '<div class="lr-hint">&nbsp;</div>';
      else if (mine) h = '<button type="button" class="btn btn-yellow sn-go" data-sn="roll">🎲 주사위 굴리기</button>';
      else h = `<div class="lr-hint"><span class="bd-dots">${nm(v.turn)} 차례</span></div>`;
      if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
    }
    function render(view) { queue.push(view); if (!busy) next(); }
    function next() {
      const nv = queue.shift();
      if (!nv) { busy = false; if (v) drawAct(); return; }
      if (!drawn) { $('.sn-svgbox').innerHTML = boardSVG(nv.ladders, nv.snakes); drawn = true; }
      const evs = (nv.events || []).filter((e) => e.id > lastEv);
      if (evs.length) lastEv = Math.max(...evs.map((e) => e.id));
      const prev = shown;
      v = nv;
      if (!prev || queue.length > 2) { shown = nv; drawPlayers(nv); drawTokens(nv.pos); drawAct(); later(next, 0); return; }
      busy = true; drawAct();
      const pos = prev.pos.slice();
      const steps = [];
      evs.forEach((e) => {
        steps.push({ ms: 650, f: () => { const d = $('.sn-die'); d.innerHTML = dieSVG(e.d); d.classList.remove('roll'); void d.offsetWidth; d.classList.add('roll'); api.sfx('pop'); } });
        e.path.forEach((p) => steps.push({ ms: 220, f: () => { pos[e.s] = p; drawTokens(pos); api.sfx('tick'); } }));
        if (e.jump) {
          steps.push({ ms: 250, f: () => { api.say(e.jump.kind === 'ladder' ? `${nm(e.s)}: 사다리 타고 쑥! 🪜` : `${nm(e.s)}: 앗, 뱀이다! 🐍`); api.sfx(e.jump.kind === 'ladder' ? 'good' : 'bad'); } });
          steps.push({ ms: 700, f: () => { $('.sn-layer').classList.add('slow'); pos[e.s] = e.jump.to; drawTokens(pos); } });
          steps.push({ ms: 100, f: () => { $('.sn-layer').classList.remove('slow'); } });
        }
        if (e.d === 6 && nv.six && !nv.over) steps.push({ ms: 200, f: () => api.say(`${nm(e.s)}: 6! 한 번 더`) });
      });
      let k = 0;
      const run = () => {
        if (k >= steps.length) { shown = nv; busy = false; drawPlayers(nv); drawTokens(nv.pos); drawAct(); if (nv.toAct === nv.me && nv.me != null) api.vibrate(15); later(next, 0); return; }
        const s = steps[k++]; s.f(); later(run, s.ms);
      };
      drawPlayers(prev);
      run();
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sn="roll"]');
      if (b && v && !busy && v.toAct === v.me) { api.act({ k: 'roll' }); b.disabled = true; }
    });
    return { render, tick() { if (v && !busy) drawAct(); }, busy: () => busy || queue.length > 0, destroy() { timers.forEach(clearTimeout); if (ro) ro.disconnect(); el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#FFE0B2"/><path d="M10 32 L18 8 M15 33 L23 9" stroke="#8B5A2B" stroke-width="2"/><path d="M12 26 L17 27 M14 20 L19 21 M16 14 L21 15" stroke="#8B5A2B" stroke-width="1.5"/><path d="M30 8 C 22 14, 36 22, 26 32" stroke="#16A34A" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="30" cy="8" r="3" fill="#0B8A43"/></svg>';

  C.register({
    id: 'snake',
    kind: 'table',
    icon: ICON,
    rulesText: '주사위를 굴려 나온 만큼 가요 · 사다리 아래에 멈추면 쑥 올라가고, 뱀 머리에 멈추면 꼬리로 미끄러져요 · 100칸에 딱 맞게 먼저 도착하면 승리 (6이면 한 번 더)',
    learn: '뱀과 사다리는 아주 옛날 인도에서 "착한 일(사다리)과 나쁜 일(뱀)"을 가르치려고 만든 놀이래요. 운에 맡기는 게임이라 어른과 아이가 똑같이 이길 수 있어요!',
    optionsUI: [{ key: 'six', label: '6이 나오면', names: { again: '한 번 더', none: '그냥 넘어가요' } }],
    bar(v) { return v.me != null ? `<span class="cd-info">내 자리 <b>${v.pos[v.me] || '출발'}</b></span>` : ''; },
    rankLabel(v, i) { return v && v.pos ? `${v.pos[i]}칸` : ''; },
    mount
  });
})();
