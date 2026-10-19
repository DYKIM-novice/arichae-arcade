/* 아리채 오락실 · 빛 섞기 (빛의 방) — 초·중
   과학관·음악관 게임 — 방장이 고른 난이도로, 서버가 준 같은 시드로 가족 모두 같은 문제를 풀어요. */
(function () {
  'use strict';

  const G = window.Games;
  const {
    rng, el, center, msgPop, retrigger, SLOTS, BIT, pickNoRepeat, eulReul,
    recipeText
  } = G.kit;

  const LIGHT = {
    1: { name: '빨강', hex: '#FF3B3B' },
    2: { name: '초록', hex: '#2EE65A' },
    4: { name: '파랑', hex: '#3D6BFF' },
    3: { name: '노랑', hex: '#FFF23A' },
    6: { name: '청록', hex: '#3DF5FF' },
    5: { name: '자홍', hex: '#FF3DF5' },
    7: { name: '흰색', hex: '#FFFFFF' },
    0: { name: '깜깜해요', hex: '#0B0918' }
  };
  const LIGHT_RECIPE = { 3: [1, 2], 6: [2, 4], 5: [1, 4], 7: [1, 2, 4] };
  const lightName = (k) => LIGHT[k].name;

  const light = {
    id: 'light', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><g style="mix-blend-mode:screen"><circle cx="15" cy="15" r="10" fill="#FF3B3B"/><circle cx="25" cy="15" r="10" fill="#2EE65A" style="mix-blend-mode:screen"/><circle cx="20" cy="24" r="10" fill="#3D6BFF" style="mix-blend-mode:screen"/></g></svg>`, hall: '빛의 방', title: '빛 섞기', cat: '빛의 삼원색', catColor: 'b', levels: ['e', 'm'],
    buttons: ['r', 'g', 'b'],
    buttonStyle() {
      return {
        r: { name: '빨강 빛' },
        g: { name: '초록 빛' },
        b: { name: '파랑 빛' }
      };
    },
    rules(lv) {
      return lv === 'e'
        ? ['버튼으로 그 색 빛을 켜고 꺼요', '빛이 겹치는 곳의 색을 잘 보세요', '목표 색이 되면 성공!']
        : ['목표 색을 보고 어떤 빛을 켤지 생각해요', '아래 가이드 표를 참고하세요', '한 번에 맞히면 보너스 +30'];
    },
    illus() {
      return `<div class="il-venn"><i style="background:#FF3B3B"></i><i style="background:#2EE65A"></i><i style="background:#3D6BFF"></i></div>
        <div class="il-cap" style="margin-left:14px">빨강 + 초록 = <b style="color:#FFF23A">노랑</b><br>세 빛을 모두 켜면 <b style="color:#fff">흰색</b></div>`;
    },
    learn() {
      return '빛은 섞을수록 밝아져요(가산 혼합). 빨강+초록=노랑, 초록+파랑=청록, 빨강+파랑=자홍, 세 빛을 모두 섞으면 흰색! TV와 휴대폰 화면도 이 세 가지 빛으로 모든 색을 만들어요.';
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const lv = ctx.level;
      const pool = lv === 'e' ? [1, 2, 4, 3, 6, 5, 3, 6, 5] : [3, 6, 5, 7, 3, 6, 5, 7, 1, 2, 4];
      let on = 0;
      let target = 0;
      let presses = 0;
      let askAt = 0;
      let lockUntil = 0;
      let score = 0;
      let solved = 0;
      let oneShot = 0;
      let streak = 0;

      ctx.stage.innerHTML = '';
      const guide = lv === 'm'
        ? `<div class="lt-guide">${[3, 6, 5, 7].map((k) => `<div class="lt-row" data-k="${k}">
            ${LIGHT_RECIPE[k].map((b) => `<i style="background:${LIGHT[b].hex}"></i>`).join('<em>+</em>')}<em>=</em>
            <span class="lt-chip" style="background:${LIGHT[k].hex}"></span><b>${LIGHT[k].name}</b></div>`).join('')}</div>`
        : '';
      const wrap = el(`<div class="lt-wrap lv-${lv}">
        <div class="lt-top">
          <div class="lt-box"><span>목표</span><div class="lt-sw t"></div><b class="disp lt-tname"></b></div>
          <div class="lt-arrow">→</div>
          <div class="lt-box"><span>지금</span><div class="lt-sw n"></div><b class="disp lt-nname"></b></div>
        </div>
        <div class="lt-msg disp"></div>
        <div class="lt-venn"><i class="r"></i><i class="g"></i><i class="b"></i></div>
        ${guide}
      </div>`);
      ctx.stage.appendChild(wrap);
      const tSw = wrap.querySelector('.lt-sw.t');
      const nSw = wrap.querySelector('.lt-sw.n');
      const tName = wrap.querySelector('.lt-tname');
      const nName = wrap.querySelector('.lt-nname');
      const msg = wrap.querySelector('.lt-msg');
      const venn = wrap.querySelector('.lt-venn');
      const circ = { r: venn.querySelector('.r'), g: venn.querySelector('.g'), b: venn.querySelector('.b') };

      function render() {
        SLOTS.forEach((s) => circ[s].classList.toggle('on', !!(on & BIT[s])));
        nSw.style.background = LIGHT[on].hex;
        nSw.classList.toggle('dark', on === 0);
        nName.textContent = LIGHT[on].name;
      }
      function nextTarget(t) {
        target = pickNoRepeat(R, pool, target);
        on = 0;
        presses = 0;
        askAt = t;
        tSw.style.background = LIGHT[target].hex;
        tSw.style.boxShadow = `0 0 26px ${LIGHT[target].hex}88`;
        tName.textContent = lv === 'e' ? LIGHT[target].name : '?';
        msgPop(msg, lv === 'e' ? `${eulReul(LIGHT[target].name)} 만들어요` : '이 색을 만들어 보세요', '#C9C3E6');
        render();
      }

      return {
        start(t) { nextTarget(t); },
        tick(t) {
          if (lockUntil && t >= lockUntil) {
            lockUntil = 0;
            nextTarget(t);
          }
        },
        onPress(c, t) {
          if (lockUntil) return;
          on ^= BIT[c];
          presses++;
          render();
          if (on === target) {
            const need = [1, 2, 4].filter((b) => target & b).length;
            const quick = Math.max(0, Math.round(50 * (1 - (t - askAt) / 6000)));
            const bonus = presses === need ? 30 : 0;
            streak++;
            solved++;
            if (bonus) oneShot++;
            const gain = 100 + quick + bonus;
            score += gain;
            ctx.setScore(score);
            tName.textContent = LIGHT[target].name;
            const txt = need > 1 ? `${recipeText(LIGHT, target)} = ${LIGHT[target].name}!` : `${LIGHT[target].name} 빛!`;
            msgPop(msg, bonus ? `${txt} 한 번에!` : txt, LIGHT[target].hex === '#FFFFFF' ? '#FFFFFF' : LIGHT[target].hex);
            const p = center(ctx, venn);
            ctx.fx.burst(p.x, p.y, LIGHT[target].hex, bonus ? 22 : 14);
            ctx.fx.float('+' + gain, p.x, p.y - 40, '#FFD23F', 30);
            if (bonus) ctx.sfx.perfect(); else ctx.sfx.good();
            ctx.vibrate(bonus ? [15, 25, 15] : 12);
            ctx.setBadge(streak >= 2 ? `${streak}연속` : null, 'b');
            if (lv === 'm') {
              const row = wrap.querySelector(`.lt-row[data-k="${target}"]`);
              if (row) retrigger(row, 'hit');
            }
            lockUntil = t + 900;
          }
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${solved}가지 색 성공 · 한 번에 ${oneShot}번`
      };
    }
  };

  G.register(light);
})();
