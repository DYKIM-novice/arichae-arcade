/* 아리채 오락실 · 튕기기 게임 공통 (알까기 · 컬링 · 미니 당구)
   Flick.aim(el, o)  : 내 돌을 누르고 뒤로 당겼다 놓으면 튕겨요 (새총처럼). 당긴 길이 = 세기
     o.toWorld(cx, cy) → [x, y]  (화면 좌표 → 판 좌표)
     o.pick(x, y)      → 고를 수 있는 돌 {id, x, y} 또는 null
     o.full            → 이만큼(판 단위) 당기면 최대 세기
     o.enabled()       → 지금 튕길 수 있나
     o.draw(stone, angle, power)  → 조준선 그리기 (stone 이 null 이면 지우기)
     o.shoot(id, angle, power)
   Flick.play(anim, frameFn, doneFn) : 서버가 보낸 움직임(20프레임/초)을 부드럽게 재생 */
(function () {
  'use strict';
  function aim(el, o) {
    let st = null; let cur = null; let pid = null;
    function calc(x, y) {
      const dx = st.x - x; const dy = st.y - y;          // 당긴 반대쪽으로 날아가요
      const len = Math.hypot(dx, dy);
      return { angle: Math.atan2(dy, dx), power: Math.min(1, len / o.full), len };
    }
    el.addEventListener('pointerdown', (e) => {
      if (!o.enabled()) return;
      const [x, y] = o.toWorld(e.clientX, e.clientY);
      const s = o.pick(x, y);
      if (!s) return;
      e.preventDefault();
      st = s; pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch (er) { /* 무시 */ }
      cur = { angle: 0, power: 0, len: 0 };
      o.draw(st, 0, 0);
    });
    el.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== pid) return;
      e.preventDefault();
      const [x, y] = o.toWorld(e.clientX, e.clientY);
      cur = calc(x, y);
      o.draw(st, cur.angle, cur.power);
    });
    const end = (e) => {
      if (!st || e.pointerId !== pid) return;
      const s = st; const c = cur;
      st = null;
      o.draw(null);
      if (e.type === 'pointerup' && c && c.power >= 0.06 && o.enabled()) o.shoot(s.id, c.angle, c.power);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    return { cancel() { st = null; o.draw(null); } };
  }

  function play(anim, frameFn, doneFn) {
    const fr = anim.frames; const fps = anim.fps || 20;
    if (!fr || fr.length < 2) { doneFn(); return { stop() {} }; }
    const t0 = performance.now(); let raf = 0; let stopped = false;
    const tick = (now) => {
      if (stopped) return;
      const t = Math.max(0, (now - t0) / 1000 * fps);   // 첫 프레임 시각이 t0 보다 앞설 수 있어요
      const k = Math.floor(t);
      if (k >= fr.length - 1) { frameFn(fr[fr.length - 1], fr[fr.length - 1], 0); doneFn(); return; }
      frameFn(fr[k], fr[k + 1], t - k);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return { stop() { stopped = true; cancelAnimationFrame(raf); } };
  }
  // 두 프레임 사이 위치 (j번째 돌) — 떨어진 돌은 null
  function lerpPos(a, b, f, j) {
    const ax = a[2 * j]; const ay = a[2 * j + 1]; const bx = b[2 * j]; const by = b[2 * j + 1];
    if (ax === -9999) return null;
    if (bx === -9999) return [ax / 10, ay / 10, 1 - f];
    return [(ax + (bx - ax) * f) / 10, (ay + (by - ay) * f) / 10, 1];
  }
  window.Flick = { aim, play, lerpPos };
})();
