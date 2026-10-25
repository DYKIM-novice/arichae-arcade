/* 아리채 오락실 · 전력 질주 (연타)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요.
   아무 버튼이나 마구 연타! (빠르기 제한 없음 · 손가락 여러 개도 OK)
   한 번 누른 게 두 번 들어오는 것만 걸러요 (같은 버튼 22ms 안) */
(function () {
  'use strict';

  const G = window.Games;
  const { HEX, SHADE, LIGHT, shape, el, center, escapeHtml } = G.kit;

  const race = {
    id: 'race',
    title: '전력 질주',
    cat: '연타',
    catColor: 'r',
    buttons: ['r', 'g', 'b'],
    how: '아무 버튼이나 마구 연타',
    rules: ['아무 버튼이나 마구 누르면 달려요 (한 번 = 1m)', '손가락 여러 개로 쳐도 돼요! 빠를수록 좋아요', '150m 결승선에 먼저 들어가면 보너스'],
    illus() {
      return `<div class="il-row il-race">
        <div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX.r};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE.r}">${shape('r', 24)}</div></div><span style="color:${LIGHT.r}">1</span></div>
        <svg width="40" height="36" viewBox="0 0 64 40" fill="none" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 H54"/><path d="M42 8 L56 20 L42 32"/></svg>
        <div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX.b};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE.b}">${shape('b', 24)}</div></div><span style="color:${LIGHT.b}">2</span></div>
        <svg width="40" height="36" viewBox="0 0 64 40" fill="none" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 H54"/><path d="M42 8 L56 20 L42 32"/></svg>
        <div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX.g};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE.g}">${shape('g', 24)}</div></div><span style="color:${LIGHT.g}">3</span></div>
      </div>`;
    },
    create(ctx) {
      const GOAL = 150;
      let dist = 0;
      const lastBy = { r: -1e9, g: -1e9, b: -1e9 };   // 버튼마다 마지막 누른 때 (겹쳐 들어온 터치 거르기)
      let score = 0;
      let finishedAt = 0;
      let taps = [];
      const shown = {};

      const runners = ctx.players;
      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="rc-wrap">
        <div class="rc-track"><div class="rc-finish"></div><div class="rc-lanes" style="grid-template-columns:repeat(${runners.length},minmax(0,1fr))"></div></div>
        <div class="rc-meter"><div class="rc-meter-top"><span class="rc-hint"><i style="background:${HEX.r}"></i><i style="background:${HEX.g}"></i><i style="background:${HEX.b}"></i> 아무 버튼이나 연타!</span><span class="rc-rate"><em>0.0</em> 회/초</span></div>
        <div class="rc-pips">${'<span></span>'.repeat(15)}</div></div></div>`);
      ctx.stage.appendChild(wrap);
      const lanesEl = wrap.querySelector('.rc-lanes');
      const pips = Array.from(wrap.querySelectorAll('.rc-pips span'));
      const rateEl = wrap.querySelector('.rc-rate em');
      const laneEls = {};
      runners.forEach((p, i) => {
        const me = p.pid === ctx.myPid;
        const lane = el(`<div class="rc-lane${me ? ' me' : ''}${i % 2 ? ' alt' : ''}">
          <div class="rc-runner"><div class="rc-av">${window.Animals.svg(p.animal)}</div>
          <span class="rc-tag">${me ? '나' : escapeHtml(p.name)}</span><div class="rc-dust"><i></i><i></i><i></i></div></div></div>`);
        lanesEl.appendChild(lane);
        laneEls[p.pid] = lane.querySelector('.rc-runner');
        shown[p.pid] = 0;
      });

      function place(pid, d) {
        const r = laneEls[pid];
        if (!r) return;
        const lane = r.parentElement;
        const travel = Math.max(0, lane.clientHeight - r.offsetHeight - 6);
        r.style.transform = `translate(-50%, ${Math.round((1 - Math.min(1, d / GOAL)) * travel)}px)`;
      }

      function myRank() {
        const live = ctx.live();
        let rank = 1;
        Object.keys(live).forEach((pid) => {
          if (pid !== ctx.myPid && live[pid][1] > dist) rank++;
        });
        return rank;
      }

      return {
        start() { runners.forEach((p) => place(p.pid, 0)); },
        tick(t) {
          taps = taps.filter((x) => t - x < 1000);
          const rate = taps.length;
          rateEl.textContent = rate.toFixed(1);
          pips.forEach((p, i) => {
            p.className = i < rate ? (i < 6 ? 'on g' : i < 10 ? 'on y' : 'on r') : '';
          });
          const live = ctx.live();
          runners.forEach((p) => {
            const target = p.pid === ctx.myPid ? dist : (live[p.pid] ? live[p.pid][1] : 0);
            shown[p.pid] += (target - shown[p.pid]) * (p.pid === ctx.myPid ? 1 : 0.25);
            place(p.pid, shown[p.pid]);
            const r = laneEls[p.pid];
            if (r) r.classList.toggle('fast', p.pid === ctx.myPid ? rate >= 6 : false);
          });
          ctx.setBadge(myRank() + '위', 'b');
        },
        onPress(c, t) {
          if (finishedAt) return;
          if (c !== 'r' && c !== 'g' && c !== 'b') return;
          if (t - lastBy[c] < 22) return;      // 한 번 누른 게 두 번 들어온 것
          lastBy[c] = t;
          dist += 1;
          taps.push(t);
          ctx.sfx.step();
          ctx.vibrate(6);
          if (dist >= GOAL) {
            dist = GOAL;
            finishedAt = t;
            score = GOAL * 10 + Math.max(0, Math.round((ctx.endAt - t) / 10));
            const pt = center(ctx, laneEls[ctx.myPid]);
            ctx.fx.burst(pt.x, pt.y, '#FFD23F', 24);
            ctx.fx.float('골인!', pt.x, pt.y - 40, '#FFD23F', 40);
            ctx.sfx.perfect();
            ctx.vibrate([30, 40, 80]);
          } else {
            score = dist * 10;
          }
          ctx.setScore(score);
        },
        end() {},
        score: () => score,
        value: () => dist,
        summary: () => finishedAt ? `골인! ${((finishedAt - ctx.startAt) / 1000).toFixed(2)}초` : `${dist}m 달림`
      };
    }
  };

  race.pressSound = false;

  G.register(race);
})();
