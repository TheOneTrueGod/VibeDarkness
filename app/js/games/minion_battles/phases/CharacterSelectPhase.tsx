/**
 * Character Select Phase - React component
 * Shows character cards (200x200) with name, picture, enabled/locked status.
 * Players select a character; selections are synced via game state API.
 * When all players have selected, the host sees a "Start Game" button.
 */
import React, { useCallback, useMemo } from 'react';
import type { PlayerState } from '../../../types';
import { LobbyClient } from '../../../LobbyClient';
import { MessageType } from '../../../MessageTypes';
import { CHARACTERS } from '../character_defs/characters';
import type { CharacterDef } from '../character_defs/types';
import { MinionBattlesPlayer } from '../MinionBattlesPlayer';

interface CharacterSelectPhaseProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
}

export default function CharacterSelectPhase({
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    players,
    characterSelections,
    onPhaseChange,
}: CharacterSelectPhaseProps) {
    const mbPlayer = useMemo(() => {
        const p = players[playerId];
        return p ? new MinionBattlesPlayer(p) : null;
    }, [players, playerId]);

    const mySelection = characterSelections[playerId] ?? null;
    const allPlayerIds = Object.keys(players);
    const allSelected = allPlayerIds.length > 0 && allPlayerIds.every((pid) => pid in characterSelections);

    // Sort characters: enabled+unlocked first, then enabled+locked, then disabled+unlocked, then disabled+locked
    const sortedCharacters = useMemo(() => {
        return [...CHARACTERS].sort((a, b) => {
            const aUnlocked = mbPlayer ? mbPlayer.isCharacterUnlocked(a.id) : false;
            const bUnlocked = mbPlayer ? mbPlayer.isCharacterUnlocked(b.id) : false;
            const aScore = (a.enabled ? 2 : 0) + (aUnlocked ? 1 : 0);
            const bScore = (b.enabled ? 2 : 0) + (bUnlocked ? 1 : 0);
            return bScore - aScore;
        });
    }, [mbPlayer]);

    const handleCharacterClick = useCallback(
        async (characterId: string) => {
            const char = CHARACTERS.find((c) => c.id === characterId);
            if (!char || !char.enabled) return;
            if (!mbPlayer || !mbPlayer.isCharacterUnlocked(characterId)) return;

            try {
                // Update game state with the selection
                await lobbyClient.updateGameState(lobbyId, gameId, playerId, {
                    [`characterSelections.${playerId}`]: characterId,
                });
                // Broadcast so other clients pick it up via polling
                await lobbyClient.sendMessage(lobbyId, playerId, MessageType.CHARACTER_SELECT, {
                    characterId,
                });
            } catch (error) {
                console.error('Failed to select character:', error);
            }
        },
        [lobbyClient, lobbyId, gameId, playerId, mbPlayer]
    );

    const handleStartGame = useCallback(async () => {
        try {
            const newGameState = await lobbyClient.updateGameState(lobbyId, gameId, playerId, {
                gamePhase: 'battle',
            });
            await lobbyClient.sendMessage(lobbyId, playerId, MessageType.GAME_PHASE_CHANGED, {
                gamePhase: 'battle',
            });
            if (onPhaseChange) {
                onPhaseChange('battle', newGameState);
            }
        } catch (error) {
            console.error('Failed to start game:', error);
        }
    }, [lobbyClient, lobbyId, gameId, playerId, onPhaseChange]);

    return (
        <div className="w-full h-full flex flex-col max-w-[1200px] mx-auto">
            <h2 className="text-[32px] font-bold text-center py-5 shrink-0">Select your character</h2>

            <div className="flex-1 overflow-auto px-5 pb-5">
                <div className="flex flex-wrap justify-center gap-6">
                    {sortedCharacters.map((char) => (
                        <CharacterCard
                            key={char.id}
                            character={char}
                            isUnlocked={mbPlayer ? mbPlayer.isCharacterUnlocked(char.id) : false}
                            isMySelection={mySelection === char.id}
                            playerSelections={characterSelections}
                            players={players}
                            onClick={handleCharacterClick}
                        />
                    ))}
                </div>
            </div>

            {isHost && (
                <div className="flex justify-center py-4 px-5 shrink-0 border-t border-border-custom">
                    <button
                        type="button"
                        disabled={!allSelected}
                        className={`px-8 py-3 text-white text-lg font-bold rounded-lg transition-colors shadow-lg ${
                            allSelected
                                ? 'bg-green-600 hover:bg-green-700 hover:shadow-xl cursor-pointer'
                                : 'bg-gray-600 opacity-50 cursor-not-allowed'
                        }`}
                        onClick={handleStartGame}
                    >
                        Start Game
                    </button>
                </div>
            )}
        </div>
    );
}

