/* 아리채 오락실 · 맞고 · 고스톱 화면
   - 위: 다른 사람 (손에 든 장수 · 지금 점수 · 고 · 가져간 카드 요약)
   - 가운데: 바닥 (같은 달끼리 모아서) + 더미
   - 내가 가져간 카드 (광 · 열끗 · 띠 · 피) 와 점수
   - 아래: 내 손패 — 한 번 누르면 같은 달 바닥 카드가 빛나고, 한 번 더 누르면 내요
   - 쪽 · 뻑 · 따닥 · 싹쓸이 · 폭탄 · 흔들기 · 고 는 화면 가운데 크게 */
(function () {
  'use strict';
  const C = window.Cards;
  const W = window.Hwatu;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const month = (id) => Math.floor(id / 4) + 1;
  const kind = (id) => W.info(id).kind;
  const EV = { jjok: '쪽!', ppeok: '뻑!', ttadak: '따닥!', sweep: '싹쓸이!', bomb: '폭탄!', shake: '흔들기!', ppeok_eat: '뻑 먹기!', nagari: '나가리!' };

  function groups(cards) {
    const g = { gwang: [], yeol: [], tti: [], pi: [] };
    cards.forEach((c) => { const k = kind(c); (g[k === 'ssang' ? 'pi' : k] || g.pi).push(c); });
    return g;
  }
  const piCount = (cards) => cards.reduce((a, c) => a + (kind(c) === 'ssang' ? 2 : kind(c) === 'pi' ? 1 : 0), 0);

  function mount(el, api) {
    el.innerHTML = `<div class="gs">
      <div class="gs-opps"></div>
      <div class="gs-floor"><div class="gs-deck"></div><div class="gs-fl"></div><div class="gs-pop disp"></div></div>
      <div class="gs-mycap"></div>
      <div class="gs-me"><div class="gs-hand"></div><div class="gs-acts"></div></div>
      <div class="gs-gostop"></div><div class="gs-end"></div></div>`;
    const $ = (s) => el.querySelector(s);
    let v = null; let sel = -1; let lastEv = 0; let lastRound = 0; let popT = 0; let endKey = ''; let lastTurn = -2;
    const card = (id, cls, attrs) => `<div class="gs-card${cls ? ' ' + cls : ''}" ${attrs || ''}>${W.svg(id)}</div>`;

    function capSummary(cards) {
      const g = groups(cards);
      return `<span class="gs-cs"><i class="k-g">광</i>${g.gwang.length}</span><span class="gs-cs"><i class="k-y">열</i>${g.yeol.length}</span><span class="gs-cs"><i class="k-t">띠</i>${g.tti.length}</span><span class="gs-cs"><i class="k-p">피</i>${piCount(cards)}</span>`;
    }

    function render(view) {
      v = view;
      if (v.round !== lastRound) { lastRound = v.round; sel = -1; api.sfx('whoosh'); }
      const n = v.seats.length; const me = v.me == null ? -1 : v.me;
      // 다른 사람
      let oh = '';
      for (let k = 1; k <= n; k++) {
        const i = me < 0 ? k - 1 : (me + k) % n;
        if (i === me) continue;
        const s = v.seats[i]; const info = api.seat(i);
        const seller = v.seller === i;
        oh += `<div class="gs-opp${v.toAct === i ? ' turn' : ''}${seller ? ' rest' : ''}"><span class="av">${info.av}</span>
          <div class="gs-o-t"><b>${esc(info.name)}</b><span class="gs-o-sc">${seller ? '광 팔고 쉬어요' : `${s.score}점${s.go ? ` · <em>${s.go}고</em>` : ''}${s.shake ? ' · 흔듦' : ''}${s.bomb ? ' · 폭탄' : ''}`}</span></div>
          ${seller ? '' : `<div class="gs-o-b"><span class="gs-hn">🂠 ${s.n}</span>${capSummary(s.cap)}</div>`}
          <span class="gs-o-tot${s.total < 0 ? ' neg' : ''}">${s.total > 0 ? '+' : ''}${s.total}</span></div>`;
      }
      $('.gs-opps').innerHTML = oh;
      // 더미 · 바닥 (같은 달끼리)
      $('.gs-deck').innerHTML = `${W.svg(-1)}<span>${v.deck}</span>`;
      const lastFlip = (v.events || []).filter((e) => e.k === 'flip').slice(-1)[0];
      const selMonth = sel >= 0 ? month(sel) : 0;
      const byM = {};
      v.floor.forEach((c) => { (byM[month(c)] = byM[month(c)] || []).push(c); });
      const choose = v.choose || [];
      $('.gs-fl').innerHTML = Object.keys(byM).sort((a, b) => a - b).map((m) => {
        const cs = byM[m];
        const hit = Number(m) === selMonth;
        const spread = cs.some((c) => choose.includes(c));   // 고를 때는 겹치지 않게 펼쳐요
        return `<div class="gs-grp${hit ? ' hit' : ''}${cs.length >= 3 ? ' ppeok' : ''}${spread ? ' spread' : ''}" data-fm="${m}">${cs.map((c) => card(c, `${choose.includes(c) ? 'choose' : ''}${lastFlip && lastFlip.c === c ? ' flip' : ''}`, `data-fc="${c}"`)).join('')}</div>`;
      }).join('') + (v.pending != null && v.toAct === me ? `<div class="gs-grp pend">${card(v.pending, 'pending')}</div>` : '');
      // 내가 가져간 카드
      if (me >= 0 && v.seats[me] && !(v.seller === me)) {
        const g = groups(v.seats[me].cap);
        const d = v.myDetail || {};
        const row = (lbl, cs, cls, extra) => `<div class="gs-cr ${cls}"><i>${lbl}</i><div class="gs-cr-c">${cs.map((c) => card(c)).join('')}</div><b>${extra}</b></div>`;
        $('.gs-mycap').innerHTML = `<div class="gs-cap-rows">${row('광', g.gwang, 'k-g', g.gwang.length)}${row('열', g.yeol, 'k-y', g.yeol.length)}${row('띠', g.tti, 'k-t', g.tti.length)}${row('피', g.pi, 'k-p', piCount(v.seats[me].cap))}</div>
          <div class="gs-myscore"><b class="disp">${d.total || 0}</b><span>점</span><small>${v.threshold}점부터 고·스톱</small><small class="gs-tot">합계 ${v.seats[me].total > 0 ? '+' : ''}${v.seats[me].total}</small></div>`;
      } else $('.gs-mycap').innerHTML = me >= 0 && v.seller === me ? '<div class="gs-rest">이번 판은 광을 팔고 쉬어요 🍵</div>' : '<div class="gs-rest">구경 중</div>';
      // 내 손패
      const hand = v.hand || [];
      if (sel >= 0 && !hand.includes(sel)) sel = -1;
      const playable = (v.opts && v.opts.play) || [];
      const shakeM = new Set(((v.opts && v.opts.shake) || []));
      $('.gs-hand').innerHTML = hand.map((c) => {
        const match = v.floor.some((f) => month(f) === month(c));
        return card(c, `${c === sel ? 'sel' : ''}${playable.includes(c) && match ? ' match' : ''}${shakeM.has(month(c)) ? ' trio' : ''}`, `data-hc="${c}"`);
      }).join('');
      $('.gs-hand').classList.toggle('two', hand.length > 7);
      renderActs();
      renderGoStop();
      renderEvents();
      renderEnd();
      if (v.toAct !== lastTurn) { if (v.toAct === me && me >= 0) { api.sfx('soft'); api.vibrate([20, 40, 20]); } lastTurn = v.toAct; }
    }

    function renderActs() {
      const me = v.me; const box = $('.gs-acts');
      const o = v.opts || {};
      const out = [];
      const myTurn = me != null && v.toAct === me;
      if (myTurn && v.phase === 'play') {
        if (o.flipOnly) out.push('<button type="button" class="btn gs-b go" data-gs="flip">뒤집기 (폭탄 뒤)</button>');
        (o.bomb || []).forEach((m) => out.push(`<button type="button" class="btn gs-b bomb" data-gs="bomb" data-m="${m}">💣 ${m}월 폭탄</button>`));
        (o.shake || []).forEach((m) => out.push(`<button type="button" class="btn gs-b shake" data-gs="shake" data-m="${m}">${m}월 흔들기</button>`));
        if (sel >= 0) out.push('<button type="button" class="btn gs-b go" data-gs="play">이 카드 내기</button>');
      }
      let msg = '';
      if (myTurn && v.phase === 'play' && !o.flipOnly) msg = sel >= 0 ? '한 번 더 누르거나 [이 카드 내기]' : '낼 카드를 눌러요 (빛나는 카드는 바닥과 같은 달)';
      else if (myTurn && v.phase === 'choose') msg = '가져갈 바닥 카드를 하나 골라요 (빛나는 카드)';
      else if (v.toAct >= 0 && v.toAct !== me) msg = `<span class="bd-dots">${esc(api.seat(v.toAct).name)} 차례</span>`;
      const left = myTurn && v.deadline ? Math.max(0, Math.ceil((v.deadline - api.now()) / 1000)) : 0;
      box.innerHTML = (out.length ? `<div class="gs-btns">${out.join('')}</div>` : '') + `<div class="gs-msg">${msg}${left && left <= 12 ? ` <b class="gs-left">${left}초</b>` : ''}</div>`;
    }

    function renderGoStop() {
      const box = $('.gs-gostop');
      if (!(v.me != null && v.toAct === v.me && v.phase === 'gostop')) { box.className = 'gs-gostop'; return; }
      const d = v.myDetail || {};
      const go = v.seats[v.me].go;
      box.innerHTML = `<div class="gs-gs-card"><div class="gs-gs-t disp">${d.total}점!</div><div class="hint-md">${go ? `지금 ${go}고 · ` : ''}더 해서 점수를 키울까요(고), 여기서 끝낼까요(스톱)?</div>
        <div class="gs-gs-btns"><button type="button" class="btn gs-b gogo disp" data-gs="go">고!</button><button type="button" class="btn gs-b stop disp" data-gs="stop">스톱</button></div>
        <div class="hint-sm">고를 하면 1고 +1점 · 2고 +2점 · 3고부터 2배씩. 대신 남이 먼저 나면 손해!</div></div>`;
      box.className = 'gs-gostop show';
    }

    function renderEvents() {
      const evs = (v.events || []).filter((e) => e.id > lastEv);
      if (!evs.length) return;
      lastEv = Math.max(...evs.map((e) => e.id));
      let txt = '';
      evs.forEach((e) => {
        if (EV[e.k]) txt = (e.s >= 0 ? esc(api.seat(e.s).name) + ' ' : '') + EV[e.k];
        if (e.k === 'go') txt = `${esc(api.seat(e.s).name)} ${e.n}고!`;
        if (e.k === 'stop') txt = `${esc(api.seat(e.s).name)} 스톱!`;
        if (e.k === 'steal' && !txt) txt = `${esc(api.seat(e.s).name)} 피 뺏기!`;
        if (e.k === 'take' || e.k === 'flip' || e.k === 'play') api.sfx('pop');
      });
      if (!txt) return;
      const pop = $('.gs-pop');
      pop.innerHTML = txt;
      pop.classList.remove('show'); void pop.offsetWidth; pop.classList.add('show');
      clearTimeout(popT); popT = setTimeout(() => pop.classList.remove('show'), 1500);
      api.sfx('whoosh'); api.vibrate(25);
    }

    function renderEnd() {
      const box = $('.gs-end');
      const e = v.end;
      if (!e) { box.className = 'gs-end'; endKey = ''; return; }
      let body;
      if (e.winner < 0) body = '<div class="gs-end-t disp">나가리!</div><div class="hint-md">아무도 못 났어요. 다음 판 점수는 2배!</div>';
      else {
        const d = e.detail || {};
        const parts = [['광', d.gwang], ['열끗', d.yeol], ['고도리', d.godori], ['띠', d.tti], ['단', d.dan], ['피', d.pi]].filter(([, x]) => x).map(([l, x]) => `${l} ${x}`).join(' + ');
        body = `<div class="gs-end-t disp">${esc(api.seat(e.winner).name)} 승리!</div>
          <div class="gs-end-sub">${parts || '0'} = ${d.total}점${(e.mult || []).length ? ` · ${e.mult.join(' · ')}` : ''}</div>
          ${(e.lines || []).map((ln) => `<div class="gs-end-row"><span class="av">${api.seat(ln.seat).av}</span><b>${esc(api.seat(ln.seat).name)}</b><span class="gs-tags">${ln.tags.map((t) => `<i>${t}</i>`).join('')}</span><span class="gs-pay">${ln.pay ? '−' + ln.pay : '0'}</span></div>`).join('')}
          ${e.sell && e.sell.length ? `<div class="hint-sm">${esc(api.seat(e.sell[0]).name)}: 광 ${e.sell[1]}장 팔아서 +${e.sell[1] * 3}</div>` : ''}`;
      }
      box.innerHTML = `<div class="gs-end-card">${body}<div class="gs-end-next">${v.over ? '마지막 판이었어요!' : `${e.round}/${v.rounds}판 · 곧 다음 판`}</div></div>`;
      box.className = 'gs-end show';
      const key = String(e.round);
      if (endKey !== key) { endKey = key; if (v.me != null && e.winner === v.me) { api.sfx('fanfare'); api.vibrate([50, 30, 90]); } else api.sfx('end'); }
    }

    function play(c) { api.act({ k: 'play', c }); sel = -1; api.sfx('pop'); }
    el.addEventListener('click', (ev) => {
      if (!v) return;
      const myTurn = v.me != null && v.toAct === v.me;
      const fc = ev.target.closest('[data-fc]');
      if (fc && myTurn && v.phase === 'choose') {
        const c = Number(fc.dataset.fc);
        if ((v.choose || []).includes(c)) { api.act({ k: 'choose', c }); api.sfx('pop'); } else api.say('빛나는 카드 가운데 골라요');
        return;
      }
      const fm = ev.target.closest('[data-fm]');
      if (fm && myTurn && v.phase === 'play' && sel >= 0 && Number(fm.dataset.fm) === month(sel)) { play(sel); return; }
      const hc = ev.target.closest('[data-hc]');
      if (hc) {
        const c = Number(hc.dataset.hc);
        if (!myTurn || v.phase !== 'play') { sel = sel === c ? -1 : c; render(v); return; }
        if ((v.opts && v.opts.flipOnly)) { api.say('폭탄 뒤 두 번은 뒤집기만 해요'); return; }
        if (sel === c) { play(c); return; }
        sel = c; api.tick(); render(v); return;
      }
      const b = ev.target.closest('[data-gs]');
      if (!b) return;
      const k = b.dataset.gs;
      if (k === 'play' && sel >= 0) play(sel);
      else if (k === 'flip') { api.act({ k: 'flip' }); api.sfx('pop'); }
      else if (k === 'bomb' || k === 'shake') { api.act({ k, m: Number(b.dataset.m) }); api.vibrate(30); }
      else if (k === 'go' || k === 'stop') { api.act({ k }); api.vibrate(40); }
    });
    return { render, tick() { if (v) renderActs(); }, destroy() { clearTimeout(popT); el.innerHTML = ''; } };
  }

  C.register({
    id: 'gostop',
    kind: 'table',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#C81E2C"/><g transform="translate(6 7) rotate(-10) scale(.3)">${W.svg(0).replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(17 6) rotate(8) scale(.3)">${W.svg(28).replace(/<\/?svg[^>]*>/g, '')}</g></svg>`,
    rulesText: '2명은 맞고(7점), 3명은 고스톱(3점), 4명은 한 명씩 광 팔고 쉬어요 · 같은 달 카드를 맞춰 가져가요 · 점수가 나면 고 또는 스톱 · 5판 합계',
    learn: '화투는 포르투갈 카드가 일본을 거쳐 들어와 우리나라에서 고스톱으로 꽃피었어요. 열두 달의 꽃과 동물이 그려져 있어서 "꽃 싸움(花鬪)"이라는 이름이 붙었어요.',
    bar(v) { return v.round ? `<span class="cd-info">${v.round}/${v.rounds}판</span><span class="cd-info">${v.players.length === 2 ? '맞고' : '고스톱'} · <b>${v.threshold}점</b>부터</span>${v.nagari > 1 ? `<span class="cd-info">나가리 <b>×${v.nagari}</b></span>` : ''}` : ''; },
    rankLabel(v, i) { return v && v.seats[i] ? `${v.seats[i].total > 0 ? '+' : ''}${v.seats[i].total}점` : ''; },
    mount
  });
})();
