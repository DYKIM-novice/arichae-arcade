/* 아리채 오락실 · 화투 그림 (48장, 우리 오락실 그림체로 새로 그렸어요)
   카드 번호 = (달-1)*4 + k  ·  서버 cardgames/gostop.py 와 같은 순서
   Hwatu.svg(id, {w}) → <svg> 문자열 (가로 60 × 세로 92) */
(function () {
  'use strict';

  // 달마다 [종류, 무리]
  const SPEC = {
    1: [['gwang', ''], ['tti', 'hong'], ['pi', ''], ['pi', '']],
    2: [['yeol', 'bird'], ['tti', 'hong'], ['pi', ''], ['pi', '']],
    3: [['gwang', ''], ['tti', 'hong'], ['pi', ''], ['pi', '']],
    4: [['yeol', 'bird'], ['tti', 'cho'], ['pi', ''], ['pi', '']],
    5: [['yeol', ''], ['tti', 'cho'], ['pi', ''], ['pi', '']],
    6: [['yeol', ''], ['tti', 'cheong'], ['pi', ''], ['pi', '']],
    7: [['yeol', ''], ['tti', 'cho'], ['pi', ''], ['pi', '']],
    8: [['gwang', ''], ['yeol', 'bird'], ['pi', ''], ['pi', '']],
    9: [['yeol', 'cup'], ['tti', 'cheong'], ['pi', ''], ['pi', '']],
    10: [['yeol', ''], ['tti', 'cheong'], ['pi', ''], ['pi', '']],
    11: [['gwang', ''], ['ssang', ''], ['pi', ''], ['pi', '']],
    12: [['gwang', 'rain'], ['yeol', ''], ['tti', ''], ['ssang', '']]
  };
  const NAME = ['', '송학', '매조', '벚꽃', '흑싸리', '난초', '모란', '홍싸리', '공산', '국진', '단풍', '오동', '비'];
  const BG = ['', '#FCE9E4', '#FBEDEF', '#FDEEF4', '#EEF0EA', '#F1EDF8', '#FCEDEF', '#FBEEE8', '#F4EEDC', '#FBF5DD', '#FCEEE6', '#F0EEE6', '#E8EEF4'];
  const info = (id) => { const m = Math.floor(id / 4) + 1; const k = id % 4; return { m, k, kind: SPEC[m][k][0], grp: SPEC[m][k][1] }; };

  /* ---------- 꽃·풀 (달마다) ---------- */
  const flower = (x, y, r, petal, center) => {
    let s = '';
    for (let a = 0; a < 5; a++) {
      const t = (a / 5) * Math.PI * 2 - Math.PI / 2;
      s += `<circle cx="${(x + Math.cos(t) * r * 0.55).toFixed(2)}" cy="${(y + Math.sin(t) * r * 0.55).toFixed(2)}" r="${(r * 0.5).toFixed(2)}" fill="${petal}"/>`;
    }
    return s + `<circle cx="${x}" cy="${y}" r="${(r * 0.32).toFixed(2)}" fill="${center}"/>`;
  };
  const leaf = (x, y, len, ang, col) => `<ellipse cx="${x}" cy="${y}" rx="${len}" ry="${len * 0.38}" fill="${col}" transform="rotate(${ang} ${x} ${y})"/>`;
  function plant(m, dense) {
    let s = '';
    const D = dense ? 1 : 0;
    switch (m) {
      case 1: // 소나무
        s += '<path d="M8 92 Q14 70 30 64 Q42 60 52 66" stroke="#6B3A12" stroke-width="3.2" fill="none"/>';
        [[18, 64], [33, 58], [47, 62], [26, 76], [40, 72]].slice(0, 3 + D * 2).forEach(([x, y]) => {
          for (let a = -70; a <= 70; a += 20) s += `<path d="M${x} ${y} l${(Math.sin(a * Math.PI / 180) * 10).toFixed(1)} ${(-Math.cos(a * Math.PI / 180) * 10).toFixed(1)}" stroke="#1F6B3A" stroke-width="1.6" stroke-linecap="round"/>`;
        });
        break;
      case 2: // 매화
        s += '<path d="M6 92 Q20 74 34 70 Q46 66 56 54" stroke="#4A2A12" stroke-width="2.6" fill="none"/><path d="M28 72 Q26 62 18 56" stroke="#4A2A12" stroke-width="1.8" fill="none"/>';
        [[20, 58, 5], [36, 69, 5.5], [50, 58, 5], [14, 78, 4.5], [44, 80, 4.5]].slice(0, 3 + D * 2).forEach(([x, y, r]) => { s += flower(x, y, r, '#E8384F', '#FFD23F'); });
        break;
      case 3: // 벚꽃
        s += '<path d="M4 90 Q22 78 30 66 Q40 52 56 50" stroke="#5A3418" stroke-width="2.4" fill="none"/>';
        [[14, 80, 6], [28, 68, 6.5], [42, 56, 6], [52, 70, 5.5], [24, 84, 5]].slice(0, 3 + D * 2).forEach(([x, y, r]) => { s += flower(x, y, r, '#FF9EBB', '#E8384F'); });
        break;
      case 4: // 흑싸리 (늘어진 검은 잎)
        s += '<path d="M2 8 Q30 4 58 10" stroke="#3B2A1A" stroke-width="2" fill="none"/>';
        [10, 22, 34, 46].slice(0, 3 + D).forEach((x, k) => {
          for (let y = 14; y < 70 - (k % 2) * 10; y += 7) s += leaf(x + Math.sin(y / 6) * 2, y, 3.2, 70, '#1E1E26');
        });
        break;
      case 5: // 난초(창포)
        [12, 22, 32, 42, 50].slice(0, 4 + D).forEach((x, k) => { s += `<path d="M${x} 92 Q${x + (k % 2 ? 6 : -4)} 70 ${x + (k % 2 ? 2 : -8)} ${46 + k * 3}" stroke="#2E6B3A" stroke-width="2" fill="none"/>`; });
        [[20, 48], [40, 52]].forEach(([x, y]) => { s += `<path d="M${x} ${y} q-6 -8 0 -12 q6 4 0 12 q-8 -2 -8 -8 M${x} ${y} q8 -2 8 -8" fill="#7B3FD1" stroke="#4C1F96" stroke-width=".6"/>`; });
        break;
      case 6: // 모란
        [[22, 62, 9], [42, 74, 8], [16, 82, 6]].slice(0, 2 + D).forEach(([x, y, r]) => {
          s += leaf(x - r, y + r * 0.6, r * 0.9, -30, '#2E7D4A') + leaf(x + r, y + r * 0.6, r * 0.9, 30, '#2E7D4A');
          s += `<circle cx="${x}" cy="${y}" r="${r}" fill="#E83E6C"/><circle cx="${x}" cy="${y}" r="${r * 0.65}" fill="#FF6F93"/><circle cx="${x}" cy="${y}" r="${r * 0.3}" fill="#FFD23F"/>`;
        });
        break;
      case 7: // 홍싸리
        s += '<path d="M2 8 Q30 4 58 10" stroke="#5A2A12" stroke-width="2" fill="none"/>';
        [10, 22, 34, 46].slice(0, 3 + D).forEach((x, k) => {
          for (let y = 14; y < 68 - (k % 2) * 10; y += 7) { s += leaf(x + Math.sin(y / 6) * 2, y, 3, 70, '#6B8F2E'); s += `<circle cx="${x + 4 + Math.sin(y / 5) * 2}" cy="${y + 3}" r="1.6" fill="#E8384F"/>`; }
        });
        break;
      case 8: // 공산 (검은 언덕과 억새)
        s += '<path d="M0 92 L0 66 Q30 44 60 66 L60 92Z" fill="#26222E"/>';
        for (let x = 6; x < 58; x += 6 - D) s += `<path d="M${x} 66 q2 -10 6 -14" stroke="#F4E9C9" stroke-width="1" fill="none" opacity=".8"/>`;
        break;
      case 9: // 국화
        [[20, 70, 9], [42, 62, 8], [34, 84, 6]].slice(0, 2 + D).forEach(([x, y, r]) => {
          for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; s += `<ellipse cx="${(x + Math.cos(t) * r * 0.6).toFixed(2)}" cy="${(y + Math.sin(t) * r * 0.6).toFixed(2)}" rx="${r * 0.45}" ry="${r * 0.16}" fill="#F5B800" transform="rotate(${a * 30} ${(x + Math.cos(t) * r * 0.6).toFixed(2)} ${(y + Math.sin(t) * r * 0.6).toFixed(2)})"/>`; }
          s += `<circle cx="${x}" cy="${y}" r="${r * 0.3}" fill="#D96A00"/>`;
        });
        break;
      case 10: { // 단풍
        const maple = (x, y, r, c) => { let p = ''; for (let a = 0; a < 5; a++) { const t = -Math.PI / 2 + (a - 2) * 0.62; p += `<path d="M${x} ${y} L${(x + Math.cos(t - 0.2) * r * 0.5).toFixed(1)} ${(y + Math.sin(t - 0.2) * r * 0.5).toFixed(1)} L${(x + Math.cos(t) * r).toFixed(1)} ${(y + Math.sin(t) * r).toFixed(1)} L${(x + Math.cos(t + 0.2) * r * 0.5).toFixed(1)} ${(y + Math.sin(t + 0.2) * r * 0.5).toFixed(1)}Z" fill="${c}"/>`; } return p; };
        [[16, 24, 9], [40, 18, 10], [28, 40, 9], [48, 42, 8], [12, 50, 7]].slice(0, 3 + D * 2).forEach(([x, y, r], k) => { s += maple(x, y, r, k % 2 ? '#E8501C' : '#C81E2C'); });
        break;
      }
      case 11: // 오동
        [[16, 74], [40, 78], [28, 62]].slice(0, 2 + D).forEach(([x, y]) => { s += `<path d="M${x} ${y} m-10 0 q10 -16 20 0 q-10 10 -20 0Z" fill="#1F4F2E"/>`; });
        s += '<path d="M30 60 l-3 -10 l3 -6 l3 6Z" fill="#8E5BD1"/>';
        break;
      case 12: // 버드나무 비
        for (let k = 0; k < 4 + D; k++) { const x = 8 + k * 11; s += `<path d="M${x} 0 Q${x + 4} 30 ${x - 2} 70" stroke="#2E6B3A" stroke-width="1.4" fill="none"/>`; for (let y = 10; y < 66; y += 9) s += leaf(x + 1 + Math.sin(y / 8) * 2, y, 2.6, 80, '#3E8E41'); }
        break;
      default:
    }
    return s;
  }

  /* ---------- 광·열끗 주인공 ---------- */
  function hero(m, kind) {
    if (kind === 'gwang') {
      if (m === 1) return '<circle cx="40" cy="20" r="11" fill="#E8263B"/><g transform="translate(22 46)"><ellipse cx="0" cy="0" rx="10" ry="6" fill="#fff" stroke="#222" stroke-width=".8"/><path d="M6 -3 Q14 -18 10 -24" stroke="#222" stroke-width="1.6" fill="none"/><circle cx="10" cy="-24" r="2.2" fill="#E8263B"/><path d="M-10 0 l-8 -6 l4 6 l-4 5Z" fill="#222"/><path d="M-2 5 l-2 9 M2 5 l2 9" stroke="#222" stroke-width="1"/></g>';
      if (m === 3) return '<g><rect x="6" y="40" width="48" height="20" fill="#fff" stroke="#8A1C2C" stroke-width="1"/>' + [0, 1, 2, 3, 4, 5].map((k) => `<rect x="${6 + k * 8}" y="40" width="4" height="20" fill="#E8263B"/>`).join('') + '<rect x="6" y="38" width="48" height="3" fill="#6B3A12"/></g>';
      if (m === 8) return '<rect x="0" y="0" width="60" height="64" fill="#E8263B" opacity=".9"/><circle cx="30" cy="30" r="15" fill="#FFF6D6"/>';
      if (m === 11) return '<g transform="translate(30 36)"><path d="M-14 6 Q-18 -10 0 -14 Q14 -14 14 0 Q10 10 -14 6Z" fill="#E8263B"/><path d="M-14 6 Q-26 14 -24 26 M-10 8 Q-16 20 -10 28 M-4 8 Q-2 20 6 26" stroke="#FFB020" stroke-width="2.4" fill="none"/><circle cx="6" cy="-8" r="2" fill="#111"/><path d="M14 -4 l6 2 l-6 2Z" fill="#FFB020"/><path d="M0 -14 q2 -8 8 -8" stroke="#2E7DD1" stroke-width="2" fill="none"/></g>';
      if (m === 12) return '<g transform="translate(30 44)"><path d="M-16 -6 Q0 -22 16 -6Z" fill="#C81E2C"/><path d="M0 -6 L0 14" stroke="#4A2A12" stroke-width="1.4"/><circle cx="-2" cy="2" r="4" fill="#F4D3B0"/><path d="M-8 6 Q-2 2 4 6 L6 22 L-10 22Z" fill="#1F3F8F"/></g><g transform="translate(46 80)"><ellipse cx="0" cy="0" rx="5" ry="3.4" fill="#4CAF50"/><circle cx="-2" cy="-2.6" r="1.4" fill="#4CAF50"/><circle cx="2" cy="-2.6" r="1.4" fill="#4CAF50"/></g>';
    }
    if (kind === 'yeol') {
      const bird = (x, y, s, body, wing) => `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="7" ry="4.2" fill="${body}"/><circle cx="6" cy="-2.5" r="3" fill="${body}"/><path d="M9 -2.5 l3 1 l-3 1Z" fill="#F59E0B"/><circle cx="6.8" cy="-3.2" r=".7" fill="#111"/><path d="M-2 -1 Q-6 -10 -12 -8 Q-8 -2 -2 1Z" fill="${wing}"/><path d="M-7 1 l-6 2 l6 1Z" fill="${wing}"/></g>`;
      if (m === 2) return bird(32, 44, 1.6, '#C9D94A', '#7A8F1C');
      if (m === 4) return '<circle cx="44" cy="22" r="8" fill="#E8263B" opacity=".85"/>' + bird(26, 44, 1.6, '#3A3A48', '#1A1A22');
      if (m === 5) return '<g stroke="#6B3A12" stroke-width="1.6" fill="#C98A4B">' + [0, 1, 2, 3].map((k) => `<path d="M${6 + k * 12} ${54 - (k % 2) * 8} l12 ${(k % 2 ? 8 : -8)}" stroke-width="5" stroke="#B5763A"/>`).join('') + '</g>';
      if (m === 6) return '<g transform="translate(30 30)"><ellipse cx="-5" cy="-3" rx="6" ry="4" fill="#3D7BFF" transform="rotate(-30 -5 -3)"/><ellipse cx="5" cy="-3" rx="6" ry="4" fill="#3D7BFF" transform="rotate(30 5 -3)"/><ellipse cx="-4" cy="4" rx="4" ry="3" fill="#7DC8FF"/><ellipse cx="4" cy="4" rx="4" ry="3" fill="#7DC8FF"/><rect x="-.8" y="-6" width="1.6" height="12" rx=".8" fill="#222"/></g><g transform="translate(46 50) scale(.7)"><ellipse cx="-5" cy="-3" rx="6" ry="4" fill="#FFB020" transform="rotate(-30 -5 -3)"/><ellipse cx="5" cy="-3" rx="6" ry="4" fill="#FFB020" transform="rotate(30 5 -3)"/><rect x="-.8" y="-6" width="1.6" height="12" rx=".8" fill="#222"/></g>';
      if (m === 7) return '<g transform="translate(30 50)"><ellipse cx="0" cy="0" rx="15" ry="9" fill="#5A3A22"/><circle cx="13" cy="-2" r="6" fill="#5A3A22"/><ellipse cx="18" cy="0" rx="2.6" ry="2" fill="#8A5A3A"/><circle cx="14" cy="-4" r="1" fill="#fff"/><path d="M-10 8 l0 6 M-3 8 l0 6 M5 8 l0 6 M10 8 l0 6" stroke="#3A2414" stroke-width="2.4"/><path d="M-15 -2 l-4 -3" stroke="#3A2414" stroke-width="1.6"/></g>';
      if (m === 8) return '<rect x="0" y="0" width="60" height="62" fill="#F7E7C0"/>' + bird(18, 22, 0.9, '#5A5A68', '#2A2A33') + bird(36, 16, 0.9, '#5A5A68', '#2A2A33') + bird(44, 32, 0.9, '#5A5A68', '#2A2A33');
      if (m === 9) return '<g transform="translate(30 40)"><path d="M-14 -8 L14 -8 L8 8 L-8 8Z" fill="#E8263B" stroke="#8A1C2C" stroke-width="1"/><rect x="-5" y="8" width="10" height="4" fill="#E8263B"/><text x="0" y="3" text-anchor="middle" font-size="9" font-weight="700" fill="#FFD23F" font-family="sans-serif">壽</text></g>';
      if (m === 10) return '<g transform="translate(30 60)"><ellipse cx="0" cy="0" rx="12" ry="7" fill="#C98A4B"/><circle cx="10" cy="-8" r="4.5" fill="#C98A4B"/><path d="M10 -12 l-3 -8 M10 -12 l2 -9 M8 -18 l-4 -2 M12 -19 l4 -2" stroke="#6B3A12" stroke-width="1.2"/><circle cx="11.5" cy="-9" r=".9" fill="#111"/><path d="M-8 6 l0 8 M-2 6 l0 8 M4 6 l0 8 M9 6 l0 8" stroke="#8A5A2E" stroke-width="2"/><circle cx="-4" cy="-2" r="1.2" fill="#fff"/><circle cx="3" cy="1" r="1.2" fill="#fff"/></g>';
      if (m === 12) return bird(30, 48, 1.5, '#1F2A4A', '#0F1830') + '<path d="M18 52 l-8 6 M20 54 l-6 8" stroke="#1F2A4A" stroke-width="1.5"/>';
    }
    return '';
  }
  function ribbon(g, m) {
    const col = g === 'cheong' ? '#2E5BD1' : '#D7263D';
    const txt = g === 'hong' ? '홍단' : g === 'cheong' ? '청단' : g === 'cho' ? '초단' : '';
    return `<g transform="rotate(-8 30 42)"><rect x="20" y="20" width="16" height="40" rx="2" fill="${col}" stroke="rgba(0,0,0,.25)" stroke-width=".8"/>
      ${txt ? `<text x="28" y="34" text-anchor="middle" font-size="7" fill="#fff" font-family="'Jua', sans-serif" writing-mode="tb">${txt}</text>` : ''}</g>`;
  }

  function face(id) {
    const c = info(id);
    const m = c.m;
    let s = `<rect x=".7" y=".7" width="58.6" height="90.6" rx="5" fill="${BG[m]}" stroke="#8A1C2C" stroke-width="1.4"/><g clip-path="url(#hwClip)">`;
    // 광·열끗 그림 뒤 배경 (8월은 하늘)
    s += plant(m, c.kind === 'pi' || c.kind === 'ssang');
    if (c.kind === 'gwang' || c.kind === 'yeol') s += hero(m, c.kind);
    if (c.kind === 'tti') s += ribbon(c.grp, m);
    if (m === 8 && c.kind === 'gwang') s += plant(8, false);
    if (m === 12 && c.kind === 'ssang') s += '<rect x="0" y="0" width="60" height="92" fill="#3A3448" opacity=".55"/><path d="M34 10 L24 40 L32 40 L22 74" stroke="#FFD23F" stroke-width="3" fill="none"/>';
    s += '</g>';
    // 아이들이 알아보기 쉽게: 달 번호 · 광 · 열끗 · 쌍피 표시
    s += `<circle cx="9" cy="9" r="6.6" fill="rgba(255,255,255,.9)" stroke="#8A1C2C" stroke-width=".8"/><text x="9" y="11.8" text-anchor="middle" font-size="8.5" font-weight="800" fill="#8A1C2C" font-family="'Jua', sans-serif">${m}</text>`;
    if (c.kind === 'gwang') s += `<circle cx="50" cy="10" r="7.5" fill="#E8263B" stroke="#fff" stroke-width="1"/><text x="50" y="13.2" text-anchor="middle" font-size="9" fill="#fff" font-family="'Jua', sans-serif">광</text>`;
    if (c.kind === 'yeol') s += `<circle cx="50" cy="10" r="7" fill="#F59E0B" stroke="#fff" stroke-width="1"/><text x="50" y="13" text-anchor="middle" font-size="8" fill="#fff" font-family="'Jua', sans-serif">${c.grp === 'bird' ? '새' : '열'}</text>`;
    if (c.kind === 'ssang') s += `<rect x="40" y="76" width="16" height="12" rx="3" fill="#1C1733"/><text x="48" y="85.5" text-anchor="middle" font-size="8.5" fill="#FFD23F" font-family="'Jua', sans-serif">×2</text>`;
    return s;
  }
  function back() {
    return `<rect x=".7" y=".7" width="58.6" height="90.6" rx="5" fill="#C81E2C" stroke="#7A0F1A" stroke-width="1.4"/>
      <rect x="6" y="6" width="48" height="80" rx="3" fill="none" stroke="#FFD23F" stroke-width="1" opacity=".8"/>
      <circle cx="30" cy="46" r="11" fill="#FFD23F" opacity=".95"/><text x="30" y="50.5" text-anchor="middle" font-size="12" fill="#C81E2C" font-family="'Black Han Sans', sans-serif">花</text>`;
  }
  const CLIP = '<defs><clipPath id="hwClip"><rect x="1.4" y="1.4" width="57.2" height="89.2" rx="4.4"/></clipPath></defs>';
  const cache = {};
  function svg(id, o) {
    const cls = o && o.cls ? ' ' + o.cls : '';
    if (id == null || id < 0) return `<svg viewBox="0 0 60 92" class="hw${cls}" aria-label="뒤집힌 화투">${back()}</svg>`;
    if (!cache[id]) cache[id] = face(id);
    const c = info(id);
    return `<svg viewBox="0 0 60 92" class="hw${cls}" aria-label="${c.m}월 ${NAME[c.m]} ${{ gwang: '광', yeol: '열끗', tti: '띠', pi: '피', ssang: '쌍피' }[c.kind]}">${CLIP}${cache[id]}</svg>`;
  }

  window.Hwatu = { svg, info, NAME, SPEC };
})();
