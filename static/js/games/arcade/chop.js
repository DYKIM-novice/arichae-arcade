/* 아리채 오락실 · 나무 도끼질 (연타)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { el, center, ARROW, msgPop, retrigger } = G.kit;
  const A = window.Animals;

  const chop = {
    id: 'chop', title: '나무 도끼질', cat: '연타', catColor: 'g', buttons: ['r', 'g', 'b'], pressSound: false,
    rules: ['아무 버튼이나 연타해서 나무를 베요', '나무를 쓰러뜨리면 +100점', '갈수록 나무가 굵어져요!'],
    illus() {
      return `<div class="il-row" style="gap:18px"><div class="il-tree"><i></i><b></b></div>${ARROW}<div class="il-cap2">탁탁탁!<br>연타!</div></div>`;
    },
    create(ctx) {
      let hpMax = 18;
      let hp = 18;
      let trees = 0;
      let chops = 0;
      let score = 0;
      let falling = 0;
      const me = ctx.players.find((p) => p.pid === ctx.myPid) || { animal: 'bear' };

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="cp-wrap"><div class="cp-msg disp"></div>
        <div class="cp-scene"><div class="cp-tree"><div class="cp-canopy"><i></i><i></i><i></i></div><div class="cp-trunk"><div class="cp-cut"></div></div></div>
          <div class="cp-player"><div class="cp-av">${A.svg(me.animal)}</div><div class="cp-axe"><svg viewBox="0 0 40 60" aria-hidden="true"><rect x="17" y="10" width="6" height="50" rx="3" fill="#A86B45"/><path d="M14 6 Q2 14 6 28 L22 22 L22 8 Z" fill="#C9C3E6" stroke="#8D86B5" stroke-width="2"/></svg></div></div>
          <div class="cp-ground"></div></div>
        <div class="cp-hp"><i></i></div><div class="cp-info">쓰러뜨린 나무 <b>0</b>그루</div></div>`);
      ctx.stage.appendChild(wrap);
      const tree = wrap.querySelector('.cp-tree');
      const cut = wrap.querySelector('.cp-cut');
      const axe = wrap.querySelector('.cp-axe');
      const hpFill = wrap.querySelector('.cp-hp i');
      const msg = wrap.querySelector('.cp-msg');
      const info = wrap.querySelector('.cp-info');
      const trunk = wrap.querySelector('.cp-trunk');

      function render() {
        hpFill.style.width = (hp / hpMax * 100) + '%';
        cut.style.width = ((1 - hp / hpMax) * 82) + '%';
      }
      function newTree() {
        hpMax += 4;
        hp = hpMax;
        tree.className = 'cp-tree grow';
        msgPop(msg, '다음 나무! 더 굵어요', '#F6F3FF');
        render();
      }

      return {
        start() { render(); msgPop(msg, '탁탁탁! 연타!', '#F6F3FF'); },
        tick(t) {
          if (falling && t >= falling) {
            falling = 0;
            newTree();
          }
        },
        onPress(c, t) {
          if (falling) return;
          hp--;
          chops++;
          score += 5;
          retrigger(axe, 'swing');
          retrigger(trunk, 'hit');
          const p = center(ctx, cut);
          ctx.fx.burst(p.x, p.y, '#E3B48C', 5);
          ctx.sfx.chop();
          ctx.vibrate(8);
          if (hp <= 0) {
            trees++;
            score += 100;
            falling = t + 700;
            tree.className = 'cp-tree fall';
            info.innerHTML = `쓰러뜨린 나무 <b>${trees}</b>그루`;
            msgPop(msg, '우지끈! +100', '#FFD23F');
            ctx.sfx.crash();
            ctx.vibrate([30, 30, 80]);
            ctx.setBadge(`${trees}그루`, 'g');
          }
          ctx.setScore(score);
          render();
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${trees}그루 · ${chops}번 찍음`
      };
    }
  };

  G.register(chop);
})();
