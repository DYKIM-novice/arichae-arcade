// 머지관 「소라섬 등불 이야기」 규칙 시험:  node tools/merge_test.js
// 합치기 규칙 · 발생기/에너지 회복 · 주문 완료 · 저장/불러오기 · 복원 작업·지역 · 모래더미 · 가방·팔기·되돌리기 · v1→v2 변환
'use strict';
const assert = require('assert');
const path = require('path');
const base = path.join(__dirname, '..', 'static', 'js', 'merge');
const D = require(path.join(base, 'data.js'));
const C = require(path.join(base, 'core.js'));
const S = require(path.join(base, 'save.js'));

function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const T0 = new Date(2026, 9, 31, 12, 0, 0).getTime();
const item = (c, t) => ({ k: 'item', c, t });
function emptyState(rng) {
  const st = C.newState(T0, rng || seeded(1));
  st.board = st.board.map(() => null);
  st.cover = st.cover.map(() => 0);
  return st;
}
let n = 0;
function test(name, fn) { fn(); n++; console.log('  ok', name); }

console.log('합치기 규칙');
test('같은 체인·같은 단계 → 다음 단계 (놓은 자리에)', () => {
  const st = emptyState();
  st.board[0] = item('a', 1); st.board[1] = item('a', 1);
  const r = C.move(st, 0, 1, T0);
  assert.strictEqual(r.kind, 'merge');
  assert.deepStrictEqual(st.board[1], item('a', 2));
  assert.strictEqual(st.board[0], null);
  assert.strictEqual(r.first, true);
  assert.strictEqual(st.stats.merges, 1);
});
test('같은 걸 두 번째 만들면 새 발견 아님', () => {
  const st = emptyState();
  st.found.a2 = true;
  st.board[0] = item('a', 1); st.board[1] = item('a', 1);
  assert.strictEqual(C.move(st, 0, 1, T0).first, false);
});
test('다른 단계·다른 체인 → 자리 바꾸기', () => {
  const st = emptyState();
  st.board[0] = item('a', 1); st.board[1] = item('a', 2); st.board[2] = item('b', 1);
  assert.strictEqual(C.move(st, 0, 1, T0).kind, 'swap');
  assert.deepStrictEqual(st.board[0], item('a', 2));
  assert.deepStrictEqual(st.board[1], item('a', 1));
  assert.strictEqual(C.move(st, 1, 2, T0).kind, 'swap');
});
test('빈칸 → 이동', () => {
  const st = emptyState();
  st.board[5] = item('d', 3);
  assert.strictEqual(C.move(st, 5, 40, T0).kind, 'move');
  assert.deepStrictEqual(st.board[40], item('d', 3));
  assert.strictEqual(st.board[5], null);
});
test('마지막 단계는 더 안 합쳐짐', () => {
  const st = emptyState();
  const mx = C.maxTier('b');
  assert.strictEqual(mx, 9);
  st.board[0] = item('b', mx); st.board[1] = item('b', mx);
  assert.strictEqual(C.canMerge(st.board[0], st.board[1]), false);
  assert.strictEqual(C.move(st, 0, 1, T0).kind, 'swap');
  st.board[2] = item('b', mx - 1); st.board[3] = item('b', mx - 1);
  const r = C.move(st, 2, 3, T0);
  assert.strictEqual(r.kind, 'merge'); assert.strictEqual(r.max, true);
});
test('발생기는 합쳐지지 않고 자리 바꾸기 · 같은 칸·빈 칸 출발은 무시', () => {
  const st = emptyState();
  st.board[0] = { k: 'gen', g: 'gen_a' }; st.board[1] = { k: 'gen', g: 'gen_a' };
  assert.strictEqual(C.move(st, 0, 1, T0).kind, 'swap');
  assert.strictEqual(C.move(st, 3, 4, T0).kind, 'none');
  assert.strictEqual(C.move(st, 0, 0, T0).kind, 'none');
});
test('무지개 소라(만능)는 아무 물건과 합쳐 다음 단계', () => {
  const st = emptyState();
  st.board[0] = { k: 'wild' }; st.board[1] = item('d', 4);
  assert.strictEqual(C.move(st, 0, 1, T0).kind, 'merge');
  assert.deepStrictEqual(st.board[1], item('d', 5));
});
test('힌트: 합칠 수 있는 짝 찾기', () => {
  const st = emptyState();
  st.board[3] = item('a', 2); st.board[9] = item('b', 2); st.board[20] = item('a', 2);
  assert.deepStrictEqual(C.findPair(st), [3, 20]);
  st.board[20] = null;
  assert.strictEqual(C.findPair(st), null);
});

