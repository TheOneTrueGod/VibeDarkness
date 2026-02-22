<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;
use App\SessionHelper;

class CreateLobbyHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $data = \getJsonBody();

        $accountId = SessionHelper::getAccountId();
        $maxPlayers = $data['maxPlayers'] ?? 8;
        $isPublic = $data['isPublic'] ?? true;

        if ($accountId === null || $accountId < 1) {
            http_response_code(401);
            return ['success' => false, 'error' => 'Not logged in'];
        }

        $account = $accountService->getAccountById($accountId);
        if ($account === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }

        $name = trim($data['name'] ?? '') ?: $account->getName() . "'s Lobby";
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
