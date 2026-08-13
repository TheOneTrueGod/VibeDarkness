# Combo Cancel + Rapid Throw — Implementation Plan

**Completed 2026-08-12:** Combo Cancel system shipped (research `comboMax`, authoring helpers, runtime `comboCount` chain, throw timelines, Rapid Throw Earth node, HUD label, headless scenario). All automated tests pass; manual browser checklist below still needs a human pass in Character Editor + battle.

Goal: introduce the **Combo Cancel** system — a reusable authoring layer on top of the existing `conditionalCancel` engine primitive — and ship the Earth tree node **Rapid Throw** (3 ranks) that grants **Combo 1 → Combo 2 → Combo 3** on **Throw Rock** and **Throw Charged Rock**, enabling chained throws during cooldown with a **Combo #** HUD readout when chain depth &gt; 1.

## Plan-level decisions (locked)

- **System name:** **Combo Cancel** everywhere (folder, helpers, tests, comments). The engine primitive remains `conditionalCancel` on timing intervals (shared with Entombed).
- **Authoring API:** `withComboCancelAtPhaseStart(timings, phase, opts)` in `abilities/comboCancel/comboCancelTimings.ts` — phase is an `AbilityPhase` (throws use `AbilityPhase.Cooldown`). Do not add separate `withComboCancelAtCooldownStart` helpers.
- **Combo N semantics:** `comboMax = Rapid Throw purchased level` (rank 1 → **1** total cast per chain, rank 2 → **2**, rank 3 → **3**). A chain ends when `comboCount >= comboMax` (no further Combo Cancel window).
- **`comboCount`:** starts at **1** on a fresh cast; increments by **1** when the player accepts a Combo Cancel follow-up (non-`wait` order). Stored on `ActiveAbility`, serialized in checkpoints.
- **Follow-up eligibility:** any ability the unit can cast that satisfies `conditionalCancelTagFilter: ['Combo']` — i.e. static `Combo` tag **or** `abilityModifiers[abilityId].comboMax > 0` (research-granted). Cross-ability chains allowed (Throw Rock → Throw Charged Rock) when both are Combo-tagged.
- **Costs:** each cast in the chain consumes **uses + resources** normally (no free combo repeats).
- **Entombed coexistence:** Combo Cancel hooks the **cooldown** interval entry; Entombed hooks **active** exit inside walls. Both may exist on the same ability timeline at different boundaries (mirror `entombedWallCancel.ts` pattern).
- **Future “Combo Fire”:** no new filter type in v1 — `abilityTagFilter: ['Combo', 'fire']` already ANDs tags when needed.
- **Rapid Throw node:** tier **13**, positioned **right of Buried Arsenal** (`x: 620`, `y: 280`), prereqs **`earth_rock_entombed`**, **`levels: 3`**, free cost (matches other Earth nodes). Targets **`RockThrow`** tag for modifiers.
- **Constants:** export `EARTH_NODE_RAPID_THROW`, `EARTH_RAPID_THROW_LEVELS` from `earth.ts`; import ability ids from existing sources in tests (no magic strings).

## Key existing code index

