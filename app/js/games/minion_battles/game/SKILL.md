---
name: game-engine
description: Architecture of the GameEngine manager-of-managers pattern, tick loop, and serialization. Use when working on the engine's tick loop, managers, or checkpoint serialization.
---

# Game Engine Architecture — Manager-of-Managers

## Overview

`GameEngine` (`GameEngine.ts`) orchestrates the tick loop and domain rules. Mutable simulation data (managers, timing scalars, `EventBus`, terrain pointer, `pendingOrders`) lives on **`GameState`** (`GameState.ts`), created as `engine.state`. External code still uses `engine.units`, `engine.addUnit(u)`, etc. through **facade getters and methods** on `GameEngine`.

## Manager Ownership

| Manager | File | Owns |
|---------|------|------|
| **UnitManager** | `game/managers/UnitManager.ts` | All units and unit-related queries |
| **ProjectileManager** | `game/managers/ProjectileManager.ts` | All projectiles, movement, and collision |
| **EffectManager** | `game/managers/EffectManager.ts` | All effects, torch decays, and light sources from effects |
| **CardManager** | `game/managers/CardManager.ts` | Cards, research trees, and ability-use tracking |
| **SpecialTileManager** | `game/managers/SpecialTileManager.ts` | Special tiles, crystal protection, and light sources from tiles |
| **LevelEventManager** | `game/managers/LevelEventManager.ts` | Level events, spawn waves, victory/defeat conditions |

See each manager's file for its public API and `toJSON`/`restoreFromJSON` methods.

## EngineContext Interface

`game/EngineContext.ts` defines the minimal interface that managers use to access the engine. GameEngine implements it and passes `this` to each manager's constructor. Managers store a `ctx: EngineContext` reference and access cross-cutting state through it.

## What lives on `GameState` vs `GameEngine`

**`GameState`** holds: `eventBus`, timing scalars (`gameTime`, `gameTick`, `roundNumber`, `snapshotIndex`, `randomSeed`, pause/waiting, `synchash`), `terrainManager`, `pendingOrders`, `localPlayerId`, `aiControllerId`, light config, and all **manager instances**.

**`GameEngine`** holds: **loop state** (`accumulator`, `lastTimestamp`, `animFrameId`, `running`, `synchashUpdateSeq`), **callbacks** (`onWaitingForOrders`, `onCheckpoint`, etc.), and implements the tick loop, RNG methods, turn/order logic, ability execution, AI context, cross-cutting tick helpers, facade API, and `toJSON` / `fromJSON` orchestration.

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
