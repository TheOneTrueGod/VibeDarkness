/**
 * High-level integration tests for location cards in quest flows.
 * Tests pure domain logic: no battle engine, no UI, no network.
 * Covers deck building, slot resolution, multiplayer stamping, and modifications.
 */

import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestRunState } from './questTypes';
import {
    advanceQuestRunOnMissionVictory,
    completeQuestRun,
    finalizeQuestPrepLoadout,
    startQuestRun,
} from './questRun';
import { ensureQuestPrepRun } from './questPrepFinalize';
import { questLobbyFieldsFromRun } from './questLobby';
import {
    addLocationCardsToDeck,
    applyLocationModificationsToOptions,
    createLocationCardInstance,
    getLocationCardDef,
    type LocationCardInstance,
} from './locationCards';
import {
    FOUND_BERRIES_LOCATION_CARD_ID,
    SURFACE_METAL_DEPOSIT_LOCATION_CARD_ID,
} from './WorldOfDarkness/questMissions/questMissionConstants';
import { INVESTIGATE_THE_WILDLIFE } from './WorldOfDarkness/quests/investigate_the_wildlife';
import { SCAVENGE_THE_PLAINS } from './WorldOfDarkness/quests/scavenge_the_plains';
import { SWARMLING_SOURCE } from './WorldOfDarkness/quests/swarmling_source';
import { FOUND_BERRIES_MISSION_ID, FOUND_BERRIES_CHOICE_ID, FOUND_BERRIES } from './WorldOfDarkness/questMissions/found_berries';
import { SURFACE_METAL_DEPOSIT_MISSION_ID } from './WorldOfDarkness/questMissions/surface_metal_deposit';
import { applyHealWoundsToHungerLoss } from './matchHunger';
import type { ChoicePhrase } from './storyTypes';

const CHARACTER = { id: 'char_location_test', equipment: [] as const };

function startActiveRun(params: Parameters<typeof startQuestRun>[0]): QuestRunState {
    const prep = startQuestRun(params);
    return finalizeQuestPrepLoadout({
        run: prep,
        equipment: params.character.equipment,
        selectedAbilityIds: [],
        partyRoster: [{ playerName: 'Tester', characterId: params.character.id }],
    });
}

function advanceThroughAllSlots(run: QuestRunState, questDef: QuestDef): QuestRunState {
    let current = run;
    for (let i = 0; i < questDef.slots.length - 1; i++) {
        const step = advanceQuestRunOnMissionVictory(current);
        if (step.kind !== 'continued') throw new Error(`Expected continued at slot ${i}`);
        current = step.run;
    }
    const finale = advanceQuestRunOnMissionVictory(current);
    if (finale.kind !== 'finale') throw new Error('Expected finale');
    return finale.run;
}