console.log('발생기 · 에너지');
test('발생기 톡 → 가까운 빈칸에 1단계 · 에너지 1', () => {
  const st = emptyState(); st.energy = 100;
  st.board[31] = { k: 'gen', g: 'gen_b' };
  const r = C.tapGen(st, 31, T0, () => 0.5);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.cell, item('b', 1));
  const a = C.rc(31), b = C.rc(r.at);
  assert.ok(Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1, '옆칸');
  assert.strictEqual(st.energy, 99);
});
test('10% 확률로 2단계', () => {
  const st = emptyState(); st.board[0] = { k: 'gen', g: 'gen_d' };
  const r = C.tapGen(st, 0, T0, () => 0.05);
  assert.strictEqual(r.cell.t, 2);
});
test('판이 꽉 차면 에너지를 안 써요', () => {
  const st = emptyState(); st.energy = 50;
  st.board = st.board.map((_, i) => (i === 0 ? { k: 'gen', g: 'gen_a' } : item('d', 1 + (i % 3))));
  const r = C.tapGen(st, 0, T0, Math.random);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'full');
  assert.strictEqual(st.energy, 50);
});
test('에너지 0이면 못 뽑고, 편하게 모드면 무료', () => {
  const st = emptyState(); st.energy = 0; st.energyAt = T0;
  st.board[0] = { k: 'gen', g: 'gen_a' };
  assert.strictEqual(C.tapGen(st, 0, T0, Math.random).reason, 'energy');
  st.settings.easy = true;
  assert.ok(C.tapGen(st, 0, T0, Math.random).ok);
  assert.strictEqual(st.energy, 0);
});
test('2분에 1씩 회복 · 남은 시간 이어짐 · 최대 100', () => {
  const st = emptyState(); st.energy = 10; st.energyAt = T0;
  C.regen(st, T0 + 119999); assert.strictEqual(st.energy, 10);
  C.regen(st, T0 + 120000); assert.strictEqual(st.energy, 11);
  C.regen(st, T0 + 5 * 120000 + 60000); assert.strictEqual(st.energy, 15);
  assert.strictEqual(C.energyInfo(st, T0 + 5 * 120000 + 60000).nextMs, 60000);
  C.regen(st, T0 + 1000 * 120000); assert.strictEqual(st.energy, 100);
  assert.strictEqual(C.energyInfo(st, T0 + 1000 * 120000).full, true);
});
test('앱을 닫았다 열어도 시각 기준으로 회복 (저장 후 불러오기)', () => {
  const st = emptyState(); st.energy = 40; st.energyAt = T0;
  const back = C.deserialize(C.serialize(st), T0 + 60 * 60000, seeded(3));
  assert.strictEqual(back.energy, 70);
});
test('동전으로 기운 채우기: 하루 3번 · 가격 오름 · 다음 날 초기화', () => {
  const st = emptyState(); st.energy = 0; st.energyAt = T0; st.coins = 1000;
  const prices = [];
  for (let i = 0; i < 3; i++) { st.energy = 0; const r = C.refill(st, T0); assert.ok(r.ok); prices.push(r.price); }
  assert.deepStrictEqual(prices, D.BAL.refillPrices);
  st.energy = 0;
  assert.strictEqual(C.refill(st, T0).reason, 'limit');
  st.energy = 0; st.energyAt = T0 + 24 * 3600000;
  assert.ok(C.refill(st, T0 + 24 * 3600000).ok);
  const poor = emptyState(); poor.energy = 0; poor.coins = 1;
  assert.strictEqual(C.refill(poor, T0).reason, 'coins');
});

