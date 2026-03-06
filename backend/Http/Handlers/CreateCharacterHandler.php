<?php

namespace App\Http\Handlers;

use App\CharacterManager;
use App\LobbyManager;
use App\AccountService;
use App\SessionHelper;

class CreateCharacterHandler
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

        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid JSON'];
        }

        $portraitId = isset($body['portraitId']) ? (string) $body['portraitId'] : '';
        $campaignId = isset($body['campaignId']) ? (string) $body['campaignId'] : '';
        $missionId = isset($body['missionId']) ? (string) $body['missionId'] : '';
        $name = isset($body['name']) ? (string) $body['name'] : '';
        $equipment = isset($body['equipment']) && is_array($body['equipment']) ? $body['equipment'] : [];
        $knowledge = isset($body['knowledge']) && is_array($body['knowledge']) ? $body['knowledge'] : [];
        $traits = isset($body['traits']) && is_array($body['traits']) ? $body['traits'] : [];
        $battleChipDetails = isset($body['battleChipDetails']) && is_array($body['battleChipDetails']) ? $body['battleChipDetails'] : [];

        $characterManager = CharacterManager::getInstance();
        $character = $characterManager->createCharacter($accountId, [
            'name' => $name,
            'equipment' => $equipment,
            'knowledge' => $knowledge,
            'traits' => $traits,
            'portraitId' => $portraitId,
            'battleChipDetails' => $battleChipDetails,
            'campaignId' => $campaignId,
            'missionId' => $missionId,
        ]);

        $accountService->addCharacterToAccount($accountId, $character->getId());

        // Refresh account to get updated characterIds list, then build full character list.
        $updatedAccount = $accountService->getAccountById($accountId);
        $characters = [];
        if ($updatedAccount !== null) {
            foreach ($updatedAccount->getCharacterIds() as $cid) {
                $c = $characterManager->getCharacter($cid);
                if ($c !== null && $c->getOwnerAccountId() === $accountId) {
                    $characters[] = $c->toArray();
                }
            }
        }

        return [
            'success' => true,
            'character' => $character->toArray(),
            'characters' => $characters,
        ];
    }
}
