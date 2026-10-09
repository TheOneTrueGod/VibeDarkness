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

**`renderInvalidPreview`** — Shown instead of the normal preview when the select step's `validatePick` rejects the aim. The default is a grey cross at the aim point; `TileAreaHitboxSpec` greys its cells and draws the cross on the anchor tile. It must not clear the graphics, because ghost previews share a layer.

**Line / capsule previews** — Support clear **wind-up timing** in `renderActivePreview` (e.g. aim lines that tighten, `ChargeAttack`’s shrinking capsule). **Do not** replace that pattern with the generic area telegraph.

**Non-line enemy hit previews** — For **cone, quad, circle, or other filled region** in `renderActivePreview`, use `abilities/previewHelpers.ts` (`drawEnemyConeHitboxTelegraph`, `drawEnemyConvexQuadHitboxTelegraph`, etc.). If the shape does not map cleanly, confirm the telegraph with the player.

### TileAreaHitboxSpec

Ground-only select for tile areas (`hitboxes/TileAreaHitboxSpec.ts`). It never locks on to a unit and never hits; the committed order is the pixel. The ability derives its cells from that pixel with `resolveCells`, the same call the preview uses.

- **Anchor:** `{ kind: 'chebyshev', maxTileOffset }` (aim clamped around the caster) or `{ kind: 'adjacentCardinal' }` (the caster-adjacent tile on the dominant aim axis; null when aimed at the caster).
- **Shape:** `tileShapes.single()`, `tileShapes.square(half)`, `tileShapes.plus()` (centre first), or any list of `{ dCol, dRow }`.
- **Style:** `style` takes a `TELEGRAPH_STYLES` palette (`abilities/telegraphStyles.ts`, `danger` or `earth`). `gridLines: true` strokes the internal cell boundaries. `directionArrow: true` (adjacentCardinal only) draws the arrow from the caster toward the anchor.
- **Preview:** `drawTileAreaTelegraph` (`abilities/previewHelpers.ts`) fills each cell and strokes only the outer outline of the union, so a plus reads as one perimeter.
- **Validity:** `resolveAnchor` and `resolveCells` are the geometry for `validatePick` and effects. Use `abilities/tileAreaHelpers.ts` helpers for the rest (`snapSquareTileAreaCenter`, `getUnitsInTiles`, `getTileAreaEdges`).

Do not add a second tile-area hitbox. Add a shape preset or an option instead.

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
