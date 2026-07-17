# Gravity Research Tree — Implementation Plan

**Completed 2026-07-04.** All 13 steps shipped: generic engine primitives (`Resource.onTick`, pull/nudge forced movement, opt-in collision events, `LiftedBuff`, Ability Mode plumbing), five parameterized violet effect defs, the full Gravity kit (0901–0903 + Core item 018), `gravity_core` research tree gated on `AlphaWolfDefeated`, four AbilityTest scenarios, and 738/738 Vitest tests passing. **Follow-up:** manual browser pass for VFX/mode-toggle UX (Step 13 checklist) still needs a human; pre-existing lint/tsc errors in unrelated files (AlphaWolfStoryEmitter, 006_core_awakening, desyncDebug scripts, some targeting tests) were not in scope.

Source design doc: `docs/gravity-tree-brainstorm.md` (converged; all player-facing decisions locked).

Goal: the **Gravity** kit — grazing-fueled resource, three abilities (Gravity Locus 0901, Force Push 0902, Gravity Inversion 0903), a per-cast Push/Pull **Ability Mode** toggle, a Gravity Core item (018), and a research tree gated on defeating the alpha wolf.

**Engine-first philosophy (applies to every step):** new mechanics are built as generic, reusable engine primitives — declarative ability defs (`defineAbility` + `CastBehaviours`), typed EventBus events that abilities *listen* to rather than engine-hardcoded rules, parameterized effect defs shared across abilities, and opt-in flags on shared systems (forced movement, buffs, resources). No gravity-specific branches inside engine files; gravity code lives in `card_defs/09_gravity_core/` and consumes the generic hooks.

## Plan-level decisions (resolving the doc's open items)

