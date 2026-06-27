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
}

export function useCharacterSelectPhase({
    api,
    state,
    characterSelections,
    onPhaseChange,
    isHost,
    preMissionStory,
    missionDef,
}: UseCharacterSelectPhaseParams) {
    const {
        allSelected, allReady, atLeastOneCharacter, allRequiredPlayersPresent,
        setSetReadyLoading, setOptimisticAmReady,
    } = state;

    const handleSetReady = useCallback(async () => {
        setSetReadyLoading(true);
        try {
            await api.sendMessage(MessageType.CHARACTER_SELECT_READY, {});
            setOptimisticAmReady(true);
        } catch (error) {
            console.error('Failed to set ready:', error);
        } finally {
            setSetReadyLoading(false);
        }
    }, [api, setSetReadyLoading, setOptimisticAmReady]);

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
            console.error('Failed to continue to story:', error);
        }
    }, [api, onPhaseChange, characterSelections]);

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
            console.error('Failed to start game:', error);
        }
    }, [api, onPhaseChange, characterSelections]);

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
            console.error('Failed to continue to post-mission story:', error);
        }
    }, [api, onPhaseChange, characterSelections]);

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
