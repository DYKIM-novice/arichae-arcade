/* 아리채 오락실 · 오르골 리듬 (타이밍) — 누구나 아는 옛 노래(저작권 만료곡) 멜로디
   오락실 미니게임 — 버튼 3개로 모두 동시에, 서버가 준 같은 시드로 같은 문제가 나와요. */
(function () {
  'use strict';

  const G = window.Games;
  const { rng, COLS, HEX, shape, el, center, IDX, msgPop, retrigger, durOf } = G.kit;
  const A = window.Animals;

  // 음 이름 → MIDI 번호 (C4 = 60)
  const NOTE_IDX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const SOLFA = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];
  function parseTune(str) {
    return str.trim().split(/\s+/).map((tok) => {
      const [n, len] = tok.split(':');
      const m = n.match(/^([A-G]#?)(\d)$/);
      return { midi: 12 * (Number(m[2]) + 1) + NOTE_IDX[m[1]], beats: len ? Number(len) : 1 };
    });
  }
  // 노래 악보는 data/songs.js, 음악관 곡 순서는 static/games.json 의 "songs"
  const SD = G.SONG_DATA;
  const SONGS = SD.arcade.map(prepareSong);

  function prepareSong(s) {
    const notes = parseTune(s.notes);
    const uniq = Array.from(new Set(notes.map((n) => n.midi))).sort((a, b) => a - b);
    // 낮은 음 = 왼쪽(빨강), 가운데 음 = 가운데(초록), 높은 음 = 오른쪽(파랑)
    const laneOf = (n) => { n.lane = Math.min(2, Math.floor((uniq.indexOf(n.midi) * 3) / uniq.length)); };
    notes.forEach(laneOf);
    const out = Object.assign({}, s, { tune: notes });
    if (s.hard) {
      // 원곡 리듬 악보: 쉬운 악보에 없는 음이 있어도 높낮이 순서대로 줄을 나눠요
      out.hardTune = parseTune(s.hard);
      const all = Array.from(new Set(out.hardTune.map((n) => n.midi).concat(uniq))).sort((a, b) => a - b);
      out.hardTune.forEach((n) => { n.lane = Math.min(2, Math.floor((all.indexOf(n.midi) * 3) / all.length)); });
    }
    return out;
  }

  const HALL_ORDER = (G.MANIFEST && G.MANIFEST.songs) || SD.hall.map((s) => s.id);
  const LONG_SONGS = HALL_ORDER.map((id) => SD.hall.find((s) => s.id === id)).filter(Boolean).map(prepareSong);
  LONG_SONGS.forEach((s) => { s.sec = Math.round((s.tune.reduce((a, n) => a + n.beats, 0) * 60) / s.bpm); });
  G.MUSIC_SONGS = LONG_SONGS;

  const rhythm = {
    id: 'rhythm', title: '오르골 리듬', cat: '리듬', catColor: 'b', buttons: ['r', 'g', 'b'], music: false, pressSound: false,
    rules: ['음표가 선에 닿을 때 같은 줄 버튼!', '잘 맞히면 오르골 소리로 클래식이 연주돼요', '낮은 음은 왼쪽, 높은 음은 오른쪽이에요'],
    illus() {
      return `<div class="il-row" style="gap:14px"><div class="il-rhythm">${COLS.map((c, i) => `<div class="ir-lane"><i style="background:${HEX[c]};top:${20 + i * 22}%"></i><b style="border-color:${HEX[c]}"></b></div>`).join('')}</div>
        <div class="il-cap" style="text-align:left">♪ 환희의 송가<br>♪ 엘리제를 위하여<br>♪ 터키 행진곡 …</div></div>`;
    },
    create(ctx) { return rhythm.createWith(ctx, {}); },
    // 음악관(과학관 모드)에서도 같은 게임을 빠르기만 바꿔서 써요
    createWith(ctx, opts) {
      const R = rng(ctx.seed);
      const D = durOf(ctx);
      const LEAD = 2200;
      const FALL = opts && opts.long && opts.level === 'x' ? 1250 : 1500;
      // 랜덤으로 한 곡만 골라서 연주해요
      // 오락실: 짧은 곡을 시간이 될 때까지 반복 / 음악관(long): 긴 곡을 처음부터 끝까지 한 번
      const isLong = !!(opts && opts.long);
      const list = isLong ? LONG_SONGS : SONGS;
      const picked = opts && opts.songId ? list.find((x) => x.id === opts.songId) : null;
      const theSong = picked || list[Math.floor(R() * list.length)];
      const notes = [];
      const titles = [];
      const beats = [];
      let at = LEAD;
      let speed = (opts && opts.speed) || 1;
      let songEnd = 0;
      if (isLong) {
        // 음악관: 주제 → 변주 로 약 1분 30초 동안 한 곡을 연주해요
        const lv = (opts && opts.level) || 'm';
        const T = theSong.tune;
        const dbl = (tune) => tune.flatMap((n) => (n.beats >= 1
          ? [Object.assign({}, n, { beats: n.beats / 2 }), Object.assign({}, n, { beats: n.beats / 2 })]
          : [n]));
        const up = (tune) => tune.map((n) => Object.assign({}, n, { midi: n.midi + 12 }));
        // 변주는 곡의 앞 절반으로 (악보의 한 단락 단위) → 한 곡 약 1분 30초
        const halfOf = (tune) => {
          const total = tune.reduce((a, n) => a + n.beats, 0);
          const out = [];
          let acc = 0;
          for (const n of tune) {
            if (acc >= total / 2 - 0.01) break;
            out.push(n);
            acc += n.beats;
          }
          return out;
        };
        const H = halfOf(T);
        // 하: 주제 + 음표 두 배 변주 / 중: 조금 빠르게, 높은 소리로 두 배 변주
        // 상: 처음부터 음표 두 배 + 마디 첫 박마다 두 줄을 같이 누르는 화음 음표
        // 특상: 원곡 리듬(있으면) + 화음이 마디마다 두 번 + 더 빠르게, 음표도 빨리 떨어져요
        const sections = lv === 'x'
          ? [{ name: theSong.hardTune ? '주제 · 원곡 리듬 + 화음' : '주제 · 음표 두 배 + 화음', tune: theSong.hardTune || dbl(T), mul: 1, chord: 2 },
            { name: '변주 · 높은 소리 + 화음', tune: up(dbl(H)), mul: 1.1, chord: 2 }]
          : lv === 'e'
          ? [{ name: '주제', tune: T, mul: 1 }, { name: '변주 · 음표가 두 배로', tune: dbl(H), mul: 1 }]
          : lv === 'h'
            ? [{ name: '주제 · 음표 두 배', tune: dbl(T), mul: 1, chord: true }, { name: '변주 · 높은 소리 + 화음', tune: up(dbl(H)), mul: 1.08, chord: true }]
            : [{ name: '주제', tune: T, mul: 1 }, { name: '변주 · 높은 소리로 음표 두 배', tune: up(dbl(H)), mul: 1.05 }];
        const beatsOf = (tune) => tune.reduce((a, n) => a + n.beats, 0);
        const msOf = (secs) => secs.reduce((a, sec) => a + ((beatsOf(sec.tune) + 2) * 60000) / (theSong.bpm * sec.mul), 0);
        const avail = Math.max(5000, D - LEAD - 2500);
        const floor = lv === 'x' ? 1 : lv === 'h' ? 0.95 : 0.88;
        // 빠른 난이도에서 곡이 일찍 끝나 버리면 '피날레'로 주제 앞부분을 한 번 더 (약 1분 30초를 채워요)
        if (msOf(sections) / avail < speed * floor * 0.85) {
          const first = sections[0];
          const last = sections[sections.length - 1];
          const half = halfOf(first.tune);
          const coda = [half, halfOf(half)]
            .map((tune) => ({ name: '피날레 · 주제를 한 번 더', tune, mul: last.mul, chord: first.chord }))
            .find((c) => msOf(sections.concat([c])) / avail <= speed);
          if (coda) sections.push(coda);
        }
        // 게임 시간에 맞게 빠르기를 살짝 조절 (상은 너무 느려지지 않게)
        const need = msOf(sections) / avail;
        speed = Math.min(Math.max(speed * 1.2, Math.min(need, 1.15)), Math.max(speed * floor, need));
        sections.forEach((sec, si) => {
          const beatMs = 60000 / (theSong.bpm * speed * sec.mul);
          titles.push({ at: at - beatMs * 2, name: si === 0 ? `${theSong.name}` : `${theSong.title} · ${sec.name}` });
          let t = at;
          let b = 0;
          let pos = 0;
          sec.tune.forEach((n) => {
            if (t < D - 1200) {
              notes.push({ at: t, lane: n.lane, midi: n.midi });
              // 화음: 마디 첫 박마다 한 옥타브 아래 음을 다른 줄에 같이
              const meter = theSong.meter || 4;
              const bp = (((pos - (theSong.pickup || 0)) % meter) + meter) % meter;
              const onBeat = bp < 0.01 || meter - bp < 0.01 || (sec.chord === 2 && Math.abs(bp - 2) < 0.01);
              if (sec.chord && onBeat) notes.push({ at: t, lane: n.lane === 0 ? 2 : 0, midi: n.midi - 12, chord: true });
            }
            t += n.beats * beatMs;
            pos += n.beats;
          });
          for (let x = at; x < t && x < D - 1200; x += beatMs) beats.push({ at: x, accent: b++ % 4 === 0 });
          songEnd = t;
          at = t + beatMs * 2;
        });
        notes.sort((a, b) => a.at - b.at);
      }
      for (let k = 0; !isLong && at < D - 3000; k++) {
        const song = theSong;
        const beatMs = 60000 / (song.bpm * speed);
        if (k === 0) titles.push({ at: at - beatMs * 2, name: song.name });
        let t = at;
        let b = 0;
        song.tune.forEach((n) => {
          if (t < D - 1200) notes.push({ at: t, lane: n.lane, midi: n.midi });
          t += n.beats * beatMs;
        });
        for (let x = at; x < t && x < D - 1200; x += beatMs) beats.push({ at: x, accent: b++ % 4 === 0 });
        songEnd = t;
        at = t + beatMs * 2;
      }
      notes.forEach((n) => { n.state = 'wait'; n.el = null; });
      let t0 = 0;
      let ptr = 0;
      let bptr = 0;
      let tptr = 0;
      let score = 0;
      let combo = 0;
      let maxCombo = 0;
      let perfect = 0;
      let hit = 0;
      let H = 400;
      let judgeY = 320;
      let finaleShown = false;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="rh-wrap mb"><div class="rh-song disp"></div><div class="rh-lanes">${COLS.map((c) =>
        `<div class="rh-lane" style="--c:${HEX[c]}"><div class="rh-receptor">${shape(c, 18)}</div></div>`).join('')}</div>
        <div class="rh-line"></div><div class="rh-judge disp"></div><div class="rh-combo disp"></div></div>`);
      ctx.stage.appendChild(wrap);
      const lanes = Array.from(wrap.querySelectorAll('.rh-lane'));
      const receptors = Array.from(wrap.querySelectorAll('.rh-receptor'));
      const judge = wrap.querySelector('.rh-judge');
      const comboEl = wrap.querySelector('.rh-combo');
      const songEl = wrap.querySelector('.rh-song');

      function showJudge(text, color) {
        msgPop(judge, text, color);
        comboEl.textContent = combo >= 3 ? `${combo} COMBO` : '';
      }
      function removeNote(n) {
        if (n.el) { n.el.remove(); n.el = null; }
      }

      return {
        start(t) {
          t0 = t;
          H = wrap.clientHeight;
          judgeY = H - 78;
          wrap.querySelector('.rh-line').style.top = (judgeY + 20) + 'px';
          receptors.forEach((r) => { r.style.top = judgeY + 'px'; });
        },
        tick(t) {
          const e = t - t0;
          while (tptr < titles.length && titles[tptr].at <= e) {
            songEl.textContent = '♪ ' + titles[tptr++].name;
            retrigger(songEl, 'pop');
          }
          while (bptr < beats.length && beats[bptr].at <= e) ctx.sfx.mbTick(beats[bptr++].accent);
          if (isLong && !finaleShown && songEnd && e > songEnd + 600) {
            finaleShown = true;
            songEl.textContent = `👏 연주 완성! ${hit}음 / ${notes.length}음`;
            retrigger(songEl, 'pop');
            ctx.sfx.fanfare();
          }
          while (ptr < notes.length && notes[ptr].at - FALL <= e) {
            const n = notes[ptr++];
            n.el = el(`<div class="rh-note${n.chord ? ' chord' : ''}" style="--c:${HEX[COLS[n.lane]]}"><b>${SOLFA[n.midi % 12]}</b></div>`);
            lanes[n.lane].appendChild(n.el);
          }
          for (let i = 0; i < ptr; i++) {
            const n = notes[i];
            if (n.state !== 'wait') continue;
            const y = judgeY - ((n.at - e) / FALL) * judgeY;
            if (n.el) n.el.style.transform = `translate(-50%, ${y.toFixed(1)}px)`;
            if (e - n.at > 180) {
              n.state = 'miss';
              removeNote(n);
              combo = 0;
              showJudge('MISS', '#FF8B95');
            }
          }
        },
        onPress(c, t) {
          const e = t - t0;
          const lane = IDX[c];
          retrigger(receptors[lane], 'hit');
          let best = null;
          for (let i = 0; i < ptr; i++) {
            const n = notes[i];
            if (n.state !== 'wait' || n.lane !== lane) continue;
            const d = Math.abs(e - n.at);
            if (d <= 180 && (!best || d < Math.abs(e - best.at))) best = n;
          }
          if (!best) {
            ctx.sfx.mbTick(false);
            return;
          }
          const d = Math.abs(e - best.at);
          best.state = 'hit';
          removeNote(best);
          ctx.sfx.musicbox(best.midi);
          combo++;
          hit++;
          maxCombo = Math.max(maxCombo, combo);
          let base;
          if (d < 60) { base = 100; perfect++; showJudge('PERFECT', '#FFD23F'); ctx.vibrate(10); }
          else if (d < 120) { base = 70; showJudge('GREAT', '#7DF0AE'); ctx.vibrate(6); }
          else { base = 40; showJudge('GOOD', '#A9C4FF'); }
          score += base + Math.min(30, combo) * 2;
          ctx.setScore(score);
          const p = center(ctx, receptors[lane]);
          ctx.fx.burst(p.x, p.y, HEX[c], d < 60 ? 12 : 6);
          ctx.setBadge(combo >= 5 ? `${combo} 콤보` : null, 'b');
        },
        end() {},
        // 음악관: 곡이 끝나고 3초 뒤에 판을 끝내요 (시작부터 ms, 없으면 0)
        plannedEnd: () => (isLong && songEnd ? songEnd + 3000 : 0),
        score: () => score,
        value: () => score,
        summary: () => `${notes.length}음 중 ${hit}음 연주 · 최대 ${maxCombo}콤보`
      };
    }
  };

  G.register(rhythm);
})();
