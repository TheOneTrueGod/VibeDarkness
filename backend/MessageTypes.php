<?php

namespace App;

/**
 * Enum defining all valid message types in the system.
 * Strongly typed for validation and IDE support.
 */
enum MessageType: string
{
    // Chat messages
    case CHAT = 'chat';
    
    // Game interaction messages
    case CLICK = 'click';
    
    // State synchronization
    case STATE_REQUEST = 'state_request';
    case STATE_RESPONSE = 'state_response';
    
    // Player lifecycle events
    case PLAYER_JOIN = 'player_join';
    case PLAYER_LEAVE = 'player_leave';
    case PLAYER_REJOIN = 'player_rejoin';
    
    // System messages
    case ERROR = 'error';
    case PING = 'ping';
    case PONG = 'pong';
    
    // Lobby events
    case LOBBY_UPDATE = 'lobby_update';
    case HOST_CHANGED = 'host_changed';
    
    /**
     * Get the required fields for each message type
     */
    public function getRequiredFields(): array
    {
        return match($this) {
            self::CHAT => ['message'],
            self::CLICK => ['x', 'y'],
            self::STATE_REQUEST => [],
            self::STATE_RESPONSE => ['players', 'clicks', 'chatHistory'],
            self::PLAYER_JOIN => ['playerId', 'playerName', 'color'],
            self::PLAYER_LEAVE => ['playerId'],
            self::PLAYER_REJOIN => ['playerId', 'playerName'],
            self::ERROR => ['message'],
            self::PING => [],
            self::PONG => [],
            self::LOBBY_UPDATE => ['players'],
            self::HOST_CHANGED => ['newHostId'],
        };
    }
    
    /**
     * Get optional fields for each message type
     */
    public function getOptionalFields(): array
    {
        return match($this) {
            self::CHAT => ['timestamp'],
            self::CLICK => ['timestamp'],
            self::STATE_RESPONSE => ['lobbyName'],
            self::PLAYER_JOIN => ['isHost'],
            default => [],
        };
    }
    
    /**
     * Check if this message type should be broadcast to all players
     */
    public function shouldBroadcast(): bool
    {
        return match($this) {
            self::CHAT, self::CLICK, self::PLAYER_JOIN, 
            self::PLAYER_LEAVE, self::PLAYER_REJOIN,
            self::LOBBY_UPDATE, self::HOST_CHANGED => true,
            default => false,
        };
    }
    
    /**
     * Check if this message type should be sent only to the host
     */
    public function isHostOnly(): bool
    {
        return match($this) {
            self::STATE_REQUEST => true,
            default => false,
        };
    }
}
