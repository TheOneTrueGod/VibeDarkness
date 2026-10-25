# TODO

## Uncategorised

| Todo | Notes |
|------|-------|

## Trivial

| Todo | Notes |
|------|-------|

## Easy

| Todo | Notes |
|------|-------|

## Medium

| Todo | Notes |
|------|-------|
| Clean up discard duration | Discard duration is confirmed to run on world time (`engine.gameTime`). Consolidate its semantics with ability uses/cooldowns (one shared recovery clock and docs) so time dilation behaves consistently. |
| Implement hit-stop on the time system | Use `HIT_STOP_DEFAULTS` (`game/time/timeConstants.ts`): apply a short tick-time `freeze` `TimeModifier` to attacker and victim (not world pace) so stored momentum resumes afterwards. `MeleeAttack` already calls `requestHitPause(3)`, which is currently a no-op in `GameEngine`. |
| Express death-sequence `storyPause` as a Time Stop | `applyDeathSequence` uses `engine.startStoryPause`. Consider `engine.startTimeStop` with exempt actors so cinematics use tick time and world pace instead of pausing the engine; see `game/time/AGENTS.md` and `game/deathSequences/AGENTS.md`. |
| `TerrainGrid.get()` should return a distinct out-of-bounds result | Today `TerrainGrid.get(col,row)` (`terrain/TerrainGrid.ts:47`) returns `TerrainType.Rock` for out-of-bounds cells, so callers can't tell "real rock" from "off the map" — e.g. an area ability scanning a tile region near the edge counts void cells as rock. Introduce an explicit out-of-bounds sentinel (new `TerrainType.OutOfBounds` or a nullable return) that abilities can respond to, and update the ~12 `grid.get` callers plus pathfinding/passability so off-map still reads as impassable. Medium: touches the `TerrainType` enum, `TERRAIN_PROPERTIES`, `TerrainManager`, `Pathfinding`, and consumers. |

## Hard

| Todo | Notes |
|------|-------|
| Revisit unifying CastBehaviour and EventTriggeredBehaviour interfaces | The EnergyBlast migration introduces EventTriggeredBehaviour (a one-shot onEventTrigger(ctx)) alongside CastBehaviour (multi-tick lifecycle: onSetup/onTick/onInterrupt). A deeper design question is whether these should eventually be unified. Problems to solve first: (1) Lifecycle mismatch — CastBehaviour maintains per-cast state across ticks via behaviourPayload; EventTriggeredBehaviour is fire-and-forget with no persistent state. (2) Context mismatch — CastBehaviourSetupContext carries windowProgress, isFirstTick, behaviourPayload, castPayload; AbilityEventRuntimeContext carries projectile, hitUnit, eventType — fundamentally different shapes that a unified interface must reconcile (union type, common base, or overloaded entry points). (3) Control flow — CastBehaviours are clock-driven (timing intervals); EventTriggeredBehaviours are event-driven (game events) — a unified API must not muddle which drives which. |
