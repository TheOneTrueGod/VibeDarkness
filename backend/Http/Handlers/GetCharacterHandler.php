<?php

namespace App\Http\Handlers;

use App\CharacterManager;
use App\LobbyManager;
use App\AccountService;
use App\SessionHelper;

class GetCharacterHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
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

        return [
            'success' => true,
            'character' => $character->toArray(),
        ];
    }
}