console.log('주문');
test('새 판에 주문 3장 · 1지역 규칙(1개 · 2~4단계 · A/B/D) · 서로 다른 체인', () => {
  for (let s = 1; s < 40; s++) {
    const st = C.newState(T0, seeded(s));
    assert.strictEqual(st.orders.length, 3);
    const chains = st.orders.map((o) => o.need[0].c).sort().join('');
    assert.strictEqual(chains, 'abd');
    st.orders.forEach((o) => {
      assert.strictEqual(o.need.length, 1);
      assert.ok(o.need[0].t >= 2 && o.need[0].t <= 4);
      assert.ok(D.VILLAGERS[o.who].chains.indexOf(o.need[0].c) >= 0, '체인 맞는 마을 사람');
      assert.strictEqual(o.coins, Math.ceil(Math.pow(2, o.need[0].t - 1) * 1.5));
      assert.strictEqual(o.stars, 1 + Math.floor(o.need[0].t / 4));
    });
  }
});
test('물건이 없으면 건네기 실패, 있으면 물건 빠지고 동전·별 + 새 주문', () => {
  const st = emptyState(seeded(7));
  const o = st.orders[0];
  const need = o.need[0];
  assert.strictEqual(C.orderStatus(st, o).ready, false);
  assert.strictEqual(C.deliver(st, o.id, T0, seeded(8)).reason, 'missing');
  st.board[12] = item(need.c, need.t);
  st.board[13] = item(need.c, need.t);
  const s = C.orderStatus(st, o);
  assert.ok(s.ready); assert.deepStrictEqual(s.cells, [12]);
  const r = C.deliver(st, o.id, T0, seeded(8));
  assert.ok(r.ok);
  assert.strictEqual(st.board[12], null);
  assert.deepStrictEqual(st.board[13], item(need.c, need.t), '하나만 가져가요');
  assert.strictEqual(st.coins, o.coins); assert.strictEqual(st.stars, o.stars); assert.strictEqual(st.starsEarned, o.stars);
  assert.strictEqual(st.orders.length, 3);
  assert.ok(!st.orders.some((x) => x.id === o.id));
  assert.strictEqual(st.stats.delivered, 1);
});
test('같은 물건 2개가 필요한 주문은 다른 칸 2개를 써요', () => {
  const st = emptyState();
  const o = { id: 'x', who: 'mina', need: [item('b', 3), item('b', 3)].map(({ c, t }) => ({ c, t })), coins: 12, stars: 2, at: T0 };
  st.orders = [o];
  st.board[1] = item('b', 3);
  assert.strictEqual(C.orderStatus(st, o).ready, false);
  st.board[2] = item('b', 3);
  assert.deepStrictEqual(C.orderStatus(st, o).cells, [1, 2]);
  assert.ok(C.deliver(st, 'x', T0, seeded(2)).ok);
  assert.strictEqual(st.board[1], null); assert.strictEqual(st.board[2], null);
});
test('1지역을 다 고치면 다음 난이도(1~2개 · 3~5단계)', () => {
  const st = emptyState(seeded(5));
  assert.strictEqual(C.orderLevel(st), 0);
  st.starsEarned = 15;
  assert.strictEqual(C.orderLevel(st), 0, '별을 모으기만 해선 안 올라요');
  st.area = 1;
  assert.strictEqual(C.orderLevel(st), 1);
  st.area = 9;
  assert.strictEqual(C.orderLevel(st), D.AREAS.length - 1, '마지막 지역 뒤에는 마지막 난이도');
  st.area = 1;
  st.orders = [];
  for (let i = 0; i < 30; i++) {
    const o = C.makeOrder(st, T0, seeded(100 + i));
    assert.ok(o.need.length >= 1 && o.need.length <= 2);
    o.need.forEach((x) => assert.ok(x.t >= 3 && x.t <= 5));
  }
});
test('30분 넘게 막힌 주문이 있으면 다음 주문 단계 1 낮춤', () => {
  const st = emptyState();
  st.orders = [{ id: 'old', who: 'juni', need: [{ c: 'a', t: 4 }], coins: 12, stars: 2, at: T0 - 31 * 60000 }];
  for (let i = 0; i < 30; i++) assert.ok(C.makeOrder(st, T0, seeded(200 + i)).need[0].t <= 3);
});
test('[다른 부탁]: 바꾸고 10분 쿨타임', () => {
  const st = emptyState(seeded(9));
  const id = st.orders[1].id;
  const r = C.skipOrder(st, id, T0, seeded(10));
  assert.ok(r.ok); assert.strictEqual(st.orders.length, 3); assert.notStrictEqual(st.orders[1].id, id);
  const r2 = C.skipOrder(st, st.orders[0].id, T0 + 60000, seeded(11));
  assert.strictEqual(r2.reason, 'cool'); assert.strictEqual(r2.waitMs, 9 * 60000);
  assert.ok(C.skipOrder(st, st.orders[0].id, T0 + 10 * 60000, seeded(12)).ok);
});

