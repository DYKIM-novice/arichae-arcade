/* 아리채 오락실 · 올림픽관 '내려가기' 틀 (봅슬레이 · 알파인 회전)
   - 위에서 내려다보고, 코스가 화면 아래로 흘러와요 (앞 = 위)
   - 빨강 = 왼쪽, 파랑 = 오른쪽 으로 방향을 틀어요 (봅슬레이는 처음 출발 때 빨·파 연타로 밀기)
   - 규칙(sim)은 화면과 떨어진 순수 계산 (10ms 간격) · 누른 기록(log)도 남겨요
   - cfg.boost 가 있으면 필살기 부스터(boost.js) · 난이도는 ctx.diff → st.dp */
(function () {
  'use strict';
  const O = window.Oly;
  const G = window.Games;
  const STEP = O.SIM_STEP || 10;

  function downhillEvent(cfg) {
    const D = cfg.D;
    const def = {
      id: cfg.id, title: cfg.title, cat: cfg.cat, catColor: cfg.catColor, how: cfg.how, icon: cfg.icon,
      buttons: ['r', 'b'], rules: cfg.rules, illus: cfg.illus, noGo: true, pressSound: false,
      fmt: O.fmtTimeScore,
      rival(arr) {
        const sc = arr ? arr[0] : 0; const x = arr ? arr[1] || 0 : 0;
        if (sc >= 50000) return { sort: sc, text: O.fmtSec(100000 - sc) };
        return { sort: x, text: `${Math.floor(x)}m` };
      },
      botLive(perf, e, cur) {
        const gun = (cur.ev && cur.ev.gun) || 2400;
        const s = (e - gun - perf.react) / 1000;
        const pr = O.profile(D, perf.T / 1000, cfg.tau || 2.5);
        const fin = s * 1000 >= perf.T;
        const d = fin ? D + Math.min(20, (s - perf.T / 1000) * 8) : pr.pos(s);
        return [fin ? perf.score : 0, d, [Math.round(pr.speed(Math.max(0, s)) * 10) / 10, fin ? 3 : 0, Math.round(cfg.botLat(d) * 100) / 100]];
      },
      create(ctx) { return make(ctx, cfg); },
      // 혼자 연습: 저장해 둔 누른 기록으로 '내 최고 기록' 유령 썰매
      ghost(gctx, log) { return replay(gctx, log, cfg); },
      boost: !!cfg.boost,
      sim: cfg.sim, cfg
    };
    O.register(def);
    return def;
  }

  // 규칙을 e(ms)까지 10ms 씩 (화면 경기와 유령이 같은 계산) · say 는 화면이 있을 때만
  function stepper(st, cfg, gun, react) {
    const D = cfg.D;
    return function simTo(e) {
      while (st.e + STEP <= e) {
        st.e += STEP;
        if (st.fin) { st.v *= Math.exp(-1.5 * STEP / 1000); st.d += st.v * STEP / 1000; continue; }
        const r = cfg.sim.step(st, STEP / 1000, st.e, gun);
        O.boost.run(st, STEP, true);
        if (react) react(r);
        if (st.d >= D) st.fin = Math.max(1, st.e - gun) + (st.pen || 0);
      }
    };
  }
  // 규칙 상태: 난이도 값(dp) · 부스터(bo)
  function initSt(cfg, ctx) {
    const st = cfg.sim.init(ctx);
    st.e = 0; st.fin = 0;
    st.dp = O.diffP(ctx && ctx.diff);
    if (cfg.boost) st.bo = O.boost.make(cfg.boost, st.dp);
    return st;
  }
  const extraOf = (st, cfg) => {
    const a = [Math.round(st.v * 10) / 10, st.fin ? 3 : (st.state || 0), Math.round(st.lat * 100) / 100];
    if (cfg.boost) a.push(O.boost.code(st));
    return a;
  };
  function replay(gctx, log, cfg) {
    const D = cfg.D;
    const gun = (gctx.ev && gctx.ev.gun) || 2400;
    const st = initSt(cfg, gctx);
    const simTo = stepper(st, cfg, gun, null);
    const L = log || [];
    let i = 0;
    const score = () => (st.fin ? 100000 - st.fin : Math.round(Math.min(st.d, D - 0.01) * 100));
    return {
      at(e) {
        while (i < L.length && L[i][0] <= e) {
          const le = L[i][0]; const k = String(L[i][1]); i++;
          if (O.boost.isCode(k)) { simTo(le); O.boost.input(st, k, le, !st.fin); continue; }
          if (k !== k.toLowerCase()) continue;     // 떼기는 규칙에 안 써요 (화면 경기와 같게)
          simTo(le);
          cfg.sim.press(st, k, le, gun);
        }
        simTo(e);
        return [score(), Math.round(st.d * 100) / 100, extraOf(st, cfg)];
      },
      score,
      st
    };
  }

  function make(ctx, cfg) {
    const D = cfg.D;
    const gun = (ctx.ev && ctx.ev.gun) || 2400;
    const list = O.roster(ctx);
    ctx.stage.innerHTML = '';
    const wrap = G.kit.el(`<div class="oly-wrap odh ${cfg.cls || ''}"><div class="oly-top"></div><div class="oly-scene"></div><div class="oly-hud"></div><div class="oly-msg"></div></div>`);
    ctx.stage.appendChild(wrap);
    const scene = wrap.querySelector('.oly-scene');
    const hud = wrap.querySelector('.oly-hud');
    const msgEl = wrap.querySelector('.oly-msg');
    const strip = O.strip(wrap.querySelector('.oly-top'), list, `${D}m`);
    const meter = O.rateMeter(hud, cfg.meterLabel);
    const tip = G.kit.el('<div class="osh-tip"><span class="osh-st"></span><span class="osh-lap"></span><span class="osh-v"><em>0</em> km/h</span></div>');
    hud.prepend(tip);
    const tipSt = tip.querySelector('.osh-st'); const tipX = tip.querySelector('.osh-lap'); const tipV = tip.querySelector('.osh-v em');
    const svg = O.el('svg', { class: 'oly-svg' });
    scene.appendChild(svg);
    const snow = document.createElement('div'); snow.className = 'oly-snow'; scene.appendChild(snow);
    let Wd = 0; let Hd = 0; let px = 1; let py = 1; let meY = 0;
    let courseG = null; let objG = null; let tokG = null; let board = null; let BT = null;
    const tok = {};
    const BO = O.boost;
    function build() {
      Wd = Math.max(200, scene.clientWidth || 360); Hd = Math.max(200, scene.clientHeight || 360);
      svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`); svg.setAttribute('width', Wd); svg.setAttribute('height', Hd);
      px = Wd / (2 * cfg.halfView);
      py = px * cfg.yScale;
      meY = (Hd - (hud.offsetHeight || 60)) * 0.78;
      svg.innerHTML = `<rect width="${Wd}" height="${Hd}" fill="${cfg.bg}"/>`;
      courseG = O.el('g', {}); svg.appendChild(courseG);
      objG = O.el('g', {}); svg.appendChild(objG);
      const bl = O.el('g', { class: 'obs-trail' }); svg.appendChild(bl);
      BT = BO.trailer(bl, 36);
      tokG = O.el('g', {}); svg.appendChild(tokG);
      list.slice().reverse().forEach((p) => {
        const L = BO.look(p.athlete);
        const g = O.el('g', {}, (cfg.boost ? `<g class="obs-taura" display="none"><ellipse rx="${(0.9 * px).toFixed(1)}" ry="${(1.5 * px).toFixed(1)}" fill="${L.c}" opacity=".3"/><ellipse rx="${(1.05 * px).toFixed(1)}" ry="${(1.7 * px).toFixed(1)}" fill="none" stroke="${L.c}" stroke-width="2.5" stroke-dasharray="6 5"/></g>` : '') + cfg.token(O.ath(p.athlete), p.me, px));
        g.aura = g.querySelector('.obs-taura');
        if (!p.me) g.setAttribute('opacity', '0.55');
        tokG.appendChild(g);
        tok[p.pid] = g;
        if (p.me) g.parentNode.appendChild(g);   // 나는 맨 위에
      });
      board = O.el('text', { x: Wd - 10, y: 22, 'text-anchor': 'end', 'font-size': 16, 'font-weight': 900, fill: '#2A2340', 'font-family': 'system-ui,sans-serif' }, '');
      svg.appendChild(board);
    }
    const st = initSt(cfg, ctx);
    build();
    const ro = window.ResizeObserver ? new ResizeObserver(() => { if (scene.clientWidth !== Wd || scene.clientHeight !== Hd) build(); }) : null;
    if (ro) ro.observe(scene);
    const log = [];
    let lastT = 0; let msgT = 0; let finSaid = false; let stage = -1;
    const shown = {};
    function say(t, c, ms) { msgEl.textContent = t; msgEl.style.color = c || '#fff'; msgEl.classList.remove('show'); void msgEl.offsetWidth; msgEl.classList.add('show'); clearTimeout(msgT); if (ms !== 0) msgT = setTimeout(() => msgEl.classList.remove('show'), ms || 1100); }
    function react(r) { if (!r) return; if (r.say) say(r.say, r.color, r.ms); if (r.sfx && ctx.sfx[r.sfx]) ctx.sfx[r.sfx](); if (r.vib) ctx.vibrate(r.vib); }
    const simTo = stepper(st, cfg, gun, react);
    // 필살기 부스터 (게이지 · 큰 버튼 · 빨강+파랑 꾹)
    const meP = list.find((p) => p.me) || list[0];
    const clk = BO.clock(ctx);
    const chord = BO.chord();
    const BU = cfg.boost ? BO.ui(ctx, { wrap, scene, ath: meP.athlete, onFire: () => fire(clk.now()) }) : null;
    const bWas = {};
    let ended = false; let lastM = -1e9;
    function fire(t) {
      if (!BU || ended) return;
      const e = Math.round(t - ctx.startAt);
      if (e < 0) return;
      simTo(e);
      if (!BO.input(st, 'X', e, !st.fin)) return;
      log.push([e, 'X']);
      BU.activated();
    }
    // 화면 좌표: 가로 = 옆(m), 세로 = 앞뒤 (앞이 위)
    const SX = (lat) => Wd / 2 + (lat - camLat) * px;
    const SY = (d) => meY - (d - st.d) * py;
    let camLat = 0;
    function drawCourse() {
      const d0 = st.d - (Hd - meY) / py - 4; const d1 = st.d + meY / py + 6;
      courseG.innerHTML = cfg.drawCourse(d0, d1, SX, SY, px, py, Wd, Hd, st);
      objG.innerHTML = cfg.drawObjects ? cfg.drawObjects(d0, d1, SX, SY, px, st) : '';
    }
    return {
      start() {},
      tick(t) {
        const e = t - ctx.startAt;
        const dt = Math.min(0.05, Math.max(0, (t - (lastT || t)) / 1000));
        lastT = t;
        const kk = e < gun - 1100 ? 0 : e < gun ? 1 : 2;
        if (kk !== stage) { stage = kk; if (kk === 0) say('준비…', '#2A2340', 0); if (kk === 1) say('차렷!', '#C99A00', 0); if (kk === 2) { say('출발!', '#FF4757', 700); ctx.sfx.go(); ctx.vibrate(60); } }
        simTo(e);
        clk.seen(t);
        if (BU) { BU.update(st, e, ended || !!st.fin); if (chord.check(t)) fire(t); }
        camLat += ((cfg.camLat ? cfg.camLat(st) : st.lat) - camLat) * Math.min(1, dt * 5);
        drawCourse();
        meter.set(st.mash ? st.mash.rate(e) : 0);
        tipSt.textContent = cfg.tip(st, e, gun);
        tip.className = 'osh-tip ' + (cfg.tipClass ? cfg.tipClass(st) : '');
        tipX.textContent = cfg.tipMid ? cfg.tipMid(st) : `${Math.floor(st.d)}/${D}m`;
        tipV.textContent = Math.round(st.v * 3.6);
        board.textContent = e < gun ? '0.00' : st.fin ? (st.fin / 1000).toFixed(2) : ((e - gun) / 1000).toFixed(2);
        const live = ctx.live();
        let rank = 1;
        list.forEach((p) => {
          let d; let lat; let ang; let bon = false;
          if (p.me) { d = st.d; lat = st.lat; ang = cfg.angle(st.latv || 0, st.v); bon = BO.active(st); }
          else {
            const a = live[p.pid];
            const ex = (a && a[2]) || [];
            const target = a ? a[1] || 0 : 0;
            const sh = shown[p.pid] || (shown[p.pid] = { d: target, lat: ex[2] || 0 });
            sh.d += (target - sh.d) * (p.bot ? 1 : Math.min(1, dt * 6));
            sh.lat += ((ex[2] || 0) - sh.lat) * Math.min(1, dt * 6);
            d = sh.d; lat = sh.lat; ang = 0;
            // 다른 선수 부스터: 다른 폰·유령은 진짜 값(덧붙임 4번째), AI 는 흉내
            if (cfg.boost) {
              if (p.bot && !p.ghost) { const bw = BO.botWindow(ctx.seed, p.pid); const f = d / D; bon = f > bw[0] && f < bw[1] && (ex[1] || 0) !== 3; } else bon = ex[3] === 2;
              if (bon && !bWas[p.pid]) BU.remote(p.athlete, p.ghost ? '내 최고' : p.name);
              bWas[p.pid] = bon;
            }
            const sc = a ? a[0] || 0 : 0;
            if (st.fin ? sc >= 50000 && sc > 100000 - st.fin : (sc >= 50000 || target > st.d)) rank++;
          }
          const g = tok[p.pid];
          if (!g) return;
          const y = SY(d);
          g.style.display = y < -40 || y > Hd + 40 ? 'none' : '';
          g.setAttribute('transform', `translate(${SX(lat).toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})`);
          if (g.aura) {
            if (bon !== !!g.bOn) { g.bOn = bon; g.aura.setAttribute('display', bon ? 'inline' : 'none'); }
            if (bon && y > -40 && y < Hd + 40) {
              g.aura.setAttribute('transform', `scale(${(1 + 0.08 * Math.sin(e / 60)).toFixed(3)})`);
              BT.emit(p.athlete, p.pid, SX(lat), y + 1.1 * px, -Math.PI / 2, px / 40, p.me, dt);
            }
          }
          strip.set(p.pid, d / D);
        });
        if (BT) BT.tick(dt);
        // 역전 장치: 0.4초마다 순위로 게이지 배율 (바뀌면 누른 기록에) — 유령은 빼고 세요
        if (cfg.boost && !st.fin && e > gun + 300 && e - lastM >= 400) {
          lastM = e;
          const n = list.filter((p) => !p.ghost).length;
          let r = 1;
          list.forEach((p) => { if (p.me || p.ghost) return; const a = live[p.pid]; const sc = a ? a[0] || 0 : 0; if (sc >= 50000 || (a ? a[1] || 0 : 0) > st.d) r++; });
          const m = BO.mulFor(r, n);
          if (m !== st.bo.mul) { const er = Math.round(e); simTo(er); log.push([er, 'M' + m]); BO.input(st, 'M' + m, er); }
        }
        if (e > gun) ctx.setBadge(`${rank}위`, rank === 1 ? 'y' : 'b');
        ctx.setScore(st.fin ? Math.round(st.fin / 10) / 100 : Math.floor(st.d));
        if (st.fin && !finSaid) { finSaid = true; say(`골인! ${(st.fin / 1000).toFixed(2)}초`, '#C99A00', 2400); ctx.sfx.perfect(); ctx.vibrate([30, 40, 90]); }
      },
      onPress(c, t) { const e = Math.round(t - ctx.startAt); simTo(e); log.push([e, c]); chord.down(c, t); react(cfg.sim.press(st, c, e, gun)); },
      onRelease(c, t) { const e = Math.round(t - ctx.startAt); log.push([e, c.toUpperCase()]); chord.up(c); },
      onBoost(t) { fire(t); },
      end() { ended = true; if (BU) BU.off(); if (ro) ro.disconnect(); clearTimeout(msgT); },
      done: () => !!st.fin && st.e - gun - (st.fin - (st.pen || 0)) > 1500,
      score: () => (st.fin ? 100000 - st.fin : Math.round(Math.min(st.d, D - 0.01) * 100)),
      value: () => Math.round(st.d * 100) / 100,
      extra: () => extraOf(st, cfg),
      log: () => log,
      _st: () => st,
      summary: () => (st.fin ? `${(st.fin / 1000).toFixed(2)}초${cfg.sumExtra ? cfg.sumExtra(st) : ''}` : `${Math.floor(st.d)}m`)
    };
  }

  Object.assign(O, { downhillEvent });
})();