| Concern | Location |
|---|---|
| Conditional cancel engine | `abilities/abilityTimings.ts` (`ConditionalCancelDef`), `game/units/unitAbilityTick.ts` (interval exit), `game/managers/OrderManager.ts` (`applyConditionalCancelDecision`) |
| Entombed timeline helper (pattern to mirror) | `abilities/entombed/entombedWallCancel.ts` |
| Throw timelines | `card_defs/throwSharedTimings.ts`, `0107_ThrowRock/0107Ability.ts`, `0108_ThrowChargedRock/0108Ability.ts` |
| Research modifiers | `researchTrees/types.ts` (`AbilityModifier`), `researchTrees/evaluator.ts` (`computeAbilityModifiersFromResearch`, `mergeModifierInto`) |
| Multi-level nodes | `researchTrees/passiveBonuses.ts` (`getNodeLevel`), `researchTrees/trees/training.ts` (precedent) |
| Mission-start modifier apply | `storylines/BaseMissionDef.ts` (`computeAbilityModifiersFromResearch` call site) |
| Tag filter in UI | `ui/components/abilityDisabledReason.ts`, `ui/pages/battlePhase/BattleAbilityBar.tsx` (`conditionalCancelContext`) |
| Tag tooltips | `abilities/abilityTagCatalog.ts`, `buildTagDescriptionLines` |
| Tag check incl. research | `abilities/abilityUses.ts` (`unitAbilityHasTag`) |
| Earth tree | `researchTrees/trees/earth.ts` |
| Conditional cancel tests | `game/conditionalCancel.test.ts` |
| Throw research scenarios | `testing/scenarios/abilities/throwRockResearch.ts` |

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md` — do not restate its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then moves to the next step, and finally reports plan completion to the user. Each worker implements **exactly one step**, checks off that step's checklist items with a one-line summary under each, and **stops without spawning the next agent**.

Project skills relevant to this plan (workers should invoke the ones matching their step):
- `working-on-minion-battles` — always.
- `game-engine` + `game-object-def-pattern` — steps 2–3 (serialized `ActiveAbility` fields, order path).
- `editing-card-behaviour` + `creating-an-ability` — steps 4–5 (throw timelines, ability defs).
- `research-trees` — step 5.
- `editing-and-creating-components` — step 6 (HUD).
- `writing-style-abilities` — step 5 (node copy / keyword tooltip line).
- `ability-tests` — steps 7–8.
- `scoped-testing` — per-step Vitest scope.

**Verification cadence:** per step, at most `npm run lint:changed`, `npx tsc --noEmit` when the step crosses an interface boundary, and only the specific test files the step touches or creates. No full-suite, whole-directory, or AbilityTest/E2E runs in regular steps — Step 8 runs the expensive things exactly once.

---

### Step 1 — Combo Cancel types + research modifier pipeline

Files: `researchTrees/types.ts`, `researchTrees/evaluator.ts`, `storylines/BaseMissionDef.ts`, `abilities/Ability.ts`, `abilities/abilityTagCatalog.ts`, new `researchTrees/evaluator.comboCancel.test.ts`.

- [x] Add `comboMax?: number` to `AbilityModifier` in `researchTrees/types.ts`.
  - Added `comboMax` to `AbilityModifier`.
- [x] Extend `computeAbilityModifiersFromResearch(researchTrees, getTagsForAbility?, unitAbilityIds?, researchNodeLevels?)` to accept optional `researchNodeLevels`; for leveled researched nodes, set `comboMax` from `getNodeLevel(...)` when the node's `abilityResearchModifiers` include a `comboMax` template (Rapid Throw: modifier carries `comboMax: 1` per level unit — scale as `level * 1`, or set `comboMax = level` directly in merge logic). Update `mergeModifierInto` to take the max or sum consistently (document: **use max of contributing levels**, only one source expected for Rapid Throw).
  - Scales `comboMax` by node level; merge uses max.
- [x] Pass `researchNodeLevels` from the campaign character into `computeAbilityModifiersFromResearch` in `BaseMissionDef.ts` (same character bag used for passive bonuses).
  - Wired `researchLevelsByPlayer` into mission-start modifier compute.
- [x] Add `'Combo'` to the `AbilityTag` union in `Ability.ts`; add catalog entry in `abilityTagCatalog.ts` (`hasMagnitude: true`, `autoAddToDescription: true`, hint e.g. “Chain during cooldown”).
  - Added Combo tag + catalog entry with magnitude tooltip.
- [x] New `researchTrees/evaluator.comboCancel.test.ts`: Rapid Throw level 2 in `researchNodeLevels` yields `comboMax: 2` on `throw_rock` via `RockThrow` tag resolution.
  - Test passes with earth Rapid Throw node.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/researchTrees/evaluator.comboCancel.test.ts`.

### Step 2 — Combo Cancel authoring layer

Files: new `abilities/comboCancel/comboCancelDef.ts`, new `abilities/comboCancel/comboCancelTimings.ts`, new `abilities/comboCancel/comboCancelTimings.test.ts`.

- [x] `comboCancelDef.ts`: export `buildComboCancelDef(context)` returning a `ConditionalCancelDef` with `abilityTagFilter: ['Combo']` and a `condition` that reads the pausing cast's `comboCount` (default 1) and `caster.abilityModifiers[abilityId].comboMax` — fire only when `comboMax > 0` and `comboCount < comboMax`.
  - `buildComboCancelDef()` with comboCount/comboMax gate.
