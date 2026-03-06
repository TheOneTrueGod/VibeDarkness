<?php

namespace App\Http\Handlers;

use App\CharacterManager;
use App\AccountService;
use App\SessionHelper;

class DeleteCharacterHandler
{
    public static function handle(\App\LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $accountId = SessionHelper::getAccountId();
        if ($accountId === null || $accountId < 1) {
            http_response_code(401);
            return ['success' => false, 'error' => 'Not logged in'];
        }

        $characterId = $matches[1] ?? '';
        if ($characterId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'Character ID required'];
        }

        $characterManager = CharacterManager::getInstance();
        $character = $characterManager->getCharacter($characterId);
        if ($character === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Character not found'];
        }

        if ($character->getOwnerAccountId() !== $accountId) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Not your character'];
        }

        $accountService->removeCharacterFromAccount($accountId, $characterId);
        $characterManager->deleteCharacter($characterId);

        $account = $accountService->getAccountById($accountId);
        $characters = [];
        if ($account !== null) {
            foreach ($account->getCharacterIds() as $cid) {
                $c = $characterManager->getCharacter($cid);
                if ($c !== null && $c->getOwnerAccountId() === $accountId) {
                    $characters[] = $c->toArray();
                }
            }
        }

        return [
            'success' => true,
            'characters' => $characters,
        ];
    }
}
