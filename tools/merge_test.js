// 머지관 「소라섬 등불 이야기」 규칙 시험:  node tools/merge_test.js
// 합치기 규칙 · 발생기/에너지 회복 · 주문 완료 · 저장/불러오기
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
test('별 15개를 모으면 다음 난이도(1~2개 · 3~5단계)', () => {
  const st = emptyState(seeded(5));
  assert.strictEqual(C.orderLevel(st), 0);
  st.starsEarned = 15;
  assert.strictEqual(C.orderLevel(st), 1);
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
  assert.ok(ls.m[D.SAVE_KEY].indexOf('"v":1') >= 0);
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
  assert.strictEqual(back.settings.hint, true); assert.deepStrictEqual(back.bag, []);
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

console.log(`\n모두 통과 (${n}개)`);
