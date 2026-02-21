<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

/**
 * POST /api/lobbies/{id}/games/{gameId}/orders/{checkpointGameTick}
 *
 * Add an order to a checkpoint file. Used when a player submits an order
 * for a tick that belongs to the given checkpoint.
 * Body: { playerId, atTick, order }
 * Reads or creates game_<gameId>_<checkpointGameTick>.json and appends to orders.
 */
class SaveGameOrdersHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $checkpointGameTick = isset($matches[3]) ? (int) $matches[3] : null;
        $data = \getJsonBody();

        $playerId = $data['playerId'] ?? null;
        $atTick = $data['atTick'] ?? null;
        $order = $data['order'] ?? null;

        if (!$playerId || $checkpointGameTick === null || $atTick === null || !is_array($order)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId, atTick, and order are required'];
        }

        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        $dir = self::getGameDir($lobbyId, $gameId);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $path = $dir . '/game_' . $gameId . '_' . $checkpointGameTick . '.json';

        $orders = [];
        $state = null;
        $gameTick = $checkpointGameTick;
        if (is_file($path)) {
            $decoded = json_decode(file_get_contents($path), true);
            $state = $decoded['state'] ?? null;
            $orders = $decoded['orders'] ?? [];
            $gameTick = (int) ($decoded['gameTick'] ?? $checkpointGameTick);
        }
        $orders[] = ['gameTick' => (int) $atTick, 'order' => $order];
        $payload = ['gameTick' => $gameTick, 'state' => $state, 'orders' => $orders];
        file_put_contents($path, json_encode($payload, JSON_PRETTY_PRINT));

        return ['success' => true];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
