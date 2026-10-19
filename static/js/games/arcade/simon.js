/* 아리채 오락실 · 따라 누르기 (기억력)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, shape, el, center, msgPop } = G.kit;

  const simon = {
    id: 'simon', title: '따라 누르기', cat: '기억력', catColor: 'b', buttons: ['r', 'g', 'b'],
    rules: ['불이 깜빡인 순서를 잘 기억해요', '같은 순서대로 버튼을 눌러요', '성공할 때마다 하나씩 길어져요'],
    illus() {
      return `<div class="il-row">${['r', 'b', 'b', 'g'].map((c, i) => `<div class="il-lamp" style="width:56px;height:56px;background:${HEX[c]};box-shadow:0 0 18px ${HEX[c]};opacity:${1 - i * 0.15}">${shape(c, 22)}</div>`).join('')}</div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const seq = Array.from({ length: 40 }, () => COLS[Math.floor(R() * 3)]);
      let level = 3;
      let best = 0;
      let state = 'wait';
      let nextAt = 0;
      let showStart = 0;
      let lit = -1;
      let inputIdx = 0;
      let score = 0;
      let litOffAt = 0;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="sm-wrap">
        <div class="sm-level">레벨 <b class="disp">3</b></div>
        <div class="sm-msg disp">잘 보세요!</div>
        <div class="sm-lamps">${COLS.map((c) => `<div class="sm-lamp" data-c="${c}" style="--c:${HEX[c]}">${shape(c, 40)}</div>`).join('')}</div>
        <div class="sm-dots"></div></div>`);
      ctx.stage.appendChild(wrap);
      const lamps = {};
      wrap.querySelectorAll('.sm-lamp').forEach((l) => { lamps[l.dataset.c] = l; });
      const msg = wrap.querySelector('.sm-msg');
      const dots = wrap.querySelector('.sm-dots');
      const lvl = wrap.querySelector('.sm-level b');

      const dur = () => Math.max(260, 520 - level * 20);
      const gap = () => Math.max(110, 190 - level * 6);

      function lightOnly(c) {
        COLS.forEach((k) => lamps[k].classList.toggle('on', k === c));
      }
      function drawDots() {
        dots.innerHTML = Array.from({ length: level }, (_, i) => `<i class="${i < inputIdx ? 'done' : ''}"></i>`).join('');
      }
      function beginShow(t) {
        state = 'show';
        showStart = t + 400;
        lit = -1;
        inputIdx = 0;
        lvl.textContent = level;
        drawDots();
        msgPop(msg, '잘 보세요!', '#C9C3E6');
      }

      return {
        start(t) { beginShow(t); },
        tick(t) {
          if (state === 'show') {
            const step = dur() + gap();
            const e = t - showStart;
            if (e < 0) { lightOnly(null); return; }
            const i = Math.floor(e / step);
            const inOn = (e % step) < dur();
            if (i >= level) {
              lightOnly(null);
              state = 'input';
              inputIdx = 0;
              drawDots();
              msgPop(msg, '따라 눌러요!', '#7DF0AE');
              return;
            }
            if (inOn) {
              lightOnly(seq[i]);
              if (lit !== i) { lit = i; ctx.sfx.note(seq[i]); }
            } else lightOnly(null);
          } else if (state === 'input') {
            if (litOffAt && t >= litOffAt) { lightOnly(null); litOffAt = 0; }
          } else if (state === 'wait' && t >= nextAt) {
            beginShow(t);
          }
        },
        onPress(c, t) {
          if (state !== 'input') return;
          lightOnly(c);
          litOffAt = t + 180;
          if (c === seq[inputIdx]) {
            inputIdx++;
            drawDots();
            if (inputIdx >= level) {
              const gain = level * 10;
              score += gain;
              best = Math.max(best, level);
              ctx.setScore(score);
              const p = center(ctx, msg);
              ctx.fx.burst(p.x, p.y + 60, '#FFD23F', 18);
              ctx.fx.float('+' + gain, p.x, p.y, '#FFD23F', 36);
              ctx.sfx.perfect();
              ctx.vibrate([15, 25, 15]);
              msgPop(msg, '정답!', '#FFD23F');
              level++;
              ctx.setBadge(`레벨 ${level}`, 'b');
              state = 'wait';
              nextAt = t + 800;
            }
          } else {
            msgPop(msg, '틀렸어요! 다시 볼게요', '#FF8B95');
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([40, 30, 40]);
            state = 'wait';
            nextAt = t + 1100;
          }
        },
        end() { lightOnly(null); },
        score: () => score,
        value: () => score,
        summary: () => `최고 레벨 ${best || '-'}`
      };
    }
  };

  G.register(simon);
})();
