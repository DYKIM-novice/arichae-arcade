/* 아리채 오락실 · 행성 찾기 (우주관) — 초·중
   과학관·음악관 게임 — 방장이 고른 난이도로, 서버가 준 같은 시드로 가족 모두 같은 문제를 풀어요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, shape, el, center, esc, IDX, msgPop, retrigger, SLOTS, shuffle } = G.kit;

  // 행성 그림: 직접 그린 단순한 원형 그림
  function planetSVG(id, uid) {
    const g = `pg_${id}_${uid || 0}`;
    const ball = (c1, c2, extra) => `<defs><radialGradient id="${g}" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>
      <clipPath id="${g}c"><circle cx="50" cy="50" r="30"/></clipPath></defs>
      <circle cx="50" cy="50" r="30" fill="url(#${g})"/><g clip-path="url(#${g}c)">${extra || ''}</g>
      <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/>`;
    const P = {
      mercury: ball('#C9C6CC', '#6E6A73', '<circle cx="40" cy="40" r="5" fill="#8A868F"/><circle cx="60" cy="58" r="7" fill="#8A868F"/><circle cx="55" cy="32" r="3" fill="#8A868F"/><circle cx="36" cy="62" r="4" fill="#8A868F"/>'),
      venus: ball('#FFF0B8', '#C99A3E', '<path d="M18 40 Q50 30 82 44" stroke="#F2D58A" stroke-width="6" fill="none"/><path d="M18 58 Q50 50 82 62" stroke="#E3B95C" stroke-width="5" fill="none"/>'),
      earth: ball('#6FB8FF', '#1E4FA8', '<path d="M30 32 Q40 26 46 34 Q44 44 36 46 Q28 42 30 32 Z M54 48 Q66 44 72 54 Q68 66 58 68 Q52 60 54 48 Z M40 60 Q46 58 48 64 Q44 70 40 66 Z" fill="#4CC36A"/><path d="M24 50 Q36 46 44 52 M58 30 Q68 28 76 36" stroke="#fff" stroke-width="3" fill="none" opacity=".8" stroke-linecap="round"/>'),
      mars: ball('#FF9B6B', '#A8381C', '<path d="M30 50 Q42 44 50 52 Q44 60 34 58 Z M56 36 Q66 34 70 42 Q62 46 56 42 Z" fill="#8E2E16" opacity=".7"/><ellipse cx="50" cy="22" rx="10" ry="4" fill="#fff"/>'),
      jupiter: ball('#F5D7A8', '#B9773E', '<rect x="10" y="30" width="80" height="5" fill="#C98A4F"/><rect x="10" y="40" width="80" height="7" fill="#E6B07A"/><rect x="10" y="52" width="80" height="6" fill="#B87440"/><rect x="10" y="63" width="80" height="4" fill="#D89A5C"/><ellipse cx="60" cy="56" rx="7" ry="4" fill="#C2452C"/>'),
      saturn: `<ellipse cx="50" cy="50" rx="46" ry="12" fill="none" stroke="#C9B27A" stroke-width="5" transform="rotate(-18 50 50)"/>` + ball('#FBE6A6', '#C7A04F', '<rect x="10" y="40" width="80" height="5" fill="#E8C878"/><rect x="10" y="55" width="80" height="4" fill="#D9B464"/>') + `<path d="M8 62 Q50 72 92 38" fill="none" stroke="#E6D29C" stroke-width="5" transform="rotate(0)"/>`,
      uranus: `<ellipse cx="50" cy="50" rx="10" ry="42" fill="none" stroke="#BDEFF2" stroke-width="2.5" opacity=".8"/>` + ball('#C9FBFF', '#4FB7C9', '<rect x="10" y="46" width="80" height="4" fill="#9DE6EE" opacity=".7"/>') + `<path d="M50 92 Q58 70 56 66" stroke="#BDEFF2" stroke-width="2.5" fill="none" opacity=".8"/>`,
      neptune: ball('#6F9BFF', '#1A2F9E', '<ellipse cx="42" cy="56" rx="8" ry="4" fill="#132275"/><path d="M20 40 Q50 34 80 42" stroke="#8FB3FF" stroke-width="3" fill="none" opacity=".7"/>'),
      sun: `<circle cx="50" cy="50" r="44" fill="#FFB020" opacity=".25"/><circle cx="50" cy="50" r="36" fill="#FFC93C"/><circle cx="50" cy="50" r="28" fill="#FFE27A"/>`
    };
    return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">${P[id]}</svg>`;
  }
  const PLANETS = [
    { id: 'mercury', n: '수성', hint: '가장 작고 태양에 제일 가까워요', fact: '태양에서 가장 가까운 행성. 공기가 거의 없어 구덩이(크레이터)투성이예요.' },
    { id: 'venus', n: '금성', hint: '두꺼운 노란 구름, 가장 뜨거워요', fact: '두꺼운 구름이 열을 가둬서 가장 뜨거운 행성(약 460℃)이에요. 새벽·저녁에 밝게 보여요.' },
    { id: 'earth', n: '지구', hint: '파란 바다와 초록 땅', fact: '우리가 사는 행성! 물이 액체로 있어서 생명이 살 수 있어요.' },
    { id: 'mars', n: '화성', hint: '붉은 흙과 먼지로 덮였어요', fact: '흙 속 철이 녹슬어 붉게 보여요. 탐사 로버가 돌아다니고 있어요.' },
    { id: 'jupiter', n: '목성', hint: '줄무늬와 커다란 붉은 점', fact: '가장 큰 행성! 지구가 1,300개 넘게 들어가요. 붉은 점은 거대한 폭풍이에요.' },
    { id: 'saturn', n: '토성', hint: '멋진 고리가 있어요', fact: '고리는 얼음과 돌 조각이에요. 아주 가벼워서 커다란 물에 넣으면 뜰 정도예요.' },
    { id: 'uranus', n: '천왕성', hint: '옆으로 누워서 돌아요', fact: '자전축이 거의 누워 있어서 굴러가듯 태양을 돌아요.' },
    { id: 'neptune', n: '해왕성', hint: '태양에서 가장 멀고 바람이 세요', fact: '태양에서 가장 먼 행성. 태양계에서 바람이 가장 강해요.' }
  ];
  const PL = {};
  PLANETS.forEach((p, i) => { p.order = i + 1; PL[p.id] = p; });
  const STARS = (n, R) => Array.from({ length: n }, () => `<i style="left:${(R() * 100).toFixed(1)}%;top:${(R() * 100).toFixed(1)}%;animation-delay:${(R() * 3).toFixed(2)}s;transform:scale(${(0.4 + R() * 0.9).toFixed(2)})"></i>`).join('');

  const space = {
    id: 'space', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><ellipse cx="20" cy="20" rx="18" ry="5" fill="none" stroke="#C9B27A" stroke-width="2.4" transform="rotate(-18 20 20)"/><circle cx="20" cy="20" r="11" fill="#F2D27E"/><rect x="9" y="17" width="22" height="2.4" fill="#D9B464"/><path d="M3 24 Q20 30 37 15" fill="none" stroke="#E6D29C" stroke-width="2.4"/><circle cx="6" cy="7" r="1.2" fill="#fff"/><circle cx="33" cy="33" r="1" fill="#fff"/><circle cx="34" cy="6" r="1.4" fill="#fff"/></svg>`,
    hall: '우주관', title: '행성 찾기', cat: '태양계', catColor: 'b', levels: ['e', 'm'],
    buttons: ['r', 'g', 'b'],
    rules(lv) {
      return lv === 'e'
        ? ['행성 그림과 힌트를 보고 이름을 골라요', '보기 3개 중 맞는 자리 버튼!', '정답 뒤에 재미있는 행성 이야기가 나와요']
        : ['행성 카드 3장이 나와요', '태양에서 가까운 행성부터 순서대로 눌러요', '위의 "수금지화목토천해"를 보면 쉬워요'];
    },
    illus(lv) {
      if (lv === 'm') {
        return `<div class="il-row" style="gap:6px">${['mars', 'earth', 'saturn'].map((id, i) =>
          `<div class="il-hcard" style="padding-top:22px"><b style="background:${['#FF4757', '#2ED573', '#3D7BFF'][i]}">${[2, 1, 3][i]}</b><div style="width:46px;height:46px">${planetSVG(id, 'il')}</div></div>`).join('')}</div>
          <div class="il-cap" style="margin-top:8px">태양에서 가까운 순서: 지구 → 화성 → 토성</div>`;
      }
      return `<div class="il-row" style="gap:16px"><div style="width:110px;height:110px">${planetSVG('saturn', 'il')}</div>
        <div class="il-cap" style="text-align:left">"멋진 고리가 있어요"<br>→ <b style="color:#FFE27A">토성</b></div></div>`;
    },
    learn(lv) {
      return lv === 'e'
        ? '태양계에는 행성이 8개 있어요. 화성은 붉고, 목성은 가장 크고, 토성은 고리가 멋져요. 지구는 생명이 사는 유일한 행성이에요.'
        : '태양에서 가까운 순서는 "수금지화목토천해"! 수성·금성·지구·화성은 돌로 된 작은 행성, 목성·토성·천왕성·해왕성은 기체와 얼음으로 된 큰 행성이에요.';
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const lv = ctx.level === 'm' ? 'm' : 'e';
      let q = null;
      let step = 0;
      let askAt = 0;
      let lockUntil = 0;
      let score = 0;
      let right = 0;
      let total = 0;
      let streak = 0;
      let lastKey = '';
      let uid = 0;

      ctx.stage.innerHTML = '';
      const strip = `<div class="sp-strip${lv === 'm' ? ' named' : ''}"><div class="sp-sun">${planetSVG('sun', 's')}</div>${PLANETS.map((p) =>
        `<div class="sp-mini" data-p="${p.id}"><div class="sp-mpic">${planetSVG(p.id, 's')}</div><span>${lv === 'm' ? p.n[0] : ''}</span></div>`).join('')}</div>`;
      const body = lv === 'e'
        ? `<div class="sp-main"><div class="sp-orbit"><div class="sp-planet"></div></div><div class="sp-hint disp"></div></div>
           <div class="sp-opts">${SLOTS.map((c) => `<div class="sp-opt"><b class="disp"></b><span class="sp-tag" style="background:${G.HEX[c]}">${shape(c, 14)}</span></div>`).join('')}</div>`
        : `<div class="sp-msg disp">태양에서 가까운 것부터!</div>
           <div class="sp-cards">${SLOTS.map((c) => `<div class="sp-card"><b class="sp-num"></b><div class="sp-cpic"></div><div class="sp-cname disp"></div>
             <span class="sp-tag" style="background:${G.HEX[c]}">${shape(c, 14)}</span></div>`).join('')}</div>`;
      const wrap = el(`<div class="sp-wrap lv-${lv}"><div class="sp-stars">${STARS(46, R)}</div>${strip}${body}<div class="sp-fact"></div></div>`);
      ctx.stage.appendChild(wrap);
      const fact = wrap.querySelector('.sp-fact');
      const minis = Array.from(wrap.querySelectorAll('.sp-mini'));

      function markMini(ids, cls) {
        minis.forEach((m) => m.classList.toggle(cls, ids.includes(m.dataset.p)));
      }
      function nextE(t) {
        let ans;
        do { ans = PLANETS[Math.floor(R() * PLANETS.length)]; } while (ans.id === lastKey);
        lastKey = ans.id;
        const others = shuffle(R, PLANETS.filter((p) => p.id !== ans.id)).slice(0, 2);
        q = { ans, choices: shuffle(R, [ans, ...others]) };
        wrap.querySelector('.sp-planet').innerHTML = planetSVG(ans.id, ++uid);
        retrigger(wrap.querySelector('.sp-orbit'), 'in');
        wrap.querySelector('.sp-hint').textContent = `"${ans.hint}"`;
        wrap.querySelectorAll('.sp-opt').forEach((o, i) => {
          o.className = 'sp-opt';
          o.querySelector('b').textContent = q.choices[i].n;
        });
        fact.innerHTML = '';
        minis.forEach((m) => m.classList.remove('hl', 'show'));
        askAt = t;
        total++;
      }
      function nextM(t) {
        let set;
        for (let k = 0; k < 50; k++) {
          set = shuffle(R, PLANETS).slice(0, 3);
          if (set.map((p) => p.id).sort().join() !== lastKey) break;
        }
        lastKey = set.map((p) => p.id).sort().join();
        const order = set.slice().sort((a, b) => a.order - b.order);
        q = { cards: set, order: order.map((p) => set.indexOf(p)) };
        step = 0;
        wrap.querySelectorAll('.sp-card').forEach((c, i) => {
          c.className = 'sp-card';
          c.querySelector('.sp-num').textContent = '';
          c.querySelector('.sp-cpic').innerHTML = planetSVG(set[i].id, ++uid);
          c.querySelector('.sp-cname').textContent = set[i].n;
        });
        msgPop(wrap.querySelector('.sp-msg'), '태양에서 가까운 것부터!', '#F6F3FF');
        fact.innerHTML = '';
        minis.forEach((m) => m.classList.remove('hl', 'show'));
        askAt = t;
        total++;
      }
      const next = (t) => (lv === 'e' ? nextE(t) : nextM(t));
      function win(t, p, txt, factTxt) {
        streak++;
        right++;
        const quick = Math.max(0, Math.round((lv === 'e' ? 40 : 60) * (1 - (t - askAt) / (lv === 'e' ? 5000 : 8000))));
        const gain = (lv === 'e' ? 50 : 100) + quick + Math.min(30, (streak - 1) * 10);
        score += gain;
        ctx.setScore(score);
        ctx.fx.burst(p.x, p.y, '#FFE27A', 16);
        ctx.fx.float('+' + gain, p.x, p.y - 40, '#FFD23F', 28);
        ctx.sfx.perfect();
        ctx.vibrate([15, 25, 15]);
        ctx.setBadge(streak >= 2 ? `${streak}연속` : null, 'b');
        fact.innerHTML = `<b>${txt}</b> ${esc(factTxt)}`;
        fact.classList.remove('bad');
      }
      function lose(txt, factTxt) {
        streak = 0;
        score = Math.max(0, score - (lv === 'e' ? 10 : 20));
        ctx.setScore(score);
        ctx.sfx.bad();
        ctx.vibrate([40, 30, 40]);
        ctx.setBadge(null);
        fact.innerHTML = `<b>${txt}</b> ${esc(factTxt)}`;
        fact.classList.add('bad');
      }

      return {
        start(t) { next(t); },
        tick(t) {
          if (lockUntil && t >= lockUntil) {
            lockUntil = 0;
            next(t);
          }
        },
        onPress(c, t) {
          if (lockUntil) return;
          const i = IDX[c];
          if (lv === 'e') {
            const opts = wrap.querySelectorAll('.sp-opt');
            const chosen = q.choices[i];
            q.choices.forEach((p, k) => { if (p === q.ans) opts[k].classList.add('right'); });
            markMini([q.ans.id], 'hl');
            const p = center(ctx, opts[i]);
            if (chosen === q.ans) {
              win(t, p, `${q.ans.n}!`, q.ans.fact);
              lockUntil = t + 1900;
            } else {
              opts[i].classList.add('wrong');
              lose(`정답은 ${q.ans.n}.`, q.ans.fact);
              lockUntil = t + 2600;
            }
            return;
          }
          const cards = wrap.querySelectorAll('.sp-card');
          const card = cards[i];
          if (card.classList.contains('done')) return;
          if (q.order[step] === i) {
            card.classList.add('done');
            card.querySelector('.sp-num').textContent = step + 1;
            markMini([q.cards[i].id], 'show');
            step++;
            ctx.sfx.good();
            ctx.vibrate(10);
            if (step === 3) {
              const names = q.order.map((k) => q.cards[k].n).join(' → ');
              markMini(q.cards.map((x) => x.id), 'hl');
              win(t, center(ctx, wrap.querySelector('.sp-msg')), '정답!', names);
              msgPop(wrap.querySelector('.sp-msg'), '완벽해요!', '#FFD23F');
              lockUntil = t + 2000;
            }
          } else {
            card.classList.add('wrong');
            q.order.forEach((k, r) => {
              cards[k].querySelector('.sp-num').textContent = r + 1;
              if (!cards[k].classList.contains('done')) cards[k].classList.add('missed');
            });
            markMini(q.cards.map((x) => x.id), 'hl');
            const names = q.order.map((k) => q.cards[k].n).join(' → ');
            msgPop(wrap.querySelector('.sp-msg'), '순서가 달라요!', '#FF8B95');
            lose('가까운 순서:', names);
            lockUntil = t + 2800;
          }
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${total}문제 중 ${right}개 정답`
      };
    }
  };

  G.register(space);
})();
