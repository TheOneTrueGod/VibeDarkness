/**
 * Campaign chapter unlock / gating tests.
 */

import { describe, expect, it } from 'vitest';
import type { MissionResult } from '../../../types';
import type { QuestResult } from './questTypes';
import {
    getAllMissionIdsInOrder,
    getHighestUnlockedChapterIndex,
    getUnlockedMissionIds,
    isChapterUnlocked,
} from './unlock';
import { BunkerAtTheEndStoryline } from './BunkerAtTheEnd/BunkerAtTheEnd';
import {
    WOD_SWARMLING_SOURCE_BANK_ID,
    WOD_POST_CORE_QUEST_BANK_ID,
    WOD_POST_CORE_QUEST_BANK_2_ID,
    WOD_SCAVENGE_THE_PLAINS_BANK_ID,
    WOD_INVESTIGATE_THE_WILDLIFE_BANK_ID,
    WorldOfDarknessStoryline,
} from './WorldOfDarkness/WorldOfDarkness';

function victory(missionId: string): MissionResult {
    return { missionId, result: 'victory' };
}

/** Mission results for a clean run through the end of chapter 1. */
const THROUGH_CORE_AWAKENING: MissionResult[] = [
    victory('dark_awakening'),
    victory('towards_the_light'),
    victory('light_empowered'),
    victory('cave_respite'),
    victory('monster'),
    victory('core_awakening'),
];

const wodChapters = WorldOfDarknessStoryline.chapters ?? [];

describe('isChapterUnlocked', () => {
    it('always unlocks the first chapter', () => {
        expect(isChapterUnlocked(wodChapters[0], 0, [])).toBe(true);
    });

    it('gates chapter 2 behind a core_awakening victory', () => {
        expect(isChapterUnlocked(wodChapters[1], 1, [])).toBe(false);
        expect(isChapterUnlocked(wodChapters[1], 1, THROUGH_CORE_AWAKENING)).toBe(true);
    });

    it('gates chapter 3 behind a thornling_rise victory', () => {
        expect(isChapterUnlocked(wodChapters[2], 2, THROUGH_CORE_AWAKENING)).toBe(false);
        expect(
            isChapterUnlocked(wodChapters[2], 2, [...THROUGH_CORE_AWAKENING, victory('thornling_rise')]),
        ).toBe(true);
    });
});

describe('getHighestUnlockedChapterIndex', () => {
    it('is 0 with no progress', () => {
        expect(getHighestUnlockedChapterIndex(WorldOfDarknessStoryline, [])).toBe(0);
    });

    it('is 1 after core_awakening', () => {
        expect(
            getHighestUnlockedChapterIndex(WorldOfDarknessStoryline, THROUGH_CORE_AWAKENING),
        ).toBe(1);
    });

    it('is 2 after thornling_rise', () => {
        expect(
            getHighestUnlockedChapterIndex(WorldOfDarknessStoryline, [
                ...THROUGH_CORE_AWAKENING,
                victory('thornling_rise'),
            ]),
        ).toBe(2);
    });

    it('is 0 for a single-chapter campaign', () => {
        expect(getHighestUnlockedChapterIndex(BunkerAtTheEndStoryline, [])).toBe(0);
        expect(
            getHighestUnlockedChapterIndex(BunkerAtTheEndStoryline, [victory('last_holdout')]),
        ).toBe(0);
    });
});

