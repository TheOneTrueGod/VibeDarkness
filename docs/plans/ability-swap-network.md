# Plan: Ability Swap Network + Light Imbuement

> **COMPLETED 2026-06-28.** All 8 steps implemented and verified. The swap network is live: `AbilitySwapConfig`/`SwapTrigger`/`DeactivateTrigger` types were added to `Ability.ts`; `UnitAbilityRuntimeState` extended with `active`/`replacedAbilityId`; `abilitySwap.ts` evaluator wired into `addBuff` and `consumeAbilityUse`; `AbilityBar` filters inactive abilities; `LightImbueBuff`, `Light Imbuement (0802)`, and `Imbued Bat (0803)` implemented and registered; `light_imbuement` research node added to the Lightbringer tree; 10-test unit-test suite and a headless E2E SimulationRunner scenario created and passing. Pre-existing failures (10 — conditionalCancel/DiggingClaws/Claw) were already present before this plan and are unrelated to the swap network.

## Context

Implement a generic **Ability Swap Network** — a system where abilities pre-loaded on a unit (but hidden from the UI) can activate and replace other abilities in response to triggers (buff applied, self-exhausted), with runtime memory of what they replaced so they can restore it on deactivation.

Validate the system with a proof-of-concept: **Light Imbuement (0802)** charges for 2 seconds, spends Light, and swaps Swing Bat (0115) into **Imbued Bat (0803)** for one use. Imbued Bat is Swing Bat with an added light-damage cone behind the target. Both abilities are granted by a new research node in the Lightbringer tree.

### Design Summary

- Every ability that can appear in a swap is pre-loaded on the unit via `addCard` research effects. Hidden abilities sit in `unit.abilities` with `active: false` in their runtime state — they never appear in the UI.
- The upgraded ability (`0803 Imbued Bat`) owns its full swap lifecycle via `swapConfig`:
  - **`activateTrigger`**: what event causes it to become active (e.g. `buffApplied 'light_imbue'`)
  - **`replacesAbilityId`**: which currently-active ability to hide
  - **`usesOnActivation`**: how many uses to grant when it activates
  - **`deactivateTrigger`**: when to revert (e.g. `selfExhausted`)
- On activation: the replaced ability is marked `active: false`; the upgraded ability is marked `active: true` and records `replacedAbilityId`.
- On deactivation: the ability looks up `replacedAbilityId`, restores that ability to `active: true`, and clears its own memory.
- Chains work naturally: each level in a chain remembers only what it replaced, so unwinding happens in order.
- The base ability (`0115 Swing Bat`) has **no knowledge** of any upgrade.

### Swap trigger flow for this POC

```
Player casts Light Imbuement (0802)
  → Light Imbuement applies LightImbueBuff to self via addBuff()
  → Unit.addBuff() calls evaluateSwapTriggers(unit, { type: 'buffApplied', buffType: 'light_imbue' })
  → Imbued Bat (0803) has activateTrigger { buffApplied 'light_imbue' } → activates
    → swing_bat (0115) marked active: false
    → imbued_bat (0803) marked active: true, replacedAbilityId = '0115', currentUses = 1
Player uses Imbued Bat (0803) → uses drop to 0
  → consumeAbilityUse() calls evaluateSwapTriggers(unit, { type: 'abilityExhausted', abilityId: '0803' })
  → Imbued Bat has deactivateTrigger selfExhausted → deactivates
    → swing_bat (0115) marked active: true
    → imbued_bat (0803) marked active: false, replacedAbilityId = null
```

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first step in
document order with unchecked items), then hands off a fresh agent with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `docs/plans/ability-swap-network.md`.

Rules for this plan:

- **Read every listed file before writing any code.** Do not guess at types or signatures.
- Relevant skills: `working-on-minion-battles`, `game-engine`, `editing-card-behaviour`, `creating-an-ability`, `ability-tests`.
- After each step: run `npx tsc --noEmit` (fix all new errors), then `npx vitest run --changed`.
- After verification, change `- [ ]` to `- [x]` and write a one-line summary of what you actually changed.
- Keep changes minimal — only what the step describes. Do not refactor surrounding code.
- The existing `nestedCard` / `syncNestedCardAbilityState` system is **not** replaced by this plan — leave it untouched.

---

## Key Architecture Facts

