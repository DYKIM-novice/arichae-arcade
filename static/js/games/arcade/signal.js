/* 아리채 오락실 · 신호등 (반응)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, LIGHT, KNAME, shape, el, center } = G.kit;

  const signal = {
    id: 'signal',
    title: '신호등',
    cat: '반응',
    catColor: 'g',
    buttons: ['r', 'g', 'b'],
    rules: ['불이 켜지면 같은 색 버튼을 빨리!', '갈수록 빨라지고 점수도 1.5배 → 2배!', '회색 X 불은 참기, 미리 누르면 반칙'],
    illus() {
      return `<div class="il-row il-lamps">
        <div class="il-lamp" style="background:${HEX.g};box-shadow:0 0 24px ${HEX.g}">${shape('g', 30)}</div>
        <div class="il-cap2">빨리 누르기</div>
        <div class="il-lamp trap"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg></div>
        <div class="il-cap2">참기</div></div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      let state = 'wait';
      let nextAt = 0;
      let onAt = 0;
      let color = 'r';
      let trap = false;
      let score = 0;
      let best = 0;
      let times = [];
      let t0 = 0;
      let stage = 1;
      const D = Math.max(5000, ctx.endAt - ctx.startAt);
      // 3단계: 뒤로 갈수록 빨라지고 점수 배율이 올라가요
      const STAGES = {
        1: { mult: 1, delay: 1, late: 1500 },
        2: { mult: 1.5, delay: 0.72, late: 1200 },
        3: { mult: 2, delay: 0.5, late: 950 }
      };
      const st = () => STAGES[stage];

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="sg-wrap">
        <div class="sg-msg">준비…</div>
        <div class="sg-housing"><div class="sg-lamp"><span class="sg-icon"></span></div></div>
        <div class="sg-stats"><div><span>최고 기록</span><b class="sg-best">-</b></div><div><span>평균</span><b class="sg-avg">-</b></div></div>
        <div class="sg-hist"></div></div>`);
      ctx.stage.appendChild(wrap);
      const lamp = wrap.querySelector('.sg-lamp');
      const icon = wrap.querySelector('.sg-icon');
      const msg = wrap.querySelector('.sg-msg');
      const bestEl = wrap.querySelector('.sg-best');
      const avgEl = wrap.querySelector('.sg-avg');
      const hist = wrap.querySelector('.sg-hist');

      function schedule(t, gap) {
        const delay = (700 + R() * 1300) * st().delay;
        trap = R() < 0.2;
        color = COLS[Math.floor(R() * 3)];
        state = 'wait';
        nextAt = t + (gap || 0) + delay;
        lamp.className = 'sg-lamp';
        lamp.style.background = '';
        lamp.style.boxShadow = '';
        icon.innerHTML = '';
      }

      function say(text, c) {
        msg.textContent = text;
        msg.style.color = c || '#F6F3FF';
        msg.classList.remove('pulse');
        void msg.offsetWidth;
        msg.classList.add('pulse');
      }

      function chip(text, cls) {
        const e = el(`<span class="${cls}">${text}</span>`);
        hist.prepend(e);
        while (hist.children.length > 6) hist.lastElementChild.remove();
      }

      function updateStats() {
        if (!times.length) return;
        bestEl.textContent = best + 'ms';
        avgEl.textContent = Math.round(times.reduce((a, b) => a + b, 0) / times.length) + 'ms';
      }

      return {
        start(t) { t0 = t; schedule(t, 300); say('불이 켜지면 눌러요', '#C9C3E6'); ctx.setBadge('x1', 'g'); },
        tick(t) {
          const ns = Math.min(3, 1 + Math.floor(((t - t0) / D) * 3));
          if (ns !== stage) {
            stage = ns;
            ctx.setBadge('x' + st().mult, 'g');
            const pt = center(ctx, lamp);
            ctx.fx.float(`빨라져요! 점수 x${st().mult}`, pt.x, pt.y - 90, '#FFD23F', 26);
            ctx.sfx.fanfare();
            ctx.vibrate([20, 30, 20]);
          }
          if (state === 'wait' && t >= nextAt) {
            state = trap ? 'trap' : 'on';
            onAt = t;
            if (trap) {
              lamp.className = 'sg-lamp lit trap';
              icon.innerHTML = '<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>';
              say('참아요!', '#C9C3E6');
            } else {
              lamp.className = 'sg-lamp lit';
              lamp.style.background = HEX[color];
              lamp.style.boxShadow = `inset 0 8px 0 rgba(255,255,255,.35), 0 0 60px ${HEX[color]}, 0 0 120px ${HEX[color]}66`;
              icon.innerHTML = shape(color, 54);
              say(KNAME[color] + '!', LIGHT[color]);
              ctx.sfx.lamp();
            }
          } else if (state === 'on' && t - onAt > st().late) {
            say('늦었어요', '#FF8B95');
            chip('늦음', 'miss');
            schedule(t, 400);
          } else if (state === 'trap' && t - onAt > 1200) {
            const tg = Math.round(20 * st().mult);
            score += tg;
            ctx.setScore(score);
            say('잘 참았어요 +' + tg, '#7DF0AE');
            chip('+' + tg, 'good');
            ctx.sfx.good();
            schedule(t, 300);
          } else if (state === 'show' && t >= nextAt) {
            schedule(t, 0);
          }
        },
        onPress(c, t) {
          const pt = center(ctx, lamp);
          if (state === 'wait') {
            score = Math.max(0, score - 20);
            say('반칙! -20', '#FF8B95');
            chip('반칙', 'miss');
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([40, 30, 40]);
            ctx.lock(600);
            state = 'show';
            nextAt = t + 600;
          } else if (state === 'trap') {
            score = Math.max(0, score - 30);
            say('함정! -30', '#FF8B95');
            chip('함정', 'miss');
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([60, 30, 60]);
            ctx.lock(600);
            lamp.className = 'sg-lamp';
            icon.innerHTML = '';
            state = 'show';
            nextAt = t + 600;
          } else if (state === 'on') {
            if (c === color) {
              const rt = Math.round(t - onAt);
              const gain = Math.round(Math.max(10, 100 - Math.floor(Math.max(0, rt - 150) / 8)) * st().mult);
              score += gain;
              times.push(rt);
              best = best ? Math.min(best, rt) : rt;
              updateStats();
              say(rt + 'ms  +' + gain, rt < 320 ? '#FFD23F' : LIGHT[color]);
              chip(rt + '', rt < 320 ? 'perfect' : 'good');
              ctx.fx.burst(pt.x, pt.y, HEX[color], rt < 320 ? 22 : 12);
              if (rt < 320) { ctx.sfx.perfect(); ctx.vibrate([15, 25, 15]); } else { ctx.sfx.good(); ctx.vibrate(12); }
            } else {
              score = Math.max(0, score - 10);
              say('색이 달라요 -10', '#FF8B95');
              chip('X', 'miss');
              ctx.sfx.bad();
              ctx.vibrate([40, 30, 40]);
              ctx.lock(400);
            }
            lamp.className = 'sg-lamp';
            lamp.style.background = '';
            lamp.style.boxShadow = '';
            icon.innerHTML = '';
            state = 'show';
            nextAt = t + 500;
          }
          ctx.setScore(score);
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => best ? `최고 ${best}ms` : '기록 없음'
      };
    }
  };

  G.register(signal);
})();
