---
name: resync-terrain
description: Imports terrain-editor changes from storage JSON into TypeScript MapSegment files. Use when the user asks to "import terrain editor changes", "resync terrain", or "update a MapSegment from the editor".
---

# Resync Terrain — Importing Editor Changes into TypeScript

The terrain editor saves painted terrain to `storage/terrain-segments/{id}.json` (PHP PUT handler writes it there). The TypeScript MapSegment arrays are the canonical source that ships with the codebase; they must be kept in sync after editing.

## Step 1 — Find the saved JSON(s)

```
storage/terrain-segments/*.json
```

Each file is named `{segmentId}.json`. The `id` field inside matches the segment file name (e.g. `50_51_south_gate`). Only segments the user explicitly saved in the editor will have a file here.

## Step 2 — Locate the matching TypeScript file

```
app/js/games/minion_battles/storylines/WorldOfDarkness/MapSegments/{id}.ts
```

## Step 3 — TerrainType numeric mapping

The JSON stores terrain as integers. The enum values are in `app/js/games/minion_battles/terrain/TerrainType.ts`. Each MapSegment file also defines local `const` shorthand aliases at the top (e.g. `const _ = TerrainType.Grass`) — read those from the file being updated to know which shorthands to use when writing rows.

## Step 4 — Update the terrain array

Replace the `MAP_SEGMENT_*` array body row-by-row, translating each integer to its shorthand. Keep the 22-column-per-row formatting and one row per line.

## Step 5 — Update exported POI constants

The JSON has a `pointsOfInterest` array. Each entry has `id`, `label`, `col`, `row`, and `type`. The TS file may export named constants derived from these positions (e.g. `PATROL_DRAW_POINT`, `LANTERN_NEST_FOCUS`). Compare JSON POI `col`/`row` values against the exported constants and update any that have moved.

The POI `id` field is the link: a POI whose `id` matches the snake_case of an exported constant name is the one to sync (e.g. `"patrol_draw_point"` → `PATROL_DRAW_POINT`). POIs with auto-generated ids (short alphanumeric like `"mpk1zkhj"`) are editor-only and don't need a TS export unless the mission imports them.

## Step 6 — Check mission imports

If a POI constant's value changed, verify the mission file that imports it still places enemies/objectives/tiles at sensible positions. Run `npm run lint` to catch type errors.

## Runtime note

`getTerrainForSegment(id, fallback)` in `terrain/segmentRegistry.ts` prefers the runtime registry (populated from the server's JSON) over the TS array. After syncing, the TS file and the JSON will agree, so behaviour is identical whether the server JSON is present or not.

## Common pitfalls

- **Both segment TS files had identical terrain** — copy-paste from segment creation. Confirm the JSON files are distinct before writing.
- **User names segment as "col_row" vs "row_col"** — the naming convention is `{col}_{row}_{name}`. Cross-check against `segmentIds` in the mission file and against `gridCol`/`gridRow` in the JSON to confirm which segment the user means.
- **No JSON file for a segment** — it was never saved from the editor. Ask the user to save it first; do not invent terrain.
