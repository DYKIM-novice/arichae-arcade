/* 아리채 오락실 · 회귀 RPG 화면 틀 (HTML) — 위 막대·체력·필살 게이지·버튼·큰 글자·카드 3장·되감기·회차 제목·전생 정산
   장면 그림(view.js)과 따로라서 그리기를 바꿔도 이 파일은 그대로 써요 */
(function () {
  'use strict';

  const Sim = window.RpgSim;
  const D = window.RpgData;
  const A = window.App;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (s, r) => (r || document).querySelector(s);

  const CLOCK = (cls) => `<svg class="${cls || ''}" viewBox="-20 -20 40 40" aria-hidden="true"><circle r="17" fill="#FFF6D6" stroke="#C99A00" stroke-width="3"/><g stroke="#2A2340" stroke-width="2" stroke-linecap="round"><path d="M0 -13 V-10 M13 0 H10 M0 13 V10 M-13 0 H-10"/></g><path class="rg-hand-l" d="M0 0 V-10" stroke="#2A2340" stroke-width="3" stroke-linecap="round"/><path class="rg-hand-s" d="M0 0 H7" stroke="#FF4757" stroke-width="3" stroke-linecap="round"/><circle r="2.4" fill="#2A2340"/></svg>`;
  const SHARD = '<svg class="rg-shard" viewBox="-12 -14 24 28" aria-hidden="true"><path d="M0 -13 L10 -3 L4 13 L-4 13 L-10 -3 Z" fill="#B07BFF" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M0 -13 L3 -3 L0 13 L-3 -3 Z" fill="#E2CCFF"/></svg>';
  const ICON = {
    r: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 L17 7 M14 4 L20 10 M7 15 L9 17" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/></svg>',
    g: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L20 6 Q20 15 12 21 Q4 15 4 6 Z" fill="none" stroke="#fff" stroke-width="2.8" stroke-linejoin="round"/></svg>',
    b: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 L5 14 H11 L10 22 L19 9 H13 Z" fill="#fff"/></svg>'
  };
  const CARD_ICON = {
    slash: '⚔️', heavy: '💥', vamp: '🩸', wall: '🛡️', parry: '⚡', calm: '💚', charge: '🔋', nova: '🌟', tough: '💪', star: '⭐', potion: '🧪'
  };
  const NODE_ICON = { combo: '⚔️', hp: '💖', reroll: '🎲' };

  function mount() {
    let s = $('#s-rg');
    if (s) return s;
    s = document.createElement('section');
    s.id = 's-rg';
    s.className = 'screen rg-screen';
    s.innerHTML = `
      <div class="rg-top">
        <div class="rg-loop">${CLOCK('rg-clk')}<div><b class="disp" id="rg-loopn">1회차</b><span id="rg-xpm">경험치 ×1.00</span></div></div>
        <div class="rg-rooms" id="rg-rooms"></div>
        <button type="button" class="rg-exit" id="rg-exit" aria-label="나가기"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg></button>
      </div>
      <div class="rg-scene" id="rg-scene">
        <div class="rg-ehp" id="rg-ehp"><b class="disp"></b><div class="rg-bar"><i class="lag"></i><i class="fill"></i></div><span class="rg-ehp-tx"></span></div>
        <div class="rg-combo disp" id="rg-combo"></div>
        <div class="rg-fx" id="rg-fx"></div>
        <div class="rg-banner" id="rg-banner"><b class="disp"></b><span></span></div>
      </div>
      <div class="rg-party" id="rg-party"></div>
      <div class="rg-status">
        <div class="rg-hprow"><span class="rg-lv disp" id="rg-lv">Lv1</span>
          <div class="rg-hp" id="rg-hp"><i class="lag"></i><i class="fill"></i><b id="rg-hptx">100 / 100</b></div></div>
        <div class="rg-xp" id="rg-xp"><i></i></div>
        <div class="rg-gauge" id="rg-gauge"><i></i><b>필살 게이지</b></div>
      </div>
      <div class="pad rg-pad" id="rg-pad">
        <div class="bez" data-c="r"><button class="gb r" type="button" aria-label="빨강 공격">${ICON.r}</button><span class="gb-name">공격 · 꾹=모아</span></div>
        <div class="bez" data-c="g"><button class="gb g" type="button" aria-label="초록 막기">${ICON.g}</button><span class="gb-name">막기 · 패링</span></div>
        <div class="bez" data-c="b"><button class="gb b" type="button" aria-label="파랑 필살">${ICON.b}</button><span class="gb-name">필살기</span></div>
      </div>
      <div class="rg-over" id="rg-over"></div>
      <div class="rg-rewind" id="rg-rewind"><div class="rg-scan"></div><div class="rg-rw-clock">${CLOCK('rg-bigclk')}</div><div class="rg-rw-tx disp">◀◀ 되감는 중</div></div>
      <div class="rg-title" id="rg-title"><div class="rg-title-in"><span class="rg-t-sub"></span><b class="disp rg-t-main"></b></div></div>
      <div class="rg-flash" id="rg-flash"></div>`;
    $('#app').appendChild(s);
    return s;
  }

  function create() {
    const root = mount();
    const q = (sel) => root.querySelector(sel);
    const fx = q('#rg-fx');
    const st = { lastHp: -1, lag: 1, eLag: 1, eid: 0, combo: 0, comboT: 0, room: -1, ph: '', cardsKey: '', lastG: -1, party: '' };

    function big(text, cls, x, y, ms) {
      const d = document.createElement('div');
      d.className = 'rg-big disp ' + (cls || '');
      d.textContent = text;
      if (x != null) { d.style.left = x + 'px'; d.style.top = y + 'px'; }
      fx.appendChild(d);
      setTimeout(() => d.remove(), ms || 900);
      return d;
    }
    function flash(color, ms) {
      const f = q('#rg-flash');
      f.style.background = color || '#fff';
      f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
      f.style.animationDuration = (ms || 260) + 'ms';
    }
    function edge(color) {
      const e = document.createElement('div');
      e.className = 'rg-edge';
      e.style.setProperty('--ec', color);
      fx.appendChild(e);
      setTimeout(() => e.remove(), 500);
    }
    let bannerT = 0;
    function banner(t, sub, ms) {
      const b = q('#rg-banner');
      b.querySelector('b').textContent = t;
      b.querySelector('span').textContent = sub || '';
      b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
      clearTimeout(bannerT);
      bannerT = setTimeout(() => b.classList.remove('on'), ms || 1800);
    }

    function reset(W, me, info) {
      st.lastHp = -1; st.lag = 1; st.eLag = 1; st.eid = 0; st.combo = 0; st.room = -1; st.ph = ''; st.cardsKey = ''; st.party = '';
      q('#rg-loopn').textContent = `${info.loop}회차`;
      q('#rg-xpm').textContent = `경험치 ×${Sim.xpMult(info.loop).toFixed(2)}${info.stars ? ' · ★' + info.stars : ''}`;
      q('#rg-rooms').innerHTML = D.rooms.map((r, i) => `<i class="${i === D.rooms.length - 1 ? 'boss' : ''}">${i === D.rooms.length - 1 ? '👹' : i + 1}</i>`).join('');
      q('#rg-party').innerHTML = '';
      q('#rg-party').style.display = W.heroes.length > 1 ? '' : 'none';
      root.classList.toggle('rg-coop', W.heroes.length > 1);
      hideOver();
      q('#rg-rewind').className = 'rg-rewind';
      q('#rg-title').className = 'rg-title';
      root.classList.remove('rg-gray', 'rg-gold');
      fx.innerHTML = '';
    }

    function update(W, me) {
      if (!me) return;
      // 내 체력 (빨간 잔상이 천천히 따라와요)
      const k = clamp(me.hp / me.st.maxHp, 0, 1);
      st.lag = st.lag > k ? Math.max(k, st.lag - 0.012) : k;
      const hp = q('#rg-hp');
      if (Math.abs(k - st.lastHp) > 0.001 || st.lag !== k) {
        hp.querySelector('.fill').style.transform = `scaleX(${k})`;
        hp.querySelector('.lag').style.transform = `scaleX(${st.lag})`;
        hp.classList.toggle('low', k < 0.3);
        q('#rg-hptx').textContent = `${Math.max(0, Math.ceil(me.hp))} / ${me.st.maxHp}`;
        st.lastHp = k;
      }
      q('#rg-lv').textContent = 'Lv' + me.lv;
      q('#rg-xp i').style.transform = `scaleX(${clamp(me.xp / Sim.needXp(me.lv), 0, 1)})`;
      const g = Math.round(me.gauge);
      if (g !== st.lastG) {
        st.lastG = g;
        const ge = q('#rg-gauge');
        ge.querySelector('i').style.transform = `scaleX(${g / D.hero.gaugeMax})`;
        const full = g >= D.hero.gaugeMax;
        ge.classList.toggle('full', full);
        ge.querySelector('b').textContent = full ? '필살 준비! 파랑을 눌러요' : '필살 게이지';
        root.querySelector('#rg-pad .bez[data-c="b"]').classList.toggle('rg-ready', full);
      }
      // 적 체력
      const E = W.enemy;
      const eh = q('#rg-ehp');
      if (E && !(E.dead && W.t - E.dead > 700) && !root.classList.contains('rg-gray') && !root.classList.contains('rg-gold')) {
        if (st.eid !== E.eid) {
          st.eid = E.eid; st.eLag = 1;
          eh.querySelector('b').textContent = (D.enemies[E.kind] || {}).name || '';
          eh.classList.toggle('boss', !!E.boss);
        }
        const ek = clamp(E.hp / E.max, 0, 1);
        st.eLag = st.eLag > ek ? Math.max(ek, st.eLag - 0.01) : ek;
        eh.querySelector('.fill').style.transform = `scaleX(${ek})`;
        eh.querySelector('.lag').style.transform = `scaleX(${st.eLag})`;
        eh.querySelector('.rg-ehp-tx').textContent = `${Math.max(0, Math.ceil(E.hp))}`;
        eh.classList.add('on');
        eh.classList.toggle('rage', !!E.rage);
      } else eh.classList.remove('on');
      // 방 진행
      if (st.room !== W.room || st.ph !== W.phase) {
        st.room = W.room; st.ph = W.phase;
        root.querySelectorAll('#rg-rooms i').forEach((d, i) => { d.classList.toggle('done', i < W.room); d.classList.toggle('cur', i === W.room); });
      }
      // 콤보 숫자 (때리다 끊기면 사라져요)
      const c = q('#rg-combo');
      if (st.combo > 1 && performance.now() - st.comboT < 1400) { c.textContent = `${st.combo} 콤보!`; c.classList.add('on'); } else { c.classList.remove('on'); if (performance.now() - st.comboT > 1400) st.combo = 0; }
      // 같이 모드: 가족 체력
      if (W.heroes.length > 1) {
        const key = W.heroes.map((h) => `${h.id}:${Math.ceil(h.hp)}:${h.st ? h.st.maxHp : h.mh}:${h.down ? 1 : 0}:${h.lv}`).join('|');
        if (key !== st.party) {
          st.party = key;
          q('#rg-party').innerHTML = W.heroes.map((h) => {
            const mh = h.st ? h.st.maxHp : (h.mh || 100);
            const kk = clamp(h.hp / mh, 0, 1);
            return `<div class="rg-pm${h.id === me.id ? ' me' : ''}${h.down ? ' down' : ''}"><span class="rg-pm-f">${window.Oly.faceSVG(h.ath, h.down ? 'd' : 'n')}</span>
              <div><b>${h.id === me.id ? '나' : esc(h.name)}${h.kind === 'bot' || h.bot ? ' 🤖' : ''}</b><div class="rg-pm-bar"><i style="transform:scaleX(${kk.toFixed(3)})"></i></div></div><em>Lv${h.lv || 1}</em></div>`;
          }).join('');
        }
      }
    }

    // 일어난 일 → 큰 글자·번쩍
    function event(e, W, me, scr) {
      const mine = me && e.h === me.id;
      switch (e.k) {
        case 'hit':
          if (mine) { st.combo++; st.comboT = performance.now(); }
          if (mine && e.kind === 'counter') { const p = scr.enemy(); big('반격!', 'rg-b-counter', Math.min(p.x + 70, root.clientWidth - 70), p.y - 40, 800); }
          if (mine && e.kind === 'heavy') { const p = scr.enemy(); big('모아 베기!', 'rg-b-heavy', p.x - 20, p.y - 80, 800); }
          if (mine && e.crit && Math.random() < 0.4) { const p = scr.enemy(); big('약점!', 'rg-b-crit', p.x, p.y - 100, 600); }
          break;
        case 'parry':
          if (mine) {
            flash('rgba(255,255,255,.9)', 280);
            const p = scr.hero(e.h);
            big('패링!', 'rg-b-parry', Math.max(90, p.x + 10), p.y - 150, 1000);
            A.SND.vibrate([30, 20, 60]);
          }
          break;
        case 'guard': if (mine) { const p = scr.hero(e.h); big('막았다', 'rg-b-guard', p.x + 30, p.y - 130, 600); A.SND.vibrate(15); } break;
        case 'hurt': if (mine) { edge('rgba(255,71,87,.7)'); A.SND.vibrate(70); st.combo = 0; } break;
        case 'lvup': if (mine) { const p = scr.hero(e.h); big(`레벨 업! Lv${e.lv}`, 'rg-b-lv', p.x + 20, p.y - 150, 1200); } break;
        case 'spec': if (mine) { flash('rgba(127,178,255,.75)', 420); banner('필살! 도깨비 베기', '', 900); A.SND.vibrate([40, 30, 80]); } break;
        case 'specNo': if (mine) { const g = q('#rg-gauge'); g.classList.remove('nudge'); void g.offsetWidth; g.classList.add('nudge'); } break;
        case 'gaugeFull': if (mine) { const p = scr.hero(e.h); big('필살 준비!', 'rg-b-ready', p.x + 20, p.y - 140, 1000); } break;
        case 'break': { const p = scr.enemy(); big('끊었다!', 'rg-b-break', p.x - 30, p.y - 90, 1000); flash('rgba(255,71,87,.45)', 260); break; }
        case 'stun': break;
        case 'rage': banner('도깨비 대왕이 화났다!', '공격이 빨라져요', 1600); flash('rgba(255,71,87,.5)', 400); break;
        case 'spawn': {
          const d = D.enemies[e.kind] || {};
          if (d.boss) banner('도깨비 대왕 등장!', '빨강 예고는 마구 때려서 끊어요', 2200);
          break;
        }
        case 'roomClear': banner('방 클리어!', '카드를 한 장 골라요', 1400); break;
        case 'room': banner(W.room >= Sim.LAST_ROOM ? '대왕의 방' : `${W.room + 1}번째 방`, W.room >= Sim.LAST_ROOM ? '조심해요!' : '', 1500); break;
        case 'revive': if (mine) banner('다시 일어났다!', '', 1200); break;
        case 'down': if (mine) { flash('rgba(0,0,0,.5)', 600); banner('으앗… 쓰러졌다', W.heroes.length > 1 ? '가족이 버티면 다음 방에서 일어나요' : '', 1800); } break;
        default: break;
      }
    }

    /* ---------- 카드 3장 (빨강·초록·파랑 버튼으로 바로 골라요) ---------- */
    function cards(me, info) {
      const ov = q('#rg-over');
      const key = me && me.cards ? me.cards.join(',') + ':' + me.rerolls : '';
      if (key === st.cardsKey) return;
      st.cardsKey = key;
      if (!key) { if (ov.classList.contains('cards')) hideOver(); return; }
      ov.className = 'rg-over show cards';
      ov.innerHTML = `<div class="rg-cards-head"><b class="disp">강해질 카드 한 장!</b><span>같은 색 버튼을 눌러요${info && info.wait ? ' · ' + esc(info.wait) : ''}</span></div>
        <div class="rg-cards">${me.cards.map((id, i) => {
          const c = Sim.CARD[id]; const lv = me.upg[id] || 0; const col = ['r', 'g', 'b'][i];
          return `<button type="button" class="rg-card c-${col}" data-slot="${i}"><span class="rg-card-ic">${CARD_ICON[id] || '✨'}</span><b class="disp">${esc(c.name)}</b>
            <span class="rg-card-lv">${id === 'potion' ? '바로 회복' : lv ? `Lv${lv} → Lv${lv + 1}` : '새 기술!'}</span><span class="rg-card-d">${esc(c.desc)}</span><i class="rg-card-k">${['빨강', '초록', '파랑'][i]}</i></button>`;
        }).join('')}</div>
        ${me.rerolls > 0 ? `<button type="button" class="rg-reroll" data-reroll="1">🎲 다시 뽑기 (${me.rerolls}번 남음)</button>` : ''}`;
    }
    function pickFx(slot) {
      const b = q(`#rg-over .rg-card[data-slot="${slot}"]`);
      if (b) b.classList.add('picked');
      q('#rg-over').classList.add('chosen');
    }
    function hideOver() { const ov = q('#rg-over'); ov.className = 'rg-over'; ov.innerHTML = ''; st.cardsKey = ''; }

    /* ---------- 되감기 · 회차 제목 · 전생 정산 ---------- */
    function rewindOn(clear) {
      root.classList.add(clear ? 'rg-gold' : 'rg-gray');
      q('#rg-rewind').className = 'rg-rewind on' + (clear ? ' gold' : '');
      q('#rg-rewind .rg-rw-tx').textContent = clear ? '◀◀ 클리어 회귀!' : '◀◀ 되감는 중';
      hideOver();
      q('#rg-ehp').classList.remove('on');
      // 방 진행 점이 하나씩 꺼져요
      const dots = Array.from(root.querySelectorAll('#rg-rooms i'));
      dots.reverse().forEach((d, i) => setTimeout(() => { d.classList.remove('done', 'cur'); d.classList.add('rw'); setTimeout(() => d.classList.remove('rw'), 300); }, 900 + i * 160));
    }
    function title(n, clear) {
      q('#rg-rewind').className = 'rg-rewind';
      root.classList.remove('rg-gray');
      const t = q('#rg-title');
      t.className = 'rg-title on' + (clear ? ' gold' : '');
      t.querySelector('.rg-t-sub').textContent = clear ? '도깨비 대왕을 물리치고' : '기억을 안고 처음으로';
      t.querySelector('.rg-t-main').textContent = `제 ${n}회차 회귀!`;
      flash(clear ? 'rgba(255,226,122,.9)' : 'rgba(255,255,255,.9)', 500);
      q('#rg-loopn').textContent = `${n}회차`;
      q('#rg-xpm').textContent = `경험치 ×${Sim.xpMult(n).toFixed(2)}`;
      for (let i = 0; i < 14; i++) {
        const s = document.createElement('div');
        s.className = 'rg-fly-shard';
        s.innerHTML = SHARD;
        s.style.setProperty('--dx', (Math.cos(i / 14 * Math.PI * 2) * (90 + (i % 3) * 40)) + 'px');
        s.style.setProperty('--dy', (Math.sin(i / 14 * Math.PI * 2) * (90 + (i % 3) * 40)) + 'px');
        s.style.animationDelay = (i * 0.02) + 's';
        t.appendChild(s);
        setTimeout(() => s.remove(), 1500);
      }
    }
    // res: settle 결과 · o: { meta, onBuy(id), onDepart(), auto(초), coop }
    function settle(res, o) {
      const t = q('#rg-title');
      t.className = 'rg-title';
      const ov = q('#rg-over');
      const clear = res.lines.some((l) => l.k === 'star');
      ov.className = 'rg-over show settle' + (clear ? ' gold' : '');
      ov.innerHTML = `<div class="rg-settle">
          <div class="rg-st-head"><span>${CLOCK('rg-sclk')}</span><b class="disp">전생 정산</b><em>${esc(o.meta.loop)}회차 시작</em></div>
          <div class="rg-st-lines"></div>
          <div class="rg-tree" style="opacity:0"></div>
          <button type="button" class="btn btn-yellow rg-go" style="opacity:0" disabled>다시 출발!</button>
          <div class="rg-st-wait hint-md"></div>
        </div>`;
      const box = ov.querySelector('.rg-st-lines');
      const SFX = window.RpgSfx;
      let i = 0;
      const timers = [];
      const later = (ms, fn) => timers.push(setTimeout(fn, ms));
      res.lines.forEach((l, li) => {
        later(350 + li * 620, () => {
          const row = document.createElement('div');
          row.className = 'rg-line k-' + l.k + (l.c ? ' c-' + l.c : '');
          let val = '';
          if (l.k === 'shard') val = `${SHARD}<b class="disp rg-cnt">+0</b>`;
          else if (l.k === 'total') val = `${SHARD}<b class="disp rg-cnt">0</b>`;
          else if (l.k === 'xp') val = `<span class="rg-from">×${l.from.toFixed(2)}</span> → <b class="disp rg-cnt">×${l.from.toFixed(2)}</b>`;
          else val = `<b class="disp">${esc(l.text)}</b>`;
          row.innerHTML = `<span class="rg-l-lb">${esc(l.label)}</span><span class="rg-l-v">${val}</span>`;
          box.appendChild(row);
          if (SFX) SFX.pop(li * 2);
          A.SND.vibrate(15);
          // 숫자가 촤라락 올라가요
          const cnt = row.querySelector('.rg-cnt');
          if (cnt && (l.k === 'shard' || l.k === 'total' || l.k === 'xp')) {
            const from = l.k === 'xp' ? l.from : 0; const to = l.k === 'xp' ? l.to : l.val;
            const t0 = performance.now(); const dur = 420;
            const step = () => {
              const k = Math.min(1, (performance.now() - t0) / dur);
              const v = from + (to - from) * (1 - Math.pow(1 - k, 2));
              cnt.textContent = l.k === 'xp' ? `×${v.toFixed(2)}` : (l.k === 'shard' ? '+' : '') + Math.round(v);
              if (SFX && k < 1 && Math.random() < 0.5) SFX.count();
              if (k < 1) requestAnimationFrame(step); else row.classList.add('done');
            };
            requestAnimationFrame(step);
          } else row.classList.add('done');
          i++;
        });
      });
      const treeAt = 350 + res.lines.length * 620 + 300;
      later(treeAt, () => {
        renderTree(o.meta);
        ov.querySelector('.rg-tree').style.opacity = 1;
        const go = ov.querySelector('.rg-go');
        go.style.opacity = 1; go.disabled = false;
        if (o.ready) o.ready();
      });
      function renderTree(meta) {
        const tr = ov.querySelector('.rg-tree');
        tr.innerHTML = `<div class="rg-tree-h"><b class="disp">기억의 나무</b><span>${SHARD}<b class="disp">${meta.shards}</b> · 같은 색 버튼으로 배워요</span></div>
          <div class="rg-nodes">${D.meta.nodes.map((n) => {
            const lv = meta.nodes[n.id] || 0; const cost = Sim.nodeCost(meta, n.id);
            const can = cost != null && meta.shards >= cost;
            return `<button type="button" class="rg-node c-${n.c}${can ? ' can' : ''}${cost == null ? ' max' : ''}" data-node="${n.id}"><span class="rg-node-ic">${NODE_ICON[n.id] || '✨'}</span><b>${esc(n.name)}</b>
              <span class="rg-node-lv">${'●'.repeat(lv)}${'○'.repeat(n.max - lv)}</span><span class="rg-node-d">${esc(n.desc)}</span>
              <em>${cost == null ? '다 배웠어요' : `${SHARD}${cost}`}</em></button>`;
          }).join('')}</div>`;
      }
      return {
        refresh(meta) { renderTree(meta); },
        buyFx(id) { const b = ov.querySelector(`.rg-node[data-node="${id}"]`); if (b) { b.classList.remove('bought'); void b.offsetWidth; b.classList.add('bought'); } },
        nopeFx(id) { const b = ov.querySelector(`.rg-node[data-node="${id}"]`); if (b) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); } },
        countdown(sec) { const w = ov.querySelector('.rg-st-wait'); if (w) w.textContent = sec > 0 ? `${sec}초 뒤에 저절로 출발해요` : ''; },
        waiting(text) { const w = ov.querySelector('.rg-st-wait'); if (w) w.textContent = text || ''; const go = ov.querySelector('.rg-go'); if (go && text) { go.disabled = true; go.textContent = '준비 완료!'; } },
        cancel() { timers.forEach(clearTimeout); }
      };
    }
    function clearShow() {
      root.classList.add('rg-gold');
      banner('도깨비 대왕 격파!', '숲에 평화가 왔어요', 2600);
      flash('rgba(255,226,122,.85)', 600);
    }
    // 전멸: 화면이 점점 흐려져요
    function dying() { root.classList.add('rg-dying'); setTimeout(() => root.classList.remove('rg-dying'), 1600); }

    return { root, reset, update, event, cards, pickFx, hideOver, rewindOn, title, settle, banner, big, flash, clearShow, dying, el: q };
  }

  window.RpgUI = { create, mount, CARD_ICON };
})();
