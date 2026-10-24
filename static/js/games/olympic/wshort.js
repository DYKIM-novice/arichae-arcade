/* 아리채 오락실 · 올림픽(동계) · 쇼트트랙 (3바퀴)
   위에서 내려다본 빙판. 직선에서는 빨·파 연타로 속도를 올리고,
   곡선에서는 초록을 꾹 눌러 몸을 기울여요. 안 기울이고 너무 빠르면 꽈당!
   직선에서 초록을 누르고 있으면 느려지니 떼고 연타! */
(function () {
  'use strict';
  const O = window.Oly;
  const G = window.Games;
  const { HEX, SHADE, LIGHT, shape } = G.kit;
  const STEP = O.SIM_STEP || 10;

  const S = 28.85; const R = 8.5;              // 직선 길이 · 곡선 반지름(m)
  const LAP = 2 * S + 2 * Math.PI * R;          // 한 바퀴
  const LAPS = 3;
  const D = LAP * LAPS;
  const SAFE = 8.6;          // 안 기울이고 버틸 수 있는 곡선 속도
  const LEAN_MAX = 12.6;     // 기울였을 때
  const FALL = 11.2;         // 안 기울이고 이보다 빠르면 넘어져요

  // 트랙 위 자리: s(m) → 직선/곡선 · (x,y) 좌표(m, 가운데 0,0) · 방향
  function seg(s) {
    const u = ((s % LAP) + LAP) % LAP;
    if (u < S) return { curve: false, x: -S / 2 + u, y: R, a: 0 };
    if (u < S + Math.PI * R) { const t = (u - S) / R; return { curve: true, x: S / 2 + Math.sin(t) * R, y: Math.cos(t) * R, a: -t }; }
    if (u < 2 * S + Math.PI * R) { const k = u - S - Math.PI * R; return { curve: false, x: S / 2 - k, y: -R, a: Math.PI }; }
    const t = (u - 2 * S - Math.PI * R) / R;
    return { curve: true, x: -S / 2 - Math.sin(t) * R, y: -Math.cos(t) * R, a: Math.PI - t };
  }
  // 곡선이 곧 오나 (m 앞)
  const curveAhead = (s, m) => seg(s + m).curve && !seg(s).curve;

  const sim = {
    init() { return { v: 0, x: 0, mash: new O.Masher(66), lean: false, state: 0, waitUntil: 0, fallUntil: 0, falls: 0 }; },
    press(st, c, e, gun) {
      if (c === 'g') { if (e >= gun) st.lean = true; return null; }
      if (c !== 'r' && c !== 'b') return null;
      if (e < gun) { if (!st.waitUntil) { st.waitUntil = gun + 1000; st.state = 1; return { say: '부정출발! 1초 늦게 출발해요', sfx: 'bad', vib: [40, 40, 40] }; } return null; }
      if ((st.waitUntil && e < st.waitUntil) || e < st.fallUntil) return null;
      if (st.mash.press(c, e) === 1) { st.v = Math.min(13.5, st.v + (seg(st.x).curve ? 0.45 : 0.85)); return { sfx: 'step', vib: 5 }; }
      return null;
    },
    release(st, c) { if (c === 'g') st.lean = false; },
    step(st, dt, e) {
      if (st.state === 1 && e >= st.waitUntil) st.state = 0;
      if (st.state === 2 && e >= st.fallUntil) st.state = 0;
      const sg = seg(st.x);
      let out = null;
      if (st.state !== 2) {
        if (sg.curve) {
          if (!st.lean && st.v > FALL) {
            st.state = 2; st.fallUntil = e + 1300; st.v = 1.5; st.falls += 1;
            out = { say: '꽈당! 곡선에선 초록 꾹!', color: '#FF8B95', sfx: 'bad', vib: [60, 40, 60], ms: 1400 };
          } else {
            const cap = st.lean ? LEAN_MAX : SAFE;
            if (st.v > cap) st.v -= (st.v - cap) * 2.4 * dt;
          }
        } else if (st.lean) st.v -= 3.2 * dt;     // 직선에서 기울이면 느려져요
      }
      st.v = Math.max(0, st.v * Math.exp(-0.55 * dt));
      st.x += st.v * dt;
      st.curve = sg.curve;
      return out;
    }
  };

  function create(ctx) {
    const gun = (ctx.ev && ctx.ev.gun) || 2400;
    const list = O.roster(ctx);
    ctx.stage.innerHTML = '';
    const wrap = G.kit.el('<div class="oly-wrap osh"><div class="oly-top"></div><div class="oly-scene"></div><div class="oly-hud"></div><div class="oly-msg"></div></div>');
    ctx.stage.appendChild(wrap);
    const scene = wrap.querySelector('.oly-scene');
    const hud = wrap.querySelector('.oly-hud');
    const msgEl = wrap.querySelector('.oly-msg');
    const strip = O.strip(wrap.querySelector('.oly-top'), list, `${LAPS}바퀴`);
    scene.appendChild((() => { const b = document.createElement('div'); b.className = 'oly-snow'; return b; })());
    const meter = O.rateMeter(hud);
    const tip = G.kit.el('<div class="osh-tip"><span class="osh-st">직선 · 연타!</span><span class="osh-lap"></span><span class="osh-v"><em>0</em> km/h</span></div>');
    hud.prepend(tip);
    const tipSt = tip.querySelector('.osh-st'); const tipLap = tip.querySelector('.osh-lap'); const tipV = tip.querySelector('.osh-v em');
    const svg = O.el('svg', { class: 'oly-svg' });
    scene.appendChild(svg);
    let Wd = 0; let Hd = 0; let k = 1; let cx = 0; let cy = 0; let tokens = {}; let board = null;
    const shown = {};
    function build() {
      Wd = Math.max(200, scene.clientWidth || 360); Hd = Math.max(200, scene.clientHeight || 360);
      const hudH = hud.offsetHeight || 60;
      svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`); svg.setAttribute('width', Wd); svg.setAttribute('height', Hd);
      const avail = Hd - hudH - 16;
      // 세로로 세운 빙판 (폰 화면을 넓게 써요)
      k = Math.min((Wd - 20) / (2 * R + 7), avail / (S + 2 * R + 5));
      cx = Wd / 2; cy = 8 + avail / 2;
      const X = (m) => (cx + m * k).toFixed(1); const Y = (m) => (cy + m * k).toFixed(1);
      const oval = (r) => `M${X(-S / 2)} ${Y(r)} H${X(S / 2)} A${(r * k).toFixed(1)} ${(r * k).toFixed(1)} 0 0 0 ${X(S / 2)} ${Y(-r)} H${X(-S / 2)} A${(r * k).toFixed(1)} ${(r * k).toFixed(1)} 0 0 0 ${X(-S / 2)} ${Y(r)} Z`;
      let blocks = '';
      for (let i = 0; i < 7; i++) {
        const t = (i / 6) * Math.PI;
        blocks += `<circle cx="${X(S / 2 + Math.sin(t) * (R - 2.2))}" cy="${Y(Math.cos(t) * (R - 2.2))}" r="${(0.45 * k).toFixed(1)}" fill="#2A2340"/>`;
        blocks += `<circle cx="${X(-S / 2 - Math.sin(t) * (R - 2.2))}" cy="${Y(-Math.cos(t) * (R - 2.2))}" r="${(0.45 * k).toFixed(1)}" fill="#2A2340"/>`;
      }
      svg.innerHTML = `<rect width="${Wd}" height="${Hd}" fill="#B9D8EE"/>
        <rect x="${(cx - (R + 3.2) * k).toFixed(1)}" y="${(cy - (S / 2 + R + 2.4) * k).toFixed(1)}" width="${(2 * (R + 3.2) * k).toFixed(1)}" height="${((S + 2 * R + 4.8) * k).toFixed(1)}" rx="${((R + 3) * k).toFixed(1)}" fill="#F4FAFF" stroke="#7FB8E0" stroke-width="4"/>
        <g transform="rotate(-90 ${cx} ${cy})"><path d="${oval(R + 2.6)}" fill="none" stroke="#D5E9F7" stroke-width="${(1.4 * k).toFixed(1)}"/>
        <path d="${oval(R)}" fill="none" stroke="#E0435A" stroke-width="1.6" stroke-dasharray="6 6" opacity=".55"/>
        <path d="${oval(R - 2.2)}" fill="#EAF5FD" stroke="#7FB8E0" stroke-width="1.2"/>
        ${blocks}
        <path d="M${X(0)} ${Y(R - 2.6)} V${Y(R + 3.2)}" stroke="#E0435A" stroke-width="3"/></g>
        <text x="${(cx + (R + 1.6) * k).toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="900" fill="#E0435A" font-family="system-ui,sans-serif" transform="rotate(90 ${(cx + (R + 1.6) * k).toFixed(1)} ${cy.toFixed(1)})">출발·결승</text>
        <g transform="translate(${cx} ${cy})">${O.RINGS(0, -6, 1.1)}</g>`;
      board = O.el('text', { x: cx, y: cy + 22, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 900, fill: '#3B6E96', 'font-family': 'system-ui,sans-serif' }, '');
      svg.appendChild(board);
      tokens = {};
      list.slice().reverse().forEach((p, ri) => {
        const a = O.ath(p.athlete);
        const z = (p.me ? 3.4 : 2.8) * k;
        const g = O.el('g', {}, `<g class="osh-tk"><ellipse rx="${(z * 0.62).toFixed(1)}" ry="${(z * 0.46).toFixed(1)}" fill="${a.jersey}" stroke="#2A2340" stroke-width="1.2"/><g transform="translate(${(z * 0.15).toFixed(1)} 0) rotate(90) scale(${(z / 52).toFixed(3)})">${O.HEAD[a.id]('n')}</g></g>
          <g class="osh-tag" transform="translate(0 ${(-z * 1.15).toFixed(1)})"><rect x="-17" y="-7" width="34" height="13" rx="6.5" fill="${p.me ? '#FFD23F' : 'rgba(21,18,43,.7)'}"/><text y="3" text-anchor="middle" font-size="8.5" font-weight="900" fill="${p.me ? '#15122B' : '#fff'}" font-family="system-ui,sans-serif">${p.me ? '나' : G.esc(p.name.slice(0, 4))}</text></g>`);
        svg.appendChild(g);
        tokens[p.pid] = { g, tk: g.firstElementChild, lane: list.length - 1 - ri };
      });
    }
    const st = sim.init();
    st.e = 0; st.fin = 0;
    build();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (scene.clientWidth !== Wd || scene.clientHeight !== Hd) build(); }) : null;
    if (ro) ro.observe(scene);
    const log = [];
    let lastT = 0; let msgT = 0; let finSaid = false; let stage = -1;
    function say(t, c, ms) { msgEl.textContent = t; msgEl.style.color = c || '#fff'; msgEl.classList.remove('show'); void msgEl.offsetWidth; msgEl.classList.add('show'); clearTimeout(msgT); if (ms !== 0) msgT = setTimeout(() => msgEl.classList.remove('show'), ms || 1200); }
    function react(r) { if (!r) return; if (r.say) say(r.say, r.color, r.ms); if (r.sfx && ctx.sfx[r.sfx]) ctx.sfx[r.sfx](); if (r.vib) ctx.vibrate(r.vib); }
    function simTo(e) {
      while (st.e + STEP <= e) {
        st.e += STEP;
        if (st.fin) { st.v *= Math.exp(-2 * STEP / 1000); st.x += st.v * STEP / 1000; continue; }
        react(sim.step(st, STEP / 1000, st.e));
        if (st.x >= D) { st.fin = Math.max(1, st.e - gun); }
      }
    }
    function place(p, s, lean, fall) {
      const T = tokens[p.pid];
      if (!T) return;
      const sg = seg(s);
      const off = (T.lane - (list.length - 1) / 2) * 0.55;    // 겹치지 않게 조금씩 옆으로
      const nx = sg.curve ? (sg.x - (sg.x > 0 ? S / 2 : -S / 2)) / R : 0;
      const ny = sg.curve ? sg.y / R : (sg.y > 0 ? 1 : -1);
      // 빙판을 세웠으니 (x, y) → (y, -x) 로 돌려요
      const dx = (sg.x + nx * off) * k; const dy = (sg.y + ny * off) * k;
      const x = cx + dy; const y = cy - dx;
      const ang = sg.a * 180 / Math.PI - 90;
      T.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      T.tk.setAttribute('transform', `rotate(${(ang + (fall ? 90 : lean ? (sg.curve ? -18 : 0) : 0)).toFixed(1)})`);
      T.g.style.opacity = fall ? 0.6 : 1;
    }
    return {
      start() {},
      tick(t) {
        const e = t - ctx.startAt;
        const dt = Math.min(0.05, Math.max(0, (t - (lastT || t)) / 1000));
        lastT = t;
        const kk = e < gun - 1100 ? 0 : e < gun ? 1 : 2;
        if (kk !== stage) { stage = kk; if (kk === 0) say('제자리에…', '#fff', 0); if (kk === 1) say('차렷!', '#FFE27A', 0); if (kk === 2) { say('탕!', '#FF8B95', 700); ctx.sfx.go(); ctx.vibrate(60); } }
        simTo(e);
        meter.set(st.mash.rate(e));
        const sg = seg(st.x);
        tipSt.textContent = st.state === 2 ? '꽈당…' : sg.curve ? (st.lean ? '기울이는 중 ✓' : '곡선! 초록 꾹!') : curveAhead(st.x, 6) ? '곧 곡선 · 초록 준비' : (st.lean ? '직선 · 초록 떼요!' : '직선 · 연타!');
        tip.className = 'osh-tip ' + (sg.curve ? (st.lean ? 'ok' : 'warn') : st.lean ? 'warn' : '');
        tipLap.textContent = `${Math.min(LAPS, Math.floor(st.x / LAP) + 1)}/${LAPS}바퀴`;
        tipV.textContent = Math.round(st.v * 3.6);
        board.textContent = e < gun ? '0.00' : st.fin ? (st.fin / 1000).toFixed(2) : ((e - gun) / 1000).toFixed(2);
        const live = ctx.live();
        let rank = 1;
        list.forEach((p) => {
          if (p.me) { place(p, st.x, st.lean, st.state === 2); strip.set(p.pid, st.x / D); return; }
          const a = live[p.pid];
          const target = a ? a[1] || 0 : 0;
          const ex = (a && a[2]) || [];
          shown[p.pid] = shown[p.pid] == null ? target : shown[p.pid] + (target - shown[p.pid]) * (p.bot ? 1 : Math.min(1, dt * 6));
          place(p, shown[p.pid], ex[2] === 1, ex[1] === 2);
          strip.set(p.pid, shown[p.pid] / D);
          const sc = a ? a[0] || 0 : 0;
          if (st.fin ? sc >= 50000 && sc > 100000 - st.fin : (sc >= 50000 || target > st.x)) rank++;
        });
        if (e > gun) ctx.setBadge(`${rank}위`, rank === 1 ? 'y' : 'b');
        ctx.setScore(st.fin ? Math.round(st.fin / 10) / 100 : Math.floor(st.x));
        if (st.fin && !finSaid) { finSaid = true; say(`골인! ${(st.fin / 1000).toFixed(2)}초`, '#FFD23F', 2400); ctx.sfx.perfect(); ctx.vibrate([30, 40, 90]); }
      },
      onPress(c, t) { const e = t - ctx.startAt; simTo(e); log.push([Math.round(e), c]); react(sim.press(st, c, e, gun)); },
      onRelease(c, t) { const e = t - ctx.startAt; simTo(e); log.push([Math.round(e), c.toUpperCase()]); sim.release(st, c); },
      end() { if (ro) ro.disconnect(); clearTimeout(msgT); },
      done: () => !!st.fin && st.e - gun - st.fin > 1500,
      score: () => (st.fin ? 100000 - st.fin : Math.round(st.x * 100)),
      value: () => Math.round(st.x * 100) / 100,
      extra: () => [Math.round(st.v * 100) / 100, st.fin ? 3 : st.state, st.lean ? 1 : 0],
      log: () => log,
      _st: () => st,
      summary: () => (st.fin ? `${(st.fin / 1000).toFixed(2)}초${st.falls ? ` (꽈당 ${st.falls}번)` : ''}` : `${Math.floor(st.x)}m`)
    };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#F4FAFF"/><rect x="5" y="10" width="30" height="20" rx="10" fill="none" stroke="#7FB8E0" stroke-width="3"/><circle cx="30" cy="14" r="3.5" fill="#FF4757"/><circle cx="12" cy="27" r="3.5" fill="#3D7BFF"/><path d="M20 10 V7" stroke="#E0435A" stroke-width="2"/></svg>';

  O.register({
    id: 'wshort',
    title: '쇼트트랙',
    cat: '동계 · 빙상',
    catColor: 'r',
    how: '직선 연타 · 곡선에선 초록 꾹 (3바퀴)',
    icon: ICON,
    buttons: ['r', 'g', 'b'], noGo: true, pressSound: false,
    rules: ['직선에서는 빨·파를 번갈아 연타해서 빨라져요', '곡선에서는 초록을 꾹! 몸을 기울여야 빨리 돌 수 있어요', '안 기울이고 너무 빠르면 꽈당 · 직선에선 초록을 떼요 · 3바퀴'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '직선')}${b('b', '직선')}<svg width="56" height="34" viewBox="0 0 56 34"><rect x="3" y="3" width="50" height="28" rx="14" fill="none" stroke="#7FB8E0" stroke-width="4"/><path d="M42 5 A12 12 0 0 1 42 29" fill="none" stroke="#2ED573" stroke-width="4"/></svg>${b('g', '곡선 꾹')}</div>`;
    },
    fmt: O.fmtTimeScore,
    rival(arr) { const sc = arr ? arr[0] : 0; const x = arr ? arr[1] || 0 : 0; if (sc >= 50000) return { sort: sc, text: O.fmtSec(100000 - sc) }; return { sort: x, text: `${Math.min(LAPS, Math.floor(x / LAP) + 1)}바퀴` }; },
    botLive(perf, e, cur) {
      const g = (cur.ev && cur.ev.gun) || 2400;
      const s = (e - g - perf.react) / 1000;
      const T = perf.T / 1000;
      const fin = s >= T;
      // 넘어진 AI 는 40% 쯤에서 잠깐 멈춰요
      let ss = s; let fall = 0;
      if (perf.fall) { const ft = T * 0.4; if (s > ft && s < ft + 2.5) { ss = ft; fall = 1; } else if (s >= ft + 2.5) ss = s - 2.5; }
      const pr = O.profile(D, T - (perf.fall ? 2.5 : 0), 1.5);
      const x = fin ? D + Math.min(4, (s - T) * 2) : pr.pos(ss);
      return [fin ? perf.score : 0, x, [pr.speed(Math.max(0, ss)), fall ? 2 : fin ? 3 : 0, seg(x).curve ? 1 : 0]];
    },
    create
  });
})();
