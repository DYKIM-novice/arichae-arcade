/* 아리채 오락실 · 올림픽관 '혼자 연습 · 즉시 재도전'
   - 대기실 종목 카드의 [연습] (누구나 · 방 설정은 안 바뀌어요) → 규칙 카드 → 3·2·1 → 경기
   - 방 경기와 같은 플레이 화면(#s-play)·패드·효과를 빌려 써요. 패드 입력은 App.takePad 로 잠깐 가져와요
   - 서버 없이 이 폰에서만 돌아요: 점수·기록을 서버에 보내지 않아요 (기록실에도 안 올라가요)
   - AI 선수 기록은 서버 olympic.py 의 new_event · bot_perf 와 같은 규칙으로 여기서 만들어요 (시드로 정해져요)
   - 끝나면 결과 판: 내 기록 · 이 기기 최고 기록(신기록!) · AI 와 순위 · [다시!] (아무 버튼이나 눌러도 바로 다시)
   - 최고 기록은 누른 기록(log)·시드와 같이 저장해서, 다음 판에 '내 최고' 유령 선수로 같이 달려요
     (규칙이 화면과 떨어진 순수 계산이라 같은 시드 + 같은 누른 기록이면 똑같이 다시 움직여요)
   - 방장이 경기를 시작하면(방 상태가 바뀌면) 연습은 바로 끝나고 방 경기로 가요
   - 난이도 이지·노멀·하드·헬 (연습만 · ctx.diff 로 종목 규칙이 판정 칸·벌칙·흔들림을 바꿔요, AI 실력도 같이)
     최고 기록·유령은 난이도마다 따로 저장해요 (노멀은 예전 기록과 같은 칸)
   - 한 판 끝나면 서버에 작은 XP 를 달라고 해요 (pxp · 하루 한도) */
