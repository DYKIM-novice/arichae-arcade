/* 노을언덕 포격대 · 입장·대기실
   - 닉네임 + 방 코드(비우면 새 방). 들어오면 인원 적은 팀에 자동 배정, 기본 기종 몽돌
   - 기종·팀은 언제든 바꿈(판 중이면 다음 판에 적용). 시작은 방장만
   - 이모티콘 8종: 내 줄 탱크 위 말풍선 2.5초, 1초 제한(서버도 검사), 글자 채팅 없음
   - AI 설정 창(방장만): 넣기·빼기·쉬움/보통, 연습(AI) 2대2·8대8 채우기 */
(function () {
  'use strict';
  const Art = window.TankArt, Net = window.TankNet, SND = window.TankSFX, Game = window.TankGame, Share = window.TankShare;
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
  let kindTeam;            // 기종 버튼 그림을 마지막으로 그린 팀 (팀이 바뀌면 팀색 차체로 다시 그림)
  // 초대 링크(?room=CODE)로 연 경우: { code, phase, hadSeat }
  //   phase 'rejoin' 내가 원래 있던 방 → 기존 재접속(tkrejoin) 먼저 · 'join' 닉네임으로 참가 중 · 'wait' 닉네임 입력 대기
  let invite = null;
  let invitedIn = false;   // 초대로 막 들어옴 → 첫 대기실 정보에서 판 진행 중이면 관전 안내

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
    // 초대받은 방 코드 그대로 들어가면 초대 참가로 처리(거절되면 친절한 문구), 다른 코드·새 방이면 보통 참가
    invite = (!create && invite && invite.code === code) ? { code, phase: 'join', hadSeat: invite.hadSeat } : null;
    sendJoin({ t: 'tkjoin', room: create ? '' : code, name }, '들어가는 중…');
  }
  function sendJoin(msg, label) {
    Net.forget();
    joining = true;
    $('#j-msg').textContent = label;
    Net.connect();
    Net.send(msg);
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

  // ---------------------------------------------------------------- 초대 링크로 열었을 때
  function dropRoomParam() {
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* 무시 */ }
  }
  function enterLabel(code) {
    const b = $('#j-enter');
    if (code) { b.textContent = `방 ${code} 입장`; b.classList.add('hl'); } else { b.textContent = '코드로 들어가기'; b.classList.remove('hl'); }
  }
  // 닉네임이 없을 때: 방 코드 채우고 닉네임 칸에 포커스 + 안내 + 입장 버튼 강조
  function inviteAsk(code) {
    invite = { code, phase: 'wait', hadSeat: !!(invite && invite.hadSeat) };
    show('#s-join'); joinArt();
    $('#j-code').value = code;
    $('#j-msg').textContent = `초대받은 방 ${code} — 닉네임만 넣고 입장하세요`;
    enterLabel(code);
    try { $('#j-name').focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }
  function inviteJoin(code, name) {
    invite = { code, phase: 'join', hadSeat: !!(invite && invite.hadSeat) };
    $('#j-name').value = name;
    $('#j-code').value = code;
    sendJoin({ t: 'tkjoin', room: code, name }, `초대받은 방 ${code}에 들어가는 중…`);
  }
  // 초대 참가가 서버에서 거절됐을 때 친절한 문구 (tank.py tkjoin 의 tkerr: no_room · full) + 주소의 room 정리
  function inviteFail(m) {
    const code = invite.code, had = invite.hadSeat;
    invite = null; joining = false;
    dropRoomParam();
    enterLabel('');
    show('#s-join'); joinArt();
    if (m.code === 'full') {
      const mx = String(m.msg || '').match(/최대 \d+명/);
      $('#j-code').value = code;
      $('#j-msg').textContent = `방 ${code} — 꽉 찼어요${mx ? ' (' + mx[0] + ')' : ''} · 자리가 나면 다시 눌러 주세요`;
    } else {
      $('#j-code').value = '';
      $('#j-msg').textContent = had ? `방 ${code} — 판이 끝났거나 없어졌어요 · 새 방을 만들어 주세요` : `방 ${code} — 찾을 수 없어요 · 판이 끝났을 수 있어요`;
    }
    SND.SFX.deny();
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
      if (kindTeam !== mine.tm) {
        kindTeam = mine.tm;
        $$('#lb-kinds .kind canvas').forEach((cv) => Art.icon(cv, cv.closest('.kind').dataset.kind, mine.tm, 0));
      }
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

  function textRect(el) {
    if (!el) return null;
    if (el.firstChild) {
      try {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        const r = rg.getBoundingClientRect();
        if (r && r.width > 0) return r;
      } catch (e) { /* fallback */ }
    }
    return el.getBoundingClientRect();
  }
  function rectsOverlap(a, b, pad) {
    const p = pad || 0;
    return a.l - p < b.r && a.r + p > b.l && a.t - p < b.b && a.b + p > b.t;
  }
  function clearBubbles() {
    const layer = $('#lb-bubbles');
    if (layer) layer.innerHTML = '';
  }
  function bubble(id, e) {
    const row = document.querySelector(`.prow[data-id="${CSS.escape(id)}"]`);
    const layer = $('#lb-bubbles');
    if (!row || !layer || !Art.EMO[e]) return;
    layer.querySelectorAll(`.bubble[data-id="${CSS.escape(id)}"]`).forEach((b) => b.remove());
    const lr = layer.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    if (!lr.width || !rr.width) return;
    const nmEl = row.querySelector('.nm');
    const nr = textRect(nmEl) || rr;
    const bw = 44, bh = 44;

    const toLocal = (vx, vy) => ({ l: vx - lr.left, t: vy - lr.top, r: vx - lr.left + bw, b: vy - lr.top + bh });
    const nmBoxes = $$('#s-lobby .prow .nm').map((el) => {
      const r = textRect(el);
      return { l: r.left - lr.left, t: r.top - lr.top, r: r.right - lr.left, b: r.bottom - lr.top };
    });
    const tagBoxes = $$('#s-lobby .prow .tag').map((el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left - lr.left, t: r.top - lr.top, r: r.right - lr.left, b: r.bottom - lr.top };
    });
    const bubBoxes = Array.from(layer.querySelectorAll('.bubble')).map((el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left - lr.left, t: r.top - lr.top, r: r.right - lr.left, b: r.bottom - lr.top };
    });

    const clampBox = (box) => {
      const x = Math.max(4, Math.min(lr.width - bw - 4, box.l));
      const y = Math.max(4, Math.min(lr.height - bh - 4, box.t));
      return { l: x, t: y, r: x + bw, b: y + bh };
    };
    const freeOf = (box, list, pad) => !list.some((o) => rectsOverlap(box, o, pad));

    // 후보: 1) 이름 바로 오른쪽 옆, 2) 이름 위, 3) 행 왼쪽 옆, 4) 이름 아래
    const seeds = [
      { box: toLocal(nr.right + 8, rr.top + (rr.height - bh) / 2), tail: 'tail-left' },
      { box: toLocal(Math.max(rr.left + 6, nr.left), rr.top - bh - 6), tail: 'tail-down' },
      { box: toLocal(rr.left + 2, rr.top + (rr.height - bh) / 2), tail: 'tail-right' },
      { box: toLocal(nr.left, rr.bottom + 6), tail: 'tail-up' },
    ];
    let picked = null;
    // 1차: 이름표·말풍선·태그 모두 안 가리는 자리
    for (const s of seeds) {
      const c = clampBox(s.box);
      if (freeOf(c, nmBoxes, 2) && freeOf(c, bubBoxes, 4) && freeOf(c, tagBoxes, 1)) {
        picked = { box: c, tail: s.tail };
        break;
      }
    }
    // 2차: 이름표·말풍선은 안 가리면서 겹치는 말풍선을 옆/위로 밀어 자리 찾기
    if (!picked) {
      const shifts = [
        [0, 0], [18, 0], [36, 0], [54, 0], [-18, 0], [-36, 0],
        [0, -18], [0, -36], [18, -18], [-18, -18], [0, 18], [0, 36]
      ];
      for (const s of seeds) {
        for (const [dx, dy] of shifts) {
          const c = clampBox({ l: s.box.l + dx, t: s.box.t + dy });
          if (freeOf(c, nmBoxes, 2) && freeOf(c, bubBoxes, 4)) {
            picked = { box: c, tail: dx === 0 && dy === 0 ? s.tail : 'tail-none' };
            break;
          }
        }
        if (picked) break;
      }
    }
    // 3차: 정말 자리가 좁으면 말풍선끼리만은 피하고 이름 가림 최소 위치 선택
    if (!picked) {
      const cands = [];
      for (const s of seeds) {
        for (let dx = -40; dx <= 80; dx += 20) {
          for (let dy = -36; dy <= 36; dy += 18) {
            const c = clampBox({ l: s.box.l + dx, t: s.box.t + dy });
            if (freeOf(c, bubBoxes, 2)) cands.push({ box: c, tail: 'tail-none' });
          }
        }
      }
      if (cands.length) {
        const area = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
        cands.sort((x, y) => nmBoxes.reduce((s, n) => s + area(x.box, n), 0) - nmBoxes.reduce((s, n) => s + area(y.box, n), 0));
        picked = cands[0];
      } else {
        picked = { box: clampBox(seeds[0].box), tail: seeds[0].tail };
      }
    }

    const b = document.createElement('div');
    b.className = 'bubble ' + picked.tail;
    b.dataset.id = id;
    b.style.left = Math.round(picked.box.l) + 'px';
    b.style.top = Math.round(picked.box.t) + 'px';
    b.innerHTML = Art.EMO[e].svg;
    layer.appendChild(b);
    SND.SFX.pop();
    setTimeout(() => b.classList.add('out'), 2500);
    setTimeout(() => b.remove(), 2850);
  }

  // ---------------------------------------------------------------- 서버 메시지
  Net.on('tkjoined', (m) => {
    me = m.pid; joining = false;
    $('#j-msg').textContent = '';
    if (invite) { invitedIn = !m.re; invite = null; enterLabel(''); }
    Share.kakaoPreload();   // 카카오 키가 있을 때만 SDK 를 미리 받음(버튼을 누른 순간 바로 열리게) · 키 없으면 아무것도 안 함
    if (!Game.active()) show('#s-lobby');
    if (m.re) toast('다시 연결됐어요');
    history.replaceState(null, '', location.pathname + '?room=' + m.code);
  });
  Net.on('tklobby', (m) => {
    L = m; lobbyAt = performance.now();
    if (m.notice) toast(m.notice);
    const mine = myRow();
    if (!mine) return;
    if (invitedIn) {
      invitedIn = false;
      if (m.round && !m.round.over && mine.st === 'wait') setTimeout(() => toast('지금 판이 진행 중이에요 · 「판 보기」로 관전하고 다음 판에 같이 해요'), m.notice ? 2700 : 0);
    }
    if (mine.st === 'lobby' || mine.st === 'wait') {
      if (Game.active() || $('#s-lobby').hidden) show('#s-lobby');
    }
    renderLobby();
  });
  Net.on('tkround', (m) => {
    clearBubbles();
    $('#s-join').hidden = true; $('#s-lobby').hidden = true; $('#ai-sheet').hidden = true;
    Game.start(m);
  });
  Net.on('tkemo', (m) => bubble(m.id, m.e));
  Net.on('tkleft', () => { clearBubbles(); Net.forget(); L = null; me = null; show('#s-join'); joinArt(); });
  Net.on('tkerr', (m) => {
    // 초대 링크: 내가 원래 있던 방 재접속이 안 되면 → 저장된 닉네임으로 그 방에 새로 참가(닉네임이 없으면 입력 안내)
    if (invite && invite.phase === 'rejoin' && m.code === 'no_room') {
      clearBubbles();
      Net.forget(); L = null; me = null;
      const code = invite.code, name = savedName();
      if (name) inviteJoin(code, name); else { joining = false; inviteAsk(code); }
      return;
    }
    if (invite && invite.phase === 'join' && (m.code === 'no_room' || m.code === 'full')) {
      clearBubbles();
      Net.forget(); L = null; me = null;
      inviteFail(m);
      return;
    }
    if (m.code === 'no_room') {
      const wasIn = !!L || !!Net.seat();
      clearBubbles();
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
    $('#j-name').value = savedName() || ((Net.seat() && Net.seat().name) || '');
    Share.init({ toast });
    const q = new URLSearchParams(location.search).get('room');
    const inviteCode = q && /^\d{4}$/.test(q) ? q : '';
    if (q && !inviteCode) dropRoomParam();
    if (inviteCode) $('#j-code').value = inviteCode;
    $('#j-code').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
      if (invite && invite.phase === 'wait' && e.target.value !== invite.code) { invite = null; enterLabel(''); $('#j-msg').textContent = ''; }
    });
    $('#j-create').addEventListener('click', () => join(true));
    $('#j-enter').addEventListener('click', () => join(false));
    $('#j-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(false); });
    $('#j-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(!$('#j-code').value); });
    $$('.mute-btn').forEach((b) => b.addEventListener('click', () => { SND.unlock(); SND.setMuted(!SND.isMuted()); SND.SFX.click(); }));
    SND.onMute(paintMute); paintMute();

    // 카카오로 초대: 카카오 피드(키가 있을 때) → 기기 공유 시트 → 클립보드 복사 (share.js)
    $('#lb-invite').addEventListener('click', () => { SND.SFX.click(); Share.invite(L ? L.code : ''); });
    // 홈 화면에 추가 (입장 화면 · 대기실 · 게임 메뉴) — 설치할 수 있을 때만 보임
    $$('.inst-btn').forEach((b) => b.addEventListener('click', () => { SND.unlock(); SND.SFX.click(); Share.install(); }));
    const paintInstall = () => { const on = Share.canInstall(); $$('.inst-btn').forEach((b) => { b.hidden = !on; }); };
    Share.onChange(paintInstall); paintInstall();
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
    window.addEventListener('resize', () => { kindTeam = undefined; joinArt(); if (L && !$('#s-lobby').hidden) renderLobby(); });

    show('#s-join');
    joinArt();
    if (Net.seat()) {
      // 이 방에 원래 있던 자리(새로고침·초대 링크 다시 열기) → 기존 재접속(tkrejoin) 먼저
      if (inviteCode) invite = { code: inviteCode, phase: 'rejoin', hadSeat: true };
      $('#j-msg').textContent = '다시 들어가는 중…'; Net.connect();
    } else if (inviteCode) {
      const name = savedName();
      if (Net.otherTabRoom() === inviteCode) {
        // 이 방은 이 브라우저의 다른 탭에서 이미 하는 중 → 자동으로 자리를 하나 더 만들지 않고 물어봄
        inviteAsk(inviteCode);
        $('#j-msg').textContent = `방 ${inviteCode} — 다른 탭에서 이미 하고 있어요 · 여기서도 하려면 입장`;
      } else if (name) inviteJoin(inviteCode, name);
      else inviteAsk(inviteCode);
    }
    if (Art.onBgReady) Art.onBgReady(joinArt);
  }
  function renderLobbyTime() {
    const rd = L.round;
    $('#lb-round').textContent = rd.over ? '판 결과 보는 중' : `판 진행 중 · 남은 ${fmt(rd.tl - (performance.now() - lobbyAt))} · A ${rd.alive.A} / B ${rd.alive.B}`;
  }
  function leave() {
    SND.SFX.click();
    clearBubbles();
    Net.send({ t: 'tkleave' });
    Net.forget(); L = null; me = null;
    show('#s-join'); joinArt();
  }

  setup();
  window.TankLobby = { toast, leave };
  void joining;
})();
