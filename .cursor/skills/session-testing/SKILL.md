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

## Starting the sessions

Give each sub-session one player from the table and the env key to read. Tell each one:

1. `preview_start` with `{name: "vite-dev"}`. If port 5173 is taken, Vite may move to another port (5174, 5175, …). Report the URL actually used.
2. Log in through the auth form. The test ids are in **playwright-e2e** (`login-username`, `login-password`, `login-submit`).
3. Don't edit project files, commit or switch branches. The sessions share the checkout.

## Pitfalls

- **Cookies ignore the port.** Two tabs on `localhost:5174` and `localhost:5175` have separate localStorage but share cookies. The second login can replace the first one's server session. If a tab starts acting as the wrong user after a reload, give the two players separate browsers: one in the built-in browser pane and the other in Claude in Chrome.
- The login form remembers the last username in localStorage (`loginUsername`). Check the username field before you submit.
- Each session that runs `preview_start` may start its own Vite server. Stop the extra ones when testing is done.
