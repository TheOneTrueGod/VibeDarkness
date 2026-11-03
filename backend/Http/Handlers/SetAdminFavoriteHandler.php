<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

/**
 * Admin: set the tracked flag (`favorite`) and/or tracked character (`characterId`) on a player.
 * Either field may be omitted; `characterId: null` clears the tracked character.
 */
class SetAdminFavoriteHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $adminAccountId = SessionHelper::getAccountId();
        if ($adminAccountId === null || $adminAccountId < 1) {
            http_response_code(401);
            return ['success' => false, 'error' => 'Not logged in'];
        }

        $adminAccount = $accountService->getAccountById($adminAccountId);
        if ($adminAccount === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }
        if ($adminAccount->getRole() !== PlayerAccount::ROLE_ADMIN) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Admins only'];
        }

        $targetAccountId = (int) ($matches[1] ?? 0);
        if ($targetAccountId < 1) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Account ID required'];
        }

        $body = \getJsonBody();
        $favorite = array_key_exists('favorite', $body) ? (bool) $body['favorite'] : null;
        $setCharacter = array_key_exists('characterId', $body);
        $characterId = $setCharacter && is_string($body['characterId']) ? $body['characterId'] : null;

        if ($setCharacter && $characterId !== null) {
            $target = $accountService->getAccountById($targetAccountId);
            if ($target !== null && !in_array($characterId, $target->getCharacterIds(), true)) {
                http_response_code(400);
                return ['success' => false, 'error' => 'Character does not belong to that account'];
            }
        }

        $account = $accountService->setAdminFavorite($targetAccountId, $favorite, $characterId, $setCharacter);
        if ($account === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }

        return ['success' => true, 'account' => $account->toArray()];
    }
}
