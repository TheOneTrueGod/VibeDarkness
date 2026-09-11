import { sumLatestMissionResourceDeltas } from '../../../campaignResources';
import { applyPassiveBonusToBase, computePassiveBonuses } from '../../../researchTrees/passiveBonuses';
import { PassiveStatKey, type ResearchNodeLevels } from '../../../researchTrees/types';
import { EXHAUSTION_RESOURCE_KEY } from '../storylines/matchExhaustion';
import type { QuestResult } from '../storylines/questTypes';
import type { MissionResult } from '../../../types';

/** Base endurance for every campaign character before research. */
export const DEFAULT_CHARACTER_ENDURANCE = 100;

export type CharacterEnduranceSource = {
    campaignId: string;
    missionResults: Record<string, MissionResult[]>;
    questResults: Record<string, QuestResult[]>;
    researchTrees: Record<string, string[]>;
    researchNodeLevels: ResearchNodeLevels;
};

/**
 * Effective endurance: default plus researched {@link PassiveStatKey.Endurance} bonuses.
 */
export function getCharacterEndurance(
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels?: ResearchNodeLevels,
): number {
    const bonuses = computePassiveBonuses(researchTrees, researchNodeLevels);
    return Math.max(
        0,
        applyPassiveBonusToBase(DEFAULT_CHARACTER_ENDURANCE, bonuses[PassiveStatKey.Endurance]),
    );
}

/**
 * Current exhaustion from this character's mission and quest results.
 * Pass `excludeMissionId` when a replay is about to replace that mission's delta.
 */
export function getCharacterExhaustion(
    character: Pick<CharacterEnduranceSource, 'campaignId' | 'missionResults' | 'questResults'>,
    options?: { excludeMissionId?: string },
): number {
    const list = character.missionResults[character.campaignId] ?? [];
    const missionList = options?.excludeMissionId
        ? list.filter((r) => r.missionId !== options.excludeMissionId)
        : list;
    let total = sumLatestMissionResourceDeltas(missionList)[EXHAUSTION_RESOURCE_KEY];
    const quests = character.questResults[character.campaignId] ?? [];
    for (const quest of quests) {
        const n = quest.resourceDelta?.[EXHAUSTION_RESOURCE_KEY];
        if (n != null && n > 0) {
            total += n;
        }
    }
    return total;
}

/** Remaining endurance: character endurance minus accumulated exhaustion. */
export function getRemainingEndurance(endurance: number, exhaustion: number): number {
    if (!Number.isFinite(endurance) || !Number.isFinite(exhaustion)) {
        return 0;
    }
    return Math.max(0, Math.floor(endurance) - Math.floor(exhaustion));
}

export function getCharacterRemainingEndurance(
    character: Pick<CharacterEnduranceSource, 'campaignId' | 'missionResults' | 'questResults'>,
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels?: ResearchNodeLevels,
): number {
    return getRemainingEndurance(
        getCharacterEndurance(researchTrees, researchNodeLevels),
        getCharacterExhaustion(character),
    );
}

/** Grant only what still fits under endurance after existing exhaustion. */
export function clampCharacterMatchExhaustion(
    character: CharacterEnduranceSource,
    missionId: string,
    computed: number,
): number {
    if (!Number.isFinite(computed) || computed <= 0) {
        return 0;
    }
    const endurance = getCharacterEndurance(character.researchTrees, character.researchNodeLevels);
    const current = getCharacterExhaustion(character, { excludeMissionId: missionId });
    const room = Math.max(0, endurance - current);
    return Math.min(Math.floor(computed), room);
}
