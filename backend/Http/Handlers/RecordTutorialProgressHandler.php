<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyManager;
use App\SessionHelper;
use App\TutorialKnowledge;

/**
 * POST /api/account/tutorial-progress { key, tutorialId, step, done }
 *
 * The signed-in player records progress through a tutorial on their own account. Only tutorial knowledge
 * keys (TutorialKnowledge::KEYS) are accepted, so a player cannot grant themselves other knowledge.
 */
class RecordTutorialProgressHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $accountId = SessionHelper::getAccountId();
        if ($accountId === null || $accountId < 1) {
            http_response_code(401);
            return ['success' => false, 'error' => 'Not logged in'];
        }

        $body = json_decode((string) file_get_contents('php://input'), true);
        if (!is_array($body)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Invalid JSON'];
        }

        $key = trim((string) ($body['key'] ?? ''));
        $tutorialId = trim((string) ($body['tutorialId'] ?? ''));
        if ($key === '' || $tutorialId === '' || strlen($tutorialId) > 64) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Knowledge key and tutorial id required'];
        }
        if (!TutorialKnowledge::isRecordable($key)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Not a tutorial knowledge key'];
        }

        $step = (int) ($body['step'] ?? 0);
        $done = ($body['done'] ?? false) === true;

        $accountService->setTutorialProgressOnAccount($accountId, $key, $tutorialId, $step, $done);
        $account = $accountService->getAccountById($accountId);

        return [
            'success' => true,
            'user' => $account?->toArray(),
        ];
    }
}