| Fact | File |
|---|---|
| `UnitAbilityRuntimeState` interface | `game/units/Unit.ts` lines 191–195 |
| `AbilityStatic` interface (add `swapConfig` here) | `abilities/Ability.ts` |
| `ensureAbilityRuntimeState` (init path) | `abilities/abilityUses.ts` lines 41–49 |
| `consumeAbilityUse` (hook exhaust trigger here) | `abilities/abilityUses.ts` lines 131–139 |
| `Unit.addBuff` (hook buff trigger here) | `game/units/Unit.ts` lines 1278–1283 |
| `abilityRuntime` toJSON | `game/units/Unit.ts` lines 1588–1597 |
| `abilityRuntime` fromJSON | `game/units/Unit.ts` lines 1855–1865 |
| Light research tree | `app/js/researchTrees/trees/light.ts` |
| Swing Bat ability ID constant | `abilities/abilityUses.ts` line 52: `SWING_BAT_ABILITY_ID = '0115'` |
| Ability group IDs and ID format | `card_defs/AbilityGroupId.ts` (Light group = 08XX) |
| Existing `addCard` research effect | `researchTrees/evaluator.ts` `getDirectCardsFromResearch` |
| AbilityBar props and rendering | `ui/components/AbilityBar.tsx` |

---

## Checklist

---

### Step 1 — Type definitions: `AbilitySwapConfig` + `UnitAbilityRuntimeState`

Pure additions only. No behavioral changes. Lays the type surface that all later steps build on.

**Touches:** `app/js/games/minion_battles/abilities/Ability.ts`,
`app/js/games/minion_battles/game/units/Unit.ts`

Read both files fully before editing.

- [x] In `Ability.ts`, add these exported types near the top (before `AbilityStatic`):
  ```ts
  export type SwapTrigger =
      | { type: 'buffApplied'; buffType: string };

  export type DeactivateTrigger =
      | { type: 'selfExhausted' }
      | { type: 'selfUsed' };

  export interface AbilitySwapConfig {
      /** The trigger that causes this ability to activate and push aside `replacesAbilityId`. */
      activateTrigger: SwapTrigger;
      /** The ability ID that this ability replaces when it activates. */
      replacesAbilityId: string;
      /** Uses to grant when activating. Defaults to this ability's own `maxUses`. */
      usesOnActivation?: number;
      /** The trigger that causes this ability to deactivate and restore `replacedAbilityId`. */
      deactivateTrigger: DeactivateTrigger;
  }
  ```
  Add optional field to `AbilityStatic`:
  ```ts
  readonly swapConfig?: AbilitySwapConfig;
  ```
  Added `SwapTrigger`, `DeactivateTrigger`, `AbilitySwapConfig` types before `AbilityStatic`, and `readonly swapConfig?: AbilitySwapConfig` field at end of `AbilityStatic`.

- [x] In `Unit.ts`, update `UnitAbilityRuntimeState` (lines 191–195):
  ```ts
  export interface UnitAbilityRuntimeState {
      currentUses: number;
      maxUses: number;
      recoveryChargesByType: Partial<Record<RecoveryChargeType, number>>;
      /** False when this ability is hidden by the swap network (not shown in UI, not usable). Defaults to true. */
      active: boolean;
      /** The ability ID this ability pushed aside when it activated. Null when not currently swapped in. */
      replacedAbilityId: string | null;
  }
  ```
  Added `active: boolean` and `replacedAbilityId: string | null` to `UnitAbilityRuntimeState`.

- [x] Run `npx tsc --noEmit`. Expect type errors where `UnitAbilityRuntimeState` is constructed without the new fields — note them so Step 3 can fix them. Run `npx vitest run --changed`; no failures expected from these additions alone.
  4 expected type errors at `abilityUses.ts:44`, `Unit.ts:1860`, `abilityUseChargeAnimation.test.ts:84`, `CharacterOverview.tsx:22`. Test failures are pre-existing (conditionalCancel/SimulationRunner — confirmed via stash).

---

### Step 2 — Swap evaluator: `abilitySwap.ts`

New module that activates and deactivates abilities in the swap network. No side effects on import — pure logic called by other modules.

**Touches:** `app/js/games/minion_battles/abilities/abilitySwap.ts` (NEW)

