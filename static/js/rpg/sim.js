/* 아리채 오락실 · 회귀 RPG 「되감기 용사단」 규칙 계산 (화면과 완전히 떨어진 순수 계산)
   - 세계(World) = 시각 t(ms) · 용사들 · 지금 적 · 예고된 적 공격들 · 진행 단계(걷기·싸움·카드·전멸·클리어)
   - step(W, dt) 를 고정 간격(DT=8ms)으로 불러요. 입력은 press/release 로 그 시각에 바로 넣어요
   - 화면은 W.ev(일어난 일 목록)를 읽어 효과를 그리고, 상태(W)를 읽어 모습을 그려요 → 화면을 통째로 바꿔도 규칙은 그대로
   - '진행자(dir)' 가 적 체력·공격 시간표·방 진행을 맡아요
       · 혼자 모드: soloDir (이 파일) — 폰 안에서 다 계산
       · 같이 모드: 서버 rpg.py 가 같은 규칙으로 계산하고, net.js 의 netDir 가 서버 값을 따라가요
   - 자동 플레이어(botThink)는 AI 동료와 밸런스 시험에 같이 써요
   - 브라우저(window.RpgSim)와 node(require) 둘 다에서 돌아가요 */
(function (root) {
  'use strict';

  const D = root.RpgData || (typeof require !== 'undefined' ? require('./data.js') : null);
  const HD = D.hero;
  const DT = 8;

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

  /* ---------------- 카드 ---------------- */
  const CARD = {};
  D.cards.forEach((c) => { CARD[c.id] = c; });
  const COLOR_NAME = { r: '빨강', g: '초록', b: '파랑', x: '' };
  function emptyUpg() { const u = {}; D.cards.forEach((c) => { u[c.id] = 0; }); return u; }
  // 빨강 칸 = 공격 카드, 초록 칸 = 막기 카드, 파랑 칸 = 필살·몸 카드 (버튼 색 = 카드 색)
  function drawCards(R, upg) {
    return ['r', 'g', 'b'].map((c) => {
      const pool = D.cards.filter((x) => x.c === c && (upg[x.id] || 0) < x.max);
      return pool.length ? pool[Math.floor(R() * pool.length)].id : 'potion';
    });
  }

  /* ---------------- 용사 능력치 ---------------- */
  function needXp(lv) { return HD.xpBase + HD.xpGrow * (lv - 1); }
  function calcStats(h) {
    const u = h.upg; const m = h.meta; const lv = h.lv;
    return {
      atk: HD.atk * (1 + HD.lvAtk * (lv - 1)),
      maxHp: Math.round(HD.hp * (1 + 0.15 * (m.hp || 0)) + HD.lvHp * (lv - 1) + 20 * u.tough),
      comboMult: 1 + 0.2 * u.slash,
      heavyMult: 1 + 0.4 * u.heavy,
      chargeFull: HD.chargeFull * (1 - 0.15 * u.heavy),
      vamp: 3 * u.vamp,
      guardTake: HD.guardTake * Math.pow(0.7, u.wall),
      parryPre: HD.parryPre + 40 * u.parry,
      counterMult: HD.counterMult * (1 + 0.3 * u.parry),
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

  /* 용사 하나 — o: { id, name, ath, kind: me|bot|remote, meta: {loop, hp, combo, reroll, stars}, mem: {id, lv} } */
  function makeHero(o) {
    const meta = Object.assign({ loop: 1, hp: 0, combo: 0, reroll: 0, stars: 0 }, o.meta || {});
    const h = {
      id: o.id, name: o.name || '용사', ath: o.ath || 'dino', kind: o.kind || 'me', meta,
      upg: emptyUpg(), lv: 1, xp: 0, hp: 0, gauge: 0, st: null,
      act: 'walk', actT: 0, step: 0, hitDone: false, full: false, half: false, specN: 0,
      q: -1e9, comboUntil: 0, nextStep: 0,
      red: { down: false, at: -1e9 }, grn: { down: false, at: -1e9, ok: false, last: -1e9 },
      frz: 0, inv: 0, counterAt: 0, pend: [], down: false, seq: 0,
      cards: null, rerolls: meta.reroll || 0, rerolled: 0, picks: [],
      stat: { hits: 0, parries: 0, guards: 0, hurts: 0, dealt: 0, taken: 0, specs: 0, kills: 0 }
    };
    // 전생의 검술(영구) · 스킬 기억(지난 생에서 가장 키운 카드)
    if (meta.combo) h.upg.slash = Math.max(h.upg.slash, meta.combo);
    if (o.mem && CARD[o.mem.id] && o.mem.id !== 'potion') h.upg[o.mem.id] = Math.max(h.upg[o.mem.id], Math.min(CARD[o.mem.id].max, o.mem.lv || 1));
    h.st = calcStats(h);
    h.hp = h.st.maxHp;
    return h;
  }

  /* ================================================================
     세계
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

  /* ---------------- 입력 (빨강 공격 · 초록 막기 · 파랑 필살) ---------------- */
  const canAct = (h) => !h.down && h.act !== 'hurt' && h.act !== 'heavy' && h.act !== 'spec' && h.act !== 'cheer';
  const fighting = (W) => W.phase === 'fight' && W.enemy && !W.enemy.dead;

  function press(W, h, c, t) {
    if (!h || h.down) return;
    const T = t == null ? W.t : t;
    if (c === 'r') {
      h.red.down = true; h.red.at = T;
      h.q = T;                      // 누른 것은 잠깐 기억해 뒀다가 할 수 있을 때 써요
      tryAttack(W, h);
    } else if (c === 'g') {
      const g = h.grn;
      g.down = true;
      g.ok = T - g.last >= HD.parryLock;   // 너무 빨리 연타하면 패링은 안 되고 막기만 돼요
      g.at = T; g.last = T;
      if (h.act !== 'heavy' && h.act !== 'spec' && h.act !== 'hurt' && h.act !== 'cheer') {
        if (h.act !== 'guard' && h.act !== 'parry') setAct(W, h, 'guard');
        // 방금(70ms 안) 맞은 공격도 패링으로 바꿔 줘요 (폰 터치 지연을 생각해서 넉넉하게)
        const late = h.pend.filter((p) => T <= p.ti + HD.parryPost);
        h.pend = h.pend.filter((p) => T > p.ti + HD.parryPost);
        late.forEach((p) => { if (g.ok) doParry(W, h, p.atk, p.i); else doGuard(W, h, p.atk, p.i); });
      }
    } else if (c === 'b') {
      if (h.gauge >= HD.gaugeMax && !h.down && h.act !== 'spec' && h.act !== 'cheer') {
        h.gauge = 0;
        h.inv = W.t + HD.spec.invuln;
        h.specN = 0;
        h.pend = [];
        setAct(W, h, 'spec');
        h.stat.specs++;
        emit(W, 'spec', { h: h.id });
      } else emit(W, 'specNo', { h: h.id, g: h.gauge });
    }
  }
  function release(W, h, c) {
    if (!h) return;
    if (c === 'r') {
      h.red.down = false;
      if (h.act === 'charge') {
        if (h.actT >= HD.chargeHalf && !h.down) { h.half = !h.full; setAct(W, h, 'heavy'); emit(W, 'swing', { h: h.id, step: 'heavy', full: h.full }); }
        else setAct(W, h, 'idle');
      }
    } else if (c === 'g') {
      h.grn.down = false;
      if (h.act === 'guard') setAct(W, h, 'idle');
    }
  }
  function setAct(W, h, a) {
    h.act = a; h.actT = 0; h.hitDone = false; h.seq++;
    if (a !== 'charge' && a !== 'heavy') { h.full = false; }
  }
  // 공격 시작 / 콤보 잇기
  function tryAttack(W, h) {
    if (!canAct(h) || h.act === 'guard' || h.act === 'parry' || h.act === 'charge' || h.grn.down) return false;
    if (W.t - h.q > HD.tapBuffer) return false;
    if (h.act === 'atk') {
      const cf = HD.combo[h.step];
      if (!h.hitDone || h.actT < cf.start + cf.rec * 0.45 || h.step >= 2) return false;
      startCombo(W, h, h.step + 1);
      return true;
    }
    startCombo(W, h, W.t <= h.comboUntil ? h.nextStep : 0);
    return true;
  }
  function startCombo(W, h, step) {
    h.q = -1e9;
    setAct(W, h, 'atk');
    h.step = step % 3;
    emit(W, 'swing', { h: h.id, step: h.step });
  }

  /* ---------------- 용사 한 걸음 ---------------- */
  function heroStep(W, h, dt) {
    if (!local(h)) return;
    const t = W.t;
    // 맞은 공격: 패링 유예(70ms)가 지나면 진짜로 맞아요
    if (h.pend.length) {
      const due = h.pend.filter((p) => t > p.ti + HD.parryPost);
      if (due.length) {
        h.pend = h.pend.filter((p) => t <= p.ti + HD.parryPost);
        due.forEach((p) => { if (h.grn.down && (h.act === 'guard' || h.act === 'parry')) doGuard(W, h, p.atk, p.i); else doHurt(W, h, p.atk, p.i); });
      }
    }
    if (h.counterAt && t >= h.counterAt) { h.counterAt = 0; if (!h.down) dealHit(W, h, h.st.counterMult, 'counter'); }
    if (h.down) return;
    if (t < h.frz) return;     // 타격 멈춤(hit-stop): 동작 시간이 잠깐 멈춰요
    h.actT += dt;
    const fight = fighting(W);
    switch (h.act) {
      case 'walk': case 'idle':
        if (fight && h.act === 'walk') h.act = 'idle';
        if (fight && h.q > -1e9) tryAttack(W, h);
        if (h.red.down && t - h.red.at >= HD.chargeAt && fight) { setAct(W, h, 'charge'); emit(W, 'charge', { h: h.id, full: false }); }
        break;
      case 'atk': {
        const cf = HD.combo[h.step];
        if (!h.hitDone && h.actT >= cf.start) {
          h.hitDone = true;
          dealHit(W, h, cf.mult * h.st.comboMult, 'c' + (h.step + 1));
          if (h.step === 2 && h.st.vamp) heal(W, h, h.st.vamp);
        }
        if (h.hitDone && h.q > -1e9 && tryAttack(W, h)) break;
        if (h.hitDone && h.red.down && t - h.red.at >= HD.chargeAt && fight) { setAct(W, h, 'charge'); emit(W, 'charge', { h: h.id, full: false }); break; }
        if (h.actT >= cf.start + cf.rec) {
          h.nextStep = h.step >= 2 ? 0 : h.step + 1;
          h.comboUntil = h.step >= 2 ? 0 : t + HD.comboKeep;
          setAct(W, h, fight ? 'idle' : 'walk');
        }
        break;
      }
      case 'charge':
        if (!h.full && h.actT >= h.st.chargeFull) { h.full = true; emit(W, 'charge', { h: h.id, full: true }); }
        if (!fight) setAct(W, h, 'walk');
        break;
      case 'heavy': {
        const cf = HD.heavy;
        if (!h.hitDone && h.actT >= cf.start) {
          h.hitDone = true;
          dealHit(W, h, (h.full ? cf.mult : cf.half) * h.st.heavyMult, h.full ? 'heavy' : 'heavyHalf');
        }
        if (h.actT >= cf.start + cf.rec) { h.full = false; setAct(W, h, fight ? 'idle' : 'walk'); }
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
        if (h.actT >= HD.hurtMs) { setAct(W, h, h.grn.down ? 'guard' : fight ? 'idle' : 'walk'); }
        break;
      case 'parry':
        if (h.actT >= 240) setAct(W, h, h.grn.down ? 'guard' : 'idle');
        break;
      case 'guard':
        if (!h.grn.down) setAct(W, h, 'idle');
        break;
      default: break;
    }
    if (!fight && (h.act === 'idle' || h.act === 'guard') && W.phase !== 'fight') { if (h.act === 'idle') h.act = 'walk'; }
  }

  // 때리기 → 진행자에게 피해를 알려요
  function dealHit(W, h, mult, kind) {
    const E = W.enemy;
    if (!E || E.dead || W.phase !== 'fight') return 0;
    const v = 0.92 + 0.16 * W.R();
    const dmg = Math.max(1, Math.round(h.st.atk * mult * v));
    const got = W.dir.hit(W, h, dmg, kind);
    if (!got) return 0;
    const stop = kind === 'counter' ? HD.parryStop : kind === 'heavy' ? HD.heavy.stop : kind === 'heavyHalf' ? 75 : kind === 'c3' ? HD.combo[2].stop
      : kind === 'c2' ? HD.combo[1].stop : kind === 'specEnd' ? 110 : kind === 'spec' ? 45 : HD.combo[0].stop;
    h.frz = W.t + stop;
    E.frz = W.t + stop;
    h.stat.hits++; h.stat.dealt += got;
    if (kind !== 'spec' && kind !== 'specEnd') addGauge(W, h, HD.gaugeHit * (kind === 'heavy' ? 2 : 1));
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
  const guarding = (h) => h.grn.down && (h.act === 'guard' || h.act === 'parry');
  function resolveImpact(W, h, atk, i) {
    if (h.down || !local(h)) return;
    const ti = atk.hits[i];
    if (W.t < h.inv) { emit(W, 'dodge', { h: h.id, a: atk.id }); return; }
    if (guarding(h) && h.grn.ok && h.grn.at <= ti + 1 && ti - h.grn.at <= h.st.parryPre) { doParry(W, h, atk, i); return; }
    if (guarding(h)) { doGuard(W, h, atk, i); return; }
    h.pend.push({ atk, i, ti });
  }
  function doParry(W, h, atk, i) {
    const final = i === atk.hits.length - 1;
    h.stat.parries++;
    h.grn.ok = false;         // 한 번 누름 = 패링 한 번
    setAct(W, h, 'parry');
    addGauge(W, h, HD.gaugeParry);
    heal(W, h, h.st.parryHeal);
    h.counterAt = W.t + HD.counterDelay;
    h.frz = W.t + HD.parryStop;
    if (W.enemy) W.enemy.frz = W.t + HD.slowmo;
    emit(W, 'parry', { h: h.id, a: atk.id, i, final });
    W.dir.parried(W, h, atk, i, final);
  }
  function doGuard(W, h, atk, i) {
    const dmg = Math.max(1, Math.round(atk.dmg * h.st.guardTake));
    h.hp -= dmg; h.stat.guards++; h.stat.taken += dmg;
    addGauge(W, h, HD.gaugeGuard);
    emit(W, 'guard', { h: h.id, a: atk.id, i, dmg });
    W.dir.hurt(W, h, atk, i, 'guard', dmg);
    if (h.hp <= 0) knockDown(W, h);
  }
  function doHurt(W, h, atk, i) {
    if (h.down) return;
    const dmg = atk.dmg;
    h.hp -= dmg; h.stat.hurts++; h.stat.taken += dmg;
    addGauge(W, h, HD.gaugeHurt);
    if (h.act !== 'spec') setAct(W, h, 'hurt');
    emit(W, 'hurt', { h: h.id, a: atk.id, i, dmg });
    W.dir.hurt(W, h, atk, i, 'hit', dmg);
    if (h.hp <= 0) knockDown(W, h);
  }
  function knockDown(W, h) {
    h.hp = 0; h.down = true; h.pend = []; h.counterAt = 0;
    setAct(W, h, 'down');
    emit(W, 'down', { h: h.id });
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
        const key = a.id + ':' + i;
        if (W.done[key] || a.hits[i] > W.t) continue;
        W.done[key] = 1;
        emit(W, 'impact', { a: a.id, i });
        W.heroes.forEach((h) => { if (a.all || a.tg.indexOf(h.id) >= 0) resolveImpact(W, h, a, i); });
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
     혼자 모드 진행자 — 서버 rpg.py 의 RpgSession 과 같은 규칙
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
      if (W.phase === 'cards' && W.heroes.every((h) => !h.cards)) nextRoom(W);
    },
    hit(W, h, dmg, kind) {
      const E = W.enemy;
      if (!E || E.dead) return 0;
      const crit = W.t < E.vuln;
      const got = crit ? dmg * 2 : dmg;
      E.hp -= got;
      emit(W, 'hit', { h: h.id, dmg: got, kind, crit, e: E.eid });
      breakCheck(W, E, got);
      rageCheck(W, E);
      if (E.hp <= 0) killEnemy(W, E, h);
      return got;
    },
    parried(W, h, atk, i, final) {
      const E = W.enemy;
      if (!E || !final) return;
      stunEnemy(W, E, D.enemies[E.kind].stun);
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
      if (a.vuln) { E.vuln = Math.max(E.vuln, a.hits[i] + a.vuln); emit(W, 'vuln', { e: E.eid, until: E.vuln }); }
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
  function startAttack(W, E) {
    const d = D.enemies[E.kind];
    const p = pickW(W.R, d.pats);
    const k = E.rage ? d.rageWind || 1 : 1;
    const t0 = W.t;
    const alive = W.heroes.filter((h) => !h.down);
    const tg = p.all ? alive.map((h) => h.id) : [alive[Math.floor(W.R() * alive.length)].id];
    const a = {
      id: ++W.aidN, eid: E.eid, pat: p.id, name: p.name, icon: p.icon, t0,
      hits: p.hits.map((o) => Math.round(t0 + p.wind * k + o * k)), dmg: Math.round(p.dmg * E.dmgMult),
      tg, all: !!p.all, brk: p.brk ? Math.round(p.brk * E.max) : 0, brkDmg: 0, brkStun: p.brkStun || 0,
      vuln: p.vuln || 0, rec: p.rec || 300, over: false, broken: false
    };
    W.atks.push(a);
    emit(W, 'tele', { a: a.id, pat: p.id, icon: p.icon, all: a.all, tg });
    return a;
  }
  // 빨강 예고(뚝딱 내려찍기): 예고 중에 많이 때리면 끊겨요
  function breakCheck(W, E, got) {
    W.atks.forEach((a) => {
      if (!a.brk || a.over || a.broken || W.t >= a.hits[0]) return;
      a.brkDmg += got;
      if (a.brkDmg >= a.brk) {
        a.broken = true; a.over = true;
        E.stun = W.t + a.brkStun; E.vuln = W.t + a.brkStun;
        E.nextAt = Math.max(E.nextAt, E.stun + 400);
        emit(W, 'break', { a: a.id, e: E.eid, until: E.stun });
      }
    });
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
    W.atks.forEach((a) => { a.over = true; });
    W.killed++;
    if (h) h.stat.kills++;
    emit(W, 'kill', { e: E.eid, kind: E.kind, boss: E.boss, h: h ? h.id : '' });
    W.heroes.forEach((x) => { if (local(x)) gainXp(W, x, E.xp); });
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
     sk: { react, parryP, err, guardP, rate, punish, charge, smartSpec, smartCard, pickMs }
     ================================================================ */
  const SKILLS = {
    mash: { name: '연타만 (완전 처음)', react: 450, parryP: 0, err: 200, guardP: 0.08, rate: 7, punish: 0.2, charge: 0, smartSpec: false, smartCard: false, pickMs: 2500 },
    kid: { name: '아이 (초등)', react: 380, parryP: 0.3, err: 120, guardP: 0.3, rate: 5, punish: 0.45, charge: 0.15, smartSpec: false, smartCard: false, pickMs: 2200 },
    teen: { name: '중학생', react: 280, parryP: 0.55, err: 85, guardP: 0.28, rate: 6, punish: 0.75, charge: 0.35, smartSpec: true, smartCard: true, pickMs: 1500 },
    adult: { name: '어른 (게임 잘함)', react: 220, parryP: 0.75, err: 60, guardP: 0.18, rate: 6.5, punish: 0.9, charge: 0.5, smartSpec: true, smartCard: true, pickMs: 1200 },
    ally: { name: 'AI 동료', react: 300, parryP: 0.45, err: 90, guardP: 0.3, rate: 5, punish: 0.7, charge: 0.3, smartSpec: true, smartCard: true, pickMs: 1200 }
  };
  const CARD_PRI = ['parry', 'slash', 'tough', 'wall', 'charge', 'nova', 'heavy', 'calm', 'vamp', 'star', 'potion'];
  function makeBrain(sk, seed) {
    const s = typeof sk === 'string' ? SKILLS[sk] : sk;
    return { sk: s, R: rng(seed || 7), plans: {}, nextTap: 0, redUp: 0, grnUp: 0, specAt: 0, pickAt: 0 };
  }
  function botThink(W, h, b) {
    const t = W.t; const sk = b.sk; const R = b.R;
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
    if (h.down || W.phase !== 'fight') {
      if (h.red.down) release(W, h, 'r');
      if (h.grn.down) release(W, h, 'g');
      return;
    }
    const E = W.enemy;
    // 1) 보이는 예고마다 어떻게 할지 정해요 (반응 시간 뒤)
    let holdGuard = false; let punish = false; let soonHit = false;
    for (const a of W.atks) {
      if (a.over || a.broken) continue;
      if (!(a.all || a.tg.indexOf(h.id) >= 0)) continue;
      if (t < a.t0 + sk.react) continue;
      for (let i = 0; i < a.hits.length; i++) {
        const ti = a.hits[i];
        if (ti + 120 < t) continue;
        const key = a.id + ':' + i;
        let p = b.plans[key];
        if (!p) {
          const r = R();
          if (a.icon === 'r' && R() < sk.punish) p = { m: 'punish' };
          else if (r < sk.parryP) p = { m: 'parry', at: ti - clamp(70 + gauss(R) * sk.err, -150, 400) };
          else if (r < sk.parryP + sk.guardP) p = { m: 'guard', from: ti - (200 + 250 * R()), to: ti + 140 };
          else p = { m: 'none' };
          b.plans[key] = p;
        }
        if (p.m === 'punish') { punish = true; if (ti - t < 260 && R() < 0.5) p.m = 'guard', p.from = t, p.to = ti + 140; }
        if (p.m === 'parry' && !p.done && t >= p.at) {
          p.done = true;
          if (h.grn.down) release(W, h, 'g');
          press(W, h, 'g', t);
          b.grnUp = t + 140 + 80 * R();
        }
        if (p.m === 'guard' && t >= p.from && t <= p.to) holdGuard = true;
        if (ti - t < 220 && ti >= t) soonHit = true;
      }
    }
    if (holdGuard && !h.grn.down) { press(W, h, 'g', t); b.grnUp = 0; }
    if (h.grn.down && !holdGuard && t >= b.grnUp) release(W, h, 'g');
    // 2) 필살기
    if (h.gauge >= HD.gaugeMax && t >= b.specAt) {
      const good = !sk.smartSpec || (E && (t < E.vuln || t < E.stun || E.boss || h.hp < h.st.maxHp * 0.3 || soonHit));
      if (good) { if (h.grn.down) release(W, h, 'g'); press(W, h, 'b', t); b.specAt = t + 400; }
    }
    if (h.grn.down) return;
    // 3) 공격 (빨강 연타 · 가끔 꾹 모아 베기)
    if (h.red.down && t >= b.redUp) release(W, h, 'r');
    if (!h.red.down && t >= b.nextTap && !(soonHit && sk.smartSpec)) {
      const open = E && (t < E.vuln || t < E.stun);
      const rate = sk.rate * (punish || open ? 1.3 : 1);
      press(W, h, 'r', t);
      b.redUp = open && R() < sk.charge ? t + h.st.chargeFull + HD.chargeAt + 60 : t + 50 + 40 * R();
      b.nextTap = t + (1000 / rate) * (0.7 + 0.6 * R());
    }
  }

  /* ================================================================
     전생 정산 (회귀할 때 넘어가는 것) — 저장은 meta.js, 계산은 여기
     meta: { v, loop, shards, nodes{combo,hp,reroll}, mem, stars, deaths, clears, bestRoom, firstClear, earned }
     ================================================================ */
  function newMeta() {
    return { v: 1, loop: 1, shards: 0, nodes: { combo: 0, hp: 0, reroll: 0 }, mem: null, stars: 0, deaths: 0, clears: 0, bestRoom: 0, firstClear: 0, earned: 0, playMs: 0 };
  }
  function fixMeta(m) {
    const b = newMeta();
    if (!m || typeof m !== 'object') return b;
    const o = Object.assign(b, m);
    o.nodes = Object.assign(newMeta().nodes, m.nodes || {});
    ['loop', 'shards', 'stars', 'deaths', 'clears', 'bestRoom', 'firstClear', 'earned', 'playMs'].forEach((k) => { o[k] = Math.max(0, Number(o[k]) || 0); });
    o.loop = Math.max(1, Math.floor(o.loop));
    if (o.mem && !(CARD[o.mem.id] && o.mem.lv > 0)) o.mem = null;
    return o;
  }
  function cardLabel(id, lv) {
    const c = CARD[id];
    if (!c) return '';
    return `${COLOR_NAME[c.c] ? COLOR_NAME[c.c] + ' ' : ''}${c.name}${lv ? ' Lv' + lv : ''}`;
  }
  // run: { reached(1~6), clear, hero(이번 생 내 용사), ms }
  function settle(meta, run) {
    const m = fixMeta(JSON.parse(JSON.stringify(meta)));
    const gained = shardsFor(run.reached, run.clear);
    const fromX = xpMult(m.loop);
    m.shards += gained; m.earned += gained;
    m.loop += 1;
    m.bestRoom = Math.max(m.bestRoom, run.reached);
    m.playMs += run.ms || 0;
    if (run.clear) { m.clears++; m.stars++; if (!m.firstClear) m.firstClear = meta.loop || 1; } else m.deaths++;
    const best = run.hero ? bestCard(run.hero) : null;
    let mem = null;
    if (best) { mem = { id: best.id, lv: Math.max(1, best.lv - 1) }; m.mem = mem; }
    const lines = [];
    lines.push({ k: 'reach', label: run.clear ? '도깨비 대왕 격파!' : '도달한 곳', text: run.clear ? '클리어!' : (run.reached >= D.rooms.length ? '대왕의 방' : `${run.reached}번째 방`) });
    lines.push({ k: 'shard', label: '기억 조각', val: gained, pre: '+' });
    lines.push({ k: 'xp', label: '경험치 배율', from: fromX, to: xpMult(m.loop) });
    if (mem) lines.push({ k: 'mem', label: '스킬 기억', text: cardLabel(mem.id, mem.lv), c: CARD[mem.id].c });
    if (run.clear) lines.push({ k: 'star', label: '★고난 해금', text: '★' + m.stars, val: m.stars });
    lines.push({ k: 'total', label: '모은 기억 조각', val: m.shards });
    return { meta: m, gained, lines, mem };
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
  // 영웅 만들 때 쓰는 값 (회차 · 영구 노드 · ★)
  function heroMeta(meta) {
    const m = fixMeta(meta);
    return { loop: m.loop, hp: m.nodes.hp, combo: m.nodes.combo, reroll: m.nodes.reroll, stars: m.stars };
  }

  const api = {
    D, DT, rng, hash, clamp, CARD, COLOR_NAME, LAST_ROOM, SKILLS,
    xpMult, shardsFor, needXp, calcStats, refresh, makeHero, makeWorld, makeEnemy, enemyScale,
    press, release, step, advance, heroStep, processImpacts, resolveImpact, dealHit, gainXp, heal,
    offerCards, reroll, pickCard, applyCard, drawCards, bestCard, cardLabel,
    soloDir, startAttack, killEnemy, nextRoom, stunEnemy, breakCheck, rageCheck, emit, heroById,
    makeBrain, botThink, newMeta, fixMeta, settle, nodeCost, buyNode, heroMeta
  };
  root.RpgSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
