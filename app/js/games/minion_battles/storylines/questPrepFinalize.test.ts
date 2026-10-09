import { describe, expect, it } from 'vitest';
import { startQuestRun, finalizeQuestPrepLoadout } from './questRun';
import {
    buildPartyRosterFromLobby,
    ensureQuestPrepRun,
    freezeQuestPrepForCharacter,
} from './questPrepFinalize';
import { questLobbyFieldsFromRun, requiredPlayersFromPartyRoster } from './questLobby';
import { SWARMLING_SOURCE } from './WorldOfDarkness/quests/swarmling_source';
import { SCAVENGE_THE_PLAINS } from './WorldOfDarkness/quests/scavenge_the_plains';
import { SPECTATOR_ID } from '../state';
import { createLocationCardInstance } from './locationCards';

const CHARACTER = { id: 'char_prep', equipment: ['004', '001'] as const };

describe('finalizeQuestPrepLoadout', () => {
    it('freezes equipment, primaries, party roster and marks active', () => {
        const prep = startQuestRun({
            questDef: SWARMLING_SOURCE,
            character: CHARACTER,
            runSeed: 7,
            runId: 'run_prep_1',
        });
        expect(prep.status).toBe('prep');
        expect(prep.questCharacter.selectedAbilityIds).toEqual([]);

        const frozen = finalizeQuestPrepLoadout({
            run: prep,
            equipment: ['004', '001'],
            selectedAbilityIds: ['throw_charged_rock', '0804'],
            partyRoster: [
                { playerName: 'Alice', characterId: 'char_prep' },
                { playerName: 'Bob', characterId: 'char_bob' },
            ],
        });

        expect(frozen.status).toBe('active');
        expect(frozen.questCharacter.equipment).toEqual(['004', '001']);
        expect(frozen.questCharacter.selectedAbilityIds).toEqual(['throw_charged_rock', '0804']);
        expect(frozen.partyRoster).toEqual([
            { playerName: 'Alice', characterId: 'char_prep' },
            { playerName: 'Bob', characterId: 'char_bob' },
        ]);
        expect(requiredPlayersFromPartyRoster(frozen.partyRoster)).toEqual(frozen.partyRoster);
    });
});

describe('freezeQuestPrepForCharacter / party roster', () => {
    it('joiners can freeze against lobby stamp with matching runId', () => {
        const hostRun = startQuestRun({
            questDef: SWARMLING_SOURCE,
            character: CHARACTER,
            runSeed: 11,
            runId: 'shared_run',
        });
        const lobby = {
            questDefId: hostRun.questDefId,
            questRunId: hostRun.runId,
            questSlotIndex: 0,
            questRunSeed: hostRun.runSeed,
        };
        const joiner = freezeQuestPrepForCharacter({
            existingRun: null,
            lobby,
            character: { id: 'char_joiner', equipment: ['004'] },
            selectedAbilityIds: ['0101'],
            partyRoster: [{ playerName: 'Joiner', characterId: 'char_joiner' }],
        });
        expect(joiner.runId).toBe('shared_run');
        expect(joiner.status).toBe('active');
        expect(joiner.questCharacter.selectedAbilityIds).toEqual(['0101']);
    });

    it('buildPartyRosterFromLobby skips spectators and control enemies', () => {
        const roster = buildPartyRosterFromLobby(
            {
                p1: { id: 'p1', name: 'Alice' } as never,
                p2: { id: 'p2', name: 'Bob' } as never,
                p3: { id: 'p3', name: 'Spec' } as never,
            },
            {
                p1: 'char_a',
                p2: 'control_enemy:wolves',
                p3: SPECTATOR_ID,
            },
        );
        expect(roster).toEqual([{ playerName: 'Alice', characterId: 'char_a' }]);
        expect(requiredPlayersFromPartyRoster(roster)).toEqual(roster);
    });

    it('joiner with questResolvedSlots in lobby adopts starter\'s resolved slots', () => {
        const hostRun = startQuestRun({
            questDef: SWARMLING_SOURCE,
            character: CHARACTER,
            runSeed: 11,
            runId: 'shared_run',
        });
        const lobby = questLobbyFieldsFromRun(hostRun);
        expect(lobby.questResolvedSlots).toBeDefined();
        expect(lobby.questResolvedSlots!.length).toBeGreaterThan(0);

        // Joiner creates a run from the lobby fields
        const joinerRun = ensureQuestPrepRun({
            existing: null,
            lobby,
            character: { id: 'char_joiner', equipment: ['004'] },
        });

        // The joiner's run should have the same resolved slots as the starter
        expect(joinerRun.resolvedSlots).toEqual(hostRun.resolvedSlots);
        expect(joinerRun.resolvedSlots[0].missionId).toBe(hostRun.resolvedSlots[0].missionId);
    });

    it('starter with location deck stamps location_encounter slot to resolved mission', () => {
        // Start with a location deck containing a card instance
        const deck = [createLocationCardInstance(2, 'test_instance_a')]; // Card 2 = surface_metal_deposit
        const starterRun = startQuestRun({
            questDef: SCAVENGE_THE_PLAINS,
            character: CHARACTER,
            runSeed: 99,
            runId: 'location_deck_run',
            locationDeck: deck,
        });

        expect(starterRun.resolvedSlots[0]).toBeDefined();
        // Slot 0 is location_encounter with locationDeck, so it should resolve to a mission from the deck
        expect(starterRun.resolvedSlots[0].missionId).toBe('surface_metal_deposit');

        // Stamp the lobby
        const lobby = questLobbyFieldsFromRun(starterRun);
        expect(lobby.questResolvedSlots).toBeDefined();
        expect(lobby.questResolvedSlots![0].missionId).toBe('surface_metal_deposit');

        // Joiner (empty deck) creates run from lobby stamp and gets the same slot resolution
        const joinerRun = ensureQuestPrepRun({
            existing: null,
            lobby,
            character: { id: 'char_joiner', equipment: ['004'] },
        });
        expect(joinerRun.resolvedSlots[0].missionId).toBe('surface_metal_deposit');
    });
});
