<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class JoinLobbyHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $data = \getJsonBody();

        $accountId = isset($data['accountId']) ? (int) $data['accountId'] : null;

        if ($accountId === null || $accountId < 1) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Valid accountId is required (sign in first)'];
        }

        $account = $accountService->getAccountById($accountId);
        if ($account === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }

        $playerId = (string) $account->getId();
        $result = $manager->joinLobby($lobbyId, $playerId, $account->getName());

        if ($result === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Lobby not found'];
        }

        if (isset($result['error'])) {
            http_response_code(400);
            return ['success' => false, 'error' => $result['error']];
        }

        return [
            'success' => true,
            'lobby' => $result['lobby'],
            'player' => $result['player'],
            'account' => $account->toArray(),
            'isRejoin' => $result['isRejoin'] ?? false,
        ];
    }
}
