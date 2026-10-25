/* 아리채 쌩쌩카트 · 공통 계산 (트랙 · 카트 물리 · 아이템 표)
   - 브라우저(window.KartCore)와 Node(시험·시뮬레이션용 require)에서 똑같이 써요
   - 트랙: 조절점(Catmull-Rom) → 1m 간격 점으로 펴기 → 가까운 점 찾기 · 진행 거리
     서버(kart.py)도 같은 트랙 파일(track.json)을 같은 방법으로 펴요
   - 카트 물리: 고정 시간 간격(1/60초)으로 도는 step(k, inp, dt, T, env) — 같은 입력이면 같은 결과
   좌표: 위에서 본 지도 (x 오른쪽, y 아래쪽). 방향 h: 앞 = (cos h, sin h), h 가 커지면 오른쪽으로 돌아요.
   오른쪽 방향 R = (-sin h, cos h) · d(옆 거리)는 오른쪽이 + */
(function (root) {
  'use strict';

  const K = {};
  K.DT = 1 / 60;
  K.TAU = Math.PI * 2;

  /* ---------------- 물리 값 (손맛 조절은 여기서) ---------------- */
  K.P = {
    vmax: 24,          // 기본 최고 속도 (m/s)
    accel: 30,         // 가속 (클수록 빨리 최고 속도)
    turn: 2.05,        // 보통 조향 각속도 (rad/s)
    turnLowV: 8,       // 이 속도보다 느리면 덜 돌아요
    driftMinV: 10,     // 이 속도 이상이어야 드리프트
    driftYaw: [2.65, 1.8, 1.05],   // 드리프트 중 [같은 방향 누름, 안 누름, 반대 방향]
    driftSlide: 0.05,  // 드리프트 중 바깥으로 미끄러짐
    driftSpeed: 0.975, // 드리프트 중 속도 배율
    stage1: 0.5,       // 1단 불꽃까지 (초)
    stage2: 1.1,       // 2단 불꽃까지 (초)
    boost1: [0.65, 0.32],   // [시간, 속도 +비율]
    boost2: [1.15, 0.48],
    ctr: [0.35, 0.3, 0.35],   // 드리프트 직후 반대쪽 톡: [시간, +비율, 받아주는 시간]
    draftRange: 11, draftLat: 2.6, draftFill: 1.8, draftBoost: [0.8, 0.22], draftRest: 4,   // 바람타기 (다 차면 부스터 · 그 뒤 쉬는 시간)
    startBoost: [0.9, 0.35],  // 출발 부스터 (출발 직전 초록)
    wallKeep: 0.78, wallMinV: 7,     // 벽: 속도 남기는 비율 · 최소 속도 (멈추지 않아요)
    spin: 1.1, quakeSpin: 1.35,      // 가시공·지진 맞으면 빙글 (초)
    honeyT: 1.7, honeyMult: 0.5,     // 꿀: 시간 · 속도 배율
    fanBoost: [0.7, 0.25],           // 응원 폭죽 부스터
    kartR: 1.05,                     // 카트 반지름 (부딪힘)
    helperLane: 4.0,                 // 도우미: 차선 간격
    helperHold: 0.28                 // 도우미: 이만큼 꾹 누르면 드리프트(코너에서)
  };

  /* ---------------- 아이템 ---------------- */
  // 이름과 그림은 화면(hall.js)에서. 순서는 서버 kart.py 의 ITEMS 와 같아요.
  K.ITEMS = ['spike', 'honey', 'dino', 'nut'];
  K.ITEM_NAME = { spike: '가시공 굴리기', honey: '꿀 웅덩이', dino: '쿵쿵 지진', nut: '버튼 뒤죽박죽' };
  K.ITEM_WHO = { spike: '도치', honey: '붕붕', dino: '뿌뿌', nut: '토리' };

  /* ---------------- 작은 도구 ---------------- */
  const wrapA = (a) => { while (a > Math.PI) a -= K.TAU; while (a < -Math.PI) a += K.TAU; return a; };
  K.wrapA = wrapA;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  K.clamp = clamp;

  /* ================================================================
     트랙 펴기 — kart.py 의 build_track 과 같은 방법
     ================================================================ */
  function catmull(pts, closed, sub) {
    const n = pts.length;
    const out = [];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(i - 1, 0)];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = closed ? pts[(i + 2) % n] : pts[Math.min(i + 2, n - 1)];
      for (let k = 0; k < sub; k++) {
        const t = k / sub; const t2 = t * t; const t3 = t2 * t;
        const c = (j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
        out.push([c(0), c(1)]);
      }
    }
    if (!closed) out.push([pts[n - 1][0], pts[n - 1][1]]);
    return out;
  }

  // 일정 간격(step)으로 다시 찍기 → 점·방향·굽은 정도
  function resample(dense, closed, step) {
    const m = dense.length;
    const cum = [0];
    const segs = closed ? m : m - 1;
    for (let i = 0; i < segs; i++) {
      const a = dense[i]; const b = dense[(i + 1) % m];
      cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const L = cum[segs];
    const n = closed ? Math.round(L / step) : Math.round(L / step) + 1;
    const ds = closed ? L / n : L / (n - 1);
    const px = new Float64Array(n); const py = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const target = Math.min(L, i * ds);
      while (j < segs - 1 && cum[j + 1] < target) j++;
      const a = dense[j]; const b = dense[(j + 1) % m];
      const sl = cum[j + 1] - cum[j];
      const t = sl > 0 ? (target - cum[j]) / sl : 0;
      px[i] = a[0] + (b[0] - a[0]) * t;
      py[i] = a[1] + (b[1] - a[1]) * t;
    }
    const ang = new Float64Array(n); const kap = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ia = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
      const ib = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      ang[i] = Math.atan2(py[ib] - py[ia], px[ib] - px[ia]);
    }
    for (let i = 0; i < n; i++) {
      const ia = closed ? (i - 2 + n) % n : Math.max(0, i - 2);
      const ib = closed ? (i + 2) % n : Math.min(n - 1, i + 2);
      const span = closed ? 4 * ds : Math.max(1, ib - ia) * ds;
      kap[i] = wrapA(ang[ib] - ang[ia]) / span;
    }
    // 굽은 정도는 조금 부드럽게 (AI·도우미가 쓰는 값)
    const ks = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0; let c = 0;
      for (let k = -4; k <= 4; k++) {
        const q = closed ? (i + k + n) % n : i + k;
        if (q < 0 || q >= n) continue;
        s += kap[q]; c++;
      }
      ks[i] = s / c;
    }
    return { n, ds, L, px, py, ang, kap: ks, closed };
  }

  K.buildTrack = function (def) {
    const T = { def, hw: def.hw, laps: def.laps || 2, name: def.name || '' };
    T.main = resample(catmull(def.main, true, 32), true, 1.0);
    T.L = T.main.L;
    const sd = def.shortcut;
    if (sd) {
      const sc = resample(catmull(sd.pts, false, 32), false, 1.0);
      sc.hw = sd.hw;
      sc.slow = sd.slow || 1;
      const a = nearestIdx(T.main, sc.px[0], sc.py[0], -1);
      const b = nearestIdx(T.main, sc.px[sc.n - 1], sc.py[sc.n - 1], -1);
      sc.sa = a * T.main.ds;
      sc.sb = b * T.main.ds;
      sc.span = ((sc.sb - sc.sa) % T.L + T.L) % T.L;   // 지름길이 건너뛰는 본길 길이
      let x0 = 1e9; let y0 = 1e9; let x1 = -1e9; let y1 = -1e9;
      for (let i = 0; i < sc.n; i++) { x0 = Math.min(x0, sc.px[i]); y0 = Math.min(y0, sc.py[i]); x1 = Math.max(x1, sc.px[i]); y1 = Math.max(y1, sc.py[i]); }
      sc.box = [x0 - 10, y0 - 10, x1 + 10, y1 + 10];
      T.sc = sc;
    }
    // 위치 (s,d) → (x,y)
    T.at = (s, d) => K.mainPoint(T, s, d || 0);
    T.atSC = (f, d) => K.pathPoint(T.sc, f * T.sc.L, d || 0);
    // 화분(장애물) · 풍선
    const place = (o, d) => (o.sc != null ? T.atSC(o.sc, d) : T.at(o.s, d));
    // 화분: 벽에 붙은 화분은 길 가운데 쪽으로만 밀어내요 (벽과 화분 사이에 끼지 않게)
    T.pots = (def.pots || []).map((o) => {
      const p = place(o, o.d);
      const onSC = o.sc != null;
      const hw = onSC ? T.sc.hw : T.hw;
      const r = 1.25;
      const side = hw - Math.abs(o.d) - r < 2.3 ? Math.sign(o.d) : 0;
      return { x: p.x, y: p.y, r, sc: onSC, u: onSC ? o.sc * T.sc.L : o.s, d: o.d, side };
    });
    T.balloons = [];
    (def.balloons || []).forEach((row) => row.d.forEach((d) => {
      const p = place(row, d);
      T.balloons.push({ x: p.x, y: p.y, s: row.s != null ? row.s : null, sc: row.sc != null });
    }));
    // 출발 자리 (2줄 · 앞에서부터 1, 2, 3 …)
    const g = def.grid || { back: 7, gap: 6.2, side: 2.7 };
    T.grid = [];
    for (let i = 0; i < 8; i++) {
      const s = -(g.back + Math.floor(i / 2) * g.gap + (i % 2) * 2.2);
      const p = T.at(s, (i % 2 ? 1 : -1) * g.side);
      T.grid.push({ x: p.x, y: p.y, h: p.h, s });
    }
    // 코너 목록 (AI·도우미·자동 운전이 써요)
    T.corners = findCorners(T.main);
    return T;
  };

  function findCorners(P) {
    const out = [];
    const th = 1 / 45;
    let i0 = -1;
    // 직선 구간에서 시작해서 한 바퀴
    let start = 0;
    for (let i = 0; i < P.n; i++) if (Math.abs(P.kap[i]) < th * 0.5) { start = i; break; }
    for (let k = 0; k <= P.n; k++) {
      const i = (start + k) % P.n;
      const on = Math.abs(P.kap[i]) >= th;
      if (on && i0 < 0) i0 = k;
      if ((!on || k === P.n) && i0 >= 0) {
        const a = (start + i0) % P.n; const len = k - i0;
        let sum = 0; for (let q = i0; q < k; q++) sum += P.kap[(start + q) % P.n];
        if (len >= 8) out.push({ s0: a * P.ds, len: len * P.ds, dir: sum > 0 ? 1 : -1, kap: sum / len });
        i0 = -1;
      }
    }
    return out.sort((a, b) => a.s0 - b.s0);
  }

  // 가장 가까운 점 번호 (hint 근처만 찾다가, 멀면 전체)
  function nearestIdx(P, x, y, hint) {
    let best = -1; let bd = 1e18;
    if (hint >= 0 && P.closed) {
      for (let k = -45; k <= 45; k++) {
        const i = (hint + k + P.n) % P.n;
        const dx = P.px[i] - x; const dy = P.py[i] - y;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      if (bd < 18 * 18) return best;
    }
    for (let i = 0; i < P.n; i++) {
      const dx = P.px[i] - x; const dy = P.py[i] - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  K.nearestIdx = nearestIdx;

  // 길 위의 위치: 길이 s (닫힌 길은 한 바퀴 돌아요) + 옆 거리 d
  K.pathPoint = function (P, s, d) {
    let f;
    if (P.closed) { const L = P.L; s = ((s % L) + L) % L; f = s / P.ds; } else f = clamp(s, 0, P.L) / P.ds;
    let i = Math.floor(f); const t = f - i;
    let j = i + 1;
    if (P.closed) { i %= P.n; j %= P.n; } else { i = Math.min(i, P.n - 1); j = Math.min(j, P.n - 1); }
    const x = P.px[i] + (P.px[j] - P.px[i]) * t;
    const y = P.py[i] + (P.py[j] - P.py[i]) * t;
    const h = P.ang[i] + wrapA(P.ang[j] - P.ang[i]) * t;
    const k = P.kap[i] + (P.kap[j] - P.kap[i]) * t;
    return { x: x - Math.sin(h) * d, y: y + Math.cos(h) * d, h, k };
  };
  K.mainPoint = (T, s, d) => K.pathPoint(T.main, s, d);

  // 가까운 점에서 길이(s)·옆 거리(d) 구하기 (점 사이로 정확하게)
  function project(P, x, y, i) {
    let bs = 0; let bd = 0; let bdist = 1e18; let bu = 0;
    for (let q = -1; q <= 0; q++) {
      let a = i + q; let b = a + 1;
      if (P.closed) { a = (a + P.n) % P.n; b = (b + P.n) % P.n; } else if (a < 0 || b >= P.n) continue;
      const ax = P.px[a]; const ay = P.py[a];
      const ex = P.px[b] - ax; const ey = P.py[b] - ay;
      const l2 = ex * ex + ey * ey || 1;
      let u = ((x - ax) * ex + (y - ay) * ey) / l2;
      const uc = clamp(u, 0, 1);
      const qx = ax + ex * uc; const qy = ay + ey * uc;
      const dist = Math.hypot(x - qx, y - qy);
      if (dist < bdist) {
        bdist = dist;
        const l = Math.sqrt(l2);
        bs = a * P.ds + uc * l;
        bd = ((x - ax) * -ey + (y - ay) * ex) / l;   // 오른쪽 + (y 아래쪽 지도)
        bu = u;
        if (!P.closed && ((a === 0 && u < 0) || (b === P.n - 1 && u > 1))) bu = u;
      }
    }
    // 오른쪽(R) = (-sin h, cos h) → (x,y)·R = -ex*y... 위에서 (dx*-ey + dy*ex)/l 이 R 방향 성분
    return { s: bs, d: bd, dist: bdist, u: bu };
  }

  // 카트 위치 찾기: 본길 / 지름길 · 길 안인가
  K.locate = function (T, x, y, hint) {
    const P = T.main;
    const i = nearestIdx(P, x, y, hint == null ? -1 : hint);
    const m = project(P, x, y, i);
    const out = { i, s: m.s, ms: m.s, d: m.d, inMain: Math.abs(m.d) <= T.hw, inSC: false, scU: -1, scD: 0, onSC: false };
    const sc = T.sc;
    if (sc && x > sc.box[0] && x < sc.box[2] && y > sc.box[1] && y < sc.box[3]) {
      const j = nearestIdx(sc, x, y, -1);
      const q = project(sc, x, y, j);
      out.scU = q.s; out.scD = q.d; out.scDist = q.dist;
      out.inSC = q.dist <= sc.hw && q.s > 0.01 && q.s < sc.L - 0.01;
      // 지름길 끝 쪽은 본길과 붙어 있어요
      if (!out.inSC && (q.s <= 0.01 || q.s >= sc.L - 0.01)) out.inSC = q.dist <= sc.hw && out.inMain;
      out.onSC = out.inSC && !out.inMain;
      if (out.onSC) out.s = (sc.sa + (q.s / sc.L) * sc.span) % T.L;
    }
    return out;
  };

  /* ================================================================
     카트
     ================================================================ */
  K.newKart = function (T, slot, opt) {
    const g = T.grid[slot % T.grid.length];
    const o = opt || {};
    return {
      x: g.x, y: g.y, h: g.h, v: 0,
      prog: g.s, s: ((g.s % T.L) + T.L) % T.L, hint: -1, onSC: false, d: 0,
      lap: 0, finished: false, finT: 0,
      drift: 0, dch: 0, stage: 0, boostT: 0, boostA: 0, ctrT: 0, ctrDir: 0,
      spinT: 0, spinLen: 1, spinA: 0, slowT: 0, wallT: 0, hop: 0, hopV: 0,
      vis: 0, lean: 0, draft: 0, draftOn: false, draftRest: 0,
      helper: !!o.helper, lane: 0, laneD: 0, hHold: 0, hDir: 0,
      gPend: false, pl: false, pr: false, pg: false, startArm: false,
      ev: [],
      st: { walls: 0, pots: 0, d1: 0, d2: 0, drafts: 0, ctr: 0, starts: 0 }
    };
  };

  function boost(k, t, a, why) {
    k.boostA = k.boostT > 0 ? Math.max(k.boostA, a) : a;
    k.boostT = Math.max(k.boostT, t);
    k.v += a * K.P.vmax * 0.3;   // 슝! 바로 밀어줘요
    k.ev.push(why || 'boost');
  }
  K.boost = boost;

  function startDrift(k, dir) {
    if (k.v < K.P.driftMinV || k.spinT > 0 || k.drift) return false;
    k.drift = dir; k.dch = 0; k.stage = 0;
    k.hopV = 3.2;   // 살짝 콩
    k.ev.push('driftStart');
    return true;
  }

  function endDrift(k, keep) {
    if (!k.drift) return;
    const P = K.P;
    const dir = k.drift;
    k.drift = 0;
    if (keep !== false && k.stage >= 1) {
      const b = k.stage >= 2 ? P.boost2 : P.boost1;
      boost(k, b[0], b[1], k.stage >= 2 ? 'boost2' : 'boost1');
      if (k.stage >= 2) k.st.d2++; else k.st.d1++;
      k.ctrT = P.ctr[2]; k.ctrDir = -dir;
    } else if (keep === false && k.stage >= 1) {
      k.ev.push('driftLost');
    }
    k.stage = 0; k.dch = 0;
  }

  // 빙글 (가시공·지진) — 화면 쪽에서 맞았다는 소식이 오면 불러요
  K.spinOut = function (k, sec) {
    endDrift(k, false);
    k.spinT = Math.max(k.spinT, sec); k.spinLen = k.spinT;
    k.boostT = 0; k.boostA = 0;
    k.hopV = 5;
  };
  K.honey = function (k) { k.slowT = Math.max(k.slowT, K.P.honeyT); endDrift(k, false); k.boostT = Math.min(k.boostT, 0.1); };

  /* 한 칸 움직이기
     inp: { l, r, g } — 지금 누르고 있는 버튼 (뒤죽박죽은 화면 쪽에서 미리 바꿔서 줘요)
     env: { t: 출발 뒤 시간(초, 출발 전은 -), others: [{x,y}], quake: 지진 경고 중 } */
  K.step = function (k, inp, dt, T, env) {
    const P = K.P;
    const E = env || {};
    const t = E.t == null ? 1 : E.t;
    const gDown = inp.g && !k.pg; const gUp = !inp.g && k.pg;
    const lDown = inp.l && !k.pl; const rDown = inp.r && !k.pr;
    const lUp = !inp.l && k.pl; const rUp = !inp.r && k.pr;
    k.pl = inp.l; k.pr = inp.r; k.pg = inp.g;

    // 출발 전: 그대로 서 있어요 · 출발 직전 초록 = 출발 부스터
    if (t < 0) {
      if (gDown) k.startArm = t > -0.45;
      if (gUp && t < -0.45) k.startArm = false;
      k.v = 0;
      return;
    }
    if (k.startArm) { k.startArm = false; boost(k, P.startBoost[0], P.startBoost[1], 'startBoost'); k.st.starts++; }

    if (k.finished) { inp = { l: false, r: false, g: false }; }
    const steer = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    const spinning = k.spinT > 0;
    let yaw = 0;
    let vCap = 1e9;
    const loc0 = K.locate(T, k.x, k.y, k.hint);

    if (k.helper) {
      // ---------- 도우미: 차선 따라 저절로 · 빨강/파랑 톡 = 차선 · 코너에서 안쪽 꾹 = 드리프트 ----------
      if (lDown || rDown) { k.hHold = 0; k.hDir = lDown ? -1 : 1; }
      const held = k.hDir < 0 ? inp.l : k.hDir > 0 ? inp.r : false;
      if (held) k.hHold += dt;
      const ahead = K.mainPoint(T, loc0.s + 10, 0);
      const inside = Math.abs(ahead.k) > 1 / 32 ? (ahead.k > 0 ? 1 : -1) : 0;
      if (held && k.hHold >= P.helperHold && !k.drift && (inside === k.hDir || E.quake)) startDrift(k, k.hDir);
      if ((lUp && k.hDir < 0) || (rUp && k.hDir > 0)) {
        if (k.hHold < P.helperHold && !k.drift) k.lane = clamp(k.lane + k.hDir, -1, 1);
        if (k.drift) endDrift(k);
        k.hDir = 0; k.hHold = 0;
      }
      if (gDown && !k.finished) k.ev.push('item');
      // 차선 따라가기
      let want = k.lane * P.helperLane;
      // 앞에 화분이 있으면 살짝 비켜 가요 (도우미는 부딪히지 않게)
      for (let q = 0; q < T.pots.length; q++) {
        const o = T.pots[q];
        if (o.sc) continue;
        let ah = o.u - loc0.s; if (ah < -T.L / 2) ah += T.L;
        if (ah > -3 && ah < 18 && Math.abs(o.d - want) < 2.6) want = o.side ? o.d - o.side * 2.7 : (want >= o.d ? o.d + 2.7 : o.d - 2.7);
      }
      want = clamp(want, -(T.hw - 1.15), T.hw - 1.15);
      k.laneD += clamp(want - k.laneD, -6 * dt, 6 * dt);
      const look = 7 + k.v * 0.28;
      const tp = K.mainPoint(T, loc0.s + look, k.laneD);
      const des = Math.atan2(tp.y - k.y, tp.x - k.x);
      const wmax = k.drift ? P.driftYaw[0] : P.turn;
      yaw = clamp(wrapA(des - k.h) * 3.4, -wmax, wmax) * Math.min(1, k.v / P.turnLowV);
      // 급한 코너는 저절로 조금 늦춰요 (드리프트하면 덜 늦춰요)
      let kmax = 0;
      for (let q = 2; q <= 14; q += 4) kmax = Math.max(kmax, Math.abs(K.mainPoint(T, loc0.s + q, 0).k));
      if (kmax > 0) vCap = Math.max(12, wmax / kmax * 0.98);
      if (k.drift) k.dch += k.v > 8 ? dt : 0;
    } else {
      // ---------- 기본(카러형): 빨강 왼쪽 · 파랑 오른쪽 · 초록 톡 아이템 · 초록+방향 꾹 드리프트 ----------
      if (gDown) { if (steer !== 0) startDrift(k, steer); else k.gPend = true; }
      if (k.gPend && inp.g && steer !== 0) { k.gPend = false; startDrift(k, steer); }
      if (gUp && k.gPend) { k.gPend = false; if (!k.finished) k.ev.push('item'); }
      if (k.drift && !inp.g) endDrift(k);
      if (k.ctrT > 0 && ((k.ctrDir < 0 && lDown) || (k.ctrDir > 0 && rDown))) {
        k.ctrT = 0; boost(k, P.ctr[0], P.ctr[1], 'ctr'); k.st.ctr++;
      }
      if (k.drift) {
        const dy = P.driftYaw;
        yaw = k.drift * (steer === k.drift ? dy[0] : steer === 0 ? dy[1] : dy[2]);
        if (k.v > 8) k.dch += dt;
      } else {
        yaw = steer * P.turn * Math.min(1, k.v / P.turnLowV);
      }
    }
    if (k.drift) {
      // 도우미는 1단 불꽃까지만 (기본 조작으로 잘 타면 더 빨라요)
      const st = k.dch >= P.stage2 && !k.helper ? 2 : k.dch >= P.stage1 ? 1 : 0;
      if (st > k.stage) { k.stage = st; k.ev.push('stage' + st); }
      if (k.v < P.driftMinV * 0.7) endDrift(k, false);
    }
    if (spinning) { yaw = 0; if (k.drift) endDrift(k, false); }
    if (k.slowT > 0) yaw *= 0.75;
    k.h = wrapA(k.h + yaw * dt);

    // ---------- 속도 ----------
    let target = P.vmax;
    if (k.boostT > 0) target *= 1 + k.boostA;
    if (k.drift) target *= P.driftSpeed;
    if (k.slowT > 0) target *= P.honeyMult;
    if (loc0.onSC) target *= T.sc.slow;
    if (spinning) target = P.vmax * 0.28;
    if (k.finished) target = P.vmax * 0.55;
    target = Math.min(target, vCap * (k.boostT > 0 ? 1 + k.boostA : 1));
    if (k.v < target) k.v = Math.min(target, k.v + Math.max(2, P.accel * (1 - k.v / target)) * dt);
    else if (k.v > target) k.v += (target - k.v) * (spinning ? 4 : 2.2) * dt;
    if (k.v < 0) k.v = 0;

    // ---------- 움직이기 ----------
    const ch = Math.cos(k.h); const sh = Math.sin(k.h);
    let nx = k.x + ch * k.v * dt;
    let ny = k.y + sh * k.v * dt;
    if (k.drift && !k.helper) {
      // 바깥(드리프트 반대쪽)으로 살짝 미끄러져요
      const sl = -k.drift * P.driftSlide * k.v * dt;
      nx += -sh * sl; ny += ch * sl;
    }
    // 다른 카트와 살짝 밀기 (아주 약하게)
    const others = E.others || [];
    for (let q = 0; q < others.length; q++) {
      const o = others[q];
      const dx = nx - o.x; const dy = ny - o.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 2.1 * 2.1 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (2.1 - d) * 0.35;
        nx += dx / d * push; ny += dy / d * push;
      }
    }
    k.x = nx; k.y = ny;

    // ---------- 벽 (부드럽게: 미끄러지며 튕겨요, 멈추지 않아요) ----------
    let loc = K.locate(T, k.x, k.y, loc0.i);
    if (!loc.inMain && !loc.inSC) {
      const useSC = !!(T.sc && loc.scU >= 0 && loc.scDist - T.sc.hw < Math.abs(loc.d) - T.hw);
      const dd = useSC ? loc.scD : loc.d;
      const base = useSC ? K.pathPoint(T.sc, loc.scU, Math.sign(dd) * (T.sc.hw - 0.05))
        : K.pathPoint(T.main, loc.ms, Math.sign(dd) * (T.hw - 0.05));
      k.x = base.x; k.y = base.y;
      const fwd = Math.cos(k.h - base.h) >= 0 ? base.h : base.h + Math.PI;
      const inward = -Math.sign(dd) * (fwd === base.h ? 1 : -1);
      const hit = Math.abs(wrapA(k.h - fwd));
      if (k.helper) {
        k.h = wrapA(fwd + inward * 0.04);
      } else {
        k.h = wrapA(fwd + inward * Math.min(0.32, 0.12 + hit * 0.4));
        if (k.wallT <= 0) {
          k.v = Math.max(Math.min(k.v, P.wallMinV), k.v * (P.wallKeep - Math.min(0.25, hit * 0.4)));
          k.ev.push('wall'); k.st.walls++;
          k.wallT = 0.35;
          if (k.drift) endDrift(k, false);
        } else k.v *= 0.995;
      }
      loc = K.locate(T, k.x, k.y, loc.i);
    }
    // 도우미: 벽 가까이 가지 않게 (벽에 안 부딪혀요)
    if (k.helper && !loc.onSC && Math.abs(loc.d) > T.hw - 1.15) {
      const base = K.mainPoint(T, loc.ms, Math.sign(loc.d) * (T.hw - 1.15));
      k.x = base.x; k.y = base.y;
      loc = K.locate(T, k.x, k.y, loc.i);
    }
    // ---------- 화분 ----------
    const pots = T.pots;
    for (let q = 0; q < pots.length; q++) {
      const o = pots[q];
      const dx = k.x - o.x; const dy = k.y - o.y;
      const rr = o.r + P.kartR;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const kd = o.sc ? loc.scD : loc.d;
      if (o.side && (kd - o.d) * o.side > -0.35) {
        // 벽 쪽으로 들어가면 길 가운데 쪽으로 옆걸음
        const ks = o.sc ? loc.scU : loc.ms;
        const p2 = K.pathPoint(o.sc ? T.sc : T.main, ks, o.d - o.side * (rr + 0.02));
        k.x = p2.x; k.y = p2.y;
      } else {
        const d = Math.sqrt(d2) || 0.01;
        k.x = o.x + dx / d * rr; k.y = o.y + dy / d * rr;
      }
      // 화분에서 튕겨 나오는 쪽으로 방향을 조금 꺾어요
      const away = Math.atan2(k.y - o.y, k.x - o.x);
      k.h = wrapA(k.h + clamp(wrapA(away - k.h), -0.6, 0.6) * 0.5);
      if (k.wallT <= 0) { k.v = Math.max(P.wallMinV, k.v * 0.72); k.ev.push('pot'); k.st.pots++; k.wallT = 0.35; k.hopV = 3; if (k.drift) endDrift(k, false); }
      loc = K.locate(T, k.x, k.y, loc.i);
    }
    k.hint = loc.i;
    k.onSC = loc.onSC;
    k.d = loc.onSC ? loc.scD : loc.d;

    // ---------- 진행 거리 · 바퀴 ----------
    let ds = loc.s - k.s;
    if (ds > T.L / 2) ds -= T.L; else if (ds < -T.L / 2) ds += T.L;
    k.s = loc.s;
    if (!k.finished) {
      k.prog += ds;
      const lap = Math.floor(k.prog / T.L);
      if (lap > k.lap && lap >= 1) { k.lap = lap; if (lap < T.laps) k.ev.push('lap'); }
      if (k.prog >= T.laps * T.L) { k.finished = true; k.finT = t; k.lap = T.laps; k.ev.push('finish'); endDrift(k); }
    }

    // ---------- 바람타기 (앞 카트 뒤에 바짝) ----------
    k.draftOn = false;
    if (!spinning && k.v > 12) {
      for (let q = 0; q < others.length; q++) {
        const o = others[q];
        const dx = o.x - k.x; const dy = o.y - k.y;
        const along = dx * ch + dy * sh;
        const lat = -dx * sh + dy * ch;
        if (along > 1.5 && along < P.draftRange && Math.abs(lat) < P.draftLat) { k.draftOn = true; break; }
      }
    }
    if (k.draftRest > 0) { k.draftRest -= dt; k.draftOn = false; }
    if (k.draftOn) {
      k.draft += dt / P.draftFill;
      if (k.draft >= 1) { k.draft = 0; k.draftRest = P.draftRest; boost(k, P.draftBoost[0], P.draftBoost[1], 'draft'); k.st.drafts++; }
    } else k.draft = Math.max(0, k.draft - dt * 0.55);

    // ---------- 시간 · 보이는 모습 ----------
    if (k.boostT > 0) { k.boostT -= dt; if (k.boostT <= 0) { k.boostT = 0; k.boostA = 0; } }
    if (k.ctrT > 0) k.ctrT -= dt;
    if (k.wallT > 0) k.wallT -= dt;
    if (k.slowT > 0) k.slowT -= dt;
    if (k.spinT > 0) { k.spinT -= dt; k.spinA += dt * (K.TAU * 2 / k.spinLen); if (k.spinT <= 0) { k.spinT = 0; k.spinA = 0; } }
    const visT = k.drift ? k.drift * 0.5 : steer * 0.1;
    k.vis += (visT - k.vis) * Math.min(1, dt * 9);
    k.lean += ((k.drift ? k.drift * 0.6 : steer * 0.35) - k.lean) * Math.min(1, dt * 8);
    k.hopV -= 22 * dt; k.hop += k.hopV * dt;
    if (k.hop < 0) { k.hop = 0; k.hopV = 0; }
  };

  /* 다른 폰에 보낼 상태 표시 (숫자 하나로) — kart.py 의 FLAG_* 와 같아요 */
  K.F = { DL: 1, DR: 2, ST1: 4, ST2: 8, BOOST: 16, SPIN: 32, HONEY: 64, HELPER: 128, FIN: 256, DRAFT: 512, SC: 1024 };
  K.flags = function (k) {
    const F = K.F;
    let f = 0;
    if (k.drift < 0) f |= F.DL; else if (k.drift > 0) f |= F.DR;
    if (k.stage >= 1) f |= F.ST1;
    if (k.stage >= 2) f |= F.ST2;
    if (k.boostT > 0) f |= F.BOOST;
    if (k.spinT > 0) f |= F.SPIN;
    if (k.slowT > 0) f |= F.HONEY;
    if (k.helper) f |= F.HELPER;
    if (k.finished) f |= F.FIN;
    if (k.draft > 0.05) f |= F.DRAFT;
    if (k.onSC) f |= F.SC;
    return f;
  };

  // 기록 글자 (초 → 1:02.34)
  K.fmtTime = function (sec) {
    if (!(sec > 0)) return '-';
    const m = Math.floor(sec / 60); const s = sec - m * 60;
    return (m ? m + ':' + (s < 10 ? '0' : '') : '') + s.toFixed(2) + (m ? '' : '초');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = K;
  root.KartCore = K;
})(typeof window !== 'undefined' ? window : globalThis);
