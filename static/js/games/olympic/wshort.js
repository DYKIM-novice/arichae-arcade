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

  // 엉뚱 변주: 뒤쪽 직선 빙판 위에 펭귄이 뒤뚱뒤뚱! 자리는 씨앗으로 정해요 (모든 폰이 같아요)
  //  펭귄 바로 앞(2.5m 안)에서 초록을 누르면 휙 피하고, 아니면 펭귄이랑 꽝! (곡선 꽈당과 같은 벌칙)
  const PENG_WIN = 2.5;
  const pengAt = (seed) => { const u = S + Math.PI * R + S * (0.3 + ((seed >>> 0) % 997) / 997 * 0.4); return [u, u + LAP, u + 2 * LAP]; };

  const sim = {
    init(c) { return { v: 0, x: 0, mash: new O.Masher(66), lean: false, state: 0, waitUntil: 0, fallUntil: 0, falls: 0, pens: pengAt((c && c.seed) || 1), pi: 0, leanX: -99, fallAt: 0, fallKind: 0, dodge: 0 }; },
    press(st, c, e, gun) {
      if (c === 'g') { if (e >= gun) { st.lean = true; st.leanX = st.x; } return null; }
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
            st.state = 2; st.fallUntil = e + 1300; st.v = 1.5; st.falls += 1; st.fallAt = e; st.fallKind = 1;
            out = { say: '꽈당! 초록 꾹!', color: '#FF8B95', sfx: 'bad', vib: [60, 40, 60], ms: 1400 };
          } else {
            const cap = st.lean ? LEAN_MAX : SAFE;
            if (st.v > cap) st.v -= (st.v - cap) * 2.4 * dt;
          }
        } else if (st.lean) st.v -= 3.2 * dt;     // 직선에서 기울이면 느려져요
      }
      st.v = Math.max(0, st.v * Math.exp(-0.55 * dt));
      st.x += st.v * dt;
      st.curve = sg.curve;
      // 펭귄 지나가기
      const pp = st.pens ? st.pens[st.pi] : null;
      if (pp != null && st.x >= pp) {
        st.pi += 1;
        if (st.state !== 2) {
          if (st.lean || st.x - st.leanX < PENG_WIN) { st.dodge += 1; out = out || { say: '휙! 펭귄 피했다', color: '#7DF0AE', sfx: 'whoosh', ms: 900 }; }
          else {
            st.state = 2; st.fallUntil = e + 1000; st.v = 2.5; st.falls += 1; st.fallAt = e; st.fallKind = 2;   // 펭귄은 조금 가벼운 벌칙
            out = { say: '펭귄이랑 꽝!', color: '#FF8B95', sfx: 'bad', vib: [60, 40, 60], ms: 1400 };
          }
        }
      }
      return out;
    }
  };

  /* ---------- 위에서 본 선수 (앞 = +x) · 팔다리가 움직여요 ---------- */
  function skaterSVG(a, z) {
    const lw = (z * 0.2).toFixed(1); const ll = (z * 0.78).toFixed(1); const aw = (z * 0.16).toFixed(1); const al = (z * 0.62).toFixed(1);
    const leg = `<rect x="0" y="${(-z * 0.1).toFixed(1)}" width="${ll}" height="${lw}" rx="${(z * 0.1).toFixed(1)}" fill="${a.shorts}"/><path d="M${(z * 0.55).toFixed(1)} 0 H${(z * 0.98).toFixed(1)}" stroke="#C9D3E0" stroke-width="${(z * 0.07).toFixed(1)}" stroke-linecap="round"/>`;
    const arm = `<rect x="0" y="${(-z * 0.08).toFixed(1)}" width="${al}" height="${aw}" rx="${(z * 0.08).toFixed(1)}" fill="${a.jersey}"/><circle cx="${al}" r="${(z * 0.1).toFixed(1)}" fill="${a.skin}"/>`;
    return `<g class="lgL" transform="translate(${(-z * 0.2).toFixed(1)} ${(-z * 0.2).toFixed(1)})"><g>${leg}</g></g><g class="lgR" transform="translate(${(-z * 0.2).toFixed(1)} ${(z * 0.2).toFixed(1)})"><g>${leg}</g></g>
      <g class="arL" transform="translate(${(z * 0.1).toFixed(1)} ${(-z * 0.4).toFixed(1)})"><g>${arm}</g></g><g class="arR" transform="translate(${(z * 0.1).toFixed(1)} ${(z * 0.4).toFixed(1)})"><g>${arm}</g></g>
      <ellipse rx="${(z * 0.6).toFixed(1)}" ry="${(z * 0.44).toFixed(1)}" fill="${a.jersey}" stroke="#2A2340" stroke-width="1.2"/>`;
  }
  const PENGUIN = '<g class="osh-peng"><ellipse cx="0" cy="1" rx="13" ry="15.5" fill="#2A2340"/><ellipse cx="0" cy="4" rx="9" ry="11.5" fill="#fff"/><circle cx="-4" cy="-6" r="2.2" fill="#fff"/><circle cx="4" cy="-6" r="2.2" fill="#fff"/><circle cx="-3.6" cy="-5.8" r="1.1" fill="#2A2340"/><circle cx="4.4" cy="-5.8" r="1.1" fill="#2A2340"/><path d="M-3 -2 L0 2 L3 -2 Z" fill="#FFB43D"/><ellipse cx="-5" cy="2" rx="2.4" ry="1.4" fill="#FF8FA6" opacity=".7"/><ellipse cx="5" cy="2" rx="2.4" ry="1.4" fill="#FF8FA6" opacity=".7"/><path class="fl" d="M-12 -2 Q-21 6 -16 13 Q-12 6 -10 4 Z" fill="#2A2340"/><path class="fr" d="M12 -2 Q21 6 16 13 Q12 6 10 4 Z" fill="#2A2340"/><ellipse cx="-5" cy="16.5" rx="4.4" ry="2" fill="#FFB43D"/><ellipse cx="5" cy="16.5" rx="4.4" ry="2" fill="#FFB43D"/></g>';
  const STARS3 = '<g class="osh-stars"><path d="M0 -10 l1.6 3.2 3.4 .4 -2.5 2.4 .7 3.4 -3.2 -1.7 -3.2 1.7 .7 -3.4 -2.5 -2.4 3.4 -.4 Z" fill="#FFD23F" stroke="#E0A800" stroke-width=".6"/><path transform="rotate(120)" d="M0 -10 l1.6 3.2 3.4 .4 -2.5 2.4 .7 3.4 -3.2 -1.7 -3.2 1.7 .7 -3.4 -2.5 -2.4 3.4 -.4 Z" fill="#FFD23F" stroke="#E0A800" stroke-width=".6"/><path transform="rotate(240)" d="M0 -10 l1.6 3.2 3.4 .4 -2.5 2.4 .7 3.4 -3.2 -1.7 -3.2 1.7 .7 -3.4 -2.5 -2.4 3.4 -.4 Z" fill="#FFD23F" stroke="#E0A800" stroke-width=".6"/></g>';
  // 꽈당 연출 시간(초): 미끄러져 → 쿵! 벽 → 어질어질 → 비틀비틀 일어나기
  const F_SLIDE = 0.6; const F_DAZE = 1.05; const F_UP = 1.7;

  function create(ctx) {
    const gun = (ctx.ev && ctx.ev.gun) || 2400;
    const seed = ctx.seed || 1;
    const PENS = pengAt(seed);
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
    const FX = O.fx;
    const camC = FX ? FX.cam(svg) : null;
    let Wd = 0; let Hd = 0; let k = 1; let cx = 0; let cy = 0; let tokens = {}; let board = null;
    let PF = null; let PB = null; let peng = null; let trailG = null;
    const shown = {};
    const vis = {};
    // 빙판 좌표(m) → 화면 (빙판을 세웠으니 (x, y) → (y, -x))
    const scr = (x, y) => [cx + y * k, cy - x * k];
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
      const padX = (cx - (R + 3.2) * k).toFixed(1); const padY = (cy - (S / 2 + R + 2.4) * k).toFixed(1);
      const padW = (2 * (R + 3.2) * k).toFixed(1); const padH = ((S + 2 * R + 4.8) * k).toFixed(1); const padR = ((R + 3) * k).toFixed(1);
      svg.innerHTML = `<rect x="-30" y="-30" width="${Wd + 60}" height="${Hd + 60}" fill="#B9D8EE"/>
        <rect x="${padX}" y="${padY}" width="${padW}" height="${padH}" rx="${padR}" fill="#F4FAFF" stroke="#3D7BFF" stroke-width="7"/>
        <rect x="${padX}" y="${padY}" width="${padW}" height="${padH}" rx="${padR}" fill="none" stroke="#FF6FB5" stroke-width="7" stroke-dasharray="16 16"/>
        <g transform="rotate(-90 ${cx} ${cy})"><path d="${oval(R + 2.6)}" fill="none" stroke="#D5E9F7" stroke-width="${(1.4 * k).toFixed(1)}"/>
        <path d="${oval(R)}" fill="none" stroke="#E0435A" stroke-width="1.6" stroke-dasharray="6 6" opacity=".55"/>
        <path d="${oval(R - 2.2)}" fill="#EAF5FD" stroke="#7FB8E0" stroke-width="1.2"/>
        ${blocks}
        <path d="M${X(0)} ${Y(R - 2.6)} V${Y(R + 3.2)}" stroke="#E0435A" stroke-width="3"/></g>
        <text x="${(cx + (R + 1.6) * k).toFixed(1)}" y="${(cy + 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="900" fill="#E0435A" font-family="system-ui,sans-serif" transform="rotate(90 ${(cx + (R + 1.6) * k).toFixed(1)} ${cy.toFixed(1)})">출발·결승</text>
        <g transform="translate(${cx} ${cy})">${O.RINGS(0, -6, 1.1)}</g>`;
      board = O.el('text', { x: cx, y: cy + 22, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 900, fill: '#3B6E96', 'font-family': 'system-ui,sans-serif' }, '');
      svg.appendChild(board);
      // 스케이트 자국 · 뒤쪽 효과
      trailG = O.el('g', { fill: 'none', 'stroke-linecap': 'round' });
      svg.appendChild(trailG);
      const back = O.el('g', {}); svg.appendChild(back);
      PB = FX ? FX.parts(back, 30) : null;
      // 펭귄
      peng = O.el('g', {}, `<g class="osh-pg">${PENGUIN}</g><g class="osh-pgb" display="none"><rect x="-13" y="-46" width="26" height="20" rx="8" fill="#fff" stroke="#2A2340" stroke-width="1.6"/><text y="-31" text-anchor="middle" font-size="14" font-weight="900" fill="#FF4757" font-family="system-ui,sans-serif">!</text></g>`);
      svg.appendChild(peng);
      peng.pg = peng.firstElementChild; peng.bub = peng.lastElementChild;
      tokens = {};
      list.slice().reverse().forEach((p, ri) => {
        const a = O.ath(p.athlete);
        const z = (p.me ? 3.4 : 2.8) * k;
        const g = O.el('g', {}, `<g class="osh-tk">${skaterSVG(a, z)}<g class="osh-hd" transform="translate(${(z * 0.15).toFixed(1)} 0) rotate(90) scale(${(z / 52).toFixed(3)})">${O.HEAD[a.id]('n')}</g></g><g class="osh-st3" display="none" transform="scale(${(z / 18).toFixed(2)})"></g>
          <g class="osh-tag" transform="translate(0 ${(-z * 1.15).toFixed(1)})"><rect x="-17" y="-7" width="34" height="13" rx="6.5" fill="${p.me ? '#FFD23F' : 'rgba(21,18,43,.7)'}"/><text y="3" text-anchor="middle" font-size="8.5" font-weight="900" fill="${p.me ? '#15122B' : '#fff'}" font-family="system-ui,sans-serif">${p.me ? '나' : G.esc(p.name.slice(0, 4))}</text></g>`);
        svg.appendChild(g);
        const tk = g.firstElementChild;
        const trail = O.el('path', { stroke: p.me ? 'rgba(61,123,255,.35)' : 'rgba(127,184,224,.45)', 'stroke-width': p.me ? 2.4 : 1.6 });
        trailG.appendChild(trail);
        tokens[p.pid] = { g, tk, z, a, lane: list.length - 1 - ri, trail, hd: tk.querySelector('.osh-hd'), ex: 'n', st3: g.querySelector('.osh-st3'),
          lgL: tk.querySelector('.lgL > g'), lgR: tk.querySelector('.lgR > g'), arL: tk.querySelector('.arL > g'), arR: tk.querySelector('.arR > g') };
        tokens[p.pid].st3.innerHTML = STARS3;
      });
      if (tokens[list[0].pid]) svg.appendChild(tokens[list[0].pid].g);   // 나는 맨 위에
      const front = O.el('g', {}); svg.appendChild(front);
      PF = FX ? FX.parts(front, 44) : null;
    }
    const st = sim.init(ctx);
    st.e = 0; st.fin = 0;
    build();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (scene.clientWidth !== Wd || scene.clientHeight !== Hd) build(); }) : null;
    if (ro) ro.observe(scene);
    const log = [];
    let lastT = 0; let msgT = 0; let finSaid = false; let stage = -1; let lastLap = 1; let pengWarn = -1;
    const pg = { hitT: -1e9, duckT: -1e9, dodgeT: -1e9, hitDir: 1 };
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
    // 트랙 위 자리 s(m) + 바깥쪽으로 밀린 거리 out(m) → 화면 좌표 · 진행 각도 · 바깥 방향
    function where(T, s, out) {
      const sg = seg(s);
      const off = (T.lane - (list.length - 1) / 2) * 0.55;    // 겹치지 않게 조금씩 옆으로
      const nx = sg.curve ? (sg.x - (sg.x > 0 ? S / 2 : -S / 2)) / R : 0;
      const ny = sg.curve ? sg.y / R : (sg.y > 0 ? 1 : -1);
      const [x, y] = scr(sg.x + nx * (off + out), sg.y + ny * (off + out));
      return { x, y, ang: sg.a * 180 / Math.PI - 90, ox: ny, oy: -nx, curve: sg.curve };   // (ox, oy) = 화면에서 바깥쪽
    }
    // 화면 효과 한 프레임: 선수 하나
    function place(p, T, s, v, lean, state, e, dt, me) {
      const V = vis[p.pid] || (vis[p.pid] = { st: 0, fT: -1e9, fS: 0, ph: Math.random() * 6, hist: [], hT: 0, sprT: 0, bonk: false, lastS: s, pk: 0 });
      if (state === 2 && V.st !== 2) { V.fT = e; V.fS = s; V.bonk = false; V.pk = nearPeng(s) ? 1 : 0; if (V.pk) pengHit(e, p); }
      V.st = state;
      const ft = (e - V.fT) / 1000;
      const falling = ft < F_UP && ft >= 0;
      let ss = s; let out = 0; let spin = 0; let sq = 1; let wob = 0; let ex = 'n';
      if (falling) {
        // 앞으로 미끄러지며 바깥 벽 쪽으로 슝 → 쿵!
        const ks = O.ease(Math.min(1, ft / F_SLIDE));
        ss = Math.max(s, V.fS + 2.4 * ks);
        const wall = 1.75 - ((T.lane - (list.length - 1) / 2) * 0.55) * 0.5;
        out = ft < F_DAZE ? wall * ks : wall * (1 - O.ease((ft - F_DAZE) / (F_UP - F_DAZE)));
        spin = ft < F_SLIDE ? 820 * (1 - Math.pow(1 - ft / F_SLIDE, 2)) : 820;
        if (ft >= F_SLIDE && ft < F_SLIDE + 0.18) sq = 0.72 + 0.28 * ((ft - F_SLIDE) / 0.18);
        if (ft > F_DAZE) wob = Math.sin(ft * 22) * 26 * (1 - (ft - F_DAZE) / (F_UP - F_DAZE));
        ex = ft < 0.3 ? 'o' : 'd';
        if (!V.bonk && ft >= F_SLIDE) {
          V.bonk = true;
          const w = where(T, ss, out + 0.9);
          if (PF) { PF.burst('star', w.x, w.y, 5, { sp: 110 }); PF.burst('ring', w.x, w.y, 1, { color: '#FF6FB5' }); }
          if (me) { if (camC) camC.shake(6, 360); if (ctx.sfx.bonk) ctx.sfx.bonk(); setTimeout(() => ctx.sfx.thud && ctx.sfx.thud(), 60); ctx.vibrate([30, 30, 60]); }
        }
      }
      const w = where(T, ss, out);
      // 내가 넘어지면 가까이 (몸개그 크게)
      if (me && camC) {
        if (falling) { camC.focus(w.x, w.y); camC.zoom(ft < F_UP - 0.25 ? 1.9 : 1, 6); } else camC.zoom(1, 5);
      }
      // 기울이기: 곡선에서 안쪽으로 살짝
      const inward = lean && w.curve && !falling;
      const lx = w.x - (inward ? w.ox * 0.35 * k : 0); const ly = w.y - (inward ? w.oy * 0.35 * k : 0);
      // 펭귄 피하기 깡충 (나)
      const hop = me && e - pg.dodgeT < 300 ? Math.sin((e - pg.dodgeT) / 300 * Math.PI) : 0;
      T.g.setAttribute('transform', `translate(${(lx - (hop ? w.ox * 0.6 * k * hop : 0)).toFixed(1)} ${(ly - (hop ? w.oy * 0.6 * k * hop : 0)).toFixed(1)})`);
      const stretch = falling ? 1 : 1 + Math.min(0.16, v / 70);
      const hs = 1 + hop * 0.3;
      T.tk.setAttribute('transform', `rotate(${(w.ang + spin + wob).toFixed(1)}) scale(${(stretch * hs * (falling ? 1 : 1)).toFixed(3)} ${((2 - stretch) * hs * sq).toFixed(3)})`);
      T.g.style.opacity = '';
      // 팔다리: 밀기(번갈아) · 곡선 손 짚기 · 꽈당 불가사리
      V.ph += dt * (2 + v * 0.75);
      const sn = Math.sin(V.ph);
      // 안쪽이 왼쪽(-y)인지: 바깥 방향을 선수 기준으로 돌려 봐요
      const ar = (w.ang * Math.PI) / 180;
      const outLocalY = -Math.sin(ar) * w.ox + Math.cos(ar) * w.oy;
      const innerL = outLocalY > 0;     // 바깥이 +y(오른쪽)이면 안쪽은 왼쪽
      let aL; let aR; let gL; let gR;
      if (falling && ft < F_DAZE + 0.2) {
        const fl = Math.sin(ft * 26) * 16;
        aL = -55 + fl; aR = 55 - fl; gL = -150 - fl; gR = 150 + fl;     // 불가사리 (배로 쭉)
      } else if (state === 3 || (e < gun)) {
        aL = 180 + 8; aR = 180 - 8; gL = 180 + 10; gR = 180 - 10;
        if (state === 3) { aL = -60 + Math.sin(e / 120) * 20; aR = 60 - Math.sin(e / 120) * 20; }   // 골인 만세
      } else {
        gL = 180 + 14 + 30 * Math.max(0, sn); gR = 180 - 14 - 30 * Math.max(0, -sn);
        aL = 180 + 30 * sn; aR = 180 + 30 * sn;
        if (inward) { if (innerL) aL = -95; else aR = 95; }
      }
      if (T.lgL) {
        T.lgL.setAttribute('transform', `rotate(${gL.toFixed(0)})`); T.lgR.setAttribute('transform', `rotate(${gR.toFixed(0)})`);
        T.arL.setAttribute('transform', `rotate(${aL.toFixed(0)})`); T.arR.setAttribute('transform', `rotate(${aR.toFixed(0)})`);
      }
      if (ex !== T.ex) { T.ex = ex; T.hd.innerHTML = O.HEAD[T.a.id](ex); }
      // 어질어질 별
      const dazed = falling && ft > F_SLIDE && ft < F_UP;
      T.st3.setAttribute('display', dazed ? 'inline' : 'none');
      // 스케이트 자국
      V.hT += dt;
      if (V.hT > 0.05) { V.hT = 0; V.hist.push(lx.toFixed(1) + ' ' + ly.toFixed(1)); if (V.hist.length > 16) V.hist.shift(); T.trail.setAttribute('d', V.hist.length > 1 ? 'M' + V.hist.join(' L') : ''); }
      // 얼음 가루 (곡선에서 기울이며 빠르게) · 손 짚은 곳 불꽃 · 넘어져 미끄러질 때
      V.sprT -= dt;
      if (PB && V.sprT <= 0) {
        if (inward && v > 7.5) {
          V.sprT = me ? 0.05 : 0.14;
          const bx = lx - Math.cos(ar) * T.z * 0.7; const by = ly - Math.sin(ar) * T.z * 0.7;
          PB.burst('ice', bx + w.ox * T.z * 0.3, by + w.oy * T.z * 0.3, me ? 2 : 1, { dir: Math.atan2(w.oy, w.ox) + 0.5, spread: 1.0, sp: 60 + v * 6, k: me ? 1 : 0.8 });
          if (me && v > 10.2 && PF) PF.burst('spark', lx - w.ox * T.z * 0.75, ly - w.oy * T.z * 0.75, 1, { dir: (w.ang + 180) * Math.PI / 180, spread: 0.9, sp: 120 });
        } else if (falling && ft < F_SLIDE) {
          V.sprT = 0.04;
          PB.burst('ice', lx, ly, 2, { sp: 80, k: 1.1 });
        }
      }
      // AI·다른 선수가 펭귄 옆을 지나가면 펭귄이 움찔
      if (!me) PENS.forEach((q) => { if (V.lastS < q && s >= q && state !== 2) pg.duckT = e; });
      V.lastS = s;
    }
    const nearPeng = (s) => PENS.some((q) => Math.abs(s - q) < 3);
    function pengHit(e, p) { pg.hitT = e; pg.hitDir = Math.random() < 0.5 ? -1 : 1; if (p.me && ctx.sfx.boing) setTimeout(() => ctx.sfx.boing(), 80); }
    // 펭귄: 뒤뚱뒤뚱 · 부딪히면 컬링 돌처럼 빙글빙글 미끄러졌다가 다시 뒤뚱뒤뚱 돌아와요
    function drawPeng(e) {
      const ph = PENS[0];
      const sg = seg(ph);
      const lat = Math.sin(e / 1300) * 1.3;          // 레인을 가로질러 왔다 갔다
      let [x, y] = scr(sg.x, sg.y + (sg.y > 0 ? lat : -lat));
      const ht = (e - pg.hitT) / 1000;
      let rot = Math.sin(e / 110) * 9; let sy = 1; let sx = 1;
      if (ht >= 0 && ht < 2.6) {
        const go = ht < 1.2 ? O.ease(ht / 1.2) : 1 - O.ease((ht - 1.2) / 1.4);
        x += Math.sin(sg.a) * go * 5 * k + pg.hitDir * go * 1.2 * k;   // 달리는 쪽으로 쭉 미끄러져요
        y += -Math.cos(sg.a) * go * 5 * k;
        if (ht < 1.2) { rot = ht * 900; sy = 0.75; sx = 1.15; } else rot = Math.sin(e / 70) * 14;
      }
      const dk = (e - pg.duckT) / 1000;
      if (dk >= 0 && dk < 0.35) { sy = 0.7; sx = 1.2; }
      const sc = (k / 9.2) * 1.05;
      peng.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(3)})`);
      peng.pg.setAttribute('transform', `rotate(${rot.toFixed(0)}) scale(${sx} ${sy})`);
      peng.bub.setAttribute('display', (dk >= 0 && dk < 0.5) || (e - pg.dodgeT >= 0 && e - pg.dodgeT < 600) ? 'inline' : 'none');
    }
    return {
      start() {},
      tick(t) {
        const e = t - ctx.startAt;
        const dt = Math.min(0.05, Math.max(0, (t - (lastT || t)) / 1000));
        lastT = t;
        const kk = e < gun - 1100 ? 0 : e < gun ? 1 : 2;
        if (kk !== stage) { stage = kk; if (kk === 0) say('제자리에…', '#fff', 0); if (kk === 1) say('차렷!', '#FFE27A', 0); if (kk === 2) { say('탕!', '#FF8B95', 700); ctx.sfx.go(); ctx.vibrate(60); } }
        const dodge0 = st.dodge;
        simTo(e);
        if (st.dodge !== dodge0) { pg.dodgeT = e; pg.duckT = e; if (camC) camC.punch(0.05); }
        meter.set(st.mash.rate(e));
        const sg = seg(st.x);
        const pAhead = st.state !== 2 && st.pens[st.pi] != null ? st.pens[st.pi] - st.x : 99;
        const pWarn = pAhead > 0 && pAhead < 9;
        tipSt.textContent = st.state === 2 ? '꽈당…' : pWarn ? (pAhead < PENG_WIN ? '지금! 초록 톡!' : '펭귄! 초록 준비') : sg.curve ? (st.lean ? '기울이는 중 ✓' : '곡선! 초록 꾹!') : curveAhead(st.x, 6) ? '곧 곡선 · 초록 준비' : (st.lean ? '직선 · 초록 떼요!' : '직선 · 연타!');
        tip.className = 'osh-tip ' + (pWarn ? 'warn' : sg.curve ? (st.lean ? 'ok' : 'warn') : st.lean ? 'warn' : '');
        if (pWarn && pengWarn !== st.pi) { pengWarn = st.pi; say('펭귄이다!', '#FFE27A', 900); }
        const lap = Math.min(LAPS, Math.floor(st.x / LAP) + 1);
        tipLap.textContent = `${lap}/${LAPS}바퀴`;
        if (lap !== lastLap) { lastLap = lap; if (lap === LAPS && !st.fin) { say('마지막 바퀴!', '#FFD23F', 1000); if (ctx.sfx.lamp) ctx.sfx.lamp(); } }
        tipV.textContent = Math.round(st.v * 3.6);
        board.textContent = e < gun ? '0.00' : st.fin ? (st.fin / 1000).toFixed(2) : ((e - gun) / 1000).toFixed(2);
        const live = ctx.live();
        let rank = 1;
        list.forEach((p) => {
          const T = tokens[p.pid];
          if (!T) return;
          if (p.me) { place(p, T, st.x, st.v, st.lean, st.fin ? 3 : st.state, e, dt, true); strip.set(p.pid, st.x / D); return; }
          const a = live[p.pid];
          const target = a ? a[1] || 0 : 0;
          const ex = (a && a[2]) || [];
          shown[p.pid] = shown[p.pid] == null ? target : shown[p.pid] + (target - shown[p.pid]) * (p.bot ? 1 : Math.min(1, dt * 6));
          place(p, T, shown[p.pid], ex[0] || 0, ex[2] === 1, ex[1] || 0, e, dt, false);
          strip.set(p.pid, shown[p.pid] / D);
          const sc = a ? a[0] || 0 : 0;
          if (st.fin ? sc >= 50000 && sc > 100000 - st.fin : (sc >= 50000 || target > st.x)) rank++;
        });
        drawPeng(e);
        if (PB) PB.tick(dt);
        if (PF) PF.tick(dt);
        if (camC) camC.tick(dt);
        if (e > gun) ctx.setBadge(`${rank}위`, rank === 1 ? 'y' : 'b');
        ctx.setScore(st.fin ? Math.round(st.fin / 10) / 100 : Math.floor(st.x));
        if (st.fin && !finSaid) {
          finSaid = true;
          say(`골인! ${(st.fin / 1000).toFixed(2)}초`, '#FFD23F', 2400); ctx.sfx.perfect(); ctx.vibrate([30, 40, 90]);
          // 결승선에서 꽃가루 · 함성 · 개인 신기록
          const [fx, fy] = scr(-S / 2, R);
          if (PF) PF.burst('confetti', fx, fy, 22, { sp: 230 });
          if (ctx.sfx.roar) ctx.sfx.roar(rank === 1 ? 1 : 0.7);
          ctx.fx.flash('rgba(255,255,255,.5)');
          if (FX) {
            const pr = FX.pb('wshort', 100000 - st.fin);
            if (pr.pb) setTimeout(() => FX.celebrate(ctx, true, '개인 신기록!'), 600);
            else if (rank === 1) setTimeout(() => FX.celebrate(ctx, false), 500);
          }
        }
      },
      onPress(c, t) { const e = t - ctx.startAt; simTo(e); log.push([Math.round(e), c]); react(sim.press(st, c, e, gun)); },
      onRelease(c, t) { const e = t - ctx.startAt; simTo(e); log.push([Math.round(e), c.toUpperCase()]); sim.release(st, c); },
      end() { if (ro) ro.disconnect(); clearTimeout(msgT); },
      done: () => !!st.fin && st.e - gun - st.fin > 1500,
      score: () => (st.fin ? 100000 - st.fin : Math.round(st.x * 100)),
      value: () => Math.round(st.x * 100) / 100,
      extra: () => [Math.round(st.v * 100) / 100, st.fin ? 3 : st.state, st.lean ? 1 : 0, st.fallKind || 0],
      log: () => log,
      _st: () => st,
      _peng: () => PENS,
      summary: () => (st.fin ? `${(st.fin / 1000).toFixed(2)}초${st.falls ? ` (꽈당 ${st.falls}번)` : ''}` : `${Math.floor(st.x)}m`)
    };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#F4FAFF"/><rect x="5" y="10" width="30" height="20" rx="10" fill="none" stroke="#7FB8E0" stroke-width="3"/><circle cx="30" cy="14" r="3.5" fill="#FF4757"/><circle cx="12" cy="27" r="3.5" fill="#3D7BFF"/><path d="M20 10 V7" stroke="#E0435A" stroke-width="2"/></svg>';

  O.register({
    id: 'wshort',
    title: '쇼트트랙',
    cat: '동계 · 빙상',
    catColor: 'r',
    how: '직선 연타 · 곡선에선 초록 꾹 · 펭귄 조심',
    icon: ICON,
    buttons: ['r', 'g', 'b'], noGo: true, pressSound: false,
    rules: ['직선에서는 빨·파 아무거나 연타해서 빨라져요', '곡선에서는 초록을 꾹! 몸을 기울여야 빨리 돌 수 있어요', '안 기울이고 너무 빠르면 꽈당 · 직선에선 초록을 떼요 · 3바퀴', '뒤쪽 직선에 펭귄이 뒤뚱뒤뚱! 바로 앞에서 초록을 톡 누르면 휙 피해요'],
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
