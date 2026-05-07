<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;

class SaveInitialStateHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        $state = $data['state'] ?? null;
        $initialFingerprint = isset($data['initialFingerprint']) ? (string) $data['initialFingerprint'] : '';

        if ($playerId === '' || !is_array($state) || $initialFingerprint === '') {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId, state, and initialFingerprint are required'];
        }
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        $lobby = $manager->getLobby($lobbyId);
        if ($lobby === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Lobby not found'];
        }
        if ($lobby->getHostId() !== $playerId) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Only the host can save initial state'];
        }

        try {
            $storage = new BattleStorage();
            $storage->saveInitialState($lobbyId, $gameId, $state, $initialFingerprint);
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (RuntimeException $e) {
            http_response_code(409);
            return ['success' => false, 'error' => $e->getMessage()];
        }

        return ['success' => true];
    }
}
