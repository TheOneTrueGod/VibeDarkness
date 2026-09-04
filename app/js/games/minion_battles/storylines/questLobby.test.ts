import { describe, expect, it } from 'vitest';
import {
    buildQuestContinuationClaimPayload,
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
    advanceQuestRunPastClearedMissions,
    wonMissionIdsFromMissionResults,
} from './questLobby';
import { finalizeQuestPrepLoadout, queueCampaignReward, startQuestRun } from './questRun';
import {
    FIND_THE_HERD_OF_BOARS,
    FIND_THE_HERD_OF_BOARS_FINALE_MISSION_ID,
} from './WorldOfDarkness/quests/find_the_herd_of_boars';

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
        expect(fields.selectedMissionId).toBe('quest_boar_herd_north');
        expect(missionIdFromResolvedRef(run.resolvedSlots[0])).toBe('quest_boar_herd_north');
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

    it('buildQuestContinuationClaimPayload stamps reserved party fields', () => {
        const run = startActiveRun();
        const plan = planQuestVictoryContinue(run, FIND_THE_HERD_OF_BOARS);
        expect(plan.kind).toBe('continued');
        if (plan.kind !== 'continued') return;
        const requiredPlayers = requiredPlayersFromPartyRoster(plan.run.partyRoster);
        const payload = buildQuestContinuationClaimPayload({
            questTitle: FIND_THE_HERD_OF_BOARS.title,
            nextMissionId: plan.nextMissionId,
            lobbyFields: plan.lobbyFields,
            requiredPlayers,
            characterSelections: { '1': CHARACTER.id },
            questAbilityLoadoutsByCharacterId: { [CHARACTER.id]: ['0101'] },
        });
        expect(payload.lobbyName).toContain(questLobbyNamePrefix(FIND_THE_HERD_OF_BOARS.title));
        expect(payload.nextMissionId).toBe(plan.nextMissionId);
        expect(payload.questRunId).toBe(plan.lobbyFields.questRunId);
        expect(payload.questSlotIndex).toBe(1);
        expect(payload.requiredPlayers).toEqual(requiredPlayers);
        expect(payload.characterSelections).toEqual({ '1': CHARACTER.id });
        expect(payload.questAbilityLoadoutsByCharacterId?.[CHARACTER.id]).toEqual(['0101']);
        expect(() =>
            buildQuestContinuationClaimPayload({
                questTitle: 'x',
                nextMissionId: 'm',
                lobbyFields: plan.lobbyFields,
                requiredPlayers: [],
            }),
        ).toThrow(/requiredPlayers/);
    });
});

describe('planQuestVictoryContinue / planQuestDefeatRetry', () => {
    it('victory advances to the next resolved mission id', () => {
        const run = startActiveRun();
        const plan = planQuestVictoryContinue(run, FIND_THE_HERD_OF_BOARS);
        expect(plan.kind).toBe('continued');
        if (plan.kind !== 'continued') return;
        expect(plan.nextMissionId).toBe(run.resolvedSlots[1]!.missionId);
        expect(plan.lobbyFields.questSlotIndex).toBe(1);
        expect(plan.run.currentSlotIndex).toBe(1);
    });

    it('queued story Campaign Rewards survive the slot advance used for Continue', () => {
        // Victory flow must queue rewards before advancing in one character write; stomping the
        // pre-advance run is what made quest-page Continue reopen mission 1.
        const run = startActiveRun();
        const withReward = queueCampaignReward(run, {
            source: 'story',
            resourceDelta: { food: 2 },
        });
        const plan = planQuestVictoryContinue(withReward, FIND_THE_HERD_OF_BOARS);
        expect(plan.kind).toBe('continued');
        if (plan.kind !== 'continued') return;
        expect(plan.run.currentSlotIndex).toBe(1);
        expect(plan.run.questCharacter.campaignRewards).toEqual([
            { source: 'story', resourceDelta: { food: 2 } },
        ]);
        expect(plan.nextMissionId).toBe(run.resolvedSlots[1]!.missionId);
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
        expect(retry.missionId).toBe(continued.nextMissionId);
        expect(retry.lobbyFields.questSlotIndex).toBe(1);
        expect(retry.lobbyFields.questRunId).toBe(continued.run.runId);
    });
});

describe('questSlotMissionIds / questSlotPillStatus / questLobbyNamePrefix', () => {
    it('uses fixed slot mission ids and random_story placeholder when no active run', () => {
        expect(questSlotMissionIds(FIND_THE_HERD_OF_BOARS, null)).toEqual([
            'quest_boar_herd_north',
            'random_story',
            FIND_THE_HERD_OF_BOARS_FINALE_MISSION_ID,
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

describe('advanceQuestRunPastClearedMissions', () => {
    it('advances past a won first slot and stops on the next uncleared mission', () => {
        const run = startActiveRun();
        const won = wonMissionIdsFromMissionResults({
            world_of_darkness: [{ missionId: run.resolvedSlots[0]!.missionId, result: 'victory' }],
        });
        const skipped = advanceQuestRunPastClearedMissions(run, won);
        expect(skipped.currentSlotIndex).toBe(1);
        expect(skipped.resolvedSlots[1]!.missionId).toBe(run.resolvedSlots[1]!.missionId);
        expect(skipped.status).toBe('active');
    });

    it('does not complete the quest when every slot is already won', () => {
        const run = startActiveRun();
        const won = new Set(run.resolvedSlots.map((slot) => slot.missionId));
        const skipped = advanceQuestRunPastClearedMissions(run, won);
        expect(skipped.currentSlotIndex).toBe(run.resolvedSlots.length - 1);
        expect(skipped.status).toBe('active');
    });
});
