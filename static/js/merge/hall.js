/* 아리채 오락실 · 대기실 '머지관' 판
   - 머지관 안의 게임 카드 목록 (GAMES) → 누르면 그 게임 페이지로 (혼자 · 기록은 폰마다)
   - 첫 게임: 「소라섬 등불 이야기」 = static/merge.html · 나중 머지 게임은 GAMES 에 한 줄 추가
   - 방장의 큰 버튼은 첫 게임을 열어요 (app.js 의 MergeHall.onMain) */
(function () {
  'use strict';

  const App = window.App;
  if (!App) return;
  const { $, esc, SND } = App;

  let ROOT = 'static/';
  try {
    const me = document.currentScript && document.currentScript.src;
    if (me) ROOT = me.replace(/js\/merge\/hall\.js(\?.*)?$/, '');
  } catch (e) { /* 기본값 */ }

  const GAMES = [
    { id: 'sora', title: '소라섬 등불 이야기', sub: '같은 물건 둘을 합쳐 바닷마을을 되살려요', page: 'merge.html', save: 'arichae_merge_v1',
      face: 'img/merge/chars/hayun.webp', bg: 'img/merge/bg/r1_before.webp', icons: ['img/merge/items/a2.webp', 'img/merge/items/b4.webp', 'img/merge/items/d3.webp'] }
  ];

  // 이 폰에 남은 기록 (저장이 막혀 있거나 없으면 null)
  function record(g) {
    try {
      const st = JSON.parse(localStorage.getItem(g.save) || 'null');
      if (!st || typeof st !== 'object') return null;
      return { coins: st.coins | 0, stars: st.stars | 0, delivered: (st.stats && st.stats.delivered) | 0, found: Object.keys(st.found || {}).length };
    } catch (e) { return null; }
  }
  const open = (g) => { location.href = ROOT + g.page; };

  function renderLobby() {
    const box = $('#merge-panel');
    if (!box) return;
    box.innerHTML = GAMES.map((g) => {
      const r = record(g);
      const rec = r ? `<div class="mg-lb-rec"><div><em>동전</em><b class="disp">${r.coins}</b></div><div><em>별</em><b class="disp">${r.stars}</b></div><div><em>부탁</em><b class="disp">${r.delivered}</b></div><div><em>발견</em><b class="disp">${r.found}</b></div></div>`
        : '<div class="mg-lb-new">처음 시작해요 · 기록은 이 폰에 남아요</div>';
      return `<button type="button" class="mg-lb-card" data-mgame="${esc(g.id)}">
        <img class="mg-lb-bg" src="${esc(ROOT + g.bg)}" alt="" draggable="false">
        <div class="mg-lb-top"><img class="mg-lb-face" src="${esc(ROOT + g.face)}" alt="" draggable="false">
          <div><b class="disp">${esc(g.title)}</b><span>${esc(g.sub)}</span></div></div>
        <div class="mg-lb-icons">${g.icons.map((s) => `<img src="${esc(ROOT + s)}" alt="" draggable="false">`).join('')}</div>
        ${rec}
        <span class="btn btn-yellow mg-lb-go">${r ? '이어서 하기' : '시작하기'}</span>
      </button>`;
    }).join('') + `<div class="mg-how">혼자 하는 느긋한 합치기 놀이예요 · 시간 제한·광고·결제 없음<br>머지관에는 다른 합치기 게임도 차례로 들어와요</div>`;
  }

  function setup() {
    const box = $('#merge-panel');
    if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mgame]');
      if (!b) return;
      const g = GAMES.find((x) => x.id === b.dataset.mgame);
      if (!g) return;
      SND.unlock(); SND.SFX.go();
      open(g);
    });
  }

  function lobbyMain() { return { label: `${GAMES[0].title} 시작`, help: '혼자 하는 게임이에요 · 가족은 각자 폰에서 열어요', wait: false }; }

  setup();
  window.MergeHall = { GAMES, renderLobby, lobbyMain, onMain: () => { SND.unlock(); SND.SFX.go(); open(GAMES[0]); } };
})();
