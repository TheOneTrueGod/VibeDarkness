/**
 * PlayerStatusChip - a single player's status chip: derives the PlayerPill's second-line
 * (character/spectator) and ready/flashing state from shared list-level context. Used by
 * ColumnSlotPlayerStatuses.
 */
import React from 'react';
import type { PlayerState } from '../../types';
import PlayerPill from '../PlayerPill';
import { SPECTATOR_ID } from '../../games/minion_battles/state';

interface PlayerStatusChipProps {
    player: PlayerState;
    currentPlayerId?: string;
    /** When provided, second line shows the player's selected character. */
    characterSelections?: Record<string, string>;
    characterIdToName?: Record<string, string>;
    /** When provided, shows Ready / Not Ready with green / yellow outline. */
    readyPlayerIds?: string[];
    flashingPlayerIds?: string[];
}

export default function PlayerStatusChip({
    player,
    currentPlayerId,
    characterSelections,
    characterIdToName,
    readyPlayerIds,
    flashingPlayerIds,
}: PlayerStatusChipProps) {
    const characterId = characterSelections?.[player.id];
    const secondLine =
        characterId === SPECTATOR_ID
            ? 'Spectator'
            : characterId != null && characterIdToName?.[characterId] != null
              ? characterIdToName[characterId]
                : undefined;
    const readyStatus =
        readyPlayerIds != null
            ? (readyPlayerIds.includes(player.id) ? 'ready' : 'not_ready')
            : undefined;

    return (
        <PlayerPill
            player={player}
            currentPlayerId={currentPlayerId}
            secondLine={secondLine}
            readyStatus={readyStatus}
            isFlashing={flashingPlayerIds?.includes(player.id) ?? false}
        />
    );
}
