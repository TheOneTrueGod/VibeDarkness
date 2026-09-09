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
 * Uses {@see BattleStorage::resolveLastCompletedTickAndFingerprint} (same as heartbeat) for the
 * authoritative last completed tick vs `waitingForOrders.atTick`. `maxAllowedTick` slack avoids
 * rejecting valid batch rows while snapshot and fingerprint streams race briefly.
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
        if (!$manager->isBattleRouteForActiveGame($lobbyId, $gameId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Lobby game id does not match route'];
        }
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            self::logBattleAppendDiagnostic(
                $lobbyId,
                $gameId,
                $playerId,
                (int) $atTick,
                $unitId,
                $abilityId,
                false,
                'player_not_in_lobby',
                [],
                $clientIdHash,
            );
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        try {
            $storage = new BattleStorage();
            $requestedAtTick = (int) $atTick;
            $appendPayload = [
                'atTick' => $requestedAtTick,
                'order' => $order,
                'idHash' => $clientIdHash,
            ];
            if (isset($data['ts'])) {
                $appendPayload['ts'] = (int) $data['ts'];
            }
            if (isset($data['finalized'])) {
                $appendPayload['finalized'] = (bool) $data['finalized'];
            }
            if (isset($data['pendingLineId']) && is_string($data['pendingLineId']) && $data['pendingLineId'] !== '') {
                $appendPayload['pendingLineId'] = $data['pendingLineId'];
            }
            $result = AppendOrderAccept::tryAppend($storage, $lobbyId, $gameId, $playerId, $appendPayload);
            self::logBattleAppendDiagnostic(
                $lobbyId,
                $gameId,
                $playerId,
                $requestedAtTick,
                $unitId,
                $abilityId,
                $result['appended'],
                $result['rejectedReason'],
                $result['telemetry'],
                $clientIdHash,
            );
            if ($result['rejectedReason'] !== null) {
                $out = [
                    'success' => true,
                    'appended' => false,
                    'idHash' => $clientIdHash,
                    'rejectedReason' => $result['rejectedReason'],
                    'hostTick' => $result['hostTick'],
                    'hostFingerprint' => $result['hostFingerprint'],
                ];
                if (isset($result['maxAllowedTick'])) {
                    $out['maxAllowedTick'] = $result['maxAllowedTick'];
                }
                if (isset($result['minAllowedTick'])) {
                    $out['minAllowedTick'] = $result['minAllowedTick'];
                }

                return $out;
            }
            $appended = $result['appended'];
            $pendingLineId = $result['pendingLineId'];
            $hostTickOut = $result['hostTick'];
            $hostFingerprint = $result['hostFingerprint'];
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }

        return [
            'success' => true,
            'appended' => $appended,
            'idHash' => $clientIdHash,
            'pendingLineId' => $pendingLineId,
            'hostTick' => $hostTickOut,
            'hostFingerprint' => $hostFingerprint,
        ];
    }
}
