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

        if ($type === 'mission_vote') {
            $missionId = $payload['missionId'] ?? null;
            if (!$missionId || !is_string($missionId)) {
                http_response_code(400);
                return ['success' => false, 'error' => 'missionId required'];
            }
            $lobby = $manager->getLobby($lobbyId);
            if ($lobby === null) {
                http_response_code(404);
                return ['success' => false, 'error' => 'Lobby not found'];
            }
            $gameId = $lobby->getGameId();
            if (!$gameId) {
                http_response_code(400);
                return ['success' => false, 'error' => 'No active game'];
            }
            
            // Get current game state
            $gameState = $manager->getGameStateData($lobbyId, $gameId);
            if ($gameState === null) {
                http_response_code(404);
                return ['success' => false, 'error' => 'Game state not found'];
            }
            
            // Update mission votes
            $missionVotes = $gameState['missionVotes'] ?? $gameState['mission_votes'] ?? [];
            $missionVotes[$playerId] = $missionId;
            $manager->updateGameState($lobbyId, $gameId, $lobby->getHostId(), ['missionVotes' => $missionVotes]);
            
            // Broadcast vote message
            $messageId = $lobby->addMessage('mission_vote', [
                'playerId' => $playerId,
                'missionId' => $missionId,
            ]);
            $manager->persistLobby($lobby);
            
            // Note: Phase change is handled by the host client calling updateGameState API
            // The host will check for unanimous votes and update the phase
            
            return ['success' => true, 'messageId' => $messageId];
        }

        if ($type === 'character_select') {
            $characterId = $payload['characterId'] ?? null;
            if (!$characterId || !is_string($characterId)) {
                http_response_code(400);
                return ['success' => false, 'error' => 'characterId required'];
            }
            $lobby = $manager->getLobby($lobbyId);
            if ($lobby === null) {
                http_response_code(404);
                return ['success' => false, 'error' => 'Lobby not found'];
            }
            $gameId = $lobby->getGameId();
            if (!$gameId) {
                http_response_code(400);
                return ['success' => false, 'error' => 'No active game'];
            }

            // Get current game state
            $gameState = $manager->getGameStateData($lobbyId, $gameId);
            if ($gameState === null) {
                http_response_code(404);
                return ['success' => false, 'error' => 'Game state not found'];
            }

            // Update character selections
            $characterSelections = $gameState['characterSelections'] ?? $gameState['character_selections'] ?? [];
            $characterSelections[$playerId] = $characterId;
            $manager->updateGameState($lobbyId, $gameId, $lobby->getHostId(), ['characterSelections' => $characterSelections]);

            // Broadcast selection message
            $messageId = $lobby->addMessage('character_select', [
                'playerId' => $playerId,
                'characterId' => $characterId,
            ]);
            $manager->persistLobby($lobby);

            return ['success' => true, 'messageId' => $messageId];
        }

        if ($type === 'game_phase_changed') {
            $gamePhase = $payload['gamePhase'] ?? null;
            if (!$gamePhase || !is_string($gamePhase)) {
                http_response_code(400);
                return ['success' => false, 'error' => 'gamePhase required'];
            }
            $lobby = $manager->getLobby($lobbyId);
            if ($lobby === null) {
                http_response_code(404);
                return ['success' => false, 'error' => 'Lobby not found'];
            }
            
            // Broadcast phase change message
            $messageId = $lobby->addMessage('game_phase_changed', [
                'gamePhase' => $gamePhase,
            ]);
            $manager->persistLobby($lobby);
            
            return ['success' => true, 'messageId' => $messageId];
        }

        http_response_code(400);
        return ['success' => false, 'error' => 'Unknown message type'];
    }
}
