---
name: map-design
description: Designing and painting Minion Battles map segments - layout principles, points of interest, chokepoint widths, light placement, network nodes, and fitting segments into the larger world. Use when creating a new MapSegment, sketching a map layout, or judging whether a segment is well designed. Not for mission design (objectives, pacing, spawns).
---

# Map Design

Building mechanics (segment shape, `stitchTerrain`, global coords) live in **map-segments**; editor → TypeScript import lives in **resync-terrain**. This skill covers *what* to paint.

## Maps are not missions

Segments form one large, connected world. A mission picks a few segments out of it and adds objectives, spawns and pacing. So:

- Design segments to be **reusable**: no assumptions about which objective, enemies or difficulty will use them.
- Pacing, safe vs dangerous space and objective fit are **mission** design — out of scope here (see **missions**).
- Every *mission* starts in a safe lit area; individual segments do not need one.

## Permissions

- You may paint **new** segments directly in TypeScript.
- **Never change an existing segment without the user's permission.** Once given for a segment, further edits to it in the same session are fine.

## Layout principles

- **Points of interest:** every segment has at least one; 2–3 is ideal. Examples: lights, spawners, tactically interesting geometry, ambush spots.
- **Biome style:** forests and plains are open spaces with roads cutting through. Open ground gives maneuverability in combat; roads give direction. Cramped spaces (castles, buildings, mazes) are coming in a later chapter.
- **Continuity:** features crossing a segment edge must continue in the neighbour — paths line up, and large features (mountain ridges, cliffs) read as one contiguous shape across segments.
- **Transitions:** change biome gradually across segments (e.g. fewer rocks and more rough terrain moving from a rocky area into forest).
- **Walkability:** even without roads, leave clear walking paths through the segment.

### Chokepoint widths

| Width | Tiles |
|-------|-------|
| Narrow | 1 |
| Medium | 2 |
| Wide | 3 |

## Lights

Segments never place lights. They mark **light spots** as `crystal` / `campfire` [points of interest](#points-of-interest); each mission reads those POIs and decides whether to light them, so placement stays consistent across missions.

Keep light spots **sparse** — only where the segment's own feature needs them (a cave, a boss arena).

| Light | Meaning | Use |
|-------|---------|-----|
| Crystal | Magic light, safe space | Spread out so their radii cover the whole safe area; the safe spot sits deep inside the coverage. |
| Dark crystal | Lighting is not the concern here | Boss arenas, or places the players fight the darkness without managing light. |
| Campfire | Objective marker | Rare. |

Light types and their gameplay effects: `game/lighting/AGENTS.md`.

## Terrain palette

Read `terrain/TerrainType.ts` for the list of terrain types and their properties before painting. Do not copy the list into this skill.

## Points of interest

POIs are named, segment-local points that tell missions and game systems where things belong. They are hints, not content: a POI places nothing by itself.

- **Shape:** `MapSegmentPOISchema` in `terrain/segmentSchema.ts` (`id`, `label`, `col`, `row`, `type`, optional `radius` and `tags`). Valid types are `POI_TYPES` in the same file.
- **Authoring:** the terrain editor's **POI** tool, or in TypeScript as named exports in the segment file plus a `MapSegmentPOI[]` in `registerSegments.ts` (see **resync-terrain**). Use semantic ids and readable labels.
- **Consumers:** all segment POIs are registered on the engine as `mapPOIs` at mission start. Some systems read them directly (e.g. `enemySpawn` for the `closestEnemySpawnPoint` spawn behaviour, filtered by `tags`); others are read by mission code, which converts them to global coords (see **map-segments**).
- **What to mark:** player and enemy spawn spots, nests, patrol points, light spots, and anything else a mission might want to find again. This is also how a segment advertises its points of interest in the layout sense.
- **Not network nodes:** the movement graph is a separate `network` field on the segment; see below.

## Network nodes

Place nodes at focal points units should walk through — crossroads and sharp turns in roads — so network AI appears to follow the roads. Without roads, nodes still follow clear walking paths. Maze-like maps may need a node at every intersection to help pathfinding. Graph mechanics: `game/managers/mapNetwork/AGENTS.md`.

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

1. **Brief** — biome, world-grid address, neighbours, intended points of interest.
2. **Read the neighbours** — match edges (paths, ridges) before painting.
3. **Sketch** — show an ASCII or **artbook** layout for approval before writing terrain.
4. **Paint** — write the segment, POIs and zones (formats: **resync-terrain**), then network nodes.
5. **Register** — `storylines/WorldOfDarkness/registerSegments.ts`.
6. **Verify** — run the [Verification](#verification) checks.

## Map tools

Use the deterministic tools in `app/js/games/minion_battles/terrain/mapTools/` (one tool per file; import from `index.ts`) instead of hand-writing rows. They are pure functions on a `TerrainType[][]`: they return a new array and never mutate the input. The terrain editor's Fill, Road and Curved Road tools use the same code, so the user and agents get identical results.

| Tool | Use |
|------|-----|
| `fillRect.ts` | Fill a rectangle with one terrain type. |
| `road.ts` | Straight road of thickness T between two cells. |
| `bezierRoad.ts` | Curved road of thickness T along bezier control points. |
| `layerEffects.ts` | Turn any cell list into a ground / air layer effect for a mission to add. |
| `findPath.ts` | Full cell route between two points. For verification only. |

Each tool also exposes its raw cell list (e.g. `roadCells`), so tools can be combined. Paint order matters: later tools overwrite earlier ones.

To run them, write a throwaway script in the scratchpad that imports from `/app/js/games/minion_battles/terrain/mapTools`, then run it with `npx vite-node <script>` from the repo root. Print the result as ASCII to check it, then copy the rows into the segment file.

## Verification

Run these checks in a scratch script (see [Map tools](#map-tools)) before asking the user to look. Report each one as passed or failed; fix failures before handing over.

1. **Reachability** — `findPath` between every pair of edge openings, and from the nearest opening to each POI and network node. Every one must return a path. A POI or node on a blocked cell fails.
2. **Seams** — stitch the new segment with each existing neighbour (`stitchTerrain` in `terrain/TerrainGrid.ts`, laid out by world-grid address) and `findPath` across every shared opening. Paths and ridges must line up on both sides of the edge.
3. **Network** — `findPath` between each pair of connected nodes. The route should follow the road or walking path the edge represents; a big detour means a node is misplaced.
4. **Chokepoints** — at each intended chokepoint, count the passable cells across the route. They must match the intended width (narrow 1, medium 2, wide 3); accidental 1-tile gaps elsewhere fail.
5. **Look** — print the segment as ASCII with the route cells marked and check it against the approved sketch.
6. **User check** — ask the user to check it in the terrain editor or in game.

`findPath` reads base terrain only: crystals, created rock and units are not included.
