// 머지관 「소라섬 등불 이야기」 규칙 시험:  node tools/merge_test.js
// 합치기 규칙 · 발생기/에너지 회복 · 주문 완료 · 저장/불러오기 · 복원 작업·지역 1~6·엔딩 · 모래더미 · 가방·팔기 · v1→v2 변환
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
// 오늘 하루 무료 자동 합치기를 다 쓴 것으로 (동전 값 시험)
function noFree(st) { st.boost.fday = C.dayKey(T0); st.boost.fused = D.BAL.autoMerge.freeDay; return st; }
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
test('새 판에 주문 3장 · 1지역 규칙(1개 · 첫 2장은 1단계, 그다음 2~4단계 · A/B/D) · 서로 다른 체인', () => {
  for (let s = 1; s < 40; s++) {
    const st = C.newState(T0, seeded(s));
    assert.strictEqual(st.orders.length, 3);
    const chains = st.orders.map((o) => o.need[0].c).sort().join('');
    assert.strictEqual(chains, 'abd');
    st.orders.forEach((o, k) => {
      assert.strictEqual(o.need.length, 1);
      if (k < D.BAL.firstEasyOrders) assert.strictEqual(o.need[0].t, 1, '첫 부탁은 1단계');
      else assert.ok(o.need[0].t >= 2 && o.need[0].t <= 4);
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
  assert.strictEqual(st.coins, o.coins); assert.strictEqual(st.stars, D.START.stars + o.stars); assert.strictEqual(st.starsEarned, o.stars);
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
test('건넨 뒤 새 부탁은 맨 오른쪽 끝 · 나머지는 왼쪽으로 한 칸씩', () => {
  for (let s = 1; s < 25; s++) {
    for (const k of [0, 1, 2]) {
      const st = emptyState(seeded(s));
      const before = st.orders.map((o) => o.id);
      const o = st.orders[k];
      o.need.forEach((x, j) => { st.board[10 + j] = item(x.c, x.t); });
      const r = C.deliver(st, o.id, T0, seeded(s + 50));
      assert.ok(r.ok);
      const after = st.orders.map((x) => x.id);
      assert.deepStrictEqual(after.slice(0, 2), before.filter((id) => id !== o.id), '남은 카드는 순서대로 왼쪽으로');
      assert.strictEqual(after[2], r.added[0].id, '새 카드는 맨 오른쪽');
    }
  }
});
test('이벤트 부탁을 건네도 다음 이벤트 부탁은 맨 오른쪽 끝', () => {
  const st = emptyState(seeded(4));
  st.ev = { id: D.EVENTS[0].id, week: 1, pts: 0, got: [], seq: 0 };
  st.orders.unshift(C.makeEventOrder(st, T0, seeded(5)));
  const eo = st.orders.find((o) => o.ev);
  assert.strictEqual(st.orders.indexOf(eo), 0);
  st.board[3] = item(eo.need[0].c, eo.need[0].t);
  const r = C.deliver(st, eo.id, T0, seeded(6));
  assert.ok(r.ok);
  const last = st.orders[st.orders.length - 1];
  assert.ok(last.ev && last.id !== eo.id);
});
test('다른 사람이 있으면 같은 얼굴이 카드 두 장에 동시에 안 나와요 (이야기·이벤트 부탁 포함)', () => {
  const dupes = (st) => { const w = st.orders.map((o) => o.who); return w.length !== new Set(w).size; };
  for (let s = 1; s < 60; s++) {
    // 1지역: 준이·미나·꽃님 셋뿐 → 한 번도 겹치면 안 돼요 (건네고 다시 채워도)
    const st = emptyState(seeded(s));
    assert.ok(!dupes(st));
    for (let d = 0; d < 6; d++) {
      const o = st.orders[(s + d) % st.orders.length];
      o.need.forEach((x, j) => { st.board[10 + j] = item(x.c, x.t); });
      assert.ok(C.deliver(st, o.id, T0, seeded(s * 7 + d)).ok);
      assert.ok(!dupes(st), '건넨 뒤에도 겹치지 않아요');
      o.need.forEach((x, j) => { st.board[10 + j] = null; });
    }
    // 뒤 지역(2개짜리 부탁·사람 많음): 이야기 부탁(미나)·이벤트 부탁(준이)이 있어도 다른 사람이 나와요
    const s2 = emptyState(seeded(s));
    s2.area = 4; s2.unlocked = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    s2.orders = [{ id: 's_x', who: 'mina', need: [{ c: 'b', t: 4 }], story: 'x', at: T0 }, { id: 'e_x', who: 'juni', need: [{ c: 'kite', t: 2 }], ev: 'kite', at: T0 }];
    for (let i = 0; i < 3; i++) s2.orders.push(C.makeOrder(s2, T0, seeded(s * 13 + i)));
    assert.ok(!dupes(s2), s2.orders.map((o) => o.who).join(','));
    s2.orders.slice(2).forEach((o) => assert.ok(D.VILLAGERS[o.who].chains.some((c) => o.need.some((x) => x.c === c)), '체인 맞는 사람'));
  }
});
test('다른 사람이 없으면(1지역 셋 다 카드에 있음) 그래도 부탁은 만들어져요', () => {
  const st = emptyState(seeded(3));
  st.orders = ['juni', 'mina', 'kkotnim'].map((w, k) => ({ id: 'q' + k, who: w, need: [{ c: 'abd'[k], t: 2 }], at: T0 }));
  const o = C.makeOrder(st, T0, seeded(9));
  assert.ok(o && o.need.length === 1 && D.VILLAGERS[o.who].chains.indexOf(o.need[0].c) >= 0);
});
test('만드는 법: 발생기 · 1단계부터 부탁 단계까지 · 판/가방에 가진 단계 표시', () => {
  const st = emptyState(seeded(2));
  st.board[5] = { k: 'gen', g: 'gen_a' };
  st.board[6] = item('a', 1); st.board[7] = item('a', 1); st.board[8] = item('a', 3); st.board[9] = item('b', 2);
  st.cover[20] = 1; st.board[20] = item('a', 2);   // 모래더미 아래는 못 써요
  st.bag[0] = item('a', 2);
  const g = C.orderGuide(st, 'a', 4);
  assert.strictEqual(g.from, 'gen');
  assert.deepStrictEqual(g.gen, { id: 'gen_a', name: D.GENS.gen_a.name, cells: [5] });
  assert.deepStrictEqual(g.steps.map((s) => s.t), [1, 2, 3, 4]);
  assert.deepStrictEqual(g.steps.map((s) => s.id), ['a1', 'a2', 'a3', 'a4']);
  assert.deepStrictEqual(g.steps[0].cells, [6, 7]);
  assert.deepStrictEqual(g.steps[1].cells, []); assert.strictEqual(g.steps[1].bag, 1); assert.strictEqual(g.steps[1].have, 1);
  assert.deepStrictEqual(g.steps[2].cells, [8]);
  assert.strictEqual(g.steps[3].have, 0);
  assert.strictEqual(g.best, 3); assert.strictEqual(g.ready, false);
  assert.strictEqual(g.name, D.CHAINS.a.tiers[3]);
  // 주문 카드의 물건 그대로
  const o = st.orders[0];
  const og = C.orderGuide(st, o.need[0].c, o.need[0].t);
  assert.strictEqual(og.steps.length, o.need[0].t);
  assert.strictEqual(og.gen.id, Object.keys(D.GENS).find((k) => D.GENS[k].chain === o.need[0].c));
  // 발생기가 판에 없으면 cells 빈칸 · 다 있으면 ready
  st.board[30] = item('a', 4);
  const g2 = C.orderGuide(st, 'a', 4);
  assert.ok(g2.ready);
  assert.deepStrictEqual(C.orderGuide(st, 'h', 2).gen.cells, []);
  // 보자기처럼 발생기가 없는 물건은 '다른 데서 나와요'
  const gb = C.orderGuide(st, 'bj', 2);
  assert.strictEqual(gb.gen, null); assert.strictEqual(gb.from, 'box');
  assert.strictEqual(C.orderGuide(st, 'zz', 1), null);
  // 체인 전체 창: 1단계~끝 단계 다 · 칸마다 판+가방 개수 · 모르는 단계 표시 · [찾기] 칸 = 그 체인 물건 전부 + 발생기
  const full = C.orderGuide(st, 'a', 4);
  assert.strictEqual(full.levels.length, D.CHAINS.a.tiers.length); assert.strictEqual(full.max, D.CHAINS.a.tiers.length);
  assert.deepStrictEqual(full.levels.slice(0, 4).map((s) => s.have), [2, 1, 1, 1]);
  assert.strictEqual(full.levels[1].bag, 1, '가방 것도 셈');
  assert.ok(full.levels.slice(4).every((s) => s.have === 0));
  st.found = { a1: 1 };
  const kn = C.orderGuide(st, 'a', 4).levels;
  assert.ok(kn[0].known && kn[2].known, '본 적 있거나 가진 단계는 보임'); assert.ok(!kn[D.CHAINS.a.tiers.length - 1].known, '모르는 끝 단계는 ?');
  assert.deepStrictEqual(full.find.slice().sort((x, y) => x - y), [5, 6, 7, 8, 30], '찾기: 판의 a 물건 + 발생기 (모래더미 아래는 빼고)');
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
  assert.ok(ls.m[D.SAVE_KEY].indexOf('"v":' + D.VERSION) >= 0);
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
  assert.ok(before < 100 && st.coins === o.coins && st.stars === D.START.stars + o.stars);
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
  st.stars = 0;
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
  assert.deepStrictEqual(st.gifts[0], { k: 'gen', g: 'gen_e' }, '발생기가 먼저'); assert.strictEqual(st.gifts[1].k, 'box', '지역 완성 보물 궤짝도 선물함에');
  D.AREAS[1].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.strictEqual(st.gifts.filter((x) => x.k === 'gen').length, 3); assert.strictEqual(st.gifts.filter((x) => x.k === 'box').length, 2); assert.ok(st.unlocked.indexOf('c') >= 0 && st.unlocked.indexOf('f') >= 0);
  D.AREAS[2].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.strictEqual(st.area, 3); assert.strictEqual(st.stars, 999 - 83);
  assert.ok(st.unlocked.indexOf('g') >= 0, '4지역: 체인 G'); assert.strictEqual(st.gifts.filter((x) => x.k === 'gen')[3].g, 'gen_g');
  D.AREAS[3].tasks.forEach((t) => C.doTask(st, t.id, T0, seeded(1)));
  assert.ok(st.unlocked.indexOf('h') >= 0, '5지역: 체인 H'); assert.strictEqual(st.gifts.filter((x) => x.k === 'gen')[4].g, 'gen_h');
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

console.log('3단계 · 가방 · 팔기 · 보조 물건');
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
test('팔기: 2^(단계-1) 동전 · 발생기는 못 팔고 · 최고 단계는 물어봄', () => {
  const st = emptyState();
  st.board[0] = item('d', 4); st.board[1] = { k: 'gen', g: 'gen_a' };
  const r = C.sell(st, 0, T0);
  assert.ok(r.ok); assert.strictEqual(r.coins, 8); assert.strictEqual(st.coins, 8); assert.strictEqual(st.board[0], null);
  assert.strictEqual(C.sell(st, 1, T0).reason, 'gen');
  assert.ok(C.sellAsk(item('d', 8))); assert.ok(!C.sellAsk(item('d', 7))); assert.ok(C.sellAsk({ k: 'wild' }));
});
test('되돌리기는 없어요: 엔진에 snapshot/restore 가 없고 · 옛 저장의 되돌리기 칸은 조용히 무시', () => {
  assert.strictEqual(C.snapshot, undefined); assert.strictEqual(C.restore, undefined);
  const ls = memStore(); const ad = S.localAdapter(ls);
  const st = C.newState(T0, seeded(4)); st.coins = 41; st.board[3] = item('d', 5);
  assert.ok(S.save(ad, st));
  const raw = JSON.parse(ls.m[D.SAVE_KEY]);
  const blob = raw.st || raw;   // 저장 모양이 바뀌어도 맨 위·상태 둘 다에 넣어 봐요
  raw.undo = '{"coins":0}'; raw.undoSnap = { coins: 0 }; blob.undo = '{"coins":0}'; blob.undoSnap = { coins: 0 };
  ls.m[D.SAVE_KEY] = JSON.stringify(raw);
  const back = S.load(ad, T0 + 1000, seeded(5));
  assert.strictEqual(back.coins, 41); assert.deepStrictEqual(back.board[3], item('d', 5));
  assert.ok(S.save(ad, back));
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
test('처음 발견하면 소라별 1 · 가방 속 소라별 가게는 없어지고 상점에서 소라별로 무지개 소라', () => {
  const st = emptyState();
  st.board[0] = item('a', 1); st.board[1] = item('a', 1);
  C.move(st, 0, 1, T0); assert.strictEqual(st.gems, 1);
  assert.strictEqual(C.buyShop, undefined); assert.strictEqual(D.BAL.shop, undefined);
  assert.strictEqual(C.shopBuy(st, { id: 'wild', pay: 'gems' }, T0, seeded(1)).reason, 'gems');
  st.gems = 6;
  const r = C.shopBuy(st, { id: 'wild', pay: 'gems' }, T0, seeded(1));
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
  assert.strictEqual(st.v, D.VERSION);
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
test('마을 지도: 작업마다 짓기 자리(그 지역 box 안) · 잔해·비밀도 · 지은 것끼리 겹치지 않음 · 그림·지도 조각이 다 있음', () => {
  const fs = require('fs');
  const IMG = path.join(__dirname, '..', 'static', 'img', 'merge', 'town');
  const T = D.TOWN, isl = T.island;
  const inMap = (x, y) => x >= 40 && x <= T.map.w - 40 && y >= 40 && y <= T.map.h - 40;
  let inT = null;
  const has = (id) => fs.existsSync(path.join(IMG, id + '.webp'));
  D.AREAS.forEach((a) => {
    assert.ok(T.areas[a.id] && T.areas[a.id].paths.length, a.id + ' 지역 칸·걷는 길');
    const bx = T.areas[a.id].box;
    inT = (x, y) => x >= bx[0] && x <= bx[2] && y >= bx[1] && y <= bx[3] && x >= isl[0] && x <= isl[2] && y >= isl[1] && y <= isl[3];
    T.areas[a.id].paths.forEach((p) => p.forEach((q) => assert.ok(inT(q[0], q[1]), a.id + ' 걷는 길 ' + q)));
    const pts = [], ai = D.AREAS.indexOf(a);
    assert.strictEqual(C.zoneAt(T.areas[a.id].center[0], T.areas[a.id].center[1]), ai, a.id + ' 가운데는 제 지역');
    a.tasks.forEach((t) => {
      const b = T.build[t.id];
      assert.ok(b && ['B3', 'D1', 'G'].indexOf(b.kind) >= 0, '짓기 ' + t.id);
      // 안개는 지역 칸(zoneAt)마다 걷혀요 → 짓기 자리·잔해가 제 지역 칸에 있어야 지역이 열릴 때 같이 보여요
      [b.at].concat(b.rep || [], b.lookAt || [], (b.clears || []).map((c) => [c[1], c[2]])).forEach((p) => { if (p) assert.strictEqual(C.zoneAt(p[0], p[1]), ai, '제 지역 칸 ' + t.id + ' ' + p); });
      if (b.lookAt) { assert.strictEqual(b.lookAt.length, 3, '모양마다 자리 ' + t.id); assert.deepStrictEqual(b.lookAt[0], b.at, '첫 모양 자리 = at ' + t.id); b.lookAt.forEach((p) => assert.ok(inT(p[0], p[1]), '모양 자리 ' + t.id)); }
      if (b.kind === 'B3') { ['a', 'b', 'c'].forEach((v) => assert.ok(has(b.art + '_' + v), b.art + '_' + v)); assert.strictEqual(b.looks.length, 3); }
      if (b.kind === 'D1') assert.ok(has(b.art), b.art);
      if (b.at) { assert.ok(inT(b.at[0], b.at[1]), '자리 ' + t.id); if (!b.z && !b.fx) pts.push([b.at[0], b.at[1], t.id]); }
      (b.rep || []).forEach((r) => assert.ok(inT(r[0], r[1])));
      (b.clears || []).forEach((c) => { assert.ok(has(c[0]), c[0]); assert.ok(inT(c[1], c[2]), '잔해 ' + t.id); });
    });
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      assert.ok(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) >= 60, '너무 가까움 ' + pts[i][2] + ' ' + pts[j][2]);
    }
    const s = a.secrets;
    s.letters.forEach((l) => { assert.ok(inT(l.x, l.y), '편지 자리 ' + l.id); if (l.after) assert.ok(a.tasks.some((t) => t.id === l.after)); });
    s.gulls.forEach((g) => assert.ok(inT(g[0], g[1]) && C.zoneAt(g[0], g[1]) === ai, a.id + ' 갈매기 자리 ' + g));
    s.letters.forEach((l) => assert.strictEqual(C.zoneAt(l.x, l.y), ai, a.id + ' 편지 자리(제 지역 칸) ' + l.id));
    s.bottle.forEach((g) => assert.ok(inMap(g[0], g[1]), a.id + ' 병 자리 ' + g));
    assert.ok(has('w_' + T.areas[a.id].who), '걷는 ' + T.areas[a.id].who);
  });
  Object.keys(D.OUTFITS).forEach((k) => { assert.ok(has(D.OUTFITS[k].art)); if (D.OUTFITS[k].face) assert.ok(has(D.OUTFITS[k].face)); });
  Object.keys(T.fillers).forEach((k) => assert.ok(has(T.fillers[k].art), k));
  ['w_mongdol', 'c_scaffold', T.ruin.art, 'm_sunglasses', 'm_tube'].forEach((id) => assert.ok(has(id), id));
  // 이어진 섬 지도: 멀리 볼 바탕 1장 + 조각 (지도 폭 / tile)² + 땅 지도(안개용)
  const n = T.map.w / T.map.tile;
  assert.ok(Number.isInteger(n) && T.map.w === T.map.h, '조각 수');
  ['map_lo', 'map_land'].forEach((id) => assert.ok(has(id), id));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) assert.ok(has(`map_${c}_${r}`), `map_${c}_${r}`);
  T.boats.forEach((b) => { assert.ok(has(b[0])); assert.ok(inMap(b[1], b[2]), '배 ' + b); });
  assert.ok(inMap(T.ruin.at[0], T.ruin.at[1]) && inMap(T.pond.at[0], T.pond.at[1]));
});
test('마을 화면 코드: 이어진 지도(조각·안개·섬 끌기 한계)만 쓰고 옛 2×3 지역 칸 좌표는 안 써요', () => {
  const tw = require('fs').readFileSync(path.join(base, 'town.js'), 'utf8');
  assert.ok(!/T\.tw|T\.th|T\.cols|T\.rows|'map_' \+ D\.AREAS/.test(tw), '옛 지역 칸 좌표');
  assert.ok(/map_\$\{c\}_\$\{r\}/.test(tw) && /img\('map_lo'\)/.test(tw) && /img\('map_land'\)/.test(tw), '조각 지도 · 땅 지도');
  assert.ok(/C\.zoneAt/.test(tw) && /T\.island/.test(tw), '지역 칸 · 섬 한계');
  // 모든 지역 가운데와 섬 테두리
  const isl = D.TOWN.island;
  D.AREAS.forEach((a) => { const c = D.TOWN.areas[a.id].center; assert.ok(c[0] > isl[0] && c[0] < isl[2] && c[1] > isl[1] && c[1] < isl[3]); });
});
test('마을 지도: 섬 테두리(box) 안에 모든 짓기 자리 · 현판은 본채 앞벽에 걸어요(모양 3가지마다 자리)', () => {
  const T = D.TOWN;
  D.AREAS.forEach((a) => {
    const bx = T.areas[a.id].box;
    assert.ok(Array.isArray(bx) && bx.length === 4 && bx[2] - bx[0] > 600 && bx[3] - bx[1] > 500, a.id + ' 섬 테두리');
    a.tasks.forEach((t) => {
      const b = T.build[t.id];
      [b.at].concat(b.rep || []).forEach((p) => { if (p) assert.ok(p[0] > bx[0] && p[0] < bx[2] && p[1] > bx[1] && p[1] < bx[3], '섬 밖 ' + t.id); });
      if (b.mount) {
        const h = T.build[b.mount.on];
        assert.ok(h && h.kind === 'B3' && a.tasks.some((x) => x.id === b.mount.on), '걸 집 ' + t.id);
        assert.strictEqual(b.mount.looks.length, 3);
        b.mount.looks.forEach((L) => { assert.ok(L[0] > 0.1 && L[0] < 0.9 && L[1] > 0.3 && L[1] < 0.8 && Math.abs(L[2]) < 1); });
        assert.ok(b.mount.w < h.w * 0.25, '현판은 집보다 한참 작게');
      }
    });
  });
  assert.strictEqual(T.build.r1_sign.mount.on, 'r1_paper');
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
test('발생기 강화 5단계: 동전 80 → 240 → 600 → 1200 → 2000 · 2단계 확률 10→20→30% · 3단계부터 가끔 3단계', () => {
  const st = emptyState(); st.coins = 5000;
  assert.deepStrictEqual([C.genUpInfo(st, 'gen_a').lv, C.genUpInfo(st, 'gen_a').price, C.genUpInfo(st, 'gen_a').max], [0, 80, 5]);
  [80, 240, 600, 1200, 2000].forEach((p, k) => { const r = C.upgradeGen(st, 'gen_a', T0); assert.ok(r.ok); assert.strictEqual(r.price, p); assert.strictEqual(r.lv, k + 1); });
  assert.strictEqual(st.coins, 5000 - 4120);
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
  const c4 = count(4), c5 = count(5);
  assert.ok(c4[3] > c3[3] && c5[3] > c4[3], '4·5단계는 3단계가 더 자주');
  assert.ok(c5[3] > 240 && c5[3] < 400 && c5[2] > 580, '5단계: 3단계 약 16% · 2단계 약 34%');
});
test('발생기 강화 4·5단계: 덤 하나(기운 그대로) · 충전식은 더 많이·더 빨리 · 옛 저장(0~3)은 그대로 읽고 이어서 강화', () => {
  // 덤: 5단계 약 12% · 빈칸이 없으면 덤 없음 · 기운은 1만
  const s5 = emptyState(); s5.genLv.gen_d = 5; s5.energy = 100000;
  const rng = seeded(5); let extra = 0;
  for (let i = 0; i < 2000; i++) {
    s5.board = s5.board.map(() => null); s5.board[30] = { k: 'gen', g: 'gen_d' };
    const e0 = s5.energy, r = C.tapGen(s5, 30, T0, rng);
    assert.strictEqual(e0 - s5.energy, 1);
    if (r.extra) { extra++; assert.strictEqual(s5.board[r.extra.at].t, 1); assert.notStrictEqual(r.extra.at, r.at); }
  }
  assert.ok(extra > 170 && extra < 320, '덤 ' + extra);
  const s3 = emptyState(); s3.genLv.gen_d = 3; s3.energy = 100000;
  for (let i = 0; i < 300; i++) { s3.board = s3.board.map(() => null); s3.board[30] = { k: 'gen', g: 'gen_d' }; assert.ok(!C.tapGen(s3, 30, T0, seeded(i)).extra, '3단계는 덤 없음'); }
  const full = emptyState(); full.genLv.gen_d = 5; full.settings.easy = true;
  full.board = full.board.map((_, i) => item('a', 1)); full.board[30] = { k: 'gen', g: 'gen_d' }; full.board[31] = null;
  for (let i = 0; i < 50; i++) { full.board[31] = null; const r = C.tapGen(full, 30, T0, seeded(i)); assert.ok(r.ok && !r.extra); }
  // 충전식: 12번 → 4단계 14번 · 5단계 16번 · 쉬는 시간 10분 → 8.5분 → 7분
  const ch = emptyState(); ch.settings.easy = true;
  assert.strictEqual(C.chargeTaps(ch, 'gen_c'), 12);
  ch.genLv.gen_c = 4; assert.strictEqual(C.chargeTaps(ch, 'gen_c'), 14); assert.strictEqual(C.genUpInfo(ch, 'gen_c').restMs, 8.5 * 60000);
  ch.genLv.gen_c = 5; assert.strictEqual(C.chargeTaps(ch, 'gen_c'), 16);
  for (let i = 0; i < 16; i++) { ch.board = ch.board.map(() => null); ch.board[30] = { k: 'gen', g: 'gen_c' }; assert.ok(C.tapGen(ch, 30, T0, seeded(i)).ok, '16번까지 ' + i); }
  ch.board[29] = null; const rest = C.tapGen(ch, 30, T0, seeded(1));
  assert.strictEqual(rest.reason, 'rest'); assert.strictEqual(rest.waitMs, 7 * 60000);
  assert.strictEqual(C.chargeInfo(ch, 'gen_c', T0 + 7 * 60000 + 1).left, 16, '7분 뒤 다시 16번');
  // 옛 저장 (genLv 3 = 옛 최고) → 그대로 3단계 · 4단계 1200 으로 이어서 강화 · 이상한 값은 0~5 안으로
  const old = emptyState(); old.genLv = { gen_a: 3, gen_b: 9 }; old.coins = 1500;
  const back = C.deserialize(C.serialize(old), T0, seeded(1));
  assert.strictEqual(C.genLevel(back, 'gen_a'), 3); assert.strictEqual(C.genLevel(back, 'gen_b'), 5);
  assert.strictEqual(C.genUpInfo(back, 'gen_a').price, 1200);
  assert.ok(C.upgradeGen(back, 'gen_a', T0).ok); assert.strictEqual(C.genLevel(back, 'gen_a'), 4);
  // 동전이 적은 초반(10~50개)엔 강화가 안 되고 첫 강화값도 그대로 80 (체크리스트: 초반 가격)
  const poor = emptyState(); poor.coins = 50;
  assert.strictEqual(C.upgradeGen(poor, 'gen_a', T0).reason, 'coins'); assert.strictEqual(C.genUpInfo(poor, 'gen_a').price, 80);
  // 중반 수입과 비교: 2~3지역 부탁 한 번 동전(판매값 합 ×1.5) 평균의 20~60배 사이
  const mid = emptyState(seeded(4)); mid.area = 2;
  let sum = 0, n = 0;
  for (let i = 0; i < 40; i++) { const m2 = C.newState(T0, seeded(100 + i)); m2.area = 2; D.AREAS.slice(0, 2).forEach((a) => a.tasks.forEach((t) => { m2.tasks[t.id] = T0; })); m2.orders = []; C.fillOrders && C.fillOrders(m2, T0, seeded(i)); m2.orders.forEach((o) => { if (!o.story && !o.ev) { sum += o.coins; n++; } }); }
  if (n) { const avg = sum / n; assert.ok(1200 / avg >= 15 && 2000 / avg <= 80, '4·5단계 값 ' + Math.round(avg)); }
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
  assert.ok(C.placeDeco(st, e.deco, 400, 2700, mon).ok); assert.deepStrictEqual(st.placed[e.deco], { wx: 400, wy: 2700 });
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
console.log('마을 개편 1단계 · 첫 건물 · 배경음악 · 상점 · 자동 합치기 · 저장 v3');
const M = require(path.join(base, 'music.js'));
test('첫 건물 빨리: 시작 별 1 · 1지역 첫 두 작업 별 1·1 · 첫 부탁 2장은 1단계 (총 291별 그대로)', () => {
  const st = C.newState(T0, seeded(4));
  assert.strictEqual(st.stars, 1);
  assert.deepStrictEqual(D.AREAS[0].tasks.slice(0, 2).map((t) => t.cost), [1, 1]);
  const easy = st.orders.filter((o) => !o.story).slice(0, 2);
  easy.forEach((o, k) => { st.board[10 + k] = item(o.need[0].c, 1); assert.ok(C.deliver(st, o.id, T0, seeded(k)).ok); });
  assert.ok(C.doTask(st, 'r1_gate', T0).ok); assert.ok(C.doTask(st, 'r1_paper', T0).ok, '부탁 2장으로 두 번째 작업까지');
  assert.ok(st.orders.filter((o) => !o.story).every((o) => o.need[0].t >= 2), '그다음부터는 원래 난이도');
});
test('배경음악 악보: 곡마다 칸 수·음·화음·악기가 맞고, 한 바퀴 45초 넘게 · 낮/밤·지역 1~6·이야기·이벤트 · 징글 4개', () => {
  ['board_day', 'board_night', 'title', 'story', 'event', 'town_r1', 'town_r2', 'town_r3', 'town_r4', 'town_r5', 'town_r6'].forEach((id) => {
    assert.deepStrictEqual(M.check(id), [], id);
    assert.ok(M.lengthSec(id) >= 45, id + ' 길이');
    assert.ok(M.compile(id).scale.length >= 5, id + ' 음');
  });
  assert.strictEqual(M.midi('C4'), 60); assert.strictEqual(M.midi('F#3'), 54); assert.ok(isNaN(M.midi('H2')));
  ['build', 'area', 'ending', 'attend'].forEach((j) => assert.ok(D.MUSIC.jingles[j].notes.every((x) => !isNaN(M.midi(x[0]))), j));
  // 오음 음계: 곡에 쓰인 음 이름(옥타브 빼고)이 5개
  Object.keys(D.MUSIC.songs).filter((id) => !D.MUSIC.songs[id].piano).forEach((id) => {
    const pcs = {}; M.compile(id).scale.forEach((m) => { pcs[m % 12] = 1; });
    assert.ok(Object.keys(pcs).length <= 5, id + ' 오음');
  });
});
test('발생기 톡: 처음 톡은 고르기만(기운 그대로) · 고른 발생기를 다시 톡하면 꺼내기 · 다른 칸을 골랐다 오면 다시 고르기부터', () => {
  assert.strictEqual(C.genTap(-1, 5), 'select');
  assert.strictEqual(C.genTap(3, 5), 'select', '다른 칸을 고른 상태');
  assert.strictEqual(C.genTap(5, 5), 'spawn');
  assert.strictEqual(C.genTap(-1, -1), 'select');
  // 화면 흐름 흉내: 고르기 → 기운 그대로 → 다시 톡 → 꺼내기
  const st = emptyState(seeded(2)); st.board[10] = { k: 'gen', g: Object.keys(D.GENS).find((g) => !D.GENS[g].charge && !D.GENS[g].ev) };
  let sel = -1; const e0 = st.energy;
  const tapUI = (i) => { if (C.genTap(sel, i) === 'spawn') return C.tapGen(st, i, T0, seeded(1)); sel = i; return null; };
  assert.strictEqual(tapUI(10), null); assert.strictEqual(st.energy, e0, '첫 톡은 기운 안 씀');
  const r = tapUI(10); assert.ok(r && r.ok); assert.strictEqual(st.energy, e0 - 1);
  assert.ok(tapUI(10).ok, '고른 채로 계속 톡하면 계속 나와요'); assert.strictEqual(st.energy, e0 - 2);
  sel = 3; assert.strictEqual(tapUI(10), null, '다른 걸 골랐다 오면 고르기부터'); assert.strictEqual(st.energy, e0 - 2);
});
test('발생기 꾹 누르기: 2초 뒤 연속 꺼내기 · 점점 빨라지되 0.17초 아래로는 안 · 하나마다 기운 1 · 기운/판이 다하면 멈춤', () => {
  assert.strictEqual(C.HOLD_MS, 2000);
  assert.strictEqual(C.holdGap(0), 350);
  for (let k = 1; k < 40; k++) { assert.ok(C.holdGap(k) <= C.holdGap(k - 1), '점점 빨라져요'); assert.ok(C.holdGap(k) >= 170, '너무 빠르지 않게'); }
  assert.strictEqual(C.holdGap(99), 170);
  // 연속 꺼내기 흉내: 기운이 3이면 3개 나오고 멈춤 (이유 energy)
  const st = emptyState(seeded(4)); const gid = Object.keys(D.GENS).find((g) => !D.GENS[g].charge && !D.GENS[g].ev);
  st.board[10] = { k: 'gen', g: gid }; st.energy = 3;
  const items0 = st.board.filter((x) => x && x.k === 'item').length;
  let made = 0, why = '';
  for (let k = 0; k < 20 && !why; k++) { const r = C.tapGen(st, 10, T0, seeded(10 + k)); why = C.holdStop(r); if (!why) made++; }
  assert.strictEqual(made, 3); assert.strictEqual(why, 'energy'); assert.strictEqual(st.energy, 0);
  assert.ok(st.board.filter((x) => x && x.k === 'item').length >= items0 + 3);
  // 판이 꽉 차면 멈춤 (이유 full)
  const s2 = emptyState(seeded(5)); s2.board[10] = { k: 'gen', g: gid }; s2.energy = 999;
  for (let k = 0; k < s2.board.length; k++) { if (!s2.board[k]) s2.board[k] = { k: 'item', c: 'a', t: 1 + (k % 5) }; if (s2.cover) s2.cover[k] = 0; }
  assert.strictEqual(C.holdStop(C.tapGen(s2, 10, T0, seeded(6))), 'full');
  // 충전 발생기는 충전이 다하면 멈춤
  const cg = Object.keys(D.GENS).find((g) => D.GENS[g].charge);
  const s3 = emptyState(seeded(7)); s3.board[10] = { k: 'gen', g: cg }; s3.energy = 999;
  let n3 = 0, w3 = '';
  for (let k = 0; k < 60 && !w3; k++) { const r = C.tapGen(s3, 10, T0, seeded(20 + k)); w3 = C.holdStop(r); if (!w3) n3++; }
  assert.strictEqual(n3, C.chargeTaps(s3, cg)); assert.strictEqual(w3, 'rest');
  // 짧은 톡 규칙은 그대로 (꾹 누르기와 별개)
  assert.strictEqual(C.genTap(-1, 10), 'select');
});
test('상점 살 때 묻는 말: 받침에 맞춘 을/를 · 동전/소라별 · 하기 말', () => {
  assert.strictEqual(C.buyAsk('가방 한 칸', 120, 'coins'), '가방 한 칸을 동전 120개에 살까요?');
  assert.strictEqual(C.buyAsk('작은 선글라스', 120, 'coins'), '작은 선글라스를 동전 120개에 살까요?');
  assert.strictEqual(C.buyAsk('무지개 소라', 6, 'gems'), '무지개 소라를 소라별 6개에 살까요?');
  assert.strictEqual(C.buyAsk('특가 다시 섞기', 10, 'coins', '할까요'), '특가 다시 섞기를 동전 10개에 할까요?');
  assert.strictEqual(C.buyAsk('「등불 무대」 모양', 60, 'coins'), '「등불 무대」 모양을 동전 60개에 살까요?');
  assert.strictEqual(C.buyAsk('「트렌치코트 + 베레모」', 500, 'coins'), '「트렌치코트 + 베레모」를 동전 500개에 살까요?', '괄호 건너뛰고 받침');
  assert.strictEqual(C.buyAsk('모래 바구니 강화 4', 1200, 'coins', '할까요'), '모래 바구니 강화 4를 동전 1200개에 할까요?');
});
test('피아노 배경음악(기본): 곡 4개 차례 · 한 곡 약 5분 · 악보 검사 · 변주가 실제로 달라요 · 동양풍 설정', () => {
  const L = D.MUSIC.lists.piano;
  assert.deepStrictEqual(L, ['p_morning', 'p_market', 'p_sunset', 'p_night']);
  const titles = {};
  L.forEach((id) => {
    assert.deepStrictEqual(M.check(id), [], id);
    const sec = M.lengthSec(id);
    assert.ok(sec >= 270 && sec <= 340, id + ' 길이 ' + Math.round(sec));
    const c = M.compile(id);
    assert.ok(c.piano && c.timeline[0].sec === 'I' && c.timeline[c.timeline.length - 1].sec === 'Z', id + ' 머리·끝맺음');
    titles[c.song.title] = 1;
    // 구간이 4개 이상 · 같은 구간이 다시 나올 때 변주(왼손 무늬·옥타브)가 달라서 소리가 같지 않아요
    assert.ok(new Set(c.timeline.map((x) => x.sec)).size >= 6, id + ' 구간 수');
    const first = {}, sameAgain = [];
    c.timeline.forEach((x, bi) => {
      const k = x.sec + ':' + x.bar;
      const sig = JSON.stringify(M.planPiano(id, bi).map((st) => st.map((e) => e.m)));
      if (first[k] === undefined) first[k] = sig; else if (first[k] === sig && x.sec !== 'Z') sameAgain.push(bi);
    });
    assert.ok(sameAgain.length <= c.timeline.length * 0.1, id + ' 같은 마디가 똑같이 반복 ' + sameAgain.length);
    // 음역: 너무 높거나 낮지 않게
    c.timeline.forEach((x, bi) => M.planPiano(id, bi).forEach((st) => st.forEach((e) => assert.ok(e.m >= 33 && e.m <= 96 && e.v > 0 && e.v < 0.6, id + ' 음 ' + e.m))));
  });
  assert.strictEqual(Object.keys(titles).length, 4, '곡마다 이름');
  assert.deepStrictEqual(D.MUSIC.lists.piano_quiet, ['p_night']);
  const st = C.newState(T0, seeded(1));
  assert.strictEqual(st.settings.bgmStyle, 'piano', '기본은 피아노');
  const old = C.newState(T0, seeded(1)); delete old.settings.bgmStyle;
  assert.strictEqual(C.deserialize(JSON.stringify(old), T0, seeded(1)).settings.bgmStyle, 'piano', '옛 저장 → 피아노');
  old.settings.bgmStyle = 'east';
  assert.strictEqual(C.deserialize(JSON.stringify(old), T0, seeded(1)).settings.bgmStyle, 'east', '동양풍 고른 건 그대로');
  // 동양풍 곡은 그대로 남아 있어요
  ['board_day', 'town_r1', 'story'].forEach((id) => assert.deepStrictEqual(M.check(id), [], id));
});
test('상점: 매일 0시 새로 · 특가 3칸(한 칸은 지금 지역 체인 3~4단계) · 무료 1칸 한 번 · 다시 섞기 하루 1번(10×m)', () => {
  const st = emptyState(seeded(3)); st.coins = 1000;
  assert.ok(C.shopTouch(st, T0)); assert.ok(!C.shopTouch(st, T0 + 1000));
  assert.strictEqual(st.shop.deals.length, 3);
  const d0 = st.shop.deals[0];
  assert.strictEqual(d0.id, 'tier'); assert.ok(D.AREAS[0].chains.indexOf(d0.c) >= 0 && (d0.t === 3 || d0.t === 4));
  st.shop.deals.forEach((d) => assert.ok(D.SHOP.dealOff.indexOf(d.off) >= 0));
  const again = emptyState(seeded(9)); C.shopTouch(again, T0);
  assert.deepStrictEqual(again.shop.deals, st.shop.deals, '같은 날은 같은 특가');
  const f = C.shopFree(st, T0, seeded(1)); assert.ok(f.ok); assert.strictEqual(C.shopFree(st, T0, seeded(1)).reason, 'done');
  const r = C.shopBuy(st, { id: 'deal', slot: 0 }, T0, seeded(1));
  assert.ok(r.ok); assert.strictEqual(r.price, Math.round(D.SHOP.tierPrice[d0.t] * (1 - d0.off)));
  assert.deepStrictEqual(r.cell, item(d0.c, d0.t));
  assert.strictEqual(C.shopBuy(st, { id: 'deal', slot: 0 }, T0, seeded(1)).reason, 'limit');
  const c0 = st.coins;
  assert.ok(C.shopReroll(st, T0).ok); assert.strictEqual(st.coins, c0 - 10);
  assert.ok(C.shopBuy(st, { id: 'deal', slot: 0 }, T0, seeded(1)).ok, '섞으면 특가 칸 다시 살 수 있음');
  assert.strictEqual(C.shopReroll(st, T0).reason, 'done');
  C.shopTouch(st, T0 + 864e5);
  assert.ok(!st.shop.freeTaken && !st.shop.rerolled && !Object.keys(st.shop.bought).length, '다음 날 초기화');
  const tok = emptyState(); tok.shop.free = 0; C.shopTouch(tok, T0); tok.shop.free = D.SHOP.free.findIndex((x) => x.token);
  assert.ok(C.shopFree(tok, T0, seeded(1)).ok); assert.strictEqual(tok.boost.autoTok, 1, '무료 자동 합치기 1번');
});
test('상점 가격: 편의 물건은 × 지역 배수(1·2·4·7·11·16) · 낱개 물건은 고정 · 3단계 하루 5개 · 무지개 소라는 동전 하루 1 / 소라별 6', () => {
  const st = emptyState(seeded(3)); st.coins = 99999; st.area = 3; st.unlocked = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.strictEqual(C.shopMult(st), 7);
  assert.strictEqual(C.shopBuy(st, { id: 'bj1' }, T0, seeded(1)).price, 25 * 7);
  assert.strictEqual(C.shopBuy(st, { id: 'bj2', pay: 'gems' }, T0, seeded(1)).reason, 'gems');
  st.gems = 7; assert.strictEqual(C.shopBuy(st, { id: 'bj2', pay: 'gems' }, T0, seeded(1)).price, 7); assert.strictEqual(st.gems, 0);
  assert.strictEqual(C.shopBuy(st, { id: 'tier', c: 'c', t: 2 }, T0, seeded(1)).price, 14);
  assert.strictEqual(C.shopBuy(st, { id: 'tier', c: 'h', t: 1 }, T0, seeded(1)).reason, 'gone', '안 열린 체인');
  for (let i = 0; i < 5; i++) assert.ok(C.shopBuy(st, { id: 'tier', c: 'a', t: 3 }, T0, seeded(i)).ok);
  assert.strictEqual(C.shopBuy(st, { id: 'tier', c: 'a', t: 3 }, T0, seeded(1)).reason, 'limit');
  assert.ok(C.shopBuy(st, { id: 'wild' }, T0, seeded(1)).ok); assert.strictEqual(C.shopBuy(st, { id: 'wild' }, T0, seeded(1)).reason, 'limit');
  st.gems = 12; assert.ok(C.shopBuy(st, { id: 'wild', pay: 'gems' }, T0, seeded(1)).ok); assert.ok(C.shopBuy(st, { id: 'wild', pay: 'gems' }, T0, seeded(1)).ok);
  st.energy = 0; const e = C.shopBuy(st, { id: 'refill' }, T0, seeded(1)); assert.ok(e.ok); assert.strictEqual(e.price, 15 * 7);
  const poor = emptyState(); poor.coins = 3;
  const no = C.shopBuy(poor, { id: 'en1' }, T0, seeded(1)); assert.strictEqual(no.reason, 'coins'); assert.strictEqual(no.short, 3);
});
test('도우미: 바쁜 손(10분 기운 0) · 발생기 바로 충전 · 다른 부탁 바로 · 가방 칸 · 남은 시간은 앱을 연 동안만 줄어요', () => {
  const st = emptyState(seeded(3)); st.coins = 9999;
  st.board[30] = { k: 'gen', g: 'gen_c' };
  assert.strictEqual(C.shopBuy(st, { id: 'recharge' }, T0, seeded(1)).reason, 'norest');
  for (let i = 0; i < 12; i++) C.tapGen(st, 30, T0, seeded(i));
  assert.strictEqual(C.tapGen(st, 30, T0, seeded(1)).reason, 'rest');
  assert.ok(C.shopBuy(st, { id: 'recharge' }, T0, seeded(1)).ok);
  assert.ok(C.tapGen(st, 30, T0, seeded(1)).ok, '바로 다시 톡');
  assert.ok(C.shopBuy(st, { id: 'hands' }, T0, seeded(1)).ok);
  st.energy = 0; assert.ok(C.tapGen(st, 30, T0, seeded(2)).ok, '기운 0이어도'); assert.strictEqual(st.energy, 0);
  C.boostTick(st, D.SHOP.handsMs); assert.strictEqual(st.boost.handsMs, 0);
  assert.strictEqual(C.tapGen(st, 30, T0, seeded(2)).reason, 'energy');
  assert.strictEqual(C.shopBuy(st, { id: 'skipnow' }, T0, seeded(1)).reason, 'nocool');
  const o = st.orders.find((x) => !x.story); assert.ok(C.skipOrder(st, o.id, T0, seeded(1)).ok);
  assert.ok(C.shopBuy(st, { id: 'skipnow' }, T0 + 1000, seeded(1)).ok); assert.ok(C.skipOrder(st, st.orders[0].id, T0 + 2000, seeded(1)).ok);
  const b = C.shopBuy(st, { id: 'bag' }, T0, seeded(1)); assert.ok(b.ok); assert.strictEqual(st.bag.length, D.BAL.bagStart + 1);
});
test('자동 합치기: 같은 단계 2개씩 · 연쇄 · 결과는 아래쪽/왼쪽 칸 · 값 = 횟수(최소 3) × 배수(최대 2) · 최대 20 · 미리 계산은 판을 안 바꿔요', () => {
  const st = noFree(emptyState(seeded(3))); st.orders = []; st.coins = 100;
  st.board[0] = item('a', 1); st.board[1] = item('a', 1); st.board[7] = item('a', 1); st.board[8] = item('a', 1);
  st.board[20] = item('b', 2); st.board[2] = item('b', 2);
  const before = JSON.stringify(st.board);
  const plan = C.autoMergePlan(st, T0);
  assert.strictEqual(plan.n, 4, 'a1 둘 둘 → a2 둘 → a3 하나 · b2 둘'); assert.strictEqual(plan.price, 4);
  assert.strictEqual(JSON.stringify(st.board), before);
  const r = C.autoMerge(st, T0);
  assert.ok(r.ok); assert.strictEqual(st.coins, 100 - 4);
  assert.strictEqual(st.board.filter(Boolean).length, 2);
  const at3 = st.board.findIndex((c) => c && c.c === 'a'); assert.deepStrictEqual(st.board[at3], item('a', 3)); assert.strictEqual(C.rc(at3).r, 1, '아래 줄로');
  assert.strictEqual(C.rc(at3).c, 0, '같은 줄이면 왼쪽');
  assert.deepStrictEqual(st.board[20], item('b', 3), 'b 는 아래 칸(20)에'); assert.strictEqual(st.board[2], null);
  assert.strictEqual(st.stats.merges, 4); assert.ok(st.found.a3);
  assert.strictEqual(C.autoMerge(st, T0).reason, 'none');
  const big = emptyState(); big.orders = []; big.area = 4; big.unlocked = ['a'];
  for (let i = 0; i < 40; i++) big.board[i] = item('a', 1);
  const p = C.autoMergePlan(big, T0); assert.ok(p.n > 22); assert.strictEqual(p.price, 20, '최대 20 (5지역이어도)');
  // 버그(2026-11): 동전 10개인데 19번 합치기에 154+ → 이제 1지역 19번 = 19, 2지역부터도 ×2 까지 · 최소 3
  const one = emptyState(); one.area = 0; assert.strictEqual(C.autoPrice(one, 19), 19); assert.strictEqual(C.autoPrice(one, 1), 3);
  one.area = 3; assert.strictEqual(C.autoPrice(one, 5), 10); assert.strictEqual(C.autoPrice(one, 19), 20);
});
test('자동 합치기: 하루 2번 무료 (0시에 새로) → 다 쓰면 동전 · 1분 도우미도 싸게 (8 × 최대 2)', () => {
  const st = emptyState(seeded(3)); st.orders = []; st.coins = 0;
  const two = () => { st.board[0] = item('a', 1); st.board[1] = item('a', 1); };
  two(); assert.strictEqual(C.autoMergePlan(st, T0).free, 2);
  let r = C.autoMerge(st, T0); assert.ok(r.ok && r.free); assert.strictEqual(st.coins, 0);
  two(); r = C.autoMerge(st, T0 + 1000); assert.ok(r.ok && r.free);
  two(); assert.strictEqual(C.autoMerge(st, T0 + 2000).reason, 'coins', '무료를 다 쓰면 동전');
  assert.strictEqual(C.autoFreeLeft(st, T0 + 864e5), 2, '다음 날 다시 2번');
  const back = C.deserialize(C.serialize(st), T0, seeded(1)); assert.strictEqual(C.autoFreeLeft(back, T0), 0, '저장해도 그대로');
  st.area = 5; assert.strictEqual(C.itemCoins(st, 'auto1m'), 16); st.area = 0; assert.strictEqual(C.itemCoins(st, 'auto1m'), 8);
  assert.strictEqual(D.SHOP.items.auto1m.gems, 1);
});
test('자동 합치기는 부탁에 필요한 물건(단계·개수)·발생기·최고 단계·모래더미·보조 물건·무지개 소라·고정한 물건을 안 건드려요', () => {
  const st = emptyState(seeded(3)); st.coins = 100;
  st.orders = [{ id: 'x', who: 'juni', need: [{ c: 'a', t: 2 }, { c: 'a', t: 2 }], coins: 1, stars: 1, at: T0 }];
  st.board[0] = item('a', 2); st.board[1] = item('a', 2); st.board[2] = item('a', 2);   // 2개는 부탁에 · 남는 1개뿐이라 못 합침
  st.board[3] = { k: 'gen', g: 'gen_a' }; st.board[4] = { k: 'gen', g: 'gen_a' };
  st.board[5] = item('a', 8); st.board[6] = item('a', 8);
  st.board[9] = item('en', 1); st.board[10] = item('en', 1);
  st.board[11] = { k: 'wild' }; st.board[12] = item('d', 1);
  st.board[13] = item('d', 1); C.setPin(st, 13, true);
  st.board[14] = item('b', 1); st.cover[15] = 1;
  assert.strictEqual(C.autoMergePlan(st, T0).n, 0);
  st.board[17] = item('a', 2);   // 4개 중 2개는 남기고 2개는 합침
  const r = C.autoMerge(st, T0);
  assert.strictEqual(r.n, 1); assert.ok(C.orderStatus(st, st.orders[0]).ready, '부탁 물건은 그대로');
  st.settings.autoKeep = false;
  st.board[18] = item('d', 1);
  assert.strictEqual(C.autoMergePlan(st, T0).n, 3, '끄면 부탁 물건도 합쳐요: a2+a2 → a3, a3+a3 → a4, d1+d1 (고정한 d1 은 그대로)');
  const bag = emptyState(seeded(3)); bag.orders = [{ id: 'y', who: 'juni', need: [{ c: 'a', t: 1 }], coins: 1, stars: 1, at: T0 }];
  bag.bag[0] = item('a', 1); bag.board[0] = item('a', 1); bag.board[1] = item('a', 1);
  assert.strictEqual(C.autoMergePlan(bag, T0).n, 1, '가방에 있으면 판의 것은 합쳐도 돼요');
});
test('자동 합치기: 무료 1번(오늘의 무료)은 동전 대신 · 동전이 모자라면 안 돼요', () => {
  const st = noFree(emptyState(seeded(3))); st.orders = []; st.coins = 2;
  st.board[0] = item('a', 1); st.board[1] = item('a', 1);
  assert.strictEqual(C.autoMerge(st, T0).reason, 'coins');
  st.coins = 10;
  assert.ok(C.autoMerge(st, T0).ok); assert.strictEqual(st.coins, 7);
  st.board.fill(null); st.board[0] = item('a', 1); st.board[1] = item('a', 1);
  st.boost.autoTok = 1;
  const r = C.autoMerge(st, T0); assert.ok(r.ok && r.token); assert.strictEqual(st.coins, 7); assert.strictEqual(st.boost.autoTok, 0);
});
test('자동 합치기 1분: 새로 놓인 물건이 짝을 만나면 바로 합쳐지고 연쇄 · 끝나면 안 해요', () => {
  const st = emptyState(seeded(3)); st.orders = []; st.coins = 100;
  st.board[0] = item('a', 2); st.board[8] = item('a', 1); st.board[2] = { k: 'gen', g: 'gen_a' };
  st.board[9] = item('a', 1);
  assert.deepStrictEqual(C.autoChain(st, 9, T0), [], '켜기 전엔 그대로');
  assert.ok(C.shopBuy(st, { id: 'auto1m' }, T0, seeded(1)).ok); assert.strictEqual(st.coins, 92); assert.strictEqual(st.boost.autoMs, 60000);
  const steps = C.autoChain(st, 9, T0);
  assert.strictEqual(steps.length, 2, 'a1+a1 → a2, a2+a2 → a3');
  assert.deepStrictEqual(st.board.filter((c) => c && c.k === 'item'), [item('a', 3)]);
  C.boostTick(st, 61000); assert.strictEqual(st.boost.autoMs, 0);
  st.board[20] = item('b', 1); st.board[21] = item('b', 1);
  assert.deepStrictEqual(C.autoChain(st, 21, T0), []);
});
test('v2 저장 → v3: 소리 크기 1~3 → 0~100 · 배경음은 한 번만 켜요 · 상점·도우미 기본값 · v3 에서 끈 배경음은 그대로', () => {
  const v2 = C.newState(T0, seeded(5));
  v2.v = 2; v2.settings = { sfx: true, vib: true, easy: false, nums: true, hint: true, bgm: false, vol: 2, bgmVol: 3, big: false, calm: false };
  delete v2.shop; delete v2.boost; v2.coins = 42; v2.gems = 9;
  const st = C.deserialize(JSON.stringify(v2), T0, seeded(1));
  assert.strictEqual(st.v, D.VERSION); assert.strictEqual(st.settings.bgm, true); assert.strictEqual(st.settings.bgmAsked, true);
  assert.strictEqual(st.settings.vol, 65); assert.strictEqual(st.settings.bgmVol, 90); assert.strictEqual(st.settings.autoKeep, true);
  assert.strictEqual(st.coins, 42); assert.strictEqual(st.gems, 9, '소라별은 그대로 (상점에서 써요)');
  assert.deepStrictEqual(st.boost, { autoMs: 0, handsMs: 0, autoTok: 0, fday: '', fused: 0 }); assert.ok(C.shopTouch(st, T0));
  st.settings.bgm = false; st.settings.vol = 3;
  const back = C.deserialize(C.serialize(st), T0, seeded(1));
  assert.strictEqual(back.settings.bgm, false, '끈 건 존중'); assert.strictEqual(back.settings.vol, 3, 'v3 의 3 은 그냥 3');
  st.shop.deals.push({ id: 'nope', off: 0.3 }); st.boost.autoMs = -5;
  const fixed = C.deserialize(C.serialize(st), T0, seeded(1));
  assert.ok(fixed.shop.deals.every((d) => d.id !== 'nope')); assert.strictEqual(fixed.boost.autoMs, 0);
});
test('버그: 이벤트 부탁(별 0)을 건넨 뒤 위 칸 동전이 멈춰 실제와 달라지던 것 — 붙잡기는 날아간 묶음 수만큼 풀리고 늦어도 2.5초 뒤엔 진짜 값', () => {
  const st = emptyState(seeded(3)); st.coins = 1593;
  const h = C.hudShown(st);
  // 이벤트 부탁: 별 0 → 동전 묶음 하나만 날아가요
  h.begin(T0, 0); st.coins += 4;
  assert.strictEqual(h.read(st, T0 + 100).coins, 1593, '날아가는 동안은 옛 숫자');
  h.land('coins', st); h.done();
  assert.strictEqual(h.read(st, T0 + 700).holding, false, '동전이 도착하면 풀려요');
  st.coins = 353;   // 강화·가방에 씀
  assert.strictEqual(h.read(st, T0 + 800).coins, 353, '위 칸 = 진짜 동전');
  // 도착 알림이 하나도 안 와도(숨긴 탭 등) 2.5초 뒤엔 진짜 값
  h.begin(T0 + 1000, 2); st.coins = 999;
  assert.strictEqual(h.read(st, T0 + 2000).coins, 353);
  assert.strictEqual(h.read(st, T0 + 4000).coins, 999);
  // 일반 부탁(별 있음): 동전·별 둘 다 도착해야 풀려요
  h.begin(T0 + 5000, 2); h.land('coins', st); h.done();
  assert.ok(h.read(st, T0 + 5100).holding); h.land('stars', st); h.done();
  assert.ok(!h.read(st, T0 + 5200).holding);
  h.begin(T0, 1); h.reset(st); assert.ok(!h.read(st, T0).holding, '다른 기록을 불러오면 바로 풀려요');
  // 화면 코드: 별 0 이면 별을 날리지 않고(도착 알림 없음) 동전 하나만 센다
  const ui = require('fs').readFileSync(path.join(base, 'ui.js'), 'utf8');
  assert.ok(/shown\.begin\(now\(\), r\.stars > 0 \? 2 : 1\)/.test(ui) && !/shown\.hold/.test(ui));
});
console.log('마을 짓기 2단계 · 저장 v4 · 모양 · 옷 · 몽돌 · 장식 · 우정');
test('v3 저장 → v4: 끝낸 작업은 지은 건물(첫 모양 무료) · 별·지역·이야기 그대로 · 장식 % → 지도 px(섬 안) · 새 모습 안내 한 번', () => {
  const v3 = soAll(C.newState(T0, seeded(9)));
  v3.v = 3; ['look', 'owned', 'outfit', 'mongAcc', 'cam', 'tapDay', 'friend'].forEach((k) => delete v3[k]);
  v3.area = 2; v3.stars = 5; v3.coins = 77;
  D.AREAS[0].tasks.concat(D.AREAS[1].tasks).forEach((t) => { v3.tasks[t.id] = T0; });
  v3.tasks.r3_road = T0; v3.story = { r1_gate: true, r2_open: 'skip' };
  v3.decos = ['kite_deco']; v3.placed = { kite_deco: { a: 1, x: 40, y: 70 } };
  const st = C.deserialize(JSON.stringify(v3), T0, seeded(1));
  assert.strictEqual(st.v, D.VERSION); assert.strictEqual(st.area, 2); assert.strictEqual(st.stars, 5); assert.strictEqual(st.coins, 77);
  assert.strictEqual(Object.keys(st.tasks).length, 14, '작업 id 그대로'); assert.deepStrictEqual(st.story, v3.story);
  ['r1_gate', 'r1_paper', 'r1_room', 'r2_pier', 'r2_awning', 'r2_ice'].forEach((id) => { assert.strictEqual(C.lookOf(st, id), 0); assert.deepStrictEqual(C.looksOwned(st, id), [0]); });
  assert.strictEqual(st.look.r3_road, undefined, '땅 고치기(G)는 모양 없음'); assert.strictEqual(st.look.r1_sign, undefined, '장식은 모양 없음');
  const bx = D.TOWN.areas.r2.box, p = st.placed.kite_deco;
  assert.ok(p.wx > bx[0] && p.wx < bx[2] && p.wy > bx[1] && p.wy < bx[3], '2지역 섬 안쪽 (v4 → v5 로 새 지도 자리)');
  assert.strictEqual(st.seen.townNew, 1); assert.strictEqual(st.outfit, 'base'); assert.deepStrictEqual(st.owned.outfits, ['base']);
  const back = C.deserialize(C.serialize(st), T0, seeded(1));
  assert.deepStrictEqual(back.look, st.look); assert.deepStrictEqual(back.placed, st.placed);
  const fresh = C.deserialize(JSON.stringify(Object.assign(C.newState(T0, seeded(2)), { v: 3 })), T0, seeded(1));
  assert.ok(!fresh.seen.townNew, '처음 하는 사람은 안내 없음');
  assert.strictEqual(S.pickSave(st, back, false), 'local', '서버 비교 기준(작업·지역·건넨 수) 그대로');
});
test('짓기 → 모양 고르기: 하나는 무료 · 나머지는 동전(30 × 그 지역 배수)으로 열고 · 연 모양끼리는 무료로 바꿔요', () => {
  const st = soAll(emptyState(seeded(3))); st.stars = 10; st.coins = 100;
  assert.strictEqual(C.setLook(st, 'r1_gate', 1, T0).reason, 'notbuilt');
  assert.ok(C.doTask(st, 'r1_gate', T0, seeded(1)).ok);
  assert.deepStrictEqual(C.looksPending(st), ['r1_gate']);
  const f = C.setLook(st, 'r1_gate', 2, T0); assert.ok(f.ok && f.free); assert.strictEqual(C.lookOf(st, 'r1_gate'), 2); assert.strictEqual(st.coins, 100);
  const lock = C.setLook(st, 'r1_gate', 0, T0); assert.strictEqual(lock.reason, 'locked'); assert.strictEqual(lock.price, 30);
  assert.ok(C.setLook(st, 'r1_gate', 0, T0, true).ok); assert.strictEqual(st.coins, 70); assert.strictEqual(C.lookOf(st, 'r1_gate'), 0);
  assert.ok(C.setLook(st, 'r1_gate', 2, T0).ok, '연 모양은 무료'); assert.strictEqual(st.coins, 70);
  st.coins = 5; assert.strictEqual(C.setLook(st, 'r1_gate', 1, T0, true).reason, 'coins');
  assert.strictEqual(C.lookPrice(st, 'r4_pavilion'), 30 * D.SHOP.mult[3]);
  C.doTask(st, 'r1_paper', T0, seeded(1)); assert.ok(C.firstLook(st, 'r1_paper', T0).ok, '그냥 닫으면 첫 모양');
  assert.deepStrictEqual(C.looksOwned(st, 'r1_paper'), [0]); assert.ok(!C.firstLook(st, 'r1_paper', T0).ok);
  assert.strictEqual(C.setLook(st, 'r1_sign', 1, T0).reason, 'gone', '장식은 모양이 하나');
});
test('하윤 옷 사기·입기 (동전·소라별 · 여름 옷도 일 년 내내 · 사면 바로 입지 않고 물어봐요 · 사기/입기/입는 중) · 몽돌 소품 · 마을 장식 사서 놓기 · 지은 건물 톡 엽전(하루 한 번)', () => {
  const st = emptyState(seeded(3)); st.coins = D.OUTFITS.trench.coins + D.MONG_ACC.sunglasses.coins; st.gems = D.OUTFITS.vacation.gems + 10;
  const nov = new Date(2026, 10, 1).getTime(), jul = new Date(2026, 6, 1).getTime();
  assert.strictEqual(C.wearOutfit(st, 'trench', nov).reason, 'locked');
  assert.deepStrictEqual(['base', 'trench', 'vacation'].map((k) => C.outfitState(st, k, nov)), ['worn', 'buy', 'buy'], '여름 옷도 11월에 사기');
  assert.ok(C.buyOutfit(st, 'trench', 'coins', nov).ok); assert.strictEqual(st.coins, D.MONG_ACC.sunglasses.coins); assert.strictEqual(st.outfit, 'base', '사기만 · 입을지는 물어봐요');
  assert.deepStrictEqual(['base', 'trench'].map((k) => C.outfitState(st, k, nov)), ['worn', 'wear'], '산 옷은 입기 · 입는 중은 입은 한 벌만');
  assert.ok(C.wearOutfit(st, 'trench', nov).ok);
  assert.deepStrictEqual(['base', 'trench'].map((k) => C.outfitState(st, k, nov)), ['wear', 'worn']);
  assert.strictEqual(C.buyOutfit(st, 'trench', 'coins', nov).reason, 'have');
  assert.ok(C.buyOutfit(st, 'vacation', 'gems', nov).ok, '여름 옷도 11월에'); assert.strictEqual(st.gems, 10);
  assert.ok(C.buyOutfit(emptyState(seeded(1)), 'vacation', 'coins', jul).reason !== 'season');
  assert.strictEqual(['base', 'trench', 'vacation'].filter((k) => C.outfitState(st, k, nov) === 'worn').length, 1);
  assert.ok(C.wearOutfit(st, 'base', nov).ok); assert.strictEqual(st.outfit, 'base');
  const back = C.deserialize(C.serialize(st), nov, seeded(1)); assert.deepStrictEqual(back.owned.outfits, ['base', 'trench', 'vacation']);
  assert.ok(C.buyMong(st, 'sunglasses', nov).ok); assert.strictEqual(st.coins, 0); assert.strictEqual(st.mongAcc, 'sunglasses');
  assert.strictEqual(C.wearMong(st, 'hat', nov).reason, 'locked'); st.decos.push('mongdol_hat'); assert.ok(C.wearMong(st, 'hat', nov).ok);
  assert.ok(C.wearMong(st, null, nov).ok); assert.strictEqual(st.mongAcc, null);
  st.coins = 30;
  const f = C.buyFiller(st, 'pine', nov); assert.ok(f.ok); assert.strictEqual(st.coins, 10); assert.strictEqual(C.decoKind(f.id), 'pine');
  assert.strictEqual(C.buyFiller(st, 'pine', nov).reason, 'coins');
  assert.ok(C.placeDeco(st, f.id, 900, 2500, nov).ok); assert.deepStrictEqual(st.placed[f.id], { wx: 900, wy: 2500 });
  assert.ok(C.placeDeco(st, f.id, null, null, nov).removed);
  assert.strictEqual(C.placeDeco(st, 'mongdol_hat', 1, 1, nov).reason, 'none', '몽돌 모자는 지도에 안 놓아요');
  st.tasks.r1_gate = nov; const c0 = st.coins;
  const a = C.tapToy(st, 'r1_gate', nov, seeded(2)); assert.ok(a.coins >= 1 && a.coins <= 3); assert.strictEqual(st.coins, c0 + a.coins);
  assert.strictEqual(C.tapToy(st, 'r1_gate', nov + 1000, seeded(2)).coins, 0, '하루 한 번');
  assert.ok(C.tapToy(st, 'r1_gate', nov + 864e5, seeded(2)).coins >= 1);
});
test('우정: 선물 점수(최애·좋아함·보통) · 하루 3번 · 단계 보상 1~5 · 부탁 건네기 +2', () => {
  const st = emptyState(seeded(3)); st.coins = 0; st.gems = 0;
  st.board[0] = item('a', 8); st.board[1] = item('a', 3); st.board[2] = item('b', 2); st.bag[0] = item('a', 7);
  let r = C.giveGift(st, 'juni', { board: 0 }, T0, seeded(1));
  assert.ok(r.ok); assert.strictEqual(r.kind, 'love'); assert.strictEqual(r.pts, 8 * 3 + 10); assert.strictEqual(st.board[0], null);
  assert.deepStrictEqual(r.ups.map((u) => u.lv), [1], '34점 → 1단계'); assert.strictEqual(st.coins, D.FRIEND.coins1);
  r = C.giveGift(st, 'juni', { board: 1 }, T0, seeded(1)); assert.strictEqual(r.kind, 'like'); assert.strictEqual(r.pts, 6);
  assert.deepStrictEqual(r.ups.map((u) => u.lv), [2]); assert.strictEqual(st.gems, 3); assert.ok(r.ups[0].letter);
  r = C.giveGift(st, 'juni', { bag: 0 }, T0, seeded(1)); assert.strictEqual(r.kind, 'love'); assert.strictEqual(st.bag[0], null);
  st.board[3] = item('d', 1);
  assert.strictEqual(C.giveGift(st, 'juni', { board: 3 }, T0, seeded(1)).reason, 'day', '하루 3번');
  r = C.giveGift(st, 'mina', { board: 3 }, T0, seeded(1)); assert.strictEqual(r.kind, 'ok'); assert.strictEqual(r.pts, 1);
  assert.strictEqual(C.friendInfo(st, 'juni', T0 + 864e5).left, 3, '다음 날 다시');
  const ups = C.addFriend(st, 'juni', 500, T0, seeded(1));
  assert.deepStrictEqual(ups.map((u) => u.lv), [3, 4, 5]); assert.ok(ups[1].scene && ups[1].gift); assert.strictEqual(ups[2].title, '준이의 단짝');
  assert.ok(st.friend.juni.pendDeco && st.friend.juni.pendOutfit, '그림이 오면 받을 장식·옷 표시');
  C.FRIENDS.filter((k) => k !== 'juni').forEach((k) => C.addFriend(st, k, 500, T0, seeded(1)));
  assert.strictEqual(st.friendAll, D.FRIEND.allTitle);
  const d = emptyState(seeded(4)); const o = d.orders.find((x) => !x.story && !x.ev);
  o.need.forEach((nd, k) => { d.board[k] = item(nd.c, nd.t); });
  const del = C.deliver(d, o.id, T0, seeded(1)); assert.ok(del.ok); assert.strictEqual(d.friend[o.who].pts, D.FRIEND.deliverPts);
  const back = C.deserialize(C.serialize(st), T0, seeded(1)); assert.strictEqual(back.friend.juni.lv, 5);
});
console.log('기록 보호 · 이전 기록 되살리기 (버전이 섞여도 진행이 날아가지 않게)');
// 2지역(몽돌 선착장)까지 간 v3 저장 (옛 버전 모양 그대로)
function v3Area2() {
  const v3 = soAll(C.newState(T0, seeded(11)));
  v3.v = 3; ['look', 'owned', 'outfit', 'mongAcc', 'cam', 'tapDay', 'friend'].forEach((k) => delete v3[k]);
  D.AREAS[0].tasks.forEach((t) => { v3.tasks[t.id] = T0; });
  v3.area = 1; v3.stars = 10; v3.coins = 340; v3.stats.delivered = 40; v3.cover = v3.cover.map(() => 0); v3.updatedAt = T0;
  return v3;
}
test('v3 → v4 바꾸기: 지역·별·작업 그대로 + 바꾸기 전 저장 글을 따로 보관', () => {
  const ls = memStore(); const ad = S.localAdapter(ls);
  const raw = JSON.stringify(v3Area2()); ls.setItem(D.SAVE_KEY, raw);
  const o = S.open(ad, T0 + 1000, seeded(1));
  assert.strictEqual(o.fresh, false); assert.ok(o.migrated); assert.ok(!o.broken);
  assert.strictEqual(o.st.area, 1); assert.strictEqual(o.st.stars, 10); assert.strictEqual(Object.keys(o.st.tasks).length, 6);
  assert.ok(o.st.cover.every((v) => v === 0), '판 모래가 다시 덮이지 않아요');
  const bk = S.backups(ad); assert.strictEqual(bk.length, 1); assert.strictEqual(bk[0].why, 'migrate'); assert.strictEqual(bk[0].data, raw);
  assert.strictEqual(bk[0].sum.area, 1); assert.strictEqual(bk[0].sum.v, 3);
  S.open(ad, T0 + 2000, seeded(1)); assert.strictEqual(S.backups(ad).length, 1, '같은 기록은 한 번만');
  assert.strictEqual(C.deserialize(bk[0].data, T0, seeded(1)).area, 1, '보관본으로 되살릴 수 있어요');
});
test('v4 → v5 (이어진 섬 지도): 옛 코드로 만든 저장 · 작업·모양·별 그대로 · 놓은 장식은 같은 지역 새 자리 · 바꾸기 전 글 보관', () => {
  const raw = require('fs').readFileSync(path.join(__dirname, 'fixtures', 'merge_save_v4.json'), 'utf8');   // HEAD(v4) core.js 로 만든 저장
  const old = JSON.parse(raw);
  assert.strictEqual(old.v, 4);
  const ls = memStore(); const ad = S.localAdapter(ls);
  ls.setItem(D.SAVE_KEY, raw);
  const o = S.open(ad, T0 + 1000, seeded(1));
  assert.ok(o.migrated && !o.broken && !o.fresh);
  const st = o.st;
  assert.strictEqual(st.v, D.VERSION); assert.strictEqual(st.area, old.area); assert.strictEqual(st.stars, old.stars); assert.strictEqual(st.coins, old.coins);
  assert.deepStrictEqual(st.tasks, old.tasks, '작업 id·시각 그대로'); assert.deepStrictEqual(st.look, old.look); assert.deepStrictEqual(st.owned.looks, old.owned.looks);
  assert.strictEqual(st.cam, null, '옛 지도 카메라는 버려요');
  const inBox = (p, id) => { const b = D.TOWN.areas[id].box; return p.wx > b[0] && p.wx < b[2] && p.wy > b[1] && p.wy < b[3]; };
  assert.ok(inBox(st.placed.kite_deco, 'r2'), '옛 2지역(오른쪽 아래 칸) 장식 → 새 2지역');
  assert.ok(inBox(st.placed.f_pine_1, 'r1'), '옛 1지역(왼쪽 아래 칸) 장식 → 새 1지역');
  const bk = S.backups(ad); assert.strictEqual(bk.length, 1); assert.strictEqual(bk[0].why, 'migrate'); assert.strictEqual(bk[0].data, raw);
  const back = C.deserialize(C.serialize(st), T0, seeded(1));
  assert.deepStrictEqual(back.placed, st.placed, '한 번만 옮겨요 (다시 열어도 그대로)');
  assert.strictEqual(C.v4ToMap(99999, -5) !== undefined, true);
  // 새 지도 범위 밖으로는 못 놓아요
  assert.ok(C.placeDeco(st, 'kite_deco', 99999, -50, T0).ok); assert.deepStrictEqual(st.placed.kite_deco, { wx: D.TOWN.map.w - 20, wy: 20 });
});
test('읽지 못하는 저장(망가짐·더 새 버전): 새 판으로 시작하되 지우기 전에 보관 · 처음으로 쳐서 서버 기록이 이겨요', () => {
  const ls = memStore(); const ad = S.localAdapter(ls);
  const future = JSON.stringify(Object.assign(v3Area2(), { v: D.VERSION + 1 }));
  ls.setItem(D.SAVE_KEY, future);
  const o = S.open(ad, T0, seeded(1));
  assert.ok(o.broken && o.newer && o.fresh); assert.strictEqual(o.st.area, 0);
  assert.strictEqual(S.backups(ad)[0].data, future); assert.strictEqual(S.backups(ad)[0].why, 'newer');
  ls.setItem(D.SAVE_KEY, '{"v":3,"board":');
  const o2 = S.open(ad, T0, seeded(1)); assert.ok(o2.broken && !o2.newer && o2.fresh);
  assert.strictEqual(S.backups(ad)[0].why, 'broken'); assert.strictEqual(S.backups(ad).length, 2);
  // 처음 판(fresh) → 서버에 있던 진행 기록을 받아요 (예전엔 새 판이 '더 새것'이라 이겨서 서버까지 덮었어요)
  const remote = C.deserialize(JSON.stringify(v3Area2()), T0, seeded(1));
  o2.st.updatedAt = T0 + 99999;
  assert.strictEqual(S.pickSave(o2.st, remote, o2.fresh), 'remote');
});
test('기기 기록이 더 새것이어도 서버가 지역·작업·부탁 모두 앞서면 바로 덮지 않고 물어봐요', () => {
  const remote = C.deserialize(JSON.stringify(v3Area2()), T0, seeded(1));
  const local = C.newState(T0, seeded(2)); local.updatedAt = T0 + 5000;
  local.stats.delivered = 3;   // 처음부터 다시 몇 번 해 본 판
  assert.strictEqual(S.pickSave(local, remote, false), 'ask');
  local.stats.delivered = 99; assert.strictEqual(S.pickSave(local, remote, false), 'local', '이 폰이 더 많이 했으면 그대로');
  const same = C.deserialize(C.serialize(remote), T0, seeded(1)); same.updatedAt = T0 + 1;
  assert.strictEqual(S.pickSave(same, remote, false), 'local', '같은 진행이면 새것');
});
test('보관함: 처음 판은 안 넣고 · 최근 5개 · 가장 많이 한 기록은 오래돼도 남아요', () => {
  const ad = S.localAdapter(memStore());
  assert.strictEqual(S.backupState(ad, C.newState(T0, seeded(1)), 'reset', T0), false);
  const big = v3Area2(); big.v = D.VERSION; S.backupState(ad, big, 'reset', T0);
  for (let i = 1; i <= 8; i++) { const s2 = C.newState(T0, seeded(i)); s2.stats.delivered = i; S.backupState(ad, s2, 'remote', T0 + i); }
  const list = S.backups(ad);
  assert.strictEqual(list.length, S.BACKUP_MAX);
  assert.strictEqual(list[0].sum.delivered, 8, '가장 최근 것이 맨 앞');
  assert.ok(list.some((b) => b.sum.area === 1 && b.sum.tasks === 6), '2지역 기록은 그대로');
});
test('예전 load() 는 그대로 상태를 돌려줘요 (깨진 저장 → 새 판 + 보관)', () => {
  const ls = memStore(); const ad = S.localAdapter(ls);
  ls.setItem(D.SAVE_KEY, '{망가진');
  assert.strictEqual(S.load(ad, T0, seeded(1)).board.length, 63);
  assert.strictEqual(S.backups(ad)[0].data, '{망가진');
});
console.log('서버 기록 되살리기');
test('시각 글: "11월 1일 오후 3:20" · 자정은 오전 12 · 정오는 오후 12', () => {
  assert.strictEqual(S.koTime(new Date(2026, 10, 1, 15, 20).getTime()), '11월 1일 오후 3:20');
  assert.strictEqual(S.koTime(new Date(2026, 10, 1, 0, 5).getTime()), '11월 1일 오전 12:05');
  assert.strictEqual(S.koTime(new Date(2026, 10, 1, 12, 0).getTime()), '11월 1일 오후 12:00');
});
test('서버 요약 한 줄: 지역 번호·이름 · 그 지역 작업 · 별 · 시각', () => {
  const at = new Date(2026, 10, 1, 15, 20).getTime();
  assert.strictEqual(S.serverBkLine({ ok: true, area: 1, areaDone: 0, areaTotal: 7, tasks: 6, stars: 10, coins: 340, savedAt: at }),
    '2지역 몽돌 선착장 · 작업 0/7 · 별 10 · 동전 340 · 11월 1일 오후 3:20');
  // 서버가 작업 수를 못 줘도 지역 데이터로 채워요
  assert.ok(S.serverBkLine({ ok: true, area: 0, stars: 3, savedAt: at }).startsWith('1지역 바다별채 · 작업 0/6 · 별 3'));
  assert.ok(S.serverBkLine({ ok: true, area: D.AREAS.length, tasks: 41, savedAt: at }).startsWith('모든 지역 완성 · 작업 41곳'));
  assert.ok(S.serverBkLine({ ok: false, savedAt: at }).startsWith('읽지 못한 기록'));
});
test('되살리기: 지금 기록은 이 폰 보관함에 · 고른 기록이 새 시각으로 · 못 읽으면 그대로', () => {
  const ad = S.localAdapter(memStore());
  const cur = C.newState(T0, seeded(3)); cur.stats.delivered = 5; cur.coins = 77;
  const old = v3Area2(); old.v = D.VERSION;
  const out = S.restoreServerBackup(ad, cur, C.serialize(old), T0 + 5000, seeded(1));
  assert.ok(out.ok);
  assert.strictEqual(out.st.area, 1); assert.strictEqual(out.st.stars, 10);
  assert.strictEqual(out.st.updatedAt, T0 + 5000, '서버에 더 새것으로 올라가게');
  const bk = S.backups(ad);
  assert.strictEqual(bk.length, 1); assert.strictEqual(bk[0].why, 'serverbk'); assert.strictEqual(bk[0].sum.coins, 77);
  const bad = S.restoreServerBackup(ad, cur, '{망가진', T0, seeded(1));
  assert.strictEqual(bad.ok, false); assert.strictEqual(S.backups(ad).length, 1, '못 읽으면 보관도 안 해요');
  const nv = S.restoreServerBackup(ad, cur, JSON.stringify({ v: D.VERSION + 1, board: [] }), T0, seeded(1));
  assert.strictEqual(nv.ok, false); assert.strictEqual(nv.newer, true);
});
console.log('판 재미 · 옷장 22벌 (2026-11-02)');
test('옷장: 22벌 · 묶음 5개(+기본) · 일 년 내내 · 전신·초상 그림 · 값은 초반 수입에 맞게 (가장 싼 옷 ≤ 100 · 소라별로도)', () => {
  const ks = Object.keys(D.OUTFITS);
  assert.strictEqual(ks.length, 22);
  const cats = D.OUTFIT_CATS.map((c) => c.id);
  assert.deepStrictEqual(D.OUTFIT_CATS.map((c) => c.name), ['기본 옷', '한복', '요즘 옷', '세련된 옷', '바캉스', '수영복']);
  const fs = require('fs');
  const town = path.join(__dirname, '..', 'static', 'img', 'merge', 'town');
  ks.forEach((k) => {
    const o = D.OUTFITS[k];
    assert.ok(cats.indexOf(o.cat) >= 0, k);
    assert.ok(!o.season, k + ' 일 년 내내');
    assert.ok(fs.existsSync(path.join(town, o.art + '.webp')), o.art);
    if (k !== 'base') {
      assert.ok(o.coins > 0 && o.coins <= 300 && o.gems > 0 && o.gems <= 15, k + ' 값');
      assert.ok(fs.existsSync(path.join(town, o.face + '.webp')), o.face);
      assert.strictEqual(C.outfitState(C.newState(T0, seeded(1)), k, new Date(2026, 0, 5).getTime()), 'buy', k + ' 1월에도');
    }
  });
  ['hanbok', 'daily', 'chic', 'vacance', 'swim'].forEach((c) => assert.ok(ks.some((k) => D.OUTFITS[k].cat === c), c));
  assert.ok(Math.min(...ks.filter((k) => k !== 'base').map((k) => D.OUTFITS[k].coins)) <= 100, '동전 적은 초반에도 한 벌');
  // 몽돌 소품 8개 그림
  Object.keys(D.MONG_ACC).filter((k) => D.MONG_ACC[k].art).forEach((k) => assert.ok(fs.existsSync(path.join(town, D.MONG_ACC[k].art + '.webp')), k));
  assert.strictEqual(Object.keys(D.MONG_ACC).filter((k) => D.MONG_ACC[k].art).length, 8);
  // 사기 → 입기 흐름 그대로 (사기만 · 입기는 따로)
  const st = emptyState(seeded(3)); st.coins = 80;
  assert.strictEqual(C.buyOutfit(st, 'hoodie', 'coins', T0).reason, 'coins');
  assert.ok(C.buyOutfit(st, 'pajamas', 'coins', T0).ok); assert.strictEqual(st.coins, 0); assert.strictEqual(st.outfit, 'base');
  assert.strictEqual(C.outfitState(st, 'pajamas', T0), 'wear');
  assert.ok(C.wearOutfit(st, 'pajamas', T0).ok); assert.strictEqual(C.outfitState(st, 'pajamas', T0), 'worn');
  // 옛 저장(옷 이름이 없어진 것)은 기본으로
  const old = JSON.parse(C.serialize(st)); old.outfit = 'nosuch'; old.owned.outfits.push('nosuch');
  const back = C.deserialize(JSON.stringify(old), T0, seeded(1));
  assert.strictEqual(back.outfit, 'base'); assert.deepStrictEqual(back.owned.outfits, ['base', 'pajamas']);
});
test('거품: 3단계 이상 합치기에서 가끔 · 못 옮김·못 팔기·가방 안 됨 · 하루 3번 무료 · 소라별·동전 · 시간이 지나면 엽전', () => {
  const st = emptyState(seeded(1));
  st.board[0] = item('a', 2); st.board[1] = item('a', 2);
  const r = C.move(st, 0, 1, T0);
  assert.strictEqual(C.maybeBubble(st, r, T0, () => 0.99), null, '운이 없으면 없음');
  const b = C.maybeBubble(st, r, T0, () => 0);
  assert.ok(b && st.board[b.at].k === 'bubble'); assert.deepStrictEqual([st.board[b.at].c, st.board[b.at].t], ['a', 3]);
  assert.strictEqual(C.maybeBubble(st, r, T0, () => 0), null, '한 번에 하나만');
  const low = emptyState(); low.board[0] = item('a', 1); low.board[1] = item('a', 1);
  assert.strictEqual(C.maybeBubble(low, C.move(low, 0, 1, T0), T0, () => 0), null, '2단계 결과는 거품 없음');
  const i = b.at;
  assert.strictEqual(C.move(st, i, 30, T0).kind, 'none', '거품은 못 옮겨요');
  st.board[40] = item('b', 1);
  assert.strictEqual(C.move(st, 40, i, T0).reason, 'bubble', '거품 위로 바꾸기 안 됨');
  assert.strictEqual(C.sell(st, i, T0).ok, false); assert.strictEqual(C.toBag(st, i, T0).ok, false);
  assert.ok(!C.orderStatus(st, { need: [{ c: 'a', t: 3 }] }).cells.includes(i), '부탁에 안 써요');
  const bi = C.bubbleInfo(st, st.board[i], T0);
  assert.strictEqual(bi.free, 3); assert.strictEqual(bi.coins, 8); assert.strictEqual(bi.gems, 1);
  st.coins = 5; assert.strictEqual(C.popBubble(st, i, 'coins', T0).reason, 'coins', '동전 모자람');
  assert.ok(C.popBubble(st, i, 'free', T0).ok); assert.deepStrictEqual(st.board[i], item('a', 3)); assert.strictEqual(st.coins, 5);
  // 하루 무료 3번
  for (let k = 0; k < 2; k++) { st.board[i] = { k: 'bubble', c: 'a', t: 3, until: T0 + 9e4 }; assert.ok(C.popBubble(st, i, 'free', T0).ok); }
  st.board[i] = { k: 'bubble', c: 'a', t: 3, until: T0 + 9e4 };
  assert.strictEqual(C.popBubble(st, i, 'free', T0).reason, 'limit');
  assert.ok(C.popBubble(st, i, 'free', T0 + 864e5).ok, '다음 날 다시');
  st.gems = 1; st.board[i] = { k: 'bubble', c: 'a', t: 3, until: T0 + 9e4 };
  assert.ok(C.popBubble(st, i, 'gems', T0 + 864e5).ok); assert.strictEqual(st.gems, 0);
  // 시간이 다 되면 엽전
  st.board[i] = { k: 'bubble', c: 'a', t: 6, until: T0 + 1000 };
  assert.strictEqual(C.funTick(st, T0, seeded(1)).coins.length, 0);
  const ft = C.funTick(st, T0 + 1000, seeded(1));
  assert.strictEqual(ft.coins.length, 1); assert.deepStrictEqual(st.board[i], item('cn', 2), '높은 단계는 엽전 꾸러미');
  // 저장 왕복 (거품 그대로)
  st.board[i] = { k: 'bubble', c: 'a', t: 3, until: T0 + 9e4 }; st.bag[0] = { k: 'bubble', c: 'a', t: 3, until: 1 };
  const back = C.deserialize(C.serialize(st), T0, seeded(1));
  assert.strictEqual(back.board[i].k, 'bubble'); assert.strictEqual(back.bag[0], null, '가방에 거품은 없어요');
});
test('그물: 부탁을 건네면 가끔 판 위쪽에 · 바로 옆에서 합치면 풀림 · 같은 물건을 겹치면 다음 단계로 풀림 · 2개까지', () => {
  const st = emptyState(seeded(4)); st.stats.delivered = 5;
  const n1 = C.maybeNet(st, T0, () => 0);
  assert.ok(n1 && n1.at < 3 * 7, '위쪽 3줄'); assert.strictEqual(st.board[n1.at].k, 'net');
  const t = st.board[n1.at].t; assert.ok(t >= 2 && t <= 4, '1지역 부탁 단계');
  assert.ok(C.maybeNet(st, T0, () => 0)); assert.strictEqual(C.maybeNet(st, T0, () => 0), null, '2개까지');
  assert.strictEqual(C.maybeNet(emptyState(), T0, () => 0), null, '처음 몇 번은 없음');
  // 바로 옆에서 합치기
  const s2 = emptyState(); s2.board[8] = { k: 'net', c: 'b', t: 4 }; s2.board[9] = item('a', 1); s2.board[20] = item('a', 1);
  assert.strictEqual(C.move(s2, 8, 30, T0).kind, 'none', '그물은 못 옮겨요');
  assert.strictEqual(C.orderStatus(s2, { need: [{ c: 'b', t: 4 }] }).ready, false, '걸린 물건은 부탁에 못 써요');
  assert.strictEqual(C.sell(s2, 8, T0).ok, false);
  const m = C.move(s2, 20, 9, T0);
  assert.strictEqual(m.kind, 'merge'); assert.deepStrictEqual(m.freed.map((f) => f.i), [8]); assert.deepStrictEqual(s2.board[8], item('b', 4));
  // 같은 물건 겹치기
  const s3 = emptyState(); s3.board[3] = { k: 'net', c: 'd', t: 3 }; s3.board[40] = item('d', 3); s3.board[41] = item('d', 2);
  assert.strictEqual(C.move(s3, 41, 3, T0).reason, 'net', '다른 물건은 안 돼요');
  const r = C.move(s3, 40, 3, T0);
  assert.strictEqual(r.kind, 'merge'); assert.ok(r.netMerge); assert.deepStrictEqual(s3.board[3], item('d', 4)); assert.strictEqual(s3.board[40], null);
  // 건네기에서 그물 (운 좋을 때)
  const s4 = emptyState(seeded(2)); s4.stats.delivered = 5; s4.board[60] = item('a', 2);
  s4.orders = [{ id: 'q', who: 'juni', need: [{ c: 'a', t: 2 }], coins: 3, stars: 1, at: T0 }];
  const d = C.deliver(s4, 'q', T0, () => 0.01);
  assert.ok(d.ok && d.net && s4.board[d.net.at].k === 'net');
  const back = C.deserialize(C.serialize(s4), T0, seeded(1)); assert.strictEqual(back.board[d.net.at].k, 'net');
});
test('상자: 선물 상자 5분·보물 궤짝 20분 · 시간이 되면 무료 · 열쇠·소라별로 바로 · 옮기기 가능·팔기 안 됨 · 지역 완성·오늘의 부탁·반짝 손님·상점', () => {
  const st = emptyState(seeded(5)); st.coins = 0; st.gems = 0;
  st.board[10] = C.makeBox('gift', T0);
  assert.strictEqual(C.itemName(st.board[10]), '선물 상자');
  let bi = C.boxInfo(st, st.board[10], T0); assert.strictEqual(bi.ready, false); assert.strictEqual(bi.leftMs, 5 * 60000);
  assert.strictEqual(C.openBox(st, 10, 'time', T0, seeded(1)).reason, 'wait');
  assert.strictEqual(C.openBox(st, 10, 'key', T0, seeded(1)).reason, 'keys');
  assert.strictEqual(C.openBox(st, 10, 'gems', T0, seeded(1)).reason, 'gems');
  assert.strictEqual(C.sell(st, 10, T0).ok, false, '상자는 못 팔아요');
  assert.strictEqual(C.move(st, 10, 11, T0).kind, 'move', '상자는 옮길 수 있어요');
  st.keys = 1;
  const r = C.openBox(st, 11, 'key', T0, seeded(1));
  assert.ok(r.ok); assert.strictEqual(st.keys, 0); assert.ok(r.placed.length >= 2); assert.strictEqual(st.board[11] === null || st.board[11].k !== 'box', true);
  r.placed.forEach((p) => { if (p.cell.k === 'item' && p.cell.c !== 'cn') assert.ok(p.cell.t >= 1 && p.cell.t <= 3); });
  st.board[20] = C.makeBox('chest', T0);
  assert.strictEqual(C.boxInfo(st, st.board[20], T0).leftMs, 20 * 60000);
  const r2 = C.openBox(st, 20, 'time', T0 + 20 * 60000, seeded(2));
  assert.ok(r2.ok); assert.strictEqual(r2.how, 'time'); assert.ok(r2.placed.length >= 3);
  st.gems = 4; st.board[30] = C.makeBox('chest', T0);
  assert.ok(C.openBox(st, 30, 'gems', T0, seeded(3)).ok); assert.strictEqual(st.gems, 0);
  // 가방·저장 왕복
  st.board[30] = C.makeBox('gift', T0); assert.ok(C.toBag(st, 30, T0).ok);
  const back = C.deserialize(C.serialize(st), T0, seeded(1)); assert.ok(back.bag.some((c) => c && c.k === 'box'));
  // 오늘의 부탁 → 열쇠 1
  const q = emptyState(); C.dailyTouch(q, T0); q.daily.claimed = false;
  q.daily.q.forEach((x) => { if (x.kind === 'stat') q.stats[x.stat] = 999; if (x.kind === 'chain') q.daily.del[x.c] = 9; if (x.kind === 'tier') q.daily.maxT = 9; });
  assert.ok(C.claimQuests(q, T0, seeded(1)).ok); assert.strictEqual(q.keys, 1);
  // 상점 열쇠 (동전 · 값 확인)
  const sh = emptyState(); sh.coins = 25;
  const k = C.shopBuy(sh, { id: 'key' }, T0, seeded(1)); assert.ok(k.ok); assert.strictEqual(sh.keys, 1); assert.strictEqual(sh.coins, 0);
});
test('부탁 여러 모양: 묶음 부탁(이야기에 맞는 사람·두 체인) · 반짝 손님(동전 2배+열쇠 · 30분 지나면 벌칙 없이 바뀜) · 선물 상자 부탁', () => {
  const st = soAll(emptyState(seeded(6))); st.area = 2; st.unlocked = ['a', 'b', 'c', 'd', 'e', 'f']; st.orderSeq = 10;
  let mix = 0, rush = 0, gift = 0;
  for (let i = 0; i < 300; i++) {
    st.orders = [];
    const o = C.makeOrder(st, T0, seeded(900 + i));
    const lv = D.AREAS[2].orders.tiers;
    o.need.forEach((x) => assert.ok(x.t >= lv[0] && x.t <= lv[1]));
    if (o.title) {
      mix++;
      const m = D.MIXES.find((x) => x.title === o.title);
      assert.ok(m && m.who === o.who, '묶음 부탁은 그 이야기의 사람'); assert.strictEqual(o.need.length, 2);
      assert.deepStrictEqual(o.need.map((x) => x.c).sort(), m.chains.slice().sort());
    }
    if (o.rush) { rush++; assert.strictEqual(o.rush, T0 + 30 * 60000); assert.strictEqual(o.keys, 1); }
    if (o.box) { gift++; assert.strictEqual(o.box, 'gift'); assert.ok(!o.rush); }
  }
  assert.ok(mix > 20 && rush > 10 && gift > 10, `mix ${mix} rush ${rush} gift ${gift}`);
  // 새 판 처음 몇 장은 보통 부탁
  const fresh = C.newState(T0, seeded(1));
  fresh.orders.forEach((o) => assert.ok(!o.rush && !o.title && !o.box));
  // 반짝 손님 건네기 → 동전 2배 + 열쇠 · 30분 지나면 사라지고 새 부탁 (벌칙 없음)
  const s2 = emptyState(seeded(7));
  s2.board[5] = item('a', 3);
  const ro = { id: 'r1', who: 'juni', need: [{ c: 'a', t: 3 }], coins: 12, stars: 1, at: T0, rush: T0 + 1800000, keys: 1 };
  s2.orders = [ro];
  const d = C.deliver(s2, 'r1', T0, seeded(1)); assert.ok(d.ok); assert.strictEqual(s2.keys, 1); assert.strictEqual(d.keys, 1);
  s2.orders.push({ id: 'r2', who: 'mina', need: [{ c: 'b', t: 3 }], coins: 12, stars: 1, at: T0, rush: T0 + 1000, keys: 1 });
  const coins0 = s2.coins, stars0 = s2.stars;
  const ft = C.funTick(s2, T0 + 1000, seeded(2));
  assert.deepStrictEqual(ft.rushGone.map((o) => o.id), ['r2']); assert.ok(!s2.orders.some((o) => o.id === 'r2'));
  assert.strictEqual(s2.orders.filter((o) => !o.story && !o.ev).length, D.BAL.ordersShown, '새 부탁으로 채움');
  assert.strictEqual(s2.coins, coins0); assert.strictEqual(s2.stars, stars0, '벌칙 없음');
  // 선물 상자 부탁 → 판에 상자
  const s3 = emptyState(seeded(8)); s3.board[5] = item('a', 3);
  s3.orders = [{ id: 'g1', who: 'juni', need: [{ c: 'a', t: 3 }], coins: 6, stars: 1, at: T0, box: 'gift' }];
  const g = C.deliver(s3, 'g1', T0, () => 0.99); assert.ok(g.box && s3.board[g.box.at].k === 'box');
  // 저장 왕복: 부탁 모양 그대로
  s3.orders.push({ id: 'z', who: 'kang', need: [{ c: 'h', t: 3 }], coins: 6, stars: 1, at: T0, rush: T0 + 5, keys: 1, title: '등대 밤샘 준비' });
  const back = C.deserialize(C.serialize(s3), T0, seeded(1)); const z = back.orders.find((o) => o.id === 'z');
  assert.ok(z && z.rush && z.title);
});
test('충전식 발생기: 남은 횟수·쉬는 시간 (충전 링 값)', () => {
  const st = emptyState(seeded(9)); st.settings.easy = true; st.board[0] = { k: 'gen', g: 'gen_c' };
  const ch0 = C.chargeInfo(st, 'gen_c', T0); assert.strictEqual(ch0.left, ch0.max);
  for (let i = 0; i < ch0.max; i++) assert.ok(C.tapGen(st, 0, T0, seeded(i)).ok);
  const ch = C.chargeInfo(st, 'gen_c', T0 + 1000); assert.strictEqual(ch.left, 0); assert.ok(ch.restMs > 0 && ch.restMs <= C.genUpInfo(st, 'gen_c').restMs);
});
test('옛 저장(열쇠·거품 기록 없음)도 그대로 읽어요', () => {
  const st = C.newState(T0, seeded(1)); const o = JSON.parse(C.serialize(st)); delete o.keys; delete o.fun;
  const back = C.deserialize(JSON.stringify(o), T0, seeded(1));
  assert.strictEqual(back.keys, 0); assert.deepStrictEqual(back.fun, { bday: '', bused: 0 });
});
// 서버와 주고받기 (가짜 fetch · 비동기)
const asyncTests = [];
function testAsync(name, fn) { asyncTests.push([name, fn]); }
testAsync('Server.backups / backup: 이 기기 코드로 주소를 만들고 · 오프라인이면 offline', async () => {
  const calls = [];
  const fake = async (url) => { calls.push(url); return { status: 200, json: async () => ({ ok: true, backups: [] }) }; };
  const sv = S.Server(fake, '');
  assert.deepStrictEqual(await sv.backups('abcdefghjkmn'), { ok: true, backups: [] });
  await sv.backup('abcdefghjkmn', 2);
  assert.deepStrictEqual(calls, ['/api/merge/backups?id=abcdefghjkmn', '/api/merge/backup?id=abcdefghjkmn&i=2']);
  const off = S.Server(async () => { throw new Error('x'); }, '');
  assert.strictEqual((await off.backups('abcdefghjkmn')).err, 'offline');
});
(async () => {
  for (const [name, fn] of asyncTests) { await fn(); n++; console.log('  ok', name); }
  console.log(`\n모두 통과 (${n}개)`);
})().catch((e) => { console.error(e); process.exit(1); });
