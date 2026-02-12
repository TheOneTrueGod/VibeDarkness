<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class ListLobbiesHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        return [
            'success' => true,
            'lobbies' => $manager->getPublicLobbies(),
        ];
    }
}