console.log('저장 · 불러오기');
function memStore() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; }
test('저장 → 불러오기 하면 판·동전·별·주문·도감·설정이 그대로', () => {
  const ls = memStore(); const ad = S.localAdapter(ls);
  const st = C.newState(T0, seeded(4));
  st.board[3] = item('d', 6); st.coins = 77; st.stars = 5; st.starsEarned = 9; st.found.d6 = true; st.settings.sfx = false;
  assert.ok(S.save(ad, st));
  const back = S.load(ad, T0 + 1000, seeded(5));
  assert.deepStrictEqual(back.board, st.board);
  assert.strictEqual(back.coins, 77); assert.strictEqual(back.stars, 5); assert.strictEqual(back.starsEarned, 9);
  assert.deepStrictEqual(back.orders, st.orders);
  assert.strictEqual(back.found.d6, true); assert.strictEqual(back.settings.sfx, false);
  assert.ok(ls.m[D.SAVE_KEY].indexOf('"v":2') >= 0);
});
test('저장이 없거나 깨졌거나 저장소가 막혀도 새 판으로 시작', () => {
  const ls = memStore(); const ad = S.localAdapter(ls);
  assert.strictEqual(S.load(ad, T0, seeded(1)).orders.length, 3);
  ls.setItem(D.SAVE_KEY, '{망가진');
  assert.strictEqual(S.load(ad, T0, seeded(1)).board.length, 63);
  ls.setItem(D.SAVE_KEY, JSON.stringify({ v: 1, board: [1, 2] }));
  assert.strictEqual(S.load(ad, T0, seeded(1)).board.length, 63);
  const blocked = { getItem() { throw new Error('막힘'); }, setItem() { throw new Error('막힘'); } };
  const bad = S.localAdapter(blocked);
  assert.strictEqual(S.load(bad, T0, seeded(1)).board.length, 63);
  assert.strictEqual(S.save(bad, C.newState(T0)), false);
  assert.strictEqual(S.load(S.localAdapter(null), T0).orders.length, 3);
});
test('이상한 칸·없는 체인 주문은 걸러내고, 빠진 필드는 채워요', () => {
  const st = C.newState(T0, seeded(6));
  st.board[0] = { k: 'item', c: 'z', t: 1 }; st.board[1] = { k: 'item', c: 'a', t: 99 };
  st.orders[0].need = [{ c: 'q', t: 1 }];
  delete st.settings.hint; delete st.bag;
  const back = C.deserialize(JSON.stringify(st), T0, seeded(7));
  assert.strictEqual(back.board[0], null); assert.strictEqual(back.board[1], null);
  assert.strictEqual(back.orders.length, 3);
  assert.ok(back.orders.every((o) => o.need.every((x) => D.CHAINS[x.c])));
  assert.strictEqual(back.settings.hint, true); assert.deepStrictEqual(back.bag, new Array(D.BAL.bagStart).fill(null));
});
test('1초 묶음 저장기: 여러 번 불러도 한 번 저장 · flush 는 바로', () => {
  const ls = memStore(); const ad = S.localAdapter(ls);
  let st = C.newState(T0, seeded(1));
  const timers = []; const T = { set: (f) => { timers.push(f); return timers.length; }, clear: () => {} };
  const sv = S.Saver(ad, () => st, 1000, T);
  sv.schedule(); sv.schedule(); sv.schedule();
  assert.strictEqual(timers.length, 1); assert.strictEqual(ls.m[D.SAVE_KEY], undefined);
  st.coins = 3; timers[0]();
  assert.strictEqual(JSON.parse(ls.m[D.SAVE_KEY]).coins, 3);
  st.coins = 4; sv.schedule(); sv.flush();
  assert.strictEqual(JSON.parse(ls.m[D.SAVE_KEY]).coins, 4);
});

