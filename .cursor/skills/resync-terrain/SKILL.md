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

Every POI that has a human-readable `label` should be exported as a named constant. Derive the constant name from the label: uppercase snake_case (e.g. `"Enemy Spawn 1"` → `ENEMY_SPAWN_1`, `"Patrol Point"` → `PATROL_POINT`). Export it as `{ col, row } as const` at the bottom of the TS file.

POIs with auto-generated ids (short alphanumeric like `"mpk1zkhj"`) AND no meaningful label are editor-only and do not need a TS export.

## Step 6 — Register POIs in registerSegments.ts

After adding named POI exports to the TS file, also register them in `registerSegments.ts` so the terrain editor can show them even after the JSON has been backed up (the editor falls back to the TS registry when no JSON is present):

```ts
const mySegmentPOIs: MapSegmentPOI[] = [
    { id: 'enemy_spawn_1', label: 'Enemy Spawn 1', col: ENEMY_SPAWN_1.col, row: ENEMY_SPAWN_1.row, type: 'enemySpawn' },
    // ...
];
registerSegment(tsTerrainToSegmentData('my_segment', col, row, MAP_SEGMENT_MY_SEGMENT, mySegmentPOIs));
```

Use semantic ids (e.g. `'enemy_spawn_1'`) rather than the auto-generated editor ids.

## Zones — same idea, separate field

The JSON also has a `zones` array (added alongside `pointsOfInterest`). Each entry has `id`, `shape` (`'box'` | `'circle'`), `topLeft: {col, row}`, `bottomRight: {col, row}` — segment-local coordinates. See `app/js/games/minion_battles/terrain/zones.ts` for how a zone resolves to grid tiles ('circle' is the ellipse inscribed in the topLeft/bottomRight box).

Every zone should be exported as a named `MapSegmentZone` constant, since a zone's `id` (unlike a POI's auto-generated id) is typically referenced directly by mission code (e.g. `spawnZoneId`) or by `params.terrainSegmentZones.find(...)`. Export it as a full `{ id, shape, topLeft, bottomRight }` object, not just the coordinates:

```ts
export const OUTSIDE_CAVE_MOUTH_ZONE: MapSegmentZone = {
    id: 'outside of cave mouth',
    shape: 'box',
    topLeft: { col: 7, row: 8 },
    bottomRight: { col: 11, row: 12 },
};
```

Then register it in `registerSegments.ts` as the 6th argument to `tsTerrainToSegmentData` (a `MapSegmentZone[]`), alongside the POI array:

```ts
registerSegment(
    tsTerrainToSegmentData('my_segment', col, row, MAP_SEGMENT_MY_SEGMENT, mySegmentPOIs, [OUTSIDE_CAVE_MOUTH_ZONE]),
);
```

If a zone's `id` or bounds changed, check any mission that references that `id` (via `spawnZoneId` on a spawn entry, or a direct lookup in `initializeGameState`) still makes sense.

## Step 7 — Check mission imports

If a POI constant's value changed, verify the mission file that imports it still places enemies/objectives/tiles at sensible positions. Run `npm run lint` to catch type errors.

## Runtime note

`getTerrainForSegment(id, fallback)` in `terrain/segmentRegistry.ts` prefers the runtime registry (populated from the server's JSON) over the TS array. After syncing, the TS file and the JSON will agree, so behaviour is identical whether the server JSON is present or not.

## Step 7 — Back up the JSON and verify

After updating the TS file, archive the source JSON so the editor state isn't silently re-imported later:

```
npm run terrain-backup -- <segmentId>
```

Then **ask the user** to verify the terrain looks correct in the game (e.g. run the app and open the mission).

> "I've updated the TypeScript and archived the JSON as `{id}.json.bak`. Can you verify the terrain synced correctly? (yes / no)"

If the user says **no**:

```
npm run terrain-restore -- <segmentId>
```

Report this to the user and ask them to describe what went wrong so you can revisit the sync.

## Common pitfalls

- **Both segment TS files had identical terrain** — copy-paste from segment creation. Confirm the JSON files are distinct before writing.
- **User names segment as "col_row" vs "row_col"** — the naming convention is `{col}_{row}_{name}`. Cross-check against `segmentIds` in the mission file and against `gridCol`/`gridRow` in the JSON to confirm which segment the user means.
- **No JSON file for a segment** — it was never saved from the editor. Ask the user to save it first; do not invent terrain.
