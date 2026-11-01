// 머지관 「소라섬 등불 이야기」 규칙 시험:  node tools/merge_test.js
// 합치기 규칙 · 발생기/에너지 회복 · 주문 완료 · 저장/불러오기 · 복원 작업·지역 1~6·엔딩 · 모래더미 · 가방·팔기·되돌리기 · v1→v2 변환
// · 얼굴 그림·고맙다는 말 · 이야기 부탁 · 발생기 강화 · 숨은 비밀 · 7일 출석·오늘의 부탁 · 주간 이벤트 · 도감
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
// 이야기 부탁을 다 건넨 것으로 (복원 작업만 시험할 때)
function soAll(st) { Object.keys(D.STORY_ORDERS).forEach((k) => { st.sos[k] = T0; }); st.orders = st.orders.filter((o) => !o.story); return st; }
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
test('지역 데이터: 작업 별 합계(15·28·40·45·63·100 = 291) · 장면·인물·발생기가 다 있음', () => {
  const sums = D.AREAS.map((a) => a.tasks.reduce((s, t) => s + t.cost, 0));
  assert.deepStrictEqual(sums, [15, 28, 40, 45, 63, 100]);
  assert.strictEqual(sums.reduce((a, b) => a + b, 0), 291);
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
  const st = soAll(C.newState(T0, seeded(11)));
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
test('판이 꽉 차 있으면 새 발생기는 선물함으로 · 6지역(등대곶) 끝나면 엔딩 · 더 고칠 곳 없음', () => {
  const st = soAll(emptyState(seeded(2)));
  st.board = st.board.map(() => ({ k: 'item', c: 'a', t: 1 }));
  st.stars = 999;
  D.AREAS[0].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.deepStrictEqual(st.gifts, [{ k: 'gen', g: 'gen_e' }]);
  D.AREAS[1].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.strictEqual(st.gifts.length, 3); assert.ok(st.unlocked.indexOf('c') >= 0 && st.unlocked.indexOf('f') >= 0);
  D.AREAS[2].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.strictEqual(st.area, 3); assert.strictEqual(st.stars, 999 - 83);
  assert.ok(st.unlocked.indexOf('g') >= 0, '4지역: 체인 G'); assert.strictEqual(st.gifts[3].g, 'gen_g');
  D.AREAS[3].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.ok(st.unlocked.indexOf('h') >= 0, '5지역: 체인 H'); assert.strictEqual(st.gifts[4].g, 'gen_h');
  D.AREAS[4].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  let last;
  D.AREAS[5].tasks.forEach((t) => { last = C.doTask(st, t.id, T0, seeded(1)); assert.ok(last.ok, t.id); });
  assert.ok(last.areaDone); assert.strictEqual(last.ending, 'ending'); assert.ok(D.STORY.ending);
  assert.strictEqual(st.area, 6); assert.strictEqual(st.stars, 999 - 291);
  const info = C.areaInfo(st);
  assert.ok(info.finished); assert.strictEqual(info.next, null); assert.strictEqual(info.show.id, 'r6');
  assert.strictEqual(C.doTask(st, 'r6_light', T0).reason, 'nomore');
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

console.log('4단계 · 얼굴 그림 · 고맙다는 말');
const fs = require('fs');
const IMG = path.join(__dirname, '..', 'static', 'img', 'merge');
test('마을 사람 얼굴(기본+기쁨) 그림 파일이 다 있고, 부탁하는 사람은 고맙다는 말이 여러 개', () => {
  Object.keys(D.VILLAGERS).forEach((k) => {
    const v = D.VILLAGERS[k];
    if (!v.art || v.letter) return;
    const file = (id) => path.join(IMG, 'chars', id.replace(/^char_/, '') + '.webp');
    assert.ok(fs.existsSync(file(v.art)), '얼굴 ' + v.art);
    assert.ok(v.faces && v.faces.joy && fs.existsSync(file(v.faces.joy)), '기쁨 얼굴 ' + k);
    if (v.chains.length) assert.ok(v.thanks && v.thanks.length >= 3, '고맙다는 말 ' + k);
  });
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach((c) => assert.ok(Object.keys(D.VILLAGERS).some((k) => D.VILLAGERS[k].chains.indexOf(c) >= 0), '체인 ' + c + ' 부탁하는 사람'));
  assert.ok(D.VILLAGERS.kkotnim.thanks.indexOf('아이고, 고맙구나!') >= 0 && D.VILLAGERS.juni.thanks.indexOf('우와, 최고예요!') >= 0);
});
test('고맙다는 말은 사람마다 돌려 가며 (저장해도 이어짐)', () => {
  const st = emptyState();
  const L = D.VILLAGERS.mina.thanks;
  const got = L.map(() => C.thanksLine(st, 'mina'));
  assert.deepStrictEqual(got, L);
  assert.strictEqual(C.thanksLine(st, 'mina'), L[0]);
  assert.strictEqual(C.thanksLine(st, 'juni'), D.VILLAGERS.juni.thanks[0]);
  const back = C.deserialize(C.serialize(st), T0, seeded(1));
  assert.strictEqual(C.thanksLine(back, 'mina'), L[1]);
});
test('지역 1~6 전/후 배경 · 시작/엔딩 그림 · 이벤트 그림이 있어요', () => {
  D.AREAS.forEach((a) => ['before', 'after'].forEach((k) => assert.ok(fs.existsSync(path.join(IMG, 'bg', a.bg[k] + '.webp')), a.bg[k])));
  ['story_start', 'story_ending'].forEach((id) => assert.ok(fs.existsSync(path.join(IMG, 'bg', id + '.webp')), id));
  D.EVENTS.forEach((e) => {
    [1, 2, 3, 4, 5].forEach((t) => assert.ok(fs.existsSync(path.join(IMG, 'events', e.chain + t + '.webp')), e.chain + t));
    [e.banner, e.deco, e.id + '_gen'].forEach((id) => assert.ok(fs.existsSync(path.join(IMG, 'events', id + '.webp')), id));
  });
});

console.log('4단계 · 지역 4~6 · 작업 자리');
test('작업·비밀 자리는 그림 안(0~100%), 마을 화면에 보이는 세로 구간 안 · 작업 자리끼리 겹치지 않음', () => {
  D.AREAS.forEach((a) => {
    const y0 = a.view[0] * 100, y1 = a.view[1] * 100;
    const pts = a.tasks.map((t) => [t.x, t.y, t.id]);
    a.tasks.forEach((t) => { assert.ok(t.x >= 3 && t.x <= 97 && t.y >= y0 + 2 && t.y <= y1 - 1, '작업 자리 ' + t.id); assert.ok(t.r >= 10 && t.r <= 30); });
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], (pts[i][1] - pts[j][1]) * 1.77);   // 세로 % → 가로 % 비율 (720×1274)
      assert.ok(d >= 9, '너무 가까움 ' + pts[i][2] + ' ' + pts[j][2]);
    }
    const s = a.secrets;
    s.letters.forEach((l) => { assert.ok(l.y >= y0 && l.y <= y1, '편지 자리 ' + l.id); if (l.after) assert.ok(a.tasks.some((t) => t.id === l.after)); });
    s.gulls.concat(s.bottle).forEach((g) => assert.ok(g[0] >= 2 && g[0] <= 98 && g[1] >= y0 && g[1] <= y1, a.id + ' 비밀 자리 ' + g));
  });
  assert.strictEqual(C.LETTER_TOTAL, 12); assert.strictEqual(C.GULL_TOTAL, 18);
  assert.strictEqual(D.AREAS.reduce((s, a) => s + a.secrets.letters.length, 0), 12);
});
test('지역 4~6: 주문 난이도(2개·4~7 → 2~3개·5~8 → 2~3개·6~9) · 체인 G·H', () => {
  const st = soAll(emptyState(seeded(4)));
  st.unlocked = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  [[3, [2, 2], [4, 7]], [4, [2, 3], [5, 8]], [5, [2, 3], [6, 9]]].forEach(([area, items, tiers]) => {
    st.area = area; st.orders = [];
    for (let i = 0; i < 30; i++) {
      const o = C.makeOrder(st, T0, seeded(700 + i));
      assert.ok(o.need.length >= items[0] && o.need.length <= items[1]);
      o.need.forEach((x) => assert.ok(x.t >= Math.min(tiers[0], C.maxTier(x.c)) && x.t <= tiers[1]));
    }
  });
});

console.log('4단계 · 이야기 부탁');
test('이야기 부탁: 앞 작업 뒤에 금색 카드로 · 건네야 다음 작업 · [다른 부탁] 안 됨', () => {
  const st = emptyState(seeded(6));
  st.stars = 50;
  ['r1_gate', 'r1_paper'].forEach((id) => assert.ok(C.doTask(st, id, T0).ok));
  assert.ok(!st.orders.some((o) => o.story), '아직 없음');
  assert.ok(C.doTask(st, 'r1_sign', T0).ok);
  const so = st.orders[0];
  assert.strictEqual(so.story, 'so_r1'); assert.strictEqual(so.who, 'mina'); assert.deepStrictEqual(so.need, [{ c: 'b', t: 4 }]);
  assert.strictEqual(st.orders.filter((o) => !o.story).length, 3, '일반 부탁은 그대로 3장');
  assert.strictEqual(C.skipOrder(st, so.id, T0 + 1e9, seeded(1)).reason, 'story');
  const info = C.areaInfo(st);
  assert.strictEqual(info.reqPending, 'so_r1'); assert.strictEqual(info.canAfford, false);
  assert.strictEqual(C.doTask(st, 'r1_maru', T0).reason, 'req');
  st.board[10] = item('b', 4);
  const r = C.deliver(st, so.id, T0, seeded(1));
  assert.ok(r.ok); assert.strictEqual(r.story, 'so_r1'); assert.strictEqual(r.stars, 2); assert.ok(st.sos.so_r1);
  assert.ok(!st.orders.some((o) => o.story)); assert.ok(D.STORY.so_r1);
  assert.ok(C.doTask(st, 'r1_maru', T0).ok);
});
test('이야기 부탁 데이터: 지역·앞 작업·막는 작업·인물·장면이 다 맞아요 · 저장해도 그대로', () => {
  Object.keys(D.STORY_ORDERS).forEach((id) => {
    const so = D.STORY_ORDERS[id];
    const a = D.AREAS[so.area];
    const ai = a.tasks.findIndex((t) => t.id === so.after), bi = a.tasks.findIndex((t) => t.req === id);
    assert.ok(ai >= 0 && bi > ai, id + ' 순서');
    assert.ok(D.VILLAGERS[so.who] && D.STORY[so.scene]);
    so.need.forEach((n) => assert.ok(n.t <= C.maxTier(n.c)));
  });
  const st = emptyState(seeded(7)); st.stars = 9;
  ['r1_gate', 'r1_paper', 'r1_sign'].forEach((id) => C.doTask(st, id, T0));
  const back = C.deserialize(C.serialize(st), T0 + 5, seeded(2));
  assert.strictEqual(back.orders.filter((o) => o.story === 'so_r1').length, 1);
});

console.log('3단계 · 발생기 강화');
test('발생기 강화: 동전 80 → 240 → 600 · 2단계 확률 10→20→30% · 마지막은 가끔 3단계', () => {
  const st = emptyState(); st.coins = 2000;
  assert.deepStrictEqual([C.genUpInfo(st, 'gen_a').lv, C.genUpInfo(st, 'gen_a').price], [0, 80]);
  [80, 240, 600].forEach((p, k) => { const r = C.upgradeGen(st, 'gen_a', T0); assert.ok(r.ok); assert.strictEqual(r.price, p); assert.strictEqual(r.lv, k + 1); });
  assert.strictEqual(st.coins, 2000 - 920);
  assert.strictEqual(C.upgradeGen(st, 'gen_a', T0).reason, 'max');
  assert.strictEqual(C.upgradeGen(st, 'gen_kite', T0).reason, 'event');
  st.coins = 10; assert.strictEqual(C.upgradeGen(st, 'gen_b', T0).reason, 'coins');
  const count = (lv) => {
    const s2 = emptyState(); s2.settings.easy = true; s2.genLv.gen_d = lv;
    const rng = seeded(99); const c = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < 2000; i++) { s2.board = s2.board.map(() => null); s2.board[30] = { k: 'gen', g: 'gen_d' }; c[C.tapGen(s2, 30, T0, rng).cell.t]++; }
    return c;
  };
  const c0 = count(0), c2 = count(2), c3 = count(3);
  assert.ok(c0[2] > 120 && c0[2] < 290 && c0[3] === 0);
  assert.ok(c2[2] > 500 && c2[2] < 700 && c2[3] === 0);
  assert.ok(c3[3] > 100 && c3[3] < 230 && c3[2] > 480);
});

