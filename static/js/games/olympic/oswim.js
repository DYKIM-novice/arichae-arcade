/* 아리채 오락실 · 올림픽(하계) · 수영 50m (자유형)
   박자(둥·둥·둥)에 맞춰 빨·파 아무거나 누르면 쭉쭉 나가요.
   마구 누르면 헛물질 + 숨이 빨리 차요. 숨 막대가 줄면 초록으로 숨쉬기! */
(function () {
  'use strict';
  const O = window.Oly;
  const G = window.Games;
  const { HEX, SHADE, LIGHT, shape } = G.kit;

  const D = 50;
  const BEAT = 480;          // 박자 간격(ms)
  const sim = {
    init() { return { v: 0, x: 0, last: null, lastT: -1e9, breath: 1, glideUntil: 0, tired: 0, state: 0, waitUntil: 0, q: 0, qT: 0, strokes: 0, perfect: 0 }; },
    press(st, c, e, gun) {
      if (e < gun) {
        if (c === 'g') return null;
        if (!st.waitUntil) { st.waitUntil = gun + 1000; st.state = 1; return { say: '부정출발! 1초 늦게 출발해요', sfx: 'bad', vib: [40, 40, 40] }; }
        return null;
      }
      if (st.waitUntil && e < st.waitUntil) return null;
      if (st.tired && e < st.tired) return null;
      if (c === 'g') {
        if (e < st.glideUntil) return null;
        st.breath = Math.min(1, st.breath + 0.45);
        st.v *= 0.86;
        st.glideUntil = e + 260;
        st.q = -1; st.qT = e;
        return { sfx: 'soft', vib: 10 };
      }
      if (c !== 'r' && c !== 'b') return null;
      if (e < st.glideUntil || e - st.lastT < 200) return null;     // 너무 빨리 = 헛물질
      st.last = c; st.lastT = e;
      const ph = ((e - gun) % BEAT + BEAT) % BEAT;
      const err = Math.min(ph, BEAT - ph);
      let q = err < 70 ? 1 : err < 140 ? 0.7 : 0.3;
      st.v = Math.min(2.4, st.v + 0.8 * q);
      st.breath -= 0.035 + (q < 0.5 ? 0.09 : 0);
      st.strokes += 1;
      if (q === 1) st.perfect += 1;
      st.q = q; st.qT = e;
      if (st.breath <= 0) {
        st.breath = 0;
        st.tired = e + 1200;
        st.state = 2;
        return { say: '숨이 차요! 초록으로 숨쉬기', sfx: 'bad', vib: [50, 30, 50] };
      }
      return { sfx: q === 1 ? 'good' : 'step', vib: q === 1 ? 14 : 6 };
    },
    step(st, dt, e) {
      if (st.state === 1 && e >= st.waitUntil) st.state = 0;
      if (st.state === 2 && e >= st.tired) { st.state = 0; st.breath = 0.35; st.tired = 0; }
      st.v *= Math.exp(-(st.state === 2 ? 1.6 : 0.85) * dt);
      st.x += st.v * dt;
    }
  };

  // 박자·숨 막대
  function swimHud(tr) {
    const w = G.kit.el(`<div class="osw-hud"><div class="osw-beat"><span class="osw-lbl">박자</span><div class="osw-track"><i class="osw-hit"></i></div><b class="osw-q"></b></div>
      <div class="osw-air"><span class="osw-lbl">숨</span><div class="osw-bar"><i></i></div><span class="osw-g"><i class="g"></i> 숨쉬기</span></div></div>`);
    tr.hud.appendChild(w);
    const trk = w.querySelector('.osw-track');
    const dots = [];
    for (let k = 0; k < 5; k++) { const d = document.createElement('span'); d.className = 'osw-dot'; trk.appendChild(d); dots.push(d); }
    tr.swim = { w, dots, q: w.querySelector('.osw-q'), air: w.querySelector('.osw-bar i'), lastQ: 0 };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#2EA6E0"/><path d="M2 24 q4.5 -4 9 0 t9 0 t9 0 t9 0" fill="none" stroke="#fff" stroke-width="2"/><path d="M2 31 q4.5 -4 9 0 t9 0 t9 0 t9 0" fill="none" stroke="#CDEBFF" stroke-width="2"/><circle cx="25" cy="17" r="4.5" fill="#FFD23F"/><path d="M8 19 Q14 10 22 15" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';

  O.raceEvent({
    id: 'oswim',
    title: '수영 50m',
    cat: '하계 · 수영',
    catColor: 'b',
    how: '박자 맞춰 빨·파 · 숨 차면 초록',
    icon: ICON,
    D,
    surface: 'pool',
    view: 9,
    marks: 5,
    buttons: ['r', 'g', 'b'],
    noMeter: true,
    stripLabel: '50m',
    rules: ['노란 점이 가운데 오는 "둥!" 박자에 빨·파 아무거나 눌러요', '박자에 딱 맞으면 쭉! 마구 누르면 헛물질하고 숨이 빨리 차요', '숨 막대가 줄면 초록을 눌러 숨쉬기 (잠깐 느려져요)'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '둥')}${b('b', '둥')}${b('r', '둥')}<span style="font-size:26px">·</span>${b('g', '숨')}</div>`;
    },
    sim,
    tau: 2.2,
    hud: swimHud,
    extra: (st) => [Math.round(st.breath * 100) / 100],
    tick(tr, st, e, ctx) {
      const gun = (ctx.ev && ctx.ev.gun) || 2400;
      const S = tr.swim;
      if (!S) return;
      // 박자 점: 오른쪽에서 가운데(쳐야 하는 곳)로 흘러와요
      const k = Math.max(0, e - gun);
      S.dots.forEach((d, i) => {
        const tt = (BEAT - (k % BEAT)) + (i - 1) * BEAT;   // 이 점이 가운데 오기까지 남은 시간
        const left = 28 + tt / BEAT * 18;
        d.style.left = `${left}%`;
        d.style.opacity = left < 0 || left > 100 ? 0 : 1;
      });
      if (e - st.qT < 400 && st.qT !== S.lastQ) {
        S.lastQ = st.qT;
        S.q.textContent = st.q === -1 ? '후~' : st.q === 1 ? '딱!' : st.q >= 0.7 ? '좋아' : '헛물질';
        S.q.className = 'osw-q show ' + (st.q === 1 ? 'p' : st.q >= 0.7 ? 'g' : st.q === -1 ? 'a' : 'b');
      }
      S.air.style.width = `${Math.round(st.breath * 100)}%`;
      S.air.className = st.breath < 0.25 ? 'low' : '';
    },
    pose(i) {
      // 물에 엎드려 팔을 빙빙 (출발 전에는 출발대 위에서 웅크림)
      if (i.e < i.gun && i.x < 0.05) return Object.assign(O.P.set(), { lift: 18 });
      if (i.state === 1) return Object.assign(O.P.set(), { lift: 18 });
      const a = (i.ph * 57.3) % 360;
      if (i.fin && i.v < 0.6) return Object.assign(O.P.cheer(i.ph), { lift: -26, tilt: 0 });
      return {
        tilt: 86, lift: 4, bob: 2 * Math.sin(i.ph * 2),
        fa: 180 - a, ba: -a, fl: 6 * Math.sin(i.ph * 4), bl: -6 * Math.sin(i.ph * 4), fk: 10, bk: 10,
        head: -78 + 8 * Math.sin(i.ph), ex: i.state === 2 ? 'd' : i.v > 1.6 ? 'e' : 'n', fx: i.state === 2 ? 'stars' : ''
      };
    }
  });
})();
