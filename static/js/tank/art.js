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

  // ---------------------------------------------------------------- 지형 (map_2d_v3 고품질)
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function Terrain(gw, gh, cell) {
    this.gw = gw; this.gh = gh; this.cell = cell; this.W = gw * cell; this.H = gh * cell;
    this.mask = new Uint8Array(gw * gh);
    this.bedMask = new Uint8Array(gw * gh);
    this.geo = null;
    this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H;
    this.c = this.cv.getContext('2d');
    this.dirt = null;
  }
  Terrain.prototype.load = function (rle, geo) {
    const m = this.mask; let i = 0, v = 0;
    for (const n of rle) { m.fill(v, i, i + n); i += n; v ^= 1; }
    this.geo = geo || null;
    this.bedMask.fill(0);
    if (this.geo && this.geo.bed) {
      const { gw, gh, cell } = this;
      for (const [x0, x1, y0, y1] of this.geo.bed) {
        const gx0 = Math.max(0, Math.floor(x0 / cell)), gx1 = Math.min(gw, Math.ceil(x1 / cell));
        const gy0 = Math.max(0, Math.floor(y0 / cell)), gy1 = Math.min(gh, Math.ceil(y1 / cell));
        for (let gy = gy0; gy < gy1; gy++) for (let gx = gx0; gx < gx1; gx++) this.bedMask[gy * gw + gx] = 1;
      }
    }
    this.dirt = null;
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
    const g = c.createLinearGradient(0, 160, 0, 820);
    g.addColorStop(0, '#9c5c36'); g.addColorStop(0.38, '#7d4628'); g.addColorStop(0.75, '#5e331c'); g.addColorStop(1, '#3f2012');
    c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
    const r = rng(17);
    // 유기적 손그림 지층 띠 (전체 영역 — 섬 포함 y=160~800)
    for (let k = 0; k < 14; k++) {
      const y0 = 170 + k * 44 + r() * 18;
      c.fillStyle = k % 2 ? 'rgba(65,30,18,.24)' : 'rgba(195,126,74,.20)';
      c.beginPath(); c.moveTo(0, y0);
      for (let x = 0; x <= this.W; x += 48) c.lineTo(x, y0 + Math.sin(x / 150 + k * 1.1) * 9 + Math.cos(x / 43 + k) * 3);
      c.lineTo(this.W, y0 + 20);
      for (let x = this.W; x >= 0; x -= 48) c.lineTo(x, y0 + 20 + Math.sin(x / 130 + k * 1.9) * 8);
      c.closePath(); c.fill();
    }
    // 흙 질감 미세 노이즈 (따뜻한 점 · 어두운 점)
    for (let i = 0; i < 2400; i++) {
      const x = r() * this.W, y = 160 + r() * 640, sz = 1.2 + r() * 2.4;
      c.fillStyle = r() < 0.45 ? 'rgba(255,210,165,.12)' : 'rgba(42,18,10,.22)';
      c.fillRect(x, y, sz, sz);
    }
    // 각진 바위·자갈 덩어리 (손그림 하이라이트 + 그림자)
    for (let i = 0; i < 900; i++) {
      const x = r() * this.W, y = 175 + r() * 610, s = 4 + r() * 11;
      const ang = r() * Math.PI;
      c.save(); c.translate(x, y); c.rotate(ang);
      c.fillStyle = r() < 0.5 ? '#573322' : '#6c422c';
      c.beginPath();
      c.moveTo(-s, -s * 0.2); c.lineTo(-s * 0.4, -s * 0.65); c.lineTo(s * 0.5, -s * 0.55);
      c.lineTo(s * 0.95, s * 0.1); c.lineTo(s * 0.3, s * 0.65); c.lineTo(-s * 0.65, s * 0.5);
      c.closePath(); c.fill();
      c.strokeStyle = 'rgba(30,14,10,.45)'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = 'rgba(255,212,168,.18)';
      c.beginPath(); c.moveTo(-s * 0.6, -s * 0.2); c.lineTo(-s * 0.25, -s * 0.55); c.lineTo(s * 0.45, -s * 0.42); c.lineTo(0, -s * 0.1); c.closePath(); c.fill();
      c.restore();
    }
    // 기반암 구역 (어둡고 단단한 암반 질감)
    if (this.geo && this.geo.bed) {
      for (const [x0, x1, y0, y1] of this.geo.bed) {
        c.fillStyle = 'rgba(42,30,44,.55)';
        c.fillRect(x0, y0, x1 - x0, y1 - y0);
        c.fillStyle = 'rgba(130,105,120,.25)';
        c.fillRect(x0, y0, x1 - x0, 4);
        c.strokeStyle = 'rgba(24,14,26,.45)'; c.lineWidth = 1.5;
        for (let yy = y0 + 14; yy < y1 - 4; yy += 18) {
          c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy + (r() - 0.5) * 4); c.stroke();
        }
      }
    }
    this.dirt = cv;
    return cv;
  };
  Terrain.prototype.tops = function () {
    // 각 칸 열의 '드러난 윗면' 목록: 위쪽 2칸 이상이 비어 있는 단단한 칸
    const out = [];
    const { gw, gh, mask, cell } = this;
    for (let gx = 0; gx < gw; gx++) {
      let air = 2;
      for (let gy = 0; gy < gh; gy++) {
        const s = mask[gy * gw + gx];
        if (s && air >= 2) out.push([gx * cell + cell / 2, gy * cell]);
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
    // 노을 역광 림라이트 (중앙 쪽 밝은 햇빛 + 아래쪽 짙은 그림자)
    c.globalCompositeOperation = 'source-atop';
    const rim = c.createLinearGradient(0, 150, 0, 760);
    rim.addColorStop(0, 'rgba(255,215,130,.18)'); rim.addColorStop(0.5, 'rgba(255,180,95,.05)'); rim.addColorStop(1, 'rgba(24,10,14,.32)');
    c.fillStyle = rim; c.fillRect(0, 0, this.W, this.H);
    // 아래로 늘어진 뿌리 (지형 뒤쪽에 그려 파이면 함께 사라짐)
    c.globalCompositeOperation = 'destination-over';
    this.drawRoots();
    c.globalCompositeOperation = 'source-over';
    // 장식 (나무·소나무·바위·덤불 — 파이면 같이 사라짐)
    this.decor();
    // 풀 테두리 + 가장자리 잔디 술
    const tops = this.tops();
    tops.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lines = [];
    for (const p of tops) {
      let best = null;
      for (const L of lines) { const q = L[L.length - 1]; if (p[0] - q[0] <= cell + 0.1 && p[0] > q[0] && Math.abs(p[1] - q[1]) <= 16) { best = L; break; } }
      if (best) best.push(p); else lines.push([p]);
    }
    const r = rng(42);
    for (const L of lines) {
      if (L.length < 2) continue;
      const path = () => { c.beginPath(); c.moveTo(L[0][0] - 2, L[0][1] + 2); for (const p of L) c.lineTo(p[0], p[1] + 2); c.lineTo(L[L.length - 1][0] + 2, L[L.length - 1][1] + 2); };
      c.lineJoin = 'round'; c.lineCap = 'round';
      path(); c.strokeStyle = '#2d621e'; c.lineWidth = 15; c.stroke();
      path(); c.strokeStyle = '#5ea82e'; c.lineWidth = 10; c.stroke();
      c.save(); c.translate(0, -2.5); path(); c.strokeStyle = '#9ad944'; c.lineWidth = 4.5; c.stroke(); c.restore();
      // 아래로 늘어지는 풀 물결
      c.fillStyle = '#478b28';
      for (let i = 0; i < L.length; i += 3) {
        const p = L[i], rr2 = 3.5 + (i % 2) * 1.5;
        c.beginPath(); c.arc(p[0], p[1] + 8, rr2, 0, Math.PI); c.fill();
      }
      // 풀잎 잔디 술
      for (let i = 1; i < L.length; i += 4) {
        const p = L[i], h1 = 7 + r() * 7, h2 = 5 + r() * 6;
        c.fillStyle = i % 8 === 1 ? '#aee658' : '#7ecc3b';
        c.beginPath();
        c.moveTo(p[0] - 4, p[1]); c.lineTo(p[0] - 1.5, p[1] - h1); c.lineTo(p[0] + 1, p[1] - 2);
        c.lineTo(p[0] + 3.5, p[1] - h2); c.lineTo(p[0] + 5, p[1]); c.closePath(); c.fill();
      }
    }
  };
  Terrain.prototype.drawRoots = function () {
    const c = this.c, { gw, gh, mask, cell } = this;
    const r = rng(99);
    c.lineCap = 'round';
    for (let gx = 4; gx < gw - 4; gx += 6) {
      let thick = 0;
      for (let gy = 0; gy < gh; gy++) {
        if (mask[gy * gw + gx]) { thick++; continue; }
        if (thick >= 6 && (gy + 1 >= gh || !mask[(gy + 1) * gw + gx])) {
          const x = gx * cell + 2, y = gy * cell - 2;
          const len = 14 + r() * 34;
          const bend = (r() - 0.5) * 18;
          c.strokeStyle = r() < 0.5 ? '#4c2817' : '#683922';
          c.lineWidth = 1.6 + r() * 1.8;
          c.beginPath(); c.moveTo(x, y);
          c.quadraticCurveTo(x + bend * 0.6, y + len * 0.55, x + bend, y + len);
          c.stroke();
          if (len > 26 && r() < 0.6) {
            c.lineWidth = 1.2;
            c.beginPath(); c.moveTo(x + bend * 0.5, y + len * 0.5);
            c.quadraticCurveTo(x + bend * 0.5 + (bend > 0 ? -9 : 9), y + len * 0.75, x + bend * 0.3 + (bend > 0 ? -12 : 12), y + len * 0.9);
            c.stroke();
          }
        }
        thick = 0;
      }
    }
  };
  Terrain.prototype.groundY = function (x, minY, maxY) {
    const gx = Math.floor(x / this.cell);
    if (gx < 0 || gx >= this.gw) return null;
    const g0 = Math.max(0, Math.floor((minY || 0) / this.cell));
    const g1 = Math.min(this.gh - 1, Math.ceil((maxY || this.H) / this.cell));
    let air = 2;
    for (let gy = g0; gy <= g1; gy++) {
      const s = this.mask[gy * this.gw + gx];
      if (s && air >= 2) return gy * this.cell;
      air = s ? 0 : air + 1;
    }
    return null;
  };
  Terrain.prototype.decor = function () {
    const c = this.c, W = this.W;
    const place = (x, minY, maxY, fn) => { const y = this.groundY(x, minY, maxY); if (y != null) fn(x, y); };
    const oak = (x, y, s) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      // 줄기·가지
      c.fillStyle = '#5e351e'; c.strokeStyle = INK; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(-7, 4); c.lineTo(-4, -52); c.lineTo(4, -52); c.lineTo(8, 4); c.closePath(); c.fill(); c.stroke();
      const blob = (bx, by, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); c.stroke(); };
      [[-24, -64, 21, '#3d7e2b'], [23, -66, 21, '#3d7e2b'], [0, -90, 27, '#519e34'], [-14, -105, 18, '#519e34'], [15, -103, 18, '#66b83f']].forEach(([bx, by, r, col]) => blob(bx, by, r, col));
      // 햇빛 하이라이트
      [[-8, -100, 12], [13, -84, 10], [-18, -72, 9]].forEach(([bx, by, r]) => { c.fillStyle = '#9ee056'; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); });
      c.restore();
    };
    const pine = (x, y, s) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = '#5a331d'; c.strokeStyle = INK; c.lineWidth = 2;
      c.fillRect(-4, -22, 8, 25); c.strokeRect(-4, -22, 8, 25);
      for (let i = 0; i < 3; i++) {
        const yy = -18 - i * 24, hw = 26 - i * 6, hh = 34 - i * 4;
        c.fillStyle = i === 2 ? '#6ab53e' : '#42872d';
        c.beginPath(); c.moveTo(0, yy - hh); c.lineTo(hw, yy); c.lineTo(-hw, yy); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = 'rgba(180,235,95,.35)';
        c.beginPath(); c.moveTo(0, yy - hh + 3); c.lineTo(hw * 0.45, yy - 3); c.lineTo(0, yy - 3); c.closePath(); c.fill();
      }
      c.restore();
    };
    const rock = (x, y, s) => {
      c.save(); c.translate(x, y + 4); c.scale(s, s);
      c.fillStyle = '#756f7c'; c.strokeStyle = INK; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(-20, 0); c.lineTo(-16, -21); c.lineTo(-2, -31); c.lineTo(14, -25); c.lineTo(20, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#b6a89e'; c.beginPath(); c.moveTo(-12, -19); c.lineTo(-2, -28); c.lineTo(7, -23); c.lineTo(-5, -14); c.closePath(); c.fill();
      c.restore();
    };
    const bush = (x, y, s) => {
      c.save(); c.translate(x, y + 2); c.scale(s, s);
      c.fillStyle = '#489432'; c.strokeStyle = INK; c.lineWidth = 2;
      c.beginPath(); c.arc(-10, -8, 10, Math.PI, 0); c.arc(4, -13, 12, Math.PI, 0); c.arc(16, -7, 8, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#8ad149'; c.beginPath(); c.arc(2, -15, 6, Math.PI, 0); c.fill();
      c.restore();
    };
    // 좌우 진지 장식
    place(42, 380, 450, (x, y) => oak(x, y, 0.95));
    place(78, 380, 450, (x, y) => bush(x, y, 1.0));
    place(185, 390, 460, (x, y) => rock(x, y, 0.75));
    place(355, 410, 480, (x, y) => pine(x, y, 0.85));
    place(475, 430, 500, (x, y) => bush(x, y, 0.9));
    place(512, 440, 510, (x, y) => rock(x, y, 0.85));

    place(W - 44, 380, 450, (x, y) => pine(x, y, 1.05));
    place(W - 95, 380, 450, (x, y) => pine(x, y, 0.82));
    place(W - 220, 390, 460, (x, y) => bush(x, y, 1.0));
    place(W - 360, 410, 480, (x, y) => oak(x, y, 0.85));
    place(W - 485, 430, 510, (x, y) => rock(x, y, 0.9));

    // 떠 있는 섬 6개 장식 (map_2d_v3 시안 배치)
    place(615, 240, 280, (x, y) => oak(x, y, 1.05));     // 섬 1: 큰 둥근 나무 + 바위
    place(690, 240, 280, (x, y) => rock(x, y, 0.95));
    place(1030, 160, 200, (x, y) => bush(x, y, 0.95));   // 섬 2: 작은 덤불 + 소나무
    place(1008, 160, 200, (x, y) => pine(x, y, 0.58));
    place(765, 540, 580, (x, y) => oak(x, y, 0.82));     // 섬 3: 나무 + 바위
    place(835, 540, 580, (x, y) => rock(x, y, 0.88));
    place(1345, 210, 250, (x, y) => bush(x, y, 0.85));   // 섬 4: 작은 덤불
    place(1575, 540, 580, (x, y) => rock(x, y, 0.85));   // 섬 5: 바위 + 덤불
    place(1635, 540, 580, (x, y) => bush(x, y, 1.0));
    place(1745, 260, 300, (x, y) => pine(x, y, 0.95));   // 섬 6: 소나무 + 바위
    place(1805, 260, 300, (x, y) => pine(x, y, 0.75));
    place(1690, 260, 300, (x, y) => rock(x, y, 0.95));
  };
  Terrain.prototype.carve = function (x, y, r) {
    const { gw, gh, mask, bedMask, cell } = this;
    const r2 = r * r;
    const gx0 = Math.max(0, Math.floor((x - r) / cell)), gx1 = Math.min(gw - 1, Math.floor((x + r) / cell));
    const gy0 = Math.max(0, Math.floor((y - r) / cell)), gy1 = Math.min(gh - 1, Math.floor((y + r) / cell));
    for (let gy = gy0; gy <= gy1; gy++) {
      const cy = gy * cell + 2 - y;
      for (let gx = gx0; gx <= gx1; gx++) {
        const cx = gx * cell + 2 - x, idx = gy * gw + gx;
        if (cx * cx + cy * cy <= r2 && !bedMask[idx]) mask[idx] = 0;
      }
    }
    const c = this.c;
    c.save();
    // 기반암 사각형은 시각적으로도 지워지지 않도록 클립 제외
    if (this.geo && this.geo.bed) {
      const hit = this.geo.bed.filter(([bx0, bx1, by0, by1]) => bx1 >= x - r - 12 && bx0 <= x + r + 12 && by1 >= y - r - 12 && by0 <= y + r + 12);
      if (hit.length) {
        c.beginPath(); c.rect(0, 0, this.W, this.H);
        for (const [bx0, bx1, by0, by1] of hit) c.rect(bx0, by0, bx1 - bx0, by1 - by0);
        c.clip('evenodd');
      }
    }
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'source-atop';
    const g = c.createRadialGradient(x, y, Math.max(1, r - 1), x, y, r + 9);
    g.addColorStop(0, 'rgba(35,16,10,.75)'); g.addColorStop(1, 'rgba(35,16,10,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r + 10, 0, Math.PI * 2); c.fill();
    c.restore();
  };

  // ---------------------------------------------------------------- 하늘 · 패럴랙스 캐시 (map_2d_v3)
  let BG = null;
  function makeCv(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')]; }
  function ensureBg() {
    if (BG) return BG;
    // 1) 노을 하늘 + 중앙 태양 역광
    const [skyCv, sc] = makeCv(1280, 720);
    const sg = sc.createLinearGradient(0, 0, 0, 720);
    sg.addColorStop(0, '#8e558d'); sg.addColorStop(0.24, '#c86b86'); sg.addColorStop(0.50, '#ee9663');
    sg.addColorStop(0.76, '#f9c367'); sg.addColorStop(1, '#fded9c');
    sc.fillStyle = sg; sc.fillRect(0, 0, 1280, 720);
    const sun = sc.createRadialGradient(640, 440, 12, 640, 440, 480);
    sun.addColorStop(0, 'rgba(255,252,225,.85)'); sun.addColorStop(0.22, 'rgba(255,230,150,.48)');
    sun.addColorStop(0.55, 'rgba(255,185,105,.18)'); sun.addColorStop(1, 'rgba(255,160,90,0)');
    sc.fillStyle = sun; sc.fillRect(0, 0, 1280, 720);

    // 2) 먼 산 실루엣 1층 (흐릿한 원경 산맥)
    const [mtnFarCv, mfc] = makeCv(2400, 560);
    mfc.fillStyle = 'rgba(216,132,108,.42)';
    mfc.beginPath(); mfc.moveTo(0, 560);
    const farPts = [[0,430],[160,360],[310,395],[480,310],[650,385],[820,440],[1020,475],[1200,490],[1380,470],[1580,430],[1750,360],[1920,320],[2120,390],[2280,350],[2400,420]];
    for (const [px, py] of farPts) mfc.lineTo(px, py);
    mfc.lineTo(2400, 560); mfc.closePath(); mfc.fill();

    // 3) 구름 1층 (상단·중단 노을 역광 구름 — 타일 폭 2048)
    const [cloudFarCv, cfc] = makeCv(2048, 520);
    const paintCloud = (ctx, x, y, sc2, alpha) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(sc2, sc2); ctx.globalAlpha = alpha;
      const blobs = [[-55,8,28],[-22,-8,36],[18,-14,42],[58,-2,34],[92,10,25],[30,14,32],[-10,16,30]];
      ctx.fillStyle = '#d47c78';
      ctx.beginPath(); for (const [bx, by, br] of blobs) { ctx.moveTo(bx + br, by + 6); ctx.arc(bx, by + 6, br, 0, Math.PI * 2); } ctx.fill();
      ctx.fillStyle = '#f8b482';
      ctx.beginPath(); for (const [bx, by, br] of blobs) { ctx.moveTo(bx + br * 0.9, by); ctx.arc(bx, by, br * 0.9, 0, Math.PI * 2); } ctx.fill();
      ctx.fillStyle = '#ffe9be';
      ctx.beginPath(); for (const [bx, by, br] of blobs) { ctx.moveTo(bx + br * 0.72, by - 5); ctx.arc(bx, by - 5, br * 0.72, 0, Math.PI * 2); } ctx.fill();
      ctx.restore();
    };
    [[140,120,1.6,.78],[480,190,1.1,.65],[860,110,1.25,.6],[1220,175,1.0,.58],[1560,105,1.5,.75],[1880,165,1.35,.72]].forEach(([x,y,sc2,a]) => {
      paintCloud(cfc, x, y, sc2, a); paintCloud(cfc, x - 2048, y, sc2, a); paintCloud(cfc, x + 2048, y, sc2, a);
    });

    // 4) 먼 바위산 2층 (좌우 바위 봉우리 + 태양 쪽 림라이트)
    const [mtnNearCv, mnc] = makeCv(2400, 620);
    const drawSpire = (px, py, pw, ph, sunDir) => {
      mnc.fillStyle = 'rgba(166,86,88,.62)';
      mnc.beginPath(); mnc.moveTo(px - pw, py); mnc.lineTo(px - pw * 0.45, py - ph * 0.62);
      mnc.lineTo(px - pw * 0.1, py - ph); mnc.lineTo(px + pw * 0.25, py - ph * 0.78);
      mnc.lineTo(px + pw * 0.65, py - ph * 0.42); mnc.lineTo(px + pw, py); mnc.closePath(); mnc.fill();
      // 태양 쪽(안쪽) 황금 림라이트
      mnc.fillStyle = 'rgba(255,204,132,.36)';
      mnc.beginPath(); mnc.moveTo(px - pw * 0.1, py - ph);
      if (sunDir > 0) { mnc.lineTo(px + pw * 0.25, py - ph * 0.78); mnc.lineTo(px + pw * 0.65, py - ph * 0.42); mnc.lineTo(px + pw * 0.1, py - ph * 0.35); }
      else { mnc.lineTo(px - pw * 0.45, py - ph * 0.62); mnc.lineTo(px - pw * 0.65, py - ph * 0.35); mnc.lineTo(px - pw * 0.05, py - ph * 0.35); }
      mnc.closePath(); mnc.fill();
    };
    drawSpire(280, 620, 170, 290, 1); drawSpire(430, 620, 130, 210, 1); drawSpire(740, 620, 110, 150, 1);
    drawSpire(1660, 620, 115, 160, -1); drawSpire(1920, 620, 145, 220, -1); drawSpire(2120, 620, 180, 285, -1);

    // 5) 하단 구름 바다 (하늘 바닥을 채우는 따뜻한 뭉게구름 — 타일 폭 2048)
    const [cloudNearCv, cnc] = makeCv(2048, 320);
    for (let x = 0; x < 2048; x += 170) {
      const y = 210 + Math.sin(x / 230) * 28, sc2 = 1.65 + (x % 3) * 0.25;
      paintCloud(cnc, x, y, sc2, 0.85); paintCloud(cnc, x - 2048, y, sc2, 0.85); paintCloud(cnc, x + 2048, y, sc2, 0.85);
    }

    // 6) 빛 입자 스프라이트 + 위치 목록
    const [moteCv, mc] = makeCv(24, 24);
    const mg = mc.createRadialGradient(12, 12, 1, 12, 12, 11);
    mg.addColorStop(0, 'rgba(255,252,220,1)'); mg.addColorStop(0.35, 'rgba(255,230,145,.55)'); mg.addColorStop(1, 'rgba(255,210,120,0)');
    mc.fillStyle = mg; mc.fillRect(0, 0, 24, 24);
    const mr = rng(2026);
    const motes = [];
    for (let i = 0; i < 42; i++) motes.push([mr() * 2400, 120 + mr() * 940, 0.4 + mr() * 0.7, mr() * 6.28, 0.6 + mr() * 0.9]);

    BG = { skyCv, mtnFarCv, cloudFarCv, mtnNearCv, cloudNearCv, moteCv, motes };
    return BG;
  }

  function tileX(c, img, ox, y, drawW, drawH, period) {
    const x0 = ((ox % period) + period) % period - period;
    for (let x = x0; x < c.canvas.width + period; x += period) c.drawImage(img, x, y, drawW, drawH);
  }

  function sky(c, w, h, camX, camY, s, t) {
    const B = ensureBg();
    c.drawImage(B.skyCv, 0, 0, w, h);
    const parY = -(camY - 560) * s * 0.08;
    // 먼 산 1층 (느린 시차)
    const mW = Math.max(w * 1.45, 1400), mX = (w - mW) / 2 - (camX - 1200) * s * 0.14;
    c.drawImage(B.mtnFarCv, mX, h * 0.34 + parY * 0.6, mW, h * 0.66);
    // 구름 1층 (패럴랙스 + 천천히 흐름)
    const cfScale = Math.max(0.75, h / 650);
    const cfW = 2048 * cfScale;
    tileX(c, B.cloudFarCv, -camX * s * 0.20 + t * 0.005, h * 0.04 + parY * 0.7, cfW, 520 * cfScale, cfW);
    // 먼 바위산 2층 (중간 시차)
    const nW = Math.max(w * 1.5, 1500), nX = (w - nW) / 2 - (camX - 1200) * s * 0.26;
    c.drawImage(B.mtnNearCv, nX, h * 0.36 + parY, nW, h * 0.68);
    // 하단 구름 바다 (패럴랙스)
    const cnW = 2048 * cfScale;
    tileX(c, B.cloudNearCv, -camX * s * 0.35 - t * 0.008, h * 0.68 + parY * 1.2, cnW, 320 * cfScale, cnW);
    // 떠다니는 빛 입자
    const sec = t / 1000;
    for (const [mx, my, sc2, ph, sp] of B.motes) {
      const x = ((mx + Math.sin(sec * 0.35 + ph) * 24 - camX * 0.55) % 2400 + 2400) % 2400 * (w / 1400);
      const y = ((my - sec * 10 * sp) % 1050 + 1050) % 1050 * (h / 900);
      if (x < -24 || x > w + 24 || y < -24 || y > h + 24) continue;
      const sz = 18 * sc2 * (0.75 + 0.25 * Math.sin(sec * 2.2 + ph));
      c.drawImage(B.moteCv, x - sz / 2, y - sz / 2, sz, sz);
    }
  }

  // 작은 폭포 애니메이션 + 물안개 (섬 1·3·5·6 — 시작 칸이 남아 있을 때만)
  function drawWaterfalls(c, geo, T, now) {
    if (!geo || !geo.falls) return;
    const sec = now / 1000;
    for (const [id, fx, fy] of geo.falls) {
      if (!T.solid(fx, fy) && !T.solid(fx, fy + 4) && !T.solid(fx, fy - 4)) continue;
      const len = (id === 3 || id === 5) ? 195 : 155;
      const w = 13;
      const wg = c.createLinearGradient(fx, fy - 4, fx, fy + len);
      wg.addColorStop(0, 'rgba(215,246,255,.85)'); wg.addColorStop(0.55, 'rgba(145,216,255,.68)'); wg.addColorStop(1, 'rgba(180,235,255,0)');
      c.save();
      c.fillStyle = wg;
      c.beginPath();
      c.moveTo(fx - w / 2, fy - 4);
      c.quadraticCurveTo(fx, fy - 7, fx + w / 2, fy - 4);
      c.lineTo(fx + w / 2 + 2, fy + len);
      c.lineTo(fx - w / 2 - 2, fy + len);
      c.closePath(); c.fill();
      // 흘러내리는 하얀 물줄기
      c.strokeStyle = 'rgba(255,255,255,.78)'; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const lx = fx - 3.5 + i * 3.5;
        const off = ((sec * 120 + i * 28 + id * 17) % 44);
        c.lineWidth = i === 1 ? 2.2 : 1.5;
        for (let y = fy + off; y < fy + len - 22; y += 44) {
          c.globalAlpha = Math.max(0, 1 - (y - fy) / len);
          c.beginPath(); c.moveTo(lx, y); c.lineTo(lx, Math.min(fy + len, y + 18)); c.stroke();
        }
      }
      // 위·아래 물안개
      c.globalAlpha = 0.42;
      c.fillStyle = '#f6fbff';
      for (let m = 0; m < 3; m++) {
        const p = (sec * 0.9 + m * 0.33 + id) % 1;
        c.beginPath(); c.arc(fx + (m - 1) * 5, fy - 2 - p * 8, 4 + p * 5, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.28 * (1 - p);
        c.beginPath(); c.arc(fx + Math.sin(sec * 2 + m * 2) * 8, fy + len * 0.84 + p * 14, 7 + p * 9, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.42;
      }
      c.restore();
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

  window.TankArt = { TEAM, KIND, STAT, drawTank, tomb, icon, Terrain, sky, drawWaterfalls, EMO, rr };
})();
