<?php

namespace App\Http\Handlers;

use App\CampaignManager;
use App\LobbyManager;
use App\AccountService;
use App\SessionHelper;

class GetCampaignHandler
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

        if (!in_array($campaignId, $account->getCampaignIds(), true)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Access denied to this campaign'];
        }

        $campaignManager = CampaignManager::getInstance();
        $campaign = $campaignManager->getCampaign($campaignId);
        if ($campaign === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Campaign not found'];
        }

        return [
            'success' => true,
            'campaign' => $campaign->toArray(),
        ];
    }
}
