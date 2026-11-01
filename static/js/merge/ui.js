/* 머지관 · 「소라섬 등불 이야기」 화면 · 조작
   - 판(7×9): 끌어서 놓기(가까운 칸에 착 붙음) + 톡-톡 합치기 · 발생기 톡 → 옆 빈칸에 물건이 튀어나와요
   - 주문 카드: 얼굴 · 원하는 물건(있으면 초록 체크) · 보상 · [건네기] · ↻ 다른 부탁
   - 규칙은 전부 MergeCore(core.js) 에 맡기고, 여기는 그리기·움직임·소리만 해요
   - 2단계: 모래더미 칸 · 아래 [마을]/[가방] 버튼 · 이야기 대사창(talk) · 서버 저장 동기화
   - 3단계(일부): 가방(끌어 넣기)·선물함·소라별 가게 · 팔기(5초 되돌리기) · 되돌리기 ↶ · 보조 물건 쓰기 · 충전식 발생기
   - 4~6단계: 얼굴 그림(기본·기쁨) · 건네기 반응(기쁨 얼굴 통통 + 하트 + 고맙다는 말풍선) · 이야기 부탁(금색) · 이벤트 부탁
     · ☰ 메뉴(매일 출석·오늘의 부탁·도감·주간 이벤트·편지와 앨범·설정) · 발생기 강화 · 배경음·소리 크기·글씨·움직임 줄이기 · 오프라인
   - 마을 개편 1단계(merge_town.md): 배경음악(music.js · 화면마다 곡 고르기 musicTick) · 손맛(빨려 들어가 펑 · 포물선 · 숫자 올라감)
     · 대사 [건너뛰기 ▶▶] · 판 아래 [상점](5탭·매일 특가·무료) · 🔨 자동 합치기 · 도우미(자동 합치기 1분·바쁜 손) · 물건 고정(핀)
   - 마을 화면(전/후 배경·복원 작업)은 town.js 가 window.MergeUI 손잡이로 이 화면을 같이 써요 */
