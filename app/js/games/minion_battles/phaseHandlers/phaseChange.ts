/** Phase transition: replace local state wholesale from the server's new game state. */
import type { Dispatch, SetStateAction } from 'react';
import type { GamePhase } from '../state';
import { isUnifiedSlotLayoutPhase } from '../../../contexts/gameSyncOptimisticPatch';
import { getSelectedMissionId } from '../gameHelpers';

export interface PhaseChangeContext {
    clearLocalOverrides: () => void;
    applyOptimisticGamePatch?: (patch: Record<string, unknown>) => void;
    setGamePhase: Dispatch<SetStateAction<GamePhase>>;
    setPhaseChangeGameState: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    setLastGameStateFromServer: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    setSelectedMissionId: Dispatch<SetStateAction<string | null>>;
    setCharacterSelections: Dispatch<SetStateAction<Record<string, string>>>;
    setStoryReadyPlayerIds: Dispatch<SetStateAction<string[]>>;
    setCharacterSelectReadyPlayerIds: Dispatch<SetStateAction<string[]>>;
}

export function applyPhaseChange(
    ctx: PhaseChangeContext,
    phase: string,
    newGameState: Record<string, unknown>,
): void {
    const {
        clearLocalOverrides,
        applyOptimisticGamePatch,
        setGamePhase,
        setPhaseChangeGameState,
        setLastGameStateFromServer,
        setSelectedMissionId,
        setCharacterSelections,
        setStoryReadyPlayerIds,
        setCharacterSelectReadyPlayerIds,
    } = ctx;
    // Phase changed — clear all local overrides since the game state
    // is being replaced wholesale by the server.
    clearLocalOverrides();

    setGamePhase(phase as GamePhase);
    if (phase === 'battle' && newGameState) {
        setPhaseChangeGameState(newGameState);
    } else {
        setPhaseChangeGameState(null);
    }
    if (newGameState) {
        setLastGameStateFromServer(newGameState);
        setSelectedMissionId(getSelectedMissionId(newGameState));
        const nc = (newGameState.characterSelections ?? newGameState.character_selections) as
            | Record<string, string>
            | undefined;
        if (nc) setCharacterSelections(nc);
        const sr = (newGameState.storyReadyPlayerIds as string[] | undefined) ?? [];
        setStoryReadyPlayerIds(sr);
        const ready =
            (newGameState.characterSelectReadyPlayerIds as string[] | undefined) ??
            (newGameState.character_select_ready_player_ids as string[] | undefined) ??
            [];
        setCharacterSelectReadyPlayerIds(ready);
    }
    // Keep GameScreen layout in sync with local content phase (lobby 10EA88-class flicker:
    // story mounted inside classic lobby chrome until the next GameSync poll).
    if (isUnifiedSlotLayoutPhase(phase) && newGameState) {
        applyOptimisticGamePatch?.({
            ...newGameState,
            gamePhase: phase,
        });
    }
}