(function () {
  'use strict';

  const App = window.App;
  const O = window.Oly;
  const G = window.Games;
  if (!App || !O || !G) return;
  const { $, $$, esc, S, SND } = App;
  const P = App.play;
  // 연습 시계: 멈춘 동안은 서 있고, 다시 하면 멈췄던 만큼 늦게 가요 (누른 기록·유령이 그대로 맞아요)
  const realNow = () => performance.now();
  const now = () => (R.paused ? R.pauseAt : realNow()) - R.shift;

  /* ================================================================
     AI 선수 기록 — 서버 olympic.py 와 같은 규칙 (값은 시드로 정해져요)
     ================================================================ */
  const RACES = ['o100', 'ohurdle', 'oswim', 'wspeed', 'wshort', 'wbob', 'wslalom'];
  const RACE_BASE = {   // AI 단계별 기록(초) — 1 쉬움 … 5 국가대표
    o100: [18.5, 15.8, 13.7, 12.1, 10.8], ohurdle: [25.0, 21.5, 18.8, 16.6, 15.0],
    oswim: [44.0, 38.0, 33.0, 30.0, 27.5],   // 서버와 같아요 (수영 숨 박자 규칙에 맞춤)
    wspeed: [55.0, 48.0, 42.0, 38.0, 35.0], wshort: [46.0, 40.0, 35.5, 32.0, 29.0],
    wbob: [44.0, 39.0, 35.5, 32.5, 30.0], wslalom: [50.0, 44.0, 39.5, 36.0, 33.0]
  };
  const HURDLES = 10;
  const LIFT_STEPS = [40, 60, 80, 100, 120, 140, 160, 180, 200, 220];
  const rad = (d) => d * Math.PI / 180;
  const r2 = (v, n) => { const k = Math.pow(10, n || 0); return Math.round(v * k) / k; };

  function gauss(R) { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); }
  const gc = (R, mu, sd, lo, hi) => Math.max(lo, Math.min(hi, mu + sd * gauss(R)));
  const randint = (R, a, b) => a + Math.floor(R() * (b - a + 1));
  const uniform = (R, a, b) => a + (b - a) * R();
  const jumpDist = (v, ang) => Math.max(0, v * v * Math.sin(rad(2 * ang)) / 9.8 * 0.62);
  const javDist = (v, ang) => { const sp = 9 + v * 2.3; return Math.max(0, sp * sp * Math.sin(rad(2 * ang)) / 9.8 * 0.8); };

  // 종목마다 모두에게 같은 값 (출발 총 시각 · 바람)
  function newEvent(gid, R) {
    if (RACES.includes(gid)) return { gun: randint(R, 1800, 3000) };
    if (gid === 'oarch') { const w = []; for (let i = 0; i < 6; i++) w.push(r2(uniform(R, -1, 1), 2)); return { wind: w }; }
    return {};
  }

  // AI 선수 한 명의 이번 종목 기록 (score · 끝나는 시각 done(ms, 시작부터))
  //  lv 6 = 헬 (연습에만): 국가대표(5)보다 6% 빠르고, 거의 실수하지 않아요
  function botPerf(gid, lv, R, ev) {
    const hell = Math.round(lv) >= 6;
    const k = Math.max(1, Math.min(5, Math.round(lv) || 3)) - 1;
    if (RACES.includes(gid)) {
      const base = RACE_BASE[gid][k] * (hell ? 0.94 : 1);
      const t = gc(R, base, base * (hell ? 0.015 : 0.025), base * 0.9, base * 1.12);
      const out = { T: Math.round(t * 1000), react: hell ? randint(R, 120, 200) : randint(R, 140, 320) };
      if (gid === 'ohurdle') {
        const p = hell ? 0.02 : [0.35, 0.25, 0.16, 0.1, 0.05][k];
        out.knock = [];
        for (let i = 0; i < HURDLES; i++) if (R() < p) out.knock.push(i);
      }
      if (gid === 'wshort') {
        out.fall = R() < (hell ? 0.01 : [0.2, 0.14, 0.1, 0.06, 0.03][k]) ? 1 : 0;
        if (out.fall) out.T += 2500;
      }
      out.score = 100000 - (out.T + out.react);
      out.done = ev.gun + out.react + out.T + 600;
      return out;
    }
    if (gid === 'olong' || gid === 'ojav') {
      const vs = [6.6, 7.6, 8.6, 9.6, 10.4][k] + (hell ? 0.5 : 0);
      const foul = hell ? 0.03 : [0.25, 0.2, 0.15, 0.1, 0.06][k];
      const tries = [];
      let best = 0;
      for (let i = 0; i < 3; i++) {
        const v = gc(R, vs, 0.35, vs - 1, vs + 0.8);
        const ang = gc(R, gid === 'olong' ? 40 : 38, 6 - k, 20, 60);
        const f = R() < foul;
        const d = f ? 0 : Math.round((gid === 'olong' ? jumpDist(v, ang) : javDist(v, ang)) * 100);
        tries.push({ v: r2(v, 2), a: r2(ang, 1), d, f });
        best = Math.max(best, d);
      }
      return { tries, score: best, done: 1500 + 3 * 11000 };
    }
    if (gid === 'wjump') {
      const base = [72, 86, 100, 112, 123][k] + (hell ? 6 : 0);
      const tries = [];
      let best = 0;
      for (let i = 0; i < 2; i++) {
        const d = gc(R, base, 5, base - 18, base + 12);
        const fall = R() < (hell ? 0.02 : [0.18, 0.12, 0.08, 0.05, 0.03][k]);
        const cm = Math.round(d * 100 * (fall ? 0.8 : 1));
        tries.push({ d: cm, fall, bal: r2(uniform(R, -0.3, 0.3), 2) });
        best = Math.max(best, cm);
      }
      return { tries, score: best, done: 1500 + 2 * 14000 };
    }
    if (gid === 'olift') {
      const cap = gc(R, [75, 100, 125, 150, 175][k] + (hell ? 18 : 0), 8, 40, 220);
      const lifts = [];
      for (const w of LIFT_STEPS) {
        const ok = w <= cap;
        lifts.push({ kg: w, ok });
        if (!ok) break;
      }
      const best = Math.max(0, ...lifts.filter((x) => x.ok).map((x) => x.kg));
      return { lifts, score: best, done: 1500 + lifts.length * 4200 + 800 };
    }
    if (gid === 'oarch') {
      const mean = hell ? 9.7 : [5.5, 7.0, 8.0, 8.8, 9.4][k];
      const arrows = [];
      let tot = 0;
      let tens = 0;
      for (let i = 0; i < 6; i++) {
        const pts = Math.round(gc(R, mean, 1.4 - k * 0.15, 0, 10));
        const rr = pts > 0 ? (10.5 - pts) / 10 : 1.15;
        const a = uniform(R, 0, 2 * Math.PI);
        arrows.push({ p: pts, x: r2(Math.cos(a) * rr, 3), y: r2(Math.sin(a) * rr, 3) });
        tot += pts;
        tens += pts === 10 ? 1 : 0;
      }
      return { arrows, score: tot * 100 + tens, done: 2500 + 6 * 5500 };
    }
    return { score: 0, done: 0 };
  }

  /* ================================================================
     이 기기에 남기는 기록 (localStorage · 없거나 막혀도 연습은 돼요)
     pb[gid] = { score, rec, at, seed, ev, log, ath } · cnt[gid] = 도전 횟수 · opt = { ai, lv, ghost }
     ================================================================ */
  const KEY = 'arichae_oly_practice';
  // 규칙(sim)이 바뀌면 올려요 — 옛 규칙으로 저장한 누른 기록은 유령으로 다시 돌리지 않아요 (기록 숫자는 그대로)
  // 2: 연타가 '아무 버튼이나'로 바뀜
  // 3: 연타 빠르기 제한 없앰 · 필살기 부스터 · 멀리뛰기·창던지기 각도 잡을 때 안 느려짐 · 수영 숨 박자
  const RULES_V = 3;
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }
  function store(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  let DB = {};
  function reload() {
    DB = load();
    DB.pb = DB.pb && typeof DB.pb === 'object' ? DB.pb : {};
    DB.cnt = DB.cnt && typeof DB.cnt === 'object' ? DB.cnt : {};
    DB.opt = DB.opt && typeof DB.opt === 'object' ? DB.opt : {};
  }
  function persist() {
    if (store(DB)) return;
    // 저장 공간이 모자라면 오래된 유령(누른 기록)부터 지워요 · 기록 숫자는 남겨요
    const cur = R.gid ? pbKey(R.gid) : '';
    const ids = Object.keys(DB.pb).filter((k) => DB.pb[k] && DB.pb[k].log && k !== cur)
      .sort((a, b) => (DB.pb[a].at || 0) - (DB.pb[b].at || 0));
    for (const k of ids) { delete DB.pb[k].log; if (store(DB)) return; }
    if (DB.pb[cur]) delete DB.pb[cur].log;
    store(DB);
  }
  reload();

  // 최고 기록 칸: 노멀은 예전처럼 종목 id, 다른 난이도는 'o100@hell' 처럼 따로
  const pbKey = (gid, diff) => ((diff || curDiff()) === 'normal' ? gid : `${gid}@${diff || curDiff()}`);
  const pbOf = (gid, diff) => {
    const p = DB.pb[pbKey(gid, diff)];
    return p && typeof p.score === 'number' && p.score > 0 ? p : null;
  };
  const isTime = (def) => def && def.fmt === O.fmtTimeScore;
  const fmtOf = (def, sc) => (def && def.fmt ? def.fmt(sc) : String(sc));
  const shortRec = (def, sc) => fmtOf(def, sc).replace(/\s*\(완주 못함\)/, '');

  // 두 기록의 차이 글자 (a 가 b 보다 좋으면 +) — 종목마다 단위가 달라요
  function diffOf(gid, a, b) {
    const def = G.get(gid);
    if (isTime(def)) {
      if (a >= 50000 && b >= 50000) return { n: (a - b) / 1000, txt: `${Math.abs((a - b) / 1000).toFixed(2)}초`, up: '빨라졌어요', down: '느려요' };
      if (a < 50000 && b < 50000) return { n: a - b, txt: `${Math.abs((a - b) / 100).toFixed(1)}m`, up: '더 갔어요', down: '모자라요' };
      return null;
    }
    if (gid === 'olift') return { n: a - b, txt: `${Math.abs(a - b)}kg`, up: '더 들었어요', down: '모자라요' };
    if (gid === 'oarch') { const d = Math.floor(a / 100) - Math.floor(b / 100); return { n: a - b, txt: `${Math.abs(d)}점`, up: '올랐어요', down: '모자라요' }; }
    return { n: a - b, txt: `${Math.abs((a - b) / 100).toFixed(2)}m`, up: '늘었어요', down: '모자라요' };
  }

  /* ================================================================
     연습 상태
     ================================================================ */
  // 난이도 (연습만) — 규칙 값은 core.js 의 O.DIFF
  const DIFFS = [
    { k: 'easy', name: '이지', sub: '넉넉해요', ai: 'AI 쉬움~보통', desc: '판정 칸이 넓고 벌칙이 작아요 · 부정출발 없음 · 게이지도 빨리 차요' },
    { k: 'normal', name: '노멀', sub: '방 경기 규칙', ai: 'AI 잘함', desc: '방 경기와 똑같은 규칙이에요' },
    { k: 'hard', name: '하드', sub: '빡빡해요', ai: 'AI 선수~국가대표', desc: '판정 칸이 좁고 벌칙이 커요 · 흔들림·속임수가 더 많아요' },
    { k: 'hell', name: '헬', sub: '지옥 훈련', ai: 'AI 국가대표보다 강해요', desc: '아주 좁은 판정 · 큰 벌칙 · 속임수가 늘 나와요 · 펭귄도 한 번 더!' }
  ];
  const DIFF = {};
  DIFFS.forEach((d) => { DIFF[d.k] = d; });
  const curDiff = () => (DIFF[DB.opt && DB.opt.diff] ? DB.opt.diff : 'normal');
  const FLAME = '<svg class="olv-flame" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 1 C12 6 17 8 17 14 A7 7 0 0 1 3 14 C3 10 6 9 6 5 C8 7 9 8 9 10 C10 7 10 4 10 1 Z" fill="#FF8A3D"/><path d="M10 10 C11 13 13 14 13 16.5 A3 3 0 0 1 7 16.5 C7 14.5 9 13.5 10 10 Z" fill="#FFE27A"/></svg>';
  const diffBadge = (k, big) => `<span class="opd-b opd-${k}${big ? ' big' : ''}">${k === 'hell' ? FLAME : ''}${DIFF[k].name}</span>`;
  const MAX_AI = 6;          // 레인 8개 = 나 + AI 6 + 유령
  const R = {
    on: false, gid: null, def: null, key: '', back: 's-lobby',
    step: '',            // rules · count · play · result · pick
    run: null, raf: 0, root: null, quiet: false, guardUntil: 0, lastRiv: 0, lastSec: -1,
    tries: {},           // 이번에 연 뒤로 종목마다 몇 번 했나
    paused: false, pauseAt: 0, shift: 0, resumeAt: 0, pzCd: ''   // 잠깐 멈춤
  };

  const roomKey = (room) => (room ? `${room.phase}:${room.index}` : '');
  const myInfo = () => {
    const m = App.me() || {};
    return { pid: S.pid || 'me', name: m.name || '나', animal: m.animal || 'rabbit', connected: true, athlete: m.athlete || 'dino', bot: false };
  };
  function opts() {
    const o = DB.opt;
    return {
      ai: Number.isFinite(o.ai) ? Math.max(0, Math.min(MAX_AI, o.ai)) : 3,
      diff: curDiff(),
      ghost: o.ghost !== false
    };
  }
  const canGhost = (gid) => { const d = G.get(gid); const p = pbOf(gid); return !!(d && d.ghost && p && p.v === RULES_V && Array.isArray(p.log) && p.log.length); };
  // AI 실력: 난이도마다 (이지 1·2 섞어서 · 노멀 3 · 하드 4·5 · 헬 6)
  const aiLv = (diff, i) => { const L = O.diffP(diff).ai; return L[i % L.length]; };

  function canPractice() {
    const room = S.room;
    return !!(room && (room.phase === 'lobby' || room.phase === 'final') && !S.inst);
  }

  /* ---------- 경기 한 판 만들기 ---------- */
  function newRun(lead) {
    const def = R.def;
    const gid = R.gid;
    const o = opts();
    const me = myInfo();
    const seed = 1 + Math.floor(Math.random() * 2000000000);
    const rnd = G.rng(seed);
    const ev = newEvent(gid, rnd);
    // AI 선수: 내 선수와 다른 캐릭터를 순서대로 (다시 해도 같은 선수들)
    const aths = O.ATH.map((a) => a.id).filter((id) => id !== me.athlete);
    const bots = {};
    const botPlayers = [];
    for (let i = 0; i < o.ai; i++) {
      const id = aths[i % aths.length];
      const pid = `pai${i + 1}`;
      botPlayers.push({ pid, name: `AI ${O.name(id)}`, animal: '', connected: true, athlete: id, bot: true });
      bots[pid] = botPerf(gid, aiLv(o.diff, i), rnd, ev);
    }
    const players = [me];
    // 내 최고 기록 유령 (같은 시드·누른 기록을 화면 없이 다시 돌려요)
    let ghost = null;
    let gOff = 0;
    const pb = pbOf(gid);
    if (o.ghost && canGhost(gid)) {
      try {
        ghost = def.ghost({ seed: pb.seed, ev: pb.ev || {}, diff: o.diff }, pb.log);
        // 출발 총 시각이 판마다 달라요 → 이번 총소리에 유령의 총소리를 맞춰요
        if (pb.ev && pb.ev.gun != null && ev.gun != null) gOff = pb.ev.gun - ev.gun;
        // 유령은 내 바로 뒤 레인 (나란히 비교하기 쉽게)
        players.push({ pid: 'ghost', name: '내 최고', animal: '', connected: true, athlete: me.athlete, bot: true, ghost: true });
      } catch (e) { console.error(e); ghost = null; }
    }
    botPlayers.forEach((p) => players.push(p));
    const t = now();
    const startAt = t + lead;
    const endAt = startAt + (def.dur || 40) * 1000;
    const live = {};
    const ctx = {
      seed, level: '', song: '', startAt, endAt, myPid: me.pid, players,
      stage: $('#stage'),
      live: () => live,
      setScore: (n) => P.setScore(n),
      setBadge: (txt, c) => P.setBadge(txt, c),
      sfx: makeSfx(),
      vibrate: (p) => { if (!R.quiet) SND.vibrate(p); },
      lock: (ms) => P.lockPad(ms),
      fx: { burst: P.burst, float: P.floatText, shake: P.shake, flash: P.flash },
      ev, bots,
      diff: o.diff,               // 난이도 → 종목 규칙이 판정·벌칙을 바꿔요
      now,                        // 부스터 버튼을 누른 시각
      finish: () => { if (R.step === 'play') finishRun(); }
    };
    const run = { seed, ev, bots, players, ghost, gOff, startAt, endAt, live, ctx, me, diff: o.diff, ai: o.ai, inst: null, over: false, watchUntil: 0, pb };
    R.run = run;
    run.inst = def.create(ctx);
    // 첫 장면을 미리 그려 둬요 (소리·진동 없이)
    R.quiet = true;
    try {
      updateLive(run, startAt);
      run.inst.start(startAt);
      run.inst.tick(startAt);
    } finally { R.quiet = false; }
    P.setScore(0, true);
    R.lastSec = -1;
    renderRivals(true);
    return run;
  }

  function makeSfx() {
    const o = {};
    Object.keys(SND.SFX).forEach((k) => {
      o[k] = (...a) => { if (!R.quiet) SND.SFX[k](...a); };
    });
    o.perfect = () => { if (R.quiet) return; SND.SFX.perfect(); P.edgeFlash('rgba(255,210,63,.75)'); P.sparkleHud(6); };
    o.bad = () => { if (R.quiet) return; SND.SFX.bad(); P.edgeFlash('rgba(255,71,87,.55)'); };
    return o;
  }

  function updateLive(run, t) {
    const e = t - run.startAt;
    const cur = { ev: run.ev, bots: run.bots, startAt: run.startAt };
    Object.keys(run.bots).forEach((pid) => { run.live[pid] = R.def.botLive(run.bots[pid], e, cur); });
    if (run.ghost) run.live.ghost = run.ghost.at(e + run.gOff);
  }

  function endRun() {
    const run = R.run;
    R.run = null;
    if (run && run.inst) { try { run.inst.end(); } catch (e) { console.error(e); } }
  }

  /* ---------- 화면 ---------- */
  function resetPlayScreen() {
    P.cleanupGame();             // 무대·효과·패드를 처음 상태로 (방 경기가 쓰는 것과 같은 정리)
    P.setBadge(null);
    P.setScore(0, true);
    const sp = $('#s-play');
    sp.classList.remove('hurry');
    $('#hud-time').parentElement.classList.remove('hurry');
    $('#timebar-fill').classList.remove('hurry');
    $('#timebar-fill').style.transform = 'scaleX(1)';
    $('#rivals').innerHTML = '';
  }
  function padFor(def) {
    $$('#pad .bez').forEach((b) => b.classList.toggle('unused', !def.buttons.includes(b.dataset.c)));
    P.stylePad(def, '');
    $('#pad').classList.remove('opr-retry', 'disabled');
  }
  function setHudTime(ms) {
    const secs = Math.ceil(Math.max(0, ms) / 1000);
    const t = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const el = $('#hud-time');
    if (el.textContent !== t) el.textContent = t;
  }

  function mount() {
    App.showScreen('s-play');
    const sp = $('#s-play');
    sp.classList.add('opr-on');
    if (!R.root) {
      R.root = document.createElement('div');
      R.root.className = 'opr-root';
      R.root.innerHTML = '<div class="opr-slot"></div><div class="opr-count" aria-hidden="true"><b class="disp"></b><span></span></div><div class="opr-flash disp" aria-hidden="true">다시!</div>';
      sp.appendChild(R.root);
      // 플레이 화면은 끌어도 안 움직이게 막혀 있어요 → 규칙 카드·결과 판 안에서는 스크롤되게
      R.root.addEventListener('touchmove', (e) => { if (e.target.closest('.opr-sheet, .opr-panel')) e.stopPropagation(); }, { passive: true });
    }
    $('.hud-score .hint-sm').textContent = '연습 · 내 기록';
    place();
  }
  // 덮개 자리: 패드 위까지 (패드는 늘 보이게)
  function place() {
    if (!R.root) return;
    const sp = $('#s-play');
    const pad = $('#pad');
    const st = $('#stage');
    const bot = Math.max(0, sp.clientHeight - pad.offsetTop + 6);
    R.root.style.setProperty('--opr-bot', bot + 'px');
    R.root.style.setProperty('--opr-top', st.offsetTop + 'px');
    R.root.style.setProperty('--opr-l', st.offsetLeft + 'px');
    R.root.style.setProperty('--opr-w', st.offsetWidth + 'px');
  }
  const slot = () => R.root.querySelector('.opr-slot');
  function showSlot(html, cls) {
    const s = slot();
    s.className = 'opr-slot ' + (cls || '');
    s.innerHTML = html;
  }

  /* ---------- 규칙 카드 ---------- */
  function rulesHTML() {
    const def = R.def;
    const o = opts();
    const pb = pbOf(R.gid);
    const ghostOk = canGhost(R.gid);
    const rules = (typeof def.rules === 'function' ? def.rules('') : def.rules) || [];
    const cnt = DB.cnt[pbKey(R.gid)] || 0;
    const back = backLabel();
    return `<div class="opr-sheet opr-rules opr-c-${def.catColor || 'y'}" role="dialog" aria-label="${esc(def.title)} 연습">
      <div class="opr-head"><span class="opr-ic">${def.icon || ''}</span>
        <div class="opr-ttl"><span class="opr-cat">혼자 연습 · ${esc(def.cat || '')}</span><b class="disp">${esc(def.title)}</b></div>
        <button type="button" class="opr-x" data-opr-act="exit" aria-label="${back}">✕</button></div>
      <div class="opr-illus">${def.illus ? def.illus('') : ''}</div>
      <div class="opr-rl">${rules.map((r, i) => `<div><b>${i + 1}</b><span>${esc(r)}</span></div>`).join('')}</div>
      <div class="opd-pick" role="radiogroup" aria-label="난이도">${DIFFS.map((d) => `<button type="button" role="radio" aria-checked="${o.diff === d.k}" data-opr-diff="${d.k}" class="opd-btn opd-${d.k}${o.diff === d.k ? ' on' : ''}">${d.k === 'hell' ? FLAME : ''}<b class="disp">${d.name}</b><span>${d.sub}</span></button>`).join('')}</div>
      <div class="opd-desc opd-${o.diff}">${diffBadge(o.diff)}<span>${esc(DIFF[o.diff].desc)} · <b>${esc(DIFF[o.diff].ai)}</b></span></div>
      <div class="opr-pb">${pb
        ? `<span class="opr-pb-k">${diffBadge(o.diff)} 내 최고</span><b class="disp">${esc(fmtOf(def, pb.score))}</b><span class="opr-pb-n">${cnt}번 도전</span>`
        : `<span class="opr-pb-k">${diffBadge(o.diff)} 아직 기록이 없어요</span><span class="opr-pb-n">첫 기록을 남겨 봐요!</span>`}</div>
      ${def.ghost ? `<button type="button" class="opr-ghostbtn${o.ghost && ghostOk ? ' on' : ''}" data-opr-act="ghost" ${ghostOk ? '' : 'disabled'}>
        <span class="opr-gface">${O.faceSVG(myInfo().athlete, 'h')}</span>
        <span><b>내 최고 기록 유령</b><em>${ghostOk ? (o.ghost ? '같이 달려요 · 눌러서 끄기' : '꺼짐 · 눌러서 켜기') : '최고 기록을 남기면 같이 달려요'}</em></span>
        <i>${o.ghost && ghostOk ? 'ON' : 'OFF'}</i></button>` : ''}
      <div class="opr-ai">
        <div class="opr-ai-row"><span class="opr-ai-k">AI 선수</span>
          <button type="button" class="cd-step" data-opr-ai="-1" ${o.ai <= 0 ? 'disabled' : ''} aria-label="AI 줄이기">−</button>
          <b class="disp">${o.ai ? `${o.ai}명` : '없음'}</b>
          <button type="button" class="cd-step" data-opr-ai="1" ${o.ai >= MAX_AI ? 'disabled' : ''} aria-label="AI 늘리기">+</button></div>
      </div>
      <button type="button" class="btn btn-green opr-go" data-opr-act="go">시작!</button>
      <div class="opr-hint">패드 버튼을 눌러도 시작해요 · 연습 기록은 이 기기에만 남아요</div>
    </div>`;
  }
  function showRules() {
    markDiff();
    R.step = 'rules';
    showSlot(rulesHTML(), 'sheet');
    R.guardUntil = now() + 350;
    padFor(R.def);
    setHudTime((R.def.dur || 40) * 1000);
  }

  /* ---------- 종목 고르기 (결과 판의 [다른 종목]) ---------- */
  function pickHTML() {
    const list = (G.MANIFEST && G.MANIFEST.games.olympic) || [];
    const group = (season, label) => {
      const items = list.filter((m) => (m.season || 'summer') === season).map((m) => {
        const d = G.get(m.id);
        if (!d) return '';
        const pb = pbOf(m.id);
        return `<button type="button" class="opr-pk ec-${d.catColor || 'y'}${m.id === R.gid ? ' cur' : ''}" data-opr-pick="${m.id}">
          <span class="ec-ic">${d.icon || ''}</span><span class="opr-pk-t"><b>${esc(d.title)}</b><em>${pb ? '최고 ' + esc(shortRec(d, pb.score)) : '기록 없음'}</em></span></button>`;
      }).join('');
      return items ? `<div class="opr-pk-h">${label}</div><div class="opr-pk-grid">${items}</div>` : '';
    };
    return `<div class="opr-sheet opr-pick" role="dialog" aria-label="연습할 종목 고르기">
      <div class="opr-head"><div class="opr-ttl"><span class="opr-cat">혼자 연습 · ${diffBadge(curDiff())}</span><b class="disp">어떤 종목을 할까요?</b></div>
        <button type="button" class="opr-x" data-opr-act="exit" aria-label="${backLabel()}">✕</button></div>
      ${group('summer', '☀️ 하계')}${group('winter', '❄️ 동계')}
    </div>`;
  }
  function showPick() {
    endRun();
    resetPlayScreen();
    R.step = 'pick';
    showSlot(pickHTML(), 'sheet');
    $('#pad').classList.add('disabled');
    $('.hud-score .hint-sm').textContent = '연습 · 내 기록';
  }

  // 플레이 화면에 난이도 표시 (헬은 불꽃 테두리)
  function markDiff() {
    if (!R.root) return;
    const k = curDiff();
    let b = R.root.querySelector('.opd-play');
    if (!b) { b = document.createElement('div'); b.className = 'opd-play'; R.root.appendChild(b); }
    b.innerHTML = diffBadge(k, true);
    b.style.display = R.step === 'play' || R.step === 'count' ? '' : 'none';   // 규칙 카드·결과 판 위에는 안 보여요
    const sp = $('#s-play');
    DIFFS.forEach((d) => sp.classList.toggle('opd-on-' + d.k, d.k === k));
  }

  /* ---------- 3·2·1 ---------- */
  function startCountdown() {
    if (R.step !== 'rules') return;
    SND.unlock();
    SND.SFX.go();
    showSlot('', '');
    resetPlayScreen();
    padFor(R.def);
    $('.hud-score .hint-sm').textContent = '연습 · 내 기록';
    newRun(3000);
    R.step = 'count';
    markDiff();
    R.root.querySelector('.opr-count').classList.add('show');
    R.cdLabel = '';
  }
  function tickCountdown(t) {
    const run = R.run;
    const box = R.root.querySelector('.opr-count');
    const remain = run.startAt - t;
    if (remain <= 0) {
      box.classList.remove('show');
      R.step = 'play';
      return true;
    }
    const label = String(Math.ceil(remain / 1000));
    if (label !== R.cdLabel) {
      R.cdLabel = label;
      const b = box.querySelector('b');
      b.textContent = label;
      b.classList.remove('pop');
      void b.offsetWidth;
      b.classList.add('pop');
      box.querySelector('span').textContent = label === '3' ? '준비…' : label === '2' ? '버튼에 손가락!' : '곧 시작!';
      SND.SFX.tick();
      SND.vibrate(15);
    }
    return false;
  }

  /* ---------- 바로 다시 ---------- */
  function retry() {
    if (!R.def) return;
    SND.unlock();
    SND.SFX.whoosh();
    SND.vibrate(25);
    endRun();
    showSlot('', '');
    resetPlayScreen();
    padFor(R.def);
    $('.hud-score .hint-sm').textContent = '연습 · 내 기록';
    newRun(450);
    R.step = 'play';
    markDiff();
    const f = R.root.querySelector('.opr-flash');
    f.classList.remove('show');
    void f.offsetWidth;
    f.classList.add('show');
  }

  /* ---------- 한 판 끝 → 결과 판 ---------- */
  function finishRun() {
    const run = R.run;
    if (!run || run.over) return;
    run.over = true;
    R.step = 'result';
    markDiff();
    const def = R.def;
    const gid = R.gid;
    let score = 0;
    let summary = '';
    try { score = Math.round(run.inst.score() || 0); summary = run.inst.summary ? run.inst.summary() : ''; } catch (e) { console.error(e); }
    const key = pbKey(gid, run.diff);
    const prev = pbOf(gid, run.diff);
    const isNew = score > 0 && (!prev || score > prev.score);
    if (isNew) {
      let log = null;
      try { log = run.inst.log ? run.inst.log().slice(0, 4000) : null; } catch (e) { log = null; }
      DB.pb[key] = { v: RULES_V, score, rec: fmtOf(def, score), at: Date.now(), seed: run.seed, ev: run.ev, log, ath: run.me.athlete, diff: run.diff, ai: run.ai };
    }
    DB.cnt[key] = (DB.cnt[key] || 0) + 1;
    R.tries[gid] = (R.tries[gid] || 0) + 1;
    persist();
    // AI 와 순위 (AI 기록은 처음부터 정해져 있어요)
    const ai = Object.keys(run.bots).map((pid) => run.bots[pid].score || 0);
    const rank = 1 + ai.filter((s) => s > score).length;
    SND.SFX.end();
    SND.vibrate([80, 50, 80]);
    $('#hud-time').parentElement.classList.remove('hurry');
    $('#timebar-fill').classList.remove('hurry');
    $('#pad').classList.remove('disabled');
    $$('#pad .bez').forEach((b) => b.classList.remove('unused'));
    $('#pad').classList.add('opr-retry');
    showSlot(resultHTML({ score, summary, prev, isNew, rank, nAi: ai.length, ghostRan: !!run.ghost }), 'panel');
    // 작은 연습 XP (서버가 하루 한도·간격을 봐요) — 답은 olympic-level.js 가 결과 판에 보여줘요
    if (score > 0) App.send({ t: 'pxp', gid, diff: run.diff, score, win: ai.length > 0 && rank === 1 });
    R.guardUntil = now() + (isNew && prev ? 1700 : 1100);
    run.watchUntil = now() + 9000;    // 다른 선수가 들어오는 걸 조금 더 보여줘요
    if (isNew && prev) {
      later(250, () => { if (R.step === 'result') { SND.SFX.fanfare(); SND.vibrate([60, 40, 120]); P.sparkleHud(10); } });
      App.confetti('opr-confetti', 46, true);
    } else if (isNew) {
      later(200, () => { if (R.step === 'result') SND.SFX.perfect(); });
    }
    renderRivals(true);
  }
  const later = (ms, fn) => setTimeout(fn, ms);

  function resultHTML(r) {
    const def = R.def;
    const gid = R.gid;
    const rec = r.score > 0 ? fmtOf(def, r.score) : '기록 없음';
    let pbLine = '';
    if (r.isNew && r.prev) {
      const d = diffOf(gid, r.score, r.prev.score);
      pbLine = `<div class="opr-new-b disp">신기록!</div><div class="opr-pbl">지난 최고 <b>${esc(fmtOf(def, r.prev.score))}</b>${d ? ` · <em class="up">${d.txt} ${d.up}</em>` : ''}</div>`;
    } else if (r.isNew) {
      pbLine = `<div class="opr-pbl first">첫 기록 저장! ${def.ghost ? '다음 판엔 <b>내 최고 유령</b>이 같이 달려요' : '이 기기에 남겨 뒀어요'}</div>`;
    } else if (r.prev) {
      const d = r.score > 0 ? diffOf(gid, r.score, r.prev.score) : null;
      pbLine = `<div class="opr-pbl">내 최고 <b>${esc(fmtOf(def, r.prev.score))}</b>${d && d.n < 0 ? ` · <em class="down">${d.txt} ${d.down}</em>` : d && d.n === 0 ? ' · <em class="up">최고 기록과 똑같아요!</em>' : ''}</div>`;
    } else {
      pbLine = '<div class="opr-pbl">아직 기록이 없어요 · 다시 해 봐요!</div>';
    }
    const medal = r.nAi && r.rank <= 3 && r.score > 0 ? App.medalIcon(r.rank - 1, 20) : '';
    const rankLine = r.nAi
      ? `<div class="opr-rank">${medal}<span>AI ${r.nAi}명과 겨뤄 <b>${r.score > 0 ? r.rank + '위' : '-'}</b></span>${diffBadge(R.run ? R.run.diff : 'normal')}</div>`
      : '';
    const ghostLine = r.ghostRan && r.prev
      ? `<div class="opr-gl">${O.faceSVG(R.run ? R.run.me.athlete : 'dino', r.isNew ? 's' : 'h')}<span>${r.isNew ? '유령(내 최고)을 이겼어요!' : '유령(내 최고)이 이겼어요 · 다시 붙어 봐요'}</span></div>`
      : '';
    const n = R.tries[gid] || 0;
    return `<div class="opr-panel${r.isNew && r.prev ? ' opr-new' : ''}" role="dialog" aria-label="연습 결과">
      <div class="confetti" id="opr-confetti"></div>
      <div class="opr-res-top"><span class="opr-cat">연습 결과 · ${esc(def.title)} ${diffBadge(R.run ? R.run.diff : curDiff())}</span><span class="opr-try">${n}번째 도전</span></div>
      <div class="opr-rec disp">${esc(rec)}</div>
      ${r.summary && r.score > 0 && r.summary !== rec ? `<div class="opr-sum">${esc(r.summary)}</div>` : ''}
      ${pbLine}${rankLine}${ghostLine}
      <button type="button" class="btn btn-green opr-again" data-opr-act="again">다시! <small>바로</small></button>
      <div class="opr-row2"><button type="button" class="btn btn-ghost" data-opr-act="pick">다른 종목</button><button type="button" class="btn btn-ghost" data-opr-act="exit">${backLabel()}</button></div>
      <div class="opr-hint">아무 버튼이나 눌러도 바로 다시!</div>
    </div>`;
  }

  /* ---------- 위쪽 순위 칸 (방 경기와 같은 모양 + [그만]) ---------- */
  function renderRivals(force) {
    const run = R.run;
    const t = now();
    if (!run || (!force && t - R.lastRiv < 250)) return;
    R.lastRiv = t;
    const def = R.def;
    const inst = run.inst;
    const list = run.players.map((p) => {
      const isMe = p.pid === run.me.pid;
      let arr;
      try { arr = isMe ? [inst.score(), inst.value(), inst.extra ? inst.extra() : null] : run.live[p.pid]; } catch (e) { arr = null; }
      const r = def.rival ? def.rival(arr || [0, 0, null]) : { sort: (arr && arr[0]) || 0, text: String((arr && arr[0]) || 0) };
      return { p, isMe, score: r.sort, text: r.text };
    }).sort((a, b) => b.score - a.score);
    let rank = 0;
    let last = null;
    list.forEach((x, i) => { if (x.score !== last) { rank = i + 1; last = x.score; } x.rank = rank; });
    const box = $('#rivals');
    box.style.gridTemplateColumns = `repeat(${list.length}, minmax(0, 1fr)) 44px`;
    box.innerHTML = list.map((x) => `<div class="rv${x.isMe ? ' me' : ''}${x.p.ghost ? ' opr-ghost' : ''}">
      <span class="rk${x.rank === 1 && x.score > 0 ? ' first' : ''}">${x.rank}</span>
      <div class="av">${O.faceSVG(x.p.athlete)}</div>
      <span class="nm">${x.isMe ? '나' : esc(x.p.name)}</span><span class="sc">${esc(x.text)}</span></div>`).join('')
      + `<button type="button" class="rv opr-quit" data-opr-act="pause" aria-label="잠깐 멈춤"><b>⏸</b><span>멈춤</span></button>`;
  }

  /* ---------- 잠깐 멈춤 (연습) : 계속 · 처음부터 · 다른 종목 · 대기실로 ---------- */
  function pauseBox() {
    let b = R.root.querySelector('.opr-pause');
    if (!b) { b = document.createElement('div'); b.className = 'opr-pause pz-ov'; R.root.appendChild(b); }
    return b;
  }
  function pause() {
    if (R.paused || !R.run || (R.step !== 'play' && R.step !== 'count')) return;
    R.paused = true; R.pauseAt = realNow(); R.resumeAt = 0; R.pzCd = '';
    SND.SFX.whistle ? SND.SFX.whistle() : SND.SFX.click();
    SND.vibrate([30, 30, 30]);
    const b = pauseBox();
    b.innerHTML = `<div class="pz-card"><div class="pz-ic"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.5" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.5" fill="currentColor"/></svg></div>
      <b class="disp pz-t">잠깐 멈춤</b><span class="pz-sub">연습 · ${esc(R.def.title)} ${diffBadge(R.run.diff)}</span><div class="pz-cd disp"></div>
      <div class="pz-acts"><button type="button" class="btn btn-green" data-opr-act="resume">▶ 계속하기</button>
        <button type="button" class="btn btn-ghost" data-opr-act="again2">처음부터 다시</button>
        <button type="button" class="btn btn-ghost" data-opr-act="pick">다른 종목</button>
        <button type="button" class="btn btn-ghost pz-quit" data-opr-act="exit">그만하고 ${backLabel()}</button></div></div>`;
    b.className = 'opr-pause pz-ov show';
  }
  function resume() { if (!R.paused || R.resumeAt) return; SND.SFX.go(); R.resumeAt = realNow() + 3000; pauseBox().classList.add('counting'); }
  function unpause(keepTime) {
    if (!R.paused) return;
    if (keepTime !== false) R.shift += realNow() - R.pauseAt;
    R.paused = false; R.resumeAt = 0;
    const b = R.root && R.root.querySelector('.opr-pause');
    if (b) b.className = 'opr-pause pz-ov';
  }
  function tickPause() {
    if (!R.resumeAt) return;
    const left = R.resumeAt - realNow();
    if (left <= 0) { unpause(); return; }
    const cd = String(Math.ceil(left / 1000));
    if (cd !== R.pzCd) {
      R.pzCd = cd;
      const el = pauseBox().querySelector('.pz-cd');
      if (el) { el.textContent = cd; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
      SND.SFX.tick(); SND.vibrate(15);
    }
  }

  /* ---------- 매 프레임 ---------- */
  function frame() {
    R.raf = requestAnimationFrame(frame);
    try { tick(); } catch (e) { console.error(e); }
  }
  function tick() {
    const run = R.run;
    if (!R.on || !run) return;
    if (R.paused) { tickPause(); return; }
    const t = now();
    if (R.step === 'count' && !tickCountdown(t)) return;
    if (R.step !== 'play' && R.step !== 'result') return;
    if (t < run.startAt) { setHudTime(run.endAt - run.startAt); return; }
    if (R.step === 'result' && t > run.watchUntil) return;
    updateLive(run, t);
    run.inst.tick(t);
    P.tickScore();
    if (R.step === 'play') {
      const remain = run.endAt - t;
      setHudTime(remain);
      $('#timebar-fill').style.transform = `scaleX(${Math.max(0, remain / (run.endAt - run.startAt))})`;
      const secs = Math.ceil(remain / 1000);
      if (remain <= 10000 && !$('#hud-time').parentElement.classList.contains('hurry')) {
        $('#hud-time').parentElement.classList.add('hurry');
        $('#timebar-fill').classList.add('hurry');
      }
      if (secs !== R.lastSec) { if (secs <= 5 && secs > 0 && R.lastSec !== -1) SND.SFX.tickHigh(); R.lastSec = secs; }
      let done = false;
      try { done = !!(run.inst.done && run.inst.done()); } catch (e) { done = false; }
      if (t >= run.endAt || done) finishRun();
    }
    renderRivals(false);
  }

  /* ---------- 패드 ---------- */
  const pad = {
    press(c) {
      if (R.paused) return;      // 멈춘 동안 누른 건 안 받아요
      const t = now();
      if (R.step === 'rules') { if (t >= R.guardUntil) startCountdown(); return; }
      if (R.step === 'result') { if (t >= R.guardUntil) retry(); return; }
      if (R.step !== 'play' || !R.run || t < R.run.startAt) return;
      const def = R.def;
      if (!def.buttons.includes(c)) return;
      if (def.pressSound !== false) SND.SFX.press(c);
      R.run.inst.onPress(c, t);
    },
    release(c) {
      if (R.paused || R.step !== 'play' || !R.run || R.run.over) return;
      const t = now();
      if (t < R.run.startAt) return;
      if (typeof R.run.inst.onRelease === 'function') R.run.inst.onRelease(c, t);
    },
    abort() { teardown(); },
    boost() { if (!R.paused && R.step === 'play' && R.run && !R.run.over && R.run.inst.onBoost) R.run.inst.onBoost(now()); },
    get wave() { return R.step === 'play' || R.step === 'result' || R.step === 'rules'; }
  };

  /* ---------- 열기 · 닫기 ---------- */
  function open(gid, back) {
    const def = G.get(gid);
    if (!def || !def.olympic) return false;
    if (!R.on) {
      if (!canPractice()) { App.toast('지금은 연습할 수 없어요'); return false; }
      reload();
      R.on = true;
      R.key = roomKey(S.room);
      const act = document.querySelector('.screen.active');
      R.back = back || (act ? act.id : 's-lobby');
      R.tries = {};
      mount();
      App.takePad(pad);
      App.wakeLock(true);
      if (!R.raf) R.raf = requestAnimationFrame(frame);
    }
    SND.unlock();
    endRun();
    resetPlayScreen();
    R.gid = gid;
    R.def = def;
    App.setTheme(def.catColor);
    showRules();
    return true;
  }

  // 화면은 건드리지 않고 연습만 정리 (방 상태가 바뀔 때는 app.js 가 알맞은 화면을 보여줘요)
  function teardown() {
    if (!R.on) return;
    if (R.paused) { R.paused = false; R.resumeAt = 0; }
    R.on = false;
    cancelAnimationFrame(R.raf);
    R.raf = 0;
    endRun();
    R.step = '';
    if (App.padTaken() === pad) App.takePad(null);
    if (R.root) { R.root.remove(); R.root = null; }
    resetPlayScreen();
    $('#s-play').classList.remove('opr-on', 'opd-on-easy', 'opd-on-normal', 'opd-on-hard', 'opd-on-hell');
    $('.hud-score .hint-sm').textContent = '내 점수';
    App.setTheme('base');
  }
  function exit() {
    SND.SFX.click();
    teardown();
    const room = S.room;
    App.wakeLock(false);
    if (!room) { App.showScreen('s-home'); return; }
    if (room.phase === 'final') { App.showScreen('s-final'); App.setTheme('gold'); } else if (room.phase === 'lobby') { App.showScreen('s-lobby'); decorateCards(); }
  }
  function backLabel() {
    return R.back === 's-final' || (S.room && S.room.phase === 'final') ? '결과로' : '대기실로';
  }

  /* ---------- 버튼들 (덮개 · 순위 칸) ---------- */
  function onClick(e) {
    if (!R.on) return;
    let b;
    if ((b = e.target.closest('[data-opr-act]'))) {
      const act = b.dataset.oprAct;
      if (act === 'exit') { unpause(false); exit(); }
      else if (act === 'pause') pause();
      else if (act === 'resume') resume();
      else if (act === 'again2') { unpause(false); retry(); }
      else if (act === 'go') startCountdown();
      else if (act === 'again') { if (R.step === 'result') retry(); }
      else if (act === 'pick') { unpause(false); SND.SFX.click(); showPick(); }
      else if (act === 'ghost' && !b.disabled) { SND.SFX.click(); DB.opt.ghost = !opts().ghost; persist(); showSlot(rulesHTML(), 'sheet'); }
    } else if ((b = e.target.closest('[data-opr-pick]'))) {
      SND.SFX.pop();
      open(b.dataset.oprPick);
    } else if ((b = e.target.closest('[data-opr-ai]')) && !b.disabled) {
      SND.SFX.click();
      DB.opt.ai = Math.max(0, Math.min(MAX_AI, opts().ai + Number(b.dataset.oprAi)));
      persist();
      showSlot(rulesHTML(), 'sheet');
    } else if ((b = e.target.closest('[data-opr-diff]'))) {
      const k = b.dataset.oprDiff;
      if (k === 'hell') { SND.SFX.boom ? SND.SFX.boom() : SND.SFX.bad(); SND.vibrate([30, 30, 60]); } else SND.SFX.click();
      DB.opt.diff = k;
      persist();
      showSlot(rulesHTML(), 'sheet');
      markDiff();
    }
  }

  /* ================================================================
     들어가는 곳: 대기실 종목 카드 · 최종 화면
     ================================================================ */
  const PLAY_IC = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="currentColor" opacity=".2"/><path d="M9.5 7.5 L17 12 L9.5 16.5 Z" fill="currentColor"/></svg>';
  function tryBtn(id) {
    const d = G.get(id);
    const pb = pbOf(id);
    return `<button type="button" class="opr-trybtn" data-opr="${id}" aria-label="${esc(d ? d.title : id)} 혼자 연습">${PLAY_IC}<b>연습</b><span>${pb ? esc(shortRec(d, pb.score)) : '혼자'}</span></button>`;
  }
  function decorateCards() {
    const box = $('#oly-cards');
    if (!box) return;
    box.querySelectorAll('button.ec[data-oev]').forEach((card) => {
      if (card.parentElement && card.parentElement.classList.contains('opr-ecw')) return;
      const w = document.createElement('div');
      w.className = 'opr-ecw';
      card.replaceWith(w);
      w.appendChild(card);
      w.insertAdjacentHTML('beforeend', tryBtn(card.dataset.oev));
    });
  }
  function onFinal() {
    const scr = $('#s-final');
    const old = scr.querySelector('.opr-final');
    if (old) old.remove();
    const room = S.room;
    if (!room || room.mode !== 'olympic') return;
    const ids = Array.from(new Set((room.sequence || []).filter((id) => G.get(id) && G.get(id).olympic)));
    if (!ids.length) return;
    const card = document.createElement('div');
    card.className = 'card opr-final';
    card.innerHTML = `<div class="list-head"><span>이 종목 연습하기</span><span class="hint-sm">혼자 · 바로 다시 · 기록은 이 기기에</span></div>
      <div class="opr-chips">${ids.map((id) => { const d = G.get(id); const pb = pbOf(id); return `<button type="button" class="opr-chip ec-${d.catColor || 'y'}" data-opr="${id}"><span class="ec-ic">${d.icon || ''}</span><b>${esc(d.title)}</b>${pb ? `<em>${esc(shortRec(d, pb.score))}</em>` : ''}</button>`; }).join('')}</div>`;
    const acts = scr.querySelector('.lobby-actions');
    scr.insertBefore(card, acts || null);
  }

  // 방 상태가 바뀌면 (방장이 경기 시작 · 대기실로 등) 연습은 바로 끝내요 — app.js 가 화면을 바꾸기 전에
  function onMessage(msg) {
    if (!R.on || !msg || msg.t !== 'state' || !msg.room) return;
    if (roomKey(msg.room) === R.key) return;
    teardown();
    const ph = msg.room.phase;
    App.toast(ph === 'intro' || ph === 'play' ? '경기가 시작돼서 연습을 멈췄어요 · 같이 해요!' : '방이 바뀌어서 연습을 멈췄어요', 2600);
  }

  function init() {
    App.hooks.olyPanel.push(decorateCards);
    App.hooks.final.push(onFinal);
    App.hooks.message.push(onMessage);
    $('#s-play').addEventListener('click', onClick);
    document.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-opr]');
      if (!b) return;
      SND.unlock();
      SND.SFX.pop();
      SND.vibrate(10);
      const fromFinal = !!b.closest('#s-final');
      open(b.dataset.opr, fromFinal ? 's-final' : 's-lobby');
    });
    window.addEventListener('resize', () => { if (R.on) place(); });
  }
  init();

  // 시험·다른 모듈용
  window.OlyPractice = { open, exit, newEvent, botPerf, state: () => R, db: () => DB, pbKey, diffBadge };
})();
