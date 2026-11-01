/* 머지관 · 「소라섬 등불 이야기」 화면 · 조작
   - 판(7×9): 끌어서 놓기(가까운 칸에 착 붙음) + 톡-톡 합치기 · 발생기 톡 → 옆 빈칸에 물건이 튀어나와요
   - 주문 카드: 얼굴 · 원하는 물건(있으면 초록 체크) · 보상 · [건네기] · ↻ 다른 부탁
   - 규칙은 전부 MergeCore(core.js) 에 맡기고, 여기는 그리기·움직임·소리만 해요
   - 2단계: 모래더미 칸 · 아래 [마을]/[가방] 버튼 · 이야기 대사창(talk) · 서버 저장 동기화
   - 3단계(일부): 가방(끌어 넣기)·선물함·소라별 가게 · 팔기(5초 되돌리기) · 되돌리기 ↶ · 보조 물건 쓰기 · 충전식 발생기
   - 4~6단계: 얼굴 그림(기본·기쁨) · 건네기 반응(기쁨 얼굴 통통 + 하트 + 고맙다는 말풍선) · 이야기 부탁(금색) · 이벤트 부탁
     · ☰ 메뉴(매일 출석·오늘의 부탁·도감·주간 이벤트·편지와 앨범·설정) · 발생기 강화 · 배경음·소리 크기·글씨·움직임 줄이기 · 오프라인
   - 마을 화면(전/후 배경·복원 작업)은 town.js 가 window.MergeUI 손잡이로 이 화면을 같이 써요 */
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
  const freshLocal = !S.hasSave(store);
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
  let undoSnap = null, undoT = 0;   // 되돌리기 (마지막 행동 1번)

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
  // 얼굴 그림: face = 'joy' | 'wow' (없으면 기본) · 기본도 없으면 색 동그라미 + 첫 글자
  function faceSrc(v, face) {
    const id = face && v.faces && v.faces[face];
    return (id && A.src(id)) || A.src(v.art) || '';
  }
  function faceHTML(v, face) {
    const s = faceSrc(v, face);
    return `<span class="face" style="--fc:${esc(v.color)}">${s ? `<img src="${esc(s)}" alt="${esc(v.name)}" draggable="false" data-ph="${esc(v.name[0])}">` : esc(v.name[0])}</span>`;
  }
  function cellKey(cell) {
    if (!cell) return '';
    if (cell.k === 'item') return cell.c + cell.t;
    if (cell.k === 'gen') { const ch = C.chargeInfo(st, cell.g, now()); return cell.g + 'L' + C.genLevel(st, cell.g) + (ch ? (ch.restMs ? 'r' + Math.ceil(ch.restMs / 1000) : 'n' + ch.left) : ''); }
    return cell.k;
  }
  function sandHTML(n) { return `<div class="sand s${n}">${artImg('sand', '모래')}</div>`; }
  function cellHTML(cell) {
    if (!cell) return '';
    if (cell.k === 'gen') {
      const g = D.GENS[cell.g];
      const ch = C.chargeInfo(st, cell.g, now());
      let cost = st.settings.easy ? '' : `<span class="gcost">${artImg('energy', '')}1</span>`;
      if (ch) cost += ch.restMs ? `<span class="gcharge rest">${mmss(ch.restMs)}</span>` : `<span class="gcharge">${ch.left}</span>`;
      const lv = C.genLevel(st, cell.g);
      if (lv) cost += `<span class="glv">${'★'.repeat(lv)}</span>`;
      return `<div class="it gen c-${g.chain}${ch && ch.restMs ? ' resting' : ''}${g.event ? ' evgen' : ''}">${artImg(cell.g, g.name)}${cost}</div>`;
    }
    if (cell.k === 'wild') return `<div class="it wild">${artImg('wild', '무지개 소라')}</div>`;
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
      const cv = st.cover[i] | 0;
      const k = cv ? 'sand' + cv : cellKey(st.board[i]) + (st.board[i] && st.board[i].k === 'gen' && st.settings.easy ? '~' : '');
      if (el.dataset.k !== k) { el.innerHTML = cv ? sandHTML(cv) : cellHTML(st.board[i]); el.dataset.k = k; el.classList.toggle('covered', !!cv); }
      const it = el.firstElementChild;
      if (it) it.classList.toggle('sel', i === sel);
    }
    document.body.classList.toggle('nonums', !st.settings.nums);
  }

  function layout() {
    const vw = Math.min(innerWidth, 560);
    const gap = 3;
    const W = vw - 16 - 20;
    const used = $('hud').offsetHeight + $('orders').offsetHeight + $('foot').offsetHeight;
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
    renderNav();
  }
  function renderNav() {
    const a = C.areaInfo(st);
    $('town-badge').classList.toggle('hide', !a.canAfford);
    $('btn-town').classList.toggle('ready', a.canAfford);
    const used = st.bag.filter(Boolean).length;
    $('bag-n').textContent = `가방 ${used}/${st.bag.length}`;
    const gb = $('bag-badge');
    gb.classList.toggle('hide', !st.gifts.length);
    gb.textContent = st.gifts.length ? String(st.gifts.length) : '';
  }
  function bump(id) { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  /* ---------- 주문 카드 ---------- */
  let wasReady = {};
  function orderCardHTML(o) {
    const v = D.VILLAGERS[o.who] || D.VILLAGERS.hayun;
    const evd = o.ev ? D.EVENTS.find((e) => e.id === o.ev) : null;
    const need = o.need.map((n, k) => {
      const cell = { k: 'item', c: n.c, t: n.t };
      const nm = C.itemName(cell);
      return `<button type="button" class="oc-item c-${n.c}" data-hl="${o.id}:${k}" aria-label="${esc(nm)} ${n.t}단계">${artImg(C.itemId(cell), nm)}<i class="tier">${n.t}</i><b class="ok">✓</b></button>`;
    }).join('');
    const tag = o.story ? '<span class="oc-tag story">이야기</span>' : evd ? `<span class="oc-tag ev">${esc(evd.name.replace(/ 주간$/, ''))}</span>` : '';
    const rew = o.ev ? `<span>${artImg('coin', '동전')}${o.coins}</span><span class="oc-pts">+${o.pts}점</span>`
      : `<span>${artImg('coin', '동전')}${o.coins}</span><span>${STAR}${o.stars}</span>`;
    return `<button type="button" class="oc-face" data-face="${o.id}">${faceHTML(v)}<span class="oc-name">${esc(v.name)}</span></button>
      ${o.story ? '' : `<button type="button" class="oc-skip" data-skip="${o.id}" aria-label="다른 부탁으로 바꾸기">↻</button>`}${tag}
      <div class="oc-need${o.need.length > 1 ? ' many' : ''}">${need}</div>
      <div class="oc-rew">${rew}${o.bonus ? `<span class="oc-bonus" title="덤: ${esc(C.itemName(o.bonus))}">+${artImg(o.bonus.k === 'wild' ? 'wild' : C.itemId(o.bonus), C.itemName(o.bonus))}</span>` : ''}</div>
      <button type="button" class="oc-go" data-go="${o.id}">건네기</button>`;
  }
  function renderOrders() {
    const box = $('orders');
    const keep = {};
    st.orders.forEach((o, idx) => {
      let el = box.querySelector(`.oc[data-o="${o.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'oc in' + (o.story ? ' story' : '') + (o.ev ? ' evo' : ''); el.dataset.o = o.id;
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
      const slot = card.querySelectorAll('.oc-item')[k] || card;
      if (ci < 0) {   // 가방에서 꺼내 건네요
        const n = o.need[k];
        F.fly(artImg(n.c + n.t, ''), center($('btn-bag')), center(slot), { ms: 420, s1: 0.7, size: 40 });
        return;
      }
      const it = itEl(ci);
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
      const thx = C.thanksLine(st, r.order.who);
      react(card, v, thx);
      const rewTxt = r.order.ev ? `동전 ${r.coins} · 이벤트 +${r.order.pts}점` : `동전 ${r.coins} · 별 ${r.stars}`;
      say(v, `${thx}  (${rewTxt}${r.bonus ? ' · 덤 ' + C.itemName(r.bonus.cell) : ''})`, 'joy');
      (r.evRewards || []).forEach((g, k) => setTimeout(() => {
        floatTag(g.deco ? '이벤트 장식을 받았어요!' : '이벤트 보상! ' + (g.reward.k === 'wild' ? '무지개 소라' : C.itemName(g.reward)), from.x, from.y + 40, true);
        F.sfx('discover');
        if (g.at >= 0) { renderBoard(); restartAnim(itEl(g.at), 'pop'); }
      }, 700 + k * 450));
      if (r.story && D.STORY[r.story]) setTimeout(() => talk(D.STORY[r.story], () => { renderAll(); if (window.MergeTown) window.MergeTown.resume(); }), 1500);
      clearUndo();
      renderBoard(); renderOrders(); renderInfo(); renderNav();
      if (r.bonus) {
        if (r.bonus.at >= 0) {
          const el = itEl(r.bonus.at), b = center(cellEl(r.bonus.at));
          if (el) { el.style.setProperty('--fx', (from.x - b.x) + 'px'); el.style.setProperty('--fy', (from.y - b.y) + 'px'); restartAnim(el, 'born'); }
          setTimeout(() => floatTag('덤! ' + C.itemName(r.bonus.cell), b.x, b.y - b.h * 0.6, true), 300);
        } else toast('덤은 자리가 없어서 가방의 선물함에 넣었어요');
      }
      if (r.story) setTimeout(() => toast('이야기 부탁 완료! [마을]에서 다음 작업을 할 수 있어요'), 1200);
      if (C.areaInfo(st).canAfford && !st.seen.townTip) {
        st.seen.townTip = true;
        setTimeout(() => say(D.VILLAGERS.hayun, '별이 모였어요! 아래 [마을]을 눌러 바다별채를 고쳐 봐요.'), 900);
      }
      changed();
    }, 400);
  }
  function renderHudCounts() { $('coins').textContent = shown.coins; $('stars').textContent = shown.stars; }

  // 건네기 반응: 부탁한 사람이 기쁜 얼굴로 통통 + 하트·반짝이 + 짧은 고맙다는 말풍선 (약 1.6초 · 조작은 막지 않아요)
  function react(card, v, line) {
    const r = card.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'thx';
    el.style.setProperty('--fc', v.color);
    el.innerHTML = `<div class="thx-face">${faceHTML(v, 'joy')}</div><div class="thx-bub">${esc(line)}</div>`;
    const x = Math.max(70, Math.min(innerWidth - 70, r.left + r.width / 2));
    el.style.left = x + 'px'; el.style.top = (r.top + 6) + 'px';
    document.body.appendChild(el);
    // 카드 얼굴도 기쁜 얼굴로
    const fi = card.querySelector('.oc-face .face'); const js = faceSrc(v, 'joy');
    if (fi && js) fi.innerHTML = `<img src="${esc(js)}" alt="" draggable="false">`;
    F.sfx('thanks');
    setTimeout(() => F.hearts(x, r.top + 34, 10), 120);
    setTimeout(() => el.classList.add('bye'), 1350);
    setTimeout(() => el.remove(), 1700);
  }

  // 주문 카드의 물건 톡 → 판에서 찾아 반짝 · 없으면 만드는 법
  function showNeed(o, k) {
    const n = o.need[k];
    const cell = { k: 'item', c: n.c, t: n.t };
    const nm = C.itemName(cell);
    const hits = [];
    st.board.forEach((c, i) => { if (c && c.k === 'item' && c.c === n.c && c.t === n.t) hits.push(i); });
    if (hits.length) { flash(hits); say(D.VILLAGERS.hayun, `${josa(nm, '은', '는')} 여기 있어요! 끌어서 놓을 필요 없이 [건네기]만 누르면 돼요.`); return; }
    if (st.bag.some((c) => c && c.k === 'item' && c.c === n.c && c.t === n.t)) { restartAnim($('btn-bag'), 'wig1'); say(D.VILLAGERS.hayun, `${josa(nm, '은', '는')} 가방에 있어요! [건네기]를 누르면 가방에서 꺼내 줘요.`); return; }
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
  function say(v, text, face) { infoMsg = { v, text, face }; renderInfo(); }
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
      const aux = D.CHAINS[cell.c].aux;
      const next = cell.t < mx ? C.itemName({ k: 'item', c: cell.c, t: cell.t + 1 }) : '';
      let nextTxt = next ? (st.found[cell.c + (cell.t + 1)] ? `2개 → ${next}` : '2개를 합치면 → ???') : '최고 단계예요! 반짝반짝';
      if (aux) nextTxt = auxText(aux, cell.t) + (next ? ` · 2개 → ${next}` : '');
      h = `<div class="info-box c-${cell.c}"><div class="info-ic">${artImg(C.itemId(cell), nm)}</div>
        <div class="info-txt"><b>${esc(nm)}<em>${cell.t} / ${mx}단계</em></b><p>${esc(D.CHAINS[cell.c].name)} · ${esc(nextTxt)}</p>${ladderHTML(cell.c, cell.t)}</div>
        ${actsHTML(cell)}</div>`;
    } else if (cell && cell.k === 'wild') {
      infoMsg = null;
      h = `<div class="info-box"><div class="info-ic">${artImg('wild', '무지개 소라')}</div>
        <div class="info-txt"><b>무지개 소라<em>만능</em></b><p>아무 물건에 겹치면 그 물건이 한 단계 올라가요!</p></div>${actsHTML(cell)}</div>`;
    } else if (cell && cell.k === 'gen') {
      infoMsg = null;
      const g = D.GENS[cell.g];
      const ch = D.CHAINS[g.chain];
      const u = C.genUpInfo(st, cell.g);
      const odds = u ? ` · 2단계 ${Math.round(u.tier2 * 100)}%${u.tier3 ? ` · 3단계 ${Math.round(u.tier3 * 100)}%` : ''}` : ' · 이벤트 발생기';
      const up = u ? `<div class="info-acts"><button type="button" class="act up" data-act="up" ${u.price ? '' : 'disabled'}>${u.price ? `강화 ${artImg('coin', '')}${u.price}` : '강화 끝'}</button><small class="lv">${'★'.repeat(u.lv)}${'☆'.repeat(u.max - u.lv)}</small></div>` : '';
      h = `<div class="info-box c-${g.chain}"><div class="info-ic">${artImg(cell.g, g.name)}</div>
        <div class="info-txt"><b>${esc(g.name)}<em>발생기</em></b><p class="one">톡 → ${esc(ch.name)} · ${st.settings.easy ? '편하게' : '기운 1'}${odds}</p>${ladderHTML(g.chain, 0)}</div>${up}</div>`;
    } else {
      const m = infoMsg || { v: D.VILLAGERS.hayun, text: D.TIPS[tipIdx % D.TIPS.length] };
      const s = faceSrc(m.v, m.face);
      h = `<div class="info-box"><div class="info-ic face-big" style="--fc:${esc(m.v.color)}">${s ? `<img src="${esc(s)}" alt="${esc(m.v.name)}" draggable="false" data-ph="${esc(m.v.name[0])}">` : faceHTML(m.v)}</div>
        <div class="info-txt"><b>${esc(m.v.name)}</b><p>${esc(m.text)}</p></div></div>`;
    }
    box.innerHTML = h;
  }
  function auxText(aux, t) {
    const a = aux.amount[t - 1];
    return aux.kind === 'energy' ? `마시면 기운 +${a}` : aux.kind === 'coins' ? `쓰면 동전 +${a}` : aux.kind === 'gems' ? `모으면 소라별 +${a}` : `열면 물건 ${a}개`;
  }
  function actsHTML(cell) {
    const aux = cell.k === 'item' && D.CHAINS[cell.c].aux;
    return `<div class="info-acts">
      ${aux ? `<button type="button" class="act use" data-act="use">${esc(aux.verb)}</button>` : ''}
      <button type="button" class="act" data-act="bag">가방에</button>
      <button type="button" class="act sell" data-act="sell">팔기 ${artImg('coin', '')}${C.sellValue(cell)}</button></div>`;
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
    (r.peeled || []).forEach((pe, k) => setTimeout(() => {
      const q = center(cellEl(pe.i));
      restartAnim(cellEl(pe.i).firstElementChild, 'pop');
      F.burst(q.x, q.y, ['#e8cfa0', '#f6e3bd', '#ffffff'], 10, 0.8);
      F.sfx(pe.left ? 'drop' : 'open');
      if (!pe.left) floatTag('칸이 열렸어요!', q.x, q.y - q.h * 0.5);
    }, 160 + k * 90));
  }

  // from → to 적용 (끌기·톡톡 공통)
  function apply(from, to) {
    const snap = C.snapshot(st);
    const r = C.move(st, from, to, now());
    if (r.kind === 'none') { if (r.reason === 'covered') { F.sfx('bad'); toast('모래더미예요 · 옆에서 합치면 벗겨져요'); renderBoard(); } return r; }
    setUndo(snap);
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
      if (r.reason === 'full') toast('자리가 없어요 · 합치거나 가방에 넣어 보세요');
      else if (r.reason === 'rest') toast(`${josa(D.GENS[st.board[i].g].name, '은', '는')} 쉬는 중 · ${mmss(r.waitMs)} 뒤에 다시`);
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
    clearUndo();
    renderHud(); renderOrders(); renderInfo();
    changed();
  }

  function tap(i) {
    if (st.cover[i] > 0) {
      restartAnim(cellEl(i).firstElementChild, 'wig1'); F.sfx('bad');
      say(D.VILLAGERS.hayun, `모래더미예요 (${st.cover[i]}겹). 바로 옆 칸에서 합치기를 하면 한 겹씩 벗겨져요.`);
      return;
    }
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
    const overBag = !cancel && (() => { const el = document.elementFromPoint(e.clientX, e.clientY - lift * 0.5); return !!(el && el.closest && el.closest('#btn-bag')); })();
    if (overBag && st.board[d.i] && st.board[d.i].k !== 'gen') {
      const b = center($('btn-bag'));
      ghost.className = 'snap'; ghostAt(b.x, b.y, 0.5);
      busy = true;
      setTimeout(() => { ghostHide(); busy = false; putInBag(d.i); }, 130);
      return;
    }
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

  /* ---------- 정보 칸 버튼: 쓰기 · 가방에 · 팔기 ---------- */
  $('info').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || sel < 0 || busy) return;
    F.unlock(); lastAct = now();
    const i = sel;
    if (b.dataset.act === 'up') { upgradeAt(i); return; }
    if (b.dataset.act === 'use') useAt(i);
    else if (b.dataset.act === 'bag') putInBag(i);
    else if (b.dataset.act === 'sell') sellAt(i, false);
  });
  function upgradeAt(i) {
    const cell = st.board[i];
    if (!cell || cell.k !== 'gen') return;
    const r = C.upgradeGen(st, cell.g, now());
    if (!r.ok) { F.sfx('bad'); toast(r.reason === 'coins' ? `동전이 ${r.price - st.coins}개 모자라요` : '더는 강화할 수 없어요'); return; }
    const p = center(cellEl(i));
    F.sfx('maxed'); F.vibrate([12, 30, 12]);
    F.burst(p.x, p.y, ['#ffd25a', '#ffffff', D.CHAINS[D.GENS[cell.g].chain].color], 22, 1.3);
    floatTag(`강화 ${'★'.repeat(r.lv)} · 2단계 ${Math.round(r.info.tier2 * 100)}%`, p.x, p.y - p.h * 0.6, true);
    renderAll(); bump('hud-coin'); changed();
  }
  function useAt(i) {
    const cell = st.board[i];
    const p = center(cellEl(i));
    const r = C.useItem(st, i, now(), rng);
    if (!r.ok) { F.sfx('bad'); return; }
    clearUndo(); sel = -1;
    F.vibrate(16);
    if (r.kind === 'gift') {
      F.sfx('discover');
      renderBoard();
      r.placed.forEach((pl, k) => {
        if (pl.at < 0) return;
        const el = itEl(pl.at), b = center(cellEl(pl.at));
        if (el) { el.style.setProperty('--fx', (p.x - b.x) + 'px'); el.style.setProperty('--fy', (p.y - b.y) + 'px'); el.style.animationDelay = (k * 60) + 'ms'; restartAnim(el, 'born'); }
      });
      F.burst(p.x, p.y, ['#e46f8c', '#ffd25a', '#ffffff'], 24, 1.3);
      if (r.placed.some((x) => x.at < 0)) toast('자리가 모자라서 일부는 가방의 선물함에 넣었어요');
    } else {
      F.sfx('deliver');
      F.burst(p.x, p.y, ['#ffd25a', '#ffffff', D.CHAINS[cell.c].color], 18, 1.1);
      const target = r.kind === 'energy' ? 'hud-energy' : r.kind === 'coins' ? 'hud-coin' : null;
      if (target) { F.fly(artImg(r.kind === 'energy' ? 'energy' : 'coin', ''), p, center($(target)), { count: 3, ms: 560, size: 26, onEach: (k) => { if (k === 2) bump(target); } }); }
      floatTag(r.kind === 'energy' ? `기운 +${r.amount}` : r.kind === 'coins' ? `동전 +${r.amount}` : `소라별 +${r.amount}`, p.x, p.y - p.h * 0.6, true);
    }
    renderAll(); changed();
  }
  function putInBag(i) {
    const snap = C.snapshot(st);
    const cell = st.board[i];
    if (cell && cell.k === 'gen') { F.sfx('bad'); toast('발생기는 판에 두어요'); return; }
    const p = center(cellEl(i));
    const r = C.toBag(st, i, now());
    if (!r.ok) { F.sfx('bad'); toast(r.reason === 'full' ? '가방이 가득 찼어요 · 가방에서 칸을 늘릴 수 있어요' : ''); return; }
    setUndo(snap);
    sel = -1;
    F.fly(artImg(cell.k === 'wild' ? 'wild' : C.itemId(cell), ''), p, center($('btn-bag')), { ms: 420, size: p.w, s1: 0.4, onEach: () => restartAnim($('btn-bag'), 'bump') });
    F.sfx('drop');
    renderAll(); changed();
  }
  function sellAt(i, sure) {
    const cell = st.board[i];
    if (!cell || cell.k === 'gen') return;
    if (!sure && C.sellAsk(cell)) {
      openSheet(`<h2>정말 팔까요?</h2><div class="big-num">${artImg(cell.k === 'wild' ? 'wild' : C.itemId(cell), '')}</div>
        <p class="center">${esc(C.itemName(cell))} → 동전 ${C.sellValue(cell)}개<br><small class="muted">${cell.k === 'wild' ? '무지개 소라는 아무 물건이나 올려 줘요' : '최고 단계 물건이에요'}</small></p>
        <button type="button" class="btn warn" data-sure="1">팔기</button><button type="button" class="btn" data-close="1">그만두기</button>`,
      (b) => { if (b.dataset.sure) { closeSheet(); sellAt(i, true); } });
      return;
    }
    const snap = C.snapshot(st);
    const p = center(cellEl(i));
    const r = C.sell(st, i, now());
    if (!r.ok) return;
    setUndo(snap, `${C.itemName(r.cell)} 팔았어요 (+${r.coins})`);
    sel = -1;
    F.sfx('coin');
    F.fly(artImg('coin', ''), p, center($('hud-coin')), { count: Math.min(4, Math.max(1, Math.ceil(r.coins / 8))), ms: 520, size: 26, onEach: () => bump('hud-coin') });
    renderAll(); changed();
  }
  // 되돌리기: 옮기기·합치기·팔기·가방 넣기 뒤 (뽑기·건네기·고치기를 하면 사라져요)
  function setUndo(snap, msg) {
    undoSnap = snap;
    $('btn-undo').classList.remove('hide');
    clearTimeout(undoT);
    undoT = setTimeout(clearUndo, 15000);
    if (msg) toast(msg, '되돌리기', doUndo);
  }
  function clearUndo() { undoSnap = null; clearTimeout(undoT); $('btn-undo').classList.add('hide'); }
  function doUndo() {
    if (!undoSnap || busy) return;
    C.restore(st, undoSnap);
    clearUndo();
    sel = -1;
    F.sfx('swap');
    toast('되돌렸어요');
    renderAll(); changed();
  }
  $('btn-undo').addEventListener('click', () => { F.unlock(); doUndo(); });

  /* ---------- 알림 · 시트 ---------- */
  let toastT = 0;
  function toast(msg, btn, onBtn) {
    if (!msg) return;
    const t = $('toast');
    t.innerHTML = esc(msg) + (btn ? ` <button type="button" class="toast-b">${esc(btn)}</button>` : '');
    t.classList.toggle('has-b', !!btn);
    t.onclick = btn ? (e) => { if (e.target.closest('.toast-b')) { t.classList.remove('on'); onBtn(); } } : null;
    t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), btn ? 5000 : 2200);
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
  $('hud-star').addEventListener('click', () => { F.unlock(); openTown(); });
  $('btn-town').addEventListener('click', () => { F.unlock(); openTown(); });
  function openTown() { if (window.MergeTown) window.MergeTown.open(); }
  $('hud-coin').addEventListener('click', () => { F.unlock(); F.sfx('pick'); say(D.VILLAGERS.hayun, `동전 ${st.coins}개 · 소라별 ${st.gems}개. 동전은 기운 채우기·가방 늘리기, 소라별은 가방 속 가게에서 써요.`); });

  /* ---------- 가방 · 선물함 · 소라별 가게 ---------- */
  function bagHTML() {
    const slot = (c, k, kind) => {
      if (!c) return `<button type="button" class="bslot empty" disabled aria-label="빈 칸"></button>`;
      const id = c.k === 'gen' ? c.g : c.k === 'wild' ? 'wild' : C.itemId(c);
      const nm = C.itemName(c);
      return `<button type="button" class="bslot c-${c.c || 'w'}" data-${kind}="${k}" aria-label="${esc(nm)} 꺼내기">${artImg(id, nm)}${c.k === 'item' ? `<i class="tier">${c.t}</i>` : ''}</button>`;
    };
    const price = C.bagPrice(st);
    const gifts = st.gifts.length ? `<h3>선물함 <small>자리가 없을 때 받은 것 · 톡 하면 판으로</small></h3><div class="bgrid">${st.gifts.map((c, k) => slot(c, k, 'gift')).join('')}</div>` : '';
    const shop = D.BAL.shop.map((it) => {
      const nm = C.itemName(it.cell);
      return `<button type="button" class="shop-b" data-shop="${it.id}" ${st.gems >= it.gems ? '' : 'disabled'}>${artImg(it.cell.k === 'wild' ? 'wild' : C.itemId(it.cell), nm)}<span>${esc(nm)}</span><b>${artImg('ss1', '소라별')}${it.gems}</b></button>`;
    }).join('');
    return `<h2>가방</h2>
      <p class="center muted">톡 하면 판으로 꺼내요 · 판의 물건을 [가방] 버튼에 끌어다 놓으면 들어가요<br>가방 속 물건도 부탁에 바로 건넬 수 있어요</p>
      <div class="bgrid">${st.bag.map((c, k) => slot(c, k, 'bag')).join('')}</div>
      <button type="button" class="btn" data-grow="1" ${price && st.coins >= price ? '' : 'disabled'}>${price ? `가방 한 칸 늘리기 · 동전 ${price}` : '가방이 가장 커요 (20칸)'}</button>
      ${gifts}
      <h3>소라별 가게 <small>가진 소라별 ${st.gems}개 · 처음 보는 물건을 만들면 1개씩</small></h3>
      <div class="shop">${shop}</div>
      <button type="button" class="btn" data-close="1">닫기</button>`;
  }
  function openBag() {
    const re = () => { const b = $('sheet').querySelector('.sheet-box'); if (b) b.innerHTML = bagHTML(); };
    openSheet(bagHTML(), (b) => {
      if (b.dataset.bag != null) {
        const r = C.fromBag(st, Number(b.dataset.bag), now(), rng);
        if (!r.ok) { F.sfx('bad'); toast('판에 빈칸이 없어요'); return; }
        afterTakeOut(r.at);
      } else if (b.dataset.gift != null) {
        const r = C.takeGift(st, Number(b.dataset.gift), now(), rng);
        if (!r.ok) { F.sfx('bad'); toast('판에 빈칸이 없어요'); return; }
        afterTakeOut(r.at);
      } else if (b.dataset.grow) {
        const r = C.growBag(st, now());
        if (!r.ok) { F.sfx('bad'); toast(r.reason === 'coins' ? '동전이 모자라요' : '더는 못 늘려요'); return; }
        F.sfx('deliver'); toast(`가방이 ${r.size}칸이 됐어요!`);
      } else if (b.dataset.shop) {
        const r = C.buyShop(st, b.dataset.shop, now(), rng);
        if (!r.ok) { F.sfx('bad'); toast('소라별이 모자라요'); return; }
        F.sfx('discover');
        toast(r.at >= 0 ? `${C.itemName(r.cell)}! 판에 놓았어요` : '판이 꽉 차서 선물함에 넣었어요');
        if (r.at >= 0) { renderBoard(); restartAnim(itEl(r.at), 'pop'); }
      }
      clearUndo();
      re(); renderAll(); changed();
    });
  }
  function afterTakeOut(at) {
    F.sfx('spawn');
    renderBoard();
    const el = itEl(at), b = center(cellEl(at)), from = center($('btn-bag'));
    if (el) { el.style.setProperty('--fx', (from.x - b.x) + 'px'); el.style.setProperty('--fy', (from.y - b.y) + 'px'); restartAnim(el, 'born'); }
  }
  $('btn-bag').addEventListener('click', () => { F.unlock(); openBag(); });

  function settingsHTML(confirmReset) {
    const tg = (k, label, sub) => `<div class="row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><button type="button" class="tg${st.settings[k] ? ' on' : ''}" data-tg="${k}" aria-pressed="${!!st.settings[k]}" aria-label="${label}"></button></div>`;
    const VN = ['', '작게', '보통', '크게'];
    const vol = (k, label) => `<div class="row"><span>${label}</span><button type="button" class="vol-b" data-vol="${k}" aria-label="${label} ${VN[st.settings[k]]}">${VN[st.settings[k]] || '보통'}</button></div>`;
    return `<h2>설정</h2>
      ${tg('sfx', '효과음')}
      ${st.settings.sfx ? vol('vol', '효과음 크기') : ''}
      ${tg('bgm', '배경음', '파도 같은 느긋한 소리')}
      ${st.settings.bgm ? vol('bgmVol', '배경음 크기') : ''}
      ${F.canVibrate() ? tg('vib', '진동') : ''}
      ${tg('easy', '편하게 모드', '기운 없이 계속 뽑기')}
      ${tg('nums', '단계 숫자 보기')}
      ${tg('hint', '힌트', '가만히 있으면 합칠 짝이 살랑')}
      ${tg('big', '글씨 크게')}
      ${tg('calm', '움직임 줄이기', '튀는 움직임·반짝이를 줄여요')}
      <p class="muted center">부탁 ${st.stats.delivered}번 · 합치기 ${st.stats.merges}번 · 복원 ${Object.keys(st.tasks).length}곳</p>
      <h3>저장</h3>
      <p class="muted">이 폰에 바로바로 저장되고, 서버에도 30초마다 올려요.<br>${syncLine()}</p>
      <div class="code-row"><span>이어하기 코드</span><b class="code">${esc(S.prettyId(sync.id))}</b></div>
      <button type="button" class="btn" data-sync="now">서버에 지금 저장</button>
      <button type="button" class="btn" data-sync="code">다른 폰의 코드로 불러오기</button>
      <div class="two"><button type="button" class="btn" data-sync="export">내보내기(복사)</button><button type="button" class="btn" data-sync="import">불러오기(붙여넣기)</button></div>
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
      } else if (b.dataset.vol) {
        const k = b.dataset.vol;
        st.settings[k] = (st.settings[k] % 3) + 1;
        syncFx(); F.sfx('pick'); re(); changed();
      } else if (b.dataset.sync) {
        syncAction(b.dataset.sync, re);
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
  $('btn-set').addEventListener('click', () => { F.unlock(); openMenu(); });
  function syncFx() {
    const t = st.settings;
    F.setOpt({ sfx: !!t.sfx, vib: !!t.vib, vol: t.vol || 2, bgm: !!t.bgm, bgmVol: t.bgmVol || 2, calm: !!t.calm });
    document.body.classList.toggle('big-text', !!t.big);
    document.body.classList.toggle('calm', !!t.calm);
  }

  /* ---------- 매일 · 주간 이벤트 (1초마다 살펴봐요) ---------- */
  // 다른 창(시트·대사·마을)이 없고 조용할 때
  function quiet() { return $('sheet').classList.contains('hide') && $('talk').classList.contains('hide') && $('town').classList.contains('hide'); }
  function dailyEventTick() {
    const t = now();
    let dirty = C.dailyTouch(st, t);
    const r = C.eventTick(st, t, rng);
    if (r.ended || r.started) dirty = true;
    if (r.ended) {
      const e = r.ended;
      setTimeout(() => toast(`${e.name || '이벤트'}이 끝났어요 · 이벤트 물건 ${e.n}개 → 동전 ${e.coins}`), 600);
    }
    if (r.started) {
      const ev = r.started.ev;
      renderBoard();
      setTimeout(() => {
        toast(`${ev.name} 시작! ${D.GENS[ev.gen].name}${r.started.gen.at >= 0 ? '를 판에 놓았어요' : '는 가방의 선물함에'}`);
        if (r.started.gen.at >= 0) { restartAnim(itEl(r.started.gen.at), 'pop'); flash([r.started.gen.at]); }
      }, 900);
    }
    if (dirty) { renderOrders(); renderMenuBadge(); changed(); }
  }
  // 오늘 처음 열면 출석 선물부터 (이야기·시트가 없을 때)
  function maybeDaily() {
    if (!st.seen.intro || !C.attendInfo(st, now()).can) return;
    if (!quiet() || busy) { setTimeout(maybeDaily, 1500); return; }
    openDaily();
  }
  function menuNotes() {
    const a = C.attendInfo(st, now()), q = C.questInfo(st);
    return { attend: a.can, quest: q.all && !q.claimed, event: !!st.ev };
  }
  function renderMenuBadge() {
    const n = menuNotes();
    const b = $('menu-badge');
    if (b) b.classList.toggle('hide', !(n.attend || n.quest));
  }

  /* ---------- ☰ 메뉴 ---------- */
  function menuHTML() {
    const n = menuNotes();
    const sc = C.secretCounts(st);
    const col = C.collection(st).filter((x) => !x.aux && !x.event);
    const found = col.reduce((s, x) => s + x.n, 0), all = col.reduce((s, x) => s + x.tiers.length, 0);
    const ei = C.eventInfo(st, now());
    const tile = (k, ic, label, sub, dot) => `<button type="button" class="mn-b" data-menu="${k}"><span class="mn-ic">${ic}</span><b>${label}</b><small>${sub}</small>${dot ? '<i class="badge">!</i>' : ''}</button>`;
    return `<h2>소라섬 수첩</h2>
      <div class="mn-grid">
        ${tile('daily', '📅', '매일 선물', n.attend ? '오늘 출석 선물이 있어요' : n.quest ? '오늘의 부탁 선물!' : '출석 · 오늘의 부탁', n.attend || n.quest)}
        ${tile('book', '📖', '도감', `${found} / ${all} 발견`, false)}
        ${tile('event', ei.active ? artImg(ei.def.gen, '') : '🪁', '주간 이벤트', ei.active ? `${ei.def.name} · ${ei.pts}점` : '1지역을 고치면 열려요', false)}
        ${tile('letters', '💌', sc.album ? '할머니의 앨범' : '편지 조각', `편지 ${sc.letters}/${sc.lettersMax} · 갈매기 ${sc.gulls}/${sc.gullsMax}`, false)}
      </div>
      ${sc.title ? `<p class="center muted">칭호: <b class="title-b">${esc(sc.title)}</b></p>` : ''}
      <button type="button" class="btn" data-menu="settings">⚙ 설정</button>
      <button type="button" class="btn" data-close="1">닫기</button>`;
  }
  function openMenu() {
    openSheet(menuHTML(), (b) => {
      const k = b.dataset.menu;
      if (k === 'daily') openDaily();
      else if (k === 'book') openBook();
      else if (k === 'event') openEvent();
      else if (k === 'letters') openLetters();
      else if (k === 'settings') openSettings();
    });
  }
  const backBtn = '<button type="button" class="btn" data-back="1">‹ 수첩으로</button>';
  function withBack(onClick) { return (b) => { if (b.dataset.back) { openMenu(); return; } if (onClick) onClick(b); }; }

  /* ---------- 매일: 7일 출석 · 오늘의 부탁 ---------- */
  function rewardIcon(rw) {
    if (rw.coins && !rw.give) return artImg('coin', '동전');
    if (rw.gems && !rw.give) return artImg('ss1', '소라별');
    const c = (rw.give || [])[0] || rw;
    return artImg(c.k === 'wild' ? 'wild' : C.itemId(c), '');
  }
  function dailyHTML() {
    const a = C.attendInfo(st, now());
    const q = C.questInfo(st);
    const doneN = a.can ? a.idx : ((a.n - 1) % a.list.length) + 1;   // 이번 바퀴에서 받은 날 수
    const days = a.list.map((rw, k) => {
      const done = k < doneN;
      const today = k === a.idx && a.can;
      return `<div class="att${done ? ' done' : ''}${today ? ' today' : ''}${k === 6 ? ' big' : ''}"><small>${k + 1}일</small><div class="att-ic">${rewardIcon(rw)}</div><span>${esc(rw.label)}</span>${done ? '<i>✓</i>' : ''}</div>`;
    }).join('');
    const qs = q.q.map((x) => `<li class="${x.done ? 'done' : ''}"><span>${esc(x.text)}</span><b>${x.have} / ${x.need}</b><i class="qbar"><em style="width:${Math.round((x.have / x.need) * 100)}%"></em></i></li>`).join('');
    return `<h2>매일 선물</h2>
      <h3>출석 달력 <small>이어서 안 와도 하루씩 쌓여요${a.round ? ` · ${a.round + 1}바퀴째` : ''}</small></h3>
      <div class="att-grid">${days}</div>
      <button type="button" class="btn main" data-att="1" ${a.can ? '' : 'disabled'}>${a.can ? `${a.idx + 1}일째 선물 받기` : '오늘 출석 선물은 받았어요 · 내일 또 만나요'}</button>
      <h3>오늘의 부탁 <small>다 하면 ${esc(C.itemName(q.reward))}</small></h3>
      <ul class="quests">${qs}</ul>
      <button type="button" class="btn${q.all && !q.claimed ? ' main' : ''}" data-quest="1" ${q.all && !q.claimed ? '' : 'disabled'}>${q.claimed ? '오늘 부탁 선물은 받았어요' : q.all ? '선물 받기!' : '세 가지를 다 하면 선물'}</button>
      ${backBtn}`;
  }
  function openDaily() {
    const re = () => { const b = $('sheet').querySelector('.sheet-box'); if (b) b.innerHTML = dailyHTML(); };
    openSheet(dailyHTML(), withBack((b) => {
      if (b.dataset.att) {
        const r = C.claimAttend(st, now(), rng);
        if (!r.ok) { F.sfx('bad'); return; }
        F.sfx('discover'); F.vibrate([10, 30, 10]);
        const p = center(b); F.burst(p.x, p.y, ['#ffd25a', '#ffffff', '#ff9eb5'], 24, 1.4);
        const extra = r.placed.some((x) => x.at < 0) ? ' (판이 꽉 차서 선물함에)' : '';
        toast(`${r.day}일째 선물: ${r.reward.label}${extra}`);
        if (r.reward.deco) setTimeout(() => toast('몽돌이 모자를 얻었어요! 마을에서 몽돌이를 보세요'), 2400);
      } else if (b.dataset.quest) {
        const r = C.claimQuests(st, now(), rng);
        if (!r.ok) { F.sfx('bad'); return; }
        F.sfx('discover');
        toast(`오늘의 부탁 선물: ${C.itemName(r.cell)}${r.at < 0 ? ' (선물함)' : ''}`);
      }
      re(); renderAll(); changed();
    }));
  }

  /* ---------- 도감 ---------- */
  function bookHTML() {
    const col = C.collection(st).filter((x) => !x.event || x.n > 0);
    const rows = col.map((x) => {
      const ic = x.tiers.map((t) => {
        const id = x.c + t.t;
        return `<i class="bk${t.found ? '' : ' unk'}" title="${t.found ? esc(t.name) : '???'}">${t.found ? artImg(id, t.name) : (A.src(id) ? `<img src="${esc(A.src(id))}" alt="" draggable="false">` : '?')}<em>${t.t}</em></i>`;
      }).join('');
      return `<div class="bk-row c-${x.c}"><div class="bk-h"><b>${esc(x.name)}</b><small>${x.n} / ${x.tiers.length}</small></div><div class="bk-ic">${ic}</div></div>`;
    }).join('');
    return `<h2>도감</h2><p class="center muted">처음 만든 물건은 여기 남아요 · 처음 발견하면 소라별 1개</p>${rows}${backBtn}`;
  }
  function openBook() { openSheet(bookHTML(), withBack(null)); }

  /* ---------- 주간 이벤트 ---------- */
  function eventHTML() {
    const ei = C.eventInfo(st, now());
    if (!ei.active) {
      const nx = ei.cur.ev;
      return `<h2>주간 이벤트</h2>${A.src(nx.banner) ? `<img class="ev-banner" src="${esc(A.src(nx.banner))}" alt="">` : ''}
        <p class="center">이번 주는 <b>${esc(nx.name)}</b>이에요.</p>
        <p class="center muted">바다별채(1지역)를 다 고치면 매주 이벤트가 열려요.</p>${backBtn}`;
    }
    const e = ei.def;
    const d = Math.floor(ei.leftMs / 864e5), h = Math.floor((ei.leftMs % 864e5) / 3600e3);
    const steps = e.track.map((need, k) => {
      const rw = e.rewards[k];
      const ic = rw.k === 'deco' ? artImg(rw.id, e.decoName) : artImg(rw.k === 'wild' ? 'wild' : C.itemId(rw), '');
      return `<div class="ev-step${k < ei.got ? ' got' : ''}${k === ei.got ? ' next' : ''}${rw.k === 'deco' ? ' deco' : ''}"><div class="ev-ic">${ic}</div><small>${need}</small>${k < ei.got ? '<i>✓</i>' : ''}</div>`;
    }).join('');
    const ladder = e.chain ? `<div class="ladder c-${e.chain} ev-ladder">${D.CHAINS[e.chain].tiers.map((nm, k) => `<i title="${esc(nm)}">${artImg(e.chain + (k + 1), nm)}</i>`).join('')}</div>` : '';
    const pct = Math.min(100, Math.round((ei.pts / e.track[e.track.length - 1]) * 100));
    return `<h2>${esc(e.name)}</h2>
      ${A.src(e.banner) ? `<img class="ev-banner" src="${esc(A.src(e.banner))}" alt="">` : ''}
      <p class="center muted">남은 시간 ${d}일 ${h}시간 · 판의 <b>${esc(D.GENS[e.gen].name)}</b>를 톡 → 합쳐서 이벤트 부탁에 건네요</p>
      ${ladder}
      <div class="ev-pts"><b>${ei.pts}점</b><span class="ev-bar"><em style="width:${pct}%"></em></span>${ei.next ? `<small>다음 보상까지 ${ei.next - ei.pts}점</small>` : '<small>보상을 다 받았어요!</small>'}</div>
      <div class="ev-track">${steps}</div>
      <p class="center muted">마지막 칸 「${esc(e.decoName)}」 장식은 이벤트가 끝나도 남아요 · [마을]에서 놓을 수 있어요<br>이벤트가 끝나면 남은 이벤트 물건은 동전으로 바뀌어요</p>
      ${backBtn}`;
  }
  function openEvent() { openSheet(eventHTML(), withBack(null)); }

  /* ---------- 편지 조각 · 할머니의 앨범 ---------- */
  function lettersHTML() {
    const sc = C.secretCounts(st);
    const ids = Object.keys(D.LETTERS);
    const where = {};
    D.AREAS.forEach((a) => a.secrets.letters.forEach((l) => { where[l.id] = a.name; }));
    const list = ids.map((id, k) => st.sec.letters[id]
      ? `<li class="got"><i>${k + 1}</i><span>${esc(D.LETTERS[id])}</span></li>`
      : `<li><i>${k + 1}</i><span class="muted">??? · ${esc(where[id] || '')} 어딘가</span></li>`).join('');
    const album = sc.album ? `<h3>할머니의 앨범</h3><div class="album">${D.AREAS.map((a) => A.src(a.bg.after) ? `<figure><img src="${esc(A.src(a.bg.after))}" alt=""><figcaption>${esc(a.name)}</figcaption></figure>` : '').join('')}
      ${A.src('story_ending') ? `<figure class="wide"><img src="${esc(A.src('story_ending'))}" alt=""><figcaption>첫 등불 바다 축제</figcaption></figure>` : ''}</div>`
      : `<p class="center muted">편지 12장을 다 모으고 등대에 불을 켜면 「할머니의 앨범」이 열려요</p>`;
    return `<h2>${sc.album ? '할머니의 편지' : '편지 조각'}</h2>
      <p class="center muted">마을 그림 속 반짝이는 곳을 톡 · 몽돌이가 꼬리를 흔들면 근처에 있어요</p>
      <ol class="letters${sc.album ? ' full' : ''}">${list}</ol>
      <p class="center muted">갈매기 ${sc.gulls} / ${sc.gullsMax}마리${sc.title ? ` · 칭호 「${esc(sc.title)}」` : ' · 다 찾으면 칭호 「섬 탐정」'}</p>
      ${album}${backBtn}`;
  }
  function openLetters() { openSheet(lettersHTML(), withBack(null)); }

  /* ---------- 이야기 대사창 (톡해서 넘김) ---------- */
  function talk(lines, done) {
    const box = $('talk');
    let k = 0;
    const show = () => {
      const l = lines[k];
      const v = D.VILLAGERS[l.who] || D.VILLAGERS.hayun;
      const s = faceSrc(v, l.face) || (v.faces && A.src(v.faces.joy)) || '';
      const right = l.who !== 'hayun' && !v.letter;
      const pic = l.pic && A.src(l.pic);
      box.classList.toggle('has-pic', !!pic);
      box.innerHTML = (pic ? `<div class="talk-pic"><img src="${esc(pic)}" alt="" draggable="false"></div>` : '') + `<div class="talk-box${v.letter ? ' letter' : ''}${right ? ' right' : ''}${l.face === 'joy' ? ' joy' : ''}" style="--fc:${esc(v.color)}">
        <div class="talk-face${s ? '' : ' none'}">${s ? `<img src="${esc(s)}" alt="" draggable="false">` : esc(v.letter ? '✉' : v.name[0])}</div>
        <div class="talk-name">${esc(v.name)}</div><div class="talk-txt">${esc(l.text)}</div><div class="talk-next">${k + 1} / ${lines.length} · 톡 ▶</div></div>`;
      if (l.who === 'mongdol') F.sfx('spawn');
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
      setTimeout(maybeDaily, 1200);
    });
  }

  /* ---------- 힌트 (가만히 10초) ---------- */
  function clearHint() {
    if (!hintOn) return;
    hintOn = false;
    Array.prototype.forEach.call(document.querySelectorAll('.it.hint'), (e) => e.classList.remove('hint'));
  }
  function tick() {
    dailyEventTick();
    renderHud();
    if (st.board.some((c) => c && c.k === 'gen' && D.GENS[c.g].charge)) renderBoard();
    syncTick();
    if (st.settings.hint && !hintOn && !drag && !busy && now() - lastAct > 10000 && quiet()) {
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) { saver.flush(); syncBeacon(); } else { renderHud(); } });
  addEventListener('pagehide', () => { saver.flush(); syncBeacon(); });
  addEventListener('resize', () => layout());

  function renderAll() { renderHud(); renderOrders(); renderBoard(); renderInfo(); renderNav(); renderMenuBadge(); }

  /* ---------- 서버 저장 (기기 저장이 1차 · 서버는 백업·폰 옮기기) ---------- */
  const server = S.Server();
  const sync = S.syncInfo(store);
  const syncSt = { busy: false, lastTry: 0, state: '', conflict: false };
  function syncLine() {
    if (syncSt.state === 'offline') return '지금은 서버에 닿지 않아요 (이 폰에는 잘 저장돼요)';
    if (!sync.okAt) return '아직 서버에 올린 적이 없어요';
    const m = Math.round((now() - sync.okAt) / 60000);
    return `서버 저장: ${m < 1 ? '방금' : m + '분 전'}`;
  }
  async function syncPush(force) {
    if (syncSt.busy || syncSt.conflict) return null;
    syncSt.busy = true; syncSt.lastTry = now();
    saver.flush();
    const r = await server.save(sync.id, st, force);
    syncSt.busy = false;
    if (r.ok) { sync.sentAt = st.updatedAt; sync.okAt = now(); S.setSyncInfo(store, sync); syncSt.state = 'ok'; }
    else if (r.err === 'newer') { syncSt.conflict = true; await syncPull(true); }
    else syncSt.state = r.err === 'offline' || /^http/.test(r.err || '') || r.err === 'nofetch' ? 'offline' : 'err';
    return r;
  }
  function syncTick() {
    if (st.updatedAt > (sync.sentAt || 0) && now() - syncSt.lastTry > 30000) syncPush(false);
  }
  function syncBeacon() { if (st.updatedAt > (sync.sentAt || 0) && !syncSt.conflict && server.beacon(sync.id, st)) { sync.sentAt = st.updatedAt; S.setSyncInfo(store, sync); } }
  // 서버 저장을 받아서 고르기 (처음 열 때 · 다른 폰 코드 · 서버가 더 새것일 때)
  async function syncPull(conflict, fresh) {
    const r = await server.load(sync.id);
    if (!r.ok) { if (r.err === 'none') syncSt.conflict = false; else syncSt.state = 'offline'; return r; }
    const remote = C.deserialize(r.data, now(), rng);
    if (!remote) return { ok: false };
    const how = conflict ? 'ask' : S.pickSave(st, remote, fresh);
    if (how === 'remote') adopt(remote, '서버에 있던 기록을 불러왔어요');
    else if (how === 'ask') askWhich(remote);
    else syncSt.conflict = false;
    return r;
  }
  function sumLine(x) { const m = C.summary(x); const t = new Date(m.updatedAt); return `별 ${m.stars} · 동전 ${m.coins} · 복원 ${m.tasks}곳 · 부탁 ${m.delivered}번<br><small>${t.getMonth() + 1}/${t.getDate()} ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}</small>`; }
  function askWhich(remote) {
    openSheet(`<h2>어느 기록으로 할까요?</h2>
      <p class="center muted">이 폰과 서버의 기록이 달라요</p>
      <button type="button" class="btn pick" data-which="local"><b>이 폰 기록</b><br>${sumLine(st)}</button>
      <button type="button" class="btn pick" data-which="remote"><b>서버 기록</b><br>${sumLine(remote)}</button>`,
    (b) => {
      if (!b.dataset.which) return;
      closeSheet();
      syncSt.conflict = false;
      if (b.dataset.which === 'remote') adopt(remote, '서버 기록으로 바꿨어요');
      else { st.updatedAt = Math.max(now(), (remote.updatedAt || 0) + 1); syncPush(true); toast('이 폰 기록을 서버에 올렸어요'); }
    });
  }
  function adopt(next, msg) {
    st = next;
    sel = -1; wasReady = {}; shown.hold = 0; clearUndo();
    $('orders').innerHTML = '';
    sync.sentAt = st.updatedAt; S.setSyncInfo(store, sync);
    syncSt.conflict = false;
    saver.dirty = true; saver.flush();
    syncFx(); renderAll(); setBg();
    if (msg) toast(msg);
  }
  async function syncAction(kind, re) {
    if (kind === 'now') {
      const r = await syncPush(false);
      toast(r && r.ok ? '서버에 저장했어요' : syncSt.conflict ? '서버 기록이 더 새것이에요' : '서버에 닿지 않아요 · 이 폰에는 저장돼 있어요');
      re();
    } else if (kind === 'code') {
      formSheet('다른 폰의 이어하기 코드', '예: abcd-efgh-jkmn', async (val) => {
        const id = S.cleanId(val);
        if (!S.ID_RE.test(id)) { toast('코드를 다시 확인해 주세요'); return; }
        const r = await server.load(id);
        if (!r.ok) { toast(r.err === 'none' ? '그 코드의 기록이 없어요' : '서버에 닿지 않아요'); return; }
        const remote = C.deserialize(r.data, now(), rng);
        if (!remote) { toast('기록을 읽지 못했어요'); return; }
        sync.id = id; S.setSyncInfo(store, sync);
        adopt(remote, '그 폰의 기록을 불러왔어요 · 이제 같은 코드로 저장돼요');
      });
    } else if (kind === 'export') {
      saver.flush();
      const txt = C.serialize(st);
      let ok = false;
      try { await navigator.clipboard.writeText(txt); ok = true; } catch (e) { ok = false; }
      if (ok) toast('저장 글을 복사했어요 · 메모장 등에 붙여 두세요');
      else formSheet('저장 글 (길게 눌러 복사)', '', null, txt);
    } else if (kind === 'import') {
      formSheet('저장 글 붙여넣기', '내보내기로 복사한 글', (val) => {
        const next = C.deserialize(String(val || '').trim(), now(), rng);
        if (!next) { toast('저장 글을 읽지 못했어요'); return; }
        next.updatedAt = now();
        adopt(next, '불러왔어요!');
      });
    }
  }
  function formSheet(title, ph, onOk, value) {
    openSheet(`<h2>${esc(title)}</h2><textarea class="field" rows="${value ? 6 : 2}" placeholder="${esc(ph)}" ${value ? 'readonly' : ''}>${esc(value || '')}</textarea>
      ${onOk ? '<button type="button" class="btn main" data-ok="1">확인</button>' : ''}<button type="button" class="btn" data-close="1">닫기</button>`,
    (b) => { if (b.dataset.ok && onOk) { const v = $('sheet').querySelector('textarea').value; closeSheet(); onOk(v); } });
    const ta = $('sheet').querySelector('textarea');
    if (ta) { ta.addEventListener('pointerdown', (e) => e.stopPropagation()); if (value) ta.select(); }
  }
  function setBg() {
    const info = C.areaInfo(st);
    const id = info.finished || info.doneN === info.total ? info.show.bg.after : info.show.bg.before;
    const s = A.src(id) || A.src(info.show.bg.before) || A.src('r1_before');
    const bg = $('bg');
    if (bg) { if (s) { bg.src = s; bg.style.display = ''; } else bg.style.display = 'none'; }
  }

  /* ---------- 시작 ---------- */
  function start() {
    syncFx();
    setBg();
    document.querySelectorAll('img[data-art]').forEach((im) => { im.src = A.src(im.dataset.art); });
    buildBoard();
    renderAll();
    layout();
    F.attach($('fx'));
    setTimeout(layout, 400);   // 글꼴을 다 읽은 뒤 한 번 더 (높이가 달라질 수 있어요)
    try { document.fonts.ready.then(layout); } catch (e) { /* 무시 */ }
    A.preload(Object.keys(A.FILES).filter((id) => !/^r\d_|^story_|^title$|^board$|_banner$|_deco$/.test(id)));
    setInterval(tick, 1000);
    dailyEventTick();
    if (!st.seen.intro) setTimeout(playIntro, 300);
    else setTimeout(() => { if (window.MergeTown) window.MergeTown.resume(); maybeDaily(); }, 300);
    offline();
    saver.schedule();
    syncPull(false, freshLocal);
  }
  // 오프라인: 한 번 열면 그 폰에서 그림·화면을 저장해 두고(서비스 워커), 인터넷이 없어도 열려요
  function offline() {
    try {
      if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
      const swUrl = new URL(A.root + '../sw.js', location.href);
      if (swUrl.origin !== location.origin) return;
      // 정적 서버 등 sw.js 가 없으면 그냥 온라인으로 (없는 파일을 등록하려다 콘솔에 오류가 남지 않게 먼저 살펴봐요)
      fetch(swUrl.pathname, { method: 'HEAD', cache: 'no-store' })
        .then((r) => { if (r.ok) return navigator.serviceWorker.register(swUrl.pathname); return null; })
        .catch(() => { /* 무시 */ });
    } catch (e) { /* 무시 */ }
  }
  start();

  // 시험용 손잡이 (브라우저 콘솔 · 자동 시험)
  window.MergeUI = {
    get state() { return st; }, renderAll, renderNav, apply, tap, deliver, layout, changed, toast, say, talk, flash, floatTag, center, cellEl, itEl,
    artImg, esc, josa, setBg, clearUndo, restartAnim, openBag, syncPush, sync, STAR, faceSrc, faceHTML, react, quiet,
    openMenu, openDaily, openBook, openEvent, openLetters, openSettings, openSheet, closeSheet, dailyEventTick, mmss,
    get busy() { return busy; }
  };
})();
