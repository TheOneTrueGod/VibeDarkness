import { describe, expect, it } from 'vitest';
import { DEFAULT_PASSIVE_MULT, applyPassiveBonusToBase } from '../../../researchTrees/passiveBonuses';
import { PassiveStatKey } from '../../../researchTrees/types';
import {
    DEFAULT_CHARACTER_MAX_HUNGER,
    clampCharacterMatchHungerLoss,
    getCharacterHunger,
    getCharacterHungerDelta,
    getCharacterMaxHunger,
    getHungerFraction,
    hungerFromDelta,
    type CharacterHungerSource,
} from './characterHunger';

const CAMPAIGN_ID = 'world_of_darkness';
const MISSION_ID = 'dark_awakening';
const OTHER_MISSION_ID = 'towards_the_light';
const RESEARCH_ADD = 25;

function character(partial: Partial<CharacterHungerSource> = {}): CharacterHungerSource {
    return {
        campaignId: CAMPAIGN_ID,
        missionResults: {},
        questResults: {},
        researchTrees: {},
        researchNodeLevels: {},
        ...partial,
    };
}

describe('getCharacterMaxHunger', () => {
    it('defaults to 100 with no research', () => {
        expect(getCharacterMaxHunger(undefined)).toBe(DEFAULT_CHARACTER_MAX_HUNGER);
        expect(getCharacterMaxHunger({})).toBe(DEFAULT_CHARACTER_MAX_HUNGER);
    });

    it('applies researched max hunger the same way as other passive stats', () => {
        expect(
            applyPassiveBonusToBase(DEFAULT_CHARACTER_MAX_HUNGER, {
                add: RESEARCH_ADD,
                mult: DEFAULT_PASSIVE_MULT,
            }),
        ).toBe(DEFAULT_CHARACTER_MAX_HUNGER + RESEARCH_ADD);
        expect(PassiveStatKey.MaxHunger).toBe('maxHunger');
    });
});

describe('getCharacterHungerDelta', () => {
    it('sums signed hunger from the character campaign mission results', () => {
        expect(
            getCharacterHungerDelta(
                character({
                    missionResults: {
                        [CAMPAIGN_ID]: [
                            { missionId: MISSION_ID, result: 'victory', resourceDelta: { hunger: -12 } },
                            { missionId: OTHER_MISSION_ID, result: 'victory', resourceDelta: { hunger: -8 } },
                        ],
                    },
                }),
            ),
        ).toBe(-20);
    });

    it('uses only the latest result per mission', () => {
        expect(
            getCharacterHungerDelta(
                character({
                    missionResults: {
                        [CAMPAIGN_ID]: [
                            { missionId: MISSION_ID, result: 'victory', timestamp: 1, resourceDelta: { hunger: -30 } },
                            { missionId: MISSION_ID, result: 'victory', timestamp: 2, resourceDelta: { hunger: -5 } },
                        ],
                    },
                }),
            ),
        ).toBe(-5);
    });

    it('can exclude a mission that a replay is about to replace', () => {
        expect(
            getCharacterHungerDelta(
                character({
                    missionResults: {
                        [CAMPAIGN_ID]: [
                            { missionId: MISSION_ID, result: 'victory', resourceDelta: { hunger: -40 } },
                            { missionId: OTHER_MISSION_ID, result: 'victory', resourceDelta: { hunger: -8 } },
                        ],
                    },
                }),
                { excludeMissionId: MISSION_ID },
            ),
        ).toBe(-8);
    });

    it('counts quest losses but ignores quest recoveries', () => {
        expect(
            getCharacterHungerDelta(
                character({
                    questResults: {
                        [CAMPAIGN_ID]: [
                            { questId: 'q1', resourceDelta: { hunger: -6 } },
                            { questId: 'q2', resourceDelta: { hunger: 10 } },
                        ],
                    },
                } as unknown as Partial<CharacterHungerSource>),
            ),
        ).toBe(-6);
    });
});

describe('getCharacterHunger', () => {
    it('is max hunger for a character with no losses', () => {
        expect(getCharacterHunger(character())).toBe(DEFAULT_CHARACTER_MAX_HUNGER);
    });

    it('is max hunger plus the signed delta', () => {
        expect(
            getCharacterHunger(
                character({
                    missionResults: {
                        [CAMPAIGN_ID]: [
                            { missionId: MISSION_ID, result: 'victory', resourceDelta: { hunger: -15 } },
                        ],
                    },
                }),
            ),
        ).toBe(DEFAULT_CHARACTER_MAX_HUNGER - 15);
    });

    it('never drops below 0 or exceeds max', () => {
        expect(hungerFromDelta(100, -250)).toBe(0);
        expect(hungerFromDelta(100, 40)).toBe(100);
    });
});

describe('getHungerFraction', () => {
    it('is hunger over max, clamped to [0, 1]', () => {
        expect(getHungerFraction(15, 100)).toBe(0.15);
        expect(getHungerFraction(150, 100)).toBe(1);
        expect(getHungerFraction(-5, 100)).toBe(0);
        expect(getHungerFraction(5, 0)).toBe(0);
    });
});

describe('clampCharacterMatchHungerLoss', () => {
    it('leaves room under a full hunger bar', () => {
        expect(clampCharacterMatchHungerLoss(character(), MISSION_ID, 12)).toBe(12);
    });

    it('does not take more hunger than the character has left', () => {
        const worn = character({
            missionResults: {
                [CAMPAIGN_ID]: [
                    {
                        missionId: OTHER_MISSION_ID,
                        result: 'victory',
                        resourceDelta: { hunger: -(DEFAULT_CHARACTER_MAX_HUNGER - 3) },
                    },
                ],
            },
        });
        expect(clampCharacterMatchHungerLoss(worn, MISSION_ID, 20)).toBe(3);
    });

    it('ignores non-positive losses', () => {
        expect(clampCharacterMatchHungerLoss(character(), MISSION_ID, 0)).toBe(0);
        expect(clampCharacterMatchHungerLoss(character(), MISSION_ID, -4)).toBe(0);
    });
});
