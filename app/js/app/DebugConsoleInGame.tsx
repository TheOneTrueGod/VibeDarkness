import DebugConsole from '../components/DebugConsole/DebugConsole';
import type { LobbyClient } from '../LobbyClient';
import type { AccountState, PlayerState } from '../types';
import { useGameSyncOptional } from '../contexts/GameSyncContext';
import { resolveCampaignInstanceId } from '../resolveCampaignInstanceId';

/** DebugConsole when in game - uses GameSyncContext as single data source (same as GameScreen) */
export function DebugConsoleInGame({
    user,
    currentCampaignId,
    lobbyClient,
    currentPlayer,
    lobbyId,
}: {
    user: AccountState | null;
    currentCampaignId: string | null;
    lobbyClient: LobbyClient;
    currentPlayer: PlayerState;
    lobbyId: string;
}) {
    const gameSync = useGameSyncOptional();
    const gameState = gameSync?.gameState ?? null;
    const isHost = currentPlayer?.isHost ?? false;
    const effectivePageState = gameSync?.gameState?.lobbyState ?? 'home';
    const effectiveGameType = gameSync?.gameState?.gameType ?? null;
    const effectiveGameData = gameSync?.gameState?.game ?? null;
    const inBattle =
        effectivePageState === 'in_game' &&
        effectiveGameType === 'minion_battles' &&
        ((effectiveGameData?.gamePhase ?? effectiveGameData?.game_phase) === 'battle');
    return (
        <DebugConsole
            gameState={gameState}
            playerName={user?.name ?? null}
            inBattle={inBattle}
            skipCurrentTurn={null}
            isHost={isHost}
            battleOrdersDebug={{
                lobbyClient,
                lobbyId,
                gameId: gameState?.gameId ?? null,
                playerId: currentPlayer.id,
            }}
            fetchPlayerData={async () => {
                const u = await lobbyClient.getMe();
                return u as Record<string, unknown> | null;
            }}
            fetchCampaignData={async () => {
                const campaignId = resolveCampaignInstanceId(
                    currentCampaignId,
                    user?.campaignIds,
                );
                if (!campaignId) return null;
                return lobbyClient.getCampaign(campaignId);
            }}
            fetchCharactersList={() => lobbyClient.getMyCharacters()}
            getCharacter={(id) => lobbyClient.getCharacter(id)}
        />
    );
}
