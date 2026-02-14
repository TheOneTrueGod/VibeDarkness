<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

/**
 * GET /api/lobbies/{id}/games/{gameId}/orders/{index}
 *
 * Poll for ability orders at a given snapshot index.
 * Query params: ?playerId=...
 * Returns the orders if available, or null if not yet submitted.
 */
class GetGameOrdersHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $index = $matches[3];

        $playerId = $_GET['playerId'] ?? null;
        if (!$playerId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId query param is required'];
        }

        // Verify player is in lobby
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        $dir = self::getGameDir($lobbyId, $gameId);
        $path = $dir . '/gamestate_orders_' . intval($index) . '.json';

        if (!is_file($path)) {
            return ['success' => true, 'orders' => null, 'index' => intval($index)];
        }

        $data = json_decode(file_get_contents($path), true);
        return ['success' => true, 'orders' => $data, 'index' => intval($index)];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
