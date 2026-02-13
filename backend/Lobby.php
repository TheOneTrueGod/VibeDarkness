<?php

namespace App;

/**
 * Represents a game lobby containing multiple players.
 * Manages players, game state, and message log for HTTP polling.
 */
class Lobby
{
    private string $id;
    private string $name;
    private string $hostId;
    private array $players = [];
    private array $chatHistory = [];
    /** @var array<int, array{messageId: int, type: string, timestamp: float, data: array}> */
    private array $messages = [];
    private int $lastMessageId = 0;
    private float $createdAt;
    private float $lastActivity;
    private int $maxPlayers;
    private bool $isPublic;
    private string $lobbyState = 'home';
    private ?string $gameId = null;

    private const MAX_CHAT_HISTORY = 100;
    private const MAX_MESSAGES = 500;
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

    public function getLobbyState(): string
    {
        return $this->lobbyState;
    }

    public function getGameId(): ?string
    {
        return $this->gameId;
    }

    /**
     * Set lobby state (host only). state: 'home' | 'in_game', gameId required when in_game.
     */
    public function setLobbyState(string $state, ?string $gameId = null): void
    {
        $this->lobbyState = $state;
        $this->gameId = $gameId;
        $this->updateActivity();
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
     * Get all players
     */
    public function getPlayers(): array
    {
        return $this->players;
    }

    /**
     * Assign a new host (first player in lobby when previous host left)
     */
    private function assignNewHost(): void
    {
        $newHost = reset($this->players);
        if (!$newHost) {
            return;
        }
        $oldHostId = $this->hostId;
        if (isset($this->players[$oldHostId])) {
            $this->players[$oldHostId]->setHost(false);
        }
        $this->hostId = $newHost->getId();
        $newHost->setHost(true);
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
        $this->addMessage('chat', $chatEntry);

        // Trim history if too long
        if (count($this->chatHistory) > self::MAX_CHAT_HISTORY) {
            array_shift($this->chatHistory);
        }

        $this->updateActivity();

        return $chatEntry;
    }

    /**
     * Add a message to the lobby log (stored for polling clients).
     * Returns the new messageId.
     */
    public function addMessage(string $type, array $data): int
    {
        $this->lastMessageId++;
        $this->messages[] = [
            'messageId' => $this->lastMessageId,
            'type' => $type,
            'timestamp' => microtime(true),
            'data' => $data,
        ];
        if (count($this->messages) > self::MAX_MESSAGES) {
            array_shift($this->messages);
        }
        $this->updateActivity();
        return $this->lastMessageId;
    }

    public function getLastMessageId(): int
    {
        return $this->lastMessageId;
    }

    /**
     * Get messages for polling. If $afterMessageId is null, return the most recent $limit messages (newest last).
     * Otherwise return up to $limit messages after the given messageId in ascending messageId order.
     */
    public function getMessages(?int $afterMessageId, int $limit = 10): array
    {
        if ($afterMessageId === null) {
            return array_values(array_slice($this->messages, -$limit));
        }
        $result = [];
        foreach ($this->messages as $msg) {
            if ($msg['messageId'] > $afterMessageId) {
                $result[] = $msg;
                if (count($result) >= $limit) {
                    break;
                }
            }
        }
        return $result;
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
     * Get current game state (for initial load / polling clients)
     */
    public function getGameState(): array
    {
        return [
            'lobbyId' => $this->id,
            'lobbyName' => $this->name,
            'hostId' => $this->hostId,
            'lobbyState' => $this->lobbyState,
            'gameId' => $this->gameId,
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

    /**
     * Export full state for persistence
     */
    public function toArrayForStorage(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'hostId' => $this->hostId,
            'maxPlayers' => $this->maxPlayers,
            'isPublic' => $this->isPublic,
            'createdAt' => $this->createdAt,
            'lastActivity' => $this->lastActivity,
            'players' => array_map(fn($p) => $p->toArray(true), $this->players),
            'chatHistory' => $this->chatHistory,
            'messages' => $this->messages,
            'lastMessageId' => $this->lastMessageId,
            'lobbyState' => $this->lobbyState,
            'gameId' => $this->gameId,
        ];
    }

    /**
     * Create a Lobby from stored array (for hydration from shared storage)
     */
    public static function fromArray(array $data): self
    {
        $lobby = new self(
            $data['id'],
            $data['name'],
            $data['hostId'],
            $data['maxPlayers'] ?? 8,
            $data['isPublic'] ?? true
        );
        if (isset($data['createdAt'])) {
            $lobby->createdAt = (float) $data['createdAt'];
        }
        if (isset($data['lastActivity'])) {
            $lobby->lastActivity = (float) $data['lastActivity'];
        }
        foreach ($data['players'] ?? [] as $pData) {
            $lobby->addPlayer(Player::fromArray($pData));
        }
        if (isset($data['chatHistory']) && is_array($data['chatHistory'])) {
            $lobby->chatHistory = $data['chatHistory'];
        }
        if (isset($data['messages']) && is_array($data['messages'])) {
            $lobby->messages = $data['messages'];
        }
        if (isset($data['lastMessageId'])) {
            $lobby->lastMessageId = (int) $data['lastMessageId'];
        }
        if (isset($data['lobbyState'])) {
            $lobby->lobbyState = $data['lobbyState'];
        }
        if (array_key_exists('gameId', $data)) {
            $lobby->gameId = $data['gameId'];
        }
        return $lobby;
    }
}
