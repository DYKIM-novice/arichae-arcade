/* 아리채 오락실 · 주기율표 빨리 고르기 (원소관) — 초·중·고
   과학관·음악관 게임 — 방장이 고른 난이도로, 서버가 준 같은 시드로 가족 모두 같은 문제를 풀어요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, shape, el, center, esc, IDX, SLOTS, shuffle } = G.kit;

  // [원자번호, 기호, 이름, 족, 주기, 한 줄 설명]
  const ELEMENTS = [
    [1, 'H', '수소', 1, 1, '우주에서 가장 많은 원소'],
    [2, 'He', '헬륨', 18, 1, '풍선을 둥둥 띄우는 가벼운 기체'],
    [3, 'Li', '리튬', 1, 2, '휴대폰 배터리에 쓰여요'],
    [4, 'Be', '베릴륨', 2, 2, '가볍고 단단한 금속, 에메랄드 속에도 있어요'],
    [5, 'B', '붕소', 13, 2, '잘 깨지지 않는 내열 유리에 들어가요'],
    [6, 'C', '탄소', 14, 2, '연필심과 다이아몬드가 모두 탄소예요'],
    [7, 'N', '질소', 15, 2, '공기의 약 78%를 차지해요'],
    [8, 'O', '산소', 16, 2, '숨 쉴 때 꼭 필요한 기체, 공기의 약 21%'],
    [9, 'F', '플루오린', 17, 2, '치약 속 불소가 바로 이 원소예요'],
    [10, 'Ne', '네온', 18, 2, '빨갛게 빛나는 네온사인'],
    [11, 'Na', '나트륨', 1, 3, '소금(염화 나트륨)의 재료'],
    [12, 'Mg', '마그네슘', 2, 3, '불꽃놀이의 하얀 빛을 내요'],
    [13, 'Al', '알루미늄', 13, 3, '음료수 캔과 쿠킹 포일'],
    [14, 'Si', '규소', 14, 3, '반도체 칩의 재료'],
    [15, 'P', '인', 15, 3, '뼈와 DNA에 들어 있고 성냥갑 옆면에도 써요'],
    [16, 'S', '황', 16, 3, '화산 근처의 노란 결정'],
    [17, 'Cl', '염소', 17, 3, '소금의 재료이자 수영장 소독약'],
    [18, 'Ar', '아르곤', 18, 3, '공기의 약 1%, 전구 속에 넣어요'],
    [19, 'K', '칼륨', 1, 4, '바나나에 많이 들어 있어요'],
    [20, 'Ca', '칼슘', 2, 4, '뼈와 이를 튼튼하게 해요'],
    [26, 'Fe', '철', 8, 4, '배를 만드는 강철의 주성분, 피 속에도 있어요'],
    [29, 'Cu', '구리', 11, 4, '전기가 잘 통해서 전선에 써요'],
    [30, 'Zn', '아연', 12, 4, '건전지와 녹 방지 도금에 써요'],
    [47, 'Ag', '은', 11, 5, '은메달, 전기가 가장 잘 통하는 금속'],
    [53, 'I', '아이오딘', 17, 5, '상처 소독약에 들어 있어요'],
    [79, 'Au', '금', 11, 6, '녹슬지 않고 반짝이는 귀금속'],
    [80, 'Hg', '수은', 12, 6, '상온에서 액체인 금속, 옛날 체온계'],
    [82, 'Pb', '납', 14, 6, '무거운 금속, 낚시 추에 써요']
  ].map(([z, s, n, g, p, f]) => ({ z, s, n, g, p, f }));
  const EL = {};
  ELEMENTS.forEach((e) => { EL[e.s] = e; });
  // 힌트용 영어 이름 (기호가 라틴어에서 온 원소는 라틴어 이름)
  const EN = {
    H: 'Hydrogen', He: 'Helium', Li: 'Lithium', Be: 'Beryllium', B: 'Boron', C: 'Carbon', N: 'Nitrogen', O: 'Oxygen',
    F: 'Fluorine', Ne: 'Neon', Na: 'Natrium (라틴어)', Mg: 'Magnesium', Al: 'Aluminium', Si: 'Silicon', P: 'Phosphorus',
    S: 'Sulfur', Cl: 'Chlorine', Ar: 'Argon', K: 'Kalium (라틴어)', Ca: 'Calcium', Fe: 'Ferrum (라틴어)', Cu: 'Cuprum (라틴어)',
    Zn: 'Zinc', Ag: 'Argentum (라틴어)', I: 'Iodine', Au: 'Aurum (라틴어)', Hg: 'Hydrargyrum (라틴어)', Pb: 'Plumbum (라틴어)'
  };
  // 힌트가 나오기까지 걸리는 시간 (힌트 전에 맞히면 보너스)
  const HINT_DELAY = { e: 0, m: 1200, h: 2500 };
  const POOL = {
    e: ['H', 'He', 'C', 'N', 'O', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'S', 'Cl', 'K', 'Ca', 'Fe', 'Cu', 'Ag', 'Au', 'Li'],
    m: ELEMENTS.filter((e) => e.z <= 20).map((e) => e.s).concat(['Fe', 'Cu', 'Zn', 'Ag', 'Au', 'I']),
    h: ELEMENTS.map((e) => e.s)
  };
  const MAIN = ELEMENTS.filter((e) => e.z >= 2 && e.z <= 20);

  function similar(a, b) {
    let s = 0;
    if (a.s[0] === b.s[0]) s += 3;
    if (a.s.length === b.s.length) s += 1;
    if (Math.abs(a.z - b.z) <= 2) s += 1;
    return s;
  }

  const periodic = {
    id: 'periodic', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="7" fill="#2ED573"/><rect x="3" y="3" width="34" height="34" rx="7" fill="none" stroke="#1A8F4A" stroke-width="3"/><text x="8" y="13" font-size="8" fill="#0B2A17" font-family="sans-serif" font-weight="700">1</text><text x="20" y="31" text-anchor="middle" font-size="19" fill="#0B2A17" font-family="sans-serif" font-weight="900">H</text></svg>`, hall: '원소관', title: '주기율표 빨리 고르기', cat: '원소와 주기율표', catColor: 'g', levels: ['e', 'm', 'h'],
    buttons: ['r', 'g', 'b'],
    rules(lv) {
      if (lv === 'e') return ['원소 이름이 나오면 맞는 기호를 골라요', '힌트로 영어 이름이 바로 나와요 (첫 글자가 기호!)', '정답 뒤에 재미있는 원소 이야기가 나와요'];
      if (lv === 'm') return ['이름 → 기호, 기호 → 이름 문제가 섞여 나와요', '1초 뒤에 힌트가 나와요', '힌트 전에 맞히면 보너스 +20'];
      return ['원자번호와 같은 족(세로줄) 문제도 나와요', '조금 기다리면 힌트가 나와요', '힌트 전에 맞히면 보너스 +20'];
    },
    illus() {
      const t = (s, on) => `<div class="il-el${on ? ' on' : ''}"><small>${EL[s].z}</small><b>${s}</b><span>${EL[s].n}</span></div>`;
      return `<div class="il-row" style="gap:10px">${t('O', true)}${t('Na', false)}${t('Fe', false)}</div>
        <div class="il-cap" style="margin-top:8px">산소의 기호는? → <b style="color:#7DF0AE">O</b></div>`;
    },
    learn(lv) {
      if (lv === 'e') return '원소 기호는 알파벳 1~2글자로 써요. 첫 글자는 대문자! 수소 H, 산소 O, 탄소 C, 철 Fe, 금 Au. 우리 몸과 주변의 모든 물질이 원소로 이루어져 있어요.';
      if (lv === 'm') return '원소 기호 중에는 라틴어 이름에서 온 것도 있어요. 나트륨 Na(Natrium), 칼륨 K(Kalium), 철 Fe(Ferrum), 은 Ag(Argentum), 금 Au(Aurum).';
      return '주기율표의 같은 세로줄(족) 원소는 성질이 비슷해요. 1족 Li·Na·K는 물과 격렬하게 반응하고, 18족 He·Ne·Ar은 다른 원소와 거의 반응하지 않아요.';
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const lv = ['e', 'm', 'h'].includes(ctx.level) ? ctx.level : 'm';
      const pool = POOL[lv].map((s) => EL[s]);
      let q = null;
      let askAt = 0;
      let lockUntil = 0;
      let score = 0;
      let right = 0;
      let total = 0;
      let streak = 0;
      let best = 0;
      let lastAns = '';

      ctx.stage.innerHTML = '';
      const cells = ELEMENTS.map((e) => `<div class="pe-cell" data-s="${e.s}" style="grid-column:${e.g};grid-row:${e.p}">${e.s}</div>`).join('');
      const wrap = el(`<div class="pe-wrap">
        <div class="pe-q"><span class="pe-type"></span><div class="pe-big disp"></div></div>
        <div class="pe-opts">${SLOTS.map((c) => `<div class="pe-opt"><div class="pe-main disp"></div><div class="pe-sub"></div>
          <span class="pe-tag" style="background:${G.HEX[c]}">${shape(c, 14)}</span></div>`).join('')}</div>
        <div class="pe-hint"></div>
        <div class="pe-fact"></div>
        <div class="pe-table">${cells}</div>
      </div>`);
      ctx.stage.appendChild(wrap);
      const typeEl = wrap.querySelector('.pe-type');
      const big = wrap.querySelector('.pe-big');
      const opts = Array.from(wrap.querySelectorAll('.pe-opt'));
      const fact = wrap.querySelector('.pe-fact');
      const table = wrap.querySelector('.pe-table');
      const hintEl = wrap.querySelector('.pe-hint');
      let hintShown = false;
      let noHint = 0;

      function distractors(ans, from, n) {
        const cand = from.filter((e) => e.s !== ans.s);
        // 초등은 헷갈리는 보기 대신 아무 원소나 섞어서 쉽게
        if (lv === 'e') return shuffle(R, cand).slice(0, n);
        const scored = shuffle(R, cand).sort((a, b) => similar(ans, b) - similar(ans, a));
        const top = scored.slice(0, Math.min(5, scored.length));
        return shuffle(R, top).slice(0, n);
      }
      function makeQuestion() {
        let type = 'n2s';
        const r = R();
        if (lv === 'm') type = r < 0.5 ? 'n2s' : 's2n';
        if (lv === 'h') type = r < 0.3 ? 'n2s' : r < 0.6 ? 's2n' : r < 0.8 ? 'z2e' : 'grp';
        if (type === 'grp') {
          const anchors = MAIN.filter((e) => MAIN.some((o) => o.g === e.g && o.s !== e.s));
          let anchor;
          do { anchor = anchors[Math.floor(R() * anchors.length)]; } while (anchor.s === lastAns && anchors.length > 1);
          const same = MAIN.filter((o) => o.g === anchor.g && o.s !== anchor.s);
          const ans = same[Math.floor(R() * same.length)];
          const wrongs = shuffle(R, MAIN.filter((o) => o.g !== anchor.g && Math.abs(o.p - ans.p) <= 1)).slice(0, 2);
          return { type, anchor, ans, choices: shuffle(R, [ans, ...wrongs]) };
        }
        const from = type === 'z2e' ? MAIN.concat([EL.H]) : pool;
        let ans;
        do { ans = from[Math.floor(R() * from.length)]; } while (ans.s === lastAns && from.length > 1);
        return { type, ans, choices: shuffle(R, [ans, ...distractors(ans, from, 2)]) };
      }
      function render() {
        const { type, ans, anchor, choices } = q;
        const labels = {
          n2s: '이 원소의 기호는?',
          s2n: '이 기호의 원소 이름은?',
          z2e: '원자번호가 이것인 원소는?',
          grp: '같은 족(세로줄) 원소는?'
        };
        typeEl.textContent = labels[type];
        big.textContent = type === 'n2s' ? ans.n : type === 's2n' ? ans.s : type === 'z2e' ? `${ans.z}번` : `${anchor.s} (${anchor.n})`;
        opts.forEach((o, i) => {
          const e = choices[i];
          o.className = 'pe-opt';
          o.querySelector('.pe-main').textContent = type === 's2n' ? e.n : e.s;
          o.querySelector('.pe-sub').textContent = type === 'z2e' || type === 'grp' ? e.n : '';
        });
        fact.innerHTML = '';
        hintEl.innerHTML = '';
        hintEl.classList.remove('show');
        hintShown = false;
        table.querySelectorAll('.pe-cell').forEach((c) => c.classList.remove('hl', 'hl2', 'hint'));
      }
      function showHint() {
        hintShown = true;
        const { type, ans, anchor } = q;
        let html = '';
        if (type === 'n2s') {
          const en = EN[ans.s] || '';
          // 기호가 이름 앞부분과 같으면 그만큼(예: Ar-gon), 아니면 첫 글자만 표시
          const k = en.toLowerCase().startsWith(ans.s.toLowerCase()) ? ans.s.length : 1;
          html = `💡 영어 이름 <b><u>${esc(en.slice(0, k))}</u>${esc(en.slice(k))}</b> · 기호는 이 이름에서 따왔어요`;
        } else if (type === 's2n') {
          html = `💡 ${esc(ans.f)}`;
        } else if (type === 'z2e') {
          html = `💡 ${ans.p}주기(가로 ${ans.p}번째 줄)에 있어요 · ${esc(ans.f)}`;
          const cell = table.querySelector(`.pe-cell[data-s="${ans.s}"]`);
          if (cell) cell.classList.add('hint');
        } else {
          html = `💡 ${esc(anchor.n)}와(과) 같은 세로줄(${anchor.g}족)을 아래 표에서 찾아보세요`;
          table.querySelectorAll('.pe-cell').forEach((c) => {
            if (EL[c.dataset.s] && EL[c.dataset.s].g === anchor.g) c.classList.add('hint');
          });
        }
        hintEl.innerHTML = html;
        hintEl.classList.add('show');
      }
      function next(t) {
        q = makeQuestion();
        lastAns = q.ans.s;
        askAt = t;
        total++;
        render();
      }
      function showAnswer(ok) {
        const { ans, anchor, type } = q;
        q.choices.forEach((e, i) => {
          if (e === ans) opts[i].classList.add('right');
        });
        const cell = table.querySelector(`.pe-cell[data-s="${ans.s}"]`);
        if (cell) cell.classList.add('hl');
        if (anchor) {
          const ac = table.querySelector(`.pe-cell[data-s="${anchor.s}"]`);
          if (ac) ac.classList.add('hl2');
        }
        const pos = lv === 'h' || type === 'grp' ? ` · ${ans.g}족 ${ans.p}주기` : '';
        fact.innerHTML = `<b>${ans.n} ${ans.s}</b> · 원자번호 ${ans.z}${pos}<br>${esc(ans.f)}`;
        fact.classList.toggle('bad', !ok);
      }

      return {
        start(t) { next(t); },
        tick(t) {
          if (lockUntil && t >= lockUntil) {
            lockUntil = 0;
            next(t);
          }
          if (!lockUntil && q && !hintShown && t - askAt >= HINT_DELAY[lv]) showHint();
        },
        onPress(c, t) {
          if (lockUntil) return;
          const i = IDX[c];
          const chosen = q.choices[i];
          const beforeHint = !hintShown && HINT_DELAY[lv] > 0;
          const p = center(ctx, opts[i]);
          if (chosen === q.ans) {
            streak++;
            best = Math.max(best, streak);
            right++;
            const quick = Math.max(0, Math.round(30 * (1 - (t - askAt) / 4000)));
            const gain = 40 + quick + Math.min(25, (streak - 1) * 5) + (beforeHint ? 20 : 0);
            if (beforeHint) noHint++;
            score += gain;
            ctx.fx.burst(p.x, p.y, '#7DF0AE', 12);
            ctx.fx.float(beforeHint ? `힌트 없이! +${gain}` : '+' + gain, p.x, p.y - 40, '#FFD23F', 26);
            if (quick > 20) ctx.sfx.perfect(); else ctx.sfx.good();
            ctx.vibrate(12);
            showAnswer(true);
            lockUntil = t + 1500;
          } else {
            streak = 0;
            score = Math.max(0, score - 10);
            opts[i].classList.add('wrong');
            ctx.sfx.bad();
            ctx.vibrate([40, 30, 40]);
            showAnswer(false);
            lockUntil = t + 2300;
          }
          ctx.setScore(score);
          ctx.setBadge(streak >= 3 ? `${streak}연속` : null, 'g');
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${total}문제 중 ${right}개 정답 · 최고 ${best}연속`
      };
    }
  };

  G.register(periodic);
})();
