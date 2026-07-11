/**
 * RowSlotPlayerStatuses - a Bottom Row slot's content: a fixed-height horizontal row of
 * player pills with status (ready/not-ready, connection). Used by the story phases' bottom row.
 */
import React from 'react';
import type { PlayerState } from '../../types';
import PlayerPill from '../PlayerPill';
import { SPECTATOR_ID } from '../../games/minion_battles/state';

interface RowSlotPlayerStatusesProps {
    players: Record<string, PlayerState>;
    currentPlayerId?: string;
    /** When provided, second line shows the player's selected character. */
    characterSelections?: Record<string, string>;
    characterIdToName?: Record<string, string>;
    /** When provided, each player shows Ready / Not Ready with green / yellow outline. */
    readyPlayerIds?: string[];
    flashingPlayerIds?: string[];
}

export default function RowSlotPlayerStatuses({
    players,
    currentPlayerId,
    characterSelections,
    characterIdToName,
    readyPlayerIds,
    flashingPlayerIds,
}: RowSlotPlayerStatusesProps) {
    const readySet = readyPlayerIds != null ? new Set(readyPlayerIds) : null;
    const flashingSet = flashingPlayerIds != null ? new Set(flashingPlayerIds) : null;
    const visiblePlayers = Object.values(players).filter(
        (player) => characterSelections?.[player.id] !== SPECTATOR_ID,
    );

    return (
        <ul className="list-none flex h-full min-h-0 w-full flex-wrap content-start gap-2 overflow-y-auto [scrollbar-gutter:stable]">
            {visiblePlayers.map((player) => {
                const characterId = characterSelections?.[player.id];
                const secondLine =
                    characterId === SPECTATOR_ID
                        ? 'Spectator'
                        : characterId != null && characterIdToName?.[characterId] != null
                          ? characterIdToName[characterId]
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
    );
}
