# Throw Knife Combo — Implementation Plan

**Completed 2026-11-17:** The Combo system now supports unlimited Combo (`AbilityModifier.comboUnlimited`) and has one place that reads combo grants (`abilities/comboCancel/comboGrant.ts`). The engine adds the combo window at the start of the final Cooldown of any granted ability, inside `resolveAbilityTimingEntries`. The Combo tooltip line is derived centrally. Throw Rock and Throw Charged Rock moved onto this shared path. Combo windows now accept any ability, which also applies to Rapid Throw. The **Flurry** node (Weapons tree, tier 13 by user request) gives Throw Knife unlimited Combo behind **Knowledge: Combos**. Lint is clean. tsc shows only the pre-existing `defineDirectionalShield.ts` error. Scoped unit tests pass 71/73; the 2 failures in `BattleSession.submitOrder.test.ts` come from its net-adapter mock lacking `isReactionClaimUndecidedFor`, which already fails at HEAD. `npm run test:sim` passes 191/191. Follow-ups: the manual browser checklist; choosing what grants Knowledge: Combos; fixing that mock; relaxing the `accountKnowledge.test.ts` tier assertion, which already fails at HEAD because Reactions is tier 3 (Combos is also tier 3).

Goal: give **Throw Knife** the **Combo** keyword through a Weapons-tree research node gated on a new account knowledge, **Knowledge: Combos**. A Combo ability opens a conditional cancel window at the start of its **final Cooldown**; the player may pick **any** ability there (another Throw Knife, or a finisher such as Burst) or Wait. Throw Knife's Combo is **unlimited**, so "Throw Knife → Throw Knife → Throw Knife → Burst" chains, and the chain ends at Burst because Burst has no Combo.

This builds on the shipped Combo Cancel system (`docs/plans/combo-cancel-rapid-throw.md`) and turns it from throw-only plumbing into an engine property any ability can carry.

## What exists today (investigation summary)

