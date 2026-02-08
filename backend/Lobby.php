<?php

namespace App;

use Ratchet\ConnectionInterface;

/**
 * Represents a game lobby containing multiple players.
 * Manages player connections, game state, and message routing.
 */
class Lobby
{
    private string $id;
    private string $name;
    private string $hostId;
    private array $players = [];
    private array $chatHistory = [];
    private float $createdAt;
    private float $lastActivity;
    private int $maxPlayers;
    private bool $isPublic;

    private const MAX_CHAT_HISTORY = 100;
    private const INACTIVE_TIMEOUT = 3600; // 1 hour

    public function __construct(
        string $id,
        string $name,
        string $hostId,
        int $maxPlayers = 8,
        bool $isPublic = true
    ) {
        $this->id = $id;
        $this->name = $name;
        $this->hostId = $hostId;
        $this->maxPlayers = $maxPlayers;
        $this->isPublic = $isPublic;
        $this->createdAt = microtime(true);
        $this->lastActivity = microtime(true);
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getHostId(): string
    {
        return $this->hostId;
    }

    public function getHost(): ?Player
    {
        return $this->players[$this->hostId] ?? null;
    }

    public function isPublic(): bool
    {
        return $this->isPublic;
    }

    public function getMaxPlayers(): int
    {
        return $this->maxPlayers;
    }

    public function getPlayerCount(): int
    {
        return count($this->players);
    }

    public function isFull(): bool
    {
        return $this->getPlayerCount() >= $this->maxPlayers;
    }

    public function isEmpty(): bool
    {
        return $this->getPlayerCount() === 0;
    }

    public function updateActivity(): void
    {
        $this->lastActivity = microtime(true);
    }

    public function isInactive(): bool
    {
        return (microtime(true) - $this->lastActivity) > self::INACTIVE_TIMEOUT;
    }

    /**
     * Add a player to the lobby
     */
    public function addPlayer(Player $player): bool
    {
        if ($this->isFull()) {
            return false;
        }

        $this->players[$player->getId()] = $player;
        $this->updateActivity();
        
        return true;
    }

    /**
     * Remove a player from the lobby
     */
    public function removePlayer(string $playerId): ?Player
    {
        if (!isset($this->players[$playerId])) {
            return null;
        }

        $player = $this->players[$playerId];
        unset($this->players[$playerId]);
        $this->updateActivity();

        // If the removed player was the host, assign a new host
        if ($playerId === $this->hostId && !$this->isEmpty()) {
            $this->assignNewHost();
        }

        return $player;
    }

    /**
     * Get a player by ID
     */
    public function getPlayer(string $playerId): ?Player
    {
        return $this->players[$playerId] ?? null;
    }

    /**
     * Get a player by their reconnect token
     */
    public function getPlayerByReconnectToken(string $token): ?Player
    {
        foreach ($this->players as $player) {
            if ($player->getReconnectToken() === $token) {
                return $player;
            }
        }
        return null;
    }

    /**
     * Get a player by their WebSocket connection
     */
    public function getPlayerByConnection(ConnectionInterface $conn): ?Player
    {
        foreach ($this->players as $player) {
            if ($player->getConnection() === $conn) {
                return $player;
            }
        }
        return null;
    }

    /**
     * Get all players
     */
    public function getPlayers(): array
    {
        return $this->players;
    }

    /**
     * Get connected players only
     */
    public function getConnectedPlayers(): array
    {
        return array_filter($this->players, fn($p) => $p->isConnected());
    }

    /**
     * Assign a new host (first connected player)
     */
    private function assignNewHost(): void
    {
        $connectedPlayers = $this->getConnectedPlayers();
        
        if (empty($connectedPlayers)) {
            // Use any player if none are connected
            $newHost = reset($this->players);
        } else {
            $newHost = reset($connectedPlayers);
        }

        if ($newHost) {
            $oldHostId = $this->hostId;
            
            // Update host status
            if (isset($this->players[$oldHostId])) {
                $this->players[$oldHostId]->setHost(false);
            }
            
            $this->hostId = $newHost->getId();
            $newHost->setHost(true);

            // Notify all players of host change
            $this->broadcast(Message::create(
                MessageType::HOST_CHANGED,
                ['newHostId' => $this->hostId]
            ));
        }
    }

    /**
     * Add a chat message to history
     */
    public function addChatMessage(string $playerId, string $message): array
    {
        $player = $this->getPlayer($playerId);
        
        $chatEntry = [
            'playerId' => $playerId,
            'playerName' => $player?->getName() ?? 'Unknown',
            'playerColor' => $player?->getColor() ?? '#888888',
            'message' => $message,
            'timestamp' => microtime(true),
        ];

        $this->chatHistory[] = $chatEntry;

        // Trim history if too long
        if (count($this->chatHistory) > self::MAX_CHAT_HISTORY) {
            array_shift($this->chatHistory);
        }

        $this->updateActivity();
        
        return $chatEntry;
    }

    /**
     * Get chat history
     */
    public function getChatHistory(): array
    {
        return $this->chatHistory;
    }

    /**
     * Get all player clicks
     */
    public function getAllClicks(): array
    {
        $clicks = [];
        foreach ($this->players as $player) {
            $click = $player->getLastClick();
            if (!empty($click)) {
                $clicks[$player->getId()] = [
                    'playerId' => $player->getId(),
                    'playerName' => $player->getName(),
                    'color' => $player->getColor(),
                    'x' => $click['x'],
                    'y' => $click['y'],
                    'timestamp' => $click['timestamp'],
                ];
            }
        }
        return $clicks;
    }

    /**
     * Broadcast a message to all connected players
     */
    public function broadcast(Message $message, ?string $excludePlayerId = null): void
    {
        foreach ($this->players as $player) {
            if ($excludePlayerId !== null && $player->getId() === $excludePlayerId) {
                continue;
            }
            $player->send($message);
        }
    }

    /**
     * Send a message to the host only
     */
    public function sendToHost(Message $message): bool
    {
        $host = $this->getHost();
        return $host?->send($message) ?? false;
    }

    /**
     * Get current game state (for new/rejoining players)
     */
    public function getGameState(): array
    {
        return [
            'lobbyId' => $this->id,
            'lobbyName' => $this->name,
            'hostId' => $this->hostId,
            'players' => array_map(fn($p) => $p->toArray(), $this->players),
            'clicks' => $this->getAllClicks(),
            'chatHistory' => $this->chatHistory,
        ];
    }

    /**
     * Convert to array for API responses
     */
    public function toArray(bool $includeDetails = false): array
    {
        $data = [
            'id' => $this->id,
            'name' => $this->name,
            'playerCount' => $this->getPlayerCount(),
            'maxPlayers' => $this->maxPlayers,
            'isPublic' => $this->isPublic,
            'hostId' => $this->hostId,
        ];

        if ($includeDetails) {
            $data['players'] = array_map(fn($p) => $p->toArray(), $this->players);
            $data['createdAt'] = $this->createdAt;
            $data['lastActivity'] = $this->lastActivity;
        }

        return $data;
    }
}
