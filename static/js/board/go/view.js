/* 아리채 오락실 · 바둑 화면 (9줄·13줄 같이 써요)
   - 9줄: 누르면 바로 둬요 · 13줄: 한 번 누르면 미리 보이고, 한 번 더(또는 [여기에 두기]) 누르면 둬요
   - 따낸 돌은 스르륵 사라지고, 끝나면 누구 집인지 작은 네모로 보여줘요 (죽은 돌은 흐리게) */
(function () {
  'use strict';
  const B = window.Boards;
  const STONE_ICON = {
    black: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#1A1A22" stroke="#55556A" stroke-width="1"/><circle cx="7.4" cy="7" r="2.4" fill="#5C5C6E" opacity=".7"/></svg>',
    white: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#F4F1EA" stroke="#B9B4A8" stroke-width="1"/><circle cx="7.4" cy="7" r="2.4" fill="#fff"/></svg>'
  };
  const COLS = 'ABCDEFGHJKLMN';

  function setup(id) {
    const R = window.BoardRules[id];
    const N = R.N;
    const V = N + 0.3;   // 판 크기 (가장자리 포함)
    const confirmTap = N > 9;

    function mount(el, api) {
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'om-wrap go-wrap';
      const sv = B.svg(`-0.15 -0.15 ${V} ${V}`, 'om-board go-board');
      let html = `<defs>
        <radialGradient id="goB${N}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#6A6A78"/><stop offset=".45" stop-color="#22222B"/><stop offset="1" stop-color="#08080E"/></radialGradient>
        <radialGradient id="goW${N}" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#EEEBE3"/><stop offset="1" stop-color="#C6C0B2"/></radialGradient>
        <linearGradient id="goWood${N}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EBC27A"/><stop offset=".5" stop-color="#E2B266"/><stop offset="1" stop-color="#D9A456"/></linearGradient>
        <filter id="goSh${N}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx=".06" dy=".09" stdDeviation=".06" flood-color="#3A2405" flood-opacity=".55"/></filter></defs>
        <rect x="-0.15" y="-0.15" width="${V}" height="${V}" rx=".35" fill="url(#goWood${N})"/>
        <g opacity=".18">${[0.15, 0.4, 0.66, 0.88].map((f) => `<path d="M-0.1 ${f * N} Q${N * 0.3} ${f * N - 0.35} ${N * 0.55} ${f * N + 0.15} T${N + 0.1} ${f * N - 0.1}" stroke="#A9762E" stroke-width=".07" fill="none"/>`).join('')}</g>
        <g stroke="#5A3A12" stroke-width=".045">`;
      for (let i = 0; i < N; i++) html += `<line x1=".5" y1="${i + 0.5}" x2="${N - 0.5}" y2="${i + 0.5}"/><line x1="${i + 0.5}" y1=".5" x2="${i + 0.5}" y2="${N - 0.5}"/>`;
      html += `<rect x=".5" y=".5" width="${N - 1}" height="${N - 1}" fill="none" stroke-width=".08"/></g>`;
      html += R.STAR.map(([r, c]) => `<circle cx="${c + 0.5}" cy="${r + 0.5}" r=".11" fill="#5A3A12"/>`).join('');
      html += '<g class="go-terr"></g><g class="om-marks"></g><g class="om-stones"></g><g class="go-ghost"></g><g class="om-top"></g>';
      sv.innerHTML = html;
      wrap.appendChild(sv);
      el.appendChild(wrap);
      const gTerr = sv.querySelector('.go-terr'); const gMarks = sv.querySelector('.om-marks');
      const gStones = sv.querySelector('.om-stones'); const gGhost = sv.querySelector('.go-ghost'); const gTop = sv.querySelector('.om-top');
      let st = null; let vc = {}; let sel = -1; let shown = null; let ghostKey = '';
      const xy = (i) => [(i % N) + 0.5, ((i / N) | 0) + 0.5];

      function draw() {
        const res = vc.guide ? null : R.result(st);
        const sc = res ? R.score(st) : null;
        let out = '';
        for (let i = 0; i < N * N; i++) {
          const c = st.b[i];
          if (!c) continue;
          const [x, y] = xy(i);
          const isNew = shown && shown[i] !== c;
          const dead = sc && sc.dead[i];
          out += `<g class="om-st${isNew ? ' new' : ''}" style="transform-origin:${x}px ${y}px"${dead ? ' opacity=".45"' : ''}><circle cx="${x}" cy="${y}" r=".47" fill="url(#go${c === 1 ? 'B' : 'W'}${N})" filter="url(#goSh${N})"/>`;
          if (i === st.last) out += `<circle cx="${x}" cy="${y}" r=".16" fill="none" stroke="${c === 1 ? '#fff' : '#222'}" stroke-width=".06"/>`;
          out += '</g>';
        }
        gStones.innerHTML = out;
        shown = st.b.slice();
        // 따낸 돌이 스르륵
        const gk = `${st.n}:${(st.lastCap || []).join(',')}`;
        if (gk !== ghostKey) {
          ghostKey = gk;
          const cc = st.turn + 1;   // 따인 돌 색 = 지금 둘 차례인 쪽
          gGhost.innerHTML = (st.lastCap || []).map((i) => { const [x, y] = xy(i); return `<circle class="go-fade" cx="${x}" cy="${y}" r=".47" fill="url(#go${cc === 1 ? 'B' : 'W'}${N})"/>`; }).join('');
        }
        // 끝난 판: 집 표시
        let terr = '';
        if (sc) {
          sc.owner.forEach((o, i) => {
            if (!o || (st.b[i] && !sc.dead[i])) return;
            const [x, y] = xy(i);
            terr += `<rect x="${x - 0.17}" y="${y - 0.17}" width=".34" height=".34" rx=".05" fill="${o === 1 ? '#15151C' : '#F7F5EF'}" stroke="${o === 1 ? '#000' : '#9A9384'}" stroke-width=".03"/>`;
          });
        }
        gTerr.innerHTML = terr;
        let mk = '';
        if (vc.canPlay && st.ko >= 0) { const [x, y] = xy(st.ko); mk += `<rect x="${x - 0.2}" y="${y - 0.2}" width=".4" height=".4" fill="none" stroke="#E8263B" stroke-width=".06"/>`; }
        (vc.targets || []).forEach((i) => { const [x, y] = xy(i); mk += `<circle class="om-target" cx="${x}" cy="${y}" r=".42" fill="rgba(255,210,63,.35)" stroke="#FFD23F" stroke-width=".08"/>`; });
        if (vc.hint != null && vc.hint >= 0) { const [x, y] = xy(vc.hint); mk += `<circle class="om-hint" cx="${x}" cy="${y}" r=".45" fill="rgba(61,123,255,.35)" stroke="#3D7BFF" stroke-width=".1"/>`; }
        gMarks.innerHTML = mk;
        let top = '';
        if (sel >= 0) {
          const [x, y] = xy(sel);
          top += `<g class="om-sel"><circle cx="${x}" cy="${y}" r=".47" fill="url(#go${st.turn === 0 ? 'B' : 'W'}${N})" opacity=".7"/><circle cx="${x}" cy="${y}" r=".56" fill="none" stroke="#FF4757" stroke-width=".07"/></g>`;
        }
        gTop.innerHTML = top;
      }
      function render(state, ctx) {
        st = state; vc = ctx || {};
        if (sel >= 0 && (!vc.canPlay || st.b[sel])) setSel(-1, true);
        draw();
      }
      function setSel(i, silent) {
        sel = i;
        api.selecting(i >= 0, i >= 0 ? `${COLS[i % N]}${N - ((i / N) | 0)}` : '');
        if (!silent) draw();
      }
      function commit() { if (sel < 0) return; const i = sel; setSel(-1); api.pick(i); }
      sv.addEventListener('pointerdown', (ev) => {
        if (!st || !vc.canPlay) return;
        ev.preventDefault();
        const [fx, fy] = B.svgPoint(sv, ev);
        const x = Math.floor(fx); const y = Math.floor(fy);
        if (x < 0 || y < 0 || x >= N || y >= N) return;
        const i = y * N + x;
        if (st.b[i]) { api.say('이미 돌이 있어요'); return; }
        if (!R.tryPlay(st, i)) { api.say(i === st.ko ? '패! 방금 따낸 자리는 바로 되따낼 수 없어요. 다른 곳에 한 수 두고 와요' : '스스로 숨이 막히는 자리(자충수)는 둘 수 없어요'); api.buzz(); return; }
        if (!confirmTap) { api.tick(); api.pick(i); return; }
        if (i === sel) { commit(); return; }
        setSel(i); api.tick();
      });
      return { render, commit, clear: () => setSel(-1), destroy() { el.innerHTML = ''; } };
    }

    B.register(Object.assign({
      id,
      icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="6" fill="#E2B266"/><path d="M8 2v36M16 2v36M24 2v36M32 2v36M2 8h36M2 16h36M2 24h36M2 32h36" stroke="#8A5A1E" stroke-width="1.2"/><circle cx="16" cy="16" r="4.2" fill="#1A1A22"/><circle cx="24" cy="16" r="4.2" fill="#F4F1EA"/><circle cx="16" cy="24" r="4.2" fill="#F4F1EA"/><circle cx="24" cy="24" r="4.2" fill="#1A1A22"/>${N > 9 ? '<rect x="25" y="27" width="13" height="11" rx="3" fill="#FF4757"/><text x="31.5" y="35.6" font-size="8.5" fill="#fff" text-anchor="middle" font-family="sans-serif" font-weight="700">13</text>' : '<rect x="27" y="27" width="11" height="11" rx="3" fill="#3D7BFF"/><text x="32.5" y="35.6" font-size="8.5" fill="#fff" text-anchor="middle" font-family="sans-serif" font-weight="700">9</text>'}</svg>`,
      seats: [{ label: '흑', sub: '먼저', icon: STONE_ICON.black }, { label: '백', sub: `덤 ${R.KOMI}`, icon: STONE_ICON.white }],
      rulesText: `${N}줄 판 · 상대 돌의 숨(빈 이웃)을 모두 막으면 따내요 · 자충수·패 바로 되따내기 금지 · 둘 다 패스하면 끝나고 집(돌 + 둘러싼 빈 곳)이 많은 쪽 승리 · 백 덤 ${R.KOMI}집`,
      learn: N === 9
        ? '바둑은 4000년 전 중국에서 시작된, 세상에서 가장 오래된 보드게임 가운데 하나예요. 2016년 알파고가 이세돌 9단을 이겨서 온 세상이 놀랐죠. 이세돌 9단이 4국에서 거둔 1승은 사람이 알파고를 이긴 유일한 대국으로 남아 있어요.'
        : '13줄 바둑은 9줄보다 넓어서 귀·변·중앙을 다 쓸 수 있어요. 정식 19줄로 가기 전 연습판으로 딱 좋아요! 귀 → 변 → 중앙 순서로 집을 지어 보세요.',
      turnHint: confirmTap ? '놓을 자리를 두 번 눌러요' : '놓을 자리를 눌러요',
      status(st) {
        let s = `<span class="ch-caps">따낸 돌 흑 ${st.caps[0]} · 백 ${st.caps[1]}</span>`;
        if (!R.result(st) && st.passes === 1) s = `<b class="jg-meong">${st.turn === 0 ? '백' : '흑'} 패스!</b> <span class="ch-caps">한 번 더 패스하면 끝나고 집을 세요</span>`;
        if (!R.result(st) && st.n >= R.LIMIT - 30) s += `<span class="ch-caps">${st.n}/${R.LIMIT}수</span>`;
        return s;
      },
      actions(st) { return st && !R.result(st) ? [{ key: 'pass', label: '✋ 패스', move: -1, confirm: st.passes === 1 ? '한 번 더 누르면 패스 — 판이 끝나고 집을 세요' : '한 번 더 누르면 패스해요 (둘 곳이 없을 때)' }] : []; },
      viewCtx: () => ({}), mount,
      aiMinMs: [0, 600, 550, 500, 400, 300]
    }, B.std(R)));
  }
  setup('go9');
  setup('go13');
})();
