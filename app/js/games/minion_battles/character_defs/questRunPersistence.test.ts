import { describe, expect, it } from 'vitest';
import { fromCampaignCharacterData } from './CampaignCharacter';
import type { CampaignCharacterData } from './campaignCharacterTypes';
import type { QuestResult, QuestRunState } from '../storylines/questTypes';
import { SWARMLING_SOURCE } from '../storylines/WorldOfDarkness/quests/swarmling_source';
import { CRYSTAL_CORRUPTION_QUEST_ID } from '../storylines/WorldOfDarkness/quests/crystal_corruption';
import { QUEST_PUSH_NORTH_MISSION_ID } from '../storylines/WorldOfDarkness/questMissions/quest_push_north';

const CAMPAIGN_ID = SWARMLING_SOURCE.campaignId;

const SAMPLE_RUN_SEED = 42;
const SAMPLE_CURRENT_SLOT_INDEX = 1;
const SAMPLE_ASSIGNED_BANK_ID = 'bank_south_gate';

const SAMPLE_RESOLVED_SLOTS = [
    { kind: 'fixed' as const, missionId: QUEST_PUSH_NORTH_MISSION_ID },
    { kind: 'fixed' as const, missionId: 'found_berries' },
    { kind: 'fixed' as const, missionId: 'light_empowered' },
];

const SAMPLE_RUN: QuestRunState = {
    runId: 'run_test_1',
    questDefId: SWARMLING_SOURCE.id,
    runSeed: SAMPLE_RUN_SEED,
    status: 'active',
    currentSlotIndex: SAMPLE_CURRENT_SLOT_INDEX,
    resolvedSlots: SAMPLE_RESOLVED_SLOTS,
    questCharacter: {
        sourceCharacterId: 'char_test',
        equipment: ['004', '001'],
        selectedAbilityIds: ['throw_rock', '0804'],
        campaignRewards: [
            {
                source: 'draft_pick',
                resourceDelta: { attunement: 2 },
                unlockItemIds: ['item_sword_of_dreams'],
            },
        ],
    },
    assignedBankId: SAMPLE_ASSIGNED_BANK_ID,
    partyRoster: [{ playerName: 'Tester', characterId: 'char_test' }],
};

const SAMPLE_RUN_B: QuestRunState = {
    ...SAMPLE_RUN,
    runId: 'run_test_2',
    questDefId: CRYSTAL_CORRUPTION_QUEST_ID,
    status: 'prep',
    currentSlotIndex: 0,
};

const SAMPLE_VICTORY: QuestResult = {
    questDefId: SWARMLING_SOURCE.id,
    result: 'victory',
    timestamp: 1_700_000_000,
    resourceDelta: { attunement: 2 },
    unlockItemIds: ['item_sword_of_dreams'],
    placement: 'bank',
    bankId: 'bank_south_gate',
    campaignRewardsApplied: true,
};

function baseCharacterData(
    overrides: Partial<CampaignCharacterData> = {},
): CampaignCharacterData {
    return {
        id: 'char_test',
        equipment: ['004'],
        knowledge: {},
        traits: [],
        portraitId: 'portrait_a',
        battleChipDetails: {},
        campaignId: CAMPAIGN_ID,
        missionId: SAMPLE_RESOLVED_SLOTS[0]!.missionId,
        ...overrides,
    };
}

/** Fixture input that still uses the pre-v6 singular field (normalized like PHP migration). */
type LegacySingularFixture = CampaignCharacterData & { activeQuestRun?: QuestRunState | null };

