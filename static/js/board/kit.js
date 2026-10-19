/* 아리채 오락실 · 보드게임 공통 (등록부 + AI 워커 실행기 + AI 단계)
   보드게임 하나 = static/js/board/<id>/ 폴더
     rules.js  규칙 (화면과 AI 워커가 같이 씀, DOM 없음)  → self.BoardRules[id]
     ai.js     AI (워커에서만)                           → self.BoardAI[id].choose(moves, level, opts)
     view.js   화면 + Boards.register({...})
     guide.js  따라하기 (선택)                            → Boards.guides[id] = [...]
   목록은 static/games.json 의 "board" 에 {"id", "name", "players": [최소, 최대], "ai": true, "files": [...]} */
(function () {
  'use strict';

  const defs = {};
  const guides = {};
  const LEVELS = [
    { n: 1, name: '병아리', animal: 'chick', desc: '처음 배우는 단계' },
    { n: 2, name: '토끼', animal: 'rabbit', desc: '막을 줄은 알아요' },
    { n: 3, name: '여우', animal: 'fox', desc: '공격도 해요' },
    { n: 4, name: '호랑이', animal: 'tiger', desc: '몇 수 앞을 읽어요' },
    { n: 5, name: '용', animal: 'dragon', desc: '이기면 진짜 고수!' }
  ];
  const DRAGON = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="#2B6E4F"/><path d="M28 30 L22 10 L38 24 Z M72 30 L78 10 L62 24 Z" fill="#FFD23F"/><ellipse cx="50" cy="56" rx="30" ry="27" fill="#43B581"/><ellipse cx="50" cy="70" rx="17" ry="11" fill="#8EE0B5"/><circle cx="38" cy="50" r="6" fill="#fff"/><circle cx="62" cy="50" r="6" fill="#fff"/><circle cx="39" cy="51" r="3.2" fill="#1C1733"/><circle cx="63" cy="51" r="3.2" fill="#1C1733"/><circle cx="44" cy="70" r="2" fill="#2B6E4F"/><circle cx="56" cy="70" r="2" fill="#2B6E4F"/><path d="M30 38 Q36 33 44 37 M70 38 Q64 33 56 37" stroke="#2B6E4F" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';

  function levelInfo(n) { return LEVELS[Math.max(1, Math.min(5, n || 1)) - 1]; }
  function levelAvatar(n) {
    const L = levelInfo(n);
    return L.animal === 'dragon' ? DRAGON : window.Animals.svg(L.animal);
  }

  function register(def) {
    const m = (window.Games && window.Games.META && window.Games.META[def.id]) || {};
    def.name = def.name || m.name || def.id;
    def.meta = m;
    defs[def.id] = def;
    return def;
  }

  /* ---------- AI 워커 ---------- */
  let worker = null;
  let seq = 0;
  const waiting = {};
  function scriptUrl(p) {
    const v = (window.ARICHAE_VERSIONS || {})[p];
    return new URL('static/' + p + (v ? '?v=' + v : ''), location.href).href;
  }
  function getWorker() {
    if (worker) return worker;
    worker = new Worker(scriptUrl('js/board/worker.js'));
    worker.onmessage = (e) => {
      const d = e.data || {};
      const w = waiting[d.id];
      if (!w) return;
      delete waiting[d.id];
      if (d.error) w.reject(new Error(d.error)); else w.resolve(d.move);
    };
    worker.onerror = (e) => {
      console.error('[보드 AI]', e.message);
      Object.keys(waiting).forEach((k) => { waiting[k].reject(new Error('worker')); delete waiting[k]; });
      try { worker.terminate(); } catch (x) { /* 무시 */ }
      worker = null;
    };
    return worker;
  }
  // AI 수 계산 (워커). 너무 빨리 두면 정신없으니 최소 시간을 지켜요
  function think(game, moves, level, opts, minMs) {
    const id = ++seq;
    const t0 = Date.now();
    const scripts = [scriptUrl(`js/board/${game}/rules.js`), scriptUrl('js/board/aikit.js'), scriptUrl(`js/board/${game}/ai.js`)];
    return new Promise((resolve, reject) => {
      waiting[id] = { resolve, reject };
      getWorker().postMessage({ id, game, scripts, moves, level, opts: opts || {} });
    }).then((move) => new Promise((res) => {
      const wait = Math.max(0, (minMs || 0) - (Date.now() - t0));
      setTimeout(() => res(move), wait);
    }));
  }

  // 표준 규칙(init/moves/play/turn/result)을 대국 화면이 쓰는 모양으로
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function std(R) {
    return {
      replay(moves) { let st = R.init(); for (const m of moves || []) st = R.play(st, m); return st; },
      turnSeat: (st) => R.turn(st),
      result: (st) => R.result(st),
      legal: (st, m) => R.moves(st).some((x) => same(x, m))
    };
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svg(viewBox, cls) {
    const e = document.createElementNS(SVGNS, 'svg');
    e.setAttribute('viewBox', viewBox);
    if (cls) e.setAttribute('class', cls);
    return e;
  }
  // 화면 좌표 → svg 좌표
  function svgPoint(el, ev) {
    const r = el.getBoundingClientRect();
    const vb = el.viewBox.baseVal;
    return [vb.x + ((ev.clientX - r.left) / r.width) * vb.width, vb.y + ((ev.clientY - r.top) / r.height) * vb.height];
  }

  /* ---------- 점(칸)을 차례로 눌러 수를 고르는 화면 (체커·고누 등) ----------
     spec: viewBox, points[[x,y]], background() → svg, pieceAt(st,i) → 값, drawPiece(v,x,y,i,st) → svg,
           pathOf(move) → [점 번호...], hitR, top(st, ctx) → svg(선택), firstHint: 처음에 고를 수 있는 점 표시 여부 */
  function pathView(spec) {
    return function mount(el, api) {
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'pv-wrap ' + (spec.wrapClass || '');
      const sv = svg(spec.viewBox, 'pv-board ' + (spec.boardClass || ''));
      sv.innerHTML = `<g class="pv-root"><g class="pv-bg">${spec.background()}</g><g class="pv-mark"></g><g class="pv-pieces"></g><g class="pv-top"></g></g>`;
      const gRoot = sv.querySelector('.pv-root');
      let flipped = false;
      wrap.appendChild(sv);
      el.appendChild(wrap);
      const gMark = sv.querySelector('.pv-mark');
      const gPieces = sv.querySelector('.pv-pieces');
      const gTop = sv.querySelector('.pv-top');
      let st = null; let vc = {}; let path = []; let legal = []; let prevSig = null;

      function cands() { return legal.filter((m) => { const p = spec.pathOf(m); return path.every((v, k) => p[k] === v); }); }
      function draw() {
        let out = '';
        const P = spec.points;
        const sig = [];
        for (let i = 0; i < P.length; i++) {
          const v = spec.pieceAt(st, i);
          sig.push(v);
          if (v == null || v === 0) continue;
          const isNew = prevSig && prevSig[i] !== v;
          out += `<g class="pv-pc${isNew ? ' new' : ''}${path[0] === i ? ' sel' : ''}" style="transform-origin:${P[i][0]}px ${P[i][1]}px">${spec.drawPiece(v, P[i][0], P[i][1], i, st)}</g>`;
        }
        gPieces.innerHTML = out;
        prevSig = sig;
        let mk = '';
        const last = spec.lastPath ? spec.lastPath(st) : [];
        last.forEach((i, k) => {
          const [x, y] = P[i];
          mk += `<circle cx="${x}" cy="${y}" r="${spec.hitR * 0.95}" fill="${k === last.length - 1 ? 'rgba(255,71,87,.28)' : 'rgba(255,71,87,.14)'}"/>`;
        });
        if (vc.canPlay) {
          const cs = cands();
          const nextIds = new Set(cs.map((m) => spec.pathOf(m)[path.length]).filter((v) => v != null));
          nextIds.forEach((i) => {
            const [x, y] = P[i];
            mk += path.length || spec.firstHint !== false
              ? `<circle class="pv-can${path.length ? ' go' : ''}" cx="${x}" cy="${y}" r="${spec.hitR * (path.length ? 0.42 : 0.9)}" fill="${path.length ? 'rgba(255,210,63,.75)' : 'none'}" stroke="#FFD23F" stroke-width="${spec.hitR * 0.12}"/>` : '';
          });
          path.forEach((i, k) => {
            if (!k) return;
            const [x1, y1] = P[path[k - 1]]; const [x2, y2] = P[i];
            mk += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#FFD23F" stroke-width="${spec.hitR * 0.2}" stroke-linecap="round" opacity=".8"/>`;
          });
        }
        if (vc.hint != null && vc.hint !== -1) {
          const hp = spec.pathOf(vc.hint);
          hp.forEach((i, k) => { const [x, y] = P[i]; mk += `<circle class="om-hint" cx="${x}" cy="${y}" r="${spec.hitR * (k ? 0.6 : 0.95)}" fill="rgba(61,123,255,.35)" stroke="#3D7BFF" stroke-width="${spec.hitR * 0.1}"/>`; });
        }
        gMark.innerHTML = mk;
        gTop.innerHTML = spec.top ? spec.top(st, vc) : '';
      }
      function render(state, ctx) {
        st = state; vc = ctx || {};
        // 내 말이 늘 아래쪽에 오도록 (spec.flipSeat 자리면 판을 180도 돌려요)
        const f = spec.flipSeat != null && vc.mySeat === spec.flipSeat;
        if (f !== flipped) {
          flipped = f;
          gRoot.setAttribute('transform', f ? `rotate(180 ${spec.center[0]} ${spec.center[1]})` : '');
        }
        legal = vc.canPlay ? spec.moves(st) : [];
        if (!vc.canPlay) path = [];
        else if (path.length && !cands().length) path = [];
        draw();
      }
      function tapPoint(i) {
        const cs = cands();
        const ext = cs.filter((m) => spec.pathOf(m)[path.length] === i);
        if (!ext.length) {
          // 처음부터 다시 고르기
          const fresh = legal.filter((m) => spec.pathOf(m)[0] === i);
          if (fresh.length) { path = [i]; api.tick(); finishIfDone(); draw(); return; }
          if (path.length) { path = []; draw(); }
          if (spec.why) api.say(spec.why(st, i)); else api.say('거기는 고를 수 없어요');
          return;
        }
        path = path.concat([i]);
        api.tick();
        finishIfDone();
        draw();
      }
      function finishIfDone() {
        const cs = cands();
        const done = cs.filter((m) => spec.pathOf(m).length === path.length);
        const longer = cs.filter((m) => spec.pathOf(m).length > path.length);
        if (done.length && !longer.length) {
          const m = done[0];
          path = [];
          api.pick(m);
        }
      }
      sv.addEventListener('pointerdown', (ev) => {
        if (!st || !vc.canPlay) return;
        ev.preventDefault();
        let [x, y] = svgPoint(sv, ev);
        if (flipped) { x = 2 * spec.center[0] - x; y = 2 * spec.center[1] - y; }
        let best = -1; let bd = Infinity;
        spec.points.forEach(([px, py], i) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = i; } });
        if (best < 0 || Math.sqrt(bd) > spec.hitR * 1.25) return;
        tapPoint(best);
      });
      return { render, commit() {}, clear() { path = []; if (st) draw(); }, destroy() { el.innerHTML = ''; } };
    };
  }

  window.Boards = {
    pathView,
    defs, guides, LEVELS, levelInfo, levelAvatar, register, think, std, same, svg, svgPoint,
    get: (id) => defs[id],
    list: () => ((window.Games && window.Games.MANIFEST && window.Games.MANIFEST.games.board) || []).map((m) => defs[m.id]).filter(Boolean)
  };
})();
