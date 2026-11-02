/* 머지관 · 「소라섬 등불 이야기」 마을 지도 (merge_town.md §A·§H·§I · 2단계)
   - [마을] → 하나로 이어진 섬 지도 1장 (3072² · 멀리는 map_lo 1장, 가까이는 보이는 512² 조각만 받아요)
     · 한 손가락 끌기 = 이동 · 두 손가락/휠 = 확대 · 관성 · 섬 밖으로는 탄성 · 지역은 이야기 순서로 열리고 잠긴 곳은 움직이는 안개
     · 지역이 열리면 안개가 가운데부터 걷히며 구름이 흩어져요
   - 작업 = 짓기: 별이 날아감 → 잔해 흔들·먼지 → 비계가 솟고 망치 딱딱딱 → 번쩍 → 건물 뿅 (톡하면 건너뛰기)
     · 건물(B3)은 모양 3가지 중 하나 무료로 고르기 · 나머지 2개는 동전 · 언제든 [꾸미기]에서 바꾸기 (core.js setLook)
     · 땅 고치기(G)는 잔해만 치워요 · 6지역: 무너진 등대 → 비계 → 등대 → 렌즈 반짝 → 밤마다 빛줄기
   - 살아 있는 마을: 그 지역 사람·하윤(입은 옷)·몽돌(소품)이 길을 걸어요 · 배 출렁 · 해 지면 등불(기기 시각 · 설정 '항상 낮')
   - 숨은 비밀(편지 조각·갈매기·병 속 편지) · 장식 놓기 · 마을 사람 톡 → 우정(선물하기) · 지은 건물 톡 → 통통 + 하루 한 번 엽전
   - 성능: 정지 층(바탕·건물)은 화면 크기 캔버스에 모아 두고 카메라·건물이 바뀔 때만 다시 그려요 · 움직이는 것만 매 프레임
           · 초당 30장까지 · 보이는 지역 그림만 · 화면 배율 최대 2 · '움직임 줄이기'면 걷기·출렁 멈춤
   - 좌표는 data.js TOWN (지도 px) · ?edit=1 이면 모든 지역·건물을 펼쳐 보이고 끌어서 옮기고 [좌표 복사]
   - 규칙(별·작업·지역 완성·이야기·비밀)은 MergeCore 그대로 · 화면 손잡이는 window.MergeUI */
