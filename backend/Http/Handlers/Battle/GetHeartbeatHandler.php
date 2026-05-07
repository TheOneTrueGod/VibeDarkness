<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;

class GetHeartbeatHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
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

        $storage = new BattleStorage();
        $latestFingerprint = $storage->getLatestFingerprint($lobbyId, $gameId);
        $ordersTipTick = $storage->getOrdersTipTick($lobbyId, $gameId);
        $ordersRecordCount = $storage->countOrderRecords($lobbyId, $gameId);
        $expectingData = $storage->getExpectingFromPlayerIdsAt($lobbyId, $gameId);
        $initialState = $storage->getInitialState($lobbyId, $gameId);

        return [
            'success' => true,
            'hostTick' => $latestFingerprint['tick'] ?? null,
            'hostFingerprint' => $latestFingerprint['fp'] ?? null,
            'ordersTipTick' => $ordersTipTick >= 0 ? $ordersTipTick : null,
            'ordersRecordCount' => $ordersRecordCount,
            'pausedAtTick' => $expectingData['pausedAtTick'] ?? null,
            'expectingFromPlayerIds' => $expectingData['expectingFromPlayerIds'] ?? [],
            'initialFingerprint' => $initialState['initialFingerprint'] ?? null,
        ];
    }
}
