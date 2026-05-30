<?php

namespace App\Http\Handlers\Admin;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class ListAdminLobbiesHandler
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

        $storageRoot = dirname(__DIR__, 4) . '/storage/lobbies';

        $lobbies = [];

        if (!is_dir($storageRoot)) {
            return ['success' => true, 'lobbies' => []];
        }

        $entries = scandir($storageRoot);
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $lobbyDir = $storageRoot . '/' . $entry;
            if (!is_dir($lobbyDir)) {
                continue;
            }
            $stateFile = $lobbyDir . '/lobby_state.json';
            if (!file_exists($stateFile)) {
                continue;
            }
            $raw = file_get_contents($stateFile);
            if ($raw === false) {
                continue;
            }
            $data = json_decode($raw, true);
            if (!is_array($data)) {
                continue;
            }
            $lobbies[] = [
                'id'        => $entry,
                'createdAt' => $data['createdAt'] ?? null,
                'playerIds' => array_keys($data['players'] ?? []),
                'hostId'    => $data['hostId'] ?? null,
            ];
        }

        usort($lobbies, function (array $a, array $b): int {
            $aTime = $a['createdAt'];
            $bTime = $b['createdAt'];
            if ($aTime === null && $bTime === null) {
                return 0;
            }
            if ($aTime === null) {
                return 1;
            }
            if ($bTime === null) {
                return -1;
            }
            return $bTime <=> $aTime;
        });

        return ['success' => true, 'lobbies' => $lobbies];
    }
}
