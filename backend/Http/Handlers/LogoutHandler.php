<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyManager;
use App\SessionHelper;

class LogoutHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        SessionHelper::clear();
        return ['success' => true];
    }
}
