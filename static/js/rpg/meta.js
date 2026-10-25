/* 아리채 오락실 · 회귀 RPG — 내 기기의 회귀 기록 저장 (회차·기억 조각·영구 노드·스킬 기억·★)
   - 이 파일 하나만 저장소를 알아요. 나중에 서버 프로필(기기 아이디)로 옮길 때 load/save 두 함수만 바꾸면 돼요
   - 계산(정산·노드 사기)은 sim.js 의 순수 함수를 써요
   - localStorage 가 막혀 있어도(사생활 보호 모드 등) 게임은 돼요 — 그때는 이번 접속 동안만 기억해요 */
(function () {
  'use strict';

  const Sim = window.RpgSim;
  const KEY = 'arichae_rpg_meta';
  let mem = null;          // 저장이 안 될 때 쓰는 기억
  let cache = null;

  function load() {
    if (cache) return cache;
    let v = null;
    try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { v = mem; }
    cache = Sim.fixMeta(v || mem);
    return cache;
  }
  function save(m) {
    cache = Sim.fixMeta(m);
    mem = cache;
    try { localStorage.setItem(KEY, JSON.stringify(cache)); return true; } catch (e) { return false; }
  }

  // 다른 가족에게 보여줄 내 배지 (서버로 보내요)
  function badge() {
    const m = load();
    return { loop: m.loop, stars: m.stars, clears: m.clears, best: m.bestRoom, first: m.firstClear };
  }

  window.RpgMeta = {
    get: load,
    save,
    // 회귀: 정산하고 저장 → { meta, gained, lines, mem }
    regress(run) {
      const r = Sim.settle(load(), run);
      save(r.meta);
      return r;
    },
    buy(id) {
      const m = JSON.parse(JSON.stringify(load()));
      if (!Sim.buyNode(m, id)) return false;
      save(m);
      return true;
    },
    cost: (id) => Sim.nodeCost(load(), id),
    heroMeta: () => Sim.heroMeta(load()),
    badge,
    reset() { save(Sim.newMeta()); },
    // 시험용: 값 바꾸기
    _set(o) { save(Object.assign(JSON.parse(JSON.stringify(load())), o)); }
  };
})();
