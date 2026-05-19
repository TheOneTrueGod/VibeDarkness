<?php

namespace App\Http\Handlers\Terrain;

use App\AccountService;
use App\LobbyManager;

class ListTerrainSegmentsHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $storageDir = __DIR__ . '/../../../../storage/terrain-segments';
        $segments = [];

        $requestedIds = null;
        if (!empty($_GET['ids'])) {
            $candidates = array_filter(array_map('trim', explode(',', $_GET['ids'])));
            $valid = [];
            foreach ($candidates as $id) {
                if (preg_match('#^[a-zA-Z0-9_-]+$#', $id)) {
                    $valid[] = $id;
                }
            }
            $requestedIds = count($valid) > 0 ? $valid : null;
        }

        if (is_dir($storageDir)) {
            foreach (glob($storageDir . '/*.json') as $file) {
                $id = basename($file, '.json');
                if ($requestedIds !== null && !in_array($id, $requestedIds, true)) {
                    continue;
                }
                $content = file_get_contents($file);
                $data = json_decode($content, true);
                if ($data !== null) {
                    $segments[] = $data;
                }
            }
        }

        return ['segments' => $segments];
    }
}