console.log('4단계 · 숨은 비밀');
test('편지 조각: 지역을 열면 보이고, 작업 뒤에 나오는 것도 있어요 · 찾으면 소라별 1', () => {
  const st = emptyState(); st.sec.bottleDay = C.dayKey(T0);
  let s = C.secretsIn(st, 0, T0);
  assert.deepStrictEqual(s.filter((x) => x.kind === 'letter').map((x) => x.id), ['l1']);
  assert.strictEqual(s.filter((x) => x.kind === 'gull').length, 3);
  assert.deepStrictEqual(C.secretsIn(st, 1, T0), [], '아직 안 연 지역');
  const g0 = st.gems;
  const r = C.findSecret(st, 'letter', 'l1', T0);
  assert.ok(r.ok); assert.strictEqual(r.text, D.LETTERS.l1); assert.strictEqual(st.gems, g0 + 1); assert.strictEqual(r.count, 1);
  assert.strictEqual(C.findSecret(st, 'letter', 'l1', T0).reason, 'gone');
  assert.strictEqual(C.findSecret(st, 'letter', 'l2', T0).reason, 'gone', '대청마루 뒤에');
  st.tasks.r1_maru = T0;
  assert.ok(C.findSecret(st, 'letter', 'l2', T0).ok);
});
test('갈매기 18마리: 하나에 동전 20 · 다 찾으면 「섬 탐정」 + 동전 200 · 앨범은 편지 12장 + 엔딩', () => {
  const st = emptyState(); st.area = 6; st.sec.bottleDay = C.dayKey(T0);
  st.coins = 0;
  let last;
  D.AREAS.forEach((a, i) => C.secretsIn(st, i, T0).filter((x) => x.kind === 'gull').forEach((x) => { last = C.findSecret(st, 'gull', x.id, T0); }));
  assert.strictEqual(last.title, '섬 탐정'); assert.strictEqual(st.sec.title, '섬 탐정');
  assert.strictEqual(st.coins, 18 * 20 + 200);
  Object.keys(D.LETTERS).forEach((id) => { st.sec.letters[id] = T0; });
  assert.strictEqual(C.secretCounts(st).album, false);
  st.seen.ending = true;
  assert.strictEqual(C.secretCounts(st).album, true);
});
test('병 속 편지: 하루 한 번 연 지역 바닷가에 · 소라별 2 + 작은 보자기', () => {
  const st = emptyState();
  const b = C.bottleToday(st, T0);
  assert.ok(b && b.area === 0);
  const s = C.secretsIn(st, 0, T0).find((x) => x.kind === 'bottle');
  assert.ok(s);
  const g0 = st.gems;
  const r = C.findSecret(st, 'bottle', 'bottle', T0, seeded(1));
  assert.ok(r.ok && r.note); assert.strictEqual(st.gems, g0 + 2); assert.deepStrictEqual(st.board[r.gift.at], item('bj', 1));
  assert.strictEqual(C.bottleToday(st, T0 + 3600e3), null, '같은 날은 한 번');
  assert.ok(C.bottleToday(st, T0 + 864e5), '다음 날 또');
});

