# Effects System Architecture

This directory contains two distinct classes of objects that both produce visual output:

---

## 1. Effect — purely visual, render-tick animated

`Effect` objects are short-lived visual overlays (impact flashes, particles, floating numbers, etc.) with no game-state side effects. They animate every render frame via `renderUpdate(realDt)`.

### Effect.renderUpdate(realDt)

- Runs **every render frame** (called by `EffectManager.renderUpdate`).
- Advances `this.elapsed`, updates position/velocity, fires expiry check.
- Does **not** access engine context.
- All effects are purely visual — there is no `isGameDriven()` method or `update()` game-logic method.

### TorchProjectile landing

`TorchProjectile` effects set a `landingPending` flag on their `effectData` when travel completes (via `renderUpdate`). `EffectManager.gameUpdate` checks this flag each fixed tick and converts it into a `ctx.addLightSource(...)` call — this is the only remaining coupling between the effects system and engine context.

### Adding a new Effect

1. Pick an `effectType` string (e.g. `'MySparkle'`).
2. Add rendering logic in `effect_defs/` keyed on `effectType`.
3. Optionally add position/motion logic to `renderUpdate()` in `Effect.ts`.
4. Construct it with `new Effect({ x, y, duration, effectType, effectData })` and call `engine.addEffect(effect)`.
5. Keep it purely visual — no `engine` access inside the effect.

---

## 2. EffectEmitter — game-tick factory, produces Effects

`EffectEmitter` subclasses live in `EffectEmitterManager` and are ticked by the game loop. Their job is to **produce new Effect instances** each tick rather than advancing visual state themselves.

### Emitter types

| Class | Behaviour |
|---|---|
| `OneShotEmitter` | Fires once on the first game tick, then deactivates. |
| `IntervalEmitter` | Fires every `intervalSeconds` over a fixed `lifetime`. |
| `ContinuousEmitter` | Fires every render frame (or every N frames) via `renderUpdate`. Supports `emitWhilePaused`. |
| `AlphaWolfStoryEmitter` | Custom emitter: drives the alpha wolf death particle sequence (radial burst + homing particles). |
| `StoryHomingParticleEmitter` | Custom emitter: tracks one homing particle along a bezier path to a target unit. |

### emitWhilePaused

When `emitter.emitWhilePaused = true`, `EffectEmitterManager.renderUpdate` calls the emitter's `renderUpdate()` even while the game is paused. Use this for ambient particle effects that should animate during the pause screen or story pause sequences.

### posSnapshot pattern

`renderUpdate(realDt, posSnapshot)` receives a `Map<string, { x, y }>` of unit world positions snapshotted at render time. `ContinuousEmitter` factories use this to place particles at current unit positions without reading game state directly.

### Serialization note

Factory functions (closures) passed to `OneShotEmitter`, `IntervalEmitter`, and `ContinuousEmitter` constructors are **runtime-only** — they are not serialized. Only scalar state (elapsed, accumulator, etc.) is included in `toJSON()`. This is intentional: emitters are short-lived and re-created by the ability/event that originally spawned them when a reconnect occurs.

Custom subclasses (`AlphaWolfStoryEmitter`, `StoryHomingParticleEmitter`) do serialize their full state (position fields, accumulators, elapsed). Note: `EffectEmitterManager.restoreFromJSON` currently drops all emitters on reconnect — restoring mid-sequence emission is not yet implemented (acceptable since these are cosmetic story effects).

### Adding a new EffectEmitter

1. Create an emitter instance (e.g. `new IntervalEmitter({ x, y, lifetime: 2, intervalSeconds: 0.1, factory: (em, engine) => [...] })`).
2. Register it: `engine.addEffectEmitter(emitter)` (available on `EngineContext`).
3. The `EffectEmitterManager` will tick it during game ticks and collect produced Effects.
4. For render-tick emission (particles through pause), use `ContinuousEmitter` with `emitWhilePaused: true`.
5. To tie the emitter's lifetime to an ability timing window, set `lifetime: Infinity` and call `emitter.active = false` from the ability's completion callback.

---

## Data flow

```
GameEngine.loop() (render tick, ~60 fps)
  ├── EffectManager.renderUpdate(realDt)         ← advances purely visual Effects
  └── EffectEmitterManager.renderUpdate(realDt, posSnapshot, isPaused)
        └── ContinuousEmitter.renderUpdate() → new Effects → EffectManager.addEffect()

GameEngine.fixedUpdate() (game tick, FIXED_DT = 1/60 s, pauses when game pauses)
  └── EffectEmitterManager.update(dt, engine)
        ├── OneShotEmitter.update()   → new Effects
        ├── IntervalEmitter.update()  → new Effects
        ├── AlphaWolfStoryEmitter.update() → new Effects (radial particles + homing emitters)
        ├── StoryHomingParticleEmitter.update() → StoryHomingParticle visual Effects + Pulse at arrival
        └── ContinuousEmitter.update() → tracks elapsed/expiry only, returns []
              → collected Effects → EffectManager.addEffect()
```

---

## Phase notes

- **Phase 2**: Added `renderUpdate` / `isGameDriven` separation and `EffectEmitter` infrastructure.
- **Phase 3 (complete)**: Migrated `AlphaWolfStoryController` and `StoryHomingParticle` to custom `EffectEmitter` subclasses. `Effect.isGameDriven()` and `Effect.update()` have been removed. Effects are no longer serialized — `Effect.toJSON()` / `fromJSON()` and `EffectManager.toJSON()` / `restoreFromJSON()` have been removed. `EffectManager.gameUpdate()` is retained (handles TorchProjectile landing only).
