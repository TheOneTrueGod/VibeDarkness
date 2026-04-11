---
name: game-engine
description: Architecture of the GameEngine manager-of-managers pattern, tick loop, and serialization. Use when working on the engine's tick loop, managers, or checkpoint serialization.
---

# Game Engine Architecture — Manager-of-Managers

## Overview

`GameEngine` (`app/js/games/minion_battles/engine/GameEngine.ts`) is a thin orchestrator that delegates data ownership to specialized manager classes. External code continues to use `engine.units`, `engine.addUnit(u)`, etc. through **facade getters and methods**.

## Manager Ownership

| Manager | File | Owns |
|---------|------|------|
| **UnitManager** | `engine/managers/UnitManager.ts` | All units and unit-related queries |
| **ProjectileManager** | `engine/managers/ProjectileManager.ts` | All projectiles, movement, and collision |
| **EffectManager** | `engine/managers/EffectManager.ts` | All effects, torch decays, and light sources from effects |
| **CardManager** | `engine/managers/CardManager.ts` | Cards, research trees, and ability-use tracking |
| **SpecialTileManager** | `engine/managers/SpecialTileManager.ts` | Special tiles, crystal protection, and light sources from tiles |
| **LevelEventManager** | `engine/managers/LevelEventManager.ts` | Level events, spawn waves, victory/defeat conditions |

See each manager's file for its public API and `toJSON`/`restoreFromJSON` methods.

## EngineContext Interface

`engine/EngineContext.ts` defines the minimal interface that managers use to access the engine. GameEngine implements it and passes `this` to each manager's constructor. Managers store a `ctx: EngineContext` reference and access cross-cutting state through it.

## What Stays in GameEngine

- **Game loop**: `start()`, `stop()`, `loop()`, `fixedUpdate()` orchestration
- **Timing**: `gameTime`, `gameTick`, `roundNumber`, `snapshotIndex`
- **RNG**: `randomSeed`, `generateRandomNumber()`, `generateRandomInteger()`
- **EventBus**: creation and ownership
- **Turn/pause**: `pauseForOrders()`, `applyOrder()`, `queueOrder()`, `resumeAfterOrders()`
- **Ability execution**: `executeAbility()`, `processActiveAbilities()`, `cancelActiveAbility()`, `interruptUnitAndRefundAbilities()`
- **AI context**: `buildAIContext()`
- **Cross-cutting tick logic**: `processCorrupting()`, `processPlayerDarknessCorruption()`, light aggregation
- **Facade getters/methods**: backward-compatible public API
- **Serialization orchestration**: `toJSON()` assembles from managers, `fromJSON()` distributes to managers

## fixedUpdate Flow

See `GameEngine.ts` `fixedUpdate()` for the full tick order. The high-level flow is:

1. Advance timing
2. Apply scheduled orders
3. Process tile and effect light decays
4. Check for round end (card cleanup, torch decay, card cycling)
5. Process level events (spawns, triggers)
6. Process active abilities
7. Process unit ticks (AI, movement)
8. Process crystal aura, corruption, darkness
9. Update projectiles and effects
10. Process card discard timers
11. Cleanup inactive objects
12. Run defeat checks

## Backward Compatibility

Some types are re-exported from `GameEngine.ts` for backward compatibility. See the file for details.
