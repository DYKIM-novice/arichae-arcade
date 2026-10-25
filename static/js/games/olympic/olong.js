/* 아리채 오락실 · 올림픽(하계) · 멀리뛰기
   빨·파 연타로 도움닫기 → 발구름판 앞에서 초록을 꾹 (각도가 올라가요) → 떼면 점프!
   판을 넘어서 뛰면 파울. 빠를수록, 45도에 가까울수록 멀리 가요. 3번 중 최고 기록. */
(function () {
  'use strict';
  const O = window.Oly;
  const { HEX, SHADE, LIGHT, shape } = window.Games.kit;

  const LINE = 30;        // 발구름판
  const PIT0 = LINE + 0.6;
  const PIT1 = LINE + 10.5;

  function flagSVG(cm, me, foul) {
    const t = foul ? '파울' : (cm / 100).toFixed(2) + 'm';
    const c = foul ? '#FF4757' : me ? '#FFD23F' : '#fff';
    return `<g class="ofd-flag"><path d="M0 0 V-34" stroke="#2A2340" stroke-width="2"/><path d="M0 -34 h${foul ? 34 : 46} l-5 7 l5 7 h-${foul ? 34 : 46} Z" fill="${c}" stroke="rgba(0,0,0,.3)"/><text x="${foul ? 16 : 22}" y="-23" text-anchor="middle" font-size="10.5" font-weight="900" fill="#2A2340" font-family="system-ui,sans-serif">${t}</text></g>`;
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#C9563A"/><rect x="20" y="26" width="18" height="10" fill="#F2D49A"/><path d="M19 26 V36" stroke="#fff" stroke-width="2"/><circle cx="16" cy="9" r="4" fill="#FFD23F"/><path d="M6 24 Q16 0 32 22" fill="none" stroke="#FFE27A" stroke-width="2" stroke-dasharray="3 2.5"/><path d="M15 13 L13 19 L19 21 M13 19 L8 18 M15 15 L21 12" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

  O.fieldEvent({
    id: 'olong',
    title: '멀리뛰기',
    cat: '하계 · 육상',
    catColor: 'g',
    how: '도움닫기 연타 → 초록 꾹 → 떼면 점프',
    icon: ICON,
    LINE, D: PIT1 + 4, view: 14, camMax: PIT1 - 10,
    kick: 1.05, vmax: 11.2, maxAng: 80, angSpeed: 105, bestAng: [38, 52],
    dist: (v, a) => Math.max(0, v * v * Math.sin(2 * a * Math.PI / 180) / 9.8 * 0.62),      // 서버 olympic.jump_dist 와 같아요 (각도 잡을 때 안 느려져서 0.72 → 0.62)
    flightT: (v, a) => Math.max(0.55, 2 * v * Math.sin(a * Math.PI / 180) / 9.8 * 0.75),
    rules: ['빨·파 연타로 도움닫기 (빠를수록 멀리!)', '노란 "각도 구간"에서 초록을 꾹 → 각도가 올라가요 (누르는 동안 속도는 그대로 · 선에 닿으면 저절로 휙!)', '45도쯤에서 떼면 가장 멀리 · 발구름판을 넘으면 파울 · 3번 중 최고 기록'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '달려')}${b('b', '달려')}<svg width="56" height="40" viewBox="0 0 56 40"><path d="M4 36 A28 28 0 0 1 52 36" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="5"/><path d="M14 16 A28 28 0 0 1 42 16" fill="none" stroke="#2ED573" stroke-width="5"/><path d="M28 36 L44 18" stroke="#FFD23F" stroke-width="3.5" stroke-linecap="round"/></svg>${b('g', '꾹→떼기')}</div>`;
    },
    marksExtra(tr) {
      const p = tr.ppm;
      let s = '';
      tr.list.forEach((pl, li) => {
        const L = tr.L[li];
        s += `<rect x="${(PIT0 * p).toFixed(1)}" y="${L.y0.toFixed(1)}" width="${((PIT1 - PIT0) * p).toFixed(1)}" height="${(L.h - 1).toFixed(1)}" fill="${li % 2 ? '#F2D49A' : '#EBCB8D'}"/>
          <rect x="${(LINE * p - 0.12 * p).toFixed(1)}" y="${L.y0.toFixed(1)}" width="${(0.2 * p).toFixed(1)}" height="${(L.h - 1).toFixed(1)}" fill="#fff"/>
          <rect x="${(LINE * p + 0.08 * p).toFixed(1)}" y="${L.y0.toFixed(1)}" width="${(0.1 * p).toFixed(1)}" height="${(L.h - 1).toFixed(1)}" fill="#7FD36F"/>`;
      });
      const top = tr.trackTop;
      for (let m = 4; m <= 9; m++) {
        s += `<g transform="translate(${((LINE + m) * p).toFixed(1)} ${top - 1})"><rect x="-14" y="-11" width="28" height="15" rx="7" fill="rgba(21,18,43,.6)"/><text y="1" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">${m}m</text></g>
          <rect x="${((LINE + m) * p - 0.5).toFixed(1)}" y="${top}" width="1" height="${(tr.H - top).toFixed(1)}" fill="#fff" opacity=".35"/>`;
      }
      s += `<g transform="translate(${(LINE * p).toFixed(1)} ${top - 1})"><rect x="-22" y="-11" width="44" height="15" rx="7" fill="#FF4757"/><text y="1" text-anchor="middle" font-size="9.5" font-weight="900" fill="#fff" font-family="system-ui,sans-serif">발구름판</text></g>`;
      return s;
    },
    afterBuild(tr) { tr.flagG = {}; },
    render(tr, A, p, I) {
      const LANE = A.lane;
      let x = I.x;
      let pose;
      let lift = 0;
      let cam = I.x;
      if (I.ph === 'ready' || I.ph === 'done') { x = 0; pose = O.P.stand(); }
      else if (I.ph === 'run') pose = O.P.run(A.ph, Math.min(1, I.v / 10));
      else if (I.ph === 'hold') pose = Object.assign(O.P.run(A.ph, 0.8, 'e'), { fa: 40 + I.ang, tilt: 4 });
      else if (I.ph === 'air' || I.ph === 'land') {
        const land = LINE + I.fd;
        const f = Math.min(1, I.f);
        x = I.fx + (land - I.fx) * f;
        const hmax = 30 + 70 * Math.sin(Math.max(10, I.ang) * Math.PI / 180);
        lift = 4 * hmax * f * (1 - f);
        pose = I.ph === 'land' ? O.P.land() : O.P.jump(f);
        cam = x;
      } else if (I.ph === 'foul') pose = O.P.sad();
      if (I.ph === 'land' && p.me) pose.fx = 'dust';
      tr.place(p.pid, x, pose, lift);
      return { cam };
    },
    flag(tr, A, p, I) {
      const L = A.lane;
      const old = tr.flagG[p.pid];
      if (old) old.remove();
      const foul = I.ph === 'foul';
      const x = foul ? LINE : LINE + I.fd;
      const g = O.el('g', { transform: `translate(${(x * tr.ppm).toFixed(1)} ${(L.y0 + L.h * 0.55).toFixed(1)}) scale(${(L.s * 0.95).toFixed(2)})` }, flagSVG(Math.round(I.fd * 100), p.me, foul));
      tr.layers.obj.appendChild(g);
      tr.flagG[p.pid] = g;
    }
  });
})();
