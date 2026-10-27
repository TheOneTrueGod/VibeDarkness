/**
 * Campaign chapter unlock / gating tests.
 */

import { describe, expect, it } from 'vitest';
import type { MissionResult } from '../../../types';
import type { QuestResult } from './questTypes';
import {
    getAllMissionIdsInOrder,
    getCampaignChapters,
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

const wodChapters = getCampaignChapters(WorldOfDarknessStoryline);
const CH0_IDS = ['thornbinder_arena', 'crystal_corruption', 'the_circle'];

describe('isChapterUnlocked', () => {
    it('always unlocks the first chapter', () => {
        expect(isChapterUnlocked(wodChapters[0], 0, [])).toBe(true);
    });

    it('gates chapter 2 behind a core_awakening victory', () => {
        expect(isChapterUnlocked(wodChapters[1], 1, [])).toBe(false);
        expect(isChapterUnlocked(wodChapters[1], 1, THROUGH_CORE_AWAKENING)).toBe(true);
    });

});

describe('admin-only Chapter 0', () => {
    const admin = { isAdmin: true };

    it('is hidden from non-admins and leaves player chapter indexes untouched', () => {
        expect(wodChapters.map((c) => c.id)).toEqual(['wod_ch1', 'wod_ch2', 'wod_ch3']);
        expect(getCampaignChapters(WorldOfDarknessStoryline, { isAdmin: false })).toEqual(wodChapters);
        expect(isChapterUnlocked(wodChapters[0], 0, [])).toBe(true);
        expect(isChapterUnlocked(wodChapters[1], 1, [])).toBe(false);
    });

    it('is first and always unlocked for admins, with Chapter I next', () => {
        const chapters = getCampaignChapters(WorldOfDarknessStoryline, admin);
        expect(chapters.map((c) => c.numeral)).toEqual(['0', 'I', 'II', 'III']);
        expect(isChapterUnlocked(chapters[0], 0, [])).toBe(true);
        expect(isChapterUnlocked(chapters[1], 1, [])).toBe(true);
        expect(isChapterUnlocked(chapters[2], 2, [])).toBe(false);
        expect(isChapterUnlocked(chapters[2], 2, THROUGH_CORE_AWAKENING)).toBe(true);
    });

    it('never becomes the default chapter, even for admins', () => {
        expect(getHighestUnlockedChapterIndex(WorldOfDarknessStoryline, [], admin)).toBe(1);
        expect(getHighestUnlockedChapterIndex(WorldOfDarknessStoryline, THROUGH_CORE_AWAKENING, admin)).toBe(2);
        expect(getHighestUnlockedChapterIndex(WorldOfDarknessStoryline, [])).toBe(0);
        expect(getHighestUnlockedChapterIndex(WorldOfDarknessStoryline, THROUGH_CORE_AWAKENING)).toBe(1);
    });

    it('keeps its missions locked and unlisted for non-admins, unlocked for admins', () => {
        const players = getUnlockedMissionIds(WorldOfDarknessStoryline, THROUGH_CORE_AWAKENING);
        const admins = getUnlockedMissionIds(WorldOfDarknessStoryline, [], [], admin);
        const listed = getAllMissionIdsInOrder(WorldOfDarknessStoryline);
        const adminListed = getAllMissionIdsInOrder(WorldOfDarknessStoryline, admin);
        for (const id of CH0_IDS) {
            expect(players.has(id)).toBe(false);
            expect(listed).not.toContain(id);
            expect(admins.has(id)).toBe(true);
            expect(adminListed).toContain(id);
        }
    });

    it('no storyline chapter references thornling_rise', () => {
        for (const chapter of WorldOfDarknessStoryline.chapters ?? []) {
            expect(chapter.missionIds).not.toContain('thornling_rise');
            expect(chapter.unlockAfterMissionId).not.toBe('thornling_rise');
        }
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
        expect(ids).not.toContain('thornbinder_arena'); // admin-only Chapter 0 is hidden by default
        expect(ids).not.toContain('crystal_corruption');
        expect(ids).not.toContain('the_circle');
        expect(ids).not.toContain('ember_threshold');
        expect(ids).not.toContain('thorn_march');
        // chapter order is preserved
        expect(ids.indexOf('dark_awakening')).toBeLessThan(ids.indexOf('displacer'));
    });
});
