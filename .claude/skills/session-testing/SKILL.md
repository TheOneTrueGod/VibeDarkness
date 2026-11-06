---
name: session-testing
description: Test accounts and setup for multi-session browser testing of the local VibeDarkness app, where several Claude sessions each log in as a different user (for example, two players in one lobby). Use when starting sub-sessions that log in through the browser, or when a session needs a second or third local player account.
---

# Session testing (multiple logged-in browser sessions)

Use this when the user asks for several Claude sessions that are each logged into the local app as a different user. A typical case is one host and one joiner for lobby or battle testing.

## Accounts

The credentials are in the gitignored **`.env.playwright.local`** at the repo root. **Read the password from that file.** Do not copy it into skills, docs, commits or chat.

| Player | Username | Env keys |
|--------|----------|----------|
| A | `testuser_a` | `SESSION_TEST_USERNAME_A` / `SESSION_TEST_PASSWORD_A` |
| B | `testuser_b` | `SESSION_TEST_USERNAME_B` / `SESSION_TEST_PASSWORD_B` |

These are local-only, non-admin test accounts. For the debugging and jp-playtest accounts, see **playwright-e2e** ("Local login").

If an account is missing, for example after `storage/` was wiped, recreate it with the login form's "Create account" mode. Use the same username and the password from the env file.

## Prefer the headless driver for multiplayer runs

For playing whole missions in co-op, use **`scripts/playtest-multiplayer.mjs`** (jp-playtest) with `PLAYTEST_ACCOUNTS=session`. It plays both of these accounts in one process. Optional settings:
- `PLAYTEST_LOBBY=CODE` rejoins an existing lobby.
- `quest:<bankId>/<questDefId>/<n>` as the mission argument plays a quest.

Chromium can't start inside the agent sandbox, so start the script in the user's Terminal panel (`run_in_terminal` with a `.ps1` file under `tmp/playwright/`).

Two browser-pane sessions per run (one per player) proved slow and needed the user every few minutes (playtest 0003):
- A session's pane only renders while that session is on screen; otherwise the viewport is 0x0 and rAF stops.
- The orchestrator can only send about 10 cross-session messages per user message.
- The app may stop preview servers.

Use sub-sessions for UI checks a human would do by eye, not for long battles.

## Starting the sessions

Give each sub-session one player from the table and the env key to read. Tell each one:

1. `preview_start` with a URL on its **own hostname**: player A uses `http://localhost:5173` (`vite-dev`), and player B uses `http://127.0.0.1:5176` (`vite-dev-ip` in `.claude/launch.json`). Cookies are keyed by host, not port, so two players on `localhost` end up as the same user.
2. Log in through the auth form. The test ids are in **playwright-e2e** (`login-username`, `login-password`, `login-submit`).
3. Don't edit project files, commit or switch branches. The sessions share the checkout.

## Pitfalls

- **Cookies ignore the port, and every session's browser pane shares one cookie jar.** Two tabs on `localhost:5174` and `localhost:5175` share cookies, so the second login replaces the first. Separate the players by hostname (`localhost` vs `127.0.0.1`), as above.
- **Hidden panes don't run the game.** Check `await __mbAgent.env()` (viewport, visibility, rAF/s). If `healthy` is false, ask the user to show that session's pane.
- Console tools: `window.__mbAgent` (menus: `ids`, `click`, `clickButton`, `fill`, `waitFor`, `env`) and `window.__minionBattlesPlaytest.input` (canvas: `clickUnit`, `rightClickWorld`, `castAt`, `debugHit`). Both send real DOM events.
- The login form remembers the last username in localStorage (`loginUsername`). Check the username field before you submit.
- Each session that runs `preview_start` may start its own Vite server. Stop the extra ones when testing is done.
