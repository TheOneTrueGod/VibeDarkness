<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\CampaignManager;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class GrantCampaignResourceHandler
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

        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid JSON'];
        }

        $resourceKey = trim((string) ($body['resourceKey'] ?? ''));
        if ($resourceKey === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'Resource key required'];
        }
        $delta = (int) ($body['delta'] ?? 0);
        if ($delta === 0) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Delta required'];
        }

        $k = strtolower($resourceKey);
        if (!in_array($k, ['food', 'metal', 'population', 'crystals'], true)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid resource key'];
        }

        $campaign->adjustResources([$k => $delta]);
        $campaignManager->updateCampaign($campaign);

        return [
            'success' => true,
            'campaign' => $campaign->toArray(),
        ];
    }
}

