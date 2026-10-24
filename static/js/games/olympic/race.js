/* 아리채 오락실 · 올림픽관 '레인 경주' 틀 (100m 달리기 · 110m 허들 · 수영 50m)
   - 종목 파일은 규칙(sim)과 자세(pose)만 정하고, 경기장·출발 신호·AI·순위·기록은 여기서 해요
   - 규칙(sim)은 화면과 따로 떨어진 순수 계산이에요. 누른 기록(log)만 있으면 같은 결과가 나와서
     나중에 서버가 다시 계산해 점수를 확인할 수 있어요 (공개 대회용)
   시간: e = 경기 시작(startAt)부터 ms, gun = 출발 총 (서버가 정해 모두 같아요) */
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
        const x = fin ? D + Math.min(6, (s - perf.T / 1000) * 3) : pr.pos(s);
        const extra = [Math.round(pr.speed(Math.max(0, s)) * 100) / 100, fin ? 3 : 0];
        if (cfg.botExtra) cfg.botExtra(perf, s, x, extra);
        return [fin ? perf.score : 0, x, extra];
      },
      create(ctx) { return makeRace(ctx, cfg); }
    };
    O.register(def);
    return def;
  }

  function makeRace(ctx, cfg) {
    const D = cfg.D;
    const gun = (ctx.ev && ctx.ev.gun) || 2400;
    const tr = new O.Track(ctx, {
      D, surface: cfg.surface || 'track', view: cfg.view || 13, marks: cfg.marks || 10,
      laneExtras: cfg.laneExtras, marksExtra: cfg.marksExtra, stripLabel: cfg.stripLabel, afterBuild: cfg.afterBuild
    });
    const meter = cfg.noMeter ? { set() {} } : O.rateMeter(tr.hud, cfg.meterLabel);
    if (cfg.hud) cfg.hud(tr, ctx);
    tr.build(true, true);   // HUD 높이만큼 레인을 올려요
    const starter = O.starter(tr, ctx);
    const st = cfg.sim.init(ctx);
    st.x = st.x || 0; st.v = st.v || 0; st.fin = 0; st.e = 0;
    const log = [];
    let lastT = 0;
    let finSaid = false;
    const me = tr.list.find((p) => p.me);
    const fins = {};      // pid → 들어온 순서

    function simTo(e) {
      while (st.e + STEP <= e) {
        st.e += STEP;
        if (!st.fin) {
          cfg.sim.step(st, STEP / 1000, st.e, gun);
          if (st.x >= D) {
            st.fin = Math.max(1, st.e - gun);
            st.x = D;
          }
        } else {
          // 들어온 뒤에는 천천히 멈춰요
          st.v *= Math.exp(-2.2 * STEP / 1000);
          st.x += st.v * STEP / 1000;
        }
      }
    }

    function myScore() { return st.fin ? 100000 - st.fin : Math.round(st.x * 100); }

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
        // 전광판 시계
        tr.setBoard(e < gun ? '0.00' : st.fin ? (st.fin / 1000).toFixed(2) : ((e - gun) / 1000).toFixed(2));
        const live = ctx.live();
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
          A.ph += dt * (2.4 + v * 0.95);
          const info = { e, gun, x, v, state, fin: !!fins[p.pid], me: p.me, extra, ph: A.ph, st: p.me ? st : null };
          const pose = cfg.pose ? cfg.pose(info) : defaultPose(info);
          tr.place(p.pid, x, pose, pose.lift || 0);
          tr.strip.set(p.pid, x / D);
        });
        tr.follow(st.x, dt || 0.016);
        if (cfg.tick) cfg.tick(tr, st, e, ctx, live);
        if (st.fin && !finSaid) {
          finSaid = true;
          const r = rankNow();
          tr.say(`골인! ${(st.fin / 1000).toFixed(2)}초`, '#FFD23F', 2400);
          ctx.sfx.perfect();
          ctx.vibrate([30, 40, 90]);
          const box = ctx.stage.getBoundingClientRect();
          ctx.fx.burst(box.width * 0.4, box.height * 0.55, '#FFD23F', 26);
          ctx.setBadge(`${r}위`, r === 1 ? 'y' : 'b');
        } else if (!st.fin && e > gun) {
          ctx.setBadge(`${rankNow()}위`, 'b');
        }
        ctx.setScore(st.fin ? Math.round((100000 - myScore()) / 10) / 100 : Math.floor(st.x));
      },
      onPress(c, t) {
        const e = t - ctx.startAt;
        simTo(e);
        log.push([Math.round(e), c]);
        const r = cfg.sim.press(st, c, e, gun);
        if (r && r.say) tr.say(r.say, r.color || '#FF8B95', r.ms || 1200);
        if (r && r.sfx) ctx.sfx[r.sfx] && ctx.sfx[r.sfx]();
        if (r && r.vib) ctx.vibrate(r.vib);
      },
      onRelease(c, t) {
        const e = t - ctx.startAt;
        simTo(e);
        log.push([Math.round(e), c.toUpperCase()]);
        if (cfg.sim.release) cfg.sim.release(st, c, e, gun);
      },
      end() { tr.destroy(); },
      done: () => !!st.fin && st.e - gun - st.fin > 1500,
      score: myScore,
      value: () => Math.round(st.x * 100) / 100,
      extra: () => [Math.round(st.v * 100) / 100, st.fin ? 3 : (st.state || 0)].concat(cfg.extra ? cfg.extra(st) : []),
      log: () => log,
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

  // 연타로 달리는 규칙 (100m·허들 공통): 번갈아 누르면 속도 +, 가만있으면 줄어요
  function mashRunner(o) {
    const opt = Object.assign({ kick: 0.9, drag: 1.0, vmax: 12.2, falsePenalty: 1000 }, o || {});
    return {
      init() { return { mash: new O.Masher(66), v: 0, x: 0, waitUntil: 0, state: 0, falseN: 0 }; },
      press(st, c, e, gun) {
        if (c !== 'r' && c !== 'b') return null;
        if (e < gun) {
          if (!st.waitUntil) {
            st.waitUntil = gun + opt.falsePenalty;
            st.falseN += 1;
            st.state = 1;
            return { say: '부정출발! 1초 늦게 출발해요', sfx: 'bad', vib: [40, 40, 40] };
          }
          return null;
        }
        if (st.waitUntil && e < st.waitUntil) return null;
        const r = st.mash.press(c, e);
        if (r === 1) {
          st.v = Math.min(opt.vmax, st.v + opt.kick);
          return { sfx: 'step', vib: 6 };
        }
        return null;
      },
      step(st, dt, e) {
        if (st.state === 1 && e >= st.waitUntil) st.state = 0;
        st.v *= Math.exp(-opt.drag * dt);
        st.x += st.v * dt;
      }
    };
  }

  Object.assign(O, { raceEvent, mashRunner, raceDefaultPose: defaultPose, SIM_STEP: STEP });
})();
