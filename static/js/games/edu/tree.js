/* 아리채 오락실 · 진화 나무 오르기 (생명의 나무) — 초·중
   과학관·음악관 게임 — 방장이 고른 난이도로, 서버가 준 같은 시드로 가족 모두 같은 문제를 풀어요. */
(function () {
  'use strict';

  const G = window.Games;
  const {
    rng, shape, el, center, IDX, msgPop, retrigger, SLOTS, shuffle, hasBatchim,
    eunNeun, EYE, CR
  } = G.kit;

  const TG = {
    mammal: { n: '포유류', hint: '새끼에게 젖을 먹여요', c: '#FF8A5B' },
    bird: { n: '조류', hint: '깃털과 부리가 있어요', c: '#5BB8FF' },
    fish: { n: '어류', hint: '아가미로 숨 쉬어요', c: '#3DD6D0' },
    reptile: { n: '파충류', hint: '비늘 피부, 알을 낳아요', c: '#8DB33A' },
    amphibian: { n: '양서류', hint: '물과 땅을 오가요', c: '#B98CFF' },
    insect: { n: '곤충', hint: '다리가 6개예요', c: '#FFC93C' }
  };
  const ieyo = (w) => w + (hasBatchim(w) ? '이에요' : '예요');
  const BUG = {
    snake: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M6 36 Q14 26 24 34 Q34 42 42 30 Q48 20 40 14" fill="none" stroke="#5DB36A" stroke-width="9" stroke-linecap="round"/><path d="M6 36 Q14 26 24 34 Q34 42 42 30" fill="none" stroke="#86D18F" stroke-width="3" stroke-dasharray="3 5" stroke-linecap="round"/><ellipse cx="44" cy="12" rx="9" ry="7" fill="#5DB36A"/>${EYE(47, 10)}<path d="M53 13 L58 12 M58 12 L60 10 M58 12 L60 14" stroke="#E8455A" stroke-width="1.5"/></svg>`,
    croc: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M2 28 Q10 22 22 22 L50 20 Q58 21 58 26 L58 30 L22 32 Q10 34 2 28 Z" fill="#4E9A54"/><path d="M26 22 L28 18 L31 22 L34 18 L37 22 L40 18 L43 21" fill="#3E7F43"/><path d="M36 26 L58 26" stroke="#2F6233" stroke-width="1.5"/><path d="M40 26 L42 29 L44 26 L46 29 L48 26 L50 29 L52 26" fill="#fff"/><path d="M16 32 L14 38 M28 32 L27 38" stroke="#4E9A54" stroke-width="4" stroke-linecap="round"/>${EYE(40, 19)}</svg>`,
    lizard: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M4 30 Q14 34 22 28" fill="none" stroke="#F2A93B" stroke-width="5" stroke-linecap="round"/><ellipse cx="32" cy="26" rx="12" ry="6" fill="#F2A93B"/><ellipse cx="48" cy="24" rx="7" ry="5" fill="#F2A93B"/><path d="M26 30 L22 38 M36 30 L40 38 M28 22 L24 14 M38 22 L42 14" stroke="#F2A93B" stroke-width="3.5" stroke-linecap="round"/><circle cx="30" cy="25" r="2" fill="#D9862A"/><circle cx="36" cy="27" r="1.6" fill="#D9862A"/>${EYE(50, 22)}</svg>`,
    salamander: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M4 26 Q14 18 22 24" fill="none" stroke="#FF8FB8" stroke-width="5" stroke-linecap="round"/><ellipse cx="33" cy="25" rx="13" ry="6" fill="#FF8FB8"/><ellipse cx="49" cy="24" rx="8" ry="6" fill="#FF8FB8"/><path d="M44 18 L42 12 M47 17 L46 11 M52 18 L54 12" stroke="#E86F9B" stroke-width="2" stroke-linecap="round"/><path d="M27 30 L24 37 M38 30 L41 37" stroke="#FF8FB8" stroke-width="3.5" stroke-linecap="round"/>${EYE(51, 22)}<path d="M50 27 Q53 28 56 26" stroke="#1C1733" stroke-width="1.2" fill="none"/></svg>`,
    butterfly: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M30 22 Q16 2 6 10 Q2 20 16 24 Q4 30 10 38 Q20 42 30 26 Z" fill="#FF7AB8"/><path d="M30 22 Q44 2 54 10 Q58 20 44 24 Q56 30 50 38 Q40 42 30 26 Z" fill="#FF7AB8"/><circle cx="14" cy="14" r="3" fill="#FFE27A"/><circle cx="46" cy="14" r="3" fill="#FFE27A"/><rect x="28" y="12" width="4" height="24" rx="2" fill="#3A2E3E"/><path d="M29 12 Q26 4 22 4 M31 12 Q34 4 38 4" stroke="#3A2E3E" stroke-width="1.5" fill="none"/></svg>`,
    ladybug: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M16 22 L8 18 M16 28 L8 30 M44 22 L52 18 M44 28 L52 30 M18 34 L12 40 M42 34 L48 40" stroke="#1C1733" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="30" cy="27" rx="15" ry="13" fill="#E8262B"/><path d="M30 14 L30 40" stroke="#1C1733" stroke-width="2"/><circle cx="23" cy="24" r="3" fill="#1C1733"/><circle cx="37" cy="24" r="3" fill="#1C1733"/><circle cx="24" cy="33" r="2.4" fill="#1C1733"/><circle cx="36" cy="33" r="2.4" fill="#1C1733"/><ellipse cx="30" cy="12" rx="8" ry="5" fill="#1C1733"/><circle cx="27" cy="11" r="1.4" fill="#fff"/><circle cx="33" cy="11" r="1.4" fill="#fff"/></svg>`,
    bee: `<svg viewBox="0 0 60 44" aria-hidden="true"><ellipse cx="24" cy="12" rx="9" ry="7" fill="#DDF2FF" opacity=".9"/><ellipse cx="36" cy="12" rx="9" ry="7" fill="#DDF2FF" opacity=".9"/><ellipse cx="30" cy="26" rx="16" ry="11" fill="#FFC93C"/><rect x="22" y="15" width="5" height="22" fill="#2B2238"/><rect x="32" y="15" width="5" height="22" fill="#2B2238"/><path d="M46 26 L52 26" stroke="#2B2238" stroke-width="2.4"/><circle cx="17" cy="24" r="2.2" fill="#1C1733"/><path d="M18 34 L16 40 M26 36 L25 42 M34 36 L35 42" stroke="#2B2238" stroke-width="2" stroke-linecap="round"/></svg>`,
    parrot: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M24 30 L18 43 L28 34 Z" fill="#3D7BFF"/><ellipse cx="30" cy="24" rx="12" ry="14" fill="#2ED573"/><path d="M22 22 Q30 34 40 26 Q34 40 22 32 Z" fill="#FFD23F"/><circle cx="32" cy="12" r="10" fill="#FF4757"/><path d="M40 10 Q48 12 44 20 Q40 18 38 15 Z" fill="#F6E3B4"/><circle cx="34" cy="10" r="3.2" fill="#fff"/><circle cx="35" cy="10" r="1.8" fill="#1C1733"/></svg>`,
    eagle: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M4 22 Q16 10 28 20 Q40 10 56 22 Q42 20 30 30 Q18 20 4 22 Z" fill="#7A4E2E"/><ellipse cx="30" cy="27" rx="7" ry="10" fill="#8A5A36"/><circle cx="30" cy="14" r="7" fill="#fff"/><path d="M33 15 L39 17 L34 20 Z" fill="#FFC93C"/>${EYE(31, 13)}<path d="M26 37 L24 42 M34 37 L36 42" stroke="#FFC93C" stroke-width="2.4" stroke-linecap="round"/></svg>`,
    bat: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M30 18 Q18 6 2 12 Q8 16 6 22 Q12 20 14 26 Q20 22 24 28 Z" fill="#5B4A7A"/><path d="M30 18 Q42 6 58 12 Q52 16 54 22 Q48 20 46 26 Q40 22 36 28 Z" fill="#5B4A7A"/><ellipse cx="30" cy="24" rx="8" ry="10" fill="#6E5B91"/><path d="M24 16 L23 8 L28 14 Z M36 16 L37 8 L32 14 Z" fill="#6E5B91"/>${EYE(27, 20)}${EYE(33, 20)}<path d="M28 26 L29 28 L30 26 L31 28 L32 26" stroke="#fff" stroke-width="1" fill="none"/></svg>`
  };
  const animalPic = (k) => `<div class="tr-head">${window.Animals.svg(k)}</div>`;
  const LIFE = [
    // 포유류
    ...['cat', 'dog', 'rabbit', 'bear', 'panda', 'lion', 'tiger', 'monkey', 'koala', 'pig', 'sheep'].map((k) => ({ id: k, n: window.Animals.name(k), g: 'mammal', pic: animalPic(k) })),
    { id: 'dolphin', n: '돌고래', g: 'mammal', pic: CR.dolphin.svg, note: '물에 살아도 허파로 숨 쉬는 포유류!' },
    { id: 'whale', n: '고래', g: 'mammal', pic: CR.whale.svg, note: '고래도 새끼에게 젖을 먹여요!' },
    { id: 'bat', n: '박쥐', g: 'mammal', pic: BUG.bat, note: '날 수 있지만 박쥐는 포유류!' },
    // 조류
    { id: 'penguin', n: '펭귄', g: 'bird', pic: animalPic('penguin'), note: '날지 못해도 펭귄은 새예요!' },
    { id: 'chick', n: '병아리', g: 'bird', pic: animalPic('chick') },
    { id: 'owl', n: '부엉이', g: 'bird', pic: animalPic('owl') },
    { id: 'parrot', n: '앵무새', g: 'bird', pic: BUG.parrot },
    { id: 'eagle', n: '독수리', g: 'bird', pic: BUG.eagle },
    // 어류
    { id: 'mackerel', n: '고등어', g: 'fish', pic: CR.mackerel.svg },
    { id: 'clownfish', n: '흰동가리', g: 'fish', pic: CR.clownfish.svg },
    { id: 'puffer', n: '복어', g: 'fish', pic: CR.puffer.svg },
    { id: 'shark', n: '상어', g: 'fish', pic: CR.shark.svg, note: '상어도 아가미가 있는 물고기!' },
    { id: 'seahorse', n: '해마', g: 'fish', pic: CR.seahorse.svg, note: '말처럼 생겨도 해마는 물고기!' },
    // 파충류 (중등)
    { id: 'turtle', n: '바다거북', g: 'reptile', pic: CR.turtle.svg, note: '거북은 등딱지가 있는 파충류!' },
    { id: 'snake', n: '뱀', g: 'reptile', pic: BUG.snake },
    { id: 'croc', n: '악어', g: 'reptile', pic: BUG.croc },
    { id: 'lizard', n: '도마뱀', g: 'reptile', pic: BUG.lizard },
    // 양서류 (중등)
    { id: 'frog', n: '개구리', g: 'amphibian', pic: animalPic('frog'), note: '올챙이는 물, 개구리는 땅! 양서류예요' },
    { id: 'salamander', n: '도롱뇽', g: 'amphibian', pic: BUG.salamander, note: '도마뱀 닮았지만 도롱뇽은 양서류!' },
    // 곤충 (중등)
    { id: 'butterfly', n: '나비', g: 'insect', pic: BUG.butterfly },
    { id: 'ladybug', n: '무당벌레', g: 'insect', pic: BUG.ladybug },
    { id: 'bee', n: '꿀벌', g: 'insect', pic: BUG.bee }
  ];
  const TREE_SETS = [
    ['mammal', 'bird', 'fish'],
    ['reptile', 'amphibian', 'fish'],
    ['mammal', 'reptile', 'insect'],
    ['bird', 'amphibian', 'insect'],
    ['mammal', 'bird', 'reptile'],
    ['fish', 'amphibian', 'insect']
  ];
  const TREE_STEPS = 5;

  const tree = {
    id: 'tree', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="6" fill="#F6E7C1"/><path d="M20 35 L20 20 M20 24 L10 14 M20 22 L30 12 M20 20 L20 9" stroke="#6B4A2E" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="10" cy="12" r="4.5" fill="#FF8A5B"/><circle cx="20" cy="8" r="4.5" fill="#3DD6D0"/><circle cx="30" cy="11" r="4.5" fill="#5BB8FF"/></svg>`,
    hall: '생명의 나무', title: '진화 나무 오르기', cat: '동물 분류', catColor: 'g', levels: ['e', 'm'],
    buttons: ['r', 'g', 'b'],
    rules(lv) {
      return lv === 'e'
        ? ['동물 친구가 나오면 맞는 가지를 골라요', '가지는 포유류 · 조류 · 어류 3개예요', '맞히면 내 캐릭터가 나무를 한 칸 올라가요']
        : ['가지에 쓰인 무리 중 맞는 곳을 골라요', '나무 꼭대기에 오르면 가지가 바뀌어요', '헷갈리면 가지 아래 힌트를 보세요'];
    },
    illus(lv) {
      const ids = lv === 'm' ? ['turtle', 'frog', 'bee'] : ['bat', 'penguin', 'shark'];
      const lab = lv === 'm' ? ['파충류', '양서류', '곤충'] : ['포유류', '조류', '어류'];
      const pic = (id) => LIFE.find((x) => x.id === id).pic;
      return `<div class="il-row" style="gap:12px">${ids.map((id, i) =>
        `<div class="il-btn"><div style="width:70px;height:52px;display:flex;align-items:center;justify-content:center">${pic(id)}</div><span>${LIFE.find((x) => x.id === id).n}</span><span style="color:#7DF0AE">→ ${lab[i]}</span></div>`).join('')}</div>`;
    },
    learn(lv) {
      return lv === 'e'
        ? '동물은 생김새와 사는 방법으로 무리를 나눠요. 포유류는 새끼에게 젖을 먹이고(박쥐·고래도!), 조류는 깃털과 부리가 있고(펭귄도!), 어류는 아가미로 숨 쉬어요(상어·해마도!).'
        : '다윈은 모든 생물이 하나의 커다란 "생명의 나무"처럼 이어져 있다고 생각했어요. 척추가 있는 동물: 어류·양서류·파충류·조류·포유류. 곤충은 척추가 없고 다리가 6개예요.';
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const lv = ctx.level === 'm' ? 'm' : 'e';
      const sets = lv === 'e' ? [TREE_SETS[0]] : shuffle(R, TREE_SETS);
      let setIdx = 0;
      let groups = sets[0];
      let cur = null;
      let lastId = '';
      let height = 0;
      let trees = 0;
      let askAt = 0;
      let lockUntil = 0;
      let score = 0;
      let right = 0;
      let wrong = 0;
      let streak = 0;
      const meP = (ctx.players || []).find((p) => p.pid === ctx.myPid);
      const myAnimal = meP ? meP.animal : 'rabbit';

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="tr-wrap lv-${lv}">
        <svg class="tr-bg" viewBox="0 0 300 300" preserveAspectRatio="none" aria-hidden="true">
          <path d="M150 300 L150 120 M150 170 Q90 140 50 70 M150 150 Q210 130 250 70 M150 120 L150 60" stroke="#8A6A45" stroke-width="10" fill="none" stroke-linecap="round" opacity=".35"/>
        </svg>
        <div class="tr-leaves">${SLOTS.map((c) => `<div class="tr-leaf"><div class="tr-blob"><b class="disp"></b><span class="tr-lh"></span><div class="tr-got"></div></div>
          <span class="tr-tag" style="background:${G.HEX[c]}">${shape(c, 14)}</span></div>`).join('')}</div>
        <div class="tr-mid">
          <div class="tr-climb"><div class="tr-trunk">${Array.from({ length: TREE_STEPS }, () => '<i></i>').join('')}</div>
            <div class="tr-me">${window.Animals.svg(myAnimal)}</div><span class="tr-h disp">0/${TREE_STEPS}</span></div>
          <div class="tr-card"><div class="tr-pic"></div><b class="disp tr-name"></b><span class="tr-q">어느 가지일까요?</span></div>
        </div>
        <div class="tr-msg disp"></div>
      </div>`);
      ctx.stage.appendChild(wrap);
      const leaves = Array.from(wrap.querySelectorAll('.tr-leaf'));
      const card = wrap.querySelector('.tr-card');
      const msg = wrap.querySelector('.tr-msg');
      const meEl = wrap.querySelector('.tr-me');
      const hEl = wrap.querySelector('.tr-h');
      const notches = Array.from(wrap.querySelectorAll('.tr-trunk i'));

      function setGroups(gs) {
        groups = gs;
        leaves.forEach((lf, i) => {
          const g = TG[gs[i]];
          lf.style.setProperty('--lc', g.c);
          lf.querySelector('b').textContent = g.n;
          lf.querySelector('.tr-lh').textContent = g.hint;
          lf.querySelector('.tr-got').innerHTML = '';
          retrigger(lf, 'grow');
        });
      }
      function renderHeight() {
        meEl.style.bottom = `calc(${(height / TREE_STEPS) * 100}% - ${height === TREE_STEPS ? 24 : 0}px)`;
        notches.forEach((n, i) => n.classList.toggle('on', i < height));
        hEl.textContent = `${height}/${TREE_STEPS}`;
      }
      function nextAnimal(t) {
        const pool = LIFE.filter((a) => groups.includes(a.g));
        const g = groups[Math.floor(R() * groups.length)];
        const cand = pool.filter((a) => a.g === g && a.id !== lastId);
        cur = cand[Math.floor(R() * cand.length)];
        lastId = cur.id;
        card.className = 'tr-card';
        card.style.removeProperty('--tx');
        card.querySelector('.tr-pic').innerHTML = cur.pic;
        card.querySelector('.tr-name').textContent = cur.n;
        retrigger(card, 'in');
        msg.textContent = '';
        askAt = t;
      }

      return {
        start(t) { setGroups(groups); renderHeight(); nextAnimal(t); },
        tick(t) {
          if (lockUntil && t >= lockUntil) {
            lockUntil = 0;
            if (height >= TREE_STEPS) {
              height = 0;
              renderHeight();
              if (lv === 'm') {
                setIdx = (setIdx + 1) % sets.length;
                setGroups(sets[setIdx]);
              } else {
                leaves.forEach((lf) => { lf.querySelector('.tr-got').innerHTML = ''; });
              }
            }
            nextAnimal(t);
          }
        },
        onPress(c, t) {
          if (lockUntil || !cur) return;
          const i = IDX[c];
          const target = groups.indexOf(cur.g);
          const lf = leaves[i];
          if (i === target) {
            streak++;
            right++;
            height++;
            const quick = Math.max(0, Math.round(30 * (1 - (t - askAt) / 4000)));
            let gain = 40 + quick + Math.min(20, (streak - 1) * 5);
            const top = height >= TREE_STEPS;
            if (top) { gain += 100; trees++; }
            score += gain;
            ctx.setScore(score);
            card.style.setProperty('--tx', `${(i - 1) * 105}%`);
            card.classList.add('go');
            const got = lf.querySelector('.tr-got');
            const chip = el(`<span class="tr-chip">${cur.pic}</span>`);
            got.appendChild(chip);
            while (got.children.length > 4) got.firstChild.remove();
            retrigger(lf, 'hit');
            renderHeight();
            const p = center(ctx, lf);
            ctx.fx.burst(p.x, p.y, TG[cur.g].c, top ? 26 : 12);
            ctx.fx.float('+' + gain, p.x, p.y + 10, '#FFD23F', top ? 34 : 26);
            msgPop(msg, cur.note || `${eunNeun(cur.n)} ${ieyo(TG[cur.g].n)}!`, '#2E7D32');
            if (top) {
              msgPop(msg, lv === 'm' ? '꼭대기 도착! 새 가지가 자라요 +100' : '꼭대기 도착! +100', '#B8860B');
              ctx.sfx.fanfare();
              ctx.vibrate([30, 30, 30, 30, 80]);
            } else {
              ctx.sfx.good();
              ctx.vibrate(12);
            }
            ctx.setBadge(streak >= 3 ? `${streak}연속` : null, 'g');
            lockUntil = t + (top ? 1700 : 800);
          } else {
            streak = 0;
            wrong++;
            score = Math.max(0, score - 15);
            ctx.setScore(score);
            card.classList.add('wrong');
            retrigger(leaves[target], 'hint');
            msgPop(msg, cur.note || `${eunNeun(cur.n)} ${ieyo(TG[cur.g].n)} · ${TG[cur.g].hint}`, '#C62828');
            ctx.sfx.bad();
            ctx.vibrate([40, 30, 40]);
            ctx.setBadge(null);
            lockUntil = t + 1900;
          }
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${right}마리 분류 · 꼭대기 ${trees}번`
      };
    }
  };

  G.register(tree);
})();
