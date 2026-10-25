/* 아리채 쌩쌩카트 · 대기실 설정 + 달리기 화면 + 서버 연결
   - 내 카트는 내 폰에서 바로 계산 (core.js · 1/60초 고정 칸), 20번/초 위치를 서버로 ("kin")
   - 다른 카트는 서버가 보내 준 위치를 약 0.1초 전 시각으로 이어서 그려요 (부드럽게)
   - 아이템: 응원 풍선을 터뜨리면 서버가 정해 줘요 ("kpop" → "kgive") · 초록 톡 = 쓰기 ("kuse")
   - 먼저 들어오면 응원단 버튼 (빨강 폭죽 · 초록 응원 · 파랑 꿀)
   app.js 의 hooks.state / hooks.message 로 끼어들어요. 화면(#s-kart)은 여기서 만들어요. */
(function () {
  'use strict';
  const App = window.App;
  if (!App) return;
  const { $, esc, S, SND } = App;
  const K = window.KartCore;
  const KS = window.KartSound || {};
  const sfx = (name, ...a) => { try { if (KS[name]) KS[name](...a); } catch (e) { /* 소리 없음 */ } };

  const ITEM = {
    spike: { name: '가시공 굴리기', who: '도치', ath: 'hedgehog', ic: '🦔', tip: '앞 카트를 향해 데굴데굴' },
    honey: { name: '꿀 웅덩이', who: '붕붕', ath: 'bee', ic: '🍯', tip: '뒤에 끈적끈적 꿀' },
    dino: { name: '쿵쿵 지진', who: '뿌뿌', ath: 'dino', ic: '🦖', tip: '1등에게 쿵! (2초 전에 알려줘요)' },
    nut: { name: '버튼 뒤죽박죽', who: '토리', ath: 'squirrel', ic: '🐿️', tip: '앞 사람 버튼이 3초 뒤죽박죽' }
  };
  const ITEM_IDS = Object.keys(ITEM);
  const EMO = ['💪 힘내!', '👏 잘한다!', '🔥 가즈아!', '😆 화이팅!', '❤️ 사랑해!', '🎉 최고!'];
  const KEY_HELPER = 'arichae_kart_helper';
  const SEND_MS = 50;           // 20번/초
  const INTERP_MS = 110;        // 다른 카트는 이만큼 과거를 그려요

  const H = {
    trackP: null, T: null,
    sessId: 0, ks: null, roster: [], myIdx: -1,
    view: null, building: false,
    me: null, prev: null, simT: -9, started: false, ended: false, finSent: false,
    hold: { r: false, g: false, b: false },
    swapUntil: 0, swapShown: false,
    buf: [], lastRows: [], itemSnaps: [], popped: new Set(), localPop: new Map(),
    item: null, rolling: null, quake: null, quakeIdx: -1, quakeAt: 0,
    lastSend: 0, rank: 1, rankList: [], finT: {},
    spec: false, fanT: -1, fanCd: { boost: 0, honey: 0, cheer: 0 }, emoI: 0,
    raf: 0, lastFrame: 0, fpsT: [], fps: 0, fpsLowSince: 0,
    lastCount: '', mapBg: null, mapFrame: 0, resultKey: '', helper: false, fresh: true,
    stats: { frames: 0, sent: 0, recv: 0 }
  };
  try { H.helper = localStorage.getItem(KEY_HELPER) === '1'; } catch (e) { /* 무시 */ }

  /* ---------------- 불러오기 ---------------- */
  function loadTrack() {
    if (!H.trackP) {
      H.trackP = fetch('/static/js/kart/track.json', { cache: 'no-cache' }).then((r) => r.json()).then((def) => { H.T = K.buildTrack(def); return H.T; })
        .catch((e) => { H.trackP = null; throw e; });
    }
    return H.trackP;
  }
  function preload() {
    loadTrack().catch(() => {});
    if (window.KartView) window.KartView.load().catch(() => {});
  }

  const face = (ath, ex) => (window.Oly ? window.Oly.faceSVG(ath || 'dino', ex) : '');
  const nameOf = (i) => { const r = H.roster[i]; if (!r) return '?'; return i === H.myIdx ? '나' : r.name; };
  const serverRel = () => App.serverNow() - (H.ks ? H.ks.t0 : 0);

  /* ================================================================
     대기실
     ================================================================ */
  const LV = [{ n: 1, name: '살살' }, { n: 2, name: '보통' }, { n: 3, name: '잘함' }, { n: 4, name: '선수' }, { n: 5, name: '챔피언' }];
  function cfg() { return (S.room && S.room.kart) || { ai: 7, lv: 2, wins: {} }; }

  function renderLobby(isHost) {
    const box = $('#kart-panel');
    if (!box) return;
    preload();
    const room = S.room;
    const O = window.Oly;
    const dis = isHost ? '' : 'disabled';
    const mine = App.me();
    const taken = {};
    room.players.forEach((p) => { if (p.pid !== S.pid && p.athlete) taken[p.athlete] = p.name; });
    const c = cfg();
    const maxAi = Math.max(0, 8 - room.players.length);
    const nAi = Math.min(c.ai, maxAi);
    const wins = c.wins || {};
    const winList = room.players.filter((p) => wins[p.pid]).sort((a, b) => wins[b.pid] - wins[a.pid])
      .map((p) => `<span class="kt-win"><i>${face(p.athlete, 'h')}</i>${esc(p.name)} <b>${wins[p.pid]}승</b></span>`).join('');
    const aths = O ? O.ATH.map((a) => {
      const on = mine && mine.athlete === a.id;
      const who = taken[a.id];
      return `<button type="button" class="oly-ath${on ? ' on' : ''}${who ? ' taken' : ''}" data-kath="${a.id}" ${who ? 'disabled' : ''} style="--jc:${a.jersey}">
        <span class="oly-ath-f">${O.faceSVG(a.id, on ? 'h' : 'n')}</span><b>${esc(a.name)}</b><span>${who ? esc(who) : esc(a.note)}</span></button>`;
    }).join('') : '';
    const how = H.helper
      ? [['r', '◀ 톡', '왼쪽 차선'], ['g', '톡', '아이템 쓰기'], ['b', '톡 ▶', '오른쪽 차선']]
      : [['r', '◀ 꾹', '왼쪽으로'], ['g', '톡 / 방향+꾹', '아이템 / 드리프트'], ['b', '꾹 ▶', '오른쪽으로']];
    box.innerHTML = `
      <div class="kt-hero">
        <div class="kt-hero-art">${heroSVG()}</div>
        <div class="kt-hero-txt"><b class="disp">쌩쌩카트</b><span>도토리 공원 서킷 · 2바퀴 · 8대</span><span class="kt-hero-sub">풍선을 터뜨려 아이템! 드리프트로 슝!</span></div>
      </div>
      <div class="list-head sub"><span>내 운전수</span><span class="hint-sm">누르면 바뀌어요</span></div>
      <div class="oly-aths">${aths}</div>
      <div class="list-head sub"><span>내 조작</span><span class="hint-sm">사람마다 따로 골라요</span></div>
      <div class="kt-modes">
        <button type="button" data-khelper="0" class="${H.helper ? '' : 'on'}"><b class="disp">🎮 기본 조작</b><span>내가 직접 운전</span></button>
        <button type="button" data-khelper="1" class="${H.helper ? 'on' : ''}"><b class="disp">🤝 도우미 모드</b><span>저절로 운전 · 벽에 안 부딪혀요</span></button>
      </div>
      <div class="kt-how">${how.map(([cc, k, t]) => `<div><i class="kt-dot ${cc}"></i><b>${k}</b><span>${t}</span></div>`).join('')}</div>
      <div class="kt-tip">${H.helper ? '코너에서 안쪽 버튼을 꾹 누르면 드리프트 부스터!' : '드리프트: 방향 버튼을 누른 채 초록을 꾹 → 불꽃이 커지면 손을 떼요 → 슝!'}</div>
      <div class="list-head sub"><span>AI 카트</span><span class="hint-sm">사람 ${room.players.length}명${nAi ? ' + AI ' + nAi + '대' : ''}</span></div>
      <div class="oly-ai"><div class="oly-ai-row"><button type="button" class="cd-step" data-kai="-1" ${dis || (nAi <= 0 ? 'disabled' : '')}>−</button>
        <b class="disp">AI ${nAi}대</b><button type="button" class="cd-step" data-kai="1" ${dis || (nAi >= maxAi ? 'disabled' : '')}>+</button></div>
        ${nAi ? `<div class="oly-lv">${LV.map((l) => `<button type="button" data-klv="${l.n}" class="${c.lv === l.n ? 'on' : ''}" ${dis}><b>${l.n}</b><span>${l.name}</span></button>`).join('')}</div>` : ''}</div>
      ${winList ? `<div class="list-head sub"><span>오늘의 우승</span></div><div class="kt-wins">${winList}</div>` : ''}`;
  }

  function heroSVG() {
    return `<svg viewBox="0 0 120 70" aria-hidden="true"><ellipse cx="60" cy="62" rx="44" ry="6" fill="rgba(0,0,0,.25)"/>
      <path d="M18 46 Q20 34 34 32 L80 30 Q100 30 104 44 L104 50 L18 52 Z" fill="#FF4757"/><path d="M26 40 L96 38" stroke="#fff" stroke-width="3" opacity=".6"/>
      <rect x="10" y="26" width="10" height="20" rx="3" fill="#2ED573"/><rect x="6" y="24" width="18" height="5" rx="2" fill="#3D7BFF"/>
      <circle cx="32" cy="52" r="9" fill="#15122B"/><circle cx="32" cy="52" r="4" fill="#FFD23F"/><circle cx="90" cy="52" r="9" fill="#15122B"/><circle cx="90" cy="52" r="4" fill="#FFD23F"/>
      <g transform="translate(58 18) scale(.5)">${window.Oly ? window.Oly.HEAD.dino('h') : ''}</g>
      <g fill="#FFD23F"><path d="M104 20 l3 -7 3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 Z"/></g><g stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"><path d="M2 36 h-8"/><path d="M4 44 h-12"/></g></svg>`;
  }

  function lobbyMain() {
    const room = S.room;
    const c = cfg();
    const n = Math.min(8, room.players.length + Math.min(c.ai, Math.max(0, 8 - room.players.length)));
    return { label: `🏁 출발! · ${n}대 레이스`, help: room.players.length > 1 ? '모두 각자 폰으로 운전해요 · 빈자리는 AI' : '혼자서도 AI 와 달릴 수 있어요 · 가족을 초대해 보세요', wait: false };
  }

  function onLobbyClick(e) {
    const room = S.room;
    if (!room) return;
    let b;
    if ((b = e.target.closest('button[data-kath]')) && !b.disabled) {
      SND.SFX.pop(); SND.vibrate(10);
      const m = App.me(); if (m) m.athlete = b.dataset.kath;
      renderLobby(room.hostPid === S.pid);
      App.send({ t: 'athlete', v: b.dataset.kath });
    } else if ((b = e.target.closest('button[data-khelper]'))) {
      SND.SFX.click();
      H.helper = b.dataset.khelper === '1';
      try { localStorage.setItem(KEY_HELPER, H.helper ? '1' : '0'); } catch (err) { /* 무시 */ }
      renderLobby(room.hostPid === S.pid);
    } else if ((b = e.target.closest('button[data-kai]')) && !b.disabled) {
      SND.SFX.click();
      const maxAi = Math.max(0, 8 - room.players.length);
      App.send({ t: 'settings', kai: Math.max(0, Math.min(maxAi, Math.min(cfg().ai, maxAi) + Number(b.dataset.kai))) });
    } else if ((b = e.target.closest('button[data-klv]')) && !b.disabled) {
      SND.SFX.click();
      App.send({ t: 'settings', klv: Number(b.dataset.klv) });
    }
  }

  /* ================================================================
     달리기 화면 (DOM)
     ================================================================ */
  function buildScreen() {
    if ($('#s-kart')) return;
    const sec = document.createElement('section');
    sec.id = 's-kart';
    sec.className = 'screen kt-screen';
    sec.innerHTML = `
      <div class="kt-gl-box" id="kt-gl"></div>
      <div class="kt-speed" id="kt-speed"></div>
      <div class="kt-edge" id="kt-edge"></div>
      <div class="kt-hud" id="kt-hud">
        <div class="kt-rank"><b class="disp" id="kt-rank">-</b><span class="disp" id="kt-rank-n">/8</span></div>
        <div class="kt-mid">
          <div class="kt-lap disp" id="kt-lap">1/2 바퀴</div>
          <div class="kt-time" id="kt-time">0:00.0</div>
        </div>
        <div class="kt-item" id="kt-item"><div class="kt-item-in" id="kt-item-in"></div><span class="kt-item-nm" id="kt-item-nm"></span></div>
        <canvas class="kt-map" id="kt-map" width="220" height="220"></canvas>
      </div>
      <div class="kt-msgs" id="kt-msgs"></div>
      <div class="kt-center disp" id="kt-center"></div>
      <div class="kt-sub disp" id="kt-sub"></div>
      <div class="kt-closeup" id="kt-closeup"></div>
      <div class="kt-warn" id="kt-warn"></div>
      <div class="kt-honey" id="kt-honey"></div>
      <div class="kt-nut" id="kt-nut"></div>
      <div class="kt-draft" id="kt-draft"><i></i><span>바람타기</span></div>
      <div class="kt-fan" id="kt-fan"></div>
      <div class="pad kt-pad named" id="kt-pad">
        <div class="bez" data-c="r"><button class="gb r" type="button" aria-label="빨강 버튼"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><circle cx="12" cy="12" r="8"/></svg></button><span class="gb-name" id="kt-n-r"></span></div>
        <div class="bez" data-c="g"><button class="gb g" type="button" aria-label="초록 버튼"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"><path d="M12 4 L21 19 L3 19 Z"/></svg></button><span class="gb-name" id="kt-n-g"></span></div>
        <div class="bez" data-c="b"><button class="gb b" type="button" aria-label="파랑 버튼"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"><rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/></svg></button><span class="gb-name" id="kt-n-b"></span></div>
      </div>
      <div class="kt-load" id="kt-load"><div class="kt-load-in"><div class="kt-load-kart">${heroSVG()}</div><b class="disp">트랙 준비 중…</b><span id="kt-load-sub">모두 준비되면 출발해요</span></div></div>
      <div class="kt-res" id="kt-res"></div>`;
    $('#app').appendChild(sec);
    setupPad();
    $('#kt-fan').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fant]');
      if (b) { H.fanT = Number(b.dataset.fant); SND.SFX.click(); renderFan(true); }
    });
    $('#kt-res').addEventListener('click', (e) => {
      const b = e.target.closest('[data-kres]');
      if (!b) return;
      SND.SFX.click();
      if (b.dataset.kres === 'again') App.send({ t: 'krematch' });
      else if (b.dataset.kres === 'lobby') App.send({ t: 'again' });
    });
    window.addEventListener('resize', () => { if (H.view) H.view.resize(); });
  }

  /* ---------------- 버튼 ---------------- */
  function setupPad() {
    const pad = $('#kt-pad');
    pad.querySelectorAll('.bez').forEach((bez) => {
      const c = bez.dataset.c;
      const btn = bez.querySelector('button');
      let isDown = false;
      const down = (e) => {
        e.preventDefault();
        SND.unlock();
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
        if (isDown) return;
        isDown = true;
        press(c, true);
      };
      const up = () => { if (!isDown) return; isDown = false; press(c, false); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const KEYS = { a: 'r', j: 'r', 1: 'r', arrowleft: 'r', s: 'g', k: 'g', 2: 'g', arrowdown: 'g', arrowup: 'g', ' ': 'g', d: 'b', l: 'b', 3: 'b', arrowright: 'b' };
    document.addEventListener('keydown', (e) => {
      const sc = $('#s-kart');
      if (!sc || !sc.classList.contains('active')) return;
      const c = KEYS[(e.key || '').toLowerCase()];
      if (!c) return;
      e.preventDefault();
      if (e.repeat) return;
      press(c, true);
    });
    document.addEventListener('keyup', (e) => {
      const c = KEYS[(e.key || '').toLowerCase()];
      if (!c || !H.hold[c]) return;
      press(c, false);
    });
    $('#s-kart') && $('#s-kart').addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  function press(c, down) {
    if (H.hold[c] === down) return;
    H.hold[c] = down;
    const bez = $(`#kt-pad .bez[data-c="${c}"]`);
    if (bez) bez.classList.toggle('down', down);
    if (!down) return;
    if (H.spec) { fanPress(c); return; }
    if (H.me && H.started && !H.me.finished) {
      SND.vibrate(8);
    }
  }

  function padLabels() {
    let L;
    if (H.spec) L = { r: '🎆 폭죽', g: '📣 응원', b: '🍯 꿀' };
    else if (swapOn()) L = { r: '오른쪽 ▶ ?!', g: H.helper ? '아이템' : '아이템 · 드리프트', b: '◀ 왼쪽 ?!' };
    else if (H.helper) L = { r: '◀ 차선', g: '아이템', b: '차선 ▶' };
    else L = { r: '◀ 왼쪽', g: '아이템 · 드리프트', b: '오른쪽 ▶' };
    ['r', 'g', 'b'].forEach((c) => { const n = $('#kt-n-' + c); if (n && n.textContent !== L[c]) n.textContent = L[c]; });
    $('#kt-pad').classList.toggle('kt-swap', swapOn());
    $('#kt-pad').classList.toggle('kt-spec', H.spec);
  }
  const swapOn = () => performance.now() < H.swapUntil;

  /* ================================================================
     판 시작 · 끝
     ================================================================ */
  function onState(room, changed) {
    if (room.phase === 'kart' && room.ksess) {
      buildScreen();
      const ks = room.ksess;
      const active = document.querySelector('.screen.active');
      if (!active || (active.id !== 's-kart' && active.id !== 's-records')) {
        App.showScreen('s-kart');
        if (App.wakeLock) App.wakeLock(true);
      }
      if (ks.id !== H.sessId) newSession(ks);
      H.ks = ks;
      if (ks.status === 'done') showResult(ks);
      else $('#kt-res').classList.remove('show');
      if (ks.status !== 'load') $('#kt-load').classList.remove('show');
    } else if (H.sessId) {
      teardown();
    }
  }

  function newSession(ks) {
    teardown();
    H.sessId = ks.id;
    H.ks = ks;
    H.roster = ks.roster || [];
    H.myIdx = H.roster.findIndex((r) => r.pid === S.pid);
    H.spec = H.myIdx < 0;
    H.fanT = -1;
    H.me = null; H.started = false; H.ended = false; H.finSent = false; H.fresh = true;
    H.buf = H.roster.map(() => []);
    H.lastRows = []; H.itemSnaps = []; H.popped = new Set(); H.localPop = new Map();
    H.item = null; H.rolling = null; H.quake = null; H.quakeIdx = -1;
    H.finT = {}; H.rank = H.myIdx + 1; H.swapUntil = 0; H.lastCount = ''; H.resultKey = '';
    H.hold = { r: false, g: false, b: false };
    $$('#kt-pad .bez').forEach((b) => b.classList.remove('down'));
    $('#kt-res').classList.remove('show');
    $('#kt-load').classList.add('show');
    $('#kt-load-sub').textContent = H.spec ? '이번 판은 응원단으로 구경해요' : '모두 준비되면 출발해요';
    $('#kt-center').textContent = '';
    $('#kt-msgs').innerHTML = '';
    $('#kt-fan').classList.remove('show');
    $('#kt-rank-n').textContent = '/' + H.roster.length;
    padLabels();
    const sid = ks.id;
    Promise.all([loadTrack(), window.KartView.load()]).then(() => {
      if (H.sessId !== sid) return;
      const T = H.T;
      H.view = window.KartView.create({ container: $('#kt-gl'), track: T, roster: H.roster, myIdx: H.myIdx });
      H.viewAt = performance.now();
      H.roster.forEach((r, i) => {
        const g = T.grid[i];
        Object.assign(H.view.st[i], { x: g.x, y: g.y, h: g.h });
      });
      if (H.myIdx >= 0) {
        H.me = K.newKart(T, H.myIdx, { helper: H.helper });
        H.prev = { x: H.me.x, y: H.me.y, h: H.me.h };
      }
      drawMapBg();
      sfx('start');
      App.send({ t: 'kready', helper: H.helper });
      H.lastFrame = performance.now();
      H.raf = requestAnimationFrame(frame);
    }).catch((e) => {
      console.error(e);
      $('#kt-load-sub').textContent = '화면을 불러오지 못했어요. 인터넷을 확인하고 다시 들어와 주세요';
    });
  }

  function teardown() {
    cancelAnimationFrame(H.raf);
    H.raf = 0;
    if (H.view) { H.view.destroy(); H.view = null; }
    sfx('stop');
    H.sessId = 0;
    H.me = null;
    const w = $('#kt-warn'); if (w) w.classList.remove('show');
  }

  /* ================================================================
     매 프레임
     ================================================================ */
  function frame(now) {
    if (!H.sessId) return;
    H.raf = requestAnimationFrame(frame);
    const c0 = performance.now();
    try { frameBody(now); } finally {
      // 한 프레임에 드는 계산 시간 (그래픽 카드 시간은 빼고)
      const c = performance.now() - c0;
      H.cost = H.cost ? H.cost * 0.95 + c * 0.05 : c;
    }
  }
  function frameBody(now) {
    const dtv = Math.min(0.1, (now - H.lastFrame) / 1000);
    H.lastFrame = now;
    trackFps(now, dtv);
    const ks = H.ks;
    const T = H.T;
    if (!ks || !T || !H.view) return;
    const tRace = ks.startAt ? (App.serverNow() - ks.startAt) / 1000 : -99;
    const racing = ks.status === 'grid' || ks.status === 'race';
    // ---------- 내 카트: 고정 칸으로 서버 시각을 따라가요 ----------
    const others = othersNow();
    if (H.me && racing && ks.startAt) {
      if (Math.abs(H.simT - tRace) > 0.8) H.simT = tRace;
      let n = 0;
      while (H.simT + K.DT <= tRace + 1e-6 && n < 45) {
        H.prev.x = H.me.x; H.prev.y = H.me.y; H.prev.h = H.me.h;
        stepMe(H.simT, others);
        H.simT += K.DT;
        n++;
      }
    }
    // 출발 신호
    countdown(tRace, ks);
    // 지진 (내가 1등일 때)
    quakeTick();
    // ---------- 화면에 놓기 ----------
    const rt = serverRel() - INTERP_MS;
    for (let i = 0; i < H.roster.length; i++) {
      const vs = H.view.st[i];
      if (i === H.myIdx && H.me) {
        const k = H.me;
        const a = Math.max(0, Math.min(1, (tRace - (H.simT - K.DT)) / K.DT));
        vs.x = H.prev.x + (k.x - H.prev.x) * a; vs.y = H.prev.y + (k.y - H.prev.y) * a;
        vs.h = H.prev.h + K.wrapA(k.h - H.prev.h) * a;
        vs.vis = k.vis; vs.spinA = k.spinA; vs.hop = k.hop; vs.lean = k.lean; vs.v = k.v;
        vs.f = K.flags(k);
        vs.ex = k.spinT > 0 ? 's' : k.slowT > 0 ? 's' : H.quake ? 'o' : k.finished ? 'h' : k.boostT > 0 ? 'h' : k.drift ? 'e' : 'n';
        vs.front = k.spinT > 0 || (k.finished && H.simT - k.finT < 3);
      } else {
        const s = sample(i, rt);
        if (!s) continue;
        vs.x = s.x; vs.y = s.y; vs.h = s.h; vs.v = s.v; vs.f = s.f;
        vs.vis = s.f & 1 ? -0.5 : s.f & 2 ? 0.5 : 0;
        vs.lean = s.f & 1 ? -0.6 : s.f & 2 ? 0.6 : 0;
        vs.spinA = s.f & 32 ? (vs.spinA || 0) + dtv * 12 : 0;
        vs.hop = s.f & 32 ? Math.abs(Math.sin(now / 120)) * 0.4 : 0;
        vs.ex = s.f & 32 ? 's' : s.f & 64 ? 's' : s.f & 256 ? 'h' : s.f & 16 ? 'h' : s.f & 3 ? 'e' : 'n';
        vs.front = !!(s.f & 32);
      }
    }
    // 아이템
    H.view.setItems(itemsNow(rt), rt);
    const popped = new Set(H.popped);
    H.localPop.forEach((until, i) => { if (until > now) popped.add(i); });
    H.view.setBalloons(popped);
    // 카메라: 나 / 응원단이면 고른 선수
    let camIdx = H.myIdx;
    if (H.spec) { pickFanTarget(); camIdx = H.fanT >= 0 ? H.fanT : 0; }
    const me = H.me;
    const qLeft = H.quakeIdx >= 0 ? (H.quakeAt - App.serverNow()) / 1000 : 0;
    H.view.render({ dt: dtv, t: tRace, camIdx, boost: me && !H.spec ? me.boostT > 0 : false, quakeIdx: qLeft > 0 ? H.quakeIdx : -1, quakeLeft: qLeft });
    // 소리
    if (me && !H.spec) sfx('update', me.v, me.boostT > 0, !!me.drift, me.stage, ks.status !== 'race');
    else sfx('update', 0, false, false, 0, true);
    // 보내기
    if (me && racing && now - H.lastSend >= SEND_MS) {
      H.lastSend = now;
      App.send({ t: 'kin', T: Math.round(serverRel()), x: +me.x.toFixed(2), y: +me.y.toFixed(2), h: +me.h.toFixed(3), v: +me.v.toFixed(2), p: +me.prog.toFixed(2), f: (K.flags(me) & ~K.F.HELPER) | (H.helper ? K.F.HELPER : 0) });
      H.stats.sent++;
    }
    hud(tRace, now);
  }

  function stepMe(t, others) {
    const k = H.me;
    const T = H.T;
    // 시험용 자동 운전: 실제 키보드(a/s/d)를 누르는 것과 같은 길로 들어와요
    if (window.__kartAuto) { try { window.__kartAuto(k, t, { item: !!H.item, quake: !!H.quake }); } catch (e) { console.error(e); } }
    let l = H.hold.r; let r = H.hold.b;
    if (swapOn()) { const x = l; l = r; r = x; }
    const inp = H.spec || k.finished ? { l: false, r: false, g: false } : { l, r, g: H.hold.g };
    k.ev.length = 0;
    K.step(k, inp, K.DT, T, { t, others, quake: !!H.quake });
    for (let i = 0; i < k.ev.length; i++) onKartEvent(k.ev[i]);
    // 풍선
    if (t > 0 && !k.finished && !H.item && !H.rolling) {
      for (let i = 0; i < T.balloons.length; i++) {
        const b = T.balloons[i];
        if (H.popped.has(i) || (H.localPop.get(i) || 0) > performance.now()) continue;
        const dx = b.x - k.x; const dy = b.y - k.y;
        if (dx * dx + dy * dy < 2.3 * 2.3) {
          H.localPop.set(i, performance.now() + 2200);
          H.view.popBalloon(i);
          sfx('pop');
          SND.vibrate(15);
          H.rolling = { t0: performance.now(), it: undefined };
          App.send({ t: 'kpop', b: i });
          break;
        }
      }
    }
  }

  function onKartEvent(e) {
    const k = H.me;
    switch (e) {
      case 'driftStart': sfx('driftStart'); break;
      case 'stage1': sfx('stage', 1); SND.vibrate(12); popSub('불꽃 1단', '#FFD23F'); break;
      case 'stage2': sfx('stage', 2); SND.vibrate([12, 30, 12]); popSub('삼색 불꽃!', '#7DF0AE'); break;
      case 'boost1': sfx('boost', 1); H.view.boostPuff(H.myIdx); H.view.bubble(H.myIdx, '야호!', '#FFE27A', 0.9); speedLines(0.7); break;
      case 'boost2': sfx('boost', 2); H.view.boostPuff(H.myIdx); H.view.bubble(H.myIdx, '야호오~!', '#7DF0AE', 1.1); speedLines(1.1); SND.vibrate(30); break;
      case 'ctr': sfx('boost', 0); popSub('착! 추가 부스터', '#FF8FC7'); speedLines(0.35); break;
      case 'draft': sfx('draft'); popSub('바람타기 슝!', '#A9C4FF'); speedLines(0.8); H.view.boostPuff(H.myIdx); break;
      case 'startBoost': sfx('boost', 1); popCenter('번개 출발!', 'go'); speedLines(0.9); break;
      case 'wall': sfx('wall'); SND.vibrate(25); edge('rgba(255,255,255,.35)'); break;
      case 'pot': sfx('pot'); SND.vibrate(30); H.view.bubble(H.myIdx, '콩!', '#FF8FC7', 0.6); break;
      case 'driftLost': popSub('앗, 불꽃이 꺼졌어요', '#C9C3E6'); break;
      case 'lap': sfx('lap'); popCenter('마지막 바퀴!', 'lap'); SND.vibrate([30, 40, 30]); break;
      case 'item': useItem(); break;
      case 'finish': onFinish(); break;
      default: break;
    }
    void k;
  }

  function useItem() {
    if (!H.item) {
      if (H.rolling) return;
      popSub('풍선을 터뜨리면 아이템!', '#C9C3E6');
      return;
    }
    const it = H.item;
    H.item = null;
    App.send({ t: 'kuse' });
    if (it === 'spike') sfx('throwIt'); else if (it === 'honey') sfx('honeyDrop'); else if (it === 'nut') sfx('nut'); else sfx('thump', 0);
    popSub(`${ITEM[it].who}의 ${ITEM[it].name}!`, '#FFE27A');
    renderItem();
  }

  function onFinish() {
    const k = H.me;
    k.helper = true;   // 들어온 뒤에는 저절로 천천히
    k.lane = 0;
    sfx('finish');
    SND.vibrate([60, 40, 60, 40, 160]);
    H.finT[H.myIdx] = k.finT;
    const rank = myRankNow();
    popCenter(rank === 1 ? '1등! 우승!' : `${rank}등 결승!`, 'fin');
    App.send({ t: 'kfin', ft: +k.finT.toFixed(3), st: k.st });
    H.finSent = true;
    setTimeout(() => {
      if (!H.sessId || !H.me || !H.me.finished) return;
      H.spec = true;
      H.item = null; H.rolling = null;
      renderItem();
      padLabels();
      renderFan(true);
      popSub('응원단이 되었어요! 버튼으로 응원해요', '#FFE27A');
    }, 2600);
  }

  /* ---------------- 다른 카트 (과거 시각으로 이어 그리기) ---------------- */
  function sample(i, rt) {
    const b = H.buf[i];
    if (!b || !b.length) return null;
    if (rt <= b[0].t) return b[0];
    for (let j = b.length - 1; j >= 0; j--) {
      if (b[j].t <= rt) {
        const a = b[j]; const c = b[j + 1];
        if (!c) {
          // 조금만 앞으로 (최대 0.15초)
          const ex = Math.min(0.15, (rt - a.t) / 1000);
          return { x: a.x + Math.cos(a.h) * a.v * ex, y: a.y + Math.sin(a.h) * a.v * ex, h: a.h, v: a.v, f: a.f, p: a.p };
        }
        const u = (rt - a.t) / Math.max(1, c.t - a.t);
        return { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u, h: a.h + K.wrapA(c.h - a.h) * u, v: a.v + (c.v - a.v) * u, f: u < 0.5 ? a.f : c.f, p: a.p + (c.p - a.p) * u };
      }
    }
    return b[0];
  }
  function othersNow() {
    const out = [];
    if (!H.view) return out;
    for (let i = 0; i < H.roster.length; i++) {
      if (i === H.myIdx) continue;
      const s = H.view.st[i];
      if (s && (s.x || s.y)) out.push({ x: s.x, y: s.y });
    }
    return out;
  }
  function itemsNow(rt) {
    const sn = H.itemSnaps;
    if (!sn.length) return [];
    let a = sn[sn.length - 1]; let b = null;
    for (let j = sn.length - 1; j >= 0; j--) { if (sn[j].t <= rt) { a = sn[j]; b = sn[j + 1] || null; break; } }
    if (!b) return a.list;
    const u = (rt - a.t) / Math.max(1, b.t - a.t);
    const nb = new Map(b.list.map((x) => [x.id, x]));
    return a.list.map((x) => { const y = nb.get(x.id); return y && x.kind === 'spike' ? { id: x.id, kind: x.kind, x: x.x + (y.x - x.x) * u, y: x.y + (y.y - x.y) * u } : x; });
  }

  /* ================================================================
     서버 메시지
     ================================================================ */
  function onMessage(msg) {
    if (!H.sessId) return;
    if (msg.t === 'kst') onSnap(msg);
    else if (msg.t === 'kgive') {
      if (!H.rolling) return;
      if (msg.it) H.rolling.it = msg.it; else { H.rolling = null; renderItem(); }
    } else if (msg.t === 'kfanok') {
      H.fanCd[msg.a] = H.ks.t0 + msg.at;
    } else if (msg.t === 'kfanwait') {
      H.fanCd[msg.a] = H.ks.t0 + msg.at;
      SND.SFX.bad && SND.SFX.bad();
    }
  }

  function onSnap(m) {
    H.stats.recv++;
    m.k.forEach((row) => {
      const [i, x, y, h, v, f, p, ts] = row;
      const b = H.buf[i];
      if (!b) return;
      const t = ts;
      if (b.length && b[b.length - 1].t >= t) return;
      b.push({ t, x, y, h, v, f, p });
      if (b.length > 30) b.shift();
      // 다시 들어왔을 때: 서버가 기억하는 내 자리에서 이어 달려요
      if (i === H.myIdx && H.fresh && H.me && H.ks.status === 'race' && p > H.me.prog + 8) {
        Object.assign(H.me, { x, y, h, v, prog: p, s: ((p % H.T.L) + H.T.L) % H.T.L, lap: Math.max(0, Math.floor(p / H.T.L)), hint: -1 });
        H.prev = { x, y, h };
      }
    });
    H.fresh = false;
    H.lastRows = m.k;
    H.itemSnaps.push({ t: m.T, list: (m.it || []).map(([id, kind, x, y, by]) => ({ id, kind, x, y, by })) });
    if (H.itemSnaps.length > 12) H.itemSnaps.shift();
    H.popped = new Set(m.bp || []);
    H.rankList = m.rk || [];
    (m.e || []).forEach(onEvent);
  }

  function onEvent(ev) {
    const v = H.view;
    const mine = ev.v === H.myIdx;
    switch (ev.k) {
      case 'pop': if (!mine && v) v.popBalloon(ev.b); break;
      case 'use':
        if (!mine && v) {
          const nm = { spike: '가시공!', honey: '꿀!', nut: '뒤죽박죽!', dino: '쿵쿵!' }[ev.it];
          if (nm) v.bubble(ev.v, nm, '#FFE27A', 0.9);
        }
        break;
      case 'hit':
        if (mine && !ev.self) applyHit(ev.w, ev.by);
        else if (!mine && v) {
          v.bubble(ev.v, ev.w === 'honey' ? '끈적!' : ev.w === 'nut' ? '어리둥절' : '으앙!', '#A9C4FF', 1.0);
          if (ev.by === H.myIdx && ev.by >= 0) { popSub(`명중! ${nameOf(ev.v)} ${ev.w === 'honey' ? '꿀범벅' : ev.w === 'nut' ? '뒤죽박죽' : '빙글빙글'}`, '#7DF0AE'); sfx('dodge'); }
        }
        break;
      case 'quake':
        H.quakeIdx = ev.v; H.quakeAt = H.ks.t0 + ev.at;
        if (mine) startQuakeWarn(ev);
        else msg(`🦖 ${nameOf(ev.by)}의 쿵쿵 지진! ${nameOf(ev.v)} 조심!`, 'warn');
        break;
      case 'stomp':
        H.quakeIdx = -1;
        if (v) v.stomp(ev.v);
        sfx('quake');
        break;
      case 'dodge':
        if (!mine) { msg(`${nameOf(ev.v)} 지진을 쓩 피했어요!`); if (v) v.bubble(ev.v, '피했다!', '#7DF0AE', 1.2); }
        break;
      case 'boom': if (v) v.boom(ev.x, ev.y); break;
      case 'fin':
        H.finT[ev.v] = ev.t;
        if (!mine) { const r = H.rankList.indexOf(ev.v) + 1; msg(`🏁 ${nameOf(ev.v)} 결승!${r ? ' ' + r + '등' : ''}`); }
        break;
      case 'fan':
        if (v) v.firework(ev.v);
        if (mine && H.me && !H.me.finished) {
          K.boost(H.me, K.P.fanBoost[0], K.P.fanBoost[1], 'fan');
          sfx('firework'); sfx('boost', 1);
          popCenter(`${ev.n}님의 응원 폭죽! 슝!`, 'fan');
          speedLines(0.7);
        }
        break;
      case 'fanhoney':
        msg(mine ? `🍯 ${ev.n}님이 앞에 꿀을! 조심!` : `🍯 ${ev.n}님이 꿀을 떨어뜨렸어요`);
        break;
      case 'cheer':
        if (v) v.bubble(ev.v, EMO[ev.e % EMO.length].split(' ')[0], '#FFFFFF', 1.3);
        if (mine) { msg(`${ev.n}: ${EMO[ev.e % EMO.length]}`, 'cheer'); sfx('cheer'); }
        break;
      default: break;
    }
  }

  /* ---------------- 맞았어요 ---------------- */
  function applyHit(w, by) {
    const k = H.me;
    if (!k || k.finished) return;
    const byName = by >= 0 ? nameOf(by) : '응원단';
    if (w === 'spike') {
      K.spinOut(k, K.P.spin);
      sfx('hit');
      SND.vibrate([70, 40, 140]);
      closeup('spike', `으앙! ${byName}의 가시공`);
      edge('rgba(255,71,87,.6)');
      H.view.shake(0.35);
    } else if (w === 'honey') {
      K.honey(k);
      sfx('honey');
      SND.vibrate([40, 30, 90]);
      const hb = $('#kt-honey');
      hb.classList.remove('show'); void hb.offsetWidth; hb.classList.add('show');
      closeup('honey', '꿀범벅! 끈적끈적');
    } else if (w === 'nut') {
      H.swapUntil = performance.now() + 3000;
      sfx('nut');
      SND.vibrate([25, 25, 25, 25, 25, 25]);
      const nb = $('#kt-nut');
      nb.innerHTML = `<div class="kt-nut-in"><i>${face('squirrel', 'h')}</i><b class="disp">버튼 뒤죽박죽!</b><span>${esc(byName)}의 다람쥐 장난 · 3초 동안 빨강↔파랑</span></div>${'<em>🌰</em>'.repeat(7)}`;
      nb.classList.remove('show'); void nb.offsetWidth; nb.classList.add('show');
      padLabels();
      setTimeout(padLabels, 3050);
    }
  }

  function closeup(kind, text) {
    const r = H.roster[H.myIdx];
    const c = $('#kt-closeup');
    const tears = '<span class="kt-tear l"></span><span class="kt-tear r"></span>';
    c.innerHTML = `<div class="kt-cu-face">${face(r ? r.ath : 'dino', 's')}${tears}</div><div class="kt-cu-txt disp">${esc(text)}</div><div class="kt-cu-ic">${kind === 'spike' ? face('hedgehog', 'h') : kind === 'honey' ? face('bee', 'h') : face('dino', 'e')}</div>`;
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    clearTimeout(H.cuT);
    H.cuT = setTimeout(() => c.classList.remove('show'), 1500);
    // 진동이 안 되는 폰(아이폰 등): 화면이 크게 흔들리고 번쩍
    if (!SND.canVibrate()) { const s = $('#s-kart'); s.classList.remove('kt-jolt'); void s.offsetWidth; s.classList.add('kt-jolt'); }
  }

  /* ---------------- 쿵쿵 지진 (내가 1등) ---------------- */
  function startQuakeWarn(ev) {
    H.quake = { at: H.ks.t0 + ev.at, by: ev.by, thumps: 0 };
    const w = $('#kt-warn');
    w.innerHTML = `<div class="kt-warn-in"><i>${face('dino', 'e')}</i><div><b class="disp">쿵쿵 지진이 와요!</b><span>${esc(nameOf(ev.by))}의 공룡 · 부스터로 피해요!</span></div></div><div class="kt-warn-bar"><i id="kt-warn-fill"></i></div><div class="kt-warn-hint">${H.helper ? '방향 버튼을 꾹 → 떼면 슝!' : '방향+초록 꾹 → 떼면 슝!'}</div>`;
    w.classList.add('show');
    $('#s-kart').classList.add('kt-quaking');
    SND.vibrate([200, 100, 200, 100, 200, 100, 300]);
    sfx('thump', 0);
  }
  function quakeTick() {
    const q = H.quake;
    if (!q || !H.me) return;
    const left = q.at - App.serverNow();
    const f = $('#kt-warn-fill');
    if (f) f.style.transform = `scaleX(${Math.max(0, Math.min(1, left / 2000))})`;
    const th = Math.floor((2000 - left) / 500);
    if (th > q.thumps && left > 0) { q.thumps = th; sfx('thump', th); }
    if (left > 0) return;
    H.quake = null;
    $('#kt-warn').classList.remove('show');
    $('#s-kart').classList.remove('kt-quaking');
    const k = H.me;
    if (k.finished) return;
    if (k.boostT > 0) {
      App.send({ t: 'kres', dodged: 1 });
      sfx('dodge');
      popCenter('피했다! 🦖💨', 'fin');
      H.view.bubble(H.myIdx, '피했다!', '#7DF0AE', 1.2);
    } else {
      K.spinOut(k, K.P.quakeSpin);
      k.hopV = 9;
      App.send({ t: 'kres', dodged: 0, by: q.by });
      sfx('hit');
      SND.vibrate([300, 60, 200]);
      closeup('dino', '쿵! 지진에 들썩');
      H.view.shake(0.6);
    }
  }

  /* ================================================================
     응원단
     ================================================================ */
  function pickFanTarget() {
    const live = H.rankList.filter((i) => i !== H.myIdx && !(H.view && H.view.st[i] && H.view.st[i].f & 256));
    if (H.fanT >= 0 && live.includes(H.fanT)) return;
    // 사람 먼저, 없으면 아무나
    const hum = live.filter((i) => H.roster[i] && !H.roster[i].bot);
    const n = hum.length ? hum[0] : live.length ? live[0] : (H.myIdx >= 0 ? H.myIdx : 0);
    if (n !== H.fanT) { H.fanT = n; renderFan(true); }
  }
  function renderFan(force) {
    const box = $('#kt-fan');
    if (!H.spec || !H.ks || H.ks.status !== 'race') { box.classList.remove('show'); return; }
    const live = H.rankList.filter((i) => i !== H.myIdx && !(H.view && H.view.st[i] && H.view.st[i].f & 256));
    const key = live.join(',') + '|' + H.fanT;
    if (!force && box.dataset.key === key) return;
    box.dataset.key = key;
    box.innerHTML = `<div class="kt-fan-head disp">🎉 응원단 · 누구를 응원할까요?</div><div class="kt-fan-row">${live.map((i) => {
      const r = H.roster[i];
      return `<button type="button" class="kt-fan-p${i === H.fanT ? ' on' : ''}${r.bot ? ' bot' : ''}" data-fant="${i}"><i>${face(r.ath, i === H.fanT ? 'h' : 'n')}</i><span>${esc(r.name)}</span></button>`;
    }).join('') || '<span class="kt-fan-none">모두 들어왔어요!</span>'}</div>`;
    box.classList.add('show');
  }
  function fanPress(c) {
    if (!H.ks || H.ks.status !== 'race' || H.fanT < 0) return;
    const a = c === 'r' ? 'boost' : c === 'g' ? 'cheer' : 'honey';
    if (App.serverNow() < (H.fanCd[a] || 0)) { SND.SFX.bad && SND.SFX.bad(); return; }
    H.fanCd[a] = App.serverNow() + 600;
    const msgO = { t: 'kfan', a, to: H.fanT };
    if (a === 'cheer') { msgO.e = H.emoI++ % EMO.length; }
    App.send(msgO);
    SND.vibrate(15);
    if (a === 'boost') { sfx('firework'); popSub(`🎆 ${nameOf(H.fanT)}에게 응원 폭죽!`, '#FFD23F'); }
    else if (a === 'honey') { sfx('honeyDrop'); popSub(`🍯 ${nameOf(H.fanT)} 앞에 꿀 웅덩이!`, '#FFC93C'); }
    else { sfx('cheer'); popSub(`📣 ${EMO[(H.emoI - 1) % EMO.length]}`, '#FFFFFF'); }
  }

  /* ================================================================
     화면 위 글자 · 계기판
     ================================================================ */
  function countdown(t, ks) {
    if (ks.status === 'load' || !ks.startAt) return;
    let lbl = '';
    if (t < 0 && t > -3.2) lbl = String(Math.ceil(-t));
    else if (t >= 0 && t < 0.9) lbl = '출발!';
    if (lbl === H.lastCount) return;
    H.lastCount = lbl;
    if (!lbl) { if ($('#kt-center').dataset.kind === 'count') $('#kt-center').textContent = ''; return; }
    if (lbl === '출발!') { sfx('count', 0); popCenter('출발!', 'go'); SND.vibrate(60); H.started = true; } else { sfx('count', 1); popCenter(lbl, 'count'); SND.vibrate(15); }
    if (lbl === '3' && H.me) popSub(H.helper ? '도우미 모드 · 저절로 달려요' : '출발 직전에 초록을 누르면 번개 출발!', '#FFE27A');
  }
  function popCenter(text, kind) {
    const c = $('#kt-center');
    c.textContent = text;
    c.dataset.kind = kind || '';
    c.className = 'kt-center disp k-' + (kind || 'x');
    void c.offsetWidth;
    c.classList.add('show');
    clearTimeout(H.cT);
    H.cT = setTimeout(() => c.classList.remove('show'), kind === 'count' ? 900 : 1500);
  }
  function popSub(text, col) {
    const c = $('#kt-sub');
    c.textContent = text;
    c.style.color = col || '#FFE27A';
    c.classList.remove('show'); void c.offsetWidth; c.classList.add('show');
    clearTimeout(H.sT);
    H.sT = setTimeout(() => c.classList.remove('show'), 1300);
  }
  function msg(text, kind) {
    const box = $('#kt-msgs');
    const d = document.createElement('div');
    d.className = 'kt-msg ' + (kind || '');
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 2800);
  }
  function edge(col) {
    const e = $('#kt-edge');
    e.style.setProperty('--ec', col);
    e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
  }
  function speedLines(sec) {
    const s = $('#kt-speed');
    s.classList.add('show');
    clearTimeout(H.slT);
    H.slT = setTimeout(() => s.classList.remove('show'), sec * 1000);
  }

  function myRankNow() {
    if (!H.me) return 0;
    const me = H.me;
    let r = 1;
    for (let i = 0; i < H.roster.length; i++) {
      if (i === H.myIdx) continue;
      const fin = H.finT[i];
      const row = H.buf[i][H.buf[i].length - 1];
      if (!row) continue;
      if (me.finished) { if (fin != null && fin < me.finT) r++; } else if (fin != null || row.p > me.prog) r++;
    }
    return r;
  }

  const fmtClock = (t) => { if (t < 0) t = 0; const m = Math.floor(t / 60); const s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
  function hud(t, now) {
    const k = H.me;
    const T = H.T;
    if (k) {
      const r = myRankNow();
      if (r !== H.rank) {
        const el = $('#kt-rank');
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
        H.rank = r;
      }
      $('#kt-rank').textContent = H.rank;
      $('#kt-rank').className = 'disp' + (H.rank === 1 ? ' first' : '') + ($('#kt-rank').classList.contains('bump') ? ' bump' : '');
      const lap = Math.min(T.laps, Math.max(1, Math.floor(Math.max(0, k.prog) / T.L) + 1));
      $('#kt-lap').textContent = k.finished ? '결승!' : `${lap}/${T.laps} 바퀴`;
      $('#kt-time').textContent = fmtClock(k.finished ? k.finT : t);
      const dr = $('#kt-draft');
      dr.classList.toggle('show', k.draft > 0.05 && !k.finished);
      dr.firstElementChild.style.transform = `scaleX(${Math.min(1, k.draft)})`;
      const hn = $('#kt-honey');
      if (k.slowT <= 0 && hn.classList.contains('show') && !hn.dataset.keep) hn.classList.remove('show');
    } else {
      $('#kt-rank').textContent = '응원';
      $('#kt-lap').textContent = '응원단';
      $('#kt-time').textContent = fmtClock(t);
    }
    // 아이템 칸
    if (H.rolling) {
      const el = performance.now() - H.rolling.t0;
      if (H.rolling.it && el > 900) {
        H.item = H.rolling.it; H.rolling = null;
        sfx('itemGet'); SND.vibrate(20);
        renderItem(true);
      } else if (el > 2600) { H.rolling = null; renderItem(); }
      else {
        const i = Math.floor(el / 85) % ITEM_IDS.length;
        if (H.rollShow !== i) { H.rollShow = i; sfx('rollTick', i); renderItem(false, ITEM_IDS[i]); }
      }
    }
    if (H.spec) { renderFan(false); fanCooldowns(); }
    padLabels();
    // 지도 (3프레임마다)
    if (++H.mapFrame % 3 === 0) drawMap();
    void now;
  }
  function renderItem(got, rollId) {
    const box = $('#kt-item');
    const inn = $('#kt-item-in');
    const nm = $('#kt-item-nm');
    const id = rollId || H.item;
    box.classList.toggle('has', !!H.item);
    box.classList.toggle('roll', !!rollId);
    if (!id) { inn.innerHTML = ''; nm.textContent = ''; return; }
    inn.innerHTML = `<i>${face(ITEM[id].ath, 'h')}</i><em>${ITEM[id].ic}</em>`;
    nm.textContent = rollId ? '두근두근…' : ITEM[id].name;
    if (got) { box.classList.remove('got'); void box.offsetWidth; box.classList.add('got'); popSub(`${ITEM[id].ic} ${ITEM[id].name} · ${H.helper ? '초록 톡!' : '초록 톡 (방향 버튼 떼고)'}`, '#FFE27A'); }
  }
  function fanCooldowns() {
    const n = App.serverNow();
    [['r', 'boost', 5000], ['g', 'cheer', 900], ['b', 'honey', 6000]].forEach(([c, a, full]) => {
      const left = Math.max(0, (H.fanCd[a] || 0) - n);
      const bez = $(`#kt-pad .bez[data-c="${c}"]`);
      bez.style.setProperty('--cd', String(Math.min(1, left / full)));
      bez.classList.toggle('kt-cool', left > 0);
    });
  }

  /* ---------------- 작은 지도 ---------------- */
  let mapTf = null;
  function drawMapBg() {
    const T = H.T;
    const cv = document.createElement('canvas');
    cv.width = 220; cv.height = 220;
    const g = cv.getContext('2d');
    let x0 = 1e9; let y0 = 1e9; let x1 = -1e9; let y1 = -1e9;
    for (let i = 0; i < T.main.n; i++) { x0 = Math.min(x0, T.main.px[i]); x1 = Math.max(x1, T.main.px[i]); y0 = Math.min(y0, T.main.py[i]); y1 = Math.max(y1, T.main.py[i]); }
    const sc = 196 / Math.max(x1 - x0, y1 - y0);
    const ox = 110 - (x0 + x1) / 2 * sc; const oy = 110 - (y0 + y1) / 2 * sc;
    mapTf = { sc, ox, oy };
    const path = (P, closed) => { g.beginPath(); for (let i = 0; i < P.n; i += 2) { const x = P.px[i] * sc + ox; const y = P.py[i] * sc + oy; i ? g.lineTo(x, y) : g.moveTo(x, y); } if (closed) g.closePath(); };
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (T.sc) { path(T.sc, false); g.strokeStyle = 'rgba(216,178,122,.9)'; g.lineWidth = 6; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]); }
    path(T.main, true); g.strokeStyle = 'rgba(21,18,43,.85)'; g.lineWidth = 15; g.stroke();
    path(T.main, true); g.strokeStyle = '#B9B4D6'; g.lineWidth = 9; g.stroke();
    const s0 = K.mainPoint(T, 0, 0);
    g.save(); g.translate(s0.x * sc + ox, s0.y * sc + oy); g.rotate(s0.h);
    g.fillStyle = '#fff'; g.fillRect(-2, -7, 4, 14); g.fillStyle = '#15122B'; g.fillRect(-2, -7, 2, 3.5); g.fillRect(0, -3.5, 2, 3.5); g.fillRect(-2, 0, 2, 3.5); g.fillRect(0, 3.5, 2, 3.5);
    g.restore();
    H.mapBg = cv;
  }
  function drawMap() {
    const cv = $('#kt-map');
    if (!cv || !H.mapBg || !H.view || !mapTf) return;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 220, 220);
    g.drawImage(H.mapBg, 0, 0);
    const { sc, ox, oy } = mapTf;
    // 아이템 (가시공)
    const it = itemsNow(serverRel() - INTERP_MS);
    it.forEach((x) => { g.fillStyle = x.kind === 'spike' ? '#8E5E40' : '#FFC93C'; g.beginPath(); g.arc(x.x * sc + ox, x.y * sc + oy, x.kind === 'spike' ? 3.5 : 4, 0, 7); g.fill(); });
    const order = H.roster.map((_, i) => i).sort((a, b) => (a === H.myIdx) - (b === H.myIdx));
    order.forEach((i) => {
      const s = H.view.st[i];
      if (!s || (!s.x && !s.y)) return;
      const a = window.Oly ? window.Oly.ath(H.roster[i].ath) : { jersey: '#fff' };
      const x = s.x * sc + ox; const y = s.y * sc + oy;
      const me = i === H.myIdx || (H.spec && i === H.fanT);
      g.fillStyle = '#15122B'; g.beginPath(); g.arc(x, y, me ? 9 : 6.5, 0, 7); g.fill();
      g.fillStyle = a.jersey; g.beginPath(); g.arc(x, y, me ? 7 : 5, 0, 7); g.fill();
      if (me) { g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 9.5, 0, 7); g.stroke(); }
      if (H.rankList[0] === i) { g.fillStyle = '#FFD23F'; g.beginPath(); g.moveTo(x - 6, y - 9); g.lineTo(x - 6, y - 15); g.lineTo(x - 3, y - 12); g.lineTo(x, y - 16); g.lineTo(x + 3, y - 12); g.lineTo(x + 6, y - 15); g.lineTo(x + 6, y - 9); g.fill(); }
    });
  }

  /* ---------------- 빠르기 재기 (느리면 화질을 조금 낮춰요) ---------------- */
  function trackFps(now, dt) {
    H.stats.frames++;
    const a = H.fpsT;
    a.push(now);
    while (a.length && now - a[0] > 2000) a.shift();
    H.fps = a.length > 1 ? (a.length - 1) / ((a[a.length - 1] - a[0]) / 1000) : 0;
    if (!H.view || now - H.viewAt < 3000) return;
    if (H.fps < 42) {
      if (!H.fpsLowSince) H.fpsLowSince = now;
      if (now - H.fpsLowSince > 3000 && H.view.pixelRatio() > 1.01) {
        H.view.setPixelRatio(Math.max(1, H.view.pixelRatio() - 0.35));
        H.fpsLowSince = now;
      }
    } else H.fpsLowSince = 0;
    void dt;
  }

  /* ================================================================
     결과
     ================================================================ */
  function showResult(ks) {
    const res = ks.result;
    if (!res) return;
    const key = ks.id + ':' + res.at;
    const box = $('#kt-res');
    if (H.resultKey === key) { resultButtons(box); return; }
    H.resultKey = key;
    H.spec = false; padLabels();
    $('#kt-fan').classList.remove('show');
    $('#kt-warn').classList.remove('show');
    const medals = ['🥇', '🥈', '🥉'];
    const rows = res.rows.map((r) => {
      const me = r.pid === S.pid;
      return `<div class="kt-rrow${me ? ' me' : ''}${r.bot ? ' bot' : ''}" style="animation-delay:${(0.25 + r.rank * 0.09).toFixed(2)}s">
        <span class="kt-rr-k disp">${medals[r.rank - 1] || r.rank}</span><i class="kt-rr-f">${face(r.ath, r.rank <= 3 ? 'h' : 'n')}</i>
        <span class="kt-rr-n">${me ? '나 (' + esc(r.name) + ')' : esc(r.name)}${r.helper ? '<em>도우미</em>' : ''}</span>
        <span class="kt-rr-t">${K.fmtTime(r.t)}${r.est ? '*' : ''}${r.rank > 1 ? `<small>+${r.gap.toFixed(1)}초</small>` : ''}</span></div>`;
    }).join('');
    const humans = res.rows.filter((r) => !r.bot);
    const aw = humans.map((r) => (res.awards[r.pid] || []).map((a) => `<div class="kt-aw${r.pid === S.pid ? ' me' : ''}"><span class="kt-aw-ic">${a.ic}</span><div><b class="disp">${esc(a.t)}</b><span>${esc(r.name)} · ${esc(a.d)}</span></div><i>${face(r.ath, 'h')}</i></div>`).join('')).join('');
    const mine = res.rows.find((r) => r.pid === S.pid);
    const head = mine ? (mine.rank === 1 ? '우승! 🏆' : `${mine.rank}등!`) : '결승 결과';
    box.innerHTML = `<div class="confetti" id="kt-confetti"></div><div class="kt-res-card">
      <div class="kt-res-top"><span class="hint-sm">도토리 공원 서킷 · 2바퀴</span><h2 class="disp">${head}</h2>
      ${res.rows.length > 1 ? `<span class="hint-sm">1등과 꼴찌 차이 ${(res.rows[res.rows.length - 1].t - res.rows[0].t).toFixed(1)}초</span>` : ''}</div>
      <div class="kt-rows">${rows}</div>
      ${aw ? `<div class="list-head sub"><span>오늘의 웃긴 상</span></div><div class="kt-aws">${aw}</div>` : ''}
      <div class="kt-res-btns" id="kt-res-btns"></div></div>`;
    resultButtons(box);
    box.classList.add('show');
    sfx('update', 0, false, false, 0, true);
    if (mine && mine.rank === 1) { SND.SFX.fanfare && SND.SFX.fanfare(); SND.vibrate([80, 40, 80, 40, 200]); } else if (SND.SFX.victory) SND.SFX.victory();
    if (App.confetti) App.confetti('kt-confetti', mine && mine.rank === 1 ? 80 : 40, !!(mine && mine.rank <= 3));
  }
  function resultButtons(box) {
    const isHost = S.room && S.room.hostPid === S.pid;
    const b = box.querySelector('#kt-res-btns');
    if (!b) return;
    const host = App.playerById(S.room.hostPid);
    const html = isHost
      ? '<button class="btn btn-yellow" type="button" data-kres="again">🔁 바로 한 판 더!</button><button class="btn btn-ghost" type="button" data-kres="lobby">대기실로</button>'
      : `<div class="hint-md center">${esc(host ? host.name : '방장')}님이 [한 판 더]를 누르면 바로 다시 출발해요</div>`;
    if (b.innerHTML !== html) b.innerHTML = html;
  }

  /* ================================================================
     시작
     ================================================================ */
  function $$(s) { return Array.from(document.querySelectorAll(s)); }
  function setup() {
    buildScreen();
    const panel = $('#kart-panel');
    if (panel) panel.addEventListener('click', onLobbyClick);
    App.hooks.state.push(onState);
    App.hooks.message.push(onMessage);
  }

  window.KartHall = { renderLobby, lobbyMain, H, ITEM, press, preload, debug: { onEvent, applyHit, popCenter, popSub } };
  setup();
})();
