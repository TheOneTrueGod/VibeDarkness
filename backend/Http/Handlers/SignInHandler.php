<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyManager;

class SignInHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $data = \getJsonBody();
        $name = $data['name'] ?? null;
        if (!$name || trim($name) === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'Name is required'];
        }
        try {
            $account = $accountService->signIn(trim($name));
            return [
                'success' => true,
                'account' => $account->toArray(),
            ];
        } catch (\InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
