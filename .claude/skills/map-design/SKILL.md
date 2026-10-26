---
name: map-design
description: Designing and painting Minion Battles map segments - layout principles, points of interest, chokepoint widths, walls, light placement, network nodes, and fitting segments into the larger world. Use when creating a new MapSegment, sketching a map layout, or judging whether a segment is well designed. Not for mission design (objectives, pacing, spawns).
---

# Map Design

Building mechanics (segment shape, `stitchTerrain`, global coords) live in **map-segments**; editor → TypeScript import lives in **resync-terrain**. This skill covers *what* to paint.

## Maps are not missions

Segments form one large, connected world. A mission picks a few segments out of it and adds objectives, spawns and pacing. So:

- Design segments to be **reusable**: no assumptions about which objective, enemies or difficulty will use them.
- Pacing, safe vs dangerous space and objective fit are **mission** design — out of scope here (see **missions**).
- Every *mission* starts in a safe lit area; individual segments do not need one.

## Segments and neighbours

- **Size:** every segment is **22×22** tiles. Fill the whole grid.
- **World neighbours:** segments whose `{col}_{row}` addresses are adjacent (`50_49` is north of `50_50`). They must line up.
- **Layout neighbours:** a mission's layout composer (`mapLayout`) can place any two segments side by side, whatever their addresses (e.g. `10_10` beside `60_50`). When a brief says two segments connect, treat them as neighbours on that side even if their addresses are far apart.

## Permissions

- You may paint **new** segments directly in TypeScript.
- **Never change an existing segment without the user's permission.** Once given for a segment, further edits to it in the same session are fine.
- **Before editing an existing segment, find what depends on it:** grep for its id and exports in missions, tests and other segments. Tests may pin its layout, and missions may play differently (moved campfires, spawns, openings). Report every such change to the user.

## Layout principles

- **Points of interest:** every segment has at least one; 2–3 is ideal. Examples: lights, spawners, tactically interesting geometry, ambush spots.
- **Biome style:** forests and plains are open spaces with roads cutting through. Open ground gives maneuverability in combat; roads give direction.
- **Continuity:** features crossing a segment edge must continue in the neighbour — paths line up, and large features (mountain ridges, cliffs) read as one contiguous shape across segments.
- **Transitions:** change biome gradually across segments (e.g. fewer rocks and more rough terrain moving from a rocky area into forest).
- **Walkability:** even without roads, leave clear walking paths through the segment.

### Chokepoint widths

| Width | Tiles |
|-------|-------|
| Narrow | 1 |
| Medium | 2 |
| Wide | 3 |

### Structures (castles, buildings)

- **Walls** are generally **1 tile** thick. Solid or thick walls (outer curtain walls, keeps) are **2 tiles**. Use judgement.
- Features like gates and moats are prompts for the shape of a space, not fixed, repeatable structures. Design each one to suit its segment.

## Lights

