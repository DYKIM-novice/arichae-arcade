/* 아리채 쌩쌩카트 · 소리 (파일 없이 코드로 합성)
   - 엔진: 속도에 따라 높아지는 부릉부릉 (계속)
   - 드리프트: 끼이익 + 불꽃 단계마다 띠링 · 부스터: 슝! + 캐릭터 함성(야호~)
   - 아이템·맞음·지진·응원 소리
   음량·음소거는 오락실 공통 소리(audio.js)의 버스를 그대로 타요 */
(function () {
  'use strict';
  const SND = window.Sound;
  let eng = null;      // 엔진 소리 노드들
  let skid = null;     // 드리프트 끼익
  let noiseBuf = null;

  function C() { return SND && SND.ctx ? SND.ctx() : null; }
  function bus() { return SND && SND.bus ? SND.bus() : null; }
  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  // 짧은 소리 하나
  function tone(f, dur, o) {
    const c = C(); const b = bus(); if (!c || !b) return;
    const opt = o || {};
    const t = c.currentTime + (opt.delay || 0);
    const osc = c.createOscillator(); const g = c.createGain();
    osc.type = opt.type || 'square';
    osc.frequency.setValueAtTime(f, t);
    if (opt.to) osc.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opt.vol || 0.14, t + (opt.att || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(b);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function hiss(dur, o) {
    const c = C(); const b = bus(); if (!c || !b) return;
    const opt = o || {};
    const t = c.currentTime + (opt.delay || 0);
    const src = c.createBufferSource(); src.buffer = noise(c);
    const f = c.createBiquadFilter(); f.type = opt.filter || 'bandpass';
    f.frequency.setValueAtTime(opt.f || 1200, t);
    if (opt.to) f.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    f.Q.value = opt.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opt.vol || 0.12, t + (opt.att || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(b);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  const KS = {
    // ---------- 엔진 ----------
    start() {
      const c = C(); const b = bus(); if (!c || !b || eng) return;
      const o1 = c.createOscillator(); const o2 = c.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'square';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 3;
      const g = c.createGain(); g.gain.value = 0.0001;
      const g2 = c.createGain(); g2.gain.value = 0.35;
      // 부릉부릉 떨림
      const lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = 18; lg.gain.value = 6; lfo.connect(lg); lg.connect(o1.frequency);
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(b);
      o1.frequency.value = 55; o2.frequency.value = 27.5;
      o1.start(); o2.start(); lfo.start();
      eng = { o1, o2, lp, g, lfo };
      // 끼익 (드리프트)
      const src = c.createBufferSource(); src.buffer = noise(c); src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 6;
      const sg = c.createGain(); sg.gain.value = 0.0001;
      src.connect(bp); bp.connect(sg); sg.connect(b); src.start();
      skid = { src, bp, sg };
    },
    stop() {
      if (eng) { try { eng.o1.stop(); eng.o2.stop(); eng.lfo.stop(); eng.g.disconnect(); } catch (e) { /* 무시 */ } eng = null; }
      if (skid) { try { skid.src.stop(); skid.sg.disconnect(); } catch (e) { /* 무시 */ } skid = null; }
    },
    // 매 프레임: 속도(0~), 부스터, 드리프트 단계(-1 없음)
    update(v, boost, drift, stage, quiet) {
      const c = C(); if (!c || !eng) return;
      const t = c.currentTime;
      const k = Math.max(0, Math.min(1.6, v / 24));
      const f = 48 + 80 * k + (boost ? 26 : 0);
      eng.o1.frequency.setTargetAtTime(f, t, 0.06);
      eng.o2.frequency.setTargetAtTime(f / 2, t, 0.06);
      eng.lp.frequency.setTargetAtTime(380 + 900 * k + (boost ? 700 : 0), t, 0.08);
      eng.lfo.frequency.setTargetAtTime(14 + 16 * k, t, 0.1);
      eng.g.gain.setTargetAtTime(quiet ? 0.0001 : 0.035 + 0.04 * Math.min(1, k), t, 0.08);
      if (skid) {
        skid.sg.gain.setTargetAtTime(drift && !quiet ? 0.05 + stage * 0.025 : 0.0001, t, 0.04);
        skid.bp.frequency.setTargetAtTime(2200 + stage * 700 + Math.random() * 300, t, 0.05);
      }
    },
    // ---------- 짧은 소리 ----------
    count(n) { tone(n > 0 ? 660 : 990, n > 0 ? 0.18 : 0.5, { type: 'square', vol: 0.16 }); if (n === 0) tone(1320, 0.45, { type: 'triangle', vol: 0.12, delay: 0.05 }); },
    driftStart() { hiss(0.12, { f: 900, to: 2400, vol: 0.06 }); tone(220, 0.08, { type: 'triangle', vol: 0.08 }); },
    stage(n) {
      // 불꽃 단계 띠링 (2단은 세 음)
      if (n === 1) { tone(1046, 0.12, { type: 'triangle', vol: 0.12 }); tone(1568, 0.16, { type: 'triangle', vol: 0.1, delay: 0.06 }); }
      else { [1046, 1318, 1568, 2093].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.11, delay: i * 0.045 })); }
    },
    boost(n) {
      // 슝! (단계가 높을수록 길고 크게) + 함성
      hiss(0.35 + n * 0.15, { filter: 'bandpass', f: 500, to: 4200, vol: 0.12 + n * 0.03, q: 0.8 });
      tone(180, 0.3 + n * 0.1, { type: 'sawtooth', to: 720 + n * 200, vol: 0.06 });
      if (n >= 1) KS.shout(n);
    },
    shout(n) {
      // "야~호!" 비슷하게: 두 음으로 올라가는 목소리
      const base = 330 + Math.random() * 80;
      tone(base, 0.16, { type: 'triangle', to: base * 1.5, vol: 0.09, delay: 0.05 });
      tone(base * 1.5, 0.26 + n * 0.06, { type: 'triangle', to: base * 1.25, vol: 0.1, delay: 0.2 });
      tone(base * 3, 0.22, { type: 'sine', to: base * 2.5, vol: 0.035, delay: 0.2 });
    },
    draft() { hiss(0.5, { f: 300, to: 1800, vol: 0.09, q: 0.5 }); tone(520, 0.2, { type: 'sine', to: 880, vol: 0.06 }); },
    wall() { tone(110, 0.12, { type: 'square', to: 60, vol: 0.13 }); hiss(0.1, { filter: 'lowpass', f: 600, vol: 0.08 }); },
    pot() { tone(330, 0.1, { type: 'triangle', to: 160, vol: 0.12 }); hiss(0.12, { f: 1800, vol: 0.06 }); },
    pop() { hiss(0.08, { filter: 'highpass', f: 2500, vol: 0.18 }); tone(880, 0.08, { type: 'square', to: 1760, vol: 0.08 }); },
    rollTick(i) { tone(700 + (i % 4) * 120, 0.04, { type: 'square', vol: 0.05 }); },
    itemGet() { [784, 1046, 1318].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.11, delay: i * 0.06 })); },
    throwIt() { hiss(0.2, { f: 800, to: 300, vol: 0.08 }); tone(440, 0.15, { type: 'triangle', to: 220, vol: 0.08 }); },
    honeyDrop() { tone(300, 0.2, { type: 'sine', to: 120, vol: 0.12 }); hiss(0.15, { filter: 'lowpass', f: 500, vol: 0.06, delay: 0.1 }); },
    hit() { tone(520, 0.12, { type: 'square', to: 180, vol: 0.14 }); tone(392, 0.25, { type: 'triangle', to: 330, vol: 0.1, delay: 0.14 }); tone(370, 0.25, { type: 'triangle', to: 300, vol: 0.1, delay: 0.38 }); tone(349, 0.45, { type: 'triangle', to: 260, vol: 0.1, delay: 0.62 }); },
    honey() { tone(200, 0.3, { type: 'sine', to: 90, vol: 0.14 }); hiss(0.4, { filter: 'lowpass', f: 400, vol: 0.08 }); tone(260, 0.3, { type: 'triangle', to: 200, vol: 0.06, delay: 0.3 }); },
    nut() { for (let i = 0; i < 8; i++) tone(1800 + Math.random() * 900, 0.04, { type: 'square', vol: 0.05, delay: i * 0.055 }); },
    thump(i) { tone(70 - i * 5, 0.32, { type: 'sine', to: 32, vol: 0.32 }); hiss(0.2, { filter: 'lowpass', f: 220, vol: 0.12 }); },
    quake() { tone(60, 0.8, { type: 'sawtooth', to: 28, vol: 0.2 }); hiss(0.9, { filter: 'lowpass', f: 300, to: 80, vol: 0.2 }); },
    dodge() { tone(1046, 0.1, { type: 'triangle', vol: 0.12 }); tone(1568, 0.14, { type: 'triangle', vol: 0.12, delay: 0.08 }); tone(2093, 0.25, { type: 'triangle', vol: 0.1, delay: 0.16 }); },
    cheer() { hiss(0.9, { f: 1400, vol: 0.08, q: 0.6, att: 0.1 }); for (let i = 0; i < 5; i++) tone(500 + Math.random() * 500, 0.12, { type: 'triangle', vol: 0.03, delay: 0.1 + i * 0.12 }); },
    firework() { tone(900, 0.5, { type: 'sine', to: 2200, vol: 0.05 }); hiss(0.3, { filter: 'highpass', f: 1500, vol: 0.15, delay: 0.5 }); tone(160, 0.25, { type: 'square', to: 60, vol: 0.1, delay: 0.5 }); },
    lap() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.09, delay: i * 0.09 })); },
    finish() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.2, { type: 'square', vol: 0.1, delay: i * 0.11 })); }
  };
  window.KartSound = KS;
})();
