<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class PostMessageHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $data = \getJsonBody();
        $playerId = $data['playerId'] ?? null;
        $type = $data['type'] ?? null;
        $payload = $data['data'] ?? [];

        if (!$playerId || !$type) {
            http_response_code(400);
            return ['success' => false, 'error' => 'playerId and type required'];
        }
        if (!$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Not in lobby'];
        }

        if ($type === 'chat') {
            $message = $payload['message'] ?? '';
            $messageId = $manager->addChatMessage($lobbyId, $playerId, $message);
            if ($messageId === null) {
                http_response_code(500);
                return ['success' => false, 'error' => 'Failed to add message'];
            }
            return ['success' => true, 'messageId' => $messageId];
        }

        if ($type === 'click') {
            $x = isset($payload['x']) ? (float) $payload['x'] : null;
            $y = isset($payload['y']) ? (float) $payload['y'] : null;
            if ($x === null || $y === null) {
                http_response_code(400);
                return ['success' => false, 'error' => 'x and y required'];
            }
            $messageId = $manager->recordClick($lobbyId, $playerId, $x, $y);
            if ($messageId === null) {
                http_response_code(500);
                return ['success' => false, 'error' => 'Failed to record click'];
            }
            return ['success' => true, 'messageId' => $messageId];
        }

        http_response_code(400);
        return ['success' => false, 'error' => 'Unknown message type'];
    }
}
