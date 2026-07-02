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
| **EffectManager** | `game/effects/EffectManager.ts` | All visual Effects; render-tick (`renderUpdate`) and game-tick (`gameUpdate`) update paths |
| **EffectEmitterManager** | `game/effects/EffectEmitterManager.ts` | Game-tick emitters that produce Effects each tick; updated in `fixedUpdate` |
| **LightSourceManager** | `game/lightSources/LightSourceManager.ts` | All LightSources; round-based and interval decay, unit-follow, LightGrid feed |
| **CardManager** | `game/managers/CardManager.ts` | Cards, research trees, and ability-use tracking |
| **SpecialTileManager** | `game/managers/SpecialTileManager.ts` | Special tiles, crystal protection, and light sources from tiles |
| **LevelEventManager** | `game/managers/LevelEventManager.ts` | Level events, spawn waves, victory/defeat conditions |

See each manager's file for its public API and `toJSON`/`restoreFromJSON` methods.

## EngineContext Interface

`game/EngineContext.ts` defines the minimal interface that managers use to access the engine. GameEngine implements it and passes `this` to each manager's constructor. Managers store a `ctx: EngineContext` reference and access cross-cutting state through it.

## What lives on `GameState` vs `GameEngine`

**`GameState`** holds: timing scalars (`gameTime`, `gameTick`, `roundNumber`, `snapshotIndex`, `randomSeed`, pause/waiting, `synchash`), `terrainManager`, `pendingOrders`, `localPlayerId`, `aiControllerId`, light config, and all **manager instances**.

**`GameEngine`** holds: `eventBus` (initialized before `GameState` so managers can subscribe during their constructors), **loop state** (`accumulator`, `lastTimestamp`, `animFrameId`, `running`, `synchashUpdateSeq`), **callbacks** (`onWaitingForOrders`, `onCheckpoint`, etc.), and implements the tick loop, RNG methods, turn/order logic, ability execution, AI context, cross-cutting tick helpers, facade API, and `toJSON` / `fromJSON` orchestration.

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
9. Update projectiles, effects (`EffectManager.gameUpdate`), and effect emitters (`EffectEmitterManager.update`)
10. Process card discard timers
11. Cleanup inactive objects
12. Run defeat checks

**Unit death lifecycle (step 6 vs step 11):** `Unit.takeDamage()` sets `unit.active = false` immediately when HP hits 0. The unit stays in `engine.units` until step 11 (`unitManager.cleanupInactive()`). Within the same tick, `engine.getUnit(id)` still returns the dead unit — `getUnit` has no `isAlive()` guard. Code running in step 6 (active abilities) that kills a target CAN still read that target's position in the same tick. Code running on any subsequent tick cannot — the unit has been removed. This ordering matters when you need to snapshot a dying target's position: the snapshot must happen at the end of step 6 (after all abilities have fired but before the function returns), not as a pre-tick pass on the following tick.

**Render-tick updates (outside fixedUpdate):** Purely visual `Effect` objects advance via `EffectManager.renderUpdate(realDt)` every rAF frame regardless of pause state. `EffectEmitterManager.renderUpdate` also runs each frame for `ContinuousEmitter` instances (those with `emitWhilePaused: true` continue emitting even while the game is paused). See `game/effects/AGENTS.md` for the full Effect/EffectEmitter architecture.

## Backward Compatibility

Some types are re-exported from `GameEngine.ts` for backward compatibility. See the file for details.

---

## Law of Demeter for manager objects

All terrain queries must go through `TerrainManager`'s public API. Never reach through a manager's internal fields from outside (e.g. `tm.grid.width` from a caller is a violation; add a helper like `tm.getGridSize()` instead). This applies to all manager objects in the engine: access state through the manager's methods, not by chaining through its fields.

When a caller needs something that currently requires reaching into a manager's internals, add a small helper method on the manager rather than exposing the field.

---

## Patterns

### Static unit properties from unit def

For unit properties that are fixed at spawn and never change at runtime, prefer a **getter on `Unit` that reads the unit def** over copying the value in `combatCcSpawn.ts`:

```typescript
// In Unit.ts
get knockbackResistance(): number {
    return getUnitCombatCcDef(this.characterId)?.knockbackResistance ?? 0;
}
```

- `characterId` is already serialized — no new field or serialization needed.
- The unit def remains the single source of truth.
- No `combatCcSpawn.ts` wiring required.

Use this pattern for any stat that is set once from the def and never mutated at runtime. Stats that *do* change at runtime (e.g. `hardCcArmourConsumed`, `bonusHardCcArmour`) still live as fields on `Unit`.

### Keyword tooltip format

`getTooltipText()` returns an array of strings. Two line types:

| Line type | Format |
|-----------|--------|
| Description line | Prose + inline `{dynamic stats}` (e.g. `` `Deal {${DAMAGE}} damage` ``) |
| Keyword line | Entire line is `{Keyword value}` only (e.g. `'{Bright 3}'`, `'{knockback 1}'`) |

The `{...}` wrapper signals to `AbilityTooltip` that the enclosed text is highlighted in amber.

**Keyword lines** — one keyword per array entry, no periods, no prefixes (`On Block:`), no prose:

```typescript
// Good
return [
    `Deal {${DAMAGE}} damage to enemies in the blast`,
    '{Bright 3}',
];

// Bad — keyword embedded in prose, prefixed, or punctuated
return [
    'Leaves a {Bright 3} at the target point',
    `On Block: Leaves a {Bright 2} flash`,
    `{knockback 3}.`,
];
```

This replaces the old multi-keyword-per-line pattern (e.g. `` `{knockback 1}, {${STUN}s} stun.` `` on one entry). For tone and prose rhythm, see **writing-style-abilities** (`STYLE.md` → Keyword lines [Canon]).
