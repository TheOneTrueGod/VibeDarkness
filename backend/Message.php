<?php

namespace App;

use InvalidArgumentException;

/**
 * Represents a validated message in the system.
 * Provides strong typing and validation for all message types.
 */
class Message
{
    private MessageType $type;
    private array $data;
    private ?string $senderId;
    private float $timestamp;

    private function __construct(
        MessageType $type,
        array $data,
        ?string $senderId = null,
        ?float $timestamp = null
    ) {
        $this->type = $type;
        $this->data = $data;
        $this->senderId = $senderId;
        $this->timestamp = $timestamp ?? microtime(true);
    }

    /**
     * Create a message from raw JSON data with validation
     * 
     * @throws InvalidArgumentException if validation fails
     */
    public static function fromJson(string $json, ?string $senderId = null): self
    {
        $decoded = json_decode($json, true);
        
        if ($decoded === null) {
            throw new InvalidArgumentException('Invalid JSON');
        }
        
        return self::fromArray($decoded, $senderId);
    }

    /**
     * Create a message from an array with validation
     * 
     * @throws InvalidArgumentException if validation fails
     */
    public static function fromArray(array $data, ?string $senderId = null): self
    {
        if (!isset($data['type'])) {
            throw new InvalidArgumentException('Message must have a type');
        }
        
        $type = MessageType::tryFrom($data['type']);
        
        if ($type === null) {
            throw new InvalidArgumentException("Unknown message type: {$data['type']}");
        }
        
        $messageData = $data['data'] ?? [];
        
        // Validate required fields
        $requiredFields = $type->getRequiredFields();
        foreach ($requiredFields as $field) {
            if (!array_key_exists($field, $messageData)) {
                throw new InvalidArgumentException(
                    "Missing required field '{$field}' for message type '{$type->value}'"
                );
            }
        }
        
        // Type-specific validation
        self::validateTypeSpecific($type, $messageData);
        
        $timestamp = $data['timestamp'] ?? null;
        
        return new self($type, $messageData, $senderId, $timestamp);
    }

    /**
     * Create a message programmatically (for server-generated messages)
     */
    public static function create(MessageType $type, array $data, ?string $senderId = null): self
    {
        return new self($type, $data, $senderId);
    }

    /**
     * Perform type-specific validation
     */
    private static function validateTypeSpecific(MessageType $type, array $data): void
    {
        match($type) {
            MessageType::CLICK => self::validateClick($data),
            MessageType::CHAT => self::validateChat($data),
            MessageType::STATE_RESPONSE => self::validateStateResponse($data),
            default => null,
        };
    }

    private static function validateClick(array $data): void
    {
        if (!is_numeric($data['x']) || !is_numeric($data['y'])) {
            throw new InvalidArgumentException('Click coordinates must be numeric');
        }
        
        if ($data['x'] < 0 || $data['y'] < 0) {
            throw new InvalidArgumentException('Click coordinates must be non-negative');
        }
    }

    private static function validateChat(array $data): void
    {
        if (!is_string($data['message'])) {
            throw new InvalidArgumentException('Chat message must be a string');
        }
        
        if (strlen($data['message']) === 0) {
            throw new InvalidArgumentException('Chat message cannot be empty');
        }
        
        if (strlen($data['message']) > 1000) {
            throw new InvalidArgumentException('Chat message too long (max 1000 characters)');
        }
    }

    private static function validateStateResponse(array $data): void
    {
        if (!is_array($data['players'])) {
            throw new InvalidArgumentException('Players must be an array');
        }
        
        if (!is_array($data['clicks'])) {
            throw new InvalidArgumentException('Clicks must be an array');
        }
        
        if (!is_array($data['chatHistory'])) {
            throw new InvalidArgumentException('Chat history must be an array');
        }
    }

    public function getType(): MessageType
    {
        return $this->type;
    }

    public function getData(): array
    {
        return $this->data;
    }

    public function getSenderId(): ?string
    {
        return $this->senderId;
    }

    public function getTimestamp(): float
    {
        return $this->timestamp;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->data[$key] ?? $default;
    }

    /**
     * Convert to array for JSON encoding
     */
    public function toArray(): array
    {
        return [
            'type' => $this->type->value,
            'data' => $this->data,
            'senderId' => $this->senderId,
            'timestamp' => $this->timestamp,
        ];
    }

    /**
     * Convert to JSON string
     */
    public function toJson(): string
    {
        return json_encode($this->toArray());
    }

    /**
     * Check if this message should be broadcast
     */
    public function shouldBroadcast(): bool
    {
        return $this->type->shouldBroadcast();
    }

    /**
     * Check if this message should only go to the host
     */
    public function isHostOnly(): bool
    {
        return $this->type->isHostOnly();
    }
}