(function () {
  'use strict';

  const D = window.MergeData, C = window.MergeCore, A = window.MergeArt, F = window.MergeFx, U = window.MergeUI;
  if (!U) return;
  const T = D.TOWN, MW = T.map.w, MH = T.map.h, TILE = T.map.tile, NT = Math.round(MW / TILE);
  const $ = (id) => document.getElementById(id);
  const esc = U.esc;
  const st = () => U.state;
  const EDIT = /[?&]edit=1/.test(location.search);
  const NA = D.AREAS.length;
  const now = () => Date.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);

  /* ---------- 그림 불러오기 (보이는 것만 · 다 읽으면 다시 그림) ---------- */
  const imgs = {};
  function img(name) {
    let o = imgs[name];
    if (!o) {
      const src = name.indexOf('ui:') === 0 ? A.src(name.slice(3)) : A.src('t_' + name);
      o = imgs[name] = { ok: false, bad: !src };
      if (src) {
        o.im = new Image();
        o.im.decoding = 'async';
        o.im.onload = () => { o.ok = true; o.w = o.im.naturalWidth; o.h = o.im.naturalHeight; dirty(); };
        o.im.onerror = () => { o.bad = true; };
        o.im.src = src;
      }
    }
    return o.ok ? o : null;
  }
  // 톡 판정용 작은 알파 지도 (투명한 곳을 누르면 뒤의 것이 눌려요)
  function alphaAt(o, fx, fy) {
    if (o.mask === undefined) {
      try {
        const k = 64 / Math.max(o.w, o.h), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(o.w * k)); c.height = Math.max(1, Math.round(o.h * k));
        const x = c.getContext('2d'); x.drawImage(o.im, 0, 0, c.width, c.height);
        o.mask = { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
      } catch (e) { o.mask = null; }
    }
    if (!o.mask) return 255;
    const m = o.mask, px = clamp(Math.floor(fx * m.w), 0, m.w - 1), py = clamp(Math.floor(fy * m.h), 0, m.h - 1);
    return m.d[(py * m.w + px) * 4 + 3];
  }

  /* ---------- 지역 · 좌표 ---------- */
  const origin = (i) => C.areaOrigin(i);                        // 지도 px 라 언제나 0 (옛 코드와 같은 모양으로 두어요)
  const W = (i, p) => ({ x: p[0], y: p[1] });
  const taskOf = (id) => { for (let i = 0; i < NA; i++) { const t = D.AREAS[i].tasks.find((x) => x.id === id); if (t) return { t, i }; } return null; };
  const openN = () => Math.min(st().area, NA - 1);            // 지금 지역 번호 (다 고쳤으면 마지막)
  let fogHold = -1;                                           // 방금 열린 지역 (다음 지역으로 넘어가기 전까지 안개)
  const isOpen = (i) => EDIT || (i >= 0 && i <= st().area && i !== fogHold);
  const areaAt = (wx, wy) => C.zoneAt(wx, wy);                // 지도 칸의 주인 지역 (core.js · 지역 box 가운데에 가까운 쪽)
  // 땅 지도 (map_land 192² 알파) · 장식은 땅 위에만 · 안개도 땅 위에만
  let land = null;
  function landAt(wx, wy) {
    if (!land) {
      const o = img('map_land'); if (!o) return 1;
      try {
        const c = document.createElement('canvas'); c.width = o.w; c.height = o.h;
        const g = c.getContext('2d'); g.drawImage(o.im, 0, 0);
        const d = g.getImageData(0, 0, o.w, o.h).data, a = new Float32Array(o.w * o.h);
        for (let k = 0; k < a.length; k++) a[k] = d[k * 4 + 3] / 255;
        land = { w: o.w, h: o.h, a };
      } catch (e) { land = { w: 1, h: 1, a: new Float32Array([1]) }; }
    }
    const x = clamp(Math.floor(wx / MW * land.w), 0, land.w - 1), y = clamp(Math.floor(wy / MH * land.h), 0, land.h - 1);
    return land.a[y * land.w + x];
  }
  // 작업 자리 (말풍선·카메라·연출 기준)
  function sitePos(id) {
    const x = taskOf(id); if (!x) return { x: 0, y: 0 };
    const b = T.build[id];
    if (b.mount) { const m = mountObj(id, x.i); if (m && m.center) return { x: m.wx, y: m.wy + 34 }; }
    if (b.at) return W(x.i, b.at);
    if (b.clears && b.clears.length) return W(x.i, [b.clears[0][1], b.clears[0][2]]);
    if (b.fx === 'ruin') return W(x.i, T.ruin.at);
    const lh = T.build.r6_wall;
    return W(x.i, [lh.at[0], lh.at[1] - lh.w * 1.7]);   // 렌즈·불: 등대 꼭대기
  }

  /* ---------- 지도에 놓을 것들 (정지 층) ---------- */
  let sceneVer = 0, sceneList = null, sceneOf = -1;
  const preview = {};                  // 모양 고르기 중 미리보기 { taskId: k }
  let anim = null;                     // 짓기 연출 { id, t0, dur, kind }
  function dirty() { sceneVer++; }
  function lookArt(id) {
    const b = T.build[id];
    const k = preview[id] != null ? preview[id] : C.lookOf(st(), id);
    return b.art + '_' + 'abc'[k];
  }
  function decoArt(id) {
    const k = C.decoKind(id);
    if (k) return { art: T.fillers[k].art, w: T.fillers[k].w };
    if (T.eventDecos[id] && A.has(id)) return { art: 'ui:' + id, w: T.eventDecos[id].w };
    return null;
  }
  // 벽에 거는 것(현판): 걸 집이 지어졌으면 그 집 그림 위 비율 자리에 · 벽 기울기만큼 비스듬히 · 집 바로 앞 깊이
  function mountObj(id, i) {
    const b = T.build[id], m = b.mount, s = st(), host = T.build[m.on];
    if ((EDIT || s.tasks[m.on]) && !(anim && anim.id === m.on)) {
      const hi = img(lookArt(m.on));
      if (!hi) return null;                                   // 집 그림을 읽으면 다시 그려요 (dirty)
      const k = preview[m.on] != null ? preview[m.on] : C.lookOf(s, m.on);
      const L = m.looks[k] || m.looks[0];
      const hp = W(i, host.at), hh = host.w * hi.h / hi.w;
      return { art: b.art, wx: hp.x - host.w / 2 + host.w * L[0], wy: hp.y - hh + hh * L[1], w: m.w, kind: 'build', task: id,
        center: true, skew: L[2], label: m.label, noShadow: true, z: (host.z != null ? origin(i).y + host.z : hp.y) + 0.5 };
    }
    const p = W(i, b.at);
    return { art: b.art, wx: p.x, wy: p.y, w: b.w, kind: 'build', task: id, label: m.label };
  }
  function buildScene() {
    const s = st(), out = [];
    const push = (o) => { o.z = o.z != null ? o.z : o.wy; out.push(o); };
    for (let i = 0; i < NA; i++) {
      if (!isOpen(i)) continue;
      const a = D.AREAS[i];
      a.tasks.forEach((t) => {
        if (anim && anim.id === t.id) return;               // 짓는 중인 자리는 연출이 그려요
        const b = T.build[t.id], done = EDIT || !!s.tasks[t.id];     // 자리 잡기(?edit=1): 다 지은 모습 + 잔해 자리도 같이
        if (!done || EDIT) (b.clears || []).forEach((c) => { const p = W(i, [c[1], c[2]]); push({ art: c[0], wx: p.x, wy: p.y, w: c[3], kind: 'debris', task: t.id }); });
        if (!done) return;
        if (b.kind === 'G') return;
        if (b.mount) { const m = mountObj(t.id, i); if (m) push(m); return; }
        const art = b.kind === 'B3' ? lookArt(t.id) : b.art;
        const p = W(i, b.at);
        const o = { art, wx: p.x, wy: p.y, w: b.w, kind: 'build', task: t.id, b3: b.kind === 'B3', lights: b.lights, fx: b.fx };
        if (b.z) o.z = origin(i).y + b.z;
        if (b.fx === 'bob') { o.dyn = true; }
        push(o);
        (b.rep || []).forEach((r) => { const q = W(i, r); push({ art, wx: q.x, wy: q.y, w: b.w, kind: 'build', task: t.id, rep: true }); });
      });
      // 6지역 등대 자리: 무너진 등대 → (나선 계단) 비계 → (외벽) 등대
      if (a.id === 'r6' && !EDIT && !s.tasks.r6_wall && !(anim && (anim.id === 'r6_wall' || anim.id === 'r6_stairs'))) {
        const p = W(i, T.ruin.at);
        if (s.tasks.r6_stairs) push({ art: T.ruin.scaffold, wx: p.x, wy: p.y + 10, w: T.ruin.sw, kind: 'scaf' });
        else push({ art: T.ruin.art, wx: p.x, wy: p.y, w: T.ruin.w, kind: 'ruin' });
      }
    }
    Object.keys(s.placed || {}).forEach((id) => {
      if (s.decos.indexOf(id) < 0 || id === placing) return;
      const d = decoArt(id), p = s.placed[id];
      if (d && isOpen(areaAt(p.wx, p.wy))) push({ art: d.art, wx: p.wx, wy: p.wy, w: d.w, kind: 'deco', deco: id });
    });
    out.sort((a, b) => a.z - b.z);
    return out;
  }
  function getScene() { if (sceneOf !== sceneVer || !sceneList) { sceneList = buildScene(); sceneOf = sceneVer; } return sceneList; }

  /* ---------- 카메라 ---------- */
  let cv = null, cx = null, stat = null, sx = null;    // 화면 캔버스 · 정지 층 캔버스
  let VW = 360, VH = 640, DPR = 1;
  const cam = { x: 0, y: 0, s: 0.4 };
  let vel = { x: 0, y: 0 }, fly = null, shake = 0;
  // 위 칸·아래 버튼이 가리는 화면 높이 (resize 때 실제 크기로) · 섬은 그 사이 칸에 맞춰요
  let UI_T = 70, UI_B = 90;
  // 지역 테두리 (지도 px · data.js TOWN.areas.box) · 끌기·확대 한계는 섬 전체(TOWN.island · 잠긴 지역도 안개 너머로 구경해요)
  function boxOf(i) { const b = T.areas[D.AREAS[i].id].box; return { x0: b[0], y0: b[1], x1: b[2], y1: b[3] }; }
  function islandBox() { const b = T.island; return { x0: b[0], y0: b[1], x1: b[2], y1: b[3] }; }
  const availH = () => Math.max(160, VH - UI_T - UI_B);
  // 가장 작게: 섬 전체가 위·아래 칸 사이에 다 보일 만큼 · 가장 크게: 화면 폭에 380px
  const sMax = () => VW / 380;
  const sMin = () => { const b = islandBox(); return Math.min(sMax() * 0.9, Math.min((VW - 16) / (b.x1 - b.x0 + 80), availH() / (b.y1 - b.y0 + 80))); };
  // 지역 하나를 화면에 맞춰 보기: 지역이 화면 폭을 거의 채우게(세로 폰은 가장자리만 살짝 잘림 · 끌어서 봐요) · 높이는 위·아래 칸 사이 안
  function frameOf(i) {
    const b = boxOf(i), bw = b.x1 - b.x0, bh = b.y1 - b.y0, c = T.areas[D.AREAS[i].id].center || [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    const s = clamp(Math.min(availH() / (bh + 30), (VW - 16) / (VW > VH ? bw + 40 : bw * 0.78)), sMin(), sMax());
    return { x: c[0], y: c[1] - (UI_T - UI_B) / 2 / s, s };
  }
  const sDef = () => frameOf(openN()).s;
  // 끌기 한계: 섬 테두리 밖으로는 화면 여유(가로 40px · 위아래는 칸 아래로 20px)까지만 · 화면보다 작으면 가운데
  function clampCam(soft) {
    cam.s = clamp(cam.s, sMin(), sMax());
    const b = islandBox(), s = cam.s, hw = VW / 2 / s, sl = (soft ? 60 : 0) / s;
    const xlo = b.x0 - 40 / s + hw - sl, xhi = b.x1 + 40 / s - hw + sl;
    const ylo = b.y0 + (VH / 2 - UI_T - 20) / s - sl, yhi = b.y1 - (VH / 2 - UI_B - 20) / s + sl;
    cam.x = xlo <= xhi ? clamp(cam.x, xlo, xhi) : (xlo + xhi) / 2;
    cam.y = ylo <= yhi ? clamp(cam.y, ylo, yhi) : (ylo + yhi) / 2;
  }
  const toScr = (wx, wy) => ({ x: (wx - cam.x) * cam.s + VW / 2, y: (wy - cam.y) * cam.s + VH / 2 });
  const toWorld = (x, y) => ({ x: (x - VW / 2) / cam.s + cam.x, y: (y - VH / 2) / cam.s + cam.y });
  function flyTo(x, y, s, ms, done) {
    const keep = { x: cam.x, y: cam.y, s: cam.s };   // 도착 자리도 지도 안으로
    cam.x = x; cam.y = y; cam.s = s == null ? cam.s : s; clampCam(); const to = { x: cam.x, y: cam.y, s: cam.s };
    Object.assign(cam, keep);
    fly = { x0: cam.x, y0: cam.y, s0: cam.s, x: to.x, y: to.y, s: to.s, t0: performance.now(), ms: F.reduced ? 1 : (ms || 650), done };
    vel = { x: 0, y: 0 };
  }
  function areaCenter(i) { const c = T.areas[D.AREAS[i].id].center; return { x: c[0], y: c[1] }; }
  function resize() {
    if (!cv) return;
    VW = cv.clientWidth || innerWidth; VH = cv.clientHeight || innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    if (VW * VH * DPR * DPR > 2.4e6) DPR = Math.max(1, Math.sqrt(2.4e6 / (VW * VH)));
    [cv, stat].forEach((c) => { c.width = Math.round(VW * DPR); c.height = Math.round(VH * DPR); });
    try {
      const top = $('town').querySelector('.tw-top'), bot = $('town').querySelector('.tw-bot');
      if (top) UI_T = Math.max(40, top.getBoundingClientRect().bottom - cv.getBoundingClientRect().top);
      if (bot) UI_B = Math.max(40, cv.getBoundingClientRect().bottom - bot.getBoundingClientRect().top);
    } catch (e) { /* 기본값 */ }
    statKey = '';
    clampCam();
  }

  /* ---------- 그리기 ---------- */
  let statKey = '', raf = 0, lastFrame = 0, running = false;
  const SEA = T.sea;
  function phase() {
    if (st().settings.alwaysDay) return 'day';
    const h = new Date().getHours();
    return h >= 6 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'dusk' : 'night';
  }
  // 발밑 정보 (그림마다 한 번): PNG 아래 투명 여백(padB) · 바닥 띠(받침·기단) 실루엣으로 만든 접지 그림자 그림
  //  건물 그림은 3/4 시점이라 '맨 아래 점'이 앞 모서리예요 → 동그란 그림자를 그 점에 두면 기단 아래로 떨어져 떠 보여요.
  //  그래서 그림의 아래 28% 실루엣을 어둡게 칠하고 흐리게 번진 그림자를 기단 바로 밑(살짝 아래로)에 깔아요 → 기단 테두리에 딱 붙어요.
  const SH_W = 192, SH_P = 14;
  function footOf(o) {
    if (o.foot !== undefined) return o.foot;
    o.foot = null;
    try {
      const W0 = SH_W, H0 = Math.max(1, Math.round(SH_W * o.h / o.w));
      const c = document.createElement('canvas'); c.width = W0; c.height = H0;
      const q = c.getContext('2d'); q.drawImage(o.im, 0, 0, W0, H0);
      const d = q.getImageData(0, 0, W0, H0).data;
      let top = -1, bot = -1;
      for (let y = 0; y < H0 && top < 0; y++) for (let x = 0; x < W0; x++) if (d[(y * W0 + x) * 4 + 3] > 128) { top = y; break; }
      for (let y = H0 - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < W0; x++) if (d[(y * W0 + x) * 4 + 3] > 128) { bot = y; break; }
      if (top < 0) return o.foot;
      const bandTop = Math.floor(bot - (bot - top) * 0.28);
      let bl = W0, br = 0;
      for (let y = bandTop; y <= bot; y++) for (let x = 0; x < W0; x++) if (d[(y * W0 + x) * 4 + 3] > 128) { if (x < bl) bl = x; if (x > br) br = x; }
      // 바닥 띠만 남기고 어둡게
      q.clearRect(0, 0, W0, bandTop);
      q.globalCompositeOperation = 'source-in'; q.fillStyle = 'rgb(46,32,22)'; q.fillRect(0, 0, W0, H0);
      q.globalCompositeOperation = 'source-over';
      const sh = document.createElement('canvas'); sh.width = W0 + SH_P * 2; sh.height = H0 + SH_P * 2;
      const g2 = sh.getContext('2d');
      // 1) 기단 자리 타원 (옅게 · 바닥 띠 가운데에서 발밑보다 조금 아래까지 · 떨어지지 않게)
      const ecx = SH_P + (bl + br) / 2, bh = bot - bandTop, ecy = SH_P + bot - bh * 0.32, erx = (br - bl) * 0.56, ery = Math.max(3, bh * 0.52);
      g2.save(); g2.translate(ecx, ecy); g2.scale(1, ery / erx);
      const gr = g2.createRadialGradient(0, 0, 0, 0, 0, erx);
      gr.addColorStop(0, 'rgba(46,32,22,.5)'); gr.addColorStop(0.7, 'rgba(46,32,22,.32)'); gr.addColorStop(1, 'rgba(46,32,22,0)');
      g2.fillStyle = gr; g2.beginPath(); g2.arc(0, 0, erx, 0, 6.283); g2.fill(); g2.restore();
      // 2) 바닥 띠 실루엣을 흐리게 (테두리에 붙는 진한 그림자)
      if (typeof g2.filter === 'string') { g2.filter = 'blur(3px)'; g2.drawImage(c, SH_P, SH_P); g2.filter = 'none'; }
      else { g2.globalAlpha = 0.18; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g2.drawImage(c, SH_P + Math.cos(a) * 3, SH_P + Math.sin(a) * 2); } g2.globalAlpha = 1; }
      o.foot = { padB: (H0 - 1 - bot) / H0, shadow: sh, sk: o.w / W0 };
    } catch (e) { o.foot = null; }
    return o.foot;
  }
  function spriteRect(o) {
    const im = img(o.art);
    if (!im) return null;
    const h = o.w * im.h / im.w;
    if (o.center) { const sk = Math.abs(o.skew || 0) * o.w; return { im, x: o.wx - o.w / 2, y: o.wy - h / 2 - sk / 2, w: o.w, h: h + sk }; }
    const f = footOf(im), pb = f ? f.padB * h : 0;      // 투명 여백만큼 내려서 그림의 진짜 바닥이 발밑 자리에 닿게
    return { im, x: o.wx - o.w / 2, y: o.wy - h + pb, w: o.w, h };
  }
  // 현판 글씨 (그림은 빈 나무판이라 코드로 써요)
  function drawLabel(g, text, w, h) {
    let fs = Math.min(h * 0.46, w * 0.8 / Math.max(1, text.length));
    if (fs < 4) return;
    g.font = `${fs}px Jua, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#5b3416'; g.fillText(text, 0, h * 0.02);
  }
  // 접지 그림자: 그 그림의 바닥 띠 실루엣(흐림)을 기단 바로 밑에 · 살짝 아래·옆으로 번져 테두리에 붙은 진한 그림자 (떨어진 동그라미 아님)
  let shadowDone = false;
  const hasShadow = (o) => !o.noShadow && !o.center && o.fx !== 'bob' && o.fx !== 'pond';
  function groundShadow(g, o, sc) {
    if (!hasShadow(o)) return;
    const r = spriteRect(o); if (!r) return;
    const f = footOf(r.im); if (!f) return;
    const s = cam.s, kx = typeof sc === 'object' && sc ? sc.x : (sc || 1), ky = typeof sc === 'object' && sc ? sc.y : (sc || 1);
    const fx = (o.wx - cam.x) * s + VW / 2, fy = (o.wy - cam.y) * s + VH / 2;
    const ws = r.w * s * kx, hs = r.h * s * ky;                   // 화면 위 그림 크기
    const u = ws / SH_W;                                          // 그림자 그림 1px → 화면 px
    const top = fy - hs + f.padB * r.h * s * ky;                  // 그림 위쪽 (spriteRect 와 같은 자리)
    const light = o.kind === 'debris' || o.kind === 'deco';
    const drop = Math.max(2, ws * 0.028);                         // 아래로 살짝 (기단 앞 모서리 밑으로 진하게 보이는 만큼)
    const spread = 1.07;                                          // 옆으로 살짝 넓게
    const uy = u * ky / kx, W2 = f.shadow.width * u * spread;
    g.globalAlpha = light ? 0.5 : 0.78;
    g.drawImage(f.shadow, fx - W2 / 2, top - SH_P * uy + drop, W2, f.shadow.height * uy);
    g.globalAlpha = 1;
  }
  function drawSprite(g, o, sc, dy, alpha) {
    const r = spriteRect(o);
    if (!r) return;
    const s = cam.s;
    if (o.center) {   // 가운데 기준 + 벽 기울기 (현판)
      const ih = o.w * r.im.h / r.im.w, cxs = (o.wx - cam.x) * s + VW / 2, cys = (o.wy - cam.y) * s + VH / 2 + (dy || 0) * s;
      if (cxs < -80 || cys < -80 || cxs > VW + 80 || cys > VH + 80) return;
      if (alpha != null) g.globalAlpha = alpha;
      g.save(); g.translate(cxs, cys);
      if (sc && sc !== 1) g.scale(typeof sc === 'object' ? sc.x : sc, typeof sc === 'object' ? sc.y : sc);
      g.transform(1, o.skew || 0, 0, 1, 0, 0);
      g.drawImage(r.im.im, -o.w * s / 2, -ih * s / 2, o.w * s, ih * s);
      if (o.label) drawLabel(g, o.label, o.w * s, ih * s);
      g.restore();
      if (alpha != null) g.globalAlpha = 1;
      return;
    }
    const x = (r.x - cam.x) * s + VW / 2, y = (r.y - cam.y) * s + VH / 2 + (dy || 0) * s;
    if (x > VW + 40 || y > VH + 40 || x + r.w * s < -40 || y + r.h * s < -40) return;
    if (!o.noShadow && !shadowDone) groundShadow(g, o, sc);
    if (alpha != null) g.globalAlpha = alpha;
    if (sc && sc !== 1) {
      const fx = (o.wx - cam.x) * s + VW / 2, fy = (o.wy - cam.y) * s + VH / 2;
      const sy = typeof sc === 'object' ? sc.y : sc, sxx = typeof sc === 'object' ? sc.x : sc;
      g.save(); g.translate(fx, fy); g.scale(sxx, sy);
      g.drawImage(r.im.im || r.im, -r.w * s / 2, (r.y - o.wy) * s + (dy || 0) * s, r.w * s, r.h * s);
      g.restore();
    } else g.drawImage(r.im.im, x, y, r.w * s, r.h * s);
    if (o.label && !(sc && sc !== 1)) { g.save(); g.translate(x + r.w * s / 2, y + r.h * s / 2); drawLabel(g, o.label, r.w * s, r.h * s); g.restore(); }
    if (alpha != null) g.globalAlpha = 1;
  }
  // 지도: 멀리서는 map_lo(1024²) 1장 · 화면 1px 에 지도 픽셀이 1/3 보다 많이 들어갈 만큼 가까우면 보이는 512² 조각만 받아서 위에 (조각이 오기 전엔 map_lo 가 보여요)
  function drawMap(g) {
    const s = cam.s, x0 = (0 - cam.x) * s + VW / 2, y0 = (0 - cam.y) * s + VH / 2;
    const lo = img('map_lo');
    if (lo) g.drawImage(lo.im, x0, y0, MW * s, MH * s);
    if (s * DPR <= 1024 / MW * 1.1) return;
    const w0 = toWorld(0, 0), w1 = toWorld(VW, VH);
    const c0 = clamp(Math.floor(w0.x / TILE), 0, NT - 1), c1 = clamp(Math.floor(w1.x / TILE), 0, NT - 1);
    const r0 = clamp(Math.floor(w0.y / TILE), 0, NT - 1), r1 = clamp(Math.floor(w1.y / TILE), 0, NT - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const t = img(`map_${c}_${r}`); if (!t) continue;
      const ax = Math.floor(x0 + c * TILE * s), ay = Math.floor(y0 + r * TILE * s);
      const bx = Math.ceil(x0 + (c + 1) * TILE * s), by = Math.ceil(y0 + (r + 1) * TILE * s);   // 정수 px 로 붙여 이음매 실선이 안 보이게
      g.drawImage(t.im, ax, ay, bx - ax, by - ay);
    }
  }
  function drawStatic(g) {
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = SEA; g.fillRect(0, 0, VW, VH);
    const s = cam.s;
    drawMap(g);
    // 4지역 연못: 맑게 하기 전엔 탁한 물
    const i4 = 3;
    if (isOpen(i4) && !st().tasks.r4_pond && !EDIT) {
      const p = W(i4, T.pond.at), q = toScr(p.x, p.y);
      g.fillStyle = 'rgba(120,104,70,.55)';
      g.beginPath(); g.ellipse(q.x, q.y, T.pond.rx * s, T.pond.ry * s, -0.15, 0, 6.283); g.fill();
    }
    const sc = getScene();
    const skip = (o) => o.dyn || (bounce[o.task] && o.task) || o.task === tapBounce.id;
    // 그림자를 먼저 다 깔고 → 발밑 y 순서로 그림 (앞 건물 그림자가 뒤 건물 위에 얹히지 않게)
    for (let k = 0; k < sc.length; k++) if (!skip(sc[k]) && spriteRect(sc[k])) groundShadow(g, sc[k]);
    shadowDone = true;
    for (let k = 0; k < sc.length; k++) if (!skip(sc[k])) drawSprite(g, sc[k]);
    shadowDone = false;
  }
  // 반짝 별 (편지 조각 · 완성 연출)
  function glint(g, x, y, r, a) {
    g.save(); g.translate(x, y); g.globalAlpha = a;
    g.fillStyle = '#fff6c8';
    g.beginPath();
    for (let k = 0; k < 8; k++) { const rr = k % 2 ? r * 0.28 : r; const an = k * Math.PI / 4; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    g.closePath(); g.fill();
    g.globalAlpha = a * 0.5; g.fillStyle = '#ffd25a'; g.beginPath(); g.arc(0, 0, r * 0.35, 0, 6.283); g.fill();
    g.restore();
  }
  // ---------- 안개 (잠긴 지역) ----------
  //  안개 틀 = 잠긴 지역 칸(core.zoneAt) × 땅(map_land) 을 192² 로 만들어 경계를 부드럽게 → 지도 위에 늘여서 '여기만 안개'로 오려요
  //  안개 모양: 반 해상도 캔버스에 옅은 바탕 + 지도에 붙어 천천히 흐르는 구름 (밝은 구름 · 푸른 그늘 구름)
  //  지역이 열리면: 그 지역 가운데부터 구멍이 넓어지며 걷히고 구름 덩이가 바깥으로 흩어져요 (fogLift)
  const FM = 192;
  let zoneGrid = null, fogMask = null, revealMask = null, fogKey = '', fc = null, fcx = null;
  let cloud = null, cloudShade = null;
  function puff(rgb, a0) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    [[128, 140, 90], [80, 150, 60], [176, 150, 64], [110, 105, 58], [160, 110, 50]].forEach(([x, y, r]) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a0})`); gr.addColorStop(0.7, `rgba(${rgb},${a0 * 0.75})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    });
    return c;
  }
  function cloudSprite() { if (!cloud) { cloud = puff('255,255,255', 0.95); cloudShade = puff('150,172,182', 0.55); } return cloud; }
  function makeMask(want) {
    if (!zoneGrid) {
      zoneGrid = new Int8Array(FM * FM);
      for (let y = 0; y < FM; y++) for (let x = 0; x < FM; x++) zoneGrid[y * FM + x] = areaAt((x + 0.5) / FM * MW, (y + 0.5) / FM * MH);
    }
    const a = new Float32Array(FM * FM);
    let any = false;
    for (let y = 0; y < FM; y++) for (let x = 0; x < FM; x++) {
      const k = y * FM + x;
      if (!want(zoneGrid[k])) continue;
      a[k] = Math.min(1, landAt((x + 0.5) / FM * MW, (y + 0.5) / FM * MH) * 1.15);
      if (a[k] > 0) any = true;
    }
    if (!any) return null;
    // 지역 경계를 부드럽게 (가로·세로 상자 흐림 2번 · 반지름 3칸 ≈ 48px)
    const tmp = new Float32Array(FM * FM), R = 3;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < FM; y++) for (let x = 0; x < FM; x++) { let acc = 0; for (let d = -R; d <= R; d++) acc += a[y * FM + clamp(x + d, 0, FM - 1)]; tmp[y * FM + x] = acc / (2 * R + 1); }
      for (let y = 0; y < FM; y++) for (let x = 0; x < FM; x++) { let acc = 0; for (let d = -R; d <= R; d++) acc += tmp[clamp(y + d, 0, FM - 1) * FM + x]; a[y * FM + x] = acc / (2 * R + 1); }
    }
    const c = document.createElement('canvas'); c.width = c.height = FM;
    const g = c.getContext('2d'), im = g.createImageData(FM, FM);
    for (let k = 0; k < a.length; k++) { im.data[k * 4] = im.data[k * 4 + 1] = im.data[k * 4 + 2] = 255; im.data[k * 4 + 3] = Math.round(clamp(a[k], 0, 1) * 255); }
    g.putImageData(im, 0, 0);
    return c;
  }
  // 구름 바탕 한 장 (반 해상도) → mask 로 오려요 · hole = 걷히는 구멍 크기 (0~1.35 · holeI 지역 가운데부터)
  function fogLayer(t, mask, hole, holeI) {
    const w = Math.ceil(VW / 2), h = Math.ceil(VH / 2);
    if (!fc) { fc = document.createElement('canvas'); fcx = fc.getContext('2d'); }
    if (fc.width !== w || fc.height !== h) { fc.width = w; fc.height = h; }
    const q = fcx, s = cam.s, cs = cloudSprite(), isl = T.island, iw = isl[2] - isl[0] + 800, ih = isl[3] - isl[1] + 800;
    q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1; q.clearRect(0, 0, w, h);
    q.setTransform(0.5, 0, 0, 0.5, 0, 0);
    q.fillStyle = 'rgba(230,240,238,.86)'; q.fillRect(0, 0, VW, VH);
    const go = F.reduced ? 0 : 1;
    for (let k = 0; k < 26; k++) {
      const sz = (520 + (k % 4) * 170) * s, sp = 0.000012 * (1 + (k % 3) * 0.4) * go;
      const wx = isl[0] - 400 + ((k * 0.383 + t * sp) % 1) * iw, wy = isl[1] - 400 + ((k * 0.617 + (k % 5) * 0.09) % 1) * ih;
      const p = toScr(wx, wy);
      if (p.x < -sz || p.x > VW + sz || p.y < -sz || p.y > VH + sz) continue;
      const shade = k % 3 === 0;
      q.globalAlpha = shade ? 0.7 : 0.85;
      q.drawImage(shade ? cloudShade : cs, p.x - sz / 2, p.y - sz * 0.36 + (shade ? sz * 0.12 : 0), sz, sz * 0.72);
    }
    q.globalAlpha = 1;
    q.globalCompositeOperation = 'destination-in';
    q.imageSmoothingEnabled = true;
    const o = toScr(0, 0);
    q.drawImage(mask, o.x, o.y, MW * s, MH * s);
    if (hole > 0) {
      const b = boxOf(holeI), c = T.areas[D.AREAS[holeI].id].center, cp = toScr(c[0], c[1]);
      const rx = (b.x1 - b.x0) * 0.62 * s, ry = (b.y1 - b.y0) * 0.62 * s, m = Math.max(rx, ry), r = Math.max(1, hole * m);
      q.globalCompositeOperation = 'destination-out';
      q.save(); q.translate(cp.x, cp.y); q.scale(rx / m, ry / m);
      const gr = q.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.7, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      q.fillStyle = gr; q.beginPath(); q.arc(0, 0, r, 0, 6.283); q.fill(); q.restore();
    }
    q.globalCompositeOperation = 'source-over';
    return fc;
  }
  const REVEAL_MS = 2000;
  function drawFog(g, t) {
    if (EDIT) return;
    const lift = fogLift ? fogLift.i : -1;
    if (!land) landAt(0, 0);                                  // 땅 지도가 오면 읽어 둬요 (오기 전엔 지역 칸 전체 → 오면 안개 틀을 다시)
    const key = D.AREAS.map((a, i) => (isOpen(i) && i !== lift ? 1 : 0)).join('') + '|' + lift + '|' + (land ? 1 : 0);
    if (key !== fogKey) {
      fogKey = key;
      fogMask = makeMask((i) => !isOpen(i) && i !== lift);
      revealMask = lift >= 0 ? makeMask((i) => i === lift) : null;
    }
    if (fogMask) g.drawImage(fogLayer(t, fogMask, 0), 0, 0, VW, VH);
    // 걷히기: 지역 가운데부터 구멍이 넓어지고 · 구름 덩이가 바깥으로 흩어지며 옅어져요 (카메라가 도착한 뒤 t0 부터)
    if (revealMask && fogLift) {
      const e = t - fogLift.t0, k = clamp(e / REVEAL_MS, 0, 1), ek = easeOut(k);
      if (k < 1) g.drawImage(fogLayer(t, revealMask, e > 0 ? ek * 1.35 : 0, lift), 0, 0, VW, VH);
      if (e > 0 && k < 1) {
        const c = T.areas[D.AREAS[lift].id].center, cp = toScr(c[0], c[1]), b = boxOf(lift), s = cam.s, cs = cloudSprite();
        for (let n = 0; n < 12; n++) {
          const an = n / 12 * 6.283 + 0.3, dist = (0.15 + 0.85 * ek) * (b.x1 - b.x0) * 0.55 * s, sz = (300 + (n % 3) * 90) * s * (1 + ek * 0.6);
          g.globalAlpha = (1 - k) * 0.85;
          g.drawImage(cs, cp.x + Math.cos(an) * dist - sz / 2, cp.y + Math.sin(an) * dist * 0.7 - sz * 0.36, sz, sz * 0.72);
        }
        g.globalAlpha = 1;
        if (k < 0.5) glint(g, cp.x, cp.y - 20, 30 + 40 * ek, 1 - k * 2);
      }
    }
    // 잠긴 지역 이름표 (다음 지역은 이름 · 그 너머는 ???) · 다음 작업 말풍선과 겹치면 숨겨요
    let bub = null;
    const be = $('tw-bub');
    if (be && !be.classList.contains('hide')) { const r = be.getBoundingClientRect(), c = cv.getBoundingClientRect(); bub = { x0: r.left - c.left, y0: r.top - c.top, x1: r.right - c.left, y1: r.bottom - c.top }; }
    const tags = [];
    for (let i = 0; i < NA; i++) {
      if (isOpen(i) || i === lift) continue;
      const c = T.areas[D.AREAS[i].id].center, p = toScr(c[0], c[1]);
      if (p.x < -120 || p.x > VW + 120 || p.y < -60 || p.y > VH + 60) continue;
      const name = i === st().area + 1 || i === fogHold ? D.AREAS[i].name : '???';
      const sub = i === fogHold ? '곧 열려요!' : `${i}번째 지역을 다 고치면 열려요`;
      const f1 = Math.max(15, Math.min(24, 60 * cam.s)), f2 = Math.max(11, Math.min(16, 40 * cam.s));
      g.font = `${f1}px Jua, sans-serif`; const w1 = g.measureText('🔒 ' + name).width;
      g.font = `${f2}px Jua, sans-serif`; const w2 = g.measureText(sub).width;
      const bw = Math.max(w1, w2) + 28, bh = f1 + f2 + 22;
      // 위 칸(이름·동전)·아래 버튼 밑으로 숨지 않게 그 사이 칸 안으로 (지역 가운데가 칸 밖이면 가장자리에 붙여요)
      const lo = UI_T + bh / 2 + 8, hi = VH - UI_B - bh / 2 - 8;
      if (hi < lo || p.y < lo - bh * 2 || p.y > hi + bh * 2) continue;
      p.y = clamp(p.y, lo, hi); p.x = clamp(p.x, bw / 2 + 8, VW - bw / 2 - 8);
      if (bub && p.x + bw / 2 > bub.x0 && p.x - bw / 2 < bub.x1 && p.y + bh / 2 > bub.y0 && p.y - bh / 2 < bub.y1) continue;
      if (tags.some((r) => p.x + bw / 2 > r.x0 && p.x - bw / 2 < r.x1 && p.y + bh / 2 > r.y0 && p.y - bh / 2 < r.y1)) continue;   // 이름표끼리 겹치면 앞 것만
      tags.push({ x0: p.x - bw / 2, x1: p.x + bw / 2, y0: p.y - bh / 2, y1: p.y + bh / 2 });
      g.fillStyle = 'rgba(255,250,242,.82)';
      g.beginPath(); if (g.roundRect) g.roundRect(p.x - bw / 2, p.y - bh / 2, bw, bh, 14); else g.rect(p.x - bw / 2, p.y - bh / 2, bw, bh); g.fill();
      g.fillStyle = 'rgba(90,70,60,.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${f1}px Jua, sans-serif`; g.fillText('🔒 ' + name, p.x, p.y - f2 / 2 - 2);
      g.font = `${f2}px Jua, sans-serif`; g.fillText(sub, p.x, p.y + f1 / 2 + 2);
    }
  }
  // 걷는 사람 · 몽돌
  let walkers = [];
  function makeWalkers() {
    const s = st(), list = [];
    for (let i = 0; i < NA && list.length < 8; i++) {
      if (!isOpen(i)) continue;
      const ta = T.areas[D.AREAS[i].id];
      const path = ta.paths[0].map((p) => W(i, p));
      list.push(walker(ta.who, 'w_' + ta.who, path, 96, i));
    }
    const i = openN(), ta = T.areas[D.AREAS[i].id];
    const hp = (ta.paths[1] || ta.paths[0]).map((p) => W(i, p));
    const hy = walker('hayun', D.OUTFITS[s.outfit].art, hp, 100, i);
    list.push(hy);
    const mg = walker('mongdol', 'w_mongdol', hp, 0, i);
    mg.follow = hy; mg.w = 62; mg.x -= 40;
    list.push(mg);
    walkers = list;
  }
  function walker(who, art, path, h, i) {
    return { who, art, path, h, area: i, seg: 0, dirS: 1, x: path[0].x, y: path[0].y, pause: Math.random() * 2000, flip: false, hop: 0, phase: Math.random() * 10 };
  }
  function stepWalkers(dt, t) {
    if (F.reduced) return;
    walkers.forEach((w) => {
      if (w.hold && t < w.hold) return;
      if (w.follow) {   // 몽돌: 하윤 뒤를 졸졸
        const f = w.follow, tx = f.x + (f.flip ? 46 : -46), ty = f.y + 6;
        const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
        if (d > 8) { const v = Math.min(d, 60 * dt / 1000 * (d > 120 ? 3 : 1)); w.x += dx / d * v; w.y += dy / d * v; w.moving = true; if (Math.abs(dx) > 2) w.flip = dx > 0; } else w.moving = false;
        return;
      }
      if (w.pause > 0) { w.pause -= dt; w.moving = false; return; }
      const nx = w.seg + w.dirS;
      if (nx < 0 || nx >= w.path.length) { w.dirS = -w.dirS; w.pause = 2000 + Math.random() * 4000; return; }
      const p = w.path[nx], dx = p.x - w.x, dy = p.y - w.y, d = Math.hypot(dx, dy), v = 38 * dt / 1000;
      if (d <= v) { w.x = p.x; w.y = p.y; w.seg = nx; if (Math.random() < 0.35) w.pause = 1200 + Math.random() * 2500; }
      else { w.x += dx / d * v; w.y += dy / d * v; }
      w.moving = true;
      if (Math.abs(dx) > 1) w.flip = dx > 0;
    });
  }
  function walkerDraw(g, w, t) {
    const o = img(w.art);
    if (!o) return;
    const s = cam.s;
    const ww = w.w || w.h * o.w / o.h, hh = ww * o.h / o.w;
    const p = toScr(w.x, w.y);
    if (p.x < -80 || p.x > VW + 80 || p.y < -80 || p.y > VH + 200) return;
    const bob = w.moving ? Math.abs(Math.sin((t / 400 + w.phase) * Math.PI)) * 3 : 0;
    const hop = w.hop > t ? Math.abs(Math.sin((w.hop - t) / 160)) * 16 : 0;
    g.fillStyle = 'rgba(60,40,30,.2)';
    g.beginPath(); g.ellipse(p.x, p.y, ww * 0.32 * s, ww * 0.1 * s, 0, 0, 6.283); g.fill();
    g.save();
    g.translate(p.x, p.y - (bob + hop) * s);
    if (w.flip !== (w.who === 'mongdol')) g.scale(-1, 1);   // 몽돌 그림은 왼쪽을 봐요
    g.drawImage(o.im, -ww * s / 2, -hh * s, ww * s, hh * s);
    if (w.who === 'mongdol' && st().mongAcc) {
      const m = D.MONG_ACC[st().mongAcc];
      const ax = (m.at[0] - 0.5) * ww * s, ay = -hh * s + m.at[1] * hh * s, aw = m.at[2] * ww * s;
      const ai = m.art ? img(m.art) : null;
      if (ai) g.drawImage(ai.im, ax - aw / 2, ay - aw * ai.h / ai.w / 2, aw, aw * ai.h / ai.w);
      else if (m.deco) { g.font = `${aw}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🎀', ax, ay); }
    }
    g.restore();
    w.box = { x: p.x - ww * s / 2, y: p.y - hh * s - (bob + hop) * s, w: ww * s, h: hh * s };
  }
  function drawDynamic(g, t) {
    const s = cam.s, sc = getScene(), ph = phase();
    // 배 (바다 위 출렁 · 천천히 오감) · 나룻배
    T.boats.forEach((b, k) => {
      if (!img(b[0])) return;
      const drift = F.reduced ? 0 : Math.sin(t / 9000 / (1 + k * 0.3) + k) * b[4];
      drawSprite(g, { art: b[0], wx: b[1] + drift, wy: b[2], w: b[3], noShadow: true }, null, F.reduced ? 0 : Math.sin(t / 700 + k) * 3);
    });
    sc.forEach((o) => {
      if (o.dyn) drawSprite(g, o, null, F.reduced ? 0 : Math.sin(t / 650) * 3);
      else if (o.task && (bounce[o.task] || o.task === tapBounce.id)) {
        const k = clamp((t - tapBounce.t0) / 500, 0, 1);
        drawSprite(g, o, { x: 1 + Math.sin(k * Math.PI * 3) * 0.05 * (1 - k), y: 1 - Math.sin(k * Math.PI * 3) * 0.07 * (1 - k) });
      }
    });
    if (tapBounce.id && t - tapBounce.t0 > 520) { tapBounce.id = null; statKey = ''; }
    // 짓기 연출
    if (anim) drawAnim(g, t);
    // 다음 작업 자리: 점선 원 + 통통 망치
    const info = C.areaInfo(st());
    if (!anim && info.next && !info.finished && isOpen(info.index)) {
      const p = sitePos(info.next.id), q = toScr(p.x, p.y), b = T.build[info.next.id];
      const r = (b.w || 150) * 0.45 * s;
      g.save(); g.setLineDash([6, 6]); g.lineDashOffset = -t / 60; g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(q.x, q.y, Math.max(22, r), Math.max(9, r * 0.36), 0, 0, 6.283); g.stroke(); g.restore();
    }
    // 숨은 비밀
    secretSpots = [];
    for (let i = 0; i < NA; i++) {
      if (!isOpen(i) || hold) continue;
      C.secretsIn(st(), i, now()).forEach((x) => {
        const p = W(i, [x.x, x.y]), q = toScr(p.x, p.y);
        if (q.x < -30 || q.x > VW + 30 || q.y < -30 || q.y > VH + 30) return;
        if (x.kind === 'letter') glint(g, q.x, q.y, (9 + Math.sin(t / 300 + x.x) * 3) * Math.max(0.8, s * 2.2), 0.65 + Math.sin(t / 420 + x.y) * 0.3);
        else {
          const o = img(x.kind === 'gull' ? 'ui:secret_seagull' : 'ui:secret_bottle');
          const sz = Math.max(16, 64 * s);
          if (o) g.drawImage(o.im, q.x - sz / 2, q.y - sz + (x.kind === 'bottle' ? Math.sin(t / 500) * 3 : 0), sz, sz);
        }
        secretSpots.push({ x: q.x, y: q.y - (x.kind === 'letter' ? 0 : 14), kind: x.kind, id: x.id });
      });
    }
    // 걷는 사람 (발밑 y 순서)
    walkers.slice().sort((a, b) => a.y - b.y).forEach((w) => walkerDraw(g, w, t));
    // 가림: 걷는 사람보다 앞(발밑 y 가 아래)에 있는 건물·장식이 겹치면 그 위에 다시 그려요 (정지 층은 그대로 · 겹친 것만)
    walkers.forEach((w) => {
      if (!w.box) return;
      sc.forEach((o) => {
        if (o.z <= w.y || o.dyn || o.kind === 'debris') return;
        const r = spriteRect(o); if (!r) return;
        const q = toScr(r.x, r.y), ww = r.w * cam.s, hh = r.h * cam.s;
        if (q.x > w.box.x + w.box.w || q.x + ww < w.box.x || q.y > w.box.y + w.box.h || q.y + hh < w.box.y) return;
        g.save(); g.beginPath(); g.rect(w.box.x - 2, w.box.y - 2, w.box.w + 4, w.box.h + 8); g.clip();
        drawSprite(g, Object.assign({}, o, { noShadow: true }));
        g.restore();
      });
    });
    // 꾸미기: 살짝 어둡게 + 지은 건물에 연필
    if (deco) {
      g.fillStyle = 'rgba(40,30,60,.14)'; g.fillRect(0, 0, VW, VH);
      sc.forEach((o) => {
        if (!o.b3 || o.rep) return;
        const q = toScr(o.wx, o.wy);
        g.font = '20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#fff'; g.beginPath(); g.arc(q.x, q.y - 8, 15, 0, 6.283); g.fill();
        g.fillText('✏️', q.x, q.y - 8);
      });
    }
    // 낮 · 노을 · 밤 (덮개 + 불빛 · 등대 빛줄기)
    if (ph !== 'day') {
      g.fillStyle = ph === 'night' ? 'rgba(24,30,78,.42)' : 'rgba(255,140,150,.16)';
      g.fillRect(0, 0, VW, VH);
      g.globalCompositeOperation = 'lighter';
      sc.forEach((o) => {
        if (!o.lights) return;
        const r = spriteRect(o); if (!r) return;
        o.lights.forEach((l, k) => {
          const q = toScr(r.x + r.w * l[0], r.y + r.h * l[1]);
          if (q.x < -60 || q.x > VW + 60 || q.y < -60 || q.y > VH + 60) return;
          const rad = Math.max(10, 46 * s) * (ph === 'night' ? 1 : 0.6) * (1 + (F.reduced ? 0 : Math.sin(t / 260 + k * 2 + o.wx) * 0.06));
          const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad);
          gr.addColorStop(0, 'rgba(255,200,110,.75)'); gr.addColorStop(1, 'rgba(255,170,80,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, rad, 0, 6.283); g.fill();
        });
      });
      g.globalCompositeOperation = 'source-over';
    }
    if (st().tasks.r6_light && isOpen(5) && ph !== 'day') drawBeam(g, t);
    if (st().tasks.r6_lens && !st().tasks.r6_light && isOpen(5)) { const p = sitePos('r6_lens'), q = toScr(p.x, p.y); glint(g, q.x, q.y, 10 + Math.sin(t / 200) * 4, 0.9); }
    drawFog(g, t);
  }
  function drawBeam(g, t) {
    const p = sitePos('r6_light'), q = toScr(p.x, p.y), L = 900 * cam.s, an = F.reduced ? 0.4 : (t / 2600) % (Math.PI * 2);
    g.save(); g.translate(q.x, q.y); g.rotate(an); g.globalCompositeOperation = 'lighter';
    const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,240,180,.55)'); gr.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, -L * 0.12); g.lineTo(L, L * 0.12); g.closePath(); g.fill();
    g.rotate(Math.PI); g.beginPath(); g.moveTo(0, 0); g.lineTo(L, -L * 0.12); g.lineTo(L, L * 0.12); g.closePath(); g.fill();
    g.restore();
    glint(g, q.x, q.y, 14, 0.9);
  }
  // 짓기 연출 (anim.t0 기준 ms)
  function drawAnim(g, t) {
    const a = anim, e = t - a.t0, s = cam.s, b = T.build[a.id], x = taskOf(a.id);
    const site = sitePos(a.id), q = toScr(site.x, site.y);
    // 잔해: 흔들 → 사라짐
    const clears = (b.clears || []).map((c) => W(x.i, [c[1], c[2], c[3], c[0]]));
    const before = a.id === 'r6_stairs' ? [{ art: T.ruin.art, w: T.ruin.w, p: W(x.i, T.ruin.at) }] : a.id === 'r6_wall' ? [{ art: T.ruin.scaffold, w: T.ruin.sw, p: W(x.i, T.ruin.at) }] : [];
    (b.clears || []).forEach((c) => before.push({ art: c[0], w: c[3], p: W(x.i, [c[1], c[2]]) }));
    const shakeEnd = a.G ? 1000 : 900;
    if (e < shakeEnd) {
      const k = clamp((e - 450) / (shakeEnd - 450), 0, 1);
      before.forEach((d) => drawSprite(g, { art: d.art, wx: d.p.x + (k > 0 ? Math.sin(e / 25) * 4 * (1 - k) : 0), wy: d.p.y, w: d.w, kind: 'debris' }, null, 0, 1 - k));
    }
    if (a.G) {
      if (a.id === 'r6_stairs' && e > 900) drawSprite(g, { art: T.ruin.scaffold, wx: W(x.i, T.ruin.at).x, wy: W(x.i, T.ruin.at).y + 10, w: T.ruin.sw }, { x: 1, y: clamp((e - 900) / 350, 0.01, 1) });
      if (e > 1000) { const k = clamp((e - 1000) / 400, 0, 1); glint(g, q.x, q.y - 20 * s, 30 * (1 - k) + 8, 1 - k); }
      return;
    }
    // 비계가 솟고 망치 통통
    const sw = Math.max(110, (b.w || 150) * 0.8);
    if (e >= 900 && e < 1750) {
      const k = clamp((e - 900) / 260, 0.01, 1);
      drawSprite(g, { art: T.ruin.scaffold, wx: site.x, wy: site.y, w: sw }, { x: 1, y: easeOut(k) });
      if (e > 1150) {
        const hk = ((e - 1150) % 200) / 200;
        g.font = `${Math.max(22, 54 * s)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.save(); g.translate(q.x + sw * 0.3 * s, q.y - sw * 1.0 * s - Math.abs(Math.sin(hk * Math.PI)) * 14); g.rotate(-0.6 + hk * 0.9); g.fillText('🔨', 0, 0); g.restore();
      }
    }
    // 번쩍
    if (e >= 1650 && e < 1900) {
      const k = (e - 1650) / 250, r = (b.w || 150) * s * (0.6 + k);
      const gr = g.createRadialGradient(q.x, q.y - r * 0.4, 0, q.x, q.y - r * 0.4, r);
      gr.addColorStop(0, `rgba(255,255,255,${0.95 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y - r * 0.4, r, 0, 6.283); g.fill();
    }
    // 뿅! (0.6 → 1.12 → 0.96 → 1 · 위아래 눌림)
    if (e >= 1750) {
      const k = clamp((e - 1750) / 450, 0, 1);
      const sc = k < 0.45 ? 0.6 + (1.12 - 0.6) * (k / 0.45) : k < 0.75 ? 1.12 - 0.16 * ((k - 0.45) / 0.3) : 0.96 + 0.04 * ((k - 0.75) / 0.25);
      const art = b.kind === 'B3' ? lookArt(a.id) : b.art;
      const mo = b.mount ? mountObj(a.id, x.i) : null;
      if (mo) { drawSprite(g, mo, { x: sc * (k < 0.45 ? 0.94 : 1), y: sc * (k < 0.45 ? 1.06 : 1) }); return; }
      const all = [b.at].concat(b.rep || []);
      all.forEach((p) => { const w = W(x.i, p); drawSprite(g, { art, wx: w.x, wy: w.y, w: b.w, fx: b.fx }, { x: sc * (k < 0.45 ? 0.94 : 1), y: sc * (k < 0.45 ? 1.06 : 1) }); });
    }
  }

  function frame(t) {
    raf = 0;
    if (!running || !cv) return;
    schedule();
    if (t - lastFrame < 31) return;   // 초당 30장까지
    const dt = Math.min(80, t - (lastFrame || t));
    lastFrame = t;
    // 카메라 움직임 (날아가기 · 관성 · 탄성)
    if (fly) {
      const k = clamp((t - fly.t0) / fly.ms, 0, 1), e = easeOut(k);
      cam.x = fly.x0 + (fly.x - fly.x0) * e; cam.y = fly.y0 + (fly.y - fly.y0) * e; cam.s = fly.s0 + (fly.s - fly.s0) * e;
      if (k >= 1) { const d = fly.done; fly = null; if (d) d(); }
    } else if (!pointers.size) {
      if (Math.abs(vel.x) + Math.abs(vel.y) > 0.02) { cam.x -= vel.x * dt / cam.s; cam.y -= vel.y * dt / cam.s; vel.x *= 0.9; vel.y *= 0.9; }
      const bx = cam.x, by = cam.y; clampCam(false);
      if (bx !== cam.x || by !== cam.y) { const tx = cam.x, ty = cam.y; cam.x = bx + (tx - bx) * 0.25; cam.y = by + (ty - by) * 0.25; vel.x *= 0.5; vel.y *= 0.5; }
    }
    stepWalkers(dt, t);
    const shx = shake > t ? Math.sin(t / 18) * 2.5 : 0;
    const key = `${cam.x.toFixed(1)},${cam.y.toFixed(1)},${cam.s.toFixed(4)},${sceneVer},${VW}x${VH},${st().area},${fogHold}`;
    if (key !== statKey) { drawStatic(sx); statKey = key; }
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.drawImage(stat, shx * DPR, 0);
    cx.setTransform(DPR, 0, 0, DPR, shx * DPR, 0);
    drawDynamic(cx, t);
    if (anim && t - anim.t0 >= anim.dur) finishAnim();
    placeBubble();
    updateTitle();
  }
  // 화면이 가려지면 rAF 가 멈춰요 → 초당 4장 타이머로 (짓기 연출·카메라가 멈춰 조작이 막히는 일 없게 · 배터리는 거의 안 씀)
  let timer = 0;
  function schedule() {
    if (document.hidden) { timer = setTimeout(() => { timer = 0; frame(performance.now()); }, 250); raf = -1; }
    else raf = requestAnimationFrame(frame);
  }
  function start() { if (!running) { running = true; lastFrame = 0; schedule(); } }
  function stop() { running = false; if (raf > 0) cancelAnimationFrame(raf); clearTimeout(timer); raf = 0; timer = 0; }
  document.addEventListener('visibilitychange', () => { if (running) { stop(); start(); } });
  const isShown = () => !$('town').classList.contains('hide');

  /* ---------- 화면 틀 (DOM) ---------- */
  let deco = false, placing = null, hold = null, fogLift = null, pick = null, drawer = false;
  let secretSpots = [];
  const bounce = {};
  const tapBounce = { id: null, t0: 0 };
  function shell() {
    const box = $('town');
    box.innerHTML = `<canvas class="tw-cv" id="tw-cv"></canvas>
      <header class="tw-top">
        <button type="button" class="chip round" data-tw="close" aria-label="판으로">‹</button>
        <div class="tw-title"><b id="tw-name"></b><small id="tw-sub"></small></div>
        <div class="chip tw-coins">${U.artImg('coin', '동전')}<b id="tw-coins"></b></div>
        <div class="chip tw-stars">${U.STAR}<b id="tw-stars"></b></div>
      </header>
      <div class="tw-bub hide" id="tw-bub"></div>
      <div class="tw-banner hide" id="tw-banner"></div>
      <div class="tw-tray hide" id="tw-tray"></div>
      <div class="tw-drawer hide" id="tw-drawer"></div>
      <div class="tw-pick hide" id="tw-pick"></div>
      <nav class="tw-bot">
        <button type="button" class="tw-nb" data-tw="close"><span>🧩</span>판으로</button>
        <button type="button" class="tw-nb" data-tw="deco" id="tw-deco"><span>🎀</span>꾸미기</button>
        <button type="button" class="tw-nb" data-tw="folk"><span>💌</span>마을 사람</button>
        <button type="button" class="tw-nb main" data-tw="list" id="tw-listb"><span>📋</span><b id="tw-prog"></b></button>
      </nav>
      ${EDIT ? '<div class="tw-edit"><b>자리 잡기</b> 끌어서 옮겨요 <button type="button" data-tw="copy">좌표 복사</button></div>' : ''}`;
    cv = $('tw-cv'); cx = cv.getContext('2d');
    stat = document.createElement('canvas'); sx = stat.getContext('2d');
    bindInput();
  }
  function updateTitle() {
    const c = areaAt(cam.x, cam.y), a = D.AREAS[c];
    const nm = $('tw-name'); if (!nm) return;
    const txt = !a ? '' : isOpen(c) ? a.name : '안개 속 지역';
    if (nm.textContent !== txt) nm.textContent = txt;
    const done = a ? a.tasks.filter((t) => st().tasks[t.id]).length : 0;
    const sub = !a ? '' : isOpen(c) ? `${a.sub} · ${done}/${a.tasks.length}` : `${c + 1}번째 지역`;
    const sb = $('tw-sub'); if (sb.textContent !== sub) sb.textContent = sub;
    const hc = $('tw-coins'), hs = $('tw-stars');
    if (hc.textContent !== String(st().coins)) hc.textContent = st().coins;
    if (hs.textContent !== String(st().stars) && !starHold) hs.textContent = st().stars;
    const info = C.areaInfo(st());
    const pr = info.finished ? '완성 🏮' : `작업 ${info.doneN}/${info.total}`;
    const pe = $('tw-prog'); if (pe.textContent !== pr) pe.textContent = pr;
    $('tw-listb').classList.toggle('ready', info.canAfford);
  }
  let starHold = false;

  // 다음 작업 말풍선 (지도 위 그 자리에 · 별 가격 + [짓기])
  let bubFor = '';
  function bubbleHTML(info) {
    const t = info.next, s = st();
    if (!t) return '';
    const so = t.req && !s.sos[t.req] ? D.STORY_ORDERS[t.req] : null;
    const verb = T.build[t.id].kind === 'G' ? '고치기' : '짓기';
    const btn = so ? `<button type="button" class="tw-go req" data-req="${t.req}">부탁 먼저</button>`
      : `<button type="button" class="tw-go${s.stars < t.cost ? ' poor' : ''}" data-task="${t.id}">${verb} ${U.STAR}${t.cost}</button>`;
    return `<b>${esc(t.name)}</b>${btn}`;
  }
  function placeBubble() {
    const el = $('tw-bub'); if (!el) return;
    const info = C.areaInfo(st());
    const show = !anim && !pick && !deco && !hold && !drawer && info.next && isOpen(info.index) && $('talk').classList.contains('hide');
    if (!show) { if (!el.classList.contains('hide')) el.classList.add('hide'); return; }
    const key = info.next.id + ':' + st().stars + ':' + (st().sos[info.next.req] ? 1 : 0);
    if (key !== bubFor) { el.innerHTML = bubbleHTML(info); bubFor = key; }
    const p = sitePos(info.next.id), q = toScr(p.x, p.y);
    const b = T.build[info.next.id], h = (b.w || 150) * (b.kind === 'B3' ? 0.95 : 0.7) * cam.s;
    if (q.x < -20 || q.x > VW + 20 || q.y < 90 || q.y > VH - 60) { el.classList.add('hide'); return; }   // 그 자리가 화면 밖이면 숨김 (작업 목록에서 찾아가요)
    const y = clamp(q.y - h - 8, 70, VH - 150), x = clamp(q.x, 90, VW - 90);
    el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)`;
    el.classList.remove('hide');
  }

  /* ---------- 열기 · 닫기 ---------- */
  let sessCam = null;
  function open() {
    if (U.busy) return;
    const s = st();
    F.sfx('open');
    $('town').classList.remove('hide');
    shell();
    deco = false; placing = null; hold = null; pick = null; drawer = false;
    resize();
    // 이 화면을 연 뒤 다시 들어오면 보던 자리 · 새로 열면 지금 지역 섬을 화면에 맞춰요 (옛 저장의 카메라는 안 써요)
    const c = sessCam && isOpen(areaAt(sessCam.x, sessCam.y)) ? sessCam : null;
    if (c) { cam.x = c.x; cam.y = c.y; cam.s = clamp(c.z, sMin(), sMax()); }
    else { const f = frameOf(openN()); cam.x = f.x; cam.y = f.y; cam.s = f.s; }
    clampCam();
    dirty(); makeWalkers(); start();
    U.musicTick();
    const area = D.AREAS[s.area];
    if (s.seen.townNew) setTimeout(newLookIntro, 400);
    else if (area && area.open.scene && !s.story[area.open.scene]) setTimeout(() => scene(area.open.scene), 250);
  }
  function close() {
    if (anim || hold) return;
    if (pick) { closePick(); }
    st().cam = sessCam = { x: Math.round(cam.x), y: Math.round(cam.y), z: +cam.s.toFixed(4) };
    U.changed();
    stop();
    $('town').classList.add('hide');
    $('town').innerHTML = '';
    cv = null;
    F.sfx('close');
    U.renderAll();
    U.musicTick();
  }
  function scene(id, done) {
    const lines = D.STORY[id];
    if (!lines) { if (done) done(); return; }
    U.talk(lines, (skipped) => { st().story[id] = skipped && !st().story[id] ? 'skip' : true; U.changed(); if (done) done(); });
  }
  // v4 로 옮긴 저장: 지은 건물이 하나씩 뿅 (한 번만)
  function newLookIntro() {
    const s = st();
    delete s.seen.townNew; U.changed();
    U.toast('마을이 새 모습이 됐어요! 🏡');
    const p = frameOf(openN());
    flyTo(p.x, p.y, p.s, 700, () => {
      getScene().filter((o) => o.kind === 'build' && areaAt(o.wx, o.wy) === openN()).slice(0, 12).forEach((o, k) => setTimeout(() => {
        if (!cv) return;
        const q = toScr(o.wx, o.wy - o.w * 0.4), r = cv.getBoundingClientRect();
        F.burst(r.left + q.x, r.top + q.y, ['#ffd25a', '#ffffff', '#8fd3c8'], 12, 1);
        F.sfx('spawn');
      }, 200 + k * 160));
    });
  }

  /* ---------- 짓기 ---------- */
  function doTask(id) {
    if (anim || hold) return;
    const s = st();
    const r = C.doTask(s, id, now(), Math.random);
    if (!r.ok) {
      F.sfx('bad');
      if (r.reason === 'stars') U.toast(`별이 ${r.need}개 더 필요해요 · 부탁을 들어주면 받아요`);
      else if (r.reason === 'req') U.toast(`${D.VILLAGERS[D.STORY_ORDERS[r.so].who].name}의 금색 부탁 카드를 먼저 들어줘요`);
      const bt = document.querySelector('#tw-bub .tw-go'); if (bt) U.restartAnim(bt, 'wig1');
      return;
    }
    U.clearUndo(); U.changed();
    // 지역을 다 고쳤으면 다음 지역은 [다음 지역] 을 누를 때까지 안개 그대로 (짓는 연출 중에 미리 걷히지 않게)
    if (r.areaDone) { fogHold = r.nextArea ? D.AREAS.indexOf(r.doneArea) + 1 : -1; makeWalkers(); }
    closeDrawer();
    const b = T.build[id];
    const G = b.kind === 'G';
    const site = sitePos(id);
    flyTo(site.x, site.y - (b.w || 150) * 0.3, Math.max(cam.s, sDef()), 380);
    anim = { id, t0: performance.now() + 380, dur: F.reduced ? 200 : (G ? 1450 : 2250), G, r, fired: {} };
    dirty();
    // 별이 위 숫자에서 그 자리로
    starHold = true;
    setTimeout(() => {
      if (!cv) return;
      const rc = cv.getBoundingClientRect(), q = toScr(site.x, site.y);
      F.fly(U.STAR, U.center(document.querySelector('.tw-stars')), { x: rc.left + q.x, y: rc.top + q.y - 30 }, { count: Math.min(6, r.task.cost), ms: 520, spread: 20, size: 26, s1: 0.5 });
      starHold = false;
      F.sfx('pick');
    }, 380);
    const at = (ms, fn) => setTimeout(() => { if (anim && anim.id === id && cv) fn(); }, 380 + ms);
    const burstAt = (cols, n, pw, dy) => { const rc = cv.getBoundingClientRect(), q = toScr(site.x, site.y); F.burst(rc.left + q.x, rc.top + q.y - (dy || 0), cols, n, pw); };
    at(480, () => { burstAt(['#c9a27a', '#e8d5b5', '#a68b6b', '#ffffff'], 22, 1.3, 10); F.sfx('sand'); });
    if (G) at(1000, () => { burstAt(['#ffd25a', '#ffffff', '#8fd3c8'], 20, 1.2, 20); F.sfx('build'); F.vibrate(14); });
    else {
      at(1150, () => { F.sfx('hammer'); shake = performance.now() + 500; });
      at(1750, () => { burstAt(['#ffd25a', '#ffffff', '#8fd3c8', '#ff9eb5'], 28, 1.7, (b.w || 150) * cam.s * 0.5); F.sfx('build'); F.jingle('build'); F.vibrate([12, 30, 12]); });
    }
  }
  function skipAnim() { if (anim) anim.t0 = performance.now() - anim.dur; }
  function finishAnim() {
    const a = anim; anim = null; dirty(); statKey = '';
    makeWalkers();
    const r = a.r, id = a.id;
    const after = () => {
      if (r.areaDone) areaDone(r);
      else { U.renderNav(); bubFor = ''; }
    };
    const next = () => {
      // 장면 주인공이 건물 앞으로 와서 통통 (지도에서)
      const sid = r.task.scene, lines = sid && D.STORY[sid];
      if (lines) {
        const who = (lines.find((l) => l.who !== 'hayun' && D.VILLAGERS[l.who] && !D.VILLAGERS[l.who].letter) || {}).who || 'hayun';
        const w = walkers.find((x) => x.who === who) || walkers.find((x) => x.who === 'hayun');
        if (w) { const p = sitePos(id); w.x = p.x + 70; w.y = p.y + 30; w.hop = performance.now() + 2600; w.hold = performance.now() + 4000; w.flip = false; }
        setTimeout(() => scene(sid, after), 450);
      } else after();
    };
    if (T.build[id].kind === 'B3') openPick(id, true, next);
    else next();
  }

  /* ---------- 모양 고르기 (1개 무료 · 나머지 동전 · 미리보기는 지도에서 바로) ---------- */
  function openPick(id, first, done) {
    const b = T.build[id];
    const own = C.looksOwned(st(), id);
    pick = { id, sel: first && !own.length ? 0 : C.lookOf(st(), id), first: !own.length, done };
    preview[id] = pick.sel; dirty();
    const site = sitePos(id);
    const s1 = clamp(Math.max(cam.s, sDef() * 1.2), sMin(), sMax());
    flyTo(site.x, site.y - b.w * 0.3 + VH * 0.2 / s1, s1, 450);   // 건물이 아래 창 위쪽에 보이게
    renderPick();
    F.sfx('open');
  }
  function renderPick() {
    const el = $('tw-pick'); if (!el || !pick) return;
    const s = st(), b = T.build[pick.id], own = C.looksOwned(s, pick.id), price = C.lookPrice(s, pick.id);
    const cards = b.looks.map((nm, k) => {
      const src = A.src('t_' + b.art + '_' + 'abc'[k]);
      const tag = own.indexOf(k) >= 0 ? (C.lookOf(s, pick.id) === k ? '지금 모양' : '✓ 가진 모양') : pick.first ? '무료' : `${U.artImg('coin', '')}${price}`;
      return `<button type="button" class="tw-look${pick.sel === k ? ' on' : ''}" data-look="${k}">${src ? `<img src="${esc(src)}" alt="">` : ''}<span>${esc(nm)}</span><em>${tag}</em></button>`;
    }).join('');
    const has = own.indexOf(pick.sel) >= 0;
    const label = pick.first ? '이걸로! (무료)' : has ? '이 모양으로' : `열고 바꾸기 · ${U.artImg('coin', '')}${price}`;
    const name = taskOf(pick.id).t.name;
    el.innerHTML = `<div class="tw-pick-box"><h3>모양 고르기 <small>${esc(name)}</small></h3>
      <p class="muted">${pick.first ? '하나는 무료! 나머지 둘은 나중에 [꾸미기]에서 동전으로 열어요' : '연 모양끼리는 언제든 무료로 바꿔요'}</p>
      <div class="tw-looks">${cards}</div>
      <button type="button" class="btn main" data-pk="ok" ${!pick.first && !has && s.coins < price ? 'disabled' : ''}>${label}</button>
      ${!pick.first && !has && s.coins < price ? `<p class="center muted">동전이 ${price - s.coins}개 모자라요</p>` : ''}
      <button type="button" class="btn" data-pk="close">${pick.first ? '첫 번째 모양으로 할래요' : '닫기'}</button></div>`;
    el.classList.remove('hide');
  }
  function pickClick(btn, confirmed) {
    if (!pick) return;
    // 동전이 드는 새 모양은 먼저 물어봐요 (상점과 같이)
    if (!confirmed && btn.dataset.pk === 'ok' && U.askYesNo) {
      const own = C.looksOwned(st(), pick.id);
      if (own.length && own.indexOf(pick.sel) < 0) {
        const nm = `「${T.build[pick.id].looks[pick.sel]}」 모양`;
        U.askYesNo(C.buyAsk(nm, C.lookPrice(st(), pick.id), 'coins'), () => pickClick(btn, true));
        return;
      }
    }
    if (btn.dataset.look != null) { pick.sel = Number(btn.dataset.look); preview[pick.id] = pick.sel; dirty(); F.sfx('pick'); renderPick(); return; }
    if (btn.dataset.pk === 'ok') {
      const r = C.setLook(st(), pick.id, pick.sel, now(), true);
      if (!r.ok) { F.sfx('bad'); U.toast(r.reason === 'coins' ? `동전이 ${r.short}개 모자라요` : '고를 수 없어요'); return; }
      F.sfx(r.price ? 'deliver' : 'discover'); F.vibrate(12);
      U.toast(r.free ? '마음에 드는 모양으로 지었어요!' : r.price ? `새 모양을 열었어요 (동전 ${r.price})` : '모양을 바꿨어요');
      const p = sitePos(pick.id), q = toScr(p.x, p.y), rc = cv.getBoundingClientRect();
      F.burst(rc.left + q.x, rc.top + q.y - 40, ['#ffd25a', '#ffffff', '#ff9eb5'], 16, 1.1);
      U.changed();
      closePick();
    } else if (btn.dataset.pk === 'close') closePick();
  }
  function closePick() {
    if (!pick) return;
    const p = pick; pick = null;
    if (p.first) C.firstLook(st(), p.id, now());
    delete preview[p.id]; dirty(); statKey = '';
    U.changed();
    const el = $('tw-pick'); if (el) { el.classList.add('hide'); el.innerHTML = ''; }
    if (p.done) p.done();
  }

  /* ---------- 지역 완성 ---------- */
  function areaDone(r) {
    const area = r.doneArea, ai = D.AREAS.indexOf(area);
    hold = area;
    fogHold = r.nextArea ? ai + 1 : -1;
    dirty(); statKey = '';
    const c = areaCenter(ai);
    flyTo(c.x, c.y, frameOf(ai).s * 0.92, 900, () => {
      const list = getScene().filter((o) => o.kind === 'build' && areaAt(o.wx, o.wy) === ai);
      list.forEach((o, k) => setTimeout(() => {
        if (!cv) return;
        const q = toScr(o.wx, o.wy - o.w * 0.4), rc = cv.getBoundingClientRect();
        F.burst(rc.left + q.x, rc.top + q.y, ['#ffd25a', '#ffffff', '#ff9eb5', '#8fd3c8'], 10, 0.9); F.sfx('spawn');
      }, k * 140));
      setTimeout(() => {
        if (!cv) return;
        const rc = cv.getBoundingClientRect();
        F.jingle(r.ending ? 'ending' : 'area'); F.sfx('build'); F.vibrate([20, 40, 20, 40, 60]);
        for (let i = 0; i < 5; i++) setTimeout(() => F.burst(rc.left + VW * (0.2 + Math.random() * 0.6), rc.top + VH * (0.2 + Math.random() * 0.4), ['#ffd25a', '#ffffff', '#ff9eb5', '#8fd3c8'], 26, 1.8), i * 220);
        banner(`<b>${esc(area.name)}</b><span>복원 완료!</span>`);
        U.setBg();
        setTimeout(() => {
          const finish = () => {
            const gens = r.given.map((x) => D.GENS[x.cell.g].name), lines = [];
            if (r.uncovered.length) lines.push(`모래더미 ${r.uncovered.length}칸이 걷혔어요`);
            if (gens.length) lines.push(`새 발생기: ${gens.join(' · ')}${r.given.some((x) => x.at < 0) ? ' (선물함)' : ''}`);
            const next = r.nextArea;
            banner(`<b>${esc(area.name)}</b><span>복원 완료!</span>${lines.map((l) => `<small>${esc(l)}</small>`).join('')}
              <button type="button" class="btn main" data-tw="next">${next ? `다음 지역: ${esc(next.name)} →` : '마을 둘러보기'}</button>`);
            if (!next && C.secretCounts(st()).album) setTimeout(() => U.toast('편지 12장을 다 모았어요! ☰ 수첩에서 「할머니의 앨범」이 열렸어요'), 800);
          };
          const ending = () => (r.ending ? scene(r.ending, () => { st().seen.ending = true; U.changed(); finish(); }) : finish());
          area.done.scene ? scene(area.done.scene, ending) : ending();
        }, 1400);
      }, list.length * 140 + 300);
    });
  }
  function banner(html) { const b = $('tw-banner'); if (!b) return; b.innerHTML = html; b.classList.remove('hide'); }
  function goNext() {
    const b = $('tw-banner'); if (b) b.classList.add('hide');
    hold = null;
    const ni = fogHold;
    U.setBg();
    if (ni < 0) { bubFor = ''; U.toast('소라섬에 등불이 다시 켜졌어요! 부탁과 이벤트는 계속돼요'); return; }
    fogLift = { i: ni, t0: Infinity };                        // 날아가는 동안은 안개 그대로 → 도착하면 걷히기 시작
    fogHold = -1; dirty(); makeWalkers();
    const c = frameOf(ni);
    flyTo(c.x, c.y, c.s, 1100, () => {
      if (fogLift && fogLift.i === ni) fogLift.t0 = performance.now();
      F.sfx('discover'); F.vibrate([10, 30, 10]);
      setTimeout(() => { if (fogLift && fogLift.i === ni) fogLift = null; }, REVEAL_MS + 100);
      U.musicTick();
      const next = D.AREAS[ni];
      if (next.open.scene && !st().story[next.open.scene]) setTimeout(() => scene(next.open.scene), 600);
    });
  }

  /* ---------- 작업 목록 (아래 서랍) ---------- */
  function listHTML() {
    const info = C.areaInfo(st());
    const rows = info.tasks.map((x, k) => {
      const t = x.task, so = x.next && t.req && !st().sos[t.req] ? D.STORY_ORDERS[t.req] : null;
      const verb = T.build[t.id].kind === 'G' ? '고치기' : '짓기';
      const right = x.done ? '<span class="tw-done">완료 ✓</span>'
        : so ? `<button type="button" class="tw-req" data-req="${t.req}">부탁 먼저</button>`
          : x.next ? `<button type="button" class="tw-go${st().stars < t.cost ? ' poor' : ''}" data-task="${t.id}">${verb} ${U.STAR}${t.cost}</button>`
            : `<span class="tw-lock">${U.STAR}${t.cost}</span>`;
      const sub = so ? `<small class="tw-sub">${esc(D.VILLAGERS[so.who].name)}의 부탁 「${esc(so.title)}」 먼저 (금색 카드)</small>` : '';
      return `<li class="${x.done ? 'done' : x.next ? 'next' : 'lock'}" data-fly="${t.id}"><i>${k + 1}</i><span class="tw-tn">${esc(t.name)}${sub}</span>${right}</li>`;
    }).join('');
    const pct = Math.round((info.doneN / info.total) * 100);
    return `<div class="tw-dhead"><b>${esc(info.show.name)}</b><span>${info.doneN} / ${info.total}</span><button type="button" class="chip round" data-tw="list" aria-label="닫기">▾</button></div>
      <div class="tw-prog"><span style="width:${pct}%"></span></div>
      ${info.finished ? `<p class="tw-note">${st().seen.ending ? '소라섬에 등불이 다시 켜졌어요 · 부탁과 이벤트는 계속돼요 🏮' : '등대에 불이 켜졌어요!'}</p>` : ''}
      <ol class="tw-list">${rows}</ol>`;
  }
  function toggleDrawer() { drawer ? closeDrawer() : openDrawer(); }
  function openDrawer() { const el = $('tw-drawer'); el.innerHTML = listHTML(); el.classList.remove('hide'); drawer = true; F.sfx('pick'); }
  function closeDrawer() { const el = $('tw-drawer'); if (el) el.classList.add('hide'); drawer = false; }

  /* ---------- 꾸미기 (건물 모양 · 장식 놓기 · 하윤 옷장 · 몽돌) ---------- */
  function ownDecos() { return st().decos.filter((id) => id !== 'mongdol_hat' && decoArt(id)); }
  function trayHTML() {
    const s = st();
    const list = ownDecos().map((id) => {
      const d = decoArt(id), src = d.art.indexOf('ui:') === 0 ? A.src(d.art.slice(3)) : A.src('t_' + d.art);
      return `<button type="button" class="tw-db${placing === id ? ' on' : ''}${s.placed[id] ? ' here' : ''}" data-deco="${id}" aria-label="장식">${src ? `<img src="${esc(src)}" alt="">` : '🎀'}</button>`;
    }).join('');
    return `<div class="tw-tray-row"><b>꾸미기</b><small>${placing ? '지도에서 놓을 곳을 톡 · 같은 칸을 다시 누르면 거두기' : '✏️ 건물을 톡 하면 모양 바꾸기 · 장식을 고르고 지도를 톡'}</small></div>
      <div class="tw-decos">${list || '<span class="muted">장식은 상점 [꾸미기]·출석·이벤트에서 얻어요</span>'}</div>
      <div class="tw-tray-row"><button type="button" class="tw-tb" data-tw="wardrobe">👗 하윤 옷장</button><button type="button" class="tw-tb" data-tw="mongacc">🦭 몽돌 소품</button><button type="button" class="tw-tb" data-tw="shopdeco">🛍️ 장식 사기</button><button type="button" class="tw-tb done" data-tw="deco">다 했어요</button></div>`;
  }
  function setDeco(on) {
    deco = on; placing = null;
    const tr = $('tw-tray');
    if (on) { tr.innerHTML = trayHTML(); tr.classList.remove('hide'); closeDrawer(); U.toast('꾸미기: 건물을 톡 → 모양 바꾸기'); }
    else { tr.classList.add('hide'); }
    $('tw-deco').classList.toggle('on', on);
    dirty(); F.sfx('pick');
  }
  function renderTray() { if (deco) $('tw-tray').innerHTML = trayHTML(); }
  function placeAtWorld(p) {
    const res = C.placeDeco(st(), placing, p.x, p.y, now());
    if (!res.ok) return;
    placing = null; F.sfx('drop'); U.changed(); dirty(); renderTray();
  }

  /* ---------- 조작: 끌기 · 두 손가락 확대 · 휠 · 톡 ---------- */
  const pointers = new Map();
  let gest = null, editDrag = null;
  function bindInput() {
    cv.addEventListener('pointerdown', (e) => {
      F.unlock();
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      fly = null; vel = { x: 0, y: 0 };
      const rc = cv.getBoundingClientRect();
      if (pointers.size === 1) {
        gest = { x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, lt: performance.now(), t0: performance.now(), moved: false };
        if (EDIT) editDrag = editHit(e.clientX - rc.left, e.clientY - rc.top);
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        gest = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y), s0: cam.s, w: toWorld((a.x + b.x) / 2 - rc.left, (a.y + b.y) / 2 - rc.top), moved: true };
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !gest) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const rc = cv.getBoundingClientRect();
      if (gest.pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2 - rc.left, my = (a.y + b.y) / 2 - rc.top;
        cam.s = clamp(gest.s0 * d / Math.max(10, gest.d0), sMin(), sMax());
        cam.x = gest.w.x - (mx - VW / 2) / cam.s; cam.y = gest.w.y - (my - VH / 2) / cam.s;
        clampCam(true);
        return;
      }
      if (gest.pinch) return;
      const dx = e.clientX - gest.lx, dy = e.clientY - gest.ly, t = performance.now();
      if (!gest.moved && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) > 7) gest.moved = true;
      if (gest.moved) {
        if (editDrag) { editMove(editDrag, dx / cam.s, dy / cam.s); }
        else {
          cam.x -= dx / cam.s; cam.y -= dy / cam.s; clampCam(true);
          const dt = Math.max(8, t - gest.lt); vel = { x: dx / dt, y: dy / dt };
        }
      }
      gest.lx = e.clientX; gest.ly = e.clientY; gest.lt = t;
    });
    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (!gest) return;
      if (gest.pinch) { if (pointers.size === 0) gest = null; else { const p = [...pointers.values()][0]; gest = { x0: p.x, y0: p.y, lx: p.x, ly: p.y, lt: performance.now(), t0: performance.now(), moved: true }; } return; }
      if (!gest.moved && performance.now() - gest.t0 < 450 && e.type === 'pointerup') {
        const rc = cv.getBoundingClientRect();
        tap(e.clientX - rc.left, e.clientY - rc.top);
      }
      if (performance.now() - gest.lt > 90) vel = { x: 0, y: 0 };
      if (editDrag) { editDrag = null; vel = { x: 0, y: 0 }; }
      gest = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rc = cv.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top, w = toWorld(mx, my);
      cam.s = clamp(cam.s * Math.exp(-e.deltaY * 0.0015), sMin(), sMax());
      cam.x = w.x - (mx - VW / 2) / cam.s; cam.y = w.y - (my - VH / 2) / cam.s; clampCam();
      fly = null;
    }, { passive: false });
  }
  // 톡: 연출 건너뛰기 → 비밀 → 걷는 사람 → 장식(꾸미기) → 건물 → 다음 작업 자리 → 장식 놓기
  function hitSprite(x, y, filter) {
    const sc = getScene();
    for (let k = sc.length - 1; k >= 0; k--) {
      const o = sc[k];
      if (filter && !filter(o)) continue;
      const r = spriteRect(o); if (!r) continue;
      const q = toScr(r.x, r.y), w = r.w * cam.s, h = r.h * cam.s;
      if (x < q.x || y < q.y || x > q.x + w || y > q.y + h) continue;
      if (alphaAt(r.im, (x - q.x) / w, (y - q.y) / h) > 40) return o;
    }
    return null;
  }
  function tap(x, y) {
    if (anim) { skipAnim(); return; }
    if (pick || hold) return;
    if (drawer) { closeDrawer(); return; }
    const w = toWorld(x, y);
    if (placing) { if (!isOpen(areaAt(w.x, w.y))) U.toast('열린 지역에 놓아요'); else if (landAt(w.x, w.y) < 0.5) U.toast('땅 위에 놓아요'); else placeAtWorld(w); return; }
    const sec = secretSpots.find((p) => Math.hypot(p.x - x, p.y - y) < 26);
    if (sec && !deco) { findSecret(sec.kind, sec.id, x, y); return; }
    const wk = walkers.slice().reverse().find((v) => v.box && x >= v.box.x && x <= v.box.x + v.box.w && y >= v.box.y && y <= v.box.y + v.box.h);
    if (wk && !deco) { tapWalker(wk, x, y); return; }
    if (deco) {
      const d = hitSprite(x, y, (o) => o.kind === 'deco');
      if (d) { placing = d.deco; dirty(); renderTray(); F.sfx('pick'); U.toast('옮길 곳을 톡 하세요'); return; }
      const b = hitSprite(x, y, (o) => o.b3);
      if (b) { openPick(b.task, false); return; }
      U.toast('✏️ 표시가 있는 건물을 톡 하면 모양을 바꿔요');
      return;
    }
    const o = hitSprite(x, y, (v) => v.kind === 'build');
    if (o) { tapBuilding(o, x, y); return; }
    const info = C.areaInfo(st());
    if (info.next && isOpen(info.index)) {
      const p = sitePos(info.next.id), q = toScr(p.x, p.y);
      if (Math.hypot(q.x - x, (q.y - y) * 1.6) < Math.max(40, (T.build[info.next.id].w || 150) * 0.5 * cam.s)) { const bt = document.querySelector('#tw-bub .tw-go'); if (bt) U.restartAnim(bt, 'wig1'); F.sfx('pick'); return; }
    }
    const ai = areaAt(w.x, w.y);
    if (ai >= 0 && !isOpen(ai)) { F.sfx('bad'); U.toast(`${ai}번째 지역을 다 고치면 안개가 걷혀요`); }
  }
  function screenAbs(x, y) { const rc = cv.getBoundingClientRect(); return { x: rc.left + x, y: rc.top + y }; }
  function tapBuilding(o, x, y) {
    tapBounce.id = o.task; tapBounce.t0 = performance.now(); statKey = '';
    const r = C.tapToy(st(), o.task, now(), Math.random);
    F.sfx(o.b3 ? 'swap' : 'spawn');
    const p = screenAbs(x, y);
    if (r.coins) { F.sfx('coin'); U.floatTag(`엽전 +${r.coins}`, p.x, p.y - 30, true); U.changed(); }
  }
  function tapWalker(w, x, y) {
    w.hop = performance.now() + 900; w.pause = 2500;
    const p = screenAbs(x, y);
    if (w.who === 'mongdol') { mongHint(); return; }
    if (w.who === 'hayun') { F.sfx('pick'); U.floatTag('♥', p.x, p.y - 40); openWardrobe(); return; }
    F.sfx('spawn');
    F.hearts && F.hearts(p.x, p.y - 30);
    U.floatTag(C.thanksLine(st(), w.who), p.x, p.y - 50);
    setTimeout(() => openFriend(w.who), 500);
  }

  /* ---------- 숨은 비밀 찾기 ---------- */
  function findSecret(kind, id, x, y) {
    const r = C.findSecret(st(), kind, id, now(), Math.random);
    if (!r.ok) return;
    const p = screenAbs(x, y);
    F.sfx('secret'); F.vibrate([10, 30, 10]);
    F.burst(p.x, p.y, ['#ffd25a', '#ffffff', '#8fd3c8'], 18, 1.2);
    U.changed();
    if (kind === 'gull') {
      U.floatTag(`갈매기 ${r.count}/${r.max} · 동전 +${r.coins}`, p.x, p.y - 20, true);
      if (r.title) setTimeout(() => U.toast(`갈매기를 다 찾았어요! 칭호 「${r.title}」`), 900);
      return;
    }
    if (kind === 'letter') {
      U.floatTag(`편지 조각 ${r.count}/${r.max} · 소라별 +${r.gems}`, p.x, p.y - 20, true);
      setTimeout(() => U.talk([{ who: 'letter', text: r.text }, { who: 'mongdol', face: 'joy', text: r.count >= r.max ? '뀨우! (편지 조각을 다 모았어요!)' : '뀨!' }]), 500);
      return;
    }
    U.floatTag(`병 속 편지 · 소라별 +${r.gems}`, p.x, p.y - 20, true);
    setTimeout(() => U.talk([{ who: 'hayun', face: 'wow', text: '바닷가에 병이 떠밀려 왔어.\n안에 쪽지가 있네.' },
      { who: 'letter', text: r.note }, { who: 'hayun', face: 'joy', text: `작은 보자기도 들어 있었어!${r.gift.at < 0 ? '\n(판이 꽉 차서 선물함에)' : ''}` }]), 500);
  }
  // 몽돌: 보고 있는 지역에 편지 조각이 있으면 그곳으로 카메라
  function mongHint() {
    const i = areaAt(cam.x, cam.y);
    const ls = isOpen(i) ? C.secretsIn(st(), i, now()).filter((x) => x.kind === 'letter') : [];
    F.sfx('spawn');
    if (!ls.length) { U.toast('뀨… (여기엔 편지 조각이 없나 봐요)'); return; }
    const p = W(i, [ls[0].x, ls[0].y]);
    flyTo(p.x, p.y, Math.max(cam.s, sDef()), 700);
    U.toast('뀨뀨! (몽돌이가 반짝이는 곳을 가리켜요)');
  }

  /* ---------- 하윤 옷장 · 몽돌 소품 (상점 [꾸미기] 탭을 같이 써요) ---------- */
  function openWardrobe() { if (U.openShop) U.openShop('deco', 'outfit'); }
  function openMong() { if (U.openShop) U.openShop('deco', 'mong'); }
  // 옷·소품을 바꾸면 지도 위 걷는 그림도 바로
  function refresh() { if (cv) { makeWalkers(); dirty(); renderTray(); } }

  /* ---------- 마을 사람 · 우정 (merge_town.md §I) ---------- */
  function heartsHTML(f) {
    return Array.from({ length: D.FRIEND.lv.length }, (_, k) => `<i class="${k < f.lv ? 'on' : ''}">♥</i>`).join('');
  }
  function openFolk() {
    const rows = C.FRIENDS.map((who) => {
      const v = D.VILLAGERS[who], f = C.friendInfo(st(), who, now());
      const pct = f.next ? Math.round(((f.pts - f.prev) / (f.next - f.prev)) * 100) : 100;
      return `<button type="button" class="fr-row" data-fr="${who}">${U.faceHTML(v)}<span class="fr-txt"><b>${esc(v.name)}</b><span class="fr-h">${heartsHTML(f)}</span>
        <span class="fr-bar"><em style="width:${pct}%"></em></span></span><small>선물 ${f.left}/${D.FRIEND.perDay}</small></button>`;
    }).join('');
    U.openSheet(`<h2>마을 사람 <small class="muted">선물하면 친해져요</small></h2><div class="fr-list">${rows}</div>
      ${st().friendAll ? `<p class="center">칭호 「${esc(st().friendAll)}」</p>` : ''}
      <button type="button" class="btn" data-close="1">닫기</button>`, (b) => { if (b.dataset.fr) openFriend(b.dataset.fr); }, 'folk');
  }
  const KIND = { love: '최애 ♥♥', like: '좋아함 ♥', ok: '보통' };
  function openFriend(who) {
    const v = D.VILLAGERS[who];
    if (!v || C.FRIENDS.indexOf(who) < 0) return;
    const f = C.friendInfo(st(), who, now());
    const loves = D.FRIEND.loves[who].map((id) => {
      const known = f.seen[id] === 'love';
      return `<span class="fr-love">${known ? U.artImg(id, C.itemName({ k: 'item', c: id.replace(/\d+$/, ''), t: Number(id.match(/\d+$/)[0]) })) : '<b>?</b>'}</span>`;
    }).join('');
    const next = f.next ? `다음 단계까지 ${f.next - f.pts}점 · ${['동전', '소라별 + 편지', '장식', '이야기 + 큰 보자기', '단짝 칭호 + 하윤 옷'][f.lv]}` : '가장 친해요! ♥';
    const items = C.giftChoices(st()).slice(0, 40).map((x) => {
      const sc = C.giftScore(who, x.cell), id = C.itemId(x.cell), seen = f.seen[id];
      return `<button type="button" class="fr-it c-${x.cell.c}" data-gift="${x.from.bag != null ? 'bag:' + x.from.bag : 'board:' + x.from.board}">${U.artImg(id, C.itemName(x.cell))}<i class="tier">${x.cell.t}</i>${seen ? `<em>${seen === 'love' ? '♥♥' : seen === 'like' ? '♥' : ''}</em>` : ''}<small>+${sc.kind === 'love' && !seen ? '?' : sc.pts}</small></button>`;
    }).join('');
    U.openSheet(`<div class="fr-prof"><div class="fr-big">${U.faceHTML(v, 'joy')}</div><div><h2>${esc(v.name)}</h2><span class="fr-h big">${heartsHTML(f)}</span><small class="muted">${esc(next)}</small></div></div>
      <div class="fr-likes"><span>좋아하는 것</span>${loves}<small>${v.chains.map((c) => esc(D.CHAINS[c].name)).join(' · ')} 물건도 좋아해요</small></div>
      <h3>선물하기 <small>오늘 ${f.left}번 남음 · 부탁에 쓸 물건이면 한 번 더 물어요</small></h3>
      <div class="fr-items">${items || '<p class="muted center">판이나 가방에 물건이 없어요</p>'}</div>
      <button type="button" class="btn" data-fr-back="1">마을 사람 목록</button><button type="button" class="btn" data-close="1">닫기</button>`,
    (b) => {
      if (b.dataset.frBack) { openFolk(); return; }
      if (!b.dataset.gift) return;
      if (f.left <= 0) { F.sfx('bad'); U.toast('오늘은 선물을 다 줬어요 · 내일 또 와요'); return; }
      const [k, n] = b.dataset.gift.split(':'), from = k === 'bag' ? { bag: +n } : { board: +n };
      const cell = from.bag != null ? st().bag[from.bag] : st().board[from.board];
      const needed = cell && st().orders.some((o) => o.need.some((x) => x.c === cell.c && x.t === cell.t));
      if (needed && b.dataset.sure !== '1') { b.dataset.sure = '1'; U.toast('부탁에 쓸 물건인데 줄까요? 한 번 더 누르면 줘요'); U.restartAnim(b, 'wig1'); return; }
      giveTo(who, from, U.center(b));
    }, 'friend');
  }
  function giveTo(who, from, at) {
    const r = C.giveGift(st(), who, from, now(), Math.random);
    if (!r.ok) { F.sfx('bad'); U.toast(r.reason === 'day' ? '오늘은 선물을 다 줬어요' : '줄 수 없어요'); return; }
    U.changed(); U.renderAll();
    F.sfx(r.kind === 'love' ? 'deliver' : 'discover'); F.vibrate(14);
    if (F.hearts) F.hearts(at.x, at.y, r.kind === 'love' ? 8 : 4);
    U.floatTag(`${KIND[r.kind]} · 우정 +${r.pts}`, at.x, at.y - 30, r.kind === 'love');
    const w = walkers.find((x) => x.who === who); if (w) w.hop = performance.now() + 1400;
    U.closeSheet();
    setTimeout(() => U.talk([{ who, face: 'joy', text: r.line }], () => friendUps(r.ups)), 400);
  }
  // 우정 단계가 올랐을 때 (선물 · 부탁 건네기 모두)
  function friendUps(ups) {
    if (!ups || !ups.length) return;
    const up = ups[0], rest = ups.slice(1), v = D.VILLAGERS[up.who];
    const go = () => friendUps(rest);
    const bits = [];
    if (up.coins) bits.push(`동전 ${up.coins}`);
    if (up.gems) bits.push(`소라별 ${up.gems}`);
    if (up.gift) bits.push(`큰 보자기${up.gift.at < 0 ? '(선물함)' : ''}`);
    F.jingle('build');
    U.toast(`${v.name}와 더 친해졌어요 ♥${up.lv}${bits.length ? ' · ' + bits.join(' · ') : ''}`);
    U.renderAll();
    if (up.letter) setTimeout(() => U.talk([{ who: 'letter', text: up.letter }], go), 700);
    else if (up.scene) setTimeout(() => U.talk(D.FRIEND.scenes[up.scene], go), 700);
    else if (up.lv === 3) setTimeout(() => { U.toast(`${v.name}의 장식은 그림이 오면 받아요 (지금은 소라별로)`); go(); }, 1800);
    else if (up.title) setTimeout(() => { U.toast(`칭호 「${up.title}」!${up.all ? ` 그리고 「${up.all}」 · 무지개 소라 3` : ''}`); go(); }, 1800);
    else setTimeout(go, 600);
  }

  /* ---------- 자리 잡기 도구 (?edit=1) ---------- */
  function editHit(x, y) {
    const o = hitSprite(x, y, () => true);
    if (!o) return null;
    const ti = o.task ? taskOf(o.task) : null;
    if (o.kind === 'build' && ti && !o.rep) return { at: T.build[o.task].at };
    if (o.kind === 'debris' && ti) { const c = T.build[o.task].clears.find((c) => Math.abs(W(ti.i, [c[1], c[2]]).x - o.wx) < 1); return c ? { c } : null; }
    return null;
  }
  function editMove(d, dx, dy) {
    if (d.at) { d.at[0] = Math.round(d.at[0] + dx); d.at[1] = Math.round(d.at[1] + dy); }
    if (d.c) { d.c[1] = Math.round(d.c[1] + dx); d.c[2] = Math.round(d.c[2] + dy); }
    dirty();
  }
  function editCopy() {
    const out = {};
    Object.keys(T.build).forEach((id) => { const b = T.build[id]; out[id] = { at: b.at, clears: b.clears }; });
    const txt = JSON.stringify(out);
    try { navigator.clipboard.writeText(txt); U.toast('좌표를 복사했어요 (data.js TOWN.build 에 붙여요)'); } catch (e) { banner(`<textarea class="field" rows="6">${esc(txt)}</textarea>`); }
  }

  /* ---------- DOM 조작 ---------- */
  $('town').addEventListener('click', (e) => {
    F.unlock();
    const b = e.target.closest('button');
    if (!b) return;
    if (e.target.closest('#tw-pick')) { pickClick(b); return; }
    const tw = b.dataset.tw;
    if (tw === 'close') close();
    else if (tw === 'next') goNext();
    else if (tw === 'list') { if (!anim && !hold) toggleDrawer(); }
    else if (tw === 'deco') { if (!anim && !hold) setDeco(!deco); }
    else if (tw === 'folk') openFolk();
    else if (tw === 'wardrobe') openWardrobe();
    else if (tw === 'mongacc') openMong();
    else if (tw === 'shopdeco') { if (U.openShop) U.openShop('deco', 'filler'); }
    else if (tw === 'copy') editCopy();
    else if (b.dataset.deco) {
      const id = b.dataset.deco;
      if (placing === id) { C.placeDeco(st(), id, null, null, now()); placing = null; U.toast('장식을 거뒀어요'); U.changed(); }
      else { placing = id; U.toast('지도에서 놓을 곳을 톡 하세요'); }
      dirty(); renderTray(); F.sfx('pick');
    } else if (b.dataset.req) { F.sfx('pick'); U.toast(`${D.VILLAGERS[D.STORY_ORDERS[b.dataset.req].who].name}의 금색 부탁 카드를 먼저 들어줘요`); }
    else if (b.dataset.task) doTask(b.dataset.task);
  });
  $('town').addEventListener('click', (e) => {
    const li = e.target.closest('[data-fly]');
    if (!li || e.target.closest('button')) return;
    const p = sitePos(li.dataset.fly);
    closeDrawer();
    flyTo(p.x, p.y - 60, Math.max(cam.s, sDef()), 600);
  });
  addEventListener('resize', () => { if (isShown() && cv) resize(); });

  // 시작할 때: 별이 넉넉하면 [마을] 버튼을 살짝 흔들어 알려 줘요
  function resume() {
    U.renderNav();
    if (C.areaInfo(st()).canAfford) U.restartAnim($('btn-town'), 'wig1');
  }

  window.MergeTown = {
    open, close, resume, doTask, refresh, openFolk, openFriend, friendUps, skipAnim,
    render: () => { dirty(); bubFor = ''; },
    show: (i) => { const p = frameOf(i); flyTo(p.x, p.y, p.s, 500); },
    // 배경음악: 카메라 가운데 지역 (안 열린 곳이면 지금 지역)
    get index() { if (!cv) return openN(); const i = areaAt(cam.x, cam.y); return i >= 0 && isOpen(i) ? i : openN(); },
    get cam() { return { x: cam.x, y: cam.y, s: cam.s }; },
    get anim() { return anim; },
    toScreen: (wx, wy) => toScr(wx, wy), sitePos
  };
})();
