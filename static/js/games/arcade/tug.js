/* 아리채 오락실 · 줄다리기 (팀 연타)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { HEX, LIGHT, KNAME, el, esc, clamp, ilBtn } = G.kit;
  const A = window.Animals;

  const tug = {
    id: 'tug', title: '줄다리기', cat: '팀 연타', catColor: 'r', buttons: ['r', 'b'], pressSound: false,
    rules: ['빨강팀과 파랑팀으로 자동으로 나뉘어요', '팀 힘 = 팀원 평균 연타 수 (2대1이어도 공평)', '이긴 팀은 모두 +300 보너스'],
    illus() {
      return `<div class="il-row">${ilBtn('r', '빨강팀')}<div class="il-rope"></div>${ilBtn('b', '파랑팀')}</div>`;
    },
    create(ctx) {
      const players = ctx.players;
      const teamA = players.filter((_, i) => i % 2 === 0);
      let teamB = players.filter((_, i) => i % 2 === 1);
      const solo = teamB.length === 0;
      if (solo) teamB = [{ pid: '__cpu', name: '로봇', animal: 'monkey' }];
      const myTeam = teamA.some((p) => p.pid === ctx.myPid) ? 'A' : 'B';
      const myBtn = myTeam === 'A' ? 'r' : 'b';
      let taps = 0;
      let t0 = 0;
      let pos = 0;
      let bonus = 0;
      let lastWarn = 0;
      let lastTick = 0;
      let tapTimes = [];

      ctx.stage.innerHTML = '';
      const av = (list, side) => list.map((p) => `<div class="tg-av">${A.svg(p.animal)}<span>${p.pid === ctx.myPid ? '나' : esc(p.name)}</span></div>`).join('');
      const wrap = el(`<div class="tg-wrap">
        <div class="tg-teams"><div class="tg-team a"><b class="disp">빨강팀</b><div class="tg-avs">${av(teamA)}</div></div>
          <div class="tg-team b"><b class="disp">파랑팀</b><div class="tg-avs">${av(teamB)}</div></div></div>
        <div class="tg-arena"><div class="tg-zone a"></div><div class="tg-zone b"></div><div class="tg-mid"></div>
          <div class="tg-rope"><div class="tg-flag"></div></div></div>
        <div class="tg-state disp">팽팽해요!</div>
        <div class="tg-me" style="--c:${HEX[myBtn]}">나는 <b>${myTeam === 'A' ? '빨강팀' : '파랑팀'}</b> · ${KNAME[myBtn]} 버튼 연타! <em>0</em>회/초</div></div>`);
      ctx.stage.appendChild(wrap);
      const rope = wrap.querySelector('.tg-rope');
      const arena = wrap.querySelector('.tg-arena');
      const stateEl = wrap.querySelector('.tg-state');
      const rateEl = wrap.querySelector('.tg-me em');

      // 팀 힘 = 실제로 하고 있는 팀원(접속 중이거나 한 번이라도 당긴 사람)의 평균 당김 수
      // → 인원이 달라도(2대1) 공평하고, 접속이 끊긴 팀원 때문에 지지 않아요
      function teamPower(list, t) {
        const live = ctx.live();
        let sum = 0;
        let n = 0;
        list.forEach((p) => {
          let v;
          if (p.pid === ctx.myPid) v = taps;
          else if (p.pid === '__cpu') v = Math.max(0, (t - t0) / 1000) * 6.3;
          else v = live[p.pid] ? live[p.pid][1] : 0;
          if (p.pid === ctx.myPid || p.pid === '__cpu' || p.connected !== false || v > 0) {
            sum += v;
            n++;
          }
        });
        return n ? sum / n : 0;
      }

      return {
        start(t) { t0 = t; },
        tick(t) {
          lastTick = t;
          const diff = teamPower(teamA, t) - teamPower(teamB, t);
          const target = clamp(diff / 30, -1, 1);
          pos += (target - pos) * 0.15;
          const maxShift = arena.clientWidth * 0.32;
          rope.style.transform = `translateX(${(-pos * maxShift).toFixed(1)}px)`;
          stateEl.textContent = Math.abs(diff) < 2 ? '팽팽해요!' : diff > 0 ? '빨강팀 우세!' : '파랑팀 우세!';
          stateEl.style.color = Math.abs(diff) < 2 ? '#F6F3FF' : diff > 0 ? '#FF8B95' : '#A9C4FF';
          tapTimes = tapTimes.filter((x) => t - x < 1000);
          rateEl.textContent = tapTimes.length;
          const mine = myTeam === 'A' ? diff > 0 : diff < 0;
          ctx.setBadge(Math.abs(diff) < 2 ? '동점' : mine ? '이기는 중' : '지는 중', mine ? 'g' : 'r');
        },
        onPress(c, t) {
          if (c !== myBtn) {
            if (t - lastWarn > 1200) {
              lastWarn = t;
              ctx.fx.float(`${KNAME[myBtn]} 버튼!`, arena.clientWidth / 2, 40, LIGHT[myBtn], 26);
            }
            return;
          }
          taps++;
          tapTimes.push(t);
          ctx.setScore(taps * 10);
          ctx.sfx.step();
          ctx.vibrate(5);
          rope.classList.remove('jerk');
          void rope.offsetWidth;
          rope.classList.add('jerk');
        },
        end() {
          const t = lastTick || t0;
          const diff = teamPower(teamA, t) - teamPower(teamB, t);
          const mine = myTeam === 'A' ? diff > 0 : diff < 0;
          if (mine && Math.abs(diff) >= 0.5) bonus = 300;
          stateEl.textContent = Math.abs(diff) < 1.5 ? '아슬아슬! 결과 발표에서 확인' : diff > 0 ? '빨강팀 승리!' : '파랑팀 승리!';
        },
        // 이긴 팀 보너스(+300)는 서버가 모두 같은 기준으로 판정해서 더해요
        score: () => taps * 10,
        value: () => taps,
        summary: () => `${taps}회 당김${bonus ? ' · 팀 승리 +300' : ''}`
      };
    }
  };

  G.register(tug);
})();
