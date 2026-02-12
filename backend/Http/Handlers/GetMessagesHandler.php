<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class GetMessagesHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $playerId = $_GET['playerId'] ?? null;
        if (!$playerId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId required'];
        }
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Not in lobby'];
        }
        $after = isset($_GET['after']) ? (int) $_GET['after'] : null;
        $messages = $manager->getMessages($lobbyId, $after, 10);
        return [
            'success' => true,
            'messages' => $messages,
        ];
    }
}
