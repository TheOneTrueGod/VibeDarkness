import type { CampaignResourceKey, MissionResearchRewardEntry, MissionResult } from '../../../types';
import type { MissionVictoryRecord } from '../storylines/missionVictoryRecord';
import { applyOrderedHungerChanges, withHungerDelta } from '../storylines/matchHunger';
import {
    clampCharacterMatchHungerLoss,
    getCharacterHunger,
    getCharacterMaxHunger,
    type CharacterHungerSource,
} from './characterHunger';

export type CharacterMissionResultExtras = {
    resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
    itemIds?: string[];
    researchRewardIds?: string[];
    researchRewards?: MissionResearchRewardEntry[];
    /**
     * Ordered signed Hunger changes (loss < 0, recovery > 0) applied against the
     * character's current Hunger, each step clamped to [0, max Hunger].
     * When set, replaces `resourceDelta.hunger` with the resulting net delta.
     */
    hungerChanges?: number[];
    /** HP the match-end Hunger cost restored (see `computeVictoryHealthConversion`); omitted when 0. */
    healthRestored?: number;
    /** Victory popover record (victory only); see `missionVictoryRecord.ts`. */
    victory?: MissionVictoryRecord;
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
    if (extras?.healthRestored != null && extras.healthRestored > 0) {
        entry.healthRestored = extras.healthRestored;
    }
    if (result === 'victory' && extras?.victory) {
        entry.victory = extras.victory;
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

/** Cap match-end Hunger loss so it cannot push the character's Hunger below 0. */
export function applyHungerCapToExtras(
    character: CharacterHungerSource,
    missionId: string,
    extras?: CharacterMissionResultExtras,
): CharacterMissionResultExtras | undefined {
    if (!extras) {
        return extras;
    }
    if (extras.hungerChanges && extras.hungerChanges.length > 0) {
        const { hungerChanges, ...rest } = extras;
        const maxHunger = getCharacterMaxHunger(character.researchTrees, character.researchNodeLevels);
        const start = getCharacterHunger(character, { excludeMissionId: missionId });
        const ordered = [extras.resourceDelta?.hunger ?? 0, ...hungerChanges];
        const net = Math.floor(applyOrderedHungerChanges(start, ordered, maxHunger)) - start;
        const others = extras.resourceDelta ? { ...extras.resourceDelta } : {};
        delete others.hunger;
        const resourceDelta = net !== 0 ? { ...others, hunger: net } : others;
        return {
            ...rest,
            resourceDelta: Object.keys(resourceDelta).length > 0 ? resourceDelta : undefined,
        };
    }
    // resourceDelta.hunger is a signed delta; a negative value is the match-end loss to cap.
    const computed = extras.resourceDelta?.hunger ?? 0;
    const cappedLoss = clampCharacterMatchHungerLoss(character, missionId, -computed);
    const rest = extras.resourceDelta ? { ...extras.resourceDelta } : undefined;
    if (rest) {
        delete rest.hunger;
    }
    const resourceDelta = withHungerDelta(
        rest && Object.keys(rest).length > 0 ? rest : undefined,
        computed > 0 ? computed : -cappedLoss,
    );
    return {
        ...extras,
        resourceDelta,
    };
}
