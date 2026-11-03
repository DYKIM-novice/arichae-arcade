/* 머지관 · 「소라섬 등불 이야기」 규칙 (화면 없음 · node 시험 가능)
   - 상태(st)는 그냥 객체 하나 → 저장은 save.js 가 JSON 으로 (v 필드로 옛 저장 변환: MIGRATE)
   - 모든 함수는 now(ms)·rng(0~1 함수)를 받아요 → 시험에서 시각·운을 정할 수 있어요
   - 판 칸: null | {k:'item', c:'a', t:3} | {k:'gen', g:'gen_a'} | {k:'wild'}(무지개 소라)
            | {k:'bubble', c, t, until}(거품 속 물건 · 못 옮김) | {k:'net', c, t}(그물에 걸린 물건 · 못 옮김) | {k:'box', b:'gift'|'chest', open}(상자 · 옮길 수 있음)
   - st.cover[i] = 모래더미 겹 수 (0 = 열린 칸) · st.bag = 가방 칸 배열(null = 빈칸) · st.gifts = 선물함(자리가 없을 때 받은 것)
   - 복원: st.area = 지금 지역 번호 · st.tasks[작업 id] = 끝낸 시각 · st.story[장면 id] = 본 장면 */
(function (root) {
  'use strict';

  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.MergeData;
  const { CHAINS, GENS, AREAS, BOARD, BAL, START, VILLAGERS, STORY_ORDERS, SECRETS, DAILY, EVENTS, LETTERS, SHOP, TOWN, OUTFITS, MONG_ACC, FRIEND, MIXES } = D;
  const FUN = BAL.fun;
  const N = BOARD.cols * BOARD.rows;
  const COLS = BOARD.cols;

  const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const maxTier = (c) => (CHAINS[c] ? CHAINS[c].tiers.length : 0);
  const isAux = (c) => !!(CHAINS[c] && CHAINS[c].aux);
  const isEvent = (c) => !!(CHAINS[c] && CHAINS[c].event);
  // 날짜 글자 → 정수 (매일 바뀌는 것: 병 속 편지 자리·오늘의 부탁)
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const itemId = (cell) => (cell && cell.k === 'item' ? cell.c + cell.t : '');
  const rc = (i) => ({ r: Math.floor(i / COLS), c: i % COLS });
  const dayKey = (now) => { const d = new Date(now); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const HOME = N - Math.ceil(COLS / 2);   // 선물이 떨어지는 곳 (맨 아래 가운데)

  function itemName(cell) {
    if (!cell) return '';
    if (cell.k === 'gen') return GENS[cell.g] ? GENS[cell.g].name : '';
    if (cell.k === 'wild') return '무지개 소라';
    if (cell.k === 'box') return (FUN.box[cell.b] || FUN.box.gift).name;
    return (CHAINS[cell.c] && CHAINS[cell.c].tiers[cell.t - 1]) || '';
  }
  // 판매값: 체인 물건 2^(단계-1) · 보조 물건은 단계만큼 · 무지개 소라 5 · 발생기는 못 팔아요
  function sellValue(x) {
    if (typeof x === 'number') return Math.pow(2, x - 1);
    if (!x || x.k === 'gen' || x.k === 'box' || x.k === 'bubble' || x.k === 'net') return 0;
    if (x.k === 'wild') return 5;
    return isAux(x.c) ? x.t : Math.pow(2, x.t - 1);
  }

  /* ---------- 새 판 ---------- */
  function newState(now, rng) {
    const board = new Array(N).fill(null);
    START.gens.forEach((g) => { board[g.at] = { k: 'gen', g: g.id }; });
    START.items.forEach((it) => { board[it.at] = { k: 'item', c: it.c, t: it.t }; });
    const cover = new Array(N).fill(0);
    (START.cover || []).forEach((cv) => cv.rows.forEach((r) => {
      for (let c = 0; c < COLS; c++) { const i = r * COLS + c; if (!board[i]) cover[i] = cv.n; }
    }));
    const st = {
      v: D.VERSION,
      board, cover,
      energy: START.energy, energyAt: now,
      coins: START.coins, stars: START.stars, starsEarned: 0, gems: START.gems || 0,
      orders: [], orderSeq: 0, skipAt: 0,
      found: {}, unlocked: START.chains.slice(),
      refill: { day: dayKey(now), n: 0 },
      stats: { merges: 0, spawns: 0, delivered: 0, sold: 0, best: {} },
      // 소리 크기 vol·bgmVol = 0~100 (v3 부터 · 옛 1~3 단계는 MIGRATE[2]) · bgm 은 처음부터 켜짐 (첫 톡 뒤에 들려요)
      settings: { sfx: true, vib: true, easy: false, nums: true, hint: true, bgm: true, bgmAsked: true, vol: 65, bgmVol: 60, quietNight: false, bgmStyle: 'piano', autoKeep: true, big: false, calm: false, alwaysDay: false },
      seen: {},
      area: 0, tasks: {}, story: {},
      bag: new Array(BAL.bagStart).fill(null), gifts: [], charge: {},
      events: {},
      genLv: {},                 // 발생기 강화 단계 (0~5 · 옛 저장의 0~3 도 그대로)
      sos: {},                   // 끝낸 이야기 부탁 (id → 시각)
      sec: { letters: {}, gulls: {}, bottleDay: '', title: '' },   // 숨은 비밀
      daily: { day: '', att: { n: 0, last: '' }, base: null, q: [], del: {}, maxT: 0, claimed: false },
      ev: null,                  // 지금 주간 이벤트 { id, week, pts, got, seq }
      evLast: null,              // 지난 이벤트 정리 결과 (화면이 한 번 알려 줘요)
      decos: [], placed: {},     // 장식 (가진 것 · 마을에 놓은 자리)
      thx: {},                   // 고맙다는 말 돌려 쓰기 (사람 → 다음 번호)
      shop: { day: '', deals: [], bought: {}, rerolled: false, freeTaken: false, free: 0 },   // 상점 (매일 0시 새로)
      boost: { autoMs: 0, handsMs: 0, autoTok: 0, fday: '', fused: 0 },
      // 마을 짓기 (v4 · merge_town.md §A·§H·§I): 건물 모양 · 가진 모양/옷/몽돌 소품 · 입은 옷 · 지도 카메라 · 건물 톡 날짜 · 우정
      look: {}, owned: { looks: {}, outfits: ['base'], mong: [] }, outfit: 'base', mongAcc: null, cam: null, tapDay: {}, friend: {}, friendAll: '', fillerSeq: 0,   // fday·fused = 오늘 쓴 하루 무료 자동 합치기   // 자동 합치기 1분 · 바쁜 손 남은 시간(앱을 연 동안만 줄어요) · 무료 자동 합치기
      keys: 0, fun: { bday: '', bused: 0 },   // 상자 열쇠 · 거품 하루 무료 터뜨리기 (날짜 · 쓴 횟수)
      createdAt: now, updatedAt: now
    };
    board.forEach((cell) => { if (cell && cell.k === 'item') st.found[itemId(cell)] = true; });
    fillOrders(st, now, rng || Math.random);
    return st;
  }

  /* ---------- 에너지 ---------- */
  function regen(st, now) {
    if (st.energy >= BAL.energyMax) { st.energyAt = now; return st; }
    const n = Math.floor(Math.max(0, now - st.energyAt) / BAL.energyMs);
    if (n > 0) {
      st.energy = Math.min(BAL.energyMax, st.energy + n);
      st.energyAt = st.energy >= BAL.energyMax ? now : st.energyAt + n * BAL.energyMs;
    }
    return st;
  }
  function energyInfo(st, now) {
    regen(st, now);
    const full = st.energy >= BAL.energyMax;
    return { energy: st.energy, max: BAL.energyMax, full, nextMs: full ? 0 : BAL.energyMs - (now - st.energyAt), easy: !!st.settings.easy };
  }
  function refillPrice(st, now) {
    if (!st.refill || st.refill.day !== dayKey(now)) st.refill = { day: dayKey(now), n: 0 };
    const n = st.refill.n;
    return { price: n < BAL.refillPrices.length ? BAL.refillPrices[n] * shopMult(st) : 0, left: BAL.refillPrices.length - n };
  }
  function refill(st, now) {
    regen(st, now);
    const p = refillPrice(st, now);
    if (p.left <= 0) return { ok: false, reason: 'limit' };
    if (st.energy >= BAL.energyMax) return { ok: false, reason: 'full' };
    if (st.coins < p.price) return { ok: false, reason: 'coins', price: p.price };
    st.coins -= p.price;
    st.refill.n++;
    st.energy = Math.min(BAL.energyMax, st.energy + BAL.refillAmount);
    st.energyAt = now;
    return { ok: true, price: p.price };
  }

  /* ---------- 칸 ---------- */
  const covered = (st, i) => !!(st.cover && st.cover[i] > 0);
  const isFree = (st, i) => !st.board[i] && !covered(st, i);
  function emptyCount(st) { let n = 0; for (let i = 0; i < N; i++) if (isFree(st, i)) n++; return n; }
  // 가장 가까운 빈칸 (거리 같으면 운으로) · 모래더미 칸은 빼요
  function nearestEmpty(st, from, rng) {
    const o = rc(from);
    let best = [], bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (!isFree(st, i)) continue;
      const p = rc(i);
      const d = Math.max(Math.abs(p.r - o.r), Math.abs(p.c - o.c)) * 10 + Math.abs(p.r - o.r) + Math.abs(p.c - o.c);
      if (d < bd) { bd = d; best = [i]; } else if (d === bd) best.push(i);
    }
    if (!best.length) return -1;
    return best[Math.floor((rng || Math.random)() * best.length) % best.length];
  }
  // 받은 물건 놓기: 판 빈칸 → 없으면 선물함 (잃어버리는 일 없음)
  function giveCell(st, cell, rng, near) {
    const at = nearestEmpty(st, near == null ? HOME : near, rng);
    if (at >= 0) { st.board[at] = cell; markFound(st, cell); return { at }; }
    st.gifts.push(cell);
    return { at: -1, gift: st.gifts.length - 1 };
  }
  function markFound(st, cell) {
    if (!cell || cell.k !== 'item') return false;
    const id = itemId(cell);
    const first = !st.found[id];
    st.found[id] = true;
    return first;
  }

  /* ---------- 발생기 ---------- */
  function chargeInfo(st, gid, now) {
    const g = GENS[gid];
    if (!g || !g.charge) return null;
    const ch = st.charge[gid] || { n: 0, until: 0 };
    const rest = ch.until > now ? ch.until - now : 0;
    const taps = chargeTaps(st, gid);
    return { left: rest ? 0 : Math.max(0, taps - ch.n), max: taps, restMs: rest };
  }
  // 발생기 톡 (화면 규칙): 고른 칸이 이 발생기면 꺼내기, 아니면 고르기만 (기운 안 씀 · 끌어서 옮긴 뒤에도 같음)
  function genTap(selIdx, idx) { return selIdx === idx && idx >= 0 ? 'spawn' : 'select'; }
  // 꾹 누르기 연속 꺼내기: 2초 꾹 → 첫 물건 · 그다음은 0.35초부터 조금씩 빨라져요(가장 빠르면 0.17초)
  //  손을 떼거나 · 끌기 거리만큼 움직이거나 · 기운/충전이 떨어지거나 · 판이 차면 멈춰요 (하나마다 기운은 평소대로)
  const HOLD_MS = 2000;
  function holdGap(k) { return Math.max(170, Math.round(350 * Math.pow(0.94, Math.max(0, k | 0)))); }
  function holdStop(r) { return !r || !r.ok ? (r && r.reason) || 'stop' : ''; }
  function tapGen(st, idx, now, rng) {
    const g = st.board[idx];
    if (!g || g.k !== 'gen') return { ok: false, reason: 'notgen' };
    const info = GENS[g.g];
    const ch = chargeInfo(st, g.g, now);
    if (ch && ch.restMs > 0) return { ok: false, reason: 'rest', waitMs: ch.restMs };
    const at = nearestEmpty(st, idx, rng);
    if (at < 0) return { ok: false, reason: 'full' };
    regen(st, now);
    const free = !!st.settings.easy || !!(st.boost && st.boost.handsMs > 0);   // 편하게 모드 · 바쁜 손
    if (!free && st.energy < BAL.spawnCost) return { ok: false, reason: 'energy' };
    if (!free) {
      if (st.energy >= BAL.energyMax) st.energyAt = now;   // 가득 찬 상태에서 처음 쓰면 그때부터 회복 시계 시작
      st.energy -= BAL.spawnCost;
    }
    if (info.charge) {
      const c = st.charge[g.g] || { n: 0, until: 0 };
      if (c.until && c.until <= now) { c.n = 0; c.until = 0; }
      c.n++;
      if (c.n >= chargeTaps(st, g.g)) { c.n = 0; c.until = now + Math.round(info.charge.restMs * (BAL.genUp.rest[genLevel(st, g.g)] || 1)); }
      st.charge[g.g] = c;
    }
    const lv = genLevel(st, g.g);
    const t2 = lv ? BAL.genUp.tier2[lv] : BAL.spawnTier2, t3 = BAL.genUp.tier3[lv] || 0;
    const roll = rng();
    const t = roll < t3 ? 3 : roll < t3 + t2 ? 2 : 1;
    const cell = { k: 'item', c: info.chain, t };
    st.board[at] = cell;
    const first = markFound(st, cell);
    if (first) st.gems += BAL.firstFindGems;
    // 강화 4·5단계: 가끔 덤으로 1단계 하나 더 (기운 안 씀 · 빈칸이 있을 때만)
    let extra = null;
    const bp = BAL.genUp.bonus[lv] || 0;
    if (bp && rng() < bp) {
      const at2 = nearestEmpty(st, idx, rng);
      if (at2 >= 0) { extra = { at: at2, cell: { k: 'item', c: info.chain, t: 1 } }; st.board[at2] = extra.cell; markFound(st, extra.cell); }
    }
    st.stats.spawns++;
    st.updatedAt = now;
    return { ok: true, at, cell, first, extra };
  }

  /* ---------- 발생기 강화 (동전 3번) ---------- */
  function chargeTaps(st, gid) { const g = GENS[gid]; return g && g.charge ? g.charge.taps + (BAL.genUp.taps[genLevel(st, gid)] || 0) : 0; }
  function genLevel(st, gid) { return Math.max(0, Math.min(BAL.genUp.prices.length, (st.genLv && st.genLv[gid]) | 0)); }
  function genUpInfo(st, gid) {
    const g = GENS[gid];
    if (!g || g.event) return null;
    const lv = genLevel(st, gid);
    const price = lv < BAL.genUp.prices.length ? BAL.genUp.prices[lv] : 0;
    return { lv, max: BAL.genUp.prices.length, price, tier2: lv ? BAL.genUp.tier2[lv] : BAL.spawnTier2, tier3: BAL.genUp.tier3[lv] || 0,
      bonus: BAL.genUp.bonus[lv] || 0, taps: g.charge ? chargeTaps(st, gid) : 0, restMs: g.charge ? Math.round(g.charge.restMs * (BAL.genUp.rest[lv] || 1)) : 0 };
  }
  function upgradeGen(st, gid, now) {
    const u = genUpInfo(st, gid);
    if (!u) return { ok: false, reason: 'event' };
    if (!u.price) return { ok: false, reason: 'max' };
    if (st.coins < u.price) return { ok: false, reason: 'coins', price: u.price };
    st.coins -= u.price;
    st.genLv[gid] = u.lv + 1;
    st.updatedAt = now;
    return { ok: true, price: u.price, lv: u.lv + 1, info: genUpInfo(st, gid) };
  }

  /* ---------- 합치기 · 옮기기 ---------- */
  function canMerge(a, b) {
    if (!a || !b) return false;
    if (a.k === 'item' && b.k === 'item') return a.c === b.c && a.t === b.t && a.t < maxTier(a.c);
    if (a.k === 'wild' && b.k === 'item') return b.t < maxTier(b.c);
    if (b.k === 'wild' && a.k === 'item') return a.t < maxTier(a.c);
    return false;
  }
  function mergeResult(a, b) {
    const base = a.k === 'item' ? a : b;
    return { k: 'item', c: base.c, t: base.t + 1 };
  }
  // 합친 칸 둘레(위·아래·왼·오른) 모래더미를 한 겹씩
  function peel(st, at) {
    const out = [];
    const p = rc(at);
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
      const r = p.r + dr, c = p.c + dc;
      if (r < 0 || c < 0 || r >= BOARD.rows || c >= COLS) return;
      const i = r * COLS + c;
      if (st.cover[i] > 0) { st.cover[i]--; out.push({ i, left: st.cover[i] }); }
    });
    return out;
  }
  // from → to : 빈칸이면 이동 · 같은 것이면 합치기(to 자리에) · 다르면 자리 바꾸기 · 모래더미 칸은 못 감
  function move(st, from, to, now) {
    if (from === to || from < 0 || to < 0 || from >= N || to >= N) return { kind: 'none' };
    if (covered(st, to) || covered(st, from)) return { kind: 'none', reason: 'covered' };
    const a = st.board[from], b = st.board[to];
    if (!a) return { kind: 'none' };
    if (stuck(a)) return { kind: 'none', reason: a.k };
    // 그물에 걸린 물건 위에 같은 물건을 겹치면 둘이 합쳐져 다음 단계로 풀려요
    if (b && b.k === 'net') {
      if (a.k !== 'item' || a.c !== b.c || a.t !== b.t || a.t >= maxTier(a.c)) return { kind: 'none', reason: 'net' };
      st.updatedAt = now;
      const cell = { k: 'item', c: a.c, t: a.t + 1 };
      st.board[to] = cell; st.board[from] = null;
      const first = markFound(st, cell);
      if (first) st.gems += BAL.firstFindGems;
      st.stats.merges++;
      st.stats.best[cell.c] = Math.max(st.stats.best[cell.c] || 0, cell.t);
      if (st.daily && !isAux(cell.c)) st.daily.maxT = Math.max(st.daily.maxT | 0, cell.t);
      const peeled = peel(st, to), freed = unnet(st, to);
      return { kind: 'merge', at: to, cell, first, max: cell.t >= maxTier(cell.c), peeled, freed, netMerge: true };
    }
    if (b && b.k === 'bubble') return { kind: 'none', reason: 'bubble' };
    st.updatedAt = now;
    if (!b) { st.board[to] = a; st.board[from] = null; return { kind: 'move', at: to }; }
    if (canMerge(a, b)) {
      const cell = mergeResult(a, b);
      st.board[to] = cell; st.board[from] = null;
      const first = markFound(st, cell);
      if (first) st.gems += BAL.firstFindGems;
      st.stats.merges++;
      st.stats.best[cell.c] = Math.max(st.stats.best[cell.c] || 0, cell.t);
      if (st.daily && !isAux(cell.c)) st.daily.maxT = Math.max(st.daily.maxT | 0, cell.t);   // 오늘의 부탁 'n단계 만들기'
      const peeled = peel(st, to), freed = unnet(st, to);
      return { kind: 'merge', at: to, cell, first, max: cell.t >= maxTier(cell.c), peeled, freed };
    }
    st.board[to] = a; st.board[from] = b;
    return { kind: 'swap', at: to };
  }
  // 거품·그물 칸은 손으로 옮길 수 없어요 (상자는 옮길 수 있어요)
  const stuck = (c) => !!c && (c.k === 'bubble' || c.k === 'net');
  // 합친 칸 바로 옆(위·아래·왼·오른) 그물을 풀어요 → 걸려 있던 물건이 내 것이 돼요
  function unnet(st, at) {
    const out = [];
    const p = rc(at);
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => {
      const r = p.r + dr, c = p.c + dc;
      if (r < 0 || c < 0 || r >= BOARD.rows || c >= COLS) return;
      const i = r * COLS + c, x = st.board[i];
      if (x && x.k === 'net') { st.board[i] = { k: 'item', c: x.c, t: x.t }; markFound(st, st.board[i]); out.push({ i, cell: st.board[i] }); }
    });
    return out;
  }

  /* ---------- 판 재미: 거품 · 그물 · 상자 (BAL.fun) ---------- */
  const funDay = (st, now) => { if (!st.fun || typeof st.fun !== 'object') st.fun = { bday: '', bused: 0 }; const d = dayKey(now); if (st.fun.bday !== d) { st.fun.bday = d; st.fun.bused = 0; } return st.fun; };
  // 합치기 뒤 가끔: 같은 물건이 거품 속에 하나 더 (3단계 이상 · 이벤트·보조 물건은 빼요 · 빈칸이 있을 때)
  function maybeBubble(st, r, now, rng) {
    const B = FUN.bubble;
    if (!r || r.kind !== 'merge' || !r.cell || r.cell.t < B.minTier || isAux(r.cell.c) || isEvent(r.cell.c)) return null;
    if (st.board.some((x) => x && x.k === 'bubble')) return null;      // 한 번에 하나만
    if (rng() >= B.chance) return null;
    const at = nearestEmpty(st, r.at, rng);
    if (at < 0) return null;
    st.board[at] = { k: 'bubble', c: r.cell.c, t: r.cell.t, until: now + B.ms };
    st.updatedAt = now;
    return { at, cell: st.board[at] };
  }
  function bubbleInfo(st, cell, now) {
    const B = FUN.bubble, f = funDay(st, now);
    const sv = Math.pow(2, cell.t - 1);
    return { leftMs: Math.max(0, cell.until - now), free: Math.max(0, B.freeDay - f.bused), coins: Math.max(4, sv * B.coinMul), gems: B.gems[Math.min(B.gems.length - 1, cell.t - 1)] | 0,
      turnsInto: { k: 'item', c: 'cn', t: cell.t >= 6 ? 2 : 1 } };
  }
  // 거품 터뜨려 갖기: how = 'free' | 'gems' | 'coins'
  function popBubble(st, idx, how, now) {
    const cell = st.board[idx];
    if (!cell || cell.k !== 'bubble') return { ok: false, reason: 'gone' };
    const bi = bubbleInfo(st, cell, now);
    let price = 0, pay = null;
    if (how === 'free') { if (bi.free <= 0) return { ok: false, reason: 'limit' }; st.fun.bused++; }
    else if (how === 'gems' || how === 'coins') {
      pay = how; price = how === 'gems' ? bi.gems : bi.coins;
      if (st[pay] < price) return { ok: false, reason: pay, price, short: price - st[pay] };
      st[pay] -= price;
    } else return { ok: false, reason: 'gone' };
    st.board[idx] = { k: 'item', c: cell.c, t: cell.t };
    markFound(st, st.board[idx]);
    st.updatedAt = now;
    return { ok: true, at: idx, cell: st.board[idx], price, pay, how };
  }
  // 부탁을 건네면 가끔: 판 위쪽 빈칸에 그물에 걸린 물건 (지금 지역 부탁 단계 · 열린 체인)
  function maybeNet(st, now, rng) {
    const NT = FUN.net;
    if ((st.stats.delivered | 0) < NT.after) return null;
    if (st.board.filter((x) => x && x.k === 'net').length >= NT.max) return null;
    if (rng() >= NT.chance) return null;
    const spots = [];
    for (let i = 0; i < NT.rows * COLS; i++) if (isFree(st, i)) spots.push(i);
    if (!spots.length) return null;
    const area = AREAS[orderLevel(st)];
    let chains = area.chains.filter((c) => st.unlocked.indexOf(c) >= 0);
    if (!chains.length) chains = shopChains(st);
    if (!chains.length) return null;
    const c = pick(rng, chains);
    const t = Math.max(2, Math.min(maxTier(c) - 1, rint(rng, area.orders.tiers[0], area.orders.tiers[1])));
    const at = pick(rng, spots);
    st.board[at] = { k: 'net', c, t };
    st.updatedAt = now;
    return { at, cell: st.board[at] };
  }
  // 상자 (b = 'gift' 선물 상자 · 'chest' 할머니의 보물 궤짝) · open = 저절로 열리는 시각
  const makeBox = (b, now) => ({ k: 'box', b, open: now + FUN.box[b].ms });
  function boxInfo(st, cell, now) {
    const def = FUN.box[cell.b] || FUN.box.gift;
    const leftMs = Math.max(0, cell.open - now);
    return { name: def.name, ready: leftMs <= 0, leftMs, totalMs: def.ms, keys: st.keys | 0, gems: def.gems };
  }
  // 상자 열기: how = 'time'(시간이 됐을 때 · 무료) | 'key'(열쇠 1) | 'gems'(소라별)
  function openBox(st, idx, how, now, rng) {
    const cell = st.board[idx];
    if (!cell || cell.k !== 'box') return { ok: false, reason: 'gone' };
    const bi = boxInfo(st, cell, now), def = FUN.box[cell.b] || FUN.box.gift;
    let price = 0, pay = null;
    if (!bi.ready) {
      if (how === 'key') { if ((st.keys | 0) < 1) return { ok: false, reason: 'keys' }; st.keys--; }
      else if (how === 'gems') { pay = 'gems'; price = def.gems; if (st.gems < price) return { ok: false, reason: 'gems', price, short: price - st.gems }; st.gems -= price; }
      else return { ok: false, reason: 'wait', leftMs: bi.leftMs };
    }
    st.board[idx] = null;
    const area = AREAS[orderLevel(st)];
    let chains = area.chains.filter((c) => st.unlocked.indexOf(c) >= 0);
    if (!chains.length) chains = shopChains(st);
    const gifts = [];
    const n = rint(rng, def.items[0], def.items[1]);
    for (let k = 0; k < n; k++) { const c = pick(rng, chains); gifts.push({ k: 'item', c, t: Math.min(maxTier(c), rint(rng, def.tiers[0], def.tiers[1])) }); }
    if (def.coin && rng() < def.coin) gifts.push({ k: 'item', c: 'cn', t: 1 });
    if (def.wild && rng() < def.wild) gifts.push({ k: 'wild' });
    if (def.ss && rng() < def.ss) gifts.push({ k: 'item', c: 'ss', t: 1 });
    const placed = gifts.map((g) => Object.assign({ cell: g }, giveCell(st, g, rng, idx)));
    st.updatedAt = now;
    return { ok: true, b: cell.b, name: def.name, how: bi.ready ? 'time' : how, price, pay, placed };
  }
  // 시간 흐름: 거품이 시간이 다 되면 엽전으로 · 반짝 손님은 시간이 지나면 벌칙 없이 다른 부탁으로
  function funTick(st, now, rng) {
    const out = { coins: [], rushGone: [], added: [] };
    for (let i = 0; i < N; i++) {
      const x = st.board[i];
      if (x && x.k === 'bubble' && x.until <= now) { st.board[i] = bubbleInfo(st, x, now).turnsInto; out.coins.push({ at: i, from: x, cell: st.board[i] }); }
    }
    const gone = st.orders.filter((o) => o.rush && o.rush <= now);
    if (gone.length) {
      st.orders = st.orders.filter((o) => gone.indexOf(o) < 0);
      out.rushGone = gone;
      out.added = fillOrders(st, now, rng || Math.random);
    }
    if (out.coins.length || gone.length) st.updatedAt = now;
    return out;
  }

  // 힌트: 합칠 수 있는 짝 하나
  function findPair(st) {
    const seen = {};
    for (let i = 0; i < N; i++) {
      const c = st.board[i];
      if (!c || c.k !== 'item' || c.t >= maxTier(c.c)) continue;
      const id = itemId(c);
      if (seen[id] != null) return [seen[id], i];
      seen[id] = i;
    }
    return null;
  }

  /* ---------- 팔기 · 보조 물건 쓰기 ---------- */
  function sell(st, idx, now) {
    const cell = st.board[idx];
    if (!cell || cell.k === 'gen') return { ok: false, reason: cell ? 'gen' : 'empty' };
    if (stuck(cell) || cell.k === 'box') return { ok: false, reason: cell.k };
    const coins = sellValue(cell);
    st.board[idx] = null;
    st.coins += coins;
    st.stats.sold = (st.stats.sold || 0) + 1;
    st.updatedAt = now;
    return { ok: true, cell, coins };
  }
  // 팔기 전에 물어볼 물건 (최고 단계 · 무지개 소라)
  const sellAsk = (cell) => !!cell && (cell.k === 'wild' || (cell.k === 'item' && cell.t >= maxTier(cell.c) && !isAux(cell.c)));

  function giftItems(st, tier, count, rng) {
    const area = AREAS[Math.min(st.area, AREAS.length - 1)];
    const pool = area.chains.filter((c) => st.unlocked.indexOf(c) >= 0);
    const out = [];
    for (let i = 0; i < count; i++) {
      let t = rng() < BAL.giftTier2 ? 2 : 1;
      if (tier >= 3 && rng() < 0.25) t = 3;
      out.push({ k: 'item', c: pick(rng, pool), t });
    }
    return out;
  }
  function useItem(st, idx, now, rng) {
    const cell = st.board[idx];
    if (!cell || cell.k !== 'item' || !isAux(cell.c)) return { ok: false, reason: 'notaux' };
    const aux = CHAINS[cell.c].aux;
    const amount = aux.amount[cell.t - 1];
    st.board[idx] = null;
    st.updatedAt = now;
    if (aux.kind === 'energy') {
      regen(st, now);
      const wasFull = st.energy >= BAL.energyMax;
      st.energy = Math.min(BAL.energyCap, st.energy + amount);
      if (!wasFull && st.energy >= BAL.energyMax) st.energyAt = now;
    } else if (aux.kind === 'coins') st.coins += amount;
    else if (aux.kind === 'gems') st.gems += amount;
    else if (aux.kind === 'gift') {
      const items = giftItems(st, cell.t, amount, rng);
      const placed = items.map((it) => Object.assign({ cell: it }, giveCell(st, it, rng, idx)));
      return { ok: true, kind: 'gift', amount, placed };
    }
    return { ok: true, kind: aux.kind, amount };
  }

  /* ---------- 가방 · 선물함 ---------- */
  function bagPrice(st) {
    if (st.bag.length >= BAL.bagMax) return 0;
    return Math.round(BAL.bagPrice * Math.pow(BAL.bagGrow, st.bag.length - BAL.bagStart));
  }
  function growBag(st, now) {
    const p = bagPrice(st);
    if (!p) return { ok: false, reason: 'max' };
    if (st.coins < p) return { ok: false, reason: 'coins', price: p };
    st.coins -= p;
    st.bag.push(null);
    st.updatedAt = now;
    return { ok: true, price: p, size: st.bag.length };
  }
  function toBag(st, idx, now) {
    const cell = st.board[idx];
    if (!cell) return { ok: false, reason: 'empty' };
    if (stuck(cell)) return { ok: false, reason: cell.k };
    const slot = st.bag.indexOf(null);
    if (slot < 0) return { ok: false, reason: 'full' };
    st.bag[slot] = cell;
    st.board[idx] = null;
    st.updatedAt = now;
    return { ok: true, slot, cell };
  }
  function fromBag(st, slot, now, rng, to) {
    const cell = st.bag[slot];
    if (!cell) return { ok: false, reason: 'empty' };
    const at = to != null && to >= 0 && isFree(st, to) ? to : nearestEmpty(st, HOME, rng);
    if (at < 0) return { ok: false, reason: 'full' };
    st.board[at] = cell;
    st.bag[slot] = null;
    st.updatedAt = now;
    return { ok: true, at, cell };
  }
  function takeGift(st, k, now, rng) {
    const cell = st.gifts[k];
    if (!cell) return { ok: false, reason: 'gone' };
    const at = nearestEmpty(st, HOME, rng);
    if (at < 0) return { ok: false, reason: 'full' };
    st.board[at] = cell;
    st.gifts.splice(k, 1);
    st.updatedAt = now;
    return { ok: true, at, cell };
  }
  /* ---------- 되돌리기 (마지막 행동 1번: 옮기기·합치기·팔기·가방) ---------- */
  function snapshot(st) { return JSON.stringify({ board: st.board, bag: st.bag, cover: st.cover, gifts: st.gifts, coins: st.coins, gems: st.gems, boost: st.boost }); }
  function restore(st, snap) {
    try {
      const s = JSON.parse(snap);
      ['board', 'bag', 'cover', 'gifts', 'coins', 'gems', 'boost'].forEach((k) => { if (s[k] !== undefined) st[k] = s[k]; });
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 주문 ---------- */
  // 주문 난이도 = 지금 복원 중인 지역 (다 고친 뒤에는 마지막 지역)
  function orderLevel(st) { return Math.max(0, Math.min(st.area || 0, AREAS.length - 1)); }
  const askersOf = (chain) => Object.keys(VILLAGERS).filter((k) => VILLAGERS[k].chains.indexOf(chain) >= 0);
  function villagerFor(chain, used, rng) {
    const all = askersOf(chain);
    const free = all.filter((k) => used.indexOf(k) < 0);
    const pool = free.length ? free : all;
    return pool.length ? pick(rng, pool) : 'hayun';
  }
  // 새 부탁의 '대표 체인' 고르기: ① 아직 안 나온 체인 + 지금 카드에 없는 사람 ② 카드에 없는 사람 ③ 안 나온 체인 ④ 아무거나
  //  → 다른 사람이 있으면 같은 얼굴이 카드 두 장에 동시에 나오지 않아요
  function leadChain(st, chains, rng) {
    const usedChains = [], usedWho = st.orders.map((o) => o.who);
    st.orders.forEach((o) => o.need.forEach((x) => { if (usedChains.indexOf(x.c) < 0) usedChains.push(x.c); }));
    const whoFree = (c) => askersOf(c).some((k) => usedWho.indexOf(k) < 0);
    const fresh = chains.filter((c) => usedChains.indexOf(c) < 0);
    const tries = [fresh.filter(whoFree), chains.filter(whoFree), fresh, chains];
    return pick(rng, tries.find((p) => p.length));
  }
  function makeOrder(st, now, rng) {
    const area = AREAS[orderLevel(st)];
    let chains = area.chains.filter((c) => st.unlocked.indexOf(c) >= 0);
    if (!chains.length) chains = st.unlocked.filter((c) => !isAux(c));
    const lead = leadChain(st, chains, rng);
    const lo = area.orders.tiers[0];
    let hi = area.orders.tiers[1];
    if (st.orders.some((o) => !o.story && !o.ev && now - o.at > BAL.orderStuckMs)) hi = Math.max(lo, hi - 1);   // 막힘 방지
    const n = rint(rng, area.orders.items[0], area.orders.items[1]);
    const easy = (st.area | 0) === 0 && (st.orderSeq | 0) < (BAL.firstEasyOrders | 0);   // 새 판 첫 부탁 2장은 1단계 (첫 고치기까지 빨리)
    const FO = FUN.orders, fancy = !easy && (st.orderSeq | 0) >= FO.after;   // 새 판 처음 몇 장은 보통 부탁만
    let need = [], who = null, title = null;
    // 묶음 부탁: 두 체인을 섞어요 (부탁하는 사람 이야기에 맞는 것 · 두 물건이라 가장 높은 단계는 하나 낮게)
    const usedWho = st.orders.map((o) => o.who);
    const mixes = fancy ? MIXES.filter((m) => m.chains.every((c) => chains.indexOf(c) >= 0) && usedWho.indexOf(m.who) < 0) : [];
    if (mixes.length && rng() < FO.mix) {
      const m = pick(rng, mixes);
      need = m.chains.map((c) => ({ c, t: Math.max(1, Math.min(maxTier(c), rint(rng, lo, Math.max(lo, hi - 1)))) }));
      who = m.who; title = m.title;
    } else {
      for (let i = 0; i < n; i++) {
        const c = i === 0 ? lead : pick(rng, chains);
        const tr = Math.min(maxTier(c), rint(rng, lo, hi));
        const t = easy ? 1 : tr;
        need.push({ c, t });
      }
      who = villagerFor(lead, usedWho, rng);
    }
    need.sort((x, y) => (x.c < y.c ? -1 : x.c > y.c ? 1 : x.t - y.t));
    const sum = need.reduce((s, x) => s + sellValue(x.t), 0);
    const tsum = need.reduce((s, x) => s + x.t, 0);
    st.orderSeq++;
    const line = Math.floor(rng() * 3);
    let bonus = rng() < BAL.orderBonus ? clone(pick(rng, BAL.bonusPool)) : null;
    let coins = Math.ceil(sum * BAL.orderCoinMult);
    // 반짝 손님 (30분 · 동전 2배 + 열쇠) · 선물 상자 부탁 — 한 번에 하나씩만 (반짝 손님은 카드에 1장까지)
    let rush = 0, box = null, keys = 0;
    const kind = fancy ? rng() : 1;
    if (kind < FO.rush && !st.orders.some((o) => o.rush)) { rush = now + FO.rushMs; coins = Math.ceil(coins * FO.rushMult); keys = FO.rushKeys; }
    else if (kind < FO.rush + FO.gift) { box = 'gift'; bonus = null; }
    const o = {
      id: 'o' + st.orderSeq, who, need, coins,
      stars: 1 + Math.floor(tsum / 4),
      line, bonus,
      at: now, story: false
    };
    if (title) o.title = title;
    if (rush) { o.rush = rush; o.keys = keys; }
    if (box) o.box = box;
    return o;
  }
  // 일반 부탁은 늘 3장 (이야기 부탁·이벤트 부탁은 그 밖에 따로)
  function fillOrders(st, now, rng) {
    syncStoryOrders(st, now);
    const out = [];
    const normal = () => st.orders.filter((o) => !o.story && !o.ev).length;
    while (normal() < BAL.ordersShown) { const o = makeOrder(st, now, rng); st.orders.push(o); out.push(o); }
    return out;
  }

  /* ---------- 이야기 부탁 (금색 · 복원 작업 앞에 꼭) ---------- */
  function storyOrderActive(st, id) {
    const so = STORY_ORDERS[id];
    return !!so && !st.sos[id] && so.area <= (st.area | 0) && (!so.after || !!st.tasks[so.after]);
  }
  function makeStoryOrder(id, now) {
    const so = STORY_ORDERS[id];
    const need = so.need.map((n) => ({ c: n.c, t: n.t }));
    const sum = need.reduce((s, x) => s + sellValue(x.t), 0);
    return { id: 's_' + id, who: so.who, need, coins: Math.ceil(sum * BAL.orderCoinMult), stars: so.stars, line: 0, bonus: null, at: now, story: id, title: so.title };
  }
  function syncStoryOrders(st, now) {
    if (!st.sos) st.sos = {};
    st.orders = st.orders.filter((o) => !o.story || storyOrderActive(st, o.story));
    Object.keys(STORY_ORDERS).forEach((id) => {
      if (storyOrderActive(st, id) && !st.orders.some((o) => o.story === id)) st.orders.unshift(makeStoryOrder(id, now));
    });
  }
  // 이 주문에 쓸 칸 찾기: 판 먼저, 없으면 가방 (같은 물건 2개가 필요하면 다른 칸 2개)
  //  cells[k] = 판 칸 번호(-1 = 판에 없음) · bag[k] = 가방 칸 번호(-1 = 가방에 없음)
  function orderStatus(st, order) {
    const used = {}, usedBag = {};
    const bag = [];
    const cells = order.need.map((n, k) => {
      bag[k] = -1;
      for (let i = 0; i < N; i++) {
        const c = st.board[i];
        if (!used[i] && c && c.k === 'item' && c.c === n.c && c.t === n.t) { used[i] = true; return i; }
      }
      for (let j = 0; j < st.bag.length; j++) {
        const c = st.bag[j];
        if (!usedBag[j] && c && c.k === 'item' && c.c === n.c && c.t === n.t) { usedBag[j] = true; bag[k] = j; break; }
      }
      return -1;
    });
    const have = cells.map((i, k) => i >= 0 || bag[k] >= 0);
    return { cells, bag, have, ready: have.every(Boolean) };
  }
  // 만드는 법: 이 물건(체인 c · 단계 t)을 어디서 얻고, 1단계부터 어떻게 합쳐 올라가는지
  //  gen = 이 체인을 내놓는 발생기 { id, name, cells(판 위 칸) } · null 이면 from 으로 출처 안내
  //  from = 'gen' | 'box'(보자기·선물·보상에서 나와요) | 'none'
  //  steps[k] = { t, id, name, cells(판 위 칸), bag(가방 속 개수), have(판+가방 개수) } · 1단계 → t단계
  function orderGuide(st, c, t) {
    const ch = CHAINS[c];
    if (!ch) return null;
    t = Math.max(1, Math.min(t | 0, ch.tiers.length));
    const gid = Object.keys(GENS).find((g) => GENS[g].chain === c) || null;
    const gcells = [];
    if (gid) st.board.forEach((x, i) => { if (x && x.k === 'gen' && x.g === gid) gcells.push(i); });
    // levels: 그 체인 1단계부터 끝 단계까지 다 (판·가방에 몇 개 · 본 적 있는지) · steps: 부탁 단계까지
    const levels = [];
    for (let k = 1; k <= ch.tiers.length; k++) {
      const cells = [];
      st.board.forEach((x, i) => { if (x && x.k === 'item' && x.c === c && x.t === k && !covered(st, i)) cells.push(i); });
      const bag = (st.bag || []).filter((x) => x && x.k === 'item' && x.c === c && x.t === k).length;
      const have = cells.length + bag;
      levels.push({ t: k, id: c + k, name: ch.tiers[k - 1], cells, bag, have, known: !!(st.found && st.found[c + k]) || have > 0 });
    }
    const steps = levels.slice(0, t);
    // 가장 높은 단계 중 이미 가진 것 (거기부터 합치면 돼요)
    let best = 0;
    steps.forEach((s) => { if (s.have) best = s.t; });
    return {
      c, t, name: ch.tiers[t - 1], chain: ch.name,
      gen: gid ? { id: gid, name: GENS[gid].name, cells: gcells } : null,
      from: gid ? 'gen' : (ch.aux || isEvent(c) ? 'box' : 'none'),
      steps, levels, max: ch.tiers.length, best, ready: steps[t - 1].have > 0,
      // [찾기]가 반짝일 칸: 그 체인 물건 전부(판) + 발생기
      find: levels.reduce((a, s) => a.concat(s.cells), []).concat(gid ? gcells : [])
    };
  }
  function deliver(st, orderId, now, rng) {
    const k = st.orders.findIndex((o) => o.id === orderId);
    if (k < 0) return { ok: false, reason: 'gone' };
    const order = st.orders[k];
    const s = orderStatus(st, order);
    if (!s.ready) return { ok: false, reason: 'missing', have: s.have };
    s.cells.forEach((i) => { if (i >= 0) st.board[i] = null; });
    s.bag.forEach((j) => { if (j >= 0) st.bag[j] = null; });
    st.coins += order.coins;
    st.stars += order.stars;
    st.starsEarned += order.stars;
    st.stats.delivered++;
    if (order.keys) st.keys = (st.keys | 0) + order.keys;
    st.orders.splice(k, 1);
    if (order.story) st.sos[order.story] = now;
    const friendUps = order.ev ? [] : addFriend(st, order.who, FRIEND.deliverPts, now, rng);   // 부탁 건네기도 우정 +2
    if (st.daily && !order.ev) {   // 오늘의 부탁 '○○ 부탁 n번'
      const seen = {};
      order.need.forEach((x) => { if (!seen[x.c]) { seen[x.c] = 1; st.daily.del[x.c] = (st.daily.del[x.c] | 0) + 1; } });
    }
    let evRewards = null;
    if (order.ev && st.ev && st.ev.id === order.ev) evRewards = addEventPoints(st, order.pts | 0, now, rng);
    let bonus = null;
    if (order.bonus) bonus = Object.assign({ cell: order.bonus }, giveCell(st, clone(order.bonus), rng, s.cells.find((i) => i >= 0)));
    let boxGot = null;
    if (order.box) boxGot = Object.assign({ cell: makeBox(order.box, now) }, giveCell(st, makeBox(order.box, now), rng, s.cells.find((i) => i >= 0)));
    const net = order.ev || order.story ? null : maybeNet(st, now, rng);
    // 건넨 자리의 다음 부탁은 늘 맨 오른쪽 끝으로 (나머지는 왼쪽으로 한 칸씩) → 앞쪽에 다른 사람이 와요
    const added = fillOrders(st, now, rng);
    if (order.ev) { const eo = eventOrderFill(st, now, rng); if (eo) added.push(eo); }
    added.forEach((o) => { const j = st.orders.indexOf(o); if (j >= 0) { st.orders.splice(j, 1); st.orders.push(o); } });
    st.updatedAt = now;
    return { ok: true, order, cells: s.cells, bag: s.bag, coins: order.coins, stars: order.stars, added, bonus, story: order.story || null, evRewards, friendUps, keys: order.keys | 0, box: boxGot, net };
  }
  function skipOrder(st, orderId, now, rng) {
    const wait = (st.skipAt || 0) + BAL.skipCooldownMs - now;
    if (wait > 0) return { ok: false, reason: 'cool', waitMs: wait };
    const k = st.orders.findIndex((o) => o.id === orderId);
    if (k < 0) return { ok: false, reason: 'gone' };
    if (st.orders[k].story) return { ok: false, reason: 'story' };
    if (st.orders[k].ev) {   // 이벤트 부탁은 같은 이벤트 부탁으로 바꿔요
      const old = st.orders.splice(k, 1)[0];
      const o = makeEventOrder(st, now, rng);
      st.orders.splice(k, 0, o);
      st.skipAt = now; st.updatedAt = now;
      return { ok: true, old, order: o };
    }
    const old = st.orders.splice(k, 1)[0];
    const o = makeOrder(st, now, rng);
    st.orders.splice(k, 0, o);
    st.skipAt = now;
    st.updatedAt = now;
    return { ok: true, old, order: o };
  }

  /* ---------- 상점 (merge_town.md §F · 동전이 기본 · 소라별은 특별한 것만) ---------- */
  const seeded = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  // 가격 배수 m: 지금 지역(다 고친 뒤엔 마지막 지역) 번호로
  function shopMult(st) { return SHOP.mult[Math.max(0, Math.min(SHOP.mult.length - 1, st.area | 0))]; }
  const shopChains = (st) => st.unlocked.filter((c) => CHAINS[c] && !isAux(c) && !isEvent(c));
  function itemCoins(st, id) { const it = SHOP.items[id]; return it && it.coins ? it.coins * (it.mult ? Math.min(shopMult(st), it.multMax || 99) : 1) : 0; }
  // 오늘의 특가 3칸: 한 칸은 꼭 지금 지역 체인 3~4단계 (주문 막힘 풀기) · 나머지는 dealPool 에서 · 30~50% 할인
  function genDeals(st, day, salt) {
    const r = seeded(hash(day + ':' + (salt || '') + ':' + (st.area | 0)));
    const area = AREAS[orderLevel(st)];
    let ch = area.chains.filter((c) => st.unlocked.indexOf(c) >= 0);
    if (!ch.length) ch = shopChains(st);
    const deals = [{ id: 'tier', c: pick(r, ch), t: r() < 0.5 ? 3 : 4, off: pick(r, SHOP.dealOff) }];
    const pool = SHOP.dealPool.slice();
    while (deals.length < 3 && pool.length) deals.push({ id: pool.splice(Math.floor(r() * pool.length) % pool.length, 1)[0], off: pick(r, SHOP.dealOff) });
    return deals;
  }
  // 날이 바뀌면 새로 (특가·무료 칸·하루 제한)
  function shopTouch(st, now) {
    const day = dayKey(now);
    if (st.shop && st.shop.day === day) return false;
    st.shop = { day, deals: genDeals(st, day), bought: {}, rerolled: false, freeTaken: false, free: hash(day + 'free') % SHOP.free.length };
    return true;
  }
  const dealBase = (st, d) => (d.id === 'tier' ? SHOP.tierPrice[d.t] : itemCoins(st, d.id));
  const dealPrice = (st, d) => Math.max(1, Math.round(dealBase(st, d) * (1 - d.off)));
  const dealGive = (d) => (d.id === 'tier' ? { k: 'item', c: d.c, t: d.t } : null);
  const bought = (st, key) => (st.shop.bought[key] | 0);
  // 쉬고 있는 충전식 발생기 (가장 오래 기다려야 하는 것부터)
  function restingGens(st, now) {
    const out = [];
    st.board.forEach((x, i) => { if (x && x.k === 'gen') { const ch = chargeInfo(st, x.g, now); if (ch && ch.restMs > 0) out.push({ at: i, g: x.g, restMs: ch.restMs }); } });
    return out.sort((a, b) => b.restMs - a.restMs);
  }
  // 받은 것 넣기: 물건이면 판 빈칸(없으면 선물함) · 도우미면 남은 시간
  function grant(st, what, rng, kind) {
    if (kind === 'auto1m') { st.boost.autoMs += SHOP.auto1mMs; return { kind }; }
    if (kind === 'hands') { st.boost.handsMs += SHOP.handsMs; return { kind }; }
    if (kind === 'token') { st.boost.autoTok = (st.boost.autoTok | 0) + 1; return { kind }; }
    if (kind === 'key') { st.keys = (st.keys | 0) + 1; return { kind }; }
    const cell = clone(what);
    return Object.assign({ cell }, giveCell(st, cell, rng || Math.random));
  }
  // 사기: req = { id, pay:'coins'|'gems', c, t (id 'tier'), slot (id 'deal') }
  function shopBuy(st, req, now, rng) {
    shopTouch(st, now);
    const id = req.id;
    let price = 0, pay = req.pay === 'gems' ? 'gems' : 'coins', what = null, kind = null, limitKey = null, limit = 0;
    if (id === 'tier') {
      const t = req.t | 0;
      if (!SHOP.tierPrice[t] || t > 3 || shopChains(st).indexOf(req.c) < 0) return { ok: false, reason: 'gone' };
      price = SHOP.tierPrice[t]; what = { k: 'item', c: req.c, t };
      if (SHOP.tierDay[t]) { limitKey = 'tier' + t; limit = SHOP.tierDay[t]; }
      pay = 'coins';
    } else if (id === 'deal') {
      const d = st.shop.deals[req.slot | 0];
      if (!d) return { ok: false, reason: 'gone' };
      price = dealPrice(st, d); limitKey = 'deal' + (req.slot | 0); limit = 1; pay = 'coins';
      what = dealGive(d);
      if (!what) { const it = SHOP.items[d.id]; what = it.give || null; kind = it.kind || null; }
    } else {
      const it = SHOP.items[id];
      if (!it) return { ok: false, reason: 'gone' };
      if (it.kind === 'refill') return Object.assign(refill(st, now), { kind: 'refill' });
      if (it.kind === 'bag') return Object.assign(growBag(st, now), { kind: 'bag' });
      if (it.kind === 'auto') return { ok: false, reason: 'auto' };
      kind = it.kind || null; what = it.give || null;
      if (pay === 'gems' && !it.gems) pay = 'coins';
      price = pay === 'gems' ? it.gems : itemCoins(st, id);
      if (pay === 'coins' && it.day) { limitKey = id; limit = it.day; }
      if (kind === 'recharge' && !restingGens(st, now).length) return { ok: false, reason: 'norest' };
      if (kind === 'skip' && (st.skipAt || 0) + BAL.skipCooldownMs <= now) return { ok: false, reason: 'nocool' };
    }
    if (limitKey && bought(st, limitKey) >= limit) return { ok: false, reason: 'limit' };
    if (st[pay] < price) return { ok: false, reason: pay, price, short: price - st[pay] };
    st[pay] -= price;
    if (limitKey) st.shop.bought[limitKey] = bought(st, limitKey) + 1;
    st.updatedAt = now;
    let got;
    if (kind === 'recharge') { const g = restingGens(st, now)[0]; st.charge[g.g] = { n: 0, until: 0 }; got = { kind, gen: g }; }
    else if (kind === 'skip') { st.skipAt = 0; got = { kind }; }
    else got = grant(st, what, rng, kind);
    return Object.assign({ ok: true, price, pay }, got);
  }
  // [다시 섞기] 하루 1번 · 10 × m
  function shopReroll(st, now) {
    shopTouch(st, now);
    if (st.shop.rerolled) return { ok: false, reason: 'done' };
    const price = SHOP.rerollCoins * shopMult(st);
    if (st.coins < price) return { ok: false, reason: 'coins', price, short: price - st.coins };
    st.coins -= price;
    st.shop.deals = genDeals(st, st.shop.day, 'r');
    Object.keys(st.shop.bought).forEach((k) => { if (/^deal/.test(k)) delete st.shop.bought[k]; });
    st.shop.rerolled = true;
    st.updatedAt = now;
    return { ok: true, price };
  }
  // 오늘의 무료 1칸
  function shopFree(st, now, rng) {
    shopTouch(st, now);
    if (st.shop.freeTaken) return { ok: false, reason: 'done' };
    const f = SHOP.free[st.shop.free % SHOP.free.length];
    st.shop.freeTaken = true;
    st.updatedAt = now;
    return Object.assign({ ok: true, free: f }, f.token ? grant(st, null, rng, 'token') : grant(st, f.give, rng));
  }

  /* ---------- 자동 합치기 (merge_town.md §G · 동전) ---------- */
  // 지금 부탁에 필요한 물건 (단계·개수만큼 남겨요 · 가방에 있는 만큼은 빼요) · 설정 autoKeep 끄면 안 남김
  function autoReserve(st) {
    const need = {};
    if (st.settings && st.settings.autoKeep === false) return need;
    st.orders.forEach((o) => o.need.forEach((n) => { const id = n.c + n.t; need[id] = (need[id] | 0) + 1; }));
    st.bag.forEach((c) => { if (c && c.k === 'item') { const id = itemId(c); if (need[id] > 0) need[id]--; } });
    return need;
  }
  // 건드리지 않는 것: 발생기 · 마지막 단계 · 모래더미 · 보조 물건(식혜·엽전·소라별·보자기) · 무지개 소라 · 고정(핀)
  const autoOk = (st, i) => { const c = st.board[i]; return !!c && c.k === 'item' && !isAux(c.c) && c.t < maxTier(c.c) && !c.pin && !covered(st, i); };
  // 결과는 두 칸 중 아래쪽(같은 줄이면 왼쪽)
  const lowerLeft = (a, b) => { const A = rc(a), B = rc(b); if (A.r !== B.r) return A.r > B.r ? a : b; return A.c < B.c ? a : b; };
  function autoPairs(st) {
    const res = autoReserve(st), groups = {};
    for (let i = 0; i < N; i++) if (autoOk(st, i)) { const id = itemId(st.board[i]); (groups[id] = groups[id] || []).push(i); }
    const pairs = [];
    Object.keys(groups).forEach((id) => {
      const list = groups[id];
      const avail = list.slice(0, Math.max(0, list.length - (res[id] | 0)));
      for (let k = 0; k + 1 < avail.length; k += 2) {
        const to = lowerLeft(avail[k], avail[k + 1]);
        pairs.push({ from: to === avail[k] ? avail[k + 1] : avail[k], to });
      }
    });
    return pairs;
  }
  // 짝지어 합치기 → 결과가 또 짝이 되면 이어서(연쇄) · 더 없을 때까지
  function runAuto(st, now) {
    const steps = [];
    for (let guard = 0; guard < 120; guard++) {
      const ps = autoPairs(st);
      if (!ps.length) break;
      ps.forEach((p) => steps.push(Object.assign({ from: p.from }, move(st, p.from, p.to, now))));
    }
    return steps;
  }
  function autoPrice(st, n) {
    if (!n) return 0;
    const A = BAL.autoMerge, m = Math.min(shopMult(st), A.multMax);
    return Math.min(A.cap, Math.max(A.min, n * A.perMerge) * m);
  }
  // 오늘 남은 무료 자동 합치기 (하루 BAL.autoMerge.freeDay 번 · 0시에 새로)
  function autoFreeLeft(st, now) {
    const b = st.boost || {};
    return Math.max(0, BAL.autoMerge.freeDay - (b.fday === dayKey(now || 0) ? b.fused | 0 : 0));
  }
  // 미리 계산 (판은 그대로): { n 합치는 횟수, steps:[{from,to}], price, token 무료 횟수 }
  function autoMergePlan(st, now) {
    const sim = clone(st);
    const steps = runAuto(sim, now || 0);
    return { n: steps.length, steps: steps.map((s) => ({ from: s.from, to: s.at })), price: autoPrice(st, steps.length), token: (st.boost && st.boost.autoTok) | 0, free: autoFreeLeft(st, now) };
  }
  // 값 치르기까지 (화면은 steps 를 하나씩 move 로 보여 줘요) · 무료 횟수가 있으면 그것부터
  function autoMergeBuy(st, now, opts) {
    const plan = autoMergePlan(st, now);
    if (!plan.n) return { ok: false, reason: 'none' };
    // 하루 무료 → 무료 쿠폰(오늘의 무료 선물) → 동전 차례
    const useFree = !(opts && opts.free === false) && plan.free > 0;
    const useTok = !useFree && !(opts && opts.token === false) && plan.token > 0;
    const price = useFree || useTok ? 0 : plan.price;
    if (st.coins < price) return { ok: false, reason: 'coins', price, short: price - st.coins };
    st.coins -= price;
    if (useTok) st.boost.autoTok--;
    if (useFree) { const d = dayKey(now || 0); if (st.boost.fday !== d) { st.boost.fday = d; st.boost.fused = 0; } st.boost.fused++; }
    st.updatedAt = now;
    return { ok: true, steps: plan.steps, n: plan.n, price, token: useTok, free: useFree };
  }
  function autoMerge(st, now, opts) {
    const b = autoMergeBuy(st, now, opts);
    if (!b.ok) return b;
    b.results = b.steps.map((p) => Object.assign({ from: p.from }, move(st, p.from, p.to, now)));
    return b;
  }
  // 자동 합치기 1분 동안: 방금 놓인 물건(at)이 짝을 만나면 바로 합치고, 결과가 또 짝이면 이어서
  //  max: 한 번에 몇 번까지 (화면은 1번씩 불러 하나씩 보여 줘요)
  function autoChain(st, at, now, max) {
    const steps = [];
    if (!(st.boost && st.boost.autoMs > 0)) return steps;
    let cur = at;
    for (let guard = 0; guard < 24 && (!max || steps.length < max); guard++) {
      if (cur < 0 || !autoOk(st, cur)) break;
      const id = itemId(st.board[cur]);
      const list = [];
      for (let i = 0; i < N; i++) if (i !== cur && autoOk(st, i) && itemId(st.board[i]) === id) list.push(i);
      if (list.length + 1 - (autoReserve(st)[id] | 0) < 2) break;
      const o = rc(cur);
      list.sort((a, b) => { const A = rc(a), B = rc(b); return (Math.abs(A.r - o.r) + Math.abs(A.c - o.c)) - (Math.abs(B.r - o.r) + Math.abs(B.c - o.c)); });
      const to = lowerLeft(cur, list[0]), from = to === cur ? list[0] : cur;
      const r = move(st, from, to, now);
      if (r.kind !== 'merge') break;
      steps.push(Object.assign({ from }, r));
      cur = r.at;
    }
    return steps;
  }
  // 도우미 남은 시간은 앱을 연 동안만 줄어요 (화면이 1초마다 dt 를 줘요)
  function boostTick(st, dt) {
    const b = st.boost;
    if (!b || dt <= 0) return false;
    const was = b.autoMs > 0 || b.handsMs > 0;
    b.autoMs = Math.max(0, b.autoMs - dt);
    b.handsMs = Math.max(0, b.handsMs - dt);
    return was;
  }
  // 고정(핀): 자동 합치기가 건드리지 않아요 (옮겨도 따라가요 · 손으로 합치면 풀려요)
  function setPin(st, i, on) {
    const c = st.board[i];
    if (!c || c.k !== 'item') return false;
    if (on) c.pin = true; else delete c.pin;
    return true;
  }

  /* ---------- 마을 복원 ---------- */
  // 지금 지역 · 작업 상태 (다 끝냈으면 area = null, last = 마지막 지역)
  function areaInfo(st) {
    const area = AREAS[st.area] || null;
    const last = AREAS[Math.min(st.area, AREAS.length - 1)];
    const show = area || last;
    const tasks = show.tasks.map((t, k) => {
      const done = !!st.tasks[t.id];
      const prevDone = k === 0 || !!st.tasks[show.tasks[k - 1].id];
      return { task: t, done, next: !done && prevDone };
    });
    const doneN = tasks.filter((x) => x.done).length;
    const next = tasks.find((x) => x.next);
    const reqPending = next && next.task.req && !st.sos[next.task.req] ? next.task.req : null;
    return { area, show, index: Math.min(st.area, AREAS.length - 1), finished: !area, tasks, doneN, total: tasks.length,
      next: next ? next.task : null, reqPending, canAfford: !!next && !reqPending && st.stars >= next.task.cost };
  }
  // 마을 그림 위에 그릴 표시: 지금 할 작업(망치) 하나만 · 끝낸 작업·아직 잠긴 작업은 그림에 안 그려요
  function mapPins(info) { return info.tasks.filter((x) => x.next && !x.done); }
  function doTask(st, taskId, now, rng) {
    const area = AREAS[st.area];
    if (!area) return { ok: false, reason: 'nomore' };
    const k = area.tasks.findIndex((t) => t.id === taskId);
    if (k < 0) return { ok: false, reason: 'gone' };
    const task = area.tasks[k];
    if (st.tasks[task.id]) return { ok: false, reason: 'done' };
    if (k > 0 && !st.tasks[area.tasks[k - 1].id]) return { ok: false, reason: 'order' };
    if (task.req && !st.sos[task.req]) return { ok: false, reason: 'req', so: task.req };
    if (st.stars < task.cost) return { ok: false, reason: 'stars', need: task.cost - st.stars };
    st.stars -= task.cost;
    st.tasks[task.id] = now;
    st.updatedAt = now;
    const res = { ok: true, task, area, areaDone: false, given: [], uncovered: [] };
    if (area.tasks.every((t) => st.tasks[t.id])) Object.assign(res, completeArea(st, now, rng));
    fillOrders(st, now, rng || Math.random);   // 새 이야기 부탁이 생겼을 수 있어요
    return res;
  }
  // 지역 다 고침 → 모래더미 걷기 · 다음 지역 열기(새 발생기·체인) · 주문 난이도 오름
  function completeArea(st, now, rng) {
    const area = AREAS[st.area];
    const out = { areaDone: true, doneArea: area, given: [], uncovered: [], nextArea: null, ending: (area.done && area.done.ending) || null };
    if (area.done && area.done.uncover) {
      for (let i = 0; i < N; i++) if (st.cover[i] > 0) { st.cover[i] = 0; out.uncovered.push(i); }
    }
    st.area++;
    const next = AREAS[st.area];
    if (next) {
      out.nextArea = next;
      (next.open.chains || []).forEach((c) => { if (st.unlocked.indexOf(c) < 0) st.unlocked.push(c); });
      (next.open.gens || []).forEach((g) => { out.given.push(Object.assign({ cell: { k: 'gen', g } }, giveCell(st, { k: 'gen', g }, rng || Math.random))); });
      // 새 지역 난이도로 주문 하나씩 바꾸지 않고, 다음에 생기는 주문부터 새 난이도
    }
    out.box = Object.assign({ cell: makeBox('chest', now) }, giveCell(st, makeBox('chest', now), rng || Math.random));   // 지역 완성 선물: 할머니의 보물 궤짝 (발생기 다음)
    return out;
  }

  /* ---------- 숨은 비밀 (편지 조각 · 갈매기 · 병 속 편지) ---------- */
  const GULL_TOTAL = AREAS.reduce((s, a) => s + ((a.secrets && a.secrets.gulls) || []).length, 0);
  const LETTER_TOTAL = Object.keys(LETTERS).length;
  const gullId = (area, k) => area.id + '_g' + k;
  // 오늘 병 속 편지가 떠오른 자리 (이미 주웠으면 null) · 지금까지 연 지역의 바닷가 중 날짜로 하나
  function bottleToday(st, now) {
    const day = dayKey(now);
    if (st.sec.bottleDay === day) return null;
    const spots = [];
    AREAS.forEach((a, i) => { if (i <= st.area) ((a.secrets && a.secrets.bottle) || []).forEach((p) => spots.push({ area: i, x: p[0], y: p[1] })); });
    return spots.length ? spots[hash(day) % spots.length] : null;
  }
  // 이 지역 그림에 지금 숨어 있는 것들 (아직 안 찾은 것만)
  function secretsIn(st, idx, now) {
    const area = AREAS[idx];
    if (!area || idx > st.area || !area.secrets) return [];
    const out = [];
    (area.secrets.letters || []).forEach((l) => { if (!st.sec.letters[l.id] && (!l.after || st.tasks[l.after])) out.push({ kind: 'letter', id: l.id, x: l.x, y: l.y }); });
    (area.secrets.gulls || []).forEach((g, k) => { const id = gullId(area, k); if (!st.sec.gulls[id]) out.push({ kind: 'gull', id, x: g[0], y: g[1] }); });
    const b = bottleToday(st, now);
    if (b && b.area === idx) out.push({ kind: 'bottle', id: 'bottle', x: b.x, y: b.y });
    return out;
  }
  function secretCounts(st) {
    const letters = Object.keys(st.sec.letters).length;
    return { letters, lettersMax: LETTER_TOTAL, gulls: Object.keys(st.sec.gulls).length, gullsMax: GULL_TOTAL, title: st.sec.title || '',
      album: letters >= LETTER_TOTAL && !!(st.seen && st.seen.ending) };
  }
  function findSecret(st, kind, id, now, rng) {
    const where = AREAS.findIndex((a, i) => secretsIn(st, i, now).some((x) => x.kind === kind && x.id === id));
    if (where < 0) return { ok: false, reason: 'gone' };
    st.updatedAt = now;
    if (kind === 'letter') {
      st.sec.letters[id] = now;
      st.gems += SECRETS.letterGems;
      return { ok: true, kind, id, text: LETTERS[id], gems: SECRETS.letterGems, count: Object.keys(st.sec.letters).length, max: LETTER_TOTAL };
    }
    if (kind === 'gull') {
      st.sec.gulls[id] = now;
      let coins = SECRETS.gullCoins;
      const count = Object.keys(st.sec.gulls).length;
      const all = count >= GULL_TOTAL && !st.sec.title;
      if (all) { st.sec.title = SECRETS.gullTitle; coins += SECRETS.gullAllCoins; }
      st.coins += coins;
      return { ok: true, kind, id, coins, count, max: GULL_TOTAL, title: all ? SECRETS.gullTitle : '' };
    }
    const day = dayKey(now);
    st.sec.bottleDay = day;
    st.gems += SECRETS.bottleGems;
    const gift = giveCell(st, clone(SECRETS.bottleGift), rng || Math.random);
    return { ok: true, kind: 'bottle', id, gems: SECRETS.bottleGems, gift: Object.assign({ cell: SECRETS.bottleGift }, gift),
      note: SECRETS.bottleNotes[hash(day + 'n') % SECRETS.bottleNotes.length] };
  }

  /* ---------- 매일 (7일 출석 · 오늘의 부탁 3개) ---------- */
  function dailyTouch(st, now) {
    const day = dayKey(now);
    if (st.daily && st.daily.day === day) return false;
    const att = (st.daily && st.daily.att) || { n: 0, last: '' };
    const h = hash(day);
    const chains = st.unlocked.filter((c) => CHAINS[c] && !isAux(c) && !isEvent(c));
    const c = chains[h % chains.length] || 'a';
    const tier = st.area >= 3 ? 6 : st.area >= 1 ? 5 : 4;
    const first = h % 2 ? { kind: 'stat', stat: 'merges', n: 30, text: '합치기 30번' } : { kind: 'stat', stat: 'spawns', n: 40, text: '발생기 40번 톡' };
    st.daily = {
      day, att,
      base: { merges: st.stats.merges | 0, spawns: st.stats.spawns | 0, delivered: st.stats.delivered | 0 },
      q: [first, { kind: 'chain', c, n: 2, text: `${CHAINS[c].name} 부탁 2번 들어주기` }, { kind: 'tier', n: tier, text: `${tier}단계 물건 하나 만들기` }],
      del: {}, maxT: 0, claimed: false
    };
    return true;
  }
  function questInfo(st) {
    const d = st.daily;
    const q = (d.q || []).map((x) => {
      let have = 0, need = x.n;
      if (x.kind === 'stat') have = (st.stats[x.stat] | 0) - ((d.base && d.base[x.stat]) | 0);
      else if (x.kind === 'chain') have = d.del[x.c] | 0;
      else if (x.kind === 'tier') { need = 1; have = (d.maxT | 0) >= x.n ? 1 : 0; }
      have = Math.max(0, Math.min(need, have));
      return Object.assign({}, x, { have, need, done: have >= need });
    });
    return { q, all: q.length > 0 && q.every((x) => x.done), claimed: !!d.claimed, reward: DAILY.questReward };
  }
  function claimQuests(st, now, rng) {
    const qi = questInfo(st);
    if (qi.claimed) return { ok: false, reason: 'claimed' };
    if (!qi.all) return { ok: false, reason: 'notyet' };
    st.daily.claimed = true;
    st.keys = (st.keys | 0) + (FUN.questKeys | 0);
    st.updatedAt = now;
    return Object.assign({ ok: true, cell: DAILY.questReward, keys: FUN.questKeys | 0 }, giveCell(st, clone(DAILY.questReward), rng || Math.random));
  }
  function attendInfo(st, now) {
    const att = st.daily.att;
    return { n: att.n, can: att.last !== dayKey(now), idx: att.n % DAILY.attend.length, list: DAILY.attend, round: Math.floor(att.n / DAILY.attend.length) };
  }
  function claimAttend(st, now, rng) {
    const a = attendInfo(st, now);
    if (!a.can) return { ok: false, reason: 'done' };
    const rw = DAILY.attend[a.idx];
    const placed = [];
    if (rw.coins) st.coins += rw.coins;
    if (rw.gems) st.gems += rw.gems;
    (rw.give || []).forEach((cell) => placed.push(Object.assign({ cell }, giveCell(st, clone(cell), rng || Math.random))));
    if (rw.deco && st.decos.indexOf(rw.deco) < 0) st.decos.push(rw.deco);
    st.daily.att = { n: a.n + 1, last: dayKey(now) };
    st.updatedAt = now;
    return { ok: true, day: a.idx + 1, reward: rw, placed };
  }

  /* ---------- 주간 이벤트 (월 0시 ~ 일요일 밤 · 차례로 돌아가요) ---------- */
  const DAY = 864e5;
  function weekStart(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  function currentEvent(now) {
    const ws = weekStart(now);
    const r = D.EVENT_REF_MONDAY;
    const ref = new Date(r[0], r[1], r[2]).getTime();
    const week = Math.round((ws - ref) / (7 * DAY));
    const ev = EVENTS[((week % EVENTS.length) + EVENTS.length) % EVENTS.length];
    const end = new Date(ws); end.setDate(end.getDate() + 7);
    return { ev, week, start: ws, end: end.getTime() };
  }
  function eventDef(id) { return EVENTS.find((e) => e.id === id) || null; }
  function makeEventOrder(st, now, rng) {
    const e = eventDef(st.ev.id);
    const t = rint(rng, e.orders.tiers[0], e.orders.tiers[1]);
    st.ev.seq = (st.ev.seq | 0) + 1;
    return { id: 'e' + st.ev.week + '_' + st.ev.seq, who: e.who, need: [{ c: e.chain, t }], coins: sellValue(t), stars: 0, pts: e.orders.points[t] | 0,
      line: 0, bonus: null, at: now, ev: e.id, story: false };
  }
  function eventOrderFill(st, now, rng) {
    if (!st.ev || st.orders.some((o) => o.ev)) return null;
    const o = makeEventOrder(st, now, rng);
    const at = st.orders.filter((x) => x.story).length;   // 이야기 부탁 다음 자리
    st.orders.splice(at, 0, o);
    return o;
  }
  function giveReward(st, rw, now, rng) {
    if (rw.k === 'deco') { if (st.decos.indexOf(rw.id) < 0) st.decos.push(rw.id); return { reward: rw, deco: rw.id }; }
    return Object.assign({ reward: rw }, giveCell(st, clone(rw), rng || Math.random));
  }
  function addEventPoints(st, pts, now, rng) {
    const e = eventDef(st.ev.id);
    st.ev.pts += pts;
    const got = [];
    while (st.ev.got < e.track.length && st.ev.pts >= e.track[st.ev.got]) { got.push(giveReward(st, e.rewards[st.ev.got], now, rng)); st.ev.got++; }
    return got;
  }
  function eventInfo(st, now) {
    const cur = currentEvent(now);
    if (!st.ev) return { active: false, cur, from: D.EVENT_FROM_AREA };
    const e = eventDef(st.ev.id);
    return { active: true, def: e, pts: st.ev.pts, got: st.ev.got, next: e.track[st.ev.got] || 0, leftMs: Math.max(0, cur.end - now), cur };
  }
  // 이벤트 물건·발생기 정리 (끝날 때) → 동전
  function endEvent(st, now) {
    const e = eventDef(st.ev.id);
    let coins = 0, n = 0;
    const conv = (c) => {
      if (!c) return c;
      if (c.k === 'item' && isEvent(c.c)) { coins += sellValue(c); n++; return null; }
      if (c.k === 'gen' && GENS[c.g] && GENS[c.g].event) return null;
      return c;
    };
    st.board = st.board.map(conv);
    st.bag = st.bag.map(conv);
    st.gifts = st.gifts.map(conv).filter(Boolean);
    st.orders = st.orders.filter((o) => !o.ev);
    st.coins += coins;
    st.evLast = { id: e ? e.id : st.ev.id, name: e ? e.name : '', coins, n, pts: st.ev.pts, at: now };
    st.ev = null;
    st.updatedAt = now;
    return st.evLast;
  }
  function eventTick(st, now, rng) {
    const out = { ended: null, started: null };
    const cur = currentEvent(now);
    if (st.ev && (st.ev.week !== cur.week || !eventDef(st.ev.id))) out.ended = endEvent(st, now);
    if (!st.ev && st.area >= D.EVENT_FROM_AREA) {
      st.ev = { id: cur.ev.id, week: cur.week, pts: 0, got: 0, seq: 0 };
      out.started = { ev: cur.ev, gen: Object.assign({ cell: { k: 'gen', g: cur.ev.gen } }, giveCell(st, { k: 'gen', g: cur.ev.gen }, rng || Math.random)) };
      st.updatedAt = now;
    }
    if (st.ev) eventOrderFill(st, now, rng || Math.random);
    return out;
  }
  // 장식 놓기 (마을 지도 세계 px · v4) · wx 가 없으면 치우기
  function placeDeco(st, id, wx, wy, now) {
    if (st.decos.indexOf(id) < 0 || id === 'mongdol_hat') return { ok: false, reason: 'none' };
    if (wx == null) { delete st.placed[id]; st.updatedAt = now; return { ok: true, removed: true }; }
    const W = TOWN.map.w, H = TOWN.map.h;
    st.placed[id] = { wx: Math.round(Math.max(20, Math.min(W - 20, +wx))), wy: Math.round(Math.max(20, Math.min(H - 20, +wy))) };
    st.updatedAt = now;
    return { ok: true };
  }
  // 고맙다는 말: 사람마다 돌려 가며
  function thanksLine(st, who) {
    const v = VILLAGERS[who];
    const list = (v && v.thanks && v.thanks.length) ? v.thanks : ['고마워요!'];
    const k = (st.thx[who] | 0) % list.length;
    st.thx[who] = k + 1;
    return list[k];
  }
  // 도감: 체인마다 찾은 단계
  function collection(st) {
    return Object.keys(CHAINS).map((c) => {
      const tiers = CHAINS[c].tiers.map((nm, k) => ({ t: k + 1, name: nm, found: !!st.found[c + (k + 1)] }));
      return { c, name: CHAINS[c].name, aux: isAux(c), event: isEvent(c), tiers, n: tiers.filter((t) => t.found).length };
    });
  }

  /* ---------- 위 칸 숫자 붙잡기 (동전·별이 날아가는 동안만 옛 숫자) ----------
     버그(2026-11): 이벤트 부탁(별 0)을 건네면 '별 도착' 콜백이 안 와서 붙잡기가 영영 안 풀림
     → 위 칸은 그때 숫자에 멈추고(예: 1593) 실제 동전(353)은 강화·가방에 써서 줄어든 채 '동전이 모자라요'.
     이제: 날아가는 것 개수만큼 land() 를 세고, 늦어도 maxMs 뒤엔 저절로 풀려요 · 언제나 진짜 값은 st 에서 읽어요 */
  function hudShown(st, maxMs) {
    const MAX = maxMs || 2500;
    const h = { coins: st.coins, stars: st.stars, hold: 0, at: 0, left: 0 };
    return {
      // flies = 날아가는 묶음 수 (동전 1 + 별이 있으면 1)
      begin(now, flies) { h.hold++; h.at = now; h.left += Math.max(1, flies | 0); },
      land(key, live) { h[key] = live[key]; },
      done() { h.left = Math.max(0, h.left - 1); if (!h.left) h.hold = 0; },
      reset(live) { h.hold = 0; h.left = 0; h.coins = live.coins; h.stars = live.stars; },
      read(live, now) {
        if (h.hold && now - h.at > MAX) { h.hold = 0; h.left = 0; }
        if (!h.hold) { h.coins = live.coins; h.stars = live.stars; }
        return { coins: h.coins, stars: h.stars, holding: !!h.hold };
      }
    };
  }

  /* ---------- 마을 짓기 (merge_town.md §A · 지도 화면은 town.js) ---------- */
  // 지역 칸의 세계 좌표 원점 · 작업이 속한 지역 번호
  // 마을 좌표는 v5 부터 모두 '지도 px' (지역마다 따로 쓰던 원점은 없어요 · 옛 화면 코드와 맞추려고 0 을 돌려줘요)
  function areaOrigin() { return { x: 0, y: 0 }; }
  // 지도 칸의 주인 지역 (지역 box 들이 겹쳐서 · box 반폭·반높이로 나눈 '가운데까지 거리'가 가장 가까운 지역) → AREAS 번호
  //   town.js 의 안개·장식 놓기·제목, 시험(작업 자리가 제 지역에 있는지)이 같이 써요
  function zoneAt(x, y) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < AREAS.length; i++) {
      const t = TOWN.areas[AREAS[i].id]; if (!t) continue;
      const b = t.box, c = t.center || [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      const d = Math.hypot((x - c[0]) / ((b[2] - b[0]) / 2), (y - c[1]) / ((b[3] - b[1]) / 2));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // v4 마을(지역 그림 1536×1024 를 2열×3행) · 저장 변환에만 써요
  const V4_TOWN = { tw: 1536, th: 1024, areas: {
    r1: { col: 0, row: 2, box: [300, 90, 1235, 860] }, r2: { col: 1, row: 2, box: [250, 200, 1295, 880] }, r3: { col: 0, row: 1, box: [325, 130, 1215, 855] },
    r4: { col: 1, row: 1, box: [330, 145, 1220, 835] }, r5: { col: 1, row: 0, box: [355, 205, 1220, 810] }, r6: { col: 0, row: 0, box: [340, -70, 1180, 855] } } };
  function v4ToMap(wx, wy) {
    const col = Math.max(0, Math.min(1, Math.floor(wx / V4_TOWN.tw))), row = Math.max(0, Math.min(2, Math.floor(wy / V4_TOWN.th)));
    const id = Object.keys(V4_TOWN.areas).find((k) => V4_TOWN.areas[k].col === col && V4_TOWN.areas[k].row === row);
    const o = V4_TOWN.areas[id], nb = TOWN.areas[id] && TOWN.areas[id].box;
    if (!o || !nb) return null;
    const b = o.box, lx = wx - col * V4_TOWN.tw, ly = wy - row * V4_TOWN.th;
    const fx = Math.max(0, Math.min(1, (lx - b[0]) / (b[2] - b[0]))), fy = Math.max(0, Math.min(1, (ly - b[1]) / (b[3] - b[1])));
    return { wx: Math.round(nb[0] + (nb[2] - nb[0]) * (0.15 + 0.7 * fx)), wy: Math.round(nb[1] + (nb[3] - nb[1]) * (0.15 + 0.7 * fy)) };
  }
  function taskArea(taskId) { return AREAS.findIndex((a) => a.tasks.some((t) => t.id === taskId)); }
  const isB3 = (taskId) => !!(TOWN.build[taskId] && TOWN.build[taskId].kind === 'B3');
  // 건물 모양: 지금 모양 번호 · 가진 모양 · 다른 모양 값 (30 × 그 지역 배수)
  function lookOf(st, taskId) { return Math.max(0, Math.min(2, (st.look && st.look[taskId]) | 0)); }
  function looksOwned(st, taskId) { return (st.owned && st.owned.looks && st.owned.looks[taskId]) || []; }
  function lookPrice(st, taskId) { const i = Math.max(0, taskArea(taskId)); return TOWN.lookCoins * SHOP.mult[Math.min(SHOP.mult.length - 1, i)]; }
  // 모양 고르기: 가진 것이면 바로 · 아직 하나도 없으면(지을 때) 무료 · 그 밖엔 buy 일 때 동전으로 열고 바꿔요
  function setLook(st, taskId, k, now, buy) {
    k = k | 0;
    if (!isB3(taskId) || k < 0 || k > 2) return { ok: false, reason: 'gone' };
    if (!st.tasks[taskId]) return { ok: false, reason: 'notbuilt' };
    const own = looksOwned(st, taskId).slice();
    let free = false, price = 0;
    if (own.indexOf(k) < 0) {
      if (!own.length) free = true;
      else {
        price = lookPrice(st, taskId);
        if (!buy) return { ok: false, reason: 'locked', price };
        if (st.coins < price) return { ok: false, reason: 'coins', price, short: price - st.coins };
        st.coins -= price;
      }
      own.push(k);
      st.owned.looks[taskId] = own;
    }
    st.look[taskId] = k;
    st.updatedAt = now;
    return { ok: true, k, free, price };
  }
  // 모양 고르기 창을 그냥 닫으면: 첫 모양을 무료로
  function firstLook(st, taskId, now) {
    if (isB3(taskId) && st.tasks[taskId] && !looksOwned(st, taskId).length) return setLook(st, taskId, 0, now);
    return { ok: false };
  }
  // 아직 모양을 안 고른(옮긴 저장 포함) 지은 건물들
  function looksPending(st) { return Object.keys(TOWN.build).filter((id) => isB3(id) && st.tasks[id] && !looksOwned(st, id).length); }

  // 마을 장식 (상점 꾸미기 · 몇 개든) → st.decos 에 'f_종류_번호' 로 · 지도에서 놓아요
  function fillerPrice(st) { return TOWN.fillerCoins * shopMult(st); }
  function buyFiller(st, kind, now) {
    if (!TOWN.fillers[kind]) return { ok: false, reason: 'gone' };
    const price = fillerPrice(st);
    if (st.coins < price) return { ok: false, reason: 'coins', price, short: price - st.coins };
    st.coins -= price;
    st.fillerSeq = (st.fillerSeq | 0) + 1;
    const id = 'f_' + kind + '_' + st.fillerSeq;
    st.decos.push(id);
    st.updatedAt = now;
    return { ok: true, id, price };
  }
  const decoKind = (id) => { const m = /^f_([a-z]+)_\d+$/.exec(id); return m ? m[1] : null; };

  // 하윤 옷 · 몽돌 소품
  const inSeason = (o, now) => !o.season || o.season.indexOf(new Date(now).getMonth() + 1) >= 0;
  function buyOutfit(st, id, pay, now) {
    const o = OUTFITS[id];
    if (!o || !o.coins) return { ok: false, reason: 'gone' };
    if (st.owned.outfits.indexOf(id) >= 0) return { ok: false, reason: 'have' };
    if (!inSeason(o, now)) return { ok: false, reason: 'season' };
    const cur = pay === 'gems' && o.gems ? 'gems' : 'coins';
    const price = cur === 'gems' ? o.gems : o.coins;
    if (st[cur] < price) return { ok: false, reason: cur, price, short: price - st[cur] };
    st[cur] -= price;
    st.owned.outfits.push(id);
    st.updatedAt = now;              // 사기만 해요 · 입을지는 화면이 물어봐요 ("지금 입을까요?" → wearOutfit)
    return { ok: true, id, price, pay: cur };
  }
  // 옷 칸 상태: buy(사기) · wear(입기) · worn(입는 중 · 지금 입은 한 벌만) · season(철 아님)
  function outfitState(st, id, now) {
    const o = OUTFITS[id];
    if (!o) return 'gone';
    if (st.outfit === id) return 'worn';
    if (id === 'base' || st.owned.outfits.indexOf(id) >= 0) return 'wear';
    return inSeason(o, now) ? 'buy' : 'season';
  }
  // 살 때 묻는 말 ("○○을(를) 동전 N개에 살까요?")
  // 받침: 끝의 괄호·따옴표(」 ) 같은 것은 건너뛰고 마지막 한글로 봐요 · 숫자는 읽는 소리로 (1 일 · 2 이 · 3 삼 …)
  const hasBatchim = (w) => {
    const s = String(w);
    for (let i = s.length - 1; i >= 0; i--) {
      const ch = s[i], c = s.charCodeAt(i);
      if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 > 0;
      if (ch >= '0' && ch <= '9') return '013678'.indexOf(ch) >= 0;
    }
    return false;
  };
  function buyAsk(name, price, pay, verb) {
    return `${name}${hasBatchim(name) ? '을' : '를'} ${pay === 'gems' ? '소라별' : '동전'} ${price}개에 ${verb || '살까요'}?`;
  }
  function wearOutfit(st, id, now) {
    if (!OUTFITS[id] || (id !== 'base' && st.owned.outfits.indexOf(id) < 0)) return { ok: false, reason: 'locked' };
    st.outfit = id; st.updatedAt = now;
    return { ok: true };
  }
  const mongHas = (st, id) => (MONG_ACC[id] && MONG_ACC[id].deco ? st.decos.indexOf(MONG_ACC[id].deco) >= 0 : st.owned.mong.indexOf(id) >= 0);
  function buyMong(st, id, now) {
    const m = MONG_ACC[id];
    if (!m || !m.coins) return { ok: false, reason: 'gone' };
    if (mongHas(st, id)) return { ok: false, reason: 'have' };
    if (st.coins < m.coins) return { ok: false, reason: 'coins', price: m.coins, short: m.coins - st.coins };
    st.coins -= m.coins;
    st.owned.mong.push(id);
    st.mongAcc = id;
    st.updatedAt = now;
    return { ok: true, id, price: m.coins };
  }
  function wearMong(st, id, now) {
    if (id != null && !mongHas(st, id)) return { ok: false, reason: 'locked' };
    st.mongAcc = id || null; st.updatedAt = now;
    return { ok: true };
  }
  // 지은 건물 톡: 하루 한 번씩 엽전 1~3
  function tapToy(st, taskId, now, rng) {
    if (!st.tasks[taskId]) return { ok: false };
    const day = dayKey(now);
    if (st.tapDay[taskId] === day) return { ok: true, coins: 0 };
    st.tapDay[taskId] = day;
    const coins = rint(rng || Math.random, TOWN.tapCoins[0], TOWN.tapCoins[1]);
    st.coins += coins;
    st.updatedAt = now;
    return { ok: true, coins };
  }

  /* ---------- 마을 사람 선물 · 우정 (merge_town.md §I) ---------- */
  const FRIENDS = Object.keys(FRIEND.loves);
  function friendOf(st, who) {
    if (!st.friend[who]) st.friend[who] = { pts: 0, lv: 0, day: '', n: 0, seen: {} };
    return st.friend[who];
  }
  function giftScore(who, cell) {
    if (!cell || cell.k !== 'item') return { pts: 0, kind: 'no' };
    const id = itemId(cell);
    if ((FRIEND.loves[who] || []).indexOf(id) >= 0) return { pts: cell.t * 3 + 10, kind: 'love' };
    if (VILLAGERS[who] && VILLAGERS[who].chains.indexOf(cell.c) >= 0) return { pts: cell.t * 2, kind: 'like' };
    return { pts: cell.t, kind: 'ok' };
  }
  function friendInfo(st, who, now) {
    const f = friendOf(st, who);
    const day = dayKey(now);
    const left = FRIEND.perDay - (f.day === day ? f.n : 0);
    const next = FRIEND.lv[f.lv] || null;
    return { who, pts: f.pts, lv: f.lv, max: FRIEND.lv.length, next, prev: f.lv ? FRIEND.lv[f.lv - 1] : 0, left: Math.max(0, left), seen: f.seen, f };
  }
  // 점수 더하기 → 단계가 오르면 보상 (여러 단계 한 번에도)
  function addFriend(st, who, pts, now, rng) {
    if (FRIENDS.indexOf(who) < 0 || pts <= 0) return [];
    const f = friendOf(st, who);
    f.pts += pts;
    const ups = [];
    while (f.lv < FRIEND.lv.length && f.pts >= FRIEND.lv[f.lv]) {
      f.lv++;
      const up = { who, lv: f.lv };
      if (f.lv === 1) { up.coins = FRIEND.coins1 * shopMult(st); st.coins += up.coins; }
      if (f.lv === 2) { up.gems = FRIEND.gems2; st.gems += up.gems; up.letter = FRIEND.letters[who]; f.letter = true; }
      if (f.lv === 3) { up.gems = FRIEND.gems3; st.gems += up.gems; f.pendDeco = true; }   // 우정 장식 그림이 오면 받아요
      if (f.lv === 4) { up.scene = who; const c = { k: 'item', c: 'bj', t: 3 }; up.gift = Object.assign({ cell: c }, giveCell(st, clone(c), rng || Math.random)); }
      if (f.lv === 5) {
        up.gems = FRIEND.gems5; st.gems += up.gems; f.pendOutfit = true;
        up.title = VILLAGERS[who].name + '의 단짝';
        if (FRIENDS.every((k) => st.friend[k] && st.friend[k].lv >= FRIEND.lv.length) && !st.friendAll) {
          st.friendAll = FRIEND.allTitle; up.all = FRIEND.allTitle;
          up.wild = [];
          for (let i = 0; i < FRIEND.allWild; i++) up.wild.push(giveCell(st, { k: 'wild' }, rng || Math.random));
        }
      }
      ups.push(up);
    }
    return ups;
  }
  // 선물하기: from = { board: 칸 } | { bag: 칸 } · 하루 한 사람당 3번
  function giveGift(st, who, from, now, rng) {
    if (FRIENDS.indexOf(who) < 0) return { ok: false, reason: 'gone' };
    const info = friendInfo(st, who, now);
    if (info.left <= 0) return { ok: false, reason: 'day' };
    const cell = from.bag != null ? st.bag[from.bag] : st.board[from.board];
    if (!cell || cell.k !== 'item') return { ok: false, reason: 'noitem' };
    const sc = giftScore(who, cell);
    if (from.bag != null) st.bag[from.bag] = null; else st.board[from.board] = null;
    const f = info.f, day = dayKey(now);
    if (f.day !== day) { f.day = day; f.n = 0; }
    f.n++;
    f.seen[itemId(cell)] = sc.kind;
    const ups = addFriend(st, who, sc.pts, now, rng);
    st.updatedAt = now;
    return { ok: true, cell, pts: sc.pts, kind: sc.kind, ups, line: FRIEND.react[who][sc.kind === 'love' ? 0 : sc.kind === 'like' ? 1 : 2] };
  }
  // 선물로 줄 수 있는 물건 (판·가방 · 발생기 빼고)
  function giftChoices(st) {
    const out = [];
    st.board.forEach((c, i) => { if (c && c.k === 'item' && !covered(st, i)) out.push({ cell: c, from: { board: i } }); });
    st.bag.forEach((c, i) => { if (c && c.k === 'item') out.push({ cell: c, from: { bag: i } }); });
    return out;
  }

  /* ---------- 저장 문자열 (save.js 가 씀) ---------- */
  function serialize(st) { return JSON.stringify(st); }
  function validCell(c) {
    if (c === null) return true;
    if (!c || typeof c !== 'object') return false;
    if (c.k === 'gen') return !!GENS[c.g];
    if (c.k === 'wild') return true;
    if (c.k === 'box') return !!FUN.box[c.b] && isFinite(c.open);
    if (c.k === 'bubble') return !!CHAINS[c.c] && c.t >= 1 && c.t <= maxTier(c.c) && isFinite(c.until);
    return (c.k === 'item' || c.k === 'net') && !!CHAINS[c.c] && c.t >= 1 && c.t <= maxTier(c.c);
  }
  // 옛 저장 변환 (v 가 오를 때 여기에 한 단계씩 추가)
  const MIGRATE = {
    // v1 → v2: 복원·가방·모래더미·소라별 칸 추가 (옛 판에는 모래더미를 덮지 않아요)
    1: (st) => {
      st.cover = new Array(N).fill(0);
      st.area = Number(st.area) || 0;
      st.tasks = st.tasks && typeof st.tasks === 'object' ? st.tasks : {};
      st.story = st.story && typeof st.story === 'object' ? st.story : {};
      const oldBag = Array.isArray(st.bag) ? st.bag.filter(Boolean) : [];
      st.bag = new Array(Math.max(BAL.bagStart, oldBag.length)).fill(null);
      oldBag.forEach((c, k) => { st.bag[k] = c; });
      st.gifts = [];
      st.gems = 0;
      st.charge = {};
      if (st.stats && st.stats.sold == null) st.stats.sold = 0;
      st.v = 2;
      return st;
    },
    // v2 → v3: 소리 크기 1~3 단계 → 0~100 · 배경음은 옛 기본값(꺼짐)이었을 뿐이라 한 번만 켜요(bgmAsked) · 상점·도우미 칸
    2: (st) => {
      const s = st.settings && typeof st.settings === 'object' ? st.settings : {};
      const SV = [0, 35, 65, 100], BV = [0, 35, 60, 90];
      if (typeof s.vol === 'number' && s.vol <= 3) s.vol = SV[Math.max(0, s.vol | 0)];
      if (typeof s.bgmVol === 'number' && s.bgmVol <= 3) s.bgmVol = BV[Math.max(0, s.bgmVol | 0)];
      if (!s.bgmAsked) { s.bgm = true; s.bgmAsked = true; }
      st.settings = s;
      st.v = 3;
      return st;
    },
    // v3 → v4: 진짜 마을 짓기 · 끝낸 작업 = 지은 건물(첫 모양 무료) · 장식 자리 % → 지도 세계 px · 처음 열 때 '새 모습' 안내
    3: (st) => {
      st.tasks = st.tasks && typeof st.tasks === 'object' ? st.tasks : {};
      st.look = {}; st.owned = { looks: {}, outfits: ['base'], mong: [] };
      Object.keys(st.tasks).forEach((id) => { if (isB3(id)) { st.look[id] = 0; st.owned.looks[id] = [0]; } });
      const placed = st.placed && typeof st.placed === 'object' ? st.placed : {};
      st.placed = {};
      Object.keys(placed).forEach((id) => {
        const p = placed[id];
        if (!p || typeof p !== 'object') return;
        const o = V4_TOWN.areas[AREAS[Math.max(0, Math.min(AREAS.length - 1, p.a | 0))].id];
        // 옛 % 는 옛 그림 기준이라 섬 안쪽(지역 그림 가운데 60%)으로 옮겨요 → 바다에 빠지지 않게 (v4 세계 px · 아래 v4 → v5 가 새 지도로 옮겨요)
        st.placed[id] = { wx: Math.round(o.col * V4_TOWN.tw + V4_TOWN.tw * (0.25 + 0.5 * Math.max(0, Math.min(100, +p.x || 50)) / 100)),
          wy: Math.round(o.row * V4_TOWN.th + V4_TOWN.th * (0.3 + 0.45 * Math.max(0, Math.min(100, +p.y || 50)) / 100)) };
      });
      st.seen = st.seen && typeof st.seen === 'object' ? st.seen : {};
      if (Object.keys(st.tasks).length) st.seen.townNew = 1;   // '마을이 새 모습이 됐어요!' 한 번
      st.v = 4;
      return st;
    },
    // v4 → v5: 마을 지도가 지역 섬 6장(2열×3행) → 하나로 이어진 섬 지도로 · 놓은 장식 자리(옛 세계 px)를 같은 지역의 새 자리로 옮겨요
    //   옛 지역 칸 안 섬 테두리(box)에서의 비율 → 새 지역 box 의 안쪽 70% 에서 같은 비율 (바다에 빠지지 않게)
    4: (st) => {
      const placed = st.placed && typeof st.placed === 'object' ? st.placed : {};
      st.placed = {};
      Object.keys(placed).forEach((id) => {
        const p = placed[id];
        if (!p || typeof p.wx !== 'number' || typeof p.wy !== 'number') return;
        const q = v4ToMap(p.wx, p.wy);
        if (q) st.placed[id] = q;
      });
      st.cam = null;                                          // 옛 지도의 카메라 자리는 버려요
      st.v = 5;
      return st;
    },
    // v5 → v6: 형식은 그대로 (거품·그물·상자·옷장이 새로 생김) · 버전만 올려서
    //   배포 직후 옛 화면(v5 코드)이 새 저장을 '더 새 버전'으로 알아보고 덮어쓰지 않게 해요
    5: (st) => { st.v = 6; return st; }
  };
  function deserialize(str, now, rng) {
    let st;
    try { st = JSON.parse(str); } catch (e) { return null; }
    if (!st || typeof st !== 'object' || typeof st.v !== 'number') return null;
    while (st.v < D.VERSION && MIGRATE[st.v]) st = MIGRATE[st.v](st);
    if (st.v !== D.VERSION) return null;
    if (!Array.isArray(st.board) || st.board.length !== N) return null;
    st.board = st.board.map((c) => (validCell(c) ? c : null));
    // 빠진 칸은 새 판 기본값으로 메워요 (필드를 새로 추가해도 옛 저장이 깨지지 않게)
    const def = newState(now);
    Object.keys(def).forEach((k) => { if (st[k] === undefined || st[k] === null) st[k] = def[k]; });
    ['settings', 'stats'].forEach((k) => { Object.keys(def[k]).forEach((j) => { if (st[k][j] === undefined) st[k][j] = def[k][j]; }); });
    ['energy', 'coins', 'stars', 'starsEarned', 'gems'].forEach((k) => { st[k] = Math.max(0, Number(st[k]) || 0); });
    st.energy = Math.min(BAL.energyCap, st.energy);
    if (!(st.energyAt <= now)) st.energyAt = now;   // 기기 시각이 뒤로 갔을 때
    if (!Array.isArray(st.cover) || st.cover.length !== N) st.cover = new Array(N).fill(0);
    st.cover = st.cover.map((v, i) => (st.board[i] ? 0 : Math.max(0, Math.min(3, v | 0))));
    if (!Array.isArray(st.bag)) st.bag = [];
    st.bag = st.bag.slice(0, BAL.bagMax).map((c) => (validCell(c) && !stuck(c) ? c : null));
    while (st.bag.length < BAL.bagStart) st.bag.push(null);
    st.gifts = (Array.isArray(st.gifts) ? st.gifts : []).filter((c) => c && validCell(c) && !stuck(c));
    st.keys = Math.max(0, Math.min(999, Number(st.keys) | 0));
    if (!st.fun || typeof st.fun !== 'object' || Array.isArray(st.fun)) st.fun = { bday: '', bused: 0 };
    if (typeof st.fun.bday !== 'string') st.fun.bday = '';
    st.fun.bused = Math.max(0, st.fun.bused | 0);
    st.area = Math.max(0, Math.min(AREAS.length, Number(st.area) | 0));
    if (!Array.isArray(st.unlocked)) st.unlocked = START.chains.slice();
    st.unlocked = st.unlocked.filter((c) => CHAINS[c] && !isAux(c));
    st.orders = (Array.isArray(st.orders) ? st.orders : []).filter((o) => o && Array.isArray(o.need) && o.need.length && o.need.every((n) => CHAINS[n.c] && n.t >= 1 && n.t <= maxTier(n.c)));
    st.orders.forEach((o) => { if (o.bonus && !validCell(o.bonus)) o.bonus = null; if (o.box && !FUN.box[o.box]) delete o.box; if (o.rush && !isFinite(o.rush)) delete o.rush; });
    ['genLv', 'sos', 'placed', 'thx'].forEach((k) => { if (!st[k] || typeof st[k] !== 'object' || Array.isArray(st[k])) st[k] = {}; });
    st.sec = Object.assign({ letters: {}, gulls: {}, bottleDay: '', title: '' }, st.sec && typeof st.sec === 'object' ? st.sec : {});
    st.daily = Object.assign(def.daily, st.daily && typeof st.daily === 'object' ? st.daily : {});
    if (!st.daily.att || typeof st.daily.att !== 'object') st.daily.att = { n: 0, last: '' };
    if (!st.daily.del || typeof st.daily.del !== 'object') st.daily.del = {};
    if (!Array.isArray(st.decos)) st.decos = [];
    if (st.ev && (typeof st.ev !== 'object' || !eventDef(st.ev.id))) st.ev = null;
    if (!st.ev) st.orders = st.orders.filter((o) => !o.ev);
    ['vol', 'bgmVol'].forEach((k) => { st.settings[k] = Math.max(0, Math.min(100, Number(st.settings[k]) || 0)); });
    if (st.settings.bgmStyle !== 'east') st.settings.bgmStyle = 'piano';   // 배경음악 종류: 피아노(기본) · 동양풍
    if (!st.shop || typeof st.shop !== 'object' || Array.isArray(st.shop)) st.shop = def.shop;
    if (!Array.isArray(st.shop.deals)) st.shop.deals = [];
    st.shop.deals = st.shop.deals.filter((d) => d && (d.id === 'tier' ? CHAINS[d.c] && D.SHOP.tierPrice[d.t] : D.SHOP.items[d.id]));
    if (!st.shop.bought || typeof st.shop.bought !== 'object') st.shop.bought = {};
    st.boost = Object.assign({ autoMs: 0, handsMs: 0, autoTok: 0, fday: '', fused: 0 }, st.boost && typeof st.boost === 'object' ? st.boost : {});
    if (typeof st.boost.fday !== 'string') st.boost.fday = '';
    ['autoMs', 'handsMs', 'autoTok', 'fused'].forEach((k) => { st.boost[k] = Math.max(0, Number(st.boost[k]) || 0); });
    // 마을 (v4)
    ['look', 'tapDay', 'friend'].forEach((k) => { if (!st[k] || typeof st[k] !== 'object' || Array.isArray(st[k])) st[k] = {}; });
    Object.keys(st.look).forEach((id) => { if (!isB3(id)) delete st.look[id]; else st.look[id] = Math.max(0, Math.min(2, st.look[id] | 0)); });
    const ow = st.owned && typeof st.owned === 'object' ? st.owned : {};
    st.owned = { looks: ow.looks && typeof ow.looks === 'object' ? ow.looks : {}, outfits: Array.isArray(ow.outfits) ? ow.outfits.filter((x) => OUTFITS[x]) : [], mong: Array.isArray(ow.mong) ? ow.mong.filter((x) => MONG_ACC[x]) : [] };
    if (st.owned.outfits.indexOf('base') < 0) st.owned.outfits.unshift('base');
    Object.keys(st.owned.looks).forEach((id) => { const v = st.owned.looks[id]; st.owned.looks[id] = isB3(id) && Array.isArray(v) ? v.filter((k) => k >= 0 && k <= 2) : []; if (!st.owned.looks[id].length) delete st.owned.looks[id]; });
    if (!OUTFITS[st.outfit] || st.owned.outfits.indexOf(st.outfit) < 0) st.outfit = 'base';
    if (st.mongAcc && !mongHas(st, st.mongAcc)) st.mongAcc = null;
    Object.keys(st.placed).forEach((id) => { const p = st.placed[id]; if (!p || typeof p.wx !== 'number' || typeof p.wy !== 'number') delete st.placed[id]; });
    Object.keys(st.friend).forEach((k) => { const f = st.friend[k]; if (FRIENDS.indexOf(k) < 0 || !f || typeof f !== 'object') { delete st.friend[k]; return; } f.pts = Math.max(0, +f.pts || 0); f.lv = Math.max(0, Math.min(FRIEND.lv.length, f.lv | 0)); f.n = f.n | 0; if (!f.seen || typeof f.seen !== 'object') f.seen = {}; });
    if (st.cam && (typeof st.cam !== 'object' || !isFinite(st.cam.x) || !isFinite(st.cam.y) || !isFinite(st.cam.z))) st.cam = null;
    fillOrders(st, now, rng || Math.random);
    regen(st, now);
    return st;
  }
  // 저장 두 개를 견줄 때 쓰는 짧은 요약 (서버 ↔ 기기)
  function summary(st) {
    return { stars: st.stars | 0, coins: st.coins | 0, tasks: Object.keys(st.tasks || {}).length, area: st.area | 0,
      delivered: (st.stats && st.stats.delivered) | 0, merges: (st.stats && st.stats.merges) | 0, updatedAt: st.updatedAt || 0 };
  }

  const API = {
    N, HOME, maxTier, isAux, itemId, itemName, sellValue, sellAsk, rc, dayKey,
    newState, regen, energyInfo, refill, refillPrice,
    covered, isFree, emptyCount, nearestEmpty, giveCell, chargeInfo, genTap, tapGen, canMerge, mergeResult, move, peel, findPair,
    sell, useItem, bagPrice, growBag, toBag, fromBag, takeGift, snapshot, restore,
    shopMult, shopChains, itemCoins, shopTouch, shopBuy, shopReroll, shopFree, dealPrice, restingGens,
    autoReserve, autoPairs, autoPrice, autoFreeLeft, autoMergePlan, autoMergeBuy, autoMerge, autoChain, boostTick, setPin,
    orderLevel, makeOrder, fillOrders, orderStatus, orderGuide, deliver, skipOrder,
    areaInfo, mapPins, doTask, completeArea,
    areaOrigin, v4ToMap, zoneAt, taskArea, isB3, lookOf, looksOwned, lookPrice, setLook, firstLook, looksPending, fillerPrice, buyFiller, decoKind,
    inSeason, buyOutfit, wearOutfit, outfitState, buyAsk, mongHas, buyMong, wearMong, tapToy,
    FRIENDS, friendOf, giftScore, friendInfo, addFriend, giveGift, giftChoices,
    isEvent, genLevel, chargeTaps, genUpInfo, upgradeGen, storyOrderActive, syncStoryOrders,
    bottleToday, secretsIn, secretCounts, findSecret, GULL_TOTAL, LETTER_TOTAL,
    dailyTouch, questInfo, claimQuests, attendInfo, claimAttend,
    weekStart, currentEvent, eventInfo, eventTick, endEvent, makeEventOrder, placeDeco, thanksLine, collection,
    serialize, deserialize, summary, MIGRATE, hudShown,
    HOLD_MS, holdGap, holdStop,
    stuck, unnet, maybeBubble, bubbleInfo, popBubble, maybeNet, makeBox, boxInfo, openBox, funTick
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
