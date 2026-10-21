/* 아리채 오락실 · 컬링 화면
   - 세로로 긴 얼음판. 아래 출발점의 스톤을 누르고 아래로 당겼다 놓으면 위로 밀려가요
   - 당기는 동안 '멈출 곳'이 점선 동그라미로 보여요 (다른 스톤에 부딪히지 않으면)
   - 휘기: ↺ 왼쪽 · 곧게 · ↻ 오른쪽 (끝에서 살짝 휘어요) */
(function () {
  'use strict';
  const C = window.Cards;
  const F = window.Flick;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TEAM = ['#E8263B', '#2E5BD1'];
  const TNAME = ['빨강', '파랑'];

  function sheetSVG(g) {
    const [bx, by] = g.button;
    return `<rect x="0" y="0" width="${g.w}" height="${g.h}" fill="url(#cu-ice)"/>
      <circle cx="${bx}" cy="${by}" r="${g.house}" fill="#3B82F6" opacity=".85"/><circle cx="${bx}" cy="${by}" r="${g.house * 0.66}" fill="#F7FBFF"/>
      <circle cx="${bx}" cy="${by}" r="${g.house * 0.33}" fill="#E8263B" opacity=".85"/><circle cx="${bx}" cy="${by}" r="1" fill="#F7FBFF"/>
      <line x1="0" y1="${by}" x2="${g.w}" y2="${by}" stroke="#1C1733" stroke-width=".18" opacity=".5"/><line x1="${bx}" y1="2" x2="${bx}" y2="${g.h - 2}" stroke="#1C1733" stroke-width=".12" opacity=".35"/>
      <line x1="0" y1="${g.hog}" x2="${g.w}" y2="${g.hog}" stroke="#E8263B" stroke-width=".45"/><text x="1" y="${g.hog - 0.8}" font-size="1.8" fill="#E8263B">호그 라인 (여기는 넘겨야 해요)</text>
      <line x1="0" y1="1.2" x2="${g.w}" y2="1.2" stroke="#1C1733" stroke-width=".25" opacity=".5"/>
      <circle cx="${g.start[0]}" cy="${g.start[1]}" r="2.2" fill="none" stroke="#1C1733" stroke-width=".2" stroke-dasharray=".6 .5" opacity=".5"/>`;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="cu"><div class="cu-score"></div><div class="cu-wrap"><div class="cu-sheet">
      <svg class="cu-svg" viewBox="-1 -1 32 102"><defs><linearGradient id="cu-ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EAF6FF"/><stop offset="1" stop-color="#D7ECFA"/></linearGradient>
        <radialGradient id="cu-g" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#E5E7EB"/><stop offset="1" stop-color="#8E959F"/></radialGradient></defs>
        <g class="cu-bg"></g><g class="cu-stones"></g><g class="cu-aim"></g></svg></div></div>
      <div class="cu-act"><div class="seg cu-spin"><button type="button" data-spin="-1">↺ 왼쪽</button><button type="button" data-spin="0" class="on">곧게</button><button type="button" data-spin="1">↻ 오른쪽</button></div><div class="cu-msg"></div></div></div>`;
    const $ = (s) => el.querySelector(s);
    const svg = $('.cu-svg');
    let v = null; let lastAnim = 0; let player = null; let busy = false; let spin = 0; let prevStones = []; let endKey = '';
    const nm = (i) => esc(api.seat(i).name);
    const fit = () => {
      const w = $('.cu-wrap'); const b = $('.cu-sheet');
      const h = w.clientHeight; const ww = w.clientWidth;
      const s = Math.min(h, ww * 102 / 32);
      b.style.height = `${Math.floor(s)}px`; b.style.width = `${Math.floor(s * 32 / 102)}px`;
    };
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);
    requestAnimationFrame(fit);

    function stone(owner, x, y, r, op, hl) {
      return `<g opacity="${op == null ? 1 : op}"><circle cx="${x.toFixed(2)}" cy="${(y + 0.25).toFixed(2)}" r="${r}" fill="rgba(0,0,0,.2)"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="url(#cu-g)" ${hl ? 'stroke="#FFD23F" stroke-width=".35"' : ''}/>
        <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(r * 0.62).toFixed(2)}" fill="${TEAM[owner]}"/><rect x="${(x - r * 0.15).toFixed(2)}" y="${(y - r * 0.5).toFixed(2)}" width="${(r * 0.3).toFixed(2)}" height="${(r * 0.55).toFixed(2)}" rx=".15" fill="#fff" opacity=".8"/></g>`;
    }
    function myTurn() { return v && !busy && v.me != null && v.toAct === v.me; }
    function drawStill() {
      let h = v.stones.map(([id, o, x, y]) => stone(o, x, y, v.r)).join('');
      if (myTurn()) h += stone(v.team, v.geo.start[0], v.geo.start[1], v.r, 1, true);
      $('.cu-stones').innerHTML = h;
    }
    function drawScore() {
      const t = [0, 1].map((k) => {
        const left = v.per - v.thrown[k];
        return `<div class="cu-team${v.team === k && v.phase === 'throw' ? ' turn' : ''}" style="--c:${TEAM[k]}"><b class="disp">${v.score[k]}</b>
          <span class="cu-tn">${TNAME[k]}${v.hammer === k ? ' 🔨' : ''}</span><span class="cu-left">${'●'.repeat(Math.max(0, left))}${'○'.repeat(Math.max(0, v.per - left))}</span></div>`;
      });
      const who = v.turn >= 0 && v.phase === 'throw' ? `<span class="av">${api.seat(v.turn).av}</span>${nm(v.turn)}` : '';
      $('.cu-score').innerHTML = `${t[0]}<div class="cu-mid"><span>${v.end}/${v.ends} 엔드</span><span class="cu-who">${who}</span></div>${t[1]}`;
    }
    function drawAct() {
      const mine = myTurn();
      $('.cu-spin').style.visibility = mine ? 'visible' : 'hidden';
      let m = '';
      if (v.over) m = '끝!';
      else if (v.phase === 'endpause' && v.lastEnd) m = v.lastEnd.team < 0 ? `${v.lastEnd.end}엔드: 아무도 점수 없음` : `${v.lastEnd.end}엔드: <b style="color:${TEAM[v.lastEnd.team]}">${TNAME[v.lastEnd.team]}</b> +${v.lastEnd.n}점!`;
      else if (busy) m = '&nbsp;';
      else if (mine) m = '<b class="lr-hot">내 차례!</b> 아래 스톤을 누르고 아래로 당겼다 놓아요';
      else if (v.turn >= 0) m = `<span class="bd-dots">${nm(v.turn)} 차례</span>`;
      $('.cu-msg').innerHTML = m;
    }
    function toWorld(cx, cy) {
      const r = svg.getBoundingClientRect();
      return [(cx - r.left) / r.width * 32 - 1, (cy - r.top) / r.height * 102 - 1];
    }
    F.aim(svg, {
      toWorld, full: 30,
      enabled: () => myTurn(),
      pick(x, y) { const [sx, sy] = v.geo.start; return Math.hypot(x - sx, y - sy) < 7 ? { id: 0, x: sx, y: sy } : null; },
      draw(s, ang, pw) {
        const g = $('.cu-aim');
        if (!s) { g.innerHTML = ''; return; }
        const sp = v.geo.speed * Math.max(0.05, pw); const d = sp * sp / (2 * v.geo.fr);
        const ex = s.x + Math.cos(ang) * d; const ey = s.y + Math.sin(ang) * d;
        const short = ey > v.geo.hog;
        g.innerHTML = `<line x1="${s.x}" y1="${s.y}" x2="${ex}" y2="${ey}" stroke="${short ? '#E8263B' : '#1C1733'}" stroke-width=".3" stroke-dasharray="1 .7" opacity=".7"/>
          <circle cx="${ex}" cy="${ey}" r="${v.r}" fill="none" stroke="${short ? '#E8263B' : '#16A34A'}" stroke-width=".35" stroke-dasharray=".6 .4"/>
          <text x="${Math.min(26, Math.max(4, s.x))}" y="${s.y + 4.5}" font-size="2.4" text-anchor="middle" fill="#1C1733">${Math.round(pw * 100)}%${short ? ' · 너무 약해요' : ''}</text>`;
      },
      shoot(id, ang, pw) { api.act({ k: 'throw', a: ang, p: pw, s: spin }); api.sfx('whoosh'); busy = true; drawStill(); drawAct(); setTimeout(() => { if (busy && !player) { busy = false; drawStill(); drawAct(); } }, 3000); }
    });

    function render(view) {
      const first = !v;
      v = view;
      if (first) { $('.cu-bg').innerHTML = sheetSVG(v.geo); }
      const an = v.anim;
      if (an && an.no !== lastAnim && !first) {
        lastAnim = an.no;
        if (player) player.stop();
        busy = true; drawScore(); drawAct();
        const owners = {}; prevStones.forEach(([id, o]) => { owners[id] = o; }); v.stones.forEach(([id, o]) => { owners[id] = o; });
        const thrower = an.s % 2; owners[an.id] = owners[an.id] == null ? thrower : owners[an.id];
        player = F.play(an, (a, b, f) => {
          $('.cu-stones').innerHTML = an.ids.map((id, j) => { const p = F.lerpPos(a, b, f, j); return p ? stone(owners[id], p[0], p[1], v.r, p[2]) : ''; }).join('');
        }, () => {
          player = null; busy = false;
          if (an.hog) api.say('호그 라인을 못 넘어서 빠졌어요');
          drawStill(); drawScore(); drawAct();
          if (myTurn()) api.vibrate(15);
        });
      } else {
        if (an) lastAnim = an.no;
        if (!busy) { drawStill(); drawScore(); drawAct(); }
      }
      prevStones = v.stones.map((s) => [s[0], s[1]]);
      if (v.phase === 'endpause' && v.lastEnd && endKey !== `${v.lastEnd.end}`) { endKey = `${v.lastEnd.end}`; setTimeout(() => api.sfx(v.lastEnd.team >= 0 ? 'good' : 'soft'), 600); }
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-spin]');
      if (b) { spin = Number(b.dataset.spin); el.querySelectorAll('[data-spin]').forEach((x) => x.classList.toggle('on', x === b)); api.tick(); }
    });
    function aimTarget() {
      if (!myTurn()) return null;
      const r = svg.getBoundingClientRect();
      const sc = (x, y) => [r.left + (x + 1) / 32 * r.width, r.top + (y + 1) / 102 * r.height];
      return sc(v.geo.start[0], v.geo.start[1]).concat(sc(v.geo.button[0] + (Math.random() - 0.5) * 4, v.geo.button[1]));
    }
    return { render, _aimTarget: aimTarget, tick() { if (v && !busy) drawAct(); }, busy: () => busy, destroy() { if (player) player.stop(); if (ro) ro.disconnect(); el.innerHTML = ''; } };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#DCEFFC"/><circle cx="20" cy="15" r="10" fill="#3B82F6"/><circle cx="20" cy="15" r="6.5" fill="#fff"/><circle cx="20" cy="15" r="3.3" fill="#E8263B"/><circle cx="14" cy="30" r="4.5" fill="#9AA3AD"/><circle cx="14" cy="30" r="2.8" fill="#E8263B"/><rect x="13" y="25" width="2" height="3" fill="#fff"/></svg>';

  C.register({
    id: 'curling',
    kind: 'table',
    icon: ICON,
    rulesText: '스톤을 당겼다 놓아 표적(하우스) 쪽으로 밀어요 · 한 엔드에 팀마다 4개 · 중심(버튼)에 가장 가까운 팀이 점수 · 상대 스톤을 쳐 내도 돼요 · 휘기로 돌아 들어가기!',
    learn: '컬링은 스코틀랜드에서 시작된 겨울 스포츠예요. "빙판 위의 체스"라고 불릴 만큼 작전이 중요해요. 마지막 스톤(🔨 해머)을 가진 팀이 유리해요!',
    optionsUI: [{ key: 'ends', label: '엔드 수', names: { 3: '3엔드', 2: '2엔드', 4: '4엔드' } }],
    bar(v) { return `<span class="cd-info">${v.end}/${v.ends} 엔드</span><span class="cd-info">빨강 <b>${v.score[0]}</b> : <b>${v.score[1]}</b> 파랑</span>`; },
    rankLabel(v, i) { return v && v.score ? `${['빨강', '파랑'][i % 2]} ${v.score[i % 2]}점` : ''; },
    mount
  });
})();
