<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

/**
 * GET /api/lobbies/{id}/games/{gameId}/snapshots
 * GET /api/lobbies/{id}/games/{gameId}/snapshots/{gameTick}
 *
 * Retrieve a checkpoint. File pattern: game_<gameId>_<gameTick>.json
 * If gameTick is provided, return that checkpoint; otherwise return the latest.
 * Query params: ?playerId=...
 * Returns: { success, snapshot: { gameTick, state, orders }, gameTick }
 */
class GetGameStateSnapshotHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $pathGameTick = $matches[3] ?? null;

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

        if ($pathGameTick !== null) {
            $gameTick = (int) $pathGameTick;
            $path = $dir . '/' . $prefix . $gameTick . $suffix;
            if (!is_file($path)) {
                return ['success' => true, 'snapshot' => null, 'gameTick' => $gameTick];
            }
            $data = json_decode(file_get_contents($path), true);
            return ['success' => true, 'snapshot' => $data, 'gameTick' => $gameTick];
        }

        if (!is_dir($dir)) {
            return ['success' => true, 'snapshot' => null, 'gameTick' => null];
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
            return ['success' => true, 'snapshot' => null, 'gameTick' => null];
        }

        $data = json_decode(file_get_contents($dir . '/' . $latestFile), true);
        return ['success' => true, 'snapshot' => $data, 'gameTick' => $latestTick];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
