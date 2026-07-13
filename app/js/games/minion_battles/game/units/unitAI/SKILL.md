---
name: unit-ai
description: How UnitAITree works. Use when creating or editing AI behavior for enemy units in Minion Battles.
---

# Unit AI (UnitAITree)

Each AI-controlled unit runs its own **UnitAITree**. There is no global "AIController" — each unit has a `unitAITreeId` (e.g. `'default'`, `'alphaWolfBoss'`, `'hunt'`) and executes its tree each turn.

## Three-Layer Architecture

```
Strategic Layer  (group-level, ~every 25 ticks)  → StrategicPlan on GroupBlackboard
Tactical Layer   (unit-level,  ~every 15 ticks)  → TacticalPlan on unit
Immediate Layer  (unit-level,  ~every 5 ticks)   → BattleOrder via queueOrder()
```

Plans are **lazy** — nothing recalculates every tick. Recalculation is triggered by hold-timer expiry or an interrupt event (terrain changed, target died, etc.).

**moveJitter is the single timing seed.** All per-unit timing offsets derive from `unit.moveJitter` (a float [0,1] set once at spawn). Never add a second random call for jitter — pass `moveJitter` to `createPlan`.

## Concepts

### UnitAITree
- **Name**: Tree identifier (e.g. `'default'`, `'hunt'`, `'aggroWander'`).
- **Nodes**: Named states with actions and edge conditions.
- **Entry node**: Where the unit starts when it has no current node.

### AINode
- **nodeId**: Format `<tree_name>_<node_name>` (e.g. `default_idle`, `hunt_seek`).
- **actions**: `{ execute(unit, context), onPathfindingRetrigger?(unit, context) }`.
- **edges**: Array of `{ targetNodeId, evaluate(unit, context) }`. First true edge triggers transition.

### Type safety
- Edges can only target nodes **within the same tree** (enforced via `isNodeInTree` type guard).
- Node IDs are typed per-tree (e.g. `DefaultNodeId`, `HuntNodeId`).

## TacticalPlan (unit-level medium-term goal)

`unit.tacticalPlan: Plan<TacticalPlan> | null` caches the unit's current goal for ~15 ticks. Tree nodes should **read the plan before doing their own scanning** — only replan when `shouldReplan()` returns true.

```typescript
// In a tree node's execute():
if (!shouldReplan(unit.tacticalPlan, context.gameTick, unit.pendingInterrupts)) {
    const targetId = unit.tacticalPlan!.data.targetUnitId;
    // use cached target...
    return;
}
// Expensive scan happens here, then:
unit.tacticalPlan = createPlan<TacticalPlan>(
    { type: 'chase_target', targetUnitId: enemy.id },
    {
        baseTicks: 15,
        moveJitter: unit.moveJitter,
        maxJitterTicks: 10,
        invalidateOn: new Set(['target_died', 'took_significant_damage']),
        currentTick: context.gameTick,
    },
);
```

`TacticalPlan.type` values: `'move_to_waypoint' | 'hold_position' | 'chase_target' | 'return_to_group' | 'idle'`

`tacticalPlan` is serialized (as relative ticks) via `serializeTacticalPlan` / `deserializeTacticalPlan` in `plans/planUtils.ts`. It survives save/load automatically — no extra wiring needed.

## pendingInterrupts

`unit.pendingInterrupts: Set<InterruptFlag>` holds events that arrived since the last AI tick. `shouldReplan()` checks these against the plan's `invalidateOn` set.

`InterruptFlag` values:
- `'target_died'` — tactical plan's target unit died
- `'terrain_changed_near_path'` — a terrain cell within 2 tiles of a path waypoint changed
- `'took_significant_damage'` — unit took >20% maxHp in a single hit
- `'path_blocked'` — (defined, not yet wired)
- `'enemy_entered_proximity'` — (defined, not yet wired)
- `'group_dispersed'` — (defined, not yet wired)
- `'objective_complete'` / `'objective_invalidated'` — (defined, not yet wired)

