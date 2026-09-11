import { describe, expect, it } from 'vitest';
import { DEFAULT_PASSIVE_MULT, applyPassiveBonusToBase } from '../../../researchTrees/passiveBonuses';
import { PassiveStatKey } from '../../../researchTrees/types';
import {
    DEFAULT_CHARACTER_ENDURANCE,
    clampCharacterMatchExhaustion,
    getCharacterEndurance,
    getCharacterExhaustion,
    getCharacterRemainingEndurance,
    getRemainingEndurance,
    type CharacterEnduranceSource,
} from './characterEndurance';

const CAMPAIGN_ID = 'world_of_darkness';
const MISSION_ID = 'dark_awakening';
const OTHER_MISSION_ID = 'towards_the_light';
const RESEARCH_ADD = 25;

function character(partial: Partial<CharacterEnduranceSource> = {}): CharacterEnduranceSource {
    return {
        campaignId: CAMPAIGN_ID,
        missionResults: {},
        questResults: {},
        researchTrees: {},
        researchNodeLevels: {},
        ...partial,
    };
}

describe('getCharacterEndurance', () => {
    it('defaults to 100 with no research', () => {
        expect(getCharacterEndurance(undefined)).toBe(DEFAULT_CHARACTER_ENDURANCE);
        expect(getCharacterEndurance({})).toBe(DEFAULT_CHARACTER_ENDURANCE);
    });

    it('applies researched endurance the same way as other passive stats', () => {
        expect(
            applyPassiveBonusToBase(DEFAULT_CHARACTER_ENDURANCE, {
                add: RESEARCH_ADD,
                mult: DEFAULT_PASSIVE_MULT,
            }),
        ).toBe(DEFAULT_CHARACTER_ENDURANCE + RESEARCH_ADD);
        expect(PassiveStatKey.Endurance).toBe('endurance');
    });
});

describe('getCharacterExhaustion', () => {
    it('sums exhaustion from the character campaign mission results', () => {
        expect(
            getCharacterExhaustion(
                character({
                    missionResults: {
                        [CAMPAIGN_ID]: [
                            {
                                missionId: MISSION_ID,
                                result: 'victory',
                                resourceDelta: { exhaustion: 12 },
                            },
                            {
                                missionId: OTHER_MISSION_ID,
                                result: 'victory',
                                resourceDelta: { exhaustion: 8 },
                            },
                        ],
                    },
                }),
            ),
        ).toBe(20);
    });

    it('can exclude a mission that a replay is about to replace', () => {
        expect(
            getCharacterExhaustion(
                character({
                    missionResults: {
                        [CAMPAIGN_ID]: [
                            {
                                missionId: MISSION_ID,
                                result: 'victory',
                                resourceDelta: { exhaustion: 40 },
                            },
                            {
                                missionId: OTHER_MISSION_ID,
                                result: 'victory',
                                resourceDelta: { exhaustion: 8 },
                            },
                        ],
                    },
                }),
                { excludeMissionId: MISSION_ID },
            ),
        ).toBe(8);
    });
});

describe('getRemainingEndurance', () => {
    it('is endurance minus accumulated exhaustion, floored at 0', () => {
        expect(getRemainingEndurance(DEFAULT_CHARACTER_ENDURANCE, 12)).toBe(
            DEFAULT_CHARACTER_ENDURANCE - 12,
        );
        expect(getRemainingEndurance(DEFAULT_CHARACTER_ENDURANCE, DEFAULT_CHARACTER_ENDURANCE + 5)).toBe(0);
    });

    it('reads remaining endurance from the character', () => {
        expect(
            getCharacterRemainingEndurance(
                character({
                    missionResults: {
                        [CAMPAIGN_ID]: [
                            {
                                missionId: MISSION_ID,
                                result: 'victory',
                                resourceDelta: { exhaustion: 15 },
                            },
                        ],
                    },
                }),
                {},
            ),
        ).toBe(DEFAULT_CHARACTER_ENDURANCE - 15);
    });
});

describe('clampCharacterMatchExhaustion', () => {
    it('leaves room under the default endurance cap', () => {
        expect(clampCharacterMatchExhaustion(character(), MISSION_ID, 12)).toBe(12);
    });

    it('does not grant more exhaustion than remaining endurance', () => {
        const worn = character({
            missionResults: {
                [CAMPAIGN_ID]: [
                    {
                        missionId: OTHER_MISSION_ID,
                        result: 'victory',
                        resourceDelta: { exhaustion: DEFAULT_CHARACTER_ENDURANCE - 3 },
                    },
                ],
            },
        });
        expect(clampCharacterMatchExhaustion(worn, MISSION_ID, 20)).toBe(3);
    });
});
