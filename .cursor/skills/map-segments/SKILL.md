---
name: map-segments
description: Create and reuse map segment constants for Minion Battles missions. Use when composing mission terrain from reusable segments.
---

# Map Segments

## When to use this skill

Use this skill when:
- Creating reusable terrain blocks for missions
- Composing multi-segment maps (e.g. cave + path + cliff)
- Sharing terrain between missions (e.g. crystal cave in mission 2 and 3)

## Location

Map segments live in `app/js/games/minion_battles/storylines/<StorylineId>/MapSegments/`.

Each file exports a **map segment constant** with the same name as the file (without extension). For example, `50_50_crystal_cave.ts` exports a constant named after the file.

## Coordinate system

Segment filenames use a coordinate system: `{col}_{row}_{description}`. Example:

- `50_50_crystal_cave` — segment at logical position (50, 50), a crystal cave
- `50_49_cliff_path_north` — segment at (50, 49), north of the cave

Segments are stitched together in a grid. Row numbers decrease going north (50_49 is above 50_50).

## Segment structure

A map segment is a 2D array of `TerrainType` (from `terrain/TerrainType.ts`):

```ts
import { TerrainType } from '../../../terrain/TerrainType';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_50_50_CRYSTAL_CAVE: TerrainType[][] = [
  [R, R, R, ...],
  [_, _, R, ...],
  // ...
];
```

## Points of interest

Segments can export a `pointsOfInterest` object for spawn positions, objectives, and special placements:

```ts
export interface PointOfInterest {
  row: number;
  col: number;
}

export const pointsOfInterest = {
  cave_center: { row: 10, col: 15 },
  north_path: { row: 3, col: 10 },
  south_path: { row: 18, col: 10 },
} as const;
```

Missions use these to place enemies, crystals, campfires, and victory check positions.

## Composing missions

Use `stitchTerrain` from `terrain/TerrainGrid.ts` to combine segments:

```ts
import { stitchTerrain } from '../../../terrain/TerrainGrid';
import { MAP_SEGMENT_50_50_CRYSTAL_CAVE } from '../MapSegments/50_50_crystal_cave';
import { MAP_SEGMENT_50_49_CLIFF_PATH_NORTH } from '../MapSegments/50_49_cliff_path_north';

// quadrantGrid: [tileRow][tileCol] — top row first, then rows below
const stitched = stitchTerrain([
  [MAP_SEGMENT_50_49_CLIFF_PATH_NORTH],  // top
  [MAP_SEGMENT_50_50_CRYSTAL_CAVE],      // bottom
], TerrainType.Grass);
```

## Referenced by

The **missions** skill references this skill for map segment usage.
