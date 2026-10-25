/* 아리채 오락실 · 회귀 RPG 그림 한 곳 (화풍 · 경로 · 불러오기 · 배경 지우기)
   - 그림 경로는 이 파일의 src(id) 하나만 만들어요 → static/img/rpg/<화풍>/<id>.webp
       · 화풍 이름 하나(ART_THEME)만 바꾸면 전체가 바뀌어요 (rpg_story.md 6절 '화풍 확정')
       · 다른 화풍(예: 'oil')에 그 그림이 아직 없으면 기본 화풍('gameart') 그림을 대신 써요 (빈 화면 금지)
       · 화풍 바꾸기 버튼(설정)은 다음 단계예요 → setTheme(name) 이 그 연결 고리예요
   - 인물·적 그림은 어두운 단색 배경이 붙어 있어요 → sprite(id) 가 가장자리 배경을 지우고(색 거리 + 둥근 깃털)
     그림 크기에 맞게 잘라서 캔버스로 돌려줘요. 상자처럼 보이지 않게요.
       · 장면이 통째로 그려진 그림(짐 상자 · 폭풍 문어)은 둥근 비네트로만 부드럽게 녹여요
   - 페이지 위치와 상관없이 쓰려고 이 파일 주소에서 static/ 뿌리를 알아내요 (index.html 의 대기실 · rpg.html 둘 다) */
(function (root) {
  'use strict';

  const ART_THEME_DEFAULT = 'gameart';
  const KEY = 'arichae_rpg_art';
  let theme = ART_THEME_DEFAULT;
  try { const t = localStorage.getItem(KEY); if (t && /^[a-z0-9_-]+$/.test(t)) theme = t; } catch (e) { /* 저장소가 막혀도 기본 화풍 */ }

  // static/ 뿌리 (…/static/js/rpg/art.js → …/static/)
  let ROOT = 'static/';
  try {
    const me = document.currentScript && document.currentScript.src;
    if (me) ROOT = me.replace(/js\/rpg\/art\.js(\?.*)?$/, '');
  } catch (e) { /* 그대로 */ }

  function src(id, th) { return ROOT + 'img/rpg/' + (th || theme) + '/' + id + '.webp'; }

  // 그림마다 다르게 다룰 것 (없으면 '배경 지우기 + 자르기')
  const OPT = {
    e_crates: { mode: 'vignette' },
    e_octopus: { mode: 'vignette' }
  };

  const img = {};       // id → Image (다 읽은 것만)
  const wait = {};      // id → Promise
  const spr = {};       // id → 캔버스 (배경 지운 것)

  function loadOne(id) {
    if (wait[id]) return wait[id];
    wait[id] = new Promise((done) => {
      const tryLoad = (th, fallback) => {
        const im = new Image();
        im.decoding = 'async';
        im.onload = () => { img[id] = im; done(im); };
        im.onerror = () => {
          if (fallback && th !== ART_THEME_DEFAULT) tryLoad(ART_THEME_DEFAULT, false);
          else { console.warn('[rpg-art] 그림을 못 읽었어요:', id); done(null); }
        };
        im.src = src(id, th);
      };
      tryLoad(theme, true);
    });
    return wait[id];
  }
  function preload(ids) { return Promise.all(ids.map(loadOne)); }
  function get(id) { return img[id] || null; }

  const sm = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

  // 배경 지운 그림 (캔버스) — 아직 못 읽었으면 null
  function sprite(id) {
    if (spr[id]) return spr[id];
    const im = img[id];
    if (!im) return null;
    const w = im.naturalWidth || im.width; const h = im.naturalHeight || im.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    const o = OPT[id] || {};
    let data = null;
    try { data = g.getImageData(0, 0, w, h); } catch (e) { data = null; }   // 다른 곳 그림이라 막히면 비네트만
    if (o.mode === 'vignette' || !data) {
      // 둥근 비네트: 가운데는 그대로, 가장자리는 투명하게
      g.globalCompositeOperation = 'destination-in';
      const rg = g.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.3, w / 2, h * 0.48, Math.min(w, h) * 0.52);
      rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      spr[id] = c;
      return c;
    }
    const d = data.data;
    // 배경색 = 네 귀퉁이 띠의 평균
    let br = 0; let bg = 0; let bb = 0; let n = 0;
    const band = Math.max(4, Math.round(w * 0.03));
    for (let y = 0; y < h; y += 4) {
      for (let x = 0; x < w; x += 4) {
        if (x > band && x < w - band && y > band && y < h - band) continue;
        const i = (y * w + x) * 4; br += d[i]; bg += d[i + 1]; bb += d[i + 2]; n++;
      }
    }
    br /= n; bg /= n; bb /= n;
    let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const dx = (x - w / 2) / (w / 2); const dy = (y - h * 0.5) / (h / 2);
        const r = Math.sqrt(dx * dx + dy * dy);
        const dist = Math.sqrt((d[i] - br) ** 2 + (d[i + 1] - bg) ** 2 + (d[i + 2] - bb) ** 2) / 255;
        const key = sm(0.07, 0.2, dist);                 // 배경색과 다르면 남겨요
        const core = 1 - sm(0.32, 0.55, r);              // 한가운데는 조금 남겨요 (어두운 옷에 구멍이 나지 않게)
        const outer = 1 - sm(0.86, 1.0, r);              // 가장자리는 늘 녹여요
        const a = Math.max(key, core * 0.3) * outer;     // 가운데 남은 배경은 옅은 그림자처럼만
        d[i + 3] = Math.round(d[i + 3] * Math.min(1, a));
        if (d[i + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    g.putImageData(data, 0, 0);
    // 그림 크기에 맞게 잘라요 (작게 그려진 대포도 크게 보이게)
    if (x1 > x0 && y1 > y0) {
      const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.06);
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
      const cw = x1 - x0 + 1; const ch = y1 - y0 + 1;
      if (cw < w * 0.97 || ch < h * 0.97) {
        const t = document.createElement('canvas');
        t.width = cw; t.height = ch;
        t.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
        spr[id] = t;
        return t;
      }
    }
    spr[id] = c;
    return c;
  }

  function setTheme(name) {
    if (!name || name === theme) return;
    theme = name;
    try { localStorage.setItem(KEY, name); } catch (e) { /* 이번 접속만 */ }
    Object.keys(img).forEach((k) => { delete img[k]; delete wait[k]; delete spr[k]; });
  }

  root.RpgArt = {
    ART_THEME_DEFAULT,
    get theme() { return theme; },
    get root() { return ROOT; },
    src, load: loadOne, preload, get, sprite, setTheme
  };
})(typeof window !== 'undefined' ? window : globalThis);
