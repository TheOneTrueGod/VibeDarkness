---
name: working-with-hitboxes
description: Guides using and creating hitbox classes for ability hit detection in Minion Battles. Use when an ability needs collision/overlap detection against enemy units, or when adding a new hitbox shape.
---

# Working with Hitboxes

Hitboxes live in `app/js/games/minion_battles/hitboxes/` and provide reusable hit-detection and targeting-preview logic for abilities. **Combat hit lists must come from a hitbox** (`getUnitsInHitbox` / `resolveHitbox`) or a helper that wraps one (e.g. `damageEnemiesInCircle` in `abilities/targetHelpers.ts`). Do not hand-roll enemy radius / capsule loops for combat damage or CC.

## Combat hit discovery (default path)

1. Geometry via `CircleHitbox`, `ThickLineHitbox`, or `resolveHitbox` (`abilities/hitboxDef.ts`).
2. Post-geometry filter runs inside that pipeline (`filterCombatHitTargets` in `abilities/combatTargetFilter.ts`): drops inactive / dead / spawning units and, **by default**, units with active iFrames.
3. Apply damage/CC via `tryDamageOrBlock` / knockback helpers (those also refuse iframe targets by default).

**Caller does not need a separate `hasIFrames` check** for standard combat hits collected this way.

| Concern | Who handles it |
|---------|----------------|
| `active` / alive / spawning / enemy team / self-exclusion | Hitbox getters (and filter) |
| Combat iFrames | Hitbox pipeline by default (`respectIFrames: true`) |
| Multi-tick `hitTargetIds` / already-hit sets | Caller (ability note) |
| Damage / block | Caller — `tryDamageOrBlock` (or helpers that call it) |

**Environment damage** (thorn enter/land/DoT, day-light, wall-unstick, etc.) is **outside** this pipeline — call `takeDamage` / tile logic directly; do **not** route env HP loss through hitbox combat filtering.

**True-strike (rare):** pass `respectIFrames: false` into the filter / apply helpers when a future ability must ignore iframes. No live cards use this yet — do not add it casually.

## Available Hitbox Types

### CircleHitbox

Disk AoE around a point. Prefer this (or `damageEnemiesInCircle`) for circle combat impacts.

**`getUnitsInHitbox`** — Units whose collision circle overlaps the disk (`dist ≤ aoeRadius + unit.radius`); combat filter applied at the end. Preview/lock-on for ground AoE (`CircleAoEHitboxSpec`) uses the same overlap.

### ThickLineHitbox

A line segment with thickness. Use for melee swings, lunges, and linear AoE. Import from the `hitboxes/` barrel export.

**`getUnitsInHitbox`** — Units whose circle overlaps the capsule; combat filter applied at the end.

**`renderTargetingPreview`** — Thick rectangle from caster to clamped mouse for the targeting overlay.

**Line / capsule previews** — Support clear **wind-up timing** in `renderActivePreview` (e.g. aim lines that tighten, `ChargeAttack`’s shrinking capsule). **Do not** replace that pattern with the generic area telegraph.

**Non-line enemy hit previews** — For **cone, quad, circle, or other filled region** in `renderActivePreview`, use `abilities/previewHelpers.ts` (`drawEnemyConeHitboxTelegraph`, `drawEnemyConvexQuadHitboxTelegraph`, etc.). If the shape does not map cleanly, confirm the telegraph with the player.

### `resolveHitbox`

Declarative `HitboxDef` dispatcher in `abilities/hitboxDef.ts` (circle / meleeLine / custom). Results are combat-filtered (custom shapes get an explicit filter pass). Prefer this when CastBehaviours own the shape spec.

## Usage Patterns

See existing abilities under `card_defs/` for reference:

- **One-shot melee** (e.g. Punch, Swing Bat): Query once at `prefireTime`, sort by distance, hit the closest.
- **Multi-tick lunge** (e.g. Dark Wolf Bite, Boar Charge): Query each tick; track already-hit IDs in `abilityNote`.
- **Circle impact** (e.g. Thornbinder, Thorn Stomp): `damageEnemiesInCircle` → `CircleHitbox.getUnitsInHitbox`.

## Adding a New Hitbox Type

1. Create `hitboxes/YourHitbox.ts` extending `Hitbox`.
2. Implement static `getUnitsInHitbox(engine, caster, ...args): Unit[]`. End with `filterCombatHitTargets` (same as circle/line) unless the type is explicitly non-combat.
3. Optionally implement static `renderTargetingPreview(...)`.
4. Re-export from `hitboxes/index.ts`.