Interrupts are cleared automatically after each unit's AI tick — **do not clear them manually in tree nodes**.

## InterruptSystem

`GameState.interruptSystem` subscribes to engine events and populates `pendingInterrupts` on affected units. It is initialized at engine startup — no per-mission setup needed.

Currently wired events:
| Engine event | InterruptFlag set |
|---|---|
| `unit_died` | `target_died` on any unit whose tactical plan or `aiContext.targetUnitId` matched the dead unit |
| `terrain_stone_damaged` | `terrain_changed_near_path` on units whose `pathWaypoints` pass within 2 tiles (Chebyshev) of the changed cell |
| `damage_taken` | `took_significant_damage` on the damaged unit (threshold: 20% of maxHp) |

## Groups and GroupManager

`GameState.groupManager` owns `GroupBlackboard` records. Each blackboard holds a `StrategicPlan` and ephemeral outputs the group brain computes each cycle (~every 25 ticks):

```typescript
interface GroupBlackboard {
    groupId: string;
    unitIds: string[];
    strategicPlan: Plan<StrategicPlan>;
    // Ephemeral — repopulated by GroupBrain each cycle:
    formationCenter?: { x: number; y: number };
    advanceWaypoint?: { col: number; row: number };
    sharedTargetId?: string;
    nextBrainTick: number;
}
```

**Groups are not auto-created.** Nothing calls `createGroup()` at mission start today — missions that want group behavior must call `groupManager.createGroup(groupId, unitIds, plan)` explicitly. The `DefaultStrategicDirector` exists for this but is not yet wired to mission startup.

Group state is serialized automatically via `GameEngine.toJSON/fromJSON` — ephemeral fields are cleared on load and repopulated on the first brain tick.

## plans/ utilities

`plans/planUtils.ts` exports:
- `createPlan<T>(data, opts)` — builds a `Plan<T>` with `holdUntilTick = currentTick + baseTicks + floor(moveJitter * maxJitterTicks)`
- `shouldReplan<T>(plan, currentTick, pendingInterrupts)` — true if null, timer expired, or interrupt matches `invalidateOn`
- `serializeTacticalPlan(plan, currentTick)` — converts to relative ticks, omits path
- `deserializeTacticalPlan(serialized, currentTick)` — reconstructs with empty `invalidateOn` (caller supplies)

## Folder structure

```
game/units/unitAI/
├── types.ts              # AIContext, UnitAITree, AINode, AIEdgeCondition
├── contextBase.ts        # UnitAIContextBase (shared fields)
├── contextTypes.ts       # AITreeContextMap, UnitAIContext union, initTreeContext
├── utils.ts              # findEnemies, tryQueueAbilityOrder, applyAIMovementToUnit, etc.
├── runner.ts             # runUnitAI, runPathfindingRetrigger
├── index.ts              # Exports, getUnitAITree registry
├── SKILL.md              # This file
├── plans/                # Plan types and utilities
│   ├── types.ts          # InterruptFlag, Plan<T>, StrategicPlan, TacticalPlan, ImmediateDecision, SerializedTacticalPlan
│   ├── planUtils.ts      # createPlan, shouldReplan, serializeTacticalPlan, deserializeTacticalPlan
│   └── InterruptSystem.ts # Subscribes to engine events, marks pendingInterrupts on units
├── groups/               # Group-level (strategic) layer
│   ├── types.ts          # GroupBlackboard, SerializedGroup, groupJitter
│   ├── GroupManager.ts   # createGroup, getGroup, tick, toJSON, fromJSON
│   ├── GroupBrain.ts     # runGroupBrain — computes formationCenter, sharedTargetId, advanceWaypoint
│   └── StrategicDirector.ts # StrategicDirector interface + DefaultStrategicDirector
├── hunt/                 # Hunt tree (migrated to use TacticalPlan)
│   ├── context.ts        # HuntAITreeContext, HuntNodeId
│   ├── hunt_seek.ts      # Checks tacticalPlan before scanning; writes chase_target plan on scan
│   ├── hunt_pursue.ts    # Reads targetUnitId from tacticalPlan; clears plan when target gone
│   └── index.ts
├── default/              # Default tree (idle, attack, siege, findLight, wander)
├── alphaWolfBoss/        # Alpha Wolf boss tree
├── aggroWander/          # Aggro wander tree
├── lanternitePatrol/
├── lanterniteNetwork/
├── lanterniteNestIdle/
├── pet/
└── swarmlingNetwork/
```

