---
name: map-segments
description: Create and reuse map segment constants for Minion Battles missions. Use when composing mission terrain from reusable segments.
---

# Map Segments

## When to use this skill

Use this skill when:
- Creating reusable terrain blocks for missions
- Composing multi-segment maps (e.g. cave + path + cliff)
- Sharing terrain between missions

## Location

Map segments live in `app/js/games/minion_battles/storylines/<StorylineId>/MapSegments/`.

Each file exports a **map segment constant** with the same name as the file (without extension).

## Coordinate system

Segment filenames use the convention `{col}_{row}_{description}`. Segments are stitched together in a grid. Row numbers decrease going north (e.g. `50_49` is above `50_50`).

## Segment structure

A map segment is a 2D array of `TerrainType` (from `terrain/TerrainType.ts`). Use single-character aliases for readability. See existing segment files under `MapSegments/` for the convention and available terrain types.

## Points of interest

Segments can export a `pointsOfInterest` object with named row/col positions for spawn locations, objectives, and special placements. See existing segment files for the pattern.

## Composing missions

Use `stitchTerrain` from `terrain/TerrainGrid.ts` to combine segments into a full map grid. See existing mission files for composition examples.

## Referenced by

The **missions** skill references this skill for map segment usage.
