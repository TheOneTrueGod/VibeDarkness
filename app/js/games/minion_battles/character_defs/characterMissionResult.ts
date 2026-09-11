import type { CampaignResourceKey, MissionResearchRewardEntry, MissionResult } from '../../../types';
import { withExhaustionDelta } from '../storylines/matchExhaustion';
import {
    clampCharacterMatchExhaustion,
    type CharacterEnduranceSource,
} from './characterEndurance';

export type CharacterMissionResultExtras = {
    resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
    itemIds?: string[];
    researchRewardIds?: string[];
    researchRewards?: MissionResearchRewardEntry[];
};

export function buildCharacterMissionResultEntry(
    missionId: string,
    result: 'victory' | 'defeat',
    timestamp: number,
    extras?: CharacterMissionResultExtras,
): MissionResult {
    const entry: MissionResult = { missionId, result, timestamp };
    const resourceDelta = extras?.resourceDelta;
    if (resourceDelta && Object.keys(resourceDelta).length > 0) {
        entry.resourceDelta = resourceDelta;
    }
    if (extras?.itemIds && extras.itemIds.length > 0) {
        entry.itemIds = extras.itemIds;
    }
    if (extras?.researchRewardIds && extras.researchRewardIds.length > 0) {
        entry.researchRewardIds = extras.researchRewardIds;
    }
    if (extras?.researchRewards && extras.researchRewards.length > 0) {
        entry.researchRewards = extras.researchRewards;
    }
    return entry;
}

/**
 * Win always replaces; loss is ignored when a victory already exists.
 * Returns null when the list should be left unchanged.
 */
export function upsertCharacterMissionResultList(
    existingList: MissionResult[],
    missionId: string,
    result: 'victory' | 'defeat',
    timestamp: number,
    extras?: CharacterMissionResultExtras,
): MissionResult[] | null {
    const existingEntry = existingList.find((r) => r.missionId === missionId);
    if (existingEntry?.result === 'victory' && result !== 'victory') {
        return null;
    }
    const newEntry = buildCharacterMissionResultEntry(missionId, result, timestamp, extras);
    return [...existingList.filter((r) => r.missionId !== missionId), newEntry];
}

/** Cap match-end exhaustion so it cannot push the character past endurance. */
export function applyEnduranceCapToExtras(
    character: CharacterEnduranceSource,
    missionId: string,
    extras?: CharacterMissionResultExtras,
): CharacterMissionResultExtras | undefined {
    if (!extras) {
        return extras;
    }
    const computed = extras.resourceDelta?.exhaustion ?? 0;
    const capped = clampCharacterMatchExhaustion(character, missionId, computed);
    const rest = extras.resourceDelta ? { ...extras.resourceDelta } : undefined;
    if (rest) {
        delete rest.exhaustion;
    }
    const resourceDelta = withExhaustionDelta(
        rest && Object.keys(rest).length > 0 ? rest : undefined,
        capped,
    );
    return {
        ...extras,
        resourceDelta,
    };
}
