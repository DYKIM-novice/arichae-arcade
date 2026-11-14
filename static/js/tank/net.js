/* 노을언덕 포격대 · 웹소켓 (서버 /ws, 메시지 접두사 tk)
   - 2초마다 ping (서버 WS_IDLE_SEC 30 유지)
   - 끊기면 다시 연결하고, 이 탭의 자리(sessionStorage 우선·없으면 localStorage 3시간 복원)로 tkrejoin
   - 탭마다 자리가 따로 구분돼요 */
(function () {
  'use strict';
  const KEY = 'tank_seat_v1';
  const REJOIN_KEY = 'tank_rejoin_v1';
  const REJOIN_TTL_MS = 3 * 3600 * 1000;
  const handlers = {};
  let ws = null, pingT = 0, retryT = 0, tries = 0, wanted = false, queue = [];
  let seat = null;
  const urlRoom = new URLSearchParams(location.search).get('room');
  // 탭 구분: 다른 탭이 지금 쓰고 있는(최근 BEAT_LIVE_MS 안에 신호를 남긴) localStorage 자리는 가져오지 않음
  // (같은 브라우저에서 초대 주소를 새 탭으로 열면 먼저 탭의 자리를 빼앗던 문제)
  const TAB_KEY = 'tank_tab_v1';
  const BEAT_LIVE_MS = 8000;
  let tabId = '';
  try { tabId = sessionStorage.getItem(TAB_KEY) || ''; } catch (e) { /* 무시 */ }
  if (!tabId) {
    tabId = Math.random().toString(36).slice(2, 10);
    try { sessionStorage.setItem(TAB_KEY, tabId); } catch (e) { /* 무시 */ }
  }
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (s && s.code && s.pid && s.token && (!urlRoom || urlRoom === s.code)) seat = s;
  } catch (e) { seat = null; }
  if (!seat) {
    try {
      const r = JSON.parse(localStorage.getItem(REJOIN_KEY) || 'null');
      const busy = !!(r && r.tab && r.tab !== tabId && typeof r.beat === 'number' && Date.now() - r.beat < BEAT_LIVE_MS);
      if (busy) { /* 다른 탭이 쓰는 중 · 그대로 둠 */ } else if (r && r.code && r.pid && r.token && typeof r.at === 'number' && (Date.now() - r.at <= REJOIN_TTL_MS)) {
        if (!urlRoom || urlRoom === r.code) seat = { code: r.code, pid: r.pid, token: r.token, name: r.name || '' };
      } else if (r) {
        localStorage.removeItem(REJOIN_KEY);
      }
    } catch (e) { /* 무시 */ }
  }

  function url() { return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'; }
  function emit(type, msg) { (handlers[type] || []).forEach((f) => { try { f(msg); } catch (e) { console.error(e); } }); }
  function on(type, f) { (handlers[type] = handlers[type] || []).push(f); }

  function connect() {
    wanted = true;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    clearTimeout(retryT);
    try { ws = new WebSocket(url()); } catch (e) { retry(); return; }
    ws.onopen = () => {
      tries = 0;
      emit('_open');
      clearInterval(pingT);
      pingT = setInterval(() => { raw({ t: 'ping', c: Date.now() }); beat(); }, 2000);
      if (seat && seat.pid) raw({ t: 'tkrejoin', room: seat.code, pid: seat.pid, token: seat.token });
      const q = queue; queue = [];
      q.forEach(raw);
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || !m.t) return;
      if (m.t === 'tkjoined') {
        const prevName = (seat && seat.name) || '';
        seat = { code: m.code, pid: m.pid, token: m.token, name: m.name || prevName };
        try { sessionStorage.setItem(KEY, JSON.stringify(seat)); } catch (e) { /* 무시 */ }
        saveRejoin();
      }
      emit(m.t, m);
    };
    ws.onclose = () => { clearInterval(pingT); emit('_close'); if (wanted) retry(); };
    ws.onerror = () => { /* onclose 에서 처리 */ };
  }
  function saveRejoin() {
    if (!seat || !seat.pid) return;
    const t = Date.now();
    try { localStorage.setItem(REJOIN_KEY, JSON.stringify({ code: seat.code, pid: seat.pid, token: seat.token, name: seat.name, at: t, tab: tabId, beat: t })); } catch (e) { /* 무시 */ }
  }
  // 이 탭의 자리가 localStorage 자리와 같을 때만 신호 갱신 (다른 탭의 기록은 덮지 않음)
  function beat() {
    if (!seat || !seat.pid) return;
    try {
      const r = JSON.parse(localStorage.getItem(REJOIN_KEY) || 'null');
      if (r && r.pid === seat.pid && r.code === seat.code) saveRejoin();
    } catch (e) { /* 무시 */ }
  }
  // 탭을 닫거나 떠날 때: 이 탭이 기록의 주인이면 신호만 0으로 (기록은 남김 → 같은 브라우저에서 바로 다시 열면 복귀)
  function release() {
    if (!seat || !seat.pid) return;
    try {
      const r = JSON.parse(localStorage.getItem(REJOIN_KEY) || 'null');
      if (r && r.tab === tabId && r.pid === seat.pid && r.code === seat.code) {
        r.beat = 0;
        localStorage.setItem(REJOIN_KEY, JSON.stringify(r));
      }
    } catch (e) { /* 무시 */ }
  }
  // bfcache 로 돌아왔을 때: 내 기록이거나, 같은 자리인데 다른 탭이 쓰지 않는 중이면 신호 다시 갱신
  function resume() {
    if (!seat || !seat.pid) return;
    try {
      const r = JSON.parse(localStorage.getItem(REJOIN_KEY) || 'null');
      if (r && r.pid === seat.pid && r.code === seat.code && (r.tab === tabId || !liveOther(r))) saveRejoin();
    } catch (e) { /* 무시 */ }
  }
  function liveOther(r) {
    return !!(r && r.tab && r.tab !== tabId && typeof r.beat === 'number' && Date.now() - r.beat < BEAT_LIVE_MS);
  }
  try {
    window.addEventListener('pagehide', release);
    window.addEventListener('beforeunload', release);
    window.addEventListener('pageshow', (ev) => { if (ev && ev.persisted) resume(); });
  } catch (e) { /* 무시 */ }
  function retry() {
    clearTimeout(retryT);
    tries++;
    retryT = setTimeout(connect, Math.min(5000, 400 * tries));
  }
  function raw(m) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; }
  function send(m) { if (!raw(m)) { if (m.t !== 'tkin' && m.t !== 'tkaim') queue.push(m); connect(); } }
  function forget() {
    const old = seat;
    seat = null;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
    // 다른 탭이 쓰는 자리 기록은 지우지 않음
    try {
      const r = JSON.parse(localStorage.getItem(REJOIN_KEY) || 'null');
      const othersLive = !!(r && r.tab && r.tab !== tabId && typeof r.beat === 'number' && Date.now() - r.beat < BEAT_LIVE_MS);
      if (!othersLive || (old && r && r.pid === old.pid)) localStorage.removeItem(REJOIN_KEY);
    } catch (e) { try { localStorage.removeItem(REJOIN_KEY); } catch (e2) { /* 무시 */ } }
  }

  // 같은 브라우저의 다른 탭이 지금 쓰고 있는 방 코드('' = 없음) — 초대 링크를 새 탭으로 열었을 때 자리를 하나 더 만들지 않게
  function otherTabRoom() {
    try { const r = JSON.parse(localStorage.getItem(REJOIN_KEY) || 'null'); return liveOther(r) ? String(r.code || '') : ''; } catch (e) { return ''; }
  }

  window.TankNet = { connect, send, on, forget, otherTabRoom, seat: () => seat, isOpen: () => !!ws && ws.readyState === 1 };
})();
