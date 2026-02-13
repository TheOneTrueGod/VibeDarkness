<?php

namespace App\Game;

/**
 * Base class for game types. Subclasses define createInitialState() to supply
 * game-specific initial state; the base provides lobby_id and players.
 * Game instance id generation and file writing are handled by LobbyManager.
 */
abstract class BaseGame
{
    /**
     * Return base initial state: lobby_id and list of player IDs.
     * Subclasses should merge this with their own state.
     *
     * @param array<string> $playerIds
     * @return array{lobby_id: string, players: array<string>}
     */
    public static function createInitialState(string $lobbyId, array $playerIds): array
    {
        return [
            'lobby_id' => $lobbyId,
            'players' => array_values($playerIds),
        ];
    }
}
