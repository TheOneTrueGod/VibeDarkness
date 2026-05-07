<?php

namespace App\Http\Handlers\Battle;

use App\AccountService;
use App\BattleStorage;
use App\LobbyManager;
use InvalidArgumentException;
use RuntimeException;

class AppendOrderHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $gameId = $matches[2];
        $data = \getJsonBody();

        $playerId = isset($data['playerId']) ? (string) $data['playerId'] : '';
        $atTick = $data['atTick'] ?? null;
        $order = $data['order'] ?? null;

        if ($playerId === '' || $atTick === null || !is_array($order)) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId, atTick, and order are required'];
        }
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Player not in lobby'];
        }

        try {
            $storage = new BattleStorage();
            $record = [
                'atTick' => (int) $atTick,
                'playerId' => $playerId,
                'order' => $order,
            ];
            if (isset($data['idHash']) && is_string($data['idHash']) && $data['idHash'] !== '') {
                $record['idHash'] = $data['idHash'];
            }
            if (isset($data['ts'])) {
                $record['ts'] = (int) $data['ts'];
            }
            $appended = $storage->appendOrder($lobbyId, $gameId, $record);
        } catch (InvalidArgumentException $e) {
            http_response_code(400);
            return ['success' => false, 'error' => $e->getMessage()];
        } catch (RuntimeException $e) {
            http_response_code(500);
            return ['success' => false, 'error' => $e->getMessage()];
        }

        return ['success' => true, 'appended' => $appended];
    }
}
