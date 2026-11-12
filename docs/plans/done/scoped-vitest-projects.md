# Scoped Vitest projects

**Completed 2026-11-11:** `npm run test` is the unit project (540 files); headless AbilityTests live under `npm run test:sim` (2 files, 179 passed). Local CI calls `npm run test:all`. Duplicate `*.scenarios.test.ts` runners were removed; `SimulationRunner.test.ts` loops `ALL_ABILITY_TEST_SCENARIOS` (skipping the mocked `exposed_duration_extension`). Agent docs no longer treat engine edits as a full-suite trigger. Follow-up: keep new headless coverage in the registry only; `path_around_rock` barrier height was raised so sparse waypoints no longer clip rock.

Goal: stop routine edits and agent runs from executing the whole suite. `npm run test` becomes the unit project. Headless AbilityTest scenarios run only under `npm run test:sim`. `npm run test:all` is the full backstop, and local CI is the only thing that calls it on a schedule.

This does not reorganize the repo into domain packages, and it does not move co-located `*.test.ts` files. Import-graph selection follows dependents, not folders, so a domains move would not shrink what Vitest collects.

## What already exists

| Piece | Where | Today |
|---|---|---|
| Single discovery glob | `vite.config.ts` `test.include` | `app/**/*.{test,spec}.{ts,tsx}` — about 552 files, one project |
| Default script | `package.json` `"test"` | `npx vitest run` (everything) |
| Local CI | `scripts/ci.js` `parseTestResults` | Bare `vitest run` with a JSON reporter, every 30 minutes when the tree changed |
| Scoped-testing skill + post-change hook | `.cursor/rules/post-change-test-hook.mdc`, `.cursor/skills/scoped-testing/SKILL.md` (copied under `.claude/skills/`) | Say to run named files. Still allow `npm run test` for "cross-cutting" work, which covers most engine edits |
| Contradicting skills | `ability-tests`, `jp-implement-plan`, `jp-plan` (each copied in `.cursor/skills` and `.claude/skills`) | Ability edits: full ESLint, then `--changed`, then `npm run test`. Plan completion always runs `npm run test`. Workers run full `npm run lint` and often `--changed` |
| Scenario registry | `testing/scenarios/registry.ts` `ALL_ABILITY_TEST_SCENARIOS` | Source of truth for the Ability Test page |
| Hand-maintained runner | `testing/runner/SimulationRunner.test.ts` | ~116 `it` blocks, each calling `runScenarioHeadless`. One of them is a pure `getScenarioById` lookup |
| Second copy of the same runs | `testing/scenarios/**/*.scenarios.test.ts`, plus `rapidThrowComboScenario.test.ts` and `gatherStoneScenarios.test.ts` | Loop or list the same `runScenarioHeadless` + `passed` checks. `water.scenarios.test.ts` even notes that some ids already run from the runner |
| Flag-isolated scenario | `testing/runner/exposedDurationExtension.test.ts` | `vi.mock`s `EXPOSED_DURATION_INCREASES_FROM_CC` and runs one scenario. Must stay its own file |
| Co-located callers that stay unit tests | `game/conditionalCancel.test.ts`, `card_defs/05_earth_core/0531_Knock/0531Ability.test.ts` | Import `runScenarioHeadless` but are the targeted test for that behavior |

Vitest is **2.1.9**. Use `vitest.workspace.ts` and `defineWorkspace`. Do not upgrade Vitest. In this version `maxWorkers` is a non-project option, so it cannot be set on the sim project alone. Pass it on the sim and full-suite scripts.

`.cursor/skills/*` and `.claude/skills/*` are separate copies, not links. Edit both when a skill is listed.

## Plan-level decisions (locked)

