/* 아리채 오락실 · 올림픽(하계) · 창던지기
   빨·파 연타로 도움닫기 → 파울선 앞에서 초록을 꾹 (각도) → 떼면 휙! 창이 날아가요.
   선을 넘으면 파울. 도움닫기가 빠를수록, 40~45도일수록 멀리. 3번 중 최고 기록. */
(function () {
  'use strict';
  const O = window.Oly;
  const { HEX, SHADE, LIGHT, shape } = window.Games.kit;

  const LINE = 25;
  const FIELD = 125;

  const javSVG = (s) => `<g transform="scale(${s.toFixed(2)})"><path d="M-30 0 H30" stroke="#E9E6FA" stroke-width="2.6" stroke-linecap="round"/><path d="M30 0 L37 0" stroke="#5B5677" stroke-width="2.6" stroke-linecap="round"/><path d="M-4 0 H6" stroke="#FF4757" stroke-width="3.6" stroke-linecap="round"/></g>`;

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#3FA45B"/><path d="M2 30 H38" stroke="#fff" stroke-width="1.2" opacity=".6"/><path d="M6 30 Q20 0 36 22" fill="none" stroke="#FFE27A" stroke-width="1.8" stroke-dasharray="3 2.5"/><path d="M22 6 L36 18" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M27 10 L31 13.5" stroke="#FF4757" stroke-width="3.2" stroke-linecap="round"/></svg>';

  O.fieldEvent({
    id: 'ojav',
    title: '창던지기',
    cat: '하계 · 육상',
    catColor: 'b',
    how: '도움닫기 연타 → 초록 꾹 → 떼면 던지기',
    icon: ICON,
    LINE, D: FIELD, view: 16, camMax: FIELD - 12, camLead: 0.28,
    kick: 1.05, vmax: 10.8, maxAng: 80, angSpeed: 95, bestAng: [36, 48],
    dist: (v, a) => { const sp = 9 + v * 2.3; return Math.max(0, sp * sp * Math.sin(2 * a * Math.PI / 180) / 9.8 * 0.8); },   // 서버 olympic.jav_dist 와 같아요 (0.92 → 0.8)
    flightT: (v, a) => { const sp = 9 + v * 2.3; return Math.max(1.1, 2 * sp * Math.sin(a * Math.PI / 180) / 9.8 * 0.42); },
    rules: ['빨·파 연타로 창을 들고 달려요 (빠를수록 멀리!)', '노란 "각도 구간"에서 초록을 꾹 → 던질 각도가 올라가요 (누르는 동안 속도는 그대로 · 선에 닿으면 저절로 휙!)', '40~45도쯤에서 떼면 휙! · 파울선을 넘으면 파울 · 3번 중 최고 기록'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '달려')}${b('b', '달려')}<svg width="60" height="40" viewBox="0 0 60 40"><path d="M4 36 Q30 -12 56 30" fill="none" stroke="#FFE27A" stroke-width="2.5" stroke-dasharray="4 3"/><path d="M20 12 L40 4" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>${b('g', '꾹→떼기')}</div>`;
    },
    marksExtra(tr) {
      const p = tr.ppm;
      let s = '';
      // 파울선 뒤는 잔디밭
      tr.list.forEach((pl, li) => {
        const L = tr.L[li];
        s += `<rect x="${(LINE * p).toFixed(1)}" y="${(L.y0 - 0.5).toFixed(1)}" width="${((FIELD - LINE) * p).toFixed(1)}" height="${(L.h + 1).toFixed(1)}" fill="${li % 2 ? '#4DB866' : '#46AD5E'}"/>`;
      });
      const top = tr.trackTop;
      s += `<rect x="${(LINE * p - 2).toFixed(1)}" y="${top}" width="5" height="${(tr.H - top).toFixed(1)}" fill="#fff"/>`;
      for (let m = 10; m <= 100; m += 10) {
        s += `<rect x="${((LINE + m) * p - 1).toFixed(1)}" y="${top}" width="2" height="${(tr.H - top).toFixed(1)}" fill="#fff" opacity=".5"/>
          <g transform="translate(${((LINE + m) * p).toFixed(1)} ${top - 1})"><rect x="-16" y="-11" width="32" height="15" rx="7" fill="rgba(21,18,43,.6)"/><text y="1" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">${m}m</text></g>`;
      }
      s += `<g transform="translate(${(LINE * p).toFixed(1)} ${top - 1})"><rect x="-20" y="-11" width="40" height="15" rx="7" fill="#FF4757"/><text y="1" text-anchor="middle" font-size="9.5" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">파울선</text></g>`;
      return s;
    },
    afterBuild(tr) { tr.flagG = {}; tr.javG = {}; },
    render(tr, A, p, I) {
      const L = A.lane;
      const s = L.s * tr.baseS;
      let x = I.x;
      let pose;
      let cam = I.x;
      // 날아가는 창 (선수마다 하나)
      let jav = tr.javG[p.pid];
      if (!jav || !jav.isConnected) {
        jav = O.el('g', {}, javSVG(s * 0.9));
        tr.layers.obj.appendChild(jav);
        tr.javG[p.pid] = jav;
      }
      const holding = I.ph === 'ready' || I.ph === 'run' || I.ph === 'hold';
      if (I.ph === 'ready' || I.ph === 'done') { x = 0; pose = Object.assign(O.P.stand(), { fa: 120 }); }
      else if (I.ph === 'run') pose = Object.assign(O.P.run(A.ph, Math.min(1, I.v / 10)), { fa: 125 });
      else if (I.ph === 'hold') pose = Object.assign(O.P.run(A.ph, 0.7, 'e'), { fa: 150 + I.ang * 0.4, tilt: -6 });
      else if (I.ph === 'foul') pose = O.P.sad();
      else pose = Object.assign(O.P.cheer(A.ph), { ex: 'h' });
      if (I.ph === 'air' || I.ph === 'land') x = I.fx + 1.2;
      tr.place(p.pid, x, pose, 0);
      // 창 위치
      if (holding) {
        jav.style.display = '';
        const ax = tr.sx(x) + 0;
        const ay = L.y - 52 * s;
        const rot = I.ph === 'hold' ? -I.ang * 0.6 : -12;
        jav.setAttribute('transform', `translate(${(ax + tr.camX * tr.ppm).toFixed(1)} ${ay.toFixed(1)}) rotate(${rot.toFixed(1)})`);
      } else if (I.ph === 'air' || I.ph === 'land') {
        jav.style.display = '';
        const land = LINE + I.fd;
        const f = Math.min(1, I.f);
        const jx = I.fx + (land - I.fx) * f;
        const hmax = 60 + 160 * Math.sin(Math.max(8, I.ang) * Math.PI / 180);
        const h = 4 * hmax * f * (1 - f) * L.s + 50 * s * (1 - f);
        const slope = Math.atan2(4 * hmax * (1 - 2 * f) * L.s, (land - I.fx) * tr.ppm) * 180 / Math.PI;
        const rot = I.ph === 'land' ? 38 : -slope;
        jav.setAttribute('transform', `translate(${(jx * tr.ppm).toFixed(1)} ${(L.y - h - (I.ph === 'land' ? -4 * s : 0)).toFixed(1)}) rotate(${rot.toFixed(1)})`);
        if (p.me) cam = jx;
      } else jav.style.display = 'none';
      return { cam };
    },
    flag(tr, A, p, I) {
      const L = A.lane;
      const old = tr.flagG[p.pid];
      if (old) old.remove();
      const foul = I.ph === 'foul';
      const x = foul ? LINE : LINE + I.fd;
      const t = foul ? '파울' : `${I.fd.toFixed(2)}m`;
      const c = foul ? '#FF4757' : p.me ? '#FFD23F' : '#fff';
      const g = O.el('g', { transform: `translate(${(x * tr.ppm).toFixed(1)} ${(L.y0 + L.h * 0.6).toFixed(1)}) scale(${(L.s * 0.95).toFixed(2)})` },
        `<path d="M0 0 V-34" stroke="#2A2340" stroke-width="2"/><path d="M0 -34 h48 l-5 7 l5 7 h-48 Z" fill="${c}" stroke="rgba(0,0,0,.3)"/><text x="23" y="-23" text-anchor="middle" font-size="10.5" font-weight="900" fill="#2A2340" font-family="system-ui,sans-serif">${t}</text>`);
      tr.layers.obj.appendChild(g);
      tr.flagG[p.pid] = g;
    }
  });
})();
