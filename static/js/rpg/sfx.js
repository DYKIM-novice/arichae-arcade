/* 아리채 오락실 · 회귀 RPG 효과음 (파일 없이 코드로 합성 · audio.js 의 소리 길을 같이 써요) */
(function () {
  'use strict';

  const SND = window.Sound;
  const raw = (SND && SND.raw) || null;
  const T = (f, d, o) => { if (raw) raw.tone(f, d, o); };
  const N = (d, o) => { if (raw) raw.noise(d, o); };
  let lastHit = 0;

  const X = {
    swing(step) {
      N(0.07, { vol: 0.05, freq: 2600 + step * 400 });
      T(700 - step * 60, 0.06, { type: 'triangle', vol: 0.05, slide: 320 });
    },
    // 맞는 소리: 단계가 높을수록 묵직하게
    hit(kind, crit) {
      const now = performance.now();
      if (now - lastHit < 25) return;
      lastHit = now;
      const big = kind === 'c3' || kind === 'heavy' || kind === 'counter' || kind === 'specEnd';
      T(big ? 140 : 210, big ? 0.16 : 0.09, { type: 'square', vol: big ? 0.2 : 0.14, slide: big ? 50 : 90 });
      N(big ? 0.12 : 0.06, { vol: big ? 0.16 : 0.1, freq: big ? 900 : 1500, filter: 'lowpass' });
      if (crit) T(880, 0.08, { type: 'square', vol: 0.07, delay: 0.02 });
      if (kind === 'heavy') { T(70, 0.3, { type: 'sawtooth', vol: 0.16, slide: 35 }); N(0.25, { vol: 0.12, freq: 300, filter: 'lowpass' }); }
    },
    // 패링: 쨍! (높은 금속 소리 + 메아리)
    parry() {
      T(2637, 0.09, { type: 'square', vol: 0.13 });
      T(3951, 0.32, { type: 'triangle', vol: 0.17, delay: 0.005 });
      T(5274, 0.18, { type: 'sine', vol: 0.08, delay: 0.01 });
      N(0.05, { vol: 0.12, freq: 6500 });
      T(3951, 0.25, { type: 'triangle', vol: 0.05, delay: 0.14 });
      T(1319, 0.2, { type: 'triangle', vol: 0.1, delay: 0.03, slide: 2637 });
    },
    guard() { T(420, 0.06, { type: 'square', vol: 0.1, slide: 300 }); N(0.06, { vol: 0.08, freq: 1800, filter: 'bandpass' }); },
    hurt() { T(330, 0.18, { type: 'sawtooth', vol: 0.12, slide: 120 }); N(0.08, { vol: 0.06, freq: 500, filter: 'lowpass' }); },
    dodge() { T(900, 0.1, { type: 'sine', vol: 0.08, slide: 1600 }); },
    // 예고: 초록(막아) 딩, 빨강(때려) 둥
    tele(icon) {
      if (icon === 'r') { T(196, 0.16, { type: 'square', vol: 0.12 }); T(196, 0.16, { type: 'square', vol: 0.12, delay: 0.18 }); }
      else { T(1175, 0.08, { type: 'triangle', vol: 0.13 }); T(1568, 0.12, { type: 'triangle', vol: 0.1, delay: 0.07 }); }
    },
    charge(full) {
      if (full) { [784, 1047, 1568].forEach((f, i) => T(f, 0.1, { type: 'square', vol: 0.07, delay: i * 0.05 })); }
      else T(300, 0.5, { type: 'sine', vol: 0.06, slide: 700 });
    },
    specNo() { T(180, 0.12, { type: 'square', vol: 0.06, slide: 120 }); },
    gaugeFull() { [988, 1319, 1976].forEach((f, i) => T(f, 0.09, { type: 'triangle', vol: 0.12, delay: i * 0.06 })); },
    spec() {
      T(220, 0.5, { type: 'sawtooth', vol: 0.1, slide: 1400 });
      T(110, 0.6, { type: 'square', vol: 0.08, slide: 880 });
      N(0.5, { vol: 0.06, freq: 3000 });
      T(60, 0.5, { type: 'sine', vol: 0.3, delay: 0.42, slide: 30 });
      N(0.4, { vol: 0.16, freq: 250, filter: 'lowpass', delay: 0.42 });
    },
    kill(boss) {
      T(523, 0.08, { type: 'square', vol: 0.12 }); T(784, 0.08, { type: 'square', vol: 0.12, delay: 0.07 }); T(1047, 0.16, { type: 'square', vol: 0.12, delay: 0.14 });
      N(0.3, { vol: 0.1, freq: 600, filter: 'lowpass' });
      if (boss) { T(55, 1.2, { type: 'sine', vol: 0.35, slide: 30 }); N(1.0, { vol: 0.18, freq: 200, filter: 'lowpass' }); }
    },
    lvup() { [523, 659, 784, 1047, 1319].forEach((f, i) => T(f, 0.12, { type: 'square', vol: 0.08, delay: i * 0.06 })); },
    heal() { T(880, 0.1, { type: 'sine', vol: 0.06, slide: 1320 }); },
    break() { T(110, 0.4, { type: 'sawtooth', vol: 0.18, slide: 45 }); N(0.35, { vol: 0.16, freq: 700, filter: 'lowpass' }); T(1568, 0.15, { type: 'square', vol: 0.08, delay: 0.1 }); },
    stun() { [1568, 1319, 1568, 1319].forEach((f, i) => T(f, 0.06, { type: 'triangle', vol: 0.06, delay: i * 0.08 })); },
    rage() { T(98, 0.6, { type: 'sawtooth', vol: 0.18, slide: 70 }); T(147, 0.6, { type: 'sawtooth', vol: 0.1, slide: 104 }); },
    card() { T(659, 0.07, { type: 'triangle', vol: 0.14 }); T(988, 0.12, { type: 'triangle', vol: 0.14, delay: 0.06 }); },
    cardsIn() { [392, 523, 659].forEach((f, i) => T(f, 0.09, { type: 'triangle', vol: 0.11, delay: i * 0.08 })); },
    step() { T(150 + Math.random() * 40, 0.04, { type: 'triangle', vol: 0.06 }); },
    // 쓰러짐 → 느려지는 소리
    die() { T(392, 0.9, { type: 'triangle', vol: 0.14, slide: 98 }); T(311, 0.9, { type: 'triangle', vol: 0.08, slide: 78, delay: 0.1 }); },
    // 되감기: 거꾸로 빨려 들어가는 소리 + 시계 째깍 (점점 빠르게)
    rewind(sec) {
      const s = sec || 2.4;
      T(1600, s, { type: 'sawtooth', vol: 0.04, slide: 90 });
      T(800, s, { type: 'triangle', vol: 0.07, slide: 60 });
      let t = 0; let gap = 0.18;
      while (t < s) { T(2200, 0.02, { type: 'square', vol: 0.06, delay: t }); t += gap; gap = Math.max(0.035, gap * 0.86); }
      N(s, { vol: 0.03, freq: 4000 });
    },
    // "제 N회차 회귀!" 쾅
    title(clear) {
      T(65, 0.9, { type: 'sine', vol: 0.4, slide: 40 });
      N(0.6, { vol: 0.2, freq: 300, filter: 'lowpass' });
      const ch = clear ? [523, 659, 784, 1047, 1319] : [392, 494, 587, 784];
      ch.forEach((f, i) => T(f, 0.6, { type: 'triangle', vol: 0.09, delay: 0.12 + i * 0.03 }));
      T(2093, 0.8, { type: 'sine', vol: 0.06, delay: 0.25 });
    },
    // 정산 한 줄씩: 점점 높은 음
    pop(i) { const f = 523 * Math.pow(2, (i || 0) / 6); T(f, 0.07, { type: 'square', vol: 0.1 }); T(f * 2, 0.1, { type: 'triangle', vol: 0.08, delay: 0.04 }); },
    count() { T(1400 + Math.random() * 200, 0.025, { type: 'square', vol: 0.035 }); },
    buy() { [659, 880, 1175, 1568].forEach((f, i) => T(f, 0.1, { type: 'square', vol: 0.09, delay: i * 0.05 })); },
    nope() { T(150, 0.15, { type: 'square', vol: 0.08, slide: 100 }); },
    depart() { [392, 523, 659, 784, 1047].forEach((f, i) => T(f, 0.1, { type: 'square', vol: 0.1, delay: i * 0.07 })); T(1047, 0.4, { type: 'triangle', vol: 0.12, delay: 0.35 }); }
  };
  window.RpgSfx = X;
})();
