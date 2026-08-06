/**
 * Lobby / continue coordination for an active quest mission chain.
 * Pure helpers — callers persist character run state and stamp lobby game JSON.
 */

import {
    advanceQuestRunOnMissionVictory,
    completeQuestRun,
    type CompleteQuestRunResult,
} from './questRun';
import type {
    QuestDef,
    QuestPartyRosterEntry,
    QuestRunState,
    ResolvedMissionRef,
} from './questTypes';

/** Fields stamped on Minion Battles lobby game JSON for an active quest mission. */
export type QuestLobbyFields = {
    questDefId: string;
    questRunId: string;
    questSlotIndex: number;
    /** Seed used to resolve slots — joiners recreate matching runs during Quest Prep. */
    questRunSeed?: number;
};

/** UI / App options when starting or continuing a quest from Campaign Home. */
export type StartQuestOptions = {
    mode?: 'continue' | 'start';
    /** Bank id when started from a map bank; null/omit for optional/side. */
    assignedBankId?: string | null;
    /**
     * Admin debug: after ensuring a run for this quest, jump to this resolved slot
     * (tear down matching quest lobbies, then open a lobby for that mission).
     */
    adminSeekSlotIndex?: number;
};

/** Lobby title prefix used when creating quest lobbies (`Quest: {title} — {mission}`). */
export function questLobbyNamePrefix(questTitle: string): string {
    return `Quest: ${questTitle}`;
}

/** Mission id labels for quest slot pills (resolved run when present, else slot specs). */
export function questSlotMissionIds(
    quest: QuestDef,
    run: QuestRunState | null | undefined,
): string[] {
    if (
        run
        && run.questDefId === quest.id
        && (run.status === 'prep' || run.status === 'active')
        && run.resolvedSlots.length > 0
    ) {
        return run.resolvedSlots.map((ref) => ref.missionId);
    }
    return quest.slots.map((slot) => {
        if (slot.kind === 'fixed') return slot.missionId;
        if (slot.kind === 'random_story') return 'random_story';
        if (slot.kind === 'random_battle') return 'random_battle';
        return 'unknown';
    });
}

export type QuestSlotPillStatus = 'completed' | 'active' | 'upcoming';

/** Pill color status for admin quest mission skip UI. */
export function questSlotPillStatus(
    slotIndex: number,
    currentSlotIndex: number | null,
): QuestSlotPillStatus {
    if (currentSlotIndex === null) return 'upcoming';
    if (slotIndex < currentSlotIndex) return 'completed';
    if (slotIndex === currentSlotIndex) return 'active';
    return 'upcoming';
}

/** Map frozen party roster → lobby requiredPlayers (identity). */
export function requiredPlayersFromPartyRoster(
    roster: readonly QuestPartyRosterEntry[] | null | undefined,
): Array<{ playerName: string; characterId: string }> {
    if (!roster?.length) return [];
    return roster.map((e) => ({
        playerName: e.playerName,
        characterId: e.characterId,
    }));
}

export type QuestVictoryContinuePlan =
    | {
          kind: 'continued';
          run: QuestRunState;
          nextMissionId: string;
          lobbyFields: QuestLobbyFields;
      }
    | {
          kind: 'finale';
          run: QuestRunState;
          complete: CompleteQuestRunResult;
      };

/** Mission id from a resolved slot ref (fixed or generated). */
export function missionIdFromResolvedRef(ref: ResolvedMissionRef | null | undefined): string | null {
    if (!ref) return null;
    return typeof ref.missionId === 'string' && ref.missionId.trim() !== '' ? ref.missionId : null;
}

