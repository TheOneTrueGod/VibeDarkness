<?php

namespace App\Http\Handlers;

use App\CharacterManager;
use App\LobbyManager;
use App\AccountService;
use App\SessionHelper;

class ListCharactersHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
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

        $characterManager = CharacterManager::getInstance();
        $characterIds = $account->getCharacterIds();
        $characters = [];
        foreach ($characterIds as $id) {
            $character = $characterManager->getCharacter($id);
            if ($character !== null && $character->getOwnerAccountId() === $accountId) {
                $characters[] = $character->toArray();
            }
        }

        return [
            'success' => true,
            'characters' => $characters,
        ];
    }
}
