# Gravity Core (Ability group **09**)

This folder is **`09_gravity_core`**: all player-facing Gravity skill cards use **4-digit ids starting with `09`** (`AbilityGroupId.Gravity` in `card_defs/AbilityGroupId.ts`). The narrative name is “Gravity Core” or “gravity skills.”

For long-form design history and locked decisions, see `docs/gravity-tree-brainstorm.md`.

## Player profile

Gravity Core is for players who want to **choreograph the battlefield** — repositioning enemies, applying CC, and punishing positioning mistakes with follow-up damage. The fantasy is spatial power: “I moved that enemy exactly where I wanted, and now it’s paying for it.” Value scales with terrain and other units on the field, not just flat numbers.

Gravity is a **control kit**, not a primary damage kit. Damage exists to punish the mistakes the kit creates (collisions, CC windows). It works with any primary weapon — Shield (hold ground, peel), Rock (line up throws), Stick (pull stragglers into melee range).

## Ability spine

The tree ships three abilities on a simple spine (Tier 3 upgrades are out of scope for v1):

| Card id | Ability | Role |
|---------|---------|------|
| **0901** | **Gravity Locus** | Non-interrupting **nudge** field at a point; Push/Pull via Ability Mode |
| **0902** | **Force Push** | Directional **launch** with unit/wall collision damage (only ability with collision damage) |
| **0903** | **Gravity Inversion** | **Lift** + hard CC + slam; mode changes horizontal landing only |

All three share the same **Ability Mode** toggle (`'push' | 'pull'`), set per cast during targeting — distinct from static research `AbilityModifier` tweaks.

## Mechanics in play

| Theme | Role in Gravity Core |
|--------|----------------------|
| **Grazing resource** | Proximity to enemy units and projectiles fills **gravity** continuously; projectiles pay out more than units. Constants in `gravityConstants.ts`; logic in `resources/Gravity.ts` via `Resource.onTick`. |
| **Ability Mode** | Per-cast Push ↔ Pull on abilities that declare `abilityModes`. Behaviours read mode from the **order/active ability**, never live UI state — deterministic for multiplayer replay. |
| **Nudge** | Subtle reposition via `applyNudgeToUnit` — **not CC**: no path clear, no ability interrupt, no CC-armour gate. Visual: faint `NudgeArrowEffectDef`, **no motion streak**. |
| **Launch / knockback** | Force Push uses directional knockback with opt-in unit collision + terrain bounce events. Visual: motion streak on launches; clash spark vs wall dust/crack for collision types. |
| **Lift** | Gravity Inversion applies `LiftedBuff` (hard CC, suspended airborne) then slam damage + `unit_slam_landed` event. Visual: `LiftColumnEffectDef` telegraph; violet `howlShockwaveEffectDef` on landing. |

### Push vs Pull semantics (reference point per ability)

- **Gravity Locus**: reference point is the locus — Push nudges outward, Pull nudges inward (enemies stop at the locus, never overshoot).
- **Force Push**: reference point is the caster — Push flings away; Pull flings **toward and past** the caster (directional launch, not distance-clamped pull).
- **Gravity Inversion**: lift timing and damage identical; Push slams straight down, Pull sets `horizontalTarget` at the caster’s feet.

## Resources

### Gravity (`resourceId: 'gravity'`)

- **Role**: Gravity’s combat resource (0–100, violet `#a855f7`, `Atom` icon).
- **Gain**: Touhou-style **grazing** — nearest living enemy unit and nearest enemy projectile by raw edge-to-edge distance every tick; lerp from max rate at `GRAVITY_GRAZE_MIN_DISTANCE` down to floor `GRAVITY_MIN_PER_ROUND` at `GRAVITY_GRAZE_MAX_DISTANCE`; `ratePerRound = max(rateUnits, rateProjectiles, GRAVITY_MIN_PER_ROUND)`.
- **Numbers**: All tuning in `09_gravity_core/gravityConstants.ts` — single source of truth for cards and `Gravity` resource class.

## Visual language (violet `#a855f7`)

- **Nudge vs launch**: nudges use understated `NudgeArrowEffectDef` (ghost arrow, no streak); launches use motion streak — the absent streak signals “not real CC.”
- **Locus field**: `GravityFieldEffectDef` — inward spirals for Pull, outward rings/cracks for Push.
- **Collisions** (Force Push only): `CollisionClashEffectDef` for unit-vs-unit; `TerrainImpactEffectDef` for wall hits.
- **Lift**: `LiftColumnEffectDef` under lifted units for the full float window.

## How to create or change Gravity Core skills

1. **Read this file** when touching any **`09xx`** card, shared Gravity constants, or Gravity-related engine hooks.
2. **Ids**: New cards use `09` + two-digit index; register the ability in `abilities/AbilityRegistry.ts` and the card in `card_defs/index.ts` (see `card_defs/SKILL.md`).
3. **Tuning shared by the whole tree**: prefer `09_gravity_core/gravityConstants.ts` instead of magic numbers in a single ability file.
4. **Co-locate** the card under `09_gravity_core/####_Name/####Ability.ts`.
5. **Tests**: add co-located `####Ability.test.ts`; use the **ability-tests** skill for scenario coverage.

## Where Gravity Core diverges from common patterns

- **Collision damage is event-authored**: Force Push listens to `forced_movement_unit_collision` / `forced_movement_terrain_collision` — the engine emits events only when the cast opts in; other knockbacks never deal collision damage implicitly.
- **Nudge is not knockback**: use `applyNudgeToUnit`, not a smaller knockback tier.
- **Pull at locus vs Force Pull**: locus pull clamps at the reference point; Force Push Pull is a directional fling toward/past the caster.

## Pattern for other skill trees

When adding a new `AbilityGroupId` line:

- Use folder name **`NN_short_name/`** (two-digit group + short slug).
- Add **`<Name>Core.md`** inside that folder (this file is the template for **09** / Gravity).
- Link the doc from `card_defs/SKILL.md` under **Skill trees and `AbilityGroupId`**.
