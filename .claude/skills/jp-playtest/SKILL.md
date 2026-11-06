---
name: jp-playtest
description: Plays a real two-player Minion Battles multiplayer game in two browser sessions (host + joiner) through the requested campaign missions (default: the first two), and records sync, latency and UX problems. Use when the user says /jp-playtest, asks for a multiplayer playtest, or wants missions played end to end in the live app.
---

# jp-playtest

**Status: experimental draft (2026-11-02).** The tooling is still being built. Every run should
update the "Run log / lessons" section with what went wrong and which tool would have helped.

## Arguments

- Mission list (ids or names). Default: the first two World of Darkness missions,
  `dark_awakening` then `towards_the_light`
  (`app/js/games/minion_battles/storylines/WorldOfDarkness/missions/001_*`, `002_*`).

## Prerequisites

1. **Stack up.** Vite `:5173` and PHP `:8000` (`npm run dev`, `npm run php`). Check with
   `curl localhost:5173` / `curl localhost:8000/api/account/me` before starting a new one;
   the user often has them running already.
2. **Two accounts.** Lobby players are keyed by **account id** (`JoinLobbyHandler` →
   `LobbyManager::joinLobby`), so the same login in two browsers is **one player**, not two.
   - Account 1: `PLAYWRIGHT_USERNAME` / `PLAYWRIGHT_PASSWORD` in `.env.playwright.local`.
   - Account 2: `PLAYWRIGHT_USERNAME_2` / `PLAYWRIGHT_PASSWORD_2` in the same file. Account 2 is `LomithTwo`
     (created 2026-11-02 at the user's request). If its lines are missing, stop and ask; only
     create a replacement if the user says to.
   - Never print the passwords. Read them from the file inside scripts.
   - **Both test accounts are non-admin, and must stay that way.** A playtest should exercise
     what a normal player sees, so it must not depend on admin-only tools (God mode, Super
     Speed, Skip current turn, admin join bypass, Mission Select). If a run seems to need
     admin access, stop and ask the user for permission first. Never promote an account
     yourself.
3. Playwright Chromium installed (`npx playwright install chromium`). See **playwright-e2e**
   for the sandbox rules (localhost origins only, artifacts under `tmp/playwright/`).

## Step 0: sandbox preflight (always first)

Run `npm run -s playtest:check-sandbox`. Exit 0 prints `sandbox check: OK`; exit 2 prints
`sandbox check: BLOCKED`. Inside an agent's tool sandbox it is usually BLOCKED, because
Chromium's own OS sandbox cannot start there.

If it is BLOCKED, **stop**. Do not lift the tool sandbox or turn off Chromium's sandbox (auto
mode refuses both, and the user wants to run it instead). End the turn with a message that
opens with 🚨 and gives the exact command for the user's own terminal, with the missions
filled in. For example:

> 🚨 **Run this yourself:** Chromium's sandbox can't start inside my sandbox.
> ```bash
> npm run playtest -- dark_awakening towards_the_light
> ```
> Then tell me, and I'll read the newest `tmp/playwright/playtest/<stamp>/report.json`.

When the user says it has finished, read the newest report and screenshots and continue from
"Measurements" below.

## Running it

```bash
npm run playtest                       # dark_awakening, then towards_the_light
npm run playtest -- towards_the_light  # any mission ids, in order
```

Env: `PLAYTEST_SOLO=1` (host only, to check the tooling without account 2),
`PLAYTEST_HEADED=1`, `PLAYTEST_MAX_MINUTES` (battle budget per mission, default 15).
Output: `tmp/playwright/playtest/<stamp>/report.json` plus screenshots (failure, stalls,
end of each mission). Read the report, then summarise outcomes, spinner latency and stalls for the user.

**Chromium OS sandbox inside the agent's tool sandbox:** with `chromiumSandbox: true`, `newPage`
fails with "Target page, context or browser has been closed". See Step 0: the user runs it.

## Which browser to drive

- **Playwright (`scripts/playtest-multiplayer.mjs`)** is the main tool. Two
  `browser.newContext()`s have separate cookies, so both accounts play side by side in one process.
- **Do not use the built-in browser pane for this.** It shares one cookie jar across tabs, and it
  is usually signed in as the user's own **admin** account. Never play as the user and never sign
  them out. At most, use it to watch a lobby.

## Flow (what the script does per mission)

1. Both: login → wait out AuthGate "Loading..." → `campaign-tabs`.
2. Both: Characters tab → select the first character or create one.
3. Host: Mission Map → `mission-map-node-{missionId}` → `mission-host` → `/lobby/{CODE}`.
4. Joiner: `page.goto('/lobby/{CODE}')`. The App route auto-joins (`useLobbyLifecycle`); the Join
   Mission tab ("Enter lobby code" + "Join by Code") is the manual equivalent.
5. Both, until the playtest bridge appears: `character-select-ready`, the first enabled
   `story-choice-*`, `story-next`.
6. Battle: `objectives-popover-start`, then the autoplay loop below, until `victory-popover`
   (or defeat text, or the time budget runs out).
7. Victory: `victory-popover-continue`. If the host is still in a lobby it continues there
   (next-mission handoff), otherwise it hosts the next mission from the Mission Map. _Unverified:
   the handoff path has not been seen on a real run yet._

## Playing battles: real input at bridge-reported points

