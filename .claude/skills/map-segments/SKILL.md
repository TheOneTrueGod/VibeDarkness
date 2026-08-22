---
name: map-segments
description: Map segments, TerrainGrid stitching, and global grid coords for Minion Battles missions. Use when composing terrain from segments, placing spawns/special tiles, or debugging misaligned maps.
---

# Map Segments

## When to use this skill

Use when:
- Creating or reusing terrain under `storylines/<StorylineId>/MapSegments/`
- Composing mission maps with `stitchTerrain` / `TerrainGrid`
- Translating segment-local coords (spawn, POI) into global grid coords
- Avoiding layout bugs from wrong `stitchTerrain` nesting

## Location and segment shape

- Segments live in `app/js/games/minion_battles/storylines/<StorylineId>/MapSegments/`.
- Each **segment** is `TerrainType[][]`: **outer index = row (north→south in array order)**, inner = columns. Rows should share one width unless you pad explicitly.
- Naming: filenames `{col}_{row}_{description}` for map-macro layout. For stacks that share the same `_col` (e.g. `50_48`, `50_49`, `50_50`), the numeric row part increases **southward** on stitched vertical maps — see segment usage in `WorldOfDarkness/missions/003_light_empowered.ts` and neighbouring files under `MapSegments/`.

## Segment filename = world-grid address

The `{col}_{row}` prefix in a segment filename is its **world segment grid address** — not a local tile index.

- Higher `col` = further **east**; higher `row` = further **south**.
- `50_49` is directly **north** of `50_50`; `50_50` is directly **east** of `49_50`.
- When composing a mission map, arrange segments in the `stitchTerrain` matrix so their grid addresses match spatial layout: **lower col → left column**, **lower row → top row**.

### Example (2×2 mission)

```
stitchTerrain([
  [SEG_49_50, SEG_50_50],   // row 50 (north half)
  [SEG_49_51, SEG_50_51],   // row 51 (south half)
], fill)
```

The **local-grid origin** of any segment at world address `(wc, wr)` is:
- `originCol = (wc - minCol) * segmentWidth`
- `originRow = (wr - minRow) * segmentHeight`

where `minCol` / `minRow` are the smallest world-grid values used in that mission's stitchTerrain matrix.

If a slot has no segment file (e.g. a procedurally-built pad), label its function/constant with the world-grid address it occupies so future readers can orient it on the map.

## `stitchTerrain` — API contract

**Source:** `app/js/games/minion_battles/terrain/TerrainGrid.ts` (`stitchTerrain`, `TerrainGrid.createTerrainFromArray`, `CELL_SIZE`).

- **Argument shape:** `(quadrantGrid, fill)` where `quadrantGrid` is **\[tile row]\[tile col]** — a **matrix of tiles**.
- **Each cell** must be a **full segment**: `TerrainType[][]` (2D). It is **not** a single terrain row, not a 1D strip, and not “half a map” unless you intentionally treat that rectangle as one tile.
- **Layout:** Tiles in one **tile row** are concatenated **left → right**. Tile rows are stacked **top → bottom**.
- **Sizing:** Within one **tile row**, column widths come from each tile’s **first row length** (`tile[0].length`); tile height is `tile.length`. Mismatched widths in the same tile column across tile rows are padded with `fill`.

## Recommended composition patterns

Prefer **one `stitchTerrain` call** whose matrix matches the **mental map** (quadrants or a strip), using **one cell per segment constant**.

- **Horizontal strip (e.g. three 22×22):** one tile row, multiple columns — see `WorldOfDarkness/missions/002_towards_the_light.ts`.
- **Vertical stack (e.g. three 22×22 in one column):** multiple tile rows, one column per row — see `003_light_empowered.ts`.
- **2×2 (or N×M) quadrants:** `[[NW, NE], [SW, SE]]` — each cell is its own `TerrainType[][]` — see `007_ember_threshold.ts`.
- **Layout composer (home + destinations):** `mapLayout` with `{ kind: 'spawn' }` and destination `{ kind: 'segment', id }` cells. Placement is the layout matrix, **not** segment world addresses — so `50_50` can sit beside `0_0`. Source: `terrain/missionLayout.ts`, sample `WorldOfDarkness/missions/010_circle_arena.ts`. Home swaps: `storylines/homeBase.ts`.

This keeps debug/visual “grid of segments” aligned with the code and avoids accidentally treating a hand-built **pre-merged** wide array as a single logical row of segments.

## Anti-patterns

- **Wrong nesting:** Passing a flat list of big arrays at the top level of `stitchTerrain` so that **each row of the mission grid is misread as many horizontal tiles**. The outer array’s **elements must be tile rows**; **each tile row is an array of segments** `[segA, segB, …]`.
- **Mixing abstraction levels:** Merging east/west halves in a loop into one **44×22** matrix, then vertical-stacking with another stitched row, **works numerically** if the final `TerrainGrid.createTerrainFromArray` dimensions match, but **hides quadrant boundaries** and makes POI/global offsets easier to get wrong. Prefer an explicit quadrant matrix when the design is quadrant-based.
- **Irregular segments in one tile row:** If two adjacent tiles differ in height, `stitchTerrain` pads vertically—verify in-game seams.

## Turning stitched data into a `TerrainGrid`

- Usually: `TerrainGrid.createTerrainFromArray(totalCols, totalRows, CELL_SIZE, stitchedArray, fill)`.
- `worldWidth` / `worldHeight` on the mission must equal `totalCols * CELL_SIZE` and `totalRows * CELL_SIZE` (same `CELL_SIZE`).

## Global grid coordinates (spawns, objectives, special tiles)

- **Global** `col` / `row` are **absolute indices** into the **final** stitched array (0…width-1, 0…height-1).
- For a segment placed at **origin** `(originCol, originRow)` in that final grid, a **segment-local** point `(lc, lr)` maps to **`col = originCol + lc`, `row = originRow + lr`**.
- When multiple segments define POIs (e.g. patrol/campfire constants), compute globals from **the segment’s origin in the quadrant layout**, not from mixed deltas off an unrelated landmark—wrong bases produce props in the wrong quadrant.
- **Crystals/campfires** use the same global grid unless the codebase documents otherwise; confirm light radii against `specialTileDefs` / mission defs.

### Examples to read (patterns only)

| Pattern | Mission file |
|--------|----------------|
| 1×3 horizontal | `.../missions/002_towards_the_light.ts` |
| 3×1 vertical | `.../missions/003_light_empowered.ts` |
| 2×2 quadrants | `.../missions/007_ember_threshold.ts` |
| Horizontal pair | `.../missions/005_monster.ts` |

## Points of interest

Segments may export coords (e.g. nest focus, patrol draw); keep **semantic names** segment-local and **shift in the mission** when placing units or tiles.

## Light / darkness (missions)

Outdoor / WoD cave tone often sets `lightLevelEnabled` and `globalLightLevel` on the mission def—compare sibling missions in `WorldOfDarkness/missions/` so new maps do not ship **unshaded** by omission.

## Referenced by

The **missions** skill points here for terrain composition.