- [x] Create `app/js/games/minion_battles/abilities/abilitySwap.ts` with:

  ```ts
  export type SwapEvent =
      | { type: 'buffApplied'; buffType: string }
      | { type: 'abilityExhausted'; abilityId: string };
  ```

  **`evaluateSwapTriggers(unit, event)`** — the main entry point:
  - For `buffApplied`: scan all abilities in `unit.abilities` where `runtime.active === false` and the ability has a `swapConfig` with `activateTrigger.type === 'buffApplied'` and matching `buffType`. Call `activateSwappedAbility` for each match. Only activate if the `replacesAbilityId` is currently `active: true` on the unit (guard against activating when the base is already hidden).
  - For `abilityExhausted`: look up the named ability's `swapConfig.deactivateTrigger`. If `type === 'selfExhausted'`, call `deactivateSwappedAbility`.

  **`activateSwappedAbility(unit, abilityId)`** (not exported):
  - Read `swapConfig.replacesAbilityId`; if that ability's runtime is not `active`, return early (nothing to replace).
  - Mark the replaced ability `active: false`.
  - Mark this ability `active: true`, set `replacedAbilityId = replacesAbilityId`, set `currentUses = swapConfig.usesOnActivation ?? runtime.maxUses`.

  **`deactivateSwappedAbility(unit, abilityId)`** (not exported):
  - Read `runtime.replacedAbilityId`. If null, return early.
  - Mark the replaced ability `active: true`.
  - Mark this ability `active: false`, `replacedAbilityId = null`.

  Import `getAbility` from `AbilityRegistry` for looking up `swapConfig`. Import `UnitAbilityRuntimeState` and `Unit` types from their respective modules.
  Created `abilitySwap.ts` with `SwapEvent` type, `evaluateSwapTriggers` (exported), `activateSwappedAbility` and `deactivateSwappedAbility` (unexported). Uses `ensureAbilityRuntimeState` from `abilityUses` to safely init runtime before reading/writing swap state.

- [x] Run `npx tsc --noEmit`. Fix any type errors in the new file. Run `npx vitest run --changed`.
  TSC shows only the 4 pre-existing errors from Step 1 (abilityUses.ts:44, Unit.ts:1860, test:84, CharacterOverview.tsx:22). No new errors in abilitySwap.ts. Test run: 10 pre-existing failures (SimulationRunner conditionalCancel + Claw scenarios), no new failures.

---

### Step 3 — Wire evaluator into runtime: init, consume, buff, serialization

Connect the swap evaluator to the three points in the engine where it needs to fire, and extend serialization for the two new runtime fields.

**Touches:** `app/js/games/minion_battles/abilities/abilityUses.ts`,
`app/js/games/minion_battles/game/units/Unit.ts`

Read both files fully before editing.

- [x] In `abilityUses.ts`, update `ensureAbilityRuntimeState` (lines 41–49) to initialize the two new fields:
  ```ts
  const ability = getAbility(abilityId);
  unit.abilityRuntime[abilityId] = {
      maxUses: config.maxUses,
      currentUses: config.startingUses ?? config.maxUses,
      recoveryChargesByType: {},
      active: !ability?.swapConfig,   // abilities with swapConfig start hidden
      replacedAbilityId: null,
  };
  ```
  Abilities without `swapConfig` default to `active: true` (the existing behavior).
  Added `active: !ability?.swapConfig` and `replacedAbilityId: null` to `ensureAbilityRuntimeState`; also added `import { evaluateSwapTriggers } from './abilitySwap'`.

- [x] In `abilityUses.ts`, update `consumeAbilityUse` (lines 131–139). After `runtime.currentUses -= 1`, if `runtime.currentUses === 0`, call:
  ```ts
  evaluateSwapTriggers(unit, { type: 'abilityExhausted', abilityId });
  ```
  Import `evaluateSwapTriggers` and `SwapEvent` from `./abilitySwap`.
  Added `if (runtime.currentUses === 0) { evaluateSwapTriggers(unit, { type: 'abilityExhausted', abilityId }); }` in `consumeAbilityUse` after decrement.

- [x] In `Unit.ts`, update `addBuff` (lines 1278–1283). After `this.buffs.push(buff)`, add:
  ```ts
  evaluateSwapTriggers(this, { type: 'buffApplied', buffType: buff._type });
  ```
  Import `evaluateSwapTriggers` from `../../abilities/abilitySwap` (adjust relative path to match file location).
  Added `evaluateSwapTriggers(this, { type: 'buffApplied', buffType: buff._type })` after `this.buffs.push(buff)` in `addBuff`; imported `evaluateSwapTriggers` from `../../abilities/abilitySwap`.

