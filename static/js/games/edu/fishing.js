/* 아리채 오락실 · 바다 낚시 (바다관) — 초·중
   과학관·음악관 게임 — 방장이 고른 난이도로, 서버가 준 같은 시드로 가족 모두 같은 문제를 풀어요. */
(function () {
  'use strict';

  const G = window.Games;
  const {
    rng, shape, el, center, IDX, msgPop, retrigger, SLOTS, shuffle, eunNeun, GROUP,
    CREATURES, CR
  } = G.kit;


  const fishing = {
    id: 'fishing', edu: true,
    icon: `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M30 2 V16 Q30 22 25 22 Q21 22 21 18" fill="none" stroke="#E8EEF5" stroke-width="2.4" stroke-linecap="round"/><path d="M8 29 L2 23 L2 35 Z" fill="#E2700F"/><ellipse cx="21" cy="29" rx="15" ry="9" fill="#FF8A1F"/><rect x="14" y="21" width="3.4" height="16" fill="#fff"/><rect x="24" y="21" width="3.4" height="16" fill="#fff"/><circle cx="31" cy="27" r="2.2" fill="#1C1733"/></svg>`, hall: '바다관', title: '바다 낚시', cat: '바다 생물 분류', catColor: 'b', levels: ['e', 'm'],
    buttons: ['r', 'g', 'b'],
    rules(lv) {
      return lv === 'e'
        ? ['낚싯바늘 앞에 바다 친구가 올라와요', '물고기면 그 자리 버튼으로 낚아요', '해파리·문어·게는 물고기가 아니에요!']
        : ['위에 나오는 미션 동물만 낚아요', '미션은 15초마다 바뀌어요', '힌트를 보고 어떤 무리인지 생각해요'];
    },
    illus(lv) {
      const ids = lv === 'm' ? ['octopus', 'crab', 'dolphin'] : ['clownfish', 'jellyfish', 'shark'];
      const lab = lv === 'm' ? ['연체동물', '갑각류', '포유류'] : ['물고기 O', '물고기 X', '물고기 O'];
      return `<div class="il-row" style="gap:12px">${ids.map((id, i) =>
        `<div class="il-btn"><div style="width:72px">${CR[id].svg}</div><span>${CR[id].name}</span><span style="color:${lab[i].includes('X') ? '#FF8B95' : '#7DF0AE'}">${lab[i]}</span></div>`).join('')}</div>`;
    },
    learn(lv) {
      return lv === 'e'
        ? '물고기는 아가미로 숨 쉬고 지느러미로 헤엄쳐요. 상어·가오리·해마도 물고기! 하지만 해파리, 문어, 게, 불가사리는 물고기가 아니에요. 돌고래와 고래는 허파로 숨 쉬는 포유류예요.'
        : '바다 동물 분류: 어류(고등어·상어·해마), 연체동물(문어·오징어·조개), 갑각류(게·새우), 포유류(돌고래·고래·물범), 자포동물(해파리), 극피동물(불가사리), 파충류(바다거북).';
    },
    create(ctx) {
      const R = rng(ctx.seed);
      const lv = ctx.level === 'm' ? 'm' : 'e';
      const D = Math.max(5000, ctx.endAt - ctx.startAt);
      const MISSION_MS = 15000;
      const missions = lv === 'e'
        ? ['fish']
        : shuffle(R, ['fish', 'mollusc', 'crustacean', 'mammal']).slice(0, Math.ceil(D / MISSION_MS));
      const missionAt = (e) => missions[Math.min(missions.length - 1, Math.floor(e / MISSION_MS))];
      const byGroup = {};
      CREATURES.forEach((c) => { (byGroup[c.g] = byGroup[c.g] || []).push(c.id); });
      const events = [];
      let tt = 900;
      while (tt < D - 700) {
        const prog = tt / D;
        const mission = missionAt(tt);
        const wantTarget = R() < (lv === 'e' ? 0.55 : 0.5);
        let id;
        if (wantTarget) {
          const list = byGroup[mission];
          id = list[Math.floor(R() * list.length)];
        } else {
          const others = CREATURES.filter((c) => c.g !== mission);
          id = others[Math.floor(R() * others.length)].id;
        }
        const up = lv === 'e' ? 1900 - prog * 300 : 1500 - prog * 350;
        events.push({ at: tt, lane: Math.floor(R() * 3), id, up });
        tt += (lv === 'e' ? 1150 : 860) - prog * 220 + R() * 260;
      }
      let ptr = 0;
      let t0 = 0;
      let score = 0;
      let caught = 0;
      let wrong = 0;
      let curMission = '';
      const lanes = [null, null, null];

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="fs-wrap">
        <div class="fs-mission"><b class="disp"></b><span></span></div>
        <div class="fs-msg disp"></div>
        <div class="fs-sea">${SLOTS.map((c) => `<div class="fs-lane"><i class="fs-line"></i><div class="fs-hook"></div>
          <div class="fs-zone"></div><div class="fs-cre"><div class="fs-pic"></div><span class="fs-nm"></span></div>
          <span class="fs-tag" style="background:${G.HEX[c]}">${shape(c, 16)}</span></div>`).join('')}
          <div class="fs-bubbles"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="fs-rays"><i></i><i></i><i></i></div>
          <svg class="fs-floor" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 40 Q40 30 80 40 T160 38 T240 40 T300 36 L300 70 L0 70 Z" fill="#E8C98A"/>
            <path d="M0 52 Q50 44 100 52 T200 50 T300 50 L300 70 L0 70 Z" fill="#D4AE6A"/>
            <path d="M22 40 Q14 22 24 8 Q30 22 22 40 M30 40 Q38 24 32 4 Q24 22 30 40" fill="#2FA866"/>
            <path d="M150 38 Q142 18 152 2 Q160 18 150 38" fill="#38C177"/>
            <path d="M262 38 Q256 26 262 14 Q270 26 262 38 M270 38 Q280 22 274 10" fill="#2FA866" stroke="#2FA866" stroke-width="3"/>
            <g fill="#FF7A8A"><circle cx="92" cy="34" r="6"/><circle cx="100" cy="28" r="5"/><circle cx="106" cy="35" r="5"/><rect x="96" y="32" width="5" height="10"/></g>
            <g fill="#FFB347"><circle cx="208" cy="32" r="5"/><circle cx="215" cy="27" r="4"/><circle cx="220" cy="33" r="4"/><rect x="212" y="31" width="4" height="10"/></g>
            <path d="M58 48 l5 -4 l5 4 l-2 -6 l4 -4 h-6 l-1 -6 l-1 6 h-6 l4 4 Z" fill="#FF8A5B"/>
            <ellipse cx="180" cy="50" rx="9" ry="4" fill="#F4E3C2"/><path d="M171 50 Q180 40 189 50" fill="#F2C9A0"/>
          </svg></div>
        <div class="fs-info">잘 낚은 친구 <b>0</b></div>
      </div>`);
      ctx.stage.appendChild(wrap);
      const laneEls = Array.from(wrap.querySelectorAll('.fs-lane'));
      const creEls = Array.from(wrap.querySelectorAll('.fs-cre'));
      const mTitle = wrap.querySelector('.fs-mission b');
      const mHint = wrap.querySelector('.fs-mission span');
      const missionEl = wrap.querySelector('.fs-mission');
      const msg = wrap.querySelector('.fs-msg');
      const info = wrap.querySelector('.fs-info');

      function setMission(g) {
        curMission = g;
        const gi = GROUP[g];
        mTitle.textContent = g === 'fish' ? '물고기만 낚아요!' : `${gi.name}만 낚아요!`;
        mHint.textContent = gi.hint;
        retrigger(missionEl, 'flash');
      }
      function hide(i) {
        creEls[i].classList.remove('up');
        lanes[i] = null;
      }

      return {
        start(t) { t0 = t; setMission(missionAt(0)); },
        tick(t) {
          const e = t - t0;
          const m = missionAt(e);
          if (m !== curMission) {
            setMission(m);
            ctx.sfx.whoosh();
            ctx.vibrate([20, 30, 20]);
          }
          while (ptr < events.length && events[ptr].at <= e) {
            const ev = events[ptr++];
            if (lanes[ev.lane]) continue;
            const c = CR[ev.id];
            lanes[ev.lane] = { ev, upAt: e, done: false };
            const ce = creEls[ev.lane];
            ce.querySelector('.fs-pic').innerHTML = c.svg;
            ce.querySelector('.fs-nm').textContent = c.name;
            ce.className = 'fs-cre up';
          }
          lanes.forEach((L, i) => {
            if (L && !L.done && e - L.upAt > L.ev.up) hide(i);
          });
        },
        onPress(c, t) {
          const e = t - t0;
          const i = IDX[c];
          const L = lanes[i];
          const lane = laneEls[i];
          retrigger(lane, 'tug');
          if (!L || L.done) {
            msgPop(msg, '앗, 아무도 없어요', '#C9C3E6');
            return;
          }
          L.done = true;
          const cr = CR[L.ev.id];
          const p = center(ctx, creEls[i]);
          if (cr.g === curMission) {
            const quick = Math.max(0, Math.round(15 * (1 - (e - L.upAt) / L.ev.up)));
            const gain = 30 + quick;
            score += gain;
            caught++;
            creEls[i].classList.add('caught');
            ctx.fx.burst(p.x, p.y, '#7DF0AE', 12);
            ctx.fx.float('+' + gain, p.x, p.y - 40, '#FFD23F', 28);
            msgPop(msg, cr.surprise || `${cr.name} 낚았다!`, cr.surprise ? '#FFD23F' : '#7DF0AE');
            ctx.sfx.good();
            ctx.vibrate(12);
            info.innerHTML = `잘 낚은 친구 <b>${caught}</b>`;
          } else {
            wrong++;
            score = Math.max(0, score - 15);
            creEls[i].classList.add('wrongc');
            msgPop(msg, `${eunNeun(cr.name)} ${GROUP[cr.g].is}`, '#FF8B95');
            ctx.fx.float('-15', p.x, p.y - 40, '#FF8B95', 24);
            ctx.sfx.bad();
            ctx.vibrate([40, 30, 40]);
            ctx.lock(450);
          }
          ctx.setScore(score);
          setTimeout(() => { if (lanes[i] === L) hide(i); }, 380);
        },
        end() {},
        score: () => score,
        value: () => score,
        summary: () => `${caught}마리 낚음 · 실수 ${wrong}번`
      };
    }
  };

  G.register(fishing);
})();
