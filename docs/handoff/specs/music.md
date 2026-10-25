# music 작업 사양 (사용자 승인된 지시 원문)

## 원래 작업 지시 (Agent prompt)

Improve the rhythm/music games of the hobby family web game "아리채 오락실". Context:
- Korean UI; kids and parents play together, each on their own phone held portrait.
- There are 3 pad buttons: red = left lane, green = middle lane, blue = right lane.
- Build, test, and report back. Do NOT deploy or push.

## Where to work
- Work only in the isolated git working copy /home/claude/music_work (remote removed). Commit locally so `git diff 7a588dd` shows your work.
- Do NOT touch /home/claude/arichae-arcade, /home/claude/arichae_arcade, /home/claude/kart_work or /home/claude/rpg_work. Other agents are working in those.
- The main agent will merge your changes later. Keep edits to shared files (server.py, static/js/app.js, static/games.json, static/css/style.css (append only), static/js/audio.js, static/js/records.js) minimal and fenced with `/* === music === */`.
- Relevant files:
  - static/js/data/songs.js: ARCADE short phrases + HALL long versions, all public-domain
  - static/js/games/arcade/rhythm.js: 오르골 리듬. It has createWith, which the music hall reuses; check the sections/chord logic there.
  - static/js/games/edu/music.js: 음악관 오르골 연주회, levels e/m/h/x = 하/중/상/특상
  - server.py LEVELS = ("e","m","h","x"), plus a check near line 1444 that x is music-only
  - app.js renderMusicPanel and levelName
  - records.js
- Run the server with `ARICHAE_PORT=<port> ARICHAE_DATA_DIR=<scratch dir> python3 server.py`. Use ports 9500–9549 and kill your servers at the end.
- Scratch space: /tmp/claude-0/-home-claude/12057eb2-9fc9-5f4f-a076-1dc5a925f17a/scratchpad/music/. Test harnesses you can copy are one level up: arcade_quick.py, edu_test.py, oly_test.py (a room test pattern), oly_auto.js (keys a/s/d = red/green/blue). Playwright + Chromium are installed; look at your screenshots.

## Owner requests
1. **오락실 오르골 리듬:** the songs are still short phrases that repeat during the ~40s game. Make them longer so a game plays a real stretch of melody with no audible looping.
   - Write full-length public-domain melodies, or reuse/trim the HALL long versions, e.g. the full 작은 별, 환희의 송가 A-A'-B-A', the 엘리제 theme, the minuet, the 터키 행진곡 opening section, the 캐논 progression, the 사계 themes.
   - Aim for no repeat within the arcade duration.
   - Keep the difficulty sensible for the arcade (it's for everyone).
   - Only public-domain compositions, transcribed by us. Don't copy any copyrighted arrangement.
2. **음악관: add 헬 mode** as a 5th level after 특상, with a clearly harder feel. For example:
   - faster tempo
   - notes fall faster
   - more chords
   - longer and denser half-beat combo runs
   - tighter judgment window (if the judge supports it)
   - Badge/color style: red/black with flames.
   - Server: add the level (e.g. "z" or "hell"), allowed for music mode only, like "x". Old rooms/persisted data without it must still work.
   - Records are per level, as existing.
   - Update the lobby level picker and rules text.
3. **음악관: more 좌우중간 반박자 콤보:** more half-beat (8th note) combo patterns that move across the lanes, e.g. 왼-가운데-오른 sweeps, 오른-가운데-왼, 왼-오른 zigzag, and trills.
   - The notes must stay musical: derive the extra notes from the melody, e.g. split long notes into half-beat passing/neighbor tones or arpeggio chord tones. Map lanes by pitch so the music box sound still matches the lane.
   - Scale by level: a few at 중, more at 상, plenty at 특상, long dense runs at 헬. 하 stays as it is.
   - Show a small "콤보!" cue when a run starts, and give a bonus for completing a whole run.
   - Make sure it's still readable on a phone: minimum note spacing, no impossible patterns at the existing speeds.

## Constraints
- Seeded determinism: all players in a room get the same notes from the server seed. Keep that.
- Don't break the edu/arcade flows or records.
- Run `node --check` and `python3 -m py_compile`.
- Regression:
  - arcade_quick.py
  - a music-hall room run at each level, including 헬, with an in-page auto player
  - a two-player sync check (same notes on both)
  - lobby level picker screenshot

## Final report (concise Korean)
- What changed.
- Song lengths per song, arcade vs hall.
- The 헬 parameter table vs other levels.
- Combo pattern types and density per level.
- Files changed, with every shared-file hunk.
- Test results.
- Decisions for the owner.
- Absolute paths of 6–8 screenshots: 헬 badge in lobby, combo run on screen, 헬 play, arcade rhythm with a longer song.

## 중단 직전 에이전트 진행 메모 (마지막 8개)

- Now the room test harness.
- You've hit your session limit · resets 8:40am (UTC)
