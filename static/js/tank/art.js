/* 노을언덕 포격대 · 그래픽 패스 v3 (측면 일러스트 캐시 · bg_far_v3 원경 · tex_soil/grass 패턴 지형 · 이모티콘)
   - drawTank: tanks_v1 시안 기준 옆에서 본 몽돌(파랑·낮고 둥근 차체·짧고 굵은 포신·전조등·볼트·노란 마커)과
     망루(주황·높고 각진 차체·긴 포신+밴드·안테나 구·센서 다이얼·통풍 그릴).
     차체/트랙/포신은 고해상도(dpr*2) 오프스크린 캔버스에 캐시해 재사용.
   - Terrain: tex_soil_v3·tex_grass_v3 색/질감 기반 seamless createPattern + 윗면 풀 띠/잔디 술/림라이트
     + 섬 아래 뾰족한 흙·늘어진 뿌리 + 그을린 구멍 가장자리(변경 영역만 갱신).
   - sky: static/img/tank/bg_far_v3.jpg 최원경(0.12x) + 시안 색조 구름·바위산 레이어(0.3~0.5x), 로드 전/실패 시 코드 하늘 대체. */
(function () {
  'use strict';
  const TEAM = {
    A: { c: '#2BB673', dark: '#177548', light: '#7CE8B0', mark: '●', shape: 'circle' },
    B: { c: '#E0307A', dark: '#8E1449', light: '#FF85B8', mark: '▲', shape: 'tri' }
  };
  const KIND = {
    mongdol: {
      name: '몽돌', body: '#3B7BE0', dark: '#214A96', deep: '#163269', light: '#7EB4FA', spec: '#C5E1FF',
      ph: 32, pfx: 2, pl: 26, bw: 56, bh: 30, half: 22
    },
    mangru: {
      name: '망루', body: '#F08822', dark: '#B8540D', deep: '#7D3405', light: '#FFBD66', spec: '#FFE2B3',
      ph: 42, pfx: -6, pl: 36, bw: 48, bh: 40, half: 18
    }
  };
  const STAT = {
    mongdol: { hp: 130, speed: 55, r: 44, amin: 0, amax: 50 },
    mangru: { hp: 100, speed: 80, r: 32, amin: 15, amax: 65 }
  };
  const INK = '#1d1530';

  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function makeCv(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return [cv, cv.getContext('2d')];
  }

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------------------------------------------------------------- 탱크 스프라이트 캐시
  const CACHE_SCALE = Math.min(4, Math.max(2, Math.round((window.devicePixelRatio || 1) * 2)));
  const CHASSIS_CACHE = {};
  const TRACK_CACHE = {};
  const BARREL_CACHE = {};
  const MANTLET_CACHE = {};

  function bolt(c, x, y, r) {
    c.fillStyle = '#252834';
    c.beginPath(); c.arc(x, y, r || 1.0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.45)';
    c.beginPath(); c.arc(x - (r || 1) * 0.28, y - (r || 1) * 0.28, (r || 1) * 0.42, 0, Math.PI * 2); c.fill();
  }

  function drawFlag(c, x, top, team) {
    const T = TEAM[team];
    if (!T) return;
    c.save();
    c.strokeStyle = INK; c.lineWidth = 2.0; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, top + 16); c.lineTo(x, top - 14); c.stroke();
    c.fillStyle = '#d4dae4';
    c.beginPath(); c.arc(x, top - 15, 1.8, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.2; c.stroke();
    // 팀 깃발 펄럭임
    c.fillStyle = T.c;
    c.beginPath();
    c.moveTo(x, top - 13);
    c.quadraticCurveTo(x - 8, top - 15, x - 16, top - 8);
    c.quadraticCurveTo(x - 8, top - 3, x, top - 2);
    c.closePath();
    c.fill();
    c.fillStyle = T.dark;
    c.beginPath();
    c.moveTo(x, top - 5.5);
    c.quadraticCurveTo(x - 7, top - 5.5, x - 14, top - 8);
    c.quadraticCurveTo(x - 7, top - 3, x, top - 2);
    c.closePath();
    c.fill();
    c.strokeStyle = INK; c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(x, top - 13);
    c.quadraticCurveTo(x - 8, top - 15, x - 16, top - 8);
    c.quadraticCurveTo(x - 8, top - 3, x, top - 2);
    c.closePath();
    c.stroke();
    // 팀 심볼
    c.fillStyle = '#fff';
    if (T.shape === 'circle') {
      c.beginPath(); c.arc(x - 6.5, top - 8, 2.3, 0, Math.PI * 2); c.fill();
    } else {
      c.beginPath(); c.moveTo(x - 6.5, top - 10.6); c.lineTo(x - 4.0, top - 5.6); c.lineTo(x - 9.0, top - 5.6); c.closePath(); c.fill();
    }
    c.restore();
  }

  // 트랙 + 회전 바퀴 프레임 (0..7)
  function getTrackFrame(kind, frameIdx) {
    const key = kind + '_' + frameIdx;
    if (TRACK_CACHE[key]) return TRACK_CACHE[key];
    const isM = kind === 'mongdol';
    const x0 = isM ? -30.5 : -26.5;
    const x1 = isM ? 30.5 : 26.5;
    const h = 11.5;
    const pad = 4;
    const lw = (x1 - x0) + pad * 2;
    const lh = h + pad * 2;
    const [cv, c] = makeCv(Math.ceil(lw * CACHE_SCALE), Math.ceil(lh * CACHE_SCALE));
    c.scale(CACHE_SCALE, CACHE_SCALE);
    c.translate(-x0 + pad, h + pad);

    const ph = frameIdx / 8;
    // 외곽 트랙 벨트
    c.fillStyle = '#2d313b';
    rr(c, x0, -h, x1 - x0, h, h / 2);
    c.fill();
    // 트랙 안쪽 어두운 홈
    c.fillStyle = '#1b1e26';
    rr(c, x0 + 2, -h + 2, x1 - x0 - 4, h - 4, (h - 4) / 2);
    c.fill();

    // 트랙 링크 마디 (위/아래/둥근 끝)
    c.save();
    rr(c, x0 - 0.5, -h - 0.5, x1 - x0 + 1, h + 1, h / 2 + 0.5);
    c.clip();
    const step = 5.0;
    const off = ph * step;
    c.fillStyle = '#4f5563';
    for (let x = x0 - step + off; x < x1 + step; x += step) {
      c.fillRect(x, -h, 2.5, 2.2);
      c.fillRect(x + step * 0.5, -2.2, 2.5, 2.2);
    }
    c.restore();

    // 트랙 벨트 두꺼운 외곽선
    c.lineWidth = 2.2;
    c.strokeStyle = INK;
    rr(c, x0, -h, x1 - x0, h, h / 2);
    c.stroke();

    // 로드 휠 (몽돌 4개, 망루 5개 — tanks_v1 시안)
    const wheelN = isM ? 4 : 5;
    const span = (x1 - x0 - h - 2);
    const wy = -h / 2;
    const wr = isM ? 4.4 : 4.0;
    for (let i = 0; i < wheelN; i++) {
      const wx = x0 + h / 2 + 1 + (wheelN === 1 ? span / 2 : span * i / (wheelN - 1));
      // 타이어 림
      c.fillStyle = '#474c59';
      c.beginPath(); c.arc(wx, wy, wr, 0, Math.PI * 2); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = INK; c.stroke();
      // 안쪽 메탈 휠
      c.fillStyle = '#7c8394';
      c.beginPath(); c.arc(wx, wy, wr * 0.68, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#a3aab8';
      c.beginPath(); c.arc(wx - wr * 0.14, wy - wr * 0.14, wr * 0.48, 0, Math.PI * 2); c.fill();
      // 회전 살 (2개 직교)
      const ang = ph * Math.PI + i * 0.55;
      c.strokeStyle = '#383d48'; c.lineWidth = 1.25; c.lineCap = 'round';
      for (let s = 0; s < 2; s++) {
        const a = ang + s * Math.PI / 2;
        c.beginPath();
        c.moveTo(wx + Math.cos(a) * wr * 0.62, wy + Math.sin(a) * wr * 0.62);
        c.lineTo(wx - Math.cos(a) * wr * 0.62, wy - Math.sin(a) * wr * 0.62);
        c.stroke();
      }
      // 중앙 허브 캡
      c.fillStyle = '#454a56';
      c.beginPath(); c.arc(wx, wy, wr * 0.28, 0, Math.PI * 2); c.fill();
      c.lineWidth = 1.0; c.strokeStyle = INK; c.stroke();
    }

    const res = { cv, x: x0 - pad, y: -h - pad, w: lw, h: lh };
    TRACK_CACHE[key] = res;
    return res;
  }

  // 포신 스프라이트 캐시 (팀 외곽선 / 본체)
  function getBarrelSprite(kind, team, isOutline) {
    const key = kind + '_' + (isOutline ? 'out_' + team : 'main');
    if (BARREL_CACHE[key]) return BARREL_CACHE[key];
    const K = KIND[kind];
    const pad = 10;
    const lx = -10, ly = -12, lw = K.pl + 22, lh = 24;
    const [cv, c] = makeCv(Math.ceil(lw * CACHE_SCALE), Math.ceil(lh * CACHE_SCALE));
    c.scale(CACHE_SCALE, CACHE_SCALE);
    c.translate(-lx, -ly);

    if (isOutline) {
      const T = TEAM[team];
      c.fillStyle = T.c;
      c.strokeStyle = T.c;
      c.lineWidth = 5.5;
      c.lineJoin = 'round';
      if (kind === 'mongdol') {
        rr(c, -4, -6.2, K.pl + 5.5, 12.4, 4); c.fill(); c.stroke();
      } else {
        rr(c, -4, -5.2, K.pl + 7, 10.4, 3.5); c.fill(); c.stroke();
      }
    } else if (kind === 'mongdol') {
      // 몽돌: 짧고 굵은 파란 포신 + 단차 + 두꺼운 회색 포구 링 + 주황 포구 안쪽
      // 포신 기저
      c.fillStyle = K.body;
      rr(c, -3, -5.2, K.pl - 5, 10.4, 3.2); c.fill();
      // 2단 셀 셰이딩 (아래 어두운 면 + 위 밝은 면)
      c.fillStyle = K.dark;
      rr(c, -2, 0.8, K.pl - 6, 4.2, 1.8); c.fill();
      c.fillStyle = K.light;
      rr(c, -1, -4.5, K.pl - 8, 2.6, 1.2); c.fill();
      c.fillStyle = K.spec;
      rr(c, 1, -4.2, K.pl - 12, 1.1, 0.5); c.fill();
      c.lineWidth = 2.2; c.strokeStyle = INK;
      rr(c, -3, -5.2, K.pl - 5, 10.4, 3.2); c.stroke();
      // 중간 링
      c.fillStyle = '#5f6675';
      rr(c, 6, -5.8, 4.2, 11.6, 1.5); c.fill();
      c.fillStyle = '#9aa2b2';
      rr(c, 6.6, -5.2, 3.0, 3.2, 1); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.8;
      rr(c, 6, -5.8, 4.2, 11.6, 1.5); c.stroke();
      // 포구 링 (총구 브레이크)
      c.fillStyle = '#626877';
      rr(c, K.pl - 9.5, -6.6, 11, 13.2, 2.8); c.fill();
      c.fillStyle = '#3b404b';
      rr(c, K.pl - 8.5, 1.4, 9, 4.6, 1.5); c.fill();
      c.fillStyle = '#9fa7b8';
      rr(c, K.pl - 8.5, -5.8, 9, 3.2, 1.2); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2.2;
      rr(c, K.pl - 9.5, -6.6, 11, 13.2, 2.8); c.stroke();
      // 포구 구멍 (주황 불빛 포인트)
      c.fillStyle = '#1b1d24';
      c.beginPath(); c.ellipse(K.pl + 1.2, 0, 2.3, 4.4, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ff8a2a';
      c.beginPath(); c.ellipse(K.pl + 1.0, 0, 1.5, 3.1, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.4;
      c.beginPath(); c.ellipse(K.pl + 1.2, 0, 2.3, 4.4, 0, 0, Math.PI * 2); c.stroke();
    } else {
      // 망루: 긴 주황 포신 + 2단 포신 밴드 + 회색 포구 링
      c.fillStyle = K.body;
      c.beginPath();
      c.moveTo(-3, -4.6); c.lineTo(K.pl - 4, -3.7);
      c.lineTo(K.pl - 4, 3.7); c.lineTo(-3, 4.6);
      c.closePath(); c.fill();
      // 아래 어두운 면
      c.fillStyle = K.dark;
      c.beginPath();
      c.moveTo(-3, 0.8); c.lineTo(K.pl - 4, 0.6);
      c.lineTo(K.pl - 4, 3.7); c.lineTo(-3, 4.6);
      c.closePath(); c.fill();
      // 위 밝은 면
      c.fillStyle = K.light;
      c.beginPath();
      c.moveTo(-2, -4.0); c.lineTo(K.pl - 5, -3.2);
      c.lineTo(K.pl - 5, -1.2); c.lineTo(-2, -1.6);
      c.closePath(); c.fill();
      // 외곽선
      c.lineWidth = 2.2; c.strokeStyle = INK;
      c.beginPath();
      c.moveTo(-3, -4.6); c.lineTo(K.pl - 4, -3.7);
      c.lineTo(K.pl - 4, 3.7); c.lineTo(-3, 4.6);
      c.closePath(); c.stroke();
      // 포신 보강 밴드 2개
      const bands = [7, K.pl - 15];
      for (const bx of bands) {
        c.fillStyle = '#5e6472';
        rr(c, bx, -5.2, 4.6, 10.4, 1.5); c.fill();
        c.fillStyle = '#9aa1b2';
        rr(c, bx + 0.5, -4.7, 3.6, 2.6, 0.8); c.fill();
        c.fillStyle = '#383c47';
        rr(c, bx + 0.5, 1.6, 3.6, 3.0, 0.8); c.fill();
        c.strokeStyle = INK; c.lineWidth = 1.7;
        rr(c, bx, -5.2, 4.6, 10.4, 1.5); c.stroke();
      }
      // 포구 링
      c.fillStyle = '#626877';
      rr(c, K.pl - 6.5, -5.6, 9.5, 11.2, 2.4); c.fill();
      c.fillStyle = '#9ea6b7';
      rr(c, K.pl - 5.8, -5.0, 8.0, 2.8, 1); c.fill();
      c.fillStyle = '#393e49';
      rr(c, K.pl - 5.8, 1.4, 8.0, 3.6, 1); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2.1;
      rr(c, K.pl - 6.5, -5.6, 9.5, 11.2, 2.4); c.stroke();
      // 어두운 포구 구멍
      c.fillStyle = '#181a22';
      c.beginPath(); c.ellipse(K.pl + 2.6, 0, 1.9, 3.6, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.3;
      c.stroke();
    }

    const res = { cv, x: lx, y: ly, w: lw, h: lh };
    BARREL_CACHE[key] = res;
    return res;
  }

  // 차체(포신·바퀴·표정 제외) 정적 스프라이트 캐시
  // 판정 크기 준수: mongdol bw=56, bh=30 (±15%: w<=64.4, h<=34.5) / mangru bw=48, bh=40 (±15%: w<=55.2, h<=46)
  function getChassisSprite(kind, team, outline) {
    const key = kind + '_' + (team || 'N') + '_' + (outline ? 1 : 0);
    if (CHASSIS_CACHE[key]) return CHASSIS_CACHE[key];
    const K = KIND[kind];
    const lx = -44, ly = -74, lw = 88, lh = 84;
    const [cv, c] = makeCv(Math.ceil(lw * CACHE_SCALE), Math.ceil(lh * CACHE_SCALE));
    c.scale(CACHE_SCALE, CACHE_SCALE);
    c.translate(-lx, -ly);

    // 1) 팀 외곽 링/실루엣 (기종 색과 분리)
    if (team && outline) {
      const T = TEAM[team];
      c.save();
      c.fillStyle = T.c;
      c.strokeStyle = T.c;
      c.lineWidth = 5.4;
      c.lineJoin = 'round';
      if (kind === 'mongdol') {
        rr(c, -30.5, -11.5, 61, 11.5, 5.7); c.fill(); c.stroke();
        rr(c, -29, -25, 56, 16, 8); c.fill(); c.stroke();
        rr(c, -20, -34, 34, 14, 7); c.fill(); c.stroke();
      } else {
        rr(c, -26.5, -11.5, 53, 11.5, 5.7); c.fill(); c.stroke();
        rr(c, -25, -33, 49, 23, 6); c.fill(); c.stroke();
        rr(c, -22, -45, 32, 16, 5); c.fill(); c.stroke();
      }
      c.restore();
    }

    if (kind === 'mongdol') {
      // 깃발 (뒤쪽)
      drawFlag(c, -23, -34, team);

      // 트랙 위 진한 그림자 받침
      c.fillStyle = '#252936';
      rr(c, -29, -14, 58, 6, 3); c.fill();

      // 후방 배기/장비 팩
      c.fillStyle = '#5b6170';
      rr(c, -24.5, -30, 7, 9, 2.2); c.fill();
      c.fillStyle = '#3c414d';
      rr(c, -24.5, -24, 7, 3, 1); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.8;
      rr(c, -24.5, -30, 7, 9, 2.2); c.stroke();

      // 메인 장갑 차체 (둥글고 낮은 차체: -29..27, -25..-9)
      c.fillStyle = K.body;
      rr(c, -29, -25, 56, 16.5, 8); c.fill();
      // 아래쪽 셀 셰이딩 어두운 면
      c.save();
      rr(c, -29, -25, 56, 16.5, 8); c.clip();
      c.fillStyle = K.dark;
      c.fillRect(-29, -14.5, 56, 7);
      c.fillStyle = K.deep;
      c.fillRect(-29, -11.5, 22, 4);
      // 윗면 밝은 셀 하이라이트
      c.fillStyle = K.light;
      rr(c, -25, -24.5, 46, 4.5, 2.2); c.fill();
      c.fillStyle = K.spec;
      rr(c, -18, -24.0, 26, 1.5, 0.8); c.fill();
      c.restore();
      // 차체 외곽선
      c.lineWidth = 2.4; c.strokeStyle = INK;
      rr(c, -29, -25, 56, 16.5, 8); c.stroke();

      // 트랙 커버 펜더 (파랑 앞뒤 펜더)
      c.fillStyle = K.body;
      rr(c, -30.5, -13.5, 16, 4.5, 2.2); c.fill();
      c.fillStyle = K.light;
      rr(c, -29.5, -13.2, 14, 1.6, 0.8); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.8;
      rr(c, -30.5, -13.5, 16, 4.5, 2.2); c.stroke();

      c.fillStyle = K.body;
      rr(c, 15, -13.5, 15.5, 4.5, 2.2); c.fill();
      c.fillStyle = K.light;
      rr(c, 16, -13.2, 13, 1.6, 0.8); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.8;
      rr(c, 15, -13.5, 15.5, 4.5, 2.2); c.stroke();

      // 몽돌 전조등 (앞 펜더 노란 불빛 + 하우징)
      c.fillStyle = '#484d59';
      rr(c, 22.5, -16.5, 7, 4.5, 1.5); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke();
      c.fillStyle = '#FFD84D';
      rr(c, 25.5, -15.8, 3.6, 3.1, 1); c.fill();
      c.fillStyle = '#fff9c4';
      c.fillRect(26.2, -15.4, 2.0, 1.1);

      // 앞쪽 회색 범퍼 장갑판 + 볼트 (tanks_v1 시안)
      c.fillStyle = '#6c7382';
      rr(c, 18, -12, 10, 6.2, 2); c.fill();
      c.fillStyle = '#9aa1b2';
      rr(c, 18.8, -11.4, 8.4, 1.8, 0.8); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.6;
      rr(c, 18, -12, 10, 6.2, 2); c.stroke();
      bolt(c, 20.2, -9.2, 0.85); bolt(c, 25.8, -9.2, 0.85);

      // 측면 회색 장갑판 + 노란 삼각 마커 + 볼트
      c.fillStyle = '#686e7d';
      rr(c, -21, -21.5, 15.5, 9.5, 2.4); c.fill();
      c.fillStyle = '#4a4f5c';
      rr(c, -20.5, -14.8, 14.5, 2.5, 1); c.fill();
      c.fillStyle = '#939aab';
      rr(c, -20, -21, 13.5, 2, 1); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.7;
      rr(c, -21, -21.5, 15.5, 9.5, 2.4); c.stroke();
      // 노란 경고 삼각 마커
      c.fillStyle = '#FFD23F';
      c.beginPath(); c.moveTo(-13.2, -19.2); c.lineTo(-9.6, -14.0); c.lineTo(-16.8, -14.0); c.closePath(); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.1; c.stroke();
      bolt(c, -19, -19.5, 0.75); bolt(c, -7.5, -19.5, 0.75); bolt(c, -19, -13.6, 0.75);

      // 장갑판 이음선 & 볼트
      c.strokeStyle = K.deep; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-4, -24.2); c.lineTo(-4, -10); c.stroke();
      bolt(c, -2, -22.8, 0.8); bolt(c, 21.5, -21.5, 0.8); bolt(c, -25.5, -17.5, 0.8);

      // 포탑 돔 (-20..14, -34..-22, 전체 높이 34px <= 30*1.15)
      c.fillStyle = K.body;
      rr(c, -20, -34, 34, 13, 6.2); c.fill();
      c.save();
      rr(c, -20, -34, 34, 13, 6.2); c.clip();
      c.fillStyle = K.dark;
      c.fillRect(-20, -25.5, 34, 5);
      c.fillStyle = K.light;
      rr(c, -17, -33.5, 27, 3.6, 1.8); c.fill();
      c.fillStyle = K.spec;
      rr(c, -13, -33.0, 16, 1.3, 0.6); c.fill();
      c.restore();
      c.lineWidth = 2.3; c.strokeStyle = INK;
      rr(c, -20, -34, 34, 13, 6.2); c.stroke();
      // 포탑 상단 해치 & 측면 패널
      c.fillStyle = K.dark;
      rr(c, -14, -34.2, 11, 3.2, 1.4); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#5a6170';
      rr(c, -15, -29.5, 9.5, 6, 1.8); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke();
      bolt(c, -13.2, -27.8, 0.7); bolt(c, -7.2, -27.8, 0.7);
      bolt(c, 9.5, -28.5, 0.8);

      // 노란 측면 마커 (차체 앞쪽)
      c.fillStyle = '#FFD23F';
      rr(c, 19.5, -20.5, 4.8, 3.2, 1); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.1; c.stroke();
    } else {
      // 망루 (높고 각진 주황 차체: w=53 <= 48*1.15, h=45 <= 40*1.15)
      drawFlag(c, -23, -36, team);

      // 안테나 (뒤쪽 상단: 예외 항목) + 노란 구
      c.strokeStyle = INK; c.lineWidth = 2.0; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-15, -45); c.lineTo(-15, -63); c.stroke();
      c.fillStyle = '#5d6473';
      rr(c, -17.5, -47.5, 5, 3.5, 1); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.4; c.stroke();
      c.fillStyle = '#FFD23F';
      c.beginPath(); c.arc(-15, -64.2, 3.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff8bf';
      c.beginPath(); c.arc(-16.0, -65.2, 1.1, 0, Math.PI * 2); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.5;
      c.beginPath(); c.arc(-15, -64.2, 3.3, 0, Math.PI * 2); c.stroke();

      // 센서 다이얼 (포탑 위 원형 계기판)
      c.strokeStyle = INK; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(-2, -44); c.lineTo(-2, -48.5); c.stroke();
      c.fillStyle = '#6c7382';
      c.beginPath(); c.arc(-2, -50.2, 3.6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#f5efe0';
      c.beginPath(); c.arc(-2, -50.2, 2.2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#c43b2b'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(-2, -50.2); c.lineTo(-0.5, -51.7); c.stroke();

      // 트랙 위 받침 그림자
      c.fillStyle = '#252936';
      rr(c, -25.5, -14, 51, 5.5, 2.5); c.fill();

      // 메인 각진 차체 (-25..24, -33..-10)
      c.fillStyle = K.body;
      c.beginPath();
      c.moveTo(-25, -10.5); c.lineTo(-25, -28); c.lineTo(-21, -33);
      c.lineTo(6, -33); c.lineTo(14, -26); c.lineTo(23.5, -23.5);
      c.lineTo(24.5, -13); c.lineTo(22, -10.5);
      c.closePath(); c.fill();

      // 셀 셰이딩 (아래·뒤 어두운 면 + 윗모서리 밝은 면)
      c.save();
      c.clip();
      c.fillStyle = K.dark;
      c.fillRect(-25, -16.5, 50, 7);
      c.fillStyle = K.deep;
      c.fillRect(-25, -33, 8, 23);
      c.fillStyle = K.light;
      c.beginPath();
      c.moveTo(-22, -32.5); c.lineTo(5.5, -32.5); c.lineTo(13.5, -25.5);
      c.lineTo(23, -23); c.lineTo(23, -20.5); c.lineTo(12, -23);
      c.lineTo(4.5, -29.5); c.lineTo(-22, -29.5);
      c.closePath(); c.fill();
      c.fillStyle = K.spec;
      c.fillRect(-14, -32.2, 16, 1.3);
      c.restore();

      // 차체 외곽선
      c.lineWidth = 2.4; c.strokeStyle = INK; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(-25, -10.5); c.lineTo(-25, -28); c.lineTo(-21, -33);
      c.lineTo(6, -33); c.lineTo(14, -26); c.lineTo(23.5, -23.5);
      c.lineTo(24.5, -13); c.lineTo(22, -10.5);
      c.closePath(); c.stroke();

      // 앞/뒤 계단식 펜더 + 노란 마커
      c.fillStyle = K.dark;
      rr(c, -26.5, -15, 53, 5.2, 2); c.fill();
      c.fillStyle = K.light;
      rr(c, -25.5, -14.6, 51, 1.6, 0.8); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.8;
      rr(c, -26.5, -15, 53, 5.2, 2); c.stroke();

      // 노란 마커들 (앞 펜더 & 옆면)
      c.fillStyle = '#FFD23F';
      rr(c, 19.5, -14.2, 5.2, 3.4, 1); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.1; c.stroke();
      c.fillStyle = '#FFD23F';
      rr(c, -14, -14.0, 6.2, 3.0, 0.8); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.0; c.stroke();

      // 장갑판 이음선 & 볼트
      c.strokeStyle = K.deep; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-2, -32.5); c.lineTo(-2, -15.5); c.stroke();
      bolt(c, -22, -29.5, 0.8); bolt(c, -4, -30.5, 0.8); bolt(c, 19.5, -21, 0.8);
      bolt(c, -23, -12.5, 0.75); bolt(c, 15, -12.5, 0.75);

      // 상단 포탑 블록 (-22..10, -45..-31, 높이 45px <= 40*1.15)
      c.fillStyle = K.body;
      c.beginPath();
      c.moveTo(-22, -31); c.lineTo(-20, -43); c.lineTo(-16, -45);
      c.lineTo(5, -45); c.lineTo(10, -39); c.lineTo(10, -31);
      c.closePath(); c.fill();
      c.save(); c.clip();
      c.fillStyle = K.dark; c.fillRect(-22, -35, 32, 4.5);
      c.fillStyle = K.light; c.fillRect(-18, -44.6, 23, 2.8);
      c.fillStyle = K.spec; c.fillRect(-14, -44.2, 14, 1.2);
      c.restore();
      c.lineWidth = 2.3; c.strokeStyle = INK;
      c.beginPath();
      c.moveTo(-22, -31); c.lineTo(-20, -43); c.lineTo(-16, -45);
      c.lineTo(5, -45); c.lineTo(10, -39); c.lineTo(10, -31);
      c.closePath(); c.stroke();

      // 통풍 그릴 (측면 회색 루버 그릴 — tanks_v1 시안)
      c.fillStyle = '#686f7d';
      rr(c, -18, -32.5, 13, 10, 2); c.fill();
      c.fillStyle = '#9aa1b0';
      rr(c, -17.2, -32, 11.4, 2, 0.8); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.6;
      rr(c, -18, -32.5, 13, 10, 2); c.stroke();
      c.strokeStyle = '#242730'; c.lineWidth = 1.5; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const gy = -29.2 + i * 2.6;
        c.beginPath(); c.moveTo(-15.5, gy); c.lineTo(-7.5, gy); c.stroke();
      }
      // 후방 작은 보조 그릴
      c.fillStyle = '#5c6270';
      rr(c, -19, -41.5, 7.5, 5.5, 1.4); c.fill();
      c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke();
      c.strokeStyle = '#242730'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(-17.5, -39.5); c.lineTo(-13, -39.5); c.moveTo(-17.5, -37.8); c.lineTo(-13, -37.8); c.stroke();
      bolt(c, 5.5, -42, 0.75);
    }

    const res = { cv, x: lx, y: ly, w: lw, h: lh };
    CHASSIS_CACHE[key] = res;
    return res;
  }

  // 포신 연결 마운트 캡 (차체와 포신 이음새 정리)
  function getMantletSprite(kind) {
    if (MANTLET_CACHE[kind]) return MANTLET_CACHE[kind];
    const r = kind === 'mongdol' ? 6.2 : 5.8;
    const sz = 20;
    const [cv, c] = makeCv(Math.ceil(sz * CACHE_SCALE), Math.ceil(sz * CACHE_SCALE));
    c.scale(CACHE_SCALE, CACHE_SCALE);
    c.translate(sz / 2, sz / 2);
    c.fillStyle = '#5c6270';
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9aa1b2';
    c.beginPath(); c.arc(-r * 0.22, -r * 0.25, r * 0.55, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#3a3f4a';
    c.beginPath(); c.arc(0, 0, r * 0.42, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.8; c.strokeStyle = INK;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
    const res = { cv, x: -sz / 2, y: -sz / 2, w: sz, h: sz };
    MANTLET_CACHE[kind] = res;
    return res;
  }

  // ---------------------------------------------------------------- 표정 & 전환 (기본 · 웃음 · 아픔 + 눈 깜빡)
  function drawEyesAt(c, ex, ey, r, f, gap, irisCol, squishY) {
    for (let k = 0; k < 2; k++) {
      const x = ex + k * gap;
      c.save();
      c.translate(x, ey);
      if (squishY < 0.99) c.scale(1 + (1 - squishY) * 0.12, squishY);
      if (f === 1 || squishY <= 0.18) {
        // 웃음 또는 깜빡임 감은 눈 ^ ^
        c.strokeStyle = INK; c.lineWidth = 2.4; c.lineCap = 'round';
        c.beginPath();
        if (f === 1) {
          c.moveTo(-r * 0.85, r * 0.28);
          c.quadraticCurveTo(0, -r * 0.95, r * 0.85, r * 0.28);
        } else {
          c.moveTo(-r * 0.85, 0);
          c.quadraticCurveTo(0, r * 0.35, r * 0.85, 0);
        }
        c.stroke();
      } else if (f === 2) {
        // 아픔 > <
        c.strokeStyle = INK; c.lineWidth = 2.3; c.lineCap = 'round'; c.lineJoin = 'round';
        const s = k === 0 ? 1 : -1;
        c.beginPath();
        c.moveTo(-r * 0.55 * s, -r * 0.52);
        c.lineTo(r * 0.48 * s, 0);
        c.lineTo(-r * 0.55 * s, r * 0.52);
        c.stroke();
      } else {
        // 기본: 반짝이는 큰 눈 (흰자 + 그라데이션 홍채 + 동공 + 이중 하이라이트)
        c.fillStyle = '#fff';
        c.beginPath(); c.ellipse(0, 0, r * 0.88, r, 0, 0, Math.PI * 2); c.fill();
        c.lineWidth = 1.7; c.strokeStyle = INK; c.stroke();
        // 홍채
        c.fillStyle = irisCol;
        c.beginPath(); c.arc(r * 0.18, r * 0.08, r * 0.62, 0, Math.PI * 2); c.fill();
        // 동공
        c.fillStyle = '#11101d';
        c.beginPath(); c.arc(r * 0.22, r * 0.12, r * 0.36, 0, Math.PI * 2); c.fill();
        // 큰 반짝임 + 작은 반짝임
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(-r * 0.04, -r * 0.28, r * 0.25, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(r * 0.42, r * 0.32, r * 0.12, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
  }

  function drawMouthAt(c, x, y, w, f) {
    c.save();
    c.strokeStyle = INK; c.lineWidth = 1.9; c.lineCap = 'round'; c.lineJoin = 'round';
    if (f === 1) {
      c.fillStyle = '#7a1f2c';
      c.beginPath();
      c.moveTo(x - w, y - 0.8);
      c.quadraticCurveTo(x, y + w * 1.35, x + w, y - 0.8);
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ff8598';
      c.beginPath(); c.ellipse(x, y + w * 0.45, w * 0.42, w * 0.22, 0, 0, Math.PI * 2); c.fill();
    } else if (f === 2) {
      c.beginPath();
      c.moveTo(x - w, y + 0.8);
      for (let i = 1; i <= 4; i++) c.lineTo(x - w + i * w / 2, y + (i % 2 ? -1.8 : 1.5));
      c.stroke();
    } else {
      c.beginPath();
      c.moveTo(x - w * 0.72, y);
      c.quadraticCurveTo(x, y + w * 0.72, x + w * 0.72, y);
      c.stroke();
    }
    c.restore();
  }

  function drawSweat(c, x, y) {
    c.save();
    c.fillStyle = '#9fdcff'; c.strokeStyle = INK; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x, y - 5.5);
    c.quadraticCurveTo(x + 3.6, y, x, y + 2.8);
    c.quadraticCurveTo(x - 3.6, y, x, y - 5.5);
    c.fill(); c.stroke();
    c.restore();
  }

  /* o: {kind, face(1/-1), bt(도), a(포신 도), f(표정 0/1/2), fPrev, fLerp, blink, phase, team, alpha, recoil, outline, shield} */
  function drawTank(c, x, y, o) {
    const kind = o.kind === 'mangru' ? 'mangru' : 'mongdol';
    const K = KIND[kind];
    c.save();
    c.translate(x, y);
    c.scale(o.face < 0 ? -1 : 1, 1);
    c.rotate(-(o.bt || 0) * Math.PI / 180);
    if (o.alpha != null) c.globalAlpha *= o.alpha;

    const a = o.a || 0;
    const recoil = o.recoil || 0;
    const ph = (((o.phase || 0) % 1) + 1) % 1;
    const trIdx = Math.floor(ph * 8) & 7;
    const team = o.team;
    const hasOutline = !!(team && o.outline !== false);

    // 1) 팀 색 포신 외곽선 (뒤쪽)
    if (hasOutline) {
      const bo = getBarrelSprite(kind, team, true);
      c.save();
      c.translate(K.pfx, -K.ph);
      c.rotate(-a * Math.PI / 180);
      c.translate(-recoil, 0);
      c.drawImage(bo.cv, bo.x, bo.y, bo.w, bo.h);
      c.restore();
    }

    // 2) 캐시된 차체 스프라이트
    const ch = getChassisSprite(kind, team, hasOutline);
    c.drawImage(ch.cv, ch.x, ch.y, ch.w, ch.h);

    // 3) 캐시된 회전 트랙 + 바퀴 프레임
    const tr = getTrackFrame(kind, trIdx);
    c.drawImage(tr.cv, tr.x, tr.y, tr.w, tr.h);

    // 4) 캐시된 포신 (각도 회전 + 반동) + 연결 마운트 캡
    const br = getBarrelSprite(kind, team, false);
    c.save();
    c.translate(K.pfx, -K.ph);
    c.rotate(-a * Math.PI / 180);
    c.translate(-recoil, 0);
    c.drawImage(br.cv, br.x, br.y, br.w, br.h);
    c.restore();

    const mt = getMantletSprite(kind);
    c.drawImage(mt.cv, K.pfx + mt.x, -K.ph + mt.y, mt.w, mt.h);

    // 5) 표정 + 짧은 전환 보간 + 깜빡임
    const fTarget = o.f | 0;
    let fShow = fTarget;
    let squishY = 1;
    if (o.fLerp != null && o.fLerp < 1 && o.fPrev != null && o.fPrev !== fTarget) {
      if (o.fLerp < 0.45) {
        fShow = o.fPrev | 0;
        squishY = Math.max(0.12, 1 - (o.fLerp / 0.45) * 0.88);
      } else {
        fShow = fTarget;
        squishY = Math.min(1, 0.12 + ((o.fLerp - 0.45) / 0.55) * 0.88);
      }
    } else if (o.blink && fTarget === 0) {
      squishY = 0.14;
    }

    if (kind === 'mongdol') {
      drawEyesAt(c, 5.2, -17.5, 4.4, fShow, 10.6, '#2366c4', squishY);
      drawMouthAt(c, 10.5, -12.0, fShow === 0 ? 2.5 : 3.2, fShow);
      if (fShow === 2) drawSweat(c, -2, -28);
      c.save();
      c.fillStyle = '#FFB0B8'; c.globalAlpha *= 0.55;
      c.beginPath(); c.ellipse(19.5, -13.0, 2.3, 1.4, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    } else {
      drawEyesAt(c, 5.8, -21.5, 4.0, fShow, 10.0, '#9e4c14', squishY);
      drawMouthAt(c, 10.8, -16.2, fShow === 0 ? 2.6 : 3.1, fShow);
      if (fShow === 2) drawSweat(c, -1, -35);
      c.save();
      c.fillStyle = '#FF9C8A'; c.globalAlpha *= 0.45;
      c.beginPath(); c.ellipse(18.8, -17.2, 2.1, 1.3, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }

    // 6) 스폰 무적 방패
    if (o.shield) {
      c.globalAlpha = 0.48 + 0.3 * Math.sin(performance.now() / 90);
      c.strokeStyle = '#bff3ff'; c.lineWidth = 2.8;
      c.beginPath();
      c.ellipse(0, -K.bh / 2 - 4, K.bw / 2 + 10, K.bh / 2 + 14, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  function tomb(c, x, y, team) {
    c.save(); c.translate(x, y);
    c.fillStyle = '#8b92a1'; c.strokeStyle = INK; c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(-9, 0); c.lineTo(-9, -16); c.arc(0, -16, 9, Math.PI, 0); c.lineTo(9, 0);
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#b4bac6';
    c.beginPath(); c.arc(-2, -16, 4, Math.PI, 0); c.fill();
    c.strokeStyle = TEAM[team] ? TEAM[team].c : INK; c.lineWidth = 2.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -21); c.lineTo(0, -8); c.moveTo(-5, -16); c.lineTo(5, -16); c.stroke();
    c.restore();
  }

  // 대기실 아이콘(줄 · 기종 선택 버튼)
  function icon(canvas, kind, team, f) {
    const c = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || canvas.width || 60;
    const h = canvas.clientHeight || canvas.height || 36;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw, ph);
    const s = Math.min(ph / 68, pw / 98);
    c.setTransform(s, 0, 0, s, pw * 0.43, ph - 5 * s);
    drawTank(c, 0, 0, { kind, face: 1, bt: 0, a: kind === 'mongdol' ? 22 : 38, f: f || 0, team, outline: !!team });
  }

  // ---------------------------------------------------------------- 지형 패턴 (tex_soil_v3 / tex_grass_v3 맞춤)
  let SOIL_TILE = null;
  let GRASS_TILE = null;

  function ensureTerrainPatterns() {
    if (!SOIL_TILE) {
      const S = 256;
      const [cv, c] = makeCv(S, S);
      // tex_soil_v3 색감 기반 진한 밤색·적갈색 흙 바탕
      c.fillStyle = '#563120';
      c.fillRect(0, 0, S, S);
      const r = rng(307);

      const drawWrapped = (fn) => {
        for (let dy = -S; dy <= S; dy += S) {
          for (let dx = -S; dx <= S; dx += S) {
            c.save(); c.translate(dx, dy); fn(); c.restore();
          }
        }
      };

      // 큰 유기적 지층/흙 덩어리 (각진 바위·흙 판)
      const cols = ['#492719', '#643a25', '#3e2014', '#5c3523', '#4f2b1c'];
      for (let i = 0; i < 64; i++) {
        const cx = r() * S, cy = r() * S, rad = 16 + r() * 26;
        const col = cols[(r() * cols.length) | 0];
        const pts = [];
        const n = 5 + ((r() * 3) | 0);
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + (r() - 0.5) * 0.45;
          const rr2 = rad * (0.65 + r() * 0.45);
          pts.push([cx + Math.cos(ang) * rr2, cy + Math.sin(ang) * rr2 * 0.78]);
        }
        drawWrapped(() => {
          c.fillStyle = col;
          c.beginPath();
          pts.forEach(([px, py], idx) => (idx ? c.lineTo(px, py) : c.moveTo(px, py)));
          c.closePath();
          c.fill();
          // 어두운 균열 외곽선
          c.strokeStyle = 'rgba(26,12,8,.55)';
          c.lineWidth = 1.6;
          c.stroke();
          // 노을 역광 위쪽 따뜻한 하이라이트 엣지
          c.strokeStyle = 'rgba(164,98,58,.36)';
          c.lineWidth = 1.4;
          c.beginPath();
          c.moveTo(pts[0][0], pts[0][1]);
          c.lineTo(pts[1][0], pts[1][1]);
          c.lineTo(pts[2][0], pts[2][1]);
          c.stroke();
        });
      }

      // 박혀 있는 돌·자갈
      for (let i = 0; i < 18; i++) {
        const sx = r() * S, sy = r() * S, sr = 6 + r() * 9, ang = r() * Math.PI;
        drawWrapped(() => {
          c.save(); c.translate(sx, sy); c.rotate(ang);
          c.fillStyle = i % 2 ? '#5c4b47' : '#4a3c39';
          c.beginPath();
          c.moveTo(-sr, -sr * 0.2); c.lineTo(-sr * 0.45, -sr * 0.7);
          c.lineTo(sr * 0.5, -sr * 0.55); c.lineTo(sr * 0.9, sr * 0.15);
          c.lineTo(sr * 0.25, sr * 0.68); c.lineTo(-sr * 0.6, sr * 0.52);
          c.closePath(); c.fill();
          c.strokeStyle = 'rgba(22,10,8,.65)'; c.lineWidth = 1.4; c.stroke();
          c.fillStyle = 'rgba(195,165,142,.26)';
          c.beginPath();
          c.moveTo(-sr * 0.65, -sr * 0.2); c.lineTo(-sr * 0.3, -sr * 0.58);
          c.lineTo(sr * 0.4, -sr * 0.42); c.lineTo(-sr * 0.05, -sr * 0.05);
          c.closePath(); c.fill();
          c.restore();
        });
      }

      // 땅속 얽힌 뿌리 줄기
      for (let i = 0; i < 10; i++) {
        const rx = r() * S, ry = r() * S, len = 28 + r() * 44, dx = (r() - 0.5) * 32;
        drawWrapped(() => {
          c.lineCap = 'round';
          c.strokeStyle = '#2d150c'; c.lineWidth = 3.2;
          c.beginPath(); c.moveTo(rx, ry); c.quadraticCurveTo(rx + dx * 0.4, ry + len * 0.5, rx + dx, ry + len); c.stroke();
          c.strokeStyle = '#754227'; c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(rx - 0.6, ry); c.quadraticCurveTo(rx + dx * 0.4 - 0.6, ry + len * 0.5, rx + dx - 0.6, ry + len); c.stroke();
        });
      }

      // 미세 모래/흙 알갱이
      for (let i = 0; i < 380; i++) {
        const gx = r() * S, gy = r() * S, sz = 1 + r() * 1.8;
        c.fillStyle = r() < 0.42 ? 'rgba(218,150,104,.16)' : 'rgba(24,10,6,.26)';
        c.fillRect(gx, gy, sz, sz);
      }
      SOIL_TILE = cv;
    }

    if (!GRASS_TILE) {
      const W = 128, H = 64;
      const [cv, c] = makeCv(W, H);
      // tex_grass_v3 색감: 깊고 따뜻한 올리브·라임 그린
      c.fillStyle = '#5a9420';
      c.fillRect(0, 0, W, H);
      const r = rng(513);
      for (let i = 0; i < 140; i++) {
        const x = r() * W, y = r() * H, len = 5 + r() * 9;
        c.strokeStyle = i % 3 === 0 ? '#90ca36' : (i % 3 === 1 ? '#3e6e15' : '#73b329');
        c.lineWidth = 1.6 + r() * 1.4;
        c.lineCap = 'round';
        for (const ox of [-W, 0, W]) {
          c.beginPath(); c.moveTo(x + ox, y); c.lineTo(x + ox + (r() - 0.5) * 4, y - len); c.stroke();
        }
      }
      GRASS_TILE = cv;
    }
    return { soil: SOIL_TILE, grass: GRASS_TILE };
  }

  function Terrain(gw, gh, cell) {
    this.gw = gw; this.gh = gh; this.cell = cell; this.W = gw * cell; this.H = gh * cell;
    this.mask = new Uint8Array(gw * gh);
    this.bedMask = new Uint8Array(gw * gh);
    this.geo = null;
    this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H;
    this.c = this.cv.getContext('2d');
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
    this.paint();
  };
  Terrain.prototype.solid = function (x, y) {
    const gx = Math.floor(x / this.cell), gy = Math.floor(y / this.cell);
    if (gx < 0 || gx >= this.gw || gy < 0 || gy >= this.gh) return false;
    return this.mask[gy * this.gw + gx] === 1;
  };
  Terrain.prototype.tops = function () {
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
    const pat = ensureTerrainPatterns();
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.W, this.H);

    // 1) 비트마스크 실루엣 채우기
    c.fillStyle = '#000';
    for (let gy = 0; gy < gh; gy++) {
      let run = -1;
      for (let gx = 0; gx <= gw; gx++) {
        const s = gx < gw && mask[gy * gw + gx];
        if (s && run < 0) run = gx;
        else if (!s && run >= 0) { c.fillRect(run * cell, gy * cell, (gx - run) * cell, cell); run = -1; }
      }
    }

    // 2) createPattern 흙 단면 패턴으로 지형 채우기
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = c.createPattern(pat.soil, 'repeat');
    c.fillRect(0, 0, this.W, this.H);

    // 3) 기반암 구역 & 깊이감 + 노을 역광 음영
    c.globalCompositeOperation = 'source-atop';
    if (this.geo && this.geo.bed) {
      const r = rng(88);
      for (const [x0, x1, y0, y1] of this.geo.bed) {
        c.fillStyle = 'rgba(38,24,42,.58)';
        c.fillRect(x0, y0, x1 - x0, y1 - y0);
        c.fillStyle = 'rgba(138,108,128,.28)';
        c.fillRect(x0, y0, x1 - x0, 4);
        c.strokeStyle = 'rgba(18,10,22,.5)'; c.lineWidth = 1.5;
        for (let yy = y0 + 14; yy < y1 - 4; yy += 16) {
          c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy + (r() - 0.5) * 4); c.stroke();
        }
      }
    }
    const rim = c.createLinearGradient(0, 150, 0, 780);
    rim.addColorStop(0, 'rgba(255,215,130,.18)');
    rim.addColorStop(0.45, 'rgba(255,175,90,.04)');
    rim.addColorStop(1, 'rgba(20,8,12,.36)');
    c.fillStyle = rim;
    c.fillRect(0, 0, this.W, this.H);

    // 4) 섬 아래 뾰족한 흙 돌기와 늘어진 뿌리 (지형 뒤쪽 레이어 — 파이면 함께 사라짐)
    c.globalCompositeOperation = 'destination-over';
    this.drawUnderside();

    // 5) 지형 위 장식 (나무 · 바위 · 덤불)
    c.globalCompositeOperation = 'source-over';
    this.decor();

    // 6) 윗면 풀 띠 (두께 · 패턴 · 잔디 술 · 밝은 노을 림라이트)
    const tops = this.tops();
    tops.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lines = [];
    for (const p of tops) {
      let best = null;
      for (const L of lines) {
        const q = L[L.length - 1];
        if (p[0] - q[0] <= cell + 0.1 && p[0] > q[0] && Math.abs(p[1] - q[1]) <= 16) { best = L; break; }
      }
      if (best) best.push(p); else lines.push([p]);
    }
    const grassPat = c.createPattern(pat.grass, 'repeat');
    const r = rng(42);
    for (const L of lines) {
      if (L.length < 2) continue;
      const trace = (dy) => {
        c.beginPath();
        c.moveTo(L[0][0] - 2, L[0][1] + dy);
        for (const p of L) c.lineTo(p[0], p[1] + dy);
        c.lineTo(L[L.length - 1][0] + 2, L[L.length - 1][1] + dy);
      };
      c.lineJoin = 'round'; c.lineCap = 'round';
      // 짙은 풀 외곽 그림자
      trace(3); c.strokeStyle = '#24470e'; c.lineWidth = 17; c.stroke();
      // 질감 있는 풀 패턴 띠
      trace(2); c.strokeStyle = grassPat; c.lineWidth = 13; c.stroke();
      // 밝은 올리브·라임 중간 띠
      trace(0); c.strokeStyle = '#7ec231'; c.lineWidth = 7.5; c.stroke();
      // 노을 역광 밝은 림라이트
      trace(-2.6); c.strokeStyle = '#c5ee56'; c.lineWidth = 3.2; c.stroke();

      // 흙 경계로 내려온 둥근 풀 물결
      for (let i = 0; i < L.length; i += 3) {
        const p = L[i], rr2 = 3.5 + (i % 2) * 1.8;
        c.fillStyle = '#264b0e';
        c.beginPath(); c.arc(p[0], p[1] + 9.2, rr2 + 1.2, 0, Math.PI); c.fill();
        c.fillStyle = i % 6 === 0 ? '#5b9921' : '#467c18';
        c.beginPath(); c.arc(p[0], p[1] + 8.4, rr2, 0, Math.PI); c.fill();
      }
      // 풀잎 잔디 술
      for (let i = 1; i < L.length; i += 3) {
        const p = L[i], h1 = 7 + r() * 8, h2 = 5 + r() * 6;
        c.fillStyle = i % 6 === 1 ? '#b8ec50' : '#7ac230';
        c.beginPath();
        c.moveTo(p[0] - 4.2, p[1] + 0.5);
        c.lineTo(p[0] - 1.6, p[1] - h1);
        c.lineTo(p[0] + 0.8, p[1] - 1.8);
        c.lineTo(p[0] + 3.4, p[1] - h2);
        c.lineTo(p[0] + 5.2, p[1] + 0.5);
        c.closePath(); c.fill();
      }
    }
  };

  Terrain.prototype.drawUnderside = function () {
    const c = this.c, { gw, gh, mask, cell } = this;
    const r = rng(99);
    // 1) 섬/대지 아래 뾰족한 흙·바위 돌기 (map_2d_v3 시안)
    for (let gx = 2; gx < gw - 2; gx += 4) {
      let thick = 0;
      for (let gy = 0; gy < gh; gy++) {
        if (mask[gy * gw + gx]) { thick++; continue; }
        if (thick >= 4 && (gy + 1 >= gh || !mask[(gy + 1) * gw + gx])) {
          const x = gx * cell + 2, y = gy * cell - 2;
          const tipH = 7 + r() * 14;
          const halfW = 5 + r() * 6;
          c.fillStyle = r() < 0.5 ? '#482619' : '#3a1d13';
          c.strokeStyle = '#210f0a'; c.lineWidth = 1.6;
          c.beginPath();
          c.moveTo(x - halfW, y - 2);
          c.lineTo(x + (r() - 0.5) * 4, y + tipH);
          c.lineTo(x + halfW, y - 2);
          c.closePath();
          c.fill(); c.stroke();
          // 노을 역광 가장자리 하이라이트
          c.fillStyle = 'rgba(150,86,52,.35)';
          c.beginPath();
          c.moveTo(x - halfW * 0.6, y - 1);
          c.lineTo(x, y + tipH * 0.85);
          c.lineTo(x + 1, y - 1);
          c.closePath(); c.fill();
        }
        thick = 0;
      }
    }

    // 2) 늘어진 나무 뿌리
    c.lineCap = 'round';
    for (let gx = 4; gx < gw - 4; gx += 5) {
      let thick = 0;
      for (let gy = 0; gy < gh; gy++) {
        if (mask[gy * gw + gx]) { thick++; continue; }
        if (thick >= 6 && (gy + 1 >= gh || !mask[(gy + 1) * gw + gx])) {
          if (r() < 0.25) { thick = 0; continue; }
          const x = gx * cell + 2, y = gy * cell - 1;
          const len = 14 + r() * 38;
          const bend = (r() - 0.5) * 20;
          c.strokeStyle = '#24110b'; c.lineWidth = 2.6 + r() * 1.8;
          c.beginPath(); c.moveTo(x, y);
          c.quadraticCurveTo(x + bend * 0.6, y + len * 0.55, x + bend, y + len);
          c.stroke();
          c.strokeStyle = r() < 0.5 ? '#5b301d' : '#744026'; c.lineWidth = 1.4 + r() * 1.1;
          c.beginPath(); c.moveTo(x - 0.4, y);
          c.quadraticCurveTo(x + bend * 0.6 - 0.4, y + len * 0.55, x + bend - 0.4, y + len);
          c.stroke();
          if (len > 24 && r() < 0.65) {
            c.strokeStyle = '#4f2818'; c.lineWidth = 1.2;
            c.beginPath(); c.moveTo(x + bend * 0.5, y + len * 0.5);
            c.quadraticCurveTo(x + bend * 0.5 + (bend > 0 ? -9 : 9), y + len * 0.75, x + bend * 0.3 + (bend > 0 ? -13 : 13), y + len * 0.92);
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
      c.fillStyle = '#5a321b'; c.strokeStyle = INK; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(-7, 4); c.lineTo(-4, -52); c.lineTo(4, -52); c.lineTo(8, 4); c.closePath(); c.fill(); c.stroke();
      const blob = (bx, by, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); c.stroke(); };
      [[-24, -64, 21, '#3b7a27'], [23, -66, 21, '#3b7a27'], [0, -90, 27, '#519d31'], [-14, -105, 18, '#55a333'], [15, -103, 18, '#68b93d']].forEach(([bx, by, r, col]) => blob(bx, by, r, col));
      [[-8, -100, 12], [13, -84, 10], [-18, -72, 9]].forEach(([bx, by, r]) => { c.fillStyle = '#a8e358'; c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill(); });
      c.restore();
    };
    const pine = (x, y, s) => {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = '#5a331d'; c.strokeStyle = INK; c.lineWidth = 2;
      c.fillRect(-4, -22, 8, 25); c.strokeRect(-4, -22, 8, 25);
      for (let i = 0; i < 3; i++) {
        const yy = -18 - i * 24, hw = 26 - i * 6, hh = 34 - i * 4;
        c.fillStyle = i === 2 ? '#6ab53e' : '#40832a';
        c.beginPath(); c.moveTo(0, yy - hh); c.lineTo(hw, yy); c.lineTo(-hw, yy); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = 'rgba(190,240,95,.38)';
        c.beginPath(); c.moveTo(0, yy - hh + 3); c.lineTo(hw * 0.45, yy - 3); c.lineTo(0, yy - 3); c.closePath(); c.fill();
      }
      c.restore();
    };
    const rock = (x, y, s) => {
      c.save(); c.translate(x, y + 4); c.scale(s, s);
      c.fillStyle = '#75686e'; c.strokeStyle = INK; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(-20, 0); c.lineTo(-16, -21); c.lineTo(-2, -31); c.lineTo(14, -25); c.lineTo(20, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#bfab9d'; c.beginPath(); c.moveTo(-12, -19); c.lineTo(-2, -28); c.lineTo(7, -23); c.lineTo(-5, -14); c.closePath(); c.fill();
      c.restore();
    };
    const bush = (x, y, s) => {
      c.save(); c.translate(x, y + 2); c.scale(s, s);
      c.fillStyle = '#489432'; c.strokeStyle = INK; c.lineWidth = 2;
      c.beginPath(); c.arc(-10, -8, 10, Math.PI, 0); c.arc(4, -13, 12, Math.PI, 0); c.arc(16, -7, 8, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#92d84a'; c.beginPath(); c.arc(2, -15, 6, Math.PI, 0); c.fill();
      c.restore();
    };
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

    place(615, 240, 280, (x, y) => oak(x, y, 1.05));
    place(690, 240, 280, (x, y) => rock(x, y, 0.95));
    place(1030, 160, 200, (x, y) => bush(x, y, 0.95));
    place(1008, 160, 200, (x, y) => pine(x, y, 0.58));
    place(765, 540, 580, (x, y) => oak(x, y, 0.82));
    place(835, 540, 580, (x, y) => rock(x, y, 0.88));
    place(1345, 210, 250, (x, y) => bush(x, y, 0.85));
    place(1575, 540, 580, (x, y) => rock(x, y, 0.85));
    place(1635, 540, 580, (x, y) => bush(x, y, 1.0));
    place(1745, 260, 300, (x, y) => pine(x, y, 0.95));
    place(1805, 260, 300, (x, y) => pine(x, y, 0.75));
    place(1690, 260, 300, (x, y) => rock(x, y, 0.95));
  };

  // 바뀐 영역만 부분 굽기 (파인 구멍 + 그을린 가장자리)
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
    const pad = r + 18;
    c.save();
    // 바뀐 영역 사각형 클립 (+ 기반암 사각형 제외)
    c.beginPath();
    c.rect(Math.max(0, x - pad), Math.max(0, y - pad), pad * 2, pad * 2);
    if (this.geo && this.geo.bed) {
      const hit = this.geo.bed.filter(([bx0, bx1, by0, by1]) => bx1 >= x - pad && bx0 <= x + pad && by1 >= y - pad && by0 <= y + pad);
      if (hit.length) {
        c.beginPath();
        c.rect(Math.max(0, x - pad), Math.max(0, y - pad), pad * 2, pad * 2);
        for (const [bx0, bx1, by0, by1] of hit) c.rect(bx0, by0, bx1 - bx0, by1 - by0);
        c.clip('evenodd');
      } else {
        c.clip();
      }
    } else {
      c.clip();
    }

    // 파인 구멍 (거친 가장자리로 판정 반경과 일치)
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const ang = (i / steps) * Math.PI * 2;
      const jit = Math.sin(ang * 7 + x * 0.13) * 1.4 + Math.cos(ang * 11 + y * 0.17) * 0.9;
      const rr2 = Math.max(2, r + jit);
      const px = x + Math.cos(ang) * rr2, py = y + Math.sin(ang) * rr2;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();

    // 그을린 구멍 가장자리 (검은 그을음 링 + 따뜻한 탄 갈색 링)
    c.globalCompositeOperation = 'source-atop';
    const g = c.createRadialGradient(x, y, Math.max(1, r - 2), x, y, r + 14);
    g.addColorStop(0, 'rgba(18,8,6,.92)');
    g.addColorStop(0.32, 'rgba(34,14,10,.78)');
    g.addColorStop(0.65, 'rgba(68,26,14,.38)');
    g.addColorStop(1, 'rgba(68,26,14,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r + 15, 0, Math.PI * 2); c.fill();

    c.strokeStyle = 'rgba(18,8,6,.85)';
    c.lineWidth = 2.6;
    c.beginPath(); c.arc(x, y, r + 1, 0, Math.PI * 2); c.stroke();
    c.restore();
  };

  // ---------------------------------------------------------------- 하늘 · 원경 이미지(bg_far_v3) + 패럴랙스
  let BG = null;
  let BG_IMG = null;
  let BG_STATE = 'loading'; // 'loading' | 'ok' | 'err'
  const BG_LISTENERS = [];

  function initBgImage() {
    if (BG_IMG) return;
    BG_IMG = new Image();
    BG_IMG.onload = () => {
      BG_STATE = BG_IMG.naturalWidth > 0 ? 'ok' : 'err';
      while (BG_LISTENERS.length) {
        const fn = BG_LISTENERS.shift();
        try { fn(); } catch (e) { /* 무시 */ }
      }
    };
    BG_IMG.onerror = () => { BG_STATE = 'err'; };
    BG_IMG.src = 'img/tank/bg_far_v3.jpg';
  }
  initBgImage();

  function onBgReady(fn) {
    if (BG_STATE === 'ok') { try { fn(); } catch (e) { /* 무시 */ } return; }
    if (BG_STATE === 'loading') BG_LISTENERS.push(fn);
  }

  function ensureBg() {
    if (BG) return BG;
    // 1) 대체 코드 하늘 (bg_far_v3 로드 전/실패 시)
    const [skyCv, sc] = makeCv(1280, 720);
    const sg = sc.createLinearGradient(0, 0, 0, 720);
    sg.addColorStop(0, '#965a90'); sg.addColorStop(0.24, '#ca6f85'); sg.addColorStop(0.50, '#ee9762');
    sg.addColorStop(0.76, '#f9c467'); sg.addColorStop(1, '#fded9c');
    sc.fillStyle = sg; sc.fillRect(0, 0, 1280, 720);
    const sun = sc.createRadialGradient(640, 440, 12, 640, 440, 480);
    sun.addColorStop(0, 'rgba(255,252,225,.88)'); sun.addColorStop(0.22, 'rgba(255,230,150,.50)');
    sun.addColorStop(0.55, 'rgba(255,185,105,.18)'); sun.addColorStop(1, 'rgba(255,160,90,0)');
    sc.fillStyle = sun; sc.fillRect(0, 0, 1280, 720);

    // 2) 코드 구름 도우미 (시안 노을 색)
    const paintCloud = (ctx, x, y, sc2, alpha) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(sc2, sc2); ctx.globalAlpha = alpha;
      const blobs = [[-55, 8, 28], [-22, -8, 36], [18, -14, 42], [58, -2, 34], [92, 10, 25], [30, 14, 32], [-10, 16, 30]];
      ctx.fillStyle = '#cf7474';
      ctx.beginPath(); for (const [bx, by, br] of blobs) { ctx.moveTo(bx + br, by + 6); ctx.arc(bx, by + 6, br, 0, Math.PI * 2); } ctx.fill();
      ctx.fillStyle = '#f6ae7a';
      ctx.beginPath(); for (const [bx, by, br] of blobs) { ctx.moveTo(bx + br * 0.9, by); ctx.arc(bx, by, br * 0.9, 0, Math.PI * 2); } ctx.fill();
      ctx.fillStyle = '#ffe8b8';
      ctx.beginPath(); for (const [bx, by, br] of blobs) { ctx.moveTo(bx + br * 0.72, by - 5); ctx.arc(bx, by - 5, br * 0.72, 0, Math.PI * 2); } ctx.fill();
      ctx.restore();
    };

    // 3) 중간 원경 바위산 레이어 (0.32x 시차 — 시안 좌우 뾰족 바위산)
    const [mtnNearCv, mnc] = makeCv(2400, 620);
    const drawSpire = (px, py, pw, ph, sunDir) => {
      mnc.fillStyle = 'rgba(156,74,76,.60)';
      mnc.beginPath(); mnc.moveTo(px - pw, py); mnc.lineTo(px - pw * 0.45, py - ph * 0.62);
      mnc.lineTo(px - pw * 0.1, py - ph); mnc.lineTo(px + pw * 0.25, py - ph * 0.78);
      mnc.lineTo(px + pw * 0.65, py - ph * 0.42); mnc.lineTo(px + pw, py); mnc.closePath(); mnc.fill();
      mnc.fillStyle = 'rgba(255,204,132,.38)';
      mnc.beginPath(); mnc.moveTo(px - pw * 0.1, py - ph);
      if (sunDir > 0) {
        mnc.lineTo(px + pw * 0.25, py - ph * 0.78); mnc.lineTo(px + pw * 0.65, py - ph * 0.42); mnc.lineTo(px + pw * 0.1, py - ph * 0.35);
      } else {
        mnc.lineTo(px - pw * 0.45, py - ph * 0.62); mnc.lineTo(px - pw * 0.65, py - ph * 0.35); mnc.lineTo(px - pw * 0.05, py - ph * 0.35);
      }
      mnc.closePath(); mnc.fill();
    };
    drawSpire(280, 620, 170, 290, 1); drawSpire(430, 620, 130, 210, 1); drawSpire(740, 620, 110, 150, 1);
    drawSpire(1660, 620, 115, 160, -1); drawSpire(1920, 620, 145, 220, -1); drawSpire(2120, 620, 180, 285, -1);

    // 4) 중간 구름 레이어 (0.38x 시차 + 천천히 흐름)
    const [cloudFarCv, cfc] = makeCv(2048, 520);
    [[140, 120, 1.5, 0.52], [480, 190, 1.05, 0.44], [860, 110, 1.2, 0.42], [1220, 175, 0.95, 0.40], [1560, 105, 1.45, 0.50], [1880, 165, 1.3, 0.48]].forEach(([x, y, sc2, a]) => {
      paintCloud(cfc, x, y, sc2, a); paintCloud(cfc, x - 2048, y, sc2, a); paintCloud(cfc, x + 2048, y, sc2, a);
    });

    // 5) 하단 구름 바다 (0.48x 시차)
    const [cloudNearCv, cnc] = makeCv(2048, 320);
    for (let x = 0; x < 2048; x += 170) {
      const y = 215 + Math.sin(x / 230) * 26, sc2 = 1.65 + (x % 3) * 0.25;
      paintCloud(cnc, x, y, sc2, 0.78); paintCloud(cnc, x - 2048, y, sc2, 0.78); paintCloud(cnc, x + 2048, y, sc2, 0.78);
    }

    // 6) 황금 빛 입자
    const [moteCv, mc] = makeCv(24, 24);
    const mg = mc.createRadialGradient(12, 12, 1, 12, 12, 11);
    mg.addColorStop(0, 'rgba(255,252,220,1)'); mg.addColorStop(0.35, 'rgba(255,230,145,.55)'); mg.addColorStop(1, 'rgba(255,210,120,0)');
    mc.fillStyle = mg; mc.fillRect(0, 0, 24, 24);
    const mr = rng(2026);
    const motes = [];
    for (let i = 0; i < 42; i++) motes.push([mr() * 2400, 120 + mr() * 940, 0.4 + mr() * 0.7, mr() * 6.28, 0.6 + mr() * 0.9]);

    BG = { skyCv, cloudFarCv, mtnNearCv, cloudNearCv, moteCv, motes };
    return BG;
  }

  function tileX(c, img, ox, y, drawW, drawH, period) {
    const x0 = ((ox % period) + period) % period - period;
    for (let x = x0; x < c.canvas.width + period; x += period) c.drawImage(img, x, y, drawW, drawH);
  }

  function sky(c, w, h, camX, camY, s, t) {
    const B = ensureBg();
    const parY = -(camY - 560) * s * 0.08;

    // 1) 최원경 레이어: bg_far_v3.jpg (0.12x 시차, 화면을 덮도록 확대) — 로드 실패/이전엔 코드 하늘 대체
    if (BG_STATE === 'ok' && BG_IMG && BG_IMG.naturalWidth > 0) {
      const iw = BG_IMG.naturalWidth, ih = BG_IMG.naturalHeight;
      const sc = Math.max((w * 1.28) / iw, (h * 1.22) / ih);
      const dw = iw * sc, dh = ih * sc;
      const dx = Math.max(w - dw, Math.min(0, (w - dw) / 2 - (camX - 1200) * s * 0.14));
      const dy = Math.max(h - dh, Math.min(0, (h - dh) / 2 - (camY - 560) * s * 0.10));
      c.drawImage(BG_IMG, dx, dy, dw, dh);
    } else {
      c.drawImage(B.skyCv, 0, 0, w, h);
    }

    // 2) 앞쪽 코드 바위산·구름 레이어 (0.3~0.5x 시차로 깊이감)
    const nW = Math.max(w * 1.6, 1600), nX = (w - nW) / 2 - (camX - 1200) * s * 0.30;
    c.drawImage(B.mtnNearCv, nX, h * 0.36 + parY * 1.0, nW, h * 0.68);

    const cfScale = Math.max(0.75, h / 650);
    const cfW = 2048 * cfScale;
    tileX(c, B.cloudFarCv, -camX * s * 0.36 + t * 0.006, h * 0.04 + parY * 1.1, cfW, 520 * cfScale, cfW);

    const cnW = 2048 * cfScale;
    tileX(c, B.cloudNearCv, -camX * s * 0.48 - t * 0.009, h * 0.69 + parY * 1.35, cnW, 320 * cfScale, cnW);

    // 3) 노을 속 빛 입자
    const sec = t / 1000;
    for (const [mx, my, sc2, ph, sp] of B.motes) {
      const x = ((mx + Math.sin(sec * 0.35 + ph) * 24 - camX * 0.5) % 2400 + 2400) % 2400 * (w / 1400);
      const y = ((my - sec * 10 * sp) % 1050 + 1050) % 1050 * (h / 900);
      if (x < -24 || x > w + 24 || y < -24 || y > h + 24) continue;
      const sz = 18 * sc2 * (0.75 + 0.25 * Math.sin(sec * 2.2 + ph));
      c.drawImage(B.moteCv, x - sz / 2, y - sz / 2, sz, sz);
    }
  }

  // 작은 폭포 애니메이션 + 물안개
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

  window.TankArt = { TEAM, KIND, STAT, drawTank, tomb, icon, Terrain, sky, drawWaterfalls, EMO, rr, onBgReady };
})();
