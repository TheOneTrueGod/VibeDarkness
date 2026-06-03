/**
 * registerSegments.ts
 * Registers all WorldOfDarkness map segments into the segment registry at startup.
 * Import this file once (e.g. from main.tsx) to populate the registry.
 */

import { registerSegment, tsTerrainToSegmentData } from '../../terrain/segmentRegistry';
import type { MapSegmentPOI } from '../../terrain/segmentSchema';

import { MAP_SEGMENT_48_50_WAKEUP } from './MapSegments/48_50_wakeup';
import { MAP_SEGMENT_49_50_PATH_TO_CAVE } from './MapSegments/49_50_path_to_cave';
import {
    MAP_SEGMENT_49_51_WEST_GLADE,
    LANTERN_NEST_FOCUS,
} from './MapSegments/49_51_west_glade';
import { MAP_SEGMENT_50_48_PATH_TOP } from './MapSegments/50_48_path_top';
import {
    MAP_SEGMENT_50_49_CLIFF_PATH_NORTH,
    cave_center,
    north_path,
    south_path,
} from './MapSegments/50_49_cliff_path_north';
import {
    MAP_SEGMENT_50_50_CRYSTAL_CAVE,
    CAVE_CAMPFIRE,
    CRYSTAL_POINTS,
} from './MapSegments/50_50_crystal_cave';
import {
    MAP_SEGMENT_50_51_SOUTH_GATE,
    PATROL_DRAW_POINT,
} from './MapSegments/50_51_south_gate';
import {
    MAP_SEGMENT_49_52_THORN_PATH,
    NEST_POINT_1,
    PATROL_POINT,
    ENEMY_SPAWN_1,
    ENEMY_SPAWN_2,
} from './MapSegments/49_52_thorn_path';
import {
    MAP_SEGMENT_48_52_THORN_PATH_2,
    NEST,
    EAST_ROAD,
    WEST_SPAWN,
    NORTH_SPAWN,
    NORTHEAST_SPAWN,
} from './MapSegments/48_52_thorn_path_2';