Segments never place lights. They mark **light spots** as `crystal` / `campfire` [points of interest](#points-of-interest); each mission reads those POIs and decides whether to light them, so placement stays consistent across missions.

Keep light spots **sparse** — only where the segment's own feature needs them (a cave, a boss arena).

| Light | Meaning | Use |
|-------|---------|-----|
| Crystal | Magic light, safe space | Spread out so the whole safe area is covered; the safe spot sits deep inside the coverage. |
| Dark crystal | Lighting is not the concern here | Boss arenas, or places the players fight the darkness without managing light. |
| Campfire | Objective marker | Rare. |

- **Covered** means a cell is within the light's full-strength radius, by the light grid's own distance rule (`lightCoverage.ts` applies it). Past the radius light only falls off; that does not count.
- **Radius:** missions set it per placement. Plan crystal spots for the standard cave-crystal radius, `CRYSTAL_DAYLIGHT_RADIUS` in `storylines/WorldOfDarkness/MapSegments/50_50_crystal_cave.ts`. Read the constant; do not assume a number.
- Crystals do not block players. A lit crystal with a `protectRadius` (set by the mission) blocks enemies around it; see `SpecialTileManager.getCrystalProtectionMap`.

Light types and their gameplay effects: `game/lighting/AGENTS.md`.

## Terrain palette

Read `terrain/TerrainType.ts` for the list of terrain types and their properties before painting. Do not copy the list into this skill.

Water comes in **levels** (see `terrain/AGENTS.md`); none of them block projectiles:

| Level | Type | Use |
|-------|------|-----|
| 1 | Shallow Water | Walkable at half speed. Edges of ponds and rivers, fords, marsh. |
| 2 | Water | Not walkable; units knocked in drown. Ordinary ponds, moats, rivers. |
| 3 | Deep Water | Not walkable; drowning hurts double. The middle of large lakes and wide rivers. |

Shape water features as levels: deeper in the middle, shallower toward the banks, so the map reads naturally and Earth abilities (rock raises the ground 2 levels, gravel 1) have something to work with.

### Feature sizes

- **Thickets** (ThickGrass clumps): about 5–7 tiles across, as in `60_50` and `61_50`.
- **Ponds and lakes:** slightly bigger than a thicket (about 7–8 × 6). Place them near a road or path so players run into them.
- **Rivers:** can be narrower than a pond, but should flow like roads: continuous, crossing segment edges and lining up with the neighbour.

## Points of interest

POIs are named, segment-local points that tell missions and game systems where things belong. They are hints, not content: a POI places nothing by itself.

- **Shape:** `MapSegmentPOISchema` in `terrain/segmentSchema.ts` (`id`, `label`, `col`, `row`, `type`, optional `radius` and `tags`). Valid types are `POI_TYPES` in the same file.
- **Coordinates are always segment-local.** Mission loading shifts them onto the mission grid (`getMissionSegmentPOIs` / `composeMissionMap`).
- **Authoring:** the terrain editor's **POI** tool, or in TypeScript as named exports in the segment file plus a `MapSegmentPOI[]` in `registerSegments.ts` (see **resync-terrain**). Use semantic ids and readable labels.
- **Consumers:** all segment POIs are registered on the engine as `mapPOIs` at mission start. Some systems read them directly (e.g. `enemySpawn` for the `closestEnemySpawnPoint` spawn behaviour, filtered by `tags`); others are read by mission code.
- **What to mark:** player and enemy spawn spots, nests, patrol points, light spots, and anything else a mission might want to find again.
- **Not network nodes:** the movement graph is a separate `network` field on the segment; see below.

## Network nodes

Place nodes at focal points units should walk through — crossroads and sharp turns in roads — so network AI appears to follow the roads. Without roads, nodes still follow clear walking paths. Maze-like maps may need a node at every intersection to help pathfinding. Graph mechanics: `game/managers/mapNetwork/AGENTS.md`.

- **Ids:** prefix every node id with its segment address, `{col}_{row}_<name>` (e.g. `61_49_gate_inside`), so ids stay unique across any mission.
- **Edges between segments:** declare them in the segment you are adding, so existing segments stay untouched. An edge to a node that is not in the mission is skipped with a warning.
- Roads do not steer the pathfinder (Grass and Dirt cost the same), so only nodes keep AI on a road. Put one at every bend.

## Reference segments

All under `storylines/WorldOfDarkness/MapSegments/`:

| Segment(s) | What it shows well |
|------------|--------------------|
| `50_50_crystal_cave` | Safe zone: crystals cover the whole cave, safe spot deep inside; paths connect to neighbours. |
| `48_50` → `49_50` → `50_50` | "Easy" fighting area: open for maneuvering, roads for direction. |
| `0_0_boss_arena` | Open boss arena with few features (good for bosses, light on interesting terrain). |
| `50_48`, `50_49`, `50_50` | Continuity: the eastern mountain reads as one ridge; paths continue across segments. |
| `50_51` → `49_51` | Transition: rocks thin out and rough terrain grows, rocky → forest. |

## Workflow

1. **Brief** — biome, world-grid address, neighbours (world and layout), intended points of interest.
2. **Read the neighbours** — match edges (paths, ridges) before painting.
3. **Sketch** — an ASCII layout (or **artbook**) for approval before writing terrain.
   - **As a subagent:** stop after sketching and return the sketches to the orchestrator for approval; continue when resumed. If you cannot be resumed, skip the approval and say so in your report.
4. **Paint** — write the segment, POIs and zones (formats: **resync-terrain**), then network nodes.
5. **Register** — `storylines/WorldOfDarkness/registerSegments.ts`.
6. **Verify** — run the [Verification](#verification) checks.

## Map tools

Use the deterministic tools in `app/js/games/minion_battles/terrain/mapTools/` (one tool per file; import from `index.ts`) instead of hand-writing rows. They are pure functions on a `TerrainType[][]`: they return a new array and never mutate the input. The terrain editor's Fill, Ellipse, Road, Curved Road and mirror toggle use the same code, so the user and agents get identical results.

| Tool | Use |
|------|-----|
| `fillRect.ts` / `ellipse.ts` | Fill a rectangle, or the ellipse inside a box, with one terrain type. |
| `road.ts` / `bezierRoad.ts` | Straight or curved road of thickness T. Even thicknesses extend up/left of the centre line (same as the editor brush). |
| `mirror.ts` | Quadrant symmetry: `mirrorTerrain` copies a half or quarter over the rest; `mirrorCells` mirrors a cell list. |
| `ascii.ts` | `terrainFromAscii` (sketch → terrain), `terrainToAscii` (print, with marks), `terrainToTsRows` (segment-file rows). |
| `layerEffects.ts` | Turn any cell list into a ground / air layer effect for a mission to add. |
| `findPath.ts` | Full cell route between two points. |
| `edgeOpenings.ts`, `seamCheck.ts`, `chokepoints.ts`, `lightCoverage.ts` | Verification checks; see below. |

Each tool also exposes its raw cell list (e.g. `roadCells`), so tools can be combined. Paint order matters: later tools overwrite earlier ones. A good loop is: approved ASCII sketch → `terrainFromAscii` → refine with tools → `terrainToTsRows` into the segment file.

To run them, write a throwaway script in the scratchpad that imports from `/app/js/games/minion_battles/terrain/mapTools`, then run it with `npx vite-node <script>` from the repo root.

## Verification

Run these checks in a scratch script (see [Map tools](#map-tools)) before asking the user to look. Report each one as passed or failed; fix failures before handing over.

1. **Reachability** — `edgeOpenings` lists the openings; `findPath` between every pair, and from an opening to each POI and network node. Every one must return a path. A POI or node on a blocked cell fails.
2. **Seams** — `checkSeam` against each neighbour, world or layout. Any mismatch fails; type changes (road meeting grass) are fine if intended.
3. **Network** — `findPath` between each pair of connected nodes. The route should follow the road or walking path the edge represents; a big detour means a node is misplaced.
4. **Chokepoints** — `passageWidth` at each intended chokepoint must match its width (narrow 1, medium 2, wide 3). `findNarrowGaps` must find no other gaps that narrow.
5. **Lights** — `lightCoverage` over each safe area: no uncovered cells.
6. **Look** — `terrainToAscii` with routes and POIs marked; compare with the approved sketch.
7. **User check** — ask the user to check it in the terrain editor or in game.

`findPath` reads base terrain only: crystals, created rock and units are not included.
