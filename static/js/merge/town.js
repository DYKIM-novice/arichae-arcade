/* 머지관 · 「소라섬 등불 이야기」 마을 화면 (복원 작업 · 전/후 배경 · 이야기 장면)
   - [마을] 버튼(또는 별 칩) → 지금 지역 그림 + 작업 목록 · 별로 [고치기]
   - 작업을 끝내면 그 자리를 중심으로 '후' 배경이 동그랗게 번져 나와요 (CSS 마스크 · 작업별 그림 없음)
   - 지역을 다 고치면 전체가 환하게 → 이야기 → [다음 지역으로] (새 발생기는 판에, 자리 없으면 선물함)
   - 그림이 없으면: '전'만 있으면 같은 그림에 색 바꾸기, 둘 다 없으면 색 풍경 (data.js 의 sky·sea)
   - 숨은 비밀: 편지 조각(반짝이)·갈매기·병 속 편지를 그림에서 톡 · 몽돌이 칩이 근처 편지를 알려 줘요
   - ‹ › 로 이미 고친 지역도 다시 볼 수 있어요 (비밀 찾기·장식 놓기) · 장식은 그림을 톡 해서 놓아요
   - 이야기 부탁(req)이 남은 작업은 [고치기] 대신 '부탁 먼저' · 6지역을 다 고치면 엔딩 장면
   - 규칙은 MergeCore(doTask·areaInfo·secretsIn·findSecret·placeDeco), 화면 손잡이는 window.MergeUI 를 써요 */
