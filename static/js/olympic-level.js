/* 아리채 오락실 · 올림픽관 '레벨업' (가입 없이 기기마다)
   - 서버가 기기 번호(dev)로 XP·레벨을 기억해요 (profiles.json). 여기는 화면만:
     · 대기실: 내 레벨 카드(다음 레벨까지 막대) · 방장이 고르는 입장 등급(전체·이지·노멀·하드·헬) · 방 코드 카드에 등급 표시
     · 결과 화면: 이번 종목 XP (+참가 · 순위 · 메달 · 개인 기록) · 레벨 업 축하
     · 혼자 연습: 서버가 돌려준 작은 XP (하루 한도) 를 결과 판에 보여줘요
   - 등급: 이지 Lv1~9 · 노멀 Lv10~19 · 하드 Lv20~29 · 헬 Lv30~ */
(function () {
  'use strict';

  const App = window.App;
  if (!App) return;
  const { $, esc, S, SND } = App;

  const TIERS = [
    { k: 'all', name: '전체', sub: '누구나' },
    { k: 'easy', name: '이지', sub: 'Lv1~9', a: 1, b: 9 },
    { k: 'normal', name: '노멀', sub: 'Lv10~19', a: 10, b: 19 },
    { k: 'hard', name: '하드', sub: 'Lv20~29', a: 20, b: 29 },
    { k: 'hell', name: '헬', sub: 'Lv30~', a: 30, b: 999 }
  ];
  const TIER = {};
  TIERS.forEach((t) => { TIER[t.k] = t; });
  const tierOf = (room) => { const t = room && room.oly && room.oly.tier; return TIER[t] ? t : 'all'; };
  const tierLabel = (k) => (k === 'all' ? '전체' : `${TIER[k].name}(${TIER[k].sub})`);
  // 초대 글·코드 카드에 붙는 말
  function tierNote(room) { const k = tierOf(room); return k === 'all' ? '' : `올림픽 ${tierLabel(k)} 방`; }
  const FLAME = '<svg class="olv-flame" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 1 C12 6 17 8 17 14 A7 7 0 0 1 3 14 C3 10 6 9 6 5 C8 7 9 8 9 10 C10 7 10 4 10 1 Z" fill="#FF8A3D"/><path d="M10 10 C11 13 13 14 13 16.5 A3 3 0 0 1 7 16.5 C7 14.5 9 13.5 10 10 Z" fill="#FFE27A"/></svg>';

  /* ---------- 대기실: 내 레벨 카드 · 입장 등급 ---------- */
  function panelBox() {
    let box = $('#olv-panel');
    if (!box) {
      box = document.createElement('div');
      box.id = 'olv-panel';
      const panel = $('#olympic-panel');
      if (!panel) return null;
      panel.insertBefore(box, panel.firstChild);
    }
    return box;
  }
  function renderPanel(isHost) {
    const room = S.room;
    const box = panelBox();
    if (!room || !box) return;
    const m = App.me() || {};
    const lv = Math.max(1, m.lv || 1);
    const xp = Array.isArray(m.xp) ? m.xp : [0, 60];
    const t = App.tierOfLv(lv);
    const pct = Math.max(0, Math.min(100, Math.round(xp[0] / Math.max(1, xp[1]) * 100)));
    const cur = tierOf(room);
    const dis = isHost ? '' : 'disabled';
    const html = `<div class="olv-me olv-c-${t}">
        <span class="olv-big disp">Lv<b>${lv}</b></span>
        <div class="olv-mid"><div class="olv-row"><b>내 올림픽 레벨</b><span class="olv-tn olv-${t}">${TIER[t].name} 등급${t === 'hell' ? FLAME : ''}</span></div>
          <div class="olv-bar"><i style="transform:scaleX(${(pct / 100).toFixed(3)})"></i></div>
          <span class="olv-sub">다음 레벨까지 <b>${Math.max(0, xp[1] - xp[0])} XP</b> · 경기·메달·내 기록으로 쌓여요</span></div></div>
      <div class="list-head sub"><span>입장 등급</span><span class="hint-sm">${isHost ? '이 레벨만 새로 들어올 수 있어요' : '방장이 정해요'}</span></div>
      <div class="olv-tiers">${TIERS.map((x) => `<button type="button" data-otier="${x.k}" class="olv-tb olv-t-${x.k}${cur === x.k ? ' on' : ''}" ${dis} aria-pressed="${cur === x.k}"><b class="disp">${x.name}${x.k === 'hell' ? FLAME : ''}</b><span>${x.sub}</span></button>`).join('')}</div>`;
    if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
  }
  // 방 코드 카드에 등급 표시
  function renderCodeTag() {
    const room = S.room;
    const card = document.querySelector('#s-lobby .code-card');
    if (!card || !room) return;
    let tag = card.querySelector('.olv-codetag');
    const k = room.mode === 'olympic' ? tierOf(room) : 'all';
    if (k === 'all') { if (tag) tag.remove(); return; }
    if (!tag) { tag = document.createElement('div'); tag.className = 'olv-codetag'; card.firstElementChild.appendChild(tag); }
    const html = `<span class="olv-t-${k}">🏅 ${esc(TIER[k].name)} 방${k === 'hell' ? FLAME : ''}</span><em>${esc(TIER[k].sub)}만 입장</em>`;
    if (tag.innerHTML !== html) tag.innerHTML = html;
  }

  /* ---------- 레벨 업 축하 (화면 가득) ---------- */
  let upT = 0;
  function celebrate(prev, lv) {
    const t0 = App.tierOfLv(prev); const t1 = App.tierOfLv(lv);
    let el = $('#olv-up');
    if (!el) {
      el = document.createElement('div');
      el.id = 'olv-up';
      el.className = 'olv-up';
      el.setAttribute('role', 'dialog');
      document.body.appendChild(el);
      el.addEventListener('click', () => el.classList.remove('show'));
    }
    el.innerHTML = `<div class="olv-up-in olv-c-${t1}"><div class="olv-rays"></div><div class="confetti" id="olv-conf"></div>
      <span class="olv-up-k disp">레벨 업!</span>
      <div class="olv-up-badge disp"><small>Lv</small>${lv}</div>
      <span class="olv-up-from">Lv${prev} → Lv${lv}</span>
      ${t1 !== t0 ? `<div class="olv-up-tier olv-t-${t1}">${TIER[t1].name} 등급이 됐어요!${t1 === 'hell' ? FLAME : ''}<em>이제 ${TIER[t1].name} 방(${TIER[t1].sub})에 들어갈 수 있어요</em></div>` : '<div class="olv-up-msg">계속 달려서 다음 레벨도 가 봐요!</div>'}
      <span class="olv-up-tap">눌러서 닫기</span></div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    try { App.confetti('olv-conf', 60, true); } catch (e) { /* 꽃가루가 안 돼도 괜찮아요 */ }
    if (SND.SFX.levelUp) SND.SFX.levelUp(); else SND.SFX.fanfare();
    SND.vibrate([60, 40, 60, 40, 160]);
    clearTimeout(upT);
    upT = setTimeout(() => el.classList.remove('show'), 4200);
  }

  /* ---------- 결과 화면: 이번 종목 XP ---------- */
  function xpLine(got, mine) {
    const parts = (got.xpParts || got.parts || []).map(([k, v]) => `<span>${esc(k)} <b>+${v}</b></span>`).join('');
    return `<div class="olv-xp${mine ? ' me' : ''}"><b class="olv-xpn disp">+${got.xp != null ? got.xp : got.gained} XP</b><span class="olv-xpp">${parts}</span>${App.lvBadge({ lv: got.lv }, true)}</div>`;
  }
  function onResult(res) {
    const room = S.room;
    if (!room || room.mode !== 'olympic' || !res) return;
    const row = (res.rows || []).find((r) => r.pid === S.pid);
    const box = $('#result-mine');
    if (!row || !box || !row.xp) return;
    box.insertAdjacentHTML('beforeend', xpLine(row, true));
    if (row.lvUp) App.later(3300, () => celebrate(row.lvUp, row.lv));    // 1등 발표가 끝난 뒤에
  }

  /* ---------- 혼자 연습: 서버가 준 XP ---------- */
  function onMessage(msg) {
    if (!msg || msg.t !== 'pxp') return;
    const panel = document.querySelector('.opr-panel');
    if (panel) {
      const old = panel.querySelector('.olv-pxp');
      if (old) old.remove();
      const html = msg.gained
        ? `<div class="olv-pxp">${xpLine(msg, true)}${msg.capped ? '<em>오늘 연습 XP 한도에 닿았어요 · 방 경기로 더 모아요!</em>' : ''}</div>`
        : `<div class="olv-pxp"><em>${msg.left === 0 ? '오늘 연습 XP는 다 모았어요 · 방 경기에서 더 모아요!' : '연습 XP는 한 판씩 천천히 쌓여요'}</em></div>`;
      const at = panel.querySelector('.opr-again');
      if (at) at.insertAdjacentHTML('beforebegin', html);
    }
    if (msg.lvUp) setTimeout(() => celebrate(msg.prev, msg.lv), 900);
  }

  function init() {
    App.hooks.olyPanel.push(renderPanel);
    App.hooks.lobby.push(() => renderCodeTag());
    App.hooks.result.push(onResult);
    App.hooks.message.push(onMessage);
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-otier]');
      if (!b || b.disabled || !S.room) return;
      SND.SFX.click();
      SND.vibrate(10);
      if (S.room.oly) S.room.oly.tier = b.dataset.otier;
      renderPanel(true);
      renderCodeTag();
      App.send({ t: 'settings', otier: b.dataset.otier });
    });
  }
  init();

  window.OlyLevel = { tierNote, tierLabel, celebrate, TIERS };
})();
