<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;

class GetFingerprintsRangeHandler
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
        if (!$manager->isBattleRouteForActiveGame($lobbyId, $gameId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Lobby game id does not match route'];
        }

        $fromTick = isset($_GET['fromTick']) && $_GET['fromTick'] !== '' ? (int) $_GET['fromTick'] : null;
        $toTick = isset($_GET['toTick']) && $_GET['toTick'] !== '' ? (int) $_GET['toTick'] : null;

        $storage = new BattleStorage();
        $fingerprints = $storage->getFingerprintsRange($lobbyId, $gameId, $fromTick, $toTick);

        return ['success' => true, 'fingerprints' => $fingerprints];
    }
}
