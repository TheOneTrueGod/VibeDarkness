---
name: editing-card-behaviour
description: Summarizes Minion Battles card deck/hand/discard flow and ability structure. Use when editing card definitions, ability behavior, uses (maxUses), or discardDuration in app/js/games/minion_battles.
---

# Editing Card Behaviour in Minion Battles

## When to use this skill

Use this skill whenever you are:
- Changing how many times an ability can be used (uses / recharge)
- Changing card discard behaviour
- Editing card definitions under `app/js/games/minion_battles/card_defs/`
- Tweaking ability behaviour or costs under `app/js/games/minion_battles/abilities/`
- Debugging why cards are not cycling correctly between deck, hand, and discard

### 1. Where decks live

Cards are tracked **per player**, not per-unit. Each `CardInstance` links a `cardDefId` + `abilityId` and has a `location` (hand, deck, or discard) and optional discard timing metadata. See `CardInstance` in the engine for the full interface.

Units know **which abilities** they can use via `Unit.abilities`, but the **cards** that trigger those abilities live on the owning player.

### 2. Deck, hand, and discard semantics

- **Deck**: Unordered pool; draws pick randomly from this pool.
- **Hand**: Cards currently available to use. Maximum hand size is defined in the engine.
- **Discard**: Temporarily unavailable cards that will later return to the deck based on their `discardDuration`.

### 3. Drawing cards

Drawing happens at the **end of each round** inside `handleRoundEnd`. The engine draws up to the max hand size from the deck pool. There is no direct reshuffle of discard into hand; cards must first return to the deck.

### 4. Ability uses and recharge

**Uses are tracked separately from cards**, in `ABILITY_USE_CONFIGS` in `abilities/abilityUses.ts`. Each entry maps an ability ID to `{ maxUses, recoveries }`. When a unit uses an ability, `consumeAbilityUse` decrements `currentUses`. When `currentUses` reaches zero, `canUseAbilityNow` returns false and the ability is unavailable. Uses recover via `addRecoveryChargeToUnitAbilities` when the matching `chargeType` is granted (typically stamina at round end).

**To change how many times an ability can be used**, edit the `maxUses` value in `ABILITY_USE_CONFIGS` for that ability ID. If the ability has no entry yet, add one — it falls back to `DEFAULT_USE_CONFIG` (`maxUses: 1`, stamina recovery) otherwise.

When an ability's `currentUses` hits zero, the engine calls `onCardUsed` which moves the card to discard via `moveToDiscard`, resolving `discardDuration` from the `CardDef`.

### 5. Returning from discard to deck

Discard is always temporary — there is no permanent graveyard.

- **Rounds-based discard** (`unit: 'rounds'`): Processed in `handleRoundEnd`. Each round decrements the counter; when it reaches zero, the card returns to deck.
- **Seconds-based discard** (`unit: 'seconds'`): Processed every tick in `processDiscardSeconds`. When enough game time has elapsed, the card returns to deck.

### 6. Abilities: minimal logic, literate behaviour

Abilities should read like a **list of behaviours**. Prefer utility functions in `abilities/` so that ability functions delegate to named helpers instead of inlining logic. See the **creating-an-ability** skill for the full guideline and available helpers.

### 7. Card definitions vs abilities

- **Card definitions** (`CardDef` in `card_defs/types.ts`): Define `id`, `name`, `abilityId`, and `discardDuration`. See `card_defs/types.ts` for the full type.
- **Abilities** (`AbilityStatic` in `abilities/Ability.ts`): Define runtime behaviour — `prefireTime`, required `abilityTimings` (total cast length and UI phases), resource cost, targets, `doCardEffect`, and `getAbilityStates`. While a unit has an active cast, it generally cannot take another action until that entry ends (driven by `abilityTimings`, not a separate per-ability cooldown stat). See existing abilities under `card_defs/` for reference implementations.

### 8. Editing guidelines

When **editing card behaviour**, follow this checklist:

1. **Changing uses**: Edit `maxUses` in `ABILITY_USE_CONFIGS` (`abilities/abilityUses.ts`) for the ability ID. Add an entry if one doesn't exist — missing entries fall back to `maxUses: 1`. Also set `recoveries` to define how uses are restored (typically `staminaCharge`).
2. **Changing discard timing**: Use `unit: 'rounds'` for round-tied pacing, `unit: 'seconds'` for real-time cooldown-like behaviour. Ensure the card can still be meaningfully drawn given hand size and draw rate.
3. **Changing cast timing or prefire**: Distinguish **card cycle** (`discardDuration`) from **cast timeline** (`abilityTimings` + `prefireTime` used in behaviour / default movement lock). Keep `abilityTimings` consistent with what `doCardEffect` does so the unit is not stuck “casting” longer or shorter than the real effects. Avoid stacking very long discard timers with very long casts so the card still shows up in play.
4. **Changing resource cost**: Make sure the owning unit actually has the required resource.
5. **Debugging draw/discard issues**: Inspect `CardInstance`, `onCardUsed`, `moveToDiscard`, `processDiscardSeconds`, and `handleRoundEnd` in the engine. Confirm the card's `abilityId` matches and the `CardDef` is correctly registered.
6. **Editing `abilityEvents`**: Prefer reusable presets over new inline event rules, and prefer inline event rules over custom handlers. If no inline primitive exists, prompt the user whether the behavior is one-off or should be generalized into a reusable condition/effect/preset. Custom handlers require a short explanatory comment. Within one event rule, conditions use AND semantics; across multiple event rules, matching uses OR semantics.

### 9. Relationship to other skills

- For the **full workflow of creating a new ability/card**, use the **creating-an-ability** skill.
- See `ABILITY_USE_CONFIGS` in `abilities/abilityUses.ts` for examples of use counts and recovery rules, and existing card definitions under `card_defs/` for examples of discard timing configurations.
