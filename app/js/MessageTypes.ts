/**
 * Message Types - Mirrors backend MessageTypes.php
 * Strongly typed message definitions for client-server communication
 */

export const MessageType = Object.freeze({
    CHAT: 'chat',
    NPC_CHAT: 'npc_chat',
    CLICK: 'click',
    WEBRTC_SIGNAL: 'webrtc_signal',
    STATE_REQUEST: 'state_request',
    STATE_RESPONSE: 'state_response',
    PLAYER_JOIN: 'player_join',
    PLAYER_LEAVE: 'player_leave',
    PLAYER_REJOIN: 'player_rejoin',
    ERROR: 'error',
    PING: 'ping',
    PONG: 'pong',
    LOBBY_UPDATE: 'lobby_update',
    HOST_CHANGED: 'host_changed',
    MISSION_VOTE: 'mission_vote',
    CHARACTER_SELECT: 'character_select',
    CHARACTER_SELECT_READY: 'character_select_ready',
    GAME_PHASE_CHANGED: 'game_phase_changed',
    BATTLE_ORDERS_READY: 'battle_orders_ready',
    STORY_CHOICE: 'story_choice',
    STORY_READY: 'story_ready',
    STORY_GRANT_EQUIPMENT_RANDOM: 'story_grant_equipment_random',
    STORY_GROUP_VOTE: 'story_group_vote',
    STORY_GROUP_VOTE_APPLY: 'story_group_vote_apply',
} as const);

type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

interface SchemaDef {
    required: string[];
    optional: string[];
}

const MessageSchema: Record<string, SchemaDef> = Object.freeze({
    [MessageType.CHAT]: { required: ['message'], optional: ['timestamp'] },
    [MessageType.NPC_CHAT]: { required: ['npcId', 'message'], optional: ['timestamp'] },
    [MessageType.CLICK]: { required: ['x', 'y'], optional: ['timestamp'] },
    [MessageType.WEBRTC_SIGNAL]: { required: ['fromPlayerId', 'toPlayerId', 'signal'], optional: [] },
    [MessageType.STATE_REQUEST]: { required: [], optional: ['requestingPlayerId'] },
    [MessageType.STATE_RESPONSE]: {
        required: ['players', 'clicks', 'chatHistory'],
        optional: ['lobbyName', 'targetPlayerId'],
    },
    [MessageType.PLAYER_JOIN]: { required: ['playerId', 'playerName', 'color'], optional: ['isHost'] },
    [MessageType.PLAYER_LEAVE]: { required: ['playerId'], optional: ['playerName'] },
    [MessageType.PLAYER_REJOIN]: { required: ['playerId', 'playerName'], optional: [] },
    [MessageType.ERROR]: { required: ['message'], optional: [] },
    [MessageType.PING]: { required: [], optional: [] },
    [MessageType.PONG]: { required: [], optional: [] },
    [MessageType.LOBBY_UPDATE]: { required: ['players'], optional: [] },
    [MessageType.HOST_CHANGED]: { required: ['newHostId'], optional: [] },
    [MessageType.MISSION_VOTE]: { required: ['playerId', 'missionId'], optional: [] },
    [MessageType.CHARACTER_SELECT]: { required: ['playerId', 'characterId'], optional: [] },
    [MessageType.CHARACTER_SELECT_READY]: { required: [], optional: [] },
    [MessageType.GAME_PHASE_CHANGED]: { required: ['gamePhase'], optional: [] },
    [MessageType.BATTLE_ORDERS_READY]: { required: ['snapshotIndex'], optional: [] },
    [MessageType.STORY_CHOICE]: { required: ['choiceId', 'optionId'], optional: [] },
    [MessageType.STORY_READY]: { required: [], optional: [] },
    [MessageType.STORY_GRANT_EQUIPMENT_RANDOM]: {
        required: ['missionId', 'phraseIndex', 'itemId'],
        optional: ['seedSuffix'],
    },
    [MessageType.STORY_GROUP_VOTE]: {
        required: ['voteId', 'phraseIndex', 'optionId'],
        optional: [],
    },
    [MessageType.STORY_GROUP_VOTE_APPLY]: {
        required: ['voteId', 'phraseIndex', 'effect'],
        optional: [],
    },
});

export class Message {
    type: MessageTypeValue;
    data: Record<string, unknown>;
    senderId: string | null;
    timestamp: number;

    constructor(type: MessageTypeValue, data: Record<string, unknown> = {}, senderId: string | null = null) {
        this.type = type;
        this.data = data;
        this.senderId = senderId;
        this.timestamp = Date.now() / 1000;
    }

    static fromRaw(raw: string | { type: string; data?: Record<string, unknown>; senderId?: string; timestamp?: number }): Message {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) as { type: string; data?: Record<string, unknown>; senderId?: string; timestamp?: number } : raw;
        const message = new Message(parsed.type as MessageTypeValue, parsed.data ?? {}, parsed.senderId ?? null);
        message.timestamp = parsed.timestamp ?? Date.now() / 1000;
        return message;
    }

    validate(): boolean {
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

    toObject(): { type: string; data: Record<string, unknown>; senderId: string | null; timestamp: number } {
        return {
            type: this.type,
            data: this.data,
            senderId: this.senderId,
            timestamp: this.timestamp,
        };
    }

    toJSON(): string {
        return JSON.stringify(this.toObject());
    }

    get(key: string, defaultValue: unknown = null): unknown {
        return this.data[key] ?? defaultValue;
    }
}

export const Messages = {
    chat(message: string) {
        return new Message(MessageType.CHAT as MessageTypeValue, { message });
    },
    click(x: number, y: number) {
        return new Message(MessageType.CLICK as MessageTypeValue, { x, y });
    },
    stateRequest() {
        return new Message(MessageType.STATE_REQUEST as MessageTypeValue, {});
    },
    stateResponse(
        players: unknown,
        clicks: unknown,
        chatHistory: unknown[],
        targetPlayerId: string | null = null
    ) {
        const data: Record<string, unknown> = { players, clicks, chatHistory };
        if (targetPlayerId) data.targetPlayerId = targetPlayerId;
        return new Message(MessageType.STATE_RESPONSE as MessageTypeValue, data);
    },
    ping() {
        return new Message(MessageType.PING as MessageTypeValue, {});
    },
    webrtcSignal(toPlayerId: string, signal: unknown) {
        return new Message(MessageType.WEBRTC_SIGNAL as MessageTypeValue, {
            toPlayerId,
            signal,
        });
    },
};
