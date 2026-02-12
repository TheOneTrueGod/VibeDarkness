<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class StatsHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        return [
            'success' => true,
            'stats' => $manager->getStats(),
        ];
    }
}
