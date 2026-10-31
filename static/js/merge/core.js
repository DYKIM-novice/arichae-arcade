/* 머지관 · 「소라섬 등불 이야기」 규칙 (화면 없음 · node 시험 가능)
   - 상태(st)는 그냥 객체 하나 → 저장은 save.js 가 JSON 으로 (v 필드로 옛 저장 변환: MIGRATE)
   - 모든 함수는 now(ms)·rng(0~1 함수)를 받아요 → 시험에서 시각·운을 정할 수 있어요
   - 판 칸: null | {k:'item', c:'a', t:3} | {k:'gen', g:'gen_a'} | {k:'wild'}(무지개 소라)
   - st.cover[i] = 모래더미 겹 수 (0 = 열린 칸) · st.bag = 가방 칸 배열(null = 빈칸) · st.gifts = 선물함(자리가 없을 때 받은 것)
   - 복원: st.area = 지금 지역 번호 · st.tasks[작업 id] = 끝낸 시각 · st.story[장면 id] = 본 장면 */
(function (root) {
  'use strict';

  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.MergeData;
  const { CHAINS, GENS, AREAS, BOARD, BAL, START, VILLAGERS } = D;
  const N = BOARD.cols * BOARD.rows;
  const COLS = BOARD.cols;

  const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const maxTier = (c) => (CHAINS[c] ? CHAINS[c].tiers.length : 0);
  const isAux = (c) => !!(CHAINS[c] && CHAINS[c].aux);
  const itemId = (cell) => (cell && cell.k === 'item' ? cell.c + cell.t : '');
  const rc = (i) => ({ r: Math.floor(i / COLS), c: i % COLS });
  const dayKey = (now) => { const d = new Date(now); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const HOME = N - Math.ceil(COLS / 2);   // 선물이 떨어지는 곳 (맨 아래 가운데)

  function itemName(cell) {
    if (!cell) return '';
    if (cell.k === 'gen') return GENS[cell.g] ? GENS[cell.g].name : '';
    if (cell.k === 'wild') return '무지개 소라';
    return (CHAINS[cell.c] && CHAINS[cell.c].tiers[cell.t - 1]) || '';
  }
  // 판매값: 체인 물건 2^(단계-1) · 보조 물건은 단계만큼 · 무지개 소라 5 · 발생기는 못 팔아요
  function sellValue(x) {
    if (typeof x === 'number') return Math.pow(2, x - 1);
    if (!x || x.k === 'gen') return 0;
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
      settings: { sfx: true, vib: true, easy: false, nums: true, hint: true },
      seen: {},
      area: 0, tasks: {}, story: {},
      bag: new Array(BAL.bagStart).fill(null), gifts: [], charge: {},
      events: {},
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
    return { left: rest ? 0 : g.charge.taps - ch.n, max: g.charge.taps, restMs: rest };
  }
  function tapGen(st, idx, now, rng) {
    const g = st.board[idx];
    if (!g || g.k !== 'gen') return { ok: false, reason: 'notgen' };
    const info = GENS[g.g];
    const ch = chargeInfo(st, g.g, now);
    if (ch && ch.restMs > 0) return { ok: false, reason: 'rest', waitMs: ch.restMs };
    const at = nearestEmpty(st, idx, rng);
    if (at < 0) return { ok: false, reason: 'full' };
    regen(st, now);
    const free = !!st.settings.easy;
    if (!free && st.energy < BAL.spawnCost) return { ok: false, reason: 'energy' };
    if (!free) {
      if (st.energy >= BAL.energyMax) st.energyAt = now;   // 가득 찬 상태에서 처음 쓰면 그때부터 회복 시계 시작
      st.energy -= BAL.spawnCost;
    }
    if (info.charge) {
      const c = st.charge[g.g] || { n: 0, until: 0 };
      if (c.until && c.until <= now) { c.n = 0; c.until = 0; }
      c.n++;
      if (c.n >= info.charge.taps) { c.n = 0; c.until = now + info.charge.restMs; }
      st.charge[g.g] = c;
    }
    const t = rng() < BAL.spawnTier2 ? 2 : 1;
    const cell = { k: 'item', c: info.chain, t };
    st.board[at] = cell;
    const first = markFound(st, cell);
    if (first) st.gems += BAL.firstFindGems;
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
    st.updatedAt = now;
    if (!b) { st.board[to] = a; st.board[from] = null; return { kind: 'move', at: to }; }
    if (canMerge(a, b)) {
      const cell = mergeResult(a, b);
      st.board[to] = cell; st.board[from] = null;
      const first = markFound(st, cell);
      if (first) st.gems += BAL.firstFindGems;
      st.stats.merges++;
      st.stats.best[cell.c] = Math.max(st.stats.best[cell.c] || 0, cell.t);
      const peeled = peel(st, to);
      return { kind: 'merge', at: to, cell, first, max: cell.t >= maxTier(cell.c), peeled };
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

  /* ---------- 팔기 · 보조 물건 쓰기 ---------- */
  function sell(st, idx, now) {
    const cell = st.board[idx];
    if (!cell || cell.k === 'gen') return { ok: false, reason: cell ? 'gen' : 'empty' };
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
  function buyShop(st, id, now, rng) {
    const it = BAL.shop.find((x) => x.id === id);
    if (!it) return { ok: false, reason: 'gone' };
    if (st.gems < it.gems) return { ok: false, reason: 'gems', price: it.gems };
    st.gems -= it.gems;
    const r = giveCell(st, clone(it.cell), rng);
    st.updatedAt = now;
    return Object.assign({ ok: true, cell: it.cell, price: it.gems }, r);
  }

  /* ---------- 되돌리기 (마지막 행동 1번: 옮기기·합치기·팔기·가방) ---------- */
  function snapshot(st) { return JSON.stringify({ board: st.board, bag: st.bag, cover: st.cover, gifts: st.gifts, coins: st.coins, gems: st.gems }); }
  function restore(st, snap) {
    try {
      const s = JSON.parse(snap);
      ['board', 'bag', 'cover', 'gifts', 'coins', 'gems'].forEach((k) => { st[k] = s[k]; });
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 주문 ---------- */
  // 주문 난이도 = 지금 복원 중인 지역 (다 고친 뒤에는 마지막 지역)
  function orderLevel(st) { return Math.max(0, Math.min(st.area || 0, AREAS.length - 1)); }
  function villagerFor(chain, used, rng) {
    const all = Object.keys(VILLAGERS).filter((k) => VILLAGERS[k].chains.indexOf(chain) >= 0);
    const free = all.filter((k) => used.indexOf(k) < 0);
    const pool = free.length ? free : all;
    return pool.length ? pick(rng, pool) : 'hayun';
  }
  function makeOrder(st, now, rng) {
    const area = AREAS[orderLevel(st)];
    let chains = area.chains.filter((c) => st.unlocked.indexOf(c) >= 0);
    if (!chains.length) chains = st.unlocked.filter((c) => !isAux(c));
    const usedChains = st.orders.map((o) => o.need[0].c);
    const fresh = chains.filter((c) => usedChains.indexOf(c) < 0);
    const lo = area.orders.tiers[0];
    let hi = area.orders.tiers[1];
    if (st.orders.some((o) => now - o.at > BAL.orderStuckMs)) hi = Math.max(lo, hi - 1);   // 막힘 방지
    const n = rint(rng, area.orders.items[0], area.orders.items[1]);
    const need = [];
    for (let i = 0; i < n; i++) {
      const pool = i === 0 && fresh.length ? fresh : chains;
      const c = pick(rng, pool);
      const t = Math.min(maxTier(c), rint(rng, lo, hi));
      need.push({ c, t });
    }
    need.sort((x, y) => (x.c < y.c ? -1 : x.c > y.c ? 1 : x.t - y.t));
    const sum = need.reduce((s, x) => s + sellValue(x.t), 0);
    const tsum = need.reduce((s, x) => s + x.t, 0);
    const who = villagerFor(need[0].c, st.orders.map((o) => o.who), rng);
    st.orderSeq++;
    const line = Math.floor(rng() * 3);
    const bonus = rng() < BAL.orderBonus ? clone(pick(rng, BAL.bonusPool)) : null;
    return {
      id: 'o' + st.orderSeq, who, need,
      coins: Math.ceil(sum * BAL.orderCoinMult),
      stars: 1 + Math.floor(tsum / 4),
      line, bonus,
      at: now, story: false
    };
  }
  function fillOrders(st, now, rng) {
    const out = [];
    while (st.orders.length < BAL.ordersShown) { const o = makeOrder(st, now, rng); st.orders.push(o); out.push(o); }
    return out;
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
    st.orders.splice(k, 1);
    let bonus = null;
    if (order.bonus) bonus = Object.assign({ cell: order.bonus }, giveCell(st, clone(order.bonus), rng, s.cells.find((i) => i >= 0)));
    const added = fillOrders(st, now, rng);
    st.updatedAt = now;
    return { ok: true, order, cells: s.cells, bag: s.bag, coins: order.coins, stars: order.stars, added, bonus };
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
    return { area, show, index: Math.min(st.area, AREAS.length - 1), finished: !area, tasks, doneN, total: tasks.length,
      next: next ? next.task : null, canAfford: !!next && st.stars >= next.task.cost };
  }
  function doTask(st, taskId, now, rng) {
    const area = AREAS[st.area];
    if (!area) return { ok: false, reason: 'nomore' };
    const k = area.tasks.findIndex((t) => t.id === taskId);
    if (k < 0) return { ok: false, reason: 'gone' };
    const task = area.tasks[k];
    if (st.tasks[task.id]) return { ok: false, reason: 'done' };
    if (k > 0 && !st.tasks[area.tasks[k - 1].id]) return { ok: false, reason: 'order' };
    if (st.stars < task.cost) return { ok: false, reason: 'stars', need: task.cost - st.stars };
    st.stars -= task.cost;
    st.tasks[task.id] = now;
    st.updatedAt = now;
    const res = { ok: true, task, area, areaDone: false, given: [], uncovered: [] };
    if (area.tasks.every((t) => st.tasks[t.id])) Object.assign(res, completeArea(st, now, rng));
    return res;
  }
  // 지역 다 고침 → 모래더미 걷기 · 다음 지역 열기(새 발생기·체인) · 주문 난이도 오름
  function completeArea(st, now, rng) {
    const area = AREAS[st.area];
    const out = { areaDone: true, doneArea: area, given: [], uncovered: [], nextArea: null };
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
    return out;
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
    }
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
    st.bag = st.bag.slice(0, BAL.bagMax).map((c) => (validCell(c) ? c : null));
    while (st.bag.length < BAL.bagStart) st.bag.push(null);
    st.gifts = (Array.isArray(st.gifts) ? st.gifts : []).filter((c) => c && validCell(c));
    st.area = Math.max(0, Math.min(AREAS.length, Number(st.area) | 0));
    if (!Array.isArray(st.unlocked)) st.unlocked = START.chains.slice();
    st.unlocked = st.unlocked.filter((c) => CHAINS[c] && !isAux(c));
    st.orders = (Array.isArray(st.orders) ? st.orders : []).filter((o) => o && Array.isArray(o.need) && o.need.length && o.need.every((n) => CHAINS[n.c] && n.t >= 1 && n.t <= maxTier(n.c)));
    st.orders.forEach((o) => { if (o.bonus && !validCell(o.bonus)) o.bonus = null; });
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
    covered, isFree, emptyCount, nearestEmpty, giveCell, chargeInfo, tapGen, canMerge, mergeResult, move, peel, findPair,
    sell, useItem, bagPrice, growBag, toBag, fromBag, takeGift, buyShop, snapshot, restore,
    orderLevel, makeOrder, fillOrders, orderStatus, deliver, skipOrder,
    areaInfo, doTask, completeArea,
    serialize, deserialize, summary, MIGRATE
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
