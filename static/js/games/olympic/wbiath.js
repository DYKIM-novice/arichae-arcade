/* 아리채 오락실 · 올림픽(동계) · 바이애슬론
   빨·파 연타로 스키 100m → 사격장에서 멈춰 과녁 5개를 차례로 (움직이는 조준선이 과녁에 올 때 초록)
   → 다시 스키 100m. 못 맞힌 과녁마다 기록에 3초가 더해져요. */
(function () {
  'use strict';
  const O = window.Oly;
  const G = window.Games;
  const { HEX, SHADE, LIGHT, shape } = G.kit;

  const D = 200;
  const RANGE = 100;
  const PEN = 3000;
  const SHOOT_MAX = 14000;
  const TG = [-0.44, -0.22, 0, 0.22, 0.44];   // 과녁 자리 (가로 -0.6~0.6)
  const HIT = 0.07;

  const base = O.mashRunner({ kick: 0.85, drag: 0.95, vmax: 9.5 });
  const reticle = (st, e) => 0.58 * Math.sin((e - st.shootT) / 1000 * (1.9 + st.shot * 0.18) + st.ph0);

  const sim = {
    init(ctx) { return Object.assign(base.init(), { shot: 0, shooting: false, shootT: 0, hits: [], pen: 0, ph0: ((ctx && ctx.seed) || 7) % 628 / 100, done5: false }); },
    press(st, c, e, gun) {
      if (st.shooting) {
        if (c !== 'g') return null;
        const r = reticle(st, e);
        const ok = Math.abs(r - TG[st.shot]) < HIT;
        st.hits.push(ok ? 1 : 0);
        if (!ok) st.pen += PEN;
        st.shot += 1;
        st.lastShot = e;
        if (st.shot >= 5) endShoot(st);
        return ok ? { say: '명중!', color: '#7DF0AE', sfx: 'good', vib: 20, ms: 600 } : { say: '빗나감 +3초', color: '#FF8B95', sfx: 'bad', vib: [30, 20, 30], ms: 700 };
      }
      if (c === 'g') return null;
      return base.press(st, c, e, gun);
    },
    step(st, dt, e, gun) {
      if (st.shooting) {
        if (e - st.shootT > SHOOT_MAX) {
          while (st.shot < 5) { st.hits.push(0); st.pen += PEN; st.shot += 1; }
          endShoot(st);
        }
        return;
      }
      base.step(st, dt, e, gun);
      if (!st.done5 && st.x >= RANGE) {
        st.x = RANGE; st.v = 0; st.shooting = true; st.shootT = e; st.state = 5;
        st.mash = new O.Masher(66);
      }
    }
  };
  function endShoot(st) { st.shooting = false; st.done5 = true; st.state = 0; st.x = RANGE + 0.01; }

  // 사격 판 (사격장에 오면 아래에 나와요)
  function hud(tr) {
    const w = G.kit.el(`<div class="obi-panel"><div class="obi-row"><span>사격 <b class="obi-n">1/5</b></span><span class="obi-pen"></span></div>
      <div class="obi-range">${TG.map((t, i) => `<i class="obi-t" style="left:${(50 + t / 1.2 * 100).toFixed(1)}%" data-i="${i}"></i>`).join('')}<i class="obi-ret"></i></div>
      <div class="obi-tip"><i class="g"></i> 빨간 줄이 <b>노란 테두리 과녁</b>에 오면 초록!</div></div>`);
    tr.hud.prepend(w);
    tr.bi = { w, ret: w.querySelector('.obi-ret'), ts: Array.from(w.querySelectorAll('.obi-t')), n: w.querySelector('.obi-n'), pen: w.querySelector('.obi-pen') };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#ECF5FC"/><circle cx="10" cy="12" r="4" fill="#2A2340"/><circle cx="20" cy="12" r="4" fill="#fff" stroke="#2A2340" stroke-width="1.5"/><circle cx="30" cy="12" r="4" fill="#2A2340"/><path d="M6 32 H34" stroke="#3D7BFF" stroke-width="2.5" stroke-linecap="round"/><path d="M12 30 L16 22 L22 24 M16 22 L14 18" stroke="#FF4757" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';

  O.raceEvent({
    id: 'wbiath',
    title: '바이애슬론',
    cat: '동계 · 설상',
    catColor: 'g',
    how: '스키 연타 → 사격 5발 (빗나가면 +3초)',
    icon: ICON,
    D, view: 15, marks: 25, surface: 'snow', winter: true, gear: 'skis',
    buttons: ['r', 'g', 'b'],
    stripLabel: '200m',
    rules: ['빨·파 연타로 스키를 타요 (100m 가면 사격장)', '사격장: 움직이는 빨간 줄이 노란 테두리 과녁에 올 때 초록! 5발', '빗나간 과녁마다 기록에 3초가 더해져요 → 다시 100m'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '슥')}${b('b', '슥')}<svg width="64" height="30" viewBox="0 0 64 30">${[8, 20, 32, 44, 56].map((x, i) => `<circle cx="${x}" cy="15" r="5" fill="${i < 2 ? '#fff' : '#2A2340'}" stroke="#fff" stroke-width="1.2"/>`).join('')}<path d="M34 3 V27" stroke="#FF4757" stroke-width="2.5"/></svg>${b('g', '탕!')}</div>`;
    },
    sim,
    tau: 1.6,
    phRate: (v) => 1.6 + v * 0.45,
    hud,
    rate: (st, e) => (st.mash ? st.mash.rate(e) : 0),
    extra: (st) => [st.shot, st.hits.reduce((a, b) => a + b, 0)],
    afterBuild(tr) {
      // 스키 폴(막대)을 두 손에
      Object.keys(tr.ath).forEach((pid) => {
        const a = tr.ath[pid].a;
        a.hold('<path d="M0 0 L-6 28" stroke="#5B5677" stroke-width="1.8" stroke-linecap="round"/><circle cx="-6" cy="28" r="2" fill="#5B5677"/>', true);
        a.hold('<path d="M0 0 L-6 28" stroke="#5B5677" stroke-width="1.8" stroke-linecap="round"/>', false);
      });
    },
    marksExtra(tr) {
      // 사격장: 과녁 판
      const p = tr.ppm; const top = tr.trackTop;
      let s = `<g transform="translate(${(RANGE * p).toFixed(1)} ${top})"><rect x="-4" y="-34" width="${(5 * p).toFixed(1)}" height="30" rx="4" fill="#5B5677"/>`;
      for (let i = 0; i < 5; i++) s += `<circle cx="${(6 + i * (5 * p - 12) / 4).toFixed(1)}" cy="-19" r="5" fill="#2A2340" stroke="#fff" stroke-width="1.2"/>`;
      s += `<text x="${(2.5 * p).toFixed(1)}" y="-38" text-anchor="middle" font-size="10" font-weight="900" fill="#2A2340" font-family="system-ui,sans-serif">사격장</text></g>`;
      s += `<rect x="${(RANGE * p - 1.5).toFixed(1)}" y="${top}" width="3" height="${(tr.H - top).toFixed(1)}" fill="#3D7BFF" opacity=".6"/>`;
      return s;
    },
    botPos(perf, s) {
      // 사격장에서 멈춰 쏘는 시간 (못 맞힌 만큼 오래)
      const miss = 5 - (perf.shots || [1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0);
      const stop = 6 + miss * 3;
      const ski = Math.max(4, (perf.T / 1000 - stop) / 2);
      const pr = O.profile(RANGE, ski, 1.6);
      if (s < ski) return pr.pos(s);
      if (s < ski + stop) return RANGE;
      return RANGE + pr.pos(s - ski - stop);
    },
    botExtra(perf, s, x, extra) {
      const miss = 5 - (perf.shots || [1, 1, 1, 1, 1]).reduce((a, b) => a + b, 0);
      const stop = 6 + miss * 3;
      const ski = Math.max(4, (perf.T / 1000 - stop) / 2);
      if (s >= ski && s < ski + stop) { extra[0] = 0; extra[1] = 5; }
      const n = s < ski ? 0 : Math.min(5, Math.floor((s - ski) / (stop / 5)) + 1);
      const hits = (perf.shots || []).slice(0, n).reduce((a, b) => a + b, 0);
      extra.push(n, hits);
    },
    tick(tr, st, e) {
      const B = tr.bi;
      if (!B) return;
      B.w.classList.toggle('on', st.shooting);
      if (!st.shooting) return;
      const r = reticle(st, e);
      B.ret.style.left = `${(50 + r / 1.2 * 100).toFixed(1)}%`;
      B.ts.forEach((t, i) => { t.className = 'obi-t' + (i < st.hits.length ? (st.hits[i] ? ' hit' : ' miss') : i === st.shot ? ' now' : ''); });
      B.n.textContent = `${Math.min(5, st.shot + 1)}/5`;
      B.pen.textContent = st.pen ? `벌칙 +${st.pen / 1000}초` : '';
    },
    pose(i) {
      if (i.e < i.gun && i.x < 0.05) return O.P.stand();
      if (i.state === 1) return O.P.stand();
      if (i.state === 5) return { fa: 92, ba: 86, head: -4, tilt: -2, ex: 'e' };   // 사격 자세
      if (i.fin && i.v < 3) return O.P.cheer(i.ph);
      const s = Math.sin(i.ph);
      const k = Math.min(1, i.v / 8);
      return { tilt: 22 + 8 * k, bob: 4, head: -18, fl: 18 * s * k + 6, bl: -18 * s * k - 6, fk: 14, bk: 14, fa: 40 + 55 * s * k, ba: 40 + 55 * s * k, ex: k > 0.7 ? 'e' : 'n', fx: '' };
    }
  });
})();