console.log('한 판 흐름');
test('발생기만으로 주문 하나를 끝까지 (뽑기 → 합치기 → 건네기)', () => {
  const rng = seeded(42);
  const st = C.newState(T0, rng);
  st.board = st.board.map((c) => (c && c.k === 'gen' ? c : null));
  const o = st.orders.find((x) => x.need[0].t === Math.min(...st.orders.map((y) => y.need[0].t)));
  const need = o.need[0];
  const genAt = st.board.findIndex((c) => c && c.k === 'gen' && D.GENS[c.g].chain === need.c);
  let now = T0;
  for (let guard = 0; guard < 300 && !C.orderStatus(st, o).ready; guard++) {
    const p = C.findPair(st);
    if (p && st.board[p[0]].c === need.c && st.board[p[0]].t < need.t) { C.move(st, p[0], p[1], now); continue; }
    const r = C.tapGen(st, genAt, now, () => 0.5);
    assert.ok(r.ok, '뽑기 ' + r.reason);
    now += 1000;
  }
  const before = st.energy;
  assert.ok(C.deliver(st, o.id, now, rng).ok);
  assert.ok(before < 100 && st.coins === o.coins && st.stars === o.stars);
});

console.log('2단계 · 데이터');
test('지역 데이터: 작업 별 합계(15 · 28 · 40) · 장면·인물·발생기가 다 있음', () => {
  const sums = D.AREAS.map((a) => a.tasks.reduce((s, t) => s + t.cost, 0));
  assert.deepStrictEqual(sums.slice(0, 3), [15, 28, 40]);
  const ids = {};
  D.AREAS.forEach((a) => {
    a.tasks.forEach((t) => { assert.ok(!ids[t.id], '작업 id 겹침 ' + t.id); ids[t.id] = 1; if (t.scene) assert.ok(D.STORY[t.scene], '장면 ' + t.scene); });
    [a.open.scene, a.done.scene].forEach((s) => { if (s) assert.ok(D.STORY[s], '장면 ' + s); });
    (a.open.gens || []).forEach((g) => assert.ok(D.GENS[g]));
    a.chains.forEach((c) => assert.ok(D.CHAINS[c] && !D.CHAINS[c].aux));
  });
  Object.keys(D.STORY).forEach((k) => D.STORY[k].forEach((l) => assert.ok(D.VILLAGERS[l.who], k + ' 인물 ' + l.who)));
  Object.keys(D.GENS).forEach((g) => assert.ok(D.CHAINS[D.GENS[g].chain]));
});

console.log('2단계 · 복원 작업');
test('작업은 별을 써서 순서대로 · 별 모자라면 안 됨', () => {
  const st = emptyState(seeded(3));
  const a = D.AREAS[0];
  let info = C.areaInfo(st);
  assert.strictEqual(info.next.id, a.tasks[0].id); assert.strictEqual(info.canAfford, false); assert.strictEqual(info.doneN, 0);
  assert.strictEqual(C.doTask(st, a.tasks[0].id, T0).reason, 'stars');
  st.stars = 10;
  assert.strictEqual(C.doTask(st, a.tasks[1].id, T0).reason, 'order', '앞 작업 먼저');
  const r = C.doTask(st, a.tasks[0].id, T0);
  assert.ok(r.ok); assert.strictEqual(st.stars, 10 - a.tasks[0].cost); assert.strictEqual(r.areaDone, false);
  assert.strictEqual(C.doTask(st, a.tasks[0].id, T0).reason, 'done');
  info = C.areaInfo(st);
  assert.strictEqual(info.doneN, 1); assert.strictEqual(info.next.id, a.tasks[1].id); assert.ok(info.canAfford);
});
test('1지역을 다 고치면: 모래더미 걷힘 · 2지역 열림 · 통발 발생기 · 체인 E · 새 주문에 E', () => {
  const st = C.newState(T0, seeded(11));
  assert.ok(st.cover.some((v) => v > 0), '처음엔 모래더미');
  st.stars = 15;
  let last;
  D.AREAS[0].tasks.forEach((t) => { last = C.doTask(st, t.id, T0, seeded(1)); assert.ok(last.ok, t.id); });
  assert.strictEqual(st.stars, 0);
  assert.ok(last.areaDone); assert.strictEqual(last.doneArea.id, 'r1'); assert.strictEqual(last.nextArea.id, 'r2');
  assert.ok(st.cover.every((v) => v === 0)); assert.ok(last.uncovered.length > 0);
  assert.strictEqual(st.area, 1); assert.ok(st.unlocked.indexOf('e') >= 0);
  assert.ok(st.board.some((c) => c && c.k === 'gen' && c.g === 'gen_e'), '통발이 판에');
  st.orders = [];
  let sawE = false;
  for (let i = 0; i < 40; i++) { const o = C.makeOrder(st, T0, seeded(300 + i)); if (o.need.some((x) => x.c === 'e')) sawE = true; o.need.forEach((x) => assert.ok(x.t >= 3 && x.t <= 5)); }
  assert.ok(sawE);
});
test('판이 꽉 차 있으면 새 발생기는 선물함으로 · 3지역 끝나면 더 고칠 곳 없음', () => {
  const st = emptyState(seeded(2));
  st.board = st.board.map(() => ({ k: 'item', c: 'a', t: 1 }));
  st.stars = 999;
  D.AREAS[0].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.deepStrictEqual(st.gifts, [{ k: 'gen', g: 'gen_e' }]);
  D.AREAS[1].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.strictEqual(st.gifts.length, 3); assert.ok(st.unlocked.indexOf('c') >= 0 && st.unlocked.indexOf('f') >= 0);
  D.AREAS[2].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.strictEqual(st.area, 3); assert.strictEqual(st.stars, 999 - 83);
  const info = C.areaInfo(st);
  assert.ok(info.finished); assert.strictEqual(info.next, null); assert.strictEqual(info.show.id, 'r3');
  assert.strictEqual(C.doTask(st, 'r3_bell', T0).reason, 'nomore');
  st.board[0] = null;
  assert.ok(C.takeGift(st, 0, T0, seeded(1)).ok); assert.strictEqual(st.board[0].k, 'gen');
});

