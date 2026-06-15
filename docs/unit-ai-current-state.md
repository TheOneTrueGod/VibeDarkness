# Minion Battles — Unit AI Current State

## Overview

Each AI-controlled unit runs its own **UnitAITree** independently. There is no global AI controller or shared brain; coordination (where it exists) is emergent or achieved through state stored on individual `Unit` properties. The engine ticks all unit trees every game tick via `UnitManager.gameTick()`.

---

## SKILL.md Accuracy Notes

The `unitAI/SKILL.md` is accurate for the core concepts (tree structure, runner, edge evaluation, ability selection via `tryQueueAbilityOrder`). The following are gaps or divergences from the live code:

- **Outdated folder structure**: The SKILL.md lists only three trees (`default`, `alphaWolfBoss`, `aggroWander`). The live registry has **nine**: `default`, `alphaWolfBoss`, `aggroWander`, `hunt`, `pet`, `lanternitePatrol`, `lanterniteNestIdle`, `lanterniteNetwork`, `swarmlingNetwork`.
- **`aiController` "mapping" is vestigial**: The SKILL.md says units fall back to a "mission `aiController` mapping". In practice, `aiControllerId` on `GameEngine` is only checked in one place (`LevelEventManager`) and only for one value: if `aiControllerId === 'alphaWolfBoss'`, spawned units without an explicit `unitAITreeId` get the `alphaWolfBoss` tree; otherwise they get `default`. There is no mapping table.
- **`EnemySpawnDef` reference**: The SKILL.md mentions `EnemySpawnDef.unitAITreeId`. The live spawn path uses `SpawnWaveEntry.unitAITreeId` in `LevelEventManager`.
- **`pet` tree's fifth node**: The pet tree has a `pet_guardWander` node (`pet/pet_guardWander.ts`) not mentioned in the SKILL.md.

---

## Layer 1 — Strategic Layer

**What it is:** Mission-level goals, coordination, and "why are enemies doing what they're doing?"

**Current state: No true strategic layer exists.** Emergent behaviour from individual units fills this role. The closest things to mission-level AI direction:

### `aiControllerId` on `GameEngine`
Set via `mission.aiController` in `BattleSession`. Only ever checked in `LevelEventManager` as a fallback tree selector:

```typescript
const fallbackTreeId = this.ctx.aiControllerId === 'alphaWolfBoss' ? 'alphaWolfBoss' : 'default';
```

This is a thin shim, not a real strategy layer.

### `SpawnWaveEntry` / `LevelEventManager`
The mission author controls the *when*, *where*, and *what* of spawning by defining `levelEvents` with `spawnWave` entries. Each entry can specify:
- `unitAITreeId` — which tree the spawned unit uses
- `spawnBehaviour` — edge-of-map, darkness tile, specific position, etc.
- `spawnTarget` — world position + radius
- `lanterniteNestOwnerUnitId` / `lanternPatrolFarWorld` — for lanternite ecology linking

This is authored strategy baked into mission definitions, not runtime decision-making.

### Ecology State on `Unit` Properties
Two unit types use extra `Unit` fields to drive cross-unit behaviour without a director:

**Lanternites** (`lanterniteNetwork` tree):
- `unit.lanterniteRole` — `'scout'` or `'defender'`; set when the unit spawns, determines which branch of `lnet_assign_role` is taken
- `unit.lanternPatrolFarWorld` — world-space coordinate the scout travels to and constructs at

**Swarmlings** (`swarmlingNetwork` tree):
- `unit.swarmlingTargetNestPoiId` — ID of a map POI the swarmling is tasked to colonise
- `unit.swarmlingOrbitAngle` — angle around the POI where this swarmling stands to build
- `unit.swarmlingConstructionCompleteAtGameTime` — game-time when construction finishes; set by the AI node, consumed by `processSwarmNests`

This is as close as the game gets to "strategy": individual units carry their role in their own fields, assigned at spawn time.

---

## Layer 2 — Near-Term Goal Layer

**What it is:** The unit's current medium-term objective — who to target, what state to be in, and what to do when there are no targets.

This is the **UnitAITree** system itself. Each tree is a state machine of named nodes. The runner evaluates edge conditions each tick, transitions when an edge fires, then calls `execute()` on the current node.

