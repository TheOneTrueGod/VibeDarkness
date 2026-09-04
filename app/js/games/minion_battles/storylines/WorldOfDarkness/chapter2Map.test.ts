/**
 * Chapter 2 Mission Map grid: missions moved down one row; dedicated quests occupy row 0.
 */

import { describe, expect, it } from 'vitest';
import {
    WOD_CH2_MAP_COL_SPACING,
    WOD_CH2_MAP_ROW_SPACING,
    WOD_CH2_MAP_X_COL0,
    WOD_CH2_MAP_X_COL1,
    WOD_CH2_MAP_X_COL2,
    WOD_CH2_MAP_X_COL3,
    WOD_CH2_MAP_Y_ROW0,
    WOD_CH2_MAP_Y_ROW1,
    WOD_CH2_MAP_Y_ROW2,
} from './chapter2Map';
import { CRYSTAL_CORRUPTION } from './missions/004b_crystal_corruption';
import { THORNBINDER_ARENA } from './missions/006b_thornbinder_arena';
import { SOUTH_GATE_SWARM } from './missions/006c_south_gate_swarm';
import { EMBER_THRESHOLD } from './missions/007_ember_threshold';
import { THORN_MARCH } from './missions/008_thorn_march';
import { THORNLING_RISE } from './missions/009_thornling_rise';
import { THE_CIRCLE } from './missions/010_circle_arena';

describe('chapter 2 mission map grid', () => {
    it('keeps 220px column spacing and 200px row spacing', () => {
        expect(WOD_CH2_MAP_X_COL1 - WOD_CH2_MAP_X_COL0).toBe(WOD_CH2_MAP_COL_SPACING);
        expect(WOD_CH2_MAP_X_COL2 - WOD_CH2_MAP_X_COL1).toBe(WOD_CH2_MAP_COL_SPACING);
        expect(WOD_CH2_MAP_X_COL3 - WOD_CH2_MAP_X_COL2).toBe(WOD_CH2_MAP_COL_SPACING);
        expect(WOD_CH2_MAP_Y_ROW1 - WOD_CH2_MAP_Y_ROW0).toBe(WOD_CH2_MAP_ROW_SPACING);
        expect(WOD_CH2_MAP_Y_ROW2 - WOD_CH2_MAP_Y_ROW1).toBe(WOD_CH2_MAP_ROW_SPACING);
    });

    it('places former top-row missions on row 1', () => {
        expect(THORNBINDER_ARENA.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL1, y: WOD_CH2_MAP_Y_ROW1 });
        expect(SOUTH_GATE_SWARM.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL2, y: WOD_CH2_MAP_Y_ROW1 });
        expect(EMBER_THRESHOLD.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL3, y: WOD_CH2_MAP_Y_ROW1 });
    });

    it('places former bottom-row missions on row 2', () => {
        expect(CRYSTAL_CORRUPTION.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL0, y: WOD_CH2_MAP_Y_ROW2 });
        expect(THE_CIRCLE.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL1, y: WOD_CH2_MAP_Y_ROW2 });
        expect(THORNLING_RISE.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL2, y: WOD_CH2_MAP_Y_ROW2 });
        expect(THORN_MARCH.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL3, y: WOD_CH2_MAP_Y_ROW2 });
    });
});
