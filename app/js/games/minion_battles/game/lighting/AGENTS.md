# Lighting Engine

Darkness is a core mechanic. The lighting engine tracks a per-tile integer light level (0 = full dark, 10 = bright light) and exposes it to the darkness overlay renderer, corruption damage on units, Light Hate enemy weakening, and AI light-seeking behaviour.

Light transitions are gradual (±1 per light tick) to produce smooth fades. An instant-fill pass is applied at mission start so the initial state is correct before tick 0.

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
