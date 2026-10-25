/* 아리채 오락실 · 회귀 RPG 「되감기 용사단」 규칙 계산 (화면과 완전히 떨어진 순수 계산)
   - 1인칭 색 패링 (docs/handoff/specs/rpg_fp.md)
       · 적 공격 한 타마다 색(r·g·b) 하나 → 닿는 순간(ti) 그 색 버튼을 누르면 '패링', 아니면 '맞음' (막기 단계는 없어요)
       · 한 타에는 처음 누른 버튼만 인정해요 (세 버튼 막 누르기 막기)
       · 적이 공격하지 않을 때는 용사가 저절로 3타 리듬으로 때려요 (자동 공격)
       · 연속 패링 3번(모아 베기 카드면 2번) = 강반격 ×5 · 세 버튼 동시(120ms 안) = 필살기
   - 판정 숫자(폭·연타·간격·예고)는 data.js 의 parry 한 묶음이에요 (난이도 고르기는 없어요 — 회귀할수록 쉬워져요)
   - 세계(World) = 시각 t(ms) · 용사들 · 지금 적 · 예고된 적 공격들 · 진행 단계(걷기·싸움·카드·전멸·클리어)
   - step(W, dt) 를 고정 간격(DT=8ms)으로 불러요. 입력은 press/release 로 그 시각에 바로 넣어요
   - 화면은 W.ev(일어난 일 목록)를 읽어 효과를 그리고, 상태(W)를 읽어 모습을 그려요 → 화면을 통째로 바꿔도 규칙은 그대로
   - '진행자(dir)' 가 적 체력·공격 시간표·방 진행을 맡아요
       · 혼자 모드: soloDir (이 파일) — 폰 안에서 다 계산
       · 같이 모드: 서버 rpg.py 가 같은 규칙으로 계산하고, net.js 의 netDir 가 서버 값을 따라가요 (색 패링은 아직 혼자 모드만)
   - 자동 플레이어(botThink)는 AI 동료와 밸런스 시험에 같이 써요
   - 브라우저(window.RpgSim)와 node(require) 둘 다에서 돌아가요 */
