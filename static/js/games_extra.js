/* 아리채 오락실 - 추가 미니게임 13종
   모든 게임은 서버가 준 같은 시드로 같은 문제가 나오도록 만들어 공정하게 동시 진행됩니다. */
(function () {
  'use strict';

  const G = window.Games;
  const A = window.Animals;
  const { rng, el, center, shape, HEX, SHADE, LIGHT, COLS, KNAME } = G;
  const esc = G.esc;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const IDX = { r: 0, g: 1, b: 2 };
  const SHAPE_NAME = { r: '동그라미', g: '세모', b: '네모' };
  const FILLED = {
    r: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10" fill="${c}" stroke="#fff" stroke-width="2"/></svg>`,
    g: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2.5 L22.5 21 L1.5 21 Z" fill="${c}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`,
    b: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="${c}" stroke="#fff" stroke-width="2"/></svg>`
  };
  const ARROW = '<svg width="40" height="36" viewBox="0 0 64 40" fill="none" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 H54"/><path d="M42 8 L56 20 L42 32"/></svg>';

  function gbtn(c, size) {
    return `<div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, size || 24)}</div></div>`;
  }
  function ilBtn(c, label) {
    return `<div class="il-btn">${gbtn(c)}<span style="color:${LIGHT[c]}">${label}</span></div>`;
  }
  function msgPop(node, text, color) {
    node.textContent = text;
    node.style.color = color || '#F6F3FF';
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');
  }
  function retrigger(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }
  function chipTo(box, text, cls, max) {
    const e = el(`<span class="${cls}">${text}</span>`);
    box.prepend(e);
    while (box.children.length > (max || 6)) box.lastElementChild.remove();
  }
  function durOf(ctx) { return Math.max(5000, ctx.endAt - ctx.startAt); }

  /* ================================================================
     5. 투척왕 (연타 + 타이밍, 누르고 떼기)
     ================================================================ */
  const throwG = {
    id: 'throw', title: '투척왕', cat: '연타+타이밍', catColor: 'r', dur: 35,
    buttons: ['r', 'g', 'b'], pressSound: false,
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

  /* ================================================================
     6. 따라 누르기 (기억력)
     ================================================================ */
  const simon = {
    id: 'simon', title: '따라 누르기', cat: '기억력', catColor: 'b', dur: 35,
    buttons: ['r', 'g', 'b'],
    rules: ['불이 깜빡인 순서를 잘 기억해요', '같은 순서대로 버튼을 눌러요', '성공할 때마다 하나씩 길어져요'],
    illus() {
      return `<div class="il-row">${['r', 'b', 'b', 'g'].map((c, i) => `<div class="il-lamp" style="width:56px;height:56px;background:${HEX[c]};box-shadow:0 0 18px ${HEX[c]};opacity:${1 - i * 0.15}">${shape(c, 22)}</div>`).join('')}</div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const seq = Array.from({ length: 40 }, () => COLS[Math.floor(R() * 3)]);
      let level = 3;
      let best = 0;
      let state = 'wait';
      let nextAt = 0;
      let showStart = 0;
      let lit = -1;
      let inputIdx = 0;
      let score = 0;
      let litOffAt = 0;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="sm-wrap">
        <div class="sm-level">레벨 <b class="disp">3</b></div>
        <div class="sm-msg disp">잘 보세요!</div>
        <div class="sm-lamps">${COLS.map((c) => `<div class="sm-lamp" data-c="${c}" style="--c:${HEX[c]}">${shape(c, 40)}</div>`).join('')}</div>
        <div class="sm-dots"></div></div>`);
      ctx.stage.appendChild(wrap);
      const lamps = {};
      wrap.querySelectorAll('.sm-lamp').forEach((l) => { lamps[l.dataset.c] = l; });
      const msg = wrap.querySelector('.sm-msg');
      const dots = wrap.querySelector('.sm-dots');
      const lvl = wrap.querySelector('.sm-level b');

      const dur = () => Math.max(260, 520 - level * 20);
      const gap = () => Math.max(110, 190 - level * 6);

      function lightOnly(c) {
        COLS.forEach((k) => lamps[k].classList.toggle('on', k === c));
      }
      function drawDots() {
        dots.innerHTML = Array.from({ length: level }, (_, i) => `<i class="${i < inputIdx ? 'done' : ''}"></i>`).join('');
      }
      function beginShow(t) {
        state = 'show';
        showStart = t + 400;
        lit = -1;
        inputIdx = 0;
        lvl.textContent = level;
        drawDots();
        msgPop(msg, '잘 보세요!', '#C9C3E6');
      }

      return {
        start(t) { beginShow(t); },
        tick(t) {
          if (state === 'show') {
            const step = dur() + gap();
            const e = t - showStart;
            if (e < 0) { lightOnly(null); return; }
            const i = Math.floor(e / step);
            const inOn = (e % step) < dur();
            if (i >= level) {
              lightOnly(null);
              state = 'input';
              inputIdx = 0;
              drawDots();
              msgPop(msg, '따라 눌러요!', '#7DF0AE');
              return;
            }
            if (inOn) {
              lightOnly(seq[i]);
              if (lit !== i) { lit = i; ctx.sfx.note(seq[i]); }
            } else lightOnly(null);
          } else if (state === 'input') {
            if (litOffAt && t >= litOffAt) { lightOnly(null); litOffAt = 0; }
          } else if (state === 'wait' && t >= nextAt) {
            beginShow(t);
          }
        },
        onPress(c, t) {
          if (state !== 'input') return;
          lightOnly(c);
          litOffAt = t + 180;
          if (c === seq[inputIdx]) {
            inputIdx++;
            drawDots();
            if (inputIdx >= level) {
              const gain = level * 10;
              score += gain;
              best = Math.max(best, level);
              ctx.setScore(score);
              const p = center(ctx, msg);
              ctx.fx.burst(p.x, p.y + 60, '#FFD23F', 18);
              ctx.fx.float('+' + gain, p.x, p.y, '#FFD23F', 36);
              ctx.sfx.perfect();
              ctx.vibrate([15, 25, 15]);
              msgPop(msg, '정답!', '#FFD23F');
              level++;
              ctx.setBadge(`레벨 ${level}`, 'b');
              state = 'wait';
              nextAt = t + 800;
            }
          } else {
            msgPop(msg, '틀렸어요! 다시 볼게요', '#FF8B95');
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([40, 30, 40]);
            state = 'wait';
            nextAt = t + 1100;
          }
        },
        end() { lightOnly(null); },
        score: () => score,
        value: () => score,
        summary: () => `최고 레벨 ${best || '-'}`
      };
    }
  };

  /* ================================================================
     7. 풍선 불기 (연타 조절)
     ================================================================ */
  const balloon = {
    id: 'balloon', title: '풍선 불기', cat: '연타 조절', catColor: 'r', dur: 30,
    buttons: ['r', 'g', 'b'], pressSound: false,
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

  /* ================================================================
     8. 두더지 잡기 (반응)
     ================================================================ */
  const MOLE_SVG = {
    mole: '<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="62" rx="40" ry="44" fill="#9C6B45"/><ellipse cx="50" cy="74" rx="24" ry="20" fill="#E9C4A0"/><circle cx="36" cy="52" r="5" fill="#1C1733"/><circle cx="64" cy="52" r="5" fill="#1C1733"/><circle cx="37.5" cy="50.5" r="1.6" fill="#fff"/><circle cx="65.5" cy="50.5" r="1.6" fill="#fff"/><ellipse cx="50" cy="64" rx="8" ry="6" fill="#FF7FA0"/><path d="M44 74 Q50 79 56 74" stroke="#1C1733" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="45" y="76" width="4" height="6" rx="1" fill="#fff"/><rect x="51" y="76" width="4" height="6" rx="1" fill="#fff"/></svg>',
    gold: '<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="62" rx="40" ry="44" fill="#FFD23F"/><ellipse cx="50" cy="74" rx="24" ry="20" fill="#FFF0B3"/><path d="M30 20 L36 34 L44 22 L50 34 L56 22 L64 34 L70 20 L68 38 L32 38 Z" fill="#FF8A3D"/><circle cx="36" cy="52" r="5" fill="#1C1733"/><circle cx="64" cy="52" r="5" fill="#1C1733"/><ellipse cx="50" cy="64" rx="8" ry="6" fill="#FF7FA0"/><path d="M44 74 Q50 79 56 74" stroke="#1C1733" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
    bomb: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="62" r="34" fill="#2B2D42"/><circle cx="38" cy="50" r="8" fill="#fff" opacity=".25"/><rect x="42" y="22" width="16" height="12" rx="3" fill="#5A5675"/><path d="M50 22 Q56 10 66 12" stroke="#C9C3E6" stroke-width="3" fill="none"/><circle cx="68" cy="11" r="5" fill="#FF8A3D"/><circle cx="68" cy="11" r="2.5" fill="#FFD23F"/><path d="M38 66 L46 60 M62 66 L54 60" stroke="#FF4757" stroke-width="4" stroke-linecap="round"/></svg>'
  };

  const mole = {
    id: 'mole', title: '두더지 잡기', cat: '반응', catColor: 'g', dur: 30,
    buttons: ['r', 'g', 'b'],
    rules: ['왼쪽·가운데·오른쪽 구멍 = 빨강·초록·파랑', '두더지가 나오면 그 자리 버튼!', '황금 두더지는 +40, 폭탄은 누르면 -40'],
    illus() {
      return `<div class="il-row" style="gap:18px">${['mole', 'gold', 'bomb'].map((k, i) =>
        `<div class="il-btn"><div style="width:62px;height:62px">${MOLE_SVG[k]}</div><span style="color:${LIGHT[COLS[i]]}">${k === 'mole' ? '때리기' : k === 'gold' ? '+40' : '참기'}</span></div>`).join('')}</div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const D = durOf(ctx);
      const events = [];
      let tt = 900;
      while (tt < D - 600) {
        const prog = tt / D;
        const roll = R();
        events.push({
          at: tt,
          hole: Math.floor(R() * 3),
          type: roll < 0.1 ? 'gold' : roll < 0.24 ? 'bomb' : 'mole',
          up: 1000 - prog * 420
        });
        tt += 820 - prog * 380 + R() * 260;
      }
      let ptr = 0;
      let t0 = 0;
      let score = 0;
      let hits = 0;
      const holes = [null, null, null];

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="ml-wrap"><div class="ml-msg disp"></div><div class="ml-holes">${COLS.map((c) =>
        `<div class="ml-hole"><div class="ml-pit"><div class="ml-mole"></div></div><div class="ml-rim"></div><div class="ml-tag" style="background:${HEX[c]}">${shape(c, 16)}</div></div>`).join('')}</div>
        <div class="ml-info">잡은 두더지 <b>0</b>마리</div></div>`);
      ctx.stage.appendChild(wrap);
      const moleEls = Array.from(wrap.querySelectorAll('.ml-mole'));
      const holeEls = Array.from(wrap.querySelectorAll('.ml-hole'));
      const msg = wrap.querySelector('.ml-msg');
      const info = wrap.querySelector('.ml-info');

      function down(h) {
        // 'hit'(납작) 상태까지 같이 지워서 구멍 속으로 완전히 들어가게
        moleEls[h].className = 'ml-mole';
        holes[h] = null;
      }

      return {
        start(t) { t0 = t; },
        tick(t) {
          const e = t - t0;
          while (ptr < events.length && events[ptr].at <= e) {
            const ev = events[ptr++];
            if (holes[ev.hole]) continue;
            holes[ev.hole] = { ev, upAt: e, hit: false };
            const m = moleEls[ev.hole];
            m.innerHTML = MOLE_SVG[ev.type];
            m.className = 'ml-mole up ' + ev.type;
          }
          holes.forEach((h, i) => {
            if (h && !h.hit && e - h.upAt > h.ev.up) {
              if (h.ev.type === 'bomb') {
                score += 10;
                ctx.setScore(score);
                msgPop(msg, '폭탄 잘 피했어요 +10', '#7DF0AE');
              }
              down(i);
            }
          });
        },
        onPress(c, t) {
          const e = t - t0;
          const i = IDX[c];
          const h = holes[i];
          const p = center(ctx, holeEls[i]);
          if (!h || h.hit) {
            score = Math.max(0, score - 5);
            ctx.setScore(score);
            ctx.fx.float('헛방 -5', p.x, p.y - 40, '#FF8B95', 22);
            ctx.lock(250);
            return;
          }
          h.hit = true;
          const m = moleEls[i];
          if (h.ev.type === 'bomb') {
            score = Math.max(0, score - 40);
            ctx.fx.burst(p.x, p.y - 20, '#FF8A3D', 24);
            ctx.fx.shake();
            ctx.sfx.pop();
            ctx.vibrate([60, 30, 60]);
            ctx.lock(600);
            msgPop(msg, '폭탄! -40', '#FF8B95');
          } else {
            const quick = Math.max(0, Math.round(10 * (1 - (e - h.upAt) / h.ev.up)));
            const gain = h.ev.type === 'gold' ? 40 : 10 + quick;
            score += gain;
            hits++;
            ctx.fx.burst(p.x, p.y - 30, h.ev.type === 'gold' ? '#FFD23F' : HEX[c], h.ev.type === 'gold' ? 20 : 10);
            ctx.fx.float('+' + gain, p.x, p.y - 70, h.ev.type === 'gold' ? '#FFD23F' : LIGHT[c], 30);
            ctx.sfx.bonk();
            if (h.ev.type === 'gold') ctx.sfx.perfect();
            ctx.vibrate(12);
            info.innerHTML = `잡은 두더지 <b>${hits}</b>마리`;
          }
          m.classList.add('hit');
          ctx.setScore(score);
          setTimeout(() => { if (holes[i] === h) down(i); }, 220);
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${hits}마리 잡음`
      };
    }
  };

  /* ================================================================
     9. 줄다리기 (팀 연타)
     ================================================================ */
  const tug = {
    id: 'tug', title: '줄다리기', cat: '팀 연타', catColor: 'r', dur: 25,
    buttons: ['r', 'b'], pressSound: false,
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

  /* ================================================================
     10. 용접 이어붙이기 (누르고 떼기)
     ================================================================ */
  const weld = {
    id: 'weld', title: '용접 이어붙이기', cat: '누르고 떼기', catColor: 'y', dur: 35,
    buttons: ['r', 'g', 'b'], pressSound: false,
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

  /* ================================================================
     11. 크레인 낙하 (타이밍)
     ================================================================ */
  const crane = {
    id: 'crane', title: '크레인 낙하', cat: '타이밍', catColor: 'y', dur: 35,
    buttons: ['r', 'g', 'b'],
    rules: ['좌우로 움직이는 블록을 아무 버튼으로 떨어뜨려요', '아래 블록과 겹친 부분만 남아요', '속도는 그대로! 딱 맞추면 퍼펙트'],
    illus() {
      return `<div class="il-crane"><div class="ic-hook"></div><div class="ic-b top"></div><div class="ic-b" style="width:70%"></div><div class="ic-b" style="width:80%"></div><div class="ic-b" style="width:86%"></div></div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const BH = 30;
      const MIN_W = 16;
      const PAL = ['#3D7BFF', '#FF8A3D', '#2ED573', '#FF4757', '#B07BFF', '#3DD6D0'];
      let W = 300;
      let H = 400;
      let tower = [];
      let cur = null;
      let state = 'move';
      let dropStart = 0;
      let lastT = 0;
      let level = 0;
      let score = 0;
      let perfects = 0;
      let streak = 0;
      let viewBase = 0;
      const VISIBLE = () => Math.max(4, Math.floor((H - 150) / BH));

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="cr-wrap"><div class="cr-beam"></div><div class="cr-line"></div>
        <div class="cr-cur"></div><div class="cr-tower"></div><div class="cr-ground"></div>
        <div class="cr-msg disp"></div><div class="cr-floor disp">0층</div></div>`);
      ctx.stage.appendChild(wrap);
      const curEl = wrap.querySelector('.cr-cur');
      const towerEl = wrap.querySelector('.cr-tower');
      const line = wrap.querySelector('.cr-line');
      const msg = wrap.querySelector('.cr-msg');
      const floorEl = wrap.querySelector('.cr-floor');

      const craneY = 46;
      const baseY = () => H - 30;
      const slotY = (i) => baseY() - (i - viewBase + 1) * BH;

      function blockHTML(color) { return `<div class="cr-block" style="background:${color}"></div>`; }

      function layoutTower() {
        const vis = VISIBLE();
        viewBase = Math.max(0, tower.length - vis);
        Array.from(towerEl.children).forEach((b, i) => {
          const blk = tower[i];
          b.style.width = blk.w + 'px';
          b.style.transform = `translate(${blk.x}px, ${slotY(i)}px)`;
          b.style.opacity = i < viewBase - 1 ? '0' : '1';
        });
      }
      function addTowerBlock(blk) {
        tower.push(blk);
        const b = el(blockHTML(blk.color));
        b.style.width = blk.w + 'px';
        b.style.transform = `translate(${blk.x}px, ${slotY(tower.length - 1)}px)`;
        towerEl.appendChild(b);
        layoutTower();
      }
      function newBlock() {
        const top = tower[tower.length - 1];
        const w = top.w;
        if (w < MIN_W) {
          // 가장 좁은 블록까지 오면 더 이상 블록을 주지 않고 탑을 완성해요
          state = 'over';
          cur = null;
          curEl.innerHTML = '';
          line.style.height = '0px';
          msgPop(msg, `탑 완성! ${level}층`, '#FFD23F');
          ctx.sfx.fanfare();
          ctx.vibrate([30, 40, 80]);
          return;
        }
        const fromLeft = R() < 0.5;
        cur = {
          x: fromLeft ? 0 : W - w,
          w,
          dir: fromLeft ? 1 : -1,
          speed: W * 0.5,   // 속도는 끝까지 그대로 (정확도 게임)
          color: PAL[(tower.length) % PAL.length],
          y: craneY
        };
        curEl.innerHTML = blockHTML(cur.color);
        curEl.style.width = w + 'px';
        state = 'move';
      }
      function fallingPiece(x, w, y, color) {
        const p = el(`<div class="cr-fall">${blockHTML(color)}</div>`);
        p.style.width = w + 'px';
        p.style.transform = `translate(${x}px, ${y}px)`;
        wrap.appendChild(p);
        requestAnimationFrame(() => {
          p.style.transform = `translate(${x}px, ${H + 40}px) rotate(${x < W / 2 ? -40 : 40}deg)`;
          p.style.opacity = '0';
        });
        setTimeout(() => p.remove(), 900);
      }
      function resolve(t) {
        const top = tower[tower.length - 1];
        const left = Math.max(cur.x, top.x);
        const right = Math.min(cur.x + cur.w, top.x + top.w);
        const overlap = right - left;
        const yTop = slotY(tower.length);
        if (overlap <= 2) {
          streak = 0;
          fallingPiece(cur.x, cur.w, yTop, cur.color);
          msgPop(msg, '빗나갔어요!', '#FF8B95');
          ctx.sfx.bad();
          ctx.fx.shake();
          ctx.vibrate([40, 30, 40]);
          newBlock();
          return;
        }
        level++;
        let blk;
        let gain;
        if (Math.abs(cur.x - top.x) < 5) {
          perfects++;
          streak++;
          blk = { x: top.x, w: top.w, color: cur.color };
          gain = 50 + Math.min(50, (streak - 1) * 10);
          msgPop(msg, streak > 1 ? `퍼펙트 ${streak}연속!` : '퍼펙트!', '#FFD23F');
          ctx.sfx.perfect();
          ctx.vibrate([15, 25, 15]);
        } else {
          streak = 0;
          blk = { x: left, w: overlap, color: cur.color };
          gain = 20 + Math.round((overlap / top.w) * 20);
          if (cur.x < top.x) fallingPiece(cur.x, top.x - cur.x, yTop, cur.color);
          else fallingPiece(top.x + top.w, cur.x + cur.w - (top.x + top.w), yTop, cur.color);
          msgPop(msg, '+' + gain, '#7DF0AE');
          ctx.sfx.bonk();
          ctx.vibrate(15);
        }
        score += gain;
        ctx.setScore(score);
        addTowerBlock(blk);
        floorEl.textContent = level + '층';
        ctx.setBadge(`${level}층`, 'y');
        const p = { x: blk.x + blk.w / 2, y: slotY(tower.length - 1) };
        const off = ctx.stage.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        ctx.fx.burst(p.x + (wr.left - off.left), p.y + (wr.top - off.top), '#FFD23F', 8);
        newBlock();
      }

      return {
        start(t) {
          W = wrap.clientWidth;
          H = wrap.clientHeight;
          lastT = t;
          addTowerBlock({ x: W * 0.29, w: W * 0.42, color: '#5A5675' });
          newBlock();
          msgPop(msg, '아무 버튼이나 눌러 떨어뜨려요', '#C9C3E6');
        },
        tick(t) {
          const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000));
          lastT = t;
          if (!cur) return;
          if (state === 'move') {
            cur.x += cur.dir * cur.speed * dt;
            if (cur.x <= 0) { cur.x = 0; cur.dir = 1; }
            if (cur.x + cur.w >= W) { cur.x = W - cur.w; cur.dir = -1; }
            cur.y = craneY;
          } else if (state === 'drop') {
            const p = Math.min(1, (t - dropStart) / 240);
            cur.y = craneY + (slotY(tower.length) - craneY) * p * p;
            if (p >= 1) resolve(t);
          }
          if (!cur) return;
          curEl.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
          line.style.left = (cur.x + cur.w / 2) + 'px';
          line.style.height = state === 'move' ? (craneY - 18) + 'px' : '0px';
        },
        onPress(c, t) {
          if (state !== 'move' || !cur) return;
          state = 'drop';
          dropStart = t;
          ctx.sfx.swish();
        },
        end() {},
        score: () => score,
        value: () => level,
        summary: () => `${level}층 · 퍼펙트 ${perfects}번`
      };
    }
  };

  /* ================================================================
     12. 숫자 세기 (관찰)
     ================================================================ */
  const count = {
    id: 'count', title: '숫자 세기', cat: '관찰', catColor: 'g', dur: 40,
    buttons: ['r', 'g', 'b'],
    rules: ['여러 도형이 화면을 지나가요', '물어보는 도형이 몇 개였는지 세요', '처음엔 조금, 갈수록 많아져요'],
    illus() {
      return `<div class="il-row" style="flex-wrap:wrap;gap:8px;max-width:260px">${['r', 'b', 'r', 'g', 'b', 'r', 'g'].map((c) => `<div style="width:30px;height:30px">${FILLED[c](HEX[c])}</div>`).join('')}
        <div class="il-cap" style="width:100%">빨강 동그라미는 몇 개?</div></div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      let round = 0;
      let state = 'idle';
      let t0 = 0;
      let objs = [];
      let asked = 'r';
      let answer = 0;
      let options = [];
      let askAt = 0;
      let nextAt = 0;
      let score = 0;
      let correct = 0;
      const STREAM = 4200;
      let W = 300;
      let H = 300;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="ct-wrap"><div class="ct-round">문제 <b class="disp">1</b></div><div class="ct-field"></div>
        <div class="ct-ask"><div class="ct-q disp"></div><div class="ct-opts">${COLS.map((c) => `<div class="ct-opt" data-c="${c}" style="--c:${HEX[c]}"><b class="disp"></b>${shape(c, 18)}</div>`).join('')}</div></div></div>`);
      ctx.stage.appendChild(wrap);
      const field = wrap.querySelector('.ct-field');
      const ask = wrap.querySelector('.ct-ask');
      const q = wrap.querySelector('.ct-q');
      const optEls = Array.from(wrap.querySelectorAll('.ct-opt'));
      const roundEl = wrap.querySelector('.ct-round b');

      function newRound(t) {
        round++;
        roundEl.textContent = round;
        // 처음엔 4~5개로 시작해서 문제마다 2개씩 늘어나요 (최대 15개)
        const n = Math.min(14, 2 + round * 2) + Math.floor(R() * 2);
        objs = [];
        field.innerHTML = '';
        for (let i = 0; i < n; i++) {
          const c = COLS[Math.floor(R() * 3)];
          const o = {
            c,
            y: 0.08 + R() * 0.78,
            start: R() * (STREAM - 1500),
            speed: 0.9 + R() * 0.6,
            size: 30 + Math.floor(R() * 14),
            el: null
          };
          o.el = el(`<div class="ct-obj" style="width:${o.size}px;height:${o.size}px">${FILLED[c](HEX[c])}</div>`);
          field.appendChild(o.el);
          objs.push(o);
        }
        asked = COLS[Math.floor(R() * 3)];
        answer = objs.filter((o) => o.c === asked).length;
        const set = new Set([answer]);
        const deltas = [1, -1, 2, -2, 3];
        let k = Math.floor(R() * 2);
        while (set.size < 3) {
          const v = answer + deltas[k % deltas.length];
          if (v >= 0) set.add(v);
          k++;
        }
        options = Array.from(set);
        for (let i = options.length - 1; i > 0; i--) {
          const j = Math.floor(R() * (i + 1));
          [options[i], options[j]] = [options[j], options[i]];
        }
        state = 'stream';
        t0 = t;
        ask.classList.remove('show');
        optEls.forEach((e) => e.classList.remove('right', 'wrong'));
      }
      function showAsk(t) {
        state = 'ask';
        askAt = t;
        objs.forEach((o) => { o.el.style.opacity = '0'; });
        q.innerHTML = `<span style="color:${LIGHT[asked]}">${KNAME[asked]} ${SHAPE_NAME[asked]}</span>는 몇 개?`;
        optEls.forEach((e, i) => { e.querySelector('b').textContent = options[i]; });
        ask.classList.add('show');
        ctx.sfx.lamp();
      }
      function reveal(t, chosenIdx) {
        state = 'reveal';
        nextAt = t + 1400;
        optEls.forEach((e, i) => {
          if (options[i] === answer) e.classList.add('right');
          else if (i === chosenIdx) e.classList.add('wrong');
        });
      }

      return {
        start(t) {
          W = field.clientWidth;
          H = field.clientHeight;
          newRound(t);
        },
        tick(t) {
          if (state === 'stream') {
            const e = t - t0;
            objs.forEach((o) => {
              const p = (e - o.start) / (1500 / o.speed);
              const x = W + 40 - p * (W + 90);
              o.el.style.transform = `translate(${x}px, ${o.y * (H - o.size)}px)`;
            });
            if (e > STREAM + 400) showAsk(t);
          } else if (state === 'ask' && t - askAt > 6000) {
            q.textContent = `시간 끝! 정답은 ${answer}개`;
            reveal(t, -1);
            ctx.sfx.soft();
          } else if (state === 'reveal' && t >= nextAt) {
            newRound(t);
          }
        },
        onPress(c, t) {
          if (state === 'stream') return;
          if (state !== 'ask') return;
          const i = IDX[c];
          const p = center(ctx, optEls[i]);
          if (options[i] === answer) {
            const gain = 50 + Math.max(0, Math.round(30 * (1 - (t - askAt) / 4000)));
            score += gain;
            correct++;
            ctx.setScore(score);
            q.textContent = `정답! ${answer}개 +${gain}`;
            ctx.fx.burst(p.x, p.y, HEX[c], 16);
            ctx.sfx.perfect();
            ctx.vibrate([15, 25, 15]);
          } else {
            q.textContent = `아쉬워요! 정답은 ${answer}개`;
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([40, 30, 40]);
          }
          ctx.setBadge(`${correct}개 정답`, 'g');
          reveal(t, i);
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${round}문제 중 ${correct}개 정답`
      };
    }
  };

  /* ================================================================
     13. 오르골 리듬 (타이밍) — 누구나 아는 옛 노래(저작권 만료곡) 멜로디
     ================================================================ */
  // 음 이름 → MIDI 번호 (C4 = 60)
  const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const SOLFA = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
  function parseTune(str) {
    return str.trim().split(/\s+/).map((tok) => {
      const [n, len] = tok.split(':');
      const m = n.match(/^([A-G]#?)(\d)$/);
      return { midi: 12 * (Number(m[2]) + 1) + NOTE_IDX[m[1]], beats: len ? Number(len) : 1 };
    });
  }
  // 모두 저작권이 끝난 옛 동요·클래식 (우리 박자로 직접 옮겨 적음)
  const SONGS = [
    { name: '작은 별 변주곡 · 모차르트', bpm: 104, notes: 'C5 C5 G5 G5 A5 A5 G5:2 F5 F5 E5 E5 D5 D5 C5:2 G5 G5 F5 F5 E5 E5 D5:2' },
    { name: '환희의 송가 · 베토벤', bpm: 116, notes: 'E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 E5:1.5 D5:.5 D5:2 E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 D5:1.5 C5:.5 C5:2' },
    { name: '엘리제를 위하여 · 베토벤', bpm: 64, notes: 'E6:.5 D#6:.5 E6:.5 D#6:.5 E6:.5 B5:.5 D6:.5 C6:.5 A5:1.5 C5:.5 E5:.5 A5:.5 B5:1.5 E5:.5 G#5:.5 B5:.5 C6:1.5' },
    { name: '미뉴에트 G장조 · 바흐', bpm: 100, notes: 'D6 G5:.5 A5:.5 B5:.5 C6:.5 D6 G5 G5 E6 C6:.5 D6:.5 E6:.5 F#6:.5 G6 G5 G5 C6 D6:.5 C6:.5 B5:.5 A5:.5 B5 C6:.5 B5:.5 A5:.5 G5:.5 F#5 G5:.5 A5:.5 B5:.5 G5:.5 A5:3' },
    { name: '자장가 · 브람스', bpm: 84, notes: 'E5:.5 E5:.5 G5:2 E5:.5 E5:.5 G5:2 E5:.5 G5:.5 C6 B5:1.5 A5:.5 A5 G5 D5:.5 E5:.5 F5 D5 D5:.5 E5:.5 F5:2 D5:.5 F5:.5 B5:.5 A5:.5 G5 B5 C6:3' },
    { name: '터키 행진곡 · 모차르트', bpm: 54, notes: 'B5:.25 A5:.25 G#5:.25 A5:.25 C6 D6:.25 C6:.25 B5:.25 C6:.25 E6 F6:.25 E6:.25 D#6:.25 E6:.25 B6:.25 A6:.25 G#6:.25 A6:.25 B6:.25 A6:.25 G#6:.25 A6:.25 C7:2' },
    { name: '캐논 · 파헬벨', bpm: 92, notes: 'F#6:2 E6:2 D6:2 C#6:2 B5:2 A5:2 B5:2 C#6:2 D6 C#6 B5 A5 G5 F#5 G5 E5' }
  ].map(prepareSong);

  function prepareSong(s) {
    const notes = parseTune(s.notes);
    const uniq = Array.from(new Set(notes.map((n) => n.midi))).sort((a, b) => a - b);
    // 낮은 음 = 왼쪽(빨강), 가운데 음 = 가운데(초록), 높은 음 = 오른쪽(파랑)
    const laneOf = (n) => { n.lane = Math.min(2, Math.floor((uniq.indexOf(n.midi) * 3) / uniq.length)); };
    notes.forEach(laneOf);
    const out = Object.assign({}, s, { tune: notes });
    if (s.hard) {
      // 원곡 리듬 악보: 쉬운 악보에 없는 음이 있어도 높낮이 순서대로 줄을 나눠요
      out.hardTune = parseTune(s.hard);
      const all = Array.from(new Set(out.hardTune.map((n) => n.midi).concat(uniq))).sort((a, b) => a - b);
      out.hardTune.forEach((n) => { n.lane = Math.min(2, Math.floor((all.indexOf(n.midi) * 3) / all.length)); });
    }
    return out;
  }

  // 음악관용 긴 버전: 악보의 도돌이표·형식대로 한 곡을 끝까지 (약 45~55초)
  const TW_A = 'C5 C5 G5 G5 A5 A5 G5:2 F5 F5 E5 E5 D5 D5 C5:2';
  const TW_B = 'G5 G5 F5 F5 E5 E5 D5:2 G5 G5 F5 F5 E5 E5 D5:2';
  const OD_A = 'E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 E5:1.5 D5:.5 D5:2';
  const OD_A2 = 'E5 E5 F5 G5 G5 F5 E5 D5 C5 C5 D5 E5 D5:1.5 C5:.5 C5:2';
  const OD_B = 'D5 D5 E5 C5 D5 E5:.5 F5:.5 E5 C5 D5 E5:.5 F5:.5 E5 D5 C5 D5 G4:2';
  const MN_HEAD = 'D6 G5:.5 A5:.5 B5:.5 C6:.5 D6 G5 G5 E6 C6:.5 D6:.5 E6:.5 F#6:.5 G6 G5 G5 C6 D6:.5 C6:.5 B5:.5 A5:.5 B5 C6:.5 B5:.5 A5:.5 G5:.5';
  const MN_1 = MN_HEAD + ' F#5 G5:.5 A5:.5 B5:.5 G5:.5 A5:3';
  const MN_2 = MN_HEAD + ' A5 B5:.5 A5:.5 G5:.5 F#5:.5 G5:3';
  const EL_T1 = 'E6:.5 D#6:.5 E6:.5 D#6:.5 E6:.5 B5:.5 D6:.5 C6:.5 A5:1.5 C5:.5 E5:.5 A5:.5 B5:1.5 E5:.5 G#5:.5 B5:.5 C6:1.5 E5:.5';
  const EL_T2 = 'E6:.5 D#6:.5 E6:.5 D#6:.5 E6:.5 B5:.5 D6:.5 C6:.5 A5:1.5 C5:.5 E5:.5 A5:.5 B5:1.5 E5:.5 C6:.5 B5:.5 A5:1.5';
  const EL_M = 'B5:.5 C6:.5 D6:.5 E6:1.5 G5:.5 F6:.5 E6:.5 D6:1.5 F5:.5 E6:.5 D6:.5 C6:1.5 E5:.5 D6:.5 C6:.5 B5:1.5 E5:.5';
  const BR_A = 'E5:.5 E5:.5 G5:2 E5:.5 E5:.5 G5:2 E5:.5 G5:.5 C6 B5:1.5 A5:.5 A5 G5 D5:.5 E5:.5 F5 D5 D5:.5 E5:.5 F5:2 D5:.5 F5:.5 B5:.5 A5:.5 G5 B5 C6:3';
  // 비발디 「사계」: Mutopia Project 공개 악보(퍼블릭 도메인)의 바이올린 선율을 그대로 옮겼어요.
  // VV_* = 16분음표를 8분음표로 줄인 쉬운 악보, VV_*_X = 원곡 리듬 그대로 (특상)
  const VV_SPRING = 'E5:.5 G#5:.5 G#5:.5 G#5:.5 F#5:.5 B5:1.5 A5:.5 G#5:.5 G#5:.5 G#5:.5 F#5:.5 B5:1.5 A5:.5 G#5:.5 B5:.5 A5:.5 G#5:.5 F#5:.5 D#5:.5 B4:.5 E5:.5 G#5:.5 G#5:.5 G#5:.5 F#5:.5 B5:1.5 A5:.5 G#5:.5 G#5:.5 G#5:.5 F#5:.5 B5:1.5 A5:.5 G#5:.5 B5:.5 A5:.5 G#5:.5 F#5:1.5 E5:.5 B5:.5 G#5:.5 A5:.5 B5:.5 C#6:.5 B5 E5:.5 B5:.5 G#5:.5 A5:.5 B5:.5 C#6:.5 B5 E5:.5 C#6:.5 B5 A5:.5 G#5:.5 E5:.5 F#5 E5:1.5 E5:.5 B5:.5 G#5:.5 A5:.5 B5:.5 C#6:.5 B5 E5:.5 B5:.5 G#5:.5 A5:.5 B5:.5 C#6:.5 B5 E5:.5 C#6:.5 B5 A5:.5 G#5:.5 E5:.5 F#5 E5:2 G#5:.5 B5:.5 A5:.5 G#5:.5 F#5:1.5 E5:.5 B5:.5 G#5:.5 A5:.5 B5:.5 C#6:.5 B5 E5:.5 B5:.5 G#5:.5 A5:.5 B5:.5 C#6:.5 B5 E5:.5 C#6:.5 B5 A5:.5 G#5:.5 E5:.5 F#5 E5:1.5 E5:.5 B5:.5 G#5:.5 A5:.5 B5:.5 C#6:.5 B5 E5:.5 B5:.5 G#5:.5 A5:.5 B5:.5 C#6:.5 B5 E5:.5 C#6:.5 B5 A5:.5 G#5:.5 E5:.5 F#5 E5:2';
  const VV_SPRING_X = 'E5:.5 G#5:.5 G#5:.5 G#5:.5 F#5:.25 E5:.25 B5:1.5 B5:.25 A5:.25 G#5:.5 G#5:.5 G#5:.5 F#5:.25 E5:.25 B5:1.5 B5:.25 A5:.25 G#5:.5 A5:.25 B5:.25 A5:.5 G#5:.5 F#5:.5 D#5:.5 B4:.5 E5:.5 G#5:.5 G#5:.5 G#5:.5 F#5:.25 E5:.25 B5:1.5 B5:.25 A5:.25 G#5:.5 G#5:.5 G#5:.5 F#5:.25 E5:.25 B5:1.5 B5:.25 A5:.25 G#5:.5 A5:.25 B5:.25 A5:.5 G#5:.5 F#5:1.5 E5:.5 B5:.5 A5:.25 G#5:.25 A5:.5 B5:.5 C#6:.5 B5 E5:.5 B5:.5 A5:.25 G#5:.25 A5:.5 B5:.5 C#6:.5 B5 E5:.5 C#6:.5 B5 A5:.5 G#5:.5 F#5:.25 E5:.25 F#5 E5:1.5 E5:.5 B5:.5 A5:.25 G#5:.25 A5:.5 B5:.5 C#6:.5 B5 E5:.5 B5:.5 A5:.25 G#5:.25 A5:.5 B5:.5 C#6:.5 B5 E5:.5 C#6:.5 B5 A5:.5 G#5:.5 F#5:.25 E5:.25 F#5 E5:2 G#5:.5 A5:.25 B5:.25 A5:.5 G#5:.5 F#5:1.5 E5:.5 B5:.5 A5:.25 G#5:.25 A5:.5 B5:.5 C#6:.5 B5 E5:.5 B5:.5 A5:.25 G#5:.25 A5:.5 B5:.5 C#6:.5 B5 E5:.5 C#6:.5 B5 A5:.5 G#5:.5 F#5:.25 E5:.25 F#5 E5:1.5 E5:.5 B5:.5 A5:.25 G#5:.25 A5:.5 B5:.5 C#6:.5 B5 E5:.5 B5:.5 A5:.25 G#5:.25 A5:.5 B5:.5 C#6:.5 B5 E5:.5 C#6:.5 B5 A5:.5 G#5:.5 F#5:.25 E5:.25 F#5 E5:2';
  const VV_SUMMER = 'G4:.5 G3:.5 G3 G3 F4:.5 G3:.5 G3 G3 D#4:.5 G3:.5 G3 G3 D4:.5 G3:.5 G3 G3 D5:.5 D4:.5 D4 D4 C5:.5 D4:.5 D4 D4 A#4:.5 D4:.5 D4 D4 A4:.5 D4:.5 D4 D4 D5:.5 C5:.5 A4:.5 F#4:.5 D4:.5 A#3:.5 G3 G3 G3 G5:.5 F5:.5 D5:.5 A#4:.5 G4:.5 D#4:.5 C4 C4 C4 A#5:.5 A5:.5 F5:.5 D5:.5 A#4:.5 G4:.5 D#4 D#4 D#4 D6:.5 C6:.5 A5:.5 F#5:.5 D5:.5 A#4:.5 G4 G4 G4 D6:.5 C6:.5 A5:.5 F#5:.5 D5:.5 A#4:.5 G4 G4 G4 D5:.5 G4:.5 D5:.5 G4:.5 D5:.5 G4:.5 D4:.5 A#4:.5 D5:.5 F#5:.5 A5 A4:.5 A#4:.5 D5:.5 F#5:.5 A5 A#4:.5 C5:.5 D#5:.5 G5:.5 A#5 D5:.5 E5:.5 G5:.5 A#5:.5 D6 D5:.5 E5:.5 G5:.5 A#5:.5 D6 A4:.5 A#4:.5 D5:.5 F#5:.5 A5 A#4:.5 C5:.5 D#5:.5 G5:.5 A#5 D5:.5 E5:.5 G5:.5 A#5:.5 D6 A#5:.5 D5:.5 A#5:.5 D5:.5 A#5:.5 A#4:.5 D5:.5 G4:.5 D5:.5 G4:.5 D5:.5 D4:.5 G4:.5 A#3:.5 G4:.5 A#3:.5 G4:.5 G3:2.25';
  const VV_SUMMER_X = 'G4:.5 G3:.5 G3:.5 G3:.5 G3:.5 G3:.5 F4:.5 G3:.5 G3:.5 G3:.5 G3:.5 G3:.5 D#4:.5 G3:.5 G3:.5 G3:.5 G3:.5 G3:.5 D4:.5 G3:.5 G3:.5 G3:.5 G3 D5:.5 D4:.5 D4:.5 D4:.5 D4:.5 D4:.5 C5:.5 D4:.5 D4:.5 D4:.5 D4:.5 D4:.5 A#4:.5 D4:.5 D4:.5 D4:.5 D4:.5 D4:.5 A4:.5 D4:.5 D4:.5 D4:.5 D4 D5:.5 C5:.5 A4:.5 F#4:.5 D4:.5 A#3:.5 G3:.5 G3:.5 G3:.5 G3:.5 G3:.5 G3:.5 G5:.5 F5:.5 D5:.5 A#4:.5 G4:.5 D#4:.5 C4:.5 C4:.5 C4:.5 C4:.5 C4:.5 C4:.5 A#5:.5 A5:.5 F5:.5 D5:.5 A#4:.5 G4:.5 D#4:.5 D#4:.5 D#4:.5 D#4:.5 D#4:.5 D#4:.5 D6:.5 C6:.5 A5:.5 F#5:.5 D5:.5 A#4:.5 G4:.5 G4:.5 G4:.5 G4:.5 G4:.5 G4:.5 D6:.5 C6:.5 A5:.5 F#5:.5 D5:.5 A#4:.5 G4:.5 G4:.5 G4:.5 G4:.5 G4:.5 G4:.5 D5:.5 G4:.5 D5:.5 G4:.5 D5:.5 G4:.5 D4:.5 A#4:.5 D5:.5 F#5:.5 A5 A4:.5 A#4:.5 D5:.5 F#5:.5 A5 A#4:.5 C5:.5 D#5:.5 G5:.5 A#5 D5:.5 E5:.5 G5:.5 A#5:.5 D6 D5:.5 E5:.5 G5:.5 A#5:.5 D6 A4:.5 A#4:.5 D5:.5 F#5:.5 A5 A#4:.5 C5:.5 D#5:.5 G5:.5 A#5 D5:.5 E5:.5 G5:.5 A#5:.5 D6 A#5:.5 D5:.5 A#5:.5 D5:.5 A#5:.5 A#4:.5 D5:.5 G4:.5 D5:.5 G4:.5 D5:.5 D4:.5 G4:.5 A#3:.5 G4:.5 A#3:.5 G4:.5 G3:2.25';
  const VV_AUTUMN = 'A5:.5 A5:.5 A5:.5 A#5:.5 A5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A5:.5 A#5 A5:.5 A#5:.5 A5:.5 G5:.5 A#5:.5 A5:.5 G5:2 A4:.5 A4:.5 A4:.5 A#4:.5 A4 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4 A4:.5 A#4:.5 A4:.5 G4:.5 A#4:.5 A4:.5 G4:2 A5:.5 A5:.5 A5:.5 C6:.5 D5 D5:.5 D5:.5 G5:.5 G5:.5 G5:.5 A#5:.5 C5 C5:.5 F5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 G5:.5 A#5:.5 G5:.5 A5:2 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 G4:.5 A#4:.5 G4:.5 F4:2 A5:.5 A5:.5 A5:.5 C6:.5 D5 D5:.5 D5:.5 G5:.5 G5:.5 G5:.5 A#5:.5 C5 C5:.5 F5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 G5:.5 A#5:.5 G5:.5 A5:2 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 G4:.5 A#4:.5 G4:.5 F4:2';
  const VV_AUTUMN_X = 'A5:.5 A5:.5 A5:.5 A#5:.5 A5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A5:.5 A#5 A5:.5 A#5:.5 A5:.5 G5:.25 A5:.25 A#5:.5 A5:.5 G5:2 A4:.5 A4:.5 A4:.5 A#4:.5 A4 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4 A4:.5 A#4:.5 A4:.5 G4:.25 A4:.25 A#4:.5 A4:.5 G4:2 A5:.5 A5:.5 A5:.5 C6:.5 D5 D5:.5 D5:.5 G5:.5 G5:.5 G5:.5 A#5:.5 C5 C5:.5 F5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 G5:.25 A5:.25 A#5:.5 G5:.5 A5:2 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 G4:.25 A4:.25 A#4:.5 G4:.5 F4:2 A5:.5 A5:.5 A5:.5 C6:.5 D5 D5:.5 D5:.5 G5:.5 G5:.5 G5:.5 A#5:.5 C5 C5:.5 F5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 A5:.5 A5:.5 A#5:.5 A5:.5 G5:.25 A5:.25 A#5:.5 G5:.5 A5:2 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 A4:.5 A4:.5 A#4:.5 A4:.5 G4:.25 A4:.25 A#4:.5 G4:.5 F4:2';
  const VV_WINTER = 'D#5:.5 A#5:.5 G5:.5 D#5:.5 F5:.5 A#4 A#4:.5 G#5:.5 F5:.5 D5:.5 G#5:.5 G#5:.5 G5 G5:.5 F5:.5 G5:.5 A#5:.5 C6:.5 D#5:.5 F5:.5 G#5:.5 A#5:.5 D5:.5 D#5:.5 G5:.5 G#5:.5 C5:.5 D5:.5 F5:.5 G5:.5 D5 A#4:.5 A4:.5 F5 A#4:.5 A4:.5 G5 A#4:.5 A4:.5 A5 F5:.5 D#5:.5 A#5:.5 A#4 A#5:.5 G#5:.5 G5:.5 D#5:.5 A#4:.5 C5:1.5 A#4:.5 A#4:2 A#4:.5 F5:.5 D5:.5 A#4:.5 C5:.5 F4 F4:.5 D#5:.5 C5:.5 A4:.5 D#5:.5 D#5:.5 D5 A#4:.5 G#5:.5 F5:.5 D5:.5 G#5:.5 G#5:.5 G5 G5:.5 C5:.5 D5:.5 F5:.5 G5:.5 D5:.5 D#5:.5 G5:.5 G#5:.5 D#5:.5 F5:.5 G#5:.5 A#5:.5 D5:1.5 D#5:.5 F5:.5 C5:.5 G5:.5 A#5:.5 F5:.5 A#4 D5:.5 F5:.5 C5:.5 G5:.5 A#5:.5 F5:.5 A#4 F5:.5 G5:.5 F5:.5 D5:.5 D#5:.5 D#5:2';
  const VV_WINTER_X = 'D#5:.5 A#5:.25 G#5:.25 G5:.5 F5:.25 D#5:.25 F5:.5 A#4 A#4:.5 G#5:.25 G5:.25 F5:.25 D#5:.25 D5:.5 G#5:.5 G#5:.5 G5 G5:.5 F5:.5 G5:.25 G#5:.25 A#5:.5 C6:.25 D6:.25 D#5:.5 F5:.25 G5:.25 G#5:.5 A#5:.25 C6:.25 D5:.5 D#5:.25 F5:.25 G5:.5 G#5:.25 A#5:.25 C5:.5 D5:.25 D#5:.25 F5:.5 G5:.25 D#5:.25 D5:1.25 A#4:.25 A4:.25 A#4:.25 F5:1.25 A#4:.25 A4:.25 A#4:.25 G5:1.25 A#4:.25 A4:.25 A#4:.25 A5:1.25 F5:.25 D#5:.25 F5:.25 A#5:.5 A#4 A#5:.5 A#5:.25 G#5:.25 G5:.25 F5:.25 D#5:.25 D5:.25 C5:.25 A#4:.25 C5:1.5 A#4:.5 A#4:2 A#4:.5 F5:.25 D#5:.25 D5:.5 C5:.25 A#4:.25 C5:.5 F4 F4:.5 D#5:.25 D5:.25 C5:.25 A#4:.25 A4:.5 D#5:.5 D#5:.5 D5 A#4:.5 G#5:.25 G5:.25 F5:.25 D#5:.25 D5:.5 G#5:.5 G#5:.5 G5 G5:.5 C5:.5 D5:.25 D#5:.25 F5:.5 G5:.25 G#5:.25 D5:.5 D#5:.25 F5:.25 G5:.5 G#5:.25 A#5:.25 D#5:.5 F5:.25 G5:.25 G#5:.5 A#5:.25 C6:.25 D5:1.5 D5:.25 D#5:.25 F5:.25 D5:.25 C5:.25 A#4:.25 G5:.25 G#5:.25 A#5:.25 G5:.25 F5:.5 A#4 D5:.25 D#5:.25 F5:.25 D5:.25 C5:.25 A#4:.25 G5:.25 G#5:.25 A#5:.25 G5:.25 F5:.5 A#4 F5:.25 A#5:.25 G5:.5 F5:.25 D#5:.25 D5:.75 D#5:.25 D#5:2';
  const LONG_SONGS = [
    { id: 'twinkle', title: '작은 별 변주곡', composer: '모차르트', name: '작은 별 변주곡 · 모차르트', bpm: 108, notes: [TW_A, TW_A, TW_B, TW_A, TW_B, TW_A].join(' '),
      fact: '모차르트는 프랑스 동요 "아, 어머니께 말씀드릴게요"의 선율로 12개의 변주곡을 만들었어요. 우리가 아는 "반짝반짝 작은 별"과 같은 멜로디예요.' },
    { id: 'ode', title: '환희의 송가', composer: '베토벤', name: '환희의 송가 · 베토벤', bpm: 116, notes: [OD_A, OD_A2, OD_B, OD_A2, OD_B, OD_A2].join(' '),
      fact: '베토벤 교향곡 9번 마지막 악장의 합창 선율이에요. 베토벤은 귀가 거의 들리지 않을 때 이 곡을 완성했어요. 지금은 유럽연합(EU)의 노래로도 쓰여요.' },
    { id: 'minuet', title: '미뉴에트 G장조', composer: '바흐', name: '미뉴에트 G장조 · 바흐', bpm: 112, meter: 3, pickup: 0, notes: [MN_1, MN_2, MN_1, MN_2].join(' '),
      fact: '미뉴에트는 3박자의 우아한 춤곡이에요. 바흐가 아내 안나 막달레나를 위해 엮은 음악 노트에 실려 있어요. 요즘은 페촐트라는 작곡가가 만든 곡으로 알려져 있어요.' },
    { id: 'elise', title: '엘리제를 위하여', composer: '베토벤', name: '엘리제를 위하여 · 베토벤', bpm: 62, meter: 3, pickup: 1, notes: [EL_T1, EL_T2, EL_M, EL_T1, EL_T2].join(' '),
      fact: '베토벤이 1810년쯤 쓴 피아노 소품이에요. "엘리제"가 누구인지는 지금도 정확히 몰라요.' },
    { id: 'lullaby', title: '자장가', composer: '브람스', name: '자장가 · 브람스', bpm: 66, meter: 3, pickup: 1, notes: [BR_A, BR_A].join(' '),
      fact: '브람스가 친구의 아기가 태어난 것을 축하하며 선물한 노래예요. 세계에서 가장 유명한 자장가 중 하나예요.' },
    { id: 'spring', title: '사계 · 봄 1악장', composer: '비발디', name: '사계 「봄」 1악장 · 비발디', bpm: 84, meter: 4, pickup: 0.5, notes: VV_SPRING, hard: VV_SPRING_X,
      fact: '비발디는 「사계」의 악보마다 짧은 시(소네트)를 붙였어요. 봄 1악장에는 "새들의 노래", "흐르는 시냇물", "천둥"이 차례로 나와서 바이올린이 새소리와 천둥을 흉내 내요.' },
    { id: 'summer', title: '사계 · 여름 3악장', composer: '비발디', name: '사계 「여름」 3악장 · 비발디', bpm: 100, meter: 3, pickup: 0, notes: VV_SUMMER, hard: VV_SUMMER_X,
      fact: '여름 3악장은 여름날의 폭풍이에요. 같은 음을 아주 빠르게 되풀이하고 음계를 위에서 아래로 쏟아붓듯 연주해서 천둥·번개와 우박을 그려요.' },
    { id: 'autumn', title: '사계 · 가을 1악장', composer: '비발디', name: '사계 「가을」 1악장 · 비발디', bpm: 88, meter: 4, pickup: 0, notes: VV_AUTUMN, hard: VV_AUTUMN_X,
      fact: '가을 1악장 악보에는 "마을 사람들의 춤과 노래"라고 적혀 있어요. 추수를 끝낸 농부들이 풍년을 축하하며 춤추는 모습이에요. 크게(포르테) 한 번, 작게(피아노) 메아리처럼 한 번 되풀이해요.' },
    { id: 'winter', title: '사계 · 겨울 2악장', composer: '비발디', name: '사계 「겨울」 2악장 · 비발디', bpm: 62, meter: 4, pickup: 0, notes: VV_WINTER, hard: VV_WINTER_X,
      fact: '겨울 2악장(라르고)은 밖에 차가운 비가 내리는 날, 따뜻한 난롯가에서 쉬는 장면이에요. 뒤에서 현을 손가락으로 톡톡 튕기는 소리가 빗방울을 나타내요. 비발디는 머리가 붉어서 "빨간 머리 신부님"이라고 불렸어요.' }
  ].map(prepareSong);
  LONG_SONGS.forEach((s) => { s.sec = Math.round((s.tune.reduce((a, n) => a + n.beats, 0) * 60) / s.bpm); });
  G.MUSIC_SONGS = LONG_SONGS;

  const rhythm = {
    id: 'rhythm', title: '오르골 리듬', cat: '리듬', catColor: 'b', dur: 40,
    buttons: ['r', 'g', 'b'], music: false, pressSound: false,
    rules: ['음표가 선에 닿을 때 같은 줄 버튼!', '잘 맞히면 오르골 소리로 클래식이 연주돼요', '낮은 음은 왼쪽, 높은 음은 오른쪽이에요'],
    illus() {
      return `<div class="il-row" style="gap:14px"><div class="il-rhythm">${COLS.map((c, i) => `<div class="ir-lane"><i style="background:${HEX[c]};top:${20 + i * 22}%"></i><b style="border-color:${HEX[c]}"></b></div>`).join('')}</div>
        <div class="il-cap" style="text-align:left">♪ 환희의 송가<br>♪ 엘리제를 위하여<br>♪ 터키 행진곡 …</div></div>`;
    },
    create(ctx) { return rhythm.createWith(ctx, {}); },
    // 음악관(과학관 모드)에서도 같은 게임을 빠르기만 바꿔서 써요
    createWith(ctx, opts) {
      const R = rng(ctx.seed);
      const D = durOf(ctx);
      const LEAD = 2200;
      const FALL = opts && opts.long && opts.level === 'x' ? 1250 : 1500;
      // 랜덤으로 한 곡만 골라서 연주해요
      // 오락실: 짧은 곡을 시간이 될 때까지 반복 / 음악관(long): 긴 곡을 처음부터 끝까지 한 번
      const isLong = !!(opts && opts.long);
      const list = isLong ? LONG_SONGS : SONGS;
      const picked = opts && opts.songId ? list.find((x) => x.id === opts.songId) : null;
      const theSong = picked || list[Math.floor(R() * list.length)];
      const notes = [];
      const titles = [];
      const beats = [];
      let at = LEAD;
      let speed = (opts && opts.speed) || 1;
      let songEnd = 0;
      if (isLong) {
        // 음악관: 주제 → 변주 로 약 1분 30초 동안 한 곡을 연주해요
        const lv = (opts && opts.level) || 'm';
        const T = theSong.tune;
        const dbl = (tune) => tune.flatMap((n) => (n.beats >= 1
          ? [Object.assign({}, n, { beats: n.beats / 2 }), Object.assign({}, n, { beats: n.beats / 2 })]
          : [n]));
        const up = (tune) => tune.map((n) => Object.assign({}, n, { midi: n.midi + 12 }));
        // 변주는 곡의 앞 절반으로 (악보의 한 단락 단위) → 한 곡 약 1분 30초
        const halfOf = (tune) => {
          const total = tune.reduce((a, n) => a + n.beats, 0);
          const out = [];
          let acc = 0;
          for (const n of tune) {
            if (acc >= total / 2 - 0.01) break;
            out.push(n);
            acc += n.beats;
          }
          return out;
        };
        const H = halfOf(T);
        // 하: 주제 + 음표 두 배 변주 / 중: 조금 빠르게, 높은 소리로 두 배 변주
        // 상: 처음부터 음표 두 배 + 마디 첫 박마다 두 줄을 같이 누르는 화음 음표
        // 특상: 원곡 리듬(있으면) + 화음이 마디마다 두 번 + 더 빠르게, 음표도 빨리 떨어져요
        const sections = lv === 'x'
          ? [{ name: theSong.hardTune ? '주제 · 원곡 리듬 + 화음' : '주제 · 음표 두 배 + 화음', tune: theSong.hardTune || dbl(T), mul: 1, chord: 2 },
            { name: '변주 · 높은 소리 + 화음', tune: up(dbl(H)), mul: 1.1, chord: 2 }]
          : lv === 'e'
          ? [{ name: '주제', tune: T, mul: 1 }, { name: '변주 · 음표가 두 배로', tune: dbl(H), mul: 1 }]
          : lv === 'h'
            ? [{ name: '주제 · 음표 두 배', tune: dbl(T), mul: 1, chord: true }, { name: '변주 · 높은 소리 + 화음', tune: up(dbl(H)), mul: 1.08, chord: true }]
            : [{ name: '주제', tune: T, mul: 1 }, { name: '변주 · 높은 소리로 음표 두 배', tune: up(dbl(H)), mul: 1.05 }];
        const beatsOf = (tune) => tune.reduce((a, n) => a + n.beats, 0);
        const msOf = (secs) => secs.reduce((a, sec) => a + ((beatsOf(sec.tune) + 2) * 60000) / (theSong.bpm * sec.mul), 0);
        const avail = Math.max(5000, D - LEAD - 2500);
        const floor = lv === 'x' ? 1 : lv === 'h' ? 0.95 : 0.88;
        // 빠른 난이도에서 곡이 일찍 끝나 버리면 '피날레'로 주제 앞부분을 한 번 더 (약 1분 30초를 채워요)
        if (msOf(sections) / avail < speed * floor * 0.85) {
          const first = sections[0];
          const last = sections[sections.length - 1];
          const half = halfOf(first.tune);
          const coda = [half, halfOf(half)]
            .map((tune) => ({ name: '피날레 · 주제를 한 번 더', tune, mul: last.mul, chord: first.chord }))
            .find((c) => msOf(sections.concat([c])) / avail <= speed);
          if (coda) sections.push(coda);
        }
        // 게임 시간에 맞게 빠르기를 살짝 조절 (상은 너무 느려지지 않게)
        const need = msOf(sections) / avail;
        speed = Math.min(Math.max(speed * 1.2, Math.min(need, 1.15)), Math.max(speed * floor, need));
        sections.forEach((sec, si) => {
          const beatMs = 60000 / (theSong.bpm * speed * sec.mul);
          titles.push({ at: at - beatMs * 2, name: si === 0 ? `${theSong.name}` : `${theSong.title} · ${sec.name}` });
          let t = at;
          let b = 0;
          let pos = 0;
          sec.tune.forEach((n) => {
            if (t < D - 1200) {
              notes.push({ at: t, lane: n.lane, midi: n.midi });
              // 화음: 마디 첫 박마다 한 옥타브 아래 음을 다른 줄에 같이
              const meter = theSong.meter || 4;
              const bp = (((pos - (theSong.pickup || 0)) % meter) + meter) % meter;
              const onBeat = bp < 0.01 || meter - bp < 0.01 || (sec.chord === 2 && Math.abs(bp - 2) < 0.01);
              if (sec.chord && onBeat) notes.push({ at: t, lane: n.lane === 0 ? 2 : 0, midi: n.midi - 12, chord: true });
            }
            t += n.beats * beatMs;
            pos += n.beats;
          });
          for (let x = at; x < t && x < D - 1200; x += beatMs) beats.push({ at: x, accent: b++ % 4 === 0 });
          songEnd = t;
          at = t + beatMs * 2;
        });
        notes.sort((a, b) => a.at - b.at);
      }
      for (let k = 0; !isLong && at < D - 3000; k++) {
        const song = theSong;
        const beatMs = 60000 / (song.bpm * speed);
        if (k === 0) titles.push({ at: at - beatMs * 2, name: song.name });
        let t = at;
        let b = 0;
        song.tune.forEach((n) => {
          if (t < D - 1200) notes.push({ at: t, lane: n.lane, midi: n.midi });
          t += n.beats * beatMs;
        });
        for (let x = at; x < t && x < D - 1200; x += beatMs) beats.push({ at: x, accent: b++ % 4 === 0 });
        songEnd = t;
        at = t + beatMs * 2;
      }
      notes.forEach((n) => { n.state = 'wait'; n.el = null; });
      let t0 = 0;
      let ptr = 0;
      let bptr = 0;
      let tptr = 0;
      let score = 0;
      let combo = 0;
      let maxCombo = 0;
      let perfect = 0;
      let hit = 0;
      let H = 400;
      let judgeY = 320;
      let finaleShown = false;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="rh-wrap mb"><div class="rh-song disp"></div><div class="rh-lanes">${COLS.map((c) =>
        `<div class="rh-lane" style="--c:${HEX[c]}"><div class="rh-receptor">${shape(c, 18)}</div></div>`).join('')}</div>
        <div class="rh-line"></div><div class="rh-judge disp"></div><div class="rh-combo disp"></div></div>`);
      ctx.stage.appendChild(wrap);
      const lanes = Array.from(wrap.querySelectorAll('.rh-lane'));
      const receptors = Array.from(wrap.querySelectorAll('.rh-receptor'));
      const judge = wrap.querySelector('.rh-judge');
      const comboEl = wrap.querySelector('.rh-combo');
      const songEl = wrap.querySelector('.rh-song');

      function showJudge(text, color) {
        msgPop(judge, text, color);
        comboEl.textContent = combo >= 3 ? `${combo} COMBO` : '';
      }
      function removeNote(n) {
        if (n.el) { n.el.remove(); n.el = null; }
      }

      return {
        start(t) {
          t0 = t;
          H = wrap.clientHeight;
          judgeY = H - 78;
          wrap.querySelector('.rh-line').style.top = (judgeY + 20) + 'px';
          receptors.forEach((r) => { r.style.top = judgeY + 'px'; });
        },
        tick(t) {
          const e = t - t0;
          while (tptr < titles.length && titles[tptr].at <= e) {
            songEl.textContent = '♪ ' + titles[tptr++].name;
            retrigger(songEl, 'pop');
          }
          while (bptr < beats.length && beats[bptr].at <= e) ctx.sfx.mbTick(beats[bptr++].accent);
          if (isLong && !finaleShown && songEnd && e > songEnd + 600) {
            finaleShown = true;
            songEl.textContent = `👏 연주 완성! ${hit}음 / ${notes.length}음`;
            retrigger(songEl, 'pop');
            ctx.sfx.fanfare();
          }
          while (ptr < notes.length && notes[ptr].at - FALL <= e) {
            const n = notes[ptr++];
            n.el = el(`<div class="rh-note${n.chord ? ' chord' : ''}" style="--c:${HEX[COLS[n.lane]]}"><b>${SOLFA[n.midi % 12]}</b></div>`);
            lanes[n.lane].appendChild(n.el);
          }
          for (let i = 0; i < ptr; i++) {
            const n = notes[i];
            if (n.state !== 'wait') continue;
            const y = judgeY - ((n.at - e) / FALL) * judgeY;
            if (n.el) n.el.style.transform = `translate(-50%, ${y.toFixed(1)}px)`;
            if (e - n.at > 180) {
              n.state = 'miss';
              removeNote(n);
              combo = 0;
              showJudge('MISS', '#FF8B95');
            }
          }
        },
        onPress(c, t) {
          const e = t - t0;
          const lane = IDX[c];
          retrigger(receptors[lane], 'hit');
          let best = null;
          for (let i = 0; i < ptr; i++) {
            const n = notes[i];
            if (n.state !== 'wait' || n.lane !== lane) continue;
            const d = Math.abs(e - n.at);
            if (d <= 180 && (!best || d < Math.abs(e - best.at))) best = n;
          }
          if (!best) {
            ctx.sfx.mbTick(false);
            return;
          }
          const d = Math.abs(e - best.at);
          best.state = 'hit';
          removeNote(best);
          ctx.sfx.musicbox(best.midi);
          combo++;
          hit++;
          maxCombo = Math.max(maxCombo, combo);
          let base;
          if (d < 60) { base = 100; perfect++; showJudge('PERFECT', '#FFD23F'); ctx.vibrate(10); }
          else if (d < 120) { base = 70; showJudge('GREAT', '#7DF0AE'); ctx.vibrate(6); }
          else { base = 40; showJudge('GOOD', '#A9C4FF'); }
          score += base + Math.min(30, combo) * 2;
          ctx.setScore(score);
          const p = center(ctx, receptors[lane]);
          ctx.fx.burst(p.x, p.y, HEX[c], d < 60 ? 12 : 6);
          ctx.setBadge(combo >= 5 ? `${combo} 콤보` : null, 'b');
        },
        end() {},
        // 음악관: 곡이 끝나고 3초 뒤에 판을 끝내요 (시작부터 ms, 없으면 0)
        plannedEnd: () => (isLong && songEnd ? songEnd + 3000 : 0),
        score: () => score,
        value: () => score,
        summary: () => `${notes.length}음 중 ${hit}음 연주 · 최대 ${maxCombo}콤보`
      };
    }
  };

  /* ================================================================
     14. 가짜 찾기 (판단)
     ================================================================ */
  const odd = {
    id: 'odd', title: '가짜 찾기', cat: '판단', catColor: 'b', dur: 30,
    buttons: ['r', 'g', 'b'],
    rules: ['셋 중에 하나만 달라요', '다른 하나가 있는 자리의 버튼을 눌러요', '빨리 찾을수록 점수가 커요'],
    illus() {
      return `<div class="il-row" style="gap:10px">${['rabbit', 'rabbit', 'rabbit'].map((k, i) =>
        `<div class="il-btn"><div style="width:64px;height:64px;${i === 2 ? 'filter:hue-rotate(80deg) saturate(2)' : ''}">${A.svg(k)}</div><span style="color:${LIGHT[COLS[i]]}">${i === 2 ? '이게 가짜!' : '진짜'}</span></div>`).join('')}</div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const kinds = A.LIST.map((x) => x[0]);
      let round = 0;
      let oddIdx = 0;
      let state = 'idle';
      let askAt = 0;
      let nextAt = 0;
      let score = 0;
      let correct = 0;
      let streak = 0;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="od-wrap"><div class="od-round">문제 <b class="disp">1</b></div><div class="od-msg disp">다른 하나를 찾아요!</div>
        <div class="od-cards">${COLS.map((c) => `<div class="od-card"><div class="od-pic"></div><span class="od-tag" style="background:${HEX[c]}">${shape(c, 16)}</span></div>`).join('')}</div>
        <div class="od-hint"></div></div>`);
      ctx.stage.appendChild(wrap);
      const cards = Array.from(wrap.querySelectorAll('.od-card'));
      const pics = Array.from(wrap.querySelectorAll('.od-pic'));
      const msg = wrap.querySelector('.od-msg');
      const roundEl = wrap.querySelector('.od-round b');
      const hint = wrap.querySelector('.od-hint');

      function newRound(t) {
        round++;
        roundEl.textContent = round;
        const d = Math.min(1, (round - 1) / 8);
        const base = kinds[Math.floor(R() * kinds.length)];
        oddIdx = Math.floor(R() * 3);
        const pool = round <= 2 ? ['animal'] : ['animal', 'hue', 'size', 'rotate', 'hue', 'rotate'];
        const kind = pool[Math.floor(R() * pool.length)];
        let other = kinds[Math.floor(R() * kinds.length)];
        if (other === base) other = kinds[(kinds.indexOf(base) + 1) % kinds.length];
        const hueDeg = Math.round(70 - 50 * d);
        const sc = (0.8 + 0.12 * d).toFixed(2);
        const rot = Math.round(22 - 12 * d);
        const rotSign = R() < 0.5 ? -1 : 1;
        pics.forEach((p, i) => {
          const isOdd = i === oddIdx;
          p.innerHTML = A.svg(isOdd && kind === 'animal' ? other : base);
          let f = '';
          let tf = '';
          if (isOdd && kind === 'hue') f = `hue-rotate(${hueDeg}deg) saturate(1.3)`;
          if (isOdd && kind === 'size') tf = `scale(${sc})`;
          if (isOdd && kind === 'rotate') tf = `rotate(${rot * rotSign}deg)`;
          p.style.filter = f;
          p.style.transform = tf;
        });
        cards.forEach((c) => c.classList.remove('right', 'wrong'));
        hint.textContent = '';
        state = 'ask';
        askAt = t;
        msgPop(msg, '다른 하나는?', '#F6F3FF');
      }

      return {
        start(t) { newRound(t); },
        tick(t) {
          if (state === 'reveal' && t >= nextAt) newRound(t);
          else if (state === 'ask' && t - askAt > 7000) {
            cards[oddIdx].classList.add('right');
            msgPop(msg, '시간 초과!', '#FF8B95');
            streak = 0;
            state = 'reveal';
            nextAt = t + 1000;
          }
        },
        onPress(c, t) {
          if (state !== 'ask') return;
          const i = IDX[c];
          const p = center(ctx, cards[i]);
          if (i === oddIdx) {
            streak++;
            const gain = 20 + Math.max(0, Math.round(40 * (1 - (t - askAt) / 3000))) + Math.min(20, (streak - 1) * 5);
            score += gain;
            correct++;
            ctx.setScore(score);
            cards[i].classList.add('right');
            msgPop(msg, `찾았다! +${gain}`, '#FFD23F');
            ctx.fx.burst(p.x, p.y, '#FFD23F', 16);
            ctx.sfx.perfect();
            ctx.vibrate([15, 25, 15]);
            state = 'reveal';
            nextAt = t + 500;
          } else {
            streak = 0;
            score = Math.max(0, score - 10);
            ctx.setScore(score);
            cards[i].classList.add('wrong');
            cards[oddIdx].classList.add('right');
            msgPop(msg, '아니에요 -10', '#FF8B95');
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([40, 30, 40]);
            state = 'reveal';
            nextAt = t + 1000;
          }
          ctx.setBadge(streak >= 2 ? `${streak}연속` : null, 'y');
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${correct}개 찾음`
      };
    }
  };

  /* ================================================================
     15. 나무 도끼질 (연타)
     ================================================================ */
  const chop = {
    id: 'chop', title: '나무 도끼질', cat: '연타', catColor: 'g', dur: 25,
    buttons: ['r', 'g', 'b'], pressSound: false,
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

  /* ================================================================
     16. 공룡 발걸음 (박자)
     ================================================================ */
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
    id: 'dino', title: '공룡 발걸음', cat: '박자', catColor: 'y', dur: 30,
    buttons: ['r', 'b'], music: false, pressSound: false,
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

  /* ================================================================
     17. 접시 깨기 (타이밍)
     ================================================================ */
  const PLATE_SVG = '<svg viewBox="0 0 60 24" aria-hidden="true"><ellipse cx="30" cy="12" rx="29" ry="11" fill="#FF8A3D"/><ellipse cx="30" cy="10" rx="20" ry="6" fill="#FFB27A"/><ellipse cx="30" cy="12" rx="29" ry="11" fill="none" stroke="#B85A1C" stroke-width="2"/></svg>';

  const plate = {
    id: 'plate', title: '접시 깨기', cat: '타이밍', catColor: 'r', dur: 35,
    buttons: ['r', 'g', 'b'],
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

  Object.assign(G.ALL, {
    throw: throwG, simon, balloon, mole, tug, weld, crane, count, rhythm, odd, chop, dino, plate
  });
})();