(function () {
  'use strict';

  const D = window.MergeData, C = window.MergeCore, S = window.MergeSave, A = window.MergeArt, F = window.MergeFx, MU = window.MergeMusic;
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
  const shown = C.hudShown(st);   // 동전·별이 날아가는 동안 숫자는 도착할 때 올라요 (늦어도 2.5초 뒤엔 진짜 값 · core.js hudShown)
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
    if (cell.k === 'item') return cell.c + cell.t + (cell.pin ? 'p' : '');
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
    return `<div class="it c-${cell.c}${max ? ' max' : ''}${cell.pin ? ' pinned' : ''}">${artImg(C.itemId(cell), C.itemName(cell))}<i class="tier">${cell.t}</i>${cell.pin ? '<i class="pin" aria-label="고정">📌</i>' : ''}</div>`;
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
    const v = shown.read(st, now());
    const pt = performance.now();   // 또르륵 중이 아니거나(끝 시각 지남) 탭이 숨어 rAF 가 멈췄으면 진짜 값으로
    if (!(counting.coins > pt)) $('coins').textContent = v.coins;
    if (!(counting.stars > pt)) $('stars').textContent = v.stars;
    renderNav();
  }
  // 숫자가 또르륵 올라가요 (동전·별이 날아와 꽂힐 때) · counting[key] = 끝나는 시각 (그 뒤엔 renderHud 가 진짜 값)
  const counting = { coins: 0, stars: 0 };
  function countUp(key, to, ms) {
    const el = $(key), from = Number(el.textContent) || 0;
    if (from === to) { el.textContent = to; return; }
    const t0 = performance.now(), dur = F.reduced ? 1 : (ms || 420);
    counting[key] = t0 + dur + 120;
    const step = (t) => {
      if (counting[key] !== t0 + dur + 120) return;   // 더 새 또르륵이 시작됨
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step); else { el.textContent = to; counting[key] = 0; }
    };
    requestAnimationFrame(step);
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
    C.shopTouch(st, now());
    $('shop-badge').classList.toggle('hide', !!st.shop.freeTaken);
    renderAutoBtn();
  }
  // 🔨 자동 합치기 버튼: 합칠 게 없으면 흐리게 · 무료 횟수가 있으면 '무료'
  function renderAutoBtn() {
    const b = $('btn-auto');
    if (!b) return;
    const n = C.autoPairs(st).length;
    b.classList.toggle('dim', !n);
    $('auto-tok').classList.toggle('hide', !(st.boost.autoTok > 0));
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
      shown.begin(now(), r.stars > 0 ? 2 : 1);
      const nCoin = Math.min(7, Math.max(2, Math.ceil(r.coins / 4)));
      F.fly(artImg('coin', ''), from, center($('hud-coin')), { count: nCoin, ms: 620, spread: 46, size: 28, s1: 0.7,
        onEach: (i) => { F.sfx('coin'); if (i === nCoin - 1) { shown.land('coins', st); countUp('coins', st.coins); bump('hud-coin'); plusTag('hud-coin', r.coins); shown.done(); } } });
      const nStar = Math.min(5, r.stars);
      if (nStar > 0) F.fly(STAR, from, center($('hud-star')), { count: nStar, ms: 700, spread: 30, size: 28, s1: 0.7,
        onEach: (i) => { F.sfx('star'); if (i === nStar - 1) { shown.land('stars', st); countUp('stars', st.stars); bump('hud-star'); plusTag('hud-star', r.stars); shown.done(); } } });
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
      if (r.story && D.STORY[r.story]) setTimeout(() => talk(D.STORY[r.story], (skipped) => { st.story[r.story] = skipped && !st.story[r.story] ? 'skip' : true; changed(); renderAll(); if (window.MergeTown) window.MergeTown.resume(); }), 1500);
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
  function renderHudCounts() { const v = shown.read(st, now()); $('coins').textContent = v.coins; $('stars').textContent = v.stars; }
  // 위 칸 숫자 옆에 '+12' 가 떠올라요
  function plusTag(id, n) { if (!n) return; const p = center($(id)); floatTag('+' + n, p.x, p.y + p.h * 0.9, true); }

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

  // 주문 카드의 물건 톡 → '만드는 법' 안내 (발생기 → 1단계 → … → 부탁 단계) + 판의 발생기·같은 체인 물건 반짝
  //  다른 곳을 톡 하면 닫혀요
  function showNeed(o, k) { openGuide(o, k); }
  let guide = null;   // { el, oid, k }
  function closeGuide() {
    if (!guide) return;
    const g = guide; guide = null;
    g.el.classList.add('bye');
    setTimeout(() => g.el.remove(), 180);
    Array.prototype.forEach.call(document.querySelectorAll('.cell.guide'), (c) => c.classList.remove('guide', 'gen-g'));
    Array.prototype.forEach.call(document.querySelectorAll('.oc-item.on'), (b) => b.classList.remove('on'));
  }
  function openGuide(o, k) {
    const was = guide && guide.oid === o.id && guide.k === k;
    closeGuide();
    if (was) return;   // 같은 물건을 다시 톡 → 닫기만
    const n = o.need[k];
    const g = C.orderGuide(st, n.c, n.t);
    if (!g) return;
    const ch = D.CHAINS[n.c];
    let src;
    if (g.gen) {
      const lock = !g.gen.cells.length;
      src = `<div class="gd-src">${artImg(g.gen.id, g.gen.name, 'gd-gen')}<span><b>${esc(g.gen.name)}</b> 톡 → ${esc(ch.name)} 1단계${lock ? `<br><small>${D.GENS[g.gen.id].event ? '이벤트 동안 판에 나오는 발생기예요' : '이 발생기는 아직 판에 없어요 · [마을]을 고치면 생겨요'}</small>` : ''}</span></div>`;
    } else {
      const nm = esc(josa(ch.name, '은', '는'));
      src = `<div class="gd-src"><span>${g.from === 'box' ? `${nm} 발생기에서 안 나와요 · 선물 보자기·매일 선물·이벤트 보상에서 나와요` : `${nm} 다른 곳에서 얻어요`}</span></div>`;
    }
    const steps = g.steps.map((s, j) => {
      const known = !!st.found[s.id] || s.have > 0;
      const im = A.src(s.id);
      const arrow = j ? `<i class="gd-arr" aria-hidden="true"><small>2개</small>→</i>` : '';
      return `${arrow}<span class="gd-step${s.have ? ' have' : ''}${s.t === g.t ? ' goal' : ''}${known ? '' : ' unk'}" title="${esc(s.name)}">`
        + `${im ? `<img src="${esc(im)}" alt="${esc(s.name)}" draggable="false">` : `<span class="ph">${esc(s.name)}</span>`}<i class="tier">${s.t}</i>`
        + `${s.have ? `<b class="gd-n">${s.have}</b>` : ''}</span>`;
    }).join('');
    let tip;
    if (g.ready) tip = g.steps[g.t - 1].cells.length ? '벌써 판에 있어요! [건네기]만 누르면 돼요.' : '가방에 있어요! [건네기]를 누르면 가방에서 꺼내 줘요.';
    else if (g.best) tip = `${g.best}단계는 가지고 있어요 · 같은 것 2개를 합쳐서 한 단계씩 올려요.`;
    else tip = g.gen ? '발생기를 톡 해서 1단계를 꺼내고, 같은 것 2개를 합쳐요.' : '같은 것 2개를 합치면 한 단계 올라가요.';
    const el = document.createElement('div');
    el.className = 'gd-pop c-' + n.c;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '만드는 법');
    el.innerHTML = `<div class="gd-head"><b>만드는 법</b><span>${esc(g.name)} · ${g.t}단계</span><button type="button" class="gd-x" aria-label="닫기">✕</button></div>
      ${src}<div class="gd-steps">${steps}</div><p class="gd-tip">${esc(tip)}</p>`;
    document.body.appendChild(el);
    const top = $('orders').getBoundingClientRect().bottom + 2;
    const w = Math.min(innerWidth - 16, 420);
    el.style.width = w + 'px';
    el.style.left = Math.round((innerWidth - w) / 2) + 'px';
    el.style.top = Math.round(top) + 'px';
    guide = { el, oid: o.id, k };
    const btn = $('orders').querySelector(`.oc-item[data-hl="${o.id}:${k}"]`);
    if (btn) btn.classList.add('on');
    // 판에서 반짝: 발생기 + 부탁 단계까지의 같은 체인 물건
    const mark = (i, gen) => { const c = cellEl(i); if (c) { c.classList.add('guide'); if (gen) c.classList.add('gen-g'); } };
    if (g.gen) g.gen.cells.forEach((i) => mark(i, true));
    g.steps.forEach((s) => s.cells.forEach((i) => mark(i, false)));
    // 반짝이는 칸을 덜 가리는 쪽에 (위: 부탁 카드 바로 아래 · 아래: 정보 칸 바로 위)
    const lit = Array.prototype.map.call(document.querySelectorAll('.cell.guide'), (c) => c.getBoundingClientRect());
    const h = el.offsetHeight;
    const bottomTop = Math.round($('foot').getBoundingClientRect().top - 4 - h);
    const hidden = (y) => lit.filter((r) => r.bottom > y && r.top < y + h).length;
    if (bottomTop > top && hidden(bottomTop) < hidden(top)) el.style.top = bottomTop + 'px';
    if (g.ready && !g.steps[g.t - 1].cells.length) restartAnim($('btn-bag'), 'wig1');
  }
  // 안내창 밖을 톡 → 닫기 (안내창 안의 ✕ 도)
  document.addEventListener('pointerdown', (e) => {
    if (!guide) return;
    const t = e.target;
    if (t.closest && t.closest('.gd-pop') && !t.closest('.gd-x')) return;
    if (t.closest && t.closest('.oc-item')) return;   // 카드 물건 톡은 click 에서 처리 (다른 물건으로 바꾸기·같은 물건이면 닫기)
    closeGuide();
  }, true);
  document.addEventListener('click', (e) => { if (guide && e.target.closest && e.target.closest('.gd-x')) closeGuide(); });
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
    const bx = box.firstElementChild;
    if (bx) bx.classList.toggle('has-acts', !!bx.querySelector('.info-acts'));
  }
  function auxText(aux, t) {
    const a = aux.amount[t - 1];
    return aux.kind === 'energy' ? `마시면 기운 +${a}` : aux.kind === 'coins' ? `쓰면 동전 +${a}` : aux.kind === 'gems' ? `모으면 소라별 +${a}` : `열면 물건 ${a}개`;
  }
  function actsHTML(cell) {
    const aux = cell.k === 'item' && D.CHAINS[cell.c].aux;
    return `<div class="info-acts">
      ${aux ? `<button type="button" class="act use" data-act="use">${esc(aux.verb)}</button>` : ''}
      ${cell.k === 'item' && !aux ? `<button type="button" class="act pin${cell.pin ? ' on' : ''}" data-act="pin" aria-pressed="${!!cell.pin}" title="고정하면 자동 합치기가 안 건드려요">${cell.pin ? '고정 풀기' : '📌 고정'}</button>` : ''}
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

  // 합치기: 둘레 가루가 빨려 들어가고(0.18초) → 결과가 통 튀어나오며 펑
  function afterMerge(r, pitch) {
    const el = itEl(r.at);
    restartAnim(el, 'mpop');
    const p = center(cellEl(r.at));
    const col = D.CHAINS[r.cell.c].color;
    F.implode(p.x, p.y, [col, '#ffffff', '#ffe27a'], 10, p.w * 0.75);
    setTimeout(() => F.burst(p.x, p.y, [col, '#ffe27a', '#ffffff'], 14 + r.cell.t, 0.9 + r.cell.t * 0.06), F.reduced ? 0 : 150);
    F.sfx('merge', pitch || r.cell.t);
    F.vibrate(14);
    if (r.first) {
      setTimeout(() => { floatTag('새 발견! ' + C.itemName(r.cell), p.x, p.y - p.h * 0.6); F.sfx('discover'); F.burst(p.x, p.y, ['#ffd25a', '#ffffff', col], 18, 1.5); }, 120);
    }
    if (r.max) setTimeout(() => { floatTag('최고 단계!', p.x, p.y - p.h * 1.3, true); F.sfx('maxed'); F.vibrate([10, 30, 10, 30, 30]); }, 380);
    (r.peeled || []).forEach((pe, k) => setTimeout(() => {
      const q = center(cellEl(pe.i));
      restartAnim(cellEl(pe.i).firstElementChild, 'pop');
      F.burst(q.x, q.y, ['#e8cfa0', '#f6e3bd', '#ffffff'], 10, 0.8);
      F.sfx('sand'); if (!pe.left) F.sfx('open');
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
    arcIn(el, a, b);
    F.sfx('spawn'); F.vibrate(8);
    setTimeout(() => F.burst(b.x, b.y, [D.CHAINS[r.cell.c].color, '#ffffff'], 6, 0.55), 300);
    if (r.first) setTimeout(() => { floatTag('새 발견! ' + C.itemName(r.cell), b.x, b.y - b.h * 0.6); F.sfx('discover'); }, 320);
    clearUndo();
    renderHud(); renderOrders(); renderInfo();
    changed();
    autoAfter(r.at, 360);
  }
  // 물건이 a 에서 b 칸으로 포물선을 그리며 톡 (발생기·보자기·상점·가방)
  function arcIn(el, a, b, delay) {
    if (!el) return;
    el.style.setProperty('--fx', (a.x - b.x) + 'px'); el.style.setProperty('--fy', (a.y - b.y) + 'px');
    el.style.setProperty('--hop', Math.round(-26 - Math.min(60, Math.abs(a.x - b.x) * 0.25)) + 'px');
    el.style.animationDelay = (delay || 0) + 'ms';
    restartAnim(el, 'arc');
  }
  // 자동 합치기 1분: 방금 놓인 물건이 짝을 만나면 하나씩 휙휙 (연쇄)
  function autoAfter(at, wait, k) {
    if (at < 0 || !(st.boost && st.boost.autoMs > 0)) return;
    setTimeout(() => {
      if (drag || !(st.boost.autoMs > 0)) return;
      const s = C.autoChain(st, at, now(), 1);
      if (!s.length) return;
      const r = s[0];
      flyMerge(r.from, r.at);
      if (sel === r.from) sel = r.at;
      renderBoard(); afterMerge(r, 2 + (k | 0)); renderOrders(); renderInfo(); renderNav();
      changed();
      autoAfter(r.at, 160, (k | 0) + 1);
    }, wait || 0);
  }
  // from 칸 물건이 to 칸으로 휙 (자동 합치기 그림)
  function flyMerge(from, to) {
    const a = center(cellEl(from)), b = center(cellEl(to)), it = itEl(from) || itEl(to);
    if (!it || F.reduced) return;
    F.fly(it.innerHTML.replace(/<i class="tier">.*?<\/i>/, '').replace(/<i class="pin".*?<\/i>/, ''), a, b, { ms: 140, size: a.w, s1: 0.8 });
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
    if (b.dataset.act === 'pin') {
      const on = !st.board[i].pin;
      C.setPin(st, i, on); F.sfx('pick');
      toast(on ? '고정했어요 · 자동 합치기가 이 물건은 안 건드려요' : '고정을 풀었어요');
      renderBoard(); renderInfo(); renderNav(); changed();
      return;
    }
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
        arcIn(itEl(pl.at), p, center(cellEl(pl.at)), k * 60);
      });
      r.placed.forEach((pl, k) => autoAfter(pl.at, 420 + k * 200));
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
  let sheetKind = '';
  function openSheet(html, onClick, kind) {
    const sh = $('sheet');
    sheetKind = kind || '';
    sh.oninput = null;
    sh.innerHTML = `<div class="sheet-box" role="dialog">${html}</div>`;
    sh.classList.remove('hide');
    F.sfx('open');
    sh.onclick = (e) => {
      if (e.target === sh || e.target.closest('[data-close]')) { closeSheet(); return; }
      const b = e.target.closest('button');
      if (b && onClick) onClick(b);
    };
  }
  function closeSheet() { $('sheet').classList.add('hide'); $('sheet').innerHTML = ''; sheetKind = ''; F.sfx('close'); musicTick(); }

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
  $('hud-coin').addEventListener('click', () => { F.unlock(); F.sfx('pick'); say(D.VILLAGERS.hayun, `동전 ${st.coins}개 · 소라별 ${st.gems}개. 아래 [상점]에서 써요. 소라별은 무지개 소라·보자기에!`); });

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
    return `<h2>가방</h2>
      <p class="center muted">톡 하면 판으로 꺼내요 · 판의 물건을 [가방] 버튼에 끌어다 놓으면 들어가요<br>가방 속 물건도 부탁에 바로 건넬 수 있어요</p>
      <div class="bgrid">${st.bag.map((c, k) => slot(c, k, 'bag')).join('')}</div>
      <button type="button" class="btn" data-grow="1" ${price && st.coins >= price ? '' : 'disabled'}>${price ? `가방 한 칸 늘리기 · 동전 ${price}` : '가방이 가장 커요 (20칸)'}</button>
      ${gifts}
      <button type="button" class="btn shop-link" data-goshop="1">🛍️ 물건 사기는 [상점]에서 <small>소라별 ${st.gems}개</small></button>
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
      } else if (b.dataset.goshop) { openShop('item'); return; }
      clearUndo();
      re(); renderAll(); changed();
    });
  }
  function afterTakeOut(at) {
    F.sfx('spawn');
    renderBoard();
    arcIn(itEl(at), center($('btn-bag')), center(cellEl(at)));
  }
  $('btn-bag').addEventListener('click', () => { F.unlock(); openBag(); });

  /* ---------- 상점 (merge_town.md §F · 판 아래 [상점] · 탭 5개 · 매일 0시 특가 · 무료 1칸) ---------- */
  let shopTab = 'deal';
  const COIN = () => artImg('coin', '동전');
  const GEM = () => artImg('ss1', '소라별');
  function giveIcon(g) { return g ? artImg(g.k === 'wild' ? 'wild' : C.itemId(g), C.itemName(g)) : ''; }
  const KIND_IC = { auto: '🔨', auto1m: '⏳', recharge: '⚡', hands: '🙌', skip: '↻', bag: '👜', refill: '🍶' };
  function shCard(ic, name, sub, buy, cls) {
    return `<div class="sh-card${cls ? ' ' + cls : ''}"><div class="sh-ic">${ic}</div><div class="sh-txt"><b>${esc(name)}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="sh-buy">${buy}</div></div>`;
  }
  function shBtn(attrs, price, cur, dis, label) {
    return `<button type="button" class="sh-b${cur === 'gems' ? ' gem' : ''}" ${attrs} ${dis ? 'disabled' : ''}>${label != null ? label : `${cur === 'gems' ? GEM() : COIN()}${price}`}</button>`;
  }
  function shopBody() {
    const t = now(), m = C.shopMult(st), sh = st.shop;
    const left = (key, lim) => Math.max(0, lim - (sh.bought[key] | 0));
    if (shopTab === 'deal') {
      const f = D.SHOP.free[sh.free % D.SHOP.free.length];
      const free = shCard(f.token ? '🔨' : giveIcon(f.give), '오늘의 무료 선물', esc(f.label),
        shBtn('data-free="1"', 0, 'coins', sh.freeTaken, sh.freeTaken ? '받았어요' : '받기!'), 'free' + (sh.freeTaken ? ' done' : ''));
      const deals = sh.deals.map((d, k) => {
        const it = d.id === 'tier' ? null : D.SHOP.items[d.id];
        const g = d.id === 'tier' ? { k: 'item', c: d.c, t: d.t } : it.give;
        const nm = d.id === 'tier' ? `${C.itemName(g)} · ${d.t}단계` : it.name;
        const base = d.id === 'tier' ? D.SHOP.tierPrice[d.t] : C.itemCoins(st, d.id);
        const done = (sh.bought['deal' + k] | 0) > 0;
        const ic = g ? giveIcon(g) : `<span class="sh-emo">${KIND_IC[it.kind] || '🎁'}</span>`;
        return shCard(ic + `<i class="sh-off">-${Math.round(d.off * 100)}%</i>`, nm, `<s>${base}</s> → 오늘만 ${C.dealPrice(st, d)}${d.id === 'tier' ? ' · 부탁이 막혔을 때!' : it.sub ? ' · ' + esc(it.sub) : ''}`,
          shBtn(`data-deal="${k}"`, C.dealPrice(st, d), 'coins', done || st.coins < C.dealPrice(st, d), done ? '샀어요' : null), done ? 'done' : '');
      }).join('');
      return `${free}<h3>오늘의 특가 <small>매일 0시에 바뀌어요 · 칸마다 하루 1번</small></h3>${deals}
        <button type="button" class="btn sh-reroll" data-reroll="1" ${sh.rerolled || st.coins < D.SHOP.rerollCoins * m ? 'disabled' : ''}>${sh.rerolled ? '오늘은 다시 섞었어요' : `🔀 특가 다시 섞기 · ${COIN()}${D.SHOP.rerollCoins * m}`}</button>`;
    }
    if (shopTab === 'item') {
      const rows = C.shopChains(st).map((c) => {
        const ch = D.CHAINS[c];
        const bs = [1, 2, 3].map((tt) => {
          const g = { k: 'item', c, t: tt }, p = D.SHOP.tierPrice[tt];
          const lim = D.SHOP.tierDay[tt], l = lim ? left('tier' + tt, lim) : 1;
          return `<button type="button" class="sh-tier c-${c}" data-tier="${tt}" data-c="${c}" ${st.coins < p || !l ? 'disabled' : ''} aria-label="${esc(C.itemName(g))} ${tt}단계">${giveIcon(g)}<i class="tier">${tt}</i><b>${COIN()}${p}</b></button>`;
        }).join('');
        return `<div class="sh-row c-${c}"><span class="sh-cn">${esc(ch.name)}</span><div class="sh-tiers">${bs}</div></div>`;
      }).join('');
      const t3 = left('tier3', D.SHOP.tierDay[3]);
      const extra = ['wild', 'bj1', 'bj2', 'bj3'].map((id) => {
        const it = D.SHOP.items[id], p = C.itemCoins(st, id);
        const l = it.day ? left(id, it.day) : 1;
        return shCard(giveIcon(it.give), it.name, esc(it.sub) + (it.day ? ` · 동전은 하루 ${it.day}번` : ''),
          shBtn(`data-buy="${id}"`, p, 'coins', st.coins < p || !l, l ? null : '내일') + (it.gems ? shBtn(`data-buy="${id}" data-pay="gems"`, it.gems, 'gems', st.gems < it.gems) : ''));
      }).join('');
      return `<h3>열린 체인 물건 <small>1단계 6 · 2단계 14 · 3단계 32 (오늘 ${t3}개 남음)</small></h3>${rows}<h3>특별한 물건</h3>${extra}`;
    }
    if (shopTab === 'energy') {
      const list = ['en1', 'en2', 'en3'].map((id) => { const it = D.SHOP.items[id], p = C.itemCoins(st, id); return shCard(giveIcon(it.give), it.name, esc(it.sub), shBtn(`data-buy="${id}"`, p, 'coins', st.coins < p)); }).join('');
      const e = C.energyInfo(st, t), rp = C.refillPrice(st, t);
      const can = rp.left > 0 && !e.full && st.coins >= rp.price;
      const ref = shCard(artImg('energy', '기운'), '기운 가득 채우기', `+${D.BAL.refillAmount} · 오늘 ${rp.left}번 남음${e.full ? ' · 지금은 가득' : ''}`,
        shBtn('data-buy="refill"', rp.price, 'coins', !can, rp.left <= 0 ? '내일' : null));
      return `${ref}<h3>식혜 <small>판에 놓였다가 [마시기] · 최대를 넘겨 채울 수 있어요</small></h3>${list}`;
    }
    if (shopTab === 'help') {
      const plan = C.autoMergePlan(st, t);
      const tok = st.boost.autoTok | 0;
      const auto = shCard('<span class="sh-emo">🔨</span>', '자동 합치기', plan.n ? `지금 ${plan.n}번 합칠 수 있어요 · 부탁 물건은 남겨요` : '지금은 합칠 게 없어요',
        shBtn('data-auto="1"', plan.price, 'coins', !plan.n || (!tok && st.coins < plan.price), tok && plan.n ? `무료 ${tok}번` : plan.n ? null : '없음'));
      const one = (id, extra) => {
        const it = D.SHOP.items[id], p = C.itemCoins(st, id);
        let dis = st.coins < p, label = null;
        if (it.kind === 'recharge' && !C.restingGens(st, t).length) { dis = true; label = '쉬는 것 없음'; }
        if (it.kind === 'skip' && (st.skipAt || 0) + D.BAL.skipCooldownMs <= t) { dis = true; label = '기다림 없음'; }
        return shCard(`<span class="sh-emo">${KIND_IC[it.kind]}</span>`, it.name, esc(it.sub) + (extra || ''),
          shBtn(`data-buy="${id}"`, p, 'coins', dis, label) + (it.gems ? shBtn(`data-buy="${id}" data-pay="gems"`, it.gems, 'gems', st.gems < it.gems) : ''));
      };
      const am = st.boost.autoMs > 0 ? ` · <b>${mmss(st.boost.autoMs)} 남음</b>` : '';
      const hm = st.boost.handsMs > 0 ? ` · <b>${mmss(st.boost.handsMs)} 남음</b>` : '';
      const bp = C.bagPrice(st);
      const bag = shCard('<span class="sh-emo">👜</span>', '가방 한 칸', `지금 ${st.bag.length}칸 · 최대 ${D.BAL.bagMax}칸`, shBtn('data-buy="bag"', bp, 'coins', !bp || st.coins < bp, bp ? null : '가장 커요'));
      return auto + one('auto1m', am) + one('recharge') + one('hands', hm) + one('skipnow') + bag;
    }
    // 꾸미기: 그림이 들어오면 열려요
    return D.SHOP.deco.map((x) => shCard(`<span class="sh-emo">${x.ic}</span>`, x.name, `동전 ${esc(x.note)}`, '<button type="button" class="sh-b soon" disabled>곧 나와요</button>', 'soon')).join('')
      + '<p class="center muted">건물 모양·장식·하윤 옷·몽돌 소품은 그림이 준비되는 대로 여기에 들어와요</p>';
  }
  function shopHTML() {
    C.shopTouch(st, now());
    if (shopTab === 'energy' && st.settings.easy) shopTab = 'deal';
    const tabs = D.SHOP.tabs.filter((x) => !(x.id === 'energy' && st.settings.easy)).map((x) =>
      `<button type="button" class="sh-tab${x.id === shopTab ? ' on' : ''}" data-tab="${x.id}" aria-pressed="${x.id === shopTab}"><span>${x.ic}</span>${esc(x.name)}${x.id === 'deal' && !st.shop.freeTaken ? '<i class="dot"></i>' : ''}</button>`).join('');
    return `<div class="sh-head"><h2>상점</h2><div class="sh-money"><span>${COIN()}<b>${st.coins}</b></span><span>${GEM()}<b>${st.gems}</b></span></div></div>
      <div class="sh-tabs" role="tablist">${tabs}</div>
      <div class="sh-body">${shopBody()}</div>
      <p class="center muted sh-note">가격은 지금 지역에 맞춰요 (×${C.shopMult(st)}) · 산 물건은 판 빈칸에, 자리가 없으면 가방의 선물함에</p>
      <button type="button" class="btn" data-close="1">닫기</button>`;
  }
  function shopFail(r) {
    F.sfx('bad');
    const msg = { coins: `동전이 ${r.short || ''}개 모자라요`, gems: `소라별이 ${r.short || ''}개 모자라요`, limit: '오늘은 다 샀어요 · 내일 다시', norest: '쉬고 있는 발생기가 없어요',
      nocool: '지금은 바로 바꿀 수 있어요', max: '가방이 가장 커요', full: '기운이 가득해요', done: '오늘은 이미 했어요', gone: '지금은 살 수 없어요' }[r.reason];
    toast(msg || '살 수 없어요');
  }
  // 산 물건이 판에 톡 (상점 버튼에서 포물선) · 자리가 없으면 선물함
  function shopGot(r, label) {
    F.vibrate(14);
    if (r.cell) {
      if (r.at >= 0) { renderBoard(); arcIn(itEl(r.at), center($('btn-shop')), center(cellEl(r.at))); autoAfter(r.at, 420); }
      toast(`${label || C.itemName(r.cell)}${r.at >= 0 ? '! 판에 놓았어요' : ' · 판이 꽉 차서 가방의 선물함에'}`);
      F.sfx('discover');
    } else {
      F.sfx('deliver');
      const msg = { auto1m: '⏳ 자동 합치기 1분 시작! 새 물건이 짝을 만나면 저절로 합쳐져요', hands: '🙌 바쁜 손! 10분 동안 발생기 톡에 기운이 안 들어요',
        token: '🔨 자동 합치기 무료 1번! 판 오른쪽 아래 버튼', recharge: '⚡ 발생기가 다시 힘이 났어요', skip: '↻ 이제 [다른 부탁]을 바로 쓸 수 있어요', refill: '기운이 가득 찼어요!', bag: `가방이 ${st.bag.length}칸이 됐어요!` }[r.kind];
      toast(msg || '샀어요!');
      if (r.kind === 'refill') bump('hud-energy');
      if (r.kind === 'recharge' && r.gen) { renderBoard(); restartAnim(itEl(r.gen.at), 'pop'); flash([r.gen.at]); }
    }
    if (r.price) { bump(r.pay === 'gems' ? 'hud-coin' : 'hud-coin'); }
  }
  function openShop(tab) {
    if (tab) shopTab = tab;
    const re = () => { const b = $('sheet').querySelector('.sheet-box'); if (b) { const y = (b.querySelector('.sh-body') || {}).scrollTop || 0; b.innerHTML = shopHTML(); const nb = b.querySelector('.sh-body'); if (nb) nb.scrollTop = y; } };
    openSheet(shopHTML(), (b) => {
      F.unlock();
      const t = now();
      if (b.dataset.tab) { shopTab = b.dataset.tab; F.sfx('pick'); re(); return; }
      if (b.dataset.auto) { closeSheet(); openAuto(); return; }
      let r = null, label = '';
      if (b.dataset.free) { r = C.shopFree(st, t, rng); if (r.ok) label = r.free.label; }
      else if (b.dataset.reroll) { r = C.shopReroll(st, t); if (r.ok) { F.sfx('swap'); toast('특가를 새로 섞었어요'); } }
      else if (b.dataset.deal != null) r = C.shopBuy(st, { id: 'deal', slot: Number(b.dataset.deal) }, t, rng);
      else if (b.dataset.tier) r = C.shopBuy(st, { id: 'tier', c: b.dataset.c, t: Number(b.dataset.tier) }, t, rng);
      else if (b.dataset.buy) r = C.shopBuy(st, { id: b.dataset.buy, pay: b.dataset.pay || 'coins' }, t, rng);
      if (!r) return;
      if (!r.ok) { shopFail(r); return; }
      if (!b.dataset.reroll) shopGot(r, label);
      clearUndo();
      re(); renderAll(); changed();
    }, 'shop');
    $('sheet').querySelector('.sheet-box').classList.add('shop-box');
  }
  $('btn-shop').addEventListener('click', () => { F.unlock(); openShop(); });

  /* ---------- 🔨 자동 합치기 (merge_town.md §G) ---------- */
  function openAuto() {
    if (busy) return;
    const plan = C.autoMergePlan(st, now());
    if (!plan.n) { F.sfx('bad'); toast('합칠 게 없어요 · 부탁에 쓸 물건과 고정한 물건은 남겨 둬요'); restartAnim($('btn-auto'), 'wig1'); return; }
    const tok = st.boost.autoTok | 0;
    const can = tok > 0 || st.coins >= plan.price;
    openSheet(`<h2>자동 합치기</h2>
      <div class="big-num"><span class="am-big">🔨</span><span>${plan.n}번 합쳐요</span></div>
      <p class="center muted">같은 물건 2개씩 판 전체를 한 번에 · 결과가 또 짝이면 이어서<br>부탁 카드에 필요한 물건 · 발생기 · 최고 단계 · 📌 고정한 물건은 그대로</p>
      <button type="button" class="btn main" data-go="1" ${can ? '' : 'disabled'}>${tok > 0 ? `무료로 합치기 (남은 무료 ${tok}번)` : `합치기 · ${COIN()}${plan.price}`}</button>
      ${!can ? `<p class="center muted">동전이 ${plan.price - st.coins}개 모자라요</p>` : ''}
      <button type="button" class="btn" data-close="1">그만두기</button>`,
    (b) => { if (b.dataset.go) { closeSheet(); runAuto(); } });
  }
  function runAuto() {
    const snap = C.snapshot(st);
    const r = C.autoMergeBuy(st, now(), {});
    if (!r.ok) { F.sfx('bad'); toast(r.reason === 'coins' ? `동전이 ${r.short}개 모자라요` : '합칠 게 없어요'); return; }
    busy = true; sel = -1; clearHint();
    F.sfx('auto');
    if (r.price) { countUp('coins', st.coins); bump('hud-coin'); }
    const iv = F.reduced ? 0 : Math.max(30, Math.min(80, 1500 / r.steps.length));
    let k = 0;
    const next = () => {
      if (k >= r.steps.length) {
        busy = false;
        setUndo(snap, `자동으로 ${r.n}번 합쳤어요${r.token ? ' (무료)' : r.price ? ` · 동전 ${r.price}` : ''}`);
        renderAll(); changed();
        return;
      }
      const s = r.steps[k];
      flyMerge(s.from, s.to);
      const m = C.move(st, s.from, s.to, now());
      renderBoard();
      if (m.kind === 'merge') afterMerge(m, Math.min(12, 2 + Math.floor(k / 2)));
      k++;
      setTimeout(next, iv);
    };
    renderBoard();
    next();
    renderOrders(); renderInfo();
  }
  $('btn-auto').addEventListener('click', () => { F.unlock(); openAuto(); });

  /* ---------- 도우미 남은 시간 (위 칸 아래 모래시계 막대) ---------- */
  let boostAt = now();
  function boostTickUI() {
    const t = now(), dt = Math.min(2000, t - boostAt);
    boostAt = t;
    if (document.hidden) return;   // 앱을 닫거나 숨기면 멈춰요 (남은 시간 저장)
    const was = C.boostTick(st, dt);
    renderBoost();
    if (was) {
      changed();
      if (!(st.boost.autoMs > 0) && !(st.boost.handsMs > 0)) { toast('도우미 시간이 끝났어요'); renderBoard(); }
    }
  }
  function renderBoost() {
    const b = st.boost, el = $('boost');
    const bits = [];
    if (b.autoMs > 0) bits.push(`<span class="bst auto"><i>⏳</i>자동 합치기 ${mmss(b.autoMs)}<em style="width:${Math.min(100, (b.autoMs / D.SHOP.auto1mMs) * 100)}%"></em></span>`);
    if (b.handsMs > 0) bits.push(`<span class="bst hands"><i>🙌</i>바쁜 손 ${mmss(b.handsMs)}<em style="width:${Math.min(100, (b.handsMs / D.SHOP.handsMs) * 100)}%"></em></span>`);
    el.classList.toggle('hide', !bits.length);
    el.innerHTML = bits.join('');
  }

  function settingsHTML(confirmReset) {
    const tg = (k, label, sub) => `<div class="row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><button type="button" class="tg${st.settings[k] ? ' on' : ''}" data-tg="${k}" aria-pressed="${!!st.settings[k]}" aria-label="${label}"></button></div>`;
    const vol = (k, label) => `<div class="row slider"><span>${label}</span><input type="range" min="0" max="100" step="5" value="${st.settings[k] | 0}" data-range="${k}" aria-label="${label}"><b class="rv" data-rv="${k}">${st.settings[k] | 0}</b></div>`;
    return `<h2>설정</h2>
      ${tg('sfx', '효과음')}
      ${st.settings.sfx ? vol('vol', '효과음 크기') : ''}
      ${tg('bgm', '배경음악', '가야금·피리 곡 · 지역·낮밤마다 달라요')}
      ${st.settings.bgm ? vol('bgmVol', '배경음악 크기') : ''}
      ${st.settings.bgm ? tg('quietNight', '조용한 밤 모드', '늘 잔잔한 밤 곡만') : ''}
      ${tg('autoKeep', '자동 합치기: 부탁 물건 남기기', '부탁 카드에 필요한 물건은 안 합쳐요')}
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
      } else if (b.dataset.sync) {
        syncAction(b.dataset.sync, re);
      } else if (b.dataset.reset) {
        if (!armed) { armed = true; F.sfx('bad'); re(); return; }
        st = C.newState(now(), rng);
        sel = -1; wasReady = {}; shown.reset(st);
        $('orders').innerHTML = '';
        saver.dirty = true; saver.flush();
        closeSheet(); renderAll();
        toast('새로 시작해요!');
        playIntro();
      }
    });
    // 크기 슬라이더: 끄는 동안 바로 들리게 · 손을 떼면 저장
    $('sheet').oninput = (e) => {
      const r = e.target.closest && e.target.closest('input[data-range]');
      if (!r) return;
      const k = r.dataset.range;
      st.settings[k] = Math.max(0, Math.min(100, Number(r.value) || 0));
      const lab = $('sheet').querySelector(`[data-rv="${k}"]`); if (lab) lab.textContent = st.settings[k];
      syncFx();
      if (k === 'vol') { clearTimeout(volT); volT = setTimeout(() => F.sfx('merge', 3), 60); }
      changed();
    };
  }
  let volT = 0;
  $('btn-set').addEventListener('click', () => { F.unlock(); openMenu(); });
  function syncFx() {
    const t = st.settings;
    F.setOpt({ sfx: !!t.sfx, vib: !!t.vib, vol: t.vol | 0, bgm: !!t.bgm, bgmVol: t.bgmVol | 0, calm: !!t.calm });
    musicTick();
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
        F.jingle('attend'); F.vibrate([10, 30, 10]);
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
  function openEvent() { openSheet(eventHTML(), withBack(null), 'event'); musicTick(); }

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
      ${album}${replayHTML()}${backBtn}`;
  }
  // 이야기 다시 보기 (본 장면 · 건너뛴 장면 모두) · 이름: 작업·지역·이야기 부탁에서
  function sceneTitle(id) {
    if (id === 'intro') return '처음 소라섬에';
    if (id === 'ending') return '첫 등불 바다 축제';
    for (const a of D.AREAS) {
      if (a.open.scene === id) return `${a.name} 도착`;
      if (a.done.scene === id) return `${a.name} 복원`;
      const t = a.tasks.find((x) => x.scene === id);
      if (t) return t.name;
    }
    const so = Object.keys(D.STORY_ORDERS).find((k) => D.STORY_ORDERS[k].scene === id);
    return so ? D.STORY_ORDERS[so].title : id;
  }
  function replayHTML() {
    const ids = (st.seen.intro ? ['intro'] : []).concat(Object.keys(D.STORY).filter((id) => id !== 'intro' && st.story[id]));
    if (!ids.length) return '';
    return `<h3>이야기 다시 보기 <small>건너뛴 장면도 여기서 볼 수 있어요</small></h3><div class="replay">${ids.map((id) =>
      `<button type="button" class="rp-b${st.story[id] === 'skip' ? ' skipped' : ''}" data-replay="${esc(id)}">${esc(sceneTitle(id))}${st.story[id] === 'skip' ? '<small>건너뜀</small>' : ''}</button>`).join('')}</div>`;
  }
  function openLetters() {
    openSheet(lettersHTML(), withBack((b) => {
      const id = b.dataset.replay;
      if (!id || !D.STORY[id]) return;
      closeSheet();
      talk(D.STORY[id], (skipped) => { if (!skipped && st.story[id] === 'skip') { st.story[id] = true; changed(); } }, { song: id === 'intro' ? 'title' : 'story' });
    }));
  }

  /* ---------- 이야기 대사창 (톡해서 넘김) ---------- */
  //  done(skipped) · opts.song: 이 장면에서 틀 곡 (기본 'story')
  let talkSong = '';
  function talk(lines, done, opts) {
    const box = $('talk');
    let k = 0, typing = 0, full = '';
    talkSong = (opts && opts.song) || 'story';
    F.talkDuck(true);
    const finish = (skipped) => {
      clearInterval(typing); typing = 0;
      box.classList.add('hide'); box.innerHTML = ''; box.onclick = null;
      talkSong = ''; F.talkDuck(false); musicTick();
      if (done) done(!!skipped);
    };
    const typeOut = () => {
      const el = box.querySelector('.talk-txt');
      if (!el) return;
      if (F.reduced) { el.textContent = full; return; }
      let n = 0;
      el.textContent = '';
      clearInterval(typing);
      typing = setInterval(() => {
        n += 1;
        el.textContent = full.slice(0, n);
        if (n >= full.length) { clearInterval(typing); typing = 0; }
      }, 26);
    };
    const show = () => {
      const l = lines[k];
      const v = D.VILLAGERS[l.who] || D.VILLAGERS.hayun;
      const s = faceSrc(v, l.face) || (v.faces && A.src(v.faces.joy)) || '';
      const right = l.who !== 'hayun' && !v.letter;
      const pic = l.pic && A.src(l.pic);
      box.classList.toggle('has-pic', !!pic);
      box.innerHTML = (pic ? `<div class="talk-pic"><img src="${esc(pic)}" alt="" draggable="false"></div>` : '') + `<div class="talk-box${v.letter ? ' letter' : ''}${right ? ' right' : ''}${l.face === 'joy' ? ' joy' : ''}" style="--fc:${esc(v.color)}">
        <div class="talk-face${s ? '' : ' none'}">${s ? `<img src="${esc(s)}" alt="" draggable="false">` : esc(v.letter ? '✉' : v.name[0])}</div>
        <div class="talk-name">${esc(v.name)}</div><div class="talk-txt">${esc(l.text)}</div><div class="talk-next">${k + 1} / ${lines.length} · 톡 ▶</div></div>
        <button type="button" class="talk-skip" aria-label="이 장면 건너뛰기">건너뛰기 ▶▶</button>`;
      full = l.text;
      typeOut();
      if (l.who === 'mongdol') F.sfx('spawn');
    };
    show();
    box.classList.remove('hide');
    musicTick();
    box.onclick = (e) => {
      F.unlock();
      // 건너뛰기: 장면 전체를 한 번에 끝내요 (보상·다음 진행은 그대로 · 확인창 없음)
      if (e.target.closest && e.target.closest('.talk-skip')) { F.sfx('close'); finish(true); return; }
      F.sfx('pick');
      if (typing) { clearInterval(typing); typing = 0; const el = box.querySelector('.talk-txt'); if (el) el.textContent = full; return; }   // 한 자씩 나오는 중이면 줄 전체 먼저
      k++;
      if (k < lines.length) show();
      else finish(false);
    };
  }
  function playIntro() {
    talk(D.STORY.intro, () => {
      st.seen.intro = true; changed();
      const g = st.board.findIndex((c) => c && c.k === 'gen');
      if (g >= 0) flash([g]);
      setTimeout(maybeDaily, 1200);
    }, { song: 'title' });
  }

  /* ---------- 배경음악: 지금 화면에 맞는 곡 (1초마다 · 화면이 바뀔 때) ---------- */
  //  대사 → 이야기 곡(시작 이야기는 title) · 마을 → 보고 있는 지역 곡 · 이벤트 화면 → 이벤트 곡 · 그 밖 → 판 곡(낮/밤)
  //  밤 = 기기 시각 19시~6시 · '조용한 밤 모드'면 늘 밤 곡
  const isNight = () => { const h = new Date().getHours(); return h >= 19 || h < 6; };
  function musicCtx() {
    const qn = !!st.settings.quietNight, night = qn || isNight();
    if (!$('talk').classList.contains('hide') && talkSong) return [talkSong, false];
    if (!$('town').classList.contains('hide')) {
      if (qn) return ['board_night', false];
      const i = window.MergeTown && window.MergeTown.index != null ? window.MergeTown.index : Math.min(st.area, D.AREAS.length - 1);
      return ['town_r' + (Math.max(0, Math.min(5, i)) + 1), night];
    }
    if (sheetKind === 'event' && !qn) return ['event', false];
    return [night ? 'board_night' : 'board_day', false];
  }
  function musicTick() {
    if (!MU) return;
    const [id, night] = musicCtx();
    MU.play(id, { night });
  }

  /* ---------- 힌트 (가만히 10초) ---------- */
  function clearHint() {
    if (!hintOn) return;
    hintOn = false;
    Array.prototype.forEach.call(document.querySelectorAll('.it.hint'), (e) => e.classList.remove('hint'));
  }
  function tick() {
    dailyEventTick();
    boostTickUI();
    musicTick();
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

  function renderAll() { renderHud(); renderOrders(); renderBoard(); renderInfo(); renderNav(); renderMenuBadge(); renderBoost(); }

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
    sel = -1; wasReady = {}; shown.reset(st); clearUndo();
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
    document.querySelectorAll('img[data-art]').forEach((im) => {
      const s = A.src(im.dataset.art);
      if (s) im.src = s;
      else { const sp = document.createElement('span'); sp.className = 'nav-ic'; sp.textContent = im.classList.contains('nav-img') ? '🛍️' : '•'; im.replaceWith(sp); }
    });
    // 첫 톡(아무 데나)에서 소리를 깨워요 → 배경음악이 2초에 걸쳐 살며시 (브라우저는 사용자 동작 전엔 소리를 막아요)
    document.addEventListener('pointerdown', () => { F.unlock(); musicTick(); }, true);
    document.addEventListener('keydown', () => { F.unlock(); musicTick(); }, true);
    buildBoard();
    renderAll();
    layout();
    F.attach($('fx'));
    setTimeout(layout, 400);   // 글꼴을 다 읽은 뒤 한 번 더 (높이가 달라질 수 있어요)
    try { document.fonts.ready.then(layout); } catch (e) { /* 무시 */ }
    A.preload(Object.keys(A.FILES).filter((id) => !/^r\d_|^story_|^title$|^board$|_banner$|_deco$/.test(id)));
    setInterval(tick, 1000);
    dailyEventTick();
    C.shopTouch(st, now());
    musicTick();
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
    openShop, openAuto, runAuto, musicTick, autoAfter, arcIn,
    get busy() { return busy; }
  };
})();
