import { describe, expect, it } from 'vitest';
import {
    missionIdFromResolvedRef,
    planQuestDefeatRetry,
    planQuestVictoryContinue,
    questLobbyFieldsFromRun,
    questLobbyNamePrefix,
    questRunMatchesLobby,
    questSlotMissionIds,
    questSlotPillStatus,
    readQuestLobbyFields,
    requiredPlayersFromPartyRoster,
} from './questLobby';
import { finalizeQuestPrepLoadout, startQuestRun } from './questRun';
import { FIND_THE_HERD_OF_BOARS } from './WorldOfDarkness/quests/find_the_herd_of_boars';

const CHARACTER = { id: 'char_q', equipment: ['004'] as const };
const RUN_SEED = 42;

function startActiveRun() {
    const prep = startQuestRun({
        questDef: FIND_THE_HERD_OF_BOARS,
        character: CHARACTER,
        runSeed: RUN_SEED,
    });
    return finalizeQuestPrepLoadout({
        run: prep,
        equipment: CHARACTER.equipment,
        selectedAbilityIds: [],
        partyRoster: [{ playerName: 'Q', characterId: CHARACTER.id }],
    });
}

describe('questLobbyFieldsFromRun / readQuestLobbyFields', () => {
    it('stamps lobby fields from the current resolved slot', () => {
        const run = startQuestRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CHARACTER,
            runSeed: RUN_SEED,
        });
        const fields = questLobbyFieldsFromRun(run);
        expect(fields.questDefId).toBe(FIND_THE_HERD_OF_BOARS.id);
        expect(fields.questRunId).toBe(run.runId);
        expect(fields.questSlotIndex).toBe(0);
        expect(fields.questRunSeed).toBe(RUN_SEED);
        expect(fields.selectedMissionId).toBe('dark_awakening');
        expect(missionIdFromResolvedRef(run.resolvedSlots[0])).toBe('dark_awakening');
    });

    it('reads valid lobby payload fields and rejects incomplete ones', () => {
        expect(
            readQuestLobbyFields({
                questDefId: 'find_the_herd_of_boars',
                questRunId: 'run_1',
                questSlotIndex: 1,
                questRunSeed: 9,
            }),
        ).toEqual({
            questDefId: 'find_the_herd_of_boars',
            questRunId: 'run_1',
            questSlotIndex: 1,
            questRunSeed: 9,
        });
        expect(readQuestLobbyFields({ questDefId: 'x' })).toBeNull();
        expect(readQuestLobbyFields(null)).toBeNull();
    });

    it('questRunMatchesLobby requires active run and matching stamp', () => {
        const prep = startQuestRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CHARACTER,
            runSeed: RUN_SEED,
        });
        const lobby = questLobbyFieldsFromRun(prep);
        expect(questRunMatchesLobby(prep, lobby)).toBe(false);
        const run = startActiveRun();
        const activeLobby = questLobbyFieldsFromRun(run);
        expect(questRunMatchesLobby(run, activeLobby)).toBe(true);
        expect(questRunMatchesLobby(run, { ...activeLobby, questSlotIndex: 99 })).toBe(false);
        expect(questRunMatchesLobby({ ...run, status: 'abandoned' }, activeLobby)).toBe(false);
    });

    it('requiredPlayersFromPartyRoster maps roster entries', () => {
        expect(
            requiredPlayersFromPartyRoster([
                { playerName: 'A', characterId: 'c1' },
                { playerName: 'B', characterId: 'c2' },
            ]),
        ).toEqual([
            { playerName: 'A', characterId: 'c1' },
            { playerName: 'B', characterId: 'c2' },
        ]);
        expect(requiredPlayersFromPartyRoster(undefined)).toEqual([]);
    });
});

describe('planQuestVictoryContinue / planQuestDefeatRetry', () => {
    it('victory advances to the next resolved mission id', () => {
        const run = startActiveRun();
        const plan = planQuestVictoryContinue(run, FIND_THE_HERD_OF_BOARS);
        expect(plan.kind).toBe('continued');
        if (plan.kind !== 'continued') return;
        expect(plan.nextMissionId).toBe('towards_the_light');
        expect(plan.lobbyFields.questSlotIndex).toBe(1);
        expect(plan.run.currentSlotIndex).toBe(1);
    });

    it('finale completes the quest on the last slot victory', () => {
        let run = startActiveRun();
        for (let i = 0; i < FIND_THE_HERD_OF_BOARS.slots.length - 1; i++) {
            const step = planQuestVictoryContinue(run, FIND_THE_HERD_OF_BOARS);
            expect(step.kind).toBe('continued');
            if (step.kind !== 'continued') return;
            run = step.run;
        }
        const finale = planQuestVictoryContinue(run, FIND_THE_HERD_OF_BOARS);
        expect(finale.kind).toBe('finale');
        if (finale.kind !== 'finale') return;
        expect(finale.complete.run.status).toBe('completed');
        expect(finale.complete.result.result).toBe('victory');
        expect(finale.complete.result.questDefId).toBe(FIND_THE_HERD_OF_BOARS.id);
    });

    it('defeat retry keeps the same mission id and lobby stamp', () => {
        const run = startActiveRun();
        const continued = planQuestVictoryContinue(run, FIND_THE_HERD_OF_BOARS);
        expect(continued.kind).toBe('continued');
        if (continued.kind !== 'continued') return;
        const retry = planQuestDefeatRetry(continued.run);
        expect(retry.missionId).toBe('towards_the_light');
        expect(retry.lobbyFields.questSlotIndex).toBe(1);
        expect(retry.lobbyFields.questRunId).toBe(continued.run.runId);
    });
});

describe('questSlotMissionIds / questSlotPillStatus / questLobbyNamePrefix', () => {
    it('uses fixed slot mission ids when no active run', () => {
        expect(questSlotMissionIds(FIND_THE_HERD_OF_BOARS, null)).toEqual([
            'dark_awakening',
            'towards_the_light',
            'light_empowered',
        ]);
    });

    it('colors pills by currentSlotIndex (completed / active / upcoming)', () => {
        expect(questSlotPillStatus(0, null)).toBe('upcoming');
        expect(questSlotPillStatus(0, 1)).toBe('completed');
        expect(questSlotPillStatus(1, 1)).toBe('active');
        expect(questSlotPillStatus(2, 1)).toBe('upcoming');
    });

    it('builds the quest lobby name prefix used for teardown matching', () => {
        expect(questLobbyNamePrefix(FIND_THE_HERD_OF_BOARS.title)).toBe(
            'Quest: Find the herd of boars',
        );
    });
});