### File layout

```
app/js/games/minion_battles/game/units/unitAI/
├── types.ts              # AIContext, UnitAITree, AINode, AIEdgeCondition
├── contextBase.ts        # UnitAIContextBase (aiState, targetUnitId)
├── contextTypes.ts       # AITreeContextMap discriminated union; initTreeContext
├── utils.ts              # findEnemies, pickBestAbility, applyAIMovementToUnit, …
├── runner.ts             # runUnitAI, runPathfindingRetrigger
├── index.ts              # TREE_REGISTRY + exports
├── default/              # 5 nodes
├── alphaWolfBoss/        # 2 nodes
├── aggroWander/          # 2 nodes
├── hunt/                 # 2 nodes
├── pet/                  # 5 nodes
├── lanternitePatrol/     # 1 node
├── lanterniteNestIdle/   # 1 node
├── lanterniteNetwork/    # 5 nodes
└── swarmlingNetwork/     # 2 nodes
```

### How the runner works (`runner.ts`)

1. Ensure `unit.aiContext.aiTree` matches the tree name (reset if not).
2. Get current node from `aiState`, fall back to `entryNodeId`.
3. Evaluate `node.edges` in order — first edge where `evaluate()` is true transitions to `targetNodeId` and recurses.
4. If no edge fires, call `node.actions.execute(unit, context)`.
5. If `execute` itself changed `aiState` (nodes can self-transition by writing to context), recurse.

Nodes have no blocking waits. Each tick they queue orders and call `emitTurnEnd`.

### Tick integration (`UnitManager.gameTick`)

```
Phase 1a — passive ability tick (all alive units)
Phase 1b — active ability tick
Phase 2  — movement + pathfinding retrigger
             for each unit where (gameTick % pathfindingRetriggerOffset === 0):
               runPathfindingRetrigger(unit, tree, aiContext)
             unit.tickMovement(dt, engine)
Phase 3  — AI decisions (non-player, alive, canAct, not spawning)
             tree = getUnitAITree(unit.unitAITreeId)
             runUnitAI(unit, tree, aiContext)
```

Each unit has a random `pathfindingRetriggerOffset` (30–90 ticks) assigned in `UnitManager.addUnit`. This staggers path refreshes across units to avoid spikes.

### All trees and their nodes

---

#### `default` — General-purpose enemy

Entry: `default_idle`

| Node | Behaviour |
|------|-----------|
| `default_idle` | Scans for enemies (LOS + perception range), defend points, and light sources. Transitions to whichever of `attack / siegeDefendPoint / findLight / wander` applies first. |
| `default_attack` | Moves to ideal range of target, tries ability. Edges back to idle if target dies or leaves sight. |
| `default_siegeDefendPoint` | Moves to nearest alive defend point tile; intercepts enemies that come close. |
| `default_findLight` | Pathfinds toward nearest light source. Returns to idle once near light or if light disappears. |
| `default_wander` | Random walk within a wander radius. Returns to idle after a wait. |

Target selection: nearest enemy within `getPerceptionRange(characterId)` with LOS. Target is randomly picked among the visible set (not always the closest).

---

#### `hunt` — Relentless pursuit

Entry: `hunt_seek`

| Node | Behaviour |
|------|-----------|
| `hunt_seek` | Finds nearest living enemy (no LOS required). Sets `targetUnitId` and transitions immediately to `hunt_pursue`. Waits if no enemies. |
| `hunt_pursue` | Rescans for nearest enemy every 0.5 rounds (re-targets dynamically). Pathfinds to target with no range stopping. Uses ability if in range. No LOS requirement to maintain pursuit. |

The key difference from `default`: no perception range or LOS gating. Hunt units always know where the closest enemy is.

---

#### `aggroWander` — Home-range patrol

Entry: `aggroWander_wander`

| Node | Behaviour |
|------|-----------|
| `aggroWander_wander` | Wanders within ~2 grid cells of spawn position. Checks for enemies within perception range + LOS each tick. |
| `aggroWander_attack` | Attacks target, then returns to wander. |

Context stores `startCol`/`startRow` (spawn position), `lastMoveTime`, `lastScanTime`.

