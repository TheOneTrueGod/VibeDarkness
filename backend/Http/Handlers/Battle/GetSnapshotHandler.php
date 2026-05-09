<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;

class GetSnapshotHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        header('Cache-Control: no-store, no-cache, must-revalidate');

        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $playerId = isset($_GET['playerId']) ? (string) $_GET['playerId'] : '';

        if ($playerId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId query param is required'];
        }
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        $atTick = isset($_GET['atTick']) && $_GET['atTick'] !== '' ? (int) $_GET['atTick'] : null;
        $storage = new BattleStorage();
        $snapshot = $storage->getSnapshotAtOrBefore($lobbyId, $gameId, $atTick);

        return ['success' => true, 'snapshot' => $snapshot];
    }
}
