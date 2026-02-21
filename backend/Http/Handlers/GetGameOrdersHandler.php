<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

/**
 * GET /api/lobbies/{id}/games/{gameId}/orders/{checkpointGameTick}
 *
 * Get orders (and optionally full checkpoint) for a checkpoint.
 * Returns the checkpoint file content: { gameTick, state, orders }.
 * Query params: ?playerId=...
 */
class GetGameOrdersHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $checkpointGameTick = isset($matches[3]) ? (int) $matches[3] : null;

        $playerId = $_GET['playerId'] ?? null;
        if (!$playerId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId query param is required'];
        }

        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        if ($checkpointGameTick === null) {
            return ['success' => true, 'orders' => null, 'gameTick' => null, 'state' => null];
        }

        $dir = self::getGameDir($lobbyId, $gameId);
        $path = $dir . '/game_' . $gameId . '_' . $checkpointGameTick . '.json';

        if (!is_file($path)) {
            return ['success' => true, 'orders' => null, 'gameTick' => $checkpointGameTick, 'state' => null];
        }

        $data = json_decode(file_get_contents($path), true);
        $orders = $data['orders'] ?? [];
        $state = $data['state'] ?? null;
        $gameTick = (int) ($data['gameTick'] ?? $checkpointGameTick);

        return ['success' => true, 'orders' => $orders, 'gameTick' => $gameTick, 'state' => $state];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
