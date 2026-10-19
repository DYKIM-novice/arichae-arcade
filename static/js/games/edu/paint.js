/* 아리채 오락실 · 물감 섞기 (물감 공방) — 초(빨노파)·중(청록·자홍·노랑)
   과학관·음악관 게임 — 방장이 고른 난이도로, 서버가 준 같은 시드로 가족 모두 같은 문제를 풀어요. */
(function () {
  'use strict';

  const G = window.Games;
  const {
    rng, el, center, IDX, msgPop, retrigger, SLOTS, BIT, pickNoRepeat, eunNeun, iGa,
    recipeText
  } = G.kit;

  const PAINT = {
    e: {
      paints: { 1: { name: '빨강', hex: '#E8262B', shade: '#9E1418' }, 2: { name: '노랑', hex: '#FFD400', shade: '#B89700', ic: '#3A2E00' }, 4: { name: '파랑', hex: '#1F5BD6', shade: '#123A8C' } },
      mix: { 1: '빨강', 2: '노랑', 4: '파랑', 3: '주황', 6: '초록', 5: '보라', 7: '탁한 갈색' },
      hex: { 1: '#E8262B', 2: '#FFD400', 4: '#1F5BD6', 3: '#FF8A1F', 6: '#2FAE4E', 5: '#8B3FB8', 7: '#6B4A2E' },
      targets: [3, 6, 5, 3, 6, 5, 1, 2, 4],
      guide: [3, 6, 5]
    },
    m: {
      paints: { 1: { name: '자홍', hex: '#E6007E', shade: '#9A0055' }, 2: { name: '노랑', hex: '#FFE100', shade: '#B89F00', ic: '#3A2E00' }, 4: { name: '청록', hex: '#00A0E0', shade: '#006A96' } },
      mix: { 1: '자홍', 2: '노랑', 4: '청록', 3: '빨강', 6: '초록', 5: '파랑', 7: '검정' },
      hex: { 1: '#E6007E', 2: '#FFE100', 4: '#00A0E0', 3: '#E8202A', 6: '#12A54A', 5: '#2B3990', 7: '#1E1B1E' },
      targets: [3, 6, 5, 7, 3, 6, 5, 7, 3, 6, 5],
      guide: [3, 6, 5, 7]
    }
  };
  const BLOB = (c) => `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true"><path d="M50 6 C70 6 92 22 92 46 C92 74 74 94 50 94 C24 94 8 76 8 50 C8 24 28 6 50 6 Z" fill="${c}"/><ellipse cx="34" cy="30" rx="12" ry="8" fill="#fff" opacity=".35"/></svg>`;

  const paint = {
    id: 'paint', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 C31 4 37 11 37 19 C37 25 32 26 28 25 C24 24 23 27 25 31 C27 35 24 37 20 37 C10 37 3 30 3 20 C3 11 10 4 20 4 Z" fill="#F2E3C6"/><circle cx="12" cy="17" r="3.6" fill="#E8262B"/><circle cx="19" cy="11" r="3.6" fill="#FFD400"/><circle cx="28" cy="13" r="3.6" fill="#1F5BD6"/><circle cx="12" cy="27" r="3.6" fill="#2FAE4E"/></svg>`, hall: '물감 공방', title: '물감 섞기', cat: '색의 혼합', catColor: 'r', levels: ['e', 'm'],
    buttons: ['r', 'g', 'b'],
    buttonStyle(lv) {
      const P = PAINT[lv].paints;
      return {
        r: { c: P[1].hex, s: P[1].shade, name: P[1].name, ic: P[1].ic },
        g: { c: P[2].hex, s: P[2].shade, name: P[2].name, ic: P[2].ic },
        b: { c: P[4].hex, s: P[4].shade, name: P[4].name, ic: P[4].ic }
      };
    },
    rules(lv) {
      return lv === 'e'
        ? ['버튼 색 = 물감 색이에요 (빨강·노랑·파랑)', '목표 색에 필요한 물감만 넣어요', '아래 가이드 표에 만드는 법이 있어요']
        : ['버튼이 청록·자홍·노랑 물감으로 바뀌었어요', '필요 없는 물감을 넣으면 다시 해야 해요', '가이드 표를 보고 빨리 만들어요'];
    },
    illus(lv) {
      const P = PAINT[lv === 'm' ? 'm' : 'e'];
      const k = lv === 'm' ? 3 : 6;
      const [a, b] = [1, 2, 4].filter((x) => k & x);
      return `<div class="il-row" style="gap:10px">
        <div style="width:58px">${BLOB(P.paints[a].hex)}</div><b class="il-op">+</b>
        <div style="width:58px">${BLOB(P.paints[b].hex)}</div><b class="il-op">=</b>
        <div style="width:72px">${BLOB(P.hex[k])}</div></div>
        <div class="il-cap" style="margin-top:8px">${P.paints[a].name} + ${P.paints[b].name} = <b>${P.mix[k]}</b></div>`;
    },
    learn(lv) {
      return lv === 'e'
        ? '물감은 섞을수록 어두워져요. 빨강+노랑=주황, 노랑+파랑=초록, 빨강+파랑=보라. 세 가지를 모두 섞으면 탁한 갈색이 돼요.'
        : '물감(색료)의 삼원색은 청록·자홍·노랑이에요. 섞을수록 어두워지는 감산 혼합! 자홍+노랑=빨강, 청록+노랑=초록, 청록+자홍=파랑, 셋 다 섞으면 검정. 프린터 잉크도 이 세 가지를 써요.';
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const lv = ctx.level === 'm' ? 'm' : 'e';
      const P = PAINT[lv];
      let bowl = 0;
      let target = 0;
      let askAt = 0;
      let lockUntil = 0;
      let score = 0;
      let made = 0;
      let mistakes = 0;
      let streak = 0;

      ctx.stage.innerHTML = '';
      const dot = (b) => `<i style="background:${P.paints[b].hex}"></i>`;
      const wrap = el(`<div class="pt-wrap lv-${lv}">
        <div class="pt-top"><span>이 색을 만들어요</span><div class="pt-target"></div><b class="disp pt-tname"></b></div>
        <div class="pt-msg disp"></div>
        <div class="pt-stage"><div class="pt-bowl"><div class="pt-paint"></div></div><div class="pt-added"></div></div>
        <div class="pt-guide">${P.guide.map((k) => `<div class="pt-row" data-k="${k}">
          ${[1, 2, 4].filter((b) => k & b).map(dot).join('<em>+</em>')}<em>=</em>
          <span class="pt-chip" style="background:${P.hex[k]}"></span><b>${P.mix[k]}</b></div>`).join('')}</div>
      </div>`);
      ctx.stage.appendChild(wrap);
      const tBlob = wrap.querySelector('.pt-target');
      const tName = wrap.querySelector('.pt-tname');
      const msg = wrap.querySelector('.pt-msg');
      const paintEl = wrap.querySelector('.pt-paint');
      const added = wrap.querySelector('.pt-added');
      const stageEl = wrap.querySelector('.pt-stage');
      const rows = Array.from(wrap.querySelectorAll('.pt-row'));

      function renderBowl() {
        paintEl.style.background = bowl ? P.hex[bowl] : 'transparent';
        paintEl.classList.toggle('full', !!bowl);
        added.innerHTML = [1, 2, 4].filter((b) => bowl & b).map((b) => `<span style="background:${P.paints[b].hex}">${P.paints[b].name}</span>`).join('');
      }
      function nextTarget(t) {
        target = pickNoRepeat(R, P.targets, target);
        bowl = 0;
        askAt = t;
        tBlob.innerHTML = BLOB(P.hex[target]);
        tName.textContent = P.mix[target];
        rows.forEach((r) => r.classList.toggle('hint', lv === 'e' && Number(r.dataset.k) === target));
        msgPop(msg, '필요한 물감을 넣어요', '#C9C3E6');
        renderBowl();
      }
      function dropAnim(b) {
        const d = el(`<i class="pt-drop" style="background:${P.paints[b].hex};left:${30 + IDX[SLOTS[[1, 2, 4].indexOf(b)]] * 20}%"></i>`);
        stageEl.appendChild(d);
        setTimeout(() => d.remove(), 450);
      }

      return {
        start(t) { nextTarget(t); },
        tick(t) {
          if (lockUntil && t >= lockUntil) {
            lockUntil = 0;
            nextTarget(t);
          }
        },
        onPress(c, t) {
          if (lockUntil) return;
          const b = BIT[c];
          if (bowl & b) {
            msgPop(msg, `${eunNeun(P.paints[b].name)} 이미 넣었어요`, '#C9C3E6');
            return;
          }
          dropAnim(b);
          ctx.sfx.pump();
          if (!(target & b)) {
            bowl |= b;
            renderBowl();
            paintEl.style.background = '#6B5A4E';
            mistakes++;
            streak = 0;
            score = Math.max(0, score - 10);
            ctx.setScore(score);
            msgPop(msg, `${P.mix[target]}에는 ${iGa(P.paints[b].name)} 필요 없어요`, '#FF8B95');
            ctx.sfx.bad();
            ctx.vibrate([40, 30, 40]);
            ctx.setBadge(null);
            lockUntil = t + 1100;
            return;
          }
          bowl |= b;
          renderBowl();
          if (bowl === target) {
            const quick = Math.max(0, Math.round(50 * (1 - (t - askAt) / 6000)));
            streak++;
            made++;
            const gain = 100 + quick + Math.min(30, (streak - 1) * 10);
            score += gain;
            ctx.setScore(score);
            const n = [1, 2, 4].filter((x) => target & x).length;
            msgPop(msg, n > 1 ? `${recipeText(P.paints, target)} = ${P.mix[target]}!` : `${P.mix[target]} 완성!`, '#FFD23F');
            const p = center(ctx, paintEl);
            ctx.fx.burst(p.x, p.y, P.hex[target], 18);
            ctx.fx.float('+' + gain, p.x, p.y - 50, '#FFD23F', 30);
            ctx.sfx.perfect();
            ctx.vibrate([15, 25, 15]);
            ctx.setBadge(streak >= 2 ? `${streak}연속` : null, 'r');
            const row = rows.find((r) => Number(r.dataset.k) === target);
            if (row) retrigger(row, 'hit');
            lockUntil = t + 900;
          }
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${made}가지 색 완성 · 실수 ${mistakes}번`
      };
    }
  };

  G.register(paint);
})();