(function (root) {
  'use strict';

  const D = root.RpgData || (typeof require !== 'undefined' ? require('./data.js') : null);
  const HD = D.hero;
  const PR = D.parry;
  const DT = 8;
  const COLORS = ['r', 'g', 'b'];
  const EC = D.econ;
  const SD = D.stats;
  const STAT_KEYS = ['str', 'agi', 'vit'];

  /* ---------------- 작은 도구 ---------------- */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash() {
    let h = 0x811C9DC5;
    for (let i = 0; i < arguments.length; i++) {
      const s = String(arguments[i]);
      for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
      h ^= 0x2C; h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pickW = (R, list) => {
    const tot = list.reduce((s, x) => s + (x.w || 1), 0);
    let r = R() * tot;
    for (const x of list) { r -= (x.w || 1); if (r <= 0) return x; }
    return list[list.length - 1];
  };
  function gauss(R) { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); }

  /* ================================================================
     회귀 공식 (회차 · 경험치 배율 · 기억 조각)
     ================================================================ */
  // 경험치 배율 = 1 + 0.33 × √(회차 − 1), 최대 ×4
  function xpMult(loop) { return Math.min(D.meta.xpCap, 1 + D.meta.xpK * Math.sqrt(Math.max(0, (loop || 1) - 1))); }
  // 죽으면 1 + 도달한 방 번호 · 보스를 깨면 +10 더
  function shardsFor(reached, clear) { return 1 + (reached || 0) + (clear ? D.meta.clearBonus : 0); }
  const LAST_ROOM = D.rooms.length - 1;       // 보스 방 번호 (0부터)

  /* ---------------- 카드 · 적 공격 이름표 ---------------- */
  const CARD = {};
  D.cards.forEach((c) => { CARD[c.id] = c; });
  const PAT = {};
  Object.keys(D.enemies).forEach((k) => { D.enemies[k].pats.forEach((p) => { PAT[p.id] = Object.assign({ enemy: k }, p); }); });
  const COLOR_NAME = { r: '빨강', g: '초록', b: '파랑', x: '' };
  const STAT_NAME = { str: '힘', agi: '민첩', vit: '체력' };
  function emptyUpg() { const u = {}; D.cards.forEach((c) => { u[c.id] = 0; }); return u; }
  // 빨강 칸 = 공격 카드, 초록 칸 = 패링 카드, 파랑 칸 = 필살·몸 카드 (버튼 색 = 카드 색)
  function drawCards(R, upg) {
    return COLORS.map((c) => {
      const pool = D.cards.filter((x) => x.c === c && (upg[x.id] || 0) < x.max);
      return pool.length ? pool[Math.floor(R() * pool.length)].id : 'potion';
    });
  }

  /* ---------------- 조개껍데기 · 장비 · 스탯 (rpg_story.md 6절 '돈·장비·스탯') ----------------
     - 조개: 적을 쓰러뜨리면 적마다 shell 만큼 · 패링 한 번마다 콤보가 길수록 더 (parryShell)
     - 장비: 무기(w) = 반격·강반격 피해 +% · 방어구(a) = 받는 피해 −% · 칸마다 하나 (더 좋은 것을 사면 바꿔 끼워요)
     - 스탯: 힘 = 반격 피해 +5%/점 · 민첩 = 패링 판정 +6ms/점 (최대 +36ms) · 체력 = 최대 HP +6/점 (모두 처음 10에서부터) */
  const GEAR = {};
  EC.weapons.forEach((g, i) => { GEAR[g.id] = Object.assign({ slot: 'w', tier: i + 1 }, g); });
  EC.armors.forEach((g, i) => { GEAR[g.id] = Object.assign({ slot: 'a', tier: i + 1 }, g); });
  function baseStats() { return { str: SD.base, agi: SD.base, vit: SD.base }; }
  function fixStats(v) {
    const o = baseStats();
    if (v && typeof v === 'object') STAT_KEYS.forEach((k) => { const n = Math.floor(Number(v[k])); if (n >= SD.base) o[k] = n; });
    return o;
  }
  // 스탯 하나가 주는 효과 (화면 설명과 계산이 같은 함수를 써요)
  function statEffect(k, v) {
    const d = Math.max(0, (v == null ? SD.base : v) - SD.base);
    if (k === 'str') return SD.str * d;                       // 반격 피해 +비율
    if (k === 'agi') return Math.min(SD.agiCap, SD.agi * d);  // 판정 폭 +ms (상한)
    if (k === 'vit') return SD.vit * d;                       // 최대 HP +
    return 0;
  }
  function statText(k, v) {
    const e = statEffect(k, v);
    if (k === 'str') return `반격 피해 +${Math.round(e * 100)}%`;
    if (k === 'agi') return `패링 판정 +${e}ms${e >= SD.agiCap ? ' (최대)' : ''}`;
    if (k === 'vit') return `최대 체력 +${e}`;
    return '';
  }
  // 회귀 규칙: 스탯 = 이번 생 처음 수치 + ⌊(죽기 직전까지 오른 만큼) × 50%⌋  (예: 힘 10 → 20 이면 15)
  function carryStats(start, end) {
    const a = fixStats(start); const b = fixStats(end); const o = {};
    STAT_KEYS.forEach((k) => { o[k] = a[k] + Math.floor(Math.max(0, b[k] - a[k]) * SD.keep); });
    return o;
  }
  // 패링 한 번에 받는 조개 (콤보가 길수록 많이 · 상한 comboMax)
  function parryShell(combo) { return Math.min(EC.comboMax, EC.parry + Math.floor(EC.comboStep * Math.max(0, (combo || 1) - 1))); }
  function addShell(W, h, n, why) {
    if (!n || n <= 0) return;
    h.shell += n; h.stat.shell += n;
    emit(W, 'shell', { h: h.id, n, why, total: h.shell });
  }
  // 상점: 같은 칸의 지금 장비보다 좋은 것만, 돈이 있을 때만
  function canBuy(h, id) {
    const g = GEAR[id];
    if (!g) return false;
    const cur = GEAR[h.gear[g.slot]];
    return (!cur || g.tier > cur.tier) && h.shell >= g.price;
  }
  function buyGear(h, id) {
    if (!canBuy(h, id)) return false;
    const g = GEAR[id];
    h.shell -= g.price;
    h.gear[g.slot] = id;
    refresh(h);
    return true;
  }
  function leaveShop(W, h) { h.shopped = true; }
  // 스탯 점수 쓰기 (보스를 잡으면 받은 점수)
  function spendPt(h, k) {
    if (!(h.pts > 0) || STAT_KEYS.indexOf(k) < 0) return false;
    h.pts--; h.stats[k]++;
    refresh(h);
    return true;
  }

  /* ---------------- 용사 능력치 ---------------- */
  function needXp(lv) { return HD.xpBase + HD.xpGrow * (lv - 1); }
  function calcStats(h) {
    const u = h.upg; const m = h.meta; const lv = h.lv;
    const sv = h.stats || baseStats(); const gr = h.gear || {};
    const wg = GEAR[gr.w]; const ag = GEAR[gr.a];
    const cK = (1 + statEffect('str', sv.str)) * (1 + (wg ? wg.atk : 0));   // 힘 · 무기 → 반격·강반격
    return {
      atk: HD.atk * (1 + HD.lvAtk * (lv - 1)),
      maxHp: Math.round(HD.hp * (1 + 0.15 * (m.hp || 0)) + HD.lvHp * (lv - 1) + 20 * u.tough + statEffect('vit', sv.vit)),
      comboMult: 1 + 0.2 * u.slash,                       // 자동 공격
      strongMult: HD.strong.mult * (1 + 0.4 * u.heavy) * cK,   // 강반격
      strongNeed: u.heavy ? HD.strong.need - 1 : HD.strong.need,
      vamp: 3 * u.vamp,
      take: Math.max(0.2, (1 - HD.wallCut * u.wall) * (1 - (ag ? ag.def : 0))),   // 맞을 때 받는 피해 비율 (방어구 포함)
      parryWin: 40 * u.parry + statEffect('agi', sv.agi),  // 판정 폭 더하기(ms) · 민첩은 상한이 있어요
      counterMult: HD.counterMult * (1 + 0.3 * u.parry) * cK,
      parryHeal: 6 * u.calm,
      gaugeMult: 1 + 0.3 * u.charge,
      specMult: HD.spec.mult * (1 + 0.35 * u.nova),
      xpMult: xpMult(m.loop) * (1 + 0.3 * u.star)
    };
  }
  function refresh(h) {
    const before = h.st ? h.st.maxHp : 0;
    h.st = calcStats(h);
    if (before && h.st.maxHp > before) h.hp += h.st.maxHp - before;
    h.hp = Math.min(h.hp, h.st.maxHp);
  }

  /* 용사 하나 — o: { id, name, ath, kind: me|bot|remote, meta: {loop, hp, combo, reroll, stars, fore}, mem: {id, lv} } */
  function makeHero(o) {
    const meta = Object.assign({ loop: 1, hp: 0, combo: 0, reroll: 0, stars: 0, fore: [], stats: null }, o.meta || {});
    if (!Array.isArray(meta.fore)) meta.fore = [];
    const h = {
      id: o.id, name: o.name || '용사', ath: o.ath || 'dino', kind: o.kind || 'me', meta,
      upg: emptyUpg(), lv: 1, xp: 0, hp: 0, gauge: 0, st: null,
      act: 'walk', actT: 0, step: 0, nextStep: 0, hitDone: false, specN: 0, restUntil: 0, autoN: 0,
      keys: { r: false, g: false, b: false }, lp: { r: -1e9, g: -1e9, b: -1e9 },
      jd: {}, pend: [], counters: [], streak: 0, combo: 0, killer: '',
      frz: 0, inv: 0, down: false, seq: 0,
      cards: null, rerolls: meta.reroll || 0, rerolled: 0, picks: [],
      // 이번 생의 조개 돈 · 장비 (회귀하면 0 · 없음) · 스탯 (회귀해도 오른 만큼의 50% 남아요) · 아직 안 쓴 스탯 점수
      shell: 0, gear: { w: '', a: '' }, stats: fixStats(meta.stats), stats0: fixStats(meta.stats), pts: 0, shopped: false,
      stat: { hits: 0, parries: 0, hurts: 0, dodges: 0, dealt: 0, taken: 0, specs: 0, kills: 0, strongs: 0, shell: 0, fail: { color: 0, early: 0, late: 0, miss: 0 } }
    };
    // 전생의 검술(영구) · 스킬 기억(지난 생에서 가장 키운 카드)
    if (meta.combo) h.upg.slash = Math.max(h.upg.slash, meta.combo);
    if (o.mem && CARD[o.mem.id] && o.mem.id !== 'potion') h.upg[o.mem.id] = Math.max(h.upg[o.mem.id], Math.min(CARD[o.mem.id].max, o.mem.lv || 1));
    h.st = calcStats(h);
    h.hp = h.st.maxHp;
    return h;
  }

  /* ================================================================
     세계 — o: { t, seed, loop, stars, heroes, dir, net }
     ================================================================ */
  function makeWorld(o) {
    const W = {
      t: o.t || 0, seed: o.seed || 1, R: rng(o.seed || 1), loop: o.loop || 1, stars: o.stars || 0,
      heroes: o.heroes || [], enemy: null, atks: [], ev: [],
      phase: 'walk', room: 0, enc: 0, plan: [], spawnAt: 0, cardsAt: 0, endAt: 0, result: '',
      eidN: 0, aidN: 0, dir: o.dir || null, net: !!o.net, done: {}, killed: 0
    };
    if (!W.dir) W.dir = soloDir;
    if (W.dir.init) W.dir.init(W, o);
    return W;
  }
  const emit = (W, k, o) => { const e = Object.assign({ k, t: W.t }, o || {}); W.ev.push(e); return e; };
  const local = (h) => h.kind !== 'remote';
  const heroById = (W, id) => W.heroes.find((h) => h.id === id) || null;
  const fighting = (W) => W.phase === 'fight' && W.enemy && !W.enemy.dead;
  const aimsAt = (a, h) => a.all || a.tg.indexOf(h.id) >= 0;
  const hitKey = (a, i) => a.id + ':' + i;

  // 판정 시간 폭: 기본 폭 + 번개 패링 → 닿는 순간 앞 60% · 뒤 40%
  function winOf(W, h) {
    const w = PR.win + (h && h.st ? h.st.parryWin : 0);
    const pre = Math.round(w * HD.parrySplit);
    return { pre, post: w - pre, w };
  }
  // 공격 한 타의 정보 { ti 닿는 시각, c 색, show 고리 나타남, reveal 색 보임, d 피해 }
  //   (같이 모드에서 서버가 보낸 공격처럼 hx 가 없으면 공격 번호로 색을 정해요)
  function hitsOf(a) {
    if (a.hx && a.hx.length === a.hits.length) return a.hx;
    a.hx = a.hits.map((ti, i) => ({ ti, c: COLORS[hash(a.id, i, a.pat) % 3], show: ti - PR.lead, reveal: ti - PR.reveal, d: a.dmg }));
    return a.hx;
  }
  // 이 용사를 노리는 공격이 진행 중인가 (고리가 떠 있는 동안은 자동 공격을 쉬어요)
  function busy(W, h) {
    if (h.pend.length) return true;
    for (const a of W.atks) {
      if (a.broken || !aimsAt(a, h)) continue;
      if (!a.over || W.t < a.hits[a.hits.length - 1] + 150) return true;
    }
    return false;
  }

  /* ---------------- 입력 (색 버튼 = 그 색 공격 패링 · 세 버튼 동시 = 필살) ---------------- */
  function press(W, h, c, t) {
    if (!h || h.down || COLORS.indexOf(c) < 0) return null;
    const T = t == null ? W.t : t;
    h.keys[c] = true;
    h.lp[c] = T;
    let r = null;
    if (fighting(W) && local(h)) r = judgePress(W, h, c, T);
    specCheck(W, h, T);
    return r;
  }
  function release(W, h, c) {
    if (!h || !h.keys) return;
    if (COLORS.indexOf(c) >= 0) h.keys[c] = false;
  }
  function setAct(W, h, a) {
    h.act = a; h.actT = 0; h.hitDone = false; h.seq++;
  }
  // 누른 버튼 하나 → 어느 타에 쓸지 정해요
  //   1) 판정 폭 안의 아직 판정 안 된 타 (가장 이른 것) → 색이 같으면 패링, 다르면 '색이 달라요'
  //   2) 방금 안 눌러서 맞은 타의 바로 뒤(늦음 표시 구간) → '늦어요'로 이름만 바꿔요 (다음 타를 빼앗지 않게)
  //   3) 판정 폭 바로 앞(시도 구간 250ms) → '빨라요' (그 타는 맞아요)
  //   그 밖의 누름은 무시해요
  function judgePress(W, h, c, T) {
    const { pre, post } = winOf(W, h);
    let win = null; let early = null; let late = null;
    for (const a of W.atks) {
      if (a.broken || !aimsAt(a, h)) continue;
      const hx = hitsOf(a);
      for (let i = 0; i < hx.length; i++) {
        const ti = hx[i].ti;
        const j = h.jd[hitKey(a, i)];
        if (!j) {
          if (T >= ti - pre && T <= ti + post) { if (!win || ti < win.ti) win = { a, i, ti }; }
          else if (T >= ti - pre - HD.tryEarly && T < ti - pre) { if (!early || ti < early.ti) early = { a, i, ti }; }
        } else if (j.r === 'miss' && T > ti + post && T <= ti + post + HD.lateShow) { if (!late || ti > late.ti) late = { a, i, ti, j }; }
      }
    }
    if (win) return judge(W, h, win.a, win.i, hitsOf(win.a)[win.i].c === c ? 'parry' : 'color', c, T);
    if (late) {
      late.j.r = 'late';
      h.stat.fail.miss--; h.stat.fail.late++;
      emit(W, 'judge', { h: h.id, a: late.a.id, i: late.i, r: 'late', c: hitsOf(late.a)[late.i].c, pc: c, d: Math.round(T - late.ti), fix: true });
      return 'late';
    }
    if (early) return judge(W, h, early.a, early.i, 'early', c, T);
    return null;
  }
  function judge(W, h, a, i, r, c, T) {
    const x = hitsOf(a)[i];
    h.jd[hitKey(a, i)] = { r, c, t: T };
    if (r !== 'parry') h.stat.fail[r]++;
    emit(W, 'judge', { h: h.id, a: a.id, i, r, c: x.c, pc: c, d: Math.round(T - x.ti) });
    // 이미 닿은 타(늦게 누른 패링)면 바로 처리 · 아직이면 닿는 순간 처리해요
    const pi = h.pend.findIndex((p) => p.a === a && p.i === i);
    if (pi >= 0) {
      h.pend.splice(pi, 1);
      if (r === 'parry') doParry(W, h, a, i);
      else if (W.t < h.inv) doDodge(W, h, a, i);
      else doHurt(W, h, a, i, r);
    }
    return r;
  }
  // 세 버튼을 120ms 안에 다 누르면 필살기 (게이지가 다 찼을 때만)
  function specCheck(W, h, T) {
    const ts = COLORS.map((k) => h.lp[k]);
    if (Math.min.apply(null, ts) < T - HD.spec.win) return;
    COLORS.forEach((k) => { h.lp[k] = -1e9; });
    if (h.gauge >= HD.gaugeMax && !h.down && h.act !== 'spec' && h.act !== 'cheer' && W.phase === 'fight') {
      h.gauge = 0;
      h.inv = W.t + HD.spec.invuln;
      h.specN = 0;
      setAct(W, h, 'spec');
      h.stat.specs++;
      emit(W, 'spec', { h: h.id });
    } else emit(W, 'specNo', { h: h.id, g: h.gauge });
  }

  /* ---------------- 용사 한 걸음 ---------------- */
  function heroStep(W, h, dt) {
    if (!local(h)) return;
    const t = W.t;
    // 닿았는데 아무도 안 누른 타: 판정 폭 뒤(ti + 뒤 폭)가 지나면 진짜로 맞아요
    if (h.pend.length) {
      const post = winOf(W, h).post;
      const due = h.pend.filter((p) => t > p.ti + post);
      if (due.length) {
        h.pend = h.pend.filter((p) => t <= p.ti + post);
        due.forEach((p) => {
          if (h.down) return;
          h.jd[hitKey(p.a, p.i)] = { r: 'miss', c: '', t };
          h.stat.fail.miss++;
          emit(W, 'judge', { h: h.id, a: p.a.id, i: p.i, r: 'miss', c: hitsOf(p.a)[p.i].c, pc: '', d: 0 });
          if (t < h.inv) doDodge(W, h, p.a, p.i); else doHurt(W, h, p.a, p.i, 'miss');
        });
      }
    }
    // 반격(패링 150ms 뒤 자동) · 강반격
    if (h.counters.length) {
      const due = h.counters.filter((c) => t >= c.at);
      if (due.length) {
        h.counters = h.counters.filter((c) => t < c.at);
        due.forEach((c) => { if (!h.down) dealHit(W, h, c.mult, c.kind); });
      }
    }
    if (h.down) return;
    if (t < h.frz) return;     // 타격 멈춤(hit-stop): 동작 시간이 잠깐 멈춰요
    h.actT += dt;
    const fight = fighting(W);
    const E = W.enemy;
    const spd = fight && E && t < E.vuln ? HD.chanceSpeed : 1;    // "지금이야!" 동안 자동 공격 2배 빠르게
    switch (h.act) {
      case 'walk': case 'idle':
        if (fight && h.act === 'walk') h.act = 'idle';
        if (fight && t >= h.restUntil && !busy(W, h)) startSwing(W, h);
        break;
      case 'atk': {
        const cf = HD.combo[h.step];
        if (spd > 1) h.actT += dt * (spd - 1);
        if (!h.hitDone && h.actT >= cf.start) {
          h.hitDone = true;
          dealHit(W, h, cf.mult * h.st.comboMult, 'c' + (h.step + 1));
          h.autoN++;
          if (h.step === 2 && h.st.vamp) heal(W, h, h.st.vamp);
        }
        if (h.actT >= cf.start + cf.rec) {
          h.nextStep = h.step >= 2 ? 0 : h.step + 1;
          if (h.step >= 2) h.restUntil = t + HD.autoRest / spd;
          setAct(W, h, fight ? 'idle' : 'walk');
        }
        break;
      }
      case 'spec': {
        const sp = HD.spec;
        while (h.specN < sp.hits && h.actT >= sp.first + h.specN * sp.gap) {
          h.specN++;
          dealHit(W, h, h.st.specMult * (h.specN === sp.hits ? 2 : 1), h.specN === sp.hits ? 'specEnd' : 'spec');
        }
        if (h.actT >= sp.dur) setAct(W, h, fight ? 'idle' : 'walk');
        break;
      }
      case 'hurt':
        if (h.actT >= HD.hurtMs) setAct(W, h, fight ? 'idle' : 'walk');
        break;
      case 'parry':
        if (h.actT >= 240) setAct(W, h, fight ? 'idle' : 'walk');
        break;
      default: break;
    }
    if (!fight && h.act === 'idle') h.act = 'walk';
  }
  // 자동 공격 한 번 (3타 리듬: 1 → 2 → 3(큰 타격) → 잠깐 쉬고 다시 1)
  function startSwing(W, h) {
    setAct(W, h, 'atk');
    h.step = h.nextStep % 3;
    emit(W, 'swing', { h: h.id, step: h.step, fast: !!(W.enemy && W.t < W.enemy.vuln) });
  }

  // 때리기 → 진행자에게 피해를 알려요
  //   kind: c1·c2·c3(자동) · counter(반격) · strong(강반격) · spec·specEnd(필살)
  function dealHit(W, h, mult, kind) {
    const E = W.enemy;
    if (!E || E.dead || W.phase !== 'fight') return 0;
    const v = 0.92 + 0.16 * W.R();
    const dmg = Math.max(1, Math.round(h.st.atk * mult * v));
    const got = W.dir.hit(W, h, dmg, kind);
    if (!got) return 0;
    let stop = kind === 'counter' ? HD.parryStop : kind === 'strong' ? HD.strong.stop : kind === 'c3' ? HD.combo[2].stop
      : kind === 'c2' ? HD.combo[1].stop : kind === 'specEnd' ? 110 : kind === 'spec' ? 45 : HD.combo[0].stop;
    if (kind[0] === 'c' && kind !== 'counter' && W.t < E.vuln) stop /= HD.chanceSpeed;   // "지금이야!" 동안은 멈춤도 짧게 (리듬 전체가 2배)
    h.frz = Math.max(h.frz, W.t + stop);
    E.frz = Math.max(E.frz, W.t + stop);
    h.stat.hits++; h.stat.dealt += got;
    if (kind !== 'spec' && kind !== 'specEnd') addGauge(W, h, HD.gaugeHit * (kind === 'strong' ? 3 : 1));
    return got;
  }
  function addGauge(W, h, n) {
    const was = h.gauge >= HD.gaugeMax;
    h.gauge = Math.min(HD.gaugeMax, h.gauge + n * h.st.gaugeMult);
    if (!was && h.gauge >= HD.gaugeMax) emit(W, 'gaugeFull', { h: h.id });
  }
  function heal(W, h, n) {
    if (h.down || n <= 0) return;
    const before = h.hp;
    h.hp = Math.min(h.st.maxHp, h.hp + Math.round(n));
    if (h.hp > before) emit(W, 'heal', { h: h.id, n: h.hp - before });
  }

  /* ---------------- 적 공격이 닿는 순간 ---------------- */
  function resolveImpact(W, h, a, i) {
    if (h.down || !local(h)) return;
    const j = h.jd[hitKey(a, i)];
    if (j && j.r === 'parry') { doParry(W, h, a, i); return; }     // 미리 눌러 둔 패링 → 효과는 닿는 순간
    if (W.t < h.inv) { if (!j) h.jd[hitKey(a, i)] = { r: 'dodge', c: '', t: W.t }; doDodge(W, h, a, i); return; }
    if (j) { doHurt(W, h, a, i, j.r); return; }                     // 색이 달랐거나 빨랐던 타
    h.pend.push({ a, i, ti: a.hits[i] });                           // 아직 안 누름 → 뒤 폭 동안 기다려요
  }
  function doParry(W, h, a, i) {
    const x = hitsOf(a)[i];
    const final = i === a.hits.length - 1;
    h.stat.parries++;
    h.streak++;
    // 콤보: 맞기 전까지 이어진 패링 수 → 반격이 점점 세져요 (강반격이 나가도 이어져요)
    h.combo++;
    const PC = HD.parryCombo;
    let cm = 1 + PC.step * (h.combo - 1);
    // cap 0 = 제한 없음 (사용자 결정: 콤보가 이어지는 한 계속 세져요)
    if (PC.cap > 0 && cm > PC.cap) cm = PC.cap;
    const strong = h.streak >= h.st.strongNeed;
    if (strong) { h.streak = 0; h.stat.strongs++; }
    if (h.act !== 'spec') setAct(W, h, 'parry');
    addGauge(W, h, HD.gaugeParry);
    heal(W, h, h.st.parryHeal);
    h.counters.push({ at: W.t + HD.counterDelay, mult: (strong ? h.st.strongMult : h.st.counterMult) * cm, kind: strong ? 'strong' : 'counter' });
    h.frz = W.t + HD.parryStop;
    if (W.enemy) W.enemy.frz = W.t + HD.slowmo;
    emit(W, 'parry', { h: h.id, a: a.id, i, final, c: x.c, strong, streak: strong ? h.st.strongNeed : h.streak, combo: h.combo, cm });
    addShell(W, h, parryShell(h.combo), 'combo');
    W.dir.parried(W, h, a, i, final);
  }
  function doDodge(W, h, a, i) {
    h.stat.dodges++;
    emit(W, 'dodge', { h: h.id, a: a.id, i });
  }
  function doHurt(W, h, a, i, r) {
    if (h.down) return;
    const x = hitsOf(a)[i];
    const dmg = Math.max(1, Math.round(x.d * h.st.take));
    h.hp -= dmg; h.stat.hurts++; h.stat.taken += dmg;
    h.streak = 0; h.combo = 0;
    addGauge(W, h, HD.gaugeHurt);
    if (h.act !== 'spec') setAct(W, h, 'hurt');
    emit(W, 'hurt', { h: h.id, a: a.id, i, dmg, r: r || 'miss', c: x.c });
    W.dir.hurt(W, h, a, i, 'hit', dmg);
    if (h.hp <= 0) knockDown(W, h, a);
  }
  function knockDown(W, h, a) {
    h.hp = 0; h.down = true; h.pend = []; h.counters = [];
    h.killer = a ? a.pat : '';
    setAct(W, h, 'down');
    emit(W, 'down', { h: h.id, pat: h.killer });
    W.dir.down(W, h);
  }
  function gainXp(W, h, n) {
    if (h.down) return;
    h.xp += n * h.st.xpMult;
    emit(W, 'xp', { h: h.id, n: Math.round(n * h.st.xpMult) });
    while (h.xp >= needXp(h.lv)) {
      h.xp -= needXp(h.lv);
      h.lv++;
      refresh(h);
      heal(W, h, h.st.maxHp * HD.lvHeal);
      emit(W, 'lvup', { h: h.id, lv: h.lv });
    }
  }

  // 지금 시각까지 닿은 공격을 처리해요 (내 폰이 맡은 용사만 — 같이 모드에서도 같은 함수)
  function processImpacts(W) {
    for (const a of W.atks) {
      if (a.broken) continue;
      for (let i = 0; i < a.hits.length; i++) {
        const key = hitKey(a, i);
        if (W.done[key] || a.hits[i] > W.t) continue;
        W.done[key] = 1;
        emit(W, 'impact', { a: a.id, i, c: hitsOf(a)[i].c });
        W.heroes.forEach((h) => { if (aimsAt(a, h)) resolveImpact(W, h, a, i); });
        if (W.dir.impacted) W.dir.impacted(W, a, i);
      }
    }
  }

  /* ---------------- 카드 고르기 ---------------- */
  function offerCards(W, h) {
    const R = rng(hash(W.seed, h.id, W.loop, W.room, h.rerolled));
    h.cards = drawCards(R, h.upg);
  }
  function reroll(W, h) {
    if (!h.cards || h.rerolls <= 0) return false;
    h.rerolls--; h.rerolled++;
    offerCards(W, h);
    emit(W, 'reroll', { h: h.id });
    return true;
  }
  function applyCard(h, id) {
    if (id === 'potion') { h.hp = Math.min(h.st.maxHp, h.hp + Math.round(h.st.maxHp * 0.4)); return; }
    if (!CARD[id]) return;
    h.upg[id] = Math.min(CARD[id].max, (h.upg[id] || 0) + 1);
    refresh(h);
    if (id === 'tough') h.hp = h.st.maxHp;
  }
  function pickCard(W, h, slot) {
    if (!h.cards) return null;
    const id = h.cards[slot];
    if (!id) return null;
    applyCard(h, id);
    h.picks.push(id);
    h.cards = null;
    emit(W, 'pick', { h: h.id, id, slot });
    if (W.dir.picked) W.dir.picked(W, h, id);
    return id;
  }
  // 지난 생에서 가장 많이 키운 카드 (스킬 기억) — 같으면 나중에 고른 것
  function bestCard(h) {
    let best = null;
    D.cards.forEach((c) => {
      if (c.id === 'potion') return;
      const lv = h.upg[c.id] || 0;
      if (!lv) return;
      const last = h.picks.lastIndexOf(c.id);
      if (!best || lv > best.lv || (lv === best.lv && last > best.last)) best = { id: c.id, lv, last };
    });
    return best ? { id: best.id, lv: best.lv } : null;
  }

  /* ================================================================
     혼자 모드 진행자 — 서버 rpg.py 의 RpgSession 과 같은 흐름 (색 패링 판정은 아직 혼자 모드만)
     ================================================================ */
  function enemyScale(W, kind, room) {
    const d = D.enemies[kind];
    const r = d.boss ? 0 : room;
    const n = Math.max(1, W.heroes.length);
    const S = D.scale;
    return {
      hp: (1 + S.hp * r) * (1 + S.party * (n - 1)) * (1 + S.star * (W.stars || 0)),
      dmg: 1 + S.dmg * r,
      xp: 1 + S.xp * room
    };
  }
  function makeEnemy(W, kind) {
    const d = D.enemies[kind];
    const sc = enemyScale(W, kind, W.room);
    const max = Math.round(d.hp * sc.hp);
    return {
      eid: ++W.eidN, kind, room: W.room, hp: max, max, dmgMult: sc.dmg, xp: Math.round(d.xp * sc.xp),
      spawn: W.t, nextAt: W.t + d.first, stun: 0, vuln: 0, dead: 0, rage: false, frz: 0, boss: !!d.boss
    };
  }
  const soloDir = {
    init(W) {
      W.plan = D.rooms.map((opts) => opts[Math.floor(W.R() * opts.length)].slice());
      W.phase = 'walk';
      W.spawnAt = W.t + D.flow.firstWalk;
    },
    tick(W) {
      const t = W.t;
      if (W.phase === 'walk' && t >= W.spawnAt) {
        W.enemy = makeEnemy(W, W.plan[W.room][W.enc]);
        W.phase = 'fight';
        emit(W, 'spawn', { e: W.enemy.eid, kind: W.enemy.kind });
      }
      if (W.phase === 'fight') {
        const E = W.enemy;
        if (E && !E.dead && !W.atks.some((a) => !a.over) && t >= E.nextAt && t >= E.stun) startAttack(W, E);
        W.atks = W.atks.filter((a) => !(a.over && t > a.hits[a.hits.length - 1] + 700));
      }
      // 카드(와 스탯 점수)를 다 고르면 → 부두 방(1번 방)을 지난 뒤엔 상점 → 출항(다음 방)
      if (W.phase === 'cards' && W.heroes.every((h) => !h.cards && !(local(h) && h.pts > 0))) {
        if (W.room === EC.shopAfter && !W.shopDone) {
          W.shopDone = true; W.phase = 'shop';
          W.heroes.forEach((h) => { h.shopped = !local(h); });
          emit(W, 'shop', { room: W.room });
        } else nextRoom(W);
      }
      if (W.phase === 'shop' && W.heroes.every((h) => h.shopped)) nextRoom(W);
    },
    hit(W, h, dmg, kind) {
      const E = W.enemy;
      if (!E || E.dead) return 0;
      const crit = W.t < E.vuln;
      const got = crit ? dmg * 2 : dmg;
      E.hp -= got;
      emit(W, 'hit', { h: h.id, dmg: got, kind, crit, e: E.eid });
      rageCheck(W, E);
      if (E.hp <= 0) killEnemy(W, E, h);
      return got;
    },
    // 마지막 타를 패링 → 기절 · 큰 공격(vuln)이면 "지금이야!" · 뚝딱 내려찍기는 전부 패링하면 끊겨요
    parried(W, h, atk, i, final) {
      const E = W.enemy;
      if (!E || E.dead || !final) return;
      if (atk.seq && breakCheck(W, E, atk, h)) return;
      stunEnemy(W, E, D.enemies[E.kind].stun);
      if (atk.vuln) chance(W, E, W.t + atk.vuln);
    },
    impacted(W, a, i) {
      if (i !== a.hits.length - 1) return;
      a.over = true;
      const E = W.enemy;
      if (!E || E.dead) return;
      const d = D.enemies[E.kind];
      const k = E.rage ? d.rageGap || 1 : 1;
      const gap = (d.gap[0] + (d.gap[1] - d.gap[0]) * W.R()) * k;
      E.nextAt = Math.max(E.nextAt, a.hits[i] + (a.rec || 300) + gap);
    },
    hurt() { /* 혼자 모드는 따로 할 일 없음 (같이 모드는 서버에 알려요) */ },
    down(W) {
      if (W.heroes.every((x) => x.down) && W.phase !== 'wipe' && W.phase !== 'clear') {
        W.phase = 'wipe'; W.result = 'wipe'; W.endAt = W.t;
        W.atks.forEach((a) => { a.over = true; });
        emit(W, 'wipe', { room: W.room });
      }
    },
    picked() { /* tick 에서 모두 골랐는지 봐요 */ }
  };

  /* 공격 만들기
     - 타 수 = 적 공격의 타 수(n), 1 ~ 최대 연타 수
     - 한 타 피해 = 원래 피해 × n ÷ 타 수 (최대 연타 수를 바꿔도 공격 하나의 피해 합은 같아요)
     - 타 사이 간격 = 최소 간격 × (1 ~ 1.2) 조금씩 흔들림 · 대왕이 화나면 빨라지지만 최소 간격의 0.85배 아래로는 안 내려가요
     - 첫 타 = 지금 + 예고 시간 · 고리는 닿기 '예고 시간' 전에 나타나고, 색은 닿기 '색 보임' 전에 보여요
     - 지난 회차에 나를 쓰러뜨린 공격(예지)은 색이 0.4초 먼저 보여요 (고리가 나타날 때보다 먼저는 아님)
     - 뚝딱 내려찍기(seq)는 정해진 색 순서(빨-초-파)로 최소 간격마다 빠르게 */
  function genHits(W, E, p, fore) {
    const R = W.R; const d = D.enemies[E.kind];
    const n = p.hits.length;
    const cnt = p.seq ? p.seq.length : clamp(n, 1, PR.maxHits);
    const per = p.dmg * E.dmgMult * n / cnt;
    const rk = E.rage ? d.rageWind || 1 : 1;
    const revealLead = Math.min(PR.lead, PR.reveal + (fore ? D.meta.foreMs : 0));
    const out = [];
    let ti = W.t + PR.lead;
    for (let k = 0; k < cnt; k++) {
      if (k > 0) ti += Math.max(PR.gapMin * 0.85, (p.seq ? PR.gapMin : PR.gapMin * (1 + 0.2 * R())) * rk);
      const T = Math.round(ti);
      out.push({ ti: T, c: p.seq ? p.seq[k] : COLORS[Math.floor(R() * 3)], show: T - PR.lead, reveal: T - revealLead, d: Math.round(per) });
    }
    return out;
  }
  function startAttack(W, E) {
    const d = D.enemies[E.kind];
    const p = pickW(W.R, d.pats);
    const t0 = W.t;
    const alive = W.heroes.filter((h) => !h.down);
    const tg = p.all ? alive.map((h) => h.id) : [alive[Math.floor(W.R() * alive.length)].id];
    const fore = alive.some((h) => tg.indexOf(h.id) >= 0 && (h.meta.fore || []).indexOf(p.id) >= 0);
    const hx = genHits(W, E, p, fore);
    const a = {
      id: ++W.aidN, eid: E.eid, pat: p.id, name: p.name, icon: p.icon, t0,
      hits: hx.map((x) => x.ti), hx, dmg: hx[0].d, n: hx.length,
      tg, all: !!p.all, seq: !!p.seq, brkStun: p.brkStun || 0, fore,
      vuln: p.vuln || 0, rec: p.rec || 300, over: false, broken: false
    };
    W.atks.push(a);
    emit(W, 'tele', { a: a.id, pat: p.id, icon: p.icon, all: a.all, tg, n: a.n, seq: a.seq, fore });
    if (fore) emit(W, 'fore', { a: a.id, pat: p.id });
    return a;
  }
  // 뚝딱 내려찍기: 모든 타를 패링했으면 끊기 → 크게 기절 + 약점
  function breakCheck(W, E, a, h) {
    if (!a.seq || a.broken) return false;
    for (let i = 0; i < a.hits.length; i++) { const j = h.jd[hitKey(a, i)]; if (!j || j.r !== 'parry') return false; }
    a.broken = true; a.over = true;
    E.stun = Math.max(E.stun, W.t + a.brkStun);
    E.nextAt = Math.max(E.nextAt, E.stun + 400);
    emit(W, 'break', { a: a.id, e: E.eid, until: E.stun });
    chance(W, E, W.t + a.brkStun);
    return true;
  }
  // "지금이야!" — 약점 시간: 자동 공격 2배 빠르게 · 피해 2배
  function chance(W, E, until) {
    E.vuln = Math.max(E.vuln, until);
    emit(W, 'chance', { e: E.eid, until: E.vuln });
  }
  function rageCheck(W, E) {
    const d = D.enemies[E.kind];
    if (d.rage && !E.rage && E.hp > 0 && E.hp <= E.max * d.rage) { E.rage = true; emit(W, 'rage', { e: E.eid }); }
  }
  function stunEnemy(W, E, ms) {
    E.stun = Math.max(E.stun, W.t + ms);
    E.nextAt = Math.max(E.nextAt, E.stun + 300);
    emit(W, 'stun', { e: E.eid, until: E.stun });
  }
  function killEnemy(W, E, h) {
    E.hp = 0; E.dead = W.t;
    // 쓰러진 적이 휘두르던 공격은 없던 일로 (안 그러면 다음 적을 기다리는 동안 남은 타에 맞아요)
    W.atks.forEach((a) => { a.over = true; a.broken = true; });
    W.killed++;
    if (h) h.stat.kills++;
    emit(W, 'kill', { e: E.eid, kind: E.kind, boss: E.boss, h: h ? h.id : '' });
    const dk = D.enemies[E.kind] || {};
    W.heroes.forEach((x) => {
      if (!local(x)) return;
      x.pend = []; gainXp(W, x, E.xp);
      addShell(W, x, dk.shell || 0, 'kill');
      // 보스(중간 보스 캐럭선 포함)를 잡으면 스탯 점수
      if (dk.pts) { x.pts += dk.pts; emit(W, 'pts', { h: x.id, n: dk.pts, kind: E.kind }); }
    });
    W.enc++;
    if (W.enc < W.plan[W.room].length) {
      W.phase = 'walk';
      W.spawnAt = W.t + D.flow.dieAnim + D.flow.nextWalk;
    } else if (W.room >= LAST_ROOM) {
      W.phase = 'clear'; W.result = 'clear'; W.endAt = W.t;
      emit(W, 'clear', {});
    } else {
      W.phase = 'cards'; W.cardsAt = W.t;
      emit(W, 'roomClear', { room: W.room });
      W.heroes.forEach((x) => { if (local(x)) offerCards(W, x); });
    }
  }
  function nextRoom(W) {
    W.room++; W.enc = 0;
    W.phase = 'walk';
    W.spawnAt = W.t + D.flow.roomWalk;
    W.enemy = null;
    W.atks = [];
    W.heroes.forEach((h) => {
      if (!local(h)) return;
      h.jd = {}; h.pend = [];
      if (h.down) { h.down = false; h.hp = Math.round(h.st.maxHp * HD.reviveHp); setAct(W, h, 'walk'); emit(W, 'revive', { h: h.id }); }
      else heal(W, h, h.st.maxHp * HD.roomHeal);
    });
    emit(W, 'room', { room: W.room });
  }

  /* ---------------- 한 걸음 ---------------- */
  function step(W, dt) {
    const d = dt || DT;
    W.t += d;
    W.dir.tick(W);
    processImpacts(W);
    for (const h of W.heroes) {
      if (h.kind === 'bot' && h.brain) botThink(W, h, h.brain);
      heroStep(W, h, d);
    }
  }
  // 지금 시각(now)까지 고정 간격으로
  function advance(W, now) {
    let n = 0;
    while (W.t + DT <= now && n < 400) { step(W, DT); n++; }
    if (n >= 400) W.t = now;     // 탭을 오래 떠났다 오면 건너뛰어요
  }

  /* ================================================================
     자동 플레이어 (AI 동료 · 밸런스 시험)
     sk: { react 색을 보고 알아채는 시간, sd 타이밍 흔들림(ms), bias 평균 치우침(−면 일찍), rush 빠른 연타일수록 흔들림 늘어남,
           wrongP 색을 알면서 다른 색을 누를 확률, missP 깜빡하고 안 누를 확률, guessP 색을 못 봤을 때 아무 색이나 찍을 확률,
           mash 이면 화면을 안 보고 초당 rate 번 아무 색이나, spec: any(차면 바로)·smart(틈·위기에), smartCard, pickMs }
     ================================================================ */
  const SKILLS = {
    mash: { name: '연타만 (완전 처음)', mash: true, rate: 6, spec: 'any', smartCard: false, pickMs: 2500 },
    kid: { name: '아이 (초등)', react: 650, sd: 100, bias: -25, rush: 0.6, wrongP: 0.07, missP: 0.05, guessP: 0.5, spec: 'any', smartCard: false, pickMs: 2200 },
    teen: { name: '중학생', react: 480, sd: 75, bias: -15, rush: 0.4, wrongP: 0.05, missP: 0.04, guessP: 0.6, spec: 'smart', smartCard: true, pickMs: 1500 },
    adult: { name: '어른 (게임 잘함)', react: 380, sd: 50, bias: -10, rush: 0.3, wrongP: 0.025, missP: 0.02, guessP: 0.7, spec: 'smart', smartCard: true, pickMs: 1200 },
    ally: { name: 'AI 동료', react: 480, sd: 70, bias: -15, rush: 0.4, wrongP: 0.05, missP: 0.05, guessP: 0.6, spec: 'smart', smartCard: true, pickMs: 1200 }
  };
  const CARD_PRI = ['parry', 'tough', 'slash', 'wall', 'heavy', 'calm', 'nova', 'charge', 'vamp', 'star', 'potion'];
  function makeBrain(sk, seed) {
    const s = typeof sk === 'string' ? SKILLS[sk] : sk;
    return { sk: s, R: rng(seed || 7), plans: {}, q: [], nextTap: 0, specAt: 0, pickAt: 0 };
  }
  function botThink(W, h, b) {
    const t = W.t; const sk = b.sk; const R = b.R;
    // 스탯 점수 (보스를 잡은 뒤) → 카드보다 먼저
    if (W.phase === 'cards' && h.pts > 0) {
      if (!b.ptAt) b.ptAt = t + 300;
      if (t >= b.ptAt) { b.ptAt = 0; botStats(h); }
      return;
    }
    // 부두 상점
    if (W.phase === 'shop' && !h.shopped) {
      if (!b.shopAt) b.shopAt = t + sk.pickMs;
      if (t >= b.shopAt) { b.shopAt = 0; botShop(h); leaveShop(W, h); }
      return;
    }
    if (W.phase === 'cards' && h.cards) {
      if (!b.pickAt) b.pickAt = t + sk.pickMs * (0.6 + 0.8 * R());
      if (t >= b.pickAt) {
        b.pickAt = 0;
        let slot = Math.floor(R() * 3);
        if (sk.smartCard) {
          let bestI = 0; let best = 99;
          h.cards.forEach((id, i) => { const k = CARD_PRI.indexOf(id); const v = id === 'potion' && h.hp < h.st.maxHp * 0.4 ? -1 : k; if (v < best) { best = v; bestI = i; } });
          slot = bestI;
        }
        pickCard(W, h, slot);
      }
      return;
    }
    if (h.down || W.phase !== 'fight') { b.q = []; return; }
    // 예약해 둔 누름 (필살기 세 버튼 등)
    if (b.q.length) {
      const due = b.q.filter((x) => t >= x.at);
      if (due.length) { b.q = b.q.filter((x) => t < x.at); due.forEach((x) => press(W, h, x.c, t)); }
    }
    const E = W.enemy;
    // 1) 연타만: 화면을 안 보고 아무 색이나
    if (sk.mash) {
      if (t >= b.nextTap) { press(W, h, COLORS[Math.floor(R() * 3)], t); b.nextTap = t + (1000 / sk.rate) * (0.6 + 0.8 * R()); }
    } else {
      // 2) 고리가 보이면 언제 누를지 정하고, 그때 색을 알아챘으면 그 색을 눌러요
      let prevTi = 0;
      for (const a of W.atks) {
        if (a.broken || !aimsAt(a, h)) continue;
        const hx = hitsOf(a);
        for (let i = 0; i < hx.length; i++) {
          const x = hx[i];
          const key = hitKey(a, i);
          let p = b.plans[key];
          if (!p) {
            if (t < x.show) { prevTi = x.ti; continue; }
            const gap = i > 0 ? x.ti - hx[i - 1].ti : prevTi ? x.ti - prevTi : 9999;
            const sd = sk.sd * (1 + sk.rush * Math.max(0, 450 / gap - 1));
            p = { at: Math.max(t, x.ti + sk.bias + gauss(R) * sd), skip: R() < sk.missP };
            b.plans[key] = p;
          }
          prevTi = x.ti;
          if (p.done || p.skip || t < p.at) continue;
          p.done = true;
          let c = '';
          if (t - sk.react >= x.reveal) c = R() < sk.wrongP ? COLORS[(COLORS.indexOf(x.c) + 1 + Math.floor(R() * 2)) % 3] : x.c;
          else if (R() < sk.guessP) c = COLORS[Math.floor(R() * 3)];
          if (c) press(W, h, c, t);
        }
      }
    }
    // 3) 필살기: 세 버튼을 거의 같이
    if (h.gauge >= HD.gaugeMax && t >= b.specAt && !b.q.length && h.act !== 'spec') {
      let go = sk.spec === 'any';
      if (sk.spec === 'smart' && E) {
        // 틈(기절·지금이야!) 이거나 위기에 공격이 올 때 · 곧 닿는 타가 없을 때
        const near = W.atks.some((a) => !a.broken && aimsAt(a, h) && hitsOf(a).some((x) => x.ti > t - 40 && x.ti < t + 500 && !h.jd[hitKey(a, a.hx.indexOf(x))]));
        const open = t < E.vuln || t < E.stun;
        const danger = h.hp < h.st.maxHp * 0.35 && busy(W, h);
        go = (open && !near) || danger || E.boss && !near && !busy(W, h);
      }
      if (go) { b.q.push({ at: t, c: 'r' }, { at: t + 30, c: 'g' }, { at: t + 60, c: 'b' }); b.specAt = t + 600; }
    }
  }

  // 자동 플레이어의 장보기: 방어구(살아남기) 먼저, 남으면 무기 · 살 수 있는 가장 좋은 것
  function botShop(h) {
    const best = (list) => list.slice().reverse().find((g) => canBuy(h, g.id));
    for (let k = 0; k < 4; k++) {
      const a = best(EC.armors); if (a) { buyGear(h, a.id); continue; }
      const w = best(EC.weapons); if (w) { buyGear(h, w.id); continue; }
      break;
    }
  }
  // 자동 플레이어의 스탯 고르기: 가장 낮은 것부터 (체력 → 민첩 → 힘 순, 민첩은 상한까지만)
  function botStats(h) {
    while (h.pts > 0) {
      const agiFull = statEffect('agi', h.stats.agi) >= SD.agiCap;
      const order = ['vit', 'agi', 'str'].filter((k) => !(k === 'agi' && agiFull));
      const lo = order.reduce((m, k) => (h.stats[k] < h.stats[m] ? k : m), order[0]);
      spendPt(h, lo);
    }
  }

  /* ================================================================
     전생 정산 (회귀할 때 넘어가는 것) — 저장은 meta.js, 계산은 여기
     meta: { v, loop, shards, nodes{combo,hp,reroll}, mem, stars, deaths, clears, bestRoom, firstClear, earned, playMs,
             fore[] 나를 쓰러뜨린 공격 id(예지 · 최근 것 몇 개만) }
     ================================================================ */
  function newMeta() {
    return { v: 2, loop: 1, shards: 0, nodes: { combo: 0, hp: 0, reroll: 0 }, mem: null, stars: 0, deaths: 0, clears: 0, bestRoom: 0, firstClear: 0, earned: 0, playMs: 0, fore: [], stats: baseStats() };
  }
  // 옛 저장(v1)도 그대로 읽어요 — 없는 칸은 새로 채우고, 모르는 공격 id 는 버려요
  function fixMeta(m) {
    const b = newMeta();
    if (!m || typeof m !== 'object') return b;
    const o = Object.assign(b, m);
    o.v = 2;
    o.nodes = Object.assign(newMeta().nodes, m.nodes || {});
    ['loop', 'shards', 'stars', 'deaths', 'clears', 'bestRoom', 'firstClear', 'earned', 'playMs'].forEach((k) => { o[k] = Math.max(0, Number(o[k]) || 0); });
    o.loop = Math.max(1, Math.floor(o.loop));
    if (o.mem && !(CARD[o.mem.id] && o.mem.lv > 0)) o.mem = null;
    o.fore = Array.isArray(m.fore) ? m.fore.filter((id) => PAT[id]).slice(-D.meta.foreKeep) : [];
    o.stats = fixStats(m.stats);
    return o;
  }
  function cardLabel(id, lv) {
    const c = CARD[id];
    if (!c) return '';
    return `${COLOR_NAME[c.c] ? COLOR_NAME[c.c] + ' ' : ''}${c.name}${lv ? ' Lv' + lv : ''}`;
  }
  // run: { reached(1~6), clear, hero(이번 생 내 용사), ms, killer(나를 쓰러뜨린 공격 id — 없으면 hero.killer) }
  function settle(meta, run) {
    const m = fixMeta(JSON.parse(JSON.stringify(meta)));
    const gained = shardsFor(run.reached, run.clear);
    const fromX = xpMult(m.loop);
    m.shards += gained; m.earned += gained;
    m.loop += 1;
    m.bestRoom = Math.max(m.bestRoom, run.reached);
    m.playMs += run.ms || 0;
    if (run.clear) { m.clears++; m.stars++; if (!m.firstClear) m.firstClear = meta.loop || 1; } else m.deaths++;
    // 예지: 나를 쓰러뜨린 공격은 다음 회차부터 색이 먼저 보여요
    const killer = !run.clear ? (run.killer || (run.hero && run.hero.killer) || '') : '';
    let fore = null;
    if (killer && PAT[killer]) {
      const isNew = m.fore.indexOf(killer) < 0;
      m.fore = m.fore.filter((id) => id !== killer).concat([killer]).slice(-D.meta.foreKeep);
      fore = { id: killer, name: PAT[killer].name, isNew };
    }
    const best = run.hero ? bestCard(run.hero) : null;
    let mem = null;
    if (best) { mem = { id: best.id, lv: Math.max(1, best.lv - 1) }; m.mem = mem; }
    const lines = [];
    lines.push({ k: 'reach', label: run.clear ? `${D.enemies.boss.name} 격파!` : '도달한 곳', text: run.clear ? '클리어!' : (run.reached >= D.rooms.length ? '보스 앞' : `${run.reached}번째 방`) });
    lines.push({ k: 'shard', label: '기억 조각', val: gained, pre: '+' });
    lines.push({ k: 'xp', label: '경험치 배율', from: fromX, to: xpMult(m.loop) });
    if (fore) lines.push({ k: 'fore', label: '💭예지', text: `${fore.name} 색이 0.4초 먼저 보여요`, pat: fore.id, isNew: fore.isNew });
    if (mem) lines.push({ k: 'mem', label: '스킬 기억', text: cardLabel(mem.id, mem.lv), c: CARD[mem.id].c });
    if (run.clear) lines.push({ k: 'star', label: '★고난 해금', text: '★' + m.stars, val: m.stars });
    // 스탯은 오른 만큼의 50% 이월 · 조개 돈과 장비는 0 (회귀 규칙)
    let stats = null;
    if (run.hero && run.hero.stats) {
      const start = fixStats(run.hero.stats0 || m.stats);
      const from = fixStats(run.hero.stats);
      stats = { start, from, to: carryStats(start, from) };
      m.stats = stats.to;
      STAT_KEYS.forEach((k) => {
        const same = stats.from[k] === stats.to[k];
        lines.push({ k: 'stat', key: k, label: STAT_NAME[k], text: same ? `${stats.to[k]} (그대로)` : `${stats.from[k]} → ${stats.to[k]}`, from: stats.from[k], to: stats.to[k] });
      });
      const gearN = ['w', 'a'].map((sl) => (GEAR[run.hero.gear && run.hero.gear[sl]] || {}).name).filter(Boolean);
      lines.push({ k: 'reset', label: '조개껍데기', text: `${run.hero.shell || 0} → 0` });
      lines.push({ k: 'reset', label: '장비', text: gearN.length ? `${gearN.join(' · ')} → 없음` : '없음' });
    }
    lines.push({ k: 'total', label: '모은 기억 조각', val: m.shards });
    return { meta: m, gained, lines, mem, fore, stats };
  }
  function nodeCost(meta, id) {
    const n = D.meta.nodes.find((x) => x.id === id);
    if (!n) return null;
    const lv = (meta.nodes && meta.nodes[id]) || 0;
    return lv >= n.max ? null : n.cost[lv];
  }
  function buyNode(meta, id) {
    const c = nodeCost(meta, id);
    if (c == null || meta.shards < c) return false;
    meta.shards -= c;
    meta.nodes[id] = (meta.nodes[id] || 0) + 1;
    return true;
  }
  // 영웅 만들 때 쓰는 값 (회차 · 영구 노드 · ★ · 예지)
  function heroMeta(meta) {
    const m = fixMeta(meta);
    return { loop: m.loop, hp: m.nodes.hp, combo: m.nodes.combo, reroll: m.nodes.reroll, stars: m.stars, fore: m.fore.slice(), stats: fixStats(m.stats) };
  }

  const api = {
    D, DT, COLORS, PAT, rng, hash, clamp, CARD, COLOR_NAME, LAST_ROOM, SKILLS,
    xpMult, shardsFor, needXp, calcStats, refresh, makeHero, makeWorld, makeEnemy, enemyScale,
    press, release, step, advance, heroStep, processImpacts, resolveImpact, dealHit, gainXp, heal,
    winOf, hitsOf, busy, judgePress, genHits, chance,
    offerCards, reroll, pickCard, applyCard, drawCards, bestCard, cardLabel,
    soloDir, startAttack, killEnemy, nextRoom, stunEnemy, breakCheck, rageCheck, emit, heroById,
    makeBrain, botThink, newMeta, fixMeta, settle, nodeCost, buyNode, heroMeta,
    EC, SD, GEAR, STAT_KEYS, STAT_NAME, baseStats, fixStats, statEffect, statText, carryStats, parryShell, addShell,
    canBuy, buyGear, leaveShop, spendPt, botShop, botStats
  };
  root.RpgSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
