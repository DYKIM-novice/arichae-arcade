/* 아리채 오락실 · 공룡 발걸음 (박자)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { HEX, shape, el, center, ilBtn, msgPop, retrigger, durOf } = G.kit;

  const DINO_SVG = `<svg viewBox="0 0 120 100" aria-hidden="true">
    <path d="M10 60 Q24 52 40 56 L40 70 Q22 70 10 60 Z" fill="#4CC36B"/>
    <ellipse cx="56" cy="58" rx="24" ry="18" fill="#5BD47A"/>
    <path d="M66 46 Q70 26 84 22 L100 22 Q110 24 110 34 Q110 44 98 44 L84 46 Q78 50 74 56 Z" fill="#5BD47A"/>
    <circle cx="96" cy="31" r="4" fill="#1C1733"/><circle cx="97.4" cy="29.6" r="1.4" fill="#fff"/>
    <path d="M100 40 L108 40" stroke="#1C1733" stroke-width="2" stroke-linecap="round"/>
    <path d="M40 42 L46 34 L50 42 L56 33 L60 41 L66 34 L68 42" fill="#FFD23F"/>
    <ellipse cx="56" cy="64" rx="14" ry="9" fill="#B9F2C6"/>
    <rect x="70" y="56" width="10" height="5" rx="2.5" fill="#4CC36B" transform="rotate(30 70 56)"/>
    <g class="dn-leg l"><rect x="44" y="70" width="10" height="20" rx="4" fill="#4CC36B"/><rect x="42" y="86" width="15" height="6" rx="3" fill="#3BA85A"/></g>
    <g class="dn-leg r"><rect x="60" y="70" width="10" height="20" rx="4" fill="#3BA85A"/><rect x="58" y="86" width="15" height="6" rx="3" fill="#2E9149"/></g></svg>`;

  const dino = {
    id: 'dino', title: '공룡 발걸음', cat: '박자', catColor: 'y', buttons: ['r', 'b'], music: false, pressSound: false,
    rules: ['동그라미 색이 눌러야 할 발(빨강·파랑)이에요', '동그라미가 가운데 노란 PERFECT 칸에 왔을 때 쿵!', '점점 빨라져요!'],
    illus() {
      return `<div class="il-row il-race"><div style="width:90px">${DINO_SVG}</div>${ilBtn('r', '왼발')}${ilBtn('b', '오른발')}</div>`;
    },
    create(ctx) {
      const D = durOf(ctx);
      const beats = [];
      let bt = 1300;
      let k = 0;
      while (bt < D - 300) {
        beats.push(bt);
        bt += Math.max(360, 640 - k * 8);
        k++;
      }
      const used = new Set();
      const usedFoot = {};
      let t0 = 0;
      let lastFoot = null;
      let dist = 0;
      let combo = 0;
      let maxCombo = 0;
      let scroll = 0;
      let lastBeatIdx = -1;
      let checkIdx = 0;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="dn-wrap"><div class="dn-msg disp"></div>
        <div class="dn-track"><div class="dn-zone ok"></div><div class="dn-zone good"></div><div class="dn-zone perf"><span>PERFECT</span></div><div class="dn-center"></div><div class="dn-dots"></div></div>
        <div class="dn-next"></div>
        <div class="dn-world"><div class="dn-hills"></div><div class="dn-ground"></div><div class="dn-dino">${DINO_SVG}</div></div>
        <div class="dn-info"><b class="disp">0.0m</b></div></div>`);
      ctx.stage.appendChild(wrap);
      const dots = wrap.querySelector('.dn-dots');
      const track = wrap.querySelector('.dn-track');
      const msg = wrap.querySelector('.dn-msg');
      const ground = wrap.querySelector('.dn-ground');
      const hills = wrap.querySelector('.dn-hills');
      const dinoEl = wrap.querySelector('.dn-dino');
      const infoB = wrap.querySelector('.dn-info b');
      const nextEl = wrap.querySelector('.dn-next');
      const centerEl = wrap.querySelector('.dn-center');
      const zones = { perf: wrap.querySelector('.dn-zone.perf'), good: wrap.querySelector('.dn-zone.good'), ok: wrap.querySelector('.dn-zone.ok') };
      let lastW = 0;
      const dotEls = [];

      function nextFootLabel() {
        const f = lastFoot === 'r' ? 'b' : 'r';
        nextEl.innerHTML = `다음: <span style="background:${HEX[f]}">${shape(f, 14)}</span> ${f === 'r' ? '왼발' : '오른발'}`;
      }
      function step(meters, foot) {
        dist += meters;
        scroll += meters * 26;
        infoB.textContent = dist.toFixed(1) + 'm';
        dinoEl.classList.remove('step-l', 'step-r');
        void dinoEl.offsetWidth;
        dinoEl.classList.add(foot === 'r' ? 'step-l' : 'step-r');
        ctx.setScore(Math.round(dist * 10));
      }

      return {
        start(t) { t0 = t; nextFootLabel(); msgPop(msg, '쿵 소리에 맞춰요', '#C9C3E6'); },
        tick(t) {
          const e = t - t0;
          // 박자음
          let bi = lastBeatIdx;
          while (bi + 1 < beats.length && beats[bi + 1] <= e) bi++;
          if (bi !== lastBeatIdx) {
            lastBeatIdx = bi;
            ctx.sfx.kick(bi % 4 === 0);
            retrigger(track, 'pulse');
          }
          // 놓친 박자 → 콤보 끊김
          while (checkIdx < beats.length && beats[checkIdx] < e - 220) {
            if (!used.has(checkIdx) && combo > 0) { combo = 0; ctx.setBadge(null); }
            checkIdx++;
          }
          // 다가오는 박자 점
          const W = track.clientWidth;
          const cx = W / 2;
          const VIEW = 1000;   // 1초 앞의 박자까지 보여줘요 (판정 구역이 넓게 보이도록)
          const pxPerMs = (W / 2 - 14) / VIEW;
          // 판정 구역: PERFECT ±70ms, GOOD ±140ms, OK ±200ms
          if (W !== lastW) {
            lastW = W;
            zones.perf.style.width = (140 * pxPerMs) + 'px';
            zones.good.style.width = (280 * pxPerMs) + 'px';
            zones.ok.style.width = (400 * pxPerMs) + 'px';
          }
          let n = 0;
          // 아직 안 밟은 박자는 번갈아 나올 발 색으로 미리 보여줘요 (다음 발 = 마지막 발의 반대)
          let expect = lastFoot === 'r' ? 'b' : 'r';
          for (let i = Math.max(0, checkIdx - 1); i < beats.length && beats[i] - e < VIEW; i++) {
            if (!dotEls[n]) { dotEls[n] = el('<i></i>'); dots.appendChild(dotEls[n]); }
            const d = dotEls[n];
            const off = (beats[i] - e) * pxPerMs;
            d.style.transform = `translateX(${cx + off}px)`;
            let foot;
            if (used.has(i)) foot = usedFoot[i];
            else if (beats[i] < e - 200) foot = null;
            else { foot = expect; expect = expect === 'r' ? 'b' : 'r'; }
            d.className = (used.has(i) ? 'done ' : '') + (i % 4 === 0 ? 'acc ' : '') + (foot ? 'f-' + foot : 'gone');
            d.style.display = '';
            n++;
          }
          centerEl.className = 'dn-center f-' + (lastFoot === 'r' ? 'b' : 'r');
          for (let j = n; j < dotEls.length; j++) dotEls[j].style.display = 'none';
          ground.style.backgroundPositionX = (-scroll) + 'px';
          hills.style.backgroundPositionX = (-scroll * 0.3) + 'px';
        },
        onPress(c, t) {
          const e = t - t0;
          let bi = -1;
          let bd = Infinity;
          for (let i = Math.max(0, checkIdx - 2); i < beats.length && beats[i] < e + 400; i++) {
            const d = Math.abs(e - beats[i]);
            if (d < bd) { bd = d; bi = i; }
          }
          if (bi < 0 || bd > 200 || used.has(bi)) {
            combo = 0;
            msgPop(msg, '엇박!', '#FF8B95');
            ctx.sfx.soft();
            ctx.vibrate(30);
            ctx.setBadge(null);
            return;
          }
          used.add(bi);
          usedFoot[bi] = c;
          if (c === lastFoot) {
            combo = 0;
            step(0.5, c);
            msgPop(msg, '발이 꼬였어요', '#FF8B95');
            ctx.sfx.soft();
            ctx.setBadge(null);
            nextFootLabel();
            return;
          }
          lastFoot = c;
          combo++;
          maxCombo = Math.max(maxCombo, combo);
          let m;
          if (bd < 70) { m = 3; msgPop(msg, 'PERFECT', '#FFD23F'); ctx.vibrate([12, 20, 12]); }
          else if (bd < 140) { m = 2; msgPop(msg, 'GOOD', '#7DF0AE'); ctx.vibrate(10); }
          else { m = 1; msgPop(msg, 'OK', '#A9C4FF'); }
          if (combo >= 10) m += 0.5;
          step(m, c);
          ctx.sfx.bonk();
          ctx.setBadge(combo >= 4 ? `${combo} 콤보` : null, 'y');
          nextFootLabel();
        },
        end() {},
        score: () => Math.round(dist * 10),
        value: () => dist,
        summary: () => `${dist.toFixed(1)}m · 최대 ${maxCombo}콤보`
      };
    }
  };

  G.register(dino);
})();
