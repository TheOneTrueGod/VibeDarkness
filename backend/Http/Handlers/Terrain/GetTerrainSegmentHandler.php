<?php

namespace App\Http\Handlers\Terrain;

use App\AccountService;
use App\LobbyManager;

class GetTerrainSegmentHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $id = $matches[1] ?? '';

        if (!preg_match('#^[a-zA-Z0-9_-]+$#', $id)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid segment id'];
        }

        $filePath = __DIR__ . '/../../../../storage/terrain-segments/' . $id . '.json';

        if (!file_exists($filePath)) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Segment not found'];
        }

        $content = file_get_contents($filePath);
        $data = json_decode($content, true);

        if ($data === null) {
            http_response_code(500);
            return ['success' => false, 'error' => 'Failed to parse segment file'];
        }

        return $data;
    }
}
