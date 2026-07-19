---
name: scoped-testing
description: How to pick the smallest Vitest run for a change. Use after code edits instead of the full suite; npm run ci handles periodic full-suite + lint + tsc.
---

# Scoped testing

**Vitest, not Jest.** Full-suite backstop: **`npm run ci`** (30-minute loop: lint, all tests, `tsc`).

After a code change, run the **smallest** set that still covers what you changed.

## Picking the minimal set (in order)

1. **Tests you added or edited** — always run them:
   ```bash
   npx vitest run path/to/MyFeature.test.ts
   ```

2. **One changed source file** — run tests that import it (`related`), **except hub files** (see below):
   ```bash
   npx vitest related app/js/path/to/Changed.ts --run
   ```
   Repeat for each changed non-test file if they are independent; one `related` call per file is usually enough for a single feature.

3. **Co-located test** — if `Foo.ts` has `Foo.test.ts` beside it, run that file even if `related` did not list it.

4. **Several files or unclear fan-out** — git-aware module graph:
   ```bash
   npx vitest run --changed
   ```
   Multi-commit branch work: `npx vitest run --changed main` (or your base ref). Clean tree after commit: `npx vitest run --changed HEAD~1`.

5. **Known domain folders** (when only that area changed):
   - `game/battlenet/**` → `npx vitest run app/js/games/minion_battles/game/battlenet`
   - Card/ability → co-located `NNNNAbility.test.ts` and often `app/js/games/minion_battles/abilities`
   - New UI helper under `app/js/ci/` → `npx vitest run app/js/ci`

6. **Full suite** — `npm run test` — only when:
   - User explicitly asks
   - Large cross-cutting refactor (serialization, tick loop, shared `types.ts`, managers)
   - Deliberate pre-merge / handoff check
   - **Not** after every small edit (CI covers this routinely)

## Hub files — do **not** use `vitest related`

Some modules sit in so many import graphs that `related` becomes a near-suite run (hundreds of tests, many minutes). **Never** use `npx vitest related <hub> --run` for routine edits to:

- `game/GameEngine.ts`
- `game/types.ts` (and other widely shared wire/runtime type modules)
- `app/js/debug/debugSettingsStore.ts`
- Other “imported by everyone” facades (e.g. large harness entrypoints like `SimulationRunner` when you only touched a leaf)

For those, prefer:

1. Co-located / newly written `*.test.ts` for the change
2. A **named** small set (e.g. `GameEngine.test.ts` only if engine behaviour changed)
3. `npx vitest run --changed` only when you intentionally want broad coverage (still not `npm run test` unless step 6 applies)

On Windows PowerShell, do not pipe Vitest through `Select-Object -Last N` while waiting — it buffers until exit and looks hung.

## New feature checklist

| What you shipped | Minimal run |
|------------------|-------------|
| New module + new `*.test.ts` | That test file |
| Changed `X.ts`, existing `X.test.ts` | `npx vitest run X.test.ts` |
| Changed leaf `X.ts`, no dedicated test | `npx vitest related X.ts --run` |
| Changed **hub** (Engine / shared types / debug store) | Co-located + named small set — **not** `related` |
| React component + unit tests for helpers | Helper test files; skip full UI unless you changed integration behaviour |
| PHP API handler | No Vitest unless TS client types/tests exist; lint TS if types changed |
| Engine / shared types (cross-cutting) | Prefer named tests; use `--changed` only when deliberate; full suite only if step 6 |

## TypeScript

Interface or boundary changes: `npx tsc --noEmit` in addition to scoped Vitest (CI also runs `tsc`).

## Before running Vitest

**Immediately before** the first `npx vitest` or `npm run test` in a turn (only **after** `npm run lint:changed` succeeds with no errors), include this line in your **user-facing message** so the user sees it while tests run:

<span style="color: green">Starting unit tests — first pass on the code is done; feel free to run your own checks.</span>

Use that **exact** HTML (green text). Post it again before each Vitest re-run after a failed attempt. Do **not** post it for lint-only runs or when Vitest is skipped (skills-only edits, informational requests).

## Reporting

Tell the user how many tests **you actually ran**, e.g. `All (7) scoped tests have passed` — not the full-suite count unless you ran `npm run test`.
