<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyManager;
use App\SessionHelper;

class GetCurrentUserHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $accountId = SessionHelper::getAccountId();
        if ($accountId === null) {
            return [
                'success' => true,
                'user' => null,
            ];
        }

        $account = $accountService->getAccountById($accountId);
        if ($account === null) {
            SessionHelper::clear();
            return [
                'success' => true,
                'user' => null,
            ];
        }

        return [
            'success' => true,
            'user' => $account->toArray(),
        ];
    }
}
