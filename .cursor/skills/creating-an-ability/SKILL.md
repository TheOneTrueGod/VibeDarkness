---
name: creating-an-ability
description: Guides creating new abilities and card definitions in Minion Battles. Use when adding a new ability, card, or skill to app/js/games/minion_battles, or when the user asks how to create an ability.
---

# Creating an Ability (Minion Battles)

When adding a new ability to Minion Battles, follow this layout and ID scheme so abilities stay consistent and discoverable.

## Where to put it

1. **New folder**: `app/js/games/minion_battles/card_defs/####_ABILITY_NAME`
   - `####` = 4-digit ability/card ID (see below).
   - `ABILITY_NAME` = short name in SCREAMING_SNAKE or PascalCase (e.g. `ThrowKnife`, `Fireball`).

2. **Single file inside that folder**: `####_ABILITY_NAME.ts`
   - The **file name must match the folder name** exactly (e.g. folder `0101_Dodge`, file `0101_Dodge.ts`).
   - Example: folder `0201_ThrowKnife`, file `0201_ThrowKnife.ts`.
   - This file holds **both** the `CardDef` and the ability (`AbilityStatic` implementation).

## Ability ID (####)

The 4-digit ID is `<group><index>`:

- **First two digits = group ID** (character/class). Use this enum:

```ts
/** Character/group IDs for ability card numbering. First 2 digits of card id. */
export enum AbilityGroupId {
    Warrior = 1,
    Ranger = 2,
    Mage = 3,
    Healer = 4,
}
// Format as zero-padded: "01", "02", "03", "04"
```

- **Last two digits = index** of the card within that group (01, 02, 03, …).

So:

- Card id `"0101"` = warrior, first card.
- Card id `"0201"` = ranger, first card.
- Card id `"0202"` = ranger, second card.

Define (or reuse) an `AbilityGroupId` enum map in the codebase and format group as 2 digits when building the string id.

## What goes in `####Ability.ts`

- **Ability**: An object implementing `AbilityStatic` (from `abilities/Ability.ts`). Use the same 4-digit id as the ability id (e.g. `id: '0201'`) so cards and abilities match.
- **CardDef**: An object implementing `CardDef` (from `card_defs/types.ts`) with the same `id` and `abilityId` pointing at that ability id.
- Any static values that are used in multiple places in an ability should be defined in a constant at the top of the file

Both live in the same file. Export the ability for `AbilityRegistry` and the card def for `card_defs/index.ts`.

## Required ability behavior

1. **`doCardEffect(engine, caster, targets, prevTime, currentTime)`**
   - Runs every tick while the ability is active for a unit using this card.
   - Use `prevTime` and `currentTime` (seconds since start) for one-shot effects (e.g. fire at `currentTime >= prefireTime`). See `ThrowKnife` in `abilities/ThrowKnife.ts` for a threshold example.

2. **`renderTargetingPreview(gr, caster, currentTargets, mouseWorld, units)`**
   - Draws a hint in the targeting overlay for where the skill will affect (range, area, line, etc.).
   - Called each frame while the player is choosing targets.

Implement the rest of `AbilityStatic` (e.g. `getDescription`, `getAbilityStates`, `targets`, `prefireTime`, `cooldownTime`, `resourceCost`, `rechargeTurns`, `image`, `aiSettings` as needed). Use existing abilities under `abilities/` and `card_defs/` as reference.

### Blocking and `onAttackBlocked`

- **`onAttackBlocked(engine, defender, attackInfo)`** — **Required** on every ability. Called on **this** ability when **its** attack is blocked by a blocking ability (e.g. Raise Shield). Each ability implements the behaviour when its attack is blocked:
  - **Projectile abilities** (Throw Knife, Throw Rock, Enemy Archer Shot): in `onAttackBlocked`, set `attackInfo.projectile.active = false` to destroy the projectile; no damage is dealt.
  - **Melee abilities** (Bash, Swing Bat, Enemy Melee): no-op; no damage is dealt.
  - **Charging abilities** (e.g. Dark Wolf Bite): get the attacker via `engine.getUnit(attackInfo.sourceUnitId)`, apply knockback to the attacker (direction from defender to attacker), and call `attacker.clearAbilityNote()` so the lunge stops; the attack is not refunded.
