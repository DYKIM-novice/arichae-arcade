/* 아리채 오락실 · 회귀 RPG 1인칭 색 패링 「패링 손맛」 단독 데모 (static/rpg-demo.html)
   - 규칙은 진짜 게임의 data.js + sim.js 를 그대로 써요 → 판정 폭·고리 시간·색 보임 시간이 게임과 똑같아요
     · 데모 층에서 하는 일은 딱 세 가지예요 (규칙 숫자는 하나도 안 바꿔요)
       1) 시뮬레이션 시간을 늦추거나 잠깐 붙잡기 (세상 멈춤 · 컷인 슬로 · 첫 패링 안내)
       2) 용사 체력이 줄면 다시 채우기 (데모라서 죽지 않아요) · 보스 체력도 다시 채워서 끝없이 싸워요
       3) sim 이 내보낸 일(W.ev)을 읽어 효과를 그리기
   - 패링 임팩트 장치 9가지 (docs/handoff/specs/rpg_story.md 1절)
       1 세상 멈춤(비·물보라·꽃잎이 허공에 멈추고 황금빛) · 2 소리 빼기(폭풍 소리 뚝 → 칭 → 쿵) · 3 진동
       4 카메라(펀치 줌·흰 번쩍임 1프레임·반전 1프레임·기울기·흔들림 상한) · 5 적 반응(촉수 튕김·휘청·불꽃·피해 숫자·슬로 컷인)
       6 연속 패링(x2·x3 커지고 칭 반음씩 올라감 · 3번째 강반격) · 7 첫 패링은 반드시 성공(멈추고 "지금! ●초록")
       8 오늘의 패링 리플레이(0.3배 · 레터박스) · 9 실패 알림(빨라요/늦어요/색이 달라요 · 맞으면 붉은 테두리·작은 흔들림)
   - 그림은 ART 한 곳에서 바꿔요. 그림 파일이 없거나 못 읽으면 캔버스로 그린 임시 그림(폭풍 문어)을 써요
   - 테스트용 손잡이: window.__demo (자동 플레이어·스크린샷이 씀) */
