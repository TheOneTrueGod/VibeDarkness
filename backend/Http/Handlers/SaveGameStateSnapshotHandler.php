<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

/**
 * POST /api/lobbies/{id}/games/{gameId}/snapshots
 *
 * Host saves an indexed game state snapshot during battle pauses.
 * Body: { playerId, index, state }
 */
class SaveGameStateSnapshotHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = $data['playerId'] ?? null;
        $index = $data['index'] ?? null;
        $state = $data['state'] ?? null;

        if (!$playerId || $index === null || !is_array($state)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId, index, and state are required'];
        }

        // Verify player is host
        $lobby = $manager->getLobby($lobbyId);
        if ($lobby === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Lobby not found'];
        }
        $player = $lobby->getPlayer($playerId);
        if ($player === null || !$player->isHost()) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Only the host can save snapshots'];
        }

        // Save to storage/lobbies/<lobbyId>/game_<gameId>/gamestate_<index>.json
        $dir = self::getGameDir($lobbyId, $gameId);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $path = $dir . '/gamestate_' . intval($index) . '.json';
        file_put_contents($path, json_encode($state, JSON_PRETTY_PRINT));

        return ['success' => true];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
