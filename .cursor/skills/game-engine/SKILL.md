---
name: game-engine
description: Architecture of the GameEngine manager-of-managers pattern, tick loop, and serialization. Use when working on the engine's tick loop, managers, or checkpoint serialization.
---

# Game Engine

**Multiplayer naming:** While paused for parallel orders, **`gameTick`** is **last fully completed** (same as **`clientTick`**). The batch under collection uses **`waitingForOrders.atTick`**. **`serverTick`** / heartbeat **`hostTick`** mirror last completed after server clamp — see **`game-sync-data-flow`**.

**See `app/js/games/minion_battles/game/SKILL.md` for the full guide.**

**Time dilation:** the tick loop resolves world pace, advances `gameTime` by world pace, and steps each unit/projectile on its own local time (tempo, step pieces, Time Stop). Read the **time-dilation** skill and `app/js/games/minion_battles/game/time/AGENTS.md` before touching clocks; pace 1 must stay byte-identical.

## Unit components (per-enemy state and behaviour)

`Unit` has no per-enemy-type fields. Enemy-specific state and hooks are **components**: a def declares `components: [componentSpec(LANTERNITE_COMPONENT, { role: 'nest' })]`, state lives in `unit.components` and is read through typed accessors (`lanterniteStateOf`, `swarmStateOf`, `petStateOf`; the `peek*` variants never attach and are for scans over all units). A component type (`units/components/unitComponent.ts`) owns `create`, `toJSON`, `fromJSON`; each slice writes its own top-level keys into the unit JSON (so adding or moving a component does not change the checkpoint shape as long as the keys are kept). Behaviour hooks (`tick`, `lateTick`, `onRoundMilestone`, `onDeath`) live in `units/components/unitComponentHooks.ts`, which also lists the dispatch order; `GameEngine` calls the dispatchers at the old call sites and never names an enemy type. Spawners share `units/components/spawnerCore.ts` (`SpawnerSpec`, `tickSpawner`, `spawnSpawnerChildren`). Worked example: `game/lanternite/AGENTS.md`.

## Checkpoint versioning (read before changing serialized state)

`GameEngine.toJSON` writes `serializationVersion` (`SERIALIZED_GAME_STATE_VERSION`); a missing field means version 0. `GameEngine.fromJSON` calls `upgradeSerializedGameState` (`game/serializedGameStateUpgrade.ts`) before it reads anything, so live checkpoints, recovery/resync, replay and ability tests all get upgraded. Any new code that deserializes a game state must go through `GameEngine.fromJSON` (never read checkpoint fields directly without upgrading).

Checkpoints live server-side and are replayed by clients, so battles can be mid-flight during a deploy. When you rename, remove, retype or restructure a serialized field (additive optional fields with a safe default in `fromJSON` don't need a step):

1. Append ONE step to `UPGRADE_STEPS` in `serializedGameStateUpgrade.ts`. Index N upgrades version N to N + 1; the current version is `UPGRADE_STEPS.length`, so there is no number to bump.
2. The step takes the raw JSON and returns a new object (no mutation). Never edit or reorder shipped steps.
3. Add a test beside `serializedGameStateUpgrade.test.ts` that feeds an old-shape checkpoint through `GameEngine.fromJSON`.

A checkpoint with a version NEWER than the build throws `UnsupportedCheckpointVersionError` (an old client must not misread new data; reload to get the new build). The version is not part of the runtime fingerprint (a rolling hash of events), so mixed-version hosts and clients compare equal.

**Old clients during a deploy:** a browser can still be running the previous build when the server starts storing new checkpoints. Removing a field the old build reads unconditionally will crash it. Keep writing a harmless placeholder for one release, as `toJSON` does with `cards: {}` (see `SerializedGameState.cards`), then remove it later with its own upgrade step.
