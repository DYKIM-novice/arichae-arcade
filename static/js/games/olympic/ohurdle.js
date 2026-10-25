/* 아리채 오락실 · 올림픽(하계) · 110m 허들
   빨·파 연타로 달리고, 허들 앞에서 초록을 눌러 뛰어넘어요. 걸리면 허들이 넘어지고 느려져요. */
(function () {
  'use strict';
  const O = window.Oly;
  const { HEX, SHADE, LIGHT, shape } = window.Games.kit;

  const D = 110;
  const H = [];
  for (let i = 0; i < 10; i++) H.push(13.72 + i * 9.14);   // 허들 자리 (실제 110m 허들과 같아요)
  const AIR = 0.56;          // 뛰어 있는 시간(초)
  const SAFE = [0.12, 0.9];  // 이 사이(뛴 시간 비율)에 허들을 지나야 안 걸려요

  const base = O.mashRunner({ kick: 0.9, drag: 1.0, vmax: 12 });
  // 난이도 값 (없으면 노멀)
  const safeOf = (st) => (st.dp ? st.dp.hSafe : SAFE);
  const airOf = (st) => (st.dp ? st.dp.hAir : AIR);
  const stumOf = (st) => (st.dp ? st.dp.hStum : [0.45, 380]);
  const sim = {
    init() { return Object.assign(base.init(), { air: 0, airT: 0, stumble: 0, knock: 0, hi: 0, landT: 0 }); },
    press(st, c, e, gun) {
      if (c === 'g') {
        if (e < gun || st.state === 1) return null;
        if (st.air || e < st.landT + 120) return null;
        st.air = 1; st.airT = e;
        return { sfx: 'whoosh', vib: 12 };
      }
      if (st.air || e < st.stumble) return null;      // 공중·넘어진 동안은 못 달려요
      return base.press(st, c, e, gun);
    },
    step(st, dt, e, gun) {
      if (st.state === 1 && e >= st.waitUntil) st.state = 0;
      const x0 = st.x;
      st.v *= Math.exp(-(st.air ? 0.25 : 1.0) * dt);
      st.x += st.v * dt * O.boost.k(st);
      let f = 0;
      if (st.air) {
        f = (e - st.airT) / (airOf(st) * 1000);
        if (f >= 1) { st.air = 0; st.landT = e; f = 0; }
      }
      // 허들을 지나는 순간
      while (st.hi < H.length && st.x >= H[st.hi]) {
        if (x0 <= H[st.hi] + 0.001) {
          const sf = safeOf(st);
          const ok = st.air && f >= sf[0] && f <= sf[1];
          if (!ok) {
            const sm = stumOf(st);
            st.knock |= 1 << st.hi;
            st.v *= sm[0];
            st.stumble = e + sm[1];
            st.state = 2;
            st.bump = (st.bump || 0) + 1;
          }
        }
        st.hi += 1;
      }
      if (st.state === 2 && e >= st.stumble) st.state = 0;
      st.airF = st.air ? f : 0;
    }
  };

  function hurdleSVG(s) {
    const h = 30 * s; const w = 16 * s;
    return `<g class="ohd-in"><path d="M${-w / 2} 0 V${-h} M${w / 2} 0 V${-h}" stroke="#E9E6FA" stroke-width="${2.2 * s}"/><rect x="${-w / 2 - 2 * s}" y="${-h - 5 * s}" width="${w + 4 * s}" height="${6 * s}" rx="${1.5 * s}" fill="#fff" stroke="#FF4757" stroke-width="${1.2 * s}"/><path d="M${-w / 2 + 2 * s} ${-h - 2 * s} h${w - 4 * s}" stroke="#FF4757" stroke-width="${2.4 * s}" stroke-dasharray="${3 * s} ${3 * s}"/><path d="M${-w / 2 - 4 * s} 0 h${8 * s} M${w / 2 - 4 * s} 0 h${8 * s}" stroke="#E9E6FA" stroke-width="${2 * s}"/></g>`;
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#D9653B"/><path d="M2 32 H38" stroke="#FFF6EA" stroke-width="1.5"/><path d="M24 32 V22 M34 32 V22" stroke="#fff" stroke-width="2"/><rect x="22" y="19" width="14" height="4" rx="1" fill="#fff" stroke="#FF4757"/><circle cx="14" cy="9" r="4" fill="#FFD23F"/><path d="M13 13 L11 20 L19 19 M11 20 L5 24 M13 15 L20 12 M13 15 L7 13" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  O.raceEvent({
    id: 'ohurdle',
    title: '110m 허들',
    cat: '하계 · 육상',
    catColor: 'y',
    how: '연타로 달리다 허들 앞에서 초록 점프',
    icon: ICON,
    D,
    view: 15,
    buttons: ['r', 'g', 'b'],
    rules: ['빨강·파랑 아무거나 연타해서 달려요 (손가락 여러 개도 OK)', '허들 바로 앞에서 초록! 폴짝 뛰어넘어요', '너무 일찍·늦게 뛰면 허들에 걸려 넘어지고 느려져요', '게이지가 차면 큰 [부스터!]를 톡 · 한 번만 슝!'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '달려')}${b('b', '달려')}<svg width="44" height="40" viewBox="0 0 44 40"><path d="M10 36 V20 M34 36 V20" stroke="#fff" stroke-width="3"/><rect x="6" y="15" width="32" height="6" rx="2" fill="#fff" stroke="#FF4757" stroke-width="1.5"/><path d="M2 12 Q22 -8 42 12" fill="none" stroke="#FFD23F" stroke-width="2.5" stroke-dasharray="4 3"/></svg>${b('g', '점프!')}</div>`;
    },
    sim,
    tau: 1.4,
    boost: { cap: 78, ms: 3600 },
    extra: (st) => [Math.round((st.airF || 0) * 100) / 100, st.knock || 0],
    botExtra(perf, s, x, extra) {
      // AI: 허들 2m 앞에서 뛰어 1.6m 뒤에 내려요 · 서버가 정한 허들은 걸려요
      let f = 0;
      let knock = 0;
      H.forEach((h, i) => {
        const hit = (perf.knock || []).includes(i);
        if (!hit && x > h - 2.1 && x < h + 1.7) f = (x - (h - 2.1)) / 3.8;
        if (hit && x > h) knock |= 1 << i;
      });
      if (f) extra[1] = 4;
      else if ((perf.knock || []).some((i) => x > H[i] && x < H[i] + 1.2)) extra[1] = 2;
      extra.push(Math.round(f * 100) / 100, knock);
    },
    marksExtra(tr) {
      let s = '';
      tr.list.forEach((p, li) => {
        const L = tr.L[li];
        const sc = L.s * tr.baseS * 0.9;
        H.forEach((h, i) => { s += `<g data-hd="${li}-${i}" transform="translate(${(h * tr.ppm).toFixed(1)} ${L.y.toFixed(1)})">${hurdleSVG(sc)}</g>`; });
      });
      return s;
    },
    afterBuild(tr) {
      tr.hEls = {};
      tr.svg.querySelectorAll('[data-hd]').forEach((g) => { tr.hEls[g.dataset.hd] = g; });
      tr.knockShown = {};
    },
    tick(tr, st, e, ctx, live) {
      // 넘어진 허들 표시
      tr.list.forEach((p, li) => {
        const mask = p.me ? st.knock : ((live[p.pid] && live[p.pid][2]) || [])[3] || 0;
        if ((tr.knockShown[li] || 0) === mask) return;
        tr.knockShown[li] = mask;
        H.forEach((h, i) => {
          const g = tr.hEls[`${li}-${i}`];
          if (!g) return;
          const inner = g.firstElementChild;
          if (mask & (1 << i)) inner.setAttribute('transform', 'rotate(72) translate(4 0)');
        });
      });
      if (st.bump && st.bump !== tr.bumpSaid) {
        tr.bumpSaid = st.bump;
        tr.say('앗, 걸렸다!', '#FF8B95', 900);
        ctx.sfx.bad(); ctx.vibrate([40, 30, 40]);
      }
    },
    pose(i) {
      const air = i.me ? (i.st && i.st.airF) || 0 : (i.extra && i.extra[2]) || 0;
      if (i.e < i.gun && i.x < 0.05) return O.P.set();
      if (i.state === 1) return O.P.set();
      if (air > 0) {
        const p = O.P.hurdle();
        p.lift = Math.sin(Math.min(1, air) * Math.PI) * 34;
        return p;
      }
      if (i.state === 2) return Object.assign(O.P.run(i.ph, 0.4, 'd'), { tilt: 34, fx: 'stars' });
      if (i.fin && i.v < 3) return O.P.cheer(i.ph);
      return O.P.run(i.ph, Math.min(1, i.v / 10.5));
    }
  });
})();
