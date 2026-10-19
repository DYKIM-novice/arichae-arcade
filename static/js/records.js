/* 아리채 오락실 · 기록실
   - 게임별 이번 주 Top 10 + 명예의 전당(매주 1위 영구 보관)
   - 기록을 세운 사람은 이름(아이디)과 한마디(놀리기 OK, 욕설은 서버가 ♡ 로 바꿔요)를 남길 수 있어요
   - 매주 일요일 밤 12시(한국 시간)에 Top 10 초기화 */
(function () {
  'use strict';

  const App = window.App;
  const { $, esc, S, G, A, SND } = App;

  const CATS = [
    { k: 'arcade', name: '오락실' },
    { k: 'edu', name: '과학관' },
    { k: 'music', name: '음악관' },
    { k: 'board', name: '보드게임' }
  ];
  const LV_SHORT = { e: '초등', m: '중등', h: '고등' };
  const MLV = { e: '하', m: '중', h: '상', x: '특상' };
  const TROPHY = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/><path d="M12 14v3M8 21h8M9 17h6v4H9z"/></svg>';
  const MEDAL = ['#FFD23F', '#C9C3E6', '#FF8A3D'];

  const R = {
    data: null,
    tab: 'week',
    cat: 'arcade',
    game: '*',       // '*' = 이 관 전체 1위 모아 보기
    sub: '',         // 과학관 난이도
    back: 's-home',
    mine: [],        // 이번 접속에서 내가 세운 기록 [{board, rank, id, name, comment}]
    editing: null
  };

  /* ---------------- 기록판 이름 ---------------- */
  function metaList(group) {
    return (G.MANIFEST && G.MANIFEST.games && G.MANIFEST.games[group]) || [];
  }
  function catOf(board) {
    if (board.startsWith('music:')) return 'music';
    const id = board.split(':')[0];
    const m = G.META && G.META[id];
    return m ? (m.group === 'edu' ? 'edu' : m.group) : 'arcade';
  }
  // 지금은 빠진 게임 (명예의 전당에 남은 옛 기록 이름)
  const RETIRED = { hex: '헥스', umul: '우물고누', hobak: '호박고누' };
  function boardName(board) {
    if (board.startsWith('music:')) {
      const sg = (G.MUSIC_SONGS || []).find((s) => s.id === board.slice(6));
      return sg ? `${sg.title} · ${sg.composer}` : '오르골 연주회';
    }
    const [id, lv] = board.split(':');
    const m = G.META && G.META[id];
    const nm = m ? m.name : (RETIRED[id] || id);
    return lv ? `${nm} · ${LV_SHORT[lv] || lv}` : nm;
  }
  // 한 관(카테고리)의 기록판 목록 (기록이 없어도 보여줘요)
  function boardsOf(cat) {
    if (cat === 'music') return (G.MUSIC_SONGS || []).map((s) => ({ key: 'music:' + s.id, name: s.title, sub: s.composer }));
    if (cat === 'edu') {
      return metaList('edu').filter((m) => m.pick !== false).map((m) => {
        const def = G.get(m.id);
        return { key: m.id, name: m.name, levels: ((def && def.levels) || ['m']).filter((l) => LV_SHORT[l]) };
      });
    }
    return metaList(cat).map((m) => ({ key: m.id, name: m.name }));
  }

  /* ---------------- 화면 ---------------- */
  async function load() {
    try {
      const r = await fetch('/api/records', { cache: 'no-store' });
      R.data = await r.json();
    } catch (e) {
      R.data = R.data || { boards: {}, hall: [], resetAt: 0 };
    }
  }

  async function open(opts) {
    const cur = document.querySelector('.screen.active');
    R.back = cur && cur.id !== 's-records' ? cur.id : R.back;
    if (opts && opts.board) {
      R.cat = catOf(opts.board);
      const parts = opts.board.split(':');
      R.game = R.cat === 'music' ? opts.board : parts[0];
      R.sub = R.cat === 'edu' ? (parts[1] || 'm') : '';
    }
    if (opts && opts.tab) R.tab = opts.tab;
    App.showScreen('s-records');
    $('#rec-list').innerHTML = '<div class="rec-empty">기록을 불러오는 중…</div>';
    await load();
    render();
  }

  function close() {
    const room = S.room;
    // 그 사이에 게임 화면이 바뀌었으면 지금 화면으로
    let target = R.back;
    if (room) {
      const phaseScreen = { lobby: 's-lobby', intro: 's-intro', play: 's-play', result: 's-result', final: 's-final', board: 's-board' }[room.phase];
      if (phaseScreen) target = phaseScreen;
    } else target = 's-home';
    App.showScreen(target);
  }

  function countdown() {
    const left = Math.max(0, (R.data && R.data.resetAt ? R.data.resetAt : 0) - Date.now());
    const d = Math.floor(left / 86400000);
    const h = Math.floor((left % 86400000) / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    return d > 0 ? `${d}일 ${h}시간` : h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  }

  function fmtDate(ms) {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} (${'일월화수목금토'[d.getDay()]})`;
  }

  function entryRow(e, rank, opts) {
    const o = opts || {};
    const mine = R.mine.some((m) => m.id === e.id);
    const medal = rank <= 3 ? `style="--mc:${MEDAL[rank - 1]}"` : '';
    const lvTag = e.detail && MLV[e.detail] ? `<span class="rec-lv">${MLV[e.detail]}</span>` : '';
    const where = o.board ? `<span class="rec-where">${esc(boardName(o.board))}</span>` : '';
    const when = o.week ? `<span class="rec-when">${esc(o.week)}</span>` : `<span class="rec-when">${fmtDate(e.at)}</span>`;
    return `<div class="rec-row${rank <= 3 ? ' top' : ''}${mine ? ' mine' : ''}" ${medal}>
      <span class="rec-rk">${rank}</span>
      <div class="av">${A.svg(e.animal || 'rabbit')}</div>
      <div class="rec-who">
        <div class="rec-nm">${esc(e.name)}${lvTag}${mine ? '<span class="tag me">나</span>' : ''}${mine && !o.week ? `<button type="button" class="rec-edit" data-edit="${e.id}" aria-label="한마디 고치기">✏️</button>` : ''}</div>
        ${where}
        ${e.comment ? `<div class="rec-cm">“${esc(e.comment)}”</div>` : ''}
      </div>
      <div class="rec-sc"><b class="disp">${App.fmtNum(e.score)}</b>${when}</div>
    </div>`;
  }

  function render() {
    const data = R.data || { boards: {}, hall: [] };
    $('#rec-reset').textContent = R.tab === 'week' ? `초기화까지 ${countdown()}` : '매주 1위 영구 보관';
    document.querySelectorAll('#rec-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === R.tab));
    $('#rec-cats').innerHTML = CATS.map((c) => `<button type="button" data-cat="${c.k}" class="${R.cat === c.k ? 'on' : ''}">${c.name}</button>`).join('');

    const list = boardsOf(R.cat);
    const games = [{ key: '*', name: R.tab === 'week' ? '이번 주 1위 모음' : '전체' }].concat(list);
    if (!games.some((g) => g.key === R.game)) R.game = '*';
    $('#rec-games').innerHTML = games.map((g) => {
      const has = g.key === '*' ? '' : hasRecords(g.key) ? ' has' : '';
      return `<button type="button" data-game="${g.key}" class="${R.game === g.key ? 'on' : ''}${has}">${esc(g.name)}</button>`;
    }).join('');
    const sel = list.find((g) => g.key === R.game);
    const subs = sel && sel.levels && sel.levels.length > 1 ? sel.levels : null;
    if (subs && !subs.includes(R.sub)) R.sub = subs.includes('m') ? 'm' : subs[0];
    $('#rec-subs').innerHTML = subs ? subs.map((l) => `<button type="button" data-sub="${l}" class="${R.sub === l ? 'on' : ''}">${LV_SHORT[l]}</button>`).join('') : '';
    $('#rec-subs').style.display = subs ? '' : 'none';

    let html = '';
    if (R.game === '*') {
      if (R.tab === 'week') {
        const champs = [];
        list.forEach((g) => {
          const keys = g.levels && R.cat === 'edu' ? g.levels.map((l) => `${g.key}:${l}`) : [g.key];
          keys.forEach((k) => { const rows = data.boards[k]; if (rows && rows[0]) champs.push([k, rows[0]]); });
        });
        html = champs.length
          ? `<div class="rec-cap">이번 주 게임별 1위 — 일요일 밤 12시에 명예의 전당으로!</div>` + champs.map(([k, e]) => entryRow(e, 1, { board: k })).join('')
          : emptyHTML();
      } else {
        const rows = data.hall.filter((e) => catOf(e.board) === R.cat).slice().reverse();
        html = rows.length ? rows.map((e) => entryRow(e, 1, { board: e.board, week: e.weekLabel })).join('') : hallEmptyHTML();
      }
    } else {
      const key = R.cat === 'edu' ? `${R.game}:${R.sub || 'm'}` : R.game;
      if (R.tab === 'week') {
        const rows = data.boards[key] || [];
        html = rows.length ? rows.map((e, i) => entryRow(e, i + 1)).join('') : emptyHTML();
      } else {
        const rows = data.hall.filter((e) => e.board === key).slice().reverse();
        html = rows.length ? rows.map((e) => entryRow(e, 1, { week: e.weekLabel })).join('') : hallEmptyHTML();
      }
    }
    $('#rec-list').innerHTML = html;
  }

  function hasRecords(key) {
    const b = (R.data && R.data.boards) || {};
    return Object.keys(b).some((k) => k === key || k.startsWith(key + ':'));
  }
  function emptyHTML() {
    return '<div class="rec-empty"><b class="disp">아직 기록이 없어요</b><span>이번 주 첫 번째 주인공이 되어 보세요!</span></div>';
  }
  function hallEmptyHTML() {
    return '<div class="rec-empty"><b class="disp">명예의 전당이 비어 있어요</b><span>매주 일요일 밤 12시, 게임별 1위가 여기에 영원히 남아요</span></div>';
  }

  /* ---------------- 이름 · 한마디 남기기 ---------------- */
  function openEdit(rec) {
    R.editing = rec;
    const prof = (S.profile && S.profile.name) || '';
    $('#rec-m-title').innerHTML = `🏆 <b>${esc(boardName(rec.board))}</b><br>이번 주 <b class="hl">${rec.rank}위</b> 기록!`;
    $('#rec-m-name').value = rec.name || prof;
    $('#rec-m-cm').value = rec.comment || '';
    $('#rec-m-count').textContent = `${$('#rec-m-cm').value.length}/40`;
    $('#rec-modal').classList.add('show');
    $('#rec-modal').setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#rec-m-cm').focus(), 250);
  }
  function closeEdit() {
    $('#rec-modal').classList.remove('show');
    $('#rec-modal').setAttribute('aria-hidden', 'true');
    R.editing = null;
  }
  function saveEdit() {
    const rec = R.editing;
    if (!rec) return;
    const name = $('#rec-m-name').value.trim();
    const comment = $('#rec-m-cm').value.trim();
    rec.name = name || rec.name;
    rec.comment = comment;
    App.send({ t: 'record_edit', id: rec.id, name: rec.name, comment });
    SND.SFX.click();
    closeEdit();
  }

  const TAUNTS = ['이 점수 깨면 인정!', '메롱~ 따라와 봐', '아직 몸 푸는 중이었음', '1등 자리 비켜줄 생각 없음', '다음 주에도 내 거야'];

  /* ---------------- 결과 화면 · 최종 화면 ---------------- */
  // 이번 판 결과에서 Top 10 에 든 사람들 알려주기
  function onResult(res) {
    const box = $('#result-rec');
    if (!box) return;
    const rows = (res && res.rows) || [];
    const recs = rows.filter((r) => r.rec);
    if (!recs.length) { box.innerHTML = ''; box.classList.remove('show'); return; }
    recs.forEach((r) => {
      if (r.pid === S.pid && !R.mine.some((m) => m.id === r.rec.id)) {
        const p = App.me();
        R.mine.push(Object.assign({ name: p ? p.name : '', comment: '', t: Date.now() }, r.rec));
      }
    });
    box.innerHTML = recs.map((r) => {
      const p = App.playerById(r.pid) || { name: '?', animal: 'rabbit' };
      const isMe = r.pid === S.pid;
      return `<div class="rr${isMe ? ' me' : ''}">
        <span class="rr-ic">${TROPHY}</span>
        <span class="rr-txt">${isMe ? '<b>내 기록</b>' : `<b>${esc(p.name)}</b>님`} 이번 주 Top 10 <b class="hl">${r.rec.rank}위</b>${r.rec.rank === 1 ? ' 👑' : ''}</span>
        ${isMe ? `<button type="button" class="rr-btn" data-rec="${r.rec.id}">한마디 남기기</button>` : ''}
      </div>`;
    }).join('');
    box.classList.add('show');
    if (recs.some((r) => r.pid === S.pid)) setTimeout(() => SND.SFX.fanfare && SND.SFX.fanfare(), 900);
  }

  function onFinal() {
    const box = $('#final-recs');
    if (!box) return;
    const recent = R.mine.filter((m) => Date.now() - (m.t || Date.now()) < 25 * 60000);
    if (!recent.length) { box.innerHTML = ''; box.classList.remove('show'); return; }
    box.innerHTML = `<div class="list-head"><span>🏆 이번 판에 세운 내 기록</span><span class="hint-sm">이름·한마디를 남겨요</span></div>`
      + recent.map((m) => `<div class="fr-row">
        <div class="fr-txt"><b>${esc(boardName(m.board))}</b><span>이번 주 ${m.rank}위 · ${m.comment ? '“' + esc(m.comment) + '”' : '한마디 없음'}</span></div>
        <button type="button" class="rr-btn" data-rec="${m.id}">${m.comment ? '고치기' : '남기기'}</button></div>`).join('');
    box.classList.add('show');
  }

  // 보드게임 등 다른 곳에서 기록이 생겼을 때
  function addMine(rec) {
    if (!rec || R.mine.some((m) => m.id === rec.id)) return;
    R.mine.push(Object.assign({ t: Date.now() }, rec));
  }

  function onMessage(msg) {
    if (msg.t === 'record_saved') {
      if (msg.ok && msg.entry) {
        const m = R.mine.find((x) => x.id === msg.entry.id);
        if (m) { m.name = msg.entry.name; m.comment = msg.entry.comment; }
        App.toast(msg.entry.comment && msg.entry.comment.includes('♡') ? '저장했어요 (나쁜 말은 ♡로 바꿨어요)' : '기록실에 남겼어요!');
        if ($('#s-records').classList.contains('active')) { load().then(render); }
        onFinal();
      } else App.toast('기록을 고칠 수 있는 시간이 지났어요');
    }
  }

  /* ---------------- 연결 ---------------- */
  function setup() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      const recBtn = t.closest('[data-rec]');
      if (recBtn) {
        const m = R.mine.find((x) => x.id === recBtn.dataset.rec);
        if (m) openEdit(m);
        return;
      }
      if (t.closest('.btn-records')) { SND.SFX.click(); open(); return; }
    });
    $('#rec-back').addEventListener('click', () => { SND.SFX.click(); close(); });
    $('#rec-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      R.tab = b.dataset.tab;
      SND.SFX.click();
      render();
    });
    $('#rec-cats').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-cat]');
      if (!b) return;
      R.cat = b.dataset.cat; R.game = '*'; R.sub = '';
      SND.SFX.click();
      render();
    });
    $('#rec-games').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-game]');
      if (!b) return;
      R.game = b.dataset.game;
      SND.SFX.click();
      render();
    });
    $('#rec-subs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sub]');
      if (!b) return;
      R.sub = b.dataset.sub;
      render();
    });
    $('#rec-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-edit]');
      if (!b) return;
      const id = b.dataset.edit;
      let m = R.mine.find((x) => x.id === id);
      if (m) openEdit(m);
    });
    $('#rec-m-save').addEventListener('click', saveEdit);
    $('#rec-m-cancel').addEventListener('click', closeEdit);
    $('#rec-m-cm').addEventListener('input', () => { $('#rec-m-count').textContent = `${$('#rec-m-cm').value.length}/40`; });
    $('#rec-m-taunts').innerHTML = TAUNTS.map((t) => `<button type="button" data-taunt="${esc(t)}">${esc(t)}</button>`).join('');
    $('#rec-m-taunts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-taunt]');
      if (b) { $('#rec-m-cm').value = b.dataset.taunt; $('#rec-m-count').textContent = `${b.dataset.taunt.length}/40`; }
    });
    App.hooks.message.push(onMessage);
    App.hooks.result.push(onResult);
    App.hooks.final.push(onFinal);
    setInterval(() => { if ($('#s-records').classList.contains('active') && R.tab === 'week') $('#rec-reset').textContent = `초기화까지 ${countdown()}`; }, 30000);
  }

  window.Records = { open, boardName, addMine, R };
  setup();
})();