console.log('2단계 · 모래더미');
test('새 판: 위 3줄이 모래더미(2·2·1겹) · 빈칸 찾기·옮기기에서 빠짐', () => {
  const st = C.newState(T0, seeded(1));
  assert.strictEqual(st.cover[0], 2); assert.strictEqual(st.cover[7], 2); assert.strictEqual(st.cover[14], 1); assert.strictEqual(st.cover[21], 0);
  for (let i = 0; i < 30; i++) { const at = C.nearestEmpty(st, 0, seeded(i)); assert.ok(at >= 21); }
  st.board[21] = item('a', 1);
  assert.strictEqual(C.move(st, 21, 14, T0).kind, 'none');
});
test('옆에서 합치면 한 겹씩 벗겨져요 (위·아래·왼·오른)', () => {
  const st = emptyState();
  st.cover[14] = 1; st.cover[20] = 2; st.cover[22] = 2;
  st.board[28] = item('a', 1); st.board[21] = item('a', 1);
  const r = C.move(st, 28, 21, T0);
  assert.strictEqual(r.kind, 'merge');
  assert.deepStrictEqual(r.peeled.map((p) => p.i).sort((x, y) => x - y), [14, 22]);
  assert.strictEqual(st.cover[14], 0); assert.strictEqual(st.cover[22], 1); assert.strictEqual(st.cover[20], 2, '옆이 아닌 칸은 그대로');
});

