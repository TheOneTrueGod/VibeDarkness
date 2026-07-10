<?php

namespace App\LobbyDebug;

use App\AccountService;
use App\PlayerAccount;
use App\SessionHelper;

/**
 * Access control for /lobby_debug/* endpoints.
 *
 * - Development (APP_ENV=development): open to agents on the local PHP server.
 * - Production: admin session OR matching LOBBY_DEBUG_TOKEN header.
 */
final class LobbyDebugAuth
{
    public const HEADER_TOKEN = 'X-Lobby-Debug-Token';

    /**
     * @return array{success:false,error:string,hint?:string}|null Null when authorized.
     */
    public static function authorize(AccountService $accountService): ?array
    {
        if (getenv('APP_ENV') === 'development') {
            return null;
        }

        $adminAccountId = SessionHelper::getAccountId();
        if ($adminAccountId !== null && $adminAccountId >= 1) {
            $adminAccount = $accountService->getAccountById($adminAccountId);
            if ($adminAccount !== null && $adminAccount->getRole() === PlayerAccount::ROLE_ADMIN) {
                return null;
            }
        }

        $configuredToken = getenv('LOBBY_DEBUG_TOKEN');
        if (is_string($configuredToken) && $configuredToken !== '') {
            $provided = self::readTokenHeader();
            if ($provided !== null && hash_equals($configuredToken, $provided)) {
                return null;
            }
            if ($provided === null) {
                http_response_code(401);
                return [
                    'success' => false,
                    'error' => 'Production lobby debug requires authentication',
                    'hint' => 'Send header ' . self::HEADER_TOKEN . ' with the server LOBBY_DEBUG_TOKEN value, or sign in as an admin.',
                ];
            }
            http_response_code(403);
            return [
                'success' => false,
                'error' => 'Invalid lobby debug token',
                'hint' => 'Check LOBBY_DEBUG_TOKEN on the server matches the ' . self::HEADER_TOKEN . ' header.',
            ];
        }

        http_response_code(403);
        return [
            'success' => false,
            'error' => 'Lobby debug is disabled in production',
            'hint' => 'Set LOBBY_DEBUG_TOKEN on the server for agent access, or use APP_ENV=development locally.',
        ];
    }

    public static function environmentLabel(): string
    {
        return getenv('APP_ENV') === 'development' ? 'development' : 'production';
    }

    private static function readTokenHeader(): ?string
    {
        $header = $_SERVER['HTTP_X_LOBBY_DEBUG_TOKEN'] ?? null;
        if (is_string($header) && $header !== '') {
            return $header;
        }
        return null;
    }
}
