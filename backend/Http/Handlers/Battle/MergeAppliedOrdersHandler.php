<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleLobbySyncServerLog;
use App\BattleStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;

/**
 * POST /api/lobbies/{id}/games/{gameId}/orders/merge-applied
 *
 * Host-only: moves finalized pending rows for one parallel batch tick into applied_orders.jsonl.
 */
class MergeAppliedOrdersHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        $batchAtTick = isset($data['batchAtTick']) ? (int) $data['batchAtTick'] : null;

        if ($playerId === '' || $batchAtTick === null || $batchAtTick < 1) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId and batchAtTick >= 1 are required'];
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
            return ['success' => false, 'error' => 'Only the host can merge pending orders'];
        }

        try {
            $storage = new BattleStorage();
            $result = $storage->mergeFinalizedPendingForBatch($lobbyId, $gameId, $batchAtTick);
            BattleLobbySyncServerLog::logMergeApplied($lobbyId, $gameId, $playerId, $batchAtTick, $storage);
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }

        return ['success' => true, 'merged' => $result['merged'], 'idHashes' => $result['appendedHashes']];
    }
}
