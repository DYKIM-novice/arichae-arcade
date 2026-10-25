/* 아리채 오락실 · 올림픽관 '도움닫기 + 각도' 틀 (멀리뛰기 · 창던지기)
   - 빨·파 연타로 도움닫기 → 초록을 누르고 있으면 각도가 올라가요 → 떼는 순간 뛰기/던지기
   - 선(발구름판·파울선)을 넘으면 파울. 3번 해서 가장 좋은 기록
   - 규칙(sim)은 화면과 떨어진 순수 계산 (누른 기록만 있으면 서버가 다시 계산할 수 있어요) */
(function () {
  'use strict';

  const O = window.Oly;
  const STEP = O.SIM_STEP || 10;
  const TRIES = 3;
  const READY = 900;       // 시도 사이 준비 시간(ms)
  const SHOW = 2300;       // 기록 보여주는 시간(ms)
  const BOT_CYCLE = 11000; // AI 한 번 시도 간격(ms) — 서버 olympic.py 와 같아요
  const BOT_START = 1500;

  // 연타 도움닫기 + 각도 잡기 + 날아가기
  function makeSim(cfg) {
    return {
      init(ctx) {
        return { att: 0, ph: 'ready', phT: 0, x: 0, v: 0, ang: 0, holdT: 0, mash: new O.Masher(), fx: 0, fT: 0, fd: 0, fv: 0, fa: 0, tries: [], best: 0, foul: 0, done: false, dp: O.diffP(ctx && ctx.diff) };
      },
      press(st, c, e) {
        if (st.done) return null;
        if (st.ph === 'run' || st.ph === 'ready') {
          if (c === 'g') {
            if (st.ph !== 'run' || st.x < 2) return null;
            st.ph = 'hold'; st.phT = e; st.holdT = e; st.ang = 0;
            return { sfx: 'tick', vib: 10 };
          }
          if (st.ph === 'ready') return null;
          if (st.mash.press(c, e) === 1) { st.v = Math.min(cfg.vmax, st.v + cfg.kick); return { sfx: 'step', vib: 5 }; }
          return null;
        }
        if (st.ph === 'hold' && (c === 'r' || c === 'b')) {
          if (st.mash.press(c, e) === 1) st.v = Math.min(cfg.vmax, st.v + cfg.kick * 0.5);
        }
        return null;
      },
      release(st, c, e) {
        if (c !== 'g' || st.ph !== 'hold') return null;
        return launch(st, e, cfg);
      },
      step(st, dt, e) {
        if (st.done) return null;
        let out = null;
        if (st.ph === 'ready' && e - st.phT >= READY) { st.ph = 'run'; st.phT = e; st.mash = new O.Masher(66); out = { say: `${st.att + 1}번째 시도!`, color: '#FFE27A' }; }
        if (st.ph === 'run' || st.ph === 'hold') {
          if (st.ph === 'run') st.v *= Math.exp(-1.0 * dt);   // 각도 잡는 동안(초록 꾹)은 속도가 그대로예요 (느려지지 않아요)
          st.x += st.v * dt;
          if (st.ph === 'hold') st.ang = Math.min(cfg.maxAng, (e - st.holdT) * cfg.angSpeed * st.dp.fdAng / 1000);
          // 각도를 잡는 중(초록 꾹)에 선에 닿으면 저절로 휙! (이지·노멀) · 하드·헬은 그대로 파울 조심
          if (st.ph === 'hold' && st.dp.fdAuto && st.x >= cfg.LINE) {
            st.x = cfg.LINE;
            const r = launch(st, e, cfg);
            return Object.assign(r, { say: '선에서 저절로 휙!', color: '#7DF0AE' });
          }
          // 선을 한참 넘어가면 파울
          if (st.x > cfg.LINE + 0.6 + st.dp.fdGrace) { foul(st, e); out = { say: '파울! 선을 넘었어요', color: '#FF8B95', sfx: 'bad' }; }
        } else if (st.ph === 'air') {
          const f = (e - st.fT) / (st.fdur * 1000);
          if (f >= 1) {
            st.ph = 'land'; st.phT = e;
            const cm = Math.max(0, Math.round(st.fd * 100));
            st.tries.push(cm);
            st.best = Math.max(st.best, cm);
            out = { say: `${(cm / 100).toFixed(2)}m!`, color: '#FFD23F', sfx: 'perfect', land: true };
          }
        } else if (st.ph === 'land' || st.ph === 'foul') {
          // 내려온 뒤 천천히 멈춰요
          st.v *= Math.exp(-3 * dt);
          if (st.ph === 'foul') st.x += st.v * dt;
          if (e - st.phT >= SHOW) {
            st.att += 1;
            if (st.att >= TRIES) { st.done = true; st.doneT = e; } else { st.ph = 'ready'; st.phT = e; st.x = 0; st.v = 0; st.ang = 0; }
          }
        }
        if (cfg.stepAir && st.ph === 'land') cfg.stepAir(st, dt);
        return out;
      }
    };
  }
  function foul(st, e) {
    st.ph = 'foul'; st.phT = e; st.foul += 1; st.tries.push(0);
  }
  function launch(st, e, cfg) {
    const grace = st.dp ? st.dp.fdGrace : 0;     // 이지: 선을 살짝 밟아도 봐줘요
    if (st.x > cfg.LINE + grace) { foul(st, e); return { say: '파울! 선을 밟았어요', color: '#FF8B95', sfx: 'bad', vib: [40, 30, 40] }; }
    const a = Math.max(5, st.ang);
    st.ph = 'air'; st.fT = e; st.fx = st.x; st.fv = st.v; st.fa = a;
    // 기록은 선에서부터 잰 거리
    st.fd = cfg.dist(st.v, a) - (cfg.LINE - Math.min(cfg.LINE, st.x));
    st.fdur = cfg.flightT(st.v, a);
    return { sfx: 'whoosh', vib: 20 };
  }

  // AI 선수: 서버가 정한 시도(속도·각도·거리·파울)대로
  function botState(cfg, perf, e) {
    const k = Math.floor((e - BOT_START) / BOT_CYCLE);
    if (e < BOT_START || k >= TRIES) {
      const best = (perf.tries || []).slice(0, Math.max(0, Math.min(TRIES, k))).reduce((m, t) => Math.max(m, t.d), 0);
      return { att: Math.min(TRIES, Math.max(0, k)), ph: e < BOT_START ? 'ready' : 'done', x: 0, v: 0, ang: 0, best, last: 0, foul: 0 };
    }
    const t = perf.tries[k];
    const best = perf.tries.slice(0, k).reduce((m, q) => Math.max(m, q.d), 0);
    const s = (e - BOT_START - k * BOT_CYCLE - 700) / 1000;
    const pr = O.profile(1000, 10, 1.2);
    // 도움닫기: 속도 t.v 로 선까지 (곡선 모양만 빌려 써요)
    const V = t.v;
    const pos = (q) => (q <= 0 ? 0 : V * (q - 1.2 * (1 - Math.exp(-q / 1.2))));
    let sb = 0;
    while (pos(sb) < cfg.LINE - 0.25 && sb < 12) sb += 0.02;
    const holdS = 0.45;
    const out = { att: k, x: 0, v: 0, ang: 0, best, last: 0, foul: 0 };
    if (s < 0) return Object.assign(out, { ph: 'ready' });
    if (t.f) {
      // 파울: 선을 넘어 달려가요
      if (s < sb + 0.4) return Object.assign(out, { ph: s > sb - holdS ? 'hold' : 'run', x: pos(s), v: V, ang: Math.min(t.a, (s - (sb - holdS)) * cfg.angSpeed) });
      return Object.assign(out, { ph: 'foul', x: cfg.LINE + 0.8, v: 0, foul: 1, last: 0 });
    }
    if (s < sb - holdS) return Object.assign(out, { ph: 'run', x: pos(s), v: V * (1 - Math.exp(-Math.max(0, s) / 1.2)) });
    if (s < sb) return Object.assign(out, { ph: 'hold', x: pos(s), v: V, ang: Math.min(t.a, (s - (sb - holdS)) * cfg.angSpeed) });
    const fdur = cfg.flightT(V, t.a);
    const f = (s - sb) / fdur;
    const x0 = pos(sb);
    const d = t.d / 100;
    if (f < 1) return Object.assign(out, { ph: 'air', x: x0, v: V, ang: t.a, f, fx: x0, fd: d });
    return Object.assign(out, { ph: 'land', x: x0, v: 0, ang: t.a, f: 1, fx: x0, fd: d, last: t.d, best: Math.max(best, t.d) });
  }

  const PHC = { ready: 0, run: 1, hold: 2, air: 3, land: 4, foul: 5, done: 6 };
  const PHN = ['ready', 'run', 'hold', 'air', 'land', 'foul', 'done'];

  function fieldEvent(cfg) {
    const sim = makeSim(cfg);
    const def = {
      id: cfg.id, title: cfg.title, cat: cfg.cat, catColor: cfg.catColor, how: cfg.how, icon: cfg.icon,
      buttons: ['r', 'g', 'b'], rules: cfg.rules, illus: cfg.illus, noGo: true, pressSound: false,
      fmt: O.fmtM,
      rival(arr) {
        const best = arr ? arr[0] || 0 : 0;
        const ex = (arr && arr[2]) || [];
        return { sort: best, text: best ? O.fmtM(best) : `${(ex[0] || 0) + 1 > TRIES ? TRIES : (ex[0] || 0) + 1}번째` };
      },
      botLive(perf, e) {
        const b = botState(cfg, perf, e);
        // [최고 기록, 지금 x, [시도, 단계, 각도, 날기(0~1), 거리cm, 파울]]
        return [b.best, b.x, [b.att, PHC[b.ph], Math.round(b.ang), Math.round((b.f || 0) * 100) / 100, b.ph === 'air' || b.ph === 'land' ? Math.round((b.fd || 0) * 100) : 0, b.foul || 0]];
      },
      create(ctx) { return makeField(ctx, cfg, sim); },
      // 혼자 연습: 저장해 둔 누른 기록으로 '내 최고 기록' 유령 선수
      ghost(gctx, log) { return replayField(sim, log, gctx); },
      sim, cfg
    };
    O.register(def);
    return def;
  }

  // 지금 상태 → 화면에 보낼 값 (내 선수 · 유령이 같이 써요)
  function infoOf(st) {
    const f = st.ph === 'air' ? Math.min(1, (st.e - st.fT) / (st.fdur * 1000)) : st.ph === 'land' ? 1 : 0;
    return { att: st.att, ph: st.ph, x: st.x, v: st.v, ang: st.ang, f, fx: st.fx, fd: st.fd, best: st.best, foul: st.ph === 'foul' ? 1 : 0, last: st.tries[st.tries.length - 1] || 0 };
  }
  function extraOf(I) {
    return [I.att, PHC[I.ph] || 0, Math.round(I.ang), Math.round(I.f * 100) / 100, I.ph === 'air' || I.ph === 'land' ? Math.round(I.fd * 100) : 0, I.foul];
  }
  function replayField(sim, log, gctx) {
    const st = sim.init(gctx);
    st.e = 0;
    const L = log || [];
    let i = 0;
    const simTo = (e) => { while (st.e + STEP <= e) { st.e += STEP; sim.step(st, STEP / 1000, st.e); } };
    return {
      at(e) {
        while (i < L.length && L[i][0] <= e) {
          const le = L[i][0]; const k = String(L[i][1]); i++;
          simTo(le);
          const c = k.toLowerCase();
          if (k !== c) sim.release(st, c, le); else sim.press(st, c, le);
        }
        simTo(e);
        const I = infoOf(st);
        return [st.best, Math.round(st.x * 100) / 100, extraOf(I)];
      },
      score: () => st.best
    };
  }

  // '각도 구간': 선 앞 이 구간에서 초록을 꾹 누르기 시작하면 딱 좋아요 (모든 레인에 노란 띠 + 글자)
  const ZONE = [5, 3];          // 선에서 몇 m 앞부터 몇 m 앞까지 (1초에 9~11번 칠 때 45도쯤 되는 곳)
  function zoneSVG(tr, cfg) {
    const p = tr.ppm; const top = tr.trackTop; const x0 = (cfg.LINE - ZONE[0]) * p; const x1 = (cfg.LINE - ZONE[1]) * p;
    const h = tr.H - top;
    let s = `<g class="ofd-zone"><rect x="${x0.toFixed(1)}" y="${top}" width="${(x1 - x0).toFixed(1)}" height="${h.toFixed(1)}" fill="rgba(255,210,63,.22)"/>`;
    s += `<rect x="${x0.toFixed(1)}" y="${top}" width="3" height="${h.toFixed(1)}" fill="#FFD23F"/><rect x="${(x1 - 3).toFixed(1)}" y="${top}" width="3" height="${h.toFixed(1)}" fill="#FFD23F" opacity=".7"/>`;
    for (let y = top + 10; y < tr.H; y += 22) s += `<path d="M${(x0 + 8).toFixed(1)} ${y} l7 6 l-7 6" fill="none" stroke="#FFD23F" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>`;
    s += `<g transform="translate(${((x0 + x1) / 2).toFixed(1)} ${top - 1})"><rect x="-44" y="-12" width="88" height="17" rx="8.5" fill="#FFD23F"/><text y="1.5" text-anchor="middle" font-size="10" font-weight="900" fill="#2A2340" font-family="system-ui,sans-serif">각도 구간 · 초록 꾹</text></g></g>`;
    return s;
  }

  function makeField(ctx, cfg, sim) {
    const tr = new O.Track(ctx, {
      D: cfg.D, surface: 'runway', view: cfg.view, marks: 1000, finish: false, start: true, camLead: cfg.camLead || 0.3,
      camMin: -2, camMax: cfg.camMax, strip: false,
      marksExtra: (t) => (cfg.marksExtra ? cfg.marksExtra(t) : '') + zoneSVG(t, cfg), afterBuild: cfg.afterBuild
    });
    const meter = O.rateMeter(tr.hud);
    const gauge = angleGauge(tr.hud);
    tr.build(true, true);
    const st = sim.init(ctx);
    const log = [];
    let lastT = 0;
    const flags = {};    // pid → 마지막 표시한 시도 기록

    function simTo(e) {
      while ((st.e || 0) + STEP <= e) {
        st.e = (st.e || 0) + STEP;
        const r = sim.step(st, STEP / 1000, st.e);
        if (r) react(r);
      }
    }
    function react(r) {
      if (r.say) tr.say(r.say, r.color, r.land ? 2000 : 1300);
      if (r.sfx && ctx.sfx[r.sfx]) ctx.sfx[r.sfx]();
      if (r.vib) ctx.vibrate(r.vib);
      if (r.land) {
        ctx.vibrate([30, 40, 80]);
        const box = ctx.stage.getBoundingClientRect();
        ctx.fx.burst(box.width * 0.5, box.height * 0.5, '#FFD23F', 18);
      }
    }
    const meInfo = () => infoOf(st);
    return {
      start() { tr.follow(0, 1); },
      tick(t) {
        const e = t - ctx.startAt;
        const dt = Math.min(0.05, Math.max(0, (t - (lastT || t)) / 1000));
        lastT = t;
        simTo(e);
        meter.set(st.mash ? st.mash.rate(e) : 0);
        gauge.set(st.ph === 'hold' || st.ph === 'air' ? (st.ph === 'air' ? st.fa : st.ang) : null, cfg.bestAng);
        tr.setBoard(st.done ? '끝' : `${Math.min(TRIES, st.att + 1)}/${TRIES}번째`);
        const live = ctx.live();
        let camX = 0;
        tr.list.forEach((p) => {
          const A = tr.ath[p.pid];
          if (!A) return;
          let I;
          if (p.me) I = meInfo();
          else {
            const a = live[p.pid];
            const ex = (a && a[2]) || [];
            const target = a ? a[1] || 0 : 0;
            A.shown += (target - A.shown) * (p.bot ? 1 : Math.min(1, dt * 7));
            I = { att: ex[0] || 0, ph: PHN[ex[1] || 0], x: A.shown, v: 0, ang: ex[2] || 0, f: ex[3] || 0, fx: A.shown, fd: (ex[4] || 0) / 100, best: a ? a[0] : 0, foul: ex[5] || 0, last: ex[4] || 0 };
            I.v = I.ph === 'run' || I.ph === 'hold' ? 8 : 0;
          }
          if (p.me) A.v = st.v; else A.v = I.v;
          A.ph += dt * (2.4 + (I.v || 0) * 0.95);
          const r = cfg.render(tr, A, p, I, dt);
          if (p.me) camX = r && r.cam != null ? r.cam : I.x;
          // 기록 깃발 (시도마다)
          const key = `${I.att}:${I.ph}`;
          if ((I.ph === 'land' || I.ph === 'foul') && flags[p.pid] !== key) {
            flags[p.pid] = key;
            cfg.flag(tr, A, p, I);
          }
        });
        tr.follow(camX, dt || 0.016);
        ctx.setScore(st.best ? Math.round(st.best) / 100 : 0);
        // 내 순위 (최고 기록으로)
        let r = 1;
        tr.list.forEach((p) => { if (!p.me && live[p.pid] && (live[p.pid][0] || 0) > st.best) r++; });
        if (st.best || e > 20000) ctx.setBadge(`${r}위`, r === 1 ? 'y' : 'b');
      },
      onPress(c, t) {
        const e = t - ctx.startAt;
        simTo(e);
        log.push([Math.round(e), c]);
        const r = sim.press(st, c, e);
        if (r) react(r);
      },
      onRelease(c, t) {
        const e = t - ctx.startAt;
        simTo(e);
        log.push([Math.round(e), c.toUpperCase()]);
        const r = sim.release(st, c, e);
        if (r) react(r);
      },
      end() { tr.destroy(); },
      done: () => st.done && st.e - st.doneT > 600,
      score: () => st.best,
      value: () => Math.round(st.x * 100) / 100,
      extra: () => extraOf(meInfo()),
      log: () => log,
      summary: () => (st.best ? `최고 ${O.fmtM(st.best)}` : '기록 없음 (모두 파울)')
    };
  }

  /* ---------- 각도 바늘 (누르고 있는 동안 올라가요) ---------- */
  function angleGauge(box) {
    const w = window.Games.kit.el(`<div class="ofd-gauge"><svg viewBox="-50 -48 100 54"><path d="M-40 0 A40 40 0 0 1 40 0" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="8"/><path class="ofd-best" d="" fill="none" stroke="#2ED573" stroke-width="8"/><line class="ofd-needle" x1="0" y1="0" x2="40" y2="0" stroke="#FFD23F" stroke-width="4" stroke-linecap="round"/><circle r="5" fill="#FFD23F"/><text class="ofd-num" x="0" y="-14" text-anchor="middle" font-size="15" font-weight="900" fill="#fff" font-family="system-ui,sans-serif"></text></svg><span>초록을 꾹 → 떼면 휙!</span></div>`);
    box.appendChild(w);
    const needle = w.querySelector('.ofd-needle');
    const num = w.querySelector('.ofd-num');
    const best = w.querySelector('.ofd-best');
    let bestSet = false;
    return {
      set(a, bestAng) {
        if (!bestSet && bestAng) {
          bestSet = true;
          const pt = (d) => [Math.cos(d * Math.PI / 180) * 40, -Math.sin(d * Math.PI / 180) * 40];
          const [x1, y1] = pt(bestAng[0]); const [x2, y2] = pt(bestAng[1]);
          best.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)} A40 40 0 0 0 ${x2.toFixed(1)} ${y2.toFixed(1)}`);
        }
        w.classList.toggle('on', a != null);
        if (a == null) return;
        const r = a * Math.PI / 180;
        needle.setAttribute('x2', (Math.cos(r) * 40).toFixed(1));
        needle.setAttribute('y2', (-Math.sin(r) * 40).toFixed(1));
        num.textContent = `${Math.round(a)}°`;
      }
    };
  }

  Object.assign(O, { fieldEvent, FIELD_TRIES: TRIES });
})();
