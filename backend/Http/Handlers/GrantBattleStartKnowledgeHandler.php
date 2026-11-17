<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\BattleKnowledge;
use App\LobbyManager;
use App\SessionHelper;

/**
 * POST /api/account/battle-start-knowledge { keys: string[] }
 *
 * A mission's `startRewards.knowledgeKeys`: each client records the grant on its own account when the
 * battle starts. Only keys in BattleKnowledge::START_GRANTABLE_KEYS are accepted (a player cannot grant
 * themselves other knowledge). Idempotent: granting a key the account already has changes nothing
 * (PlayerAccount::grantKnowledge keeps the original `acquiredAt`).
 */
class GrantBattleStartKnowledgeHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $accountId = SessionHelper::getAccountId();
        if ($accountId === null || $accountId < 1) {
            http_response_code(401);
            return ['success' => false, 'error' => 'Not logged in'];
        }

        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body) || !isset($body['keys']) || !is_array($body['keys'])) {
            http_response_code(400);
            return ['success' => false, 'error' => 'keys required'];
        }

        $keys = [];
        foreach ($body['keys'] as $key) {
            $k = trim((string) $key);
            if ($k === '') {
                continue;
            }
            if (!BattleKnowledge::isStartGrantable($k)) {
                http_response_code(403);
                return ['success' => false, 'error' => 'Not a battle-start knowledge key'];
            }
            $keys[$k] = true;
        }

        foreach (array_keys($keys) as $k) {
            $accountService->grantKnowledgeToAccount($accountId, (string) $k, []);
        }
        $account = $accountService->getAccountById($accountId);

        return [
            'success' => true,
            'user' => $account?->toArray(),
        ];
    }
}
