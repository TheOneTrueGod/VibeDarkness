<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class GetLobbyHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $lobby = $manager->getLobby($lobbyId);

        if ($lobby === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Lobby not found'];
        }

        return [
            'success' => true,
            'lobby' => $lobby->toArray(true),
        ];
    }
}
