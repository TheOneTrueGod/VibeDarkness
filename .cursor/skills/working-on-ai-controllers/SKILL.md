---
name: working-on-ai-controllers
description: When adding or changing enemy unit AI in Minion Battles. Use when working on AI controllers, mission AI behaviour, or UnitAIController implementations.
---

# Working on AI Controllers

## Where it lives

- **`app/js/games/minion_battles/missions/ai/`** – All unit AI: interface, utils, and controller implementations.
- **Interface**: `UnitAIController` in `missions/ai/types.ts` – defines `executeTurn(unit, context)` and optional `onPathfindingRetrigger(unit, context)`.
- **Factory**: `buildAIController(aiControllerId?)` in `missions/ai/index.ts` – returns the controller for a mission; default `'legacy'` when mission does not set `aiController`.
- **Mission**: Set `aiController: 'legacy' | 'defensePoints'` on the mission def; engine gets `aiControllerId` from mission at init or from serialized state on restore.

## Rules

1. **No state in the controller** – Controllers are stateless. Any data that must persist (e.g. `defensePointTarget`, `aiTargetUnitId`) lives on the **unit** or in **game state** and must be **serialized** (Unit `toJSON`/`fromJSON`, `SerializedGameState`).
2. **Reuse shared behaviour** – Before adding logic to a new controller, check `missions/ai/utils.ts` and existing controllers (e.g. `LegacyAIController`, `DefensePointsAIController`). If several controllers would do the same thing (e.g. pick ability target, move to range), **hoist it into utils** or into a shared helper used by multiple controllers.

## Adding a new controller

1. Implement `UnitAIController` in a new file under `missions/ai/` (e.g. `MyAIController.ts`).
2. Register it in `missions/ai/index.ts`: add to `AIControllerId` in `missions/types.ts`, add to `CONTROLLERS` and factory in `missions/ai/index.ts`.
3. Assign the mission: set `aiController: 'myController'` on the mission class.
4. Use `AIContext` only (no engine reference); persist any new state on the unit or game state and serialize it.

## Reference

- **LegacyAIController** – Default: random enemy, move to AISettings range, use first ability with valid target or wait.
- **DefensePointsAIController** – Move toward nearest alive DefendPoint; engage hostiles in perception range with line-of-sight (rocks block); move to range and use ability.
- **Utils**: `findEnemies`, `findAIAbilityTarget`, `buildResolvedTargets`, `applyAIMovementToUnit`, `applyAIMovementToPosition`.
