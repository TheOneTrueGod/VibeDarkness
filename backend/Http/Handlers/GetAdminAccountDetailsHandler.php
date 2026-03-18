<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\CharacterManager;
use App\PlayerAccount;
use App\SessionHelper;
use App\LobbyManager;

class GetAdminAccountDetailsHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $adminAccountId = SessionHelper::getAccountId();
        if ($adminAccountId === null || $adminAccountId < 1) {
            http_response_code(401);
            return ['success' => false, 'error' => 'Not logged in'];
        }

        $adminAccount = $accountService->getAccountById($adminAccountId);
        if ($adminAccount === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }
        if ($adminAccount->getRole() !== PlayerAccount::ROLE_ADMIN) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Admins only'];
        }

        $targetAccountId = (int) ($matches[1] ?? 0);
        if ($targetAccountId < 1) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Account ID required'];
        }

        $account = $accountService->getAccountById($targetAccountId);
        if ($account === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }

        $characterManager = CharacterManager::getInstance();
        $characters = [];
        foreach ($account->getCharacterIds() as $characterId) {
            $character = $characterManager->getCharacter($characterId);
            if ($character !== null && $character->getOwnerAccountId() === $targetAccountId) {
                $characters[] = $character->toArray();
            }
        }

        return [
            'success' => true,
            'account' => $account->toArray(),
            'characters' => $characters,
        ];
    }
}
