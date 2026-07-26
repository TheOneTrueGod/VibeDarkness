import { describe, expect, it } from 'vitest';
import {
    allEligiblePlayersHaveChoice,
    eligibleStoryRewardPlayerIds,
    sumAlsoGrantToOthersFromParty,
} from './partyStoryGrants';
import type { StoryChoiceOptionRow } from './storyTypes';
import {
    SURFACE_METAL_CHOICE_ID,
    SURFACE_METAL_OPTION_EXTRACT,
    SURFACE_METAL_OPTION_HARVEST,
} from './WorldOfDarkness/questMissions/surface_metal_deposit';
import {
    SURFACE_METAL_EXTRACT_OTHERS_METAL,
    SURFACE_METAL_EXTRACT_SELF_METAL,
    SURFACE_METAL_HARVEST_METAL,
} from './WorldOfDarkness/questMissions/questMissionConstants';

const OPTIONS: StoryChoiceOptionRow[] = [
    {
        id: SURFACE_METAL_OPTION_HARVEST,
        label: 'Harvest',
        action: { type: 'grant_resources', metal: SURFACE_METAL_HARVEST_METAL },
    },
    {
        id: SURFACE_METAL_OPTION_EXTRACT,
        label: 'Extract',
        action: {
            type: 'grant_resources',
            metal: SURFACE_METAL_EXTRACT_SELF_METAL,
            alsoGrantToOthers: { metal: SURFACE_METAL_EXTRACT_OTHERS_METAL },
        },
    },
];

describe('partyStoryGrants', () => {
    it('filters spectators and NPC controllers from eligible ids', () => {
        expect(
            eligibleStoryRewardPlayerIds({
                a: 'char_a',
                b: 'spectator',
                c: 'control_enemy:wolves',
                d: 'char_d',
            }).sort(),
        ).toEqual(['a', 'd']);
    });

    it('waits until every eligible player has a choice', () => {
        const eligible = ['a', 'b'];
        expect(
            allEligiblePlayersHaveChoice(SURFACE_METAL_CHOICE_ID, eligible, {
                a: { [SURFACE_METAL_CHOICE_ID]: SURFACE_METAL_OPTION_HARVEST },
            }),
        ).toBe(false);
        expect(
            allEligiblePlayersHaveChoice(SURFACE_METAL_CHOICE_ID, eligible, {
                a: { [SURFACE_METAL_CHOICE_ID]: SURFACE_METAL_OPTION_HARVEST },
                b: { [SURFACE_METAL_CHOICE_ID]: SURFACE_METAL_OPTION_EXTRACT },
            }),
        ).toBe(true);
    });

    it('sums alsoGrantToOthers from other players who extracted', () => {
        const delta = sumAlsoGrantToOthersFromParty(
            'a',
            SURFACE_METAL_CHOICE_ID,
            OPTIONS,
            ['a', 'b', 'c'],
            {
                a: { [SURFACE_METAL_CHOICE_ID]: SURFACE_METAL_OPTION_HARVEST },
                b: { [SURFACE_METAL_CHOICE_ID]: SURFACE_METAL_OPTION_EXTRACT },
                c: { [SURFACE_METAL_CHOICE_ID]: SURFACE_METAL_OPTION_EXTRACT },
            },
        );
        expect(delta).toEqual({ metal: SURFACE_METAL_EXTRACT_OTHERS_METAL * 2 });
    });
});
