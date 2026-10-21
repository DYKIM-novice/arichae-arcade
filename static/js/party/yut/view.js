/* 아리채 오락실 · 윷놀이 화면
   - 위: 사람마다 남은 말(집) · 난 말 · 차례
   - 가운데: 윷판 (바깥 20칸 + 지름길) · 말은 캐릭터 얼굴이 든 동그라미, 업으면 숫자
   - 아래: 던진 결과(도·개·걸·윷·모·빽도) → 하나 고르고, 빛나는 칸(갈 곳)이나 말을 눌러 움직여요
   - 던질 때 윷가락 4개가 굴러가요. 말은 한 칸씩 걸어가요 */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAME = { 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모', '-1': '빽도' };
  const COLORS = ['#E8263B', '#2E5BD1', '#16A34A', '#F59E0B'];
  // 칸 자리 (0~100)
  const P = { E: [90, 90] };
  for (let k = 1; k <= 5; k++) P[`o${k}`] = [90, 90 - 16 * k];
  for (let k = 6; k <= 10; k++) P[`o${k}`] = [90 - 16 * (k - 5), 10];
  for (let k = 11; k <= 15; k++) P[`o${k}`] = [10, 10 + 16 * (k - 10)];
  for (let k = 16; k <= 19; k++) P[`o${k}`] = [10 + 16 * (k - 15), 90];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  P.C = [50, 50];
  P.a1 = lerp(P.o5, P.C, 1 / 3); P.a2 = lerp(P.o5, P.C, 2 / 3); P.a3 = lerp(P.C, P.o15, 1 / 3); P.a4 = lerp(P.C, P.o15, 2 / 3);
  P.b1 = lerp(P.o10, P.C, 1 / 3); P.b2 = lerp(P.o10, P.C, 2 / 3); P.b3 = lerp(P.C, P.E, 1 / 3); P.b4 = lerp(P.C, P.E, 2 / 3);
  const BIG = new Set(['E', 'o5', 'o10', 'o15', 'C']);

  function boardSVG() {
    const lines = `<path d="M10 10 H90 V90 H10 Z M10 10 L90 90 M90 10 L10 90" stroke="#B88A55" stroke-width="1.2" fill="none"/>`;
    const dots = Object.keys(P).map((k) => {
      const [x, y] = P[k];
      return BIG.has(k) ? `<circle cx="${x}" cy="${y}" r="5.4" fill="#FFF4DC" stroke="#8B5A2B" stroke-width="1"/><circle cx="${x}" cy="${y}" r="3.6" fill="none" stroke="#8B5A2B" stroke-width=".6"/>`
        : `<circle cx="${x}" cy="${y}" r="3.6" fill="#FFF4DC" stroke="#8B5A2B" stroke-width=".8"/>`;
    }).join('');
    return `<svg viewBox="0 0 100 100" class="yt-svg" aria-hidden="true"><rect x="1" y="1" width="98" height="98" rx="6" fill="#F3DDB0" stroke="#8B5A2B" stroke-width="1.2"/>${lines}${dots}
      <text x="80" y="97.4" font-size="3.2" text-anchor="middle" fill="#7A4A1E">출발·도착 ▶</text><text x="50" y="44" font-size="3" text-anchor="middle" fill="#7A4A1E">방</text></svg>`;
  }
  // 윷가락 4개 (0번이 빽도 표시) — 평평한 면(배)은 X 무늬, 둥근 면(등)은 나무
  function sticksSVG(r, seed) {
    let flat = [false, false, false, false];
    const n = r === 5 ? 0 : r === -1 ? 1 : r;
    if (r === -1) flat[0] = true;
    else {
      const idx = [1, 2, 3, 0];
      let rr = seed;
      for (let k = idx.length - 1; k > 0; k--) { rr = (rr * 9301 + 49297) % 233280; const j = rr % (k + 1); [idx[k], idx[j]] = [idx[j], idx[k]]; }
      if (r === 1) flat = [false, false, false, false], flat[idx[0] === 0 ? idx[1] : idx[0]] = true;
      else for (let k = 0; k < n; k++) flat[idx[k]] = true;
    }
    return flat.map((f, k) => `<g transform="translate(${8 + k * 22} 4) rotate(${(k - 1.5) * 6} 8 30)"><rect width="16" height="60" rx="8" fill="${f ? '#FFF3D6' : '#C98A4B'}" stroke="#7A4A1E" stroke-width="1.5"/>
      ${f ? '<path d="M4 14 L12 22 M12 14 L4 22 M4 38 L12 46 M12 38 L4 46" stroke="#7A4A1E" stroke-width="1.6"/>' : '<path d="M8 8 V52" stroke="#A86B33" stroke-width="1"/>'}
      ${k === 0 ? `<text x="8" y="33" font-size="9" text-anchor="middle" fill="${f ? '#E8263B' : '#FFE9C7'}" font-weight="700">빽</text>` : ''}</g>`).join('');
  }

  function mount(el, api) {
    el.innerHTML = `<div class="yt">
      <div class="yt-players"></div>
      <div class="yt-boardwrap"><div class="yt-board">${boardSVG()}<div class="yt-layer"></div><div class="yt-marks"></div></div>
        <div class="yt-throw"><svg viewBox="0 0 96 70" class="yt-sticks"></svg><b class="yt-res disp"></b></div></div>
      <div class="yt-me"><div class="yt-results"></div><div class="yt-act"></div></div>
    </div>`;
    const $ = (s) => el.querySelector(s);
    // 판 크기: 남은 자리에 꼭 맞는 정사각형
    function fit() {
      const w = $('.yt-boardwrap'); const b = $('.yt-board');
      if (!w || !b) return;
      const s = Math.floor(Math.min(w.clientWidth, w.clientHeight));
      b.style.width = b.style.height = `${s}px`;
    }
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(el); }
    requestAnimationFrame(fit);
    let v = null; let shown = null; let selR = 0; let lastEv = 0; let busy = false; const timers = []; const queue = [];
    let throwT = 0;
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); };
    const nm = (i) => esc(api.seat(i).name);

    function token(owner, k, extra) {
      return `<div class="yt-tok${extra || ''}" style="--c:${COLORS[owner % 4]}"><span class="av">${api.seat(owner).av}</span>${k > 1 ? `<b>${k}</b>` : ''}</div>`;
    }
    function place(node) { const p = P[node]; return p ? `left:${p[0]}%;top:${p[1]}%` : ''; }

    function drawPlayers(view) {
      $('.yt-players').innerHTML = view.home.map((h, i) => {
        const turn = view.turn === i && !view.over;
        return `<div class="yt-pl${turn ? ' turn' : ''}${api.seat(i).me ? ' me' : ''}" style="--c:${COLORS[i % 4]}"><span class="av">${api.seat(i).av}</span>
          <div class="yt-pi"><b>${nm(i)}</b><span class="yt-home" ${api.seat(i).me ? 'data-src="home"' : ''}>${'<i></i>'.repeat(h)}${'<i class="off"></i>'.repeat(view.pieces - h - view.done[i])}</span></div>
          <span class="yt-done">${view.done[i] ? `🏁${view.done[i]}` : ''}</span></div>`;
      }).join('');
    }
    function drawTokens(groups, moving) {
      $('.yt-layer').innerHTML = groups.filter((g) => !moving || g.id !== moving.id).map((g) => `<div class="yt-at" data-gid="${g.id}" style="${place(g.node)}">${token(g.owner, g.k, g.owner === (v && v.me) ? ' mine' : '')}</div>`).join('')
        + (moving ? `<div class="yt-at moving" style="${place(moving.node)}">${token(moving.owner, moving.k)}</div>` : '');
    }

    // 고른 결과로 갈 수 있는 곳 표시
    function drawMarks() {
      const box = $('.yt-marks');
      if (busy || !v || v.me == null || v.toAct !== v.me || v.phase !== 'move' || !v.moves) { box.innerHTML = ''; return; }
      const ms = v.moves.filter((m) => m.r === selR);
      box.innerHTML = ms.map((m) => m.to === 'X'
        ? `<button type="button" class="yt-mark out" style="${place('E')}" data-mv="${m.src}">나기!</button>`
        : `<button type="button" class="yt-mark${m.src === 'home' ? ' new' : ''}" style="${place(m.to)}" data-mv="${m.src}">${m.src === 'home' ? '새 말' : '▼'}</button>`).join('');
    }

    function drawResults() {
      const box = $('.yt-results');
      const rs = (shown || v).results || [];
      if (selR >= rs.length) selR = 0;
      const mine = v.me != null && v.toAct === v.me;
      box.innerHTML = rs.length ? rs.map((r, k) => `<button type="button" class="yt-r${k === selR && mine && v.phase === 'move' ? ' on' : ''}${r === -1 ? ' back' : ''}" data-r="${k}">${NAME[r]}</button>`).join('') : '';
    }
    function drawAct() {
      const box = $('.yt-act');
      const mine = v.me != null && v.toAct === v.me;
      const left = mine && v.deadline ? Math.max(0, Math.ceil((v.deadline - api.now()) / 1000)) : 0;
      let html;
      if (v.over) html = '<div class="lr-hint">게임 끝!</div>';
      else if (busy) html = '<div class="lr-hint">&nbsp;</div>';
      else if (mine && v.phase === 'throw') html = `<button type="button" class="btn btn-yellow yt-go" data-yt="throw">윷 던지기!${v.throws > 1 ? ` (${v.throws}번)` : ''}</button>`;
      else if (mine && v.phase === 'move') html = `<div class="lr-hint">결과를 고르고 <b>▼ 빛나는 칸</b>을 눌러 말을 옮겨요</div>`;
      else html = `<div class="lr-hint"><span class="bd-dots">${nm(v.turn)} 차례</span></div>`;
      if (left && left <= 10) html += `<div class="yt-left">${left}초</div>`;
      if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
    }
    function drawAll(view) {
      drawPlayers(view); drawTokens(view.groups); drawResults(); drawAct(); drawMarks();
    }

    function showThrow(r) {
      const t = $('.yt-throw');
      $('.yt-sticks').innerHTML = sticksSVG(r, Math.floor(Math.random() * 1000));
      $('.yt-res').textContent = `${NAME[r]}!${r === 4 || r === 5 ? ' 한 번 더' : ''}`;
      t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
      t.classList.toggle('big', r === 4 || r === 5);
      clearTimeout(throwT); throwT = setTimeout(() => t.classList.remove('show'), 1500);
      api.sfx(r === 4 || r === 5 ? 'perfect' : r === -1 ? 'bad' : 'pop');
    }

    // 새 정보 → 던지기·이동을 차례대로 보여 줘요
    function render(view) {
      queue.push(view);
      if (!busy) next();
    }
    function next() {
      const nv = queue.shift();
      if (!nv) { busy = false; if (v) { drawAct(); drawMarks(); drawResults(); } return; }
      const evs = (nv.events || []).filter((e) => e.id > lastEv);
      if (evs.length) lastEv = Math.max(...evs.map((e) => e.id));
      const prev = shown;
      v = nv;
      if (!prev || queue.length > 2) { shown = nv; drawAll(nv); later(next, 0); return; }
      busy = true;
      drawPlayers(prev); drawResults(); drawAct(); drawMarks();
      const steps = [];
      evs.forEach((e) => {
        if (e.k === 'throw') steps.push({ ms: 1100, f: () => showThrow(e.r) });
        if (e.k === 'waste') steps.push({ ms: 900, f: () => api.say('빽도인데 판에 말이 없어서 넘어가요') });
        if (e.k === 'move') {
          // 움직인 무리: 도착 칸의 무리(나갔으면 사라짐)
          const g = { id: -1, owner: e.owner, k: e.n, node: e.frm };
          const others = (prev.groups || []).filter((x) => !(x.node === e.frm && x.owner === e.owner));
          e.path.forEach((node, j) => steps.push({ ms: 190, f: () => { g.node = node === 'X' ? 'E' : node; drawTokens(others, g); api.sfx('tick'); } }));
          if (e.cap) steps.push({ ms: 700, f: () => { api.say(`${nm(e.owner)}: 잡았다! 한 번 더`); api.sfx('crash'); api.vibrate([40, 30, 40]); } });
          else if (e.stack) steps.push({ ms: 400, f: () => { api.sfx('pop'); } });
          else if (e.out) steps.push({ ms: 500, f: () => { api.sfx('good'); } });
        }
        if (e.k === 'finish') steps.push({ ms: 300, f: () => api.sfx('fanfare') });
      });
      let k = 0;
      const run = () => {
        if (k >= steps.length) { shown = nv; busy = false; drawAll(nv); if (nv.toAct === nv.me && nv.me != null && (!prev || prev.toAct !== nv.me || prev.phase !== nv.phase)) { api.vibrate(20); } later(next, 0); return; }
        const s = steps[k++]; s.f(); later(run, s.ms);
      };
      run();
    }

    el.addEventListener('click', (e) => {
      if (!v || busy) return;
      const t = e.target;
      let b;
      if ((b = t.closest('[data-yt="throw"]'))) { api.act({ k: 'throw' }); b.disabled = true; return; }
      if ((b = t.closest('[data-r]'))) { selR = Number(b.dataset.r); drawResults(); drawMarks(); api.tick(); return; }
      if (v.me == null || v.toAct !== v.me || v.phase !== 'move') return;
      if ((b = t.closest('[data-mv]'))) { const src = b.dataset.mv; api.act({ k: 'move', r: selR, src: src === 'home' ? 'home' : Number(src) }); api.sfx('pop'); $('.yt-marks').innerHTML = ''; return; }
      // 말을 직접 눌러도 돼요
      const g = t.closest('[data-gid]');
      const h = t.closest('[data-src="home"]');
      const src = g ? Number(g.dataset.gid) : h ? 'home' : null;
      if (src == null) return;
      const m = (v.moves || []).find((x) => x.r === selR && x.src === src) || (v.moves || []).find((x) => x.src === src);
      if (m) { selR = m.r; api.act({ k: 'move', r: m.r, src: m.src }); api.sfx('pop'); $('.yt-marks').innerHTML = ''; } else api.say('그 말은 지금 움직일 수 없어요');
    });

    return {
      render,
      tick() { if (v && !busy) drawAct(); },
      busy: () => busy || queue.length > 0,
      destroy() { timers.forEach(clearTimeout); clearTimeout(throwT); if (ro) ro.disconnect(); el.innerHTML = ''; }
    };
  }

  const ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#C98A4B"/>${[0, 1, 2, 3].map((k) => `<rect x="${7 + k * 7}" y="${8 + (k % 2) * 3}" width="5" height="22" rx="2.5" fill="${k % 2 ? '#FFF3D6' : '#8B5A2B'}" stroke="#5A3412" stroke-width=".8" transform="rotate(${(k - 1.5) * 8} 20 20)"/>`).join('')}</svg>`;

  C.register({
    id: 'yut',
    kind: 'table',
    icon: ICON,
    rulesText: '윷을 던져 도·개·걸·윷·모(빽도는 뒤로)만큼 말을 옮겨요 · 윷·모·잡기는 한 번 더 · 모퉁이와 방에 멈추면 지름길 · 내 말끼리 업고 가요 · 말을 다 내보내면 승리',
    learn: '윷놀이는 삼국 시대부터 즐긴 우리 놀이예요. 도·개·걸·윷·모는 돼지·개·양·소·말을 뜻한다고 해요. 윷가락이 평평한 면이 나올 확률이 조금 더 높아서 개·걸이 가장 잘 나와요!',
    optionsUI: [{ key: 'pieces', label: '말 수', names: { 4: '4개', 3: '3개', 2: '2개 (빨리)' } }],
    bar(v) { return `<span class="cd-info">말 ${v.pieces}개씩</span>${v.results && v.results.length ? `<span class="cd-info">나온 것 <b>${v.results.map((r) => NAME[r]).join(' ')}</b></span>` : ''}`; },
    rankLabel(v, i) { return v && v.done ? `🏁 ${v.done[i]}/${v.pieces}` : ''; },
    mount
  });
})();
