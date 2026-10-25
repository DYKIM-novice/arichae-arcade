# rpg 작업 사양 (사용자 승인된 지시 원문)

## 원래 작업 지시 (Agent prompt)

Build the first playable version (MVP) of a "회귀 RPG" (regression roguelite action game) for the hobby family web game "아리채 오락실".

Players and controls:
- Kids, a middle-schooler and parents each play on their own phone, in portrait, with Korean UI.
- There are exactly 3 big pad buttons: red, green and blue.

Feel matters more than breadth: hit feel (타격감), juice, and clarity for kids.

Build it, test it thoroughly, and report back. Do NOT deploy or push.

## Where to work
- Use the isolated working copy at /home/claude/rpg_work. It is a git clone of the deployed code with the remote removed. Commit locally so `git diff 7a588dd` shows your work.
- Do NOT touch /home/claude/arichae-arcade, /home/claude/arichae_arcade or /home/claude/kart_work. Other agents are working there.
- The main agent will merge your work later, so keep edits to shared files minimal and fenced with `/* === rpg === */` comments. Shared files are server.py, static/js/app.js, static/games.json, static/index.html, static/css/style.css and static/js/audio.js.
  - style.css: append only at the end, with class prefix `rg-`.
  - Put almost everything in new files.
- Run the server with `ARICHAE_PORT=<port> ARICHAE_DATA_DIR=<scratch dir> python3 server.py`.
  - Use ports 9400–9499.
  - Kill your servers at the end.
- Use /tmp/claude-0/-home-claude/12057eb2-9fc9-5f4f-a076-1dc5a925f17a/scratchpad/rpg/ as your scratch folder.
  - Existing test harnesses you can copy are one level up: oly_test.py, oly_two.py, oly_auto.js (keys a/s/d = red/green/blue), arcade_quick.py and practice/.
- Playwright and Chromium are installed (Python playwright too). Read your screenshot PNGs and iterate on the visuals.

## Read first
- Research report (Korean): /tmp/claude-0/-home-claude/12057eb2-9fc9-5f4f-a076-1dc5a925f17a/scratchpad/rpg_research.md. Read all of it.
  - Note: the owner chose ACTION combat, not the auto-battle the report recommended.