export function registerWorldOfDarknessSegments(): void {
    // 48_50 Wakeup — no POIs
    registerSegment(
        tsTerrainToSegmentData('48_50_wakeup', 48, 50, MAP_SEGMENT_48_50_WAKEUP),
    );

    // 49_50 Path to Cave — no POIs
    registerSegment(
        tsTerrainToSegmentData('49_50_path_to_cave', 49, 50, MAP_SEGMENT_49_50_PATH_TO_CAVE),
    );

    // 49_51 West Glade — Lanternite nest anchor (origin: col-offset=0, row-offset=22 in mission-007 2×2 world)
    // POI col/row are stitched-world coordinates for the 44×44 mission-007 grid.
    const westGladePOIs: MapSegmentPOI[] = [
        {
            id: 'nest_west',
            label: 'West Glade Nest',
            col: LANTERN_NEST_FOCUS.col,           // 7 — same as segment-local (top-left origin)
            row: 22 + LANTERN_NEST_FOCUS.row,      // 37 — stitched (row offset 22 for bottom segment row)
            type: 'nest',
            tags: ['connects:nest_south'],
        },
    ];
    registerSegment(
        tsTerrainToSegmentData('49_51_west_glade', 49, 51, MAP_SEGMENT_49_51_WEST_GLADE, westGladePOIs),
    );

    // 50_48 Path Top — no POIs
    registerSegment(
        tsTerrainToSegmentData('50_48_path_top', 50, 48, MAP_SEGMENT_50_48_PATH_TOP),
    );

    // 50_49 Cliff Path North — cave center, north path, south path
    const cliffPathPOIs: MapSegmentPOI[] = [
        {
            id: 'cave_center',
            label: 'Cave Center',
            col: cave_center.col,
            row: cave_center.row,
            type: 'generic',
        },
        {
            id: 'north_path',
            label: 'North Path',
            col: north_path.col,
            row: north_path.row,
            type: 'generic',
        },
        {
            id: 'south_path',
            label: 'South Path',
            col: south_path.col,
            row: south_path.row,
            type: 'generic',
        },
    ];
    registerSegment(
        tsTerrainToSegmentData(
            '50_49_cliff_path_north',
            50,
            49,
            MAP_SEGMENT_50_49_CLIFF_PATH_NORTH,
            cliffPathPOIs,
        ),
    );

    // 50_50 Crystal Cave — campfire + 5 crystals
    const crystalCavePOIs: MapSegmentPOI[] = [
        {
            id: 'cave_campfire',
            label: 'Cave Campfire',
            col: CAVE_CAMPFIRE.col,
            row: CAVE_CAMPFIRE.row,
            type: 'campfire',
        },
        {
            id: 'crystal_1',
            label: 'Crystal 1',
            col: CRYSTAL_POINTS.crystal_1.col,
            row: CRYSTAL_POINTS.crystal_1.row,
            type: 'crystal',
        },
        {
            id: 'crystal_2',
            label: 'Crystal 2',
            col: CRYSTAL_POINTS.crystal_2.col,
            row: CRYSTAL_POINTS.crystal_2.row,
            type: 'crystal',
        },
        {
            id: 'crystal_3',
            label: 'Crystal 3',
            col: CRYSTAL_POINTS.crystal_3.col,
            row: CRYSTAL_POINTS.crystal_3.row,
            type: 'crystal',
        },
        {
            id: 'crystal_4',
            label: 'Crystal 4',
            col: CRYSTAL_POINTS.crystal_4.col,
            row: CRYSTAL_POINTS.crystal_4.row,
            type: 'crystal',
        },
        {
            id: 'crystal_5',
            label: 'Crystal 5',
            col: CRYSTAL_POINTS.crystal_5.col,
            row: CRYSTAL_POINTS.crystal_5.row,
            type: 'crystal',
        },
    ];
    registerSegment(
        tsTerrainToSegmentData(
            '50_50_crystal_cave',
            50,
            50,
            MAP_SEGMENT_50_50_CRYSTAL_CAVE,
            crystalCavePOIs,
        ),
    );

    // 50_51 South Gate — patrol draw point + second lanternite nest site
    // POI col/row are stitched-world coordinates (col-offset=22, row-offset=22 in mission-007 2×2 world).
    const southGatePOIs: MapSegmentPOI[] = [
        {
            id: 'patrol_draw_point',
            label: 'Patrol Draw Point',
            col: 22 + PATROL_DRAW_POINT.col,   // stitched (22+16=38)
            row: 22 + PATROL_DRAW_POINT.row,   // stitched (22+11=33)
            type: 'patrol_point',
        },
        {
            id: 'nest_south',
            label: 'South Gate Nest',
            col: 22 + 9,  // stitched — segment-local (9, 11) on the dirt corridor
            row: 22 + 11,
            type: 'nest',
            tags: ['connects:nest_west'],
        },
    ];
    registerSegment(
        tsTerrainToSegmentData(
            '50_51_south_gate',
            50,
            51,
            MAP_SEGMENT_50_51_SOUTH_GATE,
            southGatePOIs,
        ),
    );

    // 49_52 Thorn Path
    const thornPathPOIs: MapSegmentPOI[] = [
        { id: 'nest_point_1',  label: 'Nest Point 1',  col: NEST_POINT_1.col,  row: NEST_POINT_1.row,  type: 'nest' },
        { id: 'patrol_point',  label: 'Patrol Point',  col: PATROL_POINT.col,  row: PATROL_POINT.row,  type: 'patrol_point' },
        { id: 'enemy_spawn_1', label: 'Enemy Spawn 1', col: ENEMY_SPAWN_1.col, row: ENEMY_SPAWN_1.row, type: 'enemySpawn' },
        { id: 'enemy_spawn_2', label: 'Enemy Spawn 2', col: ENEMY_SPAWN_2.col, row: ENEMY_SPAWN_2.row, type: 'enemySpawn' },
    ];
    registerSegment(
        tsTerrainToSegmentData('49_52_thorn_path', 49, 52, MAP_SEGMENT_49_52_THORN_PATH, thornPathPOIs),
    );

    // 48_52 Thorn Path 2
    const thornPath2POIs: MapSegmentPOI[] = [
        { id: 'nest',             label: 'Nest',             col: NEST.col,            row: NEST.row,            type: 'nest' },
        { id: 'east_road',        label: 'East Road',        col: EAST_ROAD.col,       row: EAST_ROAD.row,       type: 'patrol_point' },
        { id: 'west_spawn',       label: 'West Spawn',       col: WEST_SPAWN.col,      row: WEST_SPAWN.row,      type: 'enemySpawn' },
        { id: 'north_spawn',      label: 'North Spawn',      col: NORTH_SPAWN.col,     row: NORTH_SPAWN.row,     type: 'enemySpawn' },
        { id: 'northeast_spawn',  label: 'Northeast Spawn',  col: NORTHEAST_SPAWN.col, row: NORTHEAST_SPAWN.row, type: 'enemySpawn' },
    ];
    registerSegment(
        tsTerrainToSegmentData('48_52_thorn_path_2', 48, 52, MAP_SEGMENT_48_52_THORN_PATH_2, thornPath2POIs),
    );
}