/** Individual character card (200x200) */
interface CharacterCardProps {
    character: CharacterDef;
    isUnlocked: boolean;
    isMySelection: boolean;
    playerSelections: Record<string, string>;
    players: Record<string, PlayerState>;
    onClick: (characterId: string) => void;
}

function CharacterCard({
    character,
    isUnlocked,
    isMySelection,
    playerSelections,
    players,
    onClick,
}: CharacterCardProps) {
    const isSelectable = character.enabled && isUnlocked;

    // Players who selected this character
    const selectingPlayers = useMemo(() => {
        return Object.entries(playerSelections)
            .filter(([, charId]) => charId === character.id)
            .map(([pid]) => players[pid])
            .filter(Boolean);
    }, [playerSelections, character.id, players]);

    return (
        <div
            className={`
                w-[200px] h-[200px] rounded-lg overflow-hidden relative flex flex-col
                transition-all cursor-pointer
                ${isMySelection
                    ? 'border-[3px] border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                    : 'border-2 border-border-custom'
                }
                ${isSelectable
                    ? 'hover:-translate-y-1 hover:shadow-[0_8px_16px_rgba(0,0,0,0.4)] hover:border-primary'
                    : 'opacity-50 cursor-not-allowed'
                }
                bg-surface
            `}
            onClick={() => isSelectable && onClick(character.id)}
            title={
                !character.enabled
                    ? `${character.name} — Coming Soon`
                    : !isUnlocked
                    ? `${character.name} — Locked`
                    : character.name
            }
        >
            {/* Character portrait */}
            <div
                className="w-full flex-1 overflow-hidden flex items-center justify-center bg-background relative"
                dangerouslySetInnerHTML={{ __html: character.picture }}
            />

            {/* Diagonal DISABLED overlay on portrait */}
            {!character.enabled && (
                <div className="absolute inset-0 bottom-8 flex items-center justify-center pointer-events-none overflow-hidden">
                    <span
                        className="text-red-500 font-black text-xl tracking-widest opacity-80 select-none"
                        style={{ transform: 'rotate(-35deg)' }}
                    >
                        COMING SOON
                    </span>
                </div>
            )}

            {/* Locked overlay on portrait */}
            {character.enabled && !isUnlocked && (
                <div className="absolute inset-0 bottom-8 flex items-center justify-center pointer-events-none overflow-hidden">
                    <span
                        className="text-yellow-400 font-black text-xl tracking-widest opacity-80 select-none"
                        style={{ transform: 'rotate(-35deg)' }}
                    >
                        LOCKED
                    </span>
                </div>
            )}

            {/* Character name bar with selection dots */}
            <div className="px-3 py-2 bg-surface-light flex items-center justify-between gap-1">
                <span className="text-sm font-semibold truncate">{character.name}</span>
                {selectingPlayers.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                        {selectingPlayers.map((p) => (
                            <div
                                key={p.id}
                                className="w-4 h-4 rounded-full border border-white/50 shadow-sm"
                                style={{ backgroundColor: p.color }}
                                title={p.name}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
