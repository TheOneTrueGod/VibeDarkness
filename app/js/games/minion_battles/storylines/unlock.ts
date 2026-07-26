/**
 * Compute unlocked and completed missions from campaign progress and storyline def.
 * Also: quest slot bank unlock / eligibility / join-fill placement helpers.
 */

import type { StorylineDef } from './types';
import type { MissionResult } from '../../../types';
import { getQuestDef, listQuestsForCampaign } from './questRegistry';
import type {
    QuestDef,
    QuestEligibilityFilters,
    QuestResult,
    QuestResultPlacement,
    QuestSlotBank,
} from './questTypes';

/** One entry per mission id — keeps the newest by optional timestamp (handles legacy duplicate rows). */
export function latestMissionResultsOnly(missionResults: MissionResult[]): MissionResult[] {
    const map = new Map<string, MissionResult>();
    for (const r of missionResults) {
        const existing = map.get(r.missionId);
        if (!existing) {
            map.set(r.missionId, r);
            continue;
        }
        const existingTs = (existing as { timestamp?: number }).timestamp ?? 0;
        const nextTs = (r as { timestamp?: number }).timestamp ?? 0;
        if (nextTs >= existingTs) {
            map.set(r.missionId, r);
        }
    }
    return [...map.values()];
}

/** Mission is completed if it appears in campaign missionResults. */
export function isMissionCompleted(missionId: string, missionResults: MissionResult[]): boolean {
    return latestMissionResultsOnly(missionResults).some((r) => r.missionId === missionId);
}

/** Mission has a victory (non-defeat) result. */
export function hasVictoryResult(missionId: string, missionResults: MissionResult[]): boolean {
    return latestMissionResultsOnly(missionResults).some((r) => r.missionId === missionId && r.result !== 'defeat');
}

/**
 * Return set of mission IDs that are unlocked for this storyline given campaign missionResults.
 * Unlocked = start mission + any toMissionId where fromMissionId has a matching result.
 * Edges with `requiresQuestBankId` also need that bank's requiredClears satisfied (via questResults).
 */
export function getUnlockedMissionIds(
    storyline: StorylineDef,
    missionResults: MissionResult[],
    questResults: QuestResult[] = [],
): Set<string> {
    const unlocked = new Set<string>();
    unlocked.add(storyline.startMissionId);

    const latest = latestMissionResultsOnly(missionResults);
    const edges = storyline.edges ?? [];
    for (const edge of edges) {
        const fromResult = latest.find((r) => r.missionId === edge.fromMissionId && r.result === edge.result);
        if (!fromResult) continue;
        if (edge.requiresQuestBankId) {
            const bank = (storyline.questSlotBanks ?? []).find((b) => b.id === edge.requiresQuestBankId);
            if (!bank || !isQuestBankRequiredClearsSatisfied(bank, questResults)) {
                continue;
            }
        }
        unlocked.add(edge.toMissionId);
    }

    // `cave_respite` was inserted after `light_empowered`; keep `monster` unlocked for campaigns that
    // already had an Alpha Wolf victory, and allow the optional story mission for backfill.
    if (storyline.id === 'world_of_darkness' && hasVictoryResult('monster', missionResults)) {
        unlocked.add('monster');
        unlocked.add('cave_respite');
    }

    return unlocked;
}

/**
 * Return the mission ID that follows `currentMissionId` on a victory edge, or null if there is none
 * (final mission or mission not found in any storyline). Side mission edges are skipped.
 */
export function getNextVictoryMissionId(
    currentMissionId: string,
    storylines: StorylineDef[],
): string | null {
    for (const storyline of storylines) {
        for (const edge of storyline.edges ?? []) {
            if (edge.fromMissionId === currentMissionId && edge.result === 'victory' && !edge.isSideMission) {
                return edge.toMissionId;
            }
        }
    }
    return null;
}

/**
 * Return all side mission IDs available from `currentMissionId` after victory.
 */
export function getSideMissionIds(
    currentMissionId: string,
    storylines: StorylineDef[],
): string[] {
    const ids: string[] = [];
    for (const storyline of storylines) {
        for (const edge of storyline.edges ?? []) {
            if (edge.fromMissionId === currentMissionId && edge.isSideMission) {
                ids.push(edge.toMissionId);
            }
        }
    }
    return ids;
}

/**
 * Return true if `missionId` is only reachable via side mission edges (i.e. it is itself a side mission).
 */
export function isSideMissionId(missionId: string, storylines: StorylineDef[]): boolean {
    for (const storyline of storylines) {
        const edges = storyline.edges ?? [];
        const incomingEdges = edges.filter((e) => e.toMissionId === missionId);
        if (incomingEdges.length > 0 && incomingEdges.every((e) => e.isSideMission)) {
            return true;
        }
    }
    return false;
}

/**
 * Return all mission IDs for this storyline in display order (start first, then each edge's toMissionId).
 * Use this to show every mission in the storyline; pair with getUnlockedMissionIds to show locked state.
 */
export function getAllMissionIdsInOrder(storyline: StorylineDef): string[] {
    const ids: string[] = [storyline.startMissionId];
    const edges = storyline.edges ?? [];
    for (const edge of edges) {
        if (!ids.includes(edge.toMissionId)) {
            ids.push(edge.toMissionId);
        }
    }
    return ids;
}

// --- Quest slot banks -------------------------------------------------------

/** True when the bank has no mission gate, or that mission has a non-defeat result. */
export function isQuestSlotBankUnlocked(
    bank: QuestSlotBank,
    missionResults: MissionResult[],
): boolean {
    if (!bank.unlockAfterMissionId) return true;
    return hasVictoryResult(bank.unlockAfterMissionId, missionResults);
}