console.log('3단계 · 가방 · 팔기 · 되돌리기 · 보조 물건');
test('가방: 넣기·꺼내기 · 가득 차면 안 됨 · 동전으로 늘리기(50 → ×1.4)', () => {
  const st = emptyState();
  for (let i = 0; i < 7; i++) st.board[i] = item('b', 2);
  for (let i = 0; i < 6; i++) assert.ok(C.toBag(st, i, T0).ok);
  assert.strictEqual(C.toBag(st, 6, T0).reason, 'full');
  assert.strictEqual(C.bagPrice(st), 50);
  assert.strictEqual(C.growBag(st, T0).reason, 'coins');
  st.coins = 200;
  assert.ok(C.growBag(st, T0).ok); assert.strictEqual(st.coins, 150); assert.strictEqual(C.bagPrice(st), 70);
  assert.ok(C.toBag(st, 6, T0).ok);
  const r = C.fromBag(st, 0, T0, seeded(1), 40);
  assert.ok(r.ok); assert.strictEqual(r.at, 40); assert.strictEqual(st.bag[0], null);
});
test('가방 속 물건도 주문에 쓰여요', () => {
  const st = emptyState();
  const o = { id: 'x', who: 'mina', need: [{ c: 'b', t: 3 }, { c: 'b', t: 3 }], coins: 12, stars: 2, at: T0 };
  st.orders = [o];
  st.board[5] = item('b', 3); st.bag[2] = item('b', 3);
  const s = C.orderStatus(st, o);
  assert.ok(s.ready); assert.deepStrictEqual(s.cells, [5, -1]); assert.deepStrictEqual(s.bag, [-1, 2]);
  assert.ok(C.deliver(st, 'x', T0, seeded(1)).ok);
  assert.strictEqual(st.board[5], null); assert.strictEqual(st.bag[2], null);
});
test('팔기: 2^(단계-1) 동전 · 발생기는 못 팔고 · 최고 단계는 물어봄 · 되돌리기', () => {
  const st = emptyState();
  st.board[0] = item('d', 4); st.board[1] = { k: 'gen', g: 'gen_a' };
  const snap = C.snapshot(st);
  const r = C.sell(st, 0, T0);
  assert.ok(r.ok); assert.strictEqual(r.coins, 8); assert.strictEqual(st.coins, 8); assert.strictEqual(st.board[0], null);
  assert.strictEqual(C.sell(st, 1, T0).reason, 'gen');
  assert.ok(C.sellAsk(item('d', 8))); assert.ok(!C.sellAsk(item('d', 7))); assert.ok(C.sellAsk({ k: 'wild' }));
  assert.ok(C.restore(st, snap));
  assert.deepStrictEqual(st.board[0], item('d', 4)); assert.strictEqual(st.coins, 0);
});
test('되돌리기: 합치기도 원래대로 (모래더미 포함)', () => {
  const st = emptyState();
  st.cover[2] = 1; st.board[0] = item('a', 1); st.board[1] = item('a', 1);
  const snap = C.snapshot(st);
  C.move(st, 0, 1, T0);
  assert.strictEqual(st.cover[2], 0);
  C.restore(st, snap);
  assert.deepStrictEqual(st.board[0], item('a', 1)); assert.strictEqual(st.cover[2], 1);
});
test('식혜(최대 넘겨 채움) · 엽전 · 소라별 · 보자기(물건 여러 개)', () => {
  const st = emptyState(); st.energy = 100;
  st.board[0] = item('en', 2);
  assert.ok(C.useItem(st, 0, T0, seeded(1)).ok); assert.strictEqual(st.energy, 115);
  st.board[0] = item('cn', 3); C.useItem(st, 0, T0, seeded(1)); assert.strictEqual(st.coins, 80);
  st.board[0] = item('ss', 2); C.useItem(st, 0, T0, seeded(1)); assert.strictEqual(st.gems, 5);
  st.board[30] = item('bj', 2);
  const r = C.useItem(st, 30, T0, seeded(4));
  assert.ok(r.ok); assert.strictEqual(r.placed.length, 5);
  r.placed.forEach((p) => { assert.ok(p.at >= 0); assert.ok(['a', 'b', 'd'].indexOf(st.board[p.at].c) >= 0); assert.ok(st.board[p.at].t <= 2); });
  assert.strictEqual(C.useItem(st, r.placed[0].at, T0, seeded(1)).reason, 'notaux');
  assert.ok(C.canMerge(item('en', 1), item('en', 1)), '보조 물건도 합쳐져요');
});
test('주문 덤: 15% 쯤 붙고, 건네면 판(없으면 선물함)에 들어와요', () => {
  const st = emptyState();
  let withBonus = 0;
  for (let i = 0; i < 400; i++) if (C.makeOrder(st, T0, seeded(900 + i)).bonus) withBonus++;
  assert.ok(withBonus > 30 && withBonus < 100, '덤 ' + withBonus);
  const o = { id: 'x', who: 'juni', need: [{ c: 'a', t: 2 }], coins: 3, stars: 1, at: T0, bonus: { k: 'item', c: 'en', t: 1 } };
  st.orders = [o]; st.board[10] = item('a', 2);
  const r = C.deliver(st, 'x', T0, seeded(1));
  assert.ok(r.bonus && r.bonus.at >= 0); assert.deepStrictEqual(st.board[r.bonus.at], item('en', 1));
});
test('충전식 발생기(찻잎 선반): 12번 뒤 10분 쉼', () => {
  const st = emptyState(); st.settings.easy = true;
  st.board[30] = { k: 'gen', g: 'gen_c' };
  for (let i = 0; i < 12; i++) assert.ok(C.tapGen(st, 30, T0, seeded(i)).ok, '톡 ' + i);
  const r = C.tapGen(st, 30, T0 + 1000, seeded(1));
  assert.strictEqual(r.reason, 'rest'); assert.strictEqual(r.waitMs, 10 * 60000 - 1000);
  assert.strictEqual(C.chargeInfo(st, 'gen_c', T0 + 1000).left, 0);
  assert.ok(C.tapGen(st, 30, T0 + 10 * 60000, seeded(1)).ok);
  assert.strictEqual(C.chargeInfo(st, 'gen_c', T0 + 10 * 60000).left, 11);
});
test('처음 발견하면 소라별 1 · 소라별 가게', () => {
  const st = emptyState();
  st.board[0] = item('a', 1); st.board[1] = item('a', 1);
  C.move(st, 0, 1, T0); assert.strictEqual(st.gems, 1);
  assert.strictEqual(C.buyShop(st, 'wild', T0, seeded(1)).reason, 'gems');
  st.gems = 6;
  const r = C.buyShop(st, 'wild', T0, seeded(1));
  assert.ok(r.ok); assert.strictEqual(st.gems, 0); assert.deepStrictEqual(st.board[r.at], { k: 'wild' });
});

