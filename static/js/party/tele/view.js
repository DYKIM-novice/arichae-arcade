/* 아리채 오락실 · 텔레스트레이션 (그림 전달) 화면
   - 그리기: 손가락으로 그려요 (색 8가지 · 굵기 3가지 · 지우개 · 되돌리기 · 다 지우기). 시간이 다 되면 그린 데까지 저절로 보내요
   - 맞히기: 앞사람 그림을 보고 무엇인지 글로
   - 펼쳐 보기: 공책을 한 장씩 [다음 ▶] (누구나), 마음에 드는 칸에 ♥
   그림은 선 모음으로 서버에 보내요: [색, 굵기, x1, y1, x2, y2, ...] (0~1000 좌표) */
(function () {
  'use strict';
  const C = window.Cards;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#1C1733', '#E8263B', '#2E5BD1', '#22B35E', '#FFC400', '#8B5A2B', '#FF7EB3', '#9B59B6', '#FF8A3D', '#FFFFFF'];
  const WIDTH = [0, 7, 16, 32, 60];    // 0~1000 기준 굵기
  const ERASER = 9;

  // 그림 → SVG (펼쳐 보기·맞히기에 써요)
  function drawingSVG(d) {
    if (!d || !d.length) return '<svg viewBox="0 0 1000 1000" class="tl-svg"><rect width="1000" height="1000" fill="#fff"/><text x="500" y="520" text-anchor="middle" font-size="64" fill="#B5AFCF">(빈 그림)</text></svg>';
    const paths = d.map((st) => {
      const c = COLORS[st[0]] || '#000'; const w = WIDTH[st[1]] || 12;
      const p = st.slice(2);
      if (p.length === 2) return `<circle cx="${p[0]}" cy="${p[1]}" r="${w / 2}" fill="${c}"/>`;
      let dd = `M${p[0]} ${p[1]}`;
      for (let k = 2; k < p.length - 2; k += 2) {
        const mx = (p[k] + p[k + 2]) / 2; const my = (p[k + 1] + p[k + 3]) / 2;
        dd += ` Q${p[k]} ${p[k + 1]} ${mx} ${my}`;
      }
      dd += ` L${p[p.length - 2]} ${p[p.length - 1]}`;
      return `<path d="${dd}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }).join('');
    return `<svg viewBox="0 0 1000 1000" class="tl-svg"><rect width="1000" height="1000" fill="#fff"/>${paths}</svg>`;
  }

  function mount(el, api) {
    el.innerHTML = `<div class="tl">
      <div class="tl-top"><div class="tl-title"></div><div class="lr-bar"><i></i></div><div class="tl-prog"></div></div>
      <div class="tl-main"></div>
    </div>`;
    const $ = (s) => el.querySelector(s);
    let v = null; let mainKey = ''; let strokes = []; let color = 0; let width = 2; let sentKey = ''; let autoT = 0;
    let canvas = null; let ctx = null; let cur = null; let revCount = -1;

    const nm = (i) => esc(api.seat(i).name);
    const av = (i) => api.seat(i).av;

    /* ---------- 그리기 판 ---------- */
    function setupCanvas() {
      canvas = $('.tl-canvas');
      if (!canvas) return;
      const box = canvas.parentElement;
      const size = Math.floor(Math.min(box.clientWidth, box.clientHeight));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = canvas.style.height = `${size}px`;
      canvas.width = canvas.height = Math.round(size * dpr);
      ctx = canvas.getContext('2d');
      redraw();
      const pos = (e) => { const r = canvas.getBoundingClientRect(); return [Math.round(Math.max(0, Math.min(1000, (e.clientX - r.left) / r.width * 1000))), Math.round(Math.max(0, Math.min(1000, (e.clientY - r.top) / r.height * 1000)))]; };
      canvas.addEventListener('pointerdown', (e) => {
        if (!v || v.phase !== 'draw' || v.mineDone) return;
        e.preventDefault(); canvas.setPointerCapture(e.pointerId);
        const [x, y] = pos(e);
        cur = [color, color === ERASER ? 4 : width, x, y];
        strokes.push(cur); redraw();
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!cur) return;
        e.preventDefault();
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const ev of evs) {
          const [x, y] = pos(ev);
          const lx = cur[cur.length - 2]; const ly = cur[cur.length - 1];
          if (Math.abs(x - lx) + Math.abs(y - ly) >= 5) cur.push(x, y);
        }
        redraw();
      });
      const end = () => { cur = null; updTools(); };
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointercancel', end);
    }
    function redraw() {
      if (!ctx) return;
      const s = canvas.width / 1000;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const st of strokes) {
        ctx.strokeStyle = ctx.fillStyle = COLORS[st[0]];
        ctx.lineWidth = WIDTH[st[1]] * s;
        const p = st.slice(2);
        if (p.length === 2) { ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, WIDTH[st[1]] * s / 2, 0, Math.PI * 2); ctx.fill(); continue; }
        ctx.beginPath(); ctx.moveTo(p[0] * s, p[1] * s);
        for (let k = 2; k < p.length - 2; k += 2) ctx.quadraticCurveTo(p[k] * s, p[k + 1] * s, (p[k] + p[k + 2]) / 2 * s, (p[k + 1] + p[k + 3]) / 2 * s);
        ctx.lineTo(p[p.length - 2] * s, p[p.length - 1] * s);
        ctx.stroke();
      }
    }
    function toolsHTML() {
      return `<div class="tl-tools">${COLORS.slice(0, 9).map((c, k) => `<button type="button" class="tl-col${k === color ? ' on' : ''}" data-col="${k}" style="background:${c}" aria-label="색 ${k + 1}"></button>`).join('')}
        <button type="button" class="tl-col er${color === ERASER ? ' on' : ''}" data-col="${ERASER}" aria-label="지우개">🧽</button></div>
        <div class="tl-tools">${[1, 2, 3].map((w) => `<button type="button" class="tl-w${w === width ? ' on' : ''}" data-w="${w}"><i style="width:${w * 5}px;height:${w * 5}px"></i></button>`).join('')}
        <button type="button" class="tl-t" data-tl="undo">↶ 되돌리기</button><button type="button" class="tl-t" data-tl="clear">다 지우기</button></div>`;
    }
    function updTools() {
      el.querySelectorAll('[data-col]').forEach((b) => b.classList.toggle('on', Number(b.dataset.col) === color));
      el.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('on', Number(b.dataset.w) === width));
    }
    function sendDrawing() {
      const key = `d${v.step}`;
      if (sentKey === key) return;
      sentKey = key;
      // 너무 크면 점을 솎아서 보내요
      let d = strokes.map((s) => s.slice());
      let pts = d.reduce((a, s) => a + s.length - 2, 0);
      while (pts > 11000) { d = d.map((s) => [s[0], s[1]].concat(s.slice(2).filter((_, k) => (k >> 1) % 2 === 0 || k >= s.length - 4))); pts = d.reduce((a, s) => a + s.length - 2, 0); }
      api.act({ k: 'draw', d });
      api.sfx('pop');
    }

    /* ---------- 화면 ---------- */
    function title() {
      if (v.phase === 'draw' || v.phase === 'guess') {
        const n = `${v.step + 1}/${v.steps}번째`;
        return v.phase === 'draw' ? `✏️ 그리기 · ${n}` : `🤔 맞히기 · ${n}`;
      }
      if (v.phase === 'reveal' || v.phase === 'done') return `📖 <b>${nm(v.rev.owner)}</b>의 공책 펼쳐 보기 (${v.rev.b + 1}/${v.n})`;
      return '';
    }

    function drawMain() {
      const main = $('.tl-main');
      const ph = v.phase;
      if (ph === 'draw' || ph === 'guess') {
        const key = `${ph}${v.step}:${v.me == null ? 'w' : v.mineDone}`;
        if (v.me == null) { if (mainKey !== key) { mainKey = key; main.innerHTML = '<div class="lr-hint">구경하는 중이에요 · 다 그리면 함께 펼쳐 봐요</div>'; } return; }
        if (v.mineDone) {
          if (mainKey !== key) { mainKey = key; main.innerHTML = '<div class="tl-wait"><div class="tl-wait-ic">⏳</div><div>보냈어요! 다른 사람을 기다려요</div></div>'; }
          return;
        }
        if (mainKey === key) return;
        mainKey = key;
        const pr = v.prompt || {};
        if (ph === 'draw') {
          strokes = []; color = 0; width = 2;
          const what = pr.t === 'word' ? `<span class="tl-k">제시어</span><b>${esc(pr.v)}</b>` : pr.v ? `<span class="tl-k">앞사람의 답</span><b>${esc(pr.v)}</b>` : '<span class="tl-k">앞사람이 못 썼어요</span><b>아무거나 그려요!</b>';
          main.innerHTML = `<div class="tl-what">${what}<span class="tl-k">을(를) 그려요 · 글자는 쓰면 안 돼요</span></div>
            <div class="tl-board"><canvas class="tl-canvas"></canvas></div>${toolsHTML()}
            <button type="button" class="btn btn-yellow tl-send" data-tl="send">다 그렸어요 ✔</button>`;
          requestAnimationFrame(setupCanvas);
        } else {
          main.innerHTML = `<div class="tl-what"><span class="tl-k">앞사람 그림이에요. 무엇일까요?</span></div>
            <div class="tl-board tl-view">${drawingSVG(pr.v)}</div>
            <form class="lr-form" data-tl-form="1"><input class="lr-in" maxlength="20" placeholder="무엇인지 한 마디로" autocomplete="off" enterkeyhint="send"><button type="submit" class="btn btn-yellow">보내기</button></form>`;
          setTimeout(() => { const i = $('.lr-in'); if (i) i.focus(); }, 80);
        }
        return;
      }
      if (ph === 'reveal' || ph === 'done') {
        const r = v.rev;
        const key = `rev${r.b}:${r.k}:${r.pages.map((p) => p.hearts + (p.mine ? 'm' : '')).join(',')}`;
        if (mainKey === key) return;
        const fresh = !mainKey.startsWith(`rev${r.b}:${r.k}:`);
        mainKey = key;
        const pages = r.pages.map((p, j) => {
          const body = p.t === 'draw' ? `<div class="tl-pic">${drawingSVG(p.v)}</div>` : `<div class="tl-guess">${p.miss || !p.v ? '<i>(못 썼어요)</i>' : `“${esc(p.v)}”`}</div>`;
          const can = v.me != null && p.by !== v.me;
          return `<div class="tl-page${j === r.k - 1 && fresh ? ' new' : ''}"><div class="tl-ph"><span class="av">${av(p.by)}</span><b>${nm(p.by)}</b><span>${p.t === 'draw' ? '그림' : '답'}</span>
            <button type="button" class="tl-heart${p.mine ? ' on' : ''}" data-heart="${j}" ${can ? '' : 'disabled'}>♥ ${p.hearts || ''}</button></div>${body}</div>`;
        }).join('');
        const end = r.k >= r.total;
        const last = r.b + 1 >= v.n;
        const verdict = end ? `<div class="tl-verdict${r.match ? ' ok' : ''}">${r.match ? '🎉 처음 제시어 그대로 돌아왔어요! (참여한 모두 +2)' : `처음 제시어는 <b>${esc(r.word)}</b> 였어요 😆`}</div>` : '';
        main.innerHTML = `<div class="tl-book"><div class="tl-start"><span class="tl-k">처음 제시어</span><b>${esc(r.word)}</b></div>${pages}${verdict}</div>
          ${ph === 'done' ? '' : `<button type="button" class="btn btn-yellow tl-send" data-tl="next">${!end ? '다음 장 ▶' : last ? '결과 보기 🏆' : '다음 공책 ▶'}</button>`}`;
        const bk = $('.tl-book');
        if (fresh) { bk.scrollTop = bk.scrollHeight; if (r.k !== revCount) { api.sfx(end && r.match ? 'fanfare' : 'whoosh'); revCount = r.k; } }
      }
    }

    function drawProg() {
      const p = $('.tl-prog');
      if (v.phase === 'draw' || v.phase === 'guess') {
        p.innerHTML = v.done.map((d, i) => `<span class="tl-pp${d ? ' ok' : ''}"><span class="av">${av(i)}</span>${d ? '✓' : ''}</span>`).join('');
      } else p.innerHTML = v.score ? v.score.map((s, i) => `<span class="tl-pp"><span class="av">${av(i)}</span><b>${s}</b></span>`).join('') : '';
    }

    function tick() {
      if (!v) return;
      const bar = $('.lr-bar i');
      const left = v.deadline ? Math.max(0, v.deadline - api.now()) : 0;
      const total = (v.phase === 'draw' ? v.drawSec : 35) * 1000;
      bar.style.width = v.deadline ? `${Math.min(100, (left / total) * 100)}%` : '0%';
      bar.classList.toggle('low', left < 10000);
    }
    function scheduleAuto() {
      clearTimeout(autoT);
      if (v.phase === 'draw' && v.me != null && !v.mineDone && v.deadline) {
        autoT = setTimeout(() => { if (v && v.phase === 'draw' && !v.mineDone) sendDrawing(); }, Math.max(0, v.deadline - api.now() - 1500));
      }
      if (v.phase === 'guess' && v.me != null && !v.mineDone && v.deadline) {
        autoT = setTimeout(() => { const i = $('.lr-in'); if (v && v.phase === 'guess' && !v.mineDone && i && i.value.trim()) api.act({ k: 'guess', g: i.value.trim() }); }, Math.max(0, v.deadline - api.now() - 1500));
      }
    }

    function render(view) {
      const prev = v;
      v = view;
      $('.tl-title').innerHTML = title();
      drawMain(); drawProg(); tick(); scheduleAuto();
      if (prev && prev.step !== v.step && (v.phase === 'draw' || v.phase === 'guess')) { api.sfx('whoosh'); api.vibrate(30); }
    }

    el.addEventListener('click', (e) => {
      const t = e.target;
      if (!v) return;
      let b;
      if ((b = t.closest('[data-col]'))) { color = Number(b.dataset.col); updTools(); api.tick(); return; }
      if ((b = t.closest('[data-w]'))) { width = Number(b.dataset.w); if (color === ERASER) color = 0; updTools(); api.tick(); return; }
      if ((b = t.closest('[data-heart]'))) { if (!b.disabled) { api.act({ k: 'heart', b: v.rev.b, p: Number(b.dataset.heart) }); api.sfx('pop'); } return; }
      if ((b = t.closest('[data-tl]'))) {
        const k = b.dataset.tl;
        if (k === 'undo') { strokes.pop(); redraw(); return; }
        if (k === 'clear') { if (strokes.length && b.dataset.arm !== '1') { b.dataset.arm = '1'; b.textContent = '한 번 더!'; setTimeout(() => { b.dataset.arm = ''; b.textContent = '다 지우기'; }, 2000); return; } strokes = []; redraw(); return; }
        if (k === 'send') { if (!strokes.length && b.dataset.arm !== '1') { b.dataset.arm = '1'; api.say('아무것도 안 그렸어요. 한 번 더 누르면 빈 그림을 보내요'); return; } sendDrawing(); return; }
        if (k === 'next') { api.act({ k: 'next' }); return; }
      }
    });
    el.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-tl-form]');
      if (!f) return;
      e.preventDefault();
      const txt = f.querySelector('.lr-in').value.trim();
      if (!txt) return;
      api.act({ k: 'guess', g: txt }); api.sfx('pop');
    });
    const onResize = () => { if (canvas && v && v.phase === 'draw') setupCanvas(); };
    window.addEventListener('resize', onResize);

    return { render, tick, destroy() { clearTimeout(autoT); window.removeEventListener('resize', onResize); el.innerHTML = ''; }, _strokes: () => strokes };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#2E9CCA"/><rect x="7" y="8" width="18" height="22" rx="2" fill="#fff"/><path d="M10 24 q4 -10 8 -4 t5 -2" stroke="#E8263B" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="15" y="12" width="18" height="22" rx="2" fill="#FFF6D6" transform="rotate(8 24 23)"/><text x="24" y="27" font-size="9" text-anchor="middle" fill="#1C1733" transform="rotate(8 24 23)">?!</text></svg>';

  C.register({
    id: 'tele',
    kind: 'table',
    icon: ICON,
    rulesText: '제시어를 그림으로 → 옆 사람은 그 그림을 보고 글로 → 다음 사람은 그 글을 다시 그림으로… 다 돌면 공책을 펼쳐 보며 깔깔! · 마음에 드는 칸에 ♥',
    learn: '"말 전달 게임"을 그림으로 하는 거예요. 텔레스트레이션(Telestrations)은 전화(telephone)와 그림(illustration)을 합친 말이에요.',
    optionsUI: [{ key: 'drawSec', label: '그리는 시간', names: { 45: '45초', 60: '60초', 90: '90초' } }],
    bar(v) { return `<span class="cd-info">${v.n}명 · 공책 ${v.n}권</span>`; },
    rankLabel(v, i) { return v && v.score ? `♥ ${v.score[i]}점` : ''; },
    mount,
    drawingSVG
  });
})();
