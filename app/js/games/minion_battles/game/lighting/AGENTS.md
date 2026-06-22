# Lighting Engine

Darkness is a core mechanic. The lighting engine tracks a per-tile integer light level (0 = full dark, 10 = bright light) and exposes it to the darkness overlay renderer, corruption damage on units, Light Hate enemy weakening, and AI light-seeking behaviour.

Light transitions are gradual (proportional: 10% of remaining delta each light tick, snapping when the step drops below 0.01) to produce smooth fades. An instant-fill pass is applied at mission start so the initial state is correct before tick 0.

## Two-grid design — critical distinction

There are **two separate light grids** with different semantics:

| Grid | How to read | What it represents |
|------|-------------|-------------------|
| `lightTileGrid` (animated) | `ctx.getLightAt(col, row)` | What the **player currently sees** — smoothly animated, lags behind source changes by up to several seconds |
| Fresh target grid | `getLightGrid(ctx.getAllLightSources())` | The **instantaneous target** — reflects current sources immediately, before any animation catch-up |

**Always use `ctx.getLightAt()` for gameplay decisions that must match the visual** (spawn darkness checks, corruption triggers, etc.). Using `getLightGrid()` for these checks causes entities to react to light states the player cannot yet see — e.g. spawning enemies in tiles that still visually glow because a lanternite torch just moved away.

The code currently lives in `GameEngine.ts` and related files; this folder is the intended home for a future `LightingEngine` extraction.

## Key files

| File | Owns |
|------|------|
| `game/LightGrid.ts` | Stateless math: computes target light levels from sources using Manhattan distance, flat zone + linear falloff, 0.25 quantisation |
| `game/lightTileGrid/LightTileGrid.ts` | Persistent per-tile integer grid; serialised in checkpoints |
| `game/lightSources/LightSource.ts` | Light source instance: position, lightAmount, radius, decay config |
| `game/lightSources/LightSourceManager.ts` | Owns active sources; follow-unit tracking, interval and round-end decay |
| `game/darknessLevels.ts` | Threshold constants (FULL_DARKNESS, BRIGHT_LIGHT, SUNLIGHT, etc.) |
| `game/lightHate.ts` | Light Hate keyword: enemies weakened when tile reaches bright light threshold |
| `game/managers/SpecialTileManager.ts` | Campfire light decay (`processSpecialTileLightDecays`) |
| `game/GameEngine.ts` | `setMissionLightConfig`, `applyInstantLightingPass`, `initLightGrid`, `runLightGameTick`, `getLightLevelAt`, `getAllLightSources` |
