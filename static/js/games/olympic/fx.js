/* 아리채 오락실 · 올림픽관 손맛(juice) · 몸개그 도구
   - 화면 효과만 다뤄요. 규칙 계산(sim)과는 상관없어서 여기서는 무작위(Math.random)를 써도 괜찮아요
   - O.fx.parts : SVG 조각 효과 (먼지·눈·얼음·불꽃·꽃가루·깃털…) — 개수 상한이 있어서 폰에서도 가벼워요
   - O.fx.cam   : 화면 흔들기 · 줌 펀치 · 줌 인 (photo finish)
   - O.fx.lines : 속도선 (HTML · transform 애니메이션이라 가벼워요)
   - O.fx.hype  : 관중 분위기 (0 보통 · 1 들썩 · 2 열광)
   - O.fx.pb    : 이 폰의 개인 최고 기록 (localStorage · 없어도 괜찮아요)
   - O.fx.hash  : 같은 씨앗 → 같은 수 (모든 폰이 같은 '엉뚱 변주'를 보도록)
   - O.tumble   : 넘어지는 몸개그 자세 (얼굴 꽈당 · 배치기 다이빙 · 깜짝)
   - O.fx.raceJuice : 레인 경주(100m)용 — 발 구름 먼지, 출발 속임수, 결승 테이프, 포토 피니시(느린 화면 + 줌) */
