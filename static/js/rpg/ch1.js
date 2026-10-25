/* 아리채 오락실 · 회귀 RPG 1장 「꽃비 항구와 울음곶」 화면·흐름 (static/rpg.html)
   - 흐름: 선장 고르기(남·여) → 오프닝 30초(건너뛰기) → 방 1~5 + 중간 보스(적 캐럭선) + 폭풍 문어
           → 쓰러지면 별나침반 되감기 → "제 N회차 회귀!" → 여관 정산(s_inn) → 꽃비 항구 대사(회차마다 늘어요) → 다시 출항
           → 문어를 쓰러뜨리면 클리어 장면(s_clear) → 정산 → 다시 항구
   - 규칙은 data.js + sim.js 그대로예요. 이 파일이 하는 일 (규칙 숫자는 하나도 안 바꿔요)
       1) sim 시간을 늦추거나 붙잡기 (세상 멈춤 · 컷인 슬로 · 첫 패링 안내 · 쓰러질 때 슬로)
       2) sim 이 내보낸 일(W.ev)을 읽어 효과 · 소리 · 진동 · 대사를 내기
   - 패링 연출 (rpg_story.md 1절 1·2·4·5·6·7 + 진동 + 강반격 컷인 그림) 은 rpg-demo(demo.js) 에서 옮겨 왔어요
   - 그림 경로는 art.js(RpgArt.src) 한 곳 · 이야기는 story.js · 회귀 기록 저장은 meta.js (대기실과 같은 기록)
   - 2단계 (rpg_story.md 6절 '돈·장비·스탯'): 조개껍데기(HUD 🐚) · 부두 상점(s_shop, 부두 방을 지나 출항 전) · 보스(캐럭선·문어)를 잡으면
       스탯 점수 나누기(힘·민첩·체력) · 회귀하면 스탯은 오른 만큼의 50% 이월, 조개·장비는 0 (여관 정산에 "힘 20 → 15")
       → 규칙 계산은 전부 sim.js (buyGear · spendPt · settle) · 이 파일은 화면만
   - 3단계 (rpg_story.md 6절 '범선 전투' · '인물' · '화풍 확정')
       · 우리 대포 (가): 강반격(3연속 패링)마다 우리 배 대포 한 발 연출 ("쾅!" · 포구 불꽃·연기 · 적 크게 휘청) — 규칙 숫자는 그대로
       · 우리 대포 (나): 패링으로 대포 게이지 충전 → 다 차면 세 버튼이 반짝 → 0.2초 안에 세 버튼 = 일제 사격 (규칙은 sim.js cannon 모드)
       · 적 배(캐럭선 · 작은 적 범선)의 공격 = 색 포탄 → 맞는 색이면 공중에서 "펑!" 격추
         · 작은 적 범선은 옆에서 나타나 화면 왼쪽·가운데·오른쪽에서 연달아 쏴요 (쏘는 쪽에 포구 불꽃)
       · 배를 일제 사격으로 끝내면 격침 장면 (돛대가 부러지고 · 기울어 가라앉고 · 조개가 쏟아짐 = 보너스) · 다른 방법이면 보통 격파
       · 콩게 숨은그림 (회차마다 숨는 곳이 바뀜 · story.js kongSpot · 눌러서 찾으면 조개 · 한 회차 한 번)
       · 보리: 콩게 쪽을 쳐다보며 힌트 · 여관 정산에서 선장 곁에 웅크림 · 강반격·일제 사격·콩게 찾기 때 꼬리를 세워요
       · 설정 '화풍 바꾸기' (게임 일러스트 ↔ 고전 유화 · 기기에 저장 · 없는 그림은 게임 일러스트로)
       · 폭풍 문어는 화면을 거의 채울 만큼 크게
   - 시험용 주소: ?auto=kid|teen|adult (자동 플레이어가 하고 장면도 저절로 넘겨요) · &speed=1~8 · &g=m|f
   - 시험 손잡이: window.__ch1 */
