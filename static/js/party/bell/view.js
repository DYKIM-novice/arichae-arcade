/* 아리채 오락실 · 할리갈리 화면
   - 위: 다른 사람 (덮은 카드 수 · 펼친 맨 위 카드)
   - 가운데: 종! 같은 과일이 딱 5개면 먼저 눌러요 (누르자마자 반응하게 pointerdown)
   - 아래: 내 펼친 카드 + 내 카드 더미 (내 차례면 눌러서 뒤집기) */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FRUIT = ['🍓', '🍌', '🍋', '🍇'];
  const FCOL = ['#E8263B', '#F2B705', '#9ACD32', '#8E44AD'];
  // 과일 1~5개 배치 (주사위처럼)
  const SPOTS = {
    1: [[50, 50]], 2: [[30, 30], [70, 70]], 3: [[25, 25], [50, 50], [75, 75]],
    4: [[30, 30], [70, 30], [30, 70], [70, 70]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]]
  };
  function cardHTML(top, cls) {
    if (!top) return `<div class="bl-card empty${cls ? ' ' + cls : ''}"></div>`;
    const [f, n] = top;
    return `<div class="bl-card${cls ? ' ' + cls : ''}" style="--fc:${FCOL[f]}">${SPOTS[n].map(([x, y]) => `<span style="left:${x}%;top:${y}%">${FRUIT[f]}</span>`).join('')}</div>`;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="bl">
      <div class="bl-top"><span class="bl-clock disp"></span></div>
      <div class="bl-opps"></div>
      <div class="bl-mid"><button type="button" class="bl-bell" aria-label="종 치기"><span class="bl-dome"></span><span class="bl-base"></span><b class="disp">딩!</b></button><div class="bl-msg"></div></div>
      <div class="bl-me"><div class="bl-mypile"></div><button type="button" class="bl-deck"></button></div>
      <div class="bl-count disp"></div>
    </div>`;
    const $ = (s) => el.querySelector(s);
    let v = null; let lastEv = 0; let msgT = 0; let flipKey = '';

    function oppHTML(i) {
      const s = api.seat(i);
      const turn = v.turn === i && v.phase === 'play';
      return `<div class="bl-op${turn ? ' turn' : ''}${!v.deck[i] ? ' empty' : ''}" data-seat="${i}"><div class="bl-oh"><span class="av">${s.av}</span><b>${esc(s.name)}</b><span class="bl-n">🂠 ${v.deck[i]}</span></div>
        ${cardHTML(v.top[i], flipKey === `${i}` ? 'flip' : '')}</div>`;
    }
    function msg(html, cls) {
      const m = $('.bl-msg');
      m.innerHTML = html; m.className = `bl-msg show ${cls || ''}`;
      clearTimeout(msgT); msgT = setTimeout(() => { m.className = 'bl-msg'; }, 1600);
    }
    function draw() {
      const me = v.me;
      const n = v.deck.length;
      const others = me == null ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: n - 1 }, (_, k) => (me + k + 1) % n);
      $('.bl-opps').innerHTML = others.map(oppHTML).join('');
      $('.bl-opps').dataset.n = others.length;
      if (me != null) {
        const mine = v.turn === me && v.phase === 'play';
        $('.bl-mypile').innerHTML = cardHTML(v.top[me], `big${flipKey === `${me}` ? ' flip' : ''}`);
        const d = $('.bl-deck');
        d.className = `bl-deck${mine ? ' turn' : ''}${!v.deck[me] ? ' none' : ''}`;
        d.innerHTML = `<span class="bl-back"></span><b>${v.deck[me]}장</b><small>${mine ? '눌러서 뒤집기!' : v.deck[me] ? '' : '카드 없음 · 종은 칠 수 있어요'}</small>`;
      } else { $('.bl-mypile').innerHTML = ''; $('.bl-deck').innerHTML = '<small>구경 중</small>'; }
      tick();
    }
    function tick() {
      if (!v) return;
      const now = api.now();
      const left = Math.max(0, (v.endAt || 0) - Math.max(now, v.start));
      $('.bl-clock').textContent = `⏱ ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
      const c = $('.bl-count');
      if (now < v.start) { c.textContent = Math.ceil((v.start - now) / 1000); c.classList.add('show'); } else c.classList.remove('show');
    }

    function render(view) {
      const prev = v;
      v = view;
      const evs = (v.events || []).filter((e) => e.id > lastEv);
      if (evs.length) lastEv = Math.max(...evs.map((e) => e.id));
      flipKey = '';
      evs.forEach((e) => {
        if (e.k === 'flip') { flipKey = `${e.s}`; api.sfx('soft'); }
        if (e.k === 'ring') {
          const s = api.seat(e.s);
          if (e.ok) {
            msg(`<span class="av">${s.av}</span><b>${esc(s.name)}</b> 딩! 카드 ${e.got}장 가져가요`, e.s === v.me ? 'good' : '');
            api.sfx(e.s === v.me ? 'perfect' : 'good'); if (e.s === v.me) api.vibrate([30, 30, 60]);
            $('.bl-bell').classList.remove('hit'); void $('.bl-bell').offsetWidth; $('.bl-bell').classList.add('hit');
          } else {
            msg(`<span class="av">${s.av}</span><b>${esc(s.name)}</b> 땡! 틀렸어요 · 한 장씩 줘요`, 'bad');
            if (e.s === v.me) { api.sfx('bad'); api.vibrate([25, 25, 25]); }
          }
        }
      });
      if (prev && prev.turn !== v.turn && v.turn === v.me && v.phase === 'play') api.vibrate(15);
      draw();
    }

    el.addEventListener('pointerdown', (e) => {
      if (!v || v.over) return;
      const bell = e.target.closest('.bl-bell');
      if (bell) {
        e.preventDefault();
        if (v.me == null || api.now() < v.start) return;
        api.act({ k: 'ring' });
        bell.classList.remove('press'); void bell.offsetWidth; bell.classList.add('press');
        api.sfx('lamp');
        return;
      }
      const deck = e.target.closest('.bl-deck');
      if (deck && v.me != null && v.turn === v.me && v.phase === 'play' && api.now() >= v.start) {
        e.preventDefault();
        api.act({ k: 'flip' });
      }
    });

    return { render, tick, destroy() { clearTimeout(msgT); el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#F2B705"/><path d="M12 26 Q12 12 20 12 Q28 12 28 26 Z" fill="#E0E4EA" stroke="#5B6470" stroke-width="1.5"/><rect x="9" y="26" width="22" height="5" rx="2" fill="#8B5A2B"/><circle cx="20" cy="10" r="2.4" fill="#5B6470"/><text x="31" y="15" font-size="8">🍓</text></svg>';

  C.register({
    id: 'bell',
    kind: 'table',
    icon: ICON,
    rulesText: '차례대로 과일 카드를 펼쳐요 · 같은 과일이 딱 5개가 되면 종을 먼저 친 사람이 펼쳐진 카드를 다 가져가요 · 틀리면 한 장씩 나눠 줘요 · 카드를 가장 많이 가진 사람이 1등',
    learn: '할리갈리는 독일에서 만든 보드게임이에요. 눈으로 더하기를 빠르게 해야 해서 순발력과 셈하기가 함께 늘어요!',
    optionsUI: [{ key: 'time', label: '게임 시간', names: { 180: '3분', 300: '5분', 120: '2분' } }],
    bar(v) { return `<span class="cd-info">내 카드 <b>${v.me != null ? v.cards[v.me] : '-'}</b>장</span>`; },
    rankLabel(v, i) { return v && v.cards ? `${v.cards[i]}장` : ''; },
    mount
  });
})();
