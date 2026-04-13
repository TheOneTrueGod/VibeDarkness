<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyManager;
use App\PlayerAccount;
use App\SessionHelper;

/**
 * POST /api/lobbies/{id}/games/{gameId}/reset-to-initial-snapshot
 *
 * Admin only. Clears all battle checkpoints and removes engine runtime fields from the persisted
 * game JSON while keeping post-story lobby state (equipment, story choices, votes, selections).
 * Sets gamePhase to battle so every client re-syncs and the host re-runs mission initialization
 * from the mission definition (new RNG, spawns, terrain-driven setup).
 *
 * Body: { playerId } — must be a player currently in the lobby.
 */
class ResetGameToInitialSnapshotHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $accountId = SessionHelper::getAccountId();
        if ($accountId === null || $accountId < 1) {
            http_response_code(401);
            return ['success' => false, 'error' => 'Not logged in'];
        }

        $adminAccount = $accountService->getAccountById($accountId);
        if ($adminAccount === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Account not found'];
        }
        if ($adminAccount->getRole() !== PlayerAccount::ROLE_ADMIN) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Admins only'];
        }

        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();
        $playerId = is_array($data) ? ($data['playerId'] ?? null) : null;
        if (!is_string($playerId) || $playerId === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId is required'];
        }

        $lobby = $manager->getLobby($lobbyId);
        if ($lobby === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Lobby not found'];
        }

        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        $activeGameId = $lobby->getGameId();
        if ($activeGameId === null || $activeGameId !== $gameId) {
            http_response_code(400);
            return ['success' => false, 'error' => 'Game ID does not match active lobby game'];
        }

        $gameStateData = $manager->resetMinionBattleMissionAfterStory($lobbyId, $gameId);
        if ($gameStateData === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Game state file not found'];
        }

        return [
            'success' => true,
            'gameStateData' => $gameStateData,
        ];
    }
}
