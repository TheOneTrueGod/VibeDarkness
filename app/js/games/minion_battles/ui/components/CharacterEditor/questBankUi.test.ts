import { describe, expect, it } from 'vitest';
import {
    WOD_SWARMLING_SOURCE_BANK,
    WOD_POST_CORE_QUEST_BANK,
} from '../../../storylines/WorldOfDarkness/WorldOfDarkness';
import {
    SWARMLING_SOURCE,
    SWARMLING_SOURCE_QUEST_ID,
    SWARMLING_SOURCE_TITLE,
} from '../../../storylines/WorldOfDarkness/quests/swarmling_source';
import { SCAVENGE_THE_PLAINS } from '../../../storylines/WorldOfDarkness/quests/scavenge_the_plains';
import {
    SCAVENGE_THE_PLAINS_COMPLETION_CRYSTALS,
    SCAVENGE_THE_PLAINS_COMPLETION_FOOD,
    SWARMLING_SOURCE_COMPLETION_CRYSTALS,
    SWARMLING_SOURCE_COMPLETION_METAL,
} from '../../../storylines/WorldOfDarkness/questMissions/questMissionConstants';
import {
    bankDisplayLabel,
    questCompletionResourceGains,
    questResultPlacementLabel,
} from './questBankUi';

const BANKS = [WOD_SWARMLING_SOURCE_BANK, WOD_POST_CORE_QUEST_BANK];

describe('bankDisplayLabel', () => {
    it('uses the Surface Quests picker title', () => {
        expect(bankDisplayLabel(WOD_POST_CORE_QUEST_BANK)).toBe('Surface Quests');
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
            { resource: 'crystals', count: SCAVENGE_THE_PLAINS_COMPLETION_CRYSTALS },
        ]);
    });

    it('reads Swarmling Source completion metal and crystals', () => {
        expect(questCompletionResourceGains(SWARMLING_SOURCE)).toEqual([
            { resource: 'metal', count: SWARMLING_SOURCE_COMPLETION_METAL },
            { resource: 'crystals', count: SWARMLING_SOURCE_COMPLETION_CRYSTALS },
        ]);
    });
});
