<?php

namespace App\Http\Handlers;

use App\LobbyManager;
use App\AccountService;

class GetLobbyStateHandler
{
    public static function handle(LobbyManager $manager, AccountService $accountService, array $matches): array
    {
        $lobbyId = $matches[1];
        $lobby = $manager->getLobby($lobbyId);
        if ($lobby === null) {
            http_response_code(404);
            return ['success' => false, 'error' => 'Lobby not found'];
        }
        $playerId = $_GET['playerId'] ?? null;
        if ($playerId && !$manager->isPlayerInLobby($lobbyId, $playerId)) {
            http_response_code(403);
            return ['success' => false, 'error' => 'Not in lobby'];
        }
        $gameState = $lobby->getGameState();
        if ($lobby->getLobbyState() === 'in_game' && $lobby->getGameId() !== null) {
            $gameData = $manager->getGameStateData($lobbyId, $lobby->getGameId());
            $gameState['game'] = $gameData;
        }
        return [
            'success' => true,
            'gameState' => $gameState,
            'lastMessageId' => $lobby->getLastMessageId(),
        ];
    }
}
