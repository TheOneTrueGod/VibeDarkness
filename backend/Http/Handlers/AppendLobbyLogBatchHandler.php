<?php

namespace App\Http\Handlers;

use App\AccountService;
use App\LobbyLogStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;

/**
 * Append multiple client lobby_log lines in one request (JSON body: playerId + lines[]).
 */
class AppendLobbyLogBatchHandler
{
    private const MAX_LINES = 100;

    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $data = \getJsonBody();

        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        if ($playerId === '' || !$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        $lines = $data['lines'] ?? null;
        if (!is_array($lines) || $lines === []) {
            http_response_code(400);
            return ['success' => false, 'error' => 'lines must be a non-empty array'];
        }
        if (count($lines) > self::MAX_LINES) {
            http_response_code(400);
            return ['success' => false, 'error' => 'too many lines'];
        }

        $storage = new LobbyLogStorage();
        $appended = 0;

        foreach ($lines as $idx => $line) {
            if (!is_array($line)) {
                http_response_code(400);
                return ['success' => false, 'error' => "lines[{$idx}] must be an object"];
            }
            $linePlayerId = isset($line['playerId']) ? (string) $line['playerId'] : '';
            if ($linePlayerId !== $playerId) {
                http_response_code(400);
                return ['success' => false, 'error' => 'line playerId mismatch'];
            }

            $severity = isset($line['severity']) && is_string($line['severity']) ? $line['severity'] : 'log';
            $tickRaw = $line['tick'] ?? null;
            $tick = is_int($tickRaw) ? $tickRaw : (is_numeric($tickRaw) ? (int) $tickRaw : null);
            $message = isset($line['message']) && is_string($line['message']) ? $line['message'] : '';
            $context = isset($line['context']) && is_array($line['context']) ? $line['context'] : [];
            $gameId = isset($line['gameId']) && is_string($line['gameId']) ? $line['gameId'] : null;
            $gamePhase = isset($line['gamePhase']) && is_string($line['gamePhase']) ? $line['gamePhase'] : null;

            $logTypeRaw = isset($line['logType']) && is_string($line['logType']) ? $line['logType'] : '';
            $logType = in_array($logTypeRaw, ['desync', 'battleSync', 'debug'], true) ? $logTypeRaw : 'debug';

            try {
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
            $appended++;
        }

        return ['success' => true, 'appended' => $appended];
    }
}
