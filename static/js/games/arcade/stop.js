/* 아리채 오락실 · 딱 멈춰 (타이밍)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, LIGHT, KNAME, shape, el, center } = G.kit;

  const stop = {
    id: 'stop',
    title: '딱 멈춰',
    cat: '타이밍',
    catColor: 'y',
    buttons: ['r', 'g', 'b'],
    rules: ['바늘이 색 구역에 들어오면 그 색 버튼!', '구역 한가운데일수록 높은 점수', '다른 색이나 빗나가면 잠깐 멈춰요'],
    illus() {
      return `<div class="il-gauge"><div class="il-track"><div class="il-zone" style="left:52%;width:22%;background:${HEX.b}">${shape('b', 16)}</div><div class="il-needle" style="left:61%"></div></div>
        <div class="il-cap"><span style="color:${LIGHT.b}">파랑 구역</span>에 바늘이 오면 <span style="color:${LIGHT.b}">파랑</span> 버튼</div></div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      let round = 0;
      let pos = 0;
      let dir = 1;
      let speed = 0.6;
      let zone = { c: 'r', center: 0.5, w: 0.2 };
      let running = false;
      let pauseUntil = 0;
      let score = 0;
      let perfects = 0;
      let streak = 0;
      let lastT = 0;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="st-wrap">
        <div class="st-round">라운드 <b>1</b></div>
        <div class="st-msg"></div>
        <div class="st-track"><div class="st-zone"><div class="st-core"></div><span class="st-icon"></span></div><div class="st-needle"><i></i></div></div>
        <div class="st-scale"><span>0</span><span>퍼펙트 100 · 좋아요 60</span><span>100</span></div>
        <div class="st-hist"></div></div>`);
      ctx.stage.appendChild(wrap);
      const zoneEl = wrap.querySelector('.st-zone');
      const iconEl = wrap.querySelector('.st-icon');
      const needle = wrap.querySelector('.st-needle');
      const roundEl = wrap.querySelector('.st-round b');
      const msgEl = wrap.querySelector('.st-msg');
      const histEl = wrap.querySelector('.st-hist');
      const track = wrap.querySelector('.st-track');

      function newRound() {
        round++;
        const w = Math.max(0.1, 0.24 - round * 0.012);
        const c = COLS[Math.floor(R() * 3)];
        const cen = w / 2 + 0.04 + R() * (0.92 - w);
        const startPos = R() < 0.5 ? 0 : 1;
        zone = { c, center: cen, w };
        speed = Math.min(1.7, 0.6 + round * 0.08);
        pos = startPos;
        dir = startPos === 0 ? 1 : -1;
        zoneEl.style.left = ((cen - w / 2) * 100) + '%';
        zoneEl.style.width = (w * 100) + '%';
        zoneEl.style.background = HEX[c];
        zoneEl.style.boxShadow = `inset 0 4px 0 rgba(255,255,255,.3), 0 0 22px ${HEX[c]}88`;
        iconEl.innerHTML = shape(c, 18);
        roundEl.textContent = round;
        zoneEl.classList.remove('flash');
        running = true;
      }

      function addHist(label, cls) {
        const chip = el(`<span class="${cls}">${label}</span>`);
        histEl.prepend(chip);
        while (histEl.children.length > 6) histEl.lastElementChild.remove();
      }

      function showMsg(text, color) {
        msgEl.textContent = text;
        msgEl.style.color = color;
        msgEl.classList.remove('show');
        void msgEl.offsetWidth;
        msgEl.classList.add('show');
      }

      return {
        start(t) { lastT = t; newRound(); },
        tick(t) {
          const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
          lastT = t;
          if (running) {
            pos += dir * speed * dt;
            if (pos > 1) { pos = 1; dir = -1; }
            if (pos < 0) { pos = 0; dir = 1; }
          } else if (pauseUntil && t >= pauseUntil) {
            pauseUntil = 0;
            newRound();
          }
          needle.style.left = (pos * 100) + '%';
        },
        onPress(c, t) {
          if (!running) return;
          running = false;
          const d = Math.abs(pos - zone.center);
          const half = zone.w / 2;
          const pt = center(ctx, needle);
          if (c !== zone.c) {
            streak = 0;
            showMsg(KNAME[zone.c] + ' 구역이었어요', '#FF8B95');
            addHist('X', 'miss');
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([40, 30, 40]);
            ctx.lock(800);
            pauseUntil = t + 800;
          } else if (d <= half * 0.3) {
            streak++;
            perfects++;
            const gain = 100 + Math.min(50, (streak - 1) * 10);
            score += gain;
            showMsg('퍼펙트! +' + gain, '#FFD23F');
            addHist('P', 'perfect');
            zoneEl.classList.add('flash');
            ctx.fx.burst(pt.x, pt.y, '#FFD23F', 18);
            ctx.sfx.perfect();
            ctx.vibrate([15, 25, 15]);
            pauseUntil = t + 550;
          } else if (d <= half) {
            streak = 0;
            const gain = 40 + Math.round(30 * (1 - d / half));
            score += gain;
            showMsg('좋아요! +' + gain, LIGHT[zone.c]);
            addHist('G', 'good');
            ctx.fx.burst(pt.x, pt.y, HEX[zone.c], 10);
            ctx.sfx.good();
            ctx.vibrate(12);
            pauseUntil = t + 550;
          } else {
            streak = 0;
            showMsg('빗나감', '#FF8B95');
            addHist('X', 'miss');
            ctx.sfx.bad();
            ctx.vibrate([40, 30, 40]);
            ctx.lock(700);
            pauseUntil = t + 700;
          }
          track.classList.remove('hit');
          void track.offsetWidth;
          track.classList.add('hit');
          ctx.setScore(score);
          ctx.setBadge(streak >= 2 ? streak + '연속' : null, 'y');
        },
        end() { running = false; },
        score: () => score,
        value: () => score,
        summary: () => `퍼펙트 ${perfects}번 · ${round}라운드`
      };
    }
  };

  G.register(stop);
})();
