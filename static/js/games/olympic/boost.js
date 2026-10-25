/* 아리채 오락실 · 올림픽관 '필살기 부스터' + '역전 장치'
   연타 종목(100m·허들·수영·스피드스케이팅·쇼트트랙·봅슬레이)에서 써요.
   - 제대로 인정된 연타가 게이지를 채워요. 다 차면 한 종목에 딱 한 번! 잠깐 빨라져요 (모든 선수가 똑같은 효과)
   - 생김새만 선수마다 달라요 (뿌뿌 불꽃 · 붕붕 날개 · 도치 회전 … 퐁당 물대포)
   - 켜는 법: 무대 위에 뜨는 큰 [부스터!] 를 톡 · 또는 빨강+파랑을 같이 꾹(0.18초)
   - 역전 장치: 뒤에 있을수록 게이지가 빨리 차요 (위쪽 절반 ×1.0 … 꼴찌 ×1.6)
   규칙 계산(순수)은 st.bo 에만 기록하고, 켠 것('X')·배율이 바뀐 것('M1.3')은 누른 기록(log)에 남겨요
   → 같은 누른 기록이면 유령·서버 다시 계산도 똑같이 나와요. 화면 효과(무작위 OK)는 아래쪽 ui 에서 */
(function () {
  'use strict';

  const O = window.Oly;
  const G = window.Games;

  /* ================================================================
     순수 계산 (Math.random · 화면 · 시계 없음)
     ================================================================ */
  const MUL = 1.5;          // 부스터 동안 움직이는 빠르기 ×1.5 (모든 선수 같아요)
  const FILL_GAP = 70;      // 게이지는 70ms 에 한 칸까지만 (아주 빠른 연타로 터지지 않게 · 1초에 최대 약 14칸)
  const CHORD_MS = 180;     // 빨강+파랑 같이 꾹 누르고 있는 시간

  // cfg = { cap: 채울 칸 수, ms: 부스터 시간 } · dp = 난이도 값 (boostCap)
  function make(cfg, dp) {
    return { cap: Math.max(1, Math.round(cfg.cap * ((dp && dp.boostCap) || 1))), ms: cfg.ms, g: 0, mul: 1, left: 0, used: 0, at: -1, lt: -1e9 };
  }
  // 인정된 연타 한 번 (w: 세기 0~1) → 이번에 막 다 찼으면 true
  function tap(st, e, w) {
    const b = st.bo;
    if (!b || b.used || b.g >= b.cap) return false;
    const gap = e - b.lt;
    b.lt = e;
    const k = Math.min(1, Math.max(0, gap) / FILL_GAP);
    b.g = Math.min(b.cap, b.g + (w == null ? 1 : w) * k * b.mul);
    return b.g >= b.cap;
  }
  // 연타 말고 다른 것으로 조금 채우기 (봅슬레이: 벽에 안 부딪히고 달린 거리)
  function add(st, w) {
    const b = st.bo;
    if (!b || b.used || b.g >= b.cap) return;
    b.g = Math.min(b.cap, b.g + w * b.mul);
  }
  const ready = (st) => !!(st.bo && !st.bo.used && st.bo.g >= st.bo.cap);
  const k = (st) => (st.bo && st.bo.left > 0 ? MUL : 1);
  const active = (st) => !!(st.bo && st.bo.left > 0);
  // 10ms 마다: 움직이는 중이면 부스터 시간이 줄어요 (moving=false 면 멈춰 있어요)
  function run(st, ms, moving) { const b = st.bo; if (b && b.left > 0 && moving) b.left = Math.max(0, b.left - ms); }
  const isCode = (c) => c === 'X' || (c.length > 1 && c[0] === 'M');
  // 누른 기록의 특별한 값: 'X' 부스터 켜기 · 'M1.3' 역전 배율
  function input(st, c, e, ok) {
    const b = st.bo;
    if (!b) return null;
    if (c === 'X') {
      if (!ready(st) || ok === false) return null;
      b.used = 1; b.left = b.ms; b.at = e; b.g = 0;
      return { boost: true };
    }
    if (c[0] === 'M') {
      const m = parseFloat(c.slice(1));
      if (m >= 1 && m <= 2) b.mul = m;
      return { mul: true };
    }
    return null;
  }
  // 다른 폰에 보내는 값: 0 채우는 중 · 1 준비 · 2 부스터 중 · 3 다 씀
  function code(st) { const b = st.bo; if (!b) return 0; return b.left > 0 ? 2 : b.used ? 3 : b.g >= b.cap ? 1 : 0; }
  const frac = (st) => (st.bo ? (st.bo.used ? 0 : st.bo.g / st.bo.cap) : 0);
  // 역전 배율: 순위 rank (1등 = 1) · 선수 n 명 · behind = 1등과 벌어진 거리 ÷ 경기 거리 (0~1)
  //  위쪽 절반은 ×1.0. 아래쪽 절반은 꼴찌에 가까울수록 · 1등과 많이 벌어질수록 커져서 꼴찌 최대 ×1.6
  //  (딱 붙은 무리에서는 살짝만 → 순위가 마구 뒤집히지 않게 · 많이 뒤처지면 크게 → 가운데까지 올라올 수 있게)
  const GAP_FULL = 0.08;    // 경기 거리의 8% 이상 뒤처지면 '많이' 뒤처진 것
  function mulFor(rank, n, behind) {
    if (n < 2 || rank <= 1) return 1;
    const f = (rank - 1) / (n - 1);
    if (f <= 0.5) return 1;
    const rk = (f - 0.5) / 0.5;
    const gp = behind == null ? 1 : Math.max(0, Math.min(1, behind / GAP_FULL));
    const m = 1 + 0.6 * rk * rk * (0.4 + 0.6 * gp);     // 꼴찌 쪽으로 갈수록 가파르게
    return Math.round(m * 10) / 10;
  }

  /* ---------- 빨강+파랑 같이 꾹 ---------- */
  function chord() {
    const dn = { r: 0, b: 0 }; let both = 0; let done = false;
    return {
      down(c, t) { if (c === 'r' || c === 'b') { dn[c] = t || 1; if (dn.r && dn.b) both = Math.max(dn.r, dn.b); } },
      up(c) { if (c === 'r' || c === 'b') { dn[c] = 0; both = 0; done = false; } },
      // 같이 누른 채로 0.18초가 지나면 한 번 true
      check(t) { if (!both || done || t - both < CHORD_MS) return false; done = true; return true; }
    };
  }

  /* ================================================================
     생김새 (선수마다) — 화면 효과라 무작위 OK
     ================================================================ */
  const LOOK = {
    dino: { say: '불꽃 대시!', c: '#FF6A2B', c2: '#FFD23F' },
    bee: { say: '붕붕 터보!', c: '#FFD23F', c2: '#9CC9E8' },
    hedgehog: { say: '가시 스핀!', c: '#3D9BFF', c2: '#8E5E40', spin: true },
    alpaca: { say: '뭉게뭉게 대시!', c: '#FFFFFF', c2: '#FFC9D6' },
    redpanda: { say: '나뭇잎 회오리!', c: '#5FCB4A', c2: '#E8743B' },
    squirrel: { say: '도토리 로켓!', c: '#FF8A3D', c2: '#9E6431' },
    turtle: { say: '등껍질 터보!', c: '#4E9E62', c2: '#9FD4FF', tuck: true },
    unicorn: { say: '무지개 질주!', c: '#FF6FB5', c2: '#7FD3FF' },
    octopus: { say: '먹물 제트!', c: '#33407A', c2: '#FF8FB8' },
    whale: { say: '물대포 슝!', c: '#3D9BEA', c2: '#DDF0FF' }
  };
  const look = (id) => LOOK[id] || LOOK.dino;
  const RAINBOW = ['#FF4757', '#FF8A3D', '#FFD23F', '#2ED573', '#3D7BFF', '#A45CFF'];

  // 꼬리 조각 모양 (가운데 0,0 · 크기 약 10)
  function partHTML(id, i) {
    switch (id) {
      case 'dino': return `<path d="M0 -7 Q6 0 0 7 Q-9 0 0 -7 Z" fill="${i % 2 ? '#FF4757' : '#FF8A3D'}"/><path d="M1 -3 Q4 0 1 3 Q-3 0 1 -3 Z" fill="#FFE27A"/>`;
      case 'bee': return i % 3 ? '<ellipse rx="7" ry="3.4" fill="rgba(232,246,255,.9)" stroke="#9CC9E8" stroke-width=".8"/>' : '<path d="M-5 -3 h6 l-6 6 h6" fill="none" stroke="#3A2F1E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
      case 'hedgehog': return '<circle r="7" fill="none" stroke="#3D9BFF" stroke-width="2.4" stroke-dasharray="7 5"/>';
      case 'alpaca': return '<g fill="#fff" stroke="#E9D9BC" stroke-width=".8"><circle cx="-4" cy="1" r="4.5"/><circle cx="2" cy="-2" r="5.2"/><circle cx="5" cy="2.5" r="3.6"/></g>';
      case 'redpanda': return `<path d="M-7 0 Q0 -6 7 0 Q0 6 -7 0 Z" fill="${i % 2 ? '#5FCB4A' : '#E8A13B'}"/><path d="M-6 0 H6" stroke="rgba(0,0,0,.25)" stroke-width=".8"/>`;
      case 'squirrel': return i % 2 ? '<g><ellipse cy="2" rx="4.4" ry="5" fill="#C98A4B"/><path d="M-5.5 -1 Q0 -7 5.5 -1 Z" fill="#7A4E2A"/><path d="M0 -5 V-8" stroke="#7A4E2A" stroke-width="1.4" stroke-linecap="round"/></g>' : '<path d="M0 -5 Q6 0 0 5 Q-8 0 0 -5 Z" fill="#FFB43D"/>';
      case 'turtle': return '<circle r="4.5" fill="rgba(220,240,255,.5)" stroke="#9FD4FF" stroke-width="1.4"/><circle cx="-1.5" cy="-1.5" r="1.2" fill="#fff"/>';
      case 'unicorn': return `<circle r="4.6" fill="${RAINBOW[i % RAINBOW.length]}"/>`;
      case 'octopus': return '<g fill="#2A2F5A"><circle r="5.5"/><circle cx="5" cy="3" r="3"/><circle cx="-4" cy="4" r="2.4"/></g>';
      case 'whale': return '<path d="M0 -6 Q5 1 0 5 Q-5 1 0 -6 Z" fill="#7FC8FF" stroke="#fff" stroke-width=".8"/>';
      default: return '<circle r="4" fill="#FFD23F"/>';
    }
  }
  // 옆에서 본 선수 뒤의 기운 (발바닥 0,0 · 오른쪽을 봐요 · 키 약 86) — 뒤(-x)로 뻗어요
  function auraHTML(id) {
    const L = look(id);
    const glow = `<ellipse cx="-6" cy="-44" rx="40" ry="34" fill="${L.c}" opacity=".22"/><g class="obs-streak" stroke="${L.c}" stroke-width="3.2" stroke-linecap="round" opacity=".8"><path d="M-30 -70 h-34"/><path d="M-36 -46 h-44"/><path d="M-30 -22 h-32"/></g>`;
    let x = '';
    switch (id) {
      case 'dino': x = '<g class="obs-flick"><path d="M-14 -30 Q-46 -52 -80 -38 Q-56 -30 -82 -16 Q-50 -12 -14 -14 Z" fill="#FF8A3D" opacity=".9"/><path d="M-16 -27 Q-40 -38 -60 -30 Q-44 -24 -58 -18 Q-38 -17 -16 -18 Z" fill="#FFE27A"/></g>'; break;
      case 'bee': x = '<g class="obs-buzz" opacity=".85"><ellipse cx="-14" cy="-70" rx="20" ry="9" transform="rotate(-30 -14 -70)" fill="#E8F6FF" stroke="#9CC9E8" stroke-width="1.4"/><ellipse cx="-20" cy="-58" rx="16" ry="7" transform="rotate(-8 -20 -58)" fill="#E8F6FF" stroke="#9CC9E8" stroke-width="1.4"/></g>'; break;
      case 'hedgehog': x = '<g class="obs-ring"><circle cx="0" cy="-40" r="44" fill="none" stroke="#3D9BFF" stroke-width="5" stroke-dasharray="26 14" opacity=".85"/></g>'; break;
      case 'alpaca': x = '<g fill="#fff" stroke="#E9D9BC" stroke-width="1.4"><circle cx="-10" cy="2" r="12"/><circle cx="8" cy="0" r="14"/><circle cx="26" cy="4" r="9"/><circle cx="-28" cy="4" r="8"/></g>'; break;
      case 'redpanda': x = '<g class="obs-ring"><path d="M-40 -40 a40 40 0 0 1 80 0" fill="none" stroke="#5FCB4A" stroke-width="4" stroke-dasharray="10 12"/><path d="M40 -40 a40 40 0 0 1 -80 0" fill="none" stroke="#E8A13B" stroke-width="4" stroke-dasharray="10 12"/></g>'; break;
      case 'squirrel': x = '<g class="obs-flick"><path d="M-12 -48 L-58 -40 L-12 -32 Z" fill="#FF8A3D"/><path d="M-12 -45 L-38 -40 L-12 -35 Z" fill="#FFE27A"/></g>'; break;
      case 'turtle': x = '<g class="obs-flick"><path d="M-24 -40 L-70 -30 L-24 -18 Z" fill="#7FD3FF" opacity=".85"/><path d="M-24 -35 L-48 -29 L-24 -23 Z" fill="#fff"/></g>'; break;
      case 'unicorn': x = RAINBOW.map((c, i) => `<rect x="-120" y="${-62 + i * 6}" width="104" height="6" fill="${c}" opacity=".85"/>`).join(''); break;
      case 'octopus': x = '<g fill="#2A2F5A" opacity=".85"><circle cx="-30" cy="-36" r="14"/><circle cx="-50" cy="-30" r="10"/><circle cx="-66" cy="-38" r="7"/><circle cx="-44" cy="-48" r="6"/></g>'; break;
      case 'whale': x = '<g class="obs-flick"><path d="M-14 -46 L-82 -62 L-82 -18 Z" fill="#9FD4FF" opacity=".75"/><path d="M-14 -42 L-60 -48 L-60 -32 Z" fill="#fff" opacity=".9"/></g>'; break;
      default: break;
    }
    return glow + x;
  }

  /* ---------- 꼬리 조각 뿌리기 (SVG 층 하나에 · 개수 상한) ---------- */
  function trailer(layer, max) {
    const P = O.fx.parts(layer, max || 36);
    const tt = {};
    let n = 0;
    return {
      P,
      // (x, y) 화면/세계 좌표 · dir 진행 방향(라디안) · s 크기 · dense 내 선수면 더 촘촘
      emit(id, pid, x, y, dir, s, dense, dt) {
        tt[pid] = (tt[pid] || 0) - (dt || 0.016);
        if (tt[pid] > 0) return;
        tt[pid] = dense ? 0.035 : 0.09;
        const back = dir + Math.PI;
        const sc = s || 1;
        const many = id === 'unicorn' ? 3 : 1;
        for (let j = 0; j < many; j++) {
          n++;
          const off = id === 'unicorn' ? (j - 1) * 6 * sc : (Math.random() - 0.5) * 10 * sc;
          const a = back + (Math.random() - 0.5) * 0.6;
          const sp = (id === 'hedgehog' ? 40 : 90) * (0.6 + Math.random() * 0.6) * sc;
          P.spawn({
            x: x - Math.sin(dir) * off, y: y + Math.cos(dir) * off,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (id === 'alpaca' || id === 'turtle' ? 20 : 0),
            ay: id === 'octopus' || id === 'whale' ? 60 : id === 'dino' || id === 'squirrel' ? -40 : 0, drag: 2.2,
            life: id === 'unicorn' ? 0.4 : 0.55 + Math.random() * 0.2,
            r: Math.random() * 360, vr: id === 'redpanda' || id === 'hedgehog' ? 540 : (Math.random() - 0.5) * 200,
            s0: (id === 'unicorn' ? 1 : 1.15) * sc, s1: 0.35 * sc, o0: 1, o1: 0,
            html: partHTML(id, id === 'unicorn' ? j + (n >> 2) : n)
          });
        }
      },
      tick(dt) { P.tick(dt); },
      clear() { P.clear(); }
    };
  }

  // AI 선수 흉내 부스터 (화면만 · 기록은 안 바뀌어요): 경기의 45~75% 쯤 한 번
  function botWindow(seed, pid) {
    const h = O.fx.hash(seed || 1, O.fx.strHash(pid));
    const f0 = 0.45 + (h % 31) / 100;
    return [f0, f0 + 0.13];
  }

  /* ================================================================
     화면: 게이지 · 큰 [부스터!] 버튼 · 외침 · 다른 선수 알림
     opts = { wrap, scene, ath(내 선수 id), onFire() }
     ================================================================ */
  const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 1.5 L4 13.5 H11 L9.5 22.5 L20 9.5 H12.8 Z" fill="currentColor" stroke="#2A2340" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  function ui(ctx, opts) {
    const L = look(opts.ath);
    const wrap = opts.wrap;
    const scene = opts.scene;
    const box = G.kit.el(`<div class="obs-ui" style="--bc:${L.c};--bc2:${L.c2}">
      <div class="obs-gauge"><span class="obs-gf">${O.faceSVG(opts.ath, 'e')}</span><div class="obs-gbar"><i></i></div><b class="obs-gt">부스터</b></div>
      <button type="button" class="obs-btn" aria-label="부스터 쓰기"><span class="obs-bring"></span><span class="obs-bface">${O.faceSVG(opts.ath, 'h')}</span><span class="obs-btxt"><b class="disp">부스터!</b><em>톡! 또는 빨강+파랑 꾹</em></span><span class="obs-bolt">${BOLT}</span></button>
      <div class="obs-shout"><span class="obs-sface"></span><b class="disp"></b></div>
      <div class="obs-feed"></div>
      <div class="obs-rush"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>`);
    wrap.appendChild(box);
    const gauge = box.querySelector('.obs-gauge');
    const fill = box.querySelector('.obs-gbar i');
    const gt = box.querySelector('.obs-gt');
    const btn = box.querySelector('.obs-btn');
    const shoutEl = box.querySelector('.obs-shout');
    const feed = box.querySelector('.obs-feed');
    const rush = box.querySelector('.obs-rush');
    // 게이지·버튼을 무대(scene) 위쪽에 맞춰요
    const placeBox = () => { box.style.top = (scene.offsetTop || 0) + 'px'; };
    placeBox();
    let lastCode = -1; let lastPct = -1; let off = false; let shoutT = 0;
    const onDown = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (!off && btn.classList.contains('on') && opts.onFire) opts.onFire(); };
    btn.addEventListener('pointerdown', onDown);
    return {
      // 매 프레임: 게이지 · 버튼
      update(st, e, fin) {
        placeBox();
        const c = off || fin ? 3 : code(st);
        const pct = Math.round(frac(st) * 100);
        if (pct !== lastPct) { lastPct = pct; fill.style.transform = `scaleX(${(pct / 100).toFixed(2)})`; }
        if (c !== lastCode) {
          const prev = lastCode;
          lastCode = c;
          gauge.className = 'obs-gauge s' + c;
          gt.textContent = c === 1 ? '준비 완료!' : c === 2 ? '부스터 중!' : c === 3 ? '다 썼어요' : '부스터';
          btn.classList.toggle('on', c === 1);
          rush.classList.toggle('on', c === 2);
          if (c === 1 && prev === 0) {
            if (ctx.sfx.boostReady) ctx.sfx.boostReady();
            ctx.vibrate([20, 30, 20]);
          }
        }
      },
      // 내가 켠 순간: 번쩍 · 줌 · 외침 · 소리
      activated() {
        btn.classList.remove('on');
        ctx.fx.flash(hexA(L.c === '#FFFFFF' ? '#FFD23F' : L.c, 0.55));
        scene.classList.remove('obs-punch'); void scene.offsetWidth; scene.classList.add('obs-punch');
        if (ctx.sfx.boost) ctx.sfx.boost(); else if (ctx.sfx.whoosh) ctx.sfx.whoosh();
        ctx.vibrate([40, 30, 70]);
        this.shout(opts.ath, L.say, true);
      },
      shout(id, text, big) {
        shoutEl.querySelector('.obs-sface').innerHTML = O.faceSVG(id, 'e');
        shoutEl.querySelector('b').textContent = text;
        shoutEl.className = 'obs-shout' + (big ? ' big' : '');
        void shoutEl.offsetWidth;
        shoutEl.classList.add('show');
        clearTimeout(shoutT);
        shoutT = setTimeout(() => shoutEl.classList.remove('show'), 1300);
      },
      // 다른 선수가 부스터! (위쪽에 작은 알림)
      remote(id, name) {
        const chip = G.kit.el(`<div class="obs-chip" style="--bc:${look(id).c}"><span>${O.faceSVG(id, 'e')}</span><b>${G.esc(name)}</b> · ${G.esc(look(id).say)}</div>`);
        feed.appendChild(chip);
        while (feed.children.length > 2) feed.firstElementChild.remove();
        setTimeout(() => chip.remove(), 1800);
      },
      off() { off = true; btn.classList.remove('on'); rush.classList.remove('on'); },
      destroy() { off = true; clearTimeout(shoutT); btn.removeEventListener('pointerdown', onDown); box.remove(); },
      el: box
    };
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // 손가락 시계가 없을 때 (부스터 버튼 누른 시각): 마지막 tick 시각 + 흐른 시간
  function clock(ctx) {
    let lastT = 0; let lastP = 0;
    return {
      seen(t) { lastT = t; lastP = performance.now(); },
      now() { if (ctx.now) return ctx.now(); return lastT ? lastT + (performance.now() - lastP) : 0; }
    };
  }

  O.boost = { MUL, CHORD_MS, make, tap, add, ready, k, active, run, isCode, input, code, frac, mulFor, chord, LOOK, look, partHTML, auraHTML, trailer, botWindow, ui, clock };
})();
