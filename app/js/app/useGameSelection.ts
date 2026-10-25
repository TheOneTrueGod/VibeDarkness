import { useCallback } from 'react';
import type { LobbyClient } from '../LobbyClient';
import type { LobbyState, PlayerState, GameStatePayload } from '../types';
import type { LobbySessionSetters, ShowToast } from './types';

interface UseGameSelectionArgs extends Pick<LobbySessionSetters, 'setLobbyPageState' | 'setLobbyGameId' | 'setLobbyGameType' | 'setLobbyGameData'> {
    showToast: ShowToast;
    lobbyClient: LobbyClient;
    currentLobby: LobbyState | null;
    currentPlayer: PlayerState | null;
}

/** Host picks a game type for the lobby. */
export function useGameSelection({
    showToast,
    lobbyClient,
    currentLobby,
    currentPlayer,
    setLobbyPageState,
    setLobbyGameId,
    setLobbyGameType,
    setLobbyGameData,
}: UseGameSelectionArgs) {
    const handleSelectGame = useCallback(
        async (gameTypeId: string) => {
            if (!currentLobby || !currentPlayer?.isHost) return;
            try {
                await lobbyClient.setLobbyState(currentLobby.id, currentPlayer.id, 'in_game', gameTypeId);
                setLobbyPageState('in_game');
                setLobbyGameType(gameTypeId);
                setLobbyGameId(null);
                setLobbyGameData(null);
                const { gameState } = await lobbyClient.getLobbyState(currentLobby.id, currentPlayer.id);
                const payload = gameState as unknown as GameStatePayload;
                setLobbyGameId(payload.gameId ?? null);
                setLobbyGameData(payload.game ?? null);
            } catch (error) {
                showToast(
                    'Failed to start game: ' + (error instanceof Error ? error.message : 'Unknown error'),
                    'error'
                );
            }
        },
        [currentLobby, currentPlayer, lobbyClient, showToast, setLobbyGameData, setLobbyGameId, setLobbyGameType, setLobbyPageState]
    );

    return { handleSelectGame };
}