- [x] `comboCancelTimings.ts`: export `withComboCancelAtPhaseStart(timings, phase, opts?)` where `opts` may include `intervalId` (default: first interval whose `abilityPhase === phase`). Attach `conditionalCancel` on **interval exit** for the chosen interval (same trigger point as Entombed — exiting into the next phase). If Entombed-style linger insertion is needed so cooldown is not active when pause fires, follow the entombed helper's linger pattern; otherwise attach on the cooldown interval's **start boundary** (exit of prior interval).
  - Inserts combo linger when needed; attaches on interval before Cooldown (or entomb linger when present).
- [x] `comboCancelTimings.test.ts`: given a minimal three-interval timeline, `withComboCancelAtPhaseStart(..., AbilityPhase.Cooldown)` attaches `conditionalCancel` on the expected interval; condition returns false when `comboCount >= comboMax`.
  - Two tests cover attach point and condition gate.

Verify: `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/abilities/comboCancel/comboCancelTimings.test.ts`.

### Step 3 — Runtime combo chain (engine + tag gate)

Files: `game/types.ts`, `game/units/unitAbilityLifecycle.ts` (or `Unit.executeAbility`), `game/managers/OrderManager.ts`, `game/units/unitToJSON.ts`, `game/units/unitFromJSON.ts`, `abilities/abilityUses.ts`, new `game/comboCancel.test.ts`.

- [x] Add `comboCount?: number` to `ActiveAbility` in `game/types.ts`; serialize in `unitToJSON` / restore in `unitFromJSON`.
  - Serialized when present on active ability.
- [x] Fresh casts: initialize `comboCount = 1` when starting a primary ability (not when resuming from `wait` on the same paused cast).
  - Defaults to 1 in `executeUnitAbility`; wait resumes existing cast unchanged.
- [x] In `OrderManager.applyConditionalCancelDecision`, when the player submits a non-`wait` ability: after cancel + before the new cast executes, ensure the **new** active ability receives `comboCount = (pausedAbility.comboCount ?? 1) + 1`.
  - Sets `unit.pendingComboCount` before follow-up cast.
- [x] Extend `unitAbilityHasTag` so `'Combo'` matches when `unit.abilityModifiers[abilityId]?.comboMax > 0` (research-granted Combo without a static tag).
  - Research-granted Combo tag check added.