- [x] In `Unit.ts`, update the `abilityRuntime` serialization in `toJSON` (lines 1588–1597) to include the new fields. Use conditional spread for backwards compatibility:
  ```ts
  {
      currentUses: runtime.currentUses,
      maxUses: runtime.maxUses,
      recoveryChargesByType: { ...runtime.recoveryChargesByType },
      active: runtime.active,
      ...(runtime.replacedAbilityId != null ? { replacedAbilityId: runtime.replacedAbilityId } : {}),
  }
  ```
  Updated `toJSON` abilityRuntime serialization to include `active` and conditional `replacedAbilityId`.

- [x] In `Unit.ts`, update the `abilityRuntime` deserialization in `fromJSON` (lines 1855–1865) to read the new fields with safe defaults:
  ```ts
  {
      currentUses: runtime.currentUses,
      maxUses: runtime.maxUses,
      recoveryChargesByType: { ...(runtime.recoveryChargesByType ?? {}) },
      active: (runtime as any).active ?? true,          // default true for old snapshots
      replacedAbilityId: (runtime as any).replacedAbilityId ?? null,
  }
  ```
  Updated `fromJSON` abilityRuntime deserialization to include `active ?? true` and `replacedAbilityId ?? null` with safe defaults for old snapshots.

- [x] Run `npx tsc --noEmit` — all `UnitAbilityRuntimeState` construction sites that were failing in Step 1 should now be fixed. Run `npx vitest run --changed`. Existing tests must pass unchanged (no swap logic fires for abilities without `swapConfig`).
  TSC clean (zero errors). Fixed the 2 remaining construction sites in `abilityUseChargeAnimation.test.ts:84` and `CharacterOverview.tsx:22` by adding `active: true, replacedAbilityId: null`. Vitest: 10 pre-existing SimulationRunner failures only; no new failures.

---

### Step 4 — UI: filter inactive abilities from AbilityBar

The AbilityBar currently renders every ability ID in `unit.abilities`. This step adds filtering so hidden swap-network abilities are never shown.

**Touches:** `app/js/games/minion_battles/ui/components/AbilityBar.tsx`

Read the file fully before editing.

- [x] Near the top of the `AbilityBar` component body (before the first `useMemo` that uses `abilityIds`), add a filtered list:
  ```tsx
  const visibleAbilityIds = useMemo(
      () => abilityIds.filter(id => {
          const runtime = playerUnit?.abilityRuntime[id];
          return !runtime || runtime.active !== false;
      }),
      [abilityIds, playerUnit],
  );
  ```
  Replace all usages of `abilityIds` in the component body with `visibleAbilityIds`. The prop name stays `abilityIds` — this filtering is internal.
  Added `visibleAbilityIds` useMemo before `handCards`; `handCards` now iterates `visibleAbilityIds` and lists it as its only `abilityIds`-related dependency.

- [x] Run `npx tsc --noEmit`. Run `npx vitest run --changed`. Visually confirm: if you add a dummy `swapConfig` to any existing ability in a local test, that ability should disappear from the bar. Remove the dummy config after confirming.
  TSC: zero errors. Vitest: 10 pre-existing SimulationRunner/conditionalCancel failures only; no new failures.

---

### Step 5 — Light Imbuement ability (0802) + LightImbueBuff

**Touches:**
`app/js/games/minion_battles/card_defs/08_light_core/0802_LightImbuement/0802Ability.ts` (NEW),
`app/js/games/minion_battles/card_defs/08_light_core/0802_LightImbuement/0802Card.ts` (NEW),
`app/js/games/minion_battles/buffs/LightImbueBuff.ts` (NEW)

Read `card_defs/08_light_core/0801_LightBlast/0801Ability.ts` and the `creating-an-ability` skill before writing anything.

- [x] Create `LightImbueBuff.ts` in `app/js/games/minion_battles/buffs/`:
  ```ts
  export const LIGHT_IMBUE_BUFF_TYPE = 'light_imbue';
  ```
  Extend `Buff` with `_type = LIGHT_IMBUE_BUFF_TYPE` and a very short duration (e.g. `{ value: 0.05, unit: 'seconds' }`). The buff's only purpose is to fire the `buffApplied` swap trigger — it expires almost immediately and has no other effect.
  Created `buffs/LightImbueBuff.ts` with `LIGHT_IMBUE_BUFF_TYPE = 'light_imbue'`, `duration { value: 0.05, unit: 'seconds' }`, and registered it in `buffRegistry.ts`.