/** Unlocked banks on a storyline (order preserved from def). */
export function getUnlockedQuestSlotBanks(
    storyline: StorylineDef,
    missionResults: MissionResult[],
): QuestSlotBank[] {
    return (storyline.questSlotBanks ?? []).filter((b) => isQuestSlotBankUnlocked(b, missionResults));
}

/**
 * Quest matches bank filters: all filter tags present, not excluded, and at least one
 * overlapping regionId when the filter lists regions.
 */
export function questMatchesFilters(
    quest: QuestDef,
    filters: QuestEligibilityFilters,
): boolean {
    if (filters.excludeQuestDefIds?.includes(quest.id)) {
        return false;
    }
    if (filters.tags?.length) {
        const questTags = quest.tags ?? [];
        if (!filters.tags.every((t) => questTags.includes(t))) {
            return false;
        }
    }
    if (filters.regionIds?.length) {
        const questRegions = quest.regionIds ?? [];
        if (!filters.regionIds.some((r) => questRegions.includes(r))) {
            return false;
        }
    }
    return true;
}

/** Victory QuestResults already recorded for this questDefId. */
export function hasQuestVictoryResult(
    questDefId: string,
    questResults: QuestResult[],
): boolean {
    return questResults.some((r) => r.questDefId === questDefId && r.result === 'victory');
}

/**
 * Eligible quests for a bank: campaign match + filters, not yet victory-cleared.
 * Pass `quests` to override registry (tests); default uses QUEST_MAP via listQuestsForCampaign.
 */
export function getEligibleQuestsForBank(
    bank: QuestSlotBank,
    campaignId: string,
    questResults: QuestResult[],
    quests: QuestDef[] = listQuestsForCampaign(campaignId),
): QuestDef[] {
    return quests.filter(
        (q) =>
            q.campaignId === campaignId
            && questMatchesFilters(q, bank.filters)
            && !hasQuestVictoryResult(q.id, questResults),
    );
}

/** Count victory results placed into this bank (join-fill / assigned clears). */
export function countQuestBankClears(
    bank: QuestSlotBank,
    questResults: QuestResult[],
): number {
    return questResults.filter(
        (r) =>
            r.result === 'victory'
            && r.placement === 'bank'
            && r.bankId === bank.id,
    ).length;
}

/** True when bank has at least `requiredClears` victory placements. */
export function isQuestBankRequiredClearsSatisfied(
    bank: QuestSlotBank,
    questResults: QuestResult[],
): boolean {
    return countQuestBankClears(bank, questResults) >= bank.requiredClears;
}

/** True when the bank still has room for another join-fill clear toward requiredClears. */
export function isQuestBankOpenForJoinFill(
    bank: QuestSlotBank,
    questResults: QuestResult[],
): boolean {
    return countQuestBankClears(bank, questResults) < bank.requiredClears;
}

/**
 * Uncleared campaign quests available as the optional/side outlet.
 * May overlap bank-eligible defs — the player can choose bank assign vs optional.
 */
export function getOptionalEligibleQuests(
    campaignId: string,
    questResults: QuestResult[],
    quests: QuestDef[] = listQuestsForCampaign(campaignId),
): QuestDef[] {
    return quests.filter(
        (q) => q.campaignId === campaignId && !hasQuestVictoryResult(q.id, questResults),
    );
}

/** Victory QuestResults for a campaign (newest-first when timestamps exist). */
export function listQuestVictoryResults(questResults: QuestResult[]): QuestResult[] {
    return questResults
        .filter((r) => r.result === 'victory')
        .slice()
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
}

/** Victory results placed into a specific bank (display order). */
export function getQuestBankVictorySlots(
    bank: QuestSlotBank,
    questResults: QuestResult[],
): QuestResult[] {
    return questResults.filter(
        (r) =>
            r.result === 'victory'
            && r.placement === 'bank'
            && r.bankId === bank.id,
    );
}

export type QuestMapPlacement = {
    placement: QuestResultPlacement;
    bankId?: string;
};

/**
 * Join-fill: on a new victory QuestResult, place into the first open bank whose filters
 * accept the quest; otherwise optional/side.
 *
 * - If this questDefId already has a victory in existingResults, keep that placement
 *   (or optional if the prior row had none).
 * - `banks` should typically be unlocked banks only (caller filters via getUnlockedQuestSlotBanks).
 * - Quest def is resolved via QUEST_MAP; pass `quest` to override (tests / unregistered defs).
 */
export function placeQuestResultOnMap(
    result: Pick<QuestResult, 'questDefId' | 'result'>,
    banks: QuestSlotBank[],
    existingResults: QuestResult[],
    quest: QuestDef | undefined = getQuestDef(result.questDefId),
): QuestMapPlacement {
    const priorVictory = existingResults.find(
        (r) => r.questDefId === result.questDefId && r.result === 'victory',
    );
    if (priorVictory) {
        if (priorVictory.placement === 'bank' && priorVictory.bankId) {
            return { placement: 'bank', bankId: priorVictory.bankId };
        }
        return { placement: priorVictory.placement ?? 'optional' };
    }

    if (result.result !== 'victory' || !quest) {
        return { placement: 'optional' };
    }

    for (const bank of banks) {
        if (!questMatchesFilters(quest, bank.filters)) continue;
        if (!isQuestBankOpenForJoinFill(bank, existingResults)) continue;
        return { placement: 'bank', bankId: bank.id };
    }

    return { placement: 'optional' };
}
