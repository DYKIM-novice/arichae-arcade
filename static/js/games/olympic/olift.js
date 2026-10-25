/* 아리채 오락실 · 올림픽(하계) · 역도
   빨·파 연타로 바벨을 가슴까지 들어 올려요(무거울수록 더 빨리 쳐야 해요)
   → 흔들리는 바늘이 가운데 초록에 올 때 초록! 머리 위로 번쩍.
   성공하면 더 무거운 무게로. 같은 무게에서 2번 실패하면 끝. 가장 무거운 성공 무게가 기록이에요. */
(function () {
  'use strict';
  const O = window.Oly;
  const G = window.Games;
  const { HEX, SHADE, LIGHT, shape } = G.kit;
  const STEP = O.SIM_STEP || 10;

  const W = [40, 60, 80, 100, 120, 140, 160, 180, 200, 220];   // 서버 olympic.LIFT_STEPS 와 같아요
  const READY = 1100; const PULL_MAX = 7000; const JERK_MAX = 3200; const SHOW = 1500;
  const need = (w) => 3 + w / 22;              // 이 무게를 버티려면 1초에 몇 번
  const osc = (w) => Math.max(0.62, 1.35 - w / 330);   // 바늘 한 번 왕복(초)
  const zone = (w) => Math.max(0.12, 0.3 - w / 1300);  // 초록 칸 넓이(반쪽)
  const BOT_START = 1500; const BOT_CYCLE = 4200;
  // 난이도 값을 곱한 것 (초록 칸 넓이 · 필요한 빠르기 · 바늘 왕복)
  const dpOf = (st) => st.dp || O.diffP('normal');
  const zoneS = (st, w) => zone(w) * dpOf(st).lfZone;
  const needS = (st, w) => need(w) * dpOf(st).lfNeed;
  const oscS = (st, w) => osc(w) * dpOf(st).lfOsc;

  const sim = {
    init() { return { wi: 0, fails: 0, ph: 'ready', phT: 0, h: 0, best: 0, mash: new O.Masher(66), jerkT: 0, done: false, tries: 0, lastOk: null }; },
    press(st, c, e) {
      if (st.done) return null;
      if (st.ph === 'pull' && (c === 'r' || c === 'b')) {
        if (st.mash.press(c, e) === 1) { st.h = Math.min(1, st.h + 0.12); return { sfx: 'step', vib: 6 }; }
        return null;
      }
      if (st.ph === 'jerk' && c === 'g') {
        const w = W[st.wi];
        const p = Math.sin(2 * Math.PI * (e - st.jerkT) / 1000 / oscS(st, w));
        return Math.abs(p) <= zoneS(st, w) ? ok(st, e) : fail(st, e, '삐끗! 놓쳤어요');
      }
      return null;
    },
    step(st, dt, e) {
      if (st.done) return null;
      const w = W[st.wi];
      if (st.ph === 'ready' && e - st.phT >= READY) { st.ph = 'pull'; st.phT = e; st.h = 0; st.mash = new O.Masher(66); return { say: `${w}kg 들어 올려요!`, color: '#FFE27A' }; }
      if (st.ph === 'pull') {
        if (st.h >= 1) { st.ph = 'jerk'; st.phT = e; st.jerkT = e; return { say: '지금! 초록!', color: '#7DF0AE', sfx: 'tick' }; }
        st.h = Math.max(0, st.h - 0.12 * needS(st, w) * dt);
        if (e - st.phT > PULL_MAX) return fail(st, e, '힘이 모자라요…');
      }
      if (st.ph === 'jerk' && e - st.phT > JERK_MAX) return fail(st, e, '시간이 지났어요');
      if ((st.ph === 'up' || st.ph === 'drop') && e - st.phT >= SHOW) {
        if (st.ph === 'up') {
          if (st.wi + 1 >= W.length) { st.done = true; st.doneT = e; return { say: '세계 최고!', color: '#FFD23F' }; }
          st.wi += 1; st.fails = 0;
        } else if (st.fails >= 2) { st.done = true; st.doneT = e; return null; }
        st.ph = 'ready'; st.phT = e; st.h = 0;
      }
      return null;
    }
  };
  function ok(st, e) {
    st.ph = 'up'; st.phT = e; st.best = Math.max(st.best, W[st.wi]); st.tries += 1; st.lastOk = true;
    return { say: `${W[st.wi]}kg 성공!`, color: '#FFD23F', sfx: 'perfect', vib: [30, 40, 90], good: true };
  }
  function fail(st, e, why) {
    st.ph = 'drop'; st.phT = e; st.fails += 1; st.tries += 1; st.lastOk = false;
    return { say: why + (st.fails >= 2 ? '' : ' (한 번 더!)'), color: '#FF8B95', sfx: 'bad', vib: [50, 30, 50] };
  }

  // AI: 서버가 정한 순서대로 (성공·실패)
  function botState(perf, e) {
    const lifts = perf.lifts || [];
    const k = Math.floor((e - BOT_START) / BOT_CYCLE);
    const best = lifts.slice(0, Math.max(0, k)).filter((l) => l.ok).reduce((m, l) => Math.max(m, l.kg), 0);
    if (!lifts.length) return { kg: 40, ph: 'ready', h: 0, best: 0 };
    if (e < BOT_START) return { kg: lifts[0].kg, ph: 'ready', h: 0, best: 0 };
    if (k >= lifts.length) return { kg: lifts[lifts.length - 1].kg, ph: 'done', h: 0, best: perf.score };
    const L = lifts[k];
    const s = e - BOT_START - k * BOT_CYCLE;
    if (s < 600) return { kg: L.kg, ph: 'ready', h: 0, best };
    if (s < 2600) return { kg: L.kg, ph: 'pull', h: Math.min(1, (s - 600) / 2000), best };
    if (s < 3000) return { kg: L.kg, ph: 'jerk', h: 1, best };
    return { kg: L.kg, ph: L.ok ? 'up' : 'drop', h: L.ok ? 1 : 0, best: L.ok ? Math.max(best, L.kg) : best };
  }
  const PHC = { ready: 0, pull: 1, jerk: 2, up: 3, drop: 4, done: 5 };
  const PHN = ['ready', 'pull', 'jerk', 'up', 'drop', 'done'];

  const plateColor = (w) => (w >= 160 ? '#FF4757' : w >= 120 ? '#3D7BFF' : w >= 80 ? '#FFD23F' : '#2ED573');
  function barbellSVG(w) {
    const r = 15 + Math.min(16, w / 14);
    const c = plateColor(w);
    return `<circle r="${r + 2}" fill="rgba(0,0,0,.25)" cy="2"/><circle r="${r}" fill="${c}" stroke="#2A2340" stroke-width="2"/><circle r="${r * 0.7}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/><circle r="4.5" fill="#E9E6FA" stroke="#5B5677" stroke-width="1.5"/><text y="${r * 0.48}" text-anchor="middle" font-size="${Math.max(8, r * 0.36).toFixed(1)}" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">${w}</text>`;
  }

  function create(ctx) {
    const list = O.roster(ctx);
    ctx.stage.innerHTML = '';
    const wrap = G.kit.el(`<div class="oly-wrap olf"><div class="olf-chips"></div><div class="oly-scene"></div><div class="oly-hud"></div><div class="oly-msg"></div></div>`);
    ctx.stage.appendChild(wrap);
    const chipsEl = wrap.querySelector('.olf-chips');
    const scene = wrap.querySelector('.oly-scene');
    const hud = wrap.querySelector('.oly-hud');
    const msgEl = wrap.querySelector('.oly-msg');
    const others = list.filter((p) => !p.me);
    chipsEl.innerHTML = others.map((p) => `<div class="olf-chip" data-pid="${p.pid}"><span class="av">${O.faceSVG(p.athlete)}</span><div><b>${G.esc(p.name)}</b><span class="olf-kg">-</span></div><i class="olf-lt"></i></div>`).join('');
    const chip = {};
    others.forEach((p) => { const c = chipsEl.querySelector(`[data-pid="${p.pid}"]`); chip[p.pid] = { el: c, kg: c.querySelector('.olf-kg'), lt: c.querySelector('.olf-lt'), key: '' }; });
    const meter = O.rateMeter(hud);
    const needEl = G.kit.el('<div class="olf-need"><span>필요한 빠르기</span><b></b></div>');
    meter.el.appendChild(needEl);
    // 무대 (SVG)
    const svg = O.el('svg', { class: 'oly-svg' });
    scene.appendChild(svg);
    const me = list.find((p) => p.me);
    let A = null; let bar = null; let arms = null; let lights = null; let jerkG = null; let Wd = 0; let Hd = 0; let kgText = null;
    function build() {
      Wd = Math.max(200, scene.clientWidth || 360); Hd = Math.max(200, scene.clientHeight || 360);
      svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`); svg.setAttribute('width', Wd); svg.setAttribute('height', Hd);
      svg.innerHTML = `<defs><linearGradient id="olf-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2552"/><stop offset="1" stop-color="#3B3570"/></linearGradient>
        <radialGradient id="olf-spot" cx=".5" cy=".2" r=".7"><stop offset="0" stop-color="rgba(255,240,180,.45)"/><stop offset="1" stop-color="rgba(255,240,180,0)"/></radialGradient></defs>
        <rect width="${Wd}" height="${Hd}" fill="url(#olf-bg)"/>
        <g opacity=".9">${O.standsSVG(Wd, Hd * 0.28, 5)}</g>
        <rect width="${Wd}" height="${Hd}" fill="url(#olf-spot)"/>
        <rect x="${Wd * 0.1}" y="${Hd * 0.78}" width="${Wd * 0.8}" height="${Hd * 0.08}" rx="4" fill="#8B5A2B"/><rect x="${Wd * 0.1}" y="${Hd * 0.78}" width="${Wd * 0.8}" height="5" fill="#B07A45"/>
        <rect x="0" y="${Hd * 0.86}" width="${Wd}" height="${Hd * 0.14}" fill="#2A2340"/>`;
      lights = O.el('g', { transform: `translate(${Wd / 2} ${Hd * 0.34})` });
      svg.appendChild(lights);
      kgText = O.el('text', { x: Wd / 2, y: Hd * 0.3 - 6, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 900, fill: '#FFD23F', 'font-family': 'system-ui,sans-serif' }, '');
      svg.appendChild(kgText);
      const s = Math.min(2.1, Hd * 0.45 / 86);
      A = O.makeAthlete(me.athlete, me.bib, {});
      A.scale = s; A.cx = Wd * 0.44; A.fy = Hd * 0.78;
      svg.appendChild(A.g);
      arms = O.el('g', {});
      svg.appendChild(arms);
      bar = O.el('g', {});
      svg.appendChild(bar);
      jerkG = O.el('g', { transform: `translate(${Wd / 2} ${Hd * 0.12})` });
      svg.appendChild(jerkG);
    }
    build();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { const w = scene.clientWidth; const h = scene.clientHeight; if (w !== Wd || h !== Hd) build(); }) : null;
    if (ro) ro.observe(scene);

    const st = sim.init();
    st.e = 0;
    st.dp = O.diffP(ctx.diff);
    const log = [];
    let lastT = 0; let ph = 0; let msgT = 0;
    function say(t, c, ms) { msgEl.textContent = t; msgEl.style.color = c || '#fff'; msgEl.classList.remove('show'); void msgEl.offsetWidth; msgEl.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('show'), ms || 1300); }
    function react(r) {
      if (!r) return;
      if (r.say) say(r.say, r.color);
      if (r.sfx && ctx.sfx[r.sfx]) ctx.sfx[r.sfx]();
      if (r.vib) ctx.vibrate(r.vib);
      if (r.good) { const b = ctx.stage.getBoundingClientRect(); ctx.fx.burst(b.width * 0.45, b.height * 0.35, '#FFD23F', 24); }
    }
    function simTo(e) { while (st.e + STEP <= e) { st.e += STEP; react(sim.step(st, STEP / 1000, st.e)); } }

    function drawLifter(t) {
      const w = W[st.wi];
      const s = A.scale; const cx = A.cx; const fy = A.fy;
      let pose; let bx = cx + 20 * s; let by = fy - 8 * s;
      const sh = { x: cx + 3 * s, y: fy - 39 * s };
      if (st.ph === 'ready' || st.ph === 'done') { pose = O.P.stand(); by = fy - 18 * s; bx = cx + 26 * s; }
      else if (st.ph === 'pull') {
        const h = st.h;
        const wob = Math.sin(t / 60) * (1 - h) * 1.5;
        pose = { tilt: 28 * (1 - h) + wob, bob: 14 * (1 - h), fl: 70 * (1 - h), fk: 100 * (1 - h), bl: 40 * (1 - h), bk: 80 * (1 - h), head: -18 * (1 - h), ex: 'e', fx: h > 0.5 ? 'sweat' : '' };
        bx = cx + (20 - 6 * h) * s; by = fy - (18 + 34 * h) * s;
      } else if (st.ph === 'jerk') { pose = { fl: 30, fk: 40, bl: -20, bk: 30, bob: 5, ex: 'e', fx: 'sweat' }; bx = cx + 14 * s; by = fy - 50 * s; }
      else if (st.ph === 'up') { pose = { fl: 25, bl: -25, ex: 'h', fx: 'sparkle' }; bx = cx + 4 * s; by = fy - 112 * s; }
      else { pose = O.P.sad(); bx = cx + 30 * s; by = fy - 14 * s; }
      A.set(Object.assign({ x: cx, y: fy, s }, pose));
      // 팔: 어깨 → 바벨 (옆에서 보면 원판이 동그랗게 보여요)
      const sx = sh.x + (st.ph === 'pull' ? 8 * (1 - st.h) * s : 0);
      const sy = fy - (39 - (pose.bob || 0)) * s;
      const holding = st.ph !== 'drop' && st.ph !== 'ready' && st.ph !== 'done';
      arms.innerHTML = holding ? `<path d="M${sx.toFixed(1)} ${sy.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}" stroke="${A.a.skin}" stroke-width="${(6.4 * s).toFixed(1)}" stroke-linecap="round"/><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(4.6 * s).toFixed(1)}" fill="${A.a.skin}"/>` : '';
      bar.setAttribute('transform', `translate(${bx.toFixed(1)} ${by.toFixed(1)}) scale(${(s * 0.9).toFixed(2)})`);
      if (bar.dataset.w !== String(w)) { bar.innerHTML = barbellSVG(w); bar.dataset.w = String(w); }
      kgText.textContent = st.done ? `최고 ${st.best}kg` : `${w}kg · ${st.fails ? '두 번째 도전' : '첫 도전'}`;
      // 심판 불 3개
      const lc = st.ph === 'up' ? '#FFFFFF' : st.ph === 'drop' ? '#FF4757' : 'rgba(255,255,255,.12)';
      lights.innerHTML = [-28, 0, 28].map((dx) => `<circle cx="${dx}" r="9" fill="${lc}" stroke="rgba(0,0,0,.3)"/>`).join('');
      // 흔들리는 바늘 (들어 올리는 순간)
      if (st.ph === 'jerk') {
        const p = Math.sin(2 * Math.PI * (st.e - st.jerkT) / 1000 / oscS(st, w));
        const z = zoneS(st, w); const L = Math.min(150, Wd * 0.38);
        jerkG.innerHTML = `<rect x="${-L - 8}" y="-16" width="${2 * L + 16}" height="32" rx="16" fill="rgba(21,18,43,.85)"/><rect x="${-L}" y="-6" width="${2 * L}" height="12" rx="6" fill="#FF4757" opacity=".55"/><rect x="${(-z * L).toFixed(1)}" y="-8" width="${(2 * z * L).toFixed(1)}" height="16" rx="5" fill="#2ED573"/><path d="M${(p * L).toFixed(1)} -14 v28" stroke="#FFD23F" stroke-width="5" stroke-linecap="round"/><text y="34" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">초록 칸에서 초록!</text>`;
      } else jerkG.innerHTML = '';
    }

    return {
      start() {},
      tick(t) {
        const e = t - ctx.startAt;
        lastT = t;
        simTo(e);
        meter.set(st.ph === 'pull' ? st.mash.rate(e) : 0);
        needEl.lastChild.textContent = `${Math.ceil(needS(st, W[st.wi]))}번/초 이상`;
        needEl.style.visibility = st.ph === 'pull' ? 'visible' : 'hidden';
        drawLifter(t);
        // 다른 선수 상태 카드
        const live = ctx.live();
        let r = 1;
        others.forEach((p) => {
          const a = live[p.pid];
          const ex = (a && a[2]) || [];
          const best = a ? a[0] || 0 : 0;
          if (best > st.best) r++;
          const phn = PHN[ex[1] || 0];
          const key = `${best}:${ex[0]}:${phn}`;
          const C = chip[p.pid];
          if (C.key === key) return;
          C.key = key;
          C.kg.textContent = `${ex[0] || 40}kg ${phn === 'pull' ? '드는 중' : phn === 'jerk' ? '번쩍!' : phn === 'up' ? '성공' : phn === 'drop' ? '실패' : phn === 'done' ? '끝' : '준비'} · 최고 ${best || '-'}`;
          C.lt.className = 'olf-lt ' + (phn === 'up' ? 'ok' : phn === 'drop' ? 'no' : '');
        });
        ctx.setScore(st.best);
        if (st.best) ctx.setBadge(`${r}위`, r === 1 ? 'y' : 'b');
      },
      onPress(c, t) { const e = t - ctx.startAt; simTo(e); log.push([Math.round(e), c]); react(sim.press(st, c, e)); },
      onRelease(c, t) { const e = t - ctx.startAt; log.push([Math.round(e), c.toUpperCase()]); },
      end() { if (ro) ro.disconnect(); clearTimeout(msgT); },
      done: () => st.done && st.e - st.doneT > 1200,
      score: () => st.best,
      value: () => st.best,
      extra: () => [W[st.wi], PHC[st.done ? 'done' : st.ph], Math.round(st.h * 100) / 100, st.fails],
      log: () => log,
      _st: () => st,
      _needle: () => (st.ph === 'jerk' ? Math.sin(2 * Math.PI * (st.e - st.jerkT) / 1000 / oscS(st, W[st.wi])) : 9),
      _zone: () => zoneS(st, W[st.wi]),
      summary: () => (st.best ? `최고 ${st.best}kg` : '성공 못 했어요')
    };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#3B3570"/><path d="M6 14 H34" stroke="#E9E6FA" stroke-width="2.6"/><rect x="5" y="7" width="6" height="14" rx="2" fill="#FF4757"/><rect x="29" y="7" width="6" height="14" rx="2" fill="#FF4757"/><circle cx="20" cy="22" r="4.5" fill="#FFD23F"/><path d="M14 14 L17 22 M26 14 L23 22 M20 27 V31 M17 36 L20 31 L23 36" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>';

  O.register({
    id: 'olift',
    title: '역도',
    cat: '하계 · 역도',
    catColor: 'r',
    how: '연타로 번쩍 → 바늘이 초록일 때 초록',
    icon: ICON,
    buttons: ['r', 'g', 'b'], noGo: true, pressSound: false,
    rules: ['빨·파 연타로 바벨을 가슴까지 들어 올려요 (무거울수록 더 빨리!)', '바늘이 가운데 초록 칸에 올 때 초록! 머리 위로 번쩍', '성공하면 더 무겁게 · 같은 무게 2번 실패하면 끝'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '영차')}${b('b', '영차')}<svg width="60" height="34" viewBox="0 0 60 34"><rect x="4" y="12" width="52" height="10" rx="5" fill="#FF4757" opacity=".6"/><rect x="22" y="10" width="16" height="14" rx="4" fill="#2ED573"/><path d="M30 4 v26" stroke="#FFD23F" stroke-width="4" stroke-linecap="round"/></svg>${b('g', '번쩍!')}</div>`;
    },
    fmt: (kg) => (kg > 0 ? `${kg}kg` : '기록 없음'),
    rival(arr) { const b = arr ? arr[0] || 0 : 0; const ex = (arr && arr[2]) || []; return { sort: b, text: b ? `${b}kg` : `${ex[0] || 40}kg 도전` }; },
    botLive(perf, e) { const b = botState(perf, e); return [b.best, b.best, [b.kg, PHC[b.ph], Math.round(b.h * 100) / 100, 0]]; },
    create
  });
})();
