# olympic 작업 사양 (사용자 승인된 지시 원문)

## 원래 작업 지시 (Agent prompt)

You are extending the Olympic hall of a hobby family web game "아리채 오락실" (Korean UI; kids + parents each on their own phone in portrait; 3 big pad buttons red/green/blue; up to 8 lanes, AI fills empty lanes). Quality matters — it should feel great and be clearly understandable for kids. Build, test thoroughly, and report back. Do NOT deploy/push.

## Codebase (read before changing)
- Working copy: /home/claude/arichae_arcade (NOT git). Do not touch /home/claude/arichae-arcade (deploy repo; the main agent deploys after review). The two trees are currently identical.
- Server: python3 server.py (asyncio, no deps), run with env ARICHAE_PORT=<port> ARICHAE_DATA_DIR=<scratch dir>. Use ports 9100-9199. Kill your servers at the end. Room logic: Room class, run_match (mode "olympic"), bots (Player objects with is_bot), settings messages (events, oai, olv, oseason), join/rejoin, room persistence (pickled rooms; Room.__setstate__ tolerates new attributes). olympic.py: athletes list, RACE_BASE AI times per level 1-5, bot_perf/new_event.
- Client: static/js/app.js (lobby renderOlympicPanel, startPlay ctx, tickPlay, finishPlay, press/release, results/final, HOOKS, window.App incl. App.takePad/App.play helpers used by practice), static/js/olympic-practice.js (solo practice: rules card with AI count/level, instant retry, personal best + best-run ghost in localStorage, client-side port of bot_perf), static/js/games/olympic/*.js: core.js (Oly: athletes ATH/HEAD, makeAthlete(set pose), Masher — any-button mashing, max 15/s), fx.js (juice/slapstick helpers: particles, shake, punch zoom, crowd, PB), scene.js (Oly.Track lanes), race.js (Oly.raceEvent + mashRunner; pure deterministic sim stepped every 10ms; stepper shared with ghost replay), field.js, downhill.js, and 13 events (summer o100 ohurdle olong ojav olift oarch oswim; winter wspeed wshort wbob wslalom wjump wbiath). CSS static/css/style.css — append only at the end (use class prefixes obs-, olv-). games.json lists scripts.
- Test harness: /tmp/claude-0/-home-claude/12057eb2-9fc9-5f4f-a076-1dc5a925f17a/scratchpad/oly_test.py (room match, `python3 oly_test.py <port> <events> <rate> auto`, SHOT2 env), oly_auto.js (in-page auto player: keys a/s/d = red/green/blue), oly_two.py (two humans), practice/prac_test.py, prac_all.py, prac_room.py, arcade_quick.py. Copy into your own folder /tmp/claude-0/-home-claude/12057eb2-9fc9-5f4f-a076-1dc5a925f17a/scratchpad/boost/ and adapt. Playwright + Chromium installed. Look at your screenshots (Read the PNGs) and iterate on visuals.

## Owner's decisions (follow exactly)
1. 필살기 부스터 — only in mashing events: o100, ohurdle, oswim, wspeed, wshort, wbob (push start and/or ride — choose what feels right), wbiath (ski legs).
   - Valid mash taps fill a gauge. When full, the booster can be used ONCE per event (one use, then it's gone for that event).
   - Effect is the SAME for every character (fairness); only the look differs per character (e.g. 뿌뿌 dino: fire trail; 붕붕 bee: buzzing wings; 도치 hedgehog: spin dash; 파카 alpaca: fluffy cloud puff; 레시 red panda: leaf whirlwind; 토리 squirrel: acorn rocket; 엉금 turtle: shell turbo; 콘이 unicorn: rainbow trail; 문이 octopus: ink jet; 퐁당 whale: water jet). Make it punchy: activation flash, short zoom/whoosh, distinct sound, character shout bubble.
   - Activation must be easy on a phone and not conflict with green's existing roles (hurdle jump, short-track lean, biathlon shot, swim breath). Recommended: a big glowing "부스터!" bubble appears over the stage when ready — tap it; also allow pressing red+blue together (within ~120ms). Decide and explain.
   - Activation is part of the pure sim: record it as an input in the log (e.g. code 'X') so replays/ghosts and future server verification stay deterministic. Show other players' (and remote humans') boosts via an appended field in `extra` (append at the end, never reorder).
   - AI bots: their server records stay as is; optionally show a visual boost flourish at a plausible moment for fun (no score change).
2. 역전 장치 — players behind fill the gauge faster, enough that a last-place player can climb into the middle of the pack, but NOT enough to overtake a clear leader. Tune with numbers (e.g. multiplier 1.0 for top half up to ~1.6 for last) and verify by simulation/tests. Since rank comes from other players' live positions, record multiplier changes into the input log (e.g. 'M1.3') so replay stays deterministic.
3. 난이도 이지·노멀·하드·헬 — applies ONLY to single play (the solo practice mode in olympic-practice.js). Must feel clearly different: e.g. timing windows/zone widths, penalties (false start, stumble, wall hit), drift/sway amounts, twist frequency, AI rival strength (이지≈lv1-2, 노멀≈3, 하드≈4-5, 헬 = beyond lv5 with extra mean modifiers). Add a difficulty knob passed through ctx (e.g. ctx.diff = 'easy'|'normal'|'hard'|'hell') that sims read for their parameters; room matches use 'normal' so room play doesn't change. Personal bests and ghosts must be stored PER difficulty. Show the chosen difficulty clearly (colors/badges: 이지 green, 노멀 blue, 하드 orange, 헬 red/black with flames).
4. 레벨업 시스템 — per person, automatic per device (no sign-up): create/keep a device id in localStorage (try/catch), send it on join; the server keeps profiles in DATA_DIR/profiles.json (XP, level, counts), persisted like records. XP from olympic room events (participation, rank, medals, personal record) computed server-side; solo practice can also grant small XP via a client message with a daily cap (family game; light anti-abuse is enough). Smooth XP curve, level shown as a badge next to names in lobby/rivals/results, and a satisfying level-up celebration. Level bands: 이지 Lv1-9, 노멀 Lv10-19, 하드 Lv20-29, 헬 Lv30+.
   - Room gating: the host chooses a room difficulty tier in the olympic lobby: 전체(누구나) / 이지 / 노멀 / 하드 / 헬. Only players whose level is in that band can join (new joins and rejoins of new players; existing members are not kicked when the host changes it). 전체 lets everyone in. Clear Korean error message on the join screen (e.g. "이 방은 노멀(Lv10~19) 방이에요"). Show the tier on the room code card and invite text. Default 전체. Keep backward compatibility for existing rooms (missing attributes) and for clients that don't send a device id (treat as Lv1).
   - The tier does not change the rules of room play (rules stay normal); it may set the default AI bot level to match the tier.

## Constraints
- Keep sims pure/deterministic (no Math.random/DOM/time inside sim functions); visual randomness OK outside.
- Don't break any existing mode (arcade/edu/music/board/card/party/olympic room play, practice, ghosts, records). Regression at the end: oly_test.py on o100, ohurdle, wspeed (room), prac_all.py on a few events per difficulty, two-human test with level gating (join rejected and accepted cases), arcade_quick.py.
- Mid-range phone performance: transforms only, capped particles.
- Korean UI text, kid-friendly; Korean code comments like existing files. `node --check` every JS file you touch; `python3 -m py_compile` for python.

## Final report (concise Korean)
What you built for each of the 4 items with key numbers (booster gauge size/effect, catch-up multipliers and test evidence, difficulty parameter table, XP curve and sources), files changed, test results, decisions you made that the owner should confirm, and absolute paths of 8-12 best screenshots (booster per a few characters, catch-up, difficulty picker, hell mode, level badge/level-up, room tier gating message).

## 추가 지시

Two more owner decisions to add to your current task, in the same working copy (/home/claude/arichae_arcade).

A) Remove the 15 taps/sec cap on Olympic mashing. The owner said: "기록 게임이니 어떤 방식이든 되도록" — it's a record game, so any technique (several fingers, both hands, whatever) should count.
- In core.js, Masher: drop the 15/s limit. Keep only a tiny per-button debounce (~20–25ms) to filter duplicate touch/pointer events from one physical tap. Don't add a different cap.
- Physics must stay bounded the way it already is (vmax etc.), so extreme tapping can't break the sim. Check that:
  - booster/catch-up gauge filling doesn't explode at very high tap rates — cap the gauge fill per second if needed;
  - results stay sane at 20–30 taps/s.
- Remove the "1초에 15번까지만" text everywhere (o100 rules, core.js comment, any other rule text or illus). The o100 rule can say something like "손가락 여러 개로 쳐도 돼요".
- Check that AI RACE_BASE levels still feel right against a fast human: lv5 should still be beatable only by a strong human. Report numbers (sim time at 12/15/20/25 taps/s for o100, ohurdle, oswim/wbiath mash legs). Adjust RACE_BASE only if clearly needed, and say so.

B) Arcade game "전력 질주" (static/js/games/arcade/race.js, plus the games.json text and any rules/illus text there): switch from alternating buttons to "아무 버튼이나 연타", the same feel as the Olympic change, with no rate cap.
- Keep its scoring and records compatible.
- Update its how/rules text.
- Add it to the regression (arcade_quick.py or a small dedicated test).

Include both in your final report.

## 추가 지시

Three more owner change requests (Olympic feel fixes). Do them in the same working copy, keep sims deterministic, and include them in your final report with before/after numbers. Remember difficulty variants: room = normal.

C) 멀리뛰기 (olong) and 창던지기 (ojav), field.js
- Owner feedback: setting the angle slows the runner down, so these events are hard.
- Changes:
  1. Show clearly on the runway where the angle must be set: a highlighted "각도 구간" zone before the foul line, with a label/arrow.
  2. While the angle button is held, the runner keeps their current speed: no hold drag, no slowdown.
- Re-tune the distances so good / average / poor play still produce sensible records. Update the server bot_perf / jump_dist / jav_dist if the distance formulas change, plus the rules text.
- Practice ghosts with old logs: bump RULES_V or the per-event version so stale ghosts and PBs don't mislead.

D) 수영 (oswim)
1. Make the beat a bit slower (BEAT 480ms → about 600–650ms, your call) and make each stroke carry the swimmer further, so a good race takes roughly the same total time. Recheck RACE_BASE oswim against it.
2. Breathing uses the SAME button(s) as forward strokes. No separate green breath button; with the any-button rule, any button works.
   - My reading of the owner's intent: every few beats there is a "숨 박자" (breath beat), shown differently on the beat track, e.g. a big bubble dot. Pressing on a breath beat = breathing.
   - Timed well → the breath gauge refills a lot.
   - Mistimed (miss) → it refills only a little ("미스시 조금만 게이지가 차도록").
   - Normal beats work as now: on-beat = 쭉, mashing = 헛물질 + faster breath drain.
   - Make it readable for kids and update the HUD, rules and illus.
   - If you find a clearly better interpretation, explain it.
3. Booster still applies to swim as planned.

## 추가 지시

More owner change requests for the winter events. Same working copy, deterministic sims. Add before/after numbers to the final report.

E) 스키점프 (wjump)
- On the in-run, going down the ramp: the jumper slides at a BASE speed automatically. Mashing (any button, no cap) adds a BONUS speed on top.
- Mashing must clearly help but never be required to get a decent jump.
- Remove the bird collision twist entirely. Drop the 새 떼 logic, visuals and rules text.
- Re-tune distances and the server bot_perf for wjump if the formulas change.
- Bump the practice rules version so old ghosts/PBs are dropped.

F) 쇼트트랙 (wshort)
- Owner feedback:
  - penguin collisions happen far too often
  - pressing green while mashing is hard
- Changes:
  1. Make penguins much rarer and easier to avoid, or tone the twist down so it's an occasional funny moment, not a constant hazard. Roughly at most 1–2 per race. Your call on exact numbers.
  2. Remove the green-specific control. Everything is any-button.
- Design the corner/lean mechanic so it works with any-button mashing. One option: corners lean automatically, and mashing too hard in a corner risks sliding out, shown with a clear "코너! 살살" cue. Pick what is simplest and most fun for kids, and explain it.
- Update rules, illus, AI and bot_perf consistency.

G) Delete 바이애슬론 (wbiath), the last winter event
- Remove it from:
  - games.json (the olympic group)
  - server OLY lists, olympic.py
  - the lobby event cards
  - records/README
  - practice
  - the booster event list
- Make persisted rooms and existing room settings whose `events` include wbiath drop it gracefully. Same for stored practice data and records: they must not crash anything.
- You may leave the JS file on disk unreferenced, or delete it. Say which.
- Winter then has 5 events: wspeed, wshort, wbob, wslalom, wjump.

## 추가 지시

One more owner request, item H. Do it after items 1–4 and A–G are done, in the same working copy. It touches the core app.js/server.py room flow.

H) 게임 중 일시정지 + 중단하고 대기실 가기 (room play)
Applies to arcade (오락실) minigames first, and to every real-time room mode where it fits: olympic, edu and music if they share the same match flow. For turn-based board/card/party games, at least the abort-to-lobby part.

Who: the 방장 (host) only. Families pausing each other would be chaotic. Other players see a small "방장이 멈출 수 있어요" hint, or nothing.

1. **멈춤**
   - The host's in-game menu button (small ⏸ in a corner, away from the 3 pads) pauses the round for everyone.
   - All phones show a big "잠깐 멈춤" overlay.
   - Timers, gun times, deadlines and bot schedules freeze on both server and client.
   - The server already has a shift_times idea for downtime; reuse it to shift round times by the paused duration.
   - Inputs during pause are ignored and not logged, so deterministic sims and replays stay valid. Also check ghost recording and the server time windows.
   - When the host resumes, everyone sees a 3-2-1 countdown, then play continues.
   - Auto-resume or auto-abort if the host disconnects for a long time. Pick a sane rule and state it.
2. **그만하고 대기실로**
   - From the pause overlay the host can end the match: custom in-page confirm, NOT window.confirm.
   - Everyone returns to the lobby/waiting room.
   - The aborted round is not recorded (no records, medals or XP), but the room, players and settings stay.
3. Solo practice (olympic-practice.js): give the player their own pause / quit-to-menu too.
4. Persistence: a paused room saved by the pickle/restore path must restore cleanly. Restore already returns minigames to the lobby; keep that.

Tests:
- Two-human arcade and olympic: pause mid-race, check both screens and that times shift correctly.
- Resume and finish with sane results.
- Abort returns both players to the lobby, with no record written.
- Non-host can't pause.
- Run the existing regression.

Report it as item H in your final report, with screenshots of the pause overlay and the confirm.

## 중단 직전 에이전트 진행 메모 (마지막 8개)

- Now the practice file and app.js key parts.
- Now rewrite the swim sim and HUD.
- You've hit your session limit · resets 3:10am (UTC)
- You've hit your session limit · resets 8:40am (UTC)