console.log('5단계 · 매일');
test('7일 출석: 하루 한 번 · 이어서 안 와도 쌓여요 · 7일째 큰 보자기 + 몽돌 모자 · 다시 1일', () => {
  const st = emptyState(); st.coins = 0;
  C.dailyTouch(st, T0);
  assert.ok(C.attendInfo(st, T0).can);
  let r = C.claimAttend(st, T0, seeded(1));
  assert.ok(r.ok); assert.strictEqual(r.day, 1); assert.deepStrictEqual(st.board[r.placed[0].at], item('en', 2));
  assert.strictEqual(C.claimAttend(st, T0 + 1000, seeded(1)).reason, 'done');
  r = C.claimAttend(st, T0 + 5 * 864e5, seeded(1));   // 며칠 건너뛰어도 2일째
  assert.strictEqual(r.day, 2); assert.strictEqual(st.coins, 50);
  for (let d = 3; d <= 7; d++) { st.board = st.board.map(() => null); r = C.claimAttend(st, T0 + (5 + d) * 864e5, seeded(d)); assert.strictEqual(r.day, d); }
  assert.ok(st.decos.indexOf('mongdol_hat') >= 0);
  assert.strictEqual(C.attendInfo(st, T0 + 20 * 864e5).idx, 0); assert.strictEqual(C.attendInfo(st, T0 + 20 * 864e5).round, 1);
});
test('오늘의 부탁 3개: 날마다 새로 · 다 하면 중간 보자기 (한 번만)', () => {
  const st = emptyState();
  assert.ok(C.dailyTouch(st, T0)); assert.ok(!C.dailyTouch(st, T0 + 1000));
  let qi = C.questInfo(st);
  assert.strictEqual(qi.q.length, 3); assert.ok(!qi.all);
  assert.strictEqual(C.claimQuests(st, T0).reason, 'notyet');
  const q1 = qi.q[0]; st.stats[q1.stat] += q1.n;
  st.daily.del[qi.q[1].c] = 2;
  st.board[0] = item('a', qi.q[2].n - 1); st.board[1] = item('a', qi.q[2].n - 1);
  C.move(st, 0, 1, T0);
  qi = C.questInfo(st);
  assert.ok(qi.q.every((x) => x.done), JSON.stringify(qi.q));
  const r = C.claimQuests(st, T0, seeded(1));
  assert.ok(r.ok); assert.deepStrictEqual(st.board[r.at], item('bj', 2));
  assert.strictEqual(C.claimQuests(st, T0).reason, 'claimed');
  assert.ok(C.dailyTouch(st, T0 + 864e5)); assert.ok(!C.questInfo(st).claimed);
});
test('부탁을 건네면 그 체인 칸이 오늘의 부탁에 세어져요', () => {
  const st = emptyState(); C.dailyTouch(st, T0);
  const o = st.orders[0];
  o.need.forEach((n, k) => { st.board[k] = item(n.c, n.t); });
  C.deliver(st, o.id, T0, seeded(1));
  assert.strictEqual(st.daily.del[o.need[0].c], 1);
});

