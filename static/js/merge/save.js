/* 머지관 · 저장
   - 1차: 기기 저장 localStorage['arichae_merge_v1'] (JSON 한 칸 · 막힌 브라우저에서도 게임은 그대로 · try/catch)
     행동 뒤 1초 묶어서 저장(schedule) · 화면을 숨기거나 닫을 때 바로 저장(flush)
   - 2차: 서버 저장 (server.py · POST /api/merge/save · GET /api/merge/load?id=…)
     기기마다 '이어하기 코드'(무작위 id)가 있고, 30초마다 바뀐 게 있으면 올려요 · 화면을 숨기면 바로(sendBeacon)
     서버가 꺼져 있거나 오프라인이면 조용히 다음에 다시 · 다른 폰에서는 코드를 넣어 불러와요
   - pickSave: 기기 ↔ 서버 중 어느 쪽을 쓸지 (더 새로운 쪽 · 서로 크게 다르면 'ask' → 화면이 물어봐요) */
(function (root) {
  'use strict';

  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.MergeData;
  const C = (typeof module === 'object' && module.exports) ? require('./core.js') : root.MergeCore;

  // 기본 어댑터: 브라우저 localStorage (없거나 막히면 null)
  function localAdapter(ls) {
    return {
      read(key) { try { return ls ? ls.getItem(key) : null; } catch (e) { return null; } },
      write(key, str) { try { if (ls) ls.setItem(key, str); return !!ls; } catch (e) { return false; } },
      remove(key) { try { if (ls) ls.removeItem(key); } catch (e) { /* 무시 */ } }
    };
  }

  function load(adapter, now, rng) {
    const raw = adapter.read(D.SAVE_KEY);
    const st = raw ? C.deserialize(raw, now, rng) : null;
    return st || C.newState(now, rng);
  }
  const hasSave = (adapter) => !!adapter.read(D.SAVE_KEY);
  function save(adapter, st) { return adapter.write(D.SAVE_KEY, C.serialize(st)); }

  // 1초 묶음 저장기
  function Saver(adapter, getState, delayMs, timers) {
    const T = timers || { set: (f, ms) => setTimeout(f, ms), clear: (h) => clearTimeout(h) };
    let h = null;
    const api = {
      dirty: false,
      schedule() { api.dirty = true; if (h == null) h = T.set(api.flush, delayMs == null ? 1000 : delayMs); },
      flush() {
        if (h != null) { T.clear(h); h = null; }
        if (!api.dirty) return true;
        api.dirty = false;
        return save(adapter, getState());
      }
    };
    return api;
  }

  /* ---------- 이어하기 코드 (서버 저장 칸 이름) ---------- */
  const ID_RE = /^[a-z0-9]{12,32}$/;
  const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';   // 헷갈리는 글자(i l o 0 1) 빼고
  function newId(rand) {
    let s = '';
    for (let i = 0; i < 12; i++) s += ABC[Math.floor((rand ? rand() : Math.random()) * ABC.length) % ABC.length];
    return s;
  }
  function cryptoRand() {
    try {
      const a = new Uint32Array(1);
      root.crypto.getRandomValues(a);
      return a[0] / 4294967296;
    } catch (e) { return Math.random(); }
  }
  // 저장 칸: { id, sentAt(서버에 올린 updatedAt), okAt(마지막 성공 시각) }
  function syncInfo(adapter, rand) {
    let info = null;
    try { info = JSON.parse(adapter.read(D.SYNC_KEY) || 'null'); } catch (e) { info = null; }
    if (!info || !ID_RE.test(info.id || '')) { info = { id: newId(rand || cryptoRand), sentAt: 0, okAt: 0 }; adapter.write(D.SYNC_KEY, JSON.stringify(info)); }
    return info;
  }
  function setSyncInfo(adapter, info) { adapter.write(D.SYNC_KEY, JSON.stringify(info)); }
  const prettyId = (id) => String(id || '').replace(/(.{4})(?=.)/g, '$1-');
  const cleanId = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  /* ---------- 기기 ↔ 서버 고르기 ---------- */
  // local/remote: 상태 객체 (remote 없으면 null) · freshLocal: 이 폰에 저장이 없었음
  function pickSave(local, remote, freshLocal) {
    if (!remote) return 'local';
    if (!local || freshLocal) return 'remote';
    const a = C.summary(local), b = C.summary(remote);
    if (b.updatedAt <= a.updatedAt) return 'local';
    // 서버가 더 새것: 진행이 같거나 앞서면 그냥 서버 · 이 폰이 더 많이 했으면 물어봐요
    const localAhead = a.tasks > b.tasks || a.area > b.area || a.delivered > b.delivered;
    if (!localAhead) return 'remote';
    // 이 폰 쪽은 거의 처음이면(부탁 0 · 작업 0) 서버
    if (a.delivered === 0 && a.tasks === 0) return 'remote';
    return 'ask';
  }

  /* ---------- 서버와 주고받기 ---------- */
  // fetchFn: window.fetch (시험에서는 가짜) · base: '' (같은 주소)
  function Server(fetchFn, base) {
    const B = base || '';
    const f = fetchFn || (root.fetch ? root.fetch.bind(root) : null);
    async function call(url, opts) {
      if (!f) return { ok: false, err: 'nofetch' };
      try {
        const r = await f(B + url, opts);
        let j = null;
        try { j = await r.json(); } catch (e) { j = null; }
        if (!j || typeof j !== 'object') return { ok: false, err: 'http' + r.status };
        return j;
      } catch (e) { return { ok: false, err: 'offline' }; }
    }
    return {
      load: (id) => call('/api/merge/load?id=' + encodeURIComponent(id), { cache: 'no-store' }),
      save: (id, st, force) => call('/api/merge/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ id, updatedAt: st.updatedAt || 0, force: !!force, data: C.serialize(st) })
      }),
      beacon(id, st) {
        try {
          if (!root.navigator || !root.navigator.sendBeacon) return false;
          const body = JSON.stringify({ id, updatedAt: st.updatedAt || 0, force: false, data: C.serialize(st) });
          return root.navigator.sendBeacon(B + '/api/merge/save', new Blob([body], { type: 'application/json' }));
        } catch (e) { return false; }
      }
    };
  }

  const API = { localAdapter, load, hasSave, save, Saver, newId, syncInfo, setSyncInfo, prettyId, cleanId, ID_RE, pickSave, Server };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeSave = API;
})(typeof window !== 'undefined' ? window : globalThis);
