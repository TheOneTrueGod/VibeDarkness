---
name: playwright-e2e
description: Sandboxed Playwright for VibeDarkness — lobby debugging, UI smoke, and expandable agent browser tools. Use when driving the live app headlessly, reproducing lobby/battle issues, or proposing new Playwright helpers.
---

# Playwright (sandboxed browser tooling)

Not part of **`npm run ci`** or Vitest.

**Primary use for agents: debugging lobbies** in a real browser (host/join, phases, battle ticks, Wait, leave) with the same sandboxed Chromium setup as e2e smoke. Also used for UI verification after frontend work.

We can **set up a dedicated testing mission** for Playwright runs when that would help (ask the user / pair on a mission id rather than always using storyline first missions). Expand this toolkit **as needed** — when a lobby-debug or play workflow is awkward, **propose a new script, testid, or helper** (do not wait for the user to invent every tool).

Companion for storage/`lobby_debug` investigation: **debugging-lobbies**.

## Commands

```bash
npm run test:e2e:smoke   # starter sandbox smoke
npm run test:e2e         # all specs under e2e/
npm run account:create   # create/login helper account
npm run play:smoke       # login → host first mission → play to tick 100
```

Requires Chromium once: `npx playwright install chromium`. Stack: `npm run php` + `npm run dev` (or reuse running servers).

## Sandbox

Chromium OS sandbox on; artifacts under `tmp/playwright/`; only localhost Vite/PHP origins; `file://` blocked. Specs must `import { test, expect } from './fixtures/sandboxed'`.

## Selectors: prefer `data-testid`

Canonical ids: **`app/js/testing/testIds.ts`** (mirror for Node scripts: `scripts/testIds.mjs`).

| Test id | Purpose |
|---------|---------|
| `login-username` / `login-password` / `login-submit` / `login-mode-toggle` | Auth form |
| `campaign-tab-{tabId}` | Campaign home tabs (`characters`, `join_mission`, …) |
| `characters-create` / `character-card-{id}` | Characters panel |
| `character-editor-tab-mission-map` / `mission-map-node-{missionId}` / `mission-host` | Host mission |
| `character-select-ready` | Lobby Ready |
| `story-next` / `story-choice-{optionId}` | Pre-mission story |
| `battle-wait` / `lobby-leave` | Battle Wait + Leave |
| `app-logout` | Campaign chrome Log out |
| `game-session` | Root with `data-game-phase` + `data-game-tick` |

Use `page.getByTestId(...)`. Wait accessible name is **`Wait`** (kbd is `aria-hidden`); `title` still has “Wait (Space)”.

## Agent workflow

1. Prefer testids over copy/CSS.
2. Do not use Playwright instead of Vitest for engine logic.
3. After changes: `npm run lint:changed`, then the relevant Playwright command.
4. Notes from exploratory runs: `tmp/playwright/mission-play-notes.md`, `account-creation-notes.md`.
5. When stuck diagnosing a lobby in-browser, propose the next Playwright capability (e.g. join-as-second-client, pause-at-tick, dump sync bridge, testing-mission host) instead of only manual clicks.
