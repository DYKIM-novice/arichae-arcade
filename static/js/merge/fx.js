/* 머지관 · 손맛 (소리 WebAudio · 진동 · 반짝이 가루 · 날아가는 동전)
   - 소리는 파일 없이 합성해요. 악기 4가지(가야금 뜯기 Karplus-Strong · 피리 · 해금 · 작은 북/목탁/종/징)를
     효과음과 배경음악(music.js)이 같이 써요 → F.inst
   - 소리 길: 효과음 → sfx 크기 ┐                       ┌→ 잔향(잡음으로 만든 1.5초 · 파일 없음)
              배경음 → 배경음 크기 → 덕킹(효과음 때 살짝 낮춤) ┴→ 낮은 통과 7kHz → 컴프레서 → 스피커
   - 처음 손가락이 닿을 때 unlock() (휴대폰은 사용자 동작 뒤에만 소리가 나요) · 탭을 숨기면 suspend
   - prefers-reduced-motion 이거나 설정 '움직임 줄이기'면 가루를 줄이고 튀는 움직임을 끄게 reduced 를 알려 줘요
   - 크기: 효과음·배경음 각각 0~100 (설정 슬라이더) */
(function (root) {
  'use strict';

  let ac = null, master = null, musicIn = null, bgmBus = null, duckG = null, lp = null, comp = null, conv = null;
  const opt = { sfx: true, vib: true, vol: 65, bgm: true, bgmVol: 60, calm: false };
  const sfxGain = (v) => 0.36 * Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.3);
  const bgmGain = (v) => 0.4 * Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.6);
  const sysReduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const isReduced = () => sysReduced || !!opt.calm;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // 맑은 오음 음계 사다리 (단계가 오를수록 한 칸씩 위: 도레미솔라)
  const LADDER = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];

  /* ---------- 악기 (어느 AudioContext 에서나: 실시간·오프라인 시험 둘 다) ---------- */
  const noiseCache = new WeakMap(), ksCache = new WeakMap(), irCache = new WeakMap(), pwCache = new WeakMap();
  // 피아노 음색 (배음 세기 · 한 번 만들어 둠)
  function pianoWave(ctx) {
    let w = pwCache.get(ctx);
    if (!w) {
      const amp = [0, 1, 0.42, 0.2, 0.13, 0.07, 0.045, 0.025, 0.014, 0.008];
      const re = new Float32Array(amp.length), im = new Float32Array(amp);
      w = ctx.createPeriodicWave(re, im);
      pwCache.set(ctx, w);
    }
    return w;
  }
  function noiseBuf(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(ctx, b);
    }
    return b;
  }
  // 가야금 뜯기: Karplus-Strong 을 한 번 계산해서 버퍼로 (음마다 한 번 · 그 뒤로는 재생만 → 휴대폰도 가벼움)
  function ksBuf(ctx, midi) {
    let m = ksCache.get(ctx);
    if (!m) { m = new Map(); ksCache.set(ctx, m); }
    const key = Math.round(midi);
    if (m.has(key)) return m.get(key);
    const sr = ctx.sampleRate, f = mtof(key);
    const dur = key < 52 ? 2.4 : key < 64 ? 1.9 : key < 76 ? 1.4 : 1.0;
    const len = Math.floor(sr * dur), N = Math.max(4, Math.floor(sr / f - 0.5));
    const buf = ctx.createBuffer(1, len, sr), y = buf.getChannelData(0);
    let l = 0, mean = 0;
    for (let i = 0; i < N; i++) { l += ((Math.random() * 2 - 1) - l) * 0.55; y[i] = l; mean += l; }
    mean /= N;
    for (let i = 0; i < N; i++) y[i] -= mean;
    const rho = key < 55 ? 0.9985 : key < 70 ? 0.997 : 0.995;
    y[N] = rho * y[0];
    for (let i = N + 1; i < len; i++) y[i] = rho * 0.5 * (y[i - N] + y[i - N - 1]);
    let pk = 0;
    for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(y[i]));
    const tail = Math.floor(sr * 0.08);
    for (let i = 0; i < len; i++) { y[i] = (y[i] / (pk || 1)) * 0.9; if (i > len - tail) y[i] *= (len - i) / tail; }
    const v = { buf, rate: f / (sr / (N + 0.5)) };
    m.set(key, v);
    return v;
  }
  function envG(ctx, dest, t, a, peak, hold, rel) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) g.gain.setValueAtTime(peak * 0.85, t + a + hold);
    g.gain.setTargetAtTime(0.0001, t + a + Math.max(0, hold), rel / 3);
    g.connect(dest);
    return g;
  }
  const inst = {
    // 가야금: 살짝 위에서 미끄러져 내려오는 농현(+20cent → 0, 50ms) · len 을 주면 그만큼만 울림
    pluck(dest, t, midi, vel, len, noBend) {
      const ctx = dest.context;
      const k = ksBuf(ctx, midi);
      const s = ctx.createBufferSource();
      s.buffer = k.buf;
      const r = k.rate * Math.pow(2, (midi - Math.round(midi)) / 12);
      if (noBend) s.playbackRate.setValueAtTime(r, t);
      else { s.playbackRate.setValueAtTime(r * 1.0116, t); s.playbackRate.linearRampToValueAtTime(r, t + 0.05); }
      const g = ctx.createGain();
      g.gain.setValueAtTime(vel, t);
      if (len) g.gain.setTargetAtTime(0.0001, t + len, 0.06);
      s.connect(g); g.connect(dest);
      s.start(t); s.stop(t + (len ? Math.min(k.buf.duration, len + 0.4) : k.buf.duration));
    },
    // 피리(대금·소금 느낌): 사인 + 약한 2배음 + 숨소리 + 늦게 오는 떨림(5Hz ±8cent) · 부드러운 시작 80ms
    flute(dest, t, midi, dur, vel) {
      const ctx = dest.context, f = mtof(midi);
      const g = envG(ctx, dest, t, 0.08, vel, Math.max(0.02, dur - 0.1), 0.18);
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t);
      o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2, t); g2.gain.value = 0.12;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(dur > 0.5 ? 8 : 3, t + Math.min(0.45, dur));
      lfo.connect(lg); lg.connect(o.detune); lg.connect(o2.detune);
      o.connect(g); o2.connect(g2); g2.connect(g);
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = noiseBuf(ctx); bp.type = 'bandpass'; bp.frequency.value = Math.min(8000, f * 2.2); bp.Q.value = 1.2;
      ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.09, t + 0.03); ng.gain.setTargetAtTime(0.035, t + 0.06, 0.05);
      n.connect(bp); bp.connect(ng); ng.connect(g);
      const end = t + dur + 0.6;
      [o, o2, lfo, n].forEach((x) => { x.start(t); x.stop(end); });
    },
    // 해금 같은 긴 음: 톱니파 → 낮은 통과 1.2kHz · 느린 시작 · 밑에서 살짝 밀어 올림
    haegeum(dest, t, midi, dur, vel) {
      const ctx = dest.context, f = mtof(midi);
      const g = envG(ctx, dest, t, 0.16, vel * 0.42, Math.max(0.02, dur - 0.2), 0.3);
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      o.detune.setValueAtTime(-35, t); o.detune.linearRampToValueAtTime(0, t + 0.12);
      fl.type = 'lowpass'; fl.frequency.value = 1200; fl.Q.value = 0.6;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(dur > 0.6 ? 12 : 4, t + Math.min(0.6, dur));
      lfo.connect(lg); lg.connect(o.detune);
      o.connect(fl); fl.connect(g);
      [o, lfo].forEach((x) => { x.start(t); x.stop(t + dur + 1); });
    },
    // 부드러운 피아노: 배음 파형 2개(±3cent 살짝 어긋나 따뜻하게) → 밝기 필터(치는 순간 밝고 점점 어두워짐)
    //  소리 크기: 4ms 에 올라 → 빠르게 한 번 줄고 → 낮은 음일수록 길게 사라짐 · 손을 떼면(dur) 0.3초에 걸쳐 멈춤 (페달처럼 dur 을 길게 주면 이어 울림)
    piano(dest, t, midi, dur, vel) {
      const ctx = dest.context, f = mtof(midi), w = pianoWave(ctx);
      const g = ctx.createGain(), fl = ctx.createBiquadFilter();
      const off = t + Math.max(0.3, dur);
      const tau = Math.max(0.7, Math.min(3.2, 3.2 - (midi - 40) * 0.055));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.005);
      g.gain.setTargetAtTime(vel * 0.5, t + 0.005, 0.1);
      g.gain.setTargetAtTime(0.0001, t + 0.28, tau);
      g.gain.setTargetAtTime(0.0001, off, 0.3);
      fl.type = 'lowpass'; fl.Q.value = 0.4;
      const bright = Math.min(9000, f * (2.5 + vel * 9));
      fl.frequency.setValueAtTime(bright, t);
      fl.frequency.setTargetAtTime(Math.max(300, f * 1.6), t + 0.01, 0.5);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), h = ctx.createGain();
      o1.setPeriodicWave(w); o2.setPeriodicWave(w);
      o1.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f, t);
      o1.detune.value = 3; o2.detune.value = -3; h.gain.value = 0.5;
      o1.connect(h); o2.connect(h); h.connect(fl); fl.connect(g); g.connect(dest);
      // 망치 소리: 아주 작은 '톡'
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = noiseBuf(ctx); bp.type = 'bandpass'; bp.frequency.value = Math.min(6000, f * 3); bp.Q.value = 0.9;
      ng.gain.setValueAtTime(vel * 0.05, t); ng.gain.setTargetAtTime(0.0001, t + 0.002, 0.006);
      n.connect(bp); bp.connect(ng); ng.connect(dest);
      const end = off + 1.3;
      o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
      n.start(t, Math.random()); n.stop(t + 0.05);
    },
    // 작은 북·나무·쇠: k 장구 쿵 · t 딱 · m 목탁 · c 작은 꽹과리 · b 작은 종 · g 징
    drum(dest, t, kind, vel) {
      const ctx = dest.context;
      const sine = (f0, f1, d, v, type) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.setTargetAtTime(0.0001, t + 0.006, d / 4);
        o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + 0.1);
      };
      const noise = (hp, d, v, lpf) => {
        const n = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        n.buffer = noiseBuf(ctx); fl.type = lpf ? 'bandpass' : 'highpass'; fl.frequency.value = hp; if (lpf) fl.Q.value = 0.8;
        g.gain.setValueAtTime(v, t); g.gain.setTargetAtTime(0.0001, t + 0.002, d / 4);
        n.connect(fl); fl.connect(g); g.connect(dest); n.start(t, Math.random() * 1); n.stop(t + d + 0.05);
      };
      if (kind === 'k') { sine(120, 58, 0.3, vel); noise(180, 0.05, vel * 0.18, true); }
      else if (kind === 't') { noise(2400, 0.035, vel * 0.5); sine(420, 380, 0.04, vel * 0.25); }
      else if (kind === 'm') { sine(820, 790, 0.09, vel * 0.7); sine(1290, 1270, 0.05, vel * 0.25); }
      else if (kind === 'c') { sine(2140, 2140, 0.12, vel * 0.18, 'square'); sine(3170, 3170, 0.09, vel * 0.12); noise(6000, 0.05, vel * 0.12); }
      else if (kind === 'b') { const f = 1568; [[1, 0.5, 1.3], [2.76, 0.18, 0.8], [5.4, 0.08, 0.4]].forEach(([r, v, d]) => sine(f * r, f * r, d, vel * v)); }
      else if (kind === 'g') { [[110, 0.6, 2.6], [164.8, 0.25, 2.0], [221, 0.2, 1.6], [330.5, 0.08, 1.0]].forEach(([fq, v, d]) => sine(fq * 1.006, fq, d, vel * v)); }
    }
  };
  // 잔향: 잡음으로 만든 1.5초 임펄스 (파일 없음)
  function reverb(ctx) {
    let c = irCache.get(ctx);
    if (c) return c;
    const sr = ctx.sampleRate, len = Math.floor(sr * 1.5);
    const ir = ctx.createBuffer(1, len, sr);   // 한 채널 (휴대폰 CPU 반으로)
    const d = ir.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    c = ctx.createConvolver(); c.buffer = ir;
    irCache.set(ctx, c);
    return c;
  }
  // 소리 길 만들기 (실시간·오프라인 같은 모양) → { sfx, music, bgm, duck }
  function buildGraph(ctx, out) {
    const cmp = ctx.createDynamicsCompressor();
    cmp.threshold.value = -14; cmp.ratio.value = 4; cmp.attack.value = 0.005; cmp.release.value = 0.2;
    const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 7000; low.Q.value = 0.5;
    low.connect(cmp); cmp.connect(out || ctx.destination);
    const sfx = ctx.createGain(); sfx.connect(low);
    const music = ctx.createGain();
    const bgm = ctx.createGain();
    const duck = ctx.createGain();
    music.connect(bgm); bgm.connect(duck); duck.connect(low);
    const rv = reverb(ctx), ms = ctx.createGain(), ss = ctx.createGain();
    ms.gain.value = 0.32; ss.gain.value = 0.14;
    duck.connect(ms); ms.connect(rv); sfx.connect(ss); ss.connect(rv); rv.connect(low);
    return { sfx, music, bgm, duck, low, cmp, rv };
  }

  function unlock() {
    try {
      if (!ac) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        const g = buildGraph(ac);
        master = g.sfx; musicIn = g.music; bgmBus = g.bgm; duckG = g.duck; lp = g.low; comp = g.cmp; conv = g.rv;
        master.gain.value = sfxGain(opt.vol);
        bgmBus.gain.value = 0;
        duckG.gain.value = duckBase;
        document.addEventListener('visibilitychange', () => {
          try { if (document.hidden) ac.suspend(); else ac.resume(); } catch (e) { /* 무시 */ }
        });
      }
      if (ac.state === 'suspended' && !document.hidden) ac.resume();
      applyVol(true);
      if (root.MergeMusic) root.MergeMusic.wake();
    } catch (e) { ac = null; }
  }
  let firstOn = true;
  function applyVol(fadeIn) {
    try {
      if (!ac) return;
      const t = ac.currentTime;
      master.gain.setTargetAtTime(opt.sfx ? sfxGain(opt.vol) : 0, t, 0.05);
      const target = opt.bgm ? bgmGain(opt.bgmVol) : 0;
      bgmBus.gain.cancelScheduledValues(t);
      bgmBus.gain.setValueAtTime(bgmBus.gain.value, t);
      // 첫 톡 뒤 2초에 걸쳐 살며시 · 그 뒤로는 바로바로
      if (fadeIn && firstOn && target > 0) { bgmBus.gain.linearRampToValueAtTime(target, t + 2); firstOn = false; }
      else bgmBus.gain.setTargetAtTime(target, t, 0.12);
    } catch (e) { /* 무시 */ }
  }
  // 덕킹: 효과음이 날 때 배경음을 0.12초 동안 -6dB → 0.6초에 걸쳐 복귀 · 대사창이 열려 있으면 기본 -4dB
  let duckBase = 1;
  function duck(db) {
    if (!ac || !duckG) return;
    const t = ac.currentTime, low = duckBase * Math.pow(10, -(db || 6) / 20);
    duckG.gain.cancelScheduledValues(t);
    duckG.gain.setValueAtTime(Math.min(duckG.gain.value, duckBase), t);
    duckG.gain.linearRampToValueAtTime(low, t + 0.03);
    duckG.gain.setValueAtTime(low, t + 0.15);
    duckG.gain.linearRampToValueAtTime(duckBase, t + 0.75);
  }
  function talkDuck(on) {
    duckBase = on ? Math.pow(10, -4 / 20) : 1;
    if (!ac || !duckG) return;
    duckG.gain.setTargetAtTime(duckBase, ac.currentTime, 0.2);
  }
  // 설정이 바뀌면 화면이 불러요
  function setOpt(o) {
    const was = opt.bgm;
    Object.assign(opt, o || {});
    applyVol(false);
    if (root.MergeMusic && was !== opt.bgm) root.MergeMusic.wake();
  }

  /* ---------- 효과음 (같은 악기로: 가야금 뜯기 · 목탁 · 작은 종 · 징) ---------- */
  const on = () => !!(ac && opt.sfx && ac.state !== 'closed');
  const now = (d) => ac.currentTime + (d || 0);
  const P = (m, v, d, len) => inst.pluck(master, now(d), m, v, len);
  const Dr = (k, v, d) => inst.drum(master, now(d), k, v);
  const Fl = (m, dur, v, d) => inst.flute(master, now(d), m, dur, v);
  // 엽전 짤랑: 쇠붙이 몇 개가 부딪히는 소리
  function jingle(d, n) {
    for (let i = 0; i < (n || 3); i++) {
      const t = now((d || 0) + i * 0.045 + Math.random() * 0.02);
      const o = ac.createOscillator(), g = ac.createGain(), f = 3200 + Math.random() * 1600;
      o.type = 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.003); g.gain.setTargetAtTime(0.0001, t + 0.005, 0.03);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
    }
  }
  // 사르륵: 모래가 벗겨지는 잡음 쓸림
  function sweep(d) {
    const t = now(d || 0);
    const n = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    n.buffer = noiseBuf(ac); fl.type = 'bandpass'; fl.Q.value = 1.4;
    fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(3800, t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.05); g.gain.setTargetAtTime(0.0001, t + 0.12, 0.06);
    n.connect(fl); fl.connect(g); g.connect(master); n.start(t, Math.random()); n.stop(t + 0.5);
  }
  const lad = (tier) => LADDER[Math.max(0, Math.min(LADDER.length - 1, (tier || 2) - 2))];
  const SFX = {
    pick() { Dr('m', 0.22); },
    drop() { Dr('m', 0.18); inst.drum(master, now(0.012), 't', 0.12); },
    swap() { Dr('m', 0.2); Dr('m', 0.16, 0.07); },
    spawn() { Dr('m', 0.45); P(84, 0.14, 0.03, 0.18); },        // 발생기 톡: 목탁 '똑'
    merge(tier) {                                                // 단계가 높을수록 한 칸씩 위 (오음 음계 사다리)
      const m = lad(tier);
      P(m - 12, 0.3, 0, 0.5); P(m, 0.42, 0.04); P(m + 7, 0.16, 0.1, 0.4);
      Dr('b', 0.1, 0.08);
      duck(5);
    },
    discover() { [0, 2, 4, 5, 7].forEach((i, k) => P(LADDER[i] + 0, 0.24, 0.16 + k * 0.07)); Dr('b', 0.22, 0.5); },
    maxed() { [0, 2, 4, 7].forEach((i, k) => P(LADDER[i] + 12, 0.22, 0.12 + k * 0.06)); Dr('g', 0.3, 0.1); duck(6); },
    deliver() { [72, 76, 79].forEach((m, k) => P(m, 0.36, k * 0.08)); jingle(0.26, 4); Dr('b', 0.16, 0.3); duck(6); },   // 가야금 3음 올림 + 엽전
    coin() { jingle(0, 2); },
    star() { Dr('b', 0.3); P(91, 0.14, 0.04, 0.3); },
    bad() { Dr('m', 0.15); inst.drum(master, now(0.07), 'm', 0.1); P(55, 0.22, 0, 0.25, true); },
    open() { P(79, 0.16, 0, 0.3); P(84, 0.14, 0.05, 0.3); },
    close() { P(84, 0.12, 0, 0.3); P(79, 0.12, 0.05, 0.3); },
    hammer() { [0, 0.16, 0.32].forEach((d) => { Dr('t', 0.5, d); Dr('m', 0.35, d); }); },
    build() { Dr('g', 0.55); Dr('b', 0.28, 0.06); P(84, 0.24, 0.1); P(88, 0.2, 0.16); duck(8); },
    sand() { sweep(0); },
    thanks() { [79, 81, 84].forEach((m, k) => P(m, 0.24, k * 0.07)); Dr('b', 0.14, 0.24); },
    secret() { [76, 79, 84, 88].forEach((m, k) => P(m, 0.22, k * 0.07)); Dr('b', 0.2, 0.3); },
    auto() { Dr('t', 0.3); Dr('m', 0.3, 0.05); P(88, 0.16, 0.08, 0.3); }
  };
  function sfx(name, arg) { try { if (on() && SFX[name]) SFX[name](arg); } catch (e) { /* 소리 실패는 무시 */ } }
  // 짧은 징글 (data.js MUSIC.jingles): 건물 완성 · 지역 완성 · 엔딩 · 출석
  function jingleSong(id) {
    try {
      if (!on()) return;
      const J = root.MergeData && root.MergeData.MUSIC && root.MergeData.MUSIC.jingles[id];
      if (!J) return;
      const st8 = 60 / J.bpm / 2, t0 = now(0.03);
      const M = root.MergeMusic;
      J.notes.forEach((n) => {
        const m = M ? M.midi(n[0]) : 72, t = t0 + n[1] * st8;
        if (n[2] === 'flute') inst.flute(master, t, m, (n[3] || 1) * st8 * 1.1, 0.3);
        else inst.pluck(master, t, m, 0.34);
      });
      if (J.bell != null) inst.drum(master, t0 + J.bell * st8, 'b', 0.24);
      if (J.gong != null) inst.drum(master, t0 + J.gong * st8, 'g', 0.4);
      const len = J.notes.reduce((s, n) => Math.max(s, n[1] + (n[3] || 1)), 0) * st8;
      if (duckG) {   // 징글이 끝날 때까지 배경음을 -9dB
        const t = ac.currentTime, low = duckBase * 0.35;
        duckG.gain.cancelScheduledValues(t);
        duckG.gain.setTargetAtTime(low, t, 0.06);
        duckG.gain.setTargetAtTime(duckBase, t + len + 0.4, 0.4);
      }
    } catch (e) { /* 무시 */ }
  }
  function vibrate(ms) { try { if (opt.vib && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* 무시 */ } }
  const canVibrate = () => { try { return typeof navigator.vibrate === 'function'; } catch (e) { return false; } };

  /* ---------- 반짝이 가루 (화면 위 투명 캔버스 한 장) ---------- */
  let cv = null, cx = null, parts = [], raf = 0, dpr = 1;
  function attach(canvas) {
    cv = canvas; cx = cv.getContext('2d');
    const fit = () => { dpr = Math.min(2, root.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    fit(); addEventListener('resize', fit);
  }
  function star(x, y, r, rot) {
    cx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + i * Math.PI / 4, rr = i % 2 ? r * 0.38 : r;
      cx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    cx.closePath(); cx.fill();
  }
  function heart(x, y, r, rot) {
    cx.save(); cx.translate(x, y); cx.rotate(rot); cx.beginPath();
    cx.moveTo(0, r * 0.35);
    cx.bezierCurveTo(-r * 1.1, -r * 0.35, -r * 0.45, -r * 1.05, 0, -r * 0.45);
    cx.bezierCurveTo(r * 0.45, -r * 1.05, r * 1.1, -r * 0.35, 0, r * 0.35);
    cx.closePath(); cx.fill(); cx.restore();
  }
  function frame() {
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.clearRect(0, 0, cv.width, cv.height);
    const now = performance.now();
    parts = parts.filter((p) => now - p.t0 < p.life);
    parts.forEach((p) => {
      const k = (now - p.t0) / p.life;
      if (p.ring) {
        cx.globalAlpha = (1 - k) * 0.8;
        cx.strokeStyle = p.col; cx.lineWidth = 4 * (1 - k) + 1;
        cx.beginPath(); cx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - k, 3)), 0, Math.PI * 2); cx.stroke();
        return;
      }
      const e = 1 - Math.pow(1 - k, 2);
      const x = p.x + p.vx * e, y = p.y + p.vy * e + p.g * k * k;
      cx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      cx.fillStyle = p.col;
      if (p.heart) heart(x, y, p.r * (k < 0.15 ? k / 0.15 : 1), Math.sin(k * 9 + p.rot) * 0.3);
      else if (p.star) star(x, y, p.r * (1 - k * 0.5), p.rot + k * 3);
      else { cx.beginPath(); cx.arc(x, y, p.r * (1 - k), 0, Math.PI * 2); cx.fill(); }
    });
    cx.globalAlpha = 1;
    raf = parts.length ? requestAnimationFrame(frame) : 0;
    if (!parts.length) cx.clearRect(0, 0, cv.width, cv.height);
  }
  function kick() { if (!raf && cx) raf = requestAnimationFrame(frame); }
  // 터지는 반짝이: 위치 · 색들 · 개수 · 세기
  function burst(x, y, cols, count, power) {
    if (!cx) return;
    const t0 = performance.now();
    const n = isReduced() ? Math.ceil((count || 14) / 3) : (count || 14);
    const pw = power || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (28 + Math.random() * 46) * pw;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10 * pw, g: 26, r: 3 + Math.random() * 4 * pw,
        col: cols[i % cols.length], star: i % 3 !== 2, rot: Math.random() * 3, t0, life: 520 + Math.random() * 380 });
    }
    parts.push({ ring: true, x, y, r0: 8, r1: 40 * pw, col: cols[0], t0, life: 420 });
    kick();
  }

  // 하트가 동동 떠올라요 (건네기 반응)
  function hearts(x, y, count) {
    if (!cx) return;
    const t0 = performance.now();
    const n = isReduced() ? 3 : (count || 9);
    const cols = ['#ff6f91', '#ff9eb5', '#ffc2d1', '#f5c142'];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const sp = 40 + Math.random() * 46;
      parts.push({ x: x + (Math.random() - 0.5) * 24, y, vx: Math.cos(a) * sp * 0.7, vy: Math.sin(a) * sp, g: -20, r: 6 + Math.random() * 5,
        col: cols[i % cols.length], heart: i % 4 !== 3, star: true, rot: Math.random() * 3, t0: t0 + i * 25, life: 900 + Math.random() * 400 });
    }
    kick();
  }

  /* ---------- 날아가는 아이콘 (주문 → 동전·별 칸, 판 → 주문 카드) ---------- */
  function fly(html, from, to, opts) {
    const o = opts || {};
    const n = o.count || 1;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'mg-fly';
      el.innerHTML = html;
      const sz = o.size || 30;
      el.style.width = el.style.height = sz + 'px';
      const jx = (Math.random() - 0.5) * (o.spread || 30), jy = (Math.random() - 0.5) * (o.spread || 30);
      el.style.transform = `translate(${from.x - sz / 2 + jx}px, ${from.y - sz / 2 + jy}px) scale(${o.s0 || 1})`;
      document.body.appendChild(el);
      const delay = i * (o.stagger || 70);
      setTimeout(() => {
        el.style.transition = `transform ${o.ms || 560}ms cubic-bezier(.5,-0.35,.6,1), opacity ${o.ms || 560}ms ease-in`;
        el.style.transform = `translate(${to.x - sz / 2}px, ${to.y - sz / 2}px) scale(${o.s1 == null ? 0.6 : o.s1})`;
        if (o.fade) el.style.opacity = '0.2';
      }, 20 + delay);
      setTimeout(() => { el.remove(); if (o.onEach) o.onEach(i); }, 20 + delay + (o.ms || 560));
    }
  }

  // 빨려 들어가기: 둘레의 가루가 가운데로 모였다가(0.18초) → 그 뒤에 burst 로 '펑'
  function implode(x, y, cols, count, radius) {
    if (!cx || isReduced()) return;
    const t0 = performance.now(), n = count || 10, R = radius || 34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, rr = R * (0.8 + Math.random() * 0.4);
      parts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr, vx: -Math.cos(a) * rr, vy: -Math.sin(a) * rr, g: 0, r: 2.5 + Math.random() * 2.5,
        col: cols[i % cols.length], star: i % 2 === 0, rot: a, t0, life: 190 });
    }
    kick();
  }
  root.MergeFx = { unlock, sfx, vibrate, canVibrate, attach, burst, hearts, implode, fly, setOpt, opt, duck, talkDuck, jingle: jingleSong, inst, buildGraph, mtof,
    get ac() { return ac; }, get music() { return musicIn; }, get reduced() { return isReduced(); } };
})(window);
