/* 노을언덕 포격대 · 포탄 시간선 (v3.4)
   - 서버 스냅샷(15Hz)의 포탄 위치를 포탄마다 모아 두고, 렌더 시간 k(틱 단위, 소수)로 위치를 구함
   - 두 스냅샷 사이: 선형 보간 + 중력·바람 보정(등가속도 운동이면 정확히 그 곡선)
   - 첫 스냅샷 전: tkshot 의 포구 위치·속도로, 마지막 스냅샷 뒤: 마지막 두 점의 속도로 최대 EXT_K 틱(약 300ms)까지만 외삽, 그 뒤엔 멈춰 둠
   - 착탄(tkboom)·사라짐(tkgone)이 적용되면 remove() 로 즉시 지움
   - 꼬리: 같은 시간 함수로 일정 시간 간격 점을 뽑으므로 프레임이 200ms 밀려도 끊기지 않음
   브라우저(window.TankShells)와 node(module.exports) 둘 다에서 씀(단위 시험). */
(function (root) {
  'use strict';
  function create(opt) {
    const o = opt || {};
    const TICK = o.tickMs || 1000 / 15;
    const GRAV = o.grav != null ? o.grav : 600;
    const EXT_K = o.extK != null ? o.extK : 300 / TICK;   // 외삽 최대 길이(틱)
    const MAX_PTS = 8;
    const tracks = new Map();
    let lastSnapK = null;

    function acc(tr) {
      const dts = TICK / 1000 * (tr.ts || 1);
      const w = tr.w || 0;
      return { ax: w * dts * dts, ay: GRAV * dts * dts, dts };
    }
    function get(sid) {
      const key = String(sid);
      let tr = tracks.get(key);
      if (!tr) {
        tr = { sid: key, own: null, shot: null, pts: [], ts: 1, w: 0, missingK: null, puffK: null };
        tracks.set(key, tr);
      }
      return tr;
    }
    // tkshot: k, 포구 x·y, 속도 vx·vy(px/초), 바람 w, 배속 ts
    function onShot(sid, k, x, y, vx, vy, w, own, ts) {
      const tr = get(sid);
      tr.shot = { k, x, y, vx: vx || 0, vy: vy || 0 };
      if (w != null) tr.w = w;
      if (ts) tr.ts = ts;
      if (own) tr.own = own;
      tr.missingK = null;
      return tr;
    }
    // 스냅샷: sh = [[sid, x, y], ...]
    function onSnap(k, sh, ts, w) {
      const seen = new Set();
      for (let i = 0; i < sh.length; i++) {
        const s = sh[i];
        const tr = get(s[0]);
        seen.add(tr.sid);
        if (ts) tr.ts = ts;
        if (w != null && !tr.shot) tr.w = w;
        const p = tr.pts;
        const last = p[p.length - 1];
        if (last && last.k === k) { last.x = s[1]; last.y = s[2]; }
        else if (!last || last.k < k) { p.push({ k, x: s[1], y: s[2] }); if (p.length > MAX_PTS) p.shift(); }
        tr.missingK = null;
      }
      tracks.forEach((tr) => {
        if (seen.has(tr.sid)) return;
        const bornK = tr.pts.length ? tr.pts[tr.pts.length - 1].k : (tr.shot ? tr.shot.k : -Infinity);
        if (k > bornK && tr.missingK == null) tr.missingK = k;
      });
      if (lastSnapK == null || k > lastSnapK) lastSnapK = k;
    }
    function remove(sid) { tracks.delete(String(sid)); }
    function reset() { tracks.clear(); lastSnapK = null; }
    function birthK(tr) {
      if (tr.shot) return tr.shot.k;
      return tr.pts.length ? tr.pts[0].k : Infinity;
    }
    // 렌더 시간 k 에서의 위치 [x, y, 출처] · 아직 안 쐈으면 null
    function posAt(tr, k) {
      const p = tr.pts, n = p.length, A = acc(tr), sh = tr.shot;
      if (!n) {
        if (!sh || k < sh.k - 0.5) return null;
        const d = Math.min(EXT_K, Math.max(0, k - sh.k));
        return [sh.x + sh.vx * A.dts * d + 0.5 * A.ax * d * d, sh.y + sh.vy * A.dts * d + 0.5 * A.ay * d * d, 'shot'];
      }
      if (k <= p[0].k) {
        if (sh && sh.k < p[0].k && k >= sh.k) {
          const T = p[0].k - sh.k, t = k - sh.k, u = t / T;
          return [sh.x + (p[0].x - sh.x) * u - 0.5 * A.ax * t * (T - t), sh.y + (p[0].y - sh.y) * u - 0.5 * A.ay * t * (T - t), 'shot'];
        }
        const okFrom = sh ? Math.min(sh.k, p[0].k) - 0.5 : p[0].k - 1;
        if (k < okFrom) return null;
        return [p[0].x, p[0].y, 'lerp'];
      }
      for (let i = 0; i < n - 1; i++) {
        const a = p[i], b = p[i + 1];
        if (k >= a.k && k <= b.k) {
          const T = b.k - a.k, t = k - a.k, u = T > 0 ? t / T : 0;
          return [a.x + (b.x - a.x) * u - 0.5 * A.ax * t * (T - t), a.y + (b.y - a.y) * u - 0.5 * A.ay * t * (T - t), 'lerp'];
        }
      }
      // 마지막 스냅샷 뒤: 속도로 짧게 외삽
      const L = p[n - 1];
      let vx = 0, vy = 0;
      if (n >= 2) {
        const P = p[n - 2], T = L.k - P.k;
        vx = (L.x - P.x) / T + 0.5 * A.ax * T;
        vy = (L.y - P.y) / T + 0.5 * A.ay * T;
      } else if (sh) {
        const dk = Math.max(0, L.k - sh.k);
        vx = sh.vx * A.dts + A.ax * dk;
        vy = sh.vy * A.dts + A.ay * dk;
      } else {
        return [L.x, L.y, 'hold'];
      }
      const d = Math.min(EXT_K, k - L.k);
      return [L.x + vx * d + 0.5 * A.ax * d * d, L.y + vy * d + 0.5 * A.ay * d * d, d >= EXT_K ? 'hold' : 'extrap'];
    }
    // 렌더 시간 k 에 보일 포탄 목록 [{sid, x, y, src}] · 오래 안 보인(이벤트 유실) 포탄은 정리
    function list(k) {
      const out = [];
      tracks.forEach((tr, key) => {
        if (tr.missingK != null && k > tr.missingK + 1 + EXT_K) { tracks.delete(key); return; }
        if (lastSnapK != null && tr.pts.length && lastSnapK - tr.pts[tr.pts.length - 1].k > 45) { tracks.delete(key); return; }
        const q = posAt(tr, k);
        if (q) out.push({ sid: tr.sid, x: q[0], y: q[1], src: q[2] });
      });
      return out;
    }
    // 꼬리 점: k 에서 step 틱 간격으로 n 개(새 것 먼저), 쏜 순간 앞으로는 안 감
    function trail(sid, k, n, step) {
      const tr = tracks.get(String(sid));
      if (!tr) return [];
      const b = birthK(tr);
      const out = [];
      for (let j = 0; j < n; j++) {
        const kk = k - j * step;
        if (kk < b) {
          const q = posAt(tr, b);
          if (q && j > 0) out.push([q[0], q[1]]);
          break;
        }
        const q = posAt(tr, kk);
        if (!q) break;
        out.push([q[0], q[1]]);
      }
      return out;
    }
    return {
      onShot, onSnap, remove, reset, list, trail,
      track: (sid) => tracks.get(String(sid)) || null,
      pos: (sid, k) => { const tr = tracks.get(String(sid)); return tr ? posAt(tr, k) : null; },
      birthK: (sid) => { const tr = tracks.get(String(sid)); return tr ? birthK(tr) : null; },
      size: () => tracks.size,
      EXT_K
    };
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.TankShells = api;
})(typeof window !== 'undefined' ? window : null);
