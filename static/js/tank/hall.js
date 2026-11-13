/* 아리채 오락실 · 대기실 '포격전' 판 (허브 연결만)
   - 플레이는 전용 페이지 static/tank.html (방·인원은 포격전 서버 모듈 tank.py 가 따로 관리, 최대 16명)
   - 허브 방의 누구나 카드를 누르면 포격전 페이지로 가요. 같은 방 코드로 모이려면 포격전 대기실에서 새 코드를 공유 */
(function () {
  'use strict';
  const App = window.App;
  if (!App) return;
  const { $, SND } = App;

  let ROOT = 'static/';
  try {
    const me = document.currentScript && document.currentScript.src;
    if (me) ROOT = me.replace(/js\/tank\/hall\.js(\?.*)?$/, '');
  } catch (e) { /* 기본값 */ }

  const open = () => { location.href = ROOT + 'tank.html'; };

  function renderLobby() {
    const box = $('#tank-panel');
    if (!box) return;
    box.innerHTML = `<button type="button" class="tk-lb-card" data-tank="go" style="display:flex;flex-direction:column;gap:6px;width:100%;margin-top:10px;padding:14px;border:0;border-radius:18px;
        background:linear-gradient(135deg,#9a5aa0,#e0789a 55%,#f7a868);color:#fff;text-align:left;font-family:inherit;box-shadow:0 4px 0 rgba(0,0,0,.2)">
        <b class="disp" style="font-size:22px">노을언덕 포격대</b>
        <span style="font-size:16px">각도와 파워로 쏘는 실시간 팀 포격전 · 2명~16명 · 휴대폰을 가로로 들어요</span>
        <span style="align-self:flex-start;margin-top:4px;padding:8px 16px;border-radius:12px;background:#FFD23F;color:#3a2400;font-size:16px">포격전 열기 ›</span>
      </button>
      <div class="mg-how">포격전은 전용 대기실에서 새 방 코드를 만들어 함께 들어와요 · AI와 혼자 연습도 돼요</div>`;
  }

  function setup() {
    const box = $('#tank-panel');
    if (!box) return;
    box.addEventListener('click', (e) => {
      if (!e.target.closest('[data-tank]')) return;
      SND.unlock(); SND.SFX.go(); open();
    });
  }

  function lobbyMain() { return { label: '포격전 열기', help: '전용 대기실(가로 화면)로 이동해요 · 최대 16명', wait: false }; }

  setup();
  window.TankHall = { renderLobby, lobbyMain, onMain: () => { SND.unlock(); SND.SFX.go(); open(); } };
})();
