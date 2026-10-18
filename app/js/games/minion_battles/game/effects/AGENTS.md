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

**Particle batching:** `ParticleImage` / `StoryHomingParticle` draw through a Pixi `ParticleContainer` in `game/GameRenderer/renderers/EffectRenderer.ts` (shared `darkBlob` texture). Other effect types that need nested Containers stay on the normal sprite path.

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
| `SpriteFountainEmitter` | Data-driven emitter streaming named `SpriteEffect`s from a point with angle bias, horizontal-only launch, per-axis damping and upward accel (flame-like plumes). Config: `SpriteFountainConfig`. |
| `StoryHomingParticleEmitter` | Custom emitter: tracks one homing particle along a bezier path to a target unit. |

### pauseBehaviour (readability at a pause plane)

`GameEngine.isSimulationHalted` is true while game ticks are not running: explicit pause, a parallel order batch (pause plane), waiting for target input, host catch-up, or a finished level. Story pauses are not halts. While halted, every effect and emitter follows its `pauseBehaviour` (`pauseBehaviour.ts`):

| Value | Effect | Emitter |
|---|---|---|
| `'continue'` | keeps ageing on wall time | keeps emitting from the render loop (`renderUpdateWhileHalted`) |
| `'hold'` | freezes in its current pose | stops emitting; timers frozen |
| `'stop'` | removed | deactivated |

Defaults keep older behaviour: effects `'continue'` (but `timeDomain` `'world'`/`'owner'` effects `'hold'`), emitters `'hold'`. Ability-timing emitters from `createEmitterFromDef` default to `'continue'` so windups and channels stay readable; a def can set `pauseBehaviour` to opt out. The legacy `emitWhilePaused` flag maps to `'continue'`.

Pick the value by what the visual means:
- State that is still true while paused (fields, auras, windups, channels): `'continue'`.
- A snapshot of motion (dash / dig afterimages): `'hold'`, so the trail stays visible instead of fading to nothing or stacking on a stopped unit.
- Nothing useful to show while paused: `'stop'`.

`IntervalEmitter.renderUpdateWhileHalted` keeps its cadence on a transient accumulator and never touches the serialized `elapsed` / `accumulator`, so checkpoints stay identical across clients. Factories that run while halted run a frame-rate-dependent number of times, so they must never use engine RNG or change game state.

### Buff render emission

