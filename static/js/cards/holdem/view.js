/* 아리채 오락실 · 텍사스 홀덤 화면 (서버가 보내 준 내 화면 정보만으로 그려요)
   - 위: 둥근 테이블과 다른 사람 자리 (칩·건 칩·마지막 행동·차례 시계)
   - 가운데: 바닥 카드 5장 + 팟
   - 아래: 내 카드 2장 · 지금 내 족보 · [폴드] [체크/콜] [레이즈] */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STREET = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운', handover: '', done: '' };

  function mount(el, api) {
    el.innerHTML = `<div class="hd">
      <div class="hd-table"><div class="hd-felt"><div class="hd-logo disp">ARICHAE HOLD'EM</div></div>
        <div class="hd-center"><div class="hd-board"></div><div class="hd-pot"></div><div class="hd-banner"></div></div>
        <div class="hd-seats"></div></div>
      <div class="hd-me"><div class="hd-mycards"></div><div class="hd-myinfo"></div><div class="hd-acts"></div>
        <div class="hd-raise"><div class="hd-r-top"><span>레이즈</span><b class="hd-r-amt disp"></b></div>
          <input type="range" class="hd-r-slider"><div class="hd-r-pre"></div>
          <div class="hd-r-btns"><button type="button" class="btn btn-ghost" data-hr="x">취소</button><button type="button" class="btn btn-yellow" data-hr="go">레이즈!</button></div></div></div></div>`;
    const $ = (s) => el.querySelector(s);
    let v = null; let prevBoard = 0; let prevHand = 0; let raiseTo = 0; let raiseOpen = false; let lastToAct = -2;

    const cardHTML = (code, cls) => `<div class="hd-card${cls ? ' ' + cls : ''}">${C.svg(code)}</div>`;
    function pos(k, n) {
      // 내 자리(k=0)는 아래, 나머지는 시계 방향으로 둘러앉아요
      const a = Math.PI / 2 + (k / n) * Math.PI * 2;
      return [50 + Math.cos(a) * 41, 52 + Math.sin(a) * 36];
    }

    function render(view) {
      v = view;
      const n = v.seats.length;
      const me = v.me == null ? 0 : v.me;
      const winners = (v.show && v.show.winners) || [];
      const best = new Set();
      if (v.show && !v.show.fold) winners.forEach((w) => ((v.show.hands[w] || {}).best || []).forEach((c) => best.add(c)));
      // 다른 자리
      let html = '';
      for (let i = 0; i < n; i++) {
        const k = (i - me + n) % n;
        const s = v.seats[i];
        const info = api.seat(i);
        const [x, y] = pos(k, n);
        const turn = v.toAct === i;
        const cls = ['hd-seat', k === 0 ? 'mine' : '', turn ? 'turn' : '', s.folded ? 'folded' : '', s.out ? 'out' : '', winners.includes(i) ? 'win' : ''].join(' ');
        const cards = k === 0 ? '' : s.cards.length ? `<div class="hd-sc${s.cards[0] !== '??' ? ' open' : ''}">${s.cards.map((c) => cardHTML(c, best.has(c) ? 'best' : '')).join('')}</div>` : '';
        const hand = v.show && !v.show.fold && v.show.hands[i] && k !== 0 ? `<div class="hd-hn">${v.show.hands[i].name}</div>` : '';
        html += `<div class="${cls}" style="left:${x}%;top:${y}%" data-seat="${i}">
          ${k === 0 ? '' : `<div class="hd-av"><span class="hd-ring"></span>${info.av}</div><div class="hd-nm">${esc(info.name)}</div><div class="hd-chips">💰 ${s.chips}</div>${cards}${hand}`}
          ${s.last && !s.out ? `<div class="hd-last">${s.last}</div>` : ''}
          ${v.dealer === i ? '<div class="hd-dealer">D</div>' : ''}</div>`;
        if (s.bet > 0) {
          const [bx, by] = [50 + (x - 50) * 0.55, 50 + (y - 50) * 0.55];
          html += `<div class="hd-bet" style="left:${bx}%;top:${by}%">${s.bet}</div>`;
        }
      }
      $('.hd-seats').innerHTML = html;
      // 바닥 카드
      if (v.hand !== prevHand) { prevBoard = 0; prevHand = v.hand; api.sfx('whoosh'); }
      let bh = '';
      for (let k = 0; k < 5; k++) {
        const c = v.board[k];
        bh += c ? cardHTML(c, `${k >= prevBoard ? 'flip' : ''}${best.has(c) ? ' best' : ''}`) : '<div class="hd-card slot"></div>';
      }
      $('.hd-board').innerHTML = bh;
      if (v.board.length > prevBoard) { api.sfx('pop'); prevBoard = v.board.length; }
      $('.hd-pot').innerHTML = v.pot ? `팟 <b>${v.pot}</b>${STREET[v.street] ? ` · ${STREET[v.street]}` : ''}` : '';
      // 승리 알림
      let ban = '';
      if (v.show && winners.length) {
        const names = winners.map((w) => esc(api.seat(w).name)).join(', ');
        const hn = !v.show.fold && v.show.hands[winners[0]] ? ` · ${v.show.hands[winners[0]].name}` : '';
        ban = `<b>${names}</b> ${v.show.pots.reduce((a, p) => a + p.amt, 0)}칩!${hn}`;
      }
      $('.hd-banner').innerHTML = ban;
      $('.hd-banner').classList.toggle('show', !!ban);
      // 내 카드
      const mine = v.me != null ? v.seats[v.me] : null;
      $('.hd-mycards').innerHTML = mine && mine.cards.length ? mine.cards.map((c, k) => cardHTML(c, `big${best.has(c) ? ' best' : ''}${mine.folded ? ' fold' : ''} d${k}`)).join('') : '';
      const myInfo = mine ? `<span class="hd-mychips">💰 <b>${mine.chips}</b></span>${v.myHand && !mine.folded ? `<span class="hd-myhand">${v.myHand}</span>` : ''}${mine.folded ? '<span class="hd-myhand dim">폴드</span>' : ''}${mine.out ? '<span class="hd-myhand dim">탈락 · 구경 중</span>' : ''}` : '<span class="hd-myhand dim">구경 중</span>';
      $('.hd-myinfo').innerHTML = myInfo;
      renderActs();
      if (v.toAct !== lastToAct) {
        if (v.me != null && v.toAct === v.me) { api.sfx('soft'); api.vibrate([20, 40, 20]); }
        lastToAct = v.toAct;
      }
      tick();
    }

    function renderActs() {
      const lg = v.legal;
      const box = $('.hd-acts');
      if (!lg) {
        raiseOpen = false;
        $('.hd-raise').classList.remove('show');
        let msg = '';
        if (v.over) msg = '게임 끝!';
        else if (v.street === 'handover') msg = '다음 판을 나눠 줘요…';
        else if (v.toAct >= 0) msg = `<span class="bd-dots">${esc(api.seat(v.toAct).name)} 차례</span>`;
        box.innerHTML = `<div class="hd-wait">${msg}</div>`;
        return;
      }
      box.innerHTML = `${lg.fold ? '<button type="button" class="btn hd-b fold" data-ha="fold">폴드</button>' : ''}
        ${lg.check ? '<button type="button" class="btn hd-b check" data-ha="check">체크</button>' : `<button type="button" class="btn hd-b call" data-ha="call">콜 ${lg.call}</button>`}
        ${lg.raise ? `<button type="button" class="btn hd-b raise" data-ha="raise">${lg.raise.min >= lg.raise.max ? '올인 ' + lg.raise.max : '레이즈'}</button>` : ''}`;
      if (lg.raise && raiseOpen) openRaise(true);
    }
    function openRaise(keep) {
      const r = v.legal.raise;
      const bb = v.blinds[1];
      if (!keep) raiseTo = Math.min(r.max, Math.max(r.min, r.min));
      raiseOpen = true;
      const sl = $('.hd-r-slider');
      sl.min = r.min; sl.max = r.max; sl.step = Math.max(1, Math.floor(bb / 2)); sl.value = raiseTo;
      const pot = v.pot;
      const call = v.legal.call || 0;
      const pre = [['최소', r.min], ['½팟', (v.seats[v.me].bet + call) + Math.round((pot + call) / 2)], ['팟', (v.seats[v.me].bet + call) + pot + call], ['올인', r.max]]
        .map(([l, x]) => [l, Math.max(r.min, Math.min(r.max, x))]);
      $('.hd-r-pre').innerHTML = pre.map(([l, x]) => `<button type="button" data-hp="${x}">${l}<small>${x}</small></button>`).join('');
      $('.hd-r-amt').textContent = raiseTo >= r.max ? `올인 ${r.max}` : `${raiseTo}까지`;
      $('.hd-raise').classList.add('show');
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ha]');
      if (b && v && v.legal) {
        const k = b.dataset.ha;
        if (k === 'raise') {
          const r = v.legal.raise;
          if (r.min >= r.max) { api.act({ k: 'allin' }); api.sfx('pop'); return; }
          api.tick(); openRaise(false); return;
        }
        api.act({ k }); api.sfx('pop'); return;
      }
      const p = e.target.closest('[data-hp]');
      if (p && v && v.legal && v.legal.raise) { raiseTo = Number(p.dataset.hp); api.tick(); openRaise(true); return; }
      const h = e.target.closest('[data-hr]');
      if (h) {
        if (h.dataset.hr === 'x') { raiseOpen = false; $('.hd-raise').classList.remove('show'); return; }
        if (v && v.legal && v.legal.raise) {
          const r = v.legal.raise;
          raiseOpen = false; $('.hd-raise').classList.remove('show');
          api.act(raiseTo >= r.max ? { k: 'allin' } : { k: 'raise', v: raiseTo }); api.sfx('pop');
        }
      }
    });
    el.querySelector('.hd-r-slider').addEventListener('input', (e) => {
      raiseTo = Number(e.target.value);
      const r = v && v.legal && v.legal.raise;
      if (r) $('.hd-r-amt').textContent = raiseTo >= r.max ? `올인 ${r.max}` : `${raiseTo}까지`;
    });

    // 차례 시계 (테두리가 줄어들어요)
    function tick() {
      if (!v) return;
      const ring = el.querySelector('.hd-seat.turn .hd-ring');
      const mine = v.me != null && v.toAct === v.me;
      const left = v.deadline ? Math.max(0, v.deadline - api.now()) : 0;
      const frac = v.deadline ? left / 30000 : 1;
      if (ring) ring.style.background = `conic-gradient(var(--yellow) ${Math.round(frac * 360)}deg, transparent 0)`;
      const acts = $('.hd-acts');
      acts.classList.toggle('urgent', mine && v.deadline && left < 8000);
      if (mine && v.deadline) acts.dataset.left = `${Math.ceil(left / 1000)}초`;
      else delete acts.dataset.left;
    }
    return { render, tick, destroy() { el.innerHTML = ''; } };
  }

  C.register({
    id: 'holdem',
    kind: 'table',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#0F6B45"/><g transform="translate(5 8) rotate(-12) scale(.26)">${C.svg('As').replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(17 7) rotate(10) scale(.26)">${C.svg('Ah').replace(/<\/?svg[^>]*>/g, '')}</g><circle cx="31" cy="31" r="6" fill="#FFD23F" stroke="#B88A00" stroke-width="1.5" stroke-dasharray="2 2"/></svg>`,
    rulesText: '내 카드 2장 + 가운데 5장으로 가장 좋은 패 만들기 · 칩만 써요(진짜 돈 없음) · 5판마다 블라인드가 올라요 · 마지막까지 칩이 남은 사람이 우승',
    learn: '텍사스 홀덤은 1900년대 초 미국 텍사스에서 시작된 포커예요. 확률과 상대 마음을 읽는 머리싸움이라 "수학 게임"이라고도 불려요. 이 게임에서는 칩만 써요!',
    bar(v) { return v.hand ? `<span class="cd-info">${v.hand}번째 판</span><span class="cd-info">블라인드 <b>${v.blinds[0]}/${v.blinds[1]}</b></span><span class="cd-info">${v.nextLevel}판 뒤 올라요</span>` : ''; },
    rankLabel(v, i) { return v && v.seats[i] ? `💰 ${v.seats[i].chips}` : ''; },
    mount
  });
})();
