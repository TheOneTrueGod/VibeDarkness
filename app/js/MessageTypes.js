/**
 * Message Types - Mirrors backend MessageTypes.php
 * Strongly typed message definitions for client-server communication
 */

const MessageType = Object.freeze({
    // Chat messages
    CHAT: 'chat',
    
    // Game interaction messages
    CLICK: 'click',
    
    // State synchronization
    STATE_REQUEST: 'state_request',
    STATE_RESPONSE: 'state_response',
    
    // Player lifecycle events
    PLAYER_JOIN: 'player_join',
    PLAYER_LEAVE: 'player_leave',
    PLAYER_REJOIN: 'player_rejoin',
    
    // System messages
    ERROR: 'error',
    PING: 'ping',
    PONG: 'pong',
    
    // Lobby events
    LOBBY_UPDATE: 'lobby_update',
    HOST_CHANGED: 'host_changed',
});

/**
 * Required fields for each message type
 */
const MessageSchema = Object.freeze({
    [MessageType.CHAT]: {
        required: ['message'],
        optional: ['timestamp'],
    },
    [MessageType.CLICK]: {
        required: ['x', 'y'],
        optional: ['timestamp'],
    },
    [MessageType.STATE_REQUEST]: {
        required: [],
        optional: ['requestingPlayerId'],
    },
    [MessageType.STATE_RESPONSE]: {
        required: ['players', 'clicks', 'chatHistory'],
        optional: ['lobbyName', 'targetPlayerId'],
    },
    [MessageType.PLAYER_JOIN]: {
        required: ['playerId', 'playerName', 'color'],
        optional: ['isHost'],
    },
    [MessageType.PLAYER_LEAVE]: {
        required: ['playerId'],
        optional: ['playerName'],
    },
    [MessageType.PLAYER_REJOIN]: {
        required: ['playerId', 'playerName'],
        optional: [],
    },
    [MessageType.ERROR]: {
        required: ['message'],
        optional: [],
    },
    [MessageType.PING]: {
        required: [],
        optional: [],
    },
    [MessageType.PONG]: {
        required: [],
        optional: [],
    },
    [MessageType.LOBBY_UPDATE]: {
        required: ['players'],
        optional: [],
    },
    [MessageType.HOST_CHANGED]: {
        required: ['newHostId'],
        optional: [],
    },
});

/**
 * Message class for creating and validating messages
 */
class Message {
    constructor(type, data = {}, senderId = null) {
        this.type = type;
        this.data = data;
        this.senderId = senderId;
        this.timestamp = Date.now() / 1000;
    }

    /**
     * Create a message from raw data
     */
    static fromRaw(raw) {
        if (typeof raw === 'string') {
            raw = JSON.parse(raw);
        }
        
        const message = new Message(raw.type, raw.data || {}, raw.senderId);
        message.timestamp = raw.timestamp || Date.now() / 1000;
        return message;
    }

    /**
     * Validate the message against its schema
     */
    validate() {
        const schema = MessageSchema[this.type];
        
        if (!schema) {
            throw new Error(`Unknown message type: ${this.type}`);
        }

        for (const field of schema.required) {
            if (!(field in this.data)) {
                throw new Error(`Missing required field '${field}' for message type '${this.type}'`);
            }
        }

        return true;
    }

    /**
     * Convert to object for sending
     */
    toObject() {
        return {
            type: this.type,
            data: this.data,
            senderId: this.senderId,
            timestamp: this.timestamp,
        };
    }

    /**
     * Convert to JSON string
     */
    toJSON() {
        return JSON.stringify(this.toObject());
    }

    /**
     * Helper to get a data field
     */
    get(key, defaultValue = null) {
        return this.data[key] ?? defaultValue;
    }
}

/**
 * Factory functions for creating specific message types
 */
const Messages = {
    chat(message) {
        return new Message(MessageType.CHAT, { message });
    },

    click(x, y) {
        return new Message(MessageType.CLICK, { x, y });
    },

    stateRequest() {
        return new Message(MessageType.STATE_REQUEST, {});
    },

    stateResponse(players, clicks, chatHistory, targetPlayerId = null) {
        const data = { players, clicks, chatHistory };
        if (targetPlayerId) {
            data.targetPlayerId = targetPlayerId;
        }
        return new Message(MessageType.STATE_RESPONSE, data);
    },

    ping() {
        return new Message(MessageType.PING, {});
    },
};

// Export for module usage (when needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MessageType, MessageSchema, Message, Messages };
}
