<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\BattleSyncLogThreshold;
use App\LobbyLogStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

/**
 * HTTP handler: append one client order line to `orders.jsonl`.
 *
 * Quiescence invariant (same narrative as {@see BattleStorage::saveSnapshot} and
 * {@see BattleStorage::appendFingerprints}): when the engine is paused for orders, the authoritative
 * checkpoint fingerprint tick is `pauseAtTick - 1` or `pauseAtTick`. The snapshot file and
 * `fingerprints.jsonl` tail may temporarily disagree by about one tick while async writes land.
 *
 * This handler reads `pauseAtTick` from the newest snapshot's `waitingForOrders`, clamps the
 * fingerprint-derived completed tick against it, and uses `maxAllowedTick` slack so valid batch
 * orders are not spuriously rejected as `tick_in_past` or `tick_ahead_of_host` during that window.
 */
class AppendOrderHandler
{
    /**
     * Persist one diagnostic line under storage/lobbies/<id>/lobby_log.jsonl.
     * Does not participate in gameplay; swallow all errors.
     *
     * @param array<string, mixed> $telemetry
     */
    private static function logBattleAppendDiagnostic(
        string $lobbyId,
        string $gameId,
        string $playerId,
        int $requestedAtTick,
        string $unitId,
        ?string $abilityId,
        bool $appended,
        ?string $rejectedReason,
        array $telemetry = [],
        ?string $clientIdHash = null,
    ): void {
        try {
            $severity = $appended ? 'info' : 'warn';
            if (!BattleSyncLogThreshold::shouldLogBattleSyncEvent($severity)) {
                return;
            }
            $storage = new LobbyLogStorage();
            $message = $appended
                ? 'battle order appended'
                : (($rejectedReason !== null && $rejectedReason !== '')
                    ? "battle order not appended ({$rejectedReason})"
                    : 'battle order not appended (duplicate_id_hash)');
            $telemetryOut = array_merge($telemetry, [
                'kind' => 'battle_order_append',
                'gameId' => $gameId,
                'unitId' => $unitId,
                'abilityId' => $abilityId,
                'appended' => $appended,
                'rejectedReason' => $rejectedReason,
                'clientIdHash' => $clientIdHash,
            ]);
            $storage->append($lobbyId, [
                'playerId' => $playerId,
                'severity' => $severity,
                'tick' => $requestedAtTick,
                'message' => $message,
                'context' => $telemetryOut,
                'gameId' => $gameId,
                'origin' => 'server',
            ]);
        } catch (Throwable) {
        }
    }

    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        $atTick = $data['atTick'] ?? null;
        $order = $data['order'] ?? null;

