# terrain/

Mission bedrock grid, pathfinding, and the TerrainManager façade. Mutable overlays (created rock, bramble, thorns) live on **`TerrainLayerManager`** in `game/`, not on this folder’s bedrock grid.

## Folder map

| Path | Owns |
|------|------|
| `TerrainGrid.ts` | Immutable mission bedrock cells after load. |
| `TerrainManager.ts` | Rock helpers + pathfinder; delegates floor mutations to `engine.terrainLayers`. |
| `FloorTile.ts` / related | Effective terrain = bedrock + floor-layer overrides. |
| Pathfinding helpers | A* / occupancy used by movement and AI. |

## Layers (owned under `game/`)

| Layer | Role |
|-------|------|
| Bedrock | `TerrainGrid` — not a `TerrainLayerName`. |
| Floor | Persistent cell mods (`created_rock`, rock damage state) + `floorTiles` in checkpoints. |
| Ground | Magical ground effects (`bramble_slow`, `dark_thorn`, …). |
| Air | Reserved; few consumers yet. |

Core API: `game/TerrainLayerManager.ts` (`add` / `remove` / `removeByOwner` / movement multipliers / floor overrides). Checkpoints expose `terrainEffects` (and floor tiles) on `SerializedGameState`. `GameEngine.fromJSON` must restore `terrainLayers` **before** `terrainManager.setTerrainLayers` so pathfinding sees rocks.

Ground/air overlays: `game/GameRenderer/renderers/TerrainEffectRenderer.ts` and visuals in `game/GameRenderer/terrainEffectDefs.ts`.
