/**
 * Dual-sheet quest run domain API (pure functions).
 *
 * Vocabulary:
 * - Campaign Character — persistent template passed into startQuestRun
 * - Quest Character — frozen clone on `run.questCharacter` (Quest Rewards mutate here)
 * - Campaign Rewards — queued on `questCharacter.campaignRewards`; applied only via completeQuestRun
 */

import type { CampaignResourceKey } from '../../../types';
import { resolveQuestSlots } from './questSlotResolve';
import type {
    CampaignReward,
    QuestCharacter,
    QuestDef,
    QuestPartyRosterEntry,
    QuestResult,
    QuestResultPlacement,
    QuestRunState,
} from './questTypes';
import { QUEST_PREP_ABILITY_SLOT_COUNT } from './questPrepLoadout';

/** Minimal Campaign Character shape needed to clone a Quest Character. */
export type CampaignCharacterSheetSource = {
    id: string;
    equipment: readonly string[];
};

export type StartQuestRunParams = {
    questDef: QuestDef;
    /** Campaign Character template — cloned into Quest Character, then frozen for the run. */
    character: CampaignCharacterSheetSource;
    runSeed: number;
    /** Bank id if started from a map bank; null/omit for optional/side. */
    assignedBankId?: string | null;
    /** Optional stable id; generated if omitted. */
    runId?: string;
};

/** Flattened Campaign Rewards + QuestDef.completionRewards for grant helpers to apply. */
export type CampaignRewardsPayload = {
    resourceDelta: Partial<Record<CampaignResourceKey, number>>;
    unlockItemIds: string[];
    knowledgeKeys: string[];
    itemCardIds: string[];
    researchRewardIds: string[];
};

export type CompleteQuestRunOptions = {
    timestamp?: number;
    placement?: QuestResultPlacement;
    bankId?: string;
};

export type CompleteQuestRunResult = {
    run: QuestRunState;
    result: QuestResult;
    /** Apply once via existing campaign/character grant paths (not applied here). */
    campaignRewardsToApply: CampaignRewardsPayload;
};

export type AdvanceQuestVictoryResult =
    | { kind: 'continued'; run: QuestRunState }
    | { kind: 'finale'; run: QuestRunState };

function assertActiveRun(run: QuestRunState, action: string): void {
    if (run.status !== 'active') {
        throw new Error(`Cannot ${action}: quest run status is "${run.status}" (expected "active")`);
    }
}

function mergeResourceDelta(
    into: Partial<Record<CampaignResourceKey, number>>,
    delta: Partial<Record<CampaignResourceKey, number>> | undefined,
): void {
    if (!delta) return;
    for (const [key, value] of Object.entries(delta)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        const k = key as CampaignResourceKey;
        into[k] = (into[k] ?? 0) + value;
    }
}

function pushUnique(target: string[], ids: string[] | undefined): void {
    if (!ids) return;
    for (const id of ids) {
        if (!id || target.includes(id)) continue;
        target.push(id);
    }
}

/** Clone Campaign Character loadout into a fresh Quest Character (abilities filled at prep finalize). */
export function cloneQuestCharacterFromCampaign(
    character: CampaignCharacterSheetSource,
): QuestCharacter {
    return {
        sourceCharacterId: character.id,
        equipment: [...character.equipment],
        selectedAbilityIds: [],
        campaignRewards: [],
    };
}

/**
 * Start a quest run in Quest Prep: resolve slots once, clone Campaign Character → Quest Character.
 * Ability picks + equipment snapshot finalize when leaving prep (`finalizeQuestPrepLoadout`).
 * Does not mutate the Campaign Character.
 */
export function startQuestRun(params: StartQuestRunParams): QuestRunState {
    const { questDef, character, runSeed, assignedBankId = null, runId } = params;
    const resolvedSlots = resolveQuestSlots(questDef, { runSeed });
    return {
        runId: runId ?? `quest_run_${questDef.id}_${runSeed}`,
        questDefId: questDef.id,
        runSeed,
        status: 'prep',
        currentSlotIndex: 0,
        resolvedSlots,
        questCharacter: cloneQuestCharacterFromCampaign(character),
        assignedBankId,
    };
}

