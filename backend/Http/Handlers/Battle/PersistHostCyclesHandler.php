<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleLobbySyncServerLog;
use App\BattleStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;

/**
 * POST /api/lobbies/{id}/games/{gameId}/persist-cycles
 *
 * Host-only envelope: optional pause snapshot, then pending-order appends (same accept window as
 * {@see AppendOrderHandler}), then merge-applied for requested batch ticks — one request so
 * playahead catch-up is not a serial round-trip per cycle (lobby 97305C: disk hostTick 224 → 329).
 */
class PersistHostCyclesHandler
{
    /**
     * Max `orders` rows per envelope. Keep in sync with `BATTLE_NET_MAX_DEFERRED_ORDERS`
     * in `app/js/games/minion_battles/game/battlenet/constants.ts`.
     */
    public const MAX_ORDERS = 32;

    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        if ($playerId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId is required'];
        }
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }
        $lobby = $manager->getLobby($lobbyId);
        if ($lobby === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Lobby not found'];
        }
        if (!$manager->isBattleRouteForActiveGame($lobbyId, $gameId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Lobby game id does not match route'];
        }
        if ($lobby->getHostId() !== $playerId) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Only the host can persist cycles'];
        }

        $snapshotIn = $data['snapshot'] ?? null;
        $ordersIn = $data['orders'] ?? [];
        $mergeIn = $data['mergeBatchTicks'] ?? [];
        if ($snapshotIn !== null && !is_array($snapshotIn)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'snapshot must be an object'];
        }
        if (!is_array($ordersIn)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'orders must be an array'];
        }
        if (!is_array($mergeIn)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'mergeBatchTicks must be an array'];
        }
        if (count($ordersIn) > self::MAX_ORDERS) {
            http_response_code(400);
            return ['success' => false, 'error' => 'orders exceeds max ' . self::MAX_ORDERS];
        }

        $parsedOrders = [];
        foreach ($ordersIn as $row) {
            if (!is_array($row)) {
                http_response_code(400);
                return ['success' => false, 'error' => 'each order must be an object'];
            }
            $atTick = $row['atTick'] ?? null;
            $order = $row['order'] ?? null;
            if ($atTick === null || !is_array($order)) {
                http_response_code(400);
                return ['success' => false, 'error' => 'each order requires atTick and order'];
            }
            $unitId = isset($order['unitId']) ? (string) $order['unitId'] : '';
            if ($unitId === '') {
                http_response_code(400);
                return ['success' => false, 'error' => 'order.unitId is required'];
            }
            $idHash =
                isset($row['idHash']) && is_string($row['idHash']) && $row['idHash'] !== ''
                    ? $row['idHash']
                    : null;
            $parsedOrders[] = [
                'atTick' => (int) $atTick,
                'order' => $order,
                'idHash' => $idHash,
            ];
        }

        $mergeBatchTicks = [];
        foreach ($mergeIn as $tickRaw) {
            if (!is_int($tickRaw) && !is_float($tickRaw) && !(is_string($tickRaw) && is_numeric($tickRaw))) {
                http_response_code(400);
                return ['success' => false, 'error' => 'mergeBatchTicks entries must be numbers'];
            }
            $tick = (int) $tickRaw;
            if ($tick < 1) {
                http_response_code(400);
                return ['success' => false, 'error' => 'mergeBatchTicks entries must be >= 1'];
            }
            $mergeBatchTicks[] = $tick;
        }

        $snapshotTickOut = null;
        $acceptedIdHashes = [];
        $acceptedAtTicks = [];
        $rejectedReason = null;
        $rejectedIdHash = null;
        $hostTickOut = null;
        $hostFingerprintOut = null;
        $maxAllowedTick = null;
        $minAllowedTick = null;
        $mergedTicks = [];

        try {
            $storage = new BattleStorage();

            if (is_array($snapshotIn)) {
                $tickRaw = $snapshotIn['tick'] ?? ($snapshotIn['gameTick'] ?? null);
                $state = $snapshotIn['state'] ?? null;
                if ($tickRaw === null || !is_array($state)) {
                    http_response_code(400);
                    return ['success' => false, 'error' => 'snapshot requires tick and state'];
                }
                $checkpointFingerprint = '';
                if (isset($snapshotIn['checkpointFingerprint']) && is_string($snapshotIn['checkpointFingerprint'])
                    && $snapshotIn['checkpointFingerprint'] !== ''
                ) {
                    $checkpointFingerprint = $snapshotIn['checkpointFingerprint'];
                }
                $checkpointFingerprintPaused = false;
                if (array_key_exists('checkpointFingerprintPaused', $snapshotIn)
                    && is_bool($snapshotIn['checkpointFingerprintPaused'])
                ) {
                    $checkpointFingerprintPaused = $snapshotIn['checkpointFingerprintPaused'];
                }
                $snapshotTickOut = SaveSnapshotHandler::writeHostSnapshot(
                    $storage,
                    $lobbyId,
                    $gameId,
                    $playerId,
                    (int) $tickRaw,
                    $state,
                    $checkpointFingerprint,
                    $checkpointFingerprintPaused,
                );
            }

            foreach ($parsedOrders as $row) {
                $result = AppendOrderAccept::tryAppend($storage, $lobbyId, $gameId, $playerId, [
                    'atTick' => $row['atTick'],
                    'order' => $row['order'],
                    'idHash' => $row['idHash'],
                ]);
                $hostTickOut = $result['hostTick'];
                $hostFingerprintOut = $result['hostFingerprint'];
                if (isset($result['maxAllowedTick'])) {
                    $maxAllowedTick = $result['maxAllowedTick'];
                }
                if (isset($result['minAllowedTick'])) {
                    $minAllowedTick = $result['minAllowedTick'];
                }
                if ($result['rejectedReason'] !== null) {
                    $rejectedReason = $result['rejectedReason'];
                    $rejectedIdHash = $result['idHash'];
                    break;
                }
                $landedHash = $result['idHash'];
                if ($landedHash !== null && $landedHash !== '') {
                    $acceptedIdHashes[] = $landedHash;
                    $acceptedAtTicks[] = $row['atTick'];
                }
            }

            $acceptedTickSet = array_fill_keys($acceptedAtTicks, true);
            $mergeOnce = [];
            foreach ($mergeBatchTicks as $batchAtTick) {
                if (!isset($acceptedTickSet[$batchAtTick])) {
                    continue;
                }
                if (isset($mergeOnce[$batchAtTick])) {
                    continue;
                }
                $mergeOnce[$batchAtTick] = true;
                $storage->mergeFinalizedPendingForBatch($lobbyId, $gameId, $batchAtTick);
                BattleLobbySyncServerLog::logMergeApplied($lobbyId, $gameId, $playerId, $batchAtTick, $storage);
                $mergedTicks[] = $batchAtTick;
            }

            $resolved = $storage->resolveLastCompletedTickAndFingerprint($lobbyId, $gameId);
            if ($resolved['lastCompleted'] !== null) {
                $hostTickOut = (int) $resolved['lastCompleted'];
            }
            if (is_string($resolved['fingerprint']) && $resolved['fingerprint'] !== '') {
                $hostFingerprintOut = $resolved['fingerprint'];
            }
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }

        $out = [
            'success' => true,
            'acceptedIdHashes' => $acceptedIdHashes,
            'rejectedReason' => $rejectedReason,
            'rejectedIdHash' => $rejectedIdHash,
            'hostTick' => $hostTickOut,
            'hostFingerprint' => $hostFingerprintOut,
            'snapshotTick' => $snapshotTickOut,
            'mergedTicks' => $mergedTicks,
        ];
        if ($maxAllowedTick !== null) {
            $out['maxAllowedTick'] = $maxAllowedTick;
        }
        if ($minAllowedTick !== null) {
            $out['minAllowedTick'] = $minAllowedTick;
        }

        return $out;
    }
}
