import { describe, expect, it } from 'vitest';
import type { QuestDef } from './questTypes';
import {
    QuestSlotResolverNotImplementedError,
    resolveMissionSlot,
    resolveQuestSlots,
    slotSeedFor,
} from './questSlotResolve';
import { createLocationCardInstance } from './locationCards';
import { LOCATION_ENCOUNTER_GENERATOR_ID } from './locationCards';
import {
    SWARMLING_SOURCE,
    SWARMLING_SOURCE_FINALE_MISSION_ID,
} from './WorldOfDarkness/quests/swarmling_source';
import { QUEST_PUSH_NORTH_MISSION_ID } from './WorldOfDarkness/questMissions/quest_push_north';
import { SCAVENGE_THE_PLAINS } from './WorldOfDarkness/quests/scavenge_the_plains';
import { INVESTIGATE_THE_WILDLIFE } from './WorldOfDarkness/quests/investigate_the_wildlife';
import { QUEST_EMBER_THRESHOLD_MISSION_ID } from './WorldOfDarkness/questMissions/quest_ember_threshold';
import { QUEST_THORN_MARCH_MISSION_ID } from './WorldOfDarkness/questMissions/quest_thorn_march';
import {
    FOUND_BERRIES_LOCATION_CARD_ID,
    LOCATION_PLAINS_TAG,
    PLAINS_RANDOM_STORY_CHALLENGE_MAX,
    PLAINS_RANDOM_STORY_CHALLENGE_MIN,
    SURFACE_METAL_DEPOSIT_LOCATION_CARD_ID,
} from './WorldOfDarkness/questMissions/questMissionConstants';
import { FOUND_BERRIES_MISSION_ID } from './WorldOfDarkness/questMissions/found_berries';
import { SURFACE_METAL_DEPOSIT_MISSION_ID } from './WorldOfDarkness/questMissions/surface_metal_deposit';
import { RANDOM_STORY_GENERATOR_ID } from './randomStoryResolve';

const RUN_SEED = 42;

