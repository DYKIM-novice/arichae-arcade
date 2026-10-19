/* 아리채 오락실 · 지구 역사 순서 맞추기 (시간 여행관) — 중
   과학관·음악관 게임 — 방장이 고른 난이도로, 서버가 준 같은 시드로 가족 모두 같은 문제를 풀어요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, shape, el, center, IDX, msgPop, SLOTS, shuffle } = G.kit;

  const EARTH_AGE = 4.567e9;
  const ERAS = [
    { name: '선캄브리아 시대', from: EARTH_AGE, to: 5.41e8, color: '#F2B33D' },
    { name: '고생대', from: 5.41e8, to: 2.52e8, color: '#4A90D9' },
    { name: '중생대', from: 2.52e8, to: 6.6e7, color: '#8DB33A' },
    { name: '신생대', from: 6.6e7, to: 0, color: '#F08A4B' }
  ];
  const EVENTS = [
    { n: '최초의 생명체 등장', a: 3.5e9, era: '선캄브리아 시대' },
    { n: '대기에 산소가 많아짐', a: 2.4e9, era: '선캄브리아 시대' },
    { n: '다세포 생물 등장', a: 6.0e8, era: '선캄브리아 시대' },
    { n: '삼엽충 등장', a: 5.2e8, era: '고생대' },
    { n: '물고기(어류) 등장', a: 5.0e8, era: '고생대' },
    { n: '식물이 육지로 올라옴', a: 4.7e8, era: '고생대' },
    { n: '양서류 등장', a: 3.7e8, era: '고생대' },
    { n: '파충류 등장', a: 3.1e8, era: '고생대' },
    { n: '고생대 말 대멸종', a: 2.52e8, era: '고생대 끝' },
    { n: '공룡 등장', a: 2.3e8, era: '중생대' },
    { n: '시조새 등장', a: 1.5e8, era: '중생대' },
    { n: '꽃 피는 식물 등장', a: 1.3e8, era: '중생대' },
    { n: '공룡 멸종', a: 6.6e7, era: '중생대 끝' },
    { n: '화폐석 번성', a: 5.0e7, era: '신생대' },
    { n: '사람의 조상 등장', a: 7.0e6, era: '신생대' },
    { n: '털매머드 등장', a: 4.0e5, era: '신생대' },
    { n: '현생 인류 등장', a: 3.0e5, era: '신생대' },
    { n: '농사 시작', a: 1.0e4, era: '신생대' }
  ];
  function eraColor(name) {
    const base = name.replace(' 끝', '');
    const e = ERAS.find((x) => x.name === base);
    return e ? e.color : '#C9C3E6';
  }
  function fmtAge(a) {
    if (a >= 1e8) {
      const eok = Math.floor(a / 1e8);
      const cheon = Math.round((a % 1e8) / 1e7);
      return `${eok}억${cheon ? ` ${cheon}천만` : ''} 년 전`;
    }
    return `${Math.round(a / 1e4)}만 년 전`;
  }
  function clockOf(a) {
    const sec = 86400 * (1 - a / EARTH_AGE);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h === 23 && m >= 55) return `${h}시 ${m}분 ${s}초`;
    return `${h}시 ${String(m).padStart(2, '0')}분`;
  }
  const fracOf = (a) => 1 - a / EARTH_AGE;
  function arc(r, f0, f1, color, w) {
    const C = 2 * Math.PI * r;
    const len = Math.max(0.5, (f1 - f0) * C);
    return `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="${w}" stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-f0 * C).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
  }

  const history = {
    id: 'history', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#15122B"/><circle cx="20" cy="20" r="13" fill="none" stroke="#F2B33D" stroke-width="6" stroke-dasharray="72 82" transform="rotate(-90 20 20)"/><circle cx="20" cy="20" r="13" fill="none" stroke="#4A90D9" stroke-width="6" stroke-dasharray="5 82" stroke-dashoffset="-72" transform="rotate(-90 20 20)"/><circle cx="20" cy="20" r="13" fill="none" stroke="#8DB33A" stroke-width="6" stroke-dasharray="3.5 82" stroke-dashoffset="-77" transform="rotate(-90 20 20)"/><circle cx="20" cy="20" r="13" fill="none" stroke="#F08A4B" stroke-width="6" stroke-dasharray="1.5 82" stroke-dashoffset="-80.5" transform="rotate(-90 20 20)"/><path d="M20 20 L20 10 M20 20 L27 23" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="20" cy="20" r="2.4" fill="#fff"/></svg>`, hall: '시간 여행관', title: '지구 역사 순서', cat: '지구의 역사', catColor: 'y', levels: ['m'],
    buttons: ['r', 'g', 'b'],
    rules() {
      return ['사건 카드 3장이 나와요', '가장 오래된 사건부터 순서대로 눌러요', '정답을 맞히면 24시간 시계로 언제인지 알려줘요'];
    },
    illus() {
      return `<div class="il-row" style="gap:8px">${['공룡 등장', '물고기 등장', '사람의 조상'].map((n, i) =>
        `<div class="il-hcard"><b style="background:${['#FF4757', '#2ED573', '#3D7BFF'][i]}">${[2, 1, 3][i]}</b>${n}</div>`).join('')}</div>
        <div class="il-cap" style="margin-top:8px">오래된 것부터: 물고기 → 공룡 → 사람의 조상</div>`;
    },
    learn() {
      return '지구 46억 년을 24시간으로 줄이면 공룡은 밤 10시 47분쯤, 사람의 조상은 자정 2분 전쯤, 현생 인류는 자정 6초 전에 나타나요! 시대 순서: 선캄브리아 시대 → 고생대 → 중생대 → 신생대.';
    },
    create(ctx) {
      const R = rng(ctx.seed);
      let cards = [];
      let order = [];
      let step = 0;
      let askAt = 0;
      let lockUntil = 0;
      let score = 0;
      let solved = 0;
      let rounds = 0;
      let streak = 0;
      let lastSet = '';

      ctx.stage.innerHTML = '';
      const eraRing = ERAS.map((e) => arc(48, fracOf(e.from), fracOf(e.to), e.color, 13)).join('');
      const wrap = el(`<div class="hs-wrap">
        <div class="hs-head">
          <div class="hs-clock"><svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="56" fill="#15122B"/>${eraRing}
            <text x="60" y="56" text-anchor="middle" class="hs-ct">지구 역사</text><text x="60" y="72" text-anchor="middle" class="hs-ct">24시간</text>
            <g class="hs-marks"></g></svg></div>
          <div class="hs-side"><div class="hs-msg disp">오래된 것부터!</div>
            <div class="hs-legend">${ERAS.map((e) => `<span><i style="background:${e.color}"></i>${e.name.replace(' 시대', '')}</span>`).join('')}</div></div>
        </div>
        <div class="hs-cards">${SLOTS.map((c) => `<div class="hs-card"><b class="hs-num"></b><div class="hs-name"></div><div class="hs-info"></div>
          <span class="hs-tag" style="background:${G.HEX[c]}">${shape(c, 16)}</span></div>`).join('')}</div>
      </div>`);
      ctx.stage.appendChild(wrap);
      const cardEls = Array.from(wrap.querySelectorAll('.hs-card'));
      const msg = wrap.querySelector('.hs-msg');
      const marks = wrap.querySelector('.hs-marks');

      function pickSet() {
        for (let tries = 0; tries < 200; tries++) {
          const s = shuffle(R, EVENTS).slice(0, 3).sort((x, y) => y.a - x.a);
          if (s[0].a / s[1].a >= 1.6 && s[1].a / s[2].a >= 1.6) {
            const key = s.map((e) => e.n).join('|');
            if (key !== lastSet) { lastSet = key; return s; }
          }
        }
        return [EVENTS[0], EVENTS[9], EVENTS[14]];
      }
      function nextRound(t) {
        const set = pickSet();
        cards = shuffle(R, set);
        order = set.map((e) => cards.indexOf(e));
        step = 0;
        askAt = t;
        rounds++;
        marks.innerHTML = '';
        cardEls.forEach((c, i) => {
          c.className = 'hs-card';
          c.querySelector('.hs-num').textContent = '';
          c.querySelector('.hs-name').textContent = cards[i].n;
          c.querySelector('.hs-info').innerHTML = '';
        });
        msgPop(msg, '오래된 것부터!', '#F6F3FF');
      }
      function reveal(ok) {
        cardEls.forEach((c, i) => {
          const e = cards[i];
          const rank = order.indexOf(i) + 1;
          c.querySelector('.hs-num').textContent = rank;
          c.classList.add('shown');
          if (!ok) c.classList.add(rank - 1 < step ? 'done' : 'missed');
          c.querySelector('.hs-info').innerHTML = `<span class="hs-era" style="background:${eraColor(e.era)}">${e.era}</span>
            <span class="hs-age">${fmtAge(e.a)}</span><span class="hs-time"><small>24시간 시계</small>${clockOf(e.a)}</span>`;
        });
        marks.innerHTML = order.map((ci, k) => {
          const f = fracOf(cards[ci].a);
          const ang = f * 2 * Math.PI - Math.PI / 2;
          const x = 60 + 48 * Math.cos(ang);
          const y = 60 + 48 * Math.sin(ang);
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#fff" stroke="#15122B" stroke-width="2"/><text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" class="hs-mk">${k + 1}</text>`;
        }).join('');
      }

      return {
        start(t) { nextRound(t); },
        tick(t) {
          if (lockUntil && t >= lockUntil) {
            lockUntil = 0;
            nextRound(t);
          }
        },
        onPress(c, t) {
          if (lockUntil) return;
          const i = IDX[c];
          const card = cardEls[i];
          if (card.classList.contains('done')) return;
          if (order[step] === i) {
            card.classList.add('done');
            card.querySelector('.hs-num').textContent = step + 1;
            step++;
            ctx.sfx.good();
            ctx.vibrate(10);
            if (step === 3) {
              streak++;
              solved++;
              const quick = Math.max(0, Math.round(60 * (1 - (t - askAt) / 8000)));
              const gain = 100 + quick + Math.min(40, (streak - 1) * 10);
              score += gain;
              ctx.setScore(score);
              reveal(true);
              msgPop(msg, `정답! +${gain}`, '#FFD23F');
              const p = center(ctx, msg);
              ctx.fx.burst(p.x, p.y, '#FFD23F', 16);
              ctx.sfx.perfect();
              ctx.vibrate([15, 25, 15]);
              ctx.setBadge(streak >= 2 ? `${streak}연속` : null, 'y');
              lockUntil = t + 2600;
            }
          } else {
            streak = 0;
            score = Math.max(0, score - 20);
            ctx.setScore(score);
            card.classList.add('wrong');
            reveal(false);
            msgPop(msg, '순서가 달라요! 번호를 확인해요', '#FF8B95');
            ctx.sfx.bad();
            ctx.vibrate([40, 30, 40]);
            ctx.setBadge(null);
            lockUntil = t + 3200;
          }
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${rounds}문제 중 ${solved}개 정답`
      };
    }
  };

  G.register(history);
})();
