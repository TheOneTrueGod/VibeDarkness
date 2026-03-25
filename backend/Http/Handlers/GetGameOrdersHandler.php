<?php

namespace App\Http\Handlers;

use App\GameCheckpointFiles;
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
        // Union orders from every file in this checkpoint window (aligned bucket + host snapshot ticks).
        // Host must see remote orders even when they live in a different filename than resolveSnapshotPathForOrders picks first.
        $orders = GameCheckpointFiles::mergeOrdersInCheckpointWindow($dir, $gameId, $checkpointGameTick);
        $pathMeta = GameCheckpointFiles::resolveSnapshotPathForMinimal($dir, $gameId, $checkpointGameTick);

        if ($orders === [] && $pathMeta === null) {
            return ['success' => true, 'orders' => null, 'gameTick' => $checkpointGameTick, 'state' => null];
        }

        $gameTick = $checkpointGameTick;
        $state = null;
        if ($pathMeta !== null && is_file($pathMeta)) {
            $data = json_decode((string) file_get_contents($pathMeta), true);
            if (is_array($data)) {
                $gameTick = (int) ($data['gameTick'] ?? $checkpointGameTick);
                $state = $data['state'] ?? null;
            }
        }

        return ['success' => true, 'orders' => $orders, 'gameTick' => $gameTick, 'state' => $state];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
