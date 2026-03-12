<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class GetActiveLobbiesHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        return [
            'success' => true,
            'activeLobbies' => $manager->getActiveLobbies(),
        ];
    }
}
