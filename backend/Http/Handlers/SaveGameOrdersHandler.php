<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

/**
 * POST /api/lobbies/{id}/games/{gameId}/orders/{index}
 *
 * Player saves ability orders at a given snapshot index.
 * Body: { playerId, orders: { unitId, abilityId, targets } }
 */
class SaveGameOrdersHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $index = $matches[3];
        $data = \getJsonBody();

        $playerId = $data['playerId'] ?? null;
        $orders = $data['orders'] ?? null;

        if (!$playerId || !is_array($orders)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId and orders are required'];
        }

        // Verify player is in lobby
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        // Save to storage/lobbies/<lobbyId>/game_<gameId>/gamestate_orders_<index>.json
        $dir = self::getGameDir($lobbyId, $gameId);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $path = $dir . '/gamestate_orders_' . intval($index) . '.json';
        file_put_contents($path, json_encode($orders, JSON_PRETTY_PRINT));

        return ['success' => true];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
