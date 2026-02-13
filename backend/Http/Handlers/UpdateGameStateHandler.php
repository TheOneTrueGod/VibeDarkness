<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class UpdateGameStateHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = $data['playerId'] ?? null;
        $updates = $data['updates'] ?? [];

        if (!$playerId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Player ID is required'];
        }
        if (!is_array($updates) || empty($updates)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Updates must be a non-empty array'];
        }

        $success = $manager->updateGameState($lobbyId, $gameId, $playerId, $updates);

        if (!$success) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Only the host can update game state'];
        }

        // Return the updated game state
        $updatedState = $manager->getGameStateData($lobbyId, $gameId);
        return [
            'success' => true,
            'gameState' => $updatedState,
        ];
    }
}
