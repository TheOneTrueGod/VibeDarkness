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

        $hostTick = isset($latestFingerprint['tick']) ? (int) $latestFingerprint['tick'] : null;
        $hostFingerprint = isset($latestFingerprint['fp']) && is_string($latestFingerprint['fp'])
            ? $latestFingerprint['fp']
            : null;

        // Keep heartbeat semantics aligned with AppendOrderHandler while paused:
        // if the newest snapshot is waiting for orders at T, the last completed tick is T-1.
        $pausedAtTick = isset($expectingData['pausedAtTick']) ? (int) $expectingData['pausedAtTick'] : null;
        if ($pausedAtTick !== null && $pausedAtTick > 0 && $hostTick !== null && $hostTick >= $pausedAtTick) {
            $hostTick = $pausedAtTick - 1;
            $atTickFp = $storage->getFingerprintsRange($lobbyId, $gameId, $hostTick, $hostTick);
            if (count($atTickFp) > 0 && isset($atTickFp[0]['fp']) && is_string($atTickFp[0]['fp'])) {
                $hostFingerprint = $atTickFp[0]['fp'];
            }
        }

        return [
            'success' => true,
            'heartbeatSeq' => $heartbeatSeq,
            'hostTick' => $hostTick,
            'hostFingerprint' => $hostFingerprint,
            'ordersTipTick' => $ordersTipTick >= 0 ? $ordersTipTick : null,
            'ordersRecordCount' => $ordersRecordCount,
            'pausedAtTick' => $pausedAtTick,
            'expectingFromPlayerIds' => $expectingData['expectingFromPlayerIds'] ?? [],
            'initialFingerprint' => $initialState['initialFingerprint'] ?? null,
        ];
    }
}