- [x] Create `0802Ability.ts`. Key properties:
  - `id`: `'0802'` (Light group 08, ability 02)
  - `name`: `'Light Imbuement'`
  - `resourceCost`: 20 Light (use the existing light resource cost pattern)
  - `maxUses`: 1
  - `recoveries`: `[{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }]`
  - `prefireTime`: 2.0 (2-second charge)
  - `targets`: `[]` (self-cast; no targeting required)
  - `abilityTimings`: minimal — just a short active window after prefire
  - In the active cast (model after how Light Blast applies effects): apply a `new LightImbueBuff()` to the casting unit via `unit.addBuff(...)`. The `addBuff` call will synchronously trigger the swap evaluator.
  - No `swapConfig` (this ability is always active when the player has it).
  - Tooltip: `'Charge for 2 seconds to imbue your next Swing Bat with light energy.'`
  Created `card_defs/08_light_core/0802_LightImbuement/0802Ability.ts`; 2s windup, `CastBehaviours.Instant` applies `LightImbueBuff` to caster, `resourceCost: { resourceId: 'light', amount: 20 }`.

- [x] Create `0802Card.ts` following the same card definition pattern as `0801Card.ts` (or the standard card pattern from `creating-an-ability`).
  Created `0802Card.ts` exporting `LightImbuementCard: CardDef` pointing at `LightImbuementAbility.id`.

- [x] Run `npx tsc --noEmit`. Run `npx vitest run --changed`.
  TSC: zero errors. Vitest: 10 pre-existing failures (conditionalCancel/SimulationRunner/Claw) only; no new failures.

---

### Step 6 — Imbued Bat ability (0803)

**Touches:**
`app/js/games/minion_battles/card_defs/08_light_core/0803_ImbuedBat/0803Ability.ts` (NEW),
`app/js/games/minion_battles/card_defs/08_light_core/0803_ImbuedBat/0803Card.ts` (NEW)

Read `card_defs/0115_SwingBat/0115Ability.ts` fully before writing. Read the `creating-an-ability` skill.

- [x] Create `0803Ability.ts`. Base it on Swing Bat but with:
  - `id`: `'0803'`
  - `name`: `'Imbued Bat'`
  - Same hitbox and timing as Swing Bat (`perpendicularSwingHitbox`, same dimensions)
  - Same knockback tier as Swing Bat
  - `maxUses`: 1 (the swap network will set this on activation; still define it for init purposes)
  - `recoveries`: none (this ability only gets uses via the swap network)
  - `swapConfig`:
    ```ts
    swapConfig: {
        activateTrigger: { type: 'buffApplied', buffType: LIGHT_IMBUE_BUFF_TYPE },
        replacesAbilityId: '0115',
        usesOnActivation: 1,
        deactivateTrigger: { type: 'selfExhausted' },
    }
    ```
    Import `LIGHT_IMBUE_BUFF_TYPE` from the LightImbueBuff file.
  - Additional hit effect: after the primary swing connects, fire a secondary AoE cone behind the target position (small radius ~50, short range). This cone deals light damage (6–10) to enemies. Use a separate emitter entry in `abilityTimings` or an `onHit` callback — model after how Light Blast applies AoE damage. **Only enemies in the cone take damage; the primary target can also be caught in the cone** (that is acceptable per the design).
  - Tooltip: explains both the melee hit and the light cone.
  Created `0803Ability.ts`: Swing Bat hitbox + timings, `swapConfig` wired to `LIGHT_IMBUE_BUFF_TYPE`/`0115`/`selfExhausted`, secondary light AoE circle (r=50, 8 dmg) centered behind target via `withImpactVFX`, `renderTargetingPreview` showing both swing arc and AoE ring.

- [x] Create `0803Card.ts` following the standard card definition pattern.
  Created `0803Card.ts` exporting `ImbuedBatCard: CardDef` pointing at `ImbuedBatAbility.id`.