Buff-driven visuals go through `BuffRenderEmitterSystem` (`buffParticleAura.ts`), called from `GameEngine.doRenderTick` on wall time, including while halted:
- `Buff.particleAura` (def property): idle orbs / moving speed lines (preset `BUFF_PARTICLE_AURA_PRESETS.tempo`, used by `TimeDilationBuff`). "Moving" also counts a unit that still has a movement path, so a paused unit with a queued move keeps its speed lines.
- `Buff.renderEmit(unit, ctx)`: free-form visual emission for the state a buff represents (Gravity Locus's field uses it). Derived from serialized buff state every frame, so it is reconnect-safe. Prefer this over emitting visuals from `onGameTick`, which goes blank at a pause plane.

### posSnapshot pattern

`renderUpdate(realDt, posSnapshot)` receives a `Map<string, { x, y }>` of unit world positions snapshotted at render time. `ContinuousEmitter` factories use this to place particles at current unit positions without reading game state directly.

### Serialization note

Factory functions (closures) passed to `OneShotEmitter`, `IntervalEmitter`, and `ContinuousEmitter` constructors are **runtime-only** — they are not serialized. Only scalar state (elapsed, accumulator, etc.) is included in `toJSON()`. This is intentional: emitters are short-lived and re-created by the ability/event that originally spawned them when a reconnect occurs.

Custom subclasses (`AlphaWolfStoryEmitter`, `StoryHomingParticleEmitter`) do serialize their full state (position fields, accumulators, elapsed). Note: `EffectEmitterManager.restoreFromJSON` currently drops all emitters on reconnect — restoring mid-sequence emission is not yet implemented (acceptable since these are cosmetic story effects).

### Adding a new EffectEmitter

1. Create an emitter instance (e.g. `new IntervalEmitter({ x, y, lifetime: 2, intervalSeconds: 0.1, factory: (em, engine) => [...] })`).
2. Register it: `engine.addEffectEmitter(emitter)` (available on `EngineContext`).
3. The `EffectEmitterManager` will tick it during game ticks and collect produced Effects.
4. Choose a `pauseBehaviour` (see below). For a visual tied to a buff, use `Buff.renderEmit` / `Buff.particleAura` instead of an emitter.
5. To tie the emitter's lifetime to an ability timing window, set `lifetime: Infinity` and call `emitter.active = false` from the ability's completion callback.

---

## Data flow

```
GameEngine.loop() (render tick, ~60 fps)
  ├── EffectManager.renderUpdate(realDt)         ← advances purely visual Effects
  └── EffectEmitterManager.renderUpdate(realDt, posSnapshot, isPaused)
        └── ContinuousEmitter.renderUpdate() → new Effects → EffectManager.addEffect()

GameEngine.fixedUpdate() (game tick, FIXED_DT = 1/60 s; pauses on regular pause and waitingForOrders,
  but continues during storyPause — EffectEmitterManager.update runs unconditionally either way)
  └── EffectEmitterManager.update(dt, engine)
        ├── OneShotEmitter.update()   → new Effects
        ├── IntervalEmitter.update()  → new Effects
        ├── AlphaWolfStoryEmitter.update() → new Effects (radial particles + homing emitters)
        ├── StoryHomingParticleEmitter.update() → StoryHomingParticle visual Effects + Pulse at arrival
        └── ContinuousEmitter.update() → tracks elapsed/expiry only, returns []
              → collected Effects → EffectManager.addEffect()
```

---

## 3. HudEffect — screen-space HUD effects

`HudEffect` objects (`HudEffect.ts`) are purely visual, like `Effect`, but live in **screen space** (no world x/y) and render in `hudContainer` on `app.stage`. `hudContainer` is a second child of `app.stage` that never receives the camera transform, so effects remain viewport-fixed regardless of pan/zoom.

**Rules:**
- **Never serialized** — client-side visual polish only. Not restored on reconnect. If a player reconnects mid-effect, it simply doesn't replay.
- **Continue during game pause** — `HudEffectLayer.render()` is called from the render tick (rAF), not the fixed game tick. Effects keep animating through pause screens, story pauses, and order phases.
- Managed by `HudEffectLayer` (`GameRenderer/renderers/HudEffectLayer.ts`).
- Triggered via `GameRenderer.addHudEffect(effect)` or by `HudEffectLayer`'s engine event subscriptions (e.g. `round_start`).

**Concrete types** (in `game/effect_defs/hudEffects.ts`):
| Type | Trigger | Duration |
|---|---|---|
| `RoundStartBannerEffect` | `round_start` (round > 1) | 2.0s |
| `ScreenFlashEffect` | manual | 0.5s |
| `TeamworkTextEffect` | teamwork bonus detected in BattlePhase | 1.1s |
| `ResourceFlightEffect` | manual | 0.8s |
| `ResourceArrivalPulseEffect` | auto-spawned by layer when ResourceFlight completes | 0.4s |

**Future:** When stamina meters and resource meters are added to the HUD, `ResourceFlightEffect` and `ResourceArrivalPulseEffect` should be the standard visual for resource transfers. Destination positions for meters will need a position registry so HUD effects can target them accurately. Currently effects are clipped to canvas bounds — a full-viewport overlay canvas would be needed for effects that must reach the AbilityBar or TurnIndicator areas.

### Adding a new HudEffect
1. Subclass `HudEffect` in `game/effect_defs/hudEffects.ts`. Set `hudEffectType`, `duration`, and any `effectData` fields in the constructor.
2. Add a `case` to `createHudVisual` and `updateHudVisual` in `HudEffectLayer.ts`.
3. Trigger via `renderer.addHudEffect(new MyEffect())` from BattlePhase, or add a new engine event subscription in `HudEffectLayer` following the `onRoundStart` pattern.

---

## timeDomain (time dilation override)

See also `game/time/AGENTS.md` (vocabulary, which-clock list) and the **time-dilation** skill.

Effects and emitters ignore tempo and world pace by default (`timeDomain` undefined or `'wall'`, identical to pre-dilation behaviour). Opt in with `timeDomain: 'world' | 'owner'` on `Effect`, `EffectEmitter`, `DirectEffectVFXDef` or `AbilityTimingEmitterDef` (`createEmitterFromDef` passes it through and sets the owner to the caster).

- `'world'`: elapsed time, `TorchProjectile` `ticksAlive`, emitter `dt` and `ContinuousEmitter.emitIntervalFrames` cadence scale by `engine.worldPace`.
- `'owner'`: scale by `timeManager.getStepRate(owner, tempo)`. Owner = `ownerActorId` (emitters fall back to `attachedToUnitId`, torch effects to `effectData.ownerUnitId`); no owner resolves to world pace. Per-unit tempo comes from `EffectManager.ownerTempoResolver` / `EffectEmitterManager.ownerTempoResolver`, which `GameState` wires to `getActorTempo(owner)`.
- Rate math lives in `timeDomain.ts` (`resolveTimeDomainRate`); the managers scale `dt` before calling `renderUpdate` / `update`, so effects themselves stay engine-free. Time Stop (pace 0) pauses non-wall effects.
- Serialized on emitters only when non-default. Effects are not serialized.

---

## Phase notes

- **Phase 2**: Added `renderUpdate` / `isGameDriven` separation and `EffectEmitter` infrastructure.
- **Phase 3 (complete)**: Migrated `AlphaWolfStoryController` and `StoryHomingParticle` to custom `EffectEmitter` subclasses. `Effect.isGameDriven()` and `Effect.update()` have been removed. Effects are no longer serialized — `Effect.toJSON()` / `fromJSON()` and `EffectManager.toJSON()` / `restoreFromJSON()` have been removed. `EffectManager.gameUpdate()` is retained (handles TorchProjectile landing only).
