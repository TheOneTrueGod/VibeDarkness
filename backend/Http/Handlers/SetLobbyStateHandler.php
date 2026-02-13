<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class SetLobbyStateHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $data = \getJsonBody();

        $playerId = $data['playerId'] ?? null;
        $state = $data['state'] ?? null;
        $gameId = $data['gameId'] ?? null;

        if (!$playerId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Player ID is required'];
        }
        if (!$state || !in_array($state, ['home', 'in_game'], true)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'state must be "home" or "in_game"'];
        }
        if ($state === 'in_game' && (empty($gameId) || !is_string($gameId))) {
            http_response_code(400);
            return ['success' => false, 'error' => 'gameId is required when state is in_game'];
        }

        $success = $manager->setLobbyState(
            $lobbyId,
            $playerId,
            $state,
            $state === 'in_game' ? $gameId : null
        );

        if (!$success) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Only the host can set lobby state'];
        }

        return ['success' => true];
    }
}