---

#### `pet` — Player-owned companion

Entry: `pet_follow`

| Node | Behaviour |
|------|-----------|
| `pet_follow` | Stays near owner. Inside 50px: guard-wander in place. Outside: pathfind to owner. Scans for enemies within owner's engage leash (150px default). |
| `pet_guardWander` | Wanders a small radius around the owner's position when idling close by. |
| `pet_engage` | Pursues and attacks enemy within the leash range. |
| `pet_return` | Returns to owner after losing the target or target dying. |
| `pet_heel` | Holds close to owner; no engagement. Set via command. |

---

#### `lanternitePatrol` — Stationary lanternite guard

Entry: `lantern_patrol`

| Node | Behaviour |
|------|-----------|
| `lantern_patrol` | Orbits a fixed ring around a nest position. Dwells at each patrol point. Detects threats by proximity and LOS. Transitions to attack via edges if threat detected. |

---

#### `lanterniteNestIdle` — Nest unit

Entry: single idle node. Nest units don't move or attack; they tick via `lanterniteNestTick.ts` as a separate system that spawns scouts.

---

#### `lanterniteNetwork` — Coordinated lanternite scouts and defenders

Entry: `lnet_assign_role`

| Node | Behaviour |
|------|-----------|
| `lnet_assign_role` | Dispatches to `lnet_scout_travel` (if `lanterniteRole === 'scout'`) or `lnet_guard` (if `lanterniteRole === 'defender'`). |
| `lnet_scout_travel` | Pathfinds to `lanternPatrolFarWorld` coordinate. Transitions to `lnet_scout_construct` on arrival. |
| `lnet_scout_construct` | Stays at far-world point and "constructs" (waits a defined duration). Returns to nest via role reassignment. |
| `lnet_guard` | Patrols a ring around the nest. Switches to `lnet_chase` if an enemy comes within 200px or if HP drops. |
| `lnet_chase` | Pursues threat unit until dead. Returns to `lnet_guard` when target gone. |

No shared memory between units — role and patrol target are on each unit's own fields.

---

#### `swarmlingNetwork` — Nest-building swarmlings

Entry: `snet_seek`

| Node | Behaviour |
|------|-----------|
| `snet_seek` | Travels to a POI (`swarmlingTargetNestPoiId`) and stands at an orbit angle around it. Starts a construction timer on arrival. Switches to `snet_hunt` if an enemy comes within 200px or if the unit takes damage. |
| `snet_hunt` | Pursues and attacks the threat. Returns to `snet_seek` once threat is gone. |

Construction is a separate system (`processSwarmNests`) that fires when `swarmlingConstructionCompleteAtGameTime` passes.

---

#### `alphaWolfBoss` — Boss unit

Entry: `alphaWolfBoss_idle`

| Node | Behaviour |
|------|-----------|
| `alphaWolfBoss_idle` | Scans for enemies in perception range + LOS. |
| `alphaWolfBoss_attack` | Priority-based ability selection (boss has multiple abilities with different priorities, ranges, and `maxUsesPerRound`). Moves to ideal range of target. |

The boss tree is thin — the complexity lives in the ability definitions (CC-breaking, special attacks), not the tree itself.

---

## Layer 3 — Immediate Action Layer

**What it is:** Given the unit is in an attack node, how does it decide which ability to use, when, and on whom?

### Movement (`applyAIMovementToUnit` / `applyAIMovementToPosition` in `utils.ts`)

Before attempting an ability each tick, attack nodes position the unit using the unit's `aiSettings` (a `{ minRange, maxRange }` pair):

- If too far from target (`dist > maxRange`): move closer to `idealRange = (min + max) / 2`
- If too close (`dist < minRange`): retreat to `idealRange`
- If already in range: no movement queued
- `moveJitter` (random `0..1` per unit, set on `addUnit`) adds a small angular offset so units don't stack

Movement uses grid pathfinding (`findGridPathForUnit`) and sets `unit.movement`. The path is extended incrementally if the unit is already moving in the right direction rather than replanning from scratch each tick.

### Ability selection (`pickBestAbility` in `utils.ts`)

Called by `tryQueueAbilityOrder(unit, context, candidateEnemies)`:

