/* 아리채 오락실 · 숫자 세기 (관찰)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, LIGHT, KNAME, shape, el, center, IDX, SHAPE_NAME, FILLED } = G.kit;

  const count = {
    id: 'count', title: '숫자 세기', cat: '관찰', catColor: 'g', buttons: ['r', 'g', 'b'],
    rules: ['여러 도형이 화면을 지나가요', '물어보는 도형이 몇 개였는지 세요', '처음엔 조금, 갈수록 많아져요'],
    illus() {
      return `<div class="il-row" style="flex-wrap:wrap;gap:8px;max-width:260px">${['r', 'b', 'r', 'g', 'b', 'r', 'g'].map((c) => `<div style="width:30px;height:30px">${FILLED[c](HEX[c])}</div>`).join('')}
        <div class="il-cap" style="width:100%">빨강 동그라미는 몇 개?</div></div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      let round = 0;
      let state = 'idle';
      let t0 = 0;
      let objs = [];
      let asked = 'r';
      let answer = 0;
      let options = [];
      let askAt = 0;
      let nextAt = 0;
      let score = 0;
      let correct = 0;
      const STREAM = 4200;
      let W = 300;
      let H = 300;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="ct-wrap"><div class="ct-round">문제 <b class="disp">1</b></div><div class="ct-field"></div>
        <div class="ct-ask"><div class="ct-q disp"></div><div class="ct-opts">${COLS.map((c) => `<div class="ct-opt" data-c="${c}" style="--c:${HEX[c]}"><b class="disp"></b>${shape(c, 18)}</div>`).join('')}</div></div></div>`);
      ctx.stage.appendChild(wrap);
      const field = wrap.querySelector('.ct-field');
      const ask = wrap.querySelector('.ct-ask');
      const q = wrap.querySelector('.ct-q');
      const optEls = Array.from(wrap.querySelectorAll('.ct-opt'));
      const roundEl = wrap.querySelector('.ct-round b');

      function newRound(t) {
        round++;
        roundEl.textContent = round;
        // 처음엔 4~5개로 시작해서 문제마다 2개씩 늘어나요 (최대 15개)
        const n = Math.min(14, 2 + round * 2) + Math.floor(R() * 2);
        objs = [];
        field.innerHTML = '';
        for (let i = 0; i < n; i++) {
          const c = COLS[Math.floor(R() * 3)];
          const o = {
            c,
            y: 0.08 + R() * 0.78,
            start: R() * (STREAM - 1500),
            speed: 0.9 + R() * 0.6,
            size: 30 + Math.floor(R() * 14),
            el: null
          };
          o.el = el(`<div class="ct-obj" style="width:${o.size}px;height:${o.size}px">${FILLED[c](HEX[c])}</div>`);
          field.appendChild(o.el);
          objs.push(o);
        }
        asked = COLS[Math.floor(R() * 3)];
        answer = objs.filter((o) => o.c === asked).length;
        const set = new Set([answer]);
        const deltas = [1, -1, 2, -2, 3];
        let k = Math.floor(R() * 2);
        while (set.size < 3) {
          const v = answer + deltas[k % deltas.length];
          if (v >= 0) set.add(v);
          k++;
        }
        options = Array.from(set);
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(R() * (i + 1));
          [options[i], options[j]] = [options[j], options[i]];
        }
        state = 'stream';
        t0 = t;
        ask.classList.remove('show');
        optEls.forEach((e) => e.classList.remove('right', 'wrong'));
      }
      function showAsk(t) {
        state = 'ask';
        askAt = t;
        objs.forEach((o) => { o.el.style.opacity = '0'; });
        q.innerHTML = `<span style="color:${LIGHT[asked]}">${KNAME[asked]} ${SHAPE_NAME[asked]}</span>는 몇 개?`;
        optEls.forEach((e, i) => { e.querySelector('b').textContent = options[i]; });
        ask.classList.add('show');
        ctx.sfx.lamp();
      }
      function reveal(t, chosenIdx) {
        state = 'reveal';
        nextAt = t + 1400;
        optEls.forEach((e, i) => {
          if (options[i] === answer) e.classList.add('right');
          else if (i === chosenIdx) e.classList.add('wrong');
        });
      }

      return {
        start(t) {
          W = field.clientWidth;
          H = field.clientHeight;
          newRound(t);
        },
        tick(t) {
          if (state === 'stream') {
            const e = t - t0;
            objs.forEach((o) => {
              const p = (e - o.start) / (1500 / o.speed);
              const x = W + 40 - p * (W + 90);
              o.el.style.transform = `translate(${x}px, ${o.y * (H - o.size)}px)`;
            });
            if (e > STREAM + 400) showAsk(t);
          } else if (state === 'ask' && t - askAt > 6000) {
            q.textContent = `시간 끝! 정답은 ${answer}개`;
            reveal(t, -1);
            ctx.sfx.soft();
          } else if (state === 'reveal' && t >= nextAt) {
            newRound(t);
          }
        },
        onPress(c, t) {
          if (state === 'stream') return;
          if (state !== 'ask') return;
          const i = IDX[c];
          const p = center(ctx, optEls[i]);
          if (options[i] === answer) {
            const gain = 50 + Math.max(0, Math.round(30 * (1 - (t - askAt) / 4000)));
            score += gain;
            correct++;
            ctx.setScore(score);
            q.textContent = `정답! ${answer}개 +${gain}`;
            ctx.fx.burst(p.x, p.y, HEX[c], 16);
            ctx.sfx.perfect();
            ctx.vibrate([15, 25, 15]);
          } else {
            q.textContent = `아쉬워요! 정답은 ${answer}개`;
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([40, 30, 40]);
          }
          ctx.setBadge(`${correct}개 정답`, 'g');
          reveal(t, i);
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${round}문제 중 ${correct}개 정답`
      };
    }
  };

  G.register(count);
})();