| Piece | Where | State |
|---|---|---|
| Combo window primitive | `abilities/comboCancel/comboCancelTimings.ts` (`withComboCancelAtPhaseStart`), `comboCancelDef.ts` (`buildComboCancelDef`) | Inserts a 1-frame `_combo_cancel_linger` before Cooldown with `conditionalCancel`. Picks the **first** Cooldown interval by default. Filter is `abilityTagFilter: ['Combo']` (only Combo abilities may follow). |
| Chain depth | `ActiveAbility.comboCount` (`game/types.ts`), `OrderManager.applyConditionalCancelDecision` → `unit.pendingComboCount`, `unitAbilityLifecycle.ts`, `unitToJSON`/`unitFromJSON` | Works for any follow-up ability; serialized. |
| Research grant | `AbilityModifier.comboMax` (`researchTrees/types.ts`), scaled `comboMax * (level + 1)` in `researchTrees/evaluator.ts` (`scaleAbilityResearchModifierByLevel`) | Bounded only. `abilityModifiers` is serialized on the unit, so `Infinity` is not an option (JSON → `null`). |
| `comboMax > 0` reads | `comboCancelDef.ts`, `abilityUses.ts:130` (`unitAbilityHasTag`), `0107Ability.ts` (timings + tooltip), `0108Ability.ts` (timings + tooltip) | Scattered; each ability wires its own combo timings via `comboCancelPhase` in `card_defs/throwSharedTimings.ts`. |
| Throw Knife | `card_defs/0109_ThrowKnife/0109Ability.ts` | Has tag `RockThrow` (so Rapid Throw's `comboMax` already lands on it) but never applies combo timings or tooltip — today a Rapid Throw grant on Throw Knife is silently ignored. |
| Central timing resolver | `abilities/abilityTimings.ts` `resolveAbilityTimingEntries` | Single entry point used by tick, lifecycle, timeline UI, renderer, ITS lookahead (`targeting.ts` reads `getAbilityTimings` directly, but only for target defs). |
| Central tooltip lines | `abilities/abilityTooltipLines.ts` `getAbilityTooltipLines` / `getDerivedAbilityTooltipLines` | All ability tooltips go through it — the place for def/research-derived keyword lines. |
| Knowledge | `app/js/accountKnowledge.ts` (`KNOWLEDGE_*`, `ACCOUNT_KNOWLEDGE`), node requirement `{ type: 'accountKnowledge', key }` (`researchTrees/evaluator.ts` `meetsRequirement`) | Nothing called Combos yet. Research-time gate only; the engine does not need the key (the grant only exists if the node is researched), so it is **not** added to `BATTLE_ENGINE_KNOWLEDGE_KEYS`. |
| Weapons tree | `app/js/researchTrees/trees/weapons.ts`, ids in `weaponTreeIds.ts` | `KNIVES_ROOT_NODE_ID` virtual root; More Rock is a shared knife/charged-rock upgrade. |
| Keyword glossary | `abilities/keywords/keywordRegistry.ts` | Has `Entombed`; no `Combo` entry. |

## Plan-level decisions (locked)

- **Combo window offers any ability.** The Combo keyword means "at the start of the final cooldown, either this or another ability can be used". `buildComboCancelDef` drops `abilityTagFilter` (undefined = all abilities). This also changes **Rapid Throw**: its window now accepts any ability, not only Combo-tagged ones. One keyword, one meaning.
- **Chain rule:** a follow-up only opens its own window if it has a Combo grant. Bounded grants (Rapid Throw) still stop at `comboCount >= comboMax`; unlimited grants never stop on count. `comboCount` keeps incrementing across the whole chain (Burst in the example ends at `comboCount 4`, shown as **Combo 4** on the HUD).
- **Unlimited representation:** new `AbilityModifier.comboUnlimited?: boolean` (JSON-safe). Merge = OR. Not scaled by level.
- **One read point:** new `abilities/comboCancel/comboGrant.ts` exports `getComboGrant(modifier | undefined): ComboGrant | null` with `ComboGrant = { max: number | null }` (`null` = unlimited), plus `unitComboGrant(unit, abilityId)`. Every `comboMax > 0` check above switches to it.
- **Engine-level application:** `resolveAbilityTimingEntries` applies `applyComboGrantToTimings(entries, caster, abilityId)` when the caster has a grant for that ability. Abilities no longer wire combo timings themselves; the throw-specific `comboCancelPhase` option is removed. Application is idempotent (skip when a `_combo_cancel_linger` interval is already present) and is a no-op (no allocation) when there is no grant. Abilities without a Cooldown interval are left unchanged.
- **Final cooldown:** the generic wrap targets the **last** interval with `abilityPhase === Cooldown`. `withComboCancelAtPhaseStart` gains `which?: 'first' | 'last'` (default `'first'`, so direct callers are unchanged). Both throw timelines have a single `cooldown` interval, so their pause point does not move. Entombed lingers still come first (combo is applied after `getAbilityTimings`, which already includes Entombed).
- **Tooltip:** the Combo keyword line becomes a derived line in `getDerivedAbilityTooltipLines` (bounded → `{Combo} {max - 1}` as today; unlimited → bare `{Combo}`). Remove the hand-written Combo lines from `0107Ability.ts` and `0108Ability.ts`. `getDerivedAbilityTooltipLines` gains the `gameState` argument and reads `getAbilityModifier(gameState, undefined, ability.id)`.
- **Knowledge key:** `KNOWLEDGE_COMBOS = 'Combos'`, label **Combos**, type `systems`, tier 3. Nothing grants it yet (admin grant only) — see Out of scope.
- **Research node:** Weapons tree, id `NODE_KNIFE_COMBO = 'knife_combo'` (export from `weaponTreeIds.ts`), title **Flurry**, description `Throw Knife gains {Combo}.`, prereq `KNIVES_ROOT_NODE_ID`, `requirements: [anyResearched KNIVES_ROOT_NODE_ID, accountKnowledge KNOWLEDGE_COMBOS]`, `cost: { metal: WEAPON_TREE_PREMIUM_METAL_COST }`, tier 13, `abilityResearchModifiers: [{ abilitySpecification: { type: 'abilityId', abilityId: 'throw_knife' }, comboUnlimited: true }]`, `modifiesAbility: { from: 'throw_knife', to: 'throw_knife' }`. Not exclusive with More Rock (two-knife throws can combo too; the window is at the start of the shared final `cooldown`).
- **AI:** unchanged — grants come from player research only, and conditional-cancel pauses are player decisions.

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md` — do not restate its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then moves to the next step, and finally reports plan completion to the user. Each worker implements **exactly one step**, checks off that step's checklist items with a one-line summary under each, and **stops without spawning the next agent**.

Read `app/js/games/minion_battles/AGENTS.md` ("Build the engine, not the feature") and `abilities/AGENTS.md` before starting a step.

Project skills relevant to this plan (workers invoke the ones matching their step):
- `working-on-minion-battles` — always.
- `game-engine` + `game-object-def-pattern` — steps 1–3 (modifier fields, timing resolver).
- `editing-card-behaviour` + `creating-an-ability` — step 3 (throw timelines, Throw Knife).
- `research-trees` — steps 1 and 4.
- `narrative/writing-style-abilities` (`.claude/skills/narrative/writing-style-abilities/STYLE.md`) — step 4 (node copy, Combo glossary text).
- `ability-tests` — steps 5–6.
- `scoped-testing` — per-step Vitest scope.

**Verification cadence:** per step, at most `npm run lint:changed`, `npx tsc --noEmit` when the step crosses an interface boundary, and only the specific test files the step touches or creates. No full-suite, whole-directory, or AbilityTest/E2E runs in regular steps — Step 6 runs the expensive things once. Tests use Vitest (`npx vitest run <file>`), never Jest.

Paths below are relative to `app/js/games/minion_battles/` unless they start with `app/js/` or `docs/`.

---

### Step 1 — Combo grant model (unlimited + single read point)

Files: `app/js/researchTrees/types.ts`, `app/js/researchTrees/evaluator.ts`, new `abilities/comboCancel/comboGrant.ts`, new `abilities/comboCancel/comboGrant.test.ts`, `abilities/comboCancel/comboCancelDef.ts`, `abilities/abilityUses.ts`, `app/js/researchTrees/evaluator.comboCancel.test.ts`.

- [x] Add `comboUnlimited?: boolean` to `AbilityModifier` (doc: "Combo with no chain limit; wins over `comboMax`"). In `evaluator.ts`, merge it with OR in `mergeAbilityModifierInto`; leave it unscaled in `scaleAbilityResearchModifierByLevel`.
  - Added `comboUnlimited` to `AbilityModifier`; OR-merged in `researchTrees/abilityModifierMerge.ts` (where `mergeAbilityModifierInto` actually lives); `scaleAbilityResearchModifierByLevel` leaves it unscaled (spread copy).
- [x] New `comboGrant.ts`: `ComboGrant { max: number | null }`, `getComboGrant(mod?: AbilityModifier): ComboGrant | null` (unlimited → `{ max: null }`; `comboMax > 0` → `{ max: comboMax }`; else `null`), `unitComboGrant(unit, abilityId)`, and `comboWindowOpen(grant, comboCount): boolean` (`max === null || comboCount < max`).
  - Created `comboGrant.ts` with `ComboGrant`, `getComboGrant`, `unitComboGrant`, `comboWindowOpen`.
- [x] `buildComboCancelDef`: condition uses `unitComboGrant` + `comboWindowOpen`; **remove `abilityTagFilter`** (any ability may follow). Update its doc comment.
  - `buildComboCancelDef` now uses `unitComboGrant` + `comboWindowOpen`; `abilityTagFilter` removed, doc updated.
- [x] `unitAbilityHasTag` (`abilityUses.ts`): `'Combo'` matches when `unitComboGrant(unit, abilityId) !== null`.
  - `unitAbilityHasTag` matches `'Combo'` via `unitComboGrant(...) !== null`.
- [x] `comboGrant.test.ts`: bounded, unlimited, none; `comboWindowOpen` at/below/above max and unlimited at a large count. Extend `evaluator.comboCancel.test.ts`: a modifier with `comboUnlimited` merges with a Rapid Throw `comboMax` into `{ comboMax, comboUnlimited: true }`.
  - Added `comboGrant.test.ts` and a merge test in `evaluator.comboCancel.test.ts` (comboUnlimited + comboMax).

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/abilities/comboCancel/comboGrant.test.ts app/js/researchTrees/evaluator.comboCancel.test.ts`.

### Step 2 — Apply Combo generically at the timing resolver

Files: `abilities/comboCancel/comboCancelTimings.ts`, new `abilities/comboCancel/applyComboGrant.ts`, `abilities/abilityTimings.ts`, `abilities/comboCancel/comboCancelTimings.test.ts`, new `abilities/comboCancel/applyComboGrant.test.ts`.

- [x] `withComboCancelAtPhaseStart`: add `which?: 'first' | 'last'` (default `'first'`) used when `cooldownIntervalId` is not given.
  - Added `which?: 'first' | 'last'` (default `'first'`) to `withComboCancelAtPhaseStart`, backed by a small `lastIndexOfPhase` helper (`findLastIndex` is not in the TS lib target).
- [x] New `applyComboGrant.ts`: `applyComboGrantToTimings(entries, caster, abilityId)` — returns `entries` unchanged (same reference) when the caster is not a unit with a grant, when no interval has `abilityPhase === Cooldown`, or when a `_combo_cancel_linger` interval already exists; otherwise normalizes as needed and calls `withComboCancelAtPhaseStart(..., AbilityPhase.Cooldown, { which: 'last' })`. Keep it allocation-free on the no-grant path (hot: called every tick).
  - New `applyComboGrant.ts`: returns the same `entries` reference when the caster has no `abilityModifiers` grant, no Cooldown interval, or a `_combo_cancel_linger` already exists; otherwise converts legacy rows to intervals (without the coop tail split, which would desync a wrapped cooldown) and wraps the last Cooldown.
- [x] `resolveAbilityTimingEntries`: wrap the resolved entries with `applyComboGrantToTimings(entries, caster, ability.id)` when `ability.id` is set. If importing `comboCancel/*` from `abilityTimings.ts` causes a module-cycle failure, move only the wrap call so it stays the single entry point and note where in the checklist summary.
  - `resolveAbilityTimingEntries` now wraps its result with `applyComboGrantToTimings` when `ability.id` is set; the `abilityTimings.ts` <-> `comboCancel/*` import cycle is safe (all cross-uses happen at call time), no fallback needed.
- [x] Update `comboCancelTimings.test.ts` (filter is now undefined; add a two-Cooldown timeline case for `which: 'last'`). New `applyComboGrant.test.ts`: no grant → same reference; unlimited grant on a plain windup/active/cooldown ability → combo linger before the last cooldown; idempotent on a second application; ability with no Cooldown → unchanged.
  - `comboCancelTimings.test.ts` now expects an undefined filter and has a `which: 'last'` two-Cooldown case; new `applyComboGrant.test.ts` covers no-grant reference equality, unlimited window, idempotence, and no-Cooldown.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/abilities/comboCancel/comboCancelTimings.test.ts app/js/games/minion_battles/abilities/comboCancel/applyComboGrant.test.ts`.

### Step 3 — Move throws onto the generic path; Throw Knife picks it up

Files: `card_defs/throwSharedTimings.ts`, `card_defs/0107_ThrowRock/0107Ability.ts`, `card_defs/0108_ThrowChargedRock/0108Ability.ts`, `card_defs/0109_ThrowKnife/0109Ability.ts` (only if needed), `abilities/abilityTooltipLines.ts`, `card_defs/throwComboCancel.test.ts`.

- [x] Remove `comboCancelPhase` from `BuildThrowBaseTimingsOpts` / `BuildMoreRockTimingsOpts` and `applyThrowComboCancel`; drop the `comboCancelPhase` wiring in `0107` and `0108` `getAbilityTimings` (Entombed stays).
  - Removed `comboCancelPhase` and `applyThrowComboCancel` from `throwSharedTimings.ts` (and the unused import); `0107`/`0108` `getAbilityTimings` no longer wire combo (Entombed unchanged).
- [x] `getDerivedAbilityTooltipLines(ability, gameState?)`: append the Combo keyword line from `getComboGrant(getAbilityModifier(gameState, undefined, ability.id))` via `buildTagDescriptionLines(['Combo'], …)` — bounded shows magnitude `max - 1`, unlimited shows bare `{Combo}`. Pass `gameState` from `getAbilityTooltipLines`. Remove the hand-written Combo lines from `0107` and `0108` (keep their `addTags` lines).
  - `getDerivedAbilityTooltipLines(ability, gameState?)` now appends the Combo keyword line from `getComboGrant` (bounded `max - 1`, unlimited bare); `getAbilityTooltipLines` passes `gameState`; hand-written Combo lines removed from `0107`/`0108`.
- [x] Throw Knife needs no combo code: confirm `resolveAbilityTimingEntries(ThrowKnife, unitWithGrant, engine)` contains the combo linger before `cooldown` for both the single-knife and More Rock (two-knife) timelines.
  - Confirmed via `throwComboCancel.test.ts`: `resolveAbilityTimingEntries` gives Throw Knife a combo window before its cooldown (single-knife and More Rock); no changes to `0109Ability.ts`.
- [x] `throwComboCancel.test.ts`: switch assertions from `abilityTagFilter.includes('Combo')` to "has a `conditionalCancel` on the `_combo_cancel_linger`" via `resolveAbilityTimingEntries`; add Throw Knife cases (unlimited grant → window; no grant → none); add a tooltip case (unlimited → line contains `Combo` without a number).
  - Rewrote `throwComboCancel.test.ts` to evaluate the cancel point before the cooldown through `resolveAbilityTimingEntries`; added Throw Knife (grant/no grant/More Rock) and tooltip (unlimited/bounded/none) cases.

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/card_defs/throwComboCancel.test.ts`.

### Step 4 — Knowledge: Combos, the Flurry node, and the Combo glossary term

Files: `app/js/accountKnowledge.ts`, `app/js/researchTrees/trees/weaponTreeIds.ts`, `app/js/researchTrees/trees/weapons.ts`, `abilities/keywords/keywordRegistry.ts`, `app/js/researchTrees/evaluator.comboCancel.test.ts`.

- [x] `accountKnowledge.ts`: export `KNOWLEDGE_COMBOS = 'Combos'` (doc comment: gates Combo research; nothing grants it yet) and add an `ACCOUNT_KNOWLEDGE` entry (label `Combos`, type `systems`, tier 3, description "Unlocks research that gives abilities the Combo keyword."). Do **not** add it to `BATTLE_ENGINE_KNOWLEDGE_KEYS`.
  - Added `KNOWLEDGE_COMBOS` (documented) and an `ACCOUNT_KNOWLEDGE` entry (Combos, systems, tier 3); not in `BATTLE_ENGINE_KNOWLEDGE_KEYS`. Note: Upgrades UI hides a node with an unmet `accountKnowledge` requirement from the player Eligible grid (`collectEligibleResearchGridEntries` uses `meetsAll`), admins still see it in Unowned research and in the tree view as a blocked node with a knowledge badge. So Flurry is hidden (not shown locked) in the grid without Combos.
- [x] `weaponTreeIds.ts`: export `NODE_KNIFE_COMBO = 'knife_combo'`. `weapons.ts`: add the **Flurry** node as specified in Plan-level decisions, placed after the Throw Knife root. Check how `layout: 'rows'` orders nodes (`order`) and pick a value that lands it on the knife row.
  - Added `NODE_KNIFE_COMBO` and the Flurry node (order 25, tier 13 per user request (was 2), premium metal, `comboUnlimited` on `throw_knife`) after the Throw Knife root; `rows` layout places nodes by dependency (root row, depth 1), `order` only affects sorting.
- [x] `keywordRegistry.ts`: register glossary term **Combo** (`matches: ['combo']`), description in house style, e.g. "At the start of its cooldown, you may use this or another ability instead of waiting. Chains continue only through abilities with Combo." Bounded Combo N reads as "N more chained casts" — mention it in one clause if the style guide allows.
  - Registered glossary term Combo (`matches: ['combo']`) with a short mechanical description including the bounded-number clause.
- [x] Extend `evaluator.comboCancel.test.ts`: researching `NODE_KNIFE_COMBO` yields `comboUnlimited: true` on `throw_knife`; the node's requirements fail without `KNOWLEDGE_COMBOS` and pass with it (`meetsRequirement`).
  - Added Flurry tests (unlimited modifier on `throw_knife`; requirements fail without / pass with `KNOWLEDGE_COMBOS`). Also added `Flurry` to `WEAPON_PREMIUM_TITLES` in `researchCosts.test.ts` (cost policy test).

Verify: `npm run lint:changed`, `npx vitest run app/js/researchTrees/evaluator.comboCancel.test.ts app/js/games/minion_battles/abilities/keywords/keywordRegistry.test.ts`.

### Step 5 — Runtime chain test + AbilityTest scenario (scenario written only)

Files: `game/comboCancel.test.ts`, new `testing/scenarios/abilities/throwKnifeComboScenario.ts`, `testing/scenarios/registry.ts`.

- [x] `game/comboCancel.test.ts`: new case — player with `throw_knife` + Burst (`0302`, enough HP for the HP cost), `abilityModifiers.throw_knife = { comboUnlimited: true }`. Knife → pause → knife → pause → knife → pause → Burst; assert three pauses on `throw_knife`, `comboCount` 1/2/3 at each pause, Burst starts with `comboCount 4`, and Burst's cooldown never pauses. Import ids/constants from their defs (no magic strings).
  - Added a Knife x3 -> Burst case (pauses at comboCount 1/2/3, Burst starts at comboCount 4, never pauses); follow-up orders need `endTurn: true` to start the cast (without it the paused cast is cancelled but the follow-up never launches).
- [x] Same file: Rapid Throw regression — at a Throw Rock combo pause, a non-Combo ability (Burst) is now an eligible follow-up (`hasConditionalCancelFollowUp` true / order accepted), and the rank-1 chain still stops after 2 throws.
  - Added a Rapid Throw regression: at a Throw Rock combo pause Burst (non-Combo) is an eligible follow-up and starts; the existing comboMax-2 case still covers the chain stopping after 2 throws.
- [x] Scenario `throwKnifeComboScenario` (`weapons_throw_knife_combo_chain`): research Flurry via `computeAbilityModifiersFromResearch` (mirror `rapidThrowComboScenario.ts`), run Knife ×3 → Burst, record state flags (pause count, final `comboCount`, no pause after Burst). Register it in `testing/scenarios/registry.ts` next to the throw-knife scenarios. Add its `.test.ts` wrapper only if `rapidThrowComboScenario` has one (follow that pattern).
  - Added `throwKnifeComboScenario.ts` (`weapons_throw_knife_combo_chain`, researches Flurry) and registered it after `rapidThrowComboScenario`; no `.test.ts` wrapper (rapidThrowComboScenario has none).

Verify: `npx tsc --noEmit`, `npm run lint:changed`, `npx vitest run app/js/games/minion_battles/game/comboCancel.test.ts` — do **not** run the scenario in this step.

### Step 6 — Final verification

- [x] `npm run lint:changed` and `npx tsc --noEmit` clean for touched paths (note pre-existing unrelated errors rather than fixing them).
  - lint:changed clean (25 files); tsc only the pre-existing `defineDirectionalShield.ts(302,9)` `allowMiss` error.
- [x] Unit tests: `comboGrant.test.ts`, `applyComboGrant.test.ts`, `comboCancelTimings.test.ts`, `comboToTagCancel.test.ts`, `card_defs/throwComboCancel.test.ts`, `app/js/researchTrees/evaluator.comboCancel.test.ts`, `game/comboCancel.test.ts`, `game/conditionalCancel.test.ts` (Entombed regression), `game/BattleSession.submitOrder.test.ts` (uses `conditionalCancelTagFilter: ['Combo']` fixtures — confirm still valid), `keywords/keywordRegistry.test.ts`.
  - 71/73 pass across 11 files (incl. researchCosts.test.ts). The 2 failures are in `BattleSession.submitOrder.test.ts` combo follow-up cases: its fake netAdapter lacks `isReactionClaimUndecidedFor`, which committed `sessionEngineBinding.ts` calls (Reactions work). Neither file is modified by this plan, so pre-existing, not combo-related.
- [x] `npm run test:sim` once — covers the new `throwKnifeComboScenario` and the existing `rapidThrowComboScenario`.
  - 2 files, 191/191 tests passed (SimulationRunner runs every registered scenario, including both).
- [ ] Manual browser checklist: grant **Combos** knowledge (admin) → Flurry appears unlocked on the Weapons tree's knife row (players don't see it at all without the knowledge; admins see it blocked); research it; in battle Throw Knife's tooltip shows the Combo keyword; after a throw the game pauses at the start of cooldown with every affordable ability selectable; Knife ×3 → Burst works, HUD shows **Combo 2/3/4**, and no pause follows Burst; the battle timeline shows the cancel mark with "Another ability can end the rest of this cast"; Rapid Throw still stops after its rank's chain length.

---

## Out of scope (deliberate)

- **Granting Knowledge: Combos** in a mission or story reward (admin grant only until a mission is chosen).
- A Combos tutorial (a `KNOWLEDGE_TUTORIAL_COMBOS` key and tutorial content).
- Static `Combo` tags on ability defs (the engine reads research grants only; a static path can reuse `getComboGrant` later).
- Tag-filtered combos ("Combo Fire"): `buildComboToTagCancelDef` already covers filtered follow-ups.
- AI combo chaining.
