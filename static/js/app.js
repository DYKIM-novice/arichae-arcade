/* 아리채 오락실 - 화면 흐름, 서버 연결, 입력 처리 */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = window.Animals;
  const G = window.Games;
  const SND = window.Sound;

  // 다른 모듈이 끼어들 수 있는 자리 (메시지 받을 때, 상태 바뀔 때, 결과·최종 화면)
  const HOOKS = { message: [], state: [], result: [], final: [] };

  const KEY_SESSION = 'arichae_session';
  const KEY_PROFILE = 'arichae_profile';
  const LENGTHS = [
    { n: 3, name: '짧게', sub: '3게임 · 약 3분' },
    { n: 5, name: '보통', sub: '5게임 · 약 5분' },
    { n: 10, name: '길게', sub: '10게임 · 약 10분' }
  ];
  const LEVELS = [
    { k: 'e', name: '초등', sub: '처음 해봐요' },
    { k: 'm', name: '중등', sub: '조금 더 빨리' },
    { k: 'h', name: '고등', sub: '도전!' }
  ];
  const CAT_STYLE = {
    r: ['rgba(255,71,87,.22)', '#FF8B95'],
    g: ['rgba(46,213,115,.2)', '#7DF0AE'],
    b: ['rgba(61,123,255,.22)', '#A9C4FF'],
    y: ['rgba(255,210,63,.2)', '#FFE27A']
  };

  const S = {
    ws: null,
    connected: false,
    pid: null,
    token: null,
    code: null,
    room: null,
    info: null,
    offset: 0,
    samples: [],
    rtt: 0,
    live: {},
    mode: 'create',
    profile: { name: '', animal: null },
    taken: [],
    joining: false,
    kicked: false,
    retry: 0,
    reconnectTimer: null,
    pingTimer: null,
    shownKey: '',
    // 현재 미니게임
    def: null,
    inst: null,
    playIndex: -1,
    started: false,
    ended: false,
    spectator: false,
    lockUntil: 0,
    lastProg: 0,
    lastSentScore: -1,
    lastRivals: 0,
    hurry: false,
    lastSecond: -1,
    introTick: '',
    myScore: 0,
    modalAnimal: null,
    wakeLock: null
  };

  /* ---------------- 공통 유틸 ---------------- */
  function serverNow() { return Date.now() + S.offset; }

  function loadJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function saveJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 무시 */ }
  }
  function clearKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* 무시 */ }
  }

  function deviceName() {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return '태블릿';
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return '휴대폰';
    return 'PC';
  }

  let toastTimer = null;
  function toast(text, ms) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2200);
  }

  function banner(text) {
    const b = $('#banner');
    if (text) { b.textContent = text; b.classList.add('show'); } else b.classList.remove('show');
  }

  function showScreen(id) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }

  function me() {
    return S.room ? S.room.players.find((p) => p.pid === S.pid) : null;
  }

  function playerById(pid) {
    return S.room ? S.room.players.find((p) => p.pid === pid) : null;
  }

  function fmtNum(n) { return Number(n || 0).toLocaleString('ko-KR'); }

  async function wakeLock(on) {
    try {
      if (on && 'wakeLock' in navigator && !S.wakeLock) {
        S.wakeLock = await navigator.wakeLock.request('screen');
        S.wakeLock.addEventListener('release', () => { S.wakeLock = null; });
      } else if (!on && S.wakeLock) {
        await S.wakeLock.release();
        S.wakeLock = null;
      }
    } catch (e) { /* 미지원 */ }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* ---------------- 캐릭터 고르기 ---------------- */
  function renderPicker(box, selected, taken, onPick) {
    box.innerHTML = A.LIST.map(([k, n]) => {
      const isTaken = taken.includes(k);
      const on = k === selected;
      return `<button type="button" data-k="${k}" class="${on ? 'on' : ''} ${isTaken ? 'taken' : ''}" aria-pressed="${on}" aria-label="${n}${isTaken ? ' (사용 중)' : ''}" ${isTaken ? 'disabled' : ''}>${A.svg(k)}</button>`;
    }).join('');
    box.onclick = (e) => {
      const b = e.target.closest('button[data-k]');
      if (!b || b.disabled) return;
      SND.unlock();
      SND.SFX.click();
      onPick(b.dataset.k);
    };
  }

  /* ================================================================
     입장 화면
     ================================================================ */
  const params = new URLSearchParams(location.search);
  let inviteCode = (params.get('room') || '').replace(/\D/g, '').slice(0, 4);

  function setMode(mode) {
    S.mode = mode;
    $$('#home-mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    $('#code-field').style.display = mode === 'join' ? '' : 'none';   // 초대 링크로 와도 코드를 고칠 수 있게 늘 보여요
    $('#enter-btn').textContent = mode === 'create' ? '방 만들기' : '입장하기';
    if (mode === 'create') {
      S.taken = [];
      $('#invite-line').style.display = 'none';
      renderHomePicker();
    } else if ($('#code-input').value.length === 4) {
      lookupRoom($('#code-input').value);
    }
  }

  function renderHomePreview() {
    $('#pf-preview').innerHTML = S.profile.animal ? A.svg(S.profile.animal) : '';
    const n = $('#name-input').value.trim();
    $('#name-count').textContent = `눌러서 수정 · ${n.length}/8자`;
  }

  function renderHomePicker() {
    if (!S.profile.animal || S.taken.includes(S.profile.animal)) {
      const free = A.LIST.map((x) => x[0]).filter((k) => !S.taken.includes(k));
      S.profile.animal = free[Math.floor(Math.random() * free.length)] || 'rabbit';
    }
    renderPicker($('#home-picker'), S.profile.animal, S.taken, (k) => {
      S.profile.animal = k;
      renderHomePicker();
    });
    renderHomePreview();
  }

  async function lookupRoom(code) {
    try {
      const r = await fetch('/api/room/' + encodeURIComponent(code), { cache: 'no-store' });
      const d = await r.json();
      const line = $('#invite-line');
      if (!d.exists) {
        line.style.display = '';
        line.innerHTML = '방을 찾을 수 없어요. 코드를 확인해 주세요';
        S.taken = [];
        renderHomePicker();
        return false;
      }
      line.style.display = '';
      line.innerHTML = `<b>${esc(d.hostName)}</b>님의 방에 초대됐어요 · ${d.count}/${d.max}명`;
      S.taken = d.taken || [];
      renderHomePicker();
      return true;
    } catch (e) {
      return false;
    }
  }

  function setupHome() {
    const saved = loadJSON(KEY_PROFILE);
    if (saved) {
      S.profile.name = saved.name || '';
      S.profile.animal = saved.animal || null;
    }
    $('#name-input').value = S.profile.name;
    $('#name-input').addEventListener('input', renderHomePreview);
    $('#home-mode').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mode]');
      if (b) { SND.unlock(); setMode(b.dataset.mode); }
    });
    $('#code-input').addEventListener('input', (e) => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 4);
      e.target.value = v;
      if (v.length === 4) lookupRoom(v);
    });
    $('#enter-btn').addEventListener('click', enter);

    if (inviteCode) {
      // 초대 링크: 코드를 미리 채워 두고, 방이 없어졌으면 다른 코드를 넣거나 새 방을 만들 수 있게
      $('#home-room').innerHTML = roomIcon() + ' 방 ' + inviteCode;
      $('#code-input').value = inviteCode;
      setMode('join');
      lookupRoom(inviteCode).then((ok) => {
        if (!ok) {
          $('#home-room').textContent = '';
          forgetInvite();
          $('#home-err').textContent = '초대받은 방이 없어졌어요. 방 코드를 다시 넣거나 [방 만들기]로 새 방을 만들어요';
        }
      });
    } else {
      setMode('create');
    }
    renderHomePicker();
  }

  function roomIcon() {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2ED573" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M2 9a15 15 0 0 1 20 0"/><path d="M5.5 12.5a10 10 0 0 1 13 0"/><path d="M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1" fill="#2ED573"/></svg>';
  }

  async function enter() {
    if (S.joining) return;
    SND.unlock();
    SND.SFX.click();
    $('#home-err').textContent = '';
    let code = '';
    if (S.mode === 'join') {
      code = $('#code-input').value.replace(/\D/g, '').slice(0, 4);
      if (code.length !== 4) {
        $('#home-err').textContent = '방 코드 4자리를 입력해 주세요';
        return;
      }
    }
    let name = $('#name-input').value.trim();
    if (!name) {
      name = A.name(S.profile.animal) || '플레이어';
      $('#name-input').value = name;
    }
    S.profile.name = name;
    saveJSON(KEY_PROFILE, S.profile);
    S.joining = true;
    const btn = $('#enter-btn');
    btn.disabled = true;
    btn.textContent = '들어가는 중…';
    try {
      await connect();
      send({ t: 'join', room: code, name, animal: S.profile.animal, device: deviceName() });
    } catch (e) {
      failJoin('서버에 연결할 수 없어요. 인터넷 연결을 확인하고 잠시 뒤 다시 눌러 주세요');
    }
  }

  // 주소에 남은 초대 코드 지우기 (없어진 방으로 계속 들어가려 하지 않게)
  function forgetInvite() {
    inviteCode = '';
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* 무시 */ }
  }

  function failJoin(msg) {
    S.joining = false;
    const btn = $('#enter-btn');
    btn.disabled = false;
    btn.textContent = S.mode === 'create' ? '방 만들기' : '입장하기';
    $('#home-err').textContent = msg;
  }

  /* ================================================================
     서버 연결
     ================================================================ */
  function wsUrl() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  const CONNECT_TIMEOUT = 8000;   // 이 시간 안에 연결이 안 되면 다시 시도
  const STALE_MS = 9000;          // 이 시간 동안 서버에서 아무것도 안 오면 끊긴 것으로 보고 다시 연결

  function connect() {
    return new Promise((resolve, reject) => {
      if (S.ws && S.ws.readyState === WebSocket.OPEN) { resolve(); return; }
      if (S.ws) dropSocket();
      let ws;
      try { ws = new WebSocket(wsUrl()); } catch (e) { reject(e); return; }
      S.ws = ws;
      let opened = false;
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        reject(new Error('closed'));
      };
      const timer = setTimeout(() => {
        if (opened || S.ws !== ws) return;
        // 응답 없는 연결 시도는 버리고 다시 시도
        detach(ws);
        if (S.ws === ws) S.ws = null;
        fail();
      }, CONNECT_TIMEOUT);
      ws.onopen = () => {
        clearTimeout(timer);
        if (S.ws !== ws) { detach(ws); return; }
        opened = true;
        settled = true;
        S.connected = true;
        S.retry = 0;
        S.lastMsgAt = Date.now();
        startPing();
        resolve();
      };
      ws.onmessage = (ev) => {
        if (S.ws !== ws) return;
        S.lastMsgAt = Date.now();
        let msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        handle(msg);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (S.ws === ws) {
          S.connected = false;
          S.ws = null;
          stopPing();
          updateConnPill();
          if (!opened) { fail(); return; }
          scheduleReconnect();
        }
      };
      ws.onerror = () => { /* onclose에서 처리 */ };
    });
  }

  // 이벤트를 떼고 소켓을 닫아요 (닫히는 걸 기다리지 않음)
  function detach(ws) {
    ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
    try { ws.close(); } catch (e) { /* 무시 */ }
  }
  function dropSocket() {
    const ws = S.ws;
    S.ws = null;
    S.connected = false;
    stopPing();
    if (ws) detach(ws);
    updateConnPill();
  }
  // 반쯤 끊긴 연결(신호가 안 오는데 닫히지도 않은 상태)을 찾아서 다시 연결
  function checkStale() {
    if (!S.ws || !S.connected || !S.pid) return;
    if (Date.now() - (S.lastMsgAt || 0) > STALE_MS) {
      dropSocket();
      reconnectNow();
    }
  }
  function reconnectNow() {
    if (S.kicked || !S.pid) return;
    S.retry = 0;
    clearTimeout(S.reconnectTimer);
    if (S.connected && S.ws && S.ws.readyState === WebSocket.OPEN) return;
    scheduleReconnect(0);
  }

  function send(obj) {
    if (S.ws && S.ws.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(obj));
  }

  function startPing() {
    stopPing();
    const ping = () => {
      checkStale();
      send({ t: 'ping', c: Date.now(), rtt: Math.round(S.rtt) });
    };
    ping();
    S.pingTimer = setInterval(ping, 2000);
  }
  function stopPing() {
    if (S.pingTimer) clearInterval(S.pingTimer);
    S.pingTimer = null;
  }

  function scheduleReconnect(delay) {
    if (S.kicked || !S.pid) return;
    banner('연결이 끊겼어요 · 다시 연결하는 중…');
    clearTimeout(S.reconnectTimer);
    const wait = delay != null ? delay : Math.min(4000, 600 * (S.retry + 1));
    S.retry++;
    S.reconnectTimer = setTimeout(async () => {
      if (S.connecting) return;
      S.connecting = true;
      try {
        await connect();
        send({ t: 'rejoin', room: S.code, pid: S.pid, token: S.token });
      } catch (e) {
        S.connecting = false;
        scheduleReconnect();
        return;
      }
      S.connecting = false;
    }, wait);
  }

  // 다른 앱(카톡 등)에 다녀오거나 화면을 다시 켜면 바로 연결 상태를 확인해요
  function setupResume() {
    const resume = () => {
      if (document.visibilityState !== 'visible' || !S.pid || S.kicked) return;
      if (!S.connected || !S.ws) reconnectNow();
      else checkStale();
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('online', () => { if (S.pid) { dropSocket(); reconnectNow(); } });
  }

  function handle(msg) {
    HOOKS.message.forEach((fn) => { try { fn(msg); } catch (e) { console.error(e); } });
    switch (msg.t) {
      case 'pong': {
        const rtt = Date.now() - msg.c;
        S.rtt = rtt;
        S.samples.push({ rtt, off: msg.s + rtt / 2 - Date.now() });
        if (S.samples.length > 8) S.samples.shift();
        const best = S.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        S.offset = best.off;
        break;
      }
      case 'joined':
        S.pid = msg.pid;
        S.token = msg.token;
        S.code = msg.code;
        S.joining = false;
        saveJSON(KEY_SESSION, { code: S.code, pid: S.pid, token: S.token });
        if (history.replaceState) history.replaceState(null, '', '?room=' + S.code);
        banner('');
        break;
      case 'state':
        if (!S.samples.length && msg.now) S.offset = msg.now - Date.now();
        onState(msg.room);
        break;
      case 'live':
        if (S.room && msg.g === S.room.index) S.live = msg.vals || {};
        break;
      case 'event':
        if (msg.kind === 'join' && msg.pid !== S.pid) {
          const p = playerById(msg.pid);
          if (p) toast(`${p.name}님이 들어왔어요`);
          SND.SFX.join();
        }
        break;
      case 'kicked':
        S.kicked = true;
        clearKey(KEY_SESSION);
        toast('방에서 나가게 됐어요');
        setTimeout(() => { location.href = location.pathname; }, 1200);
        break;
      case 'error':
        onError(msg);
        break;
      default:
        break;
    }
  }

  function onError(msg) {
    if (msg.code === 'rejoin_failed') {
      clearKey(KEY_SESSION);
      S.pid = null;
      banner('');
      if (S.ws) try { S.ws.close(); } catch (e) { /* 무시 */ }
      showScreen('s-home');
      return;
    }
    if (msg.code === 'animal_taken' && msg.taken) {
      S.taken = msg.taken;
      if (S.room) {
        toast(msg.msg);
        openProfile();
      } else {
        renderHomePicker();
      }
    }
    if (!S.room && msg.code === 'no_room') {
      // 방이 없어졌어요 (서버를 새로 올리면 방이 사라져요) → 코드 칸을 열어 다시 넣게
      forgetInvite();
      $('#home-room').textContent = '';
      setMode('join');
      failJoin('방을 찾을 수 없어요. 방장에게 지금 방 코드를 물어보고 다시 넣어 주세요 (또는 [방 만들기])');
      const ci = $('#code-input');
      ci.select && ci.select(); ci.focus();
      return;
    }
    if (!S.room) failJoin(msg.msg || '입장할 수 없어요');
    else toast(msg.msg || '할 수 없어요');
  }

  /* ================================================================
     상태 반영
     ================================================================ */
  function onState(room) {
    const prev = S.room;
    S.room = room;
    updateConnPill();
    const key = room.phase + ':' + room.index;
    const changed = key !== S.shownKey;
    if (changed) clearTimers();
    if (changed && room.phase !== 'final') FW.stop();

    if (room.phase === 'lobby') {
      if (changed) {
        cleanupGame();
        S.playIndex = -1;
        setTheme('base');
        SND.BGM.stop();
        wakeLock(false);
        showScreen('s-lobby');
      }
      renderLobby(prev);
    } else if (room.phase === 'intro') {
      if (changed) {
        cleanupGame();
        S.playIndex = -1;
        setupIntro();
        showScreen('s-intro');
        SND.SFX.whoosh();
        wakeLock(true);
      }
    } else if (room.phase === 'play') {
      if (S.playIndex !== room.index) startPlay();
      else renderRivals(true);
    } else if (room.phase === 'result') {
      if (changed) {
        if (S.inst && !S.ended) finishPlay();
        renderResult();
        showScreen('s-result');
      }
    } else if (room.phase === 'board' || room.phase === 'card') {
      // 보드게임관·카드게임관: 화면은 board/hall.js · cards/hall.js 가 그려요
      if (changed) { cleanupGame(); S.playIndex = -1; SND.BGM.stop(); setTheme('base'); }
    } else if (room.phase === 'final') {
      if (changed) {
        cleanupGame();
        SND.BGM.stop();
        renderFinal();
        showScreen('s-final');
        wakeLock(false);
      } else {
        renderFinalActions();
      }
    }
    S.shownKey = key;
    HOOKS.state.forEach((fn) => { try { fn(room, changed, prev); } catch (e) { console.error(e); } });
  }

  function updateConnPill() {
    const pill = $('#conn-pill');
    if (!pill) return;
    pill.classList.toggle('bad', !S.connected);
    pill.querySelector('span').textContent = S.connected ? '서버 연결됨' : '연결 끊김';
  }

  /* ================================================================
     대기실
     ================================================================ */
  function renderLobby(prev) {
    const room = S.room;
    const mine = me();
    const isHost = room.hostPid === S.pid;

    $('#code-digits').innerHTML = room.code.split('').map((d) => `<span>${d}</span>`).join('');
    $('#player-count').innerHTML = `<b>${room.players.length}</b> / ${room.maxPlayers}명`;

    const now = serverNow();
    $('#player-list').innerHTML = room.players.map((p) => {
      const isMe = p.pid === S.pid;
      let st;
      if (!p.connected) st = '<span class="status lost">재접속 중</span>';
      else if (p.isHost) st = '<span class="status ready">방장</span>';
      else if (p.ready) st = '<span class="status ready">준비 완료</span>';
      else st = '<span class="status on">접속 중</span>';
      const sub = p.connected
        ? `${p.rtt ? '응답 ' + p.rtt + 'ms' : '응답 확인 중'} · ${esc(p.device || '기기')}`
        : `연결 끊김 · ${Math.max(0, Math.round((now - p.offSince) / 1000))}초 전`;
      const kick = isHost && !p.connected && !isMe
        ? `<button class="kick" type="button" data-kick="${p.pid}" aria-label="${esc(p.name)} 내보내기"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF8B95" stroke-width="3" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg></button>`
        : '';
      return `<div class="prow${isMe ? ' me' : ''}${p.connected ? '' : ' off'}">
        <div class="av">${A.svg(p.animal)}</div>
        <div class="who"><div class="nm">${esc(p.name)}${p.isHost ? '<span class="tag host">방장</span>' : ''}${isMe ? '<span class="tag me">나</span>' : ''}</div>
        <div class="sub">${sub}</div></div>${st}${kick}</div>`;
    }).join('') + (room.players.length < room.maxPlayers
      ? `<div class="empty-row"><div class="slots">${'<span></span>'.repeat(Math.min(3, room.maxPlayers - room.players.length))}</div>빈 자리 ${room.maxPlayers - room.players.length}개 · 링크로 바로 들어올 수 있어요</div>`
      : '');

    renderSettings(isHost);
    placeLobbyActions(isHost);

    const edu = room.mode === 'edu';
    const musicMode = room.mode === 'music';
    const picks = edu ? (room.picks || []) : musicMode ? (room.songs || []) : [];
    const others = room.players.filter((p) => !p.isHost && p.connected);
    const readyCount = others.filter((p) => p.ready).length + 1;
    const total = others.length + 1;
    const mainBtn = $('#btn-main');
    const hall = room.mode === 'board' ? window.BoardHall : room.mode === 'card' ? window.CardHall : null;
    if (isHost && hall) {
      const bm = hall.lobbyMain();
      mainBtn.className = 'btn btn-green' + (bm.wait ? ' wait' : '');
      mainBtn.textContent = bm.label;
      $('#lobby-help').textContent = bm.help;
    } else if (isHost) {
      const noPick = (edu || musicMode) && !picks.length;
      mainBtn.className = 'btn btn-green' + (noPick ? ' wait' : '');
      mainBtn.textContent = noPick ? (musicMode ? '곡을 골라주세요' : '게임을 골라주세요')
        : edu ? `과학관 시작 · ${picks.length}게임` : musicMode ? `음악관 시작 · ${picks.length}곡` : '시작하기';
      $('#lobby-help').innerHTML = noPick
        ? (musicMode ? '위에서 연주할 곡을 눌러 주세요' : '위에서 하고 싶은 게임을 눌러 주세요')
        : total === 1
          ? '가족을 초대하거나 혼자 연습할 수 있어요'
          : `준비 완료 <b>${readyCount}</b> / ${total}명 · ${readyCount === total ? '모두 준비됐어요!' : '그래도 시작할 수 있어요'}`;
    } else if (mine) {
      mainBtn.className = mine.ready ? 'btn btn-ghost' : 'btn btn-green';
      mainBtn.textContent = mine.ready ? '준비 취소' : '준비 완료!';
      const host = playerById(room.hostPid);
      $('#lobby-help').textContent = `${host ? host.name : '방장'}님이 시작하면 게임이 시작돼요`;
    }

    renderToggles();
  }

  // 참가자는 '준비 완료' 버튼을 방 코드 바로 아래(위쪽)에, 방장은 설정을 다 보고 누르도록 맨 아래에
  function placeLobbyActions(isHost) {
    const lobby = $('#s-lobby');
    const actions = lobby.querySelector('.lobby-actions');
    const anchor = lobby.querySelector('.code-card');
    if (!actions || !anchor) return;
    if (!isHost) {
      if (anchor.nextElementSibling !== actions) anchor.after(actions);
      actions.classList.add('top');
    } else {
      if (lobby.lastElementChild !== actions) lobby.appendChild(actions);
      actions.classList.remove('top');
    }
  }

  /* 모드(오락실/과학관/음악관) · 게임 길이 · 난이도 · 게임 고르기 */
  function renderSettings(isHost) {
    const room = S.room;
    const edu = room.mode === 'edu';
    const lv = room.level || 'm';
    const picks = room.picks || [];
    const dis = isHost ? '' : 'disabled';

    const music = room.mode === 'music';
    const board = room.mode === 'board';
    const card = room.mode === 'card';
    $('#settings').classList.toggle('edu', edu);
    $('#settings').classList.toggle('music', music);
    $('#settings').classList.toggle('board', board);
    $('#settings-note').textContent = isHost ? '눌러서 바꿀 수 있어요' : '방장만 바꿀 수 있어요';
    $$('#mode-seg button').forEach((b) => {
      const on = b.dataset.mode === (card ? 'card' : board ? 'board' : music ? 'music' : edu ? 'edu' : 'arcade');
      b.classList.toggle('on', on);
      b.disabled = !isHost;
      b.setAttribute('aria-pressed', String(on));
    });
    $('#arcade-panel').style.display = edu || music || board || card ? 'none' : '';
    $('#board-panel').style.display = board ? '' : 'none';
    $('#card-panel').style.display = card ? '' : 'none';
    if (board || card) { $('#edu-panel').style.display = 'none'; $('#music-panel').style.display = 'none'; }
    if (board) { if (window.BoardHall) window.BoardHall.renderLobby(isHost); return; }
    if (card) { if (window.CardHall) window.CardHall.renderLobby(isHost); return; }
    $('#edu-panel').style.display = edu ? '' : 'none';
    $('#music-panel').style.display = music ? '' : 'none';

    $('#lengths').innerHTML = LENGTHS.map((l) =>
      `<button type="button" data-len="${l.n}" class="${room.length === l.n ? 'on' : ''}" ${dis} aria-pressed="${room.length === l.n}"><b>${l.name}</b><span>${l.sub}</span></button>`).join('');
    if (music) { renderMusicPanel(isHost, lv); return; }
    if (!edu) return;

    $('#levels').innerHTML = LEVELS.map((l) =>
      `<button type="button" data-lv="${l.k}" class="lv-${l.k}${lv === l.k ? ' on' : ''}" ${dis} aria-pressed="${lv === l.k}"><b class="disp">${l.name}</b><span>${l.sub}</span></button>`).join('');

    $('#edu-cards').innerHTML = (G.EDU || []).map((id) => {
      const d = G.get(id);
      const n = picks.indexOf(id) + 1;
      const eff = G.effLevel(d, lv);
      const lvTags = ['e', 'm', 'h'].map((k) =>
        `<i class="${d.levels.includes(k) ? (k === eff ? 'cur' : 'has') : 'no'}">${G.LEVEL_NAME[k][0]}</i>`).join('');
      const note = eff !== lv ? `<span class="ec-note">${G.LEVEL_NAME[eff]}으로 해요</span>` : '';
      return `<button type="button" class="ec ec-${d.catColor}${n ? ' on' : ''}" data-pick="${id}" ${dis} aria-pressed="${!!n}">
        <span class="ec-ic">${d.icon || ''}</span>
        <span class="ec-txt"><span class="ec-hall">${esc(d.hall)}</span><b class="disp">${esc(d.title)}</b>
        <span class="ec-lv">${lvTags}${note}</span></span>
        <span class="ec-no">${n ? n : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'}</span>
      </button>`;
    }).join('');
    const secs = picks.reduce((s, id) => s + (G.get(id).dur || 45) + 14, 0);
    $('#pick-note').textContent = picks.length
      ? `${picks.length}개 · 약 ${Math.max(1, Math.round(secs / 60))}분 · 누른 순서대로`
      : '누른 순서대로 진행해요';
  }

  // 음악관: 난이도(초·중) + 곡 고르기
  function renderMusicPanel(isHost, lv) {
    const room = S.room;
    const dis = isHost ? '' : 'disabled';
    const mlv = ['e', 'm', 'h', 'x'].includes(lv) ? lv : 'm';
    const MNAME = { e: ['하', '보통 빠르기'], m: ['중', '빠르게·높은 소리'], h: ['상', '두 배 음표+화음'], x: ['특상', '더 빠르게+화음 두 번'] };
    const songs = room.songs || [];
    $('#mlevels').innerHTML = ['e', 'm', 'h', 'x'].map((k) =>
      `<button type="button" data-lv="${k}" class="lv-${k}${mlv === k ? ' on' : ''}" ${dis} aria-pressed="${mlv === k}"><b class="disp">${MNAME[k][0]}</b><span>${MNAME[k][1]}</span></button>`).join('');
    $('#song-cards').innerHTML = (G.MUSIC_SONGS || []).map((sg) => {
      const n = songs.indexOf(sg.id) + 1;
      return `<button type="button" class="ec ec-y${n ? ' on' : ''}" data-song="${sg.id}" ${dis} aria-pressed="${!!n}">
        <span class="ec-ic mb-ic">${MUSIC_NOTE}</span>
        <span class="ec-txt"><span class="ec-hall">${esc(sg.composer)}</span><b class="disp">${esc(sg.title)}</b>
        <span class="ec-lv"><span class="ec-note">주제 + 변주 · 약 1분 30초</span></span></span>
        <span class="ec-no">${n ? n : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'}</span>
      </button>`;
    }).join('');
    const secs = songs.length * (95 + 14);
    $('#song-note').textContent = songs.length
      ? `${songs.length}곡 · 약 ${Math.max(1, Math.round(secs / 60))}분 · 누른 순서대로`
      : '누른 순서대로 연주해요';
  }
  const MUSIC_NOTE = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="#2A1E3E"/><path d="M16 27 V11 L29 8 V24" fill="none" stroke="#FFE27A" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="13.5" cy="27.5" rx="4" ry="3" fill="#FFE27A"/><ellipse cx="26.5" cy="24.5" rx="4" ry="3" fill="#FFE27A"/></svg>';

  function renderToggles() {
    const sb = $('#btn-sound');
    const vb = $('#btn-vibe');
    sb.classList.toggle('off', SND.isMuted());
    sb.innerHTML = SND.isMuted()
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9C3E6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFD23F" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19.5 5.5a9 9 0 0 1 0 13"/></svg>';
    vb.style.display = SND.canVibrate() ? '' : 'none';
    vb.classList.toggle('off', !SND.isVibe());
    vb.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${SND.isVibe() ? '#FFD23F' : '#C9C3E6'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 9v6M21 9v6"/></svg>`;
  }

  function setupLobby() {
    $('#lengths').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-len]');
      if (!b || b.disabled) return;
      SND.SFX.click();
      send({ t: 'settings', length: Number(b.dataset.len) });
    });
    $('#mode-seg').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-mode]');
      if (!b || b.disabled || !S.room) return;
      SND.SFX.click();
      send({ t: 'settings', mode: b.dataset.mode });
    });
    $('#levels').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-lv]');
      if (!b || b.disabled) return;
      SND.SFX.click();
      send({ t: 'settings', level: b.dataset.lv });
    });
    $('#mlevels').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-lv]');
      if (!b || b.disabled) return;
      SND.SFX.click();
      send({ t: 'settings', level: b.dataset.lv });
    });
    $('#song-cards').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-song]');
      if (!b || b.disabled || !S.room) return;
      const id = b.dataset.song;
      const songs = (S.room.songs || []).slice();
      const i = songs.indexOf(id);
      if (i >= 0) {
        songs.splice(i, 1);
        SND.SFX.soft();
      } else {
        if (songs.length >= 10) { toast('최대 10곡까지 고를 수 있어요'); return; }
        songs.push(id);
        const sg = (G.MUSIC_SONGS || []).find((x) => x.id === id);
        if (sg && sg.tune) SND.SFX.musicbox(sg.tune[0].midi);
        SND.vibrate(10);
      }
      S.room.songs = songs;
      renderLobby();
      send({ t: 'settings', songs });
    });
    $('#edu-cards').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-pick]');
      if (!b || b.disabled || !S.room) return;
      const id = b.dataset.pick;
      const picks = (S.room.picks || []).slice();
      const i = picks.indexOf(id);
      if (i >= 0) {
        picks.splice(i, 1);
        SND.SFX.soft();
      } else {
        if (picks.length >= 10) { toast('최대 10개까지 고를 수 있어요'); return; }
        picks.push(id);
        SND.SFX.pop();
        SND.vibrate(10);
      }
      // 화면은 바로 바꾸고, 서버 확인을 기다려요
      S.room.picks = picks;
      renderLobby();
      send({ t: 'settings', picks });
    });
    $('#player-list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-kick]');
      if (!b) return;
      const p = playerById(b.dataset.kick);
      if (p && confirm(`${p.name}님을 대기실에서 내보낼까요?`)) send({ t: 'kick', pid: p.pid });
    });
    $('#btn-main').addEventListener('click', () => {
      SND.unlock();
      const room = S.room;
      if (!room) return;
      if (room.hostPid === S.pid) {
        const needPick = (room.mode === 'edu' && !(room.picks || []).length) || (room.mode === 'music' && !(room.songs || []).length);
        if (needPick) {
          SND.SFX.bad();
          toast(room.mode === 'music' ? '연주할 곡을 하나 이상 골라주세요' : '과학관 게임을 하나 이상 골라주세요');
          const box = $(room.mode === 'music' ? '#song-cards' : '#edu-cards');
          box.classList.remove('nudge');
          void box.offsetWidth;
          box.classList.add('nudge');
          return;
        }
        SND.SFX.go();
        send({ t: 'start' });
      } else {
        const m = me();
        SND.SFX.click();
        send({ t: 'ready', v: !(m && m.ready) });
        if (!(m && m.ready)) SND.vibrate(20);
      }
    });
    $('#btn-invite').addEventListener('click', invite);
    $('#btn-sound').addEventListener('click', () => {
      SND.setMuted(!SND.isMuted());
      SND.unlock();
      SND.SFX.click();
      renderToggles();
    });
    $('#btn-vibe').addEventListener('click', () => {
      SND.setVibe(!SND.isVibe());
      SND.vibrate(40);
      renderToggles();
    });
    $('#btn-profile').addEventListener('click', openProfile);
    $('#modal-close').addEventListener('click', closeProfile);
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeProfile(); });
    $('#modal-save').addEventListener('click', () => {
      const name = $('#modal-name').value.trim() || A.name(S.modalAnimal);
      send({ t: 'profile', name, animal: S.modalAnimal });
      S.profile = { name, animal: S.modalAnimal };
      saveJSON(KEY_PROFILE, S.profile);
      SND.SFX.good();
      closeProfile();
    });
  }

  function inviteBase() {
    const info = S.info || {};
    if (info.publicUrl) return info.publicUrl;
    const h = location.hostname;
    if ((h === 'localhost' || h === '127.0.0.1' || h === '::1') && info.lanUrl) return info.lanUrl;
    return location.origin;
  }

  async function invite() {
    SND.unlock();
    const room = S.room;
    if (!room) return;
    const url = inviteBase() + '/?room=' + room.code;
    const host = playerById(room.hostPid);
    const text = `${host ? host.name : ''}님이 아리채 오락실에 초대했어요! 방 코드 ${room.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: '아리채 오락실', text, url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const ok = await copyText(text + '\n' + url);
    if (ok) toast('초대 링크를 복사했어요. 카톡 대화방에 붙여넣어 주세요', 3200);
    else window.prompt('아래 링크를 복사해서 카톡으로 보내주세요', url);
  }

  function openProfile() {
    const m = me();
    if (!m) return;
    S.modalAnimal = S.modalAnimal && !S.room.players.some((p) => p.pid !== S.pid && p.animal === S.modalAnimal) ? S.modalAnimal : m.animal;
    $('#modal-name').value = m.name;
    const taken = S.room.players.filter((p) => p.pid !== S.pid).map((p) => p.animal);
    const draw = () => {
      $('#modal-preview').innerHTML = A.svg(S.modalAnimal);
      renderPicker($('#modal-picker'), S.modalAnimal, taken, (k) => { S.modalAnimal = k; draw(); });
    };
    draw();
    $('#modal').classList.add('show');
    $('#modal').setAttribute('aria-hidden', 'false');
  }
  function closeProfile() {
    $('#modal').classList.remove('show');
    $('#modal').setAttribute('aria-hidden', 'true');
    S.modalAnimal = null;
  }

  /* ================================================================
     미니게임 설명
     ================================================================ */
  function setupIntro() {
    const room = S.room;
    const cur = room.current;
    const def = G.get(cur.game);
    const total = room.sequence.length;
    $('#intro-no').textContent = `GAME ${cur.index + 1} / ${total}`;
    $('#intro-pips').innerHTML = room.sequence.map((_, i) =>
      `<span class="${i < cur.index ? 'done' : i === cur.index ? 'now' : ''}"></span>`).join('');
    const cs = CAT_STYLE[def.catColor] || CAT_STYLE.y;
    setTheme(def.catColor);
    const lv = levelFor(def);
    const pill = $('#intro-cat');
    const secs = Math.round((cur.endAt - cur.startAt) / 1000);
    const song = cur.song ? (G.MUSIC_SONGS || []).find((x) => x.id === cur.song) : null;
    const timeTxt = secs >= 90 ? `${Math.floor(secs / 60)}분 ${secs % 60 ? (secs % 60) + '초' : ''}`.trim() : `${secs}초`;
    pill.innerHTML = song
      ? `음악관 · ${esc(song.composer)} · 난이도 <b class="lv-pill lv-${lv}">${levelName(def, lv)}</b> · ${timeTxt}`
      : def.edu
      ? `${esc(def.hall)} · ${esc(def.cat)} · <b class="lv-pill lv-${lv}">${levelName(def, lv)}</b> · ${timeTxt}`
      : `${esc(def.cat)} 게임 · ${secs}초`;
    pill.style.background = cs[0];
    pill.style.color = cs[1];
    const title = $('#intro-title');
    title.textContent = song ? song.title : def.title;
    title.style.fontSize = def.title.length > 8 ? '36px' : def.title.length > 6 ? '42px' : '';
    title.style.animation = 'none';
    void title.offsetWidth;
    title.style.animation = '';
    $('#intro-illus').innerHTML = def.illus(lv);
    $('#intro-rules').innerHTML = rulesOf(def, lv).map((r, i) => `<div><b>${i + 1}</b><span>${esc(r)}</span></div>`).join('');
    const m = me();
    $('#intro-note').textContent = m && m.activeFrom > cur.index
      ? '이번 게임은 구경하고 다음 게임부터 참여해요'
      : '모두 같은 문제로 동시에 시작해요';
    $('#ring-num').textContent = '';
    S.introTick = '';
  }

  // 과학관 게임의 실제 난이도 (그 게임에 없는 단계면 가장 가까운 단계)
  function levelFor(def) {
    if (!def || !def.edu) return '';
    const cur = S.room && S.room.current;
    const lv = (cur && cur.level) || (S.room && S.room.level) || 'm';
    return G.effLevel(def, lv);
  }
  function levelName(def, lv) {
    return (def && def.levelNames && def.levelNames[lv]) || G.LEVEL_NAME[lv];
  }
  function rulesOf(def, lv) {
    return typeof def.rules === 'function' ? def.rules(lv) : def.rules;
  }
  const PAD_SHAPES = ['r', 'g', 'b'];
  // 게임에 따라 버튼 색·이름 바꾸기 (물감 섞기 등)
  function stylePad(def, lv) {
    const st = def && typeof def.buttonStyle === 'function' ? def.buttonStyle(lv) : null;
    PAD_SHAPES.forEach((c) => {
      const bez = $(`#pad .bez[data-c="${c}"]`);
      const btn = bez.querySelector('.gb');
      let tag = bez.querySelector('.gb-name');
      const o = st && st[c];
      if (o && o.c) {
        btn.style.setProperty('--c', o.c);
        btn.style.setProperty('--s', o.s || o.c);
        bez.style.setProperty('--glow', o.c);
        bez.classList.add('custom');
      } else {
        btn.style.removeProperty('--c');
        btn.style.removeProperty('--s');
        bez.style.removeProperty('--glow');
        bez.classList.remove('custom');
      }
      btn.querySelector('svg').style.stroke = o && o.ic ? o.ic : '';
      if (o && o.name) {
        if (!tag) {
          tag = document.createElement('span');
          tag.className = 'gb-name';
          bez.appendChild(tag);
        }
        tag.textContent = o.name;
      } else if (tag) {
        tag.remove();
      }
    });
    $('#pad').classList.toggle('named', !!st);
  }

  function tickIntro(t) {
    const cur = S.room.current;
    const total = Math.max(1, cur.startAt - cur.introAt);
    const remain = cur.startAt - t;
    const frac = Math.max(0, Math.min(1, remain / total));
    $('#ring-fg').style.strokeDashoffset = String(364.4 * (1 - frac));
    const num = $('#ring-num');
    let label = '';
    if (remain <= 3000 && remain > 0) label = String(Math.ceil(remain / 1000));
    else if (remain > 3000) label = '';
    const tickKey = cur.index + ':' + label;
    if (label && S.introTick !== tickKey) {
      S.introTick = tickKey;
      num.textContent = label;
      num.classList.remove('pop');
      void num.offsetWidth;
      num.classList.add('pop');
      SND.SFX.tick();
      SND.vibrate(15);
    } else if (!label && remain > 3000 && num.textContent) {
      num.textContent = '';
    }
    if (remain <= 0 && S.playIndex !== cur.index) startPlay();
  }

  /* ================================================================
     플레이
     ================================================================ */
  function activePlayers() {
    const room = S.room;
    return room.players.filter((p) => p.activeFrom <= room.index);
  }

  function cleanupGame() {
    S.inst = null;
    S.def = null;
    S.started = false;
    S.ended = false;
    S.spectator = false;
    S.live = {};
    S.myScore = 0;
    S.scoreShown = 0;
    S.hurry = false;
    S.lastSecond = -1;
    $('#stage').innerHTML = '';
    S.fitScale = 1;
    S.fitCheckAt = 0;
    $('#fx').innerHTML = '';
    $('#play-overlay').className = 'play-overlay';
    $('#pad').className = 'pad';
    stylePad(null);
    $('#s-play').classList.remove('hurry');
    $('#go-banner').classList.remove('show');
  }

  function startPlay() {
    const room = S.room;
    const cur = room.current;
    if (!cur || !cur.game) return;
    cleanupGame();
    S.playIndex = cur.index;
    S.def = G.get(cur.game);
    const m = me();
    S.spectator = !m || m.activeFrom > cur.index;
    showScreen('s-play');

    $$('#pad .bez').forEach((b) => b.classList.toggle('unused', !S.def.buttons.includes(b.dataset.c)));
    const lv = levelFor(S.def);
    stylePad(S.def, lv);
    setScore(0, true);
    setBadge(null);
    $('#hud-time').parentElement.classList.remove('hurry');
    $('#timebar-fill').classList.remove('hurry');
    renderRivals(true);

    const t = serverNow();
    if (S.spectator) {
      const ov = $('#play-overlay');
      ov.className = 'play-overlay show spectate';
      $('#play-overlay-text').textContent = '구경 중';
      $('#play-overlay-sub').textContent = '다음 게임부터 같이 해요';
      $('#pad').classList.add('disabled');
      S.started = true;
      return;
    }

    const players = activePlayers().map((p) => ({ pid: p.pid, name: p.name, animal: p.animal, connected: p.connected }));
    const ctx = {
      seed: cur.seed,
      level: lv,
      song: cur.song || '',
      startAt: cur.startAt,
      endAt: cur.endAt,
      myPid: S.pid,
      players,
      stage: $('#stage'),
      live: () => S.live,
      setScore: (n) => setScore(n),
      setBadge: (txt, c) => setBadge(txt, c),
      sfx: Object.assign({}, SND.SFX, {
        perfect: () => { SND.SFX.perfect(); edgeFlash('rgba(255,210,63,.75)'); sparkleHud(6); },
        bad: () => { SND.SFX.bad(); edgeFlash('rgba(255,71,87,.55)'); }
      }),
      vibrate: SND.vibrate,
      lock: (ms) => lockPad(ms),
      fx: { burst, float: floatText, shake, flash }
    };
    S.inst = S.def.create(ctx);
    S.started = true;
    S.inst.start(t);
    // 음악관: 곡이 일찍 끝나면 끝나는 시각을 서버에 알려서 그때 판을 끝내요
    if (S.inst.plannedEnd) {
      const pe = S.inst.plannedEnd();
      if (pe > 0 && cur.startAt + pe < cur.endAt) send({ t: 'cut', g: cur.index, at: Math.round(cur.startAt + pe) });
    }
    requestAnimationFrame(fitStage);
    showGo();
    SND.SFX.go();
    SND.vibrate(60);
    if (S.def.music !== false) SND.BGM.start(148);
    S.lastProg = 0;
    S.lastSentScore = -1;
  }

  function finishPlay() {
    if (!S.inst || S.ended) return;
    S.ended = true;
    S.inst.end();
    const room = S.room;
    send({ t: 'final', g: S.playIndex, score: S.inst.score(), v: S.inst.value() });
    SND.BGM.stop();
    SND.SFX.end();
    SND.vibrate([80, 50, 80]);
    $('#s-play').classList.remove('hurry');
    $('#pad').classList.add('disabled');
    const ov = $('#play-overlay');
    ov.className = 'play-overlay show';
    $('#play-overlay-text').textContent = '끝!';
    $('#play-overlay-sub').textContent = `${fmtNum(S.inst.score())}점 · ${S.inst.summary()}`;
    if (room) renderRivals(true);
  }

  function setScore(n, silent) {
    const gain = n - S.myScore;
    S.myScore = n;
    const el = $('#hud-score');
    if (silent) {
      S.scoreShown = n;
      el.textContent = fmtNum(n);
      return;
    }
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 90);
    if (gain > 0) {
      el.classList.add('glow');
      clearTimeout(S.glowTimer);
      S.glowTimer = setTimeout(() => el.classList.remove('glow'), 350);
      if (gain >= 50) sparkleHud(Math.min(10, 3 + Math.floor(gain / 25)));
    }
  }

  // 점수 숫자가 목표값까지 촤라락 올라가는 효과 (매 프레임)
  function tickScore() {
    if (S.scoreShown === S.myScore) return;
    const diff = S.myScore - S.scoreShown;
    const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.22));
    S.scoreShown = Math.abs(step) >= Math.abs(diff) ? S.myScore : S.scoreShown + step;
    $('#hud-score').textContent = fmtNum(S.scoreShown);
  }

  const BADGE_BG = { r: ['#FF4757', '#B8202F'], g: ['#2ED573', '#1A8F4A'], b: ['#3D7BFF', '#1F49B8'], y: ['#FFD23F', '#C99A00'] };
  function setBadge(text, c) {
    const b = $('#hud-badge');
    if (!text) { b.classList.remove('show'); return; }
    const col = BADGE_BG[c] || BADGE_BG.r;
    if (b.textContent !== text && b.classList.contains('show')) {
      b.classList.remove('pulse');
      void b.offsetWidth;
      b.classList.add('pulse');
    }
    b.textContent = text;
    b.style.background = col[0];
    b.style.color = c === 'y' ? '#15122B' : '#fff';
    b.style.boxShadow = `0 5px 0 ${col[1]}`;
    b.classList.add('show');
  }

  function lockPad(ms) {
    S.lockUntil = performance.now() + ms;
    const pad = $('#pad');
    pad.classList.add('locked');
    setTimeout(() => { if (performance.now() >= S.lockUntil - 5) pad.classList.remove('locked'); }, ms);
  }

  function renderRivals(force) {
    const now = performance.now();
    if (!force && now - S.lastRivals < 250) return;
    S.lastRivals = now;
    const room = S.room;
    if (!room || room.index < 0) return;
    const list = activePlayers().map((p) => {
      const isMe = p.pid === S.pid;
      const score = isMe && !S.spectator ? S.myScore : (S.live[p.pid] ? S.live[p.pid][0] : 0);
      return { p, isMe, score };
    }).sort((a, b) => b.score - a.score);
    let rank = 0;
    let last = null;
    list.forEach((x, i) => {
      if (x.score !== last) { rank = i + 1; last = x.score; }
      x.rank = rank;
    });
    const n = list.length;
    const cols = n <= 5 ? n : Math.ceil(n / 2);
    const box = $('#rivals');
    box.style.gridTemplateColumns = `repeat(${Math.max(1, cols)}, minmax(0, 1fr))`;
    box.innerHTML = list.map((x) => `<div class="rv${x.isMe ? ' me' : ''}${x.p.connected ? '' : ' off'}">
      <span class="rk${x.rank === 1 && x.score > 0 ? ' first' : ''}">${x.rank}</span>
      <div class="av">${A.svg(x.p.animal)}</div>
      <span class="nm">${x.isMe ? '나' : esc(x.p.name)}</span><span class="sc">${fmtNum(x.score)}</span></div>`).join('');
  }

  function tickPlay(t) {
    const cur = S.room.current;
    const endAt = cur.cutAt || cur.endAt;   // 음악관은 곡이 끝나면 일찍 끝나요
    const total = endAt - cur.startAt;
    const remain = Math.max(0, endAt - t);
    const secs = Math.ceil(remain / 1000);
    $('#hud-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('#timebar-fill').style.transform = `scaleX(${remain / total})`;
    if (remain <= 10000 && !S.hurry && !S.ended) {
      S.hurry = true;
      $('#hud-time').parentElement.classList.add('hurry');
      $('#timebar-fill').classList.add('hurry');
      $('#s-play').classList.add('hurry');
      if (S.def && S.def.music !== false) SND.BGM.setTempo(190);
    }
    if (secs !== S.lastSecond) {
      if (secs <= 5 && secs > 0 && !S.ended && S.lastSecond !== -1) SND.SFX.tickHigh();
      S.lastSecond = secs;
    }
    tickScore();
    if (S.inst && !S.ended) {
      S.inst.tick(t);
      const pn = performance.now();
      const sc = S.inst.score();
      if (pn - S.lastProg > 250 && (sc !== S.lastSentScore || pn - S.lastProg > 1500)) {
        S.lastProg = pn;
        S.lastSentScore = sc;
        send({ t: 'prog', g: S.playIndex, score: sc, v: S.inst.value() });
      }
      if (t >= endAt) finishPlay();
    }
    renderRivals(false);
  }

  /* ---------- 효과 ---------- */
  function stageOffset() {
    const s = $('#stage').getBoundingClientRect();
    const p = $('#s-play').getBoundingClientRect();
    return { x: s.left - p.left, y: s.top - p.top };
  }

  function burst(x, y, color, count) {
    const o = stageOffset();
    const fx = $('#fx');
    const n = count || 10;
    for (let i = 0; i < n; i++) {
      const b = document.createElement('i');
      b.className = 'bit';
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 70;
      const size = 6 + Math.random() * 8;
      b.style.left = (o.x + x - size / 2) + 'px';
      b.style.top = (o.y + y - size / 2) + 'px';
      b.style.width = size + 'px';
      b.style.height = size + 'px';
      b.style.background = i % 4 === 0 ? '#FFD23F' : color;
      b.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      b.style.setProperty('--dy', Math.sin(ang) * dist - 20 + 'px');
      b.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
      fx.appendChild(b);
      setTimeout(() => b.remove(), 800);
    }
  }

  function floatText(text, x, y, color, size) {
    const o = stageOffset();
    const f = document.createElement('div');
    f.className = 'float';
    f.textContent = text;
    f.style.left = (o.x + x) + 'px';
    f.style.top = (o.y + y - (size || 30) / 2) + 'px';
    f.style.color = color || '#FFD23F';
    f.style.fontSize = (size || 30) + 'px';
    $('#fx').appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  function shake() {
    const st = $('#stage');
    st.classList.remove('shake');
    void st.offsetWidth;
    st.classList.add('shake');
  }

  function flash(color) {
    const f = document.createElement('div');
    f.className = 'flash-layer';
    f.style.background = color;
    $('#fx').appendChild(f);
    setTimeout(() => f.remove(), 400);
  }

  /* ---------- 화려한 연출 ---------- */
  const THEMES = {
    r: ['#FF4757', '#FF8A3D', '#B07BFF'],
    g: ['#2ED573', '#3DD6D0', '#3D7BFF'],
    b: ['#3D7BFF', '#B07BFF', '#3DD6D0'],
    y: ['#FFD23F', '#FF8A3D', '#FF6FB5'],
    gold: ['#FFD23F', '#FF8A3D', '#FFE27A'],
    base: ['#FF4757', '#3D7BFF', '#B07BFF']
  };
  function setTheme(key) {
    const t = THEMES[key] || THEMES.base;
    const rs = document.documentElement.style;
    rs.setProperty('--t1', t[0]);
    rs.setProperty('--t2', t[1]);
    rs.setProperty('--t3', t[2]);
  }

  const WAVE_COLOR = { r: '#FF8B95', g: '#7DF0AE', b: '#A9C4FF' };
  function spawnWave(bez, c) {
    const w = document.createElement('i');
    w.className = 'wave';
    w.style.setProperty('--wc', WAVE_COLOR[c] || '#fff');
    bez.appendChild(w);
    setTimeout(() => w.remove(), 520);
  }

  let lastEdge = 0;
  function edgeFlash(color) {
    const now = performance.now();
    if (now - lastEdge < 120) return;
    lastEdge = now;
    const f = document.createElement('div');
    f.className = 'edge-flash';
    f.style.setProperty('--ec', color);
    $('#fx').appendChild(f);
    setTimeout(() => f.remove(), 600);
  }

  function sparkleHud(n) {
    const box = $('#s-play').getBoundingClientRect();
    const r = $('#hud-score').getBoundingClientRect();
    const cx = r.left - box.left + r.width / 2;
    const cy = r.top - box.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.className = 'sparkle';
      const ang = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 40;
      s.style.left = (cx - 7) + 'px';
      s.style.top = (cy - 7) + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * d + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * d + 'px');
      s.style.animationDelay = (Math.random() * 0.12) + 's';
      $('#fx').appendChild(s);
      setTimeout(() => s.remove(), 900);
    }
  }

  function showGo() {
    const g = $('#go-banner');
    g.classList.remove('show');
    void g.offsetWidth;
    g.classList.add('show');
    setTimeout(() => g.classList.remove('show'), 1550);
  }

  /* ---------- 불꽃놀이 ---------- */
  const FW = {
    canvas: null, ctx: null, w: 0, h: 0, dpr: 1, parts: [], rockets: [], running: false,
    t0: 0, until: 0, next: 0, last: 0, raf: 0,
    start(ms) {
      this.canvas = $('#fw-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      this.parts = [];
      this.rockets = [];
      this.t0 = performance.now();
      this.until = this.t0 + (ms || 14000);
      this.next = this.t0;
      this.last = this.t0;
      if (!this.running) {
        this.running = true;
        this.raf = requestAnimationFrame((n) => this.frame(n));
      }
    },
    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    resize() {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = this.canvas.clientWidth;
      this.h = this.canvas.clientHeight;
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    },
    launch() {
      const pal = ['#FF4757', '#2ED573', '#3D7BFF', '#FFD23F', '#FF6FB5', '#3DD6D0', '#B07BFF', '#FFFFFF'];
      this.rockets.push({
        x: this.w * (0.15 + Math.random() * 0.7),
        y: this.h + 10,
        vy: -(this.h * (0.95 + Math.random() * 0.35)),
        targetY: this.h * (0.12 + Math.random() * 0.33),
        color: pal[Math.floor(Math.random() * pal.length)],
        color2: pal[Math.floor(Math.random() * pal.length)]
      });
    },
    explode(r) {
      const n = 46 + Math.floor(Math.random() * 30);
      const ring = Math.random() < 0.35;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
        const sp = ring ? 170 : 60 + Math.random() * 190;
        this.parts.push({
          x: r.x, y: r.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 1.1 + Math.random() * 0.6, age: 0,
          color: i % 3 === 0 ? r.color2 : r.color,
          size: 1.8 + Math.random() * 1.6
        });
      }
      if ($('#s-final').classList.contains('active')) SND.SFX.boom();
    },
    frame(now) {
      if (!this.running) return;
      if (!$('#s-final').classList.contains('active')) { this.stop(); return; }
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (now < this.until && now >= this.next) {
        this.launch();
        if (Math.random() < 0.3) this.launch();
        this.next = now + (now - this.t0 < 6000 ? 380 + Math.random() * 420 : 1100 + Math.random() * 1300);
      }
      const c = this.ctx;
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,0.24)';
      c.fillRect(0, 0, this.w, this.h);
      c.globalCompositeOperation = 'lighter';
      this.rockets = this.rockets.filter((r) => {
        r.y += r.vy * dt;
        r.vy *= 0.985;
        c.fillStyle = '#FFE27A';
        c.beginPath();
        c.arc(r.x, r.y, 2.4, 0, Math.PI * 2);
        c.fill();
        if (r.y <= r.targetY || r.vy > -40) { this.explode(r); return false; }
        return true;
      });
      this.parts = this.parts.filter((p) => {
        p.age += dt;
        if (p.age >= p.life) return false;
        p.vx *= 0.975;
        p.vy = p.vy * 0.975 + 160 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        c.globalAlpha = Math.max(0, 1 - p.age / p.life);
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        c.fill();
        return true;
      });
      c.globalAlpha = 1;
      if (now > this.until && !this.parts.length && !this.rockets.length) {
        this.until = now + 4000;
        this.next = now + 1500;
      }
      this.raf = requestAnimationFrame((n) => this.frame(n));
    }
  };

  // 결과 연출 타이머 정리
  function clearTimers() {
    (S.timers || []).forEach((id) => clearTimeout(id));
    S.timers = [];
  }
  function later(ms, fn) {
    S.timers = S.timers || [];
    S.timers.push(setTimeout(fn, ms));
  }

  /* ---------- 입력 ---------- */
  function press(c) {
    if (!S.inst || S.ended || S.spectator || !S.def) return;
    if (!S.def.buttons.includes(c)) return;
    if (performance.now() < S.lockUntil) return;
    if (S.def.pressSound !== false) SND.SFX.press(c);
    S.inst.onPress(c, serverNow());
  }

  function release(c) {
    if (!S.inst || S.ended || S.spectator || !S.def) return;
    if (typeof S.inst.onRelease === 'function') S.inst.onRelease(c, serverNow());
  }

  function setupPad() {
    $$('#pad .bez').forEach((bez) => {
      const c = bez.dataset.c;
      const btn = bez.querySelector('button');
      let isDown = false;
      const down = (e) => {
        e.preventDefault();
        SND.unlock();
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
        bez.classList.add('down');
        isDown = true;
        if (S.inst && !S.ended && !bez.classList.contains('unused')) spawnWave(bez, c);
        press(c);
      };
      const up = () => {
        bez.classList.remove('down');
        if (isDown) {
          isDown = false;
          release(c);
        }
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    const KEYS = {
      a: 'r', j: 'r', '1': 'r', arrowleft: 'r',
      s: 'g', k: 'g', '2': 'g', arrowdown: 'g', arrowup: 'g', ' ': 'g',
      d: 'b', l: 'b', '3': 'b', arrowright: 'b'
    };
    document.addEventListener('keydown', (e) => {
      if (!$('#s-play').classList.contains('active')) return;
      const c = KEYS[(e.key || '').toLowerCase()];
      if (!c) return;
      e.preventDefault();
      if (e.repeat) return;
      $(`#pad .bez[data-c="${c}"]`).classList.add('down');
      press(c);
    });
    document.addEventListener('keyup', (e) => {
      const c = KEYS[(e.key || '').toLowerCase()];
      if (!c) return;
      $(`#pad .bez[data-c="${c}"]`).classList.remove('down');
      if ($('#s-play').classList.contains('active')) release(c);
    });
    $('#s-play').addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  /* ================================================================
     결과 / 최종
     ================================================================ */
  function podiumHTML(entries, valueOf, big) {
    const order = [entries[1], entries[0], entries[2]].filter(Boolean);
    const cfg = {
      1: { c: '#FFD23F', s: '#C99A00', h: big ? 160 : 140, av: big ? 84 : 74 },
      2: { c: '#C9C3E6', s: '#8D86B5', h: big ? 116 : 100, av: big ? 70 : 64 },
      3: { c: '#FF8A3D', s: '#B85A1C', h: big ? 88 : 76, av: big ? 66 : 60 }
    };
    return order.map((e) => {
      const p = playerById(e.pid) || { name: '?', animal: 'rabbit' };
      const k = Math.min(3, e.rank);
      const c = cfg[k];
      const pos = entries.indexOf(e) + 1;
      return `<div class="pd p${pos}"><div class="spot" aria-hidden="true"></div>
        ${e.rank === 1 ? '<svg class="crown" width="44" height="30" viewBox="0 0 44 30" aria-hidden="true"><path d="M4 26 L2 6 L13 15 L22 2 L31 15 L42 6 L40 26 Z" fill="#FFD23F" stroke="#C99A00" stroke-width="2.5" stroke-linejoin="round"/><circle cx="22" cy="17" r="3" fill="#FF4757"/></svg>' : ''}
        <div class="av" style="width:${c.av}px;height:${c.av}px;border-color:${c.c}">${A.svg(p.animal)}</div>
        <span class="nm">${p.pid === S.pid ? '나' : esc(p.name)}</span>
        <span class="sc" style="color:${c.c}">${valueOf(e)}</span>
        <div class="block" style="height:${c.h}px;background:${c.c};box-shadow:inset 0 6px 0 rgba(255,255,255,.35),0 6px 0 ${c.s}">${e.rank}</div>
      </div>`;
    }).join('');
  }

  function standingsHTML(standings, gains, delay) {
    const d0 = delay == null ? 3.3 : delay;
    return standings.map((s, i) => {
      const p = playerById(s.pid) || { name: '?', animal: 'rabbit' };
      const isMe = s.pid === S.pid;
      const mv = s.move > 0 ? `<span class="mv up">▲ ${s.move}</span>` : s.move < 0 ? `<span class="mv down">▼ ${-s.move}</span>` : '<span class="mv same">–</span>';
      const gain = gains && gains[s.pid] != null ? `<span class="gain">+${gains[s.pid]}</span>` : '';
      return `<div class="srow${isMe ? ' me' : ''}" style="animation-delay:${(d0 + i * 0.08).toFixed(2)}s">
        <span class="rk${s.rank === 1 ? ' first' : ''}">${s.rank}</span>
        <div class="av">${A.svg(p.animal)}</div>
        <span class="nm">${isMe ? '나 (' + esc(p.name) + ')' : esc(p.name)}</span>${gain}
        <span class="tot">${fmtNum(s.total)}</span>${gains ? mv : ''}</div>`;
    }).join('');
  }

  function confetti(boxId, n, gold, keep) {
    const box = $('#' + boxId);
    if (!keep) box.innerHTML = '';
    const pal = gold
      ? ['#FFD23F', '#FFE27A', '#FFC400', '#FFF0B3', '#FF8A3D']
      : ['#FF4757', '#2ED573', '#3D7BFF', '#FFD23F', '#FF6FB5', '#3DD6D0'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      const w = 6 + Math.random() * 8;
      c.style.left = Math.random() * 100 + '%';
      c.style.width = w + 'px';
      c.style.height = (w * (1.2 + Math.random())) + 'px';
      c.style.background = pal[i % pal.length];
      if (gold) c.className = 'gold';
      c.style.animationDuration = (2.2 + Math.random() * 2.4) + 's';
      c.style.animationDelay = (Math.random() * 1.2) + 's';
      box.appendChild(c);
      setTimeout(() => c.remove(), 6000);
    }
  }

  // 드럼롤 → 3위 → 2위 → 1위 순서로 공개
  function revealSequence(podiumCount, onFirst) {
    clearTimers();
    SND.SFX.drumroll(2.6);
    if (podiumCount >= 3) later(500, () => { SND.SFX.reveal(); SND.vibrate(15); });
    if (podiumCount >= 2) later(1500, () => { SND.SFX.reveal(); SND.vibrate(15); });
    later(2700, () => {
      SND.SFX.cymbal();
      SND.vibrate([40, 30, 80]);
      onFirst();
    });
  }

  function renderResult() {
    const room = S.room;
    const res = room.lastResult;
    if (!res) return;
    const def = G.get(res.game);
    $('#result-no').textContent = `GAME ${res.index + 1} 결과`;
    $('#result-title').textContent = def.title;
    $('#result-title').style.fontSize = def.title.length > 6 ? '32px' : '';
    const rows = res.rows.slice().sort((a, b) => a.rank - b.rank);
    $('#result-podium').innerHTML = podiumHTML(rows.slice(0, 3), (e) => fmtNum(e.score) + '점', false);
    const mine = rows.find((r) => r.pid === S.pid);
    const myStanding = (room.standings || []).find((s) => s.pid === S.pid);
    const rankUp = myStanding && myStanding.move > 0 && res.index > 0
      ? `<span class="rankup">▲ ${myStanding.move}계단 상승!</span>` : '';
    $('#result-mine').innerHTML = mine
      ? `내 기록 <b>${fmtNum(mine.score)}점</b> · ${mine.rank}위 · 순위 점수 +${mine.points}${rankUp}`
      : '이번 게임은 구경했어요';
    const gains = {};
    res.rows.forEach((r) => { gains[r.pid] = r.points; });
    const learn = $('#result-learn');
    if (def.edu && typeof def.learn === 'function') {
      const lv = levelFor(def);
      learn.innerHTML = `<div class="lc-head"><span class="lc-ic">${def.icon || ''}</span><b class="disp">오늘 배운 것</b><span class="lc-tag">${esc(def.hall)} · ${levelName(def, lv)}</span></div>
        <p>${esc(def.learn(lv, (room.current && room.current.song) || ''))}</p>`;
      learn.classList.add('show');
    } else {
      learn.innerHTML = '';
      learn.classList.remove('show');
    }
    $('#result-standings').innerHTML = standingsHTML(room.standings, gains);
    HOOKS.result.forEach((fn) => { try { fn(res); } catch (e) { console.error(e); } });
    $('#result-progress').textContent = `${res.index + 1} / ${room.sequence.length} 게임 진행`;
    renderNextCard();
    setTheme('gold');
    $('#result-confetti').innerHTML = '';
    revealSequence(Math.min(3, rows.length), () => {
      confetti('result-confetti', 50, true);
      if (mine && mine.rank === 1) {
        confetti('result-confetti', 30, false, true);
        later(250, () => SND.SFX.fanfare());
        SND.vibrate([60, 40, 120]);
      }
    });
  }

  function renderNextCard() {
    const room = S.room;
    const nextId = room.sequence[room.index + 1];
    const remain = Math.max(0, Math.ceil(((room.current.resultEnd || 0) - serverNow()) / 1000));
    const box = $('#result-next');
    const label = nextId ? '다음 게임' : '곧 공개';
    let title = nextId ? G.get(nextId).title : '최종 결과 발표';
    if (nextId && room.mode === 'music') {
      const sid = (room.songs || [])[room.index + 1];
      const sg = (G.MUSIC_SONGS || []).find((x) => x.id === sid);
      if (sg) title = `♪ ${sg.title} · ${sg.composer}`;
    }
    const html = `<div><div class="lbl">${label}</div><div class="ttl">${title}</div></div><div class="cnt">${remain}</div>`;
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  function renderFinal() {
    const room = S.room;
    const st = room.standings || [];
    const winners = st.filter((s) => s.rank === 1).map((s) => {
      const p = playerById(s.pid);
      return p ? p.name : '';
    });
    $('#final-title').textContent = winners.length ? `${winners.join(', ')} 우승!` : '게임 끝!';
    $('#final-podium').innerHTML = podiumHTML(st.slice(0, 3), (e) => fmtNum(e.total) + '점', true);
    $('#final-standings').innerHTML = standingsHTML(st, null, 3.6);
    renderFinalActions();
    HOOKS.final.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    setTheme('gold');
    $('#final-confetti').innerHTML = '';
    FW.stop();
    const mine = st.find((s) => s.pid === S.pid);
    revealSequence(Math.min(3, st.length), () => {
      FW.start(14000);
      confetti('final-confetti', 70, true);
      later(1200, () => confetti('final-confetti', 50, false, true));
      later(200, () => SND.SFX.victory());
      if (mine && mine.rank === 1) SND.vibrate([80, 40, 80, 40, 200]);
    });
  }

  function renderFinalActions() {
    const isHost = S.room.hostPid === S.pid;
    $('#btn-again').style.display = isHost ? '' : 'none';
    const host = playerById(S.room.hostPid);
    $('#final-help').textContent = isHost ? '대기실로 돌아가서 다시 시작해요' : `${host ? host.name : '방장'}님이 한 판 더 할 수 있어요`;
  }

  /* ================================================================
     메인 루프
     ================================================================ */
  /* 화면이 작은 폰(카톡 안 브라우저 등)에서 과학관 게임 화면이 잘리지 않게,
     내용이 무대보다 크면 무대 크기에 맞게 통째로 줄여요 (커지지는 않음) */
  function fitStage() {
    if (!S.def || !S.def.edu) return;
    const st = $('#stage');
    const w = st && st.firstElementChild;
    if (!w) return;
    const H = st.clientHeight;
    const W = st.clientWidth;
    if (!H || !W) return;
    const cur = S.fitScale || 1;
    const need = w.scrollHeight;
    if (need <= H / cur + 2) return;
    const s = Math.max(0.55, Math.min(cur, H / need));
    if (s >= cur - 0.01) return;
    S.fitScale = s;
    Object.assign(w.style, {
      right: 'auto', bottom: 'auto', left: '0', top: '0',
      width: (W / s) + 'px', height: (H / s) + 'px',
      transform: `scale(${s})`, transformOrigin: '0 0'
    });
  }

  function loop() {
    try {
      const room = S.room;
      if (room) {
        const t = serverNow();
        if (room.phase === 'intro' && room.current && room.current.startAt) {
          if (S.playIndex === room.current.index && S.started) tickPlay(t);
          else tickIntro(t);
        } else if (room.phase === 'play' && S.started) {
          tickPlay(t);
          const pn = performance.now();
          if (pn - (S.fitCheckAt || 0) > 400) { S.fitCheckAt = pn; fitStage(); }
        } else if (room.phase === 'result') {
          renderNextCard();
        }
      }
    } catch (e) {
      console.error(e);
    }
    requestAnimationFrame(loop);
  }

  /* ================================================================
     시작
     ================================================================ */
  /* ================================================================
     앱 설치 (홈 화면에 아이콘 추가) — 누구나 앱에서 바로 방을 만들 수 있게
     ================================================================ */
  function setupInstall() {
    const btn = $('#btn-install');
    const modal = $('#install-modal');
    const body = $('#install-body');
    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    const isKakao = /KAKAOTALK/i.test(ua);
    const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    let deferred = null;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* 무시 */ });
    }
    if (standalone()) { btn.style.display = 'none'; return; }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      btn.classList.add('ready');
    });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      btn.style.display = 'none';
      closeModal();
      toast('설치됐어요! 이제 홈 화면의 아리채 오락실 아이콘으로 열어요', 3600);
    });

    function openModal(html) {
      body.innerHTML = html;
      modal.classList.add('show');
      modal.setAttribute('aria-hidden', 'false');
    }
    function closeModal() {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
    }
    $('#install-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    body.addEventListener('click', (e) => {
      if (e.target.closest('[data-open-ext]')) {
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.origin + '/');
      }
    });

    const why = '<p class="install-why">설치하면 홈 화면 아이콘으로 바로 열려요. 누구나 앱에서 <b>방 만들기</b>를 눌러 방장이 될 수 있어요.</p>';
    btn.addEventListener('click', async () => {
      SND.unlock();
      SND.SFX.click();
      if (deferred) {
        deferred.prompt();
        try { await deferred.userChoice; } catch (e) { /* 무시 */ }
        deferred = null;
        btn.classList.remove('ready');
        return;
      }
      if (isKakao) {
        openModal(`${why}<p>카카오톡 안에서는 설치할 수 없어요. 먼저 기본 브라우저로 열어 주세요.</p>
          <button class="btn btn-yellow" type="button" data-open-ext>크롬(사파리)으로 열기</button>`);
      } else if (isIOS) {
        openModal(`${why}<ol class="install-steps"><li><b>Safari</b>로 이 페이지를 열어요</li>
          <li>아래쪽 <b>공유 버튼</b> <span class="ic">□↑</span> 을 눌러요</li><li><b>홈 화면에 추가</b>를 누르면 끝!</li></ol>`);
      } else {
        openModal(`${why}<ol class="install-steps"><li>브라우저 오른쪽 위 <b>메뉴(⋮)</b>를 눌러요</li>
          <li><b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 눌러요</li><li>홈 화면에 생긴 아이콘으로 열면 끝!</li></ol>`);
      }
    });
  }

  async function init() {
    ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) =>
      document.addEventListener(ev, () => SND.unlock(), { passive: true }));
    setupHome();
    setupLobby();
    setupPad();
    $('#btn-again').addEventListener('click', () => { SND.SFX.click(); send({ t: 'again' }); });
    // 게임 종료: 방에서 나가서 처음 화면으로
    $('#btn-exit').addEventListener('click', () => {
      SND.SFX.click();
      send({ t: 'leave' });
      S.kicked = true;   // 다시 자동 연결하지 않게
      clearKey(KEY_SESSION);
      FW.stop();
      setTimeout(() => { dropSocket(); location.href = location.pathname; }, 250);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && S.room && S.room.phase !== 'lobby' && S.room.phase !== 'final') wakeLock(true);
    });
    setupResume();
    setupInstall();

    try {
      const r = await fetch('/api/info', { cache: 'no-store' });
      S.info = await r.json();
    } catch (e) { S.info = null; }

    const session = loadJSON(KEY_SESSION);
    if (session && session.code && (!inviteCode || inviteCode === session.code)) {
      S.code = session.code;
      S.pid = session.pid;
      S.token = session.token;
      showScreen('s-home');
      banner('이전 방으로 다시 연결하는 중…');
      try {
        await connect();
        send({ t: 'rejoin', room: S.code, pid: S.pid, token: S.token });
      } catch (e) {
        scheduleReconnect();
      }
    } else {
      showScreen('s-home');
    }
    requestAnimationFrame(loop);
  }

  /* 다른 화면 모듈(기록실, 보드게임관)이 쓸 수 있게 열어 둬요 */
  window.App = {
    $, $$, esc, S, G, A, SND,
    send, toast, banner, showScreen, me, playerById, fmtNum, serverNow, setTheme, confetti, later,
    podiumHTML, standingsHTML, wakeLock,
    hooks: HOOKS
  };

  init();
})();
