<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\CampaignManager;
use App\Character;
use App\CharacterManager;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class ResearchCharacterNodeHandler
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

        $body = \getJsonBody();
        $treeId = trim((string) ($body['treeId'] ?? ''));
        $nodeId = trim((string) ($body['nodeId'] ?? ''));
        // Optional client-provided max levels for passive nodes (defaults to 1 = binary).
        $maxLevels = (int) ($body['maxLevels'] ?? 1);
        if ($maxLevels < 1) {
            $maxLevels = 1;
        }
        $requestedSource = trim((string) ($body['source'] ?? Character::RESEARCH_SOURCE_PURCHASED));

        if ($treeId === '' || $nodeId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'treeId and nodeId required'];
        }

        $account = $accountService->getAccountById($accountId);
        if ($account === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }

        $characterManager = CharacterManager::getInstance();
        $character = $characterManager->getCharacter($characterId);
        if ($character === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Character not found'];
        }

        $isAdmin = $account->getRole() === PlayerAccount::ROLE_ADMIN;
        if (!$isAdmin && $character->getOwnerAccountId() !== $accountId) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Not your character'];
        }

        $source = Character::RESEARCH_SOURCE_PURCHASED;
        if ($isAdmin) {
            $source = $requestedSource === Character::RESEARCH_SOURCE_ADMIN
                ? Character::RESEARCH_SOURCE_ADMIN
                : Character::RESEARCH_SOURCE_PURCHASED;
        }

        // Minimal backend validation (structure): persist researched presence + level counts.
        $added = $character->addResearchLevel($treeId, $nodeId, $source, $maxLevels);
        if (!$added) {
            return [
                'success' => true,
                'character' => $character->toArray(),
            ];
        }

        $updated = $characterManager->updateCharacter($characterId, [
            'researchTrees' => $character->getResearchTrees(),
            'researchNodeLevels' => $character->getResearchNodeLevels(),
            'researchSources' => $character->getResearchSources(),
        ]);
        if ($updated === null) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Update failed'];
        }

        // Touch campaign read path so we have it available for later full validations.
        if ($updated->getCampaignId() !== '') {
            $campaign = CampaignManager::getInstance()->getCampaign($updated->getCampaignId());
            // no-op: just ensure campaign exists; validation added later
            if ($campaign === null) {
                // still allow saving research even if campaign missing, but surface it
            }
        }

        return [
            'success' => true,
            'character' => $updated->toArray(),
        ];
    }
}
