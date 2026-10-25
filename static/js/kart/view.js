/* 아리채 쌩쌩카트 · 3D 화면 (three.js)
   - 트랙은 평평한 바닥 + 길 띠(리본) 몇 개, 카트는 작은 상자 모형(한 번에 그려요), 동물 운전수는 늘 카메라를 보는 2D 그림
     → 옛날 "Mode 7" 느낌을 GPU 로 (폰에서도 60fps 목표: 픽셀 배율 최대 2, 그리기 횟수 적게, 후처리 없음)
   - 지도 좌표 (x, y) → three.js (x, 0, y) · 위쪽 = +Y
   - 카메라 값은 KartView.CAM 에서 바로 바꿀 수 있어요 (주소 ?kcam=거리,높이,시야,앞보기 로도 시험)
   three.js 는 카트 모드에 들어올 때만 불러와요 (다른 게임은 가볍게) */
(function () {
  'use strict';

  const THREE_URL = '/static/js/vendor/three/three.module.min.js?v=0.183.2';
  let THREE = null;
  let loading = null;

  // 카메라 값 (가족 시험에서 바꿔 보기 쉽게 한 곳에)
  const CAM = {
    dist: 9.0,      // 카트 뒤 거리
    height: 4.9,    // 높이 (기울기는 높이·거리·앞보기로 정해져요)
    look: 9.0,      // 카트 앞 이만큼을 봐요
    lookH: 0.6,     // 보는 점 높이
    fov: 62,        // 세로 시야각 (도)
    boostFov: 7,    // 부스터 때 넓어지는 시야
    yawLag: 5.0,    // 카메라가 따라 도는 빠르기 (작을수록 느긋 → 멀미 적게)
    posLag: 14,     // 위치 따라가기
    shake: 0.12     // 흔들림 크기 (아주 작게)
  };
  try {
    const q = new URLSearchParams(location.search).get('kcam');
    if (q) {
      const v = q.split(',').map(Number);
      ['dist', 'height', 'fov', 'look'].forEach((k, i) => { if (v[i] > 0) CAM[k] = v[i]; });
    }
  } catch (e) { /* 무시 */ }

  function load() {
    if (THREE) return Promise.resolve(THREE);
    if (!loading) {
      loading = import(THREE_URL).then((m) => { THREE = m; return m; }).catch((e) => { loading = null; throw e; });
    }
    return loading;
  }

  /* ================================================================
     그림(캔버스 텍스처)
     ================================================================ */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function tex(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    return t;
  }

  function grassCanvas() {
    const c = canvas(256, 256); const g = c.getContext('2d'); const R = rng(3);
    // 잔디 깎은 줄무늬 (속도감)
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#86D166' : '#7AC75C';
      g.fillRect(i * 128, j * 128, 128, 128);
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(30,90,30,.08)';
      g.fillRect(R() * 256, R() * 256, 2, 3 + R() * 3);
    }
    // 작은 꽃
    for (let i = 0; i < 18; i++) {
      g.fillStyle = ['#FFFFFF', '#FFE27A', '#FF9FC6'][i % 3];
      const x = R() * 256; const y = R() * 256;
      g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill();
    }
    return c;
  }
  function roadCanvas() {
    const c = canvas(128, 256); const g = c.getContext('2d'); const R = rng(5);
    g.fillStyle = '#8F8AAE'; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 900; i++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(20,10,50,.08)'; g.fillRect(R() * 128, R() * 256, 1.5, 1.5); }
    g.fillStyle = '#F6F3FF'; g.fillRect(3, 0, 4, 256); g.fillRect(121, 0, 4, 256);
    g.fillStyle = 'rgba(255,240,170,.85)'; g.fillRect(62, 0, 4, 110);
    return c;
  }
  function curbCanvas() {
    const c = canvas(32, 64); const g = c.getContext('2d');
    g.fillStyle = '#FF5C6C'; g.fillRect(0, 0, 32, 32); g.fillStyle = '#FFF6F0'; g.fillRect(0, 32, 32, 32);
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, 3, 64);
    return c;
  }
  function hedgeCanvas() {
    const c = canvas(128, 64); const g = c.getContext('2d'); const R = rng(9);
    g.fillStyle = '#3E9E4A'; g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 70; i++) {
      const x = R() * 128; const y = 8 + R() * 56;
      g.fillStyle = ['#4DB459', '#5CC466', '#368E42'][i % 3];
      g.beginPath(); g.arc(x, y, 6 + R() * 8, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.25)';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(R() * 128, 6 + R() * 20, 2.5, 0, 7); g.fill(); }
    // 위쪽 둥글게
    g.globalCompositeOperation = 'destination-out';
    for (let x = 0; x < 128; x += 16) { g.beginPath(); g.arc(x + 8, -4, 8, 0, 7); g.fill(); }
    return c;
  }
  function dirtCanvas() {
    const c = canvas(128, 128); const g = c.getContext('2d'); const R = rng(13);
    g.fillStyle = '#D8B27A'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 60; i++) { g.fillStyle = R() < 0.5 ? '#C79E66' : '#E8C894'; g.beginPath(); g.ellipse(R() * 128, R() * 128, 3 + R() * 5, 2 + R() * 3, R() * 3, 0, 7); g.fill(); }
    g.fillStyle = '#F2DFB8';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(40 + R() * 48, i * 22 + 8, 12, 7, 0, 0, 7); g.fill(); }
    return c;
  }
  function radialCanvas(inner, outer, size) {
    const c = canvas(size || 64, size || 64); const g = c.getContext('2d'); const r = (size || 64) / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    return c;
  }
  function skyCanvas() {
    const c = canvas(4, 256); const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5DA9FF'); gr.addColorStop(0.55, '#9FD3FF'); gr.addColorStop(0.75, '#D9F0FF'); gr.addColorStop(1, '#FFF4E0');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    return c;
  }
  function hillsCanvas() {
    const W = 2048; const Hh = 256;
    const c = canvas(W, Hh); const g = c.getContext('2d'); const R = rng(21);
    // 구름
    g.fillStyle = 'rgba(255,255,255,.95)';
    for (let i = 0; i < 16; i++) {
      const x = R() * W; const y = 20 + R() * 60; const s = 18 + R() * 22;
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + k * s * 0.7, y + (k % 2 ? -s * 0.3 : 0), s, 0, 7); g.fill(); }
    }
    // 먼 산 (두 겹)
    const layer = (base, amp, col, seedOff) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, Hh);
      for (let x = 0; x <= W; x += 16) {
        const y = base - amp * (0.5 + 0.5 * Math.sin(x / 140 + seedOff) * Math.sin(x / 61 + seedOff * 2));
        g.lineTo(x, y);
      }
      g.lineTo(W, Hh); g.fill();
    };
    layer(190, 70, '#9CCFE0', 1);
    layer(214, 46, '#7BBE7E', 4);
    // 나무 줄
    for (let x = 0; x < W; x += 9 + R() * 12) {
      const h = 14 + R() * 16;
      g.fillStyle = R() < 0.5 ? '#4FA65A' : '#5DB868';
      g.beginPath(); g.arc(x, 236 - h * 0.6, h * 0.55, 0, 7); g.fill();
    }
    g.fillStyle = '#6DBB5E'; g.fillRect(0, 236, W, 20);
    return c;
  }
  function stadiumCanvas() {
    const W = 1024; const Hh = 160;
    const c = canvas(W, Hh); const g = c.getContext('2d'); const R = rng(31);
    g.fillStyle = '#3B3570'; g.fillRect(0, 0, W, Hh);
    const cols = ['#FF4757', '#FFD23F', '#3D7BFF', '#2ED573', '#FF6FB5', '#FF8A3D', '#B07BFF', '#3DD6D0', '#FFFFFF'];
    for (let r = 0; r < 7; r++) {
      const y = 34 + r * 16;
      g.fillStyle = '#2A2552'; g.fillRect(0, y + 7, W, 3);
      for (let x = 4 + (r % 2) * 5; x < W; x += 10) {
        g.fillStyle = cols[Math.floor(R() * cols.length)];
        g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill();
      }
    }
    // 지붕 띠 + 오색 고리 + 글자
    g.fillStyle = '#F6F3FF'; g.fillRect(0, 0, W, 26);
    for (let i = 0; i < 4; i++) {
      const cx = 128 + i * 256;
      [['#3D7BFF', -22, 0], ['#2A2340', 0, 0], ['#FF4757', 22, 0], ['#FFD23F', -11, 7], ['#2ED573', 11, 7]].forEach(([col, dx, dy]) => {
        g.strokeStyle = col; g.lineWidth = 3.5; g.beginPath(); g.arc(cx + dx, 10 + dy, 8, 0, 7); g.stroke();
      });
      g.fillStyle = '#FF4757'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
      g.fillText('아리채 경기장', cx + 64, 18);
    }
    g.fillStyle = '#FFD23F'; g.fillRect(0, 26, W, 4);
    return c;
  }
  function bannerCanvas() {
    const c = canvas(512, 96); const g = c.getContext('2d');
    g.fillStyle = '#FFD23F'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#FF4757'; g.fillRect(0, 0, 512, 10); g.fillRect(0, 86, 512, 10);
    for (let x = 0; x < 512; x += 32) { g.fillStyle = (x / 32) % 2 ? '#2ED573' : '#3D7BFF'; g.fillRect(x, 0, 16, 10); g.fillRect(x + 16, 86, 16, 10); }
    g.fillStyle = '#15122B'; g.font = '900 52px "Black Han Sans", "Jua", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('아리채 쌩쌩카트', 256, 50);
    return c;
  }
  function checkerCanvas() {
    const c = canvas(64, 16); const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#15122B' : '#FFFFFF'; g.fillRect(i * 4, j * 4, 4, 4); }
    return c;
  }
  function waterCanvas() {
    const c = canvas(128, 128); const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, '#7FD3FF'); gr.addColorStop(0.85, '#4FA8E8'); gr.addColorStop(0.92, '#E9F7FF'); gr.addColorStop(1, 'rgba(233,247,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2.5;
    [[44, 50, 12], [80, 76, 9], [62, 88, 6]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 3.6, 5.4); g.stroke(); });
    return c;
  }
  function treeCanvas() {
    const c = canvas(128, 160); const g = c.getContext('2d');
    g.fillStyle = '#8A5A35'; g.fillRect(56, 100, 16, 60);
    [['#3E9E4A', 64, 78, 46], ['#4DB459', 50, 64, 34], ['#5CC466', 80, 56, 30], ['#6CD073', 60, 40, 26]].forEach(([col, x, y, r]) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
    g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(54, 34, 9, 0, 7); g.fill();
    g.fillStyle = '#FF6F7F'; [[40, 80], [86, 70], [70, 100], [52, 52]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); });
    return c;
  }
  function flowerCanvas() {
    const c = canvas(64, 64); const g = c.getContext('2d'); const R = rng(41);
    for (let i = 0; i < 9; i++) {
      const x = 8 + R() * 48; const y = 10 + R() * 44;
      g.fillStyle = '#3E9E4A'; g.beginPath(); g.arc(x, y + 3, 6, 0, 7); g.fill();
      g.fillStyle = ['#FF6FB5', '#FFD23F', '#FFFFFF', '#FF8A3D', '#B07BFF'][i % 5];
      for (let k = 0; k < 5; k++) { const a = k * 1.256; g.beginPath(); g.arc(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, 2.6, 0, 7); g.fill(); }
      g.fillStyle = '#FFE27A'; g.beginPath(); g.arc(x, y, 1.8, 0, 7); g.fill();
    }
    return c;
  }
  // 응원 풍선 (물음표 상자 대신! 우리 마스코트 얼굴)
  function balloonCanvas(col, dark) {
    const c = canvas(96, 128); const g = c.getContext('2d');
    g.strokeStyle = '#F6F3FF'; g.lineWidth = 2; g.beginPath(); g.moveTo(48, 82); g.quadraticCurveTo(40, 100, 50, 126); g.stroke();
    const gr = g.createRadialGradient(38, 30, 4, 48, 44, 44);
    gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.18, col); gr.addColorStop(1, dark);
    g.fillStyle = gr; g.beginPath(); g.ellipse(48, 44, 36, 40, 0, 0, 7); g.fill();
    g.fillStyle = dark; g.beginPath(); g.moveTo(42, 82); g.lineTo(54, 82); g.lineTo(48, 90); g.fill();
    // 웃는 얼굴
    g.fillStyle = '#2A2340';
    g.beginPath(); g.ellipse(36, 44, 4, 5, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(60, 44, 4, 5, 0, 0, 7); g.fill();
    g.strokeStyle = '#2A2340'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.arc(48, 52, 9, 0.3, 2.84); g.stroke();
    g.fillStyle = 'rgba(255,127,160,.6)'; g.beginPath(); g.ellipse(27, 56, 5, 3, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(69, 56, 5, 3, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(30, 24, 7, 10, -0.5, 0, 7); g.fill();
    return c;
  }
  function spikeCanvas() {
    const c = canvas(96, 96); const g = c.getContext('2d');
    g.fillStyle = '#7A4E35';
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      g.beginPath(); g.moveTo(48 + Math.cos(a - 0.2) * 26, 48 + Math.sin(a - 0.2) * 26); g.lineTo(48 + Math.cos(a) * 46, 48 + Math.sin(a) * 46); g.lineTo(48 + Math.cos(a + 0.2) * 26, 48 + Math.sin(a + 0.2) * 26); g.fill();
    }
    g.fillStyle = '#8E5E40'; g.beginPath(); g.arc(48, 48, 30, 0, 7); g.fill();
    g.fillStyle = '#F6D2A6'; g.beginPath(); g.ellipse(52, 54, 16, 13, 0, 0, 7); g.fill();
    g.fillStyle = '#2A2340'; g.beginPath(); g.arc(44, 48, 3.5, 0, 7); g.fill(); g.beginPath(); g.arc(58, 48, 3.5, 0, 7); g.fill();
    g.beginPath(); g.ellipse(52, 58, 4, 3, 0, 0, 7); g.fill();
    return c;
  }
  function honeyCanvas() {
    const c = canvas(128, 128); const g = c.getContext('2d');
    g.fillStyle = '#E8A317';
    g.beginPath();
    for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; const r = 54 + Math.sin(i * 2.3) * 6; i ? g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r) : g.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.fill();
    g.fillStyle = '#FFC93C'; g.beginPath(); g.ellipse(64, 62, 40, 36, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(48, 46, 14, 8, -0.5, 0, 7); g.fill(); g.beginPath(); g.ellipse(78, 76, 6, 4, -0.5, 0, 7); g.fill();
    return c;
  }
  function beeCanvas() {
    const c = canvas(64, 64); const g = c.getContext('2d');
    g.fillStyle = 'rgba(232,246,255,.9)'; g.beginPath(); g.ellipse(24, 18, 12, 8, -0.6, 0, 7); g.fill(); g.beginPath(); g.ellipse(40, 18, 12, 8, 0.6, 0, 7); g.fill();
    g.fillStyle = '#FFD54A'; g.beginPath(); g.ellipse(32, 38, 18, 14, 0, 0, 7); g.fill();
    g.fillStyle = '#3A2F1E'; g.fillRect(24, 25, 5, 26); g.fillRect(35, 25, 5, 26);
    g.fillStyle = '#2A2340'; g.beginPath(); g.arc(44, 34, 2.4, 0, 7); g.fill();
    return c;
  }
  function ringCanvas() {
    const c = canvas(128, 128); const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,240,200,.95)'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,180,80,.7)'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 44, 0, 7); g.stroke();
    return c;
  }
  function footCanvas() {
    const c = canvas(128, 128); const g = c.getContext('2d');
    g.fillStyle = 'rgba(60,30,90,.45)';
    g.beginPath(); g.ellipse(64, 74, 38, 44, 0, 0, 7); g.fill();
    [[30, 26], [64, 16], [98, 26]].forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 13, 16, 0, 0, 7); g.fill(); });
    return c;
  }
  function textCanvas(txt, col, bg) {
    const c = canvas(256, 96); const g = c.getContext('2d');
    g.font = '900 56px "Black Han Sans", "Jua", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = bg || '#15122B'; g.lineJoin = 'round'; g.strokeText(txt, 128, 50);
    g.fillStyle = col || '#FFD23F'; g.fillText(txt, 128, 50);
    return c;
  }

  /* ---------- 운전수 그림 (올림픽 선수 10명 재사용) — 칸: 뒤 · 보통 · 힘줌 · 기쁨 · 울음 · 깜짝 ---------- */
  const EXS = ['back', 'n', 'e', 'h', 's', 'o'];
  const CELL = 128;
  function driverSVG(id, ex) {
    const O = window.Oly;
    const a = O.ath(id);
    const body = `<path d="M-23 46 Q-25 18 -11 12 L11 12 Q25 18 23 46 Z" fill="${a.jersey}" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/>`;
    let head;
    if (ex === 'back') {
      // 뒤통수: 얼굴 쪽을 같은 색으로 덮어요
      head = `<g transform="scale(-1 1)">${O.HEAD[a.id]('n')}</g><ellipse cx="-4" cy="3" rx="19" ry="17" fill="${a.skin}"/><ellipse cx="-6" cy="-6" rx="9" ry="5" fill="rgba(255,255,255,.28)"/>`;
    } else {
      const fx = ex === 's' ? '<path d="M-6 4 q-3 9 -1 15 q3 3 4 -1 q0 -6 -3 -14 Z M14 4 q-2 9 0 15 q3 3 4 -1 q0 -6 -4 -14 Z" fill="#7FD3FF" stroke="#3D9BE0" stroke-width="1"/>' : '';
      const ee = ex === 's' ? 's' : ex;
      head = `${O.HEAD[a.id](ee)}${fx}`;
    }
    const arms = ex === 'back'
      ? `<path d="M-19 22 Q-27 30 -20 38" stroke="${a.skin}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M19 22 Q27 30 20 38" stroke="${a.skin}" stroke-width="7" fill="none" stroke-linecap="round"/>`
      : `<path d="M-19 22 Q-24 32 -8 36" stroke="${a.skin}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M19 22 Q24 32 8 36" stroke="${a.skin}" stroke-width="7" fill="none" stroke-linecap="round"/><ellipse cx="0" cy="38" rx="15" ry="5" fill="none" stroke="#2A2340" stroke-width="3.5"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -58 100 100" width="${CELL}" height="${CELL}">${body}${arms}<g transform="translate(0 -12) scale(1.12)">${head}</g></svg>`;
  }
  const atlasCache = {};
  function driverAtlas(id) {
    if (atlasCache[id]) return atlasCache[id];
    const c = canvas(CELL * EXS.length, CELL);
    const g = c.getContext('2d');
    // 그림이 오기 전에 보일 동그라미
    const a = window.Oly ? window.Oly.ath(id) : { skin: '#ccc', jersey: '#888' };
    for (let i = 0; i < EXS.length; i++) {
      g.fillStyle = a.jersey; g.beginPath(); g.arc(i * CELL + 64, 100, 26, 0, 7); g.fill();
      g.fillStyle = a.skin; g.beginPath(); g.arc(i * CELL + 64, 52, 30, 0, 7); g.fill();
    }
    const t = tex(c);
    t.repeat.set(1 / EXS.length, 1);
    const entry = { canvas: c, texture: t, clones: [] };
    atlasCache[id] = entry;
    if (window.Oly) {
      let left = EXS.length;
      EXS.forEach((ex, i) => {
        const img = new Image();
        img.onload = () => {
          g.clearRect(i * CELL, 0, CELL, CELL);
          g.drawImage(img, i * CELL, 0, CELL, CELL);
          t.needsUpdate = true;
          entry.clones.forEach((ct) => { ct.needsUpdate = true; });
          if (--left === 0) entry.ready = true;
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(driverSVG(id, ex));
      });
    }
    return entry;
  }

  /* ================================================================
     모양 만들기
     ================================================================ */
  // 길을 따라 띠 (리본): 옆 거리 d0~d1, 높이 y, v 는 길이/tile
  function ribbon(P, d0, d1, y, tile, step, skip, closed) {
    const pos = []; const uv = []; const idx = [];
    const n = P.n; const st = step || 2;
    const cnt = closed ? Math.floor(n / st) : Math.floor((n - 1) / st) + 1;
    let row = 0; let prevOk = false;
    for (let k = 0; k <= cnt; k++) {
      if (!closed && k === cnt) break;
      const i = closed ? (k === cnt ? 0 : k * st) : Math.min(n - 1, k * st);
      const s = (closed && k === cnt ? n : k * st) * P.ds;
      const h = P.ang[i]; const rx = -Math.sin(h); const ry = Math.cos(h);
      const dm = (d0 + d1) / 2;
      const ok = !skip || !skip(P.px[i] + rx * dm, P.py[i] + ry * dm, h);
      pos.push(P.px[i] + rx * d0, y, P.py[i] + ry * d0, P.px[i] + rx * d1, y, P.py[i] + ry * d1);
      uv.push(0, s / tile, 1, s / tile);
      if (row > 0 && ok && prevOk) { const a = (row - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      prevOk = ok; row++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }
  // 길을 따라 세운 벽 (울타리)
  function wall(P, d, h, tile, step, skip, closed) {
    const pos = []; const uv = []; const idx = [];
    const n = P.n; const st = step || 2;
    const cnt = closed ? Math.floor(n / st) : Math.floor((n - 1) / st) + 1;
    let row = 0; let prevOk = false;
    for (let k = 0; k <= cnt; k++) {
      if (!closed && k === cnt) break;
      const i = closed ? (k === cnt ? 0 : k * st) : Math.min(n - 1, k * st);
      const s = (closed && k === cnt ? n : k * st) * P.ds;
      const hh = P.ang[i]; const x = P.px[i] - Math.sin(hh) * d; const z = P.py[i] + Math.cos(hh) * d;
      const ok = !skip || !skip(x, z);
      pos.push(x, 0, z, x, h, z);
      uv.push(s / tile, 0, s / tile, 1);
      if (row > 0 && ok && prevOk) { const a = (row - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      prevOk = ok; row++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }

  // 여러 모양을 한 덩어리로 (색은 꼭짓점마다)
  function merge(parts) {
    const pos = []; const nor = []; const col = [];
    parts.forEach(({ geo, m, c }) => {
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.applyMatrix4(m);
      const p = g.attributes.position.array; const nn = g.attributes.normal.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(nn[i]); }
      for (let i = 0; i < p.length / 3; i++) col.push(c[0], c[1], c[2]);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  function M(x, y, z, rx, ry, rz) {
    const m = new THREE.Matrix4();
    m.makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
    m.setPosition(x, y, z);
    return m;
  }
  // 카트 모형 (앞 = +x · 오른쪽 = +z) — 흰 부분은 선수 옷 색으로 물들어요
  function kartGeometry() {
    const W = [1, 1, 1]; const D = [0.42, 0.42, 0.45]; const K = [0.09, 0.08, 0.1]; const L = [0.95, 0.95, 0.95];
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const cyl = (r, w) => new THREE.CylinderGeometry(r, r, w, 10);
    const parts = [
      { geo: box(2.0, 0.34, 1.25), m: M(0, 0.45, 0), c: W },
      { geo: box(0.7, 0.28, 0.95), m: M(1.15, 0.42, 0), c: W },
      { geo: box(0.22, 0.24, 1.45), m: M(1.5, 0.32, 0), c: D },
      { geo: box(0.26, 0.62, 0.95), m: M(-0.62, 0.88, 0), c: D },
      { geo: box(0.55, 0.36, 0.75), m: M(-0.92, 0.72, 0), c: K },
      { geo: box(0.34, 0.08, 1.6), m: M(-1.12, 1.12, 0), c: W },
      { geo: box(0.08, 0.34, 0.08), m: M(-1.05, 0.95, 0.5), c: D },
      { geo: box(0.08, 0.34, 0.08), m: M(-1.05, 0.95, -0.5), c: D },
      { geo: cyl(0.08, 0.5), m: M(0.55, 0.85, 0, 0, 0, 0.9), c: K }
    ];
    [[0.78, 0.74], [0.78, -0.74], [-0.72, 0.78], [-0.72, -0.78]].forEach(([x, z], i) => {
      const r = i < 2 ? 0.34 : 0.4;
      parts.push({ geo: cyl(r, 0.34), m: M(x, r, z, Math.PI / 2, 0, 0), c: K });
      parts.push({ geo: cyl(r * 0.45, 0.36), m: M(x, r, z, Math.PI / 2, 0, 0), c: L });
    });
    return merge(parts);
  }

  // 반짝이·먼지·폭죽 알갱이 (한 번에 그려요)
  const PART_VS = `attribute float size; attribute float alpha; attribute vec3 pcolor; varying vec3 vC; varying float vA; uniform float uScale;
    void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`;
  const PART_FS = `uniform sampler2D map; varying vec3 vC; varying float vA;
    void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a * vA < 0.02) discard; gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`;

  /* ================================================================
     화면 만들기
     ================================================================ */
  function create(opt) {
    const T = opt.track;
    const host = opt.container;
    const K = window.KartCore;
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    let pr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.className = 'kt-gl';
    const scene = new THREE.Scene();
    const SKY = new THREE.Color('#BFE3FF');
    scene.background = SKY;
    scene.fog = new THREE.Fog(SKY, 140, 380);
    const camera = new THREE.PerspectiveCamera(CAM.fov, 0.5, 0.5, 900);
    scene.add(new THREE.HemisphereLight(0xF2F7FF, 0x6E9E5A, 1.6));
    const sun = new THREE.DirectionalLight(0xFFF4DC, 1.7);
    sun.position.set(-60, 120, 40);
    scene.add(sun);

    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };
    const basic = (map, o) => keep(new THREE.MeshBasicMaterial(Object.assign({ map }, o || {})));

    // ---------- 하늘 · 먼 산 ----------
    const skyMesh = new THREE.Mesh(keep(new THREE.SphereGeometry(700, 16, 12)), basic(keep(tex(skyCanvas())), { side: THREE.BackSide, fog: false, depthWrite: false }));
    scene.add(skyMesh);
    const hillsTex = keep(tex(hillsCanvas(), true));
    hillsTex.repeat.set(2, 1);
    const hills = new THREE.Mesh(keep(new THREE.CylinderGeometry(520, 520, 120, 48, 1, true)), basic(hillsTex, { side: THREE.BackSide, transparent: true, fog: false, depthWrite: false }));
    hills.position.y = 34;
    scene.add(hills);

    // ---------- 바닥 (잔디) ----------
    const grassTex = keep(tex(grassCanvas(), true));
    grassTex.repeat.set(1400 / 24, 1400 / 24);
    const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(1400, 1400)), basic(grassTex));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.06, 0);
    scene.add(ground);

    // ---------- 길 · 연석 · 울타리 ----------
    const sc = T.sc;
    const inSC = (x, z, m) => {
      if (!sc) return false;
      const j = K.nearestIdx(sc, x, z, -1);
      return Math.hypot(sc.px[j] - x, sc.py[j] - z) < sc.hw + (m || 0) && j > 0 && j < sc.n - 1;
    };
    const inMainRoad = (x, z, m) => {
      const i = K.nearestIdx(T.main, x, z, -1);
      return Math.hypot(T.main.px[i] - x, T.main.py[i] - z) < T.hw + (m || 0);
    };
    const roadTex = keep(tex(roadCanvas(), true));
    const road = new THREE.Mesh(keep(ribbon(T.main, -T.hw, T.hw, 0.0, 14, 2, null, true)), basic(roadTex));
    scene.add(road);
    const curbTex = keep(tex(curbCanvas(), true));
    const curbMat = basic(curbTex);
    const skipCurb = (x, z) => inSC(x, z, -0.5);
    scene.add(new THREE.Mesh(keep(ribbon(T.main, T.hw, T.hw + 1.05, 0.01, 4, 1, skipCurb, true)), curbMat));
    scene.add(new THREE.Mesh(keep(ribbon(T.main, -T.hw - 1.05, -T.hw, 0.01, 4, 1, skipCurb, true)), curbMat));
    const hedgeTex = keep(tex(hedgeCanvas(), true));
    const hedgeMat = basic(hedgeTex, { side: THREE.DoubleSide, alphaTest: 0.5, transparent: false });
    const skipHedge = (x, z) => inSC(x, z, 1.4) || inMainRoad(x, z, 0.4);
    const hedgeH = 1.5;
    scene.add(new THREE.Mesh(keep(wall(T.main, T.hw + 1.15, hedgeH, 5, 1, skipHedge, true)), hedgeMat));
    scene.add(new THREE.Mesh(keep(wall(T.main, -T.hw - 1.15, hedgeH, 5, 1, skipHedge, true)), hedgeMat));
    if (sc) {
      const dirt = keep(tex(dirtCanvas(), true));
      const scMesh = new THREE.Mesh(keep(ribbon(sc, -sc.hw - 0.6, sc.hw + 0.6, 0.005, 10, 1, (x, z) => inMainRoad(x, z, -1.0), false)), basic(dirt));
      scene.add(scMesh);
      const fenceSkip = (x, z) => inMainRoad(x, z, 1.0);
      scene.add(new THREE.Mesh(keep(wall(sc, sc.hw + 0.9, 1.0, 5, 1, fenceSkip, false)), hedgeMat));
      scene.add(new THREE.Mesh(keep(wall(sc, -sc.hw - 0.9, 1.0, 5, 1, fenceSkip, false)), hedgeMat));
    }
    // 출발선 + 아치
    const startP = K.mainPoint(T, 0, 0);
    const chk = keep(tex(checkerCanvas(), true));
    const line = new THREE.Mesh(keep(new THREE.PlaneGeometry(2.2, T.hw * 2)), basic(chk));
    line.rotation.x = -Math.PI / 2; line.rotation.z = -startP.h;
    line.position.set(startP.x, 0.03, startP.y);
    chk.repeat.set(1, 1);
    scene.add(line);
    const arch = new THREE.Group();
    const postGeo = keep(new THREE.CylinderGeometry(0.35, 0.35, 7, 8));
    const postMat = keep(new THREE.MeshLambertMaterial({ color: 0xFF6FB5 }));
    [-1, 1].forEach((sd) => { const p = new THREE.Mesh(postGeo, postMat); p.position.set(0, 3.5, sd * (T.hw + 1.6)); arch.add(p); });
    const ban = new THREE.Mesh(keep(new THREE.PlaneGeometry(T.hw * 2 + 3.2, 2.2)), basic(keep(tex(bannerCanvas())), { side: THREE.DoubleSide }));
    ban.position.set(0, 6.4, 0); ban.rotation.y = -Math.PI / 2;
    arch.add(ban);
    arch.position.set(startP.x, 0, startP.y);
    arch.rotation.y = -startP.h;
    scene.add(arch);

    // ---------- 경기장 · 연못 · 꽃밭 · 나무 ----------
    const deco = T.def.deco || {};
    if (deco.stadium) {
      const [sx, sy, sr] = deco.stadium;
      const stTex = keep(tex(stadiumCanvas(), true)); stTex.repeat.set(3, 1);
      const wallM = new THREE.Mesh(keep(new THREE.CylinderGeometry(sr, sr * 1.08, 12, 40, 1, true)), basic(stTex, { side: THREE.DoubleSide }));
      wallM.position.set(sx, 6, sy);
      scene.add(wallM);
      const top = new THREE.Mesh(keep(new THREE.TorusGeometry(sr + 0.4, 0.9, 6, 40)), keep(new THREE.MeshLambertMaterial({ color: 0xF6F3FF })));
      top.rotation.x = Math.PI / 2; top.position.set(sx, 12, sy);
      scene.add(top);
      // 깃발
      const flagCols = [0xFF4757, 0xFFD23F, 0x2ED573, 0x3D7BFF, 0xFF6FB5];
      const flagGeo = keep(new THREE.PlaneGeometry(2.2, 1.4));
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        const f = new THREE.Mesh(flagGeo, keep(new THREE.MeshBasicMaterial({ color: flagCols[i % 5], side: THREE.DoubleSide })));
        f.position.set(sx + Math.cos(a) * (sr + 0.4), 14.2, sy + Math.sin(a) * (sr + 0.4));
        f.rotation.y = -a;
        scene.add(f);
      }
    }
    if (deco.pond) {
      const [px, py, pr2] = deco.pond;
      const pond = new THREE.Mesh(keep(new THREE.CircleGeometry(pr2, 24)), basic(keep(tex(waterCanvas())), { transparent: true }));
      pond.rotation.x = -Math.PI / 2; pond.position.set(px, 0.02, py);
      scene.add(pond);
    }
    // 나무 (두 장 엇갈린 그림, 한 번에 그려요)
    const R = rng(deco.seed || 7);
    const treeSpots = [];
    for (let tries = 0; tries < 2400 && treeSpots.length < 110; tries++) {
      const x = -230 + R() * 460; const z = -190 + R() * 340;
      const i = K.nearestIdx(T.main, x, z, -1);
      const dm = Math.hypot(T.main.px[i] - x, T.main.py[i] - z);
      if (dm < T.hw + 5 || dm > 70) continue;
      if (sc) { const j = K.nearestIdx(sc, x, z, -1); if (Math.hypot(sc.px[j] - x, sc.py[j] - z) < sc.hw + 4) continue; }
      if (deco.stadium && Math.hypot(x - deco.stadium[0], z - deco.stadium[1]) < deco.stadium[2] + 4) continue;
      if (deco.pond && Math.hypot(x - deco.pond[0], z - deco.pond[1]) < deco.pond[2] + 2) continue;
      treeSpots.push([x, z, 4.5 + R() * 3.5]);
    }
    {
      const quad = keep(new THREE.PlaneGeometry(1, 1.25));
      quad.translate(0, 0.625, 0);
      const q2 = quad.clone().rotateY(Math.PI / 2);
      const pos = []; const uv = []; const idx = [];
      let base = 0;
      const add = (g, x, z, s) => {
        const p = g.attributes.position.array; const u = g.attributes.uv.array;
        for (let i = 0; i < p.length; i += 3) pos.push(p[i] * s + x, p[i + 1] * s, p[i + 2] * s + z);
        for (let i = 0; i < u.length; i++) uv.push(u[i]);
        g.index.array.forEach((v) => idx.push(v + base));
        base += p.length / 3;
      };
      treeSpots.forEach(([x, z, s]) => { add(quad, x, z, s); add(q2, x, z, s); });
      const g = keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      scene.add(new THREE.Mesh(g, basic(keep(tex(treeCanvas())), { alphaTest: 0.5, side: THREE.DoubleSide })));
      q2.dispose();
    }
    // 꽃밭 (바닥 무늬)
    {
      const fl = keep(tex(flowerCanvas()));
      const mat = basic(fl, { transparent: true, depthWrite: false });
      const geo = keep(new THREE.PlaneGeometry(5, 5));
      const spots = (deco.garden || []).slice();
      for (let i = 0; i < 40; i++) {
        const s = R() * T.L; const sd = R() < 0.5 ? -1 : 1;
        const p = K.mainPoint(T, s, sd * (T.hw + 3 + R() * 4));
        if (sc && inSC(p.x, p.y, 2)) continue;
        if (inMainRoad(p.x, p.y, 1.5)) continue;
        spots.push([p.x, p.y, 2.5]);
      }
      spots.forEach(([x, z, r]) => {
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, z); m.scale.setScalar(r / 2.5);
        scene.add(m);
      });
    }
    // 화분 (장애물) — 테라코타 화분 + 꽃 공
    {
      const potGeo = keep(new THREE.CylinderGeometry(1.25, 0.95, 1.3, 10));
      potGeo.translate(0, 0.65, 0);
      const potMesh = new THREE.InstancedMesh(potGeo, keep(new THREE.MeshLambertMaterial({ color: 0xD9774B })), T.pots.length);
      const flGeo = keep(new THREE.IcosahedronGeometry(1.15, 1));
      const flMesh = new THREE.InstancedMesh(flGeo, keep(new THREE.MeshLambertMaterial({ color: 0xFF6FB5 })), T.pots.length);
      const m = new THREE.Matrix4();
      const cols = [0xFF6FB5, 0xFFD23F, 0xB07BFF, 0xFF8A3D];
      T.pots.forEach((p, i) => {
        m.makeTranslation(p.x, 0, p.y); potMesh.setMatrixAt(i, m);
        m.makeTranslation(p.x, 1.75, p.y); flMesh.setMatrixAt(i, m);
        flMesh.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      });
      scene.add(potMesh); scene.add(flMesh);
    }

    // ---------- 응원 풍선 ----------
    const balloonTex = [['#FF4757', '#B8202F'], ['#2ED573', '#1A8F4A'], ['#3D7BFF', '#1F49B8'], ['#FFD23F', '#C99A00']].map(([a, b]) => keep(tex(balloonCanvas(a, b))));
    const balloons = T.balloons.map((b, i) => {
      const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: balloonTex[i % 4], transparent: true, alphaTest: 0.3 })));
      sp.scale.set(1.9, 2.5, 1);
      sp.position.set(b.x, 1.8, b.y);
      sp.userData.ph = i * 1.7;
      scene.add(sp);
      return sp;
    });

    // ---------- 카트 ----------
    const N = opt.roster.length;
    const kartGeo = keep(kartGeometry());
    const kartMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const karts = new THREE.InstancedMesh(kartGeo, kartMat, N);
    karts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    karts.frustumCulled = false;
    const shadowTex = keep(tex(radialCanvas('rgba(20,10,40,.55)', 'rgba(20,10,40,0)')));
    const shadowGeo = keep(new THREE.PlaneGeometry(3.2, 2.4));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadows = new THREE.InstancedMesh(shadowGeo, basic(shadowTex, { transparent: true, depthWrite: false }), N);
    shadows.frustumCulled = false;
    scene.add(shadows); scene.add(karts);
    const drivers = [];
    const tags = [];
    opt.roster.forEach((r, i) => {
      const a = window.Oly ? window.Oly.ath(r.ath) : { jersey: '#888' };
      // 옷 색이 너무 밝으면(아기 고래) 바지 색으로
      const kc = new THREE.Color(a.jersey);
      const hsl = {}; kc.getHSL(hsl);
      karts.setColorAt(i, hsl.l > 0.85 ? new THREE.Color(a.shorts || '#3D7BFF') : kc);
      const at = driverAtlas(r.ath);
      const t = at.texture.clone();
      t.repeat.set(1 / EXS.length, 1);
      at.clones.push(t);
      t.needsUpdate = true;
      const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.2 })));
      sp.scale.set(1.9, 1.9, 1);
      sp.userData = { t, ex: -1, atlas: at };
      scene.add(sp);
      drivers.push(sp);
      // 이름표 (나는 빼고)
      if (i !== opt.myIdx) {
        const tc = canvas(256, 64); const g = tc.getContext('2d');
        g.font = '800 34px "Jua", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const w = Math.min(240, g.measureText(r.name).width + 36);
        g.fillStyle = r.bot ? 'rgba(21,18,43,.7)' : 'rgba(255,111,181,.92)';
        g.beginPath(); g.roundRect ? g.roundRect(128 - w / 2, 8, w, 48, 24) : g.rect(128 - w / 2, 8, w, 48); g.fill();
        g.fillStyle = '#fff'; g.fillText(r.name, 128, 33);
        const tg = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(tex(tc)), transparent: true, depthWrite: false, depthTest: false })));
        tg.scale.set(2.6, 0.65, 1);
        tg.renderOrder = 5;
        scene.add(tg);
        tags[i] = tg;
      }
    });

    // ---------- 아이템 ----------
    const spikeTex = keep(tex(spikeCanvas()));
    const honeyTex = keep(tex(honeyCanvas()));
    const beeTex = keep(tex(beeCanvas()));
    const honeyGeo = keep(new THREE.CircleGeometry(2.9, 20)); honeyGeo.rotateX(-Math.PI / 2);
    const items = new Map();
    function itemObj(kind) {
      if (kind === 'spike') {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: spikeTex, transparent: true, alphaTest: 0.3 }));
        sp.scale.set(1.9, 1.9, 1);
        scene.add(sp);
        return { o: sp, kind };
      }
      const g = new THREE.Group();
      const m = new THREE.Mesh(honeyGeo, new THREE.MeshBasicMaterial({ map: honeyTex, transparent: true, depthWrite: false }));
      m.position.y = 0.04; g.add(m);
      const bee = new THREE.Sprite(new THREE.SpriteMaterial({ map: beeTex, transparent: true, alphaTest: 0.3 }));
      bee.scale.set(1.1, 1.1, 1); bee.position.y = 1.4; g.add(bee);
      g.userData.bee = bee;
      scene.add(g);
      return { o: g, kind };
    }

    // ---------- 알갱이 (불꽃·먼지·폭죽) ----------
    const MAXP = 700;
    const pPos = new Float32Array(MAXP * 3); const pCol = new Float32Array(MAXP * 3);
    const pSize = new Float32Array(MAXP); const pAlpha = new Float32Array(MAXP);
    const pVel = new Float32Array(MAXP * 3); const pLife = new Float32Array(MAXP); const pMax = new Float32Array(MAXP); const pGrav = new Float32Array(MAXP); const pS0 = new Float32Array(MAXP);
    let pNext = 0;
    const pGeo = keep(new THREE.BufferGeometry());
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('pcolor', new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
    pGeo.setAttribute('alpha', new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    const dotTex = keep(tex(radialCanvas('rgba(255,255,255,1)', 'rgba(255,255,255,0)')));
    const pMat = keep(new THREE.ShaderMaterial({
      uniforms: { map: { value: dotTex }, uScale: { value: 400 } },
      vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    scene.add(points);
    const tmpC = new THREE.Color();
    function emit(x, y, z, vx, vy, vz, col, size, life, grav) {
      const i = pNext; pNext = (pNext + 1) % MAXP;
      pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
      pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
      tmpC.set(col);
      pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
      pSize[i] = size; pS0[i] = size; pLife[i] = life; pMax[i] = life; pGrav[i] = grav || 0; pAlpha[i] = 1;
    }
    function stepParticles(dt) {
      for (let i = 0; i < MAXP; i++) {
        if (pLife[i] <= 0) { pAlpha[i] = 0; continue; }
        pLife[i] -= dt;
        const f = Math.max(0, pLife[i] / pMax[i]);
        pVel[i * 3 + 1] -= pGrav[i] * dt;
        pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (pPos[i * 3 + 1] < 0.05) { pPos[i * 3 + 1] = 0.05; pVel[i * 3 + 1] *= -0.4; }
        pAlpha[i] = Math.min(1, f * 1.6);
        pSize[i] = pS0[i] * (0.5 + 0.5 * f);
      }
      pGeo.attributes.position.needsUpdate = true; pGeo.attributes.pcolor.needsUpdate = true;
      pGeo.attributes.size.needsUpdate = true; pGeo.attributes.alpha.needsUpdate = true;
    }
    // 우리만의 드리프트 불꽃 색: 모으는 중(하얀 먼지) → 1단 꿀빛 금색 → 2단 아리채 삼색(빨강·초록·파랑)
    const SPARK = [['#FFFFFF', '#E9E6FA'], ['#FFD23F', '#FFE27A', '#FFF0B3'], ['#FF4757', '#2ED573', '#3D7BFF', '#FFFFFF']];

    // ---------- 효과 모양 (충격파 · 공룡 발자국 · 글자 풍선) ----------
    const ringTex = keep(tex(ringCanvas()));
    const ringGeo = keep(new THREE.PlaneGeometry(1, 1)); ringGeo.rotateX(-Math.PI / 2);
    const footTex = keep(tex(footCanvas()));
    const fxList = [];
    function addRing(x, z, maxR, life, col) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, color: new THREE.Color(col || '#ffffff') }));
      m.position.set(x, 0.08, z);
      scene.add(m);
      fxList.push({ o: m, t: 0, life, kind: 'ring', maxR });
    }
    const textTexCache = {};
    function bubble(i, txt, col, life) {
      const key = txt + '|' + (col || '');
      const tt = textTexCache[key] || (textTexCache[key] = keep(tex(textCanvas(txt, col))));
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tt, transparent: true, depthTest: false, depthWrite: false }));
      sp.scale.set(3.6, 1.35, 1);
      sp.renderOrder = 6;
      scene.add(sp);
      fxList.push({ o: sp, t: 0, life: life || 1.2, kind: 'bubble', k: i });
    }
    const foot = new THREE.Mesh(keep(new THREE.PlaneGeometry(9, 9)), basic(footTex, { transparent: true, depthWrite: false }));
    foot.rotation.x = -Math.PI / 2; foot.visible = false;
    scene.add(foot);

    // ---------- 상태 ----------
    const st = opt.roster.map(() => ({ x: 0, y: 0, h: 0, vis: 0, spinA: 0, hop: 0, lean: 0, f: 0, v: 0, ex: 'n', front: false, hidden: false, sparkT: 0 }));
    const cam = { x: 0, y: 0, z: 0, yaw: 0, init: false, fov: CAM.fov, shake: 0, target: 0 };
    let W = 1; let Hh = 1;
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const v3 = new THREE.Vector3(); const s3 = new THREE.Vector3(1, 1, 1);

    function resize() {
      const r = host.getBoundingClientRect();
      W = Math.max(1, r.width); Hh = Math.max(1, r.height);
      renderer.setSize(W, Hh, false);
      renderer.domElement.style.width = W + 'px'; renderer.domElement.style.height = Hh + 'px';
      camera.aspect = W / Hh;
      camera.updateProjectionMatrix();
    }
    resize();

    // 한 프레임 그리기
    // frame: { dt, t, camIdx, boost, quakeIdx, quakeLeft }
    let time = 0;
    function render(fr) {
      const dt = Math.min(0.05, fr.dt || 0.016);
      time += dt;
      // 카트
      for (let i = 0; i < N; i++) {
        const k = st[i];
        if (k.hidden) { m4.makeScale(0, 0, 0); karts.setMatrixAt(i, m4); shadows.setMatrixAt(i, m4); drivers[i].visible = false; if (tags[i]) tags[i].visible = false; continue; }
        const yaw = -(k.h + k.vis + k.spinA);
        e.set(k.lean * 0.12, yaw, 0, 'YXZ');
        q.setFromEuler(e);
        v3.set(k.x, k.hop, k.y);
        m4.compose(v3, q, s3);
        karts.setMatrixAt(i, m4);
        e.set(0, yaw, 0); q.setFromEuler(e);
        v3.set(k.x, 0.03, k.y);
        m4.compose(v3, q, s3);
        shadows.setMatrixAt(i, m4);
        const d = drivers[i];
        d.visible = true;
        d.position.set(k.x - Math.cos(k.h) * 0.25, 1.55 + k.hop, k.y - Math.sin(k.h) * 0.25);
        d.material.rotation = -k.lean * 0.18;
        // 카메라에서 보면 앞인가 뒤인가
        const dx = k.x - cam.x; const dz = k.y - cam.z;
        const toward = Math.cos(k.h) * dx + Math.sin(k.h) * dz < 0;   // 카트가 카메라 쪽으로 오면 얼굴
        const wantFront = toward || k.front || k.spinA > 0;
        const cell = wantFront ? EXS.indexOf(k.ex === 'back' ? 'n' : k.ex) : 0;
        if (cell !== d.userData.ex) { d.userData.ex = cell; d.userData.t.offset.x = cell / EXS.length; }
        if (tags[i]) { tags[i].visible = true; tags[i].position.set(k.x, 3.25 + k.hop, k.y); }
        // 불꽃 · 먼지
        const dl = k.f & 3; const stage = k.f & 8 ? 2 : k.f & 4 ? 1 : 0;
        k.sparkT -= dt;
        if (dl && k.sparkT <= 0) {
          k.sparkT = 0.016;
          const pal = SPARK[stage];
          const ch = Math.cos(k.h + k.vis); const sh = Math.sin(k.h + k.vis);
          for (let w = -1; w <= 1; w += 2) {
            const bx = k.x - ch * 0.85 - sh * w * 0.8; const bz = k.y - sh * 0.85 + ch * w * 0.8;
            // 바퀴 뒤 빛 덩어리 (단계 색)
            emit(bx, 0.35, bz, 0, 0.2, 0, pal[0], stage === 0 ? 0.9 : stage === 1 ? 1.5 : 1.9, 0.07, 0);
            const n = stage === 0 ? 1 : stage === 1 ? 3 : 4;
            for (let r = 0; r < n; r++) {
              emit(bx, 0.3, bz, -ch * (4 + Math.random() * 4) + (Math.random() - 0.5) * 5, 2.5 + Math.random() * (stage ? 5.5 : 1.5), -sh * (4 + Math.random() * 4) + (Math.random() - 0.5) * 5,
                pal[Math.floor(Math.random() * pal.length)], stage === 0 ? 0.45 : stage === 1 ? 0.8 : 0.95, stage ? 0.45 : 0.3, 14);
            }
          }
        }
        if (k.f & 16) {
          // 부스터: 뒤로 반짝이 꼬리
          if (Math.random() < 0.8) {
            const ch = Math.cos(k.h); const sh = Math.sin(k.h);
            emit(k.x - ch * 1.3, 0.75, k.y - sh * 1.3, -ch * 6 + (Math.random() - 0.5) * 2, 1 + Math.random(), -sh * 6 + (Math.random() - 0.5) * 2,
              ['#FFE27A', '#FF8FC7', '#FFFFFF', '#7DF0AE'][Math.floor(Math.random() * 4)], 0.55, 0.35, 2);
          }
        }
        if (k.f & 64 && Math.random() < 0.3) emit(k.x, 0.4, k.y, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, '#FFC93C', 0.6, 0.5, 6);
      }
      karts.instanceMatrix.needsUpdate = true;
      shadows.instanceMatrix.needsUpdate = true;
      // 풍선 둥실
      balloons.forEach((b) => { if (b.visible) b.position.y = 1.9 + Math.sin(time * 2.2 + b.userData.ph) * 0.25; });
      // 아이템
      items.forEach((it) => {
        if (it.kind === 'spike') it.o.material.rotation -= dt * 9;
        else if (it.o.userData.bee) { it.o.userData.bee.position.set(Math.cos(time * 3 + it.ph) * 1.2, 1.4 + Math.sin(time * 5) * 0.2, Math.sin(time * 3 + it.ph) * 1.2); }
      });
      // 효과
      for (let i = fxList.length - 1; i >= 0; i--) {
        const f = fxList[i];
        f.t += dt;
        const u = f.t / f.life;
        if (u >= 1) { scene.remove(f.o); if (f.o.material && f.kind !== 'keep') f.o.material.dispose(); fxList.splice(i, 1); continue; }
        if (f.kind === 'ring') { const r = f.maxR * (0.2 + 0.8 * Math.sqrt(u)); f.o.scale.set(r * 2, 1, r * 2); f.o.material.opacity = 1 - u; }
        if (f.kind === 'bubble') { const k = st[f.k]; if (k) f.o.position.set(k.x, 4.2 + k.hop + u * 1.4, k.y); f.o.material.opacity = u < 0.75 ? 1 : (1 - u) * 4; const sc2 = u < 0.15 ? 0.6 + u / 0.15 * 0.5 : 1.1 - Math.min(0.1, u); f.o.scale.set(3.6 * sc2, 1.35 * sc2, 1); }
      }
      // 공룡 발자국 (지진 예고) — 1등 카트 위로 점점 커져요
      if (fr.quakeIdx != null && fr.quakeIdx >= 0 && st[fr.quakeIdx]) {
        const k = st[fr.quakeIdx];
        const u = Math.max(0, Math.min(1, 1 - fr.quakeLeft / 2));
        foot.visible = true;
        foot.position.set(k.x + Math.cos(k.h) * 3, 0.06, k.y + Math.sin(k.h) * 3);
        foot.rotation.z = -k.h - Math.PI / 2;
        const sc2 = 0.4 + u * 0.8;
        foot.scale.set(sc2, sc2, 1);
        foot.material.opacity = 0.35 + 0.65 * u * (0.7 + 0.3 * Math.sin(time * 18));
      } else foot.visible = false;
      stepParticles(dt);
      // ---------- 카메라 ----------
      const ck = st[fr.camIdx >= 0 ? fr.camIdx : 0];
      if (ck) {
        const want = ck.h;
        if (!cam.init) { cam.yaw = want; cam.x = ck.x - Math.cos(want) * CAM.dist; cam.z = ck.y - Math.sin(want) * CAM.dist; cam.y = CAM.height; cam.init = true; }
        if (fr.snap) cam.yaw = want;
        cam.yaw += K.wrapA(want - cam.yaw) * (1 - Math.exp(-dt * CAM.yawLag));
        const tx = ck.x - Math.cos(cam.yaw) * CAM.dist; const tz = ck.y - Math.sin(cam.yaw) * CAM.dist;
        const a = fr.snap ? 1 : 1 - Math.exp(-dt * CAM.posLag);
        cam.x += (tx - cam.x) * a; cam.z += (tz - cam.z) * a;
        cam.y += (CAM.height + ck.hop * 0.4 - cam.y) * a;
        cam.shake = Math.max(0, cam.shake - dt);
        const sh = cam.shake > 0 ? CAM.shake * cam.shake * 2 : 0;
        camera.position.set(cam.x + (Math.random() - 0.5) * sh, cam.y + (Math.random() - 0.5) * sh, cam.z + (Math.random() - 0.5) * sh);
        camera.lookAt(ck.x + Math.cos(cam.yaw) * CAM.look, CAM.lookH, ck.y + Math.sin(cam.yaw) * CAM.look);
        const fovT = CAM.fov + (fr.boost ? CAM.boostFov : 0);
        cam.fov += (fovT - cam.fov) * Math.min(1, dt * 4);
        if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
        skyMesh.position.set(camera.position.x, 0, camera.position.z);
        hills.position.x = camera.position.x * 0.9; hills.position.z = camera.position.z * 0.9;
      }
      pMat.uniforms.uScale.value = (Hh * pr) / (2 * Math.tan(camera.fov * Math.PI / 360)) * 0.5;
      renderer.render(scene, camera);
    }

    return {
      CAM, st, cam,
      render, resize,
      setPixelRatio(p) { pr = p; renderer.setPixelRatio(p); resize(); },
      pixelRatio: () => pr,
      info: () => renderer.info.render,
      setBalloons(popped) { balloons.forEach((b, i) => { b.visible = !popped.has(i); }); },
      popBalloon(i) {
        const b = balloons[i]; if (!b) return;
        const cols = ['#FF4757', '#2ED573', '#3D7BFF', '#FFD23F', '#FF6FB5', '#FFFFFF'];
        for (let k = 0; k < 26; k++) emit(b.position.x, b.position.y, b.position.z, (Math.random() - 0.5) * 9, 3 + Math.random() * 6, (Math.random() - 0.5) * 9, cols[k % cols.length], 0.55, 0.8, 9);
      },
      setItems(list, t) {
        const seen = new Set();
        list.forEach((it) => {
          seen.add(it.id);
          let o = items.get(it.id);
          if (!o) { o = itemObj(it.kind); o.ph = Math.random() * 6; items.set(it.id, o); }
          if (o.kind === 'spike') o.o.position.set(it.x, 0.95, it.y); else o.o.position.set(it.x, 0, it.y);
        });
        items.forEach((o, id) => {
          if (seen.has(id)) return;
          scene.remove(o.o);
          o.o.traverse((c) => { if (c.material) c.material.dispose(); });
          items.delete(id);
        });
      },
      boom(x, z, col) {
        addRing(x, z, 6, 0.6, col || '#FFE27A');
        for (let k = 0; k < 20; k++) emit(x, 0.8, z, (Math.random() - 0.5) * 10, 2 + Math.random() * 5, (Math.random() - 0.5) * 10, ['#8E5E40', '#FFE27A', '#FFFFFF'][k % 3], 0.6, 0.7, 10);
      },
      stomp(i) { const k = st[i]; if (!k) return; addRing(k.x, k.y, 14, 0.9, '#FFB066'); addRing(k.x, k.y, 9, 0.6, '#FFFFFF'); for (let j = 0; j < 24; j++) emit(k.x + (Math.random() - 0.5) * 6, 0.3, k.y + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, 3 + Math.random() * 4, (Math.random() - 0.5) * 4, '#E9D2B0', 0.9, 0.9, 9); },
      firework(i) {
        const k = st[i]; if (!k) return;
        const cols = ['#FF4757', '#FFD23F', '#2ED573', '#3D7BFF', '#FF6FB5'];
        for (let j = 0; j < 40; j++) { const a = j / 40 * Math.PI * 2; emit(k.x, 5, k.y, Math.cos(a) * 6, 2 + Math.random() * 2, Math.sin(a) * 6, cols[j % 5], 0.7, 1.0, 5); }
      },
      boostPuff(i) { const k = st[i]; if (!k) return; for (let j = 0; j < 14; j++) emit(k.x, 0.6, k.y, (Math.random() - 0.5) * 6, 1 + Math.random() * 3, (Math.random() - 0.5) * 6, ['#FFFFFF', '#FFE27A', '#FF8FC7'][j % 3], 0.8, 0.5, 4); },
      bubble,
      shake(s) { cam.shake = Math.max(cam.shake, s || 0.4); },
      snapCam() { cam.init = false; },
      destroy() {
        try { renderer.dispose(); } catch (err) { /* 무시 */ }
        disposables.forEach((d) => { try { d.dispose(); } catch (err) { /* 무시 */ } });
        Object.values(textTexCache).forEach((t) => t.dispose());
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        try { renderer.forceContextLoss(); } catch (err) { /* 무시 */ }
      }
    };
  }

  window.KartView = { load, create, CAM, driverSVG, EXS };
})();
