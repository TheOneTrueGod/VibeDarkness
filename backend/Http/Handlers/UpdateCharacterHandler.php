<?php

namespace App\Http\Handlers;

use App\CharacterManager;
use App\AccountService;
use App\PlayerAccount;
use App\SessionHelper;

class UpdateCharacterHandler
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

        $body = file_get_contents('php://input');
        $data = $body !== false && $body !== '' ? json_decode($body, true) : null;
        if (!is_array($data)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid JSON body'];
        }

        $characterManager = CharacterManager::getInstance();
        $character = $characterManager->getCharacter($characterId);
        if ($character === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Character not found'];
        }

        $account = $accountService->getAccountById($accountId);
        if ($account === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }

        if ($character->getOwnerAccountId() !== $accountId && $account->getRole() !== PlayerAccount::ROLE_ADMIN) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Not your character'];
        }

        $updates = [];
        if (isset($data['equipment']) && is_array($data['equipment'])) {
            $updates['equipment'] = $data['equipment'];
        }
        if (array_key_exists('name', $data)) {
            $updates['name'] = (string) $data['name'];
        }
        if (array_key_exists('portraitId', $data)) {
            $updates['portraitId'] = (string) $data['portraitId'];
        }

        $updated = $characterManager->updateCharacter($characterId, $updates);
        if ($updated === null) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Update failed'];
        }

        return [
            'success' => true,
            'character' => $updated->toArray(),
        ];
    }
}
