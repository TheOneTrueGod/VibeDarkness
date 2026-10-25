import { describe, expect, it } from 'vitest';
import {
    WOD_SWARMLING_SOURCE_BANK,
    WOD_POST_CORE_QUEST_BANK,
    WOD_POST_CORE_QUEST_BANK_2,
} from '../../../storylines/WorldOfDarkness/WorldOfDarkness';
import {
    SWARMLING_SOURCE,
    SWARMLING_SOURCE_DESCRIPTION,
    SWARMLING_SOURCE_QUEST_ID,
    SWARMLING_SOURCE_TITLE,
} from '../../../storylines/WorldOfDarkness/quests/swarmling_source';
import {
    SCAVENGE_THE_PLAINS,
    SCAVENGE_THE_PLAINS_DESCRIPTION,
} from '../../../storylines/WorldOfDarkness/quests/scavenge_the_plains';
import {
    INVESTIGATE_THE_WILDLIFE,
    INVESTIGATE_THE_WILDLIFE_DESCRIPTION,
} from '../../../storylines/WorldOfDarkness/quests/investigate_the_wildlife';
import {
    SCAVENGE_THE_PLAINS_COMPLETION_ATTUNEMENT,
    SCAVENGE_THE_PLAINS_COMPLETION_VIGOR,
    SCAVENGE_THE_PLAINS_COMPLETION_METAL,
    INVESTIGATE_THE_WILDLIFE_COMPLETION_ATTUNEMENT,
    INVESTIGATE_THE_WILDLIFE_COMPLETION_VIGOR,
    INVESTIGATE_THE_WILDLIFE_COMPLETION_METAL,
    SWARMLING_SOURCE_COMPLETION_ATTUNEMENT,
    SWARMLING_SOURCE_COMPLETION_VIGOR,
    SWARMLING_SOURCE_COMPLETION_METAL,
} from '../../../storylines/WorldOfDarkness/questMissions/questMissionConstants';
import {
    bankDisplayLabel,
    MAP_NODE_DISABLED_LABEL,
    QUEST_BANK_PICKER_HOVER_DESCRIPTION,
    questBankHoverDescription,
    questBankUnlockRequirementLabel,
    questCompletionResourceGains,
    questResultPlacementLabel,
    isQuestBankFinished,
    missionMapEdgeStroke,
    MISSION_MAP_COMPLETED_EDGE_COLOR,
    questBankMapNodeKey,
} from './questBankUi';

const BANKS = [WOD_SWARMLING_SOURCE_BANK, WOD_POST_CORE_QUEST_BANK];

describe('questBankHoverDescription', () => {
    it('uses dedicated quest flavor copy when unlocked', () => {
        expect(questBankHoverDescription({
            isLocked: false,
            isDedicated: true,
            unlockRequirementLabel: null,
            questDescription: SWARMLING_SOURCE_DESCRIPTION,
        })).toBe(SWARMLING_SOURCE_DESCRIPTION);
        expect(questBankHoverDescription({
            isLocked: false,
            isDedicated: true,
            unlockRequirementLabel: null,
            questDescription: INVESTIGATE_THE_WILDLIFE_DESCRIPTION,
        })).toBe(INVESTIGATE_THE_WILDLIFE_DESCRIPTION);
        expect(questBankHoverDescription({
            isLocked: false,
            isDedicated: true,
            unlockRequirementLabel: null,
            questDescription: SCAVENGE_THE_PLAINS_DESCRIPTION,
        })).toBe(SCAVENGE_THE_PLAINS_DESCRIPTION);
    });

    it('uses picker copy for multi-quest banks', () => {
        expect(questBankHoverDescription({
            isLocked: false,
            isDedicated: false,
            unlockRequirementLabel: null,
        })).toBe(QUEST_BANK_PICKER_HOVER_DESCRIPTION);
    });

    it('exports the disabled map-node label', () => {
        expect(MAP_NODE_DISABLED_LABEL).toBe('disabled');
    });
});

describe('bankDisplayLabel', () => {
    it('uses the Surface Quests picker title', () => {
        expect(bankDisplayLabel(WOD_POST_CORE_QUEST_BANK)).toBe('Surface Quests');
    });
});

