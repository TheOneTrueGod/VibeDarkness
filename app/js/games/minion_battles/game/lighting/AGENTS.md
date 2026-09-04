# Lighting Engine

Darkness is a core mechanic. The lighting engine tracks per-tile **typed light channels** plus void darkness, exposes **visibility** to the darkness overlay / corruption / Light Hate / AI, and applies typed gameplay (e.g. DayLight damage to dark creatures).

Light transitions are gradual (proportional: 10% of remaining delta each light tick, snapping when the step drops below 0.01) **per channel and void**. An instant-fill pass is applied at mission start so the initial state is correct before tick 0.

## Light types

| Type | Default emitters | Notes |
|------|------------------|-------|
| `FireLight` | Campfires, torches, Bright defaults, rock explosions | Default when type omitted |
| `DayLight` | Crystals, Light Core tile lights | Damages `dark_creature` units |
| `DarkLight` | Dark crystals | Purple appearance; more effects later |
| `LanternLight` | Lanternites / nests | Green appearance; more effects later |

**Void darkness** (negative `emission`, e.g. Gather Light / Dark Swarm) is **not** `DarkLight`. It only reduces visibility.

### Emission shape

Within `radius`: contribution goes to the source’s `lightType`.
Beyond `radius`: linear falloff contributes to **FireLight** only (same falloff math as before).

### Visibility vs gameplay vs render

| Concern | Rule |
|---------|------|
| Visibility (`getLightAt` / corruption / hide-in-dark / AI) | `globalLightLevel + max(typed channels) + voidDarkness` |
| Typed effects (DayLight DoT, etc.) | Read that channel via `getLightIntensity` — effects stack independently of the render winner |
| Render tint / dominant color | Priority `DayLight > LanternLight ≈ DarkLight > FireLight`; Lantern vs Dark: higher intensity, tie → LanternLight (`pickRenderLightType`) |

## Two-grid design — critical distinction

There are **two separate light grids** with different semantics:

| Grid | How to read | What it represents |
|------|-------------|-------------------|
| `lightTileGrid` (animated) | `ctx.getLightAt(col, row)` / `getLightIntensity` | What the **player currently sees** — smoothly animated, lags behind source changes by up to several seconds |
| Fresh target grid | `computeLightChannelGrid(ctx.getAllLightSources())` | The **instantaneous target** — reflects current sources immediately, before any animation catch-up |

**Always use `ctx.getLightAt()` / `getLightIntensity()` for gameplay decisions that must match the visual** (spawn darkness checks, corruption triggers, DayLight damage, etc.). Using a fresh `computeLightChannelGrid` for these checks causes entities to react to light states the player cannot yet see.

The code currently lives in `GameEngine.ts` and related files; this folder is the intended home for a future `LightingEngine` extraction.

## Key files

| File | Owns |
|------|------|
| `game/lighting/lightTypes.ts` | `LightType`, render priority, tints, visibility helper |
| `game/lighting/dayLightDamage.ts` | DayLight DoT constants + tick |
| `game/lighting/dayLightVfx.ts` | DayLight combat VFX constants, disk-pulse envelope, tile collect |
| `game/LightGrid.ts` | Stateless multi-channel math: flat zone + FireLight falloff, overlap methods, void pool |
| `game/lightTileGrid/LightTileGrid.ts` | Persistent animated channels + void; checkpoint migrate from legacy single-channel |
| `game/lightSources/LightSource.ts` | Runtime emitter: amount, radius, `lightType`, decay |
| `game/lightSources/LightSourceManager.ts` | Follow-unit, decays, grid inputs |
| `game/darknessLevels.ts` | Threshold constants (FULL_DARKNESS, BRIGHT_LIGHT, SUNLIGHT, etc.) |
| `game/lightHate.ts` | Light Hate keyword: enemies weakened when tile reaches bright light threshold |
| `game/managers/SpecialTileManager.ts` | Campfire/crystal light decay; builds typed grid inputs |
| `game/GameEngine.ts` | `setMissionLightConfig`, `applyInstantLightingPass`, `initLightGrid`, `runLightGameTick`, `getLightAt`, `getLightIntensity`, `getDominantLightType`, `getAllLightSources` |
