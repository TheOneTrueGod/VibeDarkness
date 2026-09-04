import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestRunState } from './questTypes';
import {
    abandonQuestRun,
    advanceQuestRunOnMissionVictory,
    completeQuestRun,
    finalizeQuestPrepLoadout,
    getCurrentResolvedMission,
    queueCampaignReward,
    seekQuestRunToSlot,
    startQuestRun,
    stayQuestRunOnMissionDefeat,
} from './questRun';
import {
    FIND_THE_HERD_OF_BOARS,
    FIND_THE_HERD_OF_BOARS_FINALE_MISSION_ID,
} from './WorldOfDarkness/quests/find_the_herd_of_boars';

const RUN_SEED_A = 42;
const RUN_SEED_B = 99;
const SAMPLE_BANK_ID = 'bank_south_gate';
const SAMPLE_TIMESTAMP = 1_700_000_000;

const CAMPAIGN_CHARACTER = {
    id: 'char_test',
    equipment: ['004', '001'],
};

/** Example quest plus completion Campaign Rewards for completeQuestRun tests. */
const QUEST_WITH_COMPLETION: QuestDef = {
    ...FIND_THE_HERD_OF_BOARS,
    completionRewards: {
        resourceDelta: { food: 3 },
        unlockItemIds: ['item_completion_badge'],
        knowledgeKeys: ['BoarHerdFound'],
    },
};

function startActiveRun(params: Parameters<typeof startQuestRun>[0]): QuestRunState {
    const prep = startQuestRun(params);
    return finalizeQuestPrepLoadout({
        run: prep,
        equipment: params.character.equipment,
        selectedAbilityIds: [],
        partyRoster: [{ playerName: 'Tester', characterId: params.character.id }],
    });
}

describe('seekQuestRunToSlot', () => {
    it('jumps currentSlotIndex and leaves prep when seeking past slot 0', () => {
        const prep = startQuestRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_A,
        });
        const sought = seekQuestRunToSlot(prep, 2);
        expect(sought.currentSlotIndex).toBe(2);
        expect(sought.status).toBe('active');
        expect(sought.resolvedSlots).toEqual(prep.resolvedSlots);
    });

    it('stays in prep when seeking to slot 0 from prep', () => {
        const prep = startQuestRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_A,
        });
        const sought = seekQuestRunToSlot(prep, 0);
        expect(sought.currentSlotIndex).toBe(0);
        expect(sought.status).toBe('prep');
    });

    it('rejects out-of-range and abandoned runs', () => {
        const run = startActiveRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_A,
        });
        expect(() => seekQuestRunToSlot(run, -1)).toThrow(/out of range/);
        expect(() => seekQuestRunToSlot(run, run.resolvedSlots.length)).toThrow(/out of range/);
        expect(() => seekQuestRunToSlot(abandonQuestRun(run), 0)).toThrow(/abandoned/);
    });
});

describe('startQuestRun', () => {
    it('clones Campaign Character into Quest Character in prep and resolves fixed slots', () => {
        const run = startQuestRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_A,
            assignedBankId: SAMPLE_BANK_ID,
            runId: 'run_fixed_1',
        });

        expect(run.status).toBe('prep');
        expect(run.questDefId).toBe(FIND_THE_HERD_OF_BOARS.id);
        expect(run.runSeed).toBe(RUN_SEED_A);
        expect(run.currentSlotIndex).toBe(0);
        expect(run.assignedBankId).toBe(SAMPLE_BANK_ID);
        expect(run.questCharacter.sourceCharacterId).toBe(CAMPAIGN_CHARACTER.id);
        expect(run.questCharacter.equipment).toEqual(CAMPAIGN_CHARACTER.equipment);
        expect(run.questCharacter.equipment).not.toBe(CAMPAIGN_CHARACTER.equipment);
        expect(run.questCharacter.selectedAbilityIds).toEqual([]);
        expect(run.questCharacter.campaignRewards).toEqual([]);
        expect(run.resolvedSlots[0]).toEqual({ kind: 'fixed', missionId: 'quest_boar_herd_north' });
        expect(run.resolvedSlots[1]?.kind).toBe('generated');
        expect(run.resolvedSlots[2]).toEqual({
            kind: 'fixed',
            missionId: FIND_THE_HERD_OF_BOARS_FINALE_MISSION_ID,
        });
        expect(getCurrentResolvedMission(run)?.missionId).toBe('quest_boar_herd_north');
    });

    it('does not mutate the Campaign Character equipment array', () => {
        const equipment = ['004'];
        const character = { id: 'char_a', equipment };
        const run = startQuestRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character,
            runSeed: RUN_SEED_A,
        });
        run.questCharacter.equipment.push('999');
        expect(equipment).toEqual(['004']);
    });
});