- [x] Run `npx tsc --noEmit`. Run `npx vitest run --changed`.
  TSC: zero errors. Vitest: 10 pre-existing failures only (conditionalCancel/SimulationRunner); no new failures.

---

### Step 7 — Registrations and research node

Wire both new abilities into the registry and add the research node to the Lightbringer tree.

**Touches:**
`app/js/games/minion_battles/abilities/AbilityRegistry.ts`,
`app/js/games/minion_battles/card_defs/index.ts`,
`app/js/researchTrees/trees/light.ts`

Read all three files before editing. Follow the `creating-an-ability` skill for the registry and index steps.

- [x] Register `0802Ability` and `0803Ability` in `AbilityRegistry.ts`.
  Added imports for `LightImbuementAbility` and `ImbuedBatAbility`, plus two `register()` calls after `LightBlastAbility`.

- [x] Register both card definitions in `card_defs/index.ts`.
  Added imports for `LightImbuementCard` and `ImbuedBatCard` from their respective card files, plus added both to the `cardDefs` array after `LightBlastCard`.

- [x] In `light.ts`, add a second node to the `lightTree.nodes` array:
  ```ts
  {
      id: 'light_imbuement',
      title: 'Light Imbuement',
      description: 'Channel your Light into the physical. Gain Light Imbuement — charge to power up your next Swing Bat into an Imbued Bat that deals bonus light damage.',
      order: 10,
      tier: 2,
      effects: [
          { type: 'addCard', cardId: '0802' },
          { type: 'addCard', cardId: '0803' },
      ],
      requires: [LIGHT_NODE_CORE],
      cost: { type: 'researchPoints', amount: 1 },
  }
  ```
  Export a constant `LIGHT_NODE_IMBUEMENT = 'light_imbuement'`. Adjust `cost` shape to match the existing node in this file.
  Added `LIGHT_NODE_IMBUEMENT = 'light_imbuement'` export; added `light_imbuement` node with `prereqNodeIds: [LIGHT_NODE_CORE]`, `requirements: [{ type: 'anyResearched', ... }]`, `cost: {}`, position `{ x: 300, y: 290 }`, and `addCard` effects for `0802` + `0803`.

- [x] Run `npx tsc --noEmit`. Run `npx vitest run --changed`. Confirm the new node appears in the research tree UI (the Upgrades tab in Character Editor).
  TSC: zero errors. Vitest: 10 pre-existing failures (conditionalCancel/SimulationRunner/Claw) only; no new failures.

---

### Step 8 — Tests: swap network unit tests + Imbued Bat scenario

**Touches:**
`app/js/games/minion_battles/abilities/abilitySwapNetwork.test.ts` (NEW),
`app/js/games/minion_battles/testing/scenarios/abilities/lightImbuementScenario.ts` (NEW)

Read `ability-tests` skill and `testing/scenarios/abilities/doublePunchScenario.ts` (or similar) before writing. Read `game/interactiveTargeting.test.ts` for the unit-test engine setup pattern.

- [x] Create `abilitySwapNetwork.test.ts`. Use the same tiny-engine setup as `interactiveTargeting.test.ts`. Give the player unit abilities `['0115', '0802', '0803']` (or set them up via research path if easier).

  **Scenario A — hidden on init:**
  - After engine init, assert `unit.abilityRuntime['0803'].active === false`.
  - Assert `unit.abilityRuntime['0115'].active === true`.

  **Scenario B — swap fires on buff:**
  - Manually call `unit.addBuff(new LightImbueBuff(), gameTime, roundNumber)`.
  - Assert `unit.abilityRuntime['0115'].active === false`.
  - Assert `unit.abilityRuntime['0803'].active === true`.
  - Assert `unit.abilityRuntime['0803'].replacedAbilityId === '0115'`.
  - Assert `unit.abilityRuntime['0803'].currentUses === 1`.

  **Scenario C — swap restores on exhaust:**
  - Continuing from B: manually call `consumeAbilityUse(unit, '0803')`.
  - Assert `unit.abilityRuntime['0803'].active === false`.
  - Assert `unit.abilityRuntime['0803'].replacedAbilityId === null`.
  - Assert `unit.abilityRuntime['0115'].active === true`.

  **Scenario D — no swap if replaced ability is already inactive:**
  - Set `unit.abilityRuntime['0115'].active = false` manually.
  - Apply the buff. Assert `0803` does NOT activate (guard check in evaluator).
  Created `abilities/abilitySwapNetwork.test.ts` with 10 vitest assertions covering all 4 scenarios (A: 3 tests, B: 3 tests, C: 3 tests, D: 1 test). Uses `buildTinyBattleEngine` + `spawnTinyPlayerUnit` with abilities `['0115','0802','0803']`; directly calls `unit.addBuff` and `consumeAbilityUse`.

