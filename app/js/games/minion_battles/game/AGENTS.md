# game/

Core simulation layer for Minion Battles: engine, state, managers, GameObjects, and supporting subsystems.

See `minion_battles/AGENTS.md` for the overall architecture (tick loop, data flow, snapshot model, BattleSession split).

## Subsystem guides

- `game/effects/AGENTS.md` — Effect and EffectEmitter system (visual-only effects vs game-tick factories)
- `game/lighting/AGENTS.md` — Lighting engine: per-tile light grid, source management, decay, darkness corruption
- `game/interaction/AGENTS.md` — Interactive targeting session (ITS) playahead and commit-time in-place vs rollback
- `../terrain/AGENTS.md` — Bedrock grid vs floor/ground/air layers (`TerrainLayerManager` lives in this folder)

## Key files at this level

| File | Purpose |
|------|---------|
| `GameEngine.ts` | Orchestrates the simulation tick, delegates to managers, owns engine lifecycle |
| `GameState.ts` | Mutable battle data: managers, timing, orders, terrain handle |
| `EngineContext.ts` | Interface managers depend on; avoids coupling to the full GameEngine class |
| `BattleSession.ts` | Owns engine + renderer lifecycle for a mission; bridge between React and simulation |
| `TerrainLayerManager.ts` | Floor/ground/air overlays; checkpointed as `terrainEffects` / floor tiles (see `../terrain/AGENTS.md`) |
| `types.ts` | `SerializedGameState`, `BattleOrder`, `OrderAtTick`, and other wire/runtime types |
| `darknessLevels.ts` | Light threshold constants used across lighting, rendering, and gameplay |
| `LightGrid.ts` | Stateless light-level math (see `game/lighting/AGENTS.md`) |
| `lightHate.ts` | Light Hate gameplay keyword |
| `Fingerprint.ts` | Determinism fingerprinting for lockstep sync |
| `EventBus.ts` | Typed in-battle event bus |
| `Camera.ts` | Ephemeral view state (never serialised) |
| `GameRenderer.ts` | Pixi.js drawing; reads engine state each rAF frame |
