<?php

namespace App\Http\Handlers\LobbyDebug;

use App\AccountService;
use App\LobbyDebug\LobbyDebugAuth;
use App\LobbyDebug\LobbyDebugService;
use App\LobbyManager;

/**
 * Single entry point for GET/POST /lobby_debug/{method}.
 */
class LobbyDebugHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        header('Cache-Control: no-store, no-cache, must-revalidate');

        $authError = LobbyDebugAuth::authorize($accountService);
        if ($authError !== null) {
            return $authError;
        }

        $method = $matches[1] ?? '';
        $params = self::collectParams();

        $service = new LobbyDebugService($manager);
        return $service->dispatch($method, $params);
    }

    /**
     * Merge query string and JSON body; body wins on conflicts.
     *
     * @return array<string, mixed>
     */
    private static function collectParams(): array
    {
        $params = [];
        foreach ($_GET as $key => $value) {
            if (is_string($key)) {
                $params[$key] = $value;
            }
        }

        $body = \getJsonBody();
        if (is_array($body)) {
            foreach ($body as $key => $value) {
                if (is_string($key)) {
                    $params[$key] = $value;
                }
            }
        }

        return $params;
    }
}
