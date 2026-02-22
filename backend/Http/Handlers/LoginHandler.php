<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyManager;
use App\SessionHelper;

class LoginHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $data = \getJsonBody();
        $username = $data['username'] ?? $data['name'] ?? null;
        $password = $data['password'] ?? null;

        if (! $username || trim($username) === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'Username is required'];
        }
        if (! is_string($password)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Password is required'];
        }

        try {
            $account = $accountService->login(trim($username), $password);
            SessionHelper::setAccountId($account->getId());
            return [
                'success' => true,
                'account' => $account->toArray(),
            ];
        } catch (\InvalidArgumentException $e) {
            http_response_code(401);
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