## UnitAIContext (Discriminated Union)

`unit.aiContext` is a **discriminated union** keyed on `aiTree`. Each tree defines its own context type with tree-specific fields. Shared fields (`aiState`, `targetUnitId`) are on every variant.

### Shared fields (UnitAIContextBase)
- `aiState?: string` — Current node ID within the tree (set by runner).
- `targetUnitId?: string` — Current combat target unit ID.

### Tree-specific contexts
Each tree defines a context interface in `<tree>/context.ts` that extends `UnitAIContextBase` and adds a literal `aiTree` discriminant plus tree-specific fields.

### Accessing context in tree nodes
```typescript
const ctx = unit.aiContext as AggroWanderAITreeContext;
ctx.startCol = 5;
ctx.aiState = 'aggroWander_attack';
```

### Adding a context for a new tree
1. Create `<tree>/context.ts` extending `UnitAIContextBase` from `contextBase.ts`.
2. Add the tree to `AITreeContextMap` in `contextTypes.ts`.

## Abilities and AISettings

**AITrees do NOT directly order abilities.** Instead:

1. Abilities define **AISettings** (minRange, maxRange, maxUsesPerRound, **priority**).
2. Attack nodes call `tryQueueAbilityOrder(unit, context, candidateEnemies, nearbyEnemies?)`.
3. That helper uses `pickBestAbility`, which selects by range, `maxUsesPerRound`, and priority.
4. Two opt-in `AbilitySettings` fields exist for reactive/self-cast abilities (both default to
   today's behavior when omitted, so existing abilities are unaffected):
   - `candidateScope: 'anyNearby'` — score this ability against the node's `nearbyEnemies` list
     instead of just `candidateEnemies` (the locked/primary target). A node only needs to pass a
     broader `nearbyEnemies` list once for any of its abilities to opt in — see `hunt_pursue.ts`.
   - `enforceRangeWhenUntargeted: true` — for a zero-`targets` ability (self-cast / ground-AoE),
     actually enforce `minRange`/`maxRange` against the candidate pool instead of the legacy
     "valid whenever any candidate enemy exists" behavior. Needed for a tightly-ranged
     self-centered ability (e.g. a defensive stomp) to only fire when something is actually close.

## Adding a new tree

1. Create folder `unitAI/<tree_name>/`.
2. Create `context.ts` with tree context interface and node ID type.
3. Create nodes: `<tree_name>_<node_name>.ts`. If the tree does enemy scanning, check `unit.tacticalPlan` via `shouldReplan()` before scanning — see `hunt_seek.ts` as the reference implementation.
4. Create `index.ts` exporting the tree, context type, and node ID type.
5. Add tree context to `AITreeContextMap` in `contextTypes.ts`.
6. Register in `unitAI/index.ts`: `TREE_REGISTRY[treeId] = tree` and add exports.

## Assigning trees to units

- **unitAITreeId** on Unit (default `'default'`).
- Set when spawning: `createUnitFromSpawnConfig({ ..., unitAITreeId: 'hunt' })`.
- Can be set per-enemy via `EnemySpawnDef.unitAITreeId` or `SpawnWaveEntry.unitAITreeId`.

## Runner flow

1. Ensure `aiTree` is set on the context (matches tree name).
2. Get current node (or entry).
3. Evaluate edges in order; if one returns true, set node and recurse.
4. Otherwise run `node.actions.execute(unit, context)`.
5. After `execute`, `unit.pendingInterrupts` is cleared by the runner.