(function () {
  'use strict';

  const O = window.Oly;
  const G = window.Games;
  const { el, clamp, ease } = O;
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ================================================================
     조각 효과
     ================================================================ */
  const CONF = ['#FF4757', '#FFD23F', '#3D7BFF', '#2ED573', '#FF6FB5', '#B07BFF'];
  const SHAPE = {
    dust: (c) => `<ellipse rx="6.5" ry="4.2" fill="${c || 'rgba(246,214,180,.8)'}"/>`,
    snow: () => '<circle r="3.4" fill="#fff" stroke="#BFD8EC" stroke-width=".8"/>',
    ice: () => '<path d="M-3.6 0 L0 -2.2 L3.6 0 L0 2.2 Z" fill="#F4FBFF" stroke="#7FB8E0" stroke-width=".8"/>',
    spark: (c) => `<path d="M-5 0 H5" stroke="${c || '#FFE27A'}" stroke-width="2.4" stroke-linecap="round"/>`,
    confetti: (c) => `<rect x="-3.6" y="-1.9" width="7.2" height="3.8" rx=".8" fill="${c}"/>`,
    feather: () => '<path d="M0 -6.5 Q4 0 0 6.5 Q-4 0 0 -6.5 Z" fill="#fff" stroke="#9AA9C2" stroke-width=".8"/><path d="M0 -5 V6" stroke="#9AA9C2" stroke-width=".7"/>',
    star: () => '<path d="M0 -6 l1.8 3.8 4.2 .5 -3.1 2.9 .8 4.2 -3.7 -2 -3.7 2 .8 -4.2 -3.1 -2.9 4.2 -.5 Z" fill="#FFD23F" stroke="#E0A800" stroke-width=".7"/>',
    ring: (c) => `<circle r="10" fill="none" stroke="${c || '#fff'}" stroke-width="3"/>`
  };
  const PRESET = {
    dust: { ay: -25, drag: 5, life: 0.42, s0: 0.6, s1: 1.7, o0: 0.85, o1: 0, sp: 40 },
    snow: { ay: 520, drag: 1.1, life: 0.95, s0: 1.15, s1: 0.55, o0: 1, o1: 0.15, sp: 170, bounce: 0.25, spin: 0 },
    ice: { ay: 60, drag: 3.2, life: 0.5, s0: 1.1, s1: 0.4, o0: 1, o1: 0, sp: 120, spin: 600 },
    spark: { ay: 260, drag: 2.4, life: 0.32, s0: 1, s1: 0.3, o0: 1, o1: 0, sp: 190, align: true },
    confetti: { ay: 230, drag: 1.7, life: 1.5, s0: 1, s1: 0.8, o0: 1, o1: 0, sp: 260, spin: 720 },
    feather: { ay: 50, drag: 2.6, life: 1.5, s0: 1.1, s1: 0.9, o0: 1, o1: 0, sp: 120, spin: 200, sway: 1 },
    star: { ay: 0, drag: 2.2, life: 0.65, s0: 1.3, s1: 0.3, o0: 1, o1: 0, sp: 95, spin: 360 },
    ring: { ay: 0, drag: 0, life: 0.42, s0: 0.3, s1: 2.6, o0: 0.95, o1: 0, sp: 0 }
  };

  function parts(layer, max) {
    const N = max || 40;
    const pool = [];
    for (let i = 0; i < N; i++) {
      const g = el('g', { display: 'none' });
      layer.appendChild(g);
      pool.push({ el: g, on: false, html: '' });
    }
    let rr = 0;
    let live = 0;
    function take() {
      for (let k = 0; k < N; k++) {
        const q = pool[(rr + k) % N];
        if (!q.on) { rr = (rr + k + 1) % N; return q; }
      }
      const q = pool[rr];               // 꽉 차면 가장 오래된 것을 다시 써요
      rr = (rr + 1) % N;
      return q;
    }
    function spawn(o) {
      const p = take();
      if (!p.on) live++;
      p.on = true; p.t = 0;
      p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.ay = o.ay || 0; p.drag = o.drag || 0;
      p.life = o.life || 0.6; p.r = o.r || 0; p.vr = o.vr || 0;
      p.s0 = o.s0 == null ? 1 : o.s0; p.s1 = o.s1 == null ? p.s0 : o.s1;
      p.o0 = o.o0 == null ? 1 : o.o0; p.o1 = o.o1 == null ? 0 : o.o1;
      p.floor = o.floor; p.bounce = o.bounce || 0; p.align = !!o.align; p.sway = o.sway || 0;
      const h = o.html || '';
      if (h !== p.html) { p.el.innerHTML = h; p.html = h; }
      p.el.removeAttribute('display');
      draw(p);
      return p;
    }
    function draw(p) {
      const k = p.t / p.life;
      const s = p.s0 + (p.s1 - p.s0) * k;
      const op = p.o0 + (p.o1 - p.o0) * k * k;
      const r = p.align ? Math.atan2(p.vy, p.vx) * 57.3 : p.r + (p.sway ? Math.sin(p.t * 7) * 28 : 0);
      p.el.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${r.toFixed(0)}) scale(${s.toFixed(2)})`);
      p.el.setAttribute('opacity', op.toFixed(2));
    }
    // kind 모양 n개를 (x,y) 에서 터뜨려요 · o: dir(라디안) spread sp k(크기) color vx vy floor life ay jx jy
    function burst(kind, x, y, n, o) {
      const op = o || {};
      const pr = PRESET[kind] || PRESET.dust;
      const shape = SHAPE[kind] || SHAPE.dust;
      const k = op.k || 1;
      for (let i = 0; i < n; i++) {
        const a = (op.dir == null ? -Math.PI / 2 : op.dir) + (Math.random() - 0.5) * (op.spread == null ? Math.PI * 2 : op.spread);
        const sp = (op.sp == null ? pr.sp : op.sp) * rnd(0.45, 1.2);
        const col = op.color || (kind === 'confetti' ? CONF[(Math.random() * CONF.length) | 0] : null);
        spawn({
          x: x + (Math.random() - 0.5) * (op.jx || 0), y: y + (Math.random() - 0.5) * (op.jy || 0),
          vx: Math.cos(a) * sp + (op.vx || 0), vy: Math.sin(a) * sp + (op.vy || 0),
          ay: op.ay == null ? pr.ay : op.ay, drag: pr.drag, life: (op.life || pr.life) * rnd(0.75, 1.25),
          r: pr.spin ? Math.random() * 360 : 0, vr: pr.spin ? (Math.random() - 0.5) * 2 * pr.spin : 0,
          s0: pr.s0 * k, s1: pr.s1 * k, o0: pr.o0, o1: pr.o1, floor: op.floor, bounce: pr.bounce,
          align: pr.align, sway: pr.sway, html: shape(col)
        });
      }
    }
    function tick(dt) {
      if (!live) return;
      for (let i = 0; i < N; i++) {
        const p = pool[i];
        if (!p.on) continue;
        p.t += dt;
        if (p.t >= p.life) { p.on = false; live--; p.el.setAttribute('display', 'none'); continue; }
        p.vy += p.ay * dt;
        if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        if (p.floor != null) {
          const f = typeof p.floor === 'function' ? p.floor(p.x) : p.floor;
          if (p.y > f) { p.y = f; p.vy = -Math.abs(p.vy) * p.bounce; p.vx *= 0.72; p.vr *= 0.55; }
        }
        draw(p);
      }
    }
    function clear() { pool.forEach((p) => { if (p.on) { p.on = false; p.el.setAttribute('display', 'none'); } }); live = 0; }
    return { spawn, burst, tick, clear, get count() { return live; } };
  }

  /* ================================================================
     카메라: 흔들기 · 펀치(순간 확대) · 줌 인
     target 이 SVG <g> 면 transform 속성, 아니면 CSS transform 으로 움직여요
     ================================================================ */
  function cam(target) {
    const isG = target instanceof SVGElement && target.tagName !== 'svg';
    if (!isG) target.style.transformOrigin = '0 0';
    let amp = 0; let ampT = 0; let ampD = 1;
    let z = 1; let zt = 1; let zs = 6; let fx = 0; let fy = 0; let pz = 0; let last = '';
    return {
      shake(a, ms) {
        const cur = amp * Math.max(0, 1 - ampT / ampD);
        if (a >= cur) { amp = a; ampT = 0; ampD = (ms || 300) / 1000; }
      },
      punch(k) { pz = Math.max(pz, k); },
      focus(x, y) { fx = x; fy = y; },
      zoom(zz, speed) { zt = zz; zs = speed || 6; },
      get z() { return z; },
      tick(dt) {
        let sx = 0; let sy = 0;
        if (amp > 0) {
          ampT += dt;
          const k = Math.max(0, 1 - ampT / ampD);
          if (!k) amp = 0;
          else { sx = (Math.random() * 2 - 1) * amp * k; sy = (Math.random() * 2 - 1) * amp * k * 0.75; }
        }
        z += (zt - z) * Math.min(1, dt * zs);
        if (Math.abs(z - zt) < 0.002) z = zt;
        pz *= Math.exp(-dt * 9);
        if (pz < 0.002) pz = 0;
        const S = z * (1 + pz);
        const tx = sx + fx * (1 - S); const ty = sy + fy * (1 - S);
        let tr = '';
        if (S !== 1 || sx || sy) tr = isG ? `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${S.toFixed(3)})` : `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${S.toFixed(3)})`;
        if (tr === last) return;
        last = tr;
        if (isG) { if (tr) target.setAttribute('transform', tr); else target.removeAttribute('transform'); } else target.style.transform = tr;
      }
    };
  }

  /* ---------- 속도선 (HTML) ---------- */
  function lines(box, color) {
    const w = document.createElement('div');
    w.className = 'ofx-lines';
    let h = '';
    for (let i = 0; i < 9; i++) {
      h += `<i style="top:${(6 + i * 10.6 + (i * 37) % 6).toFixed(1)}%;width:${26 + (i * 23) % 38}%;animation-delay:${(-((i * 0.137) % 0.5)).toFixed(2)}s;animation-duration:${(0.3 + (i % 3) * 0.08).toFixed(2)}s${color ? `;background:${color}` : ''}"></i>`;
    }
    w.innerHTML = h;
    box.appendChild(w);
    let lastK = -1; let lastA = null;
    return {
      el: w,
      // k: 0~1 진하기 · deg: 흐르는 방향 (0 = 오른쪽→왼쪽)
      set(k, deg) {
        const kk = Math.round(clamp(k, 0, 1) * 20) / 20;
        if (kk !== lastK) { lastK = kk; w.style.opacity = kk; w.classList.toggle('on', kk > 0); }
        const a = Math.round(deg || 0);
        if (a !== lastA) { lastA = a; w.style.transform = a ? `rotate(${a}deg)` : ''; }
      }
    };
  }

  /* ---------- 관중 분위기 ---------- */
  function hype(wrap, lv) {
    const cur = wrap._ofxHype || 0;
    if (cur === lv) return false;
    wrap._ofxHype = lv;
    wrap.classList.toggle('ofx-hype1', lv === 1);
    wrap.classList.toggle('ofx-hype2', lv >= 2);
    return lv > cur;
  }

  /* ---------- 개인 최고 기록 (이 폰에만 · 점수는 높을수록 좋아요) ---------- */
  function pb(gid, score) {
    let m = {};
    try { m = JSON.parse(localStorage.getItem('arichae_oly_pb') || '{}') || {}; } catch (e) { m = {}; }
    const prev = +m[gid] || 0;
    const out = { prev, first: !prev && score > 0, pb: !!prev && score > prev };
    if (score > prev) {
      m[gid] = score;
      try { localStorage.setItem('arichae_oly_pb', JSON.stringify(m)); } catch (e) { /* 저장이 안 돼도 괜찮아요 */ }
    }
    return out;
  }

  /* ---------- 같은 씨앗 → 같은 수 (규칙 계산에도 써도 되는 순수 함수) ---------- */
  function hash(a, b) {
    let h = (a | 0) ^ Math.imul((b | 0) + 0x632BE5AB, 0x9E3779B1);
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const strHash = (s) => { let h = 7; const t = String(s); for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0; return h >>> 0; };

  /* ---------- 큰 축하 (화면 전체 꽃가루) ---------- */
  function celebrate(ctx, big, text) {
    const b = ctx.stage.getBoundingClientRect();
    const W = b.width; const H = b.height;
    ctx.fx.flash(big ? 'rgba(255,226,122,.75)' : 'rgba(255,255,255,.55)');
    const cols = ['#FFD23F', '#FF4757', '#3D7BFF', '#2ED573', '#FF6FB5', '#B07BFF'];
    const spots = [[0.5, 0.32], [0.22, 0.42], [0.78, 0.4], [0.36, 0.58], [0.66, 0.56], [0.5, 0.48]];
    spots.slice(0, big ? 6 : 3).forEach(([x, y], i) => setTimeout(() => ctx.fx.burst(W * x, H * y, cols[i % cols.length], big ? 22 : 14), i * 130));
    if (text) setTimeout(() => ctx.fx.float(text, W * 0.5, H * 0.24, '#FFD23F', big ? 38 : 30), 120);
    if (big && ctx.sfx.fanfare) setTimeout(() => ctx.sfx.fanfare(), 250);
  }

  /* ================================================================
     몸개그 자세 — t: 넘어진 뒤 흐른 시간(초)
     돌려주는 값: { p: 자세, dx: 앞으로 밀린 거리(m), lift: 뜬 높이(px) }
     (자세 각도: tilt + = 앞으로 숙임 · 90 = 엎드림 · 270 = 벌러덩)
     ================================================================ */
  const FP_HIT = 0.42;     // 얼굴 꽈당이 땅에 닿는 때
  function faceplant(t, upAt) {
    const up = Math.max(1.05, upAt || 1.3);
    if (t < 0.22) {        // 1) 발이 꼬여 휘청 (팔 빙글빙글)
      const k = t / 0.22;
      return { p: { fl: 45 * Math.sin(t * 46), bl: -45 * Math.sin(t * 46), fk: 30, bk: 55, fa: 60 + t * 1700, ba: 240 + t * 1700, tilt: lerp(22, 72, k), bob: lerp(7, 0, k), head: -18, ex: 'o' }, dx: 0.35 * k, lift: 12 * Math.sin(k * Math.PI / 2) };
    }
    if (t < FP_HIT) {      // 2) 슈퍼맨 다이빙
      const k = (t - 0.22) / (FP_HIT - 0.22);
      return { p: { fl: -20, bl: -45, fk: 40, bk: 75, fa: 170, ba: 150, tilt: lerp(72, 100, k), bob: lerp(0, 12, k), head: -10, ex: 'o' }, dx: lerp(0.35, 0.85, k), lift: 12 + 8 * Math.sin(k * Math.PI) - 12 * k };
    }
    if (t < 0.95) {        // 3) 얼굴부터 쿵! 통통 튀고 발을 동동
      const u = t - FP_HIT;
      const kick = Math.sin(u * 30);
      const bounce = u > 0.08 && u < 0.26 ? 7 * Math.sin((u - 0.08) / 0.18 * Math.PI) : 0;
      return { p: { fl: -10, bl: -28, fk: 105 + 35 * kick, bk: 110 - 35 * kick, fa: 165, ba: 145, tilt: 100 - bounce * 0.8, bob: 12, head: 8, sq: 0.3 * Math.exp(-u * 13), ex: 'd', fx: u > 0.15 ? 'stars' : '', fxx: 46, fxy: 70 }, dx: lerp(0.85, 1.05, ease(u / 0.53)), lift: bounce };
    }
    if (t < up) {          // 4) 엎어져서 빙글빙글 별
      const k = Math.min(1, (t - 0.95) / 0.45);
      return { p: { fl: -6, bl: -18, fk: lerp(100, 25, k), bk: lerp(100, 35, k), fa: 160, ba: 140, tilt: 97 + Math.sin(t * 3) * 1.5, bob: 12, head: 10, ex: 'd', fx: 'stars', fxx: 46, fxy: 70 }, dx: 1.05, lift: 0 };
    }
    if (t < up + 0.5) {    // 5) 비틀비틀 일어나기
      const k = (t - up) / 0.5; const kk = ease(k);
      return { p: { fl: lerp(-6, 30, kk), bl: lerp(-18, -20, kk), fk: lerp(25, 40, kk), bk: lerp(35, 20, kk), fa: 110 * Math.sin(k * 18), ba: -110 * Math.sin(k * 18 + 1), tilt: lerp(97, 0, kk) + Math.sin(k * Math.PI * 4) * 14 * (1 - k), bob: lerp(12, 0, kk), head: Math.sin(k * 16) * 14, ex: 'd', fx: 'stars', fxx: lerp(46, 0, kk), fxy: lerp(70, 0, kk) }, dx: 1.05, lift: 0 };
    }
    if (t < up + 1.15) {   // 6) 머리 긁적, 뒷걸음질로 출발선에 (문워크)
      const k = (t - up - 0.5) / 0.65; const ph = k * 14;
      return { p: { fl: -22 * Math.sin(ph), bl: 22 * Math.sin(ph), fk: 20 + 30 * Math.max(0, Math.sin(ph)), bk: 20 + 30 * Math.max(0, -Math.sin(ph)), fa: 150, ba: -10, tilt: -4, head: 10, ex: 's', fx: 'sweat' }, dx: lerp(1.05, 0, ease(k)), lift: 0 };
    }
    return { p: Object.assign(O.P.set(), { ex: 's', fx: 'sweat' }), dx: 0, lift: 0 };
  }
  // 결승선 배치기 다이빙 → 앞구르기 → 벌러덩 만세 (끝나면 null)
  const FLOP_HIT = 0.2;
  function flop(t) {
    if (t < FLOP_HIT) {
      const k = t / FLOP_HIT;
      return { p: { fl: -20, bl: -40, fk: 30, bk: 55, fa: 170, ba: 160, tilt: lerp(55, 100, k), bob: lerp(4, 12, k), head: -10, ex: 'e' }, lift: 16 * Math.sin(k * Math.PI) };
    }
    if (t < 1.0) {
      const u = t - FLOP_HIT; const kick = Math.sin(u * 26);
      return { p: { fl: -8, bl: -24, fk: 100 + 40 * kick, bk: 110 - 40 * kick, fa: 170, ba: 160, tilt: 100, bob: 12, head: 6, sq: 0.28 * Math.exp(-u * 12), ex: u > 0.35 ? 'h' : 'o' }, lift: 0 };
    }
    if (t < 1.45) {
      const k = ease((t - 1.0) / 0.45);
      return { p: { fl: 100, bl: 90, fk: 120, bk: 120, fa: 150, ba: 150, tilt: lerp(100, 270, k), bob: 10, ex: 'h' }, lift: 16 * Math.sin(k * Math.PI) };
    }
    if (t < 2.3) {
      const w = Math.sin(t * 14);
      return { p: { fl: 90 + 22 * w, bl: 70 - 22 * w, fk: 10, bk: 10, fa: 95 + 25 * w, ba: 80 - 25 * w, tilt: 270, bob: 12, head: -6, ex: 'h', fx: 'sparkle', fxx: -30, fxy: 60 }, lift: 0 };
    }
    if (t < 2.7) {
      const k = ease((t - 2.3) / 0.4);
      return { p: { fl: lerp(90, 4, k), bl: lerp(70, -4, k), fk: 0, bk: 0, fa: 92, ba: -92, tilt: lerp(270, 360, k), bob: lerp(12, 0, k), ex: 'h', fx: 'sparkle', fxx: lerp(-30, 0, k), fxy: lerp(60, 0, k) }, lift: 6 * Math.sin(k * Math.PI) };
    }
    return null;
  }
  // 결승선 앞 가슴 내밀기
  const lunge = () => ({ fl: 70, bl: -45, fk: 15, bk: 60, fa: -75, ba: -85, tilt: 50, head: -28, bob: 6, ex: 'e' });
  // 깜짝! (k: 0~1)
  const startle = (k) => ({ p: { fl: 10, bl: -10, fk: 20, bk: 20, fa: 150 + 20 * Math.sin(k * 20), ba: 140 - 20 * Math.sin(k * 20), tilt: -8, bob: 0, head: 8, ex: 'o' }, lift: 16 * Math.sin(Math.min(1, k * 1.6) * Math.PI) });

  /* ================================================================
     레인 경주 손맛 (100m) — race.js 가 부르는 고리
     frame(): 화면에 보여줄 시각(느린 화면) · pose(): 몸개그 · after(): 효과 · finish(): 골인 연출
     ================================================================ */
  // 출발 속임수 (모두 같은 값): 없음 / 오리 '꽥!' / 풍선 '팡!'
  //  mode(난이도): 0 없음(이지) · 1 세 번에 두 번(노멀) · 2 늘(하드) · 3 늘 + 진짜 '탕!'에 더 바짝(헬)
  function fakeOut(seed, gun, mode) {
    const m = mode == null ? 1 : mode;
    if (!m) return null;
    const h = hash(seed, 1001);
    if (m === 1 && h % 3 === 0) return null;
    const kind = (h >>> 3) % 2 ? 'duck' : 'balloon';
    const at = m >= 3 ? gun - 300 - ((h >>> 7) % 350) : gun - 450 - ((h >>> 7) % 500);    // '차렷!' 뒤 · 진짜 '탕!' 보다 0.45~0.95초 먼저 (헬 0.3~0.65초)
    return { kind, at };
  }

  const DUCK = '<g class="ofx-duck"><ellipse cx="0" cy="-11" rx="13" ry="9" fill="#FFF8E1" stroke="#E0B84A" stroke-width="1.4"/><path d="M-12 -14 Q-20 -18 -18 -9 Z" fill="#FFF8E1" stroke="#E0B84A" stroke-width="1.2"/><circle cx="9" cy="-22" r="7.5" fill="#FFF8E1" stroke="#E0B84A" stroke-width="1.4"/><circle cx="11" cy="-24" r="1.6" fill="#2A2340"/><path d="M15 -22 L23 -20 L15 -18 Z" fill="#FF8A3D"/><path d="M-3 -10 Q2 -4 7 -10" fill="none" stroke="#E0B84A" stroke-width="1.3"/><g class="ofx-duck-ft" fill="#FF8A3D"><path d="M-4 -2 l-3 3 h6 Z"/><path d="M4 -2 l-3 3 h6 Z"/></g></g>';
  const BALLOON = '<g><path d="M0 0 Q4 10 -2 20 Q-6 28 0 36" fill="none" stroke="#fff" stroke-width="1.2" opacity=".8"/><ellipse cx="0" cy="-12" rx="11" ry="13.5" fill="#FF4757"/><ellipse cx="-4" cy="-17" rx="3" ry="4.5" fill="#fff" opacity=".45"/><path d="M-2.5 1 L2.5 1 L0 -2 Z" fill="#C8202F"/></g>';
  const bubble = (t, c) => `<g class="ofx-bub"><path d="M-26 -50 h52 a8 8 0 0 1 8 8 v12 a8 8 0 0 1 -8 8 h-20 l-8 9 l-1 -9 h-23 a8 8 0 0 1 -8 -8 v-12 a8 8 0 0 1 8 -8 Z" fill="#fff" stroke="#2A2340" stroke-width="2"/><text y="-30" text-anchor="middle" font-size="17" font-weight="900" fill="${c}" font-family="system-ui,sans-serif">${t}</text></g>`;

  function raceJuice(ctx, tr, cfg, st, gun) {
    const D = cfg.D;
    const seed = ctx.seed || 1;
    const dp = (st && st.dp) || O.diffP(ctx.diff);
    const fake = cfg.fakeStart ? fakeOut(seed, gun, dp.fake) : null;
    const meP = tr.list.find((p) => p.me);
    const camC = cam(tr.svg);
    const spd = lines(tr.sceneBox);
    let back = null; let front = null; let PB = null; let PF = null; let tape = null; let prop = null; let cw = null;
    // 트랙을 다시 그릴 때마다 효과 층도 다시 붙여요
    function attach() {
      back = el('g', { class: 'ofx-back' });
      tr.layers.world.appendChild(back);
      front = el('g', { class: 'ofx-front' });
      tr.svg.appendChild(front);
      PB = parts(back, 26);
      PF = parts(front, 46);
      // 관중석 들썩 (속에 한 겹 더 넣어서 CSS 애니메이션이 원래 위치를 안 건드려요)
      const stands = tr.layers.stands;
      cw = el('g', { class: 'ofx-crowd' });
      stands.parentNode.insertBefore(cw, stands);
      cw.appendChild(stands);
      let fl = '';
      for (let i = 0; i < 9; i++) fl += `<circle class="ofx-flash" cx="${((i * 97 + 31) % 100) / 100 * tr.W}" cy="${8 + ((i * 53) % 70) / 100 * (tr.trackTop - 40)}" r="3.2" style="animation-delay:${(i * 0.23 % 1.1).toFixed(2)}s"/>`;
      cw.appendChild(el('g', { class: 'ofx-flashes' }, fl));
      // 결승 테이프 (레인을 가로질러요)
      const top = tr.L[tr.n - 1]; const bot = tr.L[0];
      const y1 = top.y - 50 * top.s * tr.baseS; const y2 = bot.y - 50 * bot.s * tr.baseS;
      const X = D * tr.ppm;
      tape = { y1, y2, X, broken: tape && tape.broken, t: tape ? tape.t : 0 };
      tape.g = el('g', { class: 'ofx-tape' });
      tape.a = el('path', { d: `M${X} ${y1} L${X} ${(y1 + y2) / 2}`, stroke: '#fff', 'stroke-width': 3.2, 'stroke-dasharray': '7 5', fill: 'none' });
      tape.b = el('path', { d: `M${X} ${(y1 + y2) / 2} L${X} ${y2}`, stroke: '#fff', 'stroke-width': 3.2, 'stroke-dasharray': '7 5', fill: 'none' });
      tape.a2 = el('path', { d: `M${X} ${y1} L${X} ${(y1 + y2) / 2}`, stroke: '#FF4757', 'stroke-width': 3.2, 'stroke-dasharray': '5 7', 'stroke-dashoffset': -7, fill: 'none' });
      tape.b2 = el('path', { d: `M${X} ${(y1 + y2) / 2} L${X} ${y2}`, stroke: '#FF4757', 'stroke-width': 3.2, 'stroke-dasharray': '5 7', 'stroke-dashoffset': -7, fill: 'none' });
      const ga = el('g', {}); ga.appendChild(tape.a); ga.appendChild(tape.a2);
      const gb = el('g', {}); gb.appendChild(tape.b); gb.appendChild(tape.b2);
      tape.ga = ga; tape.gb = gb;
      tape.g.appendChild(ga); tape.g.appendChild(gb);
      if (tape.broken) tape.g.setAttribute('display', 'none');
      tr.layers.obj.appendChild(tape.g);
      // 출발 속임수 소품 (세계 좌표: 관중석 아래 잔디 위)
      prop = null;
      if (fake) {
        prop = el('g', { class: 'ofx-prop', display: 'none' }, fake.kind === 'duck' ? DUCK : BALLOON);
        tr.layers.obj.appendChild(prop);
        prop.bub = el('g', { display: 'none' }, bubble(fake.kind === 'duck' ? '꽥!' : '팡!', '#FF4757'));
        tr.layers.obj.appendChild(prop.bub);
      }
    }
    const prevAB = tr.o.afterBuild;
    tr.o.afterBuild = (t) => { if (prevAB) prevAB(t); attach(); };
    attach();

    // ---- 느린 화면 (포토 피니시): 지난 모습을 모아 두고 천천히 다시 보여줘요 ----
    const hist = [];
    let de = 0; let slow = 0; let slowT = 0; let photoDone = false; let photoArmed = false;
    let finFx = 0;
    const W = () => tr.W;
    function sample(t) {
      let i = hist.length - 1;
      while (i > 0 && hist[i - 1].e > t) i--;
      const b = hist[i]; const a = hist[Math.max(0, i - 1)];
      if (!a || a === b || b.e <= t) return b;
      const k = clamp((t - a.e) / Math.max(1, b.e - a.e), 0, 1);
      const out = {};
      Object.keys(b.a).forEach((pid) => {
        const A = a.a[pid] || b.a[pid]; const B = b.a[pid];
        out[pid] = Object.assign({}, A, { x: lerp(A.x, B.x, k), v: lerp(A.v, B.v, k) });
      });
      return { e: t, a: out };
    }
    function frame(e, dt, ents) {
      hist.push({ e, a: ents });
      while (hist.length > 2 && hist[0].e < e - 4000) hist.shift();
      let rate = 1;
      if (slow === 0 || slow === 3) de = e;
      else if (slow === 1) {
        slowT += dt; rate = 0.3; de += dt * 1000 * rate;
        if (slowT > 1.15) { slow = 2; camC.zoom(1, 4); }
      } else if (slow === 2) {
        rate = 2.6; de += dt * 1000 * rate;
        if (de >= e) { de = e; slow = 3; rate = 1; }
      }
      const view = de >= e - 0.5 ? { e, a: ents } : sample(de);
      view.rate = rate;
      // 포토 피니시 판단: 결승선 앞에서 두 선수가 딱 붙어 있으면
      if (!slow && !photoDone) {
        const near = [];
        Object.keys(view.a).forEach((pid) => { const E = view.a[pid]; if (E.x > D - 2.4 && E.x < D && E.v > 4) near.push(E.x); });
        near.sort((a, b) => b - a);
        const lx = tr.sx(D);
        if (near.length >= 2 && near[0] - near[1] < 1.2 && lx > W() * 0.2 && lx < W() * 1.05) {
          slow = 1; slowT = 0; photoArmed = true;
          camC.focus(lx, tr.L[0].y - 40 * tr.baseS);
          camC.zoom(1.32, 5);
          tr.wrap.classList.add('ofx-slow');
          tr.say('사진 판독!?', '#FFE27A', 900);
          if (ctx.sfx.drumroll) ctx.sfx.drumroll(0.9);
        }
      }
      return view;
    }

    // ---- 몸개그 · 발 구름 ----
    const flopOf = {};
    function pose(p, A, I, base) {
      let ps = base; let x = I.x; let lift = base.lift || 0;
      const t = I.e;
      // 상태가 바뀐 때 (부정출발 등)
      if (A.jst !== I.state) { A.jst = I.state; A.jstT = t; if (I.state === 1) { A.fpT = t; A.fpHit = false; } }
      // 1) 출발 속임수에 깜짝 (모두)
      if (fake && t >= fake.at && t < fake.at + 520 && I.state !== 1 && I.x < 0.05 && !A.fpT) {
        const s = startle((t - fake.at) / 520);
        return { pose: Object.assign(s.p, { lift: s.lift }), x };
      }
      // 2) 부정출발 → 발이 꼬여 얼굴 꽈당 → 뒷걸음질로 출발선
      if (A.fpT != null) {
        const ft = (t - A.fpT) / 1000;
        const avail = (gun + ((p.me && dp.fs) || cfg.falsePenalty || 1000) - A.fpT) / 1000;
        const running = I.x > 0.05 && I.state !== 1;
        if (running || ft > Math.max(2.4, avail + 0.3)) A.fpT = null;
        else {
          const f = faceplant(ft, Math.max(1.05, avail - 1.2));
          if (!A.fpHit && ft >= FP_HIT) {
            A.fpHit = true;
            impact(A, x + f.dx, 1.0);
            if (p.me) { ctx.sfx.thud && ctx.sfx.thud(); camC.shake(5, 320); }
          }
          return { pose: Object.assign(f.p, { lift: f.lift }), x: x + f.dx };
        }
      }
      // 3) 결승선: 딱 붙은 승부면 가슴 내밀기 → (반쯤은) 배치기 다이빙
      if (I.x > D - 2.6 && I.x < D && !A.dive && I.v > 3) {
        let close = false;
        tr.list.forEach((q) => { const o = tr.ath[q.pid]; if (q.pid !== p.pid && o && o.lastX != null && Math.abs(o.lastX - I.x) < 2) close = true; });
        A.dive = close;
        // 반쯤은 배치기 다이빙 (모든 폰이 같게) · 내가 포토 피니시 주인공이면 무조건!
        if (close) flopOf[p.pid] = (hash(seed, strHash(p.pid)) % 2) === 0 || (p.me && slow > 0);
      }
      A.lastX = I.x;
      if (A.dive && I.x > D - 1.5 && I.x < D) return { pose: Object.assign(lunge(), { lift: 0 }), x };
      if (A.dive && I.x >= D && A.crossT == null) A.crossT = t;
      if (A.dive && A.crossT != null && flopOf[p.pid]) {
        const ft = (t - A.crossT) / 1000;
        const f = flop(ft);
        if (f) {
          if (!A.flopHit && ft >= FLOP_HIT) { A.flopHit = true; impact(A, x + 0.4, 1.2); if (p.me) { ctx.sfx.thud && ctx.sfx.thud(); camC.shake(4, 260); } }
          return { pose: Object.assign(f.p, { lift: f.lift }), x };
        }
      }
      // 4) 달리기: 발 구를 때 살짝 찌그러짐 + 먼지
      if (I.state === 0 && I.v > 0.8 && !(I.fin && I.v < 3)) {
        const s = Math.sin(I.ph); const k = Math.min(1, I.v / 10.5);
        ps = Object.assign({}, base, { sq: k * (0.11 * Math.pow(Math.abs(s), 10) - 0.035) });
        const stepN = Math.floor((I.ph + Math.PI / 2) / Math.PI);
        if (A.stepN !== stepN) {
          A.stepN = stepN;
          if (A.i < 4 && (p.me || stepN % 2 === 0)) {
            const L = A.lane; const sc = L.s * tr.baseS;
            PB.burst('dust', (x - 0.15) * tr.ppm, L.y - 2, p.me ? 2 : 1, { dir: Math.PI, spread: 0.9, sp: 30 + I.v * 4, k: sc * (p.me ? 1 : 0.8), vy: -10 });
          }
          if (p.me && I.v > 10.3) camC.shake(1.6, 90);
        }
      }
      return { pose: Object.assign(ps, { lift }), x };
    }
    // 쿵! 먼지 + 별
    function impact(A, xm, k) {
      const L = A.lane; const sc = L.s * tr.baseS;
      PB.burst('dust', xm * tr.ppm + 40 * sc, L.y - 4, 6, { dir: -Math.PI / 2, spread: 2.6, sp: 70 * k, k: sc * 1.1 });
      PF.burst('star', xm * tr.ppm + 40 * sc, L.y - 24 * sc, 3, { sp: 80, k: sc });
    }

    // ---- 매 프레임 효과 ----
    function after(e, dt, view) {
      const dts = dt || 0.016;
      front.setAttribute('transform', `translate(${(-tr.camX * tr.ppm).toFixed(1)} 0)`);
      PB.tick(dts); PF.tick(dts);
      camC.tick(dts);
      const me = view.a[meP.pid];
      // 속도선
      spd.set(me && me.state === 0 && !me.fin ? (me.v - 9.2) / 2.6 : 0, 0);
      // 관중: 선두가 결승에 가까울수록 들썩
      let lead = 0;
      Object.keys(view.a).forEach((pid) => { lead = Math.max(lead, view.a[pid].x); });
      const lv = finFx && e - finFx < 2500 ? 2 : lead > D * 0.82 ? 2 : lead > D * 0.5 ? 1 : 0;
      if (hype(tr.wrap, lv) && lv === 2 && ctx.sfx.roar) ctx.sfx.roar(0.5);
      // 결승 테이프: 처음 들어온 선수가 끊어요
      if (!tape.broken && lead >= D) {
        tape.broken = true; tape.t = e;
        let who = null;
        Object.keys(view.a).forEach((pid) => { if (!who || view.a[pid].x > view.a[who].x) who = pid; });
        const A = tr.ath[who];
        tape.cut = A ? A.lane.y - 50 * A.lane.s * tr.baseS : (tape.y1 + tape.y2) / 2;
        tape.a.setAttribute('d', `M${tape.X} ${tape.y1} L${tape.X} ${tape.cut}`); tape.a2.setAttribute('d', `M${tape.X} ${tape.y1} L${tape.X} ${tape.cut}`);
        tape.b.setAttribute('d', `M${tape.X} ${tape.cut} L${tape.X} ${tape.y2}`); tape.b2.setAttribute('d', `M${tape.X} ${tape.cut} L${tape.X} ${tape.y2}`);
        PF.burst('confetti', tape.X, tape.cut, 18, { sp: 220, dir: -Math.PI / 2, spread: 2.4 });
        if (photoArmed && !photoDone) photo();
      }
      if (tape.broken) {
        const k = clamp((e - tape.t) / 700, 0, 1);
        if (k >= 1) tape.g.setAttribute('display', 'none');
        else {
          const a = 75 * ease(k) + Math.sin(k * 18) * 8 * (1 - k);
          tape.ga.setAttribute('transform', `rotate(${(-a).toFixed(1)} ${tape.X} ${tape.y1})`);
          tape.gb.setAttribute('transform', `rotate(${a.toFixed(1)} ${tape.X} ${tape.y2})`);
          tape.g.setAttribute('opacity', (1 - k * k).toFixed(2));
        }
      }
      // 출발 속임수
      if (fake && prop) fakeTick(e);
      if (slow === 3 && tr.wrap.classList.contains('ofx-slow')) tr.wrap.classList.remove('ofx-slow');
    }
    // 찰칵! 사진 판독 (결승선 둘레를 잘라서 폴라로이드처럼)
    function photo() {
      photoDone = true;
      ctx.fx.flash('rgba(255,255,255,.85)');
      if (ctx.sfx.shutter) ctx.sfx.shutter();
      if (ctx.sfx.roar) setTimeout(() => ctx.sfx.roar(1), 120);
      try {
        const c = tr.svg.cloneNode(true);
        c.removeAttribute('style');
        c.removeAttribute('class');
        const lx = tr.sx(D); const top = tr.trackTop - 20; const h = tr.H - top;
        const w = Math.min(tr.W, h * 1.05);
        c.setAttribute('viewBox', `${(lx - w * 0.55).toFixed(1)} ${top.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
        c.setAttribute('width', '100%'); c.setAttribute('height', '100%');
        c.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        c.querySelectorAll('.ofx-front,.ofx-flashes').forEach((n) => n.remove());
        const card = G.kit.el('<div class="ofx-photo"><div class="ofx-photo-img"></div><b>사진 판독</b></div>');
        card.firstElementChild.appendChild(c);
        tr.wrap.appendChild(card);
        setTimeout(() => card.classList.add('out'), 2600);
        setTimeout(() => card.remove(), 3200);
      } catch (err) { /* 사진이 안 돼도 경기는 계속 */ }
    }
    let fakeStage = 0;
    function fakeTick(e) {
      const lx = (m) => (m * tr.ppm).toFixed(1);
      const gy = tr.trackTop - 3;
      if (fake.kind === 'duck') {
        // 오른쪽에서 뒤뚱뒤뚱 걸어와서 '꽥!'
        const t0 = fake.at - 1700;
        if (e < t0 || e > gun + 6000) { prop.setAttribute('display', 'none'); prop.bub.setAttribute('display', 'none'); return; }
        prop.removeAttribute('display');
        const k = (e - t0) / 1700;
        const xm = k < 1 ? lerp(12.5, 5.2, ease(k)) : 5.2 - (e - fake.at) / 1000 * 0.8;
        const quack = e >= fake.at && e < fake.at + 420;
        const hop = quack ? -10 * Math.sin((e - fake.at) / 420 * Math.PI) : -Math.abs(Math.sin(e / 90)) * 2.2;
        const sc = tr.baseS * 1.1;
        prop.setAttribute('transform', `translate(${lx(xm)} ${(gy + hop).toFixed(1)}) scale(${(-sc).toFixed(2)} ${(sc * (quack ? 1.15 : 1)).toFixed(2)}) rotate(${(Math.sin(e / 90) * 6).toFixed(1)})`);
        prop.bub.setAttribute('display', quack || (e >= fake.at && e < fake.at + 700) ? 'inline' : 'none');
        prop.bub.setAttribute('transform', `translate(${lx(xm)} ${(gy - 22 * sc).toFixed(1)}) scale(${(sc * 0.9).toFixed(2)})`);
      } else {
        // 관중석에서 풍선이 둥실둥실 올라오다가 '팡!'
        const t0 = fake.at - 2000;
        const sc = tr.baseS * 0.9;
        const rise = tr.trackTop * 0.42;
        if (e >= t0 && e < fake.at) {
          prop.removeAttribute('display');
          const k = (e - t0) / 2000;
          prop.setAttribute('transform', `translate(${lx(6.4 + Math.sin(e / 300) * 0.25)} ${(gy - 6 - k * rise).toFixed(1)}) scale(${sc.toFixed(2)})`);
        } else prop.setAttribute('display', 'none');
        prop.bub.setAttribute('display', e >= fake.at && e < fake.at + 700 ? 'inline' : 'none');
        if (e >= fake.at && fakeStage === 0) {
          const by = gy - 6 - rise - 12 * sc;
          PF.burst('confetti', 6.4 * tr.ppm, by, 14, { sp: 200 });
          PF.burst('ring', 6.4 * tr.ppm, by, 1, { sp: 0, color: '#FF4757' });
          prop.bub.setAttribute('transform', `translate(${lx(6.4)} ${(by + 36).toFixed(1)}) scale(${(sc * 0.9).toFixed(2)})`);
        }
      }
      // 소리와 글자 (한 번만)
      if (e >= fake.at && fakeStage === 0) {
        fakeStage = 1;
        if (fake.kind === 'duck') { if (ctx.sfx.quack) ctx.sfx.quack(); } else if (ctx.sfx.pop) ctx.sfx.pop();
        tr.say(fake.kind === 'duck' ? '꽥!' : '팡!', '#FF8B95', 0);
      }
      if (fakeStage === 1 && e >= fake.at + 380) {
        fakeStage = 2;
        if (e < gun) tr.say('차렷!', '#FFE27A', 0);
      }
    }
    // 부정출발 글자를 속임수에 맞게
    function press(r, e) {
      if (!r || !r.say || !fake) return;
      if (e >= fake.at && e < fake.at + 1000 && /부정출발/.test(r.say)) r.say = fake.kind === 'duck' ? '오리한테 속았다!' : '풍선한테 속았다!';
    }
    // 내가 골인한 순간
    function finish(score, rank, e) {
      finFx = e || 1;
      if (!photoDone) { ctx.fx.flash('rgba(255,255,255,.55)'); if (ctx.sfx.roar) ctx.sfx.roar(rank === 1 ? 1 : 0.7); }
      camC.punch(0.06);
      const b = ctx.stage.getBoundingClientRect();
      PF.burst('confetti', D * tr.ppm, tr.L[0].y - 60 * tr.baseS, 16, { sp: 240 });
      const r = pb(cfg.id + (dp.id === 'normal' ? '' : '@' + dp.id), score);
      if (r.pb) setTimeout(() => celebrate(ctx, true, '개인 신기록!'), 700);
      else if (r.first) setTimeout(() => ctx.fx.float('첫 기록!', b.width * 0.5, b.height * 0.3, '#7DF0AE', 30), 700);
      else if (rank === 1) setTimeout(() => celebrate(ctx, false), 500);
    }
    return {
      frame, pose, after, press, finish,
      fakeAt: fake ? fake.at : null,
      destroy() { /* 내 경기가 끝나도 구경은 계속돼요 (화면은 다음 종목 때 통째로 지워져요) */ }
    };
  }

  O.fx = { parts, cam, lines, hype, pb, hash, strHash, celebrate, raceJuice, SHAPE, CONF, lerp };
  O.tumble = { faceplant, flop, lunge, startle, FP_HIT, FLOP_HIT };
})();