describe('locationCards.questFlow — grant and deck building', () => {
    it('completing Investigate the Wildlife grants Found Berries to the deck', () => {
        let run = startActiveRun({
            questDef: INVESTIGATE_THE_WILDLIFE,
            character: CHARACTER,
            runSeed: 1,
            runId: 'investigate_quest_run',
        });

        run = advanceThroughAllSlots(run, INVESTIGATE_THE_WILDLIFE);

        const completed = completeQuestRun(run, INVESTIGATE_THE_WILDLIFE);
        expect(completed.campaignRewardsToApply.locationCardIds).toEqual([1]);

        // Grant to deck
        const deck = addLocationCardsToDeck(undefined, [1], () => 'i1');
        expect(deck).toHaveLength(1);
        expect(deck[0]).toEqual({
            instanceId: 'i1',
            location_card_id: FOUND_BERRIES_LOCATION_CARD_ID,
            modifications: [],
        });

        const def = getLocationCardDef(1);
        expect(def?.displayName).toBe('Found Berries');
        expect(def?.missionId).toBe(FOUND_BERRIES_MISSION_ID);
    });

    it('completing Swarmling Source grants Surface Metal Deposit; appending to deck gives both cards', () => {
        let run = startActiveRun({
            questDef: SWARMLING_SOURCE,
            character: CHARACTER,
            runSeed: 2,
            runId: 'swarmling_quest_run',
        });

        run = advanceThroughAllSlots(run, SWARMLING_SOURCE);

        const completed = completeQuestRun(run, SWARMLING_SOURCE);
        expect(completed.campaignRewardsToApply.locationCardIds).toEqual([2]);

        // Start with Found Berries deck, add Surface Metal Deposit
        const deckV1 = addLocationCardsToDeck(undefined, [1], () => 'i1');
        const deckV2 = addLocationCardsToDeck(deckV1, [2], () => 'i2');

        expect(deckV2).toHaveLength(2);
        expect(deckV2[0].location_card_id).toBe(1);
        expect(deckV2[1].location_card_id).toBe(2);
    });

    it('re-granting the same card keeps the existing instance with its modifications', () => {
        const modifiedInstance: LocationCardInstance = {
            instanceId: 'modified_berries',
            location_card_id: FOUND_BERRIES_LOCATION_CARD_ID,
            displayNameOverride: 'Rare Berries',
            modifications: [
                {
                    type: 'add_reward',
                    slot: 3,
                    reward_id: 4,
                },
            ],
        };
        const deckWithMod = [modifiedInstance];

        // Re-grant card 1 (which is already in the deck)
        const result = addLocationCardsToDeck(deckWithMod, [FOUND_BERRIES_LOCATION_CARD_ID], () => 'should_not_call');

        expect(result).toHaveLength(1);
        expect(result[0]).toBe(modifiedInstance); // same object, same modifications
        expect(result[0].displayNameOverride).toBe('Rare Berries');
        expect(result[0].modifications).toHaveLength(1);
    });

    it('starting Scavenge the Plains with one-card deck resolves slot 0 to that card\'s mission', () => {
        const deck = [createLocationCardInstance(FOUND_BERRIES_LOCATION_CARD_ID, 'found_berries_i1')];

        const run = startQuestRun({
            questDef: SCAVENGE_THE_PLAINS,
            character: CHARACTER,
            runSeed: 3,
            locationDeck: deck,
        });

        expect(run.resolvedSlots[0]).toBeDefined();
        expect(run.resolvedSlots[0].missionId).toBe(FOUND_BERRIES_MISSION_ID);
        expect(run.resolvedSlots[0].kind).toBe('generated');
        if (run.resolvedSlots[0].kind === 'generated') {
            expect(run.resolvedSlots[0].locationCardInstanceId).toBe('found_berries_i1');
        }
    });

    it('with 2-card deck and many run seeds, slot 0 uses both cards and alternates fairly', () => {
        const deck: LocationCardInstance[] = [
            createLocationCardInstance(FOUND_BERRIES_LOCATION_CARD_ID, 'berries_1'),
            createLocationCardInstance(SURFACE_METAL_DEPOSIT_LOCATION_CARD_ID, 'metal_1'),
        ];

        const missions = new Set<string>();
        const usedInstances = new Set<string>();

        for (let runSeed = 1; runSeed <= 20; runSeed++) {
            const run = startQuestRun({
                questDef: SCAVENGE_THE_PLAINS,
                character: CHARACTER,
                runSeed,
                locationDeck: deck,
            });

            const slot0 = run.resolvedSlots[0];
            expect(slot0).toBeDefined();
            missions.add(slot0.missionId);

            if (slot0.kind === 'generated') {
                usedInstances.add(slot0.locationCardInstanceId ?? '');
            }
        }

        // Both mission ids should appear
        expect(missions).toContain(FOUND_BERRIES_MISSION_ID);
        expect(missions).toContain(SURFACE_METAL_DEPOSIT_MISSION_ID);

        // Both instances should have been used
        expect(usedInstances).toContain('berries_1');
        expect(usedInstances).toContain('metal_1');
    });
});

