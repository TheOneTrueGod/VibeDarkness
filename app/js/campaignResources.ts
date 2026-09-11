import type { CampaignResources, MissionResult } from './types';

export const RESET_CAMPAIGN_RESOURCES_LABEL = 'Reset resources';
export const RESET_CAMPAIGN_RESOURCES_CONFIRM =
    'Reset campaign resources to the sum of mission rewards? This removes admin-granted extras.';

export const ZERO_CAMPAIGN_RESOURCES: CampaignResources = {
    food: 0,
    metal: 0,
    population: 0,
    crystals: 0,
    exhaustion: 0,
};

/**
 * Latest `resourceDelta` per missionId (highest timestamp wins), then summed.
 * Matches campaign effective-resource math on the server.
 */
export function sumLatestMissionResourceDeltas(
    results: MissionResult[] | undefined,
): CampaignResources {
    const out: CampaignResources = { ...ZERO_CAMPAIGN_RESOURCES };
    if (!results?.length) return out;

    const latestByMission = new Map<string, MissionResult>();
    for (const result of results) {
        const missionId = result.missionId ?? '';
        if (missionId === '') continue;
        const prev = latestByMission.get(missionId);
        if (!prev || (prev.timestamp ?? 0) <= (result.timestamp ?? 0)) {
            latestByMission.set(missionId, result);
        }
    }
    for (const result of latestByMission.values()) {
        const delta = result.resourceDelta;
        if (!delta) continue;
        out.food += delta.food ?? 0;
        out.metal += delta.metal ?? 0;
        out.population += delta.population ?? 0;
        out.crystals += delta.crystals ?? 0;
        out.exhaustion += delta.exhaustion ?? 0;
    }
    return out;
}

export function campaignResourcesEqual(a: CampaignResources, b: CampaignResources): boolean {
    return (
        a.food === b.food &&
        a.metal === b.metal &&
        a.population === b.population &&
        a.crystals === b.crystals &&
        a.exhaustion === b.exhaustion
    );
}
