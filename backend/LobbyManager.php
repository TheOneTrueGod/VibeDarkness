<?php

namespace App;

use Ratchet\ConnectionInterface;

/**
 * Singleton manager for all game lobbies.
 * Handles lobby creation, lookup, and cleanup.
 */
class LobbyManager
{
    private static ?LobbyManager $instance = null;
    private array $lobbies = [];
    private array $connectionToLobby = [];

    private function __construct() {}

    public static function getInstance(): LobbyManager
    {
        if (self::$instance === null) {
            self::$instance = new LobbyManager();
        }
        return self::$instance;
    }

    /**
     * Create a new lobby
     */
    public function createLobby(
        string $name,
        string $hostPlayerId,
        string $hostPlayerName,
        int $maxPlayers = 8,
        bool $isPublic = true
    ): array {
        $lobbyId = $this->generateLobbyId();
        
        $lobby = new Lobby($lobbyId, $name, $hostPlayerId, $maxPlayers, $isPublic);
        
        // Create the host player
        $hostPlayer = new Player($hostPlayerId, $hostPlayerName, null, true);
        $lobby->addPlayer($hostPlayer);
        
        $this->lobbies[$lobbyId] = $lobby;
        
        return [
            'lobby' => $lobby->toArray(true),
            'player' => $hostPlayer->toArray(true),
        ];
    }

    /**
     * Get a lobby by ID
     */
    public function getLobby(string $lobbyId): ?Lobby
    {
        return $this->lobbies[$lobbyId] ?? null;
    }

    /**
     * Get all public lobbies
     */
    public function getPublicLobbies(): array
    {
        $this->cleanupInactiveLobbies();
        
        return array_values(array_filter(
            array_map(fn($lobby) => $lobby->toArray(), $this->lobbies),
            fn($lobby) => $lobby['isPublic']
        ));
    }

    /**
     * Join an existing lobby
     */
    public function joinLobby(
        string $lobbyId,
        string $playerId,
        string $playerName
    ): ?array {
        $lobby = $this->getLobby($lobbyId);
        
        if ($lobby === null) {
            return null;
        }
        
        if ($lobby->isFull()) {
            return ['error' => 'Lobby is full'];
        }

        // Check if player already exists (reconnecting)
        $existingPlayer = $lobby->getPlayer($playerId);
        if ($existingPlayer) {
            return [
                'lobby' => $lobby->toArray(true),
                'player' => $existingPlayer->toArray(true),
                'isRejoin' => true,
            ];
        }

        $player = new Player($playerId, $playerName);
        
        if (!$lobby->addPlayer($player)) {
            return ['error' => 'Failed to join lobby'];
        }
        
        return [
            'lobby' => $lobby->toArray(true),
            'player' => $player->toArray(true),
            'isRejoin' => false,
        ];
    }

    /**
     * Rejoin a lobby using a reconnect token
     */
    public function rejoinLobby(
        string $lobbyId,
        string $reconnectToken,
        ConnectionInterface $connection
    ): ?array {
        $lobby = $this->getLobby($lobbyId);
        
        if ($lobby === null) {
            return null;
        }

        $player = $lobby->getPlayerByReconnectToken($reconnectToken);
        
        if ($player === null) {
            return null;
        }

        // Reconnect the player
        $player->setConnection($connection);
        $this->connectionToLobby[$connection->resourceId] = $lobbyId;

        return [
            'lobby' => $lobby->toArray(true),
            'player' => $player->toArray(true),
            'gameState' => $lobby->getGameState(),
        ];
    }

    /**
     * Connect a player to their WebSocket
     */
    public function connectPlayer(
        string $lobbyId,
        string $playerId,
        ConnectionInterface $connection
    ): ?array {
        $lobby = $this->getLobby($lobbyId);
        
        if ($lobby === null) {
            return null;
        }

        $player = $lobby->getPlayer($playerId);
        
        if ($player === null) {
            return null;
        }

        $player->setConnection($connection);
        $this->connectionToLobby[$connection->resourceId] = $lobbyId;

        return [
            'lobby' => $lobby->toArray(true),
            'player' => $player->toArray(true),
        ];
    }

    /**
     * Handle a player disconnection
     */
    public function handleDisconnect(ConnectionInterface $connection): ?array
    {
        $resourceId = $connection->resourceId;
        
        if (!isset($this->connectionToLobby[$resourceId])) {
            return null;
        }

        $lobbyId = $this->connectionToLobby[$resourceId];
        unset($this->connectionToLobby[$resourceId]);

        $lobby = $this->getLobby($lobbyId);
        
        if ($lobby === null) {
            return null;
        }

        $player = $lobby->getPlayerByConnection($connection);
        
        if ($player === null) {
            return null;
        }

        // Don't remove the player, just disconnect them (allows rejoin)
        $player->setConnection(null);

        return [
            'lobbyId' => $lobbyId,
            'playerId' => $player->getId(),
            'playerName' => $player->getName(),
        ];
    }

    /**
     * Permanently remove a player from a lobby
     */
    public function leavelobby(string $lobbyId, string $playerId): bool
    {
        $lobby = $this->getLobby($lobbyId);
        
        if ($lobby === null) {
            return false;
        }

        $player = $lobby->removePlayer($playerId);
        
        if ($player === null) {
            return false;
        }

        // Remove lobby if empty
        if ($lobby->isEmpty()) {
            unset($this->lobbies[$lobbyId]);
        }

        return true;
    }

    /**
     * Get lobby by connection
     */
    public function getLobbyByConnection(ConnectionInterface $connection): ?Lobby
    {
        $resourceId = $connection->resourceId;
        
        if (!isset($this->connectionToLobby[$resourceId])) {
            return null;
        }

        return $this->getLobby($this->connectionToLobby[$resourceId]);
    }

    /**
     * Clean up inactive lobbies
     */
    public function cleanupInactiveLobbies(): int
    {
        $removed = 0;
        
        foreach ($this->lobbies as $id => $lobby) {
            if ($lobby->isInactive() || $lobby->isEmpty()) {
                unset($this->lobbies[$id]);
                $removed++;
            }
        }
        
        return $removed;
    }

    /**
     * Generate a unique lobby ID
     */
    private function generateLobbyId(): string
    {
        do {
            // Generate a 6-character alphanumeric code
            $id = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        } while (isset($this->lobbies[$id]));
        
        return $id;
    }

    /**
     * Get statistics
     */
    public function getStats(): array
    {
        $totalPlayers = 0;
        $connectedPlayers = 0;
        
        foreach ($this->lobbies as $lobby) {
            $totalPlayers += $lobby->getPlayerCount();
            $connectedPlayers += count($lobby->getConnectedPlayers());
        }
        
        return [
            'totalLobbies' => count($this->lobbies),
            'totalPlayers' => $totalPlayers,
            'connectedPlayers' => $connectedPlayers,
        ];
    }
}
