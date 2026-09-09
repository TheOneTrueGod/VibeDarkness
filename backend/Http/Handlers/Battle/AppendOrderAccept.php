<?php

namespace App\Http\Handlers\Battle;

use App\BattleStorage;

/**
 * Shared pending-order accept window for {@see AppendOrderHandler} and {@see PersistHostCyclesHandler}.
 *
 * Must stay identical to POST /orders: `tick_in_past`, `tick_ahead_of_host` (`maxAllowedTick`),
 * and unit-owner checks against the latest snapshot.
 */
final class AppendOrderAccept
{
    /**
     * @param array{
     *   atTick: int,
     *   order: array<string, mixed>,
     *   idHash?: string|null,
     *   ts?: int|null,
     *   finalized?: bool|null,
     *   pendingLineId?: string|null
     * } $payload
     * @return array{
     *   appended: bool,
     *   rejectedReason: string|null,
     *   idHash: string|null,
     *   pendingLineId: string|null,
     *   hostTick: int|null,
     *   hostFingerprint: string|null,
     *   maxAllowedTick?: int,
     *   minAllowedTick?: int,
     *   telemetry: array<string, mixed>
     * }
     */
    public static function tryAppend(
        BattleStorage $storage,
        string $lobbyId,
        string $gameId,
        string $playerId,
        array $payload,
    ): array {
        $requestedAtTick = (int) $payload['atTick'];
        $order = $payload['order'];
        $clientIdHash =
            isset($payload['idHash']) && is_string($payload['idHash']) && $payload['idHash'] !== ''
                ? $payload['idHash']
                : null;

        $resolved = $storage->resolveLastCompletedTickAndFingerprint($lobbyId, $gameId);
        $pauseAtTick = $resolved['orderBatchAtTick'];

        $hostTick = $resolved['lastCompleted'] !== null ? (int) $resolved['lastCompleted'] : -1;
        $hostFingerprint = $resolved['fingerprint'];
        $latestSnapshot = $storage->getSnapshotAtOrBefore($lobbyId, $gameId, null);
        $hostTickOut = $hostTick >= 0 ? $hostTick : null;
        $telemetry = [
            'fpHostTickAfterClamp' => $hostTick,
            'pauseAtTickFromSnapshot' => $pauseAtTick,
        ];

        // `getLatestFingerprint().tick` is the last completed sim tick. Valid player orders apply on a
        // future tick (typically `atTick === hostTick + 1` while paused for that batch). Orders at or
        // before `hostTick` target a turn the host has already finished — reject stale replays.
        // No fingerprint file yet (`hostTick < 0`): skip past check so first battle orders can land.
        if ($hostTick >= 0 && $requestedAtTick <= $hostTick) {
            $minAllowed = $hostTick + 1;

            return [
                'appended' => false,
                'rejectedReason' => 'tick_in_past',
                'idHash' => $clientIdHash,
                'pendingLineId' => null,
                'hostTick' => $hostTickOut,
                'hostFingerprint' => $hostFingerprint,
                'minAllowedTick' => $minAllowed,
                'telemetry' => array_merge($telemetry, ['minAllowedTick' => $minAllowed]),
            ];
        }
        // When paused for orders atTick T, fingerprints often lag at T−1 until the next tick completes.
        // Using hostTick+1 avoids falsely rejecting legitimate orders while async snapshot catch-up races.
        $maxAllowedTick = max($hostTick + 1, $pauseAtTick ?? -1);
        if ($requestedAtTick > $maxAllowedTick) {
            return [
                'appended' => false,
                'rejectedReason' => 'tick_ahead_of_host',
                'idHash' => $clientIdHash,
                'pendingLineId' => null,
                'hostTick' => $hostTickOut,
                'hostFingerprint' => $hostFingerprint,
                'maxAllowedTick' => $maxAllowedTick,
                'telemetry' => array_merge($telemetry, ['maxAllowedTick' => $maxAllowedTick]),
            ];
        }

        if ($latestSnapshot !== null) {
            $stateForOwner = $latestSnapshot['state'] ?? null;
            if (is_array($stateForOwner)) {
                $owner = BattleStorage::resolveUnitOwnerIdFromState($stateForOwner, (string) ($order['unitId'] ?? ''), $requestedAtTick);
                if ($owner === null) {
                    return [
                        'appended' => false,
                        'rejectedReason' => 'unknown_unit',
                        'idHash' => $clientIdHash,
                        'pendingLineId' => null,
                        'hostTick' => $hostTickOut,
                        'hostFingerprint' => $hostFingerprint,
                        'telemetry' => array_merge($telemetry, ['resolvedOwnerId' => null]),
                    ];
                }
                if ($owner !== $playerId) {
                    return [
                        'appended' => false,
                        'rejectedReason' => 'not_unit_owner',
                        'idHash' => $clientIdHash,
                        'pendingLineId' => null,
                        'hostTick' => $hostTickOut,
                        'hostFingerprint' => $hostFingerprint,
                        'telemetry' => array_merge($telemetry, ['resolvedOwnerId' => $owner]),
                    ];
                }
            }
        }

        $record = [
            'atTick' => $requestedAtTick,
            'playerId' => $playerId,
            'order' => $order,
        ];
        if ($clientIdHash !== null) {
            $record['idHash'] = $clientIdHash;
        }
        if (isset($payload['ts']) && $payload['ts'] !== null) {
            $record['ts'] = (int) $payload['ts'];
        }
        if (array_key_exists('finalized', $payload) && $payload['finalized'] !== null) {
            $record['finalized'] = (bool) $payload['finalized'];
        }
        if (isset($payload['pendingLineId']) && is_string($payload['pendingLineId']) && $payload['pendingLineId'] !== '') {
            $record['pendingLineId'] = $payload['pendingLineId'];
        }
        if ($hostFingerprint !== null && is_string($hostFingerprint) && $hostFingerprint !== '') {
            $record['basisFingerprint'] = $hostFingerprint;
        }
        $appendResult = $storage->appendOrder($lobbyId, $gameId, $record);

        return [
            'appended' => $appendResult['appended'],
            'rejectedReason' => null,
            'idHash' => $clientIdHash,
            'pendingLineId' => $appendResult['pendingLineId'],
            'hostTick' => $hostTickOut,
            'hostFingerprint' => $hostFingerprint,
            'telemetry' => $telemetry,
        ];
    }
}
