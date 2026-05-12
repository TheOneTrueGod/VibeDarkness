<?php

namespace App;

use Throwable;

/**
 * Server-side battle sync diagnostics appended to `storage/lobbies/<lobbyId>/lobby_log.jsonl`.
 * Gated by {@see BattleSyncLogThreshold} (same as {@see AppendOrderHandler} battle lines).
 */
final class BattleLobbySyncServerLog
{
    /**
     * @param array<string, mixed>|null $state Serialized game state root (snapshot `state` or equivalent).
     *
     * @return array{
     *   atTick: int|null,
     *   waiterCount: int,
     *   ownerIds: list<string>,
     *   unitIds: list<string>
     * }
     */
    public static function waitingForOrdersSummaryFromState(?array $state): array
    {
        if ($state === null) {
            return ['atTick' => null, 'waiterCount' => 0, 'ownerIds' => [], 'unitIds' => []];
        }
        $wfo = $state['waitingForOrders'] ?? null;
        if (!is_array($wfo)) {
            return ['atTick' => null, 'waiterCount' => 0, 'ownerIds' => [], 'unitIds' => []];
        }
        $rawAt = $wfo['atTick'] ?? null;
        $atTick = null;
        if (is_int($rawAt) || is_float($rawAt) || (is_string($rawAt) && is_numeric($rawAt))) {
            $atTick = (int) $rawAt;
        }
        $waiters = $wfo['waiters'] ?? null;
        if (!is_array($waiters)) {
            return ['atTick' => $atTick, 'waiterCount' => 0, 'ownerIds' => [], 'unitIds' => []];
        }
        $ownerIds = [];
        $unitIds = [];
        foreach ($waiters as $w) {
            if (!is_array($w)) {
                continue;
            }
            if (isset($w['ownerId']) && is_string($w['ownerId']) && $w['ownerId'] !== '') {
                $ownerIds[] = $w['ownerId'];
            }
            if (isset($w['unitId']) && is_string($w['unitId']) && $w['unitId'] !== '') {
                $unitIds[] = $w['unitId'];
            }
        }

        return [
            'atTick' => $atTick,
            'waiterCount' => count($waiters),
            'ownerIds' => array_values(array_unique($ownerIds)),
            'unitIds' => array_values(array_unique($unitIds)),
        ];
    }

    public static function logMergeApplied(string $lobbyId, string $gameId, string $playerId, int $batchAtTick, BattleStorage $storage): void
    {
        if (!BattleSyncLogThreshold::shouldLogBattleSyncEvent('info')) {
            return;
        }
        try {
            $snap = $storage->getSnapshotAtOrBefore($lobbyId, $gameId, null);
            $resolved = $storage->resolveLastCompletedTickAndFingerprint($lobbyId, $gameId);
            $snapshotTick = null;
            $stateArr = null;
            if (is_array($snap)) {
                $st = (int) ($snap['tick'] ?? -1);
                $snapshotTick = $st >= 0 ? $st : null;
                $inner = $snap['state'] ?? null;
                $stateArr = is_array($inner) ? $inner : null;
            }
            $summary = self::waitingForOrdersSummaryFromState($stateArr);
            $stateGameTick = null;
            if ($stateArr !== null) {
                $gt = $stateArr['gameTick'] ?? null;
                if (is_int($gt) || is_float($gt) || (is_string($gt) && is_numeric($gt))) {
                    $stateGameTick = (int) $gt;
                }
            }

            $log = new LobbyLogStorage();
            $log->append($lobbyId, [
                'playerId' => $playerId,
                'severity' => 'info',
                'tick' => $batchAtTick,
                'message' => 'battle merge-applied',
                'context' => [
                    'kind' => 'battle_merge_applied',
                    'gameId' => $gameId,
                    'batchAtTick' => $batchAtTick,
                    'snapshotTick' => $snapshotTick,
                    'stateGameTick' => $stateGameTick,
                    'resolvedLastCompleted' => $resolved['lastCompleted'],
                    'resolvedOrderBatchAtTick' => $resolved['orderBatchAtTick'] ?? null,
                    'waitingForOrdersSummary' => $summary,
                ],
                'gameId' => $gameId,
                'origin' => 'server',
            ]);
        } catch (Throwable) {
        }
    }

    /**
     * @param array<string, mixed> $state Snapshot payload `state` (same shape passed to {@see BattleStorage::saveSnapshot}).
     */
    public static function logSaveSnapshot(
        string $lobbyId,
        string $gameId,
        string $playerId,
        int $snapshotTick,
        array $state,
        BattleStorage $storage,
    ): void {
        if (!BattleSyncLogThreshold::shouldLogBattleSyncEvent('info')) {
            return;
        }
        try {
            $summary = self::waitingForOrdersSummaryFromState($state);
            $stateGameTick = null;
            $gt = $state['gameTick'] ?? null;
            if (is_int($gt) || is_float($gt) || (is_string($gt) && is_numeric($gt))) {
                $stateGameTick = (int) $gt;
            }
            $resolved = $storage->resolveLastCompletedTickAndFingerprint($lobbyId, $gameId);

            $log = new LobbyLogStorage();
            $log->append($lobbyId, [
                'playerId' => $playerId,
                'severity' => 'info',
                'tick' => $snapshotTick,
                'message' => 'battle saveSnapshot',
                'context' => [
                    'kind' => 'battle_save_snapshot',
                    'gameId' => $gameId,
                    'snapshotTick' => $snapshotTick,
                    'stateGameTick' => $stateGameTick,
                    'batchAtTick' => $summary['atTick'],
                    'resolvedLastCompleted' => $resolved['lastCompleted'],
                    'resolvedOrderBatchAtTick' => $resolved['orderBatchAtTick'] ?? null,
                    'waitingForOrdersSummary' => $summary,
                ],
                'gameId' => $gameId,
                'origin' => 'server',
            ]);
        } catch (Throwable) {
        }
    }
}
