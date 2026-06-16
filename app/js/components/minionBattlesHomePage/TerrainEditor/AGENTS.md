# TerrainEditor — agent guide

## Purpose

The Terrain Editor is an admin-only, canvas-based tool for visually authoring map segments. An author can paint terrain types cell-by-cell, manage named points of interest (POIs), and save the finished segment as JSON to `storage/terrain-segments/{id}.json`. Segments saved here can be loaded at runtime by the mission system (see `map-segments` skill) and are the authoritative source of truth for any segment whose data lives on disk rather than being hard-coded in a TypeScript file.

## Directory layout

| File | Purpose |
|------|---------|
| `TerrainEditorTab.tsx` | Top-level layout component — segment selector, canvas area, and sidebar. |
| `TerrainCanvas.tsx` | HTML Canvas 2D grid renderer and paint tool; handles mouse events for painting and POI placement. |
| `useEditorState.ts` | Central editor state hook — defines the `EditorState` interface and all reducers/actions. |
| `terrainEditorColors.ts` | Color and icon constants for each `TerrainType` value and each `POIType` value. |
| `ToolPicker.tsx` | Toggle between `terrain_paint` and `poi` tools. |
| `TerrainTypePicker.tsx` | Selector for the active terrain type (dirt / grass / thick grass / rock). |
| `BrushSizePicker.tsx` | Selector for brush radius (1, 2, or 3 cells). |
| `POIEditor.tsx` | Sidebar panel for adding, editing, and deleting POIs on the current segment. |
| `SegmentSelector.tsx` | Dropdown that combines API-saved segments (loaded from `GET /api/terrain-segments`) and TS-registered segments (from the registry). |

## Data flow

1. **Startup registration.** TypeScript segment files call `registerSegments.ts` at module load time, writing their `MapSegmentData` into an in-memory registry.
2. **Load.** `SegmentSelector` populates from both the registry and the API (`GET /api/terrain-segments`). Selecting a segment sets `EditorState.segmentData`.
3. **Edit.** `TerrainCanvas` reads `EditorState.segmentData` on every render. Mouse events dispatch reducers in `useEditorState` to update `segmentData` in place.
4. **Save.** The save action calls `PUT /api/terrain-segments/:id`, which writes `storage/terrain-segments/{id}.json` on the server. After a successful save the in-memory state is considered clean.

## Schema

Segment data is validated with Zod. The authoritative types are in:

`app/js/games/minion_battles/terrain/segmentSchema.ts`

Key exports:

- `MapSegmentData` — top-level segment shape (`id`, `gridCol`, `gridRow`, `width`, `height`, `terrain: number[][]`, `pointsOfInterest: MapSegmentPOI[]`).
- `MapSegmentPOI` — a named point of interest (`id`, `label`, `col`, `row`, `type: POIType`, optional `radius`).
- `POI_TYPES` — the current allowed POI type values: `generic`, `campfire`, `crystal`, `nest`, `patrol_point`, `spawn`.

## How to add a new POI type

1. Add the new string value to the `POI_TYPES` array in `segmentSchema.ts`.
2. Add a corresponding color and icon entry in `terrainEditorColors.ts` so the canvas and sidebar render it correctly.
3. Add icon rendering for the new type in the POI overlay section of `TerrainCanvas.tsx`.

## How to register a new TS segment

1. Create the segment file in the appropriate `MapSegments/` directory (see the `map-segments` skill for naming conventions).
2. Import and register it in `registerSegments.ts`, supplying the correct `gridCol`, `gridRow`, and any POIs the segment exports.
