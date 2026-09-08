import { describe, expect, it } from 'vitest';
import {
    WOD_SWARMLING_SOURCE_BANK,
    WOD_POST_CORE_QUEST_BANK,
} from '../../../storylines/WorldOfDarkness/WorldOfDarkness';
import {
    SWARMLING_SOURCE_QUEST_ID,
    SWARMLING_SOURCE_TITLE,
} from '../../../storylines/WorldOfDarkness/quests/swarmling_source';
import {
    bankDisplayLabel,
    questResultPlacementLabel,
} from './QuestBanksPanel';

const BANKS = [WOD_SWARMLING_SOURCE_BANK, WOD_POST_CORE_QUEST_BANK];

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
