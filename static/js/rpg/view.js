/* 아리채 오락실 · 회귀 RPG 장면 그리기 (SVG) — "그리기 담당"
   규칙(sim.js)·진행(game.js)과 떨어져 있어요. 나중에 PixiJS 같은 다른 그리기로 바꿀 때 이 파일만 새로 만들면 돼요.

   그리기 담당이 지켜야 할 약속 (renderer interface)
     const v = RpgView.create(box, { myId })   box 안에 장면을 만들어요
     v.build(W)            새 판(회차) 시작: 용사들·배경을 다시 놓아요
     v.frame(W, dt)        매 프레임: 세계 상태(W)를 읽어 모습을 그려요 (dt = 실제 흐른 초)
     v.event(e, W)         규칙에서 일어난 일 하나 (spawn·swing·hit·parry·guard·hurt·down·tele·break·stun·kill·lvup·spec …)
     v.rewind(ms, done)    되감기: 마지막 몇 초를 거꾸로 + 숲이 뒤로 휙휙 (끝나면 done())
     v.celebrate()         클리어 축하
     v.focus(x, y)         화면 좌표 → 장면 좌표 변환이 필요할 때 쓰는 도우미 (point)
     v.destroy()
   글자 효과(패링! 같은 큰 글자)는 UI 쪽(ui.js) 이 HTML 로 그려요 → 그리기를 바꿔도 같이 따라와요 */