console.log('2단계 · 저장 변환 · 서버');
test('v1 저장 → v2: 판·동전·별 그대로 · 복원/가방/모래더미 칸 추가 (모래더미는 안 덮음)', () => {
  const v1 = C.newState(T0, seeded(5));
  ['cover', 'gems', 'gifts', 'charge'].forEach((k) => delete v1[k]);
  v1.v = 1; v1.bag = []; v1.coins = 33; v1.stars = 7; v1.starsEarned = 20; v1.board[3] = item('b', 5);
  delete v1.stats.sold;
  const ls = memStore(); ls.setItem(D.SAVE_KEY, JSON.stringify(v1));
  const st = S.load(S.localAdapter(ls), T0 + 5000, seeded(1));
  assert.strictEqual(st.v, 2);
  assert.strictEqual(st.coins, 33); assert.strictEqual(st.stars, 7); assert.deepStrictEqual(st.board[3], item('b', 5));
  assert.strictEqual(st.area, 0); assert.deepStrictEqual(st.tasks, {}); assert.strictEqual(st.gems, 0);
  assert.strictEqual(st.bag.length, D.BAL.bagStart); assert.ok(st.cover.every((v) => v === 0)); assert.deepStrictEqual(st.gifts, []);
  assert.strictEqual(st.stats.sold, 0); assert.strictEqual(st.orders.length, 3);
  assert.ok(C.doTask(st, 'r1_gate', T0).ok, '옛 저장으로도 바로 복원 시작');
});
test('v2 저장 → 불러오기: 작업·지역·가방·모래더미·선물함 그대로', () => {
  const st = C.newState(T0, seeded(5));
  st.stars = 3; C.doTask(st, 'r1_gate', T0); st.bag[1] = item('d', 3); st.gifts.push({ k: 'wild' }); st.cover[0] = 1;
  const back = C.deserialize(C.serialize(st), T0 + 1, seeded(2));
  assert.deepStrictEqual(back.tasks, st.tasks); assert.deepStrictEqual(back.bag, st.bag); assert.deepStrictEqual(back.gifts, st.gifts);
  assert.strictEqual(back.cover[0], 1); assert.strictEqual(back.stars, 2);
});
test('기기 ↔ 서버 고르기: 새것 · 이 폰이 처음이면 서버 · 진행이 엇갈리면 물어봄', () => {
  const a = C.newState(T0, seeded(1)), b = C.newState(T0, seeded(1));
  assert.strictEqual(S.pickSave(a, null), 'local');
  assert.strictEqual(S.pickSave(a, b, true), 'remote');
  b.updatedAt = T0 - 1; assert.strictEqual(S.pickSave(a, b), 'local');
  b.updatedAt = T0 + 9; b.stats.delivered = 4; assert.strictEqual(S.pickSave(a, b), 'remote');
  a.stats.delivered = 9; assert.strictEqual(S.pickSave(a, b), 'ask');
});
test('이어하기 코드: 처음 한 번 만들고 그대로 · 보기 좋게 · 지우개', () => {
  const ad = S.localAdapter(memStore());
  const i1 = S.syncInfo(ad, seeded(3)), i2 = S.syncInfo(ad, seeded(4));
  assert.ok(S.ID_RE.test(i1.id)); assert.strictEqual(i1.id, i2.id);
  assert.strictEqual(S.prettyId('abcdefghjkmn'), 'abcd-efgh-jkmn');
  assert.strictEqual(S.cleanId(' ABCD-efgh jkmn '), 'abcdefghjkmn');
});

console.log(`\n모두 통과 (${n}개)`);
