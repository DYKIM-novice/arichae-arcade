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
    const scripts = [scriptUrl(`js/board/${game}/rules.js`), scriptUrl(`js/board/${game}/ai.js`)];
    return new Promise((resolve, reject) => {
      waiting[id] = { resolve, reject };
      getWorker().postMessage({ id, game, scripts, moves, level, opts: opts || {} });
    }).then((move) => new Promise((res) => {
      const wait = Math.max(0, (minMs || 0) - (Date.now() - t0));
      setTimeout(() => res(move), wait);
    }));
  }

  window.Boards = {
    defs, guides, LEVELS, levelInfo, levelAvatar, register, think,
    get: (id) => defs[id],
    list: () => ((window.Games && window.Games.MANIFEST && window.Games.MANIFEST.games.board) || []).map((m) => defs[m.id]).filter(Boolean)
  };
})();
