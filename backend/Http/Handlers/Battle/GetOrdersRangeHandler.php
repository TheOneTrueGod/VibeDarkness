<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;

/**
 * `appliedOrders` is the `applied` slice of {@see BattleStorage::getOrdersRangeSplit} — same list as
 * {@see BattleStorage::getAppliedOrdersRangeForWire} for the same `sinceTick` / `untilTick`.
 */
class GetOrdersRangeHandler
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

        $sinceTick = isset($_GET['sinceTick']) && $_GET['sinceTick'] !== '' ? (int) $_GET['sinceTick'] : null;
        $untilTick = isset($_GET['untilTick']) && $_GET['untilTick'] !== '' ? (int) $_GET['untilTick'] : null;

        $storage = new BattleStorage();
        $split = $storage->getOrdersRangeSplit($lobbyId, $gameId, $sinceTick, $untilTick);

        return [
            'success' => true,
            'orders' => $split['orders'],
            'pendingOrders' => $split['pending'],
            'appliedOrders' => $split['applied'],
        ];
    }
}
