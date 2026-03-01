<?php

namespace App\Http\Handlers;

use App\CampaignManager;
use App\LobbyManager;
use App\AccountService;
use App\SessionHelper;

class CreateCampaignHandler
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

        $campaignManager = CampaignManager::getInstance();
        $campaign = $campaignManager->createCampaign((string) $accountId);
        $accountService->addCampaignToAccount($accountId, $campaign->getId());

        return [
            'success' => true,
            'campaign' => $campaign->toArray(),
        ];
    }
}
