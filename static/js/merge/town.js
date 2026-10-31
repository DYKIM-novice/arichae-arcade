/* 머지관 · 「소라섬 등불 이야기」 마을 화면 (복원 작업 · 전/후 배경 · 이야기 장면)
   - [마을] 버튼(또는 별 칩) → 지금 지역 그림 + 작업 목록 · 별로 [고치기]
   - 작업을 끝내면 그 자리를 중심으로 '후' 배경이 동그랗게 번져 나와요 (CSS 마스크 · 작업별 그림 없음)
   - 지역을 다 고치면 전체가 환하게 → 이야기 → [다음 지역으로] (새 발생기는 판에, 자리 없으면 선물함)
   - 그림이 없으면: '전'만 있으면 같은 그림에 색 바꾸기, 둘 다 없으면 색 풍경 (data.js 의 sky·sea)
   - 규칙은 MergeCore(doTask·areaInfo), 화면 손잡이는 window.MergeUI 를 써요 */
(function () {
  'use strict';

  const D = window.MergeData, C = window.MergeCore, A = window.MergeArt, F = window.MergeFx, U = window.MergeUI;
  if (!U) return;
  const $ = (id) => document.getElementById(id);
  const esc = U.esc;
  const IMG_RATIO = 720 / 1274;          // 배경 그림 가로/세로 (merge_art.py: 세로 720 폭)
  const reduced = F.reduced;
  let playing = false;                    // 고치기 움직임·장면 중엔 다른 조작 막음
  let anim = 0;

  const st = () => U.state;
  let hold = null;                        // 방금 다 고친 지역 (다음 지역으로 넘어가기 전까지 그 그림을 보여 줘요)
  function view() {
    if (!hold) return C.areaInfo(st());
    const tasks = hold.tasks.map((t) => ({ task: t, done: true, next: false }));
    return { area: hold, show: hold, index: D.AREAS.indexOf(hold), finished: false, tasks, doneN: tasks.length, total: tasks.length, next: null, canAfford: false };
  }

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
    if (reduced) { step(1); if (done) done(); return; }
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
    const pins = info.tasks.map((x) => {
      const p = pinPos(area, x.task);
      const cls = x.done ? 'done' : x.next ? 'next' : 'lock';
      return `<button type="button" class="tw-pin ${cls}" data-pin="${x.task.id}" style="left:${p.left}%;top:${p.top}%" aria-label="${esc(x.task.name)}">${x.done ? '✓' : x.next ? '🔨' : ''}</button>`;
    }).join('');
    const rows = info.tasks.map((x, k) => {
      const t = x.task;
      const need = t.cost - st().stars;
      const right = x.done ? '<span class="tw-done">완료 ✓</span>'
        : x.next ? `<button type="button" class="tw-go${need > 0 ? ' poor' : ''}" data-task="${t.id}">고치기 ${U.STAR}${t.cost}</button>`
          : `<span class="tw-lock">${U.STAR}${t.cost}</span>`;
      return `<li class="${x.done ? 'done' : x.next ? 'next' : 'lock'}"><i>${k + 1}</i><span class="tw-tn">${esc(t.name)}</span>${right}</li>`;
    }).join('');
    const pct = Math.round((info.doneN / info.total) * 100);
    const finishedNote = info.finished
      ? `<div class="tw-note">다음 이야기는 곧 열려요 · 지금은 부탁을 들어주며 쉬어 가요 🌙</div>` : '';
    return `<div class="tw-box">
      <header class="tw-head">
        <button type="button" class="chip round" data-tw="close" aria-label="판으로">‹</button>
        <div class="tw-title"><b>${esc(area.name)}</b><small>${esc(area.sub || '')} · ${info.index + 1}번째 지역</small></div>
        <div class="chip tw-stars">${U.STAR}<b>${st().stars}</b></div>
      </header>
      <div class="tw-stage"><div id="tw-frame" class="tw-frame" style="--span:${g.span};--y0:${g.y0}">
        ${layers(area)}
        <div class="tw-pins">${pins}</div>
        <div class="tw-banner hide" id="tw-banner"></div>
      </div></div>
      <div class="tw-prog"><span style="width:${pct}%"></span><b>${info.doneN} / ${info.total}</b></div>
      ${finishedNote}
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
    hold = null;
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
      if (pin) { pin.className = 'tw-pin done pop'; pin.textContent = '✓'; }
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
    }, reduced ? 50 : 600);
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
        area.done.scene ? scene(area.done.scene, finish) : finish();
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
    F.sfx('open');
  }
  function goNext() {
    hold = null;
    const next = D.AREAS[st().area];
    U.setBg();
    if (!next) { close(); U.toast('다음 이야기는 곧 열려요!'); return; }
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
    if (!b) return;
    if (b.dataset.tw === 'close') close();
    else if (b.dataset.tw === 'next') goNext();
    else if (b.dataset.task) doTask(b.dataset.task);
    else if (b.dataset.pin) {
      const row = document.querySelector(`#town li [data-task="${b.dataset.pin}"]`);
      if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); U.restartAnim(row, 'wig1'); F.sfx('pick'); }
      else { const t = view().tasks.find((x) => x.task.id === b.dataset.pin); if (t) U.toast(t.done ? `${t.task.name} · 끝냈어요` : `${t.task.name} · 앞 작업을 먼저 해요`); }
    }
  });
  addEventListener('resize', () => { if (!$('town').classList.contains('hide')) fit(); });

  // 시작할 때: 별이 넉넉하면 [마을] 버튼을 살짝 흔들어 알려 줘요
  function resume() {
    U.renderNav();
    if (view().canAfford) U.restartAnim($('btn-town'), 'wig1');
  }

  window.MergeTown = { open, close, resume, render, doTask };
})();
