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
        $lobby->addMessage('player_join', [
            'playerId' => $hostPlayer->getId(),
            'playerName' => $hostPlayer->getName(),
            'color' => $hostPlayer->getColor(),
            'isHost' => true,
        ]);
        $this->persistLobby($lobby);

        return [
            'lobby' => $lobby->toArray(true),
            'player' => $hostPlayer->toArray(true),
        ];
    }

    /**
     * Get a lobby by ID. If not in memory (e.g. created via HTTP), load from shared storage.
     */
    public function getLobby(string $lobbyId): ?Lobby
    {
        if (isset($this->lobbies[$lobbyId])) {
            return $this->lobbies[$lobbyId];
        }
        return $this->loadLobbyFromStorage($lobbyId);
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

        $lobby->addMessage('player_join', [
            'playerId' => $player->getId(),
            'playerName' => $player->getName(),
            'color' => $player->getColor(),
            'isHost' => false,
        ]);
        $this->persistLobby($lobby);

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
        // Player may have joined via HTTP; try to add them from storage without replacing the in-memory lobby
        if ($player === null) {
            $player = $this->addPlayerFromStorage($lobbyId, $playerId, $lobby);
        }
        
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

        $player = $lobby->getPlayer($playerId);
        if ($player === null) {
            return false;
        }

        $playerName = $player->getName();
        $wasHost = $player->isHost();
        $lobby->addMessage('player_leave', ['playerId' => $playerId, 'playerName' => $playerName]);
        $lobby->removePlayer($playerId);

        if ($wasHost && !$lobby->isEmpty()) {
            $newHost = $lobby->getHost();
            if ($newHost !== null) {
                $lobby->addMessage('host_changed', ['newHostId' => $newHost->getId()]);
            }
        }

        $this->persistLobby($lobby);

        if ($lobby->isEmpty()) {
            unset($this->lobbies[$lobbyId]);
        }

        return true;
    }

    /**
     * Get recent messages for a lobby (for polling clients).
     * If $afterMessageId is null, returns the most recent $limit messages.
     * Otherwise returns up to $limit messages after that id.
     */
    public function getMessages(string $lobbyId, ?int $afterMessageId, int $limit = 10): array
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return [];
        }
        return $lobby->getMessages($afterMessageId, $limit);
    }

    /**
     * Add a chat message and persist (for HTTP clients).
     */
    public function addChatMessage(string $lobbyId, string $playerId, string $message): ?int
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return null;
        }
        $lobby->addChatMessage($playerId, $message);
        $this->persistLobby($lobby);
        return $lobby->getLastMessageId();
    }

    /**
     * Record a click and add to message log (for HTTP clients).
     */
    public function recordClick(string $lobbyId, string $playerId, float $x, float $y): ?int
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return null;
        }
        $player = $lobby->getPlayer($playerId);
        if ($player === null) {
            return null;
        }
        $player->setLastClick($x, $y);
        $messageId = $lobby->addMessage('click', [
            'playerId' => $player->getId(),
            'playerName' => $player->getName(),
            'color' => $player->getColor(),
            'x' => $x,
            'y' => $y,
        ]);
        $this->persistLobby($lobby);
        return $messageId;
    }

    /**
     * Verify a player is in the lobby (for message API auth).
     */
    public function isPlayerInLobby(string $lobbyId, string $playerId): bool
    {
        $lobby = $this->getLobby($lobbyId);
        return $lobby !== null && $lobby->getPlayer($playerId) !== null;
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
        $storageDir = $this->getStoragePath();
        do {
            $id = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
        } while (isset($this->lobbies[$id]) || (is_dir($storageDir) && file_exists($storageDir . '/' . $id . '.json')));
        
        return $id;
    }

    private function getStoragePath(): string
    {
        $path = dirname(__DIR__) . '/storage/lobbies';
        if (!is_dir($path)) {
            mkdir($path, 0755, true);
        }
        return $path;
    }

    /**
     * Persist lobby to shared storage so the WebSocket process can load it
     */
    private function persistLobby(Lobby $lobby): void
    {
        $path = $this->getStoragePath() . '/' . $lobby->getId() . '.json';
        file_put_contents($path, json_encode($lobby->toArrayForStorage(), JSON_PRETTY_PRINT));
    }

    /**
     * Load a lobby from shared storage (used when WS server receives connect for HTTP-created lobby)
     */
    private function loadLobbyFromStorage(string $lobbyId): ?Lobby
    {
        $path = $this->getStoragePath() . '/' . $lobbyId . '.json';
        if (!is_file($path)) {
            return null;
        }
        $json = file_get_contents($path);
        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }
        $lobby = Lobby::fromArray($data);
        $this->lobbies[$lobbyId] = $lobby;
        return $lobby;
    }

    /**
     * Add a player to an in-memory lobby from storage (e.g. they joined via HTTP). Returns the player if found and added.
     */
    private function addPlayerFromStorage(string $lobbyId, string $playerId, Lobby $lobby): ?Player
    {
        $path = $this->getStoragePath() . '/' . $lobbyId . '.json';
        if (!is_file($path)) {
            return null;
        }
        $json = file_get_contents($path);
        $data = json_decode($json, true);
        if (!is_array($data) || empty($data['players'])) {
            return null;
        }
        foreach ($data['players'] as $pData) {
            if (($pData['id'] ?? '') === $playerId) {
                $player = Player::fromArray($pData);
                $lobby->addPlayer($player);
                return $player;
            }
        }
        return null;
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
