import { describe, expect, it } from 'vitest';
import {
    applyEnduranceCapToExtras,
    buildCharacterMissionResultEntry,
    upsertCharacterMissionResultList,
} from './characterMissionResult';
import { DEFAULT_CHARACTER_ENDURANCE } from './characterEndurance';
import type { MissionResult } from '../../../types';

const MISSION_ID = 'dark_awakening';
const OTHER_MISSION_ID = 'towards_the_light';
const VICTORY_TS = 1_789_098_803_069;
const REPLAY_TS = 1_789_098_900_000;
const EXHAUSTION = 7;

function victory(partial: Partial<MissionResult> = {}): MissionResult {
    return { missionId: MISSION_ID, result: 'victory', timestamp: VICTORY_TS, ...partial };
}

describe('buildCharacterMissionResultEntry', () => {
    it('includes exhaustion on the resourceDelta used by the mission tooltip', () => {
        expect(
            buildCharacterMissionResultEntry(MISSION_ID, 'victory', REPLAY_TS, {
                resourceDelta: { exhaustion: EXHAUSTION },
            }),
        ).toEqual({
            missionId: MISSION_ID,
            result: 'victory',
            timestamp: REPLAY_TS,
            resourceDelta: { exhaustion: EXHAUSTION },
        });
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
    it('replaces an existing victory and keeps exhaustion from the replay', () => {
        const next = upsertCharacterMissionResultList(
            [victory(), { missionId: OTHER_MISSION_ID, result: 'victory', timestamp: 1 }],
            MISSION_ID,
            'victory',
            REPLAY_TS,
            { resourceDelta: { exhaustion: EXHAUSTION } },
        );
        expect(next).toEqual([
            { missionId: OTHER_MISSION_ID, result: 'victory', timestamp: 1 },
            {
                missionId: MISSION_ID,
                result: 'victory',
                timestamp: REPLAY_TS,
                resourceDelta: { exhaustion: EXHAUSTION },
            },
        ]);
    });

    it('does not let a defeat overwrite an existing victory', () => {
        const existing = [victory({ resourceDelta: { exhaustion: EXHAUSTION } })];
        expect(upsertCharacterMissionResultList(existing, MISSION_ID, 'defeat', REPLAY_TS)).toBeNull();
    });
});

describe('applyEnduranceCapToExtras', () => {
    const CAMPAIGN_ID = 'world_of_darkness';

    it('caps exhaustion so the character cannot exceed endurance', () => {
        const capped = applyEnduranceCapToExtras(
            {
                campaignId: CAMPAIGN_ID,
                missionResults: {
                    [CAMPAIGN_ID]: [
                        {
                            missionId: OTHER_MISSION_ID,
                            result: 'victory',
                            resourceDelta: { exhaustion: DEFAULT_CHARACTER_ENDURANCE - 2 },
                        },
                    ],
                },
                questResults: {},
                researchTrees: {},
                researchNodeLevels: {},
            },
            MISSION_ID,
            { resourceDelta: { food: 1, exhaustion: 20 } },
        );
        expect(capped?.resourceDelta).toEqual({ food: 1, exhaustion: 2 });
    });

    function withExhaustion(current: number) {
        return {
            campaignId: CAMPAIGN_ID,
            missionResults: {
                [CAMPAIGN_ID]: [
                    {
                        missionId: OTHER_MISSION_ID,
                        result: 'victory' as const,
                        resourceDelta: { exhaustion: current },
                    },
                ],
            },
            questResults: {},
            researchTrees: {},
            researchNodeLevels: {},
        };
    }

    it('applies match exhaustion then recovery in order, clamping at zero mid-sequence', () => {
        // Start 10. +5 (match) -> 15, recover 20 -> 0 (clamped), +5 -> 5. Net -5.
        const result = applyEnduranceCapToExtras(withExhaustion(10), MISSION_ID, {
            resourceDelta: { exhaustion: 5 },
            exhaustionChanges: [-20, 5],
        });
        expect(result?.resourceDelta).toEqual({ exhaustion: -5 });
        expect(result).not.toHaveProperty('exhaustionChanges');
    });

    it('records a negative net delta when recovery exceeds nothing clamped', () => {
        const result = applyEnduranceCapToExtras(withExhaustion(30), MISSION_ID, {
            exhaustionChanges: [-20],
        });
        expect(result?.resourceDelta).toEqual({ exhaustion: -20 });
    });

    it('cannot recover below zero total exhaustion', () => {
        const result = applyEnduranceCapToExtras(withExhaustion(8), MISSION_ID, {
            exhaustionChanges: [-20],
        });
        expect(result?.resourceDelta).toEqual({ exhaustion: -8 });
    });

    it('keeps other resources and drops the delta when exhaustion is unchanged', () => {
        const result = applyEnduranceCapToExtras(withExhaustion(0), MISSION_ID, {
            resourceDelta: { food: 2 },
            exhaustionChanges: [-20],
        });
        expect(result?.resourceDelta).toEqual({ food: 2 });
    });

    it('a -100 completion recovery floors a character at 0 exhaustion (30 -> 0, full endurance -> 0)', () => {
        const low = applyEnduranceCapToExtras(withExhaustion(30), MISSION_ID, { exhaustionChanges: [-100] });
        expect(low?.resourceDelta).toEqual({ exhaustion: -30 });
        const full = applyEnduranceCapToExtras(withExhaustion(DEFAULT_CHARACTER_ENDURANCE), MISSION_ID, {
            exhaustionChanges: [-100],
        });
        expect(full?.resourceDelta).toEqual({ exhaustion: -DEFAULT_CHARACTER_ENDURANCE });
    });
});
