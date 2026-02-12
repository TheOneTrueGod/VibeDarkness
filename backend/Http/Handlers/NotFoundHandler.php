<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class NotFoundHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        return \notFound();
    }
}
