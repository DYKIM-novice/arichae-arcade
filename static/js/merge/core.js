/* 머지관 · 「소라섬 등불 이야기」 규칙 (화면 없음 · node 시험 가능)
   - 상태(st)는 그냥 객체 하나 → 저장은 save.js 가 JSON 으로 (v 필드로 옛 저장 변환)
   - 모든 함수는 now(ms)·rng(0~1 함수)를 받아요 → 시험에서 시각·운을 정할 수 있어요
   - 판 칸: null | {k:'item', c:'a', t:3} | {k:'gen', g:'gen_a'} | {k:'wild'}(무지개 소라, 나중 단계)
   - 나중 단계 자리: st.area(복원 지역) · st.tasks(복원 작업) · st.story(본 장면) · st.bag(가방) · st.events */
(function (root) {
  'use strict';

  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.MergeData;
  const { CHAINS, GENS, AREAS, BOARD, BAL, START, VILLAGERS } = D;
  const N = BOARD.cols * BOARD.rows;

  const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const maxTier = (c) => (CHAINS[c] ? CHAINS[c].tiers.length : 0);
  const itemId = (cell) => (cell && cell.k === 'item' ? cell.c + cell.t : '');
  const rc = (i) => ({ r: Math.floor(i / BOARD.cols), c: i % BOARD.cols });
  const dayKey = (now) => { const d = new Date(now); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

  function itemName(cell) {
    if (!cell) return '';
    if (cell.k === 'gen') return GENS[cell.g] ? GENS[cell.g].name : '';
    if (cell.k === 'wild') return '무지개 소라';
    return (CHAINS[cell.c] && CHAINS[cell.c].tiers[cell.t - 1]) || '';
  }
  const sellValue = (t) => Math.pow(2, t - 1);

  /* ---------- 새 판 ---------- */
  function newState(now, rng) {
    const board = new Array(N).fill(null);
    START.gens.forEach((g) => { board[g.at] = { k: 'gen', g: g.id }; });
    START.items.forEach((it) => { board[it.at] = { k: 'item', c: it.c, t: it.t }; });
    const st = {
      v: D.VERSION,
      board,
      energy: START.energy, energyAt: now,
      coins: START.coins, stars: START.stars, starsEarned: 0,
      orders: [], orderSeq: 0, skipAt: 0,
      found: {}, unlocked: Object.keys(CHAINS),
      refill: { day: dayKey(now), n: 0 },
      stats: { merges: 0, spawns: 0, delivered: 0, best: {} },
      settings: { sfx: true, vib: true, easy: false, nums: true, hint: true },
      seen: {},
      // 나중 단계 자리 (지금은 비어 있어요)
      area: 0, tasks: {}, story: {}, bag: [], events: {},
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
    return { price: n < BAL.refillPrices.length ? BAL.refillPrices[n] : 0, left: BAL.refillPrices.length - n };
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

  /* ---------- 발생기 ---------- */
  // 발생기에서 가장 가까운 빈칸 (거리 같으면 운으로)
  function nearestEmpty(st, from, rng) {
    const o = rc(from);
    let best = [], bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (st.board[i]) continue;
      const p = rc(i);
      const d = Math.max(Math.abs(p.r - o.r), Math.abs(p.c - o.c)) * 10 + Math.abs(p.r - o.r) + Math.abs(p.c - o.c);
      if (d < bd) { bd = d; best = [i]; } else if (d === bd) best.push(i);
    }
    if (!best.length) return -1;
    return best[Math.floor(rng() * best.length) % best.length];
  }
  function tapGen(st, idx, now, rng) {
    const g = st.board[idx];
    if (!g || g.k !== 'gen') return { ok: false, reason: 'notgen' };
    const at = nearestEmpty(st, idx, rng);
    if (at < 0) return { ok: false, reason: 'full' };
    regen(st, now);
    const free = !!st.settings.easy;
    if (!free && st.energy < BAL.spawnCost) return { ok: false, reason: 'energy' };
    if (!free) {
      if (st.energy >= BAL.energyMax) st.energyAt = now;   // 가득 찬 상태에서 처음 쓰면 그때부터 회복 시계 시작
      st.energy -= BAL.spawnCost;
    }
    const c = GENS[g.g].chain;
    const t = rng() < BAL.spawnTier2 ? 2 : 1;
    const cell = { k: 'item', c, t };
    st.board[at] = cell;
    const first = !st.found[itemId(cell)];
    st.found[itemId(cell)] = true;
    st.stats.spawns++;
    st.updatedAt = now;
    return { ok: true, at, cell, first };
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
  // from → to : 빈칸이면 이동 · 같은 것이면 합치기(to 자리에) · 다르면 자리 바꾸기
  function move(st, from, to, now) {
    if (from === to || from < 0 || to < 0 || from >= N || to >= N) return { kind: 'none' };
    const a = st.board[from], b = st.board[to];
    if (!a) return { kind: 'none' };
    st.updatedAt = now;
    if (!b) { st.board[to] = a; st.board[from] = null; return { kind: 'move', at: to }; }
    if (canMerge(a, b)) {
      const cell = mergeResult(a, b);
      st.board[to] = cell; st.board[from] = null;
      const id = itemId(cell);
      const first = !st.found[id];
      st.found[id] = true;
      st.stats.merges++;
      st.stats.best[cell.c] = Math.max(st.stats.best[cell.c] || 0, cell.t);
      return { kind: 'merge', at: to, cell, first, max: cell.t >= maxTier(cell.c) };
    }
    st.board[to] = a; st.board[from] = b;
    return { kind: 'swap', at: to };
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

  /* ---------- 주문 ---------- */
  // 지금 주문 난이도 (1단계: 모은 별로 정해요 · 2단계부터는 복원한 지역 st.area 로 바꿔 끼우면 돼요)
  function orderLevel(st) {
    let lv = 0;
    while (lv < AREAS.length - 1 && st.starsEarned >= AREAS[lv].starsToNext) lv++;
    return Math.max(lv, Math.min(st.area || 0, AREAS.length - 1));
  }
  function villagerFor(chain, used, rng) {
    const all = Object.keys(VILLAGERS).filter((k) => VILLAGERS[k].chains.indexOf(chain) >= 0);
    const free = all.filter((k) => used.indexOf(k) < 0);
    const pool = free.length ? free : all;
    return pool.length ? pool[Math.floor(rng() * pool.length) % pool.length] : 'hayun';
  }
  function makeOrder(st, now, rng) {
    const area = AREAS[orderLevel(st)];
    const chains = area.chains.filter((c) => st.unlocked.indexOf(c) >= 0);
    const usedChains = st.orders.map((o) => o.need[0].c);
    const fresh = chains.filter((c) => usedChains.indexOf(c) < 0);
    const lo = area.orders.tiers[0];
    let hi = area.orders.tiers[1];
    if (st.orders.some((o) => now - o.at > BAL.orderStuckMs)) hi = Math.max(lo, hi - 1);   // 막힘 방지
    const n = rint(rng, area.orders.items[0], area.orders.items[1]);
    const need = [];
    for (let i = 0; i < n; i++) {
      const pool = i === 0 && fresh.length ? fresh : chains;
      const c = pool[Math.floor(rng() * pool.length) % pool.length];
      const t = Math.min(maxTier(c), rint(rng, lo, hi));
      need.push({ c, t });
    }
    need.sort((x, y) => (x.c < y.c ? -1 : x.c > y.c ? 1 : x.t - y.t));
    const sum = need.reduce((s, x) => s + sellValue(x.t), 0);
    const tsum = need.reduce((s, x) => s + x.t, 0);
    const who = villagerFor(need[0].c, st.orders.map((o) => o.who), rng);
    st.orderSeq++;
    return {
      id: 'o' + st.orderSeq, who, need,
      coins: Math.ceil(sum * BAL.orderCoinMult),
      stars: 1 + Math.floor(tsum / 4),
      line: Math.floor(rng() * 3),
      at: now, story: false
    };
  }
  function fillOrders(st, now, rng) {
    const out = [];
    while (st.orders.length < BAL.ordersShown) { const o = makeOrder(st, now, rng); st.orders.push(o); out.push(o); }
    return out;
  }
  // 이 주문에 쓸 판 칸 찾기 (같은 물건 2개가 필요하면 다른 칸 2개)
  function orderStatus(st, order) {
    const used = {};
    const cells = order.need.map((n) => {
      for (let i = 0; i < N; i++) {
        const c = st.board[i];
        if (!used[i] && c && c.k === 'item' && c.c === n.c && c.t === n.t) { used[i] = true; return i; }
      }
      return -1;
    });
    return { cells, have: cells.map((i) => i >= 0), ready: cells.every((i) => i >= 0) };
  }
  function deliver(st, orderId, now, rng) {
    const k = st.orders.findIndex((o) => o.id === orderId);
    if (k < 0) return { ok: false, reason: 'gone' };
    const order = st.orders[k];
    const s = orderStatus(st, order);
    if (!s.ready) return { ok: false, reason: 'missing', have: s.have };
    s.cells.forEach((i) => { st.board[i] = null; });
    st.coins += order.coins;
    st.stars += order.stars;
    st.starsEarned += order.stars;
    st.stats.delivered++;
    st.orders.splice(k, 1);
    const added = fillOrders(st, now, rng);
    st.updatedAt = now;
    return { ok: true, order, cells: s.cells, coins: order.coins, stars: order.stars, added };
  }
  function skipOrder(st, orderId, now, rng) {
    const wait = (st.skipAt || 0) + BAL.skipCooldownMs - now;
    if (wait > 0) return { ok: false, reason: 'cool', waitMs: wait };
    const k = st.orders.findIndex((o) => o.id === orderId);
    if (k < 0) return { ok: false, reason: 'gone' };
    const old = st.orders.splice(k, 1)[0];
    const o = makeOrder(st, now, rng);
    st.orders.splice(k, 0, o);
    st.skipAt = now;
    st.updatedAt = now;
    return { ok: true, old, order: o };
  }

  /* ---------- 저장 문자열 (save.js 가 씀) ---------- */
  function serialize(st) { return JSON.stringify(st); }
  function validCell(c) {
    if (c === null) return true;
    if (!c || typeof c !== 'object') return false;
    if (c.k === 'gen') return !!GENS[c.g];
    if (c.k === 'wild') return true;
    return c.k === 'item' && !!CHAINS[c.c] && c.t >= 1 && c.t <= maxTier(c.c);
  }
  // 옛 저장 변환 (v 가 오를 때 여기에 한 단계씩 추가)
  const MIGRATE = {
    // 1: (st) => { ...; st.v = 2; return st; }
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
    Object.keys(def).forEach((k) => { if (st[k] === undefined) st[k] = def[k]; });
    ['settings', 'stats'].forEach((k) => { Object.keys(def[k]).forEach((j) => { if (st[k][j] === undefined) st[k][j] = def[k][j]; }); });
    ['energy', 'coins', 'stars', 'starsEarned'].forEach((k) => { st[k] = Math.max(0, Number(st[k]) || 0); });
    st.energy = Math.min(BAL.energyMax, st.energy);
    if (!(st.energyAt <= now)) st.energyAt = now;   // 기기 시각이 뒤로 갔을 때
    st.orders = (Array.isArray(st.orders) ? st.orders : []).filter((o) => o && Array.isArray(o.need) && o.need.length && o.need.every((n) => CHAINS[n.c] && n.t >= 1 && n.t <= maxTier(n.c)));
    fillOrders(st, now, rng || Math.random);
    regen(st, now);
    return st;
  }

  const API = {
    N, maxTier, itemId, itemName, sellValue, rc, dayKey,
    newState, regen, energyInfo, refill, refillPrice,
    nearestEmpty, tapGen, canMerge, mergeResult, move, findPair,
    orderLevel, makeOrder, fillOrders, orderStatus, deliver, skipOrder,
    serialize, deserialize
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
