<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\CampaignManager;
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

        // Minimal backend validation (structure): for now we only persist the node as researched.
        // Full validation against a server-side registry is added in later tasks (tree defs + evaluator mirror).
        $existing = $character->getResearchTrees();
        $list = $existing[$treeId] ?? [];
        $list = is_array($list) ? $list : [];
        if (!in_array($nodeId, $list, true)) {
            $list[] = $nodeId;
        }
        $existing[$treeId] = array_values(array_unique(array_map('strval', $list)));

        $updated = $characterManager->updateCharacter($characterId, ['researchTrees' => $existing]);
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