- **Two workspace projects.** `unit` and `sim`. Each project `extends: './vite.config.ts'`. Root `vite.config.ts` keeps `globals`, `environment`, and `setupFiles`. Remove `include` and `exclude` from the root `test` block so the root cannot collect a third copy of the suite. Each workspace project sets its own `include` and `exclude` (still excluding `node_modules`, `.claude/worktrees`, `dist`, `app/js-out`).
- **`npm run test` runs `--project unit`.** This is the command agents and humans already type. After this plan it is not the full suite.
- **`npm run test:sim` runs `--project sim --maxWorkers=50%`.** Sim `include` is only:
  - `app/**/*.scenarios.test.ts`
  - `app/**/testing/runner/SimulationRunner.test.ts`
  - `app/**/testing/runner/exposedDurationExtension.test.ts`
  - `app/**/testing/scenarios/abilities/rapidThrowComboScenario.test.ts`
  - `app/**/testing/scenarios/abilities/gatherStoneScenarios.test.ts`
  The last two do not match `*.scenarios.test.ts`. Listing them keeps them out of `unit` until Step 3 deletes them if they are pure duplicates. Unit's `exclude` lists the same set.
- **`npm run test:all` runs both projects** (`npx vitest run --maxWorkers=50%`, no `--project`). **`npm run test:watch` watches unit only.**
- **CI calls `npm run test:all`**, forwarding `--reporter=json` and `--outputFile=…`. It must not call `npm run test`. A later edit to the `test` script must not shrink CI.
- **Co-located ability and engine tests stay in `unit`**, including the two files that call `runScenarioHeadless` (`conditionalCancel.test.ts`, `0531Ability.test.ts`). `testing/determinism.test.ts` stays in `unit` (tiny-battle harness, not the scenario registry).
- **One headless execution per registered scenario.** Step 3 replaces the hand-written `it` list in `SimulationRunner.test.ts` with a loop over `ALL_ABILITY_TEST_SCENARIOS`. Move the `getScenarioById` assertion into a new `testing/scenarios/registry.test.ts` (unit project, no `runScenarioHeadless`). Delete a scenario test file only when every scenario it runs is already in `ALL_ABILITY_TEST_SCENARIOS` and its only assertion is `runScenarioHeadless` then `passed`. Keep a file that has any other assertion or a `vi.mock`. Keep `exposedDurationExtension.test.ts` even if that scenario is also in the registry: the mock is the point of the file.
- **New headless coverage goes in the registry**, not a new `it` in the runner and not a new `*.scenarios.test.ts`, unless the scenario needs a mock or an assertion other than `passed`. A future `*.scenarios.test.ts` stays out of `unit` because of the exclude glob.
- **Do not edit `docs/plans/` files** other than this plan. In-progress plans that say `npm run test` will run the unit project after Step 1. That is intentional. People who want every test write `npm run test:all`.
- **No domain-package move, no Vitest upgrade, no change to the Ability Test page.** The page reads `registry.ts`, which Step 3 does not restructure.

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.cursor/skills/jp-implement-plan/SKILL.md` — do not restate its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then moves to the next step, and finally reports plan completion to the user. Each worker implements **exactly one step**, checks off that step's checklist items with a one-line summary under each, and **stops without spawning the next agent**.

Project skills relevant to this plan:

- `scoped-testing` — the behavior this plan changes. Read it before editing it.
- `ability-tests` — Step 2 (drop the full-suite instruction) and Step 3 (registry is the headless entry).
- `local-ci` — Step 1 (CI must keep running both projects).
- `working-with-skills` — Step 2 (the skill that tells other skills to follow the hook).
- `jp-plan` / `jp-implement-plan` — Step 2 only. Do not follow their current "run `npm run test` at completion" text while executing this plan; this plan's verification lines win.

**Verification cadence:** Steps 1–3 do not run `npm run test`, `npm run test:sim`, `npm run test:all`, or a bare `npx vitest run`. Step 1 uses `vitest list` plus one named unit file. Step 2 is docs only. Step 3 runs only the new `registry.test.ts`. Step 4 is the one expensive run (`npm run test:sim`).

While this plan is in progress, `npm run test` may already mean "unit project" after Step 1. Do not "correct" that by running `test:all`.

---

### Step 1 — Workspace projects and scripts

Files: `vitest.workspace.ts` (new), `vite.config.ts`, `package.json`, `scripts/ci.js`, `.cursor/skills/local-ci/SKILL.md`, `.claude/skills/local-ci/SKILL.md`.

- [x] Add `vitest.workspace.ts` with `defineWorkspace` from `vitest/config`. Two projects, `unit` and `sim`, each `extends: './vite.config.ts'`, with the include/exclude sets in the locked decisions. Sim does not set `maxWorkers` (Vitest 2.1 ignores it on a project).
  - Added `vitest.workspace.ts`: unit include `app/**/*.{test,spec}.{ts,tsx}` excluding sim globs; sim include is the five locked globs. Verify (`--filesOnly`): **unit 539 files**, **sim 14 files**, overlap 0; `SimulationRunner`/`exposedDurationExtension` sim-only; `contentLayering` unit-only; combined 553 (no root doubling).
- [x] Remove `include` and `exclude` from the root `test` block in `vite.config.ts`. Leave `globals`, `environment`, and `setupFiles`.
  - Root `test` now only has `globals`, `environment`, `setupFiles`; discovery comment points at the workspace.
- [x] Point the scripts at the locked commands: `test` → `--project unit`; `test:sim` → `--project sim --maxWorkers=50%`; `test:all` → both projects with `--maxWorkers=50%`; `test:watch` → `--project unit`. If `--maxWorkers=50%` is rejected, use half of `os.cpus().length` (minimum 1) as an integer on those two scripts only.
  - `package.json`: `test`/`test:watch` → `--project unit`; added `test:sim` and `test:all` with `--maxWorkers=50%` (accepted by Vitest 2.1.9).
- [x] Change `parseTestResults` in `scripts/ci.js` so the vitest invocation is `npm run test:all` plus `--reporter=json` and `--outputFile=…`. No `--project` flag. Update both `local-ci` skills so they say CI runs `test:all` (unit and sim), and that agents still use scoped files rather than `test:all`.
  - `parseTestResults` now `npm run test:all -- --reporter=json --outputFile=…`; both `local-ci` skills document CI=`test:all` and agents stay on scoped/`test` not `test:all`. contentLayering unit run: 3 passed.

Verify: `npx vitest list --project unit` and `npx vitest list --project sim`. Record both file counts. No file in both lists. `SimulationRunner.test.ts` and `exposedDurationExtension.test.ts` appear only in sim. `game/contentLayering.test.ts` appears only in unit. The two lists together are not larger than a single `npx vitest list` (no root project doubling the suite). Then run `npx vitest run --project unit app/js/games/minion_battles/game/contentLayering.test.ts` only. Do not run sim.

### Step 2 — One set of agent instructions

Files (edit both copies): `.cursor/rules/post-change-test-hook.mdc`, `AGENTS.md`, `CLAUDE.md`, and these skills under both `.cursor/skills/` and `.claude/skills/`: `scoped-testing`, `ability-tests`, `jp-implement-plan`, `jp-plan`, `working-with-skills`.

The hook is the short rule. The skill is the decision tree. Do not leave a second copy of the exceptions in `AGENTS.md` or `CLAUDE.md`; point those files at the hook and name the three scripts.

- [x] Hook and scoped-testing: after an edit, `npm run lint:changed`, then `npx vitest run` with the named co-located test files. `npm run test` is the unit project, still not the default when a smaller file list exists. `npm run test:all` only when the user asks for the full suite. Remove the "cross-cutting refactor → `npm run test`" escape (serialization, tick loop, and shared types included). A change to `GameEngine.ts`, `game/types.ts`, or `storylines/index.ts` runs the co-located test, not `test:all`. `vitest related` and `--changed` stay limited to one non-hub file with no co-located test. `npm run test:sim` only when the edit changes the scenario registry, `SimulationRunner`, or a file under `testing/scenarios/`.
  - Updated `post-change-test-hook.mdc`, both `scoped-testing` skills, plus `AGENTS.md`/`CLAUDE.md` to point at the hook and name `test` / `test:sim` / `test:all`; removed cross-cutting→full-suite escape.
- [x] ability-tests: delete the paragraph that runs full ESLint, then `--changed`, then `npm run test` after any `app/js/` edit. Headless coverage is "add the scenario to `ALL_ABILITY_TEST_SCENARIOS`". Do not add a hand-written `it` in `SimulationRunner.test.ts`. The per-edit run is the co-located ability test. Mention `npm run test:sim` as the explicit full scenario run, not the default.
  - Both `ability-tests` skills: registry-only headless coverage; per-edit = lint:changed + co-located ability test; `test:sim` explicit only.
- [x] jp-implement-plan and jp-plan: per step, `npm run lint:changed` and the test files named in the step. No start-of-plan `--changed` baseline. Completion does not run `npm run test:all`. The final step runs `npm run test:sim` only when the plan says so. `working-with-skills` matches this wording, including `lint:changed` rather than full `npm run lint`.
  - Both `jp-implement-plan`, `jp-plan`, and `working-with-skills` copies now use lint:changed, named step tests, no Completion `test:all`, and `test:sim` only when the plan says so.

Verify: no Vitest. This step only changes agent docs and the always-applied rule.

### Step 3 — Run each registered scenario once

Files: `app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts`, `app/js/games/minion_battles/testing/scenarios/registry.test.ts` (new), and any `testing/scenarios/**/*.test.ts` files deleted because they only repeat the registry.

- [x] Add `registry.test.ts` that asserts `getScenarioById('path_short_commute')` returns that id (the lookup currently at `SimulationRunner.test.ts` around the `getScenarioById` case) and that every `ALL_ABILITY_TEST_SCENARIOS` id is unique and non-empty. No `runScenarioHeadless` in this file.
  - Added `testing/scenarios/registry.test.ts`: `getScenarioById('path_short_commute')` + unique non-empty ids; no headless runner.
- [x] Replace the hand-written scenario `it` blocks in `SimulationRunner.test.ts` with one loop over `ALL_ABILITY_TEST_SCENARIOS` that calls `runScenarioHeadless` and expects `passed`. Keep the imports that the loop needs; drop the per-scenario imports.
  - `SimulationRunner.test.ts` is now one `for` over `ALL_ABILITY_TEST_SCENARIOS`; per-scenario imports removed. Note for Step 4: `throwRockExactlyOnceScenario` and `earthCoreDiggingClawsRetargetScenario` were runner-only and are not in the registry.
- [x] For each file under `testing/scenarios/` that calls `runScenarioHeadless`: if every scenario it runs is in `ALL_ABILITY_TEST_SCENARIOS` and the file only asserts `passed`, delete it. If any assertion or `vi.mock` is different, leave the file in place (it stays in the sim project via the Step 1 globs). Do not delete `exposedDurationExtension.test.ts`. Do not change `conditionalCancel.test.ts` or `0531Ability.test.ts`.
  - Deleted 12 passed-only duplicates (water/crowd/storm/armory/hunger/timeDilation/pathfinding/movementShowcase/darknessUpgrades/darknessStrength/rapidThrow/gatherStone). Kept `exposedDurationExtension`, `draftOrderRestore`, `unitComponentResume`; left `conditionalCancel`/`0531Ability` untouched.

Verify: `npm run lint:changed`, then `npx vitest run --project unit app/js/games/minion_battles/testing/scenarios/registry.test.ts`. Do not run `SimulationRunner.test.ts` here.

### Step 4 — Confirm the sim project once

Files: this plan only (check off and write the counts).

- [x] Run `npm run test:sim` once. Fix failures this plan caused (a scenario that used to run only from a deleted file and is missing from `ALL_ABILITY_TEST_SCENARIOS` goes back into the registry, not into a restored duplicate file). Record pass/fail counts on this item.
  - Registered `throwRockExactlyOnceScenario` + `earthCoreDiggingClawsRetargetScenario`; removed dead rapidThrow/gatherStone SIM_INCLUDE entries; `test:sim`/`test:all` need `--minWorkers=1` with `--maxWorkers=50%` (Tinypool min/max conflict); skipped `exposed_duration_extension` in the unmocked runner loop (mocked file covers it); fixed `path_around_rock` barrier so sparse waypoints no longer clip rock. **`npm run test:sim`: 179 passed / 0 failed** (2 files).
- [x] Re-run the Step 1 list check (`--project unit` and `--project sim`) and record the file counts after the deletions. Unit and sim still do not overlap. Do not run `npm run test:all`.
  - After deletions: **unit 540 files**, **sim 2 files** (`SimulationRunner.test.ts`, `exposedDurationExtension.test.ts`); overlap 0; `contentLayering` unit-only; combined 542 (no root doubling). Did not run `test:all`.
