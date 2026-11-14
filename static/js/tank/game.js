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
  const I = { id: 0, x: 1, y: 2, fa: 3, bt: 4, a: 5, p: 6, hp: 7, fu: 8, cd: 9, inv: 10, f: 11, st: 12, mv: 13, kl: 14, ht: 15, dl: 16, ffk: 17 };

  const IS_MOBILE = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const MAX_PARTS = IS_MOBILE ? 160 : 300;
  const PART_POOL = [];
  for (let i = 0; i < MAX_PARTS; i++) {
    PART_POOL.push({ active: false, seq: 0, kind: '', x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 0, s: 0, s2: 0, rot: 0, vrot: 0, c: '', c2: '', grav: 0, bounced: false, layer: 0 });
  }
  let partSeq = 0;
  function resetPool() {
    for (let i = 0; i < MAX_PARTS; i++) PART_POOL[i].active = false;
    partSeq = 0;
  }
  function spawnPart(kind, x, y, vx, vy, t, life, s, s2, c, c2, rot, vrot, grav, layer) {
    let slot = null;
    let oldest = null;
    for (let i = 0; i < MAX_PARTS; i++) {
      const p = PART_POOL[i];
      if (!p.active) { slot = p; break; }
      if (!oldest || p.seq < oldest.seq) oldest = p;
    }
    const p = slot || oldest;
    p.active = true; p.seq = ++partSeq; p.kind = kind;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = t; p.life = life;
    p.s = s; p.s2 = s2; p.c = c; p.c2 = c2; p.rot = rot; p.vrot = vrot;
    p.grav = grav; p.bounced = false; p.layer = layer;
  }

  let G = null;               // 현재 판 상태
  let cv, ctx, cw = 0, ch = 0, dpr = 1, raf = 0, lastT = 0;
  let btnRects = [];
  let miniSz = null; // 미니맵 CSS 크기·백버퍼 배율 캐시 (화면 크기가 바뀌면 다시 잼)
  const keys = {};

  function toast(msg) { if (window.TankLobby) window.TankLobby.toast(msg); }

  function resize() {
    if (!cv) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = window.innerWidth; ch = window.innerHeight;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    miniSz = null;
    btnRects = Array.from(document.querySelectorAll('#s-game .pad, #s-game .fire, #s-game .power, #s-game .sp-back, #s-game .aimread, #s-game .fuel, #s-game .hud > *'))
      .filter((e) => e.offsetParent !== null).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left - 8, t: r.top - 8, r: r.right + 8, b: r.bottom + 8 }; });
  }

  // ---------------------------------------------------------------- 시작/끝
  function start(m) {
    stop(true);
    const T = new Art.Terrain(m.gw, m.gh, 4);
    T.load(m.rle, m.geo);
    const meta = {};
    m.tanks.forEach((t) => { meta[t.id] = t; });
    const me = meta[m.me] ? m.me : null;
    const wn = m.wn || m.next || null;
    resetPool();
    G = {
      T, geo: m.geo || null, meta, me, side: m.side, snaps: [], events: [], est: null, renderK: m.k || 0, appliedK: m.k || 0,
      wind: m.wind, wn, lastWindAt: null, windBlink: false, rc: m.rc != null ? m.rc : -(m.cdn || 0),
      tl: m.endsIn, cdn: m.cdn, startCdn: m.cdn, startedAt: performance.now(),
      aim: { a: null, p: null, sentA: null, sentP: null, sentAt: 0, edge: 0, edgeSide: 0 },
      input: 0, cam: { x: 0, y: 0, ok: false }, zoom: false, spec: !me || !!m.spec, specId: null, specInfo: null, specAsked: false,
      camState: { mode: 'self', sid: null, own: null, fireAt: 0, impactAt: 0, holdUntil: 0, returnStartAt: 0, returnFromX: 0, returnFromY: 0, impactFromX: 0, impactFromY: 0, lastX: 0, lastY: 0, predX: 0, predY: 0, predT: 0, vx: 0, vy: 0, wind: 0, hasShell: false, reason: 'auto' },
      shellOwn: {}, lastShells: [], miniMarks: [], offHits: [], banners: [],
      dead: {}, deadAt: 0, endSeen: false, trails: {}, faceAnim: {}, nums: [], phase: {}, recoil: {}, lastShotP: null, lastLocalFireAt: 0,
      over: null, resultTimer: 0, shake: 0, hitShakeUntil: 0, hitShakeAmp: 0, minimapT: 0, goT: 0, moving: false
    };
    const fxLog = [];
    fxLog.labels = [];
    const dbgKeep = window.__tankDbg || {};   // share.js 의 install · lastInvite 는 판이 바뀌어도 유지
    window.__tankDbg = {
      install: dbgKeep.install, lastInvite: dbgKeep.lastInvite,
      wind: m.wind, windNextAt: wn ? wn.at : null, windChanges: [], blinkStarts: [], tags: [],
      fx: fxLog, booms: [], me: null, tanks: [],
      cam: { x: 0, y: 0, scale: 1, cw, ch }, map: { W: WW, H: WH },
      score: { kills: 0, hits: 0, dealt: 0, ffk: 0 },
      cam_log: [], camMode: 'self', aim: { a: null, p: null },
      minimap: { w: 0, h: 0, dpr: 1 },
      teamStyle: { A: { c: Art.TEAM.A.c, mark: Art.TEAM.A.mark }, B: { c: Art.TEAM.B.c, mark: Art.TEAM.B.mark } }
    };
    $('#s-game').hidden = false;
    $('#result').hidden = true; $('#menu').hidden = true;
    setSpecUI(G.spec);
    $('#h-zoom').classList.remove('on');
    // 지난 판의 '마지막 발사 파워' 표시는 새 판에서 숨김
    setStyle('#p-last', 'display', 'none');
    SND.music(false);
    resize();
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
    if (G.spec) Net.send({ t: 'tkspec', d: 0 });
  }
  function stop(silent) {
    cancelAnimationFrame(raf); raf = 0;
    if (G) {
      if (G.resultTimer) clearTimeout(G.resultTimer);
      sendInput(0, true); SND.engine(false);
    }
    G = null;
    if (!silent) $('#s-game').hidden = true;
  }
  function active() { return !!G; }

  function setSpecUI(on) {
    $('#ctl').hidden = !!on;
    $('#spec').hidden = !on;
    resize();
  }

  function pushDbg(arr, item, max) {
    if (!arr) return;
    arr.push(item);
    if (arr.length > max) arr.shift();
  }
  function camOwnerId() {
    if (!G) return null;
    if (!G.spec && G.me) return G.me;
    if (G.spec && G.specId) return G.specId;
    return G.me;
  }
  function finishCamLog(now, reason) {
    const cs = G && G.camState;
    if (!cs || cs.mode === 'self') return;
    if (window.__tankDbg) {
      pushDbg(window.__tankDbg.cam_log, {
        fireAt: Math.round(cs.fireAt),
        impactAt: cs.impactAt ? Math.round(cs.impactAt) : null,
        returnStartAt: cs.returnStartAt ? Math.round(cs.returnStartAt) : Math.round(now),
        returnDoneAt: Math.round(now),
        reason: reason || cs.reason || 'auto'
      }, 20);
    }
    cs.mode = 'self'; cs.sid = null; cs.own = null;
  }
  function startReturn(now, reason) {
    const cs = G && G.camState;
    if (!cs || cs.mode === 'self' || cs.mode === 'return') return;
    cs.mode = 'return';
    cs.reason = reason || cs.reason || 'auto';
    cs.returnStartAt = now;
    cs.returnFromX = G.cam.x;
    cs.returnFromY = G.cam.y;
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
    G.snaps.push({ k: m.k, tanks, sh, tl: m.tl, cdn: m.cdn, rc: m.rc, w: m.w, wn: m.wn });
    if (G.snaps.length > 40) G.snaps.shift();
    if (G.snaps.length === 1) { G.tl = m.tl; G.cdn = m.cdn; G.wind = m.w; if (m.wn) G.wn = m.wn; if (m.rc != null) G.rc = m.rc; }
    const mine = G.me && tanks[G.me];
    if (mine && G.aim.a == null) { G.aim.a = mine[I.a]; G.aim.p = mine[I.p]; }
    if (window.__tankDbg) {
      window.__tankDbg.tanks = m.tanks.map((t) => {
        const meta = G.meta[t[0]] || {};
        return { pid: t[0], name: meta.n || '', x: t[I.x], y: t[I.y], alive: t[I.st] !== 2, team: meta.tm || '', ai: !!meta.ai };
      });
      if (mine) {
        const mm = G.meta[G.me] || {};
        window.__tankDbg.me = { pid: G.me, x: mine[I.x], y: mine[I.y], alive: mine[I.st] !== 2, team: mm.tm || '', kind: mm.k || '' };
        if (mine.length > I.ffk) {
          window.__tankDbg.score = { kills: mine[I.kl] || 0, hits: mine[I.ht] || 0, dealt: mine[I.dl] || 0, ffk: mine[I.ffk] || 0 };
        }
      }
    }
  }
  function onEvent(m) {
    if (!G) return;
    if (m.t === 'tkshot') {
      G.shellOwn[m.sid] = m.id;
      if (m.id === camOwnerId()) {
        const t = performance.now();
        const cs = G.camState;
        if (cs.mode !== 'self') finishCamLog(t, 'early');
        const fireAt = (m.id === G.me && G.lastLocalFireAt && t - G.lastLocalFireAt < 400) ? G.lastLocalFireAt : t;
        if (m.id === G.me) G.lastLocalFireAt = 0;
        cs.startedSid = m.sid;
        cs.mode = 'follow'; cs.sid = m.sid; cs.own = m.id;
        cs.fireAt = fireAt; cs.impactAt = 0; cs.holdUntil = 0; cs.returnStartAt = 0;
        cs.lastX = m.x; cs.lastY = m.y; cs.predX = m.x; cs.predY = m.y; cs.predT = t;
        cs.vx = m.vx || 0; cs.vy = m.vy || 0; cs.wind = m.w != null ? m.w : (G.wind || 0);
        cs.hasShell = false; cs.reason = 'auto';
      }
    }
    G.events.push(m);
  }
  function onSpecTo(m) {
    if (!G) return;
    if (G.specId && m.id && G.specId !== m.id && G.camState && G.camState.mode !== 'self') {
      finishCamLog(performance.now(), 'early');
    }
    G.specId = m.id || G.specId;
    if (m.id) G.specInfo = m;
    const bar = $('#spec-bar');
    if (!m.id) { bar.textContent = '관전 중 · 남은 탱크가 없어요'; return; }
    const T = Art.TEAM[m.tm];
    bar.innerHTML = `관전 중 · <u class="tm${m.tm}"><span class="tmark ${m.tm}">${T.mark}</span>${m.tm}</u> <b>${esc(m.n)}</b> · ${KN[m.k] || ''}${m.ai ? ` <span class="tagai">AI ${m.lv === 'normal' ? '보통' : '쉬움'}</span>` : ''}`;
    $('#sp-prev').classList.toggle('dim', (m.cnt || 0) <= 1);
    $('#sp-next').classList.toggle('dim', (m.cnt || 0) <= 1);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function applyEvent(e) {
    const T = G.T;
    if (e.t === 'tkshot') {
      const t = performance.now();
      G.recoil[e.id] = t;
      G.shellOwn[e.sid] = e.id;
      spawnPart('flash', e.x, e.y, 0, 0, t, 0.12, 14, 24, '#ffe68c', '#ff9d2e', 0, 0, 0, 1);
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140;
        spawnPart('spark', e.x, e.y, Math.cos(a) * v, Math.sin(a) * v - 20, t, 0.18 + Math.random() * 0.14, 2.2, 0.5, '#fff3a8', '#ff8820', 0, 0, 220, 1);
      }
      for (let i = 0; i < 2; i++) {
        spawnPart('smoke', e.x + (Math.random() - 0.5) * 8, e.y + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 18, -18 - Math.random() * 16, t, 0.45 + Math.random() * 0.25, 6, 14, 'rgba(210,195,185,.45)', '', 0, 0, -25, 1);
      }
      if (e.id !== G.me) SND.SFX.fire();
      if (e.id === G.me) G.lastShotP = Math.round(G.aim.p);
      // 내 포탄(관전 시 관전 대상의 포탄) 따라가기 시작 (onEvent 에서 이미 시작되지 않았을 때만)
      // · 받자마자(onEvent) 시작한 포탄은 그 사이 빈 화면 터치로 복귀했어도 다시 따라가지 않음
      if (e.id === camOwnerId() && G.camState.startedSid !== e.sid) {
        const cs = G.camState;
        cs.startedSid = e.sid;
        if (cs.mode !== 'self') finishCamLog(t, 'early');
        const fireAt = (e.id === G.me && G.lastLocalFireAt && t - G.lastLocalFireAt < 400) ? G.lastLocalFireAt : t;
        if (e.id === G.me) G.lastLocalFireAt = 0;
        cs.mode = 'follow'; cs.sid = e.sid; cs.own = e.id;
        cs.fireAt = fireAt; cs.impactAt = 0; cs.holdUntil = 0; cs.returnStartAt = 0;
        cs.lastX = e.x; cs.lastY = e.y; cs.predX = e.x; cs.predY = e.y; cs.predT = t;
        cs.vx = e.vx || 0; cs.vy = e.vy || 0; cs.wind = e.w != null ? e.w : (G.wind || 0);
        cs.hasShell = false; cs.reason = 'auto';
      }
    } else if (e.t === 'tkboom') {
      const nearTop = !T.solid(e.x, e.y - 10);
      T.carve(e.x, e.y, e.cr || e.r);
      G.minimapT = 0;
      const t = performance.now();
      const er = e.r || 36;
      // 폭발: 섬광 코어 + 섬광 링 + 불꽃 구 + 연기 덩어리 + 불티
      spawnPart('flash', e.x, e.y, 0, 0, t, 0.16, er * 0.55, er * 1.15, '#fffce0', '#ffaa38', 0, 0, 0, 1);
      spawnPart('ring', e.x, e.y, 0, 0, t, 0.30, er * 0.45, er * 1.95, '#fff7cc', '#ff8e30', 0, 0, 0, 1);
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI * 2, dist = Math.random() * er * 0.35;
        spawnPart('fire', e.x + Math.cos(ang) * dist, e.y + Math.sin(ang) * dist, (Math.random() - 0.5) * 45, -25 - Math.random() * 45, t + i * 20, 0.28 + Math.random() * 0.16, er * 0.35, er * 0.85, '#fff09c', '#ff6418', 0, 0, -40, 1);
      }
      for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2, dist = Math.random() * er * 0.55;
        spawnPart('smoke', e.x + Math.cos(ang) * dist, e.y + Math.sin(ang) * dist * 0.65, (Math.random() - 0.5) * 28, -28 - Math.random() * 28, t + i * 35, 0.8 + Math.random() * 0.45, 10 + Math.random() * 8, 22 + Math.random() * 14, i < 2 ? '#785046' : '#52424a', '', 0, 0, -30, 1);
      }
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2, spd = 150 + Math.random() * 260;
        spawnPart('spark', e.x, e.y, Math.cos(ang) * spd, Math.sin(ang) * spd - 90, t, 0.32 + Math.random() * 0.32, 2.8, 0.6, '#fff296', '#ff6b1a', 0, 0, 420, 1);
      }
      // 흙 파편 (지형 색 · 중력 · 회전 · 지면 튕김 1회)
      const soilCols = ['#5c3320', '#7a452a', '#3f2115', '#68473f'];
      for (let i = 0; i < 14; i++) {
        const ang = -Math.PI * (0.1 + Math.random() * 0.8), spd = 110 + Math.random() * 250;
        const col = (nearTop && i < 3) ? '#6aa628' : soilCols[(Math.random() * soilCols.length) | 0];
        spawnPart('soil', e.x + (Math.random() - 0.5) * 12, e.y - 2, Math.cos(ang) * spd, Math.sin(ang) * spd - 60, t, 0.85 + Math.random() * 0.65, 3.5 + Math.random() * 4.5, 0, col, '#28130b', Math.random() * 6.28, (Math.random() - 0.5) * 14, 880, 0);
      }
      const near = nearFactor(e.x, e.y);
      SND.SFX.boom(near);
      const ownerId = camOwnerId();
      const myTeam = G.me && G.meta[G.me] ? G.meta[G.me].tm : (ownerId && G.meta[ownerId] ? G.meta[ownerId].tm : null);
      const shooter = e.own || G.shellOwn[e.sid] || null;
      const isMine = !!(G.me && shooter === G.me);
      const isOwner = !!(ownerId && shooter === ownerId);
      const hits = e.hits || [];
      if (window.__tankDbg) {
        pushDbg(window.__tankDbg.booms, {
          t: Math.round(t), own: shooter, x: e.x, y: e.y,
          hits: hits.map((h) => ({ id: h.id, dmg: h.dmg, kill: !!h.kill, ff: !!h.ff }))
        }, 50);
      }
      // 포탄 따라가기 카메라 착탄 전환 (머무름 포함 4.8초 이내 복귀)
      const cs = G.camState;
      if (cs.mode === 'follow' && cs.sid === e.sid) {
        cs.impactAt = t; cs.lastX = e.x; cs.lastY = e.y;
        cs.impactFromX = G.cam.x; cs.impactFromY = G.cam.y;
        const maxReturnStart = cs.fireAt + 4320;
        const rem = maxReturnStart - t;
        if (rem >= 1350) { cs.mode = 'impact'; cs.holdUntil = t + 1350; cs.reason = 'auto'; }
        else if (rem >= 600) { cs.mode = 'impact'; cs.holdUntil = t + rem; cs.reason = 'auto'; }
        else if (t + 600 <= cs.fireAt + 4550) { cs.mode = 'impact'; cs.holdUntil = t + 600; cs.reason = 'early'; }
        else { startReturn(t, 'early'); }
      }
      // 미니맵 착탄 표지 (내 포탄 / 관전 대상 포탄 · 3초)
      if (isOwner) {
        const mkind = hits.length === 0 ? 'miss' : (hits.some((h) => !h.ff) ? 'hit' : 'ff');
        G.miniMarks.push({ x: e.x, y: e.y, kind: mkind, t });
      }
      // 내 탄이 아닌 폭발의 거리 감쇠 흔들림 (내 포탄 적 명중 시는 아래에서 0.25초 짧은 흔들림 적용)
      if (!isMine) {
        const foc = focusTank();
        const refX = foc ? foc.x : G.cam.x, refY = foc ? foc.y : G.cam.y;
        const distRef = G.cam.ok ? Math.hypot(e.x - refX, e.y - refY) : 600;
        const shakeAtten = Math.max(0, 1 - distRef / 1150);
        G.shake = Math.max(G.shake, shakeAtten * shakeAtten * (er / 44) * 10);
      }
      // 명중 · 빗나감 · 아군 오사 피드백 & QA 기록
      if (isMine) {
        if (hits.length === 0) {
          G.nums.push({ miss: true, mine: true, x: e.x, y: e.y, t });
          if (window.__tankDbg) {
            pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'miss_mine', id: null, dmg: 0, x: e.x, y: e.y, own: shooter }, 50);
          }
        } else {
          let hitEnemy = false, hitAlly = false, killedEnemy = false, killedAlly = false;
          let killEnemyDmg = 0, killAllyDmg = 0;
          hits.forEach((h) => {
            const ht = G.cur && G.cur[h.id];
            const ff = !!h.ff;
            if (!h.kill) {
              G.nums.push({ id: h.id, dmg: h.dmg, mine: true, ff, ally: ff, x: ht ? ht.x : e.x, y: ht ? ht.y : e.y, t });
            }
            if (ff) {
              hitAlly = true;
              if (h.kill) { killedAlly = true; killAllyDmg += (h.dmg || 0); }
              if (window.__tankDbg) {
                pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'ff_mine', id: h.id, dmg: h.dmg, x: e.x, y: e.y, own: shooter }, 50);
                if (h.kill) pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'ff_kill_mine', id: h.id, dmg: h.dmg, x: e.x, y: e.y, own: shooter }, 50);
              }
            } else {
              hitEnemy = true;
              if (h.kill) { killedEnemy = true; killEnemyDmg += (h.dmg || 0); }
              if (window.__tankDbg) {
                pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'hit_mine', id: h.id, dmg: h.dmg, x: e.x, y: e.y, own: shooter }, 50);
                if (h.kill) pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'kill_mine', id: h.id, dmg: h.dmg, x: e.x, y: e.y, own: shooter }, 50);
              }
            }
          });
          if (hitEnemy) {
            SND.SFX.hit();
            G.hitShakeUntil = t + 250;
            G.hitShakeAmp = 5.5;
          }
          if (hitAlly) SND.SFX.allyHit();
          if (killedEnemy) {
            SND.SFX.kill();
            const kText = killEnemyDmg > 0 ? `격추! -${killEnemyDmg}` : '격추!';
            G.banners.push({ text: kText, color: '#FFE27A', stroke: '#2c0a10', t, dur: 1.5 });
          }
          if (killedAlly) {
            const akText = killAllyDmg > 0 ? `아군 격추 -${killAllyDmg}` : '아군 격추';
            G.banners.push({ text: akText, color: Art.FF.c, stroke: Art.FF.stroke, t, dur: 1.5 });
          }
        }
      } else {
        hits.forEach((h) => {
          const ht = G.cur && G.cur[h.id];
          // 자홍 '아군 피격'은 같은 팀이 쏜 탄일 때만 — 적이 우리 편을 맞힌 건 일반 피해(빨강)
          const ff = isFf(e, h);
          const mate = !ff && !!(myTeam && h.team === myTeam);
          G.nums.push({ id: h.id, dmg: h.dmg, mine: false, ff, ally: ff, mate, x: ht ? ht.x : e.x, y: ht ? ht.y : e.y, t });
          if (window.__tankDbg) {
            pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'hit_other', id: h.id, dmg: h.dmg, x: e.x, y: e.y, own: shooter }, 50);
            if (ff) pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'ally_hit', id: h.id, dmg: h.dmg, x: e.x, y: e.y, own: shooter, tm: h.team, myTm: !!(myTeam && h.team === myTeam) }, 50);
            if (mate) pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'mate_hit', id: h.id, dmg: h.dmg, x: e.x, y: e.y, own: shooter }, 50);
          }
          if (h.id === G.me) { SND.SFX.hurt(); try { navigator.vibrate && navigator.vibrate(40); } catch (er2) { /* 무시 */ } }
        });
      }
      // 화면 밖 명중 가장자리 배지 (착탄 지점이 화면 안이거나 착탄 카메라가 비추는 중이면 띄우지 않음)
      if (hits.length > 0 && !(cs.mode === 'impact' && cs.sid === e.sid)) {
        const [sx, sy] = toScreen(e.x, e.y);
        if (sx < 0 || sx > cw || sy < 46 || sy > ch) {
          const allFf = isMine && hits.every((h) => !!h.ff);
          const anyFf = hits.some((h) => isFf(e, h));
          const anyMate = !anyFf && !!(myTeam && hits.some((h) => h.team === myTeam));
          G.offHits.push({ x: e.x, y: e.y, t, mine: isMine, ff: allFf, anyFf, anyMate });
          if (isMine && window.__tankDbg) {
            pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'offscreen_hit', id: hits[0].id, dmg: hits[0].dmg, x: e.x, y: e.y, own: shooter }, 50);
          }
        }
      }
      delete G.trails[e.sid];
      delete G.shellOwn[e.sid];
    } else if (e.t === 'tkgone') {
      const t = performance.now();
      const shooter = e.own || G.shellOwn[e.sid] || null;
      const isMine = !!(G.me && shooter === G.me);
      const gx = e.x != null ? e.x : (G.camState.sid === e.sid ? G.camState.lastX : G.cam.x);
      const gy = e.y != null ? e.y : (G.camState.sid === e.sid ? G.camState.lastY : G.cam.y);
      if (window.__tankDbg) {
        pushDbg(window.__tankDbg.booms, {
          t: Math.round(t), own: shooter, x: gx, y: gy, hits: [], gone: true
        }, 50);
      }
      if (isMine) {
        G.nums.push({ miss: true, mine: true, gone: true, x: gx, y: gy, t });
        if (window.__tankDbg) {
          pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: 'miss_mine', id: null, dmg: 0, x: gx, y: gy, own: shooter }, 50);
        }
      }
      if (G.camState.mode === 'follow' && G.camState.sid === e.sid) {
        G.camState.impactAt = t;
        G.camState.lastX = gx;
        G.camState.lastY = gy;
        startReturn(t, 'auto');
      }
      delete G.trails[e.sid];
      delete G.shellOwn[e.sid];
    } else if (e.t === 'tkdeath') {
      G.dead[e.id] = { t: performance.now(), cause: e.cause, by: e.by || '', ff: !!e.ff };
      if (e.cause === 'fall') SND.SFX.fall();
      // 흙다리를 파서 떨어뜨린 추락도 쏜 사람의 격추로 인정 (서버 by) — 내 탄이면 배너
      if (e.cause === 'fall' && e.by && e.by === G.me && e.id !== G.me) {
        const t = performance.now();
        if (e.ff) G.banners.push({ text: '아군 추락', color: Art.FF.c, stroke: Art.FF.stroke, t, dur: 1.5 });
        else { SND.SFX.kill(); G.banners.push({ text: '추락 격추!', color: '#FFE27A', stroke: '#2c0a10', t, dur: 1.5 }); }
        if (window.__tankDbg) pushDbg(window.__tankDbg.fx, { t: Math.round(t), kind: e.ff ? 'ff_fall_mine' : 'fall_kill_mine', id: e.id, dmg: 0, x: 0, y: 0, own: G.me }, 50);
      }
      if (e.id === G.me && !G.deadAt) G.deadAt = performance.now();
    } else if (e.t === 'tkwind') {
      const nw = e.cur != null ? e.cur : G.wind;
      const nxt = e.next || { at: e.at, w: e.w };
      const changedAt = G.wn ? G.wn.at : e.rc;
      G.wind = nw;
      G.wn = nxt;
      if (G.lastWindAt !== nxt.at) {
        G.lastWindAt = nxt.at;
        if (window.__tankDbg) window.__tankDbg.windChanges.push({ t: Math.round(performance.now()), w: nw });
      }
      void changedAt;
    }
  }

  // 같은 팀이 쏜 탄에 맞았는지 (서버 ff 표시 또는 쏜 사람 팀 === 맞은 팀)
  function isFf(e, h) {
    if (h.ff) return true;
    let ot = e.ownTeam;
    if (!ot && e.own && G.meta[e.own]) ot = G.meta[e.own].tm;
    return !!(ot && h.team && ot === h.team);
  }
  function onEnd(m) {
    if (!G) return;
    // 판 끝을 받은 즉시 표시(결과 화면은 렌더 시간선에 맞춰 조금 뒤) — 이 뒤로는 관전 전환(tkspec)을 보내지 않음
    G.endSeen = true;
    G.events.push(m);
  }
  function showResult(m) {
    G.over = m;
    if (window.__tankDbg && G.me) {
      const ms = m.stats.find((s) => s.id === G.me);
      if (ms) {
        window.__tankDbg.score = { kills: ms.kills || 0, hits: ms.hits || 0, dealt: ms.dealt || 0, ffk: ms.ffk || 0 };
      }
    }
    const myTeam = G.me && G.meta[G.me] ? G.meta[G.me].tm : null;
    let title;
    if (m.win === 'draw') title = '무승부!';
    else if (myTeam) title = m.win === myTeam ? '우리 팀 승리!' : '아쉬워요, 졌어요';
    else title = `팀 ${m.win} 승리!`;
    if (myTeam && m.win === myTeam) SND.SFX.win(); else SND.SFX.lose();
    const by = m.by === 'wipe' ? '상대 팀을 모두 물리쳤어요' : '시간 끝 · 남은 탱크 수, 같으면 체력 비율로 판정';
    const CAUSE = { hit: '격추', fall: '추락' };
    const tmOf = (id) => (G.meta[id] ? G.meta[id].tm : null);
    const rows = m.stats.slice().sort((a, b) => b.dealt - a.dealt).map((s) => {
      const T = Art.TEAM[s.tm];
      let deadCause = CAUSE[s.cause] || (G.dead[s.id] && CAUSE[G.dead[s.id].cause]) || '탈락';
      // 추락: 적이 발밑을 파서 떨어뜨렸으면 '격추(추락)', 아군 탄이면 '추락(아군)', 스스로 떨어지면 '추락'
      const killer = s.by || (G.dead[s.id] && G.dead[s.id].by) || '';
      if ((s.cause || (G.dead[s.id] && G.dead[s.id].cause)) === 'fall' && killer && killer !== s.id) {
        deadCause = tmOf(killer) && tmOf(killer) === s.tm ? '추락(아군)' : '격추(추락)';
      }
      const st = (s.alive ? '생존' : deadCause) + (s.ffk ? ` · <span style="color:${Art.FF.c}">아군 오사 ${s.ffk}</span>` : '');
      return `<tr${s.id === G.me ? ' style="color:#FFE27A"' : ''}><td><span class="tmark ${s.tm}">${T.mark}</span>${s.tm}</td><td>${esc(s.n)}</td><td>${KN[s.k]}</td><td>${s.shots}발</td><td>${s.hits}명중</td><td>${s.dealt}</td><td>${st}</td></tr>`;
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
  // 관전 대상 바꾸기: 판이 끝났거나(결과 대기 포함) 끝을 받은 뒤에는 보내지 않음
  function sendSpec(d) {
    if (!G || G.over || G.endSeen) return;
    Net.send({ t: 'tkspec', d });
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
  function fire() {
    if (!canControl() || G.aim.a == null || portrait()) return;
    const s = myState();
    if (G.cdn > 0) { SND.SFX.deny(); toast('시작 신호 뒤에 쏠 수 있어요'); return; }
    if (s && s.cd > 0) { SND.SFX.deny(); return; }
    Net.send({ t: 'tkfire', a: Math.round(G.aim.a), p: Math.round(G.aim.p) });
    SND.SFX.fire();
    const t = performance.now();
    G.recoil[G.me] = t;
    G.lastLocalFireAt = t;
  }

  function setupInput() {
    bindHold($('#b-left'), 'left'); bindHold($('#b-right'), 'right');
    bindHold($('#b-up'), 'up'); bindHold($('#b-down'), 'down');
    const pw = $('#power');
    let pwOffset = 0;
    const setPower = (clientY) => {
      const tr = $('#power .ptrack').getBoundingClientRect();
      if (!tr.height) return;
      const p = Math.round(100 * (1 - (clientY - pwOffset - tr.top) / tr.height));
      if (G && G.aim.a != null) G.aim.p = Math.max(0, Math.min(100, p));
    };
    pw.addEventListener('pointerdown', (e) => {
      e.preventDefault(); SND.unlock();
      try { pw.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ }
      held.power = e.pointerId;
      const kr = $('#p-knob').getBoundingClientRect();
      const kc = kr.top + kr.height / 2;
      pwOffset = Math.abs(e.clientY - kc) <= kr.height * 0.65 ? (e.clientY - kc) : 0;
      setPower(e.clientY);
    });
    pw.addEventListener('pointermove', (e) => { if (held.power === e.pointerId) setPower(e.clientY); });
    const pup = (e) => {
      if (held.power === e.pointerId) {
        delete held.power;
        pwOffset = 0;
        if (G && G.aim.a != null && canControl()) {
          const a = Math.round(G.aim.a), p = Math.round(G.aim.p);
          if (a !== G.aim.sentA || p !== G.aim.sentP) {
            G.aim.sentA = a; G.aim.sentP = p; G.aim.sentAt = performance.now();
            Net.send({ t: 'tkaim', a, p });
          }
        }
      }
    };
    pw.addEventListener('pointerup', pup); pw.addEventListener('pointercancel', pup);
    // 버튼이 아닌 화면 빈 곳 터치 시 즉시 내 탱크로 복귀 시작
    cv.addEventListener('pointerdown', () => {
      if (!G || G.zoom) return;
      if (G.camState && (G.camState.mode === 'follow' || G.camState.mode === 'impact')) {
        startReturn(performance.now(), 'touch');
      }
    });
    $('#b-fire').addEventListener('pointerdown', (e) => { e.preventDefault(); SND.unlock(); fire(); });
    $('#sp-prev').addEventListener('pointerdown', (e) => { e.preventDefault(); SND.SFX.click(); sendSpec(-1); });
    $('#sp-next').addEventListener('pointerdown', (e) => { e.preventDefault(); SND.SFX.click(); sendSpec(1); });
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
      if (G.spec && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.repeat) sendSpec(e.key === 'ArrowLeft' ? -1 : 1);
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
    const s = f >= 0.5 ? b : a;
    if (s.tl != null) G.tl = s.tl;
    if (s.cdn != null) G.cdn = s.cdn;
    if (a.rc != null && b.rc != null) G.rc = a.rc + (b.rc - a.rc) * f;
    else if (s.rc != null) G.rc = s.rc;
    if (s.wn && (!G.wn || s.wn.at > G.wn.at)) {
      G.wind = s.w;
      G.wn = s.wn;
      if (G.lastWindAt !== s.wn.at) {
        G.lastWindAt = s.wn.at;
        if (window.__tankDbg) window.__tankDbg.windChanges.push({ t: Math.round(performance.now()), w: s.w });
      }
    }
    // 이벤트 적용 (렌더 시간선에 맞춰)
    G.events.sort((x, y) => x.k - y.k);
    while (G.events.length && G.events[0].k <= rk + 0.5) {
      const e = G.events.shift();
      if (e.t === 'tkend') {
        G.over = e;
        if (window.__tankDbg && G.me) {
          const ms = e.stats.find((s) => s.id === G.me);
          if (ms) {
            window.__tankDbg.score = { kills: ms.kills || 0, hits: ms.hits || 0, dealt: ms.dealt || 0, ffk: ms.ffk || 0 };
          }
        }
        setSpecUI(false); $('#ctl').hidden = true;
        sendInput(0, true);
        if (G.resultTimer) clearTimeout(G.resultTimer);
        G.resultTimer = setTimeout(() => { if (G && G.over === e) showResult(e); }, 2000);
      } else applyEvent(e);
    }
    return { tanks: out, shells };
  }

  // ---------------------------------------------------------------- 카메라·좌표
  function scale() {
    if (G.zoom) return Math.min(cw / (WW + 80), (ch - 50) / 1000);
    // 휴대폰 가로(높이 360~430)에서 탱크가 화면 높이의 약 20%(80~95px)로 보이도록 기본 배율 상향
    return Math.max(0.95, Math.min(1.9, ch / 236));
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
  function selfTarget(s) {
    const t = focusTank();
    if (!t) return [G.cam.ok ? G.cam.x : WW / 2, G.cam.ok ? G.cam.y : 500];
    // 탱크를 HUD(또는 관전 막대) 아래·버튼 위 사이 높이에
    const playTop = G.spec ? 94 : 50, playBot = ch - 96;
    const want = playTop + (playBot - playTop) * (G.spec ? 0.48 : 0.45);
    return [t.x, (t.y - 20) + (ch / 2 - want) / s];
  }
  function clampCam(tx, ty, s) {
    const halfW = cw / 2 / s, halfH = ch / 2 / s;
    return [
      Math.max(halfW - 60, Math.min(WW + 60 - halfW, tx)),
      Math.max(-300 + halfH, Math.min(WH + 40 - halfH, ty))
    ];
  }
  function updateCam(dt, now, shells) {
    const s = scale();
    const cs = G.camState;
    let tx, ty, handled = false;
    if (G.zoom) {
      if (cs.mode !== 'self') finishCamLog(now, 'early');
      tx = WW / 2; ty = 520;
    } else {
      if (cs.mode === 'follow') {
        if (now >= cs.fireAt + 4320) {
          startReturn(now, 'early');
        } else {
          if (shells) {
            const sh = shells.find((x) => x.sid === cs.sid);
            if (sh) {
              cs.hasShell = true;
              cs.lastX = sh.x; cs.lastY = sh.y;
            }
          }
          if (!cs.hasShell) {
            const sdt = Math.min(0.05, Math.max(0, (now - (cs.predT || now)) / 1000));
            cs.predT = now;
            if (sdt > 0) {
              cs.vx += (cs.wind != null ? cs.wind : (G.wind || 0)) * sdt;
              cs.vy += 600 * sdt;
              cs.predX += cs.vx * sdt;
              cs.predY += cs.vy * sdt;
            }
            cs.lastX = cs.predX; cs.lastY = cs.predY;
          } else {
            cs.vx += (G.wind || 0) * dt;
            cs.vy += 600 * dt;
          }
          const halfW = cw / 2 / s, halfH = ch / 2 / s;
          const lookX = Math.max(-halfW * 0.42, Math.min(halfW * 0.42, cs.vx * 0.28));
          const lookY = Math.max(-halfH * 0.28, Math.min(halfH * 0.28, cs.vy * 0.16));
          [tx, ty] = clampCam(cs.lastX + lookX, cs.lastY + lookY, s);
        }
      }
      if (cs.mode === 'impact') {
        if (now >= cs.holdUntil || now >= cs.fireAt + 4550) {
          startReturn(now, cs.holdUntil > cs.fireAt + 4320 ? 'early' : cs.reason);
        } else {
          const [ix, iy] = clampCam(cs.lastX, cs.lastY, s);
          const u = Math.min(1, Math.max(0, (now - cs.impactAt) / 260));
          const ease = 1 - Math.pow(1 - u, 3);
          G.cam.x = cs.impactFromX + (ix - cs.impactFromX) * ease;
          G.cam.y = cs.impactFromY + (iy - cs.impactFromY) * ease;
          handled = true;
        }
      }
      if (cs.mode === 'return') {
        const [sx, sy] = selfTarget(s);
        const [rx, ry] = clampCam(sx, sy, s);
        const dur = Math.max(180, Math.min(480, cs.fireAt + 4750 - cs.returnStartAt));
        const u = Math.min(1, Math.max(0, (now - cs.returnStartAt) / dur));
        const ease = 1 - Math.pow(1 - u, 3);
        G.cam.x = cs.returnFromX + (rx - cs.returnFromX) * ease;
        G.cam.y = cs.returnFromY + (ry - cs.returnFromY) * ease;
        if (u >= 1) {
          G.cam.x = rx; G.cam.y = ry;
          finishCamLog(now, cs.reason);
        }
        handled = true;
      }
      if (cs.mode === 'self') {
        const [sx, sy] = selfTarget(s);
        [tx, ty] = clampCam(sx, sy, s);
      }
    }
    if (!handled) {
      if (!G.cam.ok) { G.cam.x = tx; G.cam.y = ty; G.cam.ok = true; }
      const rate = cs.mode === 'follow' ? 16 : 8;
      const k = 1 - Math.exp(-rate * dt);
      G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
    }
    if (window.__tankDbg) {
      window.__tankDbg.camMode = cs.mode;
      // 월드→화면 변환 식: screenX = (worldX - cam.x) * cam.scale + cw / 2, screenY = (worldY - cam.y) * cam.scale + ch / 2 (cw = innerWidth, ch = innerHeight)
      window.__tankDbg.cam = { x: G.cam.x, y: G.cam.y, scale: s, cw, ch };
    }
  }
  // 월드→화면 변환 식: screenX = (worldX - cam.x) * cam.scale + cw / 2, screenY = (worldY - cam.y) * cam.scale + ch / 2
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
    G.lastShells = cur.shells;
    // 내 탱크 포신은 내 입력을 바로 보여 줌
    const me = G.me && G.cur[G.me];
    if (me && G.aim.a != null && canControl()) me.a = G.aim.a;
    // 내 탱크가 죽는 걸 처음 본 순간부터 1.4초 기다린 뒤 관전으로 (판이 끝났거나 끝을 받았으면 보내지 않음)
    if (me && me.st === 2 && !G.deadAt) G.deadAt = performance.now();
    if (me && me.st === 2 && !G.spec && G.deadAt && performance.now() - G.deadAt > 1400 && !G.over && !G.endSeen) {
      G.spec = true; setSpecUI(true); Net.send({ t: 'tkspec', d: 0 }); sendInput(0, true); SND.engine(false);
    }
    updateCam(dt, now, cur.shells);
    const s = scale();
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    Art.sky(c, cw, ch, G.cam.x, G.cam.y, s, now);
    // 흔들림 (일반 폭발 + 내 적 명중 0.25초 약한 흔들림)
    let sx = 0, sy = 0;
    let shakeAmp = 0;
    if (G.shake > 0.2) { shakeAmp = G.shake; G.shake *= Math.pow(0.02, dt); } else G.shake = 0;
    if (now < G.hitShakeUntil) {
      shakeAmp = Math.max(shakeAmp, G.hitShakeAmp * ((G.hitShakeUntil - now) / 250));
    }
    if (shakeAmp > 0.2) { sx = (Math.random() - 0.5) * shakeAmp; sy = (Math.random() - 0.5) * shakeAmp; }
    const ox = cw / 2 - G.cam.x * s + sx, oy = ch / 2 - G.cam.y * s + sy;
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    // 지형 (보이는 부분만) + 폭포
    const vl = Math.max(0, Math.floor(G.cam.x - cw / 2 / s - 4)), vt = Math.max(0, Math.floor(G.cam.y - ch / 2 / s - 4));
    const vr = Math.min(WW, Math.ceil(G.cam.x + cw / 2 / s + 4)), vb = Math.min(WH, Math.ceil(G.cam.y + ch / 2 / s + 4));
    if (vr > vl && vb > vt) c.drawImage(G.T.cv, vl, vt, vr - vl, vb - vt, vl, vt, vr - vl, vb - vt);
    // 맵 좌우 끝: 세로로 잘린 단면 대신 둥근 절벽 끝 + 안개 (캐시 그림)
    G.T.drawCaps(c, G.cam.x - cw / 2 / s - 4, G.cam.x + cw / 2 / s + 4);
    Art.drawWaterfalls(c, G.geo, G.T, now);
    // 탱크
    const list = Object.values(G.cur).sort((a, b) => (a.id === G.me) - (b.id === G.me));
    let anyMoving = false;
    for (const t of list) drawOneTank(c, t, now, dt);
    if (me && me.mv && !G.spec) anyMoving = true;
    if (anyMoving !== G.moving) { G.moving = anyMoving; SND.engine(anyMoving); }
    // 입자 물리 1패스 갱신 + 바닥 레이어 입자(흙 파편 · 포탄 연기 점)
    stepPool(now, dt);
    drawPoolLayer(c, now, 0);
    // 화면 좌표 레이어
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateCountdownDom(now);
    const lab = drawLabels(c, list, now, cur.shells);
    // 포탄 (닉네임 위) + 폭발 이펙트 레이어
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    drawShells(c, cur.shells, s, now);
    drawPoolLayer(c, now, 1);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 피해 숫자·배너는 버튼·카운트다운에 더해 이름표와 내 각도 숫자도 피함
    const fxAvoid = getFxAvoidRects().concat(lab.boxes);
    const showArc = !!(me && me.st !== 2 && canControl());
    if (showArc) fxAvoid.push(arcLabelBox(me));
    const fxCtx = { avoid: fxAvoid, placed: [], labels: [], nameBox: lab.byId };
    drawBanners(c, now, fxCtx);
    drawNums(c, now, fxCtx);
    if (showArc) drawArc(c, me, now);
    drawArrows(c, cur.shells, list);
    drawOffscreenHits(c, now, fxCtx);
    if (window.__tankDbg && window.__tankDbg.fx) window.__tankDbg.fx.labels = fxCtx.labels;
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
    // 표정 전환 & 눈 깜빡임 보간
    const targetF = t.st === 2 ? 2 : t.f;
    let fa = G.faceAnim[t.id];
    if (!fa) {
      fa = { cur: targetF, prev: targetF, t: now, nextBlink: now + 1800 + Math.random() * 2800, blinkEnd: 0 };
      G.faceAnim[t.id] = fa;
    } else if (fa.cur !== targetF) {
      fa.prev = fa.cur; fa.cur = targetF; fa.t = now;
    }
    const fLerp = Math.min(1, (now - fa.t) / 160);
    if (fa.cur === 0 && fLerp >= 1 && now >= fa.nextBlink) {
      fa.blinkEnd = now + 140;
      fa.nextBlink = now + 2600 + Math.random() * 3400;
    }
    const blink = now < fa.blinkEnd;
    // 그림자
    c.save(); c.globalAlpha = 0.25 * alpha; c.fillStyle = '#2a1020';
    c.beginPath(); c.ellipse(t.x, t.y + 1, Art.KIND[m.k].bw / 2 + 2, 4, 0, 0, Math.PI * 2); c.fill(); c.restore();
    Art.drawTank(c, t.x, t.y, {
      kind: m.k, face: t.fa, bt: t.bt, a: t.a,
      f: fa.cur, fPrev: fa.prev, fLerp, blink,
      phase: ph.v, team: m.tm, alpha, recoil: rc, shield: t.inv > 0 && t.st !== 2
    });
    void dt;
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
  const TAG_MARK_W = 14; // 이름표 앞 팀 모양 표지 자리(px)
  function drawLabels(c, list, now, shells) {
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const placed = [];
    const byId = {};
    const tags = [];
    const foc = focusTank();
    const refX = foc ? foc.x : G.cam.x;
    const refY = foc ? foc.y : G.cam.y;
    const cdnEl = $('#cdn');
    let cdnBox = null;
    if (cdnEl && !cdnEl.hidden) {
      const r = cdnEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) cdnBox = { l: r.left - 8, t: r.top - 8, r: r.right + 8, b: r.bottom + 8 };
    }
    const specEl = $('#spec-bar');
    let specBox = null;
    if (G.spec && specEl && !$('#spec').hidden) {
      const r = specEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) specBox = { l: r.left - 6, t: r.top - 6, r: r.right + 6, b: r.bottom + 6 };
    }

    // 포탄 화면 사각형 (겹치면 남의 이름표는 점으로)
    const shRects = [];
    if (shells) {
      for (let i = 0; i < shells.length; i++) {
        const [sx, sy] = toScreen(shells[i].x, shells[i].y);
        shRects.push({ l: sx - 20, t: sy - 20, r: sx + 20, b: sy + 20 });
      }
    }

    const items = [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.st === 2 || t.y >= WH + 100) continue;
      const m = G.meta[t.id], K = Art.KIND[m.k];
      const topOff = m.k === 'mangru' ? 50 : 38;
      const [x, rawY] = toScreen(t.x, t.y - topOff);
      const y = rawY - 14;
      const mine = t.id === G.me || (G.spec && t.id === G.specId);
      const dist = Math.hypot(t.x - refX, t.y - refY);
      items.push({ t, m, K, x, y, mine, dist });
    }
    // 우선순위: 나(또는 관전 대상) > 가까운 순
    items.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || a.dist - b.dist);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const { t, m, mine } = it;
      const teamCol = Art.TEAM[m.tm].c;

      // 주변 밀집도: 탱크가 4대 이상 가까이 몰리면 남의 이름은 alpha 0.55
      let cluster = 0;
      for (let j = 0; j < items.length; j++) {
        if (Math.hypot(items[j].x - it.x, items[j].y - it.y) < 170) cluster++;
      }
      const crowded = cluster >= 4;

      // 폰트 크기는 절대 16px 미만 금지
      c.font = mine ? 'bold 16px Jua, sans-serif' : '16px Jua, sans-serif';
      // 표지 자리(14px)만큼 이름 칸을 줄여 이름표 전체 폭은 예전과 비슷하게
      const maxW = crowded && !mine ? 54 : 84;
      const hw = crowded && !mine ? 36 : 44;
      const name = ellipsize(c, m.n, maxW);
      // 이름표 = [팀 모양 표지 ●/▲] + 이름, 팀색 테두리 알약 (TAG_MARK_W: 표지 자리)
      const nameW = Math.min(maxW + 2, c.measureText(name).width);
      const tw = nameW + TAG_MARK_W + 14;
      let x = it.x, y = it.y;
      const boxHalf = Math.max(tw + 6, hw) / 2; // 내 이름표 흰 바깥선(2.5px)까지 상자에 포함
      const makeBox = () => ({ l: x - boxHalf, t: y - 30, r: x + boxHalf, b: y + 6 });

      let alpha = mine ? 1.0 : (crowded ? 0.55 : 0.82);

      if (!mine) {
        let b = makeBox();
        const hitCdn = !!(cdnBox && overlapArea(cdnBox, b) > 0);
        const hitSpec = !!(specBox && overlapArea(specBox, b) > 0);
        const hitShell = shRects.some((sr) => overlapArea(sr, b) > 0);
        const hitBtn = btnRects.some((br) => overlapArea(br, b) > 0);
        let hitPlaced = placed.some((p) => overlapArea(p, b) > 0);

        // 다른 이름표와 겹치면 위로 한 번 피해 보고, 그래도 겹치면 점으로
        if (!hitCdn && !hitSpec && !hitShell && !hitBtn && hitPlaced) {
          y -= 18;
          b = makeBox();
          hitPlaced = placed.some((p) => overlapArea(p, b) > 0) || shRects.some((sr) => overlapArea(sr, b) > 0) || btnRects.some((br) => overlapArea(br, b) > 0) || !!(cdnBox && overlapArea(cdnBox, b) > 0) || !!(specBox && overlapArea(specBox, b) > 0);
        }

        if (hitCdn || hitSpec || hitShell || hitBtn || hitPlaced) {
          // 팀 모양 점(A 원·B 삼각, 흰 테두리)으로 대체 — 만약 점마저 겹치거나 버튼/카운트다운/관전막대에 가리면 숨김
          const dx = it.x, dy = it.y - 6;
          const dotBox = { l: dx - 7, t: dy - 7, r: dx + 7, b: dy + 7 };
          const dotBlocked = (cdnBox && overlapArea(cdnBox, dotBox) > 0) || (specBox && overlapArea(specBox, dotBox) > 0) || placed.some((p) => overlapArea(p, dotBox) > 0) || btnRects.some((br) => overlapArea(br, dotBox) > 0);
          if (dotBlocked) {
            tags.push({ name: m.n, mode: 'hidden', x: Math.round(dx), y: Math.round(dy), w: 0, h: 0 });
            continue;
          }
          Art.teamMark(c, dx, dy, m.tm, 4.6, 0.92);
          placed.push(dotBox);
          tags.push({ name: m.n, mode: 'dot', x: Math.round(dotBox.l), y: Math.round(dotBox.t), w: 14, h: 14 });
          continue;
        }
      } else {
        // 내(또는 관전 대상) 이름표는 불투명 + 외곽선 유지, 관전 막대·버튼과 겹치면 탱크 아래/옆으로 피해 겹침 0
        let b = makeBox();
        if (cdnBox && overlapArea(cdnBox, b) > 0) {
          tags.push({ name: m.n, mode: 'hidden', x: Math.round(x), y: Math.round(y), w: 0, h: 0 });
          continue;
        }
        const boxW = boxHalf * 2;
        const makeAt = (cx, cy) => ({ l: cx - boxW / 2, t: cy - 30, r: cx + boxW / 2, b: cy + 6 });
        const hitsSpec = (bx) => !!(specBox && overlapArea(specBox, bx) > 0);
        const hitsCdn = (bx) => !!(cdnBox && overlapArea(cdnBox, bx) > 0);
        const hitsBtnAny = (bx) => btnRects.some((br) => overlapArea(br, bx) > 0);
        const hitsBtnHeavy = (bx) => btnRects.some((br) => overlapArea(br, bx) > (bx.r - bx.l) * (bx.b - bx.t) * 0.35);
        const inBounds = (bx) => bx.t >= 48 && bx.b <= ch - 4 && bx.l >= 4 && bx.r <= cw - 4;
        if (hitsSpec(b) || b.t < 48 || hitsBtnHeavy(b)) {
          const [, tankBotY] = toScreen(t.x, t.y);
          const tankHalfW = (it.K.bw / 2) * scale();
          const sideOff = Math.ceil(tankHalfW + boxW / 2 + 10);
          const side1 = it.x <= cw / 2 ? 1 : -1;
          const clampX = (cx) => Math.max(boxW / 2 + 8, Math.min(cw - boxW / 2 - 8, cx));
          const sideY = Math.max(Math.round(it.y + 36), specBox ? Math.round(specBox.b + 32) : 80);
          const cands = [];
          if (!hitsSpec(b) && b.t >= 48) cands.push([it.x, it.y - 24]);
          cands.push([it.x, Math.round(tankBotY + 38)]);
          cands.push([clampX(it.x + side1 * sideOff), sideY]);
          cands.push([clampX(it.x - side1 * sideOff), sideY]);
          if (specBox) cands.push([it.x, Math.round(specBox.b + 32)]);
          let picked = null;
          for (let ci = 0; ci < cands.length; ci++) {
            const [cx, cy] = cands[ci];
            const cb = makeAt(cx, cy);
            if (inBounds(cb) && !hitsSpec(cb) && !hitsCdn(cb) && !hitsBtnAny(cb)) { picked = [cx, cy]; break; }
          }
          if (!picked) {
            for (let ci = 0; ci < cands.length; ci++) {
              const [cx, cy] = cands[ci];
              const cb = makeAt(cx, cy);
              if (cb.t >= 48 && cb.b <= ch - 4 && !hitsSpec(cb) && !hitsCdn(cb) && !hitsBtnHeavy(cb)) { picked = [cx, cy]; break; }
            }
          }
          if (picked) { x = picked[0]; y = picked[1]; }
        }
      }

      const finalBox = makeBox();
      placed.push(finalBox);
      byId[t.id] = finalBox;
      tags.push({ name: m.n, mode: 'text', x: Math.round(finalBox.l), y: Math.round(finalBox.t), w: Math.round(finalBox.r - finalBox.l), h: Math.round(finalBox.b - finalBox.t) });

      c.save(); c.globalAlpha = alpha;
      // 체력바
      const maxHp = Art.STAT[m.k].hp;
      c.fillStyle = 'rgba(0,0,0,.58)'; c.fillRect(x - hw / 2 - 1, y - 1, hw + 2, 7);
      const r = Math.max(0, t.hp / maxHp);
      c.fillStyle = r > 0.5 ? '#7CE36A' : r > 0.25 ? '#FFD23F' : '#ff5a4a'; c.fillRect(x - hw / 2, y, hw * r, 5);
      if (mine) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(x - hw / 2 - 1, y - 1, hw + 2, 7); }
      // 이름표 알약: 어두운 바탕(글자 가독성) + 팀색 테두리(내 것은 더 두껍게 + 흰 바깥선)
      const pl = x - tw / 2, pt = y - 27, ph = 22;
      Art.rr(c, pl, pt, tw, ph, 11);
      c.fillStyle = mine ? 'rgba(18,8,28,.9)' : 'rgba(18,8,28,.74)';
      c.fill();
      if (mine) { c.strokeStyle = '#fff'; c.lineWidth = 5; c.stroke(); }
      c.strokeStyle = teamCol; c.lineWidth = mine ? 3 : 2.2;
      c.stroke();
      // 팀 모양 표지 (A ● · B ▲, 흰 테두리)
      Art.teamMark(c, pl + 5 + TAG_MARK_W / 2, pt + ph / 2 + (m.tm === 'B' ? 0.6 : 0), m.tm, 4.4);
      // 닉네임 (항상 16px 이상, 내 이름만 불투명·굵게 + 두꺼운 외곽선)
      const nx = pl + 5 + TAG_MARK_W + 4 + nameW / 2, ny = pt + 17; // 좌 5 · 표지 14 · 틈 4 · 이름 · 우 5
      c.lineWidth = mine ? 4.2 : 2.8;
      c.lineJoin = 'round';
      c.strokeStyle = mine ? 'rgba(18,8,28,.96)' : 'rgba(18,8,28,.72)';
      c.strokeText(name, nx, ny);
      c.fillStyle = mine ? '#fff' : '#f4ebf7';
      c.fillText(name, nx, ny);
      c.restore();
    }
    if (window.__tankDbg) window.__tankDbg.tags = tags;
    void now;
    // 피해 숫자·배너가 이름표(점 포함)를 피하도록 화면 상자를 돌려줌
    return { boxes: placed, byId };
  }

  function drawShells(c, shells, s, now) {
    for (let k = 0; k < shells.length; k++) {
      const sh = shells[k];
      let tr = G.trails[sh.sid];
      if (!tr) { tr = G.trails[sh.sid] = []; }
      const last = tr[tr.length - 1];
      if (!last || Math.hypot(last[0] - sh.x, last[1] - sh.y) > 6) {
        if (tr.length >= 16) {
          const reused = tr.shift();
          reused[0] = sh.x; reused[1] = sh.y;
          tr.push(reused);
        } else {
          tr.push([sh.x, sh.y]);
        }
        // 모든 클라에서 보이는 포탄 꼬리 연기 점
        spawnPart('trail', sh.x + (Math.random() - 0.5) * 3, sh.y + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 14, -10 - Math.random() * 14, now, 0.42, 3.6, 7.5, 'rgba(255,220,160,.65)', 'rgba(130,115,120,.35)', 0, 0, -18, 0);
      }
      const invS = 1 / Math.max(0.5, s);
      c.lineCap = 'round';
      for (let i = 1; i < tr.length; i++) {
        const ratio = i / tr.length;
        // 빛나는 바깥 꼬리
        c.strokeStyle = `rgba(255,176,72,${ratio * 0.45})`;
        c.lineWidth = (3.5 + 6.5 * ratio) * invS * 0.65;
        c.beginPath(); c.moveTo(tr[i - 1][0], tr[i - 1][1]); c.lineTo(tr[i][0], tr[i][1]); c.stroke();
        // 밝은 중심 꼬리
        c.strokeStyle = `rgba(255,250,225,${ratio * 0.85})`;
        c.lineWidth = (1.5 + 3.0 * ratio) * invS * 0.6;
        c.beginPath(); c.moveTo(tr[i - 1][0], tr[i - 1][1]); c.lineTo(tr[i][0], tr[i][1]); c.stroke();
      }
      // 포탄 본체 + 빛무리
      c.fillStyle = 'rgba(255,215,120,.35)';
      c.beginPath(); c.arc(sh.x, sh.y, 9.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#2a2433'; c.strokeStyle = '#fff'; c.lineWidth = 1.6;
      c.beginPath(); c.arc(sh.x, sh.y, 6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(sh.x - 2, sh.y - 2, 2.2, 0, Math.PI * 2); c.fill();
    }
  }

  function stepPool(now, dt) {
    const T = G.T;
    for (let i = 0; i < MAX_PARTS; i++) {
      const p = PART_POOL[i];
      if (!p.active) continue;
      const age = (now - p.t) / 1000;
      if (age < 0) continue;
      if (age > p.life) { p.active = false; continue; }
      if (p.grav) p.vy += p.grav * dt;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      if (p.kind === 'soil') {
        p.rot += p.vrot * dt;
        if (p.vy > 0 && T.solid(nx, ny)) {
          if (!p.bounced) {
            p.bounced = true;
            p.vy = -p.vy * 0.36;
            p.vx *= 0.55;
            p.vrot *= -0.5;
            continue;
          } else {
            p.vx = 0; p.vy = 0; p.vrot = 0; p.grav = 0;
            continue;
          }
        }
      }
      p.x = nx; p.y = ny;
    }
  }

  function drawPoolLayer(c, now, layer) {
    for (let i = 0; i < MAX_PARTS; i++) {
      const p = PART_POOL[i];
      if (!p.active || p.layer !== layer) continue;
      const age = (now - p.t) / 1000;
      if (age < 0 || age > p.life) continue;
      const k = age / p.life;
      if (p.kind === 'soil') {
        c.save();
        c.globalAlpha = 1 - Math.max(0, k - 0.55) / 0.45;
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = p.c;
        c.strokeStyle = p.c2;
        c.lineWidth = 1;
        const hs = p.s * 0.5;
        c.fillRect(-hs, -hs * 0.8, p.s, p.s * 0.8);
        c.strokeRect(-hs, -hs * 0.8, p.s, p.s * 0.8);
        c.restore();
      } else if (p.kind === 'trail') {
        const rad = p.s + (p.s2 - p.s) * k;
        c.globalAlpha = (1 - k) * 0.72;
        c.fillStyle = k < 0.35 ? p.c : p.c2;
        c.beginPath(); c.arc(p.x, p.y, rad, 0, Math.PI * 2); c.fill();
      } else if (p.kind === 'flash') {
        const rad = p.s + (p.s2 - p.s) * k;
        c.globalAlpha = 1 - k;
        c.fillStyle = k < 0.45 ? p.c : p.c2;
        c.beginPath(); c.arc(p.x, p.y, rad, 0, Math.PI * 2); c.fill();
      } else if (p.kind === 'ring') {
        const rad = p.s + (p.s2 - p.s) * (1 - (1 - k) * (1 - k));
        c.globalAlpha = 0.9 * (1 - k);
        c.strokeStyle = k < 0.4 ? p.c : p.c2;
        c.lineWidth = Math.max(1, 5.5 * (1 - k));
        c.beginPath(); c.arc(p.x, p.y, rad, 0, Math.PI * 2); c.stroke();
      } else if (p.kind === 'fire') {
        const rad = p.s + (p.s2 - p.s) * Math.sin(k * Math.PI * 0.65);
        c.globalAlpha = (1 - k * k) * 0.92;
        c.fillStyle = k < 0.35 ? p.c : p.c2;
        c.beginPath(); c.arc(p.x, p.y, rad, 0, Math.PI * 2); c.fill();
      } else if (p.kind === 'smoke') {
        const rad = p.s + (p.s2 - p.s) * k;
        c.globalAlpha = 0.52 * (1 - k);
        c.fillStyle = p.c;
        c.beginPath(); c.arc(p.x, p.y, rad, 0, Math.PI * 2); c.fill();
      } else if (p.kind === 'spark') {
        c.globalAlpha = 1 - k;
        c.strokeStyle = k < 0.4 ? p.c : p.c2;
        c.lineWidth = Math.max(0.8, p.s * (1 - k * 0.7));
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }
  function getFxAvoidRects() {
    const rects = btnRects.slice();
    const specEl = $('#spec-bar');
    if (G && G.spec && specEl && !$('#spec').hidden) {
      const r = specEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push({ l: r.left - 6, t: r.top - 6, r: r.right + 6, b: r.bottom + 6 });
    }
    const cdnEl = $('#cdn');
    if (cdnEl && !cdnEl.hidden) {
      const r = cdnEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push({ l: r.left - 6, t: r.top - 6, r: r.right + 6, b: r.bottom + 6 });
    }
    return rects;
  }
  function placeFxBox(cx, topY, w, h, fxCtx, gap) {
    const padX = 10, topMin = 52, botMax = Math.max(topMin + h, ch - 12);
    const x = Math.max(w / 2 + padX, Math.min(cw - w / 2 - padX, cx));
    const clampY = (y) => Math.max(topMin, Math.min(botMax - h, y));
    const y0 = clampY(topY);
    const make = (y) => ({ l: x - w / 2, t: y, r: x + w / 2, b: y + h });
    const g = gap != null ? gap : Math.max(8, Math.round(h * 0.22));
    const avoid = fxCtx ? fxCtx.avoid : btnRects;
    const placed = fxCtx ? fxCtx.placed : [];
    const blockers = (box) => {
      const hits = [];
      for (let i = 0; i < placed.length; i++) {
        if (overlapArea(placed[i], box) > 0) hits.push(placed[i]);
      }
      for (let i = 0; i < avoid.length; i++) {
        if (overlapArea(avoid[i], box) > 0) hits.push(avoid[i]);
      }
      return hits;
    };

    const frontier = [y0];
    const seen = new Set();
    let bestY = y0, bestOv = Infinity, bestDist = Infinity;

    for (let step = 0; step < 32 && frontier.length > 0; step++) {
      let bestIdx = 0;
      for (let i = 1; i < frontier.length; i++) {
        if (Math.abs(frontier[i] - y0) < Math.abs(frontier[bestIdx] - y0)) bestIdx = i;
      }
      const cy = clampY(frontier.splice(bestIdx, 1)[0]);
      const key = Math.round(cy);
      if (seen.has(key)) continue;
      seen.add(key);

      const box = make(cy);
      const hits = blockers(box);
      if (hits.length === 0) return box;

      let ov = 0;
      for (let i = 0; i < hits.length; i++) ov += overlapArea(hits[i], box);
      const dist = Math.abs(cy - y0);
      if (ov < bestOv || (ov === bestOv && dist < bestDist)) {
        bestOv = ov; bestDist = dist; bestY = cy;
      }
      for (let i = 0; i < hits.length; i++) {
        const hr = hits[i];
        const up = hr.t - h - g;
        const dn = hr.b + g;
        if (up >= topMin && !seen.has(Math.round(up))) frontier.push(up);
        if (dn + h <= botMax && !seen.has(Math.round(dn))) frontier.push(dn);
      }
    }
    return make(bestY);
  }
  function pushFxLabel(fxCtx, text, box) {
    if (!fxCtx) return;
    fxCtx.placed.push(box);
    fxCtx.labels.push({
      text,
      x: Math.round(box.l),
      y: Math.round(box.t),
      w: Math.round(box.r - box.l),
      h: Math.round(box.b - box.t)
    });
  }
  function drawNums(c, now, fxCtx) {
    const active = [];
    for (let i = 0; i < G.nums.length; i++) {
      const n = G.nums[i];
      const age = (now - n.t) / 1000;
      const maxAge = n.miss ? 0.9 : (n.mine ? 1.2 : 1.1);
      if (age <= maxAge) active.push(n);
    }
    G.nums = active;
    const ordered = active.slice().sort((a, b) => ((b.mine && !b.miss) ? 1 : 0) - ((a.mine && !a.miss) ? 1 : 0) || a.t - b.t);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < ordered.length; i++) {
      const n = ordered[i];
      const age = (now - n.t) / 1000;
      if (n.miss) {
        const [rx, ry] = toScreen(n.x, n.y - 16);
        const onScreen = rx >= 0 && rx <= cw && ry >= 46 && ry <= ch;
        const atImpactCam = G.camState && (G.camState.mode === 'impact' || G.camState.mode === 'follow');
        const fs = (onScreen || atImpactCam) ? 24 : 17;
        c.font = `${fs}px "Black Han Sans", Jua, sans-serif`;
        const w = Math.ceil(c.measureText('빗나감').width + 10);
        const h = Math.ceil(fs * 1.2) + 4;
        const box = placeFxBox(rx, ry - age * 26 - h, w, h, fxCtx);
        const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2;
        c.save();
        c.globalAlpha = 0.82 * (1 - Math.max(0, age - 0.5) / 0.4);
        c.lineJoin = 'round';
        c.lineWidth = fs >= 24 ? 5 : 3.5;
        c.strokeStyle = 'rgba(20,10,30,.9)';
        c.strokeText('빗나감', cx, cy);
        c.fillStyle = '#ece8f4';
        c.fillText('빗나감', cx, cy);
        c.restore();
        pushFxLabel(fxCtx, '빗나감', box);
        continue;
      }
      const t = G.cur[n.id];
      const m = G.meta[n.id];
      const topOff = m && m.k === 'mangru' ? 50 : 38;
      const wx = (t && t.st !== 2) ? t.x : n.x;
      const wy = (t && t.st !== 2) ? (t.y - topOff) : (n.y - 44);
      let [rx, rawY] = toScreen(wx, wy);
      // 이름표(체력바 포함) 위로 띄움: 이름표가 옆·아래로 피했으면 그 상자 위, 없으면 기본 이름표 자리(rawY-44) 위
      const nb = fxCtx && fxCtx.nameBox ? fxCtx.nameBox[n.id] : null;
      let baseY = rawY - 50;
      if (nb && t && t.st !== 2) { rx = (nb.l + nb.r) / 2; baseY = nb.t - 6; }
      if (n.mine) {
        const label = n.ff ? `아군 피격! -${n.dmg}` : `명중! -${n.dmg}`;
        const fs = 36;
        const bounce = age < 0.18
          ? 0.72 + 0.42 * Math.sin((age / 0.18) * Math.PI * 0.72)
          : (age < 0.30 ? 1.14 - 0.14 * ((age - 0.18) / 0.12) : 1);
        const rise = Math.sin(Math.min(1, age * 1.6) * Math.PI * 0.5) * 30 + age * 16;
        c.font = `${fs}px "Black Han Sans", Jua, sans-serif`;
        const w = Math.ceil((c.measureText(label).width + 10) * bounce);
        const h = Math.ceil((fs * 1.2 + 4) * bounce);
        const box = placeFxBox(rx, baseY - rise - h, w, h, fxCtx);
        const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2;
        c.save();
        c.translate(cx, cy);
        c.scale(bounce, bounce);
        c.globalAlpha = 1 - Math.max(0, age - 0.8) / 0.4;
        c.lineJoin = 'round';
        c.lineWidth = 6.5;
        c.strokeStyle = n.ff ? Art.FF.stroke : '#2b0912';
        c.strokeText(label, 0, 0);
        c.fillStyle = n.ff ? Art.FF.c : '#FFE27A';
        c.fillText(label, 0, 0);
        c.restore();
        pushFxLabel(fxCtx, label, box);
      } else {
        const label = '-' + n.dmg;
        const fs = 17;
        c.font = `${fs}px "Black Han Sans", Jua, sans-serif`;
        const w = Math.ceil(c.measureText(label).width + 8);
        const h = Math.ceil(fs * 1.2) + 4;
        const box = placeFxBox(rx + 14, baseY - age * 36 - h, w, h, fxCtx);
        const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2;
        c.save();
        c.globalAlpha = 1 - Math.max(0, age - 0.65) / 0.45;
        c.lineJoin = 'round';
        c.lineWidth = 4;
        c.strokeStyle = n.ff ? Art.FF.stroke : '#2d0a12';
        c.strokeText(label, cx, cy);
        c.fillStyle = n.ff ? Art.FF.c : (n.mate ? '#ff6a6a' : '#fff3d6');
        c.fillText(label, cx, cy);
        c.restore();
        pushFxLabel(fxCtx, label, box);
      }
    }
    c.textBaseline = 'alphabetic';
  }
  function drawBanners(c, now, fxCtx) {
    G.banners = G.banners.filter((b) => {
      const age = (now - b.t) / 1000;
      if (age > b.dur) return false;
      const pop = age < 0.16 ? 0.65 + 0.45 * Math.sin((age / 0.16) * Math.PI * 0.7) : 1;
      const alpha = 1 - Math.max(0, age - (b.dur - 0.35)) / 0.35;
      c.font = '44px "Black Han Sans", Jua, sans-serif';
      const w = Math.ceil((c.measureText(b.text).width + 12) * pop);
      const h = Math.ceil(48 * pop);
      const by = G.spec ? 136 : 108;
      const box = placeFxBox(cw / 2, by - h / 2, w, h, fxCtx);
      const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2;
      c.save();
      c.translate(cx, cy);
      c.scale(pop, pop);
      c.globalAlpha = alpha;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = 7.5;
      c.strokeStyle = b.stroke;
      c.strokeText(b.text, 0, 0);
      c.fillStyle = b.color;
      c.fillText(b.text, 0, 0);
      c.restore();
      pushFxLabel(fxCtx, b.text, box);
      return true;
    });
    c.textBaseline = 'alphabetic';
  }
  function drawOffscreenHits(c, now, fxCtx) {
    const pad = 28, top = 60;
    G.offHits = G.offHits.filter((oh) => {
      const age = (now - oh.t) / 1000;
      if (age > 1.2) return false;
      const [sx, sy] = toScreen(oh.x, oh.y);
      if (sx >= 0 && sx <= cw && sy >= 46 && sy <= ch) return true;
      // 화면 밖 탱크 화살표와 같은 규칙으로 조작 버튼·HUD 줄을 피한 가장자리 자리
      const pe = placeEdgeArrow(Math.max(pad, Math.min(cw - pad, sx)), Math.max(top, Math.min(ch - pad, sy)), false, []);
      const ax0 = pe.ax, ay0 = pe.ay;
      const ang = Math.atan2(sy - ay0, sx - ax0);
      const col = oh.ff ? Art.FF.c : (oh.mine ? '#FFD23F' : (oh.anyFf ? Art.FF.c : (oh.anyMate ? '#ff6a6a' : '#fff3d6')));
      const alpha = 1 - Math.max(0, age - 0.85) / 0.35;
      c.save();
      c.globalAlpha = alpha;
      arrowAt(c, ax0, ay0, ang, col);
      const label = oh.mine ? (oh.ff ? '아군 피격' : '명중') : (oh.anyFf ? '아군 피격' : (oh.anyMate ? '피격' : '명중'));
      c.font = 'bold 16px Jua, sans-serif';
      const tw = c.measureText(label).width + 16;
      const dirX = Math.cos(ang), dirY = Math.sin(ang);
      const bx0 = ax0 - dirX * (tw * 0.5 + 18);
      const by0 = ay0 - dirY * 22 + 8;
      const th = 26;
      const box = placeFxBox(bx0, by0 - th, Math.ceil(tw + 4), th, fxCtx);
      const bx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2;
      c.fillStyle = col;
      c.strokeStyle = 'rgba(20,10,30,.92)';
      c.lineWidth = 2.4;
      Art.rr(c, bx - tw / 2, cy - 12, tw, 24, 12);
      c.fill(); c.stroke();
      c.fillStyle = '#1d1530';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, bx, cy);
      c.restore();
      pushFxLabel(fxCtx, label, box);
      return true;
    });
    c.textBaseline = 'alphabetic';
  }

  // 각도 숫자(포신 호 끝 '00°') 화면 상자 — drawArc 와 같은 계산
  function arcLabelBox(t) {
    const [px, py] = toScreen(...pivot(t));
    const ea = Math.max(-30, Math.min(85, t.bt + (G.aim.a != null ? G.aim.a : t.a)));
    const r = 56 + 30, e = ea * Math.PI / 180;
    const lx = px + t.fa * Math.cos(e) * r, ly = py - Math.sin(e) * r;
    return { l: lx - 28, t: ly - 15, r: lx + 28, b: ly + 15 };
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
  // 화면 밖 화살표 자리: 화면 가장자리 안쪽 둘레를 따라 원래 자리에서 가까운 순으로 훑어
  // 조작 버튼·HUD(btnRects)와 이미 놓은 화살표를 피한 첫 자리. 다 막히면 버튼만 피한 자리, 그것도 없으면 원래 자리.
  function placeEdgeArrow(x, y, withMark, placed) {
    const pad = 22, top = 56;
    const L = pad, R = Math.max(pad + 1, cw - pad), T = top, B = Math.max(top + 1, ch - pad);
    const W = R - L, H = B - T, P = 2 * (W + H);
    const ax0 = Math.max(L, Math.min(R, x)), ay0 = Math.max(T, Math.min(B, y));
    // 둘레 위치 s (왼쪽 위에서 시계 방향)
    const dl = ax0 - L, dr = R - ax0, dt = ay0 - T, db = B - ay0, dm = Math.min(dl, dr, dt, db);
    const s0 = dm === dt ? dl : dm === dr ? W + dt : dm === db ? W + H + dr : 2 * W + H + db;
    const at = (s) => {
      s = ((s % P) + P) % P;
      if (s < W) return [L + s, T];
      if (s < W + H) return [R, T + s - W];
      if (s < 2 * W + H) return [R - (s - W - H), B];
      return [L, B - (s - 2 * W - H)];
    };
    // 화살표(반경 약 13) + 안쪽 17px 팀 표지(반경 약 7)를 덮는 상자
    const boxOf = (ax, ay) => {
      const ang = Math.atan2(y - ay, x - ax);
      const b = { l: ax - 13, t: ay - 13, r: ax + 13, b: ay + 13 };
      if (withMark) {
        const mx = ax - Math.cos(ang) * 17, my = ay - Math.sin(ang) * 17;
        b.l = Math.min(b.l, mx - 7); b.t = Math.min(b.t, my - 7); b.r = Math.max(b.r, mx + 7); b.b = Math.max(b.b, my + 7);
      }
      return b;
    };
    const hitBtn = (b) => b.t < 46 || btnRects.some((r) => overlapArea(r, b) > 0);
    const hitPlaced = (b) => placed.some((r) => overlapArea(r, b) > 0);
    let fallback = null;
    const step = 6, maxD = P / 2;
    for (let d = 0; d <= maxD; d += step) {
      for (const sg of d ? [1, -1] : [1]) {
        const [ax, ay] = at(s0 + sg * d);
        const b = boxOf(ax, ay);
        if (hitBtn(b)) continue;
        if (!hitPlaced(b)) return { ax, ay, box: b };
        if (!fallback) fallback = { ax, ay, box: b };
      }
    }
    return fallback || { ax: ax0, ay: ay0, box: boxOf(ax0, ay0) };
  }
  function drawArrows(c, shells, list) {
    const placed = [];
    for (const sh of shells) {
      const [x, y] = toScreen(sh.x, sh.y);
      if (x >= 0 && x <= cw && y >= 46 && y <= ch) continue;
      const p = placeEdgeArrow(x, y, false, placed);
      placed.push(p.box);
      arrowAt(c, p.ax, p.ay, Math.atan2(y - p.ay, x - p.ax), '#fff');
    }
    // 화면 밖 탱크 (팀 색)
    for (const t of list) {
      if (t.st === 2) continue;
      const [x, y] = toScreen(t.x, t.y - 20);
      if (x >= 0 && x <= cw && y >= 46 && y <= ch) continue;
      const p = placeEdgeArrow(x, y, true, placed);
      placed.push(p.box);
      const ax = p.ax, ay = p.ay;
      const m = G.meta[t.id];
      const ang = Math.atan2(y - ay, x - ax);
      c.save(); c.globalAlpha = 0.85; arrowAt(c, ax, ay, ang, Art.TEAM[m.tm].c); c.restore();
      // 화살표 안쪽에 팀 모양 표지(●/▲) — 색을 못 가려도 어느 팀인지
      Art.teamMark(c, ax - Math.cos(ang) * 17, ay - Math.sin(ang) * 17, m.tm, 3.6, 0.9);
    }
    // QA 읽기 전용: 이번 프레임 화면 밖 화살표 상자
    if (window.__tankDbg) window.__tankDbg.arrows = placed.map((b) => ({ l: Math.round(b.l), t: Math.round(b.t), r: Math.round(b.r), b: Math.round(b.b) }));
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
  function updateCountdownDom(now) {
    const el = $('#cdn');
    if (G.over) { if (!el.hidden) el.hidden = true; return; }
    if (G.cdn > 0) {
      const n = Math.ceil(G.cdn / 1000);
      const myTeam = G.me && G.meta[G.me] ? G.meta[G.me].tm : null;
      const side = myTeam ? G.side[myTeam] : null;
      const html = `<b>${n}</b>${side ? `<span>우리 진지: ${side === 'L' ? '← 왼쪽' : '오른쪽 →'}</span>` : '<span>곧 시작해요</span>'}`;
      if (el.innerHTML !== html) { el.innerHTML = html; SND.SFX.tick(); }
      if (el.classList.contains('go')) el.classList.remove('go');
      setStyle('#cdn', 'left', '50%');
      el.hidden = false; G.goT = now + 800;
    } else if (now < G.goT) {
      if (!el.dataset.go) { el.innerHTML = '<b>출발!</b>'; el.dataset.go = '1'; el.classList.add('go'); SND.SFX.go(); }
      // 「출발!」은 HUD 바로 아래(화면 위쪽 1/3)에 — 내 탱크·이름표 자리와 겹치면 옆으로 비킴
      setStyle('#cdn', 'left', Math.round(goLeft()) + 'px');
      el.hidden = false;
    } else {
      if (!el.hidden) el.hidden = true;
      if (el.dataset.go) { delete el.dataset.go; el.classList.remove('go'); setStyle('#cdn', 'left', '50%'); }
    }
  }
  function goLeft() {
    const half = 78;   // 「출발!」 글자 상자 절반 폭(여유 포함)
    const t = focusTank();
    if (!t || !G.cam.ok) return cw / 2;
    const [tx, ty] = toScreen(t.x, t.y);
    const s = scale();
    const tankHalf = 60 * s * 0.5 + 56;           // 탱크 + 이름표 절반 폭
    const top = ty - 90 * s, goB = 48 + 64;        // 탱크 위(이름표 포함) · 「출발!」 아래 끝
    if (top > goB || Math.abs(tx - cw / 2) > tankHalf + half) return cw / 2;
    const right = tx + tankHalf + half + 8, left = tx - tankHalf - half - 8;
    if (right + half <= cw - 8 && (cw - tx >= tx || left - half < 8)) return right;
    if (left - half >= 8) return left;
    return cw / 2;
  }
  function drawCountdown(c, me, now) {
    updateCountdownDom(now);
    if (G.over || G.cdn <= 0 || !me) return;
    const [x, y] = toScreen(me.x, me.y - 70);
    const bob = Math.sin(now / 150) * 5;
    c.fillStyle = '#FFD23F'; c.strokeStyle = 'rgba(20,10,30,.9)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(x - 12, y - 40 + bob); c.lineTo(x + 12, y - 40 + bob); c.lineTo(x, y - 22 + bob); c.closePath(); c.stroke(); c.fill();
    c.font = '18px "Black Han Sans", sans-serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeText('나', x, y - 46 + bob); c.fillStyle = '#fff'; c.fillText('나', x, y - 46 + bob);
  }

  let hudCache = {};
  function setText(sel, v) { if (hudCache[sel] !== v) { hudCache[sel] = v; $(sel).textContent = v; } }
  // 값이 바뀔 때만 style 을 씀 (매 프레임 쓰면 바로 뒤 getBoundingClientRect·offsetTop 이 강제 레이아웃)
  function setStyle(sel, prop, v) { const key = sel + '|' + prop; if (hudCache[key] !== v) { hudCache[key] = v; $(sel).style[prop] = v; } }
  function hud(me, now) {
    const tl = Math.max(0, Math.ceil((G.tl || 0) / 1000));
    setText('#h-time', `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`);
    const w = G.wind || 0, lv = Math.abs(w) < 2 ? 0 : Math.abs(w) <= 8 ? 1 : Math.abs(w) <= 16 ? 2 : 3;
    setText('#h-wlv', String(lv));
    const hwEl = $('#h-wind');
    const blink = !!(G.wn && G.rc >= G.wn.at - 2000 && G.rc < G.wn.at + 200);
    if (blink && !G.windBlink && window.__tankDbg) window.__tankDbg.blinkStarts.push(Math.round(now));
    G.windBlink = blink;
    hwEl.classList.toggle('blink', blink);
    if (hwEl.dataset.wind !== String(w)) hwEl.dataset.wind = String(w);
    const bStr = blink ? '1' : '0';
    if (hwEl.dataset.blink !== bStr) hwEl.dataset.blink = bStr;
    if (window.__tankDbg) {
      window.__tankDbg.wind = w;
      window.__tankDbg.windNextAt = G.wn ? G.wn.at : null;
    }
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
    setStyle('#h-ab', 'width', (mx.A ? 100 * hp.A / mx.A : 0) + '%');
    setStyle('#h-bb', 'width', (mx.B ? 100 * hp.B / mx.B : 0) + '%');
    if (me && !G.spec) {
      setText('#fuel-n', String(me.fu));
      setStyle('#fuel-bar', 'width', me.fu + '%');
      const curA = G.aim.a == null ? me.a : G.aim.a;
      const curP = G.aim.p == null ? me.p : G.aim.p;
      const ea = Math.round(Math.max(-30, Math.min(85, me.bt + curA)));
      setText('#aimread', `각도 ${ea}° · 파워 ${Math.round(curP)}`);
      if (window.__tankDbg) window.__tankDbg.aim = { a: Math.round(curA), p: Math.round(curP) };
      const p = curP;
      setStyle('#p-fill', 'height', p + '%');
      const tr = $('#power .ptrack');
      setStyle('#p-knob', 'top', (tr.offsetTop + tr.offsetHeight * (1 - p / 100)) + 'px');
      if (G.lastShotP != null) { setStyle('#p-last', 'display', 'block'); setStyle('#p-last', 'bottom', G.lastShotP + '%'); }
      const cd = G.cdn > 0 ? G.cdn : me.cd;
      const fb = $('#b-fire'), cool = cd > 0;
      fb.classList.toggle('cool', cool);
      setText('#fire-t', cool ? (cd / 1000).toFixed(1) : '발사');
      setStyle('#fire-ring', 'strokeDashoffset', String(238.8 * (cool && G.cdn <= 0 ? cd / 5000 : 0)));
    } else if (window.__tankDbg && G.aim.a != null) {
      window.__tankDbg.aim = { a: Math.round(G.aim.a), p: Math.round(G.aim.p) };
    }
    // 미니맵 (포탄 비행 중엔 60ms 주기로 갱신)
    const ownerId = camOwnerId();
    const hasOwnerShell = !!(ownerId && G.lastShells && G.lastShells.some((sh) => G.shellOwn[sh.sid] === ownerId));
    if (now - G.minimapT > (hasOwnerShell ? 60 : 200)) { G.minimapT = now; minimap(now); }
  }
  // 미니맵 백버퍼를 CSS 크기 × devicePixelRatio(최대 3)로 맞춤 — 그리기 좌표는 CSS px 기준
  function miniSize(mc) {
    if (miniSz && miniSz.el === mc) return miniSz;
    const w = mc.clientWidth || 120, h = mc.clientHeight || 32;
    const d = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const bw = Math.round(w * d), bh = Math.round(h * d);
    if (mc.width !== bw || mc.height !== bh) { mc.width = bw; mc.height = bh; }
    // 아직 배치 전(clientWidth 0)이면 캐시하지 않고 다음 번에 다시 잼
    miniSz = mc.clientWidth ? { el: mc, w, h, d } : null;
    if (window.__tankDbg) window.__tankDbg.minimap = { w, h, dpr: d };
    return { el: mc, w, h, d };
  }
  function miniStar(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }
  function minimap(now) {
    now = now || performance.now();
    const mc = $('#h-mini'); const c = mc.getContext('2d');
    const M = miniSize(mc);
    const w = M.w, h = M.h, T = G.T;
    const k = h / 32; // 예전 크기(120x32) 대비 배율 — 포탄 점·착탄 표지 비율 유지
    c.setTransform(M.d, 0, 0, M.d, 0, 0);
    c.clearRect(0, 0, w, h);
    c.imageSmoothingEnabled = true;
    c.drawImage(T.cv, 0, 0, WW, WH, 0, 0, w, h);
    // 탱크 점: A 원 · B 삼각 (팀색 + 흰 테두리 + 잉크선, 지름 약 5~6px) · 내 탱크/관전 대상은 흰 링
    const dotR = Math.max(2.5, 2.2 * k);
    let meDot = null;
    for (const id in G.cur) {
      const t = G.cur[id], m = G.meta[id]; if (!m || t.st === 2) continue;
      const x = t.x / WW * w, y = Math.max(dotR + 1, Math.min(h - dotR - 1, t.y / WH * h - 1));
      if (id === G.me || id === G.specId) { meDot = [x, y, m.tm]; continue; }
      Art.teamMark(c, x, y, m.tm, dotR);
    }
    if (meDot) {
      Art.teamMark(c, meDot[0], meDot[1], meDot[2], dotR);
      c.strokeStyle = '#fff'; c.lineWidth = 1.6;
      c.beginPath(); c.arc(meDot[0], meDot[1], dotR + 3.2, 0, Math.PI * 2); c.stroke();
    }
    // 착탄 지점 표지 (3초 유지) — 팀 점(원·삼각)과 헷갈리지 않게: 빗나감 흰 X · 명중 빨강 별 · 아군 피격 자홍 네모
    G.miniMarks = G.miniMarks.filter((mk) => {
      const age = (now - mk.t) / 1000;
      if (age > 3.0) return false;
      const mx = Math.max(3 * k, Math.min(w - 3 * k, mk.x / WW * w));
      const my = Math.max(3 * k, Math.min(h - 3 * k, mk.y / WH * h));
      c.save();
      c.globalAlpha = 1 - Math.max(0, age - 2.4) / 0.6;
      c.lineJoin = 'round'; c.lineCap = 'round';
      if (mk.kind === 'miss') {
        const q = 2.6 * k;
        c.beginPath(); c.moveTo(mx - q, my - q); c.lineTo(mx + q, my + q);
        c.moveTo(mx + q, my - q); c.lineTo(mx - q, my + q);
        c.strokeStyle = 'rgba(20,10,30,.85)'; c.lineWidth = 3.2 * k; c.stroke();
        c.strokeStyle = '#e8ecf5'; c.lineWidth = 1.6 * k; c.stroke();
      } else if (mk.kind === 'ff') {
        const q = 2.6 * k;
        c.beginPath(); c.rect(mx - q, my - q, q * 2, q * 2);
        c.fillStyle = Art.FF.c; c.fill();
        c.strokeStyle = Art.FF.stroke; c.lineWidth = 1.2 * k; c.stroke();
      } else {
        miniStar(c, mx, my, 3.6 * k);
        c.fillStyle = '#ff3838'; c.fill();
        c.strokeStyle = '#fff'; c.lineWidth = 1 * k; c.stroke();
      }
      c.restore();
      return true;
    });
    // 내 포탄(관전 시 관전 대상 포탄) 현재 위치 밝은 점
    const ownerId = camOwnerId();
    if (ownerId && G.lastShells) {
      for (const sh of G.lastShells) {
        if (G.shellOwn[sh.sid] !== ownerId) continue;
        const sx = sh.x / WW * w, sy = Math.max(2 * k, Math.min(h - 2 * k, sh.y / WH * h));
        c.fillStyle = '#fff9b8';
        c.beginPath(); c.arc(sx, sy, 2.4 * k, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#ffaa22'; c.lineWidth = 1 * k; c.stroke();
      }
    }
    const s = scale();
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1;
    c.strokeRect((G.cam.x - cw / 2 / s) / WW * w, Math.max(0, (G.cam.y - ch / 2 / s) / WH * h), cw / s / WW * w, Math.min(h, ch / s / WH * h));
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
