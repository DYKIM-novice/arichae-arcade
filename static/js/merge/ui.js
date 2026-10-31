/* 머지관 · 「소라섬 등불 이야기」 화면 · 조작
   - 판(7×9): 끌어서 놓기(가까운 칸에 착 붙음) + 톡-톡 합치기 · 발생기 톡 → 옆 빈칸에 물건이 튀어나와요
   - 주문 카드: 얼굴 · 원하는 물건(있으면 초록 체크) · 보상 · [건네기] · ↻ 다른 부탁
   - 규칙은 전부 MergeCore(core.js) 에 맡기고, 여기는 그리기·움직임·소리만 해요
   - 2단계 자리: 아래 '마을' 화면(town) · 이야기(story) 모듈이 renderAll / changed 를 같이 쓰면 돼요 */
(function () {
  'use strict';

  const D = window.MergeData, C = window.MergeCore, S = window.MergeSave, A = window.MergeArt, F = window.MergeFx;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now();
  const rng = Math.random;
  // 받침에 따라 이/가 · 을/를
  const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1); return w + ((c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28) ? a : b); };
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z" fill="#f5c142" stroke="#c9901a" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  let ls = null;
  try { ls = window.localStorage; } catch (e) { ls = null; }
  const store = S.localAdapter(ls);
  let st = S.load(store, now(), rng);
  const saver = S.Saver(store, () => st, 1000);
  function changed() { st.updatedAt = now(); saver.schedule(); }

  let sel = -1;          // 고른 칸
  let drag = null;       // 끌기 중
  let busy = false;      // 건네기 움직임 중 (그동안 판 조작 막음)
  let lastAct = now(), hintOn = false;
  let tipIdx = Math.floor(Math.random() * D.TIPS.length);
  const shown = { coins: st.coins, stars: st.stars, hold: 0 };   // 동전·별이 날아가는 동안 숫자는 도착할 때 올라요
  let infoMsg = null;    // 정보 칸에 잠깐 띄우는 말

  /* ---------- 그림 조각 ---------- */
  function artImg(id, label, cls) {
    const s = A.src(id);
    return s ? `<img src="${esc(s)}" alt="${esc(label || '')}" draggable="false" data-ph="${esc(label || '')}"${cls ? ` class="${cls}"` : ''}>` : `<span class="ph">${esc(label || '')}</span>`;
  }
  // 그림을 못 읽으면 이름 동그라미로 바꿔요 (빈 칸 금지)
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.dataset && t.dataset.ph != null) {
      const sp = document.createElement('span'); sp.className = 'ph'; sp.textContent = t.dataset.ph; t.replaceWith(sp);
    }
  }, true);
  function faceHTML(v) {
    const s = A.src(v.art);
    return `<span class="face" style="--fc:${esc(v.color)}">${s ? `<img src="${esc(s)}" alt="" draggable="false" data-ph="${esc(v.name[0])}">` : esc(v.name[0])}</span>`;
  }
  function cellKey(cell) { return cell ? (cell.k === 'item' ? cell.c + cell.t : cell.k === 'gen' ? cell.g : cell.k) : ''; }
  function cellHTML(cell) {
    if (!cell) return '';
    if (cell.k === 'gen') {
      const g = D.GENS[cell.g];
      const cost = st.settings.easy ? '' : `<span class="gcost">${artImg('energy', '')}1</span>`;
      return `<div class="it gen c-${g.chain}">${artImg(cell.g, g.name)}${cost}</div>`;
    }
    if (cell.k === 'wild') return `<div class="it">${artImg('wild', '무지개 소라')}</div>`;
    const max = cell.t >= C.maxTier(cell.c);
    return `<div class="it c-${cell.c}${max ? ' max' : ''}">${artImg(C.itemId(cell), C.itemName(cell))}<i class="tier">${cell.t}</i></div>`;
  }
  const cellEl = (i) => $('board').children[i];
  const itEl = (i) => { const c = cellEl(i); return c && c.querySelector('.it'); };
  function center(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }

  /* ---------- 판 ---------- */
  function buildBoard() {
    const b = $('board');
    b.innerHTML = '';
    for (let i = 0; i < C.N; i++) {
      const d = document.createElement('div');
      d.className = 'cell'; d.dataset.i = i; d.dataset.k = '';
      b.appendChild(d);
    }
  }
  function renderBoard() {
    const b = $('board');
    for (let i = 0; i < C.N; i++) {
      const el = b.children[i];
      const k = cellKey(st.board[i]) + (st.board[i] && st.board[i].k === 'gen' && st.settings.easy ? '~' : '');
      if (el.dataset.k !== k) { el.innerHTML = cellHTML(st.board[i]); el.dataset.k = k; }
      const it = el.firstElementChild;
      if (it) it.classList.toggle('sel', i === sel);
    }
    document.body.classList.toggle('nonums', !st.settings.nums);
  }

  function layout() {
    const vw = Math.min(innerWidth, 560);
    const gap = 3;
    const W = vw - 16 - 20;
    const used = $('hud').offsetHeight + $('orders').offsetHeight + $('info').offsetHeight;
    const H = innerHeight - used - 20 - 8;
    const cell = Math.floor(Math.max(34, Math.min(76, (W - 6 * gap) / 7, (H - 8 * gap) / 9)));
    document.documentElement.style.setProperty('--cell', cell + 'px');
    document.documentElement.style.setProperty('--gap', gap + 'px');
  }

  /* ---------- 위 칸 (기운 · 동전 · 별) ---------- */
  function mmss(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function renderHud() {
    const e = C.energyInfo(st, now());
    $('hud-energy').classList.toggle('easy', e.easy);
    $('en').textContent = e.easy ? '' : e.energy;
    $('en-t').textContent = e.easy ? '편하게' : e.full ? '가득' : '+1 ' + mmss(e.nextMs);
    if (!shown.hold) { shown.coins = st.coins; shown.stars = st.stars; }
    $('coins').textContent = shown.coins;
    $('stars').textContent = shown.stars;
  }
  function bump(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  /* ---------- 주문 카드 ---------- */
  let wasReady = {};
  function orderCardHTML(o) {
    const v = D.VILLAGERS[o.who] || D.VILLAGERS.hayun;
    const need = o.need.map((n, k) => {
      const cell = { k: 'item', c: n.c, t: n.t };
      const nm = C.itemName(cell);
      return `<button type="button" class="oc-item c-${n.c}" data-hl="${o.id}:${k}" aria-label="${esc(nm)} ${n.t}단계">${artImg(C.itemId(cell), nm)}<i class="tier">${n.t}</i><b class="ok">✓</b></button>`;
    }).join('');
    return `<button type="button" class="oc-face" data-face="${o.id}">${faceHTML(v)}<span class="oc-name">${esc(v.name)}</span></button>
      <button type="button" class="oc-skip" data-skip="${o.id}" aria-label="다른 부탁으로 바꾸기">↻</button>
      <div class="oc-need${o.need.length > 1 ? ' many' : ''}">${need}</div>
      <div class="oc-rew"><span>${artImg('coin', '동전')}${o.coins}</span><span>${STAR}${o.stars}</span></div>
      <button type="button" class="oc-go" data-go="${o.id}">건네기</button>`;
  }
  function renderOrders() {
    const box = $('orders');
    const keep = {};
    st.orders.forEach((o, idx) => {
      let el = box.querySelector(`.oc[data-o="${o.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'oc in'; el.dataset.o = o.id;
        el.innerHTML = orderCardHTML(o);
        el.addEventListener('animationend', () => el.classList.remove('in'), { once: true });
      }
      const live = Array.prototype.filter.call(box.children, (c) => !c.classList.contains('out'));
      if (live[idx] !== el) box.insertBefore(el, live[idx] || null);
      const s = C.orderStatus(st, o);
      el.classList.toggle('ready', s.ready);
      el.querySelectorAll('.oc-item').forEach((b, k) => b.classList.toggle('have', !!s.have[k]));
      const go = el.querySelector('.oc-go');
      go.setAttribute('aria-disabled', String(!s.ready));
      if (s.ready && !wasReady[o.id]) { F.sfx('open'); F.vibrate(10); }
      wasReady[o.id] = s.ready;
      keep[o.id] = true;
    });
    Array.prototype.forEach.call(box.querySelectorAll('.oc'), (el) => { if (!keep[el.dataset.o] && !el.classList.contains('out')) el.remove(); });
  }

  function deliver(id) {
    const o = st.orders.find((x) => x.id === id);
    if (!o || busy) return;
    const s = C.orderStatus(st, o);
    const card = $('orders').querySelector(`.oc[data-o="${id}"]`);
    if (!s.ready) {
      F.sfx('bad');
      const miss = o.need.find((n, k) => !s.have[k]);
      showNeed(o, o.need.indexOf(miss));
      return;
    }
    busy = true;
    sel = -1;
    // 판의 물건이 카드로 날아가요
    s.cells.forEach((ci, k) => {
      const it = itEl(ci);
      const slot = card.querySelectorAll('.oc-item')[k] || card;
      if (it) { F.fly(it.innerHTML.replace(/<i class="tier">.*?<\/i>/, ''), center(it), center(slot), { ms: 380, s1: 0.7, size: center(it).w }); it.classList.add('lifted'); }
    });
    setTimeout(() => {
      const r = C.deliver(st, id, now(), rng);
      busy = false;
      if (!r.ok) { renderAll(); return; }
      const from = center(card);
      F.sfx('deliver'); F.vibrate([18, 40, 18]);
      F.burst(from.x, from.y, ['#f5c142', '#4dbb7c', '#ffffff', '#ff9eb5'], 22, 1.35);
      card.classList.add('out');
      setTimeout(() => card.remove(), 320);
      shown.hold++;
      const nCoin = Math.min(7, Math.max(2, Math.ceil(r.coins / 4)));
      F.fly(artImg('coin', ''), from, center($('hud-coin')), { count: nCoin, ms: 620, spread: 46, size: 28, s1: 0.7,
        onEach: (i) => { F.sfx('coin'); if (i === nCoin - 1) { shown.coins = st.coins; renderHudCounts(); bump('hud-coin'); } } });
      F.fly(STAR, from, center($('hud-star')), { count: Math.min(5, r.stars), ms: 700, spread: 30, size: 28, s1: 0.7,
        onEach: (i) => { if (i === Math.min(5, r.stars) - 1) { shown.stars = st.stars; renderHudCounts(); bump('hud-star'); shown.hold = Math.max(0, shown.hold - 1); } } });
      const v = D.VILLAGERS[r.order.who] || D.VILLAGERS.hayun;
      say(v, `${v.lines[2] || '고마워!'}  (동전 ${r.coins} · 별 ${r.stars})`);
      renderBoard(); renderOrders(); renderInfo();
      changed();
    }, 400);
  }
  function renderHudCounts() { $('coins').textContent = shown.coins; $('stars').textContent = shown.stars; }

  // 주문 카드의 물건 톡 → 판에서 찾아 반짝 · 없으면 만드는 법
  function showNeed(o, k) {
    const n = o.need[k];
    const cell = { k: 'item', c: n.c, t: n.t };
    const nm = C.itemName(cell);
    const hits = [];
    st.board.forEach((c, i) => { if (c && c.k === 'item' && c.c === n.c && c.t === n.t) hits.push(i); });
    if (hits.length) { flash(hits); say(D.VILLAGERS.hayun, `${josa(nm, '은', '는')} 여기 있어요! 끌어서 놓을 필요 없이 [건네기]만 누르면 돼요.`); return; }
    if (n.t > 1) {
      const prev = { k: 'item', c: n.c, t: n.t - 1 };
      const pn = C.itemName(prev);
      const have = [];
      st.board.forEach((c, i) => { if (c && c.k === 'item' && c.c === n.c && c.t === n.t - 1) have.push(i); });
      if (have.length) flash(have);
      else { const g = st.board.findIndex((c) => c && c.k === 'gen' && D.GENS[c.g].chain === n.c); if (g >= 0) flash([g]); }
      say(D.VILLAGERS.hayun, `${pn} 2개를 합치면 ${josa(nm, '이', '가')} 돼요. (${n.t}단계)`);
    }
  }
  function flash(list) {
    list.forEach((i) => { const c = cellEl(i); if (!c) return; c.classList.remove('hl'); void c.offsetWidth; c.classList.add('hl'); setTimeout(() => c.classList.remove('hl'), 1500); });
  }

  /* ---------- 아래 정보 칸 ---------- */
  function say(v, text) { infoMsg = { v, text }; renderInfo(); }
  function ladderHTML(c, cur) {
    const mx = C.maxTier(c);
    let h = '';
    for (let t = 1; t <= mx; t++) {
      const id = c + t;
      const known = !!st.found[id];
      const s = A.src(id);
      h += `<i class="${t === cur ? 'cur' : ''}${known ? '' : ' unk'}${s ? '' : ' ph-only'}${t === mx ? ' max-ic' : ''}" title="${esc(D.CHAINS[c].tiers[t - 1])}">${s ? `<img src="${esc(s)}" alt="" draggable="false">` : ''}</i>`;
    }
    return `<div class="ladder c-${c}">${h}</div>`;
  }
  function renderInfo() {
    const box = $('info');
    const cell = sel >= 0 ? st.board[sel] : null;
    let h;
    if (cell && cell.k === 'item') {
      infoMsg = null;
      const mx = C.maxTier(cell.c);
      const nm = C.itemName(cell);
      const next = cell.t < mx ? C.itemName({ k: 'item', c: cell.c, t: cell.t + 1 }) : '';
      const nextTxt = next ? (st.found[cell.c + (cell.t + 1)] ? `2개 → ${next}` : '2개를 합치면 → ???') : '최고 단계예요! 반짝반짝';
      h = `<div class="info-box c-${cell.c}"><div class="info-ic">${artImg(C.itemId(cell), nm)}</div>
        <div class="info-txt"><b>${esc(nm)}<em>${cell.t} / ${mx}단계</em></b><p>${esc(D.CHAINS[cell.c].name)} · ${esc(nextTxt)}</p>${ladderHTML(cell.c, cell.t)}</div></div>`;
    } else if (cell && cell.k === 'gen') {
      infoMsg = null;
      const g = D.GENS[cell.g];
      const ch = D.CHAINS[g.chain];
      h = `<div class="info-box c-${g.chain}"><div class="info-ic">${artImg(cell.g, g.name)}</div>
        <div class="info-txt"><b>${esc(g.name)}<em>발생기</em></b><p>톡 하면 ${esc(josa(ch.name, '이', '가'))} 나와요 · ${st.settings.easy ? '편하게 모드' : '기운 1'}</p>${ladderHTML(g.chain, 0)}</div></div>`;
    } else {
      const m = infoMsg || { v: D.VILLAGERS.hayun, text: D.TIPS[tipIdx % D.TIPS.length] };
      const s = A.src(m.v.art);
      h = `<div class="info-box"><div class="info-ic face-big">${s ? `<img src="${esc(s)}" alt="" draggable="false" data-ph="${esc(m.v.name[0])}">` : faceHTML(m.v)}</div>
        <div class="info-txt"><b>${esc(m.v.name)}</b><p>${esc(m.text)}</p></div></div>`;
    }
    box.innerHTML = h;
  }

  /* ---------- 움직임 효과 ---------- */
  function floatTag(text, x, y, gold) {
    const el = document.createElement('div');
    el.className = 'float-tag' + (gold ? ' gold' : '');
    el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1350);
  }
  function restartAnim(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); el.addEventListener('animationend', () => el.classList.remove(cls), { once: true }); }

  function afterMerge(r) {
    const el = itEl(r.at);
    restartAnim(el, 'pop');
    const p = center(cellEl(r.at));
    const col = D.CHAINS[r.cell.c].color;
    F.burst(p.x, p.y, [col, '#ffe27a', '#ffffff'], 14 + r.cell.t, 0.9 + r.cell.t * 0.06);
    F.sfx('merge', r.cell.t);
    F.vibrate(14);
    if (r.first) {
      setTimeout(() => { floatTag('새 발견! ' + C.itemName(r.cell), p.x, p.y - p.h * 0.6); F.sfx('discover'); F.burst(p.x, p.y, ['#ffd25a', '#ffffff', col], 18, 1.5); }, 120);
    }
    if (r.max) setTimeout(() => { floatTag('최고 단계!', p.x, p.y - p.h * 1.3, true); F.sfx('maxed'); F.vibrate([10, 30, 10, 30, 30]); }, 380);
  }

  // from → to 적용 (끌기·톡톡 공통)
  function apply(from, to) {
    const r = C.move(st, from, to, now());
    if (r.kind === 'none') return r;
    sel = r.kind === 'swap' ? to : r.at;
    renderBoard();
    if (r.kind === 'merge') afterMerge(r);
    else if (r.kind === 'swap') { F.sfx('swap'); restartAnim(itEl(from), 'born'); }
    else F.sfx('drop');
    renderOrders(); renderInfo(); renderHud();
    changed();
    return r;
  }

  function spawn(i) {
    const g = itEl(i);
    restartAnim(g, 'tap');
    const r = C.tapGen(st, i, now(), rng);
    if (!r.ok) {
      F.sfx('bad'); F.vibrate(30);
      if (r.reason === 'full') toast('자리가 없어요 · 같은 것끼리 합쳐 보세요');
      else if (r.reason === 'energy') openEnergy();
      return;
    }
    renderBoard();
    const el = itEl(r.at);
    const a = center(cellEl(i)), b = center(cellEl(r.at));
    if (el) { el.style.setProperty('--fx', (a.x - b.x) + 'px'); el.style.setProperty('--fy', (a.y - b.y) + 'px'); restartAnim(el, 'born'); }
    F.sfx('spawn'); F.vibrate(8);
    setTimeout(() => F.burst(b.x, b.y, [D.CHAINS[r.cell.c].color, '#ffffff'], 6, 0.55), 300);
    if (r.first) setTimeout(() => { floatTag('새 발견! ' + C.itemName(r.cell), b.x, b.y - b.h * 0.6); F.sfx('discover'); }, 320);
    renderHud(); renderOrders(); renderInfo();
    changed();
  }

  function tap(i) {
    const cell = st.board[i];
    if (!cell) { if (sel >= 0) { sel = -1; tipIdx++; renderBoard(); renderInfo(); } return; }
    if (cell.k === 'gen') { sel = i; renderBoard(); renderInfo(); spawn(i); return; }
    if (sel >= 0 && sel !== i && C.canMerge(st.board[sel], cell)) { glide(sel, i); return; }
    if (sel === i) { sel = -1; tipIdx++; } else { sel = i; F.sfx('pick'); }
    renderBoard(); renderInfo();
  }

  /* ---------- 끌기 ---------- */
  const ghost = $('ghost');
  function ghostAt(x, y, scale) { ghost.style.transform = `translate(${x - ghost.offsetWidth / 2}px, ${y - ghost.offsetHeight / 2}px) scale(${scale})`; }
  function ghostShow(i) {
    const it = itEl(i);
    ghost.innerHTML = it ? it.innerHTML.replace(/<i class="tier">.*?<\/i>/, '').replace(/<span class="gcost">.*?<\/span>/, '') : '';
    ghost.className = '';
    it && it.classList.add('lifted');
  }
  function ghostHide() { ghost.className = 'hide'; ghost.innerHTML = ''; Array.prototype.forEach.call(document.querySelectorAll('.it.lifted'), (e) => e.classList.remove('lifted')); }
  function indexAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest && el.closest('.cell');
    if (c && c.parentElement === $('board')) return Number(c.dataset.i);
    // 칸 사이 틈·판 가장자리 조금 밖도 가장 가까운 칸으로 착
    const r = $('board').getBoundingClientRect();
    if (x < r.left - 24 || x > r.right + 24 || y < r.top - 24 || y > r.bottom + 24) return -1;
    let best = -1, bd = Infinity;
    for (let i = 0; i < C.N; i++) { const p = center(cellEl(i)); const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function setOver(i) {
    if (drag.over === i) return;
    if (drag.over >= 0) cellEl(drag.over).classList.remove('over', 'can');
    drag.over = i;
    if (i >= 0 && i !== drag.i) {
      const c = cellEl(i);
      c.classList.add('over');
      if (C.canMerge(st.board[drag.i], st.board[i])) { c.classList.add('can'); F.vibrate(5); }
    }
  }
  // 톡톡 합치기: 고른 물건이 미끄러져 가서 합쳐져요
  function glide(from, to) {
    busy = true;
    ghostShow(from);
    const a = center(cellEl(from)), b = center(cellEl(to));
    ghostAt(a.x, a.y, 1);
    void ghost.offsetWidth;
    ghost.className = 'snap';
    ghostAt(b.x, b.y, 1.05);
    setTimeout(() => { ghostHide(); busy = false; apply(from, to); }, 130);
  }

  const board = $('board');
  board.addEventListener('pointerdown', (e) => {
    F.unlock();
    lastAct = now(); clearHint();
    if (busy || drag) return;
    const c = e.target.closest('.cell');
    if (!c) return;
    const i = Number(c.dataset.i);
    if (!st.board[i]) { tap(i); return; }
    drag = { i, x0: e.clientX, y0: e.clientY, on: false, id: e.pointerId, over: -1 };
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  });
  board.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.on && dx * dx + dy * dy > 64) {
      drag.on = true;
      sel = drag.i; renderBoard(); renderInfo();
      ghostShow(drag.i);
      F.sfx('pick'); F.vibrate(6);
    }
    if (drag.on) {
      const lift = ghost.offsetHeight * 0.35;
      ghostAt(e.clientX, e.clientY - lift, 1.18);
      setOver(indexAt(e.clientX, e.clientY - lift * 0.5));
    }
  });
  function endDrag(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.on) { if (!cancel) tap(d.i); return; }
    if (d.over >= 0) cellEl(d.over).classList.remove('over', 'can');
    const lift = ghost.offsetHeight * 0.35;
    const to = cancel ? -1 : indexAt(e.clientX, e.clientY - lift * 0.5);
    const target = to >= 0 && to !== d.i ? to : d.i;
    const p = center(cellEl(target));
    ghost.className = to >= 0 && to !== d.i ? 'snap' : 'back';
    ghostAt(p.x, p.y, 1);
    busy = true;
    setTimeout(() => {
      ghostHide(); busy = false;
      if (target !== d.i) apply(d.i, target);
      else { F.sfx('drop'); renderBoard(); }
    }, target !== d.i ? 120 : 200);
  }
  board.addEventListener('pointerup', (e) => endDrag(e, false));
  board.addEventListener('pointercancel', (e) => endDrag(e, true));
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- 주문 카드 조작 ---------- */
  $('orders').addEventListener('click', (e) => {
    F.unlock(); lastAct = now(); clearHint();
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.go) { deliver(b.dataset.go); return; }
    if (b.dataset.hl) {
      const [oid, k] = b.dataset.hl.split(':');
      const o = st.orders.find((x) => x.id === oid);
      if (o) { F.sfx('pick'); sel = -1; renderBoard(); showNeed(o, Number(k)); }
      return;
    }
    if (b.dataset.face) {
      const o = st.orders.find((x) => x.id === b.dataset.face);
      if (!o) return;
      const v = D.VILLAGERS[o.who] || D.VILLAGERS.hayun;
      const want = o.need.map((n) => `${C.itemName({ k: 'item', c: n.c, t: n.t })}(${n.t}단계)`).join(', ');
      F.sfx('pick'); sel = -1; renderBoard();
      say(v, `${v.lines[o.line % 2] || ''} — ${want}`);
      return;
    }
    if (b.dataset.skip) {
      const r = C.skipOrder(st, b.dataset.skip, now(), rng);
      if (!r.ok) { F.sfx('bad'); toast(r.reason === 'cool' ? `다른 부탁은 ${mmss(r.waitMs)} 뒤에 바꿀 수 있어요` : '이미 끝난 부탁이에요'); return; }
      const card = $('orders').querySelector(`.oc[data-o="${r.old.id}"]`);
      F.sfx('swap');
      if (card) { card.classList.add('out'); setTimeout(() => { card.remove(); renderOrders(); }, 300); } else renderOrders();
      changed();
    }
  });

  /* ---------- 알림 · 시트 ---------- */
  let toastT = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
  }
  function openSheet(html, onClick) {
    const sh = $('sheet');
    sh.innerHTML = `<div class="sheet-box" role="dialog">${html}</div>`;
    sh.classList.remove('hide');
    F.sfx('open');
    sh.onclick = (e) => {
      if (e.target === sh || e.target.closest('[data-close]')) { closeSheet(); return; }
      const b = e.target.closest('button');
      if (b && onClick) onClick(b);
    };
  }
  function closeSheet() { $('sheet').classList.add('hide'); $('sheet').innerHTML = ''; F.sfx('close'); }

  function energyHTML() {
    const e = C.energyInfo(st, now());
    const p = C.refillPrice(st, now());
    const can = p.left > 0 && !e.full && st.coins >= p.price;
    const label = p.left <= 0 ? '오늘은 다 채웠어요 (내일 다시)' : e.full ? '기운이 가득해요' : `동전 ${p.price}개로 가득 채우기 · 오늘 ${p.left}번 남음`;
    return `<h2>기운</h2><div class="big-num">${artImg('energy', '')}<span>${e.easy ? '∞' : e.energy + ' / ' + e.max}</span></div>
      <p class="center muted">${e.easy ? '편하게 모드: 기운 없이 계속 뽑을 수 있어요' : e.full ? '가득 찼어요!' : `2분에 1씩 저절로 차요 · 다음 1까지 ${mmss(e.nextMs)}`}</p>
      <button type="button" class="btn main" data-refill="1" ${can ? '' : 'disabled'}>${label}</button>
      <p class="center muted">설정에서 <b>편하게 모드</b>를 켜면 기운이 안 들어요</p>
      <button type="button" class="btn" data-close="1">닫기</button>`;
  }
  function openEnergy() {
    openSheet(energyHTML(), (b) => {
      if (!b.dataset.refill) return;
      const r = C.refill(st, now());
      if (!r.ok) { F.sfx('bad'); toast(r.reason === 'coins' ? '동전이 모자라요' : r.reason === 'limit' ? '오늘은 다 채웠어요' : '기운이 가득해요'); return; }
      F.sfx('deliver'); F.vibrate(20);
      renderHud(); bump('hud-energy'); changed();
      closeSheet();
      toast('기운이 가득 찼어요!');
    });
  }
  $('hud-energy').addEventListener('click', () => { F.unlock(); openEnergy(); });
  $('hud-star').addEventListener('click', () => { F.unlock(); F.sfx('pick'); say(D.VILLAGERS.hayun, `별 ${st.stars}개! 별은 바다별채를 고치는 데 써요. (마을 고치기는 곧 열려요)`); });
  $('hud-coin').addEventListener('click', () => { F.unlock(); F.sfx('pick'); say(D.VILLAGERS.hayun, `동전 ${st.coins}개. 기운을 채울 때 쓸 수 있어요.`); });

  function settingsHTML(confirmReset) {
    const tg = (k, label, sub) => `<div class="row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><button type="button" class="tg${st.settings[k] ? ' on' : ''}" data-tg="${k}" aria-pressed="${!!st.settings[k]}" aria-label="${label}"></button></div>`;
    return `<h2>설정</h2>
      ${tg('sfx', '효과음')}
      ${F.canVibrate() ? tg('vib', '진동') : ''}
      ${tg('easy', '편하게 모드', '기운 없이 계속 뽑기')}
      ${tg('nums', '단계 숫자 보기')}
      ${tg('hint', '힌트', '가만히 있으면 합칠 짝이 살랑')}
      <p class="muted center">기록은 이 폰에 저장돼요 · 부탁 ${st.stats.delivered}번 · 합치기 ${st.stats.merges}번</p>
      <button type="button" class="btn warn" data-reset="1">${confirmReset ? '정말 처음부터 할까요? 한 번 더 누르면 지워져요' : '처음부터 하기'}</button>
      <button type="button" class="btn" data-close="1">닫기</button>`;
  }
  function openSettings() {
    let armed = false;
    const re = () => { $('sheet').querySelector('.sheet-box').innerHTML = settingsHTML(armed); };
    openSheet(settingsHTML(false), (b) => {
      if (b.dataset.tg) {
        const k = b.dataset.tg;
        st.settings[k] = !st.settings[k];
        syncFx();
        F.sfx('pick'); if (k === 'vib') F.vibrate(20);
        re(); renderAll(); changed();
      } else if (b.dataset.reset) {
        if (!armed) { armed = true; F.sfx('bad'); re(); return; }
        st = C.newState(now(), rng);
        sel = -1; wasReady = {}; shown.hold = 0;
        $('orders').innerHTML = '';
        saver.dirty = true; saver.flush();
        closeSheet(); renderAll();
        toast('새로 시작해요!');
        playIntro();
      }
    });
  }
  $('btn-set').addEventListener('click', () => { F.unlock(); openSettings(); });
  function syncFx() { F.opt.sfx = !!st.settings.sfx; F.opt.vib = !!st.settings.vib; }

  /* ---------- 이야기 대사창 (톡해서 넘김) ---------- */
  function talk(lines, done) {
    const box = $('talk');
    let k = 0;
    const show = () => {
      const l = lines[k];
      const v = D.VILLAGERS[l.who] || D.VILLAGERS.hayun;
      const s = A.src(v.art);
      box.innerHTML = `<div class="talk-box"><div class="talk-face">${s ? `<img src="${esc(s)}" alt="" draggable="false">` : ''}</div>
        <div class="talk-name">${esc(v.name)}</div><div class="talk-txt">${esc(l.text)}</div><div class="talk-next">톡 ▶</div></div>`;
    };
    show();
    box.classList.remove('hide');
    box.onclick = () => {
      F.unlock(); F.sfx('pick');
      k++;
      if (k < lines.length) show();
      else { box.classList.add('hide'); box.innerHTML = ''; box.onclick = null; if (done) done(); }
    };
  }
  function playIntro() {
    talk(D.STORY.intro, () => {
      st.seen.intro = true; changed();
      const g = st.board.findIndex((c) => c && c.k === 'gen');
      if (g >= 0) flash([g]);
    });
  }

  /* ---------- 힌트 (가만히 10초) ---------- */
  function clearHint() {
    if (!hintOn) return;
    hintOn = false;
    Array.prototype.forEach.call(document.querySelectorAll('.it.hint'), (e) => e.classList.remove('hint'));
  }
  function tick() {
    renderHud();
    if (st.settings.hint && !hintOn && !drag && !busy && now() - lastAct > 10000 && $('sheet').classList.contains('hide') && $('talk').classList.contains('hide')) {
      const p = C.findPair(st);
      if (p) { hintOn = true; p.forEach((i) => restartAnim(itEl(i), 'hint')); setTimeout(() => { hintOn = false; lastAct = now(); }, 1600); }
    }
  }

  /* ---------- 나가기 · 저장 ---------- */
  $('exit').addEventListener('click', () => {
    saver.dirty = true; saver.flush();
    try {
      if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { history.back(); return; }
    } catch (e) { /* 무시 */ }
    location.href = A.root + '../';
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saver.flush(); else { renderHud(); } });
  addEventListener('pagehide', () => saver.flush());
  addEventListener('resize', () => layout());

  function renderAll() { renderHud(); renderOrders(); renderBoard(); renderInfo(); }

  /* ---------- 시작 ---------- */
  function start() {
    syncFx();
    const bg = A.src(D.AREAS[Math.min(st.area || 0, D.AREAS.length - 1)].bg);
    if (bg) $('bg').src = bg; else $('bg').remove();
    document.querySelectorAll('img[data-art]').forEach((im) => { im.src = A.src(im.dataset.art); });
    buildBoard();
    renderAll();
    layout();
    F.attach($('fx'));
    A.preload();
    setInterval(tick, 1000);
    if (!st.seen.intro) setTimeout(playIntro, 300);
    saver.schedule();
  }
  start();

  // 시험용 손잡이 (브라우저 콘솔 · 자동 시험)
  window.MergeUI = { get state() { return st; }, renderAll, apply, tap, deliver, layout };
})();