describe('mission victory / defeat', () => {
    it('advances slot index on victory and keeps the same resolvedSlots on defeat retry', () => {
        let run = startActiveRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_A,
            runId: 'run_retry',
        });
        const slotsAtStart = run.resolvedSlots;

        const afterFirstVictory = advanceQuestRunOnMissionVictory(run);
        expect(afterFirstVictory.kind).toBe('continued');
        if (afterFirstVictory.kind !== 'continued') return;
        run = afterFirstVictory.run;
        expect(run.currentSlotIndex).toBe(1);
        expect(run.resolvedSlots).toBe(slotsAtStart);

        const afterDefeat = stayQuestRunOnMissionDefeat(run);
        expect(afterDefeat.currentSlotIndex).toBe(1);
        expect(afterDefeat.resolvedSlots).toEqual(slotsAtStart);
        expect(afterDefeat.status).toBe('active');
        expect(getCurrentResolvedMission(afterDefeat)?.missionId).toBe(
            slotsAtStart[1]?.missionId,
        );

        // Retry same mission then win → next slot
        const afterRetryVictory = advanceQuestRunOnMissionVictory(afterDefeat);
        expect(afterRetryVictory.kind).toBe('continued');
        if (afterRetryVictory.kind !== 'continued') return;
        expect(afterRetryVictory.run.currentSlotIndex).toBe(2);
        expect(afterRetryVictory.run.resolvedSlots).toEqual(slotsAtStart);
    });

    it('signals finale on the last slot victory without clearing resolvedSlots', () => {
        let run = startActiveRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_A,
        });
        for (let i = 0; i < FIND_THE_HERD_OF_BOARS.slots.length - 1; i++) {
            const step = advanceQuestRunOnMissionVictory(run);
            expect(step.kind).toBe('continued');
            if (step.kind !== 'continued') return;
            run = step.run;
        }
        const finale = advanceQuestRunOnMissionVictory(run);
        expect(finale.kind).toBe('finale');
        if (finale.kind !== 'finale') return;
        expect(finale.run.currentSlotIndex).toBe(FIND_THE_HERD_OF_BOARS.slots.length - 1);
        expect(finale.run.status).toBe('active');
        expect(finale.run.resolvedSlots.length).toBe(FIND_THE_HERD_OF_BOARS.slots.length);
    });
});

describe('abandonQuestRun', () => {
    it('marks abandoned and leaves Quest Character / Campaign Rewards untouched (no campaign apply)', () => {
        let run = startActiveRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_A,
            assignedBankId: SAMPLE_BANK_ID,
        });
        run = queueCampaignReward(run, {
            source: 'draft_pick',
            resourceDelta: { crystals: 5 },
        });
        const abandoned = abandonQuestRun(run);
        expect(abandoned.status).toBe('abandoned');
        expect(abandoned.assignedBankId).toBe(SAMPLE_BANK_ID);
        expect(abandoned.questCharacter.campaignRewards).toEqual([
            { source: 'draft_pick', resourceDelta: { crystals: 5 } },
        ]);
        // Domain abandon does not produce a victory QuestResult or apply payload.
        expect(abandoned.questCharacter.equipment).toEqual(CAMPAIGN_CHARACTER.equipment);
    });
});

