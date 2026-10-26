/* 아리채 오락실 · 회귀 RPG 대기실 판 (모드 '모험')
   - 1장 「꽃비 항구와 울음곶」 카드: 내 회귀 기록 (회차·기억 조각·★·기억의 나무) → [1장 모험 시작] = rpg.html (혼자 · 1인칭 색 패링)
   - 방장의 큰 버튼도 같은 페이지를 열어요 (app.js 의 RpgHall.onMain)
   - 같이 모험(game.js · net.js · rpg.py)은 지우지 않고 남겨 뒀어요 (rpg_fp.md 5절: 협동은 나중에 · 대기실에는 혼자 하기만) */
(function () {
  'use strict';

  const App = window.App;
  const O = window.Oly;
  const Sim = window.RpgSim;
  const Meta = window.RpgMeta;
  const D = window.RpgData;
  if (!App || !O || !Sim) return;
  const { $, esc, S, SND } = App;
  const KEY_OPT = 'arichae_rpg_opt';

  function loadOpt() { try { return JSON.parse(localStorage.getItem(KEY_OPT) || '{}') || {}; } catch (e) { return {}; } }
  function saveOpt(o) { try { localStorage.setItem(KEY_OPT, JSON.stringify(o)); } catch (e) { /* 무시 */ } }

  const LOGO = `<svg class="rg-logo-clk" viewBox="-20 -20 40 40" aria-hidden="true"><circle r="17" fill="#FFF6D6" stroke="#C99A00" stroke-width="3"/><path d="M0 0 V-10" stroke="#2A2340" stroke-width="3" stroke-linecap="round"/><path d="M0 0 L-7 4" stroke="#FF4757" stroke-width="3" stroke-linecap="round"/><path d="M-19 -4 A19 19 0 0 1 4 -19" fill="none" stroke="#FFD23F" stroke-width="3"/><path d="M-21 -10 L-19 -3 L-12 -6" fill="none" stroke="#FFD23F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  // 1장 「꽃비 항구와 울음곶」 은 혼자 하는 1인칭 모험 페이지(rpg.html)예요 (rpg_fp.md 5절: 같이 모험은 나중에 · 대기실에는 혼자 하기만)
  function chapterUrl() { return (window.RpgArt ? window.RpgArt.root : 'static/') + 'rpg.html'; }
  function openChapter() { location.href = chapterUrl(); }
  // 별나침반 최대 콤보 명예의 전당 (rpg.html 위에 열려요 · combo.js) · 내 최고 콤보는 이 기기 저장(arichae_rpg_combo)
  function openFame() { location.href = chapterUrl() + '?hall=1'; }
  function myCombo() { try { const v = JSON.parse(localStorage.getItem('arichae_rpg_combo') || 'null'); return (v && v.top && v.top.s1c1) | 0; } catch (e) { return 0; } }

  function renderLobby(isHost) {
    const box = $('#rpg-panel');
    if (!box) return;
    const m = Meta.get();
    const nodes = D.meta.nodes.map((n) => `<span class="rg-lb-node c-${n.c}">${esc(n.name)} ${'●'.repeat(m.nodes[n.id] || 0)}${'○'.repeat(n.max - (m.nodes[n.id] || 0))}</span>`).join('');
    const art = window.RpgArt ? `<img class="rg-ch-bg" src="${esc(window.RpgArt.src('bg_harbor'))}" alt="" draggable="false">` : '';
    box.innerHTML = `
      <div class="rg-lb-hero rg-ch">${art}
        <div class="rg-logo">${LOGO}<div><b class="disp">별나침반</b><span>1장 · 꽃비 항구와 울음곶</span></div></div>
        <div class="rg-lb-rec">
          <div><em>지금</em><b class="disp">${m.loop}회차</b></div>
          <div><em>경험치</em><b class="disp">×${Sim.xpMult(m.loop).toFixed(2)}</b></div>
          <div><em>기억 조각</em><b class="disp">${m.shards}</b></div>
          <div><em>최고</em><b class="disp">${m.clears ? '클리어 ★' + m.stars : m.bestRoom ? (m.bestRoom >= D.rooms.length ? '보스' : m.bestRoom + '번째 방') : '-'}</b></div>
        </div>
        <div class="rg-lb-nodes">${nodes}${m.mem ? `<span class="rg-lb-node mem">기억: ${esc(Sim.cardLabel(m.mem.id, m.mem.lv))}</span>` : ''}</div>
      </div>
      <div class="rg-solo">
        <button type="button" class="btn btn-yellow rg-solo-go" data-rgch="1">1장 모험 시작!</button>
        <button type="button" class="btn btn-ghost" data-rgfame="1">🏆 명예의 전당 · 최대 콤보${myCombo() ? ' (내 최고 x' + myCombo() + ')' : ''}</button>
      </div>
      <div class="rg-how">
        <div><b>배가 가라앉으면</b> 별나침반이 그날 아침으로 되감아요. 기억을 안고 더 강하게!</div>
        <div><i class="c-g"></i>공격이 닿는 순간 <b>고리와 같은 색 버튼</b> = 패링!</div>
        <div><i class="c-r"></i><b>세 번 이어서</b> 패링하면 강반격 · <i class="c-b"></i>게이지가 차면 <b>세 버튼 같이</b> = 필살기</div>
        <div>혼자 하는 모험이에요 · 기록은 이 폰에 남아요${isHost ? '' : ' · 방장과 상관없이 바로 시작해요'}</div>
      </div>`;
  }

  function lobbyMain() {
    return { label: '1장 모험 시작', help: '혼자 하는 모험이에요 · 가족은 각자 폰에서 시작해요', wait: false };
  }

  function setup() {
    const box = $('#rpg-panel');
    if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      SND.unlock();
      if (b.dataset.rgch) { SND.SFX.go(); openChapter(); return; }
      if (b.dataset.rgfame) { SND.SFX.click(); openFame(); return; }
      if (b.dataset.rgath) {
        SND.SFX.pop(); SND.vibrate(10);
        const m = App.me(); if (m) m.athlete = b.dataset.rgath;
        renderLobby(S.room.hostPid === S.pid);
        App.send({ t: 'athlete', v: b.dataset.rgath });
      } else if (b.dataset.rgsolo) {
        SND.SFX.go();
        window.RpgGame.startSolo({ ai: Math.max(0, Math.min(3, loadOpt().ai || 0)) });
      } else if (b.dataset.rgsoloai != null) {
        SND.SFX.click();
        const o = loadOpt(); o.ai = Number(b.dataset.rgsoloai); saveOpt(o);
        renderLobby(S.room.hostPid === S.pid);
      } else if (b.dataset.rgai) {
        SND.SFX.click();
        const room = S.room;
        const n = Math.min(4, room.players.filter((p) => p.connected).length);
        const cur = Math.min((room.rgcfg && room.rgcfg.ai) || 0, 4 - n);
        App.send({ t: 'settings', rgai: Math.max(0, Math.min(4 - n, cur + Number(b.dataset.rgai))) });
      }
    });
  }

  // 시험용 (?rgtest=1): 자동 플레이어 · 씨앗 · 기록 바꾸기
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('rgauto') || q.get('rgtest')) {
      window.RpgGame.test = { auto: q.get('rgauto') || '', log: [], seed: Number(q.get('rgseed')) || 0, autoDepart: q.get('rgdepart') != null ? Number(q.get('rgdepart')) : null, speed: Math.max(1, Math.min(8, Number(q.get('rgspeed')) || 1)) };
    }
  } catch (e) { /* 무시 */ }

  setup();
  window.RpgHall = { renderLobby, lobbyMain, onMain: () => { SND.unlock(); SND.SFX.go(); openChapter(); } };
})();
