# kart 작업 사양 (사용자 승인된 지시 원문)

## 원래 작업 지시 (Agent prompt)

Build the first playable version (MVP) of a kart racing game for the hobby family web game "아리채 오락실".
- Korean UI. Kids, a middle-schooler and parents each play on their own phone in portrait.
- Each player has 3 big pad buttons: red, green, blue.
- Up to 8 players; AI fills empty seats.
- Quality and feel matter more than breadth.
- Build, test thoroughly, and report back. Do NOT deploy or push.

## Where to work
- Isolated working copy: /home/claude/kart_work. It is a git clone of the deployed code (remote removed). Commit locally as you like so `git diff 7a588dd` shows your work.
- Do NOT touch /home/claude/arichae-arcade (deploy repo) or /home/claude/arichae_arcade (another agent is working there on Olympic features).
- Because the main agent will merge your work into the other tree later, keep edits to shared files minimal and clearly fenced with comments like `/* === kart === */`:
  - server.py, static/js/app.js, static/games.json, static/index.html, static/css/style.css (append-only at the end, class prefix `okt-` or `kt-`), static/js/audio.js
  - Put almost everything in new files.
- Server: `python3 server.py` with env `ARICHAE_PORT=<port> ARICHAE_DATA_DIR=<scratch dir>`. Use ports 9300–9399. Kill your servers at the end.
- Scratch folder: /tmp/claude-0/-home-claude/12057eb2-9fc9-5f4f-a076-1dc5a925f17a/scratchpad/kart/. Existing test harnesses you can copy and adapt are one level up (oly_test.py, oly_two.py, oly_auto.js, arcade_quick.py, practice/).
- Playwright and Chromium are installed. Python playwright is installed too. Look at your screenshots (Read the PNGs) and iterate on visuals.

