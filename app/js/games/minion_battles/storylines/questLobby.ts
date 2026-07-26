/**
 * Lobby / continue coordination for an active quest mission chain.
 * Pure helpers — callers persist character run state and stamp lobby game JSON.
 */

import {
    advanceQuestRunOnMissionVictory,
    completeQuestRun,
    type CompleteQuestRunResult,
} from './questRun';
import type { QuestDef, QuestRunState, ResolvedMissionRef } from './questTypes';

/** Fields stamped on Minion Battles lobby game JSON for an active quest mission. */
export type QuestLobbyFields = {
    questDefId: string;
    questRunId: string;
    questSlotIndex: number;
};

/** UI / App options when starting or continuing a quest from Campaign Home. */
export type StartQuestOptions = {
    mode?: 'continue' | 'start';
    /** Bank id when started from a map bank; null/omit for optional/side. */
    assignedBankId?: string | null;
    /** Loadout to freeze into Quest Character (defaults to Campaign Character equipment). */
    equipment?: string[];
};

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
    return { questDefId, questRunId, questSlotIndex };
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
