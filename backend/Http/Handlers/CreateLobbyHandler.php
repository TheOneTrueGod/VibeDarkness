<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class CreateLobbyHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $data = \getJsonBody();

        $name = $data['name'] ?? null;
        $accountId = isset($data['accountId']) ? (int) $data['accountId'] : null;
        $maxPlayers = $data['maxPlayers'] ?? 8;
        $isPublic = $data['isPublic'] ?? true;

        if (!$name) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Lobby name is required'];
        }

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
        $result = $manager->createLobby($name, $playerId, $account->getName(), $maxPlayers, $isPublic);

        return [
            'success' => true,
            'lobby' => $result['lobby'],
            'player' => $result['player'],
            'account' => $account->toArray(),
        ];
    }
}
