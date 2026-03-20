<?php

namespace App\Http\Handlers;

use App\Campaign;
use App\CampaignManager;
use App\LobbyManager;
use App\AccountService;
use App\SessionHelper;

class UpdateCampaignHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $campaignId = $matches[1] ?? '';
        if ($campaignId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'Campaign ID required'];
        }

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

        $isAdmin = $account->getRole() === \App\PlayerAccount::ROLE_ADMIN;
        if (!$isAdmin && !in_array($campaignId, $account->getCampaignIds(), true)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Access denied to this campaign'];
        }

        $campaignManager = CampaignManager::getInstance();
        $campaign = $campaignManager->getCampaign($campaignId);
        if ($campaign === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Campaign not found'];
        }

        $data = \getJsonBody();
        if ($data === null) {
            $data = [];
        }

        if (array_key_exists('name', $data)) {
            $campaign->setName($data['name']);
        }
        if (isset($data['campaignCharacters']) && is_array($data['campaignCharacters'])) {
            $campaign->setCampaignCharacters($data['campaignCharacters']);
        }
        if (isset($data['missionResults']) && is_array($data['missionResults'])) {
            $campaign->setMissionResults($data['missionResults']);
        }
        if (isset($data['resources']) && is_array($data['resources'])) {
            $campaign->setResources($data['resources']);
        }
        if (isset($data['addMissionResult']) && is_array($data['addMissionResult'])) {
            $mr = $data['addMissionResult'];
            $missionId = $mr['missionId'] ?? '';
            $result = $mr['result'] ?? 'victory';
            $delta = $mr['resourceDelta'] ?? null;
            $campaign->addMissionResult($missionId, $result, $delta);

            $grantKnowledgeKeys = $mr['grantKnowledgeKeys'] ?? null;
            if (is_array($grantKnowledgeKeys) && count($grantKnowledgeKeys) > 0) {
                foreach ($grantKnowledgeKeys as $key) {
                    $k = trim((string) $key);
                    if ($k !== '') {
                        $accountService->grantKnowledgeToAccount($accountId, $k, []);
                    }
                }
            }
        }

        $campaignManager->updateCampaign($campaign);

        return [
            'success' => true,
            'campaign' => $campaign->toArray(),
        ];
    }
}
