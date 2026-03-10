---
name: working-on-ai-controllers
description: When adding or changing enemy unit AI in Minion Battles. Use when working on AI controllers, mission AI behaviour, UnitAIController implementations, or state-based AI states.
---

# Working on AI Controllers

## Where it lives

- **`app/js/games/minion_battles/storylines/ai/`** – Unit AI: interface, utils, controller implementations, and state-based AI states.
- **Interface**: `UnitAIController` in `storylines/ai/types.ts` – defines `executeTurn(unit, context)` and optional `onPathfindingRetrigger(unit, context)`.
- **Factory**: `buildAIController(aiControllerId?)` in `storylines/ai/index.ts` – returns the controller for a mission; default `'legacy'` when mission does not set `aiController`.
- **Mission**: Set `aiController: 'legacy' | 'defensePoints' | 'stateBased'` on the mission def; engine gets `aiControllerId` from mission at init or from serialized state on restore.

## State-based AI (stateBased controller)

When `aiController: 'stateBased'`, the unit’s behaviour is driven by an **AIState** object. The current state is stored as **JSON** in `unit.aiContext.aiStateSerialized` so it can be sent to/from the server; the controller deserializes it each turn and runs the state.

### Structure

- **Base class**: `storylines/ai/states/AIState.ts` – Abstract base. Defines:
  - `stateId`, `executeTurn(unit, context)`, optional `onPathfindingRetrigger(unit, context)`
  - `toJSON()` / `static fromJSON(data)` for serialization
  - Helper: `protected setState(unit, newState)` to transition and persist
- **One file per state** under `storylines/ai/states/`:
  - `IdleState.ts` – Start state: scan for enemies → Attack; else defend points → SiegeDefendPoint; else light sources → FindLight; else → Wander.
  - `AttackState.ts` – Move to ideal range, use ability on target; transition to Idle if target gone.
  - `SiegeDefendPointState.ts` – Move to defend point, corrupt when close; scan for hostiles and engage in place.
  - `FindLightState.ts` – Move toward a light source (e.g. Torch effect); idle ~¼ round at destination then pick another light.
  - `WanderState.ts` – Pick random walkable tile within 4 cells and move toward it.
- **Registry**: `storylines/ai/states/index.ts` registers each state’s `fromJSON` so `AIState.fromJSON(data)` can reconstruct the correct class from `data.stateId`.
- **Controller**: `StateBasedAIController` in `storylines/ai/StateBasedAIController.ts` – Gets state via `AIState.fromJSON(unit.aiContext.aiStateSerialized ?? { stateId: 'idle' })`, then calls `state.executeTurn(unit, context)` (and `onPathfindingRetrigger` when applicable).

### Conventions for states

- Each state’s `executeTurn` should read like a short list of steps; reuse logic via **helper methods** on the state or on the base `AIState`.
- To **transition**, call `this.setState(unit, new SomeState({ ... }))`; that updates `unit.aiContext.aiStateSerialized` with the new state’s `toJSON()`.
- States must be **serializable**: all data needed to restore the state goes in `toJSON()` and is restored in `static fromJSON(data)`.
- Add new states by: (1) implementing the class and `toJSON`/`fromJSON`, (2) registering in `states/index.ts` with `AIState.register('myState', (d) => MyState.fromJSON(d))`, (3) using `stateId: 'myState'` in the serialized form.

## Rules

1. **No state in the controller** – Controllers are stateless. Persistent data lives on the **unit** or in **game state** and must be **serialized** (Unit `toJSON`/`fromJSON`, `SerializedGameState`).
   - For per-unit AI state: use `unit.aiContext` (see `UnitAIContext` in `objects/Unit.ts`). For the **stateBased** controller, the current state is stored as JSON in `unit.aiContext.aiStateSerialized`; do not add new top-level unit fields for state-based state.
2. **Reuse shared behaviour** – Use `storylines/ai/utils.ts` and existing controllers/states. Hoist common logic into utils or into base `AIState` helpers.

## Adding a new controller (non–state-based)

1. Implement `UnitAIController` in a new file under `storylines/ai/` (e.g. `MyAIController.ts`).
2. Register it in `storylines/ai/index.ts`: add to `AIControllerId` in `storylines/types.ts`, add to `CONTROLLERS` and factory in `storylines/ai/index.ts`.
3. Assign the mission: set `aiController: 'myController'` on the mission class.
4. Use `AIContext` only; persist any new state in `unit.aiContext` (or game state) and serialize it.

## Adding a new AIState (stateBased)

1. Create `storylines/ai/states/MyState.ts`: extend `AIState`, implement `executeTurn`, `toJSON`, and `static fromJSON`.
2. Register in `storylines/ai/states/index.ts`: `AIState.register('myState', (d) => MyState.fromJSON(d))`.
3. Transition to it from another state with `this.setState(unit, new MyState({ ... }))`.

## Reference

- **LegacyAIController** – Default: random enemy, move to AISettings range, use first ability with valid target or wait.
- **DefensePointsAIController** – Move toward nearest alive DefendPoint; engage hostiles in perception + LOS; move to range and use ability. State in `unit.aiContext`.
- **StateBasedAIController** – Delegates to current `AIState`; state persisted in `unit.aiContext.aiStateSerialized` as JSON.
- **AIContext** includes `getLightSources()` (for FindLight) and the usual `getUnit`, `getUnits`, `getAliveDefendPoints`, `terrainManager`, `queueOrder`, `emitTurnEnd`, etc.
- **Utils**: `findEnemies`, `findAIAbilityTarget`, `buildResolvedTargets`, `applyAIMovementToUnit`, `applyAIMovementToPosition`, `getOrPickClosestDefendPoint`, `getEnemiesInPerceptionAndLOS`, `tryQueueAbilityOrder`, `queueWaitAndEndTurn`.
