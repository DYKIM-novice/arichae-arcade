/* 아리채 오락실 · 카드게임관 (대기실 설정 + 게임 화면)
   race  (프리첼): 모두 같은 판을 동시에 혼자 풀어요. 진행 상황(cprog)을 서버에 보내고, 다 풀면 서버 시계로 시간을 재요
   table (홀덤·훌라·맞고): 서버가 카드를 섞고 규칙을 계산해요. 각자에게 자기 패만 와요(cview) */
(function () {
  'use strict';

  const App = window.App;
  const C = window.Cards;
  const { $, esc, S, A, SND } = App;

  const H = { key: '', view: null, def: null, lastProg: '', resultKey: '', timerT: 0, mine: { found: 0, moves: 0 } };

  function cfg() { return (S.room && S.room.card) || { game: 'freecell', ai: 2, seats: [] }; }
  function sess() { return S.room && S.room.csess; }
  function isHost() { return S.room && S.room.hostPid === S.pid; }
  function person(pid) { return (S.room.players || []).find((p) => p.pid === pid) || null; }
  const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  /* ================================================================
     대기실
     ================================================================ */
  function renderLobby(host) {
    const c = cfg();
    const dis = host ? '' : 'disabled';
    const list = C.list();
    const def = C.get(c.game) || list[0];
    if (!def) { $('#card-panel').innerHTML = '<div class="hint-md">카드게임을 불러오는 중…</div>'; return; }
    const cards = list.map((d) => {
      const m = d.meta || {};
      const pl = m.players ? (m.players[0] === m.players[1] ? `${m.players[0]}명` : `${m.players[0]}~${m.players[1]}명`) : '';
      return `<button type="button" class="bg-card${d.id === def.id ? ' on' : ''}" data-cgame="${d.id}" ${dis}>
        <span class="bg-ic">${d.icon || ''}</span><b class="disp">${esc(d.name)}</b><span>${d.kind === 'race' ? '다 같이 빨리 풀기' : pl + (m.ai ? ' · AI' : '')}</span></button>`;
    }).join('');
    const players = (S.room.players || []).filter((p) => p.connected);
    let mid = '';
    if (def.kind === 'race') {
      mid = `<div class="list-head sub"><span>참가</span><span class="hint-sm">방에 있는 모두가 같은 판으로</span></div>
        <div class="cd-who">${players.map((p) => `<span class="cd-chip"><span class="av">${A.svg(p.animal)}</span>${esc(p.name)}</span>`).join('')}</div>`;
    } else {
      const seats = previewSeats(def);
      const B = window.Boards;
      const L = B.levelInfo(c.ai);
      const m = def.meta || {};
      const maxN = (m.players || [2, 8])[1];
      const nAi = seats.filter((x) => x === 'ai').length;
      const humansIn = seats.filter((x) => x !== 'ai');
      mid = `<div class="list-head sub"><span>참가</span><span class="hint-sm">${host ? '눌러서 빼거나 넣어요' : ''} · ${seats.length}명</span></div>
        <div class="cd-who">${players.map((p) => `<button type="button" class="cd-chip${humansIn.includes(p.pid) ? ' on' : ' off'}" data-chum="${p.pid}" ${dis}><span class="av">${A.svg(p.animal)}</span>${esc(p.name)}</button>`).join('')}</div>
        ${m.ai ? `<div class="list-head sub"><span>AI 친구</span><span class="hint-sm">${esc(L.name)} · ${esc(L.desc)}</span></div>
        <div class="cd-ai-row"><button type="button" class="cd-step" data-cai-n="-1" ${dis || (nAi <= 0 ? 'disabled' : '')}>−</button>
          <span class="cd-ai-list">${nAi ? Array.from({ length: nAi }, () => `<span class="av">${B.levelAvatar(c.ai)}</span>`).join('') : '<span class="hint-sm">없음</span>'}</span>
          <button type="button" class="cd-step" data-cai-n="1" ${dis || (seats.length >= maxN ? 'disabled' : '')}>+</button></div>
        ${nAi ? `<div class="bg-levels">${B.LEVELS.map((l) => `<button type="button" data-cai="${l.n}" class="${c.ai === l.n ? 'on' : ''}" ${dis}><span class="av">${B.levelAvatar(l.n)}</span><b>${l.n}</b><span>${esc(l.name)}</span></button>`).join('')}</div>` : ''}` : ''}`;
    }
    $('#card-panel').innerHTML = `<div class="bg-cards">${cards}</div>${mid}
      <div class="bg-rules">${esc(def.rulesText || '')}</div>
      <div class="bg-help">${C.howto && C.howto[def.id] ? `<button type="button" class="btn btn-ghost bg-guide-btn" data-chowto="${def.id}">📜 규칙 보기</button>` : ''}</div>`;
  }
  // 자리 미리 보기 (서버와 같은 방식): 방장이 정한 목록, 없으면 접속한 사람 모두 + AI 로 기본 인원
  function previewSeats(def) {
    const c = cfg();
    const m = def.meta || {};
    const [lo, hi] = m.players || [2, 8];
    const humans = (S.room.players || []).filter((p) => p.connected).map((p) => p.pid);
    let want = (c.seats || []).filter((x) => x === 'ai' || humans.includes(x));
    if (!want.length) {
      want = humans.slice(0, hi);
      while (want.length < Math.max(lo, m.fill || 2) && want.length < hi) want.push('ai');
    }
    return want.slice(0, hi);
  }
  function lobbyMain() {
    const def = C.get(cfg().game);
    if (!def) return { label: '카드게임', help: '' };
    if (def.kind === 'race') {
      const n = (S.room.players || []).filter((p) => p.connected).length;
      return { label: `${def.name} 시작${n > 1 ? ` · ${n}명 시합` : ''}`, help: n > 1 ? '같은 판을 누가 먼저 푸나 시합해요' : '혼자 풀어도 기록실에 올라가요' };
    }
    const seats = previewSeats(def);
    const lo = ((def.meta || {}).players || [2])[0];
    const ok = seats.length >= lo && seats.some((x) => x !== 'ai');
    return ok ? { label: `${def.name} 시작 · ${seats.length}명`, help: seats.includes('ai') ? 'AI를 이기고 1등 하면 기록실에 올라가요' : '나머지 사람은 구경할 수 있어요' }
      : { wait: true, label: '사람이 더 필요해요', help: 'AI 친구를 넣거나 가족을 초대해요' };
  }
  function onLobbyClick(e) {
    const t = e.target;
    const hw = t.closest('[data-chowto]');
    if (hw) { SND.SFX.click(); openHowto(hw.dataset.chowto); return; }
    if (!isHost()) return;
    const b = t.closest('[data-cgame]');
    if (b && !b.disabled) { SND.SFX.click(); App.send({ t: 'settings', card: b.dataset.cgame }); return; }
    const def = C.get(cfg().game);
    if (!def || def.kind === 'race') return;
    let seats = previewSeats(def);
    let x;
    if ((x = t.closest('[data-chum]'))) {
      const pid = x.dataset.chum;
      seats = seats.includes(pid) ? seats.filter((s) => s !== pid) : [pid].concat(seats);
      if (!seats.some((s) => s !== 'ai')) { App.toast('사람이 한 명은 있어야 해요'); return; }
    } else if ((x = t.closest('[data-cai-n]')) && !x.disabled) {
      const d = Number(x.dataset.caiN);
      if (d > 0) seats = seats.concat(['ai']);
      else { const k = seats.lastIndexOf('ai'); if (k >= 0) seats.splice(k, 1); }
    } else if ((x = t.closest('[data-cai]')) && !x.disabled) {
      SND.SFX.click(); App.send({ t: 'settings', cai: Number(x.dataset.cai) }); return;
    } else return;
    SND.SFX.click();
    // 사람과 AI 를 번갈아 앉혀요
    const hs = seats.filter((s) => s !== 'ai'); const ai = seats.filter((s) => s === 'ai');
    const mixed = [];
    while (hs.length || ai.length) { if (hs.length) mixed.push(hs.shift()); if (ai.length) mixed.push(ai.shift()); }
    App.send({ t: 'settings', cseats: mixed.length ? mixed : ['ai'] });
  }

  function openHowto(gid) {
    const def = C.get(gid);
    const secs = C.howto && C.howto[gid];
    if (!def || !secs) return;
    $('#howto-title').innerHTML = `${def.icon || ''}<span>${esc(def.name)} 규칙</span>`;
    $('#howto-body').innerHTML = secs.map(([h, lines]) => `<section><h3>${esc(h)}</h3><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></section>`).join('');
    $('#howto-btns').innerHTML = '<button type="button" class="btn btn-yellow" data-hclose="1">알겠어요!</button>';
    const m = $('#howto-modal');
    m.classList.add('show'); m.setAttribute('aria-hidden', 'false');
  }

  /* ================================================================
     게임 화면 (race)
     ================================================================ */
  function ensureView(cs) {
    const key = `${cs.game}#${cs.round}#${cs.startAt}`;
    if (H.key === key && H.view) return;
    H.key = key;
    H.def = C.get(cs.game);
    if (H.view) H.view.destroy();
    H.mine = { found: 0, moves: 0, canUndo: false };
    H.lastProg = '';
    $('#cd-title').innerHTML = `${H.def.icon || ''}<span>${esc(H.def.name)}</span>`;
    $('#cd-result').className = 'cd-result';
    const playing = cs.seats.includes(S.pid);
    H.view = H.def.mount($('#cd-stage'), {
      canPlay: () => { const c = sess(); return !!c && c.status === 'play' && playing && App.serverNow() >= c.startAt; },
      status: (o) => { H.mine = o; renderBar(); },
      progress: (f, m, done) => sendProg(f, m, done),
      say: (txt) => App.toast(txt, 1800),
      tick: () => { SND.SFX.soft && SND.SFX.soft(); SND.vibrate(6); },
      buzz: () => { SND.SFX.bad && SND.SFX.bad(); SND.vibrate([25, 25, 25]); }
    }, { deal: cs.deal });
  }
  function sendProg(f, m, done) {
    const k = `${f}:${m}:${done}`;
    if (k === H.lastProg) return;
    H.lastProg = k;
    App.send({ t: 'cprog', f, m, done: !!done });
    if (done) { SND.SFX.fanfare && SND.SFX.fanfare(); SND.vibrate([60, 40, 120]); App.confetti && App.confetti('cd-confetti', 60, true); }
  }

  function renderBar() {
    const cs = sess();
    if (!cs) return;
    const now = App.serverNow();
    const el = $('#cd-bar');
    const mineP = cs.prog[S.pid];
    const elapsed = mineP && mineP.done ? mineP.ms : Math.min(now, cs.limitAt) - cs.startAt;
    el.innerHTML = `<span class="cd-time disp">⏱ ${now < cs.startAt ? '0:00' : fmtTime(elapsed)}</span>
      <span class="cd-info">${cs.deal}번 판 · ${H.mine.moves || 0}수</span>
      <span class="cd-info">홈 <b>${H.mine.found || 0}</b>/52</span>`;
    // 다른 사람 진행
    $('#cd-rivals').innerHTML = cs.seats.length > 1 ? cs.seats.map((pid) => {
      const p = person(pid); const pr = cs.prog[pid] || {};
      const pct = Math.round((pr.f || 0) / 52 * 100);
      return `<div class="cd-riv${pid === S.pid ? ' me' : ''}${pr.done ? ' done' : ''}${pr.gave ? ' gave' : ''}"><span class="av">${p ? A.svg(p.animal) : ''}</span>
        <span class="cd-riv-bar"><i style="width:${pct}%"></i></span><span class="cd-riv-t">${pr.done ? '✔ ' + fmtTime(pr.ms) : pr.gave ? '포기' : pr.f + '장'}</span></div>`;
    }).join('') : '';
    const acts = [];
    const playing = cs.seats.includes(S.pid) && cs.status === 'play';
    if (playing && !(mineP && (mineP.done || mineP.gave))) {
      acts.push(`<button type="button" class="btn btn-ghost" data-cact="undo" ${H.mine.canUndo ? '' : 'disabled'}>↶ 되돌리기</button>`);
      acts.push('<button type="button" class="btn btn-ghost" data-cact="restart">⟲ 처음부터</button>');
      acts.push('<button type="button" class="btn btn-ghost" data-cact="give">🏳 포기</button>');
    }
    if (isHost() && cs.status === 'play') acts.push(`<button type="button" class="btn btn-ghost" data-cact="${cs.seats.length > 1 ? 'end' : 'lobby'}">${cs.seats.length > 1 ? '시합 끝내기' : '대기실로'}</button>`);
    const html = acts.join('');
    if ($('#cd-actions').dataset.html !== html) { $('#cd-actions').innerHTML = html; $('#cd-actions').dataset.html = html; }
    // 시작 카운트다운
    const cnt = $('#cd-count');
    if (now < cs.startAt && cs.status === 'play') { cnt.textContent = Math.ceil((cs.startAt - now) / 1000); cnt.classList.add('show'); } else cnt.classList.remove('show');
  }

  function renderResult(cs) {
    const r = cs.result || {};
    const box = $('#cd-result');
    const rows = (r.rank || []).map((x, i) => {
      const p = person(x.pid);
      return `<div class="cd-r-row${x.pid === S.pid ? ' me' : ''}"><b class="cd-r-n disp">${x.done ? i + 1 : '-'}</b><span class="av">${p ? A.svg(p.animal) : ''}</span>
        <span class="cd-r-nm">${esc(p ? p.name : '?')}</span><span class="cd-r-v">${x.done ? '✔ ' + fmtTime(x.ms) + ` · ${x.m}수` : `홈 ${x.f}/52장`}</span></div>`;
    }).join('');
    const mine = cs.prog[S.pid] || {};
    let rec = '';
    if (mine.rec) {
      const me = person(S.pid);
      window.Records && window.Records.addMine({ board: mine.rec.board, rank: mine.rec.rank, id: mine.rec.id, name: me ? me.name : '', comment: '' });
      rec = `<div class="rr me"><span class="rr-txt">🏆 <b>${fmtTime(mine.ms)}</b><br>이번 주 <b class="hl">${mine.rec.rank}위</b> 기록!</span><button type="button" class="rr-btn" data-rec="${mine.rec.id}">한마디 남기기</button></div>`;
    }
    const won = (r.rank || [])[0] && r.rank[0].pid === S.pid && r.rank[0].done;
    const solo = cs.seats.length === 1;
    const title = solo ? (mine.done ? '다 풀었어요!' : '다음엔 꼭!') : won ? '1등!' : '시합 끝!';
    box.innerHTML = `<div class="bd-r-card">
      <div class="bd-r-emoji">${mine.done ? '🎉' : '🃏'}</div><h2 class="disp">${title}</h2>
      ${solo ? '' : `<div class="cd-r-list">${rows}</div>`}${rec}
      ${H.def && H.def.learn ? `<p class="bd-learn">${esc(H.def.learn)}</p>` : ''}
      <div class="bd-r-btns">${isHost() ? '<button type="button" class="btn btn-yellow" data-cact="rematch">새 판으로 한 판 더!</button>' : '<div class="hint-md">방장이 한 판 더 할 수 있어요</div>'}
        <div class="bd-r-row"><button type="button" class="btn btn-ghost" data-cact="review">판 보기</button>
        ${isHost() ? '<button type="button" class="btn btn-ghost" data-cact="lobby">대기실로</button>' : '<button type="button" class="btn btn-ghost btn-records">🏆 기록실</button>'}</div></div></div>`;
    box.className = 'cd-result show';
    const key = `${H.key}|${r.at}`;
    if (H.resultKey !== key) { H.resultKey = key; if (won && !solo) { App.confetti && App.confetti('cd-confetti', 60, true); SND.SFX.victory && SND.SFX.victory(); } }
  }

  /* ================================================================
     게임 화면 (table) — 서버가 보내 준 내 화면 정보(cview)로 그려요
     ================================================================ */
  function seatInfo(cs, i) {
    const s = cs.seats[i];
    const B = window.Boards;
    if (s === 'ai') return { name: cs.names[i], av: B.levelAvatar(cs.ai), ai: true, me: false };
    const p = person(s);
    return { name: p ? p.name : cs.names[i], av: p ? A.svg(p.animal) : '', ai: false, me: s === S.pid, off: p && !p.connected };
  }
  function ensureTable(cs) {
    const key = `${cs.game}#${cs.round}#${cs.startAt}`;
    if (H.key === key && H.view) return;
    H.key = key;
    H.def = C.get(cs.game);
    if (H.view) H.view.destroy();
    H.cview = null;
    $('#cd-title').innerHTML = `${H.def.icon || ''}<span>${esc(H.def.name)}</span>`;
    $('#cd-result').className = 'cd-result';
    $('#cd-rivals').innerHTML = '';
    H.view = H.def.mount($('#cd-stage'), {
      act: (a) => { App.send({ t: 'cact', a }); },
      seat: (i) => seatInfo(sess(), i),
      say: (txt) => App.toast(txt, 1800),
      tick: () => { SND.SFX.soft && SND.SFX.soft(); SND.vibrate(6); },
      sfx: (k) => { const f = SND.SFX[k]; if (f) f(); },
      vibrate: (p) => SND.vibrate(p),
      now: () => App.serverNow()
    });
  }
  function renderTable(cs) {
    ensureTable(cs);
    if (H.pendingView && H.pendingView.round === cs.round) { H.cview = H.pendingView.v; H.pendingView = null; }
    if (H.cview && H.view) H.view.render(H.cview);
    $('#cd-bar').innerHTML = H.def.bar && H.cview ? H.def.bar(H.cview) : '';
    const acts = [];
    if (isHost() && cs.status === 'play') acts.push('<button type="button" class="btn btn-ghost" data-cact="lobby">대기실로</button>');
    const html = acts.join('');
    if ($('#cd-actions').dataset.html !== html) { $('#cd-actions').innerHTML = html; $('#cd-actions').dataset.html = html; }
    $('#cd-count').classList.remove('show');
    if (cs.status === 'over') { if (!$('#cd-result').classList.contains('mini')) renderTableResult(cs); } else $('#cd-result').className = 'cd-result';
  }
  function renderTableResult(cs) {
    const r = cs.result || {};
    const box = $('#cd-result');
    const mySeat = cs.seats.indexOf(S.pid);
    const won = mySeat >= 0 && r.winner === mySeat;
    const rows = (r.rank || []).map((i, k) => {
      const si = seatInfo(cs, i);
      return `<div class="cd-r-row${si.me ? ' me' : ''}"><b class="cd-r-n disp">${k + 1}</b><span class="av">${si.av}</span><span class="cd-r-nm">${esc(si.name)}</span>
        <span class="cd-r-v">${H.def.rankLabel ? H.def.rankLabel(H.cview, i, k) : ''}</span></div>`;
    }).join('');
    let rec = '';
    if (r.rec) {
      const p = person(r.rec.pid);
      if (r.rec.pid === S.pid) {
        window.Records && window.Records.addMine({ board: r.rec.board, rank: r.rec.rank, id: r.rec.id, name: p ? p.name : '', comment: '' });
        rec = `<div class="rr me"><span class="rr-txt">🏆 <b>${App.fmtNum(r.score)}점</b><br>이번 주 <b class="hl">${r.rec.rank}위</b> 기록!</span><button type="button" class="rr-btn" data-rec="${r.rec.id}">한마디 남기기</button></div>`;
      } else rec = `<div class="rr"><span class="rr-txt">🏆 ${esc(p ? p.name : '')}님 이번 주 Top 10 <b class="hl">${r.rec.rank}위</b>!</span></div>`;
    }
    const wi = r.winner >= 0 ? seatInfo(cs, r.winner) : null;
    box.innerHTML = `<div class="bd-r-card"><div class="bd-r-emoji">${won ? '🏆' : '🃏'}</div>
      <h2 class="disp">${won ? '우승!' : wi ? esc(wi.name) + ' 우승!' : '끝!'}</h2>
      <div class="cd-r-list">${rows}</div>${rec}
      ${H.def.learn ? `<p class="bd-learn">${esc(H.def.learn)}</p>` : ''}
      <div class="bd-r-btns">${isHost() ? '<button type="button" class="btn btn-yellow" data-cact="rematch">한 판 더!</button>' : '<div class="hint-md">방장이 한 판 더 할 수 있어요</div>'}
        <div class="bd-r-row"><button type="button" class="btn btn-ghost" data-cact="review">판 보기</button>
        ${isHost() ? '<button type="button" class="btn btn-ghost" data-cact="lobby">대기실로</button>' : '<button type="button" class="btn btn-ghost btn-records">🏆 기록실</button>'}</div></div></div>`;
    box.className = 'cd-result show';
    const key = `${H.key}|${r.at}`;
    if (H.resultKey !== key) {
      H.resultKey = key;
      if (won) { App.confetti && App.confetti('cd-confetti', 70, true); SND.SFX.fanfare && SND.SFX.fanfare(); SND.vibrate([60, 40, 120]); } else SND.SFX.end && SND.SFX.end();
    }
  }

  function render() {
    const cs = sess();
    if (!cs) return;
    if (cs.kind === 'table') { renderTable(cs); return; }
    ensureView(cs);
    renderBar();
    if (cs.status === 'over') { if (!$('#cd-result').classList.contains('mini')) renderResult(cs); } else $('#cd-result').className = 'cd-result';
  }

  function onAction(act) {
    const cs = sess();
    if (!cs) return;
    SND.SFX.click();
    if (act === 'undo') H.view && H.view.undo();
    else if (act === 'restart') { if (confirmTwice('restart')) H.view && H.view.restart(); else App.toast('한 번 더 누르면 처음 모양으로 돌아가요 (시간은 계속 가요)'); }
    else if (act === 'give') { if (confirmTwice('give')) App.send({ t: 'cprog', f: H.mine.found || 0, m: H.mine.moves || 0, gave: true }); else App.toast('한 번 더 누르면 포기해요'); }
    else if (act === 'end') { if (confirmTwice('end')) App.send({ t: 'cend' }); else App.toast('한 번 더 누르면 시합을 끝내요'); }
    else if (act === 'lobby') { if (cs.kind !== 'table' || cs.status === 'over' || confirmTwice('lobby')) App.send({ t: 'again' }); else App.toast('한 번 더 누르면 게임을 끝내고 대기실로 가요'); }
    else if (act === 'rematch') App.send({ t: 'crematch' });
    else if (act === 'review') { $('#cd-result').className = 'cd-result mini'; $('#cd-result').innerHTML = `<div class="bd-r-card"><div class="bd-r-row">${isHost() ? '<button type="button" class="btn btn-yellow" data-cact="rematch">한 판 더!</button><button type="button" class="btn btn-ghost" data-cact="lobby">대기실로</button>' : '<button type="button" class="btn btn-ghost btn-records">🏆 기록실</button>'}</div></div>`; }
  }
  let armed = ''; let armT = 0;
  function confirmTwice(k) { const n = Date.now(); if (armed === k && n - armT < 2500) { armed = ''; return true; } armed = k; armT = n; return false; }

  function onState(room, changed) {
    if (room.phase === 'card') {
      const active = document.querySelector('.screen.active');
      if (changed || !active || (active.id !== 's-card' && active.id !== 's-records')) App.showScreen('s-card');
      render();
      App.wakeLock && App.wakeLock(true);
      clearInterval(H.timerT);
      H.timerT = setInterval(() => { const c = sess(); if (c && c.status === 'play') { if (c.kind === 'table') { if (H.view && H.view.tick) H.view.tick(); } else renderBar(); } }, 500);
    } else if (H.view) {
      H.view.destroy(); H.view = null; H.key = '';
      clearInterval(H.timerT);
    }
  }

  function setup() {
    $('#card-panel').addEventListener('click', onLobbyClick);
    ['#cd-actions', '#cd-result'].forEach((sel) => $(sel).addEventListener('click', (e) => {
      const b = e.target.closest('[data-cact]');
      if (b && !b.disabled) onAction(b.dataset.cact);
    }));
    $('#cd-howto-btn').addEventListener('click', () => { const cs = sess(); if (cs) { SND.SFX.click(); openHowto(cs.game); } });
    App.hooks.state.push(onState);
    App.hooks.message.push((msg) => {
      if (msg.t !== 'cview') return;
      const cs = sess();
      if (!cs || cs.kind !== 'table' || msg.round !== cs.round) { H.pendingView = msg; return; }
      H.cview = msg.v;
      render();
    });
  }

  window.CardHall = { renderLobby, lobbyMain, openHowto, H };
  setup();
})();