describe('abandon then new run may re-resolve', () => {
    it('new run with a different seed gets a fresh resolve pass (and new runId)', () => {
        const first = startQuestRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_A,
            runId: 'run_a',
        });
        abandonQuestRun(first);

        const second = startQuestRun({
            questDef: FIND_THE_HERD_OF_BOARS,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_B,
            runId: 'run_b',
        });
        expect(second.runId).not.toBe(first.runId);
        expect(second.runSeed).toBe(RUN_SEED_B);
        expect(second.status).toBe('prep');
        expect(second.currentSlotIndex).toBe(0);
        // Fixed slots are seed-independent; random_story may differ by seed.
        expect(second.resolvedSlots[0]).toEqual(first.resolvedSlots[0]);
        expect(second.resolvedSlots[2]).toEqual(first.resolvedSlots[2]);
        expect(second.resolvedSlots).not.toBe(first.resolvedSlots);
        expect(second.resolvedSlots[1]?.kind).toBe('generated');
        expect(first.resolvedSlots[1]?.kind).toBe('generated');
        if (
            second.resolvedSlots[1]?.kind === 'generated'
            && first.resolvedSlots[1]?.kind === 'generated'
        ) {
            expect(second.resolvedSlots[1].seed).not.toBe(first.resolvedSlots[1].seed);
        }
    });
});

describe('completeQuestRun / Campaign Rewards', () => {
    it('does not expose an apply payload until complete; then merges completion + queued Campaign Rewards', () => {
        let run = startActiveRun({
            questDef: QUEST_WITH_COMPLETION,
            character: CAMPAIGN_CHARACTER,
            runSeed: RUN_SEED_A,
            assignedBankId: SAMPLE_BANK_ID,
            runId: 'run_complete',
        });

        // Queued mid-run — still not applied (no campaign mutation API called here).
        run = queueCampaignReward(run, {
            source: 'draft_pick',
            resourceDelta: { crystals: 2 },
            unlockItemIds: ['item_sword_of_dreams'],
            researchRewardIds: ['research_boar_lore'],
        });
        run = queueCampaignReward(run, {
            source: 'story',
            resourceDelta: { crystals: 1, food: 1 },
            itemCardIds: ['card_boar_call'],
        });

        expect(run.questCharacter.campaignRewards?.length).toBe(2);
        expect(run.status).toBe('active');

        // Advance to finale
        for (let i = 0; i < QUEST_WITH_COMPLETION.slots.length - 1; i++) {
            const step = advanceQuestRunOnMissionVictory(run);
            if (step.kind !== 'continued') throw new Error('expected continued');
            run = step.run;
        }
        const finale = advanceQuestRunOnMissionVictory(run);
        expect(finale.kind).toBe('finale');
        if (finale.kind !== 'finale') return;
        run = finale.run;

        const completed = completeQuestRun(run, QUEST_WITH_COMPLETION, {
            timestamp: SAMPLE_TIMESTAMP,
            placement: 'bank',
        });

        expect(completed.run.status).toBe('completed');
        expect(completed.result.result).toBe('victory');
        expect(completed.result.questDefId).toBe(QUEST_WITH_COMPLETION.id);
        expect(completed.result.timestamp).toBe(SAMPLE_TIMESTAMP);
        expect(completed.result.placement).toBe('bank');
        expect(completed.result.bankId).toBe(SAMPLE_BANK_ID);

        // completion food:3 + story food:1; crystals 2+1; unlocks merged
        expect(completed.campaignRewardsToApply.resourceDelta).toEqual({
            food: 4,
            crystals: 3,
        });
        expect(completed.campaignRewardsToApply.unlockItemIds).toEqual([
            'item_completion_badge',
            'item_sword_of_dreams',
        ]);
        expect(completed.campaignRewardsToApply.knowledgeKeys).toEqual(['BoarHerdFound']);
        expect(completed.campaignRewardsToApply.itemCardIds).toEqual(['card_boar_call']);
        expect(completed.campaignRewardsToApply.researchRewardIds).toEqual(['research_boar_lore']);

        expect(completed.result.resourceDelta).toEqual({ food: 4, crystals: 3 });
        expect(completed.result.unlockItemIds).toEqual([
            'item_completion_badge',
            'item_sword_of_dreams',
        ]);
        expect(completed.result.researchRewardIds).toEqual(['research_boar_lore']);
    });

    it('rejects complete when run is abandoned', () => {
        const run = abandonQuestRun(
            startActiveRun({
                questDef: QUEST_WITH_COMPLETION,
                character: CAMPAIGN_CHARACTER,
                runSeed: RUN_SEED_A,
            }),
        );
        expect(() => completeQuestRun(run, QUEST_WITH_COMPLETION)).toThrow(/abandoned/);
    });
});