describe('getUnlockedMissionIds — chapter gating', () => {
    it('hides chapter 2 missions until the chapter unlocks', () => {
        const unlocked = getUnlockedMissionIds(WorldOfDarknessStoryline, []);
        expect(unlocked.has('dark_awakening')).toBe(true);
        expect(unlocked.has('displacer')).toBe(false);
        expect(unlocked.has('thornbinder_arena')).toBe(false);
        expect(unlocked.has('crystal_corruption')).toBe(false);
        expect(unlocked.has('the_circle')).toBe(false);
    });

    it('unlocks chapter 2 entry missions on core_awakening, but not the chained ones', () => {
        const unlocked = getUnlockedMissionIds(WorldOfDarknessStoryline, THROUGH_CORE_AWAKENING);
        expect(unlocked.has('south_gate_swarm')).toBe(true);
        expect(unlocked.has('crystal_corruption')).toBe(false);
        expect(unlocked.has('the_circle')).toBe(false);
        expect(unlocked.has('thornbinder_arena')).toBe(false);
    });

    it('unlocks the first campsite right after South Gate Swarm', () => {
        expect(getUnlockedMissionIds(WorldOfDarknessStoryline, THROUGH_CORE_AWAKENING).has('campsite_4')).toBe(false);
        expect(
            getUnlockedMissionIds(WorldOfDarknessStoryline, [...THROUGH_CORE_AWAKENING, victory('south_gate_swarm')])
                .has('campsite_4'),
        ).toBe(true);
    });

    it('unlocks the campsite before Displacer after bank 2, then Displacer after that campsite, then the last campsite after Displacer', () => {
        const bankVictory = (questDefId: string): QuestResult => ({
            questDefId,
            result: 'victory',
            placement: 'bank',
            bankId: WOD_POST_CORE_QUEST_BANK_2_ID,
        });
        const bank2Done = [bankVictory('a'), bankVictory('b')];
        expect(
            getUnlockedMissionIds(WorldOfDarknessStoryline, THROUGH_CORE_AWAKENING, bank2Done.slice(0, 1)).has(
                'campsite_2',
            ),
        ).toBe(false);
        const afterBank2 = getUnlockedMissionIds(WorldOfDarknessStoryline, THROUGH_CORE_AWAKENING, bank2Done);
        expect(afterBank2.has('campsite_2')).toBe(true);
        expect(afterBank2.has('displacer')).toBe(false);
        expect(afterBank2.has('thornbinder_arena')).toBe(false);
        const afterCampsite2 = getUnlockedMissionIds(
            WorldOfDarknessStoryline,
            [...THROUGH_CORE_AWAKENING, victory('campsite_2')],
            bank2Done,
        );
        expect(afterCampsite2.has('displacer')).toBe(true);
        expect(afterCampsite2.has('thornbinder_arena')).toBe(false);
        expect(afterCampsite2.has('campsite_3')).toBe(false);
        const afterDisplacer = getUnlockedMissionIds(
            WorldOfDarknessStoryline,
            [...THROUGH_CORE_AWAKENING, victory('campsite_2'), victory('displacer')],
            bank2Done,
        );
        expect(afterDisplacer.has('campsite_3')).toBe(true);
        expect(afterDisplacer.has('thornbinder_arena')).toBe(false);
    });

    it('unlocks the chapter 3 missions as entry missions', () => {
        const results = [...THROUGH_CORE_AWAKENING, victory('thornling_rise')];
        const unlocked = getUnlockedMissionIds(WorldOfDarknessStoryline, results);
        for (const id of ['thornbinder_arena', 'crystal_corruption', 'the_circle', 'thornling_rise']) {
            expect(unlocked.has(id)).toBe(true);
        }
    });

    it('keeps single-chapter campaigns behaving as before', () => {
        expect(getUnlockedMissionIds(BunkerAtTheEndStoryline, [])).toEqual(new Set(['last_holdout']));
        expect(
            getUnlockedMissionIds(BunkerAtTheEndStoryline, [victory('last_holdout')]),
        ).toEqual(new Set(['last_holdout', 'swarm_pressure']));
    });
});

describe('chapter composition', () => {
    it('puts the Surface Quests bank in chapter 2, not chapter 1', () => {
        expect(wodChapters[0].questBankIds ?? []).not.toContain(WOD_POST_CORE_QUEST_BANK_ID);
        expect(wodChapters[1].questBankIds).toContain(WOD_POST_CORE_QUEST_BANK_ID);
    });

    it('puts dedicated chapter 2 side-quest nodes on chapter 2 only', () => {
        expect(wodChapters[0].questBankIds ?? []).toEqual([]);
        expect(wodChapters[1].questBankIds).toEqual([
            WOD_SWARMLING_SOURCE_BANK_ID,
            WOD_SCAVENGE_THE_PLAINS_BANK_ID,
            WOD_INVESTIGATE_THE_WILDLIFE_BANK_ID,
            WOD_POST_CORE_QUEST_BANK_ID,
            WOD_POST_CORE_QUEST_BANK_2_ID,
        ]);
    });
});

describe('getAllMissionIdsInOrder — flat list still complete', () => {
    it('includes chapter 2 missions that no longer sit on an edge', () => {
        const ids = getAllMissionIdsInOrder(WorldOfDarknessStoryline);
        expect(ids).toContain('displacer');
        expect(ids).toContain('campsite_3');
        expect(ids).toContain('thornbinder_arena');
        expect(ids).toContain('crystal_corruption');
        expect(ids).toContain('the_circle');
        expect(ids).not.toContain('ember_threshold');
        expect(ids).not.toContain('thorn_march');
        // chapter order is preserved
        expect(ids.indexOf('dark_awakening')).toBeLessThan(ids.indexOf('thornbinder_arena'));
    });
});
