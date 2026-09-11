import { describe, expect, it } from 'vitest';
import {
    campaignResourcesEqual,
    sumLatestMissionResourceDeltas,
    ZERO_CAMPAIGN_RESOURCES,
} from './campaignResources';
import type { MissionResult } from './types';

function result(partial: Partial<MissionResult> & Pick<MissionResult, 'missionId'>): MissionResult {
    return { result: 'victory', ...partial };
}

describe('sumLatestMissionResourceDeltas', () => {
    it('returns zeros when there are no mission results', () => {
        expect(sumLatestMissionResourceDeltas(undefined)).toEqual(ZERO_CAMPAIGN_RESOURCES);
        expect(sumLatestMissionResourceDeltas([])).toEqual(ZERO_CAMPAIGN_RESOURCES);
    });

    it('sums resourceDelta across distinct missions', () => {
        expect(
            sumLatestMissionResourceDeltas([
                result({ missionId: 'a', resourceDelta: { food: 2, crystals: 1 } }),
                result({ missionId: 'quest:wildlife', resourceDelta: { food: 3, metal: 5 } }),
            ]),
        ).toEqual({ food: 5, metal: 5, population: 0, crystals: 1, exhaustion: 0 });
    });

    it('keeps only the latest result per missionId', () => {
        expect(
            sumLatestMissionResourceDeltas([
                result({ missionId: 'a', timestamp: 1, resourceDelta: { food: 10 } }),
                result({ missionId: 'a', timestamp: 3, resourceDelta: { food: 1 } }),
                result({ missionId: 'a', timestamp: 2, resourceDelta: { food: 99 } }),
            ]),
        ).toEqual({ food: 1, metal: 0, population: 0, crystals: 0, exhaustion: 0 });
    });
});

describe('campaignResourcesEqual', () => {
    it('compares all campaign resource keys', () => {
        expect(campaignResourcesEqual(ZERO_CAMPAIGN_RESOURCES, { ...ZERO_CAMPAIGN_RESOURCES })).toBe(true);
        expect(
            campaignResourcesEqual(ZERO_CAMPAIGN_RESOURCES, { ...ZERO_CAMPAIGN_RESOURCES, food: 1 }),
        ).toBe(false);
    });
});