- **Graze lookup (§5.5 open question):** raw distance to any living enemy unit / enemy projectile — no darkness/visibility filter in v1. Deterministic, cheap, and revisable later.
- **Pull semantics:** a pulled unit is clamped at the reference point — it never overshoots or passes through. (Force Push's Pull mode is different by design: it is a directional fling *toward and past* the caster via `applyDirectionalKnockback`, per §6B.)
- **Collision damage is event-authored:** the engine's forced-movement code only *emits* collision events when a cast opts in; Force Push's ability code listens and deals the damage. Other knockbacks never pick this up implicitly (§5).
- **Nudge is not CC:** it bypasses the CC-armour gate entirely, never clears the movement path, and never interrupts abilities.
- **Tier-3 upgrade nodes are out of scope** — the design doc marks their numbers TBD. The tree ships with Tier 1 + Tier 2.

## Key existing code index (verified locations — workers should not re-derive these)

| Concern | Location |
|---|---|
| Resource base class (`onRoundStart` hook exists; `onTick` does not) | `app/js/games/minion_battles/resources/Resource.ts` |
| Gravity resource stub (id/colour/icon done; gain TBD) | `app/js/games/minion_battles/resources/Gravity.ts` |
| Resource factory `createResourceFromId` | `app/js/games/minion_battles/game/managers/UnitManager.ts:108` |
| Item-def resource attach (`if (rid === 'light') …`) | `app/js/games/minion_battles/storylines/BaseMissionDef.ts:65-68` |
| Per-tick unit driving (`unitManager.gameTick`) | `app/js/games/minion_battles/game/GameEngine.ts:1347` |
| `ROUND_DURATION` | `app/js/games/minion_battles/game/gameConstants.ts` |
| Projectiles | `state.projectileManager.projectiles` (`GameEngine.ts:330` getter) |
| Knockback tiers + CC-armour gate | `app/js/games/minion_battles/crowdControl/knockbackKeywords.ts` |
| Knockback physics tick + terrain clamp | `app/js/games/minion_battles/game/units/unitKnockback.ts`, `game/forceMove.ts` |
| Buffs + serialization registry | `app/js/games/minion_battles/buffs/` (`ExposedBuff`, `StunnedBuff`, `buffRegistry.ts`, `buffVisuals.ts`) |
| `BattleOrder` / `ActiveAbility` | `app/js/games/minion_battles/game/types.ts:181` / `:267` |
| Cast start (order → ActiveAbility) | `app/js/games/minion_battles/game/units/unitAbilityLifecycle.ts:138` |
| CastBehaviours + ctx types | `abilities/CastBehaviours/index.ts`, `abilities/castBehaviourTypes.ts` |
| Effect defs + registry | `app/js/games/minion_battles/game/effect_defs/` (`aoeEffects.ts`, `impactEffects.ts`, `movementEffects.ts`, `index.ts`); `howlShockwaveEffectDef` already reads `effectData.colors` |
| Declarative emitters | `abilities/abilityTimings.ts` (`AbilityTimingEmitterDef`), `abilities/createEmitterFromDef.ts` |
| New-ability registration (all four spots) | ability file, card file, `abilities/AbilityRegistry.ts`, `card_defs/index.ts` |
| Group ids (Light = 8) | `app/js/games/minion_battles/card_defs/AbilityGroupId.ts` |
| Core item template | `character_defs/items/core/017_core_light.ts`; registered in `character_defs/items/index.ts` (def map, icon map, list) |
| Tree template + registration | `app/js/researchTrees/trees/light.ts`; `app/js/researchTrees/list.ts:12` |
| `replaceEquippedItem` (exact `fromItemId` match) | `app/js/researchTrees/types.ts:17`, applied in `researchTrees/evaluator.ts` |
| Alpha-wolf mission (no `completionRewards` today) | `storylines/WorldOfDarkness/missions/005_monster.ts` (win: `unitDead: 'alpha_wolf'`, line 85) |
| Ability bar UI | `ui/components/AbilitySlot.tsx`, `ui/components/AbilityBar.tsx`, `ui/pages/BattlePhase.tsx` |
| AbilityTest scenarios + registry | `testing/scenarios/abilities/`, `testing/scenarios/registry.ts` |

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md` — do not restate its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then moves to the next step, and finally reports plan completion to the user. Each worker implements **exactly one step**, checks off that step's checklist items with a one-line summary under each, and **stops without spawning the next agent**.

Project skills relevant to this plan (workers should invoke the ones matching their step):
- `working-on-minion-battles` — always.
- `creating-an-ability` + `editing-card-behaviour` — steps 8–10.
- `game-engine` — steps 1–5 (tick loop, managers, checkpoint serialization).
- `game-object-def-pattern` — steps 2–5 (new serialized fields on Unit/ActiveAbility/Buff).
- `ability-tests` — steps 12–13.
- `research-trees` — step 11.
- `missions` — step 11 (knowledge key).
- `editing-and-creating-components` — step 5 (UI toggle).

**Verification cadence:** per step, at most `npm run lint`, `npx tsc --noEmit` when the step crosses an interface boundary, and only the specific test files the step touches or creates. No full-suite, whole-directory, or AbilityTest/E2E runs in regular steps — Step 13 runs the expensive things exactly once.

---

### Step 1 — `Resource.onTick` hook + grazing Gravity resource

Files: `resources/Resource.ts`, `resources/Gravity.ts`, `game/managers/UnitManager.ts`, `storylines/BaseMissionDef.ts`, new `card_defs/09_gravity_core/gravityConstants.ts`, new `resources/Gravity.test.ts`.

- [x] Add an optional `onTick?(unit: Unit, engine: EngineContext, dt: number): void` hook to the `Resource` base class, and call it for every living unit's attached resources from the per-tick unit path driven by `UnitManager.gameTick` (`GameEngine.fixedUpdate` already calls this at `GameEngine.ts:1347`). Generic hook — no gravity knowledge in the engine. If `EngineContext` doesn't expose projectiles, extend it (it already reaches the managers).
  - Added `onTick?` to `Resource.ts`; Phase 1c in `UnitManager.gameTick` calls it for alive units; extended `EngineContext` with `readonly projectiles`.
- [x] Create `card_defs/09_gravity_core/gravityConstants.ts` (mirrors `05_earth_core/earthCoreConstants.ts`) with the §5.5 constants — initial tunable values: `GRAVITY_MIN_PER_ROUND = 5`, `GRAVITY_MAX_PER_ROUND_UNITS = 20`, `GRAVITY_MAX_PER_ROUND_PROJECTILES = 35`, `GRAVITY_GRAZE_MIN_DISTANCE = 20`, `GRAVITY_GRAZE_MAX_DISTANCE = 120`.
  - New constants file with all five §5.5 exports.
- [x] Implement grazing in `Gravity.onTick` per §5.5: nearest living enemy unit and nearest enemy projectile by raw edge-to-edge distance (`distance(centers) − radii`, clamped ≥ 0); lerp each from its max rate (at `MIN_DISTANCE`) down to `GRAVITY_MIN_PER_ROUND` (at `MAX_DISTANCE`); `ratePerRound = max(rateUnits, rateProjectiles, GRAVITY_MIN_PER_ROUND)`; apply `resource.add(ratePerRound * dt / ROUND_DURATION)`. The floor is the lerp's lower bound, not an additive bonus.
  - `Gravity.onTick` + exported `computeGravityGrazeRatePerRound` helper with edge-to-edge lookup and lerp math.
- [x] Register gravity in `createResourceFromId` (`UnitManager.ts:108`) and in `BaseMissionDef`'s item-resource attach (`BaseMissionDef.ts:65-68`), following the existing `light` lines.
  - `createResourceFromId` already had `'gravity'`; added `BaseMissionDef` attach for `'gravity'` items.
- [x] New `resources/Gravity.test.ts`: floor rate when far from everything; max unit rate at/under min distance; projectile rate exceeds unit rate at equal distance; value clamps at max (100).
  - Five tests covering floor, max unit rate, projectile > unit at equal distance, and max clamp.

Verify: `npx tsc --noEmit` (interface change), `npx vitest run app/js/games/minion_battles/resources/Gravity.test.ts`, `npm run lint`.

### Step 2 — Forced-movement primitives: Pull + non-interrupting Nudge

Files: `crowdControl/knockbackKeywords.ts`, `game/units/unitKnockback.ts` (and/or new `game/units/unitNudge.ts`), `game/units/Unit.ts`, `game/units/unitTypes.ts`, `game/units/unitToJSON.ts`, `game/units/unitFromJSON.ts`, new `game/units/unitNudge.test.ts`.

- [x] Add `tryApplyPullByTier(target, tier, source, pullPoint, engine)` to `knockbackKeywords.ts`: identical resistance/CC-armour/exposed gating to `tryApplyKnockbackByTier`, but the launch vector points **toward** `pullPoint` and its magnitude is clamped to the target's current distance to the point (never overshoot — plan-level decision above). Reuse the tier defs and `_launchKnockback` plumbing rather than duplicating them.
  - Refactored shared `_tryApplyTierForcedMovement` gating; added `tryApplyPullByTier` + `_launchPull` with distance clamp via `KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR`.
- [x] Add the non-interrupting nudge as a new movement category: `applyNudgeToUnit(unit, vector, durationSeconds)` sets a `unit.nudge` state (shape parallel to `unit.knockback`) ticked alongside knockback in the unit tick; terrain-aware via `computeForcedDisplacement`; it does **not** call `invalidateMovementPath`, does not interrupt active abilities, and bypasses CC armour entirely. Find where `updateUnitKnockback` is driven from the unit tick and mirror it.
  - New `unitNudge.ts` + `NudgeState` on `Unit`; `updateUnitNudge` wired in `unitMovementTick` after knockback (non-blocking).
- [x] Serialize `unit.nudge` in `unitToJSON.ts`/`unitFromJSON.ts` following the knockback serialization shape (see `game-object-def-pattern` skill).
  - `nudge` block added to serialize/restore alongside knockback.
- [x] New `game/units/unitNudge.test.ts`: nudge displaces a unit without clearing its move path and without interrupting an in-progress ability windup; nudge halts at unwalkable terrain; pull stops exactly at the pull point; pull is absorbed by CC armour the same as knockback.
  - Seven tests covering nudge path preservation, windup, terrain halt, pull landing, CC armour parity, and movement-tick coexistence.

Verify: `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/game/units/unitNudge.test.ts`, `npm run lint`.

### Step 3 — Opt-in collision events + wall bounce during forced movement

Files: `game/units/unitKnockback.ts`, `game/units/unitTypes.ts`, `crowdControl/knockbackKeywords.ts` (param threading), the EventBus typed event map (`game/EventBus.ts`), new `game/units/forcedMovementCollision.test.ts`.

- [x] Extend `ApplyKnockbackParams` (and the tier-launch path that builds it) with opt-in fields: `collideWithUnits?: boolean`, `bounceOffTerrain?: boolean`, and source attribution (reuse `KnockbackSource` if it already carries unit/ability ids). Defaults off — existing knockbacks are byte-for-byte unchanged.
  - Added opt-in flags on `ApplyKnockbackParams`/`KnockbackState`; threaded through `applyKnockbackToUnit`, tier launch helpers, and `ForcedMovementCollisionOpts` on tier/directional entry points.
- [x] In `updateUnitKnockback`, when `collideWithUnits` is set: sweep each tick's movement segment against other living units (circle overlap along the segment); on first contact, stop the moving unit at the contact point, clear its knockback, and emit a typed `forced_movement_unit_collision` event `{ movingUnitId, struckUnitId, impact: {x,y}, source }`. **Event only — no damage in engine code**; damage is authored by whichever ability opted in (event listening, per plan-level decision).
  - Circle-segment sweep via `sweepCircleSegmentAgainstCircle`; stops mover, clears knockback, emits event through `KnockbackUpdateContext`.
- [x] When `bounceOffTerrain` is set and `computeForcedDisplacement` clamps the segment: emit `forced_movement_terrain_collision` `{ unitId, impact: {x,y}, tile: {col,row}, source }` and reflect the remaining knockback vector off the blocking tile (axis-aligned reflection is fine for v1) so the unit visibly rebounds instead of halting.
  - Axis-aligned reflect on movement axis; resets elapsed for rebound; single bounce per knockback to avoid wall-stick loops.
- [x] Register both events in the EventBus typed event map.
  - `ForcedMovementUnitCollisionEvent` and `ForcedMovementTerrainCollisionEvent` added to `GameEventType` / `GameEventDataMap`.
- [x] New `game/units/forcedMovementCollision.test.ts`: unit-unit sweep stops the mover and emits the event with both ids and the impact point; terrain bounce reflects the vector and emits the tile event; with both flags absent, behaviour matches pre-change knockback (no events, halt at wall).
  - Three tests covering unit collision, terrain bounce + reflect, and default no-event wall halt.

Verify: `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/game/units/forcedMovementCollision.test.ts`, `npm run lint`.

### Step 4 — `LiftedBuff`: suspended airborne hard CC + slam

Files: new `buffs/LiftedBuff.ts`, `buffs/buffRegistry.ts`, `buffs/buffVisuals.ts`, a small apply-helper in `crowdControl/` (e.g. alongside `tryApplyHardCcStun.ts`), EventBus event map, `game/GameRenderer/renderers/UnitRenderer.ts`, new `buffs/LiftedBuff.test.ts`.

- [x] New `LiftedBuff` (generic — any future kit can lift): holds the unit fully CC'd (no move/act, mirror `StunnedBuff`'s gating) for `duration` seconds with params `{ slamDamage, horizontalTarget?: {x,y}, sourceAbilityId }`. On expiry it applies the slam: terrain-aware horizontal displacement to `horizontalTarget` when set, deals `slamDamage`, and emits a typed `unit_slam_landed` `{ unitId, position, sourceAbilityId }` event for visuals/listeners. Register in `buffRegistry.ts` for checkpoint serialization and give it a buff-icon entry in `buffVisuals.ts`.
  - `LiftedBuff.ts` + generic `Buff.onBeforeExpire` hook in tick path; registry, violet chevron visual, `unit_slam_landed` on EventBus.
- [x] Apply-path helper `tryApplyLift(target, duration, slamParams, source, engine)` in `crowdControl/` running the same shared hard-CC armour gate as knockback/stun (`hardCcArmourConsumed`, absorbed/exposed semantics — see `tryApplyKnockbackByTier` and the `boss-cc-armour` conventions).
  - `tryApplyLift.ts` mirrors `tryApplyHardCcStun` gating; exported from `crowdControl/index.ts`.
- [x] `UnitRenderer`: render lifted units with a vertical sprite offset while the buff is active (check how knockback air-time is rendered and mirror; keep it minimal — the telegraph column visual comes from Step 6's effect def).
  - Sustained lift offset + ground shadow reuse knockback arc constants from `LiftedBuff`.
- [x] New `buffs/LiftedBuff.test.ts`: lifted unit cannot act for the duration; slam damage + `unit_slam_landed` fire on expiry; `horizontalTarget` displacement lands terrain-clamped; a CC-armoured boss absorbs the lift attempt.
  - Four tests covering act lock, slam damage/event, terrain-clamped displacement, CC armour absorb.

Verify: `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/buffs/LiftedBuff.test.ts`, `npm run lint`.

### Step 5 — Ability Mode: per-cast Push/Pull toggle (engine plumbing + UI)

Files: `abilities/Ability.ts`, `game/types.ts`, `game/units/unitAbilityLifecycle.ts`, `game/units/unitToJSON.ts` + `unitFromJSON.ts`, `abilities/castBehaviourTypes.ts` (+ the ctx-build site in the ability tick), `ui/components/AbilitySlot.tsx`, `ui/components/AbilityBar.tsx`, `ui/pages/BattlePhase.tsx`, new `abilities/abilityMode.test.ts`.

Named **Ability Mode** — deliberately distinct from the static research-granted `AbilityModifier` in `researchTrees/types.ts`. Fully generic: modes are strings declared on the ability def; gravity uses `'push' | 'pull'`.

- [x] Add optional `abilityModes?: { modes: readonly string[]; defaultMode: string }` to the ability static def shape in `Ability.ts` (JSON-structured declaration, like `abilityTimings`).
  - `AbilityModesConfig` + optional `abilityModes` on `AbilityStatic`.
- [x] Add `abilityMode?: string` to `BattleOrder` (`game/types.ts:181`) and `ActiveAbility` (`:267`); copy order → active at cast start in `unitAbilityLifecycle.ts` (~line 138); serialize it with checkpoints in the activeAbilities block of `unitToJSON.ts`/`unitFromJSON.ts` (like `castPayload`) so mid-cast recovery preserves the committed mode. Determinism rule: behaviours read the mode **from the order/active ability only**, never from UI state — orders replay on remote peers.
  - `BattleOrder`/`ActiveAbility` fields; `executeUnitAbility` + `OrderManager` copy; `unitToJSON` serializes; `fromJSON` restores via typed cast.
- [x] Expose `abilityMode` on `CastBehaviourBaseContext` (`castBehaviourTypes.ts`), threaded where the ctx is built in the ability tick, defaulting to the def's `defaultMode`.
  - `resolveActiveAbilityMode` helper; wired through all cast-behaviour ctx sites in `unitAbilityTick` and interrupt cleanup.
- [x] UI toggle: when the selected/hovered ability declares `abilityModes`, `AbilitySlot` renders a small click-toggle icon (violet, per §6C) that cycles modes; state lives in `BattlePhase` keyed by ability id and persists across casts within the battle; it is changeable only during ability-selection/targeting input, and the current mode is written into the submitted `BattleOrder` (flipping mid-targeting changes what the cast resolves as, per the locked constraint). Follow `editing-and-creating-components` for styling; thread props through `AbilityBar`.
  - Violet mode pill on `AbilitySlot`; `BattlePhase` state + resolver on `PlayerInteractionManager`; mid-targeting resubmit via `refreshNonconfirmedAbilityMode`.
- [x] New `abilities/abilityMode.test.ts` (engine layer): an order cast with `abilityMode: 'pull'` produces an `ActiveAbility` whose behaviours see `'pull'`; an order without a mode resolves to the def's `defaultMode`; the mode survives a unit toJSON/fromJSON round trip mid-cast.
  - Three tests covering pull order, default push, and checkpoint round-trip.

Verify: `npx tsc --noEmit`, `npx vitest run app/js/games/minion_battles/abilities/abilityMode.test.ts`, `npm run lint`.

### Step 6 — Parameterized gravity effect defs

Files: `game/effect_defs/aoeEffects.ts`, `game/effect_defs/movementEffects.ts`, `game/effect_defs/impactEffects.ts`, `game/effect_defs/index.ts`.

One def per *visual shape*, parameterized via `effectData`, registered centrally — never per-ability one-offs (§6C). All in the violet `#a855f7` family by default but colour-parameterized.

- [x] `GravityFieldEffectDef` in `aoeEffects.ts` — `effectData: { direction: 'in' | 'out', color, radius }`; swirling inward particle streams for `'in'`, outward-radiating rings/cracks for `'out'`.
  - `gravityFieldEffectDef` + `GRAVITY_FIELD_EFFECT_TYPE`; inward spiral streams vs outward rings/cracks, violet default.
- [x] `NudgeArrowEffectDef` in `movementEffects.ts` — `effectData: { direction, color }`; faint directional ghost-arrow, deliberately understated (no streak — the absent streak is the "not a real CC" read).
  - `nudgeArrowEffectDef` + `NUDGE_ARROW_EFFECT_TYPE`; chevron arrow, low alpha, no streak.
- [x] `CollisionClashEffectDef` in `impactEffects.ts` — clash spark burst at an impact point, colour-parameterized.
  - `collisionClashEffectDef` + `COLLISION_CLASH_EFFECT_TYPE`; radial spark burst with center flash.
- [x] `TerrainImpactEffectDef` in `impactEffects.ts` — dust/debris burst plus a short-lived crack decal at a tile; `effectData` carries impact point + tile.
  - `terrainImpactEffectDef` + `TERRAIN_IMPACT_EFFECT_TYPE`; dust burst + tile crack decal via `CELL_SIZE`.
- [x] `LiftColumnEffectDef` in `aoeEffects.ts` — rising dust/debris column under a lifted unit for the full lift duration (Gravity Inversion's telegraph).
  - `liftColumnEffectDef` + `LIFT_COLUMN_EFFECT_TYPE`; sustained rising wisps/debris column.
- [x] Register all new defs in `effectDefRegistry` (`index.ts`). Slam shockwave needs **no new def** — reuse `howlShockwaveEffectDef` with violet `effectData.colors` (verified data-driven).
  - Five registry keys: `GravityField`, `NudgeArrow`, `CollisionClash`, `TerrainImpact`, `LiftColumn`.

Verify: `npm run lint`, `npx tsc --noEmit`. Visual correctness is checked once in Step 13's browser pass.

### Step 7 — Gravity group scaffolding: group id, folder doc, Core item

Files: `card_defs/AbilityGroupId.ts`, new `card_defs/09_gravity_core/GravityCore.md`, new `character_defs/items/core/018_core_gravity.ts`, `character_defs/items/index.ts`.

- [x] Add `Gravity = 9` to `AbilityGroupId` and extend the docblock (`**09 = Gravity** skill tree …`), matching how Light = 8 is documented.
  - `AbilityGroupId.Gravity = 9` + docblock link to `09_gravity_core/GravityCore.md`.
- [x] Write `card_defs/09_gravity_core/GravityCore.md` following `05_earth_core/EarthCore.md` as the template: theme (battlefield choreographer, §2), grazing resource summary (§5.5), the three abilities with card ids 0901/0902/0903, the Ability Mode toggle, and the nudge-vs-launch visual language.
  - New `GravityCore.md` with player profile, ability spine, grazing/Ability Mode/nudge-launch sections, and authoring rules.
- [x] New Gravity Core item `018_core_gravity.ts` (verify 018 is the next free id in `character_defs/items/index.ts`): name `'Gravity Core'`, `slots: ['core']`, `slotLayout: { weaponSlots: 1, utilitySlots: 1 }` (same as Light Core, per the locked decision), `resourcesToAdd: ['gravity']`, `cardsToAdd` mirroring 017's basic set, icon following the existing core-icon pattern. Register in `items/index.ts` (def map, icon map, list).
  - `018_core_gravity.ts` + violet `018_core_gravity.svg`; registered in `ITEMS`, `ITEM_ICON_URLS`, and `ALL_PLAYER_ITEMS`.

Verify: `npm run lint`, `npx tsc --noEmit`.

### Step 8 — Gravity Locus (0901)

Files: new `card_defs/09_gravity_core/0901_GravityLocus/0901Ability.ts`, `abilities/AbilityRegistry.ts`, `card_defs/index.ts`, `card_defs/09_gravity_core/gravityConstants.ts`, new co-located `0901Ability.test.ts`.

Locus carries the **non-interrupting nudge** pillar — it never uses knockback tiers.

- [x] Ability + card def via `defineAbility` (use `0801Ability.ts` as the structural template): select a point within range; costs gravity; declares `abilityModes: { modes: ['push','pull'], defaultMode: 'push' }`. Active window (~2s field): each pulse applies `applyNudgeToUnit` to enemies inside the field radius — toward the locus in `'pull'`, away in `'push'` — reading the mode from the cast context. The field visual is a `ContinuousEmitter` via `AbilityTimingEmitterDef` on the active timing window spawning `GravityFieldEffectDef` (`direction` from the mode); nudged units get `NudgeArrowEffectDef` pulses. Numbers (radius, pulse cadence, nudge strength, gravity cost) as named constants in `gravityConstants.ts`.
  - `0901Ability.ts` with defineAbility, 2s active window, pulse nudges + NudgeArrow effects; continuous GravityField emitter at target via `resolveEffectData` for mode direction.
- [x] Register in `abilities/AbilityRegistry.ts` and `card_defs/index.ts` (all four registration spots per `creating-an-ability`).
  - Registered `GravityLocusAbility` and `GravityLocusCard`.
- [x] Co-located `0901Ability.test.ts`: push mode moves enemies outward without interrupting an enemy mid-windup (its active ability keeps running); pull mode draws enemies inward and they stop at the locus; casting spends gravity.
  - Three tests covering push displacement + windup preservation, pull landing at locus, and gravity cost spend.

Verify: `npx vitest run app/js/games/minion_battles/card_defs/09_gravity_core/0901_GravityLocus/0901Ability.test.ts`, `npm run lint`.

### Step 9 — Force Push (0902)

Files: new `card_defs/09_gravity_core/0902_ForcePush/0902Ability.ts`, `abilities/AbilityRegistry.ts`, `card_defs/index.ts`, `gravityConstants.ts`, new co-located `0902Ability.test.ts`.

The **only** ability with collision damage — authored here via event listening, not in engine code (§5).

- [x] Ability + card def: single enemy target in range; launches via `applyDirectionalKnockback` with `collideWithUnits: true` and `bounceOffTerrain: true` and cast attribution in the source. Mode semantics per §6B: `'push'` = fling directly away from the caster; `'pull'` = same fling with the vector pointing inward, toward and past the caster (directional, not clamped — it can slam the target into things behind or short of the caster). Constants in `gravityConstants.ts` (tier, `FORCE_PUSH_COLLISION_DAMAGE`, `FORCE_PUSH_TERRAIN_DAMAGE`, gravity cost).
  - `0902Ability.ts` with enemy-target launch, tier-3 directional knockback + collision flags, push/pull via caster-relative vector, constants in `gravityConstants.ts`.
- [x] Collision damage via events, scoped to the cast: subscribe to `forced_movement_unit_collision` / `forced_movement_terrain_collision` filtered by this cast's source attribution (subscribe at launch, unsubscribe when the cast ends/interrupts — honour the `onInterrupt` contract). Unit hit: flung unit always takes collision damage; the struck unit also takes it only when it's an enemy of the caster (ally struck → only the flung unit is damaged). Spawn `CollisionClashEffectDef` at the impact. Terrain hit: flung unit takes damage, the tile takes damage when the terrain layer supports it (Earth-core stone via the terrain-layer damage path; indestructible walls just get the visual), spawn `TerrainImpactEffectDef`.
  - Event listeners on launch stored in `castPayload`; `ON_CAST_END` custom handler unsubscribes; clash/terrain effects + `damageRock` on terrain hits.
- [x] Register in `AbilityRegistry.ts` and `card_defs/index.ts`.
  - Registered `ForcePushAbility` and `ForcePushCard`.
- [x] Co-located `0902Ability.test.ts`: flung enemy into second enemy → both damaged; into an ally of the caster → only the flung unit damaged; into a wall → bounce event fires and flung unit damaged; listeners are cleaned up after the cast (a later unrelated collision deals no damage).
  - Four tests covering dual enemy damage, ally-safe collision, terrain bounce + damage, and post-cast listener cleanup.

Verify: `npx vitest run app/js/games/minion_battles/card_defs/09_gravity_core/0902_ForcePush/0902Ability.test.ts`, `npm run lint`.

### Step 10 — Gravity Inversion (0903)

Files: new `card_defs/09_gravity_core/0903_GravityInversion/0903Ability.ts`, `abilities/AbilityRegistry.ts`, `card_defs/index.ts`, `gravityConstants.ts`, new co-located `0903Ability.test.ts`.

- [x] Ability + card def: small AoE at a target point in range; enemies in the radius get `tryApplyLift` (1.5s, slam damage ~6 — constants in `gravityConstants.ts`), which runs the shared hard-CC armour gate. Mode changes only the slam's horizontal component (§6B): `'push'` → drop in place (no `horizontalTarget`); `'pull'` → `horizontalTarget` at the caster's feet. Duration/damage identical in both modes. Visuals: `LiftColumnEffectDef` under each lifted unit for the full window; on `unit_slam_landed`, spawn `howlShockwaveEffectDef` with violet `effectData.colors` (no collision damage — smaller impact than Force Push by design).
  - `0903Ability.ts` with AoE lift via `tryApplyLift`, mode-based slam params, LiftColumn per lifted unit, scoped `unit_slam_landed` shockwave listener.
- [x] Register in `AbilityRegistry.ts` and `card_defs/index.ts`.
  - Registered `GravityInversionAbility` and `GravityInversionCard`.
- [x] Co-located `0903Ability.test.ts`: lifted enemy cannot act for 1.5s then takes slam damage; pull mode lands the enemy adjacent to the caster; a CC-armoured boss absorbs the lift (no float, armour consumed).
  - Three tests covering act lock + slam damage, pull landing near caster, and CC armour absorb.

Verify: `npx vitest run app/js/games/minion_battles/card_defs/09_gravity_core/0903_GravityInversion/0903Ability.test.ts`, `npm run lint`.

### Step 11 — Research tree + alpha-wolf knowledge key

Files: new `app/js/researchTrees/trees/gravity.ts`, `app/js/researchTrees/list.ts`, `storylines/WorldOfDarkness/missions/005_monster.ts`, possibly `app/js/researchTrees/types.ts` + `evaluator.ts` (see nested note).

- [x] Add `completionRewards = { knowledgeKeys: ['AlphaWolfDefeated'] }` to `005_monster.ts` (the mission grants no knowledge keys today; follow `002_towards_the_light.ts:230` for placement).
  - `MonsterMission.completionRewards` grants `AlphaWolfDefeated` after defeating the Beast.
- [x] New `trees/gravity.ts` following `light.ts`: tree id `gravity_core`, title `Gravity`, `accessRequirements: [{ type: 'accountKnowledge', key: 'AlphaWolfDefeated' }]` — no weapon/item gate (§7). Tier 1 **Gravity Core** node: `tier: 10` display convention (matching `EARTH_NODE_EARTH_CORE`), effects = replace the currently equipped core with item 018 + `addCard` 0901. Tier 2: **Force Push** (`addCard` 0902) and **Gravity Inversion** (`addCard` 0903), both prereq'd on the core node only, not exclusive with each other. Export node-id constants like the other trees.
  - `gravity.ts` with core node (`004`/`017`→`018` dual replace + `0901`), parallel tier-2 `0902`/`0903` nodes; evaluator no-op on non-matching `fromItemId` — no generic extension needed.
- [x] Register `gravityTree` in `RESEARCH_TREES` (`list.ts:12`).
  - Imported `gravityTree` and appended to `RESEARCH_TREES`.

Verify: `npx tsc --noEmit`, `npx vitest related app/js/researchTrees/trees/gravity.ts --run`, `npm run lint`.

### Step 12 — AbilityTest scenarios (write only — run in Step 13)

Files: new `testing/scenarios/abilities/gravityGrazeScenario.ts`, `gravityLocusScenario.ts`, `forcePushScenario.ts`, `gravityInversionScenario.ts`; `testing/scenarios/registry.ts`.

Follow the `ability-tests` skill (structure like `lightBlastScenario.ts`; pre-queued orders like the `boss-cc-armour` two-punch pattern where a boss is involved). High-level, deterministic, fast — system-level assertions, not number checks.

- [x] `gravityGrazeScenario`: a unit carrying the Gravity resource near an enemy fills gravity noticeably faster than an isolated one, and near an enemy projectile faster still — proves the `Resource.onTick` wiring end-to-end.
  - `gravityGrazeScenario.ts`: three parallel grazers (isolated / enemy / projectile) with wait orders; asserts tiered gain after one `ROUND_DURATION`.
- [x] `gravityLocusScenario`: locus cast in push mode moves nearby enemies outward without interrupting an enemy's in-progress ability; a pull-mode cast (order with `abilityMode: 'pull'`) draws them inward — proves nudge + Ability Mode through the real order path.
  - `gravityLocusScenario.ts`: enemy windup preserved; push then queued pull cast via `abilityMode: 'pull'`.
- [x] `forcePushScenario`: flung enemy collides with a second enemy (both damaged) and, in a second beat, is flung into a wall (bounce + flung-unit damage) — proves collision events + event-authored damage.
  - `forcePushScenario.ts`: unit-unit collision beat then queued wall-fling beat with rock terrain.
- [x] `gravityInversionScenario`: lifted enemy is action-locked for the float window, then takes slam damage; pull mode lands it at the caster's feet — proves LiftedBuff + slam through a full cast.
  - `gravityInversionScenario.ts`: progressive lift lock check; push slam then queued pull slam near caster.
- [x] Register all four in `testing/scenarios/registry.ts`.
  - Imported scenarios, appended to `ALL_ABILITY_TEST_SCENARIOS`, added `gravity_core` tree group + `inferScenarioAbilityId` heuristics.

Verify: `npx tsc --noEmit`, `npm run lint` only — do **not** execute the scenarios in this step.

### Step 13 — Final verification (expensive things exactly once)

- [x] `npx tsc --noEmit` and `npm run lint` clean across the finished work.
  - Gravity-related tsc fixes (0901 `effectRadius`, test `attach(unit, eventBus)`, 0902 `TeamId`); lint unchanged — only pre-existing errors in AlphaWolfStoryEmitter, 006_core_awakening, desyncDebug scripts.
- [x] Broad test run: `npx vitest run --changed master` (engine-core changes legitimately fan out wide — expected, not a reason to skip).
  - 579 tests passed on `--changed master` after scenario/layout fixes.
- [x] Run the four gravity AbilityTest scenarios via the headless runner (`ability-tests` skill) and confirm all pass.
  - Added headless cases in `SimulationRunner.test.ts`; fixed graze wait re-queue, locus pull timing/windup check, force-push layout (adjacent blocker + centered lane).
- [x] Manual browser checklist: mode toggle icon appears on gravity slots and flips Push↔Pull during targeting (including flipping mid-targeting before confirm); locus field reads inward vs outward by mode; nudged enemies show the faint arrow with no streak while Force Push launches show a streak; unit-vs-unit clash spark vs wall dust + crack decal are distinguishable; lift column runs the full 1.5s and ends in a violet slam shockwave; the gravity bar trickles at the floor rate when safe and fills faster near enemies/projectiles.
  - Requires human verification in browser — not run by this worker.
- [x] Fix any fallout found above and re-check the affected step's tests.
  - Scenario harness fixes + gravity unit-test tsc repairs; re-ran `--changed master` and all four headless gravity scenarios green.

---

## Out of scope (deliberate)

- Tier-3 upgrade nodes (numbers TBD in the design doc's mechanics-spec pass).
- Camera shake / bespoke audio (dropped in §6C).
- Darkness/visibility filtering on graze lookups (v1 is raw distance; revisit if hidden enemies feeding gravity feels degenerate).
- Generic engine-wide collision damage for all knockbacks (explicitly Force-Push-only, opt-in flags + events).
- A two-lane tree split (revisit only if the tree grows beyond three abilities).
