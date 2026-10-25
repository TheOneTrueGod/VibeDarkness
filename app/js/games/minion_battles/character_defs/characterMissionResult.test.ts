import { describe, expect, it } from 'vitest';
import {
    applyHungerCapToExtras,
    buildCharacterMissionResultEntry,
    upsertCharacterMissionResultList,
} from './characterMissionResult';
import type { MissionResult } from '../../../types';

const MISSION_ID = 'dark_awakening';
const OTHER_MISSION_ID = 'towards_the_light';
const VICTORY_TS = 1_789_098_803_069;
const REPLAY_TS = 1_789_098_900_000;
const HUNGER_LOST = 7;

function victory(partial: Partial<MissionResult> = {}): MissionResult {
    return { missionId: MISSION_ID, result: 'victory', timestamp: VICTORY_TS, ...partial };
}

describe('buildCharacterMissionResultEntry', () => {
    it('includes hunger on the resourceDelta used by the mission tooltip', () => {
        expect(
            buildCharacterMissionResultEntry(MISSION_ID, 'victory', REPLAY_TS, {
                resourceDelta: { hunger: -HUNGER_LOST },
            }),
        ).toEqual({
            missionId: MISSION_ID,
            result: 'victory',
            timestamp: REPLAY_TS,
            resourceDelta: { hunger: -HUNGER_LOST },
        });
    });

    it('records the HP the Hunger cost restored, and omits it when nothing was restored', () => {
        expect(
            buildCharacterMissionResultEntry(MISSION_ID, 'victory', REPLAY_TS, { healthRestored: 12 }).healthRestored,
        ).toBe(12);
        expect(
            buildCharacterMissionResultEntry(MISSION_ID, 'victory', REPLAY_TS, { healthRestored: 0 }),
        ).not.toHaveProperty('healthRestored');
    });

    it('omits empty extras so Results stays None when nothing was earned', () => {
        expect(buildCharacterMissionResultEntry(MISSION_ID, 'victory', REPLAY_TS, {})).toEqual({
            missionId: MISSION_ID,
            result: 'victory',
            timestamp: REPLAY_TS,
        });
    });
});

describe('upsertCharacterMissionResultList', () => {
    it('replaces an existing victory and keeps hunger from the replay', () => {
        const next = upsertCharacterMissionResultList(
            [victory(), { missionId: OTHER_MISSION_ID, result: 'victory', timestamp: 1 }],
            MISSION_ID,
            'victory',
            REPLAY_TS,
            { resourceDelta: { hunger: -HUNGER_LOST } },
        );
        expect(next).toEqual([
            { missionId: OTHER_MISSION_ID, result: 'victory', timestamp: 1 },
            {
                missionId: MISSION_ID,
                result: 'victory',
                timestamp: REPLAY_TS,
                resourceDelta: { hunger: -HUNGER_LOST },
            },
        ]);
    });

    it('does not let a defeat overwrite an existing victory', () => {
        const existing = [victory({ resourceDelta: { hunger: -HUNGER_LOST } })];
        expect(upsertCharacterMissionResultList(existing, MISSION_ID, 'defeat', REPLAY_TS)).toBeNull();
    });
});

describe('applyHungerCapToExtras', () => {
    const CAMPAIGN_ID = 'world_of_darkness';
    const MAX_HUNGER = 100;

    it('caps match-end hunger loss so the character cannot go below 0 hunger', () => {
        const capped = applyHungerCapToExtras(
            {
                campaignId: CAMPAIGN_ID,
                missionResults: {
                    [CAMPAIGN_ID]: [
                        {
                            missionId: OTHER_MISSION_ID,
                            result: 'victory',
                            resourceDelta: { hunger: -(MAX_HUNGER - 2) },
                        },
                    ],
                },
                questResults: {},
                researchTrees: {},
                researchNodeLevels: {},
            },
            MISSION_ID,
            { resourceDelta: { vigor: 1, hunger: -20 } },
        );
        expect(capped?.resourceDelta).toEqual({ vigor: 1, hunger: -2 });
    });

    /** A character who has already lost `lost` Hunger in another mission. */
    function hungerLost(lost: number) {
        return {
            campaignId: CAMPAIGN_ID,
            missionResults: {
                [CAMPAIGN_ID]: [
                    {
                        missionId: OTHER_MISSION_ID,
                        result: 'victory' as const,
                        resourceDelta: { hunger: -lost },
                    },
                ],
            },
            questResults: {},
            researchTrees: {},
            researchNodeLevels: {},
        };
    }

    it('applies match loss then recovery in order, clamping at max mid-sequence', () => {
        // Hunger 90. -5 (match) -> 85, recover 20 -> 100 (clamped), -5 -> 95. Net +5.
        const result = applyHungerCapToExtras(hungerLost(10), MISSION_ID, {
            resourceDelta: { hunger: -5 },
            hungerChanges: [20, -5],
        });
        expect(result?.resourceDelta).toEqual({ hunger: 5 });
        expect(result).not.toHaveProperty('hungerChanges');
    });

    it('records a positive net delta when recovery fits under max hunger', () => {
        const result = applyHungerCapToExtras(hungerLost(30), MISSION_ID, {
            hungerChanges: [20],
        });
        expect(result?.resourceDelta).toEqual({ hunger: 20 });
    });

    it('cannot recover above max hunger', () => {
        const result = applyHungerCapToExtras(hungerLost(8), MISSION_ID, {
            hungerChanges: [20],
        });
        expect(result?.resourceDelta).toEqual({ hunger: 8 });
    });

    it('keeps other resources and drops the delta when hunger is unchanged', () => {
        const result = applyHungerCapToExtras(hungerLost(0), MISSION_ID, {
            resourceDelta: { vigor: 2 },
            hungerChanges: [20],
        });
        expect(result?.resourceDelta).toEqual({ vigor: 2 });
    });

    it('a +100 completion recovery refills a character to full hunger (70 -> 100, 0 -> 100)', () => {
        const low = applyHungerCapToExtras(hungerLost(30), MISSION_ID, { hungerChanges: [100] });
        expect(low?.resourceDelta).toEqual({ hunger: 30 });
        const empty = applyHungerCapToExtras(hungerLost(MAX_HUNGER), MISSION_ID, {
            hungerChanges: [100],
        });
        expect(empty?.resourceDelta).toEqual({ hunger: MAX_HUNGER });
    });
});
