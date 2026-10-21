/* 아리채 오락실 · 계단 주사위 화면 (텀블린 다이스 방식)
   - 세로 계단판: 위로 갈수록 멀고 배수가 커요 (×1 ×2 ×3 ×4), 맨 위 끝은 낭떠러지
   - 아래 출발선에서 내 주사위를 누르고 아래로 당겼다 놓아요 · 출발선 아무 데나 누르면 주사위 자리를 옮겨요
   - 계단을 넘을 때마다 주사위가 굴러서 눈이 바뀌어요 */
(function () {
  'use strict';
  const C = window.Cards;
  const F = window.Flick;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#E8263B', '#2E5BD1', '#16A34A', '#F59E0B'];
  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };

  function die(owner, x, y, r, face, op, hl, spin) {
    const s = r * 1.65;
    const p = (PIPS[face] || PIPS[1]).map(([a, b]) => `<circle cx="${(a * s * 0.27).toFixed(2)}" cy="${(b * s * 0.27).toFixed(2)}" r="${(s * 0.09).toFixed(2)}" fill="#fff"/>`).join('');
    return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${spin || 0})" opacity="${op == null ? 1 : op}"><rect x="${-s / 2}" y="${(-s / 2 + 0.5).toFixed(2)}" width="${s}" height="${s}" rx="${s * 0.22}" fill="rgba(0,0,0,.3)"/>
      <rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s * 0.22}" fill="${COLORS[owner % 4]}" ${hl ? 'stroke="#FFD23F" stroke-width=".5"' : 'stroke="rgba(0,0,0,.3)" stroke-width=".25"'}/>${p}</g>`;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="tb"><div class="tb-players"></div><div class="tb-wrap"><div class="tb-board"><svg class="tb-svg" viewBox="-2 -6 44 108"><g class="tb-bg"></g><g class="tb-dice"></g><g class="tb-aim"></g></svg></div></div><div class="tb-msg"></div></div>`;
    const $ = (s) => el.querySelector(s);
    const svg = $('.tb-svg');
    let v = null; let lastAnim = 0; let player = null; let busy = false; let px = 20; let roundKey = '';
    const nm = (i) => esc(api.seat(i).name);
    const fit = () => { const w = $('.tb-wrap'); const b = $('.tb-board'); const s = Math.min(w.clientHeight, w.clientWidth * 108 / 44); b.style.height = `${Math.floor(s)}px`; b.style.width = `${Math.floor(s * 44 / 108)}px`; };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    requestAnimationFrame(fit);

    function bg(g) {
      const tiers = [[0, g.steps[2], 4, '#7C3AED'], [g.steps[2], g.steps[1], 3, '#2563EB'], [g.steps[1], g.steps[0], 2, '#0891B2'], [g.steps[0], g.foul, 1, '#059669']];
      let h = `<rect x="-2" y="-6" width="44" height="108" rx="3" fill="#4A2C12"/><rect x="0" y="-4" width="40" height="4" fill="#1C1209"/><text x="20" y="-1.4" font-size="2.4" text-anchor="middle" fill="#FF8B95">낭떠러지</text>`;
      tiers.forEach(([y0, y1, m, c], k) => {
        h += `<rect x="0" y="${y0}" width="40" height="${y1 - y0}" fill="${c}" opacity="${0.55 + k * 0.08}"/>
          <rect x="0" y="${y1 - 1.2}" width="40" height="1.2" fill="rgba(0,0,0,.25)"/>
          <text x="36" y="${(y0 + y1) / 2 + 2}" font-size="6" text-anchor="middle" fill="rgba(255,255,255,.55)" font-weight="900">×${m}</text>`;
      });
      h += `<rect x="0" y="${g.foul}" width="40" height="${100 - g.foul}" fill="#8B5A2B"/><line x1="0" y1="${g.foul}" x2="40" y2="${g.foul}" stroke="#fff" stroke-width=".4" stroke-dasharray="1.2 .8"/>
        <text x="2" y="${g.foul + 2.6}" font-size="2" fill="#FFE9C7">출발선 · 여기를 넘어야 해요</text>`;
      return h;
    }
    const myTurn = () => v && !busy && v.me != null && v.toAct === v.me;
    function drawStill() {
      let h = v.dice.map(([id, o, x, y, f]) => die(o, x, y, v.r, f)).join('');
      if (myTurn()) h += die(v.me, px, v.geo.startY, v.r, 0, 1, true).replace(/<circle[^>]*\/>/g, '') + `<text x="${px}" y="${v.geo.startY + 0.9}" font-size="2.6" text-anchor="middle" fill="#fff">?</text>`;
      $('.tb-dice').innerHTML = h;
    }
    function drawPlayers() {
      $('.tb-players').innerHTML = v.total.map((t, i) => `<div class="tb-pl${v.turn === i && v.phase === 'flick' && !v.over ? ' turn' : ''}" style="--c:${COLORS[i % 4]}"><span class="av">${api.seat(i).av}</span><b>${nm(i)}</b>
        <span class="tb-t disp">${t}</span><span class="tb-now">+${v.now[i]}</span><span class="tb-left">${'■'.repeat(v.left[i])}</span></div>`).join('');
    }
    function drawMsg() {
      let m;
      if (v.over) m = '끝!';
      else if (v.phase === 'pause' && v.lastRound) m = `${v.lastRound.round}판 끝! ${v.lastRound.score.map((s, i) => `${nm(i)} +${s}`).join(' · ')}`;
      else if (busy) m = '&nbsp;';
      else if (myTurn()) m = '<b class="lr-hot">내 차례!</b> 주사위를 누르고 아래로 당겼다 놓아요';
      else m = `<span class="bd-dots">${nm(v.turn)} 차례</span> · ${v.round}/${v.rounds}판`;
      $('.tb-msg').innerHTML = m;
    }
    function toWorld(cx, cy) { const r = svg.getBoundingClientRect(); return [(cx - r.left) / r.width * 44 - 2, (cy - r.top) / r.height * 108 - 6]; }
    F.aim(svg, {
      toWorld, full: 26,
      enabled: () => myTurn(),
      pick(x, y) {
        if (Math.hypot(x - px, y - v.geo.startY) < 6) return { id: 0, x: px, y: v.geo.startY };
        if (y > v.geo.foul) { px = Math.max(3.5, Math.min(36.5, x)); drawStill(); api.tick(); }
        return null;
      },
      draw(s, ang, pw) {
        const g = $('.tb-aim');
        if (!s) { g.innerHTML = ''; return; }
        const sp = v.geo.speed * Math.max(0.05, pw); const d = sp * sp / (2 * v.geo.fr);
        const ex = s.x + Math.cos(ang) * d; const ey = s.y + Math.sin(ang) * d;
        g.innerHTML = `<line x1="${s.x}" y1="${s.y}" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width=".35" stroke-dasharray="1.2 .8" opacity=".8"/><circle cx="${ex}" cy="${ey}" r="${v.r}" fill="none" stroke="${ey < 0 ? '#FF4757' : '#FFD23F'}" stroke-width=".4"/>
          <text x="${s.x}" y="${s.y + 4.5}" font-size="2.6" text-anchor="middle" fill="#fff">${Math.round(pw * 100)}%</text>`;
      },
      shoot(id, ang, pw) { api.act({ k: 'flick', x: px, a: ang, p: pw }); api.sfx('whoosh'); busy = true; drawStill(); drawMsg(); setTimeout(() => { if (busy && !player) { busy = false; drawStill(); drawMsg(); } }, 3000); }
    });

    function render(view) {
      const first = !v;
      v = view;
      if (first) $('.tb-bg').innerHTML = bg(v.geo);
      const an = v.anim;
      if (an && an.no !== lastAnim && !first) {
        lastAnim = an.no;
        if (player) player.stop();
        busy = true; drawMsg();
        const owners = {}; (v.dice || []).forEach(([id, o]) => { owners[id] = o; });
        // 사라진 주사위 주인은 모르면 던진 사람으로
        an.ids.forEach((id) => { if (owners[id] == null) owners[id] = id === an.id ? an.s : (prevOwners[id] != null ? prevOwners[id] : an.s); });
        const faces = Object.assign({}, an.start);
        const rolls = (an.rolls || []).slice();
        let fi = -1;
        player = F.play(an, (a, b, f) => {
          const k = an.frames.indexOf(a);
          if (k !== fi) { fi = k; while (rolls.length && rolls[0][0] <= k) { const [, id, nf] = rolls.shift(); faces[id] = nf; api.sfx('tick'); } }
          $('.tb-dice').innerHTML = an.ids.map((id, j) => { const p = F.lerpPos(a, b, f, j); return p ? die(owners[id], p[0], p[1], v.r, faces[id] || 1, p[2], false, (k * 37 + j * 50) % 360 * (rolls.some((r) => r[1] === id) ? 1 : 0)) : ''; }).join('');
        }, () => {
          player = null; busy = false;
          drawStill(); drawPlayers(); drawMsg();
          if (myTurn()) api.vibrate(15);
        });
        drawPlayers();
      } else {
        if (an) lastAnim = an.no;
        if (!busy) { drawStill(); drawPlayers(); drawMsg(); }
      }
      prevOwners = {}; (v.dice || []).forEach(([id, o]) => { prevOwners[id] = o; });
      if (v.phase === 'pause' && v.lastRound && roundKey !== `${v.lastRound.round}`) { roundKey = `${v.lastRound.round}`; setTimeout(() => { api.sfx('good'); drawMsg(); }, 800); }
    }
    let prevOwners = {};
    function aimTarget() {
      if (!myTurn()) return null;
      const r = svg.getBoundingClientRect();
      const sc = (x, y) => [r.left + (x + 2) / 44 * r.width, r.top + (y + 6) / 108 * r.height];
      return sc(px, v.geo.startY).concat(sc(20 + (Math.random() - 0.5) * 10, 20));
    }
    return { render, _aimTarget: aimTarget, tick() { if (v && !busy) drawMsg(); }, busy: () => busy, destroy() { if (player) player.stop(); if (ro) ro.disconnect(); el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#4A2C12"/><rect x="6" y="5" width="28" height="7" fill="#7C3AED"/><rect x="6" y="12" width="28" height="7" fill="#2563EB"/><rect x="6" y="19" width="28" height="7" fill="#0891B2"/><rect x="6" y="26" width="28" height="7" fill="#059669"/><rect x="15" y="9" width="8" height="8" rx="2" fill="#E8263B"/><circle cx="17.5" cy="11.5" r="1" fill="#fff"/><circle cx="20.5" cy="14.5" r="1" fill="#fff"/></svg>';

  C.register({
    id: 'tumble',
    kind: 'table',
    icon: ICON,
    rulesText: '주사위를 튕겨 계단판 위로! 멈춘 층의 배수(×1~×4) × 주사위 눈이 점수 · 계단을 넘을 때마다 눈이 바뀌어요 · 끝에서 떨어지면 0 · 남의 주사위를 쳐서 떨어뜨려도 돼요',
    learn: '멀리 보낼수록 배수가 크지만, 너무 세면 낭떠러지로 떨어져요. "얼마나 세게?"를 맞히는 감각과 운이 함께하는 게임이에요!',
    optionsUI: [{ key: 'rounds', label: '판 수', names: { 3: '3판', 2: '2판', 5: '5판' } }],
    bar(v) { return `<span class="cd-info">${v.round}/${v.rounds}판</span>${v.me != null ? `<span class="cd-info">내 점수 <b>${v.total[v.me]}</b> (+${v.now[v.me]})</span>` : ''}`; },
    rankLabel(v, i) { return v && v.total ? `${v.total[i]}점` : ''; },
    mount
  });
})();
