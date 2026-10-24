/* 아리채 오락실 · 올림픽(동계) · 봅슬레이
   출발: 빨·파 연타로 썰매를 힘껏 밀어요 (25m) → 올라타면 점점 빨라져요
   얼음 길이 휘면 빨강(왼쪽)·파랑(오른쪽)으로 핸들! 벽에 부딪히면 쿵! 느려져요. */
(function () {
  'use strict';
  const O = window.Oly;
  const { HEX, SHADE, LIGHT, shape } = window.Games.kit;

  const D = 800;
  const PUSH = 25;
  const HW = 1.5;          // 얼음 길 반쪽 너비(m)
  const SLED = 0.38;       // 썰매 반쪽 너비
  const cen = (d) => 2.2 * Math.sin(d / 55) + 1.2 * Math.sin(d / 23 + 1);    // 길 가운데
  const slope = (d) => 2.2 / 55 * Math.cos(d / 55) + 1.2 / 23 * Math.cos(d / 23 + 1);

  const sim = {
    init() { return { d: 0, v: 0, lat: cen(0), latv: 0, mash: new O.Masher(66), state: 0, waitUntil: 0, hitT: -1e9, hits: 0, rode: false }; },
    press(st, c, e, gun) {
      if (c !== 'r' && c !== 'b') return null;
      if (e < gun) { if (!st.waitUntil) { st.waitUntil = gun + 1000; st.state = 1; return { say: '부정출발! 1초 늦게', sfx: 'bad', vib: [40, 40, 40] }; } return null; }
      if (st.waitUntil && e < st.waitUntil) return null;
      if (st.d < PUSH) {
        if (st.mash.press(c, e) === 1) { st.v = Math.min(9.5, st.v + 0.8); return { sfx: 'step', vib: 6 }; }
        return null;
      }
      st.latv = O.clamp(st.latv + (c === 'r' ? -0.9 : 0.9), -5, 5);
      return { sfx: 'tick', vib: 4 };
    },
    step(st, dt, e) {
      if (st.state === 1 && e >= st.waitUntil) st.state = 0;
      let out = null;
      if (st.d < PUSH) st.v *= Math.exp(-0.35 * dt);
      else {
        if (!st.rode) { st.rode = true; out = { say: '올라타기!', color: '#3D7BFF', sfx: 'whoosh', ms: 800 }; }
        st.v += (1.35 - 0.0009 * st.v * st.v) * dt;
      }
      st.lat += st.latv * dt;
      st.latv *= Math.exp(-0.6 * dt);
      const c = cen(st.d);
      const rel = st.lat - c;
      if (Math.abs(rel) > HW - SLED) {
        const side = Math.sign(rel);
        st.lat = c + side * (HW - SLED);
        st.latv = -side * Math.abs(st.latv) * 0.3;
        if (e - st.hitT > 350 && st.d > PUSH) {
          st.hitT = e; st.v *= 0.93; st.hits += 1;
          out = { say: '쿵!', color: '#FF8B95', sfx: 'bad', vib: [40, 20, 40], ms: 500 };
        }
      }
      st.d += st.v * dt;
      return out;
    }
  };

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#F8FCFF"/><path d="M8 38 Q4 20 16 12 T22 2 M24 38 Q20 20 32 12 T38 2" fill="none" stroke="#7FB8E0" stroke-width="3"/><rect x="14" y="16" width="9" height="16" rx="4.5" fill="#FF4757" transform="rotate(20 18 24)"/><circle cx="20" cy="18" r="3" fill="#FFD23F"/></svg>';

  O.downhillEvent({
    id: 'wbob',
    title: '봅슬레이',
    cat: '동계 · 썰매',
    catColor: 'r',
    how: '출발 연타로 밀기 → 빨·파로 핸들',
    icon: ICON,
    D, halfView: 4.2, yScale: 0.22, tau: 6, bg: '#F8FCFF', cls: 'obob',
    meterLabel: '<i class="r"></i><b>↔</b><i class="b"></i> 출발 연타 · 그다음 핸들',
    rules: ['출발! 빨·파를 번갈아 연타해서 썰매를 힘껏 밀어요 (25m)', '썰매에 타면 점점 빨라져요 · 얼음 길이 휘는 쪽으로 핸들', '빨강 = 왼쪽, 파랑 = 오른쪽 · 벽에 부딪히면 쿵! 느려져요'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      return `<div class="il-row">${b('r', '◀ 왼쪽')}<svg width="40" height="50" viewBox="0 0 40 50"><path d="M6 50 Q2 26 14 16 T20 0 M26 50 Q22 26 34 16 T40 0" fill="none" stroke="#7FB8E0" stroke-width="3"/><rect x="14" y="22" width="9" height="16" rx="4.5" fill="#FF4757" transform="rotate(20 18 30)"/></svg>${b('b', '오른쪽 ▶')}</div>`;
    },
    sim,
    botLat: (d) => cen(d) + 0.25 * Math.sin(d / 9),
    angle: (latv, v) => Math.atan2(latv, Math.max(4, v)) * 180 / Math.PI * 2.2,
    camLat: (st) => cen(st.d + 8),
    token(a, me, px) {
      const w = 0.78 * px; const L = Math.max(30, w * 2.2);
      return `<g><rect x="${(-w / 2).toFixed(1)}" y="${(-L / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${L.toFixed(1)}" rx="${(w / 2).toFixed(1)}" fill="${a.jersey}" stroke="#2A2340" stroke-width="1.6"/>
        <rect x="${(-w / 2 + 3).toFixed(1)}" y="${(-L / 2 + 4).toFixed(1)}" width="${(w - 6).toFixed(1)}" height="${(L * 0.25).toFixed(1)}" rx="4" fill="rgba(255,255,255,.4)"/>
        <g transform="translate(0 ${(-L * 0.12).toFixed(1)}) scale(${(w / 60).toFixed(3)})">${O.HEAD[a.id]('e')}</g>
        <path d="M${(-w / 2 - 2).toFixed(1)} ${(L / 2 - 3).toFixed(1)} V${(-L / 2 + 6).toFixed(1)} M${(w / 2 + 2).toFixed(1)} ${(L / 2 - 3).toFixed(1)} V${(-L / 2 + 6).toFixed(1)}" stroke="#8C96A8" stroke-width="2"/>
        ${me ? `<circle r="${(L * 0.62).toFixed(1)}" fill="none" stroke="#FFD23F" stroke-width="2" stroke-dasharray="4 4" opacity=".8"/>` : ''}</g>`;
    },
    drawCourse(d0, d1, SX, SY, px, py, W, H) {
      let L = ''; let R = '';
      for (let d = Math.floor(d0 / 2) * 2; d <= d1; d += 2) {
        const c = cen(d);
        L += `${L ? 'L' : 'M'}${SX(c - HW).toFixed(1)} ${SY(d).toFixed(1)} `;
        R = `L${SX(c + HW).toFixed(1)} ${SY(d).toFixed(1)} ` + R;
      }
      let s = `<path d="${L}${R}Z" fill="#DDF0FC"/>`;
      // 벽 (두툼하게)
      s += `<path d="${L}" fill="none" stroke="#7FB8E0" stroke-width="7" stroke-linejoin="round"/><path d="${'M' + R.slice(1)}" fill="none" stroke="#7FB8E0" stroke-width="7" stroke-linejoin="round"/>`;
      for (let m = Math.ceil(d0 / 100) * 100; m <= Math.min(d1, D); m += 100) {
        const c = cen(m); const y = SY(m).toFixed(1);
        s += m === D ? `<rect x="${SX(c - HW).toFixed(1)}" y="${(SY(m) - 5).toFixed(1)}" width="${(2 * HW * px).toFixed(1)}" height="10" fill="url(#ol-chk2)"/><text x="${(SX(c + HW) + 10).toFixed(1)}" y="${y}" font-size="11" font-weight="900" fill="#FF4757" font-family="system-ui,sans-serif">FINISH</text>`
          : `<path d="M${SX(c - HW).toFixed(1)} ${y} H${SX(c + HW).toFixed(1)}" stroke="#A9C4FF" stroke-width="1.5" stroke-dasharray="4 3"/><text x="${(SX(c + HW) + 8).toFixed(1)}" y="${(SY(m) + 4).toFixed(1)}" font-size="10" font-weight="800" fill="#5B7FA8" font-family="system-ui,sans-serif">${m}m</text>`;
      }
      if (d0 < PUSH + 2) { const c = cen(PUSH); s += `<path d="M${SX(c - HW).toFixed(1)} ${SY(PUSH).toFixed(1)} H${SX(c + HW).toFixed(1)}" stroke="#2ED573" stroke-width="3"/><text x="${(SX(c + HW) + 8).toFixed(1)}" y="${(SY(PUSH) + 4).toFixed(1)}" font-size="10" font-weight="900" fill="#1A8F4A" font-family="system-ui,sans-serif">올라타기</text>`; }
      return `<defs><pattern id="ol-chk2" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#fff"/><rect width="5" height="5" fill="#2A2340"/><rect x="5" y="5" width="5" height="5" fill="#2A2340"/></pattern></defs>` + s;
    },
    tip(st, e, gun) {
      if (e < gun) return '출발 준비';
      if (st.d < PUSH) return '빨·파 연타로 밀기!';
      const k = slope(st.d + Math.max(6, st.v * 0.5)) - (st.latv / Math.max(5, st.v));
      if (Math.abs(st.lat - cen(st.d)) > HW - SLED - 0.15) return '벽이에요! 반대로';
      return k > 0.03 ? '오른쪽으로 휘어요 → 파랑' : k < -0.03 ? '← 왼쪽으로 휘어요 빨강' : '쭉~';
    },
    tipClass: (st) => (st.d >= PUSH && Math.abs(st.lat - cen(st.d)) > HW - SLED - 0.15 ? 'warn' : ''),
    sumExtra: (st) => (st.hits ? ` (쿵 ${st.hits}번)` : '')
  });
})();
