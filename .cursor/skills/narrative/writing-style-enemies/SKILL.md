---
name: writing-style-enemies
description: >-
  Writing style for Minion Battles (and related) enemies: names, short descriptions,
  factions, thematic tone, and creature types (dark_creature vs beast). Use when
  adding or editing enemy-facing copy or bestiary-style text; read STYLE.md. For
  code, optional creatureType on unit defs must match these categories when set.
---

# Writing style — enemies

**Read** `STYLE.md` here before changing enemy names, blurbs, faction text, or mission introductions that describe foes.

Cross-check **non-negotiables** in `lore-primer/LORE.md` for `[Canon]` sections. Do not enumerate every enemy in `STYLE.md`; keep **patterns and factions**, and point to game definitions for examples.

**Code link:** enemy **`creatureType`** (`CreatureType` in `game/units/unit_defs/unitDef.ts`) is optional but should be set for each enemy when the category is clear; it hints narrative and death/damage presentation. If unclear, **ask the user** before locking. Purple dissolution on death is defined once via **`darkCreatureDissolutionDeathEffect`** in `game/deathEffects/darkCreatureDissolutionDef.ts`.
