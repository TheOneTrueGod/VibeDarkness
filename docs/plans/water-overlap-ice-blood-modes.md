# Water overlap: one card with an Ice / Blood toggle

> **Completed 2026-11-13 (automated steps).** Steps 1-7 are implemented by Sonnet workers.
> - **What changed:** each Water node replaces its blood card, so prep has one pick per pair. The slot has an Ice / Blood mode strip that falls back to the blood card when Ice can't be cast, and shows the reason. A Blood mode exists only when that blood card was owned. Water attaches only for a unit whose abilities cost it, and starts at 5. The `whileCastable` swap is removed.
> - **Checks:**
>   - `npm run test:sim` passes 183/183, including the water scenarios.
>   - `npm run test` passes 4623 with 3 failures outside this plan's area: `accountKnowledge.test.ts` (tutorial tier) and two in `researchNodeGrid.test.ts` (Training node order).
>   - `npx tsc --noEmit` shows only the known `defineDirectionalShield.ts` error.
> - **Not done:** the Step 7 browser check. No local test account has a character with the Water nodes researched.
> - **Follow-ups:**
>   - The tiny-battle `spawnTinyPlayerUnit` skips `attachResourcesForAbilityCosts` / `applyLockedAbilityModes`; only `placePlayerFromLoadout` calls them.
>   - The prep screen's own saved selection is only mapped through replacements at mission spawn, so an old saved 0306 pick may still display until re-picked.

Follow-up to `docs/plans/water-tree-blood-mage-overlap.md`. Playtesting lobby 137FAC showed three problems with the first slice.

- **Prep took two slots.** The Water research nodes *add* each ice card next to its blood card, so prep offered (and the player took) both Bloody Claws and Ice Claws, and both Burst and Frozen Field.
- **The ice cards were invisible in battle.** Each ice card used the `whileCastable` swap: it spawns hidden (`active: false`) and only takes its blood card's slot once the caster can afford it. The player started with 0 Water and was not near water, so all three stayed hidden for the whole battle. Ice Shards was picked without Blood Shard, so it had no slot to take at all.
- **No way to see the second card.** Nothing tells the player that the slot holds two abilities, or why the ice one is not usable.

## What the user wants (2026-11-13)

- **One prep pick per pair.** Researching an ice node **replaces** its blood card. Prep shows only the ice card, and picking it brings both abilities. The player never picks the blood card separately.
- **One battle slot with a toggle.** The slot has an **Ice / Blood mode strip** (the same strip Throw Charged Rock and Frozen Field use).
  - The player can pick either mode.
  - When the chosen Ice mode can't be cast (not enough Water, or no uses), the slot shows and casts the **Blood** card instead.
  - The Ice segment stays on the strip, greyed, with the reason ("Needs 3 Water").
  - When Ice becomes castable again, the slot returns to Ice.
- **Only an owned blood card is a fallback.** The Blood mode exists only when the character had the blood card before the ice node replaced it.
  - With both cards: the toggle shows, and the slot drops back to Blood when Ice can't be cast.
  - With only the ice card (a future standalone Water tree): no strip. The ice card is a normal card that greys out when it can't be paid for.
