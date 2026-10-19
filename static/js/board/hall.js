/* 아리채 오락실 · 보드게임관 (대기실 설정 + 대국 화면 + AI 진행 + 따라하기)
   서버는 차례와 수 목록만 지키고, 규칙·AI 는 여기(기기)에서 계산해요.
   AI 차례에는 방장 기기가 AI 수를 계산해서 보내요. */
(function () {
  'use strict';

  const App = window.App;
  const B = window.Boards;
  const { $, esc, S, A, SND } = App;

  const H = {
    sessKey: '',      // 화면에 붙여 둔 판 (게임 + 판 번호)
    view: null,
    def: null,
    st: null,
    moves: [],        // 서버가 준 수 + 내가 막 둔 수(응답 오기 전)
    pending: null,    // 응답 기다리는 내 수
    aiFor: -1,        // AI 를 계산 중인 수 번호
    endSent: -1,
    hint: -1,
    hintArm: false,
    guide: null,      // 따라하기 진행 상태 (로컬)
    lastResultKey: ''
  };

  /* ================================================================
     대기실: 보드게임 고르기
     ================================================================ */
  function boardCfg() { return (S.room && S.room.board) || { game: 'omok', vs: 'ai', ai: 2, seats: [] }; }
  function connectedPlayers() { return (S.room ? S.room.players : []).filter((p) => p.connected); }

  // 서버와 같은 방식으로 자리 예상 (대기실 미리보기용)
  function previewSeats(cfg, def) {
    const n = 2;
    const humans = connectedPlayers().map((p) => p.pid);
    const want = (cfg.seats || []).slice(0, n);
    if (cfg.vs === 'ai') {
      let hs = want.findIndex((s) => humans.includes(s));
      const human = hs >= 0 ? want[hs] : (humans.includes(S.room.hostPid) ? S.room.hostPid : humans[0]);
      if (hs < 0) hs = 0;
      const seats = Array(n).fill('ai');
      seats[hs] = human || '';
      return seats;
    }
    const seats = [];
    const used = new Set();
    want.forEach((s) => { if (humans.includes(s) && !used.has(s)) { seats.push(s); used.add(s); } else seats.push(''); });
    while (seats.length < n) seats.push('');
    const rest = humans.filter((h) => !used.has(h));
    for (let i = 0; i < n; i++) if (!seats[i] && rest.length) seats[i] = rest.shift();
    return seats;
  }

  function seatPerson(s) {
    if (s === 'ai') return null;
    return (S.room.players || []).find((p) => p.pid === s) || null;
  }

  function renderLobby(isHost) {
    const cfg = boardCfg();
    const dis = isHost ? '' : 'disabled';
    const list = B.list();
    const def = B.get(cfg.game) || list[0];
    if (!def) { $('#board-panel').innerHTML = '<div class="hint-md">보드게임을 불러오는 중…</div>'; return; }
    const seats = previewSeats(cfg, def);
    const L = B.levelInfo(cfg.ai);
    const cards = list.map((d) => {
      const on = d.id === def.id;
      const m = d.meta || {};
      const pl = m.players ? (m.players[0] === m.players[1] ? `${m.players[0]}명` : `${m.players[0]}~${m.players[1]}명`) : '2명';
      return `<button type="button" class="bg-card${on ? ' on' : ''}" data-bgame="${d.id}" ${dis}>
        <span class="bg-ic">${d.icon || ''}</span><b class="disp">${esc(d.name)}</b><span>${pl}${m.ai ? ' · AI' : ''}</span></button>`;
    }).join('');
    const vsSeg = `<div class="seg bg-vs">
      <button type="button" data-bvs="ai" class="${cfg.vs === 'ai' ? 'on' : ''}" ${dis}>🤖 AI와 대결</button>
      <button type="button" data-bvs="pvp" class="${cfg.vs !== 'ai' ? 'on' : ''}" ${dis}>👪 사람끼리 1:1</button></div>`;
    const levels = cfg.vs === 'ai' ? `<div class="list-head sub"><span>AI 단계</span><span class="hint-sm">${esc(L.name)} · ${esc(L.desc)}</span></div>
      <div class="bg-levels">${B.LEVELS.map((l) => `<button type="button" data-bai="${l.n}" class="${cfg.ai === l.n ? 'on' : ''}" ${dis}>
        <span class="av">${B.levelAvatar(l.n)}</span><b>${l.n}</b><span>${esc(l.name)}</span></button>`).join('')}</div>` : '';
    const seatHTML = def.seats.map((sd, i) => {
      const s = seats[i];
      const p = seatPerson(s);
      const who = s === 'ai' ? `<span class="av">${B.levelAvatar(cfg.ai)}</span><b>AI ${esc(L.name)}</b>`
        : p ? `<span class="av">${A.svg(p.animal)}</span><b>${esc(p.name)}${p.pid === S.pid ? ' (나)' : ''}</b>`
          : '<span class="av empty">?</span><b>빈 자리</b>';
      return `<button type="button" class="bg-seat" data-bseat="${i}" ${dis}><span class="bg-stone">${sd.icon || ''}</span>
        <span class="bg-seat-lbl">${esc(sd.label)}<small>${esc(sd.sub || '')}</small></span><span class="bg-who">${who}</span></button>`;
    }).join(`<button type="button" class="bg-swap" data-bswap="1" ${dis} aria-label="자리 바꾸기">⇄</button>`);
    $('#board-panel').innerHTML = `
      <div class="bg-cards">${cards}</div>
      <div class="list-head sub"><span>대결 방식</span></div>${vsSeg}${levels}
      <div class="list-head sub"><span>자리</span><span class="hint-sm">${isHost ? '눌러서 사람을 바꿔요' : ''}</span></div>
      <div class="bg-seats">${seatHTML}</div>
      <div class="bg-rules">${esc(def.rulesText || '')}</div>
      ${B.guides[def.id] ? `<button type="button" class="btn btn-ghost bg-guide-btn" data-bguide="${def.id}">📖 따라하기로 배우기</button>` : ''}`;
  }

  function lobbyMain() {
    const cfg = boardCfg();
    const def = B.get(cfg.game);
    if (!def) return { label: '보드게임', help: '' };
    const seats = previewSeats(cfg, def);
    const ready = seats.every((s) => s);
    const L = B.levelInfo(cfg.ai);
    return {
      wait: !ready,
      label: ready ? (cfg.vs === 'ai' ? `${def.name} 시작 · AI ${L.name}` : `${def.name} 시작 · 1:1`) : '한 명 더 필요해요',
      help: ready ? (cfg.vs === 'ai' ? 'AI를 이기면 기록실 Top 10에 올라가요' : '나머지 사람은 구경할 수 있어요')
        : '가족을 초대하거나 AI와 대결을 골라 주세요'
    };
  }

  function onLobbyClick(e) {
    const t = e.target;
    const room = S.room;
    if (!room) return;
    const isHost = room.hostPid === S.pid;
    const g = t.closest('[data-bguide]');
    if (g) { SND.SFX.click(); openGuide(g.dataset.bguide); return; }
    if (!isHost) return;
    const cfg = boardCfg();
    const def = B.get(cfg.game);
    let b;
    if ((b = t.closest('[data-bgame]')) && !b.disabled) { SND.SFX.click(); App.send({ t: 'settings', board: b.dataset.bgame }); return; }
    if ((b = t.closest('[data-bvs]')) && !b.disabled) { SND.SFX.click(); App.send({ t: 'settings', bvs: b.dataset.bvs }); return; }
    if ((b = t.closest('[data-bai]')) && !b.disabled) { SND.SFX.click(); App.send({ t: 'settings', bai: Number(b.dataset.bai) }); return; }
    if ((b = t.closest('[data-bswap]')) && !b.disabled) {
      SND.SFX.click();
      const seats = previewSeats(cfg, def);
      App.send({ t: 'settings', bseats: seats.slice().reverse() });
      return;
    }
    if ((b = t.closest('[data-bseat]')) && !b.disabled) {
      // 자리 누르기: 그 자리에 앉을 사람을 차례로 바꿔요
      const i = Number(b.dataset.bseat);
      const seats = previewSeats(cfg, def);
      const humans = connectedPlayers().map((p) => p.pid);
      if (cfg.vs === 'ai') {
        if (seats[i] === 'ai') {
          // AI 자리를 누르면 사람과 자리를 바꿔요 (흑·백 바꾸기)
          App.send({ t: 'settings', bseats: seats.slice().reverse() });
        } else {
          const k = humans.indexOf(seats[i]);
          const next = humans[(k + 1) % humans.length];
          const ns = seats.slice(); ns[i] = next;
          App.send({ t: 'settings', bseats: ns });
        }
      } else {
        const k = humans.indexOf(seats[i]);
        let next = humans[(k + 1) % humans.length];
        const ns = seats.slice();
        const j = ns.indexOf(next);
        if (j >= 0 && j !== i) ns[j] = seats[i];
        ns[i] = next;
        App.send({ t: 'settings', bseats: ns });
      }
      SND.SFX.click();
    }
  }

  /* ================================================================
     대국 화면
     ================================================================ */
  function sess() { return S.room && S.room.bsess; }
  function mySeats(bs) { return (bs ? bs.seats : []).map((s, i) => (s === S.pid ? i : -1)).filter((i) => i >= 0); }
  function isHost() { return S.room && S.room.hostPid === S.pid; }

  function seatName(bs, i) {
    const s = bs.seats[i];
    if (s === 'ai') return `AI ${B.levelInfo(bs.ai).name}`;
    const p = seatPerson(s);
    return p ? (p.pid === S.pid ? '나' : p.name) : '?';
  }

  function ensureView(bs) {
    const key = `${bs.game}#${bs.round}#${bs.startAt}`;
    if (H.sessKey === key && H.view) return false;
    H.sessKey = key;
    H.def = B.get(bs.game);
    H.guide = null;
    H.aiFor = -1; H.endSent = -1; H.pending = null; H.hint = -1; H.hintArm = false;
    if (H.view) H.view.destroy();
    H.view = H.def.mount($('#bd-stage'), viewApi());
    $('#bd-title').innerHTML = `${H.def.icon || ''}<span>${esc(H.def.name)}</span>`;
    $('#bd-result').className = 'bd-result';
    $('#bd-guide-btn').style.display = B.guides[bs.game] ? '' : 'none';
    return true;
  }

  function viewApi() {
    return {
      pick: (m) => (H.guide ? guidePick(m) : playMove(m)),
      selecting: (on, label) => {
        const bar = $('#bd-confirm');
        bar.classList.toggle('show', on);
        bar.querySelector('.bd-c-lbl').textContent = on ? `${label} 에 둘까요?` : '';
      },
      say: (txt) => App.toast(txt, 1600),
      buzz: () => { SND.SFX.bad && SND.SFX.bad(); SND.vibrate([30, 30, 30]); },
      tick: () => { SND.SFX.soft && SND.SFX.soft(); SND.vibrate(8); }
    };
  }

  function curMoves(bs) {
    const server = bs.moves.map((x) => x.m);
    if (H.pending && H.pending.n === server.length) return server.concat([H.pending.m]);
    return server;
  }

  function render() {
    const bs = sess();
    if (!bs || H.guide) return;
    ensureView(bs);
    const def = H.def;
    const moves = curMoves(bs);
    const st = def.replay(moves, bs);
    H.st = st;
    const over = bs.status === 'over';
    const res = def.result(st);
    const turn = def.turnSeat(st);
    const mine = mySeats(bs);
    const myTurn = !over && !res && mine.includes(turn) && !H.pending;
    const aiTurn = !over && !res && bs.seats[turn] === 'ai';

    // 자리 카드
    $('#bd-seats').innerHTML = bs.seats.map((s, i) => {
      const p = seatPerson(s);
      const av = s === 'ai' ? B.levelAvatar(bs.ai) : p ? A.svg(p.animal) : '';
      const on = !over && !res && turn === i;
      const win = over && bs.result && bs.result.winner === i;
      return `<div class="bd-seat${on ? ' on' : ''}${win ? ' win' : ''}${s === S.pid ? ' me' : ''}">
        <span class="bd-stone">${def.seats[i].icon || ''}</span>
        <span class="av">${av}</span>
        <span class="bd-nm">${esc(seatName(bs, i))}<small>${esc(def.seats[i].label)}${s === 'ai' ? ` · ${bs.ai}단계` : ''}</small></span>
        ${on ? `<span class="bd-turn">${s === 'ai' ? '생각 중' : '차례'}</span>` : ''}${win ? '<span class="bd-turn win">승리</span>' : ''}
      </div>`;
    }).join('<span class="bd-vs disp">VS</span>');

    // 상태 줄
    let status;
    if (over || res) status = '';
    else if (myTurn) status = `<b>내 차례</b> · 놓을 자리를 눌러요${bs.vs === 'ai' && (bs.undos || bs.hints) ? ' <span class="bd-norec">무르기·힌트 사용 → 기록 없음</span>' : ''}`;
    else if (aiTurn) status = `<span class="bd-dots">AI ${esc(B.levelInfo(bs.ai).name)}가 생각 중</span>`;
    else if (!mine.length) status = `구경 중 · <b>${esc(seatName(bs, turn))}</b> 차례`;
    else status = `<b>${esc(seatName(bs, turn))}</b> 차례를 기다려요`;
    $('#bd-status').innerHTML = status;

    const vctx = Object.assign({ canPlay: myTurn }, (!over && !res && def.viewCtx) ? def.viewCtx(st) : {});
    vctx.hint = H.hint;
    H.view.render(st, vctx);
    if (!myTurn) $('#bd-confirm').classList.remove('show');

    renderActions(bs, { myTurn, over: over || !!res, mine });

    // 끝났는지 알리기 (판을 둔 사람·방장 누구든 먼저 보낸 게 인정돼요)
    if (!over && res && H.endSent !== bs.moves.length && bs.moves.length === moves.length && (mine.length || isHost())) {
      H.endSent = bs.moves.length;
      App.send({ t: 'bend', n: bs.moves.length, winner: res.winner, reason: 'rule' });
    }
    // AI 차례 (방장 기기가 계산)
    if (aiTurn && isHost() && H.aiFor !== bs.moves.length) runAI(bs);
    if (over) renderResult(bs);
    else $('#bd-result').className = 'bd-result';
  }

  function renderActions(bs, o) {
    const box = $('#bd-actions');
    if (o.over) { box.innerHTML = ''; return; }
    const btns = [];
    if (bs.vs === 'ai' && o.mine.length) {
      btns.push(`<button type="button" class="btn btn-ghost" data-bact="undo" ${bs.moves.some((m) => o.mine.includes(m.s)) ? '' : 'disabled'}>↶ 무르기</button>`);
      btns.push(`<button type="button" class="btn btn-ghost${H.hintArm ? ' arm' : ''}" data-bact="hint" ${o.myTurn ? '' : 'disabled'}>${H.hintArm ? '한 번 더 → 힌트' : '💡 힌트'}</button>`);
    }
    if (o.mine.length) btns.push('<button type="button" class="btn btn-ghost" data-bact="resign">🏳 기권</button>');
    if (isHost()) btns.push('<button type="button" class="btn btn-ghost" data-bact="lobby">대기실로</button>');
    box.innerHTML = btns.join('');
  }

  function renderResult(bs) {
    const r = bs.result || {};
    const key = `${H.sessKey}|${r.at}`;
    const box = $('#bd-result');
    const mine = mySeats(bs);
    const iWon = mine.includes(r.winner);
    const iLost = mine.length && r.winner >= 0 && !iWon;
    let title;
    if (r.winner < 0) title = '무승부!';
    else if (iWon) title = '이겼어요!';
    else title = `${esc(seatName(bs, r.winner))} 승리!`;
    const sub = r.reason === 'resign' ? '기권으로 끝났어요' : '';
    let rec = '';
    if (r.rec) {
      const p = seatPerson(r.rec.pid);
      if (r.rec.pid === S.pid) {
        window.Records && window.Records.addMine({ board: r.rec.board, rank: r.rec.rank, id: r.rec.id, name: p ? p.name : '', comment: '' });
        rec = `<div class="rr me"><span class="rr-txt">🏆 <b>${App.fmtNum(r.score)}점</b><br>이번 주 <b class="hl">${r.rec.rank}위</b> 기록!</span><button type="button" class="rr-btn" data-rec="${r.rec.id}">한마디 남기기</button></div>`;
      } else rec = `<div class="rr"><span class="rr-txt">🏆 ${esc(p ? p.name : '')}님 이번 주 Top 10 <b class="hl">${r.rec.rank}위</b>!</span></div>`;
    } else if (bs.vs === 'ai' && iWon && (bs.undos || bs.hints)) {
      rec = '<div class="rr"><span class="rr-txt">무르기·힌트를 써서 이번 판은 기록에 안 남아요</span></div>';
    } else if (bs.vs === 'ai' && iWon && !r.rec) {
      rec = `<div class="rr"><span class="rr-txt">${App.fmtNum(r.score || 0)}점 · 이번 주 Top 10 에는 못 들었어요</span></div>`;
    }
    const host = isHost();
    const learn = H.def.learn ? `<p class="bd-learn">${esc(H.def.learn)}</p>` : '';
    box.innerHTML = `<div class="bd-r-card">
      <div class="bd-r-emoji">${iWon ? '🎉' : iLost ? '😢' : '🏁'}</div>
      <h2 class="disp">${title}</h2>${sub ? `<div class="hint-md">${sub}</div>` : ''}
      ${rec}${learn}
      <div class="bd-r-btns">
        ${host ? '<button type="button" class="btn btn-yellow" data-bact="rematch">한 판 더! (흑백 바꿔서)</button>' : '<div class="hint-md">방장이 한 판 더 할 수 있어요</div>'}
        <div class="bd-r-row">
          <button type="button" class="btn btn-ghost" data-bact="review">판 보기</button>
          ${host ? '<button type="button" class="btn btn-ghost" data-bact="lobby">대기실로</button>' : '<button type="button" class="btn btn-ghost btn-records">🏆 기록실</button>'}
        </div>
      </div></div>`;
    box.className = 'bd-result show';
    if (H.lastResultKey !== key) {
      H.lastResultKey = key;
      if (iWon) { App.confetti && App.confetti('bd-confetti', 60, true); SND.SFX.fanfare && SND.SFX.fanfare(); SND.vibrate([60, 40, 120]); }
      else if (iLost) { SND.SFX.end && SND.SFX.end(); }
      else SND.SFX.victory && SND.SFX.victory();
    }
  }

  /* ---------- 수 두기 ---------- */
  function playMove(m) {
    const bs = sess();
    if (!bs || bs.status !== 'play' || H.pending) return;
    const st = H.def.replay(curMoves(bs), bs);
    if (!H.def.legal(st, m)) { App.toast('거기는 둘 수 없어요'); return; }
    H.hint = -1; H.hintArm = false;
    const after = H.def.replay(curMoves(bs).concat([m]), bs);
    const n = bs.moves.length;
    H.pending = { n, m };
    App.send({ t: 'bmove', n, m, next: H.def.turnSeat(after) });
    SND.SFX.pop && SND.SFX.pop();
    SND.vibrate(15);
    render();
    setTimeout(() => { if (H.pending && H.pending.n === n) { H.pending = null; render(); } }, 4000);
  }

  function runAI(bs) {
    const n = bs.moves.length;
    H.aiFor = n;
    const moves = bs.moves.map((x) => x.m);
    const minMs = (H.def.aiMinMs || [])[bs.ai] || 500;
    B.think(bs.game, moves, bs.ai, {}, minMs).then((m) => {
      const cur = sess();
      if (!cur || cur.status !== 'play' || cur.moves.length !== n || H.sessKey.indexOf(`${cur.game}#${cur.round}`) !== 0) return;
      const after = H.def.replay(moves.concat([m]), cur);
      App.send({ t: 'bmove', n, m, next: H.def.turnSeat(after) });
      SND.SFX.pop && SND.SFX.pop();
    }).catch((err) => {
      console.error(err);
      H.aiFor = -1;
      App.toast('AI 가 잠깐 멈췄어요. 다시 시도할게요');
      setTimeout(render, 800);
    });
  }

  function onAction(act) {
    const bs = sess();
    if (H.guide) { onGuideAction(act); return; }
    if (!bs) return;
    const mine = mySeats(bs);
    SND.SFX.click();
    if (act === 'undo') {
      // 내가 마지막으로 둔 수 앞까지 되돌려요
      let k = -1;
      for (let i = bs.moves.length - 1; i >= 0; i--) if (mine.includes(bs.moves[i].s)) { k = i; break; }
      if (k < 0) return;
      H.pending = null;
      App.send({ t: 'bundo', to: k, turn: bs.moves[k].s });
    } else if (act === 'hint') {
      if (!H.hintArm) { H.hintArm = true; App.toast('힌트를 쓰면 이번 판은 기록에 안 남아요. 한 번 더 누르면 보여줘요', 2600); render(); return; }
      H.hintArm = false;
      App.send({ t: 'bhint' });
      const moves = bs.moves.map((x) => x.m);
      $('#bd-status').innerHTML = '<span class="bd-dots">좋은 자리를 찾는 중</span>';
      B.think(bs.game, moves, 4, { ms: 600 }, 300).then((m) => { H.hint = m; render(); });
    } else if (act === 'resign') {
      if (!confirmTwice('resign')) { App.toast('한 번 더 누르면 기권해요'); return; }
      App.send({ t: 'bresign' });
    } else if (act === 'lobby') {
      App.send({ t: 'again' });
    } else if (act === 'rematch') {
      App.send({ t: 'brematch' });
    } else if (act === 'review') {
      $('#bd-result').classList.remove('show');
      $('#bd-result').classList.add('mini');
    }
  }
  let armed = '';
  let armT = 0;
  function confirmTwice(k) {
    const now = Date.now();
    if (armed === k && now - armT < 2500) { armed = ''; return true; }
    armed = k; armT = now;
    return false;
  }

  /* ================================================================
     따라하기 (혼자, 서버 없이)
     ================================================================ */
  function openGuide(gid) {
    const def = B.get(gid);
    const lessons = B.guides[gid];
    if (!def || !lessons) return;
    H.prevScreen = (document.querySelector('.screen.active') || {}).id || 's-lobby';
    H.guide = { gid, def, lessons, li: 0, si: 0, st: null, done: false };
    H.sessKey = '';
    if (H.view) H.view.destroy();
    H.view = def.mount($('#bd-stage'), viewApi());
    $('#bd-title').innerHTML = `${def.icon || ''}<span>${esc(def.name)} 따라하기</span>`;
    $('#bd-guide-btn').style.display = 'none';
    $('#bd-result').className = 'bd-result';
    App.showScreen('s-board');
    startLesson(0);
  }

  function guideState(lesson) {
    const R = window.BoardRules[H.guide.gid];
    const st = R.init();
    const N = R.N;
    (lesson.setup.black || []).forEach(([x, y]) => { st.cells[y * N + x] = 1; });
    (lesson.setup.white || []).forEach(([x, y]) => { st.cells[y * N + x] = 2; });
    st.turn = lesson.setup.turn === 'white' ? 2 : 1;
    return st;
  }

  function startLesson(li) {
    const g = H.guide;
    g.li = li; g.si = 0; g.done = false;
    g.st = guideState(g.lessons[li]);
    g.msg = '';
    renderGuide();
  }

  function expectList(step) {
    const g = H.guide;
    const R = window.BoardRules[g.gid];
    const N = R.N;
    if (step.expect === 'five') {
      const out = [];
      for (let i = 0; i < N * N; i++) {
        if (g.st.cells[i]) continue;
        g.st.cells[i] = g.st.turn;
        if (R.isFiveAt(g.st.cells, i % N, (i / N) | 0, g.st.turn)) out.push(i);
        g.st.cells[i] = 0;
      }
      return out;
    }
    if (step.expect === 'any') return null;
    return step.expect.map(([x, y]) => y * N + x);
  }

  function renderGuide() {
    const g = H.guide;
    const lesson = g.lessons[g.li];
    const step = lesson.steps[g.si];
    const R = window.BoardRules[g.gid];
    $('#bd-seats').innerHTML = `<div class="gd-steps">${g.lessons.map((l, i) => `<button type="button" data-glesson="${i}" class="${i === g.li ? 'on' : i < g.li ? 'done' : ''}">${i + 1}</button>`).join('')}</div>`;
    $('#bd-status').innerHTML = `<b>${esc(lesson.title)}</b>`;
    const exp = step && !g.done ? expectList(step) : [];
    const targets = step && !g.done && step.show && exp ? exp : [];
    const vctx = { canPlay: !g.done, forbidden: g.done ? [] : R.forbiddenList(g.st), targets };
    H.view.render(g.st, vctx);
    const isLast = g.li === g.lessons.length - 1;
    const text = g.done ? (lesson.steps[lesson.steps.length - 1].done || '') : (g.msg || (step ? step.say : ''));
    $('#bd-actions').innerHTML = `<div class="gd-box">
      <div class="gd-say">${g.done ? '✅ ' : '👉 '}${text}</div>
      <div class="gd-btns">
        <button type="button" class="btn btn-ghost" data-bact="g-retry">다시</button>
        ${g.done ? `<button type="button" class="btn btn-yellow" data-bact="${isLast ? 'g-exit' : 'g-next'}">${isLast ? '다 배웠어요!' : '다음 →'}</button>` : ''}
        <button type="button" class="btn btn-ghost" data-bact="g-exit">나가기</button>
      </div></div>`;
  }

  function guidePick(m) {
    const g = H.guide;
    if (!g || g.done) return;
    const lesson = g.lessons[g.li];
    const step = lesson.steps[g.si];
    const R = window.BoardRules[g.gid];
    const exp = expectList(step);
    if (exp && !exp.includes(m)) {
      g.msg = step.wrong || '노란 동그라미 자리를 눌러 보세요!';
      SND.SFX.bad && SND.SFX.bad();
      renderGuide();
      return;
    }
    const r = R.play(g.st, m);
    if (!r.ok) { g.msg = r.reason === '33' ? '3·3 이라 둘 수 없어요!' : '거기는 둘 수 없어요'; renderGuide(); return; }
    SND.SFX.pop && SND.SFX.pop();
    // 상대(스크립트) 응수
    if (step.reply && !g.st.over) {
      let rm = -1;
      if (step.reply === 'blockFour') {
        const N = R.N;
        for (let i = 0; i < N * N && rm < 0; i++) {
          if (g.st.cells[i]) continue;
          g.st.cells[i] = 3 - g.st.turn;
          if (R.isFiveAt(g.st.cells, i % N, (i / N) | 0, 3 - g.st.turn)) rm = i;
          g.st.cells[i] = 0;
        }
      } else rm = step.reply[1] * R.N + step.reply[0];
      if (rm >= 0) setTimeout(() => { R.play(g.st, rm); SND.SFX.pop && SND.SFX.pop(); renderGuide(); }, 550);
    }
    const last = g.si === lesson.steps.length - 1;
    g.msg = step.done || '';
    if (last) {
      g.done = true;
      setTimeout(() => { SND.SFX.fanfare && SND.SFX.fanfare(); App.confetti && App.confetti('bd-confetti', 40, true); }, 300);
    } else {
      g.si++;
      const nextSay = lesson.steps[g.si].say;
      g.msg = `${step.done ? step.done + '<br>' : ''}${nextSay}`;
    }
    renderGuide();
  }

  function onGuideAction(act) {
    const g = H.guide;
    SND.SFX.click();
    if (act === 'g-retry') startLesson(g.li);
    else if (act === 'g-next') startLesson(Math.min(g.lessons.length - 1, g.li + 1));
    else if (act === 'g-exit') {
      H.guide = null;
      if (H.view) { H.view.destroy(); H.view = null; }
      H.sessKey = '';
      const room = S.room;
      if (room && room.phase === 'board') { render(); App.showScreen('s-board'); } else App.showScreen(room ? 's-lobby' : 's-home');
    }
  }

  /* ================================================================
     연결
     ================================================================ */
  function onState(room, changed) {
    if (room.phase === 'board') {
      if (H.guide) return;
      const active = document.querySelector('.screen.active');
      if (changed || !active || (active.id !== 's-board' && active.id !== 's-records')) App.showScreen('s-board');
      if (H.pending && room.bsess && room.bsess.moves.length > H.pending.n) H.pending = null;
      render();
      App.wakeLock && App.wakeLock(true);
    } else if (H.view && !H.guide) {
      H.view.destroy(); H.view = null; H.sessKey = '';
    }
  }

  function onMessage(msg) {
    if (msg.t === 'bsync') { H.pending = null; render(); }
  }

  function setup() {
    $('#board-panel').addEventListener('click', onLobbyClick);
    $('#bd-actions').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bact]');
      if (b && !b.disabled) onAction(b.dataset.bact);
    });
    $('#bd-result').addEventListener('click', (e) => {
      const b = e.target.closest('[data-bact]');
      if (b) onAction(b.dataset.bact);
    });
    $('#bd-seats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-glesson]');
      if (b && H.guide) { SND.SFX.click(); startLesson(Number(b.dataset.glesson)); }
    });
    $('#bd-guide-btn').addEventListener('click', () => { const bs = sess(); if (bs) { SND.SFX.click(); openGuide(bs.game); } });
    $('#bd-confirm').addEventListener('click', (e) => {
      if (e.target.closest('[data-bconfirm]') && H.view) H.view.commit();
      if (e.target.closest('[data-bcancel]') && H.view) H.view.clear();
    });
    App.hooks.state.push(onState);
    App.hooks.message.push(onMessage);
  }

  window.BoardHall = { renderLobby, lobbyMain, openGuide, H };
  setup();
})();
