---
name: working-with-hitboxes
description: Guides using and creating hitbox classes for ability hit detection in Minion Battles. Use when an ability needs collision/overlap detection against enemy units, or when adding a new hitbox shape.
---

# Working with Hitboxes

Hitboxes live in `app/js/games/minion_battles/hitboxes/` and provide reusable hit-detection and targeting-preview logic for abilities. Always prefer a hitbox class over inlining collision math in an ability file.

## Available Hitbox Types

### ThickLineHitbox

A line segment with thickness. Use for melee swings, lunges, and any linear area-of-effect.

Import from `hitboxes/` (barrel) or `hitboxes/ThickLineHitbox`:

```ts
import { ThickLineHitbox } from '../../hitboxes';
```

#### `getUnitsInHitbox(engine, caster, x0, y0, x1, y1, lineThickness): Unit[]`

Returns all **active, alive enemy** units whose circle (`unit.x`, `unit.y`, `unit.radius`) overlaps the capsule defined by segment `(x0,y0)-(x1,y1)` with the given `lineThickness`. Overlap test: `pointToSegmentDistance <= unit.radius + lineThickness`.

**Handled internally** (you do NOT need to check these):
- `unit.active` and `unit.isAlive()`
- `areEnemies(caster.teamId, unit.teamId)`
- `unit.id === caster.id` (self-exclusion)

**NOT handled** (check these yourself after the call):
- `unit.hasIFrames(eng.gameTime)` — invincibility frames
- `hitTargetIds` tracking — for multi-tick abilities that should only hit each unit once
- Damage dealing / block checks — call `tryDamageOrBlock` on each hit unit

#### `renderTargetingPreview(gr, caster, mouseWorld, maxRange, lineThickness): void`

Draws a thick rectangle from caster to the clamped mouse position for the targeting overlay. Call from `renderTargetingPreview` in the ability.

## Usage Patterns

### One-shot melee (Punch, Swing Bat)

Query the hitbox once at `prefireTime`, sort by distance, hit the closest:

```ts
const hitUnits = ThickLineHitbox.getUnitsInHitbox(eng, caster, x0, y0, x1, y1, LINE_THICKNESS);
if (hitUnits.length === 0) return;
hitUnits.sort((a, b) => distSq(a, origin) - distSq(b, origin));
const target = hitUnits[0]!;
if (target.hasIFrames(eng.gameTime)) return;
tryDamageOrBlock(target, { ... });
```

### Multi-tick lunge (Dark Wolf Bite, Boar Charge)

Query each tick during the lunge phase; track already-hit IDs in `abilityNote`:

```ts
const hitUnits = ThickLineHitbox.getUnitsInHitbox(eng, caster, x0, y0, x1, y1, caster.radius);
for (const unit of hitUnits) {
    if (note.hitTargetIds.includes(unit.id)) continue;
    if (unit.hasIFrames(eng.gameTime)) continue;
    const dealt = tryDamageOrBlock(unit, { ... });
    if (!dealt) return;
    note.hitTargetIds.push(unit.id);
}
```

## Adding a New Hitbox Type

1. Create `hitboxes/YourHitbox.ts` extending `Hitbox`.
2. Implement a static `getUnitsInHitbox(engine, caster, ...args): Unit[]` method. Follow the same conventions: filter by active, alive, enemy, exclude self.
3. Optionally implement a static `renderTargetingPreview(...)` for the targeting overlay.
4. Re-export from `hitboxes/index.ts`.
