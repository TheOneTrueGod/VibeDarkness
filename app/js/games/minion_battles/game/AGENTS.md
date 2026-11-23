# game/

Core simulation layer for Minion Battles: engine, state, managers, GameObjects, and supporting subsystems.

See `minion_battles/AGENTS.md` for the overall architecture (tick loop, data flow, snapshot model, BattleSession split).

## Subsystem guides

- `game/effects/AGENTS.md` — Effect and EffectEmitter system (visual-only effects vs game-tick factories)
- `game/deployables/AGENTS.md` — Deployable contract and registry: map objects abilities can find and consume
- `game/lighting/AGENTS.md` — Lighting engine: per-tile light grid, source management, decay, darkness corruption
- `game/visibility/AGENTS.md` — Senses and team perception (seen / glimpsed / heard / felt / hidden); presentation-only
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

## Exile (units temporarily out of play)

`UnitManager.exiledUnits` holds units that are **not** in `units`, so ticks, AI, collision, rendering, targeting and pet lookups skip them with no special cases. Entry points (on `GameEngine` and `EngineContext`): `exileUnit(unit, { reason, anchorUnitId?, returnAtGameTime? })` (cancels casts with no refund, clears movement, emits `unit_exiled`), `returnExiledUnit(unitId, at?)` (emits `unit_returned`; no-op for a unit that is not exiled), `getExiledUnit(id)`, `getExiledUnits()`. `getUnit(id)` only finds units in play. Returns are data-driven: once per tick the engine returns a unit whose `returnAtGameTime` has passed, or whose anchor died or vanished (at the anchor's last position). Users that return the unit themselves pass `returnAtGameTime: null`. Records round-trip through the snapshot as the optional `exiledUnits` key. Logic lives in `units/exile.ts`.
