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
   - Account 2: `PLAYWRIGHT_USERNAME_2` / `PLAYWRIGHT_PASSWORD_2` in the same file. The user
     creates this account themselves. If it is missing, stop and ask; do not make one.
   - Never print the passwords. Read them from the file inside scripts.
   - **Both test accounts are non-admin, and must stay that way.** A playtest should exercise
     what a normal player sees, so it must not depend on admin-only tools (God mode, Super
     Speed, Skip current turn, admin join bypass, Mission Select). If a run seems to need
     admin access, stop and ask the user for permission first. Never promote an account
     yourself.
3. Playwright Chromium installed (`npx playwright install chromium`). See **playwright-e2e**
   for the sandbox rules (localhost origins only, artifacts under `tmp/playwright/`).

## Which browser to drive

- **Playwright (Node script, two `browser.newContext()`s)** is the main tool. Separate contexts
  have separate cookies, so two logins can run side by side in one process. Reuse the helpers in
  `scripts/play-mission-smoke-playwright.mjs` (login, campaign bootstrap wait, character
  ensure, host mission, character-select Ready, pre-mission story).
- The **built-in browser pane** shares one cookie jar across its tabs, so it cannot be logged
  in as two accounts at once. Use it only to *watch* one side, or for screenshots.

## Flow (per mission)

1. Both contexts: login → wait out AuthGate "Loading..." and campaign bootstrap.
2. Host (account 1): Characters tab → pick or create a character → Mission Map →
   `mission-map-node-{missionId}` → `mission-host` → URL `/lobby/{CODE}`.
3. Joiner (account 2): join by lobby code (Join Mission tab or `/lobby/{CODE}`). _TODO: confirm
   the exact join path and testids on the first real run._
4. Both: character select → `character-select-ready`.
5. Pre-mission story: `story-next`, plus `story-choice-{optionId}` for choice phrases
   (Dark Awakening asks for a weapon). In multiplayer, every player must reach story-ready.
6. Battle: dismiss the objectives popover (`objectives-popover-start`), then play turns until
   victory or defeat. Read the tick from `game-session[data-game-tick]` or
   `window.__minionBattlesSyncDebug`.
7. Victory → next-mission handoff (`useNextMissionHandoff`) or back to the Mission Map for
   mission 2.

## Playing battles: input strategy

The Pixi canvas has no DOM for units. Clicking from screenshots is slow and fragile.

**Planned: a dev-only order bridge** (`window.__minionBattlesPlaytest`, dev builds only):
- Read: local player's waiting units, their abilities, unit positions/HP, enemies, objective
  markers.
- Write: `submitOrder(order)` → **`BattleSession.submitPlayerOrder`**, the same entry point the
  Wait button and `PlayerInteractionManager` use. Orders still go through
  `BattleNet.submitOrder` (HTTP append, awaiting-ack set, so the Your Turn toolbar spinner
  shows) and still fire the WebRTC `battle_sync_nudge` after the server accepts them.
- Abilities with interactive (sequential) targeting open ITS inside `submitPlayerOrder`. The
  bridge must then commit ITS through `session.interactiveTargeting`, not skip it.
- It bypasses only the pointer → targeting-preview UI. Bugs in hover, click or aim UI need a
  canvas-click run instead.

Simple policies: Dark Awakening = move toward and attack the nearest enemy, then survive and
eliminate all. Towards the Light = path every player unit to the campfire objective.

## Measurements to capture

- Order latency: from the submit call to the toolbar spinner clearing (BattleNet
  awaiting-server set emptied) on the submitter, and to the order appearing in the peer's
  engine.
- Desyncs (fingerprint mismatch logs), recoveries, stalls (tick unchanged for more than about
  10s while nobody is waiting on input).
- Use **debugging-lobbies** / `npm run desyncDebug-*` scripts on the lobby code after the run.

## Run log / lessons

- 2026-11-02 (first attempt): blocked before playing. (1) Only one account exists, and the same
  account in two contexts is the same lobby player. (2) There was no programmatic way to play
  battles, so the order bridge above was proposed. Earlier solo smoke notes:
  `tmp/playwright/mission-play-notes.md` (story choices, objectives popover, ticks stalling
  until Wait is pressed).
