/* 아리채 오락실 · 공기놀이 화면
   - 위에서 내려다본 바닥. 돌을 던지면 점점 커졌다가(올라감) 작아져요(내려옴)
   - 던진 돌이 떠 있는 동안 바닥 돌을 눌러서 줍고, 떨어질 때(초록 테두리) 던진 돌이나 [잡기]를 눌러요
   - 5단 꺾기: 다섯 개를 던져 손등으로 받기(타이밍) → 다시 던져 잡기
   손놀림은 내 화면에서만 계산하고, 단계가 끝나면 성공·실패만 서버에 알려요 */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#FF5E7E', '#FFC400', '#2ED573', '#3BA7FF', '#A66BFF'];
  const PLAN = { 1: [1, 1, 1, 1], 2: [2, 2], 3: [1, 3], 4: [4] };
  const AIR = { easy: 2200, normal: 1750, hard: 1350 };
  const STAGE_NAME = { 1: '1단 · 하나씩', 2: '2단 · 둘씩', 3: '3단 · 하나 + 셋', 4: '4단 · 넷 한꺼번에', 5: '5단 · 꺾기' };

  function pebble(c, r) {
    return `<ellipse cx="0" cy="${r * 0.25}" rx="${r}" ry="${r * 0.55}" fill="rgba(0,0,0,.25)"/><circle r="${r}" fill="${c}"/><circle r="${r}" fill="url(#gg-sh)"/><circle cx="${-r * 0.35}" cy="${-r * 0.35}" r="${r * 0.28}" fill="#fff" opacity=".55"/>`;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="gg"><div class="gg-players"></div><div class="gg-title"></div><div class="gg-wrap"><div class="gg-floor">
      <svg class="gg-svg" viewBox="0 0 100 110"><defs><radialGradient id="gg-sh" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>
        <linearGradient id="gg-mat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6E3C0"/><stop offset="1" stop-color="#E8CC9C"/></linearGradient></defs>
        <rect width="100" height="110" rx="6" fill="url(#gg-mat)"/><g class="gg-hand"></g><g class="gg-stones"></g><g class="gg-air"></g></svg></div></div>
      <div class="gg-ctl"></div></div>`;
    const $ = (s) => el.querySelector(s);
    const svg = $('.gg-svg');
    let v = null; let lastEv = 0; let play = null; let raf = 0;
    const nm = (i) => esc(api.seat(i).name);
    const fit = () => { const w = $('.gg-wrap'); const b = $('.gg-floor'); const s = Math.min(w.clientHeight, w.clientWidth * 110 / 100); b.style.height = `${Math.floor(s)}px`; b.style.width = `${Math.floor(s * 100 / 110)}px`; };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    requestAnimationFrame(fit);
    const myTurn = () => v && v.me != null && v.toAct === v.me;

    /* ---------- 한 단계 놀이 (내 화면에서만) ---------- */
    function newStage() {
      const st = v.stage[v.me];
      const floor = [];
      for (let k = 0; k < (st === 5 ? 0 : 4); k++) {
        let x; let y; let tries = 0;
        do { x = 16 + Math.random() * 68; y = 12 + Math.random() * 48; tries++; } while (tries < 40 && floor.some((f) => Math.hypot(f.x - x, f.y - y) < 13));
        floor.push({ id: k + 1, x, y, c: COLORS[k + 1], taken: false });
      }
      play = { st, throws: st === 5 ? [] : PLAN[st].slice(), ti: 0, floor, inHand: st === 5 ? 5 : 1, phase: 'ready', picks: 0, need: 0, t0: 0, air: AIR[v.speed] || 1750, kept: 0, caught: 0 };
      drawPlay(); drawCtl();
    }
    function fail(why) {
      if (!play) return;
      play.phase = 'done';
      cancelAnimationFrame(raf);
      api.say(why); api.sfx('bad'); api.vibrate([25, 25, 25]);
      const st = play.st;
      setTimeout(() => { api.act({ k: 'result', st, ok: false }); play = null; drawAll(); }, 900);
      drawCtl();
    }
    function stageDone(ok, n) {
      const st = play.st;
      play.phase = 'done'; drawCtl();
      if (ok) { api.sfx(st === 5 ? 'fanfare' : 'perfect'); api.vibrate([30, 30, 60]); api.say(st === 5 ? `꺾기 성공! ${n}년` : `${STAGE_NAME[st]} 성공!`); }
      setTimeout(() => { api.act({ k: 'result', st, ok, n: n || 0 }); play = null; }, 700);
    }
    function throwUp() {
      if (!play || play.phase !== 'ready') return;
      if (play.st === 5) { play.phase = 'up5'; play.t0 = performance.now(); play.inHand = 0; api.sfx('whoosh'); loop(); drawCtl(); return; }
      play.need = play.throws[play.ti]; play.picks = 0; play.phase = 'air'; play.t0 = performance.now(); play.inHand -= 1;
      api.sfx('whoosh'); drawPlay(); loop(); drawCtl();
    }
    function catchWindow(t, T) { return t > T * 0.62; }
    function tryCatch() {
      if (!play) return;
      const now = performance.now();
      if (play.phase === 'air') {
        const t = now - play.t0;
        if (!catchWindow(t, play.air)) { fail('너무 일찍 잡았어요!'); return; }
        if (play.picks !== play.need) { fail(play.picks < play.need ? `${play.need}개를 주워야 해요!` : '너무 많이 주웠어요!'); return; }
        cancelAnimationFrame(raf);
        api.sfx('pop');
        play.kept += play.picks; play.inHand = 1;
        play.ti += 1;
        if (play.ti >= play.throws.length) { drawPlay(); stageDone(true); return; }
        play.phase = 'ready'; drawPlay(); drawCtl();
        return;
      }
      if (play.phase === 'up5') {
        // 손등으로 받기: 떨어지는 순간(T)에 가까울수록 많이
        const err = Math.abs((now - play.t0) - play.air) / play.air;
        const n = err < 0.06 ? 5 : err < 0.12 ? 4 : err < 0.2 ? 3 : err < 0.3 ? 2 : err < 0.42 ? 1 : 0;
        cancelAnimationFrame(raf);
        if (!n) { fail('손등에 하나도 못 받았어요!'); return; }
        play.caught = n; play.phase = 'back'; drawPlay(); drawCtl(); api.sfx('pop');
        api.say(`손등에 ${n}개!`);
        return;
      }
      if (play.phase === 'up5b') {
        const t = now - play.t0; const T = play.air * 0.7;
        if (t < T * 0.55) { fail('너무 일찍 잡았어요!'); return; }
        cancelAnimationFrame(raf);
        drawPlay(); stageDone(true, play.caught);
      }
    }
    function tossBack() {
      if (!play || play.phase !== 'back') return;
      play.phase = 'up5b'; play.t0 = performance.now(); api.sfx('whoosh'); loop(); drawCtl();
    }
    function loop() {
      cancelAnimationFrame(raf);
      const tick = (now) => {
        if (!play) return;
        const T = play.phase === 'up5b' ? play.air * 0.7 : play.air;
        const t = now - play.t0;
        if (t > T + 260) {
          if (play.phase === 'air') fail('떨어뜨렸어요!');
          else if (play.phase === 'up5') fail('손등에 하나도 못 받았어요!');
          else if (play.phase === 'up5b') fail('놓쳤어요!');
          return;
        }
        drawAir(t / T);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    /* ---------- 그리기 ---------- */
    function handSVG(count, back) {
      return `<g transform="translate(50 96)"><path d="M-16 6 Q-18 -6 -10 -8 L10 -8 Q18 -6 16 6 Z" fill="#F2C9A0" stroke="#C99A72" stroke-width=".6"/>
        <text y="4" font-size="5" text-anchor="middle" fill="#7A4A1E">${back ? '손등' : '손'} ${count ? `· ${count}개` : ''}</text></g>`;
    }
    function drawPlay() {
      if (!play) { $('.gg-stones').innerHTML = ''; $('.gg-air').innerHTML = ''; $('.gg-hand').innerHTML = ''; return; }
      $('.gg-stones').innerHTML = play.floor.filter((f) => !f.taken).map((f) => `<g transform="translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})" class="gg-st" data-st="${f.id}">${pebble(f.c, 4.2)}<circle r="8" fill="transparent"/></g>`).join('');
      $('.gg-hand').innerHTML = handSVG(play.phase === 'back' ? play.caught : play.inHand + (play.phase === 'ready' ? 0 : play.picks), play.phase === 'back');
      $('.gg-air').innerHTML = play.phase === 'ready' || play.phase === 'back' ? '' : '';
    }
    function drawAir(f) {
      // f: 0 → 1 (던짐 → 떨어짐). 올라갈수록 커져요
      const h = Math.sin(Math.min(1, f) * Math.PI);
      const r = 4.2 * (1 + h * 1.1);
      const n = play.phase === 'air' ? 1 : play.phase === 'up5' ? 5 : play.caught;
      const ready = play.phase === 'air' ? catchWindow(f * play.air, play.air) : f > 0.6;
      let g = '';
      for (let k = 0; k < n; k++) {
        const ox = n > 1 ? (k - (n - 1) / 2) * 7 * (0.6 + h) : 0;
        g += `<g transform="translate(${(50 + ox).toFixed(1)} ${(80 - h * 30).toFixed(1)})">${pebble(COLORS[(k + (play.phase === 'air' ? 0 : 0)) % 5], r)}</g>`;
      }
      g += `<g transform="translate(50 80)" class="gg-catch" data-catch="1"><circle r="${12}" fill="${ready ? 'rgba(46,213,115,.18)' : 'transparent'}" stroke="${ready ? '#2ED573' : 'rgba(0,0,0,.15)'}" stroke-width="${ready ? 1.2 : .5}" stroke-dasharray="${ready ? '0' : '2 1.5'}"/></g>`;
      $('.gg-air').innerHTML = g;
    }
    function drawPlayers() {
      $('.gg-players').innerHTML = v.score.map((s, i) => `<div class="gg-pl${v.turn === i && !v.over ? ' turn' : ''}"><span class="av">${api.seat(i).av}</span><b>${nm(i)}</b><span class="gg-st-n">${v.stage[i]}단</span><span class="gg-sc">${s}년</span></div>`).join('');
    }
    function drawCtl() {
      const box = $('.gg-ctl');
      let h;
      if (v.over) h = '<div class="lr-hint">끝!</div>';
      else if (!myTurn()) h = `<div class="lr-hint"><span class="bd-dots">${nm(v.turn)}님 ${STAGE_NAME[v.stage[v.turn]]} 도전 중</span></div>`;
      else if (!play) h = '<div class="lr-hint">&nbsp;</div>';
      else if (play.phase === 'ready') h = `<button type="button" class="btn btn-yellow gg-big" data-gg="throw">${play.st === 5 ? '다섯 개 던지기 ↑' : `던지기 ↑ (${play.throws[play.ti]}개 줍기)`}</button>`;
      else if (play.phase === 'air') h = `<div class="gg-row"><span class="gg-need">줍기 ${play.picks}/${play.need}</span><button type="button" class="btn btn-ghost gg-big" data-gg="catch">잡기!</button></div>`;
      else if (play.phase === 'up5') h = '<button type="button" class="btn btn-ghost gg-big" data-gg="catch">손등으로 받기!</button>';
      else if (play.phase === 'back') h = '<button type="button" class="btn btn-yellow gg-big" data-gg="toss">손등에서 던지기 ↑</button>';
      else if (play.phase === 'up5b') h = '<button type="button" class="btn btn-ghost gg-big" data-gg="catch">잡기!</button>';
      else h = '<div class="lr-hint">&nbsp;</div>';
      if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
    }
    function drawAll() {
      drawPlayers();
      const st = myTurn() ? v.stage[v.me] : null;
      $('.gg-title').innerHTML = myTurn() ? `<b class="lr-hot">내 차례!</b> ${STAGE_NAME[st]}` : `목표 ${v.goal}년`;
      if (myTurn() && !play) newStage();
      if (!myTurn() && play) { play = null; cancelAnimationFrame(raf); }
      if (!play) drawPlay();
      drawCtl();
    }
    function render(view) {
      v = view;
      const evs = (v.events || []).filter((e) => e.id > lastEv);
      if (evs.length) lastEv = Math.max(...evs.map((e) => e.id));
      evs.forEach((e) => {
        if (e.s === v.me) return;
        if (e.k === 'ok') api.say(`${nm(e.s)}: ${e.st}단 성공`);
        if (e.k === 'miss') api.say(`${nm(e.s)}: 아이고, 실수!`);
        if (e.k === 'kkeok') { api.say(`${nm(e.s)}: 꺾기 ${e.n}년!`); api.sfx('good'); }
      });
      if (play && play.phase === 'done') return;
      if (play && myTurn() && v.stage[v.me] !== play.st) play = null;
      drawAll();
    }
    svg.addEventListener('pointerdown', (e) => {
      if (!play) return;
      const s = e.target.closest('[data-st]');
      if (s && play.phase === 'air') {
        e.preventDefault();
        const f = play.floor.find((x) => x.id === Number(s.dataset.st));
        if (f && !f.taken) { f.taken = true; play.picks += 1; api.sfx('tick'); drawPlay(); drawCtl(); if (play.picks > play.need) fail('너무 많이 주웠어요!'); }
        return;
      }
      if (e.target.closest('[data-catch]')) { e.preventDefault(); tryCatch(); }
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-gg]');
      if (!b) return;
      if (b.dataset.gg === 'throw') throwUp();
      else if (b.dataset.gg === 'catch') tryCatch();
      else if (b.dataset.gg === 'toss') tossBack();
    });
    return {
      render, tick() {}, destroy() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); el.innerHTML = ''; },
      // 시험용: 지금 단계를 성공·실패로
      _auto(ok) { if (!play || !myTurn()) return false; const st = play.st; play.phase = 'done'; api.act({ k: 'result', st, ok, n: st === 5 ? 3 : 0 }); play = null; return true; },
      _play: () => play
    };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#F6E3C0"/><circle cx="12" cy="27" r="4" fill="#FF5E7E"/><circle cx="21" cy="30" r="4" fill="#2ED573"/><circle cx="29" cy="25" r="4" fill="#3BA7FF"/><circle cx="17" cy="20" r="4" fill="#A66BFF"/><circle cx="24" cy="9" r="5" fill="#FFC400"/><path d="M24 15 v4" stroke="#C99A00" stroke-dasharray="1.5 1.5"/></svg>';

  C.register({
    id: 'gonggi',
    kind: 'table',
    icon: ICON,
    rulesText: '돌 하나를 던져 올리고, 떨어지기 전에 바닥 돌을 줍고 다시 받아요 · 1단 하나씩 → 2단 둘씩 → 3단 하나+셋 → 4단 넷 → 5단 꺾기(손등으로 받은 만큼 년) · 실수하면 다음 사람',
    learn: '공기놀이는 옛날부터 작은 돌로 하던 놀이예요. 눈과 손이 함께 움직여야 해서 "눈-손 협응력"이 좋아져요. 꺾기에서 받은 개수를 "년"이라고 세요!',
    optionsUI: [{ key: 'goal', label: '목표', names: { 10: '10년', 5: '5년', 20: '20년' } }, { key: 'speed', label: '돌 빠르기', names: { normal: '보통', easy: '느리게', hard: '빠르게' } }],
    bar(v) { return v.me != null ? `<span class="cd-info">내 ${v.stage[v.me]}단 · <b>${v.score[v.me]}</b>/${v.goal}년</span>` : `<span class="cd-info">목표 ${v.goal}년</span>`; },
    rankLabel(v, i) { return v && v.score ? `${v.score[i]}년` : ''; },
    mount
  });
})();
