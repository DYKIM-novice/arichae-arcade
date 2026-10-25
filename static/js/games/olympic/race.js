/* 아리채 오락실 · 올림픽관 '레인 경주' 틀 (100m 달리기 · 110m 허들 · 수영 50m)
   - 종목 파일은 규칙(sim)과 자세(pose)만 정하고, 경기장·출발 신호·AI·순위·기록은 여기서 해요
   - 규칙(sim)은 화면과 따로 떨어진 순수 계산이에요. 누른 기록(log)만 있으면 같은 결과가 나와서
     나중에 서버가 다시 계산해 점수를 확인할 수 있어요 (공개 대회용)
   시간: e = 경기 시작(startAt)부터 ms, gun = 출발 총 (서버가 정해 모두 같아요)
   - 필살기 부스터·역전 장치(boost.js): cfg.boost = { cap, ms } 인 종목만. 켠 것 'X'·배율 'M1.3' 도 누른 기록에 남겨요
   - 난이도: ctx.diff (혼자 연습만 · 방 경기는 노멀) → st.dp 값을 규칙이 읽어요 */
(function () {
  'use strict';

  const O = window.Oly;
  const STEP = 10;   // 규칙 계산 간격(ms) — 서버 다시 계산과 같게

  function raceEvent(cfg) {
    const D = cfg.D;
    const tau = cfg.tau || 1.1;

    const def = {
      id: cfg.id, title: cfg.title, cat: cfg.cat, catColor: cfg.catColor, how: cfg.how, icon: cfg.icon,
      buttons: cfg.buttons || ['r', 'b'], rules: cfg.rules, illus: cfg.illus, noGo: true, pressSound: false,
      fmt: O.fmtTimeScore,
      // 순위표: 들어온 사람은 기록, 달리는 중이면 거리
      rival(arr) {
        const sc = arr ? arr[0] : 0;
        const x = arr ? arr[1] || 0 : 0;
        if (sc >= 50000) return { sort: sc, text: O.fmtSec(100000 - sc) };
        return { sort: x, text: `${Math.floor(x)}m` };
      },
      // AI 선수: 서버가 정한 기록(T)대로
      botLive(perf, e, cur) {
        const gun = (cur.ev && cur.ev.gun) || 2400;
        const s = (e - gun - perf.react) / 1000;
        const pr = O.profile(D, perf.T / 1000, tau);
        const fin = s * 1000 >= perf.T;
        let x = fin ? D + Math.min(6, (s - perf.T / 1000) * 3) : pr.pos(s);
        if (cfg.botPos && !fin) x = cfg.botPos(perf, s, pr);
        const extra = [Math.round(pr.speed(Math.max(0, s)) * 100) / 100, fin ? 3 : 0];
        if (cfg.botExtra) cfg.botExtra(perf, s, x, extra);
        return [fin ? perf.score : 0, x, extra];
      },
      create(ctx) { return makeRace(ctx, cfg); },
      // 혼자 연습: 저장해 둔 누른 기록(log)을 화면 없이 다시 돌려 '내 최고 기록' 유령 선수를 만들어요
      ghost(gctx, log) { return replayRace(gctx, log, cfg); },
      boost: !!cfg.boost,
      sim: cfg.sim, cfg      // 시험·서버 다시 계산용
    };
    O.register(def);
    return def;
  }

  // 규칙 상태 만들기: 난이도 값(dp) · 부스터(bo)
  function initSt(cfg, ctx) {
    const st = cfg.sim.init(ctx);
    st.x = st.x || 0; st.v = st.v || 0; st.fin = 0; st.e = 0;
    st.dp = O.diffP(ctx && ctx.diff);
    if (cfg.boost) st.bo = O.boost.make(cfg.boost, st.dp);
    return st;
  }
  // 지금 부스터를 켤 수 있나 (들어왔거나 · 바이애슬론 사격 중이면 안 돼요)
  const canBoost = (st, cfg) => !st.fin && (!cfg.boostOk || cfg.boostOk(st));
  // 누른 기록 한 줄 적용 (화면 경기·유령 공통): 'X'·'M..' / 대문자 = 떼기 / 소문자 = 누르기
  function apply(st, cfg, k, e, gun) {
    if (O.boost.isCode(k)) return O.boost.input(st, k, e, canBoost(st, cfg));
    const c = k.toLowerCase();
    if (k !== c) { if (cfg.sim.release) cfg.sim.release(st, c, e, gun); return null; }
    return cfg.sim.press(st, c, e, gun);
  }

  // 규칙을 e(ms)까지 10ms 씩 계산 (화면 경기와 유령이 똑같은 계산을 써요)
  function stepper(st, cfg, gun) {
    const D = cfg.D;
    return function simTo(e) {
      while (st.e + STEP <= e) {
        st.e += STEP;
        if (!st.fin) {
          cfg.sim.step(st, STEP / 1000, st.e, gun);
          O.boost.run(st, STEP, !(cfg.boostHold && cfg.boostHold(st)));
          if (st.x >= D) {
            st.fin = Math.max(1, st.e - gun) + (st.pen || 0);   // 바이애슬론 벌칙 시간
            st.x = D;
          }
        } else {
          // 들어온 뒤에는 천천히 멈춰요
          st.v *= Math.exp(-2.2 * STEP / 1000);
          st.x += st.v * STEP / 1000;
        }
      }
    };
  }

  // 유령: at(e) → 다른 선수와 같은 꼴 [점수, 거리, 덧붙임]
  function replayRace(gctx, log, cfg) {
    const gun = (gctx.ev && gctx.ev.gun) || 2400;
    const st = initSt(cfg, gctx);
    const simTo = stepper(st, cfg, gun);
    const L = log || [];
    let i = 0;
    return {
      at(e) {
        while (i < L.length && L[i][0] <= e) {
          const le = L[i][0]; const k = String(L[i][1]); i++;
          simTo(le);
          apply(st, cfg, k, le, gun);
        }
        simTo(e);
        const sc = st.fin ? 100000 - st.fin : Math.round(st.x * 100);
        return [sc, Math.round(st.x * 100) / 100, extraOf(st, cfg)];
      },
      score: () => (st.fin ? 100000 - st.fin : Math.round(st.x * 100)),
      st
    };
  }

  // 다른 폰에 보내는 모습 값: [속도, 상태, (종목 값…), 부스터] — 부스터는 맨 뒤에 덧붙여요 (순서는 그대로)
  function extraOf(st, cfg) {
    const a = [Math.round(st.v * 100) / 100, st.fin ? 3 : (st.state || 0)].concat(cfg.extra ? cfg.extra(st) : []);
    if (cfg.boost) a.push(O.boost.code(st));
    return a;
  }

  function makeRace(ctx, cfg) {
    const D = cfg.D;
    const gun = (ctx.ev && ctx.ev.gun) || 2400;
    const tr = new O.Track(ctx, {
      D, surface: cfg.surface || 'track', view: cfg.view || 13, marks: cfg.marks || 10,
      laneExtras: cfg.laneExtras, marksExtra: cfg.marksExtra, stripLabel: cfg.stripLabel, afterBuild: cfg.afterBuild,
      winter: cfg.winter, gear: cfg.gear
    });
    const meter = cfg.noMeter ? { set() {} } : O.rateMeter(tr.hud, cfg.meterLabel);
    if (cfg.hud) cfg.hud(tr, ctx);
    tr.build(true, true);   // HUD 높이만큼 레인을 올려요
    const starter = O.starter(tr, ctx);
    const st = initSt(cfg, ctx);
    const log = [];
    let lastT = 0;
    let finSaid = false;
    const me = tr.list.find((p) => p.me);
    const fins = {};      // pid → 들어온 순서
    const simTo = stepper(st, cfg, gun);
    // 손맛·몸개그 (fx.js) — 켠 종목만 (100m)
    const J = cfg.juice && O.fx ? O.fx.raceJuice(ctx, tr, cfg, st, gun) : null;
    // 필살기 부스터 (화면): 게이지 · 큰 버튼 · 기운 · 꼬리 조각
    const B = cfg.boost ? boostView() : null;
    let ended = false;

    function myScore() { return st.fin ? 100000 - st.fin : Math.round(st.x * 100); }

    function boostView() {
      const BO = O.boost;
      const clk = BO.clock(ctx);
      const chord = BO.chord();
      const bIdx = 2 + (cfg.extra ? cfg.extra(st).length : 0);   // 다른 선수 덧붙임 값에서 부스터 자리
      const was = {};
      let trail = null; let lastM = -1e9;
      const ui = BO.ui(ctx, { wrap: tr.wrap, scene: tr.sceneBox, ath: me.athlete, onFire: () => fire(clk.now()) });
      // 트랙을 다시 그리면 기운·꼬리 층도 다시 붙여요
      function attach() {
        const g = O.el('g', { class: 'obs-trail' });
        tr.layers.world.appendChild(g);
        trail = BO.trailer(g, 40);
        tr.list.forEach((p) => {
          const A = tr.ath[p.pid];
          if (!A) return;
          A.aura = O.el('g', { class: 'obs-aura', display: 'none' }, BO.auraHTML(p.athlete));
          A.laneG.insertBefore(A.aura, A.laneG.firstChild);
        });
      }
      const prevAB = tr.o.afterBuild;
      tr.o.afterBuild = (t) => { if (prevAB) prevAB(t); attach(); };
      attach();
      return {
        ui, chord, clk,
        // 이 선수가 지금 부스터 중인가 (나 · 다른 폰 · 유령은 진짜 값, AI 는 흉내)
        on(p, E) {
          if (p.me) return BO.active(st);
          if (p.bot && !p.ghost) { const w = BO.botWindow(ctx.seed, p.pid); const f = E.x / cfg.D; return f > w[0] && f < w[1] && !E.fin; }
          return (E.extra || [])[bIdx] === 2;
        },
        // 매 프레임 (선수 한 명)
        draw(p, A, E, px, pose, dt) {
          const on = this.on(p, E);
          if (on && !was[p.pid] && !p.me) ui.remote(p.athlete, p.ghost ? '내 최고' : p.name);
          was[p.pid] = on;
          if (!A.aura) return pose;
          if (!on) { if (A.auraOn) { A.auraOn = false; A.aura.setAttribute('display', 'none'); } return pose; }
          const s = A.lane.s * tr.baseS;
          const lift = (pose.lift || 0) * A.lane.s;
          if (!A.auraOn) { A.auraOn = true; A.aura.removeAttribute('display'); }
          A.aura.setAttribute('transform', `translate(${tr.sx(px).toFixed(1)} ${(A.lane.y - lift).toFixed(1)}) scale(${s.toFixed(3)})`);
          if (trail && A.i < 5) trail.emit(p.athlete, p.pid, px * tr.ppm - 14 * s, A.lane.y - lift - 40 * s, 0, s, p.me, dt);
          const L = BO.look(p.athlete);
          const np = Object.assign({}, pose, { fx: 'speed' });
          if (L.spin) np.tilt = ((E.e || 0) * 1.1) % 360;
          if (L.tuck) np.tilt = (pose.tilt || 0) + 22;
          return np;
        },
        tick(t, e, dt, ents) {
          clk.seen(t);
          if (trail) trail.tick(dt);
          ui.update(st, e, ended || !!st.fin);
          if (chord.check(t)) fire(t);
          // 역전 장치: 0.4초마다 내 순위로 게이지 배율 (바뀌면 누른 기록에 남겨요)
          if (!st.fin && e > gun + 300 && e - lastM >= 400) {
            lastM = e;
            let n = 0; let r = 1;
            tr.list.forEach((p) => {
              if (p.ghost) return;
              n++;
              if (p.me) return;
              const E = ents[p.pid];
              if (E && (E.fin || E.x > st.x)) r++;
            });
            const m = BO.mulFor(r, n);
            if (m !== st.bo.mul) {
              const er = Math.round(e);
              simTo(er);
              log.push([er, 'M' + m]);
              BO.input(st, 'M' + m, er);
            }
          }
        }
      };
    }
    // 부스터 켜기 (큰 버튼 · 빨강+파랑 꾹 · 키보드 x)
    function fire(t) {
      if (!B || ended) return;
      const e = Math.round(t - ctx.startAt);
      if (e < 0) return;
      simTo(e);
      if (!O.boost.input(st, 'X', e, canBoost(st, cfg))) return;
      log.push([e, 'X']);
      B.ui.activated();
    }

    function rankNow() {
      const live = ctx.live();
      let r = 1;
      tr.list.forEach((p) => {
        if (p.me) return;
        const a = live[p.pid];
        if (!a) return;
        const sc = a[0] || 0;
        const ox = a[1] || 0;
        if (st.fin ? sc >= 50000 && sc > myScore() : (sc >= 50000 || ox > st.x)) r++;
      });
      return r;
    }

    return {
      start() { tr.follow(0, 1); },
      tick(t) {
        const e = t - ctx.startAt;
        const dt = Math.min(0.05, Math.max(0, (t - (lastT || t)) / 1000));
        lastT = t;
        starter.tick(t);
        simTo(e);
        meter.set(cfg.rate ? cfg.rate(st, e) : st.mash ? st.mash.rate(e) : 0);
        const live = ctx.live();
        // 1) 지금 모두의 상태
        const ents = {};
        tr.list.forEach((p) => {
          const A = tr.ath[p.pid];
          if (!A) return;
          let x; let v; let state; let extra;
          if (p.me) {
            x = st.x; v = st.v; state = st.fin ? 3 : (st.state || 0); extra = cfg.extra ? cfg.extra(st) : [];
          } else {
            const a = live[p.pid];
            const target = a ? a[1] || 0 : 0;
            const ex = (a && a[2]) || [];
            // 다른 폰의 선수는 부드럽게 따라가요 (AI 는 정확한 값)
            A.shown += (target - A.shown) * (p.bot ? 1 : Math.min(1, dt * 6));
            x = A.shown; v = ex[0] || 0; state = ex[1] || 0; extra = ex;
            if (a && a[0] >= 50000 && !fins[p.pid]) fins[p.pid] = Object.keys(fins).length + 1;
          }
          if (p.me && st.fin && !fins[p.pid]) fins[p.pid] = Object.keys(fins).length + 1;
          ents[p.pid] = { x, v, state, extra, fin: !!fins[p.pid] };
        });
        // 2) 화면에 보여줄 모습 (손맛 종목은 포토 피니시 때 잠깐 느린 화면)
        const view = J ? J.frame(e, dt, ents) : { e, a: ents, rate: 1 };
        const de = view.e;
        // 전광판 시계
        tr.setBoard(de < gun ? '0.00' : st.fin && de - gun >= st.fin ? (st.fin / 1000).toFixed(2) : ((de - gun) / 1000).toFixed(2));
        tr.list.forEach((p) => {
          const A = tr.ath[p.pid];
          const E = view.a[p.pid];
          if (!A || !E) return;
          A.ph += dt * view.rate * (cfg.phRate ? cfg.phRate(E.v) : 2.4 + E.v * 0.95);
          const info = { e: de, gun, x: E.x, v: E.v, state: E.state, fin: E.fin, me: p.me, extra: E.extra, ph: A.ph, st: p.me ? st : null };
          let pose = cfg.pose ? cfg.pose(info) : defaultPose(info);
          let px = E.x;
          if (J) { const r = J.pose(p, A, info, pose); pose = r.pose; px = r.x; }
          if (B) pose = B.draw(p, A, Object.assign({ e: de }, E), px, pose, dt * view.rate);
          tr.place(p.pid, px, pose, pose.lift || 0);
          tr.strip.set(p.pid, E.x / D);
        });
        const meE = view.a[me.pid];
        tr.follow(meE ? meE.x : st.x, dt || 0.016);
        if (J) J.after(e, dt, view);
        if (B) B.tick(t, e, dt, ents);
        if (cfg.tick) cfg.tick(tr, st, e, ctx, live);
        if (st.fin && !finSaid && (!J || (meE && meE.x >= D))) {
          finSaid = true;
          const r = rankNow();
          tr.say(`골인! ${(st.fin / 1000).toFixed(2)}초`, '#FFD23F', 2400);
          ctx.sfx.perfect();
          ctx.vibrate([30, 40, 90]);
          const box = ctx.stage.getBoundingClientRect();
          ctx.fx.burst(box.width * 0.4, box.height * 0.55, '#FFD23F', 26);
          ctx.setBadge(`${r}위`, r === 1 ? 'y' : 'b');
          if (J) J.finish(myScore(), r, e);
        } else if (!st.fin && e > gun) {
          ctx.setBadge(`${rankNow()}위`, 'b');
        }
        ctx.setScore(st.fin ? Math.round((100000 - myScore()) / 10) / 100 : Math.floor(st.x));
      },
      onPress(c, t) {
        const e = Math.round(t - ctx.startAt);   // 누른 기록과 똑같은 시각으로 계산해요 (유령·다시 계산이 딱 맞게)
        simTo(e);
        log.push([e, c]);
        if (B) B.chord.down(c, t);
        const r = cfg.sim.press(st, c, e, gun);
        if (J && r) J.press(r, e);
        if (r && r.say) tr.say(r.say, r.color || '#FF8B95', r.ms || 1200);
        if (r && r.sfx) ctx.sfx[r.sfx] && ctx.sfx[r.sfx]();
        if (r && r.vib) ctx.vibrate(r.vib);
      },
      onRelease(c, t) {
        const e = Math.round(t - ctx.startAt);
        simTo(e);
        log.push([e, c.toUpperCase()]);
        if (B) B.chord.up(c);
        if (cfg.sim.release) cfg.sim.release(st, c, e, gun);
      },
      onBoost(t) { fire(t); },
      end() { ended = true; if (B) B.ui.off(); if (J) J.destroy(); tr.destroy(); },
      done: () => !!st.fin && st.e - gun - st.fin > 1500,
      score: myScore,
      value: () => Math.round(st.x * 100) / 100,
      extra: () => extraOf(st, cfg),
      log: () => log,
      _st: () => st,
      summary: () => (st.fin ? `${(st.fin / 1000).toFixed(2)}초` : `${st.x.toFixed(1)}m 달림`)
    };
  }

  // 기본 자세: 출발 전 웅크림 → 달리기 → 들어오면 만세
  function defaultPose(i) {
    if (i.e < i.gun && i.x < 0.05) return O.P.set();
    if (i.state === 1) return O.P.set();
    if (i.fin && i.v < 3) return O.P.cheer(i.ph);
    return O.P.run(i.ph, Math.min(1, i.v / 10.5));
  }

  // 연타로 달리는 규칙 (100m·허들 공통): 아무 버튼이나 누르면 속도 +, 가만있으면 줄어요
  // 부정출발 (난이도마다 늦게 출발하는 시간이 달라요 · 이지는 부정출발 없음)
  function falseStart(st, gun, fallback) {
    const fs = st.dp ? st.dp.fs : fallback;
    if (!fs || st.waitUntil) return null;
    st.waitUntil = gun + fs;
    st.falseN = (st.falseN || 0) + 1;
    st.state = 1;
    return { say: `부정출발! ${fs / 1000}초 늦게 출발해요`, sfx: 'bad', vib: [40, 40, 40] };
  }
  function mashRunner(o) {
    const opt = Object.assign({ kick: 0.9, drag: 1.0, vmax: 12.2, falsePenalty: 1000 }, o || {});
    return {
      init() { return { mash: new O.Masher(), v: 0, x: 0, waitUntil: 0, state: 0, falseN: 0 }; },
      press(st, c, e, gun) {
        if (c !== 'r' && c !== 'b' && c !== 'g') return null;
        if (e < gun) return falseStart(st, gun, opt.falsePenalty);
        if (st.waitUntil && e < st.waitUntil) return null;
        const r = st.mash.press(c, e);
        if (r === 1) {
          st.v = Math.min(opt.vmax, st.v + opt.kick);
          O.boost.tap(st, e, 1);
          return { sfx: 'step', vib: 6 };
        }
        return null;
      },
      step(st, dt, e) {
        if (st.state === 1 && e >= st.waitUntil) st.state = 0;
        st.v *= Math.exp(-opt.drag * dt);
        st.x += st.v * dt * O.boost.k(st);
      }
    };
  }

  Object.assign(O, { raceEvent, mashRunner, falseStart, raceDefaultPose: defaultPose, SIM_STEP: STEP });
})();
