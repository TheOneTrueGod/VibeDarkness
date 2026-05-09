<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;

class SaveSnapshotHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        $tickRaw = $data['tick'] ?? ($data['gameTick'] ?? null);
        $state = $data['state'] ?? null;

        if ($playerId === '' || $tickRaw === null || !is_array($state)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId, tick, and state are required'];
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
            return ['success' => false, 'error' => 'Only the host can save snapshots'];
        }

        $checkpointFingerprint = '';
        if (isset($data['checkpointFingerprint']) && is_string($data['checkpointFingerprint'])
            && $data['checkpointFingerprint'] !== ''
        ) {
            $checkpointFingerprint = $data['checkpointFingerprint'];
        }

        if (!array_key_exists('engineSchemaVersion', $state)) {
            $state['engineSchemaVersion'] = 1;
        }

        try {
            $tick = (int) $tickRaw;
            $storage = new BattleStorage();
            $storage->saveSnapshot($lobbyId, $gameId, $tick, $state);
            if ($checkpointFingerprint !== '') {
                $storage->appendFingerprints($lobbyId, $gameId, [
                    ['tick' => $tick, 'fp' => $checkpointFingerprint, 'paused' => true],
                ]);
            }
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }

        return ['success' => true, 'tick' => (int) $tickRaw];
    }
}
