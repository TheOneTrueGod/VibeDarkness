import { describe, expect, it } from 'vitest';
import type { QuestDef } from './questTypes';
import {
    QuestSlotResolverNotImplementedError,
    resolveMissionSlot,
    resolveQuestSlots,
    slotSeedFor,
} from './questSlotResolve';
import {
    FIND_THE_HERD_OF_BOARS,
    FIND_THE_HERD_OF_BOARS_FINALE_MISSION_ID,
} from './WorldOfDarkness/quests/find_the_herd_of_boars';
import { SCAVENGE_THE_PLAINS } from './WorldOfDarkness/quests/scavenge_the_plains';
import {
    LOCATION_PLAINS_TAG,
    PLAINS_RANDOM_STORY_CHALLENGE_MAX,
    PLAINS_RANDOM_STORY_CHALLENGE_MIN,
} from './WorldOfDarkness/questMissions/questMissionConstants';
import { FOUND_BERRIES_MISSION_ID } from './WorldOfDarkness/questMissions/found_berries';
import { SURFACE_METAL_DEPOSIT_MISSION_ID } from './WorldOfDarkness/questMissions/surface_metal_deposit';
import { RANDOM_STORY_GENERATOR_ID } from './randomStoryResolve';

const RUN_SEED = 42;

describe('resolveQuestSlots — find_the_herd_of_boars', () => {
    it('resolves fixed north push, generated plains story, and the Swarmling Nest finale', () => {
        const resolved = resolveQuestSlots(FIND_THE_HERD_OF_BOARS, { runSeed: RUN_SEED });
        expect(resolved[0]).toEqual({ kind: 'fixed', missionId: 'quest_boar_herd_north' });
        expect(resolved[1]?.kind).toBe('generated');
        if (resolved[1]?.kind === 'generated') {
            expect([FOUND_BERRIES_MISSION_ID, SURFACE_METAL_DEPOSIT_MISSION_ID]).toContain(
                resolved[1].missionId,
            );
            expect(resolved[1].generatorId).toBe(RANDOM_STORY_GENERATOR_ID);
        }
        expect(resolved[2]).toEqual({
            kind: 'fixed',
            missionId: FIND_THE_HERD_OF_BOARS_FINALE_MISSION_ID,
        });
        expect(FIND_THE_HERD_OF_BOARS_FINALE_MISSION_ID).toBe('swarmling_nest');
    });

    it('is stable for the same runSeed', () => {
        const a = resolveQuestSlots(FIND_THE_HERD_OF_BOARS, { runSeed: RUN_SEED });
        const b = resolveQuestSlots(FIND_THE_HERD_OF_BOARS, { runSeed: RUN_SEED });
        expect(a).toEqual(b);
    });
});

describe('resolveMissionSlot — fixed', () => {
    it('copies missionId onto a fixed ResolvedMissionRef', () => {
        const ref = resolveMissionSlot(
            { kind: 'fixed', missionId: 'dark_awakening' },
            { runSeed: RUN_SEED, slotIndex: 0 },
        );
        expect(ref).toEqual({ kind: 'fixed', missionId: 'dark_awakening' });
    });
});

describe('resolveQuestSlots — random_story', () => {
    it('picks a plains bag mission for Scavenge the Plains slot 0', () => {
        const resolved = resolveQuestSlots(SCAVENGE_THE_PLAINS, { runSeed: RUN_SEED });
        expect(resolved[0]?.kind).toBe('generated');
        if (resolved[0]?.kind === 'generated') {
            expect([FOUND_BERRIES_MISSION_ID, SURFACE_METAL_DEPOSIT_MISSION_ID]).toContain(
                resolved[0].missionId,
            );
            expect(resolved[0].generatorId).toBe(RANDOM_STORY_GENERATOR_ID);
        }
        expect(resolved[1]).toEqual({ kind: 'fixed', missionId: 'quest_find_some_food' });
        expect(resolved[2]).toEqual({ kind: 'fixed', missionId: 'quest_crystal_corruption' });
    });

    it('is stable for the same runSeed', () => {
        const a = resolveQuestSlots(SCAVENGE_THE_PLAINS, { runSeed: RUN_SEED });
        const b = resolveQuestSlots(SCAVENGE_THE_PLAINS, { runSeed: RUN_SEED });
        expect(a).toEqual(b);
    });

    it('resolves random_story alone with plains filters', () => {
        const ref = resolveMissionSlot(
            {
                kind: 'random_story',
                params: {
                    challengeRatingMin: PLAINS_RANDOM_STORY_CHALLENGE_MIN,
                    challengeRatingMax: PLAINS_RANDOM_STORY_CHALLENGE_MAX,
                    tags: [LOCATION_PLAINS_TAG],
                },
            },
            { runSeed: RUN_SEED, slotIndex: 0, slotSeed: slotSeedFor(RUN_SEED, 0) },
        );
        expect(ref.kind).toBe('generated');
    });
});

describe('resolveQuestSlots — random_battle stub', () => {
    const mixedQuest: QuestDef = {
        id: 'mixed_slots_test_quest',
        title: 'Mixed slots (test only)',
        campaignId: 'world_of_darkness',
        slots: [
            { kind: 'fixed', missionId: 'dark_awakening' },
            { kind: 'random_battle', params: { biome: 'forest', challengeRating: 1 } },
        ],
    };

    it('throws QuestSlotResolverNotImplementedError on random_battle', () => {
        expect(() => resolveQuestSlots(mixedQuest, { runSeed: RUN_SEED })).toThrow(
            QuestSlotResolverNotImplementedError,
        );
        try {
            resolveQuestSlots(mixedQuest, { runSeed: RUN_SEED });
        } catch (e) {
            expect(e).toBeInstanceOf(QuestSlotResolverNotImplementedError);
            const err = e as QuestSlotResolverNotImplementedError;
            expect(err.slotKind).toBe('random_battle');
            expect(err.slotIndex).toBe(1);
        }
    });
});

describe('slotSeedFor', () => {
    it('differs by slot index for the same runSeed', () => {
        expect(slotSeedFor(RUN_SEED, 0)).not.toBe(slotSeedFor(RUN_SEED, 1));
        expect(slotSeedFor(RUN_SEED, 0)).toBe(slotSeedFor(RUN_SEED, 0));
    });
});
