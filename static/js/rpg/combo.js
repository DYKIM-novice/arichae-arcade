/* 아리채 오락실 · 별나침반 1장 — 최대 콤보 (한 번도 안 맞고 이어 간 패링) · 자동 캡처 · 공유 · 명예의 전당
   - 콤보 = ch1.js 의 chain (패링마다 +1 · 맞거나 빨라요/늦어요/색이 달라요/놓쳤어요면 0)
   - 이번 판 최고(run max)를 새로 쓸 때마다 패링 번쩍임 바로 뒤 장면을 작은 캔버스에 복사해 둬요 (가장 최근 최고 한 장만 · JPEG 만들기는 판이 끝날 때 한 번)
   - 판이 끝나면 (쓰러짐 → 여관 · 클리어 → 여관) 최대 콤보가 MIN(10) 이상이면 여관에 '최대 콤보' 카드: 저장 · 공유
       · 명예의 전당에 올리기는 그 회차를 한 번도 안 쓰러지고 '클리어'한 판만 (쓰러진 판은 이 폰 캡처·공유만)
   - 명예의 전당 = 서버 /api/rpg/combo?ch=s1c1 (모든 사람이 같이 봐요 · records.py ComboHall) · 장(章)마다 따로 (뒤 장일수록 콤보가 길어져요)
       서버가 안 되면 이 기기 최고 기록만 보여 주고 공유는 그대로 돼요
   - 이 기기 저장: arichae_rpg_combo = { cid, name, top: {장: 아무 판 최고 숫자}, best: {장: 클리어 판 최고 { combo, loop, g, date, name, img, thumb, up }}, mine: [올린 기록 id] }
   - 위쪽(순수 함수)은 node 시험(tests.js)에서도 불러요 · 아래쪽(화면)은 브라우저에서만 */