console.log('5단계 · 주간 이벤트');
test('주간 이벤트: 월요일마다 차례로 (연날리기 ↔ 단오) · 1지역을 다 고친 뒤부터', () => {
  const mon = new Date(2026, 10, 2, 0, 0, 1).getTime();   // 2026-11-02 월요일
  const a = C.currentEvent(mon), b = C.currentEvent(mon + 7 * 864e5), sun = C.currentEvent(mon + 6.9 * 864e5);
  assert.notStrictEqual(a.ev.id, b.ev.id); assert.strictEqual(a.week, sun.week); assert.strictEqual(a.week + 1, b.week);
  assert.strictEqual(new Date(a.start).getDay(), 1);
  const st = emptyState(seeded(3));
  assert.strictEqual(C.eventTick(st, mon, seeded(1)).started, null, '1지역 끝나기 전엔 없음');
  st.area = 1;
  const r = C.eventTick(st, mon, seeded(1));
  assert.ok(r.started); assert.strictEqual(st.ev.id, a.ev.id);
  assert.deepStrictEqual(st.board[r.started.gen.at], { k: 'gen', g: a.ev.gen });
  const eo = st.orders.filter((o) => o.ev);
  assert.strictEqual(eo.length, 1); assert.ok(eo[0].need[0].c === a.ev.chain && eo[0].pts > 0 && eo[0].stars === 0);
  assert.strictEqual(st.orders.filter((o) => !o.ev && !o.story).length, 3, '일반 부탁은 그대로');
  assert.strictEqual(C.eventTick(st, mon + 1000, seeded(1)).started, null, '같은 주에 두 번 안 줘요');
});
test('이벤트 부탁 → 점수 → 보상 길 (마지막 칸 = 장식) · 끝나면 이벤트 물건은 동전으로 · 장식은 그대로', () => {
  const mon = new Date(2026, 10, 2, 9).getTime();
  const st = emptyState(seeded(5)); st.area = 2;
  C.eventTick(st, mon, seeded(1));
  const e = D.EVENTS.find((x) => x.id === st.ev.id);
  let got = 0;
  for (let i = 0; i < 300 && st.ev.got < e.track.length; i++) {
    const o = st.orders.find((x) => x.ev);
    st.board[0] = item(o.need[0].c, o.need[0].t);
    const r = C.deliver(st, o.id, mon, seeded(1000 + i * 7919));
    assert.ok(r.ok); got += (r.evRewards || []).length;
    st.board = st.board.map((c, k) => (k === 0 || (c && c.k === 'gen') ? c : null));
  }
  assert.strictEqual(got, 10); assert.ok(st.decos.indexOf(e.deco) >= 0, '장식');
  assert.ok(C.placeDeco(st, e.deco, 2, 40, 70, mon).ok); assert.deepStrictEqual(st.placed[e.deco], { a: 2, x: 40, y: 70 });
  st.board[5] = item(e.chain, 3); st.bag[0] = item(e.chain, 2);
  const coins = st.coins;
  const r = C.eventTick(st, mon + 7 * 864e5, seeded(2));
  assert.ok(r.ended && r.started); assert.strictEqual(r.ended.coins, 4 + 2); assert.strictEqual(st.coins, coins + 6);
  assert.ok(!st.board.some((c) => c && ((c.k === 'gen' && c.g === e.gen) || (c.k === 'item' && c.c === e.chain))));
  assert.strictEqual(st.bag[0], null);
  assert.notStrictEqual(st.ev.id, e.id); assert.ok(st.decos.indexOf(e.deco) >= 0);
  const back = C.deserialize(C.serialize(st), mon + 7 * 864e5, seeded(1));
  assert.strictEqual(back.ev.id, st.ev.id); assert.deepStrictEqual(back.placed, st.placed);
});
test('이벤트 물건도 합쳐져요 (5단계 끝) · 이벤트 부탁은 [다른 부탁]으로 같은 이벤트 부탁', () => {
  const st = emptyState(); st.area = 1;
  C.eventTick(st, T0, seeded(1));
  const ch = D.EVENTS.find((x) => x.id === st.ev.id).chain;
  assert.strictEqual(C.maxTier(ch), 5);
  st.board[0] = item(ch, 4); st.board[1] = item(ch, 4);
  const m = C.move(st, 0, 1, T0); assert.strictEqual(m.kind, 'merge'); assert.ok(m.max);
  const o = st.orders.find((x) => x.ev);
  const r = C.skipOrder(st, o.id, T0 + 1e9, seeded(4));
  assert.ok(r.ok && r.order.ev === st.ev.id);
});

