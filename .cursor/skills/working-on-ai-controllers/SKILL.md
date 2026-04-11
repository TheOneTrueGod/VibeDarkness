---
name: working-on-ai-controllers
description: When adding or changing enemy unit AI in Minion Battles. Use when working on UnitAITree, AI nodes, or mission AI behaviour.
---

# Working on Unit AI

**See `app/js/games/minion_battles/objects/units/unitAI/SKILL.md` for the full guide.**

## Where it lives

- **`app/js/games/minion_battles/objects/units/unitAI/`** – UnitAITree system. Each unit runs its own tree; no global AIController.

## Quick reference

- **UnitAITree**: Named tree with nodes. Nodes have `actions` (execute, onPathfindingRetrigger) and `edges` (conditions that transition to other nodes in the same tree).
- **unitAITreeId** on Unit: Set when spawning from mission `aiController` or per-unit via `EnemySpawnDef.unitAITreeId` / `SpawnWaveEntry.unitAITreeId`. See `unitAI/index.ts` for available tree IDs.
- **Abilities**: Define AISettings (priority, minRange, maxRange, maxUsesPerRound). Attack nodes use `tryQueueAbilityOrder` which picks best ability by priority.
- **Mission aiController**: Maps to a tree in the registry. See `unitAI/index.ts` for the mapping.

## Adding a new tree

1. Create folder `unitAI/<tree_name>/`.
2. Create nodes: `<tree_name>_<node_name>.ts`.
3. Export tree from `unitAI/<tree_name>/index.ts`.
4. Register in `unitAI/index.ts` TREE_REGISTRY.
