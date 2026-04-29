---
name: ability-tests
description: >-
  Minion Battles ability-test scenarios, headless runner, and admin Ability Test UI.
  Use when adding or changing ability/general test scenarios, SimulationRunner behaviour,
  tiny-battle harness, or the campaign Ability Test page.
---

# Ability tests

## What this system is

Deterministic **scenario** objects build a small `GameEngine`, apply one batch of orders, then advance fixed ticks until pass, idle, terminal, or timeout. The **admin Ability Test** page runs several scenarios in parallel with mini terrain previews. **Vitest** can run the same scenarios headlessly via `runScenarioHeadless`.

## Where to look (source of truth)

| Area | Location |
|------|----------|
| Scenario contract | `app/js/games/minion_battles/testing/types.ts` — `ScenarioDefinition` (`generalSection` for sidebar groups) |
| Registry & selector keys | `app/js/games/minion_battles/testing/scenarios/registry.ts` — `ALL_ABILITY_TEST_SCENARIOS`, `getScenariosForSelectorKey`, `getGeneralTestSidebarGroups`, group slugs |
| Tiny battle harness | `app/js/games/minion_battles/testing/harness/buildTinyBattleEngine.ts` — grid, player, hand, dummies |
| Scenario implementations | `app/js/games/minion_battles/testing/scenarios/abilities/*.ts`, `.../general/*.ts` |
| Headless + live stepping | `app/js/games/minion_battles/testing/runner/SimulationRunner.ts` |
| Early stop when battle idle | `GameEngine.isScenarioRunnerBattleIdle()` in `app/js/games/minion_battles/game/GameEngine.ts` |
| Admin UI | `app/js/components/AbilityTestPage.tsx`, `app/js/components/ability-tests/*` |
| Campaign entry | Admin tab + route — find `AbilityTestPage` / `ability_test` in `CampaignHomeScreen` and `campaignTabPaths` |

## How a scenario works

1. **`buildEngine()`** — synchronous `GameEngine` (often `buildTinyBattleEngine` + spawn/hand setup).
2. **`getInitialOrders(engine)`** — orders applied once before stepping (see `BattleOrder` / move-only id in harness).
3. **`assertPass(engine)`** — must return `true` for success (keep checks stable and cheap).
4. **`failureMessage(engine)`** — string when `assertPass` is false.
5. Optional **`maxDurationMs`** — caps ticks at 60 Hz via the runner.

Runner order (simplified): pass check → terminal → **battle idle** (early exit) → step. Idle logic ignores long-lived effect types documented on `isScenarioRunnerBattleIdle`.

## Registering a new scenario

1. Implement `ScenarioDefinition` in an appropriate file under `testing/scenarios/`.
2. Append it to **`ALL_ABILITY_TEST_SCENARIOS`** in `registry.ts`.
3. If it maps to an ability row on the test page, ensure **`inferScenarioAbilityId`** returns that ability id (or extend the heuristic there).
4. For **general** rows: either assign **`generalSection`** (`Movement`, `Debuffs`, etc.) and add the slug to **`GENERAL_GROUP_ORDER`** in `registry.ts` if it should appear as its own General sidebar entry, or rely on legacy **`general:<scenarioId>`** keys (still supported).

## General sidebar groups

- Sidebar keys look like **`general:movement`**, **`general:debuffs`** — resolved in `getScenariosForSelectorKey`.
- **`getGeneralTestSidebarGroups()`** only lists groups that have at least one scenario with matching **`generalSection`**.
- Multi-scenario groups get a **single inner card** on the right in `AbilityTestPage` (see `isRegisteredGeneralGroupSelectorKey` + scenario count there).

## Modifying behaviour safely

- Prefer changing **scenario setup/assertions** before changing core engine idle rules, so battle semantics stay centralized.
- After edits under `app/js/`, run **`npm run lint`** and **`npm run test`** (Vitest includes `SimulationRunner.test.ts` and ability tests as applicable).
- UI-only tweaks (layout, `cellPx`, playback controls) stay in `AbilityTestPage` / `MiniTerrainView` unless scenario data must change.

## Related skills

- **`working-on-minion-battles`** — overall Minion Battles layout.
- **`creating-an-ability`** / **`editing-card-behaviour`** — real card/ability behaviour under test.
- **`game-engine`** — tick loop and managers if scenarios need new engine surface area.
