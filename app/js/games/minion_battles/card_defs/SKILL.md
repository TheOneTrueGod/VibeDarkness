---
name: creating-an-ability
description: Guides creating new abilities and card definitions in Minion Battles. Use when adding a new ability, card, or skill to app/js/games/minion_battles, or when the user asks how to create an ability.
---

# Creating an Ability (Minion Battles)

When adding a new ability to Minion Battles, follow this layout and ID scheme so abilities stay consistent and discoverable.

Important: ability implementation files belong in `card_defs/` folders (not directly under `abilities/`).

## Literate programming: abilities as a list of behaviours

**Abilities should contain as little logic as possible.** Use utility functions from `abilities/` so that reading an ability's functions is like reading a list of behaviours, not a block of implementation details.

- **Do**: Implement `doCardEffect` by calling helpers keyed to clear behaviours (e.g. "at 0.05s draw a card", "during windup apply forced displacement toward target").
- **Don't**: Inline geometry, damage/block checks, or drawing logic in the ability file when a shared helper already exists or can be added.
- **Helpers**: See utility files in `abilities/` (`targetHelpers.ts`, `effectHelpers.ts`, `previewHelpers.ts`, `gunHelpers.ts`, `blockingHelpers.ts`) for available helpers. When adding new reusable behaviour, add or extend a helper first, then call it from the ability.
- **Hitboxes**: For hit-detection shapes, see the **working-with-hitboxes** skill.

## `abilityEvents` authoring order

When implementing `abilityEvents`, follow this policy:

1. Prefer reusable presets over defining a new inline event rule.
2. Prefer an inline event rule over a custom handler.
3. If no inline primitive exists, prompt the user whether the behavior is one-off or should be generalized into a reusable condition/effect/preset.
4. Custom handlers require a short explanatory comment.
5. Within one event rule, conditions use AND semantics; across multiple event rules, matching uses OR semantics.

## Where to put it

1. **New folder**: `app/js/games/minion_battles/card_defs/####_ABILITY_NAME`
   - `####` = 4-digit ability/card ID (see below).
   - `ABILITY_NAME` = short name in SCREAMING_SNAKE or PascalCase.

2. **Single file inside that folder**: `####_ABILITY_NAME.ts`
   - The **file name must match the folder name** exactly.
   - This file holds **both** the `CardDef` and the ability (`AbilityStatic` implementation).
   - Legacy/non-numbered abilities may use `card_defs/<ability_name>/<ability_name>.ts`.

## Ability ID (####)

The 4-digit ID is `<group><index>`:

- **First two digits = group ID** (character/class). See `AbilityGroupId` in the card_defs codebase for valid group IDs and their zero-padded format.
- **Last two digits = index** of the card within that group (01, 02, 03, …).

## What goes in the ability file

- **Ability**: An object implementing `AbilityStatic` (from `abilities/Ability.ts`). Use the same 4-digit id so cards and abilities match.
- **CardDef**: An object implementing `CardDef` (from `card_defs/types.ts`) with the same `id` and `abilityId` pointing at the ability.
- Static values used in multiple places should be defined as constants at the top of the file.

Both are exported from the same file. Export the ability for `AbilityRegistry` and the card def for `card_defs/index.ts`.

## Required ability behavior

1. **`doCardEffect(engine, caster, targets, prevTime, currentTime)`**
   - Runs every tick while the ability is active.
   - Use `prevTime` and `currentTime` (seconds since start) for one-shot effects. See existing abilities under `card_defs/` for threshold examples.

2. **`renderTargetingPreview(gr, caster, currentTargets, mouseWorld, units)`**
   - Draws a hint in the targeting overlay for where the skill will affect.

Implement the rest of `AbilityStatic` (`getDescription`, `getAbilityStates`, `targets`, `prefireTime`, **`abilityTimings`**, `resourceCost`, `rechargeTurns`, `image`, `aiSettings`) as needed. See existing abilities under `card_defs/` for reference.

