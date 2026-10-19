/* 아리채 오락실 · 게임 공통 도구 + 게임 등록부
   - 게임 목록·시간은 static/games.json 하나에만 적어요 (서버와 화면이 같이 읽어요)
   - 게임 파일은 static/js/games/<무리>/<id>.js 하나씩, 맨 끝에서 G.register(게임) 으로 등록
   - 모든 게임은 서버가 준 같은 시드로 같은 문제가 나오도록 만들어 공정하게 동시 진행됩니다. */
(function () {
  'use strict';

  const MANIFEST = window.ARICHAE_MANIFEST || null;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const COLS = ['r', 'g', 'b'];
  const HEX = { r: '#FF4757', g: '#2ED573', b: '#3D7BFF', y: '#FFD23F' };
  const SHADE = { r: '#B8202F', g: '#1A8F4A', b: '#1F49B8', y: '#C99A00' };
  const LIGHT = { r: '#FF8B95', g: '#7DF0AE', b: '#A9C4FF', y: '#FFE27A' };
  const KNAME = { r: '빨강', g: '초록', b: '파랑' };
  const SHAPE = {
    r: '<circle cx="12" cy="12" r="8"/>',
    g: '<path d="M12 4 L21 19 L3 19 Z"/>',
    b: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/>'
  };

  function shape(c, size, stroke, sw) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke || '#fff'}" stroke-width="${sw || 3}" stroke-linejoin="round" aria-hidden="true">${SHAPE[c]}</svg>`;
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function center(ctx, node) {
    const s = ctx.stage.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const esc = escapeHtml;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const IDX = { r: 0, g: 1, b: 2 };
  const SHAPE_NAME = { r: '동그라미', g: '세모', b: '네모' };
  const FILLED = {
    r: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="12" r="10" fill="${c}" stroke="#fff" stroke-width="2"/></svg>`,
    g: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2.5 L22.5 21 L1.5 21 Z" fill="${c}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`,
    b: (c) => `<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="2.5" y="2.5" width="19" height="19" rx="3" fill="${c}" stroke="#fff" stroke-width="2"/></svg>`
  };
  const ARROW = '<svg width="40" height="36" viewBox="0 0 64 40" fill="none" stroke="#FFD23F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 H54"/><path d="M42 8 L56 20 L42 32"/></svg>';

  function gbtn(c, size) {
    return `<div class="il-bez"><div class="il-gb" style="background:${HEX[c]};box-shadow:inset 0 5px 0 rgba(255,255,255,.35),0 6px 0 ${SHADE[c]}">${shape(c, size || 24)}</div></div>`;
  }
  function ilBtn(c, label) {
    return `<div class="il-btn">${gbtn(c)}<span style="color:${LIGHT[c]}">${label}</span></div>`;
  }
  function msgPop(node, text, color) {
    node.textContent = text;
    node.style.color = color || '#F6F3FF';
    node.classList.remove('pop');
    void node.offsetWidth;
    node.classList.add('pop');
  }
  function retrigger(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }
  function chipTo(box, text, cls, max) {
    const e = el(`<span class="${cls}">${text}</span>`);
    box.prepend(e);
    while (box.children.length > (max || 6)) box.lastElementChild.remove();
  }
  function durOf(ctx) { return Math.max(5000, ctx.endAt - ctx.startAt); }


  // ---- 과학관에서 쓰는 도구 ----
  const SLOTS = ['r', 'g', 'b'];
  const BIT = { r: 1, g: 2, b: 4 };

  function pickNoRepeat(R, pool, prev) {
    let v = pool[Math.floor(R() * pool.length)];
    let guard = 0;
    while (v === prev && guard++ < 10) v = pool[Math.floor(R() * pool.length)];
    return v;
  }
  function shuffle(R, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // 받침 유무로 조사 고르기 (은/는, 이/가)
  function hasBatchim(word) {
    const c = word.charCodeAt(word.length - 1);
    if (c < 0xAC00 || c > 0xD7A3) return false;
    return (c - 0xAC00) % 28 !== 0;
  }
  const eunNeun = (w) => w + (hasBatchim(w) ? '은' : '는');
  const eulReul = (w) => w + (hasBatchim(w) ? '을' : '를');
  const iGa = (w) => w + (hasBatchim(w) ? '이' : '가');

  // 빛·물감 섞기 공식 글자 (빨강 + 초록)
  function recipeText(table, key) {
    const parts = [1, 2, 4].filter((b) => key & b).map((b) => table[b].name);
    return parts.join(' + ');
  }

  /* ---------------- 게임 등록부 ---------------- */
  const ALL = {};
  const META = {};   // games.json 에 적힌 정보 (id → {dur, name, group, ...})
  if (MANIFEST) {
    Object.keys(MANIFEST.games || {}).forEach((group) => {
      (MANIFEST.games[group] || []).forEach((m) => { META[m.id] = Object.assign({ group }, m); });
    });
  }
  function register(def) {
    const m = META[def.id];
    if (m) {
      def.dur = m.dur;
      def.group = m.group;
    } else if (!def.dur) {
      console.error('[아리채] games.json 에 없는 게임:', def.id);
      def.dur = 30;
    }
    ALL[def.id] = def;
    return def;
  }

  const G = window.Games = {
    ALL, HEX, SHADE, LIGHT, COLS, KNAME, SHAPE,
    shape, rng, el, center, esc,
    MANIFEST, META,
    get: (id) => ALL[id],
    register,
    kit: {
      rng, COLS, HEX, SHADE, LIGHT, KNAME, SHAPE, shape, el, center, esc, escapeHtml,
      clamp, IDX, SHAPE_NAME, FILLED, ARROW, gbtn, ilBtn, msgPop, retrigger, chipTo, durOf,
      SLOTS, BIT, pickNoRepeat, shuffle, hasBatchim, eunNeun, eulReul, iGa, recipeText
    }
  };
  // 과학관에서 고를 수 있는 게임 (games.json 의 edu 중 "pick": false 가 아닌 것, 적힌 순서대로)
  G.EDU = MANIFEST ? (MANIFEST.games.edu || []).filter((m) => m.pick !== false).map((m) => m.id) : [];

  G.LEVEL_NAME = { e: '초등', m: '중등', h: '고등', x: '고등' };
  // 고른 난이도가 없는 게임은 가장 가까운 단계로
  G.effLevel = function (def, lv) {
    const order = ['e', 'm', 'h', 'x'];   // x(특상)는 음악관 전용
    const levels = (def && def.levels) || order;
    if (levels.includes(lv)) return lv;
    const i = order.indexOf(lv);
    let best = levels[0];
    let bd = 9;
    levels.forEach((l) => {
      const d = Math.abs(order.indexOf(l) - i);
      if (d < bd || (d === bd && order.indexOf(l) < order.indexOf(best))) { bd = d; best = l; }
    });
    return best;
  };
})();