describe('locationCards.questFlow — repeat rule', () => {
    it('synthetic quest with 3 slots and 2-card deck uses both before repeating', () => {
        const syntheticQuest: QuestDef = {
            id: 'test_quest_location_repeat',
            title: 'Test Location Repeat',
            campaignId: 'world_of_darkness',
            slots: [
                { kind: 'location_encounter' },
                { kind: 'location_encounter' },
                { kind: 'location_encounter' },
            ],
        };

        const deck: LocationCardInstance[] = [
            createLocationCardInstance(FOUND_BERRIES_LOCATION_CARD_ID, 'b1'),
            createLocationCardInstance(SURFACE_METAL_DEPOSIT_LOCATION_CARD_ID, 'm1'),
        ];

        let run = startActiveRun({
            questDef: syntheticQuest,
            character: CHARACTER,
            runSeed: 100,
            locationDeck: deck,
        });

        // First slot should resolve to one of the two
        const slot0Mission = run.resolvedSlots[0]?.missionId;
        expect(
            [FOUND_BERRIES_MISSION_ID, SURFACE_METAL_DEPOSIT_MISSION_ID].includes(slot0Mission!),
        ).toBe(true);

        // Track which instances are used
        const usedInstanceIds: string[] = [];
        if (run.resolvedSlots[0]?.kind === 'generated' && run.resolvedSlots[0]?.locationCardInstanceId) {
            usedInstanceIds.push(run.resolvedSlots[0].locationCardInstanceId);
        }

        // Victory on slot 0
        const step1 = advanceQuestRunOnMissionVictory(run);
        if (step1.kind !== 'continued') throw new Error('Expected continued at slot 0');
        run = step1.run;

        // Second slot should resolve to a different card (or same if seeded)
        const slot1Mission = run.resolvedSlots[1]?.missionId;
        expect(
            [FOUND_BERRIES_MISSION_ID, SURFACE_METAL_DEPOSIT_MISSION_ID].includes(slot1Mission!),
        ).toBe(true);

        if (run.resolvedSlots[1]?.kind === 'generated' && run.resolvedSlots[1]?.locationCardInstanceId) {
            usedInstanceIds.push(run.resolvedSlots[1].locationCardInstanceId);
        }

        // Victory on slot 1
        const step2 = advanceQuestRunOnMissionVictory(run);
        if (step2.kind !== 'continued') throw new Error('Expected continued at slot 1');
        run = step2.run;

        // Third slot: at this point both cards have been used once, so it should pick either
        const slot2Mission = run.resolvedSlots[2]?.missionId;
        expect(
            [FOUND_BERRIES_MISSION_ID, SURFACE_METAL_DEPOSIT_MISSION_ID].includes(slot2Mission!),
        ).toBe(true);

        if (run.resolvedSlots[2]?.kind === 'generated' && run.resolvedSlots[2]?.locationCardInstanceId) {
            usedInstanceIds.push(run.resolvedSlots[2].locationCardInstanceId);
        }

        // Check that both instances were used by slot 2
        const uniqueInstances = new Set(usedInstanceIds);
        expect(uniqueInstances.size).toBeGreaterThanOrEqual(2);
        expect(uniqueInstances).toContain('b1');
        expect(uniqueInstances).toContain('m1');
    });

    it('synthetic quest with 3 slots and 3-card deck uses each exactly once', () => {
        const syntheticQuest: QuestDef = {
            id: 'test_quest_location_three_cards',
            title: 'Test Three Cards',
            campaignId: 'world_of_darkness',
            slots: [
                { kind: 'location_encounter' },
                { kind: 'location_encounter' },
                { kind: 'location_encounter' },
            ],
        };

        const deck: LocationCardInstance[] = [
            createLocationCardInstance(FOUND_BERRIES_LOCATION_CARD_ID, 'b1'),
            createLocationCardInstance(SURFACE_METAL_DEPOSIT_LOCATION_CARD_ID, 'm1'),
            // Third card: we'll use card id 1 with a different instance
            createLocationCardInstance(FOUND_BERRIES_LOCATION_CARD_ID, 'b2'),
        ];

        let run = startActiveRun({
            questDef: syntheticQuest,
            character: CHARACTER,
            runSeed: 101,
            locationDeck: deck,
        });

        const usedInstanceIds: string[] = [];

        // Collect used instances through the run
        for (let i = 0; i < 3; i++) {
            const slot = run.resolvedSlots[i];
            if (slot?.kind === 'generated' && slot?.locationCardInstanceId) {
                usedInstanceIds.push(slot.locationCardInstanceId);
            }

            if (i < 2) {
                const step = advanceQuestRunOnMissionVictory(run);
                if (step.kind !== 'continued') throw new Error(`Expected continued at slot ${i}`);
                run = step.run;
            }
        }

        // All three instances should have been used
        expect(usedInstanceIds).toHaveLength(3);
        expect(new Set(usedInstanceIds)).toEqual(new Set(['b1', 'm1', 'b2']));
    });
});

