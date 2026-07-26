import { describe, expect, it } from 'vitest';
import type { QuestDef } from './questTypes';
import {
    QuestSlotResolverNotImplementedError,
    resolveMissionSlot,
    resolveQuestSlots,
    slotSeedFor,
} from './questSlotResolve';
import { FIND_THE_HERD_OF_BOARS } from './WorldOfDarkness/quests/find_the_herd_of_boars';

const RUN_SEED = 42;

describe('resolveQuestSlots — fixed only', () => {
    it('resolves the example quest to fixed mission refs in order', () => {
        const resolved = resolveQuestSlots(FIND_THE_HERD_OF_BOARS, { runSeed: RUN_SEED });
        expect(resolved).toEqual([
            { kind: 'fixed', missionId: 'dark_awakening' },
            { kind: 'fixed', missionId: 'towards_the_light' },
            { kind: 'fixed', missionId: 'light_empowered' },
        ]);
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

describe('resolveQuestSlots — random stubs', () => {
    const mixedQuest: QuestDef = {
        id: 'mixed_slots_test_quest',
        title: 'Mixed slots (test only)',
        campaignId: 'world_of_darkness',
        slots: [
            { kind: 'fixed', missionId: 'dark_awakening' },
            { kind: 'random_battle', params: { biome: 'forest', challengeRating: 1 } },
            { kind: 'random_story', params: { outcomeBias: 'neutral' } },
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
            expect(err.message).toMatch(/random_battle/);
            expect(err.params).toEqual({ biome: 'forest', challengeRating: 1 });
        }
    });

    it('throws for random_story when resolved alone', () => {
        expect(() =>
            resolveMissionSlot(
                { kind: 'random_story', params: { tags: ['placeholder'] } },
                { runSeed: RUN_SEED, slotIndex: 2, slotSeed: slotSeedFor(RUN_SEED, 2) },
            ),
        ).toThrow(QuestSlotResolverNotImplementedError);
        try {
            resolveMissionSlot(
                { kind: 'random_story', params: { tags: ['placeholder'] } },
                { runSeed: RUN_SEED, slotIndex: 2 },
            );
        } catch (e) {
            expect(e).toBeInstanceOf(QuestSlotResolverNotImplementedError);
            const err = e as QuestSlotResolverNotImplementedError;
            expect(err.slotKind).toBe('random_story');
            expect(err.slotIndex).toBe(2);
        }
    });
});

describe('slotSeedFor', () => {
    it('differs by slot index for the same runSeed', () => {
        expect(slotSeedFor(RUN_SEED, 0)).not.toBe(slotSeedFor(RUN_SEED, 1));
        expect(slotSeedFor(RUN_SEED, 0)).toBe(slotSeedFor(RUN_SEED, 0));
    });
});
