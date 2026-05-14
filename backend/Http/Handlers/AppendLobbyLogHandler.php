<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyLogStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;

class AppendLobbyLogHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $data = \getJsonBody();

        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        if ($playerId === '' || !$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        $severity = isset($data['severity']) && is_string($data['severity']) ? $data['severity'] : 'log';
        $tickRaw = $data['tick'] ?? null;
        $tick = is_int($tickRaw) ? $tickRaw : (is_numeric($tickRaw) ? (int) $tickRaw : null);
        $message = isset($data['message']) && is_string($data['message']) ? $data['message'] : '';
        $context = isset($data['context']) && is_array($data['context']) ? $data['context'] : [];
        $gameId = isset($data['gameId']) && is_string($data['gameId']) ? $data['gameId'] : null;
        $gamePhase = isset($data['gamePhase']) && is_string($data['gamePhase']) ? $data['gamePhase'] : null;

        $logTypeRaw = isset($data['logType']) && is_string($data['logType']) ? $data['logType'] : '';
        $logType = in_array($logTypeRaw, ['desync', 'battleSync', 'debug'], true) ? $logTypeRaw : 'debug';

        try {
            $storage = new LobbyLogStorage();
            $storage->append($lobbyId, [
                'playerId' => $playerId,
                'severity' => $severity,
                'tick' => $tick,
                'message' => $message,
                'logType' => $logType,
                'context' => $context,
                'gameId' => $gameId,
                'gamePhase' => $gamePhase,
                'origin' => 'client',
            ]);
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }

        return ['success' => true];
    }
}
