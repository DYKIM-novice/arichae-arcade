/* 아리채 오락실 · 크레인 낙하 (타이밍)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, el, msgPop } = G.kit;

  const crane = {
    id: 'crane', title: '크레인 낙하', cat: '타이밍', catColor: 'y', buttons: ['r', 'g', 'b'],
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

  G.register(crane);
})();
