<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

/**
 * GET /api/lobbies/{id}/games/{gameId}/snapshots
 * GET /api/lobbies/{id}/games/{gameId}/snapshots/{index}
 *
 * Retrieve a game state snapshot. If no index, returns the latest.
 * Query params: ?playerId=...
 */
class GetGameStateSnapshotHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $index = $matches[3] ?? null;

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

        if ($index !== null) {
            // Specific index
            $path = $dir . '/gamestate_' . intval($index) . '.json';
            if (!is_file($path)) {
                return ['success' => true, 'snapshot' => null, 'index' => intval($index)];
            }
            $data = json_decode(file_get_contents($path), true);
            return ['success' => true, 'snapshot' => $data, 'index' => intval($index)];
        }

        // Find latest snapshot
        if (!is_dir($dir)) {
            return ['success' => true, 'snapshot' => null, 'index' => null];
        }

        $latest = null;
        $latestIndex = -1;
        foreach (scandir($dir) as $file) {
            if (preg_match('/^gamestate_(\d+)\.json$/', $file, $m)) {
                $i = intval($m[1]);
                if ($i > $latestIndex) {
                    $latestIndex = $i;
                    $latest = $file;
                }
            }
        }

        if ($latest === null) {
            return ['success' => true, 'snapshot' => null, 'index' => null];
        }

        $data = json_decode(file_get_contents($dir . '/' . $latest), true);
        return ['success' => true, 'snapshot' => $data, 'index' => $latestIndex];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
