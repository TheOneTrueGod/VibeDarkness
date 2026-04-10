---
name: game-engine
description: Architecture of the GameEngine manager-of-managers pattern, tick loop, and serialization. Use when working on the engine's tick loop, managers, or checkpoint serialization.
---

# Game Engine Architecture — Manager-of-Managers

## Overview

`GameEngine` (`app/js/games/minion_battles/engine/GameEngine.ts`) is a thin orchestrator that delegates data ownership to six specialized manager classes. External code continues to use `engine.units`, `engine.addUnit(u)`, etc. through **facade getters and methods** — no call-site changes required.

## Manager Ownership

| Manager | File | Owns | Key Methods |
|---------|------|------|-------------|
| **UnitManager** | `engine/managers/UnitManager.ts` | `units: Unit[]` | `addUnit`, `getUnit`, `getUnits`, `getLocalPlayerUnit`, `getAllies`, `processCrystalAura`, `cleanupInactive`, `toJSON`/`restoreFromJSON` |
| **ProjectileManager** | `engine/managers/ProjectileManager.ts` | `projectiles: Projectile[]` | `addProjectile`, `update` (move + collision), `cleanupInactive`, `toJSON`/`restoreFromJSON` |
| **EffectManager** | `engine/managers/EffectManager.ts` | `effects: Effect[]` | `addEffect`, `update`, `processTorchEffectDecays`, `handleRoundEndTorchDecay`, `buildLightSourcesFromEffects`, `cleanupInactive`, `toJSON`/`restoreFromJSON` |
| **CardManager** | `engine/managers/CardManager.ts` | `cards`, `playerResearchTreesByPlayer`, `abilityUsesThisRound` | `onCardUsed`, `drawCardsForPlayer`, `fillHandInnateFirst`, `processDiscardSeconds`, `handleRoundEndCards`, `transferCardToAllyDeck`, `trackAbilityUse`/`getAbilityUsesThisRound`/`clearAbilityUses`, `toJSON`/`restoreFromJSON` |
| **SpecialTileManager** | `engine/managers/SpecialTileManager.ts` | `specialTiles: SpecialTile[]` | `addSpecialTile`, `damageSpecialTile`, `getCrystalProtectionMap`/`Set`/`Count`, `getDarkCrystalFilterSet`, `buildLightSourcesFromSpecialTiles`, `processSpecialTileLightDecays`, `toJSON`/`restoreFromJSON` |
| **LevelEventManager** | `engine/managers/LevelEventManager.ts` | `levelEvents`, `firedEventIndices`, victory/defeat state | `registerLevelEvents`, `setLevelEvents`, `processLevelEvents`, `processSpawnWaveEvent`, `processContinuousSpawnEvent`, `runVictoryChecks`, `runDefeatCheck`, `toJSON`/`restoreFromJSON` |

## EngineContext Interface

`engine/EngineContext.ts` defines the minimal interface that managers use to access the engine. GameEngine implements it and passes `this` to each manager's constructor. Managers store a `ctx: EngineContext` reference and access cross-cutting state (timing, RNG, terrain, other managers' data through facades) through it.

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

```
fixedUpdate(dt)
├── advance gameTime, gameTick
├── apply scheduled orders
├── specialTileManager.processSpecialTileLightDecays()
├── effectManager.processTorchEffectDecays()
├── check round end → handleRoundEnd()
│   ├── cardManager.clearAbilityUses()
│   ├── effectManager.handleRoundEndTorchDecay()
│   └── cardManager.handleRoundEndCards()
├── levelEventManager.processLevelEvents()
├── processActiveAbilities(dt)
├── processUnitTicks(dt)
├── unitManager.processCrystalAura()
├── processCorrupting(dt)
├── processPlayerDarknessCorruption(dt)
├── projectileManager.update(dt)
├── effectManager.update(dt)
├── cardManager.processDiscardSeconds()
├── unitManager.cleanupInactive()
├── projectileManager.cleanupInactive()
├── effectManager.cleanupInactive()
└── levelEventManager.runDefeatCheck()
```

## Re-exported Types

`CardInstance`, `createCardInstance`, `MAX_HAND_SIZE`, `CARDS_PER_ROUND` are defined in `CardManager.ts` and re-exported from `GameEngine.ts` for backward compatibility.

## When to Use This Skill

Use when working on:
- The game engine's tick loop or timing
- Adding/modifying a manager or moving logic between managers
- Serialization (toJSON/fromJSON) for checkpoints
- Understanding which manager owns what data
