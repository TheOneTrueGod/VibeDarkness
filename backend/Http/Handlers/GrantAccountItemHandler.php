<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class GrantAccountItemHandler
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

        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid JSON'];
        }

        $itemId = trim((string) ($body['itemId'] ?? ''));
        if ($itemId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'Item ID required'];
        }

        $accountService->addInventoryItemToAccount($targetAccountId, $itemId);
        $account = $accountService->getAccountById($targetAccountId);

        return [
            'success' => true,
            'account' => $account?->toArray(),
        ];
    }
}
