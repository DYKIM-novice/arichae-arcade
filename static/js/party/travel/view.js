/* 아리채 오락실 · 세계여행 화면
   - 9×9 판의 바깥 32칸 (오른쪽 아래 '출발'에서 왼쪽으로 돌아요) · 칸을 누르면 자세히
   - 가운데: 사람마다 돈·재산 · 주사위 · 할 일 (사기·짓기·우주여행 고르기) · 최근 소식
   - 말은 한 칸씩 걸어가요 · 황금 열쇠는 카드로 크게 */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#E8263B', '#2E5BD1', '#16A34A', '#F59E0B'];
  const GCOL = ['#8B5A2B', '#5DADEC', '#E05FA0', '#FF8A3D', '#E8263B', '#F2C200', '#22A35A', '#2E5BD1'];
  const SHORT = { 부에노스아이레스: '부에노스', 이스탄불: '이스탄불', 코펜하겐: '코펜하겐', 싱가포르: '싱가포르', 상파울루: '상파울루', '황금 열쇠': '🔑 열쇠', 우주여행: '🚀 우주', 무인도: '🏝 무인도', 축제: '🎉 축제', 출발: '출발 ←', '기금 내기': '💰 기금' };
  const LV = ['', '🏠', '🏢', '🏨'];
  const PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]] };
  const dieSVG = (d) => `<svg viewBox="0 0 100 100"><rect x="5" y="5" width="90" height="90" rx="18" fill="#fff" stroke="#1C1733" stroke-width="4"/>${PIPS[d].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="#1C1733"/>`).join('')}</svg>`;
  function grid(c) {
    if (c === 0) return [8, 8];
    if (c < 8) return [8 - c, 8];
    if (c === 8) return [0, 8];
    if (c < 16) return [0, 8 - (c - 8)];
    if (c === 16) return [0, 0];
    if (c < 24) return [c - 16, 0];
    if (c === 24) return [8, 0];
    return [8, c - 24];
  }

  function mount(el, api) {
    el.innerHTML = '<div class="tv"><div class="tv-board"><div class="tv-cells"></div><div class="tv-center"><div class="tv-players"></div><div class="tv-dice"></div><div class="tv-act"></div><div class="tv-log"></div></div></div><div class="tv-pop"></div></div>';
    const $ = (s) => el.querySelector(s);
    let v = null; let shown = null; let lastEv = 0; let busy = false; const queue = []; const timers = []; let popT = 0;
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); };
    const nm = (i) => esc(api.seat(i).name);
    const fit = () => { const b = $('.tv-board'); const s = Math.floor(Math.min(el.clientWidth, el.clientHeight)); b.style.width = b.style.height = `${s}px`; };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    requestAnimationFrame(fit);
    const myTurn = (w) => (w || v) && v.me != null && (w || v).toAct === v.me;

    function drawCells(view, pos) {
      const P = pos || view.pos;
      const here = {};
      P.forEach((p, i) => { if (!view.out[i]) (here[p] = here[p] || []).push(i); });
      const flying = !busy && myTurn(view) && view.phase === 'fly';
      $('.tv-cells').innerHTML = view.board.map(([k, name, g, price], c) => {
        const [x, y] = grid(c);
        const o = view.owner[c];
        const corner = c % 8 === 0;
        const label = SHORT[name] || name;
        const bar = k === 'city' ? `<i class="tv-bar" style="background:${GCOL[g]}"></i>` : '';
        const sub = (k === 'city' || k === 'tour') ? (o >= 0 ? `<small class="tv-rent">${view.rent[c]}만</small>` : `<small>${price}만</small>`) : '';
        const toks = (here[c] || []).map((i) => `<span class="tv-tok" style="--c:${COLORS[i]}">${api.seat(i).av}</span>`).join('');
        return `<button type="button" class="tv-cell${corner ? ' corner' : ''}${k === 'key' ? ' key' : ''}${o >= 0 ? ' own' : ''}${flying && c !== 24 ? ' pick' : ''}" data-cell="${c}" style="grid-column:${x + 1};grid-row:${y + 1};${o >= 0 ? `--oc:${COLORS[o]}` : ''}">
          ${bar}<b>${esc(label)}</b>${sub}${view.lv[c] ? `<span class="tv-lv">${LV[view.lv[c]]}</span>` : ''}<span class="tv-toks">${toks}</span></button>`;
      }).join('');
    }
    function drawPlayers(view) {
      $('.tv-players').innerHTML = view.cash.map((m, i) => `<div class="tv-pl${view.turn === i && !view.over ? ' turn' : ''}${view.out[i] ? ' out' : ''}" style="--c:${COLORS[i]}"><span class="av">${api.seat(i).av}</span>
        <div><b>${nm(i)}</b><span>💵 ${m}만${view.island[i] ? ' · 🏝' : ''}${view.space[i] ? ' · 🚀' : ''}${view.escape[i] ? ' · 🎫' : ''}</span></div><em>${view.out[i] ? '파산' : `재산 ${view.assets[i]}`}</em></div>`).join('');
    }
    function drawAct(view) {
      const box = $('.tv-act');
      let h = '';
      if (view.over) h = '<div class="tv-msg">게임 끝!</div>';
      else if (busy) h = '<div class="tv-msg">&nbsp;</div>';
      else if (!myTurn(view)) h = `<div class="tv-msg"><span class="bd-dots">${nm(view.turn)} 차례</span></div>`;
      else if (view.phase === 'roll') h = `<button type="button" class="btn btn-yellow tv-go" data-tv="roll">🎲 주사위 굴리기${view.island[view.me] ? ' (무인도: 같은 수가 나오면 탈출)' : ''}</button>`;
      else if (view.phase === 'fly') h = '<div class="tv-msg"><b class="lr-hot">🚀 우주여행!</b> 가고 싶은 칸을 눌러요</div>';
      else if (view.phase === 'buy') {
        const p = view.pending; const [k, name, , price] = view.board[p.cell];
        h = `<div class="tv-q"><b>${esc(name)}</b>을(를) 살까요? <small>${price}만</small></div><div class="tv-btns"><button type="button" class="btn btn-yellow" data-tv="buy">사기</button>
          ${k === 'city' && view.cash[view.me] >= price + p.build ? `<button type="button" class="btn btn-green" data-tv="buy2">🏠 별장까지 (+${p.build}만)</button>` : ''}<button type="button" class="btn btn-ghost" data-tv="pass">안 사요</button></div>`;
      } else if (view.phase === 'build') {
        const p = view.pending;
        h = `<div class="tv-q"><b>${esc(view.board[p.cell][1])}</b>에 ${p.to}을(를) 지을까요? <small>${p.cost}만</small></div><div class="tv-btns"><button type="button" class="btn btn-yellow" data-tv="build">짓기</button><button type="button" class="btn btn-ghost" data-tv="pass">안 지어요</button></div>`;
      }
      if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
    }
    function logText(e) {
      const w = e.who != null ? nm(e.who) : '';
      const cell = e.cell != null ? esc(v.board[e.cell][1]) : '';
      switch (e.k) {
        case 'buy': return `${w}: ${cell} 샀어요`;
        case 'build': return `${w}: ${cell}에 ${e.what}`;
        case 'rent': return `${w} → ${nm(e.to)}: 통행료 ${e.amount}만`;
        case 'salary': return `${w}: 월급 +${e.got}만`;
        case 'key': return `${w}: 🔑 ${esc(e.text)}`;
        case 'island': return `${w}: 무인도에 갇혔어요`;
        case 'stuck': return `${w}: 아직 무인도 (${e.left}번 남음)`;
        case 'escape': return `${w}: 탈출권으로 나와요`;
        case 'fest': return `${w}: 축제 기금 +${e.got}만`;
        case 'space': return `${w}: 다음 차례에 우주여행`;
        case 'tax': return `${w}: 기금 ${e.amount}만`;
        case 'sell': return `${w}: ${cell} ${e.what} 팔기 (+${e.got})`;
        case 'bankrupt': return `${w}: 파산 😢`;
        case 'triple': return `${w}: 더블 세 번! 무인도로`;
        default: return '';
      }
    }
    function addLog(t) { if (!t) return; const box = $('.tv-log'); box.insertAdjacentHTML('afterbegin', `<div>${t}</div>`); while (box.children.length > 4) box.lastChild.remove(); }
    function pop(html) { const p = $('.tv-pop'); p.innerHTML = `<div class="tv-card">${html}</div>`; p.className = 'tv-pop show'; clearTimeout(popT); popT = setTimeout(() => { p.className = 'tv-pop'; }, 1900); }
    function drawDice(d) { $('.tv-dice').innerHTML = d.map(dieSVG).join(''); const b = $('.tv-dice'); b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll'); }

    function render(view) { queue.push(view); if (!busy) next(); }
    function next() {
      const nv = queue.shift();
      if (!nv) { busy = false; if (v) { drawCells(v); drawAct(v); } return; }
      const evs = (nv.events || []).filter((e) => e.id > lastEv);
      if (evs.length) lastEv = Math.max(...evs.map((e) => e.id));
      const prev = shown;
      v = nv;
      if (!prev || queue.length > 2) { shown = nv; drawCells(nv); drawPlayers(nv); drawAct(nv); later(next, 0); return; }
      busy = true; drawAct(nv);
      const pos = prev.pos.slice();
      const steps = [];
      evs.forEach((e) => {
        if (e.k === 'dice') steps.push({ ms: 650, f: () => { drawDice(e.d); api.sfx('pop'); if (e.d[0] === e.d[1]) addLog(`${nm(e.who)}: 더블!`); } });
        else if (e.k === 'move') e.path.forEach((p) => steps.push({ ms: 170, f: () => { pos[e.who] = p; drawCells(prev, pos); api.sfx('tick'); } }));
        else if (e.k === 'key') steps.push({ ms: 1300, f: () => { pop(`<span class="tv-k">🔑 황금 열쇠</span><p>${esc(e.text)}</p>`); api.sfx('whoosh'); addLog(logText(e)); } });
        else if (e.k === 'bankrupt') steps.push({ ms: 900, f: () => { pop(`<p>${nm(e.who)} 파산! 😢</p>`); api.sfx('bad'); addLog(logText(e)); } });
        else if (e.k === 'rent') steps.push({ ms: 400, f: () => { addLog(logText(e)); api.sfx(e.who === v.me ? 'bad' : e.to === v.me ? 'good' : 'soft'); } });
        else steps.push({ ms: 120, f: () => addLog(logText(e)) });
      });
      let k = 0;
      const run = () => {
        if (k >= steps.length) { shown = nv; busy = false; drawCells(nv); drawPlayers(nv); drawAct(nv); if (myTurn(nv)) api.vibrate(15); later(next, 0); return; }
        const s = steps[k++]; s.f(); later(run, s.ms);
      };
      run();
    }

    el.addEventListener('click', (e) => {
      if (!v) return;
      const b = e.target.closest('[data-tv]');
      if (b && !busy && myTurn()) { api.act({ k: b.dataset.tv }); api.sfx('pop'); el.querySelectorAll('[data-tv]').forEach((x) => { x.disabled = true; }); return; }
      const c = e.target.closest('[data-cell]');
      if (!c) return;
      const ci = Number(c.dataset.cell);
      if (!busy && myTurn() && v.phase === 'fly') {
        if (ci === 24) { api.say('다른 곳을 골라요'); return; }
        api.act({ k: 'fly', c: ci }); api.sfx('whoosh'); return;
      }
      // 칸 자세히
      const [k, name, , price] = v.board[ci]; const o = v.owner[ci];
      const info = k === 'city' ? `땅값 ${price}만 · 지금 통행료 ${v.rent[ci] || Math.max(1, Math.round(price * 0.3))}만${o >= 0 ? ` · 주인 ${nm(o)}${v.lv[ci] ? ` · ${['', '별장', '빌딩', '호텔'][v.lv[ci]]}` : ''}` : ' · 아직 주인 없음'}`
        : k === 'tour' ? `관광지 ${price}만 · ${o >= 0 ? `주인 ${nm(o)} · 통행료 ${v.rent[ci]}만` : '아직 주인 없음'}`
          : { start: `지나갈 때마다 월급 20만`, key: '황금 열쇠 카드를 뽑아요', island: '갇히면 두 번 쉬어요 (더블이면 탈출)', fest: `모인 기금 ${v.fund}만을 받아요`, space: '다음 차례에 원하는 칸으로', tax: `기금에 ${price}만 내요` }[k] || '';
      pop(`<span class="tv-k">${esc(name)}</span><p>${info}</p>`);
    });
    return { render, tick() { if (v && !busy) drawAct(v); }, busy: () => busy || queue.length > 0, destroy() { timers.forEach(clearTimeout); clearTimeout(popT); if (ro) ro.disconnect(); el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#2E9CCA"/><circle cx="20" cy="20" r="12" fill="#5DD39E"/><path d="M12 15 q4 -3 8 0 t7 2 M10 23 q5 -2 9 1 t9 -1" stroke="#1E7A55" stroke-width="2" fill="none"/><path d="M26 6 l6 4 -3 1 2 5 -2 1 -3 -4 -3 2 z" fill="#fff"/></svg>';

  C.register({
    id: 'travel',
    kind: 'table',
    icon: ICON,
    rulesText: '주사위로 세계를 돌며 도시를 사고 별장·빌딩·호텔을 지어요 · 남의 도시에 서면 통행료 · 황금 열쇠·무인도·우주여행·축제 · 파산하지 않고 재산이 가장 많으면 승리',
    learn: '도시마다 땅값과 통행료가 달라요. 같은 색 도시를 다 모으면 통행료가 2배! 돈을 다 쓰면 통행료를 못 내서 위험해요 — 적당히 남겨 두는 게 작전이에요.',
    optionsUI: [{ key: 'rounds', label: '몇 바퀴', names: { 20: '20바퀴', 12: '12바퀴 (빨리)', 30: '30바퀴' } }],
    bar(v) { return `<span class="cd-info">${Math.min(v.round, v.rounds)}/${v.rounds}바퀴</span><span class="cd-info">축제 기금 <b>${v.fund}</b>만</span>`; },
    rankLabel(v, i) { return v && v.assets ? (v.out[i] ? '파산' : `재산 ${v.assets[i]}만`) : ''; },
    mount
  });
})();