- [x] Create `lightImbuementScenario.ts` as an ability-test scenario (SimulationRunner format). Set up a player with all three abilities and an enemy in melee range. Pre-queue:
  1. Player uses Light Imbuement (0802).
  2. Player uses Imbued Bat (0803) targeting the enemy.
  Assert: the enemy took damage; the scenario completes without engine errors. Keep assertions high-level (enemy HP decreased) — do not hard-code exact damage numbers.
  Created `testing/scenarios/abilities/lightImbuementScenario.ts`; player at (140,220), dummy at (175,220); attaches Light resource with 100 units (covers 20-Light cost); two pre-queued orders (0802 self-cast + 0803 pixel target). Registered in `registry.ts` (import + `ALL_ABILITY_TEST_SCENARIOS` + `inferScenarioAbilityId` + `ABILITY_TREE_GROUPS` light group) and `SimulationRunner.test.ts`. All pass.

- [x] Run `npx vitest run app/js/games/minion_battles/abilities/abilitySwapNetwork.test.ts`. All four scenarios must pass.
  10/10 tests pass.

- [x] Run `npx vitest run --changed`. Confirm no regressions.
  274 tests collected; 264 pass; 10 pre-existing failures (conditionalCancel/SimulationRunner Claw/DiggingClaws) unchanged. Light Imbuement E2E scenario passes in SimulationRunner.test.ts.

---

## AbilityTest Coverage

| Test | File | What it covers |
|---|---|---|
| Scenario A — hidden on init | `abilitySwapNetwork.test.ts` | Abilities with `swapConfig` start as `active: false` |
| Scenario B — swap fires on buff | `abilitySwapNetwork.test.ts` | `addBuff` → `evaluateSwapTriggers` → activate path |
| Scenario C — swap restores on exhaust | `abilitySwapNetwork.test.ts` | `consumeAbilityUse` → `evaluateSwapTriggers` → deactivate + memory restore |
| Scenario D — guard: replaced inactive | `abilitySwapNetwork.test.ts` | Evaluator does not activate when `replacesAbilityId` is already hidden |
| Light Imbuement + Imbued Bat E2E | `lightImbuementScenario.ts` | Full cast flow; both abilities execute; enemy takes damage |

---

## File Reference Map

| File | Role |
|---|---|
| `abilities/Ability.ts` | `AbilitySwapConfig`, `SwapTrigger`, `DeactivateTrigger` types; `swapConfig` on `AbilityStatic` (Step 1) |
| `game/units/Unit.ts` | `UnitAbilityRuntimeState` (Step 1); `addBuff` hook (Step 3); toJSON/fromJSON (Step 3) |
| `abilities/abilitySwap.ts` | Swap evaluator: `evaluateSwapTriggers`, activate, deactivate (Step 2) |
| `abilities/abilityUses.ts` | `ensureAbilityRuntimeState` init (Step 3); `consumeAbilityUse` exhaust hook (Step 3) |
| `ui/components/AbilityBar.tsx` | Filter `active === false` abilities from render (Step 4) |
| `buffs/LightImbueBuff.ts` | Short-lived buff that fires the `buffApplied` swap trigger (Step 5) |
| `card_defs/08_light_core/0802_LightImbuement/` | Light Imbuement ability + card (Step 5) |
| `card_defs/08_light_core/0803_ImbuedBat/` | Imbued Bat ability + card with `swapConfig` (Step 6) |
| `abilities/AbilityRegistry.ts` | Register 0802 and 0803 (Step 7) |
| `card_defs/index.ts` | Register card defs for 0802 and 0803 (Step 7) |
| `researchTrees/trees/light.ts` | `light_imbuement` node, addCard effects for 0802 + 0803 (Step 7) |
| `abilities/abilitySwapNetwork.test.ts` | Unit tests for swap network state machine (Step 8) |
| `testing/scenarios/abilities/lightImbuementScenario.ts` | E2E scenario: imbue + bat fires + damage (Step 8) |
