/* 아리채 오락실 · 미니 당구 화면
   - 세로 당구대, 흰 공을 누르고 뒤로 당겼다 놓으면 쳐요 · 점선이 처음 부딪칠 곳까지 보여 줘요
   - 번호 공을 넣으면 번호만큼 점수, 흰 공이 빠지면 -2 */
(function () {
  'use strict';
  const C = window.Cards;
  const F = window.Flick;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BALL = { 0: '#FFFFFF', 1: '#FFC400', 2: '#2E5BD1', 3: '#E8263B', 4: '#8E44AD', 5: '#FF8A3D', 6: '#16A34A' };

  function mount(el, api) {
    el.innerHTML = `<div class="po"><div class="po-players"></div><div class="po-wrap"><div class="po-table">
      <svg class="po-svg" viewBox="-4 -4 64 108"><g class="po-bg"></g><g class="po-balls"></g><g class="po-aim"></g></svg></div></div><div class="po-msg"></div></div>`;
    const $ = (s) => el.querySelector(s);
    const svg = $('.po-svg');
    let v = null; let lastAnim = 0; let player = null; let busy = false;
    const nm = (i) => esc(api.seat(i).name);
    const fit = () => {
      const w = $('.po-wrap'); const b = $('.po-table');
      const s = Math.min(w.clientHeight, w.clientWidth * 108 / 64);
      b.style.height = `${Math.floor(s)}px`; b.style.width = `${Math.floor(s * 64 / 108)}px`;
    };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    requestAnimationFrame(fit);

    function bg(g) {
      return `<rect x="-4" y="-4" width="64" height="108" rx="4" fill="#7A4A1E"/><rect x="-1.2" y="-1.2" width="${g.w + 2.4}" height="${g.h + 2.4}" rx="1.5" fill="#0E6B3C"/>
        <rect x="0" y="0" width="${g.w}" height="${g.h}" fill="#139150"/>
        ${g.pockets.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#0B0B0B"/>`).join('')}
        <line x1="0" y1="78" x2="${g.w}" y2="78" stroke="#fff" stroke-width=".2" opacity=".3"/>
        ${[1, 2, 3].map((k) => `<circle cx="${-2.4}" cy="${k * 25}" r=".5" fill="#F3D9A4"/><circle cx="${g.w + 2.4}" cy="${k * 25}" r=".5" fill="#F3D9A4"/>`).join('')}`;
    }
    function ball(id, x, y, r, op) {
      const c = BALL[id] || '#ccc';
      return `<g opacity="${op == null ? 1 : op}"><circle cx="${x.toFixed(2)}" cy="${(y + 0.35).toFixed(2)}" r="${r}" fill="rgba(0,0,0,.35)"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="${c}"/>
        ${id ? `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(r * 0.52).toFixed(2)}" fill="#fff"/><text x="${x.toFixed(2)}" y="${(y + r * 0.36).toFixed(2)}" font-size="${(r * 0.95).toFixed(2)}" text-anchor="middle" font-weight="800" fill="#1C1733">${id}</text>` : ''}
        <circle cx="${(x - r * 0.35).toFixed(2)}" cy="${(y - r * 0.4).toFixed(2)}" r="${(r * 0.25).toFixed(2)}" fill="#fff" opacity=".55"/></g>`;
    }
    const myTurn = () => v && !busy && v.me != null && v.toAct === v.me;
    function drawStill() {
      $('.po-balls').innerHTML = v.balls.map(([id, x, y]) => ball(id, x, y, v.r)).join('') + (myTurn() ? (() => { const c = v.balls.find((b) => b[0] === 0); return c ? `<circle cx="${c[1]}" cy="${c[2]}" r="${v.r + 0.8}" fill="none" stroke="#FFD23F" stroke-width=".4"/>` : ''; })() : '');
    }
    function drawPlayers() {
      $('.po-players').innerHTML = v.score.map((s, i) => `<div class="po-pl${v.turn === i && !v.over ? ' turn' : ''}"><span class="av">${api.seat(i).av}</span><b>${nm(i)}</b><span class="po-sc disp">${s}</span>
        <span class="po-pot">${(v.potted[i] || []).map((n) => `<i style="background:${BALL[n]}">${n}</i>`).join('')}</span></div>`).join('');
    }
    function drawMsg() {
      let m = '';
      if (v.over) m = '끝!';
      else if (busy) m = '&nbsp;';
      else if (myTurn()) m = '<b class="lr-hot">내 차례!</b> 흰 공을 누르고 뒤로 당겼다 놓아요';
      else m = `<span class="bd-dots">${nm(v.turn)} 차례</span>`;
      $('.po-msg').innerHTML = m;
    }
    // 조준선: 처음 부딪칠 공 또는 쿠션까지
    function ray(x, y, ang) {
      const dx = Math.cos(ang); const dy = Math.sin(ang); let best = 200; let hit = null;
      v.balls.forEach(([id, bx, by]) => {
        if (id === 0) return;
        const fx = bx - x; const fy = by - y; const t = fx * dx + fy * dy; if (t <= 0) return;
        const d2 = fx * fx + fy * fy - t * t; const rr = (2 * v.r) ** 2; if (d2 > rr) return;
        const tt = t - Math.sqrt(rr - d2); if (tt < best) { best = tt; hit = [bx, by]; }
      });
      const g = v.geo;
      [[(v.r - x) / dx, dx < 0], [(g.w - v.r - x) / dx, dx > 0], [(v.r - y) / dy, dy < 0], [(g.h - v.r - y) / dy, dy > 0]].forEach(([t, ok]) => { if (ok && t > 0 && t < best) { best = t; hit = null; } });
      return { t: best, hit };
    }
    function toWorld(cx, cy) { const r = svg.getBoundingClientRect(); return [(cx - r.left) / r.width * 64 - 4, (cy - r.top) / r.height * 108 - 4]; }
    F.aim(svg, {
      toWorld, full: 32,
      enabled: () => myTurn(),
      pick(x, y) { const c = v.balls.find((b) => b[0] === 0); return c && Math.hypot(c[1] - x, c[2] - y) < 8 ? { id: 0, x: c[1], y: c[2] } : null; },
      draw(s, ang, pw) {
        const g = $('.po-aim');
        if (!s) { g.innerHTML = ''; return; }
        const r = ray(s.x, s.y, ang);
        const ex = s.x + Math.cos(ang) * r.t; const ey = s.y + Math.sin(ang) * r.t;
        let h = `<line x1="${s.x}" y1="${s.y}" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width=".3" stroke-dasharray="1 .7" opacity=".85"/><circle cx="${ex}" cy="${ey}" r="${v.r}" fill="none" stroke="#fff" stroke-width=".3" opacity=".8"/>`;
        if (r.hit) { const hx = r.hit[0] - ex; const hy = r.hit[1] - ey; const L = Math.hypot(hx, hy) || 1; h += `<line x1="${r.hit[0]}" y1="${r.hit[1]}" x2="${r.hit[0] + hx / L * 12}" y2="${r.hit[1] + hy / L * 12}" stroke="#FFD23F" stroke-width=".35" stroke-dasharray=".8 .6"/>`; }
        // 큐대
        const bx = s.x - Math.cos(ang) * (v.r + 1 + pw * 8); const by = s.y - Math.sin(ang) * (v.r + 1 + pw * 8);
        h += `<line x1="${bx}" y1="${by}" x2="${bx - Math.cos(ang) * 40}" y2="${by - Math.sin(ang) * 40}" stroke="#C98A4B" stroke-width="1.1" stroke-linecap="round"/>
          <text x="${s.x}" y="${s.y + v.r + 4}" font-size="2.6" text-anchor="middle" fill="#fff">${Math.round(pw * 100)}%</text>`;
        g.innerHTML = h;
      },
      shoot(id, ang, pw) { api.act({ k: 'shot', a: ang, p: pw }); api.sfx('crack'); busy = true; drawStill(); drawMsg(); setTimeout(() => { if (busy && !player) { busy = false; drawStill(); drawMsg(); } }, 3000); }
    });

    function render(view) {
      const first = !v;
      v = view;
      if (first) $('.po-bg').innerHTML = bg(v.geo);
      const an = v.anim;
      if (an && an.no !== lastAnim && !first) {
        lastAnim = an.no;
        if (player) player.stop();
        busy = true; drawMsg();
        player = F.play(an, (a, b, f) => {
          $('.po-balls').innerHTML = an.ids.map((id, j) => { const p = F.lerpPos(a, b, f, j); return p ? ball(id, p[0], p[1], v.r, p[2]) : ''; }).join('');
        }, () => {
          player = null; busy = false;
          const L = v.last;
          if (L) {
            if (L.scratch) { api.say(`${nm(L.s)}: 흰 공이 빠졌어요! -2점`); api.sfx('bad'); }
            else if (L.pots.length) { api.say(`${nm(L.s)}: 쏙! +${L.gain}점 · 한 번 더`); api.sfx('good'); api.vibrate(30); }
          }
          drawStill(); drawPlayers(); drawMsg();
          if (myTurn()) api.vibrate(15);
        });
        return;
      }
      if (an) lastAnim = an.no;
      if (!busy) { drawStill(); drawPlayers(); drawMsg(); }
    }
    function aimTarget() {
      if (!myTurn()) return null;
      const c = v.balls.find((b) => b[0] === 0); const t = v.balls.find((b) => b[0] !== 0);
      if (!c || !t) return null;
      const r = svg.getBoundingClientRect();
      const sc = (x, y) => [r.left + (x + 4) / 64 * r.width, r.top + (y + 4) / 108 * r.height];
      return sc(c[1], c[2]).concat(sc(t[1], t[2]));
    }
    return { render, _aimTarget: aimTarget, tick() { if (v && !busy) drawMsg(); }, busy: () => busy, destroy() { if (player) player.stop(); if (ro) ro.disconnect(); el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#7A4A1E"/><rect x="6" y="6" width="28" height="28" rx="2" fill="#139150"/><circle cx="8" cy="8" r="2.5" fill="#111"/><circle cx="32" cy="32" r="2.5" fill="#111"/><circle cx="17" cy="24" r="3.4" fill="#fff"/><circle cx="25" cy="15" r="3.4" fill="#FFC400"/><circle cx="25" cy="15" r="1.6" fill="#fff"/></svg>';

  C.register({
    id: 'pool',
    kind: 'table',
    icon: ICON,
    rulesText: '흰 공을 당겼다 놓아서 쳐요 · 번호 공을 구멍에 넣으면 번호만큼 점수 + 한 번 더 · 흰 공이 빠지면 -2점 · 공이 다 들어가면 점수가 가장 높은 사람이 1등',
    learn: '당구공은 부딪칠 때 "들어온 각도와 나가는 각도가 같아요"(쿠션). 그리고 흰 공이 번호 공의 어디를 맞히느냐에 따라 번호 공이 가는 방향이 정해져요 — 점선이 도와줘요!',
    bar(v) { return v.me != null ? `<span class="cd-info">내 점수 <b>${v.score[v.me]}</b></span><span class="cd-info">남은 공 ${v.balls.length - 1}개</span>` : ''; },
    rankLabel(v, i) { return v && v.score ? `${v.score[i]}점` : ''; },
    mount
  });
})();