(function () {
  'use strict';

  const D = window.MergeData, C = window.MergeCore, A = window.MergeArt, F = window.MergeFx, U = window.MergeUI;
  if (!U) return;
  const $ = (id) => document.getElementById(id);
  const esc = U.esc;
  const IMG_RATIO = 720 / 1274;          // 배경 그림 가로/세로 (merge_art.py: 세로 720 폭)
  let playing = false;                    // 고치기 움직임·장면 중엔 다른 조작 막음
  let anim = 0;

  const st = () => U.state;
  let hold = null;                        // 방금 다 고친 지역 (다음 지역으로 넘어가기 전까지 그 그림을 보여 줘요)
  let browse = null;                      // ‹ › 로 보는 지난 지역 번호 (null = 지금 지역)
  let placing = null;                     // 장식 놓는 중 (장식 id)
  function pastView(area) {
    const tasks = area.tasks.map((t) => ({ task: t, done: true, next: false }));
    return { area, show: area, index: D.AREAS.indexOf(area), finished: false, tasks, doneN: tasks.length, total: tasks.length, next: null, canAfford: false, past: true };
  }
  function view() {
    if (hold) return pastView(hold);
    if (browse != null && browse < Math.min(st().area, D.AREAS.length)) return pastView(D.AREAS[browse]);
    return C.areaInfo(st());
  }
  // 볼 수 있는 지역 번호들 (열린 곳까지)
  const reachable = () => Math.min(st().area, D.AREAS.length - 1);

  /* ---------- 그림 층 ---------- */
  function layers(area) {
    const b = A.src(area.bg.before), a = A.src(area.bg.after);
    const sky = `linear-gradient(180deg, ${area.sky[0]} 0%, ${area.sky[1]} 58%, ${area.sea} 58.5%, ${area.sea} 100%)`;
    const pic = (src, cls) => src ? `<img class="tw-img ${cls}" src="${esc(src)}" alt="" draggable="false">`
      : `<div class="tw-img tw-paint ${cls}" style="background:${sky}"><span>${esc(area.name)}</span></div>`;
    // 전: 있으면 그대로, 없으면 후 그림(또는 색 풍경)을 바랜 색으로
    const before = b ? pic(b, 'before') : pic(a, 'before ruin');
    // 후: 있으면 그대로, 없으면 전 그림(또는 색 풍경)을 환하게
    const after = a ? pic(a, 'after') : pic(b, 'after bright');
    return before + after;
  }
  function frameGeom(area) {
    const v = area.view || [0, 1];
    return { y0: v[0], span: v[1] - v[0] };
  }
  function pinPos(area, t) {
    const g = frameGeom(area);
    return { left: t.x, top: ((t.y / 100 - g.y0) / g.span) * 100 };
  }

  /* ---------- 숨은 비밀 · 장식 ---------- */
  function secretsHTML(area, idx) {
    if (hold) return '';
    return C.secretsIn(st(), idx, Date.now()).map((x) => {
      const p = pinPos(area, x);
      if (p.top < 2 || p.top > 98) return '';
      const inner = x.kind === 'gull' ? U.artImg('secret_seagull', '갈매기') : x.kind === 'bottle' ? U.artImg('secret_bottle', '병 속 편지') : '<span class="tw-glint" aria-hidden="true">✦</span>';
      const label = x.kind === 'gull' ? '숨은 갈매기' : x.kind === 'bottle' ? '병 속 편지' : '반짝이는 곳';
      return `<button type="button" class="tw-sec ${x.kind}" data-sec="${x.kind}:${x.id}" style="left:${p.left}%;top:${p.top}%" aria-label="${label}">${inner}</button>`;
    }).join('');
  }
  function decosHTML(area, idx) {
    const s = st();
    return Object.keys(s.placed || {}).filter((id) => s.placed[id].a === idx && s.decos.indexOf(id) >= 0).map((id) => {
      const p = pinPos(area, s.placed[id]);
      return `<span class="tw-deco" style="left:${p.left}%;top:${p.top}%">${U.artImg(id, '장식')}</span>`;
    }).join('');
  }
  function decoBarHTML(idx) {
    const s = st();
    const own = s.decos.filter((id) => id !== 'mongdol_hat' && A.has(id));
    if (!own.length || hold) return '';
    return `<div class="tw-decos"><span>장식</span>${own.map((id) => {
      const here = s.placed[id] && s.placed[id].a === idx;
      return `<button type="button" class="tw-db${placing === id ? ' on' : ''}${here ? ' here' : ''}" data-deco="${id}" aria-label="장식 놓기">${U.artImg(id, '장식')}</button>`;
    }).join('')}<small>${placing ? '그림에서 놓을 곳을 톡 · 다시 누르면 치우기' : '누르고 그림을 톡 하면 놓여요'}</small></div>`;
  }
  // 몽돌이: 이 지역에 못 찾은 편지 조각이 있으면 꼬리를 흔들어요
  function mongdolHTML(idx) {
    const v = D.VILLAGERS.mongdol;
    const near = !hold && C.secretsIn(st(), idx, Date.now()).some((x) => x.kind === 'letter');
    const hat = st().decos.indexOf('mongdol_hat') >= 0;
    return `<button type="button" class="tw-mong${near ? ' wag' : ''}${hat ? ' hat' : ''}" data-tw="mong" aria-label="몽돌이${near ? ' · 근처에 편지가 있대요' : ''}">${U.faceHTML(v, near ? 'joy' : null)}</button>`;
  }

  /* ---------- 마스크 (끝낸 작업 자리마다 동그라미) ---------- */
  function maskCSS(area, grow) {
    const fw = $('tw-frame') ? $('tw-frame').clientWidth : 300;
    const parts = [];
    area.tasks.forEach((t) => {
      let k = st().tasks[t.id] ? 1 : 0;
      if (grow && grow.id === t.id) k = grow.k;
      if (k <= 0) return;
      const R = Math.max(1, (t.r / 100) * fw * k);
      parts.push(`radial-gradient(circle ${R.toFixed(1)}px at ${t.x}% ${t.y}%, #000 ${(R * 0.62).toFixed(1)}px, rgba(0,0,0,.55) ${(R * 0.85).toFixed(1)}px, transparent ${R.toFixed(1)}px)`);
    });
    if (grow && grow.all != null) {
      const R = Math.max(1, grow.all * fw * 2.2);
      parts.push(`radial-gradient(circle ${R.toFixed(1)}px at 50% 70%, #000 ${(R * 0.7).toFixed(1)}px, transparent ${R.toFixed(1)}px)`);
    }
    return parts.length ? parts.join(',') : 'linear-gradient(transparent, transparent)';
  }
  function applyMask(area, grow) {
    const el = document.querySelector('#tw-frame .tw-img.after');
    if (!el) return;
    const full = !grow && area.tasks.every((t) => st().tasks[t.id]);
    const m = full ? 'none' : maskCSS(area, grow);
    el.style.webkitMaskImage = m; el.style.maskImage = m;
  }
  function tween(ms, step, done) {
    cancelAnimationFrame(anim);
    if (F.reduced) { step(1); if (done) done(); return; }
    // 화면이 가려져 있으면(requestAnimationFrame 이 멈춤) 타이머로 이어 가요 → 움직임이 멈춰서 조작이 막히는 일 없게
    const t0 = performance.now();
    let fin = false;
    const next = () => { if (document.hidden) setTimeout(() => loop(performance.now()), 40); else anim = requestAnimationFrame(loop); };
    const loop = (t) => {
      if (fin) return;
      const k = Math.min(1, (t - t0) / ms);
      step(k);
      if (k < 1) next(); else { fin = true; if (done) done(); }
    };
    next();
  }
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeBack = (k) => { const c = 1.5; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

  /* ---------- 화면 ---------- */
  function html() {
    const info = view();
    const area = info.show;
    const g = frameGeom(area);
    // 그림 위에는 '지금 할 작업' 망치 하나만 (끝낸 작업 ✓ 은 그림을 가리지 않게 안 그려요 · 목록에는 '완료 ✓')
    const pins = C.mapPins(info).map((x) => {
      const p = pinPos(area, x.task);
      return `<button type="button" class="tw-pin next" data-pin="${x.task.id}" style="left:${p.left}%;top:${p.top}%" aria-label="${esc(x.task.name)}">🔨</button>`;
    }).join('');
    const rows = info.tasks.map((x, k) => {
      const t = x.task;
      const need = t.cost - st().stars;
      const so = x.next && t.req && !st().sos[t.req] ? D.STORY_ORDERS[t.req] : null;
      const right = x.done ? '<span class="tw-done">완료 ✓</span>'
        : so ? `<button type="button" class="tw-req" data-req="${t.req}">부탁 먼저</button>`
          : x.next ? `<button type="button" class="tw-go${need > 0 ? ' poor' : ''}" data-task="${t.id}">고치기 ${U.STAR}${t.cost}</button>`
            : `<span class="tw-lock">${U.STAR}${t.cost}</span>`;
      const sub = so ? `<small class="tw-sub">${esc(D.VILLAGERS[so.who].name)}의 부탁 「${esc(so.title)}」${U.josa(so.title, '을', '를').slice(so.title.length)} 먼저 들어줘요 (금색 카드)</small>` : '';
      return `<li class="${x.done ? 'done' : x.next ? 'next' : 'lock'}"><i>${k + 1}</i><span class="tw-tn">${esc(t.name)}${sub}</span>${right}</li>`;
    }).join('');
    const pct = Math.round((info.doneN / info.total) * 100);
    const finishedNote = info.finished
      ? `<div class="tw-note">${st().seen.ending ? '소라섬에 등불이 다시 켜졌어요 · 부탁과 이벤트는 계속돼요 🏮' : '등대에 불이 켜졌어요!'}</div>`
      : info.past ? '<div class="tw-note">다 고친 지역이에요 · 숨은 편지·갈매기를 찾아봐요</div>' : '';
    const idx = info.index;
    const nav = reachable() > 0 && !hold
      ? `<div class="tw-nav"><button type="button" class="tw-arr" data-tw="prev" ${idx <= 0 ? 'disabled' : ''} aria-label="앞 지역">‹</button><span>${idx + 1} / ${D.AREAS.length}</span><button type="button" class="tw-arr" data-tw="nextarea" ${idx >= reachable() ? 'disabled' : ''} aria-label="다음 지역">›</button></div>` : '';
    return `<div class="tw-box">
      <header class="tw-head">
        <button type="button" class="chip round" data-tw="close" aria-label="판으로">‹</button>
        <div class="tw-title"><b>${esc(area.name)}</b><small>${esc(area.sub || '')} · ${idx + 1}번째 지역</small></div>
        ${mongdolHTML(idx)}
        <div class="chip tw-stars">${U.STAR}<b>${st().stars}</b></div>
      </header>
      <div class="tw-stage"><div id="tw-frame" class="tw-frame${placing ? ' placing' : ''}" style="--span:${g.span};--y0:${g.y0}">
        ${layers(area)}
        <div class="tw-pins">${decosHTML(area, idx)}${pins}${secretsHTML(area, idx)}</div>
        <div class="tw-banner hide" id="tw-banner"></div>
      </div></div>
      ${nav}
      <div class="tw-prog"><span style="width:${pct}%"></span><b>${info.doneN} / ${info.total}</b></div>
      ${finishedNote}
      ${decoBarHTML(idx)}
      <ol class="tw-list">${rows}</ol>
    </div>`;
  }
  function fit() {
    const fr = $('tw-frame');
    if (!fr) return;
    const info = view();
    const g = frameGeom(info.show);
    const box = document.querySelector('#town .tw-box');
    const maxW = Math.min((box.clientWidth || innerWidth) - 20, 520);
    const maxH = Math.max(220, innerHeight * 0.5);
    let w = maxW, h = (w / IMG_RATIO) * g.span;
    if (h > maxH) { h = maxH; w = (h / g.span) * IMG_RATIO; }
    fr.style.width = Math.floor(w) + 'px';
    fr.style.height = Math.floor(h) + 'px';
    applyMask(info.show);
  }
  function render() {
    const box = $('town');
    box.innerHTML = html();
    // 그림을 못 읽으면 색 풍경으로
    box.querySelectorAll('img.tw-img').forEach((im) => im.addEventListener('error', () => {
      const area = view().show;
      const d = document.createElement('div');
      d.className = im.className + ' tw-paint';
      d.style.background = `linear-gradient(180deg, ${area.sky[0]}, ${area.sky[1]} 58%, ${area.sea} 58.5%)`;
      im.replaceWith(d);
      applyMask(area);
    }));
    fit();
  }

  function open() {
    if (U.busy) return;
    browse = null; placing = null;
    F.sfx('open');
    $('town').classList.remove('hide');   // 먼저 보이게 해야 그림 틀 크기를 잴 수 있어요
    render();
    // 아직 못 본 지역 장면(앱을 닫았다 열었을 때 등)이 있으면 먼저
    const area = D.AREAS[st().area];
    if (area && area.open.scene && !st().story[area.open.scene]) setTimeout(() => scene(area.open.scene), 250);
  }
  function close() {
    if (playing) return;
    cancelAnimationFrame(anim);
    hold = null; browse = null; placing = null;
    $('town').classList.add('hide');
    $('town').innerHTML = '';
    F.sfx('close');
    U.renderAll();
  }
  function scene(id, done) {
    const lines = D.STORY[id];
    if (!lines) { if (done) done(); return; }
    U.talk(lines, () => { st().story[id] = true; U.changed(); if (done) done(); });
  }

  /* ---------- 고치기 ---------- */
  function doTask(id) {
    if (playing) return;
    const s = st();
    const r = C.doTask(s, id, Date.now(), Math.random);
    if (!r.ok) {
      F.sfx('bad');
      if (r.reason === 'stars') {
        U.toast(`별이 ${r.need}개 더 필요해요 · 부탁을 들어주면 받아요`);
        const row = document.querySelector(`[data-task="${id}"]`);
        if (row) U.restartAnim(row, 'wig1');
      }
      return;
    }
    playing = true;
    U.clearUndo();
    U.changed();
    const area = r.area;
    const pin = document.querySelector(`[data-pin="${id}"]`);
    const pc = pin ? U.center(pin) : { x: innerWidth / 2, y: innerHeight / 3 };
    // 별이 작업 자리로 날아가요
    const from = U.center(document.querySelector('.tw-stars'));
    F.fly(U.STAR, from, pc, { count: Math.min(6, r.task.cost), ms: 560, spread: 20, size: 26, s1: 0.5 });
    document.querySelector('.tw-stars b').textContent = s.stars;
    setTimeout(() => {
      F.sfx('merge', 5); F.vibrate([12, 30, 12]);
      // 끝낸 자리: ✓ 이 톡 튀었다가 사르르 사라져요 (다시 그리지 않아요)
      if (pin) { pin.className = 'tw-pin done pop'; pin.textContent = '✓'; setTimeout(() => { pin.classList.add('gone'); setTimeout(() => pin.remove(), 450); }, 700); }
      F.burst(pc.x, pc.y, ['#ffd25a', '#ffffff', '#8fd3c8', '#ff9eb5'], 26, 1.6);
      const ring = document.createElement('div');
      ring.className = 'tw-ring';
      const fr = $('tw-frame');
      const p = pinPos(area, r.task);
      ring.style.left = p.left + '%'; ring.style.top = p.top + '%';
      ring.style.setProperty('--R', ((r.task.r / 100) * fr.clientWidth * 2) + 'px');
      fr.appendChild(ring);
      setTimeout(() => ring.remove(), 1400);
      tween(1300, (k) => applyMask(area, { id, k: easeBack(k) }), () => {
        F.sfx('discover');
        if (!r.areaDone) render();   // 목록·핀을 바로 새로 (동그라미는 그대로 남아요)
        const after = () => {
          if (r.areaDone) areaDone(r);
          else { playing = false; render(); U.renderNav(); }
        };
        setTimeout(() => (r.task.scene ? scene(r.task.scene, after) : after()), 350);
      });
    }, F.reduced ? 50 : 600);
  }

  function areaDone(r) {
    const area = r.doneArea;
    hold = area;
    render();
    // 다 끝난 그림: 마지막 동그라미에서 화면 전체로 번져요
    tween(1600, (k) => applyMask(area, { all: easeOut(k) }), () => {
      applyMask(area);
      const fr = $('tw-frame');
      const c = U.center(fr);
      F.sfx('maxed'); F.vibrate([20, 40, 20, 40, 60]);
      for (let i = 0; i < 4; i++) setTimeout(() => F.burst(c.x + (Math.random() - 0.5) * c.w * 0.8, c.y + (Math.random() - 0.5) * c.h * 0.6, ['#ffd25a', '#ffffff', '#ff9eb5', '#8fd3c8'], 26, 1.8), i * 220);
      const ban = $('tw-banner');
      ban.innerHTML = `<b>${esc(area.name)}</b><span>복원 완료!</span>`;
      ban.classList.remove('hide');
      U.setBg();
      setTimeout(() => {
        const finish = () => {
          playing = false;
          const gens = r.given.map((x) => D.GENS[x.cell.g].name);
          const lines = [];
          if (r.uncovered.length) lines.push(`모래더미 ${r.uncovered.length}칸이 걷혔어요`);
          if (gens.length) lines.push(`새 발생기: ${gens.join(' · ')}${r.given.some((x) => x.at < 0) ? ' (선물함)' : ''}`);
          showNext(r, lines);
        };
        const ending = () => (r.ending ? scene(r.ending, () => { st().seen.ending = true; U.changed(); finish(); }) : finish());
        area.done.scene ? scene(area.done.scene, ending) : ending();
      }, 1500);
    });
  }
  // 지역 완료 뒤: 보상 안내 + [다음 지역으로]
  function showNext(r, lines) {
    const next = r.nextArea;
    const ban = $('tw-banner');
    ban.classList.remove('hide');
    ban.innerHTML = `<b>${esc(r.doneArea.name)}</b><span>복원 완료!</span>${lines.map((l) => `<small>${esc(l)}</small>`).join('')}
      <button type="button" class="btn main" data-tw="next">${next ? `다음 지역: ${esc(next.name)} →` : '판으로 돌아가기'}</button>`;
    if (!next && C.secretCounts(st()).album) setTimeout(() => U.toast('편지 12장을 다 모았어요! ☰ 수첩에서 「할머니의 앨범」이 열렸어요'), 800);
    F.sfx('open');
  }
  function goNext() {
    hold = null;
    const next = D.AREAS[st().area];
    U.setBg();
    if (!next) { close(); U.toast('소라섬에 등불이 다시 켜졌어요! 부탁과 이벤트는 계속돼요'); return; }
    playing = true;
    const box = document.querySelector('#town .tw-box');
    box.classList.add('swap');
    setTimeout(() => {
      render();
      document.querySelector('#town .tw-box').classList.add('swapin');
      playing = false;
      if (next.open.scene && !st().story[next.open.scene]) setTimeout(() => scene(next.open.scene), 400);
    }, 320);
  }

  /* ---------- 조작 ---------- */
  $('town').addEventListener('click', (e) => {
    F.unlock();
    const b = e.target.closest('button');
    if (placing && !playing && (!b || b.classList.contains('tw-sec') || b.classList.contains('tw-pin')) && e.target.closest('#tw-frame')) { placeAt(e); return; }
    if (!b) return;
    if (b.dataset.tw === 'close') close();
    else if (b.dataset.tw === 'next') goNext();
    else if (b.dataset.tw === 'prev' || b.dataset.tw === 'nextarea') {
      if (playing) return;
      const cur = view().index;
      const to = Math.max(0, Math.min(reachable(), cur + (b.dataset.tw === 'prev' ? -1 : 1)));
      browse = to >= Math.min(st().area, D.AREAS.length) ? null : to;
      placing = null;
      F.sfx('swap'); render();
    } else if (b.dataset.tw === 'mong') mongHint();
    else if (b.dataset.sec) { const [k, id] = b.dataset.sec.split(':'); findSecret(k, id, b); }
    else if (b.dataset.deco) {
      const id = b.dataset.deco;
      if (placing === id) { C.placeDeco(st(), id, 0, null, null, Date.now()); placing = null; U.toast('장식을 치웠어요'); U.changed(); }
      else { placing = id; U.toast('그림에서 장식을 놓을 곳을 톡 하세요'); }
      F.sfx('pick'); render();
    } else if (b.dataset.req) {
      const so = D.STORY_ORDERS[b.dataset.req];
      F.sfx('pick');
      U.toast(`${D.VILLAGERS[so.who].name}의 금색 부탁 카드를 먼저 들어줘요`);
    }
    else if (b.dataset.task) doTask(b.dataset.task);
    else if (b.dataset.pin) {
      const row = document.querySelector(`#town li [data-task="${b.dataset.pin}"]`);
      if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); U.restartAnim(row, 'wig1'); F.sfx('pick'); }
      else { const t = view().tasks.find((x) => x.task.id === b.dataset.pin); if (t) U.toast(t.done ? `${t.task.name} · 끝냈어요` : `${t.task.name} · 앞 작업을 먼저 해요`); }
    }
  });
  addEventListener('resize', () => { if (!$('town').classList.contains('hide')) fit(); });

  /* ---------- 숨은 비밀 찾기 ---------- */
  function findSecret(kind, id, btn) {
    if (playing) return;
    const r = C.findSecret(st(), kind, id, Date.now(), Math.random);
    if (!r.ok) return;
    const p = U.center(btn);
    btn.classList.add('found');
    F.sfx('secret'); F.vibrate([10, 30, 10]);
    F.burst(p.x, p.y, ['#ffd25a', '#ffffff', '#8fd3c8'], 18, 1.2);
    U.changed();
    if (kind === 'gull') {
      U.floatTag(`갈매기 ${r.count}/${r.max} · 동전 +${r.coins}`, p.x, p.y - 20, true);
      if (r.title) setTimeout(() => U.toast(`갈매기를 다 찾았어요! 칭호 「${r.title}」`), 900);
      setTimeout(render, 500);
      return;
    }
    if (kind === 'letter') {
      U.floatTag(`편지 조각 ${r.count}/${r.max} · 소라별 +${r.gems}`, p.x, p.y - 20, true);
      setTimeout(() => U.talk([{ who: 'letter', text: r.text }, { who: 'mongdol', face: 'joy', text: r.count >= r.max ? '뀨우! (편지 조각을 다 모았어요!)' : '뀨!' }], render), 500);
      return;
    }
    U.floatTag(`병 속 편지 · 소라별 +${r.gems}`, p.x, p.y - 20, true);
    setTimeout(() => U.talk([{ who: 'hayun', face: 'wow', text: '바닷가에 병이 떠밀려 왔어.\n안에 쪽지가 있네.' },
      { who: 'letter', text: r.note }, { who: 'hayun', face: 'joy', text: `작은 보자기도 들어 있었어!${r.gift.at < 0 ? '\n(판이 꽉 차서 선물함에)' : ''}` }], render), 500);
  }
  function mongHint() {
    const idx = view().index;
    const ls = hold ? [] : C.secretsIn(st(), idx, Date.now()).filter((x) => x.kind === 'letter');
    F.sfx('spawn');
    const btn = document.querySelector('.tw-mong');
    if (btn) U.restartAnim(btn, 'wig1');
    if (!ls.length) { U.toast('뀨… (여기엔 편지 조각이 없나 봐요)'); return; }
    const el = document.querySelector(`[data-sec="letter:${ls[0].id}"]`);
    if (el) { U.restartAnim(el, 'hintme'); el.scrollIntoView({ block: 'nearest' }); }
    U.toast('뀨뀨! (몽돌이가 반짝이는 곳을 가리켜요)');
  }
  function placeAt(e) {
    const fr = $('tw-frame');
    const r = fr.getBoundingClientRect();
    const g = frameGeom(view().show);
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = (g.y0 + ((e.clientY - r.top) / r.height) * g.span) * 100;
    const res = C.placeDeco(st(), placing, view().index, Math.round(x), Math.round(y), Date.now());
    if (!res.ok) return;
    placing = null;
    F.sfx('drop'); F.burst(e.clientX, e.clientY, ['#ffd25a', '#ffffff'], 12, 0.9);
    U.changed(); render();
  }

  // 시작할 때: 별이 넉넉하면 [마을] 버튼을 살짝 흔들어 알려 줘요
  function resume() {
    U.renderNav();
    if (view().canAfford) U.restartAnim($('btn-town'), 'wig1');
  }

  window.MergeTown = { open, close, resume, render, doTask, show: (i) => { browse = i; render(); } };
})();
