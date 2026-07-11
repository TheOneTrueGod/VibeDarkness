/**
 * RowSlotPlayerStatuses - a Bottom Row slot's content: a fixed-height horizontal row of
 * player chips with status (ready/not-ready, connection). Used by the story phases' bottom row.
 */
import React from 'react';
import type { PlayerState } from '../../types';
import PlayerStatusChip from './PlayerStatusChip';
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
    const visiblePlayers = Object.values(players).filter(
        (player) => characterSelections?.[player.id] !== SPECTATOR_ID,
    );

    return (
        <ul className="list-none flex h-full min-h-0 w-full flex-wrap content-start gap-2 overflow-y-auto [scrollbar-gutter:stable]">
            {visiblePlayers.map((player) => (
                <li key={player.id}>
                    <PlayerStatusChip
                        player={player}
                        currentPlayerId={currentPlayerId}
                        characterSelections={characterSelections}
                        characterIdToName={characterIdToName}
                        readyPlayerIds={readyPlayerIds}
                        flashingPlayerIds={flashingPlayerIds}
                    />
                </li>
            ))}
        </ul>
    );
}
