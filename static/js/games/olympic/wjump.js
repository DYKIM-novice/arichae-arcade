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

  // 엉뚱 변주: 날아가는 길에 새 떼! 시도마다 새가 있는 곳(m)은 씨앗으로 정해요 (모든 폰이 같아요)
  //  균형이 잘 잡혀 있으면(|b|<0.3) 새들이 밀어 올려 주고, 기우뚱하면 퍽! 부딪혀 더 기우뚱
  const BIRD_OK = 0.3;
  const birdAt = (seed, k) => 34 + ((seed * 7919 + k * 104729) % 2900) / 100;

  function makeSim(seed) {
    const ph1 = (seed % 613) / 613 * 6.28; const ph2 = (seed % 397) / 397 * 6.28;
    const drift = (t, k) => 0.55 * Math.sin(t * 1.7 + ph1 + k) + 0.4 * Math.sin(t * 2.9 + ph2 - k);
    return {
      init() { return { k: 0, ph: 'ready', phT: 0, x: START_X, y: inrunY(START_X), vx: 0, vy: 0, v: 0, b: 0, q: 0, tele: false, tries: [], best: 0, done: false, fall: false, bird: 0 }; },
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
          if (c === 'g' && st.y - hillY(st.x) < 6 && st.vy < 0 && (e - st.phT) > 600) { st.tele = true; return { sfx: 'soft', vib: 10 }; }
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
          if (!st.bird && st.x >= birdAt(seed, st.k) && st.y - hillY(st.x) > 1.5) {
            if (Math.abs(st.b) < BIRD_OK) {
              st.bird = 1; st.vy += 1.0; st.vx += 0.5;
              out = { say: '새들이 밀어줘요! 슝~', color: '#7DF0AE', sfx: 'tweet', vib: 15 };
            } else {
              st.bird = 2; st.b = O.clamp(st.b + (st.b >= 0 ? 0.45 : -0.45), -1.4, 1.4); st.vx *= 0.94;
              out = { say: '퍽! 새랑 부딪혔어요', color: '#FF8B95', sfx: 'bonk', vib: [30, 20, 30] };
            }
          }
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
      st.b = 0; st.bird = 0;
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

  // 몸개그 소품: 날아가는 스키 · 목도리 · 눈덩이 · 새
  const SKI = (c) => `<g><path d="M-22 0 H18 Q23 0 23 -5" fill="none" stroke="#2A2340" stroke-width="4.4" stroke-linecap="round"/><path d="M-21 0 H18 Q22 0 22 -4" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/></g>`;
  const SCARF = '<g><path d="M-12 -3 Q0 -8 12 -3 L14 3 Q2 -1 -10 4 Z" fill="#FF4757"/><path d="M-5 -5 v7 M2 -5 v7" stroke="#fff" stroke-width="1.6"/></g>';
  const BIRD = '<g class="owj-bird"><path class="owj-wing" d="M-2 -1 Q-9 -11 -16 -7 Q-9 -4 -2 2 Z" fill="#5B6B8C"/><ellipse rx="7.5" ry="4.8" fill="#8395BA"/><path d="M-7 -1 L-13 -3 L-12 2 Z" fill="#5B6B8C"/><circle cx="6.5" cy="-3" r="3.8" fill="#8395BA"/><circle cx="7.8" cy="-4" r="1" fill="#15122B"/><path d="M10 -3.2 l4.4 1.1 -4.4 1.3 Z" fill="#FFB43D"/><path class="owj-wing" d="M0 -1 Q-4 -13 -12 -11 Q-6 -5 0 2 Z" fill="#A5B6DA"/></g>';
  const HAT_SNOW = '<path d="M-21 -16 Q-17 -36 -2 -33 Q4 -42 14 -34 Q25 -32 22 -15 Q0 -24 -21 -16 Z" fill="#fff" stroke="#BFD8EC" stroke-width="1.5"/><circle cx="-8" cy="-27" r="2" fill="#E4F0FA"/>';
  const HAT_BIRD = `<g transform="translate(2 -30) scale(1.25)">${BIRD.replace('owj-bird', 'owj-bird sit')}</g><g transform="translate(0 70) scale(.8)"><path d="M-14 -96 l2 4 4 .5 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 -.5 Z" fill="#FFD23F"/></g>`;
  const FLOCK = [[0, 0], [-15, -11], [-15, 11], [-30, -20], [-30, 20]];
  const SIT = (t) => ({ fl: 82, bl: 74, fk: 4, bk: 10, fa: 40 + Math.sin(t * 9) * 14, ba: -30, tilt: -14 + Math.sin(t * 5) * 4, bob: 14, head: 10 + Math.sin(t * 7) * 6, ex: 'd', fx: 'stars', fxx: 14, fxy: 30 });
  const CRASH_ROLL = 0.75; const CRASH_SPLAT = 1.6;

  function create(ctx) {
    const seed = ctx.seed || 3;
    const sim = makeSim(seed);
    const list = O.roster(ctx);
    ctx.stage.innerHTML = '';
    const wrap = G.kit.el('<div class="oly-wrap owj"><div class="olf-chips"></div><div class="oly-scene"></div><div class="oly-hud"></div><div class="oly-msg"></div></div>');
    ctx.stage.appendChild(wrap);
    const others = list.filter((p) => !p.me);
    const meP = list.find((p) => p.me);
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
    // 손맛: 카메라(흔들기·펀치) · 바람 줄무늬
    const FX = O.fx;
    const camC = FX ? FX.cam(svg) : null;
    const wind = FX ? FX.lines(scene, 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.95) 60%, rgba(255,255,255,0))') : null;
    let Wd = 0; let Hd = 0; let ppm = 6; let world = null; let bg = null; let aths = {};
    let PF = null; let flockG = null; let birds = []; let balls = {}; let piles = {}; let flagG = null;
    let camX = START_X; let camY = inrunY(START_X);
    const vis = {};      // 선수마다 화면 상태 (넘어짐·착지 연출)
    const floorY = (xp) => -hillY(xp / ppm) * ppm;
    function build() {
      Wd = Math.max(200, scene.clientWidth || 360); Hd = Math.max(200, scene.clientHeight || 360);
      svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`); svg.setAttribute('width', Wd); svg.setAttribute('height', Hd);
      ppm = Wd / 46;
      // 하늘 · 산 (원근)
      svg.innerHTML = `<defs><linearGradient id="owj-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FB2E5"/><stop offset="1" stop-color="#DDEBF7"/></linearGradient></defs><rect x="-40" y="-40" width="${Wd + 80}" height="${Hd + 80}" fill="url(#owj-sky)"/>`;
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
      // 내 착지 깃발 · 눈 무더기 (선수 뒤)
      flagG = O.el('g', { display: 'none' });
      world.appendChild(flagG);
      piles = {};
      list.forEach((p) => { const g = O.el('g', { display: 'none' }, '<ellipse rx="26" ry="9" fill="#fff" stroke="#BFD8EC" stroke-width="1.6"/><ellipse cx="-12" cy="-4" rx="10" ry="6" fill="#fff"/><ellipse cx="13" cy="-3" rx="9" ry="5" fill="#F4FAFF"/>'); world.appendChild(g); piles[p.pid] = g; });
      // 새 떼 (내 이번 시도 길목)
      flockG = O.el('g', { class: 'owj-flock', display: 'none' });
      birds = FLOCK.map(([dx, dy]) => { const g = O.el('g', {}, BIRD); flockG.appendChild(g); return { g, dx, dy, vx: 0, vy: 0, ox: 0, oy: 0 }; });
      world.appendChild(flockG);
      aths = {};
      balls = {};
      list.slice().reverse().forEach((p) => {
        const a = O.makeAthlete(p.athlete, p.bib, { tag: p.me ? '나' : p.name, me: p.me, gear: 'skis', winter: true });
        if (!p.me) a.g.setAttribute('opacity', '0.55');
        world.appendChild(a.g);
        aths[p.pid] = a;
        // 눈덩이 (구르는 동안 선수 대신)
        const ath = O.ath(p.athlete);
        const ball = O.el('g', { display: 'none', opacity: p.me ? 1 : 0.55 }, `<g class="rot"><circle r="20" fill="#fff" stroke="#BFD8EC" stroke-width="2"/><path d="M-12 -8 q5 -4 10 0 M4 10 q5 -3 9 1 M-8 12 q3 -2 6 0" fill="none" stroke="#D6E7F5" stroke-width="2" stroke-linecap="round"/><g transform="translate(2 -20) scale(.42)">${O.HEAD[ath.id]('d')}</g><g transform="translate(15 13) rotate(40)"><rect x="-3" y="0" width="6" height="11" rx="3" fill="${ath.skin}"/><ellipse cx="2" cy="12" rx="5" ry="3.4" fill="#fff" stroke="#2A2340" stroke-width="1.1"/></g><g transform="translate(-14 14) rotate(-30)"><rect x="-3" y="0" width="6" height="11" rx="3" fill="${ath.skin}"/><ellipse cx="2" cy="12" rx="5" ry="3.4" fill="#fff" stroke="#2A2340" stroke-width="1.1"/></g><g transform="translate(-19 -6) rotate(-100)"><rect x="-2.6" y="0" width="5.2" height="10" rx="2.6" fill="${ath.skin}"/></g></g>`);
        world.appendChild(ball);
        balls[p.pid] = ball;
      });
      if (aths[list[0].pid]) { world.appendChild(aths[list[0].pid].g); world.appendChild(balls[list[0].pid]); }
      const fxG = O.el('g', {});
      world.appendChild(fxG);
      PF = FX ? FX.parts(fxG, 56) : null;
      Object.keys(vis).forEach((k) => { vis[k].rebuilt = true; });
    }
    const st = sim.init();
    st.e = 0;
    build();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (scene.clientWidth !== Wd || scene.clientHeight !== Hd) build(); }) : null;
    if (ro) ro.observe(scene);
    const log = [];
    let lastT = 0; let msgT = 0; let lastPh = 'ready'; let lastK = 0; let birdSaid = -1; let doneFx = false;
    const flock = { y: 0, k: -1, state: 0, t: 0 };
    function say(t, c, ms) { msgEl.textContent = t; msgEl.style.color = c || '#fff'; msgEl.classList.remove('show'); void msgEl.offsetWidth; msgEl.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('show'), ms || 1300); }
    function react(r) { if (!r) return; if (r.say) say(r.say, r.color, r.ms); if (r.sfx && ctx.sfx[r.sfx]) ctx.sfx[r.sfx](); if (r.vib) ctx.vibrate(r.vib); if (r.good) { const b = ctx.stage.getBoundingClientRect(); ctx.fx.burst(b.width / 2, b.height / 2, '#FFD23F', 20); } }
    function simTo(e) { while (st.e + STEP <= e) { st.e += STEP; react(sim.step(st, STEP / 1000, st.e)); } }
    function pose(ph, b, fall, t) {
      if (ph === 'ready') return { fl: 30, bl: 30, fk: 70, bk: 70, tilt: 10, bob: 10, fa: -10, ba: 10, ex: 'n' };
      if (ph === 'inrun') return { fl: 50, bl: 50, fk: 95, bk: 95, tilt: 12, bob: 14, fa: -20, ba: -20, head: -26, ex: 'e' };
      if (ph === 'fly') return { fl: -18, bl: -24, fk: 0, bk: 0, tilt: 58 + b * 22, fa: -24, ba: -28, head: -50 - b * 10, ex: Math.abs(b) > 0.6 ? 'o' : 'e', fx: 'speed' };
      if (ph === 'land') return fall ? O.P.fall() : { fl: 40, bl: -30, fk: 40, bk: 50, tilt: 8, bob: 6, fa: 90, ba: -90, ex: 'h', fx: 'sparkle' };
      return O.P.cheer(t);
    }
    // 꽈당 연출: 통통 튀며 빙글빙글 → 눈덩이로 데굴데굴 → 퍽! 눈 무더기에 앉아 어질어질
    function crash(p, V, a, I, ps, t, dt) {
      const ball = balls[p.pid];
      if (t < CRASH_ROLL) {
        const k = t / CRASH_ROLL;
        const n = Math.floor(t * 2.6);
        if (V.bn !== n) { V.bn = n; if (PF) PF.burst('snow', ps.x, ps.y, 7, { dir: -Math.PI / 2, spread: 2.2, sp: 160, floor: floorY }); if (p.me && camC) camC.shake(n ? 4 : 7, 300); if (p.me && n && ctx.sfx.thud) ctx.sfx.thud(); }
        Object.assign(ps, { fl: 60 * Math.sin(t * 30), bl: -60 * Math.sin(t * 30 + 1), fk: 40, bk: 60, fa: 150 * Math.sin(t * 25), ba: -140 * Math.sin(t * 22), tilt: 58 + t * 900, bob: 0, head: 0, ex: t < 0.25 ? 'o' : 'd', fx: '' });
        ps.y -= Math.abs(Math.sin(t * Math.PI * 2.6)) * 34 * (1 - k) * ps.s;
        a.g.style.display = ''; ball.setAttribute('display', 'none');
        return;
      }
      if (t < CRASH_SPLAT) {
        const k = (t - CRASH_ROLL) / (CRASH_SPLAT - CRASH_ROLL);
        a.g.style.display = 'none';
        ball.removeAttribute('display');
        const r = (12 + 22 * k) * ps.s / 0.6;
        V.rot = (V.rot || 0) + dt * 720;
        ball.setAttribute('transform', `translate(${ps.x.toFixed(1)} ${(ps.y - r).toFixed(1)}) scale(${(r / 20).toFixed(3)})`);
        ball.firstElementChild.setAttribute('transform', `rotate(${V.rot.toFixed(0)})`);
        if (PF && Math.random() < 0.35) PF.burst('snow', ps.x - r * 0.6, ps.y - 2, 1, { dir: -Math.PI * 0.75, spread: 0.6, sp: 120, floor: floorY });
        return;
      }
      if (!V.splat) {
        V.splat = true;
        ball.setAttribute('display', 'none');
        if (PF) { PF.burst('snow', ps.x, ps.y - 20 * ps.s, 20, { sp: 230, floor: floorY, k: 1.3 }); PF.burst('ring', ps.x, ps.y - 20 * ps.s, 1, { color: '#fff' }); }
        if (p.me) { if (camC) camC.shake(6, 380); if (ctx.sfx.splat) ctx.sfx.splat(); }
      }
      a.g.style.display = '';
      Object.assign(ps, SIT(t));
      a.hat(HAT_SNOW);
      const pile = piles[p.pid];
      pile.removeAttribute('display');
      pile.setAttribute('transform', `translate(${(ps.x + 4).toFixed(1)} ${(ps.y - 2).toFixed(1)}) scale(${(ps.s / 0.6).toFixed(2)})`);
      pile.setAttribute('opacity', p.me ? 1 : 0.55);
    }
    // 장비가 휙휙 날아가요 (스키 두 짝 + 목도리)
    function throwGear(p, a, ps) {
      a.g.classList.add('ofx-noski', 'ofx-noscarf');
      if (!PF) return;
      const col = a.a.shorts;
      for (let i = 0; i < 2; i++) PF.spawn({ x: ps.x + (i ? 8 : -6), y: ps.y - 10, vx: i ? 170 : -40, vy: -(240 + i * 80), ay: 620, drag: 0.3, life: 2.2, r: i ? 20 : -30, vr: i ? 820 : -640, s0: ps.s, s1: ps.s, o0: p.me ? 1 : 0.6, o1: 0.4, floor: floorY, bounce: 0.35, html: SKI(col) });
      PF.spawn({ x: ps.x, y: ps.y - 50 * ps.s, vx: -30, vy: -170, ay: 90, drag: 1.6, life: 2.2, r: 0, vr: 260, s0: ps.s * 1.3, s1: ps.s * 1.3, o0: p.me ? 1 : 0.6, o1: 0.3, sway: 1, html: SCARF });
    }
    function resetVis(p, V, a) {
      a.g.classList.remove('ofx-noski', 'ofx-noscarf');
      a.g.style.display = '';
      a.hat(''); a.hold('');
      balls[p.pid].setAttribute('display', 'none');
      piles[p.pid].setAttribute('display', 'none');
      Object.assign(V, { landT: null, crash: false, splat: false, bn: -1, rot: 0, gear: false, slide: 0 });
    }
    // 새 떼 그리기 (내 이번 시도)
    function drawFlock(e, dt) {
      if (st.done) { flockG.setAttribute('display', 'none'); return; }
      const bx = birdAt(seed, st.k);
      if (flock.k !== st.k) { flock.k = st.k; flock.state = 0; flock.y = hillY(bx) + 21; birds.forEach((b) => { b.ox = 0; b.oy = 0; b.vx = 0; b.vy = 0; }); }
      const show = st.ph === 'inrun' || st.ph === 'fly' || (flock.state && e - flock.t < 1600);
      if (!show) { flockG.setAttribute('display', 'none'); return; }
      flockG.removeAttribute('display');
      // 다가오면 내 높이로 맞춰 날아와요 (부딪힘 판단은 규칙이 해요)
      if (st.ph === 'fly' && !flock.state && st.x > bx - 45) flock.y += (st.y + 1.5 - flock.y) * Math.min(1, dt * 3);
      if (!flock.state && st.bird) {
        flock.state = st.bird; flock.t = e;
        birds.forEach((b, i) => { b.vx = (st.bird === 1 ? 30 : 60) * (Math.random() - 0.3); b.vy = st.bird === 1 ? -(60 + i * 12) : (Math.random() - 0.5) * 160 - 40; });
      }
      const s = Math.max(0.9, Math.min(1.4, Wd / 300));
      const fx = bx * ppm; const fy = -flock.y * ppm;
      const ts = e / 1000;
      birds.forEach((b, i) => {
        if (flock.state) { b.ox += b.vx * dt; b.oy += b.vy * dt; }
        const hide = flock.state === 1 && i < 2 && e - flock.t < 900;   // 두 마리는 내 손을 잡고 날아요
        b.g.setAttribute('display', hide ? 'none' : 'inline');
        b.g.setAttribute('transform', `translate(${(fx + b.dx * s + b.ox).toFixed(1)} ${(fy + b.dy * s + b.oy + Math.sin(ts * 6 + i) * 3).toFixed(1)}) scale(${(-s).toFixed(2)} ${s.toFixed(2)})`);
      });
      flockG.setAttribute('opacity', flock.state ? Math.max(0, 1 - (e - flock.t) / 1600).toFixed(2) : 1);
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
          if (p.me) I = { ph: st.done ? 'done' : st.ph, x: st.x, y: st.y, b: st.b, fall: st.fall, k: st.k, bird: st.bird, tele: st.tele, vy: st.vy };
          else {
            const L = live[p.pid];
            const ex = (L && L[2]) || [];
            I = { ph: PHN[ex[1] || 0], x: ex[2] != null ? ex[2] : START_X, y: ex[3] != null ? ex[3] : inrunY(START_X), b: ex[4] || 0, fall: !!ex[5], k: ex[0] || 0, bird: ex[6] || 0, tele: false, vy: -6 };
            chip[p.pid].textContent = `${(ex[0] || 0) + 1 > TRIES ? TRIES : (ex[0] || 0) + 1}번째 · 최고 ${L && L[0] ? (L[0] / 100).toFixed(1) + 'm' : '-'}`;
          }
          const V = vis[p.pid] || (vis[p.pid] = { ph: I.ph, k: I.k, landT: null, bn: -1 });
          if (V.rebuilt) { V.rebuilt = false; if (V.landT != null && V.crash) a.g.classList.add('ofx-noski', 'ofx-noscarf'); }
          // 새 시도가 시작되면 원래대로
          if ((I.ph === 'ready' || I.ph === 'inrun') && V.ph !== I.ph && (V.ph === 'land' || V.ph === 'done' || V.landT != null)) resetVis(p, V, a);
          // 도약 순간
          if (I.ph === 'fly' && V.ph === 'inrun' && PF) {
            PF.burst('snow', 0, 0, p.me ? 10 : 4, { dir: -Math.PI * 0.8, spread: 1.4, sp: 150, floor: floorY });
            if (p.me && camC) {
              camC.focus(Wd * 0.42, Hd * 0.48); camC.punch(0.06 + 0.1 * st.q);
              if (st.q > 0.85) PF.burst('ring', 0, -6, 1, { color: '#FFE27A' });
            }
          }
          // 착지 순간
          if (I.ph === 'land' && V.ph !== 'land' && V.landT == null) {
            V.landT = e; V.crash = I.fall; V.bn = -1; V.splat = false; V.rot = 0;
            const px = I.x * ppm; const py = -hillY(I.x) * ppm;
            const imp = Math.min(1, Math.abs(I.vy || 6) / 14);
            if (V.crash) {
              throwGear(p, a, { x: px, y: py, s });
              if (p.me) { if (ctx.sfx.crash) ctx.sfx.crash(); }
            } else if (PF) {
              PF.burst('snow', px, py, p.me ? 10 + Math.round(imp * 10) : 5, { dir: -Math.PI * 0.62, spread: 1.3, sp: 150 + imp * 120, floor: floorY });
              if (p.me) {
                if (camC) camC.shake(2 + imp * 4, 300);
                if (I.tele) { PF.burst('star', px, py - 40 * s, 7, { sp: 120 }); PF.burst('ring', px, py - 30 * s, 1, { color: '#FFE27A' }); }
              }
            }
            if (p.me) {
              // 내 착지 깃발 (거리 표시)
              const cm = st.last || 0;
              flagG.innerHTML = `<g transform="translate(${px.toFixed(1)} ${py.toFixed(1)})"><path d="M0 0 V-46" stroke="#2A2340" stroke-width="2.4"/><path d="M0 -46 h44 l-6 9 l6 9 h-44 Z" fill="${V.crash ? '#FF8B95' : '#FFD23F'}" stroke="#2A2340" stroke-width="1.4"/><text x="21" y="-33" text-anchor="middle" font-size="11" font-weight="900" fill="#2A2340" font-family="system-ui,sans-serif">${(cm / 100).toFixed(1)}m</text></g>`;
              flagG.removeAttribute('display');
              if (!V.crash && cm >= K * 100) setTimeout(() => FX && FX.celebrate(ctx, false, 'K점 돌파!'), 400);
            }
          }
          V.ph = I.ph; V.k = I.k;
          const ps = pose(I.ph, I.b, I.fall, t / 300);
          // 착지 뒤 미끄러짐: AI 는 기록 자리에 서 있으니 화면에서만 쭉 미끄러져요
          let x = I.x;
          if (p.bot && I.ph === 'land' && V.landT != null) { const lt = Math.min(1.5, (e - V.landT) / 1000); x += 21 * lt - 7 * lt * lt; }
          ps.x = x * ppm; ps.y = -(I.ph === 'land' ? hillY(x) : I.y) * ppm; ps.s = s;
          if (I.ph === 'land' && V.crash && V.landT != null) crash(p, V, a, I, ps, (e - V.landT) / 1000, dt);
          if (I.ph === 'done' && V.crash) { Object.assign(ps, SIT(t / 1000)); ps.y = -hillY(x) * ppm; }
          // 새 머리 위에 (부딪혔을 때) · 새가 손을 잡고 (밀어줄 때)
          if (I.ph === 'fly' && I.bird === 2) a.hat(HAT_BIRD);
          else if (I.ph !== 'land' || !V.crash) a.hat('');
          if (p.me) a.hold(I.ph === 'fly' && I.bird === 1 && e - flock.t < 900 ? `<g transform="translate(0 4) scale(-.9 .9)">${BIRD}</g>` : '');
          a.set(ps);
          const rot = slopeAng(x, I.ph);
          if (rot) a.g.setAttribute('transform', a.g.getAttribute('transform').replace(/scale\(([^)]*)\)/, `rotate(${rot.toFixed(1)}) scale($1)`));
        });
        // 카메라: 날 때는 조금 앞을 보여줘요
        const lead = st.ph === 'fly' ? 8 : st.ph === 'inrun' ? 6 : 0;
        camX += (st.x + lead - camX) * Math.min(1, dt * 4);
        camY += (st.y - 4 - camY) * Math.min(1, dt * 4);
        world.setAttribute('transform', `translate(${(Wd * 0.42 - camX * ppm).toFixed(1)} ${(Hd * 0.48 + camY * ppm).toFixed(1)})`);
        bg.setAttribute('transform', `translate(${(-camX * ppm * 0.15 % 160 - 160).toFixed(1)} ${(camY * ppm * 0.1).toFixed(1)})`);
        // 손맛: 새 떼 · 조각 · 카메라 · 바람
        drawFlock(e, dt);
        if (PF) PF.tick(dt);
        if (camC) {
          if (st.ph === 'inrun' && st.v > 14) camC.shake(0.4 + (st.v - 14) * 0.06, 90);
          // 착지하면 가까이 (꽈당이면 더 가까이 · 몸개그를 크게 보여줘요)
          const MV = meP && vis[meP.pid];
          if (st.ph === 'land' && MV && MV.landT != null) {
            const lt = e - MV.landT;
            camC.focus(Wd * 0.42 + (st.x - camX) * ppm, Hd * 0.48 + (camY - hillY(st.x)) * ppm - 26);
            camC.zoom(MV.crash ? 1.65 : lt < 1300 ? 1.25 : 1, MV.crash ? 3 : 4);
          } else camC.zoom(1, 5);
          camC.tick(dt);
        }
        if (wind) {
          if (st.ph === 'fly') wind.set(0.35 + Math.min(0.65, (st.vx - 16) / 14), Math.atan2(-st.vy, st.vx) * 57.3);
          else if (st.ph === 'inrun') wind.set(Math.max(0, (st.v - 10) / 16), 27);
          else wind.set(0, 0);
        }
        if (st.ph === 'fly' && st.k !== birdSaid && !st.bird && st.x > birdAt(seed, st.k) - 26) { birdSaid = st.k; say('새 떼다! 균형 꽉!', '#FFE27A', 900); }
        if (st.ph !== lastPh || st.k !== lastK) { lastPh = st.ph; lastK = st.k; }
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
        if (st.ph === 'fly' && st.y - hillY(st.x) < 6 && st.vy < 0 && st.x > 15 && !st.landSaid) { st.landSaid = true; say('착지! 초록!', '#2ED573', 700); }
        if (st.ph !== 'fly') st.landSaid = false;
        // 다 뛰면: 이 폰의 개인 신기록이면 큰 축하
        if (st.done && !doneFx && FX) {
          doneFx = true;
          const pr = FX.pb('wjump', st.best);
          if (pr.pb) setTimeout(() => FX.celebrate(ctx, true, '개인 신기록!'), 300);
          else if (r === 1 && st.best) setTimeout(() => FX.celebrate(ctx, false), 300);
        }
      },
      onPress(c, t) { const e = t - ctx.startAt; simTo(e); log.push([Math.round(e), c]); react(sim.press(st, c, e)); },
      onRelease(c, t) { const e = t - ctx.startAt; log.push([Math.round(e), c.toUpperCase()]); },
      end() { if (ro) ro.disconnect(); clearTimeout(msgT); },
      done: () => st.done && st.e - st.doneT > 800,
      score: () => st.best,
      value: () => st.best,
      extra: () => [st.k, PHC[st.done ? 'done' : st.ph], Math.round(st.x * 10) / 10, Math.round(st.y * 10) / 10, Math.round(st.b * 100) / 100, st.fall ? 1 : 0, st.bird || 0],
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
    rules: ['쓩~ 내려오다가 도약대 끝에서 초록! 끝에 가까울수록 높이 떠요', '날아가는 동안 몸이 기우뚱하면 빨강(뒤로)·파랑(앞으로)으로 균형 · 가운데일수록 멀리', '땅이 가까우면 초록으로 사뿐히 착지(텔레마크) · 2번 중 최고 기록', '날다 보면 새 떼가 나타나요! 균형이 딱 맞으면 새들이 밀어주고, 기우뚱하면 퍽!'],
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