describe('locationCards.questFlow — multiplayer stamping', () => {
    it('joiner adopts starter\'s resolved slots from lobby stamp', () => {
        const deck = [
            createLocationCardInstance(FOUND_BERRIES_LOCATION_CARD_ID, 'berries_deck'),
            createLocationCardInstance(SURFACE_METAL_DEPOSIT_LOCATION_CARD_ID, 'metal_deck'),
        ];

        const starterRun = startQuestRun({
            questDef: SCAVENGE_THE_PLAINS,
            character: CHARACTER,
            runSeed: 50,
            runId: 'shared_location_run',
            locationDeck: deck,
        });

        // Stamp to lobby
        const lobby = questLobbyFieldsFromRun(starterRun);
        expect(lobby.questResolvedSlots).toBeDefined();
        expect(lobby.questResolvedSlots!.length).toBeGreaterThan(0);

        // Joiner has no deck
        const joinerRun = ensureQuestPrepRun({
            existing: null,
            lobby,
            character: { id: 'char_joiner', equipment: [] as const },
        });

        // Joiner gets identical resolved slots
        expect(joinerRun.resolvedSlots).toEqual(starterRun.resolvedSlots);
        expect(joinerRun.resolvedSlots[0].missionId).toBe(starterRun.resolvedSlots[0].missionId);
        if (joinerRun.resolvedSlots[0]?.kind === 'generated' && starterRun.resolvedSlots[0]?.kind === 'generated') {
            expect(joinerRun.resolvedSlots[0].locationCardInstanceId).toBe(
                starterRun.resolvedSlots[0].locationCardInstanceId,
            );
        }
    });
});

