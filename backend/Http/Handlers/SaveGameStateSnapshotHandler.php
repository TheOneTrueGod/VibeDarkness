<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

/**
 * POST /api/lobbies/{id}/games/{gameId}/snapshots
 *
 * Host saves a checkpoint at a specific game tick.
 * Body: { playerId, gameTick, state, orders? }
 * Saves to storage as game_<gameId>_<gameTick>.json
 */
class SaveGameStateSnapshotHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = $data['playerId'] ?? null;
        $gameTick = $data['gameTick'] ?? null;
        $state = $data['state'] ?? null;
        $orders = $data['orders'] ?? [];

        if (!$playerId || $gameTick === null || !is_array($state)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId, gameTick, and state are required'];
        }

        $gameTick = (int) $gameTick;
        if (!is_array($orders)) {
            $orders = [];
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
            return ['success' => false, 'error' => 'Only the host can save checkpoints'];
        }

        $dir = self::getGameDir($lobbyId, $gameId);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        $path = $dir . '/game_' . $gameId . '_' . $gameTick . '.json';
        $payload = ['gameTick' => $gameTick, 'state' => $state, 'orders' => $orders];
        file_put_contents($path, json_encode($payload, JSON_PRETTY_PRINT));

        return ['success' => true, 'gameTick' => $gameTick];
    }

    private static function getGameDir(string $lobbyId, string $gameId): string
    {
        return dirname(__DIR__, 3) . '/storage/lobbies/' . $lobbyId . '/game_' . $gameId;
    }
}