1. Iterate `unit.abilities`
2. For each ability:
   - Skip if `maxUsesPerRound` exceeded (via `context.getAbilityUsesThisRound`)
   - Skip if `meetsTagRequirements` fails (e.g. ability requires a buff tag the unit lacks)
   - Find a valid target in `candidateEnemies` within `[ability.aiSettings.minRange, ability.aiSettings.maxRange]`
   - If no `aiSettings`, pick a random candidate enemy
3. Collect all valid `{ ability, target, priority }` pairs
4. Sort by `priority` (higher wins); pick the best
5. Build `ResolvedTarget[]` and call `context.queueOrder(gameTick, { unitId, abilityId, targets, movePath })`

### Re-evaluating targets within an attack node

Most attack nodes pass only the current locked target as `candidateEnemies`. The hunt tree re-scans every 0.5 rounds and updates `targetUnitId`. The default attack node checks on each tick whether the target is still alive and has LOS; if not, it transitions back to idle, which picks a new target.

### When to check back in with the near-term goal layer

Transitions happen immediately when edge conditions fire (checked before `execute` each tick). Common patterns:
- Target dies → return to idle/seek
- Target out of LOS for long enough → return to idle
- HP drop while in passive mode → switch to alert/chase state
- Enemy enters proximity radius → switch from wander/patrol to attack

---

## Supporting Systems

### `AIContext` interface (`types.ts`)

What nodes receive from the engine each tick:

- `gameTick`, `gameTime` — timing
- `getUnit(id)`, `getUnits()` — unit access
- `getSpecialTiles()`, `getAliveDefendPoints()` — map objectives
- `getLightSources()` — torch/crystal light info
- `terrainManager` — grid conversion + pathfinding
- `findGridPathForUnit(unit, ...)` — pathfinding respecting unit size/passability
- `queueOrder(atTick, order)` — submit an ability order
- `emitTurnEnd(unitId)` — end this unit's turn for this tick
- `hasLineOfSight(x1,y1,x2,y2)` — LOS check
- `cancelActiveAbility(unitId, abilityId)` — cancel an in-progress cast
- `getAbilityUsesThisRound?(unitId, abilityId)` — optional; used for `maxUsesPerRound`
- `generateRandomInteger(min, max)` — seeded RNG (not `Math.random`)
- `WORLD_WIDTH`, `WORLD_HEIGHT` — bounds clamping
- `mapPOIs?` — map points of interest for swarmling targeting

### `UnitAIContext` discriminated union (`contextTypes.ts`)

`unit.aiContext` is typed as a discriminated union keyed on `aiTree`. Each tree defines its own context type in `<tree>/context.ts`. Shared fields (`aiState`, `targetUnitId`) come from `UnitAIContextBase`. Nodes cast `unit.aiContext` to their tree's type:

```typescript
const ctx = unit.aiContext as HuntAITreeContext;
ctx.targetUnitId = enemies[0]!.id;
ctx.aiState = 'hunt_pursue';
```

The `initTreeContext` helper preserves shared fields when switching trees.

### Pathfinding retrigger

Path recalculation is not done every tick — that would be expensive. Instead, each unit has a random `pathfindingRetriggerOffset` (30–90 ticks, randomised in `UnitManager.addUnit`). Every `pathfindingRetriggerOffset` ticks, `runPathfindingRetrigger` is called on the current node's `onPathfindingRetrigger` hook (if present). This refreshes the path to account for the target having moved without replanning every tick.

---

## What Does Not Exist

- **No mission director**: Nothing coordinates which unit attacks which player, spreads damage, or manages overall pacing beyond spawn timing.
- **No shared memory between units**: Units of the same type don't share knowledge. Two `hunt` units both independently find the nearest enemy; they may both target the same player.
- **No formation or flanking logic**: Units don't try to surround the player; they each pathfind independently.
- **No difficulty scaling in AI**: The trees themselves don't change based on difficulty. Difficulty is handled via spawned unit stats (HP, damage) rather than smarter decision-making.
- **No retreat or self-preservation**: No tree currently checks "am I low HP?" and changes strategy (beyond the alpha wolf boss's enrage tags which affect ability unlocks, not movement decisions).