`window.__minionBattlesPlaytest` (`ui/pages/battlePhase/usePlaytestBridge.ts`, dev builds only)
is **read-only** plus `focus` (camera only). It reports snapshot data (tick, `canUseOrderUi`,
`myWaiterUnitId`, ITS state, `waitingForTargetInput`, units with world+grid positions,
my abilities with `aiSettings`, mission objectives with `toComplete`), `worldToScreen`,
`gridToWorld` and `spinnerSpans`.

The script then uses **real Playwright mouse/DOM input**:
- canvas clicks at `canvas.boundingBox() + worldToScreen(x, y)` (BattleCanvas uses CSS pixels
  relative to the canvas rect); `focus` first when the point is off-screen;
- ability cards via `battle-ability-card-{abilityId}` (`data-disabled-reason` set when locked);
- Pass via `battle-pass`; ITS buttons by accessible name `Done` / `Undo`.

So orders go through the targeting tools, ITS, `BattleSession.submitPlayerOrder`,
`BattleNet.submitOrder` (HTTP append + awaiting-ack, so the spinner runs) and the WebRTC
`battle_sync_nudge`, exactly as for a human.

Policy (`takeTurn`): if an active `allUnitsNearPosition` objective exists, right-click toward it
and Pass. Otherwise try each usable card on the nearest enemy (range = `aiSettings.maxRange`,
or 120px when there are no aiSettings), else right-click toward the enemy and Pass. Improve the
policy in the script; keep the bridge read-only.

## Measurements

- **Spinner latency:** `spinnerSpans()` records each "Turn submitted, waiting for the server"
  span (`awaitingServerAfterSubmit`). The report gives p50/p90/max per player.
- **Stalls:** tick unchanged for 20s while it is not our turn → screenshot + note.
- Console errors per player (first 30).
- After a run, use **debugging-lobbies** / `npm run desyncDebug-*` on the lobby codes in the report.

## Run log / lessons

- 2026-11-02 (first attempt): blocked before playing. (1) Only one account exists, and the same
  account in two contexts is the same lobby player. (2) There was no programmatic way to play
  battles, so the bridge was built. Earlier solo smoke notes:
  `tmp/playwright/mission-play-notes.md` (story choices, objectives popover, ticks stalling
  until Wait is pressed).
- 2026-11-02 (bridge built): the bridge, the testids and the script typecheck and lint, but have
  **not run yet**. Account 2 is still missing, sandboxed Chromium cannot launch from the agent
  sandbox (see above), and the browser pane is signed in as the user's admin account. The first
  real run should check: card click → canvas click actually starts casts, the ITS loop, the
  joiner's character select, and the victory → next-mission handoff.
- 2026-11-03 (first real run, user's terminal; report `2026-11-03T07-35-23-343Z`): both accounts
  logged in, then the run failed after 49s with no battle. Both players already had a character
  open. `ensureCharacter` checked the mission-map tab once, right after loading: the host's editor
  was showing, but the joiner's opened a moment later over the character list, so its card click
  was intercepted until timeout. Fixed: wait for map tab / card / Create, and treat an intercepted
  card click as "already open" when the map tab is then visible. Also added a live frame counter
  (each player's engine tick and frames/s, redrawn in place on a TTY, every 5s otherwise).
  Still unverified: everything from the battle onward.
- 2026-11-03 (second run, report `2026-11-03T07-38-33-966Z`, lobby 0E681D): the character fix
  worked and the battle started after 11s. Both players cast through ITS and the turn-2 orders
  merged on the server (no resync of any kind). Then a card click for turn 3 timed out (30s) and
  the run failed. The pages were starved: each failure screenshot took 69s / 92s, and the host
  needed ~85s (server timestamps) to simulate ticks 2→27. Likely cause: two headless Chromiums
  rendering Pixi through software WebGL on a 4-thread machine, next to two Vite servers and the
  single-threaded `php -S`. Try `PLAYTEST_HEADED=1` (hardware GPU) next. Also: the Node process
  hung after writing the report because the frame-counter interval was not stopped when the
  battle threw (fixed with `finally`). Lesson: client lobby-log `ts` is the batch-upload time; use
  `origin: "server"` rows for real timings. The 20s stall notes fired while players were still
  choosing/previewing their first turn, so they are noisy.
- 2026-11-03 16:00 run (report `2026-11-03T16-00-13-036Z`, lobby A45EBF), analysed 2026-11-06:
  the battle ran to tick 755 (~30 turns, both players casting), then hung for 13 minutes. Two
  real sync bugs (see the notes for the evidence): (1) a genuine sim divergence at tick 77, the
  host's re-sim after ITS `restoreToMark` 190→76 (wolf unit_3's lunge stops dead on the host
  only); the joiner caught it at 107 and resynced. (2) The final hang: the joiner's finalized
  756 order sat in `pending_orders` and the host never fetched it, because `ordersRecordCount`
  went 24 → 23 (the 720 merge dropped a host draft) → 24 (joiner append), and the host gates
  its fetch on `count > lastSeen`. The host has no stuck-pause fallback (the non-host does).
  Tool lessons: 50 recoveries each logged a ~3 MB "recent tick history", making a 153 MB
  lobby_log. That made `/lobby_debug` log methods 500 (PHP OOM), and made `desyncDebug-desyncs`
  print gigabytes; both are fixed (streaming, oversized-line stubs, `maxEvents`). The script
  kept writing a stall note every 20s for 13 minutes; it should stop after a few.