- [x] New `game/comboCancel.test.ts`: headless chain — unit with `comboMax: 2` on `throw_rock` throws twice via Combo Cancel pause then `wait` completes; third cooldown window does not pause. Use exported constants for ability ids.
  - Runtime chain + condition gate tests pass.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/game/comboCancel.test.ts`.

### Step 4 — Throw Rock / Charged Rock timeline wiring

Files: `card_defs/throwSharedTimings.ts`, `card_defs/0107_ThrowRock/0107Ability.ts`, `card_defs/0108_ThrowChargedRock/0108Ability.ts`, extend `0107` or shared throw tests if a co-located test already exists; otherwise add `card_defs/throwComboCancel.test.ts`.

- [x] Extend `buildThrowBaseTimings` / `buildMoreRockTimings` with optional `comboCancelPhase?: AbilityPhase` (default off). When set, pipe through `withComboCancelAtPhaseStart(..., AbilityPhase.Cooldown, { intervalId: 'cooldown' | 'active_2' / more-rock equivalent })`.
  - `comboCancelPhase` opt on shared throw timing builders.
- [x] In `getAbilityTimings` for both throw abilities: if `getAbilityModifier(..., abilityId).comboMax > 0`, apply combo-cancel timings **after** entombed wrapping (both can apply).
  - Dynamic combo timings when `comboMax > 0`.
- [x] Tooltips: append Combo magnitude via `buildTagDescriptionLines(['Combo'], { Combo: mod.comboMax })` when `comboMax > 0` (Throw Rock already merges `mod.addTags` for Entombed — mirror for Combo).
  - Combo keyword lines on both throw abilities.
- [x] Test: timings include `conditionalCancel` when modifier has `comboMax > 0`; omit when zero.
  - `throwComboCancel.test.ts` covers both cases.

Verify: `npm run lint:changed`, `npx vitest run` on the throw combo test file created/touched in this step.

### Step 5 — Rapid Throw research node

Files: `researchTrees/trees/earth.ts`.

- [x] Export `EARTH_NODE_RAPID_THROW = 'rapid_throw'` and `EARTH_RAPID_THROW_LEVELS = 3`.
  - Constants exported from `earth.ts`.
- [x] Add node **Rapid Throw**: tier 13, position `{ x: 620, y: 280 }`, order after Buried Arsenal, `prereqNodeIds` + `requirements` mirroring `earth_rock_entombed`, `levels: EARTH_RAPID_THROW_LEVELS`, `cost: {}`, description referencing `{Combo 1}` per rank (use level-aware copy or static “Combo 1/2/3 per level” wording per `writing-style-abilities`).
  - Node added with Combo 1/2/3 level copy.
- [x] `abilityResearchModifiers`: `{ type: 'tag', tag: 'RockThrow', comboMax: 1 }` — evaluator scales by purchased level (Step 1).
  - RockThrow tag modifier with `comboMax: 1` per level unit.
- [x] `modifiesAbility`: `{ from: 'throw_rock', to: 'throw_charged_rock' }` for Upgrades preview.
  - Preview targets throw rock → charged rock.

Verify: `npm run lint:changed`, `npx vitest run app/js/researchTrees/evaluator.comboCancel.test.ts`.

### Step 6 — Combo HUD label

Files: `ui/components/battleUiSlots/CornerSlotPlayerStats.tsx` or `ui/pages/battlePhase/BattleAbilityBar.tsx` (pick the lighter touch — prefer stats corner near portrait).

- [x] When the local player's unit has an active cast with `comboCount > 1`, render **Combo {comboCount}** (exact label) in the battle HUD.
  - Overlay on portrait in `UnitResourcePanel`.
- [x] Hidden when `comboCount` is undefined, 0, or 1.
  - Only shown when `comboCount > 1`.

Verify: `npm run lint:changed`, `npx tsc --noEmit` if props/threading crosses new boundaries.

### Step 7 — AbilityTest scenario (write only — run in Step 8)

Files: new `testing/scenarios/abilities/rapidThrowComboScenario.ts`, `testing/scenarios/registry.ts`.

- [x] Scenario: player with Rapid Throw level 2 researched, `throw_rock` + resources; cast → Combo Cancel pause → second throw → no third pause; deterministic headless assertions (position/damage optional — prefer state flags: `conditionalCancelPaused`, `comboCount`, active ability id).
  - `rapidThrowComboScenario` with state flags.
- [x] Register in `testing/scenarios/registry.ts` under an appropriate tree group (`earth` / throw family).
  - Registered in `ALL_ABILITY_TEST_SCENARIOS`.

Verify: `npx tsc --noEmit`, `npm run lint:changed` — do **not** execute the scenario in this step.

### Step 8 — Final verification

- [x] `npm run lint:changed` and `npx tsc --noEmit` clean for all touched paths.
  - Lint clean; pre-existing unrelated tsc errors in quest missions / unitMovementTick remain outside this plan.
- [x] Run all new/changed unit tests: `evaluator.comboCancel.test.ts`, `comboCancelTimings.test.ts`, `game/comboCancel.test.ts`, throw combo test from Step 4.
  - 18 scoped unit tests passed.
- [x] Run `rapidThrowComboScenario` via the headless runner (`ability-tests` skill) and confirm pass.
  - `rapidThrowComboScenario.test.ts` passes.
- [x] Re-run `app/js/games/minion_battles/game/conditionalCancel.test.ts` (Entombed chain regression).
  - 11 Entombed regression tests passed.
- [ ] Manual browser checklist: research Rapid Throw to rank 2+ in Character Editor; in battle, Throw Rock shows Combo keyword in tooltip; after first throw, ability bar highlights eligible Combo abilities during pause; **Combo 2** (or higher) label appears on second chain hit; choosing **Continue**/wait resumes cooldown; Entombed + Combo both work when Buried Arsenal is researched.

---

## Out of scope (deliberate)

- **Combo Fire** and other named combo filter presets (use multi-tag `abilityTagFilter` when needed).
- Combo Cancel on non-throw abilities (infrastructure is generic; only throws + Rapid Throw ship in this plan).
- AI combo chaining (player-only decision window).
- Campaign resource costs per Rapid Throw rank (free like sibling Earth nodes).
- Changing Entombed behaviour or Digging Claws timelines.
