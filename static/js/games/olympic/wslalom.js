/* 아리채 오락실 · 올림픽(동계) · 알파인 회전
   비탈을 내려가며 깃발 문(빨강·파랑 번갈아) 사이를 지나가요.
   빨강 = 왼쪽, 파랑 = 오른쪽으로 꺾어요. 많이 꺾을수록 느려지고, 문을 놓치면 2초 벌칙. */
(function () {
  'use strict';
  const O = window.Oly;
  const { HEX, SHADE, LIGHT, shape } = window.Games.kit;

  const N = 20;
  const GATE = (i) => 25 + 22 * i;
  const GX = (i) => (i % 2 ? 3.2 : -3.2);
  const GW = 1.5;           // 문 반쪽 너비
  const D = GATE(N - 1) + 22;
  const EDGE = 8.6;
  const PEN = 2000;

  const sim = {
    init() { return { d: 0, v: 0, lat: 0, latv: 0, pen: 0, gi: 0, miss: 0, res: [], state: 0, waitUntil: 0, go: false }; },
    press(st, c, e, gun) {
      if (c !== 'r' && c !== 'b') return null;
      if (e < gun) { if (!st.waitUntil) { st.waitUntil = gun + 1000; st.state = 1; return { say: '부정출발! 1초 늦게', sfx: 'bad', vib: [40, 40, 40] }; } return null; }
      if (st.waitUntil && e < st.waitUntil) return null;
      st.latv = O.clamp(st.latv + (c === 'r' ? -1.9 : 1.9), -8, 8);
      return { sfx: 'tick', vib: 5 };
    },
    step(st, dt, e, gun) {
      if (e < gun || (st.waitUntil && e < st.waitUntil)) return null;
      if (st.state === 1) st.state = 0;
      if (!st.go) { st.go = true; st.v = 3; }
      let out = null;
      st.v = Math.max(2, st.v + (1.3 - 0.0062 * st.v * st.v - 0.12 * Math.abs(st.latv)) * dt);
      st.lat += st.latv * dt;
      st.latv *= Math.exp(-1.4 * dt);
      if (Math.abs(st.lat) > EDGE) { st.lat = Math.sign(st.lat) * EDGE; st.latv = 0; st.v *= 0.985; }
      st.d += st.v * dt;
      while (st.gi < N && st.d >= GATE(st.gi)) {
        const ok = Math.abs(st.lat - GX(st.gi)) <= GW;
        st.res.push(ok ? 1 : 0);
        if (!ok) { st.pen += PEN; st.miss += 1; out = { say: '깃발 놓침 +2초', color: '#FF8B95', sfx: 'bad', vib: [30, 20, 30], ms: 700 }; }
        else out = { sfx: 'good', vib: 8 };
        st.gi += 1;
      }
      return out;
    }
  };
  // AI: 문과 문 사이를 부드럽게 이어서
  function botLat(d) {
    if (d <= GATE(0)) return GX(0) * Math.min(1, d / GATE(0));
    for (let i = 0; i < N - 1; i++) {
      if (d < GATE(i + 1)) { const f = (d - GATE(i)) / (GATE(i + 1) - GATE(i)); return GX(i) + (GX(i + 1) - GX(i)) * (1 - Math.cos(Math.PI * f)) / 2; }
    }
    return GX(N - 1) * 0.6;
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#F8FCFF"/><path d="M10 6 V16 M16 6 V16" stroke="#FF4757" stroke-width="2"/><rect x="10" y="6" width="6" height="5" fill="#FF4757"/><path d="M24 22 V32 M30 22 V32" stroke="#3D7BFF" stroke-width="2"/><rect x="24" y="22" width="6" height="5" fill="#3D7BFF"/><path d="M6 36 Q14 26 20 20 T34 6" fill="none" stroke="#9CC7E6" stroke-width="2" stroke-dasharray="3 2"/></svg>';

  O.downhillEvent({
    id: 'wslalom',
    title: '알파인 회전',
    cat: '동계 · 설상',
    catColor: 'b',
    how: '빨·파로 좌우 꺾어 깃발 문 통과',
    icon: ICON,
    D, halfView: 9.5, yScale: 0.42, tau: 4, bg: '#F8FCFF', cls: 'oslm',
    meterLabel: '<i class="r"></i> 왼쪽 · 오른쪽 <i class="b"></i>',
    rules: ['비탈을 내려가며 깃발 문 사이로 지나가요 (20개)', '빨강 = 왼쪽, 파랑 = 오른쪽으로 꺾어요 · 많이 꺾으면 느려져요', '문을 놓치면 2초 벌칙 · 미리미리 다음 문 쪽으로!'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '◀ 왼쪽')}<svg width="44" height="50" viewBox="0 0 40 40">${ICON.replace(/^<svg[^>]*>/, '').replace('</svg>', '')}</svg>${b('b', '오른쪽 ▶')}</div>`;
    },
    sim,
    botLat,
    angle: (latv, v) => Math.atan2(latv, Math.max(3, v)) * 180 / Math.PI,
    camLat: (st) => st.lat * 0.55,
    token(a, me) {
      return `<g><path d="M-6 -16 V16 M6 -16 V16" stroke="${a.shorts}" stroke-width="3.4" stroke-linecap="round"/><path d="M-6 -16 q0 -4 2 -6 M6 -16 q0 -4 2 -6" stroke="${a.shorts}" stroke-width="3" fill="none"/>
        <ellipse rx="9" ry="7" fill="${a.jersey}" stroke="#2A2340" stroke-width="1.4"/><path d="M-9 0 L-15 8 M9 0 L15 8" stroke="#5B5677" stroke-width="1.8" stroke-linecap="round"/>
        <g transform="translate(0 -6) scale(.36)">${O.HEAD[a.id]('e')}</g>${me ? '<circle r="22" fill="none" stroke="#FFD23F" stroke-width="2" stroke-dasharray="4 4"/>' : ''}</g>`;
    },
    drawCourse(d0, d1, SX, SY, px, py, W, H) {
      // 눈밭 + 양옆 나무 + 결승선
      let s = `<rect x="${SX(-EDGE - 0.6).toFixed(1)}" y="0" width="${((2 * EDGE + 1.2) * px).toFixed(1)}" height="${H}" fill="#FFFFFF"/>`;
      for (let d = Math.floor(d0 / 6) * 6; d <= d1; d += 6) {
        const y = SY(d).toFixed(1);
        s += `<path d="M${(SX(-EDGE - 1.6) - 0).toFixed(1)} ${y} l-7 12 h14 Z M${(SX(EDGE + 1.6)).toFixed(1)} ${(SY(d + 3)).toFixed(1)} l-7 12 h14 Z" fill="#3FA45B"/>`;
        s += `<path d="M${SX(-EDGE - 0.6).toFixed(1)} ${y} v8 M${SX(EDGE + 0.6).toFixed(1)} ${y} v8" stroke="#FF8A3D" stroke-width="2"/>`;
      }
      if (d1 > D - 2) s += `<rect x="${SX(-EDGE).toFixed(1)}" y="${(SY(D) - 5).toFixed(1)}" width="${(2 * EDGE * px).toFixed(1)}" height="10" fill="#FF4757" opacity=".85"/><text x="${SX(0).toFixed(1)}" y="${(SY(D) - 9).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="900" fill="#FF4757" font-family="system-ui,sans-serif">FINISH</text>`;
      return s;
    },
    drawObjects(d0, d1, SX, SY, px, st) {
      let s = '';
      for (let i = 0; i < N; i++) {
        const d = GATE(i);
        if (d < d0 || d > d1) continue;
        const c = i % 2 ? '#3D7BFF' : '#FF4757';
        const y = SY(d);
        const done = i < st.gi; const ok = st.res[i];
        const op = done ? 0.4 : 1;
        [GX(i) - GW, GX(i) + GW].forEach((x) => {
          s += `<g opacity="${op}" transform="translate(${SX(x).toFixed(1)} ${y.toFixed(1)})"><path d="M0 6 V-18" stroke="#2A2340" stroke-width="2"/><rect x="${x < GX(i) ? -12 : 0}" y="-18" width="12" height="9" fill="${c}"/></g>`;
        });
        if (done && !ok) s += `<text x="${SX(GX(i)).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="900" fill="#FF4757">✕</text>`;
        if (i === st.gi) s += `<path d="M${SX(GX(i) - GW).toFixed(1)} ${(y + 6).toFixed(1)} H${SX(GX(i) + GW).toFixed(1)}" stroke="${c}" stroke-width="2" stroke-dasharray="4 3"/>`;
      }
      // 내 지나간 자국
      return s;
    },
    tip(st, e, gun) {
      if (e < gun) return '출발 준비';
      if (st.gi >= N) return '결승까지 쭉!';
      const x = GX(st.gi);
      const need = x - (st.lat + st.latv * 0.72);
      return need > 0.8 ? `${st.gi + 1}번 문 → 파랑` : need < -0.8 ? `← 빨강 ${st.gi + 1}번 문` : `${st.gi + 1}번 문 쭉~`;
    },
    tipMid: (st) => `문 ${st.gi}/${N}${st.miss ? ` · 놓침 ${st.miss}` : ''}`,
    sumExtra: (st) => (st.miss ? ` (놓친 문 ${st.miss})` : '')
  });
})();
