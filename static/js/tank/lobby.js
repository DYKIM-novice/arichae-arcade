/* 노을언덕 포격대 · 입장·대기실
   - 닉네임 + 방 코드(비우면 새 방). 들어오면 인원 적은 팀에 자동 배정, 기본 기종 몽돌
   - 기종·팀은 언제든 바꿈(판 중이면 다음 판에 적용). 시작은 방장만
   - 이모티콘 8종: 내 줄 탱크 위 말풍선 2.5초, 1초 제한(서버도 검사), 글자 채팅 없음
   - AI 설정 창(방장만): 넣기·빼기·쉬움/보통, 연습(AI) 2대2·8대8 채우기 */
(function () {
  'use strict';
  const Art = window.TankArt, Net = window.TankNet, SND = window.TankSFX, Game = window.TankGame;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KN = { mongdol: '몽돌', mangru: '망루' };
  const ST = { play: '판 안', spec: '관전', wait: '대기' };

  let L = null;            // 마지막 tklobby
  let lobbyAt = 0;
  let me = (Net.seat() || {}).pid || null;
  let emoCool = 0;
  let joining = false;

  // ---------------------------------------------------------------- 공통
  let toastT = 0;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function show(id) {
    ['#s-join', '#s-lobby'].forEach((s) => { $(s).hidden = s !== id; });
    if (id) { $('#s-game').hidden = true; if (Game.active()) Game.stop(); SND.music(true); }
  }
  const SPK = (on) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff"/>${on ? '<path d="M16 8q3 4 0 8M18.5 5.5q5 6.5 0 13" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>' : '<path d="M16 9l6 6M22 9l-6 6" stroke="#ff8a8a" stroke-width="2.2" stroke-linecap="round"/>'}</svg>`;
  function paintMute() { $$('.mute-btn').forEach((b) => { const m = SND.isMuted(); b.innerHTML = SPK(!m) + (b.closest('.menu-body') ? (m ? ' 소리 꺼짐 (누르면 켜요)' : ' 소리 켜짐 (누르면 꺼요)') : ''); b.setAttribute('aria-pressed', String(m)); }); }
  function fullscreenTry() {
    if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return;
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen ? el.requestFullscreen() : null;
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {});
    } catch (e) { /* 지원 안 함 · 조용히 무시 */ }
  }

  // ---------------------------------------------------------------- 입장
  function savedName() {
    try {
      const n = localStorage.getItem('tank_name');
      if (n) return n;
      const p = JSON.parse(localStorage.getItem('arichae_profile') || 'null');
      return (p && p.name) || '';
    } catch (e) { return ''; }
  }
  function join(create) {
    const name = $('#j-name').value.trim();
    const code = $('#j-code').value.replace(/\D/g, '');
    if (!name) { $('#j-msg').textContent = '닉네임을 적어 주세요'; $('#j-name').focus(); SND.SFX.deny(); return; }
    if (!create && code.length !== 4) { $('#j-msg').textContent = '방 코드 숫자 4자리를 적어 주세요'; SND.SFX.deny(); return; }
    try { localStorage.setItem('tank_name', name); } catch (e) { /* 무시 */ }
    SND.unlock(); SND.SFX.click(); fullscreenTry();
    Net.forget();
    joining = true;
    $('#j-msg').textContent = '들어가는 중…';
    Net.connect();
    Net.send({ t: 'tkjoin', room: create ? '' : code, name });
  }
  function joinArt() {
    const cv = $('#join-art'); if (!cv || $('#s-join').hidden) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = innerWidth, h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    Art.sky(c, w, h, 600, 200, 0.5, 0);
    // 떠 있는 양쪽 언덕(뿌리 + 풀)과 탱크 두 대
    const hill = (x0, x1, top, dir) => {
      c.fillStyle = '#7e4728'; c.beginPath(); c.moveTo(x0, top); c.lineTo(x1, top);
      c.quadraticCurveTo(x1 + dir * 45, top + 16, x1 + dir * 70, top + 55);
      c.quadraticCurveTo(x1 + dir * 20, top + 95, x0, top + 110); c.closePath(); c.fill();
      c.strokeStyle = '#4e2a18'; c.lineWidth = 2.5;
      for (let rx = Math.min(x0, x1) + 18; rx < Math.max(x0, x1) + (dir > 0 ? 40 : 0); rx += 28) {
        c.beginPath(); c.moveTo(rx, top + 85); c.quadraticCurveTo(rx + dir * 6, top + 115, rx - dir * 4, top + 132); c.stroke();
      }
      c.strokeStyle = '#5ea82e'; c.lineWidth = 11; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, top); c.lineTo(x1, top); c.quadraticCurveTo(x1 + dir * 32, top + 4, x1 + dir * 56, top + 34); c.stroke();
      c.strokeStyle = '#9ad944'; c.lineWidth = 4; c.beginPath(); c.moveTo(x0, top - 3); c.lineTo(x1, top - 3); c.stroke();
    };
    const top = h * 0.72;
    hill(0, w * 0.22, top, 1); hill(w, w * 0.78, top, -1);
    const s = Math.max(1, h / 260);
    c.save(); c.translate(w * 0.11, top - 4); c.scale(s, s); Art.drawTank(c, 0, 0, { kind: 'mongdol', face: 1, bt: 0, a: 30, f: 1, team: 'A' }); c.restore();
    c.save(); c.translate(w * 0.89, top - 4); c.scale(s, s); Art.drawTank(c, 0, 0, { kind: 'mangru', face: -1, bt: 0, a: 45, f: 0, team: 'B' }); c.restore();
  }

  // ---------------------------------------------------------------- 대기실
  function myRow() { return L && L.players.find((p) => p.id === me); }
  function isHost() { return L && L.host === me; }
  function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  function renderLobby() {
    if (!L) return;
    const mine = myRow();
    $('#lb-code').textContent = L.code;
    const ai = L.players.filter((p) => p.ai).length;
    $('#lb-count').textContent = `참가 ${L.players.length}/${L.max}${ai ? ` (AI ${ai})` : ''}`;
    $('#lb-warn').textContent = L.diff >= 2 ? `⚠ 인원 차이 ${L.diff}명` : '';
    const host = isHost();
    $('#lb-ai').hidden = !host;
    for (const team of ['A', 'B']) {
      const rows = L.players.filter((p) => p.tm === team);
      $(team === 'A' ? '#lb-ca' : '#lb-cb').textContent = `(${rows.length}/${L.teamMax})`;
      const box = $(team === 'A' ? '#lb-la' : '#lb-lb');
      box.innerHTML = rows.map((p) => {
        const tags = [];
        if (p.id === L.host) tags.push('<span class="tag host">방장</span>');
        if (p.ai) tags.push(`<span class="tag ai ${p.lv === 'normal' ? 'norm' : 'easy'}">${p.lv === 'normal' ? '보통' : '쉬움'}</span>`);
        if (p.id === me) tags.push('<span class="tag">나</span>');
        if (!p.ai && L.round && ST[p.st]) tags.push(`<span class="tag st">${ST[p.st]}</span>`);
        if (!p.on) tags.push('<span class="tag st">끊김</span>');
        return `<div class="prow${p.id === me ? ' me' : ''}${p.on ? '' : ' off'}" data-id="${esc(p.id)}"><canvas data-k="${p.k}" data-t="${p.tm}"></canvas><span class="nm">${esc(p.n)}</span>${tags.join('')}</div>`;
      }).join('');
      box.querySelectorAll('canvas').forEach((cv) => Art.icon(cv, cv.dataset.k, cv.dataset.t));
    }
    if (mine) {
      $$('#lb-kinds .kind').forEach((b) => b.classList.toggle('on', b.dataset.kind === mine.k));
      const S = Art.STAT[mine.k];
      $('#lb-kinfo').textContent = `체력 ${S.hp} · 폭발 ${S.r} · 포신 ${S.amin}~${S.amax}°`;
      $('#lb-kinfo').title = `${KN[mine.k]} · 체력 ${S.hp} · 이동 ${S.speed} · 폭발 반경 ${S.r} · 포신 ${S.amin}~${S.amax}°`;
      $$('.teams .tbtn').forEach((b) => b.classList.toggle('on', b.dataset.team === mine.tm));
    }
    // 판 진행 중
    const rd = L.round;
    const watch = rd && !rd.over && mine && (mine.st === 'lobby' || mine.st === 'wait');
    $('#lb-watch').hidden = !watch;
    $('#lb-round').textContent = rd ? (rd.over ? '판 결과 보는 중' : `판 진행 중 · 남은 ${fmt(rd.tl - (performance.now() - lobbyAt))} · A ${rd.alive.A} / B ${rd.alive.B}`) : '';
    // 시작
    const st = $('#lb-start');
    // 시작할 수 없을 때는 같은 자리에 '연습(AI) 채우기'를 보여 줌 (짧은 화면에서도 아래로 밀리지 않게)
    const practice = host && !rd && !L.canStart && L.players.length < L.max;
    st.hidden = !host || !!rd || practice;
    st.classList.toggle('off', !L.canStart);
    $('#lb-practice').hidden = !practice;
    let why = '';
    if (rd) why = '판이 끝나면 다음 판이 시작돼요' + (mine ? ' · 기종·팀은 다음 판에 적용' : '');
    else if (!host) why = '방장이 시작하면 바로 출발해요';
    else if (!L.canStart) why = L.why;
    $('#lb-why').textContent = why;
    renderAI();
  }

  function renderAI() {
    if (!L || $('#ai-sheet').hidden) return;
    for (const team of ['A', 'B']) {
      const col = $(`.ai-col[data-team="${team}"]`);
      const ais = L.players.filter((p) => p.tm === team && p.ai);
      col.querySelector('.ai-list').innerHTML = ais.length ? ais.map((p) => `<div class="ai-row"><span class="nm">${esc(p.n)} · ${KN[p.k]}</span>
        <button type="button" class="sbtn${p.lv === 'easy' ? ' on' : ''}" data-ailv="easy" data-id="${esc(p.id)}">쉬움</button>
        <button type="button" class="sbtn${p.lv === 'normal' ? ' on' : ''}" data-ailv="normal" data-id="${esc(p.id)}">보통</button>
        <button type="button" class="sbtn" data-aidel="${esc(p.id)}">빼기</button></div>`).join('') : '<div class="ai-row">AI 없음</div>';
      const full = L.players.filter((p) => p.tm === team).length >= L.teamMax || L.players.length >= L.max;
      col.querySelector('.ai-add').hidden = full;
    }
  }

  function bubble(id, e) {
    const row = document.querySelector(`.prow[data-id="${CSS.escape(id)}"]`);
    if (!row || !Art.EMO[e]) return;
    row.querySelectorAll('.bubble').forEach((b) => b.remove());
    const b = document.createElement('div');
    b.className = 'bubble' + (row.previousElementSibling ? '' : ' side');
    b.innerHTML = Art.EMO[e].svg;
    row.appendChild(b);
    SND.SFX.pop();
    setTimeout(() => b.classList.add('out'), 2500);
    setTimeout(() => b.remove(), 2850);
  }

  // ---------------------------------------------------------------- 서버 메시지
  Net.on('tkjoined', (m) => {
    me = m.pid; joining = false;
    $('#j-msg').textContent = '';
    if (!Game.active()) show('#s-lobby');
    if (m.re) toast('다시 연결됐어요');
    history.replaceState(null, '', location.pathname + '?room=' + m.code);
  });
  Net.on('tklobby', (m) => {
    L = m; lobbyAt = performance.now();
    if (m.notice) toast(m.notice);
    const mine = myRow();
    if (!mine) return;
    if (mine.st === 'lobby' || mine.st === 'wait') {
      if (Game.active() || $('#s-lobby').hidden) show('#s-lobby');
    }
    renderLobby();
  });
  Net.on('tkround', (m) => {
    $('#s-join').hidden = true; $('#s-lobby').hidden = true; $('#ai-sheet').hidden = true;
    Game.start(m);
  });
  Net.on('tkemo', (m) => bubble(m.id, m.e));
  Net.on('tkleft', () => { Net.forget(); L = null; me = null; show('#s-join'); joinArt(); });
  Net.on('tkerr', (m) => {
    if (m.code === 'no_room') {
      const wasIn = !!L || !!Net.seat();
      Net.forget(); L = null; me = null; joining = false;
      show('#s-join'); joinArt();
      $('#j-msg').textContent = wasIn && !$('#j-code').value ? (m.msg || '방이 없어졌어요') : (m.msg || '방을 찾을 수 없어요');
      return;
    }
    if (m.code === 'full') { joining = false; $('#j-msg').textContent = m.msg; return; }
    if (m.code === 'emo_rate') return;
    if (m.msg) toast(m.msg);
  });
  Net.on('_close', () => { if (L || Game.active()) toast('연결이 끊겼어요 · 다시 연결하는 중…'); });

  // ---------------------------------------------------------------- 버튼
  function setup() {
    $('#j-name').value = savedName();
    const q = new URLSearchParams(location.search).get('room');
    if (q && /^\d{4}$/.test(q)) $('#j-code').value = q;
    $('#j-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
    $('#j-create').addEventListener('click', () => join(true));
    $('#j-enter').addEventListener('click', () => join(false));
    $('#j-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(false); });
    $('#j-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(!$('#j-code').value); });
    $$('.mute-btn').forEach((b) => b.addEventListener('click', () => { SND.unlock(); SND.setMuted(!SND.isMuted()); SND.SFX.click(); }));
    SND.onMute(paintMute); paintMute();

    $('#lb-copy').addEventListener('click', () => {
      const link = location.origin + location.pathname + '?room=' + (L ? L.code : '');
      SND.SFX.click();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(() => toast('초대 주소를 복사했어요'), () => toast('방 코드: ' + (L ? L.code : '')));
      else toast('방 코드: ' + (L ? L.code : ''));
    });
    $('#lb-leave').addEventListener('click', leave);
    $('#lb-watch').addEventListener('click', () => { SND.SFX.click(); Net.send({ t: 'tkspec', d: 0 }); });
    $('#lb-kinds').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (b) { SND.SFX.click(); Net.send({ t: 'tkpick', kind: b.dataset.kind }); } });
    $$('.teams .tbtn').forEach((b) => b.addEventListener('click', () => { SND.SFX.click(); Net.send({ t: 'tkteam', team: b.dataset.team }); }));
    $('#lb-emos').innerHTML = Art.EMO.map((e, i) => `<button type="button" class="emo" data-emo="${i}" aria-label="${e.n}">${e.svg}</button>`).join('');
    $('#lb-emos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-emo]'); if (!b) return;
      const now = performance.now();
      if (now < emoCool) { SND.SFX.deny(); return; }
      emoCool = now + 1000;
      $$('.emo').forEach((x) => x.classList.add('cool'));
      setTimeout(() => $$('.emo').forEach((x) => x.classList.remove('cool')), 1000);
      Net.send({ t: 'tkemo', e: Number(b.dataset.emo) });
    });
    $('#lb-start').addEventListener('click', () => {
      SND.unlock();
      if (!L || !L.canStart) { SND.SFX.deny(); toast(L ? L.why : ''); return; }
      SND.SFX.go(); Net.send({ t: 'tkstart' });
    });
    $('#lb-practice').addEventListener('click', () => { SND.SFX.click(); Net.send({ t: 'tkpractice', to: '2v2' }); });
    $('#lb-ai').addEventListener('click', () => { $('#ai-sheet').hidden = false; SND.SFX.click(); renderAI(); });
    $('#ai-close').addEventListener('click', () => { $('#ai-sheet').hidden = true; });
    $('#ai-sheet').addEventListener('click', (e) => {
      let b;
      if ((b = e.target.closest('[data-practice]'))) Net.send({ t: 'tkpractice', to: b.dataset.practice });
      else if ((b = e.target.closest('.ai-add'))) Net.send({ t: 'tkaiadd', team: b.dataset.team, lv: 'easy' });
      else if ((b = e.target.closest('[data-ailv]'))) Net.send({ t: 'tkailv', id: b.dataset.id, lv: b.dataset.ailv });
      else if ((b = e.target.closest('[data-aidel]'))) Net.send({ t: 'tkaidel', id: b.dataset.aidel });
      else return;
      SND.SFX.click();
    });
    // 기종 버튼 그림
    $$('#lb-kinds .kind canvas').forEach((cv) => Art.icon(cv, cv.closest('.kind').dataset.kind, null, 0));
    // 판 진행 중 남은 시간 갱신
    setInterval(() => { if (L && L.round && !$('#s-lobby').hidden) renderLobbyTime(); }, 500);
    window.addEventListener('resize', () => { joinArt(); if (L && !$('#s-lobby').hidden) renderLobby(); });

    if (Net.seat()) { $('#j-msg').textContent = '다시 들어가는 중…'; Net.connect(); }
    show('#s-join');
    joinArt();
  }
  function renderLobbyTime() {
    const rd = L.round;
    $('#lb-round').textContent = rd.over ? '판 결과 보는 중' : `판 진행 중 · 남은 ${fmt(rd.tl - (performance.now() - lobbyAt))} · A ${rd.alive.A} / B ${rd.alive.B}`;
  }
  function leave() {
    SND.SFX.click();
    Net.send({ t: 'tkleave' });
    Net.forget(); L = null; me = null;
    show('#s-join'); joinArt();
  }

  setup();
  window.TankLobby = { toast, leave };
  void joining;
})();
