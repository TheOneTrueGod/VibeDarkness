<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;
use App\SessionHelper;

/**
 * POST /api/lobbies/{id}/continue-quest
 *
 * Race-safe claim/create of the next private quest-continuation lobby.
 * All party members call this with the same source lobby id; the first creates,
 * later callers join the stamped nextLobbyId.
 */
class ClaimQuestContinuationHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $sourceLobbyId = $matches[1];
        $accountId = SessionHelper::getAccountId();

        if ($accountId === null || $accountId < 1) {
            http_response_code(401);
            return ['success' => false, 'error' => 'Not logged in'];
        }

        $account = $accountService->getAccountById($accountId);
        if ($account === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }

        $data = \getJsonBody();
        $playerId = (string) $account->getId();
        $result = $manager->claimQuestContinuationLobby(
            $sourceLobbyId,
            $playerId,
            $account->getName(),
            $data
        );

        if (isset($result['error'])) {
            http_response_code(400);
            return ['success' => false, 'error' => $result['error']];
        }

        $lobbyId = (string) ($result['lobby']['id'] ?? '');
        if ($lobbyId !== '') {
            $accountService->recordRecentLobby($accountId, $lobbyId);
        }

        return [
            'success' => true,
            'lobby' => $result['lobby'],
            'player' => $result['player'],
            'account' => $account->toArray(),
            'created' => (bool) ($result['created'] ?? false),
        ];
    }
}
