/* 아리채 오락실 · 올림픽(동계) · 스키점프
   내려오다가 도약대 끝에서 초록! (타이밍이 좋을수록 높이 떠요)
   → 날아가는 동안 몸이 기우뚱하면 빨강(뒤로)·파랑(앞으로)으로 균형을 잡아요 (가운데일수록 멀리)
   → 땅이 가까워지면 초록으로 사뿐히 착지(텔레마크). 2번 중 가장 먼 기록. */
(function () {
  'use strict';
  const O = window.Oly;
  const G = window.Games;
  const { HEX, SHADE, LIGHT, shape } = G.kit;
  const STEP = O.SIM_STEP || 10;

  const TRIES = 2;
  const START_X = -60;
  const inrunY = (x) => -0.52 * x;                         // 도움닫기 비탈 (x<0)
  const hillY = (x) => (x < 0 ? inrunY(x) : x < 140 ? -3 - 0.62 * x + 0.0022 * x * x : -3 - 0.62 * 140 + 0.0022 * 140 * 140);
  const K = 110;
  const READY = 1200; const SHOW = 2300;
  const BOT_START = 1500; const BOT_CYCLE = 14000;

  function makeSim(seed) {
    const ph1 = (seed % 613) / 613 * 6.28; const ph2 = (seed % 397) / 397 * 6.28;
    const drift = (t, k) => 0.55 * Math.sin(t * 1.7 + ph1 + k) + 0.4 * Math.sin(t * 2.9 + ph2 - k);
    return {
      init() { return { k: 0, ph: 'ready', phT: 0, x: START_X, y: inrunY(START_X), vx: 0, vy: 0, v: 0, b: 0, q: 0, tele: false, tries: [], best: 0, done: false, fall: false }; },
      press(st, c, e) {
        if (st.done) return null;
        if (st.ph === 'inrun' && c === 'g') {
          const dx = -st.x;   // 끝까지 남은 거리
          st.q = dx < 0.4 ? 1 : Math.max(0.2, 1 - (dx - 0.4) / 6);
          return takeoff(st, e);
        }
        if (st.ph === 'fly') {
          if (c === 'r') { st.b = O.clamp(st.b - 0.14, -1.4, 1.4); return { sfx: 'tick', vib: 4 }; }
          if (c === 'b') { st.b = O.clamp(st.b + 0.14, -1.4, 1.4); return { sfx: 'tick', vib: 4 }; }
          if (c === 'g' && st.y - hillY(st.x) < 6) { st.tele = true; return { sfx: 'soft', vib: 10 }; }
        }
        return null;
      },
      step(st, dt, e) {
        if (st.done) return null;
        let out = null;
        if (st.ph === 'ready' && e - st.phT >= READY) { st.ph = 'inrun'; st.phT = e; out = { say: `${st.k + 1}번째 점프!`, color: '#3D7BFF' }; }
        else if (st.ph === 'inrun') {
          st.v += (9.8 * 0.62 - 0.0012 * st.v * st.v) * dt;
          st.x += st.v * 0.887 * dt; st.y = inrunY(st.x);
          if (st.x >= 0) { st.q = 0.25; out = takeoff(st, e); out.say = '늦었어요!'; out.color = '#FF8B95'; }
        } else if (st.ph === 'fly') {
          const t = (e - st.phT) / 1000;
          st.b += (drift(t, st.k) * 0.8) * dt;
          const bal = Math.min(1, Math.abs(st.b) / 0.9);
          const lift = (0.5 + 0.14 * st.q) * (1 - bal * 0.85);
          st.vy -= 9.8 * (1 - lift) * dt;
          st.vx -= 0.0022 * st.vx * st.vx * (1 + bal) * dt;
          st.x += st.vx * dt; st.y += st.vy * dt;
          if (st.y <= hillY(st.x)) {
            st.y = hillY(st.x);
            st.fall = Math.abs(st.b) > 0.75;
            let d = st.x * (st.tele && !st.fall ? 1.02 : 1);
            if (st.fall) d *= 0.8;
            const cm = Math.max(0, Math.round(d * 100));
            st.tries.push(cm); st.best = Math.max(st.best, cm); st.last = cm;
            st.ph = 'land'; st.phT = e;
            out = st.fall ? { say: `꽈당… ${(cm / 100).toFixed(1)}m`, color: '#FF8B95', sfx: 'bad', vib: [60, 40, 60] }
              : { say: `${(cm / 100).toFixed(1)}m${st.tele ? ' · 텔레마크!' : ''}`, color: '#FFD23F', sfx: 'perfect', vib: [30, 40, 90], good: true };
          }
        } else if (st.ph === 'land') {
          st.vx = Math.max(0, st.vx - 14 * dt); st.x += st.vx * dt; st.y = hillY(st.x);
          if (e - st.phT >= SHOW) {
            st.k += 1;
            if (st.k >= TRIES) { st.done = true; st.doneT = e; }
            else Object.assign(st, { ph: 'ready', phT: e, x: START_X, y: inrunY(START_X), v: 0, vx: 0, vy: 0, b: 0, tele: false, fall: false });
          }
        }
        return out;
      }
    };
    function takeoff(st, e) {
      st.ph = 'fly'; st.phT = e;
      st.vx = st.v * 0.95; st.vy = -2.2 + 3.6 * st.q;
      st.b = 0;
      return { sfx: 'whoosh', vib: 20, say: st.q > 0.85 ? '완벽한 도약!' : st.q > 0.55 ? '좋아요!' : '조금 아쉬워요', color: '#7DF0AE' };
    }
  }

  function botState(perf, e) {
    const k = Math.floor((e - BOT_START) / BOT_CYCLE);
    const tries = perf.tries || [];
    const best = tries.slice(0, Math.max(0, Math.min(TRIES, k))).reduce((m, t) => Math.max(m, t.d), 0);
    if (e < BOT_START || k >= TRIES) return { k: Math.min(TRIES, Math.max(0, k)), ph: e < BOT_START ? 'ready' : 'done', x: START_X, y: inrunY(START_X), b: 0, best: e < BOT_START ? 0 : perf.score };
    const t = tries[k];
    const s = (e - BOT_START - k * BOT_CYCLE) / 1000;
    if (s < 1) return { k, ph: 'ready', x: START_X, y: inrunY(START_X), b: 0, best };
    if (s < 4.2) { const f = (s - 1) / 3.2; const x = START_X * (1 - f * f); return { k, ph: 'inrun', x, y: inrunY(x), b: 0, best }; }
    const d = t.d / 100 / (t.fall ? 0.8 : 1);
    const ft = 2.6 + d / 60;
    if (s < 4.2 + ft) {
      const f = (s - 4.2) / ft;
      const x = d * f;
      const y = hillY(x) + Math.sin(f * Math.PI) * (2.5 + d * 0.06) + (1 - f) * 3;
      return { k, ph: 'fly', x, y, b: t.bal * Math.sin(f * 6), best };
    }
    return { k, ph: 'land', x: d, y: hillY(d), b: t.fall ? 1 : 0, best: Math.max(best, t.d), fall: t.fall };
  }
  const PHC = { ready: 0, inrun: 1, fly: 2, land: 3, done: 4 };
  const PHN = ['ready', 'inrun', 'fly', 'land', 'done'];

  function create(ctx) {
    const sim = makeSim(ctx.seed || 3);
    const list = O.roster(ctx);
    ctx.stage.innerHTML = '';
    const wrap = G.kit.el('<div class="oly-wrap owj"><div class="olf-chips"></div><div class="oly-scene"></div><div class="oly-hud"></div><div class="oly-msg"></div></div>');
    ctx.stage.appendChild(wrap);
    const others = list.filter((p) => !p.me);
    const chipsEl = wrap.querySelector('.olf-chips');
    chipsEl.innerHTML = others.map((p) => `<div class="olf-chip" data-pid="${p.pid}"><span class="av">${O.faceSVG(p.athlete)}</span><div><b>${G.esc(p.name)}</b><span class="olf-kg">-</span></div></div>`).join('');
    const chip = {};
    others.forEach((p) => { chip[p.pid] = chipsEl.querySelector(`[data-pid="${p.pid}"] .olf-kg`); });
    const scene = wrap.querySelector('.oly-scene');
    const hud = wrap.querySelector('.oly-hud');
    const msgEl = wrap.querySelector('.oly-msg');
    scene.appendChild((() => { const b = document.createElement('div'); b.className = 'oly-snow'; return b; })());
    const hudEl = G.kit.el(`<div class="owj-hud"><div class="owj-bal"><span>균형</span><div class="owj-bar"><i class="owj-mid"></i><i class="owj-dot"></i></div></div><div class="owj-keys"><span><i class="g"></i> 도약·착지</span><span><i class="r"></i> 뒤로 · 앞으로 <i class="b"></i></span><span class="owj-best">최고 <b>-</b></span></div></div>`);
    hud.appendChild(hudEl);
    const dot = hudEl.querySelector('.owj-dot'); const balEl = hudEl.querySelector('.owj-bal'); const bestEl = hudEl.querySelector('.owj-best b');
    const svg = O.el('svg', { class: 'oly-svg' });
    scene.appendChild(svg);
    let Wd = 0; let Hd = 0; let ppm = 6; let world = null; let bg = null; let aths = {};
    let camX = START_X; let camY = inrunY(START_X);
    function build() {
      Wd = Math.max(200, scene.clientWidth || 360); Hd = Math.max(200, scene.clientHeight || 360);
      svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`); svg.setAttribute('width', Wd); svg.setAttribute('height', Hd);
      ppm = Wd / 46;
      // 하늘 · 산 (원근)
      svg.innerHTML = `<defs><linearGradient id="owj-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FB2E5"/><stop offset="1" stop-color="#DDEBF7"/></linearGradient></defs><rect width="${Wd}" height="${Hd}" fill="url(#owj-sky)"/>`;
      bg = O.el('g', {});
      let m = '';
      for (let i = -2; i < 8; i++) m += `<path d="M${i * 160} ${Hd * 0.62} l80 -${Hd * 0.32} l80 ${Hd * 0.32} Z" fill="#B9CFE6"/><path d="M${i * 160 + 56} ${Hd * 0.42} l24 -${Hd * 0.12} l24 ${Hd * 0.12} q-12 8 -24 2 q-12 6 -24 -2 Z" fill="#fff"/>`;
      bg.innerHTML = m;
      svg.appendChild(bg);
      world = O.el('g', {});
      svg.appendChild(world);
      // 언덕 (세계 좌표 m → px, 위가 +)
      const P = (x, y) => `${(x * ppm).toFixed(1)} ${(-y * ppm).toFixed(1)}`;
      let hill = `M${P(START_X - 6, inrunY(START_X - 6))}`;
      for (let x = START_X - 6; x <= 0; x += 4) hill += ` L${P(x, inrunY(x))}`;
      hill += ` L${P(0, 0)} L${P(0, -3)}`;
      for (let x = 0; x <= 190; x += 4) hill += ` L${P(x, hillY(x))}`;
      hill += ` L${P(190, -120)} L${P(START_X - 6, -120)} Z`;
      let lines = '';
      for (let d = 60; d <= 140; d += 10) {
        const y = hillY(d);
        lines += `<path d="M${P(d, y)} l0 ${(14).toFixed(1)}" stroke="${d === K ? '#FF4757' : '#7FB8E0'}" stroke-width="${d === K ? 4 : 2}"/><text x="${(d * ppm).toFixed(1)}" y="${(-y * ppm + 28).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="900" fill="${d === K ? '#FF4757' : '#3B6E96'}" font-family="system-ui,sans-serif">${d}m</text>`;
      }
      world.innerHTML = `<path d="${hill}" fill="#FFFFFF" stroke="#CFE3F2" stroke-width="2"/>
        <path d="M${P(START_X - 6, inrunY(START_X - 6))} L${P(0, 0)}" stroke="#7FB8E0" stroke-width="5"/>
        <rect x="${(-2 * ppm).toFixed(1)}" y="${(0).toFixed(1)}" width="${(2 * ppm).toFixed(1)}" height="${(3 * ppm).toFixed(1)}" fill="#E0435A"/>
        ${lines}`;
      aths = {};
      list.slice().reverse().forEach((p) => {
        const a = O.makeAthlete(p.athlete, p.bib, { tag: p.me ? '나' : p.name, me: p.me, gear: 'skis', winter: true });
        if (!p.me) a.g.setAttribute('opacity', '0.55');
        world.appendChild(a.g);
        aths[p.pid] = a;
      });
      if (aths[list[0].pid]) world.appendChild(aths[list[0].pid].g);
    }
    const st = sim.init();
    st.e = 0;
    build();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (scene.clientWidth !== Wd || scene.clientHeight !== Hd) build(); }) : null;
    if (ro) ro.observe(scene);
    const log = [];
    let lastT = 0; let msgT = 0;
    function say(t, c, ms) { msgEl.textContent = t; msgEl.style.color = c || '#fff'; msgEl.classList.remove('show'); void msgEl.offsetWidth; msgEl.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('show'), ms || 1300); }
    function react(r) { if (!r) return; if (r.say) say(r.say, r.color, r.ms); if (r.sfx && ctx.sfx[r.sfx]) ctx.sfx[r.sfx](); if (r.vib) ctx.vibrate(r.vib); if (r.good) { const b = ctx.stage.getBoundingClientRect(); ctx.fx.burst(b.width / 2, b.height / 2, '#FFD23F', 20); } }
    function simTo(e) { while (st.e + STEP <= e) { st.e += STEP; react(sim.step(st, STEP / 1000, st.e)); } }
    function pose(ph, b, fall, t) {
      if (ph === 'ready') return { fl: 30, bl: 30, fk: 70, bk: 70, tilt: 10, bob: 10, fa: -10, ba: 10, ex: 'n' };
      if (ph === 'inrun') return { fl: 50, bl: 50, fk: 95, bk: 95, tilt: 12, bob: 14, fa: -20, ba: -20, head: -26, ex: 'e' };
      if (ph === 'fly') return { fl: -18, bl: -24, fk: 0, bk: 0, tilt: 58 + b * 22, fa: -24, ba: -28, head: -50 - b * 10, ex: Math.abs(b) > 0.6 ? 'd' : 'e', fx: 'speed' };
      if (ph === 'land') return fall ? O.P.fall() : { fl: 40, bl: -30, fk: 40, bk: 50, tilt: 8, bob: 6, fa: 90, ba: -90, ex: 'h', fx: 'sparkle' };
      return O.P.cheer(t);
    }
    return {
      start() {},
      tick(t) {
        const e = t - ctx.startAt;
        const dt = Math.min(0.05, Math.max(0, (t - (lastT || t)) / 1000));
        lastT = t;
        simTo(e);
        const live = ctx.live();
        const s = Math.max(0.5, Math.min(0.8, Wd / 640));
        const slopeAng = (x, ph) => (ph === 'inrun' ? 27 : ph === 'land' ? Math.atan(0.62 - 0.0044 * x) * 57.3 : 0);
        list.forEach((p) => {
          const a = aths[p.pid];
          if (!a) return;
          let I;
          if (p.me) I = { ph: st.done ? 'done' : st.ph, x: st.x, y: st.y, b: st.b, fall: st.fall };
          else {
            const L = live[p.pid];
            const ex = (L && L[2]) || [];
            I = { ph: PHN[ex[1] || 0], x: ex[2] != null ? ex[2] : START_X, y: ex[3] != null ? ex[3] : inrunY(START_X), b: ex[4] || 0, fall: !!ex[5] };
            chip[p.pid].textContent = `${(ex[0] || 0) + 1 > TRIES ? TRIES : (ex[0] || 0) + 1}번째 · 최고 ${L && L[0] ? (L[0] / 100).toFixed(1) + 'm' : '-'}`;
          }
          const ps = pose(I.ph, I.b, I.fall, t / 300);
          ps.x = I.x * ppm; ps.y = -I.y * ppm; ps.s = s;
          a.set(ps);
          const rot = slopeAng(I.x, I.ph);
          if (rot) a.g.setAttribute('transform', a.g.getAttribute('transform').replace(/scale\(([^)]*)\)/, `rotate(${rot.toFixed(1)}) scale($1)`));
        });
        // 카메라: 날 때는 조금 앞을 보여줘요
        const lead = st.ph === 'fly' ? 8 : st.ph === 'inrun' ? 6 : 0;
        camX += (st.x + lead - camX) * Math.min(1, dt * 4);
        camY += (st.y - 4 - camY) * Math.min(1, dt * 4);
        world.setAttribute('transform', `translate(${(Wd * 0.42 - camX * ppm).toFixed(1)} ${(Hd * 0.48 + camY * ppm).toFixed(1)})`);
        bg.setAttribute('transform', `translate(${(-camX * ppm * 0.15 % 160 - 160).toFixed(1)} ${(camY * ppm * 0.1).toFixed(1)})`);
        // 균형 막대
        balEl.classList.toggle('on', st.ph === 'fly');
        dot.style.left = `${(50 + O.clamp(st.b, -1.2, 1.2) / 1.2 * 50).toFixed(1)}%`;
        dot.className = 'owj-dot' + (Math.abs(st.b) > 0.6 ? ' bad' : Math.abs(st.b) < 0.25 ? ' good' : '');
        bestEl.textContent = st.best ? `${(st.best / 100).toFixed(1)}m` : '-';
        let r = 1;
        others.forEach((p) => { const L = live[p.pid]; if (L && (L[0] || 0) > st.best) r++; });
        ctx.setScore(st.best ? Math.round(st.best) / 100 : 0);
        if (st.best) ctx.setBadge(`${r}위`, r === 1 ? 'y' : 'b');
        if (st.ph === 'inrun' && -st.x < 14 && !st.warned) { st.warned = true; say('도약대! 끝에서 초록!', '#2ED573', 900); }
        if (st.ph !== 'inrun') st.warned = false;
        if (st.ph === 'fly' && st.y - hillY(st.x) < 6 && !st.landSaid) { st.landSaid = true; say('착지! 초록!', '#2ED573', 700); }
        if (st.ph !== 'fly') st.landSaid = false;
      },
      onPress(c, t) { const e = t - ctx.startAt; simTo(e); log.push([Math.round(e), c]); react(sim.press(st, c, e)); },
      onRelease(c, t) { const e = t - ctx.startAt; log.push([Math.round(e), c.toUpperCase()]); },
      end() { if (ro) ro.disconnect(); clearTimeout(msgT); },
      done: () => st.done && st.e - st.doneT > 800,
      score: () => st.best,
      value: () => st.best,
      extra: () => [st.k, PHC[st.done ? 'done' : st.ph], Math.round(st.x * 10) / 10, Math.round(st.y * 10) / 10, Math.round(st.b * 100) / 100, st.fall ? 1 : 0],
      log: () => log,
      _st: () => st,
      summary: () => (st.best ? `최고 ${(st.best / 100).toFixed(1)}m` : '기록 없음')
    };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#9FC4E8"/><path d="M2 12 L18 22 L18 24 Q30 30 38 38 H2 Z" fill="#fff"/><path d="M14 10 L28 6" stroke="#FF4757" stroke-width="2.5" stroke-linecap="round"/><circle cx="22" cy="6" r="3" fill="#FFD23F"/><path d="M20 30 Q28 6 38 18" fill="none" stroke="#3D7BFF" stroke-width="1.6" stroke-dasharray="3 2"/></svg>';

  O.register({
    id: 'wjump',
    title: '스키점프',
    cat: '동계 · 설상',
    catColor: 'g',
    how: '도약대 끝에서 초록 → 빨·파 균형 → 초록 착지',
    icon: ICON,
    buttons: ['r', 'g', 'b'], noGo: true, pressSound: false,
    rules: ['쓩~ 내려오다가 도약대 끝에서 초록! 끝에 가까울수록 높이 떠요', '날아가는 동안 몸이 기우뚱하면 빨강(뒤로)·파랑(앞으로)으로 균형 · 가운데일수록 멀리', '땅이 가까우면 초록으로 사뿐히 착지(텔레마크) · 2번 중 최고 기록'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('g', '도약!')}${b('r', '뒤로')}${b('b', '앞으로')}${b('g', '착지')}</div>`;
    },
    fmt: (cm) => (cm > 0 ? `${(cm / 100).toFixed(1)}m` : '기록 없음'),
    rival(arr) { const b = arr ? arr[0] || 0 : 0; const ex = (arr && arr[2]) || []; return { sort: b, text: b ? `${(b / 100).toFixed(1)}m` : `${Math.min(TRIES, (ex[0] || 0) + 1)}번째` }; },
    botLive(perf, e) { const s = botState(perf, e); return [s.best, s.best, [s.k, PHC[s.ph], Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10, Math.round(s.b * 100) / 100, s.fall ? 1 : 0]]; },
    create
  });
})();
