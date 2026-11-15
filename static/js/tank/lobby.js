/* 노을언덕 포격대 · 입장·대기실
   - 닉네임 + 방 코드(비우면 새 방). 들어오면 인원 적은 팀에 자동 배정, 기본 기종 몽돌
   - 기종·팀은 언제든 바꿈(판 중이면 다음 판에 적용). 시작은 방장만
   - 이모티콘 8종: 내 줄 탱크 위 말풍선 2.5초, 1초 제한(서버도 검사), 글자 채팅 없음
   - AI 관리(v3.5, 방장만): 팀 목록 AI 줄의 실력(쉬움/보통)·빼기 + 목록 아래 「+ AI 추가하기」(AICtl) · 오른쪽 칸 연습(AI) 2대2 / 8대8까지 채우기 */
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

  // 서버의 긴 시작 이유를 대기실 오른쪽 칸용 한 줄로 (토스트는 원문 그대로)
  function shortWhy(w) {
    const m = /팀마다 (\d+)명 이상.*A (\d+)명\s*·\s*B (\d+)명/.exec(w || '');
    return m ? `팀마다 ${m[1]}명 이상 필요 · A ${m[2]} · B ${m[3]}` : (w || '');
  }
  function emoPop(open) {
    const pop = $('#lb-emos'), btn = $('#lb-emo-btn');
    pop.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) return;
    const host = $('#s-lobby').getBoundingClientRect(), r = btn.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(4, Math.min(r.right - host.left - pw, host.width - pw - 4));
    let top = r.bottom - host.top + 6;
    if (top + ph > host.height - 4) top = Math.max(4, r.top - host.top - ph - 6);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
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

  // ---------------------------------------------------------------- AI 관리 (AICtl)
  // 대기실 팀 목록 안에서 AI 를 다루는 작은 모듈. HTML 만들기와 클릭 처리만 맡아서, 나중에 방 만들기 화면 등
  // 다른 곳에서도 같은 함수를 부르면 됨: html = AICtl.rowControls(p, ctx) · AICtl.addButton(team, ctx) · AICtl.bind(root)
  //   ctx = AICtl.ctx(L, me) → { host, round, live, max, teamMax, total, count(team) }
  // 서버: tank.py tkaiadd(lv 없으면 보통) · tkailv('easy'|'normal') · tkaidel(판 중 살아 있으면 다음 판에 빠짐 예약) · tkaikeep(예약 취소)
  const AICtl = (function () {
    const LV = { easy: '쉬움', normal: '보통' };
    const DEL_GAP_MS = 350;   // 빼기·취소 연타 막기: 줄이 올라오거나 「취소」로 바뀌어 같은 손가락의 두 번째 톡이 다음 줄을 빼지 않게
    const LV_GAP_MS = 350;    // 실력 버튼 더블탭이 두 번 바뀌어 제자리로 돌아오지 않게
    let delLock = 0;
    const lvLock = {};
    const lvOf = (p) => (p.lv === 'easy' ? 'easy' : 'normal');
    function ctx(Lx, meId) {
      const ps = (Lx && Lx.players) || [];
      return {
        host: !!(Lx && Lx.host === meId),
        round: !!(Lx && Lx.round),
        live: !!(Lx && Lx.round && !Lx.round.over),
        max: (Lx && Lx.max) || 16,
        teamMax: (Lx && Lx.teamMax) || 8,
        total: ps.length,
        count: (team) => ps.filter((p) => p.tm === team).length,
      };
    }
    // AI 줄 오른쪽: 방장은 버튼(실력 한 번 톡으로 바꿈 · 빼기 · 예약 취소), 아니면 읽기 전용 실력 글자
    function rowControls(p, c) {
      if (!p || !p.ai) return '';
      const lv = lvOf(p);
      const waitNext = c.round && p.st === 'wait';
      if (!c.host) {
        return `<span class="tag ai ${lv === 'normal' ? 'norm' : 'easy'}">${LV[lv]}</span>` +
          (p.out ? '<span class="tag st">빠짐</span>' : '') + (waitNext ? '<span class="tag st">대기</span>' : '');
      }
      const id = esc(p.id), nm = esc(p.n);
      if (p.out) {
        return '<i class="ai-br"></i><span class="ai-note out">다음 판에 빠짐</span>' +
          `<span class="ai-ctl"><button type="button" class="aibtn keep" data-aikeep="${id}" aria-label="${nm} 빼기 취소">취소</button></span>`;
      }
      const next = lv === 'normal' ? 'easy' : 'normal';
      return (waitNext ? '<i class="ai-br"></i><span class="ai-note wait">다음 판부터</span>' : '') +
        `<span class="ai-ctl"><button type="button" class="aibtn lv ${lv}" data-ailv="${next}" data-id="${id}" aria-label="${nm} 실력 ${LV[lv]} (누르면 ${LV[next]})">${LV[lv]}</button>` +
        `<button type="button" class="aibtn del" data-aidel="${id}" aria-label="${nm} 빼기">빼기</button></span>`;
    }
    // 팀 목록 아래 「+ AI 추가하기」: 가득 차면 사라지지 않고 꺼진 모양 + 이유 (배치가 흔들리지 않게)
    function addButton(team, c) {
      if (!c.host) return '';
      const n = c.count(team);
      let why = '', full = '';
      if (n >= c.teamMax) { why = '가득 참'; full = `팀 ${team} 가득 참 (${n}/${c.teamMax})`; }
      else if (c.total >= c.max) { why = '방 꽉 참'; full = `방이 꽉 참 (${c.total}/${c.max})`; }
      if (why) return `<button type="button" class="ai-add full" data-aiadd="${team}" disabled aria-disabled="true" title="${full}" aria-label="AI 추가 못 함 · ${full}"><span class="aa-t">+ AI 추가하기</span><small>${why}</small></button>`;
      return `<button type="button" class="ai-add" data-aiadd="${team}" aria-label="팀 ${team}에 AI 추가하기${c.round ? ' · 다음 판부터' : ''}"><span class="aa-t">+ AI 추가하기</span>${c.round ? '<small>다음 판부터</small>' : ''}</button>`;
    }
    // 클릭 처리 (위임): 같은 root 에 한 번만 붙음
    function bind(root, onAct) {
      if (!root || root.__aictl) return;
      root.__aictl = true;
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-aiadd], [data-ailv], [data-aidel], [data-aikeep]');
        if (!b || !root.contains(b) || b.disabled) return;
        const now = performance.now();
        if (b.dataset.aiadd) {
          Net.send({ t: 'tkaiadd', team: b.dataset.aiadd, lv: 'normal' });
        } else if (b.dataset.ailv) {
          const id = b.dataset.id;
          if (now < (lvLock[id] || 0)) return;
          lvLock[id] = now + LV_GAP_MS;
          const to = b.dataset.ailv === 'easy' ? 'easy' : 'normal', back = to === 'easy' ? 'normal' : 'easy';
          Net.send({ t: 'tkailv', id, lv: to });
          // 서버 답을 기다리는 동안에도 바로 바뀐 것처럼 보이게 (다음 tklobby 가 진짜 값으로 다시 그림)
          b.classList.remove(back); b.classList.add(to); b.textContent = LV[to]; b.dataset.ailv = back;
        } else {
          if (now < delLock) return;
          delLock = now + DEL_GAP_MS;
          if (b.dataset.aidel) Net.send({ t: 'tkaidel', id: b.dataset.aidel });
          else Net.send({ t: 'tkaikeep', id: b.dataset.aikeep });
        }
        if (onAct) onAct(b);
      });
    }
    return { ctx, rowControls, addButton, bind, LV };
  })();

  // ---------------------------------------------------------------- 대기실
  function myRow() { return L && L.players.find((p) => p.id === me); }
  function isHost() { return L && L.host === me; }
  function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  // 팀 목록이 넘칠 때: 아래(또는 위)에 가려진 줄 수를 팀 머리에 「▼ N명 더」로, 목록 끝에는 옅은 그라데이션
  function moreHint(box) {
    const team = box.closest('.lb-team');
    const tag = team && team.querySelector('.lb-more');
    if (!tag) return;
    const lr = box.getBoundingClientRect();
    let below = 0, above = 0;
    box.querySelectorAll('.prow').forEach((r) => {
      const rr = r.getBoundingClientRect();
      if (rr.top + rr.height / 2 > lr.bottom) below++;
      else if (rr.top + rr.height / 2 < lr.top) above++;
    });
    box.classList.toggle('more-dn', below > 0);
    box.classList.toggle('more-up', box.scrollTop > 1);
    tag.hidden = below === 0;
    tag.textContent = below ? `▼ ${below}명 더` : '';
    void above;
  }
  window.addEventListener('resize', () => $$('#s-lobby .lb-list').forEach(moreHint));

  function renderLobby() {
    if (!L) return;
    const mine = myRow();
    $('#lb-code').textContent = L.code;
    const ai = L.players.filter((p) => p.ai).length;
    $('#lb-count').textContent = `참가 ${L.players.length}/${L.max}${ai ? ` (AI ${ai})` : ''}`;
    $('#lb-warn').textContent = L.diff >= 2 ? `⚠ 인원 차이 ${L.diff}명` : '';
    const host = isHost();
    const ac = AICtl.ctx(L, me);
    $('#s-lobby').classList.toggle('aihost', host);
    for (const team of ['A', 'B']) {
      const rows = L.players.filter((p) => p.tm === team);
      $(team === 'A' ? '#lb-ca' : '#lb-cb').textContent = `(${rows.length}/${L.teamMax})`;
      const box = $(team === 'A' ? '#lb-la' : '#lb-lb');
      box.innerHTML = rows.map((p) => {
        const tags = [];
        // 태그: 넓은 화면(.tw)은 그대로 · 좁은 화면(.tn, ≤700px)은 「방장·나」 한 알약 + 상태는 색 점 (이름이 4글자 이상 보이게)
        const isH = p.id === L.host, isMe = p.id === me;
        if (isH && isMe) tags.push('<span class="tag host tw">방장</span><span class="tag tw">나</span><span class="tag host tn">방장·나</span>');
        else if (isH) tags.push('<span class="tag host">방장</span>');
        if (p.ai) tags.push(AICtl.rowControls(p, ac));
        if (isMe && !isH) tags.push('<span class="tag">나</span>');
        const stDot = (key, label) => `<span class="tag st tw">${label}</span><span class="tag dot tn s-${key}" role="img" aria-label="${label}" title="${label}"></span>`;
        if (!p.ai && L.round && ST[p.st]) tags.push(stDot(p.st, ST[p.st]));
        if (!p.on && !p.ai) tags.push(stDot('off', '끊김'));   // AI 는 늘 연결됨
        const cls = (p.id === me ? ' me' : '') + (p.on ? '' : ' off') + (p.ai ? ' ai' : '') + (p.ai && p.out ? ' out' : '') + (p.ai && L.round && p.st === 'wait' ? ' wait' : '');
        return `<div class="prow${cls}" data-id="${esc(p.id)}"><canvas data-k="${p.k}" data-t="${p.tm}"></canvas><span class="nm">${esc(p.n)}</span>${tags.join('')}</div>`;
      }).join('');
      box.querySelectorAll('canvas').forEach((cv) => Art.icon(cv, cv.dataset.k, cv.dataset.t));
      if (!box.__more) { box.__more = true; box.addEventListener('scroll', () => moreHint(box), { passive: true }); }
      const slot = $(team === 'A' ? '#lb-adda' : '#lb-addb');
      const addHtml = AICtl.addButton(team, ac);
      slot.hidden = !addHtml;
      if (slot.innerHTML !== addHtml) slot.innerHTML = addHtml;
      moreHint(box);   // 추가 버튼까지 그린 뒤(목록 높이가 정해진 뒤) 가려진 줄 수 계산
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
    // 8대8까지 채우기 (옛 AI 설정 창에 있던 것): 방장만 · 방이 가득 차면 꺼진 모양으로 그 자리에 둠
    const f8 = $('#lb-fill8');
    f8.hidden = !host;
    const roomFull = L.players.length >= L.max;
    f8.disabled = roomFull;
    f8.textContent = roomFull ? `방 가득 참 ${L.players.length}/${L.max}` : (rd ? '8대8까지 AI 채우기 · 다음 판' : '8대8까지 AI 채우기');
    let why = '';
    if (rd) why = '판이 끝나면 다음 판이 시작돼요' + (mine ? ' · 기종·팀은 다음 판에 적용' : '');
    else if (!host) why = '방장이 시작하면 바로 출발해요';
    else if (!L.canStart) why = shortWhy(L.why);
    $('#lb-why').textContent = why;
    Share.setRoom(L.code);   // 카카오톡 안 「크롬/Safari로 열기」 주소에 ?room= 을 다시 붙이려고
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
    if ($('#lb-emos') && !$('#lb-emos').hidden) emoPop(false);   // 화면이 바뀌면 이모티콘 판도 닫음
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
    const tagBoxes = $$('#s-lobby .prow .tag, #s-lobby .prow .aibtn, #s-lobby .prow .ai-note, #s-lobby .ai-add').filter((el) => el.offsetParent !== null).map((el) => {
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
    // 들어간 뒤에는 주소의 ?room= 을 지움(새로고침 때 옛 방 초대 안내가 다시 뜨지 않게).
    // 재접속(tkrejoin)은 주소가 아니라 net.js 의 저장된 자리(sessionStorage 탭 자리 · localStorage 3시간)로 함
    dropRoomParam();
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
    $('#s-join').hidden = true; $('#s-lobby').hidden = true;
    if (Share.closeSheet) Share.closeSheet();   // 대기실에서 열어 둔 설치 안내 시트가 판을 덮지 않게
    Game.start(m);
  });
  Net.on('tkemo', (m) => bubble(m.id, m.e));
  Net.on('tkleft', () => { clearBubbles(); Share.setRoom(''); Net.forget(); L = null; me = null; show('#s-join'); joinArt(); });
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
    // 홈 화면에 추가 (입장 화면 · 대기실 · 세로 안내 · 게임 메뉴) — v3.5.1 늘 보임(앱 창이면 누를 때 「이미 앱으로 열려 있어요」)
    $$('.inst-btn').forEach((b) => { b.hidden = false; b.addEventListener('click', () => { SND.unlock(); SND.SFX.click(); Share.install(); }); });
    $('#lb-leave').addEventListener('click', leave);
    $('#lb-watch').addEventListener('click', () => { SND.SFX.click(); Net.send({ t: 'tkspec', d: 0 }); });
    $('#lb-kinds').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (b) { SND.SFX.click(); Net.send({ t: 'tkpick', kind: b.dataset.kind }); } });
    $$('.teams .tbtn').forEach((b) => b.addEventListener('click', () => { SND.SFX.click(); Net.send({ t: 'tkteam', team: b.dataset.team }); }));
    $('#lb-emos').innerHTML = Art.EMO.map((e, i) => `<button type="button" class="emo" data-emo="${i}" aria-label="${e.n}">${e.svg}</button>`).join('');
    // 이모티콘 판: 😊 버튼으로 열고 닫음 · 버튼 바로 아래(화면 안으로 맞춤) · 바깥 톡·Esc·보내면 닫힘
    $('#lb-emo-btn').innerHTML = Art.EMO[0] ? Art.EMO[0].svg : '😊';
    $('#lb-emo-btn').addEventListener('click', () => { SND.SFX.click(); emoPop($('#lb-emos').hidden); });
    document.addEventListener('pointerdown', (e) => {
      if (!$('#lb-emos').hidden && !e.target.closest('#lb-emos, #lb-emo-btn')) emoPop(false);
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#lb-emos').hidden) emoPop(false); });
    window.addEventListener('resize', () => { if (!$('#lb-emos').hidden) emoPop(true); });
    $('#lb-emos').addEventListener('click', (e) => {
      const b = e.target.closest('[data-emo]'); if (!b) return;
      const now = performance.now();
      if (now < emoCool) { SND.SFX.deny(); return; }
      emoCool = now + 1000;
      $$('.emo').forEach((x) => x.classList.add('cool'));
      setTimeout(() => $$('.emo').forEach((x) => x.classList.remove('cool')), 1000);
      Net.send({ t: 'tkemo', e: Number(b.dataset.emo) });
      emoPop(false);
    });
    $('#lb-start').addEventListener('click', () => {
      SND.unlock();
      if (!L || !L.canStart) { SND.SFX.deny(); toast(L ? L.why : ''); return; }
      SND.SFX.go(); Net.send({ t: 'tkstart' });
    });
    $('#lb-practice').addEventListener('click', () => { SND.SFX.click(); Net.send({ t: 'tkpractice', to: '2v2' }); });
    $('#lb-fill8').addEventListener('click', () => { if ($('#lb-fill8').disabled) return; SND.SFX.click(); Net.send({ t: 'tkpractice', to: '8v8' }); });
    // 팀 목록 안 AI 조작 (방장에게만 버튼이 그려짐 · 서버도 방장 검사)
    AICtl.bind($('#s-lobby .lb-body'), () => SND.SFX.click());
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
    Share.setRoom('');
    Net.forget(); L = null; me = null;
    show('#s-join'); joinArt();
  }

  setup();
  window.TankLobby = { toast, leave, AICtl };
  void joining;
})();
