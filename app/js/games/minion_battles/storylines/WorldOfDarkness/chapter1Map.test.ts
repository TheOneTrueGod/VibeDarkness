/**
 * Chapter 1 Mission Map grid: 1–2–3 on the top row, 6–5–4 on the bottom (snake).
 */

import { describe, expect, it } from 'vitest';
import {
    WOD_CH1_MAP_COL_SPACING,
    WOD_CH1_MAP_ROW_SPACING,
    WOD_CH1_MAP_X_COL0,
    WOD_CH1_MAP_X_COL1,
    WOD_CH1_MAP_X_COL2,
    WOD_CH1_MAP_Y_ROW0,
    WOD_CH1_MAP_Y_ROW1,
} from './chapter1Map';
import { DARK_AWAKENING } from './missions/001_dark_awakening';
import { TOWARDS_THE_LIGHT } from './missions/002_towards_the_light';
import { LIGHT_EMPOWERED } from './missions/003_light_empowered';
import { CAVE_RESPITE } from './missions/004_cave_respite';
import { MONSTER } from './missions/005_monster';
import { CORE_AWAKENING } from './missions/006_core_awakening';

describe('chapter 1 mission map grid', () => {
    it('keeps 170px column spacing and 200px row spacing', () => {
        expect(WOD_CH1_MAP_X_COL1 - WOD_CH1_MAP_X_COL0).toBe(WOD_CH1_MAP_COL_SPACING);
        expect(WOD_CH1_MAP_X_COL2 - WOD_CH1_MAP_X_COL1).toBe(WOD_CH1_MAP_COL_SPACING);
        expect(WOD_CH1_MAP_Y_ROW1 - WOD_CH1_MAP_Y_ROW0).toBe(WOD_CH1_MAP_ROW_SPACING);
    });

    it('places missions 1–3 left to right on row 0', () => {
        expect(DARK_AWAKENING.mapPosition).toEqual({ x: WOD_CH1_MAP_X_COL0, y: WOD_CH1_MAP_Y_ROW0 });
        expect(TOWARDS_THE_LIGHT.mapPosition).toEqual({ x: WOD_CH1_MAP_X_COL1, y: WOD_CH1_MAP_Y_ROW0 });
        expect(LIGHT_EMPOWERED.mapPosition).toEqual({ x: WOD_CH1_MAP_X_COL2, y: WOD_CH1_MAP_Y_ROW0 });
    });

    it('places missions 6–5–4 left to right on row 1', () => {
        expect(CORE_AWAKENING.mapPosition).toEqual({ x: WOD_CH1_MAP_X_COL0, y: WOD_CH1_MAP_Y_ROW1 });
        expect(MONSTER.mapPosition).toEqual({ x: WOD_CH1_MAP_X_COL1, y: WOD_CH1_MAP_Y_ROW1 });
        expect(CAVE_RESPITE.mapPosition).toEqual({ x: WOD_CH1_MAP_X_COL2, y: WOD_CH1_MAP_Y_ROW1 });
    });
});
