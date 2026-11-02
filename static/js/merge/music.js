/* 머지관 · 배경음악 재생기 (merge_town.md ★BGM)
   - 악보는 data.js 의 MUSIC (직접 작곡 · 오음 음계) · 악기 소리는 fx.js 의 F.inst (가야금 뜯기 · 피리 · 해금 · 작은 북)
   - 미리 0.2초 앞까지 예약하는 스케줄러 (setInterval 25ms + ac.currentTime 기준) → 휴대폰에서도 박자가 안 흔들려요
   - 곡이 바뀔 때: 다음 마디 첫 박(너무 멀면 다음 박)에서 1.5초 교차 페이드
   - 같은 곡을 다시 돌 때 '변주': 가끔 이웃 음 · 꾸밈음 · 북 무늬 A/B · 펼친화음 무늬 바꾸기 (씨앗 고정 → 같은 자리에선 늘 같은 변주)
   - 밤(night): 북 빼고 조금 느리게 · 조용하게
   - play(id, {night}) 는 몇 번 불러도 같으면 그대로 · 소리를 처음 켤 때(unlock) wake()
   - 피아노(기본): MUSIC.lists.piano 곡 4개(약 5분씩)를 차례로 이어 연주 · 끝나면 첫 곡 · 곡 사이 3초 살며시 줄었다 다음 곡 머리
     · form 은 공백으로 나눈 구간 + 변주 번호 + 조옮김 ('A2+2') · 반복마다 왼손 무늬·옥타브·겹침음이 바뀌어 같은 곡 안에서도 덜 반복돼요
     · 지금 곡 번호는 이 기기에 기억 (다음에 열면 그 곡 처음부터)
   - node 에서도 읽혀요 (악보 읽기·검사만: midi · compile · check → tools/merge_test.js) */