describe('resolveQuestSlots — swarmling_source', () => {
    it('resolves fixed north push, generated plains story, and the Swarmling Nest finale', () => {
        const resolved = resolveQuestSlots(SWARMLING_SOURCE, { runSeed: RUN_SEED });
        expect(resolved[0]).toEqual({ kind: 'fixed', missionId: QUEST_PUSH_NORTH_MISSION_ID });
        expect(resolved[1]?.kind).toBe('generated');
        if (resolved[1]?.kind === 'generated') {
            expect([FOUND_BERRIES_MISSION_ID, SURFACE_METAL_DEPOSIT_MISSION_ID]).toContain(
                resolved[1].missionId,
            );
            expect(resolved[1].generatorId).toBe(RANDOM_STORY_GENERATOR_ID);
        }
        expect(resolved[2]).toEqual({
            kind: 'fixed',
            missionId: SWARMLING_SOURCE_FINALE_MISSION_ID,
        });
        expect(SWARMLING_SOURCE_FINALE_MISSION_ID).toBe('swarmling_nest');
    });

    it('is stable for the same runSeed', () => {
        const a = resolveQuestSlots(SWARMLING_SOURCE, { runSeed: RUN_SEED });
        const b = resolveQuestSlots(SWARMLING_SOURCE, { runSeed: RUN_SEED });
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

    it('picks a plains bag mission for Investigate the Wildlife slot 1', () => {
        const resolved = resolveQuestSlots(INVESTIGATE_THE_WILDLIFE, { runSeed: RUN_SEED });
        expect(resolved[0]).toEqual({ kind: 'fixed', missionId: QUEST_EMBER_THRESHOLD_MISSION_ID });
        expect(resolved[1]?.kind).toBe('generated');
        if (resolved[1]?.kind === 'generated') {
            expect([FOUND_BERRIES_MISSION_ID, SURFACE_METAL_DEPOSIT_MISSION_ID]).toContain(
                resolved[1].missionId,
            );
            expect(resolved[1].generatorId).toBe(RANDOM_STORY_GENERATOR_ID);
        }
        expect(resolved[2]).toEqual({ kind: 'fixed', missionId: QUEST_THORN_MARCH_MISSION_ID });
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

describe('resolveQuestSlots — location_encounter', () => {
    const inst1 = createLocationCardInstance(1, 'inst-001');
    const inst2 = createLocationCardInstance(2, 'inst-002');

    const questWithLocationSlots: QuestDef = {
        id: 'location_test_quest',
        title: 'Location Encounters (test only)',
        campaignId: 'world_of_darkness',
        slots: [
            { kind: 'location_encounter', fallback: { tags: [LOCATION_PLAINS_TAG] } },
            { kind: 'location_encounter', fallback: { tags: [LOCATION_PLAINS_TAG] } },
        ],
    };

    const questWith3LocationSlots: QuestDef = {
        id: 'location_test_quest_3',
        title: 'Location Encounters 3 slots (test only)',
        campaignId: 'world_of_darkness',
        slots: [
            { kind: 'location_encounter', fallback: { tags: [LOCATION_PLAINS_TAG] } },
            { kind: 'location_encounter', fallback: { tags: [LOCATION_PLAINS_TAG] } },
            { kind: 'location_encounter', fallback: { tags: [LOCATION_PLAINS_TAG] } },
        ],
    };

    it('is deterministic for the same runSeed', () => {
        const deck = [inst1, inst2];
        const a = resolveQuestSlots(questWithLocationSlots, { runSeed: RUN_SEED, locationDeck: deck });
        const b = resolveQuestSlots(questWithLocationSlots, { runSeed: RUN_SEED, locationDeck: deck });
        expect(a).toEqual(b);
    });

    it('uses location_encounter generator id and includes locationCardInstanceId', () => {
        const deck = [inst1, inst2];
        const resolved = resolveQuestSlots(questWithLocationSlots, {
            runSeed: RUN_SEED,
            locationDeck: deck,
        });
        expect(resolved[0]?.kind).toBe('generated');
        if (resolved[0]?.kind === 'generated') {
            expect(resolved[0].generatorId).toBe(LOCATION_ENCOUNTER_GENERATOR_ID);
            expect(resolved[0].locationCardInstanceId).toBeDefined();
            expect([inst1.instanceId, inst2.instanceId]).toContain(resolved[0].locationCardInstanceId);
        }
    });

    it('with 2-card deck and 2 location slots, both cards are used (no repeat)', () => {
        const deck = [inst1, inst2];
        const resolved = resolveQuestSlots(questWithLocationSlots, {
            runSeed: RUN_SEED,
            locationDeck: deck,
        });

        const id0 = resolved[0]?.kind === 'generated' ? resolved[0].locationCardInstanceId : null;
        const id1 = resolved[1]?.kind === 'generated' ? resolved[1].locationCardInstanceId : null;

        expect(id0).not.toBeNull();
        expect(id1).not.toBeNull();
        expect(id0).not.toBe(id1);
        expect([inst1.instanceId, inst2.instanceId]).toContain(id0 as string);
        expect([inst1.instanceId, inst2.instanceId]).toContain(id1 as string);
    });

    it('with 3 location slots and 2-card deck, third slot repeats only after both used', () => {
        const deck = [inst1, inst2];
        const resolved = resolveQuestSlots(questWith3LocationSlots, {
            runSeed: RUN_SEED,
            locationDeck: deck,
        });

        const id0 = resolved[0]?.kind === 'generated' ? resolved[0].locationCardInstanceId : null;
        const id1 = resolved[1]?.kind === 'generated' ? resolved[1].locationCardInstanceId : null;
        const id2 = resolved[2]?.kind === 'generated' ? resolved[2].locationCardInstanceId : null;

        // First two should be different (using both cards)
        expect(id0).not.toBe(id1);
        // Third should repeat one that was used (use-count preference)
        expect([id0, id1]).toContain(id2);
    });

    it('two instances of the same card id are picked separately', () => {
        const inst1_dup = createLocationCardInstance(1, 'inst-001-dup');
        const deck = [inst1, inst1_dup];
        const resolved = resolveQuestSlots(questWithLocationSlots, {
            runSeed: RUN_SEED,
            locationDeck: deck,
        });

        const id0 = resolved[0]?.kind === 'generated' ? resolved[0].locationCardInstanceId : null;
        const id1 = resolved[1]?.kind === 'generated' ? resolved[1].locationCardInstanceId : null;

        // Should use both instances even though they have the same card id
        expect(id0).not.toBe(id1);
        expect([inst1.instanceId, inst1_dup.instanceId]).toContain(id0 as string);
        expect([inst1.instanceId, inst1_dup.instanceId]).toContain(id1 as string);
    });

    it('empty deck falls back to random_story', () => {
        const resolved = resolveQuestSlots(questWithLocationSlots, {
            runSeed: RUN_SEED,
            locationDeck: [],
        });

        expect(resolved[0]?.kind).toBe('generated');
        if (resolved[0]?.kind === 'generated') {
            // Should use RANDOM_STORY_GENERATOR_ID, not LOCATION_ENCOUNTER_GENERATOR_ID
            expect(resolved[0].generatorId).toBe(RANDOM_STORY_GENERATOR_ID);
            // Should have a valid mission from the plains bag
            expect([FOUND_BERRIES_MISSION_ID, SURFACE_METAL_DEPOSIT_MISSION_ID]).toContain(
                resolved[0].missionId,
            );
        }
    });

    it('SCAVENGE_THE_PLAINS slot 0 is location_encounter with appropriate fallback', () => {
        expect(SCAVENGE_THE_PLAINS.slots[0]?.kind).toBe('location_encounter');
        if (SCAVENGE_THE_PLAINS.slots[0]?.kind === 'location_encounter') {
            const fallback = SCAVENGE_THE_PLAINS.slots[0].fallback;
            expect(fallback?.challengeRatingMin).toBe(PLAINS_RANDOM_STORY_CHALLENGE_MIN);
            expect(fallback?.challengeRatingMax).toBe(PLAINS_RANDOM_STORY_CHALLENGE_MAX);
            expect(fallback?.tags).toContain(LOCATION_PLAINS_TAG);
            expect(fallback?.outcomeBias).toBe('beneficial');
        }
    });

    it('INVESTIGATE_THE_WILDLIFE grants Found Berries location card on completion', () => {
        expect(INVESTIGATE_THE_WILDLIFE.completionRewards?.locationCardIds).toEqual([
            FOUND_BERRIES_LOCATION_CARD_ID,
        ]);
    });

    it('SWARMLING_SOURCE grants Surface Metal Deposit location card on completion', () => {
        expect(SWARMLING_SOURCE.completionRewards?.locationCardIds).toEqual([
            SURFACE_METAL_DEPOSIT_LOCATION_CARD_ID,
        ]);
    });

    it('resolving SCAVENGE_THE_PLAINS with empty deck yields fallback story-bag mission', () => {
        const resolved = resolveQuestSlots(SCAVENGE_THE_PLAINS, {
            runSeed: RUN_SEED,
            locationDeck: [],
        });
        // Slot 0 should resolve to a random_story fallback, not a location card
        expect(resolved[0]?.kind).toBe('generated');
        if (resolved[0]?.kind === 'generated') {
            expect(resolved[0].generatorId).toBe(RANDOM_STORY_GENERATOR_ID);
            expect([FOUND_BERRIES_MISSION_ID, SURFACE_METAL_DEPOSIT_MISSION_ID]).toContain(
                resolved[0].missionId,
            );
        }
    });

    it('resolving SCAVENGE_THE_PLAINS with Surface Metal card in deck yields that card', () => {
        const metalCard = createLocationCardInstance(SURFACE_METAL_DEPOSIT_LOCATION_CARD_ID, 'metal-inst');
        const resolved = resolveQuestSlots(SCAVENGE_THE_PLAINS, {
            runSeed: RUN_SEED,
            locationDeck: [metalCard],
        });
        // Slot 0 should resolve to the location card instance
        expect(resolved[0]?.kind).toBe('generated');
        if (resolved[0]?.kind === 'generated') {
            expect(resolved[0].generatorId).toBe(LOCATION_ENCOUNTER_GENERATOR_ID);
            expect(resolved[0].missionId).toBe(SURFACE_METAL_DEPOSIT_MISSION_ID);
            expect(resolved[0].locationCardInstanceId).toBe(metalCard.instanceId);
        }
    });
});
