/**
 * Campaign chapter unlock / gating tests.
 */

import { describe, expect, it } from 'vitest';
import type { MissionResult } from '../../../types';
import {
    getAllMissionIdsInOrder,
    getHighestUnlockedChapterIndex,
    getUnlockedMissionIds,
    isChapterUnlocked,
} from './unlock';
import { WorldOfDarknessStoryline } from './WorldOfDarkness/WorldOfDarkness';
import { BunkerAtTheEndStoryline } from './BunkerAtTheEnd/BunkerAtTheEnd';

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
        expect(unlocked.has('thornbinder_arena')).toBe(false);
        expect(unlocked.has('crystal_corruption')).toBe(false);
        expect(unlocked.has('the_circle')).toBe(false);
    });

    it('unlocks chapter 2 entry missions on core_awakening, but not the chained ones', () => {
        const unlocked = getUnlockedMissionIds(WorldOfDarknessStoryline, THROUGH_CORE_AWAKENING);
        expect(unlocked.has('thornbinder_arena')).toBe(true);
        expect(unlocked.has('crystal_corruption')).toBe(true);
        expect(unlocked.has('the_circle')).toBe(true);
        expect(unlocked.has('south_gate_swarm')).toBe(false);
    });

    it('unlocks the next chained mission after its predecessor victory', () => {
        const unlocked = getUnlockedMissionIds(WorldOfDarknessStoryline, [
            ...THROUGH_CORE_AWAKENING,
            victory('thornbinder_arena'),
        ]);
        expect(unlocked.has('south_gate_swarm')).toBe(true);
        expect(unlocked.has('ember_threshold')).toBe(false);
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
        expect(wodChapters[0].questBankIds ?? []).not.toContain('wod_post_core_awakening_quests');
        expect(wodChapters[1].questBankIds).toContain('wod_post_core_awakening_quests');
    });
});

describe('getAllMissionIdsInOrder — flat list still complete', () => {
    it('includes chapter 2 missions that no longer sit on an edge', () => {
        const ids = getAllMissionIdsInOrder(WorldOfDarknessStoryline);
        expect(ids).toContain('thornbinder_arena');
        expect(ids).toContain('crystal_corruption');
        expect(ids).toContain('the_circle');
        // chapter order is preserved
        expect(ids.indexOf('dark_awakening')).toBeLessThan(ids.indexOf('thornbinder_arena'));
    });
});
