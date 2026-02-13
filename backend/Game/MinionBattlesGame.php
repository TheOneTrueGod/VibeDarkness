<?php

namespace App\Game;

/**
 * Minion Battles game. Initial state includes hands (playerId => list of card IDs).
 */
class MinionBattlesGame extends BaseGame
{
    /**
     * @param array<string> $playerIds
     * @return array{lobby_id: string, players: array<string>, hands: array<string, array<string>>, gamePhase: string, missionVotes: array<string, string>}
     */
    public static function createInitialState(string $lobbyId, array $playerIds): array
    {
        $base = parent::createInitialState($lobbyId, $playerIds);
        $hands = [];
        foreach ($playerIds as $pid) {
            $hands[$pid] = [];
        }
        return array_merge($base, [
            'hands' => $hands,
            'gamePhase' => 'mission_select',
            'missionVotes' => [],
        ]);
    }
}
