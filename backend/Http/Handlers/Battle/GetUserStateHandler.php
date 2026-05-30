<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\LobbyManager;
use App\UserStateStorage;

/**
 * Dev-only endpoint for querying per-user game state logs.
 * Requires APP_ENV=development on the PHP server.
 */
class GetUserStateHandler
{
    private const MAX_TICK_RANGE = 2000;
    private const MAX_RESULTS    = 20;

    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        header('Cache-Control: no-store, no-cache, must-revalidate');

        if (getenv('APP_ENV') !== 'development') {
            http_response_code(403);
            return ['success' => false, 'error' => 'Only available in development mode'];
        }

        $lobbyId = $matches[1];
        $userId  = $matches[2];

        $fromTick = isset($_GET['fromTick']) && $_GET['fromTick'] !== '' ? (int) $_GET['fromTick'] : null;
        $toTick   = isset($_GET['toTick'])   && $_GET['toTick']   !== '' ? (int) $_GET['toTick']   : null;

        if ($fromTick === null || $toTick === null) {
            http_response_code(400);
            return ['success' => false, 'error' => 'fromTick and toTick query params are required'];
        }
        if ($fromTick < 0 || $toTick < $fromTick) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid tick range: fromTick must be >= 0 and <= toTick'];
        }
        if (($toTick - $fromTick) > self::MAX_TICK_RANGE) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Tick range too large (max ' . self::MAX_TICK_RANGE . ')'];
        }

        try {
            $storage = new UserStateStorage();
            $entries = $storage->getRange($lobbyId, $userId, $fromTick, $toTick);
            return ['success' => true, 'entries' => $entries, 'count' => count($entries), 'maxResults' => self::MAX_RESULTS];
        } catch (\InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (\RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
