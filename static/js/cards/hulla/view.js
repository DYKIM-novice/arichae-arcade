/* 아리채 오락실 · 훌라 화면 (전투 훌라)
   - 위: 다른 사람 (남은 카드 수 · 점수 · 등록했는지)
   - 가운데: 바닥에 등록된 조합 · 더미(눌러서 가져오기) · 버림 더미(땡큐)
   - 아래: 내 카드 (눌러서 고르기) · [등록] [붙이기] [버리기] [스톱] · 누가 버린 카드로 등록할 수 있으면 [땡큐!] */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RANKS = 'A23456789TJQK';
  const rank = (code) => RANKS.indexOf(code[0]) + 1;
  const suitIx = (code) => 'shdc'.indexOf(code[1]);

  // 등록 검사 (화면에서 미리 알려 주려고 · 진짜 판정은 서버)
  function isSet(cs) { return cs.length >= 3 && cs.length <= 4 && cs.every((c) => c[0] === cs[0][0]); }
  function isRun(cs) {
    if (cs.length < 3 || !cs.every((c) => c[1] === cs[0][1])) return false;
    const rs = cs.map(rank).sort((a, b) => a - b);
    if (new Set(rs).size !== rs.length) return false;
    const ok = (arr) => arr.every((r, k) => k === 0 || r - arr[k - 1] === 1);
    if (ok(rs)) return true;
    if (rs[0] === 1) return ok(rs.map((r) => (r === 1 ? 14 : r)).sort((a, b) => a - b));
    return false;
  }
  const meldOk = (cs) => (cs.length === 1 && cs[0][0] === '7') || isSet(cs) || isRun(cs);
  function attachOk(m, c) {
    const cs = m.cards.concat([c]);
    if (m.kind === 'set') return isSet(cs);
    if (m.kind === 'seven' && cs.length === 2) return cs[0][1] === cs[1][1] && Math.abs(rank(cs[0]) - rank(cs[1])) === 1;
    return isRun(cs);
  }

  function mount(el, api) {
    el.innerHTML = `<div class="hl-root">
      <div class="hl-opps"></div>
      <div class="hl-mid"><div class="hl-piles"><button type="button" class="hl-stock" data-hl="draw"></button><button type="button" class="hl-disc" data-hl="thank"></button></div>
        <div class="hl-melds"></div><div class="hl-msg"></div></div>
      <div class="hl-me"><div class="hl-info"></div><div class="hl-hand"></div><div class="hl-hint"></div><div class="hl-acts"></div></div>
      <div class="hl-end"></div></div>`;
    const $ = (s) => el.querySelector(s);
    let v = null; let sel = []; let sortBy = 'suit'; let lastRound = 0; let lastTurn = -2; let endShown = '';
    const card = (code, cls, attrs) => `<div class="hl-card${cls ? ' ' + cls : ''}" ${attrs || ''}>${C.svg(code)}</div>`;

    function sorted(hand) {
      const h = hand.slice();
      if (sortBy === 'suit') h.sort((a, b) => suitIx(a.c) - suitIx(b.c) || rank(a.c) - rank(b.c));
      else h.sort((a, b) => rank(a.c) - rank(b.c) || suitIx(a.c) - suitIx(b.c));
      return h;
    }

    function render(view) {
      v = view;
      if (v.round !== lastRound) { sel = []; lastRound = v.round; api.sfx('whoosh'); }
      const n = v.seats.length;
      const me = v.me == null ? -1 : v.me;
      // 다른 사람
      let oh = '';
      for (let k = 1; k <= n; k++) {
        const i = me < 0 ? k - 1 : (me + k) % n;
        if (i === me) continue;
        const s = v.seats[i]; const info = api.seat(i);
        oh += `<div class="hl-opp${v.toAct === i ? ' turn' : ''}"><span class="av">${info.av}</span><b>${esc(info.name)}</b>
          <span class="hl-backs">${Array.from({ length: Math.min(s.n, 9) }, () => '<i></i>').join('')}<em>${s.n}</em></span>
          <span class="hl-sc${s.score < 0 ? ' neg' : ''}">${s.score > 0 ? '+' : ''}${s.score}</span>${s.reg ? '<span class="hl-reg">등록</span>' : ''}</div>`;
      }
      $('.hl-opps').innerHTML = oh;
      // 더미 · 버림 더미
      $('.hl-stock').innerHTML = `${C.svg('??')}<span>${v.stock}</span>`;
      const top = v.discard[v.discard.length - 1];
      $('.hl-disc').innerHTML = top ? card(top, v.canThank ? 'glow' : '') + (v.canThank ? '<span class="hl-ty disp">땡큐!</span>' : '') : '<div class="hl-card slot"></div>';
      // 바닥 조합
      const myCard = sel.length === 1 ? v.hand.find((h) => h.id === sel[0]) : null;
      $('.hl-melds').innerHTML = v.melds.length ? v.melds.map((m, mi) => {
        const can = myCard && v.registered && attachOk(m, myCard.c);
        return `<button type="button" class="hl-meld${can ? ' can' : ''}" data-meld="${mi}" style="--own:${ownColor(m.owner)}">${m.cards.map((c) => card(c)).join('')}</button>`;
      }).join('') : '<div class="hl-empty">아직 등록된 조합이 없어요</div>';
      // 알림
      let msg = '';
      if (v.phase === 'claim') msg = v.canThank ? '<b>땡큐!</b>를 누르면 그 카드를 가져와요' : '<span class="bd-dots">땡큐할 사람을 기다려요</span>';
      else if (v.toAct >= 0 && v.toAct !== me) msg = `<span class="bd-dots">${esc(api.seat(v.toAct).name)} 차례</span>`;
      $('.hl-msg').innerHTML = msg;
      // 내 카드
      if (v.hand) {
        sel = sel.filter((id) => v.hand.some((h) => h.id === id));
        $('.hl-hand').innerHTML = sorted(v.hand).map((h) => card(h.c, `${sel.includes(h.id) ? 'sel' : ''}${v.drawn === h.id ? ' new' : ''}`, `data-card="${h.id}"`)).join('');
        $('.hl-info').innerHTML = `<span>내 점수 <b>${v.points}</b>${v.toAct === me && v.phase === 'draw' && v.points <= v.stopLimit ? ' · <b class="ok">스톱 가능!</b>' : ''}</span>
          <span class="hl-tot">합계 ${v.seats[me].score > 0 ? '+' : ''}${v.seats[me].score}</span>
          <button type="button" class="hl-sort" data-hl="sort">${sortBy === 'suit' ? '무늬순' : '숫자순'} ⇄</button>`;
      } else { $('.hl-hand').innerHTML = ''; $('.hl-info').innerHTML = '<span class="dim">구경 중</span>'; }
      renderActs();
      if (v.toAct !== lastTurn) { if (v.toAct === me && me >= 0) { api.sfx('soft'); api.vibrate([20, 40, 20]); } lastTurn = v.toAct; }
      renderEnd();
    }
    const OWN = ['#FFD23F', '#3D7BFF', '#FF4757', '#2ED573', '#C7A0FF'];
    function ownColor(i) { return OWN[i % OWN.length]; }

    function renderActs() {
      const me = v.me;
      const box = $('.hl-acts');
      const btn = (k, label, cls, dis) => `<button type="button" class="btn hl-b ${cls || ''}" data-hl="${k}" ${dis ? 'disabled' : ''}>${label}</button>`;
      if (me == null || !v.hand) { box.innerHTML = ''; return; }
      const myTurn = v.toAct === me;
      const out = [];
      if (v.canThank) out.push(btn('thank', '땡큐!', 'thank'));
      if (myTurn && v.phase === 'draw') {
        out.push(btn('draw', '더미에서 가져오기', 'go'));
        if (v.points <= v.stopLimit) out.push(btn('stop', '스톱!', 'stop'));
      } else if (myTurn && v.phase === 'play') {
        const cs = sel.map((id) => v.hand.find((h) => h.id === id).c);
        const canMeld = cs.length && meldOk(cs);
        const canAttach = cs.length === 1 && v.registered && v.melds.some((m) => attachOk(m, cs[0]));
        out.push(btn('meld', '등록', 'meld', !canMeld));
        out.push(btn('attach', '붙이기', 'attach', !canAttach));
        out.push(btn('discard', '버리기', 'go', sel.length !== 1));
      }
      box.innerHTML = out.join('') || '<div class="hl-wait"></div>';
      let hint = '';
      if (myTurn && v.phase === 'play') {
        hint = sel.length ? (sel.length === 1 ? '1장: 버리기 · 붙이기 (7은 혼자 등록 가능)' : `${sel.length}장 골랐어요 · 등록할 수 있는지 봐요`) : '카드를 눌러 골라요 · 등록하고 마지막에 1장 버려요';
        if (!v.registered) hint += ' · 붙이기는 먼저 한 번 등록해야 해요';
      } else if (myTurn && v.phase === 'draw') hint = '더미를 눌러 1장 가져와요' + (v.canThank ? ' · 버림 카드로 등록할 수 있어요!' : '');
      $('.hl-hint').textContent = hint;
      const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - api.now()) / 1000)) : 0;
      if (myTurn && left && left <= 15) box.dataset.left = `${left}초`; else delete box.dataset.left;
    }

    function renderEnd() {
      const box = $('.hl-end');
      const e = v.end;
      if (!e) { box.className = 'hl-end'; endShown = ''; return; }
      const key = `${e.round}`;
      const n = v.seats.length;
      box.innerHTML = `<div class="hl-end-card"><div class="hl-end-t disp">${esc(api.seat(e.winner).name)} 승리!</div><div class="hl-end-how">${esc(e.text)}</div>
        ${Array.from({ length: n }, (_, i) => `<div class="hl-end-row${i === e.winner ? ' win' : ''}"><span class="av">${api.seat(i).av}</span><b>${esc(api.seat(i).name)}</b>
          <span class="hl-end-cards">${e.hands[i].map((c) => card(c)).join('')}</span><span class="hl-end-p">${i === e.winner ? '+' + e.pays.reduce((a, b) => a + b, 0) : e.pays[i] ? '−' + e.pays[i] : '0'}</span></div>`).join('')}
        <div class="hl-end-next">${v.over ? '마지막 판이었어요!' : `${e.round}/${v.rounds}판 · 곧 다음 판`}</div></div>`;
      box.className = 'hl-end show';
      if (endShown !== key) {
        endShown = key;
        if (v.me != null && e.winner === v.me) { api.sfx('fanfare'); api.vibrate([50, 30, 90]); } else api.sfx('end');
      }
    }

    el.addEventListener('click', (ev) => {
      if (!v) return;
      const c = ev.target.closest('[data-card]');
      if (c) {
        const id = Number(c.dataset.card);
        sel = sel.includes(id) ? sel.filter((x) => x !== id) : sel.concat([id]);
        api.tick(); render(v); return;
      }
      const m = ev.target.closest('[data-meld]');
      if (m && sel.length === 1 && v.toAct === v.me && v.phase === 'play') {
        const mi = Number(m.dataset.meld);
        const cc = v.hand.find((h) => h.id === sel[0]);
        if (!v.registered) { api.say('먼저 한 번 등록해야 붙일 수 있어요'); return; }
        if (!attachOk(v.melds[mi], cc.c)) { api.say('그 조합에는 붙일 수 없어요'); return; }
        api.act({ k: 'attach', c: sel, m: mi }); sel = []; api.sfx('pop'); return;
      }
      const b = ev.target.closest('[data-hl]');
      if (!b || b.disabled) return;
      const k = b.dataset.hl;
      if (k === 'sort') { sortBy = sortBy === 'suit' ? 'rank' : 'suit'; api.tick(); render(v); return; }
      if (k === 'draw') { if (v.toAct === v.me && v.phase === 'draw') { api.act({ k: 'draw' }); api.sfx('pop'); } return; }
      if (k === 'thank') { if (v.canThank) { api.act({ k: 'thank' }); api.sfx('pop'); api.vibrate(30); } else if (v.toAct === v.me && v.phase === 'draw') api.say('그 카드로는 바로 등록할 수 없어요'); return; }
      if (k === 'stop') { api.act({ k: 'stop' }); return; }
      if (k === 'meld') { api.act({ k: 'meld', c: sel }); sel = []; api.sfx('pop'); return; }
      if (k === 'attach') {
        const cc = v.hand.find((h) => h.id === sel[0]);
        const mi = v.melds.findIndex((mm) => attachOk(mm, cc.c));
        if (mi >= 0) { api.act({ k: 'attach', c: sel, m: mi }); sel = []; api.sfx('pop'); }
        return;
      }
      if (k === 'discard') { api.act({ k: 'discard', c: sel }); sel = []; api.sfx('soft'); }
    });

    return { render, tick() { if (v) renderActs(); }, destroy() { el.innerHTML = ''; } };
  }

  C.register({
    id: 'hulla',
    kind: 'table',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#7A2E8F"/><g transform="translate(4 9) rotate(-14) scale(.24)">${C.svg('7h').replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(13 7) scale(.24)">${C.svg('7s').replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(22 8) rotate(14) scale(.24)">${C.svg('7d').replace(/<\/?svg[^>]*>/g, '')}</g></svg>`,
    rulesText: '같은 숫자 3장 · 같은 무늬 연속 3장 · 7 한 장을 등록해서 손패를 먼저 털면 승리 · 전투 땡큐(내 차례가 아니어도!) · 한 번에 다 털면 훌라(2배) · 5판 합계',
    learn: '훌라는 "러미"라는 카드놀이가 우리나라에서 바뀐 거예요. 7을 혼자 등록할 수 있는 게 특징이죠. 버린 카드를 잘 보면 상대 손패를 짐작할 수 있어요!',
    bar(v) { return v.round ? `<span class="cd-info">${v.round}/${v.rounds}판</span><span class="cd-info">더미 <b>${v.stock}</b>장</span><span class="cd-info">스톱 ${v.stopLimit}점 이하</span>` : ''; },
    rankLabel(v, i) { return v && v.seats[i] ? `${v.seats[i].score > 0 ? '+' : ''}${v.seats[i].score}점` : ''; },
    mount
  });
})();
