<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;

/**
 * POST /api/lobbies/{id}/games/{gameId}/orders/reaction-claim
 *
 * Host-only: record one ACCEPTED co-op Reaction claim.
 *
 * Design decision (Step 15 of the Garden Heart + Reactions plan)
 * ---------------------------------------------------------------
 * The claim is stored IN THE STREAM THE ENGINE REPLAYS, not in a separate claims store: it is appended to
 * `pending_orders.jsonl` as a finalized order row whose body is `{ unitId, abilityId: 'reaction_claim',
 * endTurn: false, reactionClaim: { planeId } }`, at the plane's `atTick`. The ordinary host merge
 * (`orders/merge-applied`) later moves it to `applied_orders.jsonl` with the rest of that batch. Clients, late
 * joiners, resyncs and replays therefore rebuild every claim from the same `GET .../orders` read as every other
 * order (`BattleSession.applyRemoteOrders` routes it to `applyReactionClaim`), and the orders revision bump makes
 * peers refetch. A separate store would need its own fetch, merge, replay and checkpoint story and could drift.
 *
 * It is a DEDICATED endpoint, not `POST /orders` (`AppendOrderHandler` refuses claim rows):
 *  - only the host may record a claim, after validating it with the engine's `canClaimReaction`;
 *  - the host's reply "accepted" to the claimant is sent only after this endpoint returns `success: true`, so a
 *    claim that is not durably in the stream is a rejection;
 *  - it has none of `BattleNet.submitOrder`'s client-side early returns (recovering, awaiting ack, ahead of the
 *    host heartbeat, deferral): the host calls it directly through `BattleNet.recordReactionClaim`.
 * It reuses the order accept window (`AppendOrderAccept`: tick in the past / ahead of host, unit owner) so a claim
 * is accepted under exactly the rules of any other order for that tick. The row id is deterministic
 * (`BattleStorage::reactionClaimIdHash`), so recording the same claim twice is one row and still `success`.
 *
 * Body: { hostPlayerId, playerId (claimant, owns the unit), atTick, planeId, unitId }.
 * Reply: { success, idHash, rejectedReason? }. `success` is true only when the row is in the stream.
 */
class AppendReactionClaimHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $hostPlayerId = isset($data['hostPlayerId']) ? (string) $data['hostPlayerId'] : '';
        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        $unitId = isset($data['unitId']) ? (string) $data['unitId'] : '';
        $planeId = isset($data['planeId']) ? (string) $data['planeId'] : '';
        $atTick = $data['atTick'] ?? null;

        if ($hostPlayerId === '' || $playerId === '' || $unitId === '' || $planeId === '' || !is_numeric($atTick)) {
            http_response_code(400);
            return ['success' => false, 'idHash' => null, 'error' => 'hostPlayerId, playerId, unitId, planeId and atTick are required'];
        }
        if (!$manager->isPlayerInLobby($lobbyId, $hostPlayerId) || !$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'idHash' => null, 'error' => 'Player not in lobby'];
        }
        $lobby = $manager->getLobby($lobbyId);
        if ($lobby === null) {
            http_response_code(404);
            return ['success' => false, 'idHash' => null, 'error' => 'Lobby not found'];
        }
        if (!$manager->isBattleRouteForActiveGame($lobbyId, $gameId)) {
            http_response_code(403);
            return ['success' => false, 'idHash' => null, 'error' => 'Lobby game id does not match route'];
        }
        if ($lobby->getHostId() !== $hostPlayerId) {
            http_response_code(403);
            return ['success' => false, 'idHash' => null, 'error' => 'Only the host can record a reaction claim'];
        }

        try {
            $storage = new BattleStorage();
            $result = self::record($storage, $lobbyId, $gameId, $playerId, (int) $atTick, $planeId, $unitId);
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'idHash' => null, 'error' => $e->getMessage()];
        } catch (RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'idHash' => null, 'error' => $e->getMessage()];
        }

        return $result;
    }

    /**
     * Storage-level record (also what the PHP test drives, without HTTP).
     *
     * @return array{success:bool,idHash:string,rejectedReason?:string,pendingLineId?:?string}
     */
    public static function record(
        BattleStorage $storage,
        string $lobbyId,
        string $gameId,
        string $claimantPlayerId,
        int $atTick,
        string $planeId,
        string $unitId,
    ): array {
        $idHash = BattleStorage::reactionClaimIdHash($planeId, $unitId);
        $order = [
            'unitId' => $unitId,
            'abilityId' => 'reaction_claim',
            'targets' => [],
            'endTurn' => false,
            'reactionClaim' => ['planeId' => $planeId],
        ];
        $result = AppendOrderAccept::tryAppend($storage, $lobbyId, $gameId, $claimantPlayerId, [
            'atTick' => $atTick,
            'order' => $order,
            'idHash' => $idHash,
            'finalized' => true,
        ]);
        if ($result['rejectedReason'] !== null) {
            return ['success' => false, 'idHash' => $idHash, 'rejectedReason' => $result['rejectedReason']];
        }

        return ['success' => true, 'idHash' => $idHash, 'pendingLineId' => $result['pendingLineId']];
    }
}
