/* 아리채 오락실 · 회귀 RPG 대기실 판 (모드 '모험')
   - 내 용사 고르기 (올림픽 선수 10명 그림 · 능력은 모두 같아요 · 서버 'athlete' 를 같이 써요)
   - 내 회귀 기록 (회차·기억 조각·★·기억의 나무) · 가족들 회차 배지
   - [혼자 바로 모험] 누구나 바로 (기다림 없음 · 서버 없이 이 폰에서만)
   - 방장: AI 동료 수 → [같이 모험 시작] (가족 4명까지 같은 던전 · 같이 회귀) */
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

  function renderLobby(isHost) {
    const box = $('#rpg-panel');
    if (!box) return;
    const room = S.room;
    const mine = App.me();
    const m = Meta.get();
    const opt = loadOpt();
    const dis = isHost ? '' : 'disabled';
    const taken = {};
    room.players.forEach((p) => { if (p.pid !== S.pid && p.athlete) taken[p.athlete] = p.name; });
    const nodes = D.meta.nodes.map((n) => `<span class="rg-lb-node c-${n.c}">${esc(n.name)} ${'●'.repeat(m.nodes[n.id] || 0)}${'○'.repeat(n.max - (m.nodes[n.id] || 0))}</span>`).join('');
    const fam = room.players.map((p) => {
      const b = (room.rgmeta || {})[p.pid];
      return `<div class="rg-fam${p.pid === S.pid ? ' me' : ''}"><span class="rg-fam-f">${O.faceSVG(p.athlete || 'dino')}</span><b>${p.pid === S.pid ? '나' : esc(p.name)}</b>
        <span class="rg-badge">${b ? `${b.loop}회차${b.stars ? ' ★' + b.stars : ''}` : '처음'}</span></div>`;
    }).join('');
    const humans = Math.min(4, room.players.filter((p) => p.connected).length);
    const maxAi = Math.max(0, 4 - humans);
    const nAi = Math.min((room.rgcfg && room.rgcfg.ai) || 0, maxAi);
    const soloAi = Math.max(0, Math.min(3, opt.ai || 0));
    box.innerHTML = `
      <div class="rg-lb-hero">
        <div class="rg-logo">${LOGO}<div><b class="disp">되감기 용사단</b><span>죽으면 시간이 되감겨요. 기억을 안고 더 강하게!</span></div></div>
        <div class="rg-lb-rec">
          <div><em>지금</em><b class="disp">${m.loop}회차</b></div>
          <div><em>경험치</em><b class="disp">×${Sim.xpMult(m.loop).toFixed(2)}</b></div>
          <div><em>기억 조각</em><b class="disp">${m.shards}</b></div>
          <div><em>최고</em><b class="disp">${m.clears ? '클리어 ★' + m.stars : m.bestRoom ? (m.bestRoom >= D.rooms.length ? '대왕' : m.bestRoom + '번째 방') : '-'}</b></div>
        </div>
        <div class="rg-lb-nodes">${nodes}${m.mem ? `<span class="rg-lb-node mem">기억: ${esc(Sim.cardLabel(m.mem.id, m.mem.lv))}</span>` : ''}</div>
      </div>
      <div class="list-head sub"><span>내 용사</span><span class="hint-sm">모습만 달라요 · 누르면 바뀌어요</span></div>
      <div class="oly-aths rg-aths">${O.ATH.map((a) => {
        const on = mine && mine.athlete === a.id; const who = taken[a.id];
        return `<button type="button" class="oly-ath${on ? ' on' : ''}${who ? ' taken' : ''}" data-rgath="${a.id}" ${who ? 'disabled' : ''} style="--jc:${a.jersey}">
          <span class="oly-ath-f">${O.faceSVG(a.id, on ? 'h' : 'n')}</span><b>${esc(a.name)}</b><span>${who ? esc(who) : esc(a.note)}</span></button>`;
      }).join('')}</div>
      <div class="rg-solo">
        <button type="button" class="btn btn-yellow rg-solo-go" data-rgsolo="1">혼자 바로 모험!</button>
        <div class="rg-solo-ai"><span>AI 동료</span>${[0, 1, 2].map((n) => `<button type="button" data-rgsoloai="${n}" class="${soloAi === n ? 'on' : ''}">${n ? n + '명' : '없이'}</button>`).join('')}</div>
      </div>
      <div class="list-head sub"><span>같이 모험</span><span class="hint-sm">가족 4명까지 · 같은 던전 · 같이 회귀</span></div>
      <div class="rg-fams">${fam}</div>
      <div class="oly-ai-row rg-coop-ai"><button type="button" class="cd-step" data-rgai="-1" ${dis || (nAi <= 0 ? 'disabled' : '')}>−</button>
        <b class="disp">AI 동료 ${nAi}명</b><button type="button" class="cd-step" data-rgai="1" ${dis || (nAi >= maxAi ? 'disabled' : '')}>+</button></div>
      <div class="rg-how">
        <div><i class="c-r"></i><b>빨강</b> 톡톡 = 3단 베기 · 꾹 = 모아 베기</div>
        <div><i class="c-g"></i><b>초록</b> 꾹 = 막기 · <b>고리가 닫힐 때 톡</b> = 패링!</div>
        <div><i class="c-b"></i><b>파랑</b> 게이지가 차면 필살기</div>
      </div>`;
  }

  function lobbyMain() {
    const room = S.room;
    const n = Math.min(4, room.players.filter((p) => p.connected).length);
    const ai = Math.min((room.rgcfg && room.rgcfg.ai) || 0, 4 - n);
    return {
      label: n + ai > 1 ? `같이 모험 시작 · ${n + ai}명` : '같이 모험 시작',
      help: n > 1 ? '모두 같은 던전에 들어가요. 회귀 기록은 각자 폰에 남아요' : '가족을 초대하거나, 위의 [혼자 바로 모험]을 눌러요',
      wait: false
    };
  }

  function setup() {
    const box = $('#rpg-panel');
    if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      SND.unlock();
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
  window.RpgHall = { renderLobby, lobbyMain };
})();
