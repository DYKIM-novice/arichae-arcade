/* 아리채 오락실 · 블록 지우기 (정확도)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, SHADE, LIGHT, shape, el, center } = G.kit;

  const blocks = {
    id: 'blocks',
    title: '블록 지우기',
    cat: '정확도',
    catColor: 'b',
    buttons: ['r', 'g', 'b'],
    rules: ['맨 아래 블록과 같은 색 버튼을 누르세요', '틀리면 0.5초 동안 멈춰요', '연속으로 맞히면 콤보 점수가 붙어요'],
    illus() {
      const order = ['b', 'r', 'r', 'b', 'g'];
      const stack = order.map((c, i) =>
        `<div class="il-block" style="background:${HEX[c]};box-shadow:inset 0 3px 0 rgba(255,255,255,.3),0 4px 0 ${SHADE[c]};${i === order.length - 1 ? 'outline:3px solid #FFD23F;outline-offset:3px' : ''}">${shape(c, 16)}</div>`).join('');
      return `<div class="il-row"><div class="il-stack">${stack}</div>
        <svg class="il-arrow" width="56" height="36" viewBox="0 0 64 40" fill="none" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 H54"/><path d="M42 8 L56 20 L42 32"/></svg>
        <div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX.g};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE.g},0 0 0 4px rgba(255,210,63,.9)">${shape('g', 24)}</div></div><span style="color:${LIGHT.g}">초록 누르기</span></div></div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const nextColor = () => COLS[Math.floor(R() * 3)];
      const VIS = 9;
      const queue = [];
      const els = [];
      let score = 0;
      let combo = 0;
      let best = 0;
      let cleared = 0;
      let frozenUntil = 0;

      ctx.stage.innerHTML = '';
      const field = el(`<div class="bk-field"><div class="bk-stack"></div>
        <div class="bk-mark l">${'<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 4 L20 12 L5 20 Z" fill="#FFD23F"/></svg>'}</div>
        <div class="bk-mark r">${'<svg width="26" height="26" viewBox="0 0 24 24"><path d="M19 4 L4 12 L19 20 Z" fill="#FFD23F"/></svg>'}</div></div>`);
      ctx.stage.appendChild(field);
      const stackEl = field.querySelector('.bk-stack');

      function sizeBlocks() {
        const h = field.clientHeight - 40;
        const bh = Math.max(24, Math.min(44, Math.floor(h / VIS) - 7));
        field.style.setProperty('--bh', bh + 'px');
      }

      function makeBlock(c, i) {
        const b = el(`<div class="bk-block" style="background:${HEX[c]};box-shadow:inset 0 4px 0 rgba(255,255,255,.3),0 5px 0 ${SHADE[c]}">${shape(c, 20)}</div>`);
        b.style.setProperty('--i', i);
        stackEl.appendChild(b);
        return b;
      }

      function layout() {
        els.forEach((b, i) => {
          b.style.setProperty('--i', i);
          b.classList.toggle('target', i === 0);
          b.style.opacity = String(Math.max(0.35, 1 - i * 0.07));
        });
      }

      for (let i = 0; i < VIS; i++) {
        const c = nextColor();
        queue.push(c);
        els.push(makeBlock(c, i));
      }

      return {
        start() { sizeBlocks(); layout(); },
        tick() { /* 블록은 입력 때만 움직임 */ },
        onPress(c, t) {
          if (t < frozenUntil) return;
          const target = els[0];
          if (c === queue[0]) {
            const pt = center(ctx, target);
            queue.shift();
            els.shift();
            target.remove();
            const nc = nextColor();
            queue.push(nc);
            const nb = makeBlock(nc, VIS - 1);
            nb.classList.add('drop');
            els.push(nb);
            layout();
            combo++;
            best = Math.max(best, combo);
            cleared++;
            const gain = 10 + Math.min(20, Math.floor(combo / 5) * 5);
            score += gain;
            ctx.setScore(score);
            ctx.fx.burst(pt.x, pt.y + 14, '#FFFFFF', 10);
            ctx.fx.float('+' + gain, pt.x + 90, pt.y - 6, '#FFD23F', 26);
            if (combo > 0 && combo % 10 === 0) {
              ctx.sfx.perfect();
              ctx.fx.float(combo + ' 콤보!', pt.x, pt.y - 70, '#FFD23F', 34);
              ctx.vibrate([15, 30, 15]);
            } else {
              ctx.sfx.good();
              ctx.vibrate(10);
            }
            ctx.setBadge(combo >= 3 ? combo + ' 콤보' : null, 'r');
          } else {
            combo = 0;
            frozenUntil = t + 500;
            ctx.lock(500);
            target.classList.remove('wrong');
            void target.offsetWidth;
            target.classList.add('wrong');
            const pt = center(ctx, target);
            ctx.fx.float('멈춤!', pt.x, pt.y - 40, '#FF8B95', 30);
            ctx.fx.shake();
            ctx.sfx.bad();
            ctx.vibrate([40, 30, 40]);
            ctx.setBadge(null);
          }
        },
        end() {},
        score: () => score,
        value: () => cleared,
        summary: () => `${cleared}개 지움 · 최고 ${best}콤보`
      };
    }
  };

  G.register(blocks);
})();
