/* 아리채 오락실 · 올림픽(하계) · 100m 달리기
   빨강·파랑을 번갈아 연타하면 빨라져요. 출발 총소리 전에 누르면 부정출발(1초 늦게 출발). */
(function () {
  'use strict';
  const O = window.Oly;
  const { HEX, SHADE, LIGHT, shape } = window.Games.kit;

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="8" fill="#D9653B"/><path d="M2 26 H38 M2 33 H38" stroke="#FFF6EA" stroke-width="1.5"/><circle cx="22" cy="10" r="4.5" fill="#FFD23F"/><path d="M21 15 L17 23 L23 27 M17 23 L11 26 M20 17 L27 20 M19 18 L13 16" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M30 6 V18" stroke="#fff" stroke-width="1.5"/><path d="M30 6 h6 v3 h-6 v3 h6 v3 h-6" fill="none" stroke="#2A2340" stroke-width="1.2"/></svg>';

  O.raceEvent({
    id: 'o100',
    title: '100m 달리기',
    cat: '하계 · 육상',
    catColor: 'r',
    how: '빨·파 번갈아 연타 · 부정출발 조심',
    icon: ICON,
    D: 100,
    view: 13,
    buttons: ['r', 'b'],
    rules: ['"탕!" 소리가 나면 빨강·파랑을 번갈아 마구 눌러요', '같은 버튼만 누르면 안 나가요 · 1초에 15번까지만 쳐줘요', '총소리 전에 누르면 부정출발! 1초 늦게 출발해요'],
    illus() {
      const b = (c, n) => `<div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, 24)}</div></div><span style="color:${LIGHT[c]}">${n}</span></div>`;
      const ar = '<svg width="34" height="30" viewBox="0 0 64 40" fill="none" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 H54"/><path d="M42 8 L56 20 L42 32"/></svg>';
      return `<div class="il-row"><span class="il-face">${O.faceSVG('dino', 'e')}</span>${b('r', 1)}${ar}${b('b', 2)}${ar}${b('r', 3)}</div>`;
    },
    sim: O.mashRunner({ kick: 0.9, drag: 1.0, vmax: 12.2 }),
    tau: 1.1
  });
})();