(function () {
  'use strict';

  const S = window.RpgSim;
  const D = window.RpgData;
  const HD = D.hero;
  const DT = S.DT;

  /* ================================================================
     그림 설정 — 레오나르도 PNG 로 바꿀 때 여기 경로만 채우면 돼요 (빈 칸 = 캔버스 임시 그림)
     - 페이지보다 먼저 window.RPG_DEMO_ART = { boss: { idle: '...' } } 처럼 넣어도 덮어써요
     ================================================================ */
  const ART = {
    boss: { idle: '', wind: '', attack: '', stagger: '', hurt: '' },   // 폭풍 문어 정면 (투명 배경 PNG)
    bg: '../art_tests/style/A_storybook_0.jpg',                        // 폭풍 바다 배경 (세로, 불투명) — 저장소 루트에서 서버를 띄워야 보여요
    bossInBg: true,                                                    // 배경 그림 안에 문어가 들어 있으면 true → 캔버스 문어·촉수를 안 그려요
    cutin: ''                                                          // 패링 컷인 그림 (투명 배경 PNG, 가로로 긴 그림)
  };
  if (window.RPG_DEMO_ART) {
    const o = window.RPG_DEMO_ART;
    if (o.boss) Object.assign(ART.boss, o.boss);
    if (o.bg != null) ART.bg = o.bg;
    if (o.cutin != null) ART.cutin = o.cutin;
  }

  /* 손맛 조절판 기본값 (이 폰에 저장돼요) */
  const TUNE_DEF = { freeze: 300, gold: 0.6, zoom: 0.12, shake: 14, vol: 0.8, flash: true };
  const TUNE = Object.assign({}, TUNE_DEF);
  try { Object.assign(TUNE, JSON.parse(localStorage.getItem('rpgDemoTune') || '{}')); } catch (e) { /* 저장 못 해도 괜찮아요 */ }

  const COL = {
    r: { hex: '#ff4d5e', lite: '#ffb0b8', name: '빨강', glyph: '▲' },
    g: { hex: '#2fd27a', lite: '#a6f7c8', name: '초록', glyph: '●' },
    b: { hex: '#3d8bff', lite: '#b0d0ff', name: '파랑', glyph: '■' }
  };
  const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const RSPD = 0.3;              // 리플레이 속도
  const TUT_LEAD = 40;           // 첫 패링 안내: 닿기 40ms 전에 멈춰요 (판정 폭 앞 138ms 안)
  const HP_FLOOR = 50;           // 데모: 체력이 이 아래로 내려가면 다시 채워요 (가장 센 한 방 48)
  const EHP_FLOOR = 0.6;         // 데모: 보스 체력이 60% 아래면 다시 채워요 (분노 50% 전에)

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
  const easeOutBack = (k) => { const c1 = 1.9; const c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

  /* ---------------- 화면 요소 ---------------- */
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  const panel = $('panel');
  const btnEls = {};
  document.querySelectorAll('.btn').forEach((b) => { btnEls[b.dataset.c] = b; });

  /* ================================================================
     그림 불러오기 (작은 틀) — Art.boss(자세) 가 그림을 주면 그림으로, 없으면 null → 캔버스 임시 그림
     ================================================================ */
  const Art = {
    img: {},
    load() {
      const want = [['bg', ART.bg], ['cutin', ART.cutin]];
      Object.keys(ART.boss).forEach((k) => want.push(['boss.' + k, ART.boss[k]]));
      want.forEach(([key, src]) => {
        if (!src) return;
        const im = new Image();
        im.onload = () => { Art.img[key] = im; };
        im.onerror = () => { console.warn('[demo] 그림을 못 읽었어요 → 임시 그림을 써요:', src); };
        im.src = src;
      });
    },
    get(key) { return this.img[key] || null; },
    // 자세 그림이 없으면 대기 그림, 그것도 없으면 null
    boss(pose) { return this.img['boss.' + pose] || this.img['boss.idle'] || null; }
  };
  Art.load();

  /* ================================================================
     규칙(sim) — 혼자 모드 · 보스 하나와 끝없이
     ================================================================ */
  let W = null;
  let hero = null;
  function newWorld() {
    hero = S.makeHero({ id: 'me', name: '선장', kind: 'me' });
    W = S.makeWorld({ seed: (Date.now() % 100000) + 7, heroes: [hero] });
    // 방 계획만 '보스'로 바꿔요 (보스는 방 깊이에 따른 강해짐이 없어서 숫자는 그대로예요)
    W.room = S.LAST_ROOM;
    W.plan = D.rooms.map(() => ['boss']);
  }
  newWorld();

  /* ---------------- 상태 ---------------- */
  let started = false;
  let mode = 'live';            // live · replay
  let clock = 0;                // 실제 흐른 시간(ms) — 디버그 멈춤 동안은 안 흘러요
  let simAcc = 0;
  let view = null;              // 그리기에 쓰는 한 장면 (live: sim 에서 · replay: 녹화에서)
  let chain = 0;                // 연속 패링 (데모 표시용 — 강반격 뒤에도 계속 올라가요)
  let tut = null;               // 첫 패링 안내 { a, ti, c, held, done }
  let tutDone = false;
  const L = {};                 // 화면 배치
  let dpr = 1;

  /* 효과 상태 */
  const fx = {
    wt: 0,                      // 세상 시각 (멈춤 동안 안 흘러요)
    freeze: 0, freezeMax: 0, rush: 0, gold: 0, goldK: 1,
    flashF: 0, zoom: 0, tilt: 0, trauma: 0, hurtV: 0, redF: 0,
    knock: 0, knockV: 0, knockDir: 1, eFlash: 0, squash: 0,
    cut: null, cutPending: null, slashBig: 0,
    wind: -240, bolt: null, nextBolt: 4000, skyFlash: 0,
    sparks: [], waves: [], slashes: [], nums: [], pops: []
  };
  const P = { rain: [], spray: [], petals: [] };
  const CAP = { spark: 140, num: 24, pop: 8, wave: 10, slash: 12, spray: 46, petal: 14 };

  /* ================================================================
     화면 배치 (세로 폰 · DPR 2 상한)
     ================================================================ */
  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    L.w = w; L.h = h;
    L.playH = Math.max(h * 0.5, panel.getBoundingClientRect().top);
    L.cx = w / 2;
    L.S = Math.min(w * 0.98, L.playH * 0.64);
    L.ey = L.playH * 0.30;
    L.horizon = L.ey - L.S * 0.02;
    L.water = L.ey + L.S * 0.2;
    L.jy = L.playH * 0.78;
    L.rj = clamp(Math.min(w, L.playH) * 0.115, 34, 70);
    L.r0 = L.rj * 3.3;
    // 하늘·바다 그라디언트는 한 번만 만들어 둬요
    L.skyG = ctx.createLinearGradient(0, 0, 0, L.horizon);
    L.skyG.addColorStop(0, '#070b18'); L.skyG.addColorStop(0.55, '#141d36'); L.skyG.addColorStop(1, '#2a3550');
    L.seaG = ctx.createLinearGradient(0, L.horizon, 0, h);
    L.seaG.addColorStop(0, '#22344c'); L.seaG.addColorStop(0.25, '#132235'); L.seaG.addColorStop(1, '#050a12');
    L.frontG = ctx.createLinearGradient(0, L.water - 10, 0, h);
    L.frontG.addColorStop(0, 'rgba(24,46,68,.97)'); L.frontG.addColorStop(0.4, 'rgba(10,22,36,.98)'); L.frontG.addColorStop(1, '#03070d');
    buildClouds();
    // 빗줄기 개수는 화면 넓이에 맞춰요 (중간급 폰 상한 150)
    const rainN = clamp(Math.round((w * h) / 2300), 60, 150);
    while (P.rain.length < rainN) P.rain.push(newDrop(true));
    P.rain.length = rainN;
    while (P.petals.length < CAP.petal) P.petals.push(newPetal(true));
  }
  let clouds = null;
  function buildClouds() {
    const cw = Math.ceil(L.w * 1.6);
    const ch = Math.ceil(L.horizon + 30);
    clouds = document.createElement('canvas');
    clouds.width = Math.ceil(cw * dpr * 0.5); clouds.height = Math.ceil(ch * dpr * 0.5);   // 반 해상도면 충분해요 (흐릿한 구름)
    clouds.cw = cw; clouds.ch = ch;
    const c = clouds.getContext('2d');
    c.scale(dpr * 0.5, dpr * 0.5);
    let seed = 11;
    const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 34; i++) {
      const x = R() * cw; const y = R() * ch * 0.85; const r = 40 + R() * 110;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const dark = R() < 0.6;
      g.addColorStop(0, dark ? 'rgba(10,12,22,.75)' : 'rgba(70,86,120,.35)');
      g.addColorStop(1, 'rgba(10,12,22,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2); c.fill();
      // 이어 붙일 때 이음매가 안 보이게 양쪽에 한 번 더
      if (x < r * 1.6) { c.save(); c.translate(cw, 0); c.beginPath(); c.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
      if (x > cw - r * 1.6) { c.save(); c.translate(-cw, 0); c.beginPath(); c.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    }
  }

  /* ================================================================
     폭풍 조각 (비 · 물보라 · 꽃잎) — 세상 시각(wdt)으로 움직여서 멈춤 때 허공에 멈춰요
     ================================================================ */
  function newDrop(any) {
    return { x: rnd(-40, L.w + 320), y: any ? rnd(-40, L.h) : rnd(-80, -10), vy: rnd(950, 1400), len: rnd(14, 28), a: rnd(0.25, 0.6) };
  }
  function newPetal(any) {
    return { x: rnd(0, L.w + 100), y: any ? rnd(0, L.playH) : rnd(-30, L.playH * 0.7), vy: rnd(20, 70), rot: rnd(0, 6.28), vr: rnd(-4, 4), s: rnd(4, 7.5), ph: rnd(0, 6.28), c: Math.random() < 0.6 ? '#ffd86b' : '#ffb7c9', x0: 0 };
  }
  function waveY(x, T) { return L.water + Math.sin(x * 0.024 + T * 0.0017) * 5 + Math.sin(x * 0.061 - T * 0.0026) * 3; }
  function updateStorm(wdt) {
    const s = wdt / 1000;
    const T = fx.wt;
    fx.wind = -230 - 150 * Math.sin(T * 0.00042) - 70 * Math.sin(T * 0.0013);
    for (const d of P.rain) {
      d.y += d.vy * s; d.x += fx.wind * s;
      if (d.y > L.h + 30 || d.x < -60) Object.assign(d, newDrop(false));
    }
    // 물보라: 파도 끝에서 튀어 올라요
    let want = 26 * s;
    while (want > 0 && P.spray.length < CAP.spray) {
      if (Math.random() < want) {
        const x = rnd(-20, L.w + 20);
        P.spray.push({ x, y: waveY(x, T), vx: fx.wind * 0.35 + rnd(-40, 40), vy: -rnd(140, 330), r: rnd(2, 5.5), life: 0, max: rnd(0.7, 1.2) });
      }
      want -= 1;
    }
    for (let i = P.spray.length - 1; i >= 0; i--) {
      const p = P.spray[i];
      p.life += s; p.vy += 520 * s; p.x += p.vx * s; p.y += p.vy * s;
      if (p.life >= p.max) P.spray.splice(i, 1);
    }
    for (const p of P.petals) {
      p.ph += s * 3;
      p.x += (fx.wind * 0.55 + Math.sin(p.ph) * 40) * s;
      p.y += (p.vy + Math.cos(p.ph * 0.7) * 30) * s;
      p.rot += p.vr * s;
      if (p.x < -30 || p.y > L.playH + 40) Object.assign(p, newPetal(false), { x: L.w + rnd(10, 120) });
    }
  }
  function sprayBurst(x, y, n, up) {
    for (let i = 0; i < n && P.spray.length < CAP.spray + 20; i++) {
      P.spray.push({ x: x + rnd(-40, 40), y, vx: rnd(-160, 160), vy: -rnd(200, up || 520), r: rnd(2.5, 6), life: 0, max: rnd(0.6, 1.1) });
    }
  }

  /* ================================================================
     소리 (WebAudio · 파일 없이 만들어요) — 첫 터치에 켜져요
     ================================================================ */
  const AU = { ctx: null };
  function audioInit() {
    if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let c;
    try { c = new AC(); } catch (e) { return; }
    AU.ctx = c;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(c.destination);
    AU.master = c.createGain(); AU.master.gain.value = TUNE.vol; AU.master.connect(comp);
    AU.amb = c.createGain(); AU.amb.gain.value = 0; AU.amb.connect(AU.master);
    AU.sfx = c.createGain(); AU.sfx.gain.value = 1; AU.sfx.connect(AU.master);
    // 흰 소음 · 갈색 소음 (3초, 반복)
    const n = Math.floor(c.sampleRate * 3);
    AU.white = c.createBuffer(1, n, c.sampleRate);
    AU.brown = c.createBuffer(1, n, c.sampleRate);
    const wd = AU.white.getChannelData(0); const bd = AU.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; wd[i] = r; last = (last + 0.02 * r) / 1.02; bd[i] = last * 3.5; }
    const loop = (buf, off) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, off || 0); return s; };
    // 바람: 띠 거르개 + 천천히 흔들리는 주파수·크기
    const wsrc = loop(AU.white, 0);
    const wbp = c.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 480; wbp.Q.value = 0.9;
    const wg = c.createGain(); wg.gain.value = 0.42;
    wsrc.connect(wbp); wbp.connect(wg); wg.connect(AU.amb);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(wbp.frequency); lfo.start();
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.23; const lg2 = c.createGain(); lg2.gain.value = 0.22; lfo2.connect(lg2); lg2.connect(wg.gain); lfo2.start();
    // 빗소리: 높은 쉬익 + 가운데 톡톡
    const rsrc = loop(AU.white, 1.3);
    const rhp = c.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 3200;
    const rg = c.createGain(); rg.gain.value = 0.11;
    rsrc.connect(rhp); rhp.connect(rg); rg.connect(AU.amb);
    const r2 = loop(AU.white, 2.1);
    const rbp = c.createBiquadFilter(); rbp.type = 'bandpass'; rbp.frequency.value = 1300; rbp.Q.value = 0.6;
    const rg2 = c.createGain(); rg2.gain.value = 0.07;
    r2.connect(rbp); rbp.connect(rg2); rg2.connect(AU.amb);
    // 바다 울림 (낮은 소리)
    const bsrc = loop(AU.brown, 0.4);
    const blp = c.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.value = 170;
    const bg = c.createGain(); bg.gain.value = 0.6;
    bsrc.connect(blp); blp.connect(bg); bg.connect(AU.amb);
    const t = c.currentTime;
    AU.amb.gain.setValueAtTime(0, t); AU.amb.gain.linearRampToValueAtTime(1, t + 1.6);
  }
  function now() { return AU.ctx.currentTime + 0.004; }
  function envGain(t0, a, peak, dec, dest) {
    const g = AU.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
    g.connect(dest || AU.sfx);
    return g;
  }
  function tone(type, f0, f1, t0, a, peak, dec, dest) {
    const o = AU.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + a + dec * 0.8);
    o.connect(envGain(t0, a, peak, dec, dest));
    o.start(t0); o.stop(t0 + a + dec + 0.05);
  }
  function noise(t0, a, peak, dec, ftype, f0, f1, q, buf) {
    const s = AU.ctx.createBufferSource(); s.buffer = buf || AU.white;
    const f = AU.ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t0); f.Q.value = q || 0.8;
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + a + dec);
    s.connect(f); f.connect(envGain(t0, a, peak, dec));
    s.start(t0, Math.random() * 2); s.stop(t0 + a + dec + 0.05);
  }
  // "칭" — 쇳소리 (어울리지 않는 배음 여러 개) · semi 반음 올림 · big 강반격 · sl 리플레이 늘림
  function sndChing(semi, big, sl) {
    if (!AU.ctx) return;
    const t = now(); const k = sl || 1;
    const f0 = 1480 * Math.pow(2, semi / 12) * (k > 1 ? 0.6 : 1);
    const parts = [[1, 0.42, 1.1], [2.01, 0.2, 0.7], [2.76, 0.24, 0.55], [4.07, 0.11, 0.35], [5.43, 0.08, 0.24], [6.79, 0.05, 0.16]];
    parts.forEach(([r, a, d]) => tone('sine', f0 * r, 0, t, 0.002, a * (big ? 1.15 : 1), d * k * (big ? 1.6 : 1)));
    tone('sine', f0 * 1.007, 0, t, 0.002, 0.2, 0.9 * k);
    noise(t, 0.001, 0.55, 0.035 * k, 'highpass', 5200);
    if (big) {
      tone('sine', f0 * 1.5, 0, t + 0.02, 0.003, 0.22, 1.4 * k);
      tone('triangle', f0 * 0.5, 0, t + 0.01, 0.003, 0.18, 1.2 * k);
      tone('sine', f0 * 2.0, 0, t + 0.05, 0.003, 0.12, 1.6 * k);
    }
  }
  // "쿵" — 낮게 떨어지는 소리 + 묵직한 소음
  function sndKung(big, sl) {
    if (!AU.ctx) return;
    const t = now(); const k = sl || 1; const p = k > 1 ? 0.7 : 1;
    tone('sine', 150 * p, 38 * p, t, 0.004, 0.95, 0.55 * k * (big ? 1.5 : 1));
    tone('triangle', 75 * p, 32 * p, t, 0.004, 0.35, 0.4 * k);
    noise(t, 0.003, 0.55, 0.22 * k, 'lowpass', 420, 120);
    if (big) { tone('sine', 55 * p, 24 * p, t + 0.02, 0.01, 0.7, 1.1 * k); noise(t, 0.004, 0.4, 0.7 * k, 'lowpass', 1100, 140, 0.6, AU.brown); }
  }
  function sndHurt() {
    if (!AU.ctx) return;
    const t = now();
    noise(t, 0.002, 0.65, 0.22, 'lowpass', 900, 200);
    tone('square', 110, 52, t, 0.003, 0.09, 0.22);
    tone('sine', 90, 40, t, 0.003, 0.5, 0.3);
  }
  function sndFail() { if (!AU.ctx) return; const t = now(); tone('triangle', 340, 210, t, 0.004, 0.22, 0.16); }
  function sndTick(big) {
    if (!AU.ctx) return;
    const t = now();
    noise(t, 0.001, big ? 0.3 : 0.16, big ? 0.07 : 0.045, 'bandpass', big ? 1800 : 2600, 0, 1.2);
    if (big) tone('sine', 230, 90, t, 0.002, 0.28, 0.12);
  }
  function sndWhoosh() { if (!AU.ctx) return; const t = now(); noise(t, 0.25, 0.1, 0.45, 'bandpass', 280, 1300, 1.4); }
  function sndThunder(delay) {
    if (!AU.ctx) return;
    const t = now() + delay;
    noise(t, 0.06, 0.6, 2.6, 'lowpass', 300, 70, 0.5, AU.brown);
    noise(t, 0.01, 0.25, 0.5, 'lowpass', 1500, 200, 0.5);
  }
  function sndTutHold() { if (!AU.ctx) return; const t = now(); tone('sine', 520, 780, t, 0.02, 0.12, 0.5); tone('sine', 1040, 1560, t, 0.02, 0.05, 0.5); }
  // 소리 빼기: 폭풍 소리를 거의 0으로 → hold 초 뒤 천천히 돌아와요
  function duck(hold, deep) {
    if (!AU.ctx) return;
    const g = AU.amb.gain; const t = AU.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(deep ? 0.008 : 0.025, t + 0.02);
    g.setValueAtTime(deep ? 0.008 : 0.025, t + 0.02 + hold);
    g.linearRampToValueAtTime(1, t + 0.02 + hold + (deep ? 1.1 : 0.75));
  }
  function ambTo(v, sec) {
    if (!AU.ctx) return;
    const g = AU.amb.gain; const t = AU.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + (sec || 0.3));
  }
  function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 진동이 없는 기기 */ } }

  /* ================================================================
     입력 (버튼 3개 · 키보드 a/s/d)
     ================================================================ */
  function onPress(c) {
    audioInit();
    if (!started) { begin(); return; }
    if (mode === 'replay') { stopReplay(); return; }
    if (tut && !tut.done) {
      // 첫 공격: 멈추기 전에는 누름을 받지 않아요 (반드시 성공하게) · 멈춘 뒤에는 그 색만 받아요
      if (tut.held) {
        if (c === tut.c) {
          tut.done = true; tut.held = false; tutDone = true;
          setTutBtn(null);
          S.press(W, hero, c, W.t);
          drain();
        } else { tut.wrong = 1; sndFail(); }
      }
      return;
    }
    S.press(W, hero, c, W.t);
    drain();
  }
  function onRelease(c) { if (W && hero) S.release(W, hero, c); }
  Object.keys(btnEls).forEach((c) => {
    const b = btnEls[c];
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (er) { /* 괜찮아요 */ } onPress(c); });
    const up = () => { b.classList.remove('down'); onRelease(c); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  const KEY = { a: 'r', s: 'g', d: 'b' };
  window.addEventListener('keydown', (e) => {
    const c = KEY[(e.key || '').toLowerCase()];
    if (!c) { if (!started && (e.key === ' ' || e.key === 'Enter')) { audioInit(); begin(); } return; }
    if (e.repeat) return;
    btnEls[c].classList.add('down');
    onPress(c);
  });
  window.addEventListener('keyup', (e) => {
    const c = KEY[(e.key || '').toLowerCase()];
    if (!c) return;
    btnEls[c].classList.remove('down');
    onRelease(c);
  });
  $('start').addEventListener('pointerdown', (e) => { e.preventDefault(); audioInit(); begin(); });
  cv.addEventListener('pointerdown', () => { audioInit(); if (mode === 'replay') stopReplay(); });
  $('replayBtn').addEventListener('click', () => { audioInit(); startReplay(); });

  function begin() {
    if (started) return;
    started = true;
    $('start').style.display = 'none';
    fxEmit('start');
  }

  /* ================================================================
     한 프레임: sim 진행 (live)
     ================================================================ */
  // 지금 sim 을 얼마나 빨리 돌릴지 (세상 멈춤 0.05배 · 컷인 슬로 0.3배)
  function simScale() {
    if (fx.freeze > 0) return 0.05;
    if (fx.cut) return 0.3;
    return 1;
  }
  function updateLive(dt) {
    if (started && !(tut && tut.held)) {
      simAcc += dt * simScale();
      let n = 0;
      while (simAcc >= DT && n < 40) {
        if (tut && !tut.done && !tut.held && W.t + DT >= tut.ti - TUT_LEAD) {
          tut.held = true; simAcc = 0;
          setTutBtn(tut.c); sndTutHold(); fxEmit('tutHold');
          break;
        }
        S.step(W, DT); simAcc -= DT; n++;
        guard();
        drain();
      }
      if (n >= 40) simAcc = 0;
    }
    view = snap();
    record(view);
    if (best.pending && clock >= best.pending.rt + best.pending.post) captureClip();
  }
  // 데모 층: 죽지 않게 · 끝나지 않게 (규칙 숫자는 그대로)
  function guard() {
    if (hero.hp < HP_FLOOR && !hero.down) {
      hero.hp = hero.st.maxHp;
      const f = $('hpFill'); f.classList.remove('refill'); void f.offsetWidth; f.classList.add('refill');
    }
    const E = W.enemy;
    if (E && !E.dead && E.hp < E.max * EHP_FLOOR) E.hp = E.max;
  }
  // sim 이 내보낸 일 → 효과 · 녹화
  function drain() {
    if (!W.ev.length) return;
    const list = W.ev.splice(0, W.ev.length);
    for (const e of list) {
      const c = Object.assign({}, e);
      if (e.k === 'parry') {
        const a = W.atks.find((x) => x.id === e.a);
        c.n = a ? a.n : 1;
        c.tut = !!(tutDone && tut && tut.a === e.a && e.i === 0 && !tut.fired);
        if (c.tut) tut.fired = true;
      }
      handleEvent(c, false);
      if (e.k === 'parry') c.chain = chain;
      rec.evs.push({ rt: clock, e: c });
    }
  }
  // 그리기용 한 장면 (작은 값만 → 리플레이 녹화에도 그대로 써요)
  function snap() {
    const t = W.t;
    const E = W.enemy;
    const hits = [];
    for (const a of W.atks) {
      if (a.broken) continue;
      const hx = S.hitsOf(a);
      for (let i = 0; i < hx.length; i++) {
        const x = hx[i];
        if (t < x.show || t > x.ti + 650) continue;
        const j = hero.jd[a.id + ':' + i];
        hits.push({ ti: x.ti, c: x.c, show: x.show, reveal: x.reveal, jr: j ? j.r : '', a: a.id, i, n: a.n });
      }
    }
    return {
      t, hits,
      stun: !!(E && E.stun > t), vuln: !!(E && E.vuln > t),
      ehp: E ? E.hp / E.max : 1, hp: hero.hp / hero.st.maxHp, gauge: hero.gauge / HD.gaugeMax,
      fight: W.phase === 'fight'
    };
  }

  /* ================================================================
     일 → 효과
     ================================================================ */
  function handleEvent(e, rp) {
    switch (e.k) {
      case 'tele':
        if (rp) break;
        sndWhoosh();
        if (!tutDone && !tut) {
          const a = W.atks.find((x) => x.id === e.a);
          if (a) { const x = S.hitsOf(a)[0]; tut = { a: a.id, ti: x.ti, c: x.c, held: false, done: false, wrong: 0 }; fxEmit('tutStart'); }
        }
        break;
      case 'judge': onJudge(e, rp); break;
      case 'parry': fxParry(e, rp); break;
      case 'hurt': fxHurt(e, rp); break;
      case 'hit': fxHit(e, rp); break;
      case 'break':
        addPop('끊었다!', '#ffe27a', 1.5, -70);
        burst(L.cx, L.ey, 50, ['#fff', '#ffd25a', '#ff9f43'], 900);
        fx.knockV += 9;
        break;
      case 'chance': addPop('지금이야!', '#ffe27a', 0.95, 52); break;
      case 'spec': addPop('필살!', '#7fe3ff', 1.4, -70); fx.trauma = Math.min(1, fx.trauma + 0.4); break;
      case 'gaugeFull': if (!rp) addPop('필살 준비 · 세 버튼 같이!', '#ffd25a', 0.7, 60); break;
      default: break;
    }
  }
  const FAIL_TXT = { early: ['빨라요!', '#ffb347'], late: ['늦어요!', '#7fc8ff'], color: ['색이 달라요!', '#ff7ae0'], miss: ['놓쳤어요!', '#c9d1e0'] };
  function onJudge(e, rp) {
    const f = FAIL_TXT[e.r];
    if (!f) return;
    if (e.r === 'late') fx.pops = fx.pops.filter((p) => p.txt !== FAIL_TXT.miss[0]);     // 놓침 → 늦음 으로 바꿔 보여요
    addPop(f[0], f[1], 1.25, 0, true);
    if (!rp) { chain = 0; updateStreak(); }
    if (e.r === 'early' || e.r === 'color') sndFail();
    fxEmit('fail');
  }
  function fxParry(e, rp) {
    const strong = !!e.strong;
    const cut = strong || (e.final && (e.n || 1) > 1) || e.tut;
    if (!rp) { chain++; updateStreak(); }
    const ch = rp ? (e.chain || 1) : chain;
    const sl = rp ? 1 / RSPD : 1;
    const fz = TUNE.freeze * (strong ? 1.4 : 1);
    // 1 세상 멈춤 · 황금빛
    fx.freeze = fz; fx.freezeMax = fz; fx.gold = 1; fx.goldK = strong ? 1.25 : 1;
    // 4 카메라: 흰 번쩍임 → 반전 프레임 · 펀치 줌 · 기울기 (흔들림은 '쿵'에서)
    fx.flashF = TUNE.flash ? 2 : 0;
    fx.zoom = TUNE.zoom * (strong ? 1.6 : 1);
    fx.tilt = (Math.random() < 0.5 ? -1 : 1) * (strong ? 0.055 : 0.032);
    fx.trauma = Math.min(1, fx.trauma + (strong ? 0.3 : 0.18));
    // 2 소리 빼기 · 6 칭 반음씩
    duck((fz / 1000) * sl, strong);
    sndChing(Math.min(12, ch - 1), strong, sl);
    // 3 진동
    if (!rp) vib(strong ? [80, 40, 180] : 38);
    // 5 불꽃 · 충격파 · 칼빛
    const col = COL[e.c] ? COL[e.c].hex : '#fff';
    burst(L.cx, L.jy, strong ? 80 : 46, ['#fff', '#ffe9a0', '#ffd25a', col], strong ? 1100 : 820);
    wave(L.cx, L.jy, L.rj * 0.9, L.rj * (strong ? 5 : 3.6), 420, '#fff6d0', strong ? 9 : 6);
    wave(L.cx, L.jy, L.rj * 0.7, L.rj * 2.6, 300, col, 4);
    fx.slashes.push({ x: L.cx, y: L.jy, a: rnd(-0.9, -0.5), len: L.w * (strong ? 1.25 : 0.95), w: strong ? 16 : 11, life: 0, max: 300, c: '#fff' });
    // 콤보 피해 배율 (규칙 계산이 준 값)
    const cmTxt = e.cm > 1 ? ' · 피해 ×' + e.cm.toFixed(2).replace(/0$/, '') : '';
    if (ch >= 2) addPop('x' + ch + cmTxt, '#ffd25a', 0.8 + Math.min(ch, 8) * 0.12, 0, false, L.rj + 46);
    fx.cutPending = cut ? { text: strong ? '강반격!' : '패링!', sub: strong ? '연속 ' + (e.streak || 3) + '번 · 반격 ×5' + cmTxt : (e.tut ? '첫 패링 성공!' : '폭풍이 멈췄다'), strong } : null;
    if (!rp) scoreBest(strong, cut, ch);
    fxEmit(strong ? 'strong' : 'parry');
    if (cut) fxEmit(strong ? 'cutStrong' : 'cutParry');
  }
  function fxHit(e, rp) {
    const k = e.kind;
    const sl = rp ? 1 / RSPD : 1;
    const x = L.cx + rnd(-0.14, 0.14) * L.S;
    const y = L.ey - L.S * rnd(0.02, 0.18);
    if (k === 'counter' || k === 'strong') {
      const big = k === 'strong';
      sndKung(big, sl);
      fx.knockV += big ? 12 : 7.5; fx.knockDir = Math.random() < 0.5 ? -1 : 1;
      fx.eFlash = 1;
      fx.trauma = Math.min(1, fx.trauma + (big ? 0.95 : 0.6));
      burst(x, y, big ? 40 : 24, ['#fff', '#ffd25a', '#9fe8ff'], big ? 800 : 600);
      wave(x, y, 10, L.S * (big ? 0.55 : 0.38), 360, '#ffe9a0', big ? 7 : 5);
      sprayBurst(L.cx, L.water, big ? 18 : 10);
      fx.slashes.push({ x, y, a: rnd(0.4, 0.8) * (Math.random() < 0.5 ? 1 : -1), len: L.S * (big ? 0.95 : 0.7), w: big ? 14 : 9, life: 0, max: 260, c: '#fff' });
      addNum(x, y, e.dmg, big ? '#ff6a3d' : '#ffd25a', big ? 58 : 44, big ? '강반격' : (e.crit ? '치명!' : '반격'));
      if (!rp && big) vib([30, 30, 60]);
    } else if (k === 'spec' || k === 'specEnd') {
      sndKung(k === 'specEnd', sl);
      fx.knockV += k === 'specEnd' ? 8 : 3; fx.eFlash = 0.8;
      burst(x, y, 20, ['#7fe3ff', '#fff'], 700);
      addNum(x, y, e.dmg, '#7fe3ff', k === 'specEnd' ? 50 : 34, '');
    } else {
      // 자동 공격 (작게)
      const big = k === 'c3';
      sndTick(big);
      fx.squash = big ? 0.9 : 0.5; fx.eFlash = Math.max(fx.eFlash, big ? 0.6 : 0.35);
      if (big) fx.trauma = Math.min(1, fx.trauma + 0.12);
      fx.slashes.push({ x, y, a: rnd(-1.2, 1.2), len: L.S * (big ? 0.42 : 0.28), w: big ? 6 : 4, life: 0, max: 180, c: '#eaf6ff' });
      burst(x, y, big ? 10 : 5, ['#fff', '#cfe8ff'], 420);
      addNum(x, y, e.dmg, '#ffffff', big ? 28 : 22, e.crit ? '치명!' : '');
    }
  }
  function fxHurt(e, rp) {
    fx.hurtV = 1; fx.redF = 1;
    fx.trauma = Math.min(1, fx.trauma + 0.7);
    fx.zoom = TUNE.zoom * 0.8;      // 촉수가 화면을 후려쳐서 확 밀려오는 느낌
    sndHurt();
    if (!rp) vib([60, 30, 90]);
    if (!rp) { chain = 0; updateStreak(); }
    addPop('-' + e.dmg, '#ff5a6a', 0.9, 0, false, 0, L.playH - 40);
    fxEmit('hurt');
  }

  /* 효과 조각 만들기 */
  function burst(x, y, n, cols, sp) {
    for (let i = 0; i < n; i++) {
      if (fx.sparks.length >= CAP.spark) fx.sparks.shift();
      const a = Math.random() * Math.PI * 2; const v = rnd(0.25, 1) * sp;
      fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(260, 620), c: cols[i % cols.length], w: rnd(1.6, 3.6) });
    }
  }
  function wave(x, y, r0, r1, max, c, w) {
    if (fx.waves.length >= CAP.wave) fx.waves.shift();
    fx.waves.push({ x, y, r0, r1, life: 0, max, c, w });
  }
  function addNum(x, y, v, c, size, sub) {
    if (fx.nums.length >= CAP.num) fx.nums.shift();
    fx.nums.push({ x, y, vy: -60, txt: String(v), c, size, sub, life: 0, max: 900 });
  }
  // 글자 알림 (화면 고정) — dy: 판정 원 위로 얼마나 · dx: 옆으로 · yAbs: 정해진 높이
  function addPop(txt, c, scale, dy, shake, dx, yAbs) {
    if (fx.pops.length >= CAP.pop) fx.pops.shift();
    fx.pops.push({ txt, c, s: scale || 1, dy: dy || 0, dx: dx || 0, yAbs: yAbs || 0, shake: !!shake, life: 0, max: 820 });
  }
  function updateStreak() {
    const el = $('streak'); const n = $('streakN');
    if (chain >= 2) {
      el.classList.add('on');
      n.textContent = 'x' + chain;
      n.style.fontSize = (30 + 6 * Math.min(chain, 8)) + 'px';
      if (n.animate) n.animate([{ transform: 'scale(1.7) rotate(-6deg)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,1.7,.4,1)' });
    } else el.classList.remove('on');
  }
  function setTutBtn(c) {
    Object.keys(btnEls).forEach((k) => {
      btnEls[k].classList.toggle('tut', k === c);
      btnEls[k].classList.toggle('dimmed', !!c && k !== c);
    });
  }

  /* ================================================================
     효과 한 걸음 — fdt: 효과 시각(리플레이 땐 0.3배) · wdt: 세상 시각(멈춤 땐 0)
     ================================================================ */
  function updateFx(fdt) {
    if (fx.freeze > 0) {
      fx.freeze -= fdt;
      if (fx.freeze <= 0) { fx.freeze = 0; fx.rush = 230; if (fx.cutPending) startCut(); }
    } else if (fx.cutPending) startCut();
    if (fx.freeze <= 0) fx.gold = Math.max(0, fx.gold - fdt / 200);
    const held = mode === 'live' && tut && tut.held;
    const ws = fx.freeze > 0 ? 0 : (fx.rush > 0 ? 2.1 : 1) * (fx.cut ? 0.35 : 1) * (held ? 0.18 : 1);
    fx.rush = Math.max(0, fx.rush - fdt);
    const wdt = fdt * ws;
    fx.wt += wdt;
    // 줌·기울기·흔들림은 세상 시각으로 줄어요 → 멈춤 동안 그 자리에 붙잡혀 있다가 풀려요
    fx.zoom *= Math.exp(-wdt / 170);
    fx.tilt *= Math.exp(-wdt / 210);
    fx.trauma = Math.max(0, fx.trauma - wdt * 0.0019);
    fx.hurtV = Math.max(0, fx.hurtV - fdt / 480);
    fx.redF = Math.max(0, fx.redF - fdt / 120);
    fx.eFlash = Math.max(0, fx.eFlash - wdt / 160);
    fx.squash = Math.max(0, fx.squash - wdt / 170);
    // 적이 튕겨 나가는 용수철 (작은 걸음으로)
    let rem = wdt / 1000;
    while (rem > 0) {
      const s = Math.min(rem, 0.008); rem -= s;
      const a = -150 * fx.knock - 12 * fx.knockV;
      fx.knockV += a * s; fx.knock += fx.knockV * s;
    }
    if (fx.cut) { fx.cut.t += fdt; if (fx.cut.t >= fx.cut.dur) fx.cut = null; }
    // 번개 (세상 시각)
    fx.nextBolt -= wdt;
    if (fx.nextBolt <= 0) {
      fx.nextBolt = rnd(3800, 8500);
      const x = rnd(L.w * 0.08, L.w * 0.92);
      const pts = []; let y = 0; let xx = x;
      while (y < L.horizon) { pts.push([xx, y]); y += rnd(14, 34); xx += rnd(-26, 26); }
      pts.push([xx, L.horizon]);
      fx.bolt = { pts, t: 0, dur: 170 };
      fx.skyFlash = 1;
      if (mode === 'live' && started) sndThunder(rnd(0.25, 0.9));
    }
    if (fx.bolt) { fx.bolt.t += wdt; if (fx.bolt.t > fx.bolt.dur) fx.bolt = null; }
    fx.skyFlash = Math.max(0, fx.skyFlash - wdt / 260);
    updateStorm(wdt);
    // 불꽃은 멈춤 동안에도 아주 천천히 (터지는 순간이 허공에 걸린 느낌)
    const sdt = (fx.freeze > 0 ? fdt * 0.07 : wdt) / 1000;
    for (let i = fx.sparks.length - 1; i >= 0; i--) {
      const p = fx.sparks[i];
      p.life += sdt * 1000;
      const dr = Math.exp(-4.2 * sdt);
      p.vx *= dr; p.vy = p.vy * dr + 420 * sdt;
      p.x += p.vx * sdt; p.y += p.vy * sdt;
      if (p.life >= p.max) fx.sparks.splice(i, 1);
    }
    for (let i = fx.waves.length - 1; i >= 0; i--) { const q = fx.waves[i]; q.life += fx.freeze > 0 ? fdt * 0.15 : wdt; if (q.life >= q.max) fx.waves.splice(i, 1); }
    for (let i = fx.slashes.length - 1; i >= 0; i--) { const q = fx.slashes[i]; q.life += fx.freeze > 0 ? fdt * 0.1 : wdt; if (q.life >= q.max) fx.slashes.splice(i, 1); }
    for (let i = fx.nums.length - 1; i >= 0; i--) { const q = fx.nums[i]; q.life += wdt; q.y += q.vy * wdt / 1000; q.vy *= Math.exp(-3 * wdt / 1000); if (q.life >= q.max) fx.nums.splice(i, 1); }
    for (let i = fx.pops.length - 1; i >= 0; i--) { const q = fx.pops[i]; q.life += fdt; if (q.life >= q.max) fx.pops.splice(i, 1); }
    if (tut) tut.wrong = Math.max(0, (tut.wrong || 0) - fdt / 300);
  }
  function startCut() {
    const c = fx.cutPending; fx.cutPending = null;
    fx.cut = { t: 0, dur: c.strong ? 1000 : 850, text: c.text, sub: c.sub, strong: c.strong };
    fxEmit(c.strong ? 'cutinStrong' : 'cutin');
  }
  function resetFx() {
    fx.freeze = 0; fx.gold = 0; fx.flashF = 0; fx.zoom = 0; fx.tilt = 0; fx.trauma = 0; fx.hurtV = 0; fx.redF = 0;
    fx.knock = 0; fx.knockV = 0; fx.eFlash = 0; fx.squash = 0; fx.cut = null; fx.cutPending = null; fx.rush = 0;
    fx.sparks.length = 0; fx.waves.length = 0; fx.slashes.length = 0; fx.nums.length = 0; fx.pops.length = 0;
  }

  /* ================================================================
     8 오늘의 패링 — 최근 몇 초를 작은 장면으로 녹화 → 가장 멋진 패링을 0.3배로
     ================================================================ */
  const rec = { frames: [], evs: [] };
  const best = { score: -1, pending: null };
  let clip = null;
  let rp = null;
  function record(v) {
    if (mode !== 'live' || !started) return;
    rec.frames.push({ rt: clock, v });
    const old = clock - 6000;
    while (rec.frames.length && rec.frames[0].rt < old) rec.frames.shift();
    while (rec.evs.length && rec.evs[0].rt < old) rec.evs.shift();
  }
  function scoreBest(strong, cut, ch) {
    const sc = (strong ? 100 : 0) + (cut ? 40 : 0) + ch * 5;
    if (sc < best.score) return;
    best.score = sc;
    best.pending = {
      rt: clock, post: TUNE.freeze * (strong ? 1.4 : 1) + 230,
      label: strong ? '강반격!' : (cut ? '콤보 마무리 패링!' : '패링!'), ch
    };
  }
  function captureClip() {
    const p = best.pending; best.pending = null;
    const start = p.rt - 280; const end = p.rt + p.post;
    const frames = rec.frames.filter((f) => f.rt >= start - 20 && f.rt <= end);
    if (frames.length < 4) return;
    clip = { frames, evs: rec.evs.filter((x) => x.rt >= start && x.rt <= end), start: frames[0].rt, end: frames[frames.length - 1].rt, label: p.label, ch: p.ch };
    const b = $('replayBtn'); b.disabled = false; b.classList.add('hot');
    setTimeout(() => b.classList.remove('hot'), 3500);
    fxEmit('clip');
  }
  function startReplay() {
    if (!clip || mode === 'replay' || !started) return;
    mode = 'replay';
    rp = { rr: clip.start, fi: 0, ei: 0, endT: 0 };
    resetFx();
    setTutBtn(null);
    $('lbTitle').textContent = '오늘의 패링 · ' + clip.label + (clip.ch >= 2 ? ' x' + clip.ch : '');
    app.classList.add('replay');
    ambTo(0.25, 0.4);
    fxEmit('replay');
  }
  function updateReplay(dt) {
    rp.rr += dt * RSPD;
    const F = clip.frames;
    while (rp.fi < F.length - 1 && F[rp.fi + 1].rt <= rp.rr) rp.fi++;
    const a = F[rp.fi]; const b = F[Math.min(F.length - 1, rp.fi + 1)];
    // 녹화 장면 사이를 이어서 부드럽게 (시각만 보간)
    const k = b.rt > a.rt ? clamp((rp.rr - a.rt) / (b.rt - a.rt), 0, 1) : 0;
    view = Object.assign({}, a.v, { t: lerp(a.v.t, b.v.t, k) });
    const E = clip.evs;
    while (rp.ei < E.length && E[rp.ei].rt <= rp.rr) { handleEvent(E[rp.ei].e, true); rp.ei++; }
    if (rp.rr >= clip.end) { rp.endT += dt; if (rp.endT > 900) stopReplay(); }
  }
  function stopReplay() {
    if (mode !== 'replay') return;
    mode = 'live';
    resetFx();
    app.classList.remove('replay');
    ambTo(1, 0.6);
    if (tut && tut.held) setTutBtn(tut.c);
    fxEmit('replayEnd');
  }

  /* ================================================================
     그리기
     ================================================================ */
  function shapePath(c, x, y, r) {
    ctx.beginPath();
    if (c === 'r') {
      const R = r * 1.34;
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + k * Math.PI * 2 / 3;
        const px = x + Math.cos(a) * R; const py = y + Math.sin(a) * R + r * 0.12;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
    } else if (c === 'b') {
      const h = r * 0.9; const q = r * 0.16;
      ctx.moveTo(x - h + q, y - h); ctx.lineTo(x + h - q, y - h); ctx.quadraticCurveTo(x + h, y - h, x + h, y - h + q);
      ctx.lineTo(x + h, y + h - q); ctx.quadraticCurveTo(x + h, y + h, x + h - q, y + h);
      ctx.lineTo(x - h + q, y + h); ctx.quadraticCurveTo(x - h, y + h, x - h, y + h - q);
      ctx.lineTo(x - h, y - h + q); ctx.quadraticCurveTo(x - h, y - h, x - h + q, y - h);
      ctx.closePath();
    } else ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  function bez(p0, p1, p2, p3, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n; const u = 1 - t;
      out.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
      });
    }
    return out;
  }
  // 굵기가 줄어드는 촉수 모양 (한 번에 채워요) → 옆선 점들을 돌려줘요 (빛 테두리·빨판용)
  function tentPath(pts, w0, w1) {
    const n = pts.length; const A = []; const B = [];
    for (let i = 0; i < n; i++) {
      const o = pts[Math.max(0, i - 1)]; const q = pts[Math.min(n - 1, i + 1)];
      const dx = q.x - o.x; const dy = q.y - o.y; const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l; const ny = dx / l;
      const w = lerp(w0, w1, i / (n - 1));
      A.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w, nx, ny, w });
      B.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
    }
    ctx.beginPath();
    ctx.moveTo(A[0].x, A[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(A[i].x, A[i].y);
    const tip = pts[n - 1];
    ctx.arc(tip.x, tip.y, w1, Math.atan2(A[n - 1].y - tip.y, A[n - 1].x - tip.x), Math.atan2(B[n - 1].y - tip.y, B[n - 1].x - tip.x), false);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(B[i].x, B[i].y);
    ctx.closePath();
    return { A, B };
  }

  /* 배경: 폭풍 하늘 · 구름 · 번개 · 먼바다 */
  function drawBg() {
    const w = L.w; const T = fx.wt;
    const img = Art.get('bg');
    if (img) {
      const sc = Math.max((w + 80) / img.width, (L.h + 80) / img.height);
      ctx.drawImage(img, L.cx - img.width * sc / 2, L.h / 2 - img.height * sc / 2, img.width * sc, img.height * sc);
    } else {
      ctx.fillStyle = L.skyG; ctx.fillRect(-60, -60, w + 120, L.horizon + 60);
      if (clouds) {
        const off = ((T * 0.018) % clouds.cw + clouds.cw) % clouds.cw;
        ctx.drawImage(clouds, -off - 40, -20, clouds.cw, clouds.ch);
        ctx.drawImage(clouds, -off - 40 + clouds.cw, -20, clouds.cw, clouds.ch);
      }
      if (fx.skyFlash > 0) { ctx.fillStyle = `rgba(190,215,255,${0.38 * fx.skyFlash})`; ctx.fillRect(-60, -60, w + 120, L.horizon + 60); }
      if (fx.bolt) {
        const k = 1 - fx.bolt.t / fx.bolt.dur;
        ctx.lineJoin = 'round';
        for (const [lw, a] of [[7, 0.25], [2.4, 1]]) {
          ctx.strokeStyle = `rgba(210,230,255,${a * k})`; ctx.lineWidth = lw;
          ctx.beginPath(); fx.bolt.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
        }
      }
      ctx.fillStyle = L.seaG; ctx.fillRect(-60, L.horizon, w + 120, L.h - L.horizon + 60);
      // 먼 물결 줄
      ctx.strokeStyle = 'rgba(150,180,215,.13)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let r = 0; r < 4; r++) {
        const y0 = L.horizon + 6 + r * (L.water - L.horizon) / 4;
        for (let x = -40; x <= w + 40; x += 16) {
          const y = y0 + Math.sin(x * 0.04 + T * 0.0012 * (r + 1) + r) * (1.5 + r);
          if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }

  /* 적의 지금 모습 (그림 자세 고르기 · 임시 그림 움직임에 같이 써요) */
  function bossState(v) {
    const t = v.t;
    let u = 0; let lunge = 0; let glow = ''; let nearT = 1e9;
    for (const h of v.hits) {
      if (t < h.ti) {
        const prog = clamp((t - h.show) / (h.ti - h.show), 0, 1);
        u = Math.max(u, prog);
        if (t >= h.reveal && !h.jr && h.ti - t < nearT) { nearT = h.ti - t; glow = h.c; }
      } else if (t - h.ti < 170) lunge = Math.max(lunge, 1 - (t - h.ti) / 170);
    }
    let pose = 'idle';
    if (v.stun || fx.knock > 0.25) pose = 'stagger';
    else if (fx.eFlash > 0.4 || fx.squash > 0.4) pose = 'hurt';
    else if (lunge > 0) pose = 'attack';
    else if (u > 0) pose = 'wind';
    return { u, lunge, glow, pose };
  }
  function drawBoss(v) {
    const S2 = L.S; const T = fx.wt;
    const st = bossState(v);
    const knock = clamp(fx.knock, -0.5, 1.2);
    const bob = Math.sin(T * 0.0021) * S2 * 0.012;
    const wob = (v.stun ? Math.sin(T * 0.011) * 0.07 : 0) + knock * 0.13 * fx.knockDir;
    const sc = 1 + st.u * 0.045 + st.lunge * 0.06 - knock * 0.17;
    ctx.save();
    ctx.translate(L.cx, L.ey + bob - knock * S2 * 0.13);
    ctx.rotate(wob);
    ctx.scale(sc * (1 + fx.squash * 0.05), sc * (1 - fx.squash * 0.07));
    const img = Art.boss(st.pose);
    if (img) {
      const h = S2 * 1.05; const w = h * img.width / img.height;
      ctx.drawImage(img, -w / 2, -h * 0.62, w, h);
      if (fx.eFlash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fx.eFlash * 0.5; ctx.drawImage(img, -w / 2, -h * 0.62, w, h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    } else drawOcto(S2, st, T, v);
    ctx.restore();
  }
  // 임시 그림: 폭풍 문어 (머리 · 눈 · 뒤 촉수 6개) — 원점 = 머리 가운데
  function drawOcto(s, st, T, v) {
    const waterL = (L.water - L.ey) + s * 0.07;
    const flare = clamp(fx.knock, 0, 1);
    // 뒤 촉수 6개: 물에서 솟아 머리 옆으로 휘어요
    for (let k = 0; k < 6; k++) {
      const side = k < 3 ? -1 : 1; const j = k % 3;
      const sway = Math.sin(T * 0.0016 + k * 1.7) * s * 0.045 + side * flare * s * 0.12;
      const base = { x: side * (0.14 + 0.1 * j) * s, y: waterL };
      const tip = { x: side * (0.36 + 0.13 * j) * s + sway, y: (-0.42 + 0.17 * j) * s + Math.cos(T * 0.0013 + k) * s * 0.03 };
      const c1 = { x: base.x + side * 0.12 * s, y: base.y - 0.22 * s };
      const c2 = { x: tip.x + side * (0.16 - 0.05 * j) * s, y: tip.y + 0.2 * s };
      const pts = bez(base, c1, c2, tip, 16);
      // 끝을 안쪽으로 말아요
      const last = pts[pts.length - 1];
      for (let q = 1; q <= 4; q++) {
        const a = -Math.PI / 2 - side * q * 0.55;
        pts.push({ x: last.x - side * s * 0.022 * Math.sin(q * 0.55) * 1.4, y: last.y - s * 0.02 * q * 0.5 + Math.cos(a) * 0 });
      }
      ctx.fillStyle = j === 1 ? '#2b1e48' : '#24183e';
      const sideL = tentPath(pts, s * (0.058 - j * 0.008), s * 0.009);
      ctx.strokeStyle = 'rgba(120,225,255,.32)'; ctx.lineWidth = 2;
      ctx.beginPath(); sideL.A.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    // 머리 (외투막)
    const mantle = () => {
      ctx.beginPath();
      ctx.moveTo(-0.27 * s, 0.15 * s);
      ctx.bezierCurveTo(-0.36 * s, -0.12 * s, -0.25 * s, -0.5 * s, 0, -0.5 * s);
      ctx.bezierCurveTo(0.25 * s, -0.5 * s, 0.36 * s, -0.12 * s, 0.27 * s, 0.15 * s);
      ctx.bezierCurveTo(0.17 * s, 0.24 * s, -0.17 * s, 0.24 * s, -0.27 * s, 0.15 * s);
      ctx.closePath();
    };
    const g = ctx.createRadialGradient(-0.1 * s, -0.3 * s, s * 0.02, 0, -0.1 * s, s * 0.45);
    g.addColorStop(0, '#7a5bb0'); g.addColorStop(0.45, '#3a2864'); g.addColorStop(1, '#130d24');
    mantle(); ctx.fillStyle = g; ctx.fill();
    // 무늬
    ctx.fillStyle = 'rgba(15,8,30,.45)';
    [[-0.12, -0.33, 0.04], [0.09, -0.38, 0.03], [0.17, -0.22, 0.035], [-0.2, -0.16, 0.03], [0.0, -0.24, 0.025]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.ellipse(x * s, y * s, r * s * 1.3, r * s, 0.3, 0, Math.PI * 2); ctx.fill(); });
    // 폭풍 빛 테두리
    ctx.strokeStyle = `rgba(130,230,255,${0.45 + fx.skyFlash * 0.5})`; ctx.lineWidth = s * 0.012;
    ctx.beginPath(); ctx.moveTo(-0.3 * s, -0.05 * s); ctx.bezierCurveTo(-0.33 * s, -0.25 * s, -0.22 * s, -0.48 * s, 0, -0.495 * s); ctx.stroke();
    if (fx.eFlash > 0) { mantle(); ctx.fillStyle = `rgba(255,255,255,${fx.eFlash * 0.7})`; ctx.fill(); }
    // 눈: 공격 색이 보이면 그 색으로 빛나요
    const gc = st.glow ? COL[st.glow].hex : '#ffc23d';
    const glowA = 0.35 + st.u * 0.5;
    for (const sx of [-1, 1]) {
      const ex = sx * 0.12 * s; const ey = 0.02 * s; const r = 0.07 * s;
      const gg = ctx.createRadialGradient(ex, ey, r * 0.3, ex, ey, r * 2.4);
      gg.addColorStop(0, hexA(gc, glowA)); gg.addColorStop(1, hexA(gc, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(ex, ey, r * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b0614'; ctx.beginPath(); ctx.ellipse(ex, ey, r * 1.25, r * 1.05, 0, 0, Math.PI * 2); ctx.fill();
      if (v.stun) {
        // 휘청: 빙글빙글 눈
        ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = s * 0.012; ctx.beginPath();
        for (let q = 0; q < 26; q++) { const a = q * 0.55 + T * 0.012 * sx; const rr = r * q / 26; const px = ex + Math.cos(a) * rr; const py = ey + Math.sin(a) * rr; if (q) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.stroke();
      } else {
        const squint = fx.squash > 0.3 || fx.knock > 0.3 ? 0.35 : 1;
        const ig = ctx.createRadialGradient(ex, ey - r * 0.3, r * 0.1, ex, ey, r);
        ig.addColorStop(0, '#fff7c8'); ig.addColorStop(0.5, gc); ig.addColorStop(1, '#7a3a00');
        ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(ex, ey, r, r * squint, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#05020a'; ctx.beginPath(); ctx.ellipse(ex, ey, r * 0.62, r * 0.15 * squint, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 화난 눈썹
      ctx.fillStyle = '#100a1e';
      ctx.beginPath(); ctx.moveTo(ex - sx * r * 1.5, ey - r * 1.25); ctx.lineTo(ex + sx * r * 1.3, ey - r * 0.75 + st.u * r * 0.2); ctx.lineTo(ex + sx * r * 1.3, ey - r * 0.35); ctx.lineTo(ex - sx * r * 1.4, ey - r * 0.95); ctx.closePath(); ctx.fill();
    }
    // 머리 위 작은 전기 (번개 칠 때 · 휘청일 때)
    if (fx.skyFlash > 0.2 || v.stun) {
      ctx.strokeStyle = 'rgba(170,235,255,.85)'; ctx.lineWidth = 2; ctx.beginPath();
      let x = -0.15 * s; let y = -0.45 * s; ctx.moveTo(x, y);
      for (let q = 0; q < 6; q++) { x += s * 0.05; y += (q % 2 ? 1 : -1) * s * 0.03 * (0.5 + Math.random()); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
  }

  /* 앞바다 (문어 아래쪽을 가려요) */
  function drawFrontSea() {
    if (Art.get('bg') && Art.boss('idle')) return;     // 그림을 쓰면 그림이 맡아요
    const T = fx.wt; const w = L.w;
    ctx.beginPath(); ctx.moveTo(-60, L.h + 60);
    for (let x = -60; x <= w + 60; x += 12) ctx.lineTo(x, waveY(x, T));
    ctx.lineTo(w + 60, L.h + 60); ctx.closePath();
    ctx.fillStyle = L.frontG; ctx.fill();
    ctx.strokeStyle = 'rgba(225,240,255,.42)'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = -60; x <= w + 60; x += 12) { const y = waveY(x, T); if (x === -60) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke();
    // 거품 줄 몇 개
    ctx.strokeStyle = 'rgba(200,225,255,.12)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let r = 1; r < 5; r++) {
      const y0 = L.water + r * 26;
      for (let x = -40; x <= w + 40; x += 18) { const y = y0 + Math.sin(x * 0.03 + T * 0.0015 * r + r * 2) * 4; if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    }
    ctx.stroke();
  }

  /* 공격 촉수 (임시 그림): 고리가 줄어드는 동안 들어 올렸다가 닿는 순간 판정 원으로 내리쳐요
     → 패링이면 튕겨 나가고, 맞으면 화면 앞으로 지나가요. 장면(view)만으로 계산해서 리플레이에서도 똑같아요 */
  function drawStrikes(v) {
    if (Art.boss('idle')) return;
    const s = L.S; const t = v.t;
    const list = v.hits.slice().sort((a, b) => b.ti - a.ti);
    for (const h of list) {
      const n = h.n || 1;
      const side = n === 1 ? (h.a % 2 ? -1 : 1) : [-1, 1, 0][h.i % 3];
      const base = { x: L.cx + (side === 0 ? 0.1 : side * 0.3) * s, y: L.water + s * 0.06 };
      const raise = { x: L.cx + (side === 0 ? 0.06 : side * 0.52) * s, y: L.ey - (side === 0 ? 0.66 : 0.4) * s };
      const target = { x: L.cx + side * 0.03 * s, y: L.jy };
      const d = t - h.ti;
      let tip; let wt; let alpha = 1; let u = 0;
      if (d < 0) {
        const prog = clamp((t - h.show) / (h.ti - h.show), 0, 1);
        const anti = smooth(0.35, 0.72, prog);
        u = prog < 0.72 ? 0 : Math.pow((prog - 0.72) / 0.28, 2.2);
        const wig = Math.sin(t * 0.006 + h.i * 2) * s * 0.03 * (1 - u);
        const rp2 = { x: raise.x + side * s * 0.05 * anti + wig, y: raise.y - s * 0.07 * anti };
        tip = { x: lerp(rp2.x, target.x, u), y: lerp(rp2.y, target.y, u) };
        wt = s * 0.03 * (1 + 2.2 * u);
        alpha = clamp((t - h.show) / 220, 0, 1);
      } else if (h.jr === 'parry') {
        const k = clamp(d / 420, 0, 1);
        const away = { x: L.cx + (side === 0 ? 0.2 : side * 0.8) * s, y: L.ey - 0.62 * s };
        const e = easeOutBack(Math.min(1, k * 1.5));
        tip = { x: lerp(target.x, away.x, e), y: lerp(target.y, away.y, e) };
        wt = s * 0.03 * lerp(3.2, 0.9, Math.min(1, k * 2));
        alpha = 1 - smooth(0.55, 1, k);
        u = 1 - k;
      } else {
        if (d > 560) continue;
        if (d < 110) {
          const k = d / 110;
          tip = { x: lerp(target.x, L.cx + side * 0.1 * s, k), y: lerp(target.y, L.h + s * 0.15, k) };
          wt = s * 0.03 * (3.2 + 2.5 * k);
        } else {
          const k = smooth(0, 1, (d - 110) / 450);
          tip = { x: lerp(L.cx + side * 0.1 * s, raise.x, k), y: lerp(L.h + s * 0.15, raise.y, k) };
          wt = s * 0.03 * lerp(5.7, 1, k);
          alpha = 1 - k * 0.9;
        }
        u = 1;
      }
      if (alpha <= 0.01) continue;
      const c1 = { x: base.x + (side === 0 ? 0.18 : side * 0.24) * s, y: base.y - 0.32 * s };
      const c2 = { x: tip.x + (base.x - tip.x) * 0.1 + (side === 0 ? 0.14 : side * 0.22) * s * (1 - u * 0.7), y: tip.y + (base.y - tip.y) * 0.45 };
      const pts = bez(base, c1, c2, tip, 22);
      ctx.globalAlpha = alpha;
      const revealed = t >= h.reveal && !(h.jr && h.jr !== 'parry');
      if (revealed && d < 0) {
        // 공격 색으로 빛나는 테두리 (색 읽기 도움)
        ctx.strokeStyle = hexA(COL[h.c].hex, 0.55); ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      }
      const inBg = ART.bossInBg && Art.get('bg');
      ctx.fillStyle = inBg ? '#7c3442' : '#3b2a63';             // 배경 그림 문어(붉은 갈색)에 맞춘 색
      const sd = tentPath(pts, s * 0.05, wt);
      ctx.strokeStyle = inBg ? 'rgba(255,200,170,.4)' : 'rgba(140,230,255,.45)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); sd.A.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      // 빨판
      ctx.fillStyle = 'rgba(255,190,215,.55)';
      for (let i = 4; i < sd.A.length; i += 3) {
        const p = sd.A[i]; const r = p.w * 0.38;
        ctx.beginPath(); ctx.arc(p.x - p.nx * p.w * 0.45, p.y - p.ny * p.w * 0.45, r, 0, Math.PI * 2); ctx.fill();
      }
      if (h.jr === 'parry' && d >= 0 && d < 160) {
        ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - d / 160)})`;
        tentPath(pts, s * 0.05, wt); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawSpray() {
    ctx.fillStyle = 'rgba(225,240,255,.5)';
    ctx.beginPath();
    for (const p of P.spray) {
      const k = 1 - p.life / p.max;
      const r = p.r * (0.6 + k * 0.6);
      ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  function drawRain() {
    const frozen = fx.freeze > 0;
    if (frozen) {
      // 멈춘 빗방울: 허공에 매달린 황금빛 구슬
      ctx.fillStyle = 'rgba(255,236,190,.85)';
      ctx.beginPath();
      for (const d of P.rain) { ctx.moveTo(d.x + 1.8, d.y); ctx.arc(d.x, d.y, 1.8, 0, Math.PI * 2); }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,170,.28)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of P.rain) { const dx = fx.wind / d.vy * 8; ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - dx, d.y - 8); }
      ctx.stroke();
    } else {
      const sp = fx.rush > 0 ? 1.8 : 1;
      ctx.strokeStyle = 'rgba(185,205,235,.42)'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (const d of P.rain) {
        const len = d.len * sp; const dx = fx.wind / d.vy * len;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - dx, d.y - len);
      }
      ctx.stroke();
    }
  }
  function drawPetals() {
    for (const p of P.petals) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55 * (0.5 + 0.5 * Math.abs(Math.sin(p.ph))), 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  // 배 난간 (1인칭 느낌)
  function drawRail() {
    const y = L.playH - 22; const w = L.w;
    const g = ctx.createLinearGradient(0, y, 0, y + 22);
    g.addColorStop(0, '#6b4528'); g.addColorStop(1, '#2a170b');
    ctx.fillStyle = g; ctx.fillRect(-60, y, w + 120, 22);
    ctx.fillStyle = 'rgba(255,220,170,.25)'; ctx.fillRect(-60, y, w + 120, 2);
    ctx.fillStyle = '#24140a';
    for (let x = 18; x < w; x += 72) ctx.fillRect(x, y + 22, 12, 60);
  }

  /* 판정 원 · 다가오는 고리 */
  function drawRings(v) {
    const t = v.t; const cx = L.cx; const cy = L.jy; const rj = L.rj;
    let near = 1e9; let nextC = '';
    for (const h of v.hits) {
      if (h.jr) continue;
      const dd = h.ti - t;
      if (dd > -60 && dd < near) { near = dd; nextC = t >= h.reveal ? h.c : ''; }
    }
    const pulse = near < 320 ? 1 - Math.max(0, near) / 320 : 0;
    // 패링 타이밍(판정 폭 안)이면 판정 원이 그 색으로 살짝 물들어요 → 타이밍을 몸으로 익혀요
    const wn = S.winOf(W, hero);
    const inWin = nextC && near <= wn.pre && near >= -wn.post;
    // 판정 원
    ctx.fillStyle = inWin ? hexA(COL[nextC].hex, 0.38) : 'rgba(4,8,18,.42)'; ctx.beginPath(); ctx.arc(cx, cy, rj, 0, Math.PI * 2); ctx.fill();
    if (inWin) {
      ctx.strokeStyle = hexA(COL[nextC].hex, 0.55); ctx.lineWidth = 16;
      ctx.beginPath(); ctx.arc(cx, cy, rj + 8, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.2 * pulse})`; ctx.lineWidth = 10 + 8 * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, rj + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 3 + 2 * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, rj, 0, Math.PI * 2); ctx.stroke();
    if (nextC) {
      ctx.fillStyle = hexA(COL[nextC].hex, 0.35 + 0.55 * pulse);
      shapePath(nextC, cx, cy, rj * (0.42 + 0.08 * pulse)); ctx.fill();
    }
    // 고리 (먼 것부터)
    const list = v.hits.slice().sort((a, b) => b.ti - a.ti);
    for (const h of list) {
      const d = t - h.ti;
      if (h.jr === 'parry' && d >= 0) continue;           // 패링된 고리는 불꽃이 대신해요
      if (d > 260) continue;
      const prog = clamp((t - h.show) / (h.ti - h.show), 0, 1.5);
      let r = rj + (L.r0 - rj) * (1 - prog);
      let a = clamp((t - h.show) / 160, 0, 1);
      if (d > 0) { r = rj * Math.max(0.2, 1 - d / 320); a *= Math.max(0, 1 - d / 260); }
      const revealed = t >= h.reveal;
      const failed = h.jr && h.jr !== 'parry';
      let shape = revealed ? h.c : 'o';
      let col = revealed ? COL[h.c].hex : '#8d95a8';
      let pop = 0;
      if (revealed) { const k = (t - h.reveal) / 200; if (k < 1) pop = 1 - k; }
      if (failed) { col = '#5d6475'; a *= 0.6; }
      if (h.jr === 'parry') col = '#fff3c4';                // 미리 눌러 둔 패링: 밝게 잠겨요
      ctx.globalAlpha = a;
      if (pop > 0) {
        ctx.fillStyle = hexA(col, 0.35 * pop);
        shapePath(shape, cx, cy, r * (1 + 0.35 * pop)); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 9;
      shapePath(shape, cx, cy, r * (1 + 0.12 * pop)); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = revealed ? 6 : 4;
      if (failed) ctx.setLineDash([8, 8]);
      shapePath(shape, cx, cy, r * (1 + 0.12 * pop)); ctx.stroke();
      ctx.setLineDash([]);
      // 색 이름표 (고리 위 작은 표시)
      if (revealed && !failed && d < 0) {
        const by = cy - r * (shape === 'r' ? 1.34 : shape === 'b' ? 0.9 : 1) - 16;
        ctx.fillStyle = col; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(COL[h.c].glyph + ' ' + COL[h.c].name, cx, by);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawFxWorld() {
    // 충격파
    for (const q of fx.waves) {
      const k = q.life / q.max; const e = easeOutCubic(k);
      ctx.strokeStyle = hexA(q.c.length === 7 ? q.c : '#ffffff', (1 - k) * 0.9); ctx.lineWidth = q.w * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(q.x, q.y, lerp(q.r0, q.r1, e), 0, Math.PI * 2); ctx.stroke();
    }
    // 칼빛
    for (const q of fx.slashes) {
      const k = q.life / q.max;
      const len = q.len * easeOutCubic(Math.min(1, k * 3));
      const ca = Math.cos(q.a); const sa = Math.sin(q.a);
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
      ctx.fillStyle = hexA(q.c, 1 - k);
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -q.w * (1 - k * 0.6), len / 2, 0); ctx.quadraticCurveTo(0, q.w * 0.3, -len / 2, 0);
      ctx.fill();
      ctx.restore();
      void ca; void sa;
    }
    // 불꽃
    ctx.lineCap = 'round';
    for (const p of fx.sparks) {
      const k = p.life / p.max;
      const sp = Math.hypot(p.vx, p.vy);
      const len = clamp(sp * 0.035, 2, 26);
      ctx.strokeStyle = hexA(p.c.length === 7 ? p.c : '#ffffff', 1 - k * k);
      ctx.lineWidth = p.w * (1 - k * 0.6);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / (sp || 1) * len, p.y - p.vy / (sp || 1) * len); ctx.stroke();
    }
    // 피해 숫자
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const q of fx.nums) {
      const k = q.life / q.max;
      const pop = k < 0.15 ? 1 + (1 - k / 0.15) * 0.6 : 1;
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.round(q.size * pop)}px ${FONT}`;
      ctx.strokeStyle = 'rgba(20,8,0,.85)'; ctx.lineWidth = Math.max(4, q.size * 0.14);
      ctx.strokeText(q.txt, q.x, q.y); ctx.fillStyle = q.c; ctx.fillText(q.txt, q.x, q.y);
      if (q.sub) { ctx.font = `900 ${Math.round(q.size * 0.36)}px ${FONT}`; ctx.lineWidth = 4; ctx.strokeText(q.sub, q.x, q.y - q.size * 0.72); ctx.fillStyle = '#fff'; ctx.fillText(q.sub, q.x, q.y - q.size * 0.72); }
      ctx.globalAlpha = 1;
    }
  }

  /* 화면 위 덮개: 황금빛 · 붉은 테두리 · 안내 · 컷인 · 글자 · 번쩍임 */
  function drawOverlays(v) {
    const w = L.w; const h = L.h;
    if (fx.gold > 0 && TUNE.gold > 0) {
      const a = clamp(TUNE.gold * fx.gold * fx.goldK, 0, 1.2);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(255,196,96,${clamp(a * 0.85, 0, 1)})`; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(L.cx, L.jy, 0, L.cx, L.jy, Math.max(w, h) * 0.75);
      g.addColorStop(0, `rgba(255,214,120,${clamp(a * 0.55, 0, 1)})`); g.addColorStop(0.5, `rgba(255,170,60,${clamp(a * 0.18, 0, 1)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      // 빛살
      if (fx.freeze > 0) {
        ctx.save(); ctx.translate(L.cx, L.jy); ctx.rotate(fx.wt * 0.0002 + 0.3);
        ctx.fillStyle = `rgba(255,236,170,${0.13 * a})`;
        for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18, -h); ctx.lineTo(18, -h); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
    }
    if (fx.hurtV > 0) {
      const g = ctx.createRadialGradient(L.cx, h * 0.45, Math.min(w, h) * 0.25, L.cx, h * 0.45, Math.max(w, h) * 0.72);
      g.addColorStop(0, 'rgba(255,0,40,0)'); g.addColorStop(1, `rgba(220,0,30,${0.7 * fx.hurtV})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      if (fx.redF > 0) { ctx.fillStyle = `rgba(255,30,50,${0.22 * fx.redF})`; ctx.fillRect(0, 0, w, h); }
    }
    // 7 첫 패링 안내
    if (mode === 'live' && tut && !tut.done) drawTut();
    if (fx.cut) drawCut();
    // 글자 알림
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const q of fx.pops) {
      const k = q.life / q.max;
      const pop = k < 0.12 ? 1 + (1 - k / 0.12) * 0.7 : 1;
      const a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const sx = q.shake && k < 0.3 ? Math.sin(q.life * 0.09) * 7 * (1 - k / 0.3) : 0;
      const x = L.cx + q.dx + sx;
      const y = (q.yAbs || (L.jy - L.rj - 58 + q.dy)) - k * 22;
      const size = Math.round(34 * q.s * pop);
      ctx.globalAlpha = a;
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = Math.max(5, size * 0.16);
      ctx.strokeText(q.txt, x, y); ctx.fillStyle = q.c; ctx.fillText(q.txt, x, y);
      ctx.globalAlpha = 1;
    }
    // 흰 번쩍임 1프레임 → 반전 1프레임
    if (fx.flashF === 2) { ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(0, 0, w, h); }
    else if (fx.flashF === 1) {
      ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    void v;
  }
  function drawTut() {
    const cx = L.cx; const cy = L.jy; const rj = L.rj;
    const c = COL[tut.c];
    if (!tut.held) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 19px ${FONT}`; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 5;
      const txt = '고리가 원에 닿으면 같은 색 버튼!';
      ctx.strokeText(txt, cx, cy + rj + 34); ctx.fillStyle = '#fff'; ctx.fillText(txt, cx, cy + rj + 34);
      return;
    }
    // 화면을 어둡게 하고 판정 원만 뚫어요
    ctx.fillStyle = 'rgba(2,4,10,.62)';
    ctx.beginPath(); ctx.rect(0, 0, L.w, L.h); ctx.arc(cx, cy, rj * 1.7, 0, Math.PI * 2, true); ctx.fill();
    const p = 0.5 + 0.5 * Math.sin(clock * 0.012);
    ctx.strokeStyle = hexA(c.hex, 0.5 + 0.5 * p); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, rj * (1.35 + 0.12 * p), 0, Math.PI * 2); ctx.stroke();
    const sx = tut.wrong > 0 ? Math.sin(clock * 0.08) * 10 * tut.wrong : 0;
    const sc = 1 + 0.08 * p;
    ctx.save(); ctx.translate(cx + sx, cy - rj - 92); ctx.scale(sc, sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = `900 54px ${FONT}`;
    const a = '지금! '; const b = c.glyph + c.name;
    const wa = ctx.measureText(a).width; const wb = ctx.measureText(b).width;
    const x0 = -(wa + wb) / 2;
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 10;
    ctx.strokeText(a, x0, 0); ctx.strokeText(b, x0 + wa, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(a, x0, 0);
    ctx.fillStyle = c.hex; ctx.fillText(b, x0 + wa, 0);
    ctx.restore();
    // 아래 버튼을 가리키는 화살표
    const bx = btnCenter(tut.c);
    const ay = cy + rj * 1.7 + 18 + p * 10;
    ctx.fillStyle = c.hex; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx - 20, ay); ctx.lineTo(bx + 20, ay); ctx.lineTo(bx, ay + 26); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = `800 15px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText('시간이 멈췄어요 · ' + c.name + ' 버튼을 눌러요', cx, cy + rj * 1.7 + 66 > L.playH - 30 ? cy - rj * 1.7 - 20 : cy + rj * 1.7 + 66);
  }
  function btnCenter(c) {
    const r = btnEls[c].getBoundingClientRect();
    return r.left + r.width / 2;
  }
  // 슬로 컷인: 비스듬한 칼자국 띠 + 큰 글자 (임시 그림: 별나침반 + 칼빛)
  function drawCut() {
    const c = fx.cut; const k = c.t / c.dur; const w = L.w;
    const inK = easeOutCubic(clamp(k / 0.14, 0, 1));
    const outK = smooth(0.8, 1, k);
    const alpha = 1 - outK;
    ctx.fillStyle = `rgba(0,0,0,${0.42 * alpha})`; ctx.fillRect(0, 0, w, L.h);
    const bh = c.strong ? 168 : 138;
    ctx.save();
    ctx.translate(L.cx + (1 - inK) * -w * 1.4 + outK * w * 1.4, L.playH * 0.46);
    ctx.rotate(-0.2);
    const bw = w * 2.2;
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    if (c.strong) { g.addColorStop(0, '#3a0610'); g.addColorStop(0.5, '#8a1020'); g.addColorStop(1, '#2a0408'); }
    else { g.addColorStop(0, '#1b1203'); g.addColorStop(0.5, '#4a3108'); g.addColorStop(1, '#140c02'); }
    ctx.fillStyle = g; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    // 속도선
    ctx.save(); ctx.beginPath(); ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.clip();
    ctx.strokeStyle = c.strong ? 'rgba(255,150,120,.28)' : 'rgba(255,220,140,.25)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const yy = -bh / 2 + ((i * 37) % bh);
      const xx = ((i * 211 + c.t * 1.6) % bw) - bw / 2;
      ctx.moveTo(xx, yy); ctx.lineTo(xx - 60 - (i % 5) * 30, yy);
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffd25a'; ctx.fillRect(-bw / 2, -bh / 2 - 6, bw, 6); ctx.fillRect(-bw / 2, bh / 2, bw, 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(-bw / 2, -bh / 2 - 10, bw, 2); ctx.fillRect(-bw / 2, bh / 2 + 8, bw, 2);
    // 그림 자리: 컷인 그림이 있으면 그림, 없으면 별나침반 + 칼빛
    const img = Art.get('cutin');
    if (img) {
      const ih = bh * 1.35; const iw = ih * img.width / img.height;
      ctx.drawImage(img, -w * 0.48, -ih * 0.6, iw, ih);
    } else {
      ctx.save(); ctx.translate(-w * 0.3, 0); ctx.rotate(c.t * 0.004);
      const R = bh * 0.42;
      ctx.fillStyle = '#ffd25a'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; const rr = i % 2 ? R * 0.32 : (i % 4 ? R * 0.7 : R); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // 칼빛 초승달
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.moveTo(-w * 0.55, bh * 0.35); ctx.quadraticCurveTo(0, -bh * 0.9, w * 0.55, -bh * 0.2); ctx.quadraticCurveTo(0, -bh * 0.45, -w * 0.55, bh * 0.35); ctx.fill();
    }
    // 큰 글자
    const punch = 1 + 0.5 * (1 - clamp(k / 0.12, 0, 1));
    ctx.save(); ctx.translate(w * 0.08, -6); ctx.scale(punch, punch); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const fs = c.strong ? 82 : 76;
    ctx.font = `900 ${fs}px ${FONT}`;
    ctx.strokeStyle = '#1a0a00'; ctx.lineWidth = 14; ctx.strokeText(c.text, 0, 0);
    const tg = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
    tg.addColorStop(0, '#fffbe6'); tg.addColorStop(0.5, c.strong ? '#ffb36b' : '#ffe27a'); tg.addColorStop(1, c.strong ? '#ff3d3d' : '#ffae2b');
    ctx.fillStyle = tg; ctx.fillText(c.text, 0, 0);
    ctx.font = `900 18px ${FONT}`; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.8)';
    ctx.strokeText(c.sub, 0, fs * 0.62); ctx.fillStyle = '#fff'; ctx.fillText(c.sub, 0, fs * 0.62);
    ctx.restore();
    ctx.restore();
  }

  function render(v) {
    const w = L.w;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // 4 카메라: 흔들림(멈춤 동안은 붙잡혀요) · 기울기 · 적 쪽 펀치 줌
    const sh = fx.freeze > 0 ? 0 : TUNE.shake * fx.trauma;
    const sx = sh * (Math.sin(clock * 0.093) * 0.6 + Math.sin(clock * 0.171 + 1) * 0.4);
    const sy = sh * (Math.sin(clock * 0.087 + 2) * 0.6 + Math.sin(clock * 0.149) * 0.4);
    const z = 1 + fx.zoom;
    ctx.save();
    ctx.translate(L.cx + sx, L.ey + sy);
    ctx.rotate(fx.tilt);
    ctx.scale(z, z);
    ctx.translate(-L.cx, -L.ey);
    drawBg();
    if (!(ART.bossInBg && Art.get('bg'))) { drawBoss(v); drawFrontSea(); drawStrikes(v); }
    else drawStrikes(v);   // 배경 그림 속 문어여도 공격 촉수는 그려요 → 적이 때린다는 느낌
    drawSpray();
    drawRain();
    drawRail();
    drawRings(v);
    drawFxWorld();
    drawPetals();
    ctx.restore();
    drawOverlays(v);
    if (fx.flashF > 0) fx.flashF--;
    void w;
  }

  /* 화면 틀 (체력 · 게이지 · 보스 체력) — 바뀔 때만 써요 */
  const hudLast = { hp: -1, ga: -1, eh: -1, full: null };
  function updateHud(v) {
    const hp = Math.round(v.hp * 200) / 200; const ga = Math.round(v.gauge * 200) / 200; const eh = Math.round(v.ehp * 200) / 200;
    if (hp !== hudLast.hp) { $('hpFill').style.transform = `scaleX(${clamp(hp, 0, 1)})`; hudLast.hp = hp; }
    if (ga !== hudLast.ga) { $('gaFill').style.transform = `scaleX(${clamp(ga, 0, 1)})`; hudLast.ga = ga; }
    if (eh !== hudLast.eh) { $('bossFill').style.transform = `scaleX(${clamp(eh, 0, 1)})`; hudLast.eh = eh; }
    const full = ga >= 1;
    if (full !== hudLast.full) { $('gaFill').classList.toggle('full', full); hudLast.full = full; }
  }

  /* ================================================================
     테스트 손잡이 (자동 플레이어 · 스크린샷) — breakOn(일, ms): 그 일이 생기고 ms 뒤에 화면을 멈춰요
     ================================================================ */
  const dbg = { paused: false, breaks: [], log: [], hit: '', dts: [] };
  function fxEmit(kind) {
    dbg.log.push(kind);
    if (dbg.log.length > 200) dbg.log.shift();
    for (const b of dbg.breaks) if (!b.at && !b.done && b.kind === kind) b.at = clock + b.after;
  }

  /* ================================================================
     돌리기
     ================================================================ */
  let last = performance.now();
  function frame(nowT) {
    requestAnimationFrame(frame);
    if (dbg.paused) { last = nowT; return; }
    const dt = Math.min(50, Math.max(0, nowT - last));
    last = nowT;
    clock += dt;
    dbg.dts.push(dt); if (dbg.dts.length > 120) dbg.dts.shift();
    if (mode === 'replay') updateReplay(dt); else updateLive(dt);
    updateFx(mode === 'replay' ? dt * RSPD : dt);
    render(view);
    updateHud(view);
    for (const b of dbg.breaks) {
      if (b.at && !b.done && clock >= b.at) { b.done = true; dbg.paused = true; dbg.hit = b.kind; break; }
    }
  }

  /* ================================================================
     손맛 조절판
     ================================================================ */
  const TUNE_UI = [
    ['freeze', (v) => Math.round(v) + 'ms'], ['gold', (v) => Math.round(v * 100) + '%'], ['zoom', (v) => '+' + Math.round(v * 100) + '%'],
    ['shake', (v) => Math.round(v) + 'px'], ['vol', (v) => Math.round(v * 100) + '%']
  ];
  function tuneSave() { try { localStorage.setItem('rpgDemoTune', JSON.stringify(TUNE)); } catch (e) { /* 괜찮아요 */ } }
  function tuneShow() {
    TUNE_UI.forEach(([k, f]) => { $('t_' + k).value = TUNE[k]; $('o_' + k).textContent = f(TUNE[k]); });
    $('t_flash').checked = !!TUNE.flash;
  }
  TUNE_UI.forEach(([k, f]) => {
    $('t_' + k).addEventListener('input', (e) => {
      TUNE[k] = Number(e.target.value);
      $('o_' + k).textContent = f(TUNE[k]);
      if (k === 'vol' && AU.master) AU.master.gain.setTargetAtTime(TUNE.vol, AU.ctx.currentTime, 0.03);
      tuneSave();
    });
  });
  $('t_flash').addEventListener('change', (e) => { TUNE.flash = e.target.checked; tuneSave(); });
  $('tuneReset').addEventListener('click', () => { Object.assign(TUNE, TUNE_DEF); tuneShow(); if (AU.master) AU.master.gain.value = TUNE.vol; tuneSave(); });
  $('gear').addEventListener('click', () => { audioInit(); const t = $('tune'); t.hidden = !t.hidden; });
  // 조절판 안의 터치가 게임으로 새지 않게
  $('tune').addEventListener('pointerdown', (e) => e.stopPropagation());
  tuneShow();

  window.addEventListener('resize', layout);
  layout();
  view = snap();
  requestAnimationFrame(frame);

  window.__demo = {
    get W() { return W; }, get hero() { return hero; }, get view() { return view; }, get tut() { return tut; },
    get mode() { return mode; }, get clip() { return clip; }, get chain() { return chain; }, get fx() { return fx; },
    get started() { return started; }, ART, TUNE, dbg,
    input: onPress, release: onRelease, begin: () => { audioInit(); begin(); }, startReplay,
    breakOn(kind, after) { dbg.breaks.push({ kind, after: after || 0, at: 0, done: false }); },
    isPaused: () => dbg.paused,
    resume() { dbg.paused = false; dbg.hit = ''; last = performance.now(); },
    fps() { const a = dbg.dts.reduce((s, x) => s + x, 0) / (dbg.dts.length || 1); return Math.round(1000 / (a || 16.7)); }
  };
})();
