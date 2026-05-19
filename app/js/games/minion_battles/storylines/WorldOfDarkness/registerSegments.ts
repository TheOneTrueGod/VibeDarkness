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

export function registerWorldOfDarknessSegments(): void {
    // 48_50 Wakeup — no POIs
    registerSegment(
        tsTerrainToSegmentData('48_50_wakeup', 48, 50, MAP_SEGMENT_48_50_WAKEUP),
    );

    // 49_50 Path to Cave — no POIs
    registerSegment(
        tsTerrainToSegmentData('49_50_path_to_cave', 49, 50, MAP_SEGMENT_49_50_PATH_TO_CAVE),
    );

    // 49_51 West Glade — Lanternite nest focus
    const westGladePOIs: MapSegmentPOI[] = [
        {
            id: 'lantern_nest_focus',
            label: 'Lanternite Nest',
            col: LANTERN_NEST_FOCUS.col,
            row: LANTERN_NEST_FOCUS.row,
            type: 'nest',
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

    // 50_51 South Gate — patrol draw point
    const southGatePOIs: MapSegmentPOI[] = [
        {
            id: 'patrol_draw_point',
            label: 'Patrol Draw Point',
            col: PATROL_DRAW_POINT.col,
            row: PATROL_DRAW_POINT.row,
            type: 'patrol_point',
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
}
