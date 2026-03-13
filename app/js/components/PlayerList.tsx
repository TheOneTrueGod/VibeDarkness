/**
 * Player list display component
 */
import React from 'react';
import type { PlayerState } from '../types';
import PlayerPill from './PlayerPill';

interface PlayerListProps {
    players: Record<string, PlayerState>;
    currentPlayerId?: string;
    /** When provided, second line shows the player's selected character (e.g. from game state). */
    characterSelections?: Record<string, string>;
    /** Map characterId -> display name; when provided with characterSelections, second line shows name instead of "(selected)". */
    characterIdToName?: Record<string, string>;
    /** When provided (e.g. on character select), each player shows Ready / Not Ready with green / yellow outline. */
    readyPlayerIds?: string[];
    /** Player IDs whose cards should currently flash (e.g. due to WebRTC ping). */
    flashingPlayerIds?: string[];
}

export default function PlayerList({
    players,
    currentPlayerId,
    characterSelections,
    characterIdToName,
    readyPlayerIds,
    flashingPlayerIds,
}: PlayerListProps) {
    const readySet = readyPlayerIds != null ? new Set(readyPlayerIds) : null;
    const flashingSet = flashingPlayerIds != null ? new Set(flashingPlayerIds) : null;
    return (
        <div className="mt-4 p-4 bg-surface rounded">
            <h3 className="mb-3 text-sm text-muted uppercase">Players</h3>
            <ul className="list-none flex flex-wrap gap-2">
                {Object.values(players).map((player) => {
                    const characterId = characterSelections?.[player.id];
                    const secondLine =
                        characterId != null
                            ? (characterIdToName?.[characterId] ?? '(selected)')
                            : undefined;
                    const readyStatus =
                        readySet != null
                            ? (readySet.has(player.id) ? 'ready' : 'not_ready')
                            : undefined;
                    return (
                        <li key={player.id}>
                            <PlayerPill
                                player={player}
                                currentPlayerId={currentPlayerId}
                                secondLine={secondLine}
                                readyStatus={readyStatus}
                                isFlashing={flashingSet?.has(player.id) ?? false}
                            />
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
