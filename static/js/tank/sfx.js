/* 노을언덕 포격대 · 소리 (Web Audio 합성만 — 외부 음원·네트워크 없음)
   - 타이틀·대기실: 신나는 팝 배경음(124BPM, 4마디×4 패턴 순환)
   - 게임 중: 음악 끄고 효과음만 (발사·폭발·피격·추락·이동)
   - 음소거는 localStorage 'tank_mute' 에 기억, 모바일은 첫 터치 뒤 재생 */
(function () {
  'use strict';
  const KEY = 'tank_mute';
  let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { /* 저장 막힘 */ }
  let wantMusic = false, musicOn = false, timer = 0, nextT = 0, step = 0;
  const listeners = [];

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() {
    if (!init()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (wantMusic && !musicOn) startMusic();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* 무시 */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.03);
    listeners.forEach((f) => f(muted));
  }

  // ---- 악기
  function env(g, t, a, peak, dec, sus, rel, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sus), t + a + dec);
    g.gain.setValueAtTime(Math.max(0.0001, sus), end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
  }
  function tone(bus, type, f, t, dur, vol, opts) {
    opts = opts || {};
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slide), t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    let node = o;
    if (opts.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = opts.lp; fl.Q.value = opts.q || 0.7; o.connect(fl); node = fl; }
    node.connect(g); g.connect(bus);
    env(g, t, opts.a || 0.005, vol, opts.d || dur * 0.5, vol * (opts.s == null ? 0.5 : opts.s), opts.r || 0.06, t + dur);
    o.start(t); o.stop(t + dur + (opts.r || 0.06) + 0.05);
  }
  function noise(bus, t, dur, vol, type, freq, q, opts) {
    opts = opts || {};
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq || 1000, t); f.Q.value = q || 0.7;
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
    const g = ctx.createGain();
    s.connect(f); f.connect(g); g.connect(bus);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // ---- 배경음 (팝: C - G - Am - F, 밝은 신스 리드)
  const BPM = 124, SPB = 60 / BPM, S16 = SPB / 4;
  const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const CH = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
  const BASS = [36, 43, 45, 41];
  // 멜로디 4마디 × 2벌 (16분음 칸, 0 = 쉼)
  const MEL = [
    [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 74, 0, 76, 0, 0, 0, 71, 0, 74, 0, 79, 0, 77, 76, 74, 0, 71, 0, 74, 0, 0, 0,
      72, 0, 76, 0, 81, 0, 79, 76, 77, 0, 76, 0, 72, 0, 0, 0, 69, 0, 72, 0, 77, 0, 76, 74, 72, 0, 0, 0, 0, 0, 0, 0],
    [79, 79, 0, 76, 0, 72, 0, 76, 79, 0, 81, 0, 79, 0, 0, 0, 79, 79, 0, 74, 0, 71, 0, 74, 79, 0, 77, 0, 74, 0, 0, 0,
      76, 76, 0, 72, 0, 69, 0, 72, 76, 0, 77, 0, 79, 0, 0, 0, 77, 0, 76, 0, 74, 0, 72, 0, 74, 0, 76, 0, 72, 0, 0, 0]
  ];
  function schedule(t, s) {
    const bar = Math.floor(s / 16) % 4, i = s % 16, phrase = Math.floor(s / 64) % 4;
    // 드럼
    if (i % 4 === 0) { tone(musicBus, 'sine', 140, t, 0.16, 0.9, { slide: 45, s: 0.01, d: 0.14 }); }
    if (i === 4 || i === 12) noise(musicBus, t, 0.14, 0.35, 'bandpass', 1800, 0.9);
    if (i % 2 === 0) noise(musicBus, t, 0.04, phrase === 0 && bar < 2 ? 0.06 : 0.12, 'highpass', 7000, 0.7);
    // 베이스 (8분 통통)
    if (i % 2 === 0) tone(musicBus, 'triangle', N(BASS[bar] + (i % 8 === 6 ? 12 : 0)), t, S16 * 1.6, 0.42, { lp: 900, s: 0.4 });
    // 화음 짧게 끊어 치기 (엇박)
    if (i === 2 || i === 6 || i === 10 || i === 14) CH[bar].forEach((m, k) => tone(musicBus, 'sawtooth', N(m), t, S16 * 1.2, 0.05, { lp: 2200, detune: k * 4 - 4, s: 0.3 }));
    // 멜로디 (처음 4마디는 쉬고 시작)
    if (phrase > 0) {
      const mel = MEL[phrase === 3 ? 1 : (phrase - 1) % 2];
      const m = mel[(bar * 16 + i) % 64];
      if (m) { tone(musicBus, 'square', N(m), t, S16 * 1.7, 0.09, { lp: 3200, s: 0.55 }); tone(musicBus, 'triangle', N(m + 12), t, S16 * 1.2, 0.04, { s: 0.3 }); }
    }
  }
  function pump() {
    if (!musicOn) return;
    while (nextT < ctx.currentTime + 0.25) { schedule(nextT, step); step = (step + 1) % 256; nextT += S16; }
  }
  function startMusic() {
    if (!ctx || ctx.state !== 'running' || musicOn) return;
    musicOn = true; step = 0; nextT = ctx.currentTime + 0.08;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setValueAtTime(0.32, ctx.currentTime);
    timer = setInterval(pump, 60); pump();
  }
  function stopMusic() {
    musicOn = false; clearInterval(timer);
    if (musicBus) { musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); setTimeout(() => { if (!musicOn && musicBus) musicBus.gain.value = 0.32; }, 600); }
  }
  function music(on) {
    wantMusic = !!on;
    if (!ctx) return;
    if (on) { if (ctx.state === 'suspended') ctx.resume().then(startMusic).catch(() => {}); else startMusic(); }
    else stopMusic();
  }

  // ---- 효과음
  function ok() { return ctx && ctx.state === 'running'; }
  const SFX = {
    click() { if (!ok()) return; tone(sfxBus, 'square', 880, ctx.currentTime, 0.05, 0.12, { s: 0.2 }); },
    pop() { if (!ok()) return; const t = ctx.currentTime; tone(sfxBus, 'sine', 500, t, 0.1, 0.3, { slide: 1100, s: 0.2 }); },
    fire() {
      if (!ok()) return; const t = ctx.currentTime;
      noise(sfxBus, t, 0.35, 0.7, 'lowpass', 2400, 0.8, { sweep: 200 });
      tone(sfxBus, 'sine', 160, t, 0.25, 0.8, { slide: 40, s: 0.05 });
    },
    boom(near) {
      if (!ok()) return; const t = ctx.currentTime, v = 0.35 + 0.6 * (near == null ? 1 : near);
      noise(sfxBus, t, 1.1, v, 'lowpass', 1200, 0.6, { sweep: 90 });
      tone(sfxBus, 'sine', 90, t, 0.6, v, { slide: 28, s: 0.1, d: 0.4 });
      noise(sfxBus, t + 0.02, 0.18, v * 0.5, 'bandpass', 3000, 0.5);
    },
    hit() {
      if (!ok()) return; const t = ctx.currentTime;
      tone(sfxBus, 'square', 620, t, 0.07, 0.18, { s: 0.2 }); tone(sfxBus, 'square', 410, t + 0.06, 0.12, 0.16, { s: 0.2 });
      noise(sfxBus, t, 0.12, 0.25, 'highpass', 4000, 1);
    },
    fall() { if (!ok()) return; tone(sfxBus, 'triangle', 900, ctx.currentTime, 1.0, 0.25, { slide: 120, s: 0.6, d: 0.6 }); },
    deny() { if (!ok()) return; tone(sfxBus, 'square', 220, ctx.currentTime, 0.12, 0.12, { s: 0.3 }); },
    tick() { if (!ok()) return; tone(sfxBus, 'sine', 660, ctx.currentTime, 0.12, 0.3, { s: 0.2 }); },
    go() { if (!ok()) return; const t = ctx.currentTime; tone(sfxBus, 'square', 880, t, 0.22, 0.2, { s: 0.6 }); tone(sfxBus, 'square', 1320, t + 0.08, 0.3, 0.12, { s: 0.6 }); },
    edge() { if (!ok()) return; tone(sfxBus, 'sine', 300, ctx.currentTime, 0.06, 0.15, { s: 0.2 }); },
    win() { if (!ok()) return; const t = ctx.currentTime; [72, 76, 79, 84].forEach((m, i) => tone(sfxBus, 'square', N(m), t + i * 0.12, 0.25, 0.14, { lp: 3000 })); },
    lose() { if (!ok()) return; const t = ctx.currentTime; [67, 64, 60, 55].forEach((m, i) => tone(sfxBus, 'triangle', N(m), t + i * 0.16, 0.3, 0.2)); }
  };
  // 이동 엔진 소리 (계속 울리는 소리 — 움직이는 동안만)
  let eng = null;
  function engine(on) {
    if (!ok()) return;
    if (on && !eng) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 52; f.type = 'lowpass'; f.frequency.value = 380;
      lfo.frequency.value = 11; lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
      o.connect(f); f.connect(g); g.connect(sfxBus); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.16, ctx.currentTime, 0.05);
      o.start(); lfo.start(); eng = { o, g, lfo };
    } else if (!on && eng) {
      const e = eng; eng = null;
      e.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
      setTimeout(() => { try { e.o.stop(); e.lfo.stop(); } catch (er) { /* 이미 멈춤 */ } }, 300);
    }
  }

  window.TankSFX = { unlock, music, SFX, engine, isMuted: () => muted, setMuted, onMute: (f) => listeners.push(f) };
})();
