/**
 * Chapter 1 Mission Map grid: 1–2–3 on the top row, 6–5–4 on the bottom (snake).
 */

import { describe, expect, it } from 'vitest';
import {
    CHAPTER_1_COMPLETION_ATTUNEMENT,
    CHAPTER_1_COMPLETION_VIGOR,
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
    DARK_AWAKENING_VIGOR_REWARD,
    DARK_AWAKENING_METAL_REWARD,
} from './missions/001_dark_awakening';
import {
    TOWARDS_THE_LIGHT,
    TOWARDS_THE_LIGHT_ATTUNEMENT_REWARD,
    TOWARDS_THE_LIGHT_METAL_REWARD,
} from './missions/002_towards_the_light';
import {
    LIGHT_EMPOWERED,
    LIGHT_EMPOWERED_VIGOR_REWARD,
} from './missions/003_light_empowered';
import {
    CAVE_RESPITE,
    CAVE_RESPITE_ATTUNEMENT_REWARD,
    CAVE_RESPITE_VIGOR_REWARD,
    CAVE_RESPITE_METAL_REWARD,
} from './missions/004_cave_respite';
import { MONSTER, MONSTER_ATTUNEMENT_REWARD, MONSTER_HUNGER_RECOVERY } from './missions/005_monster';
import {
    CORE_AWAKENING,
    CORE_AWAKENING_ATTUNEMENT_REWARD,
    CORE_AWAKENING_VIGOR_REWARD,
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
    it('grants attunement and metal on Towards the Light', () => {
        expect(TOWARDS_THE_LIGHT.completionRewards?.resourceDelta).toEqual({
            attunement: TOWARDS_THE_LIGHT_ATTUNEMENT_REWARD,
            metal: TOWARDS_THE_LIGHT_METAL_REWARD,
        });
    });

    it('grants vigor on Find some food', () => {
        expect(LIGHT_EMPOWERED.completionRewards?.resourceDelta).toEqual({
            vigor: LIGHT_EMPOWERED_VIGOR_REWARD,
        });
    });

    it('grants attunement on The Beast', () => {
        expect(MONSTER.completionRewards?.resourceDelta).toEqual({
            attunement: MONSTER_ATTUNEMENT_REWARD,
        });
    });

    it('recovers 100 Hunger for each player at the end of The Beast post-mission story', () => {
        expect(MONSTER_HUNGER_RECOVERY).toBe(100);
        const phrases = MONSTER.postMissionStory!.phrases;
        expect(phrases[phrases.length - 1]).toEqual({
            type: 'recover_hunger_auto',
            amount: MONSTER_HUNGER_RECOVERY,
        });
    });

    it('totals fifteen vigor, metal, and attunement across chapter 1', () => {
        const totals = mergeResourceDeltas(
            DARK_AWAKENING.completionRewards?.resourceDelta,
            TOWARDS_THE_LIGHT.completionRewards?.resourceDelta,
            LIGHT_EMPOWERED.completionRewards?.resourceDelta,
            CAVE_RESPITE.completionRewards?.resourceDelta,
            MONSTER.completionRewards?.resourceDelta,
            CORE_AWAKENING.completionRewards?.resourceDelta,
        );
        expect(totals).toEqual({
            vigor: CHAPTER_1_COMPLETION_VIGOR,
            metal: CHAPTER_1_COMPLETION_METAL,
            attunement: CHAPTER_1_COMPLETION_ATTUNEMENT,
        });
        expect(DARK_AWAKENING.completionRewards?.resourceDelta).toEqual({
            vigor: DARK_AWAKENING_VIGOR_REWARD,
            metal: DARK_AWAKENING_METAL_REWARD,
        });
        expect(CAVE_RESPITE.completionRewards?.resourceDelta).toEqual({
            vigor: CAVE_RESPITE_VIGOR_REWARD,
            metal: CAVE_RESPITE_METAL_REWARD,
            attunement: CAVE_RESPITE_ATTUNEMENT_REWARD,
        });
        expect(CORE_AWAKENING.completionRewards?.resourceDelta).toEqual({
            vigor: CORE_AWAKENING_VIGOR_REWARD,
            metal: CORE_AWAKENING_METAL_REWARD,
            attunement: CORE_AWAKENING_ATTUNEMENT_REWARD,
        });
    });
});