## Read first
- Research report, written in Korean, which the owner approved: /tmp/claude-0/-home-claude/12057eb2-9fc9-5f4f-a076-1dc5a925f17a/scratchpad/kart_research.md. Read it all, especially (d) kick points, (e) controls and camera, (f) MVP scope, and the IP safety rules.
- Codebase:
  - server.py: asyncio, no deps. Rooms, modes, run_match, bots as Player objects with is_bot, room persistence via pickle (Room.__setstate__ tolerates new attributes), AI worker pool.
  - static/js/app.js: lobby, modes, startPlay ctx, tick, results, HOOKS, window.App.
  - The Olympic hall: static/js/games/olympic/*.js plus olympic.py. Study it as the closest reference for real-time multi-player races: live value streaming every 200ms, bots on server, results/medals.
  - static/js/games/olympic/core.js has the 10 cute animal athletes (Oly.ATH / HEAD, makeAthlete SVG, faces). REUSE these characters as the kart drivers. Rendering their SVG to a canvas texture for billboards is fine.
  - Party games: partygames/ and static/js/party/.
- Decide where the kart game fits best, e.g. a new lobby mode "카트" or a group in an existing mode. Explain your choice.

## Owner decisions (follow)
Kick points (owner said "진행" to these):
1. 역전은 늘 가능, 그래도 잘하면 이긴다
   - Items are handed out by distance to 1st place.
   - 1st place mostly gets defensive or double-edged items.
   - The one "1등 견제" item (공룡 쿵쿵 지진) is announced 2 seconds ahead: warning plus shake on the leader's phone, and it can be dodged with a well-timed drift boost.
   - No speed rubber-banding for humans. AI help comes only from item luck.
   - Personal-screen effects come through items, e.g. 다람쥐 "버튼 뒤죽박죽" swaps red and blue for 3s on the victim's phone only.
2. 드리프트 한 방의 손맛
   - Hold to charge a 2-stage drift spark, release for a whoosh boost.
   - Exaggerated sound, sparks and character shout.
   - Also a "draft" boost that fills by staying close behind another kart, so beginners taste boosting too.
   - Don't copy Mario Kart's blue→orange→purple spark colors. Use our own palette.
3. 탈락/먼저 들어오면 응원단
   - Players who finish first (MVP; knockout is out of scope) get spectator buttons on their phone:
     - 빨강: 응원 폭죽, a small boost to a chosen racer
     - 파랑: drop a 꿀 웅덩이 on the course
     - 초록: send a cheer emoji
   - No one waits bored.

Controls:
- Default ① 카러형:
  - Auto-forward.
  - Hold red = steer left, hold blue = steer right.
  - Green tapped alone = use item.
  - Green held together with a direction = drift charge; release = boost.
  - Optional small extra boost for a counter-tap right after a drift.
- Per-player toggle ② 도우미 (helper) mode for little kids and grandparents:
  - Auto-steer along the course with 3 lanes. Red/blue tap = change lane.
  - Holding the inside button in a corner charges drift.
  - Green = item.
  - Cannot hit walls.
  - Both modes coexist in the same race.
- Soft walls: slide and bounce off, never a dead stop.

Graphics:
- three.js. Vendor a pinned stable version into static/js/vendor/ via npm (the npm registry works; external CDNs may not).
- Flat textured track plane (draw the track to a canvas texture, or a few meshes), tilted chase camera behind the kart, characters as camera-facing 2D billboards. In effect a GPU Mode-7 look.
- Make camera tilt and height constants easy to tweak.
- Smooth, lagged camera rotation to avoid motion sickness. Minimal shake.
- Portrait phone. Target 60fps on mid-range phones: cap pixel ratio around 2, low draw calls, no heavy post-processing.
- Mini-map and position/lap HUD on top. The 3 pad buttons sit at the bottom, like the existing games.

Network:
- Each phone simulates its own kart locally (instant response; family game, cheating is not a concern) and sends its state ~15–20Hz.
- Other karts are interpolated about 100ms in the past.
- Server runs:
  - AI karts following the course centerline (slightly weaker than an average family member; tune AI levels if the room has a level setting)
  - item grants and hit judgement (generous hitboxes)
  - rank, finish, results
- No kart-kart physical collisions in MVP, or only very soft ones.

MVP scope:
- 1 track: about 40s per lap × 2 laps, 1 shortcut, 1 obstacle type. Theme it to fit the existing world (e.g. a cute park or Olympic stadium surroundings).
- 8-player race with AI fill.
- Items in MVP, all pickups from our own "응원 풍선" balloons (NOT "?" boxes):
  - 고슴도치 가시공 굴리기 (attack)
  - 벌 꿀 웅덩이 (trap)
  - 공룡 쿵쿵 지진 (1st-place check, telegraphed 2s, dodgeable)
  - 다람쥐 버튼 뒤죽박죽 (personal-screen effect)
- When hit: phone vibration if supported (iOS doesn't support it, so add a screen + sound fallback) and a crying-face close-up.
- Results screen with funny awards (e.g. "오늘의 꿀범벅상") and an instant rematch button.
- Character pick reuses the 10 animals.
- Target: the gap between 1st and last finish within about 10s in typical family races. Verify with AI/auto-player simulations and report the numbers.
- Out of scope: per-character items, battle mode, knockout, ghosts, unlocks.

IP safety:
- No ? boxes, shells, bananas, mushrooms, stars, lightning, bullets, ink, Mario Kart spark color order, KartRider names, or brand-prefixed names.
- Name the game something original, e.g. "아리채 카트" or something cuter. Propose 2–3 names and pick one for now.

## Constraints
- Don't break any existing mode. Regression: arcade_quick.py, oly_test.py on o100 (room), plus a quick check that the lobby still works.
- Keep the deterministic-sim style of the codebase where it helps: pure step function for kart physics, fixed timestep. Visual randomness is fine outside it.
- Korean UI text, kid-friendly. Korean code comments like existing files.
- Run `node --check` on JS files and `python3 -m py_compile` on Python files.
- Testing:
  - Build an in-page auto-driver (keys a/s/d = red/green/blue like the existing tests) and run a full race with 1 human + 7 AI.
  - Run a two-human race (two browser contexts) to verify sync, items hitting the other human, the spectator buttons after finishing, and helper mode.
  - Measure fps in headless Chromium if you can, and note what you measured.

## Final report (concise Korean)
- What you built, mapped to each kick point.
- Controls and how they felt.
- Key tuning numbers: speeds, drift stages, item odds by position, finish-gap results.
- Network approach and measured behavior.
- Files added and the exact shared-file changes (list every hunk location) so the main agent can merge.
- Name proposals.
- Decisions the owner should confirm.
- Absolute paths of 8–12 best screenshots: start grid, drifting with sparks, item hits (each of the 4), the 2s warning on the leader, spectator buttons, helper mode, results awards, mini-map.

## 중단 직전 에이전트 진행 메모 (마지막 8개)

- Full race works (gap 4.4s). Fix: the helper badge was set because finished karts coast in auto mode; also add per-frame JS cost measurement.
- Now the two-human test (sync, cross-human item hits, spectator buttons, helper mode, rematch).
- While that runs, I'll write a headless Node network simulator (real server, WebSocket clients running the same core physics and auto-driver) to measure finish gaps over many races.
- Meanwhile, let me look at some of the captured moments.
- Improving spark visibility and the sub-text legibility meanwhile.
- The kart screen opens fine (the first failure was just slow loading). But there was a server-side "웹소켓 오류". Rerunning with full logs saved.
- You've hit your session limit · resets 8:40am (UTC)
- The websocket error is already fixed (the `self=` kwarg clash in `kart.py`; 0 tracebacks in both re-sims). Now a quick showcase-screenshot run plus the regression tests.