(function () {
  'use strict';

  const S = window.RpgSim;
  const D = window.RpgData;
  const Meta = window.RpgMeta;
  const Art = window.RpgArt;
  const ST = window.RpgStory;
  const HD = D.hero;
  const DT = S.DT;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
  const easeOutBack = (k) => { const c1 = 1.9; const c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

  /* ---------------- 시험용 주소 ---------------- */
  const Q = new URLSearchParams(location.search);
  const AUTO = S.SKILLS[Q.get('auto')] ? Q.get('auto') : '';
  const SPEED = clamp(Number(Q.get('speed')) || 1, 1, 8);

  /* 손맛 숫자 (데모에서 사용자가 괜찮다고 한 기본값) */
  const TUNE = { freeze: 300, gold: 0.6, zoom: 0.12, shake: 14, vol: 0.8, flash: true };
  const COL = {
    r: { hex: '#ff4d5e', name: '빨강', glyph: '▲' },
    g: { hex: '#2fd27a', name: '초록', glyph: '●' },
    b: { hex: '#3d8bff', name: '파랑', glyph: '■' }
  };
  const IDX = { r: 0, g: 1, b: 2 };
  const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const TUT_LEAD = 40;           // 첫 패링 안내: 닿기 40ms 전에 멈춰요 (판정 폭 앞 138ms 안 → 누르면 반드시 패링)
  const CARD_GUARD = 800;        // 카드가 막 나온 0.8초는 버튼을 안 받아요 (연타하다 모르고 고르지 않게)
  const AMB = { petals: 0.3, clear: 0.35, rain: 0.75, storm: 1, night: 0.22, none: 0.15 };

  /* ---------------- 이 기기 저장 (선장 성별) ---------------- */
  const SKEY = 'arichae_rpg_ch1';
  let SAVE = {};
  try { SAVE = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (e) { SAVE = {}; }
  function saveSave() { try { localStorage.setItem(SKEY, JSON.stringify(SAVE)); } catch (e) { /* 이번 접속만 */ } }

  /* ---------------- 화면 요소 ---------------- */
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  const panel = $('panel');
  const btnEls = {};
  document.querySelectorAll('.btn').forEach((b) => { btnEls[b.dataset.c] = b; });

  Art.preload(ST.ART_IDS.concat(Object.keys(D.enemies).map((k) => D.enemies[k].art).filter(Boolean)));

  /* ================================================================
     상태
     ================================================================ */
  const G = {
    mode: 'boot', g: SAVE.g === 'f' ? 'f' : 'm', token: 0,
    W: null, hero: null, meta: null, res: null, room: 0,
    bg: 'bg_harbor', focus: 0.55, bgPrev: '', focusPrev: 0.5, bgFade: 0, weather: 'petals', tint: 0,
    foe: null, ending: null, rw: null, scene: null, cardsKey: '', cardsAt: 0, innReadyAt: 0, white: 0,
    stat: null, shopAt: 0,
    sink: null, kong: null, bori: { react: -1e9, hintAt: 0 }, fired: {}, gunSide: 1, setOpen: false
  };
  let clock = 0;
  let simAcc = 0;
  let chain = 0;
  let tut = null;
  let view = null;
  const L = {};
  let dpr = 1;
  const timers = [];
  function after(ms, fn) { const tk = G.token; timers.push({ at: clock + ms, fn, tk }); }

  const fx = {
    wt: 0, freeze: 0, rush: 0, gold: 0, goldK: 1,
    flashF: 0, zoom: 0, tilt: 0, trauma: 0, hurtV: 0, redF: 0,
    knock: 0, knockV: 0, knockDir: 1, eFlash: 0, squash: 0,
    cut: null, cutPending: null,
    wind: -240, bolt: null, nextBolt: 4000, skyFlash: 0,
    sparks: [], waves: [], slashes: [], nums: [], pops: [],
    guns: [], puffs: [], booms: [], coins: [], kongFx: null
  };
  const P = { rain: [], spray: [], petals: [], bubbles: [], stars: [], shoot: [], smoke: [] };
  const CAP = { spark: 140, num: 24, pop: 8, wave: 10, slash: 12, spray: 46, petal: 16, gun: 14, puff: 70, boom: 18, coin: 40 };

  /* ================================================================
     화면 배치 (세로 폰 · DPR 2 상한)
     ================================================================ */
  function layout() {
    const w = window.innerWidth; const h = window.innerHeight;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    L.w = w; L.h = h;
    const pt = panel.classList.contains('hide') ? h : panel.getBoundingClientRect().top;
    L.playH = Math.max(h * 0.5, pt);
    L.cx = w / 2;
    L.S = Math.min(w * 0.98, L.playH * 0.64);
    L.ey = L.playH * 0.36;
    L.water = L.playH * 0.62;
    L.jy = L.playH * 0.8;
    L.rj = clamp(Math.min(w, L.playH) * 0.11, 32, 66);
    L.r0 = L.rj * 3.3;
    const rainN = clamp(Math.round((w * h) / 2300), 60, 150);
    while (P.rain.length < rainN) P.rain.push(newDrop(true));
    P.rain.length = rainN;
    while (P.petals.length < CAP.petal) P.petals.push(newPetal(true));
    if (P.stars.length < 90) { P.stars.length = 0; for (let i = 0; i < 90; i++) P.stars.push({ x: Math.random(), y: Math.random() * 0.55, r: rnd(0.6, 2), ph: rnd(0, 6.28) }); }
    const topH = ($('top').getBoundingClientRect().bottom || 50) + 8;
    $('talk').style.top = topH + 'px';
    $('banner').style.top = Math.round(L.playH * 0.3) + 'px';
    $('cards').style.bottom = Math.round(h - L.playH + 10) + 'px';
  }

  /* ================================================================
     날씨 조각 (비 · 물보라 · 꽃잎 · 은빛 물방울 · 별 · 연기) — 세상 시각으로 움직여서 멈춤 때 허공에 멈춰요
     ================================================================ */
  function newDrop(any) { return { x: rnd(-40, (L.w || 400) + 320), y: any ? rnd(-40, L.h || 800) : rnd(-80, -10), vy: rnd(950, 1400), len: rnd(14, 28) }; }
  function newPetal(any) { return { x: rnd(0, (L.w || 400) + 100), y: any ? rnd(0, L.playH || 600) : rnd(-30, (L.playH || 600) * 0.7), vy: rnd(20, 70), rot: rnd(0, 6.28), vr: rnd(-4, 4), s: rnd(4, 7.5), ph: rnd(0, 6.28), c: Math.random() < 0.6 ? '#ffd86b' : '#ffb7c9' }; }
  const rainy = () => G.weather === 'rain' || G.weather === 'storm';
  function updateWeather(wdt) {
    const s = wdt / 1000; const T = fx.wt;
    fx.wind = G.weather === 'petals' ? -120 - 60 * Math.sin(T * 0.0005) : -230 - 150 * Math.sin(T * 0.00042) - 70 * Math.sin(T * 0.0013);
    if (rainy()) {
      for (const d of P.rain) { d.y += d.vy * s; d.x += fx.wind * s; if (d.y > L.h + 30 || d.x < -60) Object.assign(d, newDrop(false)); }
    }
    if (G.weather === 'storm' && G.mode === 'play') {
      let want = 22 * s;
      while (want > 0 && P.spray.length < CAP.spray) {
        if (Math.random() < want) { const x = rnd(-20, L.w + 20); P.spray.push({ x, y: L.water + rnd(0, 30), vx: fx.wind * 0.35 + rnd(-40, 40), vy: -rnd(140, 330), r: rnd(2, 5.5), life: 0, max: rnd(0.7, 1.2) }); }
        want -= 1;
      }
    }
    for (let i = P.spray.length - 1; i >= 0; i--) {
      const p = P.spray[i]; p.life += s; p.vy += 520 * s; p.x += p.vx * s; p.y += p.vy * s;
      if (p.life >= p.max) P.spray.splice(i, 1);
    }
    if (G.weather === 'petals') {
      for (const p of P.petals) {
        p.ph += s * 3; p.x += (fx.wind * 0.55 + Math.sin(p.ph) * 40) * s; p.y += (p.vy + Math.cos(p.ph * 0.7) * 30) * s; p.rot += p.vr * s;
        if (p.x < -30 || p.y > L.h + 40) Object.assign(p, newPetal(false), { x: L.w + rnd(10, 120) });
      }
    }
    for (let i = P.bubbles.length - 1; i >= 0; i--) {
      const b = P.bubbles[i]; b.life += s; b.y -= b.vy * s; b.x += Math.sin(b.life * 3 + b.ph) * 30 * s + b.vx * s;
      if (b.life > b.max) P.bubbles.splice(i, 1);
    }
    for (let i = P.shoot.length - 1; i >= 0; i--) { const q = P.shoot[i]; q.t += wdt; if (q.t > q.dur) P.shoot.splice(i, 1); }
    for (let i = P.smoke.length - 1; i >= 0; i--) {
      const q = P.smoke[i]; q.life += s; q.y -= q.vy * s; q.x += (12 + q.life * 6) * s; q.r += 7 * s;
      if (q.life > q.max) P.smoke.splice(i, 1);
    }
  }
  function sprayBurst(x, y, n, up) {
    for (let i = 0; i < n && P.spray.length < CAP.spray + 20; i++) P.spray.push({ x: x + rnd(-40, 40), y, vx: rnd(-160, 160), vy: -rnd(200, up || 520), r: rnd(2.5, 6), life: 0, max: rnd(0.6, 1.1) });
  }
  function bubbleBurst(n) {
    for (let i = 0; i < n && P.bubbles.length < 120; i++) P.bubbles.push({ x: rnd(0, L.w), y: L.h + rnd(0, 120), vx: rnd(-15, 15), vy: rnd(120, 320), r: rnd(3, 14), ph: rnd(0, 6.28), life: 0, max: rnd(2, 4) });
  }
  function setWeather(wx) {
    if (wx === G.weather) return;
    G.weather = wx;
    ambTo(AMB[wx] == null ? 0.3 : AMB[wx], 1.2);
  }

  /* ================================================================
     소리 (WebAudio · 파일 없이 만들어요) — 첫 터치에 켜져요 (demo.js 에서 옮김)
     ================================================================ */
  const AU = { ctx: null, base: 0.3 };
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
    const n = Math.floor(c.sampleRate * 3);
    AU.white = c.createBuffer(1, n, c.sampleRate);
    AU.brown = c.createBuffer(1, n, c.sampleRate);
    const wd = AU.white.getChannelData(0); const bd = AU.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; wd[i] = r; last = (last + 0.02 * r) / 1.02; bd[i] = last * 3.5; }
    const loop = (buf, off) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, off || 0); return s; };
    const wsrc = loop(AU.white, 0);
    const wbp = c.createBiquadFilter(); wbp.type = 'bandpass'; wbp.frequency.value = 480; wbp.Q.value = 0.9;
    const wg = c.createGain(); wg.gain.value = 0.42;
    wsrc.connect(wbp); wbp.connect(wg); wg.connect(AU.amb);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11; const lg = c.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(wbp.frequency); lfo.start();
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.23; const lg2 = c.createGain(); lg2.gain.value = 0.22; lfo2.connect(lg2); lg2.connect(wg.gain); lfo2.start();
    const rsrc = loop(AU.white, 1.3);
    const rhp = c.createBiquadFilter(); rhp.type = 'highpass'; rhp.frequency.value = 3200;
    AU.rainG = c.createGain(); AU.rainG.gain.value = 0.11;
    rsrc.connect(rhp); rhp.connect(AU.rainG); AU.rainG.connect(AU.amb);
    const bsrc = loop(AU.brown, 0.4);
    const blp = c.createBiquadFilter(); blp.type = 'lowpass'; blp.frequency.value = 170;
    const bg = c.createGain(); bg.gain.value = 0.6;
    bsrc.connect(blp); blp.connect(bg); bg.connect(AU.amb);
    const t = c.currentTime;
    AU.base = AMB[G.weather] == null ? 0.3 : AMB[G.weather];
    AU.amb.gain.setValueAtTime(0, t); AU.amb.gain.linearRampToValueAtTime(AU.base, t + 1.6);
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
  // "칭" — 쇳소리 · semi 반음 올림(연속 패링) · big 강반격
  function sndChing(semi, big) {
    if (!AU.ctx) return;
    const t = now();
    const f0 = 1480 * Math.pow(2, semi / 12);
    const parts = [[1, 0.42, 1.1], [2.01, 0.2, 0.7], [2.76, 0.24, 0.55], [4.07, 0.11, 0.35], [5.43, 0.08, 0.24], [6.79, 0.05, 0.16]];
    parts.forEach(([r, a, d]) => tone('sine', f0 * r, 0, t, 0.002, a * (big ? 1.15 : 1), d * (big ? 1.6 : 1)));
    tone('sine', f0 * 1.007, 0, t, 0.002, 0.2, 0.9);
    noise(t, 0.001, 0.55, 0.035, 'highpass', 5200);
    if (big) {
      tone('sine', f0 * 1.5, 0, t + 0.02, 0.003, 0.22, 1.4);
      tone('triangle', f0 * 0.5, 0, t + 0.01, 0.003, 0.18, 1.2);
      tone('sine', f0 * 2.0, 0, t + 0.05, 0.003, 0.12, 1.6);
    }
  }
  // "쿵" — 낮게 떨어지는 소리
  function sndKung(big) {
    if (!AU.ctx) return;
    const t = now();
    tone('sine', 150, 38, t, 0.004, 0.95, 0.55 * (big ? 1.5 : 1));
    tone('triangle', 75, 32, t, 0.004, 0.35, 0.4);
    noise(t, 0.003, 0.55, 0.22, 'lowpass', 420, 120);
    if (big) { tone('sine', 55, 24, t + 0.02, 0.01, 0.7, 1.1); noise(t, 0.004, 0.4, 0.7, 'lowpass', 1100, 140, 0.6, AU.brown); }
  }
  function sndHurt() {
    if (!AU.ctx) return;
    const t = now();
    noise(t, 0.002, 0.65, 0.22, 'lowpass', 900, 200);
    tone('square', 110, 52, t, 0.003, 0.09, 0.22);
    tone('sine', 90, 40, t, 0.003, 0.5, 0.3);
  }
  function sndFail() { if (!AU.ctx) return; tone('triangle', 340, 210, now(), 0.004, 0.22, 0.16); }
  function sndTick(big) {
    if (!AU.ctx) return;
    const t = now();
    noise(t, 0.001, big ? 0.3 : 0.16, big ? 0.07 : 0.045, 'bandpass', big ? 1800 : 2600, 0, 1.2);
    if (big) tone('sine', 230, 90, t, 0.002, 0.28, 0.12);
  }
  function sndWhoosh() { if (!AU.ctx) return; noise(now(), 0.25, 0.1, 0.45, 'bandpass', 280, 1300, 1.4); }
  function sndThunder(delay) {
    if (!AU.ctx) return;
    const t = now() + (delay || 0);
    noise(t, 0.06, 0.6, 2.6, 'lowpass', 300, 70, 0.5, AU.brown);
    noise(t, 0.01, 0.25, 0.5, 'lowpass', 1500, 200, 0.5);
  }
  function sndTutHold() { if (!AU.ctx) return; const t = now(); tone('sine', 520, 780, t, 0.02, 0.12, 0.5); tone('sine', 1040, 1560, t, 0.02, 0.05, 0.5); }
  function sndNotes(fs, gap, type, peak, dec) {
    if (!AU.ctx) return;
    const t = now();
    fs.forEach((f, i) => tone(type || 'triangle', f, 0, t + i * gap, 0.01, peak || 0.18, dec || 0.5));
  }
  const sndLvup = () => sndNotes([523, 659, 784, 1047], 0.07, 'triangle', 0.16, 0.4);
  const sndCard = () => sndNotes([880, 1320], 0.05, 'sine', 0.14, 0.25);
  const sndCardsIn = () => sndNotes([392, 523, 659], 0.06, 'triangle', 0.12, 0.35);
  const sndBuy = () => sndNotes([660, 990, 1320], 0.05, 'sine', 0.16, 0.3);
  const sndTitle = (clear) => sndNotes(clear ? [523, 659, 784, 1047, 1319] : [392, 494, 587, 784], 0.11, 'triangle', 0.2, 1.1);
  function sndMeow() {
    if (!AU.ctx) return;
    const t = now();
    tone('sine', 700, 1100, t, 0.05, 0.08, 0.18); tone('sine', 1100, 620, t + 0.2, 0.03, 0.08, 0.3);
  }
  // "쾅!" 대포 — far 면 멀리서 쏘는 적 대포 (작고 짧게)
  function sndCannon(vol, far) {
    if (!AU.ctx) return;
    const t = now(); const v = vol == null ? 1 : vol;
    tone('sine', far ? 120 : 150, 28, t, 0.003, 0.95 * v, far ? 0.45 : 0.8);
    noise(t, 0.002, 0.75 * v, far ? 0.22 : 0.5, 'lowpass', far ? 900 : 1700, 90, 0.7, AU.brown);
    noise(t, 0.001, 0.45 * v, 0.07, 'bandpass', 2600, 700, 0.8);
    if (!far) tone('triangle', 70, 28, t + 0.02, 0.01, 0.5 * v, 0.9);
  }
  // "펑!" 포탄 격추
  function sndPop() {
    if (!AU.ctx) return;
    const t = now();
    noise(t, 0.001, 0.6, 0.18, 'bandpass', 1900, 380, 0.9);
    tone('sine', 320, 110, t, 0.003, 0.35, 0.2);
  }
  // 돛대가 부러지는 소리 · 물에 잠기는 소리 · 조개 짤랑 · 콩게 뽁뽁
  function sndCreak() { if (!AU.ctx) return; const t = now(); tone('sawtooth', 190, 55, t, 0.02, 0.07, 0.9); noise(t, 0.01, 0.35, 0.35, 'bandpass', 700, 200, 2); }
  function sndSplash() { if (!AU.ctx) return; noise(now(), 0.05, 0.5, 1.4, 'lowpass', 1400, 160, 0.6, AU.brown); }
  function sndCoin() { if (!AU.ctx) return; const t = now(); tone('sine', 2093, 0, t, 0.002, 0.07, 0.12); tone('sine', 2637, 0, t + 0.04, 0.002, 0.06, 0.16); }
  function sndKong() { if (!AU.ctx) return; const t = now(); tone('sine', 900, 1500, t, 0.005, 0.12, 0.09); tone('sine', 1100, 1700, t + 0.11, 0.005, 0.12, 0.1); tone('triangle', 1600, 2200, t + 0.24, 0.005, 0.08, 0.18); }
  // 되감기: 높아지는 바람 + 거꾸로 빨라지는 째깍 소리
  function sndRewind(sec) {
    if (!AU.ctx) return;
    const t = now(); const d = sec || 2.4;
    noise(t, d * 0.8, 0.22, d * 0.3, 'bandpass', 300, 3200, 3);
    tone('sine', 220, 1760, t, d * 0.85, 0.08, d * 0.2);
    let k = 0;
    for (let x = 0; x < d && k < 40; k++) { noise(t + x, 0.001, 0.18, 0.03, 'bandpass', 3000, 0, 3); x += 0.28 * Math.pow(0.88, k); }
  }
  // 소리 빼기: 바다·비 소리를 거의 0으로 → hold 초 뒤 천천히 돌아와요
  function duck(hold, deep) {
    if (!AU.ctx) return;
    const g = AU.amb.gain; const t = AU.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(deep ? 0.008 : 0.025, t + 0.02);
    g.setValueAtTime(deep ? 0.008 : 0.025, t + 0.02 + hold);
    g.linearRampToValueAtTime(AU.base, t + 0.02 + hold + (deep ? 1.1 : 0.75));
  }
  function ambTo(v, sec) {
    AU.base = v;
    if (!AU.ctx) return;
    const g = AU.amb.gain; const t = AU.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + (sec || 0.3));
    if (AU.rainG) AU.rainG.gain.setTargetAtTime(rainy() ? 0.11 : 0.0, t, 0.4);
  }
  function vib(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 진동이 없는 기기 */ } }

  /* ================================================================
     화면 바꾸기 · 알림
     ================================================================ */
  function setMode(m) {
    G.mode = m;
    const play = m === 'play';
    $('top').classList.toggle('hide', !play);
    panel.classList.toggle('hide', !play);
    $('say').classList.toggle('hide', m !== 'scene');
    $('sayTap').classList.toggle('hide', m !== 'scene');
    $('skip').classList.toggle('hide', !(m === 'scene' && G.scene && G.scene.o.skip));
    $('title').classList.toggle('hide', m !== 'title');
    $('inn').classList.toggle('hide', m !== 'inn');
    $('shop').classList.toggle('hide', m !== 'shop');
    $('stat').classList.toggle('hide', m !== 'stats');
    if (!play) { $('cards').classList.add('hide'); setTutBtn(null); Object.keys(btnEls).forEach((c) => btnEls[c].classList.remove('armed')); hudLast.full = null; }
    layout();
  }
  let bannerT = 0;
  function banner(big, small, ms, cls) {
    const el = $('banner');
    el.querySelector('b').textContent = big || '';
    el.querySelector('span').textContent = small || '';
    el.className = 'on' + (cls ? ' ' + cls : '');
    bannerT = clock + (ms || 1800);
  }
  const talkQ = [];
  let talkUntil = 0;
  function talk(list) { (list || []).forEach((x) => talkQ.push(x)); }
  function updateTalk() {
    const el = $('talk');
    if (clock < talkUntil) return;
    if (!talkQ.length || G.mode !== 'play') { el.classList.remove('on'); if (G.mode !== 'play') talkQ.length = 0; return; }
    const x = talkQ.shift();
    const txt = ST.sayText(x.text, G.g);
    el.classList.toggle('nar', !x.who);
    el.querySelector('b').textContent = x.who ? ST.nameOf(x.who) : '';
    el.querySelector('p').textContent = txt;
    if (x.who) drawPic(el.querySelector('canvas'), ST.artOf(x.who, G.g));
    el.classList.add('on');
    talkUntil = clock + clamp(1400 + txt.length * 55, 2200, 4200);
  }
  // 초상 (배경을 지운 그림을 캔버스에 맞춰 넣어요 · 아직 못 읽었으면 읽고 나서 그려요)
  function drawPic(c, id, top) {
    if (!c || !id) return;
    const g = c.getContext('2d');
    c.dataset.id = id;
    const put = () => {
      if (c.dataset.id !== id) return;
      const sp = Art.sprite(id);
      g.clearRect(0, 0, c.width, c.height);
      if (!sp) return;
      const k = Math.max(c.width / sp.width, c.height / sp.height) * (top ? 1 : 1.02);
      const w = sp.width * k; const h = sp.height * k;
      g.drawImage(sp, (c.width - w) / 2, top ? 0 : (c.height - h) * 0.3, w, h);
    };
    if (Art.get(id)) put(); else Art.load(id).then(put);
  }

  /* ================================================================
     처음 화면 · 선장 고르기
     ================================================================ */
  function showTitle() {
    G.token++;
    G.scene = null;
    setBg('bg_harbor', 0.55, true);
    setWeather('petals');
    setMode('title');
    const m = Meta.get();
    $('rec').textContent = m.loop > 1 || m.clears
      ? `지금 ${m.loop}회차${m.stars ? ' · ★' + m.stars : ''} · 기억 조각 ${m.shards}${m.clears ? ' · 클리어 ' + m.clears + '번' : ''}`
      : '처음 출항해요';
    const sv = m.stats || {};
    if (S.STAT_KEYS.some((k) => sv[k] > S.SD.base)) $('rec').textContent += ' · ' + S.STAT_KEYS.map((k) => S.STAT_NAME[k] + ' ' + sv[k]).join(' · ');
    document.querySelectorAll('.hero').forEach((b) => {
      b.classList.toggle('on', !!SAVE.g && b.dataset.g === G.g);
      drawPic(b.querySelector('canvas'), 'c_hero_' + b.dataset.g, true);
    });
    if (AUTO) after(400, () => pickHero(Q.get('g') === 'f' ? 'f' : 'm'));
  }
  function pickHero(g) {
    if (G.mode !== 'title') return;
    G.g = g === 'f' ? 'f' : 'm';
    SAVE.g = G.g; saveSave();
    sndCard(); vib(20);
    const m = Meta.get();
    if (m.loop <= 1 && !m.deaths && !m.clears) playScene(ST.OPENING, { auto: true, skip: true, onDone: startRun });
    else playScene(ST.harborBeats(m.loop), { auto: false, skip: true, onDone: startRun });
  }

  /* ================================================================
     이야기 장면 (오프닝 · 회귀 뒤 항구 · 클리어) — 누르면 넘어가요 · 오프닝은 저절로
     ================================================================ */
  function playScene(beats, o) {
    G.token++;
    G.scene = { beats, i: -1, o: o || {}, b: null, t: 0, typed: 0, full: '' };
    $('banner').classList.remove('on'); bannerT = 0;
    setMode('scene');
    nextBeat();
  }
  const FX_WEATHER = { sink: 'storm', rewind: 'storm', petals: 'petals', bori: 'petals', compass: 'petals', stars: 'night', newstar: 'night', smoke: 'night', end: 'night' };
  function nextBeat() {
    const sc = G.scene;
    if (!sc) return;
    sc.i++;
    if (sc.i >= sc.beats.length) { endScene(); return; }
    const b = sc.beats[sc.i];
    sc.b = b; sc.t = 0; sc.typed = 0; sc.full = ST.sayText(b.text, G.g);
    setBg(b.bg, b.focus == null ? 0.5 : b.focus, false);
    setWeather(FX_WEATHER[b.fx] || (b.bg === 'bg_harbor' ? 'petals' : b.bg === 's_clear' ? 'night' : 'none'));
    const say = $('say');
    say.classList.toggle('nar', !b.who);
    say.classList.toggle('endcard', !!b.end);
    $('sayNext').textContent = b.end ? '▼ 눌러서 정산으로' : '▼ 눌러서 계속';
    if (b.who) {
      const c = ST.CHAR[b.who];
      $('sayName').innerHTML = '';
      $('sayName').append(c.name);
      if (c.role) { const s = document.createElement('small'); s.textContent = c.role; $('sayName').append(s); }
      drawPic($('sayPic'), ST.artOf(b.who, G.g));
    }
    $('sayText').textContent = '';
    if (b.fx === 'sink') { sndThunder(0.1); fx.skyFlash = 1; vib(60); }
    if (b.fx === 'rewind') { sndRewind(2.4); bubbleBurst(50); }
    if (b.fx === 'compass' || b.fx === 'newstar') sndChing(7, true);
    if (b.who === 'bori') sndMeow();
    if (b.fx === 'end') sndTitle(true);
  }
  function endScene() {
    const sc = G.scene;
    if (!sc) return;
    G.scene = null;
    if (sc.o.onDone) sc.o.onDone();
  }
  function updateScene(dt) {
    const sc = G.scene;
    if (!sc || !sc.b || G.mode !== 'scene') return;
    sc.t += dt;
    if (sc.typed < sc.full.length) {
      sc.typed = Math.min(sc.full.length, sc.typed + dt * 0.04);
      $('sayText').textContent = sc.full.slice(0, Math.floor(sc.typed));
    } else if (sc.o.auto || AUTO) {
      if (sc.t >= (sc.o.auto ? (sc.b.ms || 2800) : 900)) nextBeat();
    }
  }
  function tapScene() {
    const sc = G.scene;
    if (!sc || !sc.b || sc.t < 150) return;
    if (sc.typed < sc.full.length) { sc.typed = sc.full.length; $('sayText').textContent = sc.full; } else nextBeat();
  }

  /* ================================================================
     한 판 (방 1~5 + 보스)
     ================================================================ */
  function startRun() {
    G.token++;
    G.meta = Meta.get();
    const hero = S.makeHero({ id: 'me', name: '선장', kind: 'me', meta: S.heroMeta(G.meta), mem: G.meta.mem });
    if (AUTO) { hero.kind = 'bot'; hero.brain = S.makeBrain(AUTO, 99 + G.meta.loop); }
    const W = S.makeWorld({ t: 0, seed: 1 + Math.floor(Math.random() * 2e9), loop: G.meta.loop, stars: G.meta.stars, heroes: [hero], cannon: true });
    G.W = W; G.hero = hero; G.ending = null; G.foe = null; G.rw = null; G.white = 0;
    G.sink = null; G.fired = {}; G.kong = { spot: ST.kongSpot(G.meta.loop), found: 0 }; G.bori.react = -1e9; G.bori.hintAt = clock + 2500;
    chain = 0; tut = null; simAcc = 0;
    resetFx(); updateStreak();
    talkQ.length = 0; talkUntil = 0;
    setMode('play');
    enterRoom(0, true);
    $('loopChip').textContent = `${G.meta.loop}회차${G.meta.stars ? ' ★' + G.meta.stars : ''}`;
    hudLast.sh = -1;
    view = snap();
  }
  function enterRoom(i, first) {
    G.room = i;
    const R = ST.ROOMS[i];
    setBg(R.bg, R.focus, !!first);
    setWeather(R.weather);
    G.tint = R.boss ? 2 : R.weather === 'storm' ? 1 : 0;
    $('where').textContent = R.boss ? `보스 · ${R.name}` : `방 ${i + 1}/5 · ${R.name}`;
    banner(R.boss ? D.enemies.boss.name : `${i + 1}번째 방`, R.boss ? R.name : R.name, 2000, R.boss ? 'huge' : '');
    talk(ST.roomTalk(i, G.meta.loop));
    if (R.boss) { sndThunder(0.2); fx.skyFlash = 1; }
  }
  function setBg(id, focus, instant) {
    if (id === G.bg) { G.focus = focus; return; }
    if (!instant) { G.bgPrev = G.bg; G.focusPrev = G.focus; G.bgFade = 1; } else G.bgFade = 0;
    G.bg = id; G.focus = focus;
  }

  // 지금 sim 을 얼마나 빨리 돌릴지 (세상 멈춤 0.05배 · 컷인 슬로 0.3배 · 쓰러질 때 0.35배)
  function simScale() {
    if (fx.freeze > 0) return 0.05;
    if (fx.cut) return 0.3;
    if (G.ending && !G.ending.clear) return 0.35;
    return 1;
  }
  function updatePlay(dt) {
    const W = G.W;
    if (!W) return;
    if (G.sink) {
      // 격침 장면 동안 sim 은 멈춰요 (카드·스탯 화면은 장면이 끝난 뒤에)
      G.sink.t += dt * SPEED;
      if (G.sink.t >= G.sink.dur) endSink();
      view = snap();
      return;
    }
    if (!(tut && tut.held)) {
      simAcc += dt * simScale() * SPEED;
      let n = 0;
      while (simAcc >= DT && n < 60) {
        if (tut && !tut.done && !tut.held && W.t + DT >= tut.ti - TUT_LEAD) {
          tut.held = true; tut.heldAt = clock; simAcc = 0;
          setTutBtn(tut.c); sndTutHold();
          break;
        }
        S.step(W, DT); simAcc -= DT; n++;
        drain();
        if (G.sink) { simAcc = 0; break; }
      }
      if (n >= 60) simAcc = 0;
    } else if (AUTO && clock - tut.heldAt > 500) onPress(tut.c);
    view = snap();
    shipGuns(view);
    cardsUi();
  }
  // sim 이 내보낸 일 → 효과
  function drain() {
    const W = G.W;
    if (!W || !W.ev.length) return;
    const list = W.ev.splice(0, W.ev.length);
    for (const e of list) {
      if (e.k === 'parry') {
        const a = W.atks.find((x) => x.id === e.a);
        e.n = a ? a.n : 1;
        e.tut = !!(tut && tut.done && tut.a === e.a && e.i === 0 && !tut.fired);
        if (e.tut) tut.fired = true;
      }
      handleEvent(e);
    }
  }
  // 그리기용 한 장면
  function snap() {
    const W = G.W; const hero = G.hero;
    const t = W.t; const E = W.enemy;
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
      t, hits, stun: !!(E && E.stun > t), vuln: !!(E && E.vuln > t),
      ehp: E ? Math.max(0, E.hp) / E.max : 0, hp: hero.hp / hero.st.maxHp, gauge: hero.gauge / S.gaugeMaxOf(W),
      fight: W.phase === 'fight', walk: W.phase === 'walk'
    };
  }

  /* ---------------- 일 → 효과 ---------------- */
  function handleEvent(e) {
    const W = G.W;
    switch (e.k) {
      case 'tele':
        sndWhoosh();
        // 7 첫 패링은 반드시 성공: 1회차 첫 방의 첫 공격
        if (!tut && G.meta.loop === 1 && W.room === 0 && !G.tutDone) {
          const a = W.atks.find((x) => x.id === e.a);
          if (a) { const x = S.hitsOf(a)[0]; tut = { a: a.id, ti: x.ti, c: x.c, held: false, done: false, wrong: 0 }; }
        }
        break;
      case 'judge': onJudge(e); break;
      case 'parry': fxParry(e); break;
      case 'hurt': fxHurt(e); break;
      case 'hit': fxHit(e); break;
      case 'break':
        addPop('끊었다!', '#ffe27a', 1.5, -70);
        burst(L.cx, L.ey, 50, ['#fff', '#ffd25a', '#ff9f43'], 900);
        fx.knockV += 9;
        break;
      case 'chance': addPop('지금이야!', '#ffe27a', 0.95, 52); break;
      case 'stun': if (!G.ending) addPop('휘청!', '#ffe9a0', 0.7, -120); break;
      case 'rage': addPop('폭풍 문어가 화났다!', '#ff6a6a', 1.05, -110); fx.trauma = Math.min(1, fx.trauma + 0.5); fx.skyFlash = 1; sndThunder(0); vib([40, 30, 40]); break;
      case 'spec': addPop('필살!', '#7fe3ff', 1.4, -70); fx.trauma = Math.min(1, fx.trauma + 0.4); vib(60); break;
      case 'specNo': addPop('필살 게이지가 아직이에요', '#aab6cc', 0.55, 70); break;
      case 'volleyNo': addPop('대포 게이지가 아직이에요', '#aab6cc', 0.55, 70); break;
      case 'volley': fxVolley(e); break;
      case 'gaugeFull':
        if (e.cannon) { addPop('대포 장전! 세 버튼 같이 꾹!', '#ffd25a', 0.72, 60); sndNotes([523, 784, 1047], 0.06, 'triangle', 0.14, 0.4); vib([20, 30, 20]); }
        else addPop('필살 준비 · 세 버튼 같이!', '#ffd25a', 0.7, 60);
        break;
      case 'kong': fxKong(e); break;
      case 'fore': addPop('💭 기억났다! 색이 먼저 보여요', '#d7c6ff', 0.6, -150); break;
      case 'dodge': addPop('무적!', '#7fe3ff', 0.7, 30); break;
      case 'lvup': addPop('레벨 업! Lv ' + e.lv, '#9ff0c4', 0.9, -150); sndLvup(); break;
      case 'heal': if (e.n >= 5) addNum(L.cx - L.w * 0.3, L.playH - 70, '+' + e.n, '#7dffb0', 26, ''); break;
      case 'spawn': {
        const d = D.enemies[e.kind];
        G.foe = { kind: e.kind, eid: e.e, born: clock, dead: 0, dir: 1, side: e.e % 2 ? -1 : 1 };
        if (d.ship && !d.mid) { banner('작은 적 범선!', '옆에서 다가와요 · 포탄 색을 봐요', 1500); sndCannon(0.25, true); }
        $('foe').classList.remove('off');
        $('foe').classList.toggle('boss', !!(d.boss || d.mid));
        const nm = $('foeName'); nm.innerHTML = '';
        if (d.mid || d.boss) { const em = document.createElement('em'); em.textContent = d.boss ? '보스' : '중간 보스'; nm.append(em); }
        nm.append(d.name);
        if (d.mid) { banner('중간 보스!', d.name, 2200, 'huge'); talk(ST.MID_TALK); sndThunder(0.1); fx.trauma = Math.min(1, fx.trauma + 0.3); }
        break;
      }
      case 'kill': {
        if (G.foe) { G.foe.dead = clock; G.foe.dir = Math.random() < 0.5 ? -1 : 1; }
        const d = D.enemies[e.kind] || {};
        if (e.sink) { startSink(e); break; }
        sndKung(true);
        burst(L.cx, L.ey, d.boss ? 120 : 60, ['#fff', '#ffd25a', '#ff9f43', '#9fe8ff'], d.boss ? 1400 : 1000);
        wave(L.cx, L.ey, 20, L.S * (d.boss ? 1.2 : 0.7), 600, '#fff6d0', 10);
        fx.trauma = Math.min(1, fx.trauma + (d.boss || d.mid ? 0.8 : 0.4));
        addPop(d.boss || d.mid ? d.name + ' 격파!' : '격파!', '#ffe27a', d.boss || d.mid ? 1.1 : 1.2, -110);
        vib(d.boss || d.mid ? [60, 40, 160] : 40);
        break;
      }
      case 'roomClear': sndCardsIn(); break;
      case 'shell':
        if (e.why === 'kill') addNum(L.w - 60, 70, '+' + e.n + ' 🐚', '#ffe2a8', 22, '');
        if (e.why === 'sink') addNum(L.w - 60, 100, '+' + e.n + ' 🐚', '#ffe2a8', 26, '격침 보너스');
        if (e.why === 'kong') addNum(L.w - 60, 100, '+' + e.n + ' 🐚', '#ffe2a8', 24, '콩게');
        bumpShell();
        break;
      case 'pts': G.ptsKind = e.kind; addPop('스탯 점수 +' + e.n + '!', '#9fd8ff', 0.95, -40); break;
      case 'shop': after(AUTO ? 300 : 700, showShop); break;
      case 'pick': sndCard(); break;
      case 'room': $('foe').classList.add('off'); G.foe = null; enterRoom(e.room, false); break;
      case 'down': sndHurt(); vib([100, 50, 200]); break;
      case 'wipe': endRun(false); break;
      case 'clear': endRun(true); break;
      default: break;
    }
  }
  const FAIL_TXT = { early: ['빨라요!', '#ffb347'], late: ['늦어요!', '#7fc8ff'], color: ['색이 달라요!', '#ff7ae0'], miss: ['놓쳤어요!', '#c9d1e0'] };
  function onJudge(e) {
    const f = FAIL_TXT[e.r];
    if (!f) return;
    if (e.r === 'late') fx.pops = fx.pops.filter((p) => p.txt !== FAIL_TXT.miss[0]);
    addPop(f[0], f[1], 1.25, 0, true);
    chain = 0; updateStreak();
    if (e.r === 'early' || e.r === 'color') sndFail();
  }
  function fxParry(e) {
    const strong = !!e.strong;
    const cut = strong || (e.final && (e.n || 1) > 1) || e.tut;
    chain++; updateStreak();
    const fz = TUNE.freeze * (strong ? 1.4 : 1);
    // 1 세상 멈춤 · 황금빛
    fx.freeze = fz; fx.gold = 1; fx.goldK = strong ? 1.25 : 1;
    // 4 카메라: 흰 번쩍임 → 반전 프레임 · 펀치 줌 · 기울기
    fx.flashF = TUNE.flash ? 2 : 0;
    fx.zoom = TUNE.zoom * (strong ? 1.6 : 1);
    fx.tilt = (Math.random() < 0.5 ? -1 : 1) * (strong ? 0.055 : 0.032);
    fx.trauma = Math.min(1, fx.trauma + (strong ? 0.3 : 0.18));
    // 2 소리 빼기 · 6 칭 반음씩 올라가요
    duck(fz / 1000, strong);
    sndChing(Math.min(12, chain - 1), strong);
    // 3 진동
    vib(strong ? [80, 40, 180] : 38);
    // 5 불꽃 · 충격파 · 칼빛
    const col = COL[e.c] ? COL[e.c].hex : '#fff';
    burst(L.cx, L.jy, strong ? 80 : 46, ['#fff', '#ffe9a0', '#ffd25a', col], strong ? 1100 : 820);
    wave(L.cx, L.jy, L.rj * 0.9, L.rj * (strong ? 5 : 3.6), 420, '#fff6d0', strong ? 9 : 6);
    wave(L.cx, L.jy, L.rj * 0.7, L.rj * 2.6, 300, col, 4);
    fx.slashes.push({ x: L.cx, y: L.jy, a: rnd(-0.9, -0.5), len: L.w * (strong ? 1.25 : 0.95), w: strong ? 16 : 11, life: 0, max: 300, c: '#ffffff' });
    const cmTxt = e.cm > 1 ? ' · 피해 ×' + e.cm.toFixed(2).replace(/0$/, '') : '';
    if (chain >= 2) addPop('x' + chain + cmTxt, '#ffd25a', 0.8 + Math.min(chain, 8) * 0.12, 0, false, L.rj + 46);
    if (isShip()) shootDown(e);
    fx.cutPending = cut ? {
      text: strong ? '강반격!' : '패링!',
      sub: strong ? '우리 대포 발사! · 연속 ' + (e.streak || 3) + '번 · 반격 ×5' + cmTxt : (e.tut ? '첫 패링 성공! 바람이 멈췄다' : '폭풍이 멈췄다'),
      strong, img: strong ? 'fx_parry_cutin_' + G.g : ''
    } : null;
    if (strong) onStrong(e);
  }
  // 강반격 = 우리 배 대포 한 발 (연출만 · 피해는 sim 의 strong 그대로)
  //   패링 멈춤(약 0.4초) 뒤 반격이 닿을 때쯤 포탄이 적에 닿도록 조금 늦게 쏴요
  function onStrong() {
    G.gunSide = -G.gunSide;
    const x = L.w * (G.gunSide < 0 ? 0.13 : 0.87);
    fireGun(x, L.playH - 30, 230, 330, true);
    boriReact();
  }
  // 우리 대포 한 문: delay 뒤 쏘고 dur 동안 날아가 적에 닿아요
  function fireGun(x, y, delay, dur, big) {
    if (fx.guns.length >= CAP.gun) fx.guns.shift();
    const box = curFoeBox();
    fx.guns.push({ x, y, t: -(delay || 0), dur: dur || 320, big: !!big, tx: box.cx + rnd(-0.18, 0.18) * box.w, ty: box.cy + rnd(-0.12, 0.2) * box.h, fired: false, hit: false });
  }
  // 일제 사격: 난간을 따라 대포 여섯 문이 차례로
  function fxVolley() {
    banner('일제 사격!', '대포 여섯 문, 발사!', 1400, 'huge');
    const n = 6;
    for (let i = 0; i < n; i++) fireGun(L.w * (0.08 + (0.84 * i) / (n - 1)), L.playH - 28, i * 60, 300 + i * 12, true);
    fx.trauma = Math.min(1, fx.trauma + 0.5);
    fx.zoom = TUNE.zoom * 1.2;
    duck(0.5, true);
    vib([50, 30, 50, 30, 50, 30, 120]);
    boriReact();
  }
  // 적 배의 색 포탄을 공중에서 격추 ("펑!")
  function shootDown() {
    const x = L.cx; const y = L.jy - L.rj * 1.1;
    addBoom(x, y, L.rj * 1.5, 380);
    burst(x, y, 34, ['#fff', '#ffcf6b', '#ff8a3d', '#5b4a3a'], 950);
    for (let i = 0; i < 8; i++) addPuff(x + rnd(-14, 14), y + rnd(-10, 10), rnd(-90, 90), rnd(-120, -20), rnd(10, 18), 'rgba(90,86,84,');
    addPop('펑!', '#ffb347', 1.35, -L.rj - 10, false, rnd(-30, 30));
    sndPop();
  }
  function fxHit(e) {
    const k = e.kind;
    const x = L.cx + rnd(-0.14, 0.14) * L.S;
    const y = L.ey - L.S * rnd(-0.05, 0.12);
    if (k === 'volley') {
      // 일제 사격이 닿았어요: 큰 폭발 여러 개 · 적이 크게 휘청
      sndKung(true); sndCannon(0.9, false);
      fx.knockV += 22; fx.knockDir = Math.random() < 0.5 ? -1 : 1; fx.eFlash = 1;
      fx.trauma = 1;
      const box = curFoeBox();
      for (let i = 0; i < 6; i++) addBoom(box.cx + rnd(-0.3, 0.3) * box.w, box.cy + rnd(-0.25, 0.25) * box.h, L.S * rnd(0.12, 0.22), 520 + i * 40);
      burst(x, y, 70, ['#fff', '#ffd25a', '#ff8a3d', '#ff5a3d'], 1200);
      wave(x, y, 10, L.S * 0.9, 520, '#ffe9a0', 10);
      addNum(x, y, e.dmg, '#ff6a3d', 66, '일제 사격');
      return;
    }
    if (k === 'counter' || k === 'strong') {
      const big = k === 'strong';
      sndKung(big);
      fx.knockV += big ? 18 : 7.5; fx.knockDir = Math.random() < 0.5 ? -1 : 1;
      if (big) { addBoom(x, y, L.S * 0.2, 480); addPop('쾅!', '#ffb347', 1.5, -150); }
      fx.eFlash = 1;
      fx.trauma = Math.min(1, fx.trauma + (big ? 0.95 : 0.6));
      burst(x, y, big ? 40 : 24, ['#fff', '#ffd25a', '#9fe8ff'], big ? 800 : 600);
      wave(x, y, 10, L.S * (big ? 0.55 : 0.38), 360, '#ffe9a0', big ? 7 : 5);
      if (G.weather === 'storm') sprayBurst(L.cx, L.water, big ? 18 : 10);
      fx.slashes.push({ x, y, a: rnd(0.4, 0.8) * (Math.random() < 0.5 ? 1 : -1), len: L.S * (big ? 0.95 : 0.7), w: big ? 14 : 9, life: 0, max: 260, c: '#ffffff' });
      addNum(x, y, e.dmg, big ? '#ff6a3d' : '#ffd25a', big ? 58 : 44, big ? '강반격' : (e.crit ? '치명!' : '반격'));
      if (big) vib([30, 30, 60]);
    } else if (k === 'spec' || k === 'specEnd') {
      sndKung(k === 'specEnd');
      fx.knockV += k === 'specEnd' ? 8 : 3; fx.eFlash = 0.8;
      burst(x, y, 20, ['#7fe3ff', '#fff'], 700);
      addNum(x, y, e.dmg, '#7fe3ff', k === 'specEnd' ? 50 : 34, '');
    } else {
      const big = k === 'c3';
      sndTick(big);
      fx.squash = big ? 0.9 : 0.5; fx.eFlash = Math.max(fx.eFlash, big ? 0.6 : 0.35);
      if (big) fx.trauma = Math.min(1, fx.trauma + 0.12);
      fx.slashes.push({ x, y, a: rnd(-1.2, 1.2), len: L.S * (big ? 0.42 : 0.28), w: big ? 6 : 4, life: 0, max: 180, c: '#eaf6ff' });
      burst(x, y, big ? 10 : 5, ['#fff', '#cfe8ff'], 420);
      addNum(x, y, e.dmg, '#ffffff', big ? 28 : 22, e.crit ? '치명!' : '');
    }
  }
  function fxHurt(e) {
    fx.hurtV = 1; fx.redF = 1;
    fx.trauma = Math.min(1, fx.trauma + 0.7);
    fx.zoom = TUNE.zoom * 0.8;
    sndHurt();
    vib([60, 30, 90]);
    chain = 0; updateStreak();
    addPop('-' + e.dmg, '#ff5a6a', 0.9, 0, false, 0, L.playH - 40);
  }
  function burst(x, y, n, cols, sp) {
    for (let i = 0; i < n; i++) {
      if (fx.sparks.length >= CAP.spark) fx.sparks.shift();
      const a = Math.random() * Math.PI * 2; const v = rnd(0.25, 1) * sp;
      fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(260, 620), c: cols[i % cols.length], w: rnd(1.6, 3.6) });
    }
  }
  function wave(x, y, r0, r1, max, c, w) { if (fx.waves.length >= CAP.wave) fx.waves.shift(); fx.waves.push({ x, y, r0, r1, life: 0, max, c, w }); }
  function addNum(x, y, v, c, size, sub) { if (fx.nums.length >= CAP.num) fx.nums.shift(); fx.nums.push({ x, y, vy: -60, txt: String(v), c, size, sub, life: 0, max: 900 }); }
  function addPop(txt, c, scale, dy, shake, dx, yAbs) {
    if (fx.pops.length >= CAP.pop) fx.pops.shift();
    fx.pops.push({ txt, c, s: scale || 1, dy: dy || 0, dx: dx || 0, yAbs: yAbs || 0, shake: !!shake, life: 0, max: 820 });
  }
  function updateStreak() {
    const el = $('streak'); const n = $('streakN');
    if (chain >= 2) {
      el.classList.add('on');
      n.textContent = 'x' + chain;
      n.style.fontSize = (26 + 2.5 * Math.min(chain, 8)) + 'px';
      if (n.animate) n.animate([{ transform: 'scale(1.7) rotate(-6deg)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,1.7,.4,1)' });
    } else el.classList.remove('on');
  }
  function setTutBtn(c) {
    Object.keys(btnEls).forEach((k) => { btnEls[k].classList.toggle('tut', k === c); btnEls[k].classList.toggle('dimmed', !!c && k !== c); });
  }
  function resetFx() {
    fx.freeze = 0; fx.gold = 0; fx.flashF = 0; fx.zoom = 0; fx.tilt = 0; fx.trauma = 0; fx.hurtV = 0; fx.redF = 0;
    fx.knock = 0; fx.knockV = 0; fx.eFlash = 0; fx.squash = 0; fx.cut = null; fx.cutPending = null; fx.rush = 0;
    fx.sparks.length = 0; fx.waves.length = 0; fx.slashes.length = 0; fx.nums.length = 0; fx.pops.length = 0;
  }

  /* ---------------- 카드 고르기 ---------------- */
  // 1장에서는 필살 대신 대포 게이지 · 일제 사격이라 카드 말만 바꿔요 (효과 숫자는 같아요)
  const CARD_TXT = {
    charge: { name: '대포 충전', desc: '대포 게이지가 30% 빨리 차요' },
    nova: { name: '대포 강화', desc: '일제 사격 피해 +35%' }
  };
  function cardsUi() {
    const W = G.W; const h = G.hero;
    const el = $('cards');
    if (W.phase === 'cards' && h.pts > 0 && !G.ending) { el.classList.add('hide'); G.cardsKey = ''; showStats(G.ptsKind || 'caravel', null); return; }
    if (!(W.phase === 'cards' && h.cards && !G.ending)) { if (!el.classList.contains('hide')) el.classList.add('hide'); G.cardsKey = ''; return; }
    const key = h.cards.join(',') + ':' + h.rerolled;
    if (key === G.cardsKey) return;
    G.cardsKey = key; G.cardsAt = clock;
    const row = $('cardRow'); row.innerHTML = '';
    h.cards.forEach((id, i) => {
      const c = S.CARD[id];
      const b = document.createElement('button');
      b.className = 'card c-' + c.c; b.dataset.slot = i;
      const lv = h.upg[id] || 0;
      const ov = CARD_TXT[id] || {};
      const nb = document.createElement('b'); nb.textContent = ov.name || c.name;
      const sm = document.createElement('small'); sm.textContent = ov.desc || c.desc;
      const it = document.createElement('i'); it.textContent = id === 'potion' ? '바로 써요' : `Lv ${lv + 1} / ${c.max}`;
      b.append(nb, sm, it);
      row.append(b);
    });
    const rr = $('reroll');
    rr.classList.toggle('hide', !(h.rerolls > 0));
    rr.textContent = `다시 뽑기 (${h.rerolls})`;
    el.classList.remove('hide');
  }
  function pickSlot(i) {
    const W = G.W; const h = G.hero;
    if (!h.cards || clock - G.cardsAt < CARD_GUARD) return;
    const b = $('cardRow').children[i];
    if (b) { b.classList.remove('pick'); void b.offsetWidth; b.classList.add('pick'); }
    S.pickCard(W, h, i);
    vib(25);
    drain();
  }

  /* ---------------- 끝 → 회귀 ---------------- */
  function endRun(clear) {
    if (G.ending) return;
    const W = G.W;
    G.ending = { clear, at: clock };
    setTutBtn(null);
    if (clear) {
      // 문어 스탯 점수는 클리어 장면 뒤에 나누고 → 그다음 정산 (나눈 점수도 50% 이월돼요)
      fx.gold = 1; fx.goldK = 1.3; fx.freeze = 500;
      sndTitle(true); vib([80, 40, 80, 40, 240]);
      banner(D.enemies.boss.name + ' 격파!', '폭풍이 걷혀요…', 2600, 'huge');
      const fin = () => { settleRun(true, W); showInn(true); };
      after(2800, () => playScene(ST.CLEAR, { auto: false, skip: true, onDone: () => { if (G.hero.pts > 0) showStats('boss', fin); else fin(); } }));
    } else {
      settleRun(clear, W);
      banner('배가 가라앉아요…', '', 1500);
      after(1500, rewindSeq);
    }
  }
  // 정산 (다음 단계: 조개 돈 0 · 장비 0 · 스탯 50% 이월을 여기서 함께 계산해요)
  function settleRun(clear, W) {
    G.res = Meta.regress({ reached: W.room + 1, clear, hero: G.hero, ms: W.t });
  }
  // 별나침반 되감기 → "제 N회차 회귀!" → 여관
  function rewindSeq() {
    G.token++;
    G.rw = { t: 0, dur: 2600 };
    setMode('rewind');
    bubbleBurst(70);
    sndRewind(2.5);
    vib([40, 40, 40, 40, 120]);
    after(2600, () => showInn(false));
  }

  /* ================================================================
     여관 정산 (s_inn)
     ================================================================ */
  function showInn(clear) {
    G.token++;
    const r = G.res;
    const m = Meta.get();
    setBg('s_inn', 0.45, true);
    setWeather('none');
    G.white = 1;
    setMode('inn');
    // "제 N회차 회귀!" 큰 글자 먼저 → 1.8초 뒤 정산
    const inn = $('inn');
    inn.style.visibility = 'hidden';
    banner(clear ? '1장 클리어!' : `제 ${m.loop}회차 회귀!`, clear ? `★${m.stars} · 별나침반이 새 아침을 열어요` : '별나침반이 그날 아침으로 되돌렸어요', 1800, 'huge');
    sndTitle(clear); vib(120);
    G.innReadyAt = clock + (AUTO ? 600 : 1800);
    after(AUTO ? 600 : 1800, () => { inn.style.visibility = ''; });
    $('innTitle').textContent = clear ? '1장 클리어!' : `제 ${m.loop}회차`;
    $('innSub').textContent = clear ? '폭풍을 넘었어요. 기억은 그대로, 다시 꽃비 항구에서.' : '여관에서 숨을 고르고, 기억을 정리해요';
    const box = $('lines'); box.innerHTML = '';
    (r ? r.lines : []).forEach((l, i) => {
      const d = document.createElement('div');
      d.className = 'ln ' + l.k;
      d.style.animationDelay = (0.25 + i * 0.18) + 's';
      const a = document.createElement('span'); a.textContent = l.label;
      const b = document.createElement('b');
      b.textContent = l.k === 'xp' ? `×${l.from.toFixed(2)} → ×${l.to.toFixed(2)}` : l.text != null ? l.text : (l.pre || '') + l.val;
      if (l.k === 'fore' && l.isNew) b.textContent += ' (새로!)';
      d.append(a, b);
      box.append(d);
    });
    const it = $('innTalk');
    const tl = ST.innLine(m.loop);
    if (tl && !clear) {
      it.classList.remove('hide');
      it.querySelector('b').textContent = ST.nameOf(tl.who);
      it.querySelector('p').textContent = ST.sayText(tl.text, G.g);
      drawPic(it.querySelector('canvas'), ST.artOf(tl.who, G.g));
    } else it.classList.add('hide');
    $('innPal').textContent = clear ? '보리가 선장 곁에서 골골송을 불러요' : '보리가 선장 곁에 웅크려 꼬리로 토닥여요';
    renderNodes();
    $('innGo').textContent = '출항!';
    if (AUTO) after(1500, depart);
  }
  function renderNodes() {
    const m = Meta.get();
    $('shards').textContent = '기억 조각 ' + m.shards;
    const row = $('nodeRow'); row.innerHTML = '';
    D.meta.nodes.forEach((n) => {
      const lv = m.nodes[n.id] || 0;
      const cost = Meta.cost(n.id);
      const b = document.createElement('button');
      b.className = 'node c-' + n.c; b.dataset.node = n.id;
      b.disabled = cost == null;
      const nb = document.createElement('b'); nb.textContent = n.name;
      const sm = document.createElement('small'); sm.textContent = n.desc;
      const it = document.createElement('i'); it.textContent = '●'.repeat(lv) + '○'.repeat(n.max - lv) + (cost == null ? ' 완성' : ` · ${cost}조각`);
      b.append(nb, sm, it);
      row.append(b);
    });
  }
  function buyNode(id) {
    if (clock < G.innReadyAt) return;
    const b = $('nodeRow').querySelector(`[data-node="${id}"]`);
    if (Meta.buy(id)) { sndBuy(); vib(30); renderNodes(); const nb = $('nodeRow').querySelector(`[data-node="${id}"]`); if (nb) nb.classList.add('buy'); }
    else if (b) { sndFail(); b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); }
  }
  function depart() {
    if (G.mode !== 'inn' || clock < G.innReadyAt) return;
    if (AUTO) autoNodes();
    beforeDepart();
    playScene(ST.harborBeats(Meta.get().loop), { auto: false, skip: true, onDone: startRun });
  }
  // 출항 전 (항구 장면 앞 · 지금은 할 일 없음 — 상점은 부두 방을 지난 뒤에 열려요)
  function beforeDepart() { /* 다음 단계 자리 */ }
  // 자동 플레이어: 기억의 나무를 싼 것부터 (시험 harness 와 같은 규칙)
  function autoNodes() {
    for (let k = 0; k < 20; k++) {
      let best = null;
      ['hp', 'combo', 'reroll'].forEach((id) => { const c = Meta.cost(id); if (c != null && c <= Meta.get().shards && (!best || c < best.c)) best = { id, c }; });
      if (!best || !Meta.buy(best.id)) return;
    }
  }

  /* ================================================================
     부두 상점 (s_shop) — 부두 방(1번 방)을 지나고 출항 전에 · 규칙은 sim.js (buyGear)
     ================================================================ */
  function showShop() {
    const W = G.W; const h = G.hero;
    if (!W || W.phase !== 'shop' || G.mode !== 'play') return;
    G.shopPrev = { bg: G.bg, focus: G.focus, weather: G.weather };
    setBg('s_shop', 0.5, false);
    setWeather('petals');
    fx.nums.length = 0; fx.pops.length = 0;
    setMode('shop');
    G.shopAt = clock;
    sndCardsIn();
    const tl = ST.shopLine(G.meta.loop);
    const box = $('shopTalk');
    if (tl) {
      box.classList.remove('hide');
      box.querySelector('b').textContent = ST.nameOf(tl.who);
      box.querySelector('p').textContent = ST.sayText(tl.text, G.g);
      drawPic(box.querySelector('canvas'), ST.artOf(tl.who, G.g));
    } else box.classList.add('hide');
    renderShop();
    if (AUTO) after(900, () => { S.botShop(h); renderShop(); after(700, leaveShop); });
  }
  function renderShop() {
    const h = G.hero;
    if (!h) return;
    $('purse').textContent = '🐚 ' + h.shell;
    [['w', 'wRow', 'wNow', S.EC.weapons], ['a', 'aRow', 'aNow', S.EC.armors]].forEach(([slot, rowId, nowId, list]) => {
      const cur = S.GEAR[h.gear[slot]];
      $(nowId).textContent = cur ? '지금: ' + cur.name : '지금: 없음';
      const row = $(rowId); row.innerHTML = '';
      list.forEach((g) => {
        const b = document.createElement('button');
        const on = h.gear[slot] === g.id;
        const lower = cur && S.GEAR[g.id].tier <= cur.tier && !on;
        const can = S.canBuy(h, g.id);
        b.className = 'item' + (on ? ' on' : '') + (can ? ' can' : '');
        b.dataset.id = g.id;
        b.disabled = !can;
        const nb = document.createElement('b'); nb.textContent = g.name;
        const sm = document.createElement('small'); sm.textContent = g.desc;
        const it = document.createElement('i'); it.textContent = on ? '착용 중' : lower ? '더 좋은 것 있음' : '🐚 ' + g.price;
        b.append(nb, sm, it);
        row.append(b);
      });
    });
  }
  function buyItem(id) {
    const h = G.hero;
    if (G.mode !== 'shop' || clock - G.shopAt < 400) return;
    if (S.buyGear(h, id)) {
      sndBuy(); vib(30);
      renderShop();
      const b = document.querySelector(`.item[data-id="${id}"]`);
      if (b) b.classList.add('buy');
      bumpShell();
    } else { sndFail(); const pu = $('purse'); pu.classList.remove('nope'); void pu.offsetWidth; pu.classList.add('nope'); }
  }
  function leaveShop() {
    const W = G.W; const h = G.hero;
    if (G.mode !== 'shop' || !W) return;
    S.leaveShop(W, h);
    sndCard(); vib(20);
    const pv = G.shopPrev || {};
    setBg(pv.bg || 'bg_harbor', pv.focus == null ? 0.55 : pv.focus, false);
    setWeather(pv.weather || 'petals');
    setMode('play');
    hudLast.sh = -1;
    banner('출항!', h.gear.w || h.gear.a ? [S.GEAR[h.gear.w], S.GEAR[h.gear.a]].filter(Boolean).map((g) => g.name).join(' · ') : '', 1600);
  }

  /* ================================================================
     스탯 점수 나누기 (보스 · 중간 보스를 잡은 뒤) — 규칙은 sim.js (spendPt)
     ================================================================ */
  const STAT_COL = { str: 'r', agi: 'g', vit: 'b' };
  const STAT_HOW = { str: '반격·강반격이 세져요', agi: '패링 판정이 조금 넉넉해져요', vit: '최대 체력이 늘어요' };
  function showStats(kind, onDone) {
    const h = G.hero;
    if (!h || G.mode === 'stats') return;
    fx.nums.length = 0; fx.pops.length = 0;
    G.stat = { kind, onDone, snap: { stats: Object.assign({}, h.stats), pts: h.pts, hp: h.hp }, at: clock };
    setMode('stats');
    $('statTitle').textContent = `스탯 점수 +${h.pts}!`;
    $('statSub').textContent = ST.STAT_SUB[kind] || '';
    $('statNote').textContent = `회귀하면 이번에 오른 만큼의 절반이 남아요 (예: 힘 10 → 20 이면 15) · 민첩은 판정 +${S.SD.agiCap}ms 까지만`;
    sndLvup(); vib([40, 30, 80]);
    renderStats();
    if (AUTO) after(800, () => { S.botStats(h); renderStats(); after(600, doneStats); });
  }
  function renderStats() {
    const h = G.hero;
    $('ptsN').textContent = h.pts;
    const rows = $('statRows'); rows.innerHTML = '';
    S.STAT_KEYS.forEach((k) => {
      const v = h.stats[k];
      const d = document.createElement('div');
      d.className = 'srow c-' + STAT_COL[k]; d.dataset.k = k;
      const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = S.STAT_NAME[k];
      const vl = document.createElement('div'); vl.className = 'val'; vl.textContent = v;
      const ef = document.createElement('div'); ef.className = 'ef';
      ef.textContent = S.statText(k, v);
      const sm = document.createElement('small');
      const capped = k === 'agi' && S.statEffect('agi', v) >= S.SD.agiCap;
      sm.textContent = capped ? '이미 최대예요 · 다른 곳에 써요' : `+1 → ${S.statText(k, v + 1)} · ${STAT_HOW[k]}`;
      ef.append(sm);
      const b = document.createElement('button');
      b.textContent = '+'; b.dataset.k = k; b.disabled = !(h.pts > 0) || capped;
      b.setAttribute('aria-label', S.STAT_NAME[k] + ' 올리기');
      d.append(nm, vl, ef, b);
      rows.append(d);
    });
    $('statGo').disabled = h.pts > 0;
    $('statGo').style.opacity = h.pts > 0 ? 0.45 : 1;
    $('statUndo').classList.toggle('hide', !G.stat || h.pts === G.stat.snap.pts);
  }
  function addStat(k) {
    const h = G.hero;
    if (G.mode !== 'stats' || !G.stat || clock - G.stat.at < 300) return;
    if (k === 'agi' && S.statEffect('agi', h.stats.agi) >= S.SD.agiCap) { sndFail(); return; }
    if (!S.spendPt(h, k)) { sndFail(); return; }
    sndBuy(); vib(25);
    renderStats();
    const r = $('statRows').querySelector(`[data-k="${k}"]`);
    if (r) r.classList.add('up');
  }
  function undoStats() {
    const h = G.hero; const st = G.stat;
    if (!st || G.mode !== 'stats') return;
    h.stats = Object.assign({}, st.snap.stats); h.pts = st.snap.pts;
    S.refresh(h); h.hp = Math.min(h.st.maxHp, st.snap.hp);
    sndCard(); renderStats();
  }
  function doneStats() {
    const h = G.hero; const st = G.stat;
    if (!st || G.mode !== 'stats' || h.pts > 0) return;
    G.stat = null;
    sndCard(); vib(20);
    if (st.onDone) { st.onDone(); return; }
    setMode('play');
    hudLast.ht = '';
  }

  /* ================================================================
     효과 한 걸음 — fdt: 효과 시각 · wdt: 세상 시각(멈춤 땐 0)
     ================================================================ */
  function updateFx(fdt) {
    if (fx.freeze > 0) {
      fx.freeze -= fdt;
      if (fx.freeze <= 0) { fx.freeze = 0; fx.rush = 230; if (fx.cutPending) startCut(); }
    } else if (fx.cutPending) startCut();
    if (fx.freeze <= 0) fx.gold = Math.max(0, fx.gold - fdt / 200);
    const held = tut && tut.held;
    const ws = fx.freeze > 0 ? 0 : (fx.rush > 0 ? 2.1 : 1) * (fx.cut ? 0.35 : 1) * (held ? 0.18 : 1);
    fx.rush = Math.max(0, fx.rush - fdt);
    const wdt = fdt * ws;
    fx.wt += wdt;
    fx.zoom *= Math.exp(-wdt / 170);
    fx.tilt *= Math.exp(-wdt / 210);
    fx.trauma = Math.max(0, fx.trauma - wdt * 0.0019);
    fx.hurtV = Math.max(0, fx.hurtV - fdt / 480);
    fx.redF = Math.max(0, fx.redF - fdt / 120);
    fx.eFlash = Math.max(0, fx.eFlash - wdt / 160);
    fx.squash = Math.max(0, fx.squash - wdt / 170);
    let rem = wdt / 1000;
    while (rem > 0) {
      const s = Math.min(rem, 0.008); rem -= s;
      const a = -150 * fx.knock - 12 * fx.knockV;
      fx.knockV += a * s; fx.knock += fx.knockV * s;
    }
    if (fx.cut) { fx.cut.t += fdt; if (fx.cut.t >= fx.cut.dur) fx.cut = null; }
    // 번개 (폭풍일 때만)
    if (G.weather === 'storm') {
      fx.nextBolt -= wdt;
      if (fx.nextBolt <= 0) {
        fx.nextBolt = rnd(3800, 8500);
        const x = rnd(L.w * 0.08, L.w * 0.92);
        const pts = []; let y = 0; let xx = x; const hz = L.playH * 0.42;
        while (y < hz) { pts.push([xx, y]); y += rnd(14, 34); xx += rnd(-26, 26); }
        fx.bolt = { pts, t: 0, dur: 170 };
        fx.skyFlash = 1;
        sndThunder(rnd(0.25, 0.9));
      }
    }
    if (fx.bolt) { fx.bolt.t += wdt; if (fx.bolt.t > fx.bolt.dur) fx.bolt = null; }
    fx.skyFlash = Math.max(0, fx.skyFlash - wdt / 260);
    G.bgFade = Math.max(0, G.bgFade - fdt / 700);
    G.white = Math.max(0, G.white - fdt / 900);
    if (G.weather === 'night' && Math.random() < fdt / 1400 && P.shoot.length < 3) P.shoot.push({ x: rnd(0.2, 1.1) * L.w, y: rnd(0.02, 0.3) * L.h, t: 0, dur: rnd(600, 1000), len: rnd(80, 160) });
    if (G.scene && G.scene.b && G.scene.b.fx === 'smoke' && Math.random() < fdt / 160) P.smoke.push({ x: L.w * 0.8 + rnd(-6, 6), y: L.h * 0.5, vy: rnd(14, 28), r: rnd(6, 12), life: 0, max: rnd(4, 6) });
    if (G.mode === 'rewind' && Math.random() < fdt / 40) bubbleBurst(1);
    if (G.rw) G.rw.t += fdt;
    updateWeather(wdt);
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
    updateGuns(fdt);
  }
  function updateGuns(fdt) {
    for (let i = fx.guns.length - 1; i >= 0; i--) {
      const g = fx.guns[i];
      const was = g.t;
      g.t += fdt;
      if (was < 0 && g.t >= 0) {
        // 쾅! 포구 불꽃 · 연기
        sndCannon(g.big ? 0.85 : 0.7, false);
        fx.trauma = Math.min(1, fx.trauma + 0.12);
        for (let k = 0; k < 6; k++) addPuff(g.x + rnd(-10, 10), g.y - rnd(0, 16), rnd(-50, 50), rnd(-140, -50), rnd(12, 22), 'rgba(205,200,190,');
      }
      if (!g.hit && g.t >= g.dur) {
        g.hit = true;
        addBoom(g.tx, g.ty, L.S * 0.13, 360);
        for (let k = 0; k < 4; k++) addPuff(g.tx + rnd(-12, 12), g.ty + rnd(-12, 12), rnd(-40, 40), rnd(-60, -10), rnd(10, 18), 'rgba(70,64,60,');
      }
      if (g.t > g.dur + 200) fx.guns.splice(i, 1);
    }
    const sec = fdt / 1000;
    for (let i = fx.puffs.length - 1; i >= 0; i--) {
      const q = fx.puffs[i];
      q.life += fdt; q.x += q.vx * sec; q.y += q.vy * sec; q.vx *= Math.exp(-1.6 * sec); q.vy *= Math.exp(-1.2 * sec); q.r += q.grow * sec;
      if (q.life >= q.max) fx.puffs.splice(i, 1);
    }
    for (let i = fx.booms.length - 1; i >= 0; i--) { const q = fx.booms[i]; q.t += fdt; if (q.t >= q.max) fx.booms.splice(i, 1); }
    // 격침 조개: 솟구쳤다가 🐚 칩으로 날아가요
    if (fx.coins.length) {
      const chip = $('shellChip').getBoundingClientRect();
      const tx = chip.left + chip.width * 0.3; const ty = chip.top + chip.height / 2;
      for (let i = fx.coins.length - 1; i >= 0; i--) {
        const c = fx.coins[i];
        c.life += fdt;
        if (c.life < 0) continue;
        if (c.life < c.fly) { c.vy += 900 * sec; c.x += c.vx * sec; c.y += c.vy * sec; c.rot += c.vr * sec; c.hx = c.x; c.hy = c.y; }
        else {
          const k = clamp((c.life - c.fly) / 520, 0, 1); const e = easeOutCubic(k);
          c.x = lerp(c.hx, tx, e); c.y = lerp(c.hy, ty, e) - Math.sin(k * Math.PI) * 60;
          if (k >= 1) { fx.coins.splice(i, 1); sndCoin(); bumpShell(); }
        }
      }
    }
  }
  function addPuff(x, y, vx, vy, r, c) { if (fx.puffs.length >= CAP.puff) fx.puffs.shift(); fx.puffs.push({ x, y, vx, vy, r, grow: rnd(14, 28), life: 0, max: rnd(700, 1300), c }); }
  function addBoom(x, y, r, max) { if (fx.booms.length >= CAP.boom) fx.booms.shift(); fx.booms.push({ x, y, r, t: 0, max: max || 380 }); }
  function addCoin(x, y, delay) {
    if (fx.coins.length >= CAP.coin) return;
    fx.coins.push({ x, y, vx: rnd(-170, 170), vy: rnd(-520, -280), rot: rnd(0, 6), vr: rnd(-8, 8), life: -(delay || 0), fly: rnd(560, 820), hx: x, hy: y });
  }

  /* ================================================================
     배 (적 캐럭선 · 작은 적 범선) — 색 포탄을 쏘는 곳 · 격침 장면
     ================================================================ */
  const curFoeD = () => (G.foe ? D.enemies[G.foe.kind] || {} : {});
  const isShip = () => !!curFoeD().ship;
  const PERM = [[-1, 0, 1], [1, 0, -1], [0, -1, 1], [-1, 1, 0], [1, -1, 0], [0, 1, -1]];
  // 이 포탄이 어느 쪽에서 오나: 작은 적 범선은 화면 왼쪽·가운데·오른쪽 (공격마다 순서가 달라요)
  function ballSide(h, sloop) {
    const n = h.n || 1;
    if (sloop) return n === 1 ? [-1, 0, 1][h.a % 3] : PERM[h.a % 6][h.i % 3];
    return n === 1 ? (h.a % 2 ? -1 : 1) : [-1, 1, 0][h.i % 3];
  }
  function launchPos(h, d) {
    const sloop = d.ship && !d.mid;
    const side = ballSide(h, sloop);
    if (sloop) return { x: L.cx + side * L.w * 0.34, y: L.ey + L.S * 0.05, side };
    if (d.ship) { const b = curFoeBox(); return { x: b.cx + side * b.w * 0.22, y: b.cy + b.h * 0.18, side }; }
    return { x: L.cx + side * L.S * 0.16, y: L.ey, side };
  }
  // 적 배가 쏘는 순간 (고리가 40% 줄었을 때 포탄이 나와요) → 포구 불꽃 · 연기 · 먼 쾅
  function shipGuns(v) {
    if (!v || !G.foe || G.foe.dead) return;
    const d = curFoeD();
    if (!d.ship) return;
    for (const h of v.hits) {
      const key = h.a + ':' + h.i;
      if (G.fired[key]) continue;
      const prog = (v.t - h.show) / (h.ti - h.show);
      if (prog < 0.4) continue;
      G.fired[key] = clock;
      const lp = launchPos(h, d);
      addBoom(lp.x, lp.y, L.S * 0.07, 260);
      for (let k = 0; k < 5; k++) addPuff(lp.x + rnd(-8, 8), lp.y + rnd(-6, 6), rnd(-40, 40), rnd(-60, -10), rnd(8, 14), 'rgba(215,210,200,');
      sndCannon(0.32, true);
    }
  }
  // 적 그림이 놓이는 곳 (drawFoe · 격침 · 대포 과녁이 같이 써요)
  function foeBox(d, sp, f) {
    let h; let w; let cx = L.cx; let cy = L.ey;
    const ratio = sp ? sp.width / sp.height : 1;
    if (d.boss) {
      // 폭풍 문어: 화면을 거의 채울 만큼 크게 (옆으로는 넘쳐도 돼요)
      h = L.playH * 0.98; w = h * ratio;
      if (w > L.w * 1.8) { w = L.w * 1.8; h = w / ratio; }
      cy = L.playH * 0.4;
    } else {
      h = L.S * (d.mid ? 1.05 : d.ship ? 0.64 : 0.6 + 0.2 * (d.size || 1));
      h = Math.min(h, L.playH * 0.62);
      w = h * ratio;
      if (w > L.w * 1.04) { w = L.w * 1.04; h = w / ratio; }
    }
    if (d.ship && !d.mid && f) cx = L.cx + (f.side || 1) * L.w * 0.2;
    return { w, h, cx, cy };
  }
  function curFoeBox() {
    if (G.sink) return G.sink.box;
    const d = curFoeD();
    if (!G.foe) return { w: L.S * 0.6, h: L.S * 0.6, cx: L.cx, cy: L.ey };
    return foeBox(d, Art.sprite(d.art), G.foe);
  }
  // 격침 장면 시작 (일제 사격으로 배를 끝냈을 때)
  function startSink(e) {
    const d = D.enemies[e.kind] || {};
    const f = G.foe || { side: 1, born: clock };
    const sp = Art.sprite(d.art);
    G.sink = { t: 0, dur: AUTO ? 2400 : 3800, kind: e.kind, side: f.side || 1, box: foeBox(d, sp, f), sp, alias: Art.isAlias(d.art), mid: !!d.mid, coins: 0, booms: 0 };
    banner('격침!', d.name + ' · 조개가 쏟아져요', 2600, 'huge');
    addPop(d.name + ' 격침!', '#ffe27a', 1.05, -110);
    sndKung(true); sndCreak();
    after(700, sndSplash);
    fx.trauma = Math.min(1, fx.trauma + 0.6);
    vib([60, 40, 160, 60, 200]);
    fx.cut = null; fx.cutPending = null;
    boriReact();
  }
  function endSink() {
    G.sink = null;
    if (G.foe) G.foe.dead = clock - 5000;     // 다시 그리지 않게
  }
  function startCut() {
    const c = fx.cutPending; fx.cutPending = null;
    fx.cut = { t: 0, dur: c.strong ? 1000 : 850, text: c.text, sub: c.sub, strong: c.strong, img: c.img };
  }

  /* ================================================================
     콩게 (숨은그림) · 보리 (배 고양이)
     ================================================================ */
  // 지금 화면에서 콩게가 있는 곳 (없으면 null) — 그리기와 누르기가 같이 써요
  function kongPos() {
    const k = G.kong;
    if (!k || !k.spot || G.mode !== 'play' || !G.W || G.room !== k.spot.room || G.ending) return null;
    if (k.found && clock - k.found > 1300) return null;
    const sp = k.spot;
    const size = clamp(L.w * 0.105, 36, 54);
    const peek = 0.6 + 0.4 * Math.sin(clock * 0.0021 + sp.x * 9);
    if (sp.how === 'rail') return { x: sp.x * L.w, y: L.playH - 22 - size * 0.18 + (1 - peek) * size * 0.35, r: size / 2, rot: 0, how: 'rail' };
    if (sp.how === 'edge') { const left = sp.x < 0.5; return { x: left ? size * (0.25 + 0.2 * peek) : L.w - size * (0.25 + 0.2 * peek), y: sp.y * L.playH, r: size / 2, rot: left ? 0.5 : -0.5, how: 'edge' }; }
    return { x: sp.x * L.w, y: sp.y * L.playH + Math.sin(clock * 0.0017) * 4, r: size / 2, rot: Math.sin(clock * 0.0017) * 0.25, how: 'hang' };
  }
  function tapKong(x, y) {
    const p = kongPos();
    if (!p || G.kong.found) return false;
    if (Math.hypot(x - p.x, y - p.y) > Math.max(30, p.r * 1.5)) return false;
    if (!S.findKong(G.W, G.hero)) return false;
    drain();
    return true;
  }
  function fxKong(e) {
    G.kong.found = clock;
    const p = kongPos() || { x: L.cx, y: L.playH * 0.5 };
    G.kong.at = { x: p.x, y: p.y };
    burst(p.x, p.y, 30, ['#ff6b6b', '#ffd25a', '#fff', '#ff9fb5'], 700);
    wave(p.x, p.y, 6, 60, 420, '#ffd6e0', 5);
    addPop('콩게 찾았다! 🐚+' + e.n, '#ff9f9f', 0.62, 0, false, 0, clamp(p.y - 40, 110, L.playH - 60));
    sndKong(); vib([20, 40, 20]);
    boriReact();
    talk([{ who: 'noeul', text: '어? 콩게잖아! 또 몰래 탔구나~' }]);
  }
  function drawKong() {
    const p = kongPos();
    if (!p) return;
    const im = Art.get('c_kong');
    const found = G.kong.found ? clamp((clock - G.kong.found) / 1300, 0, 1) : 0;
    ctx.save();
    ctx.translate(p.x, p.y - (found ? Math.sin(found * Math.PI) * 50 : 0));
    ctx.rotate(p.how === 'hang' ? Math.PI + p.rot : p.rot);
    const sc = found ? 1 + 0.5 * Math.sin(Math.min(1, found * 2) * Math.PI) : 1;
    ctx.scale(sc, sc);
    ctx.globalAlpha = 1 - smooth(0.7, 1, found);
    const r = p.r;
    if (p.how === 'hang') {
      ctx.strokeStyle = 'rgba(200,170,120,.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, r * 0.9); ctx.lineTo(0, r * 0.9 + p.y + 20); ctx.stroke();
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    if (im) {
      const sw = im.width * 0.5; const sh = im.height * 0.5;
      ctx.drawImage(im, im.width * 0.25, im.height * 0.27, sw, sh, -r, -r, r * 2, r * 2);
    } else { ctx.fillStyle = '#d8323a'; ctx.fillRect(-r, -r, r * 2, r * 2); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,22,10,.75)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  function boriReact() { G.bori.react = clock; }
  // 배 고양이 보리: 난간 위 구석에 앉아 콩게 쪽을 봐요 (힌트) · 큰 패링이면 꼬리를 세우고 폴짝
  function drawBori() {
    if (G.mode !== 'play' || !G.W) return;
    const sp = Art.sprite('c_bori');
    if (!sp) return;
    const k = G.kong; const ks = k && k.spot;
    const here = ks && G.room === ks.room && !k.found && !G.ending;
    const left = !(here && ks.x < 0.35);
    const size = clamp(L.w * 0.16, 54, 84);
    const bx = left ? L.w * 0.075 + size * 0.2 : L.w * 0.925 - size * 0.2;
    const by = L.playH - 20;
    const rk = clamp((clock - G.bori.react) / 900, 0, 1);
    const reacting = rk < 1;
    const hop = reacting ? Math.sin(rk * Math.PI) * 14 : 0;
    let tilt = Math.sin(clock * 0.0013) * 0.03;
    let kp = null;
    if (here) { kp = kongPos(); if (kp) tilt += (kp.x < bx ? -1 : 1) * 0.16; }
    const h = size; const w = h * sp.width / sp.height;
    ctx.save();
    ctx.translate(bx, by - hop);
    ctx.rotate(tilt);
    const breathe = 1 + Math.sin(clock * 0.004) * 0.015;
    ctx.scale(1, reacting ? 1 + Math.sin(rk * Math.PI) * 0.08 : breathe);
    // 꼬리 세우기 (반응할 때)
    if (reacting) {
      const up = Math.sin(Math.min(1, rk * 2.2) * Math.PI / 2);
      ctx.strokeStyle = '#e98a3a'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(5, w * 0.1);
      ctx.beginPath(); ctx.moveTo(w * 0.22, -h * 0.22);
      ctx.quadraticCurveTo(w * 0.55, -h * (0.35 + 0.3 * up), w * 0.36, -h * (0.55 + 0.45 * up)); ctx.stroke();
      ctx.strokeStyle = '#fff3e6'; ctx.lineWidth = Math.max(4, w * 0.08);
      ctx.beginPath(); ctx.arc(w * 0.36, -h * (0.55 + 0.45 * up), 0.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.drawImage(sp, -w / 2, -h, w, h);
    ctx.restore();
    if (reacting) {
      ctx.font = `900 ${Math.round(size * 0.36)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1 - smooth(0.6, 1, rk);
      ctx.fillStyle = '#ff7aa8'; ctx.fillText('♥', bx + (left ? size * 0.45 : -size * 0.45), by - h - hop - 6 - rk * 16);
      ctx.globalAlpha = 1;
    }
    // 힌트: 가끔 말풍선 '?' + 콩게 쪽으로 점점점
    if (here && kp) {
      const cyc = (clock - G.bori.hintAt) % 6500;
      if (clock > G.bori.hintAt && cyc < 2300) {
        const a = Math.min(1, cyc / 250) * (1 - smooth(1900, 2300, cyc));
        const qx = bx + (kp.x < bx ? -1 : 1) * size * 0.3; const qy = by - h - 18;
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.arc(qx, qy, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c0392b'; ctx.font = `900 16px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', qx, qy + 1);
        const dx = kp.x - qx; const dy = kp.y - qy; const dl = Math.hypot(dx, dy) || 1;
        ctx.fillStyle = 'rgba(255,240,200,.9)';
        for (let i = 1; i <= 3; i++) { const t = (i * 26 + (cyc * 0.02) % 26) ; if (t > dl - 20) break; ctx.beginPath(); ctx.arc(qx + dx / dl * (14 + t), qy + dy / dl * (14 + t), 2.6, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
  }
  // 여관 정산: 선장 곁에 웅크린 보리 (숨 쉬는 듯 천천히)
  function drawInnPals() {
    const c = $('innPic');
    if (!c || G.mode !== 'inn') return;
    const g = c.getContext('2d');
    const W2 = c.width; const H2 = c.height;
    g.clearRect(0, 0, W2, H2);
    const hero = Art.sprite('c_hero_' + G.g); const cat = Art.sprite('c_bori');
    if (hero) { const h = H2 * 1.05; const w = h * hero.width / hero.height; g.drawImage(hero, W2 * 0.36 - w / 2, H2 - h + H2 * 0.08, w, h); }
    if (cat) {
      const br = 1 + Math.sin(clock * 0.0026) * 0.03;
      const h = H2 * 0.66; const w = h * cat.width / cat.height;
      g.save(); g.translate(W2 * 0.7, H2 - 4); g.scale(1.08, 0.86 * br);
      g.drawImage(cat, -w / 2, -h, w, h); g.restore();
      g.fillStyle = 'rgba(255,240,210,.85)'; g.font = `900 ${Math.round(H2 * 0.12)}px ${FONT}`; g.textAlign = 'left';
      const zk = (clock * 0.0008) % 1;
      g.globalAlpha = 1 - zk; g.fillText('z', W2 * 0.8 + zk * 14, H2 * 0.42 - zk * 26);
      g.globalAlpha = 1 - ((zk + 0.5) % 1); g.fillText('z', W2 * 0.8 + ((zk + 0.5) % 1) * 14, H2 * 0.42 - ((zk + 0.5) % 1) * 26);
      g.globalAlpha = 1;
    }
  }

  /* ================================================================
     설정 (화풍 바꾸기 · 기기에 저장)
     ================================================================ */
  function openSettings() {
    G.setOpen = true;
    renderSettings();
    $('settings').classList.remove('hide');
    sndCard();
  }
  function closeSettings() { G.setOpen = false; $('settings').classList.add('hide'); }
  function renderSettings() {
    const row = $('themeRow'); row.innerHTML = '';
    Art.THEMES.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'theme' + (Art.theme === t.id ? ' on' : '');
      b.dataset.th = t.id;
      const n = Art.count(t.id, ST.ART_IDS);
      const sm = document.createElement('small');
      sm.textContent = Art.theme === t.id ? '지금 이 화풍' : (n >= ST.ART_IDS.length ? '모든 그림 준비됨' : `그림 ${n}/${ST.ART_IDS.length}장 준비됨`);
      b.append(t.name, sm);
      row.append(b);
    });
    const cur = Art.theme; const n = Art.count(cur, ST.ART_IDS);
    $('themeNote').textContent = n >= ST.ART_IDS.length
      ? '고른 화풍은 이 기기에 저장돼요.'
      : `고전 유화 그림은 아직 준비 중이에요. 준비된 그림(${n}장)만 유화로 바뀌고, 나머지는 게임 일러스트로 보여요. 고른 화풍은 이 기기에 저장돼요.`;
  }
  function pickTheme(th) {
    if (th === Art.theme) return;
    sndBuy(); vib(20);
    Art.setTheme(th).then(() => {
      renderSettings();
      // 처음 화면 초상 다시 그리기 (나머지는 매 프레임 그려요)
      document.querySelectorAll('.hero').forEach((b) => drawPic(b.querySelector('canvas'), 'c_hero_' + b.dataset.g, true));
    });
    renderSettings();
  }

  /* ================================================================
     그리기
     ================================================================ */
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(a, 0, 1)})`;
  }
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
      out.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y });
    }
    return out;
  }
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

  // 배경 그림 (화면을 꽉 채우고 focus 쪽을 가운데로 · 없으면 어두운 바다)
  function drawCover(id, focus, alpha, zoom) {
    const im = Art.get(id);
    if (!im) return false;
    const sc = Math.max(L.w / im.width, L.h / im.height) * (zoom || 1);
    const dw = im.width * sc; const dh = im.height * sc;
    const x = clamp(L.w / 2 - focus * dw, L.w - dw, 0);
    const y = (L.h - dh) / 2;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, x, y, dw, dh);
    ctx.globalAlpha = 1;
    return true;
  }
  function drawBgLayer(zoom) {
    const ok = drawCover(G.bg, G.focus, 1, zoom);
    if (!ok) {
      const g = ctx.createLinearGradient(0, 0, 0, L.h);
      g.addColorStop(0, '#0b1224'); g.addColorStop(0.5, '#1d2c48'); g.addColorStop(1, '#050a12');
      ctx.fillStyle = g; ctx.fillRect(-80, -80, L.w + 160, L.h + 160);
    }
    if (G.bgFade > 0 && G.bgPrev) drawCover(G.bgPrev, G.focusPrev, G.bgFade, zoom);
    if (G.mode === 'play' || G.mode === 'rewind') {
      const tint = G.tint === 2 ? 'rgba(18,8,40,.34)' : G.tint === 1 ? 'rgba(6,12,30,.22)' : '';
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(-80, -80, L.w + 160, L.h + 160); }
    }
    if (fx.skyFlash > 0) { ctx.fillStyle = `rgba(190,215,255,${0.3 * fx.skyFlash})`; ctx.fillRect(-80, -80, L.w + 160, L.h + 160); }
    if (fx.bolt) {
      const k = 1 - fx.bolt.t / fx.bolt.dur;
      ctx.lineJoin = 'round';
      for (const [lw, a] of [[7, 0.25], [2.4, 1]]) {
        ctx.strokeStyle = `rgba(210,230,255,${a * k})`; ctx.lineWidth = lw;
        ctx.beginPath(); fx.bolt.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      }
    }
  }

  /* 적의 지금 모습 */
  function foeState(v) {
    const t = v.t;
    let u = 0; let lunge = 0; let glow = ''; let nearT = 1e9;
    for (const h of v.hits) {
      if (t < h.ti) {
        const prog = clamp((t - h.show) / (h.ti - h.show), 0, 1);
        u = Math.max(u, prog);
        if (t >= h.reveal && !h.jr && h.ti - t < nearT) { nearT = h.ti - t; glow = h.c; }
      } else if (t - h.ti < 170) lunge = Math.max(lunge, 1 - (t - h.ti) / 170);
    }
    return { u, lunge, glow };
  }
  function drawFoe(v) {
    const f = G.foe;
    if (!f || G.sink) return;
    const d = D.enemies[f.kind];
    const deadK = f.dead ? clamp((clock - f.dead) / 900, 0, 1) : 0;
    if (deadK >= 1) return;
    const born = clamp((clock - f.born) / 450, 0, 1);
    const S2 = L.S; const T = fx.wt;
    const st = foeState(v);
    const knock = clamp(fx.knock, -0.5, 1.2);
    const bob = Math.sin(T * 0.0021) * S2 * 0.012;
    const wob = (v.stun ? Math.sin(T * 0.011) * 0.07 : 0) + knock * 0.13 * fx.knockDir + deadK * 0.35 * f.dir;
    const sc = (1 + st.u * 0.045 + st.lunge * 0.08 - knock * 0.17) * (0.82 + 0.18 * easeOutBack(born));
    const sp = Art.sprite(d.art);
    const box = foeBox(d, sp, f);
    const w = box.w; const h = box.h;
    const sloop = d.ship && !d.mid;
    // 작은 적 범선은 옆에서 미끄러져 들어와요
    const slide = sloop ? (1 - easeOutCubic(clamp((clock - f.born) / 1000, 0, 1))) * (f.side || 1) * L.w * 0.9 : 0;
    const roll = d.ship ? Math.sin(T * 0.0016) * 0.025 : 0;
    ctx.save();
    ctx.translate(box.cx + slide, box.cy + bob - knock * S2 * 0.13 + deadK * S2 * 0.35 + (1 - born) * S2 * 0.08);
    ctx.rotate(wob + roll);
    ctx.scale(sc * (1 + fx.squash * 0.05), sc * (1 - fx.squash * 0.07));
    // e_sloop 그림이 아직 없어 캐럭선을 대신 쓸 때: 작게 · 비스듬히 옆으로 (들어온 쪽을 보게 뒤집어요)
    if (sloop && Art.isAlias(d.art)) ctx.transform(-(f.side || 1) * 0.8, (f.side || 1) * 0.14, 0, 1, 0, 0);
    ctx.globalAlpha = born * (1 - deadK);
    // 공격 색이 보이면 적 뒤가 그 색으로 빛나요 (색 읽기 도움)
    if (st.glow) {
      const r = Math.max(w, h) * 0.62;
      const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
      g.addColorStop(0, hexA(COL[st.glow].hex, 0.25 + 0.4 * st.u)); g.addColorStop(1, hexA(COL[st.glow].hex, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    if (sp) {
      ctx.drawImage(sp, -w / 2, -h / 2, w, h);
      if (fx.eFlash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fx.eFlash * 0.45 * born; ctx.drawImage(sp, -w / 2, -h / 2, w, h); ctx.globalCompositeOperation = 'source-over'; }
    } else {
      ctx.fillStyle = 'rgba(20,24,40,.85)'; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.4, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 휘청: 머리 위를 도는 별
    if (v.stun && !f.dead) {
      for (let k = 0; k < 3; k++) {
        const a = T * 0.006 + k * 2.09;
        const x = Math.cos(a) * w * 0.22; const y = -h * 0.42 + Math.sin(a) * h * 0.05;
        drawStar(x, y, 9, '#ffe27a');
      }
    }
    ctx.restore();
  }
  function drawStar(x, y, r, c) {
    ctx.fillStyle = c; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }

  /* 다가오는 공격: 문어는 촉수, 나머지는 색 포탄(구슬)이 판정 원으로 날아와요 → 패링이면 튕겨 나가요 */
  function drawStrikes(v) {
    if (!G.foe || G.foe.dead) return;
    const fd = D.enemies[G.foe.kind];
    const boss = fd.boss;
    if (fd.ship) { drawBalls(v, fd); return; }
    const s = L.S; const t = v.t;
    const list = v.hits.slice().sort((a, b) => b.ti - a.ti);
    for (const h of list) {
      const n = h.n || 1;
      const side = n === 1 ? (h.a % 2 ? -1 : 1) : [-1, 1, 0][h.i % 3];
      const d = t - h.ti;
      const revealed = t >= h.reveal && !(h.jr && h.jr !== 'parry');
      if (!boss) {
        // 색 포탄
        const prog = clamp((t - h.show) / (h.ti - h.show), 0, 1);
        if (d < 0 && prog < 0.4) continue;
        const from = { x: L.cx + side * s * 0.16, y: L.ey };
        const to = { x: L.cx, y: L.jy };
        let x; let y; let r; let a = 1;
        if (d < 0) {
          const k = Math.pow((prog - 0.4) / 0.6, 1.6);
          x = lerp(from.x, to.x, k); y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * s * 0.1; r = lerp(5, L.rj * 0.5, k);
        } else if (h.jr === 'parry') {
          const k = clamp(d / 380, 0, 1);
          x = lerp(to.x, L.cx + side * L.w * 0.7 + (side === 0 ? L.w * 0.5 : 0), easeOutCubic(k)); y = lerp(to.y, -40, easeOutCubic(k)); r = L.rj * 0.5 * (1 - k * 0.5); a = 1 - k;
        } else {
          if (d > 160) continue;
          const k = d / 160; x = to.x; y = to.y + k * 40; r = L.rj * (0.5 + k * 1.2); a = 1 - k;
        }
        const c = revealed || h.jr === 'parry' ? COL[h.c].hex : '#9aa3b6';
        ctx.globalAlpha = a;
        const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.2);
        g.addColorStop(0, hexA(c, 0.55)); g.addColorStop(1, hexA(c, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#14161f'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = c; ctx.lineWidth = Math.max(2, r * 0.22); ctx.stroke();
        if (revealed && r > 10) { ctx.fillStyle = c; shapePath(h.c, x, y, r * 0.42); ctx.fill(); }
        ctx.globalAlpha = 1;
        continue;
      }
      // 폭풍 문어 촉수 (demo.js 에서 옮김)
      const base = { x: L.cx + (side === 0 ? 0.1 : side * 0.3) * s, y: L.water + s * 0.06 };
      const raise = { x: L.cx + (side === 0 ? 0.06 : side * 0.52) * s, y: L.ey - (side === 0 ? 0.5 : 0.3) * s };
      const target = { x: L.cx + side * 0.03 * s, y: L.jy };
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
      if (revealed && d < 0) {
        ctx.strokeStyle = hexA(COL[h.c].hex, 0.6); ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      }
      ctx.fillStyle = '#4a2f78';
      const sd = tentPath(pts, s * 0.05, wt);
      ctx.strokeStyle = 'rgba(160,220,255,.45)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); sd.A.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      ctx.fillStyle = 'rgba(255,190,215,.55)';
      for (let i = 4; i < sd.A.length; i += 3) {
        const p = sd.A[i]; const r = p.w * 0.38;
        ctx.beginPath(); ctx.arc(p.x - p.nx * p.w * 0.45, p.y - p.ny * p.w * 0.45, r, 0, Math.PI * 2); ctx.fill();
      }
      if (h.jr === 'parry' && d >= 0 && d < 160) { ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - d / 160)})`; tentPath(pts, s * 0.05, wt); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }

  // 적 배의 색 포탄: 쏜 곳(포구 불꽃)에서 나와 판정 원으로 날아오며 커져요 · 맞는 색이면 "펑!" 격추
  function drawBalls(v, d) {
    const t = v.t;
    const list = v.hits.slice().sort((a, b) => b.ti - a.ti);
    for (const h of list) {
      const dd = t - h.ti;
      if (h.jr === 'parry' && dd >= 0) continue;            // 격추됐어요 (폭발은 shootDown)
      const prog = clamp((t - h.show) / (h.ti - h.show), 0, 1);
      if (dd < 0 && prog < 0.4) continue;
      const lp = launchPos(h, d);
      const to = { x: L.cx, y: L.jy };
      let x; let y; let r; let a = 1;
      const pos = (k) => ({ x: lerp(lp.x, to.x, k), y: lerp(lp.y, to.y, k) - Math.sin(k * Math.PI) * L.S * 0.14 });
      if (dd < 0) {
        const k = Math.pow((prog - 0.4) / 0.6, 1.5);
        const p = pos(k); x = p.x; y = p.y; r = lerp(4, L.rj * 0.6, k);
        // 꼬리 연기
        for (let j = 1; j <= 4; j++) {
          const kk = Math.max(0, k - j * 0.045); const q = pos(kk);
          ctx.fillStyle = `rgba(200,195,185,${0.28 * (1 - j / 5)})`;
          ctx.beginPath(); ctx.arc(q.x, q.y, r * (0.6 + j * 0.18), 0, Math.PI * 2); ctx.fill();
        }
      } else {
        if (dd > 160) continue;
        const k = dd / 160; x = to.x; y = to.y + k * 40; r = L.rj * (0.6 + k * 1.2); a = 1 - k;
      }
      const revealed = t >= h.reveal && !(h.jr && h.jr !== 'parry');
      const c = revealed ? COL[h.c].hex : '#9aa3b6';
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.4);
      g.addColorStop(0, hexA(c, 0.6)); g.addColorStop(1, hexA(c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
      const iron = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      iron.addColorStop(0, '#8a8f99'); iron.addColorStop(0.45, '#33363d'); iron.addColorStop(1, '#0c0d10');
      ctx.fillStyle = iron; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(2, r * 0.2); ctx.stroke();
      if (revealed && r > 9) { ctx.fillStyle = c; shapePath(h.c, x, y, r * 0.42); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
  // 대포 연기 · 폭발 · 우리 대포(포구 불꽃 · 날아가는 포탄)
  function drawGunFx() {
    for (const q of fx.puffs) {
      const k = q.life / q.max;
      ctx.fillStyle = q.c + (0.5 * (1 - k)).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
    }
    for (const q of fx.booms) {
      const k = q.t / q.max; const e = easeOutCubic(k);
      const r = q.r * (0.4 + e);
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
      g.addColorStop(0, `rgba(255,255,230,${0.95 * (1 - k)})`); g.addColorStop(0.35, `rgba(255,190,80,${0.85 * (1 - k)})`); g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (const gn of fx.guns) {
      if (gn.t < 0) continue;
      // 포구 불꽃 (위로 · 적 쪽으로)
      if (gn.t < 160) {
        const k = gn.t / 160;
        const ang = Math.atan2(gn.ty - gn.y, gn.tx - gn.x);
        ctx.save(); ctx.translate(gn.x, gn.y); ctx.rotate(ang);
        const len = (gn.big ? 90 : 70) * (1 - k * 0.4);
        const g = ctx.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, `rgba(255,255,220,${1 - k})`); g.addColorStop(0.4, `rgba(255,180,60,${0.9 * (1 - k)})`); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(len * 0.5, -22, len, 0); ctx.quadraticCurveTo(len * 0.5, 22, 0, 14); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.fillStyle = `rgba(255,230,160,${0.6 * (1 - k)})`; ctx.beginPath(); ctx.arc(gn.x, gn.y, 26 * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      }
      if (gn.t <= gn.dur) {
        const k = easeOutCubic(gn.t / gn.dur);
        const x = lerp(gn.x, gn.tx, k); const y = lerp(gn.y, gn.ty, k) - Math.sin(k * Math.PI) * L.S * 0.12;
        const r = lerp(11, 4, k);
        ctx.fillStyle = 'rgba(210,205,195,.35)'; ctx.beginPath(); ctx.arc(lerp(gn.x, gn.tx, Math.max(0, k - 0.08)), lerp(gn.y, gn.ty, Math.max(0, k - 0.08)), r * 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#16171b'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,120,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
  }
  // 격침: 흔들림·폭발 → 돛대가 부러져 쓰러지고 → 배가 기울며 물에 잠기고 → 조개가 쏟아져요
  function drawSinking() {
    const sk = G.sink;
    if (!sk) return;
    const k = clamp(sk.t / sk.dur, 0, 1);
    const b = sk.box; const sp = sk.sp; const side = sk.side;
    const water = b.cy + b.h * 0.36;          // 배가 잠기는 물 높이
    // 갑판 폭발 (처음 0.35)
    if (k < 0.35 && sk.booms < Math.floor(k * 20)) {
      sk.booms++;
      addBoom(b.cx + rnd(-0.3, 0.3) * b.w, b.cy + rnd(-0.2, 0.25) * b.h, L.S * rnd(0.08, 0.16), 420);
      addPuff(b.cx + rnd(-0.3, 0.3) * b.w, b.cy + rnd(-0.3, 0.1) * b.h, rnd(-30, 30), rnd(-80, -30), rnd(14, 24), 'rgba(60,56,54,');
      if (sk.booms % 3 === 1) sndCannon(0.4, true);
    }
    // 조개 쏟아짐 (0.3 ~ 0.85)
    const want = Math.floor(smooth(0.3, 0.85, k) * 26);
    while (sk.coins < want) { sk.coins++; addCoin(b.cx + rnd(-0.25, 0.25) * b.w, water - b.h * 0.1, 0); }
    if (!sk.creak2 && k > 0.18) { sk.creak2 = true; sndCreak(); }
    const shake = k < 0.3 ? Math.sin(clock * 0.07) * 4 * (1 - k / 0.3) : 0;
    const list = smooth(0.2, 0.7, k) * 0.38 * -side;
    const down = Math.pow(smooth(0.32, 1, k), 1.4) * b.h * 0.95;
    ctx.save();
    ctx.beginPath(); ctx.rect(-100, -100, L.w + 200, water + 100); ctx.clip();
    if (sp) {
      const sw = sp.width; const sh = sp.height;
      const cut = 0.5;                           // 위 50% = 돛대 · 아래 = 선체
      const flip = sk.alias && !sk.mid ? -side * 0.9 : 1;
      // 선체
      ctx.save();
      ctx.translate(b.cx + shake, b.cy + down);
      ctx.rotate(list);
      ctx.scale(flip, 1);
      ctx.drawImage(sp, 0, sh * cut, sw, sh * (1 - cut), -b.w / 2, -b.h / 2 + b.h * cut, b.w, b.h * (1 - cut));
      ctx.restore();
      // 돛대 (부러진 곳을 축으로 쓰러지며 함께 가라앉아요)
      const fall = Math.pow(smooth(0.12, 0.55, k), 1.6);
      ctx.save();
      ctx.translate(b.cx + shake, b.cy + down * 0.9);
      ctx.rotate(list);
      ctx.translate(0, -b.h / 2 + b.h * cut);
      ctx.rotate(side * fall * 1.35);
      ctx.translate(side * fall * b.w * 0.08, fall * b.h * 0.1);
      ctx.scale(flip, 1);
      ctx.globalAlpha = 1 - smooth(0.75, 1, k);
      ctx.drawImage(sp, 0, 0, sw, sh * cut, -b.w / 2, -b.h * cut, b.w, b.h * cut);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // 물거품 · 소용돌이
    const foam = smooth(0.25, 0.5, k) * (1 - smooth(0.85, 1, k));
    if (foam > 0) {
      ctx.fillStyle = `rgba(235,245,255,${0.7 * foam})`;
      for (let i = 0; i < 9; i++) {
        const fx2 = b.cx + (i - 4) * b.w * 0.09 + Math.sin(clock * 0.004 + i) * 6;
        ctx.beginPath(); ctx.ellipse(fx2, water + Math.sin(clock * 0.006 + i * 2) * 3, b.w * 0.07, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = `rgba(200,225,255,${0.5 * foam})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(b.cx, water + 4, b.w * 0.45 * (0.6 + k * 0.4), 10, 0, 0, Math.PI * 2); ctx.stroke();
      if (Math.random() < 0.3) sprayBurst(b.cx + rnd(-0.3, 0.3) * b.w, water, 2);
    }
  }
  function drawCoins() {
    if (!fx.coins.length) return;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `22px ${FONT}`;
    for (const c of fx.coins) {
      if (c.life < 0) continue;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillText('🐚', 0, 0);
      ctx.restore();
    }
  }
  function drawSpray() {
    if (!P.spray.length) return;
    ctx.fillStyle = 'rgba(225,240,255,.5)';
    ctx.beginPath();
    for (const p of P.spray) { const k = 1 - p.life / p.max; const r = p.r * (0.6 + k * 0.6); ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); }
    ctx.fill();
  }
  function drawRain() {
    if (!rainy()) return;
    const n = G.weather === 'rain' ? Math.round(P.rain.length * 0.55) : P.rain.length;
    if (fx.freeze > 0) {
      ctx.fillStyle = 'rgba(255,236,190,.85)';
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const d = P.rain[i]; ctx.moveTo(d.x + 1.8, d.y); ctx.arc(d.x, d.y, 1.8, 0, Math.PI * 2); }
      ctx.fill();
    } else {
      const sp = fx.rush > 0 ? 1.8 : 1;
      ctx.strokeStyle = 'rgba(185,205,235,.42)'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const d = P.rain[i]; const len = d.len * sp; const dx = fx.wind / d.vy * len; ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - dx, d.y - len); }
      ctx.stroke();
    }
  }
  function drawPetals() {
    if (G.weather !== 'petals') return;
    for (const p of P.petals) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = fx.freeze > 0 ? '#ffe9b0' : p.c;
      ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55 * (0.5 + 0.5 * Math.abs(Math.sin(p.ph))), 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  function drawBubbles() {
    for (const b of P.bubbles) {
      const a = Math.min(1, b.life * 2) * (1 - b.life / b.max);
      ctx.strokeStyle = `rgba(225,240,255,${0.7 * a})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.6 * a})`; ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2); ctx.fill();
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
    const wn = S.winOf(G.W, G.hero);
    const inWin = nextC && near <= wn.pre && near >= -wn.post;
    ctx.fillStyle = inWin ? hexA(COL[nextC].hex, 0.38) : 'rgba(4,8,18,.42)'; ctx.beginPath(); ctx.arc(cx, cy, rj, 0, Math.PI * 2); ctx.fill();
    if (inWin) { ctx.strokeStyle = hexA(COL[nextC].hex, 0.55); ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(cx, cy, rj + 8, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.2 * pulse})`; ctx.lineWidth = 10 + 8 * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, rj + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * pulse})`; ctx.lineWidth = 3 + 2 * pulse;
    ctx.beginPath(); ctx.arc(cx, cy, rj, 0, Math.PI * 2); ctx.stroke();
    if (nextC) { ctx.fillStyle = hexA(COL[nextC].hex, 0.35 + 0.55 * pulse); shapePath(nextC, cx, cy, rj * (0.42 + 0.08 * pulse)); ctx.fill(); }
    const list = v.hits.slice().sort((a, b) => b.ti - a.ti);
    for (const h of list) {
      const d = t - h.ti;
      if (h.jr === 'parry' && d >= 0) continue;
      if (d > 260) continue;
      const prog = clamp((t - h.show) / (h.ti - h.show), 0, 1.5);
      let r = rj + (L.r0 - rj) * (1 - prog);
      let a = clamp((t - h.show) / 160, 0, 1);
      if (d > 0) { r = rj * Math.max(0.2, 1 - d / 320); a *= Math.max(0, 1 - d / 260); }
      const revealed = t >= h.reveal;
      const failed = h.jr && h.jr !== 'parry';
      const shape = revealed ? h.c : 'o';
      let col = revealed ? COL[h.c].hex : '#8d95a8';
      let pop = 0;
      if (revealed) { const k = (t - h.reveal) / 200; if (k < 1) pop = 1 - k; }
      if (failed) { col = '#5d6475'; a *= 0.6; }
      if (h.jr === 'parry') col = '#fff3c4';
      ctx.globalAlpha = a;
      if (pop > 0) { ctx.fillStyle = hexA(col, 0.35 * pop); shapePath(shape, cx, cy, r * (1 + 0.35 * pop)); ctx.fill(); }
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 9;
      shapePath(shape, cx, cy, r * (1 + 0.12 * pop)); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = revealed ? 6 : 4;
      if (failed) ctx.setLineDash([8, 8]);
      shapePath(shape, cx, cy, r * (1 + 0.12 * pop)); ctx.stroke();
      ctx.setLineDash([]);
      if (revealed && !failed && d < 0) {
        const by = cy - r * (shape === 'r' ? 1.34 : shape === 'b' ? 0.9 : 1) - 16;
        ctx.fillStyle = col; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(COL[h.c].glyph + ' ' + COL[h.c].name, cx, by);
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawFxWorld() {
    for (const q of fx.waves) {
      const k = q.life / q.max; const e = easeOutCubic(k);
      ctx.strokeStyle = hexA(q.c, (1 - k) * 0.9); ctx.lineWidth = q.w * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(q.x, q.y, lerp(q.r0, q.r1, e), 0, Math.PI * 2); ctx.stroke();
    }
    for (const q of fx.slashes) {
      const k = q.life / q.max;
      const len = q.len * easeOutCubic(Math.min(1, k * 3));
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
      ctx.fillStyle = hexA(q.c, 1 - k);
      ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -q.w * (1 - k * 0.6), len / 2, 0); ctx.quadraticCurveTo(0, q.w * 0.3, -len / 2, 0); ctx.fill();
      ctx.restore();
    }
    ctx.lineCap = 'round';
    for (const p of fx.sparks) {
      const k = p.life / p.max;
      const sp = Math.hypot(p.vx, p.vy);
      const len = clamp(sp * 0.035, 2, 26);
      ctx.strokeStyle = hexA(p.c, 1 - k * k);
      ctx.lineWidth = p.w * (1 - k * 0.6);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx / (sp || 1) * len, p.y - p.vy / (sp || 1) * len); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const q of fx.nums) {
      const k = q.life / q.max;
      const pop = k < 0.15 ? 1 + (1 - k / 0.15) * 0.6 : 1;
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.font = `900 ${Math.round(q.size * pop)}px ${FONT}`;
      ctx.strokeStyle = 'rgba(20,8,0,.85)'; ctx.lineWidth = Math.max(4, q.size * 0.14);
      ctx.strokeText(q.txt, q.x, q.y); ctx.fillStyle = q.c; ctx.fillText(q.txt, q.x, q.y);
      if (q.sub) { ctx.font = `900 ${Math.round(q.size * 0.36)}px ${FONT}`; ctx.lineWidth = 4; ctx.strokeText(q.sub, q.x, q.y - q.size * 0.72); ctx.fillStyle = '#fff'; ctx.fillText(q.sub, q.x, q.y - q.size * 0.72); }
      ctx.globalAlpha = 1;
    }
  }
  /* 화면 위 덮개: 황금빛 · 붉은 테두리 · 안내 · 컷인 · 글자 · 번쩍임 */
  function drawOverlays() {
    const w = L.w; const h = L.h;
    if (fx.gold > 0) {
      const a = clamp(TUNE.gold * fx.gold * fx.goldK, 0, 1.2);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgba(255,196,96,${clamp(a * 0.85, 0, 1)})`; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'screen';
      const g = ctx.createRadialGradient(L.cx, L.jy, 0, L.cx, L.jy, Math.max(w, h) * 0.75);
      g.addColorStop(0, `rgba(255,214,120,${clamp(a * 0.55, 0, 1)})`); g.addColorStop(0.5, `rgba(255,170,60,${clamp(a * 0.18, 0, 1)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
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
    if (G.mode === 'play' && tut && !tut.done) drawTut();
    if (fx.cut) drawCut();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const q of fx.pops) {
      const k = q.life / q.max;
      const pop = k < 0.12 ? 1 + (1 - k / 0.12) * 0.7 : 1;
      const sx = q.shake && k < 0.3 ? Math.sin(q.life * 0.09) * 7 * (1 - k / 0.3) : 0;
      const x = L.cx + q.dx + sx;
      const y = (q.yAbs || (L.jy - L.rj - 58 + q.dy)) - k * 22;
      const size = Math.round(34 * q.s * pop);
      ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      ctx.font = `900 ${size}px ${FONT}`;
      ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = Math.max(5, size * 0.16);
      ctx.strokeText(q.txt, x, y); ctx.fillStyle = q.c; ctx.fillText(q.txt, x, y);
      ctx.globalAlpha = 1;
    }
    if (fx.flashF === 2) { ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fillRect(0, 0, w, h); }
    else if (fx.flashF === 1) { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
  }
  function drawTut() {
    const cx = L.cx; const cy = L.jy; const rj = L.rj;
    const c = COL[tut.c];
    if (!tut.held) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 19px ${FONT}`; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 5;
      const txt = '고리가 원에 닿으면 같은 색 버튼!';
      ctx.strokeText(txt, cx, cy - rj - 40); ctx.fillStyle = '#fff'; ctx.fillText(txt, cx, cy - rj - 40);
      return;
    }
    ctx.fillStyle = 'rgba(2,4,10,.62)';
    ctx.beginPath(); ctx.rect(0, 0, L.w, L.h); ctx.arc(cx, cy, rj * 1.7, 0, Math.PI * 2, true); ctx.fill();
    const p = 0.5 + 0.5 * Math.sin(clock * 0.012);
    ctx.strokeStyle = hexA(c.hex, 0.5 + 0.5 * p); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, rj * (1.35 + 0.12 * p), 0, Math.PI * 2); ctx.stroke();
    const sx = tut.wrong > 0 ? Math.sin(clock * 0.08) * 10 * tut.wrong : 0;
    const sc = 1 + 0.08 * p;
    ctx.save(); ctx.translate(cx + sx, cy - rj - 92); ctx.scale(sc, sc);
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = `900 52px ${FONT}`;
    const a = '지금! '; const b = c.glyph + c.name;
    const wa = ctx.measureText(a).width; const wb = ctx.measureText(b).width;
    const x0 = -(wa + wb) / 2;
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 10;
    ctx.strokeText(a, x0, 0); ctx.strokeText(b, x0 + wa, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(a, x0, 0);
    ctx.fillStyle = c.hex; ctx.fillText(b, x0 + wa, 0);
    ctx.restore();
    const r = btnEls[tut.c].getBoundingClientRect();
    const bx = r.left + r.width / 2;
    const ay = L.playH - 34 + p * 8;
    ctx.fillStyle = c.hex; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx - 20, ay); ctx.lineTo(bx + 20, ay); ctx.lineTo(bx, ay + 26); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = `800 15px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText('시간이 멈췄어요 · ' + c.name + ' 버튼을 눌러요', cx, cy - rj * 1.7 - 20);
  }
  // 슬로 컷인: 비스듬한 띠 + 큰 글자 · 강반격이면 고른 선장의 컷인 그림
  function drawCut() {
    const c = fx.cut; const k = c.t / c.dur; const w = L.w;
    const inK = easeOutCubic(clamp(k / 0.14, 0, 1));
    const outK = smooth(0.8, 1, k);
    ctx.fillStyle = `rgba(0,0,0,${0.42 * (1 - outK)})`; ctx.fillRect(0, 0, w, L.h);
    const img = c.img ? Art.get(c.img) : null;
    const bh = img ? Math.min(L.h * 0.34, w * 0.72) : (c.strong ? 168 : 138);
    ctx.save();
    ctx.translate(L.cx + (1 - inK) * -w * 1.4 + outK * w * 1.4, L.playH * 0.46);
    ctx.rotate(-0.2);
    const bw = w * 2.2;
    const g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    if (c.strong) { g.addColorStop(0, '#3a0610'); g.addColorStop(0.5, '#8a1020'); g.addColorStop(1, '#2a0408'); }
    else { g.addColorStop(0, '#1b1203'); g.addColorStop(0.5, '#4a3108'); g.addColorStop(1, '#140c02'); }
    ctx.fillStyle = g; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.save(); ctx.beginPath(); ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.clip();
    if (img) {
      // 띠 안을 그림으로 꽉 채우고 (천천히 밀려가는 느낌) 글자 쪽은 어둡게
      ctx.rotate(0.2);
      const sc = Math.max((w * 1.15) / img.width, (bh * 1.3) / img.height);
      const iw = img.width * sc; const ih = img.height * sc;
      ctx.drawImage(img, -iw / 2 - c.t * 0.03, -ih / 2, iw, ih);
      ctx.rotate(-0.2);
      const sh = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.65, 'rgba(0,0,0,.15)'); sh.addColorStop(1, 'rgba(0,0,0,.75)');
      ctx.fillStyle = sh; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    } else {
      ctx.strokeStyle = c.strong ? 'rgba(255,150,120,.28)' : 'rgba(255,220,140,.25)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 26; i++) { const yy = -bh / 2 + ((i * 37) % bh); const xx = ((i * 211 + c.t * 1.6) % bw) - bw / 2; ctx.moveTo(xx, yy); ctx.lineTo(xx - 60 - (i % 5) * 30, yy); }
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#ffd25a'; ctx.fillRect(-bw / 2, -bh / 2 - 6, bw, 6); ctx.fillRect(-bw / 2, bh / 2, bw, 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(-bw / 2, -bh / 2 - 10, bw, 2); ctx.fillRect(-bw / 2, bh / 2 + 8, bw, 2);
    if (!img) drawCompass(-w * 0.3, 0, bh * 0.42, c.t * 0.004, 0.6);
    const punch = 1 + 0.5 * (1 - clamp(k / 0.12, 0, 1));
    ctx.save(); ctx.translate(img ? 0 : w * 0.08, img ? bh * 0.22 : -6); ctx.scale(punch, punch); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const fs = img ? 64 : c.strong ? 82 : 76;
    ctx.font = `900 ${fs}px ${FONT}`;
    ctx.strokeStyle = '#1a0a00'; ctx.lineWidth = 14; ctx.strokeText(c.text, 0, 0);
    const tg = ctx.createLinearGradient(0, -fs / 2, 0, fs / 2);
    tg.addColorStop(0, '#fffbe6'); tg.addColorStop(0.5, c.strong ? '#ffb36b' : '#ffe27a'); tg.addColorStop(1, c.strong ? '#ff3d3d' : '#ffae2b');
    ctx.fillStyle = tg; ctx.fillText(c.text, 0, 0);
    ctx.font = `900 17px ${FONT}`; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.strokeText(c.sub, 0, fs * 0.62); ctx.fillStyle = '#fff'; ctx.fillText(c.sub, 0, fs * 0.62);
    ctx.restore();
    ctx.restore();
  }
  // 별나침반 (오프닝 · 컷인 · 되감기 · 클리어)
  function drawCompass(x, y, R, ang, glow) {
    ctx.save(); ctx.translate(x, y);
    if (glow > 0) {
      const g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 2.2);
      g.addColorStop(0, `rgba(255,220,130,${0.5 * glow})`); g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#2a1c08'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd25a'; ctx.lineWidth = Math.max(2, R * 0.09); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,210,90,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd25a'; ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; const rr = i % 2 ? R * 0.22 : (i % 4 ? R * 0.5 : R * 0.74); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.rotate(ang);
    ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.moveTo(0, -R * 0.82); ctx.lineTo(R * 0.09, 0); ctx.lineTo(-R * 0.09, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8eefb'; ctx.beginPath(); ctx.moveTo(0, R * 0.82); ctx.lineTo(R * 0.09, 0); ctx.lineTo(-R * 0.09, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // 되감기: 빛이 빠지고 은빛 물방울이 오르며 별나침반 바늘이 거꾸로 점점 빨리 돌아요 → 하얗게
  function drawRewind(k, white) {
    const w = L.w; const h = L.h;
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = `rgba(128,128,128,${clamp(k * 1.6, 0, 1)})`; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(10,20,44,${0.25 + 0.35 * k})`; ctx.fillRect(0, 0, w, h);
    // 되감기 줄무늬
    ctx.fillStyle = 'rgba(200,220,255,.07)';
    for (let i = 0; i < 6; i++) { const y = ((clock * 0.4 + i * h / 6) % h); ctx.fillRect(0, h - y, w, 3); }
    drawBubbles();
    const R = Math.min(w, h) * 0.2 * easeOutBack(clamp(k * 2.5, 0, 1));
    if (R > 1) drawCompass(L.cx, h * 0.42, R, -Math.pow(k, 2.2) * 46, 0.6 + 0.4 * k);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 20px ${FONT}`; ctx.lineJoin = 'round';
    ctx.globalAlpha = clamp(k * 3, 0, 1);
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 5;
    ctx.strokeText('별나침반이 시간을 되감아요…', L.cx, h * 0.42 + Math.min(w, h) * 0.2 + 40);
    ctx.fillStyle = '#e8f1ff'; ctx.fillText('별나침반이 시간을 되감아요…', L.cx, h * 0.42 + Math.min(w, h) * 0.2 + 40);
    ctx.globalAlpha = 1;
    if (white && k > 0.78) { ctx.fillStyle = `rgba(255,255,255,${smooth(0.78, 1, k)})`; ctx.fillRect(0, 0, w, h); }
  }
  // 이야기 장면 효과
  function drawSceneFx(b, t) {
    const w = L.w; const h = L.h;
    const f = b.fx || '';
    if (G.weather === 'night') {
      for (const s of P.stars) {
        const a = 0.45 + 0.55 * Math.sin(clock * 0.003 + s.ph);
        ctx.fillStyle = `rgba(255,250,230,${a})`; ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2); ctx.fill();
      }
      for (const q of P.shoot) {
        const k = q.t / q.dur; const x = q.x - k * q.len * 2; const y = q.y + k * q.len;
        const g = ctx.createLinearGradient(x, y, x + q.len, y - q.len * 0.5);
        g.addColorStop(0, `rgba(255,255,255,${1 - k})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + q.len, y - q.len * 0.5); ctx.stroke();
      }
    }
    if (f === 'compass') {
      const k = clamp(t / 700, 0, 1);
      drawCompass(L.cx, h * 0.34, Math.min(w, h) * 0.16 * easeOutBack(k), Math.sin(clock * 0.002) * 0.4, 0.8 + 0.2 * Math.sin(clock * 0.006));
    }
    if (f === 'rewind') drawRewind(clamp(t / 2400, 0, 1), false);
    if (f === 'newstar' || f === 'smoke' || f === 'end') {
      const sx = w * 0.74; const sy = h * 0.16;
      const p = 0.75 + 0.25 * Math.sin(clock * 0.005);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 60 * p);
      g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.2, 'rgba(255,230,160,.8)'); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 60 * p, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,245,210,.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx - 70 * p, sy); ctx.lineTo(sx + 70 * p, sy); ctx.moveTo(sx, sy - 70 * p); ctx.lineTo(sx, sy + 70 * p); ctx.stroke();
      if (f === 'newstar') {
        const cx = w * 0.3; const cy = h * 0.42;
        const target = Math.atan2(sy - cy, sx - cx) + Math.PI / 2;
        const k = clamp(t / 1600, 0, 1);
        drawCompass(cx, cy, Math.min(w, h) * 0.12, lerp(-6, target, easeOutCubic(k)), 0.7);
      }
    }
    if (f === 'smoke' || f === 'end') {
      for (const q of P.smoke) {
        const a = 0.35 * (1 - q.life / q.max);
        ctx.fillStyle = `rgba(150,150,160,${a})`; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (f === 'end') { ctx.fillStyle = 'rgba(2,4,10,.45)'; ctx.fillRect(0, 0, w, h); }
  }

  function render() {
    const w = L.w; const h = L.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05080f'; ctx.fillRect(0, 0, w, h);
    if (G.mode === 'play' || G.mode === 'rewind') {
      const v = view;
      const sh = fx.freeze > 0 ? 0 : TUNE.shake * fx.trauma;
      const sx = sh * (Math.sin(clock * 0.093) * 0.6 + Math.sin(clock * 0.171 + 1) * 0.4);
      const sy = sh * (Math.sin(clock * 0.087 + 2) * 0.6 + Math.sin(clock * 0.149) * 0.4);
      const walk = v && v.walk && !G.ending ? Math.sin(clock * 0.006) * 3 : 0;
      const z = 1 + fx.zoom;
      ctx.save();
      ctx.translate(L.cx + sx, L.ey + sy + walk);
      ctx.rotate(fx.tilt);
      ctx.scale(z, z);
      ctx.translate(-L.cx, -L.ey);
      drawBgLayer(1.04);
      if (v) { drawFoe(v); drawSinking(); drawStrikes(v); }
      drawSpray();
      drawRain();
      if (G.kong && G.kong.spot && G.kong.spot.how === 'rail') drawKong();
      drawRail();
      if (G.kong && G.kong.spot && G.kong.spot.how !== 'rail') drawKong();
      drawBori();
      if (v && G.mode === 'play') drawRings(v);
      drawGunFx();
      drawFxWorld();
      drawPetals();
      ctx.restore();
      drawCoins();
      if (G.mode === 'play') drawOverlays();
      if (G.mode === 'rewind' && G.rw) drawRewind(clamp(G.rw.t / G.rw.dur, 0, 1), true);
    } else {
      // 이야기 장면 · 처음 화면 · 여관: 배경을 천천히 당겨요
      const sc = G.scene && G.scene.b;
      const t = sc ? G.scene.t : clock;
      let sxk = 0; let syk = 0; let rot = 0;
      if (sc && sc.fx === 'sink') { sxk = Math.sin(clock * 0.02) * 6; syk = Math.sin(clock * 0.013) * 5; rot = Math.sin(clock * 0.0015) * 0.04; }
      ctx.save();
      ctx.translate(L.cx + sxk, L.h / 2 + syk); ctx.rotate(rot); ctx.translate(-L.cx, -L.h / 2);
      drawBgLayer(1.04 + Math.min(1, t / 9000) * 0.05);
      ctx.restore();
      drawRain(); drawPetals();
      if (sc) drawSceneFx(sc, t);
      if (G.mode === 'title' || G.mode === 'inn') drawBubbles();
      drawFxWorld();
      drawCoins();
      drawInnPals();
    }
    if (G.white > 0) { ctx.fillStyle = `rgba(255,255,255,${G.white})`; ctx.fillRect(0, 0, w, h); }
    if (fx.flashF > 0) fx.flashF--;
  }

  /* 화면 틀 (체력 · 게이지 · 적 체력) — 바뀔 때만 써요 */
  const hudLast = { hp: -1, ga: -1, eh: -1, full: null, ht: '', lv: '', sh: -1 };
  function bumpShell() { const el = $('shellChip'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function updateHud() {
    const v = view; const h = G.hero;
    if (!v || !h) return;
    const hp = Math.round(v.hp * 200) / 200; const ga = Math.round(v.gauge * 200) / 200; const eh = Math.round(v.ehp * 200) / 200;
    if (hp !== hudLast.hp) { $('hpFill').style.transform = `scaleX(${clamp(hp, 0, 1)})`; hudLast.hp = hp; }
    if (ga !== hudLast.ga) { $('gaFill').style.transform = `scaleX(${clamp(ga, 0, 1)})`; hudLast.ga = ga; }
    if (eh !== hudLast.eh) { $('foeFill').style.transform = `scaleX(${clamp(eh, 0, 1)})`; hudLast.eh = eh; }
    const full = ga >= 1;
    if (full !== hudLast.full) {
      $('gaFill').classList.toggle('full', full); hudLast.full = full;
      Object.keys(btnEls).forEach((c) => btnEls[c].classList.toggle('armed', full && G.W && G.W.cannon));
    }
    const ht = `${Math.max(0, Math.ceil(h.hp))}/${h.st.maxHp}`;
    if (ht !== hudLast.ht) { $('hpTxt').textContent = ht; hudLast.ht = ht; }
    const lv = 'Lv ' + h.lv;
    if (lv !== hudLast.lv) { $('lvTxt').textContent = lv; hudLast.lv = lv; }
    if (h.shell !== hudLast.sh) { $('shellChip').textContent = '🐚 ' + h.shell; hudLast.sh = h.shell; }
  }

  /* ================================================================
     입력 (버튼 3개 · 키보드 a/s/d · 장면은 아무 데나 눌러서)
     ================================================================ */
  function onPress(c) {
    audioInit();
    if (G.setOpen) return;
    if (G.mode === 'scene') { tapScene(); return; }
    if (G.mode === 'inn') { const n = D.meta.nodes.find((x) => x.c === c); if (n) buyNode(n.id); return; }
    if (G.mode === 'stats') { const k = Object.keys(STAT_COL).find((x) => STAT_COL[x] === c); if (k) addStat(k); return; }
    if (G.mode === 'shop') return;
    if (G.mode !== 'play' || G.ending) return;
    const W = G.W; const h = G.hero;
    if (W.phase === 'cards' && h.cards) { pickSlot(IDX[c]); return; }
    if (tut && !tut.done) {
      // 첫 공격: 멈추기 전에는 누름을 받지 않아요 (반드시 성공하게) · 멈춘 뒤에는 그 색만 받아요
      if (tut.held) {
        if (c === tut.c) {
          tut.done = true; tut.held = false; G.tutDone = true;
          setTutBtn(null);
          S.press(W, h, c, W.t);
          drain();
        } else { tut.wrong = 1; sndFail(); }
      }
      return;
    }
    if (h.kind === 'bot') return;
    S.press(W, h, c, W.t);
    drain();
  }
  function onRelease(c) { if (G.mode === 'play' && G.W && G.hero) S.release(G.W, G.hero, c); }
  Object.keys(btnEls).forEach((c) => {
    const b = btnEls[c];
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (er) { /* 괜찮아요 */ } onPress(c); });
    const up = () => { b.classList.remove('down'); onRelease(c); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  const KEY = { a: 'r', s: 'g', d: 'b', 1: 'r', 2: 'g', 3: 'b' };
  window.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if ((k === ' ' || k === 'enter') && G.mode === 'scene') { e.preventDefault(); audioInit(); tapScene(); return; }
    const c = KEY[k];
    if (!c || e.repeat) return;
    if (btnEls[c]) btnEls[c].classList.add('down');
    onPress(c);
  });
  window.addEventListener('keyup', (e) => {
    const c = KEY[(e.key || '').toLowerCase()];
    if (!c) return;
    if (btnEls[c]) btnEls[c].classList.remove('down');
    onRelease(c);
  });
  cv.addEventListener('pointerdown', (e) => { if (G.mode === 'play') { audioInit(); tapKong(e.clientX, e.clientY); } });
  $('titleSet').addEventListener('click', () => { audioInit(); openSettings(); });
  $('innSet').addEventListener('click', () => { audioInit(); openSettings(); });
  $('setClose').addEventListener('click', () => { sndCard(); closeSettings(); });
  $('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });
  $('themeRow').addEventListener('click', (e) => { const b = e.target.closest('.theme'); if (b) { audioInit(); pickTheme(b.dataset.th); } });
  $('sayTap').addEventListener('pointerdown', (e) => { e.preventDefault(); audioInit(); tapScene(); });
  $('say').addEventListener('pointerdown', (e) => { e.preventDefault(); audioInit(); tapScene(); });
  $('skip').addEventListener('click', () => { audioInit(); sndCard(); endScene(); });
  document.querySelectorAll('.hero').forEach((b) => b.addEventListener('click', () => { audioInit(); pickHero(b.dataset.g); }));
  $('cardRow').addEventListener('click', (e) => { const b = e.target.closest('.card'); if (b) { audioInit(); pickSlot(Number(b.dataset.slot)); } });
  $('reroll').addEventListener('click', () => { if (G.W && S.reroll(G.W, G.hero)) { sndCardsIn(); G.cardsKey = ''; drain(); } });
  $('nodeRow').addEventListener('click', (e) => { const b = e.target.closest('.node'); if (b && !b.disabled) { audioInit(); buyNode(b.dataset.node); } });
  $('innGo').addEventListener('click', () => { audioInit(); depart(); });
  ['wRow', 'aRow'].forEach((id) => $(id).addEventListener('click', (e) => { const b = e.target.closest('.item'); if (b) { audioInit(); buyItem(b.dataset.id); } }));
  $('shopGo').addEventListener('click', () => { audioInit(); if (clock - G.shopAt > 400) leaveShop(); });
  $('statRows').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.k) { audioInit(); addStat(b.dataset.k); } });
  $('statUndo').addEventListener('click', () => { audioInit(); undoStats(); });
  $('statGo').addEventListener('click', () => { audioInit(); doneStats(); });
  function leave() {
    try {
      if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { history.back(); return; }
    } catch (e) { /* 아래로 */ }
    location.href = Art.root + '../';
  }
  $('innExit').addEventListener('click', leave);
  $('titleExit').addEventListener('click', leave);
  $('exit').addEventListener('click', () => {
    if (G.mode === 'play' && !G.ending && !confirm('모험을 그만할까요?\n(지금까지의 회귀 기록은 남아요)')) return;
    showTitle();
  });
  document.addEventListener('pointerdown', () => audioInit(), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!AU.ctx) return;
    if (document.hidden) AU.ctx.suspend(); else AU.ctx.resume();
  });

  /* ================================================================
     돌리기
     ================================================================ */
  let last = performance.now();
  function frame(nowT) {
    requestAnimationFrame(frame);
    const dt = Math.min(50, Math.max(0, nowT - last));
    last = nowT;
    tickFrame(dt);
  }
  function tickFrame(dt) {
    clock += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      const x = timers[i];
      if (x.tk !== G.token) { timers.splice(i, 1); continue; }
      if (clock >= x.at) { timers.splice(i, 1); x.fn(); }
    }
    if (bannerT && clock > bannerT) { $('banner').classList.remove('on'); bannerT = 0; }
    try {
      if (G.mode === 'play') updatePlay(dt);
      updateScene(dt);
      updateTalk();
      updateFx(dt);
      render();
      if (G.mode === 'play') updateHud();
    } catch (e) { console.error(e); }
  }

  window.addEventListener('resize', layout);
  layout();
  showTitle();
  requestAnimationFrame(frame);

  // 시험 손잡이
  window.__ch1 = {
    get G() { return G; }, get fx() { return fx; }, get mode() { return G.mode; }, get tut() { return tut; }, get view() { return view; }, get chain() { return chain; },
    // 시험용: 화면이 가려져 프레임이 느릴 때 ms 만큼 16ms 씩 직접 돌려요
    run(ms) { for (let k = 0; k < ms; k += 16) tickFrame(16); return G.mode; },
    input: onPress, pickHero, tapScene, skip: endScene, depart, showTitle, showInn,
    buy: buyItem, leaveShop, addStat, undoStats, doneStats, get hero() { return G.hero; },
    meta: () => Meta.get(), resetMeta: () => Meta.reset(),
    kongPos, tapKong, get sink() { return G.sink; }, openSettings, closeSettings, pickTheme, art: Art
  };
})();
