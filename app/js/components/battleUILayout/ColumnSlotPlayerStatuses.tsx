/**
 * ColumnSlotPlayerStatuses - a Column slot's content: a vertical, scrollable list of player
 * chips with status (ready/not-ready, connection). Slotted into the left column during the
 * story phases (battle uses ColumnSlotPartyAndActions there instead).
 */
import React from 'react';
import type { PlayerState } from '../../types';
import PlayerStatusChip from './PlayerStatusChip';
import ColumnHeader from './ColumnHeader';
import { SPECTATOR_ID } from '../../games/minion_battles/state';

interface ColumnSlotPlayerStatusesProps {
    players: Record<string, PlayerState>;
    currentPlayerId?: string;
    /** When provided, second line shows the player's selected character. */
    characterSelections?: Record<string, string>;
    characterIdToName?: Record<string, string>;
    /** When provided, each player shows Ready / Not Ready with green / yellow outline. */
    readyPlayerIds?: string[];
    flashingPlayerIds?: string[];
}

export default function ColumnSlotPlayerStatuses({
    players,
    currentPlayerId,
    characterSelections,
    characterIdToName,
    readyPlayerIds,
    flashingPlayerIds,
}: ColumnSlotPlayerStatusesProps) {
    const visiblePlayers = Object.values(players).filter(
        (player) => characterSelections?.[player.id] !== SPECTATOR_ID,
    );

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <ColumnHeader title="Players" />
            <ul className="list-none flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 [scrollbar-gutter:stable]">
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
        </div>
    );
}