(function () {
  'use strict';

  const O = window.Oly;
  const Sim = window.RpgSim;
  const D = window.RpgData;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, html) => { const e = document.createElementNS(NS, tag); if (attrs) Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k])); if (html != null) e.innerHTML = html; return e; };
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const out = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const W0 = 272;          // 장면 폭 (작을수록 크게 보여요)

  /* ================================================================
     적 그림 (발바닥 가운데 = 0,0 · 왼쪽(용사 쪽)을 봐요)
     ================================================================ */
  const ART = {
    mushroom: () => `
      <g class="rg-eb">
        <ellipse cx="-10" cy="-4" rx="8" ry="5" fill="#7A4B2E"/><ellipse cx="10" cy="-4" rx="8" ry="5" fill="#7A4B2E"/>
        <path d="M-17 -7 Q-21 -30 -13 -42 L13 -42 Q21 -30 17 -7 Q0 -1 -17 -7 Z" fill="#FFF1D8" stroke="#D9BC8F" stroke-width="2"/>
        <g class="rg-face">
          <path d="M-14 -31 L-4 -27" stroke="#3A2A20" stroke-width="3" stroke-linecap="round"/><path d="M8 -27 L1 -29" stroke="#3A2A20" stroke-width="3" stroke-linecap="round"/>
          <ellipse cx="-9" cy="-22" rx="3.4" ry="4.4" fill="#2A2340"/><ellipse cx="4" cy="-22" rx="3" ry="4" fill="#2A2340"/>
          <circle cx="-10" cy="-23.5" r="1.2" fill="#fff"/><circle cx="3" cy="-23.5" r="1.1" fill="#fff"/>
          <path class="rg-mouth" d="M-9 -12 Q-4 -15 1 -12" fill="none" stroke="#7A2236" stroke-width="2.4" stroke-linecap="round"/>
        </g>
        <path d="M-37 -37 Q-35 -78 0 -80 Q35 -78 37 -37 Q0 -27 -37 -37 Z" fill="#FF4F5E" stroke="#B9283A" stroke-width="2.5"/>
        <path d="M-26 -62 Q-14 -76 6 -75" fill="none" stroke="#FF8D96" stroke-width="5" stroke-linecap="round" opacity=".8"/>
        <circle cx="-18" cy="-52" r="6.5" fill="#FFF6EA"/><circle cx="6" cy="-64" r="5" fill="#FFF6EA"/><circle cx="20" cy="-46" r="5.5" fill="#FFF6EA"/><circle cx="-3" cy="-44" r="3.5" fill="#FFF6EA"/>
      </g>`,
    bat: () => `
      <g class="rg-eb">
        <g class="rg-wing rg-wl"><path d="M-6 -6 Q-30 -34 -52 -20 Q-44 -14 -46 -6 Q-36 -10 -32 -2 Q-24 -8 -18 2 Z" fill="#4B357E" stroke="#2E1F55" stroke-width="2" stroke-linejoin="round"/></g>
        <g class="rg-wing rg-wr"><path d="M6 -6 Q30 -34 52 -20 Q44 -14 46 -6 Q36 -10 32 -2 Q24 -8 18 2 Z" fill="#4B357E" stroke="#2E1F55" stroke-width="2" stroke-linejoin="round"/></g>
        <path d="M-14 -16 L-18 -36 L-5 -22 Z" fill="#6B4FA8" stroke="#2E1F55" stroke-width="2" stroke-linejoin="round"/><path d="M12 -18 L16 -38 L4 -24 Z" fill="#6B4FA8" stroke="#2E1F55" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="0" cy="-6" r="19" fill="#6B4FA8" stroke="#2E1F55" stroke-width="2.4"/>
        <ellipse cx="2" cy="2" rx="11" ry="8" fill="#9A7FD1"/>
        <g class="rg-face">
          <ellipse cx="-8" cy="-10" rx="5.5" ry="6" fill="#FFE27A"/><ellipse cx="6" cy="-10" rx="5" ry="5.6" fill="#FFE27A"/>
          <ellipse cx="-9.5" cy="-10" rx="1.6" ry="4" fill="#2A2340"/><ellipse cx="4.5" cy="-10" rx="1.5" ry="3.8" fill="#2A2340"/>
          <path d="M-13 -17 L-4 -14 M10 -16 L2 -14" stroke="#2E1F55" stroke-width="2.4" stroke-linecap="round"/>
          <path class="rg-mouth" d="M-7 0 Q-2 4 3 0" fill="#7A2236" stroke="#2E1F55" stroke-width="1.6"/>
          <path d="M-6 0.5 L-5 5 L-4 1 M1 0.8 L2 5 L3 0.6" fill="#fff"/>
        </g>
      </g>`,
    golem: () => `
      <g class="rg-eb">
        <ellipse cx="-14" cy="-6" rx="13" ry="8" fill="#6E7186"/><ellipse cx="16" cy="-6" rx="13" ry="8" fill="#6E7186"/>
        <g class="rg-arm-b"><path d="M22 -66 Q40 -60 40 -38 Q44 -22 34 -18 Q24 -16 22 -28 Z" fill="#7A7D93" stroke="#4E5066" stroke-width="2.5" stroke-linejoin="round"/></g>
        <path d="M-34 -14 Q-42 -60 -22 -88 Q0 -104 24 -90 Q42 -66 34 -14 Q0 -2 -34 -14 Z" fill="#9A9DB3" stroke="#55586E" stroke-width="3" stroke-linejoin="round"/>
        <path d="M-24 -84 Q-4 -100 20 -88 Q8 -80 -6 -82 Q-18 -76 -24 -84 Z" fill="#6FC08A" stroke="#3E8A57" stroke-width="2"/>
        <path d="M-4 -40 L4 -30 L-2 -22 M14 -60 L20 -52" stroke="#6E7186" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <g class="rg-face">
          <path d="M-22 -66 L-8 -62 M10 -62 L0 -63" stroke="#3E4054" stroke-width="4" stroke-linecap="round"/>
          <ellipse cx="-15" cy="-55" rx="5.5" ry="4.2" fill="#FFB347"/><ellipse cx="3" cy="-55" rx="5" ry="4" fill="#FFB347"/>
          <circle cx="-16" cy="-55" r="2" fill="#FFF3C4"/><circle cx="2" cy="-55" r="1.8" fill="#FFF3C4"/>
          <path class="rg-mouth" d="M-16 -40 H2" stroke="#3E4054" stroke-width="3.4" stroke-linecap="round"/>
        </g>
        <g class="rg-arm-f"><path d="M-26 -64 Q-50 -58 -50 -36 Q-56 -18 -42 -14 Q-28 -12 -26 -28 Z" fill="#A6A9BF" stroke="#55586E" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M-48 -24 L-38 -22 M-50 -32 L-40 -30" stroke="#6E7186" stroke-width="1.8"/></g>
      </g>`,
    boss: () => `
      <g class="rg-eb">
        <path d="M-30 -10 L-26 -46 L-6 -46 L-8 -10 Z" fill="#D63B44" stroke="#8C1F2A" stroke-width="3"/><path d="M8 -10 L6 -46 L28 -46 L32 -10 Z" fill="#D63B44" stroke="#8C1F2A" stroke-width="3"/>
        <ellipse cx="-20" cy="-6" rx="16" ry="8" fill="#5B2A1E"/><ellipse cx="20" cy="-6" rx="16" ry="8" fill="#5B2A1E"/>
        <g class="rg-arm-b"><path d="M34 -132 Q62 -118 58 -84 Q56 -70 46 -72 Q40 -96 26 -110 Z" fill="#C8333D" stroke="#8C1F2A" stroke-width="3"/></g>
        <path d="M-44 -50 Q-56 -110 -24 -138 Q0 -150 26 -138 Q58 -112 46 -50 Q0 -34 -44 -50 Z" fill="#E5484D" stroke="#8C1F2A" stroke-width="3.5"/>
        <ellipse cx="-2" cy="-82" rx="26" ry="24" fill="#FF8A80" opacity=".85"/>
        <path d="M-46 -62 Q0 -40 48 -62 L50 -40 Q0 -22 -48 -40 Z" fill="#FFC531" stroke="#B98200" stroke-width="2.5"/>
        <path d="M-34 -58 L-30 -40 M-16 -52 L-14 -32 M2 -50 L2 -30 M20 -52 L18 -32 M36 -58 L32 -40" stroke="#3A2A20" stroke-width="4" stroke-linecap="round"/>
        <g class="rg-head">
          <path d="M-46 -160 L-52 -196 L-30 -172 Z M30 -168 L40 -202 L50 -164 Z" fill="#FFF1C9" stroke="#B9A06A" stroke-width="2.5" stroke-linejoin="round"/>
          <path d="M-52 -150 Q-64 -176 -40 -186 Q-30 -204 -6 -196 Q14 -210 34 -194 Q60 -188 56 -158 Q70 -142 54 -128 L-54 -128 Q-70 -138 -52 -150 Z" fill="#2E2240"/>
          <ellipse cx="0" cy="-140" rx="44" ry="38" fill="#E5484D" stroke="#8C1F2A" stroke-width="3.5"/>
          <path d="M-40 -160 Q-26 -178 -6 -168 Q12 -180 34 -164 Q20 -170 8 -162 Q-12 -170 -40 -160 Z" fill="#2E2240"/>
          <g class="rg-face">
            <path d="M-34 -156 L-12 -146 M24 -154 L6 -146" stroke="#2E2240" stroke-width="6" stroke-linecap="round"/>
            <ellipse cx="-22" cy="-138" rx="9" ry="9.5" fill="#fff" stroke="#2E2240" stroke-width="2"/><ellipse cx="14" cy="-138" rx="8.5" ry="9" fill="#fff" stroke="#2E2240" stroke-width="2"/>
            <circle cx="-25" cy="-137" r="4.6" fill="#FFB800"/><circle cx="11" cy="-137" r="4.3" fill="#FFB800"/><circle cx="-26" cy="-137" r="2.2" fill="#2A2340"/><circle cx="10" cy="-137" r="2" fill="#2A2340"/>
            <ellipse cx="-6" cy="-124" rx="8" ry="6" fill="#C8333D"/>
            <path class="rg-mouth" d="M-32 -112 Q-6 -94 22 -112 Q-6 -104 -32 -112 Z" fill="#7A2236" stroke="#2E2240" stroke-width="2.5"/>
            <path d="M-26 -110 L-22 -122 L-18 -108 Z M12 -108 L16 -121 L20 -110 Z" fill="#FFF8E6" stroke="#B9A06A" stroke-width="1.4"/>
          </g>
        </g>
        <g class="rg-arm-f">
          <g class="rg-club">
            <path d="M-6 6 L-12 -86 Q-14 -112 4 -116 Q22 -112 18 -86 L8 6 Z" fill="#9A5A2E" stroke="#5B3216" stroke-width="3" stroke-linejoin="round"/>
            <g fill="#FFD23F" stroke="#B98200" stroke-width="1.6"><circle cx="0" cy="-100" r="4.2"/><circle cx="10" cy="-82" r="4"/><circle cx="-6" cy="-70" r="3.8"/><circle cx="6" cy="-54" r="3.6"/><circle cx="-4" cy="-90" r="3"/></g>
            <rect x="-6" y="-4" width="14" height="14" rx="3" fill="#5B3216"/>
          </g>
          <path d="M-36 -128 Q-58 -112 -60 -86 Q-60 -70 -48 -70 Q-38 -96 -22 -112 Z" fill="#E5484D" stroke="#8C1F2A" stroke-width="3"/>
          <circle cx="-54" cy="-74" r="11" fill="#E5484D" stroke="#8C1F2A" stroke-width="3"/>
        </g>
      </g>`
  };
  // 적 키 (머리 위 말풍선 높이)
  const TOP = { mushroom: 86, bat: 92, golem: 108, boss: 214 };
  const FRONT = { mushroom: 34, bat: 30, golem: 46, boss: 60 };

  function makeEnemyRig(kind) {
    const root = el('g', { class: 'rg-enemy rg-k-' + kind });
    const shadow = el('ellipse', { cx: 0, cy: 0, rx: kind === 'boss' ? 62 : kind === 'golem' ? 40 : 26, ry: kind === 'boss' ? 12 : 7, fill: 'rgba(0,0,0,.32)' });
    root.appendChild(shadow);
    const aura = el('ellipse', { class: 'rg-aura', cx: 0, cy: -(TOP[kind] || 80) * 0.45, rx: (FRONT[kind] || 30) * 1.6, ry: (TOP[kind] || 80) * 0.62, opacity: 0 });
    root.appendChild(aura);
    const body = el('g', {});
    root.appendChild(body);
    body.innerHTML = ART[kind] ? ART[kind]() : ART.mushroom();
    const eb = body.firstElementChild;
    const wl = body.querySelector('.rg-wl'); const wr = body.querySelector('.rg-wr');
    const armF = body.querySelector('.rg-arm-f'); const head = body.querySelector('.rg-head');
    const stunG = el('g', { class: 'rg-stun', transform: `translate(0 ${-(TOP[kind] || 80) - 4})`, display: 'none' },
      '<g class="rg-stun-spin"><path d="M-22 0 l3 -7 3 7 7 1 -6 4 2 7 -6 -4 -6 4 2 -7 -6 -4 Z" fill="#FFD23F"/><path d="M16 -4 l2.4 -5 2.4 5 5 .8 -4 3 1.5 5 -4.5 -3 -4.5 3 1.5 -5 -4 -3 Z" fill="#FFE27A"/><circle cx="-2" cy="6" r="3" fill="#fff"/></g>');
    root.appendChild(stunG);
    let lastAura = ''; let lastStun = false; let lastFlash = false;
    return {
      g: root, kind,
      set(p) {
        root.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(p.s || 1).toFixed(3)})`);
        const sq = p.sq || 0;
        body.setAttribute('transform', `translate(0 ${(p.lift || 0).toFixed(1)}) rotate(${(p.tilt || 0).toFixed(1)} 0 -20) scale(${(1 + sq).toFixed(3)} ${(1 - sq).toFixed(3)})`);
        shadow.setAttribute('opacity', (p.alpha == null ? 1 : p.alpha).toFixed(2));
        if (wl) { const f = Math.sin(p.flap || 0); wl.setAttribute('transform', `rotate(${(f * 26).toFixed(1)} -6 -6)`); wr.setAttribute('transform', `rotate(${(-f * 26).toFixed(1)} 6 -6)`); }
        if (armF) {
          if (kind === 'boss') armF.setAttribute('transform', `rotate(${(p.arm || 0).toFixed(1)} -36 -120)`);
          else armF.setAttribute('transform', `rotate(${(p.arm || 0).toFixed(1)} -26 -60)`);
        }
        if (head) head.setAttribute('transform', `rotate(${(p.head || 0).toFixed(1)} 0 -128)`);
        const ak = p.aura ? `${p.aura}:${p.auraK.toFixed(2)}` : '';
        if (ak !== lastAura) {
          lastAura = ak;
          aura.setAttribute('opacity', p.aura ? (0.18 + 0.5 * p.auraK).toFixed(2) : 0);
          if (p.aura) aura.setAttribute('fill', p.aura === 'r' ? '#FF4757' : p.aura === 'v' ? '#FFD23F' : '#2ED573');
        }
        if (!!p.stun !== lastStun) { lastStun = !!p.stun; if (lastStun) stunG.removeAttribute('display'); else stunG.setAttribute('display', 'none'); }
        if (!!p.flash !== lastFlash) { lastFlash = !!p.flash; eb.classList.toggle('rg-flashw', lastFlash); }
        root.setAttribute('opacity', (p.alpha == null ? 1 : p.alpha).toFixed(2));
      },
      remove() { root.remove(); }
    };
  }

  /* ================================================================
     용사 자세 (올림픽 선수 그림을 그대로 써요 · 오른쪽을 봐요)
     a = 동작, T = 동작 시작부터 흐른 ms, h = 용사 상태
     ================================================================ */
  const HC = D.hero.combo;
  function heroPose(a, T, h, now) {
    const bob = Math.sin(now / 190) * 1.4;
    switch (a) {
      case 'walk': { const p = O.P.run(now / 120, 0.38, 'n'); p.fx = ''; p.fa = 40 + p.fa * 0.3; return { p, dx: 0, lift: 0 }; }
      case 'idle': return { p: { fl: 22, bl: -16, fk: 20, bk: 12, fa: 46 + bob * 2, ba: -14, tilt: 8, bob: 1 + bob, head: -4, ex: 'n' }, dx: 0, lift: 0 };
      case 'atk': {
        const st = h.step || 0; const cf = HC[st];
        if (st === 0) {
          if (T < cf.start) { const k = T / cf.start; return { p: { fl: 20, bl: -16, fk: 18, bk: 14, fa: lerp(50, 170, out(k)), ba: -20, tilt: lerp(8, -6, k), head: -6, ex: 'e' }, dx: 0, lift: 0 }; }
          const u = (T - cf.start) / cf.rec; const s = out(u * 4);
          return { p: { fl: 40, bl: -30, fk: 20, bk: 30, fa: lerp(170, 10, s), ba: lerp(-20, 30, s), tilt: lerp(-6, 22, s) - 10 * u, head: -10, ex: 'e', bob: 3 }, dx: 18 * (1 - u * u), lift: 0, swing: u < 0.3 ? 1 - u / 0.3 : 0 };
        }
        if (st === 1) {
          if (T < cf.start) { const k = T / cf.start; return { p: { fl: 26, bl: -20, fk: 30, bk: 20, fa: lerp(30, -30, out(k)), ba: 20, tilt: lerp(10, 18, k), head: -4, ex: 'e', bob: 4 }, dx: 2, lift: 0 }; }
          const u = (T - cf.start) / cf.rec; const s = out(u * 4);
          return { p: { fl: 30, bl: -34, fk: 10, bk: 30, fa: lerp(-30, 150, s), ba: lerp(20, -30, s), tilt: lerp(18, -8, s), head: -12, ex: 'e' }, dx: 22 * (1 - u * u), lift: 6 * Math.sin(Math.min(1, u * 2) * Math.PI), swing: u < 0.3 ? 1 - u / 0.3 : 0 };
        }
        if (T < cf.start) { const k = T / cf.start; return { p: { fl: 40, bl: -30, fk: 70, bk: 50, fa: lerp(120, 205, out(k)), ba: 120, tilt: lerp(6, -14, k), bob: 8 * k, head: -8, ex: 'e' }, dx: 0, lift: 0 }; }
        const u = (T - cf.start) / cf.rec; const s = out(u * 3.2);
        return { p: { fl: lerp(70, 20, u), bl: -40, fk: 40, bk: 60, fa: lerp(205, -10, s), ba: lerp(120, -40, s), tilt: lerp(-14, 30, s) - 20 * u, head: -14, ex: 'e', bob: 2 }, dx: 30 * (1 - u * u), lift: 22 * Math.sin(Math.min(1, u * 1.7) * Math.PI), swing: u < 0.35 ? 1 - u / 0.35 : 0 };
      }
      case 'charge': {
        const k = Math.min(1, T / h.st.chargeFull);
        const tr = (h.full ? 2.4 : 1.2) * Math.sin(now / 22);
        return { p: { fl: 42, bl: -26, fk: 60, bk: 40, fa: 205 + tr, ba: -50, tilt: -10 + tr * 0.5, bob: 7 + 2 * k, head: -6, ex: 'e', fx: h.full ? 'sparkle' : '' }, dx: -4 * k, lift: 0, charge: k, full: h.full };
      }
      case 'heavy': {
        const cf = D.hero.heavy;
        if (T < cf.start) return { p: { fl: 50, bl: -30, fk: 60, bk: 40, fa: 215, ba: -60, tilt: -16, bob: 9, head: -6, ex: 'e' }, dx: -6, lift: 0 };
        const u = (T - cf.start) / cf.rec; const s = out(u * 4);
        return { p: { fl: 70, bl: -50, fk: 20, bk: 50, fa: lerp(215, -5, s), ba: lerp(-60, 60, s), tilt: lerp(-16, 34, s) - 22 * u, head: -16, ex: 'e', bob: 6 }, dx: 46 * (1 - u * u), lift: 10 * Math.sin(Math.min(1, u * 2) * Math.PI), swing: u < 0.4 ? 1 - u / 0.4 : 0, big: true };
      }
      case 'guard': return { p: { fl: 28, bl: -24, fk: 30, bk: 20, fa: 96 + bob, ba: 70, tilt: -6, bob: 4, head: 4, ex: 'e' }, dx: -2, lift: 0, guard: 1 };
      case 'parry': { const u = Math.min(1, T / 240); return { p: { fl: 34, bl: -26, fk: 20, bk: 26, fa: lerp(150, 110, u), ba: 60, tilt: lerp(14, 2, u), bob: 2, head: -8, ex: 'h' }, dx: lerp(12, 0, u), lift: 0, guard: 1 - u }; }
      case 'hurt': { const u = Math.min(1, T / D.hero.hurtMs); return { p: { fl: -10, bl: 20, fk: 30, bk: 10, fa: 140, ba: 150, tilt: lerp(-26, -6, u), bob: 2, head: 14, ex: 'o' }, dx: -18 * (1 - u), lift: 4 * Math.sin(u * Math.PI) }; }
      case 'spec': {
        const sp = D.hero.spec; const u = T / sp.dur;
        const spin = T < 500 ? (T / 500) * 360 : 0;
        const air = Math.sin(clamp(u, 0, 1) * Math.PI);
        return { p: { fl: 60, bl: 40, fk: 70, bk: 80, fa: 190 + 30 * Math.sin(T / 40), ba: 150, tilt: -spin, bob: 0, head: -10, ex: 'h', fx: 'sparkle' }, dx: 24 * air, lift: 46 * air, spec: 1 };
      }
      case 'down': { const p = O.P.fall(); return { p, dx: -6, lift: 0 }; }
      case 'cheer': return { p: O.P.cheer(now / 140), dx: 0, lift: 0 };
      default: return { p: O.P.stand('n'), dx: 0, lift: 0 };
    }
  }
  // 나무칼 (손에서 아래로 뻗어요 · 팔이 돌면 같이 돌아요)
  const SWORD = '<g class="rg-sword"><path d="M-2.4 2 L-2.6 34 L0 39 L2.6 34 L2.4 2 Z" fill="#F4F7FF" stroke="#7D8AA8" stroke-width="1.3" stroke-linejoin="round"/><path d="M0 6 V32" stroke="#C9D3E8" stroke-width="1"/><rect x="-7" y="-1" width="14" height="4" rx="2" fill="#FFD23F" stroke="#B98200" stroke-width="1"/><rect x="-2" y="-9" width="4" height="9" rx="1.5" fill="#8A5A3C"/></g>';

  /* ================================================================
     배경: 밤의 도깨비 숲 (겹겹이 다른 빠르기로 흘러요)
     ================================================================ */
  function treeRow(w, h, base, col, col2, n, seed, big) {
    const R = Sim.rng(seed);
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = (i + 0.2 + R() * 0.6) * (w / n);
      const th = (big ? 120 : 80) + R() * (big ? 90 : 60);
      const tw = (big ? 46 : 32) + R() * 22;
      s += `<rect x="${(x - 4).toFixed(1)}" y="${(base - th * 0.45).toFixed(1)}" width="8" height="${(th * 0.45).toFixed(1)}" fill="${col2}"/>`;
      s += `<path d="M${(x - tw).toFixed(1)} ${(base - th * 0.3).toFixed(1)} Q${x.toFixed(1)} ${(base - th * 1.25).toFixed(1)} ${(x + tw).toFixed(1)} ${(base - th * 0.3).toFixed(1)} Q${x.toFixed(1)} ${(base - th * 0.18).toFixed(1)} ${(x - tw).toFixed(1)} ${(base - th * 0.3).toFixed(1)} Z" fill="${col}"/>`;
      s += `<path d="M${(x - tw * 0.8).toFixed(1)} ${(base - th * 0.62).toFixed(1)} Q${x.toFixed(1)} ${(base - th * 1.45).toFixed(1)} ${(x + tw * 0.8).toFixed(1)} ${(base - th * 0.62).toFixed(1)} Q${x.toFixed(1)} ${(base - th * 0.5).toFixed(1)} ${(x - tw * 0.8).toFixed(1)} ${(base - th * 0.62).toFixed(1)} Z" fill="${col}"/>`;
    }
    return s;
  }
  function bushRow(w, base, col, n, seed) {
    const R = Sim.rng(seed);
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = (i + R()) * (w / n); const r = 14 + R() * 16;
      s += `<circle cx="${x.toFixed(1)}" cy="${(base - r * 0.3).toFixed(1)}" r="${r.toFixed(1)}" fill="${col}"/><circle cx="${(x + r * 0.9).toFixed(1)}" cy="${(base - r * 0.1).toFixed(1)}" r="${(r * 0.7).toFixed(1)}" fill="${col}"/>`;
      if (R() < 0.35) s += `<circle cx="${(x - 4).toFixed(1)}" cy="${(base - r * 0.7).toFixed(1)}" r="3" fill="#FF6FB5"/><circle cx="${(x + 6).toFixed(1)}" cy="${(base - r * 0.5).toFixed(1)}" r="2.6" fill="#FFE27A"/>`;
    }
    return s;
  }
  function groundRow(w, y, seed) {
    const R = Sim.rng(seed);
    let s = '';
    for (let i = 0; i < 18; i++) {
      const x = R() * w; const yy = y + 10 + R() * 40;
      s += `<ellipse cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" rx="${(5 + R() * 9).toFixed(1)}" ry="${(2 + R() * 2).toFixed(1)}" fill="rgba(0,0,0,.14)"/>`;
    }
    for (let i = 0; i < 9; i++) {
      const x = R() * w; const yy = y + 4 + R() * 6;
      s += `<path d="M${x.toFixed(1)} ${yy.toFixed(1)} l-3 -9 M${x.toFixed(1)} ${yy.toFixed(1)} l2 -11 M${x.toFixed(1)} ${yy.toFixed(1)} l6 -7" stroke="#3D9A5A" stroke-width="2" stroke-linecap="round"/>`;
    }
    return s;
  }

  /* ================================================================
     만들기
     ================================================================ */
  function create(box, opts) {
    const o = opts || {};
    // 층 나누기: 배경(하늘·먼 숲·가까운 숲·땅·앞 덤불)은 각각 따로 그려 두고 CSS 로 밀기만 해요
    // → 매 프레임 다시 그리는 건 배우·효과가 있는 가운데 층 하나뿐 (폰에서 가볍게)
    const wrap = document.createElement('div');
    wrap.className = 'rg-layers';
    box.insertBefore(wrap, box.firstChild);
    const mkSvg = (cls) => { const e = el('svg', { class: 'rg-svg ' + cls, preserveAspectRatio: 'none' }); wrap.appendChild(e); return e; };
    const skySvg = mkSvg('rg-l-sky');
    const farSvg = mkSvg('rg-l-move');
    const midSvg = mkSvg('rg-l-move');
    const groundSvg = mkSvg('rg-l-move');
    const svg = el('svg', { class: 'rg-svg rg-l-main', preserveAspectRatio: 'xMidYMax meet' });
    wrap.appendChild(svg);
    const nearSvg = mkSvg('rg-l-move rg-l-near');
    let H = 400; let G = 330;      // 장면 높이 · 땅 높이
    const defs = el('defs', {}, `
      <linearGradient id="rgSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1B1640"/><stop offset=".55" stop-color="#2B2A6B"/><stop offset="1" stop-color="#2D5E6E"/></linearGradient>
      <radialGradient id="rgMoon"><stop offset=".6" stop-color="#FFF6D6"/><stop offset="1" stop-color="#FFF6D6" stop-opacity="0"/></radialGradient>
      <linearGradient id="rgPath" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A5A44"/><stop offset="1" stop-color="#4E3A2E"/></linearGradient>
      <radialGradient id="rgGlow"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".4" stop-color="#FFE27A" stop-opacity=".7"/><stop offset="1" stop-color="#FFE27A" stop-opacity="0"/></radialGradient>
      <radialGradient id="rgBlue"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".45" stop-color="#7FB2FF" stop-opacity=".7"/><stop offset="1" stop-color="#3D7BFF" stop-opacity="0"/></radialGradient>`);
    skySvg.appendChild(defs);
    const sky = el('g', {}); skySvg.appendChild(sky);
    const far = el('g', {}); farSvg.appendChild(far);
    const mid = el('g', {}); midSvg.appendChild(mid);
    const ground = el('g', {}); groundSvg.appendChild(ground);
    const flyG = el('g', {}); svg.appendChild(flyG);
    const camG = el('g', {}); svg.appendChild(camG);          // 흔들기·확대는 이 아래만
    const world = el('g', {}); camG.appendChild(world);
    const backFx = el('g', {}); world.appendChild(backFx);
    const actors = el('g', {}); world.appendChild(actors);
    const frontFx = el('g', {}); world.appendChild(frontFx);
    const near = el('g', { class: 'rg-near' }); nearSvg.appendChild(near);
    const cam = O.fx.cam(camG);
    let PB = null; let PF = null;
    const flies = [];

    // 배경 무늬 (폭 720 두 장을 이어 붙여 흘려요)
    const TILE = 720;
    const layers = [];
    function buildBg() {
      sky.innerHTML = `<rect x="-20" y="-20" width="${W0 + 40}" height="${H + 40}" fill="url(#rgSky)"/>
        <circle cx="214" cy="${(H * 0.2).toFixed(0)}" r="40" fill="url(#rgMoon)" opacity=".55"/><circle cx="214" cy="${(H * 0.2).toFixed(0)}" r="22" fill="#FFF6D6"/><circle cx="222" cy="${(H * 0.2 - 4).toFixed(0)}" r="18" fill="#2B2A6B" opacity=".25"/>
        ${Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 137 % 360)}" cy="${(i * 53 % Math.round(H * 0.42)) + 6}" r="${(i % 3) * 0.5 + 0.8}" fill="#fff" opacity="${(0.35 + (i % 4) * 0.2).toFixed(2)}"/>`).join('')}`;
      const mk = (g, html, k) => {
        g.innerHTML = '';
        const a = el('g', {}, html); const b = el('g', { transform: `translate(${TILE} 0)` }, html);
        const w = el('g', {}); w.appendChild(a); w.appendChild(b); g.appendChild(w);
        layers.push({ w, k, svg: g.ownerSVGElement });
      };
      layers.length = 0;
      mk(far, treeRow(TILE, H, G - 44, '#26285E', '#1E2050', 11, 3, true), 0.18);
      mk(mid, treeRow(TILE, H, G - 6, '#1F4D55', '#173B42', 9, 9, false) + bushRow(TILE, G - 2, '#1E5A4A', 10, 4), 0.5);
      mk(ground, `<rect x="0" y="${G - 6}" width="${TILE}" height="${H - G + 12}" fill="#2F6B4A"/><path d="M0 ${G + 6} Q180 ${G - 2} 360 ${G + 6} T720 ${G + 6} V${G + 34} Q540 ${G + 44} 360 ${G + 34} T0 ${G + 34} Z" fill="url(#rgPath)"/>` + groundRow(TILE, G, 5), 1);
      mk(near, bushRow(TILE, H + 16, '#123A30', 7, 11), 1.35);
      // 반딧불
      flies.forEach((f) => f.el.remove());
      flies.length = 0;
      for (let i = 0; i < 9; i++) {
        const f = el('circle', { r: 2.4, fill: '#E9FF8A' });
        flyG.appendChild(f);
        flies.push({ el: f, x: (i * 47) % W0, y: H * 0.35 + (i * 31) % (G - H * 0.35), ph: i * 1.3 });
      }
    }

    let bx = 0; let by = 0;
    // 배경 층 밀기 (CSS transform → 다시 그리지 않고 옮기기만)
    function moveLayers(sc) {
      const k = bx / W0;
      layers.forEach((L) => {
        const x = (((sc * L.k) % TILE) + TILE) % TILE;
        const px = Math.round(-x * k * 2) / 2;
        if (L.px !== px) { L.px = px; L.svg.style.transform = `translate3d(${px}px,0,0)`; }
      });
    }
    function resize() {
      const r = box.getBoundingClientRect();
      if ((r.width < 10 || r.height < 10) && bx) return;      // 숨겨진 동안은 그대로
      if (Math.abs(r.width - bx) < 0.5 && Math.abs(r.height - by) < 0.5 && PB) return;
      bx = r.width || 360; by = r.height || 400;
      H = Math.max(240, Math.round(W0 * by / bx));
      G = H - Math.max(46, Math.min(70, H * 0.14));
      svg.setAttribute('viewBox', `0 0 ${W0} ${H}`);
      skySvg.setAttribute('viewBox', `0 0 ${W0} ${H}`);
      const k = bx / W0;
      [farSvg, midSvg, groundSvg, nearSvg].forEach((e) => {
        e.setAttribute('viewBox', `0 0 ${2 * TILE} ${H}`);
        e.style.width = (2 * TILE * k).toFixed(1) + 'px';
        e.style.height = by + 'px';
      });
      buildBg();
      if (PB) { backFx.innerHTML = ''; frontFx.innerHTML = ''; }
      PB = O.fx.parts(backFx, 24);
      PF = O.fx.parts(frontFx, 60);
      texts.length = 0; arcs.length = 0; rings.length = 0;
      buildPools();
    }

    /* ---------- 글자(피해 숫자) · 베기 궤적 · 예고 고리 묶음 ---------- */
    const texts = []; const arcs = []; const rings = [];
    let numK = 0;
    let tele = null; let vulnG = null; let marks = {};
    function buildPools() {
      for (let i = 0; i < 18; i++) {
        const t = el('text', { class: 'rg-num', 'text-anchor': 'middle', display: 'none' });
        frontFx.appendChild(t);
        texts.push({ el: t, on: false });
      }
      for (let i = 0; i < 6; i++) {
        const p = el('path', { class: 'rg-arc', display: 'none' });
        frontFx.appendChild(p);
        arcs.push({ el: p, on: false });
      }
      for (let i = 0; i < 4; i++) {
        const c = el('circle', { class: 'rg-ring', fill: 'none', display: 'none' });
        frontFx.appendChild(c);
        rings.push({ el: c, on: false });
      }
      tele = el('g', { class: 'rg-tele', display: 'none' }, `
        <circle class="rg-tele-ring" r="44" fill="none" stroke-width="5"/>
        <circle class="rg-tele-bg" r="21"/>
        <g class="rg-tele-ic"></g>
        <text class="rg-tele-tx" y="40" text-anchor="middle"></text>`);
      frontFx.appendChild(tele);
      tele.ring = tele.querySelector('.rg-tele-ring'); tele.bg = tele.querySelector('.rg-tele-bg'); tele.ic = tele.querySelector('.rg-tele-ic'); tele.tx = tele.querySelector('.rg-tele-tx');
      vulnG = el('g', { class: 'rg-vuln', display: 'none' }, `<rect x="-46" y="-15" width="92" height="30" rx="15" fill="#FF4757" stroke="#fff" stroke-width="2.5"/>
        <text y="6" text-anchor="middle" class="rg-vuln-tx">지금 때려! ×2</text><rect class="rg-vuln-bar" x="-36" y="10" width="72" height="3.5" rx="1.75" fill="#FFE27A"/>`);
      frontFx.appendChild(vulnG);
      vulnG.bar = vulnG.querySelector('.rg-vuln-bar');
      marks = {};
    }
    function num(text, x, y, o2) {
      const q = o2 || {};
      const t = texts.find((z) => !z.on) || texts[0];
      t.on = true; t.t = 0; t.x = x; t.y = y; t.vy = q.vy || -95; t.vx = q.vx == null ? 22 : q.vx; t.size = q.size || 22; t.pop = q.pop || 1.4; t.life = q.life || (t.size >= 30 ? 0.9 : 0.62);
      t.el.textContent = text;
      t.el.setAttribute('fill', q.color || '#fff');
      t.el.setAttribute('stroke', q.stroke || '#2A1A3A');
      t.el.removeAttribute('display');
      t.el.style.fontSize = t.size + 'px';
      return t;
    }
    function arc(x1, y1, x2, y2, bend, color, width) {
      const a = arcs.find((z) => !z.on) || arcs[0];
      a.on = true; a.t = 0; a.life = 0.17;
      const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
      const nx = -(y2 - y1); const ny = (x2 - x1); const L = Math.hypot(nx, ny) || 1;
      const cx = mx + nx / L * bend; const cy = my + ny / L * bend;
      const cx2 = mx + nx / L * bend * (1 - (width || 0.35)); const cy2 = my + ny / L * bend * (1 - (width || 0.35));
      a.el.setAttribute('d', `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)} Q${cx2.toFixed(1)} ${cy2.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)} Z`);
      a.el.setAttribute('fill', color || '#fff');
      a.el.removeAttribute('display');
    }
    function ringFx(x, y, color, r0, r1, life, w) {
      const r = rings.find((z) => !z.on) || rings[0];
      r.on = true; r.t = 0; r.life = life || 0.4; r.r0 = r0; r.r1 = r1; r.w = w || 6;
      r.el.setAttribute('cx', x.toFixed(1)); r.el.setAttribute('cy', y.toFixed(1));
      r.el.setAttribute('stroke', color);
      r.el.removeAttribute('display');
    }
    function tickPools(dt) {
      texts.forEach((t) => {
        if (!t.on) return;
        t.t += dt;
        if (t.t >= t.life) { t.on = false; t.el.setAttribute('display', 'none'); return; }
        const k = t.t / t.life;
        const s = k < 0.15 ? lerp(0.4, t.pop, k / 0.15) : lerp(t.pop, 1, Math.min(1, (k - 0.15) / 0.2));
        t.y += t.vy * dt; t.vy *= Math.exp(-dt * 2.5); t.x += t.vx * dt;
        t.el.setAttribute('transform', `translate(${t.x.toFixed(1)} ${t.y.toFixed(1)}) scale(${s.toFixed(2)})`);
        t.el.setAttribute('opacity', (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1).toFixed(2));
      });
      arcs.forEach((a) => {
        if (!a.on) return;
        a.t += dt;
        if (a.t >= a.life) { a.on = false; a.el.setAttribute('display', 'none'); return; }
        a.el.setAttribute('opacity', (1 - a.t / a.life).toFixed(2));
      });
      rings.forEach((r) => {
        if (!r.on) return;
        r.t += dt;
        if (r.t >= r.life) { r.on = false; r.el.setAttribute('display', 'none'); return; }
        const k = out(r.t / r.life);
        r.el.setAttribute('r', lerp(r.r0, r.r1, k).toFixed(1));
        r.el.setAttribute('stroke-width', (r.w * (1 - k) + 0.5).toFixed(1));
        r.el.setAttribute('opacity', (1 - k).toFixed(2));
      });
    }

    /* ---------- 배우들 ---------- */
    let heroes = {};         // id → { rig, slot, aura, shield, bar }
    let order = [];
    let erig = null; let eid = 0; let ekind = '';
    let E = { x: 300, kb: 0, kbv: 0, sq: 0, lunge: 0, enter: 0, deadT: 0, hitT: 0 };
    const myId = o.myId;
    function slotPos(i) {
      // 0 = 나 (맨 앞) · 나머지는 한 줄씩 뒤로 (작고 위로)
      const ys = [12, -6, -22, -36];
      const xs = [116, 70, 96, 46];
      return { x: xs[i] || 40, y: G + (ys[i] || 0), s: 1 + (ys[i] || 0) * 0.0045 };
    }
    function build(W) {
      Object.values(heroes).forEach((x) => x.rig.remove && x.rig.remove());
      Object.values(heroes).forEach((x) => { if (x.extra) x.extra.remove(); });
      heroes = {};
      actors.innerHTML = '';
      if (erig) erig = null; eid = 0;
      const list = W.heroes.slice().sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : 0));
      order = list.map((h) => h.id);
      list.forEach((h, i) => {
        const extra = el('g', {});
        const glow = el('ellipse', { class: 'rg-chg', cx: 0, cy: -40, rx: 30, ry: 44, fill: 'url(#rgGlow)', opacity: 0 });
        extra.appendChild(glow);
        const shield = el('g', { class: 'rg-shield', opacity: 0 }, '<path d="M30 -78 Q48 -46 30 -8" fill="none" stroke="#7DF0AE" stroke-width="7" stroke-linecap="round"/><path d="M24 -84 Q50 -46 24 -2" fill="rgba(46,213,115,.22)" stroke="#2ED573" stroke-width="2.5"/>');
        extra.appendChild(shield);
        // 모으기 고리 (꾹 누르는 동안 한 바퀴 차요 · 다 차면 번쩍)
        const chg = el('g', { class: 'rg-chgring', opacity: 0 }, '<circle r="30" cy="-44" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="6"/><circle class="rg-chg-p" r="30" cy="-44" fill="none" stroke="#FFB347" stroke-width="6" stroke-linecap="round" stroke-dasharray="188.5" stroke-dashoffset="188.5" transform="rotate(-90 0 -44)"/>');
        extra.appendChild(chg);
        const rig = O.makeAthlete(h.ath, null, { tag: h.id === myId ? '나' : h.name, me: h.id === myId });
        rig.hold(SWORD, true);
        const bar = el('g', { class: 'rg-hbar', transform: 'translate(0 -122)' }, '<rect x="-20" y="-3" width="40" height="6" rx="3" fill="rgba(0,0,0,.55)"/><rect class="rg-hbar-f" x="-19" y="-2" width="38" height="4" rx="2" fill="#2ED573"/>');
        if (h.id !== myId) rig.g.appendChild(bar);
        heroes[h.id] = { rig, i, extra, glow, shield, chg, chgP: chg.querySelector('.rg-chg-p'), bar: bar.querySelector('.rg-hbar-f'), hurtT: -9, lastHp: -1, flashT: -9, dx: 0 };
      });
      // 뒤(위)에 있는 용사부터 그려요
      order.slice().map((id, i) => ({ id, y: slotPos(i).y })).sort((a, b) => a.y - b.y).forEach(({ id }) => {
        actors.appendChild(heroes[id].extra);
        actors.appendChild(heroes[id].rig.g);
      });
      setEnemy(W);
    }
    function setEnemy(W) {
      const en = W.enemy;
      const id = en && !(en.dead && W.t - en.dead > 900) ? en.eid : 0;
      if (id === eid) return;
      if (erig) { erig.remove(); erig = null; }
      eid = id;
      if (!en || !id) return;
      ekind = en.kind;
      erig = makeEnemyRig(en.kind);
      actors.insertBefore(erig.g, actors.firstChild);
      E = { x: 420, kb: 0, kbv: 0, sq: 0, lunge: 0, enter: W.t, deadT: 0, hitT: -9, flashT: -9 };
    }
    const enemyHome = (kind) => (kind === 'boss' ? 222 : kind === 'golem' ? 206 : 196);
    function enemyFront() {
      const sc = ekind === 'boss' ? 0.8 : 1;
      return { x: E.x - (FRONT[ekind] || 30) * sc, y: G - (TOP[ekind] || 80) * 0.45 * sc - (ekind === 'bat' ? 42 : 0) };
    }
    function heroPos(id) {
      const H0 = heroes[id];
      if (!H0) return { x: 140, y: G };
      const s = slotPos(H0.i);
      return { x: s.x + (H0.dx || 0), y: s.y, s: s.s };
    }

    /* ---------- 진행 상태 ---------- */
    let scroll = 0; let speed = 0; let slowT = 0; let tNow = 0;
    let hist = []; let rw = null; let party = false; let cheer = false;

    function frame(W, dtReal) {
      const dt0 = Math.min(0.05, dtReal || 0.016);
      tNow += dt0;
      if (rw) { rewindFrame(dt0); return; }
      let dt = dt0;
      if (slowT > 0) { slowT -= dt0; dt = dt0 * D.hero.slowScale; }
      setEnemy(W);
      const walking = W.phase === 'walk' || W.phase === 'cards';
      const target = walking ? 64 : 0;
      speed += (target - speed) * Math.min(1, dt * 4);
      scroll += speed * dt;
      moveLayers(scroll);
      flies.forEach((f) => { f.ph += dt; f.el.setAttribute('cx', ((f.x - scroll * 0.3 + Math.sin(f.ph * 0.7) * 14) % W0 + W0) % W0); f.el.setAttribute('cy', (f.y + Math.sin(f.ph * 1.3) * 8).toFixed(1)); f.el.setAttribute('opacity', (0.4 + 0.6 * Math.abs(Math.sin(f.ph * 1.7))).toFixed(2)); });
      const snap = { scroll, h: {}, e: null };
      // 용사
      W.heroes.forEach((h) => {
        const X = heroes[h.id];
        if (!X) return;
        const pos = slotPos(X.i);
        const a = cheer && !h.down ? 'cheer' : (W.phase === 'walk' || W.phase === 'cards') && (h.act === 'idle' || h.act === 'guard') ? 'walk' : h.act;
        const T = h.kind === 'remote' ? Math.max(0, W.t - (h.actAt || W.t)) : h.actT;
        const ps = heroPose(a, T, h, W.t);
        X.dx += ((ps.dx || 0) - X.dx) * Math.min(1, dt * 30);
        const p = Object.assign({}, ps.p, { x: pos.x + X.dx, y: pos.y - (ps.lift || 0), s: pos.s });
        // 맞으면 빨갛게 반짝
        const hurtK = clamp(1 - (tNow - X.hurtT) / 0.25, 0, 1);
        if (hurtK > 0) p.ex = 'o';
        X.rig.set(p);
        X.rig.g.classList.toggle('rg-hurtf', hurtK > 0.3);
        X.extra.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${pos.s.toFixed(3)})`);
        X.glow.setAttribute('opacity', ps.charge ? (0.25 + 0.6 * ps.charge + (ps.full ? 0.2 * Math.sin(tNow * 30) : 0)).toFixed(2) : ps.spec ? '0.8' : '0');
        if (ps.spec) X.glow.setAttribute('fill', 'url(#rgBlue)'); else X.glow.setAttribute('fill', 'url(#rgGlow)');
        X.shield.setAttribute('opacity', (ps.guard ? 0.95 * ps.guard : 0).toFixed(2));
        if (ps.charge != null) {
          X.chg.setAttribute('opacity', '1');
          X.chgP.setAttribute('stroke-dashoffset', (188.5 * (1 - ps.charge)).toFixed(1));
          X.chgP.setAttribute('stroke', ps.full ? (Math.sin(tNow * 30) > 0 ? '#FFFFFF' : '#FFE27A') : '#FFB347');
          X.chg.setAttribute('transform', `scale(${(ps.full ? 1.12 + 0.05 * Math.sin(tNow * 30) : 1).toFixed(3)})`);
        } else X.chg.setAttribute('opacity', '0');
        if (X.bar && h.st) { const k = clamp(h.hp / h.st.maxHp, 0, 1); if (Math.abs(k - X.lastHp) > 0.004) { X.lastHp = k; X.bar.setAttribute('width', (38 * k).toFixed(1)); X.bar.setAttribute('fill', k < 0.3 ? '#FF4757' : '#2ED573'); } }
        X.rig.g.setAttribute('opacity', h.down ? '0.75' : '1');
        if (ps.charge && ps.full && Math.random() < 0.3) PF.burst('spark', p.x, p.y - 50, 1, { sp: 80, color: '#FFE27A' });
        if (ps.spec && Math.random() < 0.5) PF.burst('star', p.x + (Math.random() - 0.5) * 40, p.y - 40 - Math.random() * 50, 1, { sp: 40, k: 0.7 });
        if (a === 'walk' && Math.random() < dt * 3 && X.i < 2) PB.burst('dust', p.x - 8, p.y, 1, { dir: Math.PI, spread: 0.8, sp: 30, k: 0.6 });
        snap.h[h.id] = p;
      });
      // 적
      const en = W.enemy;
      if (erig && en) {
        const home = enemyHome(en.kind);
        const frozen = W.t < (en.frz || 0);
        const edt = frozen ? 0 : dt;
        const ent = clamp((W.t - E.enter) / 650, 0, 1);
        const tx = lerp(home + 170, home, out(ent));
        // 밀려나기 (용수철)
        E.kbv += (-E.kb * 170 - E.kbv * 18) * edt; E.kb += E.kbv * edt;
        E.sq *= Math.exp(-edt * 12);
        // 예고 자세: 뒤로 젖혔다가 콱!
        let tilt = 0; let arm = 0; let wind = 0; let aura = ''; let auraK = 0; let lift = 0; let head = 0;
        const a = W.atks.find((x) => !x.over && !x.broken);
        const last = W.atks.filter((x) => !x.broken).slice(-1)[0];
        if (a) {
          const ti = a.hits.find((x) => x >= W.t - 60) || a.hits[a.hits.length - 1];
          const i = a.hits.indexOf(ti);
          const from = i > 0 ? a.hits[i - 1] : a.t0;
          const k = clamp((W.t - from) / Math.max(1, ti - from), 0, 1);
          wind = W.t < ti ? k : 0;
          aura = a.icon === 'r' ? 'r' : 'g'; auraK = wind;
          tilt = 10 * ease(wind) + Math.sin(W.t / 30) * 1.5 * wind;
          arm = -110 * ease(wind);
          head = 6 * wind;
          if (W.t >= ti - 10 && W.t < ti + 140) { tilt = -16; arm = 30; E.lunge = 1; }
        }
        if (last && last.over && W.t - last.hits[last.hits.length - 1] < 160) { tilt = -14; arm = 30; }
        E.lunge *= Math.exp(-dt * 10);
        const stun = W.t < en.stun;
        const vuln = W.t < en.vuln;
        if (vuln && !a) { aura = 'v'; auraK = 0.4 + 0.3 * Math.sin(tNow * 10); }
        if (stun) { tilt = -8 + Math.sin(tNow * 6) * 6; head = Math.sin(tNow * 5) * 12; arm = 20; }
        let alpha = 1;
        if (en.dead) {
          const k = clamp((W.t - en.dead) / 650, 0, 1);
          alpha = 1 - k; lift = -k * 30; tilt = 30 * k;
        }
        if (en.kind === 'bat') lift -= 42 + Math.sin(W.t / 220) * 6;
        const flash = tNow - E.flashT < 0.07;
        const ex = tx + E.kb - E.lunge * (en.kind === 'boss' ? 26 : 34);
        const kind = en.kind;
        const sz = kind === 'boss' ? 0.8 : 1;
        E.x = ex;
        const ep = { x: ex, y: G + 6, s: sz * (1 + 0.06 * wind), sq: E.sq + (wind ? -0.05 * wind : 0) + (stun ? 0.04 * Math.sin(tNow * 9) : 0), tilt, arm, head, lift, flap: W.t / 70, aura, auraK, stun, flash, alpha };
        erig.set(ep);
        snap.e = Object.assign({ kind }, ep);
        drawTele(W, a, en);
        drawVuln(W, en, a);
      } else { tele && tele.setAttribute('display', 'none'); vulnG && vulnG.setAttribute('display', 'none'); }
      drawMarks(W);
      PB.tick(dt); PF.tick(dt); tickPools(dt);
      cam.tick(dt0);
      hist.push(snap);
      if (hist.length > 220) hist.shift();
    }

    // 예고: 머리 위 아이콘 + 줄어드는 고리 (고리가 아이콘에 닿을 때 누르면 패링!)
    function drawTele(W, a, en) {
      if (!a || en.dead) { tele.setAttribute('display', 'none'); return; }
      const nxt = a.hits.findIndex((x) => x > W.t - 40);
      if (nxt < 0) { tele.setAttribute('display', 'none'); return; }
      const ti = a.hits[nxt];
      const from = nxt > 0 ? a.hits[nxt - 1] : a.t0;
      const k = clamp((ti - W.t) / Math.max(1, ti - from), 0, 1);
      const top = (TOP[en.kind] || 80) * (en.kind === 'boss' ? 0.8 : 1);
      const x = Math.max(70, E.x - 6); const y = G - top - 34 + (en.kind === 'bat' ? -40 : 0);
      tele.removeAttribute('display');
      tele.setAttribute('transform', `translate(${x.toFixed(1)} ${Math.max(40, y).toFixed(1)})`);
      const red = a.icon === 'r';
      const key = (red ? 'r' : 'g') + a.hits.length + nxt;
      if (tele._k !== key) {
        tele._k = key;
        tele.ic.innerHTML = red
          ? '<path d="M-9 -2 Q-10 -11 -3 -11 L5 -11 Q11 -11 10 -4 L10 4 Q10 11 3 11 L-4 11 Q-10 10 -10 4 Z" fill="#fff"/><path d="M-6 -11 V-4 M-1 -11 V-4 M4 -11 V-4" stroke="#FF4757" stroke-width="2"/>'
          : '<path d="M0 -13 L11 -8 Q11 6 0 13 Q-11 6 -11 -8 Z" fill="#fff"/><path d="M0 -8 L6 -5 Q6 3 0 8 Q-6 3 -6 -5 Z" fill="#2ED573"/>';
        tele.bg.setAttribute('fill', red ? '#FF4757' : '#2ED573');
        tele.ring.setAttribute('stroke', red ? '#FF8B95' : '#7DF0AE');
        tele.tx.textContent = red ? '때려서 끊기!' : a.hits.length > 1 ? `막아! ${nxt + 1}/${a.hits.length}` : a.all ? '모두 막아!' : '막아!';
        tele.tx.setAttribute('fill', red ? '#FFB3BA' : '#B8FFD6');
      }
      const r = red ? 21 + 23 * k : 21 + 34 * k;
      tele.ring.setAttribute('r', r.toFixed(1));
      tele.ring.setAttribute('opacity', (0.5 + 0.5 * (1 - k)).toFixed(2));
      const close = !red && k < 0.18;
      tele.bg.setAttribute('transform', `scale(${(close ? 1.18 : 1 + 0.05 * Math.sin(tNow * 18)).toFixed(3)})`);
      if (red && a.brk) {
        // 끊기 게이지 (얼마나 더 때려야 하나)
        const f = clamp(a.brkDmg / a.brk, 0, 1);
        tele.tx.textContent = `때려서 끊기! ${Math.round(f * 100)}%`;
      }
    }
    function drawVuln(W, en, a) {
      const on = !en.dead && W.t < en.vuln && !a;
      if (!on) { vulnG.setAttribute('display', 'none'); return; }
      vulnG.removeAttribute('display');
      const top = TOP[en.kind] || 80;
      vulnG.setAttribute('transform', `translate(${Math.max(80, E.x).toFixed(1)} ${Math.max(28, G - top * 0.92 - 26 + (en.kind === 'bat' ? -40 : 0)).toFixed(1)}) scale(${(1 + 0.05 * Math.sin(tNow * 14)).toFixed(3)})`);
      const left = en.vuln - W.t;
      vulnG.bar.setAttribute('width', (72 * clamp(left / 1800, 0, 1)).toFixed(1));
    }
    // 노리는 용사 위에 '!' 표시
    function drawMarks(W) {
      const a = W.atks.find((x) => !x.over && !x.broken);
      const tg = a ? (a.all ? W.heroes.map((h) => h.id) : a.tg) : [];
      Object.keys(heroes).forEach((id) => {
        const X = heroes[id];
        let m = marks[id];
        const on = tg.indexOf(id) >= 0 && !(heroById(W, id) || {}).down;
        if (on && !m) {
          m = el('g', { class: 'rg-mark' }, `<path d="M0 0 L-9 -14 H9 Z" fill="${a.icon === 'r' ? '#FF4757' : '#2ED573'}" stroke="#fff" stroke-width="2"/><text y="-18" text-anchor="middle" class="rg-mark-tx">${id === myId ? '나!' : '!'}</text>`);
          frontFx.appendChild(m); marks[id] = m;
        }
        if (!on && m) { m.remove(); delete marks[id]; return; }
        if (m) { const p = heroPos(id); m.setAttribute('transform', `translate(${p.x.toFixed(1)} ${(p.y - 120 + Math.sin(tNow * 10) * 3).toFixed(1)})`); }
      });
    }
    const heroById = (W, id) => W.heroes.find((h) => h.id === id);

    /* ---------- 일어난 일 → 효과 ---------- */
    const KIND = {
      c1: { col: '#FFFFFF', size: 20, sh: 1.2, bend: 26 }, c2: { col: '#FFFFFF', size: 22, sh: 1.5, bend: -28 }, c3: { col: '#FFE27A', size: 30, sh: 3, bend: 38 },
      heavyHalf: { col: '#FFB347', size: 30, sh: 3, bend: 40 }, heavy: { col: '#FF8A3D', size: 40, sh: 5, bend: 52 },
      counter: { col: '#7DF0FF', size: 40, sh: 5, bend: 46 }, spec: { col: '#A9C4FF', size: 24, sh: 2, bend: 30 }, specEnd: { col: '#C9DDFF', size: 44, sh: 6, bend: 60 }
    };
    function event(e, W) {
      const X = e.h ? heroes[e.h] : null;
      const mine = e.h === myId;
      switch (e.k) {
        case 'hit': {
          const kd = KIND[e.kind] || KIND.c1;
          const f = enemyFront();
          const hp = heroPos(e.h);
          const hx = hp.x + 22; const hy = hp.y - 52;
          const big = e.kind === 'c3' || e.kind === 'heavy' || e.kind === 'counter' || e.kind === 'specEnd';
          arc(hx, hy - 20, f.x + 8, f.y + (e.kind === 'c2' ? -20 : 18), kd.bend * (mine ? 1 : 0.7), e.kind === 'spec' || e.kind === 'specEnd' ? '#BFD6FF' : '#fff', big ? 0.5 : 0.3);
          PF.burst('spark', f.x, f.y, big ? 12 : 6, { sp: big ? 260 : 170, color: kd.col, dir: 0, spread: Math.PI * 1.4 });
          if (big) PF.burst('ring', f.x, f.y, 1, { color: kd.col });
          numK = (numK + 1) % 4;
          const top = (TOP[ekind] || 80) * (ekind === 'boss' ? 0.5 : 0.85) + (ekind === 'bat' ? 40 : 0);
          num(e.dmg + (e.crit ? '!' : ''), E.x + [-6, 22, 4, 32][numK], G - top - [0, 18, 6, 26][numK],
            { color: e.crit ? '#FF4757' : kd.col, size: kd.size * (e.crit ? 1.25 : 1) * (mine ? 1 : 0.8), pop: big ? 1.7 : 1.35, stroke: e.crit ? '#fff' : '#2A1A3A' });
          const kb = e.kind === 'heavy' ? 28 : e.kind === 'counter' ? 24 : e.kind === 'c3' || e.kind === 'specEnd' ? 18 : 8;
          E.kbv += kb * (ekind === 'boss' ? 7 : 12);
          E.sq = big ? 0.2 : 0.12;
          E.flashT = tNow;
          if (mine || !party) cam.shake(Math.min(5, kd.sh * (ekind === 'boss' ? 0.8 : 1)), big ? 220 : 120);
          if (big) cam.punch(e.kind === 'heavy' || e.kind === 'specEnd' ? 0.05 : 0.03);
          break;
        }
        case 'swing': {
          if (!X) break;
          const hp = heroPos(e.h);
          if (e.step === 'heavy') PB.burst('dust', hp.x, hp.y, 5, { dir: Math.PI, spread: 1.2, sp: 90 });
          break;
        }
        case 'parry': {
          const hp = heroPos(e.h);
          const f = enemyFront();
          const x = (hp.x + 36 + f.x) / 2; const y = hp.y - 56;
          PF.burst('spark', x, y, 18, { sp: 320, color: '#FFFFFF' });
          PF.burst('spark', x, y, 10, { sp: 220, color: '#FFE27A' });
          PF.burst('star', x, y, 5, { sp: 140 });
          ringFx(x, y, '#FFFFFF', 6, 80, 0.38, 9);
          ringFx(x, y, '#7DF0AE', 4, 54, 0.3, 6);
          E.kbv += ekind === 'boss' ? 160 : 260;
          E.sq = 0.16;
          if (mine || !party) { cam.focus(x, y); cam.punch(0.09); cam.shake(4, 180); slowT = D.hero.slowmo / 1000; }
          break;
        }
        case 'guard': {
          const hp = heroPos(e.h);
          PF.burst('spark', hp.x + 34, hp.y - 50, 6, { sp: 160, color: '#7DF0AE', dir: Math.PI, spread: 1.6 });
          num('-' + e.dmg, hp.x - 18, hp.y - 126, { color: '#7DF0AE', size: 18 });
          if (mine) cam.shake(2, 120);
          break;
        }
        case 'hurt': {
          if (!X) break;
          X.hurtT = tNow;
          const hp = heroPos(e.h);
          PF.burst('star', hp.x + 10, hp.y - 70, 3, { sp: 110 });
          num('-' + e.dmg, hp.x - 22, hp.y - 128, { color: '#FF6B78', size: mine ? 26 : 20, stroke: '#3A0A14' });
          if (mine) cam.shake(4.5, 260);
          break;
        }
        case 'dodge': { const hp = heroPos(e.h); num('피했다!', hp.x, hp.y - 110, { color: '#A9C4FF', size: 16 }); break; }
        case 'heal': { if (e.n < 2) break; const hp = heroPos(e.h); num('+' + e.n, hp.x - 16, hp.y - 108, { color: '#7DF0AE', size: 17, vy: -40 }); break; }
        case 'down': { const hp = heroPos(e.h); PB.burst('dust', hp.x, hp.y, 8, { sp: 90 }); break; }
        case 'impact': {
          const a = W.atks.find((x) => x.id === e.a);
          if (a && ekind) {
            const f = enemyFront();
            PB.burst('dust', f.x - 30, G + 4, ekind === 'boss' ? 8 : 3, { dir: Math.PI, spread: 1.4, sp: 120 });
            if (a.pat === 'fire') heroesList().forEach((id) => { const p = heroPos(id); PF.burst('spark', p.x + 20, p.y - 50, 6, { sp: 140, color: '#7FD3FF' }); });
            if (ekind === 'boss' && a.pat === 'smash') { cam.shake(5, 300); PB.burst('dust', f.x - 50, G + 4, 10, { sp: 200, dir: Math.PI, spread: 2 }); }
          }
          break;
        }
        case 'break': {
          const f = enemyFront();
          PF.burst('star', f.x, f.y - 30, 8, { sp: 180 });
          PF.burst('spark', f.x, f.y - 30, 14, { sp: 260, color: '#FF8B95' });
          ringFx(f.x, f.y - 30, '#FF4757', 10, 90, 0.45, 10);
          cam.shake(5, 300); cam.punch(0.06);
          E.kbv += 220; E.sq = 0.22;
          break;
        }
        case 'kill': {
          const f = enemyFront();
          const boss = e.boss;
          PF.burst('star', f.x + 20, f.y, boss ? 14 : 7, { sp: boss ? 260 : 170 });
          PF.burst('confetti', f.x + 20, f.y - 20, boss ? 40 : 12, { sp: boss ? 340 : 220 });
          ringFx(f.x + 20, f.y, '#FFE27A', 10, boss ? 160 : 70, 0.5, 10);
          cam.shake(boss ? 6 : 3, boss ? 600 : 250); cam.punch(boss ? 0.1 : 0.04);
          if (boss) slowT = 0.8;
          break;
        }
        case 'lvup': { const hp = heroPos(e.h); PF.burst('star', hp.x, hp.y - 60, 6, { sp: 120 }); ringFx(hp.x, hp.y - 50, '#FFE27A', 10, 60, 0.5, 6); break; }
        case 'spec': {
          const hp = heroPos(e.h);
          ringFx(hp.x, hp.y - 50, '#7FB2FF', 10, 140, 0.6, 12);
          PF.burst('star', hp.x, hp.y - 50, 10, { sp: 220 });
          if (mine) { cam.punch(0.06); cam.shake(3, 300); }
          break;
        }
        case 'spawn': break;
        case 'tele': break;
        default: break;
      }
    }
    const heroesList = () => Object.keys(heroes);

    /* ---------- 되감기 ---------- */
    function rewind(ms, done) {
      rw = { t: 0, t0: performance.now(), dur: ms / 1000, done, h0: hist.length, sc: scroll };
      tele && tele.setAttribute('display', 'none');
      vulnG && vulnG.setAttribute('display', 'none');
      Object.values(marks).forEach((m) => m.remove()); marks = {};
      PB.clear(); PF.clear();
      texts.forEach((t) => { t.on = false; t.el.setAttribute('display', 'none'); });
    }
    function rewindFrame(dt) {
      rw.t = (performance.now() - rw.t0) / 1000;    // 화면이 느려도 되감기 길이는 그대로 (실제 시간)
      const k = clamp(rw.t / rw.dur, 0, 1);
      // 앞 55%: 지난 모습을 거꾸로 (점점 빠르게) · 뒤 45%: 숲이 휙휙 뒤로
      const kk = clamp(k / 0.55, 0, 1);
      const idx = Math.max(0, Math.round((hist.length - 1) * (1 - kk * kk)));
      const s = hist[idx];
      if (s) {
        Object.keys(s.h).forEach((id) => { const X = heroes[id]; if (X) X.rig.set(Object.assign({}, s.h[id], { ex: 'd' })); });
        if (erig && s.e) erig.set(Object.assign({}, s.e, { flash: false }));
      }
      let sc = s ? s.scroll : rw.sc;
      if (k > 0.55) {
        const u = (k - 0.55) / 0.45;
        sc = (s ? s.scroll : rw.sc) - 2600 * u * u;
        if (erig) erig.g.setAttribute('opacity', Math.max(0, 1 - u * 3).toFixed(2));
        Object.keys(heroes).forEach((id) => { const X = heroes[id]; const p = slotPos(X.i); X.rig.set(Object.assign(O.P.run(-rw.t * 30, 0.9, 'o'), { x: p.x, y: p.y, s: p.s, tilt: -10 })); });
      }
      moveLayers(sc);
      if (k >= 1) {
        const d = rw.done; rw = null; hist = [];
        scroll = 0;
        if (d) d();
      }
    }

    function celebrate() {
      cheer = true;
      for (let i = 0; i < 4; i++) setTimeout(() => PF.burst('confetti', 60 + Math.random() * 240, 40 + Math.random() * 80, 18, { sp: 260 }), i * 220);
    }

    resize();
    const onResize = () => { resize(); };
    window.addEventListener('resize', onResize);
    // 화면이 처음 보일 때(숨겨져 있다가) · 크기가 바뀔 때 다시 맞춰요
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(onResize); ro.observe(box); }
    return {
      build(W) { cheer = false; hist = []; rw = null; scroll = 0; speed = 0; party = W.heroes.length > 1; build(W); },
      frame, event, rewind, celebrate,
      get rewinding() { return !!rw; },
      heroScreen(id) { const p = heroPos(id); return { x: p.x / W0 * bx, y: p.y / H * by }; },
      enemyScreen() { const f = enemyFront(); return { x: f.x / W0 * bx, y: f.y / H * by }; },
      resize,
      destroy() { window.removeEventListener('resize', onResize); if (ro) ro.disconnect(); wrap.remove(); }
    };
  }

  window.RpgView = { create, heroPose, ART };
})();