- **Water starts at 5**, and the Water bar is shown **only when the unit brings an ability that costs Water** (including a mode's ability).

The same rules apply to all three pairs: Ice Claws (1501) / Bloody Claws (0306), Ice Shards (1502) / Blood Shard (0304), and Frozen Field (1503) / Blood Burst (0302).

Build the engine, not the feature (`app/js/games/minion_battles/AGENTS.md`). The new pieces are generic and must not name Water, ice, blood or a card id in engine code:

- a mode the slot falls back to;
- modes that need an owned card;
- unavailable-mode reasons;
- attaching resources from ability costs.

## Design

| Piece | Where | Rule |
|---|---|---|
| `AbilityModesConfig.fallbackMode?: string` | `abilities/Ability.ts` | If the chosen mode's ability can't be cast now, the slot uses `fallbackMode` instead, as long as that mode is available and castable. |
| `AbilityModesConfig.ownedCardModes?: readonly string[]` | `abilities/Ability.ts` | Modes that exist only when the unit owns that mode's ability card. Other modes, such as held-weapon specials and Charged Rock, are always available. |
| `Unit.lockedAbilityModes?: Record<slotAbilityId, string[]>` | `game/units/Unit.ts` + JSON | Set at spawn from the loadout and serialized. Modes listed here are removed from that slot for this unit. |
| `resolveAbilityMode.ts` helpers | `abilities/resolveAbilityMode.ts` | Pure functions shared by the UI, order submission and the engine, so all of them agree: `getAvailableModes`, `resolveEffectiveMode` and `getModeUnavailableReason`. |
| Owned cards | `character_defs/characterLoadout.ts` | `resolveCharacterLoadout` also returns `replacedCardIds`: the cards a research `replaceCard` actually replaced (cards that were in the pool). |
| Resource from ability costs | `resources/Resource.ts`, spawn | A resource with `attachForAbilityCosts` is attached at spawn when any of the unit's abilities, or their mode abilities, cost it. It starts at `startingAmount`. Water: `true`, `5`. This replaces Step 13's research `attachResource` effect. |
| Stale prep loadouts | `storylines/questPrepLoadout.ts` | A saved pick of a replaced card maps to its replacement (0306 → 1501), and duplicates are dropped. |

The `whileCastable` swap trigger from the first plan (Step 6) has no users after this and is removed.

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`). The invoking agent is the **sole orchestrator**: it spawns one worker per step (**model: Sonnet**) **synchronously**, waits for each to finish, verifies the step, then reports plan completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary each, and **stops without spawning another agent**. The orchestrator does Step 7's browser check itself.

Relevant project skills: **working-on-minion-battles**, **editing-card-behaviour** (modes, uses), **creating-an-ability** (+ `card_defs/SKILL.md`), **game-object-def-pattern** (the unit field), **research-trees** (`replaceCard`, `resolveCharacterLoadout`), **components-for-the-ui** and **editing-and-creating-components** (the strip), **ability-tests**, **scoped-testing**. Read `abilities/AGENTS.md`, `card_defs/15_water/AGENTS.md` and `card_defs/03_blood_mage/AGENTS.md` before touching those areas.

**Testing:** Vitest only (never Jest). After edits run `npm run lint:changed` (see `.cursor/rules/post-change-test-hook.mdc`), then only the test files the step names, plus `npx tsc --noEmit` when the step crosses an interface or class boundary.

**Known pre-existing issues, not yours to fix:**
- `npx tsc --noEmit` fails in `abilities/archetypes/defineDirectionalShield.ts` (line ~302, `allowMiss` type). Treat any other tsc error as yours.
- `npm run lint` has a known warning in `storylines/unlock.questBanks.test.ts`.

The working tree may hold other unrelated changes; never revert or reformat files outside the step. Do not commit.

## Steps

### Step 1: Fallback and owned-card modes in the engine

Files: `abilities/Ability.ts`, `abilities/resolveAbilityMode.ts`, new `abilities/resolveAbilityMode.test.ts`, `game/units/Unit.ts`, `game/units/unitToJSON.ts`, `game/units/unitFromJSON.ts`, `abilities/AGENTS.md`.

- [x] Add `fallbackMode?: string` and `ownedCardModes?: readonly string[]` to `AbilityModesConfig`, with doc comments matching the Design table.
  - Done: `fallbackMode` and `ownedCardModes` added to `AbilityModesConfig` with doc comments.
- [x] Add `Unit.lockedAbilityModes` (slot ability id → locked mode ids), defaulting to empty, round-tripped through `unitToJSON` / `unitFromJSON`. Follow **game-object-def-pattern**.
  - Done: `Unit.lockedAbilityModes` added (default `{}`), written in `unitToJSON` when non-empty and parsed in `unitFromJSON`.
- [x] In `resolveAbilityMode.ts`, add pure helpers that take `(unit, slotAbility, ...)`:
  - Done: `resolveAbilityMode.ts` now exports `getAvailableModes`, `getModeUnavailableReason` and `resolveEffectiveMode` (reusing `canAffordAbility`, `canUseAbilityNow`, the `hpCost` gate).
  - `getAvailableModes(unit, slotAbility)`: the ability's `modes` minus the unit's locked ones.
  - `getModeUnavailableReason(unit, slotAbility, mode)`: null when that mode's ability can be cast now. Otherwise a short reason such as `"Needs 3 Water"`, `"No uses left"` or `"Needs more HP"`.
    - Reuse the existing checks (`canUseAbilityNow`, `canAffordAbility`, the HP gate); never duplicate them.
    - Use the resource's display name for the cost reason.
  - `resolveEffectiveMode(unit, slotAbility, chosenMode)`. Start from `chosenMode`, or the default mode if it is missing or locked. If that mode has a reason and `fallbackMode` is available with no reason, return `fallbackMode`; otherwise return the start mode.
- [x] Cast-time agreement: wherever the engine starts a cast from an order with `abilityMode` (`game/units/unitAbilityLifecycle.ts`), pass the mode through `resolveEffectiveMode`. Host and clients then fall back identically even if Water changed between submit and cast. Keep this a pure, deterministic call.
  - Done: `executeUnitAbility` re-resolves the mode through `resolveEffectiveMode` (when the ability has a `fallbackMode`) and swaps to the mode's ability before casting.
- [x] Tests in `resolveAbilityMode.test.ts`. Use `registerAbilityForTest` cards (a resource-cost card with a mode pointing at an HP-cost card) and cover:
  - Done: Added `abilities/resolveAbilityMode.test.ts` (8 tests, passing); `npx tsc --noEmit` shows only the known `defineDirectionalShield.ts` error.
  - locked modes are hidden;
  - a reason is given for no resource, no uses, and an HP gate;
  - the effective mode falls back when the chosen mode can't be cast, and returns when it can;
  - no fallback when the fallback mode is locked;
  - an explicit Blood choice stays Blood;
  - `lockedAbilityModes` survives a unit JSON round trip.
  - Run that file and `npx tsc --noEmit`.

### Step 2: The mode strip shows both modes and why one is out

Files: `ui/components/AbilityModeStrip.tsx`, `ui/components/battleUiSlots/RowSlotAbilities.tsx`, `ui/components/AbilitySlotPreview.tsx` (only if it resolves the shown ability), `ui/pages/battlePhase/useInteractionManagerBridge.ts`, `game/interaction/PlayerInteractionManager.ts`, `.claude/skills/components-for-the-ui/SKILL.md`.

- [x] `RowSlotAbilities` shows the card for `resolveEffectiveMode(unit, slotAbility, chosenMode)`, not the raw chosen mode, so a slot set to Ice shows Bloody Claws while Ice can't be cast.
  - Done: RowSlotAbilities resolves `resolveEffectiveMode` and shows that mode's card, passing it to AbilitySlot as `effectiveAbilityMode`.
- [x] `AbilityModeStrip`:
  - Render only `getAvailableModes`; hide the strip entirely when fewer than 2 modes are available.
  - A mode with an unavailable reason is drawn greyed, with the reason in its tooltip (after its description) and a short marker on the segment, so the player sees why Ice is out.
  - When the effective mode differs from the chosen one, mark the fallback segment as the one in use (e.g. outlined) while keeping the chosen segment highlighted as chosen.
  - Clicking a greyed segment still selects it as the chosen mode; it applies once castable.
  - Keep the existing look for every other card.
  - Done: AbilityModeStrip renders only available modes (null under 2), greys modes with a reason (marker + tooltip), outlines an in-use fallback, still selectable; AbilitySlot gets `availableModes` / `modeUnavailableReasons` / `effectiveAbilityMode` (reasons only drawn for cards with a `fallbackMode`).
- [x] Order submission uses the effective mode. The resolver given to `PlayerInteractionManager.setAbilityModeResolver` (in `useInteractionManagerBridge.ts`) returns `resolveEffectiveMode(...)`, so the order's `abilityMode` and targeting preview match the shown card.
  - Done: PlayerInteractionManager now routes the resolver through a private `effectiveAbilityMode` (resolveEffectiveMode with the active waiter's unit) for orders, nonconfirmed refresh and number-key targeting; the bridge resolver stays the chosen-mode source.
- [x] Add a line for the new strip states to the components skill.
  - No new test file is required. If an existing strip/slot test covers the segment rendering, extend it. Run `npx tsc --noEmit`.
  - Done: Added the strip-state line to the components-for-the-ui skill.

### Step 3: Research replaces, and the loadout locks blood modes the character doesn't own

Files: `app/js/researchTrees/trees/blood_mage.ts`, `app/js/researchTrees/bloodMageWaterOverlap.test.ts`, `character_defs/characterLoadout.ts` (+ its test), `storylines/BaseMissionDef.ts`, `storylines/questPrepLoadout.ts` (+ its test, create if missing), `testing/harness/buildTinyBattleEngine.ts`, `.claude/skills/research-trees/SKILL.md`.

- [x] The three Water nodes use `replaceCard` instead of `addCard`: `0306 → 1501`, `0304 → 1502`, `0302 → 1503`. Prereqs stay as they are.
  - Done: Blood Mage Ice Claws / Ice Shards / Frozen Field nodes now `replaceCard` 0306/0304/0302 to 1501/1502/1503 (the `attachResource` effect stays until Step 4).
- [x] `resolveCharacterLoadout` also returns `replacedCardIds`: the `from` cards of research replacements that were actually in the pool when replaced. Follow chains, so a card replaced twice counts once.
  - Done: `resolveCharacterLoadout` returns `replacedCardIds` (per-phase, cards in the pool that a replacement replaced; a Set so duplicates count once).
- [x] At spawn (`BaseMissionDef`, and the same helper in `buildTinyBattleEngine.ts`), set `unit.lockedAbilityModes`. For each of the unit's abilities with `ownedCardModes`, lock every listed mode whose ability is neither in `loadout.abilityIds` nor in `replacedCardIds`. Put this in one exported helper so both call sites share it.
  - Done: Added exported `applyLockedAbilityModes(unit, loadout)` in `BaseMissionDef`, called from the mission spawn and `placePlayerFromLoadout`.
- [x] Prep loadouts: in `questPrepLoadout.ts`, map saved primaries through the research replacement map and de-duplicate, so an old pick of 0306 becomes 1501 and 0306 + 1501 becomes one 1501. Apply it where the mission reads `questPrimaries` / `missionPrimaries`.
  - Done: Added `mapPrepPicksThroughReplacements` in `questPrepLoadout.ts`, applied to quest/mission prep primaries in `BaseMissionDef` before attachment expansion.
- [x] Tests:
  - Done: Updated `bloodMageWaterOverlap.test.ts` (replace, replacedCardIds, no locked modes, stale prep picks, owned-card lock via a test ability); 3 loadout/prep/overlap files plus research invariant tests pass; tsc shows only the known error.
  - Each node replaces its blood card, so prep shows only the ice card.
  - `replacedCardIds` lists 0306 / 0304 / 0302.
  - A spawned unit with the nodes has the ice card, no separate blood card, and no locked modes.
  - A unit given the ice card without the blood card (via `addCard` in a test-only tree or a direct loadout) has the Blood mode locked.
  - Stale prep picks map and de-duplicate.
  - Run those test files.

### Step 4: Resources attached from ability costs; Water starts at 5

Files: `resources/Resource.ts`, `resources/Water.ts`, `resources/resourceDisplayDefs.ts` (only if it lists starting amounts), `storylines/BaseMissionDef.ts`, `testing/harness/buildTinyBattleEngine.ts`, `app/js/researchTrees/types.ts`, `app/js/researchTrees/evaluator.ts`, `app/js/researchTrees/trees/blood_mage.ts`, new or existing spawn-resource test, `.claude/skills/research-trees/SKILL.md`.

- [x] Give `Resource` two optional static-style properties (follow how `max` and the display defs are declared): `attachForAbilityCosts` (default false) and `startingAmount` (default 0). Water sets `true` and `5` (`WATER_STARTING_AMOUNT = 5`).
  - Done: `Resource.attachForAbilityCosts` (default false) and `startingAmount` (default 0) added; Water sets `true` and `WATER_STARTING_AMOUNT = 5`.

- [x] One exported spawn helper attaches every resource with `attachForAbilityCosts` that any of the unit's abilities, or their `modeAbilityIds`, costs (`resourceCost` / `resourceCosts`). Each starts at `startingAmount`, capped at max, and is skipped if the unit already has it. Call it from `BaseMissionDef` after abilities are final, and from the tiny battle harness.
  - Done: exported `attachResourcesForAbilityCosts(unit, eventBus)` in `BaseMissionDef` (walks abilities plus `modeAbilityIds`), called after abilities are final in the mission spawn and in `placePlayerFromLoadout`.

- [x] Remove the research `attachResource` effect: from the three Water nodes, the type in `researchTrees/types.ts`, `getAttachedResourcesFromResearch`, `attachResourcesFromResearch`, the harness call and the skill line. Check nothing else uses it.
  - Done: removed the `attachResource` effect (Water nodes, type, `getAttachedResourcesFromResearch`, `attachResourcesFromResearch`, harness call, skill line); nothing else used it.

- [x] Tests:
  - a unit with Ice Claws starts with Water 5/16;
  - a unit with only Bloody Claws (a Blood Mage without the Water nodes) has no Water resource;
  - a unit whose mode ability costs Water also gets it;
  - Water is never attached twice.
  - Update `bloodMageWaterOverlap.test.ts` for the removed effect.
  - Run the touched test files and `npx tsc --noEmit`.
  - Done: `bloodMageWaterOverlap.test.ts` covers Water 5/16 with Ice Claws, none for a plain Blood Mage, a test mode ability costing Water, never attached twice, and the removed effect; it and `terrainSiphon.test.ts` pass, tsc shows only the known error.

### Step 5: The three ice cards use Ice / Blood modes

Files: `card_defs/15_water/1501_IceClaws/1501Ability.ts` (+ test), `card_defs/15_water/1502_IceShards/1502Ability.ts` (+ test), `card_defs/15_water/1503_FrozenField/1503Ability.ts` (+ test), `card_defs/15_water/AGENTS.md`, `card_defs/03_blood_mage/AGENTS.md`.

- [x] Remove `swapConfig` from all three.
  - Done: removed `swapConfig` from 1501/1502/1503; 1501 and 1502 got `abilityModes` (`ice` default / `blood`, `modeAbilityIds` 0306 / 0304, `fallbackMode`, `ownedCardModes`, `cycle`, labels and descriptions); 1503 keeps its modes and gains `fallbackMode`, `ownedCardModes` and `cycle`.
  - Ice Claws and Ice Shards get `abilityModes`: modes `ice` (default) and `blood`, with `modeAbilityIds: { blood: '0306' }` and `'0304'` respectively, `fallbackMode: 'blood'`, `ownedCardModes: ['blood']`, labels `Ice` / `Blood`, and one-sentence descriptions.
  - Frozen Field keeps its two modes and adds `fallbackMode` (its blood mode) and `ownedCardModes`.
  - Keep the mode strip style the cards already use (`cycle`).
- [x] Tooltips (house style, `.claude/skills/narrative/writing-style-abilities/STYLE.md`): replace "takes Bloody Claws' slot while you can pay" with a line saying the card falls back to the blood card when you can't pay for it (only meaningful when that mode is available; plain wording is fine).
  - Done: tooltips now say the slot casts the blood card instead when you can't pay; `15_water/AGENTS.md` and `03_blood_mage/AGENTS.md` describe the replace + Ice / Blood fallback model.
- [x] Update the three card tests. Drop the swap assertions and cover:
  - Done: three card tests drop the swap assertions and cover mode config, Ice then Blood fallback at low Water, per-mode uses and a locked Blood mode (tests attach Water / lock modes via the BaseMissionDef helpers); the 3 card files, overlap, resolveAbilityMode and svgPalette tests pass (94), lint clean, tsc shows only the known error.
  - the mode config;
  - on a tiny engine, a unit with both cards casts Ice with 3+ Water and casts Bloody Claws (HP, no Water) through the effective mode at 2 Water;
  - each mode spends its own uses;
  - a unit with the Blood mode locked keeps casting only Ice.
  - Run the three test files.

### Step 6: Retire the `whileCastable` swap trigger

Files: `abilities/Ability.ts`, `abilities/abilitySwap.ts`, `abilities/abilitySwapNetwork.test.ts`, `game/units/Unit.ts`, `game/managers/UnitManager.ts`, `abilities/AGENTS.md`.

- [x] Confirm nothing uses `whileCastable` any more, then remove:
  - the trigger types;
  - `settleWhileCastableSwaps`;
  - the `refresh` swap event and `Unit.refreshSwapNetwork` with its per-tick call in `UnitManager` and the round-start call;
  - the "keep own uses" activation branch;
  - Scenario E in `abilitySwapNetwork.test.ts`;
  - the `whileCastable` rows in `abilities/AGENTS.md`.
  - Leave the `buffApplied` / exhaustion swap network exactly as it was before the first plan.
  - Run `abilitySwapNetwork.test.ts` and `npx tsc --noEmit`.
  - Done: removed the `whileCastable` trigger types, `settleWhileCastableSwaps` and helpers, the `refresh` event, `Unit.refreshSwapNetwork` (tick + round-start calls), the keep-own-uses branch, Scenario E (test file restored to its pre-plan content) and the AGENTS rows; `abilitySwapNetwork.test.ts` 12/12, 0803 Imbued Bat 2/2, lint clean, tsc shows only the known error. Left for Step 7: a stale `whileCastable` comment in `testing/scenarios/abilities/waterScenarios.ts` (`settleSwap`).

### Step 7: Scenarios and final verification

Files: `testing/scenarios/abilities/waterScenarios.ts`, its headless test, `docs/plans/water-tree-blood-mage-overlap.md` (mark its Step 14 superseded).

- [x] Update the water scenarios:
  - **Ice Claws fallback:** with both cards, casts Ice, then Bloody Claws once Water drops below 3, in the same slot.
  - **Ice only:** with the Blood mode locked, the slot stays Ice.
  - **Starting Water:** a Water-card unit starts at 5; a plain Blood Mage has no Water bar.
  - Keep the siphon, Ice Shards pierce and Frozen Field scenarios passing.
  - Done: `waterScenarios.ts` rewritten for modes. `ice_claws_swap_e2e` (Ice cast leaves 2 Water, a second plain order on the same slot casts Bloody Claws and pays HP), new `ice_claws_ice_only_e2e` (Blood mode locked: slot stays Ice, no Bloody cast; second scenario because it needs a different unit setup), new `water_starting_amount_e2e` (Water 5/16 with the Ice Claws node, no Water on a plain Blood Mage). Removed `settleSwap` / `iceHoldsSlot` (and the stale `whileCastable` comment) and the now-unneeded Water top-ups for Claws/Shards; Frozen Field still tops up to its 16 cost. All registered via `WATER_SCENARIOS`.
- [x] Run the water scenarios headlessly. Then run `npm run test` and `npm run test:sim` once, and `npx tsc --noEmit`. Fix failures this plan caused, and list any others verbatim as pre-existing.
  - Done: water scenarios (6 incl. regressions) pass headlessly; `npm run test:sim` 183/183; `npx tsc --noEmit` shows only the known `defineDirectionalShield.ts` error; `npm run lint:changed` clean. `npm run test` (unit): 4623 passed, 3 failed, none caused by this plan (subjects/imports untouched by it). Pre-existing failures, verbatim:
    - `app/js/accountKnowledge.test.ts` > account knowledge registry > puts the Chapter 1 knowledge in tier 1 and everything else in tier 2 (`TutorialCcResistance: expected 1 to be 2`)
    - `app/js/games/minion_battles/ui/components/researchNodeGrid.test.ts` > compareResearchNodesByTier > orders Core Training before Healthy and Mighty
    - `app/js/games/minion_battles/ui/components/researchNodeGrid.test.ts` > collectResearchGridEntries > returns possessed nodes sorted by tier then order
- [x] In the first plan, mark its Step 14 browser check as superseded by this plan.
  - Done: Step 14's browser-check item in `water-tree-blood-mage-overlap.md` is labelled SUPERSEDED by this plan.
- [ ] **Orchestrator:** browser check on the local dev server. A Blood Mage with all three Water nodes:
  - prep offers one card per pair;
  - in battle each slot shows the Ice / Blood strip;
  - Ice greys out with "Needs N Water" and the slot shows the blood card;
  - Water starts at 5.
  - Report anything that could not be checked.
