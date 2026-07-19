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
```

Requires Chromium once: `npx playwright install chromium`.

Expects the local stack (Playwright can start them, or reuse running ones):

- `npm run php` → `http://localhost:8000`
- `npm run dev` → `http://localhost:5173` (baseURL; proxies `/api` to PHP)

Override base URL with `PLAYWRIGHT_BASE_URL` if needed.

## Sandbox guarantees

| Control | Where |
|---------|--------|
| Chromium OS sandbox **on** (`chromiumSandbox: true`, never `--no-sandbox`) | `playwright.config.ts` |
| Downloads / traces / reports under **`tmp/playwright/`** (gitignored) | `e2e/sandboxConstants.ts` |
| Only **localhost:5173** and **localhost:8000** (and 127.0.0.1) | `e2e/fixtures/sandbox.ts` |
| **`file://` blocked** | same fixture |

Always write new specs with:

```ts
import { test, expect } from './fixtures/sandboxed';
```

Do **not** import `@playwright/test` directly in specs — that skips origin/`file://` guards.

Allowed origins live in `e2e/sandboxConstants.ts`. Widen them only when a real project dependency requires it (prefer keeping the list tiny).

## Agent workflow

1. Prefer **`npm run test:e2e:smoke`** after UI/layout changes, or a named `e2e/*.spec.ts` you added.
2. Do **not** replace Vitest with Playwright for engine/unit logic — see **scoped-testing**.
3. Artifacts: `tmp/playwright/` (screenshots on failure, HTML report, downloads). Do not write outside the repo.
4. After e2e code changes: **`npm run lint:changed`**, then the relevant Playwright command (not the full Vitest suite).

## Adding a spec

1. Create `e2e/<name>.spec.ts` using the sandboxed fixtures.
2. Keep selectors stable; prefer roles/labels over CSS when possible.
3. Assume headless Chromium only (no Firefox/WebKit in this project config).
