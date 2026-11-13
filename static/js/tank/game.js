/* 노을언덕 포격대 · 게임 화면
   - 서버 스냅샷(15Hz)을 약 2틱 뒤로 보간해 그림. 폭발·발사·사망 이벤트도 같은 시간선(k)에 맞춰 적용
   - 클라는 입력(이동 -1/0/1, 포신 각도·파워, 발사)만 보냄. 위치·기울기·탄도·데미지는 모두 서버 값
   - 그리는 순서: 하늘 → 지형 → 탱크 → 체력바·닉네임 → 포탄·꼬리 → 폭발 → 각도 호·화살표 → (DOM) HUD·버튼 */
(function () {
  'use strict';
  const Art = window.TankArt, Net = window.TankNet, SND = window.TankSFX;
  const $ = (s) => document.querySelector(s);
  const TICK = 1000 / 15, DELAY = 2.2, WW = 2400, WH = 1200;
  const KN = { mongdol: '몽돌', mangru: '망루' };
  const I = { id: 0, x: 1, y: 2, fa: 3, bt: 4, a: 5, p: 6, hp: 7, fu: 8, cd: 9, inv: 10, f: 11, st: 12, mv: 13 };

  let G = null;               // 현재 판 상태
  let cv, ctx, cw = 0, ch = 0, dpr = 1, raf = 0, lastT = 0;
  let btnRects = [];
  const keys = {};

  function toast(msg) { if (window.TankLobby) window.TankLobby.toast(msg); }

  function resize() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = window.innerWidth; ch = window.innerHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    btnRects = Array.from(document.querySelectorAll('#s-game .pad, #s-game .fire, #s-game .power, #s-game .sp-back, #s-game .hud > *'))
      .filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left - 8, t: r.top - 8, r: r.right + 8, b: r.bottom + 8 }; });
  }

  // ---------------------------------------------------------------- 시작/끝
  function start(m) {
    stop(true);
    const T = new Art.Terrain(m.gw, m.gh, 4);
    T.load(m.rle);
    const meta = {};
    m.tanks.forEach((t) => { meta[t.id] = t; });
    const me = meta[m.me] ? m.me : null;
    G = {
      T, meta, me, side: m.side, snaps: [], events: [], est: null, renderK: m.k || 0, appliedK: m.k || 0,
      wind: m.wind, tl: m.endsIn, cdn: m.cdn, startCdn: m.cdn, startedAt: performance.now(),
      aim: { a: null, p: null, sentA: null, sentP: null, sentAt: 0, edge: 0, edgeSide: 0 },
      input: 0, cam: { x: 0, y: 0, ok: false }, zoom: false, spec: !me, specId: null, specInfo: null, specAsked: false,
      dead: {}, deadAt: 0, trails: {}, fx: [], parts: [], nums: [], phase: {}, recoil: {}, lastShotP: null,
      over: null, shake: 0, minimapT: 0, goT: 0, moving: false
    };
    $('#s-game').hidden = false;
    $('#result').hidden = true; $('#menu').hidden = true;
    setSpecUI(G.spec);
    $('#h-zoom').classList.remove('on');
    SND.music(false);
    resize();
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
    if (G.spec) Net.send({ t: 'tkspec', d: 0 });
  }
  function stop(silent) {
    cancelAnimationFrame(raf); raf = 0;
    if (G) { sendInput(0, true); SND.engine(false); }
    G = null;
    if (!silent) $('#s-game').hidden = true;
  }
  function active() { return !!G; }

  function setSpecUI(on) {
    $('#ctl').hidden = !!on;
    $('#spec').hidden = !on;
    resize();
  }

  // ---------------------------------------------------------------- 서버 메시지
  function onSnap(m) {
    if (!G) return;
    const now = performance.now();
    const o = now - m.k * TICK;
    if (G.est == null || o < G.est) G.est = o; else G.est += (o - G.est) * 0.03;
    const tanks = {};
    m.tanks.forEach((t) => { tanks[t[0]] = t; });
    const sh = {};
    m.sh.forEach((s) => { sh[s[0]] = s; });
    G.snaps.push({ k: m.k, tanks, sh, tl: m.tl, cdn: m.cdn, w: m.w });
    if (G.snaps.length > 40) G.snaps.shift();
    G.tl = m.tl; G.cdn = m.cdn; G.wind = m.w;
    const mine = G.me && tanks[G.me];
    if (mine && G.aim.a == null) { G.aim.a = mine[I.a]; G.aim.p = mine[I.p]; }
  }
  function onEvent(m) { if (G) G.events.push(m); }
  function onSpecTo(m) {
    if (!G) return;
    G.specId = m.id || G.specId;
    if (m.id) G.specInfo = m;
    const bar = $('#spec-bar');
    if (!m.id) { bar.textContent = '관전 중 · 남은 탱크가 없어요'; return; }
    const T = Art.TEAM[m.tm];
    bar.innerHTML = `관전 중 · <u style="color:${T.c}">${T.mark}${m.tm}</u> <b>${esc(m.n)}</b> · ${KN[m.k] || ''}${m.ai ? ` <span class="tagai">AI ${m.lv === 'normal' ? '보통' : '쉬움'}</span>` : ''}`;
    $('#sp-prev').classList.toggle('dim', (m.cnt || 0) <= 1);
    $('#sp-next').classList.toggle('dim', (m.cnt || 0) <= 1);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function applyEvent(e) {
    const T = G.T;
    if (e.t === 'tkshot') {
      G.recoil[e.id] = performance.now();
      G.fx.push({ kind: 'flash', x: e.x, y: e.y, t: performance.now(), r: 14 });
      if (e.id !== G.me) SND.SFX.fire();
      if (e.id === G.me) G.lastShotP = Math.round(G.aim.p);
    } else if (e.t === 'tkboom') {
      T.carve(e.x, e.y, e.r);
      G.minimapT = 0;
      const t = performance.now();
      G.fx.push({ kind: 'boom', x: e.x, y: e.y, r: e.r, t });
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
        G.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, t, life: 0.7 + Math.random() * 0.6, c: Math.random() < 0.5 ? '#6e4129' : '#a8683a', s: 3 + Math.random() * 5 });
      }
      for (let i = 0; i < 6; i++) G.fx.push({ kind: 'smoke', x: e.x + (Math.random() - 0.5) * e.r, y: e.y + (Math.random() - 0.5) * e.r * 0.6, t: t + i * 40, r: 10 + Math.random() * 14 });
      const near = nearFactor(e.x, e.y);
      SND.SFX.boom(near);
      G.shake = Math.max(G.shake, near * (e.r / 44) * 8);
      e.hits.forEach((h) => {
        G.nums.push({ id: h.id, dmg: h.dmg, t });
        if (h.id === G.me) { SND.SFX.hit(); try { navigator.vibrate && navigator.vibrate(40); } catch (er) { /* 무시 */ } }
      });
      if (e.hits.length && !e.hits.some((h) => h.id === G.me)) SND.SFX.hit();
      delete G.trails[e.sid];
    } else if (e.t === 'tkgone') {
      delete G.trails[e.sid];
    } else if (e.t === 'tkdeath') {
      G.dead[e.id] = { t: performance.now(), cause: e.cause };
      if (e.cause === 'fall') SND.SFX.fall();
      if (e.id === G.me) G.deadAt = performance.now();
    } else if (e.t === 'tkwind') {
      G.wind = e.w;
    }
  }

  function onEnd(m) {
    if (!G) return;
    G.events.push(m);
  }
  function showResult(m) {
    G.over = m;
    const myTeam = G.me && G.meta[G.me] ? G.meta[G.me].tm : null;
    let title;
    if (m.win === 'draw') title = '무승부!';
    else if (myTeam) title = m.win === myTeam ? '우리 팀 승리!' : '아쉬워요, 졌어요';
    else title = `팀 ${m.win} 승리!`;
    if (myTeam && m.win === myTeam) SND.SFX.win(); else SND.SFX.lose();
    const by = m.by === 'wipe' ? '상대 팀을 모두 물리쳤어요' : '시간 끝 · 남은 탱크와 체력으로 판정';
    const rows = m.stats.slice().sort((a, b) => b.dealt - a.dealt).map((s) => {
      const T = Art.TEAM[s.tm];
      return `<tr${s.id === G.me ? ' style="color:#FFE27A"' : ''}><td style="color:${T.c}">${T.mark}${s.tm}</td><td>${esc(s.n)}</td><td>${KN[s.k]}</td><td>${s.shots}발</td><td>${s.hits}명중</td><td>${s.dealt}</td><td>${s.alive ? '생존' : '…'}</td></tr>`;
    }).join('');
    const box = $('#result');
    box.innerHTML = `<h2>${title}</h2><div class="sub">${by} · 팀 A ${m.alive.A}대 / 팀 B ${m.alive.B}대 남음</div>
      <div class="rlist"><table><tr><th>팀</th><th>이름</th><th>기종</th><th>발사</th><th>명중</th><th>피해</th><th></th></tr>${rows}</table></div>
      <div class="sub" id="r-left"></div><button type="button" class="btn btn-yellow" id="r-back">대기실로</button>`;
    box.hidden = false;
    const until = performance.now() + (m.back || 8000);
    const tick = () => { if (!G || G.over !== m) return; const s = Math.max(0, Math.ceil((until - performance.now()) / 1000)); const el = $('#r-left'); if (el) el.textContent = `${s}초 뒤 대기실로 돌아가요`; if (s > 0) setTimeout(tick, 250); };
    tick();
    $('#r-back').addEventListener('click', () => { SND.SFX.click(); Net.send({ t: 'tkback' }); });
    setSpecUI(false); $('#ctl').hidden = true;
    sendInput(0, true);
  }

  // ---------------------------------------------------------------- 입력
  function sendInput(d, force) {
    if (!G) return;
    if (d !== G.input || force) { G.input = d; Net.send({ t: 'tkin', d }); }
  }
  function myState() { return G && G.me ? G.cur && G.cur[G.me] : null; }
  function myKind() { return G && G.me ? G.meta[G.me].k : 'mongdol'; }
  function canControl() {
    if (!G || G.spec || G.over || !G.me) return false;
    const s = myState();
    return !!s && s.st === 0 || (!!s && s.st === 1);
  }
  function portrait() { return window.matchMedia && window.matchMedia('(orientation: portrait)').matches; }

  const held = {};
  function bindHold(el, name) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); SND.unlock();
      try { el.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ }
      held[name] = e.pointerId; el.classList.add('held');
      onHoldChange();
    });
    const up = (e) => { if (held[name] === e.pointerId) { delete held[name]; el.classList.remove('held'); onHoldChange(); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function onHoldChange() {
    if (!G) return;
    const l = held.left != null || keys.ArrowLeft, r = held.right != null || keys.ArrowRight;
    const d = portrait() || !canControl() ? 0 : (r && !l ? 1 : l && !r ? -1 : 0);
    sendInput(d);
  }
  function setPowerFromY(clientY) {
    const tr = $('#power .ptrack').getBoundingClientRect();
    const p = Math.round(100 * (1 - (clientY - tr.top) / tr.height));
    if (G && G.aim.a != null) G.aim.p = Math.max(0, Math.min(100, p));
  }
  function fire() {
    if (!canControl() || G.aim.a == null || portrait()) return;
    const s = myState();
    if (G.cdn > 0) { SND.SFX.deny(); toast('시작 신호 뒤에 쏠 수 있어요'); return; }
    if (s && s.cd > 0) { SND.SFX.deny(); return; }
    Net.send({ t: 'tkfire', a: Math.round(G.aim.a), p: Math.round(G.aim.p) });
    SND.SFX.fire();
    G.recoil[G.me] = performance.now();
  }

  function setupInput() {
    bindHold($('#b-left'), 'left'); bindHold($('#b-right'), 'right');
    bindHold($('#b-up'), 'up'); bindHold($('#b-down'), 'down');
    const pw = $('#power');
    pw.addEventListener('pointerdown', (e) => { e.preventDefault(); SND.unlock(); try { pw.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ } held.power = e.pointerId; setPowerFromY(e.clientY); });
    pw.addEventListener('pointermove', (e) => { if (held.power === e.pointerId) setPowerFromY(e.clientY); });
    const pup = (e) => { if (held.power === e.pointerId) delete held.power; };
    pw.addEventListener('pointerup', pup); pw.addEventListener('pointercancel', pup);
    $('#b-fire').addEventListener('pointerdown', (e) => { e.preventDefault(); SND.unlock(); fire(); });
    $('#sp-prev').addEventListener('pointerdown', (e) => { e.preventDefault(); SND.SFX.click(); Net.send({ t: 'tkspec', d: -1 }); });
    $('#sp-next').addEventListener('pointerdown', (e) => { e.preventDefault(); SND.SFX.click(); Net.send({ t: 'tkspec', d: 1 }); });
    $('#sp-back').addEventListener('click', () => { SND.SFX.click(); Net.send({ t: 'tkback' }); });
    $('#h-zoom').addEventListener('click', () => { if (!G) return; G.zoom = !G.zoom; $('#h-zoom').classList.toggle('on', G.zoom); SND.SFX.click(); });
    $('#h-menu').addEventListener('click', () => { $('#menu').hidden = !$('#menu').hidden; SND.SFX.click(); });
    $('#m-close').addEventListener('click', () => { $('#menu').hidden = true; });
    $('#m-leave').addEventListener('click', () => { $('#menu').hidden = true; if (window.TankLobby) window.TankLobby.leave(); });
    window.addEventListener('keydown', (e) => {
      if (!G || e.target.tagName === 'INPUT') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'w', 's', 'W', 'S'].includes(e.key)) e.preventDefault();
      if (e.repeat && e.key === ' ') return;
      keys[e.key] = true;
      if (e.key === ' ') fire();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onHoldChange();
      if (G.spec && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.repeat) Net.send({ t: 'tkspec', d: e.key === 'ArrowLeft' ? -1 : 1 });
    });
    window.addEventListener('keyup', (e) => { delete keys[e.key]; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') onHoldChange(); });
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(() => { resize(); onHoldChange(); }, 200));
    window.addEventListener('blur', () => { Object.keys(keys).forEach((k) => delete keys[k]); onHoldChange(); });
  }

  function stepAim(dt) {
    if (!canControl() || G.aim.a == null) return;
    const K = Art.STAT[myKind()];
    let dir = 0;
    if (held.up != null || keys.ArrowUp) dir += 1;
    if (held.down != null || keys.ArrowDown) dir -= 1;
    if (dir && !portrait()) {
      const na = Math.max(K.amin, Math.min(K.amax, G.aim.a + dir * 30 * dt));
      const atEdge = (dir > 0 && na >= K.amax) || (dir < 0 && na <= K.amin);
      if (atEdge && G.aim.edgeSide !== dir) { G.aim.edge = performance.now(); G.aim.edgeSide = dir; SND.SFX.edge(); try { navigator.vibrate && navigator.vibrate(15); } catch (e) { /* 무시 */ } }
      if (!atEdge) G.aim.edgeSide = 0;
      G.aim.a = na;
    }
    let pd = 0;
    if (keys.w || keys.W) pd += 1;
    if (keys.s || keys.S) pd -= 1;
    if (pd) G.aim.p = Math.max(0, Math.min(100, G.aim.p + pd * 60 * dt));
    const a = Math.round(G.aim.a), p = Math.round(G.aim.p), now = performance.now();
    if ((a !== G.aim.sentA || p !== G.aim.sentP) && now - G.aim.sentAt > 100) {
      G.aim.sentA = a; G.aim.sentP = p; G.aim.sentAt = now;
      Net.send({ t: 'tkaim', a, p });
    }
    $('#b-up').classList.toggle('dim', G.aim.a >= K.amax);
    $('#b-down').classList.toggle('dim', G.aim.a <= K.amin);
  }

  // ---------------------------------------------------------------- 보간
  function lerpAng(a, b, f) { return a + (b - a) * f; }
  function interpolate() {
    const S = G.snaps;
    if (!S.length) return null;
    const now = performance.now();
    let rk = G.est == null ? S[S.length - 1].k : (now - G.est) / TICK - DELAY;
    rk = Math.min(rk, S[S.length - 1].k);
    rk = Math.max(rk, S[0].k);
    G.renderK = rk;
    let a = S[0], b = S[0];
    for (let i = 0; i < S.length - 1; i++) { if (S[i].k <= rk && S[i + 1].k >= rk) { a = S[i]; b = S[i + 1]; break; } a = b = S[S.length - 1]; }
    const f = b.k === a.k ? 0 : (rk - a.k) / (b.k - a.k);
    const out = {};
    for (const id in b.tanks) {
      const B = b.tanks[id], A = a.tanks[id] || B;
      out[id] = {
        id, x: A[I.x] + (B[I.x] - A[I.x]) * f, y: A[I.y] + (B[I.y] - A[I.y]) * f, fa: (f < 0.5 ? A : B)[I.fa],
        bt: lerpAng(A[I.bt], B[I.bt], f) / 10, a: lerpAng(A[I.a], B[I.a], f), p: B[I.p], hp: B[I.hp], fu: B[I.fu], cd: B[I.cd],
        inv: B[I.inv], f: (f < 0.5 ? A : B)[I.f], st: B[I.st], mv: B[I.mv]
      };
    }
    const shells = [];
    for (const sid in a.sh) {
      const A = a.sh[sid], B = b.sh[sid];
      if (B) shells.push({ sid, x: A[1] + (B[1] - A[1]) * f, y: A[2] + (B[2] - A[2]) * f });
      else if (rk - a.k < 1) shells.push({ sid, x: A[1], y: A[2] });
    }
    // 이벤트 적용 (렌더 시간선에 맞춰)
    G.events.sort((x, y) => x.k - y.k);
    while (G.events.length && G.events[0].k <= rk + 0.5) {
      const e = G.events.shift();
      if (e.t === 'tkend') showResult(e); else applyEvent(e);
    }
    return { tanks: out, shells };
  }

  // ---------------------------------------------------------------- 카메라·좌표
  function scale() {
    if (G.zoom) return Math.min(cw / (WW + 80), (ch - 50) / 1000);
    return Math.max(0.5, Math.min(0.95, ch / 600));
  }
  function focusTank() {
    if (!G.cur) return null;
    if (!G.spec && G.me && G.cur[G.me]) {
      const t = G.cur[G.me];
      if (t.st !== 2 || performance.now() - (G.deadAt || 0) < 1400) return t;
    }
    if (G.specId && G.cur[G.specId]) return G.cur[G.specId];
    return G.me && G.cur[G.me] ? G.cur[G.me] : null;
  }
  function updateCam(dt) {
    const s = scale();
    let tx, ty;
    if (G.zoom) { tx = WW / 2; ty = 650; }
    else {
      const t = focusTank();
      if (!t) { tx = G.cam.ok ? G.cam.x : WW / 2; ty = G.cam.ok ? G.cam.y : 500; }
      else {
        tx = t.x;
        // 탱크를 HUD 아래·버튼 위 사이 45% 높이에
        const playTop = 50, playBot = ch - 96;
        const want = playTop + (playBot - playTop) * 0.45;
        ty = (t.y - 20) + (ch / 2 - want) / s;
      }
      const halfW = cw / 2 / s, halfH = ch / 2 / s;
      tx = Math.max(halfW - 60, Math.min(WW + 60 - halfW, tx));
      ty = Math.max(-300 + halfH, Math.min(WH + 40 - halfH, ty));
    }
    if (!G.cam.ok) { G.cam.x = tx; G.cam.y = ty; G.cam.ok = true; }
    const k = Math.min(1, dt * 6);
    G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
  }
  function toScreen(wx, wy) {
    const s = scale();
    return [(wx - G.cam.x) * s + cw / 2, (wy - G.cam.y) * s + ch / 2];
  }
  function nearFactor(x, y) {
    if (!G.cam.ok) return 0.5;
    const d = Math.hypot(x - G.cam.x, y - G.cam.y);
    return Math.max(0.15, Math.min(1, 1 - d / 1800));
  }

  // 포구 위치 (서버 muzzle 과 같은 계산)
  function pivot(t) {
    const K = Art.KIND[G.meta[t.id].k];
    const bt = t.bt * Math.PI / 180, f = t.fa;
    const fx = f * Math.cos(bt), fy = -Math.sin(bt), ux = -f * Math.sin(bt), uy = -Math.cos(bt);
    return [t.x + fx * K.pfx + ux * K.ph, t.y + fy * K.pfx + uy * K.ph];
  }

  // ---------------------------------------------------------------- 그리기
  function frame(now) {
    if (!G) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    stepAim(dt);
    const cur = interpolate();
    if (!cur) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); Art.sky(ctx, cw, ch, 0, 0, 0.5, now); return; }
    G.cur = cur.tanks;
    // 내 탱크 포신은 내 입력을 바로 보여 줌
    const me = G.me && G.cur[G.me];
    if (me && G.aim.a != null && canControl()) me.a = G.aim.a;
    if (me && me.st === 2 && !G.spec && performance.now() - G.deadAt > 1400 && !G.over) {
      G.spec = true; setSpecUI(true); Net.send({ t: 'tkspec', d: 0 }); sendInput(0, true); SND.engine(false);
    }
    updateCam(dt);
    const s = scale();
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    Art.sky(c, cw, ch, G.cam.x, G.cam.y, s, now);
    // 흔들림
    let sx = 0, sy = 0;
    if (G.shake > 0.2) { sx = (Math.random() - 0.5) * G.shake; sy = (Math.random() - 0.5) * G.shake; G.shake *= Math.pow(0.02, dt); } else G.shake = 0;
    const ox = cw / 2 - G.cam.x * s + sx, oy = ch / 2 - G.cam.y * s + sy;
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    // 구덩이 안쪽 어둠
    const pg = c.createLinearGradient(0, 700, 0, 1250);
    pg.addColorStop(0, 'rgba(30,22,60,.0)'); pg.addColorStop(0.15, 'rgba(24,20,52,.9)'); pg.addColorStop(1, '#0e0c22');
    c.fillStyle = pg; c.fillRect(1040, 690, 320, 700);
    // 지형 (보이는 부분만)
    const vl = Math.max(0, Math.floor(G.cam.x - cw / 2 / s - 4)), vt = Math.max(0, Math.floor(G.cam.y - ch / 2 / s - 4));
    const vr = Math.min(WW, Math.ceil(G.cam.x + cw / 2 / s + 4)), vb = Math.min(WH, Math.ceil(G.cam.y + ch / 2 / s + 4));
    if (vr > vl && vb > vt) c.drawImage(G.T.cv, vl, vt, vr - vl, vb - vt, vl, vt, vr - vl, vb - vt);
    // 탱크
    const list = Object.values(G.cur).sort((a, b) => (a.id === G.me) - (b.id === G.me));
    let anyMoving = false;
    for (const t of list) drawOneTank(c, t, now, dt);
    if (me && me.mv && !G.spec) anyMoving = true;
    if (anyMoving !== G.moving) { G.moving = anyMoving; SND.engine(anyMoving); }
    // 입자
    drawParticles(c, now, dt);
    // 화면 좌표 레이어
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLabels(c, list, now);
    // 포탄 (닉네임 위)
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    drawShells(c, cur.shells, s);
    drawFx(c, now);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawNums(c, now);
    if (me && me.st !== 2 && canControl()) drawArc(c, me, now);
    drawArrows(c, cur.shells, list);
    drawEdgeWarn(c, me, now);
    drawCountdown(c, me, now);
    hud(me, now);
  }

  function drawOneTank(c, t, now, dt) {
    const m = G.meta[t.id]; if (!m) return;
    const dead = G.dead[t.id];
    // 궤도 움직임
    const ph = G.phase[t.id] || { v: 0, x: t.x };
    ph.v += Math.abs(t.x - ph.x) / 6; ph.x = t.x; G.phase[t.id] = ph;
    let alpha = 1;
    if (t.st === 2) {
      const since = dead ? now - dead.t : 9999;
      if (dead && dead.cause === 'fall') { if (t.y > WH + 200) return; }
      else {
        if (since > 1400) { Art.tomb(c, t.x, t.y, m.tm); return; }
        alpha = since < 800 ? 1 : 1 - (since - 800) / 600;
      }
    }
    if (t.inv > 0) alpha *= 0.55 + 0.35 * Math.sin(now / 70);
    const rc = G.recoil[t.id] ? Math.max(0, 1 - (now - G.recoil[t.id]) / 180) * 5 : 0;
    // 그림자
    c.save(); c.globalAlpha = 0.25 * alpha; c.fillStyle = '#2a1020';
    c.beginPath(); c.ellipse(t.x, t.y + 1, Art.KIND[m.k].bw / 2 + 2, 4, 0, 0, Math.PI * 2); c.fill(); c.restore();
    Art.drawTank(c, t.x, t.y, { kind: m.k, face: t.fa, bt: t.bt, a: t.a, f: t.st === 2 ? 2 : t.f, phase: ph.v, team: m.tm, alpha, recoil: rc, shield: t.inv > 0 && t.st !== 2 });
  }

  function ellipsize(c, text, maxW) {
    if (c.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && c.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }
  function overlapArea(a, b) {
    const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function drawLabels(c, list, now) {
    const s = scale();
    c.font = '16px Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const placed = [];
    const items = list.filter((t) => t.st !== 2 && t.y < WH + 100).map((t) => {
      const m = G.meta[t.id], K = Art.KIND[m.k];
      const [x, y] = toScreen(t.x, t.y - K.bh - 30);
      const mine = t.id === G.me || (G.spec && t.id === G.specId);
      return { t, m, K, x, y, mine };
    }).sort((a, b) => b.y - a.y);
    for (const it of items) {
      const { t, m, mine } = it;
      let name = m.n;   // AI 이름은 'AI쉬움1'처럼 AI 로 시작
      name = ellipsize(c, name, 88);
      const tw = Math.min(96, c.measureText(name).width + 6);
      let y = it.y, x = it.x;
      const box = () => ({ l: x - Math.max(tw, 44) / 2, t: y - 34, r: x + Math.max(tw, 44) / 2, b: y + 2 });
      // 닉네임끼리 겹치면 위로 12px씩 최대 2단
      let alpha = mine ? 0.95 : 0.6, lift = 0;
      while (lift < 2 && placed.some((p) => overlapArea(p, box()) > 0)) { y -= 12; lift++; }
      if (placed.some((p) => overlapArea(p, box()) > 0)) alpha = 0.3;
      // 버튼과 겹치면 흐리게 · 반 이상이면 올리기/옆으로
      let b = box(), area = (b.r - b.l) * (b.b - b.t);
      let ov = Math.max(0, ...btnRects.map((r) => overlapArea(r, b)));
      if (ov > 0) {
        alpha = mine ? 0.6 : 0.3;
        if (ov > area / 2) {
          y -= 24; b = box();
          if (b.t < 50 || Math.max(0, ...btnRects.map((r) => overlapArea(r, b))) > area / 2) { y += 24; x += (x < cw / 2 ? 1 : -1) * 70; }
        }
      }
      placed.push(box());
      c.save(); c.globalAlpha = alpha;
      // 체력바
      const maxHp = Art.STAT[m.k].hp, hw = 44;
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x - hw / 2 - 1, y - 1, hw + 2, 7);
      const r = Math.max(0, t.hp / maxHp);
      c.fillStyle = r > 0.5 ? '#7CE36A' : r > 0.25 ? '#FFD23F' : '#ff5a4a'; c.fillRect(x - hw / 2, y, hw * r, 5);
      if (mine) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(x - hw / 2 - 1, y - 1, hw + 2, 7); }
      // 닉네임
      const ty = y - 6;
      if (mine) { c.lineWidth = 4; c.strokeStyle = 'rgba(20,10,30,.9)'; c.strokeText(name, x, ty - 3); }
      else { c.lineWidth = 3; c.strokeStyle = 'rgba(20,10,30,.55)'; c.strokeText(name, x, ty - 3); }
      c.fillStyle = '#fff'; c.fillText(name, x, ty - 3);
      // 팀 색 언더라인
      c.fillStyle = Art.TEAM[m.tm].c; c.fillRect(x - tw / 2 + 3, ty, tw - 6, 2);
      c.restore();
    }
    void s;
  }

  function drawShells(c, shells, s) {
    for (const sh of shells) {
      const tr = G.trails[sh.sid] || (G.trails[sh.sid] = []);
      const last = tr[tr.length - 1];
      if (!last || Math.hypot(last[0] - sh.x, last[1] - sh.y) > 6) { tr.push([sh.x, sh.y]); if (tr.length > 14) tr.shift(); }
      for (let i = 1; i < tr.length; i++) {
        c.strokeStyle = `rgba(255,248,220,${(i / tr.length) * 0.7})`; c.lineWidth = (2 + 4 * i / tr.length) / Math.max(0.5, s) * 0.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(tr[i - 1][0], tr[i - 1][1]); c.lineTo(tr[i][0], tr[i][1]); c.stroke();
      }
      c.fillStyle = '#2a2433'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(sh.x, sh.y, 6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(sh.x - 2, sh.y - 2, 2, 0, Math.PI * 2); c.fill();
    }
  }
  function drawFx(c, now) {
    G.fx = G.fx.filter((f) => {
      const age = (now - f.t) / 1000;
      if (age < 0) return true;
      if (f.kind === 'flash') {
        if (age > 0.12) return false;
        c.fillStyle = `rgba(255,230,140,${1 - age / 0.12})`; c.beginPath(); c.arc(f.x, f.y, f.r * (1 + age * 6), 0, Math.PI * 2); c.fill(); return true;
      }
      if (f.kind === 'boom') {
        if (age > 0.45) return false;
        const k = age / 0.45;
        c.fillStyle = `rgba(255,${Math.round(220 - 120 * k)},80,${1 - k})`;
        c.beginPath(); c.arc(f.x, f.y, f.r * (0.6 + 0.8 * k), 0, Math.PI * 2); c.fill();
        c.fillStyle = `rgba(255,255,230,${Math.max(0, 1 - k * 2.5)})`; c.beginPath(); c.arc(f.x, f.y, f.r * 0.6, 0, Math.PI * 2); c.fill();
        c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; c.lineWidth = 4; c.beginPath(); c.arc(f.x, f.y, f.r * (0.9 + 1.2 * k), 0, Math.PI * 2); c.stroke();
        return true;
      }
      if (f.kind === 'smoke') {
        if (age > 1.2) return false;
        c.fillStyle = `rgba(90,80,90,${0.45 * (1 - age / 1.2)})`; c.beginPath(); c.arc(f.x, f.y - age * 40, f.r * (1 + age * 1.5), 0, Math.PI * 2); c.fill(); return true;
      }
      return false;
    });
  }
  function drawParticles(c, now, dt) {
    G.parts = G.parts.filter((p) => {
      const age = (now - p.t) / 1000;
      if (age > p.life) return false;
      p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      c.globalAlpha = 1 - age / p.life; c.fillStyle = p.c; c.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); c.globalAlpha = 1;
      return true;
    });
  }
  function drawNums(c, now) {
    c.font = '20px "Black Han Sans", Jua, sans-serif'; c.textAlign = 'center';
    G.nums = G.nums.filter((n) => {
      const age = (now - n.t) / 1000;
      if (age > 1.1) return false;
      const t = G.cur[n.id]; if (!t) return false;
      const [x, y] = toScreen(t.x, t.y - 60);
      c.globalAlpha = 1 - Math.max(0, age - 0.6) / 0.5;
      c.lineWidth = 4; c.strokeStyle = '#3a0a10'; c.strokeText('-' + n.dmg, x + 16, y - age * 40);
      c.fillStyle = '#ffe2d0'; c.fillText('-' + n.dmg, x + 16, y - age * 40);
      c.globalAlpha = 1;
      return true;
    });
  }

  // 포신 범위 호 (실제 발사각 = 차체 기울기 + 포신 각도, -30~85 자름)
  function drawArc(c, t, now) {
    const K = Art.STAT[G.meta[t.id].k];
    const [px, py] = toScreen(...pivot(t));
    const lo = Math.max(-30, Math.min(85, t.bt + K.amin)), hi = Math.max(-30, Math.min(85, t.bt + K.amax));
    const ea = Math.max(-30, Math.min(85, t.bt + G.aim.a));
    const R = 56, f = t.fa;
    const pt = (e, r) => [px + f * Math.cos(e * Math.PI / 180) * r, py - Math.sin(e * Math.PI / 180) * r];
    const arcPath = (a0, a1) => { c.beginPath(); for (let e = a0; e <= a1 + 0.01; e += 2) { const [x, y] = pt(Math.min(e, a1), R); if (e === a0) c.moveTo(x, y); else c.lineTo(x, y); } };
    let alpha = 1;
    const box = { l: px - R - 30, t: py - R - 30, r: px + R + 30, b: py + R };
    if (btnRects.some((r) => overlapArea(r, box) > 0)) alpha = 0.3;
    c.save();
    c.globalAlpha = alpha;
    c.lineCap = 'round';
    // 가능한 범위 부채꼴 (옅게)
    c.beginPath(); c.moveTo(px, py); for (let e = lo; e <= hi + 0.01; e += 2) { const [x, y] = pt(Math.min(e, hi), R); c.lineTo(x, y); } c.closePath();
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fill();
    arcPath(lo, hi); c.strokeStyle = 'rgba(20,10,30,.7)'; c.lineWidth = 6; c.stroke();
    arcPath(lo, hi); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 3; c.stroke();
    // 범위 끝 강조
    const pulse = performance.now() - G.aim.edge < 250 ? 3 * Math.sin((performance.now() - G.aim.edge) / 250 * Math.PI) : 0;
    const atHi = G.aim.a >= K.amax - 0.01, atLo = G.aim.a <= K.amin + 0.01;
    if (atHi || atLo) {
      const e0 = atHi ? Math.max(lo, hi - 8) : lo, e1 = atHi ? hi : Math.min(hi, lo + 8);
      arcPath(e0, e1); c.strokeStyle = '#FFD23F'; c.lineWidth = 3 + pulse; c.stroke();
    }
    // 현재 조준선과 숫자
    const [x0, y0] = pt(ea, 18), [x1, y1] = pt(ea, R + 10);
    c.strokeStyle = 'rgba(20,10,30,.8)'; c.lineWidth = 5; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.strokeStyle = '#FFE27A'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.globalAlpha = Math.max(alpha, 0.6);
    const [lx, ly] = pt(ea, R + 30);
    c.font = '18px "Black Han Sans", Jua, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = 'rgba(20,10,30,.9)'; c.strokeText(Math.round(ea) + '°', lx, ly);
    c.fillStyle = '#fff'; c.fillText(Math.round(ea) + '°', lx, ly);
    c.restore();
    c.textBaseline = 'alphabetic';
  }

  function arrowAt(c, x, y, ang, col) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.fillStyle = col; c.strokeStyle = 'rgba(20,10,30,.9)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(12, 0); c.lineTo(-8, -9); c.lineTo(-4, 0); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  function drawArrows(c, shells, list) {
    const pad = 22, top = 56;
    const clampPt = (x, y) => [Math.max(pad, Math.min(cw - pad, x)), Math.max(top, Math.min(ch - pad, y))];
    for (const sh of shells) {
      const [x, y] = toScreen(sh.x, sh.y);
      if (x >= 0 && x <= cw && y >= 46 && y <= ch) continue;
      const [ax, ay] = clampPt(x, y);
      arrowAt(c, ax, ay, Math.atan2(y - ay, x - ax), '#fff');
    }
    // 화면 밖 탱크 (팀 색)
    for (const t of list) {
      if (t.st === 2) continue;
      const [x, y] = toScreen(t.x, t.y - 20);
      if (x >= 0 && x <= cw && y >= 46 && y <= ch) continue;
      const [ax, ay] = clampPt(x, y);
      const m = G.meta[t.id];
      c.save(); c.globalAlpha = 0.85; arrowAt(c, ax, ay, Math.atan2(y - ay, x - ax), Art.TEAM[m.tm].c); c.restore();
    }
  }
  function drawEdgeWarn(c, me, now) {
    if (!me || me.st !== 0 || G.spec) return;
    const T = G.T;
    let warn = 0;
    for (const d of [-1, 1]) {
      const x = me.x + d * 40;
      let ground = false;
      for (let y = me.y - 20; y < me.y + 60; y += 4) if (T.solid(x, y)) { ground = true; break; }
      if (!ground) warn = d;
    }
    if (!warn) return;
    const a = 0.25 + 0.25 * Math.sin(now / 120);
    const g = c.createLinearGradient(warn < 0 ? 0 : cw, 0, warn < 0 ? 60 : cw - 60, 0);
    g.addColorStop(0, `rgba(255,60,60,${a + 0.2})`); g.addColorStop(1, 'rgba(255,60,60,0)');
    c.fillStyle = g; c.fillRect(warn < 0 ? 0 : cw - 60, 46, 60, ch - 46);
  }
  function drawCountdown(c, me, now) {
    const el = $('#cdn');
    if (G.over) { el.hidden = true; return; }
    if (G.cdn > 0) {
      const n = Math.ceil(G.cdn / 1000);
      const myTeam = G.me && G.meta[G.me] ? G.meta[G.me].tm : null;
      const side = myTeam ? G.side[myTeam] : null;
      const html = `<b>${n}</b>${side ? `<span>우리 진지: ${side === 'L' ? '← 왼쪽' : '오른쪽 →'}</span>` : '<span>곧 시작해요</span>'}`;
      if (el.innerHTML !== html) { el.innerHTML = html; SND.SFX.tick(); }
      el.hidden = false; G.goT = now + 800;
      if (me) {
        const [x, y] = toScreen(me.x, me.y - 70);
        const bob = Math.sin(now / 150) * 5;
        c.fillStyle = '#FFD23F'; c.strokeStyle = 'rgba(20,10,30,.9)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x - 12, y - 40 + bob); c.lineTo(x + 12, y - 40 + bob); c.lineTo(x, y - 22 + bob); c.closePath(); c.stroke(); c.fill();
        c.font = '18px "Black Han Sans", sans-serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeText('나', x, y - 46 + bob); c.fillStyle = '#fff'; c.fillText('나', x, y - 46 + bob);
      }
    } else if (now < G.goT) {
      if (!el.dataset.go) { el.innerHTML = '<b>출발!</b>'; el.dataset.go = '1'; SND.SFX.go(); }
      el.hidden = false;
    } else { el.hidden = true; delete el.dataset.go; }
  }

  let hudCache = {};
  function setText(sel, v) { if (hudCache[sel] !== v) { hudCache[sel] = v; $(sel).textContent = v; } }
  function hud(me, now) {
    const tl = Math.max(0, Math.ceil((G.tl || 0) / 1000));
    setText('#h-time', `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`);
    const w = G.wind || 0, lv = Math.abs(w) < 2 ? 0 : Math.abs(w) <= 8 ? 1 : Math.abs(w) <= 16 ? 2 : 3;
    setText('#h-wlv', String(lv));
    const ar = $('#h-wind svg');
    const tf = `scaleX(${w < 0 ? -1 : 1}) scale(${0.6 + lv * 0.15})`;
    if (ar.style.transform !== tf) ar.style.transform = tf;
    const cnt = { A: 0, B: 0 }, hp = { A: 0, B: 0 }, mx = { A: 0, B: 0 };
    for (const id in G.cur) {
      const t = G.cur[id], m = G.meta[id]; if (!m) continue;
      mx[m.tm] += Art.STAT[m.k].hp;
      if (t.st !== 2) { cnt[m.tm]++; hp[m.tm] += t.hp; }
    }
    // 그 판 왼쪽 진지 팀을 왼쪽에
    const leftTeam = G.side.A === 'L' ? 'A' : 'B';
    const hud = $('.hud');
    if (hud.dataset.left !== leftTeam) { hud.dataset.left = leftTeam; if (leftTeam === 'B') hud.insertBefore($('#h-b'), $('#h-a')); else hud.insertBefore($('#h-a'), $('#h-b')); }
    setText('#h-an', String(cnt.A)); setText('#h-bn', String(cnt.B));
    $('#h-ab').style.width = (mx.A ? 100 * hp.A / mx.A : 0) + '%';
    $('#h-bb').style.width = (mx.B ? 100 * hp.B / mx.B : 0) + '%';
    if (me && !G.spec) {
      setText('#fuel-n', String(me.fu));
      $('#fuel-bar').style.width = me.fu + '%';
      const ea = Math.round(Math.max(-30, Math.min(85, me.bt + (G.aim.a == null ? me.a : G.aim.a))));
      setText('#aimread', `각도 ${ea}° · 파워 ${Math.round(G.aim.p == null ? me.p : G.aim.p)}`);
      const p = G.aim.p == null ? me.p : G.aim.p;
      $('#p-fill').style.height = p + '%';
      const tr = $('#power .ptrack');
      $('#p-knob').style.top = (tr.offsetTop + tr.offsetHeight * (1 - p / 100)) + 'px';
      const pl = $('#p-last');
      if (G.lastShotP != null) { pl.style.display = 'block'; pl.style.bottom = G.lastShotP + '%'; }
      const cd = G.cdn > 0 ? G.cdn : me.cd;
      const fb = $('#b-fire'), cool = cd > 0;
      fb.classList.toggle('cool', cool);
      setText('#fire-t', cool ? (cd / 1000).toFixed(1) : '발사');
      $('#fire-ring').style.strokeDashoffset = String(238.8 * (cool && G.cdn <= 0 ? cd / 5000 : 0));
    }
    // 미니맵
    if (now - G.minimapT > 200) { G.minimapT = now; minimap(); }
  }
  function minimap() {
    const mc = $('#h-mini'); const c = mc.getContext('2d');
    const w = mc.width, h = mc.height, T = G.T;
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#8e5530';
    for (let i = 0; i < w; i++) {
      const gy = T.groundY((i + 0.5) / w * WW);
      if (gy == null) continue;
      const y = gy / WH * h * 1.5 - h * 0.25;
      c.fillRect(i, y, 1, h - y);
    }
    for (const id in G.cur) {
      const t = G.cur[id], m = G.meta[id]; if (!m || t.st === 2) continue;
      const x = t.x / WW * w, y = t.y / WH * h * 1.5 - h * 0.25 - 2;
      c.fillStyle = Art.TEAM[m.tm].c; c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI * 2); c.fill();
      if (id === G.me || id === G.specId) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); }
    }
    const s = scale();
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1;
    c.strokeRect((G.cam.x - cw / 2 / s) / WW * w, 1, cw / s / WW * w, h - 2);
  }

  function init() {
    cv = $('#gc'); ctx = cv.getContext('2d');
    setupInput();
    Net.on('tksnap', onSnap);
    ['tkshot', 'tkboom', 'tkdeath', 'tkgone', 'tkwind'].forEach((t) => Net.on(t, onEvent));
    Net.on('tkend', onEnd);
    Net.on('tkspecto', onSpecTo);
    Net.on('tkerr', (m) => {
      if (!G) return;
      if (m.code === 'cooldown') SND.SFX.deny();
      if (m.code === 'angle_range') toast('포신이 움직일 수 있는 범위 밖이에요');
    });
    resize();
  }
  init();
  window.TankGame = { start, stop, active, isSpec: () => !!(G && G.spec), hasMe: () => !!(G && G.me) };
})();
