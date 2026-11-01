/* 머지관 · 저장
   - 1차: 기기 저장 localStorage['arichae_merge_v1'] (JSON 한 칸 · 막힌 브라우저에서도 게임은 그대로 · try/catch)
     행동 뒤 1초 묶어서 저장(schedule) · 화면을 숨기거나 닫을 때 바로 저장(flush)
   - 2차: 서버 저장 (server.py · POST /api/merge/save · GET /api/merge/load?id=…)
     서버 백업 되살리기: GET /api/merge/backups?id=… (요약 목록) · GET /api/merge/backup?id=…&i=N (기록 하나)
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

  /* ---------- 이전 기록 보관 (덮어쓰기 전에 한 벌씩 · 설정 › 이전 기록 되살리기) ----------
     옛 저장을 새 버전으로 바꾸기 전 · 읽지 못한 저장 · 서버/코드/붙여넣기 기록으로 바꾸기 전 · 처음부터 하기 전
     → localStorage['arichae_merge_backup'] 에 [{ at, why, v, sum, data(저장 글 그대로) }] 최근 BACKUP_MAX 개
     (가장 많이 한 기록 하나는 오래돼도 지우지 않아요) */
  const BACKUP_KEY = 'arichae_merge_backup';
  const BACKUP_MAX = 5;
  // 저장 글 → 짧은 요약 (버전이 달라도 · 읽지 못해도 되게 그냥 JSON 에서 꺼내요)
  function rawSummary(raw) {
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return null;
    return { v: typeof o.v === 'number' ? o.v : 0, stars: o.stars | 0, coins: o.coins | 0,
      tasks: o.tasks && typeof o.tasks === 'object' ? Object.keys(o.tasks).length : 0, area: o.area | 0,
      delivered: (o.stats && o.stats.delivered) | 0, updatedAt: +o.updatedAt || 0 };
  }
  const progress = (m) => (m ? m.area * 1e6 + m.tasks * 1e3 + Math.min(999, m.delivered) : -1);
  // 처음 시작한 판(부탁·작업 0)은 보관할 필요 없어요
  const hasProgress = (m) => !!m && (m.tasks > 0 || m.delivered > 0 || m.area > 0);
  function backups(adapter) {
    let a = null;
    try { a = JSON.parse(adapter.read(BACKUP_KEY) || 'null'); } catch (e) { a = null; }
    return Array.isArray(a) ? a.filter((b) => b && typeof b.data === 'string') : [];
  }
  function backupRaw(adapter, raw, why, now) {
    if (typeof raw !== 'string' || !raw) return false;
    const sum = rawSummary(raw);
    if (sum && !hasProgress(sum) && why !== 'broken' && why !== 'newer') return false;
    const list = backups(adapter).filter((b) => b.data !== raw);   // 같은 기록은 한 번만
    list.unshift({ at: now || Date.now(), why: String(why || ''), v: sum ? sum.v : 0, sum, data: raw });
    while (list.length > BACKUP_MAX) {
      let best = 0;
      list.forEach((b, i) => { if (progress(b.sum) > progress(list[best].sum)) best = i; });
      list.splice(best === list.length - 1 ? list.length - 2 : list.length - 1, 1);
    }
    if (adapter.write(BACKUP_KEY, JSON.stringify(list))) return true;
    // 저장소가 꽉 찼으면 가장 많이 한 기록 + 이번 것만이라도
    const best = list.slice(1).reduce((m, b) => (progress(b.sum) > progress(m ? m.sum : null) ? b : m), null);
    return adapter.write(BACKUP_KEY, JSON.stringify(best ? [list[0], best] : [list[0]]));
  }
  const backupState = (adapter, st, why, now) => backupRaw(adapter, C.serialize(st), why, now);

  // 이 폰의 저장 열기 → { st, fresh(새 판), broken(읽지 못해 보관함), newer(더 새 버전의 저장), migrated }
  // 읽지 못한 저장은 지우기 전에 반드시 보관 · 더 새 버전 저장(옛 화면이 남아 있을 때)은 덮어쓰지 않게 newer 로 알려요
  function open(adapter, now, rng) {
    const raw = adapter.read(D.SAVE_KEY);
    if (!raw) return { st: C.newState(now, rng), fresh: true };
    const sum = rawSummary(raw);
    let st = null;
    try { st = C.deserialize(raw, now, rng); } catch (e) { st = null; }
    if (!st) {
      const newer = !!sum && sum.v > D.VERSION;
      backupRaw(adapter, raw, newer ? 'newer' : 'broken', now);
      return { st: C.newState(now, rng), fresh: true, broken: true, newer };
    }
    const migrated = !!sum && sum.v !== D.VERSION;
    if (migrated) backupRaw(adapter, raw, 'migrate', now);
    return { st, fresh: false, migrated };
  }
  function load(adapter, now, rng) { return open(adapter, now, rng).st; }
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
    // 이 폰이 더 새것인데 진행은 서버가 훨씬 앞서요(지역·작업) → 이 폰 기록이 처음으로 돌아간 것일 수 있으니 물어봐요
    if (b.updatedAt <= a.updatedAt) return (b.area > a.area || b.tasks > a.tasks) && (b.delivered > a.delivered) ? 'ask' : 'local';
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
      // 서버 백업 되살리기: 목록(요약만 · 최신 먼저) · 하나 받기 (이 기기의 이어하기 코드로만)
      backups: (id) => call('/api/merge/backups?id=' + encodeURIComponent(id), { cache: 'no-store' }),
      backup: (id, i) => call('/api/merge/backup?id=' + encodeURIComponent(id) + '&i=' + (i | 0), { cache: 'no-store' }),
      beacon(id, st) {
        try {
          if (!root.navigator || !root.navigator.sendBeacon) return false;
          const body = JSON.stringify({ id, updatedAt: st.updatedAt || 0, force: false, data: C.serialize(st) });
          return root.navigator.sendBeacon(B + '/api/merge/save', new Blob([body], { type: 'application/json' }));
        } catch (e) { return false; }
      }
    };
  }

  /* ---------- 서버 백업 되살리기 (설정 › 서버 기록 되살리기) ---------- */
  // "11월 1일 오후 3:20"
  function koTime(ms) {
    const t = new Date(+ms || 0); const h = t.getHours();
    return `${t.getMonth() + 1}월 ${t.getDate()}일 ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${String(t.getMinutes()).padStart(2, '0')}`;
  }
  // 서버 요약 하나 → "2지역 몽돌 선착장 · 작업 0/7 · 별 10 · 동전 340 · 11월 1일 오후 3:20"
  function serverBkLine(s) {
    if (!s || s.ok === false) return `읽지 못한 기록 · ${koTime(s && s.savedAt)}`;
    const AR = D.AREAS, a = Math.max(0, s.area | 0);
    const where = a >= AR.length ? '모든 지역 완성' : `${a + 1}지역 ${(AR[a] && AR[a].name) || s.areaName || ''}`.trim();
    const total = s.areaTotal | 0 || (AR[Math.min(a, AR.length - 1)] || { tasks: [] }).tasks.length;
    const work = a >= AR.length ? `작업 ${s.tasks | 0}곳` : `작업 ${s.areaDone | 0}/${total}`;
    return `${where} · ${work} · 별 ${s.stars | 0} · 동전 ${s.coins | 0} · ${koTime(s.savedAt || s.updatedAt)}`;
  }
  // 고른 서버 기록 글 → 새 상태 (읽지 못하면 { ok:false, newer }) · 바꾸기 전 지금 기록은 이 폰 보관함에 (why 'serverbk')
  function restoreServerBackup(adapter, cur, raw, now, rng) {
    let next = null;
    try { next = C.deserialize(raw, now, rng); } catch (e) { next = null; }
    if (!next) { const m = rawSummary(raw); return { ok: false, newer: !!m && m.v > D.VERSION }; }
    if (cur) backupState(adapter, cur, 'serverbk', now);
    next.updatedAt = now;   // 서버에 '더 새것'으로 올라가게
    return { ok: true, st: next };
  }

  const API = { koTime, serverBkLine, restoreServerBackup, localAdapter, open, load, hasSave, backups, backupRaw, backupState, rawSummary, BACKUP_KEY, BACKUP_MAX, save, Saver, newId, syncInfo, setSyncInfo, prettyId, cleanId, ID_RE, pickSave, Server };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeSave = API;
})(typeof window !== 'undefined' ? window : globalThis);
