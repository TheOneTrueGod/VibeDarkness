<?php

namespace App\Http\Handlers\Admin;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class GetCiStatusHandler
{
    private const CI_RESULTS_RELATIVE_PATH = '/storage/ci_results.json';

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

        $path = dirname(__DIR__, 4) . self::CI_RESULTS_RELATIVE_PATH;
        if (!file_exists($path)) {
            return ['success' => true, 'ci' => null];
        }

        $raw = file_get_contents($path);
        if ($raw === false) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to read CI results'];
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Invalid CI results JSON'];
        }

        return ['success' => true, 'ci' => $data];
    }
}
