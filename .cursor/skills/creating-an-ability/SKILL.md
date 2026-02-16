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

2. **Single file inside that folder**: `####Ability.ts`
   - Example: folder `0201_ThrowKnife`, file `0201Ability.ts`.
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

Both live in the same file. Export the ability for `AbilityRegistry` and the card def for `card_defs/index.ts`.

## Required ability behavior

1. **`doCardEffect(engine, caster, targets, prevTime, currentTime)`**
   - Runs every tick while the ability is active for a unit using this card.
   - Use `prevTime` and `currentTime` (seconds since start) for one-shot effects (e.g. fire at `currentTime >= prefireTime`). See `ThrowKnife` in `abilities/ThrowKnife.ts` for a threshold example.

2. **`renderPreview(ctx, caster, currentTargets, mouseWorld)`**
   - Draws a hint on the canvas for where the skill will affect (range, area, line, etc.).
   - Called each frame while the player is choosing targets.

Implement the rest of `AbilityStatic` (e.g. `getDescription`, `getAbilityStates`, `targets`, `prefireTime`, `cooldownTime`, `resourceCost`, `rechargeTurns`, `image`, `aiSettings` as needed). Use existing abilities under `abilities/` and `card_defs/` as reference.

## Registration

- **Ability**: In `app/js/games/minion_battles/abilities/AbilityRegistry.ts`, import the ability from `../card_defs/####_ABILITY_NAME/####Ability` and call `register(YourAbility)`.
- **Card def**: In `app/js/games/minion_battles/card_defs/index.ts`, import the card def from `./####_ABILITY_NAME/####Ability` and add it to the `cardDefs` array (and thus `CARD_DEF_MAP`).

## Checklist

- [ ] Folder `card_defs/####_ABILITY_NAME` and file `####Ability.ts` created.
- [ ] Ability ID uses group (2 digits) + index (2 digits); group from `AbilityGroupId` (or shared enum).
- [ ] Same file exports both the ability and the `CardDef` with matching `id` / `abilityId`.
- [ ] `doCardEffect` implements per-tick behavior; `renderPreview` draws targeting hint.
- [ ] Ability registered in `AbilityRegistry.ts`; card def registered in `card_defs/index.ts`.
- [ ] Character’s card list (e.g. in `character_defs/characters.ts`) includes the new card id if the character should have the card.
