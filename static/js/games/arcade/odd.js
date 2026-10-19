/* 아리채 오락실 · 가짜 찾기 (판단)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, LIGHT, shape, el, center, IDX, msgPop } = G.kit;
  const A = window.Animals;

  const odd = {
    id: 'odd', title: '가짜 찾기', cat: '판단', catColor: 'b', buttons: ['r', 'g', 'b'],
    rules: ['셋 중에 하나만 달라요', '다른 하나가 있는 자리의 버튼을 눌러요', '빨리 찾을수록 점수가 커요'],
    illus() {
      return `<div class="il-row" style="gap:10px">${['rabbit', 'rabbit', 'rabbit'].map((k, i) =>
        `<div class="il-btn"><div style="width:64px;height:64px;${i === 2 ? 'filter:hue-rotate(80deg) saturate(2)' : ''}">${A.svg(k)}</div><span style="color:${LIGHT[COLS[i]]}">${i === 2 ? '이게 가짜!' : '진짜'}</span></div>`).join('')}</div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const kinds = A.LIST.map((x) => x[0]);
      let round = 0;
      let oddIdx = 0;
      let state = 'idle';
      let askAt = 0;
      let nextAt = 0;
      let score = 0;
      let correct = 0;
      let streak = 0;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="od-wrap"><div class="od-round">문제 <b class="disp">1</b></div><div class="od-msg disp">다른 하나를 찾아요!</div>
        <div class="od-cards">${COLS.map((c) => `<div class="od-card"><div class="od-pic"></div><span class="od-tag" style="background:${HEX[c]}">${shape(c, 16)}</span></div>`).join('')}</div>
        <div class="od-hint"></div></div>`);
      ctx.stage.appendChild(wrap);
      const cards = Array.from(wrap.querySelectorAll('.od-card'));
      const pics = Array.from(wrap.querySelectorAll('.od-pic'));
      const msg = wrap.querySelector('.od-msg');
      const roundEl = wrap.querySelector('.od-round b');
      const hint = wrap.querySelector('.od-hint');

      function newRound(t) {
        round++;
        roundEl.textContent = round;
        const d = Math.min(1, (round - 1) / 8);
        const base = kinds[Math.floor(R() * kinds.length)];
        oddIdx = Math.floor(R() * 3);
        const pool = round <= 2 ? ['animal'] : ['animal', 'hue', 'size', 'rotate', 'hue', 'rotate'];
        const kind = pool[Math.floor(R() * pool.length)];
        let other = kinds[Math.floor(R() * kinds.length)];
        if (other === base) other = kinds[(kinds.indexOf(base) + 1) % kinds.length];
        const hueDeg = Math.round(70 - 50 * d);
        const sc = (0.8 + 0.12 * d).toFixed(2);
        const rot = Math.round(22 - 12 * d);
        const rotSign = R() < 0.5 ? -1 : 1;
        pics.forEach((p, i) => {
          const isOdd = i === oddIdx;
          p.innerHTML = A.svg(isOdd && kind === 'animal' ? other : base);
          let f = '';
          let tf = '';
          if (isOdd && kind === 'hue') f = `hue-rotate(${hueDeg}deg) saturate(1.3)`;
          if (isOdd && kind === 'size') tf = `scale(${sc})`;
          if (isOdd && kind === 'rotate') tf = `rotate(${rot * rotSign}deg)`;
          p.style.filter = f;
          p.style.transform = tf;
        });
        cards.forEach((c) => c.classList.remove('right', 'wrong'));
        hint.textContent = '';
        state = 'ask';
        askAt = t;
        msgPop(msg, '다른 하나는?', '#F6F3FF');
      }

      return {
        start(t) { newRound(t); },
        tick(t) {
          if (state === 'reveal' && t >= nextAt) newRound(t);
          else if (state === 'ask' && t - askAt > 7000) {
            cards[oddIdx].classList.add('right');
            msgPop(msg, '시간 초과!', '#FF8B95');
            streak = 0;
            state = 'reveal';
            nextAt = t + 1000;
          }
        },
        onPress(c, t) {
          if (state !== 'ask') return;
          const i = IDX[c];
          const p = center(ctx, cards[i]);
          if (i === oddIdx) {
            streak++;
            const gain = 20 + Math.max(0, Math.round(40 * (1 - (t - askAt) / 3000))) + Math.min(20, (streak - 1) * 5);
            score += gain;
            correct++;
            ctx.setScore(score);
            cards[i].classList.add('right');
            msgPop(msg, `찾았다! +${gain}`, '#FFD23F');
            ctx.fx.burst(p.x, p.y, '#FFD23F', 16);
            ctx.sfx.perfect();
            ctx.vibrate([15, 25, 15]);
            state = 'reveal';
            nextAt = t + 500;
          } else {
            streak = 0;
            score = Math.max(0, score - 10);
            ctx.setScore(score);
            cards[i].classList.add('wrong');
            cards[oddIdx].classList.add('right');
            msgPop(msg, '아니에요 -10', '#FF8B95');
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([40, 30, 40]);
            state = 'reveal';
            nextAt = t + 1000;
          }
          ctx.setBadge(streak >= 2 ? `${streak}연속` : null, 'y');
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${correct}개 찾음`
      };
    }
  };

  G.register(odd);
})();
