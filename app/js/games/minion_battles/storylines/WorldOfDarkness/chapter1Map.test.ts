/**
 * Chapter 1 Mission Map grid: 1–2–3 on the top row, 6–5–4 on the bottom (snake).
 */

import { describe, expect, it } from 'vitest';
import {
    CHAPTER_1_COMPLETION_CRYSTALS,
    CHAPTER_1_COMPLETION_FOOD,
    CHAPTER_1_COMPLETION_METAL,
    WOD_CH1_MAP_COL_SPACING,
    WOD_CH1_MAP_ROW_SPACING,
    WOD_CH1_MAP_X_COL0,
    WOD_CH1_MAP_X_COL1,
    WOD_CH1_MAP_X_COL2,
    WOD_CH1_MAP_Y_ROW0,
    WOD_CH1_MAP_Y_ROW1,
} from './chapter1Map';
import {
    DARK_AWAKENING,
    DARK_AWAKENING_FOOD_REWARD,
    DARK_AWAKENING_METAL_REWARD,
} from './missions/001_dark_awakening';
import {
    TOWARDS_THE_LIGHT,
    TOWARDS_THE_LIGHT_CRYSTAL_REWARD,
    TOWARDS_THE_LIGHT_METAL_REWARD,
} from './missions/002_towards_the_light';
import {
    LIGHT_EMPOWERED,
    LIGHT_EMPOWERED_FOOD_REWARD,
} from './missions/003_light_empowered';
import {
    CAVE_RESPITE,
    CAVE_RESPITE_CRYSTAL_REWARD,
    CAVE_RESPITE_FOOD_REWARD,
    CAVE_RESPITE_METAL_REWARD,
} from './missions/004_cave_respite';
import { MONSTER, MONSTER_CRYSTAL_REWARD } from './missions/005_monster';
import {
    CORE_AWAKENING,
    CORE_AWAKENING_CRYSTAL_REWARD,
    CORE_AWAKENING_FOOD_REWARD,
    CORE_AWAKENING_METAL_REWARD,
} from './missions/006_core_awakening';
import { mergeResourceDeltas } from '../../../../campaignResources';

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

describe('chapter 1 completion resource rewards', () => {
    it('grants cave crystals and metal on Towards the Light', () => {
        expect(TOWARDS_THE_LIGHT.completionRewards?.resourceDelta).toEqual({
            crystals: TOWARDS_THE_LIGHT_CRYSTAL_REWARD,
            metal: TOWARDS_THE_LIGHT_METAL_REWARD,
        });
    });

    it('grants food on Find some food', () => {
        expect(LIGHT_EMPOWERED.completionRewards?.resourceDelta).toEqual({
            food: LIGHT_EMPOWERED_FOOD_REWARD,
        });
    });

    it('grants crystals on The Beast', () => {
        expect(MONSTER.completionRewards?.resourceDelta).toEqual({
            crystals: MONSTER_CRYSTAL_REWARD,
        });
    });

    it('totals fifteen food, metal, and crystals across chapter 1', () => {
        const totals = mergeResourceDeltas(
            DARK_AWAKENING.completionRewards?.resourceDelta,
            TOWARDS_THE_LIGHT.completionRewards?.resourceDelta,
            LIGHT_EMPOWERED.completionRewards?.resourceDelta,
            CAVE_RESPITE.completionRewards?.resourceDelta,
            MONSTER.completionRewards?.resourceDelta,
            CORE_AWAKENING.completionRewards?.resourceDelta,
        );
        expect(totals).toEqual({
            food: CHAPTER_1_COMPLETION_FOOD,
            metal: CHAPTER_1_COMPLETION_METAL,
            crystals: CHAPTER_1_COMPLETION_CRYSTALS,
        });
        expect(DARK_AWAKENING.completionRewards?.resourceDelta).toEqual({
            food: DARK_AWAKENING_FOOD_REWARD,
            metal: DARK_AWAKENING_METAL_REWARD,
        });
        expect(CAVE_RESPITE.completionRewards?.resourceDelta).toEqual({
            food: CAVE_RESPITE_FOOD_REWARD,
            metal: CAVE_RESPITE_METAL_REWARD,
            crystals: CAVE_RESPITE_CRYSTAL_REWARD,
        });
        expect(CORE_AWAKENING.completionRewards?.resourceDelta).toEqual({
            food: CORE_AWAKENING_FOOD_REWARD,
            metal: CORE_AWAKENING_METAL_REWARD,
            crystals: CORE_AWAKENING_CRYSTAL_REWARD,
        });
    });
});