console.log('4단계 · 도감 · 옛 저장');
test('도감: 체인마다 찾은 단계 수', () => {
  const st = emptyState(); st.found = { a1: true, a2: true, b1: true };
  const col = C.collection(st);
  assert.strictEqual(col.find((x) => x.c === 'a').n, 2); assert.strictEqual(col.find((x) => x.c === 'h').n, 0);
  assert.ok(col.find((x) => x.c === 'kite').event && col.find((x) => x.c === 'en').aux);
});
test('새 칸이 없는 옛 저장(v2)도 그대로 열려요 (강화·비밀·매일·이벤트 기본값)', () => {
  const st = C.newState(T0, seeded(1));
  ['genLv', 'sos', 'sec', 'daily', 'ev', 'evLast', 'decos', 'placed', 'thx'].forEach((k) => delete st[k]);
  const back = C.deserialize(JSON.stringify(st), T0, seeded(2));
  assert.ok(back && back.sec.letters && back.daily.att && Array.isArray(back.decos) && back.ev === null);
  C.dailyTouch(back, T0); assert.ok(C.claimAttend(back, T0, seeded(1)).ok);
  assert.strictEqual(C.secretsIn(back, 0, T0).length > 0, true);
});

test('마을 그림 표시: 끝낸 작업 ✓ 은 그림에 남지 않고 다음 작업 망치 하나만 · 다 고치면 표시 없음', () => {
  const st = soAll(emptyState(seeded(8)));
  st.stars = 99;
  assert.deepStrictEqual(C.mapPins(C.areaInfo(st)).map((x) => x.task.id), ['r1_gate']);
  C.doTask(st, 'r1_gate', T0); C.doTask(st, 'r1_paper', T0);
  const pins = C.mapPins(C.areaInfo(st));
  assert.deepStrictEqual(pins.map((x) => x.task.id), ['r1_sign']);
  assert.ok(pins.every((x) => !x.done));
  D.AREAS[0].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  const past = { tasks: D.AREAS[0].tasks.map((t) => ({ task: t, done: true, next: false })) };
  assert.deepStrictEqual(C.mapPins(past), []);
});
console.log(`\n모두 통과 (${n}개)`);