describe('questBankUnlockRequirementLabel', () => {
    it('names the gating mission or prior picker for each Surface Quests picker', () => {
        const banks = [WOD_POST_CORE_QUEST_BANK, WOD_POST_CORE_QUEST_BANK_2];
        expect(questBankUnlockRequirementLabel(WOD_POST_CORE_QUEST_BANK, banks)).toBe('Campsite');
        expect(questBankUnlockRequirementLabel(WOD_POST_CORE_QUEST_BANK_2, banks)).toBe('Campsite');
    });
});

describe('questResultPlacementLabel', () => {
    it('uses the dedicated bank title, not the wire id', () => {
        expect(bankDisplayLabel(WOD_SWARMLING_SOURCE_BANK)).toBe(SWARMLING_SOURCE_TITLE);
        expect(
            questResultPlacementLabel(
                {
                    questDefId: SWARMLING_SOURCE_QUEST_ID,
                    result: 'victory',
                    placement: 'bank',
                    bankId: WOD_SWARMLING_SOURCE_BANK.id,
                },
                BANKS,
            ),
        ).toBe(`bank · ${SWARMLING_SOURCE_TITLE}`);
    });

    it('labels optional placements without a bank name', () => {
        expect(
            questResultPlacementLabel(
                {
                    questDefId: SWARMLING_SOURCE_QUEST_ID,
                    result: 'victory',
                    placement: 'optional',
                },
                BANKS,
            ),
        ).toBe('optional');
    });
});

describe('questCompletionResourceGains', () => {
    it('reads only QuestDef.completionRewards, not inner mission grants', () => {
        expect(questCompletionResourceGains(SCAVENGE_THE_PLAINS)).toEqual([
            { resource: 'vigor', count: SCAVENGE_THE_PLAINS_COMPLETION_VIGOR },
            { resource: 'metal', count: SCAVENGE_THE_PLAINS_COMPLETION_METAL },
            { resource: 'attunement', count: SCAVENGE_THE_PLAINS_COMPLETION_ATTUNEMENT },
        ]);
    });

    it('copies Scavenge the Plains completion vigor, metal, and attunement onto Investigate the Wildlife', () => {
        expect(questCompletionResourceGains(INVESTIGATE_THE_WILDLIFE)).toEqual([
            { resource: 'vigor', count: INVESTIGATE_THE_WILDLIFE_COMPLETION_VIGOR },
            { resource: 'metal', count: INVESTIGATE_THE_WILDLIFE_COMPLETION_METAL },
            { resource: 'attunement', count: INVESTIGATE_THE_WILDLIFE_COMPLETION_ATTUNEMENT },
        ]);
        expect(INVESTIGATE_THE_WILDLIFE_COMPLETION_VIGOR).toBe(SCAVENGE_THE_PLAINS_COMPLETION_VIGOR);
        expect(INVESTIGATE_THE_WILDLIFE_COMPLETION_METAL).toBe(SCAVENGE_THE_PLAINS_COMPLETION_METAL);
        expect(INVESTIGATE_THE_WILDLIFE_COMPLETION_ATTUNEMENT).toBe(SCAVENGE_THE_PLAINS_COMPLETION_ATTUNEMENT);
    });

    it('reads Swarmling Source completion vigor, metal, and attunement', () => {
        expect(questCompletionResourceGains(SWARMLING_SOURCE)).toEqual([
            { resource: 'vigor', count: SWARMLING_SOURCE_COMPLETION_VIGOR },
            { resource: 'metal', count: SWARMLING_SOURCE_COMPLETION_METAL },
            { resource: 'attunement', count: SWARMLING_SOURCE_COMPLETION_ATTUNEMENT },
        ]);
    });
});

describe('mission map completion styling', () => {
    it('draws an edge green only when both ends are complete', () => {
        const base = { stroke: '#374151', strokeWidth: 3 };
        expect(missionMapEdgeStroke(false, base)).toEqual(base);
        expect(missionMapEdgeStroke(true, base).stroke).toBe(MISSION_MAP_COMPLETED_EDGE_COLOR);
        expect(missionMapEdgeStroke(true, { ...base, strokeDasharray: '5 4' }).strokeDasharray).toBeUndefined();
    });

    it('a quest bank with no clears is not finished', () => {
        expect(isQuestBankFinished(WOD_POST_CORE_QUEST_BANK, [])).toBe(false);
        expect(isQuestBankFinished(WOD_SWARMLING_SOURCE_BANK, [])).toBe(false);
    });

    it('quest bank map keys are namespaced', () => {
        expect(questBankMapNodeKey('abc')).toBe('questBank:abc');
    });
});
