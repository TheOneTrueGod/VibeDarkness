<?php

namespace App;

use Ratchet\ConnectionInterface;

/**
 * Represents a player in the lobby system.
 * Manages player state and WebSocket connection.
 */
class Player
{
    private string $id;
    private string $name;
    private string $color;
    private ?ConnectionInterface $connection;
    private bool $isHost;
    private float $lastActivity;
    private ?string $reconnectToken;
    private array $lastClick;

    // Predefined colors for players
    private const COLORS = [
        '#FF6B6B', // Red
        '#4ECDC4', // Teal
        '#45B7D1', // Blue
        '#96CEB4', // Green
        '#FFEAA7', // Yellow
        '#DDA0DD', // Plum
        '#98D8C8', // Mint
        '#F7DC6F', // Gold
        '#BB8FCE', // Purple
        '#85C1E9', // Light Blue
        '#F8B500', // Orange
        '#58D68D', // Emerald
    ];

    public function __construct(
        string $id,
        string $name,
        ?ConnectionInterface $connection = null,
        bool $isHost = false
    ) {
        $this->id = $id;
        $this->name = $name;
        $this->connection = $connection;
        $this->isHost = $isHost;
        $this->lastActivity = microtime(true);
        $this->reconnectToken = bin2hex(random_bytes(16));
        $this->color = self::generateColor($id);
        $this->lastClick = [];
    }

    /**
     * Generate a consistent color based on player ID
     */
    private static function generateColor(string $id): string
    {
        $hash = crc32($id);
        $index = abs($hash) % count(self::COLORS);
        return self::COLORS[$index];
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getColor(): string
    {
        return $this->color;
    }

    public function getConnection(): ?ConnectionInterface
    {
        return $this->connection;
    }

    public function setConnection(?ConnectionInterface $connection): void
    {
        $this->connection = $connection;
        $this->updateActivity();
    }

    public function isConnected(): bool
    {
        return $this->connection !== null;
    }

    public function isHost(): bool
    {
        return $this->isHost;
    }

    public function setHost(bool $isHost): void
    {
        $this->isHost = $isHost;
    }

    public function getReconnectToken(): string
    {
        return $this->reconnectToken;
    }

    public function regenerateReconnectToken(): string
    {
        $this->reconnectToken = bin2hex(random_bytes(16));
        return $this->reconnectToken;
    }

    public function setReconnectToken(string $token): void
    {
        $this->reconnectToken = $token;
    }

    public function setColor(string $color): void
    {
        $this->color = $color;
    }

    /**
     * Create a Player from stored array (for hydration from shared storage)
     */
    public static function fromArray(array $data): self
    {
        $player = new self(
            $data['id'],
            $data['name'],
            null,
            $data['isHost'] ?? false
        );
        if (isset($data['reconnectToken'])) {
            $player->setReconnectToken($data['reconnectToken']);
        }
        if (isset($data['color'])) {
            $player->setColor($data['color']);
        }
        if (isset($data['lastClick']) && is_array($data['lastClick'])) {
            $player->setLastClickFromArray($data['lastClick']);
        }
        return $player;
    }

    public function updateActivity(): void
    {
        $this->lastActivity = microtime(true);
    }

    public function getLastActivity(): float
    {
        return $this->lastActivity;
    }

    public function getLastClick(): array
    {
        return $this->lastClick;
    }

    public function setLastClick(float $x, float $y): void
    {
        $this->lastClick = [
            'x' => $x,
            'y' => $y,
            'timestamp' => microtime(true),
        ];
    }

    public function setLastClickFromArray(array $click): void
    {
        $this->lastClick = $click;
    }

    /**
     * Send a message to this player
     */
    public function send(Message $message): bool
    {
        if (!$this->isConnected()) {
            return false;
        }

        try {
            $this->connection->send($message->toJson());
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Convert to array for serialization
     */
    public function toArray(bool $includePrivate = false): array
    {
        $data = [
            'id' => $this->id,
            'name' => $this->name,
            'color' => $this->color,
            'isHost' => $this->isHost,
            'isConnected' => $this->isConnected(),
            'lastClick' => $this->lastClick,
        ];

        if ($includePrivate) {
            $data['reconnectToken'] = $this->reconnectToken;
            $data['lastActivity'] = $this->lastActivity;
        }

        return $data;
    }
}
