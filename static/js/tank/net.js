/* 노을언덕 포격대 · 웹소켓 (서버 /ws, 메시지 접두사 tk)
   - 2초마다 ping (서버 WS_IDLE_SEC 30 유지)
   - 끊기면 다시 연결하고, 이 탭의 자리(sessionStorage: 방 코드·pid·token)로 tkrejoin
   - 탭마다 자리가 따로라서 한 PC에서 탭 두 개로도 시험할 수 있어요 */
(function () {
  'use strict';
  const KEY = 'tank_seat_v1';
  const handlers = {};
  let ws = null, pingT = 0, retryT = 0, tries = 0, wanted = false, queue = [];
  let seat = null;
  try { seat = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { seat = null; }

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
      pingT = setInterval(() => raw({ t: 'ping', c: Date.now() }), 2000);
      if (seat && seat.pid) raw({ t: 'tkrejoin', room: seat.code, pid: seat.pid, token: seat.token });
      const q = queue; queue = [];
      q.forEach(raw);
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || !m.t) return;
      if (m.t === 'tkjoined') { seat = { code: m.code, pid: m.pid, token: m.token }; try { sessionStorage.setItem(KEY, JSON.stringify(seat)); } catch (e) { /* 무시 */ } }
      emit(m.t, m);
    };
    ws.onclose = () => { clearInterval(pingT); emit('_close'); if (wanted) retry(); };
    ws.onerror = () => { /* onclose 에서 처리 */ };
  }
  function retry() {
    clearTimeout(retryT);
    tries++;
    retryT = setTimeout(connect, Math.min(5000, 400 * tries));
  }
  function raw(m) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; } return false; }
  function send(m) { if (!raw(m)) { if (m.t !== 'tkin' && m.t !== 'tkaim') queue.push(m); connect(); } }
  function forget() { seat = null; try { sessionStorage.removeItem(KEY); } catch (e) { /* 무시 */ } }

  window.TankNet = { connect, send, on, forget, seat: () => seat, isOpen: () => !!ws && ws.readyState === 1 };
})();
