<?php

namespace App\Http\Handlers\Terrain;

use App\AccountService;
use App\LobbyManager;

class ListTerrainSegmentsHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $storageDir = __DIR__ . '/../../../../../storage/terrain-segments';
        $segments = [];

        if (is_dir($storageDir)) {
            foreach (glob($storageDir . '/*.json') as $file) {
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