export type FinalizeQuestPrepLoadoutParams = {
    run: QuestRunState;
    /** Campaign Character equipment at freeze time. */
    equipment: readonly string[];
    /** Primary Quest Prep slot picks (max QUEST_PREP_ABILITY_SLOT_COUNT). */
    selectedAbilityIds: readonly string[];
    partyRoster: readonly QuestPartyRosterEntry[];
};

/**
 * Leave Quest Prep: freeze equipment + primary ability picks, lock party roster, mark run active.
 */
export function finalizeQuestPrepLoadout(params: FinalizeQuestPrepLoadoutParams): QuestRunState {
    const { run, equipment, selectedAbilityIds, partyRoster } = params;
    if (run.status !== 'prep' && run.status !== 'active') {
        throw new Error(
            `Cannot finalize Quest Prep: quest run status is "${run.status}" (expected "prep" or "active")`,
        );
    }
    const primaries = [...selectedAbilityIds].slice(0, QUEST_PREP_ABILITY_SLOT_COUNT);
    return {
        ...run,
        status: 'active',
        partyRoster: partyRoster.map((e) => ({
            playerName: e.playerName,
            characterId: e.characterId,
        })),
        questCharacter: {
            ...run.questCharacter,
            equipment: [...equipment],
            selectedAbilityIds: primaries,
            campaignRewards: run.questCharacter.campaignRewards ?? [],
        },
    };
}

/**
 * Mark run abandoned. No Campaign Character / Campaign Rewards mutation.
 * Bank assignment is external — callers keep `questDefId` occupying the bank slot.
 */
export function abandonQuestRun(run: QuestRunState): QuestRunState {
    return {
        ...run,
        status: 'abandoned',
    };
}

/**
 * Admin debug: jump the run to a resolved slot index.
 * Slots before `slotIndex` are treated as done; slots after remain unstarted.
 * Seeking past slot 0 leaves Quest Prep (`status: 'active'`).
 */
export function seekQuestRunToSlot(run: QuestRunState, slotIndex: number): QuestRunState {
    if (run.status !== 'prep' && run.status !== 'active') {
        throw new Error(
            `Cannot seek quest slot: quest run status is "${run.status}" (expected "prep" or "active")`,
        );
    }
    if (
        !Number.isInteger(slotIndex)
        || slotIndex < 0
        || slotIndex >= run.resolvedSlots.length
    ) {
        throw new Error(
            `Cannot seek quest slot: index ${slotIndex} out of range for run ${run.runId} `
            + `(${run.resolvedSlots.length} slots)`,
        );
    }
    const stayInPrep = slotIndex === 0 && run.status === 'prep';
    return {
        ...run,
        status: stayInPrep ? 'prep' : 'active',
        currentSlotIndex: slotIndex,
    };
}

/**
 * Mission victory: advance to the next resolved slot, or signal finale (same index) for completeQuestRun.
 */
export function advanceQuestRunOnMissionVictory(run: QuestRunState): AdvanceQuestVictoryResult {
    assertActiveRun(run, 'advance on mission victory');
    const nextIndex = run.currentSlotIndex + 1;
    if (nextIndex < run.resolvedSlots.length) {
        return {
            kind: 'continued',
            run: {
                ...run,
                currentSlotIndex: nextIndex,
            },
        };
    }
    return { kind: 'finale', run: { ...run } };
}

/**
 * Mission defeat: keep the run and retry the same `currentSlotIndex` / `resolvedSlots`.
 */
export function stayQuestRunOnMissionDefeat(run: QuestRunState): QuestRunState {
    assertActiveRun(run, 'stay on mission defeat');
    return {
        ...run,
        currentSlotIndex: run.currentSlotIndex,
        resolvedSlots: run.resolvedSlots,
    };
}

