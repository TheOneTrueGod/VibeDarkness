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
    SCAVENGE_THE_PLAINS_COMPLETION_CRYSTALS,
    SCAVENGE_THE_PLAINS_COMPLETION_FOOD,
    SCAVENGE_THE_PLAINS_COMPLETION_METAL,
    INVESTIGATE_THE_WILDLIFE_COMPLETION_CRYSTALS,
    INVESTIGATE_THE_WILDLIFE_COMPLETION_FOOD,
    INVESTIGATE_THE_WILDLIFE_COMPLETION_METAL,
    SWARMLING_SOURCE_COMPLETION_CRYSTALS,
    SWARMLING_SOURCE_COMPLETION_FOOD,
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
    it('names the first Surface Quests bank for the second picker', () => {
        expect(
            questBankUnlockRequirementLabel(WOD_POST_CORE_QUEST_BANK_2, [
                WOD_POST_CORE_QUEST_BANK,
                WOD_POST_CORE_QUEST_BANK_2,
            ]),
        ).toBe('Surface Quests');
    });

    it('names Core Awakening for the first Surface Quests picker', () => {
        expect(
            questBankUnlockRequirementLabel(WOD_POST_CORE_QUEST_BANK, [WOD_POST_CORE_QUEST_BANK]),
        ).toBe('Core Awakening');
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
            { resource: 'food', count: SCAVENGE_THE_PLAINS_COMPLETION_FOOD },
            { resource: 'metal', count: SCAVENGE_THE_PLAINS_COMPLETION_METAL },
            { resource: 'crystals', count: SCAVENGE_THE_PLAINS_COMPLETION_CRYSTALS },
        ]);
    });

    it('copies Scavenge the Plains completion food, metal, and crystals onto Investigate the Wildlife', () => {
        expect(questCompletionResourceGains(INVESTIGATE_THE_WILDLIFE)).toEqual([
            { resource: 'food', count: INVESTIGATE_THE_WILDLIFE_COMPLETION_FOOD },
            { resource: 'metal', count: INVESTIGATE_THE_WILDLIFE_COMPLETION_METAL },
            { resource: 'crystals', count: INVESTIGATE_THE_WILDLIFE_COMPLETION_CRYSTALS },
        ]);
        expect(INVESTIGATE_THE_WILDLIFE_COMPLETION_FOOD).toBe(SCAVENGE_THE_PLAINS_COMPLETION_FOOD);
        expect(INVESTIGATE_THE_WILDLIFE_COMPLETION_METAL).toBe(SCAVENGE_THE_PLAINS_COMPLETION_METAL);
        expect(INVESTIGATE_THE_WILDLIFE_COMPLETION_CRYSTALS).toBe(SCAVENGE_THE_PLAINS_COMPLETION_CRYSTALS);
    });

    it('reads Swarmling Source completion food, metal, and crystals', () => {
        expect(questCompletionResourceGains(SWARMLING_SOURCE)).toEqual([
            { resource: 'food', count: SWARMLING_SOURCE_COMPLETION_FOOD },
            { resource: 'metal', count: SWARMLING_SOURCE_COMPLETION_METAL },
            { resource: 'crystals', count: SWARMLING_SOURCE_COMPLETION_CRYSTALS },
        ]);
    });
});
