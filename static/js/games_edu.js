/* 아리채 오락실 - 과학관 모드 (교육 게임)
   방장이 게임과 난이도(초·중·고)를 골라서 플레이해요.
   모든 문제는 서버가 준 같은 시드로 만들어져서 가족 모두 같은 문제를 풀어요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, el, center, shape } = G;
  const esc = G.esc;
  const IDX = { r: 0, g: 1, b: 2 };
  const SLOTS = ['r', 'g', 'b'];
  const BIT = { r: 1, g: 2, b: 4 };

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
  function pickNoRepeat(R, pool, prev) {
    let v = pool[Math.floor(R() * pool.length)];
    let guard = 0;
    while (v === prev && guard++ < 10) v = pool[Math.floor(R() * pool.length)];
    return v;
  }
  function shuffle(R, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // 받침 유무로 조사 고르기 (은/는, 이/가)
  function hasBatchim(word) {
    const c = word.charCodeAt(word.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return false;
    return (c - 0xAC00) % 28 !== 0;
  }
  const eunNeun = (w) => w + (hasBatchim(w) ? '은' : '는');
  const eulReul = (w) => w + (hasBatchim(w) ? '을' : '를');
  const iGa = (w) => w + (hasBatchim(w) ? '이' : '가');

  /* ================================================================
     1. 빛 섞기 (빛의 방) — 초·중
     ================================================================ */
  const LIGHT = {
    1: { name: '빨강', hex: '#FF3B3B' },
    2: { name: '초록', hex: '#2EE65A' },
    4: { name: '파랑', hex: '#3D6BFF' },
    3: { name: '노랑', hex: '#FFF23A' },
    6: { name: '청록', hex: '#3DF5FF' },
    5: { name: '자홍', hex: '#FF3DF5' },
    7: { name: '흰색', hex: '#FFFFFF' },
    0: { name: '깜깜해요', hex: '#0B0918' }
  };
  const LIGHT_RECIPE = { 3: [1, 2], 6: [2, 4], 5: [1, 4], 7: [1, 2, 4] };
  const lightName = (k) => LIGHT[k].name;
  function recipeText(table, key) {
    const parts = [1, 2, 4].filter((b) => key & b).map((b) => table[b].name);
    return parts.join(' + ');
  }

  const light = {
    id: 'light', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><g style="mix-blend-mode:screen"><circle cx="15" cy="15" r="10" fill="#FF3B3B"/><circle cx="25" cy="15" r="10" fill="#2EE65A" style="mix-blend-mode:screen"/><circle cx="20" cy="24" r="10" fill="#3D6BFF" style="mix-blend-mode:screen"/></g></svg>`, hall: '빛의 방', title: '빛 섞기', cat: '빛의 삼원색', catColor: 'b', dur: 35,
    levels: ['e', 'm'],
    buttons: ['r', 'g', 'b'],
    buttonStyle() {
      return {
        r: { name: '빨강 빛' },
        g: { name: '초록 빛' },
        b: { name: '파랑 빛' }
      };
    },
    rules(lv) {
      return lv === 'e'
        ? ['버튼으로 그 색 빛을 켜고 꺼요', '빛이 겹치는 곳의 색을 잘 보세요', '목표 색이 되면 성공!']
        : ['목표 색을 보고 어떤 빛을 켤지 생각해요', '아래 가이드 표를 참고하세요', '한 번에 맞히면 보너스 +30'];
    },
    illus() {
      return `<div class="il-venn"><i style="background:#FF3B3B"></i><i style="background:#2EE65A"></i><i style="background:#3D6BFF"></i></div>
        <div class="il-cap" style="margin-left:14px">빨강 + 초록 = <b style="color:#FFF23A">노랑</b><br>세 빛을 모두 켜면 <b style="color:#fff">흰색</b></div>`;
    },
    learn() {
      return '빛은 섞을수록 밝아져요(가산 혼합). 빨강+초록=노랑, 초록+파랑=청록, 빨강+파랑=자홍, 세 빛을 모두 섞으면 흰색! TV와 휴대폰 화면도 이 세 가지 빛으로 모든 색을 만들어요.';
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const lv = ctx.level;
      const pool = lv === 'e' ? [1, 2, 4, 3, 6, 5, 3, 6, 5] : [3, 6, 5, 7, 3, 6, 5, 7, 1, 2, 4];
      let on = 0;
      let target = 0;
      let presses = 0;
      let askAt = 0;
      let lockUntil = 0;
      let score = 0;
      let solved = 0;
      let oneShot = 0;
      let streak = 0;

      ctx.stage.innerHTML = '';
      const guide = lv === 'm'
        ? `<div class="lt-guide">${[3, 6, 5, 7].map((k) => `<div class="lt-row" data-k="${k}">
            ${LIGHT_RECIPE[k].map((b) => `<i style="background:${LIGHT[b].hex}"></i>`).join('<em>+</em>')}<em>=</em>
            <span class="lt-chip" style="background:${LIGHT[k].hex}"></span><b>${LIGHT[k].name}</b></div>`).join('')}</div>`
        : '';
      const wrap = el(`<div class="lt-wrap lv-${lv}">
        <div class="lt-top">
          <div class="lt-box"><span>목표</span><div class="lt-sw t"></div><b class="disp lt-tname"></b></div>
          <div class="lt-arrow">→</div>
          <div class="lt-box"><span>지금</span><div class="lt-sw n"></div><b class="disp lt-nname"></b></div>
        </div>
        <div class="lt-msg disp"></div>
        <div class="lt-venn"><i class="r"></i><i class="g"></i><i class="b"></i></div>
        ${guide}
      </div>`);
      ctx.stage.appendChild(wrap);
      const tSw = wrap.querySelector('.lt-sw.t');
      const nSw = wrap.querySelector('.lt-sw.n');
      const tName = wrap.querySelector('.lt-tname');
      const nName = wrap.querySelector('.lt-nname');
      const msg = wrap.querySelector('.lt-msg');
      const venn = wrap.querySelector('.lt-venn');
      const circ = { r: venn.querySelector('.r'), g: venn.querySelector('.g'), b: venn.querySelector('.b') };

      function render() {
        SLOTS.forEach((s) => circ[s].classList.toggle('on', !!(on & BIT[s])));
        nSw.style.background = LIGHT[on].hex;
        nSw.classList.toggle('dark', on === 0);
        nName.textContent = LIGHT[on].name;
      }
      function nextTarget(t) {
        target = pickNoRepeat(R, pool, target);
        on = 0;
        presses = 0;
        askAt = t;
        tSw.style.background = LIGHT[target].hex;
        tSw.style.boxShadow = `0 0 26px ${LIGHT[target].hex}88`;
        tName.textContent = lv === 'e' ? LIGHT[target].name : '?';
        msgPop(msg, lv === 'e' ? `${eulReul(LIGHT[target].name)} 만들어요` : '이 색을 만들어 보세요', '#C9C3E6');
        render();
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
          on ^= BIT[c];
          presses++;
          render();
          if (on === target) {
            const need = [1, 2, 4].filter((b) => target & b).length;
            const quick = Math.max(0, Math.round(50 * (1 - (t - askAt) / 6000)));
            const bonus = presses === need ? 30 : 0;
            streak++;
            solved++;
            if (bonus) oneShot++;
            const gain = 100 + quick + bonus;
            score += gain;
            ctx.setScore(score);
            tName.textContent = LIGHT[target].name;
            const txt = need > 1 ? `${recipeText(LIGHT, target)} = ${LIGHT[target].name}!` : `${LIGHT[target].name} 빛!`;
            msgPop(msg, bonus ? `${txt} 한 번에!` : txt, LIGHT[target].hex === '#FFFFFF' ? '#FFFFFF' : LIGHT[target].hex);
            const p = center(ctx, venn);
            ctx.fx.burst(p.x, p.y, LIGHT[target].hex, bonus ? 22 : 14);
            ctx.fx.float('+' + gain, p.x, p.y - 40, '#FFD23F', 30);
            if (bonus) ctx.sfx.perfect(); else ctx.sfx.good();
            ctx.vibrate(bonus ? [15, 25, 15] : 12);
            ctx.setBadge(streak >= 2 ? `${streak}연속` : null, 'b');
            if (lv === 'm') {
              const row = wrap.querySelector(`.lt-row[data-k="${target}"]`);
              if (row) retrigger(row, 'hit');
            }
            lockUntil = t + 900;
          }
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${solved}가지 색 성공 · 한 번에 ${oneShot}번`
      };
    }
  };

  /* ================================================================
     2. 물감 섞기 (물감 공방) — 초(빨노파)·중(청록·자홍·노랑)
     ================================================================ */
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
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 C31 4 37 11 37 19 C37 25 32 26 28 25 C24 24 23 27 25 31 C27 35 24 37 20 37 C10 37 3 30 3 20 C3 11 10 4 20 4 Z" fill="#F2E3C6"/><circle cx="12" cy="17" r="3.6" fill="#E8262B"/><circle cx="19" cy="11" r="3.6" fill="#FFD400"/><circle cx="28" cy="13" r="3.6" fill="#1F5BD6"/><circle cx="12" cy="27" r="3.6" fill="#2FAE4E"/></svg>`, hall: '물감 공방', title: '물감 섞기', cat: '색의 혼합', catColor: 'r', dur: 35,
    levels: ['e', 'm'],
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

  /* ================================================================
     3. 지구 역사 순서 맞추기 (시간 여행관) — 중
     ================================================================ */
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
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#15122B"/><circle cx="20" cy="20" r="13" fill="none" stroke="#F2B33D" stroke-width="6" stroke-dasharray="72 82" transform="rotate(-90 20 20)"/><circle cx="20" cy="20" r="13" fill="none" stroke="#4A90D9" stroke-width="6" stroke-dasharray="5 82" stroke-dashoffset="-72" transform="rotate(-90 20 20)"/><circle cx="20" cy="20" r="13" fill="none" stroke="#8DB33A" stroke-width="6" stroke-dasharray="3.5 82" stroke-dashoffset="-77" transform="rotate(-90 20 20)"/><circle cx="20" cy="20" r="13" fill="none" stroke="#F08A4B" stroke-width="6" stroke-dasharray="1.5 82" stroke-dashoffset="-80.5" transform="rotate(-90 20 20)"/><path d="M20 20 L20 10 M20 20 L27 23" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="20" cy="20" r="2.4" fill="#fff"/></svg>`, hall: '시간 여행관', title: '지구 역사 순서', cat: '지구의 역사', catColor: 'y', dur: 40,
    levels: ['m'],
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

  /* ================================================================
     4. 바다 낚시 (바다관) — 초·중
     ================================================================ */
  const GROUP = {
    fish: { name: '어류', is: '어류(물고기)예요', hint: '아가미로 숨 쉬고 지느러미로 헤엄쳐요' },
    mollusc: { name: '연체동물', is: '연체동물이에요', hint: '몸이 말랑말랑하고 뼈가 없어요' },
    crustacean: { name: '갑각류', is: '갑각류예요', hint: '단단한 껍데기와 마디 있는 다리' },
    cnidarian: { name: '자포동물', is: '자포동물이에요', hint: '촉수에 쏘는 세포가 있어요' },
    echinoderm: { name: '극피동물', is: '극피동물이에요', hint: '몸에 가시가 있고 별 모양이 많아요' },
    mammal: { name: '포유류', is: '포유류예요', hint: '허파로 숨 쉬고 새끼에게 젖을 먹여요' },
    reptile: { name: '파충류', is: '파충류예요', hint: '허파로 숨 쉬고 비늘이나 등딱지가 있어요' }
  };
  const EYE = (x, y) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#1C1733"/><circle cx="${x + 0.9}" cy="${y - 0.9}" r="0.9" fill="#fff"/>`;
  const fishSVG = (body, tail, extra) => `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M8 22 L1 12 L1 32 Z" fill="${tail}"/><ellipse cx="30" cy="22" rx="22" ry="13" fill="${body}"/>${extra || ''}${EYE(43, 18)}</svg>`;
  const CREATURES = [
    { id: 'mackerel', name: '고등어', g: 'fish', svg: fishSVG('#5B8DB8', '#3F6E99', '<path d="M14 16 Q22 12 30 16 Q38 12 46 16" stroke="#2E4E6E" stroke-width="2" fill="none"/><path d="M12 22 Q20 18 28 22 Q36 18 44 22" stroke="#2E4E6E" stroke-width="2" fill="none"/><path d="M14 30 Q30 36 46 28" stroke="#E8EEF5" stroke-width="5" fill="none"/>') },
    { id: 'clownfish', name: '흰동가리', g: 'fish', svg: fishSVG('#FF8A1F', '#E2700F', '<rect x="20" y="9" width="5" height="26" fill="#fff"/><rect x="34" y="10" width="5" height="24" fill="#fff"/>') },
    { id: 'puffer', name: '복어', g: 'fish', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M10 22 L2 14 L2 30 Z" fill="#E0B030"/><circle cx="32" cy="22" r="18" fill="#FFD23F"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i * Math.PI / 4; return `<path d="M${32 + 18 * Math.cos(a)} ${22 + 18 * Math.sin(a)} L${32 + 23 * Math.cos(a)} ${22 + 23 * Math.sin(a)}" stroke="#C99A00" stroke-width="2"/>`; }).join('')}<ellipse cx="32" cy="30" rx="12" ry="6" fill="#FFF3C4"/>${EYE(40, 17)}</svg>` },
    { id: 'shark', name: '상어', g: 'fish', surprise: '상어도 물고기예요!', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M6 22 L0 8 L4 22 L0 36 Z" fill="#7F8C99"/><path d="M4 22 Q20 8 46 14 Q58 18 58 24 Q50 30 30 31 Q14 32 4 22 Z" fill="#9AA7B4"/><path d="M26 15 L32 2 L36 15 Z" fill="#7F8C99"/><path d="M30 31 Q40 30 56 25" stroke="#E8EEF5" stroke-width="4" fill="none"/>${EYE(46, 19)}<path d="M50 25 L56 25" stroke="#1C1733" stroke-width="1.5"/></svg>` },
    { id: 'ray', name: '가오리', g: 'fish', surprise: '가오리도 물고기예요!', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M30 4 Q44 14 58 20 Q44 26 30 34 Q16 26 2 20 Q16 14 30 4 Z" fill="#8E86C9"/><path d="M30 32 Q31 38 36 43" stroke="#6E66A9" stroke-width="2" fill="none"/>${EYE(26, 16)}${EYE(34, 16)}</svg>` },
    { id: 'seahorse', name: '해마', g: 'fish', surprise: '해마도 물고기예요!', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M30 6 Q40 4 42 10 L50 10 L50 14 L42 14 Q42 20 36 22 Q42 28 38 34 Q34 40 28 38 Q34 36 32 32 Q28 28 30 22 Q24 18 26 12 Q27 8 30 6 Z" fill="#FFB84D"/><path d="M28 12 L22 8 M27 18 L21 17 M30 26 L24 27" stroke="#E0952A" stroke-width="2"/>${EYE(36, 10)}</svg>` },
    { id: 'octopus', name: '문어', g: 'mollusc', svg: `<svg viewBox="0 0 60 44" aria-hidden="true">${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${16 + i * 5.6} 26 Q${14 + i * 5.6} 36 ${18 + i * 5.6} 42" stroke="#E36A8A" stroke-width="4" fill="none" stroke-linecap="round"/>`).join('')}<ellipse cx="30" cy="16" rx="15" ry="14" fill="#F07A9A"/>${EYE(25, 17)}${EYE(35, 17)}<path d="M27 23 Q30 25 33 23" stroke="#1C1733" stroke-width="1.5" fill="none"/></svg>` },
    { id: 'squid', name: '오징어', g: 'mollusc', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M30 2 L42 18 L40 30 L20 30 L18 18 Z" fill="#F2D3E0"/><path d="M18 14 L10 10 L18 20 Z M42 14 L50 10 L42 20 Z" fill="#E8B8CC"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M${22 + i * 4} 30 L${21 + i * 4} 42" stroke="#E8B8CC" stroke-width="3" stroke-linecap="round"/>`).join('')}${EYE(26, 24)}${EYE(34, 24)}</svg>` },
    { id: 'clam', name: '조개', g: 'mollusc', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M8 34 Q8 8 30 6 Q52 8 52 34 Z" fill="#F2C9A0"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M30 34 L${14 + i * 8} 10" stroke="#D9A574" stroke-width="2"/>`).join('')}<rect x="8" y="33" width="44" height="6" rx="3" fill="#D9A574"/></svg>` },
    { id: 'crab', name: '게', g: 'crustacean', svg: `<svg viewBox="0 0 60 44" aria-hidden="true">${[0, 1, 2].map((i) => `<path d="M${16 - i * 2} ${28 + i * 4} L${6 - i * 2} ${32 + i * 5}" stroke="#D93A2B" stroke-width="3" stroke-linecap="round"/><path d="M${44 + i * 2} ${28 + i * 4} L${54 + i * 2} ${32 + i * 5}" stroke="#D93A2B" stroke-width="3" stroke-linecap="round"/>`).join('')}<path d="M14 18 L8 8 M46 18 L52 8" stroke="#D93A2B" stroke-width="3"/><circle cx="7" cy="7" r="6" fill="#F04A3A"/><circle cx="53" cy="7" r="6" fill="#F04A3A"/><ellipse cx="30" cy="27" rx="17" ry="11" fill="#F04A3A"/>${EYE(25, 22)}${EYE(35, 22)}</svg>` },
    { id: 'shrimp', name: '새우', g: 'crustacean', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M14 30 Q8 20 16 12 Q26 4 40 10 Q50 16 48 26 Q46 34 36 34 L26 34 Q20 36 14 30 Z" fill="#FF9A7A"/>${[0, 1, 2, 3].map((i) => `<path d="M${22 + i * 6} 10 Q${24 + i * 6} 22 ${22 + i * 6} 34" stroke="#E5795A" stroke-width="2" fill="none"/>`).join('')}<path d="M14 30 L6 38 L16 36 Z" fill="#E5795A"/><path d="M44 12 Q54 2 58 6 M46 14 Q56 8 58 14" stroke="#E5795A" stroke-width="1.5" fill="none"/>${EYE(44, 18)}</svg>` },
    { id: 'jellyfish', name: '해파리', g: 'cnidarian', svg: `<svg viewBox="0 0 60 44" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<path d="M${20 + i * 5} 22 Q${17 + i * 5} 32 ${21 + i * 5} 42" stroke="#C9B8F2" stroke-width="2.5" fill="none" stroke-linecap="round"/>`).join('')}<path d="M12 24 Q12 4 30 4 Q48 4 48 24 Z" fill="#E4D9FF" opacity=".95"/>${EYE(25, 16)}${EYE(35, 16)}</svg>` },
    { id: 'starfish', name: '불가사리', g: 'echinoderm', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M30 2 L36 16 L52 17 L39 27 L44 42 L30 33 L16 42 L21 27 L8 17 L24 16 Z" fill="#FF8A5B" stroke="#E5693A" stroke-width="2" stroke-linejoin="round"/>${EYE(27, 22)}${EYE(33, 22)}</svg>` },
    { id: 'dolphin', name: '돌고래', g: 'mammal', surprise: '돌고래는 허파로 숨 쉬는 포유류!', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M6 24 L0 16 L2 26 L0 34 Z" fill="#6E8FB5"/><path d="M4 26 Q14 10 38 12 Q50 13 54 20 L60 22 L54 24 Q48 32 30 32 Q14 32 4 26 Z" fill="#86A9CF"/><path d="M28 13 L32 4 L36 13 Z" fill="#6E8FB5"/><path d="M18 30 Q32 34 50 24" stroke="#DCE8F5" stroke-width="4" fill="none"/>${EYE(46, 18)}</svg>` },
    { id: 'whale', name: '고래', g: 'mammal', surprise: '고래도 포유류예요!', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M6 20 L0 10 L4 22 L0 32 Z" fill="#2F5FA8"/><path d="M4 22 Q8 10 30 10 Q54 10 56 26 Q54 38 30 38 Q10 38 4 22 Z" fill="#3D74C4"/><path d="M12 30 Q30 42 54 30" stroke="#B9D3F2" stroke-width="5" fill="none"/><path d="M40 8 Q38 2 34 2 M40 8 Q42 2 46 2" stroke="#9CC9FF" stroke-width="2" fill="none"/>${EYE(44, 20)}</svg>` },
    { id: 'seal', name: '물범', g: 'mammal', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M6 34 Q2 26 10 26 L14 30 Z" fill="#7C8796"/><path d="M8 32 Q14 14 36 12 Q52 12 54 24 Q54 36 36 38 Q16 40 8 32 Z" fill="#9AA6B5"/><ellipse cx="44" cy="26" rx="7" ry="5" fill="#C9D2DC"/>${EYE(42, 19)}${EYE(50, 19)}<circle cx="47" cy="25" r="1.8" fill="#1C1733"/><path d="M42 27 L36 26 M42 28 L36 30 M52 27 L58 26 M52 28 L58 30" stroke="#5A6472" stroke-width="1"/></svg>` },
    { id: 'turtle', name: '바다거북', g: 'reptile', svg: `<svg viewBox="0 0 60 44" aria-hidden="true"><path d="M14 16 L4 8 L10 20 Z M14 30 L4 38 L12 30 Z M44 30 L54 38 L46 28 Z" fill="#5DB36A"/><ellipse cx="50" cy="20" rx="8" ry="6" fill="#7BCB86"/><ellipse cx="28" cy="23" rx="18" ry="13" fill="#3E8F50"/><path d="M28 10 L28 36 M14 23 L42 23 M18 14 L38 32 M38 14 L18 32" stroke="#2F7340" stroke-width="1.5"/>${EYE(53, 18)}</svg>` }
  ];
  const CR = {};
  CREATURES.forEach((c) => { CR[c.id] = c; });

  const fishing = {
    id: 'fishing', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M30 2 V16 Q30 22 25 22 Q21 22 21 18" fill="none" stroke="#E8EEF5" stroke-width="2.4" stroke-linecap="round"/><path d="M8 29 L2 23 L2 35 Z" fill="#E2700F"/><ellipse cx="21" cy="29" rx="15" ry="9" fill="#FF8A1F"/><rect x="14" y="21" width="3.4" height="16" fill="#fff"/><rect x="24" y="21" width="3.4" height="16" fill="#fff"/><circle cx="31" cy="27" r="2.2" fill="#1C1733"/></svg>`, hall: '바다관', title: '바다 낚시', cat: '바다 생물 분류', catColor: 'b', dur: 35,
    levels: ['e', 'm'],
    buttons: ['r', 'g', 'b'],
    rules(lv) {
      return lv === 'e'
        ? ['낚싯바늘 앞에 바다 친구가 올라와요', '물고기면 그 자리 버튼으로 낚아요', '해파리·문어·게는 물고기가 아니에요!']
        : ['위에 나오는 미션 동물만 낚아요', '미션은 15초마다 바뀌어요', '힌트를 보고 어떤 무리인지 생각해요'];
    },
    illus(lv) {
      const ids = lv === 'm' ? ['octopus', 'crab', 'dolphin'] : ['clownfish', 'jellyfish', 'shark'];
      const lab = lv === 'm' ? ['연체동물', '갑각류', '포유류'] : ['물고기 O', '물고기 X', '물고기 O'];
      return `<div class="il-row" style="gap:12px">${ids.map((id, i) =>
        `<div class="il-btn"><div style="width:72px">${CR[id].svg}</div><span>${CR[id].name}</span><span style="color:${lab[i].includes('X') ? '#FF8B95' : '#7DF0AE'}">${lab[i]}</span></div>`).join('')}</div>`;
    },
    learn(lv) {
      return lv === 'e'
        ? '물고기는 아가미로 숨 쉬고 지느러미로 헤엄쳐요. 상어·가오리·해마도 물고기! 하지만 해파리, 문어, 게, 불가사리는 물고기가 아니에요. 돌고래와 고래는 허파로 숨 쉬는 포유류예요.'
        : '바다 동물 분류: 어류(고등어·상어·해마), 연체동물(문어·오징어·조개), 갑각류(게·새우), 포유류(돌고래·고래·물범), 자포동물(해파리), 극피동물(불가사리), 파충류(바다거북).';
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const lv = ctx.level === 'm' ? 'm' : 'e';
      const D = Math.max(5000, ctx.endAt - ctx.startAt);
      const MISSION_MS = 15000;
      const missions = lv === 'e'
        ? ['fish']
        : shuffle(R, ['fish', 'mollusc', 'crustacean', 'mammal']).slice(0, Math.ceil(D / MISSION_MS));
      const missionAt = (e) => missions[Math.min(missions.length - 1, Math.floor(e / MISSION_MS))];
      const byGroup = {};
      CREATURES.forEach((c) => { (byGroup[c.g] = byGroup[c.g] || []).push(c.id); });
      const events = [];
      let tt = 900;
      while (tt < D - 700) {
        const prog = tt / D;
        const mission = missionAt(tt);
        const wantTarget = R() < (lv === 'e' ? 0.55 : 0.5);
        let id;
        if (wantTarget) {
          const list = byGroup[mission];
          id = list[Math.floor(R() * list.length)];
        } else {
          const others = CREATURES.filter((c) => c.g !== mission);
          id = others[Math.floor(R() * others.length)].id;
        }
        const up = lv === 'e' ? 1900 - prog * 300 : 1500 - prog * 350;
        events.push({ at: tt, lane: Math.floor(R() * 3), id, up });
        tt += (lv === 'e' ? 1150 : 860) - prog * 220 + R() * 260;
      }
      let ptr = 0;
      let t0 = 0;
      let score = 0;
      let caught = 0;
      let wrong = 0;
      let curMission = '';
      const lanes = [null, null, null];

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="fs-wrap">
        <div class="fs-mission"><b class="disp"></b><span></span></div>
        <div class="fs-msg disp"></div>
        <div class="fs-sea">${SLOTS.map((c) => `<div class="fs-lane"><i class="fs-line"></i><div class="fs-hook"></div>
          <div class="fs-zone"></div><div class="fs-cre"><div class="fs-pic"></div><span class="fs-nm"></span></div>
          <span class="fs-tag" style="background:${G.HEX[c]}">${shape(c, 16)}</span></div>`).join('')}
          <div class="fs-bubbles"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="fs-rays"><i></i><i></i><i></i></div>
          <svg class="fs-floor" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 40 Q40 30 80 40 T160 38 T240 40 T300 36 L300 70 L0 70 Z" fill="#E8C98A"/>
            <path d="M0 52 Q50 44 100 52 T200 50 T300 50 L300 70 L0 70 Z" fill="#D4AE6A"/>
            <path d="M22 40 Q14 22 24 8 Q30 22 22 40 M30 40 Q38 24 32 4 Q24 22 30 40" fill="#2FA866"/>
            <path d="M150 38 Q142 18 152 2 Q160 18 150 38" fill="#38C177"/>
            <path d="M262 38 Q256 26 262 14 Q270 26 262 38 M270 38 Q280 22 274 10" fill="#2FA866" stroke="#2FA866" stroke-width="3"/>
            <g fill="#FF7A8A"><circle cx="92" cy="34" r="6"/><circle cx="100" cy="28" r="5"/><circle cx="106" cy="35" r="5"/><rect x="96" y="32" width="5" height="10"/></g>
            <g fill="#FFB347"><circle cx="208" cy="32" r="5"/><circle cx="215" cy="27" r="4"/><circle cx="220" cy="33" r="4"/><rect x="212" y="31" width="4" height="10"/></g>
            <path d="M58 48 l5 -4 l5 4 l-2 -6 l4 -4 h-6 l-1 -6 l-1 6 h-6 l4 4 Z" fill="#FF8A5B"/>
            <ellipse cx="180" cy="50" rx="9" ry="4" fill="#F4E3C2"/><path d="M171 50 Q180 40 189 50" fill="#F2C9A0"/>
          </svg></div>
        <div class="fs-info">잘 낚은 친구 <b>0</b></div>
      </div>`);
      ctx.stage.appendChild(wrap);
      const laneEls = Array.from(wrap.querySelectorAll('.fs-lane'));
      const creEls = Array.from(wrap.querySelectorAll('.fs-cre'));
      const mTitle = wrap.querySelector('.fs-mission b');
      const mHint = wrap.querySelector('.fs-mission span');
      const missionEl = wrap.querySelector('.fs-mission');
      const msg = wrap.querySelector('.fs-msg');
      const info = wrap.querySelector('.fs-info');

      function setMission(g) {
        curMission = g;
        const gi = GROUP[g];
        mTitle.textContent = g === 'fish' ? '물고기만 낚아요!' : `${gi.name}만 낚아요!`;
        mHint.textContent = gi.hint;
        retrigger(missionEl, 'flash');
      }
      function hide(i) {
        creEls[i].classList.remove('up');
        lanes[i] = null;
      }

      return {
        start(t) { t0 = t; setMission(missionAt(0)); },
        tick(t) {
          const e = t - t0;
          const m = missionAt(e);
          if (m !== curMission) {
            setMission(m);
            ctx.sfx.whoosh();
            ctx.vibrate([20, 30, 20]);
          }
          while (ptr < events.length && events[ptr].at <= e) {
            const ev = events[ptr++];
            if (lanes[ev.lane]) continue;
            const c = CR[ev.id];
            lanes[ev.lane] = { ev, upAt: e, done: false };
            const ce = creEls[ev.lane];
            ce.querySelector('.fs-pic').innerHTML = c.svg;
            ce.querySelector('.fs-nm').textContent = c.name;
            ce.className = 'fs-cre up';
          }
          lanes.forEach((L, i) => {
            if (L && !L.done && e - L.upAt > L.ev.up) hide(i);
          });
        },
        onPress(c, t) {
          const e = t - t0;
          const i = IDX[c];
          const L = lanes[i];
          const lane = laneEls[i];
          retrigger(lane, 'tug');
          if (!L || L.done) {
            msgPop(msg, '앗, 아무도 없어요', '#C9C3E6');
            return;
          }
          L.done = true;
          const cr = CR[L.ev.id];
          const p = center(ctx, creEls[i]);
          if (cr.g === curMission) {
            const quick = Math.max(0, Math.round(15 * (1 - (e - L.upAt) / L.ev.up)));
            const gain = 30 + quick;
            score += gain;
            caught++;
            creEls[i].classList.add('caught');
            ctx.fx.burst(p.x, p.y, '#7DF0AE', 12);
            ctx.fx.float('+' + gain, p.x, p.y - 40, '#FFD23F', 28);
            msgPop(msg, cr.surprise || `${cr.name} 낚았다!`, cr.surprise ? '#FFD23F' : '#7DF0AE');
            ctx.sfx.good();
            ctx.vibrate(12);
            info.innerHTML = `잘 낚은 친구 <b>${caught}</b>`;
          } else {
            wrong++;
            score = Math.max(0, score - 15);
            creEls[i].classList.add('wrongc');
            msgPop(msg, `${eunNeun(cr.name)} ${GROUP[cr.g].is}`, '#FF8B95');
            ctx.fx.float('-15', p.x, p.y - 40, '#FF8B95', 24);
            ctx.sfx.bad();
            ctx.vibrate([40, 30, 40]);
            ctx.lock(450);
          }
          ctx.setScore(score);
          setTimeout(() => { if (lanes[i] === L) hide(i); }, 380);
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${caught}마리 낚음 · 실수 ${wrong}번`
      };
    }
  };

  /* ================================================================
     5. 주기율표 빨리 고르기 (원소관) — 초·중·고
     ================================================================ */
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
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="3" y="3" width="34" height="34" rx="7" fill="#2ED573"/><rect x="3" y="3" width="34" height="34" rx="7" fill="none" stroke="#1A8F4A" stroke-width="3"/><text x="8" y="13" font-size="8" fill="#0B2A17" font-family="sans-serif" font-weight="700">1</text><text x="20" y="31" text-anchor="middle" font-size="19" fill="#0B2A17" font-family="sans-serif" font-weight="900">H</text></svg>`, hall: '원소관', title: '주기율표 빨리 고르기', cat: '원소와 주기율표', catColor: 'g', dur: 35,
    levels: ['e', 'm', 'h'],
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

  /* ================================================================
     6. 행성 찾기 (우주관) — 초·중
     ================================================================ */
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
    hall: '우주관', title: '행성 찾기', cat: '태양계', catColor: 'b', dur: 35,
    levels: ['e', 'm'],
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

  /* ================================================================
     7. 진화 나무 오르기 (생명의 나무) — 초·중
     ================================================================ */
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
    hall: '생명의 나무', title: '진화 나무 오르기', cat: '동물 분류', catColor: 'g', dur: 35,
    levels: ['e', 'm'],
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


  /* ================================================================
     8. 오르골 연주회 (음악관) — 초·중 (오락실의 오르골 리듬과 같은 게임)
     ================================================================ */
  const music = {
    id: 'music', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="16" width="30" height="19" rx="3" fill="#C98B4F"/><rect x="5" y="16" width="30" height="5" fill="#A86B35"/><path d="M7 16 L11 6 L33 6 L33 16" fill="#E0A868"/><circle cx="20" cy="27" r="3.4" fill="#FFE27A"/><path d="M35 24 h3 v5 h-3" fill="none" stroke="#FFE27A" stroke-width="2"/><path d="M14 4 v-2 M20 4 v-3 M26 4 v-2" stroke="#FFE7B0" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    hall: '음악관', title: '오르골 연주회', cat: '클래식 리듬', catColor: 'y', dur: 60,
    levels: ['e', 'm'],
    buttons: ['r', 'g', 'b'], music: false, pressSound: false,
    rules(lv) {
      return lv === 'e'
        ? ['음표가 선에 닿을 때 같은 줄 버튼!', '맞히면 오르골 소리로 클래식이 연주돼요', '한 곡을 처음부터 끝까지, 조금 느리게 연주해요']
        : ['음표가 선에 닿을 때 같은 줄 버튼!', '한 곡을 처음부터 끝까지 연주해요', '낮은 음은 왼쪽, 높은 음은 오른쪽'];
    },
    illus() {
      return `<div class="il-row" style="gap:16px"><div style="width:84px;height:84px">${music.icon}</div>
        <div class="il-cap" style="text-align:left">♪ 환희의 송가 · 베토벤<br>♪ 터키 행진곡 · 모차르트<br>♪ 미뉴에트 · 바흐 …</div></div>`;
    },
    learn(lv) {
      return lv === 'e'
        ? '오르골은 작은 쇠빗을 핀이 하나씩 튕겨서 소리를 내요. 낮은 음은 긴 빗살, 높은 음은 짧은 빗살! 오늘 연주한 곡들은 200~300년 전에 만들어진 클래식이에요.'
        : '베토벤은 귀가 거의 들리지 않게 된 뒤에 "환희의 송가"가 나오는 교향곡 9번을 완성했어요. 바흐는 "음악의 아버지", 모차르트는 다섯 살 때부터 작곡을 한 천재로 불려요.';
    },
    create(ctx) {
      const base = G.ALL.rhythm;
      return base.createWith(ctx, { speed: ctx.level === 'e' ? 0.85 : 1, long: true });
    }
  };

  Object.assign(G.ALL, { light, paint, history, fishing, space, tree, music, periodic });
  G.EDU = ['light', 'paint', 'history', 'fishing', 'space', 'tree', 'music', 'periodic'];
  G.LEVEL_NAME = { e: '초등', m: '중등', h: '고등' };
  // 고른 난이도가 없는 게임은 가장 가까운 단계로
  G.effLevel = function (def, lv) {
    const order = ['e', 'm', 'h'];
    const levels = (def && def.levels) || order;
    if (levels.includes(lv)) return lv;
    const i = order.indexOf(lv);
    let best = levels[0];
    let bd = 9;
    levels.forEach((l) => {
      const d = Math.abs(order.indexOf(l) - i);
      if (d < bd || (d === bd && order.indexOf(l) < order.indexOf(best))) { bd = d; best = l; }
    });
    return best;
  };
})();
