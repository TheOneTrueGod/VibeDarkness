<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;
use RuntimeException;

class AppendFingerprintsHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        $records = $data['records'] ?? null;

        if ($playerId === '' || !is_array($records)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId and records are required'];
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
            return ['success' => false, 'error' => 'Only the host can append fingerprints'];
        }

        try {
            $storage = new BattleStorage();
            $result = $storage->appendFingerprints($lobbyId, $gameId, $records);
        } catch (RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }

        return [
            'success' => true,
            'appended' => $result['appended'],
            'duplicates' => $result['duplicates'],
            'conflicts' => $result['conflicts'],
            'rejectedReason' => $result['conflicts'] > 0 ? 'conflicting_fingerprint_for_tick' : null,
        ];
    }
}
