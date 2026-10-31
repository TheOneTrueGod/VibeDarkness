import { useCallback, useEffect, useRef } from 'react';
import { MessageType } from '../../../../../MessageTypes';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { PreMissionStoryDef } from '../../../storylines/storyTypes';
import type { IBaseMissionDef } from '../../../storylines/BaseMissionDef';
import type { CharacterSelectState } from './useCharacterSelectState';

interface UseCharacterSelectPhaseParams {
    api: MinionBattlesApi;
    state: CharacterSelectState;
    characterSelections: Record<string, string>;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
    isHost: boolean;
    preMissionStory?: PreMissionStoryDef | null;
    missionDef?: IBaseMissionDef | null;
    /** Optional async work before sending Ready (e.g. freeze Quest Prep loadout). */
    onBeforeReady?: () => Promise<void>;
    /** Surface API failures (ready, phase advance) instead of only logging them. */
    onActionError?: (message: string) => void;
}

export function useCharacterSelectPhase({
    api,
    state,
    characterSelections,
    onPhaseChange,
    isHost,
    preMissionStory,
    missionDef,
    onBeforeReady,
    onActionError,
}: UseCharacterSelectPhaseParams) {
    const {
        allSelected, allReady, atLeastOneCharacter, allRequiredPlayersPresent,
        setSetReadyLoading, setOptimisticAmReady,
    } = state;

    const reportFailure = useCallback((label: string, error: unknown) => {
        const detail = error instanceof Error && error.message ? error.message : 'Unknown error';
        console.error(`${label}:`, error);
        onActionError?.(`${label}: ${detail}`);
    }, [onActionError]);

    const handleSetReady = useCallback(async () => {
        setSetReadyLoading(true);
        try {
            if (onBeforeReady) {
                await onBeforeReady();
            }
            await api.sendMessage(MessageType.CHARACTER_SELECT_READY, {});
            setOptimisticAmReady(true);
        } catch (error) {
            reportFailure('Failed to set ready', error);
        } finally {
            setSetReadyLoading(false);
        }
    }, [api, setSetReadyLoading, setOptimisticAmReady, onBeforeReady, reportFailure]);

    const handleContinueToStory = useCallback(async () => {
        try {
            const newGameState = await api.updateGameState({
                gamePhase: 'pre_mission_story',
                storyReadyPlayerIds: [],
                characterSelectReadyPlayerIds: [],
            });
            await api.sendMessage(MessageType.GAME_PHASE_CHANGED, { gamePhase: 'pre_mission_story' });
            if (onPhaseChange) {
                onPhaseChange('pre_mission_story', {
                    ...newGameState,
                    characterSelections:
                        (newGameState.characterSelections ?? newGameState.character_selections) ?? characterSelections,
                });
            }
        } catch (error) {
            reportFailure('Failed to continue to story', error);
        }
    }, [api, onPhaseChange, characterSelections, reportFailure]);

    const handleStartGame = useCallback(async () => {
        try {
            const newGameState = await api.updateGameState({
                gamePhase: 'battle',
                characterSelectReadyPlayerIds: [],
            });
            await api.sendMessage(MessageType.GAME_PHASE_CHANGED, { gamePhase: 'battle' });
            if (onPhaseChange) {
                onPhaseChange('battle', {
                    ...newGameState,
                    characterSelections:
                        (newGameState.characterSelections ?? newGameState.character_selections) ?? characterSelections,
                });
            }
        } catch (error) {
            reportFailure('Failed to start game', error);
        }
    }, [api, onPhaseChange, characterSelections, reportFailure]);

    const handleContinueToPostMissionStory = useCallback(async () => {
        try {
            const newGameState = await api.updateGameState({
                gamePhase: 'post_mission_story',
                characterSelectReadyPlayerIds: [],
            });
            await api.sendMessage(MessageType.GAME_PHASE_CHANGED, { gamePhase: 'post_mission_story' });
            if (onPhaseChange) {
                onPhaseChange('post_mission_story', {
                    ...newGameState,
                    characterSelections:
                        (newGameState.characterSelections ?? newGameState.character_selections) ?? characterSelections,
                });
            }
        } catch (error) {
            reportFailure('Failed to continue to post-mission story', error);
        }
    }, [api, onPhaseChange, characterSelections, reportFailure]);

    const hasTriggeredAdvanceRef = useRef(false);
    useEffect(() => {
        if (!allReady) hasTriggeredAdvanceRef.current = false;
    }, [allReady]);

    useEffect(() => {
        if (!isHost || !allSelected || !allReady || !atLeastOneCharacter || !allRequiredPlayersPresent || hasTriggeredAdvanceRef.current) return;
        hasTriggeredAdvanceRef.current = true;
        if (preMissionStory) {
            handleContinueToStory();
        } else if (missionDef?.skipBattle && missionDef.postMissionStory) {
            handleContinueToPostMissionStory();
        } else {
            handleStartGame();
        }
    }, [
        isHost, allSelected, allReady, atLeastOneCharacter, allRequiredPlayersPresent,
        preMissionStory, missionDef, handleContinueToStory, handleContinueToPostMissionStory, handleStartGame,
    ]);

    return { handleSetReady, handleContinueToStory, handleStartGame, handleContinueToPostMissionStory };
}
