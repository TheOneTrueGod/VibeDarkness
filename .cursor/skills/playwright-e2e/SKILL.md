---
name: playwright-e2e
description: Headless Playwright e2e/smoke for VibeDarkness with project sandbox (allowed origins, downloads under tmp/playwright, Chromium sandbox). Use when verifying UI in a browser or writing e2e specs under e2e/.
---

# Playwright (sandboxed e2e)

Not part of **`npm run ci`** or Vitest. Agents use this for headless UI checks after frontend work.

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
4. Smoke notes: `tmp/playwright/mission-play-notes.md`, `account-creation-notes.md`.
