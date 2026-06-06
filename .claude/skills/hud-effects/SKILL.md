---
name: hud-effects
description: Screen-space HUD visual effects in Minion Battles rendered via PixiJS. Use when adding banners, flashes, particle streams, or overlay text that must stay fixed to the viewport (not camera-transformed), or when modifying HudEffect, HudEffectLayer, or hudEffects.ts.
---

# HUD Effects

Screen-space effects rendered in `hudContainer` — a second child of `app.stage` that is **never camera-transformed**. All existing game-world effects live in `gameContainer` (camera-transformed). Effects in `hudContainer` stay fixed to the viewport regardless of pan/zoom.

## Key files

| File | Purpose |
|---|---|
| `game/effects/HudEffect.ts` | Base class. No world x/y. `hudEffectType` discriminant, `duration`, `elapsed`, `active`, `progress`, `effectData`. |
| `game/effect_defs/hudEffects.ts` | Concrete subclasses: `RoundStartBannerEffect`, `ScreenFlashEffect`, `TeamworkTextEffect`, `ResourceFlightEffect`, `ResourceArrivalPulseEffect`. |
| `game/GameRenderer/renderers/HudEffectLayer.ts` | Combined manager + renderer. Owns the `HudEffect[]` list, subscribes to engine events, creates/updates/removes Pixi visuals inside `hudContainer`. |
| `game/GameRenderer/GameRenderer.ts` | Holds `hudContainer` (second `app.stage` child) and `HudEffectLayer`. Exposes `addHudEffect(effect)`. |

## Lifecycle rules

- **Not serialized.** HudEffects are never part of `SerializedGameState` or reconnect restoration.
- **Continue during game pause.** `HudEffectLayer.render()` is driven by the rAF render tick, not the fixed game tick. Effects animate through pause screens and order phases.

## Adding a new HudEffect

1. **Subclass `HudEffect`** in `game/effect_defs/hudEffects.ts`:
   - Set `hudEffectType` (string literal, kebab-cased preferred)
   - Set `duration` (seconds)
   - Initialize any `effectData` fields in the constructor
2. **Add visual logic to `HudEffectLayer.ts`**:
   - Add a `case` to `createHudVisual(effect)` — return a `Container` or `Graphics`
   - Add a `case` to `updateHudVisual(visual, effect, vw, vh)` — update position/alpha/scale each frame
3. **Trigger it**:
   - From React code: `sessionRef.current?.getRenderer()?.addHudEffect(new MyEffect())`
   - From an engine event: add an `on`/`off` subscription in `HudEffectLayer` following the `onRoundStart` pattern (lazy-bind-on-render)

## Engine event subscriptions

`HudEffectLayer` detects engine changes inside `render()` and re-subscribes — the same lazy-bind-on-render pattern as `GameRenderer`'s `damage_taken` subscription. **Do not** add explicit `bindToEngine` calls at call sites.

## Sizing

Effects receive `viewportWidth` and `viewportHeight` each frame via `HudEffectLayer.render(engine, vw, vh, realDt)` (sourced from `camera.viewportWidth/Height`). Always use these for centering and full-screen fills. Do not cache viewport size inside effects.

## Canvas boundary limitation

`hudContainer` is clipped to the PixiJS canvas element bounds. It **cannot** render over React UI that sits outside the canvas (AbilityBar, TurnIndicator). `ResourceFlightEffect` particles clamp to canvas bounds when the destination is outside the canvas. A full-viewport overlay canvas would be needed for effects that must reach those areas.

## Current effects

| Class | hudEffectType | Duration | Trigger |
|---|---|---|---|
| `RoundStartBannerEffect` | `RoundStartBanner` | 2.0s | `round_start` event (round > 1) |
| `ScreenFlashEffect` | `ScreenFlash` | 0.5s | manual |
| `TeamworkTextEffect` | `TeamworkText` | 1.1s | teamwork bonus in BattlePhase |
| `ResourceFlightEffect` | `ResourceFlight` | 0.8s | manual |
| `ResourceArrivalPulseEffect` | `ResourceArrivalPulse` | 0.4s | auto-spawned when ResourceFlight completes |
