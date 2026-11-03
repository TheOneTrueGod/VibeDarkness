<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\CharacterManager;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

class ListAdminAccountsHandler
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

        $accounts = $accountService->listAllAccounts();
        usort($accounts, static function (PlayerAccount $a, PlayerAccount $b): int {
            return $a->getName() <=> $b->getName();
        });

        $characterManager = CharacterManager::getInstance();
        return [
            'success' => true,
            'accounts' => array_map(
                static function (PlayerAccount $account) use ($characterManager): array {
                    $row = $account->toArray();
                    // Small preview of the tracked character for the admin Players list.
                    $favId = $account->getAdminFavoriteCharacterId();
                    $character = $favId !== null ? $characterManager->getCharacter($favId) : null;
                    $row['adminFavoriteCharacter'] = $character !== null && $character->getOwnerAccountId() === $account->getId()
                        ? [
                            'id' => $character->getId(),
                            'name' => $character->getName(),
                            'portraitId' => $character->getPortraitId(),
                        ]
                        : null;
                    return $row;
                },
                $accounts
            ),
        ];
    }
}

