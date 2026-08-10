import { describe, expect, it } from 'vitest';
import { fromCampaignCharacterData } from './CampaignCharacter';
import type { CampaignCharacterData } from './campaignCharacterTypes';
import type { QuestResult, QuestRunState } from '../storylines/questTypes';
import { FIND_THE_HERD_OF_BOARS } from '../storylines/WorldOfDarkness/quests/find_the_herd_of_boars';

const CAMPAIGN_ID = FIND_THE_HERD_OF_BOARS.campaignId;

const SAMPLE_RUN_SEED = 42;
const SAMPLE_CURRENT_SLOT_INDEX = 1;
const SAMPLE_ASSIGNED_BANK_ID = 'bank_south_gate';

const SAMPLE_RESOLVED_SLOTS = [
    { kind: 'fixed' as const, missionId: 'quest_boar_herd_north' },
    { kind: 'fixed' as const, missionId: 'found_berries' },
    { kind: 'fixed' as const, missionId: 'light_empowered' },
];

const SAMPLE_RUN: QuestRunState = {
    runId: 'run_test_1',
    questDefId: FIND_THE_HERD_OF_BOARS.id,
    runSeed: SAMPLE_RUN_SEED,
    status: 'active',
    currentSlotIndex: SAMPLE_CURRENT_SLOT_INDEX,
    resolvedSlots: SAMPLE_RESOLVED_SLOTS,
    questCharacter: {
        sourceCharacterId: 'char_test',
        equipment: ['004', '001'],
        selectedAbilityIds: ['throw_rock', '0802'],
        campaignRewards: [
            {
                source: 'draft_pick',
                resourceDelta: { crystals: 2 },
                unlockItemIds: ['item_sword_of_dreams'],
            },
        ],
    },
    assignedBankId: SAMPLE_ASSIGNED_BANK_ID,
    partyRoster: [{ playerName: 'Tester', characterId: 'char_test' }],
};

const SAMPLE_VICTORY: QuestResult = {
    questDefId: FIND_THE_HERD_OF_BOARS.id,
    result: 'victory',
    timestamp: 1_700_000_000,
    resourceDelta: { crystals: 2 },
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

describe('quest run / result persistence on Campaign Character', () => {
    it('defaults absent questResults and activeQuestRun to empty / null', () => {
        const character = fromCampaignCharacterData(baseCharacterData());
        expect(character.questResults).toEqual({});
        expect(character.activeQuestRun).toBeNull();

        const json = character.toJSON();
        expect(json.questResults).toEqual({});
        expect(json.activeQuestRun).toBeNull();
    });

    it('round-trips activeQuestRun (Quest Character + Campaign Rewards) via toJSON', () => {
        const character = fromCampaignCharacterData(
            baseCharacterData({ activeQuestRun: SAMPLE_RUN }),
        );
        expect(character.activeQuestRun).toEqual(SAMPLE_RUN);
        expect(character.activeQuestRun?.questCharacter.campaignRewards?.[0]?.source).toBe(
            'draft_pick',
        );

        const reloaded = fromCampaignCharacterData(character.toJSON());
        expect(reloaded.activeQuestRun).toEqual(SAMPLE_RUN);
        expect(reloaded.activeQuestRun?.questCharacter.equipment).toEqual(['004', '001']);
        expect(reloaded.activeQuestRun?.questCharacter.selectedAbilityIds).toEqual([
            'throw_rock',
            '0802',
        ]);
        expect(reloaded.activeQuestRun?.questCharacter.sourceCharacterId).toBe('char_test');
        expect(reloaded.activeQuestRun?.partyRoster).toEqual([
            { playerName: 'Tester', characterId: 'char_test' },
        ]);
    });

    it('round-trips a victory QuestResult under questResults[campaignId]', () => {
        const character = fromCampaignCharacterData(
            baseCharacterData({
                questResults: { [CAMPAIGN_ID]: [SAMPLE_VICTORY] },
                activeQuestRun: null,
            }),
        );
        expect(character.questResults[CAMPAIGN_ID]).toEqual([SAMPLE_VICTORY]);
        expect(character.activeQuestRun).toBeNull();

        const reloaded = fromCampaignCharacterData(character.toJSON());
        expect(reloaded.questResults[CAMPAIGN_ID]).toEqual([SAMPLE_VICTORY]);
        expect(reloaded.questResults[CAMPAIGN_ID]?.[0]?.result).toBe('victory');
        expect(reloaded.questResults[CAMPAIGN_ID]?.[0]?.placement).toBe('bank');
        expect(reloaded.questResults[CAMPAIGN_ID]?.[0]?.campaignRewardsApplied).toBe(true);
        expect(reloaded.activeQuestRun).toBeNull();
    });

    it('round-trips run + victory result together (save/load shape)', () => {
        const data: CampaignCharacterData = baseCharacterData({
            activeQuestRun: SAMPLE_RUN,
            questResults: { [CAMPAIGN_ID]: [SAMPLE_VICTORY] },
        });
        const wire = JSON.parse(JSON.stringify(fromCampaignCharacterData(data).toJSON())) as CampaignCharacterData;
        const reloaded = fromCampaignCharacterData(wire);

        expect(reloaded.activeQuestRun).toEqual(SAMPLE_RUN);
        expect(reloaded.questResults).toEqual({ [CAMPAIGN_ID]: [SAMPLE_VICTORY] });
    });
});
