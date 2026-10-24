/* 아리채 오락실 · 올림픽관 공통 도구
   - 올림픽 전용 꼬마 선수 10명 (SVG 로 직접 그림 · 팔다리를 움직여요)
   - 경기장(하늘·관중석·트랙) 그리기, 레인 배치, 카메라
   - 연타 세기(빨강·파랑 번갈아, 1초에 15번까지만 인정), 기록 글자
   종목 파일(o100.js 등)은 Oly.register(종목) 으로 등록해요. */
(function () {
  'use strict';

  const G = window.Games;
  const NS = 'http://www.w3.org/2000/svg';

  /* ================================================================
     선수 캐릭터 — 순서와 id 는 서버 olympic.py 의 ATHLETES 와 같아요
     ================================================================ */
  const ATH = [
    { id: 'dino', name: '뿌뿌', skin: '#7ED957', dark: '#4FAE36', jersey: '#FF8A3D', shorts: '#C4561A', note: '아기 공룡' },
    { id: 'bee', name: '붕붕', skin: '#FFD54A', dark: '#E0A800', jersey: '#3D7BFF', shorts: '#1F49B8', note: '꿀벌' },
    { id: 'hedgehog', name: '도치', skin: '#F6D2A6', dark: '#C99A68', jersey: '#2ED573', shorts: '#1A8F4A', note: '고슴도치' },
    { id: 'alpaca', name: '파카', skin: '#FFF3DF', dark: '#E2CDA9', jersey: '#FF6FB5', shorts: '#B83F7E', note: '알파카' },
    { id: 'redpanda', name: '레시', skin: '#E8743B', dark: '#B4501F', jersey: '#22B8B0', shorts: '#127A75', note: '레서판다' },
    { id: 'squirrel', name: '토리', skin: '#CF925A', dark: '#9E6431', jersey: '#FF4757', shorts: '#B8202F', note: '다람쥐' },
    { id: 'turtle', name: '엉금', skin: '#8FD6A6', dark: '#5BAE77', jersey: '#FFD23F', shorts: '#C99A00', note: '거북이' },
    { id: 'unicorn', name: '콘이', skin: '#FFFFFF', dark: '#D9D2F0', jersey: '#A45CFF', shorts: '#6A2FBF', note: '유니콘' },
    { id: 'octopus', name: '문이', skin: '#FF8FB8', dark: '#E0588C', jersey: '#33407A', shorts: '#1E2650', note: '문어' },
    { id: 'whale', name: '퐁당', skin: '#5DADEC', dark: '#2F7FC4', jersey: '#F4F6FF', shorts: '#2F7FC4', note: '아기 고래' }
  ];
  const BY = {};
  ATH.forEach((a, i) => { a.i = i; BY[a.id] = a; });
  const ath = (id) => BY[id] || ATH[0];

  /* ---------- 얼굴 (눈·입·볼) — ex: n 보통, e 힘줌, h 기쁨, d 어질, s 슬픔 ---------- */
  function eyes(ex, x1, x2, y) {
    const one = (x) => {
      if (ex === 'e') return `<path d="M${x - 3.5} ${y - 3} L${x + 1.5} ${y} L${x - 3.5} ${y + 3}" fill="none" stroke="#2A2340" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" transform="${x === x2 ? `translate(${2 * x} 0) scale(-1 1)` : ''}"/>`;
      if (ex === 'h') return `<path d="M${x - 3.6} ${y + 1.5} Q${x} ${y - 4} ${x + 3.6} ${y + 1.5}" fill="none" stroke="#2A2340" stroke-width="2.4" stroke-linecap="round"/>`;
      if (ex === 'd') return `<path d="M${x} ${y} m-3 0 a3 3 0 1 1 3 3 a2 2 0 1 1 -2 -2" fill="none" stroke="#2A2340" stroke-width="1.6" stroke-linecap="round"/>`;
      if (ex === 's') return `<ellipse cx="${x}" cy="${y + 1}" rx="2.8" ry="2.2" fill="#2A2340"/><path d="M${x - 3.5} ${y - 3.5} L${x + 3} ${y - 2}" stroke="#2A2340" stroke-width="1.6" stroke-linecap="round"/>`;
      return `<ellipse cx="${x}" cy="${y}" rx="3.3" ry="4" fill="#2A2340"/><circle cx="${x + 1.2}" cy="${y - 1.6}" r="1.35" fill="#fff"/><circle cx="${x - 1.1}" cy="${y + 1.4}" r=".6" fill="#fff"/>`;
    };
    return one(x1) + one(x2);
  }
  function mouth(ex, x, y) {
    if (ex === 'e') return `<path d="M${x - 4.5} ${y - 1} Q${x} ${y + 5.5} ${x + 4.5} ${y - 1} Z" fill="#7A2236"/><path d="M${x - 3.4} ${y - .4} H${x + 3.4}" stroke="#fff" stroke-width="1.3"/>`;
    if (ex === 'h') return `<path d="M${x - 4.5} ${y - 1.5} Q${x} ${y + 6} ${x + 4.5} ${y - 1.5} Z" fill="#7A2236"/><path d="M${x - 2.4} ${y + 2.2} Q${x} ${y + 3.6} ${x + 2.4} ${y + 2.2}" fill="#FF8FA6"/>`;
    if (ex === 'd') return `<path d="M${x - 4} ${y + 1} q1.3 -2 2.6 0 t2.6 0 t2.6 0" fill="none" stroke="#2A2340" stroke-width="1.6" stroke-linecap="round"/>`;
    if (ex === 's') return `<path d="M${x - 3.5} ${y + 2} Q${x} ${y - 2} ${x + 3.5} ${y + 2}" fill="none" stroke="#2A2340" stroke-width="1.8" stroke-linecap="round"/>`;
    return `<path d="M${x - 3.2} ${y - .5} Q${x} ${y + 3.2} ${x + 3.2} ${y - .5}" fill="none" stroke="#2A2340" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  const blush = (x1, x2, y) => `<ellipse cx="${x1}" cy="${y}" rx="3.6" ry="2.2" fill="#FF7FA0" opacity=".55"/><ellipse cx="${x2}" cy="${y}" rx="3.2" ry="2" fill="#FF7FA0" opacity=".55"/>`;
  // 기본 얼굴 위치 (오른쪽을 살짝 보는 얼굴)
  const face = (ex, o) => {
    const p = Object.assign({ x1: -2, x2: 10, y: -1, mx: 5, my: 8, bx1: -7, bx2: 16, by: 6 }, o || {});
    return eyes(ex, p.x1, p.x2, p.y) + mouth(ex, p.mx, p.my) + (ex === 'd' || ex === 's' ? '' : blush(p.bx1, p.bx2, p.by));
  };

  /* ---------- 머리 그림 (가운데 0,0 · 반지름 약 24) ---------- */
  const HEAD = {
    dino(ex) {
      const sp = [[-100, 9], [-128, 10], [-156, 9], [176, 8]].map(([a, s]) => {
        const r = (a * Math.PI) / 180;
        const bx = Math.cos(r) * 21; const by = Math.sin(r) * 21;
        const tx = Math.cos(r) * (21 + s); const ty = Math.sin(r) * (21 + s);
        const nx = -Math.sin(r) * 5.5; const ny = Math.cos(r) * 5.5;
        return `<path d="M${(bx + nx).toFixed(1)} ${(by + ny).toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)} L${(bx - nx).toFixed(1)} ${(by - ny).toFixed(1)} Z" fill="#FF9F43" stroke="#E07B1F" stroke-width="1.2" stroke-linejoin="round"/>`;
      }).join('');
      return `${sp}<circle r="24" fill="#7ED957"/><path d="M-20 -6 Q-8 -24 14 -20" fill="none" stroke="#9BEA79" stroke-width="5" stroke-linecap="round" opacity=".7"/>
        <ellipse cx="11" cy="8" rx="13.5" ry="10.5" fill="#BDF5A0"/><circle cx="19" cy="3.5" r="1.3" fill="#3C8A2A"/><circle cx="23" cy="5" r="1.2" fill="#3C8A2A"/>
        ${face(ex, { x1: -4, x2: 8, y: -5, mx: 10, my: 10, bx1: -10, bx2: 18, by: 2 })}`;
    },
    bee(ex) {
      return `<path d="M-6 -21 Q-12 -36 -20 -38" fill="none" stroke="#2A2340" stroke-width="2.4" stroke-linecap="round"/><circle cx="-20" cy="-38" r="3.6" fill="#2A2340"/>
        <path d="M5 -22 Q6 -37 14 -40" fill="none" stroke="#2A2340" stroke-width="2.4" stroke-linecap="round"/><circle cx="14" cy="-40" r="3.6" fill="#2A2340"/>
        <circle r="24" fill="#FFD54A"/><path d="M-23 -7 A24 24 0 0 1 -6 -23 L-2 -18 A20 20 0 0 0 -18 -3 Z" fill="#3A2F1E" opacity=".9"/>
        <path d="M-16 -15 Q-6 -24 8 -21" fill="none" stroke="#FFE88A" stroke-width="4" stroke-linecap="round" opacity=".8"/>
        ${face(ex)}`;
    },
    hedgehog(ex) {
      let q = '';
      for (let i = 0; i < 9; i++) {
        const a = (-70 - i * 22) * Math.PI / 180;
        const a1 = a - 0.2; const a2 = a + 0.2;
        q += `<path d="M${(Math.cos(a1) * 18).toFixed(1)} ${(Math.sin(a1) * 18).toFixed(1)} L${(Math.cos(a) * 33).toFixed(1)} ${(Math.sin(a) * 33).toFixed(1)} L${(Math.cos(a2) * 18).toFixed(1)} ${(Math.sin(a2) * 18).toFixed(1)} Z" fill="${i % 2 ? '#7A4E35' : '#8E5E40'}"/>`;
      }
      return `${q}<circle r="23" fill="#8E5E40"/><path d="M-4 -23 Q24 -18 24 4 Q22 22 2 23 Q-8 10 -4 -23 Z" fill="#F6D2A6"/>
        <circle cx="-2" cy="-20" r="5" fill="#8E5E40"/><circle cx="-2" cy="-20" r="2.6" fill="#F7B5A6"/>
        <ellipse cx="24" cy="5" rx="4" ry="3.4" fill="#2A2340"/><circle cx="25" cy="3.8" r="1" fill="#fff"/>
        ${face(ex, { x1: 4, x2: 14, y: -3, mx: 15, my: 11, bx1: 2, bx2: 19, by: 7 })}`;
    },
    alpaca(ex) {
      return `<ellipse cx="-12" cy="-26" rx="4.5" ry="10" transform="rotate(-25 -12 -26)" fill="#FFF3DF" stroke="#E2CDA9" stroke-width="1.2"/>
        <ellipse cx="-12" cy="-26" rx="2" ry="6" transform="rotate(-25 -12 -26)" fill="#FFC9D6"/>
        <ellipse rx="22" ry="25" fill="#FFF3DF" stroke="#E9D9BC" stroke-width="1.2"/>
        <g fill="#FFFBF2" stroke="#E9D9BC" stroke-width="1.1"><circle cx="-12" cy="-19" r="8"/><circle cx="-2" cy="-24" r="8.5"/><circle cx="9" cy="-21" r="7.5"/><circle cx="-16" cy="-9" r="6.5"/></g>
        <ellipse cx="12" cy="10" rx="10" ry="8" fill="#FFFBF2"/><path d="M12 7 V10 M12 10 Q9 13 7 12 M12 10 Q15 13 17 12" fill="none" stroke="#8A6A4A" stroke-width="1.5" stroke-linecap="round"/>
        ${eyes(ex, 0, 12, -2)}${ex === 'd' || ex === 's' ? '' : blush(-5, 19, 5)}`;
    },
    redpanda(ex) {
      return `<path d="M-20 -12 L-23 -28 L-8 -22 Z" fill="#E8743B" stroke="#3A2016" stroke-width="2" stroke-linejoin="round"/><path d="M-18 -16 L-20 -25 L-11 -21 Z" fill="#fff"/>
        <path d="M8 -22 L18 -30 L20 -14 Z" fill="#E8743B" stroke="#3A2016" stroke-width="2" stroke-linejoin="round"/><path d="M11 -21 L17 -26 L18 -17 Z" fill="#fff"/>
        <circle r="24" fill="#E8743B"/>
        <path d="M0 4 Q4 -4 12 -2 Q24 0 24 9 Q20 22 8 22 Q-2 20 0 4 Z" fill="#FFF5EA"/>
        <ellipse cx="-3" cy="-11" rx="3.5" ry="2.2" fill="#FFF5EA"/><ellipse cx="11" cy="-11" rx="3.2" ry="2" fill="#FFF5EA"/>
        <path d="M-4 3 Q-6 12 -2 18" fill="none" stroke="#8C3B1C" stroke-width="3.2" stroke-linecap="round"/>
        <ellipse cx="17" cy="7" rx="3.2" ry="2.5" fill="#2A2340"/>
        ${face(ex, { x1: -2, x2: 10, y: -2, mx: 12, my: 13, bx1: 2, bx2: 21, by: 10 })}`;
    },
    squirrel(ex) {
      return `<path d="M-16 -14 L-18 -34 L-6 -21 Z" fill="#CF925A"/><path d="M-18 -34 l-3 -6 M-18 -34 l1 -7 M-18 -34 l4 -5" stroke="#9E6431" stroke-width="2" stroke-linecap="round"/>
        <path d="M4 -21 L12 -36 L16 -17 Z" fill="#CF925A"/><path d="M12 -36 l-2 -6 M12 -36 l3 -6" stroke="#9E6431" stroke-width="2" stroke-linecap="round"/>
        <circle r="24" fill="#CF925A"/><path d="M-13 -18 Q2 -26 14 -17" fill="none" stroke="#E2AE7C" stroke-width="4" stroke-linecap="round" opacity=".8"/>
        <ellipse cx="10" cy="9" rx="14" ry="11" fill="#FFF1DC"/><ellipse cx="16" cy="4" rx="3" ry="2.2" fill="#6B3F22"/>
        <path d="M16 6 V9" stroke="#6B3F22" stroke-width="1.4"/><rect x="13.5" y="9" width="5" height="4" rx="1" fill="#fff" stroke="#E2C9A6" stroke-width=".8"/>
        ${eyes(ex, -3, 9, -4)}${ex === 'd' || ex === 's' ? '' : blush(-9, 22, 6)}`;
    },
    turtle(ex) {
      return `<ellipse rx="23" ry="22" fill="#8FD6A6"/><ellipse cx="-6" cy="-11" rx="9" ry="5" fill="#B4EBC4" opacity=".8"/>
        <g fill="#6FC08A" opacity=".7"><circle cx="-14" cy="6" r="3"/><circle cx="-10" cy="14" r="2"/><circle cx="-17" cy="-4" r="2"/></g>
        <path d="M-21 -9 Q-4 -24 19 -12 L17 -6 Q-2 -16 -19 -3 Z" fill="#FF4757"/><path d="M-20 -6 Q-28 -8 -30 0 Q-24 2 -20 -1" fill="#FF4757"/>
        ${face(ex, { x1: 0, x2: 12, y: 1, mx: 9, my: 11, bx1: -5, bx2: 19, by: 8 })}`;
    },
    unicorn(ex) {
      return `<g><path d="M-8 -22 Q-30 -26 -30 -4 Q-34 10 -24 20 Q-26 4 -18 -6 Z" fill="#B98CFF"/><path d="M-4 -24 Q-24 -32 -27 -10 Q-26 0 -20 6 Q-20 -6 -12 -14 Z" fill="#FF8FC7"/>
        <path d="M2 -24 Q-14 -34 -18 -18 Q-14 -18 -8 -20 Z" fill="#7FD3FF"/></g>
        <path d="M-10 -20 L-16 -34 L-3 -24 Z" fill="#FFFFFF" stroke="#D9D2F0" stroke-width="1.4" stroke-linejoin="round"/>
        <circle r="24" fill="#FFFFFF" stroke="#E4DDF6" stroke-width="1.4"/>
        <path d="M4 -21 L10 -42 L14 -20 Z" fill="#FFD23F" stroke="#E0A800" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.5 -28 L12.5 -30 M7.5 -34 L11.5 -35" stroke="#E0A800" stroke-width="1.2"/>
        <ellipse cx="12" cy="10" rx="11" ry="8" fill="#FFE3F0"/><circle cx="16" cy="8" r="1.2" fill="#C27BA0"/><circle cx="20" cy="9" r="1.1" fill="#C27BA0"/>
        ${eyes(ex, -2, 10, -4)}${ex === 'd' || ex === 's' ? '' : blush(-7, 21, 4)}`;
    },
    octopus(ex) {
      return `<path d="M-24 4 Q-26 -30 0 -32 Q26 -30 24 4 Q24 20 0 22 Q-24 20 -24 4 Z" fill="#FF8FB8"/>
        <path d="M-14 -22 Q-4 -30 10 -26" fill="none" stroke="#FFC2D8" stroke-width="5" stroke-linecap="round"/>
        <g fill="#E0588C" opacity=".55"><circle cx="-14" cy="-10" r="3.6"/><circle cx="-6" cy="-20" r="2.6"/><circle cx="-18" cy="2" r="2.2"/><circle cx="16" cy="-16" r="2.4"/></g>
        ${face(ex, { x1: -2, x2: 10, y: 0, mx: 5, my: 10, bx1: -8, bx2: 17, by: 8 })}`;
    },
    whale(ex) {
      return `<g fill="#9FD4FF"><path d="M-2 -24 Q-3 -33 -9 -36" fill="none" stroke="#9FD4FF" stroke-width="3" stroke-linecap="round"/><path d="M2 -24 Q3 -34 9 -37" fill="none" stroke="#9FD4FF" stroke-width="3" stroke-linecap="round"/>
        <circle cx="-10" cy="-38" r="2.4"/><circle cx="10" cy="-39" r="2.4"/><circle cx="0" cy="-34" r="2"/></g>
        <circle r="24" fill="#5DADEC"/><path d="M-18 -12 Q-4 -24 14 -18" fill="none" stroke="#8CCBFA" stroke-width="5" stroke-linecap="round" opacity=".8"/>
        <path d="M-22 8 Q0 26 24 6 Q20 22 0 24 Q-16 22 -22 8 Z" fill="#DDF0FF"/>
        <g stroke="#B6D9F5" stroke-width="1.2"><path d="M-12 14 L-10 19"/><path d="M-4 17 L-3 22"/><path d="M4 17 L4 22"/><path d="M12 14 L11 19"/></g>
        ${face(ex)}`;
    }
  };

  // 등 뒤에 붙는 것 (꼬리·날개·등껍질) — 몸통 좌표 (엉덩이 0,0 기준)
  const BACK = {
    dino: '<path d="M-10 -6 Q-30 -2 -38 10 Q-24 8 -8 4 Z" fill="#7ED957" stroke="#4FAE36" stroke-width="1.4" stroke-linejoin="round"/><path d="M-22 -2 l-3 -6 l6 3 Z M-30 3 l-4 -5 l6 2 Z" fill="#FF9F43"/>',
    bee: '<g opacity=".85"><ellipse cx="-10" cy="-26" rx="10" ry="6" transform="rotate(-35 -10 -26)" fill="#E8F6FF" stroke="#9CC9E8" stroke-width="1.2"/><ellipse cx="-14" cy="-18" rx="8" ry="4.5" transform="rotate(-10 -14 -18)" fill="#E8F6FF" stroke="#9CC9E8" stroke-width="1.2"/></g><path d="M-11 -2 L-18 2 L-11 4 Z" fill="#2A2340"/>',
    hedgehog: '<path d="M-12 -24 l-8 -2 l7 -3 l-6 -6 l9 2 M-12 -12 l-9 1 l7 -5" fill="#7A4E35"/>',
    alpaca: '<circle cx="-12" cy="-2" r="5" fill="#FFF3DF" stroke="#E2CDA9" stroke-width="1"/>',
    redpanda: '<path d="M-10 -6 Q-26 -6 -32 8 Q-30 18 -22 14 Q-22 4 -9 2 Z" fill="#E8743B"/><path d="M-22 -4 Q-24 2 -27 6 M-27 0 Q-30 6 -30 10" fill="none" stroke="#8C3B1C" stroke-width="3" stroke-linecap="round"/>',
    squirrel: '<path d="M-10 -4 Q-34 -6 -32 -32 Q-30 -50 -14 -46 Q-22 -38 -20 -28 Q-18 -14 -8 -10 Z" fill="#CF925A" stroke="#9E6431" stroke-width="1.4"/><path d="M-26 -36 Q-24 -24 -16 -16" fill="none" stroke="#F0C796" stroke-width="4" stroke-linecap="round"/>',
    turtle: '<path d="M-14 -40 Q-30 -30 -26 -10 Q-22 2 -10 0 L-10 -40 Z" fill="#4E9E62" stroke="#2F6E40" stroke-width="1.6"/><path d="M-22 -30 L-14 -26 L-14 -16 L-22 -12 M-26 -20 L-22 -20" fill="none" stroke="#7CC48F" stroke-width="1.6"/>',
    unicorn: '<path d="M-10 -6 Q-24 -10 -30 2 Q-22 0 -20 8 Q-16 0 -9 0 Z" fill="#FF8FC7"/><path d="M-12 -4 Q-22 -4 -26 6" fill="none" stroke="#B98CFF" stroke-width="3" stroke-linecap="round"/>',
    octopus: '',
    whale: '<path d="M-10 -4 Q-20 -6 -24 -14 Q-30 -10 -26 -2 Q-34 0 -32 6 Q-24 6 -18 2 Q-14 4 -9 2 Z" fill="#5DADEC" stroke="#2F7FC4" stroke-width="1.2"/>'
  };

  function el(tag, attrs, html) {
    const e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
    if (html != null) e.innerHTML = html;
    return e;
  }

  // 아바타 (머리만) — 대기실·순위·시상대
  function faceSVG(id, ex) {
    const a = ath(id);
    return `<svg viewBox="-34 -46 68 72" aria-hidden="true"><g>${HEAD[a.id](ex || 'n')}</g></svg>`;
  }

  /* ---------- 몸 전체 (발바닥 가운데 = 0,0, 오른쪽을 봐요, 키 약 86) ---------- */
  function limb(len, w, color, endHTML) {
    return `<path d="M0 0 V${len}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>${endHTML || ''}`;
  }
  function makeAthlete(id, bib, opts) {
    const a = ath(id);
    const o = opts || {};
    const root = el('g', { class: 'oa' });
    let shoe = '<ellipse cx="2.4" cy="8.6" rx="5.6" ry="3.6" fill="#fff" stroke="#2A2340" stroke-width="1.2"/><path d="M-1 8 h5" stroke="' + a.jersey + '" stroke-width="1.6"/>';
    // 장비: 스케이트 날 · 스키
    if (o.gear === 'skates') shoe += '<path d="M-5 13.4 H11 Q13 13.4 13 11.6" fill="none" stroke="#C9D3E0" stroke-width="1.8" stroke-linecap="round"/><path d="M-1 11.8 V13.4 M7 11.8 V13.4" stroke="#8C96A8" stroke-width="1.4"/>';
    if (o.gear === 'skis') shoe += `<path d="M-16 13 H24 Q29 13 29 8" fill="none" stroke="#2A2340" stroke-width="4.4" stroke-linecap="round"/><path d="M-15 13 H24 Q28 13 28 9" fill="none" stroke="${a.shorts}" stroke-width="2.6" stroke-linecap="round"/>`;
    const legHTML = (shade) => `<g class="th">${limb(9, 7.5, shade ? a.dark : a.skin)}<g class="sh" transform="translate(0 8)">${limb(7, 7, shade ? a.dark : a.skin, shoe)}</g></g>`;
    const armHTML = (shade) => `<g>${limb(11, 6.2, shade ? a.dark : a.skin)}<circle cy="12.5" r="4.4" fill="${shade ? a.dark : a.skin}"/><g class="hold" transform="translate(0 12.5)"></g></g>`;
    const tilt = el('g', {});           // 몸 기울기 (엉덩이 기준)
    const body = el('g', {});           // 위아래 출렁
    root.appendChild(body);
    body.appendChild(tilt);
    const backArm = el('g', { transform: 'translate(-3 -39)' }, armHTML(true));
    const backLeg = el('g', { transform: 'translate(-4 -18)' }, legHTML(true));
    const back = el('g', { transform: 'translate(0 -18)' }, BACK[a.id] || '');
    const torso = el('g', {}, `<rect x="-12.5" y="-45" width="25" height="28" rx="11" fill="${a.skin}"/>
      <path d="M-12.5 -34 Q-12.5 -45 -4 -45 L-4 -40 Q0 -36 4 -40 L4 -45 Q12.5 -45 12.5 -34 L12.5 -22 H-12.5 Z" fill="${a.jersey}" stroke="rgba(0,0,0,.12)" stroke-width="1"/>
      <rect x="-6.5" y="-37" width="13" height="9.5" rx="2" fill="#fff" stroke="rgba(0,0,0,.15)" stroke-width=".8"/>
      <text x="0" y="-29.6" text-anchor="middle" font-size="7.6" font-weight="800" fill="#2A2340" font-family="system-ui,sans-serif">${bib == null ? '' : bib}</text>
      <rect x="-12.5" y="-24" width="25" height="9" rx="4" fill="${a.shorts}"/>${o.winter ? `<path d="M-12 -45 Q0 -40 12 -45 L12 -40 Q0 -35 -12 -40 Z" fill="#FF4757"/><path d="M-6 -43 v4 M0 -42 v4 M6 -43 v4" stroke="#fff" stroke-width="1.6"/><path d="M-11 -41 Q-20 -40 -24 -33 L-19 -31 Q-17 -36 -10 -37 Z" fill="#FF4757" class="oa-scarf"/>` : ''}`);
    const frontLeg = el('g', { transform: 'translate(4 -18)' }, legHTML(false));
    const frontArm = el('g', { transform: 'translate(3 -39)' }, armHTML(false));
    const headWrap = el('g', { transform: 'translate(3 -64)' });
    const head = el('g', {}, HEAD[a.id]('n'));
    headWrap.appendChild(head);
    [backArm, backLeg, back, torso, frontLeg, frontArm, headWrap].forEach((x) => tilt.appendChild(x));
    const fx = el('g', { class: 'oa-fx' });   // 땀·별 등
    root.appendChild(fx);
    let tag = null;
    if (o.tag) {
      tag = el('g', { class: 'oa-tag', transform: 'translate(0 -104)' },
        `<rect x="-24" y="-9" width="48" height="16" rx="8" fill="${o.me ? '#FFD23F' : 'rgba(21,18,43,.72)'}"/><text y="3.2" text-anchor="middle" font-size="10" font-weight="800" fill="${o.me ? '#15122B' : '#fff'}" font-family="system-ui,sans-serif">${G.esc(o.tag)}</text>`);
      root.appendChild(tag);
    }
    const parts = {
      backArm, frontArm, backLeg, frontLeg,
      bth: backLeg.firstElementChild, fth: frontLeg.firstElementChild,
      bsh: backLeg.querySelector('.sh'), fsh: frontLeg.querySelector('.sh'),
      barm: backArm.firstElementChild, farm: frontArm.firstElementChild,
      bhold: backArm.querySelector('.hold'), fhold: frontArm.querySelector('.hold')
    };
    let curEx = 'n';
    let fxKind = '';
    const api = {
      g: root, a, parts,
      // 자세: 각도는 도(°). 다리·팔 0 = 아래로, + = 앞으로. 무릎 + = 뒤로 굽힘
      set(p) {
        const P = p || {};
        root.setAttribute('transform', `translate(${(P.x || 0).toFixed(1)} ${(P.y || 0).toFixed(1)}) scale(${(P.s || 1).toFixed(3)})`);
        body.setAttribute('transform', `translate(0 ${(P.bob || 0).toFixed(2)})`);
        tilt.setAttribute('transform', `rotate(${(P.tilt || 0).toFixed(1)} 0 -18)`);
        parts.fth.setAttribute('transform', `rotate(${(-(P.fl || 0)).toFixed(1)})`);
        parts.bth.setAttribute('transform', `rotate(${(-(P.bl || 0)).toFixed(1)})`);
        parts.fsh.setAttribute('transform', `translate(0 8) rotate(${(P.fk || 0).toFixed(1)})`);
        parts.bsh.setAttribute('transform', `translate(0 8) rotate(${(P.bk || 0).toFixed(1)})`);
        parts.farm.setAttribute('transform', `rotate(${(-(P.fa || 0)).toFixed(1)})`);
        parts.barm.setAttribute('transform', `rotate(${(-(P.ba || 0)).toFixed(1)})`);
        headWrap.setAttribute('transform', `translate(3 -64) rotate(${(P.head || 0).toFixed(1)})`);
        if (P.ex && P.ex !== curEx) { curEx = P.ex; head.innerHTML = HEAD[a.id](curEx); }
        const fk = P.fx || '';
        if (fk !== fxKind) {
          fxKind = fk;
          fx.innerHTML = FX[fk] || '';
        }
      },
      hold(html, front) { (front === false ? parts.bhold : parts.fhold).innerHTML = html || ''; },
      remove() { root.remove(); }
    };
    api.set({});
    return api;
  }
  // 몸 주변 효과
  const FX = {
    sweat: '<g class="oa-sweat"><path d="M18 -86 q3 5 0 7 q-3 -2 0 -7 Z" fill="#9FD4FF"/><path d="M24 -74 q2.5 4 0 6 q-2.5 -2 0 -6 Z" fill="#9FD4FF"/></g>',
    stars: '<g class="oa-stars"><path d="M-14 -96 l2 4 4 .5 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 -.5 Z" fill="#FFD23F"/><path d="M12 -100 l1.6 3.2 3.2 .4 -2.4 2.4 .8 3.2 -3.2 -1.6 -3.2 1.6 .8 -3.2 -2.4 -2.4 3.2 -.4 Z" fill="#FFD23F"/></g>',
    speed: '<g class="oa-speed" stroke="rgba(255,255,255,.75)" stroke-width="2.4" stroke-linecap="round"><path d="M-22 -60 h-16"/><path d="M-20 -44 h-22"/><path d="M-24 -28 h-14"/></g>',
    dust: '<g class="oa-dust" fill="rgba(255,236,210,.85)"><circle cx="-12" cy="-2" r="4"/><circle cx="-20" cy="-5" r="3"/><circle cx="-27" cy="-2" r="2.2"/></g>',
    sparkle: '<g class="oa-spk" fill="#FFE27A"><path d="M-20 -80 l2 -6 2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 Z"/><path d="M22 -92 l1.5 -4.5 1.5 4.5 4.5 1.5 -4.5 1.5 -1.5 4.5 -1.5 -4.5 -4.5 -1.5 Z"/></g>'
  };

  /* ---------- 자세 만들기 ---------- */
  const P = {
    stand: (ex) => ({ fl: 2, bl: -2, fa: 6, ba: -6, ex: ex || 'n' }),
    // 달리기: ph = 걸음 위상(라디안), k = 세기(0~1)
    run(ph, k, ex) {
      const s = Math.sin(ph);
      const kk = Math.max(0.15, Math.min(1, k));
      return {
        fl: 48 * kk * s, bl: -48 * kk * s,
        fk: 12 + 70 * kk * Math.max(0, -s), bk: 12 + 70 * kk * Math.max(0, s),
        fa: -62 * kk * s - 10, ba: 62 * kk * s - 10,
        bob: -4 * kk * Math.abs(Math.cos(ph)), tilt: 6 + 9 * kk, head: -4 * kk,
        ex: ex || (k > 0.7 ? 'e' : 'n'), fx: k > 0.82 ? 'speed' : ''
      };
    },
    set: () => ({ fl: 42, bl: -18, fk: 62, bk: 34, fa: -34, ba: 40, tilt: 22, bob: 7, head: -12, ex: 'n' }),
    jump: (k) => ({ fl: 80, bl: 30, fk: 40 + 30 * k, bk: 90, fa: 100, ba: 70, tilt: -6, head: -6, ex: 'h' }),
    hurdle: () => ({ fl: 95, bl: -50, fk: 0, bk: 100, fa: 100, ba: -60, tilt: 18, head: -10, ex: 'e' }),
    land: () => ({ fl: 90, bl: 80, fk: 0, bk: 0, fa: 120, ba: 120, tilt: 30, bob: 18, head: -14, ex: 'h' }),
    fall: () => ({ fl: 90, bl: 70, fk: 10, bk: 30, fa: 150, ba: 120, tilt: -85, bob: 8, head: 20, ex: 'd', fx: 'stars' }),
    cheer: (ph) => ({ fl: 4, bl: -4, fa: 92 + 14 * Math.sin(ph || 0), ba: -92 - 14 * Math.sin(ph || 0), bob: -4 * Math.abs(Math.sin(ph || 0)), ex: 'h', fx: 'sparkle' }),
    sad: () => ({ fl: 0, bl: 0, fa: 4, ba: -4, head: 16, tilt: 4, ex: 's' })
  };

  /* ================================================================
     경기장 그리기
     ================================================================ */
  const CROWD_COL = ['#FF4757', '#FFD23F', '#3D7BFF', '#2ED573', '#FF6FB5', '#FF8A3D', '#B07BFF', '#3DD6D0', '#FFFFFF'];
  // 관중석: 폭 w 짜리 무늬 (옆으로 이어 붙여 써요)
  function standsSVG(w, h, seed) {
    const R = G.rng(seed || 7);
    let s = `<rect width="${w}" height="${h}" fill="#3B3570"/>`;
    const rows = Math.max(3, Math.round(h / 15));
    for (let r = 0; r < rows; r++) {
      const y = 6 + r * (h - 8) / rows;
      s += `<rect x="0" y="${(y + 7).toFixed(1)}" width="${w}" height="3" fill="#2A2552"/>`;
      for (let x = 4 + (r % 2) * 5; x < w; x += 9.5) {
        const c = CROWD_COL[Math.floor(R() * CROWD_COL.length)];
        const up = R() < 0.18;
        s += `<g class="${up ? 'oc-wave' : ''}" style="animation-delay:${(R() * 1.2).toFixed(2)}s"><circle cx="${x.toFixed(1)}" cy="${(y + 1).toFixed(1)}" r="3.4" fill="${c}"/>${up ? `<path d="M${(x - 4).toFixed(1)} ${(y - 2).toFixed(1)} l-2 -5 M${(x + 4).toFixed(1)} ${(y - 2).toFixed(1)} l2 -5" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>` : ''}</g>`;
      }
    }
    return s;
  }
  function flagsSVG(w, y) {
    let s = '';
    const cols = ['#FF4757', '#FFD23F', '#2ED573', '#3D7BFF', '#FF6FB5'];
    for (let x = 10, i = 0; x < w; x += 46, i++) s += `<path d="M${x} ${y} l9 0 l-4.5 9 Z" fill="${cols[i % cols.length]}"/>`;
    return `<path d="M0 ${y} H${w}" stroke="#fff" stroke-width="1" opacity=".6"/>${s}`;
  }
  // 오륜 (올림픽 고리 대신 아리채 오색 고리)
  const RINGS = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke-width="2.6"><circle cx="-12" r="6.5" stroke="#3D7BFF"/><circle r="6.5" stroke="#2A2340"/><circle cx="12" r="6.5" stroke="#FF4757"/><circle cx="-6" cy="6" r="6.5" stroke="#FFD23F"/><circle cx="6" cy="6" r="6.5" stroke="#2ED573"/></g>`;

  /* ---------- 레인 배치: 0 = 맨 앞(나), 뒤로 갈수록 작고 위로 ---------- */
  function lanes(n, top, bottom) {
    const out = [];
    const ws = [];
    for (let i = 0; i < n; i++) ws.push(Math.max(0.48, 1 - i * 0.085));
    const tot = ws.reduce((a, b) => a + b, 0);
    let y = bottom;
    for (let i = 0; i < n; i++) {
      const hh = (bottom - top) * ws[i] / tot;
      out.push({ y0: y - hh, y1: y, y: y - hh * 0.22, h: hh, s: ws[i] });
      y -= hh;
    }
    return out;
  }

  /* ---------- 연타 세기 ---------- */
  class Masher {
    constructor(minGap) { this.last = null; this.lastT = -1e9; this.taps = []; this.gap = minGap || 66; this.count = 0; }
    // 1 = 인정, 0 = 너무 빠름(무시), -1 = 같은 버튼
    press(c, t) {
      if (c !== 'r' && c !== 'b') return 0;
      if (c === this.last) return -1;
      if (t - this.lastT < this.gap) return 0;
      this.last = c; this.lastT = t; this.taps.push(t); this.count++;
      return 1;
    }
    rate(t) { while (this.taps.length && t - this.taps[0] > 1000) this.taps.shift(); return this.taps.length; }
  }

  /* ---------- 달리기 곡선: T초에 D미터 (처음엔 천천히, 점점 빨라져요) ---------- */
  function profile(D, T, tau) {
    const ta = tau || 1.1;
    const V = D / Math.max(0.5, T - ta * (1 - Math.exp(-T / ta)));
    return {
      V,
      pos: (s) => (s <= 0 ? 0 : Math.min(D, V * (s - ta * (1 - Math.exp(-s / ta))))),
      speed: (s) => (s <= 0 ? 0 : V * (1 - Math.exp(-s / ta)))
    };
  }

  /* ---------- 기록 글자 ---------- */
  const fmtSec = (ms) => (ms / 1000).toFixed(2) + '초';
  const fmtTimeScore = (sc) => (sc >= 50000 ? fmtSec(100000 - sc) : sc > 0 ? `${(sc / 100).toFixed(1)}m (완주 못함)` : '기록 없음');
  const fmtM = (cm) => (cm > 0 ? (cm / 100).toFixed(2) + 'm' : '기록 없음');

  /* ---------- 선수 목록 (나를 맨 앞 레인에) ---------- */
  function roster(ctx) {
    const all = ctx.players.slice();
    const meI = all.findIndex((p) => p.pid === ctx.myPid);
    const bibs = {};
    all.forEach((p, i) => { bibs[p.pid] = i + 1; });
    const list = [];
    if (meI >= 0) list.push(all[meI]);
    all.forEach((p, i) => { if (i !== meI) list.push(p); });
    return list.map((p) => Object.assign({}, p, { bib: bibs[p.pid], me: p.pid === ctx.myPid, athlete: p.athlete || 'dino' }));
  }

  // 0~1 사이로 부드럽게
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- 위쪽 진행 막대 (모두의 위치) ---------- */
  function strip(box, list, label) {
    const w = G.kit.el(`<div class="oly-strip"><div class="oly-strip-bar"><i class="st"></i><i class="fin"></i></div><span class="oly-strip-lbl">${label || ''}</span></div>`);
    box.appendChild(w);
    const bar = w.firstElementChild;
    const heads = {};
    list.slice().reverse().forEach((p) => {
      const h = G.kit.el(`<span class="oly-strip-h${p.me ? ' me' : ''}">${faceSVG(p.athlete)}</span>`);
      bar.appendChild(h);
      heads[p.pid] = h;
    });
    return {
      el: w,
      set(pid, frac) { const h = heads[pid]; if (h) h.style.left = (clamp(frac, 0, 1) * 100).toFixed(2) + '%'; }
    };
  }

  /* ---------- 등록: 올림픽 종목 공통 값 ---------- */
  function register(def) {
    def.olympic = true;
    def.watch = true;            // 내가 끝나도 다른 선수를 계속 보여줘요
    def.streamValue = true;      // 위치가 바뀔 때마다 다른 폰에 알려요
    def.music = def.music === undefined ? false : def.music;
    G.register(def);
  }

  window.Oly = {
    ATH, ath, HEAD, faceSVG, makeAthlete, P, el, NS,
    standsSVG, flagsSVG, RINGS, lanes, Masher, profile, roster, strip,
    fmtSec, fmtTimeScore, fmtM, ease, clamp, register,
    name: (id) => ath(id).name
  };
})();