### `abilityTimings` (half-open intervals)

**Required** on every ability. Use **`AbilityTimingInterval`** rows (see `abilities/abilityTimings.ts`):

| Field | Role |
|--------|------|
| `id` | Stable string for simulation (`windup`, `lunge`, `hit`, …) — use `activeTimingIds` / `enteredTimingIds` in `doCardEffect` when migrating. |
| `start`, `end` | Seconds from cast start; **half-open** `[start, end)` (`end` exclusive). |
| `abilityPhase` | `AbilityPhase` for ring UI and timeline colour. |
| `timelineLabel` / `timelineDescription` | Optional; battle timeline tooltips default from phase if omitted. |

**Order matters** when intervals overlap: the battle timeline’s single merged band uses **first-listed wins** for overlapping time. Total active duration for the engine is **`max(end)`** across intervals (see `getTotalAbilityDuration`).

Legacy `{ duration, abilityPhase }` remains in the type union for adapters/tests; new card defs should use interval rows only.

### Blocking and `onAttackBlocked`

- **`onAttackBlocked(engine, defender, attackInfo)`** — **Required** on every ability. Called when this ability's attack is blocked. Behaviour varies by ability type:
  - **Projectile abilities**: Deactivate the projectile; no damage dealt.
  - **Melee abilities**: No-op; no damage dealt.
  - **Charging abilities**: Apply knockback to the attacker and clear the ability note.
- **Blocking abilities**: Implement `getBlockingArc(caster, activeAbility, currentTime)` to return the blocking arc in radians. Projectiles must be created with `sourceAbilityId` so the engine knows which ability's `onAttackBlocked` to call.

See existing blocking and attacking abilities for reference implementations.

### Serialization

Whenever an ability needs to store data for future use, it must be serializable. Store unit IDs rather than unit references, and look up units by ID when needed.

## Registration

- **Ability**: In `abilities/AbilityRegistry.ts`, import and call `register(YourAbility)`.
- **Card def**: In `card_defs/index.ts`, import and add to the `cardDefs` array.

## Ability concepts

- **Range**: Always calculate based on the range value plus the size of the source object plus the size of the target object.

## Poise

Units can have **Poise HP** (`poiseHp`, `maxPoiseHp` on `Unit`). Poise resists stuns and knockback:

- When an attack inflicts knockback with poise damage, the unit loses Poise HP equal to the poise damage (clamped to 0).
- If the unit still has Poise HP left, the knockback is **ignored**.
- If the unit is out of Poise HP (or has no max poise), the knockback is **applied**.

To apply knockback from an ability, call `targetUnit.applyKnockback(poiseDamage, params, eventBus)`. It returns `true` if knockback was applied, `false` if resisted.

## Knockback

Use `unit.applyKnockback(poiseDamage, params, eventBus)` (see Poise above). The `params` object must be serializable and include `knockbackVector`, `knockbackAirTime`, `knockbackSlideTime`, and `knockbackSource`. See existing abilities for knockback examples and `Unit.ts` for the full params interface.

While knockback is active, the unit cannot move or act. If it hits a wall, it bounces. All knockback state is serialized for save/restore.

## Checklist

- [ ] Folder `card_defs/####_ABILITY_NAME` and file `####_ABILITY_NAME.ts` created.
- [ ] Ability ID uses group (2 digits) + index (2 digits); group from `AbilityGroupId`.
- [ ] Same file exports both the ability and the `CardDef` with matching `id` / `abilityId`.
- [ ] Non-empty `abilityTimings` (interval form); `doCardEffect` implements per-tick behavior; `renderTargetingPreview` draws targeting hint.
- [ ] Ability registered in `AbilityRegistry.ts`; card def registered in `card_defs/index.ts`.
- [ ] Character's card list includes the new card id if the character should have the card.
- [ ] If the ability inflicts knockback: use `targetUnit.applyKnockback` with serializable params.
