/* 아리채 오락실 · 올림픽(동계) · 스피드스케이팅 500m
   아무 버튼이나 누르는데, '쭉~' 미끄러지는 리듬에 맞춰야 해요.
   너무 빨리 누르면 미끄덩, 너무 늦으면 힘이 약해요. 빨라질수록 리듬도 빨라져요. */
(function () {
  'use strict';
  const O = window.Oly;
  const G = window.Games;
  const { HEX, SHADE, LIGHT, shape } = G.kit;

  const D = 500;
  const ideal = (v) => Math.max(240, 470 - v * 15);    // 다음 발을 밀 알맞은 간격(ms)
  const WIN = [0.78, 1.35];                             // 이 사이면 '쭉!'

  const sim = {
    init() { return { v: 0, x: 0, last: null, lastT: -1e9, state: 0, waitUntil: 0, slipUntil: 0, q: 0, qT: 0, good: 0 }; },
    press(st, c, e, gun) {
      if (c !== 'r' && c !== 'b' && c !== 'g') return null;
      const dp = st.dp || O.diffP('normal');
      if (e < gun) return O.falseStart(st, gun, 1000);
      if (st.waitUntil && e < st.waitUntil) return null;
      if (e < st.slipUntil) return null;
      const gap = e - st.lastT;
      st.last = c; st.lastT = e;
      if (st.v < 2.5) {           // 출발: 처음 몇 발은 그냥 힘차게
        st.v += 1.3; st.q = 1; st.qT = e;
        O.boost.tap(st, e, 1);
        return { sfx: 'step', vib: 6 };
      }
      const id = ideal(st.v);
      if (gap < id * dp.skSlip[0]) {
        st.v *= 0.9; st.slipUntil = e + dp.skSlip[1]; st.state = 2; st.q = 0; st.qT = e;
        return { say: '미끄덩!', color: '#FF8B95', sfx: 'bad', vib: [30, 20, 30], ms: 600 };
      }
      const q = gap >= id * dp.skWin[0] && gap <= id * dp.skWin[1] ? 1 : 0.5;
      st.v += 1.3 * q;
      st.q = q; st.qT = e;
      if (q === 1) st.good += 1;
      O.boost.tap(st, e, q);
      return { sfx: q === 1 ? 'good' : 'step', vib: q === 1 ? 12 : 5 };
    },
    step(st, dt, e) {
      if (st.state === 1 && e >= st.waitUntil) st.state = 0;
      if (st.state === 2 && e >= st.slipUntil) st.state = 0;
      st.v = Math.max(0, st.v - 0.02 * st.v * st.v * dt - 0.15 * dt);   // 바람 저항 (빠를수록 커요)
      st.x += st.v * dt * O.boost.k(st);
    }
  };

  // 리듬 막대: 지난 발 이후 시간이 차오르고, 초록 칸에서 다음 발!
  function hud(tr) {
    const w = G.kit.el(`<div class="osk-hud"><span class="osw-lbl">리듬</span><div class="osk-bar"><i class="osk-zone"></i><i class="osk-fill"></i></div><b class="osw-q"></b><span class="osk-v"><em>0</em> km/h</span></div>`);
    tr.hud.appendChild(w);
    tr.sk = { zone: w.querySelector('.osk-zone'), fill: w.querySelector('.osk-fill'), q: w.querySelector('.osw-q'), v: w.querySelector('.osk-v em'), lastQ: 0 };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#D8EEFC"/><path d="M2 30 H38" stroke="#E0435A" stroke-width="1.5"/><circle cx="23" cy="11" r="4" fill="#3D7BFF"/><path d="M21 15 L13 21 L19 27 M13 21 L7 25 M17 18 L9 16" stroke="#2A2340" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M14 30 H26 M4 28 H12" stroke="#8C96A8" stroke-width="2" stroke-linecap="round"/></svg>';

  O.raceEvent({
    id: 'wspeed',
    title: '스피드스케이팅 500m',
    cat: '동계 · 빙상',
    catColor: 'b',
    how: '리듬 맞춰 아무 버튼 · 너무 빠르면 미끄덩',
    icon: ICON,
    D, view: 34, marks: 50, surface: 'ice', winter: true, gear: 'skates', noMeter: true,
    buttons: ['r', 'g', 'b'],
    rules: ['아무 버튼이나 눌러 얼음을 밀어요', '리듬 막대가 초록 칸에 왔을 때 다음 발! 쭉~ 빨라져요', '너무 빨리 누르면 미끄덩, 늦으면 힘이 약해요 · 빨라질수록 리듬도 빨라져요', '쭉! 밀 때마다 부스터 게이지가 차요 · 다 차면 [부스터!] 톡'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '쭉')}<svg width="60" height="26" viewBox="0 0 60 26"><rect x="2" y="8" width="56" height="10" rx="5" fill="rgba(255,255,255,.12)"/><rect x="32" y="6" width="18" height="14" rx="4" fill="#2ED573"/><rect x="2" y="8" width="38" height="10" rx="5" fill="#7FD3FF"/></svg>${b('b', '쭉')}</div>`;
    },
    sim,
    tau: 3.2,
    boost: { cap: 117, ms: 5500 },
    phRate: (v) => 1.5 + v * 0.36,
    hud,
    tick(tr, st, e) {
      const S = tr.sk;
      if (!S) return;
      const id = ideal(st.v);
      const W = st.dp ? st.dp.skWin : WIN;
      const full = id * W[1] * 1.15;
      S.zone.style.left = `${(id * W[0] / full) * 100}%`;
      S.zone.style.width = `${(id * (W[1] - W[0]) / full) * 100}%`;
      S.fill.style.width = `${Math.min(100, ((e - st.lastT) / full) * 100)}%`;
      S.v.textContent = Math.round(st.v * 3.6);
      if (st.qT !== S.lastQ && e - st.qT < 400) {
        S.lastQ = st.qT;
        S.q.textContent = st.q === 1 ? '쭉!' : st.q ? '약해' : '미끄덩';
        S.q.className = 'osw-q show ' + (st.q === 1 ? 'p' : st.q ? 'g' : 'b');
      }
    },
    pose(i) {
      if (i.e < i.gun && i.x < 0.05) return Object.assign(O.P.set(), { tilt: 34 });
      if (i.state === 1) return O.P.set();
      if (i.fin && i.v < 3) return O.P.cheer(i.ph);
      const s = Math.sin(i.ph);
      const k = Math.min(1, i.v / 13);
      return {
        tilt: 40 + 6 * k, bob: 8, head: -34,
        fl: 30 + 22 * s, bl: -12 - 34 * Math.max(0, -s) * k, fk: 60 - 20 * s, bk: 30 + 30 * Math.max(0, s),
        fa: -30 + 50 * s * k, ba: -80,
        ex: i.state === 2 ? 'd' : k > 0.75 ? 'e' : 'n', fx: k > 0.8 ? 'speed' : i.state === 2 ? 'stars' : ''
      };
    }
  });
})();
