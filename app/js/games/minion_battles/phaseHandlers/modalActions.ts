/** Click handlers for the defeat modal and the victory popover. */
import {
    STORYLINES,
    getNextVictoryMissionId,
    getChapterIdAfterVictory,
    isLastMissionInChapter,
    planQuestDefeatRetry,
    questRunMatchesLobby,
    type QuestLobbyFields,
} from '../storylines';
import { SPECTATOR_ID, isControlEnemy } from '../state';
import type { StoredQuestVictory } from '../storylines/missionVictoryRecord';
import type { VictoryFlowContext } from './types';

export interface ModalActionsContext
    extends Pick<
        VictoryFlowContext,
        | 'api'
        | 'playerId'
        | 'effectiveSelections'
        | 'setDefeatModalOpen'
        | 'setVictoryModalOpen'
        | 'setVictoryRecord'
        | 'setPendingVictoryObjectives'
        | 'selectedMissionId'
    > {
    /** Raw (non-overridden) character selections carried into the next lobby. */
    characterSelections: Record<string, string>;
    onLeave?: (characterId?: string) => void;
    onContinue?: (characterId: string | undefined, missionMapChapterId?: string | null) => void;
    onTryAgain?: (
        missionId: string,
        previousCharacterSelections: Record<string, string>,
        questLobby?: QuestLobbyFields | null,
    ) => Promise<boolean>;
    handleAbandonQuest: () => Promise<void>;
}

export async function retryMission(
    ctx: ModalActionsContext,
    questLobbyFields: QuestLobbyFields,
    selectedMissionId: string,
): Promise<void> {
    const { api, playerId, effectiveSelections, characterSelections, setDefeatModalOpen, onLeave, onTryAgain } = ctx;
    setDefeatModalOpen(false);
    if (!onTryAgain) {
        const sel = (effectiveSelections as Record<string, string>)[playerId];
        const characterId =
            sel && sel !== SPECTATOR_ID && !isControlEnemy(sel) ? sel : undefined;
        onLeave?.(characterId);
        return;
    }
    const sel = (effectiveSelections as Record<string, string>)?.[playerId];
    let lobbyStamp: QuestLobbyFields = questLobbyFields;
    let missionId = selectedMissionId;
    if (sel && sel !== SPECTATOR_ID && !isControlEnemy(sel)) {
        try {
            const rawChar = await api.getCharacter(sel);
            const run = rawChar.activeQuestRun ?? null;
            if (questRunMatchesLobby(run, questLobbyFields)) {
                const retry = planQuestDefeatRetry(run!);
                missionId = retry.missionId;
                lobbyStamp = retry.lobbyFields;
            }
        } catch (e) {
            console.warn('Failed to plan quest defeat retry:', e);
        }
    }
    const created = await onTryAgain(missionId, characterSelections, lobbyStamp);
    if (!created) {
        const leaveSel = (effectiveSelections as Record<string, string>)[playerId];
        const characterId =
            leaveSel && leaveSel !== SPECTATOR_ID && !isControlEnemy(leaveSel)
                ? leaveSel
                : undefined;
        onLeave?.(characterId);
    }
}

export async function abandonQuestAndLeave(ctx: ModalActionsContext): Promise<void> {
    const { playerId, effectiveSelections, setDefeatModalOpen, onLeave, handleAbandonQuest } = ctx;
    setDefeatModalOpen(false);
    await handleAbandonQuest();
    const sel = (effectiveSelections as Record<string, string>)[playerId];
    const characterId =
        sel && sel !== SPECTATOR_ID && !isControlEnemy(sel) ? sel : undefined;
    onLeave?.(characterId);
}

export function leaveAfterDefeat(ctx: ModalActionsContext): void {
    const { playerId, effectiveSelections, setDefeatModalOpen, onLeave } = ctx;
    setDefeatModalOpen(false);
    const sel = (effectiveSelections as Record<string, string>)[playerId];
    const characterId = sel && sel !== SPECTATOR_ID && !isControlEnemy(sel) ? sel : undefined;
    onLeave?.(characterId);
}

export async function startSideMission(ctx: ModalActionsContext, sideMissionId: string): Promise<void> {
    const {
        playerId,
        effectiveSelections,
        characterSelections,
        setVictoryModalOpen,
        setVictoryRecord,
        setPendingVictoryObjectives,
        onLeave,
        onContinue,
        onTryAgain,
    } = ctx;
    setVictoryModalOpen(false);
    setVictoryRecord(null);
    setPendingVictoryObjectives([]);
    if (onTryAgain) {
        const created = await onTryAgain(sideMissionId, characterSelections);
        if (created) return;
    }
    const sel = (effectiveSelections as Record<string, string>)[playerId];
    const isSpectatorOrEnemy = !sel || sel === SPECTATOR_ID || isControlEnemy(sel);
    const characterId = isSpectatorOrEnemy ? undefined : sel;
    if (onContinue) {
        onContinue(characterId);
    } else {
        onLeave?.();
    }
}

export async function closeVictoryPopover(
    ctx: ModalActionsContext,
    victoryQuest: StoredQuestVictory | null,
): Promise<void> {
    const {
        playerId,
        effectiveSelections,
        characterSelections,
        selectedMissionId,
        setVictoryModalOpen,
        setVictoryRecord,
        setPendingVictoryObjectives,
        onLeave,
        onContinue,
        onTryAgain,
    } = ctx;
    const plan = victoryQuest;
    setVictoryModalOpen(false);
    setVictoryRecord(null);
    setPendingVictoryObjectives([]);
    const sel = (effectiveSelections as Record<string, string>)[playerId];
    const isSpectatorOrEnemy = !sel || sel === SPECTATOR_ID || isControlEnemy(sel);
    const characterId = isSpectatorOrEnemy ? undefined : sel;
    if (plan?.kind === 'continued' && onTryAgain) {
        const created = await onTryAgain(
            plan.nextMissionId,
            characterSelections,
            plan.lobbyFields,
        );
        if (created) return;
    }
    if (plan?.kind === 'finale') {
        if (onContinue) {
            onContinue(characterId);
        } else {
            onLeave?.();
        }
        return;
    }
    // The last mission of a chapter returns to the Mission Map (next chapter selected).
    const nextMissionId =
        selectedMissionId && !isLastMissionInChapter(selectedMissionId, STORYLINES)
            ? getNextVictoryMissionId(selectedMissionId, STORYLINES)
            : null;
    if (onTryAgain && nextMissionId) {
        const created = await onTryAgain(nextMissionId, characterSelections);
        if (created) return;
    }
    if (onContinue) {
        onContinue(
            characterId,
            selectedMissionId ? getChapterIdAfterVictory(selectedMissionId, STORYLINES) : null,
        );
    } else {
        onLeave?.();
    }
}
