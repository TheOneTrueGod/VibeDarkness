<?php

namespace App\Http\Handlers\Terrain;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class SaveTerrainSegmentHandler
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

        $urlId = $matches[1] ?? '';

        if (!preg_match('#^[a-z0-9_-]+$#', $urlId)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid segment id'];
        }

        $body = json_decode(file_get_contents('php://input'), true);

        if (!is_array($body)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid JSON body'];
        }

        $requiredKeys = ['id', 'gridCol', 'gridRow', 'width', 'height', 'terrain'];
        foreach ($requiredKeys as $key) {
            if (!array_key_exists($key, $body)) {
                http_response_code(400);
                return ['success' => false, 'error' => "Missing required field: {$key}"];
            }
        }

        if ($body['id'] !== $urlId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Body id does not match URL id'];
        }

        $filePath = __DIR__ . '/../../../../storage/terrain-segments/' . $urlId . '.json';

        $result = file_put_contents($filePath, json_encode($body, JSON_PRETTY_PRINT));

        if ($result === false) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to write segment file'];
        }

        return ['success' => true];
    }
}