/** Lobby stamp + selectedMissionId for the run's current slot. */
export function questLobbyFieldsFromRun(run: QuestRunState): QuestLobbyFields & {
    selectedMissionId: string;
} {
    const missionId = missionIdFromResolvedRef(run.resolvedSlots[run.currentSlotIndex]);
    if (!missionId) {
        throw new Error(
            `questLobbyFieldsFromRun: no mission at slot ${run.currentSlotIndex} for run ${run.runId}`,
        );
    }
    return {
        questDefId: run.questDefId,
        questRunId: run.runId,
        questSlotIndex: run.currentSlotIndex,
        questRunSeed: run.runSeed,
        selectedMissionId: missionId,
    };
}

/** Read quest lobby fields from game JSON (missing/invalid → null). */
export function readQuestLobbyFields(
    data: Record<string, unknown> | null | undefined,
): QuestLobbyFields | null {
    if (!data || typeof data !== 'object') return null;
    const questDefId = data.questDefId;
    const questRunId = data.questRunId;
    const questSlotIndex = data.questSlotIndex;
    if (typeof questDefId !== 'string' || questDefId.trim() === '') return null;
    if (typeof questRunId !== 'string' || questRunId.trim() === '') return null;
    if (typeof questSlotIndex !== 'number' || !Number.isInteger(questSlotIndex) || questSlotIndex < 0) {
        return null;
    }
    const questRunSeed = data.questRunSeed;
    return {
        questDefId,
        questRunId,
        questSlotIndex,
        ...(typeof questRunSeed === 'number' && Number.isFinite(questRunSeed)
            ? { questRunSeed }
            : {}),
    };
}

/** True when character run matches lobby stamp (active quest mission). */
export function questRunMatchesLobby(
    run: QuestRunState | null | undefined,
    lobby: QuestLobbyFields | null | undefined,
): boolean {
    if (!run || !lobby) return false;
    if (run.status !== 'active') return false;
    return (
        run.questDefId === lobby.questDefId
        && run.runId === lobby.questRunId
        && run.currentSlotIndex === lobby.questSlotIndex
    );
}

/** True when character run matches lobby stamp during Quest Prep (status prep). */
export function questRunMatchesLobbyPrep(
    run: QuestRunState | null | undefined,
    lobby: QuestLobbyFields | null | undefined,
): boolean {
    if (!run || !lobby) return false;
    if (run.status !== 'prep') return false;
    return (
        run.questDefId === lobby.questDefId
        && run.runId === lobby.questRunId
        && run.currentSlotIndex === lobby.questSlotIndex
    );
}

/**
 * After mission victory in a quest: advance slot or complete the quest.
 * Does not persist — caller writes `run` / `complete` to the character.
 */
export function planQuestVictoryContinue(
    run: QuestRunState,
    questDef: QuestDef,
): QuestVictoryContinuePlan {
    const advanced = advanceQuestRunOnMissionVictory(run);
    if (advanced.kind === 'continued') {
        const nextMissionId = missionIdFromResolvedRef(
            advanced.run.resolvedSlots[advanced.run.currentSlotIndex],
        );
        if (!nextMissionId) {
            throw new Error(
                `planQuestVictoryContinue: continued run missing mission at slot ${advanced.run.currentSlotIndex}`,
            );
        }
        return {
            kind: 'continued',
            run: advanced.run,
            nextMissionId,
            lobbyFields: {
                questDefId: advanced.run.questDefId,
                questRunId: advanced.run.runId,
                questSlotIndex: advanced.run.currentSlotIndex,
                questRunSeed: advanced.run.runSeed,
            },
        };
    }
    return {
        kind: 'finale',
        run: advanced.run,
        complete: completeQuestRun(advanced.run, questDef),
    };
}

/** Same mission + lobby stamp for defeat retry (run index unchanged). */
export function planQuestDefeatRetry(run: QuestRunState): {
    missionId: string;
    lobbyFields: QuestLobbyFields;
} {
    const fields = questLobbyFieldsFromRun(run);
    return {
        missionId: fields.selectedMissionId,
        lobbyFields: {
            questDefId: fields.questDefId,
            questRunId: fields.questRunId,
            questSlotIndex: fields.questSlotIndex,
        },
    };
}
