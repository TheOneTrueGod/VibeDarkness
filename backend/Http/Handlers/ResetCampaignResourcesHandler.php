<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\CampaignManager;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class ResetCampaignResourcesHandler
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

        $campaignId = $matches[1] ?? '';
        if ($campaignId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'Campaign ID required'];
        }

        $campaignManager = CampaignManager::getInstance();
        $campaign = $campaignManager->getCampaign($campaignId);
        if ($campaign === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Campaign not found'];
        }

        $campaign->resetStoredResources();
        $campaignManager->updateCampaign($campaign);

        return [
            'success' => true,
            'campaign' => $campaign->toArray(),
        ];
    }
}
