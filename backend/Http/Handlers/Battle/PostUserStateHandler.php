<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\LobbyManager;
use App\UserStateStorage;

class PostUserStateHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $userId  = $matches[2];

        $body     = \getJsonBody();
        $playerId = isset($body['playerId']) ? (string) $body['playerId'] : '';

        if ($playerId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId is required'];
        }
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        $entries = isset($body['entries']) && is_array($body['entries']) ? $body['entries'] : [];
        // Silently clamp to 20 per call.
        $entries = array_slice($entries, 0, 20);

        if (count($entries) === 0) {
            return ['success' => true];
        }

        try {
            $storage = new UserStateStorage();
            $storage->appendBatch($lobbyId, $userId, $entries);
            return ['success' => true];
        } catch (\InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (\RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
