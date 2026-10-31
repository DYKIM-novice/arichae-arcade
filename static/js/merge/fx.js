/* 머지관 · 손맛 (부드러운 효과음 WebAudio · 진동 · 반짝이 가루 · 날아가는 동전)
   - 소리는 파일 없이 합성해요 (작고 동글동글하게 · 크기 낮게)
   - 처음 손가락이 닿을 때 unlock() (휴대폰은 사용자 동작 뒤에만 소리가 나요)
   - prefers-reduced-motion 이면 가루를 줄이고 튀는 움직임을 끄게 reduced 를 알려 줘요 */
(function (root) {
  'use strict';

  let ac = null, master = null;
  const opt = { sfx: true, vib: true };
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  // 맑은 오음 음계 (단계가 오를수록 높게)
  const SCALE = [523.3, 587.3, 659.3, 784.0, 880.0, 1046.5, 1174.7, 1318.5, 1568.0, 1760.0];

  function unlock() {
    try {
      if (!ac) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = 0.22;
        const comp = ac.createDynamicsCompressor();
        master.connect(comp); comp.connect(ac.destination);
      }
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  // 음 하나: 파형 · 시작/끝 높이 · 길이 · 크기 · 늦게 시작
  function tone(type, f0, f1, dur, vol, delay) {
    if (!ac || !opt.sfx) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.015, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function shimmer(delay, vol) {
    if (!ac || !opt.sfx) return;
    for (let i = 0; i < 4; i++) tone('sine', 2093 + i * 330, 2400 + i * 330, 0.09, (vol || 0.05) * (1 - i * 0.18), (delay || 0) + i * 0.035);
  }

  const SFX = {
    pick() { tone('sine', 700, 760, 0.05, 0.12); },
    drop() { tone('sine', 260, 180, 0.09, 0.18); },
    swap() { tone('triangle', 420, 330, 0.07, 0.12); tone('triangle', 330, 420, 0.07, 0.1, 0.06); },
    spawn() { tone('sine', 480, 960, 0.09, 0.2); tone('sine', 1200, 1250, 0.05, 0.06, 0.06); },
    merge(tier) {
      const f = SCALE[Math.max(0, Math.min(SCALE.length - 1, (tier || 2) - 2))];
      tone('sine', f * 0.5, f, 0.08, 0.22);          // 퐁 (아래에서 올라오며)
      tone('triangle', f, f, 0.18, 0.14, 0.05);       // 맑은 음
      tone('sine', f * 1.5, f * 1.5, 0.22, 0.07, 0.09); // 위 5도
      shimmer(0.08, 0.04);
    },
    discover() { [0, 1, 2, 3, 4].forEach((i) => tone('sine', SCALE[i + 3], SCALE[i + 3], 0.16, 0.08, 0.18 + i * 0.06)); shimmer(0.45, 0.06); },
    maxed() { [0, 2, 4, 7].forEach((i) => tone('triangle', SCALE[i] * 2, SCALE[i] * 2, 0.3, 0.07, 0.15 + i * 0.05)); },
    deliver() { [0, 2, 4, 5].forEach((i, k) => tone('triangle', SCALE[i], SCALE[i], 0.24, 0.13, k * 0.08)); shimmer(0.34, 0.05); },
    coin() { tone('square', 1568, 1568, 0.05, 0.035); tone('square', 2093, 2093, 0.09, 0.035, 0.05); },
    bad() { tone('sine', 200, 150, 0.14, 0.18); },
    open() { tone('sine', 520, 780, 0.08, 0.1); },
    close() { tone('sine', 700, 480, 0.08, 0.08); }
  };
  function sfx(name, arg) { try { if (SFX[name]) SFX[name](arg); } catch (e) { /* 소리 실패는 무시 */ } }
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
      if (p.star) star(x, y, p.r * (1 - k * 0.5), p.rot + k * 3);
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
    const n = reduced ? Math.ceil((count || 14) / 3) : (count || 14);
    const pw = power || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (28 + Math.random() * 46) * pw;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10 * pw, g: 26, r: 3 + Math.random() * 4 * pw,
        col: cols[i % cols.length], star: i % 3 !== 2, rot: Math.random() * 3, t0, life: 520 + Math.random() * 380 });
    }
    parts.push({ ring: true, x, y, r0: 8, r1: 40 * pw, col: cols[0], t0, life: 420 });
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

  root.MergeFx = { unlock, sfx, vibrate, canVibrate, attach, burst, fly, reduced, opt };
})(window);
