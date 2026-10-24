/* 아리채 오락실 · 올림픽관 경기장 (옆에서 보는 레인 경기장)
   달리기·허들·수영·멀리뛰기·창던지기가 같이 써요.
   - 맨 앞 레인이 나, 뒤 레인일수록 작게 · 카메라는 내 선수를 따라가요
   - 관중석은 천천히(원근감), 거리 표시는 같이 움직여요 */
(function () {
  'use strict';

  const O = window.Oly;
  const G = window.Games;
  const { el } = O;

  const SURF = {
    track: { a: '#D9653B', b: '#CF5B32', line: '#FFF6EA', apron: '#3FA45B' },
    pool: { a: '#2EA6E0', b: '#2898D2', line: '#FFFFFF', apron: '#E8F4FA' },
    runway: { a: '#C9563A', b: '#C04F33', line: '#FFF6EA', apron: '#3FA45B' },
    ice: { a: '#E6F5FF', b: '#D8EEFC', line: '#E0435A', apron: '#F4FAFF' },
    snow: { a: '#F8FCFF', b: '#ECF5FC', line: '#9CC7E6', apron: '#FFFFFF' }
  };

  class Track {
    /* opts: D(결승 거리 m), surface('track'|'pool'|'runway'), view(화면에 보이는 m),
       marks(거리 표시 간격 m), finish(true면 결승선), extras(fn(laneGroup, lane, i) 레인 장식) */
    constructor(ctx, opts) {
      this.ctx = ctx;
      this.o = Object.assign({ D: 100, surface: 'track', view: 13, marks: 10, finish: true, camLead: 0.34, startX: 0 }, opts || {});
      this.list = O.roster(ctx);
      this.n = this.list.length;
      ctx.stage.innerHTML = '';
      this.wrap = G.kit.el(`<div class="oly-wrap"><div class="oly-top"></div><div class="oly-scene"></div><div class="oly-hud"></div><div class="oly-msg"></div></div>`);
      ctx.stage.appendChild(this.wrap);
      this.top = this.wrap.querySelector('.oly-top');
      this.sceneBox = this.wrap.querySelector('.oly-scene');
      this.hud = this.wrap.querySelector('.oly-hud');
      this.msgEl = this.wrap.querySelector('.oly-msg');
      if (this.o.strip !== false) {
        this.strip = O.strip(this.top, this.list, this.o.stripLabel || `${this.o.D}m`);
      }
      this.svg = el('svg', { class: 'oly-svg' });
      this.sceneBox.appendChild(this.svg);
      if (this.o.winter) this.sceneBox.appendChild(snowfall());
      this.camX = 0;
      this.ath = {};
      this.build();
      this.ro = window.ResizeObserver ? new ResizeObserver(() => this.build(true)) : null;
      if (this.ro) this.ro.observe(this.sceneBox);
    }

    build(again, force) {
      const W = Math.max(200, this.sceneBox.clientWidth || 360);
      const H = Math.max(160, this.sceneBox.clientHeight || 300);
      const hudH = this.hud ? this.hud.offsetHeight : 0;
      if (again && !force && W === this.W && H === this.H && hudH === this.hudH) return;
      this.W = W; this.H = H; this.hudH = hudH;
      this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      this.svg.setAttribute('width', W);
      this.svg.setAttribute('height', H);
      this.ppm = W / this.o.view;
      const sf = SURF[this.o.surface] || SURF.track;
      const pool = this.o.surface === 'pool';
      const skyH = Math.round(H * 0.08);
      const standH = Math.round(H * (pool ? 0.15 : 0.17));
      this.trackTop = skyH + standH + 6;
      // 아래 HUD(연타 막대 등)에 가리지 않게 그 위까지만 레인
      const L = O.lanes(this.n, this.trackTop + 4, H - Math.max(6, hudH + 12));
      this.L = L;
      // 앞 레인 선수 키: 레인 높이에 맞춰요 (너무 크면 화면을 가려요)
      this.baseS = Math.min(1.3, Math.max(0.55, (L[0].h * 1.25) / 86));
      const old = this.ath;
      this.svg.innerHTML = '';
      this.layers = {};
      const defs = el('defs', {}, `<linearGradient id="ol-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FC8FF"/><stop offset="1" stop-color="#CDEBFF"/></linearGradient>
        <linearGradient id="ol-wsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FC4E8"/><stop offset="1" stop-color="#E4F0FA"/></linearGradient>
        <linearGradient id="ol-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5CC4F2"/><stop offset="1" stop-color="#1E86C8"/></linearGradient>
        <pattern id="ol-check" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff"/><rect width="4" height="4" fill="#2A2340"/><rect x="4" y="4" width="4" height="4" fill="#2A2340"/></pattern>`);
      this.svg.appendChild(defs);
      this.svg.appendChild(el('rect', { width: W, height: skyH + 2, fill: this.o.winter ? 'url(#ol-wsky)' : 'url(#ol-sky)' }));
      // 관중석 (원근감: 카메라의 0.25배로 움직여요)
      const standW = 380;
      this.layers.stands = el('g', {});
      const st = el('g', {}, O.standsSVG(standW, standH, 11) + O.flagsSVG(standW, 2) + (this.o.winter ? snowCaps(standW) : ''));
      const tiles = Math.ceil(W / standW) + 2;
      for (let i = 0; i < tiles; i++) {
        const u = el('g', { transform: `translate(${i * standW} 0)` });
        u.innerHTML = st.innerHTML;
        this.layers.stands.appendChild(u);
      }
      this.standW = standW;
      const standWrap = el('g', { transform: `translate(0 ${skyH})` });
      standWrap.appendChild(this.layers.stands);
      this.svg.appendChild(standWrap);
      // 전광판
      this.svg.appendChild(el('g', {}, `<rect x="${W - 104}" y="4" width="98" height="${Math.max(18, skyH - 8)}" rx="5" fill="#15122B" stroke="#FFD23F" stroke-width="1.5"/>${O.RINGS(W - 84, 4 + Math.max(18, skyH - 8) / 2 - 3, 0.55)}`));
      this.board = el('text', { x: W - 63, y: 4 + Math.max(18, skyH - 8) / 2 + 4.5, 'font-size': 12, 'font-weight': 800, fill: '#FFD23F', 'font-family': 'system-ui,sans-serif' }, '');
      this.svg.appendChild(this.board);
      // 경기장 바닥
      this.svg.appendChild(el('rect', { x: 0, y: skyH + standH, width: W, height: H - skyH - standH, fill: sf.apron }));
      if (pool) this.svg.appendChild(el('rect', { x: 0, y: this.trackTop - 2, width: W, height: H - this.trackTop + 2, fill: 'url(#ol-water)' }));
      // 레인 (뒤에서 앞으로)
      this.layers.lanes = el('g', {});
      this.svg.appendChild(this.layers.lanes);
      for (let i = this.n - 1; i >= 0; i--) {
        const ln = L[i];
        if (!pool) this.layers.lanes.appendChild(el('rect', { x: 0, y: ln.y0, width: W, height: ln.h, fill: i % 2 ? sf.a : sf.b }));
        this.layers.lanes.appendChild(el('rect', { x: 0, y: ln.y1 - (pool ? 2 : 1.2), width: W, height: pool ? 3 : 1.6, fill: pool ? '#FFFFFF' : sf.line, opacity: pool ? 0.45 : 0.9 }));
      }
      // 움직이는 것들 (거리 표시·결승선·장애물)
      this.layers.world = el('g', {});
      this.svg.appendChild(this.layers.world);
      this.layers.marks = el('g', {});
      this.layers.world.appendChild(this.layers.marks);
      this.layers.obj = el('g', {});
      this.layers.world.appendChild(this.layers.obj);
      this.drawMarks();
      // 선수 (뒤 레인 먼저)
      this.layers.ath = el('g', {});
      this.svg.appendChild(this.layers.ath);
      this.ath = {};
      for (let i = this.n - 1; i >= 0; i--) {
        const p = this.list[i];
        const laneG = el('g', p.ghost ? { class: 'opr-ghost' } : {});   // 혼자 연습의 '내 최고 기록' 유령은 반투명
        this.layers.ath.appendChild(laneG);
        if (this.o.laneExtras) this.o.laneExtras(laneG, L[i], i, this);
        const a = O.makeAthlete(p.athlete, p.bib, { tag: p.me ? '나' : p.name, me: p.me, gear: this.o.gear, winter: this.o.winter });
        laneG.appendChild(a.g);
        const prev = old && old[p.pid];
        this.ath[p.pid] = Object.assign(prev ? { ph: prev.ph, x: prev.x, shown: prev.shown, v: prev.v } : { ph: Math.random() * 6, x: this.o.startX, shown: this.o.startX, v: 0 },
          { a, lane: L[i], i, p, laneG });
      }
      this.layers.fx = el('g', {});
      this.svg.appendChild(this.layers.fx);
      if (this.o.afterBuild) this.o.afterBuild(this);
    }

    // 거리 표시 (세로 줄은 레인 전체에 걸쳐서)
    drawMarks() {
      const g = this.layers.marks;
      g.innerHTML = '';
      const top = this.trackTop;
      const bot = this.H;
      const D = this.o.D;
      const ppm = this.ppm;
      let s = '';
      const step = this.o.marks;
      if (this.o.start !== false) s += `<rect x="${(-0.08 * ppm).toFixed(1)}" y="${top}" width="${(0.16 * ppm).toFixed(1)}" height="${bot - top}" fill="#fff" opacity=".95"/>`;
      for (let m = step; m < D; m += step) {
        s += `<rect x="${(m * ppm - 1).toFixed(1)}" y="${top}" width="2" height="${bot - top}" fill="#fff" opacity=".45"/>
          <g transform="translate(${(m * ppm).toFixed(1)} ${top - 1})"><rect x="-17" y="-11" width="34" height="15" rx="7" fill="rgba(21,18,43,.6)"/><text y="1" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">${m}m</text></g>`;
      }
      if (this.o.finish) {
        s += `<rect x="${(D * ppm - 6).toFixed(1)}" y="${top}" width="12" height="${bot - top}" fill="url(#ol-check)"/>
          <g transform="translate(${(D * ppm).toFixed(1)} ${top - 4})"><path d="M-6 0 V-34 M6 0 V-34" stroke="#fff" stroke-width="3"/><rect x="-40" y="-52" width="80" height="20" rx="6" fill="#FF4757"/><text y="-37.5" text-anchor="middle" font-size="13" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">FINISH</text></g>`;
      }
      if (this.o.marksExtra) s += this.o.marksExtra(this);
      g.innerHTML = s;
    }

    // 세계 좌표(m) → 화면 x
    sx(m) { return (m - this.camX) * this.ppm; }

    follow(meX, dt) {
      const target = meX - this.o.view * this.o.camLead;
      const lo = this.o.camMin != null ? this.o.camMin : -this.o.view * 0.12;
      const hi = this.o.camMax != null ? this.o.camMax : this.o.D + this.o.view * 0.5;
      const want = Math.max(lo, Math.min(hi, target));
      this.camX += (want - this.camX) * Math.min(1, dt * 7);
      const tx = (-this.camX * this.ppm).toFixed(1);
      this.layers.world.setAttribute('transform', `translate(${tx} 0)`);
      const sx = -((this.camX * this.ppm * 0.25) % this.standW);
      this.layers.stands.setAttribute('transform', `translate(${(sx - this.standW).toFixed(1)} 0)`);
    }

    // 선수 그리기: x(m), pose, 레인 안 높이 lift(px)
    place(pid, x, pose, lift) {
      const A = this.ath[pid];
      if (!A) return;
      const s = A.lane.s * this.baseS;
      const pp = Object.assign({}, pose, { x: this.sx(x), y: A.lane.y - (lift || 0) * A.lane.s, s });
      A.a.set(pp);
    }

    say(text, color, ms) {
      const m = this.msgEl;
      m.textContent = text;
      m.style.color = color || '#fff';
      m.classList.remove('show');
      void m.offsetWidth;
      m.classList.add('show');
      clearTimeout(this.msgT);
      if (ms !== 0) this.msgT = setTimeout(() => m.classList.remove('show'), ms || 1200);
    }
    setBoard(t) { if (this.board.textContent !== t) this.board.textContent = t; }

    destroy() { if (this.ro) this.ro.disconnect(); clearTimeout(this.msgT); }
  }

  // 겨울: 내리는 눈 · 관중석 지붕의 눈
  function snowfall() {
    const box = document.createElement('div');
    box.className = 'oly-snow';
    let h = '';
    for (let i = 0; i < 26; i++) {
      const x = (i * 37) % 100; const d = 4 + (i * 13) % 7; const z = 2 + (i % 3);
      h += `<i style="left:${x}%;width:${z}px;height:${z}px;animation-duration:${d}s;animation-delay:${-((i * 7) % d)}s"></i>`;
    }
    box.innerHTML = h;
    return box;
  }
  const snowCaps = (w) => `<path d="M0 0 H${w} V4 Q${w * 0.9} 8 ${w * 0.8} 4 T${w * 0.6} 4 T${w * 0.4} 4 T${w * 0.2} 4 T0 4 Z" fill="#fff"/>`;

  /* ---------- 연타 막대 (아래쪽 HUD) ---------- */
  function rateMeter(box, label) {
    const w = G.kit.el(`<div class="oly-rate"><span class="oly-rate-k">${label || '<i class="r"></i><i class="b"></i> 아무 버튼이나 연타!'}</span><span class="oly-rate-pips">${'<i></i>'.repeat(15)}</span><span class="oly-rate-n"><em>0</em>/초</span></div>`);
    box.appendChild(w);
    const pips = Array.from(w.querySelectorAll('.oly-rate-pips i'));
    const num = w.querySelector('em');
    let last = -1;
    return {
      el: w,
      set(r) {
        if (r === last) return;
        last = r;
        num.textContent = r;
        pips.forEach((p, i) => { p.className = i < r ? (i < 6 ? 'on g' : i < 11 ? 'on y' : 'on r') : ''; });
      }
    };
  }

  /* ---------- 출발 신호 (제자리에 → 차렷 → 탕!) ---------- */
  function starter(tr, ctx) {
    const gunAt = ctx.startAt + (ctx.ev.gun || 2400);
    let stage = -1;
    return {
      gunAt,
      // 지금 단계: 0 제자리에, 1 차렷, 2 출발
      tick(t) {
        const k = t < gunAt - 1100 ? 0 : t < gunAt ? 1 : 2;
        if (k !== stage) {
          stage = k;
          if (k === 0) { tr.say('제자리에…', '#fff', 0); ctx.sfx.tick(); }
          if (k === 1) { tr.say('차렷!', '#FFE27A', 0); ctx.sfx.tick(); }
          if (k === 2) { tr.say('탕!', '#FF8B95', 700); ctx.sfx.go(); ctx.vibrate(60); }
        }
        return k;
      }
    };
  }

  Object.assign(O, { Track, rateMeter, starter });
})();
