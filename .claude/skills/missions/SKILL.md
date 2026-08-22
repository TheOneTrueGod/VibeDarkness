---
name: missions
description: Create and edit campaign missions in Minion Battles. Use when adding missions, mission structure, objectives, storyline flow, or terrain stitched from segments (TerrainGrid/stitchTerrain).
---

# Missions

## When to use this skill

Use this skill when:
- Creating or editing campaign missions in `app/js/games/minion_battles/storylines/**/missions/*.ts`
- Configuring mission objectives, spawns, terrain, or story segments
- Adding storyline edges and mission flow

## Mission startup flow

- Mission selection happens on the campaign/lobby side before entering Minion Battles.
- In-game Minion Battles state must include `selectedMissionId`.
- Minion Battles starts at `character_select` (there is no in-game mission voting screen).

## Mission filename convention

**The first three characters of a campaign mission's filename should be the mission number** (zero-padded). Examples:

- `001_dark_awakening.ts` — Mission 1
- `002_towards_the_light.ts` — Mission 2
- `003_light_empowered.ts` — Mission 3

This convention helps order missions and identify their sequence in a campaign.

## Map segments

For reusable terrain, use **map segments** from the storylines folder.

**Layout-composer missions** (opt-in): set `mapLayout` (destination tiles + `{ kind: 'spawn' }` slots) and optional `spawnSegmentId`. `BaseMissionDef` composes terrain via `terrain/missionLayout.ts`; the home tile is `storylines/homeBase.ts`. Do **not** use world-grid `gridCol`/`gridRow` for those placements. Example: `WorldOfDarkness/missions/010_circle_arena.ts`. Existing missions keep hand-written `stitchTerrain`.

## Terrain grids and `stitchTerrain`

- **Compose** maps with `stitchTerrain` and `TerrainGrid.createTerrainFromArray` as documented in **`map-segments`** (`.cursor/skills/map-segments/SKILL.md`).
- **`stitchTerrain` takes a matrix of segments:** each inner cell is `TerrainType[][]`. Match the nesting to the layout (horizontal strip, vertical stack, or 2×2 quadrants)—do not flatten or nest in a way that turns “one stitched row” into “many phantom tile columns”.
- **Global vs segment-local coords:** player spawns, objectives, enemies, `specialTiles`, and scripted tile adds use **global** grid indices; derive them from each segment’s **origin** in the stitched map plus segment-local POIs.
- **Darkness:** if the mission should show the default overworld/cave darkness overlay, set `lightLevelEnabled` / `globalLightLevel` like other missions in the same campaign folder—do not rely on implicit defaults.

For segment file layout, POI exports, and anti-patterns, read **map-segments** end-to-end before editing complex maps.

## Spawn timing: "start spawned" / "spawn at the start"

When instructed to have enemies "start spawned" or "spawn at the start", both phrases mean **pre-place them in the mission's `enemies: EnemySpawnDef[]` list** — not a `spawnWave` level event, even one with an early-looking trigger.

- `enemies` entries are added via `engine.addUnit(unit, 'initialGameSpawn')` (see `BaseMissionDef.ts`), which skips the unit spawn-in animation. Anything spawned through `levelEvents` (`spawnWave`, `continuousSpawn`, `proximitySpawn`) always goes through the animating `'darknessSpawn'` path, regardless of trigger timing.
- `roundNumber` starts at `1` (`GameState.ts`), so a `spawnWave` with `trigger: { atRound: 0 }` **or** `{ atRound: 1 }` both fire on the very first tick — either is effectively an immediate/mission-start spawn and should not be used for "start spawned" enemies. Only `atRound: 2+` or `afterSeconds > 0` are genuinely mid-mission.
- When the initial placement needs randomized-but-deterministic scatter (not fixed hand-authored coordinates), don't reach for `spawnBehaviour: 'anywhere'` — instead compute positions inside an `initializeGameState` override using the engine's seeded RNG, then merge them into `this.enemies` before calling `super.initializeGameState()`. Two established patterns:
  - Circle-based: `scatterPositionsInCircle` in `storylines/missionSpawnHelpers.ts`.
  - Zone-based: `buildOpeningWolves` in `WorldOfDarkness/missions/007_ember_threshold.ts` (uses `resolveZoneTiles` + `engine.generateRandomInteger`).

## Key types and locations

- Mission base: `app/js/games/minion_battles/storylines/BaseMissionDef.ts`
- Types: `app/js/games/minion_battles/storylines/types.ts`
- Story types: `app/js/games/minion_battles/storylines/storyTypes.ts`
- Mission registration: `app/js/games/minion_battles/storylines/index.ts` (MISSION_MAP)
- Storyline flow: `app/js/games/minion_battles/storylines/WorldOfDarkness/WorldOfDarkness.ts` (edges)
- **Tests after mission edits:** co-located `missions/*.test.ts` only — never `vitest related` on a mission file (fans out via `MISSION_MAP`; see **scoped-testing**)

## Post-mission choice options (dynamic rewards)

- **Ownership:** The **mission definition** (`MissionBattleConfig` / class extending `BaseMissionDef`) owns runtime post-mission choice rows when rewards depend on loadout or research.
- **Mechanics:** Implement optional `getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams)` on that mission class (see `types.ts`). The post-mission story phrase can use an **empty `options` array** as a placeholder; the client merges in the computed rows from the mission def (see `PostMissionStoryPhase.tsx`).
- **Colocation:** Keep the helper logic in the **same mission file** unless it becomes large enough to split—then add a helper module under that campaign’s `missions/` folder (e.g. `WorldOfDarkness/missions/`) rather than a shared “choices hub” file.

## Main weapon (narrative / meta)

Missions and quest copy can reference a character’s **main weapon** (rock / stick / shield lineage, with future transforms) for flavor and gated choices. That concept is defined in the **campaign-characters** skill. Do not assume the main weapon maps 1:1 to battle loadout unless a mission explicitly implements that.

## Campaign resources and research costs

- Mission rewards and story choices should treat campaign `resources` as the base earned pool.
- When a mission/story grants research directly, do not mutate base campaign resources just for that grant.
- Effective resources used by research UI/checks are computed from:
  - `effective = base campaign resources - researched node costs`.
- Effective values can be negative; UI should render negative resource counts clearly (red styling).
- In mission result UIs, display research gained separately from raw resource deltas.
