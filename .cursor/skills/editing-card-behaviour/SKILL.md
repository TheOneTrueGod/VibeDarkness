---
name: editing-card-behaviour
description: Summarizes Minion Battles card deck/hand/discard flow and ability structure. Use when editing card definitions, ability behavior, durability, or discardDuration in app/js/games/minion_battles.
---

# Editing Card Behaviour in Minion Battles

## Instructions

Use this skill whenever you are:
- Changing card durability or discard behaviour
- Editing card definitions under `app/js/games/minion_battles/card_defs/`
- Tweaking ability behaviour or costs under `app/js/games/minion_battles/abilities/`
- Debugging why cards are not cycling correctly between deck, hand, and discard

Keep this model in mind while you edit.

### 1. Where decks live

- Cards are tracked **per player**, not per-unit:
  - `GameEngine.cards[playerId]: CardInstance[]`
  - Each `CardInstance` links a `cardDefId` + `abilityId` and has:
    - `location: 'hand' | 'deck' | 'discard'`
    - `durability`
    - `discardRoundsRemaining?`
    - `discardAddedAtTime?`
- Units know **which abilities** they can use via `Unit.abilities: string[]`, but the **cards** that trigger those abilities live on the owning player.

### 2. Deck, hand, and discard semantics

- **Deck**:
  - Any card with `location === 'deck'`.
  - Treated as an unordered pool; draws pick a random card from this pool.
- **Hand**:
  - Any card with `location === 'hand'`.
  - Max hand size is `MAX_HAND_SIZE = 6` (in `GameEngine.ts`).
- **Discard**:
  - Any card with `location === 'discard'`.
  - Represents cards that are temporarily unavailable and will later return to the deck based on `discardDuration`.

### 3. Drawing cards

- Drawing happens at the **end of each round** inside `GameEngine.handleRoundEnd`:
  - Count current hand cards (`location === 'hand'`).
  - Collect all deck cards (`location === 'deck'`).
  - Compute `toDraw = min(1, MAX_HAND_SIZE - handCount, deckCards.length)`.
  - For each card to draw:
    - Pick a random card from the deck pool.
    - Set `card.location = 'hand'`.
- There is no reshuffle of discard directly into hand; cards must first move back to the deck (see next sections).

### 4. Using a card and durability

- When a unit successfully uses an ability:
  - The engine calls `GameEngine.onCardUsed(playerId, abilityId)`.
  - This finds the **first in-hand card** with that `abilityId`:
    - Decrements `card.durability`.
    - If `card.durability > 0`, the card **stays in hand**.
    - If `card.durability <= 0`, it is moved to discard via `moveToDiscard(card)`.
- `moveToDiscard(card)`:
  - Looks up the `CardDef` via `getCardDef(card.abilityId)`.
  - Resolves `discardDuration` from the `CardDef`, defaulting to `{ duration: 1, unit: 'rounds' }` if missing.
  - Sets:
    - `card.location = 'discard'`
    - `card.durability = 0`
    - Either:
      - `card.discardRoundsRemaining = duration` (for rounds), or
      - `card.discardAddedAtTime = gameTime` (for seconds).

### 5. Returning from discard to deck

There is **no permanent graveyard**; discard is always temporary.

- **Rounds-based discard** (`unit: 'rounds'`):
  - Processed in `GameEngine.handleRoundEnd`.
  - For each card in discard with `discardRoundsRemaining`:
    - Decrement `discardRoundsRemaining`.
    - When it reaches `0` or below:
      - `card.location = 'deck'`
      - Reset `card.durability` from the `CardDef` (default `1` if unspecified).
      - Clear discard metadata (`discardRoundsRemaining`, `discardAddedAtTime`).
- **Seconds-based discard** (`unit: 'seconds'`):
  - Processed every tick in `GameEngine.processDiscardSeconds`.
  - For each card in discard with `discardAddedAtTime`:
    - Look up `discardDuration` from the `CardDef`.
    - If `gameTime - discardAddedAtTime >= duration`:
      - `card.location = 'deck'`
      - Reset `card.durability` from the `CardDef`.
      - Clear discard metadata.

