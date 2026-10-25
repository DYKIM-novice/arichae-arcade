/* 아리채 오락실 · 회귀 RPG 진행 (혼자 모드 · 같이 모드 공통)
   - 매 프레임: 규칙 계산(sim) → 일어난 일(W.ev)을 그리기(view)·화면 틀(ui)·소리(sfx)에 나눠 줘요
   - 전멸 → 되감기 → "제 N회차 회귀!" → 전생 정산(기억 조각·경험치 배율·스킬 기억·기억의 나무) → 다시 출발
   - 보스 격파 → 클리어 회귀 (금빛 되감기 · 조각 +10 · ★고난 +1)
   - 혼자 모드: 서버 없이 이 폰에서만 (시계 = 이 폰 · 화면을 떠나 있던 시간은 멈춰요)
   - 같이 모드: 서버(rpg.py) 시간표를 따라가요 (시계 = 서버 시각) — net.js */
(function () {
  'use strict';

  const App = window.App;
  const Sim = window.RpgSim;
  const D = window.RpgData;
  const Meta = window.RpgMeta;
  const SFX = window.RpgSfx;
  if (!App || !Sim) return;
  const SND = App.SND;
  const IDX = { r: 0, g: 1, b: 2 };
  const CARD_GUARD_MS = 800;
  const NODE_BY_C = {};
  D.meta.nodes.forEach((n) => { NODE_BY_C[n.c] = n.id; });

  const G = {
    on: false, mode: '', W: null, me: null, view: null, ui: null, raf: 0, last: 0, seq: '', net: null,
    endT: 0, settle: null, settleReady: false, departAt: 0, res: null, startT: 0, paused: 0, hidAt: 0, opts: {},
    test: null, waiting: false
  };
  window.RpgGame = G;

  // 혼자 모드 시계: 화면을 떠나 있던 시간은 빼요 (그동안 맞지 않게)
  const soloClock = () => (performance.now() - G.paused) * ((G.test && G.test.speed) || 1);   // 시험할 때만 빠르게
  const clock = () => (G.mode === 'net' ? App.serverNow() : soloClock());

  function ensure() {
    if (!G.ui) {
      G.ui = window.RpgUI.create();
      setupInput();
    }
    if (G.view) { G.view.destroy(); G.view = null; }
    G.view = window.RpgView.create(G.ui.el('#rg-scene'), { myId: myId() });
  }
  const myId = () => App.S.pid || 'me';
  const scr = {
    hero: (id) => (G.view ? G.view.heroScreen(id) : { x: 100, y: 200 }),
    enemy: () => (G.view ? G.view.enemyScreen() : { x: 250, y: 200 })
  };

  /* ---------------- 혼자 모드 ---------------- */
  function makeMe() {
    const m = App.me() || {};
    const meta = Meta.get();
    return Sim.makeHero({ id: myId(), name: m.name || '나', ath: m.athlete || 'dino', kind: 'me', meta: Sim.heroMeta(meta), mem: meta.mem });
  }
  function startSolo(opts) {
    stop(true);
    G.mode = 'solo';
    G.opts = opts || {};
    ensure();
    newSoloWorld();
    App.showScreen('s-rg');
    begin();
  }
  function newSoloWorld() {
    const meta = Meta.get();
    const me = makeMe();
    const heroes = [me];
    const used = new Set([me.ath]);
    const free = window.Oly.ATH.map((a) => a.id).filter((id) => !used.has(id));
    for (let i = 0; i < (G.opts.ai || 0); i++) {
      const b = Sim.makeHero({ id: 'rgai' + (i + 1), name: 'AI 동료', ath: free[i % free.length], kind: 'bot', meta: Sim.heroMeta(meta) });
      b.brain = Sim.makeBrain('ally', Date.now() + i);
      b.bot = true;
      heroes.push(b);
    }
    // 시험용: 내 용사도 자동으로 (?rgauto=kid 등)
    if (G.test && G.test.auto) { me.kind = 'bot'; me.brain = Sim.makeBrain(G.test.auto, 99 + meta.loop); me.isMe = true; }
    const seed = (G.test && G.test.seed) || (1 + Math.floor(Math.random() * 2e9));
    const W = Sim.makeWorld({ t: clock(), seed, loop: meta.loop, stars: meta.stars, heroes });
    setWorld(W, me, meta);
  }
  function setWorld(W, me, meta) {
    G.W = W; G.me = me; G.seq = 'play'; G.endT = 0; G.startT = clock(); G.settle = null; G.settleReady = false; G.waiting = false;
    G.view.build(W);
    G.ui.reset(W, me, { loop: meta.loop, stars: W.stars });
    G.ui.banner(`${meta.loop}회차 · 1번째 방`, meta.loop === 1 ? '빨강 공격 · 초록 막기 · 파랑 필살' : '전생의 기억으로 더 강해졌어요!', 2200);
    exitBtn();
  }

  /* ---------------- 같이 모드 ---------------- */
  function startNet() {
    if (G.mode === 'net' && G.on) return;
    stop(true);
    G.mode = 'net';
    ensure();
    G.net = window.RpgNet.create({
      send: App.send, myPid: myId(), meta: () => Meta.get(), botMeta: () => Sim.heroMeta(Meta.get()), now: () => App.serverNow()
    });
    G.W = null;
    G.seq = 'wait';
    App.showScreen('s-rg');
    sendBadge();
    begin();
  }
  function onSnap(s) {
    if (G.mode !== 'net' || !G.net) return;
    G.net.onSnap(s);
    // 새 판(run): 처음 들어왔거나, 다 같이 회귀한 뒤
    if (s.run !== G.net.run && (G.seq === 'wait' || G.seq === 'settle' || G.seq === 'play' || G.seq === 'rewind')) {
      if (G.seq === 'rewind') return;   // 되감기 연출은 끝까지 보고 (정산 화면에서 넘어가요)
      if (G.settle) { G.settle.cancel(); G.settle = null; }
      const me = makeMe();
      if (G.test && G.test.auto) { me.kind = 'bot'; me.brain = Sim.makeBrain(G.test.auto, Sim.hash(s.run, me.id)); }
      const W = G.net.buildWorld(s, me);
      G.ui.hideOver();
      setWorld(W, me, Meta.get());
      G.net.onSnap(s);
      if (!s.hs[me.id]) { G.spectate = true; G.ui.banner('구경 중', '다음 회차부터 같이 해요', 2500); } else G.spectate = false;
    }
  }
  function sendBadge() { try { App.send({ t: 'rgmeta', m: Meta.badge() }); } catch (e) { /* 무시 */ } }

  /* ---------------- 매 프레임 ---------------- */
  function begin() {
    G.on = true;
    G.last = performance.now();
    cancelAnimationFrame(G.raf);
    G.raf = requestAnimationFrame(frame);
  }
  function frame(ts) {
    if (!G.on) return;
    G.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (ts - G.last) / 1000);
    G.last = ts;
    const W = G.W;
    if (!W) return;
    try {
      const now = clock();
      if (G.seq === 'play') {
        if (G.mode === 'net') G.net.apply(W);
        Sim.advance(W, now);
        drain(W);
        if (G.mode === 'net' && !G.spectate) G.net.pose(W, now);
        cardsUi(W);
        checkEnd(W);
      } else if (G.seq === 'settle') settleTick();
      G.view.frame(W, dt);
      G.ui.update(W, G.me);
    } catch (e) { console.error(e); }
  }
  function cardsUi(W) {
    if (W.phase !== 'cards' || !G.me.cards) { G.ui.cards(null); G.cardsKey = ''; return; }
    // 카드가 막 나온 0.8초 동안은 버튼을 안 받아요 (연타하다가 모르고 고르지 않게)
    const key = G.me.cards.join(',') + ':' + G.me.rerolled;
    if (key !== G.cardsKey) { G.cardsKey = key; G.cardsShownAt = performance.now(); }
    let wait = '';
    if (G.mode === 'net' && G.net.snap) {
      const hs = G.net.snap.hs || {};
      const ids = Object.keys(hs);
      wait = `가족 ${ids.filter((id) => hs[id].pk).length}/${ids.length} 골랐어요`;
    }
    G.ui.cards(G.me, { wait });
  }

  // 일어난 일 → 그리기 · 화면 틀 · 소리
  function drain(W) {
    if (!W.ev.length) return;
    const list = W.ev.splice(0, W.ev.length);
    const me = G.me;
    list.forEach((e) => {
      try { G.view.event(e, W); } catch (err) { console.error(err); }
      try { G.ui.event(e, W, me, scr); } catch (err) { console.error(err); }
      sound(e, W, me);
      if (G.test && G.test.log) G.test.log.push({ k: e.k, t: Math.round(e.t), h: e.h, kind: e.kind, dmg: e.dmg });
    });
  }
  function sound(e, W, me) {
    if (!SFX) return;
    const mine = e.h === me.id;
    switch (e.k) {
      case 'swing': if (mine) SFX.swing(e.step === 'heavy' ? 3 : e.step || 0); break;
      case 'hit': if (mine || Math.random() < 0.5) SFX.hit(e.kind, e.crit); break;
      case 'parry': if (mine) SFX.parry(); else SFX.guard(); break;
      case 'guard': if (mine) SFX.guard(); break;
      case 'hurt': if (mine) SFX.hurt(); break;
      case 'dodge': if (mine) SFX.dodge(); break;
      case 'tele': if (e.all || (e.tg || []).indexOf(me.id) >= 0) SFX.tele(e.icon); break;
      case 'charge': if (mine) SFX.charge(e.full); break;
      case 'spec': SFX.spec(); break;
      case 'specNo': if (mine) SFX.specNo(); break;
      case 'gaugeFull': if (mine) SFX.gaugeFull(); break;
      case 'kill': SFX.kill(e.boss); break;
      case 'lvup': if (mine) SFX.lvup(); break;
      case 'heal': if (mine && e.n >= 3) SFX.heal(); break;
      case 'break': SFX.break(); break;
      case 'stun': SFX.stun(); break;
      case 'rage': SFX.rage(); break;
      case 'down': if (mine) SFX.die(); break;
      case 'roomClear': SFX.cardsIn(); break;
      case 'pick': if (mine) SFX.card(); break;
      default: break;
    }
  }

  /* ---------------- 끝 → 회귀 ---------------- */
  function checkEnd(W) {
    if (W.phase !== 'wipe' && W.phase !== 'clear') return;
    if (G.endT) return;
    G.endT = performance.now();
    const clear = W.phase === 'clear';
    if (clear) { G.ui.clearShow(); G.view.celebrate(); SND.SFX.fanfare && SND.SFX.fanfare(); }
    else { G.ui.dying(); }
    setTimeout(() => regress(clear), clear ? 3000 : 1500);
  }
  function regress(clear) {
    if (!G.on || !G.W) return;
    const W = G.W;
    G.seq = 'rewind';
    G.res = Meta.regress({ reached: W.room + 1, clear, hero: G.me, ms: clock() - G.startT });
    sendBadge();
    G.ui.rewindOn(clear);
    if (SFX) SFX.rewind(2.5);
    SND.vibrate([40, 40, 40, 40, 120]);
    G.view.rewind(2600, () => {
      if (!G.on) return;
      if (SFX) SFX.title(clear);
      SND.vibrate(120);
      G.ui.title(G.res.meta.loop, clear);
      setTimeout(() => { if (G.on) showSettle(); }, 1800);
    });
  }
  function showSettle() {
    G.seq = 'settle';
    G.settleReady = false;
    G.departAt = 0;
    G.settle = G.ui.settle(G.res, {
      meta: Meta.get(),
      ready: () => {
        G.settleReady = true;
        G.departAt = performance.now() + (G.mode === 'net' ? 26000 : 30000);
        if (G.test && G.test.autoDepart != null) G.departAt = performance.now() + G.test.autoDepart;
      }
    });
    // 같이 모드: 다른 가족이 먼저 출발해 서버가 새 판을 시작했으면 바로 따라가요
  }
  function settleTick() {
    if (!G.settleReady || !G.settle) return;
    const left = Math.ceil((G.departAt - performance.now()) / 1000);
    if (!G.waiting) G.settle.countdown(left);
    if (left <= 0) depart();
    if (G.mode === 'net' && G.net && G.net.snap && G.net.snap.run !== G.net.run) {
      // 서버가 새 판을 시작했어요
      if (!G.waiting) { G.waiting = true; }
      const s = G.net.snap;
      G.seq = 'wait';
      onSnap(s);
    }
  }
  function depart() {
    if (G.seq !== 'settle' || G.waiting) return;
    if (SFX) SFX.depart();
    if (G.mode === 'solo') {
      G.settle && G.settle.cancel();
      G.ui.hideOver();
      newSoloWorld();
      return;
    }
    G.waiting = true;
    sendBadge();
    App.send({ t: 'rgready' });
    G.settle.waiting('가족이 출발할 때까지 기다려요…');
  }
  function buy(c) {
    const id = NODE_BY_C[c];
    if (!id || !G.settleReady) return;
    if (Meta.buy(id)) { if (SFX) SFX.buy(); G.settle.refresh(Meta.get()); G.settle.buyFx(id); SND.vibrate(30); } else { if (SFX) SFX.nope(); G.settle.nopeFx(id); }
  }

  /* ---------------- 입력 ---------------- */
  function press(c) {
    if (!G.on || !G.W) return;
    if (G.seq === 'settle') { buy(c); return; }
    if (G.seq !== 'play' || G.spectate) return;
    const W = G.W; const me = G.me;
    if (me.kind === 'bot') return;
    if (W.phase === 'cards' && me.cards) {
      if (performance.now() - (G.cardsShownAt || 0) < CARD_GUARD_MS) return;
      const slot = IDX[c];
      G.ui.pickFx(slot);
      Sim.pickCard(W, me, slot);
      SND.vibrate(25);
      drain(W);
      return;
    }
    Sim.advance(W, clock());
    Sim.press(W, me, c, W.t);
    drain(W);
  }
  function release(c) {
    if (!G.on || !G.W || G.seq !== 'play' || !G.me || G.me.kind === 'bot') return;
    Sim.advance(G.W, clock());
    Sim.release(G.W, G.me, c);
    drain(G.W);
  }
  function setupInput() {
    const pad = G.ui.el('#rg-pad');
    pad.querySelectorAll('.bez').forEach((bez) => {
      const c = bez.dataset.c;
      const btn = bez.querySelector('button');
      let down = false;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        SND.unlock();
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
        bez.classList.add('down');
        down = true;
        const w = document.createElement('i'); w.className = 'wave'; w.style.setProperty('--wc', { r: '#FF8B95', g: '#7DF0AE', b: '#A9C4FF' }[c]);
        bez.appendChild(w); setTimeout(() => w.remove(), 520);
        press(c);
      });
      const up = () => { bez.classList.remove('down'); if (down) { down = false; release(c); } };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const KEYS = { a: 'r', j: 'r', 1: 'r', arrowleft: 'r', s: 'g', k: 'g', 2: 'g', arrowdown: 'g', arrowup: 'g', ' ': 'g', d: 'b', l: 'b', 3: 'b', arrowright: 'b' };
    const active = () => G.ui.root.classList.contains('active');
    document.addEventListener('keydown', (e) => {
      if (!active()) return;
      const c = KEYS[(e.key || '').toLowerCase()];
      if (!c) return;
      e.preventDefault();
      if (e.repeat) return;
      pad.querySelector(`.bez[data-c="${c}"]`).classList.add('down');
      press(c);
    });
    document.addEventListener('keyup', (e) => {
      const c = KEYS[(e.key || '').toLowerCase()];
      if (!c) return;
      pad.querySelector(`.bez[data-c="${c}"]`).classList.remove('down');
      if (active()) release(c);
    });
    G.ui.root.addEventListener('touchmove', (e) => { if (!e.target.closest('.rg-settle')) e.preventDefault(); }, { passive: false });
    // 카드·노드는 손가락으로 눌러도 돼요
    G.ui.el('#rg-over').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      SND.unlock();
      if (b.dataset.slot != null) press(['r', 'g', 'b'][Number(b.dataset.slot)]);
      else if (b.dataset.reroll) { if (Sim.reroll(G.W, G.me)) { if (SFX) SFX.cardsIn(); } }
      else if (b.dataset.node) buy(D.meta.nodes.find((n) => n.id === b.dataset.node).c);
      else if (b.classList.contains('rg-go')) depart();
    });
    G.ui.el('#rg-exit').addEventListener('click', () => {
      SND.unlock();
      if (G.mode === 'net') {
        if (App.S.room && App.S.room.hostPid === App.S.pid && confirm('같이 모험을 그만하고 대기실로 갈까요?\n(회귀 기록은 각자 폰에 남아요)')) App.send({ t: 'again' });
        return;
      }
      if (G.seq === 'play' && !confirm('모험을 그만할까요?\n(지금까지의 회귀 기록은 남아요)')) return;
      stop();
      App.showScreen(App.S.room ? 's-lobby' : 's-home');
    });
    document.addEventListener('visibilitychange', () => {
      if (G.mode !== 'solo') return;
      if (document.hidden) G.hidAt = performance.now();
      else if (G.hidAt) { G.paused += performance.now() - G.hidAt; G.hidAt = 0; }
    });
  }
  function exitBtn() {
    const b = G.ui.el('#rg-exit');
    const host = App.S.room && App.S.room.hostPid === App.S.pid;
    b.style.visibility = G.mode === 'net' && !host ? 'hidden' : '';
  }

  function stop(keepScreen) {
    G.on = false;
    cancelAnimationFrame(G.raf);
    if (G.settle) { G.settle.cancel(); G.settle = null; }
    G.W = null; G.me = null; G.seq = ''; G.net = null; G.spectate = false;
    if (G.ui && !keepScreen) G.ui.hideOver();
    G.mode = '';
  }

  // 방 상태가 바뀔 때 (같이 모험 시작 · 끝 · 다른 게임 시작)
  App.hooks.state.push((room, changed) => {
    if (room.phase === 'rpg') {
      if (G.mode !== 'net') startNet();
      return;
    }
    if (G.mode === 'net') { stop(); return; }
    if (G.mode === 'solo' && room.phase !== 'lobby' && room.phase !== 'final' && changed) stop();
  });
  App.hooks.message.push((msg) => {
    if (msg.t === 'rg' && msg.s) onSnap(msg.s);
    if (msg.t === 'joined') setTimeout(sendBadge, 300);
  });

  // 시험용: 다음 공격이 닿기 직전(90ms 전)에 초록을 눌러 패링해요
  function parryNext(lead) {
    const W = G.W;
    if (!W) return 0;
    const a = W.atks.find((x) => !x.over && !x.broken && (x.all || x.tg.indexOf(G.me.id) >= 0));
    if (!a) return 0;
    const ti = a.hits.find((h) => h > W.t + 120);
    if (!ti) return 0;
    const sp = G.mode === 'solo' && G.test && G.test.speed ? G.test.speed : 1;
    const was = G.me.kind;
    setTimeout(() => { G.me.kind = 'me'; press('g'); setTimeout(() => { release('g'); G.me.kind = was; }, 160); }, Math.max(0, (ti - (lead || 90) - clock()) / sp));
    return ti;
  }
  Object.assign(G, { startSolo, startNet, stop, press, release, depart, buy, clock, sendBadge, parryNext });
})();