describe('locationCards.questFlow — modifications and choice insertion', () => {
    it('resolved ref includes locationCard with modifications', () => {
        const modifiedInstance: LocationCardInstance = {
            instanceId: 'modified_berries',
            location_card_id: FOUND_BERRIES_LOCATION_CARD_ID,
            modifications: [
                {
                    type: 'add_reward',
                    slot: 3,
                    reward_id: 4,
                },
            ],
        };

        const run = startQuestRun({
            questDef: SCAVENGE_THE_PLAINS,
            character: CHARACTER,
            runSeed: 60,
            locationDeck: [modifiedInstance],
        });

        const slot0Ref = run.resolvedSlots[0];
        expect(slot0Ref?.kind).toBe('generated');
        if (slot0Ref?.kind === 'generated') {
            expect(slot0Ref.locationCard).toBeDefined();
            expect(slot0Ref.locationCard?.locationCardId).toBe(FOUND_BERRIES_LOCATION_CARD_ID);
            expect(slot0Ref.locationCard?.instanceId).toBe('modified_berries');
            expect(slot0Ref.locationCard?.modifications).toEqual([
                { type: 'add_reward', slot: 3, reward_id: 4 },
            ]);
        }
    });

    it('applyLocationModificationsToOptions with real Found Berries options: slot 3 appends healing poultice (4 options total)', () => {
        // Extract real options from FOUND_BERRIES mission definition
        const storyDef = FOUND_BERRIES.postMissionStory;
        const choicePhrase = storyDef.phrases.find(
            (p): p is ChoicePhrase => p.type === 'choice' && p.choiceId === FOUND_BERRIES_CHOICE_ID,
        );
        expect(choicePhrase).toBeDefined();
        if (!choicePhrase) return;

        const originalOptions = choicePhrase.options;
        expect(originalOptions.length).toBe(3); // eat_berries, keep_berries, search_for_loose_metals

        // Apply modification at slot 3 (beyond the 3 original options, so appends)
        const modifications = [
            {
                type: 'add_reward' as const,
                slot: 3,
                reward_id: 4,
            },
        ];

        const result = applyLocationModificationsToOptions(originalOptions, modifications);

        expect(result).toHaveLength(4);
        expect(result[0]).toBe(originalOptions[0]); // eat_berries untouched
        expect(result[1]).toBe(originalOptions[1]); // keep_berries untouched
        expect(result[2]).toBe(originalOptions[2]); // search_for_loose_metals untouched
        expect(result[3].id).toBe('location_healing_poultice');
        expect(result[3].action.type).toBe('heal_wounds');
        if (result[3].action.type === 'heal_wounds') {
            expect(result[3].action.amount).toBe(5);
        }
    });

    it('modification at slot 1 replaces keep_berries and keeps length 3', () => {
        const storyDef = FOUND_BERRIES.postMissionStory;
        const choicePhrase = storyDef.phrases.find(
            (p): p is ChoicePhrase => p.type === 'choice' && p.choiceId === FOUND_BERRIES_CHOICE_ID,
        );
        expect(choicePhrase).toBeDefined();
        if (!choicePhrase) return;

        const originalOptions = choicePhrase.options;
        expect(originalOptions.length).toBe(3);
        expect(originalOptions[1].id).toBe('keep_berries');

        const modifications = [
            {
                type: 'add_reward' as const,
                slot: 1,
                reward_id: 4,
            },
        ];

        const result = applyLocationModificationsToOptions(originalOptions, modifications);

        expect(result).toHaveLength(3); // length unchanged
        expect(result[0]).toBe(originalOptions[0]); // eat_berries untouched
        expect(result[1].id).toBe('location_healing_poultice'); // replaced keep_berries
        expect(result[2]).toBe(originalOptions[2]); // search_for_loose_metals untouched
    });

    it('end-to-end: starter with modified card, joiner sees same modifications and options', () => {
        const modifiedInstance: LocationCardInstance = {
            instanceId: 'modified_berries_e2e',
            location_card_id: FOUND_BERRIES_LOCATION_CARD_ID,
            modifications: [
                {
                    type: 'add_reward',
                    slot: 3,
                    reward_id: 4,
                },
            ],
        };

        const starterRun = startQuestRun({
            questDef: SCAVENGE_THE_PLAINS,
            character: CHARACTER,
            runSeed: 70,
            runId: 'shared_modified_run',
            locationDeck: [modifiedInstance],
        });

        // Starter's slot 0 should be Found Berries
        expect(starterRun.resolvedSlots[0]?.missionId).toBe(FOUND_BERRIES_MISSION_ID);
        expect(starterRun.resolvedSlots[0]?.kind).toBe('generated');
        if (starterRun.resolvedSlots[0]?.kind === 'generated') {
            expect(starterRun.resolvedSlots[0].locationCard?.modifications).toEqual([
                { type: 'add_reward', slot: 3, reward_id: 4 },
            ]);
        }

        // Stamp to lobby
        const lobby = questLobbyFieldsFromRun(starterRun);
        expect(lobby.questResolvedSlots).toBeDefined();
        const lobbySlot0 = lobby.questResolvedSlots![0];
        expect(lobbySlot0.kind).toBe('generated');
        if (lobbySlot0.kind === 'generated') {
            expect(lobbySlot0.locationCard?.modifications).toEqual([
                { type: 'add_reward', slot: 3, reward_id: 4 },
            ]);
        }

        // Joiner with no deck
        const joinerRun = ensureQuestPrepRun({
            existing: null,
            lobby,
            character: { id: 'char_joiner_e2e', equipment: [] as const },
        });

        // Joiner sees identical resolved slots with same modifications
        expect(joinerRun.resolvedSlots[0].missionId).toBe(FOUND_BERRIES_MISSION_ID);
        expect(joinerRun.resolvedSlots[0].kind).toBe('generated');
        if (joinerRun.resolvedSlots[0]?.kind === 'generated' && starterRun.resolvedSlots[0]?.kind === 'generated') {
            expect(joinerRun.resolvedSlots[0].locationCard?.modifications).toEqual(
                starterRun.resolvedSlots[0].locationCard?.modifications,
            );
        }

        // Verify that applying the modifications to Found Berries options yields the poultice
        const storyDef = FOUND_BERRIES.postMissionStory;
        const choicePhrase = storyDef.phrases.find(
            (p): p is ChoicePhrase => p.type === 'choice' && p.choiceId === FOUND_BERRIES_CHOICE_ID,
        );
        if (choicePhrase) {
            const joinerSlot0 = joinerRun.resolvedSlots[0];
            const modifications = joinerSlot0?.kind === 'generated' ? joinerSlot0.locationCard?.modifications : undefined;
            const modifiedOptions = applyLocationModificationsToOptions(choicePhrase.options, modifications);
            expect(modifiedOptions).toHaveLength(4);
            expect(modifiedOptions[3].id).toBe('location_healing_poultice');
        }
    });
});

describe('locationCards.questFlow — heal wounds hunger loss reduction', () => {
    it('applyHealWoundsToHungerLoss(7, 5) returns 2', () => {
        expect(applyHealWoundsToHungerLoss(7, 5)).toBe(2);
    });

    it('applyHealWoundsToHungerLoss(3, 5) returns 0 (cannot go negative)', () => {
        expect(applyHealWoundsToHungerLoss(3, 5)).toBe(0);
    });
});