### 6. Abilities: minimal logic, literate behaviour

Abilities should read like a **list of behaviours**. Prefer utility functions in `abilities/` (e.g. `targetHelpers`, `effectHelpers`, `previewHelpers`, `gunHelpers`, `blockingHelpers`) so that `doCardEffect`, `renderTargetingPreview`, etc. delegate to named helpers instead of inlining logic. See the **creating-an-ability** skill for the full literate-programming guideline and helper list.

### 7. Card definitions vs abilities

- **Card definitions** (`CardDef` in `card_defs/types.ts`):
  - Key fields:
    - `id`: card ID
    - `name`
    - `abilityId`: links to an ability in the registry
    - `durability?`: uses before moving to discard (default 1)
    - `discardDuration?`: how long in discard before returning to deck
  - Example (from Dodge):
    - `durability: 2` → two uses before discard.
    - `discardDuration: { duration: 1, unit: 'rounds' }` → returns to deck after 1 round in discard.
- **Abilities** (`AbilityStatic` in `abilities/Ability.ts` and individual files like `ThrowRock.ts` or `0101Ability.ts`):
  - Define runtime behaviour:
    - `cooldownTime`, `prefireTime`
    - `resourceCost` (e.g. Rage or Mana)
    - `targets` and `aiSettings`
    - `doCardEffect(...)` (actual effect)
    - `getAbilityStates(...)` (IFRAMES, movement penalties, etc.)
  - The engine:
    - Starts an ability by pushing an entry to `unit.activeAbilities`.
    - Calls `doCardEffect` each tick while it is active.
    - Uses `getAbilityStates` to apply special states.

### 8. Editing guidelines and checks

When **editing card behaviour**, follow this checklist:

1. **If changing durability** in a `CardDef`:
   - Confirm how many uses you want before the card goes to discard.
   - Remember that after discard, durability is reset when the card returns to the deck.
2. **If changing discard timing**:
   - Use `unit: 'rounds'` when you want discard tied to round transitions.
   - Use `unit: 'seconds'` when you want real-time cooldown-like behaviour.
   - Ensure players can still meaningfully draw the card, given `MAX_HAND_SIZE` and draw rate (1 per round).
3. **If changing ability cooldown or prefire**:
   - Distinguish between:
     - **Card cycle**: durability + discardDuration (deck/hand/discard).
     - **Ability cooldown**: `cooldownTime` and `prefireTime` on the ability.
   - Avoid making both the cooldown and discard window so long that the card effectively never appears.
4. **If changing resource cost**:
   - Abilities check resources via `canAffordAbility` / `spendAbilityCost`.
   - Make sure the owning unit actually has the required resource attached.
5. **If debugging draw/discard issues**:
   - Inspect these areas in `GameEngine.ts`:
     - `CardInstance` interface
     - `onCardUsed`
     - `moveToDiscard`
     - `processDiscardSeconds`
     - `handleRoundEnd`
   - Confirm that:
     - The card’s `abilityId` matches the ability you are using.
     - The `CardDef` is correctly registered and returned by `getCardDef`.

### 9. Relationship to other skills

- For the **full workflow of creating a new ability/card**, use the `creating-an-ability` skill.
- Use **this** skill specifically to reason about:
  - How a card’s `durability` and `discardDuration` interact with the engine.
  - How abilities run on units versus how cards cycle through deck/hand/discard.

## Examples

- **Example 1: Make a card that can be spammed but occasionally disappears**
  - Set `durability: 3` and `discardDuration: { duration: 0.5, unit: 'seconds' }`.
  - Result: card can be used three times from hand before going to discard, then returns to deck about half a second later.

- **Example 2: High-impact card that feels special**
  - Set `durability: 1` and `discardDuration: { duration: 3, unit: 'rounds' }`.
  - Result: each use puts the card into discard for three full rounds before it can re-enter the deck and be drawn again.