(function (root) {
  'use strict';

  const isNode = typeof module === 'object' && module.exports;
  const D = isNode ? require('./data.js') : root.MergeData;
  const MUS = D.MUSIC;
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // 'C4' → 60 · 'F#3' → 54 · 못 읽으면 NaN
  function midi(name) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name));
    if (!m) return NaN;
    return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const seeded = (seed) => { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const toks = (str) => String(str || '').split(/\s+/).filter((x) => x && x !== '|');

  // 구간 하나 읽기 → 마디별 음 [{ s(마디 안 칸), m(midi), d(칸 수) }] · 화음 이름들
  function parseSection(song, sec) {
    const spb = song.spb, tk = toks(sec.mel), ch = toks(sec.chords);
    const bars = ch.map(() => []);
    let last = null;
    tk.forEach((x, i) => {
      if (x === '-') { if (last) last.d++; return; }
      if (x === '.') { last = null; return; }
      const b = Math.floor(i / spb);
      last = { s: i % spb, m: midi(x) + (song.tr || 0), d: 1 };
      if (bars[b]) bars[b].push(last);
    });
    return { bars, chords: ch, steps: tk.length };
  }
  const compiled = {};
  // 곡 전체: form 차례대로 마디를 이어 붙인 줄 (timeline)
  const FORM_TOK = /^([A-Z])([0-3]?)([+-]\d{1,2})?$/;
  function compilePiano(id, song) {
    const secs = {}, timeline = [], seen = {};
    toks(song.form).forEach((x) => {
      const m = FORM_TOK.exec(x); if (!m) return;
      const k = m[1], v = Number(m[2] || 0), tr = Number(m[3] || 0);
      if (!song[k]) return;
      if (!secs[k]) secs[k] = parseSection(song, song[k]);
      const occ = seen[k] | 0; seen[k] = occ + 1;
      const nb = secs[k].bars.length;
      secs[k].bars.forEach((notes, b) => timeline.push({ sec: k, bar: b, nb, occ, v, tr, notes, chord: secs[k].chords[b] }));
    });
    const pool = {};
    timeline.forEach((x) => x.notes.forEach((n) => { pool[n.m + x.tr] = 1; }));
    return { id, song, timeline, piano: true, scale: Object.keys(pool).map(Number).sort((a, b) => a - b) };
  }
  function compile(id) {
    if (compiled[id]) return compiled[id];
    const song = MUS.songs[id];
    if (!song) return null;
    if (song.piano) { compiled[id] = compilePiano(id, song); return compiled[id]; }
    const secs = {};
    const form = String(song.form || 'A').split('');
    form.forEach((k) => { if (!secs[k]) secs[k] = parseSection(song, song[k]); });
    const timeline = [], seen = {};
    form.forEach((k) => {
      const occ = seen[k] | 0; seen[k] = occ + 1;
      secs[k].bars.forEach((notes, b) => timeline.push({ sec: k, bar: b, occ, notes, chord: secs[k].chords[b] }));
    });
    // 이 곡에 나오는 음들 (이웃 음 바꾸기용 · 오음 음계 그대로)
    const pool = {};
    timeline.forEach((x) => x.notes.forEach((n) => { pool[n.m] = 1; }));
    const c = { id, song, timeline, scale: Object.keys(pool).map(Number).sort((a, b) => a - b) };
    compiled[id] = c;
    return c;
  }
  // 악보 검사 (시험용): 칸 수 = 마디 × spb · 음 이름 · 화음 이름 · 악기 · 북 무늬 길이
  function check(id) {
    const song = MUS.songs[id], err = [];
    if (!song) return ['없는 곡 ' + id];
    if (song.piano) {
      const used = {};
      toks(song.form).forEach((x) => { const m = FORM_TOK.exec(x); if (!m) err.push(`${id}: form '${x}'`); else if (!song[m[1]]) err.push(`${id}: 구간 ${m[1]} 없음`); else used[m[1]] = 1; });
      Object.keys(used).forEach((k) => {
        const sec = song[k], ch = toks(sec.chords), tk = toks(sec.mel);
        if (tk.length !== ch.length * song.spb) err.push(`${id}.${k}: 칸 ${tk.length} ≠ 마디 ${ch.length} × ${song.spb}`);
        tk.forEach((x) => { if (x !== '-' && x !== '.' && isNaN(midi(x))) err.push(`${id}.${k}: 음 '${x}'`); });
        ch.forEach((x) => { if (!MUS.chords[x]) err.push(`${id}.${k}: 화음 '${x}'`); });
      });
      if (!(song.lh || []).length) err.push(`${id}: 왼손 무늬 없음`);
      (song.lh || []).forEach((q) => { const t = toks(q); if (t.length !== song.spb || t.some((x) => x !== '.' && !(Number(x) >= 0 && Number(x) <= 7))) err.push(`${id}: 왼손 '${q}'`); });
      return err;
    }
    const form = String(song.form || 'A').split('');
    form.forEach((k) => {
      const sec = song[k];
      if (!sec) { err.push(`${id}: 구간 ${k} 없음`); return; }
      const ch = toks(sec.chords), tk = toks(sec.mel);
      if (tk.length !== ch.length * song.spb) err.push(`${id}.${k}: 칸 ${tk.length} ≠ 마디 ${ch.length} × ${song.spb}`);
      tk.forEach((x) => { if (x !== '-' && x !== '.' && isNaN(midi(x))) err.push(`${id}.${k}: 음 '${x}'`); });
      ch.forEach((x) => { if (!MUS.chords[x]) err.push(`${id}.${k}: 화음 '${x}'`); });
      if (['flute', 'pluck', 'haegeum'].indexOf((song.inst || {})[k]) < 0) err.push(`${id}.${k}: 악기`);
    });
    (song.drums || []).forEach((p) => { if (toks(p).length !== song.spb) err.push(`${id}: 북 무늬 '${p}'`); });
    (song.arp || []).forEach((p) => { if (toks(p).length !== song.spb) err.push(`${id}: 펼친화음 '${p}'`); });
    return err;
  }
  // 곡 길이(초) · 한 바퀴
  function lengthSec(id, night) {
    const c = compile(id);
    if (!c) return 0;
    return c.timeline.length * c.song.spb * stepSec(c.song, night);
  }
  const stepSec = (song, night) => 60 / (song.bpm * (night ? 0.85 : 1)) / 2;

  // 피아노 마디 하나 → steps[s] = [{ k: 'piano', m, d(칸), v, dt(사람 손 같은 아주 작은 어긋남) }]
  //  변주 v: 0 기본 · 1 왼손 흐르게 + 선율 아래 옥타브 · 2 선율 한 옥타브 위(너무 높으면 그대로) + 왼손 성기게 · 3 선율 아래 화음 음 겹침
  //  구간 안에서 셈여림이 둥글게(가운데가 조금 크게) · 마디 첫 음 살짝 강하게 · 왼손은 페달처럼 마디 끝까지 울려요
  const pianoChord = {};
  function planPiano(p, bi) {
    const c = p.c, song = c.song, spb = song.spb, bar = c.timeline[bi % c.timeline.length];
    const rnd = seeded(hash(c.id + ':' + bi));
    const steps = [];
    for (let i = 0; i < spb; i++) steps.push([]);
    const tr = (song.tr || 0) + bar.tr;
    if (!pianoChord[bar.chord]) pianoChord[bar.chord] = (MUS.chords[bar.chord] || MUS.chords.C).map(midi);
    const cm = pianoChord[bar.chord].map((x) => x + tr);
    const edge = bar.sec === 'I' || bar.sec === 'Z';
    const arc = 0.84 + 0.16 * Math.sin(Math.PI * (bar.bar + 0.5) / bar.nb);
    const mv = (song.vel || 1) * arc * (edge ? 0.85 : 1) * (p.night ? 0.9 : 1);
    const v = bar.v;
    const hi = c.scale.length ? c.scale[c.scale.length - 1] : 84;
    bar.notes.forEach((n) => {
      let m = n.m + bar.tr;
      if (v === 2 && hi + 12 <= 89) m += 12;
      const vel = 0.42 * mv * (n.s === 0 ? 1.06 : 1) * (0.94 + rnd() * 0.1);
      steps[n.s].push({ k: 'piano', m, d: n.d + 0.6, v: vel, dt: 0 });
      if (v === 1) steps[n.s].push({ k: 'piano', m: m - 12, d: n.d + 0.6, v: vel * 0.38, dt: 0.012 });
      if (v === 3) {   // 아래 3~9반음 안의 화음 음
        let best = null;
        cm.forEach((x) => { for (let o = -2; o <= 3; o++) { const y = x + o * 12; if (y <= m - 3 && y >= m - 9 && (best == null || y > best)) best = y; } });
        if (best != null) steps[n.s].push({ k: 'piano', m: best, d: n.d + 0.6, v: vel * 0.42, dt: 0.01 });
      }
    });
    const lh = song.lh || ['0 . 1 . 2 . 3 .'];
    const pat = toks(lh[(v + (bar.occ > 1 ? 1 : 0)) % lh.length]);
    pat.forEach((x, i) => {
      if (x === '.') return;
      const idx = Number(x), m = idx < 4 ? cm[idx] : cm[idx - 4] + 12;
      steps[i].push({ k: 'piano', m, d: spb - i + 1.5, v: (idx === 0 ? 0.24 : 0.17) * mv * (0.92 + rnd() * 0.12), dt: (rnd() - 0.5) * 0.014 });
    });
    return steps;
  }

  if (isNode) { module.exports = { midi, compile, check, lengthSec, hash, planPiano: (id, bi) => planPiano({ c: compile(id) }, bi) }; return; }

  /* ---------- 재생 (브라우저) ---------- */
  const F = root.MergeFx;
  const VEL = { k: 0.34, t: 0.22, m: 0.24, c: 0.13, b: 0.16, g: 0.3 };
  const chordMidi = {};
  Object.keys(MUS.chords).forEach((k) => { chordMidi[k] = MUS.chords[k].map(midi); });

  // 마디 하나의 할 일 (변주 포함) → steps[s] = [ {kind, ...} ]
  function planBar(p, bi) {
    if (p.c.piano) return planPiano(p, bi);
    const c = p.c, song = c.song, spb = song.spb, total = c.timeline.length;
    const pos = bi % total, pass = Math.floor(bi / total);
    const bar = c.timeline[pos];
    const rnd = seeded(hash(c.id + ':' + bi));
    const vary = pass > 0 || bar.occ > 0;
    const steps = [];
    for (let s = 0; s < spb; s++) steps.push([]);
    const instName = song.inst[bar.sec] || 'flute';
    const mv = (song.vel || 1) * (p.night ? 0.92 : 1);
    // 선율
    bar.notes.forEach((n, k) => {
      let m = n.m;
      if (vary && k > 0 && k < bar.notes.length - 1 && rnd() < 0.08) {
        const i = c.scale.indexOf(m);
        const j = Math.max(0, Math.min(c.scale.length - 1, i + (rnd() < 0.5 ? -1 : 1)));
        if (i >= 0) m = c.scale[j];
      }
      if (vary && n.d >= 2 && rnd() < 0.1 && instName !== 'haegeum') {   // 꾸밈음: 한 칸 위 음을 아주 짧게 먼저
        const i = c.scale.indexOf(m);
        if (i >= 0 && i < c.scale.length - 1) steps[n.s].push({ k: 'grace', m: c.scale[i + 1], v: mv * 0.18 });
      }
      steps[n.s].push({ k: instName, m, d: n.d, v: mv });
    });
    // 낮은 가야금 (화음 뿌리 · 가운데 박에 5도)
    const cm = chordMidi[bar.chord] || chordMidi.C;
    steps[0].push({ k: 'bass', m: cm[0], v: 0.3 * mv });
    if (!p.night) steps[spb === 6 ? 3 : 4].push({ k: 'bass', m: cm[1], v: 0.18 * mv });
    // 펼친화음
    if (song.counter && song.arp && song.arp.length) {
      const pat = toks(song.arp[vary ? Math.floor(rnd() * song.arp.length) : bi % song.arp.length]);
      pat.forEach((x, s) => {
        if (x === '.') return;
        const idx = Number(x);
        steps[s].push({ k: 'arp', m: cm[idx % 4] + 12 * (1 + Math.floor(idx / 4)), v: (p.night ? 0.09 : 0.12) * mv });
      });
    }
    // 북
    if (!p.night && song.drums && song.drums.length) {
      const pat = toks(song.drums[vary ? (bi % song.drums.length) : 0]);
      pat.forEach((x, s) => { if (VEL[x]) steps[s].push({ k: 'drum', d: x, v: VEL[x] * mv * (vary && rnd() < 0.15 ? 0.7 : 1) }); });
    }
    return steps;
  }
  function fire(p, ev, t) {
    const I = F.inst, out = p.gain, sd = p.dur;
    if (ev.k === 'piano') I.piano(out, t + (ev.dt || 0), ev.m, ev.d * sd, ev.v);
    else if (ev.k === 'flute') I.flute(out, t, ev.m, ev.d * sd * 0.98, 0.34 * ev.v);
    else if (ev.k === 'haegeum') I.haegeum(out, t, ev.m, ev.d * sd * 0.98, 0.62 * ev.v);
    else if (ev.k === 'pluck') I.pluck(out, t, ev.m, 0.4 * ev.v);
    else if (ev.k === 'grace') I.pluck(out, t - 0.06, ev.m, ev.v, 0.08, true);
    else if (ev.k === 'bass') I.pluck(out, t, ev.m, ev.v);
    else if (ev.k === 'arp') I.pluck(out, t, ev.m, ev.v, null, true);
    else if (ev.k === 'drum') I.drum(out, t, ev.d, ev.v);
  }
  const PKEY = 'arichae_merge_piano';
  const LIST_GAP = 3;   // 곡 사이 (초)
  function listStart(id) {
    const L = MUS.lists[id];
    let i = 0;
    try { const v = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (v && v.list === id && v.i >= 0 && v.i < L.length) i = v.i | 0; } catch (e) { /* 처음부터 */ }
    return i;
  }
  function listSave(p) { try { localStorage.setItem(PKEY, JSON.stringify({ list: p.list, i: p.li })); } catch (e) { /* 무시 */ } }
  function makePlayer(ctx, dest, id, night, t0, li) {
    const L = MUS.lists && MUS.lists[id];
    const i0 = L ? (li != null ? li : listStart(id)) % L.length : 0;
    const c = compile(L ? L[i0] : id);
    if (!c) return null;
    const gain = ctx.createGain();
    gain.connect(dest);
    const pl = { key: id + (night ? '~n' : ''), id, c, night: !!night, gain, t: t0, step: 0, dur: stepSec(c.song, L ? false : night), plan: null, endAt: 0 };
    if (L) { pl.list = id; pl.li = i0; pl.night = false; }
    return pl;
  }
  // 목록 재생: 곡이 끝나면 3초 동안 살며시 줄였다가 다음 곡 머리부터
  function nextPiece(p) {
    const L = MUS.lists[p.list], t = p.t;
    try {
      p.gain.gain.cancelScheduledValues(t);
      p.gain.gain.setValueAtTime(1, t);
      p.gain.gain.linearRampToValueAtTime(0.0001, t + LIST_GAP - 0.2);
      p.gain.gain.setValueAtTime(0.0001, t + LIST_GAP - 0.05);
      p.gain.gain.linearRampToValueAtTime(1, t + LIST_GAP + 0.05);
    } catch (e) { /* 무시 */ }
    p.li = (p.li + 1) % L.length;
    p.c = compile(L[p.li]); p.dur = stepSec(p.c.song, false); p.step = 0; p.plan = null;
    p.t = t + LIST_GAP;
    if (!p.offline) listSave(p);
  }
  function runSteps(p, until) {
    while (p.t < until && (!p.endAt || p.t < p.endAt)) {
      if (p.list && p.step >= p.c.timeline.length * p.c.song.spb) { nextPiece(p); continue; }
      const spb = p.c.song.spb;
      const s = p.step % spb;
      if (s === 0 || !p.plan) p.plan = planBar(p, Math.floor(p.step / spb));
      try { p.plan[s].forEach((ev) => fire(p, ev, p.t)); } catch (e) { /* 소리 실패는 무시 */ }
      p.t += p.dur; p.step++;
    }
  }

  const S = { players: [], cur: null, want: null, timer: 0 };
  function tick() {
    const ac = F.ac;
    if (!ac) return;
    const now = ac.currentTime;
    S.players.forEach((p) => {
      if (p.t < now - 0.25) {
        let k = Math.ceil((now - p.t) / p.dur);
        if (p.list) k = Math.min(k, Math.max(0, p.c.timeline.length * p.c.song.spb - p.step));   // 곡 끝을 넘지 않게 (다음 곡은 처음부터)
        p.t += k * p.dur; p.step += k; p.plan = null;
        if (p.t < now - 0.25) p.t = now + 0.05;
      }   // 숨었다 돌아오면 박자 그대로 이어서
      runSteps(p, now + 0.2);
    });
    S.players = S.players.filter((p) => {
      if (p.endAt && now > p.endAt + 0.2) { const g = p.gain; setTimeout(() => { try { g.disconnect(); } catch (e) { /* 무시 */ } }, 3000); return false; }
      return true;
    });
    if (!S.players.length) { clearInterval(S.timer); S.timer = 0; }
  }
  function nextBoundary(p, now) {
    const spb = p.c.song.spb;
    const toBar = ((spb - (p.step % spb)) % spb) * p.dur + (p.t - now);
    if (toBar > 0.05 && toBar < 2.2) return now + toBar;
    const beat = (spb === 6 ? 3 : 2), toBeat = ((beat - (p.step % beat)) % beat) * p.dur + (p.t - now);
    return now + (toBeat > 0.05 ? toBeat : toBeat + beat * p.dur);
  }
  function switchTo(key) {
    const ac = F.ac;
    const [id, n] = key.split('~');
    if (S.cur && S.cur.key === key && !S.cur.endAt) return;
    const now = ac.currentTime;
    const old = S.cur && !S.cur.endAt ? S.cur : null;
    const t0 = old ? nextBoundary(old, now) : now + 0.08;
    const p = makePlayer(ac, F.music, id, n === 'n', t0);
    if (!p) return;
    if (old) {
      old.gain.gain.setValueAtTime(1, t0); old.gain.gain.linearRampToValueAtTime(0.0001, t0 + 1.5); old.endAt = t0 + 1.5;
      p.gain.gain.setValueAtTime(0.0001, now); p.gain.gain.setValueAtTime(0.0001, t0); p.gain.gain.linearRampToValueAtTime(1, t0 + 1.5);
    } else p.gain.gain.value = 1;
    S.cur = p;
    S.players.push(p);
    if (!S.timer) S.timer = setInterval(tick, 25);
    tick();
  }
  function stopAll() {
    const ac = F.ac;
    if (!ac) return;
    const now = ac.currentTime;
    S.players.forEach((p) => { if (!p.endAt) { p.gain.gain.setTargetAtTime(0.0001, now, 0.15); p.endAt = now + 0.6; } });
    S.cur = null;
  }
  // 소리를 켤 수 있게 됐거나 설정이 바뀌면
  function wake() {
    if (!F.ac || !F.music) return;
    if (!F.opt.bgm) { stopAll(); return; }
    if (S.want) switchTo(S.want);
  }
  function play(id, opts) {
    if (!MUS.songs[id] && !(MUS.lists && MUS.lists[id])) return;
    S.want = id + (opts && opts.night ? '~n' : '');
    wake();
  }

  // 시험용: 곡 몇 초를 오프라인으로 그려서 크기(최대·평균)를 재요 (콘솔: await MergeMusic.measure('board_day', 8))
  async function measure(id, sec, night) {
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const sr = 44100, ctx = new OAC(2, Math.floor(sr * (sec || 6)), sr);
    const g = F.buildGraph(ctx);
    g.bgm.gain.value = 0.4 * Math.pow(0.6, 1.6);
    const p = makePlayer(ctx, g.music, id, night, 0.05, 0);
    p.offline = true;
    p.gain.gain.value = 1;
    runSteps(p, sec || 6);
    const t0 = performance.now();
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    let pk = 0, ss = 0;
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; ss += d[i] * d[i]; }
    return { peak: +pk.toFixed(3), rms: +Math.sqrt(ss / d.length).toFixed(4), renderMs: Math.round(performance.now() - t0), nan: d.some((x) => x !== x) };
  }

  root.MergeMusic = { play, wake, stop: stopAll, midi, compile, check, lengthSec, measure,
    get current() { return S.cur ? S.cur.key : ''; }, get want() { return S.want; },
    _plan: (id, bi) => planPiano({ c: compile(id) }, bi),   // 시험·미리 듣기용
    get piece() { const p = S.cur; return p && p.list ? { i: p.li, id: p.c.id, title: p.c.song.title, bar: Math.floor(p.step / p.c.song.spb), bars: p.c.timeline.length } : null; } };
})(typeof window !== 'undefined' ? window : globalThis);
