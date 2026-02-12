<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class LeaveLobbyHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $data = \getJsonBody();

        $playerId = $data['playerId'] ?? null;

        if (!$playerId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Player ID is required'];
        }

        $success = $manager->leaveLobby($lobbyId, $playerId);

        return [
            'success' => $success,
            'error' => $success ? null : 'Failed to leave lobby',
        ];
    }
}
