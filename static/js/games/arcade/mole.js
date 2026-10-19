/* 아리채 오락실 · 두더지 잡기 (반응)
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, LIGHT, shape, el, center, IDX, msgPop, durOf } = G.kit;

  const MOLE_SVG = {
    mole: '<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="62" rx="40" ry="44" fill="#9C6B45"/><ellipse cx="50" cy="74" rx="24" ry="20" fill="#E9C4A0"/><circle cx="36" cy="52" r="5" fill="#1C1733"/><circle cx="64" cy="52" r="5" fill="#1C1733"/><circle cx="37.5" cy="50.5" r="1.6" fill="#fff"/><circle cx="65.5" cy="50.5" r="1.6" fill="#fff"/><ellipse cx="50" cy="64" rx="8" ry="6" fill="#FF7FA0"/><path d="M44 74 Q50 79 56 74" stroke="#1C1733" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="45" y="76" width="4" height="6" rx="1" fill="#fff"/><rect x="51" y="76" width="4" height="6" rx="1" fill="#fff"/></svg>',
    gold: '<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="62" rx="40" ry="44" fill="#FFD23F"/><ellipse cx="50" cy="74" rx="24" ry="20" fill="#FFF0B3"/><path d="M30 20 L36 34 L44 22 L50 34 L56 22 L64 34 L70 20 L68 38 L32 38 Z" fill="#FF8A3D"/><circle cx="36" cy="52" r="5" fill="#1C1733"/><circle cx="64" cy="52" r="5" fill="#1C1733"/><ellipse cx="50" cy="64" rx="8" ry="6" fill="#FF7FA0"/><path d="M44 74 Q50 79 56 74" stroke="#1C1733" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>',
    bomb: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="62" r="34" fill="#2B2D42"/><circle cx="38" cy="50" r="8" fill="#fff" opacity=".25"/><rect x="42" y="22" width="16" height="12" rx="3" fill="#5A5675"/><path d="M50 22 Q56 10 66 12" stroke="#C9C3E6" stroke-width="3" fill="none"/><circle cx="68" cy="11" r="5" fill="#FF8A3D"/><circle cx="68" cy="11" r="2.5" fill="#FFD23F"/><path d="M38 66 L46 60 M62 66 L54 60" stroke="#FF4757" stroke-width="4" stroke-linecap="round"/></svg>'
  };

  const mole = {
    id: 'mole', title: '두더지 잡기', cat: '반응', catColor: 'g', buttons: ['r', 'g', 'b'],
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

  G.register(mole);
})();
