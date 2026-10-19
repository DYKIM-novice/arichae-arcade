/* 아리채 오락실 · 용접 이어붙이기 (누르고 떼기)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, KNAME, shape, el, center, msgPop, chipTo } = G.kit;

  const weld = {
    id: 'weld', title: '용접 이어붙이기', cat: '누르고 떼기', catColor: 'y', buttons: ['r', 'g', 'b'], pressSound: false,
    rules: ['지시한 색 버튼을 누르고 있으면 용접이 나가요', '깃발 위치에서 정확히 손을 떼요', '끝까지 가면 타버려서 0점'],
    illus() {
      return `<div class="il-gauge"><div class="il-track"><div class="il-zone" style="left:4%;width:58%;background:#FF8A3D;box-shadow:0 0 16px #FF8A3D"></div><div class="il-needle" style="left:70%;background:#FFD23F;box-shadow:0 0 10px #FFD23F"></div></div>
        <div class="il-cap">버튼을 꾹 누르고 있다가 <span style="color:#FFE27A">깃발</span>에서 떼기</div></div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      let round = 0;
      let c = 'r';
      let end = 0.7;
      let speed = 0.3;
      let pos = 0.04;
      let state = 'ready';
      let nextAt = 0;
      let lastT = 0;
      let lastSpark = 0;
      let score = 0;
      let perfects = 0;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="wd-wrap">
        <div class="wd-round">이음 <b class="disp">1</b></div>
        <div class="wd-msg disp"></div>
        <div class="wd-plate"><div class="wd-seam"></div><div class="wd-bead"></div><div class="wd-flag"><i></i></div>
          <div class="wd-torch"><svg viewBox="0 0 24 40" aria-hidden="true"><rect x="8" y="0" width="8" height="24" rx="2" fill="#C9C3E6"/><path d="M12 24 L7 34 Q12 42 17 34 Z" fill="#FFD23F"/><path d="M12 28 L10 34 Q12 37 14 34 Z" fill="#fff"/></svg></div></div>
        <div class="wd-key"></div>
        <div class="wd-hist"></div></div>`);
      ctx.stage.appendChild(wrap);
      const plate = wrap.querySelector('.wd-plate');
      const bead = wrap.querySelector('.wd-bead');
      const flag = wrap.querySelector('.wd-flag');
      const torch = wrap.querySelector('.wd-torch');
      const msg = wrap.querySelector('.wd-msg');
      const key = wrap.querySelector('.wd-key');
      const roundEl = wrap.querySelector('.wd-round b');
      const hist = wrap.querySelector('.wd-hist');

      function render() {
        bead.style.width = (Math.max(0, pos - 0.04) * 100) + '%';
        torch.style.left = (pos * 100) + '%';
        torch.classList.toggle('on', state === 'weld');
      }
      function newRound() {
        round++;
        c = COLS[Math.floor(R() * 3)];
        end = 0.42 + R() * 0.48;
        speed = Math.min(0.75, 0.28 + round * 0.045);
        pos = 0.04;
        state = 'ready';
        roundEl.textContent = round;
        flag.style.left = (end * 100) + '%';
        bead.classList.remove('cool', 'burn');
        key.innerHTML = `<span style="background:${HEX[c]}">${shape(c, 18)}</span><b>${KNAME[c]}</b> 버튼을 꾹 누르세요`;
        msgPop(msg, '준비!', '#C9C3E6');
        render();
      }
      function finish(t, gain, text, color, cls) {
        state = 'done';
        nextAt = t + 950;
        score += gain;
        ctx.setScore(score);
        bead.classList.add(gain > 0 ? 'cool' : 'burn');
        msgPop(msg, text, color);
        chipTo(hist, gain > 0 ? '+' + gain : 'X', cls);
      }

      return {
        start(t) { lastT = t; newRound(); },
        tick(t) {
          const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
          lastT = t;
          if (state === 'weld') {
            pos += speed * dt;
            if (t - lastSpark > 90) {
              lastSpark = t;
              const p = center(ctx, torch);
              ctx.fx.burst(p.x, p.y + 16, '#FFD23F', 3);
              ctx.sfx.sizzle();
            }
            if (pos >= 1) {
              pos = 1;
              finish(t, 0, '타버렸어요!', '#FF8B95', 'miss');
              ctx.sfx.bad();
              ctx.fx.shake();
              ctx.vibrate([50, 30, 50]);
            }
          } else if (state === 'done' && t >= nextAt) {
            newRound();
          }
          render();
        },
        onPress(k) {
          if (state !== 'ready') return;
          if (k !== c) {
            msgPop(msg, `${KNAME[c]} 버튼이에요`, '#FF8B95');
            ctx.vibrate(30);
            return;
          }
          state = 'weld';
          msgPop(msg, '지이이잉…', '#FFE27A');
          ctx.vibrate(20);
        },
        onRelease(k, t) {
          if (state !== 'weld' || k !== c) return;
          const err = Math.abs(pos - end);
          const gain = Math.max(0, Math.round(100 - err * 600));
          if (err < 0.012) {
            perfects++;
            finish(t, gain, `완벽한 용접! +${gain}`, '#FFD23F', 'perfect');
            const p = center(ctx, flag);
            ctx.fx.burst(p.x, p.y, '#FFD23F', 20);
            ctx.sfx.perfect();
            ctx.vibrate([15, 25, 15]);
          } else if (gain > 0) {
            finish(t, gain, `${pos < end ? '조금 짧아요' : '조금 길어요'} +${gain}`, '#7DF0AE', 'good');
            ctx.sfx.good();
          } else {
            finish(t, 0, pos < end ? '너무 짧아요' : '너무 길어요', '#FF8B95', 'miss');
            ctx.sfx.bad();
          }
          render();
        },
        end() { torch.classList.remove('on'); },
        score: () => score,
        value: () => score,
        summary: () => `${round}번 이음 · 완벽 ${perfects}번`
      };
    }
  };

  G.register(weld);
})();
