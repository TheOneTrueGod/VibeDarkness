<?php

namespace App\Http\Handlers\Admin;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class GetAdminLobbyLogHandler
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

        $lobbyId = $matches[1];

        if (!preg_match('#^[A-Z0-9]+$#', $lobbyId)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid lobby id'];
        }

        $storageRoot = dirname(__DIR__, 4) . '/storage/lobbies';
        $logFile = $storageRoot . '/' . $lobbyId . '/lobby_log.jsonl';

        if (!file_exists($logFile)) {
            return ['success' => true, 'lines' => []];
        }

        $raw = file_get_contents($logFile);
        if ($raw === false) {
            return ['success' => true, 'lines' => []];
        }

        $lines = [];
        foreach (explode("\n", $raw) as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $decoded = json_decode($line, true);
            if ($decoded === null) {
                continue;
            }
            $lines[] = $decoded;
        }

        return ['success' => true, 'lines' => $lines];
    }
}
