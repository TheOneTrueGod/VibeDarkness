import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_RESOURCE_POPULATION } from './accountKnowledge';
import {
    CAMPAIGN_RESOURCE_DEFS,
    CAMPAIGN_RESOURCE_KEYS,
    CAMPAIGN_RESOURCE_KNOWLEDGE,
    MISSION_BONUS_RESOURCE_KEYS,
    campaignResourcesEqual,
    isCampaignResourceVisible,
    mergeResourceDeltas,
    visibleCampaignResources,
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
                result({ missionId: 'a', resourceDelta: { vigor: 2, attunement: 1 } }),
                result({ missionId: 'quest:wildlife', resourceDelta: { vigor: 3, metal: 5 } }),
            ]),
        ).toEqual({ vigor: 5, metal: 5, population: 0, attunement: 1, hunger: 0 });
    });

    it('keeps only the latest result per missionId', () => {
        expect(
            sumLatestMissionResourceDeltas([
                result({ missionId: 'a', timestamp: 1, resourceDelta: { vigor: 10 } }),
                result({ missionId: 'a', timestamp: 3, resourceDelta: { vigor: 1 } }),
                result({ missionId: 'a', timestamp: 2, resourceDelta: { vigor: 99 } }),
            ]),
        ).toEqual({ vigor: 1, metal: 0, population: 0, attunement: 0, hunger: 0 });
    });
});

describe('mergeResourceDeltas', () => {
    it('returns undefined when every input is empty', () => {
        expect(mergeResourceDeltas(undefined, {})).toBeUndefined();
    });

    it('adds overlapping keys from completion and story grants', () => {
        expect(mergeResourceDeltas({ vigor: 2, attunement: 1 }, { vigor: 3, metal: 4 })).toEqual({
            vigor: 5,
            attunement: 1,
            metal: 4,
        });
    });
});

describe('campaignResourcesEqual', () => {
    it('compares all campaign resource keys', () => {
        expect(campaignResourcesEqual(ZERO_CAMPAIGN_RESOURCES, { ...ZERO_CAMPAIGN_RESOURCES })).toBe(true);
        expect(
            campaignResourcesEqual(ZERO_CAMPAIGN_RESOURCES, { ...ZERO_CAMPAIGN_RESOURCES, vigor: 1 }),
        ).toBe(false);
    });
});

describe('campaign resource visibility', () => {
    const ALL = ['vigor', 'metal', 'population', 'attunement', 'hunger'] as const;

    it('hides population until the account knows Resource: Population', () => {
        expect(visibleCampaignResources(ALL, undefined)).toEqual(['vigor', 'metal', 'attunement', 'hunger']);
        expect(visibleCampaignResources(ALL, {})).toEqual(['vigor', 'metal', 'attunement', 'hunger']);
        expect(visibleCampaignResources(ALL, { [KNOWLEDGE_RESOURCE_POPULATION]: {} })).toEqual([...ALL]);
    });

    it('always shows resources that need no knowledge', () => {
        for (const resource of ALL) {
            if (CAMPAIGN_RESOURCE_KNOWLEDGE[resource] == null) expect(isCampaignResourceVisible(resource, null)).toBe(true);
        }
        expect(isCampaignResourceVisible('population', null)).toBe(false);
    });
});

describe('CAMPAIGN_RESOURCE_DEFS', () => {
    it('has unique keys and a label and colour for each', () => {
        const keys = CAMPAIGN_RESOURCE_DEFS.map((d) => d.key);
        expect(new Set(keys).size).toBe(keys.length);
        expect([...CAMPAIGN_RESOURCE_KEYS]).toEqual(keys);
        for (const d of CAMPAIGN_RESOURCE_DEFS) {
            expect(d.label).not.toBe('');
            expect(d.color).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });

    it('builds ZERO_CAMPAIGN_RESOURCES with exactly the table keys, all zero', () => {
        expect(Object.keys(ZERO_CAMPAIGN_RESOURCES).sort()).toEqual(CAMPAIGN_RESOURCE_DEFS.map((d) => d.key).sort());
        expect(Object.values(ZERO_CAMPAIGN_RESOURCES).every((v) => v === 0)).toBe(true);
    });

    it('keeps vigor, metal and attunement as the mission-bonus resources', () => {
        expect(MISSION_BONUS_RESOURCE_KEYS).toEqual(['vigor', 'metal', 'attunement']);
    });
});