        if ($playerId === '' || $atTick === null || !is_array($order)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId, atTick, and order are required'];
        }
        $unitId = isset($order['unitId']) ? (string) $order['unitId'] : '';
        if ($unitId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'order.unitId is required'];
        }
        $abilityId = isset($order['abilityId']) && is_string($order['abilityId']) ? $order['abilityId'] : null;
        $clientIdHash =
            isset($data['idHash']) && is_string($data['idHash']) && $data['idHash'] !== '' ? $data['idHash'] : null;
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        try {
            $storage = new BattleStorage();
            $requestedAtTick = (int) $atTick;
            $latestFingerprint = $storage->getLatestFingerprint($lobbyId, $gameId);
            $hostTick = isset($latestFingerprint['tick']) ? (int) $latestFingerprint['tick'] : -1;
            $latestSnapshot = $storage->getSnapshotAtOrBefore($lobbyId, $gameId, null);
            $pauseAtTick = null;
            if (is_array($latestSnapshot)) {
                $state = $latestSnapshot['state'] ?? null;
                if (is_array($state)) {
                    $waitingForOrders = $state['waitingForOrders'] ?? null;
                    if (is_array($waitingForOrders) && isset($waitingForOrders['atTick'])) {
                        $atTickValue = $waitingForOrders['atTick'];
                        if (is_int($atTickValue) || is_float($atTickValue) || (is_string($atTickValue) && is_numeric($atTickValue))) {
                            $pauseAtTick = (int) $atTickValue;
                        }
                    }
                }
            }
            // Checkpoint fingerprints can duplicate a tick with a second hash; `getLatestFingerprint`
            // uses the greatest tick in the file. When paused for orders at T, clamp so `tick_in_past`
            // cannot reject the batch at T if fp and snapshot momentarily disagree.
            if ($pauseAtTick !== null && $pauseAtTick > 0 && $hostTick >= 0) {
                $hostTick = min($hostTick, $pauseAtTick - 1);
            }
            // `getLatestFingerprint().tick` is the last completed sim tick. Valid player orders apply on a
            // future tick (typically `atTick === hostTick + 1` while paused for that batch). Orders at or
            // before `hostTick` target a turn the host has already finished — reject stale replays.
            // No fingerprint file yet (`hostTick < 0`): skip past check so first battle orders can land.
            if ($hostTick >= 0 && $requestedAtTick <= $hostTick) {
                $minAllowed = $hostTick + 1;
                self::logBattleAppendDiagnostic(
                    $lobbyId,
                    $gameId,
                    $playerId,
                    $requestedAtTick,
                    $unitId,
                    $abilityId,
                    false,
                    'tick_in_past',
                    [
                        'fpHostTickAfterClamp' => $hostTick,
                        'pauseAtTickFromSnapshot' => $pauseAtTick,
                        'minAllowedTick' => $minAllowed,
                    ],
                    $clientIdHash,
                );
                return [
                    'success' => true,
                    'appended' => false,
                    'rejectedReason' => 'tick_in_past',
                    'minAllowedTick' => $minAllowed,
                ];
            }
            // When paused for orders atTick T, fingerprints often lag at T−1 until the next tick completes.
            // Using hostTick+1 avoids falsely rejecting legitimate orders while async snapshot catch-up races.
            $maxAllowedTick = max($hostTick + 1, $pauseAtTick ?? -1);
            if ($requestedAtTick > $maxAllowedTick) {
                self::logBattleAppendDiagnostic(
                    $lobbyId,
                    $gameId,
                    $playerId,
                    $requestedAtTick,
                    $unitId,
                    $abilityId,
                    false,
                    'tick_ahead_of_host',
                    [
                        'fpHostTickAfterClamp' => $hostTick,
                        'pauseAtTickFromSnapshot' => $pauseAtTick,
                        'maxAllowedTick' => $maxAllowedTick,
                    ],
                    $clientIdHash,
                );
                return [
                    'success' => true,
                    'appended' => false,
                    'rejectedReason' => 'tick_ahead_of_host',
                    'maxAllowedTick' => $maxAllowedTick,
                ];
            }

            if ($latestSnapshot !== null) {
                $stateForOwner = $latestSnapshot['state'] ?? null;
                if (is_array($stateForOwner)) {
                    $owner = BattleStorage::resolveUnitOwnerIdFromState($stateForOwner, $unitId, $requestedAtTick);
                    if ($owner === null) {
                        self::logBattleAppendDiagnostic(
                            $lobbyId,
                            $gameId,
                            $playerId,
                            $requestedAtTick,
                            $unitId,
                            $abilityId,
                            false,
                            'unknown_unit',
                            ['resolvedOwnerId' => null],
                            $clientIdHash,
                        );
                        return [
                            'success' => true,
                            'appended' => false,
                            'rejectedReason' => 'unknown_unit',
                        ];
                    }
                    if ($owner !== $playerId) {
                        self::logBattleAppendDiagnostic(
                            $lobbyId,
                            $gameId,
                            $playerId,
                            $requestedAtTick,
                            $unitId,
                            $abilityId,
                            false,
                            'not_unit_owner',
                            ['resolvedOwnerId' => $owner],
                            $clientIdHash,
                        );
                        return [
                            'success' => true,
                            'appended' => false,
                            'rejectedReason' => 'not_unit_owner',
                        ];
                    }
                }
            }

            $record = [
                'atTick' => $requestedAtTick,
                'playerId' => $playerId,
                'order' => $order,
            ];
            if (isset($data['idHash']) && is_string($data['idHash']) && $data['idHash'] !== '') {
                $record['idHash'] = $data['idHash'];
            }
            if (isset($data['ts'])) {
                $record['ts'] = (int) $data['ts'];
            }
            $appended = $storage->appendOrder($lobbyId, $gameId, $record);
            self::logBattleAppendDiagnostic(
                $lobbyId,
                $gameId,
                $playerId,
                $requestedAtTick,
                $unitId,
                $abilityId,
                $appended,
                null,
                [
                    'fpHostTickAfterClamp' => $hostTick,
                    'pauseAtTickFromSnapshot' => $pauseAtTick,
                ],
                $clientIdHash,
            );
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }

        return ['success' => true, 'appended' => $appended];
    }
}
