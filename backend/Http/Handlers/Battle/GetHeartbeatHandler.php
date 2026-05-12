<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;

/**
 * `hostTick` — last fully completed sim tick (matches {@see BattleStorage::resolveLastCompletedTickAndFingerprint}).
 * `hostPaused` — `paused` flag from the fingerprints.jsonl row for that tick (story/deferred/general pause signal).
 * `pausedAtTick` — when non-null, alias of `orderBatchAtTick` (parallel batch = `waitingForOrders.atTick`).
 */
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
        if (!$manager->isBattleRouteForActiveGame($lobbyId, $gameId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Lobby game id does not match route'];
        }

        $storage = new BattleStorage();
        $gameDir = $storage->getGameDir($lobbyId, $gameId);
        $fpMtime = is_file($gameDir . '/fingerprints.jsonl')
            ? @filemtime($gameDir . '/fingerprints.jsonl')
            : 0;
        $fpMtime = $fpMtime !== false ? (int) $fpMtime : 0;
        $pendMtime = is_file($gameDir . '/pending_orders.jsonl')
            ? @filemtime($gameDir . '/pending_orders.jsonl')
            : 0;
        $pendMtime = $pendMtime !== false ? (int) $pendMtime : 0;
        $apMtime = is_file($gameDir . '/applied_orders.jsonl')
            ? @filemtime($gameDir . '/applied_orders.jsonl')
            : 0;
        $apMtime = $apMtime !== false ? (int) $apMtime : 0;
        $ordMtime = max($pendMtime, $apMtime);
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

        $gameTickQuery = isset($_GET['gameTick']) && $_GET['gameTick'] !== '' ? (int) $_GET['gameTick'] : null;

        $resolved = $storage->resolveLastCompletedTickAndFingerprint($lobbyId, $gameId);
        $ordersTipTick = $storage->getOrdersTipTick($lobbyId, $gameId);
        $ordersRecordCount = $storage->countOrderRecords($lobbyId, $gameId);
        $expectingData = $storage->getExpectingFromPlayerIdsAt($lobbyId, $gameId);
        $initialState = $storage->getInitialState($lobbyId, $gameId);

        $hostTick = $resolved['lastCompleted'];
        $hostFingerprint = $resolved['fingerprint'];

        $hostPaused = false;
        if ($hostTick !== null && $hostTick >= 0 && is_string($hostFingerprint)) {
            $row = $storage->getFingerprintsRange($lobbyId, $gameId, $hostTick, $hostTick);
            if ($row !== []) {
                $hostPaused = (bool) $row[0]['paused'];
            }
        }

        /** While paused for parallel orders (`expectingFromPlayerIds` nonempty), expose batch tick matching {@see AppendOrderHandler} pause clamp. */
        $orderBatchAtTick = null;
        $pausedAtTick = null;
        if (
            $expectingData !== null
            && $resolved['orderBatchAtTick'] !== null
            && $resolved['orderBatchAtTick'] > 0
        ) {
            $orderBatchAtTick = $resolved['orderBatchAtTick'];
            $pausedAtTick = $orderBatchAtTick;
        }

        $sinceOrders = ($hostTick !== null && $hostTick >= 0) ? max(0, $hostTick - 2) : 0;
        $orderSplit = $storage->getOrdersRangeSplit($lobbyId, $gameId, $sinceOrders, null);

        $appliedOrdersAtTick = [
            'atTick' => $orderBatchAtTick,
            'orders' => [],
        ];
        if ($orderBatchAtTick !== null) {
            foreach ($orderSplit['applied'] as $row) {
                if ((int) ($row['atTick'] ?? -1) === (int) $orderBatchAtTick) {
                    $appliedOrdersAtTick['orders'][] = $row;
                }
            }
        }

        $requestedTick = $gameTickQuery;
        $requestedHash = null;
        if ($requestedTick !== null && $requestedTick >= 0) {
            $fpRows = $storage->getFingerprintsRange($lobbyId, $gameId, $requestedTick, $requestedTick);
            if ($fpRows !== []) {
                $requestedHash = $fpRows[0]['fp'];
            }
        }

        return [
            'success' => true,
            'heartbeatSeq' => $heartbeatSeq,
            'hostTick' => $hostTick,
            'hostFingerprint' => $hostFingerprint,
            'hostPaused' => $hostPaused,
            'ordersTipTick' => $ordersTipTick >= 0 ? $ordersTipTick : null,
            'ordersRecordCount' => $ordersRecordCount,
            'orderBatchAtTick' => $orderBatchAtTick,
            'pausedAtTick' => $pausedAtTick,
            'expectingFromPlayerIds' => $expectingData !== null ? $expectingData['expectingFromPlayerIds'] : [],
            'initialFingerprint' => $initialState['initialFingerprint'] ?? null,
            'latestServerGameTick' => $hostTick,
            'latestServerGameHash' => $hostFingerprint,
            'gameTick' => $requestedTick,
            'gameHash' => $requestedHash,
            'pendingOrders' => $orderSplit['pending'],
            'appliedOrdersAtTick' => $appliedOrdersAtTick,
        ];
    }
}
