/* 아리채 오락실 - 효과음, 배경음악, 진동 (파일 없이 코드로 합성) */
(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let muted = false;
  let vibeOn = true;
  try {
    muted = localStorage.getItem('arichae_mute') === '1';
    vibeOn = localStorage.getItem('arichae_vibe') !== '0';
  } catch (e) { /* 저장소 없음 */ }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp);
      comp.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, opt) {
    const o = opt || {};
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    const vol = o.vol == null ? 0.16 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.bus || sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  let noiseBuf = null;
  function noise(dur, opt) {
    const o = opt || {};
    const c = ensure();
    if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + (o.delay || 0);
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filt = c.createBiquadFilter();
    filt.type = o.filter || 'highpass';
    filt.frequency.value = o.freq || 1200;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(o.bus || sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const PRESS = { r: 523.25, g: 659.25, b: 783.99 };

  const SFX = {
    press(col) { tone(PRESS[col] || 600, 0.08, { type: 'square', vol: 0.09 }); },
    good() {
      tone(988, 0.07, { type: 'triangle', vol: 0.24 });
      tone(1319, 0.12, { type: 'triangle', vol: 0.24, delay: 0.055 });
    },
    perfect() {
      [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.11, { type: 'square', vol: 0.1, delay: i * 0.05 }));
      tone(2093, 0.25, { type: 'triangle', vol: 0.16, delay: 0.2 });
    },
    bad() {
      tone(220, 0.26, { type: 'sawtooth', vol: 0.14, slide: 80 });
      noise(0.12, { vol: 0.06, freq: 400, filter: 'lowpass' });
    },
    soft() { tone(330, 0.09, { type: 'triangle', vol: 0.14, slide: 220 }); },
    step() {
      tone(160 + Math.random() * 50, 0.045, { type: 'triangle', vol: 0.2 });
      noise(0.03, { vol: 0.05, freq: 2500 });
    },
    tick() { tone(660, 0.1, { type: 'square', vol: 0.13 }); },
    tickHigh() { tone(990, 0.08, { type: 'square', vol: 0.12 }); },
    go() {
      tone(1319, 0.35, { type: 'square', vol: 0.14 });
      tone(659, 0.35, { type: 'triangle', vol: 0.2 });
    },
    lamp() { tone(1760, 0.06, { type: 'sine', vol: 0.18 }); },
    whoosh() { noise(0.28, { vol: 0.07, freq: 1800 }); },
    join() {
      tone(784, 0.08, { type: 'triangle', vol: 0.2 });
      tone(1175, 0.14, { type: 'triangle', vol: 0.2, delay: 0.07 });
    },
    click() { tone(1200, 0.03, { type: 'square', vol: 0.06 }); },
    end() {
      tone(784, 0.14, { type: 'square', vol: 0.13 });
      tone(659, 0.14, { type: 'square', vol: 0.13, delay: 0.14 });
      tone(523, 0.34, { type: 'square', vol: 0.13, delay: 0.28 });
    },
    chop() {
      noise(0.08, { vol: 0.2, freq: 900, filter: 'bandpass' });
      tone(150, 0.09, { type: 'triangle', vol: 0.28, slide: 70 });
    },
    crash() {
      noise(0.6, { vol: 0.16, freq: 500, filter: 'lowpass' });
      tone(95, 0.5, { type: 'sawtooth', vol: 0.12, slide: 40 });
    },
    crack() {
      noise(0.2, { vol: 0.22, freq: 2600 });
      tone(1800, 0.06, { type: 'square', vol: 0.08, slide: 600 });
    },
    pop() {
      noise(0.28, { vol: 0.28, freq: 700 });
      tone(620, 0.12, { type: 'square', vol: 0.14, slide: 80 });
    },
    pump() {
      noise(0.07, { vol: 0.08, freq: 1500, filter: 'bandpass' });
      tone(300 + Math.random() * 60, 0.05, { type: 'sine', vol: 0.1, slide: 520 });
    },
    bonk() { tone(430, 0.1, { type: 'square', vol: 0.15, slide: 170 }); },
    kick(accent) {
      tone(accent ? 140 : 115, 0.13, { type: 'sine', vol: accent ? 0.5 : 0.34, slide: 45 });
      noise(0.03, { vol: accent ? 0.06 : 0.03, freq: 5000 });
    },
    sizzle() { noise(0.12, { vol: 0.07, freq: 3500 }); },
    swish() { noise(0.3, { vol: 0.1, freq: 1200, filter: 'bandpass' }); },
    drumroll(sec) {
      const n = Math.floor((sec || 2.4) / 0.05);
      for (let i = 0; i < n; i++) {
        const p = i / n;
        noise(0.05, { vol: 0.04 + p * 0.12, freq: 260 + p * 500, filter: 'bandpass', delay: i * 0.05 });
        tone(85 + p * 35, 0.05, { type: 'triangle', vol: 0.06 + p * 0.14, delay: i * 0.05 });
      }
    },
    cymbal() {
      noise(1.4, { vol: 0.2, freq: 5200 });
      noise(0.5, { vol: 0.12, freq: 1400, filter: 'bandpass' });
      tone(55, 0.5, { type: 'sine', vol: 0.4, slide: 30 });
    },
    reveal() {
      tone(523.25, 0.12, { type: 'square', vol: 0.11 });
      tone(783.99, 0.22, { type: 'triangle', vol: 0.2, delay: 0.08 });
    },
    boom() {
      noise(0.6, { vol: 0.16, freq: 380, filter: 'lowpass' });
      tone(75, 0.45, { type: 'sine', vol: 0.3, slide: 32 });
      noise(0.9, { vol: 0.05, freq: 6000, delay: 0.12 });
    },
    victory() {
      const lead = [
        [523.25, 0, 0.13], [659.25, 0.14, 0.13], [783.99, 0.28, 0.13], [1046.5, 0.42, 0.34],
        [783.99, 0.8, 0.13], [1046.5, 0.94, 0.5],
        [880, 1.5, 0.13], [987.77, 1.64, 0.13], [1046.5, 1.78, 0.13], [1174.66, 1.92, 0.13], [1318.51, 2.06, 0.9]
      ];
      lead.forEach(([f, d, l]) => {
        tone(f, l, { type: 'square', vol: 0.1, delay: d });
        tone(f / 2, l, { type: 'triangle', vol: 0.12, delay: d });
      });
      [[130.81, 0, 0.75], [196, 0.8, 0.65], [174.61, 1.5, 0.5], [130.81, 2.06, 1.0]].forEach(([f, d, l]) =>
        tone(f, l, { type: 'triangle', vol: 0.28, delay: d }));
      [0, 0.42, 0.94, 2.06].forEach((d) => noise(0.6, { vol: 0.1, freq: 5000, delay: d }));
    },
    // 오르골 소리: 맑은 기본음 + 금속성 배음이 천천히 사라지는 소리
    musicbox(midi, vol) {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const v = vol == null ? 0.32 : vol;
      [[1, 1, 1.7], [2, 0.32, 0.9], [3, 0.1, 0.45], [4.95, 0.06, 0.22], [6.8, 0.035, 0.12]].forEach(([m, a, d]) => {
        if (f * m < 12000) tone(f * m, d, { type: 'sine', vol: v * a, attack: 0.002 });
      });
      noise(0.012, { vol: 0.025, freq: 6000 });
    },
    // 오르골 태엽이 도는 듯한 작은 박자 소리
    mbTick(accent) {
      noise(0.018, { vol: accent ? 0.05 : 0.03, freq: 4200, filter: 'bandpass' });
      tone(accent ? 2637 : 2349, 0.03, { type: 'sine', vol: accent ? 0.035 : 0.02 });
    },
    note(lane) { tone({ r: 523.25, g: 659.25, b: 783.99 }[lane] || 600, 0.12, { type: 'triangle', vol: 0.22 }); },
    fanfare() {
      const n = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.52], [1047, 0.64]];
      n.forEach(([f, d], i) => tone(f, i === n.length - 1 ? 0.6 : 0.14, { type: 'square', vol: 0.12, delay: d }));
      tone(262, 0.9, { type: 'triangle', vol: 0.2, delay: 0.36 });
    },
    /* ---- 올림픽관 손맛·몸개그 소리 ---- */
    // 관중 함성 (k: 0~1 크기)
    roar(k) {
      const v = k == null ? 1 : k;
      noise(1.5, { vol: 0.13 * v, freq: 850, filter: 'bandpass' });
      noise(1.1, { vol: 0.07 * v, freq: 2300, filter: 'bandpass', delay: 0.08 });
      noise(0.7, { vol: 0.05 * v, freq: 500, filter: 'lowpass', delay: 0.05 });
    },
    quack() {
      tone(560, 0.11, { type: 'sawtooth', vol: 0.13, slide: 360 });
      tone(540, 0.13, { type: 'sawtooth', vol: 0.12, slide: 330, delay: 0.15 });
    },
    boing() {
      tone(150, 0.32, { type: 'sine', vol: 0.3, slide: 520 });
      tone(300, 0.2, { type: 'triangle', vol: 0.08, slide: 900, delay: 0.04 });
    },
    thud() {
      tone(110, 0.2, { type: 'sine', vol: 0.45, slide: 40 });
      noise(0.1, { vol: 0.12, freq: 380, filter: 'lowpass' });
    },
    splat() {
      noise(0.3, { vol: 0.2, freq: 1100, filter: 'lowpass' });
      tone(240, 0.14, { type: 'triangle', vol: 0.18, slide: 70 });
    },
    shutter() {
      noise(0.035, { vol: 0.22, freq: 3200 });
      noise(0.05, { vol: 0.16, freq: 1800, filter: 'bandpass', delay: 0.07 });
    },
    tweet() {
      tone(2300, 0.07, { type: 'sine', vol: 0.12, slide: 3300 });
      tone(2500, 0.07, { type: 'sine', vol: 0.1, slide: 3500, delay: 0.1 });
    },
    scrape() { noise(0.22, { vol: 0.06, freq: 4200 }); },
    whistle() { tone(2400, 0.22, { type: 'sine', vol: 0.12, slide: 1500 }); }
  };

  /* ---------- 배경음악: 8비트 스타일 시퀀서 ---------- */
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const BASS = [45, 57, 45, 57, 48, 60, 48, 60, 43, 55, 43, 55, 47, 59, 50, 62];
  const LEAD = [69, 0, 72, 0, 76, 74, 72, 0, 67, 0, 71, 74, 79, 0, 76, 74,
                69, 0, 72, 76, 81, 0, 79, 76, 74, 72, 71, 0, 72, 74, 76, 0];

  const BGM = {
    timer: null,
    next: 0,
    step: 0,
    tempo: 150,
    start(tempo) {
      const c = ensure();
      if (!c) return;
      this.stop();
      this.tempo = tempo || 150;
      this.step = 0;
      this.next = c.currentTime + 0.05;
      this.timer = setInterval(() => this.schedule(), 25);
    },
    setTempo(t) { this.tempo = t; },
    stop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
    },
    schedule() {
      if (!ctx) return;
      const stepDur = 60 / this.tempo / 2;
      while (this.next < ctx.currentTime + 0.12) {
        const i = this.step;
        const delay = Math.max(0, this.next - ctx.currentTime);
        const b = BASS[i % BASS.length];
        tone(mtof(b), stepDur * 0.9, { type: 'triangle', vol: 0.2, delay, bus: musicBus });
        const l = LEAD[i % LEAD.length];
        if (l) tone(mtof(l), stepDur * 0.8, { type: 'square', vol: 0.045, delay, bus: musicBus });
        if (i % 2 === 1) noise(0.03, { vol: 0.035, freq: 6000, delay, bus: musicBus });
        if (i % 4 === 0) tone(110, 0.08, { type: 'sine', vol: 0.3, slide: 45, delay, bus: musicBus });
        this.next += stepDur;
        this.step++;
      }
    }
  };

  function vibrate(pattern) {
    if (!vibeOn) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 미지원 */ }
  }

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem('arichae_mute', muted ? '1' : '0'); } catch (e) { /* 무시 */ }
    if (master) master.gain.value = muted ? 0 : 0.9;
  }

  function setVibe(v) {
    vibeOn = !!v;
    try { localStorage.setItem('arichae_vibe', vibeOn ? '1' : '0'); } catch (e) { /* 무시 */ }
  }

  window.Sound = {
    unlock: ensure,
    SFX,
    BGM,
    vibrate,
    setMuted,
    setVibe,
    isMuted: () => muted,
    isVibe: () => vibeOn,
    canVibrate: () => typeof navigator.vibrate === 'function',
    /* === rpg === 회귀 RPG 효과음(rpg/sfx.js)이 같은 소리 길(음소거·압축)을 쓰도록 */
    raw: { tone, noise }
    /* === rpg === */
  };
})();