(function (root) {
  'use strict';

  const MIN = 10;                 // 카드·명예의 전당 최소 콤보 (서버 records.py COMBO_MIN 과 같아요)
  const IMG_MAX = 150 * 1024;     // 올리는 큰 그림 최대 (서버와 같아요)
  const THUMB_MAX = 24 * 1024;
  const MAX_W = 720;              // 캡처 그림 최대 너비
  const THUMB_W = 180;
  const SNAP_DELAY = 110;         // 패링 번쩍임(흰 화면 2프레임)이 지나고 황금빛 멈춤이 남아 있을 때 찍어요
  const NAME_MAX = 10;
  const API = '/api/rpg/combo';
  const CH = 's1c1';              // 지금 장 (시나리오 1 · 1장)
  const CHAPTERS = [{ id: 's1c1', short: '1장', name: '1장 · 꽃비 항구와 울음곶' }];   // 서버 records.py COMBO_CHAPTERS 와 같아요

  /* ================================================================
     순수 함수 (시험 가능)
     ================================================================ */
  function newRun(loop, g, ch) { return { chain: 0, max: 0, snapN: 0, loop: loop || 1, g: g === 'f' ? 'f' : 'm', ch: ch || CH, died: false, clear: false }; }
  // 판 끝 표시: 쓰러짐(down) · 클리어
  function down(r) { r.died = true; r.chain = 0; }
  function finish(r, clear) { r.clear = !!clear && !r.died; }
  // 명예의 전당에 올릴 수 있는 판? (그 회차를 안 쓰러지고 클리어 · 최대 콤보 MIN 이상)
  function canSubmit(r) { return !!r && r.clear === true && !r.died && r.max >= MIN; }
  // 패링 하나 → 이번 판 최고를 새로 썼으면 true
  function parry(r) {
    r.chain++;
    if (r.chain > r.max) { r.max = r.chain; return true; }
    return false;
  }
  function brk(r) { r.chain = 0; }
  // 지금 장면을 찍을까? (새 최고 · MIN 이상일 때만 · 찍은 것보다 클 때만)
  function wantSnap(r) { return r.chain >= MIN && r.chain === r.max && r.chain > r.snapN; }
  // 판이 끝났을 때 카드를 보여 줄까?
  function showCard(r) { return !!r && r.max >= MIN; }
  // 내 최고 바꾸기 → 새 최고면 true
  function isBetter(best, combo) { return combo >= MIN && (!best || !(best.combo >= combo)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function dateKo(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? `${m[1]}.${Number(m[2])}.${Number(m[3])}` : ''; }
  function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX); }
  function heroLabel(g) { return g === 'f' ? '여자 선장' : '남자 선장'; }
  function capLine(o) { return `${o.name ? o.name + ' · ' : ''}${heroLabel(o.g)} · ${o.loop}회차 · ${dateKo(o.date)}`; }
  function shareText(o, url) { return `별나침반 1장 · 한 번도 안 맞고 최대 콤보 ${o.combo}! (${o.loop}회차)${url ? '\n' + url : ''}`; }
  function fileName(o) { return `byeolnachimban_combo${o.combo}_${String(o.date || dateStr()).replace(/-/g, '')}.jpg`; }
  // dataURL 의 실제 바이트 수
  function dataBytes(u) { const i = String(u || '').indexOf(','); if (i < 0) return 0; const b = u.length - i - 1; return Math.floor(b * 3 / 4) - (u.endsWith('==') ? 2 : u.endsWith('=') ? 1 : 0); }
  // 크기 맞추기 순서: 품질을 내리고, 그래도 크면 크기를 줄여요
  const FIT_STEPS = [[1, 0.8], [1, 0.7], [1, 0.6], [0.8, 0.7], [0.8, 0.55], [0.65, 0.6], [0.5, 0.6], [0.4, 0.5]];
  function fitJpeg(encode, limit) {
    for (const [k, q] of FIT_STEPS) { const u = encode(k, q); if (u && dataBytes(u) <= limit) return u; }
    return null;
  }
  // 서버에 보낼 몸 (서버 records.py ComboHall.submit 과 같은 이름)
  function entryBody(o) {
    return { cid: o.cid, ch: o.ch || CH, clear: o.clear === true, name: cleanName(o.name), combo: o.combo | 0, loop: o.loop | 0, g: o.g === 'f' ? 'f' : 'm', date: o.date, image: o.img, thumb: o.thumb };
  }
  function errText(r) {
    if (!r) return '서버에 연결이 안 돼요 · 기록은 이 폰에 남아 있어요';
    if (r.ok) return `명예의 전당 ${r.rank}위에 올랐어요!`;
    return {
      lower: `이미 더 높은 기록(콤보 ${r.best})이 ${r.rank}위에 올라가 있어요`,
      low: '아쉽게도 순위 안에 못 들었어요',
      rate: '조금 뒤에 다시 올려 주세요',
      range: `콤보 ${MIN} 이상만 올릴 수 있어요`,
      noclear: '안 쓰러지고 클리어한 판만 올릴 수 있어요',
      image: '그림이 너무 커요',
      size: '그림이 너무 커요'
    }[r.err] || '올리지 못했어요 · 잠시 뒤에 다시 해 봐요';
  }

  const pure = { MIN, IMG_MAX, THUMB_MAX, MAX_W, THUMB_W, SNAP_DELAY, NAME_MAX, API, CH, CHAPTERS, newRun, parry, brk, down, finish, canSubmit, wantSnap, showCard, isBetter, dateStr, dateKo, cleanName, heroLabel, capLine, shareText, fileName, dataBytes, fitJpeg, FIT_STEPS, entryBody, errText };

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = pure;
    return;
  }

  /* ================================================================
     이 기기 저장
     ================================================================ */
  const KEY = 'arichae_rpg_combo';
  let store = null;
  function load() {
    if (store) return store;
    try { store = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { store = null; }
    if (!store || typeof store !== 'object') store = {};
    if (!store.cid) store.cid = Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
    if (!Array.isArray(store.mine)) store.mine = [];
    if (!store.top || typeof store.top !== 'object') store.top = {};
    if (!store.best || typeof store.best !== 'object' || store.best.combo != null) store.best = {};   // 장마다
    if (store.name == null) {
      try { const p = JSON.parse(localStorage.getItem('arichae_profile') || 'null'); store.name = cleanName(p && p.name); } catch (e) { store.name = ''; }
    }
    return store;
  }
  function save() {
    const s = load();
    try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) {
      // 저장 공간이 모자라면 큰 그림을 빼고라도 숫자는 남겨요
      try {
        const b = {}; Object.keys(s.best).forEach((k) => { b[k] = Object.assign({}, s.best[k], { img: '' }); });
        localStorage.setItem(KEY, JSON.stringify(Object.assign({}, s, { best: b })));
      } catch (e2) { /* 이번 접속만 */ }
      return false;
    }
  }
  function best(ch) { return load().best[ch || CH] || null; }
  function topN(ch) { return load().top[ch || CH] || 0; }

  /* ================================================================
     캡처 (게임 캔버스 → 작은 캔버스 · 판이 끝나면 글씨를 얹어 JPEG)
     ================================================================ */
  let snapC = null;
  let snapInfo = null;      // { combo, loop, g, date }
  function resetSnap() { snapInfo = null; }
  // cv: 게임 캔버스 · cssH: 위에서부터 찍을 높이(CSS px · 버튼 판 위까지) · dpr
  function snap(cv, cssH, dpr, info) {
    try {
      const sh = Math.max(1, Math.min(cv.height, Math.round(cssH * dpr)));
      const k = Math.min(1, MAX_W / cv.width);
      const w = Math.round(cv.width * k); const h = Math.round(sh * k);
      if (!snapC) snapC = document.createElement('canvas');
      if (snapC.width !== w || snapC.height !== h) { snapC.width = w; snapC.height = h; }
      const g = snapC.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.drawImage(cv, 0, 0, cv.width, sh, 0, 0, w, h);
      snapInfo = Object.assign({}, info);
      return true;
    } catch (e) { return false; }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // 캡처 + 글씨: "별나침반 · 최대 콤보 N" · 선장 초상 · 이름 · 회차 · 날짜
  function compose(info, portrait) {
    if (!snapC || !snapInfo) return null;
    const W = snapC.width; const H = snapC.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(snapC, 0, 0);
    const u = Math.max(0.55, Math.min(1.4, W / 520));
    const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
    // 아래 띠
    const bandH = Math.round(118 * u);
    const grd = g.createLinearGradient(0, H - bandH * 1.5, 0, H);
    grd.addColorStop(0, 'rgba(4,7,16,0)'); grd.addColorStop(0.45, 'rgba(4,7,16,.78)'); grd.addColorStop(1, 'rgba(4,7,16,.94)');
    g.fillStyle = grd; g.fillRect(0, H - bandH * 1.5, W, bandH * 1.5);
    // 초상 (동그라미)
    const pr = Math.round(40 * u); const px = Math.round(16 * u) + pr; const py = H - Math.round(16 * u) - pr;
    g.save();
    g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.closePath();
    const pg = g.createRadialGradient(px, py - pr * 0.3, 2, px, py, pr);
    pg.addColorStop(0, '#2a3654'); pg.addColorStop(1, '#0b1020');
    g.fillStyle = pg; g.fill();
    g.clip();
    if (portrait) {
      const k = Math.max((pr * 2) / portrait.width, (pr * 2) / portrait.height) * 1.05;
      const w = portrait.width * k; const h = portrait.height * k;
      g.drawImage(portrait, px - w / 2, py - pr, w, h);
    }
    g.restore();
    g.lineWidth = Math.max(2, 3 * u); g.strokeStyle = '#ffd25a';
    g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.stroke();
    // 글씨
    const tx = px + pr + Math.round(14 * u);
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#ffe9b0';
    g.font = `800 ${Math.round(15 * u)}px ${FONT}`;
    g.fillText('별나침반 · 1장', tx, py - pr * 0.42);
    g.font = `900 ${Math.round(34 * u)}px ${FONT}`;
    g.lineWidth = Math.max(3, 5 * u); g.strokeStyle = '#4a2a00'; g.lineJoin = 'round';
    const big = `최대 콤보 ${info.combo}`;
    g.strokeText(big, tx, py + pr * 0.38); g.fillStyle = '#ffd25a'; g.fillText(big, tx, py + pr * 0.38);
    g.font = `700 ${Math.round(14 * u)}px ${FONT}`;
    g.fillStyle = '#e8eefb';
    let line = capLine(info);
    const maxW = W - tx - 12 * u;
    while (line.length > 4 && g.measureText(line).width > maxW) line = line.slice(0, -2) + '…';
    g.fillText(line, tx, py + pr * 0.95);
    // 위 오른쪽 작은 배지
    g.font = `900 ${Math.round(13 * u)}px ${FONT}`;
    const bt = '한 번도 안 맞고!';
    const bw = g.measureText(bt).width + 18 * u; const bh = 26 * u;
    roundRect(g, W - bw - 12 * u, 12 * u, bw, bh, bh / 2);
    g.fillStyle = 'rgba(6,10,22,.72)'; g.fill();
    g.fillStyle = '#ffe9b0'; g.fillText(bt, W - bw - 12 * u + 9 * u, 12 * u + bh * 0.68);
    return c;
  }
  function encodeFit(c, limit) {
    return fitJpeg((k, q) => {
      if (k >= 1) return c.toDataURL('image/jpeg', q);
      const t = document.createElement('canvas');
      t.width = Math.max(1, Math.round(c.width * k)); t.height = Math.max(1, Math.round(c.height * k));
      const g = t.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(c, 0, 0, t.width, t.height);
      return t.toDataURL('image/jpeg', q);
    }, limit);
  }
  function thumbOf(c) {
    const t = document.createElement('canvas');
    const k = THUMB_W / c.width;
    t.width = THUMB_W; t.height = Math.max(1, Math.round(c.height * k));
    const g = t.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(c, 0, 0, t.width, t.height);
    return fitJpeg((kk, q) => {
      if (kk >= 1) return t.toDataURL('image/jpeg', q);
      const s = document.createElement('canvas'); s.width = Math.round(t.width * kk); s.height = Math.round(t.height * kk);
      s.getContext('2d').drawImage(t, 0, 0, s.width, s.height);
      return s.toDataURL('image/jpeg', q);
    }, THUMB_MAX);
  }
  function blobOf(dataUrl) {
    const i = dataUrl.indexOf(',');
    const bin = atob(dataUrl.slice(i + 1));
    const a = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k);
    return new Blob([a], { type: 'image/jpeg' });
  }

  /* ================================================================
     저장 · 공유
     ================================================================ */
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function siteUrl() { try { return location.origin + '/'; } catch (e) { return ''; } }
  async function copyText(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) { /* 아래로 */ }
    try {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }
  // 공유: 그림 파일까지 되는 폰이면 공유 창 · 아니면 그림 저장 + 글 복사 → 알림 글을 돌려줘요
  async function share(o, blob) {
    const text = shareText(o, siteUrl());
    try {
      const file = new File([blob], fileName(o), { type: 'image/jpeg' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '별나침반 · 최대 콤보 ' + o.combo, text });
        return '공유했어요!';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return '';
    }
    download(blob, fileName(o));
    const ok = await copyText(text);
    return ok ? '그림을 저장하고 자랑 글을 복사했어요 · 붙여 넣어 보내요!' : '그림을 저장했어요';
  }

  /* ================================================================
     서버 (명예의 전당) — 안 되면 null
     ================================================================ */
  async function fetchTop(ch) {
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tm = ctl ? setTimeout(() => ctl.abort(), 7000) : 0;
      const r = await fetch(API + '?ch=' + encodeURIComponent(ch || CH), { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      clearTimeout(tm);
      if (!r.ok) return null;
      const j = await r.json();
      return j && Array.isArray(j.rows) ? j : null;
    } catch (e) { return null; }
  }
  async function submit(o) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entryBody(Object.assign({ cid: load().cid }, o))) });
      let j = null;
      try { j = await r.json(); } catch (e) { j = null; }
      return j || (r.status === 429 ? { ok: false, err: 'rate' } : { ok: false, err: 'http' });
    } catch (e) { return null; }
  }

  /* ================================================================
     화면: 여관 '최대 콤보' 카드 · 명예의 전당 · 크게 보기
     ================================================================ */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let ctx = { portrait: () => null, sfx: () => {} };
  let card = null;          // 이번 여관 카드 { ch, clear, combo, loop, g, date, img, thumb, composedName }
  let hallCh = CH;          // 명예의 전당에서 보고 있는 장

  function makeImages(info) {
    const c = compose(info, ctx.portrait(info.g));
    if (!c) return null;
    const img = encodeFit(c, IMG_MAX);
    const thumb = thumbOf(c);
    return img && thumb ? { img, thumb } : null;
  }
  function curName() { const el = $('ccName'); return cleanName(el ? el.value : load().name); }
  function ensureCardName() {
    // 이름을 바꿨으면 그림 글씨도 다시 써요
    const nm = curName();
    if (!card || card.composedName === nm) return;
    const im = makeImages(Object.assign({}, card, { name: nm }));
    if (im) { card.img = im.img; card.thumb = im.thumb; card.composedName = nm; $('ccImg').src = card.img; }
    const s = load(); s.name = nm;
    const b = s.best[card.ch];
    if (card.clear && b && b.date === card.date && b.combo === card.combo && !b.up) { b.img = card.img; b.thumb = card.thumb; b.name = nm; }
    save();
  }
  function msg(t) { const el = $('ccMsg'); if (el) el.textContent = t || ''; }

  // 판이 끝나면 (ch1.js showInn) — run: newRun 결과 · 카드를 보였으면 true
  function endRun(run) {
    const box = $('comboCard');
    card = null;
    if (box) box.classList.add('hide');
    if (!showCard(run)) return false;
    const s = load();
    const ok = canSubmit(run);
    const info = { ch: run.ch || CH, clear: ok, combo: run.max, loop: run.loop, g: run.g, date: dateStr(), name: s.name || '' };
    // 찍어 둔 장면이 이번 최고와 같은 숫자면 그대로 · 아니면(찍기 실패 등) 그림 없이
    let im = null;
    if (snapInfo && snapInfo.combo === run.max) im = makeImages(info);
    card = Object.assign({}, info, im || { img: '', thumb: '' }, { composedName: info.name });
    // 내 최고 숫자 (아무 판) · 명예의 전당용 최고 (안 쓰러지고 클리어한 판만 · 그림까지)
    const was = s.top[info.ch] || 0;
    const isTop = run.max > was;
    if (isTop) s.top[info.ch] = run.max;
    if (ok && isBetter(s.best[info.ch], run.max)) s.best[info.ch] = { ch: info.ch, clear: true, combo: card.combo, loop: card.loop, g: card.g, date: card.date, name: card.name, img: card.img, thumb: card.thumb, up: '' };
    save();
    if (!box) return true;
    $('ccN').textContent = 'x' + run.max;
    $('ccBest').textContent = isTop ? (was ? `내 최고 새 기록! (전 ${was})` : '내 최고 기록!') : `내 최고 ${was}`;
    $('ccBest').classList.toggle('new', isTop);
    const imEl = $('ccImg');
    if (card.img) { imEl.src = card.img; imEl.classList.remove('hide'); } else { imEl.removeAttribute('src'); imEl.classList.add('hide'); }
    $('ccName').value = s.name || '';
    ['ccSave', 'ccShare'].forEach((id) => { $(id).disabled = !card.img; });
    $('ccUp').classList.toggle('hide', !ok);
    $('ccUp').disabled = !card.img; $('ccUp').textContent = '명예의 전당에 올리기';
    $('ccNameRow').classList.toggle('hide', !ok);
    $('ccRule').classList.toggle('hide', ok);
    msg(card.img ? '' : '이번 판 장면을 찍지 못했어요');
    box.classList.remove('hide');
    return true;
  }

  async function onSave() {
    if (!card || !card.img) return;
    ensureCardName();
    ctx.sfx();
    download(blobOf(card.img), fileName(card));
    msg('그림을 저장했어요');
  }
  async function onShare() {
    if (!card || !card.img) return;
    ensureCardName();
    ctx.sfx();
    const t = await share(card, blobOf(card.img));
    if (t) msg(t);
  }
  async function upload(o, btn, out) {
    btn.disabled = true; const label = btn.textContent; btn.textContent = '올리는 중…';
    const r = await submit(o);
    out(errText(r));
    if (r && r.ok) {
      const s = load();
      s.mine = s.mine.concat(r.entry.id).slice(-20);
      const b = s.best[o.ch || CH];
      if (b && b.combo === o.combo && b.date === o.date) b.up = r.entry.id;
      save();
      btn.textContent = `${r.rank}위로 올라갔어요`;
      return r;
    }
    btn.disabled = false; btn.textContent = label;
    return r;
  }
  async function onUp() {
    if (!card || !card.img || !card.clear) return;
    ensureCardName();
    ctx.sfx();
    const r = await upload(Object.assign({}, card, { name: curName() }), $('ccUp'), msg);
    if (r && r.ok) setTimeout(() => openHall(r.entry.id, card ? card.ch : CH), 700);
  }

  /* ---------- 명예의 전당 (장마다 따로 · 위에 장 고르기) ---------- */
  let hallRows = [];
  let hallSeq = 0;
  function renderTabs(list) {
    const box = $('fameTabs');
    if (!box) return;
    box.innerHTML = (list || CHAPTERS).map((c) => {
      const loc = CHAPTERS.find((x) => x.id === c.id);
      return `<button type="button" class="fm-tab${c.id === hallCh ? ' on' : ''}" data-ch="${esc(c.id)}">${esc(loc ? loc.short : c.name)}</button>`;
    }).join('');
  }
  async function openHall(focusId, ch) {
    const el = $('fame');
    if (!el) return;
    if (ch) hallCh = ch;
    el.classList.remove('hide');
    el.scrollTop = 0;
    const meta = CHAPTERS.find((x) => x.id === hallCh);
    $('fameCh').textContent = meta ? meta.name : hallCh;
    renderTabs();
    renderMine();
    const list = $('fameList');
    list.innerHTML = '<li class="fm-empty">불러오는 중…</li>';
    const seq = ++hallSeq;
    const j = await fetchTop(hallCh);
    if (seq !== hallSeq) return;
    if (!j) {
      hallRows = [];
      list.innerHTML = '<li class="fm-empty">명예의 전당 서버에 연결이 안 돼요<br><small>내 최고 기록은 이 폰에 남아 있고, 공유도 돼요</small></li>';
      return;
    }
    if (Array.isArray(j.chapters) && j.chapters.length) renderTabs(j.chapters);
    hallRows = j.rows;
    const mine = load().mine;
    if (!hallRows.length) { list.innerHTML = `<li class="fm-empty">아직 아무도 없어요<br><small>한 번도 안 쓰러지고 클리어하면서 콤보 ${j.min || MIN} 이상이면 첫 주인공!</small></li>`; return; }
    list.innerHTML = hallRows.map((r, i) => `
      <li><button type="button" class="fm-row${mine.indexOf(r.id) >= 0 ? ' me' : ''}${r.id === focusId ? ' focus' : ''}" data-i="${i}">
        <span class="fm-rank r${r.rank}">${r.rank}</span>
        <img class="fm-th" src="${esc(r.thumb)}" alt="" loading="lazy">
        <span class="fm-who"><b>${esc(r.name)}</b><small>${esc(heroLabel(r.g))} · ${r.loop | 0}회차 · ${esc(dateKo(r.date))}</small></span>
        <span class="fm-n">x${r.combo | 0}</span>
      </button></li>`).join('');
    const f = list.querySelector('.focus');
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'center' });
  }
  function closeHall() { const el = $('fame'); if (el) el.classList.add('hide'); closeBig(); }
  function renderMine() {
    const box = $('fameMine');
    if (!box) return;
    const b = best(hallCh);
    const t = topN(hallCh);
    if (!b) {
      box.innerHTML = `<div class="fm-mine none">${t ? `내 최고 콤보 x${t} · ` : ''}명예의 전당에는 한 번도 안 쓰러지고 클리어한 판의 최대 콤보(${MIN} 이상)가 올라가요</div>`;
      return;
    }
    box.innerHTML = `<button type="button" class="fm-mine" data-mine="1">
      ${b.thumb ? `<img class="fm-th" src="${esc(b.thumb)}" alt="">` : ''}
      <span class="fm-who"><b>내 클리어 최고</b><small>${esc(heroLabel(b.g))} · ${b.loop | 0}회차 · ${esc(dateKo(b.date))}${b.up ? ' · 올렸어요' : ' · 눌러서 올리기'}</small></span>
      <span class="fm-n">x${b.combo | 0}</span></button>`;
  }
  /* ---------- 크게 보기 ---------- */
  let bigCur = null;
  function openBig(o) {
    bigCur = o;
    const el = $('fameBig');
    $('fbImg').src = o.img || o.thumb || '';
    $('fbCap').textContent = `${o.name ? o.name + ' · ' : ''}최대 콤보 ${o.combo} · ${heroLabel(o.g)} · ${o.loop}회차 · ${dateKo(o.date)}`;
    $('fbMsg').textContent = '';
    const canUp = !!(o.local && !o.up && o.hasImg);
    $('fbUp').classList.toggle('hide', !canUp);
    $('fbUp').disabled = false; $('fbUp').textContent = '명예의 전당에 올리기';
    el.classList.remove('hide');
  }
  function closeBig() { const el = $('fameBig'); if (el) el.classList.add('hide'); bigCur = null; }
  async function bigBlob() {
    const o = bigCur;
    if (!o) return null;
    if (o.img && o.img.startsWith('data:')) return blobOf(o.img);
    try { const r = await fetch(o.img); if (r.ok) return await r.blob(); } catch (e) { /* 아래로 */ }
    return o.thumb ? blobOf(o.thumb) : null;
  }
  async function onBigShare() {
    ctx.sfx();
    const b = await bigBlob(); if (!b) { $('fbMsg').textContent = '그림을 불러오지 못했어요'; return; }
    const t = await share(bigCur, b); if (t) $('fbMsg').textContent = t;
  }
  async function onBigSave() {
    ctx.sfx();
    const b = await bigBlob(); if (!b) { $('fbMsg').textContent = '그림을 불러오지 못했어요'; return; }
    download(b, fileName(bigCur)); $('fbMsg').textContent = '그림을 저장했어요';
  }
  async function onBigUp() {
    const b = best(hallCh);
    if (!b || !b.img || !b.clear) return;
    ctx.sfx();
    const r = await upload(Object.assign({}, b, { ch: hallCh, name: b.name || load().name }), $('fbUp'), (t) => { $('fbMsg').textContent = t; });
    if (r && r.ok) { renderMine(); setTimeout(() => { closeBig(); openHall(r.entry.id, hallCh); }, 700); }
  }

  // ch1.js 가 한 번 불러요 · o = { portrait(g) → 캔버스, sfx() }
  function init(o) {
    ctx = Object.assign(ctx, o || {});
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on('ccSave', 'click', onSave);
    on('ccShare', 'click', onShare);
    on('ccUp', 'click', onUp);
    on('ccName', 'change', () => { const s = load(); s.name = curName(); save(); });
    on('fameClose', 'click', () => { ctx.sfx(); closeHall(); });
    on('fbClose', 'click', () => { ctx.sfx(); closeBig(); });
    on('fbShare', 'click', onBigShare);
    on('fbSave', 'click', onBigSave);
    on('fbUp', 'click', onBigUp);
    on('fameBig', 'click', (e) => { if (e.target.id === 'fameBig') closeBig(); });
    on('fameList', 'click', (e) => { const b = e.target.closest('.fm-row'); if (b) { ctx.sfx(); openBig(hallRows[Number(b.dataset.i)]); } });
    on('fameMine', 'click', (e) => { if (e.target.closest('[data-mine]')) { const b = best(hallCh); if (b) { ctx.sfx(); openBig(Object.assign({ local: true, hasImg: !!b.img }, b, { img: b.img || b.thumb })); } } });
    on('fameTabs', 'click', (e) => { const b = e.target.closest('.fm-tab'); if (b && b.dataset.ch !== hallCh) { ctx.sfx(); openHall('', b.dataset.ch); } });
  }

  root.RpgCombo = Object.assign({}, pure, {
    init, snap, resetSnap, endRun, openHall, closeHall, best, topN, load, fetchTop, submit, compose, snapState: () => snapInfo, cardState: () => card
  });
})(typeof window !== 'undefined' ? window : globalThis);
