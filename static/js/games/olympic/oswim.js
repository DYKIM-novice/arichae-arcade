/* 아리채 오락실 · 올림픽(하계) · 수영 50m (자유형)
   박자(둥·둥·둥)에 맞춰 아무 버튼이나 누르면 쭉쭉 나가요.
   4박자마다 오는 큰 물방울이 '숨 박자' — 그때 맞춰 누르면 숨이 쭉 차요 (어긋나면 조금만).
   마구 누르면 헛물질 + 숨이 빨리 줄어요. 숨이 다 떨어지면 잠깐 허우적. 숨 쉬는 버튼은 따로 없어요 (아무 버튼이나). */
(function () {
  'use strict';
  const O = window.Oly;
  const G = window.Games;
  const { HEX, SHADE, LIGHT, shape } = G.kit;

  const D = 50;
  const BEAT = 620;          // 박자 간격(ms) — 아이들이 따라가기 좋게 천천히 (예전 480)
  const BREATH_EVERY = 4;    // 4박자마다 숨 박자
  const KICK = 1.1;          // 한 번 저을 때 빨라지는 만큼 (박자가 느려진 만큼 더 멀리)
  const VMAX = 2.9;
  const BR_GOOD = 0.55; const BR_OK = 0.3; const BR_MISS = 0.1;   // 숨 박자: 딱 · 좋아 · 어긋남(조금만)
  const beatN = (e, gun) => Math.round((e - gun) / BEAT);         // 가장 가까운 박자 번호 (1부터)
  const isBreath = (n) => n > 0 && n % BREATH_EVERY === 0;
  const sim = {
    init() { return { v: 0, x: 0, last: null, lastT: -1e9, breath: 1, tired: 0, state: 0, waitUntil: 0, q: 0, qT: 0, strokes: 0, perfect: 0, brN: -1, kind: 0 }; },
    press(st, c, e, gun) {
      if (c !== 'r' && c !== 'g' && c !== 'b') return null;
      const dp = st.dp || O.diffP('normal');
      if (e < gun) return O.falseStart(st, gun, 1000);
      if (st.waitUntil && e < st.waitUntil) return null;
      if (st.tired && e < st.tired) return null;
      if (e - st.lastT < 200) return null;     // 너무 붙여 누름 (한 번으로 쳐요)
      st.last = c; st.lastT = e;
      const ph = ((e - gun) % BEAT + BEAT) % BEAT;
      const err = Math.min(ph, BEAT - ph);
      const q = err < dp.swWin[0] ? 1 : err < dp.swWin[1] ? 0.7 : 0.3;
      const n = beatN(e, gun);
      st.qT = e; st.q = q;
      // 숨 박자: 숨이 차요 (잘 맞출수록 많이) + 살짝 앞으로
      if (isBreath(n) && st.brN !== n) {
        st.brN = n;
        st.kind = 1;
        st.breath = Math.min(1, st.breath + (q === 1 ? BR_GOOD : q >= 0.7 ? BR_OK : BR_MISS));
        st.v = Math.min(VMAX, st.v + KICK * 0.5 * q);
        O.boost.tap(st, e, q * 0.5);
        return q === 1 ? { sfx: 'soft', vib: [10, 30, 10] } : { sfx: 'soft', vib: 6 };
      }
      st.kind = 0;
      st.v = Math.min(VMAX, st.v + KICK * q);
      st.breath -= dp.swDrain[0] + (q < 0.5 ? dp.swDrain[1] : 0);
      st.strokes += 1;
      if (q === 1) st.perfect += 1;
      O.boost.tap(st, e, q);
      if (st.breath <= 0) {
        st.breath = 0;
        st.tired = e + dp.swTired;
        st.state = 2;
        return { say: '숨이 차요! 큰 물방울(숨 박자)에 맞춰요', sfx: 'bad', vib: [50, 30, 50] };
      }
      return { sfx: q === 1 ? 'good' : 'step', vib: q === 1 ? 14 : 6 };
    },
    step(st, dt, e) {
      if (st.state === 1 && e >= st.waitUntil) st.state = 0;
      if (st.state === 2 && e >= st.tired) { st.state = 0; st.breath = 0.35; st.tired = 0; }
      st.v *= Math.exp(-(st.state === 2 ? 1.6 : 0.85) * dt);
      st.x += st.v * dt * O.boost.k(st);
    }
  };

  // 박자·숨 막대
  function swimHud(tr) {
    const w = G.kit.el(`<div class="osw-hud"><div class="osw-beat"><span class="osw-lbl">박자</span><div class="osw-track"><i class="osw-hit"></i></div><b class="osw-q"></b></div>
      <div class="osw-air"><span class="osw-lbl">숨</span><div class="osw-bar"><i></i></div><span class="osw-g"><i class="osw-bub"></i> = 숨 박자</span></div></div>`);
    tr.hud.appendChild(w);
    const trk = w.querySelector('.osw-track');
    const dots = [];
    for (let k = 0; k < 6; k++) { const d = document.createElement('span'); d.className = 'osw-dot'; trk.appendChild(d); dots.push(d); }
    tr.swim = { w, trk, dots, q: w.querySelector('.osw-q'), air: w.querySelector('.osw-bar i'), lastQ: 0 };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#2EA6E0"/><path d="M2 24 q4.5 -4 9 0 t9 0 t9 0 t9 0" fill="none" stroke="#fff" stroke-width="2"/><path d="M2 31 q4.5 -4 9 0 t9 0 t9 0 t9 0" fill="none" stroke="#CDEBFF" stroke-width="2"/><circle cx="25" cy="17" r="4.5" fill="#FFD23F"/><path d="M8 19 Q14 10 22 15" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';

  O.raceEvent({
    id: 'oswim',
    title: '수영 50m',
    cat: '하계 · 수영',
    catColor: 'b',
    how: '박자 맞춰 아무 버튼 · 큰 물방울에 숨쉬기',
    icon: ICON,
    D,
    surface: 'pool',
    view: 9,
    marks: 5,
    buttons: ['r', 'g', 'b'],
    noMeter: true,
    stripLabel: '50m',
    rules: ['노란 점이 가운데 동그라미에 올 때 "둥!" 아무 버튼이나 눌러요', '4박자마다 큰 파란 물방울 = 숨 박자! 딱 맞춰 누르면 숨이 쭉 차요 (어긋나면 조금만)', '박자에 딱 맞으면 쭉! 마구 누르면 헛물질하고 숨이 빨리 줄어요', '박자를 맞출수록 부스터 게이지가 차요 · 다 차면 [부스터!] 톡'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '둥')}${b('g', '둥')}${b('b', '둥')}<span class="osw-ilbub">숨</span></div>`;
    },
    sim,
    tau: 2.2,
    boost: { cap: 36, ms: 5000 },
    hud: swimHud,
    extra: (st) => [Math.round(st.breath * 100) / 100],
    beat: BEAT, isBreath,      // 시험용
    tick(tr, st, e, ctx) {
      const gun = (ctx.ev && ctx.ev.gun) || 2400;
      const S = tr.swim;
      if (!S) return;
      // 박자 점: 오른쪽에서 가운데(쳐야 하는 곳)로 흘러와요 · 숨 박자는 큰 물방울
      if (!S.tw || e - (S.twT || 0) > 1000) { S.tw = S.trk.clientWidth; S.twT = e; }
      const k = Math.max(0, e - gun);
      const n0 = Math.floor(k / BEAT);
      S.dots.forEach((d, i) => {
        const tt = (BEAT - (k % BEAT)) + (i - 1) * BEAT;   // 이 점이 가운데 오기까지 남은 시간
        const left = 28 + tt / BEAT * 18;
        const n = n0 + i;                                  // 이 점의 박자 번호
        const br = isBreath(n);
        if (d.br !== br) { d.br = br; d.className = 'osw-dot' + (br ? ' br' : ''); d.textContent = br ? '숨' : ''; }
        d.style.transform = `translateX(${(left / 100 * (S.tw || (S.tw = S.trk.clientWidth))).toFixed(1)}px)`;
        d.style.opacity = left < 0 || left > 100 ? 0 : 1;
      });
      if (e - st.qT < 400 && st.qT !== S.lastQ) {
        S.lastQ = st.qT;
        const br = st.kind === 1;
        S.q.textContent = br ? (st.q === 1 ? '후~ 딱!' : st.q >= 0.7 ? '후~' : '헛숨') : st.q === 1 ? '딱!' : st.q >= 0.7 ? '좋아' : '헛물질';
        S.q.className = 'osw-q show ' + (br ? (st.q >= 0.7 ? 'a' : 'b') : st.q === 1 ? 'p' : st.q >= 0.7 ? 'g' : 'b');
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