- server.py: asyncio, no dependencies. Covers rooms, modes, run_match, bots as Player objects with is_bot, pickle room persistence (Room.__setstate__ tolerates new attributes), and the AI worker pool.
- static/js/app.js: lobby, modes, startPlay ctx, ticks, results, HOOKS and window.App.
- The Olympic hall, the closest reference for real-time multiplayer:
  - static/js/games/olympic/*.js and olympic.py
  - fx.js has the juice helpers: particles, shake, punch zoom, slapstick.
  - core.js has the 10 cute animal athletes (Oly.ATH / HEAD, makeAthlete SVG with poses, faces). REUSE these characters as the heroes.
  - static/js/olympic-practice.js is the solo mode pattern.
- Party games: partygames/ and static/js/party/.
- Decide where the RPG fits, for example a new lobby mode such as "모험" or "회귀". Explain your choice.

## Owner decisions (follow these)
- **Players: both solo and co-op.**
  - Solo has no waiting.
  - Co-op is a room of up to 4 humans, plus optional AI companions.
  - The same dungeon run is shared by the room. A party wipe or a boss kill sends everyone back (회귀) together.
  - Meta progress (회차, XP multiplier, memory shards, permanent nodes) is personal per device.
- **Combat: action, as an auto-forward side-scroller.**
  - The hero walks forward automatically and stops at enemy encounters.
  - 빨강: attack. Tap for a 3-hit combo; hold for a charged heavy hit.
  - 초록: guard while held. Pressing it just before an enemy hit lands is a PARRY.
  - 파랑: special move, using a gauge filled by hits and parries.
  - Enemies and bosses telegraph attacks clearly with color and a wind-up (1.0–2.0s for bosses), so kids can read them. A colored icon shows the counter where useful, e.g. green = parry this, red = punish window open.
  - In co-op, all heroes stand side by side in one scene.
- **Kick point 1: 회귀 연출 + 전생 정산 (top priority).**
  - On death, the screen rewinds (reverse/rewind effect, desaturate, clock hands spinning backwards), then a huge "제 N회차 회귀!" title appears.
  - Then a 전생 정산 screen counts up what you keep, one line at a time with satisfying pops. For example: 기억 조각 +4, 경험치 배율 ×1.47, 빨강 콤보 Lv2 기억.
  - A boss clear triggers 클리어 회귀 with a bigger celebration and more shards.
  - Death must feel like an event, not a loss.
- **Kick point 2: 패링 손맛 (top priority).**
  - A perfect parry (window about 150ms, generous for phone latency; normal guard reduces damage) gives:
    - hit-stop / slow motion of about 0.3s
    - white flash, spark burst and a sharp distinct sound
    - "패링!" text and an enemy stagger
    - an automatic counter-hit with big damage numbers
  - Every attack has hit feel: 50–90ms hit-stop, knockback, damage numbers, small capped shake, and enemy squash.
- **Regression system:**
  - Carried over: 회차 count, XP multiplier = 1 + 0.33 × √(회차 − 1), capped at ×4, memory shards, a small permanent tree (3 nodes for the MVP, e.g. max HP, starting combo level, one reroll), and "skill memory".
  - Reset each loop: in-run level, in-run upgrades.
  - Death gives shards = 1 + rooms reached. A boss clear gives +10 shards and ★고난 +1 (optional for the MVP).
  - XP levels up faster with the multiplier.
  - The first loop should usually end in death around room 3, within 2–3 minutes, so players quickly taste their first regression.
  - Enemy strength scales with room depth, not with 회차, so loops get noticeably easier but not trivial. Target: a kid clears the boss within 3–5 loops, in about 30 minutes total. Verify with an auto-player simulation of different skill levels and report the numbers.
- **Run structure:**
  - About 4–5 rooms plus 1 boss, 5–7 minutes per loop.
  - After each room, 3 upgrade cards appear as red/green/blue and are picked with the matching button. 8–10 card types.
  - In co-op everyone picks at the same time with no waiting. Each player's cards are their own.
- **Network for co-op:**
  - Each phone simulates its own hero locally for instant response. A family game does not need cheat protection.
  - The server owns enemy HP, the room/boss attack schedule (timestamps synced with the clock offset approach used elsewhere), wipe/clear and progression.
  - Clients report hits and damage. Each client judges its own guard/parry against the scheduled attack times.
  - Windows must be generous.
- **Persistence:**
  - Meta progress lives in localStorage on each device (wrapped in try/catch), sent to the server on join so others see your 회차 badge.
  - Another agent is building a device-id + server profile system elsewhere, so keep the storage layer small and isolated so it can move to the server later.
- **Out of scope for the MVP:** pattern-foresight (예지) and 가호, boss evolution, story, shops, monetization. Leave hooks for them.
- **Content:**
  - 1 stage (a cute forest or cave theme) with 3 enemy types and 1 boss with 3 telegraphed patterns.
  - 10 animal heroes, same stats; looks only.
- Propose 2–3 original Korean names for the game and pick one for now.

## Constraints
- Don't break any existing mode. Regression testing: arcade_quick.py, oly_test.py on o100 (room), and lobby checks.
- Use a fixed-timestep, pure hero/combat step function where it helps testability.
- Mid-range phone performance: DOM/SVG transforms or a canvas, capped particles, 60fps target.
- Korean UI text, kid-friendly. Korean code comments, like the existing files.
- Run `node --check` on JS files and `python3 -m py_compile` on Python files.
- Tests:
  - An in-page auto-player for a full solo run including death → regression → next loop.
  - A two-human co-op run with two browser contexts: shared enemies, a parry on each phone, a wipe → regression together.
  - A clear scenario.

## Final report (concise Korean)
- What you built, mapped to each kick point.
- How controls and parry feel.
- Key numbers: parry window, hit-stop, damage, XP curve, loops-to-clear by simulated skill.
- The co-op network approach.
- Files added, plus every exact shared-file hunk location for merging.
- Name proposals.
- Decisions for the owner to confirm.
- Absolute paths of 8–12 best screenshots: combat, combo, parry flash, boss telegraph, death rewind, "제 N회차 회귀!", 전생 정산, upgrade 3-pick, co-op scene, clear.

## 추가 지시

The owner has decided to test the MVP with the current approach first (code-drawn SVG/canvas, reusing the Olympic animal art) and upgrade the graphics later, likely to PixiJS and possibly with sprite packs.
- Don't add PixiJS now.
- Keep the rendering layer separate from the game sim and state, behind a small renderer interface (for example, a view object with methods like spawn, hit, parryFlash, setPose, rewind), so it can be swapped later without touching combat logic.
- Mention that structure in your report.

## 중단 직전 에이전트 진행 메모 (마지막 8개)

- Co-op works end-to-end: shared enemy HP (754 on both), a parry on each phone, wipe → both regress → run 2 with each phone's own 회차 (A: 2, B: 4). Let me look at the co-op visuals.
- Co-op scene works. Back heroes overlap too much; let me spread the slots, then run the boss/clear scenario.
- Clear flow works (+17 shards, ★1). Two fixes: make the rewind use wall-clock time (it slowed down when the frame rate dropped), and shrink/shift the boss so it doesn't crowd the hero.
- The ground layer is misaligned: the background layers were sized while the screen was still hidden. I'll switch to a ResizeObserver.
- Layers aligned now. Next: a manual-mode run for the card 3-pick screenshot, then co-op with an AI companion.
- Found a real UX bug: a kid mashing red at the moment the room clears instantly picks the red card. Adding an 800 ms input guard when cards appear (and the reroll redraw).
- You've hit your session limit · resets 8:40am (UTC)
- Guard works (the test pressed within the guard window after reroll). Adjusting the test timing and running the key tests.
