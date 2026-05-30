<?php

namespace App\Http\Handlers\Admin;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class GetAdminLobbyUserStateIndexHandler
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
        $userStateDir = $storageRoot . '/' . $lobbyId . '/user_state';

        if (!is_dir($userStateDir)) {
            return ['success' => true, 'users' => (object) []];
        }

        $users = [];

        $userEntries = scandir($userStateDir);
        foreach ($userEntries as $userId) {
            if ($userId === '.' || $userId === '..') {
                continue;
            }
            $userDir = $userStateDir . '/' . $userId;
            if (!is_dir($userDir)) {
                continue;
            }
            $files = [];
            $fileEntries = scandir($userDir);
            foreach ($fileEntries as $fileName) {
                if (!preg_match('#^user_state_(\d+)\.md$#', $fileName, $m)) {
                    continue;
                }
                $fileNum  = (int) $m[1];
                $fromTick = ($fileNum - 1) * 100;
                $toTick   = $fileNum * 100 - 1;
                $files[]  = [
                    'fileNum'  => $fileNum,
                    'fromTick' => $fromTick,
                    'toTick'   => $toTick,
                ];
            }
            usort($files, fn(array $a, array $b) => $a['fileNum'] <=> $b['fileNum']);
            $users[$userId] = $files;
        }

        return ['success' => true, 'users' => $users ?: (object) []];
    }
}
