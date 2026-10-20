/* 아리채 오락실 · 도블 화면 (같은 그림 찾기 · 탑 쌓기)
   - 위: 다른 사람 (모은 카드 수 · 틀려서 쉬는 중이면 ❄)
   - 가운데: 가운데 카드 (모두 같은 카드)
   - 아래: 내 카드 — 두 카드에 같이 있는 그림을 먼저 누르면 가운데 카드가 내 카드 위로 와요
   그림은 이모지 57개. 같은 카드는 누구 화면에서나 같은 모양으로 놓여요 (판 번호 seed + 카드 번호로 배치) */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SYM = [
    ['🍎', '사과'], ['🍌', '바나나'], ['🍇', '포도'], ['🍓', '딸기'], ['🍉', '수박'], ['🍒', '체리'], ['🍋', '레몬'], ['🍍', '파인애플'],
    ['🥕', '당근'], ['🌽', '옥수수'], ['🍄', '버섯'], ['🌵', '선인장'], ['🌻', '해바라기'], ['🌹', '장미'], ['🍀', '네잎클로버'], ['🌙', '달'],
    ['⭐', '별'], ['⚡', '번개'], ['🔥', '불'], ['💧', '물방울'], ['🌈', '무지개'], ['🎈', '풍선'], ['🎁', '선물'], ['🎵', '음표'],
    ['🔔', '종'], ['🔑', '열쇠'], ['⏰', '시계'], ['💡', '전구'], ['⚓', '닻'], ['🚗', '자동차'], ['🚲', '자전거'], ['🚀', '로켓'],
    ['⛵', '돛단배'], ['🏠', '집'], ['🐶', '강아지'], ['🐱', '고양이'], ['🐰', '토끼'], ['🐻', '곰'], ['🐼', '판다'], ['🐸', '개구리'],
    ['🐵', '원숭이'], ['🐧', '펭귄'], ['🐔', '닭'], ['🐢', '거북이'], ['🐟', '물고기'], ['🐙', '문어'], ['🦋', '나비'], ['🐞', '무당벌레'],
    ['🐘', '코끼리'], ['🦁', '사자'], ['❤️', '하트'], ['👀', '눈'], ['👻', '유령'], ['⛄', '눈사람'], ['⚽', '축구공'], ['🎲', '주사위'],
    ['🍦', '아이스크림']
  ];
  const FREEZE_MS = 1500;

  // 같은 seed 면 같은 수열 (mulberry32)
  function rand(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // 카드 한 장의 그림 배치: 가운데 1 + 둘레 7. 크기는 들쭉날쭉, 조금씩 돌려 놓아요
  const SIZES = [0.56, 0.5, 0.46, 0.42, 0.4, 0.36, 0.33, 0.3];
  function layout(seed, card) {
    const r = rand((seed ^ Math.imul(card + 1, 2654435761)) >>> 0);
    const sizes = SIZES.slice().sort(() => r() - 0.5);
    const rot0 = r() * Math.PI * 2;
    const out = [];
    for (let k = 0; k < 8; k++) {
      let x = 0; let y = 0; let s = sizes[k];
      if (k === 0) { x = (r() - 0.5) * 0.06; y = (r() - 0.5) * 0.06; } else {
        const a = rot0 + (k - 1) * (Math.PI * 2 / 7) + (r() - 0.5) * 0.12;
        const rad = 0.6 + (r() - 0.5) * 0.05;
        x = Math.cos(a) * rad; y = Math.sin(a) * rad;
        s = Math.min(s, 0.5);
      }
      out.push({ x, y, s, rot: Math.round((r() - 0.5) * 160) });
    }
    return out;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="db">
      <div class="db-riv"></div>
      <div class="db-cards">
        <div class="db-slot db-center-slot"><div class="db-card db-center"></div><div class="db-tag db-left"></div></div>
        <div class="db-banner"></div>
        <div class="db-slot db-mine-slot"><div class="db-card db-mine"></div><div class="db-tag db-mytag"></div></div>
      </div>
      <div class="db-count disp"></div>
      <div class="db-fx"></div>
    </div>`;
    const $ = (s) => el.querySelector(s);
    let v = null;
    let shownNo = -1;          // 그려 놓은 가운데 카드 차례
    let showKey = '';          // 'show' 연출을 이미 시작했나
    let myFreezeUntil = 0;
    let pending = false;       // 맞는 그림을 눌러서 서버 답을 기다리는 중
    const timers = [];
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); return t; };

    // 카드 크기: 화면 높이에 맞춰 두 장이 다 들어오게
    function fit() {
      const box = $('.db-cards');
      const w = box.clientWidth; const h = box.clientHeight;
      const d = Math.max(150, Math.min(w - 12, (h - 46) / 2 - 22, 420));
      el.querySelector('.db').style.setProperty('--d', `${Math.floor(d)}px`);
    }
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(el); } else window.addEventListener('resize', fit);
    fit();

    function cardHTML(card, syms, mark) {
      if (card == null || !syms) return '<div class="db-back">?</div>';
      const L = layout(v.seed, card);
      return syms.map((s, k) => {
        const p = L[k];
        const cls = mark && mark[s] ? ' ' + mark[s] : '';
        return `<button type="button" class="db-sym${cls}" data-s="${s}" aria-label="${esc(SYM[s] ? SYM[s][1] : '')}"
          style="left:${50 + p.x * 50}%;top:${50 + p.y * 50}%;--s:${p.s};--r:${p.rot}deg"><span>${SYM[s] ? SYM[s][0] : '?'}</span></button>`;
      }).join('');
    }
    const answer = () => (v && v.mineSyms && v.centerSyms ? v.mineSyms.find((s) => v.centerSyms.includes(s)) : -1);

    function drawRivals() {
      const now = api.now();
      const winner = v.phase === 'show' && v.last ? v.last.who : -2;
      $('.db-riv').innerHTML = v.seats.map((s, i) => {
        if (i === v.me) return '';
        const info = api.seat(i);
        return `<div class="db-r${winner === i ? ' win' : ''}${s.frozen > now ? ' frozen' : ''}${info.off ? ' off' : ''}" data-seat="${i}">
          <span class="av">${info.av}</span><span class="db-r-nm">${esc(info.name)}</span><b class="db-r-n disp">${s.n}</b></div>`;
      }).join('');
    }
    function drawTags() {
      $('.db-left').textContent = v.phase === 'count' ? '' : '가운데 카드';
      const mine = v.me != null ? v.seats[v.me] : null;
      $('.db-mytag').innerHTML = mine ? `내 카드 · 모은 카드 <b>${mine.n}</b>장` : '구경하는 중';
    }
    function banner(html, cls) {
      const b = $('.db-banner');
      b.className = 'db-banner show' + (cls ? ' ' + cls : '');
      b.innerHTML = html;
    }
    function hideBanner() { $('.db-banner').className = 'db-banner'; }

    function drawCountdown() {
      const c = $('.db-count');
      if (v.phase === 'count' || (v.phase === 'play' && api.now() < v.at)) {
        const s = Math.max(1, Math.ceil((v.at - api.now()) / 1000));
        c.textContent = s; c.classList.add('show');
        later(() => { if (v) { drawCountdown(); if (v.phase === 'play' && api.now() >= v.at) drawPlay(true); } }, Math.min(1000, Math.max(30, v.at - api.now() - (s - 1) * 1000)));
      } else c.classList.remove('show');
    }

    function drawPlay(fresh) {
      const hidden = api.now() < v.at;
      const cen = $('.db-center');
      cen.className = 'db-card db-center' + (fresh ? ' pop' : '');
      cen.style.transform = '';
      cen.innerHTML = hidden ? '<div class="db-back">?</div>' : cardHTML(v.center, v.centerSyms);
      const mine = $('.db-mine');
      mine.className = 'db-card db-mine' + (myFreezeUntil > api.now() ? ' frozen' : '');
      mine.innerHTML = v.me == null ? '<div class="db-back">👀</div>' : hidden ? '<div class="db-back">?</div>' : cardHTML(v.mine, v.mineSyms);
      if (fresh && !hidden) api.sfx('pop');
    }

    function startShow() {
      const L = v.last;
      const me = v.me;
      pending = false;
      const cen = $('.db-center');
      const mine = $('.db-mine');
      if (L.who >= 0 && L.who === me) {
        // 내가 찾았어요: 두 카드의 그 그림을 빛나게 → 가운데 카드가 내 카드 위로
        const s = L.sym;
        cen.innerHTML = cardHTML(L.card, v.centerSyms, { [s]: 'hit' });
        mine.innerHTML = cardHTML(v.prev, v.prevSyms, { [s]: 'hit' });
        mine.className = 'db-card db-mine';
        streak = lastWinNo === L.no - 1 ? streak + 1 : 1;
        lastWinNo = L.no;
        banner(`${SYM[s][0]} ${esc(SYM[s][1])} <small>${(L.ms / 1000).toFixed(1)}초</small>`, 'good');
        cheer(cen.querySelector(`.db-sym[data-s="${s}"]`), L.ms);
        api.sfx('perfect'); api.vibrate([30, 30, 60]);
        later(() => {
          const a = cen.getBoundingClientRect(); const b = mine.getBoundingClientRect();
          cen.classList.add('fly');
          cen.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px)`;
        }, 650);
        later(() => {
          cen.className = 'db-card db-center gone'; cen.style.transform = '';
          mine.innerHTML = cardHTML(v.mine, v.mineSyms);
          mine.classList.add('land');
        }, 1150);
      } else {
        // 다른 사람이 찾았거나 아무도 못 찾았어요: 그 그림 + 내가 찾았어야 할 그림을 보여 줘요
        const mark = {};
        if (v.ans != null) mark[v.ans] = 'miss';
        if (L.who >= 0 && L.sym != null) mark[L.sym] = (mark[L.sym] ? mark[L.sym] + ' ' : '') + 'other';
        cen.innerHTML = cardHTML(L.card, v.centerSyms, mark);
        if (v.me != null) mine.innerHTML = cardHTML(v.mine, v.mineSyms, v.ans != null ? { [v.ans]: 'miss' } : null);
        mine.className = 'db-card db-mine';
        if (L.who >= 0) {
          const info = api.seat(L.who);
          banner(`<span class="av">${info.av}</span><b>${esc(info.name)}</b> ${SYM[L.sym] ? SYM[L.sym][0] : ''} 찾았어요${v.ans != null ? ` <small>내 정답: ${SYM[v.ans][0]} ${esc(SYM[v.ans][1])}</small>` : ''}`, 'other');
          api.sfx('soft');
          later(() => {
            const chip = el.querySelector(`.db-r[data-seat="${L.who}"]`);
            if (!chip) { cen.className = 'db-card db-center gone'; return; }
            const a = cen.getBoundingClientRect(); const b = chip.getBoundingClientRect();
            cen.classList.add('fly', 'away');
            cen.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.12)`;
          }, 750);
        } else {
          banner(`아무도 못 찾았어요${v.ans != null ? ` · 정답 ${SYM[v.ans][0]} ${esc(SYM[v.ans][1])}` : ''}`, 'other');
          later(() => { cen.className = 'db-card db-center gone'; }, 900);
        }
      }
    }

    // 찾을 때마다 신나는 한마디 + 반짝이 (눌러지지 않는 그림이라 게임을 가리지 않아요, 1초 안에 사라져요)
    const CHEERS = ['아싸!', '따봉! 👍', '아자!', '오예!', '나이스!', '찾았다!', '대박!', '굿굿!', '앗싸라비아!', '천재다!'];
    const FAST = ['번개 손! ⚡', '눈 깜짝할 새!', '초스피드!'];
    let streak = 0; let lastWinNo = -9;
    function cheer(symEl, ms) {
      const fx = $('.db-fx');
      const box = fx.getBoundingClientRect();
      let x = box.width / 2; let y = box.height * 0.3;
      if (symEl) { const r = symEl.getBoundingClientRect(); x = r.left + r.width / 2 - box.left; y = r.top + r.height / 2 - box.top; }
      let word = ms < 1500 ? FAST[Math.floor(Math.random() * FAST.length)] : CHEERS[Math.floor(Math.random() * CHEERS.length)];
      if (streak >= 3) word = `${streak}연속! 🔥`;
      else if (streak === 2) word = '연속 두 번! ✌';
      const w = document.createElement('div');
      w.className = 'db-cheer disp' + (streak >= 3 ? ' hot' : '');
      w.textContent = word;
      w.style.left = `${Math.min(box.width - 70, Math.max(70, x))}px`; w.style.top = `${y}px`;
      fx.appendChild(w);
      const bits = ['⭐', '✨', '💥', '🎉', '💛', '⭐', '✨', '🌟'];
      for (let k = 0; k < 10; k++) {
        const b = document.createElement('i');
        b.className = 'db-bit';
        b.textContent = bits[k % bits.length];
        const a = (k / 10) * Math.PI * 2 + Math.random() * 0.5;
        const d = 50 + Math.random() * 50;
        b.style.left = `${x}px`; b.style.top = `${y}px`;
        b.style.setProperty('--dx', `${Math.cos(a) * d}px`); b.style.setProperty('--dy', `${Math.sin(a) * d}px`);
        fx.appendChild(b);
      }
      setTimeout(() => { fx.innerHTML = ''; }, 1100);
    }

    function render(view) {
      const prevPhase = v && v.phase;
      v = view;
      drawRivals();
      drawTags();
      if (v.phase === 'count') {
        $('.db-center').innerHTML = '<div class="db-back">?</div>';
        $('.db-mine').innerHTML = '<div class="db-back">?</div>';
        hideBanner();
        drawCountdown();
        return;
      }
      if (v.phase === 'play') {
        if (shownNo !== v.no) {
          timers.forEach(clearTimeout); timers.length = 0;
          shownNo = v.no; pending = false; hideBanner();
          drawPlay(true);
          drawCountdown();
        } else {
          // 같은 카드 (누가 틀려서 얼었다 등) — 내 얼음만 맞춰요
          const f = v.me != null ? v.seats[v.me].frozen : 0;
          if (f > api.now() && myFreezeUntil < f) freezeMe(f);
        }
        return;
      }
      if (v.phase === 'show' && v.last) {
        const k = `${v.no}`;
        if (showKey !== k) { showKey = k; timers.forEach(clearTimeout); timers.length = 0; startShow(); }
        return;
      }
      if (v.phase === 'done' && prevPhase !== 'done') hideBanner();
    }

    function freezeMe(until) {
      myFreezeUntil = until;
      const mine = $('.db-mine');
      mine.classList.add('frozen');
      $('.db-card.db-center').classList.add('frozen');
      banner('앗, 아니에요! <small>잠깐 쉬어요 ❄</small>', 'bad');
      later(() => {
        if (api.now() >= myFreezeUntil) {
          el.querySelectorAll('.db-card.frozen').forEach((c) => c.classList.remove('frozen'));
          if (v && v.phase === 'play') hideBanner();
        }
      }, Math.max(50, until - api.now()));
    }

    // 누르자마자 반응하게 pointerdown 으로
    el.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.db-sym');
      if (!b || !v || v.phase !== 'play' || v.me == null || pending) return;
      if (api.now() < v.at || api.now() < myFreezeUntil) return;
      e.preventDefault();
      const s = Number(b.dataset.s);
      api.act({ k: 'tap', no: v.no, s });
      if (s === answer()) {
        pending = true;
        el.querySelectorAll(`.db-sym[data-s="${s}"]`).forEach((x) => x.classList.add('press'));
      } else {
        b.classList.add('wrong');
        api.sfx('bad'); api.vibrate([25, 25, 25]);
        freezeMe(api.now() + FREEZE_MS);
      }
    });

    return {
      render,
      tick() { if (v) drawRivals(); },
      destroy() { timers.forEach(clearTimeout); if (ro) ro.disconnect(); el.innerHTML = ''; },
      _answer: answer
    };
  }

  const ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#F2762E"/><circle cx="20" cy="20" r="15.5" fill="#FFF8EC" stroke="#B5461A" stroke-width="1.6"/>
    <text x="13.5" y="17" font-size="10" text-anchor="middle">🐶</text><text x="26" y="16.5" font-size="8" text-anchor="middle">⭐</text><text x="20" y="29.5" font-size="11" text-anchor="middle">🍎</text></svg>`;

  C.register({
    id: 'dobble',
    kind: 'table',
    icon: ICON,
    rulesText: '어떤 두 카드든 같은 그림이 딱 하나! · 내 카드와 가운데 카드에 같이 있는 그림을 먼저 누르면 가운데 카드를 가져와요 · 틀리면 1.5초 쉬어요 · 카드를 가장 많이 모으면 1등',
    learn: '카드 57장에 그림이 8개씩 있는데 어떤 두 장을 골라도 같은 그림이 꼭 하나뿐이에요. "사영평면"이라는 수학으로 만든 거예요 — 카드는 직선, 그림은 점이고, 두 직선은 꼭 한 점에서 만나죠!',
    bar(v) { return v.phase === 'count' ? '<span class="cd-info">곧 시작해요!</span>' : `<span class="cd-info">남은 카드 <b>${v.left}</b>/${v.total}장</span>${v.me != null ? `<span class="cd-info">내 카드 <b>${v.seats[v.me].n}</b>장</span>` : ''}`; },
    rankLabel(v, i) { return v && v.seats[i] ? `${v.seats[i].n}장${v.seats[i].wrong ? ` · 틀림 ${v.seats[i].wrong}` : ''}` : ''; },
    mount,
    SYM, layout
  });
})();
