/* 아리채 오락실 · 회귀 RPG 같이 모드 — 서버 진행자(rpg.py)를 따라가는 '진행자' (netDir)
   - 내 용사(그리고 내가 맡은 AI 동료)는 이 폰에서 바로 계산해요 → 누르면 바로 움직여요
   - 적 체력·공격 시간표·방 진행은 서버 값을 따라가요 (시각은 App.serverNow = 서버 시각)
   - 내가 때린 피해는 바로 화면에 빼 두고(예측), 서버가 받았다고(ak) 하면 서버 값으로 맞춰요
   - 막기·패링은 이 폰이 서버가 정한 '닿는 시각'과 비교해서 정해요 (지연과 상관없이 공정) */
(function () {
  'use strict';

  const Sim = window.RpgSim;
  const D = window.RpgData;

  function create(o) {
    // o: { send, myPid, meta() }
    const N = {
      run: 0, snap: null, fresh: false, lastEv: 0, hitN: 0, pend: [], sent: {}, cardsRoom: -1, seenTele: {}, seenBreak: {}, killed: {},
      firstEv: true
    };
    const send = o.send;
    const as = (h) => (h.bot ? h.id : '');   // AI 동료일 때만 '누구 대신' 을 붙여요

    const dir = {
      init() { /* 계획은 서버가 가지고 있어요 */ },
      tick() { /* 서버 소식(apply)으로 바뀌어요 */ },
      hit(W, h, dmg, kind) {
        const E = W.enemy;
        if (!E || E.dead || W.phase !== 'fight') return 0;
        const crit = W.t < E.vuln;
        const got = crit ? dmg * 2 : dmg;
        E.hp -= got;
        N.hitN++;
        N.pend.push({ n: N.hitN, d: got });
        send({ t: 'rghit', run: N.run, as: as(h), e: E.eid, d: dmg, k: kind, n: N.hitN });
        Sim.emit(W, 'hit', { h: h.id, dmg: got, kind, crit, e: E.eid });
        W.atks.forEach((a) => { if (a.brk && !a.over && W.t < a.hits[0]) a.brkDmg += got; });
        return got;
      },
      parried(W, h, atk, i, final) {
        send({ t: 'rgparry', run: N.run, as: as(h), a: atk.id, i, f: final ? 1 : 0 });
        const E = W.enemy;
        if (E && final) E.stun = Math.max(E.stun, W.t + D.enemies[E.kind].stun);
      },
      impacted() { /* 다음 공격 시각은 서버가 정해요 */ },
      hurt(W, h) { N.sent[h.id] = null; },
      down(W, h) { N.sent[h.id] = null; },
      picked(W, h) { send({ t: 'rgpick', run: N.run, as: as(h) }); }
    };

    // 서버 소식 받기 (화면 프레임에서 W 에 반영해요)
    function onSnap(s) { N.snap = s; N.fresh = true; }

    function apply(W) {
      if (!N.fresh || !N.snap) return;
      N.fresh = false;
      const s = N.snap;
      if (s.run !== N.run) return;
      // 방이 바뀌었으면: 쓰러진 용사는 일어나고, 나머지는 조금 회복
      if (s.room > W.room) {
        W.room = s.room; W.enc = 0;
        W.heroes.forEach((h) => {
          if (h.kind === 'remote') return;
          if (h.cards) Sim.pickCard(W, h, Math.floor(Math.random() * 3));   // 시간이 다 됐으면 저절로
          if (h.down) { h.down = false; h.hp = Math.round(h.st.maxHp * D.hero.reviveHp); h.act = 'walk'; h.seq++; Sim.emit(W, 'revive', { h: h.id }); } else Sim.heal(W, h, h.st.maxHp * D.hero.roomHeal);
        });
        Sim.emit(W, 'room', { room: W.room });
        W.atks = [];
      }
      W.enc = s.enc;
      const was = W.phase;
      W.phase = s.ph;
      W.result = s.res || '';
      W.stars = s.stars || 0;
      if (s.ph === 'cards' && N.cardsRoom !== s.room) {
        N.cardsRoom = s.room;
        Sim.emit(W, 'roomClear', { room: s.room });
        W.heroes.forEach((h) => { if (h.kind !== 'remote') Sim.offerCards(W, h); });
      }
      if ((s.ph === 'wipe' || s.ph === 'clear') && was !== s.ph) Sim.emit(W, s.ph === 'wipe' ? 'wipe' : 'clear', {});
      // 적
      const e = s.e;
      if (e && !(e.dd && s.ph !== 'fight' && !(W.enemy && W.enemy.eid === e.id))) {
        if (!W.enemy || W.enemy.eid !== e.id) {
          W.enemy = { eid: e.id, kind: e.k, room: s.room, hp: e.hp, max: e.mx, dmgMult: e.dm, xp: e.xp, spawn: e.sp, nextAt: e.nx, stun: 0, vuln: 0, dead: 0, rage: false, frz: 0, boss: !!e.boss };
          N.pend = [];
          if (!e.dd) Sim.emit(W, 'spawn', { e: e.id, kind: e.k });
        }
        const E = W.enemy;
        const ack = (s.ak || {})[o.myPid] || 0;
        N.pend = N.pend.filter((p) => p.n > ack);
        const mine = N.pend.reduce((t, p) => t + p.d, 0);
        E.hp = Math.max(0, e.hp - mine);
        E.max = e.mx; E.stun = Math.max(E.stun > W.t ? E.stun : 0, e.st); E.vuln = e.vu; E.boss = !!e.boss;
        if (e.rg && !E.rage) { E.rage = true; Sim.emit(W, 'rage', { e: E.eid }); }
        if (e.dd && !E.dead) {
          E.dead = Math.min(W.t, e.dd + 80); E.hp = 0;
          if (!N.killed[E.eid]) {
            N.killed[E.eid] = 1;
            Sim.emit(W, 'kill', { e: E.eid, kind: E.kind, boss: E.boss });
            W.heroes.forEach((h) => { if (h.kind !== 'remote') Sim.gainXp(W, h, E.xp); });
          }
        }
      } else if (!e) W.enemy = null;
      // 적 공격 시간표
      const old = {};
      W.atks.forEach((a) => { old[a.id] = a; });
      W.atks = (s.a || []).map((x) => {
        const a = old[x.id] || { id: x.id, brkDmg: 0 };
        Object.assign(a, { eid: x.e, pat: x.p, icon: x.ic, t0: x.t0, hits: x.h, dmg: x.d, tg: x.tg, all: !!x.al, brk: x.bk, brkDmg: Math.max(a.brkDmg || 0, x.bd || 0), over: !!x.ov, broken: !!x.br, vuln: x.vu, rec: x.rc });
        if (!N.seenTele[x.id] && !x.ov) { N.seenTele[x.id] = 1; Sim.emit(W, 'tele', { a: x.id, pat: x.p, icon: x.ic, all: !!x.al, tg: x.tg }); }
        if (x.br && x.bk && !N.seenBreak[x.id]) { N.seenBreak[x.id] = 1; Sim.emit(W, 'break', { a: x.id, e: x.e }); }
        return a;
      });
      // 다른 가족 용사
      Object.keys(s.hs || {}).forEach((id) => {
        const hs = s.hs[id];
        const h = W.heroes.find((x) => x.id === id);
        if (!h || h.kind !== 'remote') return;
        h.hp = hs.hp; h.mh = hs.mh; h.st.maxHp = hs.mh; h.down = hs.dn; h.lv = hs.lv; h.gauge = hs.g;
        if (h.seq !== hs.s) { h.seq = hs.s; h.act = hs.a; h.actAt = hs.aa; if (hs.a === 'atk') h.step = (h.step + 1) % 3; }
        if (hs.dn) h.act = 'down';
      });
      // 다른 가족이 때린 피해 숫자 · 패링 반짝
      (s.ev || []).forEach((ev) => {
        if (ev.id <= N.lastEv) return;
        N.lastEv = ev.id;
        if (N.firstEv) return;
        const h = W.heroes.find((x) => x.id === ev.h);
        if (!h || h.kind !== 'remote') return;
        if (ev.k === 'hit') Sim.emit(W, 'hit', { h: ev.h, dmg: ev.d, kind: ev.kd || 'c1', crit: ev.c, remote: true });
        if (ev.k === 'parry') Sim.emit(W, 'parry', { h: ev.h, remote: true, final: false });
      });
      N.firstEv = false;
    }

    // 내 용사 모습 보내기 (동작이 바뀌면 바로, 아니면 0.5초마다)
    function pose(W, now) {
      W.heroes.forEach((h) => {
        if (h.kind === 'remote') return;
        const last = N.sent[h.id];
        const hp = Math.max(0, Math.ceil(h.hp));
        if (last && last.s === h.seq && last.hp === hp && last.dn === h.down && now - last.at < 500) return;
        if (last && last.s === h.seq && now - last.at < 70) return;
        N.sent[h.id] = { s: h.seq, hp, dn: h.down, at: now };
        send({ t: 'rgpose', run: N.run, as: as(h), a: h.act, s: h.seq, ago: Math.round(h.actT), hp, mh: h.st.maxHp, lv: h.lv, g: Math.round(h.gauge), dn: h.down ? 1 : 0 });
      });
    }

    // 서버 판(run)으로 새 세계 만들기
    function buildWorld(s, me) {
      N.run = s.run; N.pend = []; N.sent = {}; N.cardsRoom = -1; N.seenTele = {}; N.seenBreak = {}; N.killed = {}; N.firstEv = true;
      const heroes = [];
      Object.keys(s.hs).forEach((id, i) => {
        const hs = s.hs[id];
        if (id === o.myPid) { heroes.push(me); return; }
        const mine = hs.b && hs.dr === o.myPid;
        const h = Sim.makeHero({ id, name: hs.n, ath: hs.at, kind: mine ? 'bot' : 'remote', meta: mine ? o.botMeta() : {} });
        if (mine) h.brain = Sim.makeBrain('ally', Sim.hash(s.seed, id, s.run));
        h.bot = hs.b;
        heroes.push(h);
      });
      const W = Sim.makeWorld({ t: o.now(), seed: Sim.hash(s.seed, s.run), loop: o.meta().loop, stars: s.stars, heroes, dir, net: true });
      W.run = s.run;
      W.phase = s.ph; W.room = s.room;
      return W;
    }

    return { dir, onSnap, apply, pose, buildWorld, get run() { return N.run; }, get snap() { return N.snap; } };
  }

  window.RpgNet = { create };
})();
