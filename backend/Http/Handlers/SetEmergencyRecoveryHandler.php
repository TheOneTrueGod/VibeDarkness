<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class SetEmergencyRecoveryHandler
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

        $targetAccountId = (int) ($matches[1] ?? 0);
        if ($targetAccountId < 1) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Account ID required'];
        }

        $targetAccount = $accountService->getAccountById($targetAccountId);
        if ($targetAccount === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }

        if ($targetAccount->getRole() === PlayerAccount::ROLE_ADMIN) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Cannot set emergency recovery on admin accounts'];
        }

        $body = \getJsonBody();
        $action = $body['action'] ?? null;
        if ($action !== 'enable' && $action !== 'disable') {
            http_response_code(400);
            return ['success' => false, 'error' => 'action must be "enable" or "disable"'];
        }

        $accountService->setEmergencyRecovery($targetAccountId, $action === 'enable');

        return ['success' => true];
    }
}
