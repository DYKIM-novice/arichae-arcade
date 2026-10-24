/* 아리채 오락실 · 올림픽(하계) · 양궁
   조준점이 흔들려요. 초록을 꾹 누르면 활을 당겨 흔들림이 줄고(너무 오래 당기면 팔이 떨려요), 떼면 쏴요.
   바람에 화살이 밀리니 빨(왼쪽)·파(오른쪽)로 조준을 옮겨서 맞춰요. 6발 합계. */
(function () {
  'use strict';
  const O = window.Oly;
  const G = window.Games;
  const { HEX, SHADE, LIGHT, shape } = G.kit;
  const STEP = O.SIM_STEP || 10;

  const N = 6;
  const AUTO = 7000;        // 이 시간 안에 안 쏘면 저절로 (흔들리는 채로)
  const FLY = 420; const SHOW = 1300; const PREP = 700;
  const DRIFT = 0.34;       // 바람 1 → 이만큼 옆으로 (과녁 반지름 = 1)
  const BOT_START = 2500; const BOT_CYCLE = 5500;

  // 흔들림: 시간과 씨앗으로 정해져요 (서버가 다시 계산할 수 있게)
  function sway(seed, t, amp) {
    const a = (seed % 997) / 997 * 6.28; const b = (seed % 571) / 571 * 6.28;
    const s = t / 1000;
    return [amp * (0.62 * Math.sin(s * 1.9 + a) + 0.38 * Math.sin(s * 3.3 + b)), amp * (0.6 * Math.cos(s * 1.6 + b) + 0.4 * Math.sin(s * 2.7 + a))];
  }
  const ampOf = (st, e) => {
    if (st.ph !== 'draw') return 0.5;
    const h = (e - st.drawT) / 1000;
    return h < 1 ? 0.5 - 0.38 * h : h < 2.6 ? 0.12 : Math.min(0.6, 0.12 + (h - 2.6) * 0.3);   // 오래 당기면 떨려요
  };
  const ptsOf = (x, y) => { const r = Math.hypot(x, y); return r >= 1 ? 0 : Math.max(1, 10 - Math.floor(r * 10)); };

  function makeSim(seed, winds) {
    return {
      init() { return { k: 0, ph: 'prep', phT: 0, aim: 0, drawT: 0, hits: [], total: 0, tens: 0, done: false, hx: 0, hy: 0, hp: 0 }; },
      press(st, c, e) {
        if (st.done || st.ph === 'fly' || st.ph === 'hit') return null;
        if (c === 'r' || c === 'b') { st.aim = O.clamp(st.aim + (c === 'r' ? -0.06 : 0.06), -0.9, 0.9); return { sfx: 'tick', vib: 4 }; }
        if (c === 'g' && st.ph === 'aim') { st.ph = 'draw'; st.drawT = e; return { sfx: 'soft', vib: 10 }; }
        return null;
      },
      release(st, c, e) { if (c === 'g' && st.ph === 'draw') return shoot(st, e); return null; },
      step(st, dt, e) {
        if (st.done) return null;
        if (st.ph === 'prep' && e - st.phT >= PREP) { st.ph = 'aim'; st.phT = e; return { say: `${st.k + 1}번째 화살`, color: '#FFE27A' }; }
        if ((st.ph === 'aim' || st.ph === 'draw') && e - st.phT > AUTO) return shoot(st, e);
        if (st.ph === 'fly' && e - st.phT >= FLY) {
          st.ph = 'hit'; st.phT = e;
          const p = st.hp;
          return { say: p === 10 ? (Math.hypot(st.hx, st.hy) < 0.05 ? '퍼펙트 10!' : '10점!') : p ? `${p}점` : '빗나갔어요', color: p >= 9 ? '#FFD23F' : p ? '#fff' : '#FF8B95', sfx: p >= 9 ? 'perfect' : p ? 'good' : 'bad', good: p >= 9 };
        }
        if (st.ph === 'hit' && e - st.phT >= SHOW) {
          st.k += 1;
          if (st.k >= N) { st.done = true; st.doneT = e; } else { st.ph = 'prep'; st.phT = e; }
        }
        return null;
      },
      sway: (st, e) => { const [sx, sy] = sway(seed + st.k * 131, e, ampOf(st, e)); return [st.aim + sx, sy]; },
      wind: (k) => winds[k] || 0
    };
    function shoot(st, e) {
      const [sx, sy] = sway(seed + st.k * 131, e, ampOf(st, e));
      st.hx = st.aim + sx + (winds[st.k] || 0) * DRIFT;
      st.hy = sy + 0.04;
      st.hp = ptsOf(st.hx, st.hy);
      st.hits.push([Math.round(st.hx * 1000) / 1000, Math.round(st.hy * 1000) / 1000, st.hp]);
      st.total += st.hp; if (st.hp === 10) st.tens += 1;
      st.ph = 'fly'; st.phT = e;
      return { sfx: 'whoosh', vib: 18 };
    }
  }

  function botState(perf, e) {
    const arr = perf.arrows || [];
    const k = Math.floor((e - BOT_START) / BOT_CYCLE);
    const s = e - BOT_START - k * BOT_CYCLE;
    const shot = k >= 0 && s >= 3500 ? k + 1 : Math.max(0, k);
    const n = Math.min(arr.length, Math.max(0, shot));
    const tot = arr.slice(0, n).reduce((m, a) => m + a.p, 0);
    const tens = arr.slice(0, n).filter((a) => a.p === 10).length;
    const last = n ? arr[n - 1] : null;
    return { n, tot, tens, last };
  }

  function create(ctx) {
    const seed = ctx.seed || 1;
    const winds = (ctx.ev && ctx.ev.wind) || [0, 0, 0, 0, 0, 0];
    const sim = makeSim(seed, winds);
    const list = O.roster(ctx);
    ctx.stage.innerHTML = '';
    const wrap = G.kit.el(`<div class="oly-wrap oar"><div class="olf-chips"></div><div class="oly-scene"></div><div class="oly-hud"></div><div class="oly-msg"></div></div>`);
    ctx.stage.appendChild(wrap);
    const others = list.filter((p) => !p.me);
    const chipsEl = wrap.querySelector('.olf-chips');
    chipsEl.innerHTML = others.map((p) => `<div class="olf-chip" data-pid="${p.pid}" style="--jc:${O.ath(p.athlete).jersey}"><span class="av">${O.faceSVG(p.athlete)}</span><div><b>${G.esc(p.name)}</b><span class="olf-kg">0점</span></div><i class="oar-dot"></i></div>`).join('');
    const chip = {};
    others.forEach((p) => { chip[p.pid] = chipsEl.querySelector(`[data-pid="${p.pid}"] .olf-kg`); });
    const scene = wrap.querySelector('.oly-scene');
    const hud = wrap.querySelector('.oly-hud');
    const msgEl = wrap.querySelector('.oly-msg');
    const hudEl = G.kit.el(`<div class="oar-hud"><span class="oar-k"><i class="r"></i>왼쪽 · <i class="b"></i>오른쪽 옮기기</span><span class="oar-k"><i class="g"></i>꾹 당기고 떼면 쏘기</span><span class="oar-sum">합계 <b>0</b>점 · <em>1/${N}</em></span></div>`);
    hud.appendChild(hudEl);
    const sumEl = hudEl.querySelector('.oar-sum b');
    const cntEl = hudEl.querySelector('.oar-sum em');
    const svg = O.el('svg', { class: 'oly-svg' });
    scene.appendChild(svg);
    let Wd = 0; let Hd = 0; let R = 100; let cx = 0; let cy = 0;
    let reticle = null; let windG = null; let myHits = null; let otherHits = null; let flyG = null; let archer = null; let bowG = null;
    const shownOther = {};
    function build() {
      Wd = Math.max(200, scene.clientWidth || 360); Hd = Math.max(200, scene.clientHeight || 360);
      const hudH = hud.offsetHeight || 40;
      svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`); svg.setAttribute('width', Wd); svg.setAttribute('height', Hd);
      R = Math.min(Wd * 0.4, (Hd - hudH) * 0.36);
      cx = Wd / 2; cy = (Hd - hudH) * 0.46;
      const rings = [['#FFFFFF', '#E3E1F2'], ['#2A2340', '#3B3570'], ['#3D7BFF', '#2F64D6'], ['#FF4757', '#D93445'], ['#FFD23F', '#F2C21F']];
      let tgt = '';
      for (let i = 10; i >= 1; i--) {
        const c = rings[Math.floor((10 - i) / 2)][i % 2];
        tgt += `<circle r="${(R * i / 10).toFixed(1)}" fill="${c}" stroke="${i <= 2 ? '#fff' : '#2A2340'}" stroke-width="${i <= 2 ? 0.6 : 0.8}" stroke-opacity=".5"/>`;
      }
      tgt += `<path d="M-3 0 h6 M0 -3 v6" stroke="#2A2340" stroke-width="1"/>`;
      svg.innerHTML = `<defs><linearGradient id="oar-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FC8FF"/><stop offset=".6" stop-color="#CDEBFF"/><stop offset=".6" stop-color="#4DB866"/><stop offset="1" stop-color="#3FA45B"/></linearGradient></defs>
        <rect width="${Wd}" height="${Hd}" fill="url(#oar-sky)"/>
        <g opacity=".8" transform="translate(0 ${Hd * 0.06})">${O.standsSVG(Wd, Hd * 0.16, 9)}</g>
        <path d="M${cx - R * 0.5} ${cy + R * 1.02} L${cx - R * 0.8} ${cy + R * 1.5} M${cx + R * 0.5} ${cy + R * 1.02} L${cx + R * 0.8} ${cy + R * 1.5}" stroke="#8B5A2B" stroke-width="6" stroke-linecap="round"/>
        <rect x="${cx - R * 1.08}" y="${cy - R * 1.08}" width="${R * 2.16}" height="${R * 2.16}" rx="${R * 0.12}" fill="#F2D49A" stroke="#C99A68" stroke-width="3"/>
        <g transform="translate(${cx} ${cy})">${tgt}</g>`;
      otherHits = O.el('g', { transform: `translate(${cx} ${cy})` }); svg.appendChild(otherHits);
      myHits = O.el('g', { transform: `translate(${cx} ${cy})` }); svg.appendChild(myHits);
      flyG = O.el('g', {}); svg.appendChild(flyG);
      reticle = O.el('g', {}, `<circle r="${(R * 0.16).toFixed(1)}" fill="none" stroke="#FF2E63" stroke-width="2.4"/><path d="M${-R * 0.26} 0 h${R * 0.18} M${R * 0.08} 0 h${R * 0.18} M0 ${-R * 0.26} v${R * 0.18} M0 ${R * 0.08} v${R * 0.18}" stroke="#FF2E63" stroke-width="2.4" stroke-linecap="round"/><circle r="2.2" fill="#FF2E63"/>`);
      svg.appendChild(reticle);
      windG = O.el('g', { transform: `translate(${Wd - 58} ${Math.max(36, cy - R - 6)})` }); svg.appendChild(windG);
      // 내 선수 (왼쪽 아래, 활을 들고)
      const me = list.find((p) => p.me);
      const s = Math.min(1.1, Hd * 0.2 / 86);
      archer = O.makeAthlete(me.athlete, me.bib, {}); archer.s = s;
      svg.appendChild(archer.g);
      bowG = O.el('g', {}); svg.appendChild(bowG);
      myHits.innerHTML = st.hits.map((h) => hitSVG(h, '#FFD23F', true)).join('');
      Object.keys(shownOther).forEach((k) => { delete shownOther[k]; });
    }
    function hitSVG(h, color, me) {
      return `<g transform="translate(${(h[0] * R).toFixed(1)} ${(h[1] * R).toFixed(1)})"><circle r="${me ? 4.6 : 3.4}" fill="${color}" stroke="#2A2340" stroke-width="1.4"/>${me ? '<path d="M0 0 l9 -9" stroke="#2A2340" stroke-width="2"/><path d="M9 -9 l4 -1 l-1 4 Z" fill="#FF4757"/>' : ''}</g>`;
    }
    const st = sim.init();
    st.e = 0;
    build();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (scene.clientWidth !== Wd || scene.clientHeight !== Hd) build(); }) : null;
    if (ro) ro.observe(scene);
    const log = [];
    let msgT = 0;
    function say(t, c, ms) { msgEl.textContent = t; msgEl.style.color = c || '#fff'; msgEl.classList.remove('show'); void msgEl.offsetWidth; msgEl.classList.add('show'); clearTimeout(msgT); msgT = setTimeout(() => msgEl.classList.remove('show'), ms || 1200); }
    function react(r) {
      if (!r) return;
      if (r.say) say(r.say, r.color);
      if (r.sfx && ctx.sfx[r.sfx]) ctx.sfx[r.sfx]();
      if (r.vib) ctx.vibrate(r.vib);
      if (r.good) { const b = ctx.stage.getBoundingClientRect(); ctx.fx.burst(b.width / 2, b.height * 0.42, '#FFD23F', 22); }
    }
    function simTo(e) { while (st.e + STEP <= e) { st.e += STEP; react(sim.step(st, STEP / 1000, st.e)); } }

    return {
      start() {},
      tick(t) {
        const e = t - ctx.startAt;
        simTo(e);
        // 조준점
        const [ax, ay] = sim.sway(st, st.e);
        const showRet = st.ph === 'aim' || st.ph === 'draw';
        reticle.style.display = showRet ? '' : 'none';
        reticle.setAttribute('transform', `translate(${(cx + ax * R).toFixed(1)} ${(cy + ay * R).toFixed(1)})`);
        // 바람 깃발
        const w = sim.wind(Math.min(N - 1, st.k));
        const key = `${st.k}`;
        if (windG.dataset.k !== key) {
          windG.dataset.k = key;
          const dir = w >= 0 ? 1 : -1; const len = 10 + Math.abs(w) * 26;
          windG.innerHTML = `<rect x="-50" y="-18" width="100" height="40" rx="12" fill="rgba(21,18,43,.75)"/><text y="-4" text-anchor="middle" font-size="10" font-weight="800" fill="#CDEBFF" font-family="system-ui,sans-serif">바람 ${Math.abs(w) < 0.15 ? '거의 없음' : Math.abs(w) < 0.6 ? '약하게' : '세게'}</text>
            <g transform="translate(0 10) scale(${dir} 1)"><path d="M${-len / 2} 0 H${len / 2}" stroke="#7FD3FF" stroke-width="3" stroke-linecap="round"/><path d="M${len / 2 - 5} -5 L${len / 2 + 2} 0 L${len / 2 - 5} 5" fill="none" stroke="#7FD3FF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>`;
        }
        // 날아가는 화살
        if (st.ph === 'fly') {
          const f = Math.min(1, (st.e - st.phT) / FLY);
          const sx = Wd * 0.2; const sy = Hd * 0.86;
          const tx = cx + st.hx * R; const ty = cy + st.hy * R;
          const x = sx + (tx - sx) * f; const y = sy + (ty - sy) * f - Math.sin(f * Math.PI) * 30;
          const sc = 1.6 - f * 1.1;
          flyG.innerHTML = `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(2)})"><path d="M-14 10 L0 0" stroke="#5B5677" stroke-width="2.4"/><path d="M0 0 l-4 1 l1 -4 Z" fill="#2A2340"/><path d="M-14 10 l-3 -2 M-14 10 l1 3" stroke="#FF4757" stroke-width="2"/></g>`;
        } else flyG.innerHTML = '';
        if (st.ph === 'hit' && myHits.childElementCount < st.hits.length) {
          myHits.innerHTML = st.hits.map((h) => hitSVG(h, '#FFD23F', true)).join('');
        }
        // 궁수 (당길수록 활이 휘어요)
        const s = archer.s; const axp = Wd * 0.13; const ayp = Hd - (hud.offsetHeight || 40) - 12;
        const drawing = st.ph === 'draw';
        const pull = drawing ? Math.min(1, (st.e - st.drawT) / 600) : 0;
        archer.set({ x: axp, y: ayp, s, fa: 95, ba: 80 - pull * 30, tilt: -4, head: -6, ex: drawing ? 'e' : 'n', fx: drawing && st.e - st.drawT > 2600 ? 'sweat' : '' });
        const hx = axp + (3 + 17) * s; const hy = ayp - 40 * s;
        bowG.innerHTML = `<path d="M${hx.toFixed(1)} ${(hy - 22 * s).toFixed(1)} Q${(hx + 12 * s).toFixed(1)} ${hy.toFixed(1)} ${hx.toFixed(1)} ${(hy + 22 * s).toFixed(1)}" fill="none" stroke="#8B5A2B" stroke-width="${(3 * s).toFixed(1)}" stroke-linecap="round"/>
          <path d="M${hx.toFixed(1)} ${(hy - 22 * s).toFixed(1)} L${(hx - pull * 14 * s).toFixed(1)} ${hy.toFixed(1)} L${hx.toFixed(1)} ${(hy + 22 * s).toFixed(1)}" fill="none" stroke="#fff" stroke-width="1.2"/>
          ${st.ph === 'aim' || drawing ? `<path d="M${(hx - pull * 14 * s).toFixed(1)} ${hy.toFixed(1)} h${(26 * s).toFixed(1)}" stroke="#5B5677" stroke-width="${(2 * s).toFixed(1)}"/>` : ''}`;
        // 다른 선수 화살 (조그만 점 · 선수 색)
        const live = ctx.live();
        let r = 1;
        const myScore = st.total * 100 + st.tens;
        others.forEach((p) => {
          const a = live[p.pid];
          if (!a) return;
          if ((a[0] || 0) > myScore) r++;
          const ex = a[2] || [];
          const n = ex[0] || 0;
          chip[p.pid].textContent = `${Math.floor((a[0] || 0) / 100)}점 · ${Math.min(N, n)}/${N}발`;
          if (n && shownOther[p.pid] !== n && ex.length >= 4) {
            shownOther[p.pid] = n;
            otherHits.insertAdjacentHTML('beforeend', hitSVG([ex[1], ex[2]], O.ath(p.athlete).jersey, false));
          }
        });
        sumEl.textContent = st.total;
        cntEl.textContent = `${Math.min(N, st.k + 1)}/${N}`;
        ctx.setScore(st.total);
        if (st.k > 0 || st.ph === 'hit') ctx.setBadge(`${r}위`, r === 1 ? 'y' : 'b');
      },
      onPress(c, t) { const e = t - ctx.startAt; simTo(e); log.push([Math.round(e), c]); react(sim.press(st, c, e)); },
      onRelease(c, t) { const e = t - ctx.startAt; simTo(e); log.push([Math.round(e), c.toUpperCase()]); react(sim.release(st, c, e)); },
      end() { if (ro) ro.disconnect(); clearTimeout(msgT); },
      done: () => st.done && st.e - st.doneT > 800,
      score: () => st.total * 100 + st.tens,
      value: () => st.total,
      extra: () => { const h = st.hits[st.hits.length - 1]; return h ? [st.hits.length, h[0], h[1], h[2]] : [0]; },
      log: () => log,
      _st: () => st,
      _aim: () => sim.sway(st, st.e),
      summary: () => `${st.total}점 (10점 ${st.tens}개)`
    };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#7FC8FF"/><circle cx="20" cy="20" r="15" fill="#fff"/><circle cx="20" cy="20" r="12" fill="#2A2340"/><circle cx="20" cy="20" r="9" fill="#3D7BFF"/><circle cx="20" cy="20" r="6" fill="#FF4757"/><circle cx="20" cy="20" r="3" fill="#FFD23F"/><path d="M21 19 L33 7" stroke="#5B5677" stroke-width="2"/><path d="M33 7 l-1 4 M33 7 l-4 1" stroke="#FF4757" stroke-width="2"/></svg>';

  O.register({
    id: 'oarch',
    title: '양궁',
    cat: '하계 · 양궁',
    catColor: 'y',
    how: '초록 꾹 당겼다 떼기 · 바람 보고 빨·파로 조준',
    icon: ICON,
    buttons: ['r', 'g', 'b'], noGo: true, pressSound: false, music: false,
    rules: ['초록을 꾹 누르면 활을 당겨요 → 흔들림이 줄어요 (너무 오래 당기면 팔이 떨려요)', '조준점이 가운데 올 때 손을 떼면 쏴요', '바람에 화살이 밀려요 · 빨강(왼쪽)·파랑(오른쪽)으로 조준을 옮겨요 · 6발 합계'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '◀')}<svg width="46" height="46" viewBox="0 0 40 40">${ICON.replace(/^<svg[^>]*>/, '').replace('</svg>', '')}</svg>${b('b', '▶')}${b('g', '꾹→떼기')}</div>`;
    },
    fmt: (sc) => `${Math.floor(sc / 100)}점`,
    rival(arr) { const sc = arr ? arr[0] || 0 : 0; const ex = (arr && arr[2]) || []; return { sort: sc, text: `${Math.floor(sc / 100)}점 ${ex[0] || 0}/${N}` }; },
    botLive(perf, e) { const b = botState(perf, e); const l = b.last; return [b.tot * 100 + b.tens, b.tot, l ? [b.n, l.x, l.y, l.p] : [0]]; },
    create
  });
})();
