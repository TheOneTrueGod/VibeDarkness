<?php

namespace App;

/**
 * Singleton manager for all game lobbies.
 * Handles lobby creation, lookup, and cleanup. All communication is HTTP (polling).
 */
class LobbyManager
{
    private static ?LobbyManager $instance = null;
    private array $lobbies = [];

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
        $hostPlayer = new Player($hostPlayerId, $hostPlayerName, true);
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
     * Permanently remove a player from a lobby
     */
    public function leaveLobby(string $lobbyId, string $playerId): bool
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
     * Set lobby state (host only). state: 'home' | 'in_game', gameId required when in_game.
     */
    public function setLobbyState(string $lobbyId, string $playerId, string $state, ?string $gameId = null): bool
    {
        $lobby = $this->getLobby($lobbyId);
        if ($lobby === null) {
            return false;
        }
        $player = $lobby->getPlayer($playerId);
        if ($player === null || !$player->isHost()) {
            return false;
        }
        $lobby->setLobbyState($state, $gameId);
        $this->persistLobby($lobby);
        return true;
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
     * Persist lobby to shared storage (used for getLobby when not in memory)
     */
    private function persistLobby(Lobby $lobby): void
    {
        $path = $this->getStoragePath() . '/' . $lobby->getId() . '.json';
        file_put_contents($path, json_encode($lobby->toArrayForStorage(), JSON_PRETTY_PRINT));
    }

    /**
     * Load a lobby from shared storage (e.g. lobby created in another request)
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
     * Get statistics
     */
    public function getStats(): array
    {
        $totalPlayers = 0;
        foreach ($this->lobbies as $lobby) {
            $totalPlayers += $lobby->getPlayerCount();
        }
        return [
            'totalLobbies' => count($this->lobbies),
            'totalPlayers' => $totalPlayers,
        ];
    }
}
