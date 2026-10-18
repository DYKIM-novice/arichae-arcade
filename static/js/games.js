/* 아리채 오락실 - 미니게임 모음
   모든 게임은 서버가 준 같은 시드(seed)로 같은 문제가 나오도록 만들어 공정하게 동시 진행됩니다. */
(function () {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const COLS = ['r', 'g', 'b'];
  const HEX = { r: '#FF4757', g: '#2ED573', b: '#3D7BFF', y: '#FFD23F' };
  const SHADE = { r: '#B8202F', g: '#1A8F4A', b: '#1F49B8', y: '#C99A00' };
  const LIGHT = { r: '#FF8B95', g: '#7DF0AE', b: '#A9C4FF', y: '#FFE27A' };
  const KNAME = { r: '빨강', g: '초록', b: '파랑' };
  const SHAPE = {
    r: '<circle cx="12" cy="12" r="8"/>',
    g: '<path d="M12 4 L21 19 L3 19 Z"/>',
    b: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/>'
  };

  function shape(c, size, stroke, sw) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke || '#fff'}" stroke-width="${sw || 3}" stroke-linejoin="round" aria-hidden="true">${SHAPE[c]}</svg>`;
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function center(ctx, node) {
    const s = ctx.stage.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
  }

  /* ================================================================
     1. 블록 지우기 (정확도)
     ================================================================ */
  const blocks = {
    id: 'blocks',
    title: '블록 지우기',
    cat: '정확도',
    catColor: 'b',
    dur: 50,
    buttons: ['r', 'g', 'b'],
    rules: ['맨 아래 블록과 같은 색 버튼을 누르세요', '틀리면 0.5초 동안 멈춰요', '연속으로 맞히면 콤보 점수가 붙어요'],
    illus() {
      const order = ['b', 'r', 'r', 'b', 'g'];
      const stack = order.map((c, i) =>
        `<div class="il-block" style="background:${HEX[c]};box-shadow:inset 0 3px 0 rgba(255,255,255,.3),0 4px 0 ${SHADE[c]};${i === order.length - 1 ? 'outline:3px solid #FFD23F;outline-offset:3px' : ''}">${shape(c, 16)}</div>`).join('');
      return `<div class="il-row"><div class="il-stack">${stack}</div>
        <svg class="il-arrow" width="56" height="36" viewBox="0 0 64 40" fill="none" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 H54"/><path d="M42 8 L56 20 L42 32"/></svg>
        <div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX.g};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE.g},0 0 0 4px rgba(255,210,63,.9)">${shape('g', 24)}</div></div><span style="color:${LIGHT.g}">초록 누르기</span></div></div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const nextColor = () => COLS[Math.floor(R() * 3)];
      const VIS = 9;
      const queue = [];
      const els = [];
      let score = 0;
      let combo = 0;
      let best = 0;
      let cleared = 0;
      let frozenUntil = 0;

      ctx.stage.innerHTML = '';
      const field = el(`<div class="bk-field"><div class="bk-stack"></div>
        <div class="bk-mark l">${'<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 4 L20 12 L5 20 Z" fill="#FFD23F"/></svg>'}</div>
        <div class="bk-mark r">${'<svg width="26" height="26" viewBox="0 0 24 24"><path d="M19 4 L4 12 L19 20 Z" fill="#FFD23F"/></svg>'}</div></div>`);
      ctx.stage.appendChild(field);
      const stackEl = field.querySelector('.bk-stack');

      function sizeBlocks() {
        const h = field.clientHeight - 40;
        const bh = Math.max(24, Math.min(44, Math.floor(h / VIS) - 7));
        field.style.setProperty('--bh', bh + 'px');
      }

      function makeBlock(c, i) {
        const b = el(`<div class="bk-block" style="background:${HEX[c]};box-shadow:inset 0 4px 0 rgba(255,255,255,.3),0 5px 0 ${SHADE[c]}">${shape(c, 20)}</div>`);
        b.style.setProperty('--i', i);
        stackEl.appendChild(b);
        return b;
      }

      function layout() {
        els.forEach((b, i) => {
          b.style.setProperty('--i', i);
          b.classList.toggle('target', i === 0);
          b.style.opacity = String(Math.max(0.35, 1 - i * 0.07));
        });
      }

      for (let i = 0; i < VIS; i++) {
        const c = nextColor();
        queue.push(c);
        els.push(makeBlock(c, i));
      }

      return {
        start() { sizeBlocks(); layout(); },
        tick() { /* 블록은 입력 때만 움직임 */ },
        onPress(c, t) {
          if (t < frozenUntil) return;
          const target = els[0];
          if (c === queue[0]) {
            const pt = center(ctx, target);
            queue.shift();
            els.shift();
            target.remove();
            const nc = nextColor();
            queue.push(nc);
            const nb = makeBlock(nc, VIS - 1);
            nb.classList.add('drop');
            els.push(nb);
            layout();
            combo++;
            best = Math.max(best, combo);
            cleared++;
            const gain = 10 + Math.min(20, Math.floor(combo / 5) * 5);
            score += gain;
            ctx.setScore(score);
            ctx.fx.burst(pt.x, pt.y + 14, '#FFFFFF', 10);
            ctx.fx.float('+' + gain, pt.x + 90, pt.y - 6, '#FFD23F', 26);
            if (combo > 0 && combo % 10 === 0) {
              ctx.sfx.perfect();
              ctx.fx.float(combo + ' 콤보!', pt.x, pt.y - 70, '#FFD23F', 34);
              ctx.vibrate([15, 30, 15]);
            } else {
              ctx.sfx.good();
              ctx.vibrate(10);
            }
            ctx.setBadge(combo >= 3 ? combo + ' 콤보' : null, 'r');
          } else {
            combo = 0;
            frozenUntil = t + 500;
            ctx.lock(500);
            target.classList.remove('wrong');
            void target.offsetWidth;
            target.classList.add('wrong');
            const pt = center(ctx, target);
            ctx.fx.float('멈춤!', pt.x, pt.y - 40, '#FF8B95', 30);
            ctx.fx.shake();
            ctx.sfx.bad();
            ctx.vibrate([40, 30, 40]);
            ctx.setBadge(null);
          }
        },
        end() {},
        score: () => score,
        value: () => cleared,
        summary: () => `${cleared}개 지움 · 최고 ${best}콤보`
      };
    }
  };

  /* ================================================================
     2. 전력 질주 (연타)
     ================================================================ */
  const race = {
    id: 'race',
    title: '전력 질주',
    cat: '연타',
    catColor: 'r',
    dur: 25,
    buttons: ['r', 'b'],
    rules: ['빨강·파랑 버튼을 번갈아 누르면 달려요', '같은 버튼을 연속으로 누르면 삐끗!', '150m 결승선에 먼저 들어가면 보너스'],
    illus() {
      return `<div class="il-row il-race">
        <div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX.r};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE.r}">${shape('r', 24)}</div></div><span style="color:${LIGHT.r}">1</span></div>
        <svg width="40" height="36" viewBox="0 0 64 40" fill="none" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 H54"/><path d="M42 8 L56 20 L42 32"/></svg>
        <div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX.b};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE.b}">${shape('b', 24)}</div></div><span style="color:${LIGHT.b}">2</span></div>
        <svg width="40" height="36" viewBox="0 0 64 40" fill="none" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 H54"/><path d="M42 8 L56 20 L42 32"/></svg>
        <div class="il-btn"><div class="il-bez"><div class="il-gb" style="background:${HEX.r};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE.r}">${shape('r', 24)}</div></div><span style="color:${LIGHT.r}">3</span></div>
      </div>`;
    },
    create(ctx) {
      const GOAL = 150;
      let dist = 0;
      let last = null;
      let score = 0;
      let finishedAt = 0;
      let stumbleUntil = 0;
      let taps = [];
      const shown = {};

      const runners = ctx.players;
      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="rc-wrap">
        <div class="rc-track"><div class="rc-finish"></div><div class="rc-lanes" style="grid-template-columns:repeat(${runners.length},minmax(0,1fr))"></div></div>
        <div class="rc-meter"><div class="rc-meter-top"><span class="rc-hint"><i style="background:${HEX.r}"></i><b>→</b><i style="background:${HEX.b}"></i> 번갈아 연타!</span><span class="rc-rate"><em>0.0</em> 회/초</span></div>
        <div class="rc-pips">${'<span></span>'.repeat(12)}</div></div></div>`);
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
            p.className = i < rate ? (i < 6 ? 'on g' : i < 9 ? 'on y' : 'on r') : '';
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
          if (finishedAt || t < stumbleUntil) return;
          if (c !== 'r' && c !== 'b') return;
          if (c === last) {
            stumbleUntil = t + 250;
            ctx.lock(250);
            const pt = center(ctx, laneEls[ctx.myPid]);
            ctx.fx.float('삐끗!', pt.x, pt.y - 30, '#FF8B95', 26);
            ctx.sfx.soft();
            ctx.vibrate(35);
            return;
          }
          last = c;
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

  /* ================================================================
     3. 딱 멈춰 (타이밍)
     ================================================================ */
  const stop = {
    id: 'stop',
    title: '딱 멈춰',
    cat: '타이밍',
    catColor: 'y',
    dur: 30,
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

  /* ================================================================
     4. 신호등 (반응)
     ================================================================ */
  const signal = {
    id: 'signal',
    title: '신호등',
    cat: '반응',
    catColor: 'g',
    dur: 30,
    buttons: ['r', 'g', 'b'],
    rules: ['불이 켜지면 같은 색 버튼을 빨리!', '회색 X 불은 함정, 참으면 +20', '불 켜지기 전에 누르면 반칙 -20'],
    illus() {
      return `<div class="il-row il-lamps">
        <div class="il-lamp" style="background:${HEX.g};box-shadow:0 0 24px ${HEX.g}">${shape('g', 30)}</div>
        <div class="il-cap2">빨리 누르기</div>
        <div class="il-lamp trap"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg></div>
        <div class="il-cap2">참기</div></div>`;
    },
    create(ctx) {
      const R = rng(ctx.seed);
      let state = 'wait';
      let nextAt = 0;
      let onAt = 0;
      let color = 'r';
      let trap = false;
      let score = 0;
      let best = 0;
      let times = [];

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="sg-wrap">
        <div class="sg-msg">준비…</div>
        <div class="sg-housing"><div class="sg-lamp"><span class="sg-icon"></span></div></div>
        <div class="sg-stats"><div><span>최고 기록</span><b class="sg-best">-</b></div><div><span>평균</span><b class="sg-avg">-</b></div></div>
        <div class="sg-hist"></div></div>`);
      ctx.stage.appendChild(wrap);
      const lamp = wrap.querySelector('.sg-lamp');
      const icon = wrap.querySelector('.sg-icon');
      const msg = wrap.querySelector('.sg-msg');
      const bestEl = wrap.querySelector('.sg-best');
      const avgEl = wrap.querySelector('.sg-avg');
      const hist = wrap.querySelector('.sg-hist');

      function schedule(t, gap) {
        const delay = 700 + R() * 1300;
        trap = R() < 0.2;
        color = COLS[Math.floor(R() * 3)];
        state = 'wait';
        nextAt = t + (gap || 0) + delay;
        lamp.className = 'sg-lamp';
        lamp.style.background = '';
        lamp.style.boxShadow = '';
        icon.innerHTML = '';
      }

      function say(text, c) {
        msg.textContent = text;
        msg.style.color = c || '#F6F3FF';
        msg.classList.remove('pulse');
        void msg.offsetWidth;
        msg.classList.add('pulse');
      }

      function chip(text, cls) {
        const e = el(`<span class="${cls}">${text}</span>`);
        hist.prepend(e);
        while (hist.children.length > 6) hist.lastElementChild.remove();
      }

      function updateStats() {
        if (!times.length) return;
        bestEl.textContent = best + 'ms';
        avgEl.textContent = Math.round(times.reduce((a, b) => a + b, 0) / times.length) + 'ms';
      }

      return {
        start(t) { schedule(t, 300); say('불이 켜지면 눌러요', '#C9C3E6'); },
        tick(t) {
          if (state === 'wait' && t >= nextAt) {
            state = trap ? 'trap' : 'on';
            onAt = t;
            if (trap) {
              lamp.className = 'sg-lamp lit trap';
              icon.innerHTML = '<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>';
              say('참아요!', '#C9C3E6');
            } else {
              lamp.className = 'sg-lamp lit';
              lamp.style.background = HEX[color];
              lamp.style.boxShadow = `inset 0 8px 0 rgba(255,255,255,.35), 0 0 60px ${HEX[color]}, 0 0 120px ${HEX[color]}66`;
              icon.innerHTML = shape(color, 54);
              say(KNAME[color] + '!', LIGHT[color]);
              ctx.sfx.lamp();
            }
          } else if (state === 'on' && t - onAt > 1500) {
            say('늦었어요', '#FF8B95');
            chip('늦음', 'miss');
            schedule(t, 400);
          } else if (state === 'trap' && t - onAt > 1200) {
            score += 20;
            ctx.setScore(score);
            say('잘 참았어요 +20', '#7DF0AE');
            chip('+20', 'good');
            ctx.sfx.good();
            schedule(t, 300);
          } else if (state === 'show' && t >= nextAt) {
            schedule(t, 0);
          }
        },
        onPress(c, t) {
          const pt = center(ctx, lamp);
          if (state === 'wait') {
            score = Math.max(0, score - 20);
            say('반칙! -20', '#FF8B95');
            chip('반칙', 'miss');
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([40, 30, 40]);
            ctx.lock(600);
            state = 'show';
            nextAt = t + 600;
          } else if (state === 'trap') {
            score = Math.max(0, score - 30);
            say('함정! -30', '#FF8B95');
            chip('함정', 'miss');
            ctx.sfx.bad();
            ctx.fx.shake();
            ctx.vibrate([60, 30, 60]);
            ctx.lock(600);
            lamp.className = 'sg-lamp';
            icon.innerHTML = '';
            state = 'show';
            nextAt = t + 600;
          } else if (state === 'on') {
            if (c === color) {
              const rt = Math.round(t - onAt);
              const gain = Math.max(10, 100 - Math.floor(Math.max(0, rt - 150) / 8));
              score += gain;
              times.push(rt);
              best = best ? Math.min(best, rt) : rt;
              updateStats();
              say(rt + 'ms  +' + gain, rt < 320 ? '#FFD23F' : LIGHT[color]);
              chip(rt + '', rt < 320 ? 'perfect' : 'good');
              ctx.fx.burst(pt.x, pt.y, HEX[color], rt < 320 ? 22 : 12);
              if (rt < 320) { ctx.sfx.perfect(); ctx.vibrate([15, 25, 15]); } else { ctx.sfx.good(); ctx.vibrate(12); }
            } else {
              score = Math.max(0, score - 10);
              say('색이 달라요 -10', '#FF8B95');
              chip('X', 'miss');
              ctx.sfx.bad();
              ctx.vibrate([40, 30, 40]);
              ctx.lock(400);
            }
            lamp.className = 'sg-lamp';
            lamp.style.background = '';
            lamp.style.boxShadow = '';
            icon.innerHTML = '';
            state = 'show';
            nextAt = t + 500;
          }
          ctx.setScore(score);
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => best ? `최고 ${best}ms` : '기록 없음'
      };
    }
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  race.pressSound = false;

  const ALL = { blocks, race, stop, signal };
  window.Games = {
    ALL, HEX, SHADE, LIGHT, COLS, KNAME, SHAPE,
    shape, rng, el, center, esc: escapeHtml,
    get: (id) => ALL[id]
  };
})();
