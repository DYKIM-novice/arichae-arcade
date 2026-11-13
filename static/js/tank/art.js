/* 노을언덕 포격대 · 그림 (모두 코드로 직접 그림 — 이미지 파일·생성 AI 없음)
   - drawTank: 옆에서 본 몽돌(파랑·낮은 차체·짧고 굵은 포신·큰 눈)과 망루(주황·높은 차체·긴 포신·안테나)
     원점 = 궤도 바닥 가운데, 오른쪽을 보는 그림을 그리고 왼쪽은 뒤집음. 표정 0 기본·1 웃음·2 아픔
   - Terrain: 서버 지형 마스크(4px 칸)로 흙 단면·풀 테두리·나무·바위를 그린 큰 캔버스, 폭발 자리는 둥글게 파고 그을림
   - EMO: 대기실 이모티콘 8종 SVG */
(function () {
  'use strict';
  const TEAM = { A: { c: '#2BB673', mark: '●', shape: 'circle' }, B: { c: '#E0307A', mark: '▲', shape: 'tri' } };
  const KIND = {
    mongdol: { name: '몽돌', body: '#3D7BD9', dark: '#244E99', light: '#7FB0F2', ph: 32, pfx: 2, pl: 26, bw: 56, bh: 30, half: 22 },
    mangru: { name: '망루', body: '#F08A24', dark: '#B85A10', light: '#FFC07A', ph: 42, pfx: -6, pl: 36, bw: 48, bh: 40, half: 18 }
  };
  const STAT = {
    mongdol: { hp: 130, speed: 55, r: 44, amin: 0, amax: 50 },
    mangru: { hp: 100, speed: 80, r: 32, amin: 15, amax: 65 }
  };

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  const INK = '#1d1530';

  // 궤도 (공통) : x0~x1, 높이 h
  function treads(c, x0, x1, h, phase) {
    c.fillStyle = '#3b3f4a'; rr(c, x0, -h, x1 - x0, h, h / 2); c.fill();
    c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
    // 궤도 마디 (움직이면 흐름)
    c.save(); rr(c, x0, -h, x1 - x0, h, h / 2); c.clip();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2;
    const off = (phase % 1) * 6;
    for (let x = x0 - 6 + off; x < x1 + 6; x += 6) { c.beginPath(); c.moveTo(x, -h); c.lineTo(x, -h + 3); c.moveTo(x, -3); c.lineTo(x, 0); c.stroke(); }
    c.restore();
    // 바퀴
    const n = Math.max(3, Math.round((x1 - x0 - h) / 10));
    for (let i = 0; i <= n; i++) {
      const wx = x0 + h / 2 + (x1 - x0 - h) * i / n, wy = -h / 2, wr = h / 2 - 2.5;
      c.fillStyle = '#6d7280'; c.beginPath(); c.arc(wx, wy, wr, 0, Math.PI * 2); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = INK; c.stroke();
      c.fillStyle = '#9aa0ad'; c.beginPath(); c.arc(wx, wy, wr * 0.45, 0, Math.PI * 2); c.fill();
      // 바퀴 살 (돌아감)
      const ang = phase * 2.2 + i;
      c.strokeStyle = '#4a4f5a'; c.lineWidth = 1.5; c.beginPath();
      c.moveTo(wx + Math.cos(ang) * wr * 0.8, wy + Math.sin(ang) * wr * 0.8); c.lineTo(wx - Math.cos(ang) * wr * 0.8, wy - Math.sin(ang) * wr * 0.8); c.stroke();
    }
  }

  function eyes(c, ex, ey, r, f, gap) {
    gap = gap || r * 2.3;
    for (let k = 0; k < 2; k++) {
      const x = ex + k * gap;
      if (f === 1) {           // 웃음: 감은 눈 ^ ^
        c.strokeStyle = INK; c.lineWidth = 2.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - r * 0.8, ey + r * 0.3); c.quadraticCurveTo(x, ey - r * 0.9, x + r * 0.8, ey + r * 0.3); c.stroke();
      } else if (f === 2) {    // 아픔: > <
        c.strokeStyle = INK; c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round';
        const s = k === 0 ? 1 : -1;
        c.beginPath(); c.moveTo(x - r * 0.5 * s, ey - r * 0.5); c.lineTo(x + r * 0.45 * s, ey); c.lineTo(x - r * 0.5 * s, ey + r * 0.5); c.stroke();
      } else {
        c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, ey, r * 0.85, r, 0, 0, Math.PI * 2); c.fill();
        c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
        c.fillStyle = '#2a5fae'; c.beginPath(); c.arc(x + r * 0.22, ey + r * 0.1, r * 0.58, 0, Math.PI * 2); c.fill();
        c.fillStyle = INK; c.beginPath(); c.arc(x + r * 0.28, ey + r * 0.14, r * 0.32, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(x + r * 0.05, ey - r * 0.25, r * 0.22, 0, Math.PI * 2); c.fill();
      }
    }
  }
  function mouth(c, x, y, w, f) {
    c.strokeStyle = INK; c.lineWidth = 2; c.lineCap = 'round';
    if (f === 1) { c.fillStyle = '#7a1f2c'; c.beginPath(); c.moveTo(x - w, y - 1); c.quadraticCurveTo(x, y + w * 1.4, x + w, y - 1); c.closePath(); c.fill(); c.stroke(); }
    else if (f === 2) { c.beginPath(); c.moveTo(x - w, y + 1); for (let i = 1; i <= 4; i++) c.lineTo(x - w + i * w / 2, y + (i % 2 ? -2 : 1.5)); c.stroke(); }
    else { c.beginPath(); c.moveTo(x - w * 0.7, y); c.quadraticCurveTo(x, y + w * 0.7, x + w * 0.7, y); c.stroke(); }
  }
  function sweat(c, x, y) {
    c.fillStyle = '#9fdcff'; c.strokeStyle = INK; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, y - 6); c.quadraticCurveTo(x + 4, y, x, y + 3); c.quadraticCurveTo(x - 4, y, x, y - 6); c.fill(); c.stroke();
  }

  function barrel(c, kind, a, recoil) {
    const K = KIND[kind];
    c.save(); c.translate(K.pfx, -K.ph); c.rotate(-a * Math.PI / 180); c.translate(-recoil, 0);
    if (kind === 'mongdol') {
      c.fillStyle = '#3566b8'; rr(c, -4, -5.5, K.pl - 2, 11, 4); c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      c.fillStyle = '#5b606c'; rr(c, K.pl - 9, -7, 11, 14, 3); c.fill(); c.stroke();
      c.fillStyle = '#ff8a2a'; c.beginPath(); c.ellipse(K.pl + 1.5, 0, 2, 4, 0, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = '#e07a18'; rr(c, -4, -4, K.pl, 8, 3); c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      c.fillStyle = '#5b606c'; rr(c, 6, -5, 5, 10, 1.5); c.fill(); c.stroke(); rr(c, K.pl - 14, -5, 5, 10, 1.5); c.fill(); c.stroke();
      rr(c, K.pl - 6, -6, 9, 12, 3); c.fill(); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.ellipse(K.pl + 3, 0, 1.6, 3.6, 0, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  function flag(c, x, top, team) {
    const T = TEAM[team]; if (!T) return;
    c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, top + 14); c.lineTo(x, top - 12); c.stroke();
    c.fillStyle = T.c; c.beginPath(); c.moveTo(x, top - 12); c.lineTo(x - 15, top - 7); c.lineTo(x, top - 2); c.closePath(); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#fff';
    if (T.shape === 'circle') { c.beginPath(); c.arc(x - 6, top - 7, 2.4, 0, Math.PI * 2); c.fill(); }
    else { c.beginPath(); c.moveTo(x - 6, top - 10); c.lineTo(x - 3.5, top - 5); c.lineTo(x - 8.5, top - 5); c.closePath(); c.fill(); }
  }

  // 팀 외곽선용 실루엣
  function silhouette(c, kind) {
    if (kind === 'mongdol') { rr(c, -29, -15, 58, 15, 7); c.fill(); rr(c, -27, -31, 54, 19, 9); c.fill(); rr(c, -17, -41, 30, 14, 7); c.fill(); }
    else { rr(c, -25, -15, 50, 15, 7); c.fill(); rr(c, -25, -38, 48, 26, 6); c.fill(); rr(c, -19, -47, 28, 12, 4); c.fill(); }
  }

  /* o: {kind, face(1/-1), bt(도), a(포신 도, 차체 기준), f(표정), phase(궤도), team, alpha, recoil, outline} */
  function drawTank(c, x, y, o) {
    const K = KIND[o.kind] || KIND.mongdol;
    c.save();
    c.translate(x, y);
    c.scale(o.face < 0 ? -1 : 1, 1);
    c.rotate(-(o.bt || 0) * Math.PI / 180);
    if (o.alpha != null) c.globalAlpha *= o.alpha;
    const f = o.f | 0, ph = o.phase || 0;
    // 팀 외곽선 (기종 색과 분리된 팀 색)
    if (o.team && o.outline !== false) {
      const T = TEAM[o.team];
      c.save(); c.fillStyle = T.c; c.strokeStyle = T.c; c.lineWidth = 6; c.lineJoin = 'round';
      c.save(); c.translate(K.pfx, -K.ph); c.rotate(-(o.a || 0) * Math.PI / 180); rr(c, -4, -7, K.pl + 6, 14, 5); c.fill(); c.restore();
      silhouette(c, o.kind); c.stroke();
      c.restore();
    }
    if (o.kind === 'mongdol') {
      flag(c, -22, -40, o.team);
      barrel(c, 'mongdol', o.a || 0, o.recoil || 0);
      treads(c, -28, 28, 14, ph);
      // 차체
      c.fillStyle = K.body; rr(c, -26, -30, 52, 18, 9); c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      c.fillStyle = K.light; rr(c, -22, -29, 40, 4, 2); c.fill();
      // 펜더 · 회색 판
      c.fillStyle = '#7d828e'; rr(c, -24, -18, 18, 7, 2); c.fill(); c.stroke();
      c.fillStyle = K.dark; rr(c, 14, -17, 13, 6, 2); c.fill(); c.stroke();
      c.fillStyle = '#FFD23F'; rr(c, 22, -24, 5, 4, 1); c.fill(); c.lineWidth = 1.2; c.stroke();
      // 포탑 돔
      c.fillStyle = K.body; rr(c, -16, -40, 28, 14, 7); c.fill(); c.lineWidth = 2; c.stroke();
      c.fillStyle = K.dark; rr(c, -14, -41, 9, 4, 2); c.fill(); c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#5b606c'; c.beginPath(); c.arc(K.pfx, -K.ph, 5.5, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.5; c.stroke();
      // 얼굴 (차체 앞쪽)
      eyes(c, 4, -22, 4.6, f, 10.5);
      if (f !== 0) mouth(c, 9, -15.5, 3.4, f);
      if (f === 2) sweat(c, -2, -33);
      c.fillStyle = '#FFB0B8'; c.globalAlpha *= 0.6; c.beginPath(); c.ellipse(19, -16.5, 2.6, 1.6, 0, 0, Math.PI * 2); c.fill();
    } else {
      // 안테나 · 센서
      c.strokeStyle = INK; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-14, -46); c.lineTo(-14, -62); c.stroke();
      c.fillStyle = '#FFD23F'; c.beginPath(); c.arc(-14, -63, 3.2, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.4; c.stroke();
      flag(c, -22, -38, o.team);
      barrel(c, 'mangru', o.a || 0, o.recoil || 0);
      treads(c, -24, 24, 14, ph);
      c.fillStyle = K.body; rr(c, -24, -37, 46, 25, 6); c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      c.fillStyle = K.light; rr(c, -21, -36, 34, 3.5, 2); c.fill();
      // 통풍구
      c.fillStyle = '#5b606c'; rr(c, -20, -31, 12, 9, 2); c.fill(); c.lineWidth = 1.4; c.stroke();
      c.strokeStyle = '#2b2e36'; c.lineWidth = 1.2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-18, -28.5 + i * 2.6); c.lineTo(-10, -28.5 + i * 2.6); c.stroke(); }
      c.fillStyle = K.dark; rr(c, -24, -18, 46, 6, 2); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#FFD23F'; rr(c, 17, -17, 5, 4, 1); c.fill(); c.stroke();
      // 윗칸 · 센서 다이얼
      c.fillStyle = K.body; rr(c, -18, -47, 26, 12, 4); c.fill(); c.lineWidth = 2; c.stroke();
      c.fillStyle = '#c9ced8'; c.beginPath(); c.arc(4, -47, 3, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#5b606c'; c.beginPath(); c.arc(K.pfx, -K.ph, 5, 0, Math.PI * 2); c.fill(); c.lineWidth = 1.5; c.stroke();
      eyes(c, 5, -25, 4, f, 9.5);
      mouth(c, 9.5, -18.5, 3.2, f === 0 ? 1.5 : f);
      if (f === 0) { c.strokeStyle = INK; c.lineWidth = 1.8; c.beginPath(); c.moveTo(7, -19); c.quadraticCurveTo(9.5, -16.6, 12, -19); c.stroke(); }
      if (f === 2) sweat(c, -2, -42);
    }
    // 스폰 무적 방패
    if (o.shield) {
      c.globalAlpha = 0.5 + 0.3 * Math.sin(performance.now() / 90);
      c.strokeStyle = '#bff3ff'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, -K.bh / 2 - 4, K.bw / 2 + 10, K.bh / 2 + 16, 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  }

  function tomb(c, x, y, team) {
    c.save(); c.translate(x, y);
    c.fillStyle = '#9aa0ad'; c.strokeStyle = INK; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-9, 0); c.lineTo(-9, -16); c.arc(0, -16, 9, Math.PI, 0); c.lineTo(9, 0); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = TEAM[team] ? TEAM[team].c : INK; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -21); c.lineTo(0, -8); c.moveTo(-5, -16); c.lineTo(5, -16); c.stroke();
    c.restore();
  }

  // 작은 아이콘(대기실 줄·기종 버튼)
  function icon(canvas, kind, team, f) {
    const c = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
    const s = (h * dpr) / 70;
    c.setTransform(s, 0, 0, s, canvas.width / 2 - 2 * s, canvas.height - 4 * s);
    drawTank(c, 0, 0, { kind, face: 1, bt: 0, a: kind === 'mongdol' ? 20 : 40, f: f || 0, team, outline: !!team });
  }

  // ---------------------------------------------------------------- 지형
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function Terrain(gw, gh, cell) {
    this.gw = gw; this.gh = gh; this.cell = cell; this.W = gw * cell; this.H = gh * cell;
    this.mask = new Uint8Array(gw * gh);
    this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H;
    this.c = this.cv.getContext('2d');
    this.dirt = null;
  }
  Terrain.prototype.load = function (rle) {
    const m = this.mask; let i = 0, v = 0;
    for (const n of rle) { m.fill(v, i, i + n); i += n; v ^= 1; }
    this.paint();
  };
  Terrain.prototype.solid = function (x, y) {
    const gx = Math.floor(x / this.cell), gy = Math.floor(y / this.cell);
    if (gx < 0 || gx >= this.gw || gy < 0 || gy >= this.gh) return false;
    return this.mask[gy * this.gw + gx] === 1;
  };
  Terrain.prototype.dirtLayer = function () {
    if (this.dirt) return this.dirt;
    const cv = document.createElement('canvas'); cv.width = this.W; cv.height = this.H;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 350, 0, this.H);
    g.addColorStop(0, '#a8683a'); g.addColorStop(0.35, '#8e5530'); g.addColorStop(1, '#5e3520');
    c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
    const r = rng(7);
    // 지층 띠
    c.globalAlpha = 0.18;
    for (let k = 0; k < 9; k++) {
      const y0 = 430 + k * 85 + r() * 30;
      c.fillStyle = k % 2 ? '#5a311c' : '#c08050';
      c.beginPath(); c.moveTo(0, y0);
      for (let x = 0; x <= this.W; x += 60) c.lineTo(x, y0 + Math.sin(x / 210 + k) * 12);
      c.lineTo(this.W, y0 + 26); for (let x = this.W; x >= 0; x -= 60) c.lineTo(x, y0 + 26 + Math.sin(x / 180 + k * 2) * 8);
      c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
    // 자갈
    for (let i = 0; i < 1400; i++) {
      const x = r() * this.W, y = 360 + r() * (this.H - 360), s = 3 + r() * 9;
      c.fillStyle = r() < 0.5 ? '#5b3420' : '#6e4129';
      c.beginPath(); c.ellipse(x, y, s, s * (0.6 + r() * 0.3), r() * 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,220,180,.18)'; c.beginPath(); c.ellipse(x - s * 0.25, y - s * 0.25, s * 0.45, s * 0.25, 0, 0, Math.PI * 2); c.fill();
    }
    this.dirt = cv;
    return cv;
  };
  Terrain.prototype.tops = function () {
    // 각 칸 열의 '드러난 윗면' 목록: 위쪽 3칸 이상이 비어 있는 단단한 칸
    const out = [];
    const { gw, gh, mask, cell } = this;
    for (let gx = 0; gx < gw; gx++) {
      let air = 3;
      for (let gy = 0; gy < gh; gy++) {
        const s = mask[gy * gw + gx];
        if (s && air >= 3) out.push([gx * cell + cell / 2, gy * cell]);
        air = s ? 0 : air + 1;
      }
    }
    return out;
  };
  Terrain.prototype.paint = function () {
    const c = this.c, { gw, gh, mask, cell } = this;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.W, this.H);
    c.fillStyle = '#000';
    for (let gy = 0; gy < gh; gy++) {
      let run = -1;
      for (let gx = 0; gx <= gw; gx++) {
        const s = gx < gw && mask[gy * gw + gx];
        if (s && run < 0) run = gx;
        else if (!s && run >= 0) { c.fillRect(run * cell, gy * cell, (gx - run) * cell, cell); run = -1; }
      }
    }
    c.globalCompositeOperation = 'source-in';
    c.drawImage(this.dirtLayer(), 0, 0);
    c.globalCompositeOperation = 'source-over';
    // 장식 (지형 위 그림 — 파이면 같이 사라짐)
    this.decor();
    // 풀 테두리: 같은 높이로 이어진 윗면을 선으로 이음
    const tops = this.tops();
    tops.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lines = [];
    for (const p of tops) {
      let best = null;
      for (const L of lines) { const q = L[L.length - 1]; if (p[0] - q[0] <= cell + 0.1 && p[0] > q[0] && Math.abs(p[1] - q[1]) <= 10) { best = L; break; } }
      if (best) best.push(p); else lines.push([p]);
    }
    for (const L of lines) {
      if (L.length < 2) continue;
      const path = () => { c.beginPath(); c.moveTo(L[0][0] - 2, L[0][1] + 2); for (const p of L) c.lineTo(p[0], p[1] + 2); c.lineTo(L[L.length - 1][0] + 2, L[L.length - 1][1] + 2); };
      c.lineJoin = 'round'; c.lineCap = 'round';
      path(); c.strokeStyle = '#2f7d2c'; c.lineWidth = 16; c.stroke();
      path(); c.strokeStyle = '#5fb43a'; c.lineWidth = 11; c.stroke();
      c.save(); c.translate(0, -3); path(); c.strokeStyle = '#8fd85a'; c.lineWidth = 4; c.stroke(); c.restore();
      // 풀 끝 물결
      c.fillStyle = '#4a9a32';
      for (let i = 0; i < L.length; i += 3) { const p = L[i]; c.beginPath(); c.arc(p[0], p[1] + 9, 4.5, 0, Math.PI); c.fill(); }
      // 풀잎
      c.fillStyle = '#7ccc4a';
      for (let i = 2; i < L.length; i += 7) {
        const p = L[i]; c.beginPath(); c.moveTo(p[0] - 4, p[1] - 2); c.lineTo(p[0] - 1, p[1] - 11); c.lineTo(p[0] + 1, p[1] - 3);
        c.lineTo(p[0] + 4, p[1] - 9); c.lineTo(p[0] + 5, p[1] - 1); c.closePath(); c.fill();
      }
    }
  };
  Terrain.prototype.groundY = function (x) {
    const gx = Math.floor(x / this.cell);
    for (let gy = 0; gy < this.gh; gy++) if (this.mask[gy * this.gw + gx]) return gy * this.cell;
    return null;
  };
  Terrain.prototype.decor = function () {
    const c = this.c, W = this.W;
    const place = (x, fn) => { const y = this.groundY(x); if (y != null && y < 760) fn(x, y); };
    const tree = (x, y, s) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = '#6b4226'; c.strokeStyle = INK; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-7, 4); c.lineTo(-5, -60); c.lineTo(5, -60); c.lineTo(8, 4); c.closePath(); c.fill(); c.stroke();
      const blob = (bx, by, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); c.stroke(); };
      [[-26, -70, 22], [24, -72, 22], [0, -96, 28], [-14, -112, 18], [16, -110, 18]].forEach(([bx, by, r]) => blob(bx, by, r, '#4f9c3a'));
      [[-10, -100, 12], [14, -84, 10]].forEach(([bx, by, r]) => { c.fillStyle = '#7ccc4a'; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); });
      c.restore();
    };
    const rock = (x, y, s) => {
      c.save(); c.translate(x, y + 4); c.scale(s, s);
      c.fillStyle = '#7b7e8a'; c.strokeStyle = INK; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-20, 0); c.lineTo(-16, -22); c.lineTo(-2, -32); c.lineTo(14, -26); c.lineTo(20, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#a4a8b4'; c.beginPath(); c.moveTo(-12, -20); c.lineTo(-2, -28); c.lineTo(6, -24); c.lineTo(-6, -16); c.closePath(); c.fill();
      c.restore();
    };
    const bush = (x, y, s) => {
      c.save(); c.translate(x, y + 2); c.scale(s, s); c.fillStyle = '#3f8a34'; c.strokeStyle = INK; c.lineWidth = 2;
      c.beginPath(); c.arc(-10, -8, 10, Math.PI, 0); c.arc(4, -12, 12, Math.PI, 0); c.arc(16, -7, 8, Math.PI, 0); c.closePath(); c.fill(); c.stroke(); c.restore();
    };
    place(36, (x, y) => rock(x, y, 0.8));
    place(W - 36, (x, y) => rock(x, y, 0.8));
    place(70, (x, y) => tree(x, y, 1.05));
    place(W - 70, (x, y) => tree(x, y, 1.05));
    place(505, (x, y) => bush(x, y, 1));
    place(W - 505, (x, y) => bush(x, y, 1));
    place(640, (x, y) => rock(x, y, 1.2));
    place(W - 640, (x, y) => rock(x, y, 1.1));
    place(760, (x, y) => bush(x, y, 1.1));
    place(W - 770, (x, y) => bush(x, y, 1.1));
    place(900, (x, y) => rock(x, y, 0.75));
    place(W - 880, (x, y) => rock(x, y, 0.8));
  };
  Terrain.prototype.carve = function (x, y, r) {
    const { gw, gh, mask, cell } = this;
    const r2 = r * r;
    const gx0 = Math.max(0, Math.floor((x - r) / cell)), gx1 = Math.min(gw - 1, Math.floor((x + r) / cell));
    const gy0 = Math.max(0, Math.floor((y - r) / cell)), gy1 = Math.min(gh - 1, Math.floor((y + r) / cell));
    for (let gy = gy0; gy <= gy1; gy++) {
      const cy = gy * cell + 2 - y;
      for (let gx = gx0; gx <= gx1; gx++) { const cx = gx * cell + 2 - x; if (cx * cx + cy * cy <= r2) mask[gy * gw + gx] = 0; }
    }
    const c = this.c;
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'source-atop';
    const g = c.createRadialGradient(x, y, r - 1, x, y, r + 9);
    g.addColorStop(0, 'rgba(40,20,10,.75)'); g.addColorStop(1, 'rgba(40,20,10,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r + 10, 0, Math.PI * 2); c.fill();
    c.restore();
  };

  // ---------------------------------------------------------------- 하늘 (화면 좌표)
  function sky(c, w, h, camX, camY, s, t) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9a5aa0'); g.addColorStop(0.35, '#e0789a'); g.addColorStop(0.7, '#f7a868'); g.addColorStop(1, '#fbd27a');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // 해
    c.fillStyle = 'rgba(255,240,190,.55)'; c.beginPath(); c.arc(w * 0.62 - camX * s * 0.05, h * 0.7, h * 0.16, 0, Math.PI * 2); c.fill();
    // 먼 언덕 (느린 시차)
    c.fillStyle = 'rgba(150,80,130,.35)';
    c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w + 20; x += 20) { const wx = (x + camX * s * 0.25) / 90; c.lineTo(x, h * 0.72 - Math.sin(wx) * h * 0.06 - Math.sin(wx * 0.37) * h * 0.08); }
    c.lineTo(w, h); c.closePath(); c.fill();
    // 구름
    const cl = [[200, 140, 1.2], [900, 90, 1], [1500, 170, 0.8], [2100, 110, 1.1], [2800, 160, 0.9]];
    c.fillStyle = 'rgba(255,236,210,.85)';
    for (const [cx0, cy, sc] of cl) {
      const span = (w / (s * 0.4)) + 3000;
      let cx = ((cx0 + t * 0.008 - camX * 0.4) % span + span) % span - 300;
      const X = cx * s * 0.4 * 1.6, Y = cy * s * 0.8 - camY * s * 0.15, R = 26 * sc * Math.max(0.6, s * 1.4);
      c.beginPath(); c.arc(X, Y, R, 0, Math.PI * 2); c.arc(X + R * 1.1, Y - R * 0.5, R * 1.25, 0, Math.PI * 2); c.arc(X + R * 2.3, Y, R * 0.95, 0, Math.PI * 2);
      c.rect(X, Y - R * 0.2, R * 2.3, R * 1.1); c.fill();
    }
  }

  // ---------------------------------------------------------------- 이모티콘 (48×48 SVG)
  const face = (inner, col) => `<svg viewBox="0 0 48 48"><circle cx="24" cy="25" r="20" fill="${col || '#FFD23F'}" stroke="${INK}" stroke-width="2.5"/>${inner}</svg>`;
  const EMO = [
    { n: '웃음', svg: face(`<path d="M15 21 q3 -4 6 0 M27 21 q3 -4 6 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M14 28 q10 12 20 0 z" fill="#7a1f2c" stroke="${INK}" stroke-width="2"/>`) },
    { n: '박수', svg: `<svg viewBox="0 0 48 48"><g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"><path d="M10 30 L20 12 q3 -3 5 1 L22 22 L30 10 q3 -2 4 2 L28 26 q-2 12 -12 12 q-8 -1 -6 -8z" fill="#FFC79A"/><path d="M38 6 l2 5 M43 12 l-5 1 M34 4 l0 5" stroke="#FFB020" fill="none" stroke-linecap="round"/></g></svg>` },
    { n: '도발', svg: face(`<path d="M15 20 l6 2 M33 20 l-6 2" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="18" cy="24" r="2.2" fill="${INK}"/><path d="M27 24 q3 -2 6 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M17 31 q7 4 14 0" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M24 32 q0 7 5 6 q3 -2 0 -7z" fill="#ff7a9a" stroke="${INK}" stroke-width="1.8"/>`) },
    { n: '하트', svg: `<svg viewBox="0 0 48 48"><path d="M24 40 C6 28 6 12 16 11 C21 10 23 14 24 16 C25 14 27 10 32 11 C42 12 42 28 24 40Z" fill="#ff4f7b" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M14 17 q2 -3 5 -2" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>` },
    { n: '놀람', svg: face(`<circle cx="18" cy="21" r="3.6" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="30" cy="21" r="3.6" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="18" cy="21" r="1.5" fill="${INK}"/><circle cx="30" cy="21" r="1.5" fill="${INK}"/><ellipse cx="24" cy="33" rx="4" ry="5.5" fill="#7a1f2c" stroke="${INK}" stroke-width="2"/>`) },
    { n: '울음', svg: face(`<path d="M15 22 q3 3 6 0 M27 22 q3 3 6 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M17 35 q7 -6 14 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M16 25 q-3 8 0 12 q3 -4 0 -12z M32 25 q-3 8 0 12 q3 -4 0 -12z" fill="#7cc8ff" stroke="${INK}" stroke-width="1.6"/>`, '#FFE07A') },
    { n: '응원', svg: `<svg viewBox="0 0 48 48"><g stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"><path d="M14 44 L14 6" fill="none"/><path d="M14 7 q10 -4 16 0 q6 4 14 0 l0 16 q-8 4 -14 0 q-6 -4 -16 0z" fill="#2BB673"/><path d="M22 13 l4 4 l7 -7" stroke="#fff" fill="none"/></g></svg>` },
    { n: '화남', svg: face(`<path d="M13 18 l8 4 M35 18 l-8 4" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><circle cx="18" cy="25" r="2" fill="${INK}"/><circle cx="30" cy="25" r="2" fill="${INK}"/><path d="M17 35 q7 -5 14 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M36 6 q4 2 2 6 q-3 3 1 6 M41 3 q3 2 1 5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`, '#ff8a5a') }
  ];

  window.TankArt = { TEAM, KIND, STAT, drawTank, tomb, icon, Terrain, sky, EMO, rr };
})();
