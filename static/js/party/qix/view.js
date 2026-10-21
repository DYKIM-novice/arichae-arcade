/* 아리채 오락실 · 땅따먹기 화면 (볼피드 · 큐익스 방식) — 내 화면에서 혼자 해요
   - 테두리(밝게 보이는 곳)가 내 땅. 방향 단추(또는 화면을 밀어서)로 움직여요
   - 빈 곳(어두운 곳)으로 들어가면 노란 선이 그어지고, 다시 내 땅에 닿으면 괴물이 없는 쪽이 내 땅이 돼요 → 숨은 그림이 드러나요
   - 선을 긋는 중에 괴물(거미)이 선이나 나를 건드리면 목숨 -1 · 2단계부터 테두리를 도는 불꽃도 조심!
   - 75% 를 차지하면 다음 단계 (5단계까지)
   진행 상황(단계·%·목숨·점수)만 서버에 보내고, 모두 같은 씨앗으로 시작해서 공평해요 */
(function () {
  'use strict';
  const C = window.Cards;
  const A = window.Animals;
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLS = 56; const ROWS = 72;
  const LEVELS = [
    { boss: 1, spd: 10, sparks: 0, animal: 'rabbit', bg: ['#FFD6E8', '#B8E1FF'] },
    { boss: 1, spd: 12, sparks: 1, animal: 'panda', bg: ['#D7F5D0', '#FFF1B8'] },
    { boss: 2, spd: 12, sparks: 1, animal: 'fox', bg: ['#FFE0C2', '#D9C8FF'] },
    { boss: 2, spd: 14, sparks: 2, animal: 'penguin', bg: ['#C8F0FF', '#E8E0FF'] },
    { boss: 3, spd: 14, sparks: 2, animal: 'lion', bg: ['#FFF0B3', '#FFC9C9'] }
  ];
  const DIFF = { easy: { spd: 0.8, goal: 70 }, normal: { spd: 1, goal: 75 }, hard: { spd: 1.2, goal: 80 } };
  const MOVE_MS = 42;

  function rand(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function mount(el, api) {
    el.innerHTML = `<div class="qx"><div class="qx-top"><span class="qx-lv"></span><span class="qx-pct"></span><span class="qx-lives"></span><span class="qx-time disp"></span></div>
      <div class="qx-rivals"></div>
      <div class="qx-wrap"><canvas class="qx-cv"></canvas><div class="qx-banner disp"></div></div>
      <div class="qx-pad"><button type="button" data-d="0,-1" class="up">▲</button><button type="button" data-d="-1,0" class="lt">◀</button><button type="button" data-d="1,0" class="rt">▶</button><button type="button" data-d="0,1" class="dn">▼</button></div></div>`;
    const $ = (s) => el.querySelector(s);
    const cv = $('.qx-cv'); const ctx = cv.getContext('2d');
    let v = null; let g = null; let raf = 0; let cell = 6; let dpr = 1;
    const bgCv = document.createElement('canvas'); const maskCv = document.createElement('canvas');
    let lastSend = 0; let sentDone = false;
    const nm = (i) => esc(api.seat(i).name);

    /* ---------- 크기 ---------- */
    function fit() {
      const w = $('.qx-wrap');
      cell = Math.max(3, Math.floor(Math.min(w.clientWidth / COLS, w.clientHeight / ROWS)));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = COLS * cell * dpr; cv.height = ROWS * cell * dpr;
      cv.style.width = `${COLS * cell}px`; cv.style.height = `${ROWS * cell}px`;
      if (g && g.L) { buildBG(); rebuildMask(); }
    }
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    if (ro) ro.observe(el);

    /* ---------- 판 만들기 ---------- */
    function newLevel(lv) {
      const L = LEVELS[lv - 1]; const D = DIFF[v.diff] || DIFF.normal;
      const r = rand(v.seed + lv * 7919);
      const grid = new Uint8Array(COLS * ROWS);
      for (let x = 0; x < COLS; x++) { grid[x] = 1; grid[(ROWS - 1) * COLS + x] = 1; }
      for (let y = 0; y < ROWS; y++) { grid[y * COLS] = 1; grid[y * COLS + COLS - 1] = 1; }
      const bosses = [];
      for (let k = 0; k < L.boss; k++) {
        const a = (r() * 0.6 + 0.2) * Math.PI / 2 + (Math.floor(r() * 4)) * Math.PI / 2;
        bosses.push({ x: 12 + r() * (COLS - 24), y: 12 + r() * (ROWS - 30), vx: Math.cos(a), vy: Math.sin(a), rad: 1.7, spd: L.spd * D.spd, wob: r() * 6 });
      }
      const sparks = [];
      for (let k = 0; k < L.sparks; k++) sparks.push({ x: k % 2 ? COLS - 1 : 0, y: 0, dx: k % 2 ? -1 : 1, dy: 0, t: 0 });
      g = Object.assign(g || {}, { lv, L, grid, bosses, sparks, mx: Math.floor(COLS / 2), my: ROWS - 1, drawing: false, trail: [], start: null,
        claimed: 0, inner: (COLS - 2) * (ROWS - 2), dir: null, moveT: 0, inv: 0, goal: D.goal, r, banner: '', bannerT: 0, levelT: performance.now() });
      buildBG(); rebuildMask();
      banner(`${lv}단계!`, 1200);
    }
    function buildBG() {
      const L = g.L; const W = COLS * cell * dpr; const H = ROWS * cell * dpr;
      bgCv.width = W; bgCv.height = H;
      const b = bgCv.getContext('2d');
      const gr = b.createLinearGradient(0, 0, W, H); gr.addColorStop(0, L.bg[0]); gr.addColorStop(1, L.bg[1]);
      b.fillStyle = gr; b.fillRect(0, 0, W, H);
      // 숨은 그림: 큰 캐릭터
      const img = new Image();
      img.onload = () => { const s = Math.min(W, H) * 0.92; b.drawImage(img, (W - s) / 2, (H - s) / 2 + H * 0.02, s, s); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(A.svg(L.animal, 400).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
      for (let k = 0; k < 30; k++) { b.fillStyle = `rgba(255,255,255,${0.15 + (k % 3) * 0.08})`; b.beginPath(); b.arc((k * 97) % W, (k * 173) % H, (4 + (k % 5) * 3) * dpr, 0, 7); b.fill(); }
    }
    function rebuildMask() {
      maskCv.width = COLS * cell * dpr; maskCv.height = ROWS * cell * dpr;
      const m = maskCv.getContext('2d');
      m.fillStyle = '#16122B'; m.fillRect(0, 0, maskCv.width, maskCv.height);
      m.strokeStyle = 'rgba(255,255,255,.04)'; m.lineWidth = 1;
      for (let x = 0; x < COLS; x += 4) { m.beginPath(); m.moveTo(x * cell * dpr, 0); m.lineTo(x * cell * dpr, maskCv.height); m.stroke(); }
      for (let y = 0; y < ROWS; y += 4) { m.beginPath(); m.moveTo(0, y * cell * dpr); m.lineTo(maskCv.width, y * cell * dpr); m.stroke(); }
      for (let i = 0; i < COLS * ROWS; i++) if (g.grid[i] === 1) clearCell(i % COLS, Math.floor(i / COLS));
    }
    function clearCell(x, y) { maskCv.getContext('2d').clearRect(x * cell * dpr, y * cell * dpr, cell * dpr + 0.5, cell * dpr + 0.5); }

    /* ---------- 움직임 ---------- */
    const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? 1 : g.grid[y * COLS + x]);
    function stepMarker() {
      if (!g.dir || g.dead) return;
      const nx = g.mx + g.dir[0]; const ny = g.my + g.dir[1];
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
      const c = at(nx, ny);
      if (!g.drawing) {
        if (c === 1) { g.mx = nx; g.my = ny; return; }
        if (c === 0) { g.drawing = true; g.start = [g.mx, g.my]; g.trail = []; }
      }
      if (c === 2) return;                            // 내 선은 못 지나가요
      if (c === 0) { g.grid[ny * COLS + nx] = 2; g.trail.push(ny * COLS + nx); g.mx = nx; g.my = ny; return; }
      if (c === 1) { g.mx = nx; g.my = ny; closeArea(); }
    }
    function closeArea() {
      g.trail.forEach((i) => { g.grid[i] = 1; clearCell(i % COLS, Math.floor(i / COLS)); });
      const before = g.claimed;
      // 괴물이 있는 쪽은 그대로, 나머지 빈 곳은 내 땅
      const seen = new Uint8Array(COLS * ROWS); const st = [];
      g.bosses.forEach((b) => { const i = Math.floor(b.y) * COLS + Math.floor(b.x); if (g.grid[i] === 0 && !seen[i]) { seen[i] = 1; st.push(i); } });
      while (st.length) {
        const i = st.pop(); const x = i % COLS; const y = (i - x) / COLS;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const j = (y + dy) * COLS + x + dx; if (x + dx >= 0 && x + dx < COLS && y + dy >= 0 && y + dy < ROWS && !seen[j] && g.grid[j] === 0) { seen[j] = 1; st.push(j); } });
      }
      let got = g.trail.length;
      for (let i = 0; i < COLS * ROWS; i++) if (g.grid[i] === 0 && !seen[i]) { g.grid[i] = 1; clearCell(i % COLS, Math.floor(i / COLS)); got++; }
      g.claimed += got; g.drawing = false; g.trail = [];
      const pct = Math.floor(g.claimed / g.inner * 100);
      const gain = Math.round(got * g.lv * (got > 400 ? 1.5 : 1));
      g.score += gain;
      if (got > 30) { api.sfx(got > 400 ? 'perfect' : 'good'); if (got > 400) banner(`와! +${gain}`, 900); }
      else api.sfx('pop');
      void before;
      if (pct >= g.goal) levelClear();
      send(true);
    }
    function loseLife() {
      if (g.inv > performance.now()) return;
      g.lives -= 1;
      api.sfx('crash'); api.vibrate([60, 40, 60]);
      g.trail.forEach((i) => { g.grid[i] = 0; });
      if (g.start) { g.mx = g.start[0]; g.my = g.start[1]; }
      g.drawing = false; g.trail = []; g.inv = performance.now() + 1800;
      if (g.lives <= 0) { g.dead = true; banner('게임 끝!', 99999); send(true, true); return; }
      banner(`앗! 목숨 ${g.lives}개 남음`, 1100);
      send(true);
    }
    function levelClear() {
      const pct = Math.floor(g.claimed / g.inner * 100);
      const bonus = 1000 * g.lv + (pct - g.goal) * 100 + g.lives * 200;
      g.score += bonus;
      api.sfx('fanfare'); api.vibrate([40, 30, 80]);
      if (g.lv >= LEVELS.length) { g.dead = true; g.won = true; banner(`다 했어요! +${bonus}`, 99999); send(true, true); return; }
      banner(`${g.lv}단계 성공! +${bonus}`, 1500);
      g.pause = performance.now() + 1600;
      setTimeout(() => { if (g && !g.dead) newLevel(g.lv + 1); }, 1600);
    }
    function moveBoss(b, dt) {
      b.wob += dt;
      // 가끔 살짝 방향을 틀어요 (같은 씨앗이라 모두 똑같이)
      if (Math.sin(b.wob * 1.7) > 0.995) { const a = Math.atan2(b.vy, b.vx) + (g.r() - 0.5) * 0.9; b.vx = Math.cos(a); b.vy = Math.sin(a); }
      const step = b.spd * dt;
      const blocked = (x, y) => {
        for (let yy = Math.floor(y - b.rad); yy <= Math.floor(y + b.rad); yy++) for (let xx = Math.floor(x - b.rad); xx <= Math.floor(x + b.rad); xx++) {
          if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > (b.rad + 0.5) ** 2) continue;
          if (at(xx, yy) === 1) return 1;
          if (at(xx, yy) === 2) return 2;
        }
        return 0;
      };
      let nx = b.x + b.vx * step; const hx = blocked(nx, b.y);
      if (hx === 2) { loseLife(); } else if (hx === 1) { b.vx = -b.vx; nx = b.x; }
      let ny = b.y + b.vy * step; const hy = blocked(nx, ny);
      if (hy === 2) { loseLife(); } else if (hy === 1) { b.vy = -b.vy; ny = b.y; }
      b.x = nx; b.y = ny;
      // 갇혔으면(드물게) 빈 곳으로
      if (at(Math.floor(b.x), Math.floor(b.y)) === 1) { b.vx = -b.vx; b.vy = -b.vy; }
      if (g.drawing && Math.hypot(b.x - (g.mx + 0.5), b.y - (g.my + 0.5)) < b.rad + 0.6) loseLife();
    }
    const isEdge = (x, y) => at(x, y) === 1 && x >= 0 && y >= 0 && x < COLS && y < ROWS && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => { const c = at(x + dx, y + dy); return (c === 0 || c === 2) && x + dx >= 0 && y + dy >= 0 && x + dx < COLS && y + dy < ROWS; });
    function moveSpark(s, dt) {
      s.t += dt;
      if (s.t < 0.075 / ((DIFF[v.diff] || DIFF.normal).spd)) return;
      s.t = 0;
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isEdge(s.x + dx, s.y + dy));
      let pick = opts.find(([dx, dy]) => dx === s.dx && dy === s.dy);
      const turns = opts.filter(([dx, dy]) => !(dx === -s.dx && dy === -s.dy));
      if (turns.length > 1 && g.r() < 0.35) pick = turns[Math.floor(g.r() * turns.length)];
      if (!pick) pick = turns[0] || opts[0];
      if (!pick) return;
      s.x += pick[0]; s.y += pick[1]; s.dx = pick[0]; s.dy = pick[1];
      if (s.x === g.mx && s.y === g.my) loseLife();
    }

    /* ---------- 그리기 ---------- */
    function draw(now) {
      const c = cell * dpr;
      ctx.drawImage(bgCv, 0, 0); ctx.drawImage(maskCv, 0, 0);
      // 선
      ctx.fillStyle = '#FFD23F';
      g.trail.forEach((i) => { const x = i % COLS; const y = (i - x) / COLS; ctx.fillRect(x * c + c * 0.15, y * c + c * 0.15, c * 0.7, c * 0.7); });
      // 괴물(거미)
      g.bosses.forEach((b) => {
        const x = b.x * c; const y = b.y * c; const r = b.rad * c;
        ctx.strokeStyle = '#2B1B3D'; ctx.lineWidth = c * 0.35;
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.sin(now / 120 + k) * 0.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6); ctx.stroke(); }
        ctx.fillStyle = '#7C3AED'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.2, r * 0.28, 0, 7); ctx.arc(x + r * 0.35, y - r * 0.2, r * 0.28, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.15, r * 0.13, 0, 7); ctx.arc(x + r * 0.4, y - r * 0.15, r * 0.13, 0, 7); ctx.fill();
      });
      // 불꽃
      g.sparks.forEach((s) => {
        const x = (s.x + 0.5) * c; const y = (s.y + 0.5) * c; const r = c * (0.9 + Math.sin(now / 60) * 0.25);
        ctx.fillStyle = '#FF4757'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.fillStyle = '#FFD23F'; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, 7); ctx.fill();
      });
      // 나
      const blink = g.inv > now && Math.floor(now / 100) % 2;
      if (!blink && !g.dead) {
        const x = (g.mx + 0.5) * c; const y = (g.my + 0.5) * c;
        ctx.fillStyle = g.drawing ? '#FF8A3D' : '#2ED573'; ctx.strokeStyle = '#fff'; ctx.lineWidth = c * 0.3;
        ctx.beginPath(); ctx.arc(x, y, c * 1.1, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
    function banner(t, ms) { g.banner = t; g.bannerT = performance.now() + ms; const b = $('.qx-banner'); b.textContent = t; b.classList.add('show'); }
    function hud() {
      if (!g) return;
      $('.qx-lv').textContent = `${g.lv}/${LEVELS.length}단계`;
      $('.qx-pct').innerHTML = `<b>${Math.floor(g.claimed / g.inner * 100)}%</b>/${g.goal}%`;
      $('.qx-lives').textContent = '❤'.repeat(Math.max(0, g.lives));
      const left = Math.max(0, v.endAt - Math.max(api.now(), v.start));
      $('.qx-time').textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')} · ${g.score}점`;
    }
    function send(force, done) {
      const now = performance.now();
      if (!force && now - lastSend < 1200) return;
      if (sentDone) return;
      lastSend = now;
      if (done) sentDone = true;
      api.act({ k: 'prog', lv: g.lv, pct: Math.floor(g.claimed / g.inner * 100), lives: g.lives, score: g.score, done: !!done });
    }
    let prevT = 0;
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (!g) return;
      const dt = Math.min(0.05, (now - (prevT || now)) / 1000); prevT = now;
      const started = api.now() >= v.start && !v.over;
      if (started && !g.dead && !(g.pause > now)) {
        g.moveT += dt * 1000;
        while (g.moveT >= MOVE_MS) { g.moveT -= MOVE_MS; stepMarker(); }
        g.bosses.forEach((b) => moveBoss(b, dt));
        g.sparks.forEach((s) => moveSpark(s, dt));
        send(false);
      }
      if (g.bannerT && now > g.bannerT) { g.bannerT = 0; $('.qx-banner').classList.remove('show'); }
      const cnt = api.now() < v.start ? Math.ceil((v.start - api.now()) / 1000) : 0;
      if (cnt) { $('.qx-banner').textContent = cnt; $('.qx-banner').classList.add('show'); g.bannerT = performance.now() + 200; }
      draw(now); hud();
    }

    function drawRivals() {
      $('.qx-rivals').innerHTML = v.prog.length > 1 ? v.prog.map((p, i) => `<span class="qx-rv${i === v.me ? ' me' : ''}${p.done ? ' done' : ''}"><span class="av">${api.seat(i).av}</span>${p.lv}단계 ${p.pct}% · ${p.score}${p.lives ? '' : ' 💀'}</span>`).join('') : '';
    }
    function render(view) {
      const first = !v;
      v = view;
      if (first) {
        g = { score: 0, lives: 3 };
        fit(); newLevel(1); raf = requestAnimationFrame(loop);
        if (v.me == null) { g.dead = true; banner('구경 중', 99999); }
      }
      drawRivals();
    }

    // 조종: 방향 단추(누르고 있는 동안) · 화면 밀기 · 키보드
    const setDir = (d) => { if (g) g.dir = d; };
    el.querySelectorAll('.qx-pad button').forEach((b) => {
      const d = b.dataset.d.split(',').map(Number);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); setDir(d); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ } });
      const up = () => { b.classList.remove('on'); if (g && g.dir && g.dir[0] === d[0] && g.dir[1] === d[1]) g.dir = null; };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });
    let sw = null;
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); sw = [e.clientX, e.clientY]; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ } });
    cv.addEventListener('pointermove', (e) => {
      if (!sw) return;
      const dx = e.clientX - sw[0]; const dy = e.clientY - sw[1];
      if (Math.hypot(dx, dy) < 14) return;
      setDir(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]);
      sw = [e.clientX, e.clientY];
    });
    const swEnd = () => { sw = null; setDir(null); };
    cv.addEventListener('pointerup', swEnd); cv.addEventListener('pointercancel', swEnd);
    const KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const kd = (e) => { if (KEYS[e.key]) { e.preventDefault(); setDir(KEYS[e.key]); } };
    const ku = (e) => { if (KEYS[e.key] && g && g.dir && g.dir[0] === KEYS[e.key][0] && g.dir[1] === KEYS[e.key][1]) g.dir = null; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

    return {
      render, tick() { if (v) drawRivals(); },
      destroy() { cancelAnimationFrame(raf); if (ro) ro.disconnect(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); el.innerHTML = ''; },
      _g: () => g, _setDir: setDir
    };
  }

  const ICON = '<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36" rx="7" fill="#16122B"/><path d="M4 4 H36 V20 H22 V12 H12 V30 H4 Z" fill="#FFB8D0"/><path d="M22 20 V12 H12" stroke="#FFD23F" stroke-width="2" fill="none"/><circle cx="27" cy="28" r="4" fill="#7C3AED"/><circle cx="12" cy="30" r="2.4" fill="#2ED573" stroke="#fff"/></svg>';

  C.register({
    id: 'qix',
    kind: 'table',
    icon: ICON,
    rulesText: '내 땅(테두리)에서 출발해 선을 그어 빈 곳을 닫으면 괴물이 없는 쪽이 내 땅! · 선 긋는 중에 괴물이 닿으면 목숨 -1 · 75% 차지하면 다음 단계 · 모두 같은 판으로 점수 겨루기',
    learn: '이 게임은 1981년 오락실 게임 "큐익스(Qix)"와 1989년 "볼피드"에서 시작됐어요. 넓게 한 번에 닫으면 점수가 커지지만, 선이 길수록 위험해요!',
    optionsUI: [{ key: 'diff', label: '어려움', names: { normal: '보통', easy: '쉬움', hard: '어려움' } }],
    bar(v) { const p = v.me != null ? v.prog[v.me] : null; return p ? `<span class="cd-info">${p.lv}단계 · <b>${p.score}</b>점</span>` : ''; },
    rankLabel(v, i) { return v && v.prog ? `${v.prog[i].score}점 · ${v.prog[i].lv}단계` : ''; },
    mount
  });
})();
