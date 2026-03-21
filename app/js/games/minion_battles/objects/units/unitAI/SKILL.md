---
name: unit-ai
description: How UnitAITree works. Use when creating or editing AI behavior for enemy units in Minion Battles.
---

# Unit AI (UnitAITree)

Each AI-controlled unit runs its own **UnitAITree**. There is no global "AIController" — each unit has a `unitAITreeId` (e.g. `'default'`, `'alphaWolfBoss'`) and executes its tree each turn.

## Concepts

### UnitAITree
- **Name**: Tree identifier (e.g. `'default'`, `'alphaWolfBoss'`).
- **Nodes**: Named states with actions and edge conditions.
- **Entry node**: Where the unit starts when it has no current node.

### AINode
- **nodeId**: Format `<tree_name>_<node_name>` (e.g. `default_idle`, `default_attack`).
- **actions**: `{ execute(unit, context), onPathfindingRetrigger?(unit, context) }`.
- **edges**: Array of `{ targetNodeId, evaluate(unit, context) }`. First true edge triggers transition.

### Type safety
- Edges can only target nodes **within the same tree** (enforced via `isNodeInTree` type guard).
- Node IDs are typed per-tree (e.g. `DefaultNodeId`, `AlphaWolfBossNodeId`).

## Folder structure

```
objects/units/unitAI/
├── types.ts          # AIContext, UnitAITree, AINode, AIEdgeCondition
├── utils.ts          # findEnemies, tryQueueAbilityOrder, applyAIMovementToUnit, etc.
├── runner.ts         # runUnitAI, runPathfindingRetrigger
├── index.ts          # Exports, getUnitAITree registry
├── SKILL.md          # This file
├── default/          # Default tree (idle, attack, siege, findLight, wander)
│   ├── default_idle.ts
│   ├── default_attack.ts
│   ├── default_siegeDefendPoint.ts
│   ├── default_findLight.ts
│   ├── default_wander.ts
│   └── index.ts
└── alphaWolfBoss/    # Alpha Wolf boss tree
    ├── alphaWolfBoss_idle.ts
    ├── alphaWolfBoss_attack.ts
    └── index.ts
```

## Abilities and AISettings

**AITrees do NOT directly order abilities.** Instead:

1. Abilities define **AISettings** (minRange, maxRange, maxUsesPerRound, **priority**).
2. Attack nodes call `tryQueueAbilityOrder(unit, context, candidateEnemies)`.
3. That helper uses `pickBestAbility`, which selects the best ability by:
   - Range (target within min/max)
   - maxUsesPerRound (skip if exhausted)
   - **priority** (higher = preferred when multiple abilities are valid)

Example: Alpha Wolf Summon has `priority: 20`, Claw has `priority: 10`. When both are in range, Summon is used first.

## Adding a new tree

1. Create folder `unitAI/<tree_name>/`.
2. Create nodes: `<tree_name>_<node_name>.ts` (e.g. `myTree_myNode.ts`).
3. Each node exports an `AINode` with `nodeId`, `actions`, `edges`.
4. Create `index.ts` that exports the tree and node ID type.
5. Register in `unitAI/index.ts`: `TREE_REGISTRY[treeId] = tree`.

## Assigning trees to units

- **unitAITreeId** on Unit (default `'default'`).
- Set when spawning: `createUnitFromSpawnConfig({ ..., unitAITreeId: 'alphaWolfBoss' })`.
- Mission `aiController` maps to tree: `alphaWolfBoss` → `alphaWolfBoss`, else → `default`.

## Unit state (aiContext)

Nodes store state in `unit.aiContext`:
- `unitAINodeId`: Current node (set by runner).
- `aiTargetUnitId`, `defensePointTargetId`, `preyUnitId`, `findLightSourceId`, etc.

## Runner flow

1. Get current node (or entry).
2. Evaluate edges in order; if one returns true, set node and recurse.
3. Otherwise run `node.actions.execute(unit, context)`.
