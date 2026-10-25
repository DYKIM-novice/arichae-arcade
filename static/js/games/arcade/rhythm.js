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
  // 1박 이상인 음을 반박 둘로 (같은 음을 두 번)
  const dbl = (tune) => tune.flatMap((n) => (n.beats >= 1
    ? [Object.assign({}, n, { beats: n.beats / 2 }), Object.assign({}, n, { beats: n.beats / 2 })]
    : [n]));
  // 한 옥타브 높게 (줄은 원래 음 높이 그대로)
  const up = (tune) => tune.map((n) => Object.assign({}, n, { midi: n.midi + 12 }));

  // 노래 악보는 data/songs.js, 음악관 곡 순서는 static/games.json 의 "songs"
  const SD = G.SONG_DATA;
  const SONGS = SD.arcade.map(prepareSong);

  function prepareSong(s) {
    // 오락실 곡은 parts(단락 목록)로: { n: 악보, dbl: 음표 두 배, up: 12 = 한 옥타브 높게 }
    let notes;
    if (s.parts) {
      notes = [];
      s.parts.forEach((p) => {
        const part = typeof p === 'string' ? { n: p } : p;
        let t = parseTune(part.n);
        if (part.dbl) t = dbl(t);
        t.forEach((n) => { n.shift = part.up || 0; });
        notes.push(...t);
      });
    } else {
      notes = parseTune(s.notes);
    }
    const uniq = Array.from(new Set(notes.map((n) => n.midi))).sort((a, b) => a - b);
    // 낮은 음 = 왼쪽(빨강), 가운데 음 = 가운데(초록), 높은 음 = 오른쪽(파랑)
    const laneOf = (n) => { n.lane = Math.min(2, Math.floor((uniq.indexOf(n.midi) * 3) / uniq.length)); };
    notes.forEach(laneOf);
    notes.forEach((n) => { if (n.shift) n.midi += n.shift; delete n.shift; });
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

  /* 음악관 난이도별 설정
     fall = 음표가 떨어지는 시간(ms), win = 판정 [PERFECT, GREAT, GOOD] (ms), floor = 최소 빠르기 비율
     runs = 좌우중간 반박자 콤보 (gap = 콤보 사이 최소 박, p = 고를 확률, min/max = 반박 음표 수,
            minMs = 반박이 이보다 짧으면 그 단락엔 콤보를 안 넣어요) */
  const WIN = [60, 120, 180];
  const HALL_LV = {
    e: { fall: 1500, floor: 0.88, win: WIN, runs: null },
    m: { fall: 1500, floor: 0.88, win: WIN, runs: { gap: 16, p: 0.6, min: 4, max: 4, minMs: 215, types: ['up', 'down'] } },
    h: { fall: 1500, floor: 0.95, win: WIN, runs: { gap: 7, p: 0.75, min: 4, max: 6, minMs: 195, types: ['up', 'down', 'zig'] } },
    x: { fall: 1250, floor: 1, win: WIN, runs: { gap: 3, p: 0.85, min: 4, max: 8, minMs: 175, types: ['up', 'down', 'zig', 'trill'] } },
    z: { fall: 1050, floor: 1, win: [45, 95, 140], runs: { gap: 1, p: 1, min: 4, max: 12, minMs: 160, types: ['wave', 'zig', 'trill', 'up', 'down'] }, minGap: 110 }
  };
  const RUN_NAME = { up: '올라가기', down: '내려가기', zig: '지그재그', trill: '트릴', wave: '물결' };
  // 멜로디 음과 어울리는 음정 (반음 수, 옥타브 무시): 같은 음·3도·4도·5도·6도
  const CONSONANT = new Set([0, 3, 4, 5, 7, 8, 9]);

  /* 좌우중간 반박자 콤보 만들기
     1박 이상 긴 멜로디 음을 반박으로 쪼개서, 그 음과 어울리는 화음 음(분산화음)이나 이웃음·경과음으로 채워요.
     멜로디 음은 제 박자에 그대로 두고, 새 음도 이 곡에 나오는 음 중에서만 골라서 줄 = 음 높이가 그대로 맞아요. */
  function addRuns(tune, cfg, R) {
    const laneOf = new Map();
    tune.forEach((n) => laneOf.set(n.midi, n.lane));
    const U = Array.from(laneOf.keys()).sort((a, b) => a - b);
    const lanesUsed = new Set(laneOf.values());
    if (lanesUsed.size < 3) return { tune, runs: [] };
    const half = (b) => Math.abs(b * 2 - Math.round(b * 2)) < 1e-6;
    const out = [];
    const runs = [];
    // 그 자리 앞뒤 6박 안에 나오는 음이름만 써요 (곡의 그 부분 조성·화음에 맞게)
    const starts = [];
    let acc = 0;
    tune.forEach((n) => { starts.push(acc); acc += n.beats; });
    const localPC = (from, to) => new Set(tune.filter((n, k) => starts[k] >= from - 6 && starts[k] <= to + 6).map((n) => n.midi % 12));
    let pos = 0;
    let lastEnd = -1e9;
    for (let i = 0; i < tune.length;) {
      const n = tune[i];
      if (n.beats >= 1 && half(n.beats) && half(pos) && pos - lastEnd >= cfg.gap - 1e-6 && R() < cfg.p) {
        // 긴 음(1박 이상)에서 시작해서, 뒤따르는 반박 음까지 이어서 한 콤보로 (원래 반박 음은 그대로)
        let j = i;
        let slots = 0;
        let free = 0;
        while (j < tune.length && tune[j].beats >= 0.5 && half(tune[j].beats) && slots + tune[j].beats * 2 <= cfg.max) {
          slots += tune[j].beats * 2;
          free += tune[j].beats * 2 - 1;
          j++;
        }
        // 곡(단락)의 마지막 음은 그대로 길게 끝내요
        if (j < tune.length && slots >= cfg.min && free >= 2) {
          const pcs = localPC(starts[i], starts[j]);
          const gen = buildRun(tune.slice(i, j), tune[j], cfg.types[Math.floor(R() * cfg.types.length)], laneOf, U.filter((c) => pcs.has(c % 12)), R);
          if (gen) {
            const id = runs.length;
            runs.push({ kind: gen.kind, len: gen.length });
            gen.forEach((g, k) => out.push({ midi: g.midi, lane: g.lane, beats: 0.5, run: id, runFirst: k === 0, gen: g.gen }));
            for (let k = i; k < j; k++) pos += tune[k].beats;
            lastEnd = pos;
            i = j;
            continue;
          }
        }
      }
      out.push(n);
      pos += n.beats;
      i++;
    }
    return { tune: out, runs };
  }
  function buildRun(win, next, kind, laneOf, U, R) {
    const slots = [];
    win.forEach((m) => {
      slots.push({ fixed: m.midi, mel: m.midi });
      for (let k = 1; k < m.beats * 2; k++) slots.push({ fixed: null, mel: m.midi });
    });
    // 각 칸 다음에 오는 멜로디 음 (경과음은 이 음으로 이어지게)
    let nf = next ? next.midi : null;
    for (let s = slots.length - 1; s >= 0; s--) {
      slots[s].nextFixed = nf;
      if (slots[s].fixed !== null) nf = slots[s].fixed;
    }
    const startLane = laneOf.get(slots[0].fixed);
    // 맨 오른쪽에서는 올라갈 수 없으니 내려가기로 (맨 왼쪽은 반대로)
    if (kind === 'up' && startLane === 2) kind = 'down';
    else if (kind === 'down' && startLane === 0) kind = 'up';
    let dir = kind === 'down' ? -1 : kind === 'up' ? 1 : startLane === 2 ? -1 : startLane === 0 ? 1 : (R() < 0.5 ? 1 : -1);
    const zigFrom = startLane === 1 ? (R() < 0.5 ? 0 : 2) : null;
    const trillOther = startLane === 1 ? (R() < 0.5 ? 0 : 2) : 1;
    const res = [{ midi: slots[0].fixed, lane: startLane, gen: false }];
    for (let s = 1; s < slots.length; s++) {
      const sl = slots[s];
      const prev = res[res.length - 1];
      if (sl.fixed !== null) {
        const ln = laneOf.get(sl.fixed);
        if (ln !== prev.lane) dir = ln > prev.lane ? 1 : -1;
        res.push({ midi: sl.fixed, lane: ln, gen: false });
        continue;
      }
      let want;
      if (kind === 'zig') want = prev.lane === 0 ? 2 : prev.lane === 2 ? 0 : zigFrom;
      else if (kind === 'trill') want = prev.lane === startLane ? trillOther : startLane;
      else {
        want = prev.lane + dir;
        if (kind === 'up' || kind === 'down') {
          // 한쪽으로 쓸어 올리고(내리고) 끝에 닿으면 한 칸 되돌아요
          if (want < 0 || want > 2) want = prev.lane - dir;
        } else if (want < 0 || want > 2) { dir = -dir; want = prev.lane + dir; }
      }
      const isLastFree = s === slots.length - 1 || slots[s + 1].fixed !== null;
      const ok = (c) => {
        if (c === prev.midi || Math.abs(c - sl.mel) > 12) return false;
        const cons = CONSONANT.has(((c - sl.mel) % 12 + 12) % 12);
        const passing = sl.nextFixed !== null && Math.abs(c - prev.midi) <= 2 && Math.abs(sl.nextFixed - c) <= 2
          && (c - prev.midi) * (sl.nextFixed - c) > 0;
        return cons || passing;
      };
      let cand = U.filter((c) => laneOf.get(c) === want && ok(c));
      if (!cand.length) return null;
      let best = null;
      let bs = 1e9;
      cand.forEach((c) => {
        let sc = Math.abs(c - prev.midi) + R() * 0.8;
        if (!CONSONANT.has(((c - prev.midi) % 12 + 12) % 12) && Math.abs(c - prev.midi) > 2) sc += 3;
        if (isLastFree && sl.nextFixed !== null) sc += 0.5 * Math.abs(c - sl.nextFixed);
        if (sc < bs) { bs = sc; best = c; }
      });
      res.push({ midi: best, lane: want, gen: true });
    }
    // 줄이 적어도 두 번은 바뀌어야 콤보 (같은 줄만 누르면 그냥 연타)
    let moves = 0;
    for (let k = 1; k < res.length; k++) if (res[k].lane !== res[k - 1].lane) moves++;
    if (moves < Math.min(3, res.length - 1)) return null;
    res.kind = kindOf(res.map((r) => r.lane));
    return res;
  }
  // 실제로 만들어진 줄 순서로 콤보 이름 붙이기
  function kindOf(ls) {
    let alt = ls.length >= 4;
    for (let k = 2; k < ls.length; k++) if (ls[k] !== ls[k - 2] || ls[k] === ls[k - 1]) alt = false;
    if (alt) return Math.abs(ls[0] - ls[1]) === 2 ? 'zig' : 'trill';
    let u = 0;
    let d = 0;
    for (let k = 1; k < ls.length; k++) { if (ls[k] > ls[k - 1]) u++; else if (ls[k] < ls[k - 1]) d++; }
    return u >= d * 2 ? 'up' : d >= u * 2 ? 'down' : 'wave';
  }

  const rhythm = {
    id: 'rhythm', title: '오르골 리듬', cat: '리듬', catColor: 'b', buttons: ['r', 'g', 'b'], music: false, pressSound: false,
    rules: ['음표가 선에 닿을 때 같은 줄 버튼!', '잘 맞히면 오르골 소리로 클래식 한 곡이 연주돼요', '낮은 음은 왼쪽, 높은 음은 오른쪽이에요'],
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
      const isLong = !!(opts && opts.long);
      const lv = (opts && opts.level) || 'm';
      const LVC = isLong ? (HALL_LV[lv] || HALL_LV.m) : HALL_LV.e;
      const FALL = isLong ? LVC.fall : 1500;
      const [W_PERFECT, W_GREAT, W_GOOD] = LVC.win;
      // 랜덤으로 한 곡만 골라서 연주해요
      // 오락실: 한 곡의 긴 단락을 한 번 (게임 시간에 맞게 빠르기를 살짝 맞춰요) / 음악관(long): 긴 곡을 처음부터 끝까지 한 번
      const list = isLong ? LONG_SONGS : SONGS;
      const picked = opts && opts.songId ? list.find((x) => x.id === opts.songId) : null;
      const theSong = picked || list[Math.floor(R() * list.length)];
      const notes = [];
      const titles = [];
      const beats = [];
      const runs = [];
      let at = LEAD;
      let speed = (opts && opts.speed) || 1;
      let songEnd = 0;
      if (isLong) {
        // 음악관: 주제 → 변주 로 약 1분 30초 동안 한 곡을 연주해요
        const T = theSong.tune;
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
        // 헬: 특상보다 더 빠르게 + 음표가 더 빨리 + 박마다 화음 + 길고 촘촘한 콤보 + 판정이 엄격
        // (base = 원래 악보, dbl = 음표 두 배, up = 한 옥타브 높게)
        const sections = lv === 'z'
          ? [{ name: theSong.hardTune ? '주제 · 헬 · 원곡 리듬' : '주제 · 헬', base: theSong.hardTune || T, dbl: !theSong.hardTune, mul: 1, chord: 3 },
            { name: '변주 · 헬 · 높은 소리 + 화음 폭풍', base: H, dbl: true, up: true, mul: 1.12, chord: 3 }]
          : lv === 'x'
          ? [{ name: theSong.hardTune ? '주제 · 원곡 리듬 + 화음' : '주제 · 음표 두 배 + 화음', base: theSong.hardTune || T, dbl: !theSong.hardTune, mul: 1, chord: 2 },
            { name: '변주 · 높은 소리 + 화음', base: H, dbl: true, up: true, mul: 1.1, chord: 2 }]
          : lv === 'e'
          ? [{ name: '주제', base: T, mul: 1 }, { name: '변주 · 음표가 두 배로', base: H, dbl: true, mul: 1 }]
          : lv === 'h'
            ? [{ name: '주제 · 음표 두 배', base: T, dbl: true, mul: 1, chord: 1 }, { name: '변주 · 높은 소리 + 화음', base: H, dbl: true, up: true, mul: 1.08, chord: 1 }]
            : [{ name: '주제', base: T, mul: 1 }, { name: '변주 · 높은 소리로 음표 두 배', base: H, dbl: true, up: true, mul: 1.05 }];
        const beatsOf = (tune) => tune.reduce((a, n) => a + n.beats, 0);
        const msOf = (secs) => secs.reduce((a, sec) => a + ((beatsOf(sec.base) + 2) * 60000) / (theSong.bpm * sec.mul), 0);
        const avail = Math.max(5000, D - LEAD - 2500);
        const floor = LVC.floor;
        // 빠른 난이도에서 곡이 일찍 끝나 버리면 '피날레'로 주제 앞부분을 한 번 더 (약 1분 30초를 채워요)
        if (msOf(sections) / avail < speed * floor * 0.85) {
          const first = sections[0];
          const last = sections[sections.length - 1];
          const half = halfOf(first.base);
          const coda = [half, halfOf(half)]
            .map((base) => ({ name: '피날레 · 주제를 한 번 더', base, dbl: first.dbl, mul: last.mul, chord: first.chord }))
            .find((c) => msOf(sections.concat([c])) / avail <= speed);
          if (coda) sections.push(coda);
        }
        // 게임 시간에 맞게 빠르기를 살짝 조절 (상은 너무 느려지지 않게)
        const need = msOf(sections) / avail;
        speed = Math.min(Math.max(speed * 1.2, Math.min(need, 1.15)), Math.max(speed * floor, need));
        // 헬: 가장 짧은 음 사이가 너무 붙지 않게 (폰에서 읽을 수 있게)
        if (LVC.minGap) {
          sections.forEach((sec) => {
            const minB = Math.min(0.5, ...sec.base.map((n) => n.beats));
            const maxSpeed = (60000 * minB) / (theSong.bpm * sec.mul * LVC.minGap);
            if (speed > maxSpeed) speed = maxSpeed;
          });
        }
        sections.forEach((sec, si) => {
          const beatMs = 60000 / (theSong.bpm * speed * sec.mul);
          // 좌우중간 반박자 콤보 (반박이 너무 짧으면 이 단락엔 안 넣어요)
          let tune = sec.base;
          let secRuns = [];
          if (LVC.runs && beatMs / 2 >= LVC.runs.minMs) {
            const got = addRuns(tune, LVC.runs, R);
            tune = got.tune;
            secRuns = got.runs;
          }
          if (sec.dbl) tune = dbl(tune);
          if (sec.up) tune = up(tune);
          const runBase = runs.length;
          secRuns.forEach((r) => runs.push({ kind: r.kind, len: r.len, hit: 0, broken: false, cued: false }));
          titles.push({ at: at - beatMs * 2, name: si === 0 ? `${theSong.name}` : `${theSong.title} · ${sec.name}` });
          let t = at;
          let b = 0;
          let pos = 0;
          const meter = theSong.meter || 4;
          tune.forEach((n) => {
            if (t < D - 1200) {
              const runId = n.run === undefined ? -1 : runBase + n.run;
              notes.push({ at: t, lane: n.lane, midi: n.midi, run: runId, runFirst: !!n.runFirst });
              // 화음: 마디 첫 박마다 한 옥타브 아래 음을 다른 줄에 같이 (콤보 음표에는 안 붙여요)
              const bp = (((pos - (theSong.pickup || 0)) % meter) + meter) % meter;
              const onInt = Math.abs(bp - Math.round(bp)) < 0.01;
              const onBeat = bp < 0.01 || meter - bp < 0.01 || (sec.chord >= 2 && Math.abs(bp - 2) < 0.01) || (sec.chord === 3 && onInt);
              if (sec.chord && onBeat && runId < 0) notes.push({ at: t, lane: n.lane === 0 ? 2 : 0, midi: n.midi - 12, chord: true, run: -1 });
            }
            t += n.beats * beatMs;
            pos += n.beats;
          });
          for (let x = at; x < t && x < D - 1200; x += beatMs) beats.push({ at: x, accent: b++ % 4 === 0 });
          songEnd = t;
          at = t + beatMs * 2;
        });
        // 게임 시간에 잘린 콤보는 남은 음표 수로
        runs.forEach((r, i) => { r.len = notes.filter((n) => n.run === i).length; if (!r.len) r.broken = true; });
        notes.sort((a, b) => a.at - b.at);
      } else {
        // 오락실: 한 곡의 긴 단락을 한 번, 게임 시간(약 40초)에 꼭 맞게 빠르기를 0.88~1.12배로
        const T = theSong.tune;
        const total = T.reduce((a, n) => a + n.beats, 0);
        const last = T[T.length - 1];
        const fitBeats = total - last.beats + Math.min(1, last.beats);
        const availA = Math.max(4000, D - LEAD - 1800);
        speed = Math.min(1.12, Math.max(0.88, (fitBeats * 60000) / theSong.bpm / availA));
      }
      // 오락실: 곡이 게임 시간보다 짧을 때만 되풀이 (지금 곡들은 모두 한 번에 끝까지)
      for (let k = 0; !isLong && at < D - 3000; k++) {
        const song = theSong;
        const beatMs = 60000 / (song.bpm * speed);
        if (k === 0) titles.push({ at: at - beatMs * 2, name: song.name });
        let t = at;
        let b = 0;
        song.tune.forEach((n) => {
          if (t < D - 1200) notes.push({ at: t, lane: n.lane, midi: n.midi, run: -1 });
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
      let runsDone = 0;
      let H = 400;
      let judgeY = 320;
      let finaleShown = false;

      ctx.stage.innerHTML = '';
      const wrap = el(`<div class="rh-wrap mb${isLong && lv === 'z' ? ' hell' : ''}"><div class="rh-song disp"></div><div class="rh-lanes">${COLS.map((c) =>
        `<div class="rh-lane" style="--c:${HEX[c]}"><div class="rh-receptor">${shape(c, 18)}</div></div>`).join('')}</div>
        <div class="rh-line"></div><div class="rh-judge disp"></div><div class="rh-combo disp"></div><div class="rh-runcue disp"></div></div>`);
      ctx.stage.appendChild(wrap);
      const lanes = Array.from(wrap.querySelectorAll('.rh-lane'));
      const receptors = Array.from(wrap.querySelectorAll('.rh-receptor'));
      const judge = wrap.querySelector('.rh-judge');
      const comboEl = wrap.querySelector('.rh-combo');
      const songEl = wrap.querySelector('.rh-song');
      const runCue = wrap.querySelector('.rh-runcue');

      function showJudge(text, color) {
        msgPop(judge, text, color);
        comboEl.textContent = combo >= 3 ? `${combo} COMBO` : '';
      }
      function removeNote(n) {
        if (n.el) { n.el.remove(); n.el = null; }
      }
      function breakRun(n) {
        if (n.run >= 0 && runs[n.run]) runs[n.run].broken = true;
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
          if (!finaleShown && songEnd && e > songEnd + 600 && (isLong || songEnd + 600 < D)) {
            finaleShown = true;
            songEl.textContent = `👏 연주 완성! ${hit}음 / ${notes.length}음`;
            retrigger(songEl, 'pop');
            ctx.sfx.fanfare();
          }
          while (ptr < notes.length && notes[ptr].at - FALL <= e) {
            const n = notes[ptr++];
            const cls = (n.chord ? ' chord' : '') + (n.run >= 0 ? ' run' : '') + (n.runFirst ? ' run-first' : '');
            n.el = el(`<div class="rh-note${cls}" style="--c:${HEX[COLS[n.lane]]}"><b>${SOLFA[n.midi % 12]}</b></div>`);
            lanes[n.lane].appendChild(n.el);
            // 콤보가 시작될 때 작게 "콤보!" 알림
            if (n.runFirst && runs[n.run] && !runs[n.run].cued) {
              runs[n.run].cued = true;
              msgPop(runCue, `콤보! ${RUN_NAME[runs[n.run].kind] || ''} ${runs[n.run].len}`, '#FFE27A');
            }
          }
          for (let i = 0; i < ptr; i++) {
            const n = notes[i];
            if (n.state !== 'wait') continue;
            const y = judgeY - ((n.at - e) / FALL) * judgeY;
            if (n.el) n.el.style.transform = `translate(-50%, ${y.toFixed(1)}px)`;
            if (e - n.at > W_GOOD) {
              n.state = 'miss';
              removeNote(n);
              breakRun(n);
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
            if (d <= W_GOOD && (!best || d < Math.abs(e - best.at))) best = n;
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
          if (d < W_PERFECT) { base = 100; perfect++; showJudge('PERFECT', '#FFD23F'); ctx.vibrate(10); }
          else if (d < W_GREAT) { base = 70; showJudge('GREAT', '#7DF0AE'); ctx.vibrate(6); }
          else { base = 40; showJudge('GOOD', '#A9C4FF'); }
          score += base + Math.min(30, combo) * 2;
          // 좌우중간 콤보를 하나도 안 놓치고 끝까지 치면 보너스 (음표 하나에 25점)
          const run = best.run >= 0 ? runs[best.run] : null;
          if (run && !run.broken && ++run.hit === run.len) {
            const bonus = 25 * run.len;
            score += bonus;
            runsDone++;
            msgPop(runCue, `콤보 성공! +${bonus}`, '#7DF0AE');
            ctx.sfx.lamp();
            const p0 = center(ctx, receptors[1]);
            ctx.fx.burst(p0.x, p0.y - 40, '#FFE27A', 16);
          }
          ctx.setScore(score);
          const p = center(ctx, receptors[lane]);
          ctx.fx.burst(p.x, p.y, HEX[c], d < W_PERFECT ? 12 : 6);
          ctx.setBadge(combo >= 5 ? `${combo} 콤보` : null, 'b');
        },
        end() {},
        // 음악관: 곡이 끝나고 3초 뒤에 판을 끝내요 (시작부터 ms, 없으면 0)
        plannedEnd: () => (isLong && songEnd ? songEnd + 3000 : 0),
        score: () => score,
        value: () => score,
        // 시험용: 이번 판 음표 (자동 연주·같은 음표 확인)
        _dbg: () => ({ t0, notes, runs, speed, fall: FALL, win: LVC.win, song: theSong.name }),
        summary: () => `${notes.length}음 중 ${hit}음 연주 · 최대 ${maxCombo}콤보${runs.length ? ` · 좌우 콤보 ${runsDone}/${runs.filter((r) => r.len).length}` : ''}`
      };
    }
  };

  G.register(rhythm);
})();
