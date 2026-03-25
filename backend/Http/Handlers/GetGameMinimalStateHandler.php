<?php

namespace App\Http\Handlers;

use App\GameCheckpointFiles;
use App\GameStateSync;
use App\LobbyManager;
use App\AccountService;

/**
 * GET /api/lobbies/{id}/games/{gameId}/minimal
 *
 * Returns minimal sync state: gameTick, synchash, orders for the latest checkpoint
 * (or a specific checkpoint if checkpointGameTick is provided).
 * Query params: ?playerId=...&checkpointGameTick=... (optional)
 */
class GetGameMinimalStateHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];

        $playerId = $_GET['playerId'] ?? null;
        if (!$playerId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId query param is required'];
        }

        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        $dir = self::getGameDir($lobbyId, $gameId);
        $prefix = 'game_' . $gameId . '_';
        $suffix = '.json';

        $checkpointGameTick = isset($_GET['checkpointGameTick']) ? (int) $_GET['checkpointGameTick'] : null;

        if ($checkpointGameTick !== null) {
            $path = GameCheckpointFiles::resolveSnapshotPathForMinimal($dir, $gameId, $checkpointGameTick);
            if ($path === null || !is_file($path)) {
                return ['success' => true, 'gameTick' => null, 'synchash' => null, 'orders' => []];
            }
            $data = json_decode(file_get_contents($path), true);
            $gameTick = (int) ($data['gameTick'] ?? $checkpointGameTick);
            $synchash = $data['synchash'] ?? null;
            if ($synchash === null && isset($data['state']) && is_array($data['state'])) {
                $synchash = GameStateSync::computeSynchash($data['state']);
            }
            $orders = GameCheckpointFiles::mergeOrdersInCheckpointWindow($dir, $gameId, $checkpointGameTick);
            return ['success' => true, 'gameTick' => $gameTick, 'synchash' => $synchash, 'orders' => $orders];
        }

        if (!is_dir($dir)) {
            return ['success' => true, 'gameTick' => null, 'synchash' => null, 'orders' => []];
        }

        $latestTick = -1;
        $latestFile = null;
        foreach (scandir($dir) as $file) {
            if (strpos($file, $prefix) === 0 && substr($file, -strlen($suffix)) === $suffix) {
                $tickStr = substr($file, strlen($prefix), -strlen($suffix));
                if (ctype_digit($tickStr)) {
                    $t = (int) $tickStr;
                    if ($t > $latestTick) {
                        $latestTick = $t;
                        $latestFile = $file;
                    }
                }
            }
        }

        if ($latestFile === null) {
            return ['success' => true, 'gameTick' => null, 'synchash' => null, 'orders' => []];
        }

        $data = json_decode(file_get_contents($dir . '/' . $latestFile), true);
        $gameTick = (int) ($data['gameTick'] ?? $latestTick);
        $synchash = $data['synchash'] ?? null;
        if ($synchash === null && isset($data['state']) && is_array($data['state'])) {
            $synchash = GameStateSync::computeSynchash($data['state']);
        }
        $orders = $data['orders'] ?? [];

        return ['success' => true, 'gameTick' => $gameTick, 'synchash' => $synchash, 'orders' => $orders];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
