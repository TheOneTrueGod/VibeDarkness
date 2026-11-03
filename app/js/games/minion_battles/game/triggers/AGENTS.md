# game/triggers/

Mission triggers in the Warcraft III style: a mission lists `TriggerDef`s (plain JSON) on `triggers`. Each tick, an **event** may fire; if every **condition** holds, the **actions** run in order.

| File | Owns |
|------|------|
| `triggerTypes.ts` | The data model: `TriggerDef`, `TriggerEvent`, `TriggerCondition`, `TriggerAction`, regions, unit filters. |
| `TriggerManager.ts` | Event detection, condition checks, action dispatch, and checkpoint state (`toJSON` / `restoreFromJSON`). |
| `missionConditions.ts` | `evaluateVictoryCondition` (shared with victory checks) and `evaluateTriggerCondition` (adds `and` / `or` / `not` / `triggerFired`). |

## How it runs

- `LevelEventManager` owns the `TriggerManager`. It runs triggers at the start of `processLevelEvents`, before level events, and supplies spawning and messaging through `TriggerActionHost`.
- `BaseMissionDef.initializeGameState` calls `engine.registerTriggers`. Checkpoint loads (`sessionLoad.ts`) call `engine.setTriggers`, which keeps the restored state. That state is serialized as `triggerState` beside the level-event fields.
- Level events can be gated on triggers with `afterTrigger` / `untilTrigger`, the same way they are gated on objectives. A gated `continuousSpawn` starts its interval when the trigger fires.

## Semantics

- `unitEntersRegion` is edge-triggered: it fires once per matching unit that is inside now and was not on the previous check. A unit that appears inside the region also counts. Region membership is tracked even while a trigger is disabled or spent, so turning a trigger on never fires for units already standing inside.
- `fireOnce` defaults to true, and `enabled` defaults to true.
- The triggering unit is passed to actions. `spawnWave.nearTriggeringUnit` uses it.

## Adding to the system

- **Event:** add a member to `TriggerEvent` and a `case` in `TriggerManager.collectEventFirings`. Any per-event memory goes in serialized state, keyed `${triggerId}#${eventIndex}`.
- **Condition:** add a `VictoryCondition` leaf (it then works for victory checks too) or a trigger-only member in `evaluateTriggerCondition`.
- **Action:** add a member to `TriggerAction` and a `case` in `TriggerManager.runAction`. Reach engine services through `TriggerActionHost`; do not import managers directly.
- Never rename a trigger `id` that has shipped: checkpoints key state by it.
