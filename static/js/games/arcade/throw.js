/* 아리채 오락실 · 투척왕 (연타 + 타이밍, 누르고 떼기)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { el, center, clamp, ARROW, ilBtn, msgPop, retrigger } = G.kit;
  const A = window.Animals;

  const throwG = {
    id: 'throw', title: '투척왕', cat: '연타+타이밍', catColor: 'r', buttons: ['r', 'g', 'b'], pressSound: false,
    rules: ['빨강·파랑 번갈아 연타로 힘을 모아요', '초록을 누르고 있으면 각도가 올라가요', '45도 근처에서 떼면 가장 멀리 날아가요'],
    illus() {
      return `<div class="il-row il-race">${ilBtn('r', '연타')}${ilBtn('b', '연타')}${ARROW}${ilBtn('g', '눌렀다 떼기')}</div>`;
    },
    create(ctx) {
      let state = 'run';
      let power = 0;
      let last = null;
      let angle = 5;
      let angDir = 1;
      let aimStart = 0;
      let flyStart = 0;
      let flyDist = 0;
      let flyAngle = 45;
      let resultUntil = 0;
      let lastT = 0;
      let total = 0;
      let best = 0;
      let throws = 0;
      const me = ctx.players.find((p) => p.pid === ctx.myPid) || { animal: 'bear' };

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="tw-wrap">
        <div class="tw-field"><div class="tw-ground"></div><div class="tw-marks"></div><div class="tw-flags"></div>
          <div class="tw-thrower">${A.svg(me.animal)}</div><div class="tw-ball"></div><div class="tw-land disp"></div></div>
        <div class="tw-panel">
          <div class="tw-msg disp">빨강·파랑 연타!</div>
          <div class="tw-row">
            <div class="tw-gauge"><span>힘</span><div class="tw-power"><i></i></div></div>
            <div class="tw-dial"><svg viewBox="0 0 120 70" aria-hidden="true">
              <path d="M10 60 A50 50 0 0 1 60 10" fill="none" stroke="#3D3670" stroke-width="10" stroke-linecap="round"/>
              <path class="tw-sweet" fill="none" stroke="#FFD23F" stroke-width="10" stroke-linecap="round"/>
              <line class="tw-needle" x1="10" y1="60" x2="62" y2="60" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
              <circle cx="10" cy="60" r="6" fill="#fff"/></svg><b class="disp">0°</b></div>
          </div>
          <div class="tw-info">최고 <b>0.0m</b> · 합계 <b>0.0m</b></div>
        </div></div>`);
      ctx.stage.appendChild(wrap);
      const field = wrap.querySelector('.tw-field');
      const ball = wrap.querySelector('.tw-ball');
      const land = wrap.querySelector('.tw-land');
      const flags = wrap.querySelector('.tw-flags');
      const marks = wrap.querySelector('.tw-marks');
      const msg = wrap.querySelector('.tw-msg');
      const powerFill = wrap.querySelector('.tw-power i');
      const needle = wrap.querySelector('.tw-needle');
      const angText = wrap.querySelector('.tw-dial b');
      const info = wrap.querySelector('.tw-info');
      const thrower = wrap.querySelector('.tw-thrower');

      // 45도 ±10도 영역 표시
      const pt = (deg) => [10 + 50 * Math.cos(deg * Math.PI / 180), 60 - 50 * Math.sin(deg * Math.PI / 180)];
      const [sx, sy] = pt(35);
      const [ex, ey] = pt(55);
      wrap.querySelector('.tw-sweet').setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} A50 50 0 0 0 ${ex.toFixed(1)} ${ey.toFixed(1)}`);

      let FW = 300;
      let FH = 200;
      const X0 = 46;
      const scale = () => (FW - X0 - 18) / 100;
      const groundY = () => FH - 26;

      function layoutField() {
        FW = field.clientWidth;
        FH = field.clientHeight;
        marks.innerHTML = [20, 40, 60, 80, 100].map((m) =>
          `<span style="left:${X0 + m * scale()}px">${m}m</span>`).join('');
        resetBall();
      }
      function resetBall() {
        ball.style.transform = `translate(${X0 + 6}px, ${groundY() - 34}px)`;
        ball.style.opacity = '1';
      }
      function setInfo() {
        info.innerHTML = `${throws + 1}번째 · 최고 <b>${best.toFixed(1)}m</b> · 합계 <b>${total.toFixed(1)}m</b>`;
      }

      function release(t) {
        if (state !== 'aim') return;
        flyAngle = angle;
        const rad = flyAngle * Math.PI / 180;
        flyDist = Math.pow(power / 10, 2) * 100 * Math.sin(2 * rad);
        flyDist = Math.max(0.5, flyDist);
        state = 'fly';
        flyStart = t;
        msgPop(msg, `${Math.round(flyAngle)}°로 던졌다!`, '#FFE27A');
        thrower.classList.add('throw');
        ctx.sfx.swish();
        ctx.vibrate(30);
      }

      return {
        start(t) { lastT = t; layoutField(); setInfo(); },
        tick(t) {
          const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
          lastT = t;
          if (state === 'run') {
            power = Math.max(0, power - dt * 2.2);
          } else if (state === 'aim') {
            angle += angDir * 70 * dt;
            if (angle >= 90) { angle = 90; angDir = -1; }
            if (angle <= 0) { angle = 0; angDir = 1; }
            if (t - aimStart > 2600) release(t);
          } else if (state === 'fly') {
            const p = Math.min(1, (t - flyStart) / 1100);
            const rad = flyAngle * Math.PI / 180;
            const dpx = flyDist * scale();
            const h = clamp(dpx * Math.tan(rad) / 4, 16, FH - 60);
            const x = X0 + 6 + dpx * p;
            const y = groundY() - 34 - 4 * h * p * (1 - p);
            ball.style.transform = `translate(${x}px, ${y}px) rotate(${p * 720}deg)`;
            if (p >= 1) {
              throws++;
              total += flyDist;
              best = Math.max(best, flyDist);
              ctx.setScore(Math.round(total * 10));
              land.textContent = flyDist.toFixed(1) + 'm';
              land.style.left = Math.min(FW - 40, x) + 'px';
              retrigger(land, 'show');
              const flag = el(`<i style="left:${X0 + flyDist * scale()}px"></i>`);
              flags.appendChild(flag);
              const good = flyDist >= 70;
              msgPop(msg, good ? '대단해요!' : flyDist >= 40 ? '좋아요!' : '아쉬워요', good ? '#FFD23F' : '#F6F3FF');
              const c = center(ctx, ball);
              ctx.fx.burst(c.x, c.y, '#FFD23F', good ? 20 : 10);
              if (good) ctx.sfx.perfect(); else ctx.sfx.good();
              ctx.setBadge(`${throws}회 투척`, 'y');
              state = 'result';
              resultUntil = t + 1000;
            }
          } else if (state === 'result' && t >= resultUntil) {
            state = 'run';
            power = 0;
            angle = 5;
            angDir = 1;
            last = null;
            thrower.classList.remove('throw');
            resetBall();
            setInfo();
            msgPop(msg, '다시 연타!', '#F6F3FF');
          }
          powerFill.style.width = (power * 10) + '%';
          powerFill.style.background = power > 8 ? '#FF4757' : power > 5 ? '#FFD23F' : '#2ED573';
          needle.setAttribute('transform', `rotate(${-angle} 10 60)`);
          angText.textContent = Math.round(angle) + '°';
        },
        onPress(c, t) {
          if (state === 'run') {
            if (c === 'g') {
              if (power < 1) { msgPop(msg, '먼저 힘을 모아요', '#FF8B95'); return; }
              state = 'aim';
              aimStart = t;
              angle = 0;
              angDir = 1;
              msgPop(msg, '각도 올리는 중… 떼면 던져요', '#7DF0AE');
              return;
            }
            if (c === last) { msgPop(msg, '번갈아 눌러요!', '#FF8B95'); return; }
            last = c;
            power = Math.min(10, power + 0.75);
            ctx.sfx.step();
            ctx.vibrate(5);
          }
        },
        onRelease(c, t) { if (c === 'g') release(t); },
        end() {},
        score: () => Math.round(total * 10),
        value: () => total,
        summary: () => `${throws}번 던짐 · 최고 ${best.toFixed(1)}m`
      };
    }
  };

  G.register(throwG);
})();
