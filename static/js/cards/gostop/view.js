/* 아리채 오락실 · 맞고 · 고스톱 화면
   - 위: 다른 사람 (손에 든 장수 · 지금 점수 · 고 · 가져간 카드 요약)
   - 가운데: 바닥 (같은 달끼리 모아서) + 더미
   - 내가 가져간 카드 (광 · 열끗 · 띠 · 피) 와 점수
   - 아래: 내 손패 — 한 번 누르면 같은 달 바닥 카드가 빛나고, 한 번 더 누르면 내요
   - 한 차례는 천천히 순서대로 보여 줘요: 낸 카드가 바닥에 놓이고 → 더미에서 한 장 뒤집고 → 짝 맞은 카드가 빛난 뒤 가져가요
   - 쪽 · 뻑 · 따닥 · 싹쓸이 · 폭탄 · 흔들기 · 고 는 화면 가운데 크게 */
(function () {
  'use strict';
  const C = window.Cards;
  const W = window.Hwatu;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const month = (id) => Math.floor(id / 4) + 1;
  const kind = (id) => W.info(id).kind;
  const EV = { jjok: '쪽!', ppeok: '뻑!', ttadak: '따닥!', sweep: '싹쓸이!', bomb: '폭탄!', shake: '흔들기!', ppeok_eat: '뻑 먹기!', nagari: '나가리!', bonus: '보너스 쌍피!' };
  const STEP_MS = { land: 700, flip: 750, take: 750 };

  function groups(cards) {
    const g = { gwang: [], yeol: [], tti: [], pi: [] };
    cards.forEach((c) => { const k = kind(c); (g[k === 'ssang' || k === 'bonus' ? 'pi' : k] || g.pi).push(c); });
    return g;
  }
  const piCount = (cards) => cards.reduce((a, c) => a + (kind(c) === 'ssang' || kind(c) === 'bonus' ? 2 : kind(c) === 'pi' ? 1 : 0), 0);

  function mount(el, api) {
    W.preload();
    el.innerHTML = `<div class="gs">
      <div class="gs-opps"></div>
      <div class="gs-floor"><div class="gs-deck"></div><div class="gs-fl"></div><div class="gs-pop disp"></div></div>
      <div class="gs-mycap"></div>
      <div class="gs-me"><div class="gs-hand"></div><div class="gs-acts"></div></div>
      <div class="gs-gostop"></div><div class="gs-end"></div></div>`;
    const $ = (s) => el.querySelector(s);
    let v = null;          // 지금 화면에 다 그린 정보
    let shown = null;      // 마지막으로 끝까지 보여 준 정보 (다음 차례 그림의 출발점)
    let sel = -1; let lastEv = 0; let lastRound = 0; let popT = 0; let endKey = ''; let lastTurn = -2;
    const queue = []; let busy = false; let timers = [];
    const card = (id, cls, attrs) => `<div class="gs-card${cls ? ' ' + cls : ''}" ${attrs || ''}>${W.svg(id)}</div>`;

    function capSummary(cards) {
      const g = groups(cards);
      return `<span class="gs-cs"><i class="k-g">광</i>${g.gwang.length}</span><span class="gs-cs"><i class="k-y">열</i>${g.yeol.length}</span><span class="gs-cs"><i class="k-t">띠</i>${g.tti.length}</span><span class="gs-cs"><i class="k-p">피</i>${piCount(cards)}</span>`;
    }

    /* ---------- 그리기 (o.floor: 중간 바닥 · o.hl: 카드별 강조 · o.base: 가져간 카드는 이 정보로) ---------- */
    function draw(view, o) {
      const opt = o || {};
      const n = view.seats.length; const me = view.me == null ? -1 : view.me;
      const capV = opt.base || view;
      // 다른 사람
      let oh = '';
      for (let k = 1; k <= n; k++) {
        const i = me < 0 ? k - 1 : (me + k) % n;
        if (i === me) continue;
        const s = capV.seats[i]; const info = api.seat(i);
        const seller = view.seller === i;
        const act = (opt.actor != null ? opt.actor : view.toAct) === i;
        oh += `<div class="gs-opp${act ? ' turn' : ''}${seller ? ' rest' : ''}"><span class="av">${info.av}</span>
          <div class="gs-o-t"><b>${esc(info.name)}</b><span class="gs-o-sc">${seller ? '광 팔고 쉬어요' : `${s.score}점${s.go ? ` · <em>${s.go}고</em>` : ''}${s.shake ? ' · 흔듦' : ''}${s.bomb ? ' · 폭탄' : ''}`}</span></div>
          ${seller ? '' : `<div class="gs-o-b"><span class="gs-hn">🂠 ${view.seats[i].n}</span>${capSummary(s.cap)}</div>`}
          <span class="gs-o-tot${s.total < 0 ? ' neg' : ''}">${s.total > 0 ? '+' : ''}${s.total}</span></div>`;
      }
      $('.gs-opps').innerHTML = oh;
      // 더미 · 바닥
      $('.gs-deck').innerHTML = `<div class="gs-card">${W.svg(-1)}</div><span>${opt.deck != null ? opt.deck : view.deck}</span>`;
      const floor = opt.floor || view.floor;
      const hl = opt.hl || {};
      const selMonth = sel >= 0 && !opt.floor ? month(sel) : 0;
      const byM = {};
      floor.forEach((c) => { (byM[month(c)] = byM[month(c)] || []).push(c); });
      const choose = opt.floor ? [] : (view.choose || []);
      $('.gs-fl').innerHTML = Object.keys(byM).sort((a, b) => a - b).map((m) => {
        const cs = byM[m];
        const hit = Number(m) === selMonth;
        const spread = cs.some((c) => choose.includes(c));   // 고를 때는 겹치지 않게 펼쳐요
        const taking = cs.some((c) => hl[c] === 'taking');
        return `<div class="gs-grp${hit ? ' hit' : ''}${cs.length >= 3 && !taking ? ' ppeok' : ''}${spread ? ' spread' : ''}${taking ? ' taking' : ''}" data-fm="${m}">${cs.map((c) => card(c, `${choose.includes(c) ? 'choose' : ''}${hl[c] ? ' ' + hl[c] : ''}`, `data-fc="${c}"`)).join('')}</div>`;
      }).join('') + (!opt.floor && view.pending != null && view.toAct === me ? `<div class="gs-grp pend">${card(view.pending, 'pending')}</div>` : '');
      // 내가 가져간 카드
      if (me >= 0 && view.seller !== me) {
        const cap = capV.seats[me].cap;
        const g = groups(cap);
        const d = opt.base ? (opt.base.myDetail || {}) : (view.myDetail || {});
        const fresh = new Set(opt.fresh || []);
        const row = (lbl, cs, cls, extra) => `<div class="gs-cr ${cls}"><i>${lbl}</i><div class="gs-cr-c">${cs.map((c) => card(c, fresh.has(c) ? 'got' : '')).join('')}</div><b>${extra}</b></div>`;
        $('.gs-mycap').innerHTML = `<div class="gs-cap-rows">${row('광', g.gwang, 'k-g', g.gwang.length)}${row('열', g.yeol, 'k-y', g.yeol.length)}${row('띠', g.tti, 'k-t', g.tti.length)}${row('피', g.pi, 'k-p', piCount(cap))}</div>
          <div class="gs-myscore"><b class="disp">${d.total || 0}</b><span>점</span><small>${view.threshold}점부터 고·스톱</small><small class="gs-tot">합계 ${capV.seats[me].total > 0 ? '+' : ''}${capV.seats[me].total}</small></div>`;
      } else $('.gs-mycap').innerHTML = me >= 0 && view.seller === me ? '<div class="gs-rest">이번 판은 광을 팔고 쉬어요 🍵</div>' : '<div class="gs-rest">구경 중</div>';
      // 내 손패
      const hand = view.hand || [];
      if (sel >= 0 && !hand.includes(sel)) sel = -1;
      const playable = (view.opts && view.opts.play) || [];
      const shakeM = new Set(((view.opts && view.opts.shake) || []));
      $('.gs-hand').innerHTML = hand.map((c) => {
        const match = kind(c) === 'bonus' || view.floor.some((f) => month(f) === month(c));
        return card(c, `${c === sel ? 'sel' : ''}${playable.includes(c) && match ? ' match' : ''}${shakeM.has(month(c)) ? ' trio' : ''}`, `data-hc="${c}"`);
      }).join('');
      $('.gs-hand').classList.toggle('two', hand.length > 7);
      if (opt.floor) { $('.gs-acts').innerHTML = '<div class="gs-msg">&nbsp;</div>'; $('.gs-gostop').className = 'gs-gostop'; return; }
      renderActs(view);
      renderGoStop(view);
      renderEnd(view);
    }

    function renderActs(view) {
      const vv = view || v;
      if (!vv) return;
      const me = vv.me; const box = $('.gs-acts');
      const o = vv.opts || {};
      const out = [];
      const myTurn = me != null && vv.toAct === me;
      if (myTurn && vv.phase === 'play') {
        if (o.flipOnly) out.push('<button type="button" class="btn gs-b go" data-gs="flip">뒤집기 (폭탄 뒤)</button>');
        (o.bomb || []).forEach((m) => out.push(`<button type="button" class="btn gs-b bomb" data-gs="bomb" data-m="${m}">💣 ${m}월 폭탄</button>`));
        (o.shake || []).forEach((m) => out.push(`<button type="button" class="btn gs-b shake" data-gs="shake" data-m="${m}">${m}월 흔들기</button>`));
        if (sel >= 0) out.push('<button type="button" class="btn gs-b go" data-gs="play">이 카드 내기</button>');
      }
      let msg = '';
      if (myTurn && vv.phase === 'play' && !o.flipOnly) msg = sel >= 0 ? (kind(sel) === 'bonus' ? '보너스 쌍피: 내면 바로 내 것 + 한 장 더 받아요' : '한 번 더 누르거나 [이 카드 내기]') : '낼 카드를 눌러요 (초록빛 카드는 바닥과 같은 달)';
      else if (myTurn && vv.phase === 'choose') msg = '가져갈 바닥 카드를 하나 골라요 (빛나는 카드)';
      else if (vv.toAct >= 0 && vv.toAct !== me) msg = `<span class="bd-dots">${esc(api.seat(vv.toAct).name)} 차례</span>`;
      const left = myTurn && vv.deadline ? Math.max(0, Math.ceil((vv.deadline - api.now()) / 1000)) : 0;
      box.innerHTML = (out.length ? `<div class="gs-btns">${out.join('')}</div>` : '') + `<div class="gs-msg">${msg}${left && left <= 12 ? ` <b class="gs-left">${left}초</b>` : ''}</div>`;
    }

    function renderGoStop(view) {
      const box = $('.gs-gostop');
      if (!(view.me != null && view.toAct === view.me && view.phase === 'gostop')) { box.className = 'gs-gostop'; return; }
      const d = view.myDetail || {};
      const go = view.seats[view.me].go;
      box.innerHTML = `<div class="gs-gs-card"><div class="gs-gs-t disp">${d.total}점!</div><div class="hint-md">${go ? `지금 ${go}고 · ` : ''}더 해서 점수를 키울까요(고), 여기서 끝낼까요(스톱)?</div>
        <div class="gs-gs-btns"><button type="button" class="btn gs-b gogo disp" data-gs="go">고!</button><button type="button" class="btn gs-b stop disp" data-gs="stop">스톱</button></div>
        <div class="hint-sm">고를 하면 1고 +1점 · 2고 +2점 · 3고부터 2배씩. 대신 남이 먼저 나면 손해!</div></div>`;
      box.className = 'gs-gostop show';
    }

    function pop(txt) {
      if (!txt) return;
      const p = $('.gs-pop');
      p.innerHTML = txt;
      p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
      clearTimeout(popT); popT = setTimeout(() => p.classList.remove('show'), 1500);
      api.sfx('whoosh'); api.vibrate(25);
    }
    function popText(e) {
      const who = e.s >= 0 ? esc(api.seat(e.s).name) + ' ' : '';
      if (EV[e.k]) return who + EV[e.k];
      if (e.k === 'go') return `${who}${e.n}고!`;
      if (e.k === 'stop') return `${who}스톱!`;
      return '';
    }

    function renderEnd(view) {
      const box = $('.gs-end');
      const e = view.end;
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
      box.innerHTML = `<div class="gs-end-card">${body}<div class="gs-end-next">${view.over ? '마지막 판이었어요!' : `${e.round}/${view.rounds}판 · 곧 다음 판`}</div><div class="gs-credit">화투 그림: Louie Mantia 원작을 고쳐 그림 (CC BY-SA 4.0)</div></div>`;
      box.className = 'gs-end show';
      const key = String(e.round);
      if (endKey !== key) { endKey = key; if (view.me != null && e.winner === view.me) { api.sfx('fanfare'); api.vibrate([50, 30, 90]); } else api.sfx('end'); }
    }

    /* ---------- 한 차례를 천천히 보여 주기 ---------- */
    function later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); }
    let current = null;
    function render(view) {
      // 같은 정보가 여러 번 올 수 있어요 (상태 알림 + 화면 정보) → 한 번만
      if (view === current || view === v || queue.includes(view)) { if (!busy && view === v) draw(v); return; }
      queue.push(view);
      if (!busy) next();
    }
    function next() {
      const nv = queue.shift();
      if (!nv) { busy = false; current = null; return; }
      current = nv;
      busy = true;
      if (nv.round !== lastRound) { lastRound = nv.round; sel = -1; shown = null; api.sfx('whoosh'); }
      const evs = (nv.events || []).filter((e) => e.id > lastEv);
      if (evs.length) lastEv = Math.max(...evs.map((e) => e.id));
      const base = shown;
      const moving = evs.some((e) => e.k === 'play' || e.k === 'flip' || e.k === 'take' || e.k === 'bomb');
      // 밀린 화면이 많거나 새 판이면 바로
      if (!base || !moving || queue.length > 2 || evs.some((e) => e.k === 'deal')) {
        finish(nv, evs, base);
        return;
      }
      const steps = [];
      let floor = base.floor.slice();
      let deck = base.deck;
      const actor = (evs.find((e) => e.s >= 0) || {}).s;
      const hasPlay = evs.some((e) => e.k === 'play' || e.k === 'bomb');
      if (!hasPlay && base.pending != null) { floor = floor.concat([base.pending]); }
      evs.forEach((e) => {
        if (e.k === 'shake') steps.push({ pop: popText(e) });
        if (e.k === 'play') { floor = floor.concat([e.c]); steps.push({ floor: floor.slice(), hl: { [e.c]: 'land' }, ms: STEP_MS.land, sfx: 'pop' }); }
        if (e.k === 'bomb') { floor = floor.concat(e.cards.filter((c) => !floor.includes(c))); const h = {}; e.cards.forEach((c) => { h[c] = 'land'; }); steps.push({ floor: floor.slice(), hl: h, ms: STEP_MS.land, sfx: 'pop', pop: popText(e) }); }
        if (e.k === 'flip') { floor = floor.concat([e.c]); deck -= 1; steps.push({ floor: floor.slice(), hl: { [e.c]: 'flip' }, deck, ms: STEP_MS.flip, sfx: 'pop' }); }
        if (e.k === 'take') {
          const h = {}; e.cards.forEach((c) => { h[c] = 'taking'; });
          const more = e.cards.filter((c) => !floor.includes(c));   // 바닥에 없던 카드(폭탄 등)는 잠깐 보여 줘요
          steps.push({ floor: floor.concat(more), hl: h, deck, ms: STEP_MS.take, sfx: 'soft', pop: evs.filter((x) => ['jjok', 'ppeok', 'ttadak', 'sweep', 'ppeok_eat', 'bonus'].includes(x.k)).map(popText)[0] || '' });
          floor = floor.filter((c) => !e.cards.includes(c));
        }
      });
      // 뻑처럼 가져간 게 없으면 특별한 일 알림만
      if (!evs.some((e) => e.k === 'take')) {
        const sp = evs.filter((x) => ['jjok', 'ppeok', 'ttadak', 'sweep', 'ppeok_eat', 'bonus'].includes(x.k)).map(popText)[0];
        if (sp) steps.push({ floor: floor.slice(), hl: {}, deck, ms: 650, pop: sp });
      }
      let k = 0;
      const run = () => {
        if (k >= steps.length) { finish(nv, evs, base, true); return; }
        const s = steps[k++];
        if (s.pop) pop(s.pop);
        if (s.sfx) api.sfx(s.sfx);
        if (s.floor) draw(nv, { floor: s.floor, hl: s.hl, base, deck: s.deck != null ? s.deck : base.deck, actor });
        later(run, s.ms || 500);
      };
      run();
    }
    function finish(nv, evs, base, animated) {
      v = nv;
      // 새로 가져간 카드는 내 자리에서 잠깐 반짝
      const me = nv.me;
      const fresh = me != null && base && nv.seats[me] ? nv.seats[me].cap.filter((c) => !base.seats[me].cap.includes(c)) : [];
      draw(nv, { fresh });
      if (!animated) {
        const t = evs.map(popText).filter(Boolean).slice(-1)[0];
        if (t) pop(t);
      } else {
        const t = evs.filter((e) => e.k === 'go' || e.k === 'stop').map(popText)[0];
        if (t) pop(t);
      }
      if (nv.toAct !== lastTurn) { if (nv.toAct === me && me != null) { api.sfx('soft'); api.vibrate([20, 40, 20]); } lastTurn = nv.toAct; }
      shown = nv;
      later(next, queue.length ? 120 : 0);
    }

    function play(c) { api.act({ k: 'play', c }); sel = -1; api.sfx('pop'); }
    el.addEventListener('click', (ev) => {
      if (!v || busy) return;
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
        if (!myTurn || v.phase !== 'play') { sel = sel === c ? -1 : c; draw(v); return; }
        if ((v.opts && v.opts.flipOnly)) { api.say('폭탄 뒤 두 번은 뒤집기만 해요'); return; }
        if (sel === c) { play(c); return; }
        sel = c; api.tick(); draw(v); return;
      }
      const b = ev.target.closest('[data-gs]');
      if (!b) return;
      const k = b.dataset.gs;
      if (k === 'play' && sel >= 0) play(sel);
      else if (k === 'flip') { api.act({ k: 'flip' }); api.sfx('pop'); }
      else if (k === 'bomb' || k === 'shake') { api.act({ k, m: Number(b.dataset.m) }); api.vibrate(30); }
      else if (k === 'go' || k === 'stop') { api.act({ k }); api.vibrate(40); }
    });
    return {
      render,
      tick() { if (v && !busy) renderActs(v); },
      busy: () => busy || queue.length > 0,
      destroy() { clearTimeout(popT); timers.forEach(clearTimeout); el.innerHTML = ''; }
    };
  }

  C.register({
    id: 'gostop',
    kind: 'table',
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#C81E2C"/>${W.image(0, 5, 6, 15, -10)}${W.image(28, 19, 7, 15, 9)}</svg>`,
    rulesText: '2명은 맞고(7점), 3명은 고스톱(3점), 4명은 한 명씩 광 팔고 쉬어요 · 같은 달 카드를 맞춰 가져가요 · 점수가 나면 고 또는 스톱 · 5판 합계',
    learn: '화투는 포르투갈 카드가 일본(하나후다)을 거쳐 들어와 우리나라에서 고스톱으로 꽃피었어요. 열두 달의 꽃과 동물이 그려져 있어서 "꽃 싸움(花鬪)"이라고 해요. (화투 그림: Louie Mantia 원작을 우리 화투 색으로 고쳐 그림, CC BY-SA 4.0)',
    bar(v) { return v.round ? `<span class="cd-info">${v.round}/${v.rounds}판</span><span class="cd-info">${v.players.length === 2 ? '맞고' : '고스톱'} · <b>${v.threshold}점</b>부터</span>${v.nagari > 1 ? `<span class="cd-info">나가리 <b>×${v.nagari}</b></span>` : ''}` : ''; },
    rankLabel(v, i) { return v && v.seats[i] ? `${v.seats[i].total > 0 ? '+' : ''}${v.seats[i].total}점` : ''; },
    mount
  });
})();
