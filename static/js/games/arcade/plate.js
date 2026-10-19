/* 아리채 오락실 · 접시 깨기 (타이밍)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, LIGHT, el, center, IDX, msgPop, retrigger, durOf } = G.kit;

  const PLATE_SVG = '<svg viewBox="0 0 60 24" aria-hidden="true"><ellipse cx="30" cy="12" rx="29" ry="11" fill="#FF8A3D"/><ellipse cx="30" cy="10" rx="20" ry="6" fill="#FFB27A"/><ellipse cx="30" cy="12" rx="29" ry="11" fill="none" stroke="#B85A1C" stroke-width="2"/></svg>';

  const plate = {
    id: 'plate', title: '접시 깨기', cat: '타이밍', catColor: 'r', buttons: ['r', 'g', 'b'],
    rules: ['접시가 날아올라 과녁에 닿으면 그 줄 버튼!', '가장 높이 떴을 때가 퍼펙트', '접시 없을 때 쏘면 헛방 -5'],
    illus() {
      return `<div class="il-row" style="gap:20px">${COLS.map((c, i) => `<div class="il-btn"><div class="il-target" style="border-color:${HEX[c]}">${i === 1 ? `<div style="width:46px">${PLATE_SVG}</div>` : ''}</div><span style="color:${LIGHT[c]}">${['왼쪽', '가운데', '오른쪽'][i]}</span></div>`).join('')}</div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const D = durOf(ctx);
      const plates = [];
      let tt = 900;
      while (tt < D - 1500) {
        const prog = tt / D;
        const flight = 1750 - prog * 550;
        const lane = Math.floor(R() * 3);
        plates.push({ at: tt, lane, flight });
        if (prog > 0.35 && R() < 0.22) plates.push({ at: tt + 120, lane: (lane + 1 + Math.floor(R() * 2)) % 3, flight });
        tt += 1150 - prog * 500 + R() * 300;
      }
      plates.forEach((p) => { p.state = 'wait'; p.el = null; p.apex = p.at + p.flight / 2; });
      let t0 = 0;
      let ptr = 0;
      let score = 0;
      let hits = 0;
      let perfect = 0;
      let W = 300;
      let H = 400;
      let apexY = 120;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="pl-wrap"><div class="pl-msg disp"></div>
        ${COLS.map((c, i) => `<div class="pl-target" data-i="${i}" style="--c:${HEX[c]}"><i></i></div>`).join('')}
        <div class="pl-grass"></div><div class="pl-info">깨뜨린 접시 <b>0</b>개</div></div>`);
      ctx.stage.appendChild(wrap);
      const targets = Array.from(wrap.querySelectorAll('.pl-target'));
      const msg = wrap.querySelector('.pl-msg');
      const info = wrap.querySelector('.pl-info');
      const laneX = (i) => W * (0.2 + i * 0.3);

      return {
        start(t) {
          t0 = t;
          W = wrap.clientWidth;
          H = wrap.clientHeight;
          apexY = Math.max(90, H * 0.28);
          targets.forEach((tg, i) => {
            tg.style.left = laneX(i) + 'px';
            tg.style.top = apexY + 'px';
          });
        },
        tick(t) {
          const e = t - t0;
          while (ptr < plates.length && plates[ptr].at <= e) {
            const p = plates[ptr++];
            p.el = el(`<div class="pl-plate">${PLATE_SVG}</div>`);
            wrap.appendChild(p.el);
          }
          const groundY = H + 30;
          for (let i = 0; i < ptr; i++) {
            const p = plates[i];
            if (p.state !== 'wait' || !p.el) continue;
            const q = (e - p.at) / p.flight;
            if (q >= 1) {
              p.state = 'gone';
              p.el.remove();
              p.el = null;
              continue;
            }
            const y = groundY - 4 * (groundY - apexY) * q * (1 - q);
            const x = laneX(p.lane) + (q - 0.5) * 24;
            p.el.style.transform = `translate(${x - 30}px, ${y - 12}px) rotate(${(q - 0.5) * 50}deg)`;
          }
        },
        onPress(c, t) {
          const e = t - t0;
          const lane = IDX[c];
          retrigger(targets[lane], 'shot');
          let best = null;
          for (let i = 0; i < ptr; i++) {
            const p = plates[i];
            if (p.state !== 'wait' || p.lane !== lane || !p.el) continue;
            const d = Math.abs(e - p.apex);
            if (d < 260 && (!best || d < Math.abs(e - best.apex))) best = p;
          }
          const tp = center(ctx, targets[lane]);
          if (!best) {
            score = Math.max(0, score - 5);
            ctx.setScore(score);
            ctx.fx.float('헛방 -5', tp.x, tp.y - 50, '#FF8B95', 22);
            ctx.sfx.soft();
            return;
          }
          const d = Math.abs(e - best.apex);
          const pp = center(ctx, best.el);
          best.state = 'hit';
          best.el.remove();
          best.el = null;
          let gain;
          if (d < 70) { gain = 100; perfect++; msgPop(msg, 'PERFECT!', '#FFD23F'); ctx.vibrate([15, 25, 15]); }
          else if (d < 150) { gain = 60; msgPop(msg, 'GOOD', '#7DF0AE'); ctx.vibrate(12); }
          else { gain = 30; msgPop(msg, 'OK', '#A9C4FF'); ctx.vibrate(8); }
          score += gain;
          hits++;
          ctx.setScore(score);
          ctx.fx.burst(pp.x, pp.y, '#FF8A3D', d < 70 ? 22 : 14);
          ctx.fx.float('+' + gain, pp.x, pp.y - 30, '#FFD23F', 28);
          ctx.sfx.crack();
          info.innerHTML = `깨뜨린 접시 <b>${hits}</b>개`;
          ctx.setBadge(perfect ? `퍼펙트 ${perfect}` : null, 'r');
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${hits}개 깨뜨림 · 퍼펙트 ${perfect}개`
      };
    }
  };

  G.register(plate);
})();
