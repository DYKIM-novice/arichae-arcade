/* 아리채 오락실 · 프리첼 (혼자 푸는 카드 퍼즐, 방 안 모두가 같은 판으로 빨리 풀기 시합)
   - 판: 마이크로소프트 프리첼과 같은 번호 판(1~32000)
   - 위 왼쪽 빈칸 4개(프리셀)에는 아무 카드나 한 장씩, 위 오른쪽 4칸(홈)에는 무늬별로 A → K
   - 아래 8줄에는 '한 숫자 작은 + 다른 색' 카드를 겹쳐요
   - 카드를 누르면 갈 수 있는 가장 좋은 곳으로 가고, 끌어서 원하는 곳에 놓을 수도 있어요
   - 이제 필요 없는 카드는 홈으로 저절로 올라가요 */
(function () {
  'use strict';
  const C = window.Cards;
  const SUITS = 'shdc';

  /* ---------- 규칙 ---------- */
  function deal(n) {
    // 마이크로소프트 프리첼 판 만들기 (같은 번호면 언제나 같은 판)
    let seed = n;
    const cards = Array.from({ length: 52 }, (_, i) => i);
    const order = [];
    for (let i = 0; i < 52; i++) {
      seed = (seed * 214013 + 2531011) % 2147483648;
      const r = Math.floor(seed / 65536) & 0x7fff;
      const left = 52 - i;
      const j = r % left;
      order.push(cards[j]);
      cards[j] = cards[left - 1];
    }
    const cols = [[], [], [], [], [], [], [], []];
    order.forEach((c, k) => {
      const rank = C.RANKS[Math.floor(c / 4)];
      const suit = 'cdhs'[c % 4];
      cols[k % 8].push(rank + suit);
    });
    return cols;
  }
  const rank = (c) => C.RANKS.indexOf(c[0]) + 1;
  const red = (c) => c[1] === 'h' || c[1] === 'd';
  const stacks = (a, b) => rank(b) === rank(a) + 1 && red(a) !== red(b);   // a 를 b 위에

  function newState(n) { return { cols: deal(n), cells: [null, null, null, null], found: { s: 0, h: 0, d: 0, c: 0 } }; }
  const clone = (st) => ({ cols: st.cols.map((c) => c.slice()), cells: st.cells.slice(), found: Object.assign({}, st.found) });
  const foundCount = (st) => SUITS.split('').reduce((a, s) => a + st.found[s], 0);
  function runStart(col) {
    // 맨 위부터 이어진 순서(색 번갈아 + 한 숫자씩)가 시작되는 곳
    let k = col.length - 1;
    while (k > 0 && stacks(col[k], col[k - 1])) k--;
    return k;
  }
  function capacity(st, toEmpty) {
    const free = st.cells.filter((x) => !x).length;
    const empty = st.cols.filter((c) => !c.length).length - (toEmpty ? 1 : 0);
    return (free + 1) * Math.pow(2, Math.max(0, empty));
  }
  // 옮기기: src = {col, k} 또는 {cell}, dst = {col} / {cell} / {found}
  function tryMove(st, src, dst) {
    const cards = src.cell != null ? [st.cells[src.cell]] : st.cols[src.col].slice(src.k);
    if (!cards.length || !cards[0]) return null;
    if (src.col != null) {
      for (let i = 1; i < cards.length; i++) if (!stacks(cards[i], cards[i - 1])) return null;
    }
    const first = cards[0];
    if (dst.found) {
      if (cards.length !== 1) return null;
      if (st.found[first[1]] !== rank(first) - 1) return null;
    } else if (dst.cell != null) {
      if (cards.length !== 1 || st.cells[dst.cell]) return null;
    } else if (dst.col != null) {
      if (src.col === dst.col) return null;
      const to = st.cols[dst.col];
      if (to.length && !stacks(first, to[to.length - 1])) return null;
      if (cards.length > capacity(st, !to.length)) return null;
    } else return null;
    const ns = clone(st);
    if (src.cell != null) ns.cells[src.cell] = null; else ns.cols[src.col].length = src.k;
    if (dst.found) ns.found[first[1]]++;
    else if (dst.cell != null) ns.cells[dst.cell] = first;
    else ns.cols[dst.col] = ns.cols[dst.col].concat(cards);
    return ns;
  }
  // 이제 필요 없는 카드: 반대 색 홈 두 곳이 그 카드 바로 아래 숫자까지 올라갔으면 안전해요
  function safeToHome(st, c) {
    const r = rank(c);
    if (st.found[c[1]] !== r - 1) return false;
    if (r <= 2) return true;
    const opp = red(c) ? ['s', 'c'] : ['h', 'd'];
    return opp.every((s) => st.found[s] >= r - 1);
  }
  function autoStep(st, everything) {
    for (let i = 0; i < 4; i++) { const c = st.cells[i]; if (c && (everything ? st.found[c[1]] === rank(c) - 1 : safeToHome(st, c))) return { src: { cell: i }, card: c }; }
    for (let i = 0; i < 8; i++) {
      const col = st.cols[i]; if (!col.length) continue;
      const c = col[col.length - 1];
      if (everything ? st.found[c[1]] === rank(c) - 1 : safeToHome(st, c)) return { src: { col: i, k: col.length - 1 }, card: c };
    }
    return null;
  }
  // 남은 카드가 모두 줄마다 큰 수 → 작은 수로 놓였으면 끝까지 자동으로
  function solvedShape(st) { return st.cols.every((col) => col.every((c, i) => i === 0 || rank(c) < rank(col[i - 1]))); }

  /* ---------- 화면 ---------- */
  function mount(el, api, opts) {
    const DEAL = opts.deal;
    el.innerHTML = `<div class="fc-wrap"><div class="fc-top"></div><div class="fc-cols"></div><div class="fc-cards"></div><div class="fc-win"></div></div>`;
    const wrap = el.querySelector('.fc-wrap');
    const layer = el.querySelector('.fc-cards');
    let st = newState(DEAL);
    let hist = [];
    let moves = 0;
    let done = false;
    let busy = false;
    const els = {};        // 카드 → 요소
    let L = null;          // 자리 계산

    function layout() {
      const W = wrap.clientWidth;
      const g = Math.max(3, Math.round(W * 0.011));
      const cw = Math.floor((W - g * 9) / 8);
      const ch = Math.round(cw * 1.4);
      const top = 6;
      const colTop = top + ch + g * 3;
      const avail = Math.max(ch * 3, (wrap.clientHeight || window.innerHeight * 0.6) - colTop - 8);
      const x = (i) => g + i * (cw + g);
      L = { W, g, cw, ch, top, colTop, avail, x };
      // 빈칸 모양
      el.querySelector('.fc-top').innerHTML = [0, 1, 2, 3].map((i) => `<div class="fc-slot cell" style="left:${x(i)}px;top:${top}px;width:${cw}px;height:${ch}px"></div>`).join('') +
        SUITS.split('').map((s, i) => `<div class="fc-slot home" style="left:${x(i + 4)}px;top:${top}px;width:${cw}px;height:${ch}px"><svg viewBox="0 0 10 10">${C.suitShape(s, 5, 5, 6, 'rgba(255,255,255,.28)')}</svg></div>`).join('');
      el.querySelector('.fc-cols').innerHTML = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<div class="fc-slot col" style="left:${x(i)}px;top:${colTop}px;width:${cw}px;height:${ch}px"></div>`).join('');
    }
    function stepFor(len) {
      if (len <= 1) return 0;
      return Math.max(L.ch * 0.2, Math.min(L.ch * 0.5, (L.avail - L.ch) / (len - 1)));
    }
    function cardEl(c) {
      let e = els[c];
      if (!e) {
        e = document.createElement('div');
        e.className = 'fc-card';
        e.dataset.card = c;
        e.innerHTML = C.svg(c, { big: true });
        layer.appendChild(e);
        els[c] = e;
      }
      return e;
    }
    function place(e, x, y, z, instant) {
      e.style.width = L.cw + 'px'; e.style.height = L.ch + 'px';
      e.style.zIndex = z;
      if (instant) { e.style.transition = 'none'; e.style.transform = `translate(${x}px, ${y}px)`; void e.offsetWidth; e.style.transition = ''; } else e.style.transform = `translate(${x}px, ${y}px)`;
      e._x = x; e._y = y;
    }
    function draw(instant) {
      if (!L) layout();
      st.cells.forEach((c, i) => { if (c) place(cardEl(c), L.x(i), L.top, 10, instant); });
      SUITS.split('').forEach((s, i) => {
        for (let r = 1; r <= 13; r++) {
          const c = C.RANKS[r - 1] + s;
          if (r <= st.found[s]) place(cardEl(c), L.x(i + 4), L.top, 10 + r, instant);
        }
      });
      st.cols.forEach((col, i) => {
        const step = stepFor(col.length);
        const rs = runStart(col);
        col.forEach((c, k) => {
          const e = cardEl(c);
          place(e, L.x(i), L.colTop + k * step, 20 + k, instant);
          e.classList.toggle('dim', k < rs);
        });
      });
      // 홈에 올라간 카드와 프리셀 카드는 흐리게 하지 않아요
      st.cells.forEach((c) => { if (c) els[c].classList.remove('dim'); });
      SUITS.split('').forEach((s) => { for (let r = 1; r <= st.found[s]; r++) { const e = els[C.RANKS[r - 1] + s]; if (e) e.classList.remove('dim'); } });
      api.status({ moves, found: foundCount(st), canUndo: hist.length > 0 });
    }

    function commit(ns) {
      hist.push(st);
      if (hist.length > 400) hist.shift();
      st = ns;
      moves++;
      api.tick();
      draw();
      runAuto();
    }
    function runAuto() {
      busy = true;
      const step = () => {
        const all = solvedShape(st);   // 남은 카드가 다 정리된 모양이면 끝까지 자동으로
        const a = autoStep(st, all);
        if (!a) { busy = false; afterMoves(); return; }
        st = tryMove(st, a.src, { found: true });
        draw();
        setTimeout(step, all ? 70 : 110);
      };
      setTimeout(step, 140);
    }
    function afterMoves() {
      const f = foundCount(st);
      api.progress(f, moves, f === 52);
      if (f === 52 && !done) {
        done = true;
        celebrate();
      }
    }
    function celebrate() {
      // 카드가 하나씩 튀어 올라요
      const all = Object.values(els);
      all.forEach((e, k) => setTimeout(() => e.classList.add('fly'), k * 25));
    }

    // 누른 곳 찾기
    function srcOf(c) {
      for (let i = 0; i < 4; i++) if (st.cells[i] === c) return { cell: i };
      for (let i = 0; i < 8; i++) { const k = st.cols[i].indexOf(c); if (k >= 0) return { col: i, k }; }
      return null;   // 홈에 있는 카드
    }
    function bestMove(src) {
      const cards = src.cell != null ? [st.cells[src.cell]] : st.cols[src.col].slice(src.k);
      const tries = [];
      if (cards.length === 1) tries.push({ found: true });
      // 카드가 있는 줄 (긴 줄 먼저)
      const cols = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => st.cols[i].length).sort((a, b) => st.cols[b].length - st.cols[a].length);
      cols.forEach((i) => tries.push({ col: i }));
      const empty = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => !st.cols[i].length);
      if (!(src.col != null && src.k === 0)) empty.forEach((i) => tries.push({ col: i }));
      if (cards.length === 1 && src.cell == null) for (let i = 0; i < 4; i++) if (!st.cells[i]) { tries.push({ cell: i }); break; }
      for (const d of tries) { const ns = tryMove(st, src, d); if (ns) return ns; }
      return null;
    }
    function dropTarget(px, py) {
      const r = wrap.getBoundingClientRect();
      const x = px - r.left; const y = py - r.top;
      const i = Math.max(0, Math.min(7, Math.floor((x - L.g / 2) / (L.cw + L.g))));
      if (y < L.colTop - L.g) return i < 4 ? { cell: i } : { found: true };
      return { col: i };
    }

    let drag = null;
    layer.addEventListener('pointerdown', (ev) => {
      if (done || busy || !api.canPlay()) return;
      const e = ev.target.closest('.fc-card');
      if (!e) return;
      const c = e.dataset.card;
      const src = srcOf(c);
      if (!src) return;
      ev.preventDefault();
      let group = [c];
      if (src.col != null) {
        group = st.cols[src.col].slice(src.k);
        if (src.k < runStart(st.cols[src.col])) { api.say('순서대로(한 숫자 작은 다른 색) 이어진 카드만 같이 옮길 수 있어요'); shake(e); return; }
      }
      drag = { src, group, x0: ev.clientX, y0: ev.clientY, moved: false, id: ev.pointerId };
      try { layer.setPointerCapture(ev.pointerId); } catch (x) { /* 무시 */ }
    });
    layer.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = ev.clientX - drag.x0; const dy = ev.clientY - drag.y0;
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;
      drag.moved = true;
      drag.group.forEach((c, k) => {
        const e = els[c];
        e.style.transition = 'none';
        e.style.zIndex = 200 + k;
        e.style.transform = `translate(${e._x + dx}px, ${e._y + dy}px) scale(1.06)`;
      });
    });
    const end = (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      const d = drag; drag = null;
      d.group.forEach((c) => { els[c].style.transition = ''; });
      if (!d.moved) {
        const ns = bestMove(d.src);
        if (ns) commit(ns); else { shake(els[d.group[0]]); api.say('갈 수 있는 곳이 없어요'); draw(); }
        return;
      }
      const t = dropTarget(ev.clientX, ev.clientY);
      const ns = t ? tryMove(st, d.src, t) : null;
      if (ns) commit(ns);
      else {
        if (t && t.col != null && d.group.length > 1 && st.cols[t.col].length !== undefined) {
          const cap = capacity(st, !st.cols[t.col].length);
          if (d.group.length > cap) api.say(`지금은 한 번에 ${cap}장까지만 옮길 수 있어요 (빈칸·빈 줄이 많을수록 더 많이)`);
        }
        draw();
      }
    };
    layer.addEventListener('pointerup', end);
    layer.addEventListener('pointercancel', end);
    function shake(e) { e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake'); api.buzz(); }

    const onResize = () => { L = null; layout(); draw(true); };
    window.addEventListener('resize', onResize);
    layout();
    draw(true);
    // 처음 나눠 주기: 위에서 촤르륵
    Object.values(els).forEach((e, k) => {
      const tx = e.style.transform;
      e.style.transition = 'none'; e.style.transform = `translate(${L.W / 2 - L.cw / 2}px, ${-L.ch}px)`; e.style.opacity = '0';
      void e.offsetWidth;
      setTimeout(() => { e.style.transition = ''; e.style.transform = tx; e.style.opacity = ''; }, 30 + k * 12);
    });

    return {
      undo() {
        if (!hist.length || busy || done) return;
        st = hist.pop(); moves++; draw(); api.progress(foundCount(st), moves, false);
      },
      restart() {
        if (busy || done) return;
        hist = []; st = newState(DEAL); moves++; draw(); api.progress(0, moves, false);
      },
      relayout() { onResize(); },
      // 시험용 (자동 풀이로 끝까지 가 보기)
      _test: { state: () => st, move: (src, dst) => { const ns = tryMove(st, src, dst); if (ns) commit(ns); return !!ns; }, busy: () => busy },
      destroy() { window.removeEventListener('resize', onResize); el.innerHTML = ''; }
    };
  }

  C.register({
    id: 'freecell',
    kind: 'race',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#1B7A4A"/><g transform="translate(6 7) rotate(-10) scale(.24)">${C.svg('Ks').replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(18 9) rotate(8) scale(.24)">${C.svg('Ah').replace(/<\/?svg[^>]*>/g, '')}</g></svg>`,
    rulesText: '혼자 푸는 카드 퍼즐 · 방 안 모두가 같은 판을 동시에 풀어요 · 아래 8줄에 "한 숫자 작은 다른 색" 카드를 겹치고, 무늬별로 A부터 K까지 홈에 올리면 끝 · 빨리 풀수록 1등',
    learn: '프리첼은 1990년대 윈도우에 들어 있어서 전 세계 사람들이 즐긴 카드 퍼즐이에요. 3만 2천 개 판 가운데 단 하나(11982번)만 빼고 모두 풀 수 있다는 게 밝혀졌어요!',
    mount
  });
  window.FreeCellRules = { deal, tryMove, newState, capacity, runStart, safeToHome };
})();
