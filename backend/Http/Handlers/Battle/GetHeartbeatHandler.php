<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;

class GetHeartbeatHandler
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

        $storage = new BattleStorage();
        $gameDir = $storage->getGameDir($lobbyId, $gameId);
        $fpMtime = is_file($gameDir . '/fingerprints.jsonl')
            ? @filemtime($gameDir . '/fingerprints.jsonl')
            : 0;
        $fpMtime = $fpMtime !== false ? (int) $fpMtime : 0;
        $ordMtime = is_file($gameDir . '/orders.jsonl')
            ? @filemtime($gameDir . '/orders.jsonl')
            : 0;
        $ordMtime = $ordMtime !== false ? (int) $ordMtime : 0;
        $snapMtime = 0;
        $snapDir = $gameDir . '/snapshots';
        if (is_dir($snapDir)) {
            foreach (scandir($snapDir) ?: [] as $file) {
                if (!is_string($file)) {
                    continue;
                }
                if (!str_ends_with($file, '.json')) {
                    continue;
                }
                $name = substr($file, 0, -5);
                if ($name === '' || !ctype_digit($name)) {
                    continue;
                }
                $mt = @filemtime($snapDir . '/' . $file);
                if ($mt !== false && $mt > $snapMtime) {
                    $snapMtime = (int) $mt;
                }
            }
        }
        $heartbeatSeq = max($fpMtime, $ordMtime, $snapMtime);

        $latestFingerprint = $storage->getLatestFingerprint($lobbyId, $gameId);
        $ordersTipTick = $storage->getOrdersTipTick($lobbyId, $gameId);
        $ordersRecordCount = $storage->countOrderRecords($lobbyId, $gameId);
        $expectingData = $storage->getExpectingFromPlayerIdsAt($lobbyId, $gameId);
        $initialState = $storage->getInitialState($lobbyId, $gameId);

        return [
            'success' => true,
            'heartbeatSeq' => $heartbeatSeq,
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
