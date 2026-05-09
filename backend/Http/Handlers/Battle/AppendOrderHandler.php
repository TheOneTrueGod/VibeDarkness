<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;

class AppendOrderHandler
{
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
                return [
                    'success' => true,
                    'appended' => false,
                    'rejectedReason' => 'tick_in_past',
                    'minAllowedTick' => $hostTick + 1,
                ];
            }
            // When paused for orders atTick T, fingerprints often lag at T−1 until the next tick completes.
            // Using hostTick+1 avoids falsely rejecting legitimate orders while async snapshot catch-up races.
            $maxAllowedTick = max($hostTick + 1, $pauseAtTick ?? -1);
            if ($requestedAtTick > $maxAllowedTick) {
                return [
                    'success' => true,
                    'appended' => false,
                    'rejectedReason' => 'tick_ahead_of_host',
                    'maxAllowedTick' => $maxAllowedTick,
                ];
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
