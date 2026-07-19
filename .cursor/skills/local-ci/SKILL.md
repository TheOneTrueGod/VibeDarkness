---
name: local-ci
description: Explains VibeDarkness local continuous integration (`npm run ci`), where results are written, and how to read failures. Use when investigating CI failures, the CiStatusPill, or storage/ci_results.json.
---

# Local CI (`npm run ci`)

This project’s **CI** is a **local long-running Node loop**, not GitHub Actions. Starting it:

```bash
npm run ci
```

Entry point: `scripts/ci.js`. Interval and results path: `scripts/ciConstants.js`. Payload shape: `scripts/ciTypes.js` / `app/js/ci/ciStatus.ts`.

## What each cycle runs

In order, against the full tree:

1. **ESLint** (`npx eslint .`) — counts `errorCount`
2. **Vitest full suite** (`npx vitest run`) — pass/fail counts + failed test names
3. **TypeScript** (`npx tsc --noEmit`) — counts `error TS…` lines

Wall time, counts, and failure names are written when the cycle finishes. The loop then sleeps **30 minutes** and repeats.

## Results “log”

There is no separate log directory. The durable output is:

**`storage/ci_results.json`**

Read this file to see the last completed (or in-progress) run. Key fields:

| Field | Meaning |
|-------|---------|
| `running` | `true` while lint/tests/`tsc` are executing |
| `skipped` | Checks were skipped because the git tree fingerprint matched the last completed run |
| `testsPassed` / `testsFailed` | Vitest totals |
| `failedTestNames` | Failed assertion/full names from the Vitest JSON report |
| `lintErrors` | ESLint error count |
| `typescriptErrors` | Count of `error TS…` from `tsc` |
| `startedAt` / `finishedAt` / `durationMs` | Timing for the last real run |
| `nextScheduledAt` | When the loop will attempt the next cycle |
| `sourceFingerprint` | Hash of `git rev-parse HEAD` + `git status --porcelain` |

A run is **failing** when `testsFailed > 0` **or** `lintErrors > 0` **or** `typescriptErrors > 0` (see `getCiPillVariant` in `app/js/ci/ciStatus.ts`).

## Skip behavior

If the fingerprint is unchanged since the last **finished** run, the cycle does **not** re-run checks: it sets `skipped: true`, advances `nextScheduledAt`, and keeps the previous failure/pass counts. Source must change (commit or dirty tree) before counts refresh.

## How agents should use this

- **Diagnose “CI failed”** → open `storage/ci_results.json` first (failed test names + lint/TS counts).
- **Reproduce** → run the matching tool locally (`npx tsc --noEmit`, the named Vitest file, `npm run lint`). Do **not** start another `npm run ci` loop just to debug one failure.
- **After normal code edits** → use **scoped-testing** + the post-change lint/Vitest hook. Local CI is the periodic full-suite backstop, not the per-edit test command.
- **Do not** treat a skipped cycle as a fresh green/red signal; check `skipped` / `lastSkippedAt` and whether `sourceFingerprint` matches the current tree.

## Status in the UI (brief)

Admins can see the same JSON via `/api/admin/ci-status` (`GetCiStatusHandler.php`), surfaced by `CiStatusPill`. The pill’s waiting/pass/fail mapping lives in `app/js/ci/ciStatus.ts`.
