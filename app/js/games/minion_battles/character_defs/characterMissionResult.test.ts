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
});