/**
 * Queue a Campaign Reward on the Quest Character (applied only when completeQuestRun runs).
 * Quest Rewards that mutate equipment/loadout are out of scope for this helper.
 */
export function queueCampaignReward(
    run: QuestRunState,
    reward: CampaignReward,
): QuestRunState {
    assertActiveRun(run, 'queue Campaign Reward');
    const existing = run.questCharacter.campaignRewards ?? [];
    return {
        ...run,
        questCharacter: {
            ...run.questCharacter,
            campaignRewards: [...existing, reward],
        },
    };
}

/** Flatten QuestDef.completionRewards + queued Campaign Rewards into one apply payload. */
export function buildCampaignRewardsPayload(
    questDef: QuestDef,
    questCharacter: QuestCharacter,
): CampaignRewardsPayload {
    const resourceDelta: Partial<Record<CampaignResourceKey, number>> = {};
    const unlockItemIds: string[] = [];
    const knowledgeKeys: string[] = [];
    const itemCardIds: string[] = [];
    const researchRewardIds: string[] = [];

    const completion = questDef.completionRewards;
    if (completion) {
        mergeResourceDelta(resourceDelta, completion.resourceDelta);
        pushUnique(unlockItemIds, completion.unlockItemIds);
        pushUnique(knowledgeKeys, completion.knowledgeKeys);
    }

    for (const reward of questCharacter.campaignRewards ?? []) {
        mergeResourceDelta(resourceDelta, reward.resourceDelta);
        pushUnique(unlockItemIds, reward.unlockItemIds);
        pushUnique(itemCardIds, reward.itemCardIds);
        pushUnique(researchRewardIds, reward.researchRewardIds);
    }

    return {
        resourceDelta,
        unlockItemIds,
        knowledgeKeys,
        itemCardIds,
        researchRewardIds,
    };
}

/**
 * Quest victory: mark run completed and build QuestResult + Campaign Rewards payload.
 * Does not mutate Campaign Character / account — caller applies `campaignRewardsToApply`.
 */
export function completeQuestRun(
    run: QuestRunState,
    questDef: QuestDef,
    options: CompleteQuestRunOptions = {},
): CompleteQuestRunResult {
    assertActiveRun(run, 'complete quest run');
    if (questDef.id !== run.questDefId) {
        throw new Error(
            `completeQuestRun questDef.id "${questDef.id}" does not match run.questDefId "${run.questDefId}"`,
        );
    }

    const campaignRewardsToApply = buildCampaignRewardsPayload(questDef, run.questCharacter);
    const bankId = options.bankId ?? run.assignedBankId ?? undefined;

    const result: QuestResult = {
        questDefId: run.questDefId,
        result: 'victory',
        ...(options.timestamp !== undefined ? { timestamp: options.timestamp } : {}),
        ...(Object.keys(campaignRewardsToApply.resourceDelta).length > 0
            ? { resourceDelta: { ...campaignRewardsToApply.resourceDelta } }
            : {}),
        ...(campaignRewardsToApply.unlockItemIds.length > 0
            ? { unlockItemIds: [...campaignRewardsToApply.unlockItemIds] }
            : {}),
        ...(campaignRewardsToApply.researchRewardIds.length > 0
            ? { researchRewardIds: [...campaignRewardsToApply.researchRewardIds] }
            : {}),
        ...(options.placement !== undefined ? { placement: options.placement } : {}),
        ...(bankId !== undefined && bankId !== null ? { bankId } : {}),
    };

    return {
        run: {
            ...run,
            status: 'completed',
        },
        result,
        campaignRewardsToApply,
    };
}

/** Current mission for an active run (null if index out of range). */
export function getCurrentResolvedMission(run: QuestRunState): QuestRunState['resolvedSlots'][number] | null {
    return run.resolvedSlots[run.currentSlotIndex] ?? null;
}
