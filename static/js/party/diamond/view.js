/* 아리채 오락실 · 다이아몬드 게임 화면 (중국식 체커)
   - 별 모양 판 121칸. 내 진영이 늘 아래쪽에 오게 돌려서 보여 줘요
   - 내 말을 누르면 갈 수 있는 칸이 빛나요 (한 칸 걷기 · 뛰어넘기 이어서) → 빛나는 칸을 누르면 옮겨요
   - 뛰어넘기는 한 번씩 콩콩 뛰어가는 모습으로 */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#E8263B', '#2E5BD1', '#16A34A'];
  const LIGHT = ['#FFD6DB', '#D6E2FF', '#D3F5DF'];
  const DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
  const BOARD = [];
  for (let x = -8; x <= 8; x++) for (let y = -8; y <= 8; y++) {
    const z = -x - y;
    if (z < -8 || z > 8) continue;
    if ((x >= -4 && y >= -4 && z >= -4) || (x <= 4 && y <= 4 && z <= 4)) BOARD.push([x, y, z]);
  }
  const key = (c) => c.join(',');
  const BSET = new Set(BOARD.map(key));
  const inCorner = (c, a, s) => (s > 0 ? c[a] > 4 : c[a] < -4);
  const add = (a, d, k) => [a[0] + d[0] * (k || 1), a[1] + d[1] * (k || 1), a[2] + d[2] * (k || 1)];

  function reach(occ, frm) {
    const out = {};
    DIRS.forEach((d) => { const n = add(frm, d); if (BSET.has(key(n)) && !occ[key(n)]) out[key(n)] = [n]; });
    const stack = [[frm, []]]; const seen = new Set([key(frm)]);
    while (stack.length) {
      const [cur, path] = stack.pop();
      DIRS.forEach((d) => {
        const mid = add(cur, d); const land = add(cur, d, 2); const lk = key(land);
        if (occ[key(mid)] != null && key(mid) !== key(frm) && BSET.has(lk) && occ[lk] == null && !seen.has(lk)) {
          seen.add(lk); const p2 = path.concat([land]);
          if (!out[lk] || out[lk].length > p2.length) out[lk] = p2;
          stack.push([land, p2]);
        }
      });
    }
    delete out[key(frm)];
    return out;
  }

  function mount(el, api) {
    el.innerHTML = '<div class="dm"><div class="dm-players"></div><div class="dm-wrap"><div class="dm-board"><svg class="dm-svg" viewBox="-11.6 -13.2 23.2 26.4"></svg></div></div><div class="dm-act"></div></div>';
    const $ = (s) => el.querySelector(s);
    let v = null; let shown = null; let lastEv = 0; let busy = false; const queue = []; const timers = [];
    let sel = null; let rot = 0;
    const later = (f, ms) => { const t = setTimeout(f, ms); timers.push(t); };
    const nm = (i) => esc(api.seat(i).name);

    function px(c) {
      const X = Math.sqrt(3) * (c[0] + c[2] / 2); const Y = 1.5 * c[2];
      const a = rot * Math.PI / 180;
      return [X * Math.cos(a) - Y * Math.sin(a), X * Math.sin(a) + Y * Math.cos(a)];
    }
    function setRot(view) {
      const me = view.me == null ? 0 : view.me;
      const [a, s] = view.home[me];
      const t = [-4 * s, -4 * s, -4 * s]; t[a] = 8 * s;
      const X = Math.sqrt(3) * (t[0] + t[2] / 2); const Y = 1.5 * t[2];
      rot = 90 - Math.atan2(Y, X) * 180 / Math.PI;
    }
    function occOf(view) { const o = {}; view.pegs.forEach(([x, y, z, p]) => { o[`${x},${y},${z}`] = p; }); return o; }

    function draw(view, opt) {
      const o = opt || {};
      const occ = o.occ || occOf(view);
      const targets = sel && !o.anim ? reach(occ, sel) : {};
      let h = '';
      // 진영 바탕 색
      BOARD.forEach((c) => {
        const [X, Y] = px(c);
        let fill = '#EDE3CF';
        view.home.forEach(([a, s], i) => { if (inCorner(c, a, s)) fill = LIGHT[i]; });
        view.target.forEach(([a, s], i) => { if (inCorner(c, a, s) && fill === '#EDE3CF') fill = '#F6EEDD'; });
        h += `<circle cx="${X.toFixed(2)}" cy="${Y.toFixed(2)}" r=".62" fill="${fill}" stroke="#B9A27A" stroke-width=".08"/>`;
      });
      Object.keys(targets).forEach((k) => {
        const c = k.split(',').map(Number); const [X, Y] = px(c);
        h += `<circle cx="${X.toFixed(2)}" cy="${Y.toFixed(2)}" r=".72" fill="#2ED573" opacity=".85" class="dm-tgt" data-to="${k}"/>`;
      });
      Object.entries(occ).forEach(([k, p]) => {
        const c = k.split(',').map(Number); const [X, Y] = px(c);
        const isSel = sel && key(sel) === k;
        const mine = view.me === p && view.toAct === view.me && !busy;
        h += `<g class="dm-peg${mine ? ' mine' : ''}${isSel ? ' sel' : ''}" data-peg="${k}"><circle cx="${X.toFixed(2)}" cy="${(Y + 0.08).toFixed(2)}" r=".66" fill="rgba(0,0,0,.35)"/>
          <circle cx="${X.toFixed(2)}" cy="${Y.toFixed(2)}" r="${isSel ? 0.74 : 0.64}" fill="${COLORS[p]}" stroke="${isSel ? '#FFD23F' : '#fff'}" stroke-width="${isSel ? 0.2 : 0.1}"/>
          <circle cx="${(X - 0.2).toFixed(2)}" cy="${(Y - 0.22).toFixed(2)}" r=".2" fill="#fff" opacity=".6"/></g>`;
      });
      if (o.last) { const [X, Y] = px(o.last); h += `<circle cx="${X.toFixed(2)}" cy="${Y.toFixed(2)}" r=".86" fill="none" stroke="#FFD23F" stroke-width=".12" stroke-dasharray=".3 .2"/>`; }
      $('.dm-svg').innerHTML = h;
    }
    function drawPlayers(view) {
      $('.dm-players').innerHTML = view.home.map((_, i) => `<div class="dm-pl${view.turn === i && !view.over ? ' turn' : ''}" style="--c:${COLORS[i]}"><span class="av">${api.seat(i).av}</span><b>${nm(i)}</b><span>${view.inside[i]}/10</span></div>`).join('');
    }
    function drawAct(view) {
      const mine = view.me != null && view.toAct === view.me;
      const left = mine && view.deadline ? Math.max(0, Math.ceil((view.deadline - api.now()) / 1000)) : 0;
      const h = view.over ? '<div class="lr-hint">게임 끝!</div>' : busy ? '<div class="lr-hint">&nbsp;</div>'
        : mine ? `<div class="lr-hint"><b class="lr-hot">내 차례!</b> ${sel ? '초록 칸을 눌러 옮겨요' : '내 말을 눌러요'}${left && left <= 12 ? ` · ${left}초` : ''}</div>`
          : `<div class="lr-hint"><span class="bd-dots">${nm(view.turn)} 차례</span></div>`;
      const box = $('.dm-act'); if (box.dataset.h !== h) { box.innerHTML = h; box.dataset.h = h; }
    }

    function render(view) { queue.push(view); if (!busy) next(); }
    function next() {
      const nv = queue.shift();
      if (!nv) { busy = false; if (v) { draw(v, { last: lastLand }); drawAct(v); } return; }
      if (!shown) setRot(nv);
      const evs = (nv.events || []).filter((e) => e.id > lastEv);
      if (evs.length) lastEv = Math.max(...evs.map((e) => e.id));
      const prev = shown;
      v = nv;
      if (!prev || queue.length > 2 || !evs.length) { shown = nv; drawPlayers(nv); draw(nv, { last: lastLand }); drawAct(nv); later(next, 0); return; }
      busy = true; sel = null; drawAct(nv);
      const occ = occOf(prev);
      const steps = [];
      evs.forEach((e) => {
        let cur = key(e.f);
        e.path.forEach((c) => steps.push({ ms: 240, f: () => { const p = occ[cur]; delete occ[cur]; cur = key(c); occ[cur] = p; draw(nv, { occ, anim: true, last: c }); api.sfx('tick'); } }));
        lastLand = e.path[e.path.length - 1];
      });
      let k = 0;
      const run = () => {
        if (k >= steps.length) { shown = nv; busy = false; drawPlayers(nv); draw(nv, { last: lastLand }); drawAct(nv); if (nv.toAct === nv.me && nv.me != null) api.vibrate(15); later(next, 0); return; }
        const s = steps[k++]; s.f(); later(run, s.ms);
      };
      run();
    }
    let lastLand = null;

    el.addEventListener('click', (e) => {
      if (!v || busy || v.me == null || v.toAct !== v.me) return;
      const t = e.target.closest('[data-to]');
      if (t && sel) { api.act({ k: 'move', f: sel, t: t.dataset.to.split(',').map(Number) }); sel = null; api.sfx('pop'); return; }
      const p = e.target.closest('[data-peg]');
      if (p) {
        const c = p.dataset.peg.split(',').map(Number);
        if (occOf(v)[p.dataset.peg] === v.me) { sel = sel && key(sel) === p.dataset.peg ? null : c; api.tick(); draw(v, { last: lastLand }); drawAct(v); }
        return;
      }
      if (sel) { sel = null; draw(v, { last: lastLand }); drawAct(v); }
    });
    return { render, tick() { if (v && !busy) drawAct(v); }, busy: () => busy || queue.length > 0, destroy() { timers.forEach(clearTimeout); el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#EDE3CF"/><path d="M20 4 L26 14 L37 14 L31 20 L37 26 L26 26 L20 36 L14 26 L3 26 L9 20 L3 14 L14 14 Z" fill="#F6EEDD" stroke="#B9A27A"/><circle cx="20" cy="9" r="2.4" fill="#E8263B"/><circle cx="17.5" cy="13" r="2.4" fill="#E8263B"/><circle cx="20" cy="31" r="2.4" fill="#2E5BD1"/><circle cx="22.5" cy="27" r="2.4" fill="#2E5BD1"/><circle cx="30" cy="20" r="2.4" fill="#16A34A"/></svg>';

  C.register({
    id: 'diamond',
    kind: 'table',
    icon: ICON,
    rulesText: '내 말 10개를 맞은편 진영으로 먼저 다 옮기면 승리 · 한 칸 걷기, 또는 바로 옆 말을 뛰어넘기 (이어서 여러 번!) · 2~3명',
    learn: '다이아몬드 게임은 독일에서 만든 "할마"라는 놀이가 바뀐 거예요. 다른 사람 말을 사다리처럼 써서 멀리 뛰어가는 게 비결이에요. 길을 막는 작전도 있어요!',
    bar(v) { return v.me != null ? `<span class="cd-info">내 말 도착 <b>${v.inside[v.me]}</b>/10</span><span class="cd-info">${v.moves[v.me]}수</span>` : ''; },
    rankLabel(v, i) { return v && v.inside ? `도착 ${v.inside[i]}/10` : ''; },
    mount
  });
})();
