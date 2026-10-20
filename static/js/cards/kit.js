/* 아리채 오락실 · 카드게임 공통 (트럼프 카드 그림 + 카드게임 등록부)
   카드 이름: 숫자 'A23456789TJQK' + 무늬 's'(스페이드) 'h'(하트) 'd'(다이아) 'c'(클로버)  예) 'As', 'Th', 'Qd'
   Cards.svg(code, {w}) → <svg> 문자열 (가로 60 × 세로 84 비율)
   카드게임 하나 = static/js/cards/<id>/ 폴더 (view.js 가 Cards.register({...})) */
(function () {
  'use strict';

  const RANKS = 'A23456789TJQK';
  const SUITS = 'shdc';
  const RED = '#D7263D'; const BLACK = '#1C1C28';
  const SUIT_NAME = { s: '스페이드', h: '하트', d: '다이아', c: '클로버' };
  // 무늬 모양 (10×10 상자). 글자(♠♥)는 폰에서 이모지로 바뀔 수 있어서 그림으로 그려요
  function suitShape(s, x, y, size, color, flip) {
    const k = size / 10;
    const tf = `translate(${x - size / 2} ${y - size / 2}) scale(${k})${flip ? ' rotate(180 5 5)' : ''}`;
    let d;
    if (s === 'h') d = '<path d="M5 9.4C5 9.4 .4 6.3 .4 3.3C.4 1.6 1.7 .5 3 .5C4 .5 4.7 1.1 5 1.9C5.3 1.1 6 .5 7 .5C8.3 .5 9.6 1.6 9.6 3.3C9.6 6.3 5 9.4 5 9.4Z"/>';
    else if (s === 'd') d = '<path d="M5 .2L9.1 5L5 9.8L.9 5Z"/>';
    else if (s === 's') d = '<path d="M5 .3C5 .3 .4 3.9 .4 6.3C.4 7.8 1.5 8.7 2.8 8.7C3.6 8.7 4.3 8.3 4.7 7.7C4.6 8.6 4.2 9.3 3.4 9.8H6.6C5.8 9.3 5.4 8.6 5.3 7.7C5.7 8.3 6.4 8.7 7.2 8.7C8.5 8.7 9.6 7.8 9.6 6.3C9.6 3.9 5 .3 5 .3Z"/>';
    else d = '<circle cx="5" cy="2.9" r="2.3"/><circle cx="2.5" cy="6.1" r="2.3"/><circle cx="7.5" cy="6.1" r="2.3"/><path d="M4.4 5.6L3.5 9.8H6.5L5.6 5.6Z"/>';
    return `<g transform="${tf}" fill="${color}">${d}</g>`;
  }
  const PIPS = {
    1: [[30, 42]],
    2: [[30, 17], [30, 67, 1]],
    3: [[30, 17], [30, 42], [30, 67, 1]],
    4: [[19, 17], [41, 17], [19, 67, 1], [41, 67, 1]],
    5: [[19, 17], [41, 17], [30, 42], [19, 67, 1], [41, 67, 1]],
    6: [[19, 17], [41, 17], [19, 42], [41, 42], [19, 67, 1], [41, 67, 1]],
    7: [[19, 17], [41, 17], [30, 29.5], [19, 42], [41, 42], [19, 67, 1], [41, 67, 1]],
    8: [[19, 17], [41, 17], [30, 29.5], [19, 42], [41, 42], [30, 54.5, 1], [19, 67, 1], [41, 67, 1]],
    9: [[19, 17], [41, 17], [19, 33.7], [41, 33.7], [30, 42], [19, 50.3, 1], [41, 50.3, 1], [19, 67, 1], [41, 67, 1]],
    10: [[19, 17], [41, 17], [30, 25.3], [19, 33.7], [41, 33.7], [19, 50.3, 1], [41, 50.3, 1], [30, 58.7, 1], [19, 67, 1], [41, 67, 1]]
  };
  const FACE_ICON = {
    // 왕관(K) · 티아라(Q) · 모자(J)
    K: '<path d="M-9 4L-11 -6L-5 -1L0 -9L5 -1L11 -6L9 4Z"/><rect x="-9" y="5" width="18" height="3.2" rx="1"/>',
    Q: '<path d="M-10 3Q0 -10 10 3Z"/><circle cx="0" cy="-5" r="2.2"/><circle cx="-6" cy="-1" r="1.6"/><circle cx="6" cy="-1" r="1.6"/><rect x="-10" y="4" width="20" height="2.6" rx="1.2"/>',
    J: '<path d="M-9 4Q-9 -8 0 -8Q9 -8 9 4Z"/><path d="M6 -6Q12 -10 13 -3" stroke-width="2" fill="none"/><circle cx="13" cy="-2.5" r="2"/><rect x="-11" y="3" width="22" height="3" rx="1.5"/>'
  };

  function parse(code) {
    const r = RANKS.indexOf(code[0]) + 1;
    const s = code[1];
    return { r, s, red: s === 'h' || s === 'd', label: code[0] === 'T' ? '10' : code[0] };
  }

  function face(code, o) {
    const c = parse(code);
    const col = c.red ? RED : BLACK;
    const big = o && o.big;   // 작게 겹쳐 보일 때: 모서리 글자를 크게
    let s = `<rect x=".6" y=".6" width="58.8" height="82.8" rx="5.5" fill="#FFFDF8" stroke="#C9C2B4" stroke-width="1.2"/>`;
    // 모서리 표시
    const fs = big ? 21 : 15;
    const lx = c.label === '10' ? (big ? 2.4 : 3) : (big ? 4.2 : 4.5);
    s += `<text x="${lx}" y="${big ? 19 : 15}" font-size="${fs}" font-weight="800" fill="${col}" font-family="'Jua', 'Arial Rounded MT Bold', sans-serif" ${c.label === '10' ? 'letter-spacing="-1.5"' : ''}>${c.label}</text>`;
    s += suitShape(c.s, big ? 10.5 : 8.6, big ? 27.5 : 22, big ? 11 : 8, col);
    if (!big) {
      s += `<g transform="rotate(180 30 42)"><text x="${lx}" y="15" font-size="15" font-weight="800" fill="${col}" font-family="'Jua', 'Arial Rounded MT Bold', sans-serif" ${c.label === '10' ? 'letter-spacing="-1.5"' : ''}>${c.label}</text>${suitShape(c.s, 8.6, 22, 8, col)}</g>`;
    }
    if (c.r >= 11) {
      // 그림 카드: 색 테두리 + 아이콘 + 큰 글자
      const tint = c.red ? '#FFE3E6' : '#E6E8F5';
      s += `<rect x="16" y="13" width="28" height="58" rx="4" fill="${tint}" stroke="${col}" stroke-width="1.1"/>`;
      s += `<g transform="translate(30 31)" fill="${c.r === 11 ? '#3D7BFF' : '#E8A200'}" stroke="${c.r === 11 ? '#3D7BFF' : '#E8A200'}">${FACE_ICON[code[0]]}</g>`;
      s += `<text x="30" y="58" text-anchor="middle" font-size="19" font-weight="800" fill="${col}" font-family="'Black Han Sans', sans-serif">${code[0]}</text>`;
      s += suitShape(c.s, 30, 66, 6.5, col);
    } else if (c.r === 1) {
      s += suitShape(c.s, 31, 44, big ? 26 : 30, col);
    } else {
      PIPS[c.r].forEach(([x, y, f]) => { s += suitShape(c.s, x + 1, y, 10.5, col, !!f); });
    }
    return s;
  }
  function back() {
    return `<rect x=".6" y=".6" width="58.8" height="82.8" rx="5.5" fill="#4B32B8" stroke="#2C1C78" stroke-width="1.2"/>
      <rect x="5" y="5" width="50" height="74" rx="3.5" fill="#5B3FD1" stroke="#FFD23F" stroke-width="1.1" opacity=".95"/>
      <g stroke="#7A61E8" stroke-width="1">${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<path d="M5 ${12 + k * 9}L${30} ${5 + k * 9}L55 ${12 + k * 9}" fill="none"/>`).join('')}</g>
      <circle cx="30" cy="42" r="10" fill="#FFD23F"/><path d="M30 35L32.1 39.6L37 40.1L33.3 43.4L34.4 48.3L30 45.8L25.6 48.3L26.7 43.4L23 40.1L27.9 39.6Z" fill="#4B32B8"/>`;
  }
  function svg(code, o) {
    const opt = o || {};
    const inner = code && code !== '??' ? face(code, opt) : back();
    return `<svg viewBox="0 0 60 84" class="pc${opt.cls ? ' ' + opt.cls : ''}" aria-label="${code && code !== '??' ? name(code) : '뒤집힌 카드'}">${inner}</svg>`;
  }
  function name(code) {
    const c = parse(code);
    return `${SUIT_NAME[c.s]} ${c.label}`;
  }

  /* ---------- 카드게임 등록부 ---------- */
  const defs = {};
  function register(def) {
    const m = (window.Games && window.Games.META && window.Games.META[def.id]) || {};
    def.name = def.name || m.name || def.id;
    def.meta = m;
    defs[def.id] = def;
    return def;
  }

  window.Cards = {
    RANKS, SUITS, RED, BLACK, parse, svg, name, suitShape, register, defs,
    get: (id) => defs[id],
    list: () => ((window.Games && window.Games.MANIFEST && window.Games.MANIFEST.games.card) || []).map((m) => defs[m.id]).filter(Boolean)
  };
})();
