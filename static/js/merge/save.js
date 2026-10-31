/* 머지관 · 저장 (기기 저장 1차)
   - localStorage['arichae_merge_v1'] 에 JSON 한 칸 · 막힌 브라우저(사생활 모드 등)에서도 게임은 그대로 돼요(try/catch)
   - 행동 뒤 1초 묶어서 저장(schedule) · 화면을 숨기거나 닫을 때 바로 저장(flush)
   - 서버 저장(2단계)은 같은 모양의 어댑터 { read(key), write(key, str) } 를 하나 더 붙이면 돼요 */
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

  const API = { localAdapter, load, save, Saver };
  if (typeof module === 'object' && module.exports) module.exports = API;
  else root.MergeSave = API;
})(typeof window !== 'undefined' ? window : globalThis);