- **Blocking abilities** (e.g. Raise Shield): implement **`getBlockingArc(caster, activeAbility, currentTime)`** to return `{ arcStartAngle, arcEndAngle }` in radians while the ability is active. When an attack is blocked, the **attacking** ability's `onAttackBlocked` is invoked (via `executeBlock(engine, defender, attackInfo, attackingAbilityId)`). Projectiles must be created with **`sourceAbilityId`** so the engine knows which ability's `onAttackBlocked` to call.

Whenever creating a static value for an ability, use a constant to define it at the top of the ability file.

Whenever an ability needs to "store" some data for use in the future, it must be serializable.  So, if an ability needs to make note of a unit, it should store the unit's ID, and then when it needs to use the unit, it should look it up by its ID.

## Registration

- **Ability**: In `app/js/games/minion_battles/abilities/AbilityRegistry.ts`, import the ability from `../card_defs/####_ABILITY_NAME/####Ability` and call `register(YourAbility)`.
- **Card def**: In `app/js/games/minion_battles/card_defs/index.ts`, import the card def from `./####_ABILITY_NAME/####Ability` and add it to the `cardDefs` array (and thus `CARD_DEF_MAP`).

## Ability concepts
- ** range **: When checking for the range of something, always calculate based on the range value plus the size of the source object plus the size of the target object

## Poise

Units can have **Poise HP** (`poiseHp`, `maxPoiseHp` on `Unit`). Poise resists stuns and knockback:

- When an attack tries to inflict knockback, it can specify a **poise damage** amount (if not listed, assume 0).
- The unit loses Poise HP equal to the poise damage (clamped to 0).
- If the unit still has Poise HP left after the hit, the knockback is **ignored**.
- If the unit is out of Poise HP (or has no max poise), the knockback is **applied**.

To apply knockback from an ability, call `targetUnit.applyKnockback(poiseDamage, params, eventBus)`. It returns `true` if knockback was applied, `false` if resisted by poise.

## Knockback

When something should knock back a unit, use **`unit.applyKnockback(poiseDamage, params, eventBus)`** (see Poise above). The `params` object must be serializable and include:

- **`knockbackVector`**: `{ x, y }` — direction and magnitude (pixels) of the push.
- **`knockbackAirTime`**: seconds the unit is in the air (cannot move); full vector is applied over this time.
- **`knockbackSlideTime`**: seconds after air; half of the vector is applied over this time.
- **`knockbackSource`**: `{ unitId: string, abilityId: string }` — who applied the knockback (for callbacks).

While knockback is active, the unit cannot move or act. It is pushed by the vector (full during air, then half during slide). If it hits a wall (rock terrain or world boundary), it bounces like a billiard ball. All knockback state is serialized on the unit for save/restore.

Example (melee hit away from caster):

```ts
const dirX = dist > 0 ? dx / dist : 1;
const dirY = dist > 0 ? dy / dist : 0;
targetUnit.applyKnockback(
    POISE_DAMAGE,
    {
        knockbackVector: { x: dirX * MAGNITUDE, y: dirY * MAGNITUDE },
        knockbackAirTime: 0.3,
        knockbackSlideTime: 0.2,
        knockbackSource: { unitId: caster.id, abilityId: CARD_ID },
    },
    eng.eventBus,
);
```

## Checklist

- [ ] Folder `card_defs/####_ABILITY_NAME` and file `####Ability.ts` created.
- [ ] Ability ID uses group (2 digits) + index (2 digits); group from `AbilityGroupId` (or shared enum).
- [ ] Same file exports both the ability and the `CardDef` with matching `id` / `abilityId`.
- [ ] `doCardEffect` implements per-tick behavior; `renderTargetingPreview` draws targeting hint.
- [ ] Ability registered in `AbilityRegistry.ts`; card def registered in `card_defs/index.ts`.
- [ ] Character’s card list (e.g. in `character_defs/characters.ts`) includes the new card id if the character should have the card.
- [ ] If the ability inflicts knockback: call `targetUnit.applyKnockback(poiseDamage, params, eventBus)` with serializable params; when it hits an enemy, attempt a poise check (pass `poiseDamage > 0` so the target can resist if it has Poise HP).
