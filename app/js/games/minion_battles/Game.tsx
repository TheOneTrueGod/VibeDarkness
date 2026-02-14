/**
 * Minion Battles - React game component
 * Manages game phases and state, receives props from the lobby.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { PlayerState } from '../../types';
import { LobbyClient } from '../../LobbyClient';
import { MessageType } from '../../MessageTypes';
import type { GamePhase, MinionBattlesState } from './state';
import MissionSelectPhase from './phases/MissionSelectPhase';
import CharacterSelectPhase from './phases/CharacterSelectPhase';

interface MinionBattlesGameProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    gameData: Record<string, unknown> | null;
}

export default function MinionBattlesGame({
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    players,
    gameData,
}: MinionBattlesGameProps) {
    const raw = gameData ?? {};

    const [gamePhase, setGamePhase] = useState<GamePhase>(
        (raw.gamePhase as GamePhase) ?? (raw.game_phase as GamePhase) ?? 'mission_select'
    );
    const [missionVotes, setMissionVotes] = useState<Record<string, string>>(
        (raw.missionVotes as Record<string, string>) ??
            (raw.mission_votes as Record<string, string>) ??
            {}
    );

    // Periodically refresh game state from server
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const { gameState } = await lobbyClient.getLobbyState(lobbyId, playerId);
                const gd = (gameState as { game?: Record<string, unknown> }).game;
                if (gd) {
                    const newPhase = (gd.gamePhase ?? gd.game_phase) as GamePhase | undefined;
                    const newVotes = (gd.missionVotes ?? gd.mission_votes) as
                        | Record<string, string>
                        | undefined;
                    if (newPhase) setGamePhase(newPhase);
                    if (newVotes) setMissionVotes(newVotes);
                }
            } catch {
                // Silently fail
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [lobbyClient, lobbyId, playerId]);

    const handlePhaseChange = useCallback(
        (phase: string, newGameState: Record<string, unknown>) => {
            setGamePhase(phase as GamePhase);
            if (newGameState) {
                const nv = (newGameState.missionVotes ?? newGameState.mission_votes) as
                    | Record<string, string>
                    | undefined;
                if (nv) setMissionVotes(nv);
            }
        },
        []
    );

    return (
        <div className="w-full h-full overflow-auto">
            {gamePhase === 'mission_select' && (
                <MissionSelectPhase
                    lobbyClient={lobbyClient}
                    lobbyId={lobbyId}
                    gameId={gameId}
                    playerId={playerId}
                    isHost={isHost}
                    players={players}
                    missionVotes={missionVotes}
                    onPhaseChange={handlePhaseChange}
                />
            )}
            {gamePhase === 'character_select' && <CharacterSelectPhase />}
            {gamePhase !== 'mission_select' && gamePhase !== 'character_select' && (
                <div className="text-center p-5">
                    <h2 className="text-2xl font-bold">Minion Battles</h2>
                    <p className="text-muted mt-2">Phase: {gamePhase}</p>
                </div>
            )}
        </div>
    );
}
