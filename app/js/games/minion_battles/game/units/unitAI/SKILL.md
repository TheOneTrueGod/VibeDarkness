---
name: unit-ai
description: How UnitAITree works. Use when creating or editing AI behavior for enemy units in Minion Battles.
---

# Unit AI (UnitAITree)

Each AI-controlled unit runs its own **UnitAITree**. There is no global "AIController" — each unit has a `unitAITreeId` (e.g. `'default'`, `'alphaWolfBoss'`, `'aggroWander'`) and executes its tree each turn.

## Concepts

### UnitAITree
- **Name**: Tree identifier (e.g. `'default'`, `'alphaWolfBoss'`, `'aggroWander'`).
- **Nodes**: Named states with actions and edge conditions.
- **Entry node**: Where the unit starts when it has no current node.

### AINode
- **nodeId**: Format `<tree_name>_<node_name>` (e.g. `default_idle`, `aggroWander_wander`).
- **actions**: `{ execute(unit, context), onPathfindingRetrigger?(unit, context) }`.
- **edges**: Array of `{ targetNodeId, evaluate(unit, context) }`. First true edge triggers transition.

### Type safety
- Edges can only target nodes **within the same tree** (enforced via `isNodeInTree` type guard).
- Node IDs are typed per-tree (e.g. `DefaultNodeId`, `AggroWanderNodeId`).

## Folder structure

```
objects/units/unitAI/
├── types.ts          # AIContext, UnitAITree, AINode, AIEdgeCondition
├── contextBase.ts    # UnitAIContextBase (shared fields)
├── contextTypes.ts   # AITreeContextMap, UnitAIContext union, initTreeContext
├── utils.ts          # findEnemies, tryQueueAbilityOrder, applyAIMovementToUnit, etc.
├── runner.ts         # runUnitAI, runPathfindingRetrigger
├── index.ts          # Exports, getUnitAITree registry
├── SKILL.md          # This file
├── default/          # Default tree (idle, attack, siege, findLight, wander)
│   ├── context.ts    # DefaultAITreeContext, DefaultNodeId
│   ├── default_idle.ts
│   ├── default_attack.ts
│   ├── default_siegeDefendPoint.ts
│   ├── default_findLight.ts
│   ├── default_wander.ts
│   └── index.ts
├── alphaWolfBoss/    # Alpha Wolf boss tree
│   ├── context.ts    # AlphaWolfBossAITreeContext, AlphaWolfBossNodeId
│   ├── alphaWolfBoss_idle.ts
│   ├── alphaWolfBoss_attack.ts
│   └── index.ts
└── aggroWander/      # Aggro wander tree (wander near spawn, attack on sight)
    ├── context.ts    # AggroWanderAITreeContext, AggroWanderNodeId
    ├── aggroWander_wander.ts
    ├── aggroWander_attack.ts
    └── index.ts
```

## UnitAIContext (Discriminated Union)

`unit.aiContext` is a **discriminated union** keyed on `aiTree`. Each tree defines its own context type with tree-specific fields. Shared fields (`aiState`, `targetUnitId`) are on every variant.

### Shared fields (UnitAIContextBase)
- `aiState?: string` — Current node ID within the tree (set by runner).
- `targetUnitId?: string` — Current combat target unit ID.

### Tree-specific contexts
Each tree defines a context interface in `<tree>/context.ts` that extends `UnitAIContextBase` and adds a literal `aiTree` discriminant plus tree-specific fields.

Example: `AggroWanderAITreeContext` has `aiTree: 'aggroWander'`, `startCol`, `startRow`, `lastMoveTime`, `lastScanTime`.

### Accessing context in tree nodes
Tree nodes cast `unit.aiContext` to their tree's context type:
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
2. Attack nodes call `tryQueueAbilityOrder(unit, context, candidateEnemies)`.
3. That helper uses `pickBestAbility`, which selects the best ability by:
   - Range (target within min/max)
   - maxUsesPerRound (skip if exhausted)
   - **priority** (higher = preferred when multiple abilities are valid)

## Adding a new tree

1. Create folder `unitAI/<tree_name>/`.
2. Create `context.ts` with tree context interface and node ID type.
3. Create nodes: `<tree_name>_<node_name>.ts`.
4. Each node exports an `AINode` with `nodeId`, `actions`, `edges`.
5. Create `index.ts` that exports the tree, context type, and node ID type.
6. Add tree context to `AITreeContextMap` in `contextTypes.ts`.
7. Register in `unitAI/index.ts`: `TREE_REGISTRY[treeId] = tree` and add exports.

## Assigning trees to units

- **unitAITreeId** on Unit (default `'default'`).
- Set when spawning: `createUnitFromSpawnConfig({ ..., unitAITreeId: 'aggroWander' })`.
- Can be set per-enemy via `EnemySpawnDef.unitAITreeId` or `SpawnWaveEntry.unitAITreeId`.
- Falls back to mission `aiController` mapping when not set per-unit.

## Runner flow

1. Ensure `aiTree` is set on the context (matches tree name).
2. Get current node (or entry).
3. Evaluate edges in order; if one returns true, set node and recurse.
4. Otherwise run `node.actions.execute(unit, context)`.
