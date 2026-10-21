/* 아리채 오락실 · 바다 대결 (배틀십) 화면
   - 배치: 내 바다에 배 5척 · [다시 섞기] · [준비 완료]
   - 대결: 위는 상대 바다(눌러서 쏘기), 아래는 내 바다(내 배 + 상대가 쏜 자국)
   - 맞으면 💥, 빗나가면 물보라, 배를 다 맞히면 '격침!' */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLS = 'ABCDEFGH';

  function seaHTML(sea, n, opts) {
    const o = opts || {};
    const shot = {};
    sea.shots.forEach(([r, c, hit]) => { shot[`${r},${c}`] = hit ? 'hit' : 'miss'; });
    // 배 그림: 칸마다 앞/가운데/뒤 모양
    const hull = {};
    sea.ships.forEach((s) => {
      const horiz = s.cells.length > 1 && s.cells[0][0] === s.cells[1][0];
      s.cells.forEach(([r, c], k) => {
        const end = k === 0 ? 'a' : k === s.cells.length - 1 ? 'z' : 'm';
        hull[`${r},${c}`] = `ship ${horiz ? 'h' : 'v'}${end}${s.sunk ? ' sunk' : ''}`;
      });
    });
    let h = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const k = `${r},${c}`;
        const st = shot[k];
        const cls = ['sh-cell', hull[k] || '', st || '', o.last === k ? 'last' : ''].join(' ');
        h += `<button type="button" class="${cls}" ${o.fire && !st ? `data-fire="${r},${c}"` : 'tabindex="-1"'}>${st === 'hit' ? '<i>💥</i>' : st === 'miss' ? '<i class="sp"></i>' : ''}</button>`;
      }
    }
    return `<div class="sh-grid${o.fire ? ' fire' : ''}" style="--n:${n}">${h}</div>`;
  }

  function mount(el, api) {
    el.innerHTML = '<div class="sh"><div class="sh-head"></div><div class="sh-main"></div><div class="sh-act"></div></div>';
    const $ = (s) => el.querySelector(s);
    let v = null; let lastEv = 0; let lastCell = ''; let lastCellMine = '';
    const nm = (i) => esc(api.seat(i).name);

    function render(view) {
      const prev = v;
      v = view;
      const me = v.me == null ? 0 : v.me;
      const foe = 1 - me;
      const evs = (v.events || []).filter((e) => e.id > lastEv);
      if (evs.length) lastEv = Math.max(...evs.map((e) => e.id));
      evs.forEach((e) => {
        const key = `${e.r},${e.c}`;
        if (e.s === me) lastCell = key; else lastCellMine = key;
        if (e.sunk) { api.say(`${nm(e.s)}: ${e.sunk} 격침! 🚢💥`); api.sfx('crash'); api.vibrate([50, 30, 80]); }
        else if (e.hit) { api.sfx('crack'); if (e.s !== me) api.vibrate(40); }
        else api.sfx('soft');
      });
      const left = v.seas.map((s) => s.left);
      $('.sh-head').innerHTML = [foe, me].map((i) => `<div class="sh-pl${v.turn === i && v.phase === 'fire' && !v.over ? ' turn' : ''}"><span class="av">${api.seat(i).av}</span><b>${nm(i)}</b><span>🚢 ${left[i]}척</span></div>`).join('<span class="sh-vs disp">VS</span>');
      const main = $('.sh-main');
      if (v.phase === 'place') {
        main.innerHTML = `<div class="sh-title">내 바다 · 배 5척을 숨겨요</div>${seaHTML(v.seas[me], v.n, {})}
          <div class="sh-legend">항공모함 4칸 · 전함 3칸 · 순양함 3칸 · 구축함 2칸 · 잠수함 2칸</div>`;
        const ready = v.me != null && v.ready[v.me];
        $('.sh-act').innerHTML = v.me == null ? '<div class="lr-hint">구경 중</div>' : ready
          ? `<div class="lr-hint">준비 완료! ${v.ready.every(Boolean) ? '' : '상대를 기다려요…'}</div>`
          : '<div class="sh-btns"><button type="button" class="btn btn-ghost" data-sh="shuffle">🔀 다시 섞기</button><button type="button" class="btn btn-yellow" data-sh="ready">준비 완료</button></div>';
        return;
      }
      const myTurn = v.me != null && v.toAct === v.me;
      main.innerHTML = `<div class="sh-title">${myTurn ? '<b class="lr-hot">내 차례!</b> 상대 바다를 눌러 쏴요' : v.over ? '끝!' : `${nm(v.turn)} 차례`}</div>
        ${seaHTML(v.seas[foe], v.n, { fire: myTurn, last: lastCell })}
        <div class="sh-title sm">내 바다</div><div class="sh-mine">${seaHTML(v.seas[me], v.n, { last: lastCellMine })}</div>`;
      $('.sh-act').innerHTML = '';
      if (prev && prev.toAct !== v.toAct && myTurn) api.vibrate(15);
    }
    el.addEventListener('click', (e) => {
      if (!v) return;
      const b = e.target.closest('[data-sh]');
      if (b) { api.act({ k: b.dataset.sh }); api.sfx('pop'); return; }
      const f = e.target.closest('[data-fire]');
      if (f && v.toAct === v.me) {
        const [r, c] = f.dataset.fire.split(',').map(Number);
        api.act({ k: 'fire', r, c });
        f.classList.add('aim');
        el.querySelectorAll('[data-fire]').forEach((x) => x.removeAttribute('data-fire'));
      }
    });
    return { render, tick() {}, destroy() { el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#1E6FB8"/><path d="M6 10 H34 M6 18 H34 M6 26 H34 M14 4 V36 M22 4 V36 M30 4 V36" stroke="#5FA8E8" stroke-width=".8"/><rect x="8" y="20" width="20" height="5" rx="2.5" fill="#B8C2CC"/><text x="26" y="15" font-size="9">💥</text></svg>';

  C.register({
    id: 'ship',
    kind: 'table',
    icon: ICON,
    rulesText: '8×8 바다에 배 5척을 숨기고 번갈아 상대 바다를 쏴요 · 맞히면 한 번 더(설정) · 배를 다 맞히면 격침 · 상대 배를 먼저 다 가라앉히면 승리',
    learn: '배틀십은 종이에 그려서 하던 아주 오래된 게임이에요. 맞힌 칸 둘레를 먼저 쏘고, 빈 바다는 바둑판 무늬로 찾으면 빨리 찾을 수 있어요!',
    optionsUI: [{ key: 'hit', label: '맞히면', names: { again: '한 번 더 쏘기', pass: '차례 넘기기' } }],
    bar(v) { return v.phase === 'place' ? '<span class="cd-info">배를 숨기는 중</span>' : `<span class="cd-info">남은 배: 나 <b>${v.seas[v.me == null ? 0 : v.me].left}</b> · 상대 <b>${v.seas[v.me == null ? 1 : 1 - v.me].left}</b></span>`; },
    rankLabel(v, i) { return v && v.seas ? `🚢 ${v.seas[i].left}척 남음` : ''; },
    mount
  });
})();
