import { describe, expect, it } from 'vitest';
import { startQuestRun, finalizeQuestPrepLoadout } from './questRun';
import {
    buildPartyRosterFromLobby,
    freezeQuestPrepForCharacter,
} from './questPrepFinalize';
import { requiredPlayersFromPartyRoster } from './questLobby';
import { FIND_THE_HERD_OF_BOARS } from './WorldOfDarkness/quests/find_the_herd_of_boars';
import { SPECTATOR_ID } from '../state';

const CHARACTER = { id: 'char_prep', equipment: ['004', '001'] as const };

describe('finalizeQuestPrepLoadout', () => {
    it('freezes equipment, primaries, party roster and marks active', () => {
        const prep = startQuestRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CHARACTER,
            runSeed: 7,
            runId: 'run_prep_1',
        });
        expect(prep.status).toBe('prep');
        expect(prep.questCharacter.selectedAbilityIds).toEqual([]);

        const frozen = finalizeQuestPrepLoadout({
            run: prep,
            equipment: ['004', '013'],
            selectedAbilityIds: ['throw_charged_rock', '0802'],
            partyRoster: [
                { playerName: 'Alice', characterId: 'char_prep' },
                { playerName: 'Bob', characterId: 'char_bob' },
            ],
        });

        expect(frozen.status).toBe('active');
        expect(frozen.questCharacter.equipment).toEqual(['004', '013']);
        expect(frozen.questCharacter.selectedAbilityIds).toEqual(['throw_charged_rock', '0802']);
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
            questDef: FIND_THE_HERD_OF_BOARS,
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
});
