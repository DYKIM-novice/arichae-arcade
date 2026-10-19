/* 아리채 오락실 · 풍선 불기 (연타 조절)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, el, center, ARROW, ilBtn, msgPop } = G.kit;

  const balloon = {
    id: 'balloon', title: '풍선 불기', cat: '연타 조절', catColor: 'r', buttons: ['r', 'g', 'b'], pressSound: false,
    rules: ['빨강이나 파랑을 눌러 풍선을 불어요', '초록을 누르면 풍선을 묶어서 점수!', '너무 크게 불면 펑! 흔들리면 조심'],
    illus() {
      return `<div class="il-row">${ilBtn('r', '불기')}${ilBtn('b', '불기')}${ARROW}${ilBtn('g', '묶기')}</div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const PAL = ['#FF6FB5', '#FFD23F', '#3DD6D0', '#FF8A3D', '#B07BFF', '#8BE04E'];
      let size = 0;
      let popAt = 30;
      let state = 'pump';
      let waitUntil = 0;
      let score = 0;
      let tied = 0;
      let popped = 0;
      let biggest = 0;
      let color = PAL[0];

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="bl-wrap">
        <div class="bl-shelf"></div>
        <div class="bl-msg disp"></div>
        <div class="bl-stage"><div class="bl-balloon"><svg viewBox="0 0 100 132" aria-hidden="true">
          <ellipse cx="50" cy="54" rx="42" ry="50" fill="currentColor"/>
          <ellipse cx="34" cy="34" rx="10" ry="17" fill="#fff" opacity=".35"/>
          <path d="M44 103 L56 103 L50 111 Z" fill="currentColor"/>
          <path d="M50 111 Q44 120 52 131" stroke="#F6F3FF" stroke-opacity=".7" stroke-width="2" fill="none"/></svg></div>
          <div class="bl-pump"><i></i></div></div>
        <div class="bl-info">크기 <b>0</b> · 묶은 풍선 <b>0</b>개 · 터진 풍선 <b>0</b>개</div></div>`);
      ctx.stage.appendChild(wrap);
      const bal = wrap.querySelector('.bl-balloon');
      const msg = wrap.querySelector('.bl-msg');
      const info = wrap.querySelector('.bl-info');
      const shelf = wrap.querySelector('.bl-shelf');
      const stageEl = wrap.querySelector('.bl-stage');
      let maxScale = 2.5;

      function render() {
        const s = 0.42 + (size / 64) * (maxScale - 0.42);
        bal.style.transform = `translateX(-50%) scale(${s.toFixed(3)})`;
        bal.style.color = color;
        bal.classList.toggle('strain', state === 'pump' && size / popAt > 0.75);
        info.innerHTML = `크기 <b>${size}</b> · 묶은 풍선 <b>${tied}</b>개 · 터진 풍선 <b>${popped}</b>개`;
      }
      function next() {
        popAt = 26 + Math.floor(R() * 38);
        color = PAL[Math.floor(R() * PAL.length)];
        size = 0;
        state = 'pump';
        bal.className = 'bl-balloon';
        bal.style.opacity = '1';
        render();
      }

      return {
        start() {
          maxScale = Math.max(1.2, (stageEl.clientHeight * 0.9) / 132);
          next();
          msgPop(msg, '후~ 불어요!', '#F6F3FF');
        },
        tick(t) {
          if (state !== 'pump' && t >= waitUntil) next();
        },
        onPress(c, t) {
          if (state !== 'pump') return;
          if (c === 'g') {
            if (size < 3) { msgPop(msg, '조금 더 불어요', '#C9C3E6'); return; }
            const bonus = size / popAt >= 0.85 ? 60 : 0;
            const gain = Math.round(size * 4) + bonus;
            score += gain;
            tied++;
            biggest = Math.max(biggest, size);
            ctx.setScore(score);
            state = 'tie';
            waitUntil = t + 750;
            bal.classList.add('fly');
            shelf.appendChild(el(`<i style="background:${color}"></i>`));
            while (shelf.children.length > 12) shelf.firstElementChild.remove();
            msgPop(msg, bonus ? `아슬아슬! +${gain}` : `+${gain}`, bonus ? '#FFD23F' : '#7DF0AE');
            if (bonus) ctx.sfx.perfect(); else ctx.sfx.good();
            ctx.vibrate(15);
            render();
            return;
          }
          size++;
          ctx.sfx.pump();
          ctx.vibrate(4);
          if (size >= popAt) {
            state = 'pop';
            waitUntil = t + 850;
            popped++;
            const p = center(ctx, bal);
            ctx.fx.burst(p.x, p.y, color, 26);
            ctx.fx.shake();
            ctx.sfx.pop();
            ctx.vibrate([60, 30, 60]);
            bal.style.opacity = '0';
            msgPop(msg, '펑! 0점', '#FF8B95');
          }
          render();
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${tied}개 묶음 · ${popped}개 터짐`
      };
    }
  };

  G.register(balloon);
})();