describe('quest run / result persistence on Campaign Character', () => {
    it('defaults absent questResults and activeQuestRuns to empty map', () => {
        const character = fromCampaignCharacterData(baseCharacterData());
        expect(character.questResults).toEqual({});
        expect(character.activeQuestRuns).toEqual({});

        const json = character.toJSON();
        expect(json.questResults).toEqual({});
        expect(json.activeQuestRuns).toEqual({});
    });

    it('normalizes legacy singular activeQuestRun fixture into activeQuestRuns', () => {
        const legacy: LegacySingularFixture = {
            ...baseCharacterData(),
            activeQuestRun: SAMPLE_RUN,
        };
        const character = fromCampaignCharacterData(legacy);
        expect(character.activeQuestRuns).toEqual({ [SAMPLE_RUN.runId]: SAMPLE_RUN });
        expect(character.toJSON().activeQuestRuns).toEqual({ [SAMPLE_RUN.runId]: SAMPLE_RUN });
    });

    it('round-trips activeQuestRuns (Quest Character + Campaign Rewards) via toJSON', () => {
        const character = fromCampaignCharacterData(
            baseCharacterData({ activeQuestRuns: { [SAMPLE_RUN.runId]: SAMPLE_RUN } }),
        );
        expect(character.activeQuestRuns[SAMPLE_RUN.runId]).toEqual(SAMPLE_RUN);
        expect(character.activeQuestRuns[SAMPLE_RUN.runId]?.questCharacter.campaignRewards?.[0]?.source).toBe(
            'draft_pick',
        );

        const reloaded = fromCampaignCharacterData(character.toJSON());
        expect(reloaded.activeQuestRuns[SAMPLE_RUN.runId]).toEqual(SAMPLE_RUN);
        expect(reloaded.activeQuestRuns[SAMPLE_RUN.runId]?.questCharacter.equipment).toEqual(['004', '001']);
        expect(reloaded.activeQuestRuns[SAMPLE_RUN.runId]?.questCharacter.selectedAbilityIds).toEqual([
            'throw_rock',
            '0804',
        ]);
        expect(reloaded.activeQuestRuns[SAMPLE_RUN.runId]?.questCharacter.sourceCharacterId).toBe('char_test');
        expect(reloaded.activeQuestRuns[SAMPLE_RUN.runId]?.partyRoster).toEqual([
            { playerName: 'Tester', characterId: 'char_test' },
        ]);
    });

    it('round-trips two concurrent prep/active runs', () => {
        const runs = {
            [SAMPLE_RUN.runId]: SAMPLE_RUN,
            [SAMPLE_RUN_B.runId]: SAMPLE_RUN_B,
        };
        const character = fromCampaignCharacterData(baseCharacterData({ activeQuestRuns: runs }));
        const wire = JSON.parse(JSON.stringify(character.toJSON())) as CampaignCharacterData;
        const reloaded = fromCampaignCharacterData(wire);
        expect(reloaded.activeQuestRuns).toEqual(runs);
    });

    it('round-trips a victory QuestResult under questResults[campaignId]', () => {
        const character = fromCampaignCharacterData(
            baseCharacterData({
                questResults: { [CAMPAIGN_ID]: [SAMPLE_VICTORY] },
                activeQuestRuns: {},
            }),
        );
        expect(character.questResults[CAMPAIGN_ID]).toEqual([SAMPLE_VICTORY]);
        expect(character.activeQuestRuns).toEqual({});

        const reloaded = fromCampaignCharacterData(character.toJSON());
        expect(reloaded.questResults[CAMPAIGN_ID]).toEqual([SAMPLE_VICTORY]);
        expect(reloaded.questResults[CAMPAIGN_ID]?.[0]?.result).toBe('victory');
        expect(reloaded.questResults[CAMPAIGN_ID]?.[0]?.placement).toBe('bank');
        expect(reloaded.questResults[CAMPAIGN_ID]?.[0]?.campaignRewardsApplied).toBe(true);
        expect(reloaded.activeQuestRuns).toEqual({});
    });

    it('round-trips run + victory result together (save/load shape)', () => {
        const data: CampaignCharacterData = baseCharacterData({
            activeQuestRuns: { [SAMPLE_RUN.runId]: SAMPLE_RUN },
            questResults: { [CAMPAIGN_ID]: [SAMPLE_VICTORY] },
        });
        const wire = JSON.parse(JSON.stringify(fromCampaignCharacterData(data).toJSON())) as CampaignCharacterData;
        const reloaded = fromCampaignCharacterData(wire);

        expect(reloaded.activeQuestRuns[SAMPLE_RUN.runId]).toEqual(SAMPLE_RUN);
        expect(reloaded.questResults).toEqual({ [CAMPAIGN_ID]: [SAMPLE_VICTORY] });
    });
});
