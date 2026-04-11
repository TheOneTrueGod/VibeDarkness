---
name: working-with-hitboxes
description: Guides using and creating hitbox classes for ability hit detection in Minion Battles. Use when an ability needs collision/overlap detection against enemy units, or when adding a new hitbox shape.
---

# Working with Hitboxes

Hitboxes live in `app/js/games/minion_battles/hitboxes/` and provide reusable hit-detection and targeting-preview logic for abilities. Always prefer a hitbox class over inlining collision math in an ability file.

## Available Hitbox Types

### ThickLineHitbox

A line segment with thickness. Use for melee swings, lunges, and any linear area-of-effect. Import from the `hitboxes/` barrel export.

**`getUnitsInHitbox`** — Returns all active, alive enemy units whose circle overlaps the capsule defined by a line segment with thickness.

Handled internally (you do NOT need to check these):
- `unit.active` and `unit.isAlive()`
- `areEnemies(caster.teamId, unit.teamId)`
- Self-exclusion

NOT handled (check these yourself after the call):
- `unit.hasIFrames(eng.gameTime)` — invincibility frames
- `hitTargetIds` tracking for multi-tick abilities
- Damage dealing / block checks — call `tryDamageOrBlock` on each hit unit

**`renderTargetingPreview`** — Draws a thick rectangle from caster to the clamped mouse position for the targeting overlay.

## Usage Patterns

See existing abilities for reference implementations:

- **One-shot melee** (e.g. Punch, Swing Bat): Query the hitbox once at `prefireTime`, sort by distance, hit the closest.
- **Multi-tick lunge** (e.g. Dark Wolf Bite, Boar Charge): Query each tick during the lunge phase; track already-hit IDs in `abilityNote`.

## Adding a New Hitbox Type

1. Create `hitboxes/YourHitbox.ts` extending `Hitbox`.
2. Implement a static `getUnitsInHitbox(engine, caster, ...args): Unit[]` method. Follow the same conventions: filter by active, alive, enemy, exclude self.
3. Optionally implement a static `renderTargetingPreview(...)` for the targeting overlay.
4. Re-export from `hitboxes/index.ts`.
