/**
 * Chapter 2 Mission Map grid: Ember / Thorn March left the map; remaining chain slid clockwise.
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
    WOD_CH2_MAP_Y_SIDE_QUEST_DIVIDER,
    WOD_CH2_MAP_Y_SIDE_QUEST_ROW,
} from './chapter2Map';
import {
    WOD_INVESTIGATE_THE_WILDLIFE_BANK,
    WOD_POST_CORE_QUEST_BANK,
    WOD_POST_CORE_QUEST_BANK_2,
    WOD_SCAVENGE_THE_PLAINS_BANK,
    WOD_SWARMLING_SOURCE_BANK,
    WorldOfDarknessStoryline,
} from './WorldOfDarkness';
import { WOD_CH3_MAP_X_COL0, WOD_CH3_MAP_X_COL1, WOD_CH3_MAP_Y_ROW0, WOD_CH3_MAP_Y_ROW1 } from './chapter3Map';
import { CAMPSITE, CAMPSITE_2, CAMPSITE_3, CAMPSITE_4 } from './questMissions/campsite';
import { CRYSTAL_CORRUPTION } from './missions/004b_crystal_corruption';
import { DISPLACER } from './missions/006d_displacer';
import { THORNBINDER_ARENA } from './missions/006b_thornbinder_arena';
import { SOUTH_GATE_SWARM } from './missions/006c_south_gate_swarm';
import { EMBER_THRESHOLD } from './missions/007_ember_threshold';
import { THORN_MARCH } from './missions/008_thorn_march';
import { THE_CIRCLE } from './missions/010_circle_arena';

describe('chapter 2 mission map grid', () => {
    it('keeps 220px column spacing and 150px row spacing', () => {
        expect(WOD_CH2_MAP_X_COL1 - WOD_CH2_MAP_X_COL0).toBe(WOD_CH2_MAP_COL_SPACING);
        expect(WOD_CH2_MAP_X_COL2 - WOD_CH2_MAP_X_COL1).toBe(WOD_CH2_MAP_COL_SPACING);
        expect(WOD_CH2_MAP_X_COL3 - WOD_CH2_MAP_X_COL2).toBe(WOD_CH2_MAP_COL_SPACING);
        expect(WOD_CH2_MAP_Y_ROW1 - WOD_CH2_MAP_Y_ROW0).toBe(WOD_CH2_MAP_ROW_SPACING);
    });

    it('snakes the questline: row 0 left to right, then wraps to row 1 moving left', () => {
        expect(SOUTH_GATE_SWARM.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL0, y: WOD_CH2_MAP_Y_ROW0 });
        expect(CAMPSITE_4.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL1, y: WOD_CH2_MAP_Y_ROW0 });
        expect(WOD_POST_CORE_QUEST_BANK.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL2, y: WOD_CH2_MAP_Y_ROW0 });
        expect(CAMPSITE.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL3, y: WOD_CH2_MAP_Y_ROW0 });
        expect(WOD_POST_CORE_QUEST_BANK_2.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL3, y: WOD_CH2_MAP_Y_ROW1 });
        expect(CAMPSITE_2.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL2, y: WOD_CH2_MAP_Y_ROW1 });
        expect(DISPLACER.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL1, y: WOD_CH2_MAP_Y_ROW1 });
        expect(CAMPSITE_3.mapPosition).toEqual({ x: WOD_CH2_MAP_X_COL0, y: WOD_CH2_MAP_Y_ROW1 });
    });

    it('puts dedicated side quests below a "Side Quests" divider', () => {
        for (const bank of [WOD_SWARMLING_SOURCE_BANK, WOD_SCAVENGE_THE_PLAINS_BANK, WOD_INVESTIGATE_THE_WILDLIFE_BANK]) {
            expect(bank.mapPosition!.y).toBe(WOD_CH2_MAP_Y_SIDE_QUEST_ROW);
        }
        expect(WOD_CH2_MAP_Y_SIDE_QUEST_DIVIDER).toBeGreaterThan(WOD_CH2_MAP_Y_ROW1);
        expect(WOD_CH2_MAP_Y_SIDE_QUEST_DIVIDER).toBeLessThan(WOD_CH2_MAP_Y_SIDE_QUEST_ROW);
        expect(WorldOfDarknessStoryline.chapters![1].mapDividers).toEqual([
            { y: WOD_CH2_MAP_Y_SIDE_QUEST_DIVIDER, label: 'Side Quests' },
        ]);
    });

    it('chains each node on the previous one', () => {
        expect(WOD_POST_CORE_QUEST_BANK.unlockAfterMissionId).toBe('campsite_4');
        expect(WOD_POST_CORE_QUEST_BANK_2.unlockAfterQuestBankId).toBeUndefined();
        expect((WorldOfDarknessStoryline.edges ?? []).find((e) => e.toMissionId === 'campsite')?.requiresQuestBankId).toBe(WOD_POST_CORE_QUEST_BANK.id);
        expect(WOD_POST_CORE_QUEST_BANK_2.unlockAfterMissionId).toBe('campsite');
        const edges = WorldOfDarknessStoryline.edges ?? [];
        expect(edges).toContainEqual({ fromMissionId: 'south_gate_swarm', result: 'victory', toMissionId: 'campsite_4' });
        expect(edges.find((e) => e.toMissionId === 'campsite_2')?.requiresQuestBankId).toBe(WOD_POST_CORE_QUEST_BANK_2.id);
    });

    it('puts the unused missions in the admin-only Chapter 0, not chapter 2', () => {
        const ch0 = WorldOfDarknessStoryline.chapters!.find((c) => c.id === 'wod_ch0')!;
        expect(ch0.adminOnly).toBe(true);
        expect(ch0.numeral).toBe('0');
        expect(ch0.missionIds).toEqual(['thornbinder_arena', 'crystal_corruption', 'the_circle']);
        const ch2 = WorldOfDarknessStoryline.chapters!.find((c) => c.id === 'wod_ch2')!.missionIds;
        for (const id of ch0.missionIds) expect(ch2).not.toContain(id);
        const targets = (WorldOfDarknessStoryline.edges ?? []).map((e) => e.toMissionId);
        for (const id of ch0.missionIds) expect(targets).not.toContain(id);
    });

    it('lays Chapter 0 out: Thornbinder on row 0, the rest in a line on row 1', () => {
        expect(THORNBINDER_ARENA.mapPosition).toEqual({ x: WOD_CH3_MAP_X_COL0, y: WOD_CH3_MAP_Y_ROW0 });
        expect(CRYSTAL_CORRUPTION.mapPosition).toEqual({ x: WOD_CH3_MAP_X_COL0, y: WOD_CH3_MAP_Y_ROW1 });
        expect(THE_CIRCLE.mapPosition).toEqual({ x: WOD_CH3_MAP_X_COL1, y: WOD_CH3_MAP_Y_ROW1 });
    });

    it('keeps Thornbinder Arena disabled', () => {
        expect(THORNBINDER_ARENA.disabled).toBe(true);
    });

    it('removes Ember at the Threshold and Thorn March from the map', () => {
        expect(EMBER_THRESHOLD.mapPosition).toBeUndefined();
        expect(THORN_MARCH.mapPosition).toBeUndefined();
    });
});
