/* 머지관 · 「소라섬 등불 이야기」 규칙 (화면 없음 · node 시험 가능)
   - 상태(st)는 그냥 객체 하나 → 저장은 save.js 가 JSON 으로 (v 필드로 옛 저장 변환: MIGRATE)
   - 모든 함수는 now(ms)·rng(0~1 함수)를 받아요 → 시험에서 시각·운을 정할 수 있어요
   - 판 칸: null | {k:'item', c:'a', t:3} | {k:'gen', g:'gen_a'} | {k:'wild'}(무지개 소라)
   - st.cover[i] = 모래더미 겹 수 (0 = 열린 칸) · st.bag = 가방 칸 배열(null = 빈칸) · st.gifts = 선물함(자리가 없을 때 받은 것)
   - 복원: st.area = 지금 지역 번호 · st.tasks[작업 id] = 끝낸 시각 · st.story[장면 id] = 본 장면 */
(function (root) {
  'use strict';

  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.MergeData;
  const { CHAINS, GENS, AREAS, BOARD, BAL, START, VILLAGERS, STORY_ORDERS, SECRETS, DAILY, EVENTS, LETTERS } = D;
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
      settings: { sfx: true, vib: true, easy: false, nums: true, hint: true, bgm: false, vol: 2, bgmVol: 2, big: false, calm: false },
      seen: {},
      area: 0, tasks: {}, story: {},
      bag: new Array(BAL.bagStart).fill(null), gifts: [], charge: {},
      events: {},
      genLv: {},                 // 발생기 강화 단계 (0~3)
      sos: {},                   // 끝낸 이야기 부탁 (id → 시각)
      sec: { letters: {}, gulls: {}, bottleDay: '', title: '' },   // 숨은 비밀
      daily: { day: '', att: { n: 0, last: '' }, base: null, q: [], del: {}, maxT: 0, claimed: false },
      ev: null,                  // 지금 주간 이벤트 { id, week, pts, got, seq }
      evLast: null,              // 지난 이벤트 정리 결과 (화면이 한 번 알려 줘요)
      decos: [], placed: {},     // 장식 (가진 것 · 마을에 놓은 자리)
      thx: {},                   // 고맙다는 말 돌려 쓰기 (사람 → 다음 번호)
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
    const lv = genLevel(st, g.g);
    const t2 = lv ? BAL.genUp.tier2[lv] : BAL.spawnTier2, t3 = BAL.genUp.tier3[lv] || 0;
    const roll = rng();
    const t = roll < t3 ? 3 : roll < t3 + t2 ? 2 : 1;
    const cell = { k: 'item', c: info.chain, t };
    st.board[at] = cell;
    const first = markFound(st, cell);
    if (first) st.gems += BAL.firstFindGems;
    st.stats.spawns++;
    st.updatedAt = now;
    return { ok: true, at, cell, first };
  }

  /* ---------- 발생기 강화 (동전 3번) ---------- */
  function genLevel(st, gid) { return Math.max(0, Math.min(BAL.genUp.prices.length, (st.genLv && st.genLv[gid]) | 0)); }
  function genUpInfo(st, gid) {
    const g = GENS[gid];
    if (!g || g.event) return null;
    const lv = genLevel(st, gid);
    const price = lv < BAL.genUp.prices.length ? BAL.genUp.prices[lv] : 0;
    return { lv, max: BAL.genUp.prices.length, price, tier2: lv ? BAL.genUp.tier2[lv] : BAL.spawnTier2, tier3: BAL.genUp.tier3[lv] || 0 };
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
    if (st.orders.some((o) => !o.story && !o.ev && now - o.at > BAL.orderStuckMs)) hi = Math.max(lo, hi - 1);   // 막힘 방지
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
    if (order.story) st.sos[order.story] = now;
    if (st.daily && !order.ev) {   // 오늘의 부탁 '○○ 부탁 n번'
      const seen = {};
      order.need.forEach((x) => { if (!seen[x.c]) { seen[x.c] = 1; st.daily.del[x.c] = (st.daily.del[x.c] | 0) + 1; } });
    }
    let evRewards = null;
    if (order.ev && st.ev && st.ev.id === order.ev) evRewards = addEventPoints(st, order.pts | 0, now, rng);
    let bonus = null;
    if (order.bonus) bonus = Object.assign({ cell: order.bonus }, giveCell(st, clone(order.bonus), rng, s.cells.find((i) => i >= 0)));
    const added = fillOrders(st, now, rng);
    st.updatedAt = now;
    if (order.ev) eventOrderFill(st, now, rng);
    return { ok: true, order, cells: s.cells, bag: s.bag, coins: order.coins, stars: order.stars, added, bonus, story: order.story || null, evRewards };
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
    st.updatedAt = now;
    return Object.assign({ ok: true, cell: DAILY.questReward }, giveCell(st, clone(DAILY.questReward), rng || Math.random));
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
  // 장식 놓기 (마을 그림 위 · 지역 번호 · 그림 전체 기준 %) · x 가 없으면 치우기
  function placeDeco(st, id, area, x, y, now) {
    if (st.decos.indexOf(id) < 0) return { ok: false, reason: 'none' };
    if (x == null) { delete st.placed[id]; st.updatedAt = now; return { ok: true, removed: true }; }
    st.placed[id] = { a: area | 0, x: Math.max(3, Math.min(97, +x)), y: Math.max(3, Math.min(97, +y)) };
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
    ['genLv', 'sos', 'placed', 'thx'].forEach((k) => { if (!st[k] || typeof st[k] !== 'object' || Array.isArray(st[k])) st[k] = {}; });
    st.sec = Object.assign({ letters: {}, gulls: {}, bottleDay: '', title: '' }, st.sec && typeof st.sec === 'object' ? st.sec : {});
    st.daily = Object.assign(def.daily, st.daily && typeof st.daily === 'object' ? st.daily : {});
    if (!st.daily.att || typeof st.daily.att !== 'object') st.daily.att = { n: 0, last: '' };
    if (!st.daily.del || typeof st.daily.del !== 'object') st.daily.del = {};
    if (!Array.isArray(st.decos)) st.decos = [];
    if (st.ev && (typeof st.ev !== 'object' || !eventDef(st.ev.id))) st.ev = null;
    if (!st.ev) st.orders = st.orders.filter((o) => !o.ev);
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
    areaInfo, mapPins, doTask, completeArea,
    isEvent, genLevel, genUpInfo, upgradeGen, storyOrderActive, syncStoryOrders,
    bottleToday, secretsIn, secretCounts, findSecret, GULL_TOTAL, LETTER_TOTAL,
    dailyTouch, questInfo, claimQuests, attendInfo, claimAttend,
    weekStart, currentEvent, eventInfo, eventTick, endEvent, makeEventOrder, placeDeco, thanksLine, collection,
    serialize, deserialize, summary, MIGRATE
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
